#!/usr/bin/env node


import { Command } from "commander";
import { Octokit } from "@octokit/rest";
import { throttling } from "@octokit/plugin-throttling";

const program = new Command();

program
    .option("--org <org>", "GitHub organization name (required for team cleanup)")
    .option("--team <team>", "Team slug to clean (mutually exclusive with --all-teams)")
    .option("--all-teams", "Clean all teams in the organization")
    .option("--enterprise <enterprise>", "Enterprise slug — remove suspended SCIM-deprovisioned users")
    .option("--user <username>", "Only check/remove this username if suspended or deleted")
    .option("--token <token>", "GitHub Personal Access Token (optional if GITHUB_TOKEN is set)")
    .option("--dry-run", "Simulate cleanup without making changes", false)
    .parse(process.argv);

const options = program.opts();

if (!options.token && !process.env.GITHUB_TOKEN) {
    console.error("Error: No GitHub token provided. Use --token or set GITHUB_TOKEN.");
    process.exit(1);
}

const token = options.token || process.env.GITHUB_TOKEN;

const ThrottledOctokit = Octokit.plugin(throttling);
const octokit = new ThrottledOctokit({
    auth: token,
    throttle: {
        onRateLimit: (retryAfter, options, octokit, retryCount) => {
            console.warn(`Rate limit hit for ${options.method} ${options.url}. Retrying after ${retryAfter}s...`);
            return retryCount < 2;
        },
        onSecondaryRateLimit: (retryAfter, options, octokit, retryCount) => {
            console.warn(`Secondary rate limit hit for ${options.method} ${options.url}. Retrying after ${retryAfter}s...`);
            return retryCount < 2;
        },
    },
});

const org = options.org;
const dryRun = options.dryRun;
const targetUser = options.user?.trim();
let hasFailures = false;

if (options.team && options.allTeams) {
    console.error("Error: --team and --all-teams are mutually exclusive.");
    process.exit(1);
}

if (options.enterprise && (options.team || options.allTeams)) {
    console.error("Error: --enterprise cannot be combined with --team or --all-teams. Run them separately.");
    process.exit(1);
}

if ((options.team || options.allTeams) && !options.org) {
    console.error("Error: --org is required when using --team or --all-teams.");
    process.exit(1);
}

if (!options.enterprise && !options.team && !options.allTeams) {
    console.error("Error: Must specify --team, --all-teams, or --enterprise.");
    process.exit(1);
}

async function checkIfActive(username) {
    try {
        await octokit.orgs.checkMembershipForUser({ org, username });
        return true;
    } catch (err) {
        if (err.status === 404) return false;
        throw err;
    }
}

async function cleanTeam(team_slug, username) {
    console.log(`\n🧹 Cleaning team: ${team_slug}`);
    const members = await octokit.paginate(octokit.teams.listMembersInOrg, { org, team_slug });

    const membersToCheck = username
        ? members.filter((member) => member.login.toLowerCase() === username.toLowerCase())
        : members;

    if (username && membersToCheck.length === 0) {
        console.log(`User ${username} is not a member of this team.`);
        return;
    }

    const removed = [];
    for (const m of membersToCheck) {
        const active = await checkIfActive(m.login);
        if (!active) {
            if (dryRun) {
                console.log(`[DRY RUN] Would remove suspended/deleted user: ${m.login}`);
                removed.push(m.login);
            } else {
                console.log(`Removing suspended/deleted user: ${m.login}`);
                try {
                    await octokit.teams.removeMembershipForUserInOrg({
                        org,
                        team_slug,
                        username: m.login,
                    });
                    removed.push(m.login);
                } catch (err) {
                    console.error(`Failed to remove ${m.login}:`, err.message);
                    hasFailures = true;
                }
            }
        } else if (username) {
            console.log(`User ${m.login} is active. Skipping removal.`);
        }
    }

    if (removed.length === 0) {
        console.log("No suspended/deleted users found.");
    } else if (dryRun) {
        console.log(`[DRY RUN] ${removed.length} user(s) would be removed: ${removed.join(", ")}`);
    } else {
        console.log(`Removed ${removed.length} user(s): ${removed.join(", ")}`);
    }
}

async function cleanEnterprise(enterprise, targetUser) {
    console.log(`\n🔍 Fetching suspended SCIM users from enterprise: ${enterprise}`);

    const scimFilter = targetUser
        ? `userName eq "${targetUser}" and active eq false`
        : "active eq false";

    const allSuspended = [];
    let startIndex = 1;
    const count = 100;

    while (true) {
        const { data } = await octokit.request("GET /scim/v2/enterprises/{enterprise}/Users", {
            enterprise,
            filter: scimFilter,
            startIndex,
            count,
        });

        const users = data.Resources || [];
        allSuspended.push(...users);

        if (allSuspended.length >= data.totalResults || users.length === 0) {
            break;
        }
        startIndex += count;
    }

    if (allSuspended.length === 0) {
        console.log("No suspended SCIM users found at the enterprise level.");
        return;
    }

    console.log(`Found ${allSuspended.length} suspended SCIM user(s).`);

    const removed = [];
    for (const user of allSuspended) {
        const username = user.userName;
        if (dryRun) {
            console.log(`[DRY RUN] Would remove suspended enterprise user: ${username}`);
            removed.push(username);
        } else {
            console.log(`Removing suspended enterprise user: ${username}`);
            try {
                await octokit.request("DELETE /scim/v2/enterprises/{enterprise}/Users/{scim_user_id}", {
                    enterprise,
                    scim_user_id: user.id,
                });
                removed.push(username);
            } catch (err) {
                console.error(`Failed to remove ${username}:`, err.message);
                hasFailures = true;
            }
        }
    }

    if (removed.length === 0) {
        console.log("No users were removed.");
    } else if (dryRun) {
        console.log(`\n[DRY RUN] ${removed.length} suspended enterprise user(s) would be removed: ${removed.join(", ")}`);
    } else {
        console.log(`\nRemoved ${removed.length} suspended enterprise user(s): ${removed.join(", ")}`);
    }
}

async function main() {
    try {
        if (options.enterprise) {
            console.log(
                `Starting ${dryRun ? "dry run" : "cleanup"} for enterprise: ${options.enterprise}${targetUser ? ` for user: ${targetUser}` : ""}...`
            );
            await cleanEnterprise(options.enterprise, targetUser);
        } else if (options.allTeams) {
            const teams = await octokit.paginate(octokit.teams.list, { org });
            console.log(
                `Found ${teams.length} team(s). Starting ${dryRun ? "dry run" : "cleanup"}${targetUser ? ` for user: ${targetUser}` : ""}...`
            );
            for (const t of teams) {
                await cleanTeam(t.slug, targetUser);
            }
        } else if (options.team) {
            console.log(
                `Starting ${dryRun ? "dry run" : "cleanup"} for team: ${options.team}${targetUser ? ` and user: ${targetUser}` : ""}`
            );
            await cleanTeam(options.team, targetUser);
        }

        console.log(`\n ${dryRun ? "Dry run complete — no changes made!" : "Cleanup complete!"}`);

        if (hasFailures) {
            console.error("\nWarning: Some operations failed. Review the errors above.");
            process.exit(1);
        }
    } catch (err) {
        console.error("Unexpected error:", err.message);
        process.exit(1);
    }
}

main();
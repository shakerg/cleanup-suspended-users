#!/usr/bin/env node

/*
 * cleanup-suspended-users.js
 *
 * Removes suspended or deleted users from GitHub Teams (non-SCIM managed).
 *   node cleanup-suspended-users.js --org my-org --team my-team
 *   node cleanup-suspended-users.js --org my-org --all-teams
 *   node cleanup-suspended-users.js --org my-org --all-teams --token ghp_xxx
 */

import { Command } from "commander";
import { Octokit } from "@octokit/rest";

const program = new Command();

program
    .requiredOption("--org <org>", "GitHub organization name")
    .option("--team <team>", "Team slug to clean (mutually exclusive with --all-teams)")
    .option("--all-teams", "Clean all teams in the organization")
    .option("--token <token>", "GitHub Personal Access Token (optional if GITHUB_TOKEN is set)")
    .option("--dry-run", "Simulate cleanup without making changes", false)
    .parse(process.argv);

const options = program.opts();

if (!options.token && !process.env.GITHUB_TOKEN) {
    console.error("Error: No GitHub token provided. Use --token or set GITHUB_TOKEN.");
    process.exit(1);
}

const token = options.token || process.env.GITHUB_TOKEN;
const octokit = new Octokit({ auth: token });

const org = options.org;
const dryRun = options.dryRun;

async function checkIfActive(username) {
    try {
        await octokit.orgs.checkMembershipForUser({ org, username });
        return true;
    } catch (err) {
        if (err.status === 404) return false;
        throw err;
    }
}

async function cleanTeam(team_slug) {
    console.log(`\n🧹 Cleaning team: ${team_slug}`);
    const { data: members } = await octokit.teams.listMembersInOrg({ org, team_slug });

    let removed = [];
    for (const m of members) {
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
                }
            }
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

async function main() {
    try {
        if (options.allTeams) {
            const { data: teams } = await octokit.teams.list({ org });
            console.log(`Found ${teams.length} team(s). Starting ${dryRun ? "dry run" : "cleanup"}...`);
            for (const t of teams) {
                await cleanTeam(t.slug);
            }
        } else if (options.team) {
            console.log(`Starting ${dryRun ? "dry run" : "cleanup"} for team: ${options.team}`);
            await cleanTeam(options.team);
        } else {
            console.error("Error: Must specify either --team or --all-teams");
            process.exit(1);
        }

        console.log(`\n ${dryRun ? "Dry run complete — no changes made!" : "Cleanup complete!"}`);
    } catch (err) {
        console.error("Unexpected error:", err);
        process.exit(1);
    }
}

main();
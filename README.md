# GitHub Team & Enterprise Cleanup CLI

A portable Node.js CLI tool to **remove suspended or deleted users** from **GitHub Teams** and **enterprises**.

Works with both standard GitHub organizations and **Enterprise Managed User (EMU)** orgs where users are deprovisioned via SCIM but remain as suspended team members.

Also supports **enterprise-level cleanup** — removing SCIM-deprovisioned users that were removed from orgs by the IdP but are still lingering at the enterprise level in a suspended state.

Suspended accounts on GitHub are renamed to hashed usernames (e.g., `suspended-abc123def`), which makes it difficult to identify and remove them manually.  
This script automatically detects and removes such users across one or all teams in your organization.

---

## Features

- **Team cleanup** — detects and removes suspended or deleted users from one or all teams in an org.
- **Enterprise cleanup** — finds suspended SCIM-deprovisioned users at the enterprise level and removes them via the SCIM API.
- Works with **EMU orgs** — cleans up SCIM-deprovisioned users that remain in teams or linger at the enterprise level.
- Target a **single user** across one or all teams with `--user`.
- Uses your GitHub **Personal Access Token (PAT)** via `--token` or the `GITHUB_TOKEN` environment variable.
- Handles pagination automatically — works with orgs that have many teams or large team memberships.
- Portable, simple Node.js CLI — no build process required.
- Produces a readable cleanup log.
- Supports a safe `--dry-run` mode to simulate cleanup without changes.

---

## Requirements

- Node.js **v18+**
- A GitHub **Personal Access Token (PAT)** with the following scopes:

  **For team cleanup** (`--org` + `--team` / `--all-teams`):
  - `read:org`
  - `admin:org` (for removing members from teams)

  **For enterprise cleanup** (`--enterprise`):
  - `admin:enterprise` (for SCIM API access)

Install dependencies:

```bash
npm install
```

---

## Usage

### Team cleanup

Remove suspended/deleted users from teams:

```bash
node cleanup-suspended-users.js --org my-org --team devops --token ghp_ABC123
```

or use an environment variable:

```bash
export GITHUB_TOKEN=ghp_ABC123
node cleanup-suspended-users.js --org my-org --all-teams
```

### Enterprise cleanup

Remove suspended SCIM-deprovisioned users lingering at the enterprise level:

```bash
export GITHUB_TOKEN=ghp_ABC123
node cleanup-suspended-users.js --enterprise my-enterprise --dry-run
```

---

## CLI Options

| Flag | Description | Required |
|------|--------------|----------|
| `--org <org>` | GitHub organization name (required for team cleanup) | For team cleanup |
| `--team <team>` | Team slug to clean (mutually exclusive with `--all-teams` and `--enterprise`) | |
| `--all-teams` | Clean all teams in the organization (mutually exclusive with `--team` and `--enterprise`) | |
| `--enterprise <slug>` | Enterprise slug — remove suspended SCIM-deprovisioned users (mutually exclusive with `--team` / `--all-teams`) | For enterprise cleanup |
| `--user <username>` | Only check/remove this username if suspended or deleted | |
| `--token <token>` | GitHub PAT (optional if `GITHUB_TOKEN` env var is set) | |
| `--dry-run` | Simulate cleanup without making any changes | |

---

### Dry Run Example (Teams)

```bash
export GITHUB_TOKEN=ghp_ABC123
node cleanup-suspended-users.js --org my-org --all-teams --dry-run
```

### Target a Single User (Teams)

```bash
export GITHUB_TOKEN=ghp_ABC123
node cleanup-suspended-users.js --org my-org --team developers --user suspended-abc123def --dry-run
```

Output:

```
Starting dry run for team: developers and user: suspended-abc123def

🧹 Cleaning team: developers
[DRY RUN] Would remove suspended/deleted user: suspended-abc123def
[DRY RUN] 1 user(s) would be removed: suspended-abc123def

 Dry run complete — no changes made!
```

### Enterprise Cleanup (Dry Run)

```bash
export GITHUB_TOKEN=ghp_ABC123
node cleanup-suspended-users.js --enterprise my-enterprise --dry-run
```

Output:

```
Starting dry run for enterprise: my-enterprise...

🔍 Fetching suspended SCIM users from enterprise: my-enterprise
Found 3 suspended SCIM user(s).
[DRY RUN] Would remove suspended enterprise user: suspended-abc123def
[DRY RUN] Would remove suspended enterprise user: suspended-456ghi789
[DRY RUN] Would remove suspended enterprise user: suspended-xyz000abc

[DRY RUN] 3 suspended enterprise user(s) would be removed: suspended-abc123def, suspended-456ghi789, suspended-xyz000abc

 Dry run complete — no changes made!
```

---

## Example Output (Live Run)

### Team cleanup

```
Found 5 team(s). Starting cleanup...

🧹 Cleaning team: developers
Removing suspended/deleted user: suspended-abc123def
Removed 1 user(s): suspended-abc123def

🧹 Cleaning team: qa
No suspended/deleted users found.

 Cleanup complete!
```

### Enterprise cleanup

```
Starting cleanup for enterprise: my-enterprise...

🔍 Fetching suspended SCIM users from enterprise: my-enterprise
Found 2 suspended SCIM user(s).
Removing suspended enterprise user: suspended-abc123def
Removing suspended enterprise user: suspended-456ghi789

Removed 2 suspended enterprise user(s): suspended-abc123def, suspended-456ghi789

 Cleanup complete!
```

---

## Notes

- The script will **only remove** users that are suspended or deleted — active users remain untouched.
- It’s **safe to rerun** anytime.
- Works with **Enterprise Managed User (EMU)** orgs — SCIM-deprovisioned users that remain suspended in teams will be detected and removed.
- When users are deprovisioned via SCIM in an EMU org, the IdP removes their provisioning but may not clean up team memberships or the enterprise-level user identity. This script handles both gaps.
- **Enterprise cleanup** uses the SCIM API (`/scim/v2/enterprises/{enterprise}/Users`) to find and remove suspended users. This covers users deprovisioned via SCIM whose identity was set to `active: false` but not fully deleted by the IdP.
- **Team cleanup** and **enterprise cleanup** are separate modes. Run them independently — team cleanup first to remove stale team memberships, then enterprise cleanup to remove lingering suspended identities.

---

## Future Enhancements

- `--output` flag to export JSON/CSV reports
- GitHub App authentication mode
- Parallelized cleanup for large orgs



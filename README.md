# GitHub Team Cleanup CLI

A portable Node.js CLI tool to **remove suspended or deleted users** from **GitHub Teams** (non-SCIM managed).

Suspended accounts on GitHub are renamed to hashed usernames (e.g., `suspended-abc123def`), which makes it difficult to identify and remove them manually.  
This script automatically detects and removes such users across one or all teams in your organization.

---

## Features

- Detects and removes **suspended or deleted** users.
- Supports cleaning **a single team** or **all teams** in an org.
- Uses your GitHub **Personal Access Token (PAT)** via `--token` or the `GITHUB_TOKEN` environment variable.
- Portable, simple Node.js CLI — no build process required.
- Produces a readable cleanup log.
- Supports a safe `--dry-run` mode to simulate cleanup without changes.

---

## Requirements

- Node.js **v18+**
- A GitHub **Personal Access Token (PAT)** with the following scopes:
  - `read:org`
  - `admin:org` (for removing members from teams)

Install dependencies:

```bash
npm install @octokit/rest commander
```

---

## Usage

### Run directly with Node

```bash
node cleanup-suspended-users.js --org my-org --team devops --token ghp_ABC123
```

or use an environment variable:

```bash
export GITHUB_TOKEN=ghp_ABC123
node cleanup-suspended-users.js --org my-org --all-teams
```

---

## CLI Options

| Flag | Description | Required |
|------|--------------|-----------|
| `--org <org>` | GitHub organization name | Yes |
| `--team <team>` | Team slug to clean (mutually exclusive with `--all-teams`) |  |
| `--all-teams` | Clean all teams in the organization |  |
| `--token <token>` | GitHub PAT (optional if `GITHUB_TOKEN` env var is set) |  |
| `--dry-run` | Simulate cleanup without making any changes |  |

---

### Dry Run Example

```bash
export GITHUB_TOKEN=ghp_ABC123
node cleanup-suspended-users.js --org my-org --all-teams --dry-run
```

Output:

```
Found 5 team(s). Starting dry run...

Cleaning team: developers
   [DRY RUN] Would remove suspended/deleted user: suspended-abc123def
   [DRY RUN] 1 user(s) would be removed: suspended-abc123def

Dry run complete — no changes made!
```

---

## Example Output (Live Run)

```
Found 5 team(s). Starting cleanup...

Cleaning team: developers
   Removing suspended/deleted user: suspended-abc123def
   Removed 1 user(s): suspended-abc123def

Cleaning team: qa
   No suspended/deleted users found.

Cleanup complete!
```

---

## Script Source

### `cleanup-suspended-users.js`

---

## Notes

- The script will **only remove** users that are suspended or deleted — active users remain untouched.
- It’s **safe to rerun** anytime.
- If you’re using Enterprise-managed users (via SCIM), cleanups should be handled at your IdP level.

---

## Future Enhancements

- `--output` flag to export JSON/CSV reports
- GitHub App authentication mode
- Parallelized cleanup for large orgs



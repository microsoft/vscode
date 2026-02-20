---
name: azure-pipelines
description: Use when validating Azure DevOps pipeline changes for the VS Code build. Covers queueing builds, checking build status, viewing logs, and iterating on pipeline YAML changes without waiting for full CI runs.
---

# Validating Azure Pipeline Changes

When modifying Azure DevOps pipeline files (YAML files in `build/azure-pipelines/`), you can validate changes locally using the Azure CLI before committing. This avoids the slow feedback loop of pushing changes, waiting for CI, and checking results.

## Prerequisites

1. **Check if Azure CLI is installed**:
   ```bash
   az --version
   ```

   If not installed, install it:
   ```bash
   # macOS
   brew install azure-cli

   # Windows (PowerShell as Administrator)
   winget install Microsoft.AzureCLI

   # Linux (Debian/Ubuntu)
   curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash
   ```

2. **Check if the DevOps extension is installed**:
   ```bash
   az extension show --name azure-devops
   ```

   If not installed, add it:
   ```bash
   az extension add --name azure-devops
   ```

3. **Authenticate**:
   ```bash
   az login
   az devops configure --defaults organization=https://dev.azure.com/monacotools project=Monaco
   ```

## VS Code Main Build

The main VS Code build pipeline:
- **Organization**: `monacotools`
- **Project**: `Monaco`
- **Definition ID**: `111`
- **URL**: https://dev.azure.com/monacotools/Monaco/_build?definitionId=111

## VS Code Insider Scheduled Builds

Two Insider builds run automatically on a scheduled basis:
- **Morning build**: ~7:00 AM CET
- **Evening build**: ~7:00 PM CET

These scheduled builds use the same pipeline definition (`111`) but run on the `main` branch to produce Insider releases.

---

## Queueing a Build

Use the [queue command](./azure-pipeline.ts) to queue a validation build:

```bash
# Queue a build on the current branch
node --experimental-strip-types .github/skills/azure-pipelines/azure-pipeline.ts queue

# Queue with a specific source branch
node --experimental-strip-types .github/skills/azure-pipelines/azure-pipeline.ts queue --branch my-feature-branch

# Queue with custom variables (e.g., to skip certain stages)
node --experimental-strip-types .github/skills/azure-pipelines/azure-pipeline.ts queue --variables "SKIP_TESTS=true"
```

> **Important**: Before queueing a new build, cancel any previous builds on the same branch that you no longer need. This frees up build agents and reduces resource waste:
> ```bash
> # Find the build ID from status, then cancel it
> node --experimental-strip-types .github/skills/azure-pipelines/azure-pipeline.ts status
> node --experimental-strip-types .github/skills/azure-pipelines/azure-pipeline.ts cancel --build-id <id>
> node --experimental-strip-types .github/skills/azure-pipelines/azure-pipeline.ts queue
> ```

### Script Options

| Option | Description |
|--------|-------------|
| `--branch <name>` | Source branch to build (default: current git branch) |
| `--definition <id>` | Pipeline definition ID (default: 111) |
| `--variables <vars>` | Pipeline variables in `KEY=value` format, space-separated |
| `--dry-run` | Print the command without executing |

---

## Checking Build Status

Use the [status command](./azure-pipeline.ts) to monitor a running build:

```bash
# Get status of the most recent build on your branch
node --experimental-strip-types .github/skills/azure-pipelines/azure-pipeline.ts status

# Get overview of a specific build by ID
node --experimental-strip-types .github/skills/azure-pipelines/azure-pipeline.ts status --build-id 123456

# Watch build status (refreshes every 30 seconds)
node --experimental-strip-types .github/skills/azure-pipelines/azure-pipeline.ts status --watch

# Watch with custom interval (60 seconds)
node --experimental-strip-types .github/skills/azure-pipelines/azure-pipeline.ts status --watch 60
```

### Script Options

| Option | Description |
|--------|-------------|
| `--build-id <id>` | Specific build ID (default: most recent on current branch) |
| `--branch <name>` | Filter builds by branch name (shows last 20 builds for branch) |
| `--reason <reason>` | Filter builds by reason: `manual`, `individualCI`, `batchedCI`, `schedule`, `pullRequest` |
| `--definition <id>` | Pipeline definition ID (default: 111) |
| `--watch [seconds]` | Continuously poll status until build completes (default: 30s) |
| `--download-log <id>` | Download a specific log to /tmp |
| `--download-artifact <name>` | Download artifact to /tmp |
| `--json` | Output raw JSON for programmatic consumption |

---

## Cancelling a Build

Use the [cancel command](./azure-pipeline.ts) to stop a running build:

```bash
# Cancel a build by ID (use status command to find IDs)
node --experimental-strip-types .github/skills/azure-pipelines/azure-pipeline.ts cancel --build-id 123456

# Dry run (show what would be cancelled)
node --experimental-strip-types .github/skills/azure-pipelines/azure-pipeline.ts cancel --build-id 123456 --dry-run
```

### Script Options

| Option | Description |
|--------|-------------|
| `--build-id <id>` | Build ID to cancel (required) |
| `--definition <id>` | Pipeline definition ID (default: 111) |
| `--dry-run` | Print what would be cancelled without executing |

---

## Common Workflows

### 1. Quick Pipeline Validation

```bash
# Make your YAML changes, then:
git add -A && git commit -m "test: pipeline changes"
git push origin HEAD

# Check for any previous builds on this branch and cancel if needed
node --experimental-strip-types .github/skills/azure-pipelines/azure-pipeline.ts status
node --experimental-strip-types .github/skills/azure-pipelines/azure-pipeline.ts cancel --build-id <id>  # if there's an active build

# Queue and watch the new build
node --experimental-strip-types .github/skills/azure-pipelines/azure-pipeline.ts queue
node --experimental-strip-types .github/skills/azure-pipelines/azure-pipeline.ts status --watch
```

### 2. Investigate a Build

```bash
# Get overview of a build (shows stages, artifacts, and log IDs)
node --experimental-strip-types .github/skills/azure-pipelines/azure-pipeline.ts status --build-id 123456

# Download a specific log for deeper inspection
node --experimental-strip-types .github/skills/azure-pipelines/azure-pipeline.ts status --build-id 123456 --download-log 5

# Download an artifact
node --experimental-strip-types .github/skills/azure-pipelines/azure-pipeline.ts status --build-id 123456 --download-artifact unsigned_vscode_cli_win32_x64_cli
```

### 3. Test with Modified Variables

```bash
# Skip expensive stages during validation
node --experimental-strip-types .github/skills/azure-pipelines/azure-pipeline.ts queue --variables "VSCODE_BUILD_SKIP_INTEGRATION_TESTS=true"
```

### 4. Cancel a Running Build

```bash
# First, find the build ID
node --experimental-strip-types .github/skills/azure-pipelines/azure-pipeline.ts status

# Cancel a specific build by ID
node --experimental-strip-types .github/skills/azure-pipelines/azure-pipeline.ts cancel --build-id 123456

# Dry run to see what would be cancelled
node --experimental-strip-types .github/skills/azure-pipelines/azure-pipeline.ts cancel --build-id 123456 --dry-run
```

### 5. Iterate on Pipeline Changes

When iterating on pipeline YAML changes, always cancel obsolete builds before queueing new ones:

```bash
# Push new changes
git add -A && git commit --amend --no-edit
git push --force-with-lease origin HEAD

# Find the outdated build ID and cancel it
node --experimental-strip-types .github/skills/azure-pipelines/azure-pipeline.ts status
node --experimental-strip-types .github/skills/azure-pipelines/azure-pipeline.ts cancel --build-id <id>

# Queue a fresh build and monitor
node --experimental-strip-types .github/skills/azure-pipelines/azure-pipeline.ts queue
node --experimental-strip-types .github/skills/azure-pipelines/azure-pipeline.ts status --watch
```

---

## Troubleshooting

### Authentication Issues
```bash
# Re-authenticate
az logout
az login

# Check current account
az account show
```

### Extension Not Found
```bash
az extension add --name azure-devops --upgrade
```

### Rate Limiting
If you hit rate limits, add delays between API calls or use `--watch` with a longer interval.

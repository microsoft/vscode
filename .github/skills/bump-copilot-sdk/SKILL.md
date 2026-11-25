---
name: bump-copilot-sdk
description: Upgrade the bundled `@microsoft/copilot-sdk` and the Copilot runtime it ships. Use when asked to bump, update, or upgrade the Copilot SDK or Copilot runtime version. Covers the upstream release check, pins and lockfiles, adapting to SDK changes, refreshing Agent Host test baselines, and validating with PR CI and the SDK Validation pipeline.
---

# Bump the Copilot SDK

VS Code bundles `@microsoft/copilot-sdk`, which ships a Copilot runtime (its version is the SDK's `copilotCliVersion`). The Agent Host runs that runtime out of process. A bump is done when a draft PR exists and both its GitHub CI and an SDK Validation build (Azure pipeline definition `720`) have passed on its final commit.

You need `gh` access to `github/copilot-agent-runtime` (private) for the release check, and Azure DevOps access for pipeline 720 (see the `azure-pipelines` skill).

Invoking this skill authorizes pushing a branch to `microsoft/vscode`, opening or updating a **draft** PR, and queueing pipeline 720. Don't mark the PR ready for review or merge it unless asked.

## 1. Choose the version and check the release

```bash
npm view @microsoft/copilot-sdk dist-tags
npm view @microsoft/copilot-sdk@<version> copilotCliVersion
```

Use the version the user asked for. For "latest", compare the stable and prerelease tags with the current pin in the root `package.json`, and don't downgrade.

Then confirm that upstream finished publishing. Find the `publish.yml` run in `github/copilot-agent-runtime` that released this SDK version and check that it succeeded, including both Node SDK publish jobs: public npm and the internal feed. VS Code's CI installs from the internal feed, so a package that's only on public npm still breaks CI. One commit can produce several releases, so match the run by the version in its title or inputs, not just by commit.

```bash
gh run list --repo github/copilot-agent-runtime --workflow publish.yml --limit 10
gh run view <run-id> --repo github/copilot-agent-runtime --json conclusion,jobs \
  --jq '.conclusion, (.jobs[] | select(.name | test("nodejs")) | "\(.name): \(.conclusion)")'
```

If the run failed or is still running, stop and tell the user. Don't switch to a different version on your own.

## 2. Update pins and lockfiles

| File | Change |
|---|---|
| `package.json` | `@microsoft/copilot-sdk` version and `copilotRuntimeVersion` |
| `remote/package.json` | The same. The remote server ships its own copy from `remote/node_modules`. |
| `pnpm-lock.yaml`, `remote/pnpm-lock.yaml` | Regenerated |

Pin exact versions (no `^`). `copilotRuntimeVersion` must equal the SDK's `copilotCliVersion`; loading the build scripts fails if they differ.

```bash
pnpm update --workspace-root @microsoft/copilot-sdk@<version> --lockfile-only --ignore-scripts
pnpm -C remote update @microsoft/copilot-sdk@<version> --lockfile-only --ignore-scripts
# Edit copilotRuntimeVersion in both package.json files, then:
node -e "const fs=require('fs');for(const f of ['pnpm-lock.yaml','remote/pnpm-lock.yaml']){fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/, tarball: [^}]+}/g,'}'))}"
pnpm install --frozen-lockfile
pnpm run gulp --tasks-simple
```

The `node -e` line removes `tarball:` URLs. When your npm registry is a mirror whose download URLs don't follow the standard registry layout, pnpm records each package's mirror URL in the lockfile. CI installs from a different registry and rejects those URLs. The lockfiles on `main` have no `tarball:` entries. `pnpm run gulp --tasks-simple` loads the build scripts, which checks `copilotRuntimeVersion`.

Before continuing, check the lockfile diff. It should change only `@microsoft/copilot-sdk` and its eight `@microsoft/copilot-sdk-<platform>` packages, and contain no `tarball:`. If other packages changed, find out why.

If the registry returns 401 or doesn't have the version yet, follow "Package feed authentication" in `.github/copilot-instructions.md`. The SDK packages are exempt from the repository's minimum release age (`minimumReleaseAgeExclude` in both `pnpm-workspace.yaml` files), so a version published today is fine.

## 3. Compile and adapt

```bash
pnpm run typecheck-client
pnpm run build-fast --client-only
```

For new compile errors, read what changed in the SDK's types under `node_modules/@microsoft/copilot-sdk` and adapt the callers and test doubles with the smallest typed change. Don't add `any` or casts to silence errors, and don't change unrelated behavior. Every SDK client VS Code creates must keep using `RuntimeConnection.forSpawnedStdio` so the runtime stays out of process.

To see what changed upstream, list the runtime commits between the old and new runtime tags (the compare API returns at most 250 commits):

```bash
gh api repos/github/copilot-agent-runtime/compare/cli-<old-runtime>...cli-<new-runtime> \
  --jq '.commits[].commit.message | split("\n")[0]'
```

Use this to explain test failures and to note upstream changes that matter to VS Code, such as permissions, prompts, session lifecycle, MCP, or telemetry.

## 4. Run the Agent Host tests

The `agent-host-e2e-tests` skill and `src/vs/platform/agentHost/test/node/e2e/README.md` own the test mechanics; read them before regenerating anything.

```bash
pnpm run test-agent-host-e2e
./scripts/test-integration.sh --runGlob '**/agentHost/test/node/{*,providerIntegration/*,e2e/providers/copilotPromptsE2E}.integrationTest.js'
```

The first command is the complete deterministic E2E runner. The second runs the direct SDK contract tests, the synthetic-provider suites, and the Copilot prompt snapshots, none of which the runner includes. Check that each command ends with test totals; one that exits without them didn't finish. GitHub PR CI runs these and the other node integration tests on Windows, macOS, and Linux, so local runs are for fast feedback. Open the draft PR (step 5) once types compile and the SDK contract tests pass, and keep working while CI runs.

| Failure | What to do |
|---|---|
| SDK type or API change | Adapt the code or test doubles (step 3). |
| Snapshot drift from a runtime change to prompts, tools, or schemas | Regenerate with the owning test's tokenless update mode (`AGENT_HOST_UPDATE_AHP_SNAPSHOTS=1`), review the diff, then rerun without it. |
| Recorded model traffic no longer replays | Re-record only the affected tests, as described in `agent-host-e2e-tests`. Check that the recorded behavior is still correct. |
| Behavior regression | Reproduce it, compare with the previous SDK, and report it to the user with the evidence. |
| Timeout or infrastructure error | Rerun once. If it fails again, treat it as real. |

Snapshots and fixtures are generated; never hand-edit them. Don't loosen assertions, broaden normalization, or add skips to get a passing run.

## 5. Draft PR and CI

1. Commit, push a branch to `microsoft/vscode`, and open a draft PR using the repository's PR template.
2. Queue pipeline 720 and watch it with a background shell, rather than polling with `sleep`:
   ```bash
   node .github/skills/azure-pipelines/azure-pipeline.ts queue --definition 720 --branch <branch>
   node .github/skills/azure-pipelines/azure-pipeline.ts status --definition 720 --build-id <id> --watch 120
   ```
3. Watch the GitHub workflow runs with `gh run watch <run-id> --exit-status`, also in the background.

Pipeline 720 builds VS Code for every desktop platform and architecture, runs the Agent Host E2E tests on Windows x64, Linux x64, and macOS arm64, and checks the Linux x64 and arm64 deb and rpm package dependencies. It doesn't sign or publish anything, and it doesn't build Alpine or web.

One passing 720 build on the final commit is enough. After pushing a fix, queue a new build and cancel the obsolete one. When a job fails, read its log: retry infrastructure failures once, and fix real failures.

If a **Package Dependencies** job fails, the SDK's native binaries require a shared library or library version that isn't in `build/linux/{debian,rpm}/dep-lists.ts`. Find which binary added it and whether the supported Linux distributions provide it, and ask the user before updating the lists.

## 6. PR description and final report

The PR is public: don't include internal links, such as Azure DevOps builds or private repositories, or internal data. The description covers:

- Old and new SDK and runtime versions.
- Every changed file, grouping generated files with a count: what changed and why. For regenerated snapshots, say what changed in them (prompt wording, tool list, schemas), not just "updated baselines".
- Upstream changes that matter to VS Code.
- Anything unresolved that needs a reviewer's decision.

The final response to the user gives the PR link and its draft state, the versions, the GitHub CI and pipeline 720 results, each change and why it was needed, and any open risks. If something outside your control blocks completion, such as an unfinished upstream release, missing access, or an upstream regression, report the task as incomplete and name the blocker.

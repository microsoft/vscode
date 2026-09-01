---
name: update-codex-sdk
description: Update VS Code's bundled @openai/codex dependency to a version available from the private VS Code npm feed, regenerate its protocol client, run the relevant tests, and verify the Codex Agent Host in a launched Code OSS window. Use for bundled Codex SDK/CLI version bumps in the VS Code repository.
---

# Update the bundled Codex SDK

The public npm `latest` version is not necessarily installable in VS Code CI. The Azure pipeline uses the private `vscode` feed, where CFS normally quarantines new third-party package versions for seven days. Select a version from that feed before changing files.

## Select a CI-available version

Run the helper from the repository root:

```bash
node --experimental-strip-types .agents/skills/update-codex-sdk/scripts/latest-private-version.ts
```

It obtains an Azure DevOps access token from the signed-in Azure CLI, queries the same feed used by `build/azure-pipelines/dependencies-check.yml`, and reports the newest stable release for which the root package and every platform binary alias declared by that release are present. It never prints the token. If Azure CLI authentication is missing or expired, ask the user to authenticate rather than falling back to the public registry.

To check a user-requested version explicitly:

```bash
node --experimental-strip-types .agents/skills/update-codex-sdk/scripts/latest-private-version.ts --version 0.149.1
```

Use `--raw` when only the latest complete version string is needed. Do not change the repository or global npm registry merely to probe availability.

## Update every pin

Set `CODEX_VERSION` to the selected exact version. Keep committed lockfile URLs on `https://registry.npmjs.org/`; the private feed determines CI eligibility but is not written into source lockfiles.

```bash
CODEX_VERSION=0.149.1
npm install --save-dev --save-exact --ignore-scripts --registry=https://registry.npmjs.org "@openai/codex@$CODEX_VERSION"
npm --prefix build/agent-sdk/agents/codex install --save-exact --package-lock-only --ignore-scripts --registry=https://registry.npmjs.org "@openai/codex@$CODEX_VERSION"
```

Use `apply_patch` to set `build/codex/codex-version.txt` to the same version, then regenerate the vendored app-server client:

```bash
npm run codex:gen-protocol
```

The expected version-bearing files are:

- `package.json` and `package-lock.json`
- `build/agent-sdk/agents/codex/package.json` and `package-lock.json`
- `build/codex/codex-version.txt`
- `src/vs/platform/agentHost/node/codex/protocol/generated/**`

Never hand-edit generated protocol files. Review their diff, then make the smallest necessary handwritten Agent Host or test changes for protocol additions or type changes. Confirm both package manifests use exact versions and that no private-feed URL entered either lockfile.

## Validate

Run the established checks from the repository root:

```bash
npm run codex:check-protocol
npm run compile
./scripts/test.sh --grep codex
(cd build && npm run test)
npm run test-agent-host-e2e -- --jobs 2
npm run hygiene
```

The Agent Host E2E run exercises the bundled provider SDKs in replay mode. If a Codex SDK change causes replay misses or stale fixtures, read `.github/skills/agent-host-e2e-tests/SKILL.md` before deciding whether to re-record; never weaken or silently skip a failing test.

## Verify a real Codex Agent Host session

After the build and tests pass, read and use `.agents/skills/launch/SKILL.md` to launch an isolated **Agents window** for this checkout. Take a fresh Playwright snapshot, explicitly start a Codex-backed session, and give it a deterministic tool-use task such as:

```text
Run node -p "require('@openai/codex/package.json').version" in this workspace. If it prints <VERSION>, reply exactly CODEX_SDK_<VERSION_WITH_UNDERSCORES>_OK.
```

Success requires all of the following, not merely a window that opened:

- the selected provider is Codex;
- the session invokes the command through the Agent Host and completes;
- the reported version matches every pin;
- the exact sentinel appears in the completed response;
- the Agent Host log shows no startup crash or protocol error.

Save the observed sentinel and test totals for the final report or pull-request description. Follow the launch skill's cleanup steps when finished.

## Deliver

Inspect the complete diff for unrelated changes, secrets, private registry URLs, and generated-file drift. Preserve unrelated user work. Commit, push, or create/update a pull request only when the user has authorized those actions; include the private-feed-selected version and validation evidence in the description.

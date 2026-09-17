# VS Code Smoke Test

Make sure you are on **Node v12.x**.

## Quick Overview

```bash
# Build extensions in the VS Code repo (if needed)
npm i && npm run compile

# Dev (Electron)
npm run smoketest

# Dev (Web - Must be run on distro)
npm run smoketest -- --web --browser [chromium|webkit]

# Build (Electron)
npm run smoketest -- --build <path to latest version>
example: npm run smoketest -- --build /Applications/Visual\ Studio\ Code\ -\ Insiders.app

# Build (Web - read instructions below)
npm run smoketest -- --build <path to server web build (ends in -web)> --web --browser [chromium|webkit]

# Remote (Electron)
npm run smoketest -- --build <path to latest version> --remote
```

\* This step is necessary only when running without `--build` and OSS doesn't already exist in the `.build/electron` directory.

### Running for a release (Endgame)

You must always run the smoketest version that matches the release you are testing. So, if you want to run the smoketest for a release build (e.g. `release/1.22`), you need to check out that version of the smoke tests too:

```bash
git fetch
git checkout release/1.22
npm i && npm run compile
cd test/smoke
npm i
```

#### Web

There is no support for testing an old version to a new one yet.
Instead, simply configure the `--build` command line argument to point to the absolute path of the extracted server web build folder (e.g. `<rest of path here>/vscode-server-darwin-x64-web` for macOS). The server web build is available from the builds page (see previous subsection).

**macOS**: if you have downloaded the server with web bits, make sure to run the following command before unzipping it to avoid security issues on startup:

```bash
xattr -d com.apple.quarantine <path to server with web folder zip>
```

**Note**: make sure to point to the server that includes the client bits!

### Debug

- `--verbose` logs all the low level driver calls made to Code;
- `-f PATTERN` (alias `-g PATTERN`) filters the tests to be run. You can also use pretty much any mocha argument;
- `--headless` will run playwright in headless mode when `--web` is used.

**Note**: you can enable verbose logging of playwright library by setting a `DEBUG` environment variable before running the tests (<https://playwright.dev/docs/debug#verbose-api-logs>), for example to `pw:browser`.

### Develop

```bash
cd test/smoke
npm run watch
```

## Troubleshooting

### Dev Container sessions over SSH, Tunnels, and WSL

The Agents Window Dev Container suites require a reachable Linux Docker daemon. The SSH suite runs by default on Linux, and locally on macOS when Docker is available. SSH/Tunnel suites are limited to Linux in CI. The SSH fixture uses a loopback SSH server with an ephemeral port, password, and host key; it does not require system `sshd` or change your SSH configuration.

Each selected Dev Container suite checks Docker in its first setup hook, before starting fixture resources, with a fresh `docker info` probe and a 60-second timeout. The probe runs asynchronously and logs its elapsed time and failure reason. Filtered-out suites do not probe Docker. Missing Docker fails the suite on Linux and for an explicitly requested Tunnel test; optional local runs on other platforms are skipped.

Run the local and SSH Dev Container cases:

```bash
npm run smoketest -- --tracing -g 'Agents Window \((SSH )?Dev Container AgentHost\)'
```

The Tunnel suite uses a real private, agent-host-only Dev Tunnel. It is opt-in because ordinary PR smoke jobs do not have account credentials. Supply a GitHub user token authorized to create, connect to, and delete Dev Tunnels, plus a compatible tunnel CLI if it cannot be discovered:

```bash
export VSCODE_SMOKE_TEST_TUNNEL_TOKEN="$(gh auth token)"
export VSCODE_SMOKE_TEST_TUNNEL_CLI="/path/to/code-tunnel-insiders"
npm run smoketest -- --tracing -g 'Agents Window \(Tunnel Dev Container AgentHost\)'
unset VSCODE_SMOKE_TEST_TUNNEL_TOKEN
```

Do not use the repository-scoped GitHub Actions token as a substitute for a user token. A requested Tunnel test fails on invalid credentials or missing prerequisites rather than silently skipping. The CLI must already have accepted server-license consent, or the operator must explicitly set `VSCODE_SMOKE_TEST_TUNNEL_ACCEPT_SERVER_LICENSE_TERMS=1` to indicate agreement.

The WSL suite runs on Windows with an explicitly selected WSL 2 distribution. Docker must work inside that distribution, for example through Docker Desktop WSL integration. Supply the Linux path to an extracted VS Code remote server with Dev Container capability support; the fixture uses its Linux Node runtime and native dependencies, independently of the Windows app under test:

```powershell
$env:VSCODE_SMOKE_TEST_WSL_DISTRO = 'Ubuntu'
$env:VSCODE_SMOKE_TEST_WSL_SERVER_PATH = '/path/to/linux/server'
npm run smoketest -- --tracing -g 'Agents Window \(WSL Dev Container AgentHost\)'
Remove-Item Env:VSCODE_SMOKE_TEST_WSL_DISTRO, Env:VSCODE_SMOKE_TEST_WSL_SERVER_PATH
```

An explicitly selected WSL suite fails on missing prerequisites rather than skipping. CI sets `VSCODE_SMOKE_TEST_WSL_REQUIRED=1` so missing provisioning variables also fail instead of disabling the suite. Ordinary local runs remain opt-in. The fixture copies the test workspace into a private directory inside the distribution, starts an isolated source Agent Host through the real WSL connection flow, and removes only its own processes, containers, and temporary files. It does not install software in the distribution, change Docker integration, or stop the distribution. The Windows mock server must be reachable from WSL and Docker.

The source Agent Host uses a fixture-owned loopback TCP proxy to reach the Windows mock server. This keeps its CAPI override inside the production allowlist even in WSL NAT mode, without changing the distribution's DNS or hosts file. The suite verifies that the source host accepted that override; the proxy and its connections are closed with the fixture.

The GitHub and Azure Pipelines Windows x64 Electron smoke jobs use [wslDevContainer.ps1](wslDevContainer.ps1) to provision a job-owned WSL 2 distribution with Linux Docker Engine and a non-root test user. Azure Pipelines passes `-CI AzureDevOps` to use its source directory, build ID, job attempt, and pipeline variables; GitHub uses its workspace, run identifiers, and step outputs. Azure enables this coverage for Windows x64 builds with Electron tests enabled, and uses the freshly built Windows product. The test suite retains its existing Exploration exclusion; build scripts do not gate on quality. Both verify the Microsoft signature on the WSL kernel installer and checksums on the pinned Ubuntu rootfs and Linux server. The unchanged source-host backend uses the pinned published server recorded in the script. Setup verifies a real container and bind mount before running the UI suite. Cleanup runs even after failure or cancellation, removes the owned distribution and its temporary mock-server firewall rule, and retains Docker diagnostics with the smoke logs. The runner must already have the WSL and VirtualMachinePlatform Windows features enabled; setup does not enable features or reboot Windows.

All remote suites drive host connection, remote folder selection, **Use Dev Container**, prompt submission, the rendered response, and reopening the session through the UI. Model requests use the local mock LLM server, not paid models. They also verify that container startup uses the selected SSH/Tunnel/WSL connection and that the turn travels over the nested Dev Container transport.

Source runs launch the compiled standalone Agent Host with the checkout's matching Electron runtime. Packaged runs launch the shipped `bootstrap-fork.js` / `agentHostMain` entrypoint with IPC, the build's NLS messages, and authenticated WebSocket configuration; they do not require the development-only standalone entrypoint. Since Code OSS does not configure tunnel authentication scopes, the Tunnel fixture creates a private source-app snapshot with only the required test product metadata; it never changes the checkout's product files. Packaged Tunnel runs require the supplied build's tunnel authentication configuration.

Fixtures isolate their source Agent Host, credentials, endpoint registry, and CLI state, and remove their containers and temporary tunnels during teardown. Failures retain the existing smoke-runner diagnostics and redacted remote-host logs under `.build/logs/smoke-tests-electron/`. Do not run two Electron smoke runners concurrently in the same checkout: the runner shares its top-level output and test-data directories.

### Error: Could not get a unique tmp filename, max tries reached

On Windows, check for the folder `C:\Users\<username>\AppData\Local\Temp\t`. If this folder exists, the `tmp` module can't run properly, resulting in the error above. In this case, delete the `t` folder.

## Pitfalls

- Beware of workbench **state**. The tests within a single suite will share the same state.

- Beware of **singletons**. This evil can, and will, manifest itself under the form of FS paths, TCP ports, IPC handles. Whenever writing a test, or setting up more smoke test architecture, make sure it can run simultaneously with any other tests and even itself. All test suites should be able to run many times in parallel.

- Beware of **focus**. **Never** depend on DOM elements having focus using `.focused` classes or `:focus` pseudo-classes, since they will lose that state as soon as another window appears on top of the running VS Code window. A safe approach which avoids this problem is to use the `waitForActiveElement` API. Many tests use this whenever they need to wait for a specific element to _have focus_.

- Beware of **timing**. You need to read from or write to the DOM... but is it the right time to do that? Can you 100% guarantee that `input` box will be visible at that point in time? Or are you just hoping that it will be so? Hope is your worst enemy in UI tests. Example: just because you triggered Quick Access with `F1`, it doesn't mean that it's open and you can just start typing; you must first wait for the input element to be in the DOM as well as be the current active element.

- Beware of **waiting**. **Never** wait longer than a couple of seconds for anything, unless it's justified. Think of it as a human using Code. Would a human take 10 minutes to run through the Search viewlet smoke test? Then, the computer should even be faster. **Don't** use `setTimeout` just because. Think about what you should wait for in the DOM to be ready and wait for that instead.

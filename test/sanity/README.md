# VS Code Release Sanity Check Tests

## Overview

Automated end-to-end release sanity tests for published VS Code builds.
These tests verify critical functionality across different platforms and installation methods,
ensuring that published builds meet quality standards before reaching end users.

See [Sanity Check wiki page](https://github.com/microsoft/vscode/wiki/Sanity-Check) for more details on sanity testing.

## Usage

Many tests will use the underlying platform to install and verify basic VS Code functionality.
Such tests will need to be run on the corresponding target OS/virtual machine and will fail if ran outside.
Use -g or -f command-line options to filter tests to match the host platform.

### Command-Line Options

|Option|Alias|Description|
|--------|-------|-------------|
|`--commit <commit>`|`-c`|The commit to test (required)|
|`--quality <quality>`|`-q`|The quality to test (required, "stable", "insider" or "exploration")|
|`--no-cleanup`||Do not cleanup downloaded files after each test|
|`--no-signing-check`||Skip Authenticode and codesign signature checks|
|`--no-headless`||Run tests with a visible UI (desktop tests only)|
|`--no-detection`||Enable all tests regardless of platform and skip executable runs|
|`--grep <pattern>`|`-g`|Only run tests matching the given pattern (Mocha grep)|
|`--fgrep <string>`|`-f`|Only run tests containing the given string (Mocha fgrep)|
|`--test-results <path>`|`-t`|Output test results in JUnit format to the specified path|
|`--screenshots-dir <path>`|`-s`|Save failure screenshots, and the app logs of failed desktop UI tests, to the specified directory.|
|`--timeout <sec>`||Set the test-case timeout in seconds (default: 600 seconds)|
|`--artifacts-dir <path>`||Resolve builds from downloaded pipeline artifacts instead of the update service|
|`--setuid-sandbox`||Launch installed DEB/RPM desktop apps with the namespace sandbox disabled; requires a non-root runner and a root owned `4755` sandbox helper|
|`--verbose`|`-v`|Enable verbose logging|
|`--help`|`-h`|Show this help message|

### Failure Logs

When a desktop UI test fails, the app is closed and VS Code's own process logs (main, shared process, renderer, extension host, pty host, agent host and network) are copied from the test's throwaway profile into `<screenshots-dir>/<test>-logs`, so they are uploaded with the screenshots. Each file keeps its last 2 MB, up to 10 MB per test, and extension output logs are not copied. The desktop app also runs with `--log-net-log`, and the gzipped Chromium NetLog is saved as `<test>-netlog.json.gz` (open it in the [NetLog viewer](https://netlog-viewer.appspot.com/)). Treat the screenshots directory as internal.

When installing the extension from the Marketplace fails in any UI test, `<test>-gallery.json` lists the app's gallery requests that failed or returned an error status. Each failed URL is also requested once from the test's Node process, with the same request headers, as soon as it fails, and that response's status and headers are saved next to it. The CORS preflight (`OPTIONS`) that the app sends first is replayed with curl too, directly and, for desktop tests, through the proxy that the app resolved for the URL, and the start of each raw response is saved. This tells a Marketplace, CDN or proxy response apart from a failure in the app's own request.

### Example

To run CLI tests for all platforms on given commit of Insiders build, from the root directory run:

```bash
npm run sanity-test -- --commit 19228f26df517fecbfda96c20956f7c521e072be --quality insider -g "cli*"
```

### Testing Unpublished Builds

By default targets are resolved through `update.code.visualstudio.com`, which only serves published
builds. Validation builds that never publish — such as the Copilot SDK canary runs — can be tested by
passing `--artifacts-dir`, which resolves each target from downloaded build pipeline artifacts laid out
as `<artifacts-dir>/<artifact-name>/<file>`:

```bash
npm run sanity-test -- --commit <commit> --quality insider --artifacts-dir /tmp/artifacts -g "linux.*x64"
```

Every target has a `targetArtifacts` mapping in `src/context.ts`; an unmapped target fails with an
explicit error rather than falling back to the update service, so runs must be scoped with `-g`/`-f`
to the artifacts that were actually downloaded. The SHA-256 check is skipped in this mode because
there is no update service metadata to compare against.

### Timeouts

The UI tests open a Markdown preview and wait up to one minute for its webview to render, then up to one minute for its document to finish loading. Resource monitoring remains active through document loading so delayed script failures are also detected. This catches webview resource loading failures (for example 401 responses for remote authorities with uppercase letters such as `wsl+Ubuntu`), and any webview resource response with an error status fails the test. Browsers that refuse to register the webview service worker (such as Chromium on Debian 12) cannot load any webview, so the check is skipped there with a pipeline warning.

Synchronous `wsl` commands issued by the tests, and the Ubuntu import, startup, conversion and listing commands in the Windows setup script, have a five-minute timeout. The setup wrapper normalizes nonzero exit codes (including `-1`) to `1` so batch error checks detect them. Setup emits a pipeline warning when Ubuntu cannot run; this does not install a missing WSL2 kernel or re-enable unavailable WSL coverage.

Extension installation makes at most three attempts, each allowing 30 seconds to click Install, 30 seconds for installation to start, and one minute to wait for completion, with a five-second delay between attempts. These waits total at most 6 minutes 10 seconds, leaving room for setup, the Markdown preview check and cleanup within the default ten-minute test timeout. Mocha does not cancel timed-out async tests, so increasing these waits can cause a retry to start before the previous attempt has cleaned up.

## Scripts

Platform-specific scripts are provided in the `scripts/` directory to set up the environment and run tests:

|Script|Platform|Description|
|--------|----------|-------------|
|`run-win32.cmd`|Windows|Runs tests using Edge as the Playwright browser|
|`run-macOS.sh`|macOS|Installs Playwright WebKit and runs tests|
|`run-ubuntu.sh`|Ubuntu|Sets up X11, Chromium, and Snap daemon, then runs tests|
|`run-docker.sh`|Linux (Docker)|Pulls a prebuilt image and runs tests inside a Docker container|
|`run-docker.cmd`|Windows (Docker)|Windows wrapper for Docker-based Linux tests|

### Docker Script Options

The `run-docker.sh` script accepts the following options:

|Option|Description|
|--------|-------------|
|`--container <name>`|Supported image name (required, e.g., "ubuntu-24", "debian-13", "alpine")|
|`--arch <arch>`|Target architecture: amd64, arm64, or arm (default: amd64)|

All other arguments are passed through to the sanity test runner.

## Focused Linux Copilot Shim Package Lifecycle Suite

`test-copilot-shim` is intentionally separate from the normal sanity runner. It does not use the single-quality `TestContext`, capability-based skipping, fresh-install helpers, or Mocha retry behavior from `src/index.ts`. It requires an explicit fixture manifest, one explicit package format, and an explicit Mocha selector; it always runs with `retries: 0` and bails after a stateful failure.

The suite must run as root **only inside a provisioned disposable Linux container or VM**. Root and an environment flag are not sufficient evidence of isolation. The runner refuses non-Linux hosts, unavailable `dpkg`/`rpm`, a missing marker, a marker from another mount namespace, bind/subdirectory mounts for `/usr` or `/etc`, non-provisioned marker directories, existing `code`/`code-insiders`/`code-oss` packages, `/etc/vscode/policy.json`, or existing `/usr/bin/copilot`, `/usr/local/bin/copilot`, VS Code payload directories, and launcher entries. It never falls back to a skipped scenario.

The marker is created only by `scripts/provision-copilot-shim-runner.sh`. It requires a unique `VSCODE_COPILOT_SHIM_RUNNER_ID`, creates root-owned probes under `/usr/share/vscode-copilot-shim-package-lifecycle/<id>` and `/etc/vscode-copilot-shim-package-lifecycle/<id>`, and writes a mount-namespace-bound marker at `/run/vscode-copilot-shim-package-lifecycle/<id>/marker.json`. The harness accepts only that marker layout and uses the marker's test-owned work/evidence roots. Successful scenarios remove only fixture packages and paths introduced by the scenario. Failed scenarios retain package state and write their command transcript to the marker's evidence root.

For a prepared workspace, the safe source-only helper check is:

```bash
npm run test-copilot-shim-rendering
```

It verifies the checked-in `resources/linux/copilot-link.sh` source has no unresolved rendering markers or RPM macros, has literal Stable/Insiders targets, and defines `vscode_copilot_link`. It does not invoke a package manager or mutate package state.

On Linux, this check runs the same helper with `sh` and `bash` against stub shims and a temporary link path. It covers the `CopilotCliCommand` policy that each shim reports, the DEB `add-copilot-command` debconf answer, and hand-over on removal. It doesn't need root and doesn't touch `/usr/bin/copilot`:

```bash
npm run test-copilot-shim-helper
```

### Fixture Manifest and Generation

The generated manifest is self-contained: package paths are relative to the manifest, and it records DEB/RPM format, package architecture, identity, role, actual package name/version, a monotonically declared revision ordinal, payload kind, launcher/shim paths, source revision, generation command, production templates/specs used, deliberate fixture adjustments, and the SHA-256 of the exact helper source. Its JSON schema is [`fixtures/copilot-shim-fixtures.schema.json`](fixtures/copilot-shim-fixtures.schema.json). The generator rejects missing fixture roles, equal initial/upgrade revisions, a relabelled `code-oss` source, unresolved paths, and incomplete current Stable/Insiders payloads.

Use [`fixtures/copilot-shim-fixture-plan.example.json`](fixtures/copilot-shim-fixture-plan.example.json) as a plan template. A complete plan supplies, for **both DEB and RPM**, branded `code` and `code-insiders` initial, strictly newer upgrade, and older no-shim inputs; `code-oss` initial/upgrade negative inputs; and no manually assembled VS Code package. The generator creates its own tiny foreign-command package only for the test case that proves package-manager ownership preservation. It does not duplicate the VS Code link helper or relabel an OSS package.

Each source root in the plan must be a disposable, already branded source/build copy rather than this checkout. Put the prepared payload that production Gulp expects beside it as `../VSCode-linux-<arch>`, then create this marker in the disposable source root before running the generator:

```json
{
	"schemaVersion": 1,
	"purpose": "vscode-copilot-shim-fixture-source",
	"disposable": true,
	"sourceRevision": "<exact-source-commit>"
}
```

Keep every entry in its own parent directory so its prepared payload cannot be confused with another revision or identity. For example, the `code-initial` plan entry uses `/fixtures/code-initial/source` and its prepared payload is `/fixtures/code-initial/VSCode-linux-x64`; `code-upgrade` uses a different `/fixtures/code-upgrade/` parent. The source root's real `product.json` must already name `code`, `code-insiders`, or `code-oss`; the tool only reads that branding and fails on a mismatch. It does not modify the live checkout's branding. `sourceKind: "prepared-payload"` means the prepared payload was supplied before package construction; `sourceKind: "source-build"` records that the disposable copy built it. In both cases the generator invokes the actual production `vscode-linux-<arch>-prepare-deb/build-deb` and `prepare-rpm/build-rpm` Gulp tasks, so it consumes the real templates, package file lists, `resources/linux/copilot-link.sh`, and build rendering callbacks. It copies generated DEB controls and RPM specs into `provenance/` beside the manifest for review.

From `test/sanity`, after compiling this package and preparing the disposable inputs:

```bash
npm run compile
npm run generate-copilot-shim-fixtures -- \
	--plan ./fixtures/copilot-shim-fixture-plan.json \
	--output ./artifacts/copilot-shim-fixtures
```

This creates `./artifacts/copilot-shim-fixtures/copilot-shim-fixtures.json`. A `minimal-lifecycle` entry is generated only after the actual production prepare task; it trims the staged app payload while retaining the generated edition launcher, nested shim, and `chrome-sandbox` required by the generated RPM spec. It may accelerate lifecycle coverage, but it does **not** establish full product launcher behavior. Complete source-built initial and upgrade fixtures remain mandatory for current `code` and `code-insiders`: K1 explicitly installs both and invokes each nested edition launcher with `--version`, `--no-sandbox`, and a scenario-local `--user-data-dir` because the isolated package runner runs as root. The remaining lifecycle matrix prefers a matching minimal fixture when available and otherwise uses the complete fixture. Every available initial/upgrade payload-kind pair is checked for distinct, strictly increasing metadata.

### Running in an Isolated Package Runner

Use one disposable Debian-family runner and one disposable RPM-family runner. The exact focused commands are:

```bash
npm run test-copilot-shim -- \
	--fixtures ./artifacts/copilot-shim-fixtures/copilot-shim-fixtures.json \
	--format deb \
	--grep 'DEB (K[1-9]|OSS|warns)'

npm run test-copilot-shim -- \
	--fixtures ./artifacts/copilot-shim-fixtures/copilot-shim-fixtures.json \
	--format rpm \
	--grep 'RPM (K[1-9]|OSS|warns)'
```

The preferred container wrapper compiles no code and does not mount host `/usr` or `/etc`; it mounts only the read-only sanity workspace, read-only fixture bundle, and a retained evidence directory:

```bash
bash scripts/run-copilot-shim-container.sh \
	--container ubuntu \
	--format deb \
	--fixtures ./artifacts/copilot-shim-fixtures/copilot-shim-fixtures.json \
	--grep 'DEB (K[1-9]|OSS|warns)'

bash scripts/run-copilot-shim-container.sh \
	--container fedora \
	--format rpm \
	--fixtures ./artifacts/copilot-shim-fixtures/copilot-shim-fixtures.json \
	--grep 'RPM (K[1-9]|OSS|warns)'
```

The wrapper invokes `scripts/provision-copilot-shim-runner.sh` before the package suite and retains diagnostics under `artifacts/copilot-shim-evidence/<runner-id>/` if a test fails. For a VM or another runner launcher, set the marker variables described above, run the provisioning script inside that disposable root filesystem, and then run the corresponding package-local command. Never run the suite directly against a developer or CI host image that contains user packages, policy, `/usr`, or `/etc` state.

The suite inspects actual DEB control scripts and actual RPM `rpm -qp --scripts` output after macro expansion, compares the embedded helper byte-for-byte with the provenance source, checks unresolved markers, literal targets, and lifecycle call sites, and verifies `/usr/bin/copilot` is absent from package payload/file lists. During transactions it checks nested payload ownership with `dpkg-query`/`rpm -qf`, verifies the shared path has no package owner except in the deliberate foreign-owner fixture, records real helper mutation order through narrowly scoped wrappers for `/usr/bin/copilot` and `copilot.vscode-copilot.*` staging paths, and blocks `curl`/`wget` to prove package scripts did not install or download the real Copilot CLI. It also seeds an independent CLI and user-data sentinel in the test-owned home and verifies both remain unchanged.

| Acceptance coverage | Focused assertions |
| --- | --- |
| K1–K2 | Fresh absence, exact symlink creation, cross-edition takeover, payload/database ownership, launcher behavior |
| K3 | Separate and batched upgrades in both input orders; final owner equals the last observed successful helper hook, never merely either edition |
| K4–K6 | Non-owner removal, usable/missing/non-executable/older-no-shim fallback, and both owner-first removal orders |
| K7–K8 | Exact recognized dangling repair; foreign regular/valid/dangling links; relative and indirect healthy links; foreign package ownership; administrator replacement |
| K9 | Reconfigure/reinstall, remove/purge or repeated RPM erase handling, old-version cleanup, OSS and unrecognized-helper no-op behavior, launcher and independent data preservation |
| Warning recovery | Injected helper creation, replacement, and final-removal failures must warn while the package transaction/configured state succeeds; a later transaction repairs the command |

The focused suite is an implementation gate for source-built fixtures, not an official-artifact release gate. It does not validate Snap/archive exposure, image-based Fedora variants, or a publisher-signed artifact. Run ordinary artifact-backed desktop sanity separately once changed official DEB/RPM artifacts are available.

## Containers

Docker container definitions and their supported architecture matrix are maintained in [vscode-linux-build-agent](https://github.com/microsoft/vscode-linux-build-agent/tree/main/sanity-tests). The `containers/entrypoint.sh` script runs inside those prebuilt images from `vscodehub.azurecr.io/vscode-linux-build-agent/sanity-tests`:

|Container|Base Image|Description|
|-----------|------------|-------------|
|`alpine`|Alpine 3.22|Alpine Linux with musl libc|
|`centos`|CentOS Stream 9|RHEL-compatible distribution|
|`debian-12`|Debian 12 (Bookworm)|Previous Debian stable|
|`debian-13`|Debian 13 (Trixie)|Current Debian stable|
|`fedora-42`|Fedora 42|RPM-based distribution|
|`fedora-43`|Fedora 43|RPM-based distribution|
|`opensuse`|openSUSE Leap 16.0|SUSE-based enterprise distribution|
|`redhat`|Red Hat UBI 9|Red Hat Universal Base Image|
|`ubuntu-22`|Ubuntu 22.04|Debian-based LTS distribution|
|`ubuntu-24`|Ubuntu 24.04|Debian-based LTS distribution|

Each container includes:

- Node.js 22.x runtime
- X11 server (Xvfb) for headless desktop testing
- D-Bus for desktop integration
- Architecture-specific VS Code dependencies

Some containers include web browser used for validating web server targets.

### Running Tests in a Container

```bash
# Ubuntu 24.04 on amd64
./scripts/run-docker.sh --container ubuntu-24 -c <commit> -q insider

# Alpine on arm64
./scripts/run-docker.sh --container alpine --arch arm64 -c <commit> -q stable
```

## CI/CD Pipeline

Sanity tests run in Azure Pipelines via the `product-sanity-tests.yml` pipeline.

Linux x64 and ARM64 builds receive a separate container only DEB/RPM desktop pass whether they are published or resolved from build artifacts. It checks the installed `chrome-sandbox` ownership and mode, then exercises the UI with `--disable-namespace-sandbox` to force Chromium's setuid sandbox. Published runs select both package formats; artifact backed runs select only the DEB/RPM formats included in the job's downloads and use the same `--artifacts-dir` as the normal sanity pass. Native host, Alpine, ARM32, and archive only artifact jobs do not run this additional pass. Both passes publish separate JUnit results.

The dedicated container pass grants `SYS_ADMIN` so the setuid helper can create its PID/network namespaces, and runs the test runner as a non-root `sanity` user. The images must include `sudo`, `useradd`, and `runuser`; missing prerequisites fail explicitly rather than installing packages at test startup. The entrypoint allows that user to invoke only `dpkg` and `rpm` as root for package installation/removal. These changes apply only to the disposable setuid test container; running as root would cause Playwright to inject `--no-sandbox` and bypass the check.

Artifact sanity runs retain the native x64 job for Snap coverage and add a separate Ubuntu x64 DEB container job. The Ubuntu ARM64 job exercises its DEB, and Fedora x64/ARM64 container jobs exercise RPMs. These package container jobs run both the normal and setuid passes. The Ubuntu 24.04 ARM32 image has no desktop environment, so its artifact sanity job exercises only the CLI. Published sanity runs retain ARM32 desktop archive and DEB coverage on Debian 12 and Ubuntu 22.04, without the additional setuid sandbox pass.

### Pipeline Parameters

|Parameter|Description|
|-----------|-------------|
|`buildQuality`|The quality of the build to test: "exploration", "insider", or "stable"|
|`buildCommit`|The published build commit SHA|
|`npmRegistry`|Custom NPM registry URL (optional)|

### Test Matrix

The pipeline tests across multiple platforms and architectures:

**Native Hosts:**

- macOS arm64
- Windows x64
- Windows arm64
- Ubuntu 22.04 x64 (native, with Snap support)

**Partial Support:**

For the following platforms only downloads are validated (and not install/runtime):

- macOS x64

**Linux Containers (amd64 and arm64):**

- Alpine 3.22
- CentOS Stream 9
- Debian 12 (also arm32) and Debian 13
- Fedora 42 and 43
- openSUSE Leap 16.0
- Red Hat UBI 9
- Ubuntu 22.04 and 24.04 (also arm32)

Debian 13 ARM32 is excluded because its time64 libraries do not satisfy the ARMHF DEB's legacy package dependencies. Debian 12 and Ubuntu 22.04 retain ARMHF desktop and package coverage pending removal of 32-bit ARM support.

### Pipeline Files

- [product-sanity-tests.yml](../../build/azure-pipelines/product-sanity-tests.yml) - Main pipeline definition
- [sanity-tests.yml](../../build/azure-pipelines/common/sanity-tests.yml) - Reusable job template

### macOS Diagnostics

macOS jobs log the exact OS version/build, hardware configuration, memory pressure, swap usage,
VM page counters, and process memory rankings before dependency setup, before and after the tests,
and every minute while tests run. These snapshots help distinguish application regressions from
unhealthy build VMs even when the pool image name and Darwin kernel version have not changed.

Process rankings include memory footprint, compressed memory, RSS, and summed RSS by executable.
RSS sums can double-count shared pages and exclude compressed/nonresident memory; they are not
total physical usage. Only executable names are collected, not process arguments or environment
variables. Diagnostic commands have bounded execution times and report failures as warnings;
the monitored test command retains its exit status and the existing test timeouts.

## References

The following public documentation pages provide details on end-user VS Code setup scenarios.

- [Download VS Code](https://code.visualstudio.com/Download)
- [Requirements](https://code.visualstudio.com/docs/supporting/requirements)
- [Setup Overview](https://code.visualstudio.com/docs/setup/setup-overview)
- [Linux Setup](https://code.visualstudio.com/docs/setup/linux)
- [macOS Setup](https://code.visualstudio.com/docs/setup/mac)
- [Windows Setup](https://code.visualstudio.com/docs/setup/windows)
- [Portable Mode](https://code.visualstudio.com/docs/editor/portable)
- [VS Code Server](https://code.visualstudio.com/docs/remote/vscode-server)
- [Developing in WSL](https://code.visualstudio.com/docs/remote/wsl)

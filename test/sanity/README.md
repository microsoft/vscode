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
|`--timeout <sec>`||Set the test-case timeout in seconds (default: 600 seconds)|
|`--artifacts-dir <path>`||Resolve builds from downloaded pipeline artifacts instead of the update service|
|`--setuid-sandbox`||Launch installed DEB/RPM desktop apps with the namespace sandbox disabled; requires a non-root runner and a root owned `4755` sandbox helper|
|`--verbose`|`-v`|Enable verbose logging|
|`--help`|`-h`|Show this help message|

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

The UI tests open a Markdown preview and wait up to one minute for its webview to render. This catches webview resource loading failures (for example 401 responses for remote authorities with uppercase letters such as `wsl+Ubuntu`), and any webview resource response with an error status fails the test. Browsers that refuse to register the webview service worker (such as Chromium on Debian 12) cannot load any webview, so the check is skipped there with a pipeline warning.

Extension installation makes at most three attempts, each allowing 30 seconds to click Install, 30 seconds for installation to start, and one minute to wait for completion, with a five-second delay between attempts. These waits total at most 6 minutes 10 seconds, leaving room for setup, the Markdown preview check and cleanup within the default ten-minute test timeout. Mocha does not cancel timed-out async tests, so increasing these waits can cause a retry to start before the previous attempt has cleaned up.

## Scripts

Platform-specific scripts are provided in the `scripts/` directory to set up the environment and run tests:

|Script|Platform|Description|
|--------|----------|-------------|
|`run-win32.cmd`|Windows|On x64, installs the WSL release pinned in `build/checksums/wsl.txt` and imports Ubuntu into WSL2, then runs tests using Edge as the Playwright browser|
|`run-macOS.sh`|macOS|Installs Playwright WebKit and runs tests|
|`run-ubuntu.sh`|Ubuntu|Sets up X11, Chromium, and Snap daemon, then runs tests|
|`run-docker.sh`|Linux (Docker)|Builds and runs tests inside a Docker container|
|`run-docker.cmd`|Windows (Docker)|Windows wrapper for Docker-based Linux tests|

### Docker Script Options

The `run-docker.sh` script accepts the following options:

|Option|Description|
|--------|-------------|
|`--container <name>`|Container dockerfile name (required, e.g., "ubuntu", "alpine")|
|`--arch <arch>`|Target architecture: amd64, arm64, or arm (default: amd64)|
|`--base-image <image>`|Override the base Docker image (e.g., "ubuntu:24.04")|

All other arguments are passed through to the sanity test runner.

## Containers

Docker container definitions are provided in the `containers/` directory for testing on various Linux distributions:

|Container|Base Image|Description|
|-----------|------------|-------------|
|`alpine`|Alpine 3.x|Alpine Linux with musl libc|
|`centos`|CentOS Stream 9|RHEL-compatible distribution|
|`debian-10`|Debian 10 (Buster)|Older Debian with legacy library versions|
|`debian-12`|Debian 12 (Bookworm)|Current Debian stable|
|`fedora`|Fedora 36/40|Cutting-edge RPM-based distribution|
|`opensuse`|openSUSE Leap 16.0|SUSE-based enterprise distribution|
|`redhat`|Red Hat UBI 9|Red Hat Universal Base Image|
|`ubuntu`|Ubuntu 22.04/24.04|Popular Debian-based distribution|

Each container includes:

- Node.js 22.x runtime
- X11 server (Xvfb) for headless desktop testing
- D-Bus for desktop integration
- Architecture-specific VS Code dependencies

Some containers include web browser used for validating web server targets.

### Running Tests in a Container

```bash
# Ubuntu 24.04 on amd64
./scripts/run-docker.sh --container ubuntu --base-image ubuntu:24.04 -c <commit> -q insider

# Alpine on arm64
./scripts/run-docker.sh --container alpine --arch arm64 -c <commit> -q stable
```

## CI/CD Pipeline

Sanity tests run in Azure Pipelines via the `product-sanity-tests.yml` pipeline.

Linux x64 and ARM64 builds receive a separate container only DEB/RPM desktop pass whether they are published or resolved from build artifacts. It checks the installed `chrome-sandbox` ownership and mode, then exercises the UI with `--disable-namespace-sandbox` to force Chromium's setuid sandbox. Published runs select both package formats; artifact backed runs select only the DEB/RPM formats included in the job's downloads and use the same `--artifacts-dir` as the normal sanity pass. Native host, Alpine, ARM32, and archive only artifact jobs do not run this additional pass. Both passes publish separate JUnit results.

The dedicated container pass grants `SYS_ADMIN` so the setuid helper can create its PID/network namespaces, and runs the test runner as a non-root `sanity` user. It installs `sudo` when needed and allows that user to invoke only `dpkg` and `rpm` as root for package installation/removal. These changes apply only to the disposable setuid test container; running as root would cause Playwright to inject `--no-sandbox` and bypass the check.

Artifact sanity runs retain the native x64 job for Snap coverage and add a separate Ubuntu x64 DEB container job. The Ubuntu ARM64 job exercises its DEB, and Fedora x64/ARM64 container jobs exercise RPMs. These package container jobs run both the normal and setuid passes. ARM32 remains download/CLI-only: its QEMU emulated containers cannot execute Chromium's setuid sandbox.

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

- Alpine 3.23
- CentOS Stream 9
- Debian 10 and 12 (also arm32)
- Fedora 36 and 40
- openSUSE Leap 16.0
- Red Hat UBI 9
- Ubuntu 22.04 and 24.04 (also arm32)

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

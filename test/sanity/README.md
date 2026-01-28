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

| Option | Alias | Description |
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
|`--verbose`|`-v`|Enable verbose logging|
|`--help`|`-h`|Show this help message|

### Example

To run CLI tests for all platforms on given commit of Insiders build, from the root directory run:

```bash
npm run sanity-test -- --commit 19228f26df517fecbfda96c20956f7c521e072be --quality insider -g "cli*"
```

## Scripts

Platform-specific scripts are provided in the `scripts/` directory to set up the environment and run tests:

| Script | Platform | Description |
|--------|----------|-------------|
|`run-win32.cmd`|Windows|Runs tests using Edge as the Playwright browser|
|`run-macOS.sh`|macOS|Installs Playwright WebKit and runs tests|
|`run-ubuntu.sh`|Ubuntu|Sets up X11, Chromium, and Snap daemon, then runs tests|
|`run-docker.sh`|Linux (Docker)|Builds and runs tests inside a Docker container|
|`run-docker.cmd`|Windows (Docker)|Windows wrapper for Docker-based Linux tests|

### Docker Script Options

The `run-docker.sh` script accepts the following options:

| Option | Description |
|--------|-------------|
|`--container <name>`|Container dockerfile name (required, e.g., "ubuntu", "alpine")|
|`--arch <arch>`|Target architecture: amd64, arm64, or arm (default: amd64)|
|`--base-image <image>`|Override the base Docker image (e.g., "ubuntu:24.04")|

All other arguments are passed through to the sanity test runner.

## Containers

Docker container definitions are provided in the `containers/` directory for testing on various Linux distributions:

| Container | Base Image | Description |
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

### Pipeline Parameters

| Parameter | Description |
|-----------|-------------|
|`buildQuality`|The quality of the build to test: "exploration", "insider", or "stable"|
|`buildCommit`|The published build commit SHA|
|`npmRegistry`|Custom NPM registry URL (optional)|

### Test Matrix

The pipeline tests across multiple platforms and architectures:

**Native Hosts:**

- macOS arm64
- Windows x64
- Ubuntu 22.04 x64 (native, with Snap support)

**Partial Support:**

For the following platforms only downloads are validated (and not install/runtime):

- macOS x64
- Windows arm64

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

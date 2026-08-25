# GitCortex Studio

[![Based on Code - OSS](https://img.shields.io/badge/based%20on-Code--OSS-007ACC.svg)](https://github.com/microsoft/vscode)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE.txt)

GitCortex Studio is a branded, open-source code editor based on the [Code - OSS](https://github.com/microsoft/vscode) source tree and the [Visual Studio Code](https://code.visualstudio.com) workbench. It preserves the editor, extension, terminal, source-control, debugging, and development foundations of VS Code while adding GitCortex-specific branding and an integrated virtual-machine development surface.

This repository is the GitCortex adaptation of the upstream VS Code codebase. It is not a claim that every feature of the commercial Visual Studio Code distribution is included here. Availability of extensions, services, operating-system integrations, and AI features depends on the build, the installed extensions, and the user's configuration.

## Project status

The project is actively being built and validated. The table below distinguishes functionality that is present in the current source tree from work that is still being validated or has not yet been implemented.

| Area | Current status |
| --- | --- |
| Code editor foundation | Present. GitCortex uses the Code - OSS / VS Code workbench and its existing editing, navigation, terminal, source-control, debugging, extension, and configuration infrastructure. |
| GitCortex branding | Integrated. Product names, application identifiers, URL protocol, data-folder names, icons, Windows identifiers, and related branding metadata are defined in `product.json` and the build resources. |
| Virtual machines | Present in the source tree. The workbench exposes Ubuntu Developer and Ubuntu Sandbox machines with start, stop, restart, remove, environment checks, resource settings, and display opening. Running them requires a compatible QEMU installation and suitable host capabilities. |
| VM remote desktop | Present in the source tree. The Remote Desktop surface uses the bundled noVNC runtime and connects through a token-authenticated WebSocket bridge to a private Unix VNC socket. It does not intentionally expose QEMU's VNC server as an unauthenticated TCP listener. |
| Agent and AI integrations | The product configuration retains the VS Code extension-based agent/chat integration points, including GitHub Copilot-related configuration. GitCortex does not claim an independent built-in AI agent runtime beyond the extensions and services actually installed and enabled by the user. |
| VM lifecycle and IPC hardening | Integrated. QMP-based shutdown, serialized VM lifecycle operations, daemon shutdown handling, signal handling, socket cleanup, and per-instance IPC disposal are implemented in the current VM service. |
| Protocol file serving | Integrated. The Electron protocol implementation uses file-backed streaming and handles `HEAD`, byte ranges, partial responses, invalid ranges, and file errors without buffering an entire file unnecessarily. |
| Packaging and licensing resources | Integrated in the current build configuration. The desktop and next-generation build paths include the required noVNC runtime resources and license, and the Debian removal script protects unrelated Microsoft resources. |
| Production readiness | Still being validated. Cross-platform QEMU/KVM availability, installer and release workflows, and full build validation must be checked in the target CI or release environments before being described as complete. |

## What GitCortex currently provides

### A familiar VS Code development environment

GitCortex retains the core Code - OSS development experience: a workbench with multiple editor groups, syntax-aware editing, navigation and search, integrated terminals, source control, debugging infrastructure, an extension model, configurable keybindings and themes, and the standard VS Code contribution model. Built-in extensions and language support remain organized under the repository's existing `extensions` tree.

The editor can also consume the broader VS Code extension ecosystem where licensing, compatibility, and the selected build permit it. The presence of an extension integration point does not by itself guarantee that a particular extension or service is installed in a given distribution.

### Integrated virtual machines

The current VM contribution defines two well-known guest profiles:

| Machine | Intended role | Default resources |
| --- | --- | --- |
| Ubuntu Developer | A development-oriented guest | 2 vCPUs, 4096 MB RAM, 32 GB disk |
| Ubuntu Sandbox | An isolated guest for experiments and tests | 2 vCPUs, 2048 MB RAM, 16 GB disk |

The workbench provides commands and view actions to start, stop, restart, open, and remove a stopped machine. It also exposes an environment check and machine settings for QEMU binary selection, acceleration mode, data-root location, network mode, CPU count, memory, disk size, and optional installer ISO paths.

The implementation supports explicit `user`, `restricted`, and `none` network modes, together with KVM or TCG acceleration selection. Resource values are bounded by the VM service before they are passed to the launcher. These controls describe the implemented configuration surface; they do not guarantee that a host has QEMU, KVM, an installer ISO, sufficient disk space, or sufficient memory.

### Remote Desktop through VNC and noVNC

Opening a running VM's desktop uses the bundled noVNC client in a VS Code webview. The current connection path is:

```text
Workbench Remote Desktop
        │
        ▼
Token-authenticated WebSocket proxy
        │
        ▼
Private Unix VNC socket
        │
        ▼
QEMU virtual machine
```

The proxy issues temporary single-use session tokens, bridges WebSocket traffic to the Unix socket, and disposes active connections during shutdown. The webview uses a nonce-based content-security policy, a local noVNC resource root, theme-aware styling, and keyboard interaction support. Enter or Space enters desktop interaction and Escape returns focus to the interaction control.

The source tree includes the noVNC JavaScript runtime and its license, and the build pipelines explicitly include the required resources. Actual desktop availability still depends on a successfully running VM and the host's QEMU environment.

### Agent and development workflows

GitCortex retains the agent and chat integration points supplied by the VS Code / Code - OSS architecture and the product configuration references used by extension-based providers such as GitHub Copilot. The editor also retains the surrounding development workflows for terminals, debugging, extensions, source control, workspaces, tasks, and configuration.

These integrations are deliberately described as extension- and service-based. A user must install, authenticate, and configure the relevant provider where required. GitCortex does not currently claim a separate, always-available GitCortex agent model, hosted backend, autonomous execution service, or provider entitlement that is not present in the source or supplied by an installed extension.

## Architecture and branding changes already integrated

The GitCortex-specific work currently present in `main` includes the following architectural changes:

| Component | Integrated change |
| --- | --- |
| VM contract and daemon | Explicit daemon shutdown surface, VM state reporting, resource sanitization, environment checks, and settings for data-root, acceleration, networking, and installer images. |
| QEMU launcher and QMP | Structured QEMU arguments, private Unix VNC and QMP sockets, explicit display/network configuration, graceful shutdown, and forced-termination cleanup. |
| VM manager | Serialized start/stop/restart operations, start/stop race handling, per-VM endpoints, data-root recalculation, and process/socket cleanup. |
| VNC bridge | Token-authenticated WebSocket upgrade, one-time token expiry, Unix-socket bridging, frame handling, first-packet preservation, and idempotent disposal. |
| Electron protocol | File-backed streaming with explicit range and error handling rather than whole-file buffering. |
| Workbench UI | VM cards, state and resource display, environment warnings, action buttons, Remote Desktop opening, theme variables, ARIA labels, keyboard focus handling, and webview CSP hardening. |
| Build and packaging | noVNC runtime and license inclusion in both relevant desktop build paths, Debian `postrm` protection, and GitCortex-specific product identifiers. |
| Branding | GitCortex Studio product naming, application and data-folder identifiers, protocol name, platform identifiers, icons, and distinct Windows packaging GUIDs. |

The independent TypeScript mangler fix in `src/vs/sessions/contrib/changes/browser/sessionChangesEditor.ts` is also present in `main`. It explicitly preserves the `protected` visibility of two overrides; it is unrelated to the VM and VNC architecture.

## What is complete, in progress, and planned

### Complete in the current source tree

The current source tree contains the GitCortex product branding, the VM service and workbench surface, the QEMU/QMP lifecycle implementation, the token-authenticated Unix-socket VNC bridge, the bundled noVNC runtime and license, the protocol streaming implementation, the IPC shutdown handling, the accessibility and CSP changes, and the packaging protections described above.

The hardening work was merged through [PR #6](https://github.com/Frankenstein-dev197/vscode/pull/6). The later independent mangler correction is recorded in commit [`f889e98be4ed15a870e9cd7588d23fdc82fb9e0a`](https://github.com/Frankenstein-dev197/vscode/commit/f889e98be4ed15a870e9cd7588d23fdc82fb9e0a).

### In progress

Validation remains in progress for full production builds, especially in environments with enough memory for the complete TypeScript compilation and mangling pipeline. Host-dependent VM behavior also requires validation on the target operating systems, QEMU versions, KVM configurations, network modes, and packaging formats that GitCortex intends to support.

The presence of source implementations and build resources should therefore not be read as a claim that every installer, release artifact, guest image, or host configuration has already been validated end to end.

### Planned, but not yet claimed as implemented

Future work may include additional guest profiles and images, a more complete VM provisioning and first-run experience, broader cross-platform release validation, CI coverage for QEMU and noVNC paths, and further operational documentation. These are roadmap items only; they are not presented as current product capabilities until their implementations and validations are added to the repository.

## Building and contributing

This repository follows the upstream VS Code development model. For the canonical build, debugging, testing, coding-guideline, and pull-request instructions, see the [VS Code contribution guide](https://github.com/microsoft/vscode/wiki/How-to-Contribute).

The repository also includes a [development container](.devcontainer/README.md) suitable for Dev Containers and GitHub Codespaces. A full VS Code build is resource-intensive; use the requirements documented by the development container and the upstream contribution guide rather than assuming that every local machine can complete the full build.

Contributions should explain whether they affect the Code - OSS foundation, GitCortex-specific branding, VM behavior, VNC/noVNC connectivity, packaging, or documentation. Changes to VM or remote-desktop behavior should include targeted tests or a precise explanation of the host-dependent validation that was performed.

## Relationship to Code - OSS and Visual Studio Code

Code - OSS is the open-source repository from which Visual Studio Code is distributed. The upstream repository is developed by Microsoft and the community under the MIT license. Visual Studio Code is a Microsoft distribution of Code - OSS with Microsoft-specific customizations and is released under the [Microsoft product license](https://code.visualstudio.com/License/).

GitCortex Studio is a separate branded adaptation built from this open-source foundation. GitCortex branding and product metadata do not change the origin of the Code - OSS components, and they do not grant rights to Microsoft trademarks, services, extensions, or third-party providers beyond the applicable terms of those components and services.

## Feedback and project resources

For GitCortex-specific bugs and feature requests, use the repository's [issue tracker](https://github.com/Frankenstein-dev197/vscode/issues). For upstream Code - OSS architecture, contribution conventions, and related projects, consult the [upstream VS Code repository](https://github.com/microsoft/vscode), its [contribution guide](https://github.com/microsoft/vscode/wiki/How-to-Contribute), and the [VS Code documentation](https://code.visualstudio.com/docs).

## License

The Code - OSS source in this repository is licensed under the [MIT License](LICENSE.txt). Copyright notices and third-party license obligations remain applicable to the components included in the build, including the bundled noVNC runtime. Review the relevant license files before redistributing a build.

Copyright (c) Microsoft Corporation. All rights reserved.

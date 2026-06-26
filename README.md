# VS Code fork — DIAL + BYOK

This repository is a fork of [Visual Studio Code - Open Source ("Code - OSS")](https://github.com/microsoft/vscode), maintained at [sergey-zinchenko/vscode](https://github.com/sergey-zinchenko/vscode).

Upstream `main` tracks [microsoft/vscode](https://github.com/microsoft/vscode). This fork adds:

- **Bundled [DIAL Chat Model Provider](extensions/dial-chat-model-provider/)** — connect Copilot chat to [DIAL Core](https://github.com/epam/ai-dial-core) via OIDC or API key
- **BYOK model pipeline** — use extension-provided chat and embedding models without a GitHub Copilot subscription

See [FORK.md](FORK.md) for a full list of customizations vs upstream `main`.

## Quick links

| Topic | Document |
| --- | --- |
| Fork customizations | [FORK.md](FORK.md) |
| **Production installer (Windows, unsigned)** | [build/custom/PRODUCTION-BUILD.md](build/custom/PRODUCTION-BUILD.md) |
| DIAL setup (auth, settings, commands) | [extensions/dial-chat-model-provider/README.md](extensions/dial-chat-model-provider/README.md) |
| DIAL extension architecture | [extensions/dial-chat-model-provider/ARCHITECTURE.md](extensions/dial-chat-model-provider/ARCHITECTURE.md) |
| Contributing to this fork | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Security | [SECURITY.md](SECURITY.md) |

## Build and run

**Prerequisites:** Node.js 22+, Python 3, build tools for native modules. See [How to Contribute](https://github.com/microsoft/vscode/wiki/How-to-Contribute) for platform-specific setup.

```bash
npm install
npm run compile          # client + copilot + dial extension
./scripts/code.sh        # macOS / Linux
.\scripts\code.bat       # Windows
```

Build only the DIAL extension:

```bash
npm run compile-dial
npm run watch-dial       # watch mode
```

### Production installer (Windows x64)

Unsigned installer with optimized size (~200 MB, no shipped source maps). Requires `npm run compile-dial` and `$env:CI='true'` during packaging.

See [build/custom/PRODUCTION-BUILD.md](build/custom/PRODUCTION-BUILD.md) for the full step-by-step guide and verification checklist.

## Issues and feedback

Open issues and pull requests on [sergey-zinchenko/vscode](https://github.com/sergey-zinchenko/vscode), not on microsoft/vscode.

- DIAL extension bugs → mention `extensions/dial-chat-model-provider/`
- BYOK / chat pipeline bugs → mention `src/vs/workbench/contrib/chat/` or `extensions/copilot/`

## License

| Component | License |
| --- | --- |
| VS Code core | MIT — [LICENSE.txt](LICENSE.txt) |
| DIAL Chat Model Provider | Apache 2.0 — [extensions/dial-chat-model-provider/LICENSE](extensions/dial-chat-model-provider/LICENSE) |

---

## Appendix: upstream VS Code (Code - OSS)

The sections below are retained from the upstream Microsoft README for reference.

### The Repository

This repository ("`Code - OSS`") is where Microsoft develops [Visual Studio Code](https://code.visualstudio.com) together with the community. The upstream source is available under the [MIT license](https://github.com/microsoft/vscode/blob/main/LICENSE.txt).

### Visual Studio Code

<p align="center">
  <img alt="VS Code in action" src="https://github.com/user-attachments/assets/56af271c-949d-454c-a3ea-16188c063414">
</p>

[Visual Studio Code](https://code.visualstudio.com) is a distribution of the `Code - OSS` repository with Microsoft-specific customizations released under a traditional [Microsoft product license](https://code.visualstudio.com/License/).

Visual Studio Code combines the simplicity of a code editor with what developers need for their core edit-build-debug cycle. It provides comprehensive code editing, navigation, and understanding support along with lightweight debugging, a rich extensibility model, and lightweight integration with existing tools.

Visual Studio Code is updated monthly with new features and bug fixes. You can download it for Windows, macOS, and Linux on [Visual Studio Code's website](https://code.visualstudio.com/Download). To get the latest releases every day, install the [Insiders build](https://code.visualstudio.com/insiders).

### Contributing (upstream)

There are many ways in which you can participate in the upstream project:

* [Submit bugs and feature requests](https://github.com/microsoft/vscode/issues), and help verify as they are checked in
* Review [source code changes](https://github.com/microsoft/vscode/pulls)
* Review the [documentation](https://github.com/microsoft/vscode-docs) and make pull requests for anything from typos to new content.

If you are interested in fixing issues and contributing directly to the upstream code base,
please see [How to Contribute](https://github.com/microsoft/vscode/wiki/How-to-Contribute).

### Feedback (upstream)

* Ask a question on [Stack Overflow](https://stackoverflow.com/questions/tagged/vscode)
* Upvote [popular feature requests](https://github.com/microsoft/vscode/issues?q=is%3Aopen+is%3Aissue+label%3Afeature-request+sort%3Areactions-%2B1-desc)
* [File an issue](https://github.com/microsoft/vscode/issues) on the upstream repo
* See the [Feedback Channels wiki](https://github.com/microsoft/vscode/wiki/Feedback-Channels)

### Related Projects

Many core components and extensions live in separate repositories. See [Related Projects](https://github.com/microsoft/vscode/wiki/Related-Projects) on the upstream wiki.

### Bundled Extensions

VS Code includes built-in extensions in the [extensions](extensions) folder, including grammars and snippets for many languages. Extensions that provide rich language support have the suffix `language-features`.

This fork additionally bundles [`extensions/dial-chat-model-provider/`](extensions/dial-chat-model-provider/).

### Development Container

This repository includes a Visual Studio Code Dev Containers / GitHub Codespaces development container.

* For [Dev Containers](https://aka.ms/vscode-remote/download/containers), use **Dev Containers: Clone Repository in Container Volume...**
* For Codespaces, install the [GitHub Codespaces](https://marketplace.visualstudio.com/items?itemName=GitHub.codespaces) extension and use **Codespaces: Create New Codespace**

Docker / the Codespace should have at least **4 cores and 6 GB of RAM (8 GB recommended)**. See the [development container README](.devcontainer/README.md).

### Code of Conduct

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).

### License (upstream core)

Copyright (c) Microsoft Corporation. All rights reserved.

Licensed under the [MIT](LICENSE.txt) license.

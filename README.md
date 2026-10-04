# Personal Code - OSS Fork
# Visual Studio Code - Open Source ("Code - OSS")
[![Feature Requests](https://img.shields.io/github/issues/microsoft/vscode/feature-request.svg)](https://github.com/microsoft/vscode/issues?q=is%3Aopen+is%3Aissue+label%3Afeature-request+sort%3Areactions-%2B1-desc)
[![Bugs](https://img.shields.io/github/issues/microsoft/vscode/bug.svg)](https://github.com/microsoft/vscode/issues?utf8=✓&q=is%3Aissue+is%3Aopen+label%3Abug)

This repository is a personal development and research fork of [`microsoft/vscode`](https://github.com/microsoft/vscode), the open-source **Code - OSS** codebase.

It is maintained by [`NguyenCuong1989`](https://github.com/NguyenCuong1989) and is **not** an official Microsoft repository, Visual Studio Code distribution, endorsement, or support channel.

## Provenance

- Upstream source: [`microsoft/vscode`](https://github.com/microsoft/vscode)
- Upstream project: **Code - OSS**
- Upstream license: [MIT](LICENSE.txt)
- Third-party notices: [ThirdPartyNotices.txt](ThirdPartyNotices.txt)
- Fork-specific attribution and redistribution notes: [FORK_NOTICE.md](FORK_NOTICE.md)

The Microsoft copyright notice and upstream MIT license are intentionally preserved. Third-party notices inherited from upstream are also preserved.

## Fork scope

The fork-specific changes are intentionally kept separate from the upstream project. They currently focus on personal development automation, Codespaces/Git identity setup, repository guardrails, and provenance documentation rather than replacing the upstream core license or claiming ownership of Code - OSS.
Visual Studio Code is updated monthly with new features and bug fixes. You can download it for Windows, macOS, and Linux on the [Visual Studio Code website](https://code.visualstudio.com/Download). To get the latest releases every day, install the [Insiders build](https://code.visualstudio.com/insiders).

For the exact changes relative to the upstream base used by this fork, use Git history/compare views. Any future third-party code or dependency added specifically by this fork should carry the attribution and license material required by that component.

## Upstream documentation and support

For official Code - OSS development documentation, contribution guidance, issues, roadmap, and build instructions, use the upstream project:

- Repository: https://github.com/microsoft/vscode
- Contributing: https://github.com/microsoft/vscode/wiki/How-to-Contribute
- Issues: https://github.com/microsoft/vscode/issues
- Visual Studio Code product site: https://code.visualstudio.com/
* [Submit bugs and feature requests](https://github.com/microsoft/vscode/issues), and help us verify them as they are checked in
* Review [source code changes](https://github.com/microsoft/vscode/pulls)
* Review the [documentation](https://github.com/microsoft/vscode-docs) and make pull requests for anything from typos to new content.

If you are interested in fixing issues and contributing directly to the codebase, please see the document [How to Contribute](https://github.com/microsoft/vscode/wiki/How-to-Contribute), which covers the following:

Links to Microsoft or Visual Studio Code are descriptive references to the upstream project/product. They do not imply affiliation.

## Branding and redistribution

`Code - OSS` source and Microsoft's separately distributed **Visual Studio Code** product are not the same distribution. An independently published binary should use distinct branding and should be reviewed for product names, logos/icons, marketplace/service integrations, bundled extensions, and third-party license obligations before release.

No release binaries are published from this repository at the time of this notice.

## Development container

This fork inherits the upstream Dev Container / Codespaces setup. The fork also contains local Git-identity normalization and verification logic under `.devcontainer/` and `.github/workflows/codespaces-git-identity.yml`.
Many of the core components and extensions to VS Code live in their own repositories on GitHub. For example, the [node debug adapter](https://github.com/microsoft/vscode-node-debug) and the [mono debug adapter](https://github.com/microsoft/vscode-mono-debug) repositories are separate from each other. For a complete list, please visit the [Related Projects](https://github.com/microsoft/vscode/wiki/Related-Projects) page on our [wiki](https://github.com/microsoft/vscode/wiki).

## Bundled Extensions

VS Code includes a set of built-in extensions located in the [extensions](extensions) folder, including grammars and snippets for many languages. Extensions that provide rich language support (inline suggestions, Go to Definition) for a language have the suffix `language-features`. For example, the `json` extension provides coloring for `JSON` and the `json-language-features` extension provides rich language support for `JSON`.

## Development Container

This repository includes a Visual Studio Code Dev Containers / GitHub Codespaces development container.

* For [Dev Containers](https://aka.ms/vscode-remote/download/containers), use the **Dev Containers: Clone Repository in Container Volume...** command, which creates a Docker volume for better disk I/O on macOS and Windows.
  * If you already have VS Code and Docker installed, you can also click [here](https://vscode.dev/redirect?url=vscode://ms-vscode-remote.remote-containers/cloneInVolume?url=https://github.com/microsoft/vscode) to get started. This will cause VS Code to automatically install the Dev Containers extension if needed, clone the source code into a container volume, and spin up a dev container for use.

* For Codespaces, install the [GitHub Codespaces](https://marketplace.visualstudio.com/items?itemName=GitHub.codespaces) extension in VS Code, and use the **Codespaces: Create New Codespace** command.

Docker / the Codespace should have at least **4 cores and 6 GB of RAM (8 GB recommended)** to run a full build. See the [development container README](.devcontainer/README.md) for more information.

## Code of Conduct

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/). For more information, see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

## License

Upstream Code - OSS source:

Copyright (c) Microsoft Corporation. All rights reserved.

Licensed under the [MIT License](LICENSE.txt).

Fork-specific changes do not remove or supersede upstream or third-party license obligations. See [FORK_NOTICE.md](FORK_NOTICE.md).

# VBCode Editor

A custom fork of [Visual Studio Code](https://code.visualstudio.com) with multi-agent AI orchestration capabilities built into the workbench.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) (check `.nvmrc` or `package.json` engines for version)
- [npm](https://www.npmjs.com/) (ships with Node.js)
- [Python](https://www.python.org/) (for native module compilation)
- Platform-specific build tools:
  - **Windows:** Visual Studio Build Tools with "Desktop development with C++" workload
  - **macOS:** Xcode Command Line Tools (`xcode-select --install`)
  - **Linux:** `build-essential`, `libx11-dev`, `libxkbfile-dev`, `libsecret-1-dev`

### Dev Flow

```bash
# 1. Install dependencies
npm install

# 2. Start the watch compilation (runs in background, recompiles on changes)
npm run watch

# 3. In a separate terminal, launch the dev build
#    Windows:
scripts\code.bat

#    macOS / Linux:
./scripts/code.sh
```

The `npm run watch` command runs three watchers in parallel:
- **watch-client-transpile** — transpiles `src/` via the next-gen build pipeline
- **watch-client** — incremental gulp compilation for the client
- **watch-extensions** — compiles built-in extensions

Once the initial compilation finishes, `scripts/code.bat` (or `code.sh`) launches the Electron app in dev mode with hot-reload support. The launch script automatically runs `node build/lib/preLaunch.ts` to download Electron and prepare built-in extensions (skip with `VSCODE_SKIP_PRELAUNCH=1`).

### Other Useful Commands

| Command | Description |
|---------|-------------|
| `npm run compile` | One-shot full compilation |
| `npm run compile-check-ts-native` | Type-check `src/` without emitting |
| `scripts/test.bat` (or `test.sh`) | Run unit tests |
| `scripts/test.bat --grep <pattern>` | Run filtered unit tests |
| `scripts/test-integration.bat` (or `.sh`) | Run integration tests |
| `npm run valid-layers-check` | Check architectural layering rules |

### Web Development

```bash
# Watch + compile for web target
npm run watch-web

# Launch in browser
./scripts/code-web.sh
```

## The Repository

This repository is a fork of [VS Code (Code - OSS)](https://github.com/microsoft/vscode) extended with multi-agent AI orchestration features. The source code is available under the [MIT license](LICENSE.txt).

## Contributing

There are many ways in which you can participate in this project, for example:

* [Submit bugs and feature requests](https://github.com/microsoft/vscode/issues), and help us verify as they are checked in
* Review [source code changes](https://github.com/microsoft/vscode/pulls)
* Review the [documentation](https://github.com/microsoft/vscode-docs) and make pull requests for anything from typos to additional and new content

If you are interested in fixing issues and contributing directly to the code base,
please see the document [How to Contribute](https://github.com/microsoft/vscode/wiki/How-to-Contribute), which covers the following:

* [How to build and run from source](https://github.com/microsoft/vscode/wiki/How-to-Contribute)
* [The development workflow, including debugging and running tests](https://github.com/microsoft/vscode/wiki/How-to-Contribute#debugging)
* [Coding guidelines](https://github.com/microsoft/vscode/wiki/Coding-Guidelines)
* [Submitting pull requests](https://github.com/microsoft/vscode/wiki/How-to-Contribute#pull-requests)
* [Finding an issue to work on](https://github.com/microsoft/vscode/wiki/How-to-Contribute#where-to-contribute)
* [Contributing to translations](https://aka.ms/vscodeloc)

## Feedback

* Ask a question on [Stack Overflow](https://stackoverflow.com/questions/tagged/vscode)
* [Request a new feature](CONTRIBUTING.md)
* Upvote [popular feature requests](https://github.com/microsoft/vscode/issues?q=is%3Aopen+is%3Aissue+label%3Afeature-request+sort%3Areactions-%2B1-desc)
* [File an issue](https://github.com/microsoft/vscode/issues)
* Connect with the extension author community on [GitHub Discussions](https://github.com/microsoft/vscode-discussions/discussions) or [Slack](https://aka.ms/vscode-dev-community)
* Follow [@code](https://x.com/code) and let us know what you think!

See our [wiki](https://github.com/microsoft/vscode/wiki/Feedback-Channels) for a description of each of these channels and information on some other available community-driven channels.

## Related Projects

Many of the core components and extensions to VS Code live in their own repositories on GitHub. For example, the [node debug adapter](https://github.com/microsoft/vscode-node-debug) and the [mono debug adapter](https://github.com/microsoft/vscode-mono-debug) repositories are separate from each other. For a complete list, please visit the [Related Projects](https://github.com/microsoft/vscode/wiki/Related-Projects) page on our [wiki](https://github.com/microsoft/vscode/wiki).

## Bundled Extensions

VS Code includes a set of built-in extensions located in the [extensions](extensions) folder, including grammars and snippets for many languages. Extensions that provide rich language support (inline suggestions, Go to Definition) for a language have the suffix `language-features`. For example, the `json` extension provides coloring for `JSON` and the `json-language-features` extension provides rich language support for `JSON`.

## Development Container

This repository includes a Visual Studio Code Dev Containers / GitHub Codespaces development container.

* For [Dev Containers](https://aka.ms/vscode-remote/download/containers), use the **Dev Containers: Clone Repository in Container Volume...** command which creates a Docker volume for better disk I/O on macOS and Windows.
  * If you already have VS Code and Docker installed, you can also click [here](https://vscode.dev/redirect?url=vscode://ms-vscode-remote.remote-containers/cloneInVolume?url=https://github.com/microsoft/vscode) to get started. This will cause VS Code to automatically install the Dev Containers extension if needed, clone the source code into a container volume, and spin up a dev container for use.

* For Codespaces, install the [GitHub Codespaces](https://marketplace.visualstudio.com/items?itemName=GitHub.codespaces) extension in VS Code, and use the **Codespaces: Create New Codespace** command.

Docker / the Codespace should have at least **4 Cores and 6 GB of RAM (8 GB recommended)** to run a full build. See the [development container README](.devcontainer/README.md) for more information.

## Code of Conduct

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/). For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

## License

Copyright (c) Microsoft Corporation. All rights reserved.

Licensed under the [MIT](LICENSE.txt) license.

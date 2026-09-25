# JustRide

JustRide is a code editor for Windows, macOS, and Linux, built on top of [`Code - OSS`](https://github.com/microsoft/vscode) — the open-source core of Visual Studio Code — and released under the standard [MIT license](LICENSE.txt).

## The Repository

This repository contains the JustRide source code. It is forked from the `Code - OSS` repository, where Microsoft develops the [Visual Studio Code](https://code.visualstudio.com) product together with the community. The upstream source is available to everyone under the standard [MIT license](https://github.com/microsoft/vscode/blob/main/LICENSE.txt).

## Building and Running

JustRide is built and developed the same way as Code - OSS. See the upstream [development documentation](https://github.com/microsoft/vscode/wiki/How-to-Contribute) for how to build and run from source, including the development workflow, debugging, and running tests.

A development container for working on this repository is included under [.devcontainer](.devcontainer). Docker / the Codespace should have at least **4 cores and 6 GB of RAM (8 GB recommended)** to run a full build. See the [development container README](.devcontainer/README.md) for more information.

## Contributing

Contributions to the upstream editor itself are welcome at [microsoft/vscode](https://github.com/microsoft/vscode). For issues specific to JustRide, use this repository's issue tracker.

## Bundled Extensions

JustRide includes a set of built-in extensions located in the [extensions](extensions) folder, including grammars and snippets for many languages. Extensions that provide rich language support (inline suggestions, Go to Definition) for a language have the suffix `language-features`. For example, the `json` extension provides coloring for `JSON` and the `json-language-features` extension provides rich language support for `JSON`.

## License

Copyright (c) Microsoft Corporation. All rights reserved.

Licensed under the [MIT](LICENSE.txt) license.

# Erdos

[![Feature Requests](https://img.shields.io/github/issues/microsoft/vscode/feature-request.svg)](https://github.com/willnickols/erdos/issues?q=is%3Aopen+is%3Aissue+label%3Afeature-request+sort%3Areactions-%2B1-desc)
[![Bugs](https://img.shields.io/github/issues/microsoft/vscode/bug.svg)](https://github.com/willnickols/erdos/issues?utf8=✓&q=is%3Aissue+is%3Aopen+label%3Abug)
[![Gitter](https://img.shields.io/badge/chat-on%20gitter-yellow.svg)](https://gitter.im/Microsoft/vscode)

## The Repository

This repository is where we develop the Erdos code editor together with the community. Not only do we work on code and issues here, we also publish our roadmap, monthly iteration plans, and our endgame plans. This source code is available to everyone under the standard [MIT license](https://github.com/willnickols/erdos/blob/main/LICENSE.txt).

## Erdos

<p align="center">
  <img alt="Erdos in action" src="https://user-images.githubusercontent.com/35271042/118224532-3842c400-b438-11eb-923d-a5f66fa6785a.png">
</p>

Erdos combines the simplicity of a code editor with what developers need for their core edit-build-debug cycle. It provides comprehensive code editing, navigation, and understanding support along with lightweight debugging, a rich extensibility model, and lightweight integration with existing tools.

Erdos is updated regularly with new features and bug fixes. You can download it for Windows, macOS, and Linux.

## Contributing

There are many ways in which you can participate in this project, for example:

* [Submit bugs and feature requests](https://github.com/willnickols/erdos/issues), and help us verify as they are checked in
* Review [source code changes](https://github.com/willnickols/erdos/pulls)
* Review the documentation and make pull requests for anything from typos to additional and new content

If you are interested in fixing issues and contributing directly to the code base,
please see the document How to Contribute, which covers the following:

* How to build and run from source
* The development workflow, including debugging and running tests
* Coding guidelines
* Submitting pull requests
* Finding an issue to work on
* Contributing to translations

## Feedback

* Ask a question on [Stack Overflow](https://stackoverflow.com/questions/tagged/erdos)
* [Request a new feature](CONTRIBUTING.md)
* Upvote [popular feature requests](https://github.com/willnickols/erdos/issues?q=is%3Aopen+is%3Aissue+label%3Afeature-request+sort%3Areactions-%2B1-desc)
* [File an issue](https://github.com/willnickols/erdos/issues)
* Connect with the extension author community on GitHub Discussions
* Let us know what you think!

See our wiki for a description of each of these channels and information on some other available community-driven channels.

## Related Projects

Many of the core components and extensions to Erdos live in their own repositories on GitHub. For example, the node debug adapter and the mono debug adapter repositories are separate from each other. For a complete list, please visit the Related Projects page on our wiki.

## Bundled Extensions

Erdos includes a set of built-in extensions located in the [extensions](extensions) folder, including grammars and snippets for many languages. Extensions that provide rich language support (code completion, Go to Definition) for a language have the suffix `language-features`. For example, the `json` extension provides coloring for `JSON` and the `json-language-features` extension provides rich language support for `JSON`.

## Development Container

This repository includes a development container.

* For Dev Containers, use the **Dev Containers: Clone Repository in Container Volume...** command which creates a Docker volume for better disk I/O on macOS and Windows.
  * If you already have Erdos and Docker installed, you can get started by cloning the source code into a container volume and spinning up a dev container for use.

* For Codespaces, install the GitHub Codespaces extension in Erdos, and use the **Codespaces: Create New Codespace** command.

Docker / the Codespace should have at least **4 Cores and 6 GB of RAM (8 GB recommended)** to run full build. See the [development container README](.devcontainer/README.md) for more information.

## Code of Conduct

This project has adopted the standard Open Source Code of Conduct. For more information or questions, please contact the maintainers.

## License

Copyright (c) Lotas Inc. All rights reserved.

Licensed under the [MIT](LICENSE.txt) license.

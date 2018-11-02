# Visual Studio Code - Open Source

[![Build Status](https://vscode.visualstudio.com/_apis/public/build/definitions/a4cdce18-a05c-4bb8-9476-5d07e63bfd76/1/badge?branchName=master)](https://aka.ms/vscode-builds)
[![Feature Requests](https://img.shields.io/github/issues/Microsoft/vscode/feature-request.svg)](https://github.com/Microsoft/vscode/issues?q=is%3Aopen+is%3Aissue+label%3Afeature-request+sort%3Areactions-%2B1-desc)
[![Bugs](https://img.shields.io/github/issues/Microsoft/vscode/bug.svg)](https://github.com/Microsoft/vscode/issues?utf8=✓&q=is%3Aissue+is%3Aopen+label%3Abug)
[![Gitter](https://img.shields.io/badge/chat-on%20gitter-yellow.svg)](https://gitter.im/Microsoft/vscode)

[VS Code](https://code.visualstudio.com) is a type of tool that combines the simplicity of
a code editor with what developers need for their core edit-build-debug cycle. It provides comprehensive editing and debugging support, an extensibility model, and lightweight integration with existing tools.

VS Code is updated monthly with new features and bug fixes. You can download it for Windows, macOS, and Linux on [VS Code's website](https://code.visualstudio.com/Download). To get the latest releases every day, you can install the [Insiders version of VS Code](https://code.visualstudio.com/insiders). This builds from the master branch and is updated daily at the very least.

<p align="center">
  <img alt="VS Code in action" src="https://cloud.githubusercontent.com/assets/11839736/16642200/6624dde0-43bd-11e6-8595-c81885ba0dc2.png">
</p>

The [`vscode`](https://github.com/microsoft/vscode) repository is where VS Code is developed and there are many ways you can participate in the project, for example:

* [Submit bugs and feature requests](https://github.com/microsoft/vscode/issues) and help us verify as they are checked in.
* Review [source code changes](https://github.com/microsoft/vscode/pulls).
* Review the [documentation](https://github.com/microsoft/vscode-docs) and make pull requests for anything from typos to new content.

## Contributing

If you are interested in fixing issues and contributing directly to the code base,
please see the document [How to Contribute](https://github.com/Microsoft/vscode/wiki/How-to-Contribute), which covers the following:

* [How to build and run from source](https://github.com/Microsoft/vscode/wiki/How-to-Contribute#build-and-run)
* [The development workflow, including debugging and running tests](https://github.com/Microsoft/vscode/wiki/How-to-Contribute#debugging)
* [Coding Guidelines](https://github.com/Microsoft/vscode/wiki/Coding-Guidelines)
* [Submitting pull requests](https://github.com/Microsoft/vscode/wiki/How-to-Contribute#pull-requests)
* [Contributing to translations](https://aka.ms/vscodeloc)

Please also see our [Code of Conduct](CODE_OF_CONDUCT.md).

## Feedback

* Ask a question on [Stack Overflow](https://stackoverflow.com/questions/tagged/vscode).
* Request a new feature on [GitHub](CONTRIBUTING.md).
* Vote for [Popular Feature Requests](https://github.com/Microsoft/vscode/issues?q=is%3Aopen+is%3Aissue+label%3Afeature-request+sort%3Areactions-%2B1-desc).
* File a bug in [GitHub Issues](https://github.com/Microsoft/vscode/issues).
* [Tweet](https://twitter.com/code) us with any other feedback.

## Related Projects

Many of the core components and extensions to Code live in their own repositories on GitHub. For example, the [node debug adapter](https://github.com/microsoft/vscode-node-debug) and the [mono debug adapter](https://github.com/microsoft/vscode-mono-debug) have their own repositories.

For a complete list, please visit the [Related Projects](https://github.com/Microsoft/vscode/wiki/Related-Projects) page on our [wiki](https://github.com/Microsoft/vscode/wiki).

## Bundled Extensions

Code ships with a set of extensions. These extensions are located in the [extensions](extensions) folder.
These extensions include grammars and snippets for several languages. Extensions that provide rich language support (code completion, go to definition) for a language have the suffix 'language-features'. For example, the 'json' extension provides coloring for JSON and the 'json-language-features' provides rich language support for JSON.

## License

Copyright (c) Microsoft Corporation. All rights reserved.

Licensed under the [MIT](LICENSE.txt) License.

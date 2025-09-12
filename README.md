# CodeMate - AI-Powered Code Editor

🤖 **CodeMate** is an AI-enhanced fork of Visual Studio Code that brings powerful artificial intelligence capabilities directly into your coding workflow. Built on the solid foundation of VSCode, CodeMate adds intelligent features that help you code faster, understand better, and build more efficiently.

## ✨ AI Features

CodeMate includes all the features you love from VSCode, plus these AI-powered enhancements:

### 🧠 **AI Chat Assistant**
- Interactive AI chat interface for code questions and assistance
- Context-aware responses based on your current workspace
- Support for multiple AI providers (OpenAI, Anthropic, Local models)
- Reference files and functions using `@filename` syntax

### ⚡ **Smart Code Completion**
- Multi-line AI-powered code completions
- Context-aware suggestions based on your codebase
- Inline completions that understand your coding patterns
- Support for all major programming languages

### 🔧 **Code Generation & Refactoring**
- Generate code from natural language descriptions
- AI-assisted refactoring with explanations
- Automatic code optimization suggestions
- Smart error detection and fixing

### 📚 **Code Explanation & Documentation**
- Explain complex code sections in plain English
- Generate documentation and comments automatically
- Code analysis and improvement suggestions
- Learning-focused explanations for better understanding

### 📋 Prerequisites
- Node.js 18.x or later
- Python 3.x (for build tools)
- Git

### 🔧 Installation & Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/CodeMate.git
   cd CodeMate
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build CodeMate**
   ```bash
   npm run compile
   ```

4. **Run CodeMate**
   ```bash
   npm run electron
   ```

### ⚙️ AI Configuration

1. Open CodeMate and navigate to the **AI Assistant** panel in the sidebar
2. Go to **AI Settings** tab
3. Configure your AI provider:
   - **OpenAI**: Add your API key and select model (gpt-4, gpt-3.5-turbo)
   - **Anthropic**: Add your API key and select Claude model
   - **Local**: Configure your local AI server endpoint

4. Test the connection and start coding with AI assistance!

## 🎯 Key Features Comparison

| Feature | VSCode | CodeMate |
|---------|--------|----------|
| Code Editing | ✅ | ✅ |
| Extensions | ✅ | ✅ |
| Debugging | ✅ | ✅ |
| AI Chat | ❌ | ✅ |
| AI Completion | ❌ | ✅ |
| Code Generation | ❌ | ✅ |
| AI Refactoring | ❌ | ✅ |
| Code Explanation | ❌ | ✅ |

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
* Follow [@code](https://twitter.com/code) and let us know what you think!

See our [wiki](https://github.com/microsoft/vscode/wiki/Feedback-Channels) for a description of each of these channels and information on some other available community-driven channels.

## Related Projects

Many of the core components and extensions to VS Code live in their own repositories on GitHub. For example, the [node debug adapter](https://github.com/microsoft/vscode-node-debug) and the [mono debug adapter](https://github.com/microsoft/vscode-mono-debug) repositories are separate from each other. For a complete list, please visit the [Related Projects](https://github.com/microsoft/vscode/wiki/Related-Projects) page on our [wiki](https://github.com/microsoft/vscode/wiki).

## Bundled Extensions

VS Code includes a set of built-in extensions located in the [extensions](extensions) folder, including grammars and snippets for many languages. Extensions that provide rich language support (code completion, Go to Definition) for a language have the suffix `language-features`. For example, the `json` extension provides coloring for `JSON` and the `json-language-features` extension provides rich language support for `JSON`.

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

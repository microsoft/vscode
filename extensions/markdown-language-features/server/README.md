# Markdown Language Server

> **❗ Import** This is still in development. While the language server is being used by VS Code, it has not yet been tested with other clients.

The Markdown language server powers VS Code's built-in markdown support, providing tools for writing and browsing Markdown files. It runs as a separate executable and implements the [language server protocol](https://microsoft.github.io/language-server-protocol/overview).

This server uses the [Markdown Language Service](https://github.com/microsoft/vscode-markdown-languageservice) to implement almost all of the language features. You can use that library if you need a library for working with Markdown instead of a full language server.


## Server capabilities

- [Completions](https://microsoft.github.io/language-server-protocol/specification#textDocument_completion) for Markdown links.

- [Folding](https://microsoft.github.io/language-server-protocol/specification#textDocument_foldingRange) of Markdown regions, block elements, and header sections.

- [Smart selection](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_selectionRange) for inline elements, block elements, and header sections.

- [Document Symbols](https://microsoft.github.io/language-server-protocol/specification#textDocument_documentSymbol) for quick navigation to headers in a document.

- [Workspace Symbols](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#workspace_symbol) for quick navigation to headers in the workspace

- [Document links](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_documentLink) for making Markdown links in a document clickable.

- [Find all references](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_references) to headers and links across all Markdown files in the workspace.

- [Go to definition](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_definition) from links to headers or link definitions.

- [Rename](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_rename) of headers and links across all Markdown files in the workspace.

- Find all references to a file. Uses a custom `markdown/getReferencesToFileInWorkspace` message.

- [Code Actions](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_codeAction)

	- Organize link definitions source action.
	- Extract link to definition refactoring.

- (experimental) Updating links when a file is moved / renamed. Uses a custom `markdown/getEditForFileRenames` message.

- (experimental) [Pull diagnostics (validation)](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_pullDiagnostics) for links.


## Client requirements

### Initialization options

The client can send the following initialization options to the server:

- `markdownFileExtensions` Array file extensions that should be considered as Markdown. These should not include the leading `.`. For example: `['md', 'mdown', 'markdown']`.

### Settings

Clients may send a `workspace/didChangeConfiguration` notification to notify the server of settings changes.
The server supports the following settings:

- `markdown`
	- `suggest`
		- `paths`
			- `enabled` — Enable/disable path suggestions.
	- `experimental`
		- `validate`
			- `enabled` — Enable/disable all validation.
			- `referenceLinks`
				- `enabled` — Enable/disable validation of reference links: `[text][ref]`
			- `fragmentLinks`
				- `enabled` — Enable/disable validation of links to fragments in the current files: `[text](#head)`
			- `fileLinks`
				- `enabled` — Enable/disable validation of links to file in the workspace.
				- `markdownFragmentLinks` — Enable/disable validation of links to headers in other Markdown files.
			- `ignoreLinks` — Array of glob patterns for files that should not be validated.

### Custom requests

To support all of the features of the language server, the client needs to implement a few custom request types. The definitions of these request types can be found in [`protocol.ts`](./src/protocol.ts)

#### `markdown/parse`

Get the tokens for a Markdown file. Clients are expected to use [Markdown-it](https://github.com/markdown-it/markdown-it) for this.

We require that clients bring their own version of Markdown-it so that they can customize/extend Markdown-it.

#### `markdown/fs/readFile`

Read the contents of a file in the workspace.

#### `markdown/fs/readDirectory`

Read the contents of a directory in the workspace.

#### `markdown/fs/stat`

Check if a given file/directory exists in the workspace.

#### `markdown/fs/watcher/create`

Create a file watcher. This is needed for diagnostics support.

#### `markdown/fs/watcher/delete`

Delete a previously created file watcher.

#### `markdown/findMarkdownFilesInWorkspace`

Get a list of all markdown files in the workspace.


## Contribute

The source code of the Markdown language server can be found in the [VSCode repository](https://github.com/microsoft/vscode) at [extensions/markdown-language-features/server](https://github.com/microsoft/vscode/tree/master/extensions/markdown-language-features/server).

File issues and pull requests in the [VSCode GitHub Issues](https://github.com/microsoft/vscode/issues). See the document [How to Contribute](https://github.com/microsoft/vscode/wiki/How-to-Contribute) on how to build and run from source.

Most of the functionality of the server is located in libraries:

- [vscode-markdown-languageservice](https://github.com/microsoft/vscode-markdown-languageservice) contains the implementation of all features as a reusable library.
- [vscode-languageserver-node](https://github.com/microsoft/vscode-languageserver-node) contains the implementation of language server for NodeJS.

Help on any of these projects is very welcome.

## Code of Conduct

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/). For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

## License

Copyright (c) Microsoft Corporation. All rights reserved.

Licensed under the [MIT](https://github.com/microsoft/vscode/blob/master/LICENSE.txt) License.


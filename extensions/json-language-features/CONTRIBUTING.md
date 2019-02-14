## Setup

- Clone [Microsoft/vscode](https://github.com/microsoft/vscode)
- Run `yarn` at `/`, this will install
	- Dependencies for `/extension/json-language-features/`
	- Dependencies for `/extension/json-language-features/server/`
	- devDependencies such as `gulp`
- Open `/extensions/json-language-features/` as the workspace in VS Code
- Run the [`Launch Extension`](https://github.com/Microsoft/vscode/blob/master/extensions/json-language-features/.vscode/launch.json) debug target in the Debug View. This will:
	- Launch the `preLaunchTask` task to compile the extension
	- Launch a new VS Code instance with the `json-language-features` extension loaded
	- You should see a notification saying the development version of `json-language-features` overwrites the bundled version of `json-language-features`
	- Open a `.json` file to activate the extension. The extension will start a JSON language server process.
	- You can debug the language server process by using `Attach to Node Process` command in the first VS Code window.
- Test the behavior of this extension by editing json files
- Run `Reload Window` command in the launched instance to reload the extension

### Contribute to vscode-json-languageservice

[Microsoft/vscode-json-languageservice](https://github.com/Microsoft/vscode-json-languageservice) contains the language smarts for json.
This extension wraps the json language service into a Language Server for VS Code.
If you want to fix json issues or make improvements, you should make changes at [Microsoft/vscode-json-languageservice](https://github.com/Microsoft/vscode-json-languageservice).

However, within this extension, you can run a development version of `vscode-json-languageservice` to debug code or test language features interactively:

#### Linking `vscode-json-languageservice` in `json-language-features/server/`

- Clone [Microsoft/vscode-json-languageservice](https://github.com/Microsoft/vscode-json-languageservice)
- Run `yarn` in `vscode-json-languageservice`
- Run `yarn link` in `vscode-json-languageservice`. This will compile and link `vscode-json-languageservice`
- In `json-language-features/server/`, run `npm link vscode-json-languageservice`

#### Testing the development version of `vscode-json-languageservice`

- Open both `vscode-json-languageservice` and this extension in a single workspace with [multi-root workspace](https://code.visualstudio.com/docs/editor/multi-root-workspaces) feature
- Run `yarn watch` at `json-languagefeatures/server/` to recompile this extension with the linked version of `vscode-json-languageservice`
- Make some changes in `vscode-json-languageservice`
- Now when you run `Launch Extension` debug target, the launched instance will use your development version of `vscode-json-languageservice`. You can interactively test the language features.
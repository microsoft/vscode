## Setup

- Clone [microsoft/vscode](https://github.com/microsoft/vscode)
- Run `yarn` at `/`, this will install
	- Dependencies for `/extension/html-language-features/`
	- Dependencies for `/extension/html-language-features/server/`
	- devDependencies such as `gulp`
- Open `/extensions/html-language-features/` as the workspace in VS Code
- Run the [`Launch Extension`](https://github.com/microsoft/vscode/blob/master/extensions/html-language-features/.vscode/launch.json) debug target in the Debug View. This will:
	- Launch the `preLaunchTask` task to compile the extension
	- Launch a new VS Code instance with the `html-language-features` extension loaded
	- You should see a notification saying the development version of `html-language-features` overwrites the bundled version of `html-language-features`
- Test the behavior of this extension by editing html files
- Run `Reload Window` command in the launched instance to reload the extension

### Contribute to vscode-html-languageservice

[microsoft/vscode-html-languageservice](https://github.com/microsoft/vscode-html-languageservice) contains the language smarts for html.
This extension wraps the html language service into a Language Server for VS Code.
If you want to fix html issues or make improvements, you should make changes at [microsoft/vscode-html-languageservice](https://github.com/microsoft/vscode-html-languageservice).

However, within this extension, you can run a development version of `vscode-html-languageservice` to debug code or test language features interactively:

#### Linking `vscode-html-languageservice` in `html-language-features/server/`

- Clone [microsoft/vscode-html-languageservice](https://github.com/microsoft/vscode-html-languageservice)
- Run `yarn` in `vscode-html-languageservice`
- Run `yarn link` in `vscode-html-languageservice`. This will compile and link `vscode-html-languageservice`
- In `html-language-features/server/`, run `npm link vscode-html-languageservice`

#### Testing the development version of `vscode-html-languageservice`

- Open both `vscode-html-languageservice` and this extension in a single workspace with [multi-root workspace](https://code.visualstudio.com/docs/editor/multi-root-workspaces) feature
- Run `yarn watch` at `html-languagefeatures/server/` to recompile this extension with the linked version of `vscode-html-languageservice`
- Make some changes in `vscode-html-languageservice`
- Now when you run `Launch Extension` debug target, the launched instance will use your development version of `vscode-html-languageservice`. You can interactively test the language features.
- You can also run the `Debug Extension and Language Server` debug target, which will launch the extension and attach the debugger to the language server. After successful attach, you should be able to hit breakpoints in both `vscode-html-languageservice` and `html-language-features/server/`

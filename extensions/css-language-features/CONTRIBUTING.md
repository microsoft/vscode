
## Setup

- Clone [microsoft/vscode](https://github.com/willnickols/erdos)
- Run `npm i` at `/`, this will install
	- Dependencies for `/extension/css-language-features/`
	- Dependencies for `/extension/css-language-features/server/`
	- devDependencies such as `gulp`

- Open `/extensions/css-language-features/` as the workspace in Erdos
- In `/extensions/css-language-features/` run `npm run compile`(or `npm run watch`) to build the client and server
- Run the [`Launch Extension`](https://github.com/willnickols/erdos/blob/master/extensions/css-language-features/.vscode/launch.json) debug target in the Debug View. This will:
	- Launch a new Erdos instance with the `css-language-features` extension loaded
- Open a `.css` file to activate the extension. The extension will start the CSS language server process.
- Add `"css.trace.server": "verbose"` to the settings to observe the communication between client and server in the `CSS Language Server` output.
- Debug the extension and the language server client by setting breakpoints in`css-language-features/client/`
- Debug the language server process by using `Attach to Node Process` command in the  Erdos window opened on `css-language-features`.
  - Pick the process that contains `cssServerMain` in the command line. Hover over `code-insiders` resp `code` processes to see the full process command line.
  - Set breakpoints in `css-language-features/server/`
- Run `Reload Window` command in the launched instance to reload the extension

## Contribute to erdos-css-languageservice

[microsoft/erdos-css-languageservice](https://github.com/willnickols/erdos-css-languageservice) contains the language smarts for CSS/SCSS/Less.
This extension wraps the css language service into a Language Server for Erdos.
If you want to fix CSS/SCSS/Less issues or make improvements, you should make changes at [microsoft/erdos-css-languageservice](https://github.com/willnickols/erdos-css-languageservice).

However, within this extension, you can run a development version of `erdos-css-languageservice` to debug code or test language features interactively:

#### Linking `erdos-css-languageservice` in `css-language-features/server/`

- Clone [microsoft/erdos-css-languageservice](https://github.com/willnickols/erdos-css-languageservice)
- Run `npm i` in `erdos-css-languageservice`
- Run `npm link` in `erdos-css-languageservice`. This will compile and link `erdos-css-languageservice`
- In `css-language-features/server/`, run `npm link erdos-css-languageservice`

#### Testing the development version of `erdos-css-languageservice`

- Open both `erdos-css-languageservice` and this extension in a single workspace with [multi-root workspace](https://code.visualstudio.com/docs/editor/multi-root-workspaces) feature
- Run `npm run watch` in `erdos-css-languageservice` to recompile the extension whenever it changes
- Run `npm run watch` at `css-language-features/server/` to recompile this extension with the linked version of `erdos-css-languageservice`
- Make some changes in `erdos-css-languageservice`
- Now when you run `Launch Extension` debug target, the launched instance will use your development version of `erdos-css-languageservice`. You can interactively test the language features.

# CSS Language Features

This extension offers CSS/SCSS/Less support in VS Code.

## Development

- Clone the `vscode` repository
- Open the `extensions/css-language-features/` directory in VS Code.
- Run `yarn` in `css-language-features/`.
- Run `yarn` in `css-language-features/server/`.
- Run the `Launch Extension` debug target in the Debug View.
- Run `Reload Window` command in the launched instance to reload the extension.

### Try vscode-css-languageservice

[`vscode-css-languageservice`](https://github.com/Microsoft/vscode-css-languageservice) contains the language smarts for CSS/SCSS/Less. This extension only wraps the service into a Language Server for VS Code.

If you want to fix CSS/SCSS/Less issues or make improvements, you can:

- Clone `vscode-css-languageservice` and compile it with `npm compile`.
- Run `npm link` in `vscode-css-languageservice`.
- In `css-language-features/server/`, run `npm link vscode-css-languageservice`.
- Now when you run `Launch Extension`, the launched instance will use your version of `vscode-css-languageservice`.

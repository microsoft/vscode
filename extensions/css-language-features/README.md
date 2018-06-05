# CSS Language Features

This extension offers CSS/SCSS/Less support in VS Code.

## Development

- `yarn`
- `yarn` at `/server`
- Run the `Launch Extension` target
- Run `Reload Window` command in the launched instance to reload the extension

### Try vscode-css-languageservice

[`vscode-css-languageservice`](https://github.com/Microsoft/vscode-css-languageservice) contains the language smarts for CSS/SCSS/Less. This extension only wraps the service into a Language Server for VS Code.

If you want to fix CSS/SCSS/Less issues or make improvements, you can:

- Clone `vscode-css-languageservice` and compile it
- Run `npm link` in `vscode-css-languageservice`
- In extension, run `npm link vscode-css-languageservice` in `/server`
- Now when you run `Launch Extension`, the launched instance will use your version of `vscode-css-languageservice`.
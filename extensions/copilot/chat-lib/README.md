# @vscode/chat-lib

Chat SDK extracted from VS Code Copilot Chat.

## Installation

```bash
npm install @vscode/chat-lib
```

## Development

After running `npm run extract-chat-lib` from the Copilot extension directory, run `npm ci`, `npm run build`, and `npm test` in this directory. Validate without ancestor `node_modules` directories, as the chat-lib CI job does, so the extension's dependencies cannot mask missing package dependencies.

Runtime dependencies used by extracted sources must be declared in this package's [package.json](./package.json) as well as the extension's manifest. The extractor synchronizes versions of already-declared dependencies; it does not add newly imported packages.

## License

MIT
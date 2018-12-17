The file `JavaScript.tmLanguage.json` is derived from [TypeScriptReact.tmLanguage](https://github.com/Microsoft/TypeScript-TmLanguage/blob/master/TypeScriptReact.tmLanguage).

To update to the latest version:
- `cd extensions/typescript` and run `npm run update-grammars`
- don't forget to run the integration tests at `./scripts/test-integration.sh`

The script does the following changes:
- fileTypes .tsx -> .js & .jsx
- scopeName scope.tsx -> scope.js
- update all rule names .tsx -> .js

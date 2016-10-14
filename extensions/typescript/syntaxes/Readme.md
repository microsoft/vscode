The file `TypeScript.tmLanguage.json` and `TypeScriptReact.tmLanguage.json` are derived from [TypeScript.tmLanguage](https://github.com/Microsoft/TypeScript-TmLanguage/blob/master/TypeScript.tmLanguage) and [TypeScriptReact.tmLanguage](https://github.com/Microsoft/TypeScript-TmLanguage/blob/master/TypeScriptReact.tmLanguage).

To update to the latest version:
- `cd extensions/typescript` and run `npm run update-grammars`
- don't forget to run the integration tests at `./scripts/test-integration.sh`

Migration notes and todos:

- differentiate variable and function declarations from references
  - functions now use 'entity.function.name'.
     - My understanding of the textmate spec is that entity should be used for declarations, but other JS grammars also use it for references
	 - I suggest we use a new scope segment 'reference' to sigmal a reference and 'declaration' for a declaration.
  - variables use 'variable' through ot which is common practice
    - I suggest we use a new scope segment 'reference' to sigmal a reference and 'declaration' for a declaration.

- return.type -> return-type
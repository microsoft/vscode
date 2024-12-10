The file `TypeScript.tmLanguage.json` and `TypeScriptReact.tmLanguage.json` are derived from [TypeScript.tmLanguage](https://github.com/microsoft/TypeScript-TmLanguage/blob/master/TypeScript.tmLanguage) and [TypeScriptReact.tmLanguage](https://github.com/microsoft/TypeScript-TmLanguage/blob/master/TypeScriptReact.tmLanguage).

To update to the latest version:

- `cd extensions/typescript` and run `npm run update-grammars`
- don't forget to run the integration tests at `./scripts/test-integration.sh`

Migration notes and todos:

- differentiate variable and function declarations from references
  - I suggest we use a new scope segment 'function-call' to signal a function reference, and 'definition' to the declaration. An alternative is to use 'support.function' everywhere.
  - I suggest we use a new scope segment 'definition' to the variable declarations. Haven't yet found a scope for references that other grammars use.

- rename scope to return.type to return-type, which is already used in other grammars
- rename entity.name.class to entity.name.type.class which is used in all other grammars I've seen

- do we really want to have the list of all the 'library' types (Math, Dom...). It adds a lot of size to the grammar, lots of special rules and is not really correct as it depends on the JavaScript runtime which types are present.

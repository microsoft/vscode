# Custom ESLint rules

We use a set of custom [ESLint](http://eslint.org) to enforce repo specific coding rules and styles. These custom rules are run in addition to many standard ESLint rules we enable in the project. Some example custom rules includes:

- Enforcing proper code layering
- Preventing checking in of `test.only(...)`
- Enforcing conventions in `vscode.d.ts`

Custom rules are mostly used for enforcing or banning certain coding patterns. We tend to leave stylistic choices up to area owners unless there's a good reason to enforce something project wide.

This doc provides a brief overview of how these rules are setup and how you can add a new one.

# Resources
- [ESLint rules](https://eslint.org/docs/latest/extend/custom-rules) — General documentation about writing eslint rules
- [TypeScript ASTs and eslint](https://typescript-eslint.io/blog/asts-and-typescript-eslint/) — Look at how ESLint works with TS programs
- [ESTree selectors](https://eslint.org/docs/latest/extend/selectors)  — Info about the selector syntax rules use to target specific nodes in an AST. Works similarly to css selectors.
- [TypeScript ESLint playground](https://typescript-eslint.io/play/#showAST=es) — Useful tool for figuring out the structure of TS programs and debugging custom rule selectors


# Custom Rule Configuration

Custom rules are defined in the `.eslint-plugin-local` folder. Each rule is defined in its own TypeScript file. These follow the naming convention:

- `code-RULE-NAME.ts` — General rules that apply to the entire repo.
- `vscode-dts-RULE-NAME.ts` — Rules that apply just to `vscode.d.ts`.

These rules are then enabled in the `eslint.config.js` file. This is the main eslint configuration for our repo. It defines a set of file scopes which rules should apply to files in those scopes.

For example, here's a configuration that enables the no `test.only` rule in all `*.test.ts` files in the VS Code repo:

```ts
{
    // Define which files these rules apply to
    files: [
        '**/*.test.ts'
    ],
    languageOptions: { parser: tseslint.parser, },
    plugins: {
        'local': pluginLocal,
    },
    rules: {
         // Enable the rule from .eslint-plugin-local/code-no-test-only.ts
        'local/code-no-test-only': 'error',
    }
}
```

# Creating a new custom rule
This walks through the steps to create a new eslint rule:

1. Create a new rule file under `.eslint-plugin-local`. Generally you should call it `code-YOUR-RULE-NAME.ts`, for example, `.eslint-plugin-local/code-no-not-null-assertions-on-undefined-values.ts`

2. In this file, add the rule. Here's a template:

    ```ts
    /*---------------------------------------------------------------------------------------------
    *  Copyright (c) Microsoft Corporation. All rights reserved.
    *  Licensed under the MIT License. See License.txt in the project root for license information.
    *--------------------------------------------------------------------------------------------*/

    import * as eslint from 'eslint';

    export = new class YourRuleName implements eslint.Rule.RuleModule {

        readonly meta: eslint.Rule.RuleMetaData = {
            messages: {
                customMessageName: 'message text shown in errors/warnings',
            },
            schema: false,
        };

        create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {
            return {
                [SELECTOR]: (node: any) => {
                    // Report errors if needed
                    return context.report({
                        node,
                        messageId: 'customMessageName'
                    });
                }
            };
        }
    };
    ```

    - Update the name of the class to match the name of your rule
    - Add message entries for any errors you want to report
    - Update `SELECTOR` with the [ESTree selector](https://eslint.org/docs/latest/extend/selectors) needed to target the nodes you are interested in. Use the [TypeScript ESLint playground](https://typescript-eslint.io/play/#showAST=es) to figure out which nodes you need and debug selectors

3. Register the rule in `eslint.config.js`

    Generally this is just turning on the rule in the rule list like so:

    ```js
    rules: {
         // Name should match file name
	'local/code-no-not-null-assertions-on-undefined-values': 'warn',
        ...
    }
    ```

Rules can also take custom arguments. For example, here's how we can pass arguments to a custom rule in the `eslint.config.js`:

```
rules: {
    'local/code-no-not-null-assertions-on-undefined-values': ['warn', { testsOk: true }],
    ...
}
```

In these cases make sure to update the `meta.schema` property on your rule with the JSON schema for the arguments. You can access these arguments using `context.options` in the rule `create` function


## Adding fixes to custom rules
Fixes are a useful way to mechanically fix basic linting issues, such as auto inserting semicolons. These fixes typically work at the AST level, so they are a more reliable way to perform bulk fixes compared to find/replaces.

To add a fix for a custom rule:

1. On the `meta` for your rule, add `fixable: 'code'`

2. When reporting an error in the rule, also include a `fix`. This is a function that takes a `fixer` argument and returns one or more fixes.

See the [Double quoted to single quoted string covert fix](https://github.com/microsoft/vscode/blob/b074375e1884ae01033967bf0bbceeaa4795354a/.eslint-plugin-local/code-no-unexternalized-strings.ts#L128) for an example. The ESLint docs also have [details on adding fixes and the fixer api](https://eslint.org/docs/latest/extend/custom-rules#applying-fixes)

The fixes can be run using `npx eslint --fix` in the VS Code repo

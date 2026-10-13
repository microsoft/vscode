
# vscode-dts

This is the place for the stable API and for API proposals.

## Consume a proposal

1. find a proposal you are interested in
1. add its name to your extensions `package.json#enabledApiProposals` property
1. run `npx vscode-dts dev` to download the `d.ts` files into your project
1. don't forget that extension using proposed API cannot be published
1. learn more here: <https://code.visualstudio.com/api/advanced-topics/using-proposed-api>

## Add a new proposal

1. create a _new_ file in this directory, its name must follow this pattern `vscode.proposed.[a-zA-Z]+.d.ts`
1. creating the proposal-file will automatically update `src/vs/platform/extensions/common/extensionsApiProposals.ts` (make sure to run `npm run watch`)
1. declare and implement your proposal
1. make sure to use the `checkProposedApiEnabled` and/or `isProposedApiEnabled`-utils to enforce the API being proposed. Make sure to invoke them with your proposal's name which got generated into `extensionsApiProposals.ts`
1. Most likely will need to add your proposed api to vscode-api-tests as well

## Keep the proposal registry in sync

After adding, removing, or renaming a proposal, include the updated
[API proposal registry](../vs/platform/extensions/common/extensionsApiProposals.ts) with your change.
Developer compilation, `npm run watch`, and `npm run build-fast` regenerate it automatically.
To regenerate it explicitly from the repository root, run:

```sh
npm run gulp compile-api-proposal-names
```

To check it without changing any source files, run:

```sh
npm run gulp check-api-proposal-names
```

Production and PR CI run this check as the first step of `core-ci`, before type-checking,
transpilation, and bundling. Unlike the legacy production regeneration step, this check
fails on a stale or missing registry rather than repairing it. It reuses the generator
to compare the complete generated contents, allowing both LF and CRLF line endings.

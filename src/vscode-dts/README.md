
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
1. creating the proposal-file will automatically update `src/vs/workbench/services/extensions/common/extensionsApiProposals.ts` (make sure to run `yarn watch`)
1. declare and implement your proposal
1. make sure to use the `checkProposedApiEnabled` and/or `isProposedApiEnabled`-utils to enforce the API being proposed. Make sure to invoke them with your proposal's name which got generated into `extensionsApiProposals.ts`
1. Most likely will need to add your proposed api to vscode-api-tests as well

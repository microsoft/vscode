# Contributing to GitHub Copilot Chat

* [Creating good issues](#creating-good-issues)
  * [Look For an Existing Issue](#look-for-an-existing-issue)
    * [Writing Good Bug Reports and Feature Requests](#writing-good-bug-reports-and-feature-requests)
* [Developing](#developing)
  * [Requirements](#requirements)
    * [First-time setup](#first-time-setup)
    * [Testing](#testing)
    * [Use base/common utils](#use-basecommon-utils)
  * [Developing Prompts](#developing-prompts)
    * [Motivations for TSX prompt crafting](#motivations-for-tsx-prompt-crafting)
    * [Quickstart](#quickstart)
  * [Code structure](#code-structure)
    * [Project Architecture and Coding Standards](#project-architecture-and-coding-standards)
    * [Layers](#layers)
    * [Runtimes (node.js, web worker)](#runtimes-nodejs-web-worker)
    * [Contributions and Services](#contributions-and-services)
  * [Agent mode](#agent-mode)
  * [Tools](#tools)
    * [Developing tools](#developing-tools)
  * [Tree Sitter](#tree-sitter)
  * [Troubleshooting](#troubleshooting)
    * [Reading requests](#reading-requests)
  * [API updates](#api-updates)
    * [Making breaking changes to API](#making-breaking-changes-to-api)
    * [Making additive changes to API](#making-additive-changes-to-api)
  * [Running with Code OSS](#running-with-code-oss)

# Creating good issues

## Look For an Existing Issue

Before you create a new issue, please do a search in [open issues](https://github.com/microsoft/vscode/issues) to see if the issue or feature request has already been filed.

Be sure to scan through the [most popular](https://github.com/microsoft/vscode/issues?q=is%3Aopen+is%3Aissue+label%3Afeature-request+sort%3Areactions-%2B1-desc) feature requests.

If you find your issue already exists, make relevant comments and add your [reaction](https://github.com/blog/2119-add-reactions-to-pull-requests-issues-and-comments). Use a reaction in place of a "+1" comment:

* 👍 - upvote
* 👎 - downvote

If you cannot find an existing issue that describes your bug or feature, create a new issue using the guidelines below.

### Writing Good Bug Reports and Feature Requests

File a single issue per problem and feature request. Do not enumerate multiple bugs or feature requests in the same issue.

Do not add your issue as a comment to an existing issue unless it's for the identical input. Many issues look similar but have different causes.

The more information you can provide, the more likely someone will be successful at reproducing the issue and finding a fix.

The built-in tool for reporting an issue, which you can access by using `Report Issue` in VS Code's Help menu, can help streamline this process by automatically providing the version of VS Code, all your installed extensions, and your system info. Additionally, the tool will search among existing issues to see if a similar issue already exists.

Please include the following with each issue:

* Version of VS Code and copilot-chat extension
* Your operating system
* The LLM model if applicable
* Reproducible steps (1... 2... 3...) that cause the issue
* What you expected to see, versus what you actually saw
* Images, animations, or a link to a video showing the issue occurring
* A code snippet or prompt that demonstrates the issue or a link to a code repository the developers can easily pull down to recreate the issue locally
  * **Note:** Because the developers need to copy and paste the code snippet, including a code snippet as a media file (i.e. .gif) is not sufficient.
* Errors from the Dev Tools Console (open from the menu: Help > Toggle Developer Tools)

# Developing

## Requirements
- Node 22.x
- Python >= 3.10, <= 3.12
- Git Large File Storage (LFS) - for running tests
- (Windows) Visual Studio Build Tools >=2019 - for building with node-gyp [see node-gyp docs](https://github.com/nodejs/node-gyp?tab=readme-ov-file#on-windows)

### First-time setup
- On Windows you need to run `Set-ExecutionPolicy Unrestricted` as admin in Powershell.
- `npm install`
- `npm run get_token`
- Then you can run the build task with `Cmd+Shift+B` (or `Ctrl+Shift+B` if you are on Windows), or just start the "Launch Copilot Extension - Watch Mode" launch config to start the build then start debugging the extension.

**Tip:** If "Launch Copilot Extension - Watch Mode" doesn't work for you, try using the "Launch Copilot Extension" debug configuration instead.

**Note:** Setup and running under Windows Subsystem for Linux (WSL) is supported by following the [VS Code setup instructions](https://github.com/microsoft/vscode/wiki/Selfhosting-on-Windows-WSL).

### Testing
If you hit errors while running tests, ensure that you are using the correct Node version and that git lfs is properly installed (run `git lfs pull` to validate).

There are unit tests which run in Node.JS:

```
npm run test:unit
```

There are also integration tests that run within VS Code itself:

```
npm run test:extension
```

Finally, there are **simulation tests**. These tests reach out to Copilot API endpoints, invoke LLMs and require expensive computations to run. Each test runs 10 times, to accommodate for the stochastic nature of LLMs themselves. The results of all runs of all tests are snapshotted in the baseline file, [`test/simulation/baseline.json`](test/simulation/baseline.json), which encodes the quality of the test suite at any given point in time.

Because LLM results are both random and costly, they are cached within the repo in `test/simulation/cache`. This means rerunning the simulation tests and benefiting from the cache will make the test run be both faster as well as deterministic.

You can run the simulation tests with:

```
npm run simulate
```

Keep in mind that PRs will fail unless the cache is populated. Running the command above will populate the cache by creating new cache layers in `test/simulation/cache/layers`. This cache population must be done by VS Code team members. If a community member submits a PR with new cache layer(s), the PR will fail and a VS Code team member must delete the layer(s) and recreate them within their dev box.

You can ensure the cache is populated with:

```
npm run simulate-require-cache
```

Finally, the PR will also fail with any uncommitted baseline changes. If you do see change test results locally, and would like to accept the new baseline for the simulation tests, you should update the baseline and include that change in your commit:

```
npm run simulate-update-baseline
```

### Use `base/common` utils

We like and miss our utilities from the 'microsoft/vscode' repo, esp those from base/common, like async.ts, strings.ts, map.ts etc pp. Instead of copying them manually and maintaining them in here, we can use them from the vscode repo. To do so, there is a the `script/setup/copySources.ts` script. Towards the end you'll find a list of modules that are copied from the vscode repo. If you need a module from vscode, add it to the list and run `npx tsx script/setup/copySources.ts`. Have this repo as sibling to the vscode repo and it will copy the modules from the vscode repo into `src/util/vs`. Note that the `src/util/vs` folder is marked as readonly and that changes to the copied sources should be carried out in the vscode repo.

## Developing Prompts

We have developed a TSX-based framework for composing prompts. This section describes the problems it solves and how to use it.

### Motivations for TSX prompt crafting
* Enable dynamic composition of OpenAI API request messages with respect to the token budget.
   * Prompts are bare strings, which makes them hard to edit once they are composed via string concatenation. Instead, with TSX prompting, messages are represented as a tree of TSX components. Each node in the tree has a `priority` that is conceptually similar to a `zIndex` (higher number == higher priority). If an intent declares more messages than can fit into the token budget, the prompt renderer prunes messages with the lowest priority from the `ChatMessage` array that is eventually sent to the Copilot API, preserving the order in which they were declared.
   * This also makes it easier to eventually support more sophisticated prompt management techniques, e.g. experimenting on variants of a prompt, or that a prompt part makes itself smaller with a Copilot API request to recursively summarize its children.
* Make prompt crafting transparent to the owner of each LLM-based feature/intent while still enabling reuse of common prompt elements like safety rules.
   * Your intent owns and fully controls the `System`, `User` and `Assistant` messages that are sent to the Copilot API. This allows greater control and visibility into the safety rules, prompt context kinds, and conversation history that are sent for each feature.

### Quickstart
- First define a root TSX prompt component extending [`PromptElement`]. The simplest prompt element implements a synchronous `render` method which returns the chat messages it wants to send to the Copilot API. For example:

   ```ts
   interface CatPromptProps extends BasePromptElementProps {
      query: string;
   }

   export class CatPrompt extends PromptElement<CatPromptProps, void> {
      render() {
         return (
            <>
               <SystemMessage>
                  Respond to all messages as if you were a cat.
               </SystemMessage>
               <UserMessage>
                  {this.props.query}
               </UserMessage>
            </>
         );
      }
   }
   ```

- To render your prompt element, create an instance of [`PromptRenderer`] and call `render` on the prompt component you defined, passing in the props that your prompt component expects. `PromptRenderer` produces an array of system, user, and assistant messages which are suitable for sending to the Copilot API via the `ChatMLFetcher`. See this [OpenAI guide](https://platform.openai.com/docs/guides/prompt-engineering/six-strategies-for-getting-better-results) for some strategies to get good results.

   ```ts
   class CatIntentInvocation implements IIntentInvocation {
      constructor(private readonly accessor: ServicesAccessor, private readonly endpoint: IChatEndpoint, ) {}

      async buildPrompt({ query }: IBuildPromptContext, progress: vscode.Progress<vscode.ChatResponseProgressPart | vscode.ChatResponseReferencePart>, token: vscode.CancellationToken): Promise<RenderPromptResult> {
         // Render the `CatPrompt` prompt element
		   const renderer = new PromptRenderer(this.accessor, this.endpoint, CatPrompt, { query });

         return renderer.render(progress, token);
      }
   }
   ```
- Prompt elements can return other prompt elements which will all be rendered by the prompt renderer. For example, your prompt may benefit from reusing the following utility components:
   - `SystemMessage`, `UserMessage` and `AssistantMessage`: Text within these components will be converted to the system, user and assistant message types from the OpenAI API.
   - `SafetyRules`: This should usually be included in a `SystemMessage` to ensure that your feature is compliant with Responsible AI guidelines.
- If your prompt does asynchronous work e.g. VS Code extension API calls or additional requests to the Copilot API for chunk reranking, you can precompute this state in an optional async `prepare` method. `prepare` is called before `render` and the prepared state will be passed back to your prompt component's sync `render` method.

Please note:
* Newlines are not preserved in string literals when rendered, and must be explicitly declared with the builtin `<br />` attribute.
* For now, if two prompt messages _with the same priority_ are up for eviction due to exceeding the token budget, it is not possible for a subtree of the prompt message declared before to evict a subtree of the prompt message declared later.

## Code structure

### Project Architecture and Coding Standards

For comprehensive information about the project architecture, coding standards, and development guidelines, please refer to the [Copilot Instructions](.github/copilot-instructions.md). This document includes:

* **Project Overview**: Key features, tech stack, and capabilities
* **Architecture Details**: Directory structure, service organization, and extension activation flow
* **Coding Standards**: TypeScript/JavaScript guidelines, React/JSX conventions, and architecture patterns
* **Key Entry Points**: Where to make changes for specific features
* **Development Guidelines**: Best practices for contributing to the codebase

Understanding these guidelines is crucial for making effective contributions to the GitHub Copilot Chat extension.

### Layers

Like in VS Code we organize our source code into layers and folders. Understand a "layer" as runtime target which is defined by the ambient APIs that you can use. We have these layers:

* `common` - Just JavaScript and its builtins APIs. Also allowed to use types from the VS Code API, but no runtime access.
* `vscode` - Runtime access to VS Code APIs, can use `common`
* `node` - Node.js APIs and modules, can use `common, node`
* `vscode-node` - VS Code APIs and Node.js APIs, can use `common, vscode, node`
* `worker` - Web Worker APIs, can use `common`
* `vscode-worker` - VS Code APIs and Web Worker APIs, can use `common, vscode, worker`



Top-level folders are how we organize our code into logic groups, each folder has sub-folders, source files are inside a layer-folder. We have the following top-level folders

- src
   - util
      - Utility code that can be used across the board
      - Files in this folder can be loaded by tests that run outside of vscode
      - They should import basic types from the `vscodeTypes` module, this will be shimmed for tests
      - Can't import from the `./platform` nor `./extension` folder
   - platform
      - This folder contains services that are used to implement extensions, like telemetry, configuration, search etc
      - Can import from `./util`
   - extension
      - This is the big folder where all functionality is implemented.
      - Can import from `./util` and `./platform`
- test
   - Test code in this folder can import from `base/` but not `extension/`

### Runtimes (node.js, web worker)

Copilot supports both node.js and web worker extension hosts, i.e. can run on desktop but also in web, even if no remote is connected ("serverless"). As such, we are building 2 flavors of the extension:

* `./extension/extension/vscode-node/extension.ts`: extension runs in node.js extension hosts
* `./extension/extension/vscode-worker/extension.ts`: extension runs in web worker extension hosts

As much as possible, we try to run the same code in both node.js and web worker extension hosts. Having runtime specific code should be the exception and not the rule.

Here are some examples of code that will not be supported in web worker extension hosts:
* direct use of node.js API (for example `require`, `process.env`, `fs`)
* use of node.js modules that are not built for the web
* dependencies to other extensions that are unsupported in the web (for example `vscode.Git` extension)

Running the extension out of sources in their runtimes:
* `node`: just use the launch configuration ("Launch Copilot Extension")
* `web`
  * ensure an entry `"browser": "./dist/web"` in `package.json`
  * run `npm run web`
  * in your browser open `http://localhost:3000`
  * in VS Code configure the hidden setting `chat.experimental.serverlessWebEnabled` to `true` (reload if this is the first time you set it)

### Contributions and Services

Like in VS Code, Copilot extension is built with contributions and services so that components can both isolate from each other but also provide and use services together.

Contributions are registered in these folders and automatically picked up by the extension when running:
* `./extension/extension/vscode/contributions.ts`: contributions that can run in both node.js and web worker extension hosts
* `./extension/extension/vscode-node/contributions.ts`: contributions that only run in node.js extension hosts
* `./extension/extension/vscode-worker/contributions.ts`: contributions that only run in web worker extension hosts

Similarly, services are registered and automatically picked up by the main instantiation service that creates these contributions:
* `./extension/extension/vscode/services.ts`: services that can run in both node.js and web worker extension hosts
* `./extension/extension/vscode-node/services.ts`: services that only run in node.js extension hosts
* `./extension/extension/vscode-worker/services.ts`: services that only run in web worker extension hosts

Again, try to make your services and contributions available in the `vscode` layer so that it can be used in all supported runtimes.

## Agent mode

The main interesting files related to agent mode are:

- [`agentPrompt.tsx`](src/extension/prompts/node/agent/agentPrompt.tsx): The main entrypoint for rendering the agent prompt
- [`agentInstructions.tsx`](src/extension/prompts/node/agent/agentInstructions.tsx): The agent mode system prompt
- [`toolCallingLoop.ts`](src/extension/intents/node/toolCallingLoop.ts): Running the agentic loop
- [`chatAgents.ts`](src/extension/conversation/vscode-node/chatParticipants.ts): Registers agent mode and other participants, and the handlers for requests coming from VS Code.

Currently, agent mode is essentially a [chat participant](https://code.visualstudio.com/api/extension-guides/chat) registered with VS Code. It mainly uses the standard API along with the standard [`vscode.lm.invokeTool`](https://code.visualstudio.com/api/references/vscode-api#lm.tools) API to invoke tools, but is registered with a flag in `package.json` denoting it as the "agent mode" participant. It also has some special abilities driven by [proposed API](https://code.visualstudio.com/api/advanced-topics/using-proposed-api).

> **Note**: Some usages of "agent" in the codebase may refer to our older chat participants (`@workspace`, `@vscode`, ...) or Copilot Extension agents installed by a GitHub App.

## Tools

Copilot registers a number of different tools. Tools are also available from other VS Code extensions or from MCP servers registered with VS Code. The tool picker in VS Code primarily determines which tools are enabled, and this set is passed to the agent on the ChatRequest. Some edit tools are only enabled for certain models or based on configuration or experiments. The agent has the final say for which tools are included in a request, and this logic is in `getTools` in [`agentIntent.ts`](src/extension/intents/node/agentIntent.ts).

### Developing tools

Tools are registered through VS Code's normal [Language Model Tool API](https://code.visualstudio.com/api/extension-guides/tools). The key parts of the built-in tools are here:

- [`package.json`](package.json): The tool descriptions and schemas are defined here.
- [`toolNames.ts`](src/extension/tools/common/toolNames.ts): Contains the model-facing tool names.
- [`tools/`](src/extension/tools/node/): Tool implementations are in this folder. For the most part, they are implementations of the standard `vscode.LanguageModelTool` interface, but since some have additional custom behavior, they can implement the extended `ICopilotTool` interface.

See the [tools.md](docs/tools.md) document for more important details on how to develop tools. Please read it before adding a new tool!

## Tree Sitter

We have now moved to https://github.com/microsoft/vscode-tree-sitter-wasm for WASM prebuilds.

## Troubleshooting

### Reading requests

To easily see the details of requests made by Copilot Chat, run the command "Show Chat Debug View". This will show a treeview with an entry for each request made. You can see the prompt that was sent to the model, the tools that were enabled, the response, and other key details. Always read the prompt when making any changes, to ensure that it's being rendered as you expect! You can save the request log with right click > "Export As...".

The view also has entries for tool calls on their own, and a prompt-tsx debug view that opens in the Simple Browser.

> 🚨 **Note**: This log is also very helpful in troubleshooting issues, and we will appreciate if you share it when filing an issue about the agent's behavior. But, this log may contain personal information such as the contents of your files or terminal output. Please review the contents carefully before sharing it with anyone else.

## API updates

When updating VS Code proposed extension API that is used by the extension, we have two tools to make sure that the version of the extension that gets installed will be compatible with the version of VS Code: the `engines.vscode` field in `package.json`, and the proposed API version.

### Making breaking changes to API

When making a change to the proposed API that breaks backwards compatibility, you MUST update the API version of the proposal. This is declared in a comment at the top of the proposal .d.ts, and gets automatically updated in `extensionsApiProposals.ts` by the build task. Example: https://github.com/microsoft/vscode/blob/93a7382ecd63439a5bc507ef60e57610845ec05d/src/vscode-dts/vscode.proposed.lmTools.d.ts#L6.

Then, you must adopt this change in the extension and declare that the extension supports this version of the API in `package.json`'s `enabledApiProposals`, like `lmTools@2`. This will ensure that the extension will only be installed and activated in a version of VS Code that supports the same version of the API.

And, you must adopt this change in the extension at the same time as it's made in VS Code, otherwise the next day's Insiders build won't have a compatible Copilot Chat extension available.

Examples of changes that break backwards compatibility:
- Renaming a method that is used by the extension
- Changing the parameters that an existing method takes
- Adding a required static contribution point for a proposal that the extension already uses

### Making additive changes to API

When making a change to proposed API that adds a new feature but doesn't break backwards compatibility, you don't have to update the API version, because an older version of the extension will still work with the new VS Code build. But, once you adopt that new API, you must update the date part of the `engines.vscode` field in `package.json`. For example, `"vscode": "^1.91.0-20240624"`. This ensures that the extension will only be installed and activated in a version of VS Code that supports the new API.

Examples of additive changes
- Adding a new response type to `ChatResponseStream`
- Adding a new API proposal
- Adding a new method to an existing interface

## Running with Code OSS

### Desktop

You can run the extension from Code OSS Desktop, provided that you follow along these steps:
- Create a top level `product.overrides.json` in the `vscode` repository
- Add below contents as JSON
- Run the extension launch configuration in Code OSS

```json
{
   "trustedExtensionAuthAccess": {
      "github": [
         "github.copilot-chat"
      ]
   }
}
```

### Web

Code OSS for Web unfortunately does not support the `product.overrides.json` trick. You have to manually copy the
contents of the `defaultChatAgent` property into the `src/vs/platform/product/common/product.ts` file [here](https://github.com/microsoft/vscode/blob/d499211732305086bbac4e603392e540dee05bd2/src/vs/platform/product/common/product.ts#L72).

For example:

```ts
Object.assign(product, {
		version: '1.102.0-dev',
		nameShort: 'Code - OSS Dev',
		nameLong: 'Code - OSS Dev',
		applicationName: 'code-oss',
		dataFolderName: '.vscode-oss',
		urlProtocol: 'code-oss',
		reportIssueUrl: 'https://github.com/microsoft/vscode/issues/new',
		licenseName: 'MIT',
		licenseUrl: 'https://github.com/microsoft/vscode/blob/main/LICENSE.txt',
		serverLicenseUrl: 'https://github.com/microsoft/vscode/blob/main/LICENSE.txt',
		defaultChatAgent: {
			'extensionId': 'GitHub.copilot',
			'chatExtensionId': 'GitHub.copilot-chat',
			'documentationUrl': 'https://aka.ms/github-copilot-overview',
			'termsStatementUrl': 'https://aka.ms/github-copilot-terms-statement',
			'privacyStatementUrl': 'https://aka.ms/github-copilot-privacy-statement',
			'skusDocumentationUrl': 'https://aka.ms/github-copilot-plans',
			'publicCodeMatchesUrl': 'https://aka.ms/github-copilot-match-public-code',
			'manageSettingsUrl': 'https://aka.ms/github-copilot-settings',
			'managePlanUrl': 'https://aka.ms/github-copilot-manage-plan',
			'manageOverageUrl': 'https://aka.ms/github-copilot-manage-overage',
			'upgradePlanUrl': 'https://aka.ms/github-copilot-upgrade-plan',
			'signUpUrl': 'https://aka.ms/github-sign-up',
			'provider': {
				'default': {
					'id': 'github',
					'name': 'GitHub'
				},
				'enterprise': {
					'id': 'github-enterprise',
					'name': 'GHE.com'
				},
				'google': {
					'id': 'google',
					'name': 'Google'
				},
				'apple': {
					'id': 'apple',
					'name': 'Apple'
				}
			},
			'providerUriSetting': 'github-enterprise.uri',
			'providerScopes': [
				[
					'user:email'
				],
				[
					'read:user'
				],
				[
					'read:user',
					'user:email',
					'repo',
					'workflow'
				]
			],
			'entitlementUrl': 'https://api.github.com/copilot_internal/user',
			'entitlementSignupLimitedUrl': 'https://api.github.com/copilot_internal/subscribe_limited_user',
			'chatQuotaExceededContext': 'github.copilot.chat.quotaExceeded',
			'completionsQuotaExceededContext': 'github.copilot.completions.quotaExceeded',
			'walkthroughCommand': 'github.copilot.open.walkthrough',
			'completionsMenuCommand': 'github.copilot.toggleStatusMenu',
			'completionsRefreshTokenCommand': 'github.copilot.signIn',
			'chatRefreshTokenCommand': 'github.copilot.refreshToken',
			'completionsAdvancedSetting': 'github.copilot.advanced',
			'completionsEnablementSetting': 'github.copilot.enable',
			'nextEditSuggestionsSetting': 'github.copilot.nextEditSuggestions.enabled'
		},
		trustedExtensionAuthAccess: {
			'github': [
				'github.copilot-chat'
			]
		}
	});
}
```

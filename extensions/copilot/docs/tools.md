## So you want to write a tool

New to LLM tools? Here are some starting resources
- https://code.visualstudio.com/api/extension-guides/tools
- https://docs.anthropic.com/en/docs/build-with-claude/tool-use/overview
- https://platform.openai.com/docs/guides/function-calling?api-mode=chat
- https://www.anthropic.com/engineering/building-effective-agents

This is aimed at adding tools to vscode-copilot-chat, but much of it would apply to tools in other extensions or MCP servers as well.

### Do we need a new tool?

First, consider whether a new built-in tool is needed. Tools should be built-in if they are related to core VS Code functionality or the core search/edit/terminal agent loop and are needed for common OOB scenarios. Consider whether the tool can be contributed from another extension instead. If the task can be done through normal terminal commands, then it may not need its own tool.

### Static part

First, add an entry in vscode-copilot's package.json under `contributes.languageModelTools`:
- ~~Give it a name that starts with `copilot_`- this pattern is protected for our use only~~
  - This is obsolete- new tools can use any name, I think matching `toolReferenceName` might be a good idea.
  - The existing `copilot_` tools will be renamed later.
- Give it a reasonable `toolReferenceName` and a localized `userDescription`.
  - `toolReferenceName` is the name used in the tool picker, and to reference the tool with `#`, and to add the tool to a mode or toolset.
  - Add it to a toolset in `contributes.languageModelToolSets`- new tools should be part of a toolset.
- Now write your `modelDescription`. This is what the LLM uses to decide whether to use your tool. This should _not_ be localized. Be very detailed:
  - What exactly does the tool do?
  - What kind of information does it return?
  - In what cases should the tool be used?
  - Read more [best practices](https://docs.anthropic.com/en/docs/build-with-claude/tool-use/overview#best-practices-for-tool-definitions)
- If the tool takes input, add an `inputSchema`. This is a JSON schema which must describe an object with the properties that the tool takes. Describe the properties in detail. File paths should be absolute paths. Think carefully about which properties are `required`.
- In `toolNames.ts`, add entries to `ToolName`, `ContributedToolName`, `contributedToolNameToToolNames`. Follow the naming patterns of other tools. `ToolName` is the real name of your tool that the LLM will see. It should also be clear. A good pattern is to start with a verb, e.g. `read_file`.
- And remember to look for other tools that do similar things, and try to ensure your tool is aligned with them in the input it takes and the terminology it uses, and doesn't overlap in behavior. That will ensure that an LLM can understand how to use them together.

### Tool implementation part

Then, implement your tool in `src/extension/tools/node`:
- If your tool takes input, write an interface and be sure that it matches the schema in package.json exactly, including which properties are required.
- A typical tool can implement `vscode.LanguageModelTool`. More sophisticated tools can implement `ICopilotTool`, which gives you some extra functionality.
- Call `ToolRegistry.registerTool(YourTool);` and import your tool file in `allTools.ts`.
- Is your tool relevant in simulator/swebench scenarios? If so, check that it works.
- I recommend using prompt-tsx for your tool result if it's not a simple string. This lets you compose the result from multiple parts or reuse other prompt-tsx components.

### Input validation

- The input will be validated against the schema in package.json, so you don't need to repeat that validation in your tool.
- When taking paths from the LLM as input, use `IPromptPathRepresentationService`.

### Error handling

If something goes wrong, throw an error with a message that will make sense to the LLM. It will be caught by the agent and shown to the LLM. Should the model call your tool again with different arguments, or do something different? Make sure the model can understand what to do next.

### Tool confirmations

If the tool has a potentially dangerous side-effect (e.g. the terminal tool), it MUST ask for the user's confirmation before running. Do this by returning `PreparedToolInvocation.confirmationMessages`. Give enough context in the confirmation message for the user to understand what the tool will do, and what the risk is. The `message` can be a markdown string containing a codeblock.

### Make it look good

- Fill out `PreparedToolInvocation.invocationMessage` and `pastTenseMessage` with a helpful message to show in the UI.
- Don't add your own `...` to the end of the tool message
- If you want the tool message to react to the result of the tool, you can use `ExtendedLanguageModelToolResult.toolResultMessage`.
- Use markdown where appropriate.
- Setting `toolResultDetails` will make the tool message an expandable list of URIs to show the tool's result. (e.g. file search, text search)

![](./media/expandable-tool-result.png)

- If you want a clickable file widget in the tool message (e.g. read file), set `ExtendedLanguageModelToolResult.toolResultMessage` to a MarkdownString, using `formatUriForFileWidget`. This currently can't be combined with the `toolResultDetails` option.

![](./media/file-widget.png)

### Testing

Consider writing a unit test for your tool. One example to copy is [`readFile.spec.tsx`](https://github.com/microsoft/vscode-copilot/blob/a2b8af8b8e7286d4da77ff4108b6bcdeb1441d79/src/extension/tools/node/test/readFile.spec.tsx#L40-L59). This test invokes the tool with some hardcoded arguments and checks the result against a snapshot.

## Model-Specific Tools

Model-specific tools allow you to provide tool implementations that are only available for certain language models (e.g., Gemini, Claude, GPT-5). This is useful when:
- A model has unique capabilities that require a specialized tool
- You want to adjust tool descriptions/schemas to work better with a specific model
- You need to override an existing tool's behavior for certain models

### When to use model-specific tools

Use model-specific tools when:
- The tool leverages model-specific capabilities (e.g., native model features)
- You need different tool descriptions or schemas that work better with certain models
- You want to override behavior of an existing tool for specific models

### Registering a model-specific tool

Register model-specific tools using `ToolRegistry.registerModelSpecificTool`:

```typescript
class MyGeminiTool implements ICopilotModelSpecificTool<IMyToolInput> {
	async invoke(
		options: vscode.LanguageModelToolInvocationOptions<IMyToolInput>,
		token: vscode.CancellationToken
	): Promise<vscode.LanguageModelToolResult> {
		// Gemini-specific implementation
		return { content: [{ type: 'text', value: 'Result' }] };
	}
}

// Register with a model selector
const disposable = ToolRegistry.registerModelSpecificTool(
	{
		name: 'my_gemini_tool',
		displayName: 'My Gemini Tool',
		description: 'A tool optimized for Gemini models',
		inputSchema: {
			type: 'object',
			properties: {
				query: { type: 'string', description: 'The query to process' }
			},
			required: ['query']
		},
		// Only available for Gemini 3:
		models: [{ family: 'gemini-3-pro' }]
	},
	MyGeminiTool
);
```

### Overriding existing tools

If your model-specific tool should **replace** an existing tool for certain models, use the `overridesTool` property:

```typescript
class MyGeminiSearchTool extends GenericGrepSearchTool {
	public readonly overridesTool = ToolName.GrepSearch;
		// Gemini-optimized search implementation
	}
}

ToolRegistry.registerModelSpecificTool(
	{
		name: 'gemini_grep_search',
		displayName: 'Search (Gemini)',
		description: 'Optimized grep search for Gemini',
		models: [{ family: 'gemini' }],
		inputSchema: { /* ... */ }
	},
	MyGeminiSearchTool
);
```

When `overridesTool` is set:
- The model-specific tool is **not** individually selectable in the UI
- It automatically replaces the base tool when enabled and the model matches
- The base tool must be registered and enabled for the override to work

### Read the prompt

Read the prompt. There is no replacement for just using your tool a lot, and reading the prompt. Read the whole thing top to bottom. What story does it tell? Get familiar with the prompt as a whole, don't get tunnel vision for one message. Does your new tool result make sense to you as a human? Is it formatted in a way that's consistent with other tool results and context in the user message?

![](./media/debug-view.png)
![](./media/tool-log.png)

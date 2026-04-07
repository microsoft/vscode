---
applyTo: 'src/extension/prompts/node/agent/**'
description: Model-specific prompt authoring and registry guidelines
---

Guidelines for creating, registering, and testing model-specific prompts via the `PromptRegistry` system.

## Prompt Registry

The `PromptRegistry` in `promptRegistry.ts` maps AI models to their optimal prompt structures. Each model provider has a **resolver** class implementing `IAgentPrompt` that returns prompt customizations for that provider's models.

### Resolution Order

When `PromptRegistry.resolveAllCustomizations()` is called:
1. **Phase 1 — `matchesModel()`**: Iterates registered resolvers in order, calling `matchesModel()`. First `true` wins.
2. **Phase 2 — `familyPrefixes`**: If no `matchesModel` matched, checks `endpoint.family.startsWith(prefix)`. First match wins.
3. **Defaults**: If no resolver matches, defaults are used for all customizations.

Registration order matters — more specific resolvers (e.g., hash-based) should be registered before broader ones (e.g., prefix-based fallbacks).

### Resolver Interface

The `IAgentPrompt` interface provides these customization methods:

| Method | Returns | Purpose |
|--------|---------|--------|
| `resolveSystemPrompt(endpoint)` | `SystemPrompt` | Main system prompt class |
| `resolveReminderInstructions?(endpoint)` | `ReminderInstructionsConstructor` | Reminder instructions appended to user messages |
| `resolveToolReferencesHint?(endpoint)` | `ToolReferencesHintConstructor` | Tool usage hints |
| `resolveCopilotIdentityRules?(endpoint)` | `CopilotIdentityRulesConstructor` | Identity/role rules |
| `resolveSafetyRules?(endpoint)` | `SafetyRulesConstructor` | Safety rules |
| `resolveUserQueryTagName?(endpoint)` | `string` | Tag name wrapping user queries |

All methods are optional except `resolveSystemPrompt`. Unimplemented methods fall back to defaults (`DefaultReminderInstructions`, `DefaultToolReferencesHint`, etc.).

### Dependency Injection in Resolvers

Resolvers are created via `instantiationService.createInstance()`, so they support full constructor DI. Inject `IConfigurationService`, `IExperimentationService`, etc. to read experiment flags or config values:

```typescript
class MyProviderPromptResolver implements IAgentPrompt {
	static readonly familyPrefixes = ['my-model'];

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExperimentationService private readonly experimentationService: IExperimentationService,
	) { }

	private getVariant(): string {
		return this.configurationService.getExperimentBasedConfig(
			ConfigKey.MyPromptVariant, this.experimentationService);
	}

	resolveSystemPrompt(endpoint: IChatEndpoint): SystemPrompt | undefined {
		if (this.getVariant() === 'optimized') {
			return MyOptimizedPrompt;
		}
		if (endpoint.model?.includes('v4')) {
			return MyV4Prompt;
		}
		return MyDefaultPrompt;
	}

	resolveReminderInstructions(endpoint: IChatEndpoint): ReminderInstructionsConstructor | undefined {
		if (this.getVariant() === 'optimized') {
			return MyOptimizedReminderInstructions;
		}
		return MyDefaultReminderInstructions;
	}

	resolveCopilotIdentityRules(endpoint: IChatEndpoint): CopilotIdentityRulesConstructor | undefined {
		return MyCopilotIdentityRules;
	}

	resolveSafetyRules(endpoint: IChatEndpoint): SafetyRulesConstructor | undefined {
		return MySafetyRules;
	}
}
```

See `AnthropicPromptResolver` in `anthropicPrompts.tsx` for a production example using config and experiment flags across multiple resolve methods.

## Creating a New Model Prompt

### 1. Create the prompt component

Copy `DefaultAgentPrompt` from `defaultAgentInstructions.tsx`:

```tsx
export class MyProviderAgentPrompt extends PromptElement<DefaultAgentPromptProps> {
	async render(state: void, sizing: PromptSizing) {
		const tools = detectToolCapabilities(this.props.availableTools);
		return <InstructionMessage>
			{/* Your customizations here */}
		</InstructionMessage>;
	}
}
```

### 2. Create the resolver

A resolver can match models by hash (via `matchesModel`) and/or by family prefix:

```typescript
class MyProviderPromptResolver implements IAgentPrompt {
	static readonly familyPrefixes = ['my-model', 'provider-name'];

	// Optional: hash-based matching for models that can't be identified by prefix
	static async matchesModel(endpoint: IChatEndpoint): Promise<boolean> {
		return isMyModel(endpoint);
	}

	resolveSystemPrompt(endpoint: IChatEndpoint): SystemPrompt | undefined {
		return MyProviderAgentPrompt;
	}

	resolveReminderInstructions(endpoint: IChatEndpoint): ReminderInstructionsConstructor | undefined {
		return MyProviderReminderInstructions;
	}
}
```

A single resolver can return different prompts for different models within the same family using conditional logic inside `resolveSystemPrompt`.

### 3. Register and import

Register at the bottom of the file:

```typescript
PromptRegistry.registerPrompt(MyProviderPromptResolver);
```

Then add the import in `allAgentPrompts.ts`.

### 4. Test

Add your model family to the list at the top of `test/agentPrompt.spec.tsx`. This renders the prompt for your model with different input scenarios and validates against snapshots.

## Prompt Authoring Principles

- **Start with defaults** — most models infer correct behavior from tool definitions alone. Only customize if the model consistently fails.
- **Make minimal adjustments** — add 1-2 sentences targeting specific issues rather than over-specifying.
- **Use conditional sections** — wrap instructions in tool availability checks (`detectToolCapabilities`).
- **Remove redundancy** — avoid repeating what tool definitions already convey.

### Behaviors to Validate

Run the model through test scenarios and check these categories before adding customizations:

**1. Tool Usage Patterns**
- Uses edit tools (`replace_string_in_file`, `apply_patch`, `insert_edit_into_file`) instead of code blocks
- Uses code search tools (`read_file`, `semantic_search`, `grep_search`, `file_search`) to gather context
- Uses terminal tool (`run_in_terminal`) instead of bash commands
- Does NOT use terminal tools to create, edit, or update files — always uses dedicated edit tools
- Uses planning tools (`manage_todo_list`) for complex tasks

**2. Response Format**
- File paths and symbols linkified
- Structured markdown with headers and sections
- Concise, well-timed progress updates between tool calls

**3. Workflow Execution**
- Gathers context before acting
- Completes tasks end-to-end without pausing to check with user
- Handles errors and iterates appropriately

### Common Model Misbehaviors and Fixes

Only add these if the model **consistently** fails the behavior. Target the specific issue with 1-2 sentences:

```tsx
// Fix: Model shows code blocks instead of using edit tools
{tools[ToolName.ReplaceStringInFile] && <>
  NEVER print out a code block with file changes unless the user asked for it.
  Use the appropriate edit tool (replace_string_in_file, apply_patch, or insert_into_file).
</>}

// Fix: Model calls terminal tool in parallel
{tools[ToolName.CoreRunInTerminal] && <>
  Don't call the run_in_terminal tool multiple times in parallel.
  Instead, run one command and wait for the output before running the next command.
</>}

// Fix: Model doesn't use TODO tool for planning
{tools[ToolName.CoreManageTodoList] && <>
  For complex multi-step tasks, use the manage_todo_list tool to track your progress
  and provide visibility to the user.
</>}

// Fix: Model front-loads thinking and only summarizes at the end
Provide brief progress updates every 3-5 tool calls to keep the user informed of your progress.<br />
After completing parallel tool calls, provide a brief status update before proceeding to the next step.<br />
```

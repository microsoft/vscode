---
applyTo: '**/*.tsx'
description: Prompt-TSX coding guidelines
---

Guidelines for TSX files using [prompt-tsx](https://github.com/microsoft/vscode-prompt-tsx) focusing on specific patterns and token budget management for AI prompt engineering.

## Component Structure

### Base Pattern
- Extend `PromptElement<Props>` or `PromptElement<Props, State>` for all prompt components
- Props interfaces must extend `BasePromptElementProps`

```tsx
interface MyPromptProps extends BasePromptElementProps {
	readonly userQuery: string;
}

class MyPrompt extends PromptElement<MyPromptProps> {
	render() {
		return (
			<>
				<SystemMessage priority={1000}>...</SystemMessage>
				<UserMessage priority={900}>{this.props.userQuery}</UserMessage>
			</>
		);
	}
}
```

### Async Components
- The `render` method can be async for components that need to perform async operations
- All async work should be done directly in the `render` method

```tsx
class FileContextPrompt extends PromptElement<FileContextProps> {
	async render() {
		const fileContent = await readFileAsync(this.props.filePath);
		return (
			<>
				<SystemMessage priority={1000}>File content:</SystemMessage>
				<UserMessage priority={900}>{fileContent}</UserMessage>
			</>
		);
	}
}
```

## Prompt-Specific JSX

### Line Breaks
- **CRITICAL**: Use `<br />` for line breaks - newlines are NOT preserved in JSX
- Never rely on whitespace or string literal newlines

```tsx
// ✅ Correct
<SystemMessage>
	You are an AI assistant.<br />
	Follow these guidelines.<br />
</SystemMessage>

// ❌ Wrong - newlines will be collapsed
<SystemMessage>
	You are an AI assistant.
	Follow these guidelines.
</SystemMessage>
```

## Priority System

### Priority Values
- Higher numbers = higher priority (like z-index)
- Use consistent ranges:
  - System messages: 1000
  - User queries: 900
  - Recent history: 700-800
  - Context/attachments: 600-700
  - Background info: 0-500

```tsx
<SystemMessage priority={1000}>...</SystemMessage>
<UserMessage priority={900}>{query}</UserMessage>
<HistoryMessages priority={700} />
<ContextualData priority={500} />
```

### Flex Properties for Token Budget
- `flexGrow={1}` - expand to fill remaining token space
- `flexReserve` - reserve tokens before rendering
- `passPriority` - pass-through containers that don't affect child priorities

```tsx
<FileContext priority={70} flexGrow={1} files={this.props.files} />
<History passPriority older={0} newer={80} flexGrow={2} flexReserve="/5" />
```

## Content Handling

### TextChunk for Truncation
- Use `TextChunk` for content that may exceed token budget
- Set `breakOn` patterns for intelligent truncation

```tsx
<TextChunk breakOnWhitespace priority={100}>
	{longUserQuery}
</TextChunk>

<TextChunk breakOn=" " priority={80}>
	{documentContent}
</TextChunk>
```

### Tag Component for Structured Content
- Use `Tag` for XML-like structured content with attributes
- Validates tag names and properly formats attributes

```tsx
<Tag name="attachments" attrs={{ id: variableName, type: "file" }}>
	{content}
</Tag>
```

## References and Metadata

### Prompt References
- Use `<references>` for tracking variable usage
- Use `<meta>` for metadata that survives pruning

```tsx
<references value={[new PromptReference({ variableName })]} />
<meta value={new ToolResultMetadata(id, result)} />
```

### Keep-With Pattern
- Use `useKeepWith()` for content that should be pruned together

```tsx
const KeepWith = useKeepWith();
return (
	<>
		<KeepWith priority={2}>
			<ToolCallRequest>...</ToolCallRequest>
		</KeepWith>
		<KeepWith priority={1}>
			<ToolCallResponse>...</ToolCallResponse>
		</KeepWith>
	</>
);
```

## Token Budget Management

### Sizing-Aware Rendering
- Use `PromptSizing` parameter for budget-aware content generation
- Implement cooperative token usage

```tsx
async render(sizing: PromptSizing): Promise<PromptPiece> {
	const content = await this.generateContent(sizing.tokenBudget);
	return <>{content}</>;
}
```

### Performance
- Avoid expensive work in `render` methods when possible
- Cache computations when appropriate
- Use async `render` for all async operations

# Phase 1: API Format Translator

## Overview
- **Priority**: P0
- **Status**: pending
- **Description**: Bidirectional message format conversion between internal format and Anthropic/OpenAI/Google API formats

## Architecture

### Internal Format (VS Code IChatMessage)

```typescript
// Already defined in languageModels.ts
interface IChatMessage {
  role: ChatMessageRole;  // System, User, Assistant
  content: IChatMessagePart[];  // text, image, thinking, data parts
}
```

### Provider-Specific Formats

**Anthropic:**
```json
{
  "model": "claude-sonnet-4-20250514",
  "max_tokens": 4096,
  "system": "You are...",
  "messages": [
    { "role": "user", "content": "Hello" },
    { "role": "assistant", "content": "Hi!" }
  ],
  "stream": true
}
```

**OpenAI:**
```json
{
  "model": "gpt-4o",
  "messages": [
    { "role": "system", "content": "You are..." },
    { "role": "user", "content": "Hello" },
    { "role": "assistant", "content": "Hi!" }
  ],
  "stream": true
}
```

**Google (Gemini):**
```json
{
  "contents": [
    { "role": "user", "parts": [{ "text": "Hello" }] },
    { "role": "model", "parts": [{ "text": "Hi!" }] }
  ],
  "systemInstruction": { "parts": [{ "text": "You are..." }] }
}
```

### Key Differences

| Aspect | Anthropic | OpenAI | Google |
|--------|-----------|--------|--------|
| System prompt | Top-level `system` field | `role: "system"` message | `systemInstruction` field |
| Assistant role | `"assistant"` | `"assistant"` | `"model"` |
| Content format | string or array of blocks | string or array | `parts` array |
| Streaming | SSE `event: content_block_delta` | SSE `data: {...}` | SSE `data: {...}` |
| Stream text field | `delta.text` | `choices[0].delta.content` | `candidates[0].content.parts[0].text` |

## Files to Create

- `src/vs/workbench/contrib/multiAgent/common/apiFormatTranslator.ts`

## Implementation

```typescript
// apiFormatTranslator.ts

interface IProviderRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

interface IProviderStreamChunk {
  text: string;
  done: boolean;
}

class ApiFormatTranslator {
  // Convert internal messages → provider HTTP request
  toAnthropicRequest(messages: IChatMessage[], modelId: string, apiKey: string): IProviderRequest;
  toOpenAIRequest(messages: IChatMessage[], modelId: string, apiKey: string): IProviderRequest;
  toGoogleRequest(messages: IChatMessage[], modelId: string, apiKey: string): IProviderRequest;

  // Route to correct format
  toProviderRequest(messages: IChatMessage[], modelId: string, apiKey: string, format: ApiFormat, baseUrl: string): IProviderRequest;

  // Parse SSE stream chunk → text
  parseAnthropicChunk(line: string): IProviderStreamChunk;
  parseOpenAIChunk(line: string): IProviderStreamChunk;
  parseGoogleChunk(line: string): IProviderStreamChunk;

  // Route to correct parser
  parseStreamChunk(line: string, format: ApiFormat): IProviderStreamChunk;

  // Extract quota from response headers
  extractQuota(headers: Record<string, string>, format: ApiFormat): Partial<IQuotaStatus>;
}
```

## Success Criteria
- Can convert IChatMessage[] → Anthropic/OpenAI/Google request body
- Can parse SSE stream chunks from all 3 formats
- Can extract rate-limit headers from all 3 formats
- System prompt handled correctly per format (top-level vs message)

## Todo
- [ ] Implement message conversion for 3 formats
- [ ] Implement SSE chunk parsing for 3 formats
- [ ] Implement quota header extraction for 3 formats
- [ ] Unit-testable (pure functions, no IO)

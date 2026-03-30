# Phase 2: Direct Provider Client

## Overview
- **Priority**: P0
- **Status**: pending
- **Description**: HTTP client that calls provider APIs directly using translated formats, with SSE streaming support

## Architecture

```
AgentChatBridge._sendLlmRequest()
  ├─ Has VS Code language model registered? → use ILanguageModelsService
  └─ Has direct provider account? → use DirectProviderClient
       │
       ├─ Get API key from ISecretStorageService
       ├─ Build request via ApiFormatTranslator.toProviderRequest()
       ├─ HTTP POST via IRequestService (VS Code's built-in HTTP)
       ├─ Parse SSE stream via ApiFormatTranslator.parseStreamChunk()
       └─ Extract quota from response headers
```

## Files to Create/Modify

- **CREATE**: `src/vs/workbench/contrib/multiAgent/common/directProviderClient.ts`
- **MODIFY**: `src/vs/workbench/contrib/multiAgent/common/agentChatBridge.ts` — add fallback to direct client

## Implementation

```typescript
// directProviderClient.ts

interface IDirectProviderClient {
  _serviceBrand: undefined;

  sendRequest(
    account: IProviderAccount,
    messages: IChatMessage[],
    modelId: string,
    token: CancellationToken,
    onChunk?: (text: string) => void,
  ): Promise<string>;
}
```

### Integration with AgentChatBridge

```typescript
// In _sendLlmRequest(), change to:
try {
  // Try VS Code's language model service first
  const response = await this._languageModelsService.sendChatRequest(...);
  // ... existing streaming logic
} catch {
  // Fallback to direct provider client
  return this._directClient.sendRequest(account, messages, modelId, token, (text) => {
    if (progress) {
      progress([{ kind: 'markdownContent', content: { value: text } }]);
    }
  });
}
```

## Success Criteria
- Can call Anthropic/OpenAI/Google APIs directly via HTTP
- SSE streaming works for all 3 providers
- Automatic fallback: VS Code language model → direct client
- Quota extracted from response headers and fed to rotation service
- Credentials never logged

## Todo
- [ ] Implement DirectProviderClient with IRequestService
- [ ] Implement SSE stream parsing
- [ ] Wire into AgentChatBridge as fallback
- [ ] Extract and report quota from response headers

# Debugging Chat Integration

This guide covers common issues when using the chat features.

## Missing API Key
- **Error**: `OPENAI_API_KEY is not set` or `401 Unauthorized`.
- **Fix**: Ensure the `OPENAI_API_KEY` environment variable is configured before starting VS Code.

## Network Failures
- **Error**: `fetch failed` or timeouts when contacting OpenAI.
- **Fix**: Check your internet connection or proxy settings. Retry once connectivity is restored.

## Rate Limits
- **Error**: Responses indicating too many requests.
- **Fix**: Reduce request frequency or upgrade your OpenAI plan.

## Context Collection
- **Issue**: No context gathered from open editors.
- **Fix**: Make sure files are open and visible. Selections take precedence; otherwise the first 200 lines are used.

# Copilot Proxy Interception Test

## Overview

This directory contains tools to test the Copilot proxy interception feature. The proxy intercepts requests to LLM models and can be used for:

- **Token compression** via tools like [Headroom](https://github.com/chopratejas/headroom)
- **Request monitoring** and logging
- **Rate limiting** and quota management
- **Token counting** optimization

## Architecture

### How It Works

```
VS Code Copilot Chat
        ↓
  networkRequest()
        ↓
Check COPILOT_PROXY_URL env var
        ↓
If set: Rewrite URL + add X-Original-Url header
        ↓
Forward to: http://localhost:8787/v1
        ↓
Test Proxy (test-proxy.js)
        ↓
Add X-Proxy-Forward header
        ↓
Forward to original endpoint (from X-Original-Url)
        ↓
Model API (OpenAI, Anthropic, etc.)
        ↓
Response → Back through proxy → Back to VS Code
```

### Key Components

1. **networkRequest()** in `networking.ts`
   - Checks `COPILOT_PROXY_URL` environment variable
   - If set, intercepts the request with proxy URL rewriting
   - Adds `X-Original-Url` header for proxy to know where to forward

2. **maybeInterceptUrlThroughProxy()**
   - Parses original URL
   - Creates proxy URL with same path
   - Preserves all headers

3. **test-proxy.js**
   - Simple Node.js HTTP proxy server
   - Logs all intercepted requests with headers and body
   - Forwards to real endpoint specified in `X-Original-Url`
   - Logs response status and body (truncated)

## Files

- `networking.ts` - Modified to add proxy interception
- `test-proxy.js` - Simple test proxy server that logs requests
- `run-proxy-test.sh` - Convenience script to start proxy and VS Code
- `PROXY-TEST.md` - This documentation

## Usage

### Quick Test (Manual Steps)

```bash
# Terminal 1: Start the test proxy
node extensions/copilot/src/platform/networking/test-proxy.js 8787

# Terminal 2: Start VS Code with proxy enabled
COPILOT_PROXY_URL=http://localhost:8787/v1 ./scripts/code.sh
```

### Automated Test Script

```bash
# Make script executable
chmod +x extensions/copilot/src/platform/networking/run-proxy-test.sh

# Run the test
extensions/copilot/src/platform/networking/run-proxy-test.sh
```

### In VS Code

1. Open Copilot Chat (Ctrl+K Ctrl+L or Cmd+K Cmd+L)
2. Send a message like "Hello!" or ask a question
3. Watch the proxy terminal for intercepted request logs

## Expected Proxy Output

When a Copilot request is intercepted, you should see:

```
[2025-01-XX] [INFO] [req-id-123] POST /v1/chat/completions
[2025-01-XX] [INFO] [req-id-123] Headers: { ... }
[2025-01-XX] [INFO] [req-id-123] Request Body: { "model": "gpt-4", "messages": [...] }
[2025-01-XX] [INFO] [req-id-123] Approximate input tokens: ~45
[2025-01-XX] [INFO] [req-id-123] Forwarding to: https://api.openai.com/v1/chat/completions
[2025-01-XX] [INFO] [req-id-123] Response status: 200
```

## Debugging

### Check if Proxy is Running

```bash
curl -X POST http://localhost:8787/v1/test \
  -H "X-Original-Url: http://example.com" \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

### Check VS Code Logs

```bash
# Logs directory on Linux
~/.vscode-oss-dev/

# Logs directory on macOS
~/Library/Logs/VS\ Code\ OSS/

# Windows
%APPDATA%\Code - OSS\logs
```

### Environment Variable Not Applied

If the proxy URL isn't being applied:

1. Verify env var is set: `echo $COPILOT_PROXY_URL`
2. Check if VS Code process inherited it: `ps aux | grep code`
3. Look in VS Code logs for `[Proxy]` debug messages

## Integration with Real Token Compression

To use with [Headroom](https://github.com/chopratejas/headroom) for actual token compression:

```bash
# Install Headroom locally
npm install --save-dev headroom-openai

# Or run Headroom as a service
docker run -p 8787:8787 headroom:latest

# Then use the same test script
COPILOT_PROXY_URL=http://localhost:8787/v1 ./scripts/code.sh
```

## Request Flow with Token Compression

```
User Input in Copilot
  ↓ (tokenized)
~150 tokens

Proxy (Headroom STIN compression)
  ↓ (semantic token compression)
~90 tokens (40% reduction!)

Model receives
~90 tokens

Model thinks
+ generates response
~150 output tokens

Response sent back through proxy
  ↓ (transparent pass-through)

VS Code receives response
```

## Header Details

### Request Headers Added by VS Code

- `X-Request-Id` - Unique request identifier
- `X-Agent-Task-Id` - Agent task identifier
- `X-Interaction-Type` - Type of interaction (conversation, subagent, etc.)
- `X-GitHub-Api-Version` - API version
- `Authorization` - Bearer token for model authentication

### Headers Added by Proxy Interception

- `X-Original-Url` - The real endpoint to forward to
- `X-Original-Host` - Original hostname
- `X-Proxy-Forward` - Flag indicating this is a forwarded request

## Troubleshooting

### Port Already in Use

```bash
# Find what's using port 8787
lsof -i :8787

# Kill the process
kill -9 <PID>

# Or use a different port
node test-proxy.js 8788
COPILOT_PROXY_URL=http://localhost:8788/v1 ./scripts/code.sh
```

### Proxy Not Intercepting Requests

1. Check `COPILOT_PROXY_URL` is set correctly
2. Look for `[Proxy]` messages in proxy.js console
3. Check VS Code logs for errors
4. Verify the X-Original-Url header is being sent

### Model API Requests Not Working Through Proxy

1. Ensure proxy is forwarding correctly (check logs)
2. Verify X-Original-Url points to correct model API endpoint
3. Check model API authentication is still working
4. Review response forwarding (streaming vs buffered)

## Next Steps

1. **Test proxy interception** with this test setup
2. **Verify token counts** are being captured
3. **Integrate Headroom** for actual token compression
4. **Measure impact** on credit usage and latency
5. **Explain credit system** (see CREDIT-SYSTEM.md)

## See Also

- `networking.ts` - Main implementation
- `chatMLFetcher.ts` - Request orchestrator
- `chatEndpoint.ts` - Per-model endpoint handling
- `fetcherService.ts` - HTTP fetcher abstraction
- `../test-proxy.js` - Test proxy server

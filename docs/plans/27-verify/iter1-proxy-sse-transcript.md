# Plan 27 iter 1 - proxy SSE passthrough: HTTP-level verification

The proxy (`scripts/lwd-anthropic-proxy.js`) was run on port 8091 with `LWD_BACKEND=openrouter` pointed at a
mock OpenAI-style SSE upstream that emits 10 chunks ~300ms apart and logs when its client (the proxy)
disconnects. This proves the streaming path AND mid-stream cancellation end to end without spending real
credits. The Anthropic backend takes the same unbuffered pipe path (`Readable.fromWeb(upstream.body).pipe(res)`).

## Test A - a real streamed response (deltas arrive incrementally, normalised to Anthropic events)

```
[full] status=200 content-type=text/event-stream
[full] + 133ms  event: content_block_delta
[full] + 133ms  data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"The "}}
[full] + 431ms  data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"access "}}
[full] + 731ms  data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"control "}}
...
[full] +2840ms  data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"admins."}}
[full] +3143ms  event: message_stop
[full] +3144ms  data: {"type":"message_stop"}
[full] stream ended at +3144ms
```

Deltas arrive ~300ms apart (unbuffered), each an Anthropic-shaped `content_block_delta` (`text_delta`),
terminated by `message_stop` - the OpenRouter OpenAI-style chunks were normalised to the single format the
renderer parses.

## Test B - mid-stream cancellation closes the upstream socket

```
[cancel] status=200 content-type=text/event-stream
[cancel] + 106ms  data: {"type":"content_block_delta",...,"text":"The "}}
[cancel] + 408ms  data: {"type":"content_block_delta",...,"text":"access "}}
[cancel] + 711ms  data: {"type":"content_block_delta",...,"text":"control "}}
[cancel] >>> ABORTING mid-stream at +900ms

=== mock upstream log ===
[mock-upstream] connection closed after 10 chunks   <- Test A ran to completion
[mock-upstream] connection closed after 3 chunks    <- Test B aborted after 3 deltas
```

When the client aborts, the proxy's `res` `close` handler destroys the node stream, which cancels the
upstream reader and closes the socket - the mock upstream observes the disconnect after exactly the 3 chunks
already sent. No orphaned in-flight call.

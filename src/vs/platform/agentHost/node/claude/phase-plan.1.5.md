# Phase 1.5 Implementation Plan — Widen `ICopilotApiService` to Raw Anthropic Events

Council-synthesized plan (GPT + Opus + Gemini). All architectural decisions are final.
Implement as a single atomic PR on top of the Phase 1 commit.

---

## Overview

| File | Change type |
|------|------------|
| `/package.json` | Add `@anthropic-ai/sdk@^0.82.0` dependency |
| `src/vs/platform/agentHost/node/shared/copilotApiService.ts` | Drop custom types; rewrite interface + implementation |
| `src/vs/platform/agentHost/test/node/shared/copilotApiService.test.ts` | Migrate 80 existing tests + add ~15 new |

---

## Finalized decisions (do not re-litigate)

1. `@anthropic-ai/sdk@^0.82.0` goes in root `package.json` `dependencies`.
2. Drop `ICopilotMessagesRequest`, `ICopilotChatMessage`, `ICopilotMessagesResponse` entirely.
3. Request type: use SDK's discriminated `Anthropic.MessageCreateParamsStreaming` / `MessageCreateParamsNonStreaming` (and the `MessageCreateParams` union for the implementation signature) — not `MessageCreateParamsBase`.
4. New `ICopilotApiServiceRequestOptions { headers?, signal? }` replaces the positional `signal` everywhere.
5. `messages()` streaming → `AsyncGenerator<Anthropic.MessageStreamEvent>`.
6. `messages()` non-streaming → `Promise<Anthropic.Message>`.
7. ~~`messagesText()` wraps `messages()`, filters to `text_delta.text` strings.~~ **Cut** — no downstream phase consumes it. This is a greenfield service; callers can filter `messages()` in a few lines if needed.
8. `countTokens()` throws `'countTokens not supported by CAPI'` immediately.
9. `message_stop` **is yielded** as the last event before the generator returns.
10. All 80 tests migrate in the same PR.

---

## Step 0 — `package.json`

**File:** `/package.json` line ~92 (after `@vscode/sandbox-runtime`)

```diff
  "@vscode/sandbox-runtime": "0.0.1",
+ "@anthropic-ai/sdk": "^0.82.0",
```

Run `npm install` to update the lockfile.

---

## Step 1 — Drop custom types, add import and options type

**File:** `src/vs/platform/agentHost/node/shared/copilotApiService.ts`

### 1-A. Add SDK import (top of file, after existing imports ~line 6)

```typescript
import Anthropic from '@anthropic-ai/sdk';
```

### 1-B. Delete the three custom types in `// #region Types` (lines 15–51)

- Delete `ICopilotChatMessage` (lines ~18–21)
- Delete `ICopilotMessagesRequest` (lines ~22–38, including doc comment)
- Delete `ICopilotMessagesResponse` (lines ~40–51, including doc comment)

### 1-C. Add `ICopilotApiServiceRequestOptions` in their place

```typescript
/**
 * Per-call transport options for all {@link ICopilotApiService} methods.
 *
 * `headers` are merged into the outgoing CAPI request before security-
 * sensitive headers (`Authorization`, `Content-Type`, `X-Request-Id`,
 * `OpenAI-Intent`), so callers cannot override those.
 *
 * `signal` propagates to every fetch call (token mint + the API request).
 */
export interface ICopilotApiServiceRequestOptions {
	readonly headers?: Readonly<Record<string, string>>;
	readonly signal?: AbortSignal;
}
```

Surviving types (`ICopilotTokenEnvelope`, `ICachedToken`, `ICapiInit`) stay untouched.

---

## Step 2 — Rewrite `ICopilotApiService` interface (lines ~142–180)

Replace the entire interface body:

```typescript
export interface ICopilotApiService {

	readonly _serviceBrand: undefined;

	/**
	 * Stream a chat completion as raw Anthropic stream events.
	 *
	 * Yields every `Anthropic.MessageStreamEvent` in the order the server
	 * emits them, **including `message_stop` as the last event** before the
	 * generator returns. Phase 2 proxy relies on receiving a complete,
	 * replayable event stream.
	 *
	 * @throws on non-2xx status or SSE `error` event.
	 */
	messages(
		githubToken: string,
		request: Anthropic.MessageCreateParamsBase & { stream: true },
		options?: ICopilotApiServiceRequestOptions,
	): AsyncGenerator<Anthropic.MessageStreamEvent>;

	/**
	 * Send a chat completion and return the full aggregated response.
	 * @throws on non-2xx status.
	 */
	messages(
		githubToken: string,
		request: Anthropic.MessageCreateParamsBase & { stream?: false },
		options?: ICopilotApiServiceRequestOptions,
	): Promise<Anthropic.Message>;

	/**
	 * Stream a chat completion as plain-text deltas only.
	 *
	 * Convenience wrapper over the streaming `messages()` overload that
	 * filters to `content_block_delta` events whose `delta.type === 'text_delta'`
	 * and yields only `delta.text`. All other event types are discarded.
	 *
	 * Semantically identical to the Phase 1 `messages()` streaming behavior.
	 */
	messagesText(
		githubToken: string,
		request: Anthropic.MessageCreateParamsBase & { stream: true },
		options?: ICopilotApiServiceRequestOptions,
	): AsyncGenerator<string>;

	/**
	 * Count tokens for a hypothetical request.
	 *
	 * @throws always — `countTokens` is not supported by CAPI in Phase 1.5.
	 * Phase 2 proxy maps this to HTTP 501.
	 */
	countTokens(
		githubToken: string,
		req: Anthropic.MessageCountTokensParams,
		options?: ICopilotApiServiceRequestOptions,
	): Promise<Anthropic.MessageTokensCount>;

	/** List models available to the GitHub user. */
	models(githubToken: string, options?: ICopilotApiServiceRequestOptions): Promise<CCAModel[]>;
}
```

---

## Step 3 — Rewrite `CopilotApiService` public methods (lines ~199–237)

### 3-A. `messages()` overloads + dispatch

```typescript
messages(
	githubToken: string,
	request: Anthropic.MessageCreateParamsBase & { stream: true },
	options?: ICopilotApiServiceRequestOptions,
): AsyncGenerator<Anthropic.MessageStreamEvent>;
messages(
	githubToken: string,
	request: Anthropic.MessageCreateParamsBase & { stream?: false },
	options?: ICopilotApiServiceRequestOptions,
): Promise<Anthropic.Message>;
messages(
	githubToken: string,
	request: Anthropic.MessageCreateParamsBase & { stream?: boolean },
	options?: ICopilotApiServiceRequestOptions,
): AsyncGenerator<Anthropic.MessageStreamEvent> | Promise<Anthropic.Message> {
	if (request.stream) {
		return this._messagesStreaming(githubToken, request, options);
	}
	return this._messagesNonStreaming(githubToken, request, options);
}
```

### 3-B. `messagesText()`

```typescript
async *messagesText(
	githubToken: string,
	request: Anthropic.MessageCreateParamsBase & { stream: true },
	options?: ICopilotApiServiceRequestOptions,
): AsyncGenerator<string> {
	for await (const event of this.messages(githubToken, request, options)) {
		if (
			event.type === 'content_block_delta' &&
			event.delta.type === 'text_delta'
		) {
			yield event.delta.text;
		}
	}
}
```

### 3-C. `countTokens()`

```typescript
async countTokens(
	_githubToken: string,
	_req: Anthropic.MessageCountTokensParams,
	_options?: ICopilotApiServiceRequestOptions,
): Promise<Anthropic.MessageTokensCount> {
	throw new Error('countTokens not supported by CAPI');
}
```

### 3-D. `models()` — change `signal?` → `options?`

```typescript
async models(githubToken: string, options?: ICopilotApiServiceRequestOptions): Promise<CCAModel[]> {
```

Inside: replace all `signal` references with `options?.signal`. The request header block stays; merge `options?.headers` before `Authorization`:

```typescript
headers: {
	...options?.headers,
	'Authorization': `Bearer ${copilotToken}`,
},
signal: options?.signal,
```

---

## Step 4 — Rewrite private streaming/non-streaming helpers

### 4-A. `_messagesStreaming` (line ~295)

```typescript
private async *_messagesStreaming(
	githubToken: string,
	request: Anthropic.MessageCreateParamsBase,
	options?: ICopilotApiServiceRequestOptions,
): AsyncGenerator<Anthropic.MessageStreamEvent> {
	const response = await this._sendRequest(githubToken, request, true, options);
	if (!response.body) {
		throw new Error('CAPI response has no body');
	}
	yield* this._readSSE(response.body);
}
```

### 4-B. `_messagesNonStreaming` (line ~309)

```typescript
private async _messagesNonStreaming(
	githubToken: string,
	request: Anthropic.MessageCreateParamsBase,
	options?: ICopilotApiServiceRequestOptions,
): Promise<Anthropic.Message> {
	const response = await this._sendRequest(githubToken, request, false, options);
	return response.json() as Promise<Anthropic.Message>;
}
```

Remove all text-concatenation logic that was in this method.

### 4-C. `_sendRequest` (line ~330) — new signature + body builder

```typescript
private async _sendRequest(
	githubToken: string,
	request: Anthropic.MessageCreateParamsBase,
	stream: boolean,
	options?: ICopilotApiServiceRequestOptions,
): Promise<Response> {
```

**Body construction** — spread the SDK-shaped request, inject `stream`, normalize `system`:

```typescript
const { system, ...rest } = request;
const body = JSON.stringify({
	...rest,
	stream,
	// CAPI requires system as a text-block array, not a raw string
	...(system !== undefined
		? { system: typeof system === 'string' ? [{ type: 'text', text: system }] : system }
		: {}),
});
```

**Headers** — merge caller headers first so security-sensitive ones always win:

```typescript
headers: {
	...options?.headers,
	'Content-Type': 'application/json',
	'Authorization': `Bearer ${copilotToken}`,
	'X-Request-Id': requestId,
	'OpenAI-Intent': 'conversation',
},
signal: options?.signal,
```

Replace all internal `signal` references with `options?.signal`. Pass `options?.signal` to `_getCopilotToken`.

### 4-D. `_readSSE` (line ~447) — change return type

```typescript
private async *_readSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<Anthropic.MessageStreamEvent> {
```

Loop logic: if the event returned by `_parseDataLine` has `type === 'message_stop'`, yield it and then `return`.

### 4-E. `_parseDataLine` (line ~497) — yield full events

Change return type from `string | undefined | null` to `Anthropic.MessageStreamEvent | undefined`:

```typescript
private _parseDataLine(line: string): Anthropic.MessageStreamEvent | undefined {
	if (!line.startsWith('data: ')) {
		return undefined;  // skip non-data lines (event:, comments, blank)
	}
	const data = line.slice('data: '.length).trim();
	let parsed: Record<string, unknown>;
	try {
		parsed = JSON.parse(data);
	} catch {
		return undefined;  // skip malformed JSON
	}
	if (parsed['type'] === 'error') {
		throw new Error(
			(parsed['error'] as { message?: string })?.message ?? 'Unknown streaming error from CAPI',
		);
	}
	return parsed as Anthropic.MessageStreamEvent;
}
```

Update `_readSSE` caller:

```typescript
private async *_readSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<Anthropic.MessageStreamEvent> {
	const reader = body.getReader();
	try {
		// ... existing chunk/line splitting logic unchanged ...
		for (const line of lines) {
			const event = this._parseDataLine(line);
			if (event !== undefined) {
				yield event;
				if (event.type === 'message_stop') {
					return;  // generator terminates after message_stop
				}
			}
		}
	} finally {
		reader.cancel();
	}
}
```

The `null`-sentinel pattern is removed. `message_stop` is yielded, then `return` triggers `finally`.

---

## Step 5 — Migrate existing 80 tests

**File:** `src/vs/platform/agentHost/test/node/shared/copilotApiService.test.ts`

### 5-A. Imports — replace `ICopilotChatMessage` with Anthropic SDK type

```typescript
// Remove:
import type { ICopilotChatMessage, ... } from '../../...copilotApiService.js';
// Add:
import Anthropic from '@anthropic-ai/sdk';
import type { ICopilotApiServiceRequestOptions, ICopilotApiService } from '../../...copilotApiService.js';
```

### 5-B. `collect<T>()` helper — make generic (line ~34)

```typescript
async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
	const result: T[] = [];
	for await (const item of iter) {
		result.push(item);
	}
	return result;
}
```

No other change to `collect` — it now works for both `string[]` (via `messagesText`) and `Anthropic.MessageStreamEvent[]` (via `messages`).

### 5-C. Base request fixture — rename fields to SDK snake_case (line ~100)

```typescript
const baseRequest = {
	model: 'claude-sonnet-4-5',
	messages: [{ role: 'user' as const, content: 'Hello' }],
	max_tokens: 8192,
	stream: false as const,
};
```

Remove `headers` from `baseRequest` — headers are now in `options`.

### 5-D. `ICopilotChatMessage[]` usage in tests (lines ~99, ~518)

Replace with `Anthropic.MessageParam[]`:

```typescript
// was: const messages: ICopilotChatMessage[] = [...]
const messages: Anthropic.MessageParam[] = [...]
```

The values `{ role: 'user', content: '...' }` are valid `MessageParam` — no shape change needed.

### 5-E. Request Format suite (lines ~421–581)

- **`maxTokens`** → **`max_tokens`** in any inline request objects.
- **Custom headers** move from request body to `options`:
  ```typescript
  // was: service.messages('gh-tok', { ...baseRequest, headers: { 'X-Foo': 'bar' } })
  // new: service.messages('gh-tok', baseRequest, { headers: { 'X-Foo': 'bar' } })
  ```
- **`system` test** (line ~423): CAPI still expects the array format; the `_sendRequest` body builder handles the normalization. The assertion `system: [{ type: 'text', text: ... }]` stays correct.
- **`stream` flag test**: stays on the streaming call; `{ ...baseRequest, stream: true as const }` is still valid since `baseRequest.stream` is `false as const` and the spread overrides it.

### 5-F. Non-Streaming suite (lines ~588–682)

Add a local helper for extracting text from `Anthropic.Message`:

```typescript
function getText(msg: Anthropic.Message): string {
	return msg.content
		.filter((b): b is Anthropic.TextBlock => b.type === 'text')
		.map(b => b.text)
		.join('');
}
```

Per-test changes:

| Old assertion | New assertion |
|---|---|
| `result.content === 'The answer is 42.'` | `getText(result) === 'The answer is 42.'` |
| `result.content === 'First part. Second part.'` | `getText(result) === 'First part. Second part.'` |
| "skips non-text blocks" → `result.content === 'the answer'` | `getText(result) === 'the answer'` (non-text blocks are in `result.content` but `getText` filters them) |
| `result.content === ''` | `getText(result) === ''` |
| `result.stopReason === 'max_tokens'` | `result.stop_reason === 'max_tokens'` |
| `result.stopReason === 'unknown'` when missing | Rename test: assert `result.stop_reason == null` |

Error tests (429, 500) — no change.

### 5-G. Streaming suite (lines ~688–956) — all text-asserting tests move to `messagesText()`

Mechanical find-replace within this suite:

```typescript
// was:
collect(service.messages('gh-tok', { ...baseRequest, stream: true as const }))
// new:
collect(service.messagesText('gh-tok', { ...baseRequest, stream: true as const }))
```

This applies to all tests asserting `string[]` values. The assertions themselves are unchanged.

**Keep on `messages()`** (not `messagesText`):
- Error-throwing tests (SSE `error` event, non-200, missing body) — testing transport errors, not text extraction
- Cancellation stream tests (lines ~1057–1133) — testing `reader.cancel()`, not yielded values

### 5-H. Cancellation suite — `signal` positional → `options.signal` (lines ~1009–1055)

```typescript
// was: service.messages('gh-tok', baseRequest, controller.signal)
// new: service.messages('gh-tok', baseRequest, { signal: controller.signal })

// was: service.models('gh-tok', controller.signal)
// new: service.models('gh-tok', { signal: controller.signal })
```

---

## Step 6 — Add new tests (~15)

Add these three suites after the existing "Streaming Responses" suite.

### Suite: `Raw Event Stream (messages())`

```typescript
suite('Raw Event Stream (messages())', () => {

	test('yields all six protocol event types in order', async () => {
		// stream: message_start, content_block_start, content_block_delta,
		//         content_block_stop, message_delta, message_stop
		// assert: types array matches exactly
	});

	test('message_stop is the last yielded event', async () => {
		// stream: content_block_delta, message_stop
		// assert: last event is message_stop
	});

	test('stops after message_stop even if extra SSE data follows', async () => {
		// stream: text_delta 'a', message_stop, text_delta 'SHOULD_NOT_APPEAR'
		// assert: only 'a' delta present in collected events
	});

	test('yields thinking_delta events (not filtered by messages())', async () => {
		// stream: content_block_delta with thinking_delta, message_stop
		// assert: event is yielded with delta.type === 'thinking_delta'
	});

	test('yields input_json_delta events', async () => {
		// similar — verifies tool call argument streaming passes through
	});

	test('yields message_delta with stop_reason payload', async () => {
		// assert: message_delta event has delta.stop_reason === 'max_tokens'
	});

	test('messagesText() from same stream yields only text strings', async () => {
		// same stream as above — call messagesText(), assert string[] result
	});
});
```

### Suite: `messagesText()`

```typescript
suite('messagesText()', () => {

	test('yields only text_delta.text strings', async () => {
		// stream with text_delta events mixed with thinking_delta
		// assert: only text strings in result
	});

	test('filters out thinking_delta events', async () => {});

	test('filters out message_stop and lifecycle events', async () => {});

	test('empty text_delta strings are included', async () => {});

	test('forwards options.signal', async () => {
		// assert: signal reaches fetch
	});
});
```

### Suite: `countTokens`

```typescript
suite('countTokens', () => {

	test('throws "countTokens not supported by CAPI"', async () => {
		await assert.rejects(
			() => service.countTokens('gh-tok', { model: 'claude-sonnet-4-5', messages: [{ role: 'user', content: 'hi' }] }),
			(err: Error) => err.message.includes('countTokens not supported by CAPI'),
		);
	});

	test('does not mint a token before throwing', async () => {
		// verify token mint fetch is never called
	});
});
```

---

## Step 7 — Verify

```bash
# TypeScript — must be zero errors
npm run compile-check-ts-native

# Unit tests — all 95+ must pass
scripts/test.sh --grep copilotApiService
```

---

## Key risks

| Risk | Where | Mitigation |
|------|-------|-----------|
| `_sendRequest` still cherry-picks fields | `copilotApiService.ts:337–343` | Must spread `...rest` from SDK request; delete old remapping |
| `system` field double-wrapping | `_sendRequest` body builder | Keep explicit `typeof system === 'string'` normalization; CAPI requires array format |
| Positional `signal` not fully migrated | All call sites in service + tests | Grep for `, signal` and `, controller.signal` before declaring done |
| Non-streaming tests asserting `result.content` (string) | Lines ~590–657 | All must switch to `getText(result)` helper |
| `message_stop` sentinel pattern removal | `_parseDataLine` / `_readSSE` | Remove `null` return; yield event, then `return`; `finally` still calls `reader.cancel()` |
---

## Learnings (from council review post-implementation)

- **Buffer-flush path must mirror the main loop's `message_stop` early-return guard.** `_readSSE` has two paths that yield events: the main `while` loop (lines ~500–509) and a buffer-flush after the loop (lines ~511–516). The main loop correctly `return`s after yielding `message_stop`. The buffer-flush initially did not — it would yield `message_stop` but fall through naturally. Functionally identical today, but asymmetric: if someone later adds logic after the flush yield, they'd get events after `message_stop`. Always mirror the early-return guard in both paths. Fix: add `if (event.type === 'message_stop') return;` after the buffer-flush `yield event`.

- **New raw-event suites must include a `tool_use` block round-trip test.** The roadmap explicitly requires testing that `tool_use` events pass through `messages()`. The initial implementation's raw-event suite only covered lifecycle, `thinking_delta`, `input_json_delta`, and `message_delta`. `tool_use` was omitted. Whenever adding new streaming suites, check the roadmap's "Tests" section for explicitly listed cases and add them all.

- **Security-header override invariants need a separate test per method.** The `messages()` method had a test (line ~571) verifying callers cannot override `Authorization`, `Content-Type`, etc. The `models()` method did not — even though its implementation is also correct. The lack of a test means a future refactor could silently regress the security invariant. Add an equivalent header-override test for every public method that makes authenticated requests.

## Learnings (from simplify review post-implementation)

- **`MessageCreateParamsBase` is not re-exported on the `Anthropic` namespace.** The plan specified `Anthropic.MessageCreateParamsBase` as the request type, but it's an SDK internal. Use the discriminated forms: `Anthropic.MessageCreateParamsStreaming` / `Anthropic.MessageCreateParamsNonStreaming` for the overloads, and the `Anthropic.MessageCreateParams` union for the implementation signature.

- **VS Code DI constructor ordering: non-service params must come first.** `GetLeadingNonServiceArgs` strips `BrandedService`-decorated params from the **end** of the tuple. Putting non-service params (like `fetchFn`) after service params causes `createInstance` to select the wrong overload (`Expected 4 arguments, but got 2`). This contradicts the CLAUDE.md guidance that "non-service parameters come after service parameters."

- **Signal must not be shared across deduped async operations.** The original `_getCopilotToken` forwarded the caller's `AbortSignal` into the shared token mint promise. Because the mint is deduped across concurrent callers via `_pendingTokenMints`, aborting one caller's signal would cancel the mint for all callers sharing it. Fix: omit the signal from the mint call entirely; each caller forwards its signal only to its own API request.

- **Avoid `as unknown as` for SSE event parsing — use a runtime type guard.** Instead of `parsed as unknown as Anthropic.MessageStreamEvent`, validate the `type` field against a `Set` of known SSE event types (`message_start`, `message_delta`, `message_stop`, `content_block_start`, `content_block_delta`, `content_block_stop`). This cleanly separates `error` event handling (which should throw) from valid events, and avoids TypeScript error TS2367 when comparing against values not in the target type.

- **`messagesText()` was YAGNI.** No downstream phase in the roadmap consumes a text-only streaming API. This is a greenfield service with no backcompat obligations. Cut it rather than carry dead surface area. If a future caller needs text-only streaming, filtering `messages()` output is trivial.

- **`@vscode/copilot-api` ambient typings must avoid `any`.** The package uses extensionless relative imports incompatible with `moduleResolution: "nodenext"`, requiring ambient declarations in `src/typings/copilot-api.d.ts`. The original declarations used `json?: any` and `Promise<any>` — replaced with `unknown` per project coding guidelines.

- **Use `Iterable.asyncToArray` from `base/common/iterator` instead of a local `collect<T>` helper.** The codebase already has this utility; no need to duplicate it in tests.

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The result of parsing one network buffer of Anthropic-shaped Server-Sent Events (plan 27). The
 * proxy normalises BOTH backends to the same event vocabulary (`content_block_delta` with a
 * `text_delta`, terminated by `message_stop` or the SSE `[DONE]` sentinel), so the renderer parses a
 * single format regardless of backend.
 */
export interface ISseParseResult {
	/** The `text_delta` texts extracted from every COMPLETE event in this buffer, in order. */
	readonly deltas: readonly string[];
	/** True once a terminal event (`message_stop` or `[DONE]`) has been seen - the caller stops reading. */
	readonly done: boolean;
	/** The trailing bytes AFTER the last newline (a partially-received line) to prepend to the next chunk. */
	readonly remainder: string;
}

/**
 * Pure, streaming-safe parser for one buffer of SSE text. SSE events arrive split arbitrarily across
 * network chunks, so the caller keeps a rolling buffer: `buffer = remainder + nextChunk`, calls
 * `parseSseChunk(buffer)`, emits the returned `deltas`, and carries `remainder` forward. Only lines
 * terminated by a newline are consumed here; an unterminated trailing line is returned as `remainder`
 * so an event split mid-line is never mis-parsed. Malformed `data:` payloads and non-`data:` lines
 * (`event:` headers, `:` keep-alive comments, blank separators) are ignored, never thrown.
 */
export function parseSseChunk(buffer: string): ISseParseResult {
	const deltas: string[] = [];
	let done = false;

	const lastNewline = buffer.lastIndexOf('\n');
	if (lastNewline < 0) {
		// No complete line yet - hold the whole buffer for the next chunk.
		return { deltas, done, remainder: buffer };
	}
	const complete = buffer.slice(0, lastNewline);
	const remainder = buffer.slice(lastNewline + 1);

	for (const rawLine of complete.split('\n')) {
		const line = rawLine.trim();
		if (!line.startsWith('data:')) {
			// event: headers, `:` keep-alive comments and blank separators carry no text.
			continue;
		}
		const payload = line.slice('data:'.length).trim();
		if (!payload) { continue; }
		if (payload === '[DONE]') {
			done = true;
			continue;
		}
		let event: { type?: string; delta?: { type?: string; text?: string } };
		try {
			event = JSON.parse(payload);
		} catch {
			// A partial or malformed JSON payload on a completed line - skip it, never throw.
			continue;
		}
		if (event.type === 'message_stop') {
			done = true;
			continue;
		}
		if (event.type === 'content_block_delta' && event.delta && event.delta.type === 'text_delta' && typeof event.delta.text === 'string') {
			deltas.push(event.delta.text);
		}
	}

	return { deltas, done, remainder };
}

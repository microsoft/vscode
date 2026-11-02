/*---------------------------------------------------------------------------------------------
 *  Fork model router. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { ModelRouterError } from './errors.ts';

export interface SseEvent {
	readonly event: string | undefined;
	readonly data: string;
}

/**
 * Parses a server-sent event stream. Chunks may split lines and events anywhere,
 * lines may end in LF or CRLF, and a final event may arrive without a blank line.
 */
export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	let eventName: string | undefined;
	let data: string[] = [];

	function* takeLine(line: string): Generator<SseEvent> {
		if (line === '') {
			if (data.length) {
				yield { event: eventName, data: data.join('\n') };
			}
			eventName = undefined;
			data = [];
			return;
		}
		if (line.startsWith(':')) {
			return;
		}
		const colon = line.indexOf(':');
		const field = colon === -1 ? line : line.slice(0, colon);
		let value = colon === -1 ? '' : line.slice(colon + 1);
		if (value.startsWith(' ')) {
			value = value.slice(1);
		}
		if (field === 'data') {
			data.push(value);
		} else if (field === 'event') {
			eventName = value;
		}
	}

	try {
		while (true) {
			const { done, value } = await reader.read();
			buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
			let newline: number;
			while ((newline = buffer.indexOf('\n')) !== -1) {
				let line = buffer.slice(0, newline);
				buffer = buffer.slice(newline + 1);
				if (line.endsWith('\r')) {
					line = line.slice(0, -1);
				}
				yield* takeLine(line);
			}
			if (done) {
				if (buffer) {
					yield* takeLine(buffer.endsWith('\r') ? buffer.slice(0, -1) : buffer);
					buffer = '';
				}
				yield* takeLine('');
				return;
			}
		}
	} finally {
		reader.cancel().catch(() => { /* already closed */ });
	}
}

export function parseJson(data: string, what: string): Record<string, unknown> {
	try {
		const value = JSON.parse(data);
		if (value && typeof value === 'object') {
			return value as Record<string, unknown>;
		}
	} catch {
		// fall through
	}
	throw new ModelRouterError('protocol', `The endpoint sent a ${what} that is not valid JSON: ${data.slice(0, 200)}`);
}

/** Tool arguments arrive as a JSON string; bad JSON is reported instead of failing the whole turn. */
export function parseToolArguments(raw: string, toolName: string): { arguments: Record<string, unknown>; argumentsError?: string } {
	if (raw.trim() === '') {
		return { arguments: {} };
	}
	try {
		const value = JSON.parse(raw);
		if (value && typeof value === 'object' && !Array.isArray(value)) {
			return { arguments: value as Record<string, unknown> };
		}
		return { arguments: {}, argumentsError: `Arguments for tool "${toolName}" must be a JSON object.` };
	} catch {
		return { arguments: {}, argumentsError: `Arguments for tool "${toolName}" are not valid JSON: ${raw.slice(0, 200)}` };
	}
}

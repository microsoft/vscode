/*---------------------------------------------------------------------------------------------
 *  Fork model router. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { createModelClient } from './client.ts';
import { normalizeError, type ModelErrorKind } from './errors.ts';
import type { ClientOptions, ModelConfig } from './types.ts';

export interface ConnectionReport {
	/** The endpoint answered at all. */
	readonly reachable: boolean;
	/** The key was accepted. */
	readonly authenticated: boolean;
	/** A streamed reply completed. */
	readonly streaming: boolean;
	/** The model called a test tool; undefined when that check could not run. Agent mode needs true. */
	readonly toolCalling: boolean | undefined;
	/** Time to the first streamed event of the first request. */
	readonly firstTokenMs?: number;
	readonly sampleText?: string;
	readonly error?: { readonly kind: ModelErrorKind; readonly message: string };
}

export interface ConnectionTestOptions extends ClientOptions {
	/** Per request; default 30 seconds. */
	readonly timeoutMs?: number;
	/** Skip the tool-calling check. */
	readonly skipToolCheck?: boolean;
}

const TOOL_NAME = 'report_status';

/** Runs when a model is saved: checks the endpoint, the key, streaming and tool calling. */
export async function testConnection(config: ModelConfig, options: ConnectionTestOptions = {}): Promise<ConnectionReport> {
	const timeoutMs = options.timeoutMs ?? 30_000;
	let client;
	try {
		client = createModelClient(config, options);
	} catch (error) {
		const failure = normalizeError(error);
		return { reachable: false, authenticated: false, streaming: false, toolCalling: undefined, error: { kind: failure.kind, message: failure.message } };
	}

	const started = Date.now();
	let firstTokenMs: number | undefined;
	let sampleText = '';
	try {
		const stream = client.stream({
			messages: [{ role: 'user', content: 'Reply with just the word OK.' }],
			maxTokens: 64,
			signal: AbortSignal.timeout(timeoutMs),
		});
		for await (const event of stream) {
			firstTokenMs ??= Date.now() - started;
			if (event.type === 'text') {
				sampleText += event.text;
			}
		}
	} catch (error) {
		const failure = normalizeError(error);
		const reachable = failure.kind !== 'network' && failure.kind !== 'invalid_config' && failure.kind !== 'aborted';
		const message = failure.kind === 'aborted' ? `No answer within ${Math.round(timeoutMs / 1000) || 1} seconds. Check the URL, or try again if the model is still loading.` : failure.message;
		return {
			reachable,
			authenticated: reachable && failure.kind !== 'auth',
			streaming: false,
			toolCalling: undefined,
			error: { kind: failure.kind, message },
		};
	}

	let toolCalling: boolean | undefined;
	if (!options.skipToolCheck) {
		try {
			const result = await client.complete({
				messages: [{ role: 'user', content: `Call the ${TOOL_NAME} tool with status set to "ok". Do not reply with text.` }],
				tools: [{
					name: TOOL_NAME,
					description: 'Reports that the connection test passed.',
					inputSchema: { type: 'object', properties: { status: { type: 'string' } }, required: ['status'] },
				}],
				// Thinking models spend part of this budget before they call the tool.
				maxTokens: 1024,
				signal: AbortSignal.timeout(timeoutMs),
			});
			toolCalling = result.toolCalls.some(call => call.name === TOOL_NAME);
		} catch (error) {
			// A provider that rejects the tools field does not support tool calling.
			toolCalling = normalizeError(error).kind === 'bad_request' ? false : undefined;
		}
	}

	return { reachable: true, authenticated: true, streaming: true, toolCalling, firstTokenMs, sampleText: sampleText.trim() };
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { describe, expect, it, vi } from 'vitest';
import type { CancellationToken, LanguageModelChat, LanguageModelChatRequestOptions } from 'vscode';
import * as vscode from 'vscode';
import { Event } from '../../../../util/vs/base/common/event';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { ChatFetchResponseType, ChatLocation } from '../../../chat/common/commonTypes';
import { resolveOTelConfig } from '../../../otel/common/otelConfig';
import type { ICompletedSpanData, IOTelService } from '../../../otel/common/otelService';
import { CustomDataPartMimeTypes } from '../../common/endpointTypes';
import { ExtensionContributedChatEndpoint, parseExtensionContributedUsage } from '../extChatEndpoint';

type StreamChunk =
	| vscode.LanguageModelTextPart
	| vscode.LanguageModelToolCallPart
	| vscode.LanguageModelDataPart
	| vscode.LanguageModelThinkingPart;

/**
 * Minimal `LanguageModelChat` stub. `sendRequest` returns a response whose
 * `.stream` async-iterates the chunks the test wants the endpoint to see.
 */
class MockLanguageModelChat implements Partial<LanguageModelChat> {
	readonly id = 'mock-model';
	readonly name = 'Mock Model';
	readonly vendor = 'mock-vendor';
	readonly family = 'mock-family';
	readonly version = '1.0.0';
	readonly maxInputTokens = 100_000;
	readonly capabilities = {} as LanguageModelChat['capabilities'];

	constructor(private readonly chunks: StreamChunk[]) { }

	countTokens(): Thenable<number> { return Promise.resolve(0); }

	sendRequest(
		_messages: Array<vscode.LanguageModelChatMessage | vscode.LanguageModelChatMessage2>,
		_options: LanguageModelChatRequestOptions,
		_token: CancellationToken,
	): Thenable<vscode.LanguageModelChatResponse> {
		const chunks = this.chunks;
		const stream = (async function* () {
			for (const c of chunks) { yield c; }
		})();
		const text = (async function* () { /* unused */ })();
		return Promise.resolve({ stream, text } as unknown as vscode.LanguageModelChatResponse);
	}
}

function createMockOTelService(): IOTelService {
	const injectedSpans: ICompletedSpanData[] = [];
	return {
		_serviceBrand: undefined!,
		config: resolveOTelConfig({ env: {}, extensionVersion: '1.0.0', sessionId: 'test' }),
		startSpan: vi.fn() as never,
		startActiveSpan: vi.fn() as never,
		getActiveTraceContext: vi.fn(() => undefined),
		storeTraceContext: vi.fn(),
		getStoredTraceContext: vi.fn(),
		runWithTraceContext: vi.fn((_ctx: unknown, fn: () => Promise<unknown>) => fn()) as never,
		recordMetric: vi.fn(),
		incrementCounter: vi.fn(),
		emitLogRecord: vi.fn(),
		flush: vi.fn(),
		shutdown: vi.fn(),
		injectCompletedSpan(span: ICompletedSpanData) { injectedSpans.push(span); },
		onDidCompleteSpan: Event.None,
		onDidEmitSpanEvent: Event.None,
	};
}

function createEndpoint(chunks: StreamChunk[]): ExtensionContributedChatEndpoint {
	const lm = new MockLanguageModelChat(chunks) as unknown as LanguageModelChat;
	const otel = createMockOTelService();
	const instantiation: Partial<IInstantiationService> = {
		createInstance: vi.fn() as never,
		invokeFunction: vi.fn() as never,
	};
	return new ExtensionContributedChatEndpoint(
		lm,
		instantiation as IInstantiationService,
		otel,
	);
}

function usagePart(payload: unknown): vscode.LanguageModelDataPart {
	const bytes = new TextEncoder().encode(typeof payload === 'string' ? payload : JSON.stringify(payload));
	return new vscode.LanguageModelDataPart(bytes, CustomDataPartMimeTypes.Usage);
}

const ZERO_USAGE = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, prompt_tokens_details: { cached_tokens: 0 } };

const helloMessage: Raw.ChatMessage = {
	role: Raw.ChatRole.User,
	content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'hello' }],
};

describe('parseExtensionContributedUsage', () => {
	it('returns the full payload when fully shaped', () => {
		const bytes = new TextEncoder().encode(JSON.stringify({
			prompt_tokens: 100,
			completion_tokens: 200,
			total_tokens: 300,
			prompt_tokens_details: { cached_tokens: 50 },
		}));
		expect(parseExtensionContributedUsage(bytes)).toEqual({
			prompt_tokens: 100,
			completion_tokens: 200,
			total_tokens: 300,
			prompt_tokens_details: { cached_tokens: 50 },
		});
	});

	it('zero-fills missing numeric fields on a partial payload', () => {
		const bytes = new TextEncoder().encode(JSON.stringify({ prompt_tokens: 12 }));
		expect(parseExtensionContributedUsage(bytes)).toEqual({
			prompt_tokens: 12,
			completion_tokens: 0,
			total_tokens: 0,
		});
	});

	it('zero-fills cached_tokens when a partial payload includes prompt_tokens_details', () => {
		// Top-level shape is *not* a complete APIUsage (missing completion_tokens),
		// so the permissive branch runs and zero-fills cached_tokens.
		const bytes = new TextEncoder().encode(JSON.stringify({
			prompt_tokens: 1,
			prompt_tokens_details: {},
		}));
		expect(parseExtensionContributedUsage(bytes)).toEqual({
			prompt_tokens: 1,
			completion_tokens: 0,
			total_tokens: 0,
			prompt_tokens_details: { cached_tokens: 0 },
		});
	});

	it('coerces non-numeric fields to 0', () => {
		// `JSON.stringify(NaN)` becomes `null`, so use only types that
		// actually round-trip through the wire format. Non-finite handling
		// is exercised separately below. `total_tokens: 1` keeps the
		// payload above the no-signal-rejection threshold so the coercion
		// of the other two fields is observable.
		const bytes = new TextEncoder().encode(JSON.stringify({
			prompt_tokens: 'oops', completion_tokens: null, total_tokens: 1,
		}));
		expect(parseExtensionContributedUsage(bytes)).toEqual({
			prompt_tokens: 0, completion_tokens: 0, total_tokens: 1,
		});
	});

	it('coerces non-finite numeric fields (Infinity) to 0', () => {
		// `JSON.parse('1e999')` yields `Infinity` — a value `isApiUsage`
		// accepts (it's `typeof === 'number'`) but that would poison any
		// downstream arithmetic / OTel attribute. Hand-build the JSON
		// because `JSON.stringify(Infinity)` lossily becomes `null`.
		const bytes = new TextEncoder().encode(
			'{"prompt_tokens":1e999,"completion_tokens":-1e999,"total_tokens":1}'
		);
		expect(parseExtensionContributedUsage(bytes)).toEqual({
			prompt_tokens: 0,
			completion_tokens: 0,
			total_tokens: 1,
			prompt_tokens_details: { cached_tokens: 0 },
		});
	});

	it('clamps negative numeric fields to 0 even when isApiUsage is satisfied', () => {
		// Defends ChatResponseModel.setUsage's monotonic completion-token
		// counter against a misbehaving provider emitting negatives. The
		// positive `total_tokens: 1` keeps the payload above the no-signal
		// threshold so the negative-clamp on the other fields is observable.
		const bytes = new TextEncoder().encode(JSON.stringify({
			prompt_tokens: -100,
			completion_tokens: -50,
			total_tokens: 1,
			prompt_tokens_details: { cached_tokens: -10 },
		}));
		expect(parseExtensionContributedUsage(bytes)).toEqual({
			prompt_tokens: 0,
			completion_tokens: 0,
			total_tokens: 1,
			prompt_tokens_details: { cached_tokens: 0 },
		});
	});

	it('rejects payloads that produce an all-zero, detail-less result after coercion', () => {
		// These all parse to JSON objects with at least one recognised key,
		// but none survives coercion as a positive signal. Treating them as
		// valid would let a misbehaving provider clobber an earlier valid
		// reading at the last-valid-wins dispatch site in `makeChatRequest2`.
		expect(parseExtensionContributedUsage(new TextEncoder().encode(
			JSON.stringify({ prompt_tokens_details: 'oops' })
		))).toBeUndefined();
		expect(parseExtensionContributedUsage(new TextEncoder().encode(
			JSON.stringify({ completion_tokens_details: null })
		))).toBeUndefined();
		expect(parseExtensionContributedUsage(new TextEncoder().encode(
			JSON.stringify({ prompt_tokens_details: {} })
		))).toBeUndefined();
		expect(parseExtensionContributedUsage(new TextEncoder().encode(
			JSON.stringify({ prompt_tokens: -3, completion_tokens: -5 })
		))).toBeUndefined();
	});

	it('preserves provider-supplied extra fields on the strict path', () => {
		// `APIUsage` carries optional `completion_tokens_details` and
		// `cache_creation_input_tokens` that the host doesn't read today
		// but a provider may emit; surface them faithfully so future
		// consumers (or telemetry) see the wire data unchanged.
		const bytes = new TextEncoder().encode(JSON.stringify({
			prompt_tokens: 10, completion_tokens: 5, total_tokens: 15,
			prompt_tokens_details: { cached_tokens: 1, cache_creation_input_tokens: 2 },
			completion_tokens_details: { reasoning_tokens: 3, accepted_prediction_tokens: 0, rejected_prediction_tokens: 0 },
		}));
		expect(parseExtensionContributedUsage(bytes)).toEqual({
			prompt_tokens: 10, completion_tokens: 5, total_tokens: 15,
			prompt_tokens_details: { cached_tokens: 1, cache_creation_input_tokens: 2 },
			completion_tokens_details: { reasoning_tokens: 3, accepted_prediction_tokens: 0, rejected_prediction_tokens: 0 },
		});
	});

	it('clamps negative values inside nested detail objects', () => {
		// Same defence as the top-level negative-clamp test, but for the
		// optional nested details. Without this clamp a provider could
		// leak negative `cache_creation_input_tokens` /
		// `reasoning_tokens` into OTel attributes via the strict path.
		const bytes = new TextEncoder().encode(JSON.stringify({
			prompt_tokens: 10, completion_tokens: 5, total_tokens: 15,
			prompt_tokens_details: { cached_tokens: -1, cache_creation_input_tokens: -2 },
			completion_tokens_details: { reasoning_tokens: -3, accepted_prediction_tokens: -4, rejected_prediction_tokens: -5 },
		}));
		expect(parseExtensionContributedUsage(bytes)).toEqual({
			prompt_tokens: 10, completion_tokens: 5, total_tokens: 15,
			prompt_tokens_details: { cached_tokens: 0, cache_creation_input_tokens: 0 },
			completion_tokens_details: { reasoning_tokens: 0, accepted_prediction_tokens: 0, rejected_prediction_tokens: 0 },
		});
	});

	it('drops nested detail objects when the provider sends a non-object', () => {
		// A provider that wires up `prompt_tokens_details` as a string or
		// array would otherwise leak that malformed shape through to
		// telemetry. Drop the nested object so downstream always sees
		// either a well-formed object or nothing.
		const bytes = new TextEncoder().encode(JSON.stringify({
			prompt_tokens: 10, completion_tokens: 5, total_tokens: 15,
			prompt_tokens_details: 'oops',
			completion_tokens_details: [1, 2, 3],
		}));
		const result = parseExtensionContributedUsage(bytes);
		expect(result).toBeDefined();
		expect(result!.prompt_tokens).toBe(10);
		expect(result!.completion_tokens).toBe(5);
		expect(result!.total_tokens).toBe(15);
		// Strict path falls back to the historical zero-shape so consumers
		// reading `usage.prompt_tokens_details?.cached_tokens` see a stable value.
		expect(result!.prompt_tokens_details).toEqual({ cached_tokens: 0 });
		expect(result!.completion_tokens_details).toBeUndefined();
	});

	it('returns undefined on malformed JSON', () => {
		const bytes = new TextEncoder().encode('not json');
		expect(parseExtensionContributedUsage(bytes)).toBeUndefined();
	});

	it('returns undefined on a non-object JSON payload', () => {
		expect(parseExtensionContributedUsage(new TextEncoder().encode('42'))).toBeUndefined();
		expect(parseExtensionContributedUsage(new TextEncoder().encode('"a"'))).toBeUndefined();
		expect(parseExtensionContributedUsage(new TextEncoder().encode('null'))).toBeUndefined();
		// Top-level arrays must be rejected even though `typeof [] === 'object'`.
		// Otherwise a stray `[]` chunk would parse to a zero-filled `APIUsage`
		// and could overwrite an earlier valid reading at the dispatch site.
		expect(parseExtensionContributedUsage(new TextEncoder().encode('[]'))).toBeUndefined();
		expect(parseExtensionContributedUsage(new TextEncoder().encode('[1,2,3]'))).toBeUndefined();
	});

	it('returns undefined for empty / keyless objects', () => {
		// `{}` and `{foo:'bar'}` parse to all-zero `APIUsage` and would
		// clobber an earlier valid reading at the last-valid-wins dispatch
		// site. The Usage data-part is for *reporting* counts, so a payload
		// with no recognised key (or no positive signal — see the
		// adjacent all-zero-rejection test) is treated as "this payload
		// says nothing" rather than "all counts are zero".
		expect(parseExtensionContributedUsage(new TextEncoder().encode('{}'))).toBeUndefined();
		expect(parseExtensionContributedUsage(new TextEncoder().encode('{"foo":"bar"}'))).toBeUndefined();
	});

	it('accepts a payload that carries only a non-zero nested-detail signal', () => {
		// A provider that only meaningfully reports `cached_tokens` (e.g. a
		// cache-hit scenario) without surfacing top-level counters is still
		// communicating useful information and must be propagated.
		const bytes = new TextEncoder().encode(JSON.stringify({ prompt_tokens_details: { cached_tokens: 5 } }));
		expect(parseExtensionContributedUsage(bytes)).toEqual({
			prompt_tokens: 0,
			completion_tokens: 0,
			total_tokens: 0,
			prompt_tokens_details: { cached_tokens: 5 },
		});
	});
});

describe('ExtensionContributedChatEndpoint.makeChatRequest2 – usage propagation', () => {
	const noopFinish = async () => undefined;
	const noToken = { isCancellationRequested: false, onCancellationRequested: Event.None } as unknown as CancellationToken;

	it('falls back to zero usage when the provider emits no Usage part (regression for #314722)', async () => {
		const endpoint = createEndpoint([new vscode.LanguageModelTextPart('hi')]);
		const result = await endpoint.makeChatRequest2({
			debugName: 't', messages: [helloMessage], finishedCb: noopFinish, location: ChatLocation.Other,
		}, noToken);
		expect(result.type).toBe(ChatFetchResponseType.Success);
		if (result.type === ChatFetchResponseType.Success) {
			expect(result.usage).toEqual(ZERO_USAGE);
			expect(result.value).toBe('hi');
		}
	});

	it('propagates a fully-shaped Usage data part', async () => {
		const endpoint = createEndpoint([
			new vscode.LanguageModelTextPart('answer'),
			usagePart({
				prompt_tokens: 12345,
				completion_tokens: 678,
				total_tokens: 13023,
				prompt_tokens_details: { cached_tokens: 9000 },
			}),
		]);
		const result = await endpoint.makeChatRequest2({
			debugName: 't', messages: [helloMessage], finishedCb: noopFinish, location: ChatLocation.Other,
		}, noToken);
		expect(result.type).toBe(ChatFetchResponseType.Success);
		if (result.type === ChatFetchResponseType.Success) {
			expect(result.usage).toEqual({
				prompt_tokens: 12345,
				completion_tokens: 678,
				total_tokens: 13023,
				prompt_tokens_details: { cached_tokens: 9000 },
			});
		}
	});

	it('propagates cached_tokens through prompt_tokens_details', async () => {
		const endpoint = createEndpoint([
			new vscode.LanguageModelTextPart('x'),
			usagePart({
				prompt_tokens: 100, completion_tokens: 50, total_tokens: 150,
				prompt_tokens_details: { cached_tokens: 80 },
			}),
		]);
		const result = await endpoint.makeChatRequest2({
			debugName: 't', messages: [helloMessage], finishedCb: noopFinish, location: ChatLocation.Other,
		}, noToken);
		if (result.type === ChatFetchResponseType.Success) {
			expect(result.usage?.prompt_tokens_details?.cached_tokens).toBe(80);
		}
	});

	it('falls back to zero usage when the Usage payload is malformed JSON', async () => {
		const endpoint = createEndpoint([
			new vscode.LanguageModelTextPart('x'),
			usagePart('definitely-not-json'),
		]);
		const result = await endpoint.makeChatRequest2({
			debugName: 't', messages: [helloMessage], finishedCb: noopFinish, location: ChatLocation.Other,
		}, noToken);
		if (result.type === ChatFetchResponseType.Success) {
			expect(result.usage).toEqual(ZERO_USAGE);
		}
	});

	it('zero-fills a partial Usage payload (only prompt_tokens) without crashing', async () => {
		const endpoint = createEndpoint([
			new vscode.LanguageModelTextPart('x'),
			usagePart({ prompt_tokens: 7 }),
		]);
		const result = await endpoint.makeChatRequest2({
			debugName: 't', messages: [helloMessage], finishedCb: noopFinish, location: ChatLocation.Other,
		}, noToken);
		if (result.type === ChatFetchResponseType.Success) {
			expect(result.usage).toEqual({ prompt_tokens: 7, completion_tokens: 0, total_tokens: 0 });
		}
	});

	it('uses the last valid Usage part when the provider emits more than one (last-valid-wins)', async () => {
		const endpoint = createEndpoint([
			new vscode.LanguageModelTextPart('x'),
			usagePart({ prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }),
			usagePart({ prompt_tokens: 99, completion_tokens: 1, total_tokens: 100 }),
		]);
		const result = await endpoint.makeChatRequest2({
			debugName: 't', messages: [helloMessage], finishedCb: noopFinish, location: ChatLocation.Other,
		}, noToken);
		if (result.type === ChatFetchResponseType.Success) {
			expect(result.usage?.prompt_tokens).toBe(99);
		}
	});

	it('keeps the previous valid Usage when a later part fails to parse', async () => {
		// Pins the contract documented at the dispatch site: a malformed
		// trailing Usage part must not blow away an earlier valid reading.
		const endpoint = createEndpoint([
			new vscode.LanguageModelTextPart('x'),
			usagePart({ prompt_tokens: 42, completion_tokens: 7, total_tokens: 49 }),
			new vscode.LanguageModelDataPart(new TextEncoder().encode('not json'), 'usage'),
		]);
		const result = await endpoint.makeChatRequest2({
			debugName: 't', messages: [helloMessage], finishedCb: noopFinish, location: ChatLocation.Other,
		}, noToken);
		if (result.type === ChatFetchResponseType.Success) {
			expect(result.usage?.prompt_tokens).toBe(42);
			expect(result.usage?.completion_tokens).toBe(7);
		}
	});

	it('keeps the previous valid Usage when a later part is an empty object', async () => {
		// `{}` parses to JSON successfully but carries no usage keys, so
		// it must be treated as "this part says nothing" and not overwrite
		// the earlier valid reading.
		const endpoint = createEndpoint([
			new vscode.LanguageModelTextPart('x'),
			usagePart({ prompt_tokens: 42, completion_tokens: 7, total_tokens: 49 }),
			usagePart({}),
		]);
		const result = await endpoint.makeChatRequest2({
			debugName: 't', messages: [helloMessage], finishedCb: noopFinish, location: ChatLocation.Other,
		}, noToken);
		if (result.type === ChatFetchResponseType.Success) {
			expect(result.usage?.prompt_tokens).toBe(42);
			expect(result.usage?.completion_tokens).toBe(7);
		}
	});

	it('tolerates malformed JSON on a ContextManagement data part without aborting the stream', async () => {
		// `ContextManagement` is also extension-provided, so a bad payload
		// shouldn't be able to throw out of the response loop. The endpoint
		// should still emit the text and a fresh usage tally that follows.
		const endpoint = createEndpoint([
			new vscode.LanguageModelTextPart('x'),
			new vscode.LanguageModelDataPart(new TextEncoder().encode('not json'), CustomDataPartMimeTypes.ContextManagement),
			usagePart({ prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 }),
		]);
		const result = await endpoint.makeChatRequest2({
			debugName: 't', messages: [helloMessage], finishedCb: noopFinish, location: ChatLocation.Other,
		}, noToken);
		expect(result.type).toBe(ChatFetchResponseType.Success);
		if (result.type === ChatFetchResponseType.Success) {
			expect(result.usage?.prompt_tokens).toBe(5);
		}
	});
});

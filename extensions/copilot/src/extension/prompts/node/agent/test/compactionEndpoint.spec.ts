/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, suite, test } from 'vitest';
import { ConfigKey } from '../../../../../platform/configuration/common/configurationService';
import { IChatEndpoint } from '../../../../../platform/networking/common/networking';
import { DEFAULT_COMPACTION_MODEL, buildCompactionToolOpts, formatCompactionFailureError, resolveCompactionEndpoint } from '../compactionEndpoint';

type ConfigValues = {
	[ConfigKey.Advanced.ConversationCompactionModel.id]?: string;
	[ConfigKey.Advanced.ConversationCompactionUseAgenticProxy.id]?: boolean;
};

function setup(configValues: ConfigValues = {}) {
	const configurationService = {
		getExperimentBasedConfig(key: { id: string }) {
			return (configValues as Record<string, unknown>)[key.id];
		},
	};
	const experimentationService = {};
	const logService = { warn: () => { } };

	return { configurationService, experimentationService, logService };
}

function makeMainEndpoint(model = 'main-agent-model'): IChatEndpoint {
	// We never call methods on the main endpoint in these tests — identity check
	// is all that matters for the "passthrough" cases.
	return { model } as unknown as IChatEndpoint;
}

suite('resolveCompactionEndpoint', () => {
	test('returns main endpoint when neither flag is set', async () => {
		const { configurationService, experimentationService, logService } = setup();
		const main = makeMainEndpoint();
		const endpointProvider = { getChatEndpoint: async () => { throw new Error('should not be called'); } };

		const result = await resolveCompactionEndpoint(
			main,
			configurationService as never,
			experimentationService as never,
			endpointProvider as never,
			logService as never,
		);

		expect(result).toBe(main);
	});

	test('routes through endpointProvider (CAPI) with the default model when only useAgenticProxy is set', async () => {
		const { configurationService, experimentationService, logService } = setup({
			[ConfigKey.Advanced.ConversationCompactionUseAgenticProxy.id]: true,
		});
		const main = makeMainEndpoint();
		const capiEndpoint = makeMainEndpoint('trajectory-compaction');
		const calls: string[] = [];
		const endpointProvider = {
			async getChatEndpoint(family: string) {
				calls.push(family);
				return capiEndpoint;
			},
		};

		const result = await resolveCompactionEndpoint(
			main,
			configurationService as never,
			experimentationService as never,
			endpointProvider as never,
			logService as never,
		);

		// The compaction request is resolved through the standard CAPI endpoint
		// provider, NOT wrapped in ProxyAgenticEndpoint — even though the gating
		// flag is named `useAgenticProxy`.
		expect(calls).toEqual([DEFAULT_COMPACTION_MODEL]);
		expect(DEFAULT_COMPACTION_MODEL).toBe('trajectory-compaction');
		expect(result).toBe(capiEndpoint);
	});

	test('routes through endpointProvider with a custom model when both flags are set', async () => {
		const { configurationService, experimentationService, logService } = setup({
			[ConfigKey.Advanced.ConversationCompactionUseAgenticProxy.id]: true,
			[ConfigKey.Advanced.ConversationCompactionModel.id]: 'trajectory-compaction-v2',
		});
		const main = makeMainEndpoint();
		const customEndpoint = makeMainEndpoint('trajectory-compaction-v2');
		const calls: string[] = [];
		const endpointProvider = {
			async getChatEndpoint(family: string) {
				calls.push(family);
				return customEndpoint;
			},
		};

		const result = await resolveCompactionEndpoint(
			main,
			configurationService as never,
			experimentationService as never,
			endpointProvider as never,
			logService as never,
		);

		expect(calls).toEqual(['trajectory-compaction-v2']);
		expect(result).toBe(customEndpoint);
	});

	test('routes through endpointProvider when only model is set (proxy disabled)', async () => {
		const { configurationService, experimentationService, logService } = setup({
			[ConfigKey.Advanced.ConversationCompactionModel.id]: 'gpt-4o-mini',
		});
		const main = makeMainEndpoint();
		const customEndpoint = makeMainEndpoint('gpt-4o-mini');
		const calls: string[] = [];
		const endpointProvider = {
			async getChatEndpoint(family: string) {
				calls.push(family);
				return customEndpoint;
			},
		};

		const result = await resolveCompactionEndpoint(
			main,
			configurationService as never,
			experimentationService as never,
			endpointProvider as never,
			logService as never,
		);

		expect(calls).toEqual(['gpt-4o-mini']);
		expect(result).toBe(customEndpoint);
	});

	test('falls back to main endpoint when endpointProvider.getChatEndpoint rejects', async () => {
		const warnings: string[] = [];
		const { configurationService, experimentationService } = setup({
			[ConfigKey.Advanced.ConversationCompactionModel.id]: 'not-a-real-model',
		});
		const main = makeMainEndpoint();
		const endpointProvider = {
			async getChatEndpoint() {
				throw new Error('model not found');
			},
		};

		const result = await resolveCompactionEndpoint(
			main,
			configurationService as never,
			experimentationService as never,
			endpointProvider as never,
			{ warn: (msg: string) => warnings.push(msg) } as never,
		);

		expect(result).toBe(main);
		expect(warnings.length).toBe(1);
		expect(warnings[0]).toContain('not-a-real-model');
		expect(warnings[0]).toContain('model not found');
	});

	test('falls back to main endpoint when the proxy-default model fails to resolve', async () => {
		const warnings: string[] = [];
		const { configurationService, experimentationService } = setup({
			[ConfigKey.Advanced.ConversationCompactionUseAgenticProxy.id]: true,
		});
		const main = makeMainEndpoint();
		const endpointProvider = {
			async getChatEndpoint() {
				throw new Error('model not found');
			},
		};

		const result = await resolveCompactionEndpoint(
			main,
			configurationService as never,
			experimentationService as never,
			endpointProvider as never,
			{ warn: (msg: string) => warnings.push(msg) } as never,
		);

		expect(result).toBe(main);
		expect(warnings.length).toBe(1);
		expect(warnings[0]).toContain(DEFAULT_COMPACTION_MODEL);
	});
});

suite('buildCompactionToolOpts', () => {
	// Minimal stand-in for vscode.LanguageModelToolInformation. Only the
	// shape that the helper actually reads is required at runtime.
	function makeTool(name: string, parameters?: Record<string, unknown>) {
		return {
			name,
			description: `${name} description`,
			inputSchema: parameters ?? {},
			tags: [],
			source: undefined,
		} as never;
	}

	test('returns undefined when there are no tools', () => {
		expect(buildCompactionToolOpts(undefined, 'trajectory-compaction', () => { })).toBeUndefined();
		expect(buildCompactionToolOpts([], 'trajectory-compaction', () => { })).toBeUndefined();
	});

	test('pairs tools with tool_choice:"none" so summarisation models never invoke a tool', () => {
		// Regression: the background auto-compaction path used to send
		// `tools` with no `tool_choice`, defaulting to `auto`. Text-only
		// summarisation models then returned empty completions and the
		// caller threw "Response contained no choices".
		const result = buildCompactionToolOpts(
			[makeTool('read_file', { type: 'object', properties: { path: { type: 'string' } } })],
			'trajectory-compaction',
			() => { },
		);

		expect(result).toBeDefined();
		expect(result!.tool_choice).toBe('none');
		expect(result!.tools).toHaveLength(1);
		expect(result!.tools[0].function.name).toBe('read_file');
		// `tool_choice` must never be set without `tools` (the API rejects
		// that combination with HTTP 400).
		expect(Object.keys(result!).sort()).toEqual(['tool_choice', 'tools']);
	});

	test('omits parameters when the tool has no inputSchema keys (mirrors the inline behaviour)', () => {
		const result = buildCompactionToolOpts(
			[makeTool('no_args' /* inputSchema = {} */)],
			'trajectory-compaction',
			() => { },
		);

		expect(result).toBeDefined();
		expect(result!.tools[0].function.parameters).toBeUndefined();
	});
});

suite('formatCompactionFailureError', () => {
	// Mirrors the real `ChatFetchResponseType.Unknown` shape that
	// chatMLFetcher returns when the proxy streams only empty content deltas
	// (observed live against trajectory-compaction-v1: 375 SSE events,
	// `delta.content: ""` each, finish_reason `stop`, then the chat fetcher
	// treats the empty completion as repetitive and falls through to the
	// "no choices" branch — see RESPONSE_CONTAINED_NO_CHOICES in
	// platform/chat/common/commonTypes.ts).

	test('includes reason and requestId when the response carries them', () => {
		const err = formatCompactionFailureError({
			type: 'unknown',
			reason: 'Response contained no choices.',
			requestId: 'req-123',
			serverRequestId: 'srv-456',
		});

		expect(err.message).toBe('Background summarization request failed: type=unknown, reason=Response contained no choices., requestId=req-123');
	});

	test('falls back to type-only when reason and requestId are absent', () => {
		const err = formatCompactionFailureError({ type: 'networkError' });
		expect(err.message).toBe('Background summarization request failed: type=networkError');
	});

	test('omits reason when it is not a string (defensive against type drift)', () => {
		const err = formatCompactionFailureError({ type: 'failed', reason: 42 as unknown });
		expect(err.message).toBe('Background summarization request failed: type=failed');
	});
});

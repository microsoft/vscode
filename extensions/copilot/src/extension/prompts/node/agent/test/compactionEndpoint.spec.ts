/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RequestType } from '@vscode/copilot-api';
import { expect, suite, test } from 'vitest';
import { ConfigKey } from '../../../../../platform/configuration/common/configurationService';
import { ProxyAgenticEndpoint } from '../../../../../platform/endpoint/node/proxyAgenticEndpoint';
import { IChatEndpoint } from '../../../../../platform/networking/common/networking';
import { ITestingServicesAccessor } from '../../../../../platform/test/node/services';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { DEFAULT_COMPACTION_AGENTIC_PROXY_MODEL, buildCompactionToolOpts, formatCompactionFailureError, resolveCompactionEndpoint } from '../compactionEndpoint';

type ConfigValues = {
	[ConfigKey.Advanced.ConversationCompactionModel.id]?: string;
	[ConfigKey.Advanced.ConversationCompactionUseAgenticProxy.id]?: boolean;
};

function setup(configValues: ConfigValues = {}) {
	const services = createExtensionUnitTestingServices();
	const accessor: ITestingServicesAccessor = services.createTestingAccessor();
	const instantiationService = accessor.get(IInstantiationService);

	const configurationService = {
		getExperimentBasedConfig(key: { id: string }) {
			return (configValues as Record<string, unknown>)[key.id];
		},
	};
	const experimentationService = {};
	const logService = { warn: () => { } };

	return { accessor, instantiationService, configurationService, experimentationService, logService };
}

function makeMainEndpoint(model = 'main-agent-model'): IChatEndpoint {
	// We never call methods on the main endpoint in these tests — identity check
	// is all that matters for the "passthrough" cases.
	return { model } as unknown as IChatEndpoint;
}

suite('resolveCompactionEndpoint', () => {
	test('returns main endpoint when neither flag is set', async () => {
		const { instantiationService, configurationService, experimentationService, logService } = setup();
		const main = makeMainEndpoint();
		const endpointProvider = { getChatEndpoint: async () => { throw new Error('should not be called'); } };

		const result = await resolveCompactionEndpoint(
			main,
			instantiationService,
			configurationService as never,
			experimentationService as never,
			endpointProvider as never,
			logService as never,
		);

		expect(result).toBe(main);
	});

	test('routes through ProxyAgenticEndpoint with the default model when only useAgenticProxy is set', async () => {
		const { instantiationService, configurationService, experimentationService, logService } = setup({
			[ConfigKey.Advanced.ConversationCompactionUseAgenticProxy.id]: true,
		});
		const main = makeMainEndpoint();
		const endpointProvider = { getChatEndpoint: async () => { throw new Error('should not be called'); } };

		const result = await resolveCompactionEndpoint(
			main,
			instantiationService,
			configurationService as never,
			experimentationService as never,
			endpointProvider as never,
			logService as never,
		);

		expect(result).toBeInstanceOf(ProxyAgenticEndpoint);
		expect(result.model).toBe(DEFAULT_COMPACTION_AGENTIC_PROXY_MODEL);
		expect(DEFAULT_COMPACTION_AGENTIC_PROXY_MODEL).toBe('trajectory-compaction-v1');
	});

	test('routes through ProxyAgenticEndpoint with a custom model when both flags are set', async () => {
		const { instantiationService, configurationService, experimentationService, logService } = setup({
			[ConfigKey.Advanced.ConversationCompactionUseAgenticProxy.id]: true,
			[ConfigKey.Advanced.ConversationCompactionModel.id]: 'trajectory-compaction-v2',
		});
		const main = makeMainEndpoint();
		const endpointProvider = { getChatEndpoint: async () => { throw new Error('should not be called'); } };

		const result = await resolveCompactionEndpoint(
			main,
			instantiationService,
			configurationService as never,
			experimentationService as never,
			endpointProvider as never,
			logService as never,
		);

		expect(result).toBeInstanceOf(ProxyAgenticEndpoint);
		expect(result.model).toBe('trajectory-compaction-v2');
	});

	test('routes through endpointProvider when only model is set (proxy disabled)', async () => {
		const { instantiationService, configurationService, experimentationService, logService } = setup({
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
			instantiationService,
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
		const { instantiationService, configurationService, experimentationService } = setup({
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
			instantiationService,
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
});

suite('ProxyAgenticEndpoint (compaction integration)', () => {
	test('emits ProxyChatCompletions request metadata', () => {
		const services = createExtensionUnitTestingServices();
		const accessor = services.createTestingAccessor();
		const endpoint = accessor.get(IInstantiationService).createInstance(
			ProxyAgenticEndpoint,
			DEFAULT_COMPACTION_AGENTIC_PROXY_MODEL,
			undefined,
		);

		expect(endpoint.model).toBe('trajectory-compaction-v1');
		expect(endpoint.family).toBe('trajectory-compaction-v1');
		expect(endpoint.urlOrRequestMetadata).toEqual({ type: RequestType.ProxyChatCompletions });
	});

	test('cloneWithTokenOverride preserves proxy routing and applies the token budget', () => {
		const services = createExtensionUnitTestingServices();
		const accessor = services.createTestingAccessor();
		const endpoint = accessor.get(IInstantiationService).createInstance(
			ProxyAgenticEndpoint,
			DEFAULT_COMPACTION_AGENTIC_PROXY_MODEL,
			undefined,
		);

		const cloned = endpoint.cloneWithTokenOverride(64_000);

		expect(cloned).toBeInstanceOf(ProxyAgenticEndpoint);
		expect(cloned.model).toBe('trajectory-compaction-v1');
		expect(cloned.modelMaxPromptTokens).toBe(64_000);
		// Critical: without the override the cloned endpoint would silently lose
		// proxy routing (base ChatEndpoint.cloneWithTokenOverride creates a plain
		// ChatEndpoint). Verify the proxy metadata is preserved.
		expect((cloned as ProxyAgenticEndpoint).urlOrRequestMetadata).toEqual({
			type: RequestType.ProxyChatCompletions,
		});
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
		expect(buildCompactionToolOpts(undefined, 'trajectory-compaction-v1', () => { })).toBeUndefined();
		expect(buildCompactionToolOpts([], 'trajectory-compaction-v1', () => { })).toBeUndefined();
	});

	test('pairs tools with tool_choice:"none" so summarisation models never invoke a tool', () => {
		// Regression: the background auto-compaction path used to send
		// `tools` with no `tool_choice`, defaulting to `auto`. Text-only
		// proxy models (e.g. trajectory-compaction-v1) then returned empty
		// completions and the caller threw "Response contained no choices".
		const result = buildCompactionToolOpts(
			[makeTool('read_file', { type: 'object', properties: { path: { type: 'string' } } })],
			'trajectory-compaction-v1',
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
			'trajectory-compaction-v1',
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

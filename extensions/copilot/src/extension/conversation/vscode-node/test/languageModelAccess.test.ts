/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as vscode from 'vscode';
import { IChatMLFetcher } from '../../../../platform/chat/common/chatMLFetcher';
import { ChatFetchResponseType } from '../../../../platform/chat/common/commonTypes';
import { MockChatMLFetcher } from '../../../../platform/chat/test/common/mockChatMLFetcher';
import { CopilotToken, createTestExtendedTokenInfo } from '../../../../platform/authentication/common/copilotToken';
import { ICopilotTokenManager } from '../../../../platform/authentication/common/copilotTokenManager';
import { IAutomodeService } from '../../../../platform/endpoint/node/automodeService';
import { IEndpointProvider } from '../../../../platform/endpoint/common/endpointProvider';
import { CustomDataPartMimeTypes } from '../../../../platform/endpoint/common/endpointTypes';
import { CopilotChatEndpoint } from '../../../../platform/endpoint/node/copilotChatEndpoint';
import { IEnvService } from '../../../../platform/env/common/envService';
import { IVSCodeExtensionContext } from '../../../../platform/extContext/common/extensionContext';
import { IChatEndpoint } from '../../../../platform/networking/common/networking';
import { ITestingServicesAccessor } from '../../../../platform/test/node/services';
import { TokenizerType } from '../../../../util/common/tokenizer';
import { DeferredPromise, raceTimeout } from '../../../../util/vs/base/common/async';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { Event } from '../../../../util/vs/base/common/event';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionTestingServices } from '../../../test/vscode-node/services';
import { buildUtilityAliasModelInfo, CopilotLanguageModelWrapper, LanguageModelAccess } from '../languageModelAccess';
import { buildReasoningEffortSchemaProperty, formatPricingLabel, normalizeTokenPrices, pickDefaultReasoningEffort } from '../../common/languageModelAccess';


suite('CopilotLanguageModelWrapper', () => {
	let accessor: ITestingServicesAccessor;
	let instaService: IInstantiationService;

	function createAccessor(vscodeExtensionContext?: IVSCodeExtensionContext) {
		const testingServiceCollection = createExtensionTestingServices();
		testingServiceCollection.define(IChatMLFetcher, new MockChatMLFetcher());

		accessor = testingServiceCollection.createTestingAccessor();
		instaService = accessor.get(IInstantiationService);
	}

	suite('validateRequest - invalid', () => {
		let wrapper: CopilotLanguageModelWrapper;
		let endpoint: IChatEndpoint;
		setup(async () => {
			createAccessor();
			endpoint = await accessor.get(IEndpointProvider).getChatEndpoint('copilot-utility');
			wrapper = instaService.createInstance(CopilotLanguageModelWrapper);
		});

		const runTest = async (messages: vscode.LanguageModelChatMessage[], tools?: vscode.LanguageModelChatTool[], errMsg?: string) => {
			await assert.rejects(
				() => wrapper.provideLanguageModelResponse(endpoint, messages, { tools, requestInitiator: 'unknown', toolMode: vscode.LanguageModelChatToolMode.Auto }, vscode.extensions.all[0].id, { report: () => { } }, CancellationToken.None),
				err => {
					errMsg ??= 'Invalid request';
					assert.ok(err instanceof Error, 'expected an Error');
					assert.ok(err.message.includes(errMsg), `expected error to include "${errMsg}", got ${err.message}`);
					return true;
				}
			);
		};

		test('empty', async () => {
			await runTest([]);
		});

		test('bad tool name', async () => {
			await runTest([vscode.LanguageModelChatMessage.User('hello')], [{ name: 'hello world', description: 'my tool' }], 'Invalid tool name');
		});
	});

	suite('validateRequest - valid', () => {
		let wrapper: CopilotLanguageModelWrapper;
		let endpoint: IChatEndpoint;
		setup(async () => {
			createAccessor();
			endpoint = await accessor.get(IEndpointProvider).getChatEndpoint('copilot-utility');
			wrapper = instaService.createInstance(CopilotLanguageModelWrapper);
		});
		const runTest = async (messages: vscode.LanguageModelChatMessage[], tools?: vscode.LanguageModelChatTool[]) => {
			await wrapper.provideLanguageModelResponse(endpoint, messages, { tools, requestInitiator: 'unknown', toolMode: vscode.LanguageModelChatToolMode.Auto }, vscode.extensions.all[0].id, { report: () => { } }, CancellationToken.None);
		};

		test('simple', async () => {
			await runTest([vscode.LanguageModelChatMessage.User('hello')]);
		});

		test('tool call and user message', async () => {
			const toolCall = vscode.LanguageModelChatMessage.Assistant('');
			toolCall.content = [new vscode.LanguageModelToolCallPart('id', 'func', { param: 123 })];
			const toolResult = vscode.LanguageModelChatMessage.User('');
			toolResult.content = [new vscode.LanguageModelToolResultPart('id', [new vscode.LanguageModelTextPart('result')])];
			await runTest([toolCall, toolResult, vscode.LanguageModelChatMessage.User('user message')]);
		});

		test('good tool name', async () => {
			await runTest([vscode.LanguageModelChatMessage.User('hello2')], [{ name: 'hello_world', description: 'my tool' }]);
		});
	});

	suite('usage emission', () => {
		let wrapper: CopilotLanguageModelWrapper;
		let endpoint: IChatEndpoint;
		let fetcher: MockChatMLFetcher;
		setup(async () => {
			createAccessor();
			fetcher = accessor.get(IChatMLFetcher) as MockChatMLFetcher;
			endpoint = await accessor.get(IEndpointProvider).getChatEndpoint('copilot-utility');
			wrapper = instaService.createInstance(CopilotLanguageModelWrapper);
		});

		test('reports usage as a LanguageModelDataPart', async () => {
			const expectedUsage = {
				prompt_tokens: 100,
				completion_tokens: 50,
				total_tokens: 150,
				prompt_tokens_details: { cached_tokens: 10 }
			};
			fetcher.setNextResponse({
				type: ChatFetchResponseType.Success,
				requestId: 'test-request-id',
				serverRequestId: 'test-server-request-id',
				usage: expectedUsage,
				value: 'hello',
				resolvedModel: 'test-model'
			});

			const reportedParts: vscode.LanguageModelResponsePart2[] = [];
			await wrapper.provideLanguageModelResponse(
				endpoint,
				[vscode.LanguageModelChatMessage.User('hello')],
				{ requestInitiator: 'unknown', toolMode: vscode.LanguageModelChatToolMode.Auto },
				vscode.extensions.all[0].id,
				{ report: part => reportedParts.push(part) },
				CancellationToken.None
			);

			const usagePart = reportedParts.find((p): p is vscode.LanguageModelDataPart =>
				p instanceof vscode.LanguageModelDataPart && p.mimeType === CustomDataPartMimeTypes.Usage);
			assert.ok(usagePart, 'expected a usage data part to be reported');
			const decoded = JSON.parse(new TextDecoder().decode(usagePart.data));
			assert.deepStrictEqual(decoded, expectedUsage);
		});
	});
});

suite('LanguageModelAccess model info', () => {
	test('does not wait for utility alias endpoint resolution', async () => {
		const aliasLookupStarted = new DeferredPromise<void>();
		const unresolvedAliasEndpoint = new DeferredPromise<IChatEndpoint>();
		const endpoint = {
			model: 'gpt-4o-mini',
			name: 'GPT 4o mini',
			family: 'gpt-4o-mini',
			version: '2024-07-18',
			modelProvider: 'copilot',
			modelMaxPromptTokens: 128_000,
			maxOutputTokens: 4_096,
			supportsToolCalls: true,
			supportsVision: false,
			supportsPrediction: false,
			showInModelPicker: false,
			isFallback: false,
			tokenizer: TokenizerType.O200K,
			urlOrRequestMetadata: '',
		} as unknown as IChatEndpoint;
		const copilotToken = new CopilotToken(createTestExtendedTokenInfo({ token: 'token', username: 'fake', copilot_plan: 'unknown' }));
		const testingServiceCollection = createExtensionTestingServices();
		testingServiceCollection.define(ICopilotTokenManager, {
			_serviceBrand: undefined,
			onDidCopilotTokenRefresh: Event.None,
			getCopilotToken: async () => copilotToken,
			resetCopilotToken: () => { },
		} as unknown as ICopilotTokenManager);
		testingServiceCollection.define(IAutomodeService, {
			_serviceBrand: undefined,
			resolveAutoModeEndpoint: async () => endpoint,
			invalidateRouterCache: () => { },
		} as unknown as IAutomodeService);
		testingServiceCollection.define(IEndpointProvider, {
			_serviceBrand: undefined,
			onDidModelsRefresh: Event.None,
			getAllCompletionModels: async () => [],
			getAllChatEndpoints: async () => [endpoint],
			getChatEndpoint: async (requestOrFamily: unknown) => {
				if (typeof requestOrFamily === 'string') {
					void aliasLookupStarted.complete();
					return unresolvedAliasEndpoint.p;
				}
				return endpoint;
			},
			getEmbeddingsEndpoint: async () => { throw new Error('Not implemented in test'); },
		} as unknown as IEndpointProvider);
		const accessor = testingServiceCollection.createTestingAccessor();
		// Pre-populate the prompt base-count cache so that
		// `_provideLanguageModelChatInfo`'s per-endpoint base-count lookup
		// resolves synchronously from cache rather than spinning up the
		// real tokenizer (which is slow and not relevant to this test).
		const extensionContext = accessor.get(IVSCodeExtensionContext);
		const baseCountCacheKey = 'lmBaseCount/gpt-4o-mini';
		await extensionContext.globalState.update(baseCountCacheKey, { extensionVersion: accessor.get(IEnvService).getVersion(), baseCount: 0 });
		const languageModelAccess = accessor.get(IInstantiationService).createInstance(LanguageModelAccess);
		try {
			const modelInfo = (languageModelAccess as unknown as { _provideLanguageModelChatInfo(options: { silent: boolean }, token: vscode.CancellationToken): Promise<vscode.LanguageModelChatInformation[]> })._provideLanguageModelChatInfo({ silent: true }, CancellationToken.None);
			const resolved = await raceTimeout(modelInfo, 2_000);
			assert.ok(resolved, 'provideLanguageModelChatInfo did not resolve while utility alias lookup was pending');
			assert.deepStrictEqual(resolved.map(model => model.id), ['gpt-4o-mini']);
			assert.ok(aliasLookupStarted.isResolved, 'expected utility alias lookup to have been started in the background');
		} finally {
			languageModelAccess.dispose();
			await extensionContext.globalState.update(baseCountCacheKey, undefined);
		}
	});

	test('refreshes utility aliases when an override uses the same model id from another provider', async () => {
		const publishedEndpoint = {
			model: 'gpt-4o-mini',
			modelProvider: 'copilot',
		} as IChatEndpoint;
		const resolvedEndpoint = {
			model: 'gpt-4o-mini',
			modelProvider: 'azure',
		} as IChatEndpoint;
		const testingServiceCollection = createExtensionTestingServices();
		testingServiceCollection.define(IEndpointProvider, {
			_serviceBrand: undefined,
			onDidModelsRefresh: Event.None,
			getAllCompletionModels: async () => [],
			getAllChatEndpoints: async () => [],
			getChatEndpoint: async () => resolvedEndpoint,
			getEmbeddingsEndpoint: async () => { throw new Error('Not implemented in test'); },
		} as unknown as IEndpointProvider);
		const accessor = testingServiceCollection.createTestingAccessor();
		const languageModelAccess = accessor.get(IInstantiationService).createInstance(LanguageModelAccess);
		const internals = languageModelAccess as unknown as {
			_utilityAliasEndpoints: Map<string, IChatEndpoint>;
			_resolvedUtilityEndpoints: Map<string, { endpoint: IChatEndpoint; baseCount: number }>;
			_promptBaseCountCache: { getBaseCount(endpoint: IChatEndpoint): Promise<number> };
			_refreshUtilityOverrides(): Promise<void>;
		};
		internals._utilityAliasEndpoints.set('copilot-utility-small', publishedEndpoint);
		internals._promptBaseCountCache = { getBaseCount: async () => 0 };
		try {
			await internals._refreshUtilityOverrides();
			assert.strictEqual(internals._resolvedUtilityEndpoints.get('copilot-utility-small')?.endpoint, resolvedEndpoint);
		} finally {
			languageModelAccess.dispose();
		}
	});
});

suite('buildUtilityAliasModelInfo', () => {

	function makeEndpoint(overrides: Partial<IChatEndpoint>): IChatEndpoint {
		return {
			model: 'gpt-4o-mini',
			name: 'GPT 4o mini',
			version: '2024-07-18',
			modelMaxPromptTokens: 128_000,
			maxOutputTokens: 4_096,
			supportsToolCalls: true,
			supportsVision: false,
			...overrides,
		} as IChatEndpoint;
	}

	function makeCopilotEndpoint(overrides: Partial<IChatEndpoint>): IChatEndpoint {
		const endpoint = makeEndpoint(overrides);
		Object.setPrototypeOf(endpoint, CopilotChatEndpoint.prototype);
		return endpoint;
	}

	function makeBaseModelInfo(overrides: Partial<vscode.LanguageModelChatInformation> & Pick<vscode.LanguageModelChatInformation, 'id'>): vscode.LanguageModelChatInformation {
		return {
			name: 'Cloned Display Name',
			family: 'gpt-4o-mini',
			version: '2024-07-18',
			maxInputTokens: 100_000,
			maxOutputTokens: 4_096,
			isUserSelectable: true,
			isDefault: true,
			tooltip: 'tooltip-from-base',
			...overrides,
		} as vscode.LanguageModelChatInformation;
	}

	test('clones an existing copilot-provider entry, overriding id/family/selectable/default', () => {
		const endpoint = makeCopilotEndpoint({ model: 'gpt-4o-mini' });
		const base = makeBaseModelInfo({ id: 'gpt-4o-mini', requiresAuthorization: { label: 'octocat' } });
		const result = buildUtilityAliasModelInfo('copilot-utility-small', endpoint, [base], /* baseCount */ 50, undefined);

		assert.strictEqual(result.synthesized, false);
		assert.deepStrictEqual(result.info, {
			...base,
			id: 'copilot-utility-small',
			family: 'copilot-utility-small',
			isUserSelectable: false,
			isDefault: false,
		});
	});

	test('synthesizes for non-copilot endpoints when a copilot model shares the same id', () => {
		const endpoint = makeEndpoint({
			model: 'gpt-4o-mini',
			name: 'BYOK GPT 4o mini',
			maxOutputTokens: 2_048,
			supportsToolCalls: false,
			supportsVision: true,
		});
		const base = makeBaseModelInfo({ id: 'gpt-4o-mini', requiresAuthorization: { label: 'octocat' } });
		const result = buildUtilityAliasModelInfo('copilot-utility-small', endpoint, [base], /* baseCount */ 50, { label: 'octocat' });

		assert.deepStrictEqual({
			synthesized: result.synthesized,
			name: result.info.name,
			maxOutputTokens: result.info.maxOutputTokens,
			requiresAuthorization: result.info.requiresAuthorization,
			capabilities: result.info.capabilities,
		}, {
			synthesized: true,
			name: 'BYOK GPT 4o mini',
			maxOutputTokens: 2_048,
			requiresAuthorization: { label: 'octocat' },
			capabilities: { toolCalling: false, imageInput: true },
		});
	});

	test('synthesizes when no matching base entry exists, subtracting baseCount and completion reserve', () => {
		const endpoint = makeEndpoint({
			model: 'unknown-model',
			name: 'Unknown Model',
			version: '2025-01-01',
			modelMaxPromptTokens: 32_000,
			maxOutputTokens: 1_024,
			supportsToolCalls: false,
			supportsVision: true,
		});
		const result = buildUtilityAliasModelInfo('copilot-utility', endpoint, [], /* baseCount */ 100, { label: 'octocat' });

		assert.strictEqual(result.synthesized, true);
		assert.strictEqual(result.info.id, 'copilot-utility');
		assert.strictEqual(result.info.name, 'Unknown Model');
		assert.strictEqual(result.info.family, 'copilot-utility');
		assert.strictEqual(result.info.version, '2025-01-01');
		assert.strictEqual(result.info.maxOutputTokens, 1_024);
		assert.strictEqual(result.info.isUserSelectable, false);
		assert.strictEqual(result.info.isDefault, false);
		assert.deepStrictEqual(result.info.capabilities, { toolCalling: false, imageInput: true });
		// Synthesized alias must carry requiresAuthorization so consumers using
		// `vscode.lm.selectChatModels({ vendor: 'copilot', id: 'copilot-utility' })`
		// against a BYOK override still go through model-access authorization.
		assert.deepStrictEqual(result.info.requiresAuthorization, { label: 'octocat' });
		// 32_000 - 100 (baseCount) - BaseTokensPerCompletion. Use a strict
		// upper bound to assert the subtraction happened without re-importing
		// the constant in the test.
		assert.ok(result.info.maxInputTokens! < 32_000 - 100, `expected maxInputTokens to subtract baseCount and completion reserve, got ${result.info.maxInputTokens}`);
	});
});

suite('reasoning effort schema', () => {
	test('claude family prefers high when available', () => {
		assert.strictEqual(pickDefaultReasoningEffort(['low', 'medium', 'high'], 'claude-sonnet-4'), 'high');
	});

	test('non-claude family prefers medium when available', () => {
		assert.strictEqual(pickDefaultReasoningEffort(['low', 'medium', 'high'], 'gpt-5'), 'medium');
		assert.strictEqual(pickDefaultReasoningEffort(['low', 'medium', 'high'], 'some-other-family'), 'medium');
	});

	test('falls back to first advertised level when preferred is missing', () => {
		// Claude without 'high' → first
		assert.strictEqual(pickDefaultReasoningEffort(['low', 'medium'], 'claude-haiku'), 'low');
		// Other family without 'medium' → first
		assert.strictEqual(pickDefaultReasoningEffort(['low', 'high'], 'unknown-family'), 'low');
	});

	test('returns undefined for empty levels', () => {
		assert.strictEqual(pickDefaultReasoningEffort([], 'gpt-5'), undefined);
	});

	test('buildReasoningEffortSchemaProperty always sets a concrete default for non-empty levels', () => {
		const prop = buildReasoningEffortSchemaProperty(['low', 'high'], 'unknown-family');
		assert.strictEqual(prop.default, 'low', 'expected first advertised level, never undefined');
		assert.deepStrictEqual(prop.enum, ['low', 'high']);
		assert.strictEqual(prop.group, 'navigation');
	});
});

suite('normalizeTokenPrices', () => {
	test('returns undefined for undefined input', () => {
		assert.strictEqual(normalizeTokenPrices(undefined), undefined);
	});

	test('returns undefined when default tier is missing or incomplete', () => {
		assert.strictEqual(normalizeTokenPrices({ batch_size: 1_000_000 }), undefined);
		assert.strictEqual(normalizeTokenPrices({ default: { input_price: 100 } }), undefined);
	});

	test('converts tiered AIU prices to credits per 1M tokens', () => {
		const result = normalizeTokenPrices({
			batch_size: 1_000_000,
			default: { input_price: 3, output_price: 15, cache_price: 0.375, cache_write_price: 1.5 },
		});
		assert.ok(result);
		assert.strictEqual(result.default.inputPrice, 3);
		assert.strictEqual(result.default.outputPrice, 15);
		assert.strictEqual(result.default.cachePrice, 0.375);
		assert.strictEqual(result.default.cacheWritePrice, 1.5);
		assert.strictEqual(result.longContext, undefined);
	});

	test('leaves cacheWritePrice undefined when absent from response', () => {
		const result = normalizeTokenPrices({
			batch_size: 1_000_000,
			default: { input_price: 3, output_price: 15 },
		});
		assert.ok(result);
		assert.strictEqual(result.default.cachePrice, undefined);
		assert.strictEqual(result.default.cacheWritePrice, undefined);
	});

	test('includes long-context tier when present', () => {
		const result = normalizeTokenPrices({
			batch_size: 1_000_000,
			default: { input_price: 3, output_price: 15, cache_price: 0.375, cache_write_price: 1.5 },
			long_context: { input_price: 6, output_price: 30, cache_price: 0.75, cache_write_price: 3 },
		});
		assert.ok(result);
		assert.strictEqual(result.default.inputPrice, 3);
		assert.strictEqual(result.default.cacheWritePrice, 1.5);
		assert.strictEqual(result.longContext?.inputPrice, 6);
		assert.strictEqual(result.longContext?.outputPrice, 30);
		assert.strictEqual(result.longContext?.cachePrice, 0.75);
		assert.strictEqual(result.longContext?.cacheWritePrice, 3);
	});

	test('includes long-context tier when cache_write_price differs from default', () => {
		const result = normalizeTokenPrices({
			batch_size: 1_000_000,
			default: { input_price: 3, output_price: 15, cache_write_price: 1.5 },
			long_context: { input_price: 3, output_price: 15, cache_write_price: 3 },
		});
		assert.ok(result);
		assert.ok(result.longContext, 'long-context tier should be included when cache_write_price differs');
		assert.strictEqual(result.longContext?.cacheWritePrice, 3);
	});

	test('converts legacy flat nano-AIU prices to credits per 1M tokens', () => {
		// Shape returned by the cloud agents endpoint (/agents/swe/models)
		const result = normalizeTokenPrices({
			batch_size: 1_000_000,
			input_price: 500_000_000_000,
			output_price: 2_500_000_000_000,
			cache_price: 50_000_000_000,
		});
		assert.ok(result);
		assert.strictEqual(result.default.inputPrice, 500);
		assert.strictEqual(result.default.outputPrice, 2500);
		assert.strictEqual(result.default.cachePrice, 50);
		assert.strictEqual(result.default.cacheWritePrice, undefined);
		assert.strictEqual(result.longContext, undefined);
	});
});

suite('formatPricingLabel', () => {
	function tier(inputPrice: number, outputPrice: number) {
		return { default: { inputPrice, outputPrice, cacheReadTokenPrice: 0, cacheWriteTokenPrice: 0 } };
	}

	test('renders zero prices as 0 instead of exponential notation', () => {
		assert.strictEqual(formatPricingLabel(tier(0, 0)), 'In: 0 · Out: 0 AICs/1M tokens');
	});

	test('renders small prices in exponential notation', () => {
		assert.strictEqual(formatPricingLabel(tier(0.001, 0.005)), 'In: 1.00e-3 · Out: 5.00e-3 AICs/1M tokens');
	});

	test('renders regular prices trimming trailing zeros', () => {
		assert.strictEqual(formatPricingLabel(tier(3, 15)), 'In: 3 · Out: 15 AICs/1M tokens');
	});
});


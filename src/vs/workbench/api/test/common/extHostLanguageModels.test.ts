/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type * as vscode from 'vscode';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { SerializedError } from '../../../../base/common/errors.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ILoggerService, NullLogService } from '../../../../platform/log/common/log.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { ILanguageModelChatMetadata } from '../../../contrib/chat/common/languageModels.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { MainThreadAuthenticationShape, MainThreadLanguageModelsShape } from '../../common/extHost.protocol.js';
import { ExtHostAuthentication, IExtHostAuthentication } from '../../common/extHostAuthentication.js';
import { IExtHostInitDataService } from '../../common/extHostInitDataService.js';
import { IExtHostWindow } from '../../common/extHostWindow.js';
import { IExtHostUrlsService } from '../../common/extHostUrls.js';
import { IExtHostProgress } from '../../common/extHostProgress.js';
import { INTERNAL_AUTH_PROVIDER_PREFIX } from '../../../services/authentication/common/authentication.js';
import { ExtHostLanguageModels } from '../../common/extHostLanguageModels.js';
import { LanguageModelChatApiType, LanguageModelError } from '../../common/extHostTypes.js';
import { SerializableObjectWithBuffers } from '../../../services/extensions/common/proxyIdentifier.js';
import { SingleProxyRPCProtocol } from './testRPCProtocol.js';

suite('ExtHostLanguageModels reasoning capabilities', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function model(id: string, capabilities: vscode.LanguageModelChatCapabilities): vscode.LanguageModelChatInformation {
		return { id, name: id, family: id, version: '1', maxInputTokens: 1000, maxOutputTokens: 1000, capabilities };
	}

	function createHost(models: vscode.LanguageModelChatInformation[], enableCapabilities = true) {
		const proxy: Partial<MainThreadLanguageModelsShape> = {
			$registerLanguageModelProvider: () => { },
			$unregisterProvider: () => { },
			$selectChatModels: async () => models.map(model => `test/${model.id}`),
		};
		const host = store.add(new ExtHostLanguageModels(SingleProxyRPCProtocol(proxy), new NullLogService(), new class extends mock<IExtHostAuthentication>() { }));
		const extension = { ...nullExtensionDescription, enabledApiProposals: enableCapabilities ? ['languageModelCapabilities'] as const : [] };
		store.add(host.registerLanguageModelChatProvider(extension, 'test', {
			provideLanguageModelChatInformation: async () => models,
			provideLanguageModelChatResponse: async () => { throw new Error('Unexpected model request'); },
			provideTokenCount: async () => 0,
		}));
		return { host, extension };
	}

	test('preserves the declared protocol and adaptive mode through registration and selection', async () => {
		const { host, extension } = createHost([
			model('completions', { apiType: LanguageModelChatApiType.ChatCompletions }),
			model('responses', { apiType: LanguageModelChatApiType.Responses }),
			model('budget', { apiType: LanguageModelChatApiType.Messages, adaptiveThinking: false }),
			model('adaptive', { apiType: LanguageModelChatApiType.Messages, adaptiveThinking: true }),
			model('unknown', {}),
		]);
		const metadata = await host.$provideLanguageModelChatInfo('test', { silent: true }, CancellationToken.None);
		const selected = await host.selectLanguageModels(extension, { vendor: 'test' });
		const expected = [
			['completions', 'chatCompletions', undefined],
			['responses', 'responses', undefined],
			['budget', 'messages', false],
			['adaptive', 'messages', true],
			['unknown', undefined, undefined],
		];
		assert.deepStrictEqual({
			metadata: metadata.map(({ metadata }) => [metadata.id, metadata.capabilities?.apiType, metadata.capabilities?.adaptiveThinking]),
			selected: selected.map(model => [model.id, model.capabilities.apiType, model.capabilities.supportsAdaptiveThinking]),
		}, {
			metadata: expected, selected: [
				['completions', LanguageModelChatApiType.ChatCompletions, undefined],
				['responses', LanguageModelChatApiType.Responses, undefined],
				['budget', LanguageModelChatApiType.Messages, false],
				['adaptive', LanguageModelChatApiType.Messages, true],
				['unknown', undefined, undefined],
			]
		});
	});

	for (const capabilities of [{ apiType: LanguageModelChatApiType.Messages }, { adaptiveThinking: false }]) {
		test(`requires the languageModelCapabilities proposal for ${Object.keys(capabilities)[0]}`, async () => {
			const { host } = createHost([model('test-model', capabilities)], false);
			await assert.rejects(host.$provideLanguageModelChatInfo('test', { silent: true }, CancellationToken.None), /languageModelCapabilities/);
		});
	}
});

suite('ExtHostLanguageModels request model resolution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('fails instead of falling back to the default model when the selected model is unavailable', async () => {
		const proxy: Partial<MainThreadLanguageModelsShape> = {
			$registerLanguageModelProvider: () => { },
			$unregisterProvider: () => { },
			$selectChatModels: async () => [],
			$lookupChatModels: async () => [],
		};
		const host = store.add(new ExtHostLanguageModels(SingleProxyRPCProtocol(proxy), new NullLogService(), new class extends mock<IExtHostAuthentication>() { }));
		store.add(host.registerLanguageModelChatProvider(nullExtensionDescription, 'test', {
			provideLanguageModelChatInformation: async () => [{ id: 'available', name: 'available', family: 'available', version: '1', maxInputTokens: 1000, maxOutputTokens: 1000, capabilities: {} }],
			provideLanguageModelChatResponse: async () => { throw new Error('Unexpected model request'); },
			provideTokenCount: async () => 0,
		}));
		await host.$provideLanguageModelChatInfo('test', { silent: true }, CancellationToken.None);

		const available = await host.getLanguageModelForRequest(nullExtensionDescription, 'test/available');
		assert.strictEqual(available.id, 'available');
		await assert.rejects(host.getLanguageModelForRequest(nullExtensionDescription, 'test/missing'), /test\/missing/);
	});

	suite('models registered outside this extension host', () => {
		const externalId = 'agent-host-copilotcli:gpt-external';
		const externalMetadata: ILanguageModelChatMetadata = {
			extension: nullExtensionDescription.identifier,
			id: 'gpt-external',
			name: 'GPT External',
			vendor: 'agent-host-copilotcli',
			version: '1.0',
			family: 'gpt-external',
			maxInputTokens: 1000,
			maxOutputTokens: 1000,
			isDefaultForLocation: {},
			isUserSelectable: true,
			targetChatSessionType: 'agent-host-copilotcli',
			capabilities: { toolCalling: true, agentMode: true },
		};

		/** Consumes a response so its streams release their listeners. */
		async function drain(response: vscode.LanguageModelChatResponse): Promise<void> {
			await Promise.all([response.stream, response.text].map(async iterable => {
				for await (const _ of iterable) { }
			}));
		}

		function createHost(calls: string[], metadata = externalMetadata, authentication: IExtHostAuthentication = new class extends mock<IExtHostAuthentication>() { }) {
			const proxy: Partial<MainThreadLanguageModelsShape> = {
				$registerLanguageModelProvider: () => { },
				$unregisterProvider: () => { },
				$selectChatModels: async () => [externalId],
				$lookupChatModels: async identifiers => identifiers.filter(identifier => identifier === externalId).map(identifier => ({ identifier, metadata: { ...metadata } })),
				$tryStartChatRequest: async (_extension, modelIdentifier, requestId) => {
					calls.push(`request:${modelIdentifier}`);
					queueMicrotask(() => host.$acceptResponseDone(requestId, undefined));
				},
				$countTokens: async modelId => { calls.push(`count:${modelId}`); return 7; },
			};
			const host = store.add(new ExtHostLanguageModels(SingleProxyRPCProtocol(proxy), new NullLogService(), authentication));
			return host;
		}

		test('resolves a selected model that only the main thread knows', async () => {
			const calls: string[] = [];
			const host = createHost(calls);

			const model = await host.getLanguageModelForRequest(nullExtensionDescription, externalId);
			const tokens = await model.countTokens('hello');
			await drain(await model.sendRequest([], {}, CancellationToken.None));

			assert.deepStrictEqual({
				model: [model.vendor, model.id, model.family, model.name],
				tokens,
				calls,
			}, {
				model: ['agent-host-copilotcli', 'gpt-external', 'gpt-external', 'GPT External'],
				tokens: 7,
				calls: [`count:${externalId}`, `request:${externalId}`],
			});
		});

		test('lists such models only for an explicit vendor selector', async () => {
			const host = createHost([]);
			assert.deepStrictEqual({
				explicit: (await host.selectLanguageModels(nullExtensionDescription, { vendor: 'agent-host-copilotcli' })).map(model => model.id),
				unscoped: (await host.selectLanguageModels(nullExtensionDescription, {})).map(model => model.id),
			}, {
				explicit: ['gpt-external'],
				unscoped: [],
			});
		});

		test('keeps a resolved model usable after an unrelated model change', async () => {
			const calls: string[] = [];
			const host = createHost(calls);
			const model = await host.getLanguageModelForRequest(nullExtensionDescription, externalId);

			host.$onChatModelsChange();
			await drain(await model.sendRequest([], {}, CancellationToken.None));

			assert.deepStrictEqual(calls, [`request:${externalId}`]);
		});

		test('does not retain a removed model when a fresh lookup returns no metadata', async () => {
			const metadata = new Map([[externalId, externalMetadata]]);
			const host = store.add(new ExtHostLanguageModels(SingleProxyRPCProtocol({
				$selectChatModels: async () => [externalId],
				$lookupChatModels: async (ids: string[]) => ids.flatMap(identifier => {
					const model = metadata.get(identifier);
					return model ? [{ identifier, metadata: model }] : [];
				}),
			}), new NullLogService(), new class extends mock<IExtHostAuthentication>() { }));
			const model = await host.getLanguageModelForRequest(nullExtensionDescription, externalId);
			metadata.clear();
			await assert.rejects(async () => model.sendRequest([], {}, CancellationToken.None), { code: 'NotFound' });
		});

		test('still fails for a selected model the main thread does not know', async () => {
			const host = createHost([]);
			await assert.rejects(host.getLanguageModelForRequest(nullExtensionDescription, 'agent-host-copilotcli:missing'), /agent-host-copilotcli:missing/);
		});

		test('uses the external target owner for consent and does not send a denied request', async () => {
			const calls: string[] = [];
			const owner = new ExtensionIdentifier('provider.extension');
			let approve = false;
			let allowed = false;
			let prompts = 0;
			const session: vscode.AuthenticationSession = { id: 'models', accessToken: '', scopes: [], account: { id: 'models', label: 'Language Models' } };
			const authProxy: Partial<MainThreadAuthenticationShape> = {
				$ensureProvider: async () => { },
				$getSession: async (providerId, _scopes, extensionId, _extensionName, options) => {
					assert.strictEqual(providerId, INTERNAL_AUTH_PROVIDER_PREFIX + owner.value);
					assert.strictEqual(extensionId, ExtensionIdentifier.toKey(nullExtensionDescription.identifier));
					assert.deepStrictEqual(options.account, { id: 'Language Models', label: 'Language Models' });
					if (options.silent) {
						return allowed ? session : undefined;
					}
					assert.ok(options.forceNewSession);
					prompts++;
					if (!approve) {
						throw new Error('User denied access');
					}
					allowed = true;
					return session;
				},
			};
			const authentication = new ExtHostAuthentication(
				SingleProxyRPCProtocol(authProxy),
				new class extends mock<IExtHostInitDataService>() { },
				new class extends mock<IExtHostWindow>() { },
				new class extends mock<IExtHostUrlsService>() { },
				new class extends mock<IExtHostProgress>() { },
				new class extends mock<ILoggerService>() { },
				new NullLogService(),
			);
			const metadata = { ...externalMetadata };
			const host = createHost(calls, metadata, authentication);
			const model = await host.getLanguageModelForRequest(nullExtensionDescription, externalId);
			// Only metadata changes, so the identifier-based change notification does not fire.
			metadata.extension = owner;
			metadata.auth = { providerLabel: 'Provider' };
			await assert.rejects(async () => model.sendRequest([], {}, CancellationToken.None), { code: 'NoPermissions' });
			assert.deepStrictEqual(calls, []);
			approve = true;
			await drain(await model.sendRequest([], {}, CancellationToken.None));
			assert.deepStrictEqual({ calls, prompts }, { calls: [`request:${externalId}`], prompts: 2 });
		});
	});
});

suite('ExtHostLanguageModels provider errors', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('reports a synchronously thrown rate limit with its retry guidance', async () => {
		const done = new DeferredPromise<SerializedError & { retryAfter?: number } | undefined>();
		const proxy: Partial<MainThreadLanguageModelsShape> = {
			$registerLanguageModelProvider: () => { },
			$unregisterProvider: () => { },
			$reportResponseDone: async (_requestId, error) => { done.complete(error); },
		};
		const host = store.add(new ExtHostLanguageModels(SingleProxyRPCProtocol(proxy), new NullLogService(), new class extends mock<IExtHostAuthentication>() { }));
		store.add(host.registerLanguageModelChatProvider(nullExtensionDescription, 'test', {
			provideLanguageModelChatInformation: async () => [{ id: 'model', name: 'model', family: 'model', version: '1', maxInputTokens: 1000, maxOutputTokens: 1000, capabilities: {} }],
			provideLanguageModelChatResponse: () => { throw LanguageModelError.RateLimited('Too many requests', 1500); },
			provideTokenCount: async () => 0,
		}));
		const [{ identifier }] = await host.$provideLanguageModelChatInfo('test', { silent: true }, CancellationToken.None);

		await host.$startChatRequest(identifier, 1, undefined, new SerializableObjectWithBuffers([]), {}, CancellationToken.None);
		const error = await done.p;
		assert.deepStrictEqual({ name: error?.name, code: error?.code, retryAfter: error?.retryAfter }, { name: 'LanguageModelError', code: 'RateLimited', retryAfter: 1500 });
	});
});

suite('ExtHostLanguageModels provider disposal', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function model(id: string): vscode.LanguageModelChatInformation {
		return { id, name: id, family: id, version: '1', maxInputTokens: 1000, maxOutputTokens: 1000, capabilities: {} };
	}

	function createHost(identifiers = ['test/old', 'test/new']) {
		const proxy: Partial<MainThreadLanguageModelsShape> = {
			$registerLanguageModelProvider: () => { },
			$unregisterProvider: () => { },
			$selectChatModels: async () => identifiers,
			$lookupChatModels: async () => [],
		};
		return store.add(new ExtHostLanguageModels(SingleProxyRPCProtocol(proxy), new NullLogService(), new class extends mock<IExtHostAuthentication>() { }));
	}

	function provider(models: Promise<vscode.LanguageModelChatInformation[]>): vscode.LanguageModelChatProvider {
		return {
			provideLanguageModelChatInformation: () => models,
			provideLanguageModelChatResponse: async () => { throw new Error('Unexpected model request'); },
			provideTokenCount: async () => 0,
		};
	}

	test('discards model information completing after provider disposal', async () => {
		const host = createHost();
		const pending = new DeferredPromise<vscode.LanguageModelChatInformation[]>();
		const registration = store.add(host.registerLanguageModelChatProvider(nullExtensionDescription, 'test', provider(pending.p)));
		const discovery = host.$provideLanguageModelChatInfo('test', { silent: true }, CancellationToken.None);
		registration.dispose();
		await pending.complete([model('old')]);

		assert.deepStrictEqual({
			metadata: await discovery,
			models: (await host.selectLanguageModels(nullExtensionDescription, { vendor: 'test' })).map(model => model.id),
		}, { metadata: [], models: [] });
	});

	test('a disposed registration cannot overwrite its replacement catalog', async () => {
		const host = createHost();
		const pending = new DeferredPromise<vscode.LanguageModelChatInformation[]>();
		const registration = store.add(host.registerLanguageModelChatProvider(nullExtensionDescription, 'test', provider(pending.p)));
		const discovery = host.$provideLanguageModelChatInfo('test', { silent: true }, CancellationToken.None);
		registration.dispose();
		store.add(host.registerLanguageModelChatProvider(nullExtensionDescription, 'test', provider(Promise.resolve([model('new')]))));
		await host.$provideLanguageModelChatInfo('test', { silent: true }, CancellationToken.None);
		await pending.complete([model('old')]);

		assert.deepStrictEqual({
			metadata: await discovery,
			models: (await host.selectLanguageModels(nullExtensionDescription, { vendor: 'test' })).map(model => model.id),
		}, { metadata: [], models: ['new'] });
	});

	test('a live provider still publishes models and disposal clears them', async () => {
		const host = createHost();
		const registration = store.add(host.registerLanguageModelChatProvider(nullExtensionDescription, 'test', provider(Promise.resolve([model('new')]))));
		await host.$provideLanguageModelChatInfo('test', { silent: true }, CancellationToken.None);
		const before = (await host.selectLanguageModels(nullExtensionDescription, { vendor: 'test' })).map(model => model.id);
		registration.dispose();
		const after = (await host.selectLanguageModels(nullExtensionDescription, { vendor: 'test' })).map(model => model.id);

		assert.deepStrictEqual({ before, after }, { before: ['new'], after: [] });
	});

	test('disposing a provider prevents a pending model catalog from repopulating its cache', async () => {
		const models = Array.from({ length: 37 }, (_, index) => model(`model-${index}`));
		const host = createHost(models.map(model => `test/${model.id}`));
		const pending = new DeferredPromise<vscode.LanguageModelChatInformation[]>();
		const registration = store.add(host.registerLanguageModelChatProvider(nullExtensionDescription, 'test', provider(pending.p)));
		const discovery = host.$provideLanguageModelChatInfo('test', { silent: true }, CancellationToken.None);
		registration.dispose();
		await pending.complete(models);

		assert.deepStrictEqual({
			metadataCount: (await discovery).length,
			cachedModelCount: (await host.selectLanguageModels(nullExtensionDescription, { vendor: 'test' })).length,
		}, { metadataCount: 0, cachedModelCount: 0 });
	});
});

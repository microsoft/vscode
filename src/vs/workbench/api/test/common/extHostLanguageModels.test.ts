/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type * as vscode from 'vscode';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { SerializedError } from '../../../../base/common/errors.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { ILanguageModelChatMetadata } from '../../../contrib/chat/common/languageModels.js';
import { ChatAgentLocation } from '../../../contrib/chat/common/constants.js';
import { MainThreadLanguageModelsShape } from '../../common/extHost.protocol.js';
import { IExtHostAuthentication } from '../../common/extHostAuthentication.js';
import { ExtHostLanguageModels } from '../../common/extHostLanguageModels.js';
import { LanguageModelChatApiType, LanguageModelChatMessage, LanguageModelError, LanguageModelTextPart, LanguageModelToolCallPart } from '../../common/extHostTypes.js';
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
});

suite('ExtHostLanguageModels cross-host requests', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createHosts(waitForCancellation = false, vendor = 'test') {
		const information: vscode.LanguageModelChatInformation = { id: 'model', name: 'Remote model', family: 'test', version: '1', maxInputTokens: 1000, maxOutputTokens: 1000, capabilities: { toolCalling: true } };
		const catalog = new Map<string, ILanguageModelChatMetadata>();
		let models = [information];
		let requestedModel: vscode.LanguageModelChatInformation | undefined;
		let countedValue: string | vscode.LanguageModelChatRequestMessage | undefined;
		let requestToken: CancellationToken | undefined;
		const providerProxy: Partial<MainThreadLanguageModelsShape> = {
			$registerLanguageModelProvider: () => { },
			$unregisterProvider: () => { catalog.clear(); },
			$reportResponsePart: async (requestId, parts) => consumer.$acceptResponsePart(requestId, parts),
			$reportResponseDone: async (requestId, error) => consumer.$acceptResponseDone(requestId, error),
		};
		const provider = store.add(new ExtHostLanguageModels(SingleProxyRPCProtocol(providerProxy), new NullLogService(), new class extends mock<IExtHostAuthentication>() { }));
		store.add(provider.registerLanguageModelChatProvider(nullExtensionDescription, vendor, {
			provideLanguageModelChatInformation: async () => models,
			provideLanguageModelChatResponse: async (model, _messages, _options, progress, token) => {
				requestedModel = model;
				requestToken = token;
				progress.report(new LanguageModelTextPart('response'));
				progress.report(new LanguageModelToolCallPart('call-1', 'testTool', { query: 'hello' }));
				if (waitForCancellation) {
					const cancelled = new DeferredPromise<void>();
					store.add(token.onCancellationRequested(() => cancelled.complete()));
					await cancelled.p;
				}
			},
			provideTokenCount: async (model, value) => {
				assert.strictEqual(model, information);
				countedValue = value;
				return typeof value === 'string' ? value.length : 42;
			},
		}));
		const consumerProxy: Partial<MainThreadLanguageModelsShape> = {
			$selectChatModels: async () => {
				const models = await provider.$provideLanguageModelChatInfo(vendor, { silent: true }, CancellationToken.None);
				catalog.clear();
				for (const model of models) {
					if (vendor === 'copilot') {
						model.metadata.isDefaultForLocation[ChatAgentLocation.Chat] = true;
					}
					catalog.set(model.identifier, model.metadata);
				}
				return [...catalog.keys()];
			},
			$getLanguageModelChatMetadata: async identifier => catalog.get(identifier),
			$countTokens: async (identifier, value, token) => provider.$provideTokenLength(identifier, value, token),
			$cancelLanguageModelChatRequest: requestId => provider.$cancelLanguageModelChatRequest(requestId),
			$tryStartChatRequest: async (from, identifier, requestId, messages, options, token) => provider.$startChatRequest(identifier, requestId, from, messages, options, token),
		};
		const consumer = store.add(new ExtHostLanguageModels(SingleProxyRPCProtocol(consumerProxy), new NullLogService(), new class extends mock<IExtHostAuthentication>() { }));
		return { consumer, information, catalog, requestedModel: () => requestedModel, countedValue: () => countedValue, requestToken: () => requestToken, removeModels: () => { models = []; } };
	}

	test('resolves an explicitly selected model provided by another extension host', async () => {
		const { consumer } = createHosts();
		const selected = await consumer.getLanguageModelForRequest(nullExtensionDescription, 'test/model');
		assert.deepStrictEqual({ id: selected.id, name: selected.name, tools: selected.capabilities.supportsToolCalling }, { id: 'model', name: 'Remote model', tools: true });
	});

	test('resolves the default Copilot model provided by another extension host', async () => {
		const { consumer } = createHosts(false, 'copilot');
		const selected = await consumer.getDefaultLanguageModel(nullExtensionDescription, true);
		assert.strictEqual(selected?.id, 'model');
	});

	test('fetches default model metadata concurrently across hosts', async () => {
		const identifiers = ['copilot/first', 'copilot/second', 'copilot/default'];
		const release = new DeferredPromise<void>();
		const requested: string[] = [];
		const metadata: ILanguageModelChatMetadata = {
			extension: nullExtensionDescription.identifier,
			id: 'default', name: 'default', vendor: 'copilot', family: 'test', version: '1',
			maxInputTokens: 1000, maxOutputTokens: 1000,
			isDefaultForLocation: { [ChatAgentLocation.Chat]: true },
		};
		const proxy: Partial<MainThreadLanguageModelsShape> = {
			$selectChatModels: async () => identifiers,
			$getLanguageModelChatMetadata: async identifier => {
				requested.push(identifier);
				await release.p;
				return identifier === 'copilot/default' ? metadata : undefined;
			},
		};
		const consumer = store.add(new ExtHostLanguageModels(SingleProxyRPCProtocol(proxy), new NullLogService(), new class extends mock<IExtHostAuthentication>() { }));
		const resolving = consumer.getDefaultLanguageModel(nullExtensionDescription, true);
		await Promise.resolve();
		const requestedBeforeRelease = [...requested];
		await release.complete();
		const selected = await resolving;
		assert.deepStrictEqual({ requestedBeforeRelease, selected: selected?.id }, { requestedBeforeRelease: identifiers, selected: 'default' });
	});

	test('streams a request to the owning host using the original provider model', async () => {
		const hosts = createHosts();
		const [selected] = await hosts.consumer.selectLanguageModels(nullExtensionDescription, { vendor: 'test' });
		assert.ok(selected);
		const response = await selected.sendRequest([], {}, CancellationToken.None);
		const text: string[] = [];
		for await (const part of response.text) {
			text.push(part);
		}
		assert.deepStrictEqual({ text, originalModel: hosts.requestedModel() === hosts.information }, { text: ['response'], originalModel: true });
	});

	test('counts tokens through the host that owns the provider', async () => {
		const { consumer } = createHosts();
		const selected = await consumer.getLanguageModelForRequest(nullExtensionDescription, 'test/model');
		assert.strictEqual(await selected.countTokens('hello', CancellationToken.None), 5);
	});

	test('preserves structured messages when counting through the owning host', async () => {
		const hosts = createHosts();
		const selected = await hosts.consumer.getLanguageModelForRequest(nullExtensionDescription, 'test/model');
		const message = LanguageModelChatMessage.User('hello');
		const count = await selected.countTokens(message, CancellationToken.None);
		const counted = hosts.countedValue();
		assert.ok(counted && typeof counted !== 'string');
		assert.deepStrictEqual({ count, role: counted.role, content: counted.content, name: counted.name }, { count: 42, role: message.role, content: message.content, name: message.name });
	});

	test('preserves tool calls streamed by another extension host', async () => {
		const { consumer } = createHosts();
		const selected = await consumer.getLanguageModelForRequest(nullExtensionDescription, 'test/model');
		const response = await selected.sendRequest([], {}, CancellationToken.None);
		const parts: unknown[] = [];
		for await (const part of response.stream) {
			parts.push(part);
		}
		assert.deepStrictEqual(parts, [new LanguageModelTextPart('response'), new LanguageModelToolCallPart('call-1', 'testTool', { query: 'hello' })]);
	});

	test('cancels the request in the host that owns the provider', async () => {
		const hosts = createHosts(true);
		const cts = store.add(new CancellationTokenSource());
		const selected = await hosts.consumer.getLanguageModelForRequest(nullExtensionDescription, 'test/model');
		const response = await selected.sendRequest([], {}, cts.token);
		cts.cancel();
		for await (const _part of response.stream) {
		}
		assert.strictEqual(hosts.requestToken()?.isCancellationRequested, true);
	});

	test('rejects a previously selected model after it is removed', async () => {
		const hosts = createHosts();
		const selected = await hosts.consumer.getLanguageModelForRequest(nullExtensionDescription, 'test/model');
		hosts.removeModels();
		await hosts.consumer.selectLanguageModels(nullExtensionDescription, { vendor: 'test' });
		await assert.rejects(async () => selected.sendRequest([], {}, CancellationToken.None), /test\/model/);
		await assert.rejects(async () => selected.countTokens('hello', CancellationToken.None), /test\/model/);
		await assert.rejects(hosts.consumer.getLanguageModelForRequest(nullExtensionDescription, 'test/model'), /test\/model/);
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
			$getLanguageModelChatMetadata: async () => undefined,
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

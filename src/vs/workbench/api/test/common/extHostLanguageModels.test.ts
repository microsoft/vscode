/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type * as vscode from 'vscode';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { MainThreadLanguageModelsShape } from '../../common/extHost.protocol.js';
import { IExtHostAuthentication } from '../../common/extHostAuthentication.js';
import { ExtHostLanguageModels } from '../../common/extHostLanguageModels.js';
import { LanguageModelChatApiType, LanguageModelChatDefaultsOutcome, LanguageModelChatDefaultsSource, LanguageModelChatDefaultsStatus } from '../../common/extHostTypes.js';
import { IChatModelDefaultsSnapshot } from '../../../contrib/chat/common/chatModelDefaults.js';
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

suite('ExtHostLanguageModels native defaults', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('uses only returned models, converts outcomes and scopes invalidations', async () => {
		const snapshot: IChatModelDefaultsSnapshot = { targetId: 'target', status: 'available', preferences: {},
			effective: { contextSize: 200_000 }, sources: { contextSize: 'default' }, revision: 'revision' };
		const proxy: Partial<MainThreadLanguageModelsShape> = {
			$registerLanguageModelProvider: () => {}, $unregisterProvider: () => {},
			$selectChatModels: async () => ['test/model'],
			$getChatModelDefaultsCapabilities: async () => ({ version: 1, scopeAwareDefaults: true, numericSuggestions: true, customNumericValues: true, requestConfigurationFidelity: 'unverified' }),
			$getChatModelDefaultsTargets: async () => [{ id: 'target', label: 'New Local Chats' }],
			$inspectChatModelDefaults: async () => snapshot,
			$updateChatModelDefaults: async (_extension, _model, _target, patch, revision) => {
				assert.deepStrictEqual({ patch, revision }, { patch: { set: { contextSize: 250_000 } }, revision: 'revision' });
				return { outcome: 'conflict', snapshot };
			},
		};
		const host = store.add(new ExtHostLanguageModels(SingleProxyRPCProtocol(proxy), new NullLogService(), new class extends mock<IExtHostAuthentication>() {}));
		const extension = { ...nullExtensionDescription, enabledApiProposals: ['languageModelChatDefaults'] as const };
		store.add(host.registerLanguageModelChatProvider(extension, 'test', {
			provideLanguageModelChatInformation: async () => [{ id: 'model', name: 'Model', family: 'model', version: '1', maxInputTokens: 1000, maxOutputTokens: 100, capabilities: {} }],
			provideLanguageModelChatResponse: async () => { throw new Error('No model requests'); }, provideTokenCount: async () => 0,
		}));
		await host.$provideLanguageModelChatInfo('test', { silent: true }, CancellationToken.None);
		const model = (await host.selectLanguageModels(extension, { vendor: 'test' }))[0];
		await assert.rejects(host.getChatModelDefaults(extension, { ...model }), /returned by/);
		await assert.rejects(host.getChatModelDefaults(nullExtensionDescription, model), /languageModelChatDefaults/);
		const defaults = await host.getChatModelDefaults(extension, model);
		const events: string[] = [];
		store.add(defaults.onDidChange(event => events.push(event.targetId)));
		host.$onChatModelDefaultsChange(extension.identifier, 'different', 'ignore');
		host.$onChatModelDefaultsChange(extension.identifier, 'test/model', 'target');
		const result = await defaults.update('target', { set: { contextSize: 250_000 } }, 'revision');
		assert.deepStrictEqual({ targets: await defaults.getTargets(), status: (await defaults.inspect('target')).status,
			sources: result.snapshot.sources, outcome: result.outcome, fidelity: defaults.capabilities.requestConfigurationFidelity, events }, {
			targets: [{ id: 'target', label: 'New Local Chats' }], status: LanguageModelChatDefaultsStatus.Available,
			sources: { contextSize: LanguageModelChatDefaultsSource.Default }, outcome: LanguageModelChatDefaultsOutcome.Conflict,
			fidelity: false, events: ['target'],
		});
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

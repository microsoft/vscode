/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type * as vscode from 'vscode';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { SerializedError } from '../../../../base/common/errors.js';
import { ThemeIcon as BaseThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { MainThreadLanguageModelsShape } from '../../common/extHost.protocol.js';
import { IExtHostAuthentication } from '../../common/extHostAuthentication.js';
import { ExtHostLanguageModels } from '../../common/extHostLanguageModels.js';
import { LanguageModelChatApiType, LanguageModelError, ThemeIcon } from '../../common/extHostTypes.js';
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

suite('ExtHostLanguageModels model icons', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const extensionLocation = URI.file('/extensions/publisher.provider');
	const inside = (path: string) => URI.joinPath(extensionLocation, path);
	const iconPaths: Record<string, vscode.IconPath> = {
		themeIcon: new ThemeIcon('chat-model-provider-claude'),
		image: inside('media/icon.svg'),
		lightAndDark: { light: inside('media/light.svg'), dark: inside('media/dark.svg') },
		otherFolder: URI.file('/extensions/other.provider/icon.svg'),
		remote: URI.parse('https://example.com/icon.svg'),
		escapingDark: { light: inside('media/light.svg'), dark: inside('../../icon.svg') },
	};

	async function provideIcons(enableProposal: boolean) {
		const proxy: Partial<MainThreadLanguageModelsShape> = { $registerLanguageModelProvider: () => { }, $unregisterProvider: () => { } };
		const host = store.add(new ExtHostLanguageModels(SingleProxyRPCProtocol(proxy), new NullLogService(), new class extends mock<IExtHostAuthentication>() { }));
		const extension = { ...nullExtensionDescription, extensionLocation, enabledApiProposals: enableProposal ? ['chatProvider'] as const : [] };
		store.add(host.registerLanguageModelChatProvider(extension, 'test', {
			provideLanguageModelChatInformation: async () => Object.entries(iconPaths).map(([id, iconPath]) => ({ id, name: id, family: id, version: '1', maxInputTokens: 1000, maxOutputTokens: 1000, capabilities: {}, iconPath })),
			provideLanguageModelChatResponse: async () => { throw new Error('Unexpected model request'); },
			provideTokenCount: async () => 0,
		}));
		const models = await host.$provideLanguageModelChatInfo('test', { silent: true }, CancellationToken.None);
		return Object.fromEntries(models.map(({ metadata }) => [metadata.id, !metadata.icon || BaseThemeIcon.isThemeIcon(metadata.icon)
			? metadata.icon?.id
			: { light: metadata.icon.light.path, dark: metadata.icon.dark.path }]));
	}

	test('keeps theme icons and images inside the extension, and nothing else', async () => {
		const path = (relative: string) => inside(relative).path;
		assert.deepStrictEqual({ enabled: await provideIcons(true), disabled: await provideIcons(false) }, {
			enabled: {
				themeIcon: 'chat-model-provider-claude',
				image: { light: path('media/icon.svg'), dark: path('media/icon.svg') },
				lightAndDark: { light: path('media/light.svg'), dark: path('media/dark.svg') },
				otherFolder: undefined,
				remote: undefined,
				escapingDark: undefined,
			},
			// `iconPath` is part of the chatProvider proposal.
			disabled: Object.fromEntries(Object.keys(iconPaths).map(id => [id, undefined])),
		});
	});
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

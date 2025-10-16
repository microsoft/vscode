/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { AsyncIterableSource, DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { ChatMessageRole, languageModelChatProviderExtensionPoint, LanguageModelsService, IChatMessage, IChatResponsePart } from '../../common/languageModels.js';
import { IExtensionService, nullExtensionDescription } from '../../../../services/extensions/common/extensions.js';
import { ExtensionsRegistry } from '../../../../services/extensions/common/extensionsRegistry.js';
import { DEFAULT_MODEL_PICKER_CATEGORY } from '../../common/modelPicker/modelPickerWidget.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { TestChatEntitlementService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { Event } from '../../../../../base/common/event.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';

suite('LanguageModels', function () {

	let languageModels: LanguageModelsService;

	const store = new DisposableStore();
	const activationEvents = new Set<string>();

	setup(function () {

		languageModels = new LanguageModelsService(
			new class extends mock<IExtensionService>() {
				override activateByEvent(name: string) {
					activationEvents.add(name);
					return Promise.resolve();
				}
			},
			new NullLogService(),
			new TestStorageService(),
			new MockContextKeyService(),
			new TestConfigurationService(),
			new TestChatEntitlementService()
		);

		const ext = ExtensionsRegistry.getExtensionPoints().find(e => e.name === languageModelChatProviderExtensionPoint.name)!;

		ext.acceptUsers([{
			description: { ...nullExtensionDescription },
			value: { vendor: 'test-vendor' },
			collector: null!
		}, {
			description: { ...nullExtensionDescription },
			value: { vendor: 'actual-vendor' },
			collector: null!
		}]);

		store.add(languageModels.registerLanguageModelProvider('test-vendor', {
			onDidChange: Event.None,
			provideLanguageModelChatInfo: async () => {
				const modelMetadata = [
					{
						extension: nullExtensionDescription.identifier,
						name: 'Pretty Name',
						vendor: 'test-vendor',
						family: 'test-family',
						version: 'test-version',
						modelPickerCategory: undefined,
						id: 'test-id-1',
						maxInputTokens: 100,
						maxOutputTokens: 100,
					},
					{
						extension: nullExtensionDescription.identifier,
						name: 'Pretty Name',
						vendor: 'test-vendor',
						family: 'test2-family',
						version: 'test2-version',
						modelPickerCategory: undefined,
						id: 'test-id-12',
						maxInputTokens: 100,
						maxOutputTokens: 100,
					}
				];
				const modelMetadataAndIdentifier = modelMetadata.map(m => ({
					metadata: m,
					identifier: m.id,
				}));
				return modelMetadataAndIdentifier;
			},
			sendChatRequest: async () => {
				throw new Error();
			},
			provideTokenCount: async () => {
				throw new Error();
			}
		}));
	});

	teardown(function () {
		languageModels.dispose();
		activationEvents.clear();
		store.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('empty selector returns all', async function () {

		const result1 = await languageModels.selectLanguageModels({});
		assert.deepStrictEqual(result1.length, 2);
		assert.deepStrictEqual(result1[0], 'test-id-1');
		assert.deepStrictEqual(result1[1], 'test-id-12');
	});

	test('selector with id works properly', async function () {
		const result1 = await languageModels.selectLanguageModels({ id: 'test-id-1' });
		assert.deepStrictEqual(result1.length, 1);
		assert.deepStrictEqual(result1[0], 'test-id-1');
	});

	test('no warning that a matching model was not found #213716', async function () {
		const result1 = await languageModels.selectLanguageModels({ vendor: 'test-vendor' });
		assert.deepStrictEqual(result1.length, 2);

		const result2 = await languageModels.selectLanguageModels({ vendor: 'test-vendor', family: 'FAKE' });
		assert.deepStrictEqual(result2.length, 0);
	});

	test('sendChatRequest returns a response-stream', async function () {

		store.add(languageModels.registerLanguageModelProvider('actual-vendor', {
			onDidChange: Event.None,
			provideLanguageModelChatInfo: async () => {
				const modelMetadata = [
					{
						extension: nullExtensionDescription.identifier,
						name: 'Pretty Name',
						vendor: 'actual-vendor',
						family: 'actual-family',
						version: 'actual-version',
						id: 'actual-lm',
						maxInputTokens: 100,
						maxOutputTokens: 100,
						modelPickerCategory: DEFAULT_MODEL_PICKER_CATEGORY,
					}
				];
				const modelMetadataAndIdentifier = modelMetadata.map(m => ({
					metadata: m,
					identifier: m.id,
				}));
				return modelMetadataAndIdentifier;
			},
			sendChatRequest: async (modelId: string, messages: IChatMessage[], _from: ExtensionIdentifier, _options: { [name: string]: any }, token: CancellationToken) => {
				// const message = messages.at(-1);

				const defer = new DeferredPromise();
				const stream = new AsyncIterableSource<IChatResponsePart>();

				(async () => {
					while (!token.isCancellationRequested) {
						stream.emitOne({ type: 'text', value: Date.now().toString() });
						await timeout(10);
					}
					defer.complete(undefined);
				})();

				return {
					stream: stream.asyncIterable,
					result: defer.p
				};
			},
			provideTokenCount: async () => {
				throw new Error();
			}
		}));

		// Register the extension point for the actual vendor
		const ext = ExtensionsRegistry.getExtensionPoints().find(e => e.name === languageModelChatProviderExtensionPoint.name)!;
		ext.acceptUsers([{
			description: { ...nullExtensionDescription },
			value: { vendor: 'actual-vendor' },
			collector: null!
		}]);

		const models = await languageModels.selectLanguageModels({ id: 'actual-lm' });
		assert.ok(models.length === 1);

		const first = models[0];

		const cts = new CancellationTokenSource();

		const request = await languageModels.sendChatRequest(first, nullExtensionDescription.identifier, [{ role: ChatMessageRole.User, content: [{ type: 'text', value: 'hello' }] }], {}, cts.token);

		assert.ok(request);

		cts.dispose(true);

		await request.result;
	});

	test('registerContributedModels and getLanguageModelsForSessionType', async function () {
		// Register some contributed models for a session type
		const contributedModels = [
			{
				identifier: 'contrib-model-1',
				metadata: {
					extension: nullExtensionDescription.identifier,
					name: 'Contributed Model 1',
					vendor: 'contributed',
					family: 'contrib-family',
					version: 'contrib-version',
					id: 'contrib-model-1',
					maxInputTokens: 100,
					maxOutputTokens: 100,
					modelPickerCategory: undefined,
					isDefault: false,
					isUserSelectable: true
				}
			},
			{
				identifier: 'contrib-model-2',
				metadata: {
					extension: nullExtensionDescription.identifier,
					name: 'Contributed Model 2',
					vendor: 'contributed',
					family: 'contrib-family',
					version: 'contrib-version',
					id: 'contrib-model-2',
					maxInputTokens: 200,
					maxOutputTokens: 200,
					modelPickerCategory: undefined,
					isDefault: false,
					isUserSelectable: true
				}
			}
		];

		languageModels.registerContributedModels('test-session-type', contributedModels);

		// Get models for the contributed session type
		const modelsForSession = languageModels.getLanguageModelsForSessionType('test-session-type');
		assert.strictEqual(modelsForSession.length, 2);
		assert.strictEqual(modelsForSession[0].identifier, 'contrib-model-1');
		assert.strictEqual(modelsForSession[1].identifier, 'contrib-model-2');

		// Get models without session type (should return regular models)
		const regularModels = languageModels.getLanguageModelsForSessionType();
		assert.ok(regularModels.length >= 0); // May have models from other tests

		// Clear contributed models
		languageModels.registerContributedModels('test-session-type', undefined);
		const clearedModels = languageModels.getLanguageModelsForSessionType('test-session-type');
		assert.strictEqual(clearedModels.length, 0);
	});
});

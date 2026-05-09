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
import { ChatMessageRole, LanguageModelsService, IChatMessage, IChatResponsePart, ILanguageModelChatMetadata } from '../../common/languageModels.js';
import { IExtensionService, nullExtensionDescription } from '../../../../services/extensions/common/extensions.js';
import { DEFAULT_MODEL_PICKER_CATEGORY } from '../../common/widget/input/modelPickerWidget.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ContextKeyExpression } from '../../../../../platform/contextkey/common/contextkey.js';
import { ILanguageModelsConfigurationService } from '../../common/languageModelsConfiguration.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { TestSecretStorageService } from '../../../../../platform/secrets/test/common/testSecretStorageService.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IRequestService } from '../../../../../platform/request/common/request.js';

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
			new class extends mock<ILanguageModelsConfigurationService>() {
				override onDidChangeLanguageModelGroups = Event.None;
				override getLanguageModelsProviderGroups() {
					return [];
				}
			},
			new class extends mock<IQuickInputService>() { },
			new TestSecretStorageService(),
			new class extends mock<IProductService>() { override readonly version = '1.100.0'; },
			new class extends mock<IRequestService>() { },
		);

		languageModels.deltaLanguageModelChatProviderDescriptors([
			{ vendor: 'test-vendor', displayName: 'Test Vendor', configuration: undefined, managementCommand: undefined, when: undefined },
			{ vendor: 'actual-vendor', displayName: 'Actual Vendor', configuration: undefined, managementCommand: undefined, when: undefined }
		], []);

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
						isDefaultForLocation: {}
					} satisfies ILanguageModelChatMetadata,
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
						isDefaultForLocation: {}
					} satisfies ILanguageModelChatMetadata
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
						isDefaultForLocation: {}
					} satisfies ILanguageModelChatMetadata
				];
				const modelMetadataAndIdentifier = modelMetadata.map(m => ({
					metadata: m,
					identifier: m.id,
				}));
				return modelMetadataAndIdentifier;
			},
			sendChatRequest: async (modelId: string, messages: IChatMessage[], _from: ExtensionIdentifier | undefined, _options: { [name: string]: any }, token: CancellationToken) => {
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
		languageModels.deltaLanguageModelChatProviderDescriptors([
			{ vendor: 'actual-vendor', displayName: 'Actual Vendor', configuration: undefined, managementCommand: undefined, when: undefined }
		], []);

		const models = await languageModels.selectLanguageModels({ id: 'actual-lm' });
		assert.ok(models.length === 1);

		const first = models[0];

		const cts = new CancellationTokenSource();

		const request = await languageModels.sendChatRequest(first, nullExtensionDescription.identifier, [{ role: ChatMessageRole.User, content: [{ type: 'text', value: 'hello' }] }], {}, cts.token);

		assert.ok(request);

		cts.dispose(true);

		await request.result;
	});

	test('when clause defaults to true when omitted', async function () {
		const vendors = languageModels.getVendors();
		// Both test-vendor and actual-vendor have no when clause, so they should be visible
		assert.ok(vendors.length >= 2);
		assert.ok(vendors.some(v => v.vendor === 'test-vendor'));
		assert.ok(vendors.some(v => v.vendor === 'actual-vendor'));
	});
});

suite('LanguageModels - When Clause', function () {

	class TestContextKeyService extends MockContextKeyService {
		override contextMatchesRules(rules: ContextKeyExpression): boolean {
			if (!rules) {
				return true;
			}
			// Simple evaluation based on stored keys
			const keys = rules.keys();
			for (const key of keys) {
				const contextKey = this.getContextKeyValue(key);
				// If the key exists and is truthy, the rule matches
				if (contextKey) {
					return true;
				}
			}
			return false;
		}
	}

	let languageModelsWithWhen: LanguageModelsService;
	let contextKeyService: TestContextKeyService;

	setup(function () {
		contextKeyService = new TestContextKeyService();
		contextKeyService.createKey('testKey', true);

		languageModelsWithWhen = new LanguageModelsService(
			new class extends mock<IExtensionService>() {
				override activateByEvent(name: string) {
					return Promise.resolve();
				}
			},
			new NullLogService(),
			new TestStorageService(),
			contextKeyService,
			new class extends mock<ILanguageModelsConfigurationService>() {
				override onDidChangeLanguageModelGroups = Event.None;
			},
			new class extends mock<IQuickInputService>() { },
			new TestSecretStorageService(),
			new class extends mock<IProductService>() { override readonly version = '1.100.0'; },
			new class extends mock<IRequestService>() { },
		);

		languageModelsWithWhen.deltaLanguageModelChatProviderDescriptors([
			{ vendor: 'visible-vendor', displayName: 'Visible Vendor', configuration: undefined, managementCommand: undefined, when: undefined },
			{ vendor: 'conditional-vendor', displayName: 'Conditional Vendor', configuration: undefined, managementCommand: undefined, when: 'testKey' },
			{ vendor: 'hidden-vendor', displayName: 'Hidden Vendor', configuration: undefined, managementCommand: undefined, when: 'falseKey' }
		], []);
	});

	teardown(function () {
		languageModelsWithWhen.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('when clause filters vendors correctly', async function () {
		const vendors = languageModelsWithWhen.getVendors();
		assert.strictEqual(vendors.length, 2);
		assert.ok(vendors.some(v => v.vendor === 'visible-vendor'));
		assert.ok(vendors.some(v => v.vendor === 'conditional-vendor'));
		assert.ok(!vendors.some(v => v.vendor === 'hidden-vendor'));
	});

	test('when clause evaluates to true when context key is true', async function () {
		const vendors = languageModelsWithWhen.getVendors();
		assert.ok(vendors.some(v => v.vendor === 'conditional-vendor'), 'conditional-vendor should be visible when testKey is true');
	});

	test('when clause evaluates to false when context key is false', async function () {
		const vendors = languageModelsWithWhen.getVendors();
		assert.ok(!vendors.some(v => v.vendor === 'hidden-vendor'), 'hidden-vendor should be hidden when falseKey is false');
	});

});

suite('LanguageModels - Model Change Events', function () {

	let languageModelsService: LanguageModelsService;
	let storageService: TestStorageService;
	const disposables = new DisposableStore();

	setup(async function () {
		storageService = new TestStorageService();

		languageModelsService = new LanguageModelsService(
			new class extends mock<IExtensionService>() {
				override activateByEvent(name: string) {
					return Promise.resolve();
				}
			},
			new NullLogService(),
			storageService,
			new MockContextKeyService(),
			new class extends mock<ILanguageModelsConfigurationService>() {
				override onDidChangeLanguageModelGroups = Event.None;
				override getLanguageModelsProviderGroups() {
					return [];
				}
			},
			new class extends mock<IQuickInputService>() { },
			new TestSecretStorageService(),
			new class extends mock<IProductService>() { override readonly version = '1.100.0'; },
			new class extends mock<IRequestService>() { },
		);

		// Register the vendor first
		languageModelsService.deltaLanguageModelChatProviderDescriptors([
			{ vendor: 'test-vendor', displayName: 'Test Vendor', configuration: undefined, managementCommand: undefined, when: undefined }
		], []);
	});

	teardown(function () {
		languageModelsService.dispose();
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('fires onChange event when new models are added', async function () {
		// Create a promise that resolves when the event fires
		const eventPromise = new Promise<string>((resolve) => {
			disposables.add(languageModelsService.onDidChangeLanguageModels((vendorId) => {
				resolve(vendorId);
			}));
		});

		const onDidChangeEmitter = new Emitter<void>();
		disposables.add(onDidChangeEmitter);

		disposables.add(languageModelsService.registerLanguageModelProvider('test-vendor', {
			onDidChange: onDidChangeEmitter.event,
			provideLanguageModelChatInfo: async () => {
				return [{
					metadata: {
						extension: nullExtensionDescription.identifier,
						name: 'Model 1',
						vendor: 'test-vendor',
						family: 'family1',
						version: '1.0',
						id: 'model1',
						maxInputTokens: 100,
						maxOutputTokens: 100,
						modelPickerCategory: undefined,
						isDefaultForLocation: {}
					} satisfies ILanguageModelChatMetadata,
					identifier: 'test-vendor/model1'
				}];
			},
			sendChatRequest: async () => { throw new Error(); },
			provideTokenCount: async () => { throw new Error(); }
		}));

		// Trigger model resolution by firing provider change
		onDidChangeEmitter.fire();

		const firedVendorId = await eventPromise;
		assert.strictEqual(firedVendorId, 'test-vendor', 'Should fire event when new models are added');
	});

	test('does not fire onChange event when models are unchanged', async function () {
		const models = [{
			metadata: {
				extension: nullExtensionDescription.identifier,
				name: 'Model 1',
				vendor: 'test-vendor',
				family: 'family1',
				version: '1.0',
				id: 'model1',
				maxInputTokens: 100,
				maxOutputTokens: 100,
				modelPickerCategory: undefined,
				isDefaultForLocation: {}
			} satisfies ILanguageModelChatMetadata,
			identifier: 'test-vendor/model1'
		}];

		let onDidChangeEmitter: any;
		disposables.add(languageModelsService.registerLanguageModelProvider('test-vendor', {
			onDidChange: (listener) => {
				onDidChangeEmitter = { fire: () => listener() };
				return { dispose: () => { } };
			},
			provideLanguageModelChatInfo: async () => models,
			sendChatRequest: async () => { throw new Error(); },
			provideTokenCount: async () => { throw new Error(); }
		}));

		// Initial resolution
		await languageModelsService.selectLanguageModels({ vendor: 'test-vendor' });

		// Listen for change event
		let eventFired = false;
		disposables.add(languageModelsService.onDidChangeLanguageModels(() => {
			eventFired = true;
		}));
		// Trigger provider change with same models
		onDidChangeEmitter.fire();

		// Call selectLanguageModels again - provider will return different models
		await languageModelsService.selectLanguageModels({ vendor: 'test-vendor' });
		assert.strictEqual(eventFired, false, 'Should not fire event when models are unchanged');
	});

	test('fires onChange event when model metadata changes', async function () {
		const initialModels = [{
			metadata: {
				extension: nullExtensionDescription.identifier,
				name: 'Model 1',
				vendor: 'test-vendor',
				family: 'family1',
				version: '1.0',
				id: 'model1',
				maxInputTokens: 100,
				maxOutputTokens: 100,
				modelPickerCategory: undefined,
				isDefaultForLocation: {}
			} satisfies ILanguageModelChatMetadata,
			identifier: 'test-vendor/model1'
		}];

		let currentModels = initialModels;
		let onDidChangeEmitter: any;
		disposables.add(languageModelsService.registerLanguageModelProvider('test-vendor', {
			onDidChange: (listener) => {
				onDidChangeEmitter = { fire: () => listener() };
				return { dispose: () => { } };
			},
			provideLanguageModelChatInfo: async () => currentModels,
			sendChatRequest: async () => { throw new Error(); },
			provideTokenCount: async () => { throw new Error(); }
		}));

		// Initial resolution
		await languageModelsService.selectLanguageModels({ vendor: 'test-vendor' });

		// Create a promise that resolves when the event fires
		const eventPromise = new Promise<void>((resolve) => {
			disposables.add(languageModelsService.onDidChangeLanguageModels(() => {
				resolve();
			}));
		});

		// Change model metadata (e.g., maxInputTokens)
		currentModels = [{
			metadata: {
				...initialModels[0].metadata,
				maxInputTokens: 200 // Changed from 100
			},
			identifier: 'test-vendor/model1'
		}];

		onDidChangeEmitter.fire();

		await eventPromise;
		assert.ok(true, 'Event fired when model metadata changed');
	});

	test('fires onChange event when models are removed', async function () {
		let currentModels = [{
			metadata: {
				extension: nullExtensionDescription.identifier,
				name: 'Model 1',
				vendor: 'test-vendor',
				family: 'family1',
				version: '1.0',
				id: 'model1',
				maxInputTokens: 100,
				maxOutputTokens: 100,
				modelPickerCategory: undefined,
				isDefaultForLocation: {}
			} satisfies ILanguageModelChatMetadata,
			identifier: 'test-vendor/model1'
		}];

		let onDidChangeEmitter: any;
		disposables.add(languageModelsService.registerLanguageModelProvider('test-vendor', {
			onDidChange: (listener) => {
				onDidChangeEmitter = { fire: () => listener() };
				return { dispose: () => { } };
			},
			provideLanguageModelChatInfo: async () => currentModels,
			sendChatRequest: async () => { throw new Error(); },
			provideTokenCount: async () => { throw new Error(); }
		}));

		// Initial resolution
		await languageModelsService.selectLanguageModels({ vendor: 'test-vendor' });

		// Create a promise that resolves when the event fires
		const eventPromise = new Promise<void>((resolve) => {
			disposables.add(languageModelsService.onDidChangeLanguageModels(() => {
				resolve();
			}));
		});

		// Remove all models
		currentModels = [];

		onDidChangeEmitter.fire();

		await eventPromise;
		assert.ok(true, 'Event fired when models were removed');
	});

	test('fires onChange event when new model is added to existing set', async function () {
		let currentModels = [{
			metadata: {
				extension: nullExtensionDescription.identifier,
				name: 'Model 1',
				vendor: 'test-vendor',
				family: 'family1',
				version: '1.0',
				id: 'model1',
				maxInputTokens: 100,
				maxOutputTokens: 100,
				modelPickerCategory: undefined,
				isDefaultForLocation: {}
			} satisfies ILanguageModelChatMetadata,
			identifier: 'test-vendor/model1'
		}];

		let onDidChangeEmitter: any;
		disposables.add(languageModelsService.registerLanguageModelProvider('test-vendor', {
			onDidChange: (listener) => {
				onDidChangeEmitter = { fire: () => listener() };
				return { dispose: () => { } };
			},
			provideLanguageModelChatInfo: async () => currentModels,
			sendChatRequest: async () => { throw new Error(); },
			provideTokenCount: async () => { throw new Error(); }
		}));

		// Initial resolution
		await languageModelsService.selectLanguageModels({ vendor: 'test-vendor' });

		// Create a promise that resolves when the event fires
		const eventPromise = new Promise<void>((resolve) => {
			disposables.add(languageModelsService.onDidChangeLanguageModels(() => {
				resolve();
			}));
		});

		// Add a new model
		currentModels = [
			...currentModels,
			{
				metadata: {
					extension: nullExtensionDescription.identifier,
					name: 'Model 2',
					vendor: 'test-vendor',
					family: 'family2',
					version: '1.0',
					id: 'model2',
					maxInputTokens: 100,
					maxOutputTokens: 100,
					modelPickerCategory: undefined,
					isDefaultForLocation: {}
				} satisfies ILanguageModelChatMetadata,
				identifier: 'test-vendor/model2'
			}
		];

		onDidChangeEmitter.fire();

		await eventPromise;
		assert.ok(true, 'Event fired when new model was added');
	});

	test('fires onChange event when models change without provider emitting change event', async function () {
		let callCount = 0;
		disposables.add(languageModelsService.registerLanguageModelProvider('test-vendor', {
			onDidChange: Event.None, // Provider doesn't emit change events
			provideLanguageModelChatInfo: async () => {
				callCount++;
				if (callCount === 1) {
					// First call returns initial model
					return [{
						metadata: {
							extension: nullExtensionDescription.identifier,
							name: 'Model 1',
							vendor: 'test-vendor',
							family: 'family1',
							version: '1.0',
							id: 'model1',
							maxInputTokens: 100,
							maxOutputTokens: 100,
							modelPickerCategory: undefined,
							isDefaultForLocation: {}
						} satisfies ILanguageModelChatMetadata,
						identifier: 'test-vendor/model1'
					}];
				} else {
					// Subsequent calls return different model
					return [{
						metadata: {
							extension: nullExtensionDescription.identifier,
							name: 'Model 2',
							vendor: 'test-vendor',
							family: 'family2',
							version: '2.0',
							id: 'model2',
							maxInputTokens: 200,
							maxOutputTokens: 200,
							modelPickerCategory: undefined,
							isDefaultForLocation: {}
						} satisfies ILanguageModelChatMetadata,
						identifier: 'test-vendor/model2'
					}];
				}
			},
			sendChatRequest: async () => { throw new Error(); },
			provideTokenCount: async () => { throw new Error(); }
		}));

		// Initial resolution
		await languageModelsService.selectLanguageModels({ vendor: 'test-vendor' });

		// Listen for change event
		let eventFired = false;
		disposables.add(languageModelsService.onDidChangeLanguageModels(() => {
			eventFired = true;
		}));

		// Call selectLanguageModels again - provider will return different models
		await languageModelsService.selectLanguageModels({ vendor: 'test-vendor' });

		assert.strictEqual(eventFired, true, 'Should fire event when models change even without provider change event');
	});
});

suite('LanguageModels - Vendor Change Events', function () {

	let languageModelsService: LanguageModelsService;
	const disposables = new DisposableStore();

	setup(function () {
		languageModelsService = new LanguageModelsService(
			new class extends mock<IExtensionService>() {
				override activateByEvent(name: string) {
					return Promise.resolve();
				}
			},
			new NullLogService(),
			new TestStorageService(),
			new MockContextKeyService(),
			new class extends mock<ILanguageModelsConfigurationService>() {
				override onDidChangeLanguageModelGroups = Event.None;
				override getLanguageModelsProviderGroups() {
					return [];
				}
			},
			new class extends mock<IQuickInputService>() { },
			new TestSecretStorageService(),
			new class extends mock<IProductService>() { override readonly version = '1.100.0'; },
			new class extends mock<IRequestService>() { },
		);
	});

	teardown(function () {
		languageModelsService.dispose();
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('fires onDidChangeLanguageModelVendors when a vendor is added', async function () {
		const eventPromise = new Promise<readonly string[]>((resolve) => {
			disposables.add(languageModelsService.onDidChangeLanguageModelVendors(vendors => resolve(vendors)));
		});

		languageModelsService.deltaLanguageModelChatProviderDescriptors([
			{ vendor: 'added-vendor', displayName: 'Added Vendor', configuration: undefined, managementCommand: undefined, when: undefined }
		], []);

		const vendors = await eventPromise;
		assert.ok(vendors.includes('added-vendor'));
	});

	test('fires onDidChangeLanguageModelVendors when a vendor is removed', async function () {
		languageModelsService.deltaLanguageModelChatProviderDescriptors([
			{ vendor: 'removed-vendor', displayName: 'Removed Vendor', configuration: undefined, managementCommand: undefined, when: undefined }
		], []);

		const eventPromise = new Promise<readonly string[]>((resolve) => {
			disposables.add(languageModelsService.onDidChangeLanguageModelVendors(vendors => resolve(vendors)));
		});

		languageModelsService.deltaLanguageModelChatProviderDescriptors([], [
			{ vendor: 'removed-vendor', displayName: 'Removed Vendor', configuration: undefined, managementCommand: undefined, when: undefined }
		]);

		const vendors = await eventPromise;
		assert.ok(vendors.includes('removed-vendor'));
	});

	test('fires onDidChangeLanguageModelVendors when multiple vendors are added and removed', async function () {
		// Add multiple vendors
		const addEventPromise = new Promise<readonly string[]>((resolve) => {
			disposables.add(languageModelsService.onDidChangeLanguageModelVendors(vendors => resolve(vendors)));
		});

		languageModelsService.deltaLanguageModelChatProviderDescriptors([
			{ vendor: 'vendor-a', displayName: 'Vendor A', configuration: undefined, managementCommand: undefined, when: undefined },
			{ vendor: 'vendor-b', displayName: 'Vendor B', configuration: undefined, managementCommand: undefined, when: undefined }
		], []);

		const addedVendors = await addEventPromise;
		assert.ok(addedVendors.includes('vendor-a'));
		assert.ok(addedVendors.includes('vendor-b'));

		// Remove one vendor
		const removeEventPromise = new Promise<readonly string[]>((resolve) => {
			disposables.add(languageModelsService.onDidChangeLanguageModelVendors(vendors => resolve(vendors)));
		});

		languageModelsService.deltaLanguageModelChatProviderDescriptors([], [
			{ vendor: 'vendor-a', displayName: 'Vendor A', configuration: undefined, managementCommand: undefined, when: undefined }
		]);

		const removedVendors = await removeEventPromise;
		assert.ok(removedVendors.includes('vendor-a'));
	});

	test('does not fire onDidChangeLanguageModelVendors when no vendors are added or removed', async function () {
		// Add initial vendor
		languageModelsService.deltaLanguageModelChatProviderDescriptors([
			{ vendor: 'stable-vendor', displayName: 'Stable Vendor', configuration: undefined, managementCommand: undefined, when: undefined }
		], []);

		// Listen for change event
		let eventFired = false;
		disposables.add(languageModelsService.onDidChangeLanguageModelVendors(() => {
			eventFired = true;
		}));

		// Call with empty arrays - should not fire event
		languageModelsService.deltaLanguageModelChatProviderDescriptors([], []);

		assert.strictEqual(eventFired, false, 'Should not fire event when vendor list is unchanged');
	});
});

suite('LanguageModels - Per-Model Configuration', function () {

	let languageModelsService: LanguageModelsService;
	const disposables = new DisposableStore();
	let receivedOptions: { [name: string]: unknown } | undefined;

	setup(async function () {
		receivedOptions = undefined;

		languageModelsService = new LanguageModelsService(
			new class extends mock<IExtensionService>() {
				override activateByEvent() {
					return Promise.resolve();
				}
			},
			new NullLogService(),
			new TestStorageService(),
			new MockContextKeyService(),
			new class extends mock<ILanguageModelsConfigurationService>() {
				override onDidChangeLanguageModelGroups = Event.None;
				override getLanguageModelsProviderGroups() {
					return [{
						vendor: 'config-vendor',
						name: 'default',
						settings: {
							'model-a': { temperature: 0.7, reasoningEffort: 'high' },
							'model-b': { temperature: 0.2 }
						}
					}];
				}
			},
			new class extends mock<IQuickInputService>() { },
			new TestSecretStorageService(),
			new class extends mock<IProductService>() { override readonly version = '1.100.0'; },
			new class extends mock<IRequestService>() { },
		);

		languageModelsService.deltaLanguageModelChatProviderDescriptors([
			{ vendor: 'config-vendor', displayName: 'Config Vendor', configuration: undefined, managementCommand: undefined, when: undefined }
		], []);

		disposables.add(languageModelsService.registerLanguageModelProvider('config-vendor', {
			onDidChange: Event.None,
			provideLanguageModelChatInfo: async (options) => {
				if (options.group) {
					return [{
						metadata: {
							extension: nullExtensionDescription.identifier,
							name: 'Model A',
							vendor: 'config-vendor',
							family: 'family-a',
							version: '1.0',
							id: 'model-a',
							maxInputTokens: 100,
							maxOutputTokens: 100,
							modelPickerCategory: DEFAULT_MODEL_PICKER_CATEGORY,
							isDefaultForLocation: {},
							configurationSchema: {
								type: 'object',
								properties: {
									temperature: { type: 'number', default: 0.5 },
									reasoningEffort: { type: 'string', default: 'medium' },
									maxTokens: { type: 'number', default: 4096 }
								}
							}
						} satisfies ILanguageModelChatMetadata,
						identifier: 'config-vendor/default/model-a'
					}, {
						metadata: {
							extension: nullExtensionDescription.identifier,
							name: 'Model B',
							vendor: 'config-vendor',
							family: 'family-b',
							version: '1.0',
							id: 'model-b',
							maxInputTokens: 100,
							maxOutputTokens: 100,
							modelPickerCategory: DEFAULT_MODEL_PICKER_CATEGORY,
							isDefaultForLocation: {}
						} satisfies ILanguageModelChatMetadata,
						identifier: 'config-vendor/default/model-b'
					}];
				}
				return [];
			},
			sendChatRequest: async (_modelId, _messages, _from, options) => {
				receivedOptions = options;
				const defer = new DeferredPromise();
				const stream = new AsyncIterableSource<IChatResponsePart>();
				stream.resolve();
				defer.complete(undefined);
				return { stream: stream.asyncIterable, result: defer.p };
			},
			provideTokenCount: async () => { throw new Error(); }
		}));

		await languageModelsService.selectLanguageModels({});
	});

	teardown(function () {
		languageModelsService.dispose();
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('getModelConfiguration returns per-model config from group', function () {
		const configA = languageModelsService.getModelConfiguration('config-vendor/default/model-a');
		assert.deepStrictEqual(configA, { temperature: 0.7, reasoningEffort: 'high', maxTokens: 4096 });

		const configB = languageModelsService.getModelConfiguration('config-vendor/default/model-b');
		assert.deepStrictEqual(configB, { temperature: 0.2 });
	});

	test('getModelConfiguration returns undefined for unknown model', function () {
		const config = languageModelsService.getModelConfiguration('config-vendor/default/model-c');
		assert.strictEqual(config, undefined);
	});

	test('sendChatRequest merges schema defaults with user config', async function () {
		const cts = disposables.add(new CancellationTokenSource());
		const request = await languageModelsService.sendChatRequest(
			'config-vendor/default/model-a',
			nullExtensionDescription.identifier,
			[{ role: ChatMessageRole.User, content: [{ type: 'text', value: 'hello' }] }],
			{},
			cts.token
		);
		await request.result;

		// User config overrides defaults: temperature=0.7 (not 0.5), reasoningEffort='high' (not 'medium')
		// Schema default maxTokens=4096 is included since user didn't override it
		assert.deepStrictEqual(receivedOptions, { configuration: { temperature: 0.7, reasoningEffort: 'high', maxTokens: 4096 } });
	});

	test('sendChatRequest passes user config when model has no schema', async function () {
		const cts = disposables.add(new CancellationTokenSource());
		const request = await languageModelsService.sendChatRequest(
			'config-vendor/default/model-b',
			nullExtensionDescription.identifier,
			[{ role: ChatMessageRole.User, content: [{ type: 'text', value: 'hello' }] }],
			{},
			cts.token
		);
		await request.result;

		assert.deepStrictEqual(receivedOptions, { configuration: { temperature: 0.2 } });
	});
});

suite('LanguageModels - Provider Group Detail Fallback', function () {

	const disposables = new DisposableStore();

	teardown(function () {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('model.detail falls back to the group name so multiple instances of the same vendor are distinguishable', async function () {
		const languageModelsService = disposables.add(new LanguageModelsService(
			new class extends mock<IExtensionService>() {
				override activateByEvent() {
					return Promise.resolve();
				}
			},
			new NullLogService(),
			disposables.add(new TestStorageService()),
			new MockContextKeyService(),
			new class extends mock<ILanguageModelsConfigurationService>() {
				override onDidChangeLanguageModelGroups = Event.None;
				override getLanguageModelsProviderGroups() {
					return [
						{ vendor: 'multi-vendor', name: 'Local' },
						{ vendor: 'multi-vendor', name: 'Remote' }
					];
				}
			},
			new class extends mock<IQuickInputService>() { },
			new TestSecretStorageService(),
			new class extends mock<IProductService>() { override readonly version = '1.100.0'; },
			new class extends mock<IRequestService>() { },
		));

		languageModelsService.deltaLanguageModelChatProviderDescriptors([
			// Cast needed: TypeFromJsonSchema resolves the `anyOf`+`$ref` configuration
			// field to `undefined`, but the runtime value must be truthy so the
			// service treats this vendor as a configurable (BYOK) provider and
			// resolves models for every group rather than stopping after the first.
			{ vendor: 'multi-vendor', displayName: 'Multi Vendor', configuration: {} as unknown as undefined, managementCommand: undefined, when: undefined }
		], []);

		disposables.add(languageModelsService.registerLanguageModelProvider('multi-vendor', {
			onDidChange: Event.None,
			provideLanguageModelChatInfo: async (options) => {
				if (!options.group) {
					return [];
				}
				// Provider returns the same model id for each group, but the
				// identifier is namespaced by group so they don't collide.
				// The provider does not set `detail`; the service should fall
				// back to the per-instance group name.
				return [{
					metadata: {
						extension: nullExtensionDescription.identifier,
						name: 'Shared Model',
						vendor: 'multi-vendor',
						family: 'shared',
						version: '1.0',
						id: 'shared-model',
						maxInputTokens: 100,
						maxOutputTokens: 100,
						modelPickerCategory: DEFAULT_MODEL_PICKER_CATEGORY,
						isDefaultForLocation: {}
					} satisfies ILanguageModelChatMetadata,
					identifier: `multi-vendor/${options.group}/shared-model`
				}];
			},
			sendChatRequest: async () => { throw new Error(); },
			provideTokenCount: async () => { throw new Error(); }
		}));

		await languageModelsService.selectLanguageModels({});

		const local = languageModelsService.lookupLanguageModel('multi-vendor/Local/shared-model');
		const remote = languageModelsService.lookupLanguageModel('multi-vendor/Remote/shared-model');

		assert.deepStrictEqual(
			{ localDetail: local?.detail, remoteDetail: remote?.detail },
			{ localDetail: 'Local', remoteDetail: 'Remote' }
		);
	});

	test('model.detail falls back to the group name even when there is only a single group for the vendor', async function () {
		const languageModelsService = disposables.add(new LanguageModelsService(
			new class extends mock<IExtensionService>() {
				override activateByEvent() {
					return Promise.resolve();
				}
			},
			new NullLogService(),
			disposables.add(new TestStorageService()),
			new MockContextKeyService(),
			new class extends mock<ILanguageModelsConfigurationService>() {
				override onDidChangeLanguageModelGroups = Event.None;
				override getLanguageModelsProviderGroups() {
					return [
						{ vendor: 'single-vendor', name: 'Only Instance' }
					];
				}
			},
			new class extends mock<IQuickInputService>() { },
			new TestSecretStorageService(),
			new class extends mock<IProductService>() { override readonly version = '1.100.0'; },
			new class extends mock<IRequestService>() { },
		));

		languageModelsService.deltaLanguageModelChatProviderDescriptors([
			{ vendor: 'single-vendor', displayName: 'Single Vendor', configuration: undefined, managementCommand: undefined, when: undefined }
		], []);

		disposables.add(languageModelsService.registerLanguageModelProvider('single-vendor', {
			onDidChange: Event.None,
			provideLanguageModelChatInfo: async (options) => {
				if (!options.group) {
					return [];
				}
				return [{
					metadata: {
						extension: nullExtensionDescription.identifier,
						name: 'Solo Model',
						vendor: 'single-vendor',
						family: 'solo',
						version: '1.0',
						id: 'solo-model',
						maxInputTokens: 100,
						maxOutputTokens: 100,
						modelPickerCategory: DEFAULT_MODEL_PICKER_CATEGORY,
						isDefaultForLocation: {}
					} satisfies ILanguageModelChatMetadata,
					identifier: `single-vendor/${options.group}/solo-model`
				}];
			},
			sendChatRequest: async () => { throw new Error(); },
			provideTokenCount: async () => { throw new Error(); }
		}));

		await languageModelsService.selectLanguageModels({});

		const solo = languageModelsService.lookupLanguageModel('single-vendor/Only Instance/solo-model');

		assert.strictEqual(solo?.detail, 'Only Instance');
	});

	test('a provider-supplied detail is preserved when multiple groups exist', async function () {
		const languageModelsService = disposables.add(new LanguageModelsService(
			new class extends mock<IExtensionService>() {
				override activateByEvent() {
					return Promise.resolve();
				}
			},
			new NullLogService(),
			disposables.add(new TestStorageService()),
			new MockContextKeyService(),
			new class extends mock<ILanguageModelsConfigurationService>() {
				override onDidChangeLanguageModelGroups = Event.None;
				override getLanguageModelsProviderGroups() {
					return [
						{ vendor: 'detail-vendor', name: 'Local' },
						{ vendor: 'detail-vendor', name: 'Remote' }
					];
				}
			},
			new class extends mock<IQuickInputService>() { },
			new TestSecretStorageService(),
			new class extends mock<IProductService>() { override readonly version = '1.100.0'; },
			new class extends mock<IRequestService>() { },
		));

		languageModelsService.deltaLanguageModelChatProviderDescriptors([
			// Cast needed: see equivalent comment in the multi-vendor test above.
			{ vendor: 'detail-vendor', displayName: 'Detail Vendor', configuration: {} as unknown as undefined, managementCommand: undefined, when: undefined }
		], []);

		disposables.add(languageModelsService.registerLanguageModelProvider('detail-vendor', {
			onDidChange: Event.None,
			provideLanguageModelChatInfo: async (options) => {
				if (!options.group) {
					return [];
				}
				// Provider supplies its own detail. The service should leave
				// it untouched and only fall back to the group name when the
				// provider does not set one.
				return [{
					metadata: {
						extension: nullExtensionDescription.identifier,
						name: 'Detailed Model',
						vendor: 'detail-vendor',
						family: 'detailed',
						version: '1.0',
						id: 'detailed-model',
						detail: `Detailed (${options.group})`,
						maxInputTokens: 100,
						maxOutputTokens: 100,
						modelPickerCategory: DEFAULT_MODEL_PICKER_CATEGORY,
						isDefaultForLocation: {}
					} satisfies ILanguageModelChatMetadata,
					identifier: `detail-vendor/${options.group}/detailed-model`
				}];
			},
			sendChatRequest: async () => { throw new Error(); },
			provideTokenCount: async () => { throw new Error(); }
		}));

		await languageModelsService.selectLanguageModels({});

		const local = languageModelsService.lookupLanguageModel('detail-vendor/Local/detailed-model');
		const remote = languageModelsService.lookupLanguageModel('detail-vendor/Remote/detailed-model');

		assert.deepStrictEqual(
			{ localDetail: local?.detail, remoteDetail: remote?.detail },
			{ localDetail: 'Detailed (Local)', remoteDetail: 'Detailed (Remote)' }
		);
	});
});

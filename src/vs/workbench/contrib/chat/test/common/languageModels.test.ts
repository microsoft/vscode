/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { AsyncIterableObject, AsyncIterableSource, DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import Severity from '../../../../../base/common/severity.js';
import { SubmenuAction } from '../../../../../base/common/actions.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { ChatMessageRole, LanguageModelsService, IChatMessage, IChatResponsePart, ILanguageModelChatMetadata, createModelConfigurationActions, ILanguageModelConfigurationSchema, getByokProviderTelemetryName, THIRD_PARTY_PROVIDER_TELEMETRY_NAME, COPILOT_VENDOR_ID } from '../../common/languageModels.js';
import { IPromptChoice, IPromptOptions } from '../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { NullOpenerService } from '../../../../../platform/opener/test/common/nullOpenerService.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IExtensionService, nullExtensionDescription } from '../../../../services/extensions/common/extensions.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ContextKeyExpression } from '../../../../../platform/contextkey/common/contextkey.js';
import { ConfigureLanguageModelsOptions, ILanguageModelsConfigurationService, ILanguageModelsProviderGroup } from '../../common/languageModelsConfiguration.js';
import { IInputBox, IQuickInputHideEvent, IQuickInputService, QuickInputHideReason } from '../../../../../platform/quickinput/common/quickInput.js';
import { TestSecretStorageService } from '../../../../../platform/secrets/test/common/testSecretStorageService.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IRequestService } from '../../../../../platform/request/common/request.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';

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
			new TestNotificationService(),
			NullOpenerService,
			NullTelemetryService,
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

	test('selectLanguageModels matches by id for copilot vendor models even when isUserSelectable is false', async function () {
		// Mirrors how the copilot extension publishes utility aliases such as
		// `copilot-utility-small`: under the `copilot` (default) vendor, with
		// `isUserSelectable: false`. The workbench's
		// `chatToolRiskAssessmentService` resolves them with
		// `selectLanguageModels({ vendor: 'copilot', id: 'copilot-utility-small' })`
		// and must get a match.
		languageModels.deltaLanguageModelChatProviderDescriptors([
			{ vendor: 'copilot', displayName: 'Copilot', configuration: undefined, managementCommand: undefined, when: undefined }
		], []);

		store.add(languageModels.registerLanguageModelProvider('copilot', {
			onDidChange: Event.None,
			provideLanguageModelChatInfo: async () => {
				const modelMetadata: ILanguageModelChatMetadata[] = [
					{
						extension: nullExtensionDescription.identifier,
						name: 'GPT 4o mini',
						vendor: 'copilot',
						family: 'gpt-4o-mini',
						version: '2024-07-18',
						id: 'gpt-4o-mini',
						maxInputTokens: 100,
						maxOutputTokens: 100,
						isDefaultForLocation: {}
					},
					{
						extension: nullExtensionDescription.identifier,
						name: 'GPT 4o mini',
						vendor: 'copilot',
						family: 'copilot-utility-small',
						version: '2024-07-18',
						id: 'copilot-utility-small',
						maxInputTokens: 100,
						maxOutputTokens: 100,
						isDefaultForLocation: {},
						isUserSelectable: false
					}
				];
				return modelMetadata.map(m => ({ metadata: m, identifier: `${m.vendor}/${m.id}` }));
			},
			sendChatRequest: async () => { throw new Error(); },
			provideTokenCount: async () => { throw new Error(); }
		}));

		const result = await languageModels.selectLanguageModels({ vendor: 'copilot', id: 'copilot-utility-small' });
		assert.deepStrictEqual(result, ['copilot/copilot-utility-small']);
	});

	test('model visibility — defaults to visible', async function () {
		await languageModels.selectLanguageModels({}); // resolve models so groups populate
		assert.strictEqual(languageModels.isModelHidden('test-id-1'), false);
		assert.strictEqual(languageModels.isModelHidden('test-id-12'), false);
		assert.strictEqual(languageModels.isGroupHidden('test-vendor', 'Test Vendor'), false);
		assert.deepStrictEqual(languageModels.getHiddenModelIds(), []);
	});

	test('model visibility — hide and show a single model', async function () {
		await languageModels.selectLanguageModels({});

		let fired = 0;
		store.add(languageModels.onDidChangeModelVisibility(() => fired++));

		languageModels.setModelHidden('test-id-1', true);
		assert.strictEqual(languageModels.isModelHidden('test-id-1'), true);
		assert.strictEqual(languageModels.isModelHidden('test-id-12'), false);
		assert.deepStrictEqual(languageModels.getHiddenModelIds(), ['test-id-1']);
		assert.strictEqual(fired, 1);

		languageModels.setModelHidden('test-id-1', false);
		assert.strictEqual(languageModels.isModelHidden('test-id-1'), false);
		assert.deepStrictEqual(languageModels.getHiddenModelIds(), []);
		assert.strictEqual(fired, 2);
	});

	test('model visibility — hiding every model in a group hides the group', async function () {
		await languageModels.selectLanguageModels({});

		languageModels.setModelHidden('test-id-1', true);
		languageModels.setModelHidden('test-id-12', true);

		assert.deepStrictEqual({
			groupHidden: languageModels.isGroupHidden('test-vendor', 'Test Vendor'),
			firstModelHidden: languageModels.isModelHidden('test-id-1'),
			secondModelHidden: languageModels.isModelHidden('test-id-12'),
			hiddenModels: languageModels.getHiddenModelIds(),
		}, {
			groupHidden: true,
			firstModelHidden: true,
			secondModelHidden: true,
			hiddenModels: ['test-id-1', 'test-id-12'],
		});
	});

	test('model visibility — hide and show an entire group', async function () {
		await languageModels.selectLanguageModels({});

		languageModels.setGroupHidden('test-vendor', 'Test Vendor', true);
		assert.strictEqual(languageModels.isGroupHidden('test-vendor', 'Test Vendor'), true);
		assert.strictEqual(languageModels.isModelHidden('test-id-1'), true);
		assert.strictEqual(languageModels.isModelHidden('test-id-12'), true);
		assert.deepStrictEqual(languageModels.getHiddenModelIds(), ['test-id-1', 'test-id-12']);

		languageModels.setGroupHidden('test-vendor', 'Test Vendor', false);
		assert.strictEqual(languageModels.isGroupHidden('test-vendor', 'Test Vendor'), false);
		assert.strictEqual(languageModels.isModelHidden('test-id-1'), false);
		assert.strictEqual(languageModels.isModelHidden('test-id-12'), false);
		assert.deepStrictEqual(languageModels.getHiddenModelIds(), []);
	});

	test('model visibility — showing a model in a hidden group reveals the model and the group, but keeps siblings hidden', async function () {
		await languageModels.selectLanguageModels({});

		languageModels.setGroupHidden('test-vendor', 'Test Vendor', true);
		assert.strictEqual(languageModels.isModelHidden('test-id-1'), true);
		assert.strictEqual(languageModels.isModelHidden('test-id-12'), true);

		languageModels.setModelHidden('test-id-1', false);

		// The group is no longer hidden — the user explicitly chose to surface a model.
		assert.strictEqual(languageModels.isGroupHidden('test-vendor', 'Test Vendor'), false);
		// The selected model is visible…
		assert.strictEqual(languageModels.isModelHidden('test-id-1'), false);
		// …but the sibling stays hidden.
		assert.strictEqual(languageModels.isModelHidden('test-id-12'), true);
		assert.deepStrictEqual(languageModels.getHiddenModelIds(), ['test-id-12']);
	});

	test('model visibility — hiding a model whose group is already hidden is a no-op', async function () {
		await languageModels.selectLanguageModels({});

		languageModels.setGroupHidden('test-vendor', 'Test Vendor', true);
		const before = languageModels.getHiddenModelIds();
		languageModels.setModelHidden('test-id-1', true);
		assert.deepStrictEqual(languageModels.getHiddenModelIds(), before);
		assert.strictEqual(languageModels.isModelHidden('test-id-1'), true);
	});

	test('model visibility — hiding a group hides every current member model', async function () {
		await languageModels.selectLanguageModels({});

		languageModels.setModelHidden('test-id-1', true);
		assert.deepStrictEqual(languageModels.getHiddenModelIds(), ['test-id-1']);

		languageModels.setGroupHidden('test-vendor', 'Test Vendor', true);
		assert.deepStrictEqual(languageModels.getHiddenModelIds(), ['test-id-1', 'test-id-12']);
		assert.strictEqual(languageModels.isModelHidden('test-id-1'), true);
		assert.strictEqual(languageModels.isModelHidden('test-id-12'), true);
	});

	test('model visibility — unhiding a group shows every current member model', async function () {
		await languageModels.selectLanguageModels({});

		languageModels.setGroupHidden('test-vendor', 'Test Vendor', true);
		languageModels.setModelHidden('test-id-1', false);
		assert.deepStrictEqual(languageModels.getHiddenModelIds(), ['test-id-12']);

		languageModels.setGroupHidden('test-vendor', 'Test Vendor', false);
		assert.deepStrictEqual(languageModels.getHiddenModelIds(), []);
		assert.strictEqual(languageModels.isModelHidden('test-id-1'), false);
		assert.strictEqual(languageModels.isModelHidden('test-id-12'), false);
	});

	test('model visibility — onDidChangeModelVisibility does not fire when state is unchanged', async function () {
		await languageModels.selectLanguageModels({});

		let fired = 0;
		store.add(languageModels.onDidChangeModelVisibility(() => fired++));

		// Already visible — no-op
		languageModels.setModelHidden('test-id-1', false);
		assert.strictEqual(fired, 0);

		languageModels.setModelHidden('test-id-1', true);
		assert.strictEqual(fired, 1);

		// Already hidden — no-op
		languageModels.setModelHidden('test-id-1', true);
		assert.strictEqual(fired, 1);
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
			new TestNotificationService(),
			NullOpenerService,
			NullTelemetryService,
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
			new TestNotificationService(),
			NullOpenerService,
			NullTelemetryService,
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
			new TestNotificationService(),
			NullOpenerService,
			NullTelemetryService,
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
			new TestNotificationService(),
			NullOpenerService,
			NullTelemetryService,
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

suite('LanguageModels - Per-Model Configuration with multiple same-vendor groups', function () {

	let languageModelsService: LanguageModelsService;
	let providerGroups: ILanguageModelsProviderGroup[];
	let updateCalls: { from: ILanguageModelsProviderGroup; to: ILanguageModelsProviderGroup }[];
	let addCalls: ILanguageModelsProviderGroup[];
	const disposables = new DisposableStore();

	function makeModel(group: string, id: string): { metadata: ILanguageModelChatMetadata; identifier: string } {
		return {
			metadata: {
				extension: nullExtensionDescription.identifier,
				name: id,
				vendor: 'customendpoint',
				family: id,
				version: '1.0',
				id,
				maxInputTokens: 100,
				maxOutputTokens: 100,
				isDefaultForLocation: {},
				configurationSchema: {
					type: 'object',
					properties: {
						reasoningEffort: { type: 'string', default: 'medium' }
					}
				}
			} satisfies ILanguageModelChatMetadata,
			identifier: `customendpoint/${group}/${id}`
		};
	}

	setup(async function () {
		// Two groups sharing the same `vendor`, each defining a different model.
		providerGroups = [
			{ vendor: 'customendpoint', name: 'DeepSeek' },
			{ vendor: 'customendpoint', name: 'MyCustom' }
		];
		updateCalls = [];
		addCalls = [];

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
					return providerGroups;
				}
				override async updateLanguageModelsProviderGroup(from: ILanguageModelsProviderGroup, to: ILanguageModelsProviderGroup): Promise<ILanguageModelsProviderGroup> {
					updateCalls.push({ from, to });
					providerGroups = providerGroups.map(group => group === from ? to : group);
					return to;
				}
				override async addLanguageModelsProviderGroup(group: ILanguageModelsProviderGroup): Promise<ILanguageModelsProviderGroup> {
					addCalls.push(group);
					providerGroups = [...providerGroups, group];
					return group;
				}
			},
			new class extends mock<IQuickInputService>() { },
			new TestSecretStorageService(),
			new class extends mock<IProductService>() { override readonly version = '1.100.0'; },
			new class extends mock<IRequestService>() { },
			new TestNotificationService(),
			NullOpenerService,
			NullTelemetryService,
		);

		languageModelsService.deltaLanguageModelChatProviderDescriptors([
			{
				vendor: 'customendpoint',
				displayName: 'Custom Endpoint',
				// Cast needed: TypeFromJsonSchema resolves the configuration field to
				// `undefined`, but a configurable vendor is required so models are
				// resolved per group.
				configuration: { type: 'object', properties: {} } as unknown as undefined,
				managementCommand: undefined,
				when: undefined
			}
		], []);

		disposables.add(languageModelsService.registerLanguageModelProvider('customendpoint', {
			onDidChange: Event.None,
			provideLanguageModelChatInfo: async (options) => {
				if (options.group === 'DeepSeek') {
					return [makeModel('DeepSeek', 'deepseek-v4-pro')];
				}
				if (options.group === 'MyCustom') {
					return [makeModel('MyCustom', 'gpt-5.5')];
				}
				return [];
			},
			sendChatRequest: async () => { throw new Error(); },
			provideTokenCount: async () => { throw new Error(); }
		}));

		await languageModelsService.selectLanguageModels({});
	});

	teardown(function () {
		languageModelsService.dispose();
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('setModelConfiguration writes to the group that defines the model, not the first group of the vendor (#322872)', async function () {
		await languageModelsService.setModelConfiguration('customendpoint/MyCustom/gpt-5.5', { reasoningEffort: 'high' });

		assert.strictEqual(addCalls.length, 0, 'should update the existing group, not create a new one');
		assert.strictEqual(updateCalls.length, 1);
		assert.strictEqual(updateCalls[0].from.name, 'MyCustom', 'config must be written to the MyCustom group');
		assert.deepStrictEqual(updateCalls[0].to.settings, { 'gpt-5.5': { reasoningEffort: 'high' } });

		const deepSeek = providerGroups.find(g => g.name === 'DeepSeek');
		assert.strictEqual(deepSeek?.settings, undefined, 'the DeepSeek group must be left untouched');
	});
});

suite('LanguageModels - Provider Group Management', function () {

	class TestInputBox extends mock<IInputBox>() {
		private readonly onDidChangeValueEmitter = new Emitter<string>();
		private readonly onDidAcceptEmitter = new Emitter<void>();
		private readonly onDidHideEmitter = new Emitter<IQuickInputHideEvent>();

		override readonly onDidChangeValue = this.onDidChangeValueEmitter.event;
		override readonly onDidAccept = this.onDidAcceptEmitter.event;
		override readonly onDidHide = this.onDidHideEmitter.event;

		override value = '';

		constructor(private readonly valueToAccept: string) {
			super();
		}

		override show(): void {
			this.value = this.valueToAccept;
			this.onDidChangeValueEmitter.fire(this.value);
			this.onDidAcceptEmitter.fire();
		}

		override hide(): void {
			this.onDidHideEmitter.fire({ reason: QuickInputHideReason.Other });
		}

		override dispose(): void {
			this.onDidChangeValueEmitter.dispose();
			this.onDidAcceptEmitter.dispose();
			this.onDidHideEmitter.dispose();
		}
	}

	let languageModelsService: LanguageModelsService;
	let providerGroups: ILanguageModelsProviderGroup[];
	let updateCalls: { from: ILanguageModelsProviderGroup; to: ILanguageModelsProviderGroup }[];
	let configureCalls: (ConfigureLanguageModelsOptions | undefined)[];
	let acceptedInputValues: string[];
	let secretStorageService: TestSecretStorageService;

	setup(function () {
		providerGroups = [{
			vendor: 'custom-vendor',
			name: 'Custom Group',
			apiKey: '${input:existing-secret}',
			settings: { model: { temperature: 0.7 } }
		}];
		updateCalls = [];
		configureCalls = [];
		acceptedInputValues = [];
		secretStorageService = new TestSecretStorageService();

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
					return providerGroups;
				}
				override async updateLanguageModelsProviderGroup(from: ILanguageModelsProviderGroup, to: ILanguageModelsProviderGroup): Promise<ILanguageModelsProviderGroup> {
					updateCalls.push({ from, to });
					providerGroups = providerGroups.map(group => group === from ? to : group);
					return to;
				}
				override async configureLanguageModels(options?: ConfigureLanguageModelsOptions): Promise<void> {
					configureCalls.push(options);
				}
			},
			new class extends mock<IQuickInputService>() {
				override createInputBox(): IInputBox {
					const value = acceptedInputValues.shift();
					if (value === undefined) {
						throw new Error('Missing scripted quick input value.');
					}
					return new TestInputBox(value);
				}
			},
			secretStorageService,
			new class extends mock<IProductService>() { override readonly version = '1.100.0'; },
			new class extends mock<IRequestService>() { },
			new TestNotificationService(),
			NullOpenerService,
			NullTelemetryService,
		);

		languageModelsService.deltaLanguageModelChatProviderDescriptors([
			{
				vendor: 'custom-vendor',
				displayName: 'Custom Vendor',
				// Cast needed: TypeFromJsonSchema resolves the `anyOf`+`$ref` configuration
				// field to `undefined`, but this provider-management test needs the
				// runtime schema so the vendor is treated as configurable.
				configuration: {
					type: 'object',
					required: ['apiKey'],
					properties: {
						apiKey: { type: 'string', secret: true },
						models: {
							type: 'array',
							defaultSnippets: [{ body: [{ id: '$1' }] }]
						}
					}
				} as unknown as undefined,
				managementCommand: undefined,
				when: undefined
			}
		], []);
	});

	teardown(function () {
		languageModelsService.dispose();
		secretStorageService.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('renameLanguageModelsProviderGroup updates only the selected group name', async function () {
		acceptedInputValues.push('Renamed Group');

		await languageModelsService.renameLanguageModelsProviderGroup('custom-vendor', 'Custom Group');

		assert.deepStrictEqual(updateCalls, [{
			from: {
				vendor: 'custom-vendor',
				name: 'Custom Group',
				apiKey: '${input:existing-secret}',
				settings: { model: { temperature: 0.7 } }
			},
			to: {
				vendor: 'custom-vendor',
				name: 'Renamed Group',
				apiKey: '${input:existing-secret}',
				settings: { model: { temperature: 0.7 } }
			}
		}]);
	});

	test('updateLanguageModelsProviderGroupApiKey stores the new secret and preserves model settings', async function () {
		acceptedInputValues.push('new-api-key');
		await secretStorageService.set('existing-secret', 'old-api-key');

		await languageModelsService.updateLanguageModelsProviderGroupApiKey('custom-vendor', 'Custom Group');

		const updatedGroup = updateCalls[0]?.to;
		const encodedApiKey = typeof updatedGroup?.apiKey === 'string' ? updatedGroup.apiKey : '';
		const secretKey = encodedApiKey.substring('${input:'.length, encodedApiKey.length - 1);
		assert.deepStrictEqual({
			encodedApiKeyUsesSecretStorage: encodedApiKey.startsWith('${input:chat.lm.secret.'),
			newSecretValue: await secretStorageService.get(secretKey),
			oldSecretValue: await secretStorageService.get('existing-secret'),
			settings: updatedGroup?.settings,
			identity: { name: updatedGroup?.name, vendor: updatedGroup?.vendor }
		}, {
			encodedApiKeyUsesSecretStorage: true,
			newSecretValue: 'new-api-key',
			oldSecretValue: undefined,
			settings: { model: { temperature: 0.7 } },
			identity: { name: 'Custom Group', vendor: 'custom-vendor' }
		});
	});

	test('updateLanguageModelsProviderGroupApiKey leaves the existing secret unchanged when the value is unchanged', async function () {
		acceptedInputValues.push('old-api-key');
		await secretStorageService.set('existing-secret', 'old-api-key');

		await languageModelsService.updateLanguageModelsProviderGroupApiKey('custom-vendor', 'Custom Group');

		assert.deepStrictEqual({
			updateCalls,
			secretKeys: await secretStorageService.keys(),
			secretValue: await secretStorageService.get('existing-secret')
		}, {
			updateCalls: [],
			secretKeys: ['existing-secret'],
			secretValue: 'old-api-key'
		});
	});

	test('addLanguageModelsProviderGroupModel inserts a models property when the group does not have one', async function () {
		await languageModelsService.addLanguageModelsProviderGroupModel('custom-vendor', 'Custom Group');

		assert.deepStrictEqual(configureCalls, [{
			group: providerGroups[0],
			snippet: `"models": [
	{
		"id": "$1"
	}
]`,
			snippetTarget: 'group'
		}]);
	});

	test('addLanguageModelsProviderGroupModel inserts a model item when the group already has models', async function () {
		providerGroups = [{ ...providerGroups[0], models: [{ id: 'existing' }] }];

		await languageModelsService.addLanguageModelsProviderGroupModel('custom-vendor', 'Custom Group');

		assert.deepStrictEqual(configureCalls, [{
			group: providerGroups[0],
			snippet: `{
	"id": "$1"
}`,
			snippetTarget: 'models'
		}]);
	});

	test('openLanguageModelsProviderGroupSettings opens the selected provider group', async function () {
		await languageModelsService.openLanguageModelsProviderGroupSettings('custom-vendor', 'Custom Group');

		assert.deepStrictEqual(configureCalls, [{ group: providerGroups[0] }]);
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
			new TestNotificationService(),
			NullOpenerService,
			NullTelemetryService,
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
			new TestNotificationService(),
			NullOpenerService,
			NullTelemetryService,
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
			new TestNotificationService(),
			NullOpenerService,
			NullTelemetryService,
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

suite('LanguageModels - Provider Deprecation Notice', function () {

	const disposables = new DisposableStore();

	teardown(function () {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	class RecordingNotificationService extends TestNotificationService {
		readonly prompts: { message: string; choices: IPromptChoice[]; options?: IPromptOptions }[] = [];
		override prompt(severity: Severity, message: string, choices: IPromptChoice[], options?: IPromptOptions) {
			this.prompts.push({ message, choices, options });
			return super.prompt(severity, message, choices, options);
		}
	}

	async function createService(vendor: string, displayName: string, link: string | undefined, opened: string[]): Promise<{ service: LanguageModelsService; modelId: string; notifications: RecordingNotificationService }> {
		const notifications = new RecordingNotificationService();
		const service = disposables.add(new LanguageModelsService(
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
					return [];
				}
			},
			new class extends mock<IQuickInputService>() { },
			new TestSecretStorageService(),
			new class extends mock<IProductService>() { override readonly version = '1.100.0'; override readonly urlProtocol = 'code-oss'; },
			new class extends mock<IRequestService>() { },
			notifications,
			new class extends mock<IOpenerService>() {
				override async open(resource: string | URI) {
					opened.push(resource.toString());
					return true;
				}
			},
			NullTelemetryService
		));

		service.deltaLanguageModelChatProviderDescriptors([
			{ vendor, displayName, configuration: undefined, managementCommand: undefined, when: undefined, deprecation: link ? { link } : undefined }
		], []);

		disposables.add(service.registerLanguageModelProvider(vendor, {
			onDidChange: Event.None,
			provideLanguageModelChatInfo: async () => ([{
				metadata: {
					extension: nullExtensionDescription.identifier,
					name: 'Deprecation Model',
					vendor,
					family: 'deprecation-family',
					version: '1.0',
					id: `${vendor}/deprecation-model`,
					maxInputTokens: 100,
					maxOutputTokens: 100,
					isDefaultForLocation: {}
				} satisfies ILanguageModelChatMetadata,
				identifier: `${vendor}/deprecation-model`
			}]),
			sendChatRequest: async () => ({ stream: AsyncIterableObject.EMPTY, result: Promise.resolve(undefined) }),
			provideTokenCount: async () => { throw new Error(); }
		}));

		const models = await service.selectLanguageModels({ id: `${vendor}/deprecation-model` });
		assert.strictEqual(models.length, 1);
		return { service, modelId: models[0], notifications };
	}

	function sendChat(service: LanguageModelsService, modelId: string): Promise<unknown> {
		return service.sendChatRequest(modelId, nullExtensionDescription.identifier, [{ role: ChatMessageRole.User, content: [{ type: 'text', value: 'hello' }] }], {}, CancellationToken.None);
	}

	test('prompts to install the replacement when a deprecated provider services a request', async function () {
		const opened: string[] = [];
		const { service, modelId, notifications } = await createService('ollama', 'Ollama (Deprecated)', 'vscode:extension/Ollama.ollama', opened);

		await sendChat(service, modelId);

		assert.strictEqual(notifications.prompts.length, 1);
		const prompt = notifications.prompts[0];
		assert.ok(prompt.message.includes('Ollama') && !prompt.message.includes('(Deprecated)'), `unexpected message: ${prompt.message}`);
		assert.strictEqual(prompt.options?.neverShowAgain?.id, 'chat.providerDeprecation.ollama');

		prompt.choices[0].run();
		assert.deepStrictEqual(opened, ['code-oss:extension/Ollama.ollama']);
	});

	test('shows the deprecation notice at most once per session', async function () {
		const { service, modelId, notifications } = await createService('ollama', 'Ollama (Deprecated)', 'vscode:extension/Ollama.ollama', []);

		await sendChat(service, modelId);
		await sendChat(service, modelId);

		assert.strictEqual(notifications.prompts.length, 1);
	});

	test('does not prompt for a provider without a deprecation link', async function () {
		const { service, modelId, notifications } = await createService('openai', 'OpenAI', undefined, []);

		await sendChat(service, modelId);

		assert.strictEqual(notifications.prompts.length, 0);
	});
});

suite('createModelConfigurationActions', function () {

	ensureNoDisposablesAreLeakedInTestSuite();

	const schema: ILanguageModelConfigurationSchema = {
		properties: {
			thinkingEffort: {
				title: 'Thinking Effort',
				enum: ['low', 'medium', 'high'],
				enumItemLabels: ['Low', 'Medium', 'High'],
				enumDescriptions: ['Fast', 'Balanced', 'Thorough'],
				default: 'medium',
			},
			// Included: single-item enums are shown as non-switchable indicators.
			singleChoice: { enum: ['only'], default: 'only' },
			// Skipped: not an enum.
			contextSize: { type: 'number', default: 1000 },
		}
	};

	test('returns no actions when schema is missing or has no properties', () => {
		assert.deepStrictEqual(createModelConfigurationActions(undefined, {}, () => { }), []);
		assert.deepStrictEqual(createModelConfigurationActions({}, {}, () => { }), []);
	});

	test('builds one submenu per enum property with >= 1 values', () => {
		const actions = createModelConfigurationActions(schema, {}, () => { });
		assert.strictEqual(actions.length, 2);
		const submenu = actions[0] as SubmenuAction;
		assert.ok(submenu instanceof SubmenuAction);
		assert.strictEqual(submenu.id, 'configureModel.thinkingEffort');
		assert.strictEqual(submenu.label, 'Thinking Effort');
		assert.strictEqual(submenu.actions.length, 3);
		const singleSubmenu = actions[1] as SubmenuAction;
		assert.ok(singleSubmenu instanceof SubmenuAction);
		assert.strictEqual(singleSubmenu.id, 'configureModel.singleChoice');
		assert.strictEqual(singleSubmenu.actions.length, 1);
	});

	test('uses enum item labels, marks the default, and checks the current value', () => {
		// Current value differs from the default, so 'high' is checked.
		const submenu = createModelConfigurationActions(schema, { thinkingEffort: 'high' }, () => { })[0] as SubmenuAction;
		const [low, medium, high] = submenu.actions;

		assert.deepStrictEqual(
			submenu.actions.map(a => ({ label: a.label, checked: a.checked })),
			[
				{ label: 'Low', checked: false },
				{ label: 'Medium (default)', checked: false },
				{ label: 'High', checked: true },
			]
		);
		assert.strictEqual(low.tooltip, 'Fast');
		assert.strictEqual(medium.tooltip, 'Balanced');
		assert.strictEqual(high.tooltip, 'Thorough');
	});

	test('falls back to the schema default for the checked value when no current value is set', () => {
		const submenu = createModelConfigurationActions(schema, {}, () => { })[0] as SubmenuAction;
		assert.deepStrictEqual(
			submenu.actions.map(a => a.checked),
			[false, true, false], // 'medium' (default) is checked
		);
	});

	test('routes a selection through setValue with the property key and chosen value', () => {
		const calls: { key: string; value: unknown }[] = [];
		const submenu = createModelConfigurationActions(schema, {}, (key, value) => calls.push({ key, value }))[0] as SubmenuAction;

		submenu.actions[2].run();
		assert.deepStrictEqual(calls, [{ key: 'thinkingEffort', value: 'high' }]);
	});
});

suite('LanguageModels - provider usage telemetry', function () {

	const disposables = new DisposableStore();

	teardown(function () {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	class CapturingTelemetryService implements Partial<ITelemetryService> {
		readonly events: { eventName: string; data: any }[] = [];
		publicLog2<E extends Record<string, any>, T extends Record<string, any>>(eventName: string, data?: E): void {
			this.events.push({ eventName, data });
		}
	}

	async function sendRequestForVendor(vendor: string, extension: ExtensionIdentifier, isBYOK?: boolean): Promise<{ eventName: string; data: any }[]> {
		const telemetry = new CapturingTelemetryService();
		const service = disposables.add(new LanguageModelsService(
			new class extends mock<IExtensionService>() {
				override activateByEvent() { return Promise.resolve(); }
			},
			new NullLogService(),
			disposables.add(new TestStorageService()),
			new MockContextKeyService(),
			new class extends mock<ILanguageModelsConfigurationService>() {
				override onDidChangeLanguageModelGroups = Event.None;
				override getLanguageModelsProviderGroups() { return []; }
			},
			new class extends mock<IQuickInputService>() { },
			new TestSecretStorageService(),
			new class extends mock<IProductService>() { override readonly version = '1.100.0'; },
			new class extends mock<IRequestService>() { },
			new TestNotificationService(),
			NullOpenerService,
			telemetry as unknown as ITelemetryService,
		));

		service.deltaLanguageModelChatProviderDescriptors([
			{ vendor, displayName: vendor, configuration: undefined, managementCommand: undefined, when: undefined }
		], []);

		disposables.add(service.registerLanguageModelProvider(vendor, {
			onDidChange: Event.None,
			provideLanguageModelChatInfo: async () => ([{
				metadata: {
					extension,
					name: 'Model',
					vendor,
					family: 'family',
					version: '1.0',
					id: `${vendor}-model`,
					maxInputTokens: 100,
					maxOutputTokens: 100,
					isBYOK,
					isDefaultForLocation: {}
				} satisfies ILanguageModelChatMetadata,
				identifier: `${vendor}-model`
			}]),
			sendChatRequest: async () => {
				const defer = new DeferredPromise<void>();
				const stream = new AsyncIterableSource<IChatResponsePart>();
				stream.resolve();
				defer.complete();
				return { stream: stream.asyncIterable, result: defer.p };
			},
			provideTokenCount: async () => { throw new Error(); }
		}));

		const models = await service.selectLanguageModels({ vendor });
		assert.strictEqual(models.length, 1);

		const cts = disposables.add(new CancellationTokenSource());
		const request = await service.sendChatRequest(models[0], nullExtensionDescription.identifier, [{ role: ChatMessageRole.User, content: [{ type: 'text', value: 'hi' }] }], {}, cts.token);
		await request.result;

		return telemetry.events.filter(e => e.eventName === 'chat.languageModelRequest');
	}

	test('getByokProviderTelemetryName classifies vendors', function () {
		const copilotExtension = new ExtensionIdentifier('github.copilot-chat');
		const thirdPartyExtension = new ExtensionIdentifier('publisher.third-party');
		assert.deepStrictEqual(
			[
				getByokProviderTelemetryName(undefined, copilotExtension),
				getByokProviderTelemetryName(COPILOT_VENDOR_ID, copilotExtension),
				getByokProviderTelemetryName('openai', copilotExtension),
				getByokProviderTelemetryName('ollama', copilotExtension),
				getByokProviderTelemetryName('openai', thirdPartyExtension),
				getByokProviderTelemetryName('some-third-party-vendor', thirdPartyExtension),
			],
			[undefined, undefined, 'openai', 'ollama', THIRD_PARTY_PROVIDER_TELEMETRY_NAME, THIRD_PARTY_PROVIDER_TELEMETRY_NAME]
		);
	});

	test('sendChatRequest reports an in-built BYOK provider by name', async function () {
		const events = await sendRequestForVendor('openai', new ExtensionIdentifier('github.copilot-chat'), true);
		assert.deepStrictEqual(events.map(e => e.data), [{ provider: 'openai', isBYOK: true }]);
	});

	test('sendChatRequest buckets built-in vendor ids from third-party extensions as 3p-extension', async function () {
		const events = await sendRequestForVendor('openai', new ExtensionIdentifier('publisher.third-party'), true);
		assert.deepStrictEqual(events.map(e => e.data), [{ provider: THIRD_PARTY_PROVIDER_TELEMETRY_NAME, isBYOK: true }]);
	});

	test('sendChatRequest buckets third-party extension providers as 3p-extension', async function () {
		const events = await sendRequestForVendor('some-third-party-vendor', new ExtensionIdentifier('publisher.third-party'));
		assert.deepStrictEqual(events.map(e => e.data), [{ provider: THIRD_PARTY_PROVIDER_TELEMETRY_NAME, isBYOK: false }]);
	});

	test('sendChatRequest does not report first-party Copilot models', async function () {
		const events = await sendRequestForVendor(COPILOT_VENDOR_ID, new ExtensionIdentifier('github.copilot-chat'));
		assert.strictEqual(events.length, 0);
	});
});


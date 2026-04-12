/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { AsyncIterableSource, DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { LanguageModelsService } from '../../common/languageModels.js';
import { nullExtensionDescription } from '../../../../services/extensions/common/extensions.js';
import { DEFAULT_MODEL_PICKER_CATEGORY } from '../../common/widget/input/modelPickerWidget.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { Event } from '../../../../../base/common/event.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { TestSecretStorageService } from '../../../../../platform/secrets/test/common/testSecretStorageService.js';
suite('LanguageModels', function () {
    let languageModels;
    const store = new DisposableStore();
    const activationEvents = new Set();
    setup(function () {
        languageModels = new LanguageModelsService(new class extends mock() {
            activateByEvent(name) {
                activationEvents.add(name);
                return Promise.resolve();
            }
        }, new NullLogService(), new TestStorageService(), new MockContextKeyService(), new class extends mock() {
            constructor() {
                super(...arguments);
                this.onDidChangeLanguageModelGroups = Event.None;
            }
            getLanguageModelsProviderGroups() {
                return [];
            }
        }, new class extends mock() {
        }, new TestSecretStorageService(), new class extends mock() {
            constructor() {
                super(...arguments);
                this.version = '1.100.0';
            }
        }, new class extends mock() {
        });
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
                        isDefaultForLocation: {}
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
                        isDefaultForLocation: {}
                    }
                ];
                const modelMetadataAndIdentifier = modelMetadata.map(m => ({
                    metadata: m,
                    identifier: m.id,
                }));
                return modelMetadataAndIdentifier;
            },
            sendChatRequest: async (modelId, messages, _from, _options, token) => {
                // const message = messages.at(-1);
                const defer = new DeferredPromise();
                const stream = new AsyncIterableSource();
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
        const request = await languageModels.sendChatRequest(first, nullExtensionDescription.identifier, [{ role: 1 /* ChatMessageRole.User */, content: [{ type: 'text', value: 'hello' }] }], {}, cts.token);
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
        contextMatchesRules(rules) {
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
    let languageModelsWithWhen;
    let contextKeyService;
    setup(function () {
        contextKeyService = new TestContextKeyService();
        contextKeyService.createKey('testKey', true);
        languageModelsWithWhen = new LanguageModelsService(new class extends mock() {
            activateByEvent(name) {
                return Promise.resolve();
            }
        }, new NullLogService(), new TestStorageService(), contextKeyService, new class extends mock() {
            constructor() {
                super(...arguments);
                this.onDidChangeLanguageModelGroups = Event.None;
            }
        }, new class extends mock() {
        }, new TestSecretStorageService(), new class extends mock() {
            constructor() {
                super(...arguments);
                this.version = '1.100.0';
            }
        }, new class extends mock() {
        });
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
suite('LanguageModels - Model Picker Preferences Storage', function () {
    let languageModelsService;
    let storageService;
    const disposables = new DisposableStore();
    setup(async function () {
        storageService = new TestStorageService();
        languageModelsService = new LanguageModelsService(new class extends mock() {
            activateByEvent(name) {
                return Promise.resolve();
            }
        }, new NullLogService(), storageService, new MockContextKeyService(), new class extends mock() {
            constructor() {
                super(...arguments);
                this.onDidChangeLanguageModelGroups = Event.None;
            }
            getLanguageModelsProviderGroups() {
                return [];
            }
        }, new class extends mock() {
        }, new TestSecretStorageService(), new class extends mock() {
            constructor() {
                super(...arguments);
                this.version = '1.100.0';
            }
        }, new class extends mock() {
        });
        // Register vendor1 used in most tests
        languageModelsService.deltaLanguageModelChatProviderDescriptors([
            { vendor: 'vendor1', displayName: 'Vendor 1', configuration: undefined, managementCommand: undefined, when: undefined }
        ], []);
        disposables.add(languageModelsService.registerLanguageModelProvider('vendor1', {
            onDidChange: Event.None,
            provideLanguageModelChatInfo: async () => {
                return [{
                        metadata: {
                            extension: nullExtensionDescription.identifier,
                            name: 'Model 1',
                            vendor: 'vendor1',
                            family: 'family1',
                            version: '1.0',
                            id: 'vendor1/model1',
                            maxInputTokens: 100,
                            maxOutputTokens: 100,
                            modelPickerCategory: DEFAULT_MODEL_PICKER_CATEGORY,
                            isDefaultForLocation: {}
                        },
                        identifier: 'vendor1/model1'
                    }];
            },
            sendChatRequest: async () => { throw new Error(); },
            provideTokenCount: async () => { throw new Error(); }
        }));
        // Populate the model cache
        await languageModelsService.selectLanguageModels({});
    });
    teardown(function () {
        languageModelsService.dispose();
        disposables.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test('fires onChange event when new model preferences are added', async function () {
        // Listen for change event
        let firedVendorId;
        disposables.add(languageModelsService.onDidChangeLanguageModels(vendorId => firedVendorId = vendorId));
        // Add new preferences to storage - store() automatically triggers change event synchronously
        const preferences = {
            'vendor1/model1': true
        };
        storageService.store('chatModelPickerPreferences', JSON.stringify(preferences), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        // Verify change event was fired
        assert.strictEqual(firedVendorId, 'vendor1', 'Should fire change event for vendor1');
        // Verify preference was updated
        const model = languageModelsService.lookupLanguageModel('vendor1/model1');
        assert.ok(model);
        assert.strictEqual(model.isUserSelectable, true);
    });
    test('fires onChange event when model preferences are removed', async function () {
        // Set initial preference using the API
        languageModelsService.updateModelPickerPreference('vendor1/model1', true);
        // Listen for change event
        let firedVendorId;
        disposables.add(languageModelsService.onDidChangeLanguageModels(vendorId => {
            firedVendorId = vendorId;
        }));
        // Remove preferences via storage API
        const updatedPreferences = {};
        storageService.store('chatModelPickerPreferences', JSON.stringify(updatedPreferences), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        // Verify change event was fired
        assert.strictEqual(firedVendorId, 'vendor1', 'Should fire change event for vendor1 when preference removed');
        // Verify preference was removed
        const model = languageModelsService.lookupLanguageModel('vendor1/model1');
        assert.ok(model);
        assert.strictEqual(model.isUserSelectable, undefined);
    });
    test('fires onChange event when model preferences are updated', async function () {
        // Set initial preference using the API
        languageModelsService.updateModelPickerPreference('vendor1/model1', true);
        // Listen for change event
        let firedVendorId;
        disposables.add(languageModelsService.onDidChangeLanguageModels(vendorId => {
            firedVendorId = vendorId;
        }));
        // Update the preference value
        const updatedPreferences = {
            'vendor1/model1': false
        };
        storageService.store('chatModelPickerPreferences', JSON.stringify(updatedPreferences), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        // Verify change event was fired
        assert.strictEqual(firedVendorId, 'vendor1', 'Should fire change event for vendor1 when preference updated');
        // Verify preference was updated
        const model = languageModelsService.lookupLanguageModel('vendor1/model1');
        assert.ok(model);
        assert.strictEqual(model.isUserSelectable, false);
    });
    test('only fires onChange event for affected vendors', async function () {
        // Register vendor2
        languageModelsService.deltaLanguageModelChatProviderDescriptors([
            { vendor: 'vendor2', displayName: 'Vendor 2', configuration: undefined, managementCommand: undefined, when: undefined }
        ], []);
        disposables.add(languageModelsService.registerLanguageModelProvider('vendor2', {
            onDidChange: Event.None,
            provideLanguageModelChatInfo: async () => {
                return [{
                        metadata: {
                            extension: nullExtensionDescription.identifier,
                            name: 'Model 2',
                            vendor: 'vendor2',
                            family: 'family2',
                            version: '1.0',
                            id: 'vendor2/model2',
                            maxInputTokens: 100,
                            maxOutputTokens: 100,
                            modelPickerCategory: DEFAULT_MODEL_PICKER_CATEGORY,
                            isDefaultForLocation: {}
                        },
                        identifier: 'vendor2/model2'
                    }];
            },
            sendChatRequest: async () => { throw new Error(); },
            provideTokenCount: async () => { throw new Error(); }
        }));
        await languageModelsService.selectLanguageModels({});
        // Set initial preferences using the API
        languageModelsService.updateModelPickerPreference('vendor1/model1', true);
        languageModelsService.updateModelPickerPreference('vendor2/model2', false);
        // Listen for change event
        let firedVendorId;
        disposables.add(languageModelsService.onDidChangeLanguageModels(vendorId => {
            firedVendorId = vendorId;
        }));
        // Update only vendor1 preference
        const updatedPreferences = {
            'vendor1/model1': false,
            'vendor2/model2': false // unchanged
        };
        storageService.store('chatModelPickerPreferences', JSON.stringify(updatedPreferences), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        // Verify only vendor1 was affected
        assert.strictEqual(firedVendorId, 'vendor1', 'Should only affect vendor1');
        // Verify preferences were updated correctly
        const model1 = languageModelsService.lookupLanguageModel('vendor1/model1');
        assert.ok(model1);
        assert.strictEqual(model1.isUserSelectable, false, 'vendor1/model1 should be updated to false');
        const model2 = languageModelsService.lookupLanguageModel('vendor2/model2');
        assert.ok(model2);
        assert.strictEqual(model2.isUserSelectable, false, 'vendor2/model2 should remain false');
    });
    test('does not fire onChange event when preferences are unchanged', async function () {
        // Set initial preference using the API
        languageModelsService.updateModelPickerPreference('vendor1/model1', true);
        // Listen for change event
        let eventFired = false;
        disposables.add(languageModelsService.onDidChangeLanguageModels(() => {
            eventFired = true;
        }));
        // Store the same preferences again
        const initialPreferences = {
            'vendor1/model1': true
        };
        storageService.store('chatModelPickerPreferences', JSON.stringify(initialPreferences), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        // Verify no event was fired
        assert.strictEqual(eventFired, false, 'Should not fire event when preferences are unchanged');
        // Verify preference remains the same
        const model = languageModelsService.lookupLanguageModel('vendor1/model1');
        assert.ok(model);
        assert.strictEqual(model.isUserSelectable, true);
    });
    test('handles malformed JSON in storage gracefully', function () {
        // Listen for change event
        let eventFired = false;
        disposables.add(languageModelsService.onDidChangeLanguageModels(() => {
            eventFired = true;
        }));
        // Store empty preferences - store() automatically triggers change event
        storageService.store('chatModelPickerPreferences', '{}', 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        // Verify no event was fired - empty preferences is valid and causes no changes
        assert.strictEqual(eventFired, false, 'Should not fire event for empty preferences');
    });
});
suite('LanguageModels - Model Change Events', function () {
    let languageModelsService;
    let storageService;
    const disposables = new DisposableStore();
    setup(async function () {
        storageService = new TestStorageService();
        languageModelsService = new LanguageModelsService(new class extends mock() {
            activateByEvent(name) {
                return Promise.resolve();
            }
        }, new NullLogService(), storageService, new MockContextKeyService(), new class extends mock() {
            constructor() {
                super(...arguments);
                this.onDidChangeLanguageModelGroups = Event.None;
            }
            getLanguageModelsProviderGroups() {
                return [];
            }
        }, new class extends mock() {
        }, new TestSecretStorageService(), new class extends mock() {
            constructor() {
                super(...arguments);
                this.version = '1.100.0';
            }
        }, new class extends mock() {
        });
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
        const eventPromise = new Promise((resolve) => {
            disposables.add(languageModelsService.onDidChangeLanguageModels((vendorId) => {
                resolve(vendorId);
            }));
        });
        // Store a preference to trigger auto-resolution when provider is registered
        storageService.store('chatModelPickerPreferences', JSON.stringify({ 'test-vendor/model1': true }), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        disposables.add(languageModelsService.registerLanguageModelProvider('test-vendor', {
            onDidChange: Event.None,
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
                        },
                        identifier: 'test-vendor/model1'
                    }];
            },
            sendChatRequest: async () => { throw new Error(); },
            provideTokenCount: async () => { throw new Error(); }
        }));
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
                },
                identifier: 'test-vendor/model1'
            }];
        let onDidChangeEmitter;
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
                },
                identifier: 'test-vendor/model1'
            }];
        let currentModels = initialModels;
        let onDidChangeEmitter;
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
        const eventPromise = new Promise((resolve) => {
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
                },
                identifier: 'test-vendor/model1'
            }];
        let onDidChangeEmitter;
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
        const eventPromise = new Promise((resolve) => {
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
                },
                identifier: 'test-vendor/model1'
            }];
        let onDidChangeEmitter;
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
        const eventPromise = new Promise((resolve) => {
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
                },
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
                            },
                            identifier: 'test-vendor/model1'
                        }];
                }
                else {
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
                            },
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
    let languageModelsService;
    const disposables = new DisposableStore();
    setup(function () {
        languageModelsService = new LanguageModelsService(new class extends mock() {
            activateByEvent(name) {
                return Promise.resolve();
            }
        }, new NullLogService(), new TestStorageService(), new MockContextKeyService(), new class extends mock() {
            constructor() {
                super(...arguments);
                this.onDidChangeLanguageModelGroups = Event.None;
            }
            getLanguageModelsProviderGroups() {
                return [];
            }
        }, new class extends mock() {
        }, new TestSecretStorageService(), new class extends mock() {
            constructor() {
                super(...arguments);
                this.version = '1.100.0';
            }
        }, new class extends mock() {
        });
    });
    teardown(function () {
        languageModelsService.dispose();
        disposables.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test('fires onDidChangeLanguageModelVendors when a vendor is added', async function () {
        const eventPromise = new Promise((resolve) => {
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
        const eventPromise = new Promise((resolve) => {
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
        const addEventPromise = new Promise((resolve) => {
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
        const removeEventPromise = new Promise((resolve) => {
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
    let languageModelsService;
    const disposables = new DisposableStore();
    let receivedOptions;
    setup(async function () {
        receivedOptions = undefined;
        languageModelsService = new LanguageModelsService(new class extends mock() {
            activateByEvent() {
                return Promise.resolve();
            }
        }, new NullLogService(), new TestStorageService(), new MockContextKeyService(), new class extends mock() {
            constructor() {
                super(...arguments);
                this.onDidChangeLanguageModelGroups = Event.None;
            }
            getLanguageModelsProviderGroups() {
                return [{
                        vendor: 'config-vendor',
                        name: 'default',
                        settings: {
                            'model-a': { temperature: 0.7, reasoningEffort: 'high' },
                            'model-b': { temperature: 0.2 }
                        }
                    }];
            }
        }, new class extends mock() {
        }, new TestSecretStorageService(), new class extends mock() {
            constructor() {
                super(...arguments);
                this.version = '1.100.0';
            }
        }, new class extends mock() {
        });
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
                            },
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
                            },
                            identifier: 'config-vendor/default/model-b'
                        }];
                }
                return [];
            },
            sendChatRequest: async (_modelId, _messages, _from, options) => {
                receivedOptions = options;
                const defer = new DeferredPromise();
                const stream = new AsyncIterableSource();
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
        const request = await languageModelsService.sendChatRequest('config-vendor/default/model-a', nullExtensionDescription.identifier, [{ role: 1 /* ChatMessageRole.User */, content: [{ type: 'text', value: 'hello' }] }], {}, cts.token);
        await request.result;
        // User config overrides defaults: temperature=0.7 (not 0.5), reasoningEffort='high' (not 'medium')
        // Schema default maxTokens=4096 is included since user didn't override it
        assert.deepStrictEqual(receivedOptions, { configuration: { temperature: 0.7, reasoningEffort: 'high', maxTokens: 4096 } });
    });
    test('sendChatRequest passes user config when model has no schema', async function () {
        const cts = disposables.add(new CancellationTokenSource());
        const request = await languageModelsService.sendChatRequest('config-vendor/default/model-b', nullExtensionDescription.identifier, [{ role: 1 /* ChatMessageRole.User */, content: [{ type: 'text', value: 'hello' }] }], {}, cts.token);
        await request.result;
        assert.deepStrictEqual(receivedOptions, { configuration: { temperature: 0.2 } });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGFuZ3VhZ2VNb2RlbHMudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vbGFuZ3VhZ2VNb2RlbHMudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLG1CQUFtQixFQUFFLGVBQWUsRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNwRyxPQUFPLEVBQXFCLHVCQUF1QixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDeEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDM0UsT0FBTyxFQUFtQixxQkFBcUIsRUFBK0QsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNySixPQUFPLEVBQXFCLHdCQUF3QixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDbkgsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFFL0YsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFFdEYsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHlFQUF5RSxDQUFDO0FBSWhILE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHlFQUF5RSxDQUFDO0FBSW5ILEtBQUssQ0FBQyxnQkFBZ0IsRUFBRTtJQUV2QixJQUFJLGNBQXFDLENBQUM7SUFFMUMs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
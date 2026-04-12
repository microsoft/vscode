/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import assert from 'assert';
import { Registry } from '../../../platform/registry/common/platform.js';
import { Extensions } from '../../../platform/quickinput/common/quickAccess.js';
import { IQuickInputService } from '../../../platform/quickinput/common/quickInput.js';
import { TestServiceAccessor, workbenchInstantiationService, createEditorPart } from './workbenchTestServices.js';
import { DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { timeout } from '../../../base/common/async.js';
import { PickerQuickAccessProvider } from '../../../platform/quickinput/browser/pickerQuickAccess.js';
import { URI } from '../../../base/common/uri.js';
import { IEditorGroupsService } from '../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../services/editor/common/editorService.js';
import { EditorService } from '../../services/editor/browser/editorService.js';
import { PickerEditorState } from '../../browser/quickaccess.js';
import { Range } from '../../../editor/common/core/range.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { IContextKeyService, ContextKeyExpr } from '../../../platform/contextkey/common/contextkey.js';
import { ContextKeyService } from '../../../platform/contextkey/browser/contextKeyService.js';
import { TestConfigurationService } from '../../../platform/configuration/test/common/testConfigurationService.js';
suite('QuickAccess', () => {
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    let instantiationService;
    let accessor;
    let providerDefaultCalled = false;
    let providerDefaultCanceled = false;
    let providerDefaultDisposed = false;
    let provider1Called = false;
    let provider1Canceled = false;
    let provider1Disposed = false;
    let provider2Called = false;
    let provider2Canceled = false;
    let provider2Disposed = false;
    let provider3Called = false;
    let provider3Canceled = false;
    let provider3Disposed = false;
    let TestProviderDefault = class TestProviderDefault {
        constructor(quickInputService, disposables) {
            this.quickInputService = quickInputService;
        }
        provide(picker, token) {
            assert.ok(picker);
            providerDefaultCalled = true;
            const store = new DisposableStore();
            store.add(toDisposable(() => providerDefaultDisposed = true));
            store.add(token.onCancellationRequested(() => providerDefaultCanceled = true));
            // bring up provider #3
            setTimeout(() => this.quickInputService.quickAccess.show(providerDescriptor3.prefix));
            return store;
        }
    };
    TestProviderDefault = __decorate([
        __param(0, IQuickInputService)
    ], TestProviderDefault);
    class TestProvider1 {
        provide(picker, token) {
            assert.ok(picker);
            provider1Called = true;
            const store = new DisposableStore();
            store.add(token.onCancellationRequested(() => provider1Canceled = true));
            store.add(toDisposable(() => provider1Disposed = true));
            return store;
        }
    }
    class TestProvider2 {
        provide(picker, token) {
            assert.ok(picker);
            provider2Called = true;
            const store = new DisposableStore();
            store.add(token.onCancellationRequested(() => provider2Canceled = true));
            store.add(toDisposable(() => provider2Disposed = true));
            return store;
        }
    }
    class TestProvider3 {
        provide(picker, token) {
            assert.ok(picker);
            provider3Called = true;
            const store = new DisposableStore();
            store.add(token.onCancellationRequested(() => provider3Canceled = true));
            // hide without picking
            setTimeout(() => picker.hide());
            store.add(toDisposable(() => provider3Disposed = true));
            return store;
        }
    }
    const providerDescriptorDefault = { ctor: TestProviderDefault, prefix: '', helpEntries: [] };
    const providerDescriptor1 = { ctor: TestProvider1, prefix: 'test', helpEntries: [] };
    const providerDescriptor2 = { ctor: TestProvider2, prefix: 'test something', helpEntries: [] };
    const providerDescriptor3 = { ctor: TestProvider3, prefix: 'changed', helpEntries: [] };
    setup(() => {
        instantiationService = workbenchInstantiationService(undefined, disposables);
        accessor = instantiationService.createInstance(TestServiceAccessor);
    });
    test('registry', () => {
        const registry = (Registry.as(Extensions.Quickaccess));
        const restore = registry.clear();
        const contextKeyService = instantiationService.get(IContextKeyService);
        assert.ok(!registry.getQuickAccessProvider('test', contextKeyService));
        const disposables = new DisposableStore();
        disposables.add(registry.registerQuickAccessProvider(providerDescriptorDefault));
        assert(registry.getQuickAccessProvider('', contextKeyService) === providerDescriptorDefault);
        assert(registry.getQuickAccessProvider('test', contextKeyService) === providerDescriptorDefault);
        const disposable = disposables.add(registry.registerQuickAccessProvider(providerDescriptor1));
        assert(registry.getQuickAccessProvider('test', contextKeyService) === providerDescriptor1);
        const providers = registry.getQuickAccessProviders(contextKeyService);
        assert(providers.some(provider => provider.prefix === 'test'));
        disposable.dispose();
        assert(registry.getQuickAccessProvider('test', contextKeyService) === providerDescriptorDefault);
        disposables.dispose();
        assert.ok(!registry.getQuickAccessProvider('test', contextKeyService));
        restore();
    });
    test('registry - when condition', () => {
        const registry = (Registry.as(Extensions.Quickaccess));
        const restore = registry.clear();
        // Use real ContextKeyService that properly evaluates rules
        const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
        const localDisposables = new DisposableStore();
        // Create a context key that starts as undefined (falsy)
        const contextKey = contextKeyService.createKey('testQuickAccessContextKey', undefined);
        // Register a provider with a when condition that requires testQuickAccessContextKey to be truthy
        const providerWithWhen = {
            ctor: TestProvider1,
            prefix: 'whentest',
            helpEntries: [],
            when: ContextKeyExpr.has('testQuickAccessContextKey')
        };
        localDisposables.add(registry.registerQuickAccessProvider(providerWithWhen));
        // Verify the expression works with the context key service
        assert.strictEqual(contextKeyService.contextMatchesRules(providerWithWhen.when), false);
        // Provider with false when condition should not be found
        assert.strictEqual(registry.getQuickAccessProvider('whentest', contextKeyService), undefined);
        // Should not appear in the list of providers
        let providers = registry.getQuickAccessProviders(contextKeyService);
        assert.ok(!providers.some(p => p.prefix === 'whentest'));
        // Set the context key to true
        contextKey.set(true);
        // Verify the expression now matches
        assert.strictEqual(contextKeyService.contextMatchesRules(providerWithWhen.when), true);
        // Now the provider should be found
        assert.strictEqual(registry.getQuickAccessProvider('whentest', contextKeyService), providerWithWhen);
        // Should appear in the list of providers
        providers = registry.getQuickAccessProviders(contextKeyService);
        assert.ok(providers.some(p => p.prefix === 'whentest'));
        // Set context key back to undefined (falsy)
        contextKey.set(undefined);
        // Provider should not be found again
        assert.strictEqual(registry.getQuickAccessProvider('whentest', contextKeyService), undefined);
        localDisposables.dispose();
        restore();
    });
    test('provider', async () => {
        const registry = (Registry.as(Extensions.Quickaccess));
        const restore = registry.clear();
        const disposables = new DisposableStore();
        disposables.add(registry.registerQuickAccessProvider(providerDescriptorDefault));
        disposables.add(registry.registerQuickAccessProvider(providerDescriptor1));
        disposables.add(registry.registerQuickAccessProvider(providerDescriptor2));
        disposables.add(registry.registerQuickAccessProvider(providerDescriptor3));
        accessor.quickInputService.quickAccess.show('test');
        assert.strictEqual(providerDefaultCalled, false);
        assert.strictEqual(provider1Called, true);
        assert.strictEqual(provider2Called, false);
        assert.strictEqual(provider3Called, false);
        assert.strictEqual(providerDefaultCanceled, false);
        assert.strictEqual(provider1Canceled, false);
        assert.strictEqual(provider2Canceled, false);
        assert.strictEqual(provider3Canceled, false);
        assert.strictEqual(providerDefaultDisposed, false);
        assert.strictEqual(provider1Disposed, false);
        assert.strictEqual(provider2Disposed, false);
        assert.strictEqual(provider3Disposed, false);
        provider1Called = false;
        accessor.quickInputService.quickAccess.show('test something');
        assert.strictEqual(providerDefaultCalled, false);
        assert.strictEqual(provider1Called, false);
        assert.strictEqual(provider2Called, true);
        assert.strictEqual(provider3Called, false);
        assert.strictEqual(providerDefaultCanceled, false);
        assert.strictEqual(provider1Canceled, true);
        assert.strictEqual(provider2Canceled, false);
        assert.strictEqual(provider3Canceled, false);
        assert.strictEqual(providerDefaultDisposed, false);
        assert.strictEqual(provider1Disposed, true);
        assert.strictEqual(provider2Disposed, false);
        assert.strictEqual(provider3Disposed, false);
        provider2Called = false;
        provider1Canceled = false;
        provider1Disposed = false;
        accessor.quickInputService.quickAccess.show('usedefault');
        assert.strictEqual(providerDefaultCalled, true);
        assert.strictEqual(provider1Called, false);
        assert.strictEqual(provider2Called, false);
        assert.strictEqual(provider3Called, false);
        assert.strictEqual(providerDefaultCanceled, false);
        assert.strictEqual(provider1Canceled, false);
        assert.strictEqual(provider2Canceled, true);
        assert.strictEqual(provider3Canceled, false);
        assert.strictEqual(providerDefaultDisposed, false);
        assert.strictEqual(provider1Disposed, false);
        assert.strictEqual(provider2Disposed, true);
        assert.strictEqual(provider3Disposed, false);
        await timeout(1);
        assert.strictEqual(providerDefaultCanceled, true);
        assert.strictEqual(providerDefaultDisposed, true);
        assert.strictEqual(provider3Called, true);
        await timeout(1);
        assert.strictEqual(provider3Canceled, true);
        assert.strictEqual(provider3Disposed, true);
        disposables.dispose();
        restore();
    });
    let fastProviderCalled = false;
    let slowProviderCalled = false;
    let fastAndSlowProviderCalled = false;
    let slowProviderCanceled = false;
    let fastAndSlowProviderCanceled = false;
    class FastTestQuickPickProvider extends PickerQuickAccessProvider {
        constructor() {
            super('fast');
        }
        _getPicks(filter, disposables, token) {
            fastProviderCalled = true;
            return [{ label: 'Fast Pick' }];
        }
    }
    class SlowTestQuickPickProvider extends PickerQuickAccessProvider {
        constructor() {
            super('slow');
        }
        async _getPicks(filter, disposables, token) {
            slowProviderCalled = true;
            await timeout(1);
            if (token.isCancellationRequested) {
                slowProviderCanceled = true;
            }
            return [{ label: 'Slow Pick' }];
        }
    }
    class FastAndSlowTestQuickPickProvider extends PickerQuickAccessProvider {
        constructor() {
            super('bothFastAndSlow');
        }
        _getPicks(filter, disposables, token) {
            fastAndSlowProviderCalled = true;
            return {
                picks: [{ label: 'Fast Pick' }],
                additionalPicks: (async () => {
                    await timeout(1);
                    if (token.isCancellationRequested) {
                        fastAndSlowProviderCanceled = true;
                    }
                    return [{ label: 'Slow Pick' }];
                })()
            };
        }
    }
    const fastProviderDescriptor = { ctor: FastTestQuickPickProvider, prefix: 'fast', helpEntries: [] };
    const slowProviderDescriptor = { ctor: SlowTestQuickPickProvider, prefix: 'slow', helpEntries: [] };
    const fastAndSlowProviderDescriptor = { ctor: FastAndSlowTestQuickPickProvider, prefix: 'bothFastAndSlow', helpEntries: [] };
    test('quick pick access - show()', async () => {
        const registry = (Registry.as(Extensions.Quickaccess));
        const restore = registry.clear();
        const disposables = new DisposableStore();
        disposables.add(registry.registerQuickAccessProvider(fastProviderDescriptor));
        disposables.add(registry.registerQuickAccessProvider(slowProviderDescriptor));
        disposables.add(registry.registerQuickAccessProvider(fastAndSlowProviderDescriptor));
        accessor.quickInputService.quickAccess.show('fast');
        assert.strictEqual(fastProviderCalled, true);
        assert.strictEqual(slowProviderCalled, false);
        assert.strictEqual(fastAndSlowProviderCalled, false);
        fastProviderCalled = false;
        accessor.quickInputService.quickAccess.show('slow');
        await timeout(2);
        assert.strictEqual(fastProviderCalled, false);
        assert.strictEqual(slowProviderCalled, true);
        assert.strictEqual(slowProviderCanceled, false);
        assert.strictEqual(fastAndSlowProviderCalled, false);
        slowProviderCalled = false;
        accessor.quickInputService.quickAccess.show('bothFastAndSlow');
        await timeout(2);
        assert.strictEqual(fastProviderCalled, false);
        assert.strictEqual(slowProviderCalled, false);
        assert.strictEqual(fastAndSlowProviderCalled, true);
        assert.strictEqual(fastAndSlowProviderCanceled, false);
        fastAndSlowProviderCalled = false;
        accessor.quickInputService.quickAccess.show('slow');
        accessor.quickInputService.quickAccess.show('bothFastAndSlow');
        accessor.quickInputService.quickAccess.show('fast');
        assert.strictEqual(fastProviderCalled, true);
        assert.strictEqual(slowProviderCalled, true);
        assert.strictEqual(fastAndSlowProviderCalled, true);
        await timeout(2);
        assert.strictEqual(slowProviderCanceled, true);
        assert.strictEqual(fastAndSlowProviderCanceled, true);
        disposables.dispose();
        restore();
    });
    test('quick pick access - pick()', async () => {
        const registry = (Registry.as(Extensions.Quickaccess));
        const restore = registry.clear();
        const disposables = new DisposableStore();
        disposables.add(registry.registerQuickAccessProvider(fastProviderDescriptor));
        const result = accessor.quickInputService.quickAccess.pick('fast');
        assert.strictEqual(fastProviderCalled, true);
        assert.ok(result instanceof Promise);
        disposables.dispose();
        restore();
    });
    test('PickerEditorState can properly restore editors', async () => {
        const part = await createEditorPart(instantiationService, disposables.add(new DisposableStore()));
        instantiationService.stub(IEditorGroupsService, part);
        const editorService = disposables.add(instantiationService.createInstance(EditorService, undefined));
        instantiationService.stub(IEditorService, editorService);
        const editorViewState = disposables.add(instantiationService.createInstance(PickerEditorState));
        disposables.add(part);
        disposables.add(editorService);
        const input1 = {
            resource: URI.parse('foo://bar1'),
            options: {
                pinned: true, preserveFocus: true, selection: new Range(1, 0, 1, 3)
            }
        };
        const input2 = {
            resource: URI.parse('foo://bar2'),
            options: {
                pinned: true, selection: new Range(1, 0, 1, 3)
            }
        };
        const input3 = {
            resource: URI.parse('foo://bar3')
        };
        const input4 = {
            resource: URI.parse('foo://bar4')
        };
        const editor = await editorService.openEditor(input1);
        assert.strictEqual(editor, editorService.activeEditorPane);
        editorViewState.set();
        await editorService.openEditor(input2);
        await editorViewState.openTransientEditor(input3);
        await editorViewState.openTransientEditor(input4);
        await editorViewState.restore();
        assert.strictEqual(part.activeGroup.activeEditor?.resource, input1.resource);
        assert.deepStrictEqual(part.activeGroup.getEditors(0 /* EditorsOrder.MOST_RECENTLY_ACTIVE */).map(e => e.resource), [input1.resource, input2.resource]);
        if (part.activeGroup.activeEditorPane?.getSelection) {
            assert.deepStrictEqual(part.activeGroup.activeEditorPane?.getSelection(), input1.options.selection);
        }
        await part.activeGroup.closeAllEditors();
    });
    let attachTestAcceptCalled = false;
    let attachTestAttachCalled = false;
    let attachTestAttachKeyMods;
    class AttachTestQuickPickProvider extends PickerQuickAccessProvider {
        constructor() {
            super('attach');
        }
        _getPicks() {
            return [{
                    label: 'Test Item',
                    accept: () => {
                        attachTestAcceptCalled = true;
                    },
                    attach: (keyMods) => {
                        attachTestAttachCalled = true;
                        attachTestAttachKeyMods = keyMods;
                    }
                }];
        }
    }
    class AttachTestNoAttachProvider extends PickerQuickAccessProvider {
        constructor() {
            super('noattach');
        }
        _getPicks() {
            return [{
                    label: 'No Attach Item',
                    accept: () => {
                        attachTestAcceptCalled = true;
                    }
                }];
        }
    }
    const attachProviderDescriptor = { ctor: AttachTestQuickPickProvider, prefix: 'attach', helpEntries: [] };
    const noAttachProviderDescriptor = { ctor: AttachTestNoAttachProvider, prefix: 'noattach', helpEntries: [] };
    function resetAttachState() {
        attachTestAcceptCalled = false;
        attachTestAttachCalled = false;
        attachTestAttachKeyMods = undefined;
    }
    test('quick pick access - accept without modifier keys calls accept, not attach', async () => {
        const registry = (Registry.as(Extensions.Quickaccess));
        const restore = registry.clear();
        const disposables = new DisposableStore();
        disposables.add(registry.registerQuickAccessProvider(attachProviderDescriptor));
        resetAttachState();
        accessor.quickInputService.quickAccess.show('attach');
        await accessor.quickInputService.accept();
        assert.strictEqual(attachTestAcceptCalled, true);
        assert.strictEqual(attachTestAttachCalled, false);
        disposables.dispose();
        restore();
    });
    test('quick pick access - accept with ctrlCmd calls attach instead of accept', async () => {
        const registry = (Registry.as(Extensions.Quickaccess));
        const restore = registry.clear();
        const disposables = new DisposableStore();
        disposables.add(registry.registerQuickAccessProvider(attachProviderDescriptor));
        resetAttachState();
        accessor.quickInputService.quickAccess.show('attach');
        await accessor.quickInputService.accept({ ctrlCmd: true, alt: false, shift: false });
        assert.strictEqual(attachTestAcceptCalled, false);
        assert.strictEqual(attachTestAttachCalled, true);
        assert.deepStrictEqual(attachTestAttachKeyMods, { ctrlCmd: true, alt: false, shift: false });
        disposables.dispose();
        restore();
    });
    test('quick pick access - accept with alt calls attach instead of accept', async () => {
        const registry = (Registry.as(Extensions.Quickaccess));
        const restore = registry.clear();
        const disposables = new DisposableStore();
        disposables.add(registry.registerQuickAccessProvider(attachProviderDescriptor));
        resetAttachState();
        accessor.quickInputService.quickAccess.show('attach');
        await accessor.quickInputService.accept({ ctrlCmd: false, alt: true, shift: false });
        assert.strictEqual(attachTestAcceptCalled, false);
        assert.strictEqual(attachTestAttachCalled, true);
        assert.deepStrictEqual(attachTestAttachKeyMods, { ctrlCmd: false, alt: true, shift: false });
        disposables.dispose();
        restore();
    });
    test('quick pick access - accept with modifier keys but no attach method calls accept', async () => {
        const registry = (Registry.as(Extensions.Quickaccess));
        const restore = registry.clear();
        const disposables = new DisposableStore();
        disposables.add(registry.registerQuickAccessProvider(noAttachProviderDescriptor));
        resetAttachState();
        accessor.quickInputService.quickAccess.show('noattach');
        await accessor.quickInputService.accept({ ctrlCmd: true, alt: false, shift: false });
        assert.strictEqual(attachTestAcceptCalled, true);
        assert.strictEqual(attachTestAttachCalled, false);
        disposables.dispose();
        restore();
    });
    //#endregion
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicXVpY2tBY2Nlc3MudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC90ZXN0L2Jyb3dzZXIvcXVpY2tBY2Nlc3MudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ3pFLE9BQU8sRUFBd0IsVUFBVSxFQUE2QyxNQUFNLG9EQUFvRCxDQUFDO0FBQ2pKLE9BQU8sRUFBOEIsa0JBQWtCLEVBQXNDLE1BQU0sbURBQW1ELENBQUM7QUFFdkosT0FBTyxFQUFFLG1CQUFtQixFQUFFLDZCQUE2QixFQUFFLGdCQUFnQixFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDbEgsT0FBTyxFQUFFLGVBQWUsRUFBRSxZQUFZLEVBQWUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMvRixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDeEQsT0FBTyxFQUFFLHlCQUF5QixFQUE0QyxNQUFNLDJEQUEyRCxDQUFDO0FBQ2hKLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUNsRCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUMzRixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDL0UsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQy9FLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBRWpFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUU3RCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM3RixPQUFPLEVB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
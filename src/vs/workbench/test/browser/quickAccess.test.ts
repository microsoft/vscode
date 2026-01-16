/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Registry } from '../../../platform/registry/common/platform.js';
import { IQuickAccessRegistry, Extensions, IQuickAccessProvider, QuickAccessRegistry } from '../../../platform/quickinput/common/quickAccess.js';
import { IQuickPick, IQuickPickItem, IQuickInputService } from '../../../platform/quickinput/common/quickInput.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { TestServiceAccessor, workbenchInstantiationService, createEditorPart } from './workbenchTestServices.js';
import { DisposableStore, toDisposable, IDisposable } from '../../../base/common/lifecycle.js';
import { timeout } from '../../../base/common/async.js';
import { PickerQuickAccessProvider, FastAndSlowPicks } from '../../../platform/quickinput/browser/pickerQuickAccess.js';
import { URI } from '../../../base/common/uri.js';
import { IEditorGroupsService } from '../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../services/editor/common/editorService.js';
import { EditorService } from '../../services/editor/browser/editorService.js';
import { PickerEditorState } from '../../browser/quickaccess.js';
import { EditorsOrder } from '../../common/editor.js';
import { Range } from '../../../editor/common/core/range.js';
import { TestInstantiationService } from '../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { IContextKeyService, ContextKeyExpr } from '../../../platform/contextkey/common/contextkey.js';
import { ContextKeyService } from '../../../platform/contextkey/browser/contextKeyService.js';
import { TestConfigurationService } from '../../../platform/configuration/test/common/testConfigurationService.js';

suite('QuickAccess', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let instantiationService: TestInstantiationService;
	let accessor: TestServiceAccessor;

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

	class TestProviderDefault implements IQuickAccessProvider {

		constructor(@IQuickInputService private readonly quickInputService: IQuickInputService, disposables: DisposableStore) { }

		provide(picker: IQuickPick<IQuickPickItem, { useSeparators: true }>, token: CancellationToken): IDisposable {
			assert.ok(picker);
			providerDefaultCalled = true;
			const store = new DisposableStore();
			store.add(toDisposable(() => providerDefaultDisposed = true));
			store.add(token.onCancellationRequested(() => providerDefaultCanceled = true));

			// bring up provider #3
			setTimeout(() => this.quickInputService.quickAccess.show(providerDescriptor3.prefix));

			return store;
		}
	}

	class TestProvider1 implements IQuickAccessProvider {
		provide(picker: IQuickPick<IQuickPickItem, { useSeparators: true }>, token: CancellationToken): IDisposable {
			assert.ok(picker);
			provider1Called = true;
			const store = new DisposableStore();
			store.add(token.onCancellationRequested(() => provider1Canceled = true));

			store.add(toDisposable(() => provider1Disposed = true));
			return store;
		}
	}

	class TestProvider2 implements IQuickAccessProvider {
		provide(picker: IQuickPick<IQuickPickItem, { useSeparators: true }>, token: CancellationToken): IDisposable {
			assert.ok(picker);
			provider2Called = true;
			const store = new DisposableStore();
			store.add(token.onCancellationRequested(() => provider2Canceled = true));

			store.add(toDisposable(() => provider2Disposed = true));
			return store;
		}
	}

	class TestProvider3 implements IQuickAccessProvider {
		provide(picker: IQuickPick<IQuickPickItem, { useSeparators: true }>, token: CancellationToken): IDisposable {
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
		const registry = (Registry.as<IQuickAccessRegistry>(Extensions.Quickaccess));
		const restore = (registry as QuickAccessRegistry).clear();
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
		const registry = (Registry.as<IQuickAccessRegistry>(Extensions.Quickaccess));
		const restore = (registry as QuickAccessRegistry).clear();

		// Use real ContextKeyService that properly evaluates rules
		const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
		const localDisposables = new DisposableStore();

		// Create a context key that starts as undefined (falsy)
		const contextKey = contextKeyService.createKey<boolean | undefined>('testQuickAccessContextKey', undefined);

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
		const registry = (Registry.as<IQuickAccessRegistry>(Extensions.Quickaccess));
		const restore = (registry as QuickAccessRegistry).clear();

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

	class FastTestQuickPickProvider extends PickerQuickAccessProvider<IQuickPickItem> {

		constructor() {
			super('fast');
		}

		protected _getPicks(filter: string, disposables: DisposableStore, token: CancellationToken): Array<IQuickPickItem> {
			fastProviderCalled = true;

			return [{ label: 'Fast Pick' }];
		}
	}

	class SlowTestQuickPickProvider extends PickerQuickAccessProvider<IQuickPickItem> {

		constructor() {
			super('slow');
		}

		protected async _getPicks(filter: string, disposables: DisposableStore, token: CancellationToken): Promise<Array<IQuickPickItem>> {
			slowProviderCalled = true;

			await timeout(1);

			if (token.isCancellationRequested) {
				slowProviderCanceled = true;
			}

			return [{ label: 'Slow Pick' }];
		}
	}

	class FastAndSlowTestQuickPickProvider extends PickerQuickAccessProvider<IQuickPickItem> {

		constructor() {
			super('bothFastAndSlow');
		}

		protected _getPicks(filter: string, disposables: DisposableStore, token: CancellationToken): FastAndSlowPicks<IQuickPickItem> {
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
		const registry = (Registry.as<IQuickAccessRegistry>(Extensions.Quickaccess));
		const restore = (registry as QuickAccessRegistry).clear();

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
		const registry = (Registry.as<IQuickAccessRegistry>(Extensions.Quickaccess));
		const restore = (registry as QuickAccessRegistry).clear();

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
		assert.deepStrictEqual(part.activeGroup.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).map(e => e.resource), [input1.resource, input2.resource]);
		if (part.activeGroup.activeEditorPane?.getSelection) {
			assert.deepStrictEqual(part.activeGroup.activeEditorPane?.getSelection(), input1.options.selection);
		}
		await part.activeGroup.closeAllEditors();
	});
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Registry } from 'vs/platform/registry/common/platform';
import { IQuickAccessRegistry, Extensions, IQuickAccessProvider } from 'vs/platform/quickinput/common/quickAccess';
import { IQuickPick, IQuickPickItem, IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TestServiceAccessor, workbenchInstantiationService } from 'vs/workbench/test/browser/workbenchTestServices';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { timeout } from 'vs/base/common/async';

suite('QuickAccess', () => {

	let instantiationService: IInstantiationService;
	let accessor: TestServiceAccessor;

	let provider1Called = false;
	let provider1Canceled = false;

	let provider2Called = false;
	let provider2Canceled = false;

	let provider3Called = false;
	let provider3Canceled = false;

	let provider4Called = false;
	let provider4Canceled = false;

	class TestProvider1 implements IQuickAccessProvider {
		provide(picker: IQuickPick<IQuickPickItem>, token: CancellationToken) {
			assert.ok(picker);
			provider1Called = true;
			token.onCancellationRequested(() => provider1Canceled = true);

			picker.show();
		}
	}

	class TestProvider2 implements IQuickAccessProvider {
		provide(picker: IQuickPick<IQuickPickItem>, token: CancellationToken) {
			assert.ok(picker);
			provider2Called = true;
			token.onCancellationRequested(() => provider2Canceled = true);

			// Not calling picker show explicitly to test bad provider
			// picker.show();
		}
	}

	class TestProvider3 implements IQuickAccessProvider {

		constructor(@IQuickInputService private readonly quickInputService: IQuickInputService) { }

		async provide(picker: IQuickPick<IQuickPickItem>, token: CancellationToken) {
			assert.ok(picker);
			provider3Called = true;
			token.onCancellationRequested(() => provider3Canceled = true);

			picker.show();

			// bring up provider #4
			await timeout(0);
			this.quickInputService.quickAccess.show(providerDescriptor4.prefix);
		}
	}

	class TestProvider4 implements IQuickAccessProvider {
		provide(picker: IQuickPick<IQuickPickItem>, token: CancellationToken) {
			assert.ok(picker);
			provider4Called = true;
			token.onCancellationRequested(() => provider4Canceled = true);

			picker.show();
		}
	}

	const providerDescriptor1 = { ctor: TestProvider1, prefix: 'test', helpEntries: [] };
	const providerDescriptor2 = { ctor: TestProvider2, prefix: 'test something', helpEntries: [] };
	const providerDescriptor3 = { ctor: TestProvider3, prefix: 'default', helpEntries: [] };
	const providerDescriptor4 = { ctor: TestProvider4, prefix: 'changed', helpEntries: [] };

	setup(() => {
		instantiationService = workbenchInstantiationService();
		accessor = instantiationService.createInstance(TestServiceAccessor);
	});

	test('registry', () => {
		const registry = (Registry.as<IQuickAccessRegistry>(Extensions.Quickaccess));
		const initialSize = registry.getQuickAccessProviders().length;

		const disposable = registry.registerQuickAccessProvider(providerDescriptor1);

		assert(registry.getQuickAccessProvider('test') === providerDescriptor1);

		const providers = registry.getQuickAccessProviders();
		assert(providers.some(provider => provider.prefix === 'test'));

		disposable.dispose();
		assert.ok(!registry.getQuickAccessProvider('test'));
		assert.equal(registry.getQuickAccessProviders().length - initialSize, 0);
	});

	test('provider', async () => {
		const registry = (Registry.as<IQuickAccessRegistry>(Extensions.Quickaccess));
		const defaultProvider = registry.defaultProvider;

		const disposables = new DisposableStore();

		disposables.add(registry.registerQuickAccessProvider(providerDescriptor1));
		disposables.add(registry.registerQuickAccessProvider(providerDescriptor2));
		disposables.add(registry.registerQuickAccessProvider(providerDescriptor4));
		registry.defaultProvider = providerDescriptor3;

		accessor.quickInputService.quickAccess.show('test');
		assert.equal(provider1Called, true);
		assert.equal(provider2Called, false);
		assert.equal(provider3Called, false);
		assert.equal(provider4Called, false);
		assert.equal(provider1Canceled, false);
		assert.equal(provider2Canceled, false);
		assert.equal(provider3Canceled, false);
		assert.equal(provider4Canceled, false);
		provider1Called = false;

		accessor.quickInputService.quickAccess.show('test something');
		assert.equal(provider1Called, false);
		assert.equal(provider2Called, true);
		assert.equal(provider3Called, false);
		assert.equal(provider4Called, false);
		assert.equal(provider1Canceled, true);
		assert.equal(provider2Canceled, false);
		assert.equal(provider3Canceled, false);
		assert.equal(provider4Canceled, false);
		provider2Called = false;
		provider1Canceled = false;

		accessor.quickInputService.quickAccess.show('usedefault');
		assert.equal(provider1Called, false);
		assert.equal(provider2Called, false);
		assert.equal(provider3Called, true);
		assert.equal(provider4Called, false);
		assert.equal(provider1Canceled, false);
		assert.equal(provider2Canceled, true);
		assert.equal(provider3Canceled, false);
		assert.equal(provider4Canceled, false);

		await timeout(1);

		assert.equal(provider3Canceled, true);
		assert.equal(provider4Called, true);

		disposables.dispose();
		registry.defaultProvider = defaultProvider;
	});
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DeferredPromise } from 'vs/base/common/async';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { isCI } from 'vs/base/common/platform';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { WorkbenchPhase, WorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { TestInMemoryFileSystemProvider, TestServiceAccessor, workbenchInstantiationService } from 'vs/workbench/test/browser/workbenchTestServices';

suite('Contributions', () => {
	const disposables = new DisposableStore();

	let aCreated: boolean;
	let aCreatedPromise: DeferredPromise<void>;

	let bCreated: boolean;
	let bCreatedPromise: DeferredPromise<void>;

	setup(() => {
		aCreated = false;
		aCreatedPromise = new DeferredPromise<void>();

		bCreated = false;
		bCreatedPromise = new DeferredPromise<void>();
	});

	teardown(() => {
		disposables.clear();
	});

	class TestContributionA {
		constructor() {
			aCreated = true;
			aCreatedPromise.complete();
		}
	}
	class TestContributionB {
		constructor() {
			bCreated = true;
			bCreatedPromise.complete();
		}
	}
	class TestContributionError {
		constructor() {
			throw new Error();
		}
	}

	test('getWorkbenchContribution() - with lazy contributions', () => {
		const registry = disposables.add(new WorkbenchContributionsRegistry());

		assert.throws(() => registry.getWorkbenchContribution('a'));

		registry.registerWorkbenchContribution2('a', TestContributionA, { lazy: true });
		assert.throws(() => registry.getWorkbenchContribution('a'));

		registry.registerWorkbenchContribution2('b', TestContributionB, { lazy: true });
		registry.registerWorkbenchContribution2('c', TestContributionError, { lazy: true });

		const instantiationService = workbenchInstantiationService(undefined, disposables);
		registry.start(instantiationService);

		const instanceA = registry.getWorkbenchContribution('a');
		assert.ok(instanceA instanceof TestContributionA);
		assert.ok(aCreated);
		assert.strictEqual(instanceA, registry.getWorkbenchContribution('a'));

		const instanceB = registry.getWorkbenchContribution('b');
		assert.ok(instanceB instanceof TestContributionB);

		assert.throws(() => registry.getWorkbenchContribution('c'));
	});

	test('getWorkbenchContribution() - with non-lazy contributions', async () => {
		const registry = disposables.add(new WorkbenchContributionsRegistry());

		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const accessor = instantiationService.createInstance(TestServiceAccessor);
		accessor.lifecycleService.usePhases = true;
		registry.start(instantiationService);

		assert.throws(() => registry.getWorkbenchContribution('a'));

		registry.registerWorkbenchContribution2('a', TestContributionA, WorkbenchPhase.BlockRestore);

		const instanceA = registry.getWorkbenchContribution('a');
		assert.ok(instanceA instanceof TestContributionA);
		assert.ok(aCreated);

		accessor.lifecycleService.phase = LifecyclePhase.Ready;
		await aCreatedPromise.p;

		assert.strictEqual(instanceA, registry.getWorkbenchContribution('a'));
	});

	test('lifecycle phase instantiation works when phase changes', async () => {
		const registry = disposables.add(new WorkbenchContributionsRegistry());

		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const accessor = instantiationService.createInstance(TestServiceAccessor);
		registry.start(instantiationService);

		registry.registerWorkbenchContribution2('a', TestContributionA, WorkbenchPhase.BlockRestore);
		assert.ok(!aCreated);

		accessor.lifecycleService.phase = LifecyclePhase.Ready;
		await aCreatedPromise.p;
		assert.ok(aCreated);
	});

	test('lifecycle phase instantiation works when phase was already met', async () => {
		const registry = disposables.add(new WorkbenchContributionsRegistry());

		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const accessor = instantiationService.createInstance(TestServiceAccessor);
		accessor.lifecycleService.usePhases = true;
		accessor.lifecycleService.phase = LifecyclePhase.Restored;

		registry.registerWorkbenchContribution2('a', TestContributionA, WorkbenchPhase.BlockRestore);
		registry.start(instantiationService);

		await aCreatedPromise.p;
		assert.ok(aCreated);
	});

	(isCI ? test.skip /* runWhenIdle seems flaky in CI on Windows */ : test)('lifecycle phase instantiation works for late phases', async () => {
		const registry = disposables.add(new WorkbenchContributionsRegistry());

		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const accessor = instantiationService.createInstance(TestServiceAccessor);
		accessor.lifecycleService.usePhases = true;
		registry.start(instantiationService);

		registry.registerWorkbenchContribution2('a', TestContributionA, WorkbenchPhase.AfterRestored);
		registry.registerWorkbenchContribution2('b', TestContributionB, WorkbenchPhase.Eventually);
		assert.ok(!aCreated);
		assert.ok(!bCreated);

		accessor.lifecycleService.phase = LifecyclePhase.Starting;
		accessor.lifecycleService.phase = LifecyclePhase.Ready;
		accessor.lifecycleService.phase = LifecyclePhase.Restored;
		await aCreatedPromise.p;
		assert.ok(aCreated);

		accessor.lifecycleService.phase = LifecyclePhase.Eventually;
		await bCreatedPromise.p;
		assert.ok(bCreated);
	});

	test('contribution on file system', async function () {
		const registry = disposables.add(new WorkbenchContributionsRegistry());

		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const accessor = instantiationService.createInstance(TestServiceAccessor);
		disposables.add(accessor.fileService.registerProvider('testBefore', disposables.add(new TestInMemoryFileSystemProvider())));

		registry.registerWorkbenchContribution2('a', TestContributionA, { scheme: 'testBefore' });
		registry.start(instantiationService);

		await aCreatedPromise.p;
		assert.ok(aCreated);

		registry.registerWorkbenchContribution2('b', TestContributionB, { scheme: 'testAfter' });

		accessor.fileService.activateProvider('testAfter');

		await bCreatedPromise.p;
		assert.ok(bCreated);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});

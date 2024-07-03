/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from 'vs/base/common/async';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { isCI } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { EditorPart } from 'vs/workbench/browser/parts/editor/editorPart';
import { WorkbenchPhase, WorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { EditorService } from 'vs/workbench/services/editor/browser/editorService';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService, SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { ITestInstantiationService, TestFileEditorInput, TestServiceAccessor, TestSingletonFileEditorInput, createEditorPart, registerTestEditor, workbenchInstantiationService } from 'vs/workbench/test/browser/workbenchTestServices';

suite('Contributions', () => {
	const disposables = new DisposableStore();

	let aCreated: boolean;
	let aCreatedPromise: DeferredPromise<void>;

	let bCreated: boolean;
	let bCreatedPromise: DeferredPromise<void>;

	const TEST_EDITOR_ID = 'MyTestEditorForContributions';
	const TEST_EDITOR_INPUT_ID = 'testEditorInputForContributions';

	async function createEditorService(instantiationService: ITestInstantiationService = workbenchInstantiationService(undefined, disposables)): Promise<[EditorPart, EditorService]> {
		const part = await createEditorPart(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, part);

		const editorService = disposables.add(instantiationService.createInstance(EditorService, undefined));
		instantiationService.stub(IEditorService, editorService);

		return [part, editorService];
	}

	setup(() => {
		aCreated = false;
		aCreatedPromise = new DeferredPromise<void>();

		bCreated = false;
		bCreatedPromise = new DeferredPromise<void>();

		disposables.add(registerTestEditor(TEST_EDITOR_ID, [new SyncDescriptor(TestFileEditorInput), new SyncDescriptor(TestSingletonFileEditorInput)], TEST_EDITOR_INPUT_ID));
	});

	teardown(async () => {
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

	test('contribution on editor - editor exists before start', async function () {
		const registry = disposables.add(new WorkbenchContributionsRegistry());

		const instantiationService = workbenchInstantiationService(undefined, disposables);

		const [, editorService] = await createEditorService(instantiationService);

		const input = disposables.add(new TestFileEditorInput(URI.parse('my://resource-basics'), TEST_EDITOR_INPUT_ID));
		await editorService.openEditor(input, { pinned: true });

		registry.registerWorkbenchContribution2('a', TestContributionA, { editorTypeId: TEST_EDITOR_ID });
		registry.start(instantiationService.createChild(new ServiceCollection([IEditorService, editorService])));

		await aCreatedPromise.p;
		assert.ok(aCreated);

		registry.registerWorkbenchContribution2('b', TestContributionB, { editorTypeId: TEST_EDITOR_ID });

		const input2 = disposables.add(new TestFileEditorInput(URI.parse('my://resource-basics2'), TEST_EDITOR_INPUT_ID));
		await editorService.openEditor(input2, { pinned: true }, SIDE_GROUP);

		await bCreatedPromise.p;
		assert.ok(bCreated);
	});

	test('contribution on editor - editor does not exist before start', async function () {
		const registry = disposables.add(new WorkbenchContributionsRegistry());

		const instantiationService = workbenchInstantiationService(undefined, disposables);

		const [, editorService] = await createEditorService(instantiationService);

		const input = disposables.add(new TestFileEditorInput(URI.parse('my://resource-basics'), TEST_EDITOR_INPUT_ID));

		registry.registerWorkbenchContribution2('a', TestContributionA, { editorTypeId: TEST_EDITOR_ID });
		registry.start(instantiationService.createChild(new ServiceCollection([IEditorService, editorService])));

		await editorService.openEditor(input, { pinned: true });

		await aCreatedPromise.p;
		assert.ok(aCreated);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});

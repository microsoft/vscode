/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../base/common/async.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { isCI } from '../../../base/common/platform.js';
import { URI } from '../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { SyncDescriptor } from '../../../platform/instantiation/common/descriptors.js';
import { ServiceCollection } from '../../../platform/instantiation/common/serviceCollection.js';
import { EditorPart } from '../../browser/parts/editor/editorPart.js';
import { WorkbenchPhase, WorkbenchContributionsRegistry } from '../../common/contributions.js';
import { EditorService } from '../../services/editor/browser/editorService.js';
import { IEditorGroupsService } from '../../services/editor/common/editorGroupsService.js';
import { IEditorService, SIDE_GROUP } from '../../services/editor/common/editorService.js';
import { LifecyclePhase } from '../../services/lifecycle/common/lifecycle.js';
import { ITestInstantiationService, TestFileEditorInput, TestServiceAccessor, TestSingletonFileEditorInput, createEditorPart, registerTestEditor, workbenchInstantiationService } from './workbenchTestServices.js';

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

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
import { WorkbenchContributionsRegistry } from '../../common/contributions.js';
import { EditorService } from '../../services/editor/browser/editorService.js';
import { IEditorGroupsService } from '../../services/editor/common/editorGroupsService.js';
import { IEditorService, SIDE_GROUP } from '../../services/editor/common/editorService.js';
import { TestFileEditorInput, TestServiceAccessor, TestForceRevealFileEditorInput, createEditorPart, registerTestEditor, workbenchInstantiationService } from './workbenchTestServices.js';
suite('Contributions', () => {
    const disposables = new DisposableStore();
    let aCreated;
    let aCreatedPromise;
    let bCreated;
    let bCreatedPromise;
    const TEST_EDITOR_ID = 'MyTestEditorForContributions';
    const TEST_EDITOR_INPUT_ID = 'testEditorInputForContributions';
    async function createEditorService(instantiationService = workbenchInstantiationService(undefined, disposables)) {
        const part = await createEditorPart(instantiationService, disposables);
        instantiationService.stub(IEditorGroupsService, part);
        const editorService = disposables.add(instantiationService.createInstance(EditorService, undefined));
        instantiationService.stub(IEditorService, editorService);
        return [part, editorService];
    }
    setup(() => {
        aCreated = false;
        aCreatedPromise = new DeferredPromise();
        bCreated = false;
        bCreatedPromise = new DeferredPromise();
        disposables.add(registerTestEditor(TEST_EDITOR_ID, [new SyncDescriptor(TestFileEditorInput), new SyncDescriptor(TestForceRevealFileEditorInput)], TEST_EDITOR_INPUT_ID));
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
        registry.registerWorkbenchContribution2('a', TestContributionA, 2 /* WorkbenchPhase.BlockRestore */);
        const instanceA = registry.getWorkbenchContribution('a');
        assert.ok(instanceA instanceof TestContributionA);
        assert.ok(aCreated);
        accessor.lifecycleService.phase = 2 /* LifecyclePhase.Ready */;
        await aCreatedPromise.p;
        assert.strictEqual(instanceA, registry.getWorkbenchContribution('a'));
    });
    test('lifecycle phase instantiation works when phase changes', async () => {
        const registry = disposables.add(new WorkbenchContributionsRegistry());
        const instantiationService = workbenchInstantiationService(undefined, disposables);
        const accessor = instantiationService.createInstance(TestServiceAccessor);
        registry.start(instantiationService);
        registry.registerWorkbenchContribution2('a', TestContributionA, 2 /* WorkbenchPhase.BlockRestore */);
        assert.ok(!aCreated);
        accessor.lifecycleService.phase = 2 /* LifecyclePhase.Ready */;
        await aCreatedPromise.p;
        assert.ok(aCreated);
    });
    test('lifecycle phase instantiation works when phase was already met', async () => {
        const registry = disposables.add(new WorkbenchContributionsRegistry());
        const instantiationService = workbenchInstantiationService(undefined, disposables);
        const accessor = instantiationService.createInstance(TestServiceAccessor);
        accessor.lifecycleService.usePhases = true;
        accessor.lifecycleService.phase = 3 /* LifecyclePhase.Restored */;
        registry.registerWorkbenchContribution2('a', TestContributionA, 2 /* WorkbenchPhase.BlockRestore */);
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
        registry.registerWorkbenchContribution2('a', TestContributionA, 3 /* WorkbenchPhase.AfterRestored */);
        registry.registerWorkbenchContribution2('b', TestContributionB, 4 /* WorkbenchPhase.Eventually */);
        assert.ok(!aCreated);
        assert.ok(!bCreated);
        accessor.lifecycleService.phase = 1 /* LifecyclePhase.Starting */;
        accessor.lifecycleService.phase = 2 /* LifecyclePhase.Ready */;
        accessor.lifecycleService.phase = 3 /* LifecyclePhase.Restored */;
        await aCreatedPromise.p;
        assert.ok(aCreated);
        accessor.lifecycleService.phase = 4 /* LifecyclePhase.Eventually */;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udHJpYnV0aW9ucy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3Rlc3QvYnJvd3Nlci9jb250cmlidXRpb25zLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUNoRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDcEUsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUNsRCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM3RixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDdkYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFFaEcsT0FBTyxFQUFrQiw4QkFBOEIsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQy9GLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUMvRSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUMzRixPQUFPLEVBQUUsY0FBYyxFQUFFLFVBQVUsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBRTNGLE9BQU8sRUFBNkIsbUJBQW1CLEVBQUUsbUJBQW1CLEVBQUUsOEJBQThCLEVBQUUsZ0JBQWdCLEVBQUUsa0JBQWtCLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUV0TixLQUFLLENBQUMsZUFBZSxFQUFFLEdBQUcsRUFBRTtJQUMzQixNQUFNLFdBQVcsR0FBRyxJQUFJLGVBQWUsRUFBRSxD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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite, toResource } from '../../../../../base/test/common/utils.js';
import { URI } from '../../../../../base/common/uri.js';
import { workbenchInstantiationService, TestFileEditorInput, registerTestEditor, createEditorPart, registerTestFileEditor, TestServiceAccessor, workbenchTeardown, registerTestSideBySideEditor } from '../../../../test/browser/workbenchTestServices.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { IEditorGroupsService } from '../../../editor/common/editorGroupsService.js';
import { EditorNavigationStack, HistoryService } from '../../browser/historyService.js';
import { IEditorService, SIDE_GROUP } from '../../../editor/common/editorService.js';
import { EditorService } from '../../../editor/browser/editorService.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IHistoryService } from '../../common/history.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { isResourceEditorInput } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { FileChangesEvent, FileOperationEvent } from '../../../../../platform/files/common/files.js';
import { isLinux } from '../../../../../base/common/platform.js';
import { Selection } from '../../../../../editor/common/core/selection.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { SideBySideEditorInput } from '../../../../common/editor/sideBySideEditorInput.js';
suite('HistoryService', function () {
    const TEST_EDITOR_ID = 'MyTestEditorForEditorHistory';
    const TEST_EDITOR_INPUT_ID = 'testEditorInputForHistoyService';
    async function createServices(scope = 0 /* GoScope.DEFAULT */, configureSearchExclude = false) {
        const instantiationService = workbenchInstantiationService(undefined, disposables);
        const part = await createEditorPart(instantiationService, disposables);
        instantiationService.stub(IEditorGroupsService, part);
        const editorService = disposables.add(instantiationService.createInstance(EditorService, undefined));
        instantiationService.stub(IEditorService, editorService);
        const configurationService = new TestConfigurationService();
        if (scope === 1 /* GoScope.EDITOR_GROUP */) {
            configurationService.setUserConfiguration('workbench.editor.navigationScope', 'editorGroup');
        }
        else if (scope === 2 /* GoScope.EDITOR */) {
            configurationService.setUserConfiguration('workbench.editor.navigationScope', 'editor');
        }
        if (configureSearchExclude) {
            configurationService.setUserConfiguration('search', { exclude: { '**/node_modules/**': true } });
        }
        instantiationService.stub(IConfigurationService, configurationService);
        const historyService = disposables.add(instantiationService.createInstance(HistoryService));
        instantiationService.stub(IHistoryService, historyService);
        const accessor = instantiationService.createInstance(TestServiceAccessor);
        return [part, historyService, editorService, accessor.textFileService, instantiationService, configurationService];
    }
    const disposables = new DisposableStore();
    setup(() => {
        disposables.add(registerTestEditor(TEST_EDITOR_ID, [new SyncDescriptor(TestFileEditorInput)]));
        disposables.add(registerTestSideBySideEditor());
        disposables.add(registerTestFileEditor());
    });
    teardown(() => {
        disposables.clear();
    });
    test('back / forward: basics', async () => {
        const [part, historyService] = await createServices();
        const input1 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar1'), TEST_EDITOR_INPUT_ID));
        await part.activeGroup.openEditor(input1, { pinned: true });
        assert.strictEqual(part.activeGroup.activeEditor, input1);
        const input2 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar2'), TEST_EDITOR_INPUT_ID));
        await part.activeGroup.openEditor(input2, { pinned: true });
        assert.strictEqual(part.activeGroup.activeEditor, input2);
        await historyService.goBack();
        assert.strictEqual(part.activeGroup.activeEditor, input1);
        await historyService.goForward();
        assert.strictEqual(part.activeGroup.activeEditor, input2);
    });
    test('back / forward: is editor group aware', async function () {
        const [part, historyService, editorService, , instantiationService] = await createServices();
        const resource = toResource.call(this, '/path/index.txt');
        const otherResource = toResource.call(this, '/path/other.html');
        const pane1 = await editorService.openEditor({ resource, options: { pinned: true } });
        const pane2 = await editorService.openEditor({ resource, options: { pinned: true } }, SIDE_GROUP);
        // [index.txt] | [>index.txt<]
        assert.notStrictEqual(pane1, pane2);
        await editorService.openEditor({ resource: otherResource, options: { pinned: true } }, pane2?.group);
        // [index.txt] | [index.txt] [>other.html<]
        await historyService.goBack();
        // [index.txt] | [>index.txt<] [other.html]
        assert.strictEqual(part.activeGroup.id, pane2?.group.id);
        assert.strictEqual(part.activeGroup.activeEditor?.resource?.toString(), resource.toString());
        await historyService.goBack();
        // [>index.txt<] | [index.txt] [other.html]
        assert.strictEqual(part.activeGroup.id, pane1?.group.id);
        assert.strictEqual(part.activeGroup.activeEditor?.resource?.toString(), resource.toString());
        await historyService.goForward();
        // [index.txt] | [>index.txt<] [other.html]
        assert.strictEqual(part.activeGroup.id, pane2?.group.id);
        assert.strictEqual(part.activeGroup.activeEditor?.resource?.toString(), resource.toString());
        await historyService.goForward();
        // [index.txt] | [index.txt] [>other.html<]
        assert.strictEqual(part.activeGroup.id, pane2?.group.id);
        assert.strictEqual(part.activeGroup.activeEditor?.resource?.toString(), otherResource.toString());
        return workbenchTeardown(instantiationService);
    });
    test('back / forward: in-editor text selection changes (user)', async function () {
        const [, historyService, editorService, , instantiationService] = await createServices();
        const resource = toResource.call(this, '/path/index.txt');
        const pane = await editorService.openEditor({ resource, options: { pinned: true } });
        await setTextSelection(historyService, pane, new Selection(1, 2, 1, 2));
        await setTextSelection(historyService, pane, new Selection(15, 1, 15, 1)); // will be merged and dropped
        await setTextSelection(historyService, pane, new Selection(16, 1, 16, 1)); // will be merged and dropped
        await setTextSelection(historyService, pane, new Selection(17, 1, 17, 1));
        await setTextSelection(historyService, pane, new Selection(30, 5, 30, 8));
        await setTextSelection(historyService, pane, new Selection(40, 1, 40, 1));
        await historyService.goBack(0 /* GoFilter.NONE */);
        assertTextSelection(new Selection(30, 5, 30, 8), pane);
        await historyService.goBack(0 /* GoFilter.NONE */);
        assertTextSelection(new Selection(17, 1, 17, 1), pane);
        await historyService.goBack(0 /* GoFilter.NONE */);
        assertTextSelection(new Selection(1, 2, 1, 2), pane);
        await historyService.goForward(0 /* GoFilter.NONE */);
        assertTextSelection(new Selection(17, 1, 17, 1), pane);
        return workbenchTeardown(instantiationService);
    });
    test('back / forward: in-editor text selection changes (navigation)', async function () {
        const [, historyService, editorService, , instantiationService] = await createServices();
        const resource = toResource.call(this, '/path/index.txt');
        const pane = await editorService.openEditor({ resource, options: { pinned: true } });
        await setTextSelection(historyService, pane, new Selection(2, 2, 2, 10)); // this is our starting point
        await setTextSelection(historyService, pane, new Selection(5, 3, 5, 20), 4 /* EditorPaneSelectionChangeReason.NAVIGATION */); // this is our first target definition
        await setTextSelection(historyService, pane, new Selection(120, 8, 120, 18), 4 /* EditorPaneSelectionChangeReason.NAVIGATION */); // this is our second target definition
        await setTextSelection(historyService, pane, new Selection(300, 3, 300, 20)); // unrelated user navigation
        await setTextSelection(historyService, pane, new Selection(500, 3, 500, 20)); // unrelated user navigation
        await setTextSelection(historyService, pane, new Selection(200, 3, 200, 20)); // unrelated user navigation
        await historyService.goBack(2 /* GoFilter.NAVIGATION */); // this should reveal the last navigation entry because we are not at it currently
        assertTextSelection(new Selection(120, 8, 120, 18), pane);
        await historyService.goBack(2 /* GoFilter.NAVIGATION */);
        assertTextSelection(new Selection(5, 3, 5, 20), pane);
        await historyService.goBack(2 /* GoFilter.NAVIGATION */);
        assertTextSelection(new Selection(5, 3, 5, 20), pane);
        await historyService.goForward(2 /* GoFilter.NAVIGATION */);
        assertTextSelection(new Selection(120, 8, 120, 18), pane);
        await historyService.goPrevious(2 /* GoFilter.NAVIGATION */);
        assertTextSelection(new Selection(5, 3, 5, 20), pane);
        await historyService.goPrevious(2 /* GoFilter.NAVIGATION */);
        assertTextSelection(new Selection(120, 8, 120, 18), pane);
        return workbenchTeardown(instantiationService);
    });
    test('back / forward: in-editor text selection changes (jump)', async function () {
        const [, historyService, editorService, , instantiationService] = await createServices();
        const resource = toResource.call(this, '/path/index.txt');
        const pane = await editorService.openEditor({ resource, options: { pinned: true } });
        await setTextSelection(historyService, pane, new Selection(2, 2, 2, 10), 2 /* EditorPaneSelectionChangeReason.USER */);
        await setTextSelection(historyService, pane, new Selection(5, 3, 5, 20), 5 /* EditorPaneSelectionChangeReason.JUMP */);
        await setTextSelection(historyService, pane, new Selection(120, 8, 120, 18), 5 /* EditorPaneSelectionChangeReason.JUMP */);
        await historyService.goBack(2 /* GoFilter.NAVIGATION */);
        assertTextSelection(new Selection(5, 3, 5, 20), pane);
        await historyService.goBack(2 /* GoFilter.NAVIGATION */);
        assertTextSelection(new Selection(2, 2, 2, 10), pane);
        await historyService.goForward(2 /* GoFilter.NAVIGATION */);
        assertTextSelection(new Selection(5, 3, 5, 20), pane);
        await historyService.goLast(2 /* GoFilter.NAVIGATION */);
        assertTextSelection(new Selection(120, 8, 120, 18), pane);
        await historyService.goPrevious(2 /* GoFilter.NAVIGATION */);
        assertTextSelection(new Selection(5, 3, 5, 20), pane);
        await historyService.goPrevious(2 /* GoFilter.NAVIGATION */);
        assertTextSelection(new Selection(120, 8, 120, 18), pane);
        return workbenchTeardown(instantiationService);
    });
    test('back / forward: selection changes with JUMP or NAVIGATION source are not merged (#143833)', async function () {
        const [, historyService, editorService, , instantiationService] = await createServices();
        const resource = toResource.call(this, '/path/index.txt');
        const pane = await editorService.openEditor({ resource, options: { pinned: true } });
        await setTextSelection(historyService, pane, new Selection(2, 2, 2, 10), 2 /* EditorPaneSelectionChangeReason.USER */);
        await setTextSelection(historyService, pane, new Selection(5, 3, 5, 20), 5 /* EditorPaneSelectionChangeReason.JUMP */);
        await setTextSelection(historyService, pane, new Selection(6, 3, 6, 20), 4 /* EditorPaneSelectionChangeReason.NAVIGATION */);
        await historyService.goBack(0 /* GoFilter.NONE */);
        assertTextSelection(new Selection(5, 3, 5, 20), pane);
        await historyService.goBack(0 /* GoFilter.NONE */);
        assertTextSelection(new Selection(2, 2, 2, 10), pane);
        return workbenchTeardown(instantiationService);
    });
    test('back / forward: edit selection changes', async function () {
        const [, historyService, editorService, , instantiationService] = await createServices();
        const resource = toResource.call(this, '/path/index.txt');
        const pane = await editorService.openEditor({ resource, options: { pinned: true } });
        await setTextSelection(historyService, pane, new Selection(2, 2, 2, 10));
        await setTextSelection(historyService, pane, new Selection(50, 3, 50, 20), 3 /* EditorPaneSelectionChangeReason.EDIT */);
        await setTextSelection(historyService, pane, new Selection(300, 3, 300, 20)); // unrelated user navigation
        await setTextSelection(historyService, pane, new Selection(500, 3, 500, 20)); // unrelated user navigation
        await setTextSelection(historyService, pane, new Selection(200, 3, 200, 20)); // unrelated user navigation
        await setTextSelection(historyService, pane, new Selection(5, 3, 5, 20), 3 /* EditorPaneSelectionChangeReason.EDIT */);
        await setTextSelection(historyService, pane, new Selection(200, 3, 200, 20)); // unrelated user navigation
        await historyService.goBack(1 /* GoFilter.EDITS */); // this should reveal the last navigation entry because we are not at it currently
        assertTextSelection(new Selection(5, 3, 5, 20), pane);
        await historyService.goBack(1 /* GoFilter.EDITS */);
        assertTextSelection(new Selection(50, 3, 50, 20), pane);
        await historyService.goForward(1 /* GoFilter.EDITS */);
        assertTextSelection(new Selection(5, 3, 5, 20), pane);
        return workbenchTeardown(instantiationService);
    });
    async function setTextSelection(historyService, pane, selection, reason = 2 /* EditorPaneSelectionChangeReason.USER */) {
        const promise = Event.toPromise(historyService.onDidChangeEditorNavigationStack);
        pane.setSelection(selection, reason);
        await promise;
    }
    function assertTextSelection(expected, pane) {
        const options = pane.options;
        if (!options) {
            assert.fail('EditorPane has no selection');
        }
        assert.strictEqual(options.selection?.startLineNumber, expected.startLineNumber);
        assert.strictEqual(options.selection?.startColumn, expected.startColumn);
        assert.strictEqual(options.selection?.endLineNumber, expected.endLineNumber);
        assert.strictEqual(options.selection?.endColumn, expected.endColumn);
    }
    test('back / forward: tracks editor moves across groups', async function () {
        const [part, historyService, editorService, , instantiationService] = await createServices();
        const resource1 = toResource.call(this, '/path/one.txt');
        const resource2 = toResource.call(this, '/path/two.html');
        const pane1 = await editorService.openEditor({ resource: resource1, options: { pinned: true } });
        await editorService.openEditor({ resource: resource2, options: { pinned: true } });
        // [one.txt] [>two.html<]
        const sideGroup = part.addGroup(part.activeGroup, 3 /* GroupDirection.RIGHT */);
        // [one.txt] [>two.html<] | <empty>
        const editorChangePromise = Event.toPromise(editorService.onDidActiveEditorChange);
        pane1?.group.moveEditor(pane1.input, sideGroup);
        await editorChangePromise;
        // [one.txt] | [>two.html<]
        await historyService.goBack();
        // [>one.txt<] | [two.html]
        assert.strictEqual(part.activeGroup.id, pane1?.group.id);
        assert.strictEqual(part.activeGroup.activeEditor?.resource?.toString(), resource1.toString());
        return workbenchTeardown(instantiationService);
    });
    test('back / forward: tracks group removals', async function () {
        const [part, historyService, editorService, , instantiationService] = await createServices();
        const resource1 = toResource.call(this, '/path/one.txt');
        const resource2 = toResource.call(this, '/path/two.html');
        const pane1 = await editorService.openEditor({ resource: resource1, options: { pinned: true } });
        const pane2 = await editorService.openEditor({ resource: resource2, options: { pinned: true } }, SIDE_GROUP);
        // [one.txt] | [>two.html<]
        assert.notStrictEqual(pane1, pane2);
        await pane1?.group.closeAllEditors();
        // [>two.html<]
        await historyService.goBack();
        // [>two.html<]
        assert.strictEqual(part.activeGroup.id, pane2?.group.id);
        assert.strictEqual(part.activeGroup.activeEditor?.resource?.toString(), resource2.toString());
        return workbenchTeardown(instantiationService);
    });
    test('back / forward: editor navigation stack - navigation', async function () {
        const [, , editorService, , instantiationService] = await createServices();
        const stack = instantiationService.createInstance(EditorNavigationStack, 0 /* GoFilter.NONE */, 0 /* GoScope.DEFAULT */);
        const resource = toResource.call(this, '/path/index.txt');
        const otherResource = toResource.call(this, '/path/index.html');
        const pane = await editorService.openEditor({ resource, options: { pinned: true } });
        let changed = false;
        disposables.add(stack.onDidChange(() => changed = true));
        assert.strictEqual(stack.canGoBack(), false);
        assert.strictEqual(stack.canGoForward(), false);
        assert.strictEqual(stack.canGoLast(), false);
        // Opening our first editor emits change event
        stack.notifyNavigation(pane, { reason: 2 /* EditorPaneSelectionChangeReason.USER */ });
        assert.strictEqual(changed, true);
        changed = false;
        assert.strictEqual(stack.canGoBack(), false);
        assert.strictEqual(stack.canGoLast(), true);
        // Opening same editor is not treated as new history stop
        stack.notifyNavigation(pane, { reason: 2 /* EditorPaneSelectionChangeReason.USER */ });
        assert.strictEqual(stack.canGoBack(), false);
        // Opening different editor allows to go back
        await editorService.openEditor({ resource: otherResource, options: { pinned: true } });
        stack.notifyNavigation(pane, { reason: 2 /* EditorPaneSelectionChangeReason.USER */ });
        assert.strictEqual(changed, true);
        changed = false;
        assert.strictEqual(stack.canGoBack(), true);
        await stack.goBack();
        assert.strictEqual(stack.canGoBack(), false);
        assert.strictEqual(stack.canGoForward(), true);
        assert.strictEqual(stack.canGoLast(), true);
        await stack.goForward();
        assert.strictEqual(stack.canGoBack(), true);
        assert.strictEqual(stack.canGoForward(), false);
        await stack.goPrevious();
        assert.strictEqual(stack.canGoBack(), false);
        assert.strictEqual(stack.canGoForward(), true);
        await stack.goPrevious();
        assert.strictEqual(stack.canGoBack(), true);
        assert.strictEqual(stack.canGoForward(), false);
        await stack.goBack();
        await stack.goLast();
        assert.strictEqual(stack.canGoBack(), true);
        assert.strictEqual(stack.canGoForward(), false);
        stack.dispose();
        assert.strictEqual(stack.canGoBack(), false);
        return workbenchTeardown(instantiationService);
    });
    test('back / forward: editor navigation stack - mutations', async function () {
        const [, , editorService, , instantiationService] = await createServices();
        const stack = disposables.add(instantiationService.createInstance(EditorNavigationStack, 0 /* GoFilter.NONE */, 0 /* GoScope.DEFAULT */));
        const resource = toResource.call(this, '/path/index.txt');
        const otherResource = toResource.call(this, '/path/index.html');
        const unrelatedResource = toResource.call(this, '/path/unrelated.html');
        const pane = await editorService.openEditor({ resource, options: { pinned: true } });
        stack.notifyNavigation(pane);
        await editorService.openEditor({ resource: otherResource, options: { pinned: true } });
        stack.notifyNavigation(pane);
        // Clear
        assert.strictEqual(stack.canGoBack(), true);
        stack.clear();
        assert.strictEqual(stack.canGoBack(), false);
        await editorService.openEditor({ resource, options: { pinned: true } });
        stack.notifyNavigation(pane);
        await editorService.openEditor({ resource: otherResource, options: { pinned: true } });
        stack.notifyNavigation(pane);
        // Remove unrelated resource does not cause any harm (via internal event)
        await stack.goBack();
        assert.strictEqual(stack.canGoForward(), true);
        stack.remove(new FileOperationEvent(unrelatedResource, 1 /* FileOperation.DELETE */));
        assert.strictEqual(stack.canGoForward(), true);
        // Remove (via internal event)
        await stack.goForward();
        assert.strictEqual(stack.canGoBack(), true);
        stack.remove(new FileOperationEvent(resource, 1 /* FileOperation.DELETE */));
        assert.strictEqual(stack.canGoBack(), false);
        stack.clear();
        await editorService.openEditor({ resource, options: { pinned: true } });
        stack.notifyNavigation(pane);
        await editorService.openEditor({ resource: otherResource, options: { pinned: true } });
        stack.notifyNavigation(pane);
        // Remove (via external event)
        assert.strictEqual(stack.canGoBack(), true);
        stack.remove(new FileChangesEvent([{ resource, type: 2 /* FileChangeType.DELETED */ }], !isLinux));
        assert.strictEqual(stack.canGoBack(), false);
        stack.clear();
        await editorService.openEditor({ resource, options: { pinned: true } });
        stack.notifyNavigation(pane);
        await editorService.openEditor({ resource: otherResource, options: { pinned: true } });
        stack.notifyNavigation(pane);
        // Remove (via editor)
        assert.strictEqual(stack.canGoBack(), true);
        stack.remove(pane.input);
        assert.strictEqual(stack.canGoBack(), false);
        stack.clear();
        await editorService.openEditor({ resource, options: { pinned: true } });
        stack.notifyNavigation(pane);
        await editorService.openEditor({ resource: otherResource, options: { pinned: true } });
        stack.notifyNavigation(pane);
        // Remove (via group)
        assert.strictEqual(stack.canGoBack(), true);
        stack.remove(pane.group.id);
        assert.strictEqual(stack.canGoBack(), false);
        stack.clear();
        await editorService.openEditor({ resource, options: { pinned: true } });
        stack.notifyNavigation(pane);
        await editorService.openEditor({ resource: otherResource, options: { pinned: true } });
        stack.notifyNavigation(pane);
        // Move
        const stat = {
            ctime: 0,
            etag: '',
            mtime: 0,
            isDirectory: false,
            isFile: true,
            isSymbolicLink: false,
            name: 'other.txt',
            readonly: false,
            locked: false,
            executable: false,
            size: 0,
            resource: toResource.call(this, '/path/other.txt'),
            children: undefined
        };
        stack.move(new FileOperationEvent(resource, 2 /* FileOperation.MOVE */, stat));
        await stack.goBack();
        assert.strictEqual(pane?.input?.resource?.toString(), stat.resource.toString());
        return workbenchTeardown(instantiationService);
    });
    test('back / forward: editor group scope', async function () {
        const [part, historyService, editorService, , instantiationService] = await createServices(1 /* GoScope.EDITOR_GROUP */);
        const resource1 = toResource.call(this, '/path/one.txt');
        const resource2 = toResource.call(this, '/path/two.html');
        const resource3 = toResource.call(this, '/path/three.html');
        const pane1 = await editorService.openEditor({ resource: resource1, options: { pinned: true } });
        await editorService.openEditor({ resource: resource2, options: { pinned: true } });
        await editorService.openEditor({ resource: resource3, options: { pinned: true } });
        // [one.txt] [two.html] [>three.html<]
        const sideGroup = part.addGroup(part.activeGroup, 3 /* GroupDirection.RIGHT */);
        // [one.txt] [two.html] [>three.html<] | <empty>
        const pane2 = await editorService.openEditor({ resource: resource1, options: { pinned: true } }, sideGroup);
        await editorService.openEditor({ resource: resource2, options: { pinned: true } });
        await editorService.openEditor({ resource: resource3, options: { pinned: true } });
        // [one.txt] [two.html] [>three.html<] | [one.txt] [two.html] [>three.html<]
        await historyService.goBack();
        await historyService.goBack();
        await historyService.goBack();
        assert.strictEqual(part.activeGroup.id, pane2?.group.id);
        assert.strictEqual(part.activeGroup.activeEditor?.resource?.toString(), resource1.toString());
        // [one.txt] [two.html] [>three.html<] | [>one.txt<] [two.html] [three.html]
        await editorService.openEditor({ resource: resource3, options: { pinned: true } }, pane1?.group);
        await historyService.goBack();
        await historyService.goBack();
        await historyService.goBack();
        assert.strictEqual(part.activeGroup.id, pane1?.group.id);
        assert.strictEqual(part.activeGroup.activeEditor?.resource?.toString(), resource1.toString());
        return workbenchTeardown(instantiationService);
    });
    test('back / forward: editor  scope', async function () {
        const [part, historyService, editorService, , instantiationService] = await createServices(2 /* GoScope.EDITOR */);
        const resource1 = toResource.call(this, '/path/one.txt');
        const resource2 = toResource.call(this, '/path/two.html');
        const pane = await editorService.openEditor({ resource: resource1, options: { pinned: true } });
        await setTextSelection(historyService, pane, new Selection(2, 2, 2, 10));
        await setTextSelection(historyService, pane, new Selection(50, 3, 50, 20));
        await editorService.openEditor({ resource: resource2, options: { pinned: true } });
        await setTextSelection(historyService, pane, new Selection(12, 2, 12, 10));
        await setTextSelection(historyService, pane, new Selection(150, 3, 150, 20));
        await historyService.goBack();
        assertTextSelection(new Selection(12, 2, 12, 10), pane);
        await historyService.goBack();
        assertTextSelection(new Selection(12, 2, 12, 10), pane); // no change
        assert.strictEqual(part.activeGroup.activeEditor?.resource?.toString(), resource2.toString());
        await editorService.openEditor({ resource: resource1, options: { pinned: true } });
        await historyService.goBack();
        assertTextSelection(new Selection(2, 2, 2, 10), pane);
        await historyService.goBack();
        assertTextSelection(new Selection(2, 2, 2, 10), pane); // no change
        assert.strictEqual(part.activeGroup.activeEditor?.resource?.toString(), resource1.toString());
        return workbenchTeardown(instantiationService);
    });
    test('go to last edit location', async function () {
        const [, historyService, editorService, textFileService, instantiationService] = await createServices();
        const resource = toResource.call(this, '/path/index.txt');
        const otherResource = toResource.call(this, '/path/index.html');
        await editorService.openEditor({ resource });
        const model = await textFileService.files.resolve(resource);
        model.textEditorModel.setValue('Hello World');
        await timeout(10); // history debounces change events
        await editorService.openEditor({ resource: otherResource });
        const onDidActiveEditorChange = new DeferredPromise();
        disposables.add(editorService.onDidActiveEditorChange(e => {
            onDidActiveEditorChange.complete(e);
        }));
        historyService.goLast(1 /* GoFilter.EDITS */);
        await onDidActiveEditorChange.p;
        assert.strictEqual(editorService.activeEditor?.resource?.toString(), resource.toString());
        return workbenchTeardown(instantiationService);
    });
    test('reopen closed editor', async function () {
        const [, historyService, editorService, , instantiationService] = await createServices();
        const resource = toResource.call(this, '/path/index.txt');
        const pane = await editorService.openEditor({ resource });
        await pane?.group.closeAllEditors();
        const onDidActiveEditorChange = new DeferredPromise();
        disposables.add(editorService.onDidActiveEditorChange(e => {
            onDidActiveEditorChange.complete(e);
        }));
        historyService.reopenLastClosedEditor();
        await onDidActiveEditorChange.p;
        assert.strictEqual(editorService.activeEditor?.resource?.toString(), resource.toString());
        return workbenchTeardown(instantiationService);
    });
    test('getHistory', async () => {
        class TestFileEditorInputWithUntyped extends TestFileEditorInput {
            toUntyped() {
                return {
                    resource: this.resource,
                    options: {
                        override: 'testOverride'
                    }
                };
            }
        }
        const [part, historyService, editorService, , instantiationService] = await createServices(undefined, true);
        let history = historyService.getHistory();
        assert.strictEqual(history.length, 0);
        const input1 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar1/node_modules/test.txt'), TEST_EDITOR_INPUT_ID));
        await part.activeGroup.openEditor(input1, { pinned: true });
        const input2 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar2'), TEST_EDITOR_INPUT_ID));
        await part.activeGroup.openEditor(input2, { pinned: true });
        const input3 = disposables.add(new TestFileEditorInputWithUntyped(URI.parse('foo://bar3'), TEST_EDITOR_INPUT_ID));
        await part.activeGroup.openEditor(input3, { pinned: true });
        const input4 = disposables.add(new TestFileEditorInputWithUntyped(URI.file('bar4'), TEST_EDITOR_INPUT_ID));
        await part.activeGroup.openEditor(input4, { pinned: true });
        history = historyService.getHistory();
        assert.strictEqual(history.length, 4);
        // first entry is untyped because it implements `toUntyped` and has a supported scheme
        assert.strictEqual(isResourceEditorInput(history[0]) && !(history[0] instanceof EditorInput), true);
        assert.strictEqual(history[0].options?.override, 'testOverride');
        // second entry is not untyped even though it implements `toUntyped` but has unsupported scheme
        assert.strictEqual(history[1] instanceof EditorInput, true);
        assert.strictEqual(history[2] instanceof EditorInput, true);
        assert.strictEqual(history[3] instanceof EditorInput, true);
        historyService.removeFromHistory(input2);
        history = historyService.getHistory();
        assert.strictEqual(history.length, 3);
        assert.strictEqual(history[0].resource?.toString(), input4.resource.toString());
        input1.dispose(); // disposing the editor will apply `search.exclude` rules
        history = historyService.getHistory();
        assert.strictEqual(history.length, 2);
        // side by side
        const input5 = disposables.add(new TestFileEditorInputWithUntyped(URI.parse('file://bar5'), TEST_EDITOR_INPUT_ID));
        const input6 = disposables.add(new TestFileEditorInputWithUntyped(URI.file('file://bar1/node_modules/test.txt'), TEST_EDITOR_INPUT_ID));
        const input7 = new SideBySideEditorInput(undefined, undefined, input6, input5, editorService);
        await part.activeGroup.openEditor(input7, { pinned: true });
        history = historyService.getHistory();
        assert.strictEqual(history.length, 3);
        input7.dispose();
        history = historyService.getHistory();
        assert.strictEqual(history.length, 3); // only input5 survived, input6 is excluded via search.exclude
        return workbenchTeardown(instantiationService);
    });
    test('getLastActiveFile', async () => {
        const [part, historyService] = await createServices();
        assert.ok(!historyService.getLastActiveFile('foo'));
        const input1 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar1'), TEST_EDITOR_INPUT_ID));
        await part.activeGroup.openEditor(input1, { pinned: true });
        const input2 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar2'), TEST_EDITOR_INPUT_ID));
        await part.activeGroup.openEditor(input2, { pinned: true });
        assert.strictEqual(historyService.getLastActiveFile('foo')?.toString(), input2.resource.toString());
        assert.strictEqual(historyService.getLastActiveFile('foo', 'bar2')?.toString(), input2.resource.toString());
        assert.strictEqual(historyService.getLastActiveFile('foo', 'bar1')?.toString(), input1.resource.toString());
    });
    test('open next/previous recently used editor (single group)', async () => {
        const [part, historyService, editorService, , instantiationService] = await createServices();
        const input1 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar1'), TEST_EDITOR_INPUT_ID));
        const input2 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar2'), TEST_EDITOR_INPUT_ID));
        await part.activeGroup.openEditor(input1, { pinned: true });
        assert.strictEqual(part.activeGroup.activeEditor, input1);
        await part.activeGroup.openEditor(input2, { pinned: true });
        assert.strictEqual(part.activeGroup.activeEditor, input2);
        let editorChangePromise = Event.toPromise(editorService.onDidActiveEditorChange);
        historyService.openPreviouslyUsedEditor();
        await editorChangePromise;
        assert.strictEqual(part.activeGroup.activeEditor, input1);
        editorChangePromise = Event.toPromise(editorService.onDidActiveEditorChange);
        historyService.openNextRecentlyUsedEditor();
        await editorChangePromise;
        assert.strictEqual(part.activeGroup.activeEditor, input2);
        editorChangePromise = Event.toPromise(editorService.onDidActiveEditorChange);
        historyService.openPreviouslyUsedEditor(part.activeGroup.id);
        await editorChangePromise;
        assert.strictEqual(part.activeGroup.activeEditor, input1);
        editorChangePromise = Event.toPromise(editorService.onDidActiveEditorChange);
        historyService.openNextRecentlyUsedEditor(part.activeGroup.id);
        await editorChangePromise;
        assert.strictEqual(part.activeGroup.activeEditor, input2);
        return workbenchTeardown(instantiationService);
    });
    test('open next/previous recently used editor (multi group)', async () => {
        const [part, historyService, editorService, , instantiationService] = await createServices();
        const rootGroup = part.activeGroup;
        const input1 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar1'), TEST_EDITOR_INPUT_ID));
        const input2 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar2'), TEST_EDITOR_INPUT_ID));
        const sideGroup = part.addGroup(rootGroup, 3 /* GroupDirection.RIGHT */);
        await rootGroup.openEditor(input1, { pinned: true });
        await sideGroup.openEditor(input2, { pinned: true });
        let editorChangePromise = Event.toPromise(editorService.onDidActiveEditorChange);
        historyService.openPreviouslyUsedEditor();
        await editorChangePromise;
        assert.strictEqual(part.activeGroup, rootGroup);
        assert.strictEqual(rootGroup.activeEditor, input1);
        editorChangePromise = Event.toPromise(editorService.onDidActiveEditorChange);
        historyService.openNextRecentlyUsedEditor();
        await editorChangePromise;
        assert.strictEqual(part.activeGroup, sideGroup);
        assert.strictEqual(sideGroup.activeEditor, input2);
        return workbenchTeardown(instantiationService);
    });
    test('open next/previous recently is reset when other input opens', async () => {
        const [part, historyService, editorService, , instantiationService] = await createServices();
        const input1 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar1'), TEST_EDITOR_INPUT_ID));
        const input2 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar2'), TEST_EDITOR_INPUT_ID));
        const input3 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar3'), TEST_EDITOR_INPUT_ID));
        const input4 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar4'), TEST_EDITOR_INPUT_ID));
        await part.activeGroup.openEditor(input1, { pinned: true });
        await part.activeGroup.openEditor(input2, { pinned: true });
        await part.activeGroup.openEditor(input3, { pinned: true });
        let editorChangePromise = Event.toPromise(editorService.onDidActiveEditorChange);
        historyService.openPreviouslyUsedEditor();
        await editorChangePromise;
        assert.strictEqual(part.activeGroup.activeEditor, input2);
        await timeout(0);
        await part.activeGroup.openEditor(input4, { pinned: true });
        editorChangePromise = Event.toPromise(editorService.onDidActiveEditorChange);
        historyService.openPreviouslyUsedEditor();
        await editorChangePromise;
        assert.strictEqual(part.activeGroup.activeEditor, input2);
        editorChangePromise = Event.toPromise(editorService.onDidActiveEditorChange);
        historyService.openNextRecentlyUsedEditor();
        await editorChangePromise;
        assert.strictEqual(part.activeGroup.activeEditor, input4);
        return workbenchTeardown(instantiationService);
    });
    test('transient editors suspends editor change tracking', async () => {
        const [part, historyService, editorService, , instantiationService] = await createServices();
        const input1 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar1'), TEST_EDITOR_INPUT_ID));
        const input2 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar2'), TEST_EDITOR_INPUT_ID));
        const input3 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar3'), TEST_EDITOR_INPUT_ID));
        const input4 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar4'), TEST_EDITOR_INPUT_ID));
        const input5 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar5'), TEST_EDITOR_INPUT_ID));
        let editorChangePromise = Event.toPromise(editorService.onDidActiveEditorChange);
        await part.activeGroup.openEditor(input1, { pinned: true });
        assert.strictEqual(part.activeGroup.activeEditor, input1);
        await editorChangePromise;
        await part.activeGroup.openEditor(input2, { transient: true });
        assert.strictEqual(part.activeGroup.activeEditor, input2);
        await part.activeGroup.openEditor(input3, { transient: true });
        assert.strictEqual(part.activeGroup.activeEditor, input3);
        editorChangePromise = Event.toPromise(editorService.onDidActiveEditorChange)
            .then(() => Event.toPromise(editorService.onDidActiveEditorChange));
        await part.activeGroup.openEditor(input4, { pinned: true });
        assert.strictEqual(part.activeGroup.activeEditor, input4);
        await part.activeGroup.openEditor(input5, { pinned: true });
        assert.strictEqual(part.activeGroup.activeEditor, input5);
        // stack should be [input1, input4, input5]
        await historyService.goBack();
        assert.strictEqual(part.activeGroup.activeEditor, input4);
        await historyService.goBack();
        assert.strictEqual(part.activeGroup.activeEditor, input1);
        await historyService.goBack();
        assert.strictEqual(part.activeGroup.activeEditor, input1);
        await historyService.goForward();
        assert.strictEqual(part.activeGroup.activeEditor, input4);
        await historyService.goForward();
        assert.strictEqual(part.activeGroup.activeEditor, input5);
        return workbenchTeardown(instantiationService);
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaGlzdG9yeVNlcnZpY2UudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9oaXN0b3J5L3Rlc3QvYnJvd3Nlci9oaXN0b3J5U2VydmljZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsVUFBVSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDL0csT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxtQkFBbUIsRUFBRSxrQkFBa0IsRUFBRSxnQkFBZ0IsRUFBRSxzQkFBc0IsRUFBRSxtQkFBbUIsRUFBc0IsaUJBQWlCLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUUvUSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFDN0YsT0FBTyxFQUFFLG9CQUFvQixFQUFrQixNQUFNLCtDQUErQyxDQUFDO0FBQ3JHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxjQUFjLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUN4RixPQUFPLEVBQUUsY0FBYyxFQUFFLFVBQVUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUN6RSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDMUUsT0FBTyxFQUFxQixlQUFlLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUM3RSxPQUFPLEVBQUUsZUFBZSxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztB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R0FBRyxLQUFLLENBQUM7UUFFaEIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsU0FBUyxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFNUMsTUFBTSxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDckIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsU0FBUyxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDN0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsWUFBWSxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDL0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsU0FBUyxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFNUMsTUFBTSxLQUFLLENBQUMsU0FBUyxFQUFFLENBQUM7UUFDeEIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsU0FBUyxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDNUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsWUFBWSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFaEQsTUFBTSxLQUFLLENBQUMsVUFBVSxFQUFFLENBQUM7UUFDekIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsU0FBUyxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDN0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsWUFBWSxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFL0MsTUFBTSxLQUFLLENBQUMsVUFBVSxFQUFFLENBQUM7UUFDekIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsU0FBUyxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDNUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsWUFBWSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFaEQsTUFBTSxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDckIsTUFBTSxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDckIsTUFB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QUFDLFVBQVUsQ0FBQyxNQUFNLEVBQUUsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUM1RCxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsWUFBWSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBRTFELElBQUksbUJBQW1CLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxhQUFhLENBQUMsdUJBQXVCLENBQUMsQ0FBQztRQUNqRixjQUFjLENBQUMsd0JBQXdCLEVBQUUsQ0FBQztRQUMxQyxNQUFNLG1CQUFtQixDQUFDO1FBQzFCLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxZQUFZLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFFMUQsbUJBQW1CLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxhQUFhLENBQUMsdUJBQXVCLENBQUMsQ0FBQztRQUM3RSxjQUFjLENBQUMsMEJBQTBCLEVBQUUsQ0FBQztRQUM1QyxNQUFNLG1CQUFtQixDQUFDO1FBQzFCLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxZQUFZLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFFMUQsbUJBQW1CLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxhQUFhLENBQUMsdUJBQXVCLENBQUMsQ0FBQztRQUM3RSxjQUFjLENBQUMsd0JBQXdCLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUM3RCxNQUFNLG1CQUFtQixDQUFDO1FBQzFCLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxZQUFZLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFFMUQsbUJBQW1CLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxhQUFhLENBQUMsdUJBQXVCLENBQUMsQ0FBQztRQUM3RSxjQUFjLENBQUMsMEJBQTBCLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUMvRCxNQUFNLG1CQUFtQixDQUFDO1FBQzFCLE1B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
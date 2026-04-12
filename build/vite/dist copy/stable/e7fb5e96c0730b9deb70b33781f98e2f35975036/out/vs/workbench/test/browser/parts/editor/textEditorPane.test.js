/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite, toResource } from '../../../../../base/test/common/utils.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { workbenchInstantiationService, TestServiceAccessor, registerTestFileEditor, createEditorPart } from '../../workbenchTestServices.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { EditorService } from '../../../../services/editor/browser/editorService.js';
import { isEditorPaneWithSelection } from '../../../../common/editor.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { TextEditorPaneSelection } from '../../../../browser/parts/editor/textEditor.js';
import { Selection } from '../../../../../editor/common/core/selection.js';
suite('TextEditorPane', () => {
    const disposables = new DisposableStore();
    setup(() => {
        disposables.add(registerTestFileEditor());
    });
    teardown(() => {
        disposables.clear();
    });
    async function createServices() {
        const instantiationService = workbenchInstantiationService(undefined, disposables);
        const part = await createEditorPart(instantiationService, disposables);
        instantiationService.stub(IEditorGroupsService, part);
        const editorService = disposables.add(instantiationService.createInstance(EditorService, undefined));
        instantiationService.stub(IEditorService, editorService);
        return instantiationService.createInstance(TestServiceAccessor);
    }
    test('editor pane selection', async function () {
        const accessor = await createServices();
        const resource = toResource.call(this, '/path/index.txt');
        let pane = await accessor.editorService.openEditor({ resource });
        assert.ok(pane && isEditorPaneWithSelection(pane));
        const onDidFireSelectionEventOfEditType = new DeferredPromise();
        disposables.add(pane.onDidChangeSelection(e => {
            if (e.reason === 3 /* EditorPaneSelectionChangeReason.EDIT */) {
                onDidFireSelectionEventOfEditType.complete(e);
            }
        }));
        // Changing model reports selection change
        // of EDIT kind
        const model = disposables.add(await accessor.textFileService.files.resolve(resource));
        model.textEditorModel.setValue('Hello World');
        const event = await onDidFireSelectionEventOfEditType.p;
        assert.strictEqual(event.reason, 3 /* EditorPaneSelectionChangeReason.EDIT */);
        // getSelection() works and can be restored
        //
        // Note: this is a bit bogus because in tests our code editors have
        //       no view and no cursor can be set as such. So the selection
        //       will always report for the first line and column.
        pane.setSelection(new Selection(1, 1, 1, 1), 2 /* EditorPaneSelectionChangeReason.USER */);
        const selection = pane.getSelection();
        assert.ok(selection);
        await pane.group.closeAllEditors();
        const options = selection.restore({});
        pane = await accessor.editorService.openEditor({ resource, options });
        assert.ok(pane && isEditorPaneWithSelection(pane));
        const newSelection = pane.getSelection();
        assert.ok(newSelection);
        assert.strictEqual(newSelection.compare(selection), 1 /* EditorPaneSelectionCompareResult.IDENTICAL */);
        await model.revert();
        await pane.group.closeAllEditors();
    });
    test('TextEditorPaneSelection', function () {
        const sel1 = new TextEditorPaneSelection(new Selection(1, 1, 2, 2));
        const sel2 = new TextEditorPaneSelection(new Selection(5, 5, 6, 6));
        const sel3 = new TextEditorPaneSelection(new Selection(50, 50, 60, 60));
        const sel4 = { compare: () => { throw new Error(); }, restore: (options) => options };
        assert.strictEqual(sel1.compare(sel1), 1 /* EditorPaneSelectionCompareResult.IDENTICAL */);
        assert.strictEqual(sel1.compare(sel2), 2 /* EditorPaneSelectionCompareResult.SIMILAR */);
        assert.strictEqual(sel1.compare(sel3), 3 /* EditorPaneSelectionCompareResult.DIFFERENT */);
        assert.strictEqual(sel1.compare(sel4), 3 /* EditorPaneSelectionCompareResult.DIFFERENT */);
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dEVkaXRvclBhbmUudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC90ZXN0L2Jyb3dzZXIvcGFydHMvZWRpdG9yL3RleHRFZGl0b3JQYW5lLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxVQUFVLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUMvRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDckYsT0FBTyxFQUFFLDZCQUE2QixFQUFFLG1CQUFtQixFQUFFLHNCQUFzQixFQUFFLGdCQUFnQixFQUFzQixNQUFNLGdDQUFnQyxDQUFDO0FBRWxLLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQ2pHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDckYsT0FBTyxFQUFzRyx5QkFBeUIsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQzdLLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUN6RixPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFHM0UsS0FBSyxDQUFDLGdCQUFnQixFQUFFLEdBQUcsRUFBRTtJQUU1QixNQUFNLFdBQVcsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO0lBRTFDLEtBQUssQ0FBQyxHQUFHLEVBQUU7UUFDVixXQUFXLENBQUMsR0FBRyxDQUFDLHNCQUFzQixFQUFFLENBQUMsQ0FBQztJQUMzQyxDQUFDLENBQUMs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
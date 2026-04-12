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
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { NotebookEditorWidgetService } from '../../browser/services/notebookEditorServiceImpl.js';
import { NotebookEditorInput } from '../../common/notebookEditorInput.js';
import { setupInstantiationService } from './testNotebookEditor.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
let TestNotebookEditorWidgetService = class TestNotebookEditorWidgetService extends NotebookEditorWidgetService {
    constructor(editorGroupService, editorService, contextKeyService, instantiationService) {
        super(editorGroupService, editorService, contextKeyService, instantiationService);
    }
    createWidget() {
        return new class extends mock() {
            constructor() {
                super(...arguments);
                this.onWillHide = () => { };
                this.getDomNode = () => { return { remove: () => { } }; };
                this.dispose = () => { };
            }
        };
    }
};
TestNotebookEditorWidgetService = __decorate([
    __param(0, IEditorGroupsService),
    __param(1, IEditorService),
    __param(2, IContextKeyService),
    __param(3, IInstantiationService)
], TestNotebookEditorWidgetService);
function createNotebookInput(path, editorType) {
    return new class extends mock() {
        constructor() {
            super(...arguments);
            this.resource = URI.parse(path);
        }
        get typeId() { return editorType; }
    };
}
suite('NotebookEditorWidgetService', () => {
    let disposables;
    let instantiationService;
    let editorGroup1;
    let editorGroup2;
    let ondidRemoveGroup;
    let onDidCloseEditor;
    let onWillMoveEditor;
    teardown(() => disposables.dispose());
    ensureNoDisposablesAreLeakedInTestSuite();
    setup(() => {
        disposables = new DisposableStore();
        ondidRemoveGroup = new Emitter();
        onDidCloseEditor = new Emitter();
        onWillMoveEditor = new Emitter();
        editorGroup1 = new class extends mock() {
            constructor() {
                super(...arguments);
                this.id = 1;
                this.onDidCloseEditor = onDidCloseEditor.event;
                this.onWillMoveEditor = onWillMoveEditor.event;
            }
        };
        editorGroup2 = new class extends mock() {
            constructor() {
                super(...arguments);
                this.id = 2;
                this.onDidCloseEditor = Event.None;
                this.onWillMoveEditor = Event.None;
            }
        };
        instantiationService = setupInstantiationService(disposables);
        instantiationService.stub(IEditorGroupsService, new class extends mock() {
            constructor() {
                super(...arguments);
                this.onDidRemoveGroup = ondidRemoveGroup.event;
                this.onDidAddGroup = Event.None;
                this.whenReady = Promise.resolve();
                this.groups = [editorGroup1, editorGroup2];
            }
            getPart(container) {
                return { windowId: 0 };
            }
        });
        instantiationService.stub(IEditorService, new class extends mock() {
            constructor() {
                super(...arguments);
                this.onDidEditorsChange = Event.None;
            }
        });
    });
    test('Retrieve widget within group', async function () {
        const notebookEditorInput = createNotebookInput('/test.np', 'type1');
        const notebookEditorService = disposables.add(instantiationService.createInstance(TestNotebookEditorWidgetService));
        const widget = notebookEditorService.retrieveWidget(instantiationService, 1, notebookEditorInput);
        const value = widget.value;
        const widget2 = notebookEditorService.retrieveWidget(instantiationService, 1, notebookEditorInput);
        assert.notStrictEqual(widget2.value, undefined, 'should create a widget');
        assert.strictEqual(value, widget2.value, 'should return the same widget');
        assert.strictEqual(widget.value, undefined, 'initial borrow should no longer have widget');
    });
    test('Retrieve independent widgets', async function () {
        const inputType1 = createNotebookInput('/test.np', 'type1');
        const inputType2 = createNotebookInput('/test.np', 'type2');
        const notebookEditorService = disposables.add(instantiationService.createInstance(TestNotebookEditorWidgetService));
        const widget = notebookEditorService.retrieveWidget(instantiationService, 1, inputType1);
        const widgetDiffGroup = notebookEditorService.retrieveWidget(instantiationService, 2, inputType1);
        const widgetDiffType = notebookEditorService.retrieveWidget(instantiationService, 1, inputType2);
        assert.notStrictEqual(widget.value, undefined, 'should create a widget');
        assert.notStrictEqual(widgetDiffGroup.value, undefined, 'should create a widget');
        assert.notStrictEqual(widgetDiffType.value, undefined, 'should create a widget');
        assert.notStrictEqual(widget.value, widgetDiffGroup.value, 'should return a different widget');
        assert.notStrictEqual(widget.value, widgetDiffType.value, 'should return a different widget');
    });
    test('Only relevant widgets get disposed', async function () {
        const inputType1 = createNotebookInput('/test.np', 'type1');
        const inputType2 = createNotebookInput('/test.np', 'type2');
        const notebookEditorService = disposables.add(instantiationService.createInstance(TestNotebookEditorWidgetService));
        const widget = notebookEditorService.retrieveWidget(instantiationService, 1, inputType1);
        const widgetDiffType = notebookEditorService.retrieveWidget(instantiationService, 1, inputType2);
        const widgetDiffGroup = notebookEditorService.retrieveWidget(instantiationService, 2, inputType1);
        ondidRemoveGroup.fire(editorGroup1);
        assert.strictEqual(widget.value, undefined, 'widgets in group should get disposed');
        assert.strictEqual(widgetDiffType.value, undefined, 'widgets in group should get disposed');
        assert.notStrictEqual(widgetDiffGroup.value, undefined, 'other group should not be disposed');
        notebookEditorService.dispose();
    });
    test('Widget should move between groups when editor is moved', async function () {
        const inputType1 = createNotebookInput('/test.np', NotebookEditorInput.ID);
        const notebookEditorService = disposables.add(instantiationService.createInstance(TestNotebookEditorWidgetService));
        const initialValue = notebookEditorService.retrieveWidget(instantiationService, 1, inputType1).value;
        await new Promise(resolve => setTimeout(resolve, 0));
        onWillMoveEditor.fire({
            editor: inputType1,
            groupId: 1,
            target: 2,
        });
        const widgetDiffGroup = notebookEditorService.retrieveWidget(instantiationService, 2, inputType1);
        const widgetFirstGroup = notebookEditorService.retrieveWidget(instantiationService, 1, inputType1);
        assert.notStrictEqual(initialValue, undefined, 'valid widget');
        assert.strictEqual(widgetDiffGroup.value, initialValue, 'widget should be reused in new group');
        assert.notStrictEqual(widgetFirstGroup.value, initialValue, 'should create a new widget in the first group');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTm90ZWJvb2tFZGl0b3JXaWRnZXRTZXJ2aWNlLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay90ZXN0L2Jyb3dzZXIvTm90ZWJvb2tFZGl0b3JXaWRnZXRTZXJ2aWNlLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDckUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDL0QsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDN0YsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFJdEcsT0FBTyxFQUFFLDJCQUEyQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFDbEcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDMUUsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDcEUsT0FBTyxFQUFnQixvQkFBb0IsRUFBZSxNQUFNLDJEQUEyRCxDQUFDO0FBQzVILE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUVyRixJQUFNLCtCQUErQixHQUFyQyxNQUFNLCtCQUFnQyxTQUFRLDJCQUEyQjtJQUN4RSxZQUN1QixrQkFBd0MsRUFDOUMsYUFBNkIsRUFDekIsaUJBQXFDLEVBQ2xDLG9CQUEyQztRQUVsRSxLQUFLLENBQUMsa0JBQWtCLEVBQUUsYUFBYSxFQUFFLGlCQUFpQixFQUFFLG9CQUFvQixDQUFDLENBQUM7SUFDbkYsQ0FBQztJQUVrQixZQUFZO1FBQzlCLE9BQU8sSUFBSSxLQUFNLFNBQVEsSUFBSSxFQUF3QjtZQUExQzs7Z0JBQ0QsZUFBVSxHQUFHLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQztnQkFDdkIsZUFBVSxHQUFHLEdBQUcsRUFBRSxHQUFHLE9BQU8sRUFBRSxNQUFNLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxFQUFpQixDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNwRSxZQUFPLEdBQUcsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1lBQzlCLENBQUM7U0FBQSxDQUFDO0lBQ0gsQ0FBQztDQUNELENBQUE7QUFqQkssK0JBQStCO0lBRWxDLFdBQUEsb0JBQW9CLENBQUE7SUFDcEIsV0FBQSxjQUFjLENBQUE7SUFDZCxXQUFBLGtCQUFrQixDQUFBO0lBQ2xCLFdBQUEscUJBQXFCLENBQUE7R0FMbEIsK0JBQStCLENBaUJwQztBQUVELFNBQVMsbUJBQW1CLENBQUMsSUFBWSxFQUFFLFVBQWtCO0lBQzVELE9BQU8sSUFBSSxLQUFNLFNBQVEsSUFBSSxFQUF1QjtRQUF6Qzs7WUFDRCxhQUFRLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUVyQyxDQUFDO1FBREEsSUFBYSxNQUFNLEtBQUssT0FBTyxVQUFVLENBQUMsQ0FBQyxDQUFDO0tBQzVDLENBQUM7QUFDSCxDQUFDO0FBRUQsS0FBSyxDQUFDLDZCQUE2QixFQUFFLEdBQUcsRUFBRTtJQUN6QyxJQUFJLFdBQTRCLENBQUM7SUFDakMsSUFBSSxvQkFBOEMsQ0FBQztJQUNuRCxJQUFJLFlBQTBCLENBQUM7SUFDL0IsSUFBSSxZQUEwQixDQUFDO0lBRS9CLElBQUksZ0JBQXVDLENBQUM7SUFDNUMsSUFBSSxnQkFBNEMsQ0FBQztJQUNqRCxJQUFJLGdCQUErQyxDQUFDO0lBQ3BELFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxXQUFXLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztJQUV0Qyx1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLEtBQUssQ0FBQyxHQUFHLEVBQUU7UUFDVixXQUFXLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztRQUVwQyxnQkFBZ0IsR0FBRyxJQUFJLE9BQU8sRUFBZ0IsQ0FBQztRQUMvQyxnQkFBZ0IsR0FBRyxJQUFJLE9BQU8sRUFBcUIsQ0FBQztRQUNwRCxnQkFBZ0IsR0FBRyxJQUFJLE9BQU8sRUFBd0IsQ0FBQztRQUV2RCxZQUFZLEdBQUcsSUFBSSxLQUFNLFNBQVEsSUFBSSxFQUFnQjtZQUFsQzs7Z0JBQ1QsT0FBRSxHQUFHLENBQUMsQ0FBQztnQkFDUCxxQkFBZ0IsR0FBRyxnQkFBZ0IsQ0FBQyxLQUFLLENBQUM7Z0JBQzFDLHFCQUFnQixHQUFHLGdCQUFnQixDQUFDLEtBQUssQ0FBQztZQUNwRCxDQUFDO1NBQUEsQ0FBQztRQUNGLFlBQVksR0FBRyxJQUFJLEtBQU0sU0FBUSxJQUFJLEVBQWdCO1lBQWxDOztnQkFDVCxPQUFFLEdBQUcsQ0FBQyxDQUFDO2dCQUNQLHFCQUFnQixHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7Z0JBQzlCLHFCQUFnQixHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7WUFDeEMsQ0FBQztTQUFBLENBQUM7UUFFRixvQkFBb0IsR0FBRyx5QkFBeUIsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUM5RCxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLEVBQUUsSUFBSSxLQUFNLFNBQVEsSUFBSSxFQUF3QjtZQUExQzs7Z0JBQzFDLHFCQUFnQixHQUFHLGdCQUFnQixDQUFDLEtBQUssQ0FBQztnQkFDMUMsa0JBQWEsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO2dCQUMzQixjQUFTLEdBQUcsT0FBTyxDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUM5QixXQUFNLEdBQUcsQ0FBQyxZQUFZLEVBQUUsWUFBWSxDQUFDLENBQUM7WUFNaEQsQ0FBQztZQUhTLE9BQU8sQ0FBQyxTQUFrQjtnQkFDbEMsT0FBTyxFQUFFLFFBQVEsRUFBRSxDQUFDLEVBQWlCLENBQUM7WUFDdkMsQ0FBQztTQUNELENBQUMsQ0FBQztRQUNILG9CQUFvQixDQUFDLElBQUksQ0FBQyxjQUFjLEVBQUUsSUFBSSxLQUFNLFNBQVEsSUFBSSxFQUFrQjtZQUFwQzs7Z0JBQ3BDLHVCQUFrQixHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7WUFDMUMsQ0FBQztTQUFBLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDhCQUE4QixFQUFFLEtBQUs7UUFDekMsTUFBTSxtQkFBbUIsR0FBRyxtQkFBbUIsQ0FBQyxVQUFVLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDckUsTUFBTSxxQkFBcUIsR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FBQywrQkFBK0IsQ0FBQyxDQUFDLENBQUM7UUFDcEgsTUFBTSxNQUFNLEdBQUcscUJBQXFCLENBQUMsY0FBYyxDQUFDLG9CQUFvQixFQUFFLENBQUMsRUFBRSxtQkFBbUIsQ0FBQyxDQUFDO1FBQ2xHLE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUM7UUFDM0IsTUFBTSxPQUFPLEdBQUcscUJBQXFCLENBQUMsY0FBYyxDQUFDLG9CQUFvQixFQUFFLENBQUMsRUFBRSxtQkFBbUIsQ0FBQyxDQUFDO1FBRW5HLE1BQU0sQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxTQUFTLEVBQUUsd0JBQXdCLENBQUMsQ0FBQztRQUMxRSxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssRUFBRSxPQUFPLENBQUMsS0FBSyxFQUFFLCtCQUErQixDQUFDLENBQUM7UUFDMUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLFNBQVMsRUFBRSw2Q0FBNkMsQ0FBQyxDQUFDO0lBQzVGLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDhCQUE4QixFQUFFLEtBQUs7UUFDekMsTUFBTSxVQUFVLEdBQUcsbUJBQW1CLENBQUMsVUFBVSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQzVELE1BQU0sVUFBVSxHQUFHLG1CQUFtQixDQUFDLFVBQVUsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUM1RCxNQUFNLHFCQUFxQixHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLCtCQUErQixDQUFDLENBQUMsQ0FBQztRQUNwSCxNQUFNLE1BQU0sR0FBRyxxQkFBcUIsQ0FBQyxjQUFjLENBQUMsb0JBQW9CLEVBQUUsQ0FBQyxFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBQ3pGLE1BQU0sZUFBZSxHQUFHLHFCQUFxQixDQUFDLGNBQWMsQ0FBQyxvQkFBb0IsRUFBRSxDQUFDLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDbEcsTUFBTSxjQUFjLEdBQUcscUJBQXFCLENBQUMsY0FBYyxDQUFDLG9CQUFvQixFQUFFLENBQUMsRUFBRSxVQUFVLENBQUMsQ0FBQztRQUVqRyxNQUFNLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsU0FBUyxFQUFFLHdCQUF3QixDQUFDLENBQUM7UUFDekUsTUFBTSxDQUFDLGNBQWMsQ0FBQyxlQUFlLENBQUMsS0FBSyxFQUFFLFNBQVMsRUFBRSx3QkFBd0IsQ0FBQyxDQUFDO1FBQ2xGLE1BQU0sQ0FBQyxjQUFjLENBQUMsY0FBYyxDQUFDLEtBQUssRUFBRSxTQUFTLEVBQUUsd0JBQXdCLENBQUMsQ0FBQztRQUNqRixNQUFNLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsZUFBZSxDQUFDLEtBQUssRUFBRSxrQ0FBa0MsQ0FBQyxDQUFDO1FBQy9GLE1BQU0sQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxjQUFjLENBQUMsS0FBSyxFQUFFLGtDQUFrQyxDQUFDLENBQUM7SUFDL0YsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsb0NBQW9DLEVBQUUsS0FBSztRQUMvQyxNQUFNLFVBQVUsR0FBRyxtQkFBbUIsQ0FBQyxVQUFVLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDNUQsTUFBTSxVQUFVLEdBQUcsbUJBQW1CLENBQUMsVUFBVSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQzVELE1BQU0scUJBQXFCLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsK0JBQStCLENBQUMsQ0FBQyxDQUFDO1FBQ3BILE1BQU0sTUFBTSxHQUFHLHFCQUFxQixDQUFDLGNBQWMsQ0FBQyxvQkFBb0IsRUFBRSxDQUFDLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDekYsTUFBTSxjQUFjLEdBQUcscUJBQXFCLENBQUMsY0FBYyxDQUFDLG9CQUFvQixFQUFFLENBQUMsRUFBRSxVQUFVLENBQUMsQ0FBQztRQUNqRyxNQUFNLGVBQWUsR0FBRyxxQkFBcUIsQ0FBQyxjQUFjLENBQUMsb0JBQW9CLEVBQUUsQ0FBQyxFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBRWxHLGdCQUFnQixDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUVwQyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsU0FBUyxFQUFFLHNDQUFzQyxDQUFDLENBQUM7UUFDcEYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxjQUFjLENBQUMsS0FBSyxFQUFFLFNBQVMsRUFBRSxzQ0FBc0MsQ0FBQyxDQUFDO1FBQzVGLE1BQU0sQ0FBQyxjQUFjLENBQUMsZUFBZSxDQUFDLEtBQUssRUFBRSxTQUFTLEVBQUUsb0NBQW9DLENBQUMsQ0FBQztRQUU5RixxQkFBcUIsQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUNqQyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx3REFBd0QsRUFBRSxLQUFLO1FBQ25FLE1BQU0sVUFBVSxHQUFHLG1CQUFtQixDQUFDLFVBQVUsRUFBRSxtQkFBbUIsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUMzRSxNQUFNLHFCQUFxQixHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLCtCQUErQixDQUFDLENBQUMsQ0FBQztRQUNwSCxNQUFNLFlBQVksR0FBRyxxQkFBcUIsQ0FBQyxjQUFjLENBQUMsb0JBQW9CLEVBQUUsQ0FBQyxFQUFFLFVBQVUsQ0FBQyxDQUFDLEtBQUssQ0FBQztRQUVyRyxNQUFNLElBQUksT0FBTyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRXJELGdCQUFnQixDQUFDLElBQUksQ0FBQztZQUNyQixNQUFNLEVBQUUsVUFBVTtZQUNsQixPQUFPLEVBQUUsQ0FBQztZQUNWLE1BQU0sRUFBRSxDQUFDO1NBQ1QsQ0FBQyxDQUFDO1FBRUgsTUFBTSxlQUFlLEdBQUcscUJBQXFCLENBQUMsY0FBYyxDQUFDLG9CQUFvQixFQUFFLENBQUMsRUFBRSxVQUFVLENBQUMsQ0FBQztRQUNsRyxNQUFNLGdCQUFnQixHQUFHLHFCQUFxQixDQUFDLGNBQWMsQ0FBQyxvQkFBb0IsRUFBRSxDQUFDLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFFbkcsTUFBTSxDQUFDLGNBQWMsQ0FBQyxZQUFZLEVBQUUsU0FBUyxFQUFFLGNBQWMsQ0FBQyxDQUFDO1FBQy9ELE1BQU0sQ0FBQyxXQUFXLENBQUMsZUFBZSxDQUFDLEtBQUssRUFBRSxZQUFZLEVBQUUsc0NBQXNDLENBQUMsQ0FBQztRQUNoRyxNQUFNLENBQUMsY0FBYyxDQUFDLGdCQUFnQixDQUFDLEtBQUssRUFBRSxZQUFZLEVBQUUsK0NBQStDLENBQUMsQ0FBQztJQUM5RyxDQUFDLENBQUMsQ0FBQztBQUVKLENBQUMsQ0FBQyxDQUFDIn0=
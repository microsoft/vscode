/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import assert from 'assert';
import { Emitter, Event } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { mock } from 'vs/base/test/common/mock';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { GroupIdentifier, IEditorCloseEvent, IEditorWillMoveEvent } from 'vs/workbench/common/editor';
import { NotebookEditorWidget } from 'vs/workbench/contrib/notebook/browser/notebookEditorWidget';
import { NotebookEditorWidgetService } from 'vs/workbench/contrib/notebook/browser/services/notebookEditorServiceImpl';
import { NotebookEditorInput } from 'vs/workbench/contrib/notebook/common/notebookEditorInput';
import { setupInstantiationService } from 'vs/workbench/contrib/notebook/test/browser/testNotebookEditor';
import { IEditorGroup, IEditorGroupsService, IEditorPart } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

class TestNotebookEditorWidgetService extends NotebookEditorWidgetService {
	constructor(
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IEditorService editorService: IEditorService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(editorGroupService, editorService, contextKeyService, instantiationService);
	}

	protected override createWidget(): NotebookEditorWidget {
		return new class extends mock<NotebookEditorWidget>() {
			override onWillHide = () => { };
			override getDomNode = () => { return { remove: () => { } } as any; };
			override dispose = () => { };
		};
	}
}

function createNotebookInput(path: string, editorType: string) {
	return new class extends mock<NotebookEditorInput>() {
		override resource = URI.parse(path);
		override get typeId() { return editorType; }
	};
}

suite('NotebookEditorWidgetService', () => {
	let disposables: DisposableStore;
	let instantiationService: TestInstantiationService;
	let editorGroup1: IEditorGroup;
	let editorGroup2: IEditorGroup;

	let ondidRemoveGroup: Emitter<IEditorGroup>;
	let onDidCloseEditor: Emitter<IEditorCloseEvent>;
	let onWillMoveEditor: Emitter<IEditorWillMoveEvent>;
	teardown(() => disposables.dispose());

	ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		disposables = new DisposableStore();

		ondidRemoveGroup = new Emitter<IEditorGroup>();
		onDidCloseEditor = new Emitter<IEditorCloseEvent>();
		onWillMoveEditor = new Emitter<IEditorWillMoveEvent>();

		editorGroup1 = new class extends mock<IEditorGroup>() {
			override id = 1;
			override onDidCloseEditor = onDidCloseEditor.event;
			override onWillMoveEditor = onWillMoveEditor.event;
		};
		editorGroup2 = new class extends mock<IEditorGroup>() {
			override id = 2;
			override onDidCloseEditor = Event.None;
			override onWillMoveEditor = Event.None;
		};

		instantiationService = setupInstantiationService(disposables);
		instantiationService.stub(IEditorGroupsService, new class extends mock<IEditorGroupsService>() {
			override onDidRemoveGroup = ondidRemoveGroup.event;
			override onDidAddGroup = Event.None;
			override whenReady = Promise.resolve();
			override groups = [editorGroup1, editorGroup2];
			override getPart(group: IEditorGroup | GroupIdentifier): IEditorPart;
			override getPart(container: unknown): IEditorPart;
			override getPart(container: unknown): import("vs/workbench/services/editor/common/editorGroupsService").IEditorPart {
				return { windowId: 0 } as any;
			}
		});
		instantiationService.stub(IEditorService, new class extends mock<IEditorService>() {
			override onDidEditorsChange = Event.None;
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

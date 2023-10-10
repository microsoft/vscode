/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite, toResource } from 'vs/base/test/common/utils';
import { URI } from 'vs/base/common/uri';
import { workbenchInstantiationService, TestFileEditorInput, registerTestEditor, createEditorPart, registerTestFileEditor, TestServiceAccessor, TestTextFileEditor, workbenchTeardown } from 'vs/workbench/test/browser/workbenchTestServices';
import { EditorPart } from 'vs/workbench/browser/parts/editor/editorPart';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IEditorGroupsService, GroupDirection } from 'vs/workbench/services/editor/common/editorGroupsService';
import { EditorNavigationStack, HistoryService } from 'vs/workbench/services/history/browser/historyService';
import { IEditorService, SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { EditorService } from 'vs/workbench/services/editor/browser/editorService';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { GoFilter, GoScope, IHistoryService } from 'vs/workbench/services/history/common/history';
import { DeferredPromise, timeout } from 'vs/base/common/async';
import { Event } from 'vs/base/common/event';
import { EditorPaneSelectionChangeReason, isResourceEditorInput, IUntypedEditorInput } from 'vs/workbench/common/editor';
import { IResourceEditorInput, ITextEditorOptions } from 'vs/platform/editor/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { IResolvedTextFileEditorModel, ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { FileChangesEvent, FileChangeType, FileOperation, FileOperationEvent } from 'vs/platform/files/common/files';
import { isLinux } from 'vs/base/common/platform';
import { Selection } from 'vs/editor/common/core/selection';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

suite('HistoryService', function () {

	const TEST_EDITOR_ID = 'MyTestEditorForEditorHistory';
	const TEST_EDITOR_INPUT_ID = 'testEditorInputForHistoyService';

	async function createServices(scope = GoScope.DEFAULT): Promise<[EditorPart, HistoryService, EditorService, ITextFileService, IInstantiationService]> {
		const instantiationService = workbenchInstantiationService(undefined, disposables);

		const part = await createEditorPart(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, part);

		const editorService = disposables.add(instantiationService.createInstance(EditorService));
		instantiationService.stub(IEditorService, editorService);

		const configurationService = new TestConfigurationService();
		if (scope === GoScope.EDITOR_GROUP) {
			configurationService.setUserConfiguration('workbench.editor.navigationScope', 'editorGroup');
		} else if (scope === GoScope.EDITOR) {
			configurationService.setUserConfiguration('workbench.editor.navigationScope', 'editor');
		}
		instantiationService.stub(IConfigurationService, configurationService);

		const historyService = disposables.add(instantiationService.createInstance(HistoryService));
		instantiationService.stub(IHistoryService, historyService);

		const accessor = instantiationService.createInstance(TestServiceAccessor);

		return [part, historyService, editorService, accessor.textFileService, instantiationService];
	}

	const disposables = new DisposableStore();

	setup(() => {
		disposables.add(registerTestEditor(TEST_EDITOR_ID, [new SyncDescriptor(TestFileEditorInput)]));
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

		const resource: URI = toResource.call(this, '/path/index.txt');
		const otherResource: URI = toResource.call(this, '/path/other.html');

		const pane1 = await editorService.openEditor({ resource, options: { pinned: true } });
		const pane2 = await editorService.openEditor({ resource, options: { pinned: true } }, SIDE_GROUP);

		// [index.txt] | [>index.txt<]

		assert.notStrictEqual(pane1, pane2);

		await editorService.openEditor({ resource: otherResource, options: { pinned: true } }, pane2?.group);

		// [index.txt] | [index.txt] [>other.html<]

		await historyService.goBack();

		// [index.txt] | [>index.txt<] [other.html]

		assert.strictEqual(part.activeGroup.id, pane2?.group?.id);
		assert.strictEqual(part.activeGroup.activeEditor?.resource?.toString(), resource.toString());

		await historyService.goBack();

		// [>index.txt<] | [index.txt] [other.html]

		assert.strictEqual(part.activeGroup.id, pane1?.group?.id);
		assert.strictEqual(part.activeGroup.activeEditor?.resource?.toString(), resource.toString());

		await historyService.goForward();

		// [index.txt] | [>index.txt<] [other.html]

		assert.strictEqual(part.activeGroup.id, pane2?.group?.id);
		assert.strictEqual(part.activeGroup.activeEditor?.resource?.toString(), resource.toString());

		await historyService.goForward();

		// [index.txt] | [index.txt] [>other.html<]

		assert.strictEqual(part.activeGroup.id, pane2?.group?.id);
		assert.strictEqual(part.activeGroup.activeEditor?.resource?.toString(), otherResource.toString());

		return workbenchTeardown(instantiationService);
	});

	test('back / forward: in-editor text selection changes (user)', async function () {
		const [, historyService, editorService, , instantiationService] = await createServices();

		const resource = toResource.call(this, '/path/index.txt');

		const pane = await editorService.openEditor({ resource, options: { pinned: true } }) as TestTextFileEditor;

		await setTextSelection(historyService, pane, new Selection(1, 2, 1, 2));
		await setTextSelection(historyService, pane, new Selection(15, 1, 15, 1)); // will be merged and dropped
		await setTextSelection(historyService, pane, new Selection(16, 1, 16, 1)); // will be merged and dropped
		await setTextSelection(historyService, pane, new Selection(17, 1, 17, 1));
		await setTextSelection(historyService, pane, new Selection(30, 5, 30, 8));
		await setTextSelection(historyService, pane, new Selection(40, 1, 40, 1));

		await historyService.goBack(GoFilter.NONE);
		assertTextSelection(new Selection(30, 5, 30, 8), pane);

		await historyService.goBack(GoFilter.NONE);
		assertTextSelection(new Selection(17, 1, 17, 1), pane);

		await historyService.goBack(GoFilter.NONE);
		assertTextSelection(new Selection(1, 2, 1, 2), pane);

		await historyService.goForward(GoFilter.NONE);
		assertTextSelection(new Selection(17, 1, 17, 1), pane);

		return workbenchTeardown(instantiationService);
	});

	test('back / forward: in-editor text selection changes (navigation)', async function () {
		const [, historyService, editorService, , instantiationService] = await createServices();

		const resource = toResource.call(this, '/path/index.txt');

		const pane = await editorService.openEditor({ resource, options: { pinned: true } }) as TestTextFileEditor;

		await setTextSelection(historyService, pane, new Selection(2, 2, 2, 10)); // this is our starting point
		await setTextSelection(historyService, pane, new Selection(5, 3, 5, 20), EditorPaneSelectionChangeReason.NAVIGATION); // this is our first target definition
		await setTextSelection(historyService, pane, new Selection(120, 8, 120, 18), EditorPaneSelectionChangeReason.NAVIGATION); // this is our second target definition
		await setTextSelection(historyService, pane, new Selection(300, 3, 300, 20)); // unrelated user navigation
		await setTextSelection(historyService, pane, new Selection(500, 3, 500, 20)); // unrelated user navigation
		await setTextSelection(historyService, pane, new Selection(200, 3, 200, 20)); // unrelated user navigation

		await historyService.goBack(GoFilter.NAVIGATION); // this should reveal the last navigation entry because we are not at it currently
		assertTextSelection(new Selection(120, 8, 120, 18), pane);

		await historyService.goBack(GoFilter.NAVIGATION);
		assertTextSelection(new Selection(5, 3, 5, 20), pane);

		await historyService.goBack(GoFilter.NAVIGATION);
		assertTextSelection(new Selection(5, 3, 5, 20), pane);

		await historyService.goForward(GoFilter.NAVIGATION);
		assertTextSelection(new Selection(120, 8, 120, 18), pane);

		await historyService.goPrevious(GoFilter.NAVIGATION);
		assertTextSelection(new Selection(5, 3, 5, 20), pane);

		await historyService.goPrevious(GoFilter.NAVIGATION);
		assertTextSelection(new Selection(120, 8, 120, 18), pane);

		return workbenchTeardown(instantiationService);
	});

	test('back / forward: in-editor text selection changes (jump)', async function () {
		const [, historyService, editorService, , instantiationService] = await createServices();

		const resource = toResource.call(this, '/path/index.txt');

		const pane = await editorService.openEditor({ resource, options: { pinned: true } }) as TestTextFileEditor;

		await setTextSelection(historyService, pane, new Selection(2, 2, 2, 10), EditorPaneSelectionChangeReason.USER);
		await setTextSelection(historyService, pane, new Selection(5, 3, 5, 20), EditorPaneSelectionChangeReason.JUMP);
		await setTextSelection(historyService, pane, new Selection(120, 8, 120, 18), EditorPaneSelectionChangeReason.JUMP);

		await historyService.goBack(GoFilter.NAVIGATION);
		assertTextSelection(new Selection(5, 3, 5, 20), pane);

		await historyService.goBack(GoFilter.NAVIGATION);
		assertTextSelection(new Selection(2, 2, 2, 10), pane);

		await historyService.goForward(GoFilter.NAVIGATION);
		assertTextSelection(new Selection(5, 3, 5, 20), pane);

		await historyService.goLast(GoFilter.NAVIGATION);
		assertTextSelection(new Selection(120, 8, 120, 18), pane);

		await historyService.goPrevious(GoFilter.NAVIGATION);
		assertTextSelection(new Selection(5, 3, 5, 20), pane);

		await historyService.goPrevious(GoFilter.NAVIGATION);
		assertTextSelection(new Selection(120, 8, 120, 18), pane);

		return workbenchTeardown(instantiationService);
	});

	test('back / forward: selection changes with JUMP or NAVIGATION source are not merged (#143833)', async function () {
		const [, historyService, editorService, , instantiationService] = await createServices();

		const resource = toResource.call(this, '/path/index.txt');

		const pane = await editorService.openEditor({ resource, options: { pinned: true } }) as TestTextFileEditor;

		await setTextSelection(historyService, pane, new Selection(2, 2, 2, 10), EditorPaneSelectionChangeReason.USER);
		await setTextSelection(historyService, pane, new Selection(5, 3, 5, 20), EditorPaneSelectionChangeReason.JUMP);
		await setTextSelection(historyService, pane, new Selection(6, 3, 6, 20), EditorPaneSelectionChangeReason.NAVIGATION);

		await historyService.goBack(GoFilter.NONE);
		assertTextSelection(new Selection(5, 3, 5, 20), pane);

		await historyService.goBack(GoFilter.NONE);
		assertTextSelection(new Selection(2, 2, 2, 10), pane);

		return workbenchTeardown(instantiationService);
	});

	test('back / forward: edit selection changes', async function () {
		const [, historyService, editorService, , instantiationService] = await createServices();

		const resource = toResource.call(this, '/path/index.txt');

		const pane = await editorService.openEditor({ resource, options: { pinned: true } }) as TestTextFileEditor;

		await setTextSelection(historyService, pane, new Selection(2, 2, 2, 10));
		await setTextSelection(historyService, pane, new Selection(50, 3, 50, 20), EditorPaneSelectionChangeReason.EDIT);
		await setTextSelection(historyService, pane, new Selection(300, 3, 300, 20)); // unrelated user navigation
		await setTextSelection(historyService, pane, new Selection(500, 3, 500, 20)); // unrelated user navigation
		await setTextSelection(historyService, pane, new Selection(200, 3, 200, 20)); // unrelated user navigation
		await setTextSelection(historyService, pane, new Selection(5, 3, 5, 20), EditorPaneSelectionChangeReason.EDIT);
		await setTextSelection(historyService, pane, new Selection(200, 3, 200, 20)); // unrelated user navigation

		await historyService.goBack(GoFilter.EDITS); // this should reveal the last navigation entry because we are not at it currently
		assertTextSelection(new Selection(5, 3, 5, 20), pane);

		await historyService.goBack(GoFilter.EDITS);
		assertTextSelection(new Selection(50, 3, 50, 20), pane);

		await historyService.goForward(GoFilter.EDITS);
		assertTextSelection(new Selection(5, 3, 5, 20), pane);

		return workbenchTeardown(instantiationService);
	});

	async function setTextSelection(historyService: IHistoryService, pane: TestTextFileEditor, selection: Selection, reason = EditorPaneSelectionChangeReason.USER): Promise<void> {
		const promise = Event.toPromise((historyService as HistoryService).onDidChangeEditorNavigationStack);
		pane.setSelection(selection, reason);
		await promise;
	}

	function assertTextSelection(expected: Selection, pane: EditorPane): void {
		const options: ITextEditorOptions | undefined = pane.options;
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

		const resource1: URI = toResource.call(this, '/path/one.txt');
		const resource2: URI = toResource.call(this, '/path/two.html');

		const pane1 = await editorService.openEditor({ resource: resource1, options: { pinned: true } });
		await editorService.openEditor({ resource: resource2, options: { pinned: true } });

		// [one.txt] [>two.html<]

		const sideGroup = part.addGroup(part.activeGroup, GroupDirection.RIGHT);

		// [one.txt] [>two.html<] | <empty>

		const editorChangePromise = Event.toPromise(editorService.onDidActiveEditorChange);
		pane1?.group?.moveEditor(pane1.input!, sideGroup);
		await editorChangePromise;

		// [one.txt] | [>two.html<]

		await historyService.goBack();

		// [>one.txt<] | [two.html]

		assert.strictEqual(part.activeGroup.id, pane1?.group?.id);
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

		await pane1?.group?.closeAllEditors();

		// [>two.html<]

		await historyService.goBack();

		// [>two.html<]

		assert.strictEqual(part.activeGroup.id, pane2?.group?.id);
		assert.strictEqual(part.activeGroup.activeEditor?.resource?.toString(), resource2.toString());

		return workbenchTeardown(instantiationService);
	});

	test('back / forward: editor navigation stack - navigation', async function () {
		const [, , editorService, , instantiationService] = await createServices();

		const stack = instantiationService.createInstance(EditorNavigationStack, GoFilter.NONE, GoScope.DEFAULT);

		const resource = toResource.call(this, '/path/index.txt');
		const otherResource = toResource.call(this, '/path/index.html');
		const pane = await editorService.openEditor({ resource, options: { pinned: true } });

		let changed = false;
		disposables.add(stack.onDidChange(() => changed = true));

		assert.strictEqual(stack.canGoBack(), false);
		assert.strictEqual(stack.canGoForward(), false);
		assert.strictEqual(stack.canGoLast(), false);

		// Opening our first editor emits change event
		stack.notifyNavigation(pane, { reason: EditorPaneSelectionChangeReason.USER });
		assert.strictEqual(changed, true);
		changed = false;

		assert.strictEqual(stack.canGoBack(), false);
		assert.strictEqual(stack.canGoLast(), true);

		// Opening same editor is not treated as new history stop
		stack.notifyNavigation(pane, { reason: EditorPaneSelectionChangeReason.USER });
		assert.strictEqual(stack.canGoBack(), false);

		// Opening different editor allows to go back
		await editorService.openEditor({ resource: otherResource, options: { pinned: true } });

		stack.notifyNavigation(pane, { reason: EditorPaneSelectionChangeReason.USER });
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

		const stack = disposables.add(instantiationService.createInstance(EditorNavigationStack, GoFilter.NONE, GoScope.DEFAULT));

		const resource: URI = toResource.call(this, '/path/index.txt');
		const otherResource: URI = toResource.call(this, '/path/index.html');
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

		// Remove (via internal event)
		assert.strictEqual(stack.canGoBack(), true);
		stack.remove(new FileOperationEvent(resource, FileOperation.DELETE));
		assert.strictEqual(stack.canGoBack(), false);
		stack.clear();

		await editorService.openEditor({ resource, options: { pinned: true } });
		stack.notifyNavigation(pane);
		await editorService.openEditor({ resource: otherResource, options: { pinned: true } });
		stack.notifyNavigation(pane);

		// Remove (via external event)
		assert.strictEqual(stack.canGoBack(), true);
		stack.remove(new FileChangesEvent([{ resource, type: FileChangeType.DELETED }], !isLinux));
		assert.strictEqual(stack.canGoBack(), false);
		stack.clear();

		await editorService.openEditor({ resource, options: { pinned: true } });
		stack.notifyNavigation(pane);
		await editorService.openEditor({ resource: otherResource, options: { pinned: true } });
		stack.notifyNavigation(pane);

		// Remove (via editor)
		assert.strictEqual(stack.canGoBack(), true);
		stack.remove(pane!.input!);
		assert.strictEqual(stack.canGoBack(), false);
		stack.clear();

		await editorService.openEditor({ resource, options: { pinned: true } });
		stack.notifyNavigation(pane);
		await editorService.openEditor({ resource: otherResource, options: { pinned: true } });
		stack.notifyNavigation(pane);

		// Remove (via group)
		assert.strictEqual(stack.canGoBack(), true);
		stack.remove(pane!.group!.id);
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
			size: 0,
			resource: toResource.call(this, '/path/other.txt'),
			children: undefined
		};
		stack.move(new FileOperationEvent(resource, FileOperation.MOVE, stat));
		await stack.goBack();
		assert.strictEqual(pane?.input?.resource?.toString(), stat.resource.toString());

		return workbenchTeardown(instantiationService);
	});

	test('back / forward: editor group scope', async function () {
		const [part, historyService, editorService, , instantiationService] = await createServices(GoScope.EDITOR_GROUP);

		const resource1 = toResource.call(this, '/path/one.txt');
		const resource2 = toResource.call(this, '/path/two.html');
		const resource3 = toResource.call(this, '/path/three.html');

		const pane1 = await editorService.openEditor({ resource: resource1, options: { pinned: true } });
		await editorService.openEditor({ resource: resource2, options: { pinned: true } });
		await editorService.openEditor({ resource: resource3, options: { pinned: true } });

		// [one.txt] [two.html] [>three.html<]

		const sideGroup = part.addGroup(part.activeGroup, GroupDirection.RIGHT);

		// [one.txt] [two.html] [>three.html<] | <empty>

		const pane2 = await editorService.openEditor({ resource: resource1, options: { pinned: true } }, sideGroup);
		await editorService.openEditor({ resource: resource2, options: { pinned: true } });
		await editorService.openEditor({ resource: resource3, options: { pinned: true } });

		// [one.txt] [two.html] [>three.html<] | [one.txt] [two.html] [>three.html<]

		await historyService.goBack();
		await historyService.goBack();
		await historyService.goBack();

		assert.strictEqual(part.activeGroup.id, pane2?.group?.id);
		assert.strictEqual(part.activeGroup.activeEditor?.resource?.toString(), resource1.toString());

		// [one.txt] [two.html] [>three.html<] | [>one.txt<] [two.html] [three.html]

		await editorService.openEditor({ resource: resource3, options: { pinned: true } }, pane1?.group);

		await historyService.goBack();
		await historyService.goBack();
		await historyService.goBack();

		assert.strictEqual(part.activeGroup.id, pane1?.group?.id);
		assert.strictEqual(part.activeGroup.activeEditor?.resource?.toString(), resource1.toString());

		return workbenchTeardown(instantiationService);
	});

	test('back / forward: editor  scope', async function () {
		const [part, historyService, editorService, , instantiationService] = await createServices(GoScope.EDITOR);

		const resource1 = toResource.call(this, '/path/one.txt');
		const resource2 = toResource.call(this, '/path/two.html');

		const pane = await editorService.openEditor({ resource: resource1, options: { pinned: true } }) as TestTextFileEditor;

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

		const model = await textFileService.files.resolve(resource) as IResolvedTextFileEditorModel;
		model.textEditorModel.setValue('Hello World');
		await timeout(10); // history debounces change events

		await editorService.openEditor({ resource: otherResource });

		const onDidActiveEditorChange = new DeferredPromise<void>();
		disposables.add(editorService.onDidActiveEditorChange(e => {
			onDidActiveEditorChange.complete(e);
		}));

		historyService.goLast(GoFilter.EDITS);
		await onDidActiveEditorChange.p;

		assert.strictEqual(editorService.activeEditor?.resource?.toString(), resource.toString());

		return workbenchTeardown(instantiationService);
	});

	test('reopen closed editor', async function () {
		const [, historyService, editorService, , instantiationService] = await createServices();

		const resource = toResource.call(this, '/path/index.txt');
		const pane = await editorService.openEditor({ resource });

		await pane?.group?.closeAllEditors();

		const onDidActiveEditorChange = new DeferredPromise<void>();
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

			override toUntyped(): IUntypedEditorInput {
				return {
					resource: this.resource,
					options: {
						override: 'testOverride'
					}
				};
			}
		}

		const [part, historyService, , , instantiationService] = await createServices();

		let history = historyService.getHistory();
		assert.strictEqual(history.length, 0);

		const input1 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar1'), TEST_EDITOR_INPUT_ID));
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
		assert.strictEqual((history[0] as IResourceEditorInput).options?.override, 'testOverride');
		// second entry is not untyped even though it implements `toUntyped` but has unsupported scheme
		assert.strictEqual(history[1] instanceof EditorInput, true);
		assert.strictEqual(history[2] instanceof EditorInput, true);
		assert.strictEqual(history[3] instanceof EditorInput, true);

		historyService.removeFromHistory(input2);
		history = historyService.getHistory();
		assert.strictEqual(history.length, 3);
		assert.strictEqual(history[0].resource?.toString(), input4.resource.toString());

		return workbenchTeardown(instantiationService);
	});

	test('getLastActiveFile', async () => {
		const [part, historyService] = await createServices();

		assert.ok(!historyService.getLastActiveFile('foo'));

		const input1 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar1'), TEST_EDITOR_INPUT_ID));
		await part.activeGroup.openEditor(input1, { pinned: true });

		assert.strictEqual(historyService.getLastActiveFile('foo')?.toString(), input1.resource.toString());
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

		const sideGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);

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

	ensureNoDisposablesAreLeakedInTestSuite();
});

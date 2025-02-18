/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite, toResource } from '../../../../../base/test/common/utils.js';
import { URI } from '../../../../../base/common/uri.js';
import { workbenchInstantiationService, TestFileEditorInput, registerTestEditor, createEditorPart, registerTestFileEditor, TestServiceAccessor, TestTextFileEditor, workbenchTeardown, registerTestSideBySideEditor } from '../../../../test/browser/workbenchTestServices.js';
import { EditorPart } from '../../../../browser/parts/editor/editorPart.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { IEditorGroupsService, GroupDirection } from '../../../editor/common/editorGroupsService.js';
import { EditorNavigationStack, HistoryService } from '../../browser/historyService.js';
import { IEditorService, SIDE_GROUP } from '../../../editor/common/editorService.js';
import { EditorService } from '../../../editor/browser/editorService.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { GoFilter, GoScope, IHistoryService } from '../../common/history.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { EditorPaneSelectionChangeReason, isResourceEditorInput, IUntypedEditorInput } from '../../../../common/editor.js';
import { IResourceEditorInput, ITextEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IResolvedTextFileEditorModel, ITextFileService } from '../../../textfile/common/textfiles.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { FileChangesEvent, FileChangeType, FileOperation, FileOperationEvent } from '../../../../../platform/files/common/files.js';
import { isLinux } from '../../../../../base/common/platform.js';
import { Selection } from '../../../../../editor/common/core/selection.js';
import { EditorPane } from '../../../../browser/parts/editor/editorPane.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { SideBySideEditorInput } from '../../../../common/editor/sideBySideEditorInput.js';

suite('HistoryService', function () {

	const TEST_EDITOR_ID = 'MyTestEditorForEditorHistory';
	const TEST_EDITOR_INPUT_ID = 'testEditorInputForHistoyService';

	async function createServices(scope = GoScope.DEFAULT, configureSearchExclude = false): Promise<[EditorPart, HistoryService, EditorService, ITextFileService, IInstantiationService, TestConfigurationService]> {
		const instantiationService = workbenchInstantiationService(undefined, disposables);

		const part = await createEditorPart(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, part);

		const editorService = disposables.add(instantiationService.createInstance(EditorService, undefined));
		instantiationService.stub(IEditorService, editorService);

		const configurationService = new TestConfigurationService();
		if (scope === GoScope.EDITOR_GROUP) {
			configurationService.setUserConfiguration('workbench.editor.navigationScope', 'editorGroup');
		} else if (scope === GoScope.EDITOR) {
			configurationService.setUserConfiguration('workbench.editor.navigationScope', 'editor');
		}
		if (configureSearchExclude) {
			configurationService.setUserConfiguration('search', { exclude: { "**/node_modules/**": true } });
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
		pane1?.group.moveEditor(pane1.input!, sideGroup);
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
		const unrelatedResource: URI = toResource.call(this, '/path/unrelated.html');
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
		stack.remove(new FileOperationEvent(unrelatedResource, FileOperation.DELETE));
		assert.strictEqual(stack.canGoForward(), true);

		// Remove (via internal event)
		await stack.goForward();
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

		await pane?.group.closeAllEditors();

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
		assert.strictEqual((history[0] as IResourceEditorInput).options?.override, 'testOverride');
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

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
import { Emitter, Event } from '../../../../../base/common/event.js';
import { EditorCloseContext, EditorPaneSelectionChangeReason, EditorsOrder, isResourceEditorInput, IUntypedEditorInput } from '../../../../common/editor.js';
import { IResourceEditorInput, ITextEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IResolvedTextFileEditorModel, ITextFileService } from '../../../textfile/common/textfiles.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { FileChangesEvent, FileChangeType, FileOperation, FileOperationEvent, IFileService, IFileStatWithMetadata } from '../../../../../platform/files/common/files.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { isLinux } from '../../../../../base/common/platform.js';
import { Selection } from '../../../../../editor/common/core/selection.js';
import { EditorPane } from '../../../../browser/parts/editor/editorPane.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { SideBySideEditorInput } from '../../../../common/editor/sideBySideEditorInput.js';
import { IWorkspaceContextService, IWorkspaceFoldersChangeEvent, toWorkspaceFolder, Workspace } from '../../../../../platform/workspace/common/workspace.js';
import { testWorkspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { TestContextService, TestFileService } from '../../../../test/common/workbenchTestServices.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';

suite('HistoryService', function () {

	const TEST_EDITOR_ID = 'MyTestEditorForEditorHistory';
	const TEST_EDITOR_INPUT_ID = 'testEditorInputForHistoyService';

	async function createServices(scope = GoScope.DEFAULT, configureSearchExclude = false, contextService?: IWorkspaceContextService): Promise<[EditorPart, HistoryService, EditorService, ITextFileService, IInstantiationService, TestConfigurationService]> {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		if (contextService) {
			instantiationService.stub(IWorkspaceContextService, contextService);
		}

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
			executable: false,
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

	test('reopen closed editors as a batch when closed together', async function () {
		const [part, historyService, editorService, , instantiationService] = await createServices();

		const resource1 = toResource.call(this, '/path/one.txt');
		const resource2 = toResource.call(this, '/path/two.txt');
		const resource3 = toResource.call(this, '/path/three.txt');

		await editorService.openEditor({ resource: resource1, options: { pinned: true } });
		await editorService.openEditor({ resource: resource2, options: { pinned: true } });
		await editorService.openEditor({ resource: resource3, options: { pinned: true } });

		assert.strictEqual(part.activeGroup.count, 3);

		// Bulk close: all editors closed together should reopen together
		await part.activeGroup.closeAllEditors();
		assert.strictEqual(part.activeGroup.count, 0);

		await historyService.reopenLastClosedEditor();

		assert.strictEqual(part.activeGroup.count, 3);
		const reopened = part.activeGroup.editors.map(editor => editor.resource?.toString()).sort();
		assert.deepStrictEqual(reopened, [resource1, resource2, resource3].map(resource => resource.toString()).sort());

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

	suite('recently opened per workspace folder', () => {

		class UntypedTestFileEditorInput extends TestFileEditorInput {
			override toUntyped(): IUntypedEditorInput {
				return { resource: this.resource };
			}
		}

		class FoldersTestContextService extends TestContextService {

			private readonly _onDidChangeFolders = disposables.add(new Emitter<IWorkspaceFoldersChangeEvent>());
			override get onDidChangeWorkspaceFolders(): Event<IWorkspaceFoldersChangeEvent> { return this._onDidChangeFolders.event; }

			setFolders(folders: URI[], options?: { isFolderLocationChange?: boolean; silent?: boolean }): void {
				const publish = this.setFoldersUnpublished(folders, options);
				if (!options?.silent) {
					publish();
				}
			}

			/**
			 * Changes the folders and returns the publication of the change, which the configuration service does later.
			 */
			setFoldersUnpublished(folders: URI[], options?: { isFolderLocationChange?: boolean }): () => void {
				const previous = this.getWorkspace().folders;
				const workspace = testWorkspace(...folders);
				this.setWorkspace(workspace);

				const event: IWorkspaceFoldersChangeEvent = {
					added: workspace.folders.filter(folder => !previous.some(previousFolder => previousFolder.uri.toString() === folder.uri.toString())),
					removed: previous.filter(folder => !folders.some(uri => uri.toString() === folder.uri.toString())),
					changed: [],
					...(options?.isFolderLocationChange ? { isFolderLocationChange: true } : {})
				};

				return () => this._onDidChangeFolders.fire(event);
			}
		}

		const folder = URI.file('/repo');
		const worktree = URI.file('/worktree');
		const nestedWorktree = URI.file('/repo/.worktrees/one');

		async function createFolderServices(...folders: URI[]) {
			const contextService = new FoldersTestContextService(testWorkspace(...folders));
			const [part, historyService, editorService, , instantiationService] = await createServices(undefined, undefined, contextService);
			historyService.getHistory(); // load

			const open = async (path: string) => { await part.activeGroup.openEditor(disposables.add(new UntypedTestFileEditorInput(URI.file(path), TEST_EDITOR_INPUT_ID)), { pinned: true }); };
			const openSideBySide = async (secondary: string, primary: string) => {
				const editor = disposables.add(new SideBySideEditorInput(undefined, undefined, disposables.add(new UntypedTestFileEditorInput(URI.file(secondary), TEST_EDITOR_INPUT_ID)), disposables.add(new UntypedTestFileEditorInput(URI.file(primary), TEST_EDITOR_INPUT_ID)), editorService));
				await part.activeGroup.openEditor(editor, { pinned: true });

				return editor;
			};
			const closeAll = () => part.activeGroup.closeAllEditors();
			const reload = (options?: { save?: boolean }) => {
				if (options?.save !== false) {
					(historyService as unknown as { saveState(): void }).saveState(); // the test editor parts cannot save their state
				}
				const reloaded = disposables.add(instantiationService.createInstance(HistoryService));
				reloaded.getHistory(); // load

				return reloaded;
			};

			const fileService = instantiationService.invokeFunction(accessor => accessor.get(IFileService)) as TestFileService;

			return { contextService, historyService, instantiationService, fileService, part, open, openSideBySide, closeAll, reload };
		}

		function paths(historyService: IHistoryService): (string | undefined)[] {
			return historyService.getHistory().map(editor => editor.resource?.path);
		}

		function stat(path: string, isFile: boolean): IFileStatWithMetadata {
			return { resource: URI.file(path), name: path.substring(path.lastIndexOf('/') + 1), isFile, isDirectory: !isFile, isSymbolicLink: false, mtime: 0, ctime: 0, etag: '', size: 0, readonly: false, locked: false, executable: false, children: undefined };
		}

		function editorPaths(part: EditorPart): (string | undefined)[] {
			return part.activeGroup.editors.map(editor => editor.resource?.path);
		}

		/**
		 * Closes all editors like the switch of the editors of a folder location switch does.
		 */
		const closeAllBySwitch = (part: EditorPart) => part.activeGroup.closeAllEditors({ context: EditorCloseContext.SWITCH });

		/**
		 * Reopens the last closed editors twice and returns the editors that are open then.
		 */
		async function reopenTwice(historyService: IHistoryService, part: EditorPart): Promise<(string | undefined)[]> {
			await historyService.reopenLastClosedEditor();
			await historyService.reopenLastClosedEditor();

			return editorPaths(part);
		}

		test('reopen closed editor only reopens the editors closed at the current location, and not the ones the switch closed', async () => {
			const { contextService, historyService, instantiationService, part, open } = await createFolderServices(folder);

			await open('/repo/a.txt');
			await part.activeGroup.closeAllEditors();
			await open('/repo/b.txt');
			await open('/outside.txt');

			contextService.setFolders([worktree], { isFolderLocationChange: true });
			await closeAllBySwitch(part);
			await open('/worktree/c.txt');
			await part.activeGroup.closeAllEditors();
			const atWorktree = await reopenTwice(historyService, part);

			contextService.setFolders([folder], { isFolderLocationChange: true });
			await closeAllBySwitch(part);
			const backAtFolder = await reopenTwice(historyService, part);

			assert.deepStrictEqual({ atWorktree, backAtFolder }, {
				atWorktree: ['/worktree/c.txt'],
				backAtFolder: ['/repo/a.txt']
			});

			return workbenchTeardown(instantiationService);
		});

		test('a user close while the editors of a switch are pending is recently closed', async () => {
			const { contextService, historyService, instantiationService, part, open } = await createFolderServices(folder);

			await open('/outside.txt');
			contextService.setFolders([worktree], { isFolderLocationChange: true });
			await open('/worktree/c.txt');

			// The apply of the switch is still pending, for example while its editors restore
			const pending = part as unknown as { isApplyingWorkingSet: boolean; isSwitchingEditors: boolean }; // the test editor part implements the editor groups service
			pending.isApplyingWorkingSet = true;
			pending.isSwitchingEditors = true;
			try {
				await part.activeGroup.closeEditor(part.activeGroup.getEditors(EditorsOrder.SEQUENTIAL).find(editor => editor.resource?.path === '/worktree/c.txt'));
				await closeAllBySwitch(part);
			} finally {
				pending.isApplyingWorkingSet = false;
				pending.isSwitchingEditors = false;
			}

			assert.deepStrictEqual(await reopenTwice(historyService, part), ['/worktree/c.txt']);

			return workbenchTeardown(instantiationService);
		});

		test('a close after the folder changed and before the change is published is recorded at the location being left', async () => {
			const { contextService, historyService, instantiationService, part, open } = await createFolderServices(folder);

			await open('/outside.txt');
			await part.activeGroup.closeAllEditors();
			await open('/outside.txt');

			const publish = contextService.setFoldersUnpublished([worktree], { isFolderLocationChange: true });
			await part.activeGroup.closeAllEditors();
			publish();
			const atWorktree = await reopenTwice(historyService, part);

			contextService.setFolders([folder], { isFolderLocationChange: true });
			await closeAllBySwitch(part);
			const backAtFolder = await reopenTwice(historyService, part);

			assert.deepStrictEqual({ atWorktree, backAtFolder }, { atWorktree: [], backAtFolder: ['/outside.txt'] });

			return workbenchTeardown(instantiationService);
		});

		test('an editor of the folder that was left, opened and closed at the new location, is recently closed there', async () => {
			const { contextService, historyService, instantiationService, part, open } = await createFolderServices(folder);

			contextService.setFolders([worktree], { isFolderLocationChange: true });
			await open('/repo/x.txt');
			await part.activeGroup.closeAllEditors();
			const atWorktree = await reopenTwice(historyService, part);

			contextService.setFolders([folder], { isFolderLocationChange: true });
			await closeAllBySwitch(part);
			const backAtFolder = await reopenTwice(historyService, part);

			assert.deepStrictEqual({ atWorktree, backAtFolder }, { atWorktree: ['/repo/x.txt'], backAtFolder: [] });

			return workbenchTeardown(instantiationService);
		});

		test('editors closed at a location belong to it, also outside of its folder, and closing the same editor at another location keeps its entry', async () => {
			const { contextService, historyService, instantiationService, part, open } = await createFolderServices(folder);

			await open('/outside.txt');
			await part.activeGroup.closeAllEditors();
			await open('/repo/.worktrees/one/x.txt');
			await part.activeGroup.closeAllEditors();

			contextService.setFolders([nestedWorktree], { isFolderLocationChange: true });
			await open('/repo/.worktrees/one/x.txt');
			await part.activeGroup.closeAllEditors();
			const atWorktree = await reopenTwice(historyService, part);

			contextService.setFolders([folder], { isFolderLocationChange: true });
			await closeAllBySwitch(part);
			const backAtFolder = await reopenTwice(historyService, part);

			assert.deepStrictEqual({ atWorktree, backAtFolder }, {
				atWorktree: ['/repo/.worktrees/one/x.txt'],
				backAtFolder: ['/outside.txt', '/repo/.worktrees/one/x.txt']
			});

			return workbenchTeardown(instantiationService);
		});

		test('moving files and folders of a location that was left updates its recently closed editors', async () => {
			const { contextService, historyService, instantiationService, fileService, part, open } = await createFolderServices(folder);

			await open('/repo/a.txt');
			await part.activeGroup.closeAllEditors();
			await open('/repo/sub/b.txt');
			await part.activeGroup.closeAllEditors();

			contextService.setFolders([worktree], { isFolderLocationChange: true });
			fileService.fireAfterOperation(new FileOperationEvent(URI.file('/repo/a.txt'), FileOperation.MOVE, stat('/repo/renamed.txt', true)));
			fileService.fireAfterOperation(new FileOperationEvent(URI.file('/repo/sub'), FileOperation.MOVE, stat('/repo/moved', false)));

			contextService.setFolders([folder], { isFolderLocationChange: true });

			assert.deepStrictEqual((await reopenTwice(historyService, part)).sort(), ['/repo/moved/b.txt', '/repo/renamed.txt']);

			return workbenchTeardown(instantiationService);
		});

		test('moving a location that was left with trailing separators moves its recently closed editors', async () => {
			const { contextService, historyService, instantiationService, fileService, part, open } = await createFolderServices(folder);

			await open('/repo/a.txt');
			await part.activeGroup.closeAllEditors();

			contextService.setFolders([worktree], { isFolderLocationChange: true });
			fileService.fireAfterOperation(new FileOperationEvent(URI.file('/repo/'), FileOperation.MOVE, stat('/renamed/', false)));

			contextService.setFolders([URI.file('/renamed')], { isFolderLocationChange: true });

			assert.deepStrictEqual(await reopenTwice(historyService, part), ['/renamed/a.txt']);

			return workbenchTeardown(instantiationService);
		});

		test('a UNC share root with and without its trailing separator is the same location', async () => {
			const share = URI.from({ scheme: 'file', authority: 'server', path: '/share/' });
			const { contextService, instantiationService, part } = await createFolderServices(share);
			const contextKeyService = instantiationService.invokeFunction(accessor => accessor.get(IContextKeyService));
			const canReopen = () => contextKeyService.getContextKeyValue<boolean>('canReopenClosedEditor');

			// Reopening is not exercised: the test text files cannot resolve a UNC path
			await part.activeGroup.openEditor(disposables.add(new UntypedTestFileEditorInput(URI.from({ scheme: 'file', authority: 'server', path: '/share/a.txt' }), TEST_EDITOR_INPUT_ID)), { pinned: true });
			await part.activeGroup.closeAllEditors();

			contextService.setFolders([worktree], { isFolderLocationChange: true });
			const atWorktree = canReopen();

			contextService.setFolders([URI.from({ scheme: 'file', authority: 'server', path: '/share' })], { isFolderLocationChange: true });
			const backAtShare = canReopen();

			assert.deepStrictEqual({ atWorktree, backAtShare }, { atWorktree: false, backAtShare: true });

			return workbenchTeardown(instantiationService);
		});

		test('moving a location that was left moves its recently closed editors', async () => {
			const movedFolder = URI.file('/repo2');
			const { contextService, historyService, instantiationService, fileService, part, open } = await createFolderServices(folder);

			await open('/repo/a.txt');
			await part.activeGroup.closeAllEditors();

			contextService.setFolders([worktree], { isFolderLocationChange: true });
			fileService.fireAfterOperation(new FileOperationEvent(folder, FileOperation.MOVE, stat('/repo2', false)));

			contextService.setFolders([movedFolder], { isFolderLocationChange: true });

			assert.deepStrictEqual(await reopenTwice(historyService, part), ['/repo2/a.txt']);

			return workbenchTeardown(instantiationService);
		});

		test('deleting files updates the put away recently closed editors', async () => {
			const { contextService, historyService, instantiationService, fileService, part, open } = await createFolderServices(folder);

			await open('/repo/a.txt');
			await part.activeGroup.closeAllEditors();
			await open('/repo/b.txt');
			await part.activeGroup.closeAllEditors();

			contextService.setFolders([worktree], { isFolderLocationChange: true });
			fileService.fireAfterOperation(new FileOperationEvent(URI.file('/repo/b.txt'), FileOperation.DELETE));
			const atWorktree = await reopenTwice(historyService, part);

			contextService.setFolders([folder], { isFolderLocationChange: true });
			const backAtFolder = await reopenTwice(historyService, part);

			assert.deepStrictEqual({ atWorktree, backAtFolder }, {
				atWorktree: [],
				backAtFolder: ['/repo/a.txt']
			});

			return workbenchTeardown(instantiationService);
		});

		test('a folder location switch puts away the list of the folder and restores the list of the new location', async () => {
			const { contextService, historyService, instantiationService, open } = await createFolderServices(folder);

			await open('/repo/a.txt');
			await open('/outside.txt');

			contextService.setFolders([worktree], { isFolderLocationChange: true });
			const firstVisit = paths(historyService);

			await open('/worktree/b.txt');
			const atWorktree = paths(historyService);

			contextService.setFolders([folder], { isFolderLocationChange: true });
			const backAtFolder = paths(historyService);

			contextService.setFolders([worktree], { isFolderLocationChange: true });
			const backAtWorktree = paths(historyService);

			assert.deepStrictEqual({ firstVisit, atWorktree, backAtFolder, backAtWorktree }, {
				firstVisit: ['/outside.txt'],
				atWorktree: ['/worktree/b.txt', '/outside.txt'],
				backAtFolder: ['/repo/a.txt', '/outside.txt'],
				backAtWorktree: ['/worktree/b.txt', '/outside.txt']
			});

			return workbenchTeardown(instantiationService);
		});

		test('a worktree nested in the folder has its own list', async () => {
			const { contextService, historyService, instantiationService, open } = await createFolderServices(folder);

			await open('/repo/a.txt');
			contextService.setFolders([nestedWorktree], { isFolderLocationChange: true });
			await open('/repo/.worktrees/one/b.txt');
			const atWorktree = paths(historyService);

			contextService.setFolders([folder], { isFolderLocationChange: true });
			const backAtFolder = paths(historyService);

			assert.deepStrictEqual({ atWorktree, backAtFolder }, { atWorktree: ['/repo/.worktrees/one/b.txt'], backAtFolder: ['/repo/a.txt'] });

			return workbenchTeardown(instantiationService);
		});

		test('after a folder location switch, editors of the folder that was left are not added', async () => {
			const { contextService, historyService, instantiationService, open } = await createFolderServices(folder);

			contextService.setFolders([nestedWorktree], { isFolderLocationChange: true });
			await open('/repo/left.txt');
			await open('/repo/.worktrees/one/nested.txt');
			const atWorktree = paths(historyService);

			// The guard follows the latest change of the folders
			contextService.setFolders([folder], { isFolderLocationChange: true });
			await open('/repo/.worktrees/one/left.txt');
			await open('/repo/current.txt');
			const backAtFolder = paths(historyService);

			assert.deepStrictEqual({ atWorktree, backAtFolder }, { atWorktree: ['/repo/.worktrees/one/nested.txt'], backAtFolder: ['/repo/current.txt'] });

			return workbenchTeardown(instantiationService);
		});

		test('editors of every folder that switches left are not added', async () => {
			const otherWorktree = URI.file('/worktree2');
			const { contextService, historyService, instantiationService, open } = await createFolderServices(folder);

			await open('/repo/a.txt');
			contextService.setFolders([worktree], { isFolderLocationChange: true });
			contextService.setFolders([otherWorktree], { isFolderLocationChange: true });

			// The editor of the folder is still open and gets focus again
			await open('/worktree2/b.txt');
			await open('/repo/a.txt');
			const atOtherWorktree = paths(historyService);

			contextService.setFolders([folder], { isFolderLocationChange: true });
			const backAtFolder = paths(historyService);

			assert.deepStrictEqual({ atOtherWorktree, backAtFolder }, { atOtherWorktree: ['/worktree2/b.txt'], backAtFolder: ['/repo/a.txt'] });

			return workbenchTeardown(instantiationService);
		});

		test('deleting and moving files updates the put away lists', async () => {
			const { contextService, instantiationService, fileService, open, closeAll, reload } = await createFolderServices(folder);

			await open('/repo/a.txt');
			await open('/repo/b.txt');
			await open('/repo/c.txt');
			await open('/repo/e.txt');
			contextService.setFolders([worktree], { isFolderLocationChange: true });
			await closeAll();

			fileService.fireAfterOperation(new FileOperationEvent(URI.file('/repo/a.txt'), FileOperation.DELETE));
			fileService.fireAfterOperation(new FileOperationEvent(URI.file('/repo/b.txt'), FileOperation.MOVE, stat('/repo/d.txt', true)));
			fileService.fireFileChanges(new FileChangesEvent([{ resource: URI.file('/repo/e.txt'), type: FileChangeType.DELETED }], !isLinux));

			const reloaded = reload();
			contextService.setFolders([folder], { isFolderLocationChange: true });

			assert.deepStrictEqual(paths(reloaded), ['/repo/c.txt', '/repo/d.txt']);

			return workbenchTeardown(instantiationService);
		});

		test('moving a folder updates the entries of its files in the put away lists', async () => {
			const { contextService, instantiationService, fileService, open, closeAll, reload } = await createFolderServices(folder);

			await open('/repo/src/a.txt');
			await open('/repo/b.txt');
			contextService.setFolders([worktree], { isFolderLocationChange: true });
			await closeAll();

			fileService.fireAfterOperation(new FileOperationEvent(URI.file('/repo/src'), FileOperation.MOVE, stat('/repo/lib', false)));

			const reloaded = reload();
			contextService.setFolders([folder], { isFolderLocationChange: true });

			assert.deepStrictEqual(paths(reloaded), ['/repo/b.txt', '/repo/lib/a.txt']);

			return workbenchTeardown(instantiationService);
		});

		test('moving a file to another location moves its entry to the list of that location', async () => {
			const { contextService, historyService, instantiationService, fileService, open, closeAll } = await createFolderServices(folder);

			await open('/repo/a.txt');
			await open('/repo/b.txt');
			await open('/repo/c.txt');
			contextService.setFolders([nestedWorktree], { isFolderLocationChange: true });
			await open('/repo/.worktrees/one/n.txt');
			contextService.setFolders([worktree], { isFolderLocationChange: true });
			await closeAll();

			// Into the nested worktree, into the open location, and out of the nested worktree
			fileService.fireAfterOperation(new FileOperationEvent(URI.file('/repo/a.txt'), FileOperation.MOVE, stat('/repo/.worktrees/one/a.txt', true)));
			fileService.fireAfterOperation(new FileOperationEvent(URI.file('/repo/b.txt'), FileOperation.MOVE, stat('/worktree/b.txt', true)));
			fileService.fireAfterOperation(new FileOperationEvent(URI.file('/repo/.worktrees/one/n.txt'), FileOperation.MOVE, stat('/repo/n.txt', true)));

			contextService.setFolders([folder], { isFolderLocationChange: true });
			const atFolder = paths(historyService);
			contextService.setFolders([nestedWorktree], { isFolderLocationChange: true });
			const atNestedWorktree = paths(historyService);

			assert.deepStrictEqual({ atFolder, atNestedWorktree }, { atFolder: ['/repo/n.txt', '/repo/c.txt'], atNestedWorktree: ['/repo/.worktrees/one/a.txt'] });

			return workbenchTeardown(instantiationService);
		});

		test('moving a folder matches the paths of its files with the casing rules of the file system', async () => {
			const share = URI.file('//server/share');
			const { contextService, instantiationService, fileService, open, closeAll, reload } = await createFolderServices(folder, share);

			await open('/repo/Src/a.txt');
			await open('//server/share/src/b.txt');
			contextService.setFolders([worktree], { isFolderLocationChange: true });
			await closeAll();

			fileService.fireAfterOperation(new FileOperationEvent(URI.file('/repo/src'), FileOperation.MOVE, stat('/repo/lib', false)));
			fileService.fireAfterOperation(new FileOperationEvent(URI.file('//server/share/src'), FileOperation.MOVE, stat('//server/share/lib', false)));

			const reloaded = reload();
			contextService.setFolders([folder, share], { isFolderLocationChange: true });

			assert.deepStrictEqual(paths(reloaded), ['/share/lib/b.txt', isLinux ? '/repo/Src/a.txt' : '/repo/lib/a.txt']);

			return workbenchTeardown(instantiationService);
		});

		test('moving a file to a location that was left without entries moves its entry to that location', async () => {
			const { contextService, historyService, instantiationService, fileService, open, closeAll } = await createFolderServices(folder);

			await open('/repo/a.txt');
			await open('/repo/b.txt');
			contextService.setFolders([nestedWorktree], { isFolderLocationChange: true });
			contextService.setFolders([worktree], { isFolderLocationChange: true });
			await closeAll();

			fileService.fireAfterOperation(new FileOperationEvent(URI.file('/repo/a.txt'), FileOperation.MOVE, stat('/repo/.worktrees/one/a.txt', true)));

			contextService.setFolders([folder], { isFolderLocationChange: true });
			const atFolder = paths(historyService);
			contextService.setFolders([nestedWorktree], { isFolderLocationChange: true });
			const atNestedWorktree = paths(historyService);

			assert.deepStrictEqual({ atFolder, atNestedWorktree }, { atFolder: ['/repo/b.txt'], atNestedWorktree: ['/repo/.worktrees/one/a.txt'] });

			return workbenchTeardown(instantiationService);
		});

		test('moving a folder whose URI ends with a separator or is a root keeps the names of its files', async () => {
			const { contextService, instantiationService, fileService, open, closeAll, reload } = await createFolderServices(folder);

			await open('/repo/src/a.txt');
			await open('/repo/b.txt');
			contextService.setFolders([worktree], { isFolderLocationChange: true });
			await closeAll();

			fileService.fireAfterOperation(new FileOperationEvent(URI.file('/repo/src/'), FileOperation.MOVE, stat('/repo/lib', false)));
			fileService.fireAfterOperation(new FileOperationEvent(URI.file('/'), FileOperation.MOVE, stat('/moved', false)));

			const reloaded = reload();
			contextService.setFolders([folder], { isFolderLocationChange: true });

			assert.deepStrictEqual(paths(reloaded), ['/moved/repo/b.txt', '/moved/repo/lib/a.txt']);

			return workbenchTeardown(instantiationService);
		});

		test('moving a folder before the history is used is saved', async () => {
			const { contextService, historyService, instantiationService, fileService, open, closeAll } = await createFolderServices(folder);

			await open('/repo/src/a.txt');
			contextService.setFolders([worktree], { isFolderLocationChange: true });
			await closeAll();
			(historyService as unknown as { saveState(): void }).saveState(); // the test editor parts cannot save their state
			historyService.dispose();

			// A new window that has not used the history yet
			const fresh = disposables.add(instantiationService.createInstance(HistoryService));
			fileService.fireAfterOperation(new FileOperationEvent(URI.file('/repo/src'), FileOperation.MOVE, stat('/repo/lib', false)));
			(fresh as unknown as { saveState(): void }).saveState();
			fresh.dispose();

			const reloaded = disposables.add(instantiationService.createInstance(HistoryService));
			contextService.setFolders([folder], { isFolderLocationChange: true });

			assert.deepStrictEqual(paths(reloaded), ['/repo/lib/a.txt']);

			return workbenchTeardown(instantiationService);
		});

		test('adding and removing folders of a multi-root workspace keeps the list', async () => {
			const other = URI.file('/other');
			const { contextService, historyService, instantiationService, open } = await createFolderServices(folder, other);

			await open('/repo/a.txt');
			await open('/other/b.txt');

			contextService.setFolders([folder]);
			const removed = paths(historyService);

			await open('/other/c.txt');
			const openedAfterRemove = paths(historyService);

			contextService.setFolders([folder, other]);
			const added = paths(historyService);

			assert.deepStrictEqual({ removed, openedAfterRemove, added }, {
				removed: ['/other/b.txt', '/repo/a.txt'],
				openedAfterRemove: ['/other/c.txt', '/other/b.txt', '/repo/a.txt'],
				added: ['/other/c.txt', '/other/b.txt', '/repo/a.txt']
			});

			return workbenchTeardown(instantiationService);
		});

		test('a change without added or removed folders keeps the list', async () => {
			const { contextService, historyService, instantiationService, open } = await createFolderServices(folder);

			await open('/repo/a.txt');
			contextService.setFolders([folder], { isFolderLocationChange: true });
			await open('/repo/b.txt');

			assert.deepStrictEqual(paths(historyService), ['/repo/b.txt', '/repo/a.txt']);

			return workbenchTeardown(instantiationService);
		});

		test('the put away lists survive a reload, and a restart at another location swaps the list', async () => {
			const { contextService, historyService, instantiationService, open, closeAll, reload } = await createFolderServices(folder);

			// Switching the location also switches the editors
			await open('/repo/a.txt');
			contextService.setFolders([worktree], { isFolderLocationChange: true });
			await closeAll();
			await open('/worktree/b.txt');
			const beforeReload = paths(historyService);

			const reloaded = reload();
			const afterReload = paths(reloaded);

			// Restart at the folder without a change event (the state was saved at the worktree)
			contextService.setFolders([folder], { silent: true });
			const restarted = reload({ save: false });
			const afterRestart = paths(restarted);

			// The folder that the restart left is guarded too
			await open('/worktree/c.txt');
			const afterOpen = paths(restarted);

			assert.deepStrictEqual({ beforeReload, afterReload, afterRestart, afterOpen }, {
				beforeReload: ['/worktree/b.txt'],
				afterReload: ['/worktree/b.txt'],
				afterRestart: ['/repo/a.txt'],
				afterOpen: ['/repo/a.txt']
			});

			return workbenchTeardown(instantiationService);
		});

		test('a restart of a multi-root workspace with other folders keeps the list', async () => {
			const other = URI.file('/other');
			const { contextService, instantiationService, open, closeAll, reload } = await createFolderServices(folder);
			const multiRootWorkspace = (...folders: URI[]) => new Workspace('test-workspace', folders.map(toWorkspaceFolder), false, URI.file('/test.code-workspace'), () => false);

			contextService.setWorkspace(multiRootWorkspace(folder, other));
			await open('/repo/a.txt');
			await open('/other/b.txt');
			await closeAll();
			reload();

			// Restart with a folder removed while the window was closed
			contextService.setWorkspace(multiRootWorkspace(folder));
			const restarted = reload({ save: false });

			assert.deepStrictEqual(paths(restarted), ['/other/b.txt', '/repo/a.txt']);

			return workbenchTeardown(instantiationService);
		});

		test('a list stored without its folders belongs to the current folders', async () => {
			const { instantiationService } = await createFolderServices(folder);

			const storageService = instantiationService.invokeFunction(accessor => accessor.get(IStorageService));
			storageService.store('history.entries', JSON.stringify([{ editor: { resource: URI.file('/worktree/a.txt').toString() } }]), StorageScope.WORKSPACE, StorageTarget.MACHINE);
			storageService.remove('history.entries.folders', StorageScope.WORKSPACE);

			const legacy = disposables.add(instantiationService.createInstance(HistoryService));

			assert.deepStrictEqual(paths(legacy), ['/worktree/a.txt']);

			return workbenchTeardown(instantiationService);
		});

		test('side-by-side editors are put away as their sides, and their sides in the folder that was left do not come back', async () => {
			const { contextService, historyService, instantiationService, openSideBySide, closeAll } = await createFolderServices(folder);

			contextService.setFolders([worktree], { isFolderLocationChange: true });
			const worktreeDiff = await openSideBySide('/repo/app.ts', '/worktree/app.ts');

			contextService.setFolders([folder], { isFolderLocationChange: true });
			const backAtFolder = paths(historyService);

			const folderDiff = await openSideBySide('/worktree/c.ts', '/repo/c.ts');
			await closeAll();
			worktreeDiff.dispose();
			folderDiff.dispose();
			const afterClose = paths(historyService);

			contextService.setFolders([worktree], { isFolderLocationChange: true });
			const backAtWorktree = paths(historyService);

			assert.deepStrictEqual({ backAtFolder, afterClose, backAtWorktree }, {
				backAtFolder: [],
				afterClose: ['/repo/c.ts'],
				backAtWorktree: ['/worktree/app.ts']
			});

			return workbenchTeardown(instantiationService);
		});

		test('the lists of the least recently put away folders are evicted first', async () => {
			const { contextService, historyService, instantiationService, open } = await createFolderServices(URI.file('/f0'));
			const switchTo = async (index: number, options?: { open: boolean }) => {
				contextService.setFolders([URI.file(`/f${index}`)], { isFolderLocationChange: true });
				if (options?.open !== false) {
					await open(`/f${index}/a.txt`);
				}
			};

			// f0 is put away again after f1, so it is the more recent one
			await open('/f0/a.txt');
			await switchTo(1);
			await switchTo(0, { open: false });

			// 21 folders with a list are put away: one more than the cap
			for (let i = 2; i <= 21; i++) {
				await switchTo(i);
			}

			await switchTo(0, { open: false });
			const atF0 = paths(historyService);

			await switchTo(1, { open: false });
			const atF1 = paths(historyService);

			assert.deepStrictEqual({ atF0, atF1 }, { atF0: ['/f0/a.txt'], atF1: [] });

			return workbenchTeardown(instantiationService);
		});

		test('a saved history comes back after a clear, also after a restart, and stays as it is without a clear', async () => {
			const { contextService, historyService, instantiationService, open, closeAll, reload } = await createFolderServices(folder);

			// The window's own history, with a list put away for another folder
			await open('/repo/a.txt');
			contextService.setFolders([worktree], { isFolderLocationChange: true });
			await closeAll();
			await open('/worktree/b.txt');

			// Without a clear, restoring keeps what was opened since
			historyService.saveRecentlyOpened();
			await open('/worktree/c.txt');
			historyService.restoreRecentlyOpened();
			const withoutClear = paths(historyService);

			// Entering, switching (which clears) and leaving brings the saved history back
			historyService.saveRecentlyOpened();
			historyService.clearRecentlyOpened({ keepSaved: true });
			await open('/worktree/d.txt');
			historyService.restoreRecentlyOpened();
			const afterClear = paths(historyService);

			// Restarting in between: the saved history and the clear survive the restart
			historyService.saveRecentlyOpened();
			historyService.clearRecentlyOpened({ keepSaved: true });
			const restarted = reload();
			restarted.restoreRecentlyOpened();
			const afterRestart = paths(restarted);

			// The list put away for the folder comes back too
			contextService.setFolders([folder], { isFolderLocationChange: true });
			const putAway = paths(restarted);

			// Restoring forgets the saved history
			restarted.clearRecentlyOpened({ keepSaved: true });
			restarted.restoreRecentlyOpened();
			const restoredTwice = paths(restarted);

			assert.deepStrictEqual({ withoutClear, afterClear, afterRestart, restoredTwice, putAway }, {
				withoutClear: ['/worktree/c.txt', '/worktree/b.txt'],
				afterClear: ['/worktree/c.txt', '/worktree/b.txt'],
				afterRestart: ['/worktree/c.txt', '/worktree/b.txt'],
				restoredTwice: [],
				putAway: ['/repo/a.txt'],
			});

			return workbenchTeardown(instantiationService);
		});

		test('restoring a saved history skips what it cannot read, keeps the list when the saved one cannot be read, and forgets it', async () => {
			const { historyService, instantiationService, open } = await createFolderServices(folder);
			const storageService = instantiationService.invokeFunction(accessor => accessor.get(IStorageService));
			const restoreAfter = async (saved: object | undefined) => {
				await open('/repo/a.txt');
				historyService.saveRecentlyOpened();
				if (saved) {
					storageService.store('history.entries.saved', JSON.stringify(saved), StorageScope.WORKSPACE, StorageTarget.MACHINE);
				}
				historyService.clearRecentlyOpened({ keepSaved: true });
				await open('/repo/b.txt');
				historyService.restoreRecentlyOpened();
				return { paths: paths(historyService), forgotten: storageService.get('history.entries.saved', StorageScope.WORKSPACE) === undefined };
			};

			// An entry it cannot read is left out
			const malformedEntry = await restoreAfter({ version: 1, entries: [null], putAway: [] });
			const malformedPutAway = await restoreAfter({ version: 1, entries: [], putAway: 'folders' });

			assert.deepStrictEqual({ malformedEntry, malformedPutAway }, {
				malformedEntry: { paths: [], forgotten: true },
				malformedPutAway: { paths: ['/repo/b.txt'], forgotten: true },
			});

			return workbenchTeardown(instantiationService);
		});

		test('leaving Agents mode by entering a workspace restores the history from before the mode before the storage switches, and the entered workspace keeps it across a restart', async () => {
			const { contextService, historyService, instantiationService, open, closeAll, reload } = await createFolderServices(folder);
			const storageService = instantiationService.invokeFunction(accessor => accessor.get(IStorageService));
			const savedKeysIn = (get: (key: string) => string | undefined) => ['history.entries.saved', 'history.entries.saved.cleared'].filter(key => get(key) !== undefined);
			const savedKeys = () => savedKeysIn(key => storageService.get(key, StorageScope.WORKSPACE));

			// Entering the mode saves the window's history, and switching sessions in it clears it
			await open('/repo/a.txt');
			historyService.saveRecentlyOpened();
			historyService.clearRecentlyOpened({ keepSaved: true });
			await open('/repo/session.txt');

			// Entering a workspace leaves the mode without the toggle: the workspace editing service restores the history
			// while the storage of the left workspace is current. Then the storage switches: it saves the state, and the
			// entered workspace gets its own storage, without the data of the left one.
			historyService.restoreRecentlyOpened();
			(historyService as unknown as { saveState(): void }).saveState(); // the test editor parts cannot save their state
			const leftWorkspaceStorage = new Map<string, string>();
			for (const target of [StorageTarget.USER, StorageTarget.MACHINE]) {
				for (const key of storageService.keys(StorageScope.WORKSPACE, target)) {
					leftWorkspaceStorage.set(key, storageService.get(key, StorageScope.WORKSPACE)!);
					storageService.remove(key, StorageScope.WORKSPACE);
				}
			}
			contextService.setWorkspace(new Workspace('entered-workspace', testWorkspace(folder).folders, false, null, () => false));
			const onLeave = { paths: paths(historyService), savedKeys: savedKeys(), savedKeysLeft: savedKeysIn(key => leftWorkspaceStorage.get(key)) };

			// The window restarts in the entered workspace without editors, where startup restores whatever is still saved
			await closeAll();
			const restarted = reload();
			restarted.restoreRecentlyOpened();
			const afterRestart = { paths: paths(restarted), savedKeys: savedKeys() };

			// The entered workspace holds the history from before the mode, like entering it outside the mode, and no saved history is left in either storage
			assert.deepStrictEqual({ onLeave, afterRestart }, {
				onLeave: { paths: ['/repo/a.txt'], savedKeys: [], savedKeysLeft: [] },
				afterRestart: { paths: ['/repo/a.txt'], savedKeys: [] },
			});

			return workbenchTeardown(instantiationService);
		});

		test('clearing the history as the user does in the mode leaves an empty history on leaving, also after more session switches and across a restart', async () => {
			const clearAndRestore = async (restart: boolean) => {
				const { historyService, instantiationService, open, closeAll, reload } = await createFolderServices(folder);
				const storageService = instantiationService.invokeFunction(accessor => accessor.get(IStorageService));

				// Entering the mode saves the window's history, switching sessions clears it, then the user clears the history
				await open('/repo/a.txt');
				historyService.saveRecentlyOpened();
				historyService.clearRecentlyOpened({ keepSaved: true });
				await open('/repo/session.txt');
				historyService.clearRecentlyOpened();
				await open('/repo/b.txt');

				// Switching sessions again clears the history the session opened
				historyService.clearRecentlyOpened({ keepSaved: true });
				await open('/repo/other-session.txt');

				let restored = historyService;
				if (restart) {
					await closeAll();
					restored = reload();
				}
				restored.restoreRecentlyOpened();
				const result = {
					paths: paths(restored),
					savedKeys: ['history.entries.saved', 'history.entries.saved.cleared'].filter(key => storageService.get(key, StorageScope.WORKSPACE) !== undefined)
				};

				await workbenchTeardown(instantiationService);
				return result;
			};

			// Neither the history from before the mode nor the files of the sessions come back
			assert.deepStrictEqual({ onLeave: await clearAndRestore(false), afterRestart: await clearAndRestore(true) }, {
				onLeave: { paths: [], savedKeys: [] },
				afterRestart: { paths: [], savedKeys: [] },
			});
		});

		test('clearing recently opened clears the put away lists too', async () => {
			const { contextService, historyService, instantiationService, open, closeAll, reload } = await createFolderServices(folder);

			await open('/repo/a.txt');
			contextService.setFolders([worktree], { isFolderLocationChange: true });
			await closeAll();
			historyService.clearRecentlyOpened();

			contextService.setFolders([folder], { isFolderLocationChange: true });
			const afterClear = paths(historyService);
			const afterReload = paths(reload());

			assert.deepStrictEqual({ afterClear, afterReload }, { afterClear: [], afterReload: [] });

			return workbenchTeardown(instantiationService);
		});
	});

	test('editor dispose clears history listener', async () => {
		const [part, historyService, , , instantiationService] = await createServices();
		historyService.getHistory();

		const input = new TestFileEditorInput(URI.file('history-listener'), TEST_EDITOR_INPUT_ID);
		await part.activeGroup.openEditor(input, { pinned: true });

		const editorHistoryListeners = (historyService as unknown as { editorHistoryListeners: { size: number } }).editorHistoryListeners;
		assert.strictEqual(editorHistoryListeners.size, 1);

		input.dispose();
		assert.strictEqual(editorHistoryListeners.size, 0);

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

		let editorChangePromise: Promise<void> = Event.toPromise(editorService.onDidActiveEditorChange);
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

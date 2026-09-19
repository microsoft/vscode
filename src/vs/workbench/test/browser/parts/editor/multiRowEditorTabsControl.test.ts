/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, Dimension, scheduleAtNextAnimationFrame, ModifierKeyEmitter } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TreeViewsDnDService } from '../../../../../editor/common/services/treeViewsDnd.js';
import { ITreeViewsDnDService } from '../../../../../editor/common/services/treeViewsDndService.js';
import { DEFAULT_EDITOR_PART_OPTIONS, IEditorGroupsView, IEditorGroupView, IEditorPartsView } from '../../../../browser/parts/editor/editor.js';
import { MultiRowEditorControl } from '../../../../browser/parts/editor/multiRowEditorTabsControl.js';
import { EditorsOrder, IEditorPartOptions } from '../../../../common/editor.js';
import { EditorGroupModel } from '../../../../common/editor/editorGroupModel.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { INotebookDocumentService, NotebookDocumentWorkbenchService } from '../../../../services/notebook/common/notebookDocumentService.js';
import { TestFileEditorInput, workbenchInstantiationService } from '../../workbenchTestServices.js';
import '../../../../contrib/modernUI/browser/media/tabs.css';
import '../../../../contrib/modernUI/browser/connectedEditorTabs.js';

suite('MultiRowEditorControl', () => {

	let disposables: DisposableStore;

	let container: HTMLElement;
	let control: MultiRowEditorControl;
	let partOptions: IEditorPartOptions;
	let model: EditorGroupModel;

	setup(() => {
		disposables = new DisposableStore();
		partOptions = { ...DEFAULT_EDITOR_PART_OPTIONS };

		// Reset the shared modifier-key emitter after each test to avoid leaked Alt state.
		disposables.add(toDisposable(() => ModifierKeyEmitter.disposeInstance()));

		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(ITreeViewsDnDService, new TreeViewsDnDService());
		instantiationService.stub(INotebookDocumentService, new NotebookDocumentWorkbenchService());

		model = disposables.add(instantiationService.createInstance(EditorGroupModel, undefined));
		for (let i = 0; i < 2; i++) {
			const editor = disposables.add(new class extends TestFileEditorInput {
				override getName(): string { return `file${i}.txt`; }
			}(URI.file(`/path/file${i}.txt`), 'testEditorInput'));
			model.openEditor(editor, { pinned: true, active: i === 0 });
		}

		const groupView = new class extends mock<IEditorGroupView>() {
			override get id() { return model.id; }
			override get count() { return model.count; }
			override get stickyCount() { return model.stickyCount; }
			override get activeEditor() { return model.activeEditor; }
			override get activeEditorPane() { return undefined; }
			override get selectedEditors() { return model.selectedEditors; }
			override get ariaLabel() { return 'Editor Group 1'; }
			override get groupsView(): IEditorGroupsView { return groupsView; }
			override getEditorByIndex(index: number) { return model.getEditorByIndex(index); }
			override getIndexOfEditor(editor: EditorInput) { return model.indexOf(editor); }
			override getEditors(order: EditorsOrder, options?: { excludeSticky?: boolean }) { return model.getEditors(order, options); }
			override isActive(editor: EditorInput) { return model.isActive(editor); }
			override isPinned(editorOrIndex: EditorInput | number) { return model.isPinned(editorOrIndex); }
			override isSticky(editorOrIndex: EditorInput | number) { return model.isSticky(editorOrIndex); }
			override isSelected(editorOrIndex: EditorInput | number) { return model.isSelected(editorOrIndex); }
			override createEditorActions() { return { actions: { primary: [], secondary: [] }, onDidChange: Event.None }; }
			override relayout() { }
			override readonly onDidActiveEditorChange = Event.None;
		};

		const groupsView = new class extends mock<IEditorGroupsView>() {
			override get partOptions() { return partOptions; }
			override get activeGroup(): IEditorGroupView { return groupView; }
			override get groups(): IEditorGroupView[] { return [groupView]; }
			override readonly onDidChangeEditorPartOptions = Event.None;
			override readonly onDidVisibilityChange = Event.None;
		};

		const editorPartsView = new class extends mock<IEditorPartsView>() {
			override get count() { return 1; }
			override getGroup() { return groupView; }
		};

		container = $('.title.tabs');
		mainWindow.document.body.appendChild(container);

		control = disposables.add(instantiationService.createInstance(MultiRowEditorControl, container, editorPartsView, groupsView, groupView, model, undefined, false, false));
		control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
	});

	teardown(() => {
		container.remove();
		disposables.dispose();
	});

	function connectedGroup(): HTMLElement {
		const root = $('.monaco-workbench.modern-ui.modern-ui-tabs.modern-ui-connected-editor-tabs');
		root.style.cssText = '--vscode-spacing-size20: 2px; --vscode-spacing-size40: 4px; --vscode-spacing-size60: 6px; --vscode-spacing-size80: 8px; --vscode-spacing-size160: 16px; --vscode-spacing-size280: 28px; --vscode-strokeThickness: 1px; --vscode-cornerRadius-small: 4px; --vscode-fontSize-body1: 13px; --vscode-fontWeight-regular: 400;';
		mainWindow.document.body.appendChild(root);
		disposables.add(toDisposable(() => root.remove()));
		const editor = $('.part.editor');
		const content = $('.content');
		const group = $('.editor-group-container.active');
		root.appendChild(editor);
		editor.appendChild(content);
		content.appendChild(group);
		group.appendChild(container);
		return group;
	}

	test('wrapped unsticky tabs keep row bottoms aligned and avoid vertical scrolling with sticky tabs on a separate row', async () => {
		const group = connectedGroup();
		group.style.setProperty('--modern-ui-connected-tab-surface', '#ffffff');
		model.stick(model.getEditorByIndex(0)!);
		const unstickyEditor = disposables.add(new TestFileEditorInput(URI.file('/path/unsticky.ts'), 'testEditorInput'));
		model.openEditor(unstickyEditor, { pinned: true, active: true });
		control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
		const oldOptions = partOptions;
		partOptions = { ...partOptions, pinnedTabsOnSeparateRow: true, wrapTabs: true, tabSizing: 'fixed', tabSizingFixedMinWidth: 120, tabSizingFixedMaxWidth: 120, editorActionsLocation: 'hidden' };
		control.updateOptions(oldOptions, partOptions);
		group.style.width = '150px';
		control.layout({ container: new Dimension(150, 33), available: new Dimension(150, 300) });
		await new Promise<void>(resolve => disposables.add(scheduleAtNextAnimationFrame(mainWindow, () => resolve())));

		const rows = Array.from(container.querySelectorAll<HTMLElement>('.tabs-and-actions-container'));
		const unstickyRow = rows[1];
		const unstickyTabs = unstickyRow.querySelector<HTMLElement>('.tabs-container')!;
		unstickyTabs.classList.add('scroll');
		const unstickyFills = unstickyRow.querySelectorAll<HTMLElement>('.tab-fill');
		const unstickyFill = unstickyFills[unstickyFills.length - 1];
		const unstickyEdge = unstickyRow.querySelector<HTMLElement>('.tab.active > .tab-connected-edge')!;
		assert.deepStrictEqual({
			pinnedTabsOnSeparateRow: partOptions.pinnedTabsOnSeparateRow,
			rowCount: rows.length,
			unstickyWrapping: unstickyRow.classList.contains('wrapping'),
			unstickyFillBottomGap: unstickyRow.getBoundingClientRect().bottom - unstickyFill.getBoundingClientRect().bottom,
			unstickyEdgeBottom: mainWindow.getComputedStyle(unstickyEdge).bottom,
			unstickyScrollHeightGap: unstickyTabs.clientHeight - unstickyTabs.scrollHeight,
		}, {
			pinnedTabsOnSeparateRow: true,
			rowCount: 2,
			unstickyWrapping: true,
			unstickyFillBottomGap: 0,
			unstickyEdgeBottom: '-2px',
			unstickyScrollHeightGap: 0,
		});
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});

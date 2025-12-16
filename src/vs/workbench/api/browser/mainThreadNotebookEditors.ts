/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, dispose } from '../../../base/common/lifecycle.js';
import { equals } from '../../../base/common/objects.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { EditorActivation } from '../../../platform/editor/common/editor.js';
import { getNotebookEditorFromEditorPane, INotebookEditor, INotebookEditorOptions } from '../../contrib/notebook/browser/notebookBrowser.js';
import { INotebookEditorService } from '../../contrib/notebook/browser/services/notebookEditorService.js';
import { ICellRange } from '../../contrib/notebook/common/notebookRange.js';
import { columnToEditorGroup, editorGroupToColumn } from '../../services/editor/common/editorGroupColumn.js';
import { IEditorGroupsService } from '../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../services/editor/common/editorService.js';
import { IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostContext, ExtHostNotebookEditorsShape, INotebookDocumentShowOptions, INotebookEditorViewColumnInfo, MainThreadNotebookEditorsShape, NotebookEditorRevealType } from '../common/extHost.protocol.js';

class MainThreadNotebook {

	constructor(
		readonly editor: INotebookEditor,
		readonly disposables: DisposableStore
	) { }

	dispose() {
		this.disposables.dispose();
	}
}

export class MainThreadNotebookEditors implements MainThreadNotebookEditorsShape {

	private readonly _disposables = new DisposableStore();

	private readonly _proxy: ExtHostNotebookEditorsShape;
	private readonly _mainThreadEditors = new Map<string, MainThreadNotebook>();

	private _currentViewColumnInfo?: INotebookEditorViewColumnInfo;

	constructor(
		extHostContext: IExtHostContext,
		@IEditorService private readonly _editorService: IEditorService,
		@INotebookEditorService private readonly _notebookEditorService: INotebookEditorService,
		@IEditorGroupsService private readonly _editorGroupService: IEditorGroupsService,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostNotebookEditors);

		this._editorService.onDidActiveEditorChange(() => this._updateEditorViewColumns(), this, this._disposables);
		this._editorGroupService.onDidRemoveGroup(() => this._updateEditorViewColumns(), this, this._disposables);
		this._editorGroupService.onDidMoveGroup(() => this._updateEditorViewColumns(), this, this._disposables);
	}

	dispose(): void {
		this._disposables.dispose();
		dispose(this._mainThreadEditors.values());
	}

	handleEditorsAdded(editors: readonly INotebookEditor[]): void {

		for (const editor of editors) {

			const editorDisposables = new DisposableStore();
			editorDisposables.add(editor.onDidChangeVisibleRanges(() => {
				this._proxy.$acceptEditorPropertiesChanged(editor.getId(), { visibleRanges: { ranges: editor.visibleRanges } });
			}));

			editorDisposables.add(editor.onDidChangeSelection(() => {
				this._proxy.$acceptEditorPropertiesChanged(editor.getId(), { selections: { selections: editor.getSelections() } });
			}));

			const wrapper = new MainThreadNotebook(editor, editorDisposables);
			this._mainThreadEditors.set(editor.getId(), wrapper);
		}
	}

	handleEditorsRemoved(editorIds: readonly string[]): void {
		for (const id of editorIds) {
			this._mainThreadEditors.get(id)?.dispose();
			this._mainThreadEditors.delete(id);
		}
	}

	private _updateEditorViewColumns(): void {
		const result: INotebookEditorViewColumnInfo = Object.create(null);
		for (const editorPane of this._editorService.visibleEditorPanes) {
			const candidate = getNotebookEditorFromEditorPane(editorPane);
			if (candidate && this._mainThreadEditors.has(candidate.getId())) {
				result[candidate.getId()] = editorGroupToColumn(this._editorGroupService, editorPane.group);
			}
		}
		if (!equals(result, this._currentViewColumnInfo)) {
			this._currentViewColumnInfo = result;
			this._proxy.$acceptEditorViewColumns(result);
		}
	}

	async $tryShowNotebookDocument(resource: UriComponents, viewType: string, options: INotebookDocumentShowOptions): Promise<string> {
		const editorOptions: INotebookEditorOptions = {
			cellSelections: options.selections,
			preserveFocus: options.preserveFocus,
			pinned: options.pinned,
			// selection: options.selection,
			// preserve pre 1.38 behaviour to not make group active when preserveFocus: true
			// but make sure to restore the editor to fix https://github.com/microsoft/vscode/issues/79633
			activation: options.preserveFocus ? EditorActivation.RESTORE : undefined,
			label: options.label,
			override: viewType
		};

		const editorPane = await this._editorService.openEditor({ resource: URI.revive(resource), options: editorOptions }, columnToEditorGroup(this._editorGroupService, this._configurationService, options.position));
		const notebookEditor = getNotebookEditorFromEditorPane(editorPane);

		if (notebookEditor) {
			return notebookEditor.getId();
		} else {
			throw new Error(`Notebook Editor creation failure for document ${JSON.stringify(resource)}`);
		}
	}

	async $tryRevealRange(id: string, range: ICellRange, revealType: NotebookEditorRevealType): Promise<void> {
		const editor = this._notebookEditorService.getNotebookEditor(id);
		if (!editor) {
			return;
		}
		const notebookEditor = editor;
		if (!notebookEditor.hasModel()) {
			return;
		}

		if (range.start >= notebookEditor.getLength()) {
			return;
		}

		const cell = notebookEditor.cellAt(range.start);

		switch (revealType) {
			case NotebookEditorRevealType.Default:
				return notebookEditor.revealCellRangeInView(range);
			case NotebookEditorRevealType.InCenter:
				return notebookEditor.revealInCenter(cell);
			case NotebookEditorRevealType.InCenterIfOutsideViewport:
				return notebookEditor.revealInCenterIfOutsideViewport(cell);
			case NotebookEditorRevealType.AtTop:
				return notebookEditor.revealInViewAtTop(cell);
		}
	}

	$trySetSelections(id: string, ranges: ICellRange[]): void {
		const editor = this._notebookEditorService.getNotebookEditor(id);
		if (!editor) {
			return;
		}

		editor.setSelections(ranges);

		if (ranges.length) {
			editor.setFocus({ start: ranges[0].start, end: ranges[0].start + 1 });
		}
	}
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { diffMaps, diffSets } from '../../../base/common/collections.js';
import { combinedDisposable, DisposableStore, DisposableMap } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { MainThreadNotebookDocuments } from './mainThreadNotebookDocuments.js';
import { NotebookDto } from './mainThreadNotebookDto.js';
import { MainThreadNotebookEditors } from './mainThreadNotebookEditors.js';
import { extHostCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { editorGroupToColumn } from '../../services/editor/common/editorGroupColumn.js';
import { getNotebookEditorFromEditorPane, IActiveNotebookEditor, INotebookEditor } from '../../contrib/notebook/browser/notebookBrowser.js';
import { INotebookEditorService } from '../../contrib/notebook/browser/services/notebookEditorService.js';
import { NotebookTextModel } from '../../contrib/notebook/common/model/notebookTextModel.js';
import { INotebookService } from '../../contrib/notebook/common/notebookService.js';
import { IEditorGroupsService } from '../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../services/editor/common/editorService.js';
import { ExtHostContext, ExtHostNotebookShape, INotebookDocumentsAndEditorsDelta, INotebookEditorAddData, INotebookModelAddedData, MainContext } from '../common/extHost.protocol.js';
import { SerializableObjectWithBuffers } from '../../services/extensions/common/proxyIdentifier.js';

interface INotebookAndEditorDelta {
	removedDocuments: URI[];
	addedDocuments: NotebookTextModel[];
	removedEditors: string[];
	addedEditors: IActiveNotebookEditor[];
	newActiveEditor?: string | null;
	visibleEditors?: string[];
}

class NotebookAndEditorState {
	static delta(before: NotebookAndEditorState | undefined, after: NotebookAndEditorState): INotebookAndEditorDelta {
		if (!before) {
			return {
				addedDocuments: [...after.documents],
				removedDocuments: [],
				addedEditors: [...after.textEditors.values()],
				removedEditors: [],
				visibleEditors: [...after.visibleEditors].map(editor => editor[0])
			};
		}
		const documentDelta = diffSets(before.documents, after.documents);
		const editorDelta = diffMaps(before.textEditors, after.textEditors);

		const newActiveEditor = before.activeEditor !== after.activeEditor ? after.activeEditor : undefined;
		const visibleEditorDelta = diffMaps(before.visibleEditors, after.visibleEditors);

		return {
			addedDocuments: documentDelta.added,
			removedDocuments: documentDelta.removed.map(e => e.uri),
			addedEditors: editorDelta.added,
			removedEditors: editorDelta.removed.map(removed => removed.getId()),
			newActiveEditor: newActiveEditor,
			visibleEditors: visibleEditorDelta.added.length === 0 && visibleEditorDelta.removed.length === 0
				? undefined
				: [...after.visibleEditors].map(editor => editor[0])
		};
	}

	constructor(
		readonly documents: Set<NotebookTextModel>,
		readonly textEditors: Map<string, IActiveNotebookEditor>,
		readonly activeEditor: string | null | undefined,
		readonly visibleEditors: Map<string, IActiveNotebookEditor>
	) {
		//
	}
}

@extHostCustomer
export class MainThreadNotebooksAndEditors {

	// private readonly _onDidAddNotebooks = new Emitter<NotebookTextModel[]>();
	// private readonly _onDidRemoveNotebooks = new Emitter<URI[]>();
	// private readonly _onDidAddEditors = new Emitter<IActiveNotebookEditor[]>();
	// private readonly _onDidRemoveEditors = new Emitter<string[]>();

	// readonly onDidAddNotebooks: Event<NotebookTextModel[]> = this._onDidAddNotebooks.event;
	// readonly onDidRemoveNotebooks: Event<URI[]> = this._onDidRemoveNotebooks.event;
	// readonly onDidAddEditors: Event<IActiveNotebookEditor[]> = this._onDidAddEditors.event;
	// readonly onDidRemoveEditors: Event<string[]> = this._onDidRemoveEditors.event;

	private readonly _proxy: Pick<ExtHostNotebookShape, '$acceptDocumentAndEditorsDelta'>;
	private readonly _disposables = new DisposableStore();

	private readonly _editorListeners = new DisposableMap<string>();

	private _currentState?: NotebookAndEditorState;

	private readonly _mainThreadNotebooks: MainThreadNotebookDocuments;
	private readonly _mainThreadEditors: MainThreadNotebookEditors;

	constructor(
		extHostContext: IExtHostContext,
		@IInstantiationService instantiationService: IInstantiationService,
		@INotebookService private readonly _notebookService: INotebookService,
		@INotebookEditorService private readonly _notebookEditorService: INotebookEditorService,
		@IEditorService private readonly _editorService: IEditorService,
		@IEditorGroupsService private readonly _editorGroupService: IEditorGroupsService,
		@ILogService private readonly _logService: ILogService,
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostNotebook);

		this._mainThreadNotebooks = instantiationService.createInstance(MainThreadNotebookDocuments, extHostContext);
		this._mainThreadEditors = instantiationService.createInstance(MainThreadNotebookEditors, extHostContext);

		extHostContext.set(MainContext.MainThreadNotebookDocuments, this._mainThreadNotebooks);
		extHostContext.set(MainContext.MainThreadNotebookEditors, this._mainThreadEditors);

		this._notebookService.onWillAddNotebookDocument(() => this._updateState(), this, this._disposables);
		this._notebookService.onDidRemoveNotebookDocument(() => this._updateState(), this, this._disposables);
		this._editorService.onDidActiveEditorChange(() => this._updateState(), this, this._disposables);
		this._editorService.onDidVisibleEditorsChange(() => this._updateState(), this, this._disposables);
		this._notebookEditorService.onDidAddNotebookEditor(this._handleEditorAdd, this, this._disposables);
		this._notebookEditorService.onDidRemoveNotebookEditor(this._handleEditorRemove, this, this._disposables);
		this._updateState();
	}

	dispose() {
		this._mainThreadNotebooks.dispose();
		this._mainThreadEditors.dispose();
		this._disposables.dispose();
		this._editorListeners.dispose();
	}

	private _handleEditorAdd(editor: INotebookEditor): void {
		this._editorListeners.set(editor.getId(), combinedDisposable(
			editor.onDidChangeModel(() => this._updateState()),
			editor.onDidFocusWidget(() => this._updateState(editor)),
		));
		this._updateState();
	}

	private _handleEditorRemove(editor: INotebookEditor): void {
		this._editorListeners.deleteAndDispose(editor.getId());
		this._updateState();
	}

	private _updateState(focusedEditor?: INotebookEditor): void {

		const editors = new Map<string, IActiveNotebookEditor>();
		const visibleEditorsMap = new Map<string, IActiveNotebookEditor>();

		for (const editor of this._notebookEditorService.listNotebookEditors()) {
			if (editor.hasModel()) {
				editors.set(editor.getId(), editor);
			}
		}

		const activeNotebookEditor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
		let activeEditor: string | null = null;
		if (activeNotebookEditor) {
			activeEditor = activeNotebookEditor.getId();
		} else if (focusedEditor?.textModel) {
			activeEditor = focusedEditor.getId();
		}
		if (activeEditor && !editors.has(activeEditor)) {
			this._logService.trace('MainThreadNotebooksAndEditors#_updateState: active editor is not in editors list', activeEditor, editors.keys());
			activeEditor = null;
		}

		for (const editorPane of this._editorService.visibleEditorPanes) {
			const notebookEditor = getNotebookEditorFromEditorPane(editorPane);
			if (notebookEditor?.hasModel() && editors.has(notebookEditor.getId())) {
				visibleEditorsMap.set(notebookEditor.getId(), notebookEditor);
			}
		}

		const newState = new NotebookAndEditorState(new Set(this._notebookService.listNotebookDocuments()), editors, activeEditor, visibleEditorsMap);
		this._onDelta(NotebookAndEditorState.delta(this._currentState, newState));
		this._currentState = newState;
	}

	private _onDelta(delta: INotebookAndEditorDelta): void {
		if (MainThreadNotebooksAndEditors._isDeltaEmpty(delta)) {
			return;
		}

		const dto: INotebookDocumentsAndEditorsDelta = {
			removedDocuments: delta.removedDocuments,
			removedEditors: delta.removedEditors,
			newActiveEditor: delta.newActiveEditor,
			visibleEditors: delta.visibleEditors,
			addedDocuments: delta.addedDocuments.map(MainThreadNotebooksAndEditors._asModelAddData),
			addedEditors: delta.addedEditors.map(this._asEditorAddData, this),
		};

		// send to extension FIRST
		this._proxy.$acceptDocumentAndEditorsDelta(new SerializableObjectWithBuffers(dto));

		// handle internally
		this._mainThreadEditors.handleEditorsRemoved(delta.removedEditors);
		this._mainThreadNotebooks.handleNotebooksRemoved(delta.removedDocuments);
		this._mainThreadNotebooks.handleNotebooksAdded(delta.addedDocuments);
		this._mainThreadEditors.handleEditorsAdded(delta.addedEditors);
	}

	private static _isDeltaEmpty(delta: INotebookAndEditorDelta): boolean {
		if (delta.addedDocuments !== undefined && delta.addedDocuments.length > 0) {
			return false;
		}
		if (delta.removedDocuments !== undefined && delta.removedDocuments.length > 0) {
			return false;
		}
		if (delta.addedEditors !== undefined && delta.addedEditors.length > 0) {
			return false;
		}
		if (delta.removedEditors !== undefined && delta.removedEditors.length > 0) {
			return false;
		}
		if (delta.visibleEditors !== undefined && delta.visibleEditors.length > 0) {
			return false;
		}
		if (delta.newActiveEditor !== undefined) {
			return false;
		}
		return true;
	}

	private static _asModelAddData(e: NotebookTextModel): INotebookModelAddedData {
		return {
			viewType: e.viewType,
			uri: e.uri,
			metadata: e.metadata,
			versionId: e.versionId,
			cells: e.cells.map(NotebookDto.toNotebookCellDto)
		};
	}

	private _asEditorAddData(add: IActiveNotebookEditor): INotebookEditorAddData {

		const pane = this._editorService.visibleEditorPanes.find(pane => getNotebookEditorFromEditorPane(pane) === add);

		return {
			id: add.getId(),
			documentUri: add.textModel.uri,
			selections: add.getSelections(),
			visibleRanges: add.visibleRanges,
			viewColumn: pane && editorGroupToColumn(this._editorGroupService, pane.group),
			viewType: add.getViewModel().viewType
		};
	}
}

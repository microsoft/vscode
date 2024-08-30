/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { combinedDisposable, DisposableStore, DisposableMap } from '../../../base/common/lifecycle.js';
import { ICodeEditor, isCodeEditor, isDiffEditor, IActiveCodeEditor } from '../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../editor/browser/services/codeEditorService.js';
import { IEditor } from '../../../editor/common/editorCommon.js';
import { ITextModel, shouldSynchronizeModel } from '../../../editor/common/model.js';
import { IModelService } from '../../../editor/common/services/model.js';
import { ITextModelService } from '../../../editor/common/services/resolverService.js';
import { IFileService } from '../../../platform/files/common/files.js';
import { extHostCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { MainThreadDocuments } from './mainThreadDocuments.js';
import { MainThreadTextEditor } from './mainThreadEditor.js';
import { MainThreadTextEditors } from './mainThreadEditors.js';
import { ExtHostContext, ExtHostDocumentsAndEditorsShape, IDocumentsAndEditorsDelta, IModelAddedData, ITextEditorAddData, MainContext } from '../common/extHost.protocol.js';
import { AbstractTextEditor } from '../../browser/parts/editor/textEditor.js';
import { IEditorPane } from '../../common/editor.js';
import { EditorGroupColumn, editorGroupToColumn } from '../../services/editor/common/editorGroupColumn.js';
import { IEditorService } from '../../services/editor/common/editorService.js';
import { IEditorGroupsService } from '../../services/editor/common/editorGroupsService.js';
import { ITextFileService } from '../../services/textfile/common/textfiles.js';
import { IWorkbenchEnvironmentService } from '../../services/environment/common/environmentService.js';
import { IWorkingCopyFileService } from '../../services/workingCopy/common/workingCopyFileService.js';
import { IUriIdentityService } from '../../../platform/uriIdentity/common/uriIdentity.js';
import { IClipboardService } from '../../../platform/clipboard/common/clipboardService.js';
import { IPathService } from '../../services/path/common/pathService.js';
import { diffSets, diffMaps } from '../../../base/common/collections.js';
import { IPaneCompositePartService } from '../../services/panecomposite/browser/panecomposite.js';
import { ViewContainerLocation } from '../../common/views.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';


class TextEditorSnapshot {

	readonly id: string;

	constructor(
		readonly editor: IActiveCodeEditor,
	) {
		this.id = `${editor.getId()},${editor.getModel().id}`;
	}
}

class DocumentAndEditorStateDelta {

	readonly isEmpty: boolean;

	constructor(
		readonly removedDocuments: ITextModel[],
		readonly addedDocuments: ITextModel[],
		readonly removedEditors: TextEditorSnapshot[],
		readonly addedEditors: TextEditorSnapshot[],
		readonly oldActiveEditor: string | null | undefined,
		readonly newActiveEditor: string | null | undefined,
	) {
		this.isEmpty = this.removedDocuments.length === 0
			&& this.addedDocuments.length === 0
			&& this.removedEditors.length === 0
			&& this.addedEditors.length === 0
			&& oldActiveEditor === newActiveEditor;
	}

	toString(): string {
		let ret = 'DocumentAndEditorStateDelta\n';
		ret += `\tRemoved Documents: [${this.removedDocuments.map(d => d.uri.toString(true)).join(', ')}]\n`;
		ret += `\tAdded Documents: [${this.addedDocuments.map(d => d.uri.toString(true)).join(', ')}]\n`;
		ret += `\tRemoved Editors: [${this.removedEditors.map(e => e.id).join(', ')}]\n`;
		ret += `\tAdded Editors: [${this.addedEditors.map(e => e.id).join(', ')}]\n`;
		ret += `\tNew Active Editor: ${this.newActiveEditor}\n`;
		return ret;
	}
}

class DocumentAndEditorState {

	static compute(before: DocumentAndEditorState | undefined, after: DocumentAndEditorState): DocumentAndEditorStateDelta {
		if (!before) {
			return new DocumentAndEditorStateDelta(
				[], [...after.documents.values()],
				[], [...after.textEditors.values()],
				undefined, after.activeEditor
			);
		}
		const documentDelta = diffSets(before.documents, after.documents);
		const editorDelta = diffMaps(before.textEditors, after.textEditors);
		const oldActiveEditor = before.activeEditor !== after.activeEditor ? before.activeEditor : undefined;
		const newActiveEditor = before.activeEditor !== after.activeEditor ? after.activeEditor : undefined;

		return new DocumentAndEditorStateDelta(
			documentDelta.removed, documentDelta.added,
			editorDelta.removed, editorDelta.added,
			oldActiveEditor, newActiveEditor
		);
	}

	constructor(
		readonly documents: Set<ITextModel>,
		readonly textEditors: Map<string, TextEditorSnapshot>,
		readonly activeEditor: string | null | undefined,
	) {
		//
	}
}

const enum ActiveEditorOrder {
	Editor, Panel
}

class MainThreadDocumentAndEditorStateComputer {

	private readonly _toDispose = new DisposableStore();
	private readonly _toDisposeOnEditorRemove = new DisposableMap<string>();
	private _currentState?: DocumentAndEditorState;
	private _activeEditorOrder: ActiveEditorOrder = ActiveEditorOrder.Editor;

	constructor(
		private readonly _onDidChangeState: (delta: DocumentAndEditorStateDelta) => void,
		@IModelService private readonly _modelService: IModelService,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@IEditorService private readonly _editorService: IEditorService,
		@IPaneCompositePartService private readonly _paneCompositeService: IPaneCompositePartService,
	) {
		this._modelService.onModelAdded(this._updateStateOnModelAdd, this, this._toDispose);
		this._modelService.onModelRemoved(_ => this._updateState(), this, this._toDispose);
		this._editorService.onDidActiveEditorChange(_ => this._updateState(), this, this._toDispose);

		this._codeEditorService.onCodeEditorAdd(this._onDidAddEditor, this, this._toDispose);
		this._codeEditorService.onCodeEditorRemove(this._onDidRemoveEditor, this, this._toDispose);
		this._codeEditorService.listCodeEditors().forEach(this._onDidAddEditor, this);

		Event.filter(this._paneCompositeService.onDidPaneCompositeOpen, event => event.viewContainerLocation === ViewContainerLocation.Panel)(_ => this._activeEditorOrder = ActiveEditorOrder.Panel, undefined, this._toDispose);
		Event.filter(this._paneCompositeService.onDidPaneCompositeClose, event => event.viewContainerLocation === ViewContainerLocation.Panel)(_ => this._activeEditorOrder = ActiveEditorOrder.Editor, undefined, this._toDispose);
		this._editorService.onDidVisibleEditorsChange(_ => this._activeEditorOrder = ActiveEditorOrder.Editor, undefined, this._toDispose);

		this._updateState();
	}

	dispose(): void {
		this._toDispose.dispose();
		this._toDisposeOnEditorRemove.dispose();
	}

	private _onDidAddEditor(e: ICodeEditor): void {
		this._toDisposeOnEditorRemove.set(e.getId(), combinedDisposable(
			e.onDidChangeModel(() => this._updateState()),
			e.onDidFocusEditorText(() => this._updateState()),
			e.onDidFocusEditorWidget(() => this._updateState(e))
		));
		this._updateState();
	}

	private _onDidRemoveEditor(e: ICodeEditor): void {
		const id = e.getId();
		if (this._toDisposeOnEditorRemove.has(id)) {
			this._toDisposeOnEditorRemove.deleteAndDispose(id);
			this._updateState();
		}
	}

	private _updateStateOnModelAdd(model: ITextModel): void {
		if (!shouldSynchronizeModel(model)) {
			// ignore
			return;
		}

		if (!this._currentState) {
			// too early
			this._updateState();
			return;
		}

		// small (fast) delta
		this._currentState = new DocumentAndEditorState(
			this._currentState.documents.add(model),
			this._currentState.textEditors,
			this._currentState.activeEditor
		);

		this._onDidChangeState(new DocumentAndEditorStateDelta(
			[], [model],
			[], [],
			undefined, undefined
		));
	}

	private _updateState(widgetFocusCandidate?: ICodeEditor): void {

		// models: ignore too large models
		const models = new Set<ITextModel>();
		for (const model of this._modelService.getModels()) {
			if (shouldSynchronizeModel(model)) {
				models.add(model);
			}
		}

		// editor: only take those that have a not too large model
		const editors = new Map<string, TextEditorSnapshot>();
		let activeEditor: string | null = null; // Strict null work. This doesn't like being undefined!

		for (const editor of this._codeEditorService.listCodeEditors()) {
			if (editor.isSimpleWidget) {
				continue;
			}
			const model = editor.getModel();
			if (editor.hasModel() && model && shouldSynchronizeModel(model)
				&& !model.isDisposed() // model disposed
				&& Boolean(this._modelService.getModel(model.uri)) // model disposing, the flag didn't flip yet but the model service already removed it
			) {
				const apiEditor = new TextEditorSnapshot(editor);
				editors.set(apiEditor.id, apiEditor);
				if (editor.hasTextFocus() || (widgetFocusCandidate === editor && editor.hasWidgetFocus())) {
					// text focus has priority, widget focus is tricky because multiple
					// editors might claim widget focus at the same time. therefore we use a
					// candidate (which is the editor that has raised an widget focus event)
					// in addition to the widget focus check
					activeEditor = apiEditor.id;
				}
			}
		}

		// active editor: if none of the previous editors had focus we try
		// to match output panels or the active workbench editor with
		// one of editor we have just computed
		if (!activeEditor) {
			let candidate: IEditor | undefined;
			if (this._activeEditorOrder === ActiveEditorOrder.Editor) {
				candidate = this._getActiveEditorFromEditorPart() || this._getActiveEditorFromPanel();
			} else {
				candidate = this._getActiveEditorFromPanel() || this._getActiveEditorFromEditorPart();
			}

			if (candidate) {
				for (const snapshot of editors.values()) {
					if (candidate === snapshot.editor) {
						activeEditor = snapshot.id;
					}
				}
			}
		}

		// compute new state and compare against old
		const newState = new DocumentAndEditorState(models, editors, activeEditor);
		const delta = DocumentAndEditorState.compute(this._currentState, newState);
		if (!delta.isEmpty) {
			this._currentState = newState;
			this._onDidChangeState(delta);
		}
	}

	private _getActiveEditorFromPanel(): IEditor | undefined {
		const panel = this._paneCompositeService.getActivePaneComposite(ViewContainerLocation.Panel);
		if (panel instanceof AbstractTextEditor) {
			const control = panel.getControl();
			if (isCodeEditor(control)) {
				return control;
			}
		}

		return undefined;
	}

	private _getActiveEditorFromEditorPart(): IEditor | undefined {
		let activeTextEditorControl = this._editorService.activeTextEditorControl;
		if (isDiffEditor(activeTextEditorControl)) {
			activeTextEditorControl = activeTextEditorControl.getModifiedEditor();
		}
		return activeTextEditorControl;
	}
}

@extHostCustomer
export class MainThreadDocumentsAndEditors {

	private readonly _toDispose = new DisposableStore();
	private readonly _proxy: ExtHostDocumentsAndEditorsShape;
	private readonly _mainThreadDocuments: MainThreadDocuments;
	private readonly _mainThreadEditors: MainThreadTextEditors;
	private readonly _textEditors = new Map<string, MainThreadTextEditor>();

	constructor(
		extHostContext: IExtHostContext,
		@IModelService private readonly _modelService: IModelService,
		@ITextFileService private readonly _textFileService: ITextFileService,
		@IEditorService private readonly _editorService: IEditorService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@IFileService fileService: IFileService,
		@ITextModelService textModelResolverService: ITextModelService,
		@IEditorGroupsService private readonly _editorGroupService: IEditorGroupsService,
		@IPaneCompositePartService paneCompositeService: IPaneCompositePartService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IWorkingCopyFileService workingCopyFileService: IWorkingCopyFileService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@IClipboardService private readonly _clipboardService: IClipboardService,
		@IPathService pathService: IPathService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostDocumentsAndEditors);

		this._mainThreadDocuments = this._toDispose.add(new MainThreadDocuments(extHostContext, this._modelService, this._textFileService, fileService, textModelResolverService, environmentService, uriIdentityService, workingCopyFileService, pathService));
		extHostContext.set(MainContext.MainThreadDocuments, this._mainThreadDocuments);

		this._mainThreadEditors = this._toDispose.add(new MainThreadTextEditors(this, extHostContext, codeEditorService, this._editorService, this._editorGroupService, configurationService));
		extHostContext.set(MainContext.MainThreadTextEditors, this._mainThreadEditors);

		// It is expected that the ctor of the state computer calls our `_onDelta`.
		this._toDispose.add(new MainThreadDocumentAndEditorStateComputer(delta => this._onDelta(delta), _modelService, codeEditorService, this._editorService, paneCompositeService));
	}

	dispose(): void {
		this._toDispose.dispose();
	}

	private _onDelta(delta: DocumentAndEditorStateDelta): void {

		const removedEditors: string[] = [];
		const addedEditors: MainThreadTextEditor[] = [];

		// removed models
		const removedDocuments = delta.removedDocuments.map(m => m.uri);

		// added editors
		for (const apiEditor of delta.addedEditors) {
			const mainThreadEditor = new MainThreadTextEditor(apiEditor.id, apiEditor.editor.getModel(),
				apiEditor.editor, { onGainedFocus() { }, onLostFocus() { } }, this._mainThreadDocuments, this._modelService, this._clipboardService);

			this._textEditors.set(apiEditor.id, mainThreadEditor);
			addedEditors.push(mainThreadEditor);
		}

		// removed editors
		for (const { id } of delta.removedEditors) {
			const mainThreadEditor = this._textEditors.get(id);
			if (mainThreadEditor) {
				mainThreadEditor.dispose();
				this._textEditors.delete(id);
				removedEditors.push(id);
			}
		}

		const extHostDelta: IDocumentsAndEditorsDelta = Object.create(null);
		let empty = true;
		if (delta.newActiveEditor !== undefined) {
			empty = false;
			extHostDelta.newActiveEditor = delta.newActiveEditor;
		}
		if (removedDocuments.length > 0) {
			empty = false;
			extHostDelta.removedDocuments = removedDocuments;
		}
		if (removedEditors.length > 0) {
			empty = false;
			extHostDelta.removedEditors = removedEditors;
		}
		if (delta.addedDocuments.length > 0) {
			empty = false;
			extHostDelta.addedDocuments = delta.addedDocuments.map(m => this._toModelAddData(m));
		}
		if (delta.addedEditors.length > 0) {
			empty = false;
			extHostDelta.addedEditors = addedEditors.map(e => this._toTextEditorAddData(e));
		}

		if (!empty) {
			// first update ext host
			this._proxy.$acceptDocumentsAndEditorsDelta(extHostDelta);

			// second update dependent document/editor states
			removedDocuments.forEach(this._mainThreadDocuments.handleModelRemoved, this._mainThreadDocuments);
			delta.addedDocuments.forEach(this._mainThreadDocuments.handleModelAdded, this._mainThreadDocuments);

			removedEditors.forEach(this._mainThreadEditors.handleTextEditorRemoved, this._mainThreadEditors);
			addedEditors.forEach(this._mainThreadEditors.handleTextEditorAdded, this._mainThreadEditors);
		}
	}

	private _toModelAddData(model: ITextModel): IModelAddedData {
		return {
			uri: model.uri,
			versionId: model.getVersionId(),
			lines: model.getLinesContent(),
			EOL: model.getEOL(),
			languageId: model.getLanguageId(),
			isDirty: this._textFileService.isDirty(model.uri)
		};
	}

	private _toTextEditorAddData(textEditor: MainThreadTextEditor): ITextEditorAddData {
		const props = textEditor.getProperties();
		return {
			id: textEditor.getId(),
			documentUri: textEditor.getModel().uri,
			options: props.options,
			selections: props.selections,
			visibleRanges: props.visibleRanges,
			editorPosition: this._findEditorPosition(textEditor)
		};
	}

	private _findEditorPosition(editor: MainThreadTextEditor): EditorGroupColumn | undefined {
		for (const editorPane of this._editorService.visibleEditorPanes) {
			if (editor.matches(editorPane)) {
				return editorGroupToColumn(this._editorGroupService, editorPane.group);
			}
		}
		return undefined;
	}

	findTextEditorIdFor(editorPane: IEditorPane): string | undefined {
		for (const [id, editor] of this._textEditors) {
			if (editor.matches(editorPane)) {
				return id;
			}
		}
		return undefined;
	}

	getIdOfCodeEditor(codeEditor: ICodeEditor): string | undefined {
		for (const [id, editor] of this._textEditors) {
			if (editor.getCodeEditor() === codeEditor) {
				return id;
			}
		}
		return undefined;
	}

	getEditor(id: string): MainThreadTextEditor | undefined {
		return this._textEditors.get(id);
	}
}

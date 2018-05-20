/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { disposed } from 'vs/base/common/errors';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { equals as objectEquals } from 'vs/base/common/objects';
import URI, { UriComponents } from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IBulkEditService } from 'vs/editor/browser/services/bulkEditService';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { IRange } from 'vs/editor/common/core/range';
import { ISelection } from 'vs/editor/common/core/selection';
import { IDecorationOptions, IDecorationRenderOptions, ILineChange } from 'vs/editor/common/editorCommon';
import { ISingleEditOperation } from 'vs/editor/common/model';
import { ITextEditorOptions, Position as EditorPosition } from 'vs/platform/editor/common/editor';
import { IApplyEditsOptions, ITextEditorConfigurationUpdate, IUndoStopOptions, TextEditorRevealType, WorkspaceEditDto, reviveWorkspaceEditDto } from 'vs/workbench/api/node/extHost.protocol';
import { INextEditorService, SIDE_GROUP, ACTIVE_GROUP } from 'vs/workbench/services/editor/common/nextEditorService';
import { INextEditorGroupsService } from 'vs/workbench/services/group/common/nextEditorGroupsService';
import { GroupIdentifier } from 'vs/workbench/common/editor';
import { ExtHostContext, ExtHostEditorsShape, IExtHostContext, ITextDocumentShowOptions, ITextEditorPositionData, MainThreadTextEditorsShape } from '../node/extHost.protocol';
import { MainThreadDocumentsAndEditors } from './mainThreadDocumentsAndEditors';
import { MainThreadTextEditor } from './mainThreadEditor';

export class MainThreadTextEditors implements MainThreadTextEditorsShape {

	private _proxy: ExtHostEditorsShape;
	private _documentsAndEditors: MainThreadDocumentsAndEditors;
	private _toDispose: IDisposable[];
	private _textEditorsListenersMap: { [editorId: string]: IDisposable[]; };
	private _editorPositionData: ITextEditorPositionData;
	private _registeredDecorationTypes: { [decorationType: string]: boolean; };

	constructor(
		documentsAndEditors: MainThreadDocumentsAndEditors,
		extHostContext: IExtHostContext,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@IBulkEditService private readonly _bulkEditService: IBulkEditService,
		@INextEditorService private readonly _editorService: INextEditorService,
		@INextEditorGroupsService private readonly _editorGroupService: INextEditorGroupsService
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostEditors);
		this._documentsAndEditors = documentsAndEditors;
		this._toDispose = [];
		this._textEditorsListenersMap = Object.create(null);
		this._editorPositionData = null;

		this._toDispose.push(documentsAndEditors.onTextEditorAdd(editors => editors.forEach(this._onTextEditorAdd, this)));
		this._toDispose.push(documentsAndEditors.onTextEditorRemove(editors => editors.forEach(this._onTextEditorRemove, this)));

		this._toDispose.push(this._editorService.onDidVisibleEditorsChange(() => this._updateActiveAndVisibleTextEditors()));

		this._registeredDecorationTypes = Object.create(null);
	}

	public dispose(): void {
		Object.keys(this._textEditorsListenersMap).forEach((editorId) => {
			dispose(this._textEditorsListenersMap[editorId]);
		});
		this._textEditorsListenersMap = Object.create(null);
		this._toDispose = dispose(this._toDispose);
		for (let decorationType in this._registeredDecorationTypes) {
			this._codeEditorService.removeDecorationType(decorationType);
		}
		this._registeredDecorationTypes = Object.create(null);
	}

	private _onTextEditorAdd(textEditor: MainThreadTextEditor): void {
		let id = textEditor.getId();
		let toDispose: IDisposable[] = [];
		toDispose.push(textEditor.onPropertiesChanged((data) => {
			this._proxy.$acceptEditorPropertiesChanged(id, data);
		}));

		this._textEditorsListenersMap[id] = toDispose;
	}

	private _onTextEditorRemove(id: string): void {
		dispose(this._textEditorsListenersMap[id]);
		delete this._textEditorsListenersMap[id];
	}

	private _updateActiveAndVisibleTextEditors(): void {

		// editor columns
		let editorPositionData = this._getTextEditorPositionData();
		if (!objectEquals(this._editorPositionData, editorPositionData)) {
			this._editorPositionData = editorPositionData;
			this._proxy.$acceptEditorPositionData(this._editorPositionData);
		}
	}

	private _getTextEditorPositionData(): ITextEditorPositionData {
		let result: ITextEditorPositionData = Object.create(null);
		for (let workbenchEditor of this._editorService.visibleControls) {
			const id = this._documentsAndEditors.findTextEditorIdFor(workbenchEditor);
			if (id) {
				result[id] = this._documentsAndEditors.findEditorPosition(workbenchEditor);
			}
		}
		return result;
	}

	// --- from extension host process

	$tryShowTextDocument(resource: UriComponents, options: ITextDocumentShowOptions): TPromise<string> {
		const uri = URI.revive(resource);

		const editorOptions: ITextEditorOptions = {
			preserveFocus: options.preserveFocus,
			pinned: options.pinned,
			selection: options.selection
		};

		const input = {
			resource: uri,
			options: editorOptions
		};

		return this._editorService.openEditor(input, this._findEditorGroup(options.position)).then(editor => {
			if (!editor) {
				return undefined;
			}
			return this._documentsAndEditors.findTextEditorIdFor(editor);
		});
	}

	$tryShowEditor(id: string, position: EditorPosition): TPromise<void> {
		let mainThreadEditor = this._documentsAndEditors.getEditor(id);
		if (mainThreadEditor) {
			let model = mainThreadEditor.getModel();
			return this._editorService.openEditor({
				resource: model.uri,
				options: { preserveFocus: false }
			}, this._findEditorGroup(position)).then(() => { return; });
		}
		return undefined;
	}

	private _findEditorGroup(position?: EditorPosition): GroupIdentifier {
		if (typeof position !== 'number') {
			return ACTIVE_GROUP; // prefer active group when position is undefined
		}

		const groups = this._editorGroupService.groups;

		let candidate = groups[position];
		if (candidate) {
			return candidate.id; // found direct match
		}

		let firstGroup = groups[0];
		if (groups.length === 1 && firstGroup.count === 0) {
			return firstGroup.id; // first editor should always open in first group
		}

		return SIDE_GROUP; // open to the side if group not found
	}

	$tryHideEditor(id: string): TPromise<void> {
		let mainThreadEditor = this._documentsAndEditors.getEditor(id);
		if (mainThreadEditor) {
			let editors = this._editorService.visibleControls;
			for (let editor of editors) {
				if (mainThreadEditor.matches(editor)) {
					return editor.group.closeEditor(editor.input).then(() => { return; });
				}
			}
		}
		return undefined;
	}

	$trySetSelections(id: string, selections: ISelection[]): TPromise<void> {
		if (!this._documentsAndEditors.getEditor(id)) {
			return TPromise.wrapError(disposed(`TextEditor(${id})`));
		}
		this._documentsAndEditors.getEditor(id).setSelections(selections);
		return TPromise.as(null);
	}

	$trySetDecorations(id: string, key: string, ranges: IDecorationOptions[]): TPromise<void> {
		if (!this._documentsAndEditors.getEditor(id)) {
			return TPromise.wrapError(disposed(`TextEditor(${id})`));
		}
		this._documentsAndEditors.getEditor(id).setDecorations(key, ranges);
		return TPromise.as(null);
	}

	$trySetDecorationsFast(id: string, key: string, ranges: number[]): TPromise<void> {
		if (!this._documentsAndEditors.getEditor(id)) {
			return TPromise.wrapError(disposed(`TextEditor(${id})`));
		}
		this._documentsAndEditors.getEditor(id).setDecorationsFast(key, ranges);
		return TPromise.as(null);
	}

	$tryRevealRange(id: string, range: IRange, revealType: TextEditorRevealType): TPromise<void> {
		if (!this._documentsAndEditors.getEditor(id)) {
			return TPromise.wrapError(disposed(`TextEditor(${id})`));
		}
		this._documentsAndEditors.getEditor(id).revealRange(range, revealType);
		return undefined;
	}

	$trySetOptions(id: string, options: ITextEditorConfigurationUpdate): TPromise<void> {
		if (!this._documentsAndEditors.getEditor(id)) {
			return TPromise.wrapError(disposed(`TextEditor(${id})`));
		}
		this._documentsAndEditors.getEditor(id).setConfiguration(options);
		return TPromise.as(null);
	}

	$tryApplyEdits(id: string, modelVersionId: number, edits: ISingleEditOperation[], opts: IApplyEditsOptions): TPromise<boolean> {
		if (!this._documentsAndEditors.getEditor(id)) {
			return TPromise.wrapError<boolean>(disposed(`TextEditor(${id})`));
		}
		return TPromise.as(this._documentsAndEditors.getEditor(id).applyEdits(modelVersionId, edits, opts));
	}

	$tryApplyWorkspaceEdit(dto: WorkspaceEditDto): TPromise<boolean> {
		const { edits } = reviveWorkspaceEditDto(dto);
		return this._bulkEditService.apply({ edits }, undefined).then(() => true, err => false);
	}

	$tryInsertSnippet(id: string, template: string, ranges: IRange[], opts: IUndoStopOptions): TPromise<boolean> {
		if (!this._documentsAndEditors.getEditor(id)) {
			return TPromise.wrapError<boolean>(disposed(`TextEditor(${id})`));
		}
		return TPromise.as(this._documentsAndEditors.getEditor(id).insertSnippet(template, ranges, opts));
	}

	$registerTextEditorDecorationType(key: string, options: IDecorationRenderOptions): void {
		this._registeredDecorationTypes[key] = true;
		this._codeEditorService.registerDecorationType(key, options);
	}

	$removeTextEditorDecorationType(key: string): void {
		delete this._registeredDecorationTypes[key];
		this._codeEditorService.removeDecorationType(key);
	}

	$getDiffInformation(id: string): TPromise<ILineChange[]> {
		const editor = this._documentsAndEditors.getEditor(id);

		if (!editor) {
			return TPromise.wrapError<ILineChange[]>(new Error('No such TextEditor'));
		}

		const codeEditor = editor.getCodeEditor();
		const codeEditorId = codeEditor.getId();
		const diffEditors = this._codeEditorService.listDiffEditors();
		const [diffEditor] = diffEditors.filter(d => d.getOriginalEditor().getId() === codeEditorId || d.getModifiedEditor().getId() === codeEditorId);

		if (!diffEditor) {
			return TPromise.as([]);
		}

		return TPromise.as(diffEditor.getLineChanges());
	}
}

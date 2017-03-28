/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { ISingleEditOperation, ISelection, IRange, IDecorationRenderOptions, IDecorationOptions, ILineChange } from 'vs/editor/common/editorCommon';
import { ICodeEditorService } from 'vs/editor/common/services/codeEditorService';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { Position as EditorPosition } from 'vs/platform/editor/common/editor';
import { TextEditorRevealType, MainThreadTextEditor, IApplyEditsOptions, IUndoStopOptions, ITextEditorConfigurationUpdate } from 'vs/workbench/api/node/mainThreadEditor';
import { MainThreadDocumentsAndEditors } from './mainThreadDocumentsAndEditors';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { equals as objectEquals } from 'vs/base/common/objects';
import { ExtHostContext, MainThreadEditorsShape, ExtHostEditorsShape, ITextEditorPositionData } from './extHost.protocol';

export class MainThreadEditors extends MainThreadEditorsShape {

	private _proxy: ExtHostEditorsShape;
	private _documentsAndEditors: MainThreadDocumentsAndEditors;
	private _workbenchEditorService: IWorkbenchEditorService;
	private _telemetryService: ITelemetryService;
	private _toDispose: IDisposable[];
	private _textEditorsListenersMap: { [editorId: string]: IDisposable[]; };
	private _editorPositionData: ITextEditorPositionData;

	constructor(
		documentsAndEditors: MainThreadDocumentsAndEditors,
		@ICodeEditorService private _codeEditorService: ICodeEditorService,
		@IThreadService threadService: IThreadService,
		@IWorkbenchEditorService workbenchEditorService: IWorkbenchEditorService,
		@IEditorGroupService editorGroupService: IEditorGroupService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		super();
		this._proxy = threadService.get(ExtHostContext.ExtHostEditors);
		this._documentsAndEditors = documentsAndEditors;
		this._workbenchEditorService = workbenchEditorService;
		this._telemetryService = telemetryService;
		this._toDispose = [];
		this._textEditorsListenersMap = Object.create(null);
		this._editorPositionData = null;

		this._toDispose.push(documentsAndEditors.onTextEditorAdd(editors => editors.forEach(this._onTextEditorAdd, this)));
		this._toDispose.push(documentsAndEditors.onTextEditorRemove(editors => editors.forEach(this._onTextEditorRemove, this)));

		this._toDispose.push(editorGroupService.onEditorsChanged(() => this._updateActiveAndVisibleTextEditors()));
		this._toDispose.push(editorGroupService.onEditorsMoved(() => this._updateActiveAndVisibleTextEditors()));
	}

	public dispose(): void {
		Object.keys(this._textEditorsListenersMap).forEach((editorId) => {
			dispose(this._textEditorsListenersMap[editorId]);
		});
		this._textEditorsListenersMap = Object.create(null);
		this._toDispose = dispose(this._toDispose);
	}

	private _onTextEditorAdd(textEditor: MainThreadTextEditor): void {
		let id = textEditor.getId();
		let toDispose: IDisposable[] = [];
		toDispose.push(textEditor.onConfigurationChanged((opts) => {
			this._proxy.$acceptOptionsChanged(id, opts);
		}));
		toDispose.push(textEditor.onSelectionChanged((event) => {
			this._proxy.$acceptSelectionsChanged(id, event);
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
		for (let workbenchEditor of this._workbenchEditorService.getVisibleEditors()) {
			const id = this._documentsAndEditors.findTextEditorIdFor(workbenchEditor);
			if (id) {
				result[id] = workbenchEditor.position;
			}
		}
		return result;
	}

	// --- from extension host process

	$tryShowTextDocument(resource: URI, position: EditorPosition, preserveFocus: boolean): TPromise<string> {

		const input = {
			resource,
			options: { preserveFocus, pinned: true }
		};

		return this._workbenchEditorService.openEditor(input, position).then(editor => {
			if (!editor) {
				return undefined;
			}
			return this._documentsAndEditors.findTextEditorIdFor(editor);
		});
	}

	$tryShowEditor(id: string, position: EditorPosition): TPromise<void> {
		// check how often this is used
		this._telemetryService.publicLog('api.deprecated', { function: 'TextEditor.show' });

		let mainThreadEditor = this._documentsAndEditors.getEditor(id);
		if (mainThreadEditor) {
			let model = mainThreadEditor.getModel();
			return this._workbenchEditorService.openEditor({
				resource: model.uri,
				options: { preserveFocus: false }
			}, position).then(() => { return; });
		}
		return undefined;
	}

	$tryHideEditor(id: string): TPromise<void> {
		// check how often this is used
		this._telemetryService.publicLog('api.deprecated', { function: 'TextEditor.hide' });

		let mainThreadEditor = this._documentsAndEditors.getEditor(id);
		if (mainThreadEditor) {
			let editors = this._workbenchEditorService.getVisibleEditors();
			for (let editor of editors) {
				if (mainThreadEditor.matches(editor)) {
					return this._workbenchEditorService.closeEditor(editor.position, editor.input).then(() => { return; });
				}
			}
		}
		return undefined;
	}

	$trySetSelections(id: string, selections: ISelection[]): TPromise<any> {
		if (!this._documentsAndEditors.getEditor(id)) {
			return TPromise.wrapError('TextEditor disposed');
		}
		this._documentsAndEditors.getEditor(id).setSelections(selections);
		return TPromise.as(null);
	}

	$trySetDecorations(id: string, key: string, ranges: IDecorationOptions[]): TPromise<any> {
		if (!this._documentsAndEditors.getEditor(id)) {
			return TPromise.wrapError('TextEditor disposed');
		}
		this._documentsAndEditors.getEditor(id).setDecorations(key, ranges);
		return TPromise.as(null);
	}

	$tryRevealRange(id: string, range: IRange, revealType: TextEditorRevealType): TPromise<any> {
		if (!this._documentsAndEditors.getEditor(id)) {
			return TPromise.wrapError('TextEditor disposed');
		}
		this._documentsAndEditors.getEditor(id).revealRange(range, revealType);
		return undefined;
	}

	$trySetOptions(id: string, options: ITextEditorConfigurationUpdate): TPromise<any> {
		if (!this._documentsAndEditors.getEditor(id)) {
			return TPromise.wrapError('TextEditor disposed');
		}
		this._documentsAndEditors.getEditor(id).setConfiguration(options);
		return TPromise.as(null);
	}

	$tryApplyEdits(id: string, modelVersionId: number, edits: ISingleEditOperation[], opts: IApplyEditsOptions): TPromise<boolean> {
		if (!this._documentsAndEditors.getEditor(id)) {
			return TPromise.wrapError('TextEditor disposed');
		}
		return TPromise.as(this._documentsAndEditors.getEditor(id).applyEdits(modelVersionId, edits, opts));
	}

	$tryInsertSnippet(id: string, template: string, ranges: IRange[], opts: IUndoStopOptions): TPromise<boolean> {
		if (!this._documentsAndEditors.getEditor(id)) {
			return TPromise.wrapError('TextEditor disposed');
		}
		return TPromise.as(this._documentsAndEditors.getEditor(id).insertSnippet(template, ranges, opts));
	}

	$registerTextEditorDecorationType(key: string, options: IDecorationRenderOptions): void {
		this._codeEditorService.registerDecorationType(key, options);
	}

	$removeTextEditorDecorationType(key: string): void {
		this._codeEditorService.removeDecorationType(key);
	}

	$getDiffInformation(id: string): TPromise<ILineChange[]> {
		const editor = this._documentsAndEditors.getEditor(id);

		if (!editor) {
			return TPromise.wrapError('No such TextEditor');
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

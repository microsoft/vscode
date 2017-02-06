/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { ISingleEditOperation, ISelection, IRange, IEditor, EditorType, ICommonCodeEditor, ICommonDiffEditor, IDecorationRenderOptions, IDecorationOptions } from 'vs/editor/common/editorCommon';
import { ICodeEditorService } from 'vs/editor/common/services/codeEditorService';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { Position as EditorPosition } from 'vs/platform/editor/common/editor';
import { IModelService } from 'vs/editor/common/services/modelService';
import { MainThreadEditorsTracker, TextEditorRevealType, MainThreadTextEditor, IApplyEditsOptions, IUndoStopOptions, ITextEditorConfigurationUpdate } from 'vs/workbench/api/node/mainThreadEditorsTracker';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { equals as arrayEquals } from 'vs/base/common/arrays';
import { equals as objectEquals } from 'vs/base/common/objects';
import { ExtHostContext, MainThreadEditorsShape, ExtHostEditorsShape, ITextEditorPositionData } from './extHost.protocol';

export class MainThreadEditors extends MainThreadEditorsShape {

	private _proxy: ExtHostEditorsShape;
	private _workbenchEditorService: IWorkbenchEditorService;
	private _telemetryService: ITelemetryService;
	private _editorTracker: MainThreadEditorsTracker;
	private _toDispose: IDisposable[];
	private _textEditorsListenersMap: { [editorId: string]: IDisposable[]; };
	private _textEditorsMap: { [editorId: string]: MainThreadTextEditor; };
	private _activeTextEditor: string;
	private _visibleEditors: string[];
	private _editorPositionData: ITextEditorPositionData;

	constructor(
		@IThreadService threadService: IThreadService,
		@IWorkbenchEditorService workbenchEditorService: IWorkbenchEditorService,
		@IEditorGroupService editorGroupService: IEditorGroupService,
		@ITelemetryService telemetryService: ITelemetryService,
		@ICodeEditorService editorService: ICodeEditorService,
		@IModelService modelService: IModelService
	) {
		super();
		this._proxy = threadService.get(ExtHostContext.ExtHostEditors);
		this._workbenchEditorService = workbenchEditorService;
		this._telemetryService = telemetryService;
		this._toDispose = [];
		this._textEditorsListenersMap = Object.create(null);
		this._textEditorsMap = Object.create(null);
		this._activeTextEditor = null;
		this._visibleEditors = [];
		this._editorPositionData = null;

		this._editorTracker = new MainThreadEditorsTracker(editorService, modelService);
		this._toDispose.push(this._editorTracker);

		this._toDispose.push(this._editorTracker.onTextEditorAdd((textEditor) => this._onTextEditorAdd(textEditor)));
		this._toDispose.push(this._editorTracker.onTextEditorRemove((textEditor) => this._onTextEditorRemove(textEditor)));

		this._toDispose.push(this._editorTracker.onDidUpdateTextEditors(() => this._updateActiveAndVisibleTextEditors()));
		this._toDispose.push(this._editorTracker.onChangedFocusedTextEditor((focusedTextEditorId) => this._updateActiveAndVisibleTextEditors()));
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
		this._proxy.$acceptTextEditorAdd({
			id: id,
			document: textEditor.getModel().uri,
			options: textEditor.getConfiguration(),
			selections: textEditor.getSelections(),
			editorPosition: this._findEditorPosition(textEditor)
		});

		this._textEditorsListenersMap[id] = toDispose;
		this._textEditorsMap[id] = textEditor;
	}

	private _onTextEditorRemove(textEditor: MainThreadTextEditor): void {
		let id = textEditor.getId();
		dispose(this._textEditorsListenersMap[id]);
		delete this._textEditorsListenersMap[id];
		delete this._textEditorsMap[id];
		this._proxy.$acceptTextEditorRemove(id);
	}

	private _updateActiveAndVisibleTextEditors(): void {

		// active and visible editors
		let visibleEditors = this._editorTracker.getVisibleTextEditorIds();
		let activeEditor = this._findActiveTextEditorId();
		if (activeEditor !== this._activeTextEditor || !arrayEquals(this._visibleEditors, visibleEditors, (a, b) => a === b)) {
			this._activeTextEditor = activeEditor;
			this._visibleEditors = visibleEditors;
			this._proxy.$acceptActiveEditorAndVisibleEditors(this._activeTextEditor, this._visibleEditors);
		}

		// editor columns
		let editorPositionData = this._getTextEditorPositionData();
		if (!objectEquals(this._editorPositionData, editorPositionData)) {
			this._editorPositionData = editorPositionData;
			this._proxy.$acceptEditorPositionData(this._editorPositionData);
		}
	}

	private _findActiveTextEditorId(): string {
		let focusedTextEditorId = this._editorTracker.getFocusedTextEditorId();
		if (focusedTextEditorId) {
			return focusedTextEditorId;
		}

		let activeEditor = this._workbenchEditorService.getActiveEditor();
		if (!activeEditor) {
			return null;
		}

		let editor = <IEditor>activeEditor.getControl();
		// Substitute for (editor instanceof ICodeEditor)
		if (!editor || typeof editor.getEditorType !== 'function') {
			// Not a text editor...
			return null;
		}

		if (editor.getEditorType() === EditorType.ICodeEditor) {
			return this._editorTracker.findTextEditorIdFor(<ICommonCodeEditor>editor);
		}

		// Must be a diff editor => use the modified side
		return this._editorTracker.findTextEditorIdFor((<ICommonDiffEditor>editor).getModifiedEditor());
	}

	private _findEditorPosition(editor: MainThreadTextEditor): EditorPosition {
		for (let workbenchEditor of this._workbenchEditorService.getVisibleEditors()) {
			if (editor.matches(workbenchEditor)) {
				return workbenchEditor.position;
			}
		}
		return undefined;
	}

	private _getTextEditorPositionData(): ITextEditorPositionData {
		let result: ITextEditorPositionData = Object.create(null);
		for (let workbenchEditor of this._workbenchEditorService.getVisibleEditors()) {
			let editor = <IEditor>workbenchEditor.getControl();
			// Substitute for (editor instanceof ICodeEditor)
			if (!editor || typeof editor.getEditorType !== 'function') {
				// Not a text editor...
				continue;
			}
			if (editor.getEditorType() === EditorType.ICodeEditor) {
				let id = this._editorTracker.findTextEditorIdFor(<ICommonCodeEditor>editor);
				if (id) {
					result[id] = workbenchEditor.position;
				}
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

			const findEditor = (): string => {
				// find the editor we have just opened and return the
				// id we have assigned to it.
				for (let id in this._textEditorsMap) {
					if (this._textEditorsMap[id].matches(editor)) {
						return id;
					}
				}
				return undefined;
			};

			const syncEditorId = findEditor();
			if (syncEditorId) {
				return TPromise.as(syncEditorId);
			}

			return new TPromise<void>(resolve => {
				// not very nice but the way it is: changes to the editor state aren't
				// send to the ext host as they happen but stuff is delayed a little. in
				// order to provide the real editor on #openTextEditor we need to sync on
				// that update
				let subscription: IDisposable;
				let handle: number;
				function contd() {
					subscription.dispose();
					clearTimeout(handle);
					resolve(undefined);
				}
				subscription = this._editorTracker.onDidUpdateTextEditors(() => {
					contd();
				});
				handle = setTimeout(() => {
					contd();
				}, 1000);

			}).then(findEditor);
		});
	}

	$tryShowEditor(id: string, position: EditorPosition): TPromise<void> {
		// check how often this is used
		this._telemetryService.publicLog('api.deprecated', { function: 'TextEditor.show' });

		let mainThreadEditor = this._textEditorsMap[id];
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

		let mainThreadEditor = this._textEditorsMap[id];
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
		if (!this._textEditorsMap[id]) {
			return TPromise.wrapError('TextEditor disposed');
		}
		this._textEditorsMap[id].setSelections(selections);
		return TPromise.as(null);
	}

	$trySetDecorations(id: string, key: string, ranges: IDecorationOptions[]): TPromise<any> {
		if (!this._textEditorsMap[id]) {
			return TPromise.wrapError('TextEditor disposed');
		}
		this._textEditorsMap[id].setDecorations(key, ranges);
		return TPromise.as(null);
	}

	$tryRevealRange(id: string, range: IRange, revealType: TextEditorRevealType): TPromise<any> {
		if (!this._textEditorsMap[id]) {
			return TPromise.wrapError('TextEditor disposed');
		}
		this._textEditorsMap[id].revealRange(range, revealType);
		return undefined;
	}

	$trySetOptions(id: string, options: ITextEditorConfigurationUpdate): TPromise<any> {
		if (!this._textEditorsMap[id]) {
			return TPromise.wrapError('TextEditor disposed');
		}
		this._textEditorsMap[id].setConfiguration(options);
		return TPromise.as(null);
	}

	$tryApplyEdits(id: string, modelVersionId: number, edits: ISingleEditOperation[], opts: IApplyEditsOptions): TPromise<boolean> {
		if (!this._textEditorsMap[id]) {
			return TPromise.wrapError('TextEditor disposed');
		}
		return TPromise.as(this._textEditorsMap[id].applyEdits(modelVersionId, edits, opts));
	}

	$tryInsertSnippet(id: string, template: string, ranges: IRange[], opts: IUndoStopOptions): TPromise<boolean> {
		if (!this._textEditorsMap[id]) {
			return TPromise.wrapError('TextEditor disposed');
		}
		return TPromise.as(this._textEditorsMap[id].insertSnippet(template, ranges, opts));
	}

	$registerTextEditorDecorationType(key: string, options: IDecorationRenderOptions): void {
		this._editorTracker.registerTextEditorDecorationType(key, options);
	}

	$removeTextEditorDecorationType(key: string): void {
		this._editorTracker.removeTextEditorDecorationType(key);
	}
}

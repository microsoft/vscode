/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import Event, {Emitter} from 'vs/base/common/event';
import {IDisposable, disposeAll} from 'vs/base/common/lifecycle';
import {TPromise} from 'vs/base/common/winjs.base';
import {Remotable, IThreadService} from 'vs/platform/thread/common/thread';
import {ExtHostModelService} from 'vs/workbench/api/common/extHostDocuments';
import {Selection, Range, Position, EditorOptions} from './extHostTypes';
import {ISingleEditOperation, ISelection, IRange, IInternalIndentationOptions, IEditor, EditorType, ICommonCodeEditor, ICommonDiffEditor, IDecorationRenderOptions, IRangeWithMessage} from 'vs/editor/common/editorCommon';
import {ICodeEditorService} from 'vs/editor/common/services/codeEditorService';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IEditor as IPlatformEditor, Position as EditorPosition} from 'vs/platform/editor/common/editor';
import {IModelService} from 'vs/editor/common/services/modelService';
import {MainThreadEditorsTracker, TextEditorRevealType, MainThreadTextEditor, ITextEditorConfiguration} from 'vs/workbench/api/common/mainThreadEditors';
import * as TypeConverters from './extHostTypeConverters';
import {TextDocument, TextEditorSelectionChangeEvent, TextEditorOptionsChangeEvent, TextEditorOptions, ViewColumn} from 'vscode';
import {EventType} from 'vs/workbench/browser/events';
import {IEventService} from 'vs/platform/event/common/event';
import {equals as arrayEquals} from 'vs/base/common/arrays';

export interface ITextEditorAddData {
	id: string;
	document: URI;
	options: ITextEditorConfiguration;
	selections: ISelection[];
}

@Remotable.PluginHostContext('ExtHostEditors')
export class ExtHostEditors {

	public onDidChangeTextEditorSelection: Event<TextEditorSelectionChangeEvent>;
	private _onDidChangeTextEditorSelection: Emitter<TextEditorSelectionChangeEvent>;

	public onDidChangeTextEditorOptions: Event<TextEditorOptionsChangeEvent>;
	private _onDidChangeTextEditorOptions: Emitter<TextEditorOptionsChangeEvent>;

	private _editors: { [id: string]: ExtHostTextEditor };
	private _proxy: MainThreadEditors;
	private _onDidChangeActiveTextEditor: Emitter<vscode.TextEditor>;
	private _modelService: ExtHostModelService;
	private _activeEditorId: string;
	private _visibleEditorIds: string[];

	constructor(
		@IThreadService threadService: IThreadService
	) {
		this._onDidChangeTextEditorSelection = new Emitter<TextEditorSelectionChangeEvent>();
		this.onDidChangeTextEditorSelection = this._onDidChangeTextEditorSelection.event;

		this._onDidChangeTextEditorOptions = new Emitter<TextEditorOptionsChangeEvent>();
		this.onDidChangeTextEditorOptions = this._onDidChangeTextEditorOptions.event;

		this._modelService = threadService.getRemotable(ExtHostModelService);
		this._proxy = threadService.getRemotable(MainThreadEditors);
		this._onDidChangeActiveTextEditor = new Emitter<vscode.TextEditor>();
		this._editors = Object.create(null);

		this._visibleEditorIds = [];
	}

	getActiveTextEditor(): vscode.TextEditor {
		return this._activeEditorId && this._editors[this._activeEditorId];
	}

	getVisibleTextEditors(): vscode.TextEditor[] {
		return this._visibleEditorIds.map(id => this._editors[id]);
	}

	get onDidChangeActiveTextEditor(): Event<vscode.TextEditor> {
		return this._onDidChangeActiveTextEditor && this._onDidChangeActiveTextEditor.event;
	}

	showTextDocument(document: TextDocument, column: ViewColumn): TPromise<vscode.TextEditor> {
		return this._proxy._tryShowTextDocument(<URI> document.uri, TypeConverters.fromViewColumn(column)).then(id => {
			let editor = this._editors[id];
			if (editor) {
				return editor;
			} else {
				throw new Error('Failed to create editor.');
			}
		});
	}

	createTextEditorDecorationType(options: vscode.DecorationRenderOptions): vscode.TextEditorDecorationType {
		return new TextEditorDecorationType(this._proxy, options);
	}

	// --- called from main thread

	_acceptTextEditorAdd(data:ITextEditorAddData): void {
		let document = this._modelService.getDocument(data.document);
		let newEditor = new ExtHostTextEditor(this._proxy, data.id, document, data.selections.map(TypeConverters.toSelection), data.options);
		this._editors[data.id] = newEditor;
	}

	_acceptOptionsChanged(id:string, opts:ITextEditorConfiguration): void {
		let editor = this._editors[id];
		editor._acceptOptions(opts);
		this._onDidChangeTextEditorOptions.fire({
			textEditor: editor,
			options: opts
		});
	}

	_acceptSelectionsChanged(id:string, _selections:ISelection[]): void {
		let selections = _selections.map(TypeConverters.toSelection);
		let editor = this._editors[id];
		editor._acceptSelections(selections);
		this._onDidChangeTextEditorSelection.fire({
			textEditor: editor,
			selections: selections
		});
	}

	_acceptActiveEditorAndVisibleEditors(id:string, visibleIds:string[]): void {
		this._visibleEditorIds = visibleIds;

		if (this._activeEditorId === id) {
			// nothing to do
			return;
		}
		this._activeEditorId = id;
		this._onDidChangeActiveTextEditor.fire(this.getActiveTextEditor());
	}

	_acceptTextEditorRemove(id:string): void {
		// make sure the removed editor is not visible
		let newVisibleEditors = this._visibleEditorIds.filter(visibleEditorId => visibleEditorId !== id);

		if (this._activeEditorId === id) {
			// removing the current active editor
			this._acceptActiveEditorAndVisibleEditors(undefined, newVisibleEditors);
		} else {
			this._acceptActiveEditorAndVisibleEditors(this._activeEditorId, newVisibleEditors);
		}

		let editor = this._editors[id];
		editor.dispose();
		delete this._editors[id];
	}
}

class TextEditorDecorationType implements vscode.TextEditorDecorationType {

	private static LAST_ID = 0;

	private _proxy: MainThreadEditors;
	public key: string;

	constructor(proxy:MainThreadEditors, options: vscode.DecorationRenderOptions) {
		this.key = 'TextEditorDecorationType' + (++TextEditorDecorationType.LAST_ID);
		this._proxy = proxy;
		this._proxy._registerTextEditorDecorationType(this.key, <any>options);
	}

	public dispose(): void {
		this._proxy._removeTextEditorDecorationType(this.key);
	}
}

export interface ITextEditOperation {
	range: Range;
	text: string;
	forceMoveMarkers: boolean;
}

export interface IEditData {
	documentVersionId: number;
	edits: ITextEditOperation[];
}

export class TextEditorEdit {

	private _documentVersionId: number;
	private _collectedEdits: ITextEditOperation[];

	constructor(document: vscode.TextDocument) {
		this._documentVersionId = document.version;
		this._collectedEdits = [];
	}

	finalize(): IEditData {
		return {
			documentVersionId: this._documentVersionId,
			edits: this._collectedEdits
		};
	}

	replace(location: Position | Range | Selection, value: string): void {
		let range: Range = null;

		if (location instanceof Position) {
			range = new Range(location, location);
		} else if (location instanceof Range) {
			range = location;
		} else if (location instanceof Selection) {
			range = new Range(location.start, location.end);
		} else {
			throw new Error('Unrecognized location');
		}

		this._collectedEdits.push({
			range: range,
			text: value,
			forceMoveMarkers: false
		});
	}

	insert(location: Position, value: string): void {
		this._collectedEdits.push({
			range: new Range(location, location),
			text: value,
			forceMoveMarkers: true
		});
	}

	delete(location: Range | Selection): void {
		let range: Range = null;

		if (location instanceof Range) {
			range = location;
		} else if (location instanceof Selection) {
			range = new Range(location.start, location.end);
		} else {
			throw new Error('Unrecognized location');
		}

		this._collectedEdits.push({
			range: range,
			text: null,
			forceMoveMarkers: true
		});
	}
}

function readonly(name: string, alt?: string) {
	let message = `The property '${name}' is readonly.`;
	if (alt) {
		message += ` Use '${alt}' instead.`;
	}
	return new Error(message);
}

function illegalArg(name: string) {
	return new Error(`illgeal argument '${name}'`);
}

function deprecated(name:string, message:string = 'Refer to the documentation for further details.') {
	return (target: Object, key: string, descriptor: TypedPropertyDescriptor<any>) => {
		const originalMethod = descriptor.value;
		descriptor.value = function(...args: any[]) {
			console.warn(`[Deprecation Warning] method '${name}' is deprecated and should no longer be used. ${message}`);
			return originalMethod.apply(this, args);
		};

		return descriptor;
	};
}

class ExtHostTextEditor implements vscode.TextEditor {

	private _proxy: MainThreadEditors;
	private _id: string;

	private _document: vscode.TextDocument;
	private _selections: Selection[];
	private _options: TextEditorOptions;

	constructor(proxy: MainThreadEditors, id: string, document: TextDocument, selections: Selection[], options: EditorOptions) {
		this._proxy = proxy;
		this._id = id;
		this._document = document;
		this._selections = selections;
		this._options = options;
	}

	dispose() {
		this._document = null;
	}

	@deprecated('TextEditor.show') show(column: vscode.ViewColumn) {
		this._proxy._tryShowEditor(this._id, TypeConverters.fromViewColumn(column));
	}

	@deprecated('TextEditor.hide') hide() {
		this._proxy._tryHideEditor(this._id);
	}

	// ---- the document

	get document(): vscode.TextDocument {
		return this._document;
	}

	set document(value) {
		throw readonly('document');
	}

	// ---- options

	get options(): TextEditorOptions {
		return this._options;
	}

	set options(value: TextEditorOptions) {
		this._options = value;
		this._runOnProxy(() => {
			return this._proxy._trySetOptions(this._id, this._options);
		}, true);
	}

	_acceptOptions(options: EditorOptions): void {
		this._options = options;
	}

	// ---- selections

	get selection(): Selection {
		return this._selections && this._selections[0];
	}

	set selection(value: Selection) {
		if (!(value instanceof Selection)) {
			throw illegalArg('selection');
		}
		this._selections = [value];
		this._trySetSelection(true);
	}

	get selections(): Selection[] {
		return this._selections;
	}

	set selections(value: Selection[]) {
		if (!Array.isArray(value) || value.some(a => !(a instanceof Selection))) {
			throw illegalArg('selections');
		}
		this._selections = value;
		this._trySetSelection(true);
	}

	setDecorations(decorationType: vscode.TextEditorDecorationType, ranges:Range[]|vscode.DecorationOptions[]): void {
		this._runOnProxy(
			() => this._proxy._trySetDecorations(
				this._id,
				decorationType.key,
				TypeConverters.fromRangeOrRangeWithMessage(ranges)
			),
			true
		);
	}

	revealRange(range: Range, revealType:vscode.TextEditorRevealType): void {
		this._runOnProxy(
			() => this._proxy._tryRevealRange(
				this._id,
				TypeConverters.fromRange(range),
				(<TextEditorRevealType><any>revealType) || TextEditorRevealType.Default
			),
			true
		);
	}

	private _trySetSelection(silent: boolean): TPromise<vscode.TextEditor> {
		let selection = this._selections.map(TypeConverters.fromSelection);
		return this._runOnProxy(() => this._proxy._trySetSelections(this._id, selection), silent);
	}

	_acceptSelections(selections:Selection[]): void {
		this._selections = selections;
	}

	// ---- editing

	edit(callback:(edit:TextEditorEdit)=>void): Thenable<boolean> {
		let edit = new TextEditorEdit(this._document);
		callback(edit);
		return this._applyEdit(edit);
	}

	_applyEdit(edit:TextEditorEdit): TPromise<boolean> {
		let editData = edit.finalize();

		// prepare data for serialization
		let edits: ISingleEditOperation[] = editData.edits.map((edit) => {
			return {
				range: TypeConverters.fromRange(edit.range),
				text: edit.text,
				forceMoveMarkers: edit.forceMoveMarkers
			};
		});

		return this._proxy._tryApplyEdits(this._id, editData.documentVersionId, edits);
	}

	// ---- util

	private _runOnProxy(callback: () => TPromise<any>, silent:boolean): TPromise<ExtHostTextEditor> {
		return callback().then(() => this, err => {
			if (!silent) {
				return TPromise.wrapError(silent);
			}
			console.warn(err);
		});
	}
}

@Remotable.MainContext('MainThreadEditors')
export class MainThreadEditors {

	private _proxy: ExtHostEditors;
	private _workbenchEditorService: IWorkbenchEditorService;
	private _editorTracker: MainThreadEditorsTracker;
	private _toDispose: IDisposable[];
	private _textEditorsListenersMap: {[editorId:string]:IDisposable[];};
	private _textEditorsMap: {[editorId:string]:MainThreadTextEditor;};
	private _activeTextEditor: string;
	private _visibleEditors: string[];

	constructor(
		@IThreadService threadService: IThreadService,
		@IWorkbenchEditorService workbenchEditorService: IWorkbenchEditorService,
		@ICodeEditorService editorService:ICodeEditorService,
		@IEventService eventService:IEventService,
		@IModelService modelService:IModelService
	) {
		this._proxy = threadService.getRemotable(ExtHostEditors);
		this._workbenchEditorService = workbenchEditorService;
		this._toDispose = [];
		this._textEditorsListenersMap = Object.create(null);
		this._textEditorsMap = Object.create(null);
		this._activeTextEditor = null;
		this._visibleEditors = [];

		this._editorTracker = new MainThreadEditorsTracker(editorService, modelService);
		this._toDispose.push(this._editorTracker);

		this._toDispose.push(this._editorTracker.onTextEditorAdd((textEditor) => this._onTextEditorAdd(textEditor)));
		this._toDispose.push(this._editorTracker.onTextEditorRemove((textEditor) => this._onTextEditorRemove(textEditor)));

		this._toDispose.push(this._editorTracker.onDidUpdateTextEditors(() => this._updateActiveAndVisibleTextEditors()));
		this._toDispose.push(this._editorTracker.onChangedFocusedTextEditor((focusedTextEditorId) => this._updateActiveAndVisibleTextEditors()));
		this._toDispose.push(eventService.addListener2(EventType.EDITOR_INPUT_CHANGED, () => this._updateActiveAndVisibleTextEditors()));
	}

	public dispose(): void {
		Object.keys(this._textEditorsListenersMap).forEach((editorId) => {
			disposeAll(this._textEditorsListenersMap[editorId]);
		});
		this._textEditorsListenersMap = Object.create(null);
		this._toDispose = disposeAll(this._toDispose);
	}

	private _onTextEditorAdd(textEditor:MainThreadTextEditor): void {
		let id = textEditor.getId();
		let toDispose: IDisposable[] = [];
		toDispose.push(textEditor.onConfigurationChanged((opts) => {
			this._proxy._acceptOptionsChanged(id, opts);
		}));
		toDispose.push(textEditor.onSelectionChanged((selection) => {
			this._proxy._acceptSelectionsChanged(id, selection);
		}));
		this._proxy._acceptTextEditorAdd({
			id: id,
			document: textEditor.getModel().getAssociatedResource(),
			options: textEditor.getConfiguration(),
			selections: textEditor.getSelections()
		});

		this._textEditorsListenersMap[id] = toDispose;
		this._textEditorsMap[id] = textEditor;
	}

	private _onTextEditorRemove(textEditor:MainThreadTextEditor): void {
		let id = textEditor.getId();
		disposeAll(this._textEditorsListenersMap[id]);
		delete this._textEditorsListenersMap[id];
		delete this._textEditorsMap[id];
		this._proxy._acceptTextEditorRemove(id);
	}

	private _updateActiveAndVisibleTextEditors(): void {
		let visibleEditors = this._editorTracker.getVisibleTextEditorIds();
		let activeEditor = this._findActiveTextEditorId();

		if (activeEditor === this._activeTextEditor && arrayEquals(this._visibleEditors, visibleEditors, (a,b) => a === b)) {
			// no change
			return;
		}
		this._activeTextEditor = activeEditor;
		this._visibleEditors = visibleEditors;
		this._proxy._acceptActiveEditorAndVisibleEditors(this._activeTextEditor, this._visibleEditors);
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

	// --- from plugin host process

	_tryShowTextDocument(resource: URI, position: EditorPosition): TPromise<string> {

		// the input we want to open
		let input = {
			resource,
			options: { preserveFocus: false }
		};

		return this._workbenchEditorService.openEditor(input, position).then(editor => {

			return new TPromise<void>(c => {
				// not very nice but the way it is: changes to the editor state aren't
				// send to the ext host as they happen but stuff is delayed a little. in
				// order to provide the real editor on #openTextEditor we need to sync on
				// that update
				let subscription: IDisposable;
				let handle: number;
				function contd() {
					subscription.dispose();
					clearTimeout(handle);
					c(undefined);
				}
				subscription = this._editorTracker.onDidUpdateTextEditors(() => {
					contd();
				});
				handle = setTimeout(() => {
					contd();
				}, 100);

			}).then(() => {
				// find the editor we have just opened and return the
				// id we have assigned to it.
				for (let id in this._textEditorsMap) {
					if (this._textEditorsMap[id].matches(editor)) {
						return id;
					}
				}
			});
		});
	}

	_tryShowEditor(id: string, position: EditorPosition): TPromise<void> {
		let mainThreadEditor = this._textEditorsMap[id];
		if (mainThreadEditor) {
			let model = mainThreadEditor.getModel();
			return this._workbenchEditorService.openEditor({
				resource: model.getAssociatedResource(),
				options: { preserveFocus: false }
			}, position).then(() => { });
		}
	}

	_tryHideEditor(id: string): TPromise<void> {
		let mainThreadEditor = this._textEditorsMap[id];
		if (mainThreadEditor) {
			let editors = this._workbenchEditorService.getVisibleEditors();
			for (let editor of editors) {
				if (mainThreadEditor.matches(editor)) {
					return this._workbenchEditorService.closeEditor(editor).then(() => { });
				}
			}
		}
	}

	_trySetSelections(id: string, selections: ISelection[]): TPromise<any> {
		if (!this._textEditorsMap[id]) {
			return TPromise.wrapError('TextEditor disposed');
		}
		this._textEditorsMap[id].setSelections(selections);
		return TPromise.as(null);
	}

	_trySetDecorations(id: string, key: string, ranges:IRangeWithMessage[]): TPromise<any> {
		if (!this._textEditorsMap[id]) {
			return TPromise.wrapError('TextEditor disposed');
		}
		this._textEditorsMap[id].setDecorations(key, ranges);
		return TPromise.as(null);
	}

	_tryRevealRange(id: string, range: IRange, revealType:TextEditorRevealType): TPromise<any> {
		if (!this._textEditorsMap[id]) {
			return TPromise.wrapError('TextEditor disposed');
		}
		this._textEditorsMap[id].revealRange(range, revealType);
	}

	_trySetOptions(id: string, options:IInternalIndentationOptions): TPromise<any> {
		if (!this._textEditorsMap[id]) {
			return TPromise.wrapError('TextEditor disposed');
		}
		this._textEditorsMap[id].setConfiguration(options);
		return TPromise.as(null);
	}

	_tryApplyEdits(id: string, modelVersionId: number, edits:ISingleEditOperation[]): TPromise<boolean> {
		if (!this._textEditorsMap[id]) {
			return TPromise.wrapError('TextEditor disposed');
		}
		return TPromise.as(this._textEditorsMap[id].applyEdits(modelVersionId, edits));
	}

	_registerTextEditorDecorationType(key:string, options: IDecorationRenderOptions): void {
		this._editorTracker.registerTextEditorDecorationType(key, options);
	}

	_removeTextEditorDecorationType(key:string): void {
		this._editorTracker.removeTextEditorDecorationType(key);
	}
}

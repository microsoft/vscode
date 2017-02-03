/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import EditorCommon = require('vs/editor/common/editorCommon');
import Event, { Emitter } from 'vs/base/common/event';
import { IEditor } from 'vs/platform/editor/common/editor';
import { ICodeEditorService } from 'vs/editor/common/services/codeEditorService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { RunOnceScheduler } from 'vs/base/common/async';
import { IdGenerator } from 'vs/base/common/idGenerator';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { SnippetController } from 'vs/editor/contrib/snippet/common/snippetController';
import { EndOfLine, TextEditorLineNumbersStyle } from 'vs/workbench/api/node/extHostTypes';

export interface ITextEditorConfigurationUpdate {
	tabSize?: number | 'auto';
	insertSpaces?: boolean | 'auto';
	cursorStyle?: EditorCommon.TextEditorCursorStyle;
	lineNumbers?: TextEditorLineNumbersStyle;
}
export interface IResolvedTextEditorConfiguration {
	tabSize: number;
	insertSpaces: boolean;
	cursorStyle: EditorCommon.TextEditorCursorStyle;
	lineNumbers: TextEditorLineNumbersStyle;
}

function configurationsEqual(a: IResolvedTextEditorConfiguration, b: IResolvedTextEditorConfiguration) {
	if (a && !b || !a && b) {
		return false;
	}
	if (!a && !b) {
		return true;
	}
	return (
		a.tabSize === b.tabSize
		&& a.insertSpaces === b.insertSpaces
	);
}

export interface ISelectionChangeEvent {
	selections: Selection[];
	source?: string;
}

export interface IFocusTracker {
	onGainedFocus(): void;
	onLostFocus(): void;
}

export enum TextEditorRevealType {
	Default = 0,
	InCenter = 1,
	InCenterIfOutsideViewport = 2,
	AtTop = 3
}

export interface IUndoStopOptions {
	undoStopBefore: boolean;
	undoStopAfter: boolean;
}

export interface IApplyEditsOptions extends IUndoStopOptions {
	setEndOfLine: EndOfLine;
}

/**
 * Text Editor that is permanently bound to the same model.
 * It can be bound or not to a CodeEditor.
 */
export class MainThreadTextEditor {

	private _id: string;
	private _model: EditorCommon.IModel;
	private _modelService: IModelService;
	private _modelListeners: IDisposable[];
	private _codeEditor: EditorCommon.ICommonCodeEditor;
	private _focusTracker: IFocusTracker;
	private _codeEditorListeners: IDisposable[];

	private _lastSelection: Selection[];
	private _configuration: IResolvedTextEditorConfiguration;

	private _onSelectionChanged: Emitter<ISelectionChangeEvent>;
	private _onConfigurationChanged: Emitter<IResolvedTextEditorConfiguration>;

	constructor(
		id: string,
		model: EditorCommon.IModel,
		codeEditor: EditorCommon.ICommonCodeEditor,
		focusTracker: IFocusTracker,
		modelService: IModelService
	) {
		this._id = id;
		this._model = model;
		this._codeEditor = null;
		this._focusTracker = focusTracker;
		this._modelService = modelService;
		this._codeEditorListeners = [];

		this._onSelectionChanged = new Emitter<ISelectionChangeEvent>();
		this._onConfigurationChanged = new Emitter<IResolvedTextEditorConfiguration>();

		this._lastSelection = [new Selection(1, 1, 1, 1)];
		this._modelListeners = [];
		this._modelListeners.push(this._model.onDidChangeOptions((e) => {
			this._setConfiguration(this._readConfiguration(this._model, this._codeEditor));
		}));

		this.setCodeEditor(codeEditor);
		this._setConfiguration(this._readConfiguration(this._model, this._codeEditor));
	}

	public dispose(): void {
		this._model = null;
		this._modelListeners = dispose(this._modelListeners);
		this._codeEditor = null;
		this._codeEditorListeners = dispose(this._codeEditorListeners);
	}

	public getId(): string {
		return this._id;
	}

	public getModel(): EditorCommon.IModel {
		return this._model;
	}

	public hasCodeEditor(codeEditor: EditorCommon.ICommonCodeEditor): boolean {
		return (this._codeEditor === codeEditor);
	}

	public setCodeEditor(codeEditor: EditorCommon.ICommonCodeEditor): void {
		if (this.hasCodeEditor(codeEditor)) {
			// Nothing to do...
			return;
		}
		this._codeEditorListeners = dispose(this._codeEditorListeners);

		this._codeEditor = codeEditor;
		if (this._codeEditor) {

			// Catch early the case that this code editor gets a different model set and disassociate from this model
			this._codeEditorListeners.push(this._codeEditor.onDidChangeModel(() => {
				this.setCodeEditor(null);
			}));

			let forwardSelection = (event?: EditorCommon.ICursorSelectionChangedEvent) => {
				this._lastSelection = this._codeEditor.getSelections();
				this._onSelectionChanged.fire({
					selections: this._lastSelection,
					source: event && event.source
				});
			};
			this._codeEditorListeners.push(this._codeEditor.onDidChangeCursorSelection(forwardSelection));
			if (!Selection.selectionsArrEqual(this._lastSelection, this._codeEditor.getSelections())) {
				forwardSelection();
			}
			this._codeEditorListeners.push(this._codeEditor.onDidFocusEditor(() => {
				this._focusTracker.onGainedFocus();
			}));
			this._codeEditorListeners.push(this._codeEditor.onDidBlurEditor(() => {
				this._focusTracker.onLostFocus();
			}));
			this._codeEditorListeners.push(this._codeEditor.onDidChangeConfiguration(() => {
				this._setConfiguration(this._readConfiguration(this._model, this._codeEditor));
			}));
			this._setConfiguration(this._readConfiguration(this._model, this._codeEditor));
		}
	}

	public isVisible(): boolean {
		return !!this._codeEditor;
	}

	public get onSelectionChanged(): Event<ISelectionChangeEvent> {
		return this._onSelectionChanged.event;
	}

	public get onConfigurationChanged(): Event<IResolvedTextEditorConfiguration> {
		return this._onConfigurationChanged.event;
	}

	public getSelections(): Selection[] {
		if (this._codeEditor) {
			return this._codeEditor.getSelections();
		}
		return this._lastSelection;
	}

	public setSelections(selections: EditorCommon.ISelection[]): void {
		if (this._codeEditor) {
			this._codeEditor.setSelections(selections);
			return;
		}
		this._lastSelection = selections.map(Selection.liftSelection);
		console.warn('setSelections on invisble editor');
	}

	public getConfiguration(): IResolvedTextEditorConfiguration {
		return this._configuration;
	}

	private _setIndentConfiguration(newConfiguration: ITextEditorConfigurationUpdate): void {
		if (newConfiguration.tabSize === 'auto' || newConfiguration.insertSpaces === 'auto') {
			// one of the options was set to 'auto' => detect indentation

			let creationOpts = this._modelService.getCreationOptions(this._model.getLanguageIdentifier().language);
			let insertSpaces = creationOpts.insertSpaces;
			let tabSize = creationOpts.tabSize;

			if (newConfiguration.insertSpaces !== 'auto' && typeof newConfiguration.insertSpaces !== 'undefined') {
				insertSpaces = newConfiguration.insertSpaces;
			}

			if (newConfiguration.tabSize !== 'auto' && typeof newConfiguration.tabSize !== 'undefined') {
				tabSize = newConfiguration.tabSize;
			}

			this._model.detectIndentation(insertSpaces, tabSize);
			return;
		}

		let newOpts: EditorCommon.ITextModelUpdateOptions = {};
		if (typeof newConfiguration.insertSpaces !== 'undefined') {
			newOpts.insertSpaces = newConfiguration.insertSpaces;
		}
		if (typeof newConfiguration.tabSize !== 'undefined') {
			newOpts.tabSize = newConfiguration.tabSize;
		}
		this._model.updateOptions(newOpts);
	}

	public setConfiguration(newConfiguration: ITextEditorConfigurationUpdate): void {
		this._setIndentConfiguration(newConfiguration);

		if (newConfiguration.cursorStyle) {
			let newCursorStyle = EditorCommon.cursorStyleToString(newConfiguration.cursorStyle);

			if (!this._codeEditor) {
				console.warn('setConfiguration on invisible editor');
				return;
			}

			this._codeEditor.updateOptions({
				cursorStyle: newCursorStyle
			});
		}

		if (typeof newConfiguration.lineNumbers !== 'undefined') {

			if (!this._codeEditor) {
				console.warn('setConfiguration on invisible editor');
				return;
			}

			let lineNumbers: 'on' | 'off' | 'relative';
			switch (newConfiguration.lineNumbers) {
				case TextEditorLineNumbersStyle.On:
					lineNumbers = 'on';
					break;
				case TextEditorLineNumbersStyle.Relative:
					lineNumbers = 'relative';
					break;
				default:
					lineNumbers = 'off';
			}
			this._codeEditor.updateOptions({
				lineNumbers: lineNumbers
			});
		}
	}

	public setDecorations(key: string, ranges: EditorCommon.IDecorationOptions[]): void {
		if (!this._codeEditor) {
			console.warn('setDecorations on invisible editor');
			return;
		}
		this._codeEditor.setDecorations(key, ranges);
	}

	public revealRange(range: EditorCommon.IRange, revealType: TextEditorRevealType): void {
		if (!this._codeEditor) {
			console.warn('revealRange on invisible editor');
			return;
		}
		switch (revealType) {
			case TextEditorRevealType.Default:
				this._codeEditor.revealRange(range);
				break;
			case TextEditorRevealType.InCenter:
				this._codeEditor.revealRangeInCenter(range);
				break;;
			case TextEditorRevealType.InCenterIfOutsideViewport:
				this._codeEditor.revealRangeInCenterIfOutsideViewport(range);
				break;
			case TextEditorRevealType.AtTop:
				this._codeEditor.revealRangeAtTop(range);
				break;
			default:
				console.warn('Unknown revealType');
				break;
		}
	}

	private _readConfiguration(model: EditorCommon.IModel, codeEditor: EditorCommon.ICommonCodeEditor): IResolvedTextEditorConfiguration {
		if (model.isDisposed()) {
			// shutdown time
			return this._configuration;
		}
		let cursorStyle = this._configuration ? this._configuration.cursorStyle : EditorCommon.TextEditorCursorStyle.Line;
		let lineNumbers: TextEditorLineNumbersStyle = this._configuration ? this._configuration.lineNumbers : TextEditorLineNumbersStyle.On;
		if (codeEditor) {
			let codeEditorOpts = codeEditor.getConfiguration();
			cursorStyle = codeEditorOpts.viewInfo.cursorStyle;

			if (codeEditorOpts.viewInfo.renderRelativeLineNumbers) {
				lineNumbers = TextEditorLineNumbersStyle.Relative;
			} else if (codeEditorOpts.viewInfo.renderLineNumbers) {
				lineNumbers = TextEditorLineNumbersStyle.On;
			} else {
				lineNumbers = TextEditorLineNumbersStyle.Off;
			}
		}

		let indent = model.getOptions();
		return {
			insertSpaces: indent.insertSpaces,
			tabSize: indent.tabSize,
			cursorStyle: cursorStyle,
			lineNumbers: lineNumbers
		};
	}

	private _setConfiguration(newConfiguration: IResolvedTextEditorConfiguration): void {
		if (configurationsEqual(this._configuration, newConfiguration)) {
			return;
		}
		this._configuration = newConfiguration;
		this._onConfigurationChanged.fire(this._configuration);
	}

	public isFocused(): boolean {
		if (this._codeEditor) {
			return this._codeEditor.isFocused();
		}
		return false;
	}

	public matches(editor: IEditor): boolean {
		if (!editor) {
			return false;
		}
		return editor.getControl() === this._codeEditor;
	}

	public applyEdits(versionIdCheck: number, edits: EditorCommon.ISingleEditOperation[], opts: IApplyEditsOptions): boolean {
		if (this._model.getVersionId() !== versionIdCheck) {
			console.warn('Model has changed in the meantime!');
			// throw new Error('Model has changed in the meantime!');
			// model changed in the meantime
			return false;
		}

		if (this._codeEditor) {
			if (opts.setEndOfLine === EndOfLine.CRLF) {
				this._model.setEOL(EditorCommon.EndOfLineSequence.CRLF);
			} else if (opts.setEndOfLine === EndOfLine.LF) {
				this._model.setEOL(EditorCommon.EndOfLineSequence.LF);
			}

			let transformedEdits = edits.map((edit): EditorCommon.IIdentifiedSingleEditOperation => {
				return {
					identifier: null,
					range: Range.lift(edit.range),
					text: edit.text,
					forceMoveMarkers: edit.forceMoveMarkers
				};
			});

			if (opts.undoStopBefore) {
				this._codeEditor.pushUndoStop();
			}
			this._codeEditor.executeEdits('MainThreadTextEditor', transformedEdits);
			if (opts.undoStopAfter) {
				this._codeEditor.pushUndoStop();
			}
			return true;
		}

		console.warn('applyEdits on invisible editor');
		return false;
	}

	insertSnippet(template: string, ranges: EditorCommon.IRange[], opts: IUndoStopOptions) {

		if (!this._codeEditor) {
			return false;
		}

		const snippetController = SnippetController.get(this._codeEditor);

		// cancel previous snippet mode
		snippetController.leaveSnippet();

		// set selection, focus editor
		const selections = ranges.map(r => new Selection(r.startLineNumber, r.startColumn, r.endLineNumber, r.endColumn));
		this._codeEditor.setSelections(selections);
		this._codeEditor.focus();

		// make modifications
		if (opts.undoStopBefore) {
			this._codeEditor.pushUndoStop();
		}
		snippetController.insertSnippet(template, 0, 0);
		if (opts.undoStopAfter) {
			this._codeEditor.pushUndoStop();
		}

		return true;
	}
}

/**
 * Keeps track of what goes on in the main thread and maps models => text editors
 */
export class MainThreadEditorsTracker {

	private static _Ids = new IdGenerator('');

	private _toDispose: IDisposable[];
	private _codeEditorService: ICodeEditorService;
	private _modelService: IModelService;
	private _updateMapping: RunOnceScheduler;
	private _editorModelChangeListeners: { [editorId: string]: IDisposable; };

	private _model2TextEditors: {
		[modelUri: string]: MainThreadTextEditor[];
	};
	private _focusedTextEditorId: string;
	private _visibleTextEditorIds: string[];
	private _onTextEditorAdd: Emitter<MainThreadTextEditor>;
	private _onTextEditorRemove: Emitter<MainThreadTextEditor>;
	private _onDidChangeFocusedTextEditor: Emitter<string>;
	private _onDidUpdateTextEditors: Emitter<void>;

	private _focusTracker: IFocusTracker;

	constructor(
		editorService: ICodeEditorService,
		modelService: IModelService
	) {
		this._codeEditorService = editorService;
		this._modelService = modelService;
		this._toDispose = [];
		this._focusedTextEditorId = null;
		this._visibleTextEditorIds = [];
		this._editorModelChangeListeners = Object.create(null);
		this._model2TextEditors = Object.create(null);
		this._onTextEditorAdd = new Emitter<MainThreadTextEditor>();
		this._onTextEditorRemove = new Emitter<MainThreadTextEditor>();
		this._onDidUpdateTextEditors = new Emitter<void>();
		this._onDidChangeFocusedTextEditor = new Emitter<string>();
		this._focusTracker = {
			onGainedFocus: () => this._updateFocusedTextEditor(),
			onLostFocus: () => this._updateFocusedTextEditor()
		};

		this._modelService.onModelAdded(this._onModelAdded, this, this._toDispose);
		this._modelService.onModelRemoved(this._onModelRemoved, this, this._toDispose);

		this._codeEditorService.onCodeEditorAdd(this._onCodeEditorAdd, this, this._toDispose);
		this._codeEditorService.onCodeEditorRemove(this._onCodeEditorRemove, this, this._toDispose);

		this._updateMapping = new RunOnceScheduler(() => this._doUpdateMapping(), 0);
		this._toDispose.push(this._updateMapping);
	}

	public dispose(): void {
		this._toDispose = dispose(this._toDispose);
	}

	private _onModelAdded(model: EditorCommon.IModel): void {
		this._updateMapping.schedule();
	}

	private _onModelRemoved(model: EditorCommon.IModel): void {
		this._updateMapping.schedule();
	}

	private _onCodeEditorAdd(codeEditor: EditorCommon.ICommonCodeEditor): void {
		this._editorModelChangeListeners[codeEditor.getId()] = codeEditor.onDidChangeModel(_ => this._updateMapping.schedule());
		this._updateMapping.schedule();
	}

	private _onCodeEditorRemove(codeEditor: EditorCommon.ICommonCodeEditor): void {
		this._editorModelChangeListeners[codeEditor.getId()].dispose();
		delete this._editorModelChangeListeners[codeEditor.getId()];
		this._updateMapping.schedule();
	}

	private _doUpdateMapping(): void {
		let allModels = this._modelService.getModels();
		// Same filter as in extHostDocuments
		allModels = allModels.filter((model) => !model.isTooLargeForHavingARichMode());
		let allModelsMap: { [modelUri: string]: EditorCommon.IModel; } = Object.create(null);
		allModels.forEach((model) => {
			allModelsMap[model.uri.toString()] = model;
		});

		// Remove text editors for models that no longer exist
		Object.keys(this._model2TextEditors).forEach((modelUri) => {
			if (allModelsMap[modelUri]) {
				// model still exists, will be updated below
				return;
			}

			let textEditorsToRemove = this._model2TextEditors[modelUri];
			delete this._model2TextEditors[modelUri];

			for (let i = 0; i < textEditorsToRemove.length; i++) {
				this._onTextEditorRemove.fire(textEditorsToRemove[i]);
				textEditorsToRemove[i].dispose();
			}
		});

		// Handle all visible models
		let visibleModels = this._getVisibleModels();
		Object.keys(visibleModels).forEach((modelUri) => {
			let model = visibleModels[modelUri].model;
			let codeEditors = visibleModels[modelUri].codeEditors;

			if (!this._model2TextEditors[modelUri]) {
				this._model2TextEditors[modelUri] = [];
			}
			let existingTextEditors = this._model2TextEditors[modelUri];

			// Remove text editors if more exist
			while (existingTextEditors.length > codeEditors.length) {
				let removedTextEditor = existingTextEditors.pop();
				this._onTextEditorRemove.fire(removedTextEditor);
				removedTextEditor.dispose();
			}

			// Adjust remaining text editors
			for (let i = 0; i < existingTextEditors.length; i++) {
				existingTextEditors[i].setCodeEditor(codeEditors[i]);
			}

			// Create new editors as needed
			for (let i = existingTextEditors.length; i < codeEditors.length; i++) {
				let newTextEditor = new MainThreadTextEditor(MainThreadEditorsTracker._Ids.nextId(), model, codeEditors[i], this._focusTracker, this._modelService);
				existingTextEditors.push(newTextEditor);
				this._onTextEditorAdd.fire(newTextEditor);
			}
		});

		// Handle all not visible models
		allModels.forEach((model) => {
			let modelUri = model.uri.toString();

			if (visibleModels[modelUri]) {
				// model is visible, already handled above
				return;
			}

			if (!this._model2TextEditors[modelUri]) {
				this._model2TextEditors[modelUri] = [];
			}
			let existingTextEditors = this._model2TextEditors[modelUri];

			// Remove extra text editors
			while (existingTextEditors.length > 1) {
				let removedTextEditor = existingTextEditors.pop();
				this._onTextEditorRemove.fire(removedTextEditor);
				removedTextEditor.dispose();
			}

			// Create new editor if needed or adjust it
			if (existingTextEditors.length === 0) {
				let newTextEditor = new MainThreadTextEditor(MainThreadEditorsTracker._Ids.nextId(), model, null, this._focusTracker, this._modelService);
				existingTextEditors.push(newTextEditor);
				this._onTextEditorAdd.fire(newTextEditor);
			} else {
				existingTextEditors[0].setCodeEditor(null);
			}
		});

		this._printState();

		this._visibleTextEditorIds = this._findVisibleTextEditorIds();

		this._updateFocusedTextEditor();

		// this is a sync event
		this._onDidUpdateTextEditors.fire(undefined);
	}

	private _updateFocusedTextEditor(): void {
		this._setFocusedTextEditorId(this._findFocusedTextEditorId());
	}

	private _findFocusedTextEditorId(): string {
		let modelUris = Object.keys(this._model2TextEditors);
		for (let i = 0, len = modelUris.length; i < len; i++) {
			let editors = this._model2TextEditors[modelUris[i]];
			for (let j = 0, lenJ = editors.length; j < lenJ; j++) {
				if (editors[j].isFocused()) {
					return editors[j].getId();
				}
			}
		}

		return null;
	}

	private _findVisibleTextEditorIds(): string[] {
		let result: string[] = [];
		let modelUris = Object.keys(this._model2TextEditors);
		for (let i = 0, len = modelUris.length; i < len; i++) {
			let editors = this._model2TextEditors[modelUris[i]];
			for (let j = 0, lenJ = editors.length; j < lenJ; j++) {
				if (editors[j].isVisible()) {
					result.push(editors[j].getId());
				}
			}
		}
		result.sort();
		return result;
	}

	private _setFocusedTextEditorId(focusedTextEditorId: string): void {
		if (this._focusedTextEditorId === focusedTextEditorId) {
			// no change
			return;
		}

		this._focusedTextEditorId = focusedTextEditorId;
		this._printState();
		this._onDidChangeFocusedTextEditor.fire(this._focusedTextEditorId);
	}


	private _printState(): void {
		// console.log('----------------------');
		// Object.keys(this._model2TextEditors).forEach((modelUri) => {
		// 	let editors = this._model2TextEditors[modelUri];

		// 	console.log(editors.map((e) => {
		// 		return e.getId() + " (" + (e.getId() === this._focusedTextEditorId ? 'FOCUSED, ': '') + modelUri + ")";
		// 	}).join('\n'));
		// });
	}

	private _getVisibleModels(): IVisibleModels {
		let r: IVisibleModels = {};

		let allCodeEditors = this._codeEditorService.listCodeEditors();

		// Maintain a certain sorting such that the mapping doesn't change too much all the time
		allCodeEditors.sort((a, b) => strcmp(a.getId(), b.getId()));

		allCodeEditors.forEach((codeEditor) => {
			let model = codeEditor.getModel();
			if (!model || model.isTooLargeForHavingARichMode() || !this._modelService.getModel(model.uri)) {
				return;
			}

			let modelUri = model.uri.toString();
			r[modelUri] = r[modelUri] || {
				model: model,
				codeEditors: []
			};
			r[modelUri].codeEditors.push(codeEditor);
		});

		return r;
	}

	public getFocusedTextEditorId(): string {
		return this._focusedTextEditorId;
	}

	public getVisibleTextEditorIds(): string[] {
		return this._visibleTextEditorIds;
	}

	public get onTextEditorAdd(): Event<MainThreadTextEditor> {
		return this._onTextEditorAdd.event;
	}

	public get onTextEditorRemove(): Event<MainThreadTextEditor> {
		return this._onTextEditorRemove.event;
	}

	public get onDidUpdateTextEditors(): Event<void> {
		return this._onDidUpdateTextEditors.event;
	}

	public get onChangedFocusedTextEditor(): Event<string> {
		return this._onDidChangeFocusedTextEditor.event;
	}

	public findTextEditorIdFor(codeEditor: EditorCommon.ICommonCodeEditor): string {
		let modelUris = Object.keys(this._model2TextEditors);
		for (let i = 0, len = modelUris.length; i < len; i++) {
			let editors = this._model2TextEditors[modelUris[i]];
			for (let j = 0, lenJ = editors.length; j < lenJ; j++) {
				if (editors[j].hasCodeEditor(codeEditor)) {
					return editors[j].getId();
				}
			}
		}

		return null;
	}

	public registerTextEditorDecorationType(key: string, options: EditorCommon.IDecorationRenderOptions): void {
		this._codeEditorService.registerDecorationType(key, options);
	}

	public removeTextEditorDecorationType(key: string): void {
		this._codeEditorService.removeDecorationType(key);
	}
}

interface IVisibleModels {
	[modelUri: string]: {
		model: EditorCommon.IModel;
		codeEditors: EditorCommon.ICommonCodeEditor[];
	};
}

function strcmp(a: string, b: string): number {
	if (a < b) {
		return -1;
	}
	if (a > b) {
		return 1;
	}
	return 0;
}


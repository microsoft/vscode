/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import EditorCommon = require('vs/editor/common/editorCommon');
import Event, { Emitter } from 'vs/base/common/event';
import { IEditor } from 'vs/platform/editor/common/editor';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
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

	public getCodeEditor(): EditorCommon.ICommonCodeEditor {
		return this._codeEditor;
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

		if (!this._codeEditor) {
			return;
		}

		if (newConfiguration.cursorStyle) {
			let newCursorStyle = EditorCommon.cursorStyleToString(newConfiguration.cursorStyle);
			this._codeEditor.updateOptions({
				cursorStyle: newCursorStyle
			});
		}

		if (typeof newConfiguration.lineNumbers !== 'undefined') {
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
			return;
		}
		this._codeEditor.setDecorations(key, ranges);
	}

	public revealRange(range: EditorCommon.IRange, revealType: TextEditorRevealType): void {
		if (!this._codeEditor) {
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
				console.warn(`Unknown revealType: ${revealType}`);
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
			// throw new Error('Model has changed in the meantime!');
			// model changed in the meantime
			return false;
		}

		if (!this._codeEditor) {
			// console.warn('applyEdits on invisible editor');
			return false;
		}

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

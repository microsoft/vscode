/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { ICodeEditor } from '../../../editor/browser/editorBrowser.js';
import { RenderLineNumbersType, TextEditorCursorStyle, cursorStyleToString, EditorOption } from '../../../editor/common/config/editorOptions.js';
import { IRange, Range } from '../../../editor/common/core/range.js';
import { ISelection, Selection } from '../../../editor/common/core/selection.js';
import { IDecorationOptions, ScrollType } from '../../../editor/common/editorCommon.js';
import { ITextModel, ITextModelUpdateOptions } from '../../../editor/common/model.js';
import { ISingleEditOperation } from '../../../editor/common/core/editOperation.js';
import { IModelService } from '../../../editor/common/services/model.js';
import { SnippetController2 } from '../../../editor/contrib/snippet/browser/snippetController2.js';
import { IApplyEditsOptions, IEditorPropertiesChangeData, IResolvedTextEditorConfiguration, ISnippetOptions, ITextEditorConfigurationUpdate, TextEditorRevealType } from '../common/extHost.protocol.js';
import { IEditorPane } from '../../common/editor.js';
import { equals } from '../../../base/common/arrays.js';
import { CodeEditorStateFlag, EditorState } from '../../../editor/contrib/editorState/browser/editorState.js';
import { IClipboardService } from '../../../platform/clipboard/common/clipboardService.js';
import { SnippetParser } from '../../../editor/contrib/snippet/browser/snippetParser.js';
import { MainThreadDocuments } from './mainThreadDocuments.js';
import { ISnippetEdit } from '../../../editor/contrib/snippet/browser/snippetSession.js';

export interface IFocusTracker {
	onGainedFocus(): void;
	onLostFocus(): void;
}

export class MainThreadTextEditorProperties {

	public static readFromEditor(previousProperties: MainThreadTextEditorProperties | null, model: ITextModel, codeEditor: ICodeEditor | null): MainThreadTextEditorProperties {
		const selections = MainThreadTextEditorProperties._readSelectionsFromCodeEditor(previousProperties, codeEditor);
		const options = MainThreadTextEditorProperties._readOptionsFromCodeEditor(previousProperties, model, codeEditor);
		const visibleRanges = MainThreadTextEditorProperties._readVisibleRangesFromCodeEditor(previousProperties, codeEditor);
		return new MainThreadTextEditorProperties(selections, options, visibleRanges);
	}

	private static _readSelectionsFromCodeEditor(previousProperties: MainThreadTextEditorProperties | null, codeEditor: ICodeEditor | null): Selection[] {
		let result: Selection[] | null = null;
		if (codeEditor) {
			result = codeEditor.getSelections();
		}
		if (!result && previousProperties) {
			result = previousProperties.selections;
		}
		if (!result) {
			result = [new Selection(1, 1, 1, 1)];
		}
		return result;
	}

	private static _readOptionsFromCodeEditor(previousProperties: MainThreadTextEditorProperties | null, model: ITextModel, codeEditor: ICodeEditor | null): IResolvedTextEditorConfiguration {
		if (model.isDisposed()) {
			if (previousProperties) {
				// shutdown time
				return previousProperties.options;
			} else {
				throw new Error('No valid properties');
			}
		}

		let cursorStyle: TextEditorCursorStyle;
		let lineNumbers: RenderLineNumbersType;
		if (codeEditor) {
			const options = codeEditor.getOptions();
			const lineNumbersOpts = options.get(EditorOption.lineNumbers);
			cursorStyle = options.get(EditorOption.cursorStyle);
			lineNumbers = lineNumbersOpts.renderType;
		} else if (previousProperties) {
			cursorStyle = previousProperties.options.cursorStyle;
			lineNumbers = previousProperties.options.lineNumbers;
		} else {
			cursorStyle = TextEditorCursorStyle.Line;
			lineNumbers = RenderLineNumbersType.On;
		}

		const modelOptions = model.getOptions();
		return {
			insertSpaces: modelOptions.insertSpaces,
			tabSize: modelOptions.tabSize,
			indentSize: modelOptions.indentSize,
			originalIndentSize: modelOptions.originalIndentSize,
			cursorStyle: cursorStyle,
			lineNumbers: lineNumbers
		};
	}

	private static _readVisibleRangesFromCodeEditor(previousProperties: MainThreadTextEditorProperties | null, codeEditor: ICodeEditor | null): Range[] {
		if (codeEditor) {
			return codeEditor.getVisibleRanges();
		}
		return [];
	}

	constructor(
		public readonly selections: Selection[],
		public readonly options: IResolvedTextEditorConfiguration,
		public readonly visibleRanges: Range[]
	) {
	}

	public generateDelta(oldProps: MainThreadTextEditorProperties | null, selectionChangeSource: string | null): IEditorPropertiesChangeData | null {
		const delta: IEditorPropertiesChangeData = {
			options: null,
			selections: null,
			visibleRanges: null
		};

		if (!oldProps || !MainThreadTextEditorProperties._selectionsEqual(oldProps.selections, this.selections)) {
			delta.selections = {
				selections: this.selections,
				source: selectionChangeSource ?? undefined,
			};
		}

		if (!oldProps || !MainThreadTextEditorProperties._optionsEqual(oldProps.options, this.options)) {
			delta.options = this.options;
		}

		if (!oldProps || !MainThreadTextEditorProperties._rangesEqual(oldProps.visibleRanges, this.visibleRanges)) {
			delta.visibleRanges = this.visibleRanges;
		}

		if (delta.selections || delta.options || delta.visibleRanges) {
			// something changed
			return delta;
		}
		// nothing changed
		return null;
	}

	private static _selectionsEqual(a: readonly Selection[], b: readonly Selection[]): boolean {
		return equals(a, b, (aValue, bValue) => aValue.equalsSelection(bValue));
	}

	private static _rangesEqual(a: readonly Range[], b: readonly Range[]): boolean {
		return equals(a, b, (aValue, bValue) => aValue.equalsRange(bValue));
	}

	private static _optionsEqual(a: IResolvedTextEditorConfiguration, b: IResolvedTextEditorConfiguration): boolean {
		if (a && !b || !a && b) {
			return false;
		}
		if (!a && !b) {
			return true;
		}
		return (
			a.tabSize === b.tabSize
			&& a.indentSize === b.indentSize
			&& a.insertSpaces === b.insertSpaces
			&& a.cursorStyle === b.cursorStyle
			&& a.lineNumbers === b.lineNumbers
		);
	}
}

/**
 * Text Editor that is permanently bound to the same model.
 * It can be bound or not to a CodeEditor.
 */
export class MainThreadTextEditor {

	private readonly _id: string;
	private readonly _model: ITextModel;
	private readonly _mainThreadDocuments: MainThreadDocuments;
	private readonly _modelService: IModelService;
	private readonly _clipboardService: IClipboardService;
	private readonly _modelListeners = new DisposableStore();
	private _codeEditor: ICodeEditor | null;
	private readonly _focusTracker: IFocusTracker;
	private readonly _codeEditorListeners = new DisposableStore();

	private _properties: MainThreadTextEditorProperties | null;
	private readonly _onPropertiesChanged: Emitter<IEditorPropertiesChangeData>;

	constructor(
		id: string,
		model: ITextModel,
		codeEditor: ICodeEditor,
		focusTracker: IFocusTracker,
		mainThreadDocuments: MainThreadDocuments,
		modelService: IModelService,
		clipboardService: IClipboardService,
	) {
		this._id = id;
		this._model = model;
		this._codeEditor = null;
		this._properties = null;
		this._focusTracker = focusTracker;
		this._mainThreadDocuments = mainThreadDocuments;
		this._modelService = modelService;
		this._clipboardService = clipboardService;

		this._onPropertiesChanged = new Emitter<IEditorPropertiesChangeData>();

		this._modelListeners.add(this._model.onDidChangeOptions((e) => {
			this._updatePropertiesNow(null);
		}));

		this.setCodeEditor(codeEditor);
		this._updatePropertiesNow(null);
	}

	public dispose(): void {
		this._modelListeners.dispose();
		this._codeEditor = null;
		this._codeEditorListeners.dispose();
	}

	private _updatePropertiesNow(selectionChangeSource: string | null): void {
		this._setProperties(
			MainThreadTextEditorProperties.readFromEditor(this._properties, this._model, this._codeEditor),
			selectionChangeSource
		);
	}

	private _setProperties(newProperties: MainThreadTextEditorProperties, selectionChangeSource: string | null): void {
		const delta = newProperties.generateDelta(this._properties, selectionChangeSource);
		this._properties = newProperties;
		if (delta) {
			this._onPropertiesChanged.fire(delta);
		}
	}

	public getId(): string {
		return this._id;
	}

	public getModel(): ITextModel {
		return this._model;
	}

	public getCodeEditor(): ICodeEditor | null {
		return this._codeEditor;
	}

	public hasCodeEditor(codeEditor: ICodeEditor | null): boolean {
		return (this._codeEditor === codeEditor);
	}

	public setCodeEditor(codeEditor: ICodeEditor | null): void {
		if (this.hasCodeEditor(codeEditor)) {
			// Nothing to do...
			return;
		}
		this._codeEditorListeners.clear();

		this._codeEditor = codeEditor;
		if (this._codeEditor) {

			// Catch early the case that this code editor gets a different model set and disassociate from this model
			this._codeEditorListeners.add(this._codeEditor.onDidChangeModel(() => {
				this.setCodeEditor(null);
			}));

			this._codeEditorListeners.add(this._codeEditor.onDidFocusEditorWidget(() => {
				this._focusTracker.onGainedFocus();
			}));
			this._codeEditorListeners.add(this._codeEditor.onDidBlurEditorWidget(() => {
				this._focusTracker.onLostFocus();
			}));

			let nextSelectionChangeSource: string | null = null;
			this._codeEditorListeners.add(this._mainThreadDocuments.onIsCaughtUpWithContentChanges((uri) => {
				if (uri.toString() === this._model.uri.toString()) {
					const selectionChangeSource = nextSelectionChangeSource;
					nextSelectionChangeSource = null;
					this._updatePropertiesNow(selectionChangeSource);
				}
			}));

			const isValidCodeEditor = () => {
				// Due to event timings, it is possible that there is a model change event not yet delivered to us.
				// > e.g. a model change event is emitted to a listener which then decides to update editor options
				// > In this case the editor configuration change event reaches us first.
				// So simply check that the model is still attached to this code editor
				return (this._codeEditor && this._codeEditor.getModel() === this._model);
			};

			const updateProperties = (selectionChangeSource: string | null) => {
				// Some editor events get delivered faster than model content changes. This is
				// problematic, as this leads to editor properties reaching the extension host
				// too soon, before the model content change that was the root cause.
				//
				// If this case is identified, then let's update editor properties on the next model
				// content change instead.
				if (this._mainThreadDocuments.isCaughtUpWithContentChanges(this._model.uri)) {
					nextSelectionChangeSource = null;
					this._updatePropertiesNow(selectionChangeSource);
				} else {
					// update editor properties on the next model content change
					nextSelectionChangeSource = selectionChangeSource;
				}
			};

			this._codeEditorListeners.add(this._codeEditor.onDidChangeCursorSelection((e) => {
				// selection
				if (!isValidCodeEditor()) {
					return;
				}
				updateProperties(e.source);
			}));
			this._codeEditorListeners.add(this._codeEditor.onDidChangeConfiguration((e) => {
				// options
				if (!isValidCodeEditor()) {
					return;
				}
				updateProperties(null);
			}));
			this._codeEditorListeners.add(this._codeEditor.onDidLayoutChange(() => {
				// visibleRanges
				if (!isValidCodeEditor()) {
					return;
				}
				updateProperties(null);
			}));
			this._codeEditorListeners.add(this._codeEditor.onDidScrollChange(() => {
				// visibleRanges
				if (!isValidCodeEditor()) {
					return;
				}
				updateProperties(null);
			}));
			this._updatePropertiesNow(null);
		}
	}

	public isVisible(): boolean {
		return !!this._codeEditor;
	}

	public getProperties(): MainThreadTextEditorProperties {
		return this._properties!;
	}

	public get onPropertiesChanged(): Event<IEditorPropertiesChangeData> {
		return this._onPropertiesChanged.event;
	}

	public setSelections(selections: ISelection[]): void {
		if (this._codeEditor) {
			this._codeEditor.setSelections(selections);
			return;
		}

		const newSelections = selections.map(Selection.liftSelection);
		this._setProperties(
			new MainThreadTextEditorProperties(newSelections, this._properties!.options, this._properties!.visibleRanges),
			null
		);
	}

	private _setIndentConfiguration(newConfiguration: ITextEditorConfigurationUpdate): void {
		const creationOpts = this._modelService.getCreationOptions(this._model.getLanguageId(), this._model.uri, this._model.isForSimpleWidget);

		if (newConfiguration.tabSize === 'auto' || newConfiguration.insertSpaces === 'auto') {
			// one of the options was set to 'auto' => detect indentation
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

		const newOpts: ITextModelUpdateOptions = {};
		if (typeof newConfiguration.insertSpaces !== 'undefined') {
			newOpts.insertSpaces = newConfiguration.insertSpaces;
		}
		if (typeof newConfiguration.tabSize !== 'undefined') {
			newOpts.tabSize = newConfiguration.tabSize;
		}
		if (typeof newConfiguration.indentSize !== 'undefined') {
			newOpts.indentSize = newConfiguration.indentSize;
		}
		this._model.updateOptions(newOpts);
	}

	public setConfiguration(newConfiguration: ITextEditorConfigurationUpdate): void {
		this._setIndentConfiguration(newConfiguration);

		if (!this._codeEditor) {
			return;
		}

		if (newConfiguration.cursorStyle) {
			const newCursorStyle = cursorStyleToString(newConfiguration.cursorStyle);
			this._codeEditor.updateOptions({
				cursorStyle: newCursorStyle
			});
		}

		if (typeof newConfiguration.lineNumbers !== 'undefined') {
			let lineNumbers: 'on' | 'off' | 'relative' | 'interval';
			switch (newConfiguration.lineNumbers) {
				case RenderLineNumbersType.On:
					lineNumbers = 'on';
					break;
				case RenderLineNumbersType.Relative:
					lineNumbers = 'relative';
					break;
				case RenderLineNumbersType.Interval:
					lineNumbers = 'interval';
					break;
				default:
					lineNumbers = 'off';
			}
			this._codeEditor.updateOptions({
				lineNumbers: lineNumbers
			});
		}
	}

	public setDecorations(key: string, ranges: IDecorationOptions[]): void {
		if (!this._codeEditor) {
			return;
		}
		this._codeEditor.setDecorationsByType('exthost-api', key, ranges);
	}

	public setDecorationsFast(key: string, _ranges: number[]): void {
		if (!this._codeEditor) {
			return;
		}
		const ranges: Range[] = [];
		for (let i = 0, len = Math.floor(_ranges.length / 4); i < len; i++) {
			ranges[i] = new Range(_ranges[4 * i], _ranges[4 * i + 1], _ranges[4 * i + 2], _ranges[4 * i + 3]);
		}
		this._codeEditor.setDecorationsByTypeFast(key, ranges);
	}

	public revealRange(range: IRange, revealType: TextEditorRevealType): void {
		if (!this._codeEditor) {
			return;
		}
		switch (revealType) {
			case TextEditorRevealType.Default:
				this._codeEditor.revealRange(range, ScrollType.Smooth);
				break;
			case TextEditorRevealType.InCenter:
				this._codeEditor.revealRangeInCenter(range, ScrollType.Smooth);
				break;
			case TextEditorRevealType.InCenterIfOutsideViewport:
				this._codeEditor.revealRangeInCenterIfOutsideViewport(range, ScrollType.Smooth);
				break;
			case TextEditorRevealType.AtTop:
				this._codeEditor.revealRangeAtTop(range, ScrollType.Smooth);
				break;
			default:
				console.warn(`Unknown revealType: ${revealType}`);
				break;
		}
	}

	public isFocused(): boolean {
		if (this._codeEditor) {
			return this._codeEditor.hasTextFocus();
		}
		return false;
	}

	public matches(editor: IEditorPane): boolean {
		if (!editor) {
			return false;
		}
		return editor.getControl() === this._codeEditor;
	}

	public applyEdits(versionIdCheck: number, edits: ISingleEditOperation[], opts: IApplyEditsOptions): boolean {
		if (this._model.getVersionId() !== versionIdCheck) {
			// throw new Error('Model has changed in the meantime!');
			// model changed in the meantime
			return false;
		}

		if (!this._codeEditor) {
			// console.warn('applyEdits on invisible editor');
			return false;
		}

		if (typeof opts.setEndOfLine !== 'undefined') {
			this._model.pushEOL(opts.setEndOfLine);
		}

		const transformedEdits = edits.map((edit): ISingleEditOperation => {
			return {
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

	async insertSnippet(modelVersionId: number, template: string, ranges: readonly IRange[], opts: ISnippetOptions) {

		if (!this._codeEditor || !this._codeEditor.hasModel()) {
			return false;
		}

		// check if clipboard is required and only iff read it (async)
		let clipboardText: string | undefined;
		const needsTemplate = SnippetParser.guessNeedsClipboard(template);
		if (needsTemplate) {
			const state = new EditorState(this._codeEditor, CodeEditorStateFlag.Value | CodeEditorStateFlag.Position);
			clipboardText = await this._clipboardService.readText();
			if (!state.validate(this._codeEditor)) {
				return false;
			}
		}

		if (this._codeEditor.getModel().getVersionId() !== modelVersionId) {
			return false;
		}

		const snippetController = SnippetController2.get(this._codeEditor);
		if (!snippetController) {
			return false;
		}

		this._codeEditor.focus();

		// make modifications as snippet edit
		const edits: ISnippetEdit[] = ranges.map(range => ({ range: Range.lift(range), template }));
		snippetController.apply(edits, {
			overwriteBefore: 0, overwriteAfter: 0,
			undoStopBefore: opts.undoStopBefore, undoStopAfter: opts.undoStopAfter,
			adjustWhitespace: !opts.keepWhitespace,
			clipboardText
		});

		return true;
	}
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/// <amd-dependency path="vs/css!./folding" />

'use strict';

import * as nls from 'vs/nls';
import * as types from 'vs/base/common/types';
import { escapeRegExpCharacters } from 'vs/base/common/strings';
import { RunOnceScheduler, Delayer } from 'vs/base/common/async';
import { KeyCode, KeyMod, KeyChord } from 'vs/base/common/keyCodes';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import { ScrollType, IEditorContribution } from 'vs/editor/common/editorCommon';
import { ITextModel } from 'vs/editor/common/model';
import { registerEditorAction, registerEditorContribution, ServicesAccessor, EditorAction, registerInstantiatedEditorAction } from 'vs/editor/browser/editorExtensions';
import { ICodeEditor, IEditorMouseEvent, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { FoldingModel, setCollapseStateAtLevel, CollapseMemento, setCollapseStateLevelsDown, setCollapseStateLevelsUp, setCollapseStateForMatchingLines, setCollapseStateForType } from 'vs/editor/contrib/folding/foldingModel';
import { FoldingDecorationProvider } from './foldingDecorations';
import { FoldingRegions } from './foldingRanges';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { IConfigurationChangedEvent } from 'vs/editor/common/config/editorOptions';
import { IMarginData, IEmptyContentData } from 'vs/editor/browser/controller/mouseTarget';
import { HiddenRangeModel } from 'vs/editor/contrib/folding/hiddenRangeModel';
import { IRange } from 'vs/editor/common/core/range';
import { LanguageConfigurationRegistry } from 'vs/editor/common/modes/languageConfigurationRegistry';
import { IndentRangeProvider } from 'vs/editor/contrib/folding/indentRangeProvider';
import { IPosition } from 'vs/editor/common/core/position';
import { FoldingProviderRegistry, FoldingRangeType } from 'vs/editor/common/modes';
import { SyntaxRangeProvider } from './syntaxRangeProvider';

export const ID = 'editor.contrib.folding';

export interface RangeProvider {
	compute(editorModel: ITextModel): TPromise<FoldingRegions>;
}

export class FoldingController implements IEditorContribution {

	static MAX_FOLDING_REGIONS = 5000;


	public static get(editor: ICodeEditor): FoldingController {
		return editor.getContribution<FoldingController>(ID);
	}

	private editor: ICodeEditor;
	private _isEnabled: boolean;
	private _autoHideFoldingControls: boolean;

	private foldingDecorationProvider: FoldingDecorationProvider;

	private foldingModel: FoldingModel;
	private hiddenRangeModel: HiddenRangeModel;

	private rangeProvider: RangeProvider;

	private foldingModelPromise: TPromise<FoldingModel>;
	private updateScheduler: Delayer<FoldingModel>;

	private globalToDispose: IDisposable[];

	private cursorChangedScheduler: RunOnceScheduler;

	private localToDispose: IDisposable[];

	constructor(editor: ICodeEditor) {
		this.editor = editor;
		this._isEnabled = this.editor.getConfiguration().contribInfo.folding;
		this._autoHideFoldingControls = this.editor.getConfiguration().contribInfo.showFoldingControls === 'mouseover';

		this.globalToDispose = [];
		this.localToDispose = [];

		this.foldingDecorationProvider = new FoldingDecorationProvider(editor);
		this.foldingDecorationProvider.autoHideFoldingControls = this._autoHideFoldingControls;

		this.globalToDispose.push(this.editor.onDidChangeModel(() => this.onModelChanged()));
		this.globalToDispose.push(FoldingProviderRegistry.onDidChange(() => this.onModelChanged()));

		this.globalToDispose.push(this.editor.onDidChangeConfiguration((e: IConfigurationChangedEvent) => {
			if (e.contribInfo) {
				let oldIsEnabled = this._isEnabled;
				this._isEnabled = this.editor.getConfiguration().contribInfo.folding;
				if (oldIsEnabled !== this._isEnabled) {
					this.onModelChanged();
				}
				let oldShowFoldingControls = this._autoHideFoldingControls;
				this._autoHideFoldingControls = this.editor.getConfiguration().contribInfo.showFoldingControls === 'mouseover';
				if (oldShowFoldingControls !== this._autoHideFoldingControls) {
					this.foldingDecorationProvider.autoHideFoldingControls = this._autoHideFoldingControls;
					this.onModelContentChanged();
				}
			}
		}));
		this.globalToDispose.push({ dispose: () => dispose(this.localToDispose) });
		this.onModelChanged();
	}

	public getId(): string {
		return ID;
	}

	public dispose(): void {
		this.globalToDispose = dispose(this.globalToDispose);
	}

	/**
	 * Store view state.
	 */
	public saveViewState(): { collapsedRegions?: CollapseMemento, lineCount?: number } {
		let model = this.editor.getModel();
		if (!model || !this._isEnabled || model.isTooLargeForTokenization()) {
			return {};
		}
		if (this.foldingModel) { // disposed ?
			let collapsedRegions = this.foldingModel.isInitialized ? this.foldingModel.getMemento() : this.hiddenRangeModel.getMemento();
			return { collapsedRegions, lineCount: model.getLineCount() };
		}
		return void 0;
	}

	/**
	 * Restore view state.
	 */
	public restoreViewState(state: { collapsedRegions?: CollapseMemento, lineCount?: number }): void {
		let model = this.editor.getModel();
		if (!model || !this._isEnabled || model.isTooLargeForTokenization()) {
			return;
		}
		if (!state || !state.collapsedRegions || state.lineCount !== model.getLineCount()) {
			return;
		}

		// set the hidden ranges right away, before waiting for the folding model.
		if (this.hiddenRangeModel.applyMemento(state.collapsedRegions)) {
			this.getFoldingModel().then(foldingModel => {
				if (foldingModel) {
					foldingModel.applyMemento(state.collapsedRegions);
				}
			});
		}
	}

	private onModelChanged(): void {
		this.localToDispose = dispose(this.localToDispose);

		let model = this.editor.getModel();
		if (!this._isEnabled || !model || model.isTooLargeForTokenization()) {
			// huge files get no view model, so they cannot support hidden areas
			return;
		}

		this.foldingModel = new FoldingModel(model, this.foldingDecorationProvider);
		this.localToDispose.push(this.foldingModel);

		this.hiddenRangeModel = new HiddenRangeModel(this.foldingModel);
		this.localToDispose.push(this.hiddenRangeModel);
		this.localToDispose.push(this.hiddenRangeModel.onDidChange(hr => this.onHiddenRangesChanges(hr)));

		this.updateScheduler = new Delayer<FoldingModel>(200);

		this.cursorChangedScheduler = new RunOnceScheduler(() => this.revealCursor(), 200);
		this.localToDispose.push(this.cursorChangedScheduler);
		this.localToDispose.push(this.editor.onDidChangeModelLanguageConfiguration(e => this.onModelContentChanged())); // covers model language changes as well
		this.localToDispose.push(this.editor.onDidChangeModelContent(e => this.onModelContentChanged()));
		this.localToDispose.push(this.editor.onDidChangeCursorPosition(e => this.onCursorPositionChanged()));
		this.localToDispose.push(this.editor.onMouseDown(e => this.onEditorMouseDown(e)));
		this.localToDispose.push(this.editor.onMouseUp(e => this.onEditorMouseUp(e)));
		this.localToDispose.push({
			dispose: () => {
				this.updateScheduler.cancel();
				this.updateScheduler = null;
				this.foldingModel = null;
				this.foldingModelPromise = null;
				this.hiddenRangeModel = null;
				this.cursorChangedScheduler = null;
				this.rangeProvider = null;
			}
		});
		this.onModelContentChanged();
	}

	private getRangeProvider(): RangeProvider {
		if (!this.rangeProvider) {
			let foldingProviders = FoldingProviderRegistry.ordered(this.foldingModel.textModel);
			if (foldingProviders.length) {
				this.rangeProvider = new SyntaxRangeProvider(foldingProviders);
			} else {
				this.rangeProvider = new IndentRangeProvider();
			}
		}
		return this.rangeProvider;
	}

	public getFoldingModel() {
		return this.foldingModelPromise;
	}

	private onModelContentChanged() {
		if (this.updateScheduler) {
			this.foldingModelPromise = this.updateScheduler.trigger(() => {
				if (this.foldingModel) { // null if editor has been disposed, or folding turned off
					// some cursors might have moved into hidden regions, make sure they are in expanded regions
					let selections = this.editor.getSelections();
					let selectionLineNumbers = selections ? selections.map(s => s.startLineNumber) : [];
					return this.getRangeProvider().compute(this.foldingModel.textModel).then(foldingRanges => {
						this.foldingModel.update(foldingRanges, selectionLineNumbers);
						return this.foldingModel;
					});
				}
				return null;
			});
		}
	}

	private onHiddenRangesChanges(hiddenRanges: IRange[]) {
		if (hiddenRanges.length) {
			let selections = this.editor.getSelections();
			if (selections) {
				if (this.hiddenRangeModel.adjustSelections(selections)) {
					this.editor.setSelections(selections);
				}
			}
		}
		this.editor.setHiddenAreas(hiddenRanges);
	}

	private onCursorPositionChanged() {
		if (this.hiddenRangeModel.hasRanges()) {
			this.cursorChangedScheduler.schedule();
		}
	}

	private revealCursor() {
		this.getFoldingModel().then(foldingModel => { // null is returned if folding got disabled in the meantime
			if (foldingModel) {
				let selections = this.editor.getSelections();
				if (selections) {
					for (let selection of selections) {
						let lineNumber = selection.selectionStartLineNumber;
						if (this.hiddenRangeModel.isHidden(lineNumber)) {
							let toToggle = foldingModel.getAllRegionsAtLine(lineNumber, r => r.isCollapsed && lineNumber > r.startLineNumber);
							foldingModel.toggleCollapseState(toToggle);
						}
					}
				}
			}
		});

	}

	private mouseDownInfo: { lineNumber: number, iconClicked: boolean };

	private onEditorMouseDown(e: IEditorMouseEvent): void {
		this.mouseDownInfo = null;

		let range = e.target.range;
		if (!this.hiddenRangeModel || !range) {
			return;
		}
		if (!e.event.leftButton && !e.event.middleButton) {
			return;
		}
		let iconClicked = false;
		switch (e.target.type) {
			case MouseTargetType.GUTTER_LINE_DECORATIONS:
				const data = e.target.detail as IMarginData;
				const gutterOffsetX = data.offsetX - data.glyphMarginWidth - data.lineNumbersWidth;

				// TODO@joao TODO@alex TODO@martin this is such that we don't collide with dirty diff
				if (gutterOffsetX <= 10) {
					return;
				}

				iconClicked = true;
				break;
			case MouseTargetType.CONTENT_EMPTY: {
				if (this.hiddenRangeModel.hasRanges()) {
					const data = e.target.detail as IEmptyContentData;
					if (!data.isAfterLines) {
						break;
					}
				}
				return;
			}
			case MouseTargetType.CONTENT_TEXT: {
				if (this.hiddenRangeModel.hasRanges()) {
					let model = this.editor.getModel();
					if (model && range.startColumn === model.getLineMaxColumn(range.startLineNumber)) {
						break;
					}
				}
				return;
			}
			default:
				return;
		}

		this.mouseDownInfo = { lineNumber: range.startLineNumber, iconClicked };
	}

	private onEditorMouseUp(e: IEditorMouseEvent): void {
		if (!this.mouseDownInfo) {
			return;
		}
		let lineNumber = this.mouseDownInfo.lineNumber;
		let iconClicked = this.mouseDownInfo.iconClicked;

		let range = e.target.range;
		if (!range || range.startLineNumber !== lineNumber) {
			return;
		}

		if (iconClicked) {
			if (e.target.type !== MouseTargetType.GUTTER_LINE_DECORATIONS) {
				return;
			}
		} else {
			let model = this.editor.getModel();
			if (range.startColumn !== model.getLineMaxColumn(lineNumber)) {
				return;
			}
		}

		this.getFoldingModel().then(foldingModel => {
			if (foldingModel) {
				let region = foldingModel.getRegionAtLine(lineNumber);
				if (region && region.startLineNumber === lineNumber) {
					let isCollapsed = region.isCollapsed;
					if (iconClicked || isCollapsed) {
						let toToggle = [region];
						if (e.event.middleButton || e.event.shiftKey) {
							toToggle.push(...foldingModel.getRegionsInside(region, r => r.isCollapsed === isCollapsed));
						}
						foldingModel.toggleCollapseState(toToggle);
						this.reveal({ lineNumber, column: 1 });
					}
				}
			}
		});
	}

	public reveal(position: IPosition): void {
		this.editor.revealPositionInCenterIfOutsideViewport(position, ScrollType.Smooth);
	}
}

abstract class FoldingAction<T> extends EditorAction {

	abstract invoke(foldingController: FoldingController, foldingModel: FoldingModel, editor: ICodeEditor, args: T): void;

	public runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, args: T): void | TPromise<void> {
		let foldingController = FoldingController.get(editor);
		if (!foldingController) {
			return;
		}
		let foldingModelPromise = foldingController.getFoldingModel();
		if (foldingModelPromise) {
			this.reportTelemetry(accessor, editor);
			return foldingModelPromise.then(foldingModel => {
				if (foldingModel) {
					this.invoke(foldingController, foldingModel, editor, args);
					foldingController.reveal(editor.getSelection().getStartPosition());
				}
			});
		}
	}

	protected getSelectedLines(editor: ICodeEditor) {
		let selections = editor.getSelections();
		return selections ? selections.map(s => s.startLineNumber) : [];
	}

	protected getLineNumbers(args: FoldingArguments, editor: ICodeEditor) {
		if (args && args.selectionLines) {
			return args.selectionLines.map(l => l + 1); // to 0-bases line numbers
		}
		return this.getSelectedLines(editor);
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
	}
}

interface FoldingArguments {
	levels?: number;
	direction?: 'up' | 'down';
	selectionLines?: number[];
}

function foldingArgumentsConstraint(args: any) {
	if (!types.isUndefined(args)) {
		if (!types.isObject(args)) {
			return false;
		}
		const foldingArgs: FoldingArguments = args;
		if (!types.isUndefined(foldingArgs.levels) && !types.isNumber(foldingArgs.levels)) {
			return false;
		}
		if (!types.isUndefined(foldingArgs.direction) && !types.isString(foldingArgs.direction)) {
			return false;
		}
		if (!types.isUndefined(foldingArgs.selectionLines) && (!types.isArray(foldingArgs.selectionLines) || !foldingArgs.selectionLines.every(types.isNumber))) {
			return false;
		}
	}
	return true;
}

class UnfoldAction extends FoldingAction<FoldingArguments> {

	constructor() {
		super({
			id: 'editor.unfold',
			label: nls.localize('unfoldAction.label', "Unfold"),
			alias: 'Unfold',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_CLOSE_SQUARE_BRACKET,
				mac: {
					primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.US_CLOSE_SQUARE_BRACKET
				}
			},
			description: {
				description: 'Unfold the content in the editor',
				args: [
					{
						name: 'Unfold editor argument',
						description: `Property-value pairs that can be passed through this argument:
						* 'levels': Number of levels to unfold. If not set, defaults to 1.
						* 'direction': If 'up', unfold given number of levels up otherwise unfolds down
						* 'selectionLines': The start lines (0-based) of the editor selections to apply the unfold action to. If not set, the active selection(s) will be used.
						`,
						constraint: foldingArgumentsConstraint
					}
				]
			}
		});
	}

	invoke(foldingController: FoldingController, foldingModel: FoldingModel, editor: ICodeEditor, args: FoldingArguments): void {
		let levels = args && args.levels || 1;
		let lineNumbers = this.getLineNumbers(args, editor);
		if (args && args.direction === 'up') {
			setCollapseStateLevelsUp(foldingModel, false, levels, lineNumbers);
		} else {
			setCollapseStateLevelsDown(foldingModel, false, levels, lineNumbers);
		}
	}
}

class UnFoldRecursivelyAction extends FoldingAction<void> {

	constructor() {
		super({
			id: 'editor.unfoldRecursively',
			label: nls.localize('unFoldRecursivelyAction.label', "Unfold Recursively"),
			alias: 'Unfold Recursively',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.US_CLOSE_SQUARE_BRACKET)
			}
		});
	}

	invoke(foldingController: FoldingController, foldingModel: FoldingModel, editor: ICodeEditor, args: any): void {
		setCollapseStateLevelsDown(foldingModel, false, Number.MAX_VALUE, this.getSelectedLines(editor));
	}
}

class FoldAction extends FoldingAction<FoldingArguments> {

	constructor() {
		super({
			id: 'editor.fold',
			label: nls.localize('foldAction.label', "Fold"),
			alias: 'Fold',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_OPEN_SQUARE_BRACKET,
				mac: {
					primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.US_OPEN_SQUARE_BRACKET
				}
			},
			description: {
				description: 'Fold the content in the editor',
				args: [
					{
						name: 'Fold editor argument',
						description: `Property-value pairs that can be passed through this argument:
							* 'levels': Number of levels to fold. Defaults to 1
							* 'direction': If 'up', folds given number of levels up otherwise folds down
							* 'selectionLines': The start lines (0-based) of the editor selections to apply the fold action to. If not set, the active selection(s) will be used.
						`,
						constraint: foldingArgumentsConstraint
					}
				]
			}
		});
	}

	invoke(foldingController: FoldingController, foldingModel: FoldingModel, editor: ICodeEditor, args: FoldingArguments): void {
		let levels = args && args.levels || 1;
		let lineNumbers = this.getLineNumbers(args, editor);
		if (args && args.direction === 'up') {
			setCollapseStateLevelsUp(foldingModel, true, levels, lineNumbers);
		} else {
			setCollapseStateLevelsDown(foldingModel, true, levels, lineNumbers);
		}
	}
}

class FoldRecursivelyAction extends FoldingAction<void> {

	constructor() {
		super({
			id: 'editor.foldRecursively',
			label: nls.localize('foldRecursivelyAction.label', "Fold Recursively"),
			alias: 'Fold Recursively',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.US_OPEN_SQUARE_BRACKET)
			}
		});
	}

	invoke(foldingController: FoldingController, foldingModel: FoldingModel, editor: ICodeEditor): void {
		let selectedLines = this.getSelectedLines(editor);
		setCollapseStateLevelsDown(foldingModel, true, Number.MAX_VALUE, selectedLines);
	}
}

class FoldAllBlockCommentsAction extends FoldingAction<void> {

	constructor() {
		super({
			id: 'editor.foldAllBlockComments',
			label: nls.localize('foldAllBlockComments.label', "Fold All Block Comments"),
			alias: 'Fold All Block Comments',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.US_SLASH)
			}
		});
	}

	invoke(foldingController: FoldingController, foldingModel: FoldingModel, editor: ICodeEditor): void {
		if (foldingModel.regions.hasTypes()) {
			setCollapseStateForType(foldingModel, FoldingRangeType.Comment, true);
		} else {
			let comments = LanguageConfigurationRegistry.getComments(editor.getModel().getLanguageIdentifier().id);
			if (comments && comments.blockCommentStartToken) {
				let regExp = new RegExp('^\\s*' + escapeRegExpCharacters(comments.blockCommentStartToken));
				setCollapseStateForMatchingLines(foldingModel, regExp, true);
			}
		}
	}
}

class FoldAllRegionsAction extends FoldingAction<void> {

	constructor() {
		super({
			id: 'editor.foldAllMarkerRegions',
			label: nls.localize('foldAllMarkerRegions.label', "Fold All Regions"),
			alias: 'Fold All Regions',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_8)
			}
		});
	}

	invoke(foldingController: FoldingController, foldingModel: FoldingModel, editor: ICodeEditor): void {
		if (foldingModel.regions.hasTypes()) {
			setCollapseStateForType(foldingModel, FoldingRangeType.Region, true);
		} else {
			let foldingRules = LanguageConfigurationRegistry.getFoldingRules(editor.getModel().getLanguageIdentifier().id);
			if (foldingRules && foldingRules.markers && foldingRules.markers.start) {
				let regExp = new RegExp(foldingRules.markers.start);
				setCollapseStateForMatchingLines(foldingModel, regExp, true);
			}
		}
	}
}

class UnfoldAllRegionsAction extends FoldingAction<void> {

	constructor() {
		super({
			id: 'editor.unfoldAllMarkerRegions',
			label: nls.localize('unfoldAllMarkerRegions.label', "Unfold All Regions"),
			alias: 'Unfold All Regions',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_9)
			}
		});
	}

	invoke(foldingController: FoldingController, foldingModel: FoldingModel, editor: ICodeEditor): void {
		if (foldingModel.regions.hasTypes()) {
			setCollapseStateForType(foldingModel, FoldingRangeType.Region, false);
		} else {
			let foldingRules = LanguageConfigurationRegistry.getFoldingRules(editor.getModel().getLanguageIdentifier().id);
			if (foldingRules && foldingRules.markers && foldingRules.markers.start) {
				let regExp = new RegExp(foldingRules.markers.start);
				setCollapseStateForMatchingLines(foldingModel, regExp, false);
			}
		}
	}
}

class FoldAllAction extends FoldingAction<void> {

	constructor() {
		super({
			id: 'editor.foldAll',
			label: nls.localize('foldAllAction.label', "Fold All"),
			alias: 'Fold All',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_0)
			}
		});
	}

	invoke(foldingController: FoldingController, foldingModel: FoldingModel, editor: ICodeEditor): void {
		setCollapseStateLevelsDown(foldingModel, true);
	}
}

class UnfoldAllAction extends FoldingAction<void> {

	constructor() {
		super({
			id: 'editor.unfoldAll',
			label: nls.localize('unfoldAllAction.label', "Unfold All"),
			alias: 'Unfold All',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_J)
			}
		});
	}

	invoke(foldingController: FoldingController, foldingModel: FoldingModel, editor: ICodeEditor): void {
		setCollapseStateLevelsDown(foldingModel, false);
	}
}

class FoldLevelAction extends FoldingAction<void> {
	private static readonly ID_PREFIX = 'editor.foldLevel';
	public static readonly ID = (level: number) => FoldLevelAction.ID_PREFIX + level;

	private getFoldingLevel() {
		return parseInt(this.id.substr(FoldLevelAction.ID_PREFIX.length));
	}

	invoke(foldingController: FoldingController, foldingModel: FoldingModel, editor: ICodeEditor): void {
		setCollapseStateAtLevel(foldingModel, this.getFoldingLevel(), true, this.getSelectedLines(editor));
	}
}

registerEditorContribution(FoldingController);
registerEditorAction(UnfoldAction);
registerEditorAction(UnFoldRecursivelyAction);
registerEditorAction(FoldAction);
registerEditorAction(FoldRecursivelyAction);
registerEditorAction(FoldAllAction);
registerEditorAction(UnfoldAllAction);
registerEditorAction(FoldAllBlockCommentsAction);
registerEditorAction(FoldAllRegionsAction);
registerEditorAction(UnfoldAllRegionsAction);

for (let i = 1; i <= 7; i++) {
	registerInstantiatedEditorAction(
		new FoldLevelAction({
			id: FoldLevelAction.ID(i),
			label: nls.localize('foldLevelAction.label', "Fold Level {0}", i),
			alias: `Fold Level ${i}`,
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | (KeyCode.KEY_0 + i))
			}
		})
	);
}

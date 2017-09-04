/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/// <amd-dependency path="vs/css!./folding" />

'use strict';

import * as nls from 'vs/nls';
import * as types from 'vs/base/common/types';
import * as dom from 'vs/base/browser/dom';
import { RunOnceScheduler } from 'vs/base/common/async';
import { KeyCode, KeyMod, KeyChord } from 'vs/base/common/keyCodes';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { Range } from 'vs/editor/common/core/range';
import { editorAction, ServicesAccessor, EditorAction, CommonEditorRegistry } from 'vs/editor/common/editorCommonExtensions';
import { ICodeEditor, IEditorMouseEvent, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';
import { CollapsibleRegion, getCollapsibleRegionsToFoldAtLine, getCollapsibleRegionsToUnfoldAtLine, doesLineBelongsToCollapsibleRegion, IFoldingRange } from 'vs/editor/contrib/folding/common/foldingModel';
import { computeRanges, limitByIndent } from 'vs/editor/contrib/folding/common/indentFoldStrategy';
import { IFoldingController, ID } from 'vs/editor/contrib/folding/common/folding';
import { Selection } from 'vs/editor/common/core/selection';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { IConfigurationChangedEvent } from 'vs/editor/common/config/editorOptions';

@editorContribution
export class FoldingController implements IFoldingController {

	static MAX_FOLDING_REGIONS = 5000;

	public static get(editor: editorCommon.ICommonCodeEditor): FoldingController {
		return editor.getContribution<FoldingController>(ID);
	}

	private editor: ICodeEditor;
	private _isEnabled: boolean;
	private _showFoldingControls: 'always' | 'mouseover';
	private globalToDispose: IDisposable[];

	private computeToken: number;
	private cursorChangedScheduler: RunOnceScheduler;
	private contentChangedScheduler: RunOnceScheduler;
	private localToDispose: IDisposable[];

	private decorations: CollapsibleRegion[];

	constructor(editor: ICodeEditor) {
		this.editor = editor;
		this._isEnabled = this.editor.getConfiguration().contribInfo.folding;
		this._showFoldingControls = this.editor.getConfiguration().contribInfo.showFoldingControls;

		this.globalToDispose = [];
		this.localToDispose = [];
		this.decorations = [];
		this.computeToken = 0;

		this.globalToDispose.push(this.editor.onDidChangeModel(() => this.onModelChanged()));
		this.globalToDispose.push(this.editor.onDidChangeConfiguration((e: IConfigurationChangedEvent) => {
			let oldIsEnabled = this._isEnabled;
			this._isEnabled = this.editor.getConfiguration().contribInfo.folding;
			if (oldIsEnabled !== this._isEnabled) {
				this.onModelChanged();
			}
			let oldShowFoldingControls = this._showFoldingControls;
			this._showFoldingControls = this.editor.getConfiguration().contribInfo.showFoldingControls;
			if (oldShowFoldingControls !== this._showFoldingControls) {
				this.updateHideFoldIconClass();
			}
		}));

		this.onModelChanged();
	}

	public getId(): string {
		return ID;
	}

	public dispose(): void {
		this.cleanState();
		this.globalToDispose = dispose(this.globalToDispose);
	}

	private updateHideFoldIconClass(): void {
		let domNode = this.editor.getDomNode();
		if (domNode) {
			dom.toggleClass(domNode, 'alwaysShowFoldIcons', this._showFoldingControls === 'always');
		}
	}

	/**
	 * Store view state.
	 */
	public saveViewState(): any {
		let model = this.editor.getModel();
		if (!model) {
			return {};
		}
		var collapsedRegions: IFoldingRange[] = [];
		this.decorations.forEach(d => {
			if (d.isCollapsed) {
				var range = d.getDecorationRange(model);
				if (range) {
					collapsedRegions.push({ startLineNumber: range.startLineNumber, endLineNumber: range.endLineNumber, indent: d.indent, isCollapsed: true });
				}
			}
		});
		return { collapsedRegions: collapsedRegions, lineCount: model.getLineCount() };
	}

	/**
	 * Restore view state.
	 */
	public restoreViewState(state: any): void {
		let model = this.editor.getModel();
		if (!model) {
			return;
		}
		if (!this._isEnabled) {
			return;
		}
		if (!state || !Array.isArray(state.collapsedRegions) || state.collapsedRegions.length === 0 || state.lineCount !== model.getLineCount()) {
			return;
		}
		let newFolded = <IFoldingRange[]>state.collapsedRegions;

		if (this.decorations.length > 0) {
			let hasChanges = false;
			let i = 0;
			this.editor.changeDecorations(changeAccessor => {
				this.decorations.forEach(d => {
					if (i === newFolded.length || d.startLineNumber < newFolded[i].startLineNumber) {
						if (d.isCollapsed) {
							d.setCollapsed(false, changeAccessor);
							hasChanges = true;
						}
					} else if (d.startLineNumber === newFolded[i].startLineNumber) {
						if (!d.isCollapsed) {
							d.setCollapsed(true, changeAccessor);
							hasChanges = true;
						}
						i++;
					} else {
						return; // folding regions doesn't match, don't try to restore
					}
				});
			});
			if (hasChanges) {
				this.updateHiddenAreas(void 0);
			}
		}
	}

	private cleanState(): void {
		this.localToDispose = dispose(this.localToDispose);
	}

	private applyRegions(regions: IFoldingRange[]) {
		let model = this.editor.getModel();
		if (!model) {
			return;
		}
		let updateHiddenRegions = false;
		regions = limitByIndent(regions, FoldingController.MAX_FOLDING_REGIONS).sort((r1, r2) => r1.startLineNumber - r2.startLineNumber);

		this.editor.changeDecorations(changeAccessor => {

			let newDecorations: CollapsibleRegion[] = [];

			let k = 0, i = 0;
			while (i < this.decorations.length && k < regions.length) {
				let dec = this.decorations[i];
				let decRange = dec.getDecorationRange(model);
				if (!decRange) {
					updateHiddenRegions = updateHiddenRegions || dec.isCollapsed;
					dec.dispose(changeAccessor);
					i++;
				} else {
					while (k < regions.length && decRange.startLineNumber > regions[k].startLineNumber) {
						let region = regions[k];
						updateHiddenRegions = updateHiddenRegions || region.isCollapsed;
						newDecorations.push(new CollapsibleRegion(region, model, changeAccessor));
						k++;
					}
					if (k < regions.length) {
						let currRange = regions[k];
						if (decRange.startLineNumber < currRange.startLineNumber) {
							updateHiddenRegions = updateHiddenRegions || dec.isCollapsed;
							dec.dispose(changeAccessor);
							i++;
						} else if (decRange.startLineNumber === currRange.startLineNumber) {
							if (dec.isCollapsed && (dec.startLineNumber !== currRange.startLineNumber || dec.endLineNumber !== currRange.endLineNumber)) {
								updateHiddenRegions = true;
							}
							currRange.isCollapsed = dec.isCollapsed; // preserve collapse state
							dec.update(currRange, model, changeAccessor);
							newDecorations.push(dec);
							i++;
							k++;
						}
					}
				}
			}
			while (i < this.decorations.length) {
				let dec = this.decorations[i];
				updateHiddenRegions = updateHiddenRegions || dec.isCollapsed;
				dec.dispose(changeAccessor);
				i++;
			}
			while (k < regions.length) {
				let region = regions[k];
				updateHiddenRegions = updateHiddenRegions || region.isCollapsed;
				newDecorations.push(new CollapsibleRegion(region, model, changeAccessor));
				k++;
			}
			this.decorations = newDecorations;
		});
		if (updateHiddenRegions) {
			this.updateHiddenAreas();
		}

	}

	private onModelChanged(): void {
		this.cleanState();
		this.updateHideFoldIconClass();

		let model = this.editor.getModel();
		if (!this._isEnabled || !model) {
			return;
		}

		this.computeAndApplyCollapsibleRegions();
		this.contentChangedScheduler = new RunOnceScheduler(() => this.computeAndApplyCollapsibleRegions(), 200);
		this.cursorChangedScheduler = new RunOnceScheduler(() => this.revealCursor(), 200);
		this.localToDispose.push(this.contentChangedScheduler);
		this.localToDispose.push(this.cursorChangedScheduler);

		this.localToDispose.push(this.editor.onDidChangeModelContent(e => this.contentChangedScheduler.schedule()));
		this.localToDispose.push(this.editor.onDidChangeCursorPosition((e) => {

			if (!this._isEnabled) {
				// Early exit if nothing needs to be done!
				// Leave some form of early exit check here if you wish to continue being a cursor position change listener ;)
				return;
			}

			this.cursorChangedScheduler.schedule();
		}));
		this.localToDispose.push(this.editor.onMouseDown(e => this.onEditorMouseDown(e)));
		this.localToDispose.push(this.editor.onMouseUp(e => this.onEditorMouseUp(e)));

		this.localToDispose.push({ dispose: () => this.disposeDecorations() });
	}

	private computeAndApplyCollapsibleRegions(): void {
		let model = this.editor.getModel();
		this.applyRegions(model ? computeRanges(model) : []);
	}

	private disposeDecorations() {
		this.editor.changeDecorations(changeAccessor => {
			this.decorations.forEach(dec => dec.dispose(changeAccessor));
		});
		this.decorations = [];
		this.editor.setHiddenAreas([]);
	}

	private revealCursor() {
		let model = this.editor.getModel();
		if (!model) {
			return;
		}
		let hasChanges = false;
		let selections = this.editor.getSelections();

		this.editor.changeDecorations(changeAccessor => {
			return this.decorations.forEach(dec => {
				if (dec.isCollapsed) {
					let decRange = dec.getDecorationRange(model);
					if (decRange) {
						for (let selection of selections) {
							// reveal if cursor in in one of the collapsed line (not the first)
							if (decRange.startLineNumber < selection.selectionStartLineNumber && selection.selectionStartLineNumber <= decRange.endLineNumber) {
								dec.setCollapsed(false, changeAccessor);
								hasChanges = true;
								break;
							}
						}
					}
				}
			});
		});
		if (hasChanges) {
			this.updateHiddenAreas(this.editor.getPosition().lineNumber);
		}
	}

	private mouseDownInfo: { lineNumber: number, iconClicked: boolean };

	private onEditorMouseDown(e: IEditorMouseEvent): void {
		this.mouseDownInfo = null;

		if (this.decorations.length === 0) {
			return;
		}
		let range = e.target.range;
		if (!range) {
			return;
		}
		if (!e.event.leftButton) {
			return;
		}

		let model = this.editor.getModel();

		let iconClicked = false;
		switch (e.target.type) {
			case MouseTargetType.GUTTER_LINE_DECORATIONS:
				iconClicked = true;
				break;
			case MouseTargetType.CONTENT_EMPTY:
			case MouseTargetType.CONTENT_TEXT:
				if (range.startColumn === model.getLineMaxColumn(range.startLineNumber)) {
					break;
				}
				return;
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

		let model = this.editor.getModel();

		if (iconClicked) {
			if (e.target.type !== MouseTargetType.GUTTER_LINE_DECORATIONS) {
				return;
			}
		} else {
			if (range.startColumn !== model.getLineMaxColumn(lineNumber)) {
				return;
			}
		}

		this.editor.changeDecorations(changeAccessor => {
			for (let i = 0; i < this.decorations.length; i++) {
				let dec = this.decorations[i];
				let decRange = dec.getDecorationRange(model);
				if (decRange && decRange.startLineNumber === lineNumber) {
					if (iconClicked || dec.isCollapsed) {
						dec.setCollapsed(!dec.isCollapsed, changeAccessor);
						this.updateHiddenAreas(lineNumber);
					}
					return;
				}
			}
		});
	}

	private updateHiddenAreas(focusLine?: number): void {
		let model = this.editor.getModel();
		var selections: Selection[] = this.editor.getSelections();
		var updateSelections = false;
		let hiddenAreas: Range[] = [];
		this.decorations.filter(dec => dec.isCollapsed).forEach(dec => {
			let decRange = dec.getDecorationRange(model);
			if (!decRange) {
				return;
			}
			let isLineHidden = line => line > decRange.startLineNumber && line <= decRange.endLineNumber;
			hiddenAreas.push(new Range(decRange.startLineNumber + 1, 1, decRange.endLineNumber, 1));
			selections.forEach((selection, i) => {
				if (isLineHidden(selection.getStartPosition().lineNumber)) {
					selections[i] = selection = selection.setStartPosition(decRange.startLineNumber, model.getLineMaxColumn(decRange.startLineNumber));
					updateSelections = true;
				}
				if (isLineHidden(selection.getEndPosition().lineNumber)) {
					selections[i] = selection.setEndPosition(decRange.startLineNumber, model.getLineMaxColumn(decRange.startLineNumber));
					updateSelections = true;
				}
			});
		});
		if (updateSelections) {
			this.editor.setSelections(selections);
		}
		this.editor.setHiddenAreas(hiddenAreas);
		if (focusLine) {
			this.editor.revealPositionInCenterIfOutsideViewport({ lineNumber: focusLine, column: 1 }, editorCommon.ScrollType.Smooth);
		}
	}

	public unfold(levels: number): void {
		let model = this.editor.getModel();
		let hasChanges = false;
		let selections = this.editor.getSelections();
		let selectionsHasChanged = false;
		selections.forEach((selection, index) => {
			let toUnfold: CollapsibleRegion[] = getCollapsibleRegionsToUnfoldAtLine(this.decorations, model, selection.startLineNumber, levels);
			if (toUnfold.length > 0) {
				toUnfold.forEach((collapsibleRegion, index) => {
					this.editor.changeDecorations(changeAccessor => {
						collapsibleRegion.setCollapsed(false, changeAccessor);
						hasChanges = true;
					});
				});
				if (!doesLineBelongsToCollapsibleRegion(toUnfold[0].foldingRange, selection.startLineNumber)) {
					let lineNumber = toUnfold[0].startLineNumber, column = model.getLineMaxColumn(toUnfold[0].startLineNumber);
					selections[index] = selection.setEndPosition(lineNumber, column).setStartPosition(lineNumber, column);
					selectionsHasChanged = true;
				}
			}
		});
		if (selectionsHasChanged) {
			this.editor.setSelections(selections);
		}
		if (hasChanges) {
			this.updateHiddenAreas(selections[0].startLineNumber);
		}
	}

	public fold(levels: number, up: boolean): void {
		let hasChanges = false;
		let selections = this.editor.getSelections();
		selections.forEach(selection => {
			let lineNumber = selection.startLineNumber;
			let toFold: CollapsibleRegion[] = getCollapsibleRegionsToFoldAtLine(this.decorations, this.editor.getModel(), lineNumber, levels, up);
			toFold.forEach(collapsibleRegion => this.editor.changeDecorations(changeAccessor => {
				collapsibleRegion.setCollapsed(true, changeAccessor);
				hasChanges = true;
			}));
		});
		if (hasChanges) {
			this.updateHiddenAreas(selections[0].startLineNumber);
		}
	}

	public foldUnfoldRecursively(isFold: boolean): void {
		let hasChanges = false;
		let model = this.editor.getModel();
		let selections = this.editor.getSelections();
		selections.forEach(selection => {
			let lineNumber = selection.startLineNumber;
			let endLineNumber: number;
			let decToFoldUnfold: CollapsibleRegion[] = [];
			for (let i = 0, len = this.decorations.length; i < len; i++) {
				let dec = this.decorations[i];
				let decRange = dec.getDecorationRange(model);
				if (!decRange) {
					continue;
				}
				if (decRange.startLineNumber >= lineNumber && (decRange.endLineNumber <= endLineNumber || typeof endLineNumber === 'undefined')) {
					//Protect against cursor not being in decoration and lower decoration folding/unfolding
					if (decRange.startLineNumber !== lineNumber && typeof endLineNumber === 'undefined') {
						return;
					}
					endLineNumber = endLineNumber || decRange.endLineNumber;
					decToFoldUnfold.push(dec);
				}
			};
			if (decToFoldUnfold.length > 0) {
				decToFoldUnfold.forEach(dec => {
					this.editor.changeDecorations(changeAccessor => {
						dec.setCollapsed(isFold, changeAccessor);
						hasChanges = true;
					});
				});
			}
		});
		if (hasChanges) {
			this.updateHiddenAreas(selections[0].startLineNumber);
		}
	}

	public foldAll(): void {
		this.changeAll(true);
	}

	public unfoldAll(): void {
		this.changeAll(false);
	}

	private changeAll(collapse: boolean): void {
		if (this.decorations.length > 0) {
			let hasChanges = true;
			this.editor.changeDecorations(changeAccessor => {
				this.decorations.forEach(d => {
					if (collapse !== d.isCollapsed) {
						d.setCollapsed(collapse, changeAccessor);
						hasChanges = true;
					}
				});
			});
			if (hasChanges) {
				this.updateHiddenAreas(this.editor.getPosition().lineNumber);
			}
		}
	}

	public foldLevel(foldLevel: number, selectedLineNumbers: number[]): void {
		let model = this.editor.getModel();
		let foldingRegionStack: Range[] = [model.getFullModelRange()]; // sentinel

		let hasChanges = false;
		this.editor.changeDecorations(changeAccessor => {
			this.decorations.forEach(dec => {
				let decRange = dec.getDecorationRange(model);
				if (decRange) {
					while (!Range.containsRange(foldingRegionStack[foldingRegionStack.length - 1], decRange)) {
						foldingRegionStack.pop();
					}
					foldingRegionStack.push(decRange);
					if (foldingRegionStack.length === foldLevel + 1 && !dec.isCollapsed && !selectedLineNumbers.some(lineNumber => decRange.startLineNumber < lineNumber && lineNumber <= decRange.endLineNumber)) {
						dec.setCollapsed(true, changeAccessor);
						hasChanges = true;
					}
				}
			});
		});
		if (hasChanges) {
			this.updateHiddenAreas(selectedLineNumbers[0]);
		}
	}
}

abstract class FoldingAction<T> extends EditorAction {

	abstract invoke(foldingController: FoldingController, editor: editorCommon.ICommonCodeEditor, args: T): void;

	public runEditorCommand(accessor: ServicesAccessor, editor: editorCommon.ICommonCodeEditor, args: T): void | TPromise<void> {
		let foldingController = FoldingController.get(editor);
		if (!foldingController) {
			return;
		}
		this.reportTelemetry(accessor, editor);
		this.invoke(foldingController, editor, args);
	}

	public run(accessor: ServicesAccessor, editor: editorCommon.ICommonCodeEditor): void {

	}
}

interface FoldingArguments {
	levels?: number;
	direction?: 'up' | 'down';
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
	}
	return true;
}

@editorAction
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
							* 'level': Number of levels to unfold
						`,
						constraint: foldingArgumentsConstraint
					}
				]
			}
		});
	}

	invoke(foldingController: FoldingController, editor: editorCommon.ICommonCodeEditor, args: FoldingArguments): void {
		foldingController.unfold(args ? args.levels || 1 : 1);
	}
}

@editorAction
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

	invoke(foldingController: FoldingController, editor: editorCommon.ICommonCodeEditor, args: any): void {
		foldingController.foldUnfoldRecursively(false);
	}
}

@editorAction
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
							* 'levels': Number of levels to fold
							* 'up': If 'true', folds given number of levels up otherwise folds down
						`,
						constraint: foldingArgumentsConstraint
					}
				]
			}
		});
	}

	invoke(foldingController: FoldingController, editor: editorCommon.ICommonCodeEditor, args: FoldingArguments): void {
		args = args ? args : { levels: 1, direction: 'up' };
		foldingController.fold(args.levels || 1, args.direction === 'up');
	}
}

@editorAction
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

	invoke(foldingController: FoldingController, editor: editorCommon.ICommonCodeEditor): void {
		foldingController.foldUnfoldRecursively(true);
	}
}

@editorAction
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

	invoke(foldingController: FoldingController, editor: editorCommon.ICommonCodeEditor): void {
		foldingController.foldAll();
	}
}

@editorAction
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

	invoke(foldingController: FoldingController, editor: editorCommon.ICommonCodeEditor): void {
		foldingController.unfoldAll();
	}
}

class FoldLevelAction extends FoldingAction<void> {
	private static ID_PREFIX = 'editor.foldLevel';
	public static ID = (level: number) => FoldLevelAction.ID_PREFIX + level;

	private getFoldingLevel() {
		return parseInt(this.id.substr(FoldLevelAction.ID_PREFIX.length));
	}

	private getSelectedLines(editor: editorCommon.ICommonCodeEditor) {
		return editor.getSelections().map(s => s.startLineNumber);
	}

	invoke(foldingController: FoldingController, editor: editorCommon.ICommonCodeEditor): void {
		foldingController.foldLevel(this.getFoldingLevel(), this.getSelectedLines(editor));
	}
}

for (let i = 1; i <= 9; i++) {
	CommonEditorRegistry.registerEditorAction(
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
};

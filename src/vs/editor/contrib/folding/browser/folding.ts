/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/// <amd-dependency path="vs/css!./folding" />

'use strict';

import * as nls from 'vs/nls';
import {RunOnceScheduler} from 'vs/base/common/async';
import {KeyCode, KeyMod} from 'vs/base/common/keyCodes';
import {IDisposable, disposeAll} from 'vs/base/common/lifecycle';
import {TPromise} from 'vs/base/common/winjs.base';
import {EditorAction} from 'vs/editor/common/editorAction';
import {Behaviour} from 'vs/editor/common/editorActionEnablement';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {Range} from 'vs/editor/common/core/range';
import {CommonEditorRegistry, ContextKey, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {ICodeEditor, IEditorMouseEvent} from 'vs/editor/browser/editorBrowser';
import {EditorBrowserRegistry} from 'vs/editor/browser/editorBrowserExtensions';
import {IFoldingRange} from 'vs/editor/contrib/folding/common/foldingRange';
import {computeRanges, limitByIndent} from 'vs/editor/contrib/folding/common/indentFoldStrategy';

class CollapsibleRegion {

	private decorationIds: string[];
	private _isCollapsed: boolean;
	private _indent: number;

	private _lastRange: IFoldingRange;

	public constructor(range:IFoldingRange, model:editorCommon.IModel, changeAccessor:editorCommon.IModelDecorationsChangeAccessor) {
		this.decorationIds = [];
		this.update(range, model, changeAccessor);
	}

	public get isCollapsed(): boolean {
		return this._isCollapsed;
	}

	public get indent(): number {
		return this._indent;
	}

	public get startLineNumber(): number {
		return this._lastRange ? this._lastRange.startLineNumber : void 0;
	}

	public get endLineNumber(): number {
		return this._lastRange ? this._lastRange.endLineNumber : void 0;
	}

	public setCollapsed(isCollaped: boolean, changeAccessor:editorCommon.IModelDecorationsChangeAccessor): void {
		this._isCollapsed = isCollaped;
		if (this.decorationIds.length > 0) {
			changeAccessor.changeDecorationOptions(this.decorationIds[0], this.getVisualDecorationOptions());
		}
	}

	public getDecorationRange(model:editorCommon.IModel): editorCommon.IEditorRange {
		if (this.decorationIds.length > 0) {
			return model.getDecorationRange(this.decorationIds[1]);
		}
		return null;
	}

	private getVisualDecorationOptions(): editorCommon.IModelDecorationOptions {
		if (this._isCollapsed) {
			return {
				stickiness: editorCommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
				inlineClassName: 'inline-folded',
				linesDecorationsClassName: 'folding collapsed'
			};
		} else {
			return {
				stickiness: editorCommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
				linesDecorationsClassName: 'folding'
			};
		}
	}

	private getRangeDecorationOptions(): editorCommon.IModelDecorationOptions {
		return {
			stickiness: editorCommon.TrackedRangeStickiness.GrowsOnlyWhenTypingBefore
		};
	}

	public update(newRange:IFoldingRange, model:editorCommon.IModel, changeAccessor:editorCommon.IModelDecorationsChangeAccessor): void {
		this._lastRange = newRange;
		this._isCollapsed = !!newRange.isCollapsed;
		this._indent = newRange.indent;

		let newDecorations : editorCommon.IModelDeltaDecoration[] = [];

		let maxColumn = model.getLineMaxColumn(newRange.startLineNumber);
		let visualRng = {
			startLineNumber: newRange.startLineNumber,
			startColumn: maxColumn - 1,
			endLineNumber: newRange.startLineNumber,
			endColumn: maxColumn
		};
		newDecorations.push({ range: visualRng, options: this.getVisualDecorationOptions() });

		let colRng = {
			startLineNumber: newRange.startLineNumber,
			startColumn: 1,
			endLineNumber: newRange.endLineNumber,
			endColumn: model.getLineMaxColumn(newRange.endLineNumber)
		};
		newDecorations.push({ range: colRng, options: this.getRangeDecorationOptions() });

		this.decorationIds = changeAccessor.deltaDecorations(this.decorationIds, newDecorations);
	}


	public dispose(changeAccessor:editorCommon.IModelDecorationsChangeAccessor): void {
		this._lastRange = null;
		this.decorationIds = changeAccessor.deltaDecorations(this.decorationIds, []);
	}

	public toString(): string {
		let str = this.isCollapsed ? 'collapsed ': 'expanded ';
		if (this._lastRange) {
			str += (this._lastRange.startLineNumber + '/' + this._lastRange.endLineNumber);
		} else {
			str += 'no range';
		}

		return  str;
	}
}

export class FoldingController implements editorCommon.IEditorContribution {

	static ID = 'editor.contrib.folding';
	static MAX_FOLDING_REGIONS = 5000;

	static getFoldingController(editor:editorCommon.ICommonCodeEditor): FoldingController {
		return <FoldingController>editor.getContribution(FoldingController.ID);
	}

	private editor: ICodeEditor;
	private globalToDispose: IDisposable[];

	private computeToken: number;
	private cursorChangedScheduler: RunOnceScheduler;
	private contentChangedScheduler: RunOnceScheduler;
	private localToDispose: IDisposable[];

	private decorations: CollapsibleRegion[];

	constructor(editor:ICodeEditor) {
		this.editor = editor;

		this.globalToDispose = [];
		this.localToDispose = [];
		this.decorations = [];
		this.computeToken = 0;

		this.globalToDispose.push(this.editor.addListener2(editorCommon.EventType.ModelChanged, () => this.onModelChanged()));
		this.globalToDispose.push(this.editor.addListener2(editorCommon.EventType.ConfigurationChanged, (e: editorCommon.IConfigurationChangedEvent) => {
			if (e.folding) {
				this.onModelChanged();
			}
		}));

		this.onModelChanged();
	}

	public getId(): string {
		return FoldingController.ID;
	}

	public dispose(): void {
		this.cleanState();
		this.globalToDispose = disposeAll(this.globalToDispose);
	}

	/**
	 * Store view state.
	 */
	public saveViewState(): any {
		let model = this.editor.getModel();
		if (!model) {
			return {};
		}
		var collapsedRegions : IFoldingRange[] = [];
		this.decorations.forEach(d => {
			if (d.isCollapsed) {
				var range = d.getDecorationRange(model);
				if (range) {
					collapsedRegions.push({ startLineNumber: range.startLineNumber, endLineNumber: range.endLineNumber, indent: d.indent, isCollapsed: true});
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
		if (!this.editor.getConfiguration().folding) {
			return;
		}
		if (!state || !Array.isArray(state.collapsedRegions) || state.collapsedRegions.length === 0 || state.lineCount !== model.getLineCount()) {
			return;
		}
		this.applyRegions(<IFoldingRange[]> state.collapsedRegions);
	}

	private cleanState(): void {
		this.localToDispose = disposeAll(this.localToDispose);
	}

	private applyRegions(regions: IFoldingRange[]) {
		let model = this.editor.getModel();
		if (!model) {
			return;
		}
		let updateHiddenRegions = false;
		regions = limitByIndent(regions, FoldingController.MAX_FOLDING_REGIONS).sort((r1, r2) => r1.startLineNumber - r2.startLineNumber);

		this.editor.changeDecorations(changeAccessor => {

			let newDecorations : CollapsibleRegion[] = [];

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
			this.updateHiddenAreas(void 0);
		}

	}

	private onModelChanged(): void {
		this.cleanState();

		let model = this.editor.getModel();
		if (!this.editor.getConfiguration().folding || !model) {
			return;
		}

		this.contentChangedScheduler = new RunOnceScheduler(() => {
			let myToken = (++this.computeToken);

			this.computeCollapsibleRegions().then(regions => {
				if (myToken !== this.computeToken) {
					return; // A new request was made in the meantime or the model was changed
				}
				this.applyRegions(regions);
			});
		}, 200);
		this.cursorChangedScheduler = new RunOnceScheduler(() => {
			this.revealCursor();
		}, 200);

		this.localToDispose.push(this.contentChangedScheduler);
		this.localToDispose.push(this.cursorChangedScheduler);
		this.localToDispose.push(this.editor.addListener2('change', () => {
			this.contentChangedScheduler.schedule();
		}));
		this.localToDispose.push({ dispose: () => {
			++this.computeToken;
			this.editor.changeDecorations(changeAccessor => {
				this.decorations.forEach(dec => dec.dispose(changeAccessor));

			});
			this.decorations = [];
			this.editor.setHiddenAreas([]);
		}});
		this.localToDispose.push(this.editor.addListener2(editorCommon.EventType.MouseDown, e => this.onEditorMouseDown(e)));
		this.localToDispose.push(this.editor.addListener2(editorCommon.EventType.MouseUp, e => this.onEditorMouseUp(e)));
		this.localToDispose.push(this.editor.addListener2(editorCommon.EventType.CursorPositionChanged, e => {
			this.cursorChangedScheduler.schedule();
		}));

		this.contentChangedScheduler.schedule();
	}

	private computeCollapsibleRegions(): TPromise<IFoldingRange[]> {
		let model = this.editor.getModel();
		if (!model) {
			return TPromise.as([]);
		}

		let tabSize = model.getOptions().tabSize;
		let ranges = computeRanges(model, tabSize);
		return TPromise.as(ranges);
	}

	private revealCursor() {
		let model = this.editor.getModel();
		if (!model) {
			return;
		}
		let hasChanges = false;
		let position = this.editor.getPosition();
		let lineNumber = position.lineNumber;
		this.editor.changeDecorations(changeAccessor => {
			return this.decorations.forEach(dec => {
				if (dec.isCollapsed) {
					let decRange = dec.getDecorationRange(model);
					// reveal if cursor in in one of the collapsed line (not the first)
					if (decRange && decRange.startLineNumber < lineNumber && lineNumber <= decRange.endLineNumber) {
						dec.setCollapsed(false, changeAccessor);
						hasChanges = true;
					}
				}
			});
		});
		if (hasChanges) {
			this.updateHiddenAreas(lineNumber);
		}
	}

	private mouseDownInfo: { lineNumber: number, iconClicked: boolean };

	private onEditorMouseDown(e: IEditorMouseEvent): void {
		this.mouseDownInfo = null;

		if (this.decorations.length === 0) {
			return;
		}
		let range = e.target.range;
		if (!range || !range.isEmpty) {
			return;
		}
		if (!e.event.leftButton) {
			return;
		}

		let model = this.editor.getModel();

		let iconClicked = false;
		switch (e.target.type) {
			case editorCommon.MouseTargetType.GUTTER_LINE_DECORATIONS:
				iconClicked = true;
				break;
			case editorCommon.MouseTargetType.CONTENT_TEXT:
				if (range.isEmpty && range.startColumn === model.getLineMaxColumn(range.startLineNumber)) {
					break;
				}
				return;
			default:
				return;
		}

		this.mouseDownInfo = { lineNumber: range.startLineNumber, iconClicked};
	}

	private onEditorMouseUp(e: IEditorMouseEvent): void {
		if (!this.mouseDownInfo) {
			return;
		}
		let lineNumber = this.mouseDownInfo.lineNumber;
		let iconClicked = this.mouseDownInfo.iconClicked;

		let range = e.target.range;
		if (!range || !range.isEmpty || range.startLineNumber !== lineNumber) {
			return;
		}

		let model = this.editor.getModel();

		if (iconClicked) {
			if (e.target.type !== editorCommon.MouseTargetType.GUTTER_LINE_DECORATIONS) {
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
				if (decRange.startLineNumber === lineNumber) {
					if (iconClicked || dec.isCollapsed) {
						dec.setCollapsed(!dec.isCollapsed, changeAccessor);
						this.updateHiddenAreas(lineNumber);
					}
					return;
				}
			}
		});
	}

	private updateHiddenAreas(focusLine: number): void {
		let model = this.editor.getModel();
		var selections : editorCommon.IEditorSelection[] = this.editor.getSelections();
		var updateSelections = false;
		let hiddenAreas: editorCommon.IRange[] = [];
		this.decorations.filter(dec => dec.isCollapsed).forEach(dec => {
			let decRange = dec.getDecorationRange(model);
			hiddenAreas.push({
				startLineNumber: decRange.startLineNumber + 1,
				startColumn: 1,
				endLineNumber: decRange.endLineNumber,
				endColumn: 1
			});
			selections.forEach((selection, i) => {
				if (Range.containsPosition(decRange, selection.getStartPosition())) {
					selections[i] = selection = selection.setStartPosition(decRange.startLineNumber, model.getLineMaxColumn(decRange.startLineNumber));
					updateSelections = true;
				}
				if (Range.containsPosition(decRange, selection.getEndPosition())) {
					selections[i] = selection.setEndPosition(decRange.startLineNumber, model.getLineMaxColumn(decRange.startLineNumber));
					updateSelections = true;
				}
			});
		});
		let revealPosition;
		if (focusLine) {
			revealPosition = { lineNumber: focusLine, column: 1 };
		} else {
			revealPosition = selections[0].getStartPosition();
		}
		if (updateSelections) {
			this.editor.setSelections(selections);
		}
		this.editor.setHiddenAreas(hiddenAreas);
		this.editor.revealPositionInCenterIfOutsideViewport(revealPosition);
	}

	public unfold(): void {
		let model = this.editor.getModel();
		let hasChanges = false;
		let selections = this.editor.getSelections();
		let selectionsHasChanged = false;
		selections.forEach((selection, index) => {
			let lineNumber = selection.startLineNumber;
			let surroundingUnfolded: editorCommon.IEditorRange;
			for (let i = 0, len = this.decorations.length; i < len; i++) {
				let dec = this.decorations[i];
				let decRange = dec.getDecorationRange(model);
				if (!decRange) {
					continue;
				}
				if (decRange.startLineNumber <= lineNumber) {
					if (lineNumber <= decRange.endLineNumber) {
						if (dec.isCollapsed) {
							this.editor.changeDecorations(changeAccessor => {
								dec.setCollapsed(false, changeAccessor);
								hasChanges = true;
							});
							return;
						}
						surroundingUnfolded = decRange;
					}
				} else { // decRange.startLineNumber > lineNumber
					if (surroundingUnfolded && Range.containsRange(surroundingUnfolded, decRange)) {
						if (dec.isCollapsed) {
							this.editor.changeDecorations(changeAccessor => {
								dec.setCollapsed(false, changeAccessor);
								hasChanges = true;
								let lineNumber = decRange.startLineNumber, column = model.getLineMaxColumn(decRange.startLineNumber);
								selections[index] = selection.setEndPosition(lineNumber, column).setStartPosition(lineNumber, column);
								selectionsHasChanged = true;
							});
							return;
						}
					} else {
						return;
					}
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

	public fold(): void {
		let hasChanges = false;
		let model = this.editor.getModel();
		let selections = this.editor.getSelections();
		selections.forEach(selection => {
			let lineNumber = selection.startLineNumber;
			let toFold: CollapsibleRegion = null;
			for (let i = 0, len = this.decorations.length; i < len; i++) {
				let dec = this.decorations[i];
				let decRange = dec.getDecorationRange(model);
				if (!decRange) {
					continue;
				}
				if (decRange.startLineNumber <= lineNumber) {
					if (lineNumber <= decRange.endLineNumber && !dec.isCollapsed) {
						toFold = dec;
					}
				} else {
					break;
				}
			};
			if (toFold) {
				this.editor.changeDecorations(changeAccessor => {
					toFold.setCollapsed(true, changeAccessor);
					hasChanges = true;
				});
			}
		});
		if (hasChanges) {
			this.updateHiddenAreas(selections[0].startLineNumber);
		}
	}

	public changeAll(collapse: boolean): void {
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
				this.updateHiddenAreas(void 0);
			}
		}
	}

	public foldLevel(foldLevel: number, selectedLineNumbers: number[]): void {
		let model = this.editor.getModel();
		let foldingRegionStack: editorCommon.IEditorRange[] = [ model.getFullModelRange() ]; // sentinel

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

abstract class FoldingAction extends EditorAction {
	constructor(descriptor: editorCommon.IEditorActionDescriptorData, editor: editorCommon.ICommonCodeEditor) {
		super(descriptor, editor, Behaviour.TextFocus);
	}

	abstract invoke(foldingController: FoldingController): void;

	public run(): TPromise<boolean> {
		let foldingController = FoldingController.getFoldingController(this.editor);
		this.invoke(foldingController);
		return TPromise.as(true);
	}

}

class UnfoldAction extends FoldingAction {
	public static ID = 'editor.unfold';

	invoke(foldingController: FoldingController): void {
		foldingController.unfold();
	}
}

class FoldAction extends FoldingAction {
	public static ID = 'editor.fold';

	invoke(foldingController: FoldingController): void {
		foldingController.fold();
	}
}

class FoldAllAction extends FoldingAction {
	public static ID = 'editor.foldAll';

	invoke(foldingController: FoldingController): void {
		foldingController.changeAll(true);
	}
}

class UnfoldAllAction extends FoldingAction {
	public static ID = 'editor.unfoldAll';

	invoke(foldingController: FoldingController): void {
		foldingController.changeAll(false);
	}
}

class FoldLevelAction extends FoldingAction {
	private static ID_PREFIX = 'editor.foldLevel';
	public static ID = (level:number) => FoldLevelAction.ID_PREFIX + level;

	private getFoldingLevel() {
		return parseInt(this.id.substr(FoldLevelAction.ID_PREFIX.length));
	}

	private getSelectedLines() {
		return this.editor.getSelections().map(s => s.startLineNumber);
	}

	invoke(foldingController: FoldingController): void {
		foldingController.foldLevel(this.getFoldingLevel(), this.getSelectedLines());
	}
}


EditorBrowserRegistry.registerEditorContribution(FoldingController);

CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(UnfoldAction, UnfoldAction.ID, nls.localize('unfoldAction.label', "Unfold"), {
	context: ContextKey.EditorFocus,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_CLOSE_SQUARE_BRACKET
}));
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(FoldAction, FoldAction.ID, nls.localize('foldAction.label', "Fold"), {
	context: ContextKey.EditorFocus,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_OPEN_SQUARE_BRACKET
}));
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(FoldAllAction, FoldAllAction.ID, nls.localize('foldAllAction.label', "Fold All"), {
	context: ContextKey.EditorFocus,
	primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyMod.Shift | KeyCode.US_OPEN_SQUARE_BRACKET
}));
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(UnfoldAllAction, UnfoldAllAction.ID, nls.localize('unfoldAllAction.label', "Unfold All"), {
	context: ContextKey.EditorFocus,
	primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyMod.Shift | KeyCode.US_CLOSE_SQUARE_BRACKET,
	secondary: [ KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_J) ]
}));
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(FoldLevelAction, FoldLevelAction.ID(1), nls.localize('foldLevel1Action.label', "Fold Level 1"), {
	context: ContextKey.EditorFocus,
	primary: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_1)
}));
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(FoldLevelAction, FoldLevelAction.ID(2), nls.localize('foldLevel2Action.label', "Fold Level 2"), {
	context: ContextKey.EditorFocus,
	primary: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_2)
}));
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(FoldLevelAction, FoldLevelAction.ID(3), nls.localize('foldLevel3Action.label', "Fold Level 3"), {
	context: ContextKey.EditorFocus,
	primary: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_3)
}));
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(FoldLevelAction, FoldLevelAction.ID(4), nls.localize('foldLevel4Action.label', "Fold Level 4"), {
	context: ContextKey.EditorFocus,
	primary: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_4)
}));
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(FoldLevelAction, FoldLevelAction.ID(5), nls.localize('foldLevel5Action.label', "Fold Level 5"), {
	context: ContextKey.EditorFocus,
	primary: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_5)
}));

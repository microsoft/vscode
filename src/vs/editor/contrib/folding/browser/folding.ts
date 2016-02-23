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
import {INullService} from 'vs/platform/instantiation/common/instantiation';
import {EditorAction} from 'vs/editor/common/editorAction';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {CommonEditorRegistry, ContextKey, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {ICodeEditor, IEditorMouseEvent} from 'vs/editor/browser/editorBrowser';
import {EditorBrowserRegistry} from 'vs/editor/browser/editorBrowserExtensions';
import {IFoldingRange, toString as rangeToString} from 'vs/editor/contrib/folding/common/foldingRange';
import {computeRanges} from 'vs/editor/contrib/folding/common/indentFoldStrategy';

let log = function(msg: string) {
	//console.log(msg);
};

class CollapsibleRegion {

	private decorationIds: string[];
	private _isCollapsed: boolean;

	private _lastRange: IFoldingRange;

	public constructor(range:IFoldingRange, model:editorCommon.IModel, changeAccessor:editorCommon.IModelDecorationsChangeAccessor) {
		this.decorationIds = [];
		this.update(range, model, changeAccessor);
	}

	public get isCollapsed(): boolean {
		return this._isCollapsed;
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

	static getFoldingController(editor:editorCommon.ICommonCodeEditor): FoldingController {
		return <FoldingController>editor.getContribution(FoldingController.ID);
	}

	private editor: ICodeEditor;
	private globalToDispose: IDisposable[];

	private computeToken: number;
	private updateScheduler: RunOnceScheduler;
	private localToDispose: IDisposable[];

	private decorations: CollapsibleRegion[];

	constructor(editor:ICodeEditor, @INullService nullService) {
		this.editor = editor;

		this.globalToDispose = [];
		this.localToDispose = [];
		this.decorations = [];
		this.computeToken = 0;

		this.globalToDispose.push(this.editor.addListener2(editorCommon.EventType.ModelChanged, () => this.onModelChanged()));
		this.globalToDispose.push(this.editor.addListener2(editorCommon.EventType.ModelModeChanged, () => this.onModelChanged()));
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
					collapsedRegions.push({ startLineNumber: range.startLineNumber, endLineNumber: range.endLineNumber, isCollapsed: true});
				}
			}
		});
		return collapsedRegions;
	}

	/**
	 * Restore view state.
	 */
	public restoreViewState(state: any): void {
		if (!Array.isArray(state)) {
			return;
		}
		this.applyRegions(<IFoldingRange[]> state);
	}

	private cleanState(): void {
		this.localToDispose = disposeAll(this.localToDispose);
	}

	private applyRegions(regions: IFoldingRange[]) {
		let model = this.editor.getModel();
		if (!model) {
			return;
		}

		regions = regions.sort((r1, r2) => r1.startLineNumber - r2.startLineNumber);
		log('imput ranges ' + regions.map(rangeToString).join(', '));

		this.editor.changeDecorations(changeAccessor => {

			let newDecorations : CollapsibleRegion[] = [];

			let k = 0, i = 0;
			while (i < this.decorations.length && k < regions.length) {
				let dec = this.decorations[i];
				let decRange = dec.getDecorationRange(model);
				if (!decRange) {
					log('range no longer valid, was ' + dec.toString());
					dec.dispose(changeAccessor);
					i++;
				} else {
					while (k < regions.length && decRange.startLineNumber > regions[k].startLineNumber) {
						log('new range ' + rangeToString(regions[k]));
						newDecorations.push(new CollapsibleRegion(regions[k], model, changeAccessor));
						k++;
					}
					if (k < regions.length) {
						let currRange = regions[k];
						if (decRange.startLineNumber < currRange.startLineNumber) {
							log('range no longer valid, was ' + dec.toString());
							dec.dispose(changeAccessor);
							i++;
						} else if (decRange.startLineNumber === currRange.startLineNumber) {
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
				log('range no longer valid, was ' + this.decorations[i].toString());
				this.decorations[i].dispose(changeAccessor);
				i++;
			}
			while (k < regions.length) {
				log('new range ' + rangeToString(regions[k]));
				newDecorations.push(new CollapsibleRegion(regions[k], model, changeAccessor));
				k++;
			}
			this.decorations = newDecorations;
		});
		this.updateHiddenAreas();
	}

	private onModelChanged(): void {
		this.cleanState();

		let model = this.editor.getModel();
		if (!this.editor.getConfiguration().folding || !model) {
			return;
		}

		this.updateScheduler = new RunOnceScheduler(() => {
			let myToken = (++this.computeToken);

			this.computeCollapsibleRegions().then(regions => {
				if (myToken !== this.computeToken) {
					return; // A new request was made in the meantime or the model was changed
				}
				this.applyRegions(regions);
			});
		}, 200);

		this.localToDispose.push(this.updateScheduler);
		this.localToDispose.push(this.editor.addListener2('change', () => this.updateScheduler.schedule()));
		this.localToDispose.push({ dispose: () => {
			++this.computeToken;
			this.editor.changeDecorations(changeAccessor => {
				this.decorations.forEach(dec => dec.dispose(changeAccessor));
				this.decorations = [];
			});
		}});
		this.localToDispose.push(this.editor.addListener2(editorCommon.EventType.MouseDown, (e) => this._onEditorMouseDown(e)));

		this.updateScheduler.schedule();
	}

	private computeCollapsibleRegions(): TPromise<IFoldingRange[]> {
		let tabSize = this.editor.getIndentationOptions().tabSize;
		let model = this.editor.getModel();
		if (!model) {
			return TPromise.as([]);
		}

		let ranges = computeRanges(model, tabSize);
		return TPromise.as(ranges);
	}

	private _onEditorMouseDown(e: IEditorMouseEvent): void {
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

		let toggleClicked = false;
		switch (e.target.type) {
			case editorCommon.MouseTargetType.GUTTER_LINE_DECORATIONS:
				toggleClicked = true;
				break;
			case editorCommon.MouseTargetType.CONTENT_TEXT:
				if (range.isEmpty && range.startColumn === model.getLineMaxColumn(range.startLineNumber)) {
					break;
				}
				return;
			default:
				return;
		}

		let hasChanges = false;

		this.editor.changeDecorations(changeAccessor => {
			for (let i = 0; i < this.decorations.length; i++) {
				let dec = this.decorations[i];
				let decRange = dec.getDecorationRange(model);
				if (decRange.startLineNumber === range.startLineNumber) {
					if (toggleClicked || dec.isCollapsed) {
						dec.setCollapsed(!dec.isCollapsed, changeAccessor);
						hasChanges = true;
					}
					break;
				}
			}
		});

		if (hasChanges) {
			this.updateHiddenAreas();
		}

	}

	private updateHiddenAreas(): void {
		let model = this.editor.getModel();
		let hiddenAreas: editorCommon.IRange[] = [];
		this.decorations.filter(dec => dec.isCollapsed).forEach(dec => {
			let decRange = dec.getDecorationRange(model);
			hiddenAreas.push({
				startLineNumber: decRange.startLineNumber + 1,
				startColumn: 1,
				endLineNumber: decRange.endLineNumber,
				endColumn: 1
			});
		});
		this.editor.setHiddenAreas(hiddenAreas);
	}

	private findRegions(lineNumber: number, collapsed: boolean): CollapsibleRegion[] {
		let model = this.editor.getModel();
		return this.decorations.filter(dec => {
			if (dec.isCollapsed !== collapsed) {
				return false;
			}
			let decRange = dec.getDecorationRange(model);
			return decRange && decRange.startLineNumber <= lineNumber && lineNumber < decRange.endLineNumber;
		});
	}


	public unfold(lineNumber: number): void {
		let surrounding = this.findRegions(lineNumber, true);
		if (surrounding.length > 0) {
			this.editor.changeDecorations(changeAccessor => {
				surrounding[0].setCollapsed(false, changeAccessor);
			});
			this.updateHiddenAreas();
		}
	}

	public fold(lineNumber: number): void {
		let surrounding = this.findRegions(lineNumber, false);
		if (surrounding.length > 0) {
			this.editor.changeDecorations(changeAccessor => {
				surrounding[surrounding.length - 1].setCollapsed(true, changeAccessor);
			});
			this.updateHiddenAreas();
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
				this.updateHiddenAreas();
			}
		}
	}


}

abstract class FoldingAction extends EditorAction {
	constructor(descriptor: editorCommon.IEditorActionDescriptorData, editor: editorCommon.ICommonCodeEditor, @INullService ns) {
		super(descriptor, editor);
	}

	abstract invoke(foldingController: FoldingController, lineNumber: number): void;

	public run(): TPromise<boolean> {
		let foldingController = FoldingController.getFoldingController(this.editor);
		let selection = this.editor.getSelection();
		if (selection && selection.isEmpty) {
			this.invoke(foldingController, selection.startLineNumber);
		}
		return TPromise.as(true);
	}

}

class UnfoldAction extends FoldingAction {
	public static ID = 'editor.unfold';

	invoke(foldingController: FoldingController, lineNumber: number): void {
		foldingController.unfold(lineNumber);
	}
}

class FoldAction extends FoldingAction {
	public static ID = 'editor.fold';

	invoke(foldingController: FoldingController, lineNumber: number): void {
		foldingController.fold(lineNumber);
	}
}

class FoldAllAction extends FoldingAction {
	public static ID = 'editor.foldAll';

	invoke(foldingController: FoldingController, lineNumber: number): void {
		foldingController.changeAll(true);
	}
}

class UnfoldAllAction extends FoldingAction {
	public static ID = 'editor.unfoldAll';

	invoke(foldingController: FoldingController, lineNumber: number): void {
		foldingController.changeAll(false);
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
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(FoldAllAction, UnfoldAllAction.ID, nls.localize('foldAllAction.label', "Fold All"), {
	context: ContextKey.EditorFocus,
	primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyMod.Shift | KeyCode.US_OPEN_SQUARE_BRACKET
}));
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(UnfoldAllAction, FoldAllAction.ID, nls.localize('unfoldAllAction.label', "Unfold All"), {
	context: ContextKey.EditorFocus,
	primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyMod.Shift | KeyCode.US_CLOSE_SQUARE_BRACKET
}));
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/*
import Parser = require('web-tree-sitter');
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IModelDeltaDecoration, ITextModel } from 'vs/editor/common/model';
import { IModelContentChangedEvent } from 'vs/editor/common/textModelEvents';
import { FileAccess } from 'vs/base/common/network';
import { TreeSitterTokenizationTree } from 'vs/editor/browser/services/treeSitterTrees/treeSitterTokenizationTree';
import { FoldingModel, FoldingModelChangeEvent } from 'vs/editor/contrib/folding/browser/foldingModel';
import { Emitter } from 'vs/base/common/event';
import { FoldingRegion, FoldingRegions } from 'vs/editor/contrib/folding/browser/foldingRanges';
import { IEditorMouseEvent, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { HiddenRangeModel } from 'vs/editor/contrib/folding/browser/hiddenRangeModel';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { IPosition } from 'vs/editor/common/core/position';
import { LanguageFeatureRegistry } from 'vs/editor/common/languageFeatureRegistry';
import { FoldingRangeProvider } from 'vs/editor/common/languages';

export class TreeSitterForFolding extends TreeSitterTokenizationTree {

	private readonly _disposableStore: DisposableStore = new DisposableStore();
	private readonly _updateEventEmitter: Emitter<FoldingModelChangeEvent>;
	private _editorDecorationIds: string[];
	private _foldingModel: FoldingModel;
	private _hiddenRangeModel: HiddenRangeModel;

	private _foldingRangeProvider: FoldingRangeProvider;
	private _mouseDownInfo: null | { lineNumber: number, iconClicked: boolean };

	constructor(
		_model: ITextModel,
		_language: Parser.Language,
		_foldingRangeProvider: LanguageFeatureRegistry<FoldingRangeProvider> // LanguageFeatureRegistry<FoldingRangeProvider>
	) {

		console.log('Constructor of TreeSitterForFolding');

		super(_model, _language);
		this._foldingRangeProvider = _foldingRangeProvider;
		this._updateEventEmitter = new Emitter<FoldingModelChangeEvent>();
		// this._foldingModel = new FoldingModel(this._model, this._foldingDecorationProvider);
		// this._hiddenRangeModel = new HiddenRangeModel(this._foldingModel);
		this._editorDecorationIds = [];
		this._mouseDownInfo = null;

		const uriString = FileAccess.asBrowserUri(`./treeSitterForFolding.scm`, require).toString(true);
		fetch(uriString).then((response) => {
			response.text().then((content) => {
				this._content = content;

				this.parseTree().then((tree) => {
					if (!tree) {
						return;
					}
					this._tree = tree;
					this.updateFoldingRegions();

					this._disposableStore.add(this._model.onDidChangeContent((e: IModelContentChangedEvent) => {
						for (const change of e.changes) {
							const newEndPositionFromModel = this._model.getPositionAt(change.rangeOffset + change.text.length);
							this._edits.push({
								startPosition: { row: change.range.startLineNumber - 1, column: change.range.startColumn - 1 },
								oldEndPosition: { row: change.range.endLineNumber - 1, column: change.range.endColumn - 1 },
								newEndPosition: { row: newEndPositionFromModel.lineNumber - 1, column: newEndPositionFromModel.column - 1 },
								startIndex: change.rangeOffset,
								oldEndIndex: change.rangeOffset + change.rangeLength,
								newEndIndex: change.rangeOffset + change.text.length
							} as Parser.Edit);
						}
						this.parseTree().then((tree) => {
							if (!tree) {
								return;
							}
							this._tree = tree;
							this.updateFoldingRegions();
						})
					}));
					this._disposableStore.add(this._editor.onMouseUp(e => this.onEditorMouseUp(e)));
					this._disposableStore.add(this._editor.onMouseDown(e => this.onEditorMouseDown(e)));
				})
			})
		})
	}

	private onEditorMouseDown(e: IEditorMouseEvent): void {
		this._mouseDownInfo = null;
		if (!e.target || !e.target.range) {
			return;
		}
		if (!e.event.leftButton && !e.event.middleButton) {
			return;
		}
		const range = e.target.range;
		let iconClicked = false;
		switch (e.target.type) {
			case MouseTargetType.GUTTER_LINE_DECORATIONS: {
				const data = e.target.detail;
				const offsetLeftInGutter = (e.target.element as HTMLElement).offsetLeft;
				const gutterOffsetX = data.offsetX - offsetLeftInGutter;
				if (gutterOffsetX < 5) {
					return;
				}
				iconClicked = true;
				break;
			}
			case MouseTargetType.CONTENT_EMPTY: {
				if (this._hiddenRangeModel.hasRanges()) { // this._unfoldOnClickAfterEndOfLine &&
					const data = e.target.detail;
					if (!data.isAfterLines) {
						break;
					}
				}
				return;
			}
			case MouseTargetType.CONTENT_TEXT: {
				if (this._hiddenRangeModel.hasRanges()) {
					const model = this._editor.getModel();
					if (model && range.startColumn === model.getLineMaxColumn(range.startLineNumber)) {
						break;
					}
				}
				return;
			}
			default:
				return;
		}
		this._mouseDownInfo = { lineNumber: range.startLineNumber, iconClicked };
	}

	private onEditorMouseUp(e: IEditorMouseEvent): void {
		const foldingModel = this._foldingModel;
		if (!foldingModel || !this._mouseDownInfo || !e.target) {
			return;
		}
		const lineNumber = this._mouseDownInfo.lineNumber;
		const iconClicked = this._mouseDownInfo.iconClicked;
		const range = e.target.range;
		if (!range || range.startLineNumber !== lineNumber) {
			return;
		}
		if (iconClicked) {
			if (e.target.type !== MouseTargetType.GUTTER_LINE_DECORATIONS) {
				return;
			}
		} else {
			const model = this._editor.getModel();
			if (!model || range.startColumn !== model.getLineMaxColumn(lineNumber)) {
				return;
			}
		}
		console.log('lineNumber : ', lineNumber);
		let captures = this._captures.map(capture => {
			return { start: capture.node.startPosition.row, end: capture.node.endPosition.row };
		});
		captures = captures.map(capture => {
			if (capture.start + 1 === lineNumber) {
				return { start: capture.start, end: capture.start + 1 };
			} else {
				return capture;
			}
		})
		console.log('captures : ', captures);

		const startIndices: number[] = [];
		const endIndices: number[] = [];
		for (let i = 0; i < captures.length; i++) {
			startIndices.push(captures[i].start + 1);
			endIndices.push(captures[i].end);
		}

		const region = new FoldingRegion(new FoldingRegions(new Uint32Array(startIndices), new Uint32Array(endIndices)), 0);
		console.log('region : ', region);
		// if (region && region.startLineNumber === lineNumber) {
		const isCollapsed = region.isCollapsed;
		if (iconClicked || isCollapsed) {
			const surrounding = e.event.altKey;
			let toToggle: FoldingRegion[] = [];
			if (surrounding) {
				/*
				const filter = (otherRegion: FoldingRegion) => !otherRegion.containedBy(region!) && !region!.containedBy(otherRegion);
				const toMaybeToggle = foldingModel.getRegionsInside(null, filter);
				for (const r of toMaybeToggle) {
					if (r.isCollapsed) {
						toToggle.push(r);
					}
				}
				// if any surrounding regions are folded, unfold those. Otherwise, fold all surrounding
				if (toToggle.length === 0) {
					toToggle = toMaybeToggle;
				}
				*/
/*
}
else {
const recursive = e.event.middleButton || e.event.shiftKey;
/*
if (recursive) {
	for (const r of foldingModel.getRegionsInside(region)) {
		if (r.isCollapsed === isCollapsed) {
			toToggle.push(r);
		}
	}
}
*/
				// when recursive, first only collapse all children. If all are already folded or there are no children, also fold parent.
/*
if (isCollapsed || !recursive || toToggle.length === 0) {
	toToggle.push(region);
}
}
console.log('Before toggleCollapseState in onEditorMouseUp');
foldingModel.toggleCollapseState(toToggle);
this._reveal({ lineNumber, column: 1 });
}
// }
}

private _reveal(position: IPosition): void {
this._editor.revealPositionInCenterIfOutsideViewport(position, ScrollType.Smooth);
}

public updateFoldingRegions() {

this.getTextMateCaptures();
const startIndices: number[] = [];
const endIndices: number[] = [];
for (let i = 0; i < this._captures.length; i++) {
startIndices.push(this._captures[i].node.startPosition.row + 1);
endIndices.push(this._captures[i].node.endPosition.row);
}
const newRegions = new FoldingRegions(new Uint32Array(startIndices), new Uint32Array(endIndices));
const newEditorDecorations: IModelDeltaDecoration[] = [];

let lastHiddenLine = -1;
for (let index = 0, limit = this._captures.length; index < limit; index++) {
const startLineNumber = this._captures[index].node.startPosition.row + 1;
const endLineNumber = this._captures[index].node.endPosition.row;
const isCollapsed = false;
const isManual = false;
const decorationRange = {
startLineNumber: startLineNumber,
startColumn: this._captures[index].node.startPosition.column,
endLineNumber: endLineNumber,
endColumn: this._captures[index].node.endPosition.column
};
newEditorDecorations.push({ range: decorationRange, options: this._foldingDecorationProvider.getDecorationOption(isCollapsed, endLineNumber <= lastHiddenLine, isManual) });
if (isCollapsed && endLineNumber > lastHiddenLine) {
lastHiddenLine = endLineNumber;
}
}

console.log('newEditorDecorations in updateFoldingRegions : ', newEditorDecorations);
console.log('newRegions in updateFoldingRegions : ', newRegions);
console.log('this._editorDecorationIds in updateFoldingRegions : ', this._editorDecorationIds);
this._model.changeDecorations(accessor => this._editorDecorationIds = accessor.deltaDecorations(this._editorDecorationIds, newEditorDecorations));
// this._foldingDecorationProvider.changeDecorations(accessor => this._editorDecorationIds = accessor.deltaDecorations(this._editorDecorationIds, newEditorDecorations));
this._foldingModel.setRegions(newRegions);
this._updateEventEmitter.fire({ model: this._foldingModel });

console.log('Finished updating the folding regions');
}

public toggleCollapseState(toggledRegions: FoldingRegion[]) {
console.log('Inside of toggleCollapseState for toggledRegions : ', toggledRegions);
if (!toggledRegions.length) {
return;
}
toggledRegions = toggledRegions.sort((r1, r2) => r1.regionIndex - r2.regionIndex);

const processed: { [key: string]: boolean | undefined } = {};
this._model.changeDecorations(accessor => {
let k = 0; // index from [0 ... this.regions.length]
let dirtyRegionEndLine = -1; // end of the range where decorations need to be updated
let lastHiddenLine = -1; // the end of the last hidden lines
const updateDecorationsUntil = (index: number) => {
while (k < index) {
	const endLineNumber = this._regions.getEndLineNumber(k);
	const isCollapsed = this._regions.isCollapsed(k);
	if (endLineNumber <= dirtyRegionEndLine) {
		const isManual = this.regions.getSource(k) !== FoldSource.provider;
		accessor.changeDecorationOptions(this._editorDecorationIds[k], this._decorationProvider.getDecorationOption(isCollapsed, endLineNumber <= lastHiddenLine, isManual));
	}
	if (isCollapsed && endLineNumber > lastHiddenLine) {
		lastHiddenLine = endLineNumber;
	}
	k++;
}
};
for (const region of toggledRegions) {
const index = region.regionIndex;
const editorDecorationId = this._editorDecorationIds[index];
if (editorDecorationId && !processed[editorDecorationId]) {
	processed[editorDecorationId] = true;

	updateDecorationsUntil(index); // update all decorations up to current index using the old dirtyRegionEndLine

	const newCollapseState = !this._regions.isCollapsed(index);
	this._regions.setCollapsed(index, newCollapseState);

	dirtyRegionEndLine = Math.max(dirtyRegionEndLine, this._regions.getEndLineNumber(index));
}
}
updateDecorationsUntil(this._regions.length);
});
this._updateEventEmitter.fire({ model: this._model, collapseStateChanged: toggledRegions });
}

public override dispose() {
super.dispose();
}
}
*/

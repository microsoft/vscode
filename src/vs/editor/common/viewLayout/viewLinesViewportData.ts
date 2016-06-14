/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IModelDecoration} from 'vs/editor/common/editorCommon';
import {IDecorationsViewportData, InlineDecoration} from 'vs/editor/common/viewModel/viewModel';
import {Range} from 'vs/editor/common/core/range';

export interface IPartialViewLinesViewportData {
	viewportTop: number;
	viewportHeight: number;
	bigNumbersDelta: number;
	visibleRangesDeltaTop: number;
	startLineNumber: number;
	endLineNumber: number;
	relativeVerticalOffset: number[];
}

export class ViewLinesViewportData {
	_viewLinesViewportDataBrand: void;

	viewportTop: number;
	viewportHeight: number;
	bigNumbersDelta: number;
	visibleRangesDeltaTop: number;
	/**
	 * The line number at which to start rendering (inclusive).
	 */
	startLineNumber: number;
	/**
	 * The line number at which to end rendering (inclusive).
	 */
	endLineNumber: number;
	/**
	 * relativeVerticalOffset[i] is the gap that must be left between line at
	 * i - 1 + `startLineNumber` and i + `startLineNumber`.
	 */
	relativeVerticalOffset: number[];
	/**
	 * The viewport as a range (`startLineNumber`,1) -> (`endLineNumber`,maxColumn(`endLineNumber`)).
	 */
	visibleRange:Range;

	private _decorations: IModelDecoration[];
	private _inlineDecorations: InlineDecoration[][];

	constructor(partialData:IPartialViewLinesViewportData, visibleRange:Range, decorationsData:IDecorationsViewportData) {
		this.viewportTop = partialData.viewportTop|0;
		this.viewportHeight = partialData.viewportHeight|0;
		this.bigNumbersDelta = partialData.bigNumbersDelta|0;
		this.visibleRangesDeltaTop = partialData.visibleRangesDeltaTop|0;
		this.startLineNumber = partialData.startLineNumber|0;
		this.endLineNumber = partialData.endLineNumber|0;
		this.relativeVerticalOffset = partialData.relativeVerticalOffset;
		this.visibleRange = visibleRange;
		this._decorations = decorationsData.decorations;
		this._inlineDecorations = decorationsData.inlineDecorations;
	}

	public getDecorationsInViewport(): IModelDecoration[] {
		return this._decorations;
	}

	public getInlineDecorationsForLineInViewport(lineNumber:number): InlineDecoration[] {
		lineNumber = lineNumber|0;
		return this._inlineDecorations[lineNumber - this.startLineNumber];
	}
}

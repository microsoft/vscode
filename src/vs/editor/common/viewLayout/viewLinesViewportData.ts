/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from '../core/range.js';
import { Selection } from '../core/selection.js';
import { IPartialViewLinesViewportData, IViewModel, IViewWhitespaceViewportData, ViewLineRenderingData, ViewModelDecoration } from '../viewModel.js';

/**
 * Contains all data needed to render at a specific viewport.
 */
export class ViewportData {

	public readonly selections: Selection[];

	/**
	 * The line number at which to start rendering (inclusive).
	 */
	public readonly startLineNumber: number;

	/**
	 * The line number at which to end rendering (inclusive).
	 */
	public readonly endLineNumber: number;

	/**
	 * relativeVerticalOffset[i] is the `top` position for line at `i` + `startLineNumber`.
	 */
	public readonly relativeVerticalOffset: number[];

	/**
	 * The viewport as a range (startLineNumber,1) -> (endLineNumber,maxColumn(endLineNumber)).
	 */
	public readonly visibleRange: Range;

	/**
	 * Value to be substracted from `scrollTop` (in order to vertical offset numbers < 1MM)
	 */
	public readonly bigNumbersDelta: number;

	/**
	 * Positioning information about gaps whitespace.
	 */
	public readonly whitespaceViewportData: IViewWhitespaceViewportData[];

	private readonly _model: IViewModel;

	public readonly lineHeight: number;

	constructor(
		selections: Selection[],
		partialData: IPartialViewLinesViewportData,
		whitespaceViewportData: IViewWhitespaceViewportData[],
		model: IViewModel
	) {
		this.selections = selections;
		this.startLineNumber = partialData.startLineNumber | 0;
		this.endLineNumber = partialData.endLineNumber | 0;
		this.relativeVerticalOffset = partialData.relativeVerticalOffset;
		this.bigNumbersDelta = partialData.bigNumbersDelta | 0;
		this.lineHeight = partialData.lineHeight | 0;
		this.whitespaceViewportData = whitespaceViewportData;

		this._model = model;

		this.visibleRange = new Range(
			partialData.startLineNumber,
			this._model.getLineMinColumn(partialData.startLineNumber),
			partialData.endLineNumber,
			this._model.getLineMaxColumn(partialData.endLineNumber)
		);
	}

	public getViewLineRenderingData(lineNumber: number): ViewLineRenderingData {
		return this._model.getViewportViewLineRenderingData(this.visibleRange, lineNumber);
	}

	public getDecorationsInViewport(): ViewModelDecoration[] {
		return this._model.getDecorationsInViewport(this.visibleRange);
	}
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ViewLineRenderingData, IViewModel, ViewModelDecoration } from 'vs/editor/common/viewModel/viewModel';
import { Range } from 'vs/editor/common/core/range';

export interface IPartialViewLinesViewportData {
	viewportTop: number;
	viewportHeight: number;
	bigNumbersDelta: number;
	visibleRangesDeltaTop: number;
	startLineNumber: number;
	endLineNumber: number;
	relativeVerticalOffset: number[];
	/**
	 * The centered line in the viewport.
	 */
	centeredLineNumber: number;
}

/**
 * Contains all data needed to render at a specific viewport.
 */
export class ViewportData {

	/**
	 * The absolute top offset of the viewport in px.
	 */
	public readonly viewportTop: number;

	/**
	 * The height of the viewport in px.
	 */
	public readonly viewportHeight: number;

	/**
	 * The line number at which to start rendering (inclusive).
	 */
	public readonly startLineNumber: number;

	/**
	 * The line number at which to end rendering (inclusive).
	 */
	public readonly endLineNumber: number;

	/**
	 * relativeVerticalOffset[i] is the gap that must be left between line at
	 * i - 1 + `startLineNumber` and i + `startLineNumber`.
	 */
	public readonly relativeVerticalOffset: number[];

	/**
	 * The viewport as a range (startLineNumber,1) -> (endLineNumber,maxColumn(endLineNumber)).
	 */
	public readonly visibleRange: Range;

	public readonly bigNumbersDelta: number;
	public readonly visibleRangesDeltaTop: number;

	private readonly _model: IViewModel;

	constructor(
		partialData: IPartialViewLinesViewportData,
		model: IViewModel
	) {
		this.viewportTop = partialData.viewportTop | 0;
		this.viewportHeight = partialData.viewportHeight | 0;
		this.startLineNumber = partialData.startLineNumber | 0;
		this.endLineNumber = partialData.endLineNumber | 0;
		this.relativeVerticalOffset = partialData.relativeVerticalOffset;
		this.bigNumbersDelta = partialData.bigNumbersDelta | 0;
		this.visibleRangesDeltaTop = partialData.visibleRangesDeltaTop | 0;

		this._model = model;

		this.visibleRange = new Range(
			partialData.startLineNumber,
			this._model.getLineMinColumn(partialData.startLineNumber),
			partialData.endLineNumber,
			this._model.getLineMaxColumn(partialData.endLineNumber)
		);
	}

	public getViewLineRenderingData(lineNumber: number): ViewLineRenderingData {
		return this._model.getViewLineRenderingData(this.visibleRange, lineNumber);
	}

	public getDecorationsInViewport(): ViewModelDecoration[] {
		return this._model.getDecorationsInViewport(this.visibleRange);
	}
}

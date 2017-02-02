/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as editorCommon from 'vs/editor/common/editorCommon';
import { VerticalObjects } from 'vs/editor/common/viewLayout/verticalObjects';
import { IPartialViewLinesViewportData } from 'vs/editor/common/viewLayout/viewLinesViewportData';

/**
 * Layouting of objects that take vertical space (by having a height) and push down other objects.
 *
 * These objects are basically either text (lines) or spaces between those lines (whitespaces).
 * This provides commodity operations for working with lines that contain whitespace that pushes lines lower (vertically).
 * This is a thin wrapper around VerticalObjects.VerticalObjects, with knowledge of the editor.
 */
export class LinesLayout {

	private configuration: editorCommon.IConfiguration;
	private verticalObjects: VerticalObjects;

	private _lineHeight: number;
	private _scrollBeyondLastLine: boolean;

	constructor(configuration: editorCommon.IConfiguration, lineCount: number) {
		this.configuration = configuration;
		this._lineHeight = this.configuration.editor.lineHeight;
		this._scrollBeyondLastLine = this.configuration.editor.viewInfo.scrollBeyondLastLine;

		this.verticalObjects = new VerticalObjects();
		this.verticalObjects.replaceLines(lineCount);
	}

	public onConfigurationChanged(e: editorCommon.IConfigurationChangedEvent): void {
		if (e.lineHeight) {
			this._lineHeight = this.configuration.editor.lineHeight;
		}
		if (e.viewInfo.scrollBeyondLastLine) {
			this._scrollBeyondLastLine = this.configuration.editor.viewInfo.scrollBeyondLastLine;
		}
	}

	/**
	 * Insert a new whitespace of a certain height after a line number.
	 * The whitespace has a "sticky" characteristic.
	 * Irrespective of edits above or below `afterLineNumber`, the whitespace will follow the initial line.
	 *
	 * @param afterLineNumber The conceptual position of this whitespace. The whitespace will follow this line as best as possible even when deleting/inserting lines above/below.
	 * @param heightInPx The height of the whitespace, in pixels.
	 * @return An id that can be used later to mutate or delete the whitespace
	 */
	public insertWhitespace(afterLineNumber: number, ordinal: number, height: number): number {
		return this.verticalObjects.insertWhitespace(afterLineNumber, ordinal, height);
	}

	public changeWhitespace(id: number, newAfterLineNumber: number, newHeight: number): boolean {
		return this.verticalObjects.changeWhitespace(id, newAfterLineNumber, newHeight);
	}

	/**
	 * Remove an existing whitespace.
	 *
	 * @param id The whitespace to remove
	 * @return Returns true if the whitespace is found and it is removed.
	 */
	public removeWhitespace(id: number): boolean {
		return this.verticalObjects.removeWhitespace(id);
	}

	/**
	 * Event handler, call when the model associated to this view has been flushed.
	 */
	public onModelFlushed(lineCount: number): void {
		this.verticalObjects.replaceLines(lineCount);
	}

	/**
	 * Event handler, call when the model has had lines deleted.
	 */
	public onModelLinesDeleted(e: editorCommon.IViewLinesDeletedEvent): void {
		this.verticalObjects.onModelLinesDeleted(e.fromLineNumber, e.toLineNumber);
	}

	/**
	 * Event handler, call when the model has had lines inserted.
	 */
	public onModelLinesInserted(e: editorCommon.IViewLinesInsertedEvent): void {
		this.verticalObjects.onModelLinesInserted(e.fromLineNumber, e.toLineNumber);
	}

	/**
	 * Get the vertical offset (the sum of heights for all objects above) a certain line number.
	 *
	 * @param lineNumber The line number
	 * @return The sum of heights for all objects above `lineNumber`.
	 */
	public getVerticalOffsetForLineNumber(lineNumber: number): number {
		return this.verticalObjects.getVerticalOffsetForLineNumber(lineNumber, this._lineHeight);
	}

	public getLinesTotalHeight(): number {
		return this.verticalObjects.getTotalHeight(this._lineHeight);
	}

	/**
	 * Get the sum of heights for all objects and compute basically the `scrollHeight` for the editor content.
	 *
	 * Take into account the `scrollBeyondLastLine` and `reserveHorizontalScrollbarHeight` and produce a scrollHeight that is at least as large as `viewport`.height.
	 *
	 * @param viewport The viewport.
	 * @param reserveHorizontalScrollbarHeight The height of the horizontal scrollbar.
	 * @return Basically, the `scrollHeight` for the editor content.
	 */
	public getTotalHeight(viewport: editorCommon.Viewport, reserveHorizontalScrollbarHeight: number): number {
		var totalLinesHeight = this.getLinesTotalHeight();

		//		if (this.context.configuration.editor.autoSize) {
		//			return linesHeight;
		//		}

		if (this._scrollBeyondLastLine) {
			totalLinesHeight += viewport.height - this._lineHeight;
		} else {
			totalLinesHeight += reserveHorizontalScrollbarHeight;
		}

		return Math.max(viewport.height, totalLinesHeight);
	}

	public isAfterLines(verticalOffset: number): boolean {
		return this.verticalObjects.isAfterLines(verticalOffset, this._lineHeight);
	}

	/**
	 * Find the first line number that is at or after vertical offset `verticalOffset`.
	 * i.e. if getVerticalOffsetForLine(line) is x and getVerticalOffsetForLine(line + 1) is y, then
	 * getLineNumberAtOrAfterVerticalOffset(i) = line, x <= i < y.
	 *
	 * @param verticalOffset The vertical offset to search at.
	 * @return The line number at or after vertical offset `verticalOffset`.
	 */
	public getLineNumberAtOrAfterVerticalOffset(verticalOffset: number): number {
		return this.verticalObjects.getLineNumberAtOrAfterVerticalOffset(verticalOffset, this._lineHeight);
	}

	/**
	 * Get the height, in pixels, for line `lineNumber`.
	 *
	 * @param lineNumber The line number
	 * @return The height, in pixels, for line `lineNumber`.
	 */
	public getHeightForLineNumber(lineNumber: number): number {
		return this._lineHeight;
	}

	/**
	 * Get a list of whitespaces that are positioned inside `viewport`.
	 *
	 * @param viewport The viewport.
	 * @return An array with all the whitespaces in the viewport. If no whitespace is in viewport, the array is empty.
	 */
	public getWhitespaceViewportData(visibleBox: editorCommon.Viewport): editorCommon.IViewWhitespaceViewportData[] {
		return this.verticalObjects.getWhitespaceViewportData(visibleBox.top, visibleBox.top + visibleBox.height, this._lineHeight);
	}

	public getWhitespaces(): editorCommon.IEditorWhitespace[] {
		return this.verticalObjects.getWhitespaces(this._lineHeight);
	}

	/**
	 * Get exactly the whitespace that is layouted at `verticalOffset`.
	 *
	 * @param verticalOffset The vertical offset.
	 * @return Precisely the whitespace that is layouted at `verticaloffset` or null.
	 */
	public getWhitespaceAtVerticalOffset(verticalOffset: number): editorCommon.IViewWhitespaceViewportData {
		return this.verticalObjects.getWhitespaceAtVerticalOffset(verticalOffset, this._lineHeight);
	}

	/**
	 * Get all the lines and their relative vertical offsets that are positioned inside `viewport`.
	 *
	 * @param viewport The viewport.
	 * @return A structure describing the lines positioned between `verticalOffset1` and `verticalOffset2`.
	 */
	public getLinesViewportData(visibleBox: editorCommon.Viewport): IPartialViewLinesViewportData {
		return this.verticalObjects.getLinesViewportData(visibleBox.top, visibleBox.top + visibleBox.height, this._lineHeight);
	}

	/**
	 * Returns the accumulated height of whitespaces before the given line number.
	 *
	 * @param lineNumber The line number
	 */
	public getWhitespaceAccumulatedHeightBeforeLineNumber(lineNumber: number): number {
		return this.verticalObjects.getWhitespaceAccumulatedHeightBeforeLineNumber(lineNumber);
	}

	/**
	 * Returns if there is any whitespace in the document.
	 */
	public hasWhitespace(): boolean {
		return this.verticalObjects.hasWhitespace();
	}
}

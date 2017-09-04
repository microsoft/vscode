/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { Scrollable, ScrollEvent, ScrollbarVisibility, IScrollDimensions, IScrollPosition } from 'vs/base/common/scrollable';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { LinesLayout } from 'vs/editor/common/viewLayout/linesLayout';
import { IViewLayout, IViewWhitespaceViewportData, Viewport } from 'vs/editor/common/viewModel/viewModel';
import { IPartialViewLinesViewportData } from 'vs/editor/common/viewLayout/viewLinesViewportData';
import { IEditorWhitespace } from 'vs/editor/common/viewLayout/whitespaceComputer';
import Event from 'vs/base/common/event';
import { IConfigurationChangedEvent } from 'vs/editor/common/config/editorOptions';

const SMOOTH_SCROLLING_TIME = 125;

export class ViewLayout extends Disposable implements IViewLayout {

	static LINES_HORIZONTAL_EXTRA_PX = 30;

	private readonly _configuration: editorCommon.IConfiguration;
	private readonly _linesLayout: LinesLayout;

	public readonly scrollable: Scrollable;
	public readonly onDidScroll: Event<ScrollEvent>;

	constructor(configuration: editorCommon.IConfiguration, lineCount: number, scheduleAtNextAnimationFrame: (callback: () => void) => IDisposable) {
		super();

		this._configuration = configuration;
		this._linesLayout = new LinesLayout(lineCount, this._configuration.editor.lineHeight);

		this.scrollable = this._register(new Scrollable(0, scheduleAtNextAnimationFrame));
		this._configureSmoothScrollDuration();

		this.scrollable.setScrollDimensions({
			width: configuration.editor.layoutInfo.contentWidth,
			height: configuration.editor.layoutInfo.contentHeight
		});
		this.onDidScroll = this.scrollable.onScroll;

		this._updateHeight();
	}

	public dispose(): void {
		super.dispose();
	}

	public getScrollable(): Scrollable {
		return this.scrollable;
	}

	public onHeightMaybeChanged(): void {
		this._updateHeight();
	}

	private _configureSmoothScrollDuration(): void {
		this.scrollable.setSmoothScrollDuration(this._configuration.editor.viewInfo.smoothScrolling ? SMOOTH_SCROLLING_TIME : 0);
	}

	// ---- begin view event handlers

	public onConfigurationChanged(e: IConfigurationChangedEvent): void {
		if (e.lineHeight) {
			this._linesLayout.setLineHeight(this._configuration.editor.lineHeight);
		}
		if (e.layoutInfo) {
			this.scrollable.setScrollDimensions({
				width: this._configuration.editor.layoutInfo.contentWidth,
				height: this._configuration.editor.layoutInfo.contentHeight
			});
		}
		if (e.viewInfo) {
			this._configureSmoothScrollDuration();
		}
		this._updateHeight();
	}
	public onFlushed(lineCount: number): void {
		this._linesLayout.onFlushed(lineCount);
		this._updateHeight();
	}
	public onLinesDeleted(fromLineNumber: number, toLineNumber: number): void {
		this._linesLayout.onLinesDeleted(fromLineNumber, toLineNumber);
		this._updateHeight();
	}
	public onLinesInserted(fromLineNumber: number, toLineNumber: number): void {
		this._linesLayout.onLinesInserted(fromLineNumber, toLineNumber);
		this._updateHeight();
	}

	// ---- end view event handlers

	private _getHorizontalScrollbarHeight(scrollDimensions: IScrollDimensions): number {
		if (this._configuration.editor.viewInfo.scrollbar.horizontal === ScrollbarVisibility.Hidden) {
			// horizontal scrollbar not visible
			return 0;
		}
		if (scrollDimensions.width >= scrollDimensions.scrollWidth) {
			// horizontal scrollbar not visible
			return 0;
		}
		return this._configuration.editor.viewInfo.scrollbar.horizontalScrollbarSize;
	}

	private _getTotalHeight(): number {
		const scrollDimensions = this.scrollable.getScrollDimensions();

		let result = this._linesLayout.getLinesTotalHeight();
		if (this._configuration.editor.viewInfo.scrollBeyondLastLine) {
			result += scrollDimensions.height - this._configuration.editor.lineHeight;
		} else {
			result += this._getHorizontalScrollbarHeight(scrollDimensions);
		}

		return Math.max(scrollDimensions.height, result);
	}

	private _updateHeight(): void {
		this.scrollable.setScrollDimensions({
			scrollHeight: this._getTotalHeight()
		});
	}

	// ---- Layouting logic

	public getCurrentViewport(): Viewport {
		const scrollDimensions = this.scrollable.getScrollDimensions();
		const currentScrollPosition = this.scrollable.getCurrentScrollPosition();
		return new Viewport(
			currentScrollPosition.scrollTop,
			currentScrollPosition.scrollLeft,
			scrollDimensions.width,
			scrollDimensions.height
		);
	}

	public getFutureViewport(): Viewport {
		const scrollDimensions = this.scrollable.getScrollDimensions();
		const currentScrollPosition = this.scrollable.getFutureScrollPosition();
		return new Viewport(
			currentScrollPosition.scrollTop,
			currentScrollPosition.scrollLeft,
			scrollDimensions.width,
			scrollDimensions.height
		);
	}

	private _computeScrollWidth(maxLineWidth: number, viewportWidth: number): number {
		let isViewportWrapping = this._configuration.editor.wrappingInfo.isViewportWrapping;
		if (!isViewportWrapping) {
			return Math.max(maxLineWidth + ViewLayout.LINES_HORIZONTAL_EXTRA_PX, viewportWidth);
		}
		return Math.max(maxLineWidth, viewportWidth);
	}

	public onMaxLineWidthChanged(maxLineWidth: number): void {
		let newScrollWidth = this._computeScrollWidth(maxLineWidth, this.getCurrentViewport().width);
		this.scrollable.setScrollDimensions({
			scrollWidth: newScrollWidth
		});

		// The height might depend on the fact that there is a horizontal scrollbar or not
		this._updateHeight();
	}

	// ---- view state

	public saveState(): editorCommon.IViewState {
		const currentScrollPosition = this.scrollable.getFutureScrollPosition();
		let scrollTop = currentScrollPosition.scrollTop;
		let firstLineNumberInViewport = this._linesLayout.getLineNumberAtOrAfterVerticalOffset(scrollTop);
		let whitespaceAboveFirstLine = this._linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(firstLineNumberInViewport);
		return {
			scrollTop: scrollTop,
			scrollTopWithoutViewZones: scrollTop - whitespaceAboveFirstLine,
			scrollLeft: currentScrollPosition.scrollLeft
		};
	}

	public restoreState(state: editorCommon.IViewState): void {
		let restoreScrollTop = state.scrollTop;
		if (typeof state.scrollTopWithoutViewZones === 'number' && !this._linesLayout.hasWhitespace()) {
			restoreScrollTop = state.scrollTopWithoutViewZones;
		}
		this.scrollable.setScrollPositionNow({
			scrollLeft: state.scrollLeft,
			scrollTop: restoreScrollTop
		});
	}

	// ---- IVerticalLayoutProvider

	public addWhitespace(afterLineNumber: number, ordinal: number, height: number): number {
		return this._linesLayout.insertWhitespace(afterLineNumber, ordinal, height);
	}
	public changeWhitespace(id: number, newAfterLineNumber: number, newHeight: number): boolean {
		return this._linesLayout.changeWhitespace(id, newAfterLineNumber, newHeight);
	}
	public removeWhitespace(id: number): boolean {
		return this._linesLayout.removeWhitespace(id);
	}
	public getVerticalOffsetForLineNumber(lineNumber: number): number {
		return this._linesLayout.getVerticalOffsetForLineNumber(lineNumber);
	}
	public isAfterLines(verticalOffset: number): boolean {
		return this._linesLayout.isAfterLines(verticalOffset);
	}
	public getLineNumberAtVerticalOffset(verticalOffset: number): number {
		return this._linesLayout.getLineNumberAtOrAfterVerticalOffset(verticalOffset);
	}

	public getWhitespaceAtVerticalOffset(verticalOffset: number): IViewWhitespaceViewportData {
		return this._linesLayout.getWhitespaceAtVerticalOffset(verticalOffset);
	}
	public getLinesViewportData(): IPartialViewLinesViewportData {
		const visibleBox = this.getCurrentViewport();
		return this._linesLayout.getLinesViewportData(visibleBox.top, visibleBox.top + visibleBox.height);
	}
	public getLinesViewportDataAtScrollTop(scrollTop: number): IPartialViewLinesViewportData {
		// do some minimal validations on scrollTop
		const scrollDimensions = this.scrollable.getScrollDimensions();
		if (scrollTop + scrollDimensions.height > scrollDimensions.scrollHeight) {
			scrollTop = scrollDimensions.scrollHeight - scrollDimensions.height;
		}
		if (scrollTop < 0) {
			scrollTop = 0;
		}
		return this._linesLayout.getLinesViewportData(scrollTop, scrollTop + scrollDimensions.height);
	}
	public getWhitespaceViewportData(): IViewWhitespaceViewportData[] {
		const visibleBox = this.getCurrentViewport();
		return this._linesLayout.getWhitespaceViewportData(visibleBox.top, visibleBox.top + visibleBox.height);
	}
	public getWhitespaces(): IEditorWhitespace[] {
		return this._linesLayout.getWhitespaces();
	}

	// ---- IScrollingProvider


	public getScrollWidth(): number {
		const scrollDimensions = this.scrollable.getScrollDimensions();
		return scrollDimensions.scrollWidth;
	}
	public getScrollHeight(): number {
		const scrollDimensions = this.scrollable.getScrollDimensions();
		return scrollDimensions.scrollHeight;
	}

	public getCurrentScrollLeft(): number {
		const currentScrollPosition = this.scrollable.getCurrentScrollPosition();
		return currentScrollPosition.scrollLeft;
	}
	public getCurrentScrollTop(): number {
		const currentScrollPosition = this.scrollable.getCurrentScrollPosition();
		return currentScrollPosition.scrollTop;
	}

	public validateScrollPosition(scrollPosition: editorCommon.INewScrollPosition): IScrollPosition {
		return this.scrollable.validateScrollPosition(scrollPosition);
	}

	public setScrollPositionNow(position: editorCommon.INewScrollPosition): void {
		this.scrollable.setScrollPositionNow(position);
	}

	public setScrollPositionSmooth(position: editorCommon.INewScrollPosition): void {
		this.scrollable.setScrollPositionSmooth(position);
	}

	public deltaScrollNow(deltaScrollLeft: number, deltaScrollTop: number): void {
		const currentScrollPosition = this.scrollable.getCurrentScrollPosition();
		this.scrollable.setScrollPositionNow({
			scrollLeft: currentScrollPosition.scrollLeft + deltaScrollLeft,
			scrollTop: currentScrollPosition.scrollTop + deltaScrollTop
		});
	}
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { IScrollPosition, ScrollEvent, Scrollable, ScrollbarVisibility } from 'vs/base/common/scrollable';
import { ConfigurationChangedEvent, EditorOption } from 'vs/editor/common/config/editorOptions';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { LinesLayout, IEditorWhitespace, IWhitespaceChangeAccessor } from 'vs/editor/common/viewLayout/linesLayout';
import { IPartialViewLinesViewportData } from 'vs/editor/common/viewLayout/viewLinesViewportData';
import { IViewLayout, IViewWhitespaceViewportData, Viewport } from 'vs/editor/common/viewModel/viewModel';

const SMOOTH_SCROLLING_TIME = 125;

export class ViewLayout extends Disposable implements IViewLayout {

	private readonly _configuration: editorCommon.IConfiguration;
	private readonly _linesLayout: LinesLayout;

	public readonly scrollable: Scrollable;
	public readonly onDidScroll: Event<ScrollEvent>;

	constructor(configuration: editorCommon.IConfiguration, lineCount: number, scheduleAtNextAnimationFrame: (callback: () => void) => IDisposable) {
		super();

		this._configuration = configuration;
		const options = this._configuration.options;
		const layoutInfo = options.get(EditorOption.layoutInfo);

		this._linesLayout = new LinesLayout(lineCount, options.get(EditorOption.lineHeight));

		this.scrollable = this._register(new Scrollable(0, scheduleAtNextAnimationFrame));
		this._configureSmoothScrollDuration();

		this.scrollable.setScrollDimensions({
			width: layoutInfo.contentWidth,
			height: layoutInfo.contentHeight
		});
		this.onDidScroll = this.scrollable.onScroll;

		this._updateHeight();
	}

	public dispose(): void {
		super.dispose();
	}

	public onHeightMaybeChanged(): void {
		this._updateHeight();
	}

	private _configureSmoothScrollDuration(): void {
		this.scrollable.setSmoothScrollDuration(this._configuration.options.get(EditorOption.smoothScrolling) ? SMOOTH_SCROLLING_TIME : 0);
	}

	// ---- begin view event handlers

	public onConfigurationChanged(e: ConfigurationChangedEvent): void {
		const options = this._configuration.options;
		if (e.hasChanged(EditorOption.lineHeight)) {
			this._linesLayout.setLineHeight(options.get(EditorOption.lineHeight));
		}
		if (e.hasChanged(EditorOption.layoutInfo)) {
			const layoutInfo = options.get(EditorOption.layoutInfo);
			const width = layoutInfo.contentWidth;
			const height = layoutInfo.contentHeight;
			const scrollDimensions = this.scrollable.getScrollDimensions();
			const scrollWidth = scrollDimensions.scrollWidth;
			const scrollHeight = this._getTotalHeight(width, height, scrollWidth);

			this.scrollable.setScrollDimensions({
				width: width,
				height: height,
				scrollHeight: scrollHeight
			});
		} else {
			this._updateHeight();
		}
		if (e.hasChanged(EditorOption.smoothScrolling)) {
			this._configureSmoothScrollDuration();
		}
	}
	public onFlushed(lineCount: number): void {
		this._linesLayout.onFlushed(lineCount);
	}
	public onLinesDeleted(fromLineNumber: number, toLineNumber: number): void {
		this._linesLayout.onLinesDeleted(fromLineNumber, toLineNumber);
	}
	public onLinesInserted(fromLineNumber: number, toLineNumber: number): void {
		this._linesLayout.onLinesInserted(fromLineNumber, toLineNumber);
	}

	// ---- end view event handlers

	private _getHorizontalScrollbarHeight(width: number, scrollWidth: number): number {
		const options = this._configuration.options;
		const scrollbar = options.get(EditorOption.scrollbar);
		if (scrollbar.horizontal === ScrollbarVisibility.Hidden) {
			// horizontal scrollbar not visible
			return 0;
		}
		if (width >= scrollWidth) {
			// horizontal scrollbar not visible
			return 0;
		}
		return scrollbar.horizontalScrollbarSize;
	}

	private _getTotalHeight(width: number, height: number, scrollWidth: number): number {
		const options = this._configuration.options;

		let result = this._linesLayout.getLinesTotalHeight();
		if (options.get(EditorOption.scrollBeyondLastLine)) {
			result += height - options.get(EditorOption.lineHeight);
		} else {
			result += this._getHorizontalScrollbarHeight(width, scrollWidth);
		}

		return Math.max(height, result);
	}

	private _updateHeight(): void {
		const scrollDimensions = this.scrollable.getScrollDimensions();
		const width = scrollDimensions.width;
		const height = scrollDimensions.height;
		const scrollWidth = scrollDimensions.scrollWidth;
		const scrollHeight = this._getTotalHeight(width, height, scrollWidth);
		this.scrollable.setScrollDimensions({
			scrollHeight: scrollHeight
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
		const options = this._configuration.options;
		const wrappingInfo = options.get(EditorOption.wrappingInfo);
		let isViewportWrapping = wrappingInfo.isViewportWrapping;
		if (!isViewportWrapping) {
			const extraHorizontalSpace = options.get(EditorOption.scrollBeyondLastColumn) * options.get(EditorOption.fontInfo).typicalHalfwidthCharacterWidth;
			const whitespaceMinWidth = this._linesLayout.getWhitespaceMinWidth();
			return Math.max(maxLineWidth + extraHorizontalSpace, viewportWidth, whitespaceMinWidth);
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

	public saveState(): { scrollTop: number; scrollTopWithoutViewZones: number; scrollLeft: number; } {
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

	// ---- IVerticalLayoutProvider
	public changeWhitespace<T>(callback: (accessor: IWhitespaceChangeAccessor) => T): T {
		return this._linesLayout.changeWhitespace(callback);
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

	public getWhitespaceAtVerticalOffset(verticalOffset: number): IViewWhitespaceViewportData | null {
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

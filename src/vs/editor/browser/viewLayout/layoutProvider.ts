/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Scrollable, ScrollbarVisibility } from 'vs/base/common/scrollable';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { LinesLayout } from 'vs/editor/common/viewLayout/linesLayout';
import { ViewEventHandler } from 'vs/editor/common/viewModel/viewEventHandler';
import { EditorScrollbar } from 'vs/editor/browser/viewLayout/scrollManager';
import { IViewModel } from 'vs/editor/common/viewModel/viewModel';
import { IPartialViewLinesViewportData } from 'vs/editor/common/viewLayout/viewLinesViewportData';
import { IViewEventBus } from 'vs/editor/common/view/viewContext';
import { ILayoutProvider as IRenderingLayoutProvider } from 'vs/editor/common/view/renderingContext';

export interface IWhitespaceManager {
	/**
	 * Reserve rendering space.
	 * @param height is specified in pixels.
	 * @return an identifier that can be later used to remove or change the whitespace.
	 */
	addWhitespace(afterLineNumber: number, ordinal: number, height: number): number;

	/**
	 * Change the properties of a whitespace.
	 * @param height is specified in pixels.
	 */
	changeWhitespace(id: number, newAfterLineNumber: number, newHeight: number): boolean;

	/**
	 * Remove rendering space
	 */
	removeWhitespace(id: number): boolean;

	/**
	 * Get the layout information for whitespaces currently in the viewport
	 */
	getWhitespaceViewportData(): editorCommon.IViewWhitespaceViewportData[];

	getWhitespaces(): editorCommon.IEditorWhitespace[];
}

export interface ILayoutProvider extends IVerticalLayoutProvider, IScrollingProvider {

	dispose(): void;

	getCurrentViewport(): editorCommon.Viewport;

	onMaxLineWidthChanged(width: number): void;

	saveState(): editorCommon.IViewState;
	restoreState(state: editorCommon.IViewState): void;
}

export interface IScrollingProvider {

	getOverviewRulerInsertData(): { parent: HTMLElement; insertBefore: HTMLElement; };
	getScrollbarContainerDomNode(): HTMLElement;
	delegateVerticalScrollbarMouseDown(browserEvent: MouseEvent): void;

	// This is for the glyphs, line numbers, etc.
	getScrolledTopFromAbsoluteTop(top: number): number;

	getScrollWidth(): number;
	getScrollLeft(): number;

	getScrollHeight(): number;
	getScrollTop(): number;

	setScrollPosition(position: editorCommon.INewScrollPosition): void;
}

export interface IVerticalLayoutProvider {
	/**
	 * Compute vertical offset (top) of line number
	 */
	getVerticalOffsetForLineNumber(lineNumber: number): number;

	/**
	 * Return line number at `verticalOffset` or closest line number
	 */
	getLineNumberAtVerticalOffset(verticalOffset: number): number;

	/**
	 * Compute content height (including one extra scroll page if necessary)
	 */
	getTotalHeight(): number;

	/**
	 * Compute the lines that need to be rendered in the current viewport position.
	 */
	getLinesViewportData(): IPartialViewLinesViewportData;

}

export class LayoutProvider extends ViewEventHandler implements IDisposable, ILayoutProvider, IWhitespaceManager, IRenderingLayoutProvider {

	static LINES_HORIZONTAL_EXTRA_PX = 30;

	private _toDispose: IDisposable[];
	private _configuration: editorCommon.IConfiguration;
	private _privateViewEventBus: IViewEventBus;
	private _model: IViewModel;
	private _scrollManager: EditorScrollbar;
	private _linesLayout: LinesLayout;
	private _scrollable: Scrollable;

	constructor(configuration: editorCommon.IConfiguration, model: IViewModel, privateViewEventBus: IViewEventBus, linesContent: HTMLElement, viewDomNode: HTMLElement, overflowGuardDomNode: HTMLElement) {
		super();

		this._scrollable = new Scrollable();
		this._scrollable.updateState({
			width: configuration.editor.layoutInfo.contentWidth,
			height: configuration.editor.layoutInfo.contentHeight
		});
		this._toDispose = [];
		this._toDispose.push(this._scrollable);

		this._configuration = configuration;
		this._privateViewEventBus = privateViewEventBus;
		this._model = model;

		this._scrollManager = new EditorScrollbar(this._scrollable, configuration, privateViewEventBus, linesContent, viewDomNode, overflowGuardDomNode);

		this._configuration.setMaxLineNumber(this._model.getMaxLineNumber());

		this._linesLayout = new LinesLayout(this._model.getLineCount(), this._configuration.editor.lineHeight);

		this._updateHeight();
	}

	public dispose(): void {
		this._toDispose = dispose(this._toDispose);
		this._scrollManager.dispose();
	}

	private _updateLineCount(): void {
		this._configuration.setMaxLineNumber(this._model.getMaxLineNumber());
	}

	// ---- begin view event handlers

	public onZonesChanged(): boolean {
		this._updateHeight();
		return false;
	}

	public onModelFlushed(): boolean {
		this._linesLayout.onModelFlushed(this._model.getLineCount());
		this._updateLineCount();
		this._updateHeight();
		return false;
	}

	public onModelLinesDeleted(e: editorCommon.IViewLinesDeletedEvent): boolean {
		this._linesLayout.onModelLinesDeleted(e.fromLineNumber, e.toLineNumber);
		this._updateLineCount();
		this._updateHeight();
		return false;
	}

	public onModelLinesInserted(e: editorCommon.IViewLinesInsertedEvent): boolean {
		this._linesLayout.onModelLinesInserted(e.fromLineNumber, e.toLineNumber);
		this._updateLineCount();
		this._updateHeight();
		return false;
	}

	public onConfigurationChanged(e: editorCommon.IConfigurationChangedEvent): boolean {
		if (e.lineHeight) {
			this._linesLayout.setLineHeight(this._configuration.editor.lineHeight);
		}
		if (e.layoutInfo) {
			this._scrollable.updateState({
				width: this._configuration.editor.layoutInfo.contentWidth,
				height: this._configuration.editor.layoutInfo.contentHeight
			});
			this._emitLayoutChangedEvent();
		}
		this._updateHeight();
		return false;
	}

	private _updateHeight(): void {
		this._scrollable.updateState({
			scrollHeight: this.getTotalHeight()
		});
	}

	// ---- end view event handlers

	// ---- Layouting logic

	public getCurrentViewport(): editorCommon.Viewport {
		const scrollState = this._scrollable.getState();
		return new editorCommon.Viewport(
			scrollState.scrollTop,
			scrollState.scrollLeft,
			scrollState.width,
			scrollState.height
		);
	}

	private _emitLayoutChangedEvent(): void {
		this._privateViewEventBus.emit(editorCommon.EventType.ViewLayoutChanged, this._configuration.editor.layoutInfo);
	}

	public emitLayoutChangedEvent(): void {
		this._emitLayoutChangedEvent();
	}

	private _computeScrollWidth(maxLineWidth: number, viewportWidth: number): number {
		let isViewportWrapping = this._configuration.editor.wrappingInfo.isViewportWrapping;
		if (!isViewportWrapping) {
			return Math.max(maxLineWidth + LayoutProvider.LINES_HORIZONTAL_EXTRA_PX, viewportWidth);
		}
		return Math.max(maxLineWidth, viewportWidth);
	}

	public onMaxLineWidthChanged(maxLineWidth: number): void {
		let newScrollWidth = this._computeScrollWidth(maxLineWidth, this.getCurrentViewport().width);
		this._scrollable.updateState({
			scrollWidth: newScrollWidth
		});

		// The height might depend on the fact that there is a horizontal scrollbar or not
		this._updateHeight();
	}

	// ---- view state

	public saveState(): editorCommon.IViewState {
		const scrollState = this._scrollable.getState();
		let scrollTop = scrollState.scrollTop;
		let firstLineNumberInViewport = this._linesLayout.getLineNumberAtOrAfterVerticalOffset(scrollTop);
		let whitespaceAboveFirstLine = this._linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(firstLineNumberInViewport);
		return {
			scrollTop: scrollTop,
			scrollTopWithoutViewZones: scrollTop - whitespaceAboveFirstLine,
			scrollLeft: scrollState.scrollLeft
		};
	}

	public restoreState(state: editorCommon.IViewState): void {
		let restoreScrollTop = state.scrollTop;
		if (typeof state.scrollTopWithoutViewZones === 'number' && !this._linesLayout.hasWhitespace()) {
			restoreScrollTop = state.scrollTopWithoutViewZones;
		}
		this._scrollable.updateState({
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

	/**
	 * Get the sum of heights for all objects and compute basically the `scrollHeight` for the editor content.
	 *
	 * Take into account the `scrollBeyondLastLine` and `reserveHorizontalScrollbarHeight` and produce a scrollHeight that is at least as large as `viewport`.height.
	 *
	 * @param viewport The viewport.
	 * @param reserveHorizontalScrollbarHeight The height of the horizontal scrollbar.
	 * @return Basically, the `scrollHeight` for the editor content.
	 */
	private _getTotalHeight(viewport: editorCommon.Viewport, reserveHorizontalScrollbarHeight: number): number {
		var totalLinesHeight = this._linesLayout.getLinesTotalHeight();

		if (this._configuration.editor.viewInfo.scrollBeyondLastLine) {
			totalLinesHeight += viewport.height - this._configuration.editor.lineHeight;
		} else {
			totalLinesHeight += reserveHorizontalScrollbarHeight;
		}

		return Math.max(viewport.height, totalLinesHeight);
	}

	public getTotalHeight(): number {
		const scrollState = this._scrollable.getState();
		let reserveHorizontalScrollbarHeight = 0;
		if (scrollState.scrollWidth > scrollState.width) {
			if (this._configuration.editor.viewInfo.scrollbar.horizontal !== ScrollbarVisibility.Hidden) {
				reserveHorizontalScrollbarHeight = this._configuration.editor.viewInfo.scrollbar.horizontalScrollbarSize;
			}
		}
		return this._getTotalHeight(this.getCurrentViewport(), reserveHorizontalScrollbarHeight);
	}
	public getWhitespaceAtVerticalOffset(verticalOffset: number): editorCommon.IViewWhitespaceViewportData {
		return this._linesLayout.getWhitespaceAtVerticalOffset(verticalOffset);
	}
	public getLinesViewportData(): IPartialViewLinesViewportData {
		const visibleBox = this.getCurrentViewport();
		return this._linesLayout.getLinesViewportData(visibleBox.top, visibleBox.top + visibleBox.height);
	}
	public getWhitespaceViewportData(): editorCommon.IViewWhitespaceViewportData[] {
		const visibleBox = this.getCurrentViewport();
		return this._linesLayout.getWhitespaceViewportData(visibleBox.top, visibleBox.top + visibleBox.height);
	}
	public getWhitespaces(): editorCommon.IEditorWhitespace[] {
		return this._linesLayout.getWhitespaces();
	}

	// ---- IScrollingProvider


	public getScrollWidth(): number {
		const scrollState = this._scrollable.getState();
		return scrollState.scrollWidth;
	}
	public getScrollLeft(): number {
		const scrollState = this._scrollable.getState();
		return scrollState.scrollLeft;
	}
	public getScrollHeight(): number {
		const scrollState = this._scrollable.getState();
		return scrollState.scrollHeight;
	}
	public getScrollTop(): number {
		const scrollState = this._scrollable.getState();
		return scrollState.scrollTop;
	}

	public setScrollPosition(position: editorCommon.INewScrollPosition): void {
		this._scrollable.updateState(position);
	}
	public getScrolledTopFromAbsoluteTop(top: number): number {
		const scrollState = this._scrollable.getState();
		return top - scrollState.scrollTop;
	}

	public getOverviewRulerInsertData(): { parent: HTMLElement; insertBefore: HTMLElement; } {
		let layoutInfo = this._scrollManager.getOverviewRulerLayoutInfo();
		return {
			parent: layoutInfo.parent,
			insertBefore: layoutInfo.insertBefore
		};
	}
	public getScrollbarContainerDomNode(): HTMLElement {
		return this._scrollManager.getScrollbarContainerDomNode();
	}
	public delegateVerticalScrollbarMouseDown(browserEvent: MouseEvent): void {
		this._scrollManager.delegateVerticalScrollbarMouseDown(browserEvent);
	}
	public renderScrollbar(): void {
		this._scrollManager.renderScrollbar();
	}
}
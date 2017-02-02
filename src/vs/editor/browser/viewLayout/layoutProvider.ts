/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IDisposable } from 'vs/base/common/lifecycle';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { LinesLayout } from 'vs/editor/common/viewLayout/linesLayout';
import { ViewEventHandler } from 'vs/editor/common/viewModel/viewEventHandler';
import { ScrollManager } from 'vs/editor/browser/viewLayout/scrollManager';
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
	 * Returns the height in pixels for `lineNumber`.
	 */
	heightInPxForLine(lineNumber: number): number;

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

	private configuration: editorCommon.IConfiguration;
	private privateViewEventBus: IViewEventBus;
	private model: IViewModel;
	private scrollManager: ScrollManager;
	private linesLayout: LinesLayout;

	constructor(configuration: editorCommon.IConfiguration, model: IViewModel, privateViewEventBus: IViewEventBus, linesContent: HTMLElement, viewDomNode: HTMLElement, overflowGuardDomNode: HTMLElement) {
		super();

		this.configuration = configuration;
		this.privateViewEventBus = privateViewEventBus;
		this.model = model;

		this.scrollManager = new ScrollManager(configuration, privateViewEventBus, linesContent, viewDomNode, overflowGuardDomNode);

		this.configuration.setMaxLineNumber(this.model.getMaxLineNumber());

		this.linesLayout = new LinesLayout(configuration, this.model.getLineCount());

		this._updateHeight();
	}

	public dispose(): void {
		this.scrollManager.dispose();
	}

	private updateLineCount(): void {
		this.configuration.setMaxLineNumber(this.model.getMaxLineNumber());
	}

	// ---- begin view event handlers

	public onZonesChanged(): boolean {
		this._updateHeight();
		return false;
	}

	public onModelFlushed(): boolean {
		this.linesLayout.onModelFlushed(this.model.getLineCount());
		this.updateLineCount();
		this._updateHeight();
		return false;
	}

	public onModelLinesDeleted(e: editorCommon.IViewLinesDeletedEvent): boolean {
		this.linesLayout.onModelLinesDeleted(e);
		this.updateLineCount();
		this._updateHeight();
		return false;
	}

	public onModelLinesInserted(e: editorCommon.IViewLinesInsertedEvent): boolean {
		this.linesLayout.onModelLinesInserted(e);
		this.updateLineCount();
		this._updateHeight();
		return false;
	}

	public onConfigurationChanged(e: editorCommon.IConfigurationChangedEvent): boolean {
		this.linesLayout.onConfigurationChanged(e);
		if (e.layoutInfo) {
			this.scrollManager.onLayoutInfoChanged();
			this._emitLayoutChangedEvent();
		}
		this._updateHeight();
		return false;
	}

	private _updateHeight(): void {
		this.scrollManager.setScrollHeight(this.getTotalHeight());
	}

	// ---- end view event handlers

	// ---- Layouting logic

	public getCurrentViewport(): editorCommon.Viewport {
		return new editorCommon.Viewport(
			this.scrollManager.getScrollTop(),
			this.scrollManager.getScrollLeft(),
			this.scrollManager.getWidth(),
			this.scrollManager.getHeight()
		);
	}

	private _emitLayoutChangedEvent(): void {
		this.privateViewEventBus.emit(editorCommon.EventType.ViewLayoutChanged, this.configuration.editor.layoutInfo);
	}

	public emitLayoutChangedEvent(): void {
		this._emitLayoutChangedEvent();
	}

	private _computeScrollWidth(maxLineWidth: number, viewportWidth: number): number {
		let isViewportWrapping = this.configuration.editor.wrappingInfo.isViewportWrapping;
		if (!isViewportWrapping) {
			return Math.max(maxLineWidth + LayoutProvider.LINES_HORIZONTAL_EXTRA_PX, viewportWidth);
		}
		return Math.max(maxLineWidth, viewportWidth);
	}

	public onMaxLineWidthChanged(maxLineWidth: number): void {
		let newScrollWidth = this._computeScrollWidth(maxLineWidth, this.getCurrentViewport().width);
		this.scrollManager.setScrollWidth(newScrollWidth);

		// The height might depend on the fact that there is a horizontal scrollbar or not
		this._updateHeight();
	}

	// ---- view state

	public saveState(): editorCommon.IViewState {
		let scrollTop = this.scrollManager.getScrollTop();
		let firstLineNumberInViewport = this.linesLayout.getLineNumberAtOrAfterVerticalOffset(scrollTop);
		let whitespaceAboveFirstLine = this.linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(firstLineNumberInViewport);
		return {
			scrollTop: scrollTop,
			scrollTopWithoutViewZones: scrollTop - whitespaceAboveFirstLine,
			scrollLeft: this.scrollManager.getScrollLeft()
		};
	}

	public restoreState(state: editorCommon.IViewState): void {
		let restoreScrollTop = state.scrollTop;
		if (typeof state.scrollTopWithoutViewZones === 'number' && !this.linesLayout.hasWhitespace()) {
			restoreScrollTop = state.scrollTopWithoutViewZones;
		}
		this.scrollManager.setScrollPosition({
			scrollLeft: state.scrollLeft,
			scrollTop: restoreScrollTop
		});
	}

	// ---- IVerticalLayoutProvider

	public addWhitespace(afterLineNumber: number, ordinal: number, height: number): number {
		return this.linesLayout.insertWhitespace(afterLineNumber, ordinal, height);
	}
	public changeWhitespace(id: number, newAfterLineNumber: number, newHeight: number): boolean {
		return this.linesLayout.changeWhitespace(id, newAfterLineNumber, newHeight);
	}
	public removeWhitespace(id: number): boolean {
		return this.linesLayout.removeWhitespace(id);
	}
	public getVerticalOffsetForLineNumber(lineNumber: number): number {
		return this.linesLayout.getVerticalOffsetForLineNumber(lineNumber);
	}
	public heightInPxForLine(lineNumber: number): number {
		return this.linesLayout.getHeightForLineNumber(lineNumber);
	}
	public isAfterLines(verticalOffset: number): boolean {
		return this.linesLayout.isAfterLines(verticalOffset);
	}
	public getLineNumberAtVerticalOffset(verticalOffset: number): number {
		return this.linesLayout.getLineNumberAtOrAfterVerticalOffset(verticalOffset);
	}
	public getTotalHeight(): number {
		let reserveHorizontalScrollbarHeight = 0;
		if (this.scrollManager.getScrollWidth() > this.scrollManager.getWidth()) {
			if (this.configuration.editor.viewInfo.scrollbar.horizontal !== ScrollbarVisibility.Hidden) {
				reserveHorizontalScrollbarHeight = this.configuration.editor.viewInfo.scrollbar.horizontalScrollbarSize;
			}
		}
		return this.linesLayout.getTotalHeight(this.getCurrentViewport(), reserveHorizontalScrollbarHeight);
	}
	public getWhitespaceAtVerticalOffset(verticalOffset: number): editorCommon.IViewWhitespaceViewportData {
		return this.linesLayout.getWhitespaceAtVerticalOffset(verticalOffset);
	}
	public getLinesViewportData(): IPartialViewLinesViewportData {
		return this.linesLayout.getLinesViewportData(this.getCurrentViewport());
	}
	public getWhitespaceViewportData(): editorCommon.IViewWhitespaceViewportData[] {
		return this.linesLayout.getWhitespaceViewportData(this.getCurrentViewport());
	}
	public getWhitespaces(): editorCommon.IEditorWhitespace[] {
		return this.linesLayout.getWhitespaces();
	}

	// ---- IScrollingProvider

	public getOverviewRulerInsertData(): { parent: HTMLElement; insertBefore: HTMLElement; } {
		let layoutInfo = this.scrollManager.getOverviewRulerLayoutInfo();
		return {
			parent: layoutInfo.parent,
			insertBefore: layoutInfo.insertBefore
		};
	}
	public getScrollbarContainerDomNode(): HTMLElement {
		return this.scrollManager.getScrollbarContainerDomNode();
	}
	public delegateVerticalScrollbarMouseDown(browserEvent: MouseEvent): void {
		this.scrollManager.delegateVerticalScrollbarMouseDown(browserEvent);
	}
	public getScrollWidth(): number {
		return this.scrollManager.getScrollWidth();
	}
	public getScrollLeft(): number {
		return this.scrollManager.getScrollLeft();
	}
	public getScrollHeight(): number {
		return this.scrollManager.getScrollHeight();
	}
	public getScrollTop(): number {
		return this.scrollManager.getScrollTop();
	}

	public setScrollPosition(position: editorCommon.INewScrollPosition): void {
		this.scrollManager.setScrollPosition(position);
	}
	public getScrolledTopFromAbsoluteTop(top: number): number {
		return top - this.scrollManager.getScrollTop();
	}

	public renderScrollbar(): void {
		this.scrollManager.renderScrollbar();
	}
}
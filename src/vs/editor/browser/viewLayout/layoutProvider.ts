/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IDisposable} from 'vs/base/common/lifecycle';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {EditorScrollable} from 'vs/editor/common/viewLayout/editorScrollable';
import {LinesLayout} from 'vs/editor/common/viewLayout/linesLayout';
import {ViewEventHandler} from 'vs/editor/common/viewModel/viewEventHandler';
import {ILayoutProvider} from 'vs/editor/browser/editorBrowser';
import {ScrollManager} from 'vs/editor/browser/viewLayout/scrollManager';

export class LayoutProvider extends ViewEventHandler implements IDisposable, ILayoutProvider, editorCommon.IWhitespaceManager {

	static LINES_HORIZONTAL_EXTRA_PX = 30;

	private configuration: editorCommon.IConfiguration;
	private privateViewEventBus:editorCommon.IViewEventBus;
	private model:editorCommon.IViewModel;
	private scrollManager:ScrollManager;
	private linesLayout: LinesLayout;
	private scrollable: EditorScrollable;

	constructor(configuration:editorCommon.IConfiguration, model:editorCommon.IViewModel, privateViewEventBus:editorCommon.IViewEventBus, linesContent:HTMLElement, viewDomNode:HTMLElement, overflowGuardDomNode:HTMLElement) {
		super();

		this.configuration = configuration;
		this.privateViewEventBus = privateViewEventBus;
		this.model = model;

		this.scrollable = new EditorScrollable();
		this.scrollable.setWidth(this.configuration.editor.layoutInfo.contentWidth);
		this.scrollable.setHeight(this.configuration.editor.layoutInfo.contentHeight);
		this.scrollManager = new ScrollManager(this.scrollable, configuration, privateViewEventBus, linesContent, viewDomNode, overflowGuardDomNode);

		this.configuration.setLineCount(this.model.getLineCount());

		this.linesLayout = new LinesLayout(configuration, model);

		this._updateHeight();
	}

	public dispose(): void {
		this.scrollManager.dispose();
		this.scrollable.dispose();
	}

	private updateLineCount(): void {
		this.configuration.setLineCount(this.model.getLineCount());
	}

	// ---- begin view event handlers

	public onZonesChanged(): boolean {
		this._updateHeight();
		return false;
	}

	public onModelFlushed(): boolean {
		this.linesLayout.onModelFlushed();
		this.updateLineCount();
		this._updateHeight();
		return false;
	}

	public onModelLinesDeleted(e:editorCommon.IViewLinesDeletedEvent): boolean {
		this.linesLayout.onModelLinesDeleted(e);
		this.updateLineCount();
		this._updateHeight();
		return false;
	}

	public onModelLinesInserted(e:editorCommon.IViewLinesInsertedEvent): boolean {
		this.linesLayout.onModelLinesInserted(e);
		this.updateLineCount();
		this._updateHeight();
		return false;
	}

	public onConfigurationChanged(e:editorCommon.IConfigurationChangedEvent): boolean {
		if (e.layoutInfo) {
			this.scrollable.setWidth(this.configuration.editor.layoutInfo.contentWidth);
			this.scrollable.setHeight(this.configuration.editor.layoutInfo.contentHeight);
			this.scrollManager.onSizeProviderLayoutChanged();
			this._emitLayoutChangedEvent();
		}
		this._updateHeight();
		return false;
	}

	private _updateHeight(): void {
		var oldScrollHeight = this.scrollable.getScrollHeight();
		this.scrollable.setScrollHeight(this.getTotalHeight());
		var newScrollHeight = this.scrollable.getScrollHeight();
		if (oldScrollHeight !== newScrollHeight) {
			this.privateViewEventBus.emit(editorCommon.EventType.ViewScrollHeightChanged, newScrollHeight);
		}
	}

	// ---- end view event handlers

	// ---- Layouting logic

	public getCurrentViewport(): editorCommon.IViewport {
		return {
			top: this.scrollable.getScrollTop(),
			left: this.scrollable.getScrollLeft(),
			width: this.configuration.editor.layoutInfo.contentWidth,
			height: this.configuration.editor.layoutInfo.contentHeight
		};
	}

	public getCenteredViewLineNumberInViewport(): number {
		return this.linesLayout.getCenteredLineInViewport(this.getCurrentViewport());
	}

	private _emitLayoutChangedEvent(): void {
		this.privateViewEventBus.emit(editorCommon.EventType.ViewLayoutChanged, this.configuration.editor.layoutInfo);
	}

	public emitLayoutChangedEvent(): void {
		this._emitLayoutChangedEvent();
	}

	private _computeScrollWidth(maxLineWidth:number, viewportWidth:number): number {
		var isViewportWrapping = this.configuration.editor.wrappingInfo.isViewportWrapping;
		if (!isViewportWrapping) {
			return Math.max(maxLineWidth + LayoutProvider.LINES_HORIZONTAL_EXTRA_PX, viewportWidth);
		}
		return Math.max(maxLineWidth, viewportWidth);
	}

	public onMaxLineWidthChanged(maxLineWidth:number): void {
		var newScrollWidth = this._computeScrollWidth(maxLineWidth, this.getCurrentViewport().width);

		var oldScrollWidth = this.scrollable.getScrollWidth();
		this.scrollable.setScrollWidth(newScrollWidth);
		newScrollWidth = this.scrollable.getScrollWidth();

		if (newScrollWidth !== oldScrollWidth) {
			this.privateViewEventBus.emit(editorCommon.EventType.ViewScrollWidthChanged, newScrollWidth);
			// The height might depend on the fact that there is a horizontal scrollbar or not
			this._updateHeight();
		}
	}

	// ---- view state

	public saveState(): editorCommon.IViewState {
		var scrollTop = this.scrollable.getScrollTop();
		var firstLineNumberInViewport = this.linesLayout.getLineNumberAtOrAfterVerticalOffset(scrollTop);
		var whitespaceAboveFirstLine = this.linesLayout.getWhitespaceAccumulatedHeightBeforeLineNumber(firstLineNumberInViewport);
		return {
			scrollTop: scrollTop,
			scrollTopWithoutViewZones: scrollTop - whitespaceAboveFirstLine,
			scrollLeft: this.scrollable.getScrollLeft()
		};
	}

	public restoreState(state:editorCommon.IViewState): void {
		var restoreScrollTop = state.scrollTop;
		if (typeof state.scrollTopWithoutViewZones === 'number' && !this.linesLayout.hasWhitespace()) {
			restoreScrollTop = state.scrollTopWithoutViewZones;
		}
		this.scrollable.setScrollTop(restoreScrollTop);
		this.scrollable.setScrollLeft(state.scrollLeft);
	}


	// ---- IVerticalLayoutProvider

	public addWhitespace(afterLineNumber:number, ordinal:number, height:number): number {
		return this.linesLayout.insertWhitespace(afterLineNumber, ordinal, height);
	}
	public changeWhitespace(id:number, newAfterLineNumber:number, newHeight:number): boolean {
		return this.linesLayout.changeWhitespace(id, newAfterLineNumber, newHeight);
	}
	public removeWhitespace(id:number): boolean {
		return this.linesLayout.removeWhitespace(id);
	}
	public getVerticalOffsetForLineNumber(lineNumber:number): number {
		return this.linesLayout.getVerticalOffsetForLineNumber(lineNumber);
	}
	public heightInPxForLine(lineNumber:number): number {
		return this.linesLayout.getHeightForLineNumber(lineNumber);
	}
	public isAfterLines(verticalOffset:number): boolean {
		return this.linesLayout.isAfterLines(verticalOffset);
	}
	public getLineNumberAtVerticalOffset(verticalOffset:number): number {
		return this.linesLayout.getLineNumberAtOrAfterVerticalOffset(verticalOffset);
	}
	public getTotalHeight(): number {
		var reserveHorizontalScrollbarHeight = 0;
		if (this.scrollable.getScrollWidth() > this.scrollable.getWidth()) {
			reserveHorizontalScrollbarHeight = this.configuration.editor.scrollbar.horizontalScrollbarSize;
		}
		return this.linesLayout.getTotalHeight(this.getCurrentViewport(), reserveHorizontalScrollbarHeight);
	}
	public getWhitespaceAtVerticalOffset(verticalOffset:number): editorCommon.IViewWhitespaceViewportData {
		return this.linesLayout.getWhitespaceAtVerticalOffset(verticalOffset);
	}
	public getLinesViewportData(): editorCommon.IViewLinesViewportData {
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
		var layoutInfo = this.scrollManager.getOverviewRulerLayoutInfo();
		return {
			parent: layoutInfo.parent,
			insertBefore: layoutInfo.insertBefore
		};
	}
	public getScrollbarContainerDomNode(): HTMLElement {
		return this.scrollManager.getScrollbarContainerDomNode();
	}
	public delegateVerticalScrollbarMouseDown(browserEvent:MouseEvent): void {
		this.scrollManager.delegateVerticalScrollbarMouseDown(browserEvent);
	}
	public getScrollHeight(): number {
		return this.scrollable.getScrollHeight();
	}
	public getScrollWidth(): number {
		return this.scrollable.getScrollWidth();
	}
	public getScrollLeft(): number {
		return this.scrollable.getScrollLeft();
	}
	public setScrollLeft(scrollLeft:number): void {
		this.scrollable.setScrollLeft(scrollLeft);
	}
	public getScrollTop(): number {
		return this.scrollable.getScrollTop();
	}
	public setScrollTop(scrollTop:number): void {
		this.scrollable.setScrollTop(scrollTop);
	}
	public getScrolledTopFromAbsoluteTop(top:number): number {
		return top - this.scrollable.getScrollTop();
	}
}
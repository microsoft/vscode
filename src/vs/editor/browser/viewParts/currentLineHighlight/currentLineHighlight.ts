/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./currentLineHighlight';
import { DynamicViewOverlay } from 'vs/editor/browser/view/dynamicViewOverlay';
import { editorLineHighlight, editorLineHighlightBorder } from 'vs/editor/common/core/editorColorRegistry';
import { RenderingContext } from 'vs/editor/browser/view/renderingContext';
import { ViewContext } from 'vs/editor/common/viewModel/viewContext';
import * as viewEvents from 'vs/editor/common/viewEvents';
import * as arrays from 'vs/base/common/arrays';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { Selection } from 'vs/editor/common/core/selection';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { isHighContrast } from 'vs/platform/theme/common/theme';
import { Position } from 'vs/editor/common/core/position';

export abstract class AbstractLineHighlightOverlay extends DynamicViewOverlay {
	private readonly _context: ViewContext;
	protected _renderLineHighlight: 'none' | 'gutter' | 'line' | 'all';
	protected _wordWrap: boolean;
	protected _contentLeft: number;
	protected _contentWidth: number;
	protected _selectionIsEmpty: boolean;
	protected _renderLineHighlightOnlyWhenFocus: boolean;
	protected _focused: boolean;
	/**
	 * Unique sorted list of view line numbers which have cursors sitting on them.
	 */
	private _cursorLineNumbers: number[];
	private _selections: Selection[];
	private _renderData: string[] | null;

	constructor(context: ViewContext) {
		super();
		this._context = context;

		const options = this._context.configuration.options;
		const layoutInfo = options.get(EditorOption.layoutInfo);
		this._renderLineHighlight = options.get(EditorOption.renderLineHighlight);
		this._renderLineHighlightOnlyWhenFocus = options.get(EditorOption.renderLineHighlightOnlyWhenFocus);
		this._wordWrap = layoutInfo.isViewportWrapping;
		this._contentLeft = layoutInfo.contentLeft;
		this._contentWidth = layoutInfo.contentWidth;
		this._selectionIsEmpty = true;
		this._focused = false;
		this._cursorLineNumbers = [1];
		this._selections = [new Selection(1, 1, 1, 1)];
		this._renderData = null;

		this._context.addEventHandler(this);
	}

	public override dispose(): void {
		this._context.removeEventHandler(this);
		super.dispose();
	}

	private _readFromSelections(): boolean {
		let hasChanged = false;

		const lineNumbers = new Set<number>();
		for (const selection of this._selections) {
			lineNumbers.add(selection.positionLineNumber);
		}
		const cursorsLineNumbers = Array.from(lineNumbers);
		cursorsLineNumbers.sort((a, b) => a - b);
		if (!arrays.equals(this._cursorLineNumbers, cursorsLineNumbers)) {
			this._cursorLineNumbers = cursorsLineNumbers;
			hasChanged = true;
		}

		const selectionIsEmpty = this._selections.every(s => s.isEmpty());
		if (this._selectionIsEmpty !== selectionIsEmpty) {
			this._selectionIsEmpty = selectionIsEmpty;
			hasChanged = true;
		}

		return hasChanged;
	}

	// --- begin event handlers
	public override onThemeChanged(e: viewEvents.ViewThemeChangedEvent): boolean {
		return this._readFromSelections();
	}
	public override onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		const options = this._context.configuration.options;
		const layoutInfo = options.get(EditorOption.layoutInfo);
		this._renderLineHighlight = options.get(EditorOption.renderLineHighlight);
		this._renderLineHighlightOnlyWhenFocus = options.get(EditorOption.renderLineHighlightOnlyWhenFocus);
		this._wordWrap = layoutInfo.isViewportWrapping;
		this._contentLeft = layoutInfo.contentLeft;
		this._contentWidth = layoutInfo.contentWidth;
		return true;
	}
	public override onCursorStateChanged(e: viewEvents.ViewCursorStateChangedEvent): boolean {
		this._selections = e.selections;
		return this._readFromSelections();
	}
	public override onFlushed(e: viewEvents.ViewFlushedEvent): boolean {
		return true;
	}
	public override onLinesDeleted(e: viewEvents.ViewLinesDeletedEvent): boolean {
		return true;
	}
	public override onLinesInserted(e: viewEvents.ViewLinesInsertedEvent): boolean {
		return true;
	}
	public override onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		return e.scrollWidthChanged || e.scrollTopChanged;
	}
	public override onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boolean {
		return true;
	}
	public override onFocusChanged(e: viewEvents.ViewFocusChangedEvent): boolean {
		if (!this._renderLineHighlightOnlyWhenFocus) {
			return false;
		}

		this._focused = e.isFocused;
		return true;
	}
	// --- end event handlers

	public prepareRender(ctx: RenderingContext): void {
		if (!this._shouldRenderThis()) {
			this._renderData = null;
			return;
		}
		const visibleStartLineNumber = ctx.visibleRange.startLineNumber;
		const visibleEndLineNumber = ctx.visibleRange.endLineNumber;

		// initialize renderData
		const renderData: string[] = [];
		for (let lineNumber = visibleStartLineNumber; lineNumber <= visibleEndLineNumber; lineNumber++) {
			const lineIndex = lineNumber - visibleStartLineNumber;
			renderData[lineIndex] = '';
		}

		if (this._wordWrap) {
			// do a first pass to render wrapped lines
			const renderedLineWrapped = this._renderOne(ctx, false);
			for (const cursorLineNumber of this._cursorLineNumbers) {

				const coordinatesConverter = this._context.viewModel.coordinatesConverter;
				const modelLineNumber = coordinatesConverter.convertViewPositionToModelPosition(new Position(cursorLineNumber, 1)).lineNumber;
				const firstViewLineNumber = coordinatesConverter.convertModelPositionToViewPosition(new Position(modelLineNumber, 1)).lineNumber;
				const lastViewLineNumber = coordinatesConverter.convertModelPositionToViewPosition(new Position(modelLineNumber, this._context.viewModel.model.getLineMaxColumn(modelLineNumber))).lineNumber;

				const firstLine = Math.max(firstViewLineNumber, visibleStartLineNumber);
				const lastLine = Math.min(lastViewLineNumber, visibleEndLineNumber);
				for (let lineNumber = firstLine; lineNumber <= lastLine; lineNumber++) {
					const lineIndex = lineNumber - visibleStartLineNumber;
					renderData[lineIndex] = renderedLineWrapped;
				}
			}
		}

		// do a second pass to render exact lines
		const renderedLineExact = this._renderOne(ctx, true);
		for (const cursorLineNumber of this._cursorLineNumbers) {
			if (cursorLineNumber < visibleStartLineNumber || cursorLineNumber > visibleEndLineNumber) {
				continue;
			}
			const lineIndex = cursorLineNumber - visibleStartLineNumber;
			renderData[lineIndex] = renderedLineExact;
		}

		this._renderData = renderData;
	}

	public render(startLineNumber: number, lineNumber: number): string {
		if (!this._renderData) {
			return '';
		}
		const lineIndex = lineNumber - startLineNumber;
		if (lineIndex >= this._renderData.length) {
			return '';
		}
		return this._renderData[lineIndex];
	}

	protected _shouldRenderInMargin(): boolean {
		return (
			(this._renderLineHighlight === 'gutter' || this._renderLineHighlight === 'all')
			&& (!this._renderLineHighlightOnlyWhenFocus || this._focused)
		);
	}

	protected _shouldRenderInContent(): boolean {
		return (
			(this._renderLineHighlight === 'line' || this._renderLineHighlight === 'all')
			&& this._selectionIsEmpty
			&& (!this._renderLineHighlightOnlyWhenFocus || this._focused)
		);
	}

	protected abstract _shouldRenderThis(): boolean;
	protected abstract _shouldRenderOther(): boolean;
	protected abstract _renderOne(ctx: RenderingContext, exact: boolean): string;
}

export class CurrentLineHighlightOverlay extends AbstractLineHighlightOverlay {

	protected _renderOne(ctx: RenderingContext, exact: boolean): string {
		const className = 'current-line' + (this._shouldRenderInMargin() ? ' current-line-both' : '') + (exact ? ' current-line-exact' : '');
		return `<div class="${className}" style="width:${Math.max(ctx.scrollWidth, this._contentWidth)}px;"></div>`;
	}
	protected _shouldRenderThis(): boolean {
		return this._shouldRenderInContent();
	}
	protected _shouldRenderOther(): boolean {
		return this._shouldRenderInMargin();
	}
}

export class CurrentLineMarginHighlightOverlay extends AbstractLineHighlightOverlay {
	protected _renderOne(ctx: RenderingContext, exact: boolean): string {
		const className = 'current-line' + (this._shouldRenderInMargin() ? ' current-line-margin' : '') + (this._shouldRenderOther() ? ' current-line-margin-both' : '') + (this._shouldRenderInMargin() && exact ? ' current-line-exact-margin' : '');
		return `<div class="${className}" style="width:${this._contentLeft}px"></div>`;
	}
	protected _shouldRenderThis(): boolean {
		return true;
	}
	protected _shouldRenderOther(): boolean {
		return this._shouldRenderInContent();
	}
}

registerThemingParticipant((theme, collector) => {
	const lineHighlight = theme.getColor(editorLineHighlight);
	if (lineHighlight) {
		collector.addRule(`.monaco-editor .view-overlays .current-line { background-color: ${lineHighlight}; }`);
		collector.addRule(`.monaco-editor .margin-view-overlays .current-line-margin { background-color: ${lineHighlight}; border: none; }`);
	}
	if (!lineHighlight || lineHighlight.isTransparent() || theme.defines(editorLineHighlightBorder)) {
		const lineHighlightBorder = theme.getColor(editorLineHighlightBorder);
		if (lineHighlightBorder) {
			collector.addRule(`.monaco-editor .view-overlays .current-line-exact { border: 2px solid ${lineHighlightBorder}; }`);
			collector.addRule(`.monaco-editor .margin-view-overlays .current-line-exact-margin { border: 2px solid ${lineHighlightBorder}; }`);
			if (isHighContrast(theme.type)) {
				collector.addRule(`.monaco-editor .view-overlays .current-line-exact { border-width: 1px; }`);
				collector.addRule(`.monaco-editor .margin-view-overlays .current-line-exact-margin { border-width: 1px; }`);
			}
		}
	}
});

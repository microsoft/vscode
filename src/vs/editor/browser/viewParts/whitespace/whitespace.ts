/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./whitespace';
import { DynamicViewOverlay } from 'vs/editor/browser/view/dynamicViewOverlay';
import { Selection } from 'vs/editor/common/core/selection';
import { RenderingContext } from 'vs/editor/browser/view/renderingContext';
import { ViewContext } from 'vs/editor/common/viewModel/viewContext';
import * as viewEvents from 'vs/editor/common/viewEvents';
import { ViewLineData } from 'vs/editor/common/viewModel';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { IEditorConfiguration } from 'vs/editor/common/config/editorConfiguration';
import * as strings from 'vs/base/common/strings';
import { CharCode } from 'vs/base/common/charCode';
import { LineRange } from 'vs/editor/common/viewLayout/viewLineRenderer';
import { Position } from 'vs/editor/common/core/position';

export class WhitespaceOverlay extends DynamicViewOverlay {

	private readonly _context: ViewContext;
	private _options: WhitespaceOptions;
	private _selection: Selection[];
	private _renderResult: string[] | null;

	constructor(context: ViewContext) {
		super();
		this._context = context;
		this._options = new WhitespaceOptions(this._context.configuration);
		this._selection = [];
		this._renderResult = null;
		this._context.addEventHandler(this);
	}

	public override dispose(): void {
		this._context.removeEventHandler(this);
		this._renderResult = null;
		super.dispose();
	}

	// --- begin event handlers

	public override onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		const newOptions = new WhitespaceOptions(this._context.configuration);
		if (this._options.equals(newOptions)) {
			return false;
		}
		this._options = newOptions;
		return true;
	}
	public override onCursorStateChanged(e: viewEvents.ViewCursorStateChangedEvent): boolean {
		this._selection = e.selections;
		if (this._options.renderWhitespace === 'selection') {
			return true;
		}
		return false;
	}
	public override onDecorationsChanged(e: viewEvents.ViewDecorationsChangedEvent): boolean {
		return true;
	}
	public override onFlushed(e: viewEvents.ViewFlushedEvent): boolean {
		return true;
	}
	public override onLinesChanged(e: viewEvents.ViewLinesChangedEvent): boolean {
		return true;
	}
	public override onLinesDeleted(e: viewEvents.ViewLinesDeletedEvent): boolean {
		return true;
	}
	public override onLinesInserted(e: viewEvents.ViewLinesInsertedEvent): boolean {
		return true;
	}
	public override onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		return e.scrollTopChanged;
	}
	public override onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boolean {
		return true;
	}
	// --- end event handlers

	public prepareRender(ctx: RenderingContext): void {
		if (this._options.renderWhitespace === 'none') {
			this._renderResult = null;
			return;
		}

		const startLineNumber = ctx.visibleRange.startLineNumber;
		const endLineNumber = ctx.visibleRange.endLineNumber;
		const lineCount = endLineNumber - startLineNumber + 1;
		const needed = new Array<boolean>(lineCount);
		for (let i = 0; i < lineCount; i++) {
			needed[i] = true;
		}
		const viewportData = this._context.viewModel.getMinimapLinesRenderingData(ctx.viewportData.startLineNumber, ctx.viewportData.endLineNumber, needed);

		this._renderResult = [];
		for (let lineNumber = ctx.viewportData.startLineNumber; lineNumber <= ctx.viewportData.endLineNumber; lineNumber++) {
			const lineIndex = lineNumber - ctx.viewportData.startLineNumber;
			const lineData = viewportData.data[lineIndex]!;

			let selectionsOnLine: LineRange[] | null = null;
			if (this._options.renderWhitespace === 'selection') {
				const selections = this._selection;
				for (const selection of selections) {

					if (selection.endLineNumber < lineNumber || selection.startLineNumber > lineNumber) {
						// Selection does not intersect line
						continue;
					}

					const startColumn = (selection.startLineNumber === lineNumber ? selection.startColumn : lineData.minColumn);
					const endColumn = (selection.endLineNumber === lineNumber ? selection.endColumn : lineData.maxColumn);

					if (startColumn < endColumn) {
						if (!selectionsOnLine) {
							selectionsOnLine = [];
						}
						selectionsOnLine.push(new LineRange(startColumn - 1, endColumn - 1));
					}
				}
			}

			this._renderResult[lineIndex] = this._applyRenderWhitespace(ctx, lineNumber, selectionsOnLine, lineData);
		}
	}

	private _applyRenderWhitespace(ctx: RenderingContext, lineNumber: number, selections: LineRange[] | null, lineData: ViewLineData): string {
		if (this._options.renderWhitespace === 'selection' && !selections) {
			return '';
		}

		const lineContent = lineData.content;
		const len = (this._options.stopRenderingLineAfter === -1 ? lineContent.length : Math.min(this._options.stopRenderingLineAfter, lineContent.length));
		const continuesWithWrappedLine = lineData.continuesWithWrappedLine;
		const fauxIndentLength = lineData.minColumn - 1;
		const onlyBoundary = (this._options.renderWhitespace === 'boundary');
		const onlyTrailing = (this._options.renderWhitespace === 'trailing');
		const lineHeight = this._options.lineHeight;
		const middotWidth = this._options.middotWidth;
		const wsmiddotWidth = this._options.wsmiddotWidth;
		const spaceWidth = this._options.spaceWidth;
		const wsmiddotDiff = Math.abs(wsmiddotWidth - spaceWidth);
		const middotDiff = Math.abs(middotWidth - spaceWidth);

		// U+2E31 - WORD SEPARATOR MIDDLE DOT
		// U+00B7 - MIDDLE DOT
		const renderSpaceCharCode = (wsmiddotDiff < middotDiff ? 0x2E31 : 0xB7);

		const canUseHalfwidthRightwardsArrow = this._options.canUseHalfwidthRightwardsArrow;

		let result: string = '';

		let lineIsEmptyOrWhitespace = false;
		let firstNonWhitespaceIndex = strings.firstNonWhitespaceIndex(lineContent);
		let lastNonWhitespaceIndex: number;
		if (firstNonWhitespaceIndex === -1) {
			lineIsEmptyOrWhitespace = true;
			firstNonWhitespaceIndex = len;
			lastNonWhitespaceIndex = len;
		} else {
			lastNonWhitespaceIndex = strings.lastNonWhitespaceIndex(lineContent);
		}

		let currentSelectionIndex = 0;
		let currentSelection = selections && selections[currentSelectionIndex];
		for (let charIndex = fauxIndentLength; charIndex < len; charIndex++) {
			const chCode = lineContent.charCodeAt(charIndex);

			if (currentSelection && charIndex >= currentSelection.endOffset) {
				currentSelectionIndex++;
				currentSelection = selections && selections[currentSelectionIndex];
			}

			if (chCode !== CharCode.Tab && chCode !== CharCode.Space) {
				continue;
			}

			if (onlyTrailing && !lineIsEmptyOrWhitespace && charIndex <= lastNonWhitespaceIndex) {
				// If rendering only trailing whitespace, check that the charIndex points to trailing whitespace.
				continue;
			}

			if (onlyBoundary && charIndex >= firstNonWhitespaceIndex && charIndex <= lastNonWhitespaceIndex && chCode === CharCode.Space) {
				// rendering only boundary whitespace
				const prevChCode = (charIndex - 1 >= 0 ? lineContent.charCodeAt(charIndex - 1) : CharCode.Null);
				const nextChCode = (charIndex + 1 < len ? lineContent.charCodeAt(charIndex + 1) : CharCode.Null);
				if (prevChCode !== CharCode.Space && nextChCode !== CharCode.Space) {
					continue;
				}
			}

			if (onlyBoundary && continuesWithWrappedLine && charIndex === len - 1) {
				const prevCharCode = (charIndex - 1 >= 0 ? lineContent.charCodeAt(charIndex - 1) : CharCode.Null);
				const isSingleTrailingSpace = (chCode === CharCode.Space && (prevCharCode !== CharCode.Space && prevCharCode !== CharCode.Tab));
				if (isSingleTrailingSpace) {
					continue;
				}
			}

			if (selections && (!currentSelection || currentSelection.startOffset > charIndex || currentSelection.endOffset <= charIndex)) {
				// If rendering whitespace on selection, check that the charIndex falls within a selection
				continue;
			}

			const visibleRange = ctx.visibleRangeForPosition(new Position(lineNumber, charIndex + 1));
			if (!visibleRange) {
				continue;
			}

			if (chCode === CharCode.Tab) {
				result += `<div class="mwh" style="left:${visibleRange.left}px;height:${lineHeight}px;">${canUseHalfwidthRightwardsArrow ? String.fromCharCode(0xFFEB) : String.fromCharCode(0x2192)}</div>`;
			} else {
				result += `<div class="mwh" style="left:${visibleRange.left}px;height:${lineHeight}px;">${String.fromCharCode(renderSpaceCharCode)}</div>`;
			}
		}

		return result;
	}

	public render(startLineNumber: number, lineNumber: number): string {
		if (!this._renderResult) {
			return '';
		}
		const lineIndex = lineNumber - startLineNumber;
		if (lineIndex < 0 || lineIndex >= this._renderResult.length) {
			return '';
		}
		return this._renderResult[lineIndex];
	}
}

class WhitespaceOptions {

	public readonly renderWhitespace: 'none' | 'boundary' | 'selection' | 'trailing' | 'all';
	public readonly spaceWidth: number;
	public readonly middotWidth: number;
	public readonly wsmiddotWidth: number;
	public readonly canUseHalfwidthRightwardsArrow: boolean;
	public readonly lineHeight: number;
	public readonly stopRenderingLineAfter: number;

	constructor(config: IEditorConfiguration) {
		const options = config.options;
		const fontInfo = options.get(EditorOption.fontInfo);
		if (options.get(EditorOption.experimentalWhitespaceRendering)) {
			this.renderWhitespace = options.get(EditorOption.renderWhitespace);
		} else {
			// whitespace is rendered in the view line
			this.renderWhitespace = 'none';
		}
		this.spaceWidth = fontInfo.spaceWidth;
		this.middotWidth = fontInfo.middotWidth;
		this.wsmiddotWidth = fontInfo.wsmiddotWidth;
		this.canUseHalfwidthRightwardsArrow = fontInfo.canUseHalfwidthRightwardsArrow;
		this.lineHeight = options.get(EditorOption.lineHeight);
		this.stopRenderingLineAfter = options.get(EditorOption.stopRenderingLineAfter);
	}

	public equals(other: WhitespaceOptions): boolean {
		return (
			this.renderWhitespace === other.renderWhitespace
			&& this.spaceWidth === other.spaceWidth
			&& this.middotWidth === other.middotWidth
			&& this.wsmiddotWidth === other.wsmiddotWidth
			&& this.canUseHalfwidthRightwardsArrow === other.canUseHalfwidthRightwardsArrow
			&& this.lineHeight === other.lineHeight
			&& this.stopRenderingLineAfter === other.stopRenderingLineAfter
		);
	}
}

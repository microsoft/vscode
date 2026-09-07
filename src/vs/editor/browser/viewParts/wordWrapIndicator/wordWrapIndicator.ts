/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './wordWrapIndicator.css';
import { DynamicViewOverlay } from '../../view/dynamicViewOverlay.js';
import { RenderingContext } from '../../view/renderingContext.js';
import { ViewContext } from '../../../common/viewModel/viewContext.js';
import * as viewEvents from '../../../common/viewEvents.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { IEditorConfiguration } from '../../../common/config/editorConfiguration.js';
import { Position } from '../../../common/core/position.js';
import { TextDirection } from '../../../common/model.js';

/**
 * U+21A9 - LEFTWARDS ARROW WITH HOOK, used on left-to-right lines.
 */
const WORD_WRAP_INDICATOR_LTR_CHAR_CODE = 0x21A9;

/**
 * U+21AA - RIGHTWARDS ARROW WITH HOOK, the mirror image of
 * {@link WORD_WRAP_INDICATOR_LTR_CHAR_CODE}, used on right-to-left lines.
 */
const WORD_WRAP_INDICATOR_RTL_CHAR_CODE = 0x21AA;

/**
 * The word wrap indicator overlay renders a small glyph at the end of every view line
 * which is soft wrapped, so that a wrapped line can be told apart from a real line break.
 */
export class WordWrapIndicatorOverlay extends DynamicViewOverlay {

	private readonly _context: ViewContext;
	private _options: WordWrapIndicatorOptions;
	private _renderResult: string[] | null;
	private _renderedStartLineNumber: number;
	private _renderedEndLineNumber: number;

	constructor(context: ViewContext) {
		super();
		this._context = context;
		this._options = new WordWrapIndicatorOptions(this._context.configuration);
		this._renderResult = null;
		this._renderedStartLineNumber = 1;
		this._renderedEndLineNumber = 0;
		this._context.addEventHandler(this);
	}

	public override dispose(): void {
		this._context.removeEventHandler(this);
		this._renderResult = null;
		super.dispose();
	}

	/**
	 * Whether the overlay paints anything at all. While it does not, every view event can be
	 * answered with `false`, so the view is never asked to repaint on this overlay's behalf.
	 */
	private get _isEnabled(): boolean {
		return this._options.wordWrapIndicator && this._options.isWrapping;
	}

	// --- begin event handlers

	public override onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		const newOptions = new WordWrapIndicatorOptions(this._context.configuration);
		const optionsChanged = !this._options.equals(newOptions);
		this._options = newOptions;
		if (optionsChanged) {
			return true;
		}
		// Both move the measured end of a view line without changing the options read above.
		return this._isEnabled && (e.hasChanged(EditorOption.layoutInfo) || e.hasChanged(EditorOption.fontInfo));
	}
	public override onDecorationsChanged(e: viewEvents.ViewDecorationsChangedEvent): boolean {
		return this._isEnabled;
	}
	public override onFlushed(e: viewEvents.ViewFlushedEvent): boolean {
		return this._isEnabled;
	}
	public override onLineMappingChanged(e: viewEvents.ViewLineMappingChangedEvent): boolean {
		// Which lines continue with a wrapped line is decided by the line mapping.
		return this._isEnabled;
	}
	public override onLinesChanged(e: viewEvents.ViewLinesChangedEvent): boolean {
		return this._isEnabled;
	}
	public override onLinesDeleted(e: viewEvents.ViewLinesDeletedEvent): boolean {
		return this._isEnabled;
	}
	public override onLinesInserted(e: viewEvents.ViewLinesInsertedEvent): boolean {
		return this._isEnabled;
	}
	public override onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		return this._isEnabled && e.scrollTopChanged;
	}
	public override onTokensChanged(e: viewEvents.ViewTokensChangedEvent): boolean {
		if (!this._isEnabled) {
			return false;
		}
		// Token styles (bold, italic) change the measured width of a line.
		return e.ranges.some(range => range.fromLineNumber <= this._renderedEndLineNumber && this._renderedStartLineNumber <= range.toLineNumber);
	}
	public override onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boolean {
		return this._isEnabled;
	}
	// --- end event handlers

	public prepareRender(ctx: RenderingContext): void {
		if (!this._isEnabled) {
			this._renderResult = null;
			this._renderedStartLineNumber = 1;
			this._renderedEndLineNumber = 0;
			return;
		}

		this._renderedStartLineNumber = ctx.viewportData.startLineNumber;
		this._renderedEndLineNumber = ctx.viewportData.endLineNumber;
		this._renderResult = [];
		for (let lineNumber = this._renderedStartLineNumber; lineNumber <= this._renderedEndLineNumber; lineNumber++) {
			const lineIndex = lineNumber - this._renderedStartLineNumber;
			this._renderResult[lineIndex] = this._renderLine(ctx, lineNumber);
		}
	}

	/**
	 * Renders the glyph for `lineNumber`, anchored at the visual end of its text. On a right-to-left
	 * line that end is the line's left edge, so the glyph is mirrored and pulled back over the anchor
	 * by `wwi-rtl`, keeping it clear of the text in both directions.
	 */
	private _renderLine(ctx: RenderingContext, lineNumber: number): string {
		const lineData = ctx.viewportData.getViewLineRenderingData(lineNumber);
		if (!lineData.continuesWithWrappedLine) {
			// The line ends with a real line break, or is the last line of the model.
			return '';
		}
		const lineEnd = ctx.visibleRangeForPosition(new Position(lineNumber, lineData.maxColumn));
		if (!lineEnd || lineEnd.outsideRenderedLine) {
			// Past `stopRenderingLineAfter` the reported position is only an approximation.
			return '';
		}
		const isRTL = (lineData.textDirection === TextDirection.RTL);
		const charCode = isRTL ? WORD_WRAP_INDICATOR_RTL_CHAR_CODE : WORD_WRAP_INDICATOR_LTR_CHAR_CODE;
		const className = isRTL ? 'wwi wwi-rtl' : 'wwi';
		const lineHeight = ctx.getLineHeightForLineNumber(lineNumber);
		return `<div class="${className}" style="left:${lineEnd.left}px;height:${lineHeight}px;">${String.fromCharCode(charCode)}</div>`;
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

/**
 * The subset of the editor configuration the overlay reads, snapshotted so that a configuration
 * change can be told apart from one that leaves the rendered result untouched.
 */
class WordWrapIndicatorOptions {

	public readonly wordWrapIndicator: boolean;
	public readonly isWrapping: boolean;

	constructor(config: IEditorConfiguration) {
		const options = config.options;
		this.wordWrapIndicator = options.get(EditorOption.wordWrapIndicator);
		this.isWrapping = (options.get(EditorOption.wrappingInfo).wrappingColumn !== -1);
	}

	public equals(other: WordWrapIndicatorOptions): boolean {
		return (
			this.wordWrapIndicator === other.wordWrapIndicator
			&& this.isWrapping === other.isWrapping
		);
	}
}

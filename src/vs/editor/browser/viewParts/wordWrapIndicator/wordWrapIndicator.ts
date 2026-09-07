/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './wordWrapIndicator.css';
import { DynamicViewOverlay } from '../../view/dynamicViewOverlay.js';
import { RenderingContext } from '../../view/renderingContext.js';
import { ViewContext } from '../../../common/viewModel/viewContext.js';
import * as viewEvents from '../../../common/viewEvents.js';
import { EditorLayoutInfo, EditorOption } from '../../../common/config/editorOptions.js';
import { IEditorConfiguration } from '../../../common/config/editorConfiguration.js';
import { Position } from '../../../common/core/position.js';
import { FontInfo } from '../../../common/config/fontInfo.js';

/**
 * U+21A9 - LEFTWARDS ARROW WITH HOOK.
 */
const WORD_WRAP_INDICATOR_CHAR_CODE = 0x21A9;

/**
 * The word wrap indicator overlay renders a small glyph at the end of every view line
 * which is soft wrapped, so that a wrapped line can be told apart from a real line break.
 */
export class WordWrapIndicatorOverlay extends DynamicViewOverlay {

	private readonly _context: ViewContext;
	private _options: WordWrapIndicatorOptions;
	private _renderResult: string[] | null;
	private _renderRange: {
		startLineNumber: number;
		endLineNumber: number;
	};

	constructor(context: ViewContext) {
		super();
		this._context = context;
		this._options = new WordWrapIndicatorOptions(this._context.configuration);
		this._renderResult = null;
		this._renderRange = { startLineNumber: -1, endLineNumber: -1 };
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
		if (!this._isEnabled) {
			return false;
		}
		const newOptions = new WordWrapIndicatorOptions(this._context.configuration);
		const optionsChanged = !this._options.equals(newOptions);
		this._options = newOptions;
		return optionsChanged;
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
		return e.ranges.some(range => range.fromLineNumber <= this._renderRange.endLineNumber && this._renderRange.startLineNumber <= range.toLineNumber);
	}
	public override onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boolean {
		return this._isEnabled;
	}
	// --- end event handlers

	public prepareRender(ctx: RenderingContext): void {
		if (!this._isEnabled) {
			this._renderResult = null;
			this._renderRange.startLineNumber = -1;
			this._renderRange.endLineNumber = -1;
			return;
		}
		this._renderRange.startLineNumber = ctx.viewportData.startLineNumber;
		this._renderRange.endLineNumber = ctx.viewportData.endLineNumber;
		this._renderResult = [];
		for (let lineNumber = this._renderRange.startLineNumber; lineNumber <= this._renderRange.endLineNumber; lineNumber++) {
			const lineIndex = lineNumber - this._renderRange.startLineNumber;
			this._renderResult[lineIndex] = this._renderLine(ctx, lineNumber);
		}
	}

	/**
	 * Renders the glyph for `lineNumber`, anchored at the end of its text.
	 */
	private _renderLine(ctx: RenderingContext, lineNumber: number): string {
		const lineData = ctx.viewportData.getViewLineRenderingData(lineNumber);
		if (!lineData.continuesWithWrappedLine) {
			// The line ends with a real line break, or is the last line of the model.
			return '';
		}
		const lineEnd = ctx.visibleRangeForPosition(new Position(lineNumber, lineData.maxColumn));
		if (!lineEnd || lineEnd.outsideRenderedLine) {
			return '';
		}
		const lineHeight = ctx.getLineHeightForLineNumber(lineNumber);
		return `<div class="wwi" style="left:${lineEnd.left}px;height:${lineHeight}px;">${String.fromCharCode(WORD_WRAP_INDICATOR_CHAR_CODE)}</div>`;
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
	public readonly layoutInfo: EditorLayoutInfo;
	public readonly fontInfo: FontInfo;

	constructor(config: IEditorConfiguration) {
		const options = config.options;
		this.wordWrapIndicator = options.get(EditorOption.wordWrapIndicator);
		this.isWrapping = (options.get(EditorOption.wrappingInfo).wrappingColumn !== -1);
		this.layoutInfo = options.get(EditorOption.layoutInfo);
		this.fontInfo = options.get(EditorOption.fontInfo);
	}

	public equals(other: WordWrapIndicatorOptions): boolean {
		return (
			this.wordWrapIndicator === other.wordWrapIndicator
			&& this.isWrapping === other.isWrapping
			&& this.layoutInfo === other.layoutInfo
			&& this.fontInfo === other.fontInfo
		);
	}
}

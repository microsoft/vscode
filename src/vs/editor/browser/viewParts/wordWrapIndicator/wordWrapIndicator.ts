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

/**
 * U+21A9 - LEFTWARDS ARROW WITH HOOK.
 */
const WORD_WRAP_INDICATOR_CHAR_CODE = 0x21A9;

/**
 * The word wrap indicator overlay renders a small glyph at the right edge of every view line
 * which is soft wrapped, so that a wrapped line can be told apart from a real line break.
 */
export class WordWrapIndicatorOverlay extends DynamicViewOverlay {

	private readonly _context: ViewContext;
	private _options: WordWrapIndicatorOptions;
	private _renderResult: string[] | null;

	constructor(context: ViewContext) {
		super();
		this._context = context;
		this._options = new WordWrapIndicatorOptions(this._context.configuration);
		this._renderResult = null;
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
		return this._isEnabled && (e.scrollTopChanged || e.scrollLeftChanged);
	}
	public override onTokensChanged(e: viewEvents.ViewTokensChangedEvent): boolean {
		return false;
	}
	public override onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boolean {
		return this._isEnabled;
	}
	// --- end event handlers

	public prepareRender(ctx: RenderingContext): void {
		if (!this._isEnabled) {
			this._renderResult = null;
			return;
		}
		this._renderResult = [];
		for (let lineNumber = ctx.viewportData.startLineNumber; lineNumber <= ctx.viewportData.endLineNumber; lineNumber++) {
			const lineIndex = lineNumber - ctx.viewportData.startLineNumber;
			this._renderResult[lineIndex] = this._renderLine(ctx, lineNumber);
		}
	}

	/**
	 * Renders the glyph for `lineNumber`, anchored at the right edge of the viewport.
	 */
	private _renderLine(ctx: RenderingContext, lineNumber: number): string {
		const lineData = ctx.viewportData.getViewLineRenderingData(lineNumber);
		if (!lineData.continuesWithWrappedLine) {
			// The line ends with a real line break, or is the last line of the model.
			return '';
		}
		const left = ctx.scrollLeft + this._options.indicatorViewportLeft;
		const lineHeight = ctx.getLineHeightForLineNumber(lineNumber);
		return `<div class="wwi" style="left:${left}px;height:${lineHeight}px;">${String.fromCharCode(WORD_WRAP_INDICATOR_CHAR_CODE)}</div>`;
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
	public readonly indicatorViewportLeft: number;

	constructor(config: IEditorConfiguration) {
		const options = config.options;
		const layoutInfo = options.get(EditorOption.layoutInfo);
		const fontInfo = options.get(EditorOption.fontInfo);
		this.wordWrapIndicator = options.get(EditorOption.wordWrapIndicator);
		this.isWrapping = (options.get(EditorOption.wrappingInfo).wrappingColumn !== -1);
		this.indicatorViewportLeft = Math.max(0, layoutInfo.contentWidth - layoutInfo.verticalScrollbarWidth - fontInfo.typicalHalfwidthCharacterWidth);
	}

	public equals(other: WordWrapIndicatorOptions): boolean {
		return (
			this.wordWrapIndicator === other.wordWrapIndicator
			&& this.isWrapping === other.isWrapping
			&& this.indicatorViewportLeft === other.indicatorViewportLeft
		);
	}
}

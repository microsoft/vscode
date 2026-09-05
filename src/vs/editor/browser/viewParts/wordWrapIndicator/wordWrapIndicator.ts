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
 * U+21A9 - LEFTWARDS ARROW WITH HOOK
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

	// --- begin event handlers

	public override onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		const newOptions = new WordWrapIndicatorOptions(this._context.configuration);
		if (this._options.equals(newOptions)) {
			return e.hasChanged(EditorOption.layoutInfo);
		}
		this._options = newOptions;
		return true;
	}
	public override onDecorationsChanged(e: viewEvents.ViewDecorationsChangedEvent): boolean {
		return true;
	}
	public override onFlushed(e: viewEvents.ViewFlushedEvent): boolean {
		return true;
	}
	public override onLineMappingChanged(e: viewEvents.ViewLineMappingChangedEvent): boolean {
		// Which lines continue with a wrapped line is decided by the line mapping.
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
	public override onTokensChanged(e: viewEvents.ViewTokensChangedEvent): boolean {
		// Token styles (bold, italic) change the measured width of a line.
		return true;
	}
	public override onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boolean {
		return true;
	}
	// --- end event handlers

	public prepareRender(ctx: RenderingContext): void {
		if (this._options.wordWrapIndicator === 'none' || !this._options.isWrapping) {
			this._renderResult = null;
			return;
		}

		this._renderResult = [];
		for (let lineNumber = ctx.viewportData.startLineNumber; lineNumber <= ctx.viewportData.endLineNumber; lineNumber++) {
			const lineIndex = lineNumber - ctx.viewportData.startLineNumber;
			this._renderResult[lineIndex] = this._renderLine(ctx, lineNumber);
		}
	}

	private _renderLine(ctx: RenderingContext, lineNumber: number): string {
		const lineData = this._context.viewModel.getViewLineRenderingData(lineNumber);
		if (!lineData.continuesWithWrappedLine) {
			// The line ends with a real line break, or is the last line of the model.
			return '';
		}
		if (lineData.textDirection === TextDirection.RTL) {
			// The glyph points the wrong way for right-to-left lines.
			return '';
		}
		const visibleRange = ctx.visibleRangeForPosition(new Position(lineNumber, lineData.maxColumn));
		if (!visibleRange) {
			return '';
		}
		const lineHeight = ctx.getLineHeightForLineNumber(lineNumber);
		return `<div class="wwi" style="left:${visibleRange.left}px;height:${lineHeight}px;">${String.fromCharCode(WORD_WRAP_INDICATOR_CHAR_CODE)}</div>`;
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

class WordWrapIndicatorOptions {

	public readonly wordWrapIndicator: 'none' | 'end';
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

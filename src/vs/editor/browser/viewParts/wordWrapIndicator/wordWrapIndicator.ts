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

/**
 * The word wrap indicator overlay will display a visual indicator at the end of 
 * lines that continue with a wrapped line.
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
		if (!this._options.renderWordWrapIndicator) {
			this._renderResult = null;
			return;
		}

		this._renderResult = [];
		for (let lineNumber = ctx.viewportData.startLineNumber; lineNumber <= ctx.viewportData.endLineNumber; lineNumber++) {
			const lineIndex = lineNumber - ctx.viewportData.startLineNumber;
			const lineData = this._context.viewModel.getViewLineRenderingData(lineNumber);

			if (lineData.continuesWithWrappedLine) {
				// This line wraps to the next line, so we should render an indicator
				this._renderResult[lineIndex] = this._renderWrapIndicator(ctx, lineNumber, lineData.maxColumn);
			} else {
				this._renderResult[lineIndex] = '';
			}
		}
	}

	private _renderWrapIndicator(ctx: RenderingContext, lineNumber: number, maxColumn: number): string {
		const lineHeight = ctx.getLineHeightForLineNumber(lineNumber);
		
		// Get the position at the end of the line (maxColumn is 1-based)
		const visibleRange = ctx.visibleRangeForPosition(new Position(lineNumber, maxColumn));
		if (!visibleRange) {
			return '';
		}

		// Unicode character ↩ (U+21A9)
		const wrapSymbol = '\u21A9';
		
		return `<div class="wwi" style="left:${visibleRange.left}px;height:${lineHeight}px;">${wrapSymbol}</div>`;
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

	public readonly renderWordWrapIndicator: boolean;
	public readonly lineHeight: number;

	constructor(config: IEditorConfiguration) {
		const options = config.options;
		this.renderWordWrapIndicator = options.get(EditorOption.renderWordWrapIndicator);
		this.lineHeight = options.get(EditorOption.lineHeight);
	}

	public equals(other: WordWrapIndicatorOptions): boolean {
		return (
			this.renderWordWrapIndicator === other.renderWordWrapIndicator
			&& this.lineHeight === other.lineHeight
		);
	}
}

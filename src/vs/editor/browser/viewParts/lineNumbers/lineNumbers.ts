/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./lineNumbers';
import * as platform from 'vs/base/common/platform';
import { DynamicViewOverlay } from 'vs/editor/browser/view/dynamicViewOverlay';
import { RenderLineNumbersType, EditorOption } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { RenderingContext } from 'vs/editor/browser/view/renderingContext';
import { ViewContext } from 'vs/editor/common/viewModel/viewContext';
import * as viewEvents from 'vs/editor/common/viewEvents';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { editorDimmedLineNumber, editorLineNumbers } from 'vs/editor/common/core/editorColorRegistry';

export class LineNumbersOverlay extends DynamicViewOverlay {

	public static readonly CLASS_NAME = 'line-numbers';

	private readonly _context: ViewContext;

	private _lineHeight!: number;
	private _renderLineNumbers!: RenderLineNumbersType;
	private _renderCustomLineNumbers!: ((lineNumber: number) => string) | null;
	private _renderFinalNewline!: 'off' | 'on' | 'dimmed';
	private _lineNumbersLeft!: number;
	private _lineNumbersWidth!: number;
	private _lastCursorModelPosition: Position;
	private _renderResult: string[] | null;
	private _activeLineNumber: number;

	constructor(context: ViewContext) {
		super();
		this._context = context;

		this._readConfig();

		this._lastCursorModelPosition = new Position(1, 1);
		this._renderResult = null;
		this._activeLineNumber = 1;
		this._context.addEventHandler(this);
	}

	private _readConfig(): void {
		const options = this._context.configuration.options;
		this._lineHeight = options.get(EditorOption.lineHeight);
		const lineNumbers = options.get(EditorOption.lineNumbers);
		this._renderLineNumbers = lineNumbers.renderType;
		this._renderCustomLineNumbers = lineNumbers.renderFn;
		this._renderFinalNewline = options.get(EditorOption.renderFinalNewline);
		const layoutInfo = options.get(EditorOption.layoutInfo);
		this._lineNumbersLeft = layoutInfo.lineNumbersLeft;
		this._lineNumbersWidth = layoutInfo.lineNumbersWidth;
	}

	public override dispose(): void {
		this._context.removeEventHandler(this);
		this._renderResult = null;
		super.dispose();
	}

	// --- begin event handlers

	public override onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		this._readConfig();
		return true;
	}
	public override onCursorStateChanged(e: viewEvents.ViewCursorStateChangedEvent): boolean {
		const primaryViewPosition = e.selections[0].getPosition();
		this._lastCursorModelPosition = this._context.viewModel.coordinatesConverter.convertViewPositionToModelPosition(primaryViewPosition);

		let shouldRender = false;
		if (this._activeLineNumber !== primaryViewPosition.lineNumber) {
			this._activeLineNumber = primaryViewPosition.lineNumber;
			shouldRender = true;
		}
		if (this._renderLineNumbers === RenderLineNumbersType.Relative || this._renderLineNumbers === RenderLineNumbersType.Interval) {
			shouldRender = true;
		}
		return shouldRender;
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

	private _getLineRenderLineNumber(viewLineNumber: number): string {
		const modelPosition = this._context.viewModel.coordinatesConverter.convertViewPositionToModelPosition(new Position(viewLineNumber, 1));
		if (modelPosition.column !== 1) {
			return '';
		}
		const modelLineNumber = modelPosition.lineNumber;

		if (this._renderCustomLineNumbers) {
			return this._renderCustomLineNumbers(modelLineNumber);
		}

		if (this._renderLineNumbers === RenderLineNumbersType.Relative) {
			const diff = Math.abs(this._lastCursorModelPosition.lineNumber - modelLineNumber);
			if (diff === 0) {
				return '<span class="relative-current-line-number">' + modelLineNumber + '</span>';
			}
			return String(diff);
		}

		if (this._renderLineNumbers === RenderLineNumbersType.Interval) {
			if (this._lastCursorModelPosition.lineNumber === modelLineNumber) {
				return String(modelLineNumber);
			}
			if (modelLineNumber % 10 === 0) {
				return String(modelLineNumber);
			}
			return '';
		}

		return String(modelLineNumber);
	}

	public prepareRender(ctx: RenderingContext): void {
		if (this._renderLineNumbers === RenderLineNumbersType.Off) {
			this._renderResult = null;
			return;
		}

		const lineHeightClassName = (platform.isLinux ? (this._lineHeight % 2 === 0 ? ' lh-even' : ' lh-odd') : '');
		const visibleStartLineNumber = ctx.visibleRange.startLineNumber;
		const visibleEndLineNumber = ctx.visibleRange.endLineNumber;

		const lineCount = this._context.viewModel.getLineCount();
		const output: string[] = [];
		for (let lineNumber = visibleStartLineNumber; lineNumber <= visibleEndLineNumber; lineNumber++) {
			const lineIndex = lineNumber - visibleStartLineNumber;

			const renderLineNumber = this._getLineRenderLineNumber(lineNumber);

			if (!renderLineNumber) {
				output[lineIndex] = '';
				continue;
			}

			let extraClassName = '';

			if (lineNumber === lineCount && this._context.viewModel.getLineLength(lineNumber) === 0) {
				// this is the last line
				if (this._renderFinalNewline === 'off') {
					output[lineIndex] = '';
					continue;
				}
				if (this._renderFinalNewline === 'dimmed') {
					extraClassName = ' dimmed-line-number';
				}
			}
			if (lineNumber === this._activeLineNumber) {
				extraClassName = ' active-line-number';
			}

			output[lineIndex] = (
				`<div class="${LineNumbersOverlay.CLASS_NAME}${lineHeightClassName}${extraClassName}" style="left:${this._lineNumbersLeft}px;width:${this._lineNumbersWidth}px;">${renderLineNumber}</div>`
			);
		}

		this._renderResult = output;
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

registerThemingParticipant((theme, collector) => {
	const editorLineNumbersColor = theme.getColor(editorLineNumbers);
	const editorDimmedLineNumberColor = theme.getColor(editorDimmedLineNumber);
	if (editorDimmedLineNumberColor) {
		collector.addRule(`.monaco-editor .line-numbers.dimmed-line-number { color: ${editorDimmedLineNumberColor}; }`);
	} else if (editorLineNumbersColor) {
		collector.addRule(`.monaco-editor .line-numbers.dimmed-line-number { color: ${editorLineNumbersColor.transparent(0.4)}; }`);
	}
});

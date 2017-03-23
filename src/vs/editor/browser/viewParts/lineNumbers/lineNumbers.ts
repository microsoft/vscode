/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./lineNumbers';
import { editorLineNumbers } from "vs/editor/common/view/editorColorRegistry";
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import * as platform from 'vs/base/common/platform';
import { DynamicViewOverlay } from 'vs/editor/browser/view/dynamicViewOverlay';
import { ClassNames } from 'vs/editor/browser/editorBrowser';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import { RenderingContext } from 'vs/editor/common/view/renderingContext';
import * as viewEvents from 'vs/editor/common/view/viewEvents';

export class LineNumbersOverlay extends DynamicViewOverlay {

	private _context: ViewContext;
	private _lineHeight: number;
	private _renderLineNumbers: boolean;
	private _renderRelativeLineNumbers: boolean;
	private _lineNumbersLeft: number;
	private _lineNumbersWidth: number;
	private _renderResult: string[];

	constructor(context: ViewContext) {
		super();
		this._context = context;
		this._lineHeight = this._context.configuration.editor.lineHeight;
		this._renderLineNumbers = this._context.configuration.editor.viewInfo.renderLineNumbers;
		this._renderRelativeLineNumbers = this._context.configuration.editor.viewInfo.renderRelativeLineNumbers;
		this._lineNumbersLeft = this._context.configuration.editor.layoutInfo.lineNumbersLeft;
		this._lineNumbersWidth = this._context.configuration.editor.layoutInfo.lineNumbersWidth;
		this._renderResult = null;
		this._context.addEventHandler(this);
	}

	public dispose(): void {
		this._context.removeEventHandler(this);
		this._context = null;
		this._renderResult = null;
	}

	// --- begin event handlers

	public onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		if (e.lineHeight) {
			this._lineHeight = this._context.configuration.editor.lineHeight;
		}
		if (e.viewInfo.renderLineNumbers) {
			this._renderLineNumbers = this._context.configuration.editor.viewInfo.renderLineNumbers;
		}
		if (e.viewInfo.renderRelativeLineNumbers) {
			this._renderRelativeLineNumbers = this._context.configuration.editor.viewInfo.renderRelativeLineNumbers;
		}
		if (e.layoutInfo) {
			this._lineNumbersLeft = this._context.configuration.editor.layoutInfo.lineNumbersLeft;
			this._lineNumbersWidth = this._context.configuration.editor.layoutInfo.lineNumbersWidth;
		}
		return true;
	}
	public onCursorPositionChanged(e: viewEvents.ViewCursorPositionChangedEvent): boolean {
		if (this._renderRelativeLineNumbers) {
			return true;
		}
		return false;
	}
	public onCursorSelectionChanged(e: viewEvents.ViewCursorSelectionChangedEvent): boolean {
		return false;
	}
	public onDecorationsChanged(e: viewEvents.ViewDecorationsChangedEvent): boolean {
		return false;
	}
	public onFlushed(e: viewEvents.ViewFlushedEvent): boolean {
		return true;
	}
	public onLinesChanged(e: viewEvents.ViewLinesChangedEvent): boolean {
		return true;
	}
	public onLinesDeleted(e: viewEvents.ViewLinesDeletedEvent): boolean {
		return true;
	}
	public onLinesInserted(e: viewEvents.ViewLinesInsertedEvent): boolean {
		return true;
	}
	public onRevealRangeRequest(e: viewEvents.ViewRevealRangeRequestEvent): boolean {
		return false;
	}
	public onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		return e.scrollTopChanged;
	}
	public onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boolean {
		return true;
	}

	// --- end event handlers

	public prepareRender(ctx: RenderingContext): void {
		if (!this._renderLineNumbers) {
			this._renderResult = null;
			return;
		}

		let lineHeightClassName = (platform.isLinux ? (this._lineHeight % 2 === 0 ? ' lh-even' : ' lh-odd') : '');
		let visibleStartLineNumber = ctx.visibleRange.startLineNumber;
		let visibleEndLineNumber = ctx.visibleRange.endLineNumber;
		let common = '<div class="' + ClassNames.LINE_NUMBERS + lineHeightClassName + '" style="left:' + this._lineNumbersLeft.toString() + 'px;width:' + this._lineNumbersWidth.toString() + 'px;">';

		let output: string[] = [];
		for (let lineNumber = visibleStartLineNumber; lineNumber <= visibleEndLineNumber; lineNumber++) {
			let lineIndex = lineNumber - visibleStartLineNumber;

			let renderLineNumber = this._context.model.getLineRenderLineNumber(lineNumber);
			if (renderLineNumber) {
				output[lineIndex] = (
					common
					+ renderLineNumber
					+ '</div>'
				);
			} else {
				output[lineIndex] = '';
			}
		}

		this._renderResult = output;
	}

	public render(startLineNumber: number, lineNumber: number): string {
		if (!this._renderResult) {
			return '';
		}
		let lineIndex = lineNumber - startLineNumber;
		if (lineIndex < 0 || lineIndex >= this._renderResult.length) {
			throw new Error('Unexpected render request');
		}
		return this._renderResult[lineIndex];
	}
}

// theming

registerThemingParticipant((theme, collector) => {
	let lineNumbers = theme.getColor(editorLineNumbers);
	if (lineNumbers) {
		collector.addRule(`.monaco-editor.${theme.selector} .line-numbers { color: ${lineNumbers}; }`);
	}
});
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./lineNumbers';
import * as platform from 'vs/base/common/platform';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {ViewEventHandler} from 'vs/editor/common/viewModel/viewEventHandler';
import {ClassNames, IDynamicViewOverlay, IRenderingContext, IViewContext} from 'vs/editor/browser/editorBrowser';

interface IRenderResult {
	[lineNumber:string]:string[];
}

export class LineNumbersOverlay extends ViewEventHandler implements IDynamicViewOverlay {

	private _context:IViewContext;
	private _lineNumbersLeft:number;
	private _lineNumbersWidth:number;
	private _renderResult:IRenderResult;

	constructor(context:IViewContext) {
		super();
		this._context = context;
		this._lineNumbersLeft = 0;
		this._lineNumbersWidth = 0;
		this._renderResult = null;
		this._context.addEventHandler(this);
	}

	public dispose(): void {
		this._context.removeEventHandler(this);
		this._context = null;
		this._renderResult = null;
	}

	// --- begin event handlers

	public onModelFlushed(): boolean {
		return true;
	}
	public onModelDecorationsChanged(e:editorCommon.IViewDecorationsChangedEvent): boolean {
		return false;
	}
	public onModelLinesDeleted(e:editorCommon.IViewLinesDeletedEvent): boolean {
		return true;
	}
	public onModelLineChanged(e:editorCommon.IViewLineChangedEvent): boolean {
		return true;
	}
	public onModelLinesInserted(e:editorCommon.IViewLinesInsertedEvent): boolean {
		return true;
	}
	public onCursorPositionChanged(e:editorCommon.IViewCursorPositionChangedEvent): boolean {
		return false;
	}
	public onCursorSelectionChanged(e:editorCommon.IViewCursorSelectionChangedEvent): boolean {
		return false;
	}
	public onCursorRevealRange(e:editorCommon.IViewRevealRangeEvent): boolean {
		return false;
	}
	public onConfigurationChanged(e:editorCommon.IConfigurationChangedEvent): boolean {
		return true;
	}
	public onLayoutChanged(layoutInfo:editorCommon.IEditorLayoutInfo): boolean {
		this._lineNumbersLeft = layoutInfo.lineNumbersLeft;
		this._lineNumbersWidth = layoutInfo.lineNumbersWidth;
		return true;
	}
	public onScrollChanged(e:editorCommon.IScrollEvent): boolean {
		return e.vertical;
	}
	public onZonesChanged(): boolean {
		return true;
	}
	public onScrollWidthChanged(scrollWidth:number): boolean {
		return false;
	}
	public onScrollHeightChanged(scrollHeight:number): boolean {
		return false;
	}

	// --- end event handlers

	public shouldCallRender2(ctx:IRenderingContext): boolean {
		if (!this.shouldRender) {
			return false;
		}
		this.shouldRender = false;

		if (!this._context.configuration.editor.lineNumbers) {
			this._renderResult = null;
			return false;
		}

		var output: IRenderResult = {};

		var lineHeightClassName = (platform.isLinux ? (this._context.configuration.editor.lineHeight % 2 === 0 ? ' lh-even': ' lh-odd') : '');
		var lineHeight = this._context.configuration.editor.lineHeight.toString(),
			lineNumber:number,
			renderLineNumber:string;

		var common = '<div class="' + ClassNames.LINE_NUMBERS + lineHeightClassName + '" style="left:' + this._lineNumbersLeft.toString() + 'px;width:' + this._lineNumbersWidth.toString() + 'px;height:' + lineHeight + 'px;">';

		for (lineNumber = ctx.visibleRange.startLineNumber; lineNumber <= ctx.visibleRange.endLineNumber; lineNumber++) {
			renderLineNumber = this._context.model.getLineRenderLineNumber(lineNumber);

			if (renderLineNumber) {
				var lineOutput:string[] = [
					common,
					this._context.model.getLineRenderLineNumber(lineNumber),
					'</div>'
				];

				output[lineNumber.toString()] = lineOutput;
			}
		}

		this._renderResult = output;

		return true;
	}

	public render2(lineNumber:number): string[] {
		if (this._renderResult && this._renderResult.hasOwnProperty(lineNumber.toString())) {
			return this._renderResult[lineNumber.toString()];
		}
		return null;
	}
}
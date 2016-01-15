/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./decorations';
import {ViewEventHandler} from 'vs/editor/common/viewModel/viewEventHandler';
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import EditorCommon = require('vs/editor/common/editorCommon');

interface IRenderResult {
	[lineNumber:string]:string[];
}

export class DecorationsOverlay extends ViewEventHandler implements EditorBrowser.IDynamicViewOverlay {

	private _context:EditorBrowser.IViewContext;
	private _renderResult:IRenderResult;

	constructor(context:EditorBrowser.IViewContext) {
		super();
		this._context = context;
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
	public onModelDecorationsChanged(e:EditorCommon.IViewDecorationsChangedEvent): boolean {
		return true;
	}
	public onModelLinesDeleted(e:EditorCommon.IViewLinesDeletedEvent): boolean {
		return true;
	}
	public onModelLineChanged(e:EditorCommon.IViewLineChangedEvent): boolean {
		return true;
	}
	public onModelLinesInserted(e:EditorCommon.IViewLinesInsertedEvent): boolean {
		return true;
	}
	public onCursorPositionChanged(e:EditorCommon.IViewCursorPositionChangedEvent): boolean {
		return false;
	}
	public onCursorSelectionChanged(e:EditorCommon.IViewCursorSelectionChangedEvent): boolean {
		return false;
	}
	public onCursorRevealRange(e:EditorCommon.IViewRevealRangeEvent): boolean {
		return false;
	}
	public onConfigurationChanged(e:EditorCommon.IConfigurationChangedEvent): boolean {
		return true;
	}
	public onLayoutChanged(layoutInfo:EditorCommon.IEditorLayoutInfo): boolean {
		return true;
	}
	public onScrollChanged(e:EditorCommon.IScrollEvent): boolean {
		return e.vertical;
	}
	public onZonesChanged(): boolean {
		return true;
	}
	public onScrollWidthChanged(scrollWidth:number): boolean {
		return true;
	}
	public onScrollHeightChanged(scrollHeight:number): boolean {
		return false;
	}

	// --- end event handlers

	public shouldCallRender2(ctx:EditorBrowser.IRenderingContext): boolean {
		if (!this.shouldRender) {
			return false;
		}
		this.shouldRender = false;

		var output: IRenderResult = {},
			lineOutput: string[],
			decorations = ctx.getDecorationsInViewport(),
			d:EditorCommon.IModelDecoration,
			rng:EditorCommon.IRange,
			linesVisibleRanges:EditorBrowser.LineVisibleRanges[],
			lineVisibleRanges:EditorBrowser.LineVisibleRanges,
			visibleRange:EditorBrowser.HorizontalRange,
			lineHeight = this._context.configuration.editor.lineHeight.toString(),
			i:number, lenI:number,
			j:number, lenJ:number,
			k:number, lenK:number,
			piecesCount = 0;

		for (i = 0, lenI = decorations.length; i < lenI; i++) {
			d = decorations[i];
			rng = d.range;

			if (!d.options.className) {
				continue;
			}

			if (d.options.isWholeLine) {

				for (j = rng.startLineNumber; j <= rng.endLineNumber; j++) {
					if (!ctx.lineIsVisible(j)) {
						continue;
					}
					if (output.hasOwnProperty(j.toString())) {
						lineOutput = output[j.toString()];
					} else {
						lineOutput = [];
						output[j.toString()] = lineOutput;
					}

					piecesCount++;
					lineOutput.push('<div class="cdr ');
					lineOutput.push(d.options.className);
					lineOutput.push('" style="left:0;width:100%;height:');
					lineOutput.push(lineHeight.toString());
					lineOutput.push('px;"></div>');
				}


			} else {
				linesVisibleRanges = ctx.linesVisibleRangesForRange(rng, false);
				if (linesVisibleRanges) {
					for (j = 0, lenJ = linesVisibleRanges.length; j < lenJ; j++) {
						lineVisibleRanges = linesVisibleRanges[j];

						if (output.hasOwnProperty(lineVisibleRanges.lineNumber.toString())) {
							lineOutput = output[lineVisibleRanges.lineNumber.toString()];
						} else {
							lineOutput = [];
							output[lineVisibleRanges.lineNumber.toString()] = lineOutput;
						}

						for (k = 0, lenK = lineVisibleRanges.ranges.length; k < lenK; k++) {
							visibleRange = lineVisibleRanges.ranges[k];

							piecesCount++;
							lineOutput.push('<div class="cdr ');
							lineOutput.push(d.options.className);
							lineOutput.push('" style="left:');
							lineOutput.push(visibleRange.left.toString());
							lineOutput.push('px;width:');
							lineOutput.push(visibleRange.width.toString());
							lineOutput.push('px;height:');
							lineOutput.push(lineHeight.toString());
							lineOutput.push('px;"></div>');
						}
					}
				}
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

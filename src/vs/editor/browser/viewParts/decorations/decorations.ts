/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./decorations';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {ViewEventHandler} from 'vs/editor/common/viewModel/viewEventHandler';
import {IDynamicViewOverlay, IRenderingContext, IViewContext} from 'vs/editor/browser/editorBrowser';

interface IRenderResult {
	[lineNumber:string]:string[];
}

export class DecorationsOverlay extends ViewEventHandler implements IDynamicViewOverlay {

	private _context:IViewContext;
	private _renderResult:IRenderResult;

	constructor(context:IViewContext) {
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
	public onModelDecorationsChanged(e:editorCommon.IViewDecorationsChangedEvent): boolean {
		return true;
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
		return true;
	}
	public onScrollChanged(e:editorCommon.IScrollEvent): boolean {
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

	public shouldCallRender2(ctx:IRenderingContext): boolean {
		if (!this.shouldRender) {
			return false;
		}
		this.shouldRender = false;

		let decorations = ctx.getDecorationsInViewport();

		// Keep only decorations with `className`
		decorations = decorations.filter(d => !!d.options.className);

		// Sort decorations for consistent render output
		decorations = decorations.sort((a, b) => {
			if (a.options.className < b.options.className) {
				return -1;
			}
			if (a.options.className > b.options.className) {
				return 1;
			}

			if (a.range.startLineNumber === b.range.startLineNumber) {
				if (a.range.startColumn === b.range.startColumn) {
					if (a.range.endLineNumber === b.range.endLineNumber) {
						return a.range.endColumn - b.range.endColumn;
					}
					return a.range.endLineNumber - b.range.endLineNumber;
				}
				return a.range.startColumn - b.range.startColumn;
			}
			return a.range.startLineNumber - b.range.startLineNumber;
		});

		// Render first whole line decorations and then regular decorations
		let output: IRenderResult = {};
		this._renderWholeLineDecorations(ctx, decorations, output);
		this._renderNormalDecorations(ctx, decorations, output);
		this._renderResult = output;

		return true;
	}

	private _renderWholeLineDecorations(ctx:IRenderingContext, decorations:editorCommon.IModelDecoration[], output: IRenderResult): void {
		let lineHeight = String(this._context.configuration.editor.lineHeight);

		for (let i = 0, lenI = decorations.length; i < lenI; i++) {
			let d = decorations[i];

			if (!d.options.isWholeLine) {
				continue;
			}

			let decorationOutput = [
				'<div class="cdr ',
				d.options.className,
				'" style="left:0;width:100%;height:',
				lineHeight,
				'px;"></div>'
			].join('');

			let startLineNumber = d.range.startLineNumber;
			let endLineNumber = d.range.endLineNumber;
			for (let j = startLineNumber; j <= endLineNumber; j++) {
				if (!ctx.lineIsVisible(j)) {
					continue;
				}

				let strLineNumber = String(j);
				if (output.hasOwnProperty(strLineNumber)) {
					output[strLineNumber].push(decorationOutput);
				} else {
					output[strLineNumber] = [decorationOutput];
				}
			}
		}
	}

	private _renderNormalDecorations(ctx:IRenderingContext, decorations:editorCommon.IModelDecoration[], output: IRenderResult): void {
		let lineHeight = String(this._context.configuration.editor.lineHeight);

		for (let i = 0, lenI = decorations.length; i < lenI; i++) {
			let d = decorations[i];

			if (d.options.isWholeLine) {
				continue;
			}
			let linesVisibleRanges = ctx.linesVisibleRangesForRange(d.range, false);
			if (!linesVisibleRanges) {
				continue;
			}

			let className = d.options.className;
			for (let j = 0, lenJ = linesVisibleRanges.length; j < lenJ; j++) {
				let lineVisibleRanges = linesVisibleRanges[j];

				let strLineNumber = String(lineVisibleRanges.lineNumber);
				let lineOutput: string[];
				if (output.hasOwnProperty(strLineNumber)) {
					lineOutput = output[strLineNumber];
				} else {
					lineOutput = [];
					output[strLineNumber] = lineOutput;
				}

				for (let k = 0, lenK = lineVisibleRanges.ranges.length; k < lenK; k++) {
					let visibleRange = lineVisibleRanges.ranges[k];

					lineOutput.push('<div class="cdr ');
					lineOutput.push(className);
					lineOutput.push('" style="left:');
					lineOutput.push(String(visibleRange.left));
					lineOutput.push('px;width:');
					lineOutput.push(String(visibleRange.width));
					lineOutput.push('px;height:');
					lineOutput.push(lineHeight);
					lineOutput.push('px;"></div>');
				}
			}
		}
	}

	public render2(lineNumber:number): string[] {
		if (this._renderResult && this._renderResult.hasOwnProperty(lineNumber.toString())) {
			return this._renderResult[lineNumber.toString()];
		}
		return null;
	}
}

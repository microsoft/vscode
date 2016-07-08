/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./decorations';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {DynamicViewOverlay} from 'vs/editor/browser/view/dynamicViewOverlay';
import {ViewContext} from 'vs/editor/common/view/viewContext';
import {IRenderingContext} from 'vs/editor/common/view/renderingContext';

export class DecorationsOverlay extends DynamicViewOverlay {

	private _context:ViewContext;
	private _lineHeight: number;
	private _renderResult: string[];

	constructor(context:ViewContext) {
		super();
		this._context = context;
		this._lineHeight = this._context.configuration.editor.lineHeight;
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
		if (e.lineHeight) {
			this._lineHeight = this._context.configuration.editor.lineHeight;
		}
		return true;
	}
	public onLayoutChanged(layoutInfo:editorCommon.EditorLayoutInfo): boolean {
		return true;
	}
	public onScrollChanged(e:editorCommon.IScrollEvent): boolean {
		return e.scrollTopChanged || e.scrollWidthChanged;
	}
	public onZonesChanged(): boolean {
		return true;
	}
	// --- end event handlers

	public prepareRender(ctx:IRenderingContext): void {
		if (!this.shouldRender()) {
			throw new Error('I did not ask to render!');
		}

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

		let visibleStartLineNumber = ctx.visibleRange.startLineNumber;
		let visibleEndLineNumber = ctx.visibleRange.endLineNumber;
		let output: string[] = [];
		for (let lineNumber = visibleStartLineNumber; lineNumber <= visibleEndLineNumber; lineNumber++) {
			let lineIndex = lineNumber - visibleStartLineNumber;
			output[lineIndex] = '';
		}

		// Render first whole line decorations and then regular decorations
		this._renderWholeLineDecorations(ctx, decorations, output);
		this._renderNormalDecorations(ctx, decorations, output);
		this._renderResult = output;
	}

	private _renderWholeLineDecorations(ctx:IRenderingContext, decorations:editorCommon.IModelDecoration[], output: string[]): void {
		let lineHeight = String(this._lineHeight);
		let visibleStartLineNumber = ctx.visibleRange.startLineNumber;
		let visibleEndLineNumber = ctx.visibleRange.endLineNumber;

		for (let i = 0, lenI = decorations.length; i < lenI; i++) {
			let d = decorations[i];

			if (!d.options.isWholeLine) {
				continue;
			}

			let decorationOutput = (
				'<div class="cdr '
				+ d.options.className
				+ '" style="left:0;width:100%;height:'
				+ lineHeight
				+ 'px;"></div>'
			);

			let startLineNumber = Math.max(d.range.startLineNumber, visibleStartLineNumber);
			let endLineNumber = Math.min(d.range.endLineNumber, visibleEndLineNumber);
			for (let j = startLineNumber; j <= endLineNumber; j++) {
				let lineIndex = j - visibleStartLineNumber;
				output[lineIndex] += decorationOutput;
			}
		}
	}

	private _renderNormalDecorations(ctx:IRenderingContext, decorations:editorCommon.IModelDecoration[], output: string[]): void {
		let lineHeight = String(this._lineHeight);
		let visibleStartLineNumber = ctx.visibleRange.startLineNumber;

		for (let i = 0, lenI = decorations.length; i < lenI; i++) {
			let d = decorations[i];

			if (d.options.isWholeLine) {
				continue;
			}
			let linesVisibleRanges = ctx.linesVisibleRangesForRange(d.range, /*TODO@Alex*/d.options.className === 'findMatch');
			if (!linesVisibleRanges) {
				continue;
			}

			let className = d.options.className;
			for (let j = 0, lenJ = linesVisibleRanges.length; j < lenJ; j++) {
				let lineVisibleRanges = linesVisibleRanges[j];
				let lineIndex = lineVisibleRanges.lineNumber - visibleStartLineNumber;

				for (let k = 0, lenK = lineVisibleRanges.ranges.length; k < lenK; k++) {
					let visibleRange = lineVisibleRanges.ranges[k];
					let decorationOutput = (
						'<div class="cdr '
						+ className
						+ '" style="left:'
						+ String(visibleRange.left)
						+ 'px;width:'
						+ String(visibleRange.width)
						+ 'px;height:'
						+ lineHeight
						+ 'px;"></div>'
					);
					output[lineIndex] += decorationOutput;
				}
			}
		}
	}

	public render(startLineNumber:number, lineNumber:number): string {
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

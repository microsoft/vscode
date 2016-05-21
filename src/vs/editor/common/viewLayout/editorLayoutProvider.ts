/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {EditorLayoutInfo, OverviewRulerPosition} from 'vs/editor/common/editorCommon';

export interface IEditorLayoutProviderOpts {
	outerWidth:number;
	outerHeight:number;

	showGlyphMargin:boolean;
	lineHeight:number;

	showLineNumbers:boolean;
	lineNumbersMinChars:number;
	lineDecorationsWidth:number;
	maxDigitWidth:number;

	lineCount: number;

	verticalScrollbarWidth:number;
	verticalScrollbarHasArrows:boolean;
	scrollbarArrowSize: number;
	horizontalScrollbarHeight:number;
}

export class EditorLayoutProvider {
	public static compute(_opts:IEditorLayoutProviderOpts): EditorLayoutInfo {
		const outerWidth = _opts.outerWidth|0;
		const outerHeight = _opts.outerHeight|0;
		const showGlyphMargin = Boolean(_opts.showGlyphMargin);
		const lineHeight = _opts.lineHeight|0;
		const showLineNumbers = Boolean(_opts.showLineNumbers);
		const lineNumbersMinChars = _opts.lineNumbersMinChars|0;
		const lineDecorationsWidth = _opts.lineDecorationsWidth|0;
		const maxDigitWidth = Number(_opts.maxDigitWidth);
		const lineCount = _opts.lineCount|0;
		const verticalScrollbarWidth = _opts.verticalScrollbarWidth|0;
		const verticalScrollbarHasArrows = Boolean(_opts.verticalScrollbarHasArrows);
		const scrollbarArrowSize = _opts.scrollbarArrowSize|0;
		const horizontalScrollbarHeight = _opts.horizontalScrollbarHeight|0;

		let lineNumbersWidth = 0;
		if (showLineNumbers) {
			let digitCount = Math.max(this.digitCount(lineCount), lineNumbersMinChars);
			lineNumbersWidth = Math.round(digitCount * maxDigitWidth);
		}

		let glyphMarginWidth = 0;
		if (showGlyphMargin) {
			glyphMarginWidth = lineHeight;
		}

		let contentWidth = outerWidth - glyphMarginWidth - lineNumbersWidth - lineDecorationsWidth;

		let glyphMarginLeft = 0;
		let lineNumbersLeft = glyphMarginLeft + glyphMarginWidth;
		let decorationsLeft = lineNumbersLeft + lineNumbersWidth;
		let contentLeft = decorationsLeft + lineDecorationsWidth;

		let verticalArrowSize = (verticalScrollbarHasArrows ? scrollbarArrowSize : 0);

		return new EditorLayoutInfo({
			width: outerWidth,
			height: outerHeight,

			glyphMarginLeft: glyphMarginLeft,
			glyphMarginWidth: glyphMarginWidth,
			glyphMarginHeight: outerHeight,

			lineNumbersLeft: lineNumbersLeft,
			lineNumbersWidth: lineNumbersWidth,
			lineNumbersHeight: outerHeight,

			decorationsLeft: decorationsLeft,
			decorationsWidth: lineDecorationsWidth,
			decorationsHeight: outerHeight,

			contentLeft: contentLeft,
			contentWidth: contentWidth,
			contentHeight: outerHeight,

			verticalScrollbarWidth: verticalScrollbarWidth,
			horizontalScrollbarHeight: horizontalScrollbarHeight,

			overviewRuler: new OverviewRulerPosition({
				top: verticalArrowSize,
				width: verticalScrollbarWidth,
				height: (outerHeight - 2 * verticalArrowSize),
				right: 0
			})
		});
	}

	private static digitCount(n:number): number {
		var r = 0;
		while (n) {
			n = Math.floor(n / 10);
			r++;
		}
		return r ? r : 1;
	}
}

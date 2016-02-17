/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IEditorLayoutInfo} from 'vs/editor/common/editorCommon';

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

	public static compute(opts:IEditorLayoutProviderOpts): IEditorLayoutInfo {
		let lineNumbersWidth = this.computeLineNumbersWidth(opts);
		let glyphMarginWidth = this.computeGlyphMarginWidth(opts);

		let contentWidth = opts.outerWidth - glyphMarginWidth - lineNumbersWidth - opts.lineDecorationsWidth;

		let glyphMarginLeft = 0;
		let lineNumbersLeft = glyphMarginLeft + glyphMarginWidth;
		let decorationsLeft = lineNumbersLeft + lineNumbersWidth;
		let contentLeft = decorationsLeft + opts.lineDecorationsWidth;

		let verticalArrowSize = (opts.verticalScrollbarHasArrows ? opts.scrollbarArrowSize : 0);

		return {
			width: opts.outerWidth,
			height: opts.outerHeight,

			glyphMarginLeft: glyphMarginLeft,
			glyphMarginWidth: glyphMarginWidth,
			glyphMarginHeight: opts.outerHeight,

			lineNumbersLeft: lineNumbersLeft,
			lineNumbersWidth: lineNumbersWidth,
			lineNumbersHeight: opts.outerHeight,

			decorationsLeft: decorationsLeft,
			decorationsWidth: opts.lineDecorationsWidth,
			decorationsHeight: opts.outerHeight,

			contentLeft: contentLeft,
			contentWidth: contentWidth,
			contentHeight: opts.outerHeight,

			verticalScrollbarWidth: opts.verticalScrollbarWidth,
			horizontalScrollbarHeight: opts.horizontalScrollbarHeight,

			overviewRuler: {
				top: verticalArrowSize,
				width: opts.verticalScrollbarWidth,
				height: (opts.outerHeight - 2 * verticalArrowSize),
				right: 0
			}
		};
	}

	public static layoutEqual(a:IEditorLayoutInfo, b:IEditorLayoutInfo): boolean {
		return (
			a.width === b.width
			&& a.height === b.height
			&& a.glyphMarginLeft === b.glyphMarginLeft
			&& a.glyphMarginWidth === b.glyphMarginWidth
			&& a.glyphMarginHeight === b.glyphMarginHeight
			&& a.lineNumbersLeft === b.lineNumbersLeft
			&& a.lineNumbersWidth === b.lineNumbersWidth
			&& a.lineNumbersHeight === b.lineNumbersHeight
			&& a.decorationsLeft === b.decorationsLeft
			&& a.decorationsWidth === b.decorationsWidth
			&& a.decorationsHeight === b.decorationsHeight
			&& a.contentLeft === b.contentLeft
			&& a.contentWidth === b.contentWidth
			&& a.contentHeight === b.contentHeight
			&& a.verticalScrollbarWidth === b.verticalScrollbarWidth
			&& a.horizontalScrollbarHeight === b.horizontalScrollbarHeight
			&& a.overviewRuler.top === b.overviewRuler.top
			&& a.overviewRuler.width === b.overviewRuler.width
			&& a.overviewRuler.height === b.overviewRuler.height
			&& a.overviewRuler.right === b.overviewRuler.right
		);
	}

	private static computeGlyphMarginWidth(opts:IEditorLayoutProviderOpts): number {
		if (opts.showGlyphMargin) {
			return opts.lineHeight;
		}
		return 0;
	}

	private static digitCount(n:number): number {
		var r = 0;
		while (n) {
			n = Math.floor(n / 10);
			r++;
		}
		return r ? r : 1;
	}

	private static computeLineNumbersWidth(opts:IEditorLayoutProviderOpts): number {
		if (opts.showLineNumbers) {
			var digitCount = Math.max(this.digitCount(opts.lineCount), opts.lineNumbersMinChars);
			return Math.round(digitCount * opts.maxDigitWidth);
		}
		return 0;
	}
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IEditorLayoutInfo, OverviewRulerPosition} from 'vs/editor/common/editorCommon';

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

export class EditorLayoutInfo implements IEditorLayoutInfo {
	_editorLayoutInfoBrand: void;

	public width:number;
	public height:number;
	public glyphMarginLeft:number;
	public glyphMarginWidth:number;
	public glyphMarginHeight:number;
	public lineNumbersLeft:number;
	public lineNumbersWidth:number;
	public lineNumbersHeight:number;
	public decorationsLeft:number;
	public decorationsWidth:number;
	public decorationsHeight:number;
	public contentLeft:number;
	public contentWidth:number;
	public contentHeight:number;
	public verticalScrollbarWidth:number;
	public horizontalScrollbarHeight:number;
	public overviewRuler:OverviewRulerPosition;

	constructor(source:IEditorLayoutInfo) {
		this.width = source.width|0;
		this.height = source.height|0;
		this.glyphMarginLeft = source.glyphMarginLeft|0;
		this.glyphMarginWidth = source.glyphMarginWidth|0;
		this.glyphMarginHeight = source.glyphMarginHeight|0;
		this.lineNumbersLeft = source.lineNumbersLeft|0;
		this.lineNumbersWidth = source.lineNumbersWidth|0;
		this.lineNumbersHeight = source.lineNumbersHeight|0;
		this.decorationsLeft = source.decorationsLeft|0;
		this.decorationsWidth = source.decorationsWidth|0;
		this.decorationsHeight = source.decorationsHeight|0;
		this.contentLeft = source.contentLeft|0;
		this.contentWidth = source.contentWidth|0;
		this.contentHeight = source.contentHeight|0;
		this.verticalScrollbarWidth = source.verticalScrollbarWidth|0;
		this.horizontalScrollbarHeight = source.horizontalScrollbarHeight|0;
		this.overviewRuler = source.overviewRuler.clone();
	}

	public equals(other:EditorLayoutInfo): boolean {
		return (
			this.width === other.width
			&& this.height === other.height
			&& this.glyphMarginLeft === other.glyphMarginLeft
			&& this.glyphMarginWidth === other.glyphMarginWidth
			&& this.glyphMarginHeight === other.glyphMarginHeight
			&& this.lineNumbersLeft === other.lineNumbersLeft
			&& this.lineNumbersWidth === other.lineNumbersWidth
			&& this.lineNumbersHeight === other.lineNumbersHeight
			&& this.decorationsLeft === other.decorationsLeft
			&& this.decorationsWidth === other.decorationsWidth
			&& this.decorationsHeight === other.decorationsHeight
			&& this.contentLeft === other.contentLeft
			&& this.contentWidth === other.contentWidth
			&& this.contentHeight === other.contentHeight
			&& this.verticalScrollbarWidth === other.verticalScrollbarWidth
			&& this.horizontalScrollbarHeight === other.horizontalScrollbarHeight
			&& this.overviewRuler.equals(other.overviewRuler)
		);
	}

	public clone(): EditorLayoutInfo {
		return new EditorLayoutInfo(this);
	}
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

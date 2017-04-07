/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { RenderMinimap, EditorLayoutInfo, OverviewRulerPosition } from 'vs/editor/common/editorCommon';

export interface IEditorLayoutProviderOpts {
	outerWidth: number;
	outerHeight: number;

	showGlyphMargin: boolean;
	lineHeight: number;

	showLineNumbers: boolean;
	lineNumbersMinChars: number;
	lineNumbersDigitCount: number;

	lineDecorationsWidth: number;

	typicalHalfwidthCharacterWidth: number;
	maxDigitWidth: number;

	verticalScrollbarWidth: number;
	verticalScrollbarHasArrows: boolean;
	scrollbarArrowSize: number;
	horizontalScrollbarHeight: number;

	minimap: boolean;
	minimapRenderCharacters: boolean;
	minimapMaxColumn: number;
	pixelRatio: number;
}

export class EditorLayoutProvider {
	public static compute(_opts: IEditorLayoutProviderOpts): EditorLayoutInfo {
		const outerWidth = _opts.outerWidth | 0;
		const outerHeight = _opts.outerHeight | 0;
		const showGlyphMargin = Boolean(_opts.showGlyphMargin);
		const lineHeight = _opts.lineHeight | 0;
		const showLineNumbers = Boolean(_opts.showLineNumbers);
		const lineNumbersMinChars = _opts.lineNumbersMinChars | 0;
		const lineNumbersDigitCount = _opts.lineNumbersDigitCount | 0;
		const lineDecorationsWidth = _opts.lineDecorationsWidth | 0;
		const typicalHalfwidthCharacterWidth = Number(_opts.typicalHalfwidthCharacterWidth);
		const maxDigitWidth = Number(_opts.maxDigitWidth);
		const verticalScrollbarWidth = _opts.verticalScrollbarWidth | 0;
		const verticalScrollbarHasArrows = Boolean(_opts.verticalScrollbarHasArrows);
		const scrollbarArrowSize = _opts.scrollbarArrowSize | 0;
		const horizontalScrollbarHeight = _opts.horizontalScrollbarHeight | 0;
		const minimap = Boolean(_opts.minimap);
		const minimapRenderCharacters = Boolean(_opts.minimapRenderCharacters);
		const minimapMaxColumn = _opts.minimapMaxColumn | 0;
		const pixelRatio = Number(_opts.pixelRatio);

		let lineNumbersWidth = 0;
		if (showLineNumbers) {
			let digitCount = Math.max(lineNumbersDigitCount, lineNumbersMinChars);
			lineNumbersWidth = Math.round(digitCount * maxDigitWidth);
		}

		let glyphMarginWidth = 0;
		if (showGlyphMargin) {
			glyphMarginWidth = lineHeight;
		}

		let glyphMarginLeft = 0;
		let lineNumbersLeft = glyphMarginLeft + glyphMarginWidth;
		let decorationsLeft = lineNumbersLeft + lineNumbersWidth;
		let contentLeft = decorationsLeft + lineDecorationsWidth;

		let remainingWidth = outerWidth - glyphMarginWidth - lineNumbersWidth - lineDecorationsWidth;

		let renderMinimap: RenderMinimap;
		let minimapWidth: number;
		let contentWidth: number;
		if (!minimap) {
			minimapWidth = 0;
			renderMinimap = RenderMinimap.None;
			contentWidth = remainingWidth;
		} else {
			let minimapCharWidth: number;
			if (pixelRatio >= 2) {
				renderMinimap = minimapRenderCharacters ? RenderMinimap.Large : RenderMinimap.LargeBlocks;
				minimapCharWidth = 2 / pixelRatio;
			} else {
				renderMinimap = minimapRenderCharacters ? RenderMinimap.Small : RenderMinimap.SmallBlocks;
				minimapCharWidth = 1 / pixelRatio;
			}

			// Given:
			// viewportColumn = (contentWidth - verticalScrollbarWidth) / typicalHalfwidthCharacterWidth
			// minimapWidth = viewportColumn * minimapCharWidth
			// contentWidth = remainingWidth - minimapWidth
			// What are good values for contentWidth and minimapWidth ?

			// minimapWidth = ((contentWidth - verticalScrollbarWidth) / typicalHalfwidthCharacterWidth) * minimapCharWidth
			// typicalHalfwidthCharacterWidth * minimapWidth = (contentWidth - verticalScrollbarWidth) * minimapCharWidth
			// typicalHalfwidthCharacterWidth * minimapWidth = (remainingWidth - minimapWidth - verticalScrollbarWidth) * minimapCharWidth
			// (typicalHalfwidthCharacterWidth + minimapCharWidth) * minimapWidth = (remainingWidth - verticalScrollbarWidth) * minimapCharWidth
			// minimapWidth = ((remainingWidth - verticalScrollbarWidth) * minimapCharWidth) / (typicalHalfwidthCharacterWidth + minimapCharWidth)

			minimapWidth = Math.max(0, Math.floor(((remainingWidth - verticalScrollbarWidth) * minimapCharWidth) / (typicalHalfwidthCharacterWidth + minimapCharWidth)));
			let minimapColumns = minimapWidth / minimapCharWidth;
			if (minimapColumns > minimapMaxColumn) {
				minimapWidth = Math.floor(minimapMaxColumn * minimapCharWidth);
			}
			contentWidth = remainingWidth - minimapWidth;
		}

		let viewportColumn = Math.max(1, Math.floor((contentWidth - verticalScrollbarWidth) / typicalHalfwidthCharacterWidth));

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

			renderMinimap: renderMinimap,
			minimapWidth: minimapWidth,

			viewportColumn: viewportColumn,

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


}

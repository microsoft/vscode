/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { EditorLayoutInfo, EditorLayoutProvider, IEditorLayoutProviderOpts, RenderMinimap } from 'vs/editor/common/config/editorOptions';

suite('Editor ViewLayout - EditorLayoutProvider', () => {

	function doTest(input: IEditorLayoutProviderOpts, expected: EditorLayoutInfo): void {
		let actual = EditorLayoutProvider.compute(input);
		assert.deepEqual(actual, expected);
	}

	test('EditorLayoutProvider 1', () => {
		doTest({
			outerWidth: 1000,
			outerHeight: 800,
			showGlyphMargin: false,
			lineHeight: 16,
			showLineNumbers: false,
			lineNumbersMinChars: 0,
			lineNumbersDigitCount: 1,
			lineDecorationsWidth: 10,
			typicalHalfwidthCharacterWidth: 10,
			maxDigitWidth: 10,
			verticalScrollbarWidth: 0,
			horizontalScrollbarHeight: 0,
			scrollbarArrowSize: 0,
			verticalScrollbarHasArrows: false,
			minimap: false,
			minimapSide: 'right',
			minimapRenderCharacters: true,
			minimapMaxColumn: 150,
			pixelRatio: 1,
		}, {
				width: 1000,
				height: 800,

				glyphMarginLeft: 0,
				glyphMarginWidth: 0,
				glyphMarginHeight: 800,

				lineNumbersLeft: 0,
				lineNumbersWidth: 0,
				lineNumbersHeight: 800,

				decorationsLeft: 0,
				decorationsWidth: 10,
				decorationsHeight: 800,

				contentLeft: 10,
				contentWidth: 990,
				contentHeight: 800,

				renderMinimap: RenderMinimap.None,
				minimapLeft: 0,
				minimapWidth: 0,
				viewportColumn: 98,

				verticalScrollbarWidth: 0,
				horizontalScrollbarHeight: 0,

				overviewRuler: {
					top: 0,
					width: 0,
					height: 800,
					right: 0
				}
			});
	});

	test('EditorLayoutProvider 1.1', () => {
		doTest({
			outerWidth: 1000,
			outerHeight: 800,
			showGlyphMargin: false,
			lineHeight: 16,
			showLineNumbers: false,
			lineNumbersMinChars: 0,
			lineNumbersDigitCount: 1,
			lineDecorationsWidth: 10,
			typicalHalfwidthCharacterWidth: 10,
			maxDigitWidth: 10,
			verticalScrollbarWidth: 11,
			horizontalScrollbarHeight: 12,
			scrollbarArrowSize: 13,
			verticalScrollbarHasArrows: true,
			minimap: false,
			minimapSide: 'right',
			minimapRenderCharacters: true,
			minimapMaxColumn: 150,
			pixelRatio: 1,
		}, {
				width: 1000,
				height: 800,

				glyphMarginLeft: 0,
				glyphMarginWidth: 0,
				glyphMarginHeight: 800,

				lineNumbersLeft: 0,
				lineNumbersWidth: 0,
				lineNumbersHeight: 800,

				decorationsLeft: 0,
				decorationsWidth: 10,
				decorationsHeight: 800,

				contentLeft: 10,
				contentWidth: 990,
				contentHeight: 800,

				renderMinimap: RenderMinimap.None,
				minimapLeft: 0,
				minimapWidth: 0,
				viewportColumn: 97,

				verticalScrollbarWidth: 11,
				horizontalScrollbarHeight: 12,

				overviewRuler: {
					top: 13,
					width: 11,
					height: (800 - 2 * 13),
					right: 0
				}
			});
	});

	test('EditorLayoutProvider 2', () => {
		doTest({
			outerWidth: 900,
			outerHeight: 800,
			showGlyphMargin: false,
			lineHeight: 16,
			showLineNumbers: false,
			lineNumbersMinChars: 0,
			lineNumbersDigitCount: 1,
			lineDecorationsWidth: 10,
			typicalHalfwidthCharacterWidth: 10,
			maxDigitWidth: 10,
			verticalScrollbarWidth: 0,
			horizontalScrollbarHeight: 0,
			scrollbarArrowSize: 0,
			verticalScrollbarHasArrows: false,
			minimap: false,
			minimapSide: 'right',
			minimapRenderCharacters: true,
			minimapMaxColumn: 150,
			pixelRatio: 1,
		}, {
				width: 900,
				height: 800,

				glyphMarginLeft: 0,
				glyphMarginWidth: 0,
				glyphMarginHeight: 800,

				lineNumbersLeft: 0,
				lineNumbersWidth: 0,
				lineNumbersHeight: 800,

				decorationsLeft: 0,
				decorationsWidth: 10,
				decorationsHeight: 800,

				contentLeft: 10,
				contentWidth: 890,
				contentHeight: 800,

				renderMinimap: RenderMinimap.None,
				minimapLeft: 0,
				minimapWidth: 0,
				viewportColumn: 88,

				verticalScrollbarWidth: 0,
				horizontalScrollbarHeight: 0,

				overviewRuler: {
					top: 0,
					width: 0,
					height: 800,
					right: 0
				}
			});
	});

	test('EditorLayoutProvider 3', () => {
		doTest({
			outerWidth: 900,
			outerHeight: 900,
			showGlyphMargin: false,
			lineHeight: 16,
			showLineNumbers: false,
			lineNumbersMinChars: 0,
			lineNumbersDigitCount: 1,
			lineDecorationsWidth: 10,
			typicalHalfwidthCharacterWidth: 10,
			maxDigitWidth: 10,
			verticalScrollbarWidth: 0,
			horizontalScrollbarHeight: 0,
			scrollbarArrowSize: 0,
			verticalScrollbarHasArrows: false,
			minimap: false,
			minimapSide: 'right',
			minimapRenderCharacters: true,
			minimapMaxColumn: 150,
			pixelRatio: 1,
		}, {
				width: 900,
				height: 900,

				glyphMarginLeft: 0,
				glyphMarginWidth: 0,
				glyphMarginHeight: 900,

				lineNumbersLeft: 0,
				lineNumbersWidth: 0,
				lineNumbersHeight: 900,

				decorationsLeft: 0,
				decorationsWidth: 10,
				decorationsHeight: 900,

				contentLeft: 10,
				contentWidth: 890,
				contentHeight: 900,

				renderMinimap: RenderMinimap.None,
				minimapLeft: 0,
				minimapWidth: 0,
				viewportColumn: 88,

				verticalScrollbarWidth: 0,
				horizontalScrollbarHeight: 0,

				overviewRuler: {
					top: 0,
					width: 0,
					height: 900,
					right: 0
				}
			});
	});

	test('EditorLayoutProvider 4', () => {
		doTest({
			outerWidth: 900,
			outerHeight: 900,
			showGlyphMargin: false,
			lineHeight: 16,
			showLineNumbers: false,
			lineNumbersMinChars: 5,
			lineNumbersDigitCount: 1,
			lineDecorationsWidth: 10,
			typicalHalfwidthCharacterWidth: 10,
			maxDigitWidth: 10,
			verticalScrollbarWidth: 0,
			horizontalScrollbarHeight: 0,
			scrollbarArrowSize: 0,
			verticalScrollbarHasArrows: false,
			minimap: false,
			minimapSide: 'right',
			minimapRenderCharacters: true,
			minimapMaxColumn: 150,
			pixelRatio: 1,
		}, {
				width: 900,
				height: 900,

				glyphMarginLeft: 0,
				glyphMarginWidth: 0,
				glyphMarginHeight: 900,

				lineNumbersLeft: 0,
				lineNumbersWidth: 0,
				lineNumbersHeight: 900,

				decorationsLeft: 0,
				decorationsWidth: 10,
				decorationsHeight: 900,

				contentLeft: 10,
				contentWidth: 890,
				contentHeight: 900,

				renderMinimap: RenderMinimap.None,
				minimapLeft: 0,
				minimapWidth: 0,
				viewportColumn: 88,

				verticalScrollbarWidth: 0,
				horizontalScrollbarHeight: 0,

				overviewRuler: {
					top: 0,
					width: 0,
					height: 900,
					right: 0
				}
			});
	});

	test('EditorLayoutProvider 5', () => {
		doTest({
			outerWidth: 900,
			outerHeight: 900,
			showGlyphMargin: false,
			lineHeight: 16,
			showLineNumbers: true,
			lineNumbersMinChars: 5,
			lineNumbersDigitCount: 1,
			lineDecorationsWidth: 10,
			typicalHalfwidthCharacterWidth: 10,
			maxDigitWidth: 10,
			verticalScrollbarWidth: 0,
			horizontalScrollbarHeight: 0,
			scrollbarArrowSize: 0,
			verticalScrollbarHasArrows: false,
			minimap: false,
			minimapSide: 'right',
			minimapRenderCharacters: true,
			minimapMaxColumn: 150,
			pixelRatio: 1,
		}, {
				width: 900,
				height: 900,

				glyphMarginLeft: 0,
				glyphMarginWidth: 0,
				glyphMarginHeight: 900,

				lineNumbersLeft: 0,
				lineNumbersWidth: 50,
				lineNumbersHeight: 900,

				decorationsLeft: 50,
				decorationsWidth: 10,
				decorationsHeight: 900,

				contentLeft: 60,
				contentWidth: 840,
				contentHeight: 900,

				renderMinimap: RenderMinimap.None,
				minimapLeft: 0,
				minimapWidth: 0,
				viewportColumn: 83,

				verticalScrollbarWidth: 0,
				horizontalScrollbarHeight: 0,

				overviewRuler: {
					top: 0,
					width: 0,
					height: 900,
					right: 0
				}
			});
	});

	test('EditorLayoutProvider 6', () => {
		doTest({
			outerWidth: 900,
			outerHeight: 900,
			showGlyphMargin: false,
			lineHeight: 16,
			showLineNumbers: true,
			lineNumbersMinChars: 5,
			lineNumbersDigitCount: 5,
			lineDecorationsWidth: 10,
			typicalHalfwidthCharacterWidth: 10,
			maxDigitWidth: 10,
			verticalScrollbarWidth: 0,
			horizontalScrollbarHeight: 0,
			scrollbarArrowSize: 0,
			verticalScrollbarHasArrows: false,
			minimap: false,
			minimapSide: 'right',
			minimapRenderCharacters: true,
			minimapMaxColumn: 150,
			pixelRatio: 1,
		}, {
				width: 900,
				height: 900,

				glyphMarginLeft: 0,
				glyphMarginWidth: 0,
				glyphMarginHeight: 900,

				lineNumbersLeft: 0,
				lineNumbersWidth: 50,
				lineNumbersHeight: 900,

				decorationsLeft: 50,
				decorationsWidth: 10,
				decorationsHeight: 900,

				contentLeft: 60,
				contentWidth: 840,
				contentHeight: 900,

				renderMinimap: RenderMinimap.None,
				minimapLeft: 0,
				minimapWidth: 0,
				viewportColumn: 83,

				verticalScrollbarWidth: 0,
				horizontalScrollbarHeight: 0,

				overviewRuler: {
					top: 0,
					width: 0,
					height: 900,
					right: 0
				}
			});
	});

	test('EditorLayoutProvider 7', () => {
		doTest({
			outerWidth: 900,
			outerHeight: 900,
			showGlyphMargin: false,
			lineHeight: 16,
			showLineNumbers: true,
			lineNumbersMinChars: 5,
			lineNumbersDigitCount: 6,
			lineDecorationsWidth: 10,
			typicalHalfwidthCharacterWidth: 10,
			maxDigitWidth: 10,
			verticalScrollbarWidth: 0,
			horizontalScrollbarHeight: 0,
			scrollbarArrowSize: 0,
			verticalScrollbarHasArrows: false,
			minimap: false,
			minimapSide: 'right',
			minimapRenderCharacters: true,
			minimapMaxColumn: 150,
			pixelRatio: 1,
		}, {
				width: 900,
				height: 900,

				glyphMarginLeft: 0,
				glyphMarginWidth: 0,
				glyphMarginHeight: 900,

				lineNumbersLeft: 0,
				lineNumbersWidth: 60,
				lineNumbersHeight: 900,

				decorationsLeft: 60,
				decorationsWidth: 10,
				decorationsHeight: 900,

				contentLeft: 70,
				contentWidth: 830,
				contentHeight: 900,

				renderMinimap: RenderMinimap.None,
				minimapLeft: 0,
				minimapWidth: 0,
				viewportColumn: 82,

				verticalScrollbarWidth: 0,
				horizontalScrollbarHeight: 0,

				overviewRuler: {
					top: 0,
					width: 0,
					height: 900,
					right: 0
				}
			});
	});

	test('EditorLayoutProvider 8', () => {
		doTest({
			outerWidth: 900,
			outerHeight: 900,
			showGlyphMargin: false,
			lineHeight: 16,
			showLineNumbers: true,
			lineNumbersMinChars: 5,
			lineNumbersDigitCount: 6,
			lineDecorationsWidth: 10,
			typicalHalfwidthCharacterWidth: 5,
			maxDigitWidth: 5,
			verticalScrollbarWidth: 0,
			horizontalScrollbarHeight: 0,
			scrollbarArrowSize: 0,
			verticalScrollbarHasArrows: false,
			minimap: false,
			minimapSide: 'right',
			minimapRenderCharacters: true,
			minimapMaxColumn: 150,
			pixelRatio: 1,
		}, {
				width: 900,
				height: 900,

				glyphMarginLeft: 0,
				glyphMarginWidth: 0,
				glyphMarginHeight: 900,

				lineNumbersLeft: 0,
				lineNumbersWidth: 30,
				lineNumbersHeight: 900,

				decorationsLeft: 30,
				decorationsWidth: 10,
				decorationsHeight: 900,

				contentLeft: 40,
				contentWidth: 860,
				contentHeight: 900,

				renderMinimap: RenderMinimap.None,
				minimapLeft: 0,
				minimapWidth: 0,
				viewportColumn: 171,

				verticalScrollbarWidth: 0,
				horizontalScrollbarHeight: 0,

				overviewRuler: {
					top: 0,
					width: 0,
					height: 900,
					right: 0
				}
			});
	});

	test('EditorLayoutProvider 8 - rounds floats', () => {
		doTest({
			outerWidth: 900,
			outerHeight: 900,
			showGlyphMargin: false,
			lineHeight: 16,
			showLineNumbers: true,
			lineNumbersMinChars: 5,
			lineNumbersDigitCount: 6,
			lineDecorationsWidth: 10,
			typicalHalfwidthCharacterWidth: 5.05,
			maxDigitWidth: 5.05,
			verticalScrollbarWidth: 0,
			horizontalScrollbarHeight: 0,
			scrollbarArrowSize: 0,
			verticalScrollbarHasArrows: false,
			minimap: false,
			minimapSide: 'right',
			minimapRenderCharacters: true,
			minimapMaxColumn: 150,
			pixelRatio: 1,
		}, {
				width: 900,
				height: 900,

				glyphMarginLeft: 0,
				glyphMarginWidth: 0,
				glyphMarginHeight: 900,

				lineNumbersLeft: 0,
				lineNumbersWidth: 30,
				lineNumbersHeight: 900,

				decorationsLeft: 30,
				decorationsWidth: 10,
				decorationsHeight: 900,

				contentLeft: 40,
				contentWidth: 860,
				contentHeight: 900,

				renderMinimap: RenderMinimap.None,
				minimapLeft: 0,
				minimapWidth: 0,
				viewportColumn: 169,

				verticalScrollbarWidth: 0,
				horizontalScrollbarHeight: 0,

				overviewRuler: {
					top: 0,
					width: 0,
					height: 900,
					right: 0
				}
			});
	});

	test('EditorLayoutProvider 9 - render minimap', () => {
		doTest({
			outerWidth: 1000,
			outerHeight: 800,
			showGlyphMargin: false,
			lineHeight: 16,
			showLineNumbers: false,
			lineNumbersMinChars: 0,
			lineNumbersDigitCount: 1,
			lineDecorationsWidth: 10,
			typicalHalfwidthCharacterWidth: 10,
			maxDigitWidth: 10,
			verticalScrollbarWidth: 0,
			horizontalScrollbarHeight: 0,
			scrollbarArrowSize: 0,
			verticalScrollbarHasArrows: false,
			minimap: true,
			minimapSide: 'right',
			minimapRenderCharacters: true,
			minimapMaxColumn: 150,
			pixelRatio: 1,
		}, {
				width: 1000,
				height: 800,

				glyphMarginLeft: 0,
				glyphMarginWidth: 0,
				glyphMarginHeight: 800,

				lineNumbersLeft: 0,
				lineNumbersWidth: 0,
				lineNumbersHeight: 800,

				decorationsLeft: 0,
				decorationsWidth: 10,
				decorationsHeight: 800,

				contentLeft: 10,
				contentWidth: 901,
				contentHeight: 800,

				renderMinimap: RenderMinimap.Small,
				minimapLeft: 911,
				minimapWidth: 89,
				viewportColumn: 89,

				verticalScrollbarWidth: 0,
				horizontalScrollbarHeight: 0,

				overviewRuler: {
					top: 0,
					width: 0,
					height: 800,
					right: 0
				}
			});
	});

	test('EditorLayoutProvider 9 - render minimap with pixelRatio = 2', () => {
		doTest({
			outerWidth: 1000,
			outerHeight: 800,
			showGlyphMargin: false,
			lineHeight: 16,
			showLineNumbers: false,
			lineNumbersMinChars: 0,
			lineNumbersDigitCount: 1,
			lineDecorationsWidth: 10,
			typicalHalfwidthCharacterWidth: 10,
			maxDigitWidth: 10,
			verticalScrollbarWidth: 0,
			horizontalScrollbarHeight: 0,
			scrollbarArrowSize: 0,
			verticalScrollbarHasArrows: false,
			minimap: true,
			minimapSide: 'right',
			minimapRenderCharacters: true,
			minimapMaxColumn: 150,
			pixelRatio: 2,
		}, {
				width: 1000,
				height: 800,

				glyphMarginLeft: 0,
				glyphMarginWidth: 0,
				glyphMarginHeight: 800,

				lineNumbersLeft: 0,
				lineNumbersWidth: 0,
				lineNumbersHeight: 800,

				decorationsLeft: 0,
				decorationsWidth: 10,
				decorationsHeight: 800,

				contentLeft: 10,
				contentWidth: 901,
				contentHeight: 800,

				renderMinimap: RenderMinimap.Large,
				minimapLeft: 911,
				minimapWidth: 89,
				viewportColumn: 89,

				verticalScrollbarWidth: 0,
				horizontalScrollbarHeight: 0,

				overviewRuler: {
					top: 0,
					width: 0,
					height: 800,
					right: 0
				}
			});
	});

	test('EditorLayoutProvider 9 - render minimap with pixelRatio = 4', () => {
		doTest({
			outerWidth: 1000,
			outerHeight: 800,
			showGlyphMargin: false,
			lineHeight: 16,
			showLineNumbers: false,
			lineNumbersMinChars: 0,
			lineNumbersDigitCount: 1,
			lineDecorationsWidth: 10,
			typicalHalfwidthCharacterWidth: 10,
			maxDigitWidth: 10,
			verticalScrollbarWidth: 0,
			horizontalScrollbarHeight: 0,
			scrollbarArrowSize: 0,
			verticalScrollbarHasArrows: false,
			minimap: true,
			minimapSide: 'right',
			minimapRenderCharacters: true,
			minimapMaxColumn: 150,
			pixelRatio: 4,
		}, {
				width: 1000,
				height: 800,

				glyphMarginLeft: 0,
				glyphMarginWidth: 0,
				glyphMarginHeight: 800,

				lineNumbersLeft: 0,
				lineNumbersWidth: 0,
				lineNumbersHeight: 800,

				decorationsLeft: 0,
				decorationsWidth: 10,
				decorationsHeight: 800,

				contentLeft: 10,
				contentWidth: 943,
				contentHeight: 800,

				renderMinimap: RenderMinimap.Large,
				minimapLeft: 953,
				minimapWidth: 47,
				viewportColumn: 94,

				verticalScrollbarWidth: 0,
				horizontalScrollbarHeight: 0,

				overviewRuler: {
					top: 0,
					width: 0,
					height: 800,
					right: 0
				}
			});
	});

	test('EditorLayoutProvider 10 - render minimap to left', () => {
		doTest({
			outerWidth: 1000,
			outerHeight: 800,
			showGlyphMargin: false,
			lineHeight: 16,
			showLineNumbers: false,
			lineNumbersMinChars: 0,
			lineNumbersDigitCount: 1,
			lineDecorationsWidth: 10,
			typicalHalfwidthCharacterWidth: 10,
			maxDigitWidth: 10,
			verticalScrollbarWidth: 0,
			horizontalScrollbarHeight: 0,
			scrollbarArrowSize: 0,
			verticalScrollbarHasArrows: false,
			minimap: true,
			minimapSide: 'left',
			minimapRenderCharacters: true,
			minimapMaxColumn: 150,
			pixelRatio: 4,
		}, {
				width: 1000,
				height: 800,

				glyphMarginLeft: 47,
				glyphMarginWidth: 0,
				glyphMarginHeight: 800,

				lineNumbersLeft: 47,
				lineNumbersWidth: 0,
				lineNumbersHeight: 800,

				decorationsLeft: 47,
				decorationsWidth: 10,
				decorationsHeight: 800,

				contentLeft: 57,
				contentWidth: 943,
				contentHeight: 800,

				renderMinimap: RenderMinimap.Large,
				minimapLeft: 0,
				minimapWidth: 47,
				viewportColumn: 94,

				verticalScrollbarWidth: 0,
				horizontalScrollbarHeight: 0,

				overviewRuler: {
					top: 0,
					width: 0,
					height: 800,
					right: 0
				}
			});
	});

	test('issue #31312: When wrapping, leave 2px for the cursor', () => {
		doTest({
			outerWidth: 1201,
			outerHeight: 422,
			showGlyphMargin: true,
			lineHeight: 30,
			showLineNumbers: true,
			lineNumbersMinChars: 3,
			lineNumbersDigitCount: 1,
			lineDecorationsWidth: 26,
			typicalHalfwidthCharacterWidth: 12.04296875,
			maxDigitWidth: 12.04296875,
			verticalScrollbarWidth: 14,
			horizontalScrollbarHeight: 10,
			scrollbarArrowSize: 11,
			verticalScrollbarHasArrows: false,
			minimap: true,
			minimapSide: 'right',
			minimapRenderCharacters: true,
			minimapMaxColumn: 120,
			pixelRatio: 2
		}, {
				width: 1201,
				height: 422,

				glyphMarginLeft: 0,
				glyphMarginWidth: 30,
				glyphMarginHeight: 422,

				lineNumbersLeft: 30,
				lineNumbersWidth: 36,
				lineNumbersHeight: 422,

				decorationsLeft: 66,
				decorationsWidth: 26,
				decorationsHeight: 422,

				contentLeft: 92,
				contentWidth: 1026,
				contentHeight: 422,

				renderMinimap: RenderMinimap.Large,
				minimapLeft: 1104,
				minimapWidth: 83,
				viewportColumn: 83,

				verticalScrollbarWidth: 14,
				horizontalScrollbarHeight: 10,

				overviewRuler: {
					top: 0,
					width: 14,
					height: 422,
					right: 0
				}
			});

	});
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {IEditorLayoutInfo} from 'vs/editor/common/editorCommon';
import {EditorLayoutProvider, IEditorLayoutProviderOpts} from 'vs/editor/common/viewLayout/editorLayoutProvider';

suite('Editor ViewLayout - EditorLayoutProvider', () => {

	function doTest(input:IEditorLayoutProviderOpts, expected:IEditorLayoutInfo): void {
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
			lineDecorationsWidth: 10,
			maxDigitWidth: 10,
			lineCount: 1,
			verticalScrollbarWidth: 0,
			horizontalScrollbarHeight: 0,
			scrollbarArrowSize: 0,
			verticalScrollbarHasArrows: false
		}, {
			width:1000,
			height:800,

			glyphMarginLeft:0,
			glyphMarginWidth: 0,
			glyphMarginHeight:800,

			lineNumbersLeft:0,
			lineNumbersWidth:0,
			lineNumbersHeight:800,

			decorationsLeft:0,
			decorationsWidth:10,
			decorationsHeight:800,

			contentLeft:10,
			contentWidth:990,
			contentHeight:800,

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
			lineDecorationsWidth: 10,
			maxDigitWidth: 10,
			lineCount: 1,
			verticalScrollbarWidth: 11,
			horizontalScrollbarHeight: 12,
			scrollbarArrowSize: 13,
			verticalScrollbarHasArrows: true
		}, {
			width:1000,
			height:800,

			glyphMarginLeft:0,
			glyphMarginWidth: 0,
			glyphMarginHeight:800,

			lineNumbersLeft:0,
			lineNumbersWidth:0,
			lineNumbersHeight:800,

			decorationsLeft:0,
			decorationsWidth:10,
			decorationsHeight:800,

			contentLeft:10,
			contentWidth:990,
			contentHeight:800,

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
			lineDecorationsWidth: 10,
			maxDigitWidth: 10,
			lineCount: 1,
			verticalScrollbarWidth: 0,
			horizontalScrollbarHeight: 0,
			scrollbarArrowSize: 0,
			verticalScrollbarHasArrows: false
		}, {
			width:900,
			height:800,

			glyphMarginLeft:0,
			glyphMarginWidth: 0,
			glyphMarginHeight:800,

			lineNumbersLeft:0,
			lineNumbersWidth:0,
			lineNumbersHeight:800,

			decorationsLeft:0,
			decorationsWidth:10,
			decorationsHeight:800,

			contentLeft:10,
			contentWidth:890,
			contentHeight:800,

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
			lineDecorationsWidth: 10,
			maxDigitWidth: 10,
			lineCount: 1,
			verticalScrollbarWidth: 0,
			horizontalScrollbarHeight: 0,
			scrollbarArrowSize: 0,
			verticalScrollbarHasArrows: false
		}, {
			width:900,
			height:900,

			glyphMarginLeft:0,
			glyphMarginWidth: 0,
			glyphMarginHeight:900,

			lineNumbersLeft:0,
			lineNumbersWidth:0,
			lineNumbersHeight:900,

			decorationsLeft:0,
			decorationsWidth:10,
			decorationsHeight:900,

			contentLeft:10,
			contentWidth:890,
			contentHeight:900,

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
			lineDecorationsWidth: 10,
			maxDigitWidth: 10,
			lineCount: 1,
			verticalScrollbarWidth: 0,
			horizontalScrollbarHeight: 0,
			scrollbarArrowSize: 0,
			verticalScrollbarHasArrows: false
		}, {
			width:900,
			height:900,

			glyphMarginLeft:0,
			glyphMarginWidth: 0,
			glyphMarginHeight:900,

			lineNumbersLeft:0,
			lineNumbersWidth:0,
			lineNumbersHeight:900,

			decorationsLeft:0,
			decorationsWidth:10,
			decorationsHeight:900,

			contentLeft:10,
			contentWidth:890,
			contentHeight:900,

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
			lineDecorationsWidth: 10,
			maxDigitWidth: 10,
			lineCount: 1,
			verticalScrollbarWidth: 0,
			horizontalScrollbarHeight: 0,
			scrollbarArrowSize: 0,
			verticalScrollbarHasArrows: false
		}, {
			width:900,
			height:900,

			glyphMarginLeft:0,
			glyphMarginWidth: 0,
			glyphMarginHeight:900,

			lineNumbersLeft:0,
			lineNumbersWidth:50,
			lineNumbersHeight:900,

			decorationsLeft:50,
			decorationsWidth:10,
			decorationsHeight:900,

			contentLeft:60,
			contentWidth:840,
			contentHeight:900,

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
			lineDecorationsWidth: 10,
			maxDigitWidth: 10,
			lineCount: 99999,
			verticalScrollbarWidth: 0,
			horizontalScrollbarHeight: 0,
			scrollbarArrowSize: 0,
			verticalScrollbarHasArrows: false
		}, {
			width:900,
			height:900,

			glyphMarginLeft:0,
			glyphMarginWidth: 0,
			glyphMarginHeight:900,

			lineNumbersLeft:0,
			lineNumbersWidth:50,
			lineNumbersHeight:900,

			decorationsLeft:50,
			decorationsWidth:10,
			decorationsHeight:900,

			contentLeft:60,
			contentWidth:840,
			contentHeight:900,

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
			lineDecorationsWidth: 10,
			maxDigitWidth: 10,
			lineCount: 100000,
			verticalScrollbarWidth: 0,
			horizontalScrollbarHeight: 0,
			scrollbarArrowSize: 0,
			verticalScrollbarHasArrows: false
		}, {
			width:900,
			height:900,

			glyphMarginLeft:0,
			glyphMarginWidth: 0,
			glyphMarginHeight:900,

			lineNumbersLeft:0,
			lineNumbersWidth:60,
			lineNumbersHeight:900,

			decorationsLeft:60,
			decorationsWidth:10,
			decorationsHeight:900,

			contentLeft:70,
			contentWidth:830,
			contentHeight:900,

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
			lineDecorationsWidth: 10,
			maxDigitWidth: 5,
			lineCount: 100000,
			verticalScrollbarWidth: 0,
			horizontalScrollbarHeight: 0,
			scrollbarArrowSize: 0,
			verticalScrollbarHasArrows: false
		}, {
			width:900,
			height:900,

			glyphMarginLeft:0,
			glyphMarginWidth: 0,
			glyphMarginHeight:900,

			lineNumbersLeft:0,
			lineNumbersWidth:30,
			lineNumbersHeight:900,

			decorationsLeft:30,
			decorationsWidth:10,
			decorationsHeight:900,

			contentLeft:40,
			contentWidth:860,
			contentHeight:900,

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
			lineDecorationsWidth: 10,
			maxDigitWidth: 5.05,
			lineCount: 100000,
			verticalScrollbarWidth: 0,
			horizontalScrollbarHeight: 0,
			scrollbarArrowSize: 0,
			verticalScrollbarHasArrows: false
		}, {
			width:900,
			height:900,

			glyphMarginLeft:0,
			glyphMarginWidth: 0,
			glyphMarginHeight:900,

			lineNumbersLeft:0,
			lineNumbersWidth:30,
			lineNumbersHeight:900,

			decorationsLeft:30,
			decorationsWidth:10,
			decorationsHeight:900,

			contentLeft:40,
			contentWidth:860,
			contentHeight:900,

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
});

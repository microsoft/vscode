/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { MinimapLayout } from '../../../browser/viewParts/minimap/minimap.js';
import { CustomLineHeightData } from '../../../common/viewLayout/lineHeights.js';
import { LinesLayout } from '../../../common/viewLayout/linesLayout.js';

suite('MinimapLayout', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const lineCount = 1000;
	const lineHeight = 20;
	const viewportHeight = 400;
	const minimapHeight = 400;

	interface ISliderSummary {
		readonly backwardMoves: number;
		readonly minSliderTop: number;
		readonly maxSliderBottom: number;
	}

	/**
	 * Scrolls down through the layout, creating the minimap layout like `Minimap.render` does,
	 * and summarizes how the slider moved over the document (the minimap canvas may re-anchor
	 * beneath the slider, so the slider's document line is tracked rather than its dom top).
	 */
	function scrollDown(linesLayout: LinesLayout, paddingTop: number, maxScrollTop: number): ISliderSummary {
		const minimapLineHeight = 2;
		const options = { pixelRatio: 1, minimapLineHeight, canvasInnerHeight: minimapHeight, lineHeight, minimapHeightIsEditorHeight: false, minimapHeight, paddingTop, paddingBottom: 0, scrollBeyondLastLine: false };
		const scrollHeight = linesLayout.getLinesTotalHeight();
		let previousLayout: MinimapLayout | null = null;
		let previousSliderLine = 0;
		let backwardMoves = 0;
		let minSliderTop = Number.MAX_VALUE;
		let maxSliderBottom = 0;
		for (let scrollTop = 0; scrollTop <= maxScrollTop; scrollTop += 10) {
			const viewport = linesLayout.getLinesViewportData(scrollTop, scrollTop + viewportHeight);
			const layout: MinimapLayout = MinimapLayout.create(
				options,
				viewport.startLineNumber,
				viewport.endLineNumber,
				linesLayout.getVerticalOffsetForLineNumber(viewport.startLineNumber),
				linesLayout.getLineHeightForLineNumber(viewport.startLineNumber),
				viewportHeight,
				linesLayout.getWhitespaceViewportData(scrollTop, scrollTop + viewportHeight).length > 0,
				lineCount,
				lineCount,
				scrollTop,
				scrollHeight,
				previousLayout
			);
			const sliderLine = layout.startLineNumber - layout.topPaddingLineCount + layout.sliderTop / minimapLineHeight;
			if (previousLayout && sliderLine < previousSliderLine - 1e-9) {
				backwardMoves++;
			}
			minSliderTop = Math.min(minSliderTop, layout.sliderTop);
			maxSliderBottom = Math.max(maxSliderBottom, Math.round(layout.sliderTop + layout.sliderHeight));
			previousLayout = layout;
			previousSliderLine = sliderLine;
		}
		return { backwardMoves, minSliderTop, maxSliderBottom };
	}

	function createLinesLayout(paddingTop: number, customLineHeights: CustomLineHeightData[], viewZones: [afterLineNumber: number, height: number][]): LinesLayout {
		const linesLayout = new LinesLayout(lineCount, lineHeight, paddingTop, 0, customLineHeights);
		linesLayout.changeWhitespace(accessor => {
			for (const [afterLineNumber, height] of viewZones) {
				accessor.insertWhitespace(afterLineNumber, 0, height, 0);
			}
		});
		return linesLayout;
	}

	test('slider moves only forward when scrolling down through view zones, padding, taller and zero-height lines', () => {
		const noZones = createLinesLayout(0, [], []);
		const tallZone = createLinesLayout(0, [], [[100, 3000]]);
		const manyZones = createLinesLayout(0, [], Array.from({ length: 99 }, (_, i) => [(i + 1) * 10, 72]));
		const paddingAndTallerLines = createLinesLayout(30, [new CustomLineHeightData('a', 50, 50, 300), new CustomLineHeightData('b', 400, 400, 120)], [[200, 500], [600, 1000]]);
		const trailingZone = createLinesLayout(0, [], [[lineCount, 3000]]);
		// A custom line height of 0.2px rounds to 0px, so line 101 is the first visible line while the zone above it scrolls by
		const zeroHeightLineAfterZone = createLinesLayout(0, [new CustomLineHeightData('z', 101, 101, 0.2)], [[100, 3000]]);

		assert.deepStrictEqual({
			noZones: scrollDown(noZones, 0, noZones.getLinesTotalHeight() - viewportHeight),
			tallZone: scrollDown(tallZone, 0, tallZone.getLinesTotalHeight() - viewportHeight),
			manyZones: scrollDown(manyZones, 0, manyZones.getLinesTotalHeight() - viewportHeight),
			paddingAndTallerLines: scrollDown(paddingAndTallerLines, 30, paddingAndTallerLines.getLinesTotalHeight() - viewportHeight),
			trailingZone: scrollDown(trailingZone, 0, trailingZone.getLinesTotalHeight() - viewportHeight),
			zeroHeightLineAfterZone: scrollDown(zeroHeightLineAfterZone, 0, zeroHeightLineAfterZone.getLinesTotalHeight() - viewportHeight),
		}, {
			noZones: { backwardMoves: 0, minSliderTop: 0, maxSliderBottom: 401 },
			tallZone: { backwardMoves: 0, minSliderTop: 0, maxSliderBottom: 401 },
			manyZones: { backwardMoves: 0, minSliderTop: 0, maxSliderBottom: 401 },
			paddingAndTallerLines: { backwardMoves: 0, minSliderTop: 0, maxSliderBottom: 401 },
			trailingZone: { backwardMoves: 0, minSliderTop: 0, maxSliderBottom: 362 },
			zeroHeightLineAfterZone: { backwardMoves: 0, minSliderTop: 0, maxSliderBottom: 401 },
		});
	});

	test('fit/fill slider follows the lines, not the view zones, padding and taller lines', () => {
		/**
		 * Creates the minimap layout like `Minimap.render` does in `fit`/`fill` mode.
		 */
		function createFitLayout(linesLayout: LinesLayout, paddingTop: number, scrollTop: number): MinimapLayout {
			const options = { pixelRatio: 1, minimapLineHeight: 2, canvasInnerHeight: minimapHeight, lineHeight, minimapHeightIsEditorHeight: true, minimapHeight, paddingTop, paddingBottom: 0, scrollBeyondLastLine: false };
			const viewport = linesLayout.getLinesViewportData(scrollTop, scrollTop + viewportHeight);
			const zoneFree = MinimapLayout.getZoneFreeScrollPosition(linesLayout, lineCount, lineHeight, paddingTop, viewport.startLineNumber, viewportHeight, scrollTop, linesLayout.getLinesTotalHeight());
			return MinimapLayout.create(
				options,
				viewport.startLineNumber,
				viewport.endLineNumber,
				linesLayout.getVerticalOffsetForLineNumber(viewport.startLineNumber),
				linesLayout.getLineHeightForLineNumber(viewport.startLineNumber),
				viewportHeight,
				linesLayout.getWhitespaceViewportData(scrollTop, scrollTop + viewportHeight).length > 0,
				lineCount,
				lineCount,
				zoneFree.scrollTop,
				zoneFree.scrollHeight,
				null
			);
		}

		/**
		 * Scrolls the top and the middle of every line to the top of the viewport, compares the slider with the slider
		 * of the same document without view zones and taller lines, and maps the slider back to the editor `scrollTop`.
		 */
		function compare(linesLayout: LinesLayout, plainLinesLayout: LinesLayout, paddingTop: number) {
			const scrollHeight = linesLayout.getLinesTotalHeight();
			let maxDrift = 0;
			let roundTripMismatches = 0;
			for (let lineNumber = 1; lineNumber <= lineCount; lineNumber++) {
				for (const fraction of [0, 0.5]) {
					const scrollTop = linesLayout.getVerticalOffsetForLineNumber(lineNumber) + fraction * linesLayout.getLineHeightForLineNumber(lineNumber);
					if (scrollTop > scrollHeight - viewportHeight) {
						continue;
					}
					const layout = createFitLayout(linesLayout, paddingTop, scrollTop);
					const plainLayout = createFitLayout(plainLinesLayout, paddingTop, plainLinesLayout.getVerticalOffsetForLineNumber(lineNumber) + fraction * lineHeight);
					maxDrift = Math.max(maxDrift, Math.abs(layout.sliderTop - plainLayout.sliderTop));
					if (MinimapLayout.getScrollTopFromZoneFreeScrollTop(linesLayout, lineCount, lineHeight, paddingTop, viewportHeight, layout.scrollTop, scrollHeight) !== scrollTop) {
						roundTripMismatches++;
					}
				}
			}
			return { maxDrift, roundTripMismatches };
		}

		const tallZone = createLinesLayout(0, [], [[100, 3000]]);
		const paddingTallerLinesAndZones = createLinesLayout(30, [new CustomLineHeightData('a', 50, 50, 300), new CustomLineHeightData('b', 400, 400, 120)], [[200, 500], [600, 1000]]);

		assert.deepStrictEqual({
			tallZone: compare(tallZone, createLinesLayout(0, [], []), 0),
			paddingTallerLinesAndZones: compare(paddingTallerLinesAndZones, createLinesLayout(30, [], []), 30),
			// The zone between lines 100 and 101 spans scrollTop 2000 to 5000
			sliderTopWhileTallZoneScrollsBy: [...new Set([2000, 3000, 4000, 4990, 5000].map(scrollTop => createFitLayout(tallZone, 0, scrollTop).sliderTop))],
			sliderTopAtMaxScrollTop: createFitLayout(tallZone, 0, tallZone.getLinesTotalHeight() - viewportHeight).sliderTop,
		}, {
			tallZone: { maxDrift: 0, roundTripMismatches: 0 },
			paddingTallerLinesAndZones: { maxDrift: 0, roundTripMismatches: 0 },
			sliderTopWhileTallZoneScrollsBy: [40],
			sliderTopAtMaxScrollTop: 392,
		});
	});

	test('fit/fill slider position does not map back to editor positions inside a view zone or past the last lines', () => {
		function roundTrip(linesLayout: LinesLayout, scrollTop: number): [zoneFreeScrollTop: number, scrollTop: number] {
			const scrollHeight = linesLayout.getLinesTotalHeight();
			const viewport = linesLayout.getLinesViewportData(scrollTop, scrollTop + viewportHeight);
			const zoneFreeScrollTop = MinimapLayout.getZoneFreeScrollPosition(linesLayout, lineCount, lineHeight, 0, viewport.startLineNumber, viewportHeight, scrollTop, scrollHeight).scrollTop;
			return [zoneFreeScrollTop, MinimapLayout.getScrollTopFromZoneFreeScrollTop(linesLayout, lineCount, lineHeight, 0, viewportHeight, zoneFreeScrollTop, scrollHeight)];
		}

		// The zone between lines 100 and 101 spans scrollTop 2000 to 5000
		const tallZone = createLinesLayout(0, [], [[100, 3000]]);
		// The zone between lines 990 and 991 spans scrollTop 19800 to 22800, the editor scrolls to 22600 and the lines alone to 19600
		const zoneNearEnd = createLinesLayout(0, [], [[990, 3000]]);

		assert.deepStrictEqual({
			insideZone: roundTrip(tallZone, 3000),
			nearEnd: [19600, 21000, 22600].map(scrollTop => roundTrip(zoneNearEnd, scrollTop)),
			// Dragging the slider down past the lines still reaches the end of the editor
			pastLinesEnd: MinimapLayout.getScrollTopFromZoneFreeScrollTop(zoneNearEnd, lineCount, lineHeight, 0, viewportHeight, 19700, zoneNearEnd.getLinesTotalHeight()),
		}, {
			insideZone: [2000, 5000],
			nearEnd: [[19600, 22600], [19600, 22600], [19600, 22600]],
			pastLinesEnd: 22600,
		});
	});
});

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
});

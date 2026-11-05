/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { fromZoneFreeVerticalOffset, IMinimapWhitespace, MinimapLayout, toZoneFreeVerticalOffset } from '../../../browser/viewParts/minimap/minimap.js';

suite('MinimapLayout', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const LINE_HEIGHT = 20;
	const VIEWPORT_HEIGHT = 400;
	const LINE_COUNT = 1000;
	const MINIMAP_LINE_HEIGHT = 2;

	function createOptions(minimapHeightIsEditorHeight: boolean): Parameters<typeof MinimapLayout.create>[0] {
		return {
			pixelRatio: 1,
			minimapLineHeight: MINIMAP_LINE_HEIGHT,
			canvasInnerHeight: VIEWPORT_HEIGHT,
			lineHeight: LINE_HEIGHT,
			minimapHeightIsEditorHeight,
			minimapHeight: VIEWPORT_HEIGHT,
			paddingTop: 0,
			paddingBottom: 0,
			scrollBeyondLastLine: false,
		};
	}

	/**
	 * Lay out `LINE_COUNT` lines and the given view zones like the editor does, and compute the minimap layout at `scrollTop`.
	 */
	function layoutAt(minimapHeightIsEditorHeight: boolean, zones: { afterLineNumber: number; height: number }[], scrollTop: number, previousLayout: MinimapLayout | null): MinimapLayout {
		const whitespaces: IMinimapWhitespace[] = zones.map(zone => ({ zoneFreeVerticalOffset: zone.afterLineNumber * LINE_HEIGHT, height: zone.height }));
		const zonesHeightBefore = (lineNumber: number) => zones.filter(zone => zone.afterLineNumber < lineNumber).reduce((sum, zone) => sum + zone.height, 0);

		let viewportStartLineNumber = 1;
		while ((viewportStartLineNumber - 1) * LINE_HEIGHT + zonesHeightBefore(viewportStartLineNumber) + LINE_HEIGHT <= scrollTop) {
			viewportStartLineNumber++;
		}

		return MinimapLayout.create(
			createOptions(minimapHeightIsEditorHeight),
			viewportStartLineNumber,
			(viewportStartLineNumber - 1) * LINE_HEIGHT,
			VIEWPORT_HEIGHT,
			LINE_COUNT,
			LINE_COUNT,
			scrollTop,
			toZoneFreeVerticalOffset(whitespaces, scrollTop),
			LINE_COUNT * LINE_HEIGHT,
			previousLayout
		);
	}

	/**
	 * Scroll from `from` to `to` and collect the slider positions in the minimap document, the slider heights and the minimap start lines.
	 */
	function scroll(minimapHeightIsEditorHeight: boolean, zones: { afterLineNumber: number; height: number }[], from: number, to: number, step: number) {
		const sliderTops: number[] = [];
		const sliderHeights = new Set<number>();
		const startLineNumbers: number[] = [];
		let previousLayout: MinimapLayout | null = null;
		for (let scrollTop = from; step > 0 ? scrollTop <= to : scrollTop >= to; scrollTop += step) {
			const layout: MinimapLayout = layoutAt(minimapHeightIsEditorHeight, zones, scrollTop, previousLayout);
			// The minimap content scrolls under the slider, so measure the slider against the document
			sliderTops.push(layout.sliderTop + (layout.startLineNumber - 1 - layout.topPaddingLineCount) * MINIMAP_LINE_HEIGHT);
			sliderHeights.add(layout.sliderHeight);
			startLineNumbers.push(layout.startLineNumber);
			previousLayout = layout;
		}
		return { sliderTops, sliderHeights: [...sliderHeights], startLineNumbers };
	}

	function isMonotonic(values: number[], direction: 1 | -1): boolean {
		return values.every((value, i) => i === 0 || direction * (value - values[i - 1]) >= 0);
	}

	test('zone-free vertical offsets', () => {
		// Lines are 20px high: a 100px view zone after line 5 and two 50px view zones after line 10
		const whitespaces: IMinimapWhitespace[] = [
			{ zoneFreeVerticalOffset: 100, height: 100 },
			{ zoneFreeVerticalOffset: 200, height: 50 },
			{ zoneFreeVerticalOffset: 200, height: 50 },
		];
		const offsets = [0, 99, 100, 150, 199, 200, 250, 299, 300, 350, 400, 420];
		assert.deepStrictEqual(
			offsets.map(offset => {
				const zoneFree = toZoneFreeVerticalOffset(whitespaces, offset);
				return [offset, zoneFree, fromZoneFreeVerticalOffset(whitespaces, zoneFree)];
			}),
			[
				[0, 0, 0],
				[99, 99, 99],
				// inside the first view zone: pinned to its start, which maps back to before the view zone
				[100, 100, 100],
				[150, 100, 100],
				[199, 100, 100],
				[200, 100, 100],
				[250, 150, 250],
				[299, 199, 299],
				// inside the view zones after line 10
				[300, 200, 300],
				[350, 200, 300],
				[400, 200, 300],
				[420, 220, 420],
			]
		);
	});

	test('without view zones, the slider has a stable height and moves with the scroll position', () => {
		const result = scroll(false, [], 0, LINE_COUNT * LINE_HEIGHT - VIEWPORT_HEIGHT, 10);
		assert.deepStrictEqual(
			{ sliderHeights: result.sliderHeights, monotonic: isMonotonic(result.sliderTops, 1), first: result.sliderTops[0], last: result.sliderTops[result.sliderTops.length - 1] },
			{ sliderHeights: [40], monotonic: true, first: 0, last: (LINE_COUNT - VIEWPORT_HEIGHT / LINE_HEIGHT) * MINIMAP_LINE_HEIGHT }
		);
	});

	test('the slider stays still while a view zone scrolls through the viewport, then continues (#290138)', () => {
		const zones = [{ afterLineNumber: 100, height: 3000 }];
		const down = scroll(false, zones, 1500, 6000, 10);
		const up = scroll(false, zones, 6000, 1500, -10);
		const sliderTopsInsideZone = new Set(down.sliderTops.filter((_, i) => {
			const scrollTop = 1500 + i * 10;
			return scrollTop >= 2000 && scrollTop <= 5000;
		}));
		assert.deepStrictEqual(
			{
				sliderHeights: [...down.sliderHeights, ...up.sliderHeights],
				monotonicDown: isMonotonic(down.sliderTops, 1),
				monotonicUp: isMonotonic(up.sliderTops, -1),
				startLineNumbersMonotonicDown: isMonotonic(down.startLineNumbers, 1),
				startLineNumbersMonotonicUp: isMonotonic(up.startLineNumbers, -1),
				sliderTopsInsideZone: [...sliderTopsInsideZone],
			},
			{
				sliderHeights: [40, 40],
				monotonicDown: true,
				monotonicUp: true,
				startLineNumbersMonotonicDown: true,
				startLineNumbersMonotonicUp: true,
				sliderTopsInsideZone: [down.sliderTops[(2000 - 1500) / 10]],
			}
		);
	});

	test('with minimap.size fit or fill, the slider ignores view zones (#149849)', () => {
		const zones = [{ afterLineNumber: 100, height: 3000 }, { afterLineNumber: 500, height: 1000 }];
		const result = scroll(true, zones, 0, LINE_COUNT * LINE_HEIGHT + 4000 - VIEWPORT_HEIGHT, 10);
		assert.deepStrictEqual(
			{
				sliderHeights: result.sliderHeights,
				monotonic: isMonotonic(result.sliderTops, 1),
				first: result.sliderTops[0],
				last: result.sliderTops[result.sliderTops.length - 1],
				// the same position as without view zones
				atLine300: layoutAt(true, zones, 299 * LINE_HEIGHT + 3000, null).sliderTop === layoutAt(true, [], 299 * LINE_HEIGHT, null).sliderTop,
			},
			{
				sliderHeights: [8],
				monotonic: true,
				first: 0,
				last: VIEWPORT_HEIGHT - 8,
				atLine300: true,
			}
		);
	});

	test('dragging the slider moves the editor past a view zone instead of into it', () => {
		const zones = [{ afterLineNumber: 100, height: 3000 }];
		const whitespaces: IMinimapWhitespace[] = [{ zoneFreeVerticalOffset: 2000, height: 3000 }];
		const layout = layoutAt(false, zones, 1900, null);
		const scrollTops = [0, 1, 2, 3, 4, 5, 10, 20].map(delta => fromZoneFreeVerticalOffset(whitespaces, layout.getDesiredZoneFreeScrollTopFromDelta(delta)));
		assert.deepStrictEqual(
			{
				first: scrollTops[0],
				increasing: scrollTops.every((scrollTop, i) => i === 0 || scrollTop > scrollTops[i - 1]),
				insideZone: scrollTops.filter(scrollTop => scrollTop > 2000 && scrollTop < 5000),
			},
			{ first: 1900, increasing: true, insideZone: [] }
		);
	});
});

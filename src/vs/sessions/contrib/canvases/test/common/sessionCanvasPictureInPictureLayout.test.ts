/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { constrainCanvasSize, estimateCanvasVelocity, getCanvasCornerPositions, getCanvasPlacementArea, getCanvasPresetSize, getCanvasReleaseTarget, getCanvasRevealCorner, getCanvasStashX, rubberBand, stepCanvasSpring } from '../../common/sessionCanvasPictureInPictureLayout.js';

suite('SessionCanvasPictureInPictureLayout', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const container = { width: 1000, height: 700 };
	const area = getCanvasPlacementArea(container, 40);
	const size = { width: 360, height: 226 };

	test('places canvases in corners below the title bar', () => {
		assert.deepStrictEqual({ area, corners: getCanvasCornerPositions(area, size) }, {
			area: { x: 12, y: 52, width: 976, height: 636 },
			corners: [{ x: 12, y: 52 }, { x: 628, y: 52 }, { x: 12, y: 462 }, { x: 628, y: 462 }],
		});
	});

	test('projects a release to the nearest corner, or tucks it at a side when tossed or pushed past an edge', () => {
		const release = (x: number, y: number, vx = 0, vy = 0) => getCanvasReleaseTarget({ x, y, ...size }, { x: vx, y: vy }, container.width, area);
		assert.deepStrictEqual({
			resting: release(600, 440),
			flickedUp: release(100, 400, 0, -2000),
			tossedLeft: release(300, 200, -3000),
			pushedRight: release(820, 100),
			nudgedRight: release(700, 100),
		}, {
			resting: { kind: 'corner', corner: 3, x: 628, y: 462 },
			flickedUp: { kind: 'corner', corner: 0, x: 12, y: 52 },
			tossedLeft: { kind: 'stash', side: 'left', y: 200 },
			pushedRight: { kind: 'stash', side: 'right', y: 100 },
			nudgedRight: { kind: 'corner', corner: 1, x: 628, y: 52 },
		});
	});

	test('tucks a canvas behind a sliver that grows on hover and reveals it in the nearest corner on that side', () => {
		assert.deepStrictEqual({
			left: getCanvasStashX('left', 360, 1000, false),
			rightPeek: getCanvasStashX('right', 360, 1000, true),
			revealLow: getCanvasRevealCorner('right', area, 400, size),
			revealHigh: getCanvasRevealCorner('left', area, 60, size),
		}, { left: -332, rightPeek: 960, revealLow: 3, revealHigh: 0 });
	});

	test('rubber-bands movement beyond a boundary and estimates velocity from recent samples only', () => {
		const samples = [{ x: 0, y: 0, time: 0 }, { x: 10, y: 0, time: 100 }, { x: 40, y: 20, time: 150 }, { x: 100, y: 20, time: 180 }];
		assert.deepStrictEqual({
			inside: rubberBand(50, 0, 100),
			above: rubberBand(-90, 0, 100),
			below: rubberBand(190, 0, 100),
			velocity: estimateCanvasVelocity(samples, 180),
			stale: estimateCanvasVelocity(samples, 400),
		}, { inside: 50, above: -33.75, below: 133.75, velocity: { x: 1125, y: 250 }, stale: { x: 0, y: 0 } });
	});

	test('springs settle exactly on their target', () => {
		const spring = { value: 0, velocity: 0 };
		let frames = 0;
		while (!stepCanvasSpring(spring, 100, 1 / 60) && frames < 600) {
			frames++;
		}
		assert.deepStrictEqual({ spring, withinHalfASecond: frames < 30 }, { spring: { value: 100, velocity: 0 }, withinHalfASecond: true });
	});

	test('constrains sizes to the window and steps through presets', () => {
		assert.deepStrictEqual({
			free: constrainCanvasSize({ width: 2000, height: 10 }, area),
			locked: constrainCanvasSize({ width: 100, height: 0 }, area, 1.6),
			larger: getCanvasPresetSize(360, 1, false),
			cycled: getCanvasPresetSize(480, 1, true),
			clamped: getCanvasPresetSize(480, 1, false),
		}, {
			free: { width: 720, height: 140 },
			locked: { width: 224, height: 140 },
			larger: { width: 480, height: 300 },
			cycled: { width: 280, height: 176 },
			clamped: { width: 480, height: 300 },
		});
	});
});

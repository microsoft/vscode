/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { avoidWindowControlsOverlay, IWindowControlsOverlayPosition, IWindowControlsOverlayTitlebarRect, IWindowControlsOverlayViewport } from '../../../../browser/ui/contextview/windowControlsOverlay.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

suite('avoidWindowControlsOverlay', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const rect: IWindowControlsOverlayTitlebarRect = { x: 100, y: 0, width: 600, height: 30 };
	const viewport: IWindowControlsOverlayViewport = { top: 0, left: 0, width: 800, height: 600 };
	const shortViewport: IWindowControlsOverlayViewport = { top: 0, left: 0, width: 800, height: 60 };
	const view = { width: 50, height: 50 };

	test('returns the same position when no adjustment is needed', () => {
		const cases: [string, IWindowControlsOverlayTitlebarRect | undefined, IWindowControlsOverlayPosition][] = [
			['no overlay', undefined, { top: 0, left: 0 }],
			['non-finite rect', { x: Number.NaN, y: 0, width: 600, height: 30 }, { top: 0, left: 0 }],
			['zero height rect', { x: 100, y: 0, width: 600, height: 0 }, { top: 0, left: 0 }],
			['inside titlebar area', rect, { top: 0, left: 300 }],
			['touching band bottom', rect, { top: 30, left: 0 }],
			['touching left strip end', rect, { top: 0, left: 100 }],
			['touching right strip start', rect, { top: 0, left: 650 }],
			['area covers the whole width', { x: -50, y: 0, width: 2000, height: 30 }, { top: 0, left: 0 }],
		];

		assert.deepStrictEqual(
			cases.map(([name, r, position]) => [name, avoidWindowControlsOverlay(r, viewport, view, position) === position]),
			cases.map(([name]) => [name, true])
		);
	});

	test('adjusts positions that cover the window controls', () => {
		assert.deepStrictEqual({
			leftStrip: avoidWindowControlsOverlay(rect, viewport, view, { top: 0, left: 0 }),
			rightStrip: avoidWindowControlsOverlay(rect, viewport, view, { top: 0, left: 750 }),
			scrolled: avoidWindowControlsOverlay(rect, { top: 200, left: 300, width: 800, height: 600 }, view, { top: 200, left: 300 }),
			shiftLeftStrip: avoidWindowControlsOverlay(rect, shortViewport, { width: 50, height: 40 }, { top: 0, left: 0 }),
			shiftRightStrip: avoidWindowControlsOverlay(rect, shortViewport, { width: 50, height: 40 }, { top: 0, left: 750 }),
			spansBothStrips: avoidWindowControlsOverlay(rect, shortViewport, { width: 800, height: 40 }, { top: 0, left: 0 }),
			shiftBlockedByOtherStrip: avoidWindowControlsOverlay({ x: 100, y: 0, width: 20, height: 30 }, shortViewport, { width: 50, height: 40 }, { top: 0, left: 0 }),
			bandClampedToViewport: avoidWindowControlsOverlay({ x: 100, y: 0, width: 600, height: 1000 }, viewport, view, { top: 0, left: 0 }),
		}, {
			leftStrip: { top: 30, left: 0 },
			rightStrip: { top: 30, left: 750 },
			scrolled: { top: 230, left: 300 },
			shiftLeftStrip: { top: 0, left: 100 },
			shiftRightStrip: { top: 0, left: 650 },
			spansBothStrips: { top: 30, left: 0 },
			shiftBlockedByOtherStrip: { top: 30, left: 0 },
			bandClampedToViewport: { top: 0, left: 100 },
		});
	});
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IBrowserViewBounds } from '../../common/browserView.js';
import { getBrowserViewNativeLayout, getBrowserViewScreenshotClip } from '../../electron-main/browserViewLayout.js';

suite('BrowserViewLayout', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('uses the largest corner radius on the live native view', () => {
		const bounds = (cornerRadius: number, bottomRightCornerRadius: number, zoomFactor = 1): IBrowserViewBounds => ({
			windowId: 1,
			x: 10,
			y: 20,
			width: 100,
			height: 80,
			zoomFactor,
			cornerRadius,
			bottomRightCornerRadius,
		});

		assert.deepStrictEqual({
			uniform: getBrowserViewNativeLayout(bounds(4, 4)),
			nativeFacingLarger: getBrowserViewNativeLayout(bounds(4, 8)),
			panelFacingLarger: getBrowserViewNativeLayout(bounds(8, 4)),
			zoomed: getBrowserViewNativeLayout(bounds(4, 8, 1.25)),
		}, {
			uniform: {
				viewBounds: { x: 10, y: 20, width: 100, height: 80 },
				viewCornerRadius: 4,
			},
			nativeFacingLarger: {
				viewBounds: { x: 10, y: 20, width: 100, height: 80 },
				viewCornerRadius: 8,
			},
			panelFacingLarger: {
				viewBounds: { x: 10, y: 20, width: 100, height: 80 },
				viewCornerRadius: 8,
			},
			zoomed: {
				viewBounds: { x: 13, y: 25, width: 125, height: 100 },
				viewCornerRadius: 10,
			},
		});
	});

	test('captures the visible page viewport without the native clip', () => {
		const viewBounds = { x: 10, y: 20, width: 100, height: 80 };

		assert.deepStrictEqual({
			defaultZoom: getBrowserViewScreenshotClip(viewBounds, { pageX: 12, pageY: 34, scale: 1 }, 1),
			browserZoom: getBrowserViewScreenshotClip(viewBounds, { pageX: 12, pageY: 34, scale: 1 }, 1.25),
			pinchZoom: getBrowserViewScreenshotClip(viewBounds, { pageX: 12, pageY: 34, scale: 2 }, 1.25),
		}, {
			defaultZoom: { x: 12, y: 34, width: 100, height: 80, scale: 1 },
			browserZoom: { x: 15, y: 42.5, width: 100, height: 80, scale: 1 },
			pinchZoom: { x: 15, y: 42.5, width: 50, height: 40, scale: 1 },
		});
	});
});

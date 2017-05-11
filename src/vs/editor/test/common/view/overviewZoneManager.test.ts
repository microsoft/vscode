/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { OverviewRulerLane } from 'vs/editor/common/editorCommon';
import { OverviewZoneManager, ColorZone, OverviewRulerZone } from 'vs/editor/common/view/overviewZoneManager';
import { LIGHT } from 'vs/platform/theme/common/themeService';

suite('Editor View - OverviewZoneManager', () => {

	test('pixel ratio 1, dom height 600', () => {
		const LINE_COUNT = 50;
		const LINE_HEIGHT = 20;
		let manager = new OverviewZoneManager((lineNumber) => LINE_HEIGHT * lineNumber);
		manager.setMinimumHeight(6);
		manager.setMaximumHeight(6);
		manager.setThemeType(LIGHT);
		manager.setDOMWidth(30);
		manager.setDOMHeight(600);
		manager.setOuterHeight(LINE_COUNT * LINE_HEIGHT);
		manager.setLineHeight(LINE_HEIGHT);
		manager.setPixelRatio(1);

		manager.setZones([
			new OverviewRulerZone(1, 1, OverviewRulerLane.Full, 10, '1', '1', '1'),
			new OverviewRulerZone(10, 10, OverviewRulerLane.Full, 0, '2', '2', '2'),
			new OverviewRulerZone(30, 31, OverviewRulerLane.Full, 0, '3', '3', '3'),
			new OverviewRulerZone(50, 50, OverviewRulerLane.Full, 0, '4', '4', '4'),
		]);

		// one line = 12, but cap is at 6
		assert.deepEqual(manager.resolveColorZones(), [
			new ColorZone(12, 22, 1, OverviewRulerLane.Full), // forced height of 10
			new ColorZone(123, 129, 2, OverviewRulerLane.Full), // 120 -> 132
			new ColorZone(363, 369, 3, OverviewRulerLane.Full), // 360 -> 372 [360 -> 384]
			new ColorZone(375, 381, 3, OverviewRulerLane.Full), // 372 -> 384 [360 -> 384]
			new ColorZone(594, 600, 4, OverviewRulerLane.Full), // 588 -> 600
		]);
	});

	test('pixel ratio 1, dom height 300', () => {
		const LINE_COUNT = 50;
		const LINE_HEIGHT = 20;
		let manager = new OverviewZoneManager((lineNumber) => LINE_HEIGHT * lineNumber);
		manager.setMinimumHeight(6);
		manager.setMaximumHeight(6);
		manager.setThemeType(LIGHT);
		manager.setDOMWidth(30);
		manager.setDOMHeight(300);
		manager.setOuterHeight(LINE_COUNT * LINE_HEIGHT);
		manager.setLineHeight(LINE_HEIGHT);
		manager.setPixelRatio(1);

		manager.setZones([
			new OverviewRulerZone(1, 1, OverviewRulerLane.Full, 10, '1', '1', '1'),
			new OverviewRulerZone(10, 10, OverviewRulerLane.Full, 0, '2', '2', '2'),
			new OverviewRulerZone(30, 31, OverviewRulerLane.Full, 0, '3', '3', '3'),
			new OverviewRulerZone(50, 50, OverviewRulerLane.Full, 0, '4', '4', '4'),
		]);

		// one line = 6, cap is at 6
		assert.deepEqual(manager.resolveColorZones(), [
			new ColorZone(6, 16, 1, OverviewRulerLane.Full), // forced height of 10
			new ColorZone(60, 66, 2, OverviewRulerLane.Full), // 60 -> 66
			new ColorZone(180, 192, 3, OverviewRulerLane.Full), // 180 -> 192
			new ColorZone(294, 300, 4, OverviewRulerLane.Full), // 294 -> 300
		]);
	});

	test('pixel ratio 2, dom height 300', () => {
		const LINE_COUNT = 50;
		const LINE_HEIGHT = 20;
		let manager = new OverviewZoneManager((lineNumber) => LINE_HEIGHT * lineNumber);
		manager.setMinimumHeight(6);
		manager.setMaximumHeight(6);
		manager.setThemeType(LIGHT);
		manager.setDOMWidth(30);
		manager.setDOMHeight(300);
		manager.setOuterHeight(LINE_COUNT * LINE_HEIGHT);
		manager.setLineHeight(LINE_HEIGHT);
		manager.setPixelRatio(2);

		manager.setZones([
			new OverviewRulerZone(1, 1, OverviewRulerLane.Full, 10, '1', '1', '1'),
			new OverviewRulerZone(10, 10, OverviewRulerLane.Full, 0, '2', '2', '2'),
			new OverviewRulerZone(30, 31, OverviewRulerLane.Full, 0, '3', '3', '3'),
			new OverviewRulerZone(50, 50, OverviewRulerLane.Full, 0, '4', '4', '4'),
		]);

		// one line = 6, cap is at 12
		assert.deepEqual(manager.resolveColorZones(), [
			new ColorZone(12, 32, 1, OverviewRulerLane.Full), // forced height of 10 => forced height of 20
			new ColorZone(120, 132, 2, OverviewRulerLane.Full), // 120 -> 132
			new ColorZone(360, 384, 3, OverviewRulerLane.Full), // 360 -> 384
			new ColorZone(588, 600, 4, OverviewRulerLane.Full), // 588 -> 600
		]);
	});
});

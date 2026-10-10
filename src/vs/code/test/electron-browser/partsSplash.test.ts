/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { IPartsSplash } from '../../../platform/theme/common/themeService.js';
import { ThemeTypeSelector } from '../../../platform/theme/common/theme.js';
import { getPartsSplashColors, getPartsSplashLayoutMetrics } from '../../electron-browser/workbench/partsSplash.js';

suite('Parts splash layout', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps compact edges flush and square with and without saved part bounds', () => {
		const layoutInfo = new class extends mock<NonNullable<IPartsSplash['layoutInfo']>>() {
			override modernUI = true;
			override modernUICompact = true;
			override partBounds = {
				activityBar: { top: 35, left: 0, width: 40, height: 600 },
				sideBar: { top: 35, left: 40, width: 200, height: 600 },
				editor: { top: 35, left: 240, width: 560, height: 400 },
				panel: { top: 435, left: 240, width: 560, height: 200 },
				auxiliaryBar: { top: 35, left: 800, width: 200, height: 600 },
			};
		}();

		const expected = {
			floatingMargin: 0,
			floatingOuterMargin: 0,
			floatingBorderWidth: 1,
			floatingBorderRadius: 0,
		};
		assert.deepStrictEqual({
			savedBounds: getPartsSplashLayoutMetrics(layoutInfo),
			fallback: getPartsSplashLayoutMetrics({ ...layoutInfo, partBounds: undefined }),
		}, {
			savedBounds: expected,
			fallback: expected,
		});
	});

	test('preserves default-density gutters and rounded corners', () => {
		const layoutInfo = new class extends mock<NonNullable<IPartsSplash['layoutInfo']>>() {
			override modernUI = true;
			override modernUICompact = false;
		}();

		assert.deepStrictEqual(getPartsSplashLayoutMetrics(layoutInfo), {
			floatingMargin: 4,
			floatingOuterMargin: 4,
			floatingBorderWidth: 1,
			floatingBorderRadius: 8,
		});
	});
});

suite('Parts splash colors', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function createSplash(modernUI: boolean): IPartsSplash {
		return {
			baseTheme: ThemeTypeSelector.VS_DARK,
			zoomLevel: undefined,
			colorInfo: new class extends mock<IPartsSplash['colorInfo']>() {
				override background = '#101010';
				override editorBackground = '#202020';
				override titleBarBackground = '#303030';
				override titleBarInactiveBackground = '#404040';
				override modernUIShellBackground = '#505050';
				override modernUIInactiveShellBackground = '#606060';
				override statusBarBackground = '#707070';
				override statusBarInactiveBackground = '#808080';
				override statusBarNoFolderBackground = '#909090';
			}(),
			layoutInfo: new class extends mock<NonNullable<IPartsSplash['layoutInfo']>>() {
				override modernUI = modernUI;
			}(),
		};
	}

	for (const modernUI of [false, true]) {
		test(`keeps shell and bar colors independent with modern UI ${modernUI}`, () => {
			const splash = createSplash(modernUI);
			assert.deepStrictEqual({
				active: getPartsSplashColors(splash, true, true),
				inactive: getPartsSplashColors(splash, false, true),
				empty: getPartsSplashColors(splash, false, false),
			}, {
				active: {
					background: modernUI ? '#505050' : '#202020',
					titleBarBackground: '#303030',
					statusBarBackground: '#707070',
				},
				inactive: {
					background: modernUI ? '#606060' : '#202020',
					titleBarBackground: '#404040',
					statusBarBackground: '#808080',
				},
				empty: {
					background: modernUI ? '#606060' : '#202020',
					titleBarBackground: '#404040',
					statusBarBackground: '#909090',
				},
			});
		});
	}

	test('supports older splash data without inactive or shell colors', () => {
		const splash = createSplash(true);
		splash.colorInfo.titleBarInactiveBackground = undefined;
		splash.colorInfo.modernUIShellBackground = undefined;
		splash.colorInfo.modernUIInactiveShellBackground = undefined;
		splash.colorInfo.statusBarInactiveBackground = undefined;

		assert.deepStrictEqual(getPartsSplashColors(splash, false, true), {
			background: '#303030',
			titleBarBackground: '#303030',
			statusBarBackground: '#707070',
		});
	});

	test('retains the active shell when the inactive shell color is absent', () => {
		const splash = createSplash(true);
		splash.colorInfo.modernUIInactiveShellBackground = undefined;

		assert.deepStrictEqual(getPartsSplashColors(splash, false, true), {
			background: '#505050',
			titleBarBackground: '#404040',
			statusBarBackground: '#808080',
		});
	});

	test('does not treat a transparent customization as a missing color', () => {
		const splash = createSplash(true);
		splash.colorInfo.statusBarInactiveBackground = '#00000000';

		assert.deepStrictEqual(getPartsSplashColors(splash, false, true), {
			background: '#606060',
			titleBarBackground: '#404040',
			statusBarBackground: '#00000000',
		});
	});
});

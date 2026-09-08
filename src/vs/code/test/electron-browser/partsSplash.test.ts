/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { IPartsSplash } from '../../../platform/theme/common/themeService.js';
import { ThemeTypeSelector } from '../../../platform/theme/common/theme.js';
import { getPartsSplashColors } from '../../electron-browser/workbench/partsSplash.js';

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

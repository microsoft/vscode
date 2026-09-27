/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { ThemeTypeSelector } from '../../../platform/theme/common/theme.js';
import { IPartsSplash } from '../../../platform/theme/common/themeService.js';
import { getPartsSplashColors } from '../../electron-browser/workbench/partsSplash.js';

suite('Parts splash colors', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function createSplash(): IPartsSplash {
		return {
			baseTheme: ThemeTypeSelector.VS_DARK,
			zoomLevel: undefined,
			colorInfo: new class extends mock<IPartsSplash['colorInfo']>() {
				override background = '#101010';
				override editorBackground = '#202020';
				override titleBarBackground = '#303030';
				override titleBarInactiveBackground = '#404040';
				override statusBarBackground = '#707070';
				override statusBarInactiveBackground = '#808080';
				override statusBarNoFolderBackground = '#909090';
			}(),
			layoutInfo: undefined,
		};
	}

	test('keeps editor, title bar, and status bar colors independent', () => {
		const splash = createSplash();
		assert.deepStrictEqual({
			active: getPartsSplashColors(splash, true, true),
			inactive: getPartsSplashColors(splash, false, true),
			empty: getPartsSplashColors(splash, false, false),
		}, {
			active: {
				background: '#202020',
				titleBarBackground: '#303030',
				statusBarBackground: '#707070',
			},
			inactive: {
				background: '#202020',
				titleBarBackground: '#404040',
				statusBarBackground: '#808080',
			},
			empty: {
				background: '#202020',
				titleBarBackground: '#404040',
				statusBarBackground: '#909090',
			},
		});
	});

	test('falls back to active colors when inactive colors are absent', () => {
		const splash = createSplash();
		splash.colorInfo.titleBarInactiveBackground = undefined;
		splash.colorInfo.statusBarInactiveBackground = undefined;

		assert.deepStrictEqual(getPartsSplashColors(splash, false, true), {
			background: '#202020',
			titleBarBackground: '#303030',
			statusBarBackground: '#707070',
		});
	});

	test('does not treat a transparent customization as a missing color', () => {
		const splash = createSplash();
		splash.colorInfo.statusBarInactiveBackground = '#00000000';

		assert.deepStrictEqual(getPartsSplashColors(splash, false, true), {
			background: '#202020',
			titleBarBackground: '#404040',
			statusBarBackground: '#00000000',
		});
	});
});

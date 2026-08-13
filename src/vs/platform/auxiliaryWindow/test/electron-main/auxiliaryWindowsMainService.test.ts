/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { WindowMode } from '../../../window/electron-main/window.js';
import { parseAuxiliaryWindowFeatures, shouldApplyAuxiliaryWindowState } from '../../electron-main/auxiliaryWindowFeatures.js';

suite('AuxiliaryWindowsMainService', () => {

	test('parses desktop overlay features', () => {
		const parsed = parseAuxiliaryWindowFeatures([
			'popup=yes',
			'left=120',
			'top=80',
			'width=400',
			'height=240',
			'window-show-inactive=yes',
			'window-always-on-top-level=screen-saver',
			'window-not-focusable=yes',
			'window-nonactivating-panel=yes',
			'window-parentless=yes',
			'window-skip-taskbar=yes',
			'window-visible-on-all-workspaces=yes',
			'window-visible-on-full-screen=yes',
			'window-no-background-throttling=yes',
			'window-background-color=#12345678'
		].join(','));

		assert.deepStrictEqual(parsed, {
			windowState: {
				x: 120,
				y: 80,
				width: 400,
				height: 240
			},
			overrides: {
				noBackgroundThrottling: true,
				backgroundColor: '#12345678'
			},
			showInactive: true,
			showHidden: false,
			alwaysOnTopLevel: 'screen-saver',
			focusable: false,
			nonActivatingPanel: true,
			parentless: true,
			skipTaskbar: true,
			visibleOnAllWorkspaces: true,
			visibleOnFullScreen: true
		});
	});

	test('keeps inactive normal windows distinct from maximized windows', () => {
		const inactive = parseAuxiliaryWindowFeatures('window-show-inactive=yes');
		const maximized = parseAuxiliaryWindowFeatures('window-maximized=yes');
		const hidden = parseAuxiliaryWindowFeatures('window-show-hidden=yes');

		assert.strictEqual(inactive.windowState.mode, undefined);
		assert.strictEqual(inactive.showInactive, true);
		assert.strictEqual(inactive.showHidden, false);
		assert.strictEqual(inactive.alwaysOnTopLevel, undefined);
		assert.strictEqual(inactive.focusable, true);
		assert.strictEqual(inactive.nonActivatingPanel, false);
		assert.strictEqual(inactive.parentless, false);
		assert.strictEqual(maximized.windowState.mode, WindowMode.Maximized);
		assert.strictEqual(maximized.showInactive, false);
		assert.strictEqual(maximized.showHidden, false);
		assert.strictEqual(hidden.showHidden, true);
	});

	test('waits to apply inactive state until the BrowserWindow is claimed', () => {
		assert.deepStrictEqual([
			shouldApplyAuxiliaryWindowState(false, true, false),
			shouldApplyAuxiliaryWindowState(true, false, false),
			shouldApplyAuxiliaryWindowState(true, true, true),
			shouldApplyAuxiliaryWindowState(true, true, false),
		], [
			false,
			false,
			false,
			true,
		]);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});

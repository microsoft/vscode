/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DEFAULT_BROWSER_DEVICE_PRESETS, resolveBrowserDevicePresets } from '../../common/browserDevicePresets.js';

suite('Browser device presets', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('non-arrays leave the built-in presets unchanged', () => {
		for (const configured of [undefined, null, {}, 'MacBook', 1512]) {
			const resolved = resolveBrowserDevicePresets(configured);
			assert.strictEqual(resolved.builtins, DEFAULT_BROWSER_DEVICE_PRESETS);
			assert.deepStrictEqual(resolved.custom, []);
		}
	});

	test('appends a laptop preset and defaults mobile to false', () => {
		const resolved = resolveBrowserDevicePresets([
			{
				name: 'MacBook Pro 14"',
				width: 1512,
				height: 982,
				deviceScaleFactor: 2,
				mobile: false,
			},
		]);

		assert.strictEqual(resolved.builtins.length, DEFAULT_BROWSER_DEVICE_PRESETS.length);
		assert.deepStrictEqual(resolved.custom, [{
			name: 'MacBook Pro 14"',
			device: { width: 1512, height: 982, mobile: false, deviceScaleFactor: 2 },
		}]);
	});

	test('skips invalid entries and keeps valid neighbors', () => {
		const resolved = resolveBrowserDevicePresets([
			{ name: '   ', width: 800, height: 600 },
			{ name: 'Wide', width: '1440', height: 900 },
			{ name: 'Zero', width: 0, height: 800 },
			{ name: 'Bad mobile', width: 800, height: 600, mobile: 'false' },
			{ name: 'Bad scale', width: 800, height: 600, deviceScaleFactor: 0 },
			{ name: '  Laptop  ', width: 1440, height: 900 },
			null,
		]);

		assert.deepStrictEqual(resolved.custom, [{
			name: 'Laptop',
			device: { width: 1440, height: 900, mobile: false },
		}]);
	});

	test('a custom name replaces the built-in and later duplicates win in place', () => {
		const resolved = resolveBrowserDevicePresets([
			{ name: 'iPhone SE', width: 320, height: 568, mobile: true, deviceScaleFactor: 2 },
			{ name: 'Desktop', width: 1280, height: 800 },
			{ name: 'Desktop', width: 1920, height: 1080, deviceScaleFactor: 1, userAgent: '  custom-ua  ' },
		]);

		assert.deepStrictEqual(resolved.builtins.map(preset => preset.name), ['iPhone 15 Pro', 'Pixel 8', 'iPad Mini']);
		assert.deepStrictEqual(resolved.custom, [
			{
				name: 'iPhone SE',
				device: { width: 320, height: 568, mobile: true, deviceScaleFactor: 2 },
			},
			{
				name: 'Desktop',
				device: { width: 1920, height: 1080, mobile: false, deviceScaleFactor: 1, userAgent: 'custom-ua' },
			},
		]);
	});
});

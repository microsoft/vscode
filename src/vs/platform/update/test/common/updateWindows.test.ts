/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getWindowsArm64DownloadPlatform, getWindowsArm64DownloadUrl, shouldDisableUpdatesForWindowsX64OnArm64 } from '../../common/updateWindows.js';

suite('UpdateWindows', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('detects x64 builds running under ARM64 translation', () => {
		assert.strictEqual(shouldDisableUpdatesForWindowsX64OnArm64('x64', true), true);
		assert.strictEqual(shouldDisableUpdatesForWindowsX64OnArm64('x64', false), false);
		assert.strictEqual(shouldDisableUpdatesForWindowsX64OnArm64('arm64', true), false);
	});

	test('maps download targets to the ARM64 installer platform', () => {
		assert.strictEqual(getWindowsArm64DownloadPlatform('user'), 'win32-arm64-user');
		assert.strictEqual(getWindowsArm64DownloadPlatform('system'), 'win32-arm64');
		assert.strictEqual(getWindowsArm64DownloadPlatform(undefined), 'win32-arm64');
	});

	test('builds a versioned ARM64 download URL from the update service host', () => {
		assert.strictEqual(getWindowsArm64DownloadUrl({
			updateUrl: 'https://update.code.visualstudio.com/api/update',
			quality: 'stable',
			target: 'user',
			version: '1.99.0'
		}), 'https://update.code.visualstudio.com/1.99.0/win32-arm64-user/stable');
	});

	test('falls back to rewriting a configured download URL', () => {
		assert.strictEqual(getWindowsArm64DownloadUrl({
			downloadUrl: 'https://code.visualstudio.com/sha/download?build=stable&os=win32-x64-user',
			quality: 'insider',
			target: 'user',
			updateUrl: '',
			version: ''
		}), 'https://code.visualstudio.com/sha/download?build=insider&os=win32-arm64-user');
	});
});

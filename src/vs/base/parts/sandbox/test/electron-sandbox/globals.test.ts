/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ipcRenderer, process, webFrame, webUtils } from '../../electron-sandbox/globals.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../test/common/utils.js';

suite('Sandbox', () => {

	test('globals', async () => {
		assert.ok(typeof ipcRenderer.send === 'function');
		assert.ok(typeof webFrame.setZoomLevel === 'function');
		assert.ok(typeof process.platform === 'string');
		assert.ok(typeof webUtils.getPathForFile === 'function');
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});

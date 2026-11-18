/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ipcRenderer, process, webFrame, webUtils } from '../../electron-browser/globals.js';
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

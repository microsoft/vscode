/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ipcRenderer } from 'electron';
import { isMacintosh } from '../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { IStandaloneMenuTestResult } from './standaloneMenuTest.js';

suite('Standalone auxiliary native menus', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('limits native menus and stale dispatch without changing ordinary auxiliary windows', async () => {
		const result: IStandaloneMenuTestResult = await ipcRenderer.invoke('vscode:test-standalone-window-menu');
		assert.deepStrictEqual(result, {
			ordinaryBefore: 1,
			ordinaryAfter: 1,
			stale: { renderer: 0, picker: 0, recent: 0, newWindow: 0, handledKeybinding: true },
			nativeActions: ['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll', 'close', 'close'],
			nativeRoles: isMacintosh ? ['close', 'undo', 'redo', 'cut', 'copy', 'paste', 'selectall'] : [],
			nativeAccelerators: isMacintosh ? [false, false, false, false, false, false, false] : [],
			workbenchItems: isMacintosh ? [] : ['New Text File', 'Open Folder', 'Recent File'],
			rebuildOnAuxiliaryFocus: isMacintosh,
		});
	});
});

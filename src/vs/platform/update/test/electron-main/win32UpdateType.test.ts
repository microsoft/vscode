/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { join } from '../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { isInnoSetupInstall } from '../../electron-main/win32UpdateType.js';

suite('Win32UpdateType', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('detects an Inno Setup installation from its uninstaller', () => {
		const checkedPaths: string[] = [];

		const setupInstall = isInnoSetupInstall('/setup/Code.exe', path => {
			checkedPaths.push(path);

			return true;
		});
		const archiveInstall = isInnoSetupInstall('/archive/Code.exe', () => false);

		assert.deepStrictEqual({ setupInstall, archiveInstall, checkedPaths }, {
			setupInstall: true,
			archiveInstall: false,
			checkedPaths: [join('/setup', 'unins000.exe')]
		});
	});
});

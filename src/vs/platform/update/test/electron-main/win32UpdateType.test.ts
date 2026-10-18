/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { UpdateType } from '../../common/update.js';
import { getWin32UpdateType, isInnoSetupInstall } from '../../electron-main/win32UpdateType.js';

suite('Win32UpdateType', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	for (const target of ['user', 'system']) {
		test(`detects ${target} setup from its product target`, () => {
			assert.deepStrictEqual({
				setupInstall: isInnoSetupInstall(target),
				updateType: getWin32UpdateType(target)
			}, {
				setupInstall: true,
				updateType: UpdateType.Setup
			});
		});
	}

	for (const target of [undefined, '', 'archive', 'portable', 'unknown', 'USER', 'SYSTEM']) {
		test(`treats product target ${JSON.stringify(target)} as an archive`, () => {
			assert.deepStrictEqual({
				setupInstall: isInnoSetupInstall(target),
				updateType: getWin32UpdateType(target)
			}, {
				setupInstall: false,
				updateType: UpdateType.Archive
			});
		});
	}
});

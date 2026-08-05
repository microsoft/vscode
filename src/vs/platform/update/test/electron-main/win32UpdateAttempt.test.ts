/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as path from '../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { completeWin32UpdateAttempt, Win32UpdateAttempt } from '../../electron-main/win32UpdateAttempt.js';

suite('Win32UpdateAttempt', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('uses unique control files and completes only the current attempt once', () => {
		const currentAttempt = new Win32UpdateAttempt('C:\\update-cache', 'insider', 'next', 1);
		const staleAttempt = new Win32UpdateAttempt('C:\\update-cache', 'insider', 'next', 2);

		const staleCompleted = completeWin32UpdateAttempt(currentAttempt, staleAttempt);
		const currentCompleted = completeWin32UpdateAttempt(currentAttempt, currentAttempt);
		const lateCompletion = completeWin32UpdateAttempt(currentAttempt, currentAttempt);

		assert.deepStrictEqual({
			currentControlFiles: [
				path.basename(currentAttempt.updateFilePath),
				path.basename(currentAttempt.progressFilePath),
				path.basename(currentAttempt.cancelFilePath)
			],
			staleControlFiles: [
				path.basename(staleAttempt.updateFilePath),
				path.basename(staleAttempt.progressFilePath),
				path.basename(staleAttempt.cancelFilePath)
			],
			staleCompleted,
			currentCompleted,
			lateCompletion,
			currentActive: currentAttempt.isActive,
			staleActive: staleAttempt.isActive
		}, {
			currentControlFiles: [
				'CodeSetup-insider-next-1.flag',
				'update-progress-1',
				'cancel-1.flag'
			],
			staleControlFiles: [
				'CodeSetup-insider-next-2.flag',
				'update-progress-2',
				'cancel-2.flag'
			],
			staleCompleted: false,
			currentCompleted: true,
			lateCompletion: false,
			currentActive: false,
			staleActive: true
		});

		staleAttempt.complete();
	});
});

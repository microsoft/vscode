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
		const currentAttempt = new Win32UpdateAttempt('C:\\update-cache', 'insider', 'next', 'current-id');
		const staleAttempt = new Win32UpdateAttempt('C:\\update-cache', 'insider', 'next', 'stale-id');

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
				'CodeSetup-insider-next-current-id.flag',
				'update-progress-current-id',
				'cancel-current-id.flag'
			],
			staleControlFiles: [
				'CodeSetup-insider-next-stale-id.flag',
				'update-progress-stale-id',
				'cancel-stale-id.flag'
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

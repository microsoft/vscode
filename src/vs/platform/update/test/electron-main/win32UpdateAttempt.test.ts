/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as path from '../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { completeWin32UpdateAttempt, Win32UpdateAttempt } from '../../electron-main/win32UpdateAttempt.js';

suite('Win32UpdateAttempt', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('uses isolated control files for each attempt', () => {
		const firstProcessAttempt = new Win32UpdateAttempt('C:\\update-cache', 'insider', 'next', 'first-process-id');
		const nextProcessAttempt = new Win32UpdateAttempt('C:\\update-cache', 'insider', 'next', 'next-process-id');

		assert.deepStrictEqual({
			firstProcessControlFiles: [
				path.basename(firstProcessAttempt.updateFilePath),
				path.basename(firstProcessAttempt.progressFilePath),
				path.basename(firstProcessAttempt.cancelFilePath)
			],
			nextProcessControlFiles: [
				path.basename(nextProcessAttempt.updateFilePath),
				path.basename(nextProcessAttempt.progressFilePath),
				path.basename(nextProcessAttempt.cancelFilePath)
			]
		}, {
			firstProcessControlFiles: [
				'CodeSetup-insider-next-first-process-id.flag',
				'update-progress-first-process-id',
				'cancel-first-process-id.flag'
			],
			nextProcessControlFiles: [
				'CodeSetup-insider-next-next-process-id.flag',
				'update-progress-next-process-id',
				'cancel-next-process-id.flag'
			]
		});

		firstProcessAttempt.complete();
		nextProcessAttempt.complete();
	});

	test('completion is idempotent and cancels the attempt', () => {
		const attempt = new Win32UpdateAttempt('C:\\update-cache', 'insider', 'next', 'attempt-id');
		let cancellationCount = 0;
		store.add(attempt.cancellationTokenSource.token.onCancellationRequested(() => cancellationCount++));

		const firstCompletion = attempt.complete();
		const secondCompletion = attempt.complete();

		assert.deepStrictEqual({
			firstCompletion,
			secondCompletion,
			isActive: attempt.isActive,
			isCancellationRequested: attempt.cancellationTokenSource.token.isCancellationRequested,
			cancellationCount
		}, {
			firstCompletion: true,
			secondCompletion: false,
			isActive: false,
			isCancellationRequested: true,
			cancellationCount: 1
		});
	});

	test('only the current attempt can be completed', () => {
		const currentAttempt = new Win32UpdateAttempt('C:\\update-cache', 'insider', 'next', 'current-id');
		const staleAttempt = new Win32UpdateAttempt('C:\\update-cache', 'insider', 'next', 'stale-id');

		const staleCompleted = completeWin32UpdateAttempt(currentAttempt, staleAttempt);
		const missingCompleted = completeWin32UpdateAttempt(undefined, currentAttempt);
		const currentCompleted = completeWin32UpdateAttempt(currentAttempt, currentAttempt);

		assert.deepStrictEqual({
			staleCompleted,
			missingCompleted,
			currentCompleted,
			currentActive: currentAttempt.isActive,
			staleActive: staleAttempt.isActive
		}, {
			staleCompleted: false,
			missingCompleted: false,
			currentCompleted: true,
			currentActive: false,
			staleActive: true
		});

		staleAttempt.complete();
	});
});

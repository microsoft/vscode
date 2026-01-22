/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { computeDownloadTimeRemaining, Downloading, formatTimeRemaining, StateType } from '../../common/update.js';

suite('Update', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('computeDownloadTimeRemaining', () => {

		function createDownloadingState(downloadedBytes?: number, totalBytes?: number, startTime?: number): Downloading {
			return { type: StateType.Downloading, downloadedBytes, totalBytes, startTime };
		}

		test('returns undefined for invalid or incomplete input', () => {
			const now = Date.now();

			// Missing parameters
			assert.strictEqual(computeDownloadTimeRemaining(createDownloadingState()), undefined);
			assert.strictEqual(computeDownloadTimeRemaining(createDownloadingState(500, undefined, now)), undefined);
			assert.strictEqual(computeDownloadTimeRemaining(createDownloadingState(undefined, 1000, now)), undefined);
			assert.strictEqual(computeDownloadTimeRemaining(createDownloadingState(500, 1000, undefined)), undefined);

			// Zero or negative values
			assert.strictEqual(computeDownloadTimeRemaining(createDownloadingState(0, 1000, now - 1000)), undefined);
			assert.strictEqual(computeDownloadTimeRemaining(createDownloadingState(500, 0, now - 1000)), undefined);
			assert.strictEqual(computeDownloadTimeRemaining(createDownloadingState(500, 1000, now)), undefined); // elapsedMs is 0
			assert.strictEqual(computeDownloadTimeRemaining(createDownloadingState(-100, 1000, now - 1000)), undefined);
		});

		test('returns 0 when download is complete or over-downloaded', () => {
			const now = Date.now();
			assert.strictEqual(computeDownloadTimeRemaining(createDownloadingState(1000, 1000, now - 1000)), 0);
			assert.strictEqual(computeDownloadTimeRemaining(createDownloadingState(1500, 1000, now - 1000)), 0);
		});

		test('computes correct time remaining', () => {
			const now = Date.now();

			// Simple case: Downloaded 500 bytes of 1000 in 1000ms => 1s remaining
			assert.strictEqual(computeDownloadTimeRemaining(createDownloadingState(500, 1000, now - 1000)), 1);

			// 10 seconds remaining: Downloaded 100MB of 200MB in 10s
			const downloadedBytes = 100 * 1024 * 1024;
			const totalBytes = 200 * 1024 * 1024;
			assert.strictEqual(computeDownloadTimeRemaining(createDownloadingState(downloadedBytes, totalBytes, now - 10000)), 10);

			// Rounds up: 900 of 1000 bytes in 900ms => 100ms remaining => rounds to 1s
			assert.strictEqual(computeDownloadTimeRemaining(createDownloadingState(900, 1000, now - 900)), 1);

			// Realistic scenario: 50MB of 100MB in 50s => 50s remaining
			const downloaded50MB = 50 * 1024 * 1024;
			const total100MB = 100 * 1024 * 1024;
			assert.strictEqual(computeDownloadTimeRemaining(createDownloadingState(downloaded50MB, total100MB, now - 50000)), 50);
		});
	});

	suite('formatTimeRemaining', () => {

		test('formats seconds for values less than 1 minute', () => {
			assert.strictEqual(formatTimeRemaining(1), '1s');
			assert.strictEqual(formatTimeRemaining(30), '30s');
			assert.strictEqual(formatTimeRemaining(59), '59s');
		});

		test('formats minutes for values between 1 minute and 1 hour', () => {
			assert.strictEqual(formatTimeRemaining(60), '1 min');
			assert.strictEqual(formatTimeRemaining(120), '2 min');
			assert.strictEqual(formatTimeRemaining(90), '1 min'); // Floors to 1 min
			assert.strictEqual(formatTimeRemaining(3599), '59 min');
		});

		test('formats fractional hours for values >= 1 hour', () => {
			assert.strictEqual(formatTimeRemaining(3600), '1 hours');
			assert.strictEqual(formatTimeRemaining(5400), '1.5 hours'); // 1.5 hours
			assert.strictEqual(formatTimeRemaining(7200), '2 hours');
			assert.strictEqual(formatTimeRemaining(9000), '2.5 hours'); // 2.5 hours
			assert.strictEqual(formatTimeRemaining(3960), '1.1 hours'); // 1 hour 6 min = 1.1 hours
		});
	});
});

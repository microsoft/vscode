/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Downloading, StateType } from '../../../../../platform/update/common/update.js';
import { computeDownloadSpeed, computeDownloadTimeRemaining, formatBytes, formatTimeRemaining } from '../../browser/updateStatusBarEntry.js';

suite('UpdateStatusBarEntry', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function createDownloadingState(downloadedBytes?: number, totalBytes?: number, startTime?: number): Downloading {
		return { type: StateType.Downloading, explicit: true, overwrite: false, downloadedBytes, totalBytes, startTime };
	}

	suite('computeDownloadTimeRemaining', () => {
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
			assert.strictEqual(computeDownloadTimeRemaining(createDownloadingState(500, 1000, now + 1000)), undefined);
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
			assert.strictEqual(formatTimeRemaining(3600), '1 hour');
			assert.strictEqual(formatTimeRemaining(5400), '1.5 hours'); // 1.5 hours
			assert.strictEqual(formatTimeRemaining(7200), '2 hours');
			assert.strictEqual(formatTimeRemaining(9000), '2.5 hours'); // 2.5 hours
			assert.strictEqual(formatTimeRemaining(3960), '1.1 hours'); // 1 hour 6 min = 1.1 hours
		});
	});

	suite('formatBytes', () => {
		test('formats bytes for values less than 1 KB', () => {
			assert.strictEqual(formatBytes(0), '0 B');
			assert.strictEqual(formatBytes(1), '1 B');
			assert.strictEqual(formatBytes(512), '512 B');
			assert.strictEqual(formatBytes(1023), '1023 B');
		});

		test('formats kilobytes for values between 1 KB and 1 MB', () => {
			assert.strictEqual(formatBytes(1024), '1 KB');
			assert.strictEqual(formatBytes(1536), '1.5 KB'); // 1.5 KB
			assert.strictEqual(formatBytes(2048), '2 KB');
			assert.strictEqual(formatBytes(1024 * 100), '100 KB');
			assert.strictEqual(formatBytes(1024 * 1023), '1023 KB');
		});

		test('formats megabytes for values between 1 MB and 1 GB', () => {
			assert.strictEqual(formatBytes(1024 * 1024), '1 MB');
			assert.strictEqual(formatBytes(1024 * 1024 * 1.5), '1.5 MB');
			assert.strictEqual(formatBytes(1024 * 1024 * 100), '100 MB');
			assert.strictEqual(formatBytes(1024 * 1024 * 512), '512 MB');
		});

		test('formats gigabytes for values >= 1 GB', () => {
			assert.strictEqual(formatBytes(1024 * 1024 * 1024), '1 GB');
			assert.strictEqual(formatBytes(1024 * 1024 * 1024 * 1.5), '1.5 GB');
			assert.strictEqual(formatBytes(1024 * 1024 * 1024 * 10), '10 GB');
		});

		test('rounds to one decimal place correctly', () => {
			assert.strictEqual(formatBytes(1126), '1.1 KB');
			assert.strictEqual(formatBytes(1075), '1 KB');
			assert.strictEqual(formatBytes(1024 * 1024 * 25.35), '25.4 MB');
		});
	});

	suite('computeDownloadSpeed', () => {
		test('returns undefined for invalid or incomplete input', () => {
			const now = Date.now();
			assert.strictEqual(computeDownloadSpeed(createDownloadingState(undefined, 1000, now - 1000)), undefined);
			assert.strictEqual(computeDownloadSpeed(createDownloadingState(500, 1000, undefined)), undefined);
			assert.strictEqual(computeDownloadSpeed(createDownloadingState(undefined, undefined, undefined)), undefined);
		});

		test('returns undefined for zero or negative elapsed time', () => {
			const now = Date.now();
			assert.strictEqual(computeDownloadSpeed(createDownloadingState(500, 1000, now + 1000)), undefined);
		});

		test('returns undefined for zero downloaded bytes', () => {
			const now = Date.now();
			assert.strictEqual(computeDownloadSpeed(createDownloadingState(0, 1000, now - 1000)), undefined);
		});

		test('computes correct download speed in bytes per second', () => {
			const now = Date.now();

			// 1000 bytes in 1 second = 1000 B/s
			const speed1 = computeDownloadSpeed(createDownloadingState(1000, 2000, now - 1000));
			assert.ok(speed1 !== undefined);
			assert.ok(Math.abs(speed1 - 1000) < 50); // Allow small timing variance

			// 10 MB in 10 seconds = 1 MB/s = 1048576 B/s
			const tenMB = 10 * 1024 * 1024;
			const speed2 = computeDownloadSpeed(createDownloadingState(tenMB, tenMB * 2, now - 10000));
			assert.ok(speed2 !== undefined);
			const expectedSpeed = 1024 * 1024; // 1 MB/s
			assert.ok(Math.abs(speed2 - expectedSpeed) < expectedSpeed * 0.01); // Within 1%
		});
	});
});

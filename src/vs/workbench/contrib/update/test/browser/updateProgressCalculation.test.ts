/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('Update Progress Calculation', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function getTimeRemainingText(progress: { bytesDownloaded: number; totalBytes: number; startTime: number }): string {
		const { bytesDownloaded, totalBytes, startTime } = progress;

		if (bytesDownloaded === 0 || totalBytes === 0) {
			return '';
		}

		const percentage = Math.floor((bytesDownloaded / totalBytes) * 100);

		const elapsedMs = Date.now() - startTime;

		// Need at least 1 second of data to make a reasonable estimate
		if (elapsedMs < 1000) {
			return ` (${percentage}%)`;
		}

		const bytesPerMs = bytesDownloaded / elapsedMs;
		const remainingBytes = totalBytes - bytesDownloaded;
		const remainingMs = remainingBytes / bytesPerMs;
		const remainingSeconds = Math.ceil(remainingMs / 1000);

		// Sanity check for unreasonable values
		if (!isFinite(remainingSeconds) || remainingSeconds < 0 || remainingSeconds > 86400) {
			return ` (${percentage}%)`;
		}

		if (remainingSeconds < 60) {
			return ` (${percentage}% - ${remainingSeconds}s remaining)`;
		} else {
			const remainingMinutes = Math.ceil(remainingSeconds / 60);
			return ` (${percentage}% - ${remainingMinutes}m remaining)`;
		}
	}

	test('Should return empty string when no bytes downloaded', () => {
		const result = getTimeRemainingText({
			bytesDownloaded: 0,
			totalBytes: 1000000,
			startTime: Date.now() - 5000
		});
		assert.strictEqual(result, '');
	});

	test('Should return empty string when total bytes is 0', () => {
		const result = getTimeRemainingText({
			bytesDownloaded: 100000,
			totalBytes: 0,
			startTime: Date.now() - 5000
		});
		assert.strictEqual(result, '');
	});

	test('Should return percentage when elapsed time < 1 second', () => {
		const result = getTimeRemainingText({
			bytesDownloaded: 100000,
			totalBytes: 1000000,
			startTime: Date.now() - 500
		});
		assert.strictEqual(result, ' (10%)');
	});

	test('Should show percentage and seconds for short downloads', () => {
		// 100KB downloaded in 2 seconds, 400KB remaining -> 20%, 8 seconds remaining
		const result = getTimeRemainingText({
			bytesDownloaded: 100000,
			totalBytes: 500000,
			startTime: Date.now() - 2000
		});
		assert.strictEqual(result, ' (20% - 8s remaining)');
	});

	test('Should show percentage and minutes for longer downloads', () => {
		// 100KB downloaded in 10 seconds, 900KB remaining -> 10%, 90 seconds = 2 minutes remaining
		const result = getTimeRemainingText({
			bytesDownloaded: 100000,
			totalBytes: 1000000,
			startTime: Date.now() - 10000
		});
		assert.strictEqual(result, ' (10% - 2m remaining)');
	});

	test('Should handle near completion', () => {
		// 999KB downloaded in 10 seconds, 1KB remaining -> 99%, 1 second remaining
		const result = getTimeRemainingText({
			bytesDownloaded: 999000,
			totalBytes: 1000000,
			startTime: Date.now() - 10000
		});
		assert.strictEqual(result, ' (99% - 1s remaining)');
	});

	test('Should return percentage for unreasonably large estimates', () => {
		// Very slow download: 1KB in 10 seconds, 999KB remaining -> way too long, show percentage only
		const result = getTimeRemainingText({
			bytesDownloaded: 1000,
			totalBytes: 1000000,
			startTime: Date.now() - 10000
		});
		// This would be about 2.7 hours, which exceeds 24 hour limit, so show percentage only
		assert.strictEqual(result, ' (0%)');
	});

	test('Should round up seconds', () => {
		// 250KB downloaded in 3 seconds, 250KB remaining -> 50%, 3 seconds remaining
		const result = getTimeRemainingText({
			bytesDownloaded: 250000,
			totalBytes: 500000,
			startTime: Date.now() - 3000
		});
		assert.strictEqual(result, ' (50% - 3s remaining)');
	});

	test('Should round up minutes', () => {
		// 100KB downloaded in 10 seconds, 500KB remaining -> 16%, 50 seconds = 1 minute
		const result = getTimeRemainingText({
			bytesDownloaded: 100000,
			totalBytes: 600000,
			startTime: Date.now() - 10000
		});
		assert.strictEqual(result, ' (16% - 1m remaining)');
	});
});

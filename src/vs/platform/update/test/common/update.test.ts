/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { computeDownloadTimeRemaining } from '../../common/update.js';

suite('Update', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('computeDownloadTimeRemaining', () => {

		test('returns undefined when downloadedBytes is 0', () => {
			assert.strictEqual(computeDownloadTimeRemaining(0, 1000, 1000), undefined);
		});

		test('returns undefined when totalBytes is 0', () => {
			assert.strictEqual(computeDownloadTimeRemaining(500, 0, 1000), undefined);
		});

		test('returns undefined when elapsedMs is 0', () => {
			assert.strictEqual(computeDownloadTimeRemaining(500, 1000, 0), undefined);
		});

		test('returns undefined when downloadedBytes is negative', () => {
			assert.strictEqual(computeDownloadTimeRemaining(-100, 1000, 1000), undefined);
		});

		test('returns 0 when download is complete', () => {
			assert.strictEqual(computeDownloadTimeRemaining(1000, 1000, 1000), 0);
		});

		test('returns 0 when more bytes downloaded than total', () => {
			assert.strictEqual(computeDownloadTimeRemaining(1500, 1000, 1000), 0);
		});

		test('computes correct time remaining for simple case', () => {
			// Downloaded 500 bytes of 1000 total in 1000ms
			// Rate: 0.5 bytes/ms
			// Remaining: 500 bytes
			// Time remaining: 500 / 0.5 = 1000ms = 1s
			assert.strictEqual(computeDownloadTimeRemaining(500, 1000, 1000), 1);
		});

		test('computes correct time remaining - 10 seconds', () => {
			// Downloaded 100MB of 200MB in 10000ms (10s)
			// Rate: 10MB/s
			// Remaining: 100MB
			// Time remaining: 10s
			const downloadedBytes = 100 * 1024 * 1024;
			const totalBytes = 200 * 1024 * 1024;
			const elapsedMs = 10000;
			assert.strictEqual(computeDownloadTimeRemaining(downloadedBytes, totalBytes, elapsedMs), 10);
		});

		test('rounds up to next second', () => {
			// Downloaded 900 bytes of 1000 total in 900ms
			// Rate: 1 byte/ms
			// Remaining: 100 bytes
			// Time remaining: 100ms = 0.1s -> rounds up to 1s
			assert.strictEqual(computeDownloadTimeRemaining(900, 1000, 900), 1);
		});

		test('computes realistic scenario - 30 seconds remaining', () => {
			// Typical VS Code update ~100MB
			// Downloaded 50MB in 50s at 1MB/s
			// Remaining: 50MB at 1MB/s = 50s
			const downloadedBytes = 50 * 1024 * 1024; // 50MB
			const totalBytes = 100 * 1024 * 1024; // 100MB
			const elapsedMs = 50 * 1000; // 50 seconds
			assert.strictEqual(computeDownloadTimeRemaining(downloadedBytes, totalBytes, elapsedMs), 50);
		});
	});
});

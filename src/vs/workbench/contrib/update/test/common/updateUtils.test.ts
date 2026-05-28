/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Downloading, StateType } from '../../../../../platform/update/common/update.js';
import { computeDownloadSpeed, computeDownloadTimeRemaining, computeProgressPercent, computeUpdateInfoVersion, formatBytes, formatDate, formatTimeRemaining, getUpdateInfoUrl, isMajorMinorVersionChange, tryParseDate } from '../../common/updateUtils.js';

suite('UpdateUtils', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let clock: sinon.SinonFakeTimers;

	setup(() => {
		clock = sinon.useFakeTimers();
	});

	teardown(() => {
		clock.restore();
	});

	function DownloadingState(downloadedBytes?: number, totalBytes?: number, startTime?: number): Downloading {
		return { type: StateType.Downloading, explicit: true, overwrite: false, downloadedBytes, totalBytes, startTime };
	}

	suite('computeProgressPercent', () => {
		test('handles invalid values', () => {
			assert.strictEqual(computeProgressPercent(undefined, 100), undefined);
			assert.strictEqual(computeProgressPercent(50, undefined), undefined);
			assert.strictEqual(computeProgressPercent(undefined, undefined), undefined);
			assert.strictEqual(computeProgressPercent(50, 0), undefined);
			assert.strictEqual(computeProgressPercent(50, -10), undefined);
		});

		test('computes correct percentage', () => {
			assert.strictEqual(computeProgressPercent(0, 100), 0);
			assert.strictEqual(computeProgressPercent(50, 100), 50);
			assert.strictEqual(computeProgressPercent(100, 100), 100);
			assert.strictEqual(computeProgressPercent(1, 3), 33);
			assert.strictEqual(computeProgressPercent(2, 3), 67);
		});

		test('clamps to 0-100 range', () => {
			assert.strictEqual(computeProgressPercent(-10, 100), 0);
			assert.strictEqual(computeProgressPercent(200, 100), 100);
		});
	});

	suite('computeDownloadTimeRemaining', () => {
		test('returns undefined for invalid or incomplete input', () => {
			const now = Date.now();

			// Missing parameters
			assert.strictEqual(computeDownloadTimeRemaining(DownloadingState()), undefined);
			assert.strictEqual(computeDownloadTimeRemaining(DownloadingState(500, undefined, now)), undefined);
			assert.strictEqual(computeDownloadTimeRemaining(DownloadingState(undefined, 1000, now)), undefined);
			assert.strictEqual(computeDownloadTimeRemaining(DownloadingState(500, 1000, undefined)), undefined);

			// Zero or negative values
			assert.strictEqual(computeDownloadTimeRemaining(DownloadingState(0, 1000, now - 1000)), undefined);
			assert.strictEqual(computeDownloadTimeRemaining(DownloadingState(500, 0, now - 1000)), undefined);
			assert.strictEqual(computeDownloadTimeRemaining(DownloadingState(500, 1000, now + 1000)), undefined);
			assert.strictEqual(computeDownloadTimeRemaining(DownloadingState(-100, 1000, now - 1000)), undefined);
		});

		test('returns 0 when download is complete or over-downloaded', () => {
			const now = Date.now();
			assert.strictEqual(computeDownloadTimeRemaining(DownloadingState(1000, 1000, now - 1000)), 0);
			assert.strictEqual(computeDownloadTimeRemaining(DownloadingState(1500, 1000, now - 1000)), 0);
		});

		test('computes correct time remaining', () => {
			const now = Date.now();

			// Simple case: Downloaded 500 bytes of 1000 in 1000ms => 1s remaining
			assert.strictEqual(computeDownloadTimeRemaining(DownloadingState(500, 1000, now - 1000)), 1);

			// 10 seconds remaining: Downloaded 100MB of 200MB in 10s
			const downloadedBytes = 100 * 1024 * 1024;
			const totalBytes = 200 * 1024 * 1024;
			assert.strictEqual(computeDownloadTimeRemaining(DownloadingState(downloadedBytes, totalBytes, now - 10000)), 10);

			// Rounds up: 900 of 1000 bytes in 900ms => 100ms remaining => rounds to 1s
			assert.strictEqual(computeDownloadTimeRemaining(DownloadingState(900, 1000, now - 900)), 1);

			// Realistic scenario: 50MB of 100MB in 50s => 50s remaining
			const downloaded50MB = 50 * 1024 * 1024;
			const total100MB = 100 * 1024 * 1024;
			assert.strictEqual(computeDownloadTimeRemaining(DownloadingState(downloaded50MB, total100MB, now - 50000)), 50);
		});
	});


	suite('computeDownloadSpeed', () => {
		test('returns undefined for invalid or incomplete input', () => {
			const now = Date.now();
			assert.strictEqual(computeDownloadSpeed(DownloadingState(undefined, 1000, now - 1000)), undefined);
			assert.strictEqual(computeDownloadSpeed(DownloadingState(500, 1000, undefined)), undefined);
			assert.strictEqual(computeDownloadSpeed(DownloadingState(undefined, undefined, undefined)), undefined);
		});

		test('returns undefined for zero or negative elapsed time', () => {
			const now = Date.now();
			assert.strictEqual(computeDownloadSpeed(DownloadingState(500, 1000, now + 1000)), undefined);
		});

		test('returns undefined for zero downloaded bytes', () => {
			const now = Date.now();
			assert.strictEqual(computeDownloadSpeed(DownloadingState(0, 1000, now - 1000)), undefined);
		});

		test('computes correct download speed in bytes per second', () => {
			const now = Date.now();

			// 1000 bytes in 1 second = 1000 B/s
			const speed1 = computeDownloadSpeed(DownloadingState(1000, 2000, now - 1000));
			assert.ok(speed1 !== undefined);
			assert.ok(Math.abs(speed1 - 1000) < 50); // Allow small timing variance

			// 10 MB in 10 seconds = 1 MB/s = 1048576 B/s
			const tenMB = 10 * 1024 * 1024;
			const speed2 = computeDownloadSpeed(DownloadingState(tenMB, tenMB * 2, now - 10000));
			assert.ok(speed2 !== undefined);
			const expectedSpeed = 1024 * 1024; // 1 MB/s
			assert.ok(Math.abs(speed2 - expectedSpeed) < expectedSpeed * 0.01); // Within 1%
		});
	});

	suite('computeUpdateInfoVersion', () => {
		test('returns minor .0 version when minor differs', () => {
			assert.strictEqual(computeUpdateInfoVersion('1.108.2', '1.109.5'), '1.109');
			assert.strictEqual(computeUpdateInfoVersion('1.108.0', '1.109.0'), '1.109');
			assert.strictEqual(computeUpdateInfoVersion('1.107.3', '1.110.1'), '1.110');
		});

		test('returns target version as-is when same minor', () => {
			assert.strictEqual(computeUpdateInfoVersion('1.109.2', '1.109.5'), '1.109.5');
			assert.strictEqual(computeUpdateInfoVersion('1.109.0', '1.109.3'), '1.109.3');
		});

		test('returns minor .0 version when major differs', () => {
			assert.strictEqual(computeUpdateInfoVersion('1.109.2', '2.0.1'), '2.0');
		});

		test('returns undefined for invalid versions', () => {
			assert.strictEqual(computeUpdateInfoVersion('invalid', '1.109.5'), undefined);
			assert.strictEqual(computeUpdateInfoVersion('1.109.2', 'invalid'), undefined);
		});
	});

	suite('getUpdateInfoUrl', () => {
		test('constructs correct URL for .0 versions', () => {
			assert.strictEqual(getUpdateInfoUrl('1.109.0'), 'https://code.visualstudio.com/raw/v1_109_update.md');
		});

		test('constructs correct URL for patch versions', () => {
			assert.strictEqual(getUpdateInfoUrl('1.109.5'), 'https://code.visualstudio.com/raw/v1_109_5_update.md');
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

	suite('tryParseDate', () => {
		test('returns undefined for undefined input', () => {
			assert.strictEqual(tryParseDate(undefined), undefined);
		});

		test('returns undefined for invalid date strings', () => {
			assert.strictEqual(tryParseDate(''), undefined);
			assert.strictEqual(tryParseDate('not-a-date'), undefined);
		});

		test('parses valid ISO date strings', () => {
			const result = tryParseDate('2026-02-06T05:03:03.991Z');
			assert.ok(result !== undefined);
			assert.strictEqual(typeof result, 'number');
			assert.ok(result > 0);
		});
	});

	suite('formatDate', () => {
		test('formats a timestamp as a readable date', () => {
			const result = formatDate(1705276800000);
			assert.ok(result.length > 0);
			assert.ok(result.includes('2024'));
		});
	});

	suite('isMajorMinorVersionChange', () => {
		test('returns true for major version change', () => {
			assert.strictEqual(isMajorMinorVersionChange('1.90.0', '2.0.0'), true);
		});

		test('returns true for minor version change', () => {
			assert.strictEqual(isMajorMinorVersionChange('1.90.0', '1.91.0'), true);
		});

		test('returns false for patch-only change', () => {
			assert.strictEqual(isMajorMinorVersionChange('1.90.0', '1.90.1'), false);
		});

		test('returns false for identical versions', () => {
			assert.strictEqual(isMajorMinorVersionChange('1.90.0', '1.90.0'), false);
		});

		test('returns false when previous version is undefined', () => {
			assert.strictEqual(isMajorMinorVersionChange(undefined, '1.90.0'), false);
		});

		test('returns false when new version is undefined', () => {
			assert.strictEqual(isMajorMinorVersionChange('1.90.0', undefined), false);
		});

		test('returns false when both versions are undefined', () => {
			assert.strictEqual(isMajorMinorVersionChange(undefined, undefined), false);
		});

		test('returns false for unparseable versions', () => {
			assert.strictEqual(isMajorMinorVersionChange('invalid', '1.90.0'), false);
			assert.strictEqual(isMajorMinorVersionChange('1.90.0', 'invalid'), false);
		});
	});
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as sinon from 'sinon';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { computeDownloadSpeed, computeDownloadTimeRemaining, computeProgressPercent, computeUpdateInfoVersion, formatBytes, formatDate, formatTimeRemaining, getUpdateInfoUrl, isMajorMinorVersionChange, tryParseDate } from '../../common/updateUtils.js';
suite('UpdateUtils', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    let clock;
    setup(() => {
        clock = sinon.useFakeTimers();
    });
    teardown(() => {
        clock.restore();
    });
    function DownloadingState(downloadedBytes, totalBytes, startTime) {
        return { type: "downloading" /* StateType.Downloading */, explicit: true, overwrite: false, downloadedBytes, totalBytes, startTime };
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBkYXRlVXRpbHMudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3VwZGF0ZS90ZXN0L2NvbW1vbi91cGRhdGVVdGlscy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEtBQUssS0FBSyxNQUFNLE9BQU8sQ0FBQztBQUMvQixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUVuRyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsNEJBQTRCLEVBQUUsc0JBQXNCLEVBQUUsd0JBQXdCLEVBQUUsV0FBVyxFQUFFLFVBQVUsRUFBRSxtQkFBbUIsRUFBRSxnQkFBZ0IsRUFBRSx5QkFBeUIsRUFBRSxZQUFZLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUU1UCxLQUFLLENBQUMsYUFBYSxFQUFFLEdBQUcsRUFBRTtJQUN6Qix1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLElBQUksS0FBNEIsQ0FBQztJQUVqQyxLQUFLLENBQUMsR0FBRyxFQUFFO1FBQ1YsS0FBSyxHQUFHLEtBQUssQ0FBQyxhQUFhLEVBQUUsQ0FBQztJQUMvQixDQUFDLENBQUMsQ0FBQztJQUVILFFBQVEsQ0FBQyxHQUFHLEVBQUU7UUFDYixLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDakIsQ0FBQyxDQUFDLENBQUM7SUFFSCxTQUFTLGdCQUFnQixDQUFDLGVBQXdCLEVBQUUsVUFBbUIsRUFBRSxTQUFrQjtRQUMxRixPQUFPLEVBQUUsSUFBSSwyQ0FBdUIsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsZUFBZSxFQUFFLFVBQVUsRUFBRSxTQUFTLEVBQUUsQ0FBQztJQUNsSCxDQUFDO0lBRUQsS0FBSyxDQUFDLHdCQUF3QixFQUFFLEdBQUcsRUFBRTtRQUNwQyxJQUFJLENBQUMsd0JBQXdCLEVBQUUsR0FBRyxFQUFFO1lBQ25DLE1BQU0sQ0FBQyxXQUFXLENBQUMsc0JBQXNCLENBQUMsU0FBUyxFQUFFLEdBQUcsQ0FBQyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBQ3RFLE1BQU0sQ0FBQyxXQUFXLENBQUMsc0JBQXNCLENBQUMsRUFBRSxFQUFFLFNBQVMsQ0FBQyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBQ3JFLE1BQU0sQ0FBQyxXQUFXLENBQUMsc0JBQXNCLENBQUMsU0FBUyxFQUFFLFNBQVMsQ0FBQyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBQzVFLE1BQU0sQ0FBQyxXQUFXLENBQUMsc0JBQXNCLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBQzdELE1BQU0sQ0FBQyxXQUFXLENBQUMsc0JBQXNCLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDaEUsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsNkJBQTZCLEVBQUUsR0FBRyxFQUFFO1lBQ3hDLE1BQU0sQ0FBQyxXQUFXLENBQUMsc0JBQXNCLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3RELE1BQU0sQ0FBQyxXQUFXLENBQUMsc0JBQXNCLENBQUMsRUFBRSxFQUFFLEdBQUcsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQ3hELE1BQU0sQ0FBQyxXQUFXLENBQUMsc0JBQXNCLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1lBQzFELE1BQU0sQ0FBQyxXQUFXLENBQUMsc0JBQXNCLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQ3JELE1BQU0sQ0FBQyxXQUFXLENBQUMsc0JBQXNCLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FB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
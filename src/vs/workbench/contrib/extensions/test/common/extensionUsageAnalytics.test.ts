/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	IExtensionUsageRecord,
	IDailyUsageStat,
	UsageFrequency
} from '../../common/extensionUsageAnalytics.js';

// Note: These tests cover the pure logic functions that are extracted from
// ExtensionUsageAnalyticsService. The actual service tests would require
// mocking IFileService, IExtensionService, and ICommandService.

/**
 * Pure functions extracted for testing the core usage analytics logic
 */
function formatDate(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function getUsageCountForDays(record: IExtensionUsageRecord | undefined, days: number): number {
	if (!record) {
		return 0;
	}

	const cutoffDate = new Date();
	cutoffDate.setDate(cutoffDate.getDate() - days);
	const cutoffStr = formatDate(cutoffDate);

	let count = 0;
	for (const stat of record.dailyStats) {
		if (stat.date >= cutoffStr) {
			count += stat.activations + stat.commands;
		}
	}
	return count;
}

function getUsageFrequency(record: IExtensionUsageRecord | undefined): UsageFrequency {
	const last7Days = getUsageCountForDays(record, 7);
	const last30Days = getUsageCountForDays(record, 30);

	if (last7Days >= 10) {
		return UsageFrequency.Frequent;
	} else if (last7Days >= 1) {
		return UsageFrequency.Occasional;
	} else if (last30Days === 0) {
		return UsageFrequency.Rare;
	}
	return UsageFrequency.Occasional;
}

function pruneOldData(records: { [id: string]: IExtensionUsageRecord }, retentionDays: number): boolean {
	const cutoffDate = new Date();
	cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
	const cutoffStr = formatDate(cutoffDate);

	let changed = false;
	for (const record of Object.values(records)) {
		const originalLength = record.dailyStats.length;
		record.dailyStats = record.dailyStats.filter(stat => stat.date >= cutoffStr);
		if (record.dailyStats.length !== originalLength) {
			changed = true;
		}
	}
	return changed;
}

suite('ExtensionUsageAnalytics', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('formatDate', () => {
		test('formats date correctly', () => {
			const date = new Date(2025, 10, 25); // Nov 25, 2025
			assert.strictEqual(formatDate(date), '2025-11-25');
		});

		test('pads single digit month and day', () => {
			const date = new Date(2025, 0, 5); // Jan 5, 2025
			assert.strictEqual(formatDate(date), '2025-01-05');
		});
	});

	suite('getUsageCountForDays', () => {
		test('returns 0 for undefined record', () => {
			assert.strictEqual(getUsageCountForDays(undefined, 7), 0);
		});

		test('returns 0 for record with no daily stats', () => {
			const record: IExtensionUsageRecord = {
				extensionId: 'test.extension',
				activationCount: 0,
				commandExecutions: 0,
				lastActivated: 0,
				lastCommandExecuted: 0,
				firstSeen: Date.now(),
				dailyStats: []
			};
			assert.strictEqual(getUsageCountForDays(record, 7), 0);
		});

		test('counts activations and commands within date range', () => {
			const today = formatDate(new Date());
			const record: IExtensionUsageRecord = {
				extensionId: 'test.extension',
				activationCount: 10,
				commandExecutions: 20,
				lastActivated: Date.now(),
				lastCommandExecuted: Date.now(),
				firstSeen: Date.now(),
				dailyStats: [
					{ date: today, activations: 5, commands: 10 }
				]
			};
			assert.strictEqual(getUsageCountForDays(record, 7), 15);
		});

		test('excludes stats outside date range', () => {
			const today = formatDate(new Date());
			const oldDate = new Date();
			oldDate.setDate(oldDate.getDate() - 10);
			const oldDateStr = formatDate(oldDate);

			const record: IExtensionUsageRecord = {
				extensionId: 'test.extension',
				activationCount: 10,
				commandExecutions: 20,
				lastActivated: Date.now(),
				lastCommandExecuted: Date.now(),
				firstSeen: Date.now(),
				dailyStats: [
					{ date: today, activations: 5, commands: 10 },
					{ date: oldDateStr, activations: 100, commands: 100 }
				]
			};
			// Only today's stats (5 + 10 = 15) should be counted for 7 days
			assert.strictEqual(getUsageCountForDays(record, 7), 15);
		});
	});

	suite('getUsageFrequency', () => {
		test('returns Rare for undefined record', () => {
			assert.strictEqual(getUsageFrequency(undefined), UsageFrequency.Rare);
		});

		test('returns Frequent for 10+ uses in last 7 days', () => {
			const today = formatDate(new Date());
			const record: IExtensionUsageRecord = {
				extensionId: 'test.extension',
				activationCount: 10,
				commandExecutions: 0,
				lastActivated: Date.now(),
				lastCommandExecuted: 0,
				firstSeen: Date.now(),
				dailyStats: [
					{ date: today, activations: 10, commands: 0 }
				]
			};
			assert.strictEqual(getUsageFrequency(record), UsageFrequency.Frequent);
		});

		test('returns Occasional for 1-9 uses in last 7 days', () => {
			const today = formatDate(new Date());
			const record: IExtensionUsageRecord = {
				extensionId: 'test.extension',
				activationCount: 5,
				commandExecutions: 0,
				lastActivated: Date.now(),
				lastCommandExecuted: 0,
				firstSeen: Date.now(),
				dailyStats: [
					{ date: today, activations: 5, commands: 0 }
				]
			};
			assert.strictEqual(getUsageFrequency(record), UsageFrequency.Occasional);
		});

		test('returns Rare for 0 uses in last 30 days', () => {
			const record: IExtensionUsageRecord = {
				extensionId: 'test.extension',
				activationCount: 0,
				commandExecutions: 0,
				lastActivated: 0,
				lastCommandExecuted: 0,
				firstSeen: Date.now(),
				dailyStats: []
			};
			assert.strictEqual(getUsageFrequency(record), UsageFrequency.Rare);
		});
	});

	suite('pruneOldData', () => {
		test('removes stats older than retention period', () => {
			const today = formatDate(new Date());
			const oldDate = new Date();
			oldDate.setDate(oldDate.getDate() - 100);
			const oldDateStr = formatDate(oldDate);

			const records: { [id: string]: IExtensionUsageRecord } = {
				'test.extension': {
					extensionId: 'test.extension',
					activationCount: 10,
					commandExecutions: 5,
					lastActivated: Date.now(),
					lastCommandExecuted: Date.now(),
					firstSeen: Date.now(),
					dailyStats: [
						{ date: today, activations: 5, commands: 3 },
						{ date: oldDateStr, activations: 5, commands: 2 }
					]
				}
			};

			const changed = pruneOldData(records, 90);

			assert.strictEqual(changed, true);
			assert.strictEqual(records['test.extension'].dailyStats.length, 1);
			assert.strictEqual(records['test.extension'].dailyStats[0].date, today);
		});

		test('returns false when no data pruned', () => {
			const today = formatDate(new Date());
			const records: { [id: string]: IExtensionUsageRecord } = {
				'test.extension': {
					extensionId: 'test.extension',
					activationCount: 5,
					commandExecutions: 3,
					lastActivated: Date.now(),
					lastCommandExecuted: Date.now(),
					firstSeen: Date.now(),
					dailyStats: [
						{ date: today, activations: 5, commands: 3 }
					]
				}
			};

			const changed = pruneOldData(records, 90);

			assert.strictEqual(changed, false);
			assert.strictEqual(records['test.extension'].dailyStats.length, 1);
		});
	});

	suite('IExtensionUsageRecord', () => {
		test('can create valid usage record', () => {
			const record: IExtensionUsageRecord = {
				extensionId: 'ms-python.python',
				activationCount: 100,
				commandExecutions: 50,
				lastActivated: Date.now(),
				lastCommandExecuted: Date.now(),
				firstSeen: Date.now() - 86400000, // 1 day ago
				dailyStats: [
					{ date: '2025-11-25', activations: 10, commands: 5 }
				]
			};

			assert.strictEqual(record.extensionId, 'ms-python.python');
			assert.strictEqual(record.activationCount, 100);
			assert.strictEqual(record.commandExecutions, 50);
			assert.strictEqual(record.dailyStats.length, 1);
		});
	});

	suite('IDailyUsageStat', () => {
		test('can create valid daily stat', () => {
			const stat: IDailyUsageStat = {
				date: '2025-11-25',
				activations: 5,
				commands: 10
			};

			assert.strictEqual(stat.date, '2025-11-25');
			assert.strictEqual(stat.activations, 5);
			assert.strictEqual(stat.commands, 10);
		});
	});
});


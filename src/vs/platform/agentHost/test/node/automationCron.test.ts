/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { nextAutomationCronOccurrence, validateAutomationCron } from '../../node/automationCron.js';

suite('Automation cron', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('supports steps, names, ranges, and Sunday 7', () => {
		assert.deepStrictEqual({
			step: nextAutomationCronOccurrence('*/15 * * * *', 'UTC', new Date('2026-01-01T00:07:00Z')).toISOString(),
			names: nextAutomationCronOccurrence('30 9 * JAN MON-FRI', 'UTC', new Date('2026-01-02T09:30:00Z')).toISOString(),
			sunday: nextAutomationCronOccurrence('0 12 * * 7', 'UTC', new Date('2026-01-03T12:00:00Z')).toISOString(),
		}, {
			step: '2026-01-01T00:15:00.000Z',
			names: '2026-01-05T09:30:00.000Z',
			sunday: '2026-01-04T12:00:00.000Z',
		});
	});

	test('uses Unix OR semantics for restricted day fields', () => {
		assert.strictEqual(
			nextAutomationCronOccurrence('0 0 15 * MON', 'UTC', new Date('2026-01-12T00:00:00Z')).toISOString(),
			'2026-01-15T00:00:00.000Z',
		);
	});

	test('evaluates wall-clock fields in the requested time zone', () => {
		assert.strictEqual(
			nextAutomationCronOccurrence('0 9 * * *', 'America/Los_Angeles', new Date('2026-06-01T15:59:00Z')).toISOString(),
			'2026-06-01T16:00:00.000Z',
		);
	});

	test('finds sparse annual and leap-day schedules', () => {
		assert.deepStrictEqual({
			annual: nextAutomationCronOccurrence('0 0 1 JAN *', 'UTC', new Date('2026-01-02T00:00:00Z')).toISOString(),
			leapDay: nextAutomationCronOccurrence('0 0 29 FEB *', 'UTC', new Date('2024-03-01T00:00:00Z')).toISOString(),
		}, {
			annual: '2027-01-01T00:00:00.000Z',
			leapDay: '2028-02-29T00:00:00.000Z',
		});
	});

	test('handles missing and repeated wall-clock times at DST transitions', () => {
		assert.deepStrictEqual({
			missing: nextAutomationCronOccurrence('30 2 * * *', 'America/Los_Angeles', new Date('2026-03-08T09:59:00Z')).toISOString(),
			repeated: nextAutomationCronOccurrence('30 1 * * *', 'America/Los_Angeles', new Date('2026-11-01T08:31:00Z')).toISOString(),
			restrictedMissing: nextAutomationCronOccurrence('30 2 8 MAR *', 'America/Los_Angeles', new Date('2026-03-01T00:00:00Z')).toISOString(),
		}, {
			missing: '2026-03-09T09:30:00.000Z',
			repeated: '2026-11-01T09:30:00.000Z',
			restrictedMissing: '2027-03-08T10:30:00.000Z',
		});
	});

	test('rejects unsupported grammar and invalid time zones', () => {
		assert.throws(() => validateAutomationCron('@daily', 'UTC'), /exactly five fields/);
		assert.throws(() => validateAutomationCron('0 0 ? * *', 'UTC'), /outside 1-31/);
		assert.throws(() => validateAutomationCron('0 0 30 2 *', 'UTC'), /cannot match a real calendar date/);
		assert.throws(() => validateAutomationCron('0 0 * * *', 'Not\/AZone'), /invalid time zone/);
	});
});

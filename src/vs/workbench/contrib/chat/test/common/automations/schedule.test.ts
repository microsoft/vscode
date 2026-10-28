/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAutomationSchedule } from '../../../common/automations/automation.js';
import { automationScheduleToLocal, automationScheduleToUTC } from '../../../common/automations/schedule.js';

suite('Automation schedule time zones', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	for (const { offset, local, utc } of [
		{ offset: 420, local: [9, 45, 1], utc: [16, 45, 1] },
		{ offset: 480, local: [9, 45, 1], utc: [17, 45, 1] },
		{ offset: 420, local: [23, 45, 6], utc: [6, 45, 0] },
		{ offset: -330, local: [0, 15, 0], utc: [18, 45, 6] },
		{ offset: -345, local: [9, 0, 2], utc: [3, 15, 2] },
		{ offset: 210, local: [23, 0, 6], utc: [2, 30, 0] },
		{ offset: -765, local: [0, 0, 1], utc: [11, 15, 0] },
		{ offset: 0, local: [12, 7, 3], utc: [12, 7, 3] },
		{ offset: 44, local: [9, 45, 1], utc: [10, 29, 1] },
	]) {
		test(`converts weekly fields and weekday rollover at offset ${offset}, local ${local}`, () => {
			const localSchedule: IAutomationSchedule = { interval: 'weekly', scheduleHour: local[0], scheduleMinute: local[1], scheduleDay: local[2] };
			const utcSchedule: IAutomationSchedule = { interval: 'weekly', timeZone: 'UTC', scheduleHour: utc[0], scheduleMinute: utc[1], scheduleDay: utc[2] };
			assert.deepStrictEqual({
				toUTC: automationScheduleToUTC(localSchedule, offset),
				toLocal: automationScheduleToLocal(utcSchedule, offset),
			}, { toUTC: utcSchedule, toLocal: localSchedule });
		});
	}

	test('daily conversion leaves the unused weekday unchanged', () => {
		const local: IAutomationSchedule = { interval: 'daily', scheduleHour: 23, scheduleMinute: 45, scheduleDay: 6 };
		const utc = automationScheduleToUTC(local, 420);
		assert.deepStrictEqual({ utc, local: automationScheduleToLocal(utc, 420) }, {
			utc: { ...local, timeZone: 'UTC', scheduleHour: 6 }, local,
		});
	});

	test('fixed UTC displays differently in winter and summer, while a held editing offset roundtrips exactly', () => {
		const utc: IAutomationSchedule = { interval: 'daily', timeZone: 'UTC', scheduleHour: 16, scheduleMinute: 45, scheduleDay: 1 };
		const summer = automationScheduleToLocal(utc, 420);
		const winter = automationScheduleToLocal(utc, 480);
		assert.deepStrictEqual({
			summer: summer.scheduleHour, winter: winter.scheduleHour,
			unchangedSave: automationScheduleToUTC(summer, 420),
		}, { summer: 9, winter: 8, unchangedSave: utc });
	});

	test('all daily and weekly minutes roundtrip with representative offsets', () => {
		for (const interval of ['daily', 'weekly'] as const) {
			for (const offset of [-840, -765, -345, -330, 0, 210, 420, 480, 720]) {
				for (let day = 0; day < 7; day++) {
					for (let minute = 0; minute < 1440; minute++) {
						const schedule: IAutomationSchedule = { interval, timeZone: 'UTC', scheduleHour: Math.floor(minute / 60), scheduleMinute: minute % 60, scheduleDay: day };
						assert.deepStrictEqual(automationScheduleToUTC(automationScheduleToLocal(schedule, offset), offset), schedule);
					}
				}
			}
		}
	});

	test('manual, hourly and custom fields are not shifted, and already-local/UTC schedules are not double converted', () => {
		for (const interval of ['manual', 'hourly', 'custom'] as const) {
			const local: IAutomationSchedule = { interval, scheduleHour: 0, scheduleMinute: 7, scheduleDay: 3 };
			const utc: IAutomationSchedule = { ...local, timeZone: 'UTC' };
			assert.deepStrictEqual({
				local: automationScheduleToLocal(utc, -345), utc: automationScheduleToUTC(local, 420),
				alreadyLocal: automationScheduleToLocal(local, 420), alreadyUTC: automationScheduleToUTC(utc, 420),
			}, { local, utc, alreadyLocal: local, alreadyUTC: utc });
		}
	});
});

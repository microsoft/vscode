/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { IAutomationSchedule } from './automation.js';

export const DAYS_OF_WEEK: readonly string[] = [
	localize('automation.day.sun', "Sunday"),
	localize('automation.day.mon', "Monday"),
	localize('automation.day.tue', "Tuesday"),
	localize('automation.day.wed', "Wednesday"),
	localize('automation.day.thu', "Thursday"),
	localize('automation.day.fri', "Friday"),
	localize('automation.day.sat', "Saturday"),
];

export function formatAutomationSchedule(schedule: IAutomationSchedule): string {
	const date = new Date(Date.UTC(2000, 0, 1, schedule.scheduleHour, schedule.scheduleMinute));
	const clock = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
	const time = schedule.timeZone === 'UTC' ? localize('automation.schedule.utc', "{0} UTC", clock) : clock;
	switch (schedule.interval) {
		case 'manual': return localize('automation.schedule.manual', "Manual");
		case 'hourly': return localize('automation.schedule.hourly', "Hourly");
		case 'daily': return localize('automation.schedule.daily', "Daily at {0}", time);
		case 'weekly': return localize('automation.schedule.weekly', "{0} at {1}", DAYS_OF_WEEK[schedule.scheduleDay], time);
		case 'custom': return localize('automation.schedule.custom', "Custom triggers (read-only)");
	}
}

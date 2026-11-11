/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { IAutomationDescriptor } from './automation.js';

export const CREATE_REMINDER_COMMAND = 'workbench.action.chat.createReminder';
export const OPEN_REMINDER_COMMAND = 'workbench.action.chat.openReminder';
export const OPEN_REMINDERS_COMMAND = 'workbench.action.chat.openReminders';
export const EDIT_REMINDER_COMMAND = 'workbench.action.chat.editReminder';
export const UNDO_REMINDER_COMMAND = 'workbench.action.chat.undoReminder';
export const SESSIONS_SHOW_REMINDERS_SETTING = 'sessions.list.showReminders';
export const REMINDERS_SECTION_ID = 'reminders';

export function reminderDescription(automation: IAutomationDescriptor): string {
	const at = automation.schedule.at;
	const time = at ? new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';
	switch (automation.reminder?.status) {
		case 'due': return localize('reminder.due', "Due: {0}", time);
		case 'dismissed': return localize('reminder.dismissed', "Dismissed");
		case 'sent': return localize('reminder.sent', "Sent to Session");
		default: return localize('reminder.scheduled', "Scheduled: {0}", time);
	}
}

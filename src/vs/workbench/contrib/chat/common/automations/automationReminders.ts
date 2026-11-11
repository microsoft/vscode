/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { ChatAIDisabledSettingId } from '../../../../../platform/chat/common/chatSettings.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { IAutomationDescriptor } from './automation.js';
import { CHAT_AUTOMATIONS_ENABLED_SETTING } from './automationsEnabled.js';

export const CREATE_REMINDER_COMMAND = 'workbench.action.chat.createReminder';
export const OPEN_REMINDER_COMMAND = 'workbench.action.chat.openReminder';
export const OPEN_REMINDERS_COMMAND = 'workbench.action.chat.openReminders';
export const EDIT_REMINDER_COMMAND = 'workbench.action.chat.editReminder';
export const UNDO_REMINDER_COMMAND = 'workbench.action.chat.undoReminder';
export const CREATE_REMINDER_DRAFT_COMMAND = 'workbench.action.chat.createReminderDraft';
export const POSTPONE_REMINDER_COMMAND = 'workbench.action.chat.postponeReminder';
export const DISMISS_REMINDER_COMMAND = 'workbench.action.chat.dismissReminder';
export const OPEN_REMINDER_SOURCE_COMMAND = 'workbench.action.chat.openReminderSource';
export const SESSIONS_SHOW_REMINDERS_SETTING = 'sessions.list.showReminders';
export const AUTOMATION_REMINDERS_ENABLED_SETTING = 'chat.automations.reminders.enabled';
export const AutomationRemindersEnabledContext = ContextKeyExpr.equals(`config.${AUTOMATION_REMINDERS_ENABLED_SETTING}`, true);
export const ReminderStatusContext = new RawContextKey<string>('reminder.status', '');
export const ReminderHasSourceContext = new RawContextKey<boolean>('reminder.hasSource', false);
export const RemindersCanCreateContext = new RawContextKey<boolean>('reminders.canCreate', false);
export const REMINDERS_SECTION_ID = 'reminders';

export function isAutomationRemindersEnabled(configurationService: IConfigurationService): boolean {
	return configurationService.getValue<boolean>(AUTOMATION_REMINDERS_ENABLED_SETTING) === true
		&& configurationService.getValue<boolean>(CHAT_AUTOMATIONS_ENABLED_SETTING) === true
		&& !configurationService.getValue<boolean>(ChatAIDisabledSettingId);
}

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

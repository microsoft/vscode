/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { InboxNotificationKind, InboxNotificationPriority } from '../common/inboxNotificationsService.js';

export function getInboxNotificationKindLabel(kind: InboxNotificationKind): string {
	switch (kind) {
		case InboxNotificationKind.ConfirmationRequested:
			return localize('inboxNotifications.kind.confirmationRequested', "Confirmation");
		case InboxNotificationKind.NeedsInput:
			return localize('inboxNotifications.kind.needsInput', "Needs Input");
		case InboxNotificationKind.FailingCI:
			return localize('inboxNotifications.kind.failingCi', "CI");
		case InboxNotificationKind.PassingCI:
			return localize('inboxNotifications.kind.passingCi', "Merge Ready");
		case InboxNotificationKind.ReviewComments:
			return localize('inboxNotifications.kind.reviewComments', "Comments");
		case InboxNotificationKind.Completed:
			return localize('inboxNotifications.kind.completed', "Completed");
		case InboxNotificationKind.External:
		default:
			return localize('inboxNotifications.kind.external', "Event");
	}
}

export function getInboxNotificationPriorityLabel(priority: InboxNotificationPriority): string {
	switch (priority) {
		case InboxNotificationPriority.Critical:
			return localize('inboxNotifications.priority.critical', "Critical");
		case InboxNotificationPriority.Moderate:
			return localize('inboxNotifications.priority.moderate', "Moderate");
		case InboxNotificationPriority.Low:
		default:
			return localize('inboxNotifications.priority.low', "Low");
	}
}

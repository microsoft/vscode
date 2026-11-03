/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { IInboxNotificationItem, IInboxSessionRow, InboxNotificationKind, InboxNotificationPriority, InboxTab } from '../common/inboxNotificationsService.js';

export function getInboxTabLabel(tab: InboxTab): string {
	switch (tab) {
		case InboxTab.ReadyForYou: return localize('inbox.tab.readyForYou', "Ready for you");
		case InboxTab.Working: return localize('inbox.tab.working', "Working");
		case InboxTab.ReadyToMerge: return localize('inbox.tab.readyToMerge', "Ready to merge");
		case InboxTab.OnHold: return localize('inbox.tab.onHold', "On hold");
		case InboxTab.Done: return localize('inbox.tab.done', "Done");
	}
}

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
		case InboxNotificationKind.PullRequestMerged:
			return localize('inboxNotifications.kind.pullRequestMerged', "Merged");
		case InboxNotificationKind.ReviewComments:
			return localize('inboxNotifications.kind.reviewComments', "Comments");
		case InboxNotificationKind.Completed:
			return localize('inboxNotifications.kind.completed', "Completed");
		case InboxNotificationKind.External:
		default:
			return localize('inboxNotifications.kind.external', "Event");
	}
}

export function getInboxNotificationLabel(item: Pick<IInboxNotificationItem, 'kind'> & Partial<Pick<IInboxSessionRow, 'tab' | 'notifications'>>): string {
	return item.tab && item.notifications?.length === 0 ? getInboxTabLabel(item.tab) : getInboxNotificationKindLabel(item.kind);
}

export function getInboxNotificationPriorityLabel(priority: InboxNotificationPriority): string {
	switch (priority) {
		case InboxNotificationPriority.Now:
			return localize('inboxNotifications.priority.now', "Now");
		case InboxNotificationPriority.Next:
			return localize('inboxNotifications.priority.next', "Next");
		case InboxNotificationPriority.Later:
		default:
			return localize('inboxNotifications.priority.later', "Later");
	}
}

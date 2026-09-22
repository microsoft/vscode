/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toAction } from '../../../../base/common/actions.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import Severity from '../../../../base/common/severity.js';
import { localize } from '../../../../nls.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { ICustomViewService } from '../../../services/customView/browser/customViewService.js';
import { IInboxNotificationItem, IInboxNotificationsService } from '../common/inboxNotificationsService.js';
import { INBOX_NOTIFICATIONS_VIEW_ID } from './inboxNotificationsConstants.js';

/**
 * Raises a transient toast when new inbox notifications arrive while the user is
 * not currently in the Inbox view. The toast aggregates multiple arrivals into a
 * single message and, when actioned, opens the Inbox focused on the
 * highest-priority new item.
 */
export class InboxNotificationsToastContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsInboxNotificationsToast';

	private seeded = false;
	private previousKeys = new Set<string>();

	constructor(
		@IInboxNotificationsService private readonly inboxNotificationsService: IInboxNotificationsService,
		@ICustomViewService private readonly customViewService: ICustomViewService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();

		this._register(autorun(reader => {
			const items = this.inboxNotificationsService.notifications.read(reader);
			const currentKeys = new Set(items.map(item => stableToastKey(item)));

			if (!this.seeded) {
				this.seeded = true;
				this.previousKeys = currentKeys;
				return;
			}

			const newItems = items.filter(item => !this.previousKeys.has(stableToastKey(item)));
			this.previousKeys = currentKeys;
			if (newItems.length === 0) {
				return;
			}

			// Only interrupt when the user is not already looking at the Inbox.
			if (this.customViewService.activeCustomView.read(undefined)?.id === INBOX_NOTIFICATIONS_VIEW_ID) {
				return;
			}

			this.notifyNewItems(newItems);
		}));
	}

	private notifyNewItems(newItems: readonly IInboxNotificationItem[]): void {
		const topItem = [...newItems].sort((a, b) => a.priority - b.priority || b.timestamp - a.timestamp)[0];
		const message = newItems.length === 1
			? localize('inboxNotifications.toast.single', "New inbox notification: {0}", topItem.title)
			: localize('inboxNotifications.toast.multiple', "{0} new inbox notifications", newItems.length);

		this.notificationService.notify({
			severity: Severity.Info,
			message,
			actions: {
				primary: [
					toAction({
						id: 'sessions.inboxNotifications.openFromToast',
						label: localize('inboxNotifications.toast.view', "View"),
						run: () => {
							this.customViewService.showCustomView(INBOX_NOTIFICATIONS_VIEW_ID);
							this.inboxNotificationsService.requestReveal(topItem.id);
						},
					}),
				],
			},
		});
	}
}

/**
 * A key that is stable across the volatile parts of a notification id (timestamps,
 * commit shas) so churn on the same underlying notification does not re-toast.
 */
function stableToastKey(item: IInboxNotificationItem): string {
	if (item.sessionResource) {
		return `s:${item.sessionResource.toString()}:${item.kind}:${item.repositoryLabel ?? ''}`;
	}
	return `x:${item.id}`;
}

registerWorkbenchContribution2(InboxNotificationsToastContribution.ID, InboxNotificationsToastContribution, WorkbenchPhase.AfterRestored);

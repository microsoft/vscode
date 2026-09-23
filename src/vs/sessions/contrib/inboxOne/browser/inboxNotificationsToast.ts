/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toAction } from '../../../../base/common/actions.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import Severity from '../../../../base/common/severity.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
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

	constructor(
		@IChatEntitlementService entitlementService: IChatEntitlementService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ICustomViewService private readonly customViewService: ICustomViewService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();

		// Only activate (and instantiate the Inbox service, starting its background work) when
		// AI features are not hidden, mirroring how the view and commands are gated. This keeps
		// `chat.disableAIFeatures` hiding the entire feature, not just the view entry point.
		const active = this._register(new MutableDisposable<DisposableStore>());
		this._register(autorun(reader => {
			if (entitlementService.sentimentObs.read(reader).hidden) {
				active.clear();
				return;
			}
			if (!active.value) {
				active.value = this.activate(instantiationService.invokeFunction(accessor => accessor.get(IInboxNotificationsService)));
			}
		}));
	}

	private activate(inboxNotificationsService: IInboxNotificationsService): DisposableStore {
		const store = new DisposableStore();
		let seeded = false;
		let previousKeys = new Set<string>();
		store.add(autorun(reader => {
			const items = inboxNotificationsService.notifications.read(reader);
			const currentKeys = new Set(items.map(item => stableToastKey(item)));

			if (!seeded) {
				seeded = true;
				previousKeys = currentKeys;
				return;
			}

			const newItems = items.filter(item => !previousKeys.has(stableToastKey(item)));
			previousKeys = currentKeys;
			if (newItems.length === 0) {
				return;
			}

			// Only interrupt when the user is not already looking at the Inbox.
			if (this.customViewService.activeCustomView.read(undefined)?.id === INBOX_NOTIFICATIONS_VIEW_ID) {
				return;
			}

			this.notifyNewItems(inboxNotificationsService, newItems);
		}));
		return store;
	}

	private notifyNewItems(inboxNotificationsService: IInboxNotificationsService, newItems: readonly IInboxNotificationItem[]): void {
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
							inboxNotificationsService.requestReveal(topItem.id);
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

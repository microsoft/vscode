/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/inboxNotificationsView.css';
import { $, clearNode, trackFocus } from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, IObservable, observableValue } from '../../../../base/common/observable.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { fromNowByDay } from '../../../../base/common/date.js';
import { AbstractCustomView } from '../../../services/customView/browser/customView.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { InboxCustomViewFocusContext } from '../../../common/contextkeys.js';
import {
	IInboxNotificationAction,
	IInboxNotificationItem,
	IInboxNotificationsService,
	InboxNotificationActionKind,
	InboxNotificationPriority,
} from '../common/inboxNotificationsService.js';
import { getInboxNotificationKindLabel, getInboxNotificationPriorityLabel } from './inboxNotificationsLabels.js';

export class InboxNotificationsView extends AbstractCustomView {

	readonly title: IObservable<string> = constObservable(localize('inboxNotifications.title', "Inbox"));
	override readonly description: IObservable<string | undefined>;

	private readonly scrollableContentElement = $('div.inbox-notifications-list-scrollable');
	private readonly listContainer = observableValue<HTMLElement | undefined>('inboxNotificationsListContainer', undefined);
	private readonly listElement = $('div.inbox-notifications-list');
	private readonly scrollableElement = this._register(new DomScrollableElement(this.scrollableContentElement, {
		horizontal: ScrollbarVisibility.Hidden,
		vertical: ScrollbarVisibility.Auto,
		consumeMouseWheelIfScrollbarIsNeeded: true,
		className: 'inbox-notifications-scrollable',
	}));
	private readonly renderedListDisposables = this._register(new DisposableStore());

	constructor(
		@IInboxNotificationsService private readonly inboxNotificationsService: IInboxNotificationsService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@INotificationService private readonly notificationService: INotificationService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();
		this.description = this.inboxNotificationsService.notifications.map(items => {
			if (items.length === 0) {
				return localize('inboxNotifications.description.empty', "No active notifications.");
			}
			return items.length === 1
				? localize('inboxNotifications.description.single', "1 notification prioritized for action")
				: localize('inboxNotifications.description.plural', "{0} notifications prioritized for action", items.length);
		});
	}

	render(container: HTMLElement): void {
		container.classList.add('inbox-notifications-view');
		container.tabIndex = -1;
		if (!this.listElement.parentElement) {
			this.scrollableContentElement.appendChild(this.listElement);
		}

		const focusContext = InboxCustomViewFocusContext.bindTo(this.contextKeyService);
		const focusTracker = this._register(trackFocus(container));
		this._register(focusTracker.onDidFocus(() => focusContext.set(true)));
		this._register(focusTracker.onDidBlur(() => focusContext.set(false)));
		this._register({
			dispose: () => focusContext.reset(),
		});

		const toolbar = container.appendChild($('.inbox-notifications-toolbar'));
		const clearDismissedButton = this._register(new Button(toolbar, {
			...defaultButtonStyles,
			secondary: true,
			ariaLabel: localize('inboxNotifications.clearDismissedAria', "Show dismissed notifications"),
		}));
		clearDismissedButton.label = localize('inboxNotifications.clearDismissed', "Show Dismissed");
		this._register(clearDismissedButton.onDidClick(() => {
			this.inboxNotificationsService.clearDismissedNotifications();
		}));

		container.appendChild(this.scrollableElement.getDomNode());
		const list = this.listElement;
		list.setAttribute('role', 'list');
		list.setAttribute('aria-label', localize('inboxNotifications.listAriaLabel', "Prioritized notifications"));
		this.listContainer.set(list, undefined);

		this._register(autorun(reader => {
			this.inboxNotificationsService.notifications.read(reader);
			this.renderList();
		}));
	}

	private renderList(): void {
		const list = this.listContainer.get();
		if (!list) {
			return;
		}
		this.renderedListDisposables.clear();
		clearNode(list);

		const items = this.inboxNotificationsService.notifications.get();
		if (items.length === 0) {
			list.appendChild($('.inbox-notifications-empty', undefined, localize('inboxNotifications.empty', "You're all caught up.")));
			return;
		}

		for (const item of items) {
			list.appendChild(this.renderItem(item));
		}

		this.scrollableElement.scanDomNode();
	}

	private renderItem(item: IInboxNotificationItem): HTMLElement {
		const card = $('.inbox-notifications-item');
		card.classList.add(`priority-${item.priority}`);
		card.setAttribute('role', 'listitem');
		card.setAttribute('aria-label', localize(
			'inboxNotifications.itemAriaLabel',
			"Priority {0}. {1}. {2}. {3}",
			this.priorityLabel(item.priority),
			this.kindLabel(item.kind),
			item.title,
			item.description,
		));

		const heading = card.appendChild($('.inbox-notifications-item-header'));
		heading.appendChild($('.inbox-notifications-item-title', undefined, item.title));

		const badges = card.appendChild($('.inbox-notifications-item-badges'));
		badges.appendChild($('.inbox-notifications-item-badge kind', undefined, this.kindLabel(item.kind)));
		badges.appendChild($('.inbox-notifications-item-badge priority', undefined, this.priorityLabel(item.priority)));

		card.appendChild($('.inbox-notifications-item-description', undefined, item.description));
		card.appendChild($('.inbox-notifications-item-time', undefined, fromNowByDay(item.timestamp, true, true)));

		const actions = card.appendChild($('.inbox-notifications-item-actions'));
		for (const action of item.actions) {
			const button = this.renderedListDisposables.add(new Button(actions, {
				...defaultButtonStyles,
				secondary: !action.primary,
				small: true,
				ariaLabel: localize('inboxNotifications.actionAriaLabel', "{0} for {1}", action.label, item.title),
			}));
			button.label = action.label;
			this.renderedListDisposables.add(button.onDidClick(() => void this.runAction(item, action)));
		}

		return card;
	}

	private kindLabel(kind: IInboxNotificationItem['kind']): string {
		return getInboxNotificationKindLabel(kind);
	}

	private priorityLabel(priority: InboxNotificationPriority): string {
		return getInboxNotificationPriorityLabel(priority);
	}

	private async runAction(item: IInboxNotificationItem, action: IInboxNotificationAction): Promise<void> {
		try {
			switch (action.kind) {
				case InboxNotificationActionKind.OpenSession: {
					if (!item.sessionResource) {
						return;
					}
					await this.sessionsService.openSession(item.sessionResource);
					return;
				}
				case InboxNotificationActionKind.MarkSessionRead: {
					if (!item.sessionResource) {
						return;
					}
					const session = this.sessionsManagementService.getSession(item.sessionResource);
					if (!session) {
						return;
					}
					await this.sessionsManagementService.markRead(session);
					return;
				}
				case InboxNotificationActionKind.Dismiss:
					this.inboxNotificationsService.dismissNotification(item.id);
					return;
				case InboxNotificationActionKind.Command:
					if (action.commandId) {
						await this.commandService.executeCommand(action.commandId, ...(action.commandArgs ?? []));
					}
					return;
			}
		} catch (error) {
			onUnexpectedError(error);
			this.notificationService.error(localize('inboxNotifications.actionError', "Unable to run inbox action."));
		}
	}

	layout(_width: number, _height: number): void {
		this.scrollableElement.scanDomNode();
	}
}

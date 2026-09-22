/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/inboxNotificationsView.css';
import { $, addDisposableListener, clearNode, EventType, getActiveElement, isHTMLElement, trackFocus } from '../../../../base/browser/dom.js';
import { triggerConfettiAnimation } from '../../../../base/browser/ui/animations/animations.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, IObservable, observableValue } from '../../../../base/common/observable.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { localize } from '../../../../nls.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { fromNowByDay } from '../../../../base/common/date.js';
import { isAgentHostProvider } from '../../../common/agentHostSessionsProvider.js';
import { AgentMergeSessionOverrides } from '../../../../platform/agentHost/common/agentMerge.js';
import { SESSIONS_MARK_AS_DONE_CONFETTI_SETTING } from '../../../../platform/chat/common/sessionArchiveActions.js';
import { AbstractCustomView } from '../../../services/customView/browser/customView.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
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
	private renderedCards: HTMLElement[] = [];

	constructor(
		@IInboxNotificationsService private readonly inboxNotificationsService: IInboxNotificationsService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@INotificationService private readonly notificationService: INotificationService,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
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
		this._register(addDisposableListener(list, EventType.FOCUS_IN, event => this.onListFocusIn(event)));
		this._register(addDisposableListener(list, EventType.KEY_DOWN, event => this.onListKeyDown(event)));

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

		const previouslyFocusedElement = getActiveElement();
		const hadFocusWithinList = isHTMLElement(previouslyFocusedElement) && list.contains(previouslyFocusedElement);
		const focusedNotificationId = hadFocusWithinList
			? previouslyFocusedElement.closest<HTMLElement>('.inbox-notifications-item')?.dataset.notificationId
			: undefined;

		this.renderedListDisposables.clear();
		clearNode(list);

		const items = this.inboxNotificationsService.notifications.get();
		this.renderedCards = [];
		if (items.length === 0) {
			list.appendChild($('.inbox-notifications-empty', undefined, localize('inboxNotifications.empty', "You're all caught up.")));
			return;
		}

		for (const item of items) {
			const card = this.renderItem(item);
			this.renderedCards.push(card);
			list.appendChild(card);
		}

		this.applyCardTabStops(focusedNotificationId);
		if (hadFocusWithinList) {
			const target = this.getNotificationCards().find(card => card.tabIndex === 0);
			target?.focus();
		}

		this.scrollableElement.scanDomNode();
	}

	private renderItem(item: IInboxNotificationItem): HTMLElement {
		const card = $('.inbox-notifications-item');
		card.classList.add(`priority-${item.priority}`);
		card.setAttribute('role', 'listitem');
		card.dataset.notificationId = item.id;
		card.setAttribute('aria-label', item.repositoryLabel
			? localize(
				'inboxNotifications.itemAriaLabel.withRepository',
				"Priority {0}. {1}. Repository {2}. {3}. {4}",
				this.priorityLabel(item.priority),
				this.kindLabel(item.kind),
				item.repositoryLabel,
				item.title,
				item.description,
			)
			: localize(
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
		if (item.repositoryLabel) {
			badges.appendChild($('.inbox-notifications-item-badge repository', undefined, item.repositoryLabel));
		}

		card.appendChild($('.inbox-notifications-item-description', undefined, item.description));
		card.appendChild($('.inbox-notifications-item-time', undefined, fromNowByDay(item.timestamp, true, true)));

		const actions = card.appendChild($('.inbox-notifications-item-actions'));
		for (const action of item.actions) {
			const button = this.renderedListDisposables.add(new Button(actions, {
				...defaultButtonStyles,
				secondary: !action.primary,
				small: true,
				supportIcons: action.kind === InboxNotificationActionKind.MarkDone,
				ariaLabel: localize('inboxNotifications.actionAriaLabel', "{0} for {1}", action.ariaLabel ?? action.label, item.title),
			}));
			if (action.kind === InboxNotificationActionKind.MarkDone) {
				button.element.classList.add('inbox-notifications-item-action-done');
			}
			button.label = action.label;
			this.renderedListDisposables.add(button.onDidClick(() => void this.runAction(item, action, button.element)));
		}

		return card;
	}

	private onListFocusIn(event: FocusEvent): void {
		const target = event.target;
		if (!isHTMLElement(target)) {
			return;
		}

		const card = target.closest<HTMLElement>('.inbox-notifications-item');
		if (!card) {
			return;
		}

		this.setActiveCard(card);
	}

	private onListKeyDown(event: KeyboardEvent): void {
		if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
			return;
		}

		const target = event.target;
		if (!isHTMLElement(target)) {
			return;
		}

		const cards = this.getNotificationCards();
		const currentIndex = cards.findIndex(card => card === target || card.contains(target));
		if (currentIndex === -1) {
			return;
		}

		const delta = event.key === 'ArrowDown' ? 1 : -1;
		const nextIndex = Math.min(cards.length - 1, Math.max(0, currentIndex + delta));
		if (nextIndex === currentIndex) {
			return;
		}

		event.preventDefault();
		this.setActiveCard(cards[nextIndex]);
		cards[nextIndex].focus();
	}

	private applyCardTabStops(preferredNotificationId: string | undefined): void {
		const cards = this.getNotificationCards();
		if (cards.length === 0) {
			return;
		}

		const activeCard = preferredNotificationId
			? cards.find(card => card.dataset.notificationId === preferredNotificationId)
			: undefined;
		this.setActiveCard(activeCard ?? cards[0]);
	}

	private setActiveCard(activeCard: HTMLElement): void {
		const cards = this.getNotificationCards();
		const setSize = cards.length;
		for (const [index, card] of cards.entries()) {
			card.tabIndex = card === activeCard ? 0 : -1;
			card.setAttribute('aria-posinset', String(index + 1));
			card.setAttribute('aria-setsize', String(setSize));
		}
	}

	private getNotificationCards(): HTMLElement[] {
		return this.renderedCards;
	}

	private kindLabel(kind: IInboxNotificationItem['kind']): string {
		return getInboxNotificationKindLabel(kind);
	}

	private priorityLabel(priority: InboxNotificationPriority): string {
		return getInboxNotificationPriorityLabel(priority);
	}

	private async runAction(item: IInboxNotificationItem, action: IInboxNotificationAction, sourceElement?: HTMLElement): Promise<void> {
		try {
			switch (action.kind) {
				case InboxNotificationActionKind.OpenSession: {
					if (!item.sessionResource) {
						return;
					}
					await this.sessionsService.openSession(item.sessionResource);
					return;
				}
				case InboxNotificationActionKind.AgentMergeFixCI:
					await this.runAgentMergeAction(item, { fixCI: true });
					return;
				case InboxNotificationActionKind.AgentMergeAddressReviews:
					await this.runAgentMergeAction(item, { addressReviews: true });
					return;
				case InboxNotificationActionKind.AgentMergeMergePullRequest:
					await this.runAgentMergeAction(item, { mergePullRequest: 'always' });
					return;
				case InboxNotificationActionKind.MarkDone: {
					await this.markDone(item, sourceElement);
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

	private async runAgentMergeAction(item: IInboxNotificationItem, overrides: AgentMergeSessionOverrides): Promise<void> {
		if (!item.sessionResource) {
			return;
		}

		const session = this.sessionsManagementService.getSession(item.sessionResource);
		if (!session) {
			return;
		}

		const provider = this.sessionsProvidersService.getProvider(session.providerId);
		if (!provider || !isAgentHostProvider(provider)) {
			await this.sessionsService.openSession(item.sessionResource);
			return;
		}

		await provider.setAgentMergeEnabled(session.sessionId, true);
		const currentOverrides = provider.getAgentMergeSessionState(session.sessionId)?.overrides;
		await provider.setAgentMergeOverrides(session.sessionId, {
			...currentOverrides,
			...overrides,
		});
	}

	private async markDone(item: IInboxNotificationItem, sourceElement: HTMLElement | undefined): Promise<void> {
		if (sourceElement
			&& this.configurationService.getValue<boolean>(SESSIONS_MARK_AS_DONE_CONFETTI_SETTING)
			&& !this.accessibilityService.isMotionReduced()) {
			triggerConfettiAnimation(sourceElement);
		}

		if (item.sessionResource) {
			const session = this.sessionsManagementService.getSession(item.sessionResource);
			if (session) {
				await this.sessionsManagementService.markRead(session);
			}
		}

		this.inboxNotificationsService.dismissNotification(item.id);
	}

	layout(_width: number, _height: number): void {
		this.scrollableElement.scanDomNode();
	}
}

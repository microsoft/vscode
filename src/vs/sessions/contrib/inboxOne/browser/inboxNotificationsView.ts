/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/inboxNotificationsView.css';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { $, addDisposableListener, clearNode, EventType, getActiveElement, isEditableElement, isHTMLElement, trackFocus } from '../../../../base/browser/dom.js';
import { triggerConfettiAnimation } from '../../../../base/browser/ui/animations/animations.js';
import { Button, ButtonWithDropdown, IButton } from '../../../../base/browser/ui/button/button.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { toAction } from '../../../../base/common/actions.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, IObservable, observableValue } from '../../../../base/common/observable.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { localize } from '../../../../nls.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { URI } from '../../../../base/common/uri.js';
import { fromNowByDay } from '../../../../base/common/date.js';
import { ChatSendResult, IChatConfirmation, IChatQuestionAnswerValue, IChatQuestionCarousel, IChatSendRequestOptions, IChatService, IChatToolInvocation, ToolConfirmKind } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatContentPartRenderContext } from '../../../../workbench/contrib/chat/browser/widget/chatContentParts/chatContentParts.js';
import { SimpleChatConfirmationWidget } from '../../../../workbench/contrib/chat/browser/widget/chatContentParts/chatConfirmationWidget.js';
import { ChatQuestionCarouselPart } from '../../../../workbench/contrib/chat/browser/widget/chatContentParts/chatQuestionCarouselPart.js';
import { IChatRequestModel, IChatResponseModel } from '../../../../workbench/contrib/chat/common/model/chatModel.js';
import { isAgentHostProvider } from '../../../common/agentHostSessionsProvider.js';
import { AgentMergeSessionOverrides } from '../../../../platform/agentHost/common/agentMerge.js';
import { SESSIONS_MARK_AS_DONE_CONFETTI_SETTING } from '../../../../platform/chat/common/sessionArchiveActions.js';
import { AbstractCustomView } from '../../../services/customView/browser/customView.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { InboxCustomViewFocusContext } from '../../../common/contextkeys.js';
import { markOnboardingTarget } from '../../../../workbench/contrib/onboarding/browser/spotlight/onboardingTarget.js';
import { ISpotlightPayload, SPOTLIGHT_PRESENTATION_KIND } from '../../../../workbench/contrib/onboarding/browser/spotlight/spotlightTypes.js';
import { onboardingScenarioRegistry } from '../../../../workbench/contrib/onboarding/common/onboardingRegistry.js';
import { IOnboardingScenario } from '../../../../workbench/contrib/onboarding/common/onboardingScenario.js';
import { IOnboardingScenarioService } from '../../../../workbench/contrib/onboarding/common/onboardingScenarioService.js';
import {
	IInboxNotificationAction,
	IInboxNotificationItem,
	IInboxNotificationConfirmationPart,
	IInboxNotificationQuestionCarouselPart,
	IInboxNotificationToolConfirmationPart,
	IInboxNotificationsService,
	InboxNotificationActionKind,
	InboxNotificationPriority,
	InboxNotificationsSortMode,
} from '../common/inboxNotificationsService.js';
import { InboxAgentMergeActionKind, InboxAgentMergeAlwaysOptInService, isInboxAgentMergeActionKind } from './inboxAgentMergeAlwaysOptInService.js';
import { getInboxNotificationKindLabel, getInboxNotificationPriorityLabel } from './inboxNotificationsLabels.js';

function isDismissibleQuestionCarousel(carousel: IChatQuestionCarousel): carousel is IChatQuestionCarousel & { dismiss(answers: Record<string, IChatQuestionAnswerValue> | undefined): void } {
	return typeof (carousel as { dismiss?: unknown }).dismiss === 'function';
}

const COLLAPSED_SECTIONS_STORAGE_KEY = 'sessions.inboxNotifications.collapsedSections';
const COMPLETED_SECTION_KEY = 'completed';

interface IInboxTierSpec {
	readonly key: string;
	readonly priority: InboxNotificationPriority;
}

/** Importance tiers in display order. Empty tiers are hidden at render time. */
const TIER_SECTIONS: readonly IInboxTierSpec[] = [
	{ key: 'critical', priority: InboxNotificationPriority.Critical },
	{ key: 'moderate', priority: InboxNotificationPriority.Moderate },
	{ key: 'low', priority: InboxNotificationPriority.Low },
];

export class InboxNotificationsView extends AbstractCustomView {

	private static activeInstance: InboxNotificationsView | undefined;

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
	private renderedItems: readonly IInboxNotificationItem[] = [];
	private readonly collapsedSections = new Set<string>();
	private collapsedSectionsLoaded = false;
	private pendingRevealId: string | undefined;
	private lastRevealToken = -1;
	private readonly showCompleted = observableValue<boolean>('inboxNotificationsShowCompleted', false);
	private deferredItems: readonly IInboxNotificationItem[] | undefined;
	private deferredNewNotificationsCount = 0;
	private announcedDeferredNewNotificationsCount = 0;
	private readonly agentMergeDropdownButtons = new Map<string, HTMLElement>();
	private readonly agentMergeAlwaysOptInService: InboxAgentMergeAlwaysOptInService;
	private isShowingAgentMergeAlwaysPrompt = false;
	private readonly deferredUpdatesBanner = $('div.inbox-notifications-deferred-updates.hidden');
	private readonly deferredUpdatesBannerLabel = $('span.inbox-notifications-deferred-updates-label');

	static getActiveInstance(): InboxNotificationsView | undefined {
		return InboxNotificationsView.activeInstance;
	}

	constructor(
		@IInboxNotificationsService private readonly inboxNotificationsService: IInboxNotificationsService,
		@IChatService private readonly chatService: IChatService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IOnboardingScenarioService private readonly onboardingScenarioService: IOnboardingScenarioService,
		@INotificationService private readonly notificationService: INotificationService,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();
		InboxNotificationsView.activeInstance = this;
		this.agentMergeAlwaysOptInService = this.instantiationService.createInstance(InboxAgentMergeAlwaysOptInService);
		this.description = this.inboxNotificationsService.notifications.map(items => {
			if (items.length === 0) {
				return localize('inboxNotifications.description.empty', "No active notifications.");
			}
			return items.length === 1
				? localize('inboxNotifications.description.single', "1 notification prioritized for action")
				: localize('inboxNotifications.description.plural', "{0} notifications prioritized for action", items.length);
		});
	}

	override dispose(): void {
		if (InboxNotificationsView.activeInstance === this) {
			InboxNotificationsView.activeInstance = undefined;
		}
		super.dispose();
	}

	async debugShowAgentMergeAlwaysSpotlight(): Promise<boolean> {
		if (this.isShowingAgentMergeAlwaysPrompt) {
			return false;
		}

		const preferredActionKinds: readonly InboxAgentMergeActionKind[] = [
			InboxNotificationActionKind.AgentMergeMergePullRequest,
			InboxNotificationActionKind.AgentMergeFixCI,
			InboxNotificationActionKind.AgentMergeAddressReviews,
		];
		const items = this.inboxNotificationsService.notifications.get();
		for (const item of items) {
			for (const actionKind of preferredActionKinds) {
				if (!item.actions.some(action => action.kind === actionKind) || !this.canShowAgentMergeAlwaysDropdown(item, actionKind)) {
					continue;
				}

				const target = this.agentMergeDropdownButtons.get(this.getAgentMergeDropdownButtonKey(item.id, actionKind));
				if (!target) {
					continue;
				}

				this.isShowingAgentMergeAlwaysPrompt = true;
				try {
					await this.showAgentMergeAlwaysSpotlight(item, actionKind, target, 10);
					return true;
				} finally {
					this.isShowingAgentMergeAlwaysPrompt = false;
				}
			}
		}

		return false;
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
		const sortButtons = toolbar.appendChild($('.inbox-notifications-sort-buttons'));
		const sortByPriorityButton = this._register(new Button(sortButtons, {
			...defaultButtonStyles,
			secondary: true,
			small: true,
			ariaLabel: localize('inboxNotifications.sort.priorityAria', "Sort notifications by priority"),
		}));
		sortByPriorityButton.label = localize('inboxNotifications.sort.priority', "Priority");
		this._register(sortByPriorityButton.onDidClick(() => {
			this.inboxNotificationsService.setSortMode(InboxNotificationsSortMode.Priority);
		}));

		const sortByRecencyButton = this._register(new Button(sortButtons, {
			...defaultButtonStyles,
			secondary: true,
			small: true,
			ariaLabel: localize('inboxNotifications.sort.recencyAria', "Sort notifications by recency"),
		}));
		sortByRecencyButton.label = localize('inboxNotifications.sort.recency', "Recent");
		this._register(sortByRecencyButton.onDidClick(() => {
			this.inboxNotificationsService.setSortMode(InboxNotificationsSortMode.Recency);
		}));

		this._register(autorun(reader => {
			const sortMode = this.inboxNotificationsService.sortMode.read(reader);
			const prioritySelected = sortMode === InboxNotificationsSortMode.Priority;
			sortByPriorityButton.element.classList.toggle('active', prioritySelected);
			sortByRecencyButton.element.classList.toggle('active', !prioritySelected);
		}));

		const toggleCompletedButton = this._register(new Button(toolbar, {
			...defaultButtonStyles,
			secondary: true,
		}));
		this._register(toggleCompletedButton.onDidClick(() => {
			this.showCompleted.set(!this.showCompleted.get(), undefined);
		}));
		this._register(autorun(reader => {
			const showing = this.showCompleted.read(reader);
			toggleCompletedButton.label = showing
				? localize('inboxNotifications.hideCompleted', "Hide Completed")
				: localize('inboxNotifications.showCompleted', "Show Completed");
			toggleCompletedButton.element.setAttribute('aria-label', showing
				? localize('inboxNotifications.hideCompletedAria', "Hide completed notifications")
				: localize('inboxNotifications.showCompletedAria', "Show completed notifications"));
			toggleCompletedButton.element.classList.toggle('active', showing);
		}));

		this.deferredUpdatesBanner.appendChild(this.deferredUpdatesBannerLabel);
		const showNewNotificationsButton = this._register(new Button(this.deferredUpdatesBanner, {
			...defaultButtonStyles,
			secondary: true,
			small: true,
			ariaLabel: localize('inboxNotifications.showNewNotificationsAria', "Show New Notifications"),
		}));
		showNewNotificationsButton.label = localize('inboxNotifications.showNewNotifications', "Show New Notifications");
		this._register(showNewNotificationsButton.onDidClick(() => this.applyDeferredUpdates(true)));
		container.appendChild(this.deferredUpdatesBanner);

		container.appendChild(this.scrollableElement.getDomNode());
		const list = this.listElement;
		list.setAttribute('role', 'list');
		list.setAttribute('aria-label', localize('inboxNotifications.listAriaLabel', "Prioritized notifications"));
		this.listContainer.set(list, undefined);
		this._register(addDisposableListener(list, EventType.FOCUS_IN, event => this.onListFocusIn(event)));
		this._register(addDisposableListener(list, EventType.FOCUS_OUT, () => {
			setTimeout(() => this.applyDeferredUpdates(false), 0);
		}));
		this._register(addDisposableListener(list, EventType.KEY_DOWN, event => this.onListKeyDown(event)));

		this.ensureCollapsedSectionsLoaded();

		this._register(autorun(reader => {
			const items = this.inboxNotificationsService.notifications.read(reader);
			this.handleNotificationListUpdate(items);
		}));

		this._register(autorun(reader => {
			const showing = this.showCompleted.read(reader);
			if (showing) {
				this.inboxNotificationsService.dismissedNotifications.read(reader);
			}
			this.renderList(this.renderedItems);
		}));

		this._register(autorun(reader => {
			const request = this.inboxNotificationsService.revealRequest.read(reader);
			if (request && request.token !== this.lastRevealToken) {
				this.lastRevealToken = request.token;
				this.revealNotification(request.id);
			}
		}));
	}

	private handleNotificationListUpdate(items: readonly IInboxNotificationItem[]): void {
		const newNotificationCount = this.countNewNotifications(this.renderedItems, items);
		if (newNotificationCount > 0 && this.isInlineInputFocused()) {
			this.deferredItems = items;
			this.deferredNewNotificationsCount = newNotificationCount;
			this.updateDeferredUpdatesBanner();
			return;
		}

		this.deferredItems = undefined;
		this.deferredNewNotificationsCount = 0;
		this.updateDeferredUpdatesBanner();
		this.renderedItems = items;
		this.renderList(items);
	}

	private applyDeferredUpdates(force: boolean): boolean {
		if (!this.deferredItems) {
			return false;
		}
		if (!force && this.isInlineInputFocused()) {
			return false;
		}

		const deferredItems = this.deferredItems;
		this.deferredItems = undefined;
		this.deferredNewNotificationsCount = 0;
		this.updateDeferredUpdatesBanner();
		this.renderedItems = deferredItems;
		this.renderList(deferredItems);
		return true;
	}

	private updateDeferredUpdatesBanner(): void {
		if (!this.deferredItems || this.deferredNewNotificationsCount <= 0) {
			this.deferredUpdatesBanner.classList.add('hidden');
			this.deferredUpdatesBannerLabel.textContent = '';
			this.announcedDeferredNewNotificationsCount = 0;
			return;
		}

		this.deferredUpdatesBanner.classList.remove('hidden');
		const message = this.deferredNewNotificationsCount === 1
			? localize('inboxNotifications.deferred.single', "1 new notification arrived while you were answering inline input.")
			: localize('inboxNotifications.deferred.multiple', "{0} new notifications arrived while you were answering inline input.", this.deferredNewNotificationsCount);
		this.deferredUpdatesBannerLabel.textContent = message;
		if (this.announcedDeferredNewNotificationsCount !== this.deferredNewNotificationsCount) {
			this.announcedDeferredNewNotificationsCount = this.deferredNewNotificationsCount;
			status(message);
		}
	}

	private countNewNotifications(previousItems: readonly IInboxNotificationItem[], currentItems: readonly IInboxNotificationItem[]): number {
		if (previousItems.length === 0 || currentItems.length === 0) {
			return 0;
		}
		const previousIds = new Set(previousItems.map(item => item.id));
		let count = 0;
		for (const item of currentItems) {
			if (!previousIds.has(item.id)) {
				count++;
			}
		}
		return count;
	}

	private isInlineInputFocused(): boolean {
		const activeElement = getActiveElement();
		return isHTMLElement(activeElement)
			&& this.listElement.contains(activeElement)
			&& this.isInlineFormInputElement(activeElement);
	}

	private renderList(items: readonly IInboxNotificationItem[]): void {
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

		this.renderedCards = [];
		this.agentMergeDropdownButtons.clear();

		const completedItems = this.showCompleted.get() ? this.inboxNotificationsService.dismissedNotifications.get() : [];
		if (items.length === 0 && completedItems.length === 0) {
			this.pendingRevealId = undefined;
			list.appendChild($('.inbox-notifications-empty', undefined, localize('inboxNotifications.empty', "You're all caught up.")));
			this.scrollableElement.scanDomNode();
			return;
		}

		if (this.inboxNotificationsService.sortMode.get() === InboxNotificationsSortMode.Priority) {
			for (const tier of TIER_SECTIONS) {
				const tierItems = items.filter(item => item.priority === tier.priority);
				if (tierItems.length === 0) {
					continue;
				}
				this.renderSection(list, tier.key, getInboxNotificationPriorityLabel(tier.priority), tierItems, tier.priority);
			}
		} else {
			for (const item of items) {
				this.appendCard(list, item);
			}
		}

		if (completedItems.length) {
			this.renderSection(list, COMPLETED_SECTION_KEY, localize('inboxNotifications.section.completed', "Completed"), completedItems, undefined);
		}

		const revealTarget = this.pendingRevealId
			? this.renderedCards.find(card => card.dataset.notificationId === this.pendingRevealId)
			: undefined;
		this.pendingRevealId = undefined;

		this.applyCardTabStops(revealTarget?.dataset.notificationId ?? focusedNotificationId);
		if (revealTarget) {
			revealTarget.focus();
			revealTarget.scrollIntoView({ block: 'nearest' });
		} else if (hadFocusWithinList) {
			const target = this.getNotificationCards().find(card => card.tabIndex === 0);
			target?.focus();
		}

		this.scrollableElement.scanDomNode();
	}

	private renderSection(list: HTMLElement, key: string, label: string, items: readonly IInboxNotificationItem[], accentPriority: InboxNotificationPriority | undefined): void {
		const collapsed = this.collapsedSections.has(key);
		const header = list.appendChild($('button.inbox-notifications-section-header'));
		header.setAttribute('type', 'button');
		header.classList.toggle('collapsed', collapsed);
		header.classList.add(accentPriority !== undefined ? `priority-${accentPriority}` : 'neutral');
		header.setAttribute('aria-expanded', String(!collapsed));
		header.setAttribute('aria-label', localize('inboxNotifications.section.ariaLabel', "{0}, {1} notifications", label, items.length));
		const caret = header.appendChild($('span.inbox-notifications-section-caret'));
		caret.classList.add('codicon', collapsed ? 'codicon-chevron-right' : 'codicon-chevron-down');
		caret.setAttribute('aria-hidden', 'true');
		header.appendChild($('span.inbox-notifications-section-label', undefined, label));
		header.appendChild($('span.inbox-notifications-section-count', undefined, String(items.length)));
		this.renderedListDisposables.add(addDisposableListener(header, EventType.CLICK, () => this.toggleSection(key)));
		if (collapsed) {
			return;
		}
		for (const item of items) {
			this.appendCard(list, item);
		}
	}

	private appendCard(list: HTMLElement, item: IInboxNotificationItem): void {
		const card = this.renderItem(item);
		this.renderedCards.push(card);
		list.appendChild(card);
	}

	private toggleSection(key: string): void {
		if (this.collapsedSections.has(key)) {
			this.collapsedSections.delete(key);
		} else {
			this.collapsedSections.add(key);
		}
		this.persistCollapsedSections();
		this.renderList(this.renderedItems);
	}

	private ensureCollapsedSectionsLoaded(): void {
		if (this.collapsedSectionsLoaded) {
			return;
		}
		this.collapsedSectionsLoaded = true;

		const raw = this.storageService.get(COLLAPSED_SECTIONS_STORAGE_KEY, StorageScope.APPLICATION);
		if (raw === undefined) {
			return;
		}
		try {
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed)) {
				for (const key of parsed) {
					if (typeof key === 'string') {
						this.collapsedSections.add(key);
					}
				}
			}
		} catch (error) {
			onUnexpectedError(error);
		}
	}

	private persistCollapsedSections(): void {
		this.storageService.store(
			COLLAPSED_SECTIONS_STORAGE_KEY,
			JSON.stringify([...this.collapsedSections]),
			StorageScope.APPLICATION,
			StorageTarget.USER,
		);
	}

	private revealNotification(id: string): void {
		const completed = this.inboxNotificationsService.dismissedNotifications.get();
		const item = this.inboxNotificationsService.notifications.get().find(candidate => candidate.id === id)
			?? completed.find(candidate => candidate.id === id);
		if (!item) {
			return;
		}
		const isCompleted = completed.some(candidate => candidate.id === id);
		const sectionKey = isCompleted ? COMPLETED_SECTION_KEY : this.sectionKeyForItem(item);
		if (sectionKey && this.collapsedSections.has(sectionKey)) {
			this.collapsedSections.delete(sectionKey);
			this.persistCollapsedSections();
		}
		this.pendingRevealId = id;
		if (isCompleted && !this.showCompleted.get()) {
			this.showCompleted.set(true, undefined);
		} else {
			this.renderList(this.renderedItems);
		}
	}

	private sectionKeyForItem(item: IInboxNotificationItem): string | undefined {
		if (this.inboxNotificationsService.sortMode.get() !== InboxNotificationsSortMode.Priority) {
			return undefined;
		}
		return TIER_SECTIONS.find(tier => tier.priority === item.priority)?.key;
	}

	private renderItem(item: IInboxNotificationItem): HTMLElement {
		const card = $('.inbox-notifications-item');
		card.classList.add(`priority-${item.priority}`);
		card.setAttribute('role', 'listitem');
		card.dataset.notificationId = item.id;
		card.setAttribute('aria-label', this.getCardAriaLabel(item));

		const heading = card.appendChild($('.inbox-notifications-item-header'));
		heading.appendChild($('.inbox-notifications-item-title', undefined, item.title));
		const kindLabel = heading.appendChild($('.inbox-notifications-item-kind-label', undefined, this.kindLabel(item.kind)));
		kindLabel.classList.add(`priority-${item.priority}`);
		if (item.actions.length) {
			const headingActions = heading.appendChild($('.inbox-notifications-item-header-actions'));
			for (const action of item.actions) {
				const button = this.renderActionButton(headingActions, item, action);
				if (action.kind === InboxNotificationActionKind.MarkDone) {
					button.element.classList.add('inbox-notifications-item-action-done');
				}
			}
		}
		let badges: HTMLElement | undefined;
		if (item.repositoryLabel) {
			badges = card.appendChild($('.inbox-notifications-item-badges'));
			badges.appendChild($('.inbox-notifications-item-badge.repository', undefined, item.repositoryLabel));
		}
		if (item.pullRequestStates?.length) {
			const pullRequestStates = card.appendChild($('.inbox-notifications-item-pr-states'));
			for (const pullRequestState of item.pullRequestStates) {
				const pullRequestStateElement = pullRequestStates.appendChild($('.inbox-notifications-item-pr-state'));
				const pullRequestUri = pullRequestState.pullRequestUri;
				if (pullRequestUri) {
					const pullRequestButton = this.renderedListDisposables.add(new Button(pullRequestStateElement, {
						...defaultButtonStyles,
						secondary: true,
						small: true,
						supportIcons: true,
						ariaLabel: localize('inboxNotifications.pullRequestStateLink.ariaLabel', "Open pull request {0}", pullRequestState.label),
					}));
					pullRequestButton.element.classList.add('inbox-notifications-item-pr-state-link');
					pullRequestButton.label = `$(${pullRequestState.icon.id}) ${pullRequestState.label}`;
					this.renderedListDisposables.add(pullRequestButton.onDidClick(() => {
						void this.openerService.open(pullRequestUri).catch(onUnexpectedError);
					}));
				} else {
					const icon = pullRequestStateElement.appendChild(renderIcon(pullRequestState.icon));
					icon.setAttribute('aria-hidden', 'true');
					pullRequestStateElement.appendChild($('span.inbox-notifications-item-pr-state-label', undefined, pullRequestState.label));
				}
			}
		}

		card.appendChild($('.inbox-notifications-item-description', undefined, item.description));
		this.renderNeedsInputPart(card, item);
		card.appendChild($('.inbox-notifications-item-time', undefined, fromNowByDay(item.timestamp, true, true)));

		return card;
	}

	private renderNeedsInputPart(card: HTMLElement, item: IInboxNotificationItem): void {
		const part = item.needsInputPart;
		if (!part) {
			return;
		}

		if (part.kind === 'confirmation') {
			const buttonLabels = part.buttons?.length
				? part.buttons
				: [localize('inboxNotifications.confirmation.accept', "Accept"), localize('inboxNotifications.confirmation.dismiss', "Dismiss")];
			const confirmationWidget = this.renderedListDisposables.add(this.instantiationService.createInstance(
				SimpleChatConfirmationWidget<{ buttonLabel: string; buttonIndex: number }>,
				this.createChatContentPartRenderContext(),
				{
					title: part.title,
					message: part.message,
					buttons: buttonLabels.map((buttonLabel, buttonIndex) => ({
						label: buttonLabel,
						data: { buttonLabel, buttonIndex },
						isSecondary: buttonIndex !== 0,
					})),
				},
			));
			const host = card.appendChild($('.inbox-notifications-chat-part-host'));
			host.appendChild(confirmationWidget.domNode);
			this.renderedListDisposables.add(confirmationWidget.onDidClick(({ button }) => {
				void this.submitConfirmationPart(item, part, button.data.buttonLabel, button.data.buttonIndex);
			}));
			return;
		}

		if (part.kind === 'toolConfirmation') {
			const toolConfirmationWidget = this.renderedListDisposables.add(this.instantiationService.createInstance(
				SimpleChatConfirmationWidget<{ buttonIndex: number }>,
				this.createChatContentPartRenderContext(),
				{
					title: part.title,
					message: part.message,
					buttons: part.buttons.map((button, buttonIndex) => ({
						label: button.label,
						data: { buttonIndex },
						isSecondary: button.kind === 'deny',
					})),
				},
			));
			const host = card.appendChild($('.inbox-notifications-chat-part-host'));
			host.appendChild(toolConfirmationWidget.domNode);
			this.renderedListDisposables.add(toolConfirmationWidget.onDidClick(({ button }) => {
				void this.submitToolConfirmationPart(item, part, button.data.buttonIndex);
			}));
			return;
		}

		const carousel: IChatQuestionCarousel = {
			kind: 'questionCarousel',
			allowSkip: part.allowSkip,
			resolveId: part.resolveId,
			message: part.message,
			questions: [...part.questions],
		};
		const carouselWidget = this.renderedListDisposables.add(this.instantiationService.createInstance(
			ChatQuestionCarouselPart,
			carousel,
			this.createChatContentPartRenderContext(),
			{
				shouldAutoFocus: false,
				onSubmit: answers => {
					void this.submitQuestionCarouselPart(item, part, answers);
				},
			},
		));
		const host = card.appendChild($('.inbox-notifications-chat-part-host.interactive-session'));
		const inputPartHost = host.appendChild($('.interactive-input-part'));
		const widgetContainer = inputPartHost.appendChild($('.chat-question-carousel-widget-container'));
		widgetContainer.appendChild(carouselWidget.domNode);
		this.renderedListDisposables.add(carouselWidget.onDidChangeHeight(() => this.scrollableElement.scanDomNode()));
	}

	private async submitConfirmationPart(
		item: IInboxNotificationItem,
		part: IInboxNotificationConfirmationPart,
		buttonLabel: string,
		buttonIndex: number,
	): Promise<void> {
		const requestContext = this.getNeedsInputRequestContext(part.chatResource, part.requestId);
		if (!requestContext) {
			this.notificationService.error(localize('inboxNotifications.confirmation.chatMissing', "Unable to find the session for this confirmation. Open the session and try again."));
			return;
		}
		const confirmationPart = this.getPendingConfirmationPart(requestContext.response, part.data);
		if (!confirmationPart) {
			this.notificationService.error(localize('inboxNotifications.confirmation.missing', "This confirmation is no longer available. Open the session for the latest state."));
			return;
		}

		const prompt = `${buttonLabel}: "${part.title}"`;
		const options: IChatSendRequestOptions = buttonIndex === 0
			? { acceptedConfirmationData: [part.data] }
			: { rejectedConfirmationData: [part.data] };
		options.agentId = requestContext.response.agent?.id;
		options.slashCommand = requestContext.response.slashCommand?.name;
		options.confirmation = buttonLabel;
		options.modeInfo = requestContext.request.modeInfo;
		options.locationData = requestContext.request.locationData;
		options.userSelectedModelId = requestContext.request.modelId;
		options.userSelectedModelConfiguration = requestContext.request.modelConfiguration;
		const sendResult = await this.chatService.sendRequest(part.chatResource, prompt, options);
		if (ChatSendResult.isSent(sendResult)) {
			confirmationPart.isUsed = true;
			await this.completeNeedsInputNotification(item);
			return;
		}

		this.notificationService.error(localize('inboxNotifications.confirmation.sendFailed', "Unable to submit this confirmation. Open the session and try again."));
	}

	private async submitToolConfirmationPart(
		item: IInboxNotificationItem,
		part: IInboxNotificationToolConfirmationPart,
		buttonIndex: number,
	): Promise<void> {
		const chatModel = this.chatService.getSession(part.chatResource);
		if (!chatModel) {
			this.notificationService.error(localize('inboxNotifications.toolConfirmation.chatMissing', "Unable to find the session for this confirmation. Open the session and try again."));
			return;
		}

		const request = chatModel.getRequests().find(candidate => candidate.response?.requestId === part.requestId);
		const response = request?.response;
		const toolInvocation = response?.response.value.find(candidate => candidate.kind === 'toolInvocation' && candidate.toolCallId === part.toolCallId);
		if (!toolInvocation || toolInvocation.kind !== 'toolInvocation') {
			this.notificationService.error(localize('inboxNotifications.toolConfirmation.invocationMissing', "This confirmation is no longer available. Open the session for the latest state."));
			return;
		}

		const button = part.buttons[buttonIndex] ?? part.buttons[0];
		if (!button) {
			this.notificationService.error(localize('inboxNotifications.toolConfirmation.buttonMissing', "Unable to resolve the selected confirmation option."));
			return;
		}

		const reason = button.useUserActionReason
			? {
				type: ToolConfirmKind.UserAction as const,
				selectedButton: button.id ?? button.label,
			}
			: { type: ToolConfirmKind.Skipped as const };
		const didConfirm = IChatToolInvocation.confirmWith(toolInvocation, reason);
		if (!didConfirm) {
			this.notificationService.error(localize('inboxNotifications.toolConfirmation.staleState', "This confirmation changed before your action was applied. Open the session and try again."));
			return;
		}
		await this.completeNeedsInputNotification(item);
	}

	private async submitQuestionCarouselPart(
		item: IInboxNotificationItem,
		part: IInboxNotificationQuestionCarouselPart,
		answers: Map<string, IChatQuestionAnswerValue> | undefined,
	): Promise<void> {
		if (!part.resolveId) {
			this.notificationService.error(localize('inboxNotifications.questionCarousel.resolveIdMissing', "Unable to submit this question yet. Open the session to continue."));
			return;
		}

		const requestContext = this.getNeedsInputRequestContext(part.chatResource, part.requestId);
		if (!requestContext) {
			this.notificationService.error(localize('inboxNotifications.questionCarousel.chatMissing', "Unable to find the session for these questions. Open the session and try again."));
			return;
		}
		const carouselPart = requestContext.response.response.value.find(candidate => candidate.kind === 'questionCarousel' && candidate.resolveId === part.resolveId && !candidate.isUsed);
		if (!carouselPart || carouselPart.kind !== 'questionCarousel') {
			this.notificationService.error(localize('inboxNotifications.questionCarousel.missing', "These questions are no longer available. Open the session for the latest state."));
			return;
		}

		const answersRecord = answers ? Object.fromEntries(answers.entries()) : undefined;
		if (isDismissibleQuestionCarousel(carouselPart)) {
			carouselPart.dismiss(answersRecord);
		} else {
			carouselPart.data = answersRecord ?? {};
			carouselPart.isUsed = true;
		}
		this.chatService.notifyQuestionCarouselAnswer(part.requestId, part.resolveId, answersRecord);
		await this.completeNeedsInputNotification(item);
	}

	private getNeedsInputRequestContext(chatResource: URI, requestId: string): { request: IChatRequestModel; response: IChatResponseModel } | undefined {
		const chatModel = this.chatService.getSession(chatResource);
		if (!chatModel) {
			return undefined;
		}

		const request = chatModel.getRequests().find(candidate => candidate.response?.requestId === requestId);
		const response = request?.response;
		if (!request || !response) {
			return undefined;
		}

		return { request, response };
	}

	private getPendingConfirmationPart(response: IChatResponseModel, confirmationData: unknown): IChatConfirmation | undefined {
		let fallbackConfirmation: IChatConfirmation | undefined;
		for (const part of response.response.value) {
			if (part.kind !== 'confirmation' || part.isUsed) {
				continue;
			}

			if (part.data === confirmationData) {
				return part;
			}
			fallbackConfirmation ??= part;
		}

		return fallbackConfirmation;
	}

	private createChatContentPartRenderContext(): IChatContentPartRenderContext {
		const context: Partial<IChatContentPartRenderContext> = {
			content: [],
			contentIndex: 0,
		};
		return context as IChatContentPartRenderContext;
	}

	private async completeNeedsInputNotification(item: IInboxNotificationItem): Promise<void> {
		if (item.sessionResource) {
			const session = this.sessionsManagementService.getSession(item.sessionResource);
			if (session) {
				await this.sessionsManagementService.markRead(session);
			}
		}

		this.inboxNotificationsService.dismissNotification(item.id);
	}

	private onListFocusIn(event: FocusEvent): void {
		const target = event.target;
		if (!isHTMLElement(target)) {
			return;
		}
		if (this.isInlineFormInputElement(target)) {
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
		if (this.isInlineFormInputElement(target)) {
			return;
		}

		const cards = this.getNotificationCards();
		const currentIndex = cards.findIndex(card => card === target || card.contains(target));
		if (currentIndex === -1) {
			return;
		}
		const currentCard = cards[currentIndex];
		if (target !== currentCard) {
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

	private isInlineFormInputElement(element: HTMLElement): boolean {
		return isEditableElement(element) || element.tagName.toLowerCase() === 'select' || element.isContentEditable;
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

	private getCardAriaLabel(item: IInboxNotificationItem): string {
		const segments = [
			localize('inboxNotifications.itemAriaLabel.priority', "Priority {0}", this.priorityLabel(item.priority)),
			this.kindLabel(item.kind),
		];
		if (item.repositoryLabel) {
			segments.push(localize('inboxNotifications.itemAriaLabel.repository', "Repository {0}", item.repositoryLabel));
		}
		const pullRequestStatesAria = this.getPullRequestStatesAriaLabel(item);
		if (pullRequestStatesAria) {
			segments.push(pullRequestStatesAria);
		}
		if (item.needsInputPart) {
			segments.push(localize('inboxNotifications.itemAriaLabel.inlineInput', "Contains inline input controls."));
		}
		segments.push(item.title, item.description);
		return segments.join('. ');
	}

	private getPullRequestStatesAriaLabel(item: IInboxNotificationItem): string | undefined {
		if (!item.pullRequestStates?.length) {
			return undefined;
		}
		if (item.pullRequestStates.length === 1) {
			const state = item.pullRequestStates[0];
			return localize('inboxNotifications.itemAriaLabel.pullRequestState.single', "Pull request {0}: {1}", state.label, state.statusLabel);
		}
		return localize(
			'inboxNotifications.itemAriaLabel.pullRequestState.multiple',
			"Pull requests: {0}",
			item.pullRequestStates.map(state => `${state.label}: ${state.statusLabel}`).join('; '),
		);
	}

	private async runAction(item: IInboxNotificationItem, action: IInboxNotificationAction, sourceElement?: HTMLElement, enableAlways = false): Promise<void> {
		try {
			switch (action.kind) {
				case InboxNotificationActionKind.OpenSession: {
					if (!item.sessionResource) {
						return;
					}
					await this.sessionsService.openSession(item.sessionResource, { source: 'notification' });
					return;
				}
				case InboxNotificationActionKind.AgentMergeFixCI:
				case InboxNotificationActionKind.AgentMergeAddressReviews:
				case InboxNotificationActionKind.AgentMergeMergePullRequest:
					await this.runAgentMergeInboxAction(item, action.kind, enableAlways, sourceElement);
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

	private renderActionButton(container: HTMLElement, item: IInboxNotificationItem, action: IInboxNotificationAction): IButton {
		const baseOptions = {
			...defaultButtonStyles,
			secondary: !action.primary,
			small: true,
			supportIcons: action.kind === InboxNotificationActionKind.MarkDone,
			ariaLabel: localize('inboxNotifications.actionAriaLabel', "{0} for {1}", action.ariaLabel ?? action.label, item.title),
		};
		const canShowAlwaysDropdown = this.canShowAgentMergeAlwaysDropdown(item, action.kind);
		const button = canShowAlwaysDropdown
			? this.renderedListDisposables.add(new ButtonWithDropdown(container, {
				...baseOptions,
				contextMenuProvider: this.contextMenuService,
				addPrimaryActionToDropdown: false,
				actions: [toAction({
					id: `${action.id}.always`,
					label: localize('inboxNotifications.action.always', "Always {0}", action.label),
					run: () => this.runAction(item, action, undefined, true),
				})],
			}))
			: this.renderedListDisposables.add(new Button(container, baseOptions));
		button.label = action.label;
		if (button instanceof ButtonWithDropdown) {
			button.dropdownButton.setAriaLabel(localize('inboxNotifications.action.moreActions', "More Actions for {0}", action.label));
			if (isInboxAgentMergeActionKind(action.kind)) {
				this.agentMergeDropdownButtons.set(this.getAgentMergeDropdownButtonKey(item.id, action.kind), button.dropdownButton.element);
			}
		}
		this.renderedListDisposables.add(button.onDidClick(() => void this.runAction(item, action, button.element)));
		return button;
	}

	private canShowAgentMergeAlwaysDropdown(item: IInboxNotificationItem, actionKind: InboxNotificationActionKind): actionKind is InboxAgentMergeActionKind {
		if (!isInboxAgentMergeActionKind(actionKind)) {
			return false;
		}

		return !this.agentMergeAlwaysOptInService.isAlwaysEnabled(actionKind);
	}

	private async runAgentMergeInboxAction(item: IInboxNotificationItem, actionKind: InboxAgentMergeActionKind, enableAlways: boolean, sourceElement: HTMLElement | undefined): Promise<void> {
		if (enableAlways) {
			await this.agentMergeAlwaysOptInService.enableAlways(actionKind);
			return;
		}

		const promptDecision = this.agentMergeAlwaysOptInService.recordUsage(actionKind);
		if (promptDecision.shouldPrompt && !this.isShowingAgentMergeAlwaysPrompt) {
			const spotlightTarget = this.resolveAgentMergeAlwaysSpotlightTarget(item, actionKind, sourceElement);
			if (spotlightTarget) {
				this.isShowingAgentMergeAlwaysPrompt = true;
				try {
					await this.showAgentMergeAlwaysSpotlight(item, actionKind, spotlightTarget, promptDecision.usageCount);
				} finally {
					this.isShowingAgentMergeAlwaysPrompt = false;
				}
			}
		}

		const didApplyAction = await this.runAgentMergeAction(item, this.getAgentMergeActionOverrides(actionKind));
		if (!didApplyAction) {
			return;
		}
	}

	private resolveAgentMergeAlwaysSpotlightTarget(item: IInboxNotificationItem, actionKind: InboxAgentMergeActionKind, sourceElement: HTMLElement | undefined): HTMLElement | undefined {
		if (sourceElement?.classList.contains('monaco-dropdown-button')) {
			return sourceElement;
		}

		return this.agentMergeDropdownButtons.get(this.getAgentMergeDropdownButtonKey(item.id, actionKind));
	}

	private getAgentMergeDropdownButtonKey(itemId: string, actionKind: InboxAgentMergeActionKind): string {
		return `${itemId}:${actionKind}`;
	}

	private async showAgentMergeAlwaysSpotlight(
		item: IInboxNotificationItem,
		actionKind: InboxAgentMergeActionKind,
		dropdownButton: HTMLElement,
		usageCount: number,
	): Promise<void> {
		const spotlightTargetId = `sessions.inboxNotifications.agentMergeAlways.${actionKind}.${item.id}`;
		const actionLabel = this.getAgentMergeActionLabel(actionKind);
		const alwaysActionLabel = localize('inboxNotifications.action.always', "Always {0}", actionLabel);
		const targetRegistration = markOnboardingTarget(dropdownButton, spotlightTargetId, {
			open: async () => {
				dropdownButton.click();
			},
		});

		const scenarioId = `sessions.inboxNotifications.agentMergeAlways.${actionKind}.${Date.now()}`;
		const scenario: IOnboardingScenario<ISpotlightPayload> = {
			id: scenarioId,
			trigger: { kind: 'command', commandId: scenarioId },
			presentation: {
				kind: SPOTLIGHT_PRESENTATION_KIND,
				payload: {
					steps: [{
						id: 'agentMergeAlwaysSpotlight',
						targetId: spotlightTargetId,
						title: localize('inboxNotifications.agentMergeAlways.spotlight.title', "Always Let Agent Merge {0}", actionLabel),
						description: localize(
							'inboxNotifications.agentMergeAlways.spotlight.description',
							"You've used \"{0}\" {1} times from Inbox. Open More Actions and choose \"{2}\". You can change this later in Agent Merge settings.",
							actionLabel,
							usageCount,
							alwaysActionLabel,
						),
						nextButtonLabel: localize('inboxNotifications.agentMergeAlways.spotlight.notNow', "Not Now"),
						openTarget: true,
						allowTargetInteraction: true,
						hideNext: false,
						placement: 'below',
						missingTarget: { kind: 'abort' },
					}],
				},
			},
		};
		const registration = onboardingScenarioRegistry.register(scenario);
		try {
			await this.onboardingScenarioService.runScenario(scenario.id);
		} finally {
			registration.dispose();
			targetRegistration.dispose();
		}
	}

	private getAgentMergeActionLabel(actionKind: InboxAgentMergeActionKind): string {
		switch (actionKind) {
			case InboxNotificationActionKind.AgentMergeFixCI:
				return localize('inboxNotifications.agentMergeAlways.fixCI', "Fix CI Failures");
			case InboxNotificationActionKind.AgentMergeAddressReviews:
				return localize('inboxNotifications.agentMergeAlways.addressReviews', "Address Reviews");
			case InboxNotificationActionKind.AgentMergeMergePullRequest:
				return localize('inboxNotifications.agentMergeAlways.mergePullRequest', "Merge Pull Request");
		}
	}

	private getAgentMergeActionOverrides(actionKind: InboxAgentMergeActionKind): AgentMergeSessionOverrides {
		switch (actionKind) {
			case InboxNotificationActionKind.AgentMergeFixCI:
				return { fixCI: true };
			case InboxNotificationActionKind.AgentMergeAddressReviews:
				return { addressReviews: true };
			case InboxNotificationActionKind.AgentMergeMergePullRequest:
				return { mergePullRequest: 'always' };
		}
	}

	private async runAgentMergeAction(item: IInboxNotificationItem, overrides: AgentMergeSessionOverrides): Promise<boolean> {
		if (!item.sessionResource) {
			return false;
		}

		const session = this.sessionsManagementService.getSession(item.sessionResource);
		if (!session) {
			return false;
		}

		const provider = this.sessionsProvidersService.getProvider(session.providerId);
		if (!provider || !isAgentHostProvider(provider)) {
			await this.sessionsService.openSession(item.sessionResource);
			return false;
		}

		await provider.setAgentMergeEnabled(session.sessionId, true);
		const currentOverrides = provider.getAgentMergeSessionState(session.sessionId)?.overrides;
		await provider.setAgentMergeOverrides(session.sessionId, {
			...currentOverrides,
			...overrides,
		});
		return true;
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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/inboxNotificationsView.css';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { $, addDisposableListener, clearNode, EventType, getActiveElement, getWindow, isEditableElement, isHTMLElement, trackFocus } from '../../../../base/browser/dom.js';
import { triggerConfettiAnimation } from '../../../../base/browser/ui/animations/animations.js';
import { Button, ButtonWithDropdown, IButton } from '../../../../base/browser/ui/button/button.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Orientation, Sash, SashState, ISashEvent } from '../../../../base/browser/ui/sash/sash.js';
import { renderAsPlaintext } from '../../../../base/browser/markdownRenderer.js';
import { toAction } from '../../../../base/common/actions.js';
import { clamp } from '../../../../base/common/numbers.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, IObservable, observableValue } from '../../../../base/common/observable.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
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
import { AUTO_DELETE_MARKED_AS_DONE_MERGED_SESSIONS_AFTER_DAYS_SETTING, AUTO_MARK_AS_DONE_MERGED_SESSIONS_AFTER_DAYS_SETTING } from '../../github/common/sessionLifecycleSettings.js';
import {
	IInboxDetailSummary,
	IInboxEvidenceArtifact,
	IInboxNotificationAction,
	IInboxNotificationItem,
	IInboxNotificationConfirmationPart,
	IInboxNotificationQuestionCarouselPart,
	IInboxNotificationToolConfirmationPart,
	IInboxNotificationsService,
	InboxNotificationActionKind,
	InboxNotificationKind,
	InboxNotificationPriority,
	InboxNotificationsSortMode,
} from '../common/inboxNotificationsService.js';
import { InboxAgentMergeActionKind, InboxAgentMergeAlwaysOptInService, isInboxAgentMergeActionKind } from './inboxAgentMergeAlwaysOptInService.js';
import { getInboxNotificationKindLabel, getInboxNotificationPriorityLabel } from './inboxNotificationsLabels.js';
import { pickFunWorkingMessage } from '../../../../workbench/contrib/chat/browser/widget/chatContentParts/chatThinkingContentPart.js';

function isDismissibleQuestionCarousel(carousel: IChatQuestionCarousel): carousel is IChatQuestionCarousel & { dismiss(answers: Record<string, IChatQuestionAnswerValue> | undefined): void } {
	return typeof (carousel as { dismiss?: unknown }).dismiss === 'function';
}

type InboxMergedSessionCleanupActionKind = InboxNotificationActionKind.ArchiveSession | InboxNotificationActionKind.DeleteSession;

function isInboxMergedSessionCleanupActionKind(actionKind: InboxNotificationActionKind): actionKind is InboxMergedSessionCleanupActionKind {
	return actionKind === InboxNotificationActionKind.ArchiveSession || actionKind === InboxNotificationActionKind.DeleteSession;
}

const COLLAPSED_SECTIONS_STORAGE_KEY = 'sessions.inboxNotifications.collapsedSections';
const COMPLETED_SECTION_KEY = 'completed';
const LIST_PANE_WIDTH_STORAGE_KEY = 'sessions.inboxNotifications.listPaneWidth';
const DEFAULT_LIST_PANE_WIDTH = 400;
const MIN_LIST_PANE_WIDTH = 280;
const MIN_DETAIL_PANE_WIDTH = 320;
/** Below this the two panes can't both honor their minimums, so they stack vertically instead. */
const NARROW_STACK_THRESHOLD = MIN_LIST_PANE_WIDTH + MIN_DETAIL_PANE_WIDTH;

interface IInboxTierSpec {
	readonly key: string;
	readonly priority: InboxNotificationPriority;
}

/** Importance tiers in display order. Empty tiers are hidden at render time. */
const TIER_SECTIONS: readonly IInboxTierSpec[] = [
	{ key: 'now', priority: InboxNotificationPriority.Now },
	{ key: 'next', priority: InboxNotificationPriority.Next },
	{ key: 'later', priority: InboxNotificationPriority.Later },
];

const ALWAYS_MERGED_SESSION_CLEANUP_AFTER_DAYS = 15;

type InboxInteractionTelemetryEvent = {
	interaction: string;
	trigger: string;
	result: string;
	notificationKind: string;
	notificationActionKind: string;
	hasSession: string;
	commandId: string;
	viewInstanceId: string;
	sequence: number;
	durationMs: number | undefined;
};

type InboxInteractionTelemetryClassification = {
	owner: 'meganrogge';
	comment: 'Tracks user interactions taken directly from the Sessions Inbox notifications view.';
	interaction: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Bounded inbox interaction identifier.' };
	trigger: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Bounded inbox surface where the interaction originated.' };
	result: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Bounded interaction outcome such as attempt, success, failure, or skipped.' };
	notificationKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Bounded notification kind when the interaction came from a card, otherwise none.' };
	notificationActionKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Bounded notification action kind when the interaction came from an action button, otherwise none.' };
	hasSession: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the notification had an associated session resource.' };
	commandId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Command identifier for command-backed inbox actions, or none for other interactions.' };
	viewInstanceId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Per-inbox-view UUID used to correlate interaction trajectories inside a single view instance.' };
	sequence: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Monotonic interaction sequence number within the inbox view instance.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Duration in milliseconds for interaction outcomes that complete asynchronously, including dwell time when applicable.' };
};

type InboxInteractionResult = 'attempt' | 'success' | 'failure' | 'skipped';

interface ISelectionTelemetryState {
	readonly notificationKind: string;
	readonly hasSession: string;
	readonly selectedAt: number;
}

interface IInboxInteractionTelemetryOptions {
	readonly result?: InboxInteractionResult;
	readonly durationMs?: number;
	readonly commandId?: string;
	readonly notificationKind?: string;
	readonly hasSession?: string;
}

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

	private readonly contentElement = $('div.inbox-notifications-content.no-detail');
	private readonly listPaneElement = $('div.inbox-notifications-list-pane');
	private readonly detailPaneElement = $('div.inbox-notifications-detail-pane');
	private readonly detailContentElement = $('div.inbox-notifications-detail-content');
	private readonly detailScrollableElement = this._register(new DomScrollableElement(this.detailContentElement, {
		horizontal: ScrollbarVisibility.Hidden,
		vertical: ScrollbarVisibility.Auto,
		consumeMouseWheelIfScrollbarIsNeeded: true,
		className: 'inbox-notifications-detail-scrollable',
	}));
	private readonly detailDisposables = this._register(new DisposableStore());
	private readonly selectedItemId = observableValue<string | undefined>('inboxNotificationsSelected', undefined);
	private readonly inboxViewInstanceId = generateUuid();
	private interactionSequence = 0;
	private selectionTelemetryState: ISelectionTelemetryState | undefined;
	private detailSash: Sash | undefined;
	private listPaneWidth = DEFAULT_LIST_PANE_WIDTH;
	private layoutWidth = 0;
	private hasSplit = false;
	private lastDetailSignature: string | undefined;

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
		@ITelemetryService private readonly telemetryService: ITelemetryService,
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
		this.endSelectionTelemetry('viewDispose');
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
				if (!item.actions.some(action => action.kind === actionKind) || !this.canShowAlwaysDropdown(item, actionKind)) {
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

		this.contentElement.appendChild(this.listPaneElement);
		this.contentElement.appendChild(this.detailPaneElement);
		this.detailPaneElement.appendChild(this.detailScrollableElement.getDomNode());
		container.appendChild(this.contentElement);
		this.loadListPaneWidth();
		this.createDetailSash();

		const toolbar = this.listPaneElement.appendChild($('.inbox-notifications-toolbar'));
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
			this.logInboxInteraction('sort.priority', 'toolbar');
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
			this.logInboxInteraction('sort.recent', 'toolbar');
		}));

		this._register(autorun(reader => {
			const sortMode = this.inboxNotificationsService.sortMode.read(reader);
			const prioritySelected = sortMode === InboxNotificationsSortMode.Priority;
			sortByPriorityButton.element.classList.toggle('active', prioritySelected);
			sortByPriorityButton.element.setAttribute('aria-pressed', String(prioritySelected));
			sortByRecencyButton.element.classList.toggle('active', !prioritySelected);
			sortByRecencyButton.element.setAttribute('aria-pressed', String(!prioritySelected));
		}));

		const toggleCompletedButton = this._register(new Button(toolbar, {
			...defaultButtonStyles,
			secondary: true,
		}));
		this._register(toggleCompletedButton.onDidClick(() => {
			const nextShowing = !this.showCompleted.get();
			this.showCompleted.set(nextShowing, undefined);
			this.logInboxInteraction(nextShowing ? 'showCompleted' : 'hideCompleted', 'toolbar');
		}));
		this._register(autorun(reader => {
			const showing = this.showCompleted.read(reader);
			toggleCompletedButton.label = showing
				? localize('inboxNotifications.hideCompleted', "Hide Completed")
				: localize('inboxNotifications.showCompleted', "Show Completed");
			toggleCompletedButton.element.setAttribute('aria-label', showing
				? localize('inboxNotifications.hideCompletedAria', "Hide completed notifications")
				: localize('inboxNotifications.showCompletedAria', "Show completed notifications"));
			toggleCompletedButton.element.setAttribute('aria-pressed', String(showing));
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
		this._register(showNewNotificationsButton.onDidClick(() => {
			if (this.applyDeferredUpdates(true)) {
				this.logInboxInteraction('deferredUpdates.showNewNotifications', 'banner');
			}
		}));
		this.listPaneElement.appendChild(this.deferredUpdatesBanner);

		this.listPaneElement.appendChild(this.scrollableElement.getDomNode());
		const list = this.listElement;
		list.setAttribute('role', 'group');
		list.setAttribute('aria-label', localize('inboxNotifications.listAriaLabel', "Prioritized notifications"));
		this.listContainer.set(list, undefined);
		this._register(addDisposableListener(list, EventType.FOCUS_IN, event => this.onListFocusIn(event)));
		this._register(addDisposableListener(list, EventType.FOCUS_OUT, () => {
			setTimeout(() => {
				if (this.applyDeferredUpdates(false)) {
					this.logInboxInteraction('deferredUpdates.autoApply', 'inlineInput');
				}
			}, 0);
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

		this._register(autorun(reader => {
			this.selectedItemId.read(reader);
			this.inboxNotificationsService.notifications.read(reader);
			this.inboxNotificationsService.dismissedNotifications.read(reader);
			this.renderDetailIfChanged();
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
		this.updateSplit(items.length > 0 || completedItems.length > 0);
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
			const cards = list.appendChild($('.inbox-notifications-section-cards'));
			cards.setAttribute('role', 'list');
			cards.setAttribute('aria-label', localize('inboxNotifications.listAriaLabel', "Prioritized notifications"));
			for (const item of items) {
				this.appendCard(cards, item);
			}
		}

		if (completedItems.length) {
			this.renderSection(list, COMPLETED_SECTION_KEY, localize('inboxNotifications.section.completed', "Completed"), completedItems, undefined);
		}

		const selectedId = this.selectedItemId.get();
		if (selectedId && !this.renderedCards.some(card => card.dataset.notificationId === selectedId)) {
			this.clearSelectedItem('itemRemoved');
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
		const group = list.appendChild($('.inbox-notifications-section'));
		group.setAttribute('role', 'group');
		const header = group.appendChild($('button.inbox-notifications-section-header'));
		header.id = `inbox-notifications-section-${key}`;
		group.setAttribute('aria-labelledby', header.id);
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
		const cards = group.appendChild($('.inbox-notifications-section-cards'));
		cards.setAttribute('role', 'list');
		for (const item of items) {
			this.appendCard(cards, item);
		}
	}

	private appendCard(list: HTMLElement, item: IInboxNotificationItem): void {
		const card = this.renderItem(item);
		this.renderedCards.push(card);
		list.appendChild(card);
	}

	private toggleSection(key: string): void {
		const willExpand = this.collapsedSections.has(key);
		if (willExpand) {
			this.collapsedSections.delete(key);
		} else {
			this.collapsedSections.add(key);
		}
		this.persistCollapsedSections();
		this.logInboxInteraction(willExpand ? 'section.expand' : 'section.collapse', 'sectionHeader');
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
		card.setAttribute('role', 'listitem');
		card.dataset.notificationId = item.id;
		card.setAttribute('aria-label', this.getCardAriaLabel(item));
		if (this.selectedItemId.get() === item.id) {
			card.classList.add('selected');
		}
		this.renderedListDisposables.add(addDisposableListener(card, EventType.CLICK, () => this.selectItem(item.id, 'cardClick')));
		this.renderedListDisposables.add(addDisposableListener(card, EventType.KEY_DOWN, (event: KeyboardEvent) => {
			if ((event.key === 'Enter' || event.key === ' ') && !isEditableElement(event.target as HTMLElement) && event.target === card) {
				event.preventDefault();
				this.selectItem(item.id, 'cardKeyboard');
			}
		}));

		const heading = card.appendChild($('.inbox-notifications-item-header'));
		heading.appendChild($('.inbox-notifications-item-title', undefined, item.title));
		if (item.actions.length) {
			const headingActions = heading.appendChild($('.inbox-notifications-item-header-actions'));
			for (const action of item.actions) {
				const button = this.renderActionButton(headingActions, item, action);
				if (action.kind === InboxNotificationActionKind.MarkDone) {
					button.element.classList.add('inbox-notifications-item-action-done');
				}
			}
		}

		const badges = card.appendChild($('.inbox-notifications-item-badges'));
		const kindLabel = badges.appendChild($('.inbox-notifications-item-kind-label', undefined, this.kindLabel(item.kind)));
		kindLabel.classList.add(`priority-${item.priority}`);
		if (item.repositoryLabel) {
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
						this.logInboxInteraction('openPullRequestState', 'pullRequestState', item);
						void this.openerService.open(pullRequestUri).catch(onUnexpectedError);
					}));
				} else {
					const icon = pullRequestStateElement.appendChild(renderIcon(pullRequestState.icon));
					icon.setAttribute('aria-hidden', 'true');
					pullRequestStateElement.appendChild($('span.inbox-notifications-item-pr-state-label', undefined, pullRequestState.label));
				}
			}
		}

		const descriptionEl = card.appendChild($('.inbox-notifications-item-description', undefined, item.description));
		if (item.previewSignature) {
			this.inboxNotificationsService.requestPreview(item);
			const signature = item.previewSignature;
			this.renderedListDisposables.add(autorun(reader => {
				const preview = this.inboxNotificationsService.previews.read(reader).get(signature);
				descriptionEl.textContent = preview ?? item.description;
				descriptionEl.classList.toggle('inbox-notifications-item-description-pending', !preview);
			}));
		}
		this.renderNeedsInputPart(card, item, this.renderedListDisposables);
		card.appendChild($('.inbox-notifications-item-time', undefined, fromNowByDay(item.timestamp, true, true)));

		return card;
	}

	private renderNeedsInputPart(container: HTMLElement, item: IInboxNotificationItem, store: DisposableStore): void {
		const part = item.needsInputPart;
		if (!part) {
			return;
		}

		if (part.kind === 'confirmation') {
			const buttonLabels = part.buttons?.length
				? part.buttons
				: [localize('inboxNotifications.confirmation.accept', "Accept"), localize('inboxNotifications.confirmation.dismiss', "Dismiss")];
			const confirmationWidget = store.add(this.instantiationService.createInstance(
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
			const host = container.appendChild($('.inbox-notifications-chat-part-host'));
			host.appendChild(confirmationWidget.domNode);
			store.add(confirmationWidget.onDidClick(({ button }) => {
				this.logInboxInteraction('submitConfirmation', 'inlineConfirmation', item);
				void this.submitConfirmationPart(item, part, button.data.buttonLabel, button.data.buttonIndex);
			}));
			return;
		}

		if (part.kind === 'toolConfirmation') {
			const toolConfirmationWidget = store.add(this.instantiationService.createInstance(
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
			const host = container.appendChild($('.inbox-notifications-chat-part-host'));
			host.appendChild(toolConfirmationWidget.domNode);
			store.add(toolConfirmationWidget.onDidClick(({ button }) => {
				this.logInboxInteraction('submitToolConfirmation', 'inlineToolConfirmation', item);
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
		const carouselWidget = store.add(this.instantiationService.createInstance(
			ChatQuestionCarouselPart,
			carousel,
			this.createChatContentPartRenderContext(),
			{
				shouldAutoFocus: false,
				onSubmit: answers => {
					this.logInboxInteraction('submitQuestionCarousel', 'inlineQuestionCarousel', item);
					void this.submitQuestionCarouselPart(item, part, answers);
				},
			},
		));
		const host = container.appendChild($('.inbox-notifications-chat-part-host.interactive-session'));
		const inputPartHost = host.appendChild($('.interactive-input-part'));
		const widgetContainer = inputPartHost.appendChild($('.chat-question-carousel-widget-container'));
		widgetContainer.appendChild(carouselWidget.domNode);
		store.add(carouselWidget.onDidChangeHeight(() => this.scrollableElement.scanDomNode()));
	}

	private async submitConfirmationPart(
		item: IInboxNotificationItem,
		part: IInboxNotificationConfirmationPart,
		buttonLabel: string,
		buttonIndex: number,
	): Promise<void> {
		const startTime = Date.now();
		const requestContext = this.getNeedsInputRequestContext(part.chatResource, part.requestId);
		if (!requestContext) {
			this.logInboxInteraction('submitConfirmation.result', 'inlineConfirmation', item, 'none', { result: 'failure', durationMs: Date.now() - startTime });
			this.notificationService.error(localize('inboxNotifications.confirmation.chatMissing', "Unable to find the session for this confirmation. Open the session and try again."));
			return;
		}
		const confirmationPart = this.getPendingConfirmationPart(requestContext.response, part.data);
		if (!confirmationPart) {
			this.logInboxInteraction('submitConfirmation.result', 'inlineConfirmation', item, 'none', { result: 'failure', durationMs: Date.now() - startTime });
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
			this.logInboxInteraction('submitConfirmation.result', 'inlineConfirmation', item, 'none', { result: 'success', durationMs: Date.now() - startTime });
			return;
		}

		this.logInboxInteraction('submitConfirmation.result', 'inlineConfirmation', item, 'none', { result: 'failure', durationMs: Date.now() - startTime });
		this.notificationService.error(localize('inboxNotifications.confirmation.sendFailed', "Unable to submit this confirmation. Open the session and try again."));
	}

	private async submitToolConfirmationPart(
		item: IInboxNotificationItem,
		part: IInboxNotificationToolConfirmationPart,
		buttonIndex: number,
	): Promise<void> {
		const startTime = Date.now();
		const chatModel = this.chatService.getSession(part.chatResource);
		if (!chatModel) {
			this.logInboxInteraction('submitToolConfirmation.result', 'inlineToolConfirmation', item, 'none', { result: 'failure', durationMs: Date.now() - startTime });
			this.notificationService.error(localize('inboxNotifications.toolConfirmation.chatMissing', "Unable to find the session for this confirmation. Open the session and try again."));
			return;
		}

		const request = chatModel.getRequests().find(candidate => candidate.response?.requestId === part.requestId);
		const response = request?.response;
		const toolInvocation = response?.response.value.find(candidate => candidate.kind === 'toolInvocation' && candidate.toolCallId === part.toolCallId);
		if (!toolInvocation || toolInvocation.kind !== 'toolInvocation') {
			this.logInboxInteraction('submitToolConfirmation.result', 'inlineToolConfirmation', item, 'none', { result: 'failure', durationMs: Date.now() - startTime });
			this.notificationService.error(localize('inboxNotifications.toolConfirmation.invocationMissing', "This confirmation is no longer available. Open the session for the latest state."));
			return;
		}

		const button = part.buttons[buttonIndex] ?? part.buttons[0];
		if (!button) {
			this.logInboxInteraction('submitToolConfirmation.result', 'inlineToolConfirmation', item, 'none', { result: 'failure', durationMs: Date.now() - startTime });
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
			this.logInboxInteraction('submitToolConfirmation.result', 'inlineToolConfirmation', item, 'none', { result: 'failure', durationMs: Date.now() - startTime });
			this.notificationService.error(localize('inboxNotifications.toolConfirmation.staleState', "This confirmation changed before your action was applied. Open the session and try again."));
			return;
		}
		await this.completeNeedsInputNotification(item);
		this.logInboxInteraction('submitToolConfirmation.result', 'inlineToolConfirmation', item, 'none', { result: 'success', durationMs: Date.now() - startTime });
	}

	private async submitQuestionCarouselPart(
		item: IInboxNotificationItem,
		part: IInboxNotificationQuestionCarouselPart,
		answers: Map<string, IChatQuestionAnswerValue> | undefined,
	): Promise<void> {
		const startTime = Date.now();
		if (!part.resolveId) {
			this.logInboxInteraction('submitQuestionCarousel.result', 'inlineQuestionCarousel', item, 'none', { result: 'failure', durationMs: Date.now() - startTime });
			this.notificationService.error(localize('inboxNotifications.questionCarousel.resolveIdMissing', "Unable to submit this question yet. Open the session to continue."));
			return;
		}

		const requestContext = this.getNeedsInputRequestContext(part.chatResource, part.requestId);
		if (!requestContext) {
			this.logInboxInteraction('submitQuestionCarousel.result', 'inlineQuestionCarousel', item, 'none', { result: 'failure', durationMs: Date.now() - startTime });
			this.notificationService.error(localize('inboxNotifications.questionCarousel.chatMissing', "Unable to find the session for these questions. Open the session and try again."));
			return;
		}
		const carouselPart = requestContext.response.response.value.find(candidate => candidate.kind === 'questionCarousel' && candidate.resolveId === part.resolveId && !candidate.isUsed);
		if (!carouselPart || carouselPart.kind !== 'questionCarousel') {
			this.logInboxInteraction('submitQuestionCarousel.result', 'inlineQuestionCarousel', item, 'none', { result: 'failure', durationMs: Date.now() - startTime });
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
		this.logInboxInteraction('submitQuestionCarousel.result', 'inlineQuestionCarousel', item, 'none', { result: 'success', durationMs: Date.now() - startTime });
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
		const startTime = Date.now();
		const commandId = action.commandId ?? 'none';
		const logResult = (result: InboxInteractionResult): void => {
			this.logInboxInteraction('runAction.result', 'actionExecution', item, action.kind, {
				result,
				commandId,
				durationMs: Date.now() - startTime,
			});
		};

		try {
			switch (action.kind) {
				case InboxNotificationActionKind.OpenSession: {
					if (!item.sessionResource) {
						logResult('skipped');
						return;
					}
					await this.sessionsService.openSession(item.sessionResource, { source: 'notification' });
					logResult('success');
					return;
				}
				case InboxNotificationActionKind.AgentMergeFixCI:
				case InboxNotificationActionKind.AgentMergeAddressReviews:
				case InboxNotificationActionKind.AgentMergeMergePullRequest: {
					const result = await this.runAgentMergeInboxAction(item, action.kind, enableAlways, sourceElement);
					logResult(result);
					return;
				}
				case InboxNotificationActionKind.ArchiveSession:
				case InboxNotificationActionKind.DeleteSession: {
					const result = await this.runMergedSessionCleanupAction(item, action.kind, enableAlways);
					logResult(result);
					return;
				}
				case InboxNotificationActionKind.MarkDone: {
					await this.markDone(item, sourceElement);
					logResult('success');
					return;
				}
				case InboxNotificationActionKind.Dismiss:
					this.inboxNotificationsService.dismissNotification(item.id);
					logResult('success');
					return;
				case InboxNotificationActionKind.Command:
					if (action.commandId) {
						await this.commandService.executeCommand(action.commandId, ...(action.commandArgs ?? []));
						logResult('success');
					} else {
						logResult('skipped');
					}
					return;
			}
		} catch (error) {
			logResult('failure');
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
		const canShowAlwaysDropdown = this.canShowAlwaysDropdown(item, action.kind);
		const button = canShowAlwaysDropdown
			? this.renderedListDisposables.add(new ButtonWithDropdown(container, {
				...baseOptions,
				contextMenuProvider: this.contextMenuService,
				addPrimaryActionToDropdown: false,
				actions: [toAction({
					id: `${action.id}.always`,
					label: localize('inboxNotifications.action.always', "Always {0}", action.label),
					run: () => {
						this.logInboxInteraction('runActionAlways', 'actionDropdown', item, action.kind, { commandId: action.commandId ?? 'none' });
						return this.runAction(item, action, undefined, true);
					},
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
		this.renderedListDisposables.add(button.onDidClick(() => {
			this.logInboxInteraction('runAction', 'actionButton', item, action.kind, { commandId: action.commandId ?? 'none' });
			void this.runAction(item, action, button.element);
		}));
		return button;
	}

	private logInboxInteraction(
		interaction: string,
		trigger: string,
		item?: IInboxNotificationItem,
		actionKind: InboxNotificationActionKind | 'none' = 'none',
		options?: IInboxInteractionTelemetryOptions,
	): void {
		const notificationKind = options?.notificationKind ?? item?.kind ?? 'none';
		const hasSession = options?.hasSession ?? (item?.sessionResource ? 'yes' : 'no');
		const sequence = ++this.interactionSequence;
		this.telemetryService.publicLog2<InboxInteractionTelemetryEvent, InboxInteractionTelemetryClassification>('agents/inboxInteraction', {
			interaction,
			trigger,
			result: options?.result ?? 'attempt',
			notificationKind,
			notificationActionKind: actionKind,
			hasSession,
			commandId: options?.commandId ?? 'none',
			viewInstanceId: this.inboxViewInstanceId,
			sequence,
			durationMs: options?.durationMs,
		});
	}

	private canShowAlwaysDropdown(item: IInboxNotificationItem, actionKind: InboxNotificationActionKind): actionKind is InboxAgentMergeActionKind | InboxMergedSessionCleanupActionKind {
		if (isInboxAgentMergeActionKind(actionKind)) {
			return !this.agentMergeAlwaysOptInService.isAlwaysEnabled(actionKind);
		}
		if (isInboxMergedSessionCleanupActionKind(actionKind)) {
			return !!item.sessionResource && !this.isMergedSessionCleanupAlwaysEnabled(actionKind);
		}
		return false;
	}

	private isMergedSessionCleanupAlwaysEnabled(actionKind: InboxMergedSessionCleanupActionKind): boolean {
		const archiveAfterDays = this.configurationService.getValue<number>(AUTO_MARK_AS_DONE_MERGED_SESSIONS_AFTER_DAYS_SETTING) ?? 0;
		const deleteAfterDays = this.configurationService.getValue<number>(AUTO_DELETE_MARKED_AS_DONE_MERGED_SESSIONS_AFTER_DAYS_SETTING) ?? 0;
		switch (actionKind) {
			case InboxNotificationActionKind.ArchiveSession:
				return archiveAfterDays > 0;
			case InboxNotificationActionKind.DeleteSession:
				return archiveAfterDays > 0 && deleteAfterDays > 0;
		}
	}

	private async runMergedSessionCleanupAction(item: IInboxNotificationItem, actionKind: InboxMergedSessionCleanupActionKind, enableAlways: boolean): Promise<InboxInteractionResult> {
		if (enableAlways) {
			await this.enableMergedSessionCleanupAlways(actionKind);
			return 'success';
		}

		if (!item.sessionResource) {
			return 'skipped';
		}

		const session = this.sessionsManagementService.getSession(item.sessionResource);
		if (!session) {
			return 'skipped';
		}

		switch (actionKind) {
			case InboxNotificationActionKind.ArchiveSession:
				await this.sessionsManagementService.archiveSession(session);
				return 'success';
			case InboxNotificationActionKind.DeleteSession:
				await this.sessionsManagementService.deleteSession(session);
				return 'success';
		}
	}

	private async enableMergedSessionCleanupAlways(actionKind: InboxMergedSessionCleanupActionKind): Promise<void> {
		await this.configurationService.updateValue(AUTO_MARK_AS_DONE_MERGED_SESSIONS_AFTER_DAYS_SETTING, ALWAYS_MERGED_SESSION_CLEANUP_AFTER_DAYS, ConfigurationTarget.USER);
		if (actionKind === InboxNotificationActionKind.DeleteSession) {
			await this.configurationService.updateValue(AUTO_DELETE_MARKED_AS_DONE_MERGED_SESSIONS_AFTER_DAYS_SETTING, ALWAYS_MERGED_SESSION_CLEANUP_AFTER_DAYS, ConfigurationTarget.USER);
		}
	}

	private async runAgentMergeInboxAction(item: IInboxNotificationItem, actionKind: InboxAgentMergeActionKind, enableAlways: boolean, sourceElement: HTMLElement | undefined): Promise<InboxInteractionResult> {
		if (enableAlways) {
			await this.agentMergeAlwaysOptInService.enableAlways(actionKind);
			return 'success';
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

		return this.runAgentMergeAction(item, this.getAgentMergeActionOverrides(actionKind));
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

	private async runAgentMergeAction(item: IInboxNotificationItem, overrides: AgentMergeSessionOverrides): Promise<InboxInteractionResult> {
		if (!item.sessionResource) {
			return 'skipped';
		}

		const session = this.sessionsManagementService.getSession(item.sessionResource);
		if (!session) {
			return 'skipped';
		}

		const provider = this.sessionsProvidersService.getProvider(session.providerId);
		if (!provider || !isAgentHostProvider(provider)) {
			await this.sessionsService.openSession(item.sessionResource);
			return 'success';
		}

		await provider.setAgentMergeEnabled(session.sessionId, true);
		const currentOverrides = provider.getAgentMergeSessionState(session.sessionId)?.overrides;
		await provider.setAgentMergeOverrides(session.sessionId, {
			...currentOverrides,
			...overrides,
		});
		return 'success';
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

	private createDetailSash(): void {
		const sash = this.detailSash = this._register(new Sash(this.contentElement, {
			getVerticalSashLeft: () => this.listPaneWidth,
		}, { orientation: Orientation.VERTICAL }));
		sash.state = SashState.Disabled;

		let startWidth = this.listPaneWidth;
		this._register(sash.onDidStart(() => { startWidth = this.listPaneWidth; }));
		this._register(sash.onDidChange((event: ISashEvent) => {
			this.listPaneWidth = this.clampListPaneWidth(startWidth + (event.currentX - event.startX));
			this.layoutPanes();
		}));
		this._register(sash.onDidEnd(() => this.persistListPaneWidth()));
		this._register(sash.onDidReset(() => {
			this.listPaneWidth = DEFAULT_LIST_PANE_WIDTH;
			this.layoutPanes();
			this.persistListPaneWidth();
		}));
	}

	private clampListPaneWidth(width: number): number {
		const max = this.layoutWidth > 0
			? Math.max(MIN_LIST_PANE_WIDTH, this.layoutWidth - MIN_DETAIL_PANE_WIDTH)
			: Math.max(MIN_LIST_PANE_WIDTH, width);
		return clamp(Math.round(width), MIN_LIST_PANE_WIDTH, max);
	}

	private updateSplit(hasItems: boolean): void {
		this.hasSplit = hasItems;
		this.contentElement.classList.toggle('no-detail', !hasItems);
		if (!hasItems && this.selectedItemId.get() !== undefined) {
			this.clearSelectedItem('listEmpty');
		}
		this.layoutPanes();
	}

	private layoutPanes(): void {
		// When the container is too narrow to fit both minimum widths, stack the panes
		// vertically instead of letting the detail surface collapse to an unusable width.
		const narrow = this.hasSplit && this.layoutWidth > 0 && this.layoutWidth < NARROW_STACK_THRESHOLD;
		this.contentElement.classList.toggle('narrow', narrow);
		const sideBySide = this.hasSplit && !narrow;
		if (this.detailSash) {
			this.detailSash.state = sideBySide ? SashState.Enabled : SashState.Disabled;
		}
		this.listPaneElement.style.width = sideBySide ? `${this.clampListPaneWidth(this.listPaneWidth)}px` : '';
		this.detailSash?.layout();
		this.scrollableElement.scanDomNode();
		this.detailScrollableElement.scanDomNode();
	}

	private loadListPaneWidth(): void {
		const stored = this.storageService.getNumber(LIST_PANE_WIDTH_STORAGE_KEY, StorageScope.APPLICATION);
		if (typeof stored === 'number' && stored > 0) {
			this.listPaneWidth = stored;
		}
	}

	private persistListPaneWidth(): void {
		this.storageService.store(LIST_PANE_WIDTH_STORAGE_KEY, Math.round(this.listPaneWidth), StorageScope.APPLICATION, StorageTarget.USER);
	}

	private selectItem(id: string, trigger: 'cardClick' | 'cardKeyboard'): void {
		if (this.selectedItemId.get() === id) {
			return;
		}

		this.endSelectionTelemetry('selectionChanged');
		this.selectedItemId.set(id, undefined);
		for (const card of this.renderedCards) {
			card.classList.toggle('selected', card.dataset.notificationId === id);
		}

		const item = this.getItemById(id);
		if (!item) {
			return;
		}

		this.selectionTelemetryState = {
			notificationKind: item.kind,
			hasSession: item.sessionResource ? 'yes' : 'no',
			selectedAt: Date.now(),
		};
		this.logInboxInteraction('item.select', trigger, item, 'none', { result: 'success' });
	}

	private clearSelectedItem(trigger: string): void {
		this.endSelectionTelemetry(trigger);
		this.selectedItemId.set(undefined, undefined);
	}

	private endSelectionTelemetry(trigger: string): void {
		const telemetryState = this.selectionTelemetryState;
		if (!telemetryState) {
			return;
		}

		this.selectionTelemetryState = undefined;
		this.logInboxInteraction('item.deselect', trigger, undefined, 'none', {
			result: 'success',
			durationMs: Date.now() - telemetryState.selectedAt,
			notificationKind: telemetryState.notificationKind,
			hasSession: telemetryState.hasSession,
		});
	}

	private getItemById(id: string): IInboxNotificationItem | undefined {
		return this.inboxNotificationsService.notifications.get().find(candidate => candidate.id === id)
			?? this.inboxNotificationsService.dismissedNotifications.get().find(candidate => candidate.id === id);
	}

	private selectedItem(): IInboxNotificationItem | undefined {
		const id = this.selectedItemId.get();
		if (!id) {
			return undefined;
		}
		return this.getItemById(id);
	}

	private renderDetailIfChanged(): void {
		const item = this.selectedItem();
		const signature = item ? this.detailSignature(item) : 'none';
		if (signature === this.lastDetailSignature) {
			return;
		}
		this.lastDetailSignature = signature;
		this.renderDetail(item);
	}

	/**
	 * Identity + content that affects the rendered artifact. Re-rendering only when this
	 * changes keeps unrelated inbox churn (and preview/summary arrivals) from tearing down
	 * and rebuilding the detail content while the user is reading or scrolling it.
	 */
	private detailSignature(item: IInboxNotificationItem): string {
		const part = item.needsInputPart;
		const partKey = part
			? `${part.kind}:${part.requestId}:${part.kind === 'questionCarousel' ? part.resolveId ?? '' : part.kind === 'toolConfirmation' ? part.toolCallId : ''}`
			: '';
		return `${item.id}|${item.kind}|${item.priority}|${item.description}|${partKey}`;
	}

	private renderDetail(item: IInboxNotificationItem | undefined): void {
		this.detailDisposables.clear();
		clearNode(this.detailContentElement);

		if (!item) {
			this.detailContentElement.appendChild($('.inbox-notifications-detail-placeholder', undefined,
				localize('inboxNotifications.detail.placeholder', "Select a notification to see its details.")));
			this.detailScrollableElement.scanDomNode();
			return;
		}

		const header = this.detailContentElement.appendChild($('.inbox-notifications-detail-header'));
		const kindLabel = header.appendChild($('.inbox-notifications-detail-kind', undefined, this.kindLabel(item.kind)));
		kindLabel.classList.add(`priority-${item.priority}`);
		header.appendChild($('h2.inbox-notifications-detail-title', undefined, item.title));

		const meta = header.appendChild($('.inbox-notifications-detail-meta'));
		if (item.repositoryLabel) {
			meta.appendChild($('span.inbox-notifications-detail-repo', undefined, item.repositoryLabel));
		}
		meta.appendChild($('span.inbox-notifications-detail-time', undefined,
			localize('inboxNotifications.detail.updated', "Updated {0}", fromNowByDay(item.timestamp, true, true))));
		if (item.sessionResource) {
			const sessionResource = item.sessionResource;
			const openButton = this.detailDisposables.add(new Button(meta, { ...defaultButtonStyles, secondary: true, small: true }));
			openButton.label = localize('inboxNotifications.detail.openSession', "Open full session");
			this.detailDisposables.add(openButton.onDidClick(() => {
				const startTime = Date.now();
				this.logInboxInteraction('detail.openSession', 'detailMeta', item);
				void this.sessionsService.openSession(sessionResource, { source: 'notification' }).then(() => {
					this.logInboxInteraction('detail.openSession.result', 'detailMeta', item, 'none', { result: 'success', durationMs: Date.now() - startTime });
				}, error => {
					this.logInboxInteraction('detail.openSession.result', 'detailMeta', item, 'none', { result: 'failure', durationMs: Date.now() - startTime });
					onUnexpectedError(error);
				});
			}));
		}

		const body = this.detailContentElement.appendChild($('.inbox-notifications-detail-body'));
		if (item.needsInputPart || item.kind === InboxNotificationKind.Completed) {
			this.renderDetailSummary(body, item);
		} else {
			const summaryEl = body.appendChild($('.inbox-notifications-detail-summary', undefined, item.description));
			if (item.previewSignature) {
				const signature = item.previewSignature;
				this.detailDisposables.add(autorun(reader => {
					const preview = this.inboxNotificationsService.previews.read(reader).get(signature);
					summaryEl.textContent = preview ?? item.description;
				}));
			}
			const transcript = this.getLatestResponseText(item);
			if (transcript) {
				body.appendChild($('.inbox-notifications-detail-section-label', undefined, localize('inboxNotifications.detail.latestResponse', "Latest response")));
				body.appendChild($('.inbox-notifications-detail-transcript', undefined, transcript));
			}
		}

		if (item.pullRequestStates?.length) {
			const prSection = body.appendChild($('.inbox-notifications-detail-pr'));
			for (const state of item.pullRequestStates) {
				const row = prSection.appendChild($('.inbox-notifications-detail-pr-row'));
				const icon = row.appendChild(renderIcon(state.icon));
				icon.setAttribute('aria-hidden', 'true');
				if (state.pullRequestUri) {
					const uri = state.pullRequestUri;
					const link = this.detailDisposables.add(new Button(row, { ...defaultButtonStyles, secondary: true, small: true }));
					link.label = state.label;
					this.detailDisposables.add(link.onDidClick(() => {
						this.logInboxInteraction('detail.openPullRequestState', 'detailPullRequestState', item);
						void this.openerService.open(uri).catch(onUnexpectedError);
					}));
				} else {
					row.appendChild($('span.inbox-notifications-detail-pr-label', undefined, state.label));
				}
				row.appendChild($('span.inbox-notifications-detail-pr-status', undefined, state.statusLabel));
			}
		}

		this.detailScrollableElement.scanDomNode();
	}

	private renderDetailSummary(body: HTMLElement, item: IInboxNotificationItem): void {
		this.inboxNotificationsService.requestDetailSummary(item);
		const container = body.appendChild($('.inbox-notifications-detail-evidence'));
		const runStore = this.detailDisposables.add(new DisposableStore());
		this.detailDisposables.add(autorun(reader => {
			const summary = this.inboxNotificationsService.detailSummaries.read(reader).get(item.id);
			runStore.clear();
			clearNode(container);
			if (!summary) {
				this.renderEvidenceLoading(container, runStore);
			} else if (!summary.status && summary.evidence.length === 0) {
				this.renderEvidenceFallback(container, item);
			} else {
				this.renderEvidencePack(container, item, summary, runStore);
			}
			this.detailScrollableElement.scanDomNode();
		}));
	}

	private renderEvidenceLoading(container: HTMLElement, store: DisposableStore): void {
		const loading = container.appendChild($('.inbox-notifications-detail-loading'));
		const spinner = loading.appendChild($('span.codicon.codicon-loading.codicon-modifier-spin'));
		spinner.setAttribute('aria-hidden', 'true');
		const label = loading.appendChild($('span.inbox-notifications-detail-loading-label', undefined, `${pickFunWorkingMessage()}…`));
		const win = getWindow(container);
		const handle = win.setInterval(() => { label.textContent = `${pickFunWorkingMessage()}…`; }, 2200);
		store.add(toDisposable(() => win.clearInterval(handle)));
	}

	private renderEvidenceFallback(container: HTMLElement, item: IInboxNotificationItem): void {
		if (item.needsInputPart) {
			this.renderConversationThread(container, item);
			return;
		}
		const preview = (item.previewSignature ? this.inboxNotificationsService.previews.get().get(item.previewSignature) : undefined) ?? item.description;
		container.appendChild($('.inbox-notifications-detail-summary', undefined, preview));
		const transcript = this.getLatestResponseText(item);
		if (transcript) {
			container.appendChild($('.inbox-notifications-detail-section-label', undefined, localize('inboxNotifications.detail.latestResponse', "Latest response")));
			container.appendChild($('.inbox-notifications-detail-transcript', undefined, transcript));
		}
	}

	private renderEvidencePack(container: HTMLElement, item: IInboxNotificationItem, summary: IInboxDetailSummary, store: DisposableStore): void {
		if (summary.status) {
			container.appendChild($('.inbox-notifications-detail-summary', undefined, summary.status));
		}
		if (summary.decisions.length) {
			container.appendChild($('.inbox-notifications-detail-section-label', undefined, localize('inboxNotifications.detail.decisions', "Decisions")));
			const list = container.appendChild($('ul.inbox-notifications-detail-list'));
			for (const decision of summary.decisions) {
				list.appendChild($('li', undefined, decision));
			}
		}
		if (summary.evidence.length) {
			container.appendChild($('.inbox-notifications-detail-section-label', undefined, localize('inboxNotifications.detail.evidence', "Evidence")));
			const list = container.appendChild($('ul.inbox-notifications-detail-list'));
			for (const evidence of summary.evidence) {
				const entry = list.appendChild($('li.inbox-notifications-detail-evidence-item'));
				entry.appendChild($('span.inbox-notifications-detail-evidence-text', undefined, evidence.text));
				const link = entry.appendChild($('a.inbox-notifications-detail-evidence-link', undefined, evidence.artifact.label));
				link.setAttribute('role', 'button');
				link.setAttribute('tabindex', '0');
				link.setAttribute('title', localize('inboxNotifications.detail.evidence.open', "Open {0}", evidence.artifact.label));
				const open = () => this.openEvidenceArtifact(item, evidence.artifact);
				store.add(addDisposableListener(link, EventType.CLICK, event => { event.stopPropagation(); open(); }));
				store.add(addDisposableListener(link, EventType.KEY_DOWN, (event: KeyboardEvent) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						event.stopPropagation();
						open();
					}
				}));
			}
		}
	}

	private openEvidenceArtifact(item: IInboxNotificationItem, artifact: IInboxEvidenceArtifact): void {
		this.logInboxInteraction('detail.openEvidence', 'detailEvidence', item);
		if (artifact.kind === 'file' && artifact.uri) {
			const startTime = Date.now();
			void this.openerService.open(artifact.uri).then(() => {
				this.logInboxInteraction('detail.openEvidence.result', 'detailEvidence', item, 'none', { result: 'success', durationMs: Date.now() - startTime });
			}, error => {
				this.logInboxInteraction('detail.openEvidence.result', 'detailEvidence', item, 'none', { result: 'failure', durationMs: Date.now() - startTime });
				onUnexpectedError(error);
			});
			return;
		}
		if (item.sessionResource) {
			const startTime = Date.now();
			void this.sessionsService.openSession(item.sessionResource, { source: 'notification' }).then(() => {
				this.logInboxInteraction('detail.openEvidence.result', 'detailEvidence', item, 'none', { result: 'success', durationMs: Date.now() - startTime });
			}, error => {
				this.logInboxInteraction('detail.openEvidence.result', 'detailEvidence', item, 'none', { result: 'failure', durationMs: Date.now() - startTime });
				onUnexpectedError(error);
			});
			return;
		}
		this.logInboxInteraction('detail.openEvidence.result', 'detailEvidence', item, 'none', { result: 'skipped' });
	}

	private renderConversationThread(body: HTMLElement, item: IInboxNotificationItem): void {
		const chatModel = this.getSessionChatModel(item);
		const thread = body.appendChild($('.inbox-notifications-detail-thread'));
		let rendered = 0;
		for (const request of chatModel?.getRequests() ?? []) {
			const userText = request.message.text.trim();
			if (userText) {
				const turn = thread.appendChild($('.inbox-notifications-detail-turn.user'));
				turn.appendChild($('.inbox-notifications-detail-turn-role', undefined, localize('inboxNotifications.detail.thread.you', "You")));
				turn.appendChild($('.inbox-notifications-detail-turn-text', undefined, userText));
				rendered++;
			}
			const response = request.response;
			const agentText = response && !response.isCanceled ? this.getResponseText(response) : undefined;
			if (agentText) {
				const turn = thread.appendChild($('.inbox-notifications-detail-turn.agent'));
				turn.appendChild($('.inbox-notifications-detail-turn-role', undefined, localize('inboxNotifications.detail.thread.agent', "Agent")));
				turn.appendChild($('.inbox-notifications-detail-turn-text', undefined, agentText));
				rendered++;
			}
		}
		if (rendered === 0) {
			thread.appendChild($('.inbox-notifications-detail-placeholder', undefined, localize('inboxNotifications.detail.thread.empty', "No conversation yet.")));
		}
	}

	private getSessionChatModel(item: IInboxNotificationItem) {
		if (!item.sessionResource) {
			return undefined;
		}
		const session = this.sessionsManagementService.getSession(item.sessionResource);
		const chatResource = session?.mainChat.get().resource;
		return chatResource ? this.chatService.getSession(chatResource) : undefined;
	}

	private getResponseText(response: IChatResponseModel): string | undefined {
		const parts: string[] = [];
		for (const part of response.response.value) {
			if (part.kind === 'markdownContent') {
				parts.push(renderAsPlaintext(part.content, { useLinkFormatter: true }));
			}
		}
		const text = parts.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
		return text || undefined;
	}

	private getLatestResponseText(item: IInboxNotificationItem): string | undefined {
		const chatModel = this.getSessionChatModel(item);
		if (!chatModel) {
			return undefined;
		}
		for (const request of chatModel.getRequests().toReversed()) {
			const response = request.response;
			if (!response || response.isCanceled) {
				continue;
			}
			const text = this.getResponseText(response);
			if (text) {
				return text.length > 4000 ? `${text.slice(0, 4000).trimEnd()}…` : text;
			}
		}
		return undefined;
	}

	layout(width: number, _height: number): void {
		this.layoutWidth = width;
		this.listPaneWidth = this.clampListPaneWidth(this.listPaneWidth);
		this.layoutPanes();
	}
}

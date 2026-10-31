/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/inboxNotificationsView.css';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { $, addDisposableListener, clearNode, DisposableResizeObserver, EventType, getActiveElement, getWindow, isEditableElement, isHTMLElement, trackFocus } from '../../../../base/browser/dom.js';
import { captureAnimationTarget, IAnimationTarget, triggerConfettiAnimation } from '../../../../base/browser/ui/animations/animations.js';
import { Button, ButtonWithDropdown, IButton } from '../../../../base/browser/ui/button/button.js';
import { InputBox } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Orientation, Sash, SashState, ISashEvent } from '../../../../base/browser/ui/sash/sash.js';
import { renderAsPlaintext } from '../../../../base/browser/markdownRenderer.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { toAction } from '../../../../base/common/actions.js';
import { disposableTimeout, raceTimeout, RunOnceScheduler } from '../../../../base/common/async.js';
import { clamp } from '../../../../base/common/numbers.js';
import { isEqual } from '../../../../base/common/resources.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, IObservable, IReader, observableFromEvent, observableValue, runOnChange, waitForState } from '../../../../base/common/observable.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { safeStringify } from '../../../../base/common/objects.js';
import { localize } from '../../../../nls.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { IAgentWorkbenchLayoutService } from '../../../browser/workbench.js';
import { IMarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { defaultButtonStyles, defaultInputBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { URI } from '../../../../base/common/uri.js';
import { fromNowByDay } from '../../../../base/common/date.js';
import { ChatSendResult, IChatConfirmation, IChatQuestionAnswerValue, IChatSendRequestOptions, IChatService, IChatToolInvocation, ToolConfirmKind } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatContentPartRenderContext } from '../../../../workbench/contrib/chat/browser/widget/chatContentParts/chatContentParts.js';
import { ChatCustomConfirmationWidget, SimpleChatConfirmationWidget } from '../../../../workbench/contrib/chat/browser/widget/chatContentParts/chatConfirmationWidget.js';
import { buildCustomOptionButtons } from '../../../../workbench/contrib/chat/browser/widget/chatContentParts/toolInvocationParts/abstractToolConfirmationSubPart.js';
import { ChatTerminalToolExplanation } from '../../../../workbench/contrib/chat/browser/widget/chatContentParts/toolInvocationParts/chatTerminalToolExplanation.js';
import { getChatMarkdownRenderOptions } from '../../../../workbench/contrib/chat/browser/widget/chatContentMarkdownRenderer.js';
import { ChatQuestionCarouselPart } from '../../../../workbench/contrib/chat/browser/widget/chatContentParts/chatQuestionCarouselPart.js';
import { IChatModel, IChatRequestModel, IChatResponseModel } from '../../../../workbench/contrib/chat/common/model/chatModel.js';
import { ChatViewModel } from '../../../../workbench/contrib/chat/common/model/chatViewModel.js';
import { ChatListWidget } from '../../../../workbench/contrib/chat/browser/widget/chatListWidget.js';
import { ChatQuestionCarouselData } from '../../../../workbench/contrib/chat/common/model/chatProgressTypes/chatQuestionCarouselData.js';
import { ConfirmationOptionKind } from '../../../../platform/agentHost/common/state/protocol/state.js';
import { SESSIONS_MARK_AS_DONE_CONFETTI_SETTING } from '../../../../platform/chat/common/sessionArchiveActions.js';
import { isAgentHostProviderId } from '../../../common/agentHostSessionsProvider.js';
import { IWindowCanvas } from '../../../services/canvas/browser/windowCanvasService.js';
import { AbstractChatView } from '../../../browser/parts/chatView.js';
import { IChatViewFactory } from '../../../services/chatView/browser/chatViewFactory.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { createSessionSummaryHover, getSessionSummaryHoverData } from '../../sessions/browser/sessionHoverContent.js';
import { getChatSessionArtifacts, IChat, ISession } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { ChatAgentLocation, ChatModeKind } from '../../../../workbench/contrib/chat/common/constants.js';
import { InboxCanvasFocusContext } from '../../../common/contextkeys.js';
import { AUTO_DELETE_MARKED_AS_DONE_MERGED_SESSIONS_AFTER_DAYS_SETTING, AUTO_MARK_AS_DONE_MERGED_SESSIONS_AFTER_DAYS_SETTING } from '../../github/common/sessionLifecycleSettings.js';
import { IGitHubService } from '../../github/browser/githubService.js';
import { buildFixCIPrompt } from '../../changes/browser/checksActions.js';
import { AgentFeedbackKind, AgentFeedbackState, IAgentFeedbackService } from '../../agentFeedback/browser/agentFeedbackService.js';
import {
	IInboxDetailSummary,
	IInboxNotificationAction,
	IInboxNotificationItem,
	IInboxNotificationConfirmationPart,
	IInboxNotificationQuestionCarouselPart,
	IInboxNotificationToolConfirmationPart,
	IInboxNotificationsService,
	IInboxSessionRow,
	InboxTab,
	InboxNotificationActionKind,
	InboxNotificationKind,
	InboxNotificationPriority,
	InboxNotificationsSortMode,
	getInboxPullRequestMergeOperation,
	getInboxPullRequestRefs,
	getInboxToolConfirmationDetails,
} from '../common/inboxNotificationsService.js';
import { getInboxNotificationLabel, getInboxNotificationPriorityLabel, getInboxTabLabel } from './inboxNotificationsLabels.js';
import { createInboxEvidenceSection, InboxEvidenceWidget } from './inboxEvidenceWidget.js';
import { InboxCanvases } from './inboxCanvases.js';

function reconcileChildren(parent: HTMLElement, children: readonly HTMLElement[]): void {
	const retained = new Set<Element>(children);
	for (const child of Array.from(parent.children)) {
		if (!retained.has(child)) {
			child.remove();
		}
	}
	for (const [index, child] of children.entries()) {
		if (parent.children[index] !== child) {
			parent.insertBefore(child, parent.children[index] ?? null);
		}
	}
}

type InboxMergedSessionCleanupActionKind = InboxNotificationActionKind.ArchiveSession | InboxNotificationActionKind.DeleteSession;

type InboxPullRequestActionKind =
	| InboxNotificationActionKind.AgentMergeFixCI
	| InboxNotificationActionKind.AgentMergeAddressReviews
	| InboxNotificationActionKind.AgentMergeMergePullRequest;

function isInboxPullRequestActionKind(kind: InboxNotificationActionKind): kind is InboxPullRequestActionKind {
	return kind === InboxNotificationActionKind.AgentMergeFixCI
		|| kind === InboxNotificationActionKind.AgentMergeAddressReviews
		|| kind === InboxNotificationActionKind.AgentMergeMergePullRequest;
}

function isInboxMergedSessionCleanupActionKind(actionKind: InboxNotificationActionKind): actionKind is InboxMergedSessionCleanupActionKind {
	return actionKind === InboxNotificationActionKind.ArchiveSession || actionKind === InboxNotificationActionKind.DeleteSession;
}

const LIST_PANE_WIDTH_STORAGE_KEY = 'sessions.inboxNotifications.listPaneWidth';
const DEFAULT_LIST_PANE_WIDTH = 400;
const DEFAULT_LIST_PANE_WIDTH_FRACTION = 0.42;
const MIN_LIST_PANE_WIDTH = 280;
const MIN_DETAIL_PANE_WIDTH = 320;
/** Below this the two panes can't both honor their minimums, so they stack vertically instead. */
const NARROW_STACK_THRESHOLD = MIN_LIST_PANE_WIDTH + MIN_DETAIL_PANE_WIDTH;

type InboxFilterCategory = 'now' | 'next' | 'later';
const FILTER_CATEGORIES: readonly InboxFilterCategory[] = ['now', 'next', 'later'];
const DEFAULT_VISIBLE_CATEGORIES: readonly InboxFilterCategory[] = ['now', 'next', 'later'];
const VISIBLE_CATEGORIES_STORAGE_KEY = 'sessions.inboxNotifications.visibleCategories';

function priorityCategory(priority: InboxNotificationPriority): InboxFilterCategory {
	switch (priority) {
		case InboxNotificationPriority.Now: return 'now';
		case InboxNotificationPriority.Next: return 'next';
		case InboxNotificationPriority.Later: return 'later';
	}
}
function filterCategoryLabel(category: InboxFilterCategory): string {
	switch (category) {
		case 'now': return localize('inboxNotifications.filter.now', "Now");
		case 'next': return localize('inboxNotifications.filter.next', "Next");
		case 'later': return localize('inboxNotifications.filter.later', "Later");
	}
}

const ALWAYS_MERGED_SESSION_CLEANUP_AFTER_DAYS = 15;

type InboxInteractionTelemetryEvent = {
	interaction: string;
	trigger: string;
	result: string;
	notificationKind: string;
	notificationActionKind: string;
	hasSession: string;
	agentSessionId: string;
	providerId: string;
	priorityTier: string;
	answerKind: string;
	answerCharCount: number;
	evidenceArtifactKind: string;
	listIndex: number;
	visibleItemCount: number;
	sortMode: string;
	filterActive: string;
	msSinceItemFirstSeen: number | undefined;
	msSinceSelection: number | undefined;
	msSinceViewOpen: number;
	actionId: string;
	needsInput: string;
	pullRequestStateCount: number;
	repositoryPresent: string;
	itemAgeMs: number;
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
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'SHA-1 hash of the associated session id (or none), used to correlate inbox interactions with the same session across events without exposing resource details.' };
	providerId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Bounded sessions provider category for the associated session: default-copilot, local-agent-host, remote-agent-host, other, or none.' };
	priorityTier: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Bounded priority tier of the card the interaction came from: now, next, later, or none.' };
	answerKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Bounded shape of a submitted needs-input answer: option, freeText, skip, approve, deny, or none.' };
	answerCharCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Character count of a submitted free-text answer (never the text itself); 0 otherwise.' };
	evidenceArtifactKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Bounded kind of an opened evidence artifact: file, session, command, pullRequest, or none.' };
	listIndex: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Zero-based position of the acted card among the visible cards at interaction time, or -1 when not applicable. Enables position/rank analysis of where attention was spent.' };
	visibleItemCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of notification cards visible in the list at interaction time; the denominator for rank/attention-budget analysis.' };
	sortMode: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Bounded active sort mode when the interaction occurred: priority, recent, or none.' };
	filterActive: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether a non-default category filter was applied when the interaction occurred (yes or no).' };
	msSinceItemFirstSeen: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Milliseconds from when the card was first shown in this view instance to this interaction (response latency); undefined when unknown.' };
	msSinceSelection: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Milliseconds from selecting the item to this interaction (post-focus deliberation latency); undefined when the item is not the selected one.' };
	msSinceViewOpen: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Milliseconds from when this inbox view instance opened to this event, giving every event a precise relative client timestamp for trajectory reconstruction.' };
	actionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Correlation id shared with the agents/inboxClick that triggered this interaction (or a fresh id for keyboard/programmatic actions), so the raw click and the semantic action can be de-duplicated.' };
	needsInput: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the card had an inline needs-input widget (yes or no).' };
	pullRequestStateCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of pull request state chips on the card; 0 when none.' };
	repositoryPresent: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the notification was associated with a repository (yes or no); never the repository name.' };
	itemAgeMs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Age of the notification (now minus its timestamp) at interaction time, in milliseconds; -1 when unknown. A staleness signal for routing.' };
	commandId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Command identifier for command-backed inbox actions, or none for other interactions.' };
	viewInstanceId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Per-inbox-view UUID used to correlate interaction trajectories inside a single view instance.' };
	sequence: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Monotonic interaction sequence number within the inbox view instance.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Duration in milliseconds for interaction outcomes that complete asynchronously, including dwell time when applicable.' };
};

type InboxInteractionResult = 'attempt' | 'success' | 'failure' | 'skipped';

type InboxAnswerKind = 'option' | 'freeText' | 'skip' | 'approve' | 'deny' | 'none';

interface ISelectionTelemetryState {
	readonly notificationId: string;
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
	readonly answerKind?: InboxAnswerKind;
	readonly answerCharCount?: number;
	readonly evidenceArtifactKind?: 'file' | 'session' | 'command' | 'pullRequest' | 'none';
}

type InboxImpressionTelemetryEvent = {
	notificationKind: string;
	priorityTier: string;
	listIndex: number;
	hasSession: string;
	agentSessionId: string;
	providerId: string;
	sortMode: string;
	filterActive: string;
	needsInput: string;
	pullRequestStateCount: number;
	repositoryPresent: string;
	itemAgeMs: number;
	msSinceViewOpen: number;
	viewInstanceId: string;
	sequence: number;
};

type InboxImpressionTelemetryClassification = {
	owner: 'meganrogge';
	comment: 'Records that a Sessions Inbox notification card was shown to the user, so the shown-but-not-acted set (the negatives for attention/routing analysis) can be reconstructed alongside agents/inboxInteraction. Emitted at most once per notification per inbox view instance.';
	notificationKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Bounded notification kind of the shown card.' };
	priorityTier: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Bounded priority tier the card was shown in: now, next, later, or none.' };
	listIndex: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Zero-based position of the card among the visible cards when it was first shown.' };
	hasSession: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the notification had an associated session resource.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'SHA-1 hash of the associated session id (or none), used to correlate the impression with interactions and session outcomes.' };
	providerId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Bounded sessions provider category for the associated session, or none.' };
	sortMode: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Bounded active sort mode when the card was shown: priority or recent.' };
	filterActive: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether a non-default category filter was applied when the card was shown (yes or no).' };
	needsInput: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the card had an inline needs-input widget (yes or no).' };
	pullRequestStateCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of pull request state chips on the card; 0 when none.' };
	repositoryPresent: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the notification was associated with a repository (yes or no); never the repository name.' };
	itemAgeMs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Age of the notification (now minus its timestamp) when first shown, in milliseconds; -1 when unknown.' };
	msSinceViewOpen: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Milliseconds from when this inbox view instance opened to this impression, for trajectory reconstruction.' };
	viewInstanceId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Per-inbox-view UUID used to correlate impressions with interactions in the same view instance.' };
	sequence: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Monotonic sequence number shared with agents/inboxInteraction, for ordering the trajectory.' };
};

type InboxViewStateTelemetryEvent = {
	state: string;
	dwellMs: number | undefined;
	visibleItemCount: number;
	sortMode: string;
	filterActive: string;
	msSinceViewOpen: number;
	viewInstanceId: string;
	sequence: number;
};

type InboxViewStateTelemetryClassification = {
	owner: 'meganrogge';
	comment: 'Tracks when the Sessions Inbox view opens, closes, gains, or loses focus, so time spent attending the inbox (dwell) and context switches away from it can be reconstructed as part of the user trajectory.';
	state: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Bounded view lifecycle transition: opened, closed, focus, or blur.' };
	dwellMs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'For blur, milliseconds the view was continuously focused; for closed, milliseconds the view instance was open; undefined otherwise.' };
	visibleItemCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of notification cards visible when the transition occurred.' };
	sortMode: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Bounded active sort mode at the transition: priority or recent.' };
	filterActive: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether a non-default category filter was applied at the transition (yes or no).' };
	msSinceViewOpen: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Milliseconds from when this inbox view instance opened to this event, for trajectory reconstruction.' };
	viewInstanceId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Per-inbox-view UUID used to correlate view-state transitions with interactions and impressions.' };
	sequence: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Monotonic sequence number shared with the other inbox events, for ordering the trajectory.' };
};

type InboxClickTelemetryEvent = {
	targetKind: string;
	relX: number;
	relY: number;
	actionId: string;
	notificationKind: string;
	priorityTier: string;
	hasSession: string;
	agentSessionId: string;
	providerId: string;
	sortMode: string;
	filterActive: string;
	msSinceViewOpen: number;
	viewInstanceId: string;
	sequence: number;
};

type InboxClickTelemetryClassification = {
	owner: 'meganrogge';
	comment: 'Records discrete pointer clicks within the Sessions Inbox view (never continuous mouse movement) so the raw click trajectory and coarse click location can be reconstructed. Emitted once per click, which is user-paced and adds no perceptible overhead.';
	targetKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Bounded category of the clicked element: card, actionButton, sortButton, filterButton, feedbackButton, sectionHeader, evidenceLink, detailPane, emptyState, listBackground, or other.' };
	relX: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Coarse click x position as a 0-9 bin across the view width (a 10x10 grid; no absolute screen coordinates); -1 when unknown.' };
	relY: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Coarse click y position as a 0-9 bin across the view height (a 10x10 grid; no absolute screen coordinates); -1 when unknown.' };
	actionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Correlation id shared with the agents/inboxInteraction this click triggers, so the raw click and the semantic action can be de-duplicated.' };
	notificationKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Bounded notification kind of the card the click landed on, or none.' };
	priorityTier: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Bounded priority tier of the card the click landed on, or none.' };
	hasSession: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the clicked card had an associated session resource.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'SHA-1 hash of the associated session id (or none) for the clicked card.' };
	providerId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Bounded sessions provider category for the clicked card, or none.' };
	sortMode: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Bounded active sort mode at click time: priority or recent.' };
	filterActive: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether a non-default category filter was applied at click time (yes or no).' };
	msSinceViewOpen: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Milliseconds from when this inbox view instance opened to this click, for trajectory reconstruction.' };
	viewInstanceId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Per-inbox-view UUID used to correlate clicks with the rest of the trajectory.' };
	sequence: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Monotonic sequence number shared with the other inbox events, for ordering the trajectory.' };
};

const inboxButtonStyles = {
	...defaultButtonStyles,
	buttonSecondaryBackground: undefined,
	buttonSecondaryHoverBackground: undefined,
	buttonSecondaryForeground: undefined,
	buttonSecondaryBorder: undefined,
};

export class InboxNotificationsView extends Disposable implements IWindowCanvas {

	private static activeInstance: InboxNotificationsView | undefined;

	readonly title: IObservable<string> = constObservable(localize('inboxNotifications.title', "Inbox"));
	readonly description: IObservable<string | undefined>;
	private readonly visible = observableValue(this, true);
	private container: HTMLElement | undefined;
	private focusContext: IContextKey<boolean> | undefined;
	private visibleSince = Date.now();
	private readonly sessionsPaneVisibility = this._register(new MutableDisposable());

	private readonly scrollableContentElement = $('div.inbox-notifications-list-scrollable');
	private readonly listContainer = observableValue<HTMLElement | undefined>('inboxNotificationsListContainer', undefined);
	private readonly listElement = $('div.inbox-notifications-list');
	private readonly scrollableElement = this._register(new DomScrollableElement(this.scrollableContentElement, {
		horizontal: ScrollbarVisibility.Hidden,
		vertical: ScrollbarVisibility.Auto,
		consumeMouseWheelIfScrollbarIsNeeded: true,
		className: 'inbox-notifications-scrollable',
	}));
	private readonly recentCardsElement = $('.inbox-notifications-section-cards');
	private readonly emptyListElement = $('.inbox-notifications-empty');
	private readonly cardVisibilityObserver: IntersectionObserver;
	private readonly visibleCardIds = new Set<string>();
	private renderedCards: HTMLElement[] = [];
	private renderedItems: readonly IInboxNotificationItem[] = [];
	private readonly cardRenderings = new Map<string, { signature: string; card: HTMLElement; store: DisposableStore }>();
	private readonly carouselModels = new Map<string, ChatQuestionCarouselData>();
	private readonly focusOutTimeout = this._register(new MutableDisposable());
	private readonly actionResetTimeout = this._register(new MutableDisposable());
	private readonly focusRestoreTimeout = this._register(new MutableDisposable());
	private readonly visibleCategories = observableValue<ReadonlySet<InboxFilterCategory>>('inboxNotificationsVisibleCategories', new Set(DEFAULT_VISIBLE_CATEGORIES));
	private deferredItems: readonly IInboxNotificationItem[] | undefined;
	private deferredNewNotificationsCount = 0;
	private announcedDeferredNewNotificationsCount = 0;
	private readonly deferredUpdatesBanner = $('div.inbox-notifications-deferred-updates.hidden');
	private readonly deferredUpdatesBannerLabel = $('span.inbox-notifications-deferred-updates-label');

	private readonly contentElement = $('div.inbox-notifications-content.no-detail');
	private readonly selectedTab = observableValue<InboxTab>(this, InboxTab.ReadyForYou);
	private readonly searchText = observableValue(this, '');
	private readonly composerElement = $('div.inbox-notifications-composer');
	private readonly composerLabel = $('div.inbox-notifications-composer-label');
	private readonly resizeObserver: DisposableResizeObserver;
	private readonly composerContentObservation = this._register(new MutableDisposable());
	private observedComposerContent: HTMLElement | undefined;
	private composerInitialization: Promise<void> | undefined;
	private selectedRowTab: InboxTab | undefined;
	private readonly newSessionElement = $('div.inbox-notifications-new-session');
	private readonly newSessionDisposables = this._register(new DisposableStore());
	private newSessionView: AbstractChatView | undefined;
	private readonly listPaneElement = $('div.inbox-notifications-list-pane');
	private readonly detailPaneElement = $('div.inbox-notifications-detail-pane');
	private readonly detailChatElement = $('div.inbox-notifications-detail-chat');
	private readonly detailChat = this._register(new MutableDisposable<AbstractChatView>());
	private readonly detailChatSubmissionListener = this._register(new MutableDisposable());
	private readonly detailChatNotifications = new Map<string, IInboxNotificationItem>();
	private detailChatBinding: { chat: IChat; session: ISession } | undefined;
	private selectedChatResource: URI | undefined;
	private renderedDetailItem: IInboxNotificationItem | undefined;
	private detailExchangeExpanded = false;
	private readonly detailContentElement = $('div.inbox-notifications-detail-content');
	private readonly detailInfoElement = $('div.inbox-notifications-detail-info');
	private readonly detailScrollableElement = this._register(new DomScrollableElement(this.detailContentElement, {
		horizontal: ScrollbarVisibility.Hidden,
		vertical: ScrollbarVisibility.Auto,
		consumeMouseWheelIfScrollbarIsNeeded: true,
		className: 'inbox-notifications-detail-scrollable',
	}));
	private readonly detailDisposables = this._register(new DisposableStore());
	private evidenceWidget: InboxEvidenceWidget | undefined;
	private evidenceCanvases: InboxCanvases | undefined;
	private readonly selectedItemId = observableValue<string | undefined>('inboxNotificationsSelected', undefined);
	private readonly inboxViewInstanceId = generateUuid();
	/** Wall-clock time this view instance was created, for relative event timestamps. */
	private readonly viewOpenedAtMs = Date.now();
	private interactionSequence = 0;
	/** The current click's correlation id, shared with any semantic interaction it triggers. */
	private currentActionId: string | undefined;
	/** When each notification card was first shown in this view instance, for response-latency telemetry. */
	private readonly itemFirstSeenMs = new Map<string, number>();
	/** When the view most recently gained focus, for dwell telemetry; undefined while blurred. */
	private viewFocusedAtMs: number | undefined;
	/** Notification ids already reported as impressions in this view instance (deduped across re-renders). */
	private readonly reportedImpressionIds = new Set<string>();
	private selectionTelemetryState: ISelectionTelemetryState | undefined;
	private detailSash: Sash | undefined;
	private listPaneWidth = DEFAULT_LIST_PANE_WIDTH;
	private hasCustomListPaneWidth = false;
	private layoutWidth = 0;
	private hasSplit = false;
	private lastDetailSignature: string | undefined;
	private toolbarLoadingSpinner: HTMLElement | undefined;
	private isInboxDataLoading = false;
	private hasReceivedInitialListUpdate = false;
	private startupSpinnerDeadline = 0;

	static getActiveInstance(): InboxNotificationsView | undefined {
		return InboxNotificationsView.activeInstance;
	}

	constructor(
		intersectionObserver: typeof IntersectionObserver = mainWindow.IntersectionObserver,
		resizeObserverCtor: typeof ResizeObserver | undefined = undefined,
		@IInboxNotificationsService private readonly inboxNotificationsService: IInboxNotificationsService,
		@IChatService private readonly chatService: IChatService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IDialogService private readonly dialogService: IDialogService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IMarkdownRendererService private readonly markdownRendererService: IMarkdownRendererService,
		@IGitHubService private readonly gitHubService: IGitHubService,
		@IAgentFeedbackService private readonly feedbackService: IAgentFeedbackService,
		@INotificationService private readonly notificationService: INotificationService,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IStorageService private readonly storageService: IStorageService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IChatViewFactory private readonly chatViewFactory: IChatViewFactory,
		@IHoverService private readonly hoverService: IHoverService,
		@ILabelService private readonly labelService: ILabelService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@IAgentWorkbenchLayoutService private readonly layoutService: IAgentWorkbenchLayoutService,
	) {
		super();
		this._register(runOnChange(this.sessionsService.navigationRequest, () => this.sessionsPaneVisibility.clear()));
		this._register(toDisposable(() => {
			for (const rendering of this.cardRenderings.values()) {
				rendering.store.dispose();
			}
			this.cardRenderings.clear();
			this.carouselModels.clear();
		}));
		this._register(addDisposableListener(this.scrollableContentElement, EventType.SCROLL, () => {
			this.scrollableElement.setScrollPosition({ scrollTop: this.scrollableContentElement.scrollTop });
		}));
		this._register(addDisposableListener(this.detailContentElement, EventType.SCROLL, () => {
			this.detailScrollableElement.setScrollPosition({ scrollTop: this.detailContentElement.scrollTop });
		}));
		const resizeObserver = this.resizeObserver = this._register(new DisposableResizeObserver('InboxNotificationsView.scroll', () => {
			this.scrollableElement.scanDomNode();
			this.detailScrollableElement.scanDomNode();
			this.layoutComposer();
		}, getWindow(this.listElement), { resizeObserverCtor }));
		this._register(resizeObserver.observe(this.listElement));
		this._register(resizeObserver.observe(this.scrollableContentElement));
		this._register(resizeObserver.observe(this.detailContentElement));
		this._register(resizeObserver.observe(this.detailInfoElement));
		this._register(resizeObserver.observe(this.detailChatElement));
		this._register(resizeObserver.observe(this.newSessionElement));
		this.cardVisibilityObserver = new intersectionObserver(entries => {
			for (const entry of entries) {
				if (!isHTMLElement(entry.target) || this._store.isDisposed || !this.visible.get()) {
					continue;
				}
				const index = this.renderedCards.indexOf(entry.target);
				const id = entry.target.dataset.notificationId;
				if (!id || index < 0) {
					continue;
				}
				if (!entry.isIntersecting) {
					this.visibleCardIds.delete(id);
					continue;
				}
				const item = this.getItemById(id);
				if (!item) {
					continue;
				}
				this.visibleCardIds.add(id);
				if (!this.itemFirstSeenMs.has(id)) {
					this.itemFirstSeenMs.set(id, Date.now());
				}
				this.reportImpression(item, index);
				this.inboxNotificationsService.requestPreview(item);
			}
		}, { root: this.scrollableElement.getDomNode() });
		this._register(toDisposable(() => this.cardVisibilityObserver.disconnect()));
		InboxNotificationsView.activeInstance = this;
		this.description = this.inboxNotificationsService.sessionRows.map(items => {
			if (items.length === 0) {
				return localize('inboxNotifications.description.empty', "No active notifications.");
			}
			return items.length === 1
				? localize('inboxNotifications.description.single', "1 notification")
				: localize('inboxNotifications.description.plural', "{0} notifications", items.length);
		});
	}

	override dispose(): void {
		this.setVisible(false);
		if (InboxNotificationsView.activeInstance === this) {
			InboxNotificationsView.activeInstance = undefined;
		}
		super.dispose();
	}

	setVisible(visible: boolean): void {
		if (!visible && !this._store.isDisposed) {
			this.sessionsPaneVisibility.clear();
		}
		if (this.visible.get() === visible || this._store.isDisposed) {
			return;
		}
		this.visible.set(visible, undefined);
		if (visible) {
			this.visibleSince = Date.now();
			InboxNotificationsView.activeInstance = this;
			this.logViewState('opened');
		} else {
			this.focusContext?.reset();
			if (this.viewFocusedAtMs !== undefined) {
				this.logViewState('blur', Date.now() - this.viewFocusedAtMs);
				this.viewFocusedAtMs = undefined;
			}
			this.endSelectionTelemetry('viewDispose');
			this.logViewState('closed', Date.now() - this.visibleSince);
			if (InboxNotificationsView.activeInstance === this) {
				InboxNotificationsView.activeInstance = undefined;
			}
		}
		this.detailChat.value?.setVisible(visible && !!this.detailChatBinding);
		this.detailChat.value?.setActive(visible && !!this.detailChatBinding);
		const composerVisible = visible && this.newSessionElement.classList.contains('visible');
		this.newSessionView?.setVisible(composerVisible);
		this.newSessionView?.setActive(composerVisible);
		this.evidenceCanvases?.setVisible(visible);
	}

	focus(): void {
		this.hideSessionsPane();
		if (!this.focusSelectedCard()) {
			this.renderedCards[0]?.focus();
			if (!this.renderedCards.length) {
				this.container?.focus();
			}
		}
	}

	private hideSessionsPane(): void {
		if (!this.sessionsPaneVisibility.value && this.layoutService.isVisible(Parts.SESSIONS_PART)) {
			this.sessionsPaneVisibility.value = toDisposable(() => this.layoutService.setPartHidden(false, Parts.SESSIONS_PART));
			this.layoutService.setPartHidden(true, Parts.SESSIONS_PART);
		}
	}

	/** Logs an inbox view lifecycle transition (opened/closed/focus/blur) for dwell and trajectory. */
	private logViewState(state: 'opened' | 'closed' | 'focus' | 'blur', dwellMs?: number): void {
		this.telemetryService.publicLog2<InboxViewStateTelemetryEvent, InboxViewStateTelemetryClassification>('agents/inboxViewState', {
			state,
			dwellMs,
			visibleItemCount: this.renderedCards.length,
			sortMode: this.sortModeId(),
			filterActive: this.isDefaultVisibleCategories(this.visibleCategories.get()) ? 'no' : 'yes',
			msSinceViewOpen: Date.now() - this.viewOpenedAtMs,
			viewInstanceId: this.inboxViewInstanceId,
			sequence: ++this.interactionSequence,
		});
	}

	/** Logs a single discrete click with its coarse location and card context; never continuous movement. */
	private logClick(container: HTMLElement, event: MouseEvent): void {
		const target = isHTMLElement(event.target) ? event.target : undefined;
		if (!target) {
			return;
		}
		const rect = container.getBoundingClientRect();
		// Coarse 0-9 bins (a 10x10 grid), not exact coordinates.
		const relX = rect.width > 0 ? clamp(Math.floor(((event.clientX - rect.left) / rect.width) * 10), 0, 9) : -1;
		const relY = rect.height > 0 ? clamp(Math.floor(((event.clientY - rect.top) / rect.height) * 10), 0, 9) : -1;
		const card = target.closest<HTMLElement>('.inbox-notifications-item');
		const item = card?.dataset.notificationId ? this.getItemById(card.dataset.notificationId) : undefined;
		const context = item ? this.inboxNotificationsService.getInteractionTelemetryContext(item) : { agentSessionId: 'none', providerId: 'none' };
		// Keep the correlation alive across native event listener microtask checkpoints.
		// The container's bubble listener clears it after the control handlers.
		const actionId = generateUuid();
		this.currentActionId = actionId;
		this.actionResetTimeout.value = disposableTimeout(() => { this.currentActionId = undefined; }, 0);
		this.telemetryService.publicLog2<InboxClickTelemetryEvent, InboxClickTelemetryClassification>('agents/inboxClick', {
			targetKind: this.clickTargetKind(target),
			relX,
			relY,
			actionId,
			notificationKind: item?.kind ?? 'none',
			priorityTier: this.priorityTierId(item),
			hasSession: item?.sessionResource ? 'yes' : 'no',
			agentSessionId: context.agentSessionId,
			providerId: context.providerId,
			sortMode: this.sortModeId(),
			filterActive: this.isDefaultVisibleCategories(this.visibleCategories.get()) ? 'no' : 'yes',
			msSinceViewOpen: Date.now() - this.viewOpenedAtMs,
			viewInstanceId: this.inboxViewInstanceId,
			sequence: ++this.interactionSequence,
		});
	}

	/** Bounded category of the element a click landed on. */
	private clickTargetKind(target: HTMLElement): string {
		if (target.closest('.inbox-notifications-section-header')) { return 'sectionHeader'; }
		if (target.closest('.inbox-notifications-filter-button')) { return 'filterButton'; }
		if (target.closest('.inbox-notifications-feedback-button')) { return 'feedbackButton'; }
		if (target.closest('.inbox-notifications-sort-buttons') && target.closest('.monaco-button')) { return 'sortButton'; }
		if (target.closest('.inbox-notifications-item')) { return target.closest('.monaco-button') ? 'actionButton' : 'card'; }
		if (target.closest('.inbox-notifications-detail-pane')) { return 'detailPane'; }
		if (target.closest('.inbox-notifications-empty')) { return 'emptyState'; }
		if (target.closest('.inbox-notifications-list')) { return 'listBackground'; }
		return 'other';
	}

	render(container: HTMLElement): void {
		this.container = container;
		container.classList.add('inbox-notifications-view');
		container.tabIndex = -1;
		if (!this.listElement.parentElement) {
			this.scrollableContentElement.appendChild(this.listElement);
		}

		const focusContext = this.focusContext = InboxCanvasFocusContext.bindTo(this.contextKeyService);
		const focusTracker = this._register(trackFocus(container));
		this._register(focusTracker.onDidFocus(() => {
			this.hideSessionsPane();
			focusContext.set(true);
			this.viewFocusedAtMs = Date.now();
			this.logViewState('focus');
		}));
		this._register(focusTracker.onDidBlur(() => {
			focusContext.set(false);
			if (this.viewFocusedAtMs === undefined) {
				return;
			}
			const dwellMs = Date.now() - this.viewFocusedAtMs;
			this.viewFocusedAtMs = undefined;
			this.logViewState('blur', dwellMs);
		}));
		this.logViewState('opened');
		// Discrete click trajectory only — never mousemove/hover/scroll, which would be too frequent.
		this._register(addDisposableListener(container, EventType.CLICK, event => this.logClick(container, event), true));
		this._register(addDisposableListener(container, EventType.CLICK, () => {
			this.currentActionId = undefined;
			this.actionResetTimeout.clear();
		}));
		this._register({
			dispose: () => focusContext.reset(),
		});

		this.contentElement.appendChild(this.listPaneElement);
		this.contentElement.appendChild(this.detailPaneElement);
		this.detailPaneElement.appendChild(this.detailScrollableElement.getDomNode());
		this.detailContentElement.appendChild(this.detailInfoElement);
		this.composerElement.appendChild(this.composerLabel);
		this.composerElement.appendChild(this.newSessionElement);
		this.composerElement.appendChild(this.detailChatElement);
		this.detailChatElement.setAttribute('role', 'region');
		this.detailChatElement.setAttribute('aria-label', localize('inboxNotifications.detail.chat', "Reply to the selected session"));
		this.detailContentElement.tabIndex = -1;
		this.detailContentElement.setAttribute('role', 'region');
		this.detailContentElement.setAttribute('aria-label',
			localize('inboxNotifications.detail.ariaLabel.empty', "Notification details. Select a notification to see its details."));
		this.newSessionElement.setAttribute('role', 'region');
		this.newSessionElement.setAttribute('aria-label', localize('inboxNotifications.newSession', "New session"));
		const header = container.appendChild($('.inbox-notifications-header'));
		const hour = new Date().getHours();
		header.appendChild($('h2.inbox-notifications-greeting', undefined, hour < 12
			? localize('inbox.greeting.morning', "Good morning")
			: hour < 18 ? localize('inbox.greeting.afternoon', "Good afternoon") : localize('inbox.greeting.evening', "Good evening")));
		container.appendChild(this.contentElement);
		container.appendChild(this.composerElement);
		this.loadListPaneWidth();
		this.createDetailSash();

		const toolbar = header.appendChild($('.inbox-notifications-toolbar'));
		const tabs = toolbar.appendChild($('.inbox-notifications-tabs', { role: 'tablist', 'aria-label': localize('inbox.tabs', "Session workflow") }));
		const tabValues = [InboxTab.ReadyForYou, InboxTab.Working, InboxTab.ReadyToMerge, InboxTab.OnHold, InboxTab.Done];
		const tabButtons = tabValues.map(tab => {
			const button = this._register(new Button(tabs, { ...inboxButtonStyles, secondary: true, small: true }));
			button.element.setAttribute('role', 'tab');
			button.element.id = `${this.inboxViewInstanceId}-${tab}`;
			button.element.setAttribute('aria-controls', `${this.inboxViewInstanceId}-list`);
			this._register(button.onDidClick(() => {
				this.clearSelectedItem('tabChanged');
				this.selectedTab.set(tab, undefined);
			}));
			this._register(autorun(reader => {
				const count = this.inboxNotificationsService.sessionRows.read(reader).filter(row => row.tab === tab).length;
				const active = this.selectedTab.read(reader) === tab;
				button.label = localize('inbox.tab.count', "{0} {1}", getInboxTabLabel(tab), count);
				button.element.setAttribute('aria-selected', String(active));
				button.element.tabIndex = active ? 0 : -1;
				button.element.classList.toggle('active', active);
			}));
			return button;
		});
		this._register(addDisposableListener(tabs, EventType.KEY_DOWN, event => {
			const index = tabButtons.findIndex(button => button.element === event.target);
			if (index < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
				return;
			}
			event.preventDefault();
			const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabValues.length - 1
				: (index + (event.key === 'ArrowRight' ? 1 : -1) + tabValues.length) % tabValues.length;
			this.clearSelectedItem('tabChanged');
			this.selectedTab.set(tabValues[next], undefined);
			tabButtons[next].focus();
		}));
		const search = this._register(new InputBox(toolbar, undefined, {
			inputBoxStyles: defaultInputBoxStyles,
			placeholder: localize('inbox.search', "Search"),
			ariaLabel: localize('inbox.search.aria', "Search sessions in this tab"),
		}));
		search.element.classList.add('inbox-notifications-search');
		this._register(search.onDidChange(value => this.searchText.set(value, undefined)));
		const newSessionButton = this._register(new Button(toolbar, { ...inboxButtonStyles, secondary: true, small: true }));
		newSessionButton.label = localize('inboxNotifications.newSession.button', "New Session");
		this._register(newSessionButton.onDidClick(() => {
			void this.openNewSession().catch(onUnexpectedError);
		}));
		const sortButtons = toolbar.appendChild($('.inbox-notifications-sort-buttons'));
		const sortByPriorityButton = this._register(new Button(sortButtons, {
			...inboxButtonStyles,
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
			...inboxButtonStyles,
			secondary: true,
			small: true,
			ariaLabel: localize('inboxNotifications.sort.recencyAria', "Recent, sort notifications by recency"),
		}));
		sortByRecencyButton.label = localize('inboxNotifications.sort.recency', "Recent");
		this._register(sortByRecencyButton.onDidClick(() => {
			this.inboxNotificationsService.setSortMode(InboxNotificationsSortMode.Recency);
			this.logInboxInteraction('sort.recent', 'toolbar');
		}));

		const filterButton = this._register(new Button(sortButtons, {
			...inboxButtonStyles,
			secondary: true,
			small: true,
			supportIcons: true,
			ariaLabel: localize('inboxNotifications.filter.buttonAria', "Filter sessions by priority"),
		}));
		filterButton.element.classList.add('inbox-notifications-filter-button');
		filterButton.element.setAttribute('aria-haspopup', 'true');
		this._register(filterButton.onDidClick(() => this.showFilterMenu(filterButton.element)));

		this.ensureVisibleCategoriesLoaded();

		this._register(autorun(reader => {
			const sortMode = this.inboxNotificationsService.sortMode.read(reader);
			const prioritySelected = sortMode === InboxNotificationsSortMode.Priority;
			const recencySelected = !prioritySelected;
			sortByPriorityButton.checked = prioritySelected;
			sortByRecencyButton.checked = recencySelected;
			sortByPriorityButton.element.classList.toggle('active', prioritySelected);
			sortByRecencyButton.element.classList.toggle('active', recencySelected);
			sortByPriorityButton.element.setAttribute('aria-pressed', String(prioritySelected));
			sortByRecencyButton.element.setAttribute('aria-pressed', String(recencySelected));

			const visible = this.visibleCategories.read(reader);
			const filtered = !this.isDefaultVisibleCategories(visible);
			filterButton.label = filtered ? '$(filter-filled)' : '$(filter)';
			filterButton.element.classList.toggle('active', filtered);
			filterButton.element.setAttribute('aria-label', filtered
				? localize('inboxNotifications.filter.buttonAriaActive', "Filter sessions by priority (filter active)")
				: localize('inboxNotifications.filter.buttonAria', "Filter sessions by priority"));
		}));

		const toolbarActions = toolbar.appendChild($('.inbox-notifications-toolbar-actions'));
		const toolbarLoadingSpinner = this.toolbarLoadingSpinner = toolbarActions.appendChild($('.inbox-notifications-toolbar-spinner.hidden'));
		toolbarLoadingSpinner.setAttribute('role', 'status');
		toolbarLoadingSpinner.setAttribute('aria-live', 'polite');
		toolbarLoadingSpinner.setAttribute('aria-label', localize('inboxNotifications.loading.ariaLabel', "Inbox is updating"));
		const toolbarLoadingSpinnerIcon = toolbarLoadingSpinner.appendChild($('span.codicon.codicon-loading.codicon-modifier-spin'));
		toolbarLoadingSpinnerIcon.setAttribute('aria-hidden', 'true');
		this.startupSpinnerDeadline = Date.now() + 900;
		this._register(disposableTimeout(() => this.updateToolbarLoadingSpinner(), 900));
		this._register(autorun(reader => {
			const isLoading = this.inboxNotificationsService.isLoading.read(reader);
			this.isInboxDataLoading = isLoading;
			this.updateToolbarLoadingSpinner();
		}));

		const usefulFeedbackButton = this._register(new Button(toolbarActions, {
			...inboxButtonStyles,
			secondary: true,
			small: true,
			ariaLabel: localize('inboxNotifications.feedback.usefulAria', "Inbox Was Useful, send positive feedback"),
		}));
		usefulFeedbackButton.label = localize('inboxNotifications.feedback.useful', "Inbox Was Useful");
		usefulFeedbackButton.element.classList.add('inbox-notifications-feedback-button');
		this._register(usefulFeedbackButton.onDidClick(() => {
			this.logInboxInteraction('feedback.useful', 'toolbar');
			this.maybeTriggerConfetti(usefulFeedbackButton.element);
			status(localize('inboxNotifications.feedback.thanks', "Thanks for your feedback."));
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
		list.id = `${this.inboxViewInstanceId}-list`;
		list.setAttribute('role', 'tabpanel');
		list.setAttribute('aria-label', localize('inboxNotifications.listAriaLabel', "Prioritized notifications"));
		this.listContainer.set(list, undefined);
		this._register(addDisposableListener(list, EventType.FOCUS_IN, event => this.onListFocusIn(event)));
		this._register(addDisposableListener(list, EventType.FOCUS_OUT, () => {
			this.focusOutTimeout.value = disposableTimeout(() => {
				if (this.applyDeferredUpdates(false)) {
					this.logInboxInteraction('deferredUpdates.autoApply', 'inlineInput');
				}
			}, 0);
		}));
		this._register(addDisposableListener(this.detailInfoElement, EventType.FOCUS_OUT, () => {
			this.focusOutTimeout.value = disposableTimeout(() => {
				this.applyDeferredUpdates(false);
				this.renderDetailIfChanged();
			}, 0);
		}));
		this._register(addDisposableListener(list, EventType.KEY_DOWN, event => this.onListKeyDown(event)));
		this._register(addDisposableListener(this.detailPaneElement, EventType.KEY_DOWN, event => this.onDetailPaneKeyDown(event)));

		this._register(autorun(reader => {
			if (!this.visible.read(reader)) {
				return;
			}
			const tab = this.selectedTab.read(reader);
			const query = this.searchText.read(reader).toLocaleLowerCase().trim();
			const rows = this.inboxNotificationsService.sessionRows.read(reader);
			const selectedId = this.selectedItemId.read(reader);
			const selected = rows.find(row => row.id === selectedId);
			if (selectedId && (!selected || selected.tab !== this.selectedRowTab)) {
				this.clearSelectedItem('workflowChanged');
			}
			const previews = this.inboxNotificationsService.previews.read(reader);
			const items = rows.filter(row => row.tab === tab && (!query || [
				row.title, row.sessionTitle, row.repositoryLabel, row.previewSignature && previews.get(row.previewSignature),
			].filter(Boolean).join(' ').toLocaleLowerCase().includes(query)));
			this.visibleCategories.read(reader);
			this.inboxNotificationsService.sortMode.read(reader);
			this.handleNotificationListUpdate(items);
		}));

		this._register(autorun(reader => {
			if (!this.visible.read(reader)) {
				return;
			}
			this.selectedItemId.read(reader);
			this.inboxNotificationsService.sessionRows.read(reader);
			this.renderDetailIfChanged(reader);
		}));
		void this.ensureNewSessionComposer().catch(onUnexpectedError);
	}

	private handleNotificationListUpdate(items: readonly IInboxNotificationItem[]): void {
		if (!this.hasReceivedInitialListUpdate) {
			this.hasReceivedInitialListUpdate = true;
			this.updateToolbarLoadingSpinner();
		}
		const newNotificationCount = this.countNewNotifications(this.renderedItems, items);
		if (this.isInlineInputFocused() && items.some(item => item.id === this.selectedItemId.get() && item.needsInputPart)) {
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
		if (this._store.isDisposed || !this.deferredItems) {
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
			this.updateToolbarLoadingSpinner();
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
		this.updateToolbarLoadingSpinner();
	}

	private updateToolbarLoadingSpinner(): void {
		if (!this.toolbarLoadingSpinner) {
			return;
		}
		const showDeferredIndicator = !!this.deferredItems && this.deferredNewNotificationsCount > 0;
		const showStartupIndicator = !this.hasReceivedInitialListUpdate || Date.now() < this.startupSpinnerDeadline;
		this.toolbarLoadingSpinner.classList.toggle('hidden', !(this.isInboxDataLoading || showDeferredIndicator || showStartupIndicator));
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
			&& this.detailInfoElement.contains(activeElement)
			&& !!activeElement.closest('.inbox-notifications-chat-part-host');
	}

	private renderList(items: readonly IInboxNotificationItem[]): void {
		const list = this.listContainer.get();
		if (!list || this._store.isDisposed) {
			return;
		}

		const previousListScrollTop = this.scrollableElement.getScrollPosition().scrollTop;
		const previouslyFocusedElement = getActiveElement();
		const hadFocusWithinList = isHTMLElement(previouslyFocusedElement) && list.contains(previouslyFocusedElement);
		const previouslyFocusedCard = hadFocusWithinList
			? previouslyFocusedElement.closest<HTMLElement>('.inbox-notifications-item')
			: undefined;
		const focusedNotificationId = previouslyFocusedCard?.dataset.notificationId;
		const focusedCardIndex = previouslyFocusedCard
			? this.renderedCards.findIndex(card => card === previouslyFocusedCard)
			: -1;

		this.cardVisibilityObserver.disconnect();
		this.visibleCardIds.clear();

		this.pruneAttentionTrackingMaps(items);

		this.renderedCards = [];

		const visible = this.visibleCategories.get();
		const knownIds = new Set(items.map(item => item.id));
		for (const [id, rendering] of this.cardRenderings) {
			if (!knownIds.has(id)) {
				rendering.store.dispose();
				this.cardRenderings.delete(id);
				this.carouselModels.delete(id);
			}
		}
		const activeItems = items.filter(item => visible.has(priorityCategory(item.priority)));
		const hasVisibleItems = activeItems.length > 0;
		this.updateSplit(!!this.selectedItemId.get());
		list.setAttribute('aria-labelledby', `${this.inboxViewInstanceId}-${this.selectedTab.get()}`);
		const sections: HTMLElement[] = [];
		if (!hasVisibleItems) {
			const hiddenByFilter = items.length > 0 || !!this.searchText.get();
			const empty = this.emptyListElement;
			empty.textContent = hiddenByFilter
				? localize('inboxNotifications.empty.filtered', "No notifications match the current filter.")
				: localize('inboxNotifications.empty', "You're all caught up.");
			sections.push(empty);
		} else {
			const cards = this.recentCardsElement;
			cards.setAttribute('role', 'list');
			cards.setAttribute('aria-label', localize('inboxNotifications.listAriaLabel', "Prioritized notifications"));
			reconcileChildren(cards, activeItems.map(item => this.renderCard(item)));
			sections.push(cards);
		}
		reconcileChildren(list, sections);
		if (!sections.includes(this.recentCardsElement)) {
			reconcileChildren(this.recentCardsElement, []);
		}

		const selectedId = this.selectedItemId.get();
		if (selectedId && !this.detailChat.value && !this.renderedCards.some(card => card.dataset.notificationId === selectedId)) {
			this.clearSelectedItem('itemRemoved');
		}
		for (const [id, rendering] of this.cardRenderings) {
			rendering.card.classList.toggle('selected', id === this.selectedItemId.get());
		}

		this.applyCardTabStops(focusedNotificationId, focusedCardIndex);
		if (hadFocusWithinList) {
			const target = previouslyFocusedElement.isConnected ? previouslyFocusedElement
				: this.getNotificationCards().find(card => card.tabIndex === 0);
			target?.focus({ preventScroll: true });
		}

		this.scrollableElement.scanDomNode();
		this.scrollableElement.setScrollPosition({ scrollTop: previousListScrollTop });
	}

	private renderCard(item: IInboxNotificationItem): HTMLElement {
		const signature = safeStringify(item);
		let rendering = this.cardRenderings.get(item.id);
		if (!rendering || rendering.signature !== signature) {
			rendering?.store.dispose();
			const store = new DisposableStore();
			try {
				const card = this.renderItem(item, store);
				rendering = { signature, card, store };
				this.cardRenderings.set(item.id, rendering);
			} catch (error) {
				store.dispose();
				throw error;
			}
		}
		const card = rendering.card;
		card.classList.toggle('selected', item.id === this.selectedItemId.get());
		this.renderedCards.push(card);
		this.cardVisibilityObserver.observe(card);
		return card;
	}

	/** Logs a one-per-notification impression the first time its card is shown in this view instance. */
	private reportImpression(item: IInboxNotificationItem, listIndex: number): void {
		if (this.reportedImpressionIds.has(item.id)) {
			return;
		}
		this.reportedImpressionIds.add(item.id);
		const telemetryContext = this.inboxNotificationsService.getInteractionTelemetryContext(item);
		const metadata = this.itemMetadata(item);
		this.telemetryService.publicLog2<InboxImpressionTelemetryEvent, InboxImpressionTelemetryClassification>('agents/inboxImpression', {
			notificationKind: item.kind,
			priorityTier: this.priorityTierId(item),
			listIndex,
			hasSession: item.sessionResource ? 'yes' : 'no',
			agentSessionId: telemetryContext.agentSessionId,
			providerId: telemetryContext.providerId,
			sortMode: this.sortModeId(),
			filterActive: this.isDefaultVisibleCategories(this.visibleCategories.get()) ? 'no' : 'yes',
			needsInput: metadata.needsInput,
			pullRequestStateCount: metadata.pullRequestStateCount,
			repositoryPresent: metadata.repositoryPresent,
			itemAgeMs: metadata.itemAgeMs,
			msSinceViewOpen: Date.now() - this.viewOpenedAtMs,
			viewInstanceId: this.inboxViewInstanceId,
			sequence: ++this.interactionSequence,
		});
	}

	private ensureVisibleCategoriesLoaded(): void {
		const raw = this.storageService.get(VISIBLE_CATEGORIES_STORAGE_KEY, StorageScope.APPLICATION);
		if (raw === undefined) {
			return;
		}
		try {
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed)) {
				const categories = parsed.filter((value): value is InboxFilterCategory => FILTER_CATEGORIES.includes(value as InboxFilterCategory));
				this.visibleCategories.set(new Set(categories.length === 0 && parsed.includes('completed') ? DEFAULT_VISIBLE_CATEGORIES : categories), undefined);
			}
		} catch (error) {
			onUnexpectedError(error);
		}
	}

	private persistVisibleCategories(): void {
		this.storageService.store(
			VISIBLE_CATEGORIES_STORAGE_KEY,
			JSON.stringify([...this.visibleCategories.get()]),
			StorageScope.APPLICATION,
			StorageTarget.USER,
		);
	}

	private isDefaultVisibleCategories(categories: ReadonlySet<InboxFilterCategory>): boolean {
		return categories.size === DEFAULT_VISIBLE_CATEGORIES.length
			&& DEFAULT_VISIBLE_CATEGORIES.every(category => categories.has(category));
	}

	private setCategoryVisible(category: InboxFilterCategory, visible: boolean): void {
		const next = new Set(this.visibleCategories.get());
		if (visible) {
			next.add(category);
		} else {
			next.delete(category);
		}
		this.visibleCategories.set(next, undefined);
		this.persistVisibleCategories();
		this.logInboxInteraction(`filter.${category}.${visible ? 'on' : 'off'}`, 'toolbar');
	}

	private showFilterMenu(anchor: HTMLElement): void {
		const visible = this.visibleCategories.get();
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => FILTER_CATEGORIES.map(category => toAction({
				id: `inboxNotifications.filter.${category}`,
				label: filterCategoryLabel(category),
				checked: visible.has(category),
				run: () => this.setCategoryVisible(category, !visible.has(category)),
			})),
		});
	}

	private renderItem(item: IInboxNotificationItem, store: DisposableStore): HTMLElement {
		const card = $('.inbox-notifications-item');
		card.setAttribute('role', 'listitem');
		card.dataset.notificationId = item.id;
		card.setAttribute('aria-label', this.getCardAriaLabel(item));
		if (this.selectedItemId.get() === item.id) {
			card.classList.add('selected');
		}
		store.add(addDisposableListener(card, EventType.CLICK, event => {
			if (isHTMLElement(event.target) && !event.target.closest('a, button, input, textarea, select, [role="button"], .inbox-notifications-chat-part-host')) {
				if (this.selectedItemId.get() === item.id) {
					this.clearSelectedItem('cardClick');
				} else {
					this.selectItem(item.id, 'cardClick');
				}
			}
		}));
		store.add(addDisposableListener(card, EventType.KEY_DOWN, (event: KeyboardEvent) => {
			if ((event.key === 'Enter' || event.key === ' ') && !isEditableElement(event.target as HTMLElement) && event.target === card) {
				event.preventDefault();
				this.selectItem(item.id, 'cardKeyboard', true);
			}
		}));

		const row = this.getRow(item.id);
		const notificationKind = item.needsInputPart && item.needsInputPart.kind !== 'questionCarousel'
			? InboxNotificationKind.ConfirmationRequested : item.kind;
		const kindLabel = getInboxNotificationLabel({ ...(row ?? item), kind: notificationKind });
		const icon = card.appendChild(renderIcon(row?.tab === InboxTab.Working ? Codicon.loading
			: this.getNotificationIcon(notificationKind)));
		icon.classList.add('inbox-notifications-row-icon');
		icon.classList.toggle('codicon-modifier-spin', row?.tab === InboxTab.Working);
		icon.setAttribute('aria-hidden', 'true');
		store.add(this.hoverService.setupDelayedHover(icon, {
			content: kindLabel, appearance: { showPointer: true },
		}, { groupId: 'inbox-notification-kind' }));
		const titles = card.appendChild($('.inbox-notifications-row-titles'));
		const title = titles.appendChild($('.inbox-notifications-item-title'));
		const sessionTitle = titles.appendChild($('.inbox-notifications-session-title', undefined, row?.sessionTitle ?? item.title));
		store.add(this.hoverService.setupDelayedHover(sessionTitle, { content: row?.sessionTitle ?? item.title }));
		store.add(this.hoverService.setupDelayedHover(title, () => ({ content: title.textContent ?? item.title })));
		store.add(autorun(reader => {
			const generated = item.previewSignature ? this.inboxNotificationsService.previews.read(reader).get(item.previewSignature) : undefined;
			title.textContent = generated || item.title;
			card.setAttribute('aria-label', [
				generated || item.title, row?.sessionTitle, kindLabel, row && getInboxTabLabel(row.tab),
				row?.hasImages ? localize('inbox.visual.aria', "Visual evidence available") : undefined,
				fromNowByDay(item.timestamp, true, true),
			].filter(Boolean).join('. '));
		}));
		const metadata = card.appendChild($('.inbox-notifications-row-metadata'));
		if (item.repositoryLabel) {
			const repository = metadata.appendChild($('.inbox-notifications-row-repository', undefined, item.repositoryLabel));
			store.add(this.hoverService.setupDelayedHover(repository, { content: item.repositoryLabel }));
		}
		if (row?.hasImages) {
			const visual = metadata.appendChild($('.inbox-notifications-visual'));
			visual.appendChild(renderIcon(Codicon.fileMedia)).setAttribute('aria-hidden', 'true');
			visual.appendChild($('span', undefined, localize('inbox.visual', "Visual")));
		}
		if (item.pullRequestStates?.length) {
			const pullRequests = metadata.appendChild($('.inbox-notifications-row-repository', undefined,
				item.pullRequestStates.map(state => state.label).join(', ')));
			store.add(this.hoverService.setupDelayedHover(pullRequests, {
				content: item.pullRequestStates.map(state => `${state.label}: ${state.statusLabel}`).join('\n'),
			}));
		}
		const state = card.appendChild($('.inbox-notifications-item-kind-label', undefined, kindLabel));
		state.classList.add(`priority-${item.priority}`);
		store.add(this.hoverService.setupDelayedHover(state, { content: kindLabel }));
		const trailing = card.appendChild($('.inbox-notifications-row-trailing'));
		const timestamp = trailing.appendChild($('.inbox-notifications-item-time', undefined, fromNowByDay(item.timestamp, true, true)));
		store.add(this.hoverService.setupDelayedHover(timestamp, { content: new Date(item.timestamp).toLocaleString() }));
		const actions = trailing.appendChild($('.inbox-notifications-row-actions'));
		if (row && row.tab !== InboxTab.Done) {
			card.classList.add('has-actions');
			const hold = store.add(new Button(actions, {
				...inboxButtonStyles, secondary: true, small: true, supportIcons: true,
				ariaLabel: row.tab === InboxTab.OnHold ? localize('inbox.resume', "Resume") : localize('inbox.hold', "Put on Hold")
			}));
			hold.label = row.tab === InboxTab.OnHold ? '$(play)' : '$(history)';
			store.add(hold.onDidClick(() => this.inboxNotificationsService.setSessionOnHold(row, row.tab !== InboxTab.OnHold)));
			this.renderActionButton(actions, row, { id: 'done', label: '$(check)', ariaLabel: localize('inbox.done', "Mark Session as Done"), kind: InboxNotificationActionKind.MarkDone }, store);
		}
		if (row) {
			store.add(addDisposableListener(card, EventType.CONTEXT_MENU, event => {
				event.preventDefault();
				this.contextMenuService.showContextMenu({
					getAnchor: () => card,
					getActions: () => [
						...(row.sessionResource ? [toAction({
							id: 'open', label: localize('inbox.openSession', "Open Session"),
							run: () => this.runAction(row, { id: 'open', label: localize('inbox.openSession', "Open Session"), kind: InboxNotificationActionKind.OpenSession })
						})] : []),
						...(row.tab !== InboxTab.Done ? [
							toAction({
								id: 'hold', label: row.tab === InboxTab.OnHold ? localize('inbox.resume', "Resume") : localize('inbox.hold', "Put on Hold"),
								run: () => this.inboxNotificationsService.setSessionOnHold(row, row.tab !== InboxTab.OnHold)
							}),
							toAction({ id: 'done', label: localize('inbox.done', "Mark Session as Done"), run: () => this.inboxNotificationsService.markSessionDone(row) }),
						] : []),
					],
				});
			}));
		}
		return card;
	}

	private renderNotificationDetails(item: IInboxNotificationItem, sessionTitle: string, store: DisposableStore): HTMLElement {
		const card = $('.inbox-notifications-notification');
		const heading = card.appendChild($('.inbox-notifications-item-header'));
		const titleGroup = heading.appendChild($('.inbox-notifications-item-title-group'));
		if (item.title !== sessionTitle) {
			titleGroup.appendChild($('.inbox-notifications-item-title', undefined, item.title));
		}
		const primaryActions = item.actions.filter(action =>
			action.kind !== InboxNotificationActionKind.OpenSession
			&& action.kind !== InboxNotificationActionKind.MarkDone
			&& action.kind !== InboxNotificationActionKind.Dismiss);
		const headerActions: IInboxNotificationAction[] = [];
		let footerActions: HTMLElement | undefined;
		if (primaryActions.length || headerActions.length) {
			const actionContainer = item.kind === InboxNotificationKind.PullRequestMerged
				? footerActions = $('.inbox-notifications-item-actions.inbox-notifications-item-footer-actions')
				: heading.appendChild($('.inbox-notifications-item-actions.inbox-notifications-item-header-actions'));
			for (const action of [...primaryActions, ...headerActions]) {
				const button = this.renderActionButton(actionContainer, item, action, store);
				if (action.kind === InboxNotificationActionKind.MarkDone) {
					button.element.classList.add('inbox-notifications-item-action-done');
				}
			}
		}

		if (!titleGroup.childElementCount && !primaryActions.length) {
			heading.remove();
		}
		const badges = card.appendChild($('.inbox-notifications-item-badges'));
		if (item.repositoryLabel) {
			badges.appendChild($('.inbox-notifications-item-badge.repository', undefined, item.repositoryLabel));
		}
		if (item.pullRequestStates?.length) {
			const multiple = item.pullRequestStates.length > 1;
			const group = multiple ? card.appendChild($('.inbox-notifications-item-pr-group')) : badges;
			const pullRequestStates = $('ul.inbox-notifications-item-pr-states');
			pullRequestStates.setAttribute('aria-label', localize('inboxNotifications.pullRequests', "Pull requests"));
			pullRequestStates.classList.toggle('inbox-notifications-item-pr-list', multiple);
			if (item.pullRequestStates.length > 3) {
				const label = localize('inboxNotifications.pullRequests.count', "{0} pull requests", item.pullRequestStates.length);
				const disclosure = store.add(new Button(group, {
					...inboxButtonStyles, secondary: true, small: true, supportIcons: true, ariaLabel: label,
				}));
				disclosure.element.classList.add('inbox-notifications-item-pr-toggle');
				disclosure.label = `$(chevron-right) ${label}`;
				disclosure.element.setAttribute('aria-expanded', 'false');
				pullRequestStates.id = generateUuid();
				disclosure.element.setAttribute('aria-controls', pullRequestStates.id);
				pullRequestStates.hidden = true;
				store.add(disclosure.onDidClick(() => {
					pullRequestStates.hidden = !pullRequestStates.hidden;
					disclosure.element.setAttribute('aria-expanded', String(!pullRequestStates.hidden));
					disclosure.label = `$(${pullRequestStates.hidden ? 'chevron-right' : 'chevron-down'}) ${label}`;
					this.scrollableElement.scanDomNode();
				}));
			}
			group.appendChild(pullRequestStates);
			const hoverLifecycleOptions = { groupId: generateUuid() };
			for (const pullRequestState of item.pullRequestStates) {
				const pullRequestStateElement = pullRequestStates.appendChild($('li.inbox-notifications-item-pr-state'));
				const pullRequestUri = pullRequestState.pullRequestUri;
				if (pullRequestUri) {
					const pullRequestButton = store.add(new Button(pullRequestStateElement, {
						...(multiple ? inboxButtonStyles : defaultButtonStyles),
						secondary: true,
						small: true,
						supportIcons: true,
						ariaLabel: localize('inboxNotifications.pullRequestStateLink.ariaLabel', "Open pull request {0}", pullRequestState.label),
					}));
					pullRequestButton.element.classList.add('inbox-notifications-item-pr-state-link');
					pullRequestButton.label = `$(${pullRequestState.icon.id}) ${pullRequestState.label}`;
					if (multiple) {
						store.add(this.hoverService.setupDelayedHover(pullRequestButton.element, {
							content: pullRequestState.label,
							appearance: { showPointer: true },
						}, hoverLifecycleOptions));
					}
					store.add(pullRequestButton.onDidClick(() => {
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

		const descriptionEl = card.appendChild($('.inbox-notifications-item-description'));
		descriptionEl.textContent = item.needsInputPart ? '' : this.distinctCardDescription(item, item.description);
		descriptionEl.hidden = !descriptionEl.textContent;
		card.setAttribute('aria-label', this.getCardAriaLabel(item, descriptionEl.textContent));
		this.renderNeedsInputPart(card, item, store);
		const session = item.sessionResource ? this.sessionsManagementService.getSession(item.sessionResource) : undefined;
		if (session?.artifacts) {
			const teaser = card.appendChild($('.inbox-evidence-note.inbox-evidence-teaser'));
			store.add(autorun(reader => {
				const chatResource = item.chatResource ?? item.needsInputPart?.chatResource;
				const chat = chatResource
					? session.chats.read(reader).find(chat => isEqual(chat.resource, chatResource))
					: session.mainChat.read(reader);
				const artifacts = chat ? getChatSessionArtifacts(session, chat, reader).filter(artifact => artifact.isArtifact) : [];
				teaser.hidden = artifacts.length === 0;
				teaser.textContent = artifacts.length ? localize('inbox.evidence.teaser', "{0} recorded artifacts · Select to inspect", artifacts.length) : '';
			}));
		}

		if (footerActions) {
			card.appendChild(footerActions);
		}
		return card;
	}

	private distinctCardDescription(item: IInboxNotificationItem, description: string): string {
		const normalize = (text: string) => text.trim().replace(/\s+/g, ' ');
		const visibleText = [item.title];
		if (item.needsInputPart?.kind === 'questionCarousel') {
			const message = item.needsInputPart.message;
			if (message) {
				visibleText.push(typeof message === 'string' ? message : renderAsPlaintext(message));
			}
			for (const question of item.needsInputPart.questions) {
				visibleText.push(question.title);
				for (const message of [question.message, question.detailedMessage]) {
					if (message) {
						visibleText.push(typeof message === 'string' ? message : renderAsPlaintext(message));
					}
				}
			}
		}
		return visibleText.some(text => normalize(text) === normalize(description)) ? '' : description;
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
			const titleText = typeof part.title === 'string' ? part.title : renderAsPlaintext(part.title);
			const messageText = typeof part.message === 'string' ? part.message : renderAsPlaintext(part.message);
			const hasDistinctMessage = part.commandLine
				? !titleText.includes(messageText.replace(/\s+/g, ' ').trim()) && messageText.trim() !== part.commandLine.trim()
				: messageText.trim() !== titleText.trim();
			const message = store.add(this.markdownRendererService.render(
				!hasDistinctMessage ? new MarkdownString()
					: typeof part.message === 'string' ? new MarkdownString(part.message) : part.message,
				getChatMarkdownRenderOptions(),
			));
			if (part.originMessage) {
				message.element.prepend(store.add(this.markdownRendererService.render(
					typeof part.originMessage === 'string' ? new MarkdownString(part.originMessage) : part.originMessage,
					getChatMarkdownRenderOptions(),
				)).element);
			}
			if (part.commandLine) {
				message.element.appendChild(store.add(this.markdownRendererService.render(
					new MarkdownString().appendCodeblock(part.commandLanguage ?? 'shellscript', part.commandLine),
					getChatMarkdownRenderOptions(),
				)).element);
			}
			if (part.toolInput !== undefined) {
				message.element.appendChild($('h4', undefined, localize('inboxNotifications.toolConfirmation.input', "Input")));
				message.element.appendChild(store.add(this.markdownRendererService.render(
					new MarkdownString().appendCodeblock('json', part.toolInput),
					getChatMarkdownRenderOptions(),
				)).element);
			}
			if (part.disclaimer) {
				message.element.appendChild(store.add(this.markdownRendererService.render(
					typeof part.disclaimer === 'string' ? new MarkdownString(part.disclaimer) : part.disclaimer,
					getChatMarkdownRenderOptions(),
				)).element);
			}
			if (!part.buttons.length) {
				message.element.appendChild($('p', undefined, localize('inboxNotifications.toolConfirmation.openSession', "Open the session to review the full request and respond.")));
			}
			const buttons = buildCustomOptionButtons(
				part.buttons.map((button, buttonIndex) => ({
					id: String(buttonIndex),
					label: button.label,
					kind: button.kind === 'deny' ? ConfirmationOptionKind.Deny : ConfirmationOptionKind.Approve,
					group: button.group,
				})),
				option => async () => {
					this.logInboxInteraction('submitToolConfirmation', 'inlineToolConfirmation', item);
					await this.submitToolConfirmationPart(item, part, Number(option.id));
				},
			);
			const commandLine = part.commandLine;
			if (commandLine && part.buttons.length) {
				const explanation = store.add(this.instantiationService.createInstance(
					ChatTerminalToolExplanation, part.chatResource, part.requestId, () => commandLine,
				)).button;
				if (explanation) {
					buttons.push(explanation);
				}
			}
			const toolConfirmationWidget = store.add(this.instantiationService.createInstance(
				ChatCustomConfirmationWidget<() => Promise<void>>,
				this.createChatContentPartRenderContext(),
				{
					title: part.title,
					icon: part.commandLine ? Codicon.terminal : undefined,
					message: message.element,
					buttons,
				},
			));
			const host = container.appendChild($('.inbox-notifications-chat-part-host'));
			host.appendChild(toolConfirmationWidget.domNode);
			store.add(toolConfirmationWidget.onDidClick(({ button }) => {
				void button.data();
			}));
			return;
		}

		const liveCarousel = this.getNeedsInputRequestContext(part.chatResource, part.requestId)?.response.response.value
			.find(candidate => candidate.kind === 'questionCarousel' && candidate.resolveId === part.resolveId && !candidate.isUsed);
		let carousel = liveCarousel?.kind === 'questionCarousel' && liveCarousel instanceof ChatQuestionCarouselData ? liveCarousel : this.carouselModels.get(item.id);
		if (!carousel || carousel.resolveId !== part.resolveId) {
			carousel = new ChatQuestionCarouselData([...part.questions], part.allowSkip, part.resolveId, undefined, false, part.message);
		}
		this.carouselModels.set(item.id, carousel);
		const host = container.appendChild($('.inbox-notifications-chat-part-host.interactive-session'));
		const scopedContextKeyService = store.add(this.contextKeyService.createScoped(host));
		const scopedInstantiationService = store.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService])));
		const carouselWidget = store.add(scopedInstantiationService.createInstance(
			ChatQuestionCarouselPart,
			carousel,
			this.createChatContentPartRenderContext(),
			{
				shouldAutoFocus: false,
				hideDuplicateDetailedMessage: true,
				onSubmit: answers => {
					this.logInboxInteraction('submitQuestionCarousel', 'inlineQuestionCarousel', item);
					void this.submitQuestionCarouselPart(item, part, answers);
				},
			},
		));
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
			this.logInboxInteraction('submitConfirmation.result', 'inlineConfirmation', item, 'none', { result: 'success', durationMs: Date.now() - startTime, answerKind: buttonIndex === 0 ? 'approve' : 'deny' });
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
				...(button.id ? {
					selectedButton: button.id,
					selectedButtonKind: button.kind === 'deny' ? ConfirmationOptionKind.Deny : ConfirmationOptionKind.Approve,
				} : {}),
			}
			: { type: ToolConfirmKind.Skipped as const, source: 'user' as const };
		const details = getInboxToolConfirmationDetails(toolInvocation);
		const didConfirm = !details.requiresSession
			&& part.confirmationKind === 'execution'
			&& details.commandLine === part.commandLine
			&& details.toolInput === part.toolInput
			&& safeStringify(details.disclaimer) === safeStringify(part.disclaimer)
			&& safeStringify(details.originMessage) === safeStringify(part.originMessage)
			&& IChatToolInvocation.confirmWith(toolInvocation, reason);
		if (!didConfirm) {
			this.logInboxInteraction('submitToolConfirmation.result', 'inlineToolConfirmation', item, 'none', { result: 'failure', durationMs: Date.now() - startTime });
			this.notificationService.error(localize('inboxNotifications.toolConfirmation.staleState', "This confirmation changed before your action was applied. Open the session and try again."));
			return;
		}
		await this.completeNeedsInputNotification(item);
		this.logInboxInteraction('submitToolConfirmation.result', 'inlineToolConfirmation', item, 'none', { result: 'success', durationMs: Date.now() - startTime, answerKind: button.kind });
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
		if (carouselPart instanceof ChatQuestionCarouselData) {
			carouselPart.dismiss(answersRecord);
		} else {
			carouselPart.data = answersRecord ?? {};
			carouselPart.isUsed = true;
		}
		this.chatService.notifyQuestionCarouselAnswer(part.requestId, part.resolveId, answersRecord);
		await this.completeNeedsInputNotification(item);
		const answerShape = this.classifyCarouselAnswers(answers);
		this.logInboxInteraction('submitQuestionCarousel.result', 'inlineQuestionCarousel', item, 'none', { result: 'success', durationMs: Date.now() - startTime, answerKind: answerShape.answerKind, answerCharCount: answerShape.answerCharCount });
	}

	/**
	 * Bounded shape of submitted carousel answers for telemetry: whether the user picked options,
	 * typed free text (and how many characters — never the text itself), or skipped.
	 */
	private classifyCarouselAnswers(answers: Map<string, IChatQuestionAnswerValue> | undefined): { answerKind: InboxAnswerKind; answerCharCount: number } {
		if (!answers || answers.size === 0) {
			return { answerKind: 'skip', answerCharCount: 0 };
		}
		let answerCharCount = 0;
		let hasFreeText = false;
		for (const value of answers.values()) {
			const text = typeof value === 'string' ? value : value.freeformValue;
			if (typeof text === 'string') {
				hasFreeText = true;
				answerCharCount += text.length;
			}
		}
		return { answerKind: hasFreeText ? 'freeText' : 'option', answerCharCount };
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
		await this.markDone(item, undefined);
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
		const nextId = cards[nextIndex].dataset.notificationId;
		if (nextId) {
			this.selectItem(nextId, 'cardKeyboard');
		}
		cards[nextIndex].focus();
	}

	private onDetailPaneKeyDown(event: KeyboardEvent): void {
		if (event.key !== 'Escape') {
			return;
		}

		const target = event.target;
		if (!isHTMLElement(target) || !this.detailPaneElement.contains(target) || !this.shouldHandleDetailPaneEscape(target)) {
			return;
		}

		this.focusSelectedCard();
		event.preventDefault();
		event.stopPropagation();
		this.clearSelectedItem('escape');
	}

	private shouldHandleDetailPaneEscape(target: HTMLElement): boolean {
		if (this.detailChatElement.contains(target)) {
			return false;
		}
		if (target.isContentEditable) {
			return false;
		}
		const tagName = target.tagName.toLowerCase();
		return tagName !== 'input' && tagName !== 'textarea' && tagName !== 'select';
	}

	private isInlineFormInputElement(element: HTMLElement): boolean {
		return isEditableElement(element) || element.tagName.toLowerCase() === 'select' || element.isContentEditable;
	}

	private applyCardTabStops(preferredNotificationId: string | undefined, preferredIndex = -1): void {
		const cards = this.getNotificationCards();
		if (cards.length === 0) {
			return;
		}

		const activeCard = preferredNotificationId
			? cards.find(card => card.dataset.notificationId === preferredNotificationId)
			: undefined;
		const fallbackCard = preferredIndex >= 0
			? cards[Math.min(preferredIndex, cards.length - 1)]
			: undefined;
		this.setActiveCard(activeCard ?? fallbackCard ?? cards[0]);
	}

	private setActiveCard(activeCard: HTMLElement): void {
		const cards = this.getNotificationCards();
		for (const card of cards) {
			const siblings = cards.filter(candidate => candidate.parentElement === card.parentElement);
			card.tabIndex = card === activeCard ? 0 : -1;
			card.setAttribute('aria-posinset', String(siblings.indexOf(card) + 1));
			card.setAttribute('aria-setsize', String(siblings.length));
		}
	}

	private getNotificationCards(): HTMLElement[] {
		return this.renderedCards;
	}

	private getNotificationIcon(kind: InboxNotificationKind) {
		switch (kind) {
			case InboxNotificationKind.ConfirmationRequested: return Codicon.shield;
			case InboxNotificationKind.NeedsInput: return Codicon.question;
			case InboxNotificationKind.FailingCI: return Codicon.error;
			case InboxNotificationKind.PassingCI: return Codicon.pass;
			case InboxNotificationKind.PullRequestMerged: return Codicon.gitMerge;
			case InboxNotificationKind.ReviewComments: return Codicon.commentDiscussion;
			case InboxNotificationKind.Completed: return Codicon.check;
			case InboxNotificationKind.External: return Codicon.bell;
		}
	}

	private priorityLabel(priority: InboxNotificationPriority): string {
		return getInboxNotificationPriorityLabel(priority);
	}

	private getCardAriaLabel(item: IInboxNotificationItem, description = item.description): string {
		const segments = [
			localize('inboxNotifications.itemAriaLabel.priority', "Priority {0}", this.priorityLabel(item.priority)),
			getInboxNotificationLabel(item),
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
		segments.push(item.title, description);
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
			let result: InboxInteractionResult;
			switch (action.kind) {
				case InboxNotificationActionKind.OpenSession: {
					if (!item.sessionResource) {
						logResult('skipped');
						return;
					}
					await this.sessionsService.openSession(item.sessionResource, { source: 'inbox' });
					result = 'success';
					break;
				}
				case InboxNotificationActionKind.AgentMergeFixCI:
				case InboxNotificationActionKind.AgentMergeAddressReviews:
				case InboxNotificationActionKind.AgentMergeMergePullRequest: {
					result = await this.runInboxPullRequestAction(item, action.kind);
					if (result === 'failure') {
						this.notificationService.error(localize('inboxNotifications.action.submitFailed', "Unable to run \"{0}\". Open the session and try again.", action.label));
					}
					break;
				}
				case InboxNotificationActionKind.ArchiveSession:
				case InboxNotificationActionKind.DeleteSession: {
					const animationTarget = sourceElement ? captureAnimationTarget(sourceElement) : undefined;
					result = await this.runMergedSessionCleanupAction(item, action.kind, enableAlways);
					if (result === 'success') {
						this.maybeTriggerConfetti(animationTarget);
					}
					break;
				}
				case InboxNotificationActionKind.MarkDone:
				case InboxNotificationActionKind.Dismiss:
					result = 'success';
					break;
				case InboxNotificationActionKind.Command:
					if (action.commandId) {
						await this.commandService.executeCommand(action.commandId, ...(action.commandArgs ?? []));
						result = 'success';
					} else {
						result = 'skipped';
					}
					break;
			}
			if (result === 'success') {
				if (action.kind === InboxNotificationActionKind.MarkDone) {
					const row = this.getRow(item.id);
					if (row) {
						this.maybeTriggerConfetti(sourceElement);
						this.inboxNotificationsService.markSessionDone(row);
					}
				} else if (action.kind === InboxNotificationActionKind.Dismiss) {
					this.inboxNotificationsService.dismissNotification(item.id, item);
				} else if (action.kind !== InboxNotificationActionKind.OpenSession) {
					await this.markDone(item, undefined);
				}
			}
			logResult(result);
		} catch (error) {
			logResult('failure');
			onUnexpectedError(error);
			this.notificationService.error(localize('inboxNotifications.actionError', "Unable to run inbox action."));
		}
	}

	private renderActionButton(container: HTMLElement, item: IInboxNotificationItem, action: IInboxNotificationAction, store: DisposableStore): IButton {
		const openSessionIsSecondary = action.kind === InboxNotificationActionKind.OpenSession;
		const showsSpinnerWhileRunning = isInboxPullRequestActionKind(action.kind);
		const baseOptions = {
			...inboxButtonStyles,
			secondary: openSessionIsSecondary || !action.primary,
			small: true,
			supportIcons: action.kind === InboxNotificationActionKind.MarkDone || showsSpinnerWhileRunning,
			title: action.kind === InboxNotificationActionKind.MarkDone
				? localize('inboxNotifications.action.markDoneTooltip', "Move this session to Done without archiving it")
				: openSessionIsSecondary && item.sessionResource ? false : action.ariaLabel ?? action.label,
			ariaLabel: localize('inboxNotifications.actionAriaLabel', "{0} for {1}", action.ariaLabel ?? action.label, item.title),
		};
		const canShowAlwaysDropdown = this.canShowAlwaysDropdown(item, action.kind);
		const button = canShowAlwaysDropdown
			? store.add(new ButtonWithDropdown(container, {
				...baseOptions,
				contextMenuProvider: this.contextMenuService,
				addPrimaryActionToDropdown: false,
				actions: [toAction({
					id: `${action.id}.always`,
					label: localize('inboxNotifications.action.always', "Always {0}", action.label),
					run: () => {
						this.logInboxInteraction('runActionAlways', 'actionDropdown', item, action.kind, { commandId: action.commandId ?? 'none' });
						return this.runAction(item, action, button.element, true);
					},
				})],
			}))
			: store.add(new Button(container, baseOptions));
		button.label = action.label;
		if (openSessionIsSecondary) {
			this.setupSessionPreviewHover(button.element, item, store);
		}
		if (button instanceof ButtonWithDropdown) {
			button.dropdownButton.setAriaLabel(localize('inboxNotifications.action.moreActions', "More Actions for {0}", action.label));
		}
		store.add(button.onDidClick(async () => {
			this.logInboxInteraction('runAction', 'actionButton', item, action.kind, { commandId: action.commandId ?? 'none' });
			if (!showsSpinnerWhileRunning) {
				void this.runAction(item, action, button.element);
				return;
			}
			// The action submits a request to the session in the background, which
			// can take a moment; show an inline spinner so the click clearly
			// registers instead of looking like nothing happened.
			button.enabled = false;
			button.label = `$(loading~spin) ${action.label}`;
			try {
				await this.runAction(item, action, button.element);
			} finally {
				button.label = action.label;
				button.enabled = true;
			}
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
		const telemetryContext = item
			? this.inboxNotificationsService.getInteractionTelemetryContext(item)
			: { agentSessionId: 'none', providerId: 'none' };
		const attention = this.itemAttentionContext(item);
		const metadata = this.itemMetadata(item);
		const sequence = ++this.interactionSequence;
		this.telemetryService.publicLog2<InboxInteractionTelemetryEvent, InboxInteractionTelemetryClassification>('agents/inboxInteraction', {
			interaction,
			trigger,
			result: options?.result ?? 'attempt',
			notificationKind,
			notificationActionKind: actionKind,
			hasSession,
			agentSessionId: telemetryContext.agentSessionId,
			providerId: telemetryContext.providerId,
			priorityTier: this.priorityTierId(item),
			answerKind: options?.answerKind ?? 'none',
			answerCharCount: options?.answerCharCount ?? 0,
			evidenceArtifactKind: options?.evidenceArtifactKind ?? 'none',
			listIndex: attention.listIndex,
			visibleItemCount: attention.visibleItemCount,
			sortMode: this.sortModeId(),
			filterActive: this.isDefaultVisibleCategories(this.visibleCategories.get()) ? 'no' : 'yes',
			msSinceItemFirstSeen: attention.msSinceItemFirstSeen,
			msSinceSelection: this.msSinceSelection(item),
			msSinceViewOpen: Date.now() - this.viewOpenedAtMs,
			actionId: this.currentActionId ?? generateUuid(),
			needsInput: metadata.needsInput,
			pullRequestStateCount: metadata.pullRequestStateCount,
			repositoryPresent: metadata.repositoryPresent,
			itemAgeMs: metadata.itemAgeMs,
			commandId: options?.commandId ?? 'none',
			viewInstanceId: this.inboxViewInstanceId,
			sequence,
			durationMs: options?.durationMs,
		});
	}

	/** Bounded, non-identifying metadata about a notification card for telemetry. */
	private itemMetadata(item?: IInboxNotificationItem): { needsInput: string; pullRequestStateCount: number; repositoryPresent: string; itemAgeMs: number } {
		if (!item) {
			return { needsInput: 'no', pullRequestStateCount: 0, repositoryPresent: 'no', itemAgeMs: -1 };
		}
		return {
			needsInput: item.needsInputPart ? 'yes' : 'no',
			pullRequestStateCount: item.pullRequestStates?.length ?? 0,
			repositoryPresent: item.repositoryLabel ? 'yes' : 'no',
			itemAgeMs: item.timestamp ? Math.max(0, Date.now() - item.timestamp) : -1,
		};
	}

	/** Milliseconds since the given item became the selected item, or undefined when it is not selected. */
	private msSinceSelection(item?: IInboxNotificationItem): number | undefined {
		const state = this.selectionTelemetryState;
		if (!item || !state || state.notificationId !== item.id) {
			return undefined;
		}
		return Date.now() - state.selectedAt;
	}

	/** Rank/latency context for the acted item within the currently visible list. */
	private itemAttentionContext(item?: IInboxNotificationItem): { listIndex: number; visibleItemCount: number; msSinceItemFirstSeen: number | undefined } {
		const cards = this.renderedCards;
		const listIndex = item ? cards.findIndex(card => card.dataset.notificationId === item.id) : -1;
		const firstSeen = item ? this.itemFirstSeenMs.get(item.id) : undefined;
		return {
			listIndex,
			visibleItemCount: cards.length,
			msSinceItemFirstSeen: firstSeen !== undefined ? Date.now() - firstSeen : undefined,
		};
	}

	/** Bounded active sort-mode identifier for telemetry. */
	private sortModeId(): 'priority' | 'recent' {
		return this.inboxNotificationsService.sortMode.get() === InboxNotificationsSortMode.Priority ? 'priority' : 'recent';
	}

	/**
	 * Drops attention-tracking entries for notifications that no longer exist (resolved/removed) so
	 * the maps stay bounded over a long-lived view. Uses the full active + completed universe, not
	 * the filtered view, so hiding a category via the filter does not reset an item's first-seen time.
	 */
	private pruneAttentionTrackingMaps(activeItems: readonly IInboxNotificationItem[]): void {
		const known = new Set<string>();
		for (const item of activeItems) {
			known.add(item.id);
		}
		for (const item of this.inboxNotificationsService.dismissedNotifications.get()) {
			known.add(item.id);
		}
		for (const id of this.itemFirstSeenMs.keys()) {
			if (!known.has(id)) {
				this.itemFirstSeenMs.delete(id);
			}
		}
		for (const id of this.reportedImpressionIds) {
			if (!known.has(id)) {
				this.reportedImpressionIds.delete(id);
			}
		}
	}

	/** Bounded priority-tier identifier for telemetry, or 'none' when there is no item. */
	private priorityTierId(item?: IInboxNotificationItem): 'now' | 'next' | 'later' | 'none' {
		switch (item?.priority) {
			case InboxNotificationPriority.Now: return 'now';
			case InboxNotificationPriority.Next: return 'next';
			case InboxNotificationPriority.Later: return 'later';
			default: return 'none';
		}
	}

	private canShowAlwaysDropdown(item: IInboxNotificationItem, actionKind: InboxNotificationActionKind): actionKind is InboxMergedSessionCleanupActionKind {
		if (isInboxMergedSessionCleanupActionKind(actionKind)) {
			return this.isAgentHostSession(item) && !this.isMergedSessionCleanupAlwaysEnabled(actionKind);
		}
		return false;
	}

	private isAgentHostSession(item: IInboxNotificationItem): boolean {
		if (!item.sessionResource) {
			return false;
		}
		const session = this.sessionsManagementService.getSession(item.sessionResource);
		return !!session && isAgentHostProviderId(session.providerId);
	}

	private isMergedSessionCleanupAlwaysEnabled(actionKind: InboxMergedSessionCleanupActionKind): boolean {
		const archiveAfterDays = this.getExplicitlyConfiguredNumber(AUTO_MARK_AS_DONE_MERGED_SESSIONS_AFTER_DAYS_SETTING) ?? 0;
		const deleteAfterDays = this.getExplicitlyConfiguredNumber(AUTO_DELETE_MARKED_AS_DONE_MERGED_SESSIONS_AFTER_DAYS_SETTING) ?? 0;
		switch (actionKind) {
			case InboxNotificationActionKind.ArchiveSession:
				return archiveAfterDays > 0;
			case InboxNotificationActionKind.DeleteSession:
				return archiveAfterDays > 0 && deleteAfterDays > 0;
		}
	}

	private getExplicitlyConfiguredNumber(settingId: string): number | undefined {
		const inspect = this.configurationService.inspect<number>(settingId);
		const configuredValues = [
			inspect.applicationValue,
			inspect.userValue,
			inspect.userLocalValue,
			inspect.userRemoteValue,
			inspect.workspaceValue,
			inspect.workspaceFolderValue,
			inspect.memoryValue,
			inspect.policyValue,
		];
		for (const configuredValue of configuredValues) {
			if (typeof configuredValue === 'number') {
				return configuredValue;
			}
		}
		return undefined;
	}

	private async runMergedSessionCleanupAction(item: IInboxNotificationItem, actionKind: InboxMergedSessionCleanupActionKind, enableAlways: boolean): Promise<InboxInteractionResult> {
		if (!item.sessionResource) {
			return 'skipped';
		}

		const session = this.sessionsManagementService.getSession(item.sessionResource);
		if (!session) {
			return 'skipped';
		}
		if (actionKind === InboxNotificationActionKind.DeleteSession && !session.capabilities.get().supportsDelete) {
			return 'skipped';
		}
		if (enableAlways && !isAgentHostProviderId(session.providerId)) {
			return 'skipped';
		}
		if (actionKind === InboxNotificationActionKind.DeleteSession || enableAlways) {
			const confirmation = await this.dialogService.confirm({
				message: enableAlways
					? actionKind === InboxNotificationActionKind.DeleteSession
						? localize('inboxNotifications.alwaysDelete.confirm', "Permanently delete this session and enable automatic deletion of merged sessions?")
						: localize('inboxNotifications.alwaysArchive.confirm', "Archive this session and enable automatic cleanup of merged sessions?")
					: localize('inboxNotifications.delete.confirm', "Are you sure you want to delete this session?"),
				detail: enableAlways
					? actionKind === InboxNotificationActionKind.DeleteSession
						? localize('inboxNotifications.alwaysDelete.detail', "Merged Agent Host sessions are marked as done after 15 days of inactivity, then permanently deleted after another 15 days. Deletion cannot be undone.")
						: localize('inboxNotifications.alwaysArchive.detail', "Merged Agent Host sessions are marked as done after 15 days of inactivity.")
					: localize('inboxNotifications.delete.detail', "This action cannot be undone."),
				primaryButton: actionKind === InboxNotificationActionKind.DeleteSession
					? localize('inboxNotifications.delete.button', "Delete")
					: localize('inboxNotifications.archive.button', "Archive Session"),
			});
			if (!confirmation.confirmed) {
				return 'skipped';
			}
		}
		if (enableAlways) {
			await this.enableMergedSessionCleanupAlways(actionKind);
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
		this.showMergedSessionCleanupAlwaysEnabledNotification(actionKind);
	}

	/**
	 * Confirms that the "Always" opt-in enabled the automatic merged-session
	 * cleanup setting, and links to it so the user can review or change it.
	 */
	private showMergedSessionCleanupAlwaysEnabledNotification(actionKind: InboxMergedSessionCleanupActionKind): void {
		const settingId = actionKind === InboxNotificationActionKind.DeleteSession
			? AUTO_DELETE_MARKED_AS_DONE_MERGED_SESSIONS_AFTER_DAYS_SETTING
			: AUTO_MARK_AS_DONE_MERGED_SESSIONS_AFTER_DAYS_SETTING;
		const message = actionKind === InboxNotificationActionKind.DeleteSession
			? localize('inboxNotifications.alwaysDelete.enabled', "Merged Agent Host sessions will be marked as done after 15 days of inactivity and permanently deleted after another 15 days.")
			: localize('inboxNotifications.alwaysMarkAsDone.enabled', "Merged Agent Host sessions will be marked as done after 15 days of inactivity.");
		this.notificationService.notify({
			severity: Severity.Info,
			message,
			actions: {
				primary: [toAction({
					id: 'inboxNotifications.openMergedSessionCleanupSetting',
					label: localize('inboxNotifications.viewSetting', "View Setting"),
					run: () => this.commandService.executeCommand('workbench.action.openSettings', `@id:${settingId}`),
				})],
			},
		});
	}

	/** Uses the shared CI prompt and feedback submission flows, never the local worktree merge skill. */
	private async runInboxPullRequestAction(item: IInboxNotificationItem, actionKind: InboxPullRequestActionKind): Promise<InboxInteractionResult> {
		if (!item.sessionResource) {
			return 'skipped';
		}
		const session = this.sessionsManagementService.getSession(item.sessionResource);
		if (!session) {
			return 'skipped';
		}
		if (actionKind === InboxNotificationActionKind.AgentMergeMergePullRequest) {
			const merge = getInboxPullRequestMergeOperation(session);
			if (!merge) {
				return 'skipped';
			}
			await merge.changeset.invokeOperation(merge.operation.id);
			return 'success';
		}

		const notifications = this.inboxNotificationsService.notifications.get().filter(notification => notification.sessionResource?.toString() === session.resource.toString());
		const includeReviews = actionKind === InboxNotificationActionKind.AgentMergeAddressReviews
			|| notifications.some(notification => notification.kind === InboxNotificationKind.ReviewComments);
		const includeCI = actionKind === InboxNotificationActionKind.AgentMergeFixCI
			|| notifications.some(notification => notification.kind === InboxNotificationKind.FailingCI);
		const notifiedPullRequests = [...notifications, item].flatMap(notification => notification.pullRequestStates ?? []);
		const pullRequests = getInboxPullRequestRefs(session, undefined, true).filter(ref =>
			notifiedPullRequests.length === 0 || notifiedPullRequests.some(state => isEqual(state.pullRequestUri, ref.uri)));
		const chatResource = session.mainChat.get().resource;
		const store = new DisposableStore();
		try {
			const prompts: string[] = [];
			const markFixRequested: (() => void)[] = [];
			if (includeCI) {
				for (const pullRequest of pullRequests) {
					const prRef = store.add(this.gitHubService.createPullRequestModelReference(pullRequest.owner, pullRequest.repo, pullRequest.number));
					const livePR = prRef.object.pullRequest.get();
					if (!livePR) {
						continue;
					}
					const ciRef = store.add(this.gitHubService.createPullRequestCIModelReference(pullRequest.owner, pullRequest.repo, pullRequest.number, livePR.headSha));
					const query = pullRequests.length > 1 ? `/fix-ci for #${pullRequest.number}` : '/fix-ci';
					const prompt = await buildFixCIPrompt(ciRef.object, query);
					if (prompt) {
						prompts.push(prompt);
						markFixRequested.push(() => ciRef.object.markFixRequested());
					}
				}
			}
			if (includeReviews) {
				const getFeedback = () => this.feedbackService.getFeedback(session.resource).filter(comment =>
					comment.kind === AgentFeedbackKind.PRReview
					&& (comment.state === AgentFeedbackState.Created || comment.state === AgentFeedbackState.Accepted)
					&& (!comment.sourcePullRequest ? pullRequests.length === 1 : pullRequests.some(pr =>
						pr.owner.toLowerCase() === comment.sourcePullRequest!.owner.toLowerCase()
						&& pr.repo.toLowerCase() === comment.sourcePullRequest!.repo.toLowerCase()
						&& pr.number === comment.sourcePullRequest!.number)));
				let feedback = getFeedback();
				if (actionKind === InboxNotificationActionKind.AgentMergeAddressReviews) {
					if (!this.feedbackService.isAgentHostSession(session.resource)) {
						this.notificationService.info(localize('inboxNotifications.reviews.unsupported', "Review feedback cannot be submitted from the Inbox for this session. Open the session to address the comments."));
						return 'skipped';
					}
					await this.sessionsService.openSession(session.resource, { source: 'inbox' });
					const cancellation = store.add(new CancellationTokenSource());
					try {
						feedback = await raceTimeout(waitForState(
							observableFromEvent(this, this.feedbackService.onDidChangeFeedback, getFeedback),
							feedback => this.feedbackService.hasLoadedFeedback(session.resource) && feedback.length > 0,
							undefined, cancellation.token,
						), 10_000) ?? [];
					} finally {
						cancellation.cancel();
					}
					if (!feedback.length) {
						this.notificationService.info(localize('inboxNotifications.reviews.unavailable', "No review feedback was ready to send. Open the session to review the comments and try again."));
						return 'skipped';
					}
				} else if (feedback.length) {
					await this.sessionsService.openSession(session.resource, { source: 'inbox' });
				}
				if (feedback.length) {
					for (const comment of feedback) {
						this.feedbackService.acceptFeedback(session.resource, comment.id);
					}
					prompts.push('/act-on-feedback');
					const submitted = await this.feedbackService.submitFeedback(session.resource, {
						query: prompts.join('\n\n'),
						feedbackIds: feedback.map(comment => comment.id),
						targetChat: chatResource,
						onRequestAccepted: () => markFixRequested.forEach(mark => mark()),
					});
					return submitted ? 'success' : 'failure';
				}
			}
			if (prompts.length === 0) {
				this.notificationService.info(localize('inboxNotifications.pullRequest.noWork', "No actionable CI failures or review feedback were ready to send."));
				return 'skipped';
			}
			const result = await this.submitSessionSlashCommand(session, prompts.join('\n\n'));
			if (result === 'success') {
				markFixRequested.forEach(mark => mark());
			}
			return result;
		} finally {
			store.dispose();
		}
	}

	/**
	 * Loads the session's chat model in the background (without opening it in the
	 * UI) and sends the given slash command to it. Mirrors the background submit
	 * in {@link BlockedSessionsCIFixModel}.
	 */
	private async submitSessionSlashCommand(session: ISession, query: string): Promise<InboxInteractionResult> {
		const chatResource = session.mainChat.get().resource;
		const ref = await this.chatService.acquireOrLoadSession(chatResource, ChatAgentLocation.Chat, CancellationToken.None, 'InboxNotifications');
		if (!ref) {
			return 'failure';
		}
		try {
			let result = await this.chatService.sendRequest(chatResource, query, { agentIdSilent: chatResource.scheme });
			if (ChatSendResult.isQueued(result)) {
				result = await result.deferred;
			}
			return ChatSendResult.isSent(result) ? 'success' : 'failure';
		} finally {
			ref.dispose();
		}
	}

	private async markDone(item: IInboxNotificationItem, sourceElement: HTMLElement | undefined): Promise<void> {
		this.maybeTriggerConfetti(sourceElement);
		this.inboxNotificationsService.dismissNotification(item.id, item);

		if (item.kind === InboxNotificationKind.Completed && item.sessionResource) {
			const session = this.sessionsManagementService.getSession(item.sessionResource);
			if (session) {
				await this.sessionsManagementService.setSessionReadState(session, true);
			}
		}
	}

	private maybeTriggerConfetti(sourceElement: HTMLElement | IAnimationTarget | undefined): void {
		if (!sourceElement || this._store.isDisposed || !this.visible.get() || this.accessibilityService.isMotionReduced() || !this.configurationService.getValue<boolean>(SESSIONS_MARK_AS_DONE_CONFETTI_SETTING)) {
			return;
		}

		triggerConfettiAnimation(sourceElement);
	}

	private createDetailSash(): void {
		const sash = this.detailSash = this._register(new Sash(this.contentElement, {
			getVerticalSashLeft: () => this.clampListPaneWidth(this.listPaneWidth),
		}, { orientation: Orientation.VERTICAL }));
		sash.state = SashState.Disabled;

		let startWidth = this.clampListPaneWidth(this.listPaneWidth);
		this._register(sash.onDidStart(() => { startWidth = this.clampListPaneWidth(this.listPaneWidth); }));
		this._register(sash.onDidChange((event: ISashEvent) => {
			this.hasCustomListPaneWidth = true;
			this.listPaneWidth = this.clampListPaneWidth(startWidth + (event.currentX - event.startX));
			this.layoutPanes();
		}));
		this._register(sash.onDidEnd(() => this.persistListPaneWidth()));
		this._register(sash.onDidReset(() => {
			this.hasCustomListPaneWidth = false;
			this.listPaneWidth = this.getDefaultListPaneWidth();
			this.layoutPanes();
			this.storageService.remove(LIST_PANE_WIDTH_STORAGE_KEY, StorageScope.APPLICATION);
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
		this.contentElement.classList.toggle('no-detail', !this.hasSplit);
		if (!this.hasSplit && this.selectedItemId.get() !== undefined) {
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
		this.layoutComposer();
	}

	private loadListPaneWidth(): void {
		const stored = this.storageService.getNumber(LIST_PANE_WIDTH_STORAGE_KEY, StorageScope.APPLICATION);
		if (typeof stored === 'number' && stored > 0) {
			this.listPaneWidth = stored;
			this.hasCustomListPaneWidth = true;
		}
	}

	private getDefaultListPaneWidth(): number {
		if (this.layoutWidth > 0) {
			return this.clampListPaneWidth(this.layoutWidth * DEFAULT_LIST_PANE_WIDTH_FRACTION);
		}
		return DEFAULT_LIST_PANE_WIDTH;
	}

	private persistListPaneWidth(): void {
		if (!this.hasCustomListPaneWidth) {
			return;
		}
		this.storageService.store(LIST_PANE_WIDTH_STORAGE_KEY, Math.round(this.listPaneWidth), StorageScope.APPLICATION, StorageTarget.USER);
	}

	private selectItem(id: string, trigger: 'cardClick' | 'cardKeyboard', focusDetailPane = false): void {
		if (this.selectedItemId.get() === id) {
			if (focusDetailPane) {
				this.renderDetailIfChanged();
				this.focusDetailPane();
			}
			return;
		}

		this.endSelectionTelemetry('selectionChanged');
		this.selectedRowTab = this.getRow(id)?.tab;
		this.selectedChatResource = undefined;
		this.detailExchangeExpanded = this.selectedRowTab === InboxTab.Working;
		this.selectedItemId.set(id, undefined);
		this.updateSplit(true);
		for (const card of this.renderedCards) {
			card.classList.toggle('selected', card.dataset.notificationId === id);
		}

		const item = this.getItemById(id);
		if (!item) {
			return;
		}

		this.selectionTelemetryState = {
			notificationId: item.id,
			notificationKind: item.kind,
			hasSession: item.sessionResource ? 'yes' : 'no',
			selectedAt: Date.now(),
		};
		this.logInboxInteraction('item.select', trigger, item, 'none', { result: 'success' });
		if (focusDetailPane) {
			this.renderDetailIfChanged();
			this.focusDetailPane();
		}
	}

	private focusSelectedCard(): boolean {
		const selectedId = this.selectedItemId.get();
		if (!selectedId) {
			return false;
		}

		const selectedCard = this.renderedCards.find(card => card.dataset.notificationId === selectedId);
		if (!selectedCard) {
			return false;
		}

		this.applyCardTabStops(selectedId);
		selectedCard.focus({ preventScroll: true });
		this.focusRestoreTimeout.value = disposableTimeout(() => {
			if (getActiveElement() !== selectedCard) {
				selectedCard.focus({ preventScroll: true });
			}
		}, 0);
		return true;
	}

	private focusDetailPane(): void {
		this.detailContentElement.focus({ preventScroll: true });
	}

	private clearSelectedItem(trigger: string): void {
		const focused = getActiveElement();
		const restoreComposerFocus = !!focused && (this.detailPaneElement.contains(focused) || this.detailChatElement.contains(focused));
		this.endSelectionTelemetry(trigger);
		this.selectedRowTab = undefined;
		this.selectedChatResource = undefined;
		this.selectedItemId.set(undefined, undefined);
		for (const rendering of this.cardRenderings.values()) {
			rendering.card.classList.remove('selected');
		}
		this.updateSplit(false);
		this.renderDetailIfChanged();
		this.updateComposerMode();
		if (restoreComposerFocus) {
			this.newSessionView?.focus();
		}
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

	private getRow(id: string): IInboxSessionRow | undefined {
		return this.inboxNotificationsService.sessionRows.get().find(row => row.id === id);
	}

	private getItemById(id: string): IInboxNotificationItem | undefined {
		return this.getRow(id) ?? this.inboxNotificationsService.notifications.get().find(candidate => candidate.id === id)
			?? this.inboxNotificationsService.dismissedNotifications.get().find(candidate => candidate.id === id);
	}

	private selectedItem(): IInboxNotificationItem | undefined {
		const id = this.selectedItemId.get();
		if (!id) {
			return undefined;
		}
		const item = this.getItemById(id);
		if (item) {
			return this.selectedChatResource ? { ...item, chatResource: this.selectedChatResource } : item;
		}
		return undefined;
	}

	private renderDetailIfChanged(reader?: IReader): void {
		const item = this.selectedItem();
		const previousBinding = this.detailChatBinding;
		this.updateDetailChat(item, reader);
		const signature = item ? `${this.detailSignature(item)}:${this.detailChatBinding?.chat.resource.toString() ?? 'noChat'}` : 'none';
		if (signature === this.lastDetailSignature && previousBinding === this.detailChatBinding) {
			return;
		}
		if (item?.needsInputPart && item.id === this.renderedDetailItem?.id && this.isInlineInputFocused()
			&& safeStringify(item.needsInputPart) === safeStringify(this.renderedDetailItem.needsInputPart)) {
			return;
		}
		this.lastDetailSignature = signature;
		this.renderedDetailItem = item;
		this.renderDetail(item);
	}

	private updateDetailChat(item: IInboxNotificationItem | undefined, reader?: IReader): void {
		const session = item?.sessionResource ? this.sessionsManagementService.getSession(item.sessionResource) : undefined;
		const chatResource = item?.chatResource ?? item?.needsInputPart?.chatResource;
		const chat = chatResource
			? session?.chats.read(reader).find(candidate => isEqual(candidate.resource, chatResource))
			: session?.mainChat.read(reader);
		this.selectedChatResource ??= chatResource ?? chat?.resource;
		if (!session || !chat) {
			this.detailChatSubmissionListener.clear();
			this.detailChatNotifications.clear();
			this.detailChatBinding = undefined;
			this.detailChat.value?.setVisible(false);
			this.detailChat.value?.setActive(false);
			this.detailPaneElement.classList.remove('has-chat');
			this.updateComposerMode();
			return;
		}

		if (!this.detailChat.value) {
			const view = this.detailChat.value = this.chatViewFactory.createChatView(undefined, { inputOnly: true, renderChatPet: false });
			this.detailChatElement.appendChild(view.element);
			view.setPrimary(false, true);
			view.setActive(true);
			view.setVisible(true);
		}
		if (!this.detailChatSubmissionListener.value) {
			this.detailChatSubmissionListener.value = this.detailChat.value.onDidSubmitRequest(resource => {
				const notification = this.detailChatNotifications.get(resource.toString());
				if (!notification) {
					return;
				}
				const row = this.getRow(notification.id);
				const completed = row?.notifications.filter(item => item.kind === InboxNotificationKind.Completed) ?? [];
				void Promise.all(completed.map(item => this.markDone(item, undefined))).catch(error => {
					onUnexpectedError(error);
					this.notificationService.error(localize('inboxNotifications.detail.markDoneFailed', "Your request was sent, but the notification could not be marked as done."));
				});
			});
		}
		if (item) {
			this.detailChatNotifications.set(chat.resource.toString(), item);
		}
		if (this.detailChatBinding?.chat !== chat || this.detailChatBinding.session !== session) {
			this.detailChatBinding = { chat, session };
			this.detailChat.value.setChat(chat, session.sessionId, session);
		}
		this.detailPaneElement.classList.add('has-chat');
		this.updateComposerMode();
	}

	private layoutComposer(): void {
		const newSession = this.newSessionElement.classList.contains('visible');
		const element = newSession ? this.newSessionElement : this.detailChatElement;
		const view = newSession ? this.newSessionView : this.detailChat.value;
		if (!view || !element.classList.contains('visible')) {
			this.composerContentObservation.clear();
			this.observedComposerContent = undefined;
			return;
		}
		const content = view.inputContentElement;
		if (content !== this.observedComposerContent) {
			this.observedComposerContent = content;
			this.composerContentObservation.value = content ? this.resizeObserver.observe(content) : undefined;
		}
		if (content) {
			// Size the footer from the native input, not the previously allocated view height.
			element.style.height = `${content.offsetHeight}px`;
		}
		const width = element.clientWidth;
		const height = element.clientHeight;
		if (width > 0 && height > 0) {
			view.layout(width, height, 0, 0);
		}
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
		return `${item.id}|${item.kind}|${item.priority}|${item.description}|${partKey}|${safeStringify(this.getRow(item.id)?.notifications)}`;
	}

	private renderDetail(item: IInboxNotificationItem | undefined): void {
		this.detailDisposables.clear();
		this.evidenceWidget = undefined;
		this.evidenceCanvases = undefined;
		clearNode(this.detailInfoElement);

		if (!item) {
			this.detailContentElement.setAttribute('aria-label',
				localize('inboxNotifications.detail.ariaLabel.empty', "Notification details. Select a notification to see its details."));
			this.detailInfoElement.appendChild($('.inbox-notifications-detail-placeholder', undefined,
				localize('inboxNotifications.detail.placeholder', "Select a notification to see its details.")));
			this.detailScrollableElement.scanDomNode();
			return;
		}

		this.detailContentElement.setAttribute('aria-label', localize(
			'inboxNotifications.detail.ariaLabel.item',
			"Notification details for {0}.",
			item.title,
		));

		const body = this.detailInfoElement.appendChild($('.inbox-notifications-detail-body'));
		const row = this.getRow(item.id);
		const sessionTitle = row?.sessionTitle ?? item.title;
		const header = body.appendChild($('.inbox-notifications-evidence-header'));
		header.appendChild($('h3', undefined, sessionTitle));
		if (item.sessionResource) {
			this.renderActionButton(header, item, { id: 'open', label: localize('inbox.openSession', "Open Session"), kind: InboxNotificationActionKind.OpenSession }, this.detailDisposables);
		}
		if (row && row.tab !== InboxTab.Done) {
			this.renderActionButton(header, row, { id: 'done', label: localize('inbox.done', "Mark Session as Done"), kind: InboxNotificationActionKind.MarkDone }, this.detailDisposables);
		}
		const closeLabel = localize('inbox.closeEvidence', "Close Evidence");
		const close = this.detailDisposables.add(new Button(header, {
			...inboxButtonStyles, secondary: true, small: true, supportIcons: true,
			ariaLabel: closeLabel, title: closeLabel,
		}));
		close.label = '$(close)';
		this.detailDisposables.add(close.onDidClick(() => {
			this.focusSelectedCard();
			this.clearSelectedItem('closeEvidence');
		}));
		for (const notification of row?.notifications ?? [item]) {
			body.appendChild(this.renderNotificationDetails(notification, sessionTitle, this.detailDisposables));
		}
		if (item.needsInputPart || item.kind === InboxNotificationKind.Completed || item.previewSignature || item.pullRequestStates?.length) {
			this.renderDetailSummary(body, item);
		}
		if (this.detailChatBinding) {
			const { session, chat } = this.detailChatBinding;
			const canvases = this.evidenceCanvases = this.detailDisposables.add(this.instantiationService.createInstance(
				InboxCanvases, session, chat, this.detailContentElement, () => this.detailScrollableElement.scanDomNode()));
			body.appendChild(canvases.element);
			const evidence = this.evidenceWidget = this.detailDisposables.add(this.instantiationService.createInstance(
				InboxEvidenceWidget, session, chat, item, () => {
					this.detailScrollableElement.scanDomNode();
					this.evidenceCanvases?.layout();
				}));
			body.appendChild(evidence.element);
		}
		if (item.sessionResource && !this.detailChatBinding) {
			body.appendChild($('.inbox-notifications-detail-chat-unavailable', undefined,
				localize('inboxNotifications.detail.chatUnavailable', "The conversation is unavailable. Open the full session to reconnect or try again.")));
		}
		if (item.pullRequestStates?.length) {
			const section = createInboxEvidenceSection(body, localize('inboxNotifications.detail.pullRequests', "Pull requests"), item.pullRequestStates.length,
				this.detailDisposables, () => this.detailScrollableElement.scanDomNode());
			const prSection = section.appendChild($('.inbox-notifications-detail-pr'));
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

		if (item.sessionResource) {
			const chatStatus = body.appendChild($('p.inbox-evidence-note', { role: 'status' }));
			this.detailDisposables.add(autorun(reader => {
				const message = this.getDetailChatStatus(reader);
				chatStatus.hidden = !message;
				chatStatus.textContent = message ?? '';
				this.detailScrollableElement.scanDomNode();
			}));
			this.renderLatestExchange(body, item);
		}
		this.detailScrollableElement.scanDomNode();
	}

	private getDetailChatStatus(reader?: IReader): string | undefined {
		const chat = this.detailChat.value;
		return chat?.isLoadingTranscript.read(reader)
			? localize('inboxNotifications.detail.chatLoading', "Loading conversation...")
			: chat?.historyStatus.read(reader)?.message;
	}

	private renderLatestExchange(body: HTMLElement, item: IInboxNotificationItem): void {
		const details = body.appendChild($<HTMLDetailsElement>('details.inbox-notifications-latest-exchange'));
		details.appendChild($('summary', undefined, localize('inboxNotifications.detail.showChatResponse', "Show chat response")));
		const content = details.appendChild($('.inbox-notifications-latest-exchange-content.interactive-session'));
		const expandedStore = this.detailDisposables.add(new DisposableStore());
		details.open = this.detailExchangeExpanded;
		let renderedOpen = false;
		const render = () => {
			if (renderedOpen === details.open) {
				return;
			}
			renderedOpen = details.open;
			this.detailExchangeExpanded = details.open;
			expandedStore.clear();
			clearNode(content);
			if (details.open) {
				let model: IChatModel | undefined;
				const modelStore = expandedStore.add(new DisposableStore());
				const connectModel = () => {
					const nextModel = this.getSessionChatModel(item);
					if (nextModel === model) {
						return;
					}
					model = nextModel;
					modelStore.clear();
					clearNode(content);
					if (!model) {
						content.textContent = localize('inboxNotifications.detail.exchangeUnavailable', "The chat response is not available yet.");
						return;
					}
					const scopedContext = modelStore.add(this.contextKeyService.createScoped(content));
					const instantiationService = modelStore.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContext])));
					const viewModel = modelStore.add(instantiationService.createInstance(ChatViewModel, model, { latestRequestOnly: true }));
					const empty = content.appendChild($('p', undefined, localize('inboxNotifications.detail.exchangeEmpty', "No messages yet.")));
					const listElement = content.appendChild($('.interactive-list'));
					const list = modelStore.add(instantiationService.createInstance(ChatListWidget, listElement, {
						rendererOptions: { renderStyle: 'compact', noHeader: true, editable: false, readOnly: true, renderInputRequests: false },
						currentChatMode: () => ChatModeKind.Ask,
					}));
					list.setViewModel(viewModel);
					list.setScrollLock(true);
					let initialScrollPending = true;
					const layout = () => {
						if (content.clientWidth > 0 && content.clientHeight > 0) {
							list.layout(content.clientHeight, content.clientWidth);
							if (initialScrollPending) {
								initialScrollPending = false;
								list.scrollToEnd();
							}
						}
						this.detailScrollableElement.scanDomNode();
					};
					const refresh = () => {
						empty.hidden = viewModel.getItems().length > 0;
						list.refresh();
						layout();
					};
					const scheduler = modelStore.add(new RunOnceScheduler(refresh, 500));
					modelStore.add(viewModel.onDidChange(() => {
						if (!scheduler.isScheduled()) {
							scheduler.schedule();
						}
					}));
					const resizeObserver = modelStore.add(new DisposableResizeObserver('InboxNotificationsView.latestExchange', layout));
					modelStore.add(resizeObserver.observe(content));
					refresh();
				};
				content.textContent = localize('inboxNotifications.detail.exchangeUnavailable', "The chat response is not available yet.");
				expandedStore.add(this.chatService.onDidCreateModel(connectModel));
				connectModel();
			}
			this.detailScrollableElement.scanDomNode();
		};
		this.detailDisposables.add(addDisposableListener(details, 'toggle', render));
		if (details.open) {
			render();
		}
	}

	private setupSessionPreviewHover(target: HTMLElement, item: IInboxNotificationItem, store: DisposableStore): void {
		if (!item.sessionResource) {
			return;
		}
		const sessionResource = item.sessionResource;
		store.add(this.hoverService.setupDelayedHover(target, () => {
			const session = this.sessionsManagementService.getSession(sessionResource);
			if (!session) {
				return { content: localize('inboxNotifications.detail.openSession', "Open full session"), appearance: { showPointer: true } };
			}
			const hover = createSessionSummaryHover(session,
				getSessionSummaryHoverData(session, this.sessionsProvidersService, this.openerService, this.labelService),
				this.openerService);
			const content = $('.inbox-notifications-session-preview');
			if (isHTMLElement(hover.content)) {
				content.appendChild(hover.content);
			}
			const response = this.getLatestResponseText(item);
			if (response) {
				content.appendChild($('.inbox-notifications-detail-section-label', undefined, localize('inboxNotifications.detail.latestResponse', "Latest response")));
				content.appendChild($('.inbox-notifications-session-preview-response', undefined,
					response.length > 600 ? `${response.slice(0, 600).trimEnd()}…` : response));
			}
			return { ...hover, content, appearance: { showPointer: true } };
		}, { groupId: 'inbox-session-preview' }));
	}

	private renderDetailSummary(body: HTMLElement, item: IInboxNotificationItem): void {
		const section = body.appendChild($('section.inbox-notifications-detail-evidence.inbox-evidence-section'));
		section.setAttribute('aria-label', localize('inboxNotifications.detail.interpretation', "Agent interpretation"));
		const container = section.appendChild($('.inbox-notifications-interpretation-content'));
		const content = container.appendChild($('div'));
		const runStore = this.detailDisposables.add(new DisposableStore());
		let initialRender = true;
		this.detailDisposables.add(autorun(reader => {
			const summary = this.inboxNotificationsService.detailSummaries.read(reader).get(item.id);
			const interpretation = this.getDetailInterpretation(item, reader);
			const requestSummary = !initialRender && !summary;
			initialRender = false;
			runStore.clear();
			clearNode(content);
			section.hidden = !interpretation;
			if (interpretation) {
				this.renderEvidencePack(content, interpretation, item, runStore);
			}
			if (item.sessionResource && requestSummary) {
				this.inboxNotificationsService.requestDetailSummary(item);
			}
			this.detailScrollableElement.scanDomNode();
		}));
		if (item.sessionResource) {
			this.inboxNotificationsService.requestDetailSummary(item);
		}
		if (item.previewSignature) {
			this.inboxNotificationsService.requestPreview(item);
		}
	}

	private getDetailInterpretation(item: IInboxNotificationItem, reader?: IReader): IInboxDetailSummary | undefined {
		const summary = this.inboxNotificationsService.detailSummaries.read(reader).get(item.id);
		if (summary && (summary.status || summary.decisions.length || summary.evidence.length)) {
			return summary;
		}
		const preview = item.previewSignature ? this.inboxNotificationsService.previews.read(reader).get(item.previewSignature) : undefined;
		return preview && preview !== item.description && preview !== item.previewFallbackText ? { status: preview, decisions: [], evidence: [] } : undefined;
	}

	private renderEvidencePack(container: HTMLElement, summary: IInboxDetailSummary, item: IInboxNotificationItem, store: DisposableStore): void {
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
			container.appendChild($('.inbox-notifications-detail-section-label', undefined, localize('inboxNotifications.detail.claims', "Claims and cited sources")));
			const list = container.appendChild($('ul.inbox-notifications-detail-list'));
			for (const evidence of summary.evidence) {
				const row = list.appendChild($('li', undefined, evidence.text));
				const uri = evidence.artifact.uri;
				if (uri) {
					const link = store.add(new Button(row, { ...inboxButtonStyles, secondary: true, small: true }));
					link.element.classList.add('inbox-notifications-evidence-link');
					link.label = evidence.artifact.label;
					store.add(link.onDidClick(() => {
						this.logInboxInteraction('detail.openEvidence', 'evidenceLink', item, 'none', { evidenceArtifactKind: evidence.artifact.kind });
						void this.openerService.open(uri).catch(onUnexpectedError);
					}));
				} else if (evidence.artifact.kind !== 'session') {
					row.appendChild($('span.inbox-notifications-evidence-label', undefined, evidence.artifact.label));
				}
			}
		}
	}

	private getSessionChatModel(item: IInboxNotificationItem) {
		if (!item.sessionResource) {
			return undefined;
		}
		const session = this.sessionsManagementService.getSession(item.sessionResource);
		const selectedChatResource = item.id === this.selectedItemId.get() ? this.selectedChatResource : undefined;
		const chatResource = selectedChatResource ?? item.chatResource ?? item.needsInputPart?.chatResource ?? session?.mainChat.get().resource;
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
		if (!this.hasCustomListPaneWidth) {
			this.listPaneWidth = this.getDefaultListPaneWidth();
		}
		this.layoutPanes();
		this.evidenceCanvases?.layout();
	}

	getDetailAccessibleContent(): string | undefined {
		const item = this.selectedItem();
		const sessionTitle = item ? this.getRow(item.id)?.sessionTitle ?? item.title : '';
		const interpretation = item && this.getDetailInterpretation(item);
		const content = [
			...(item ? (this.getRow(item.id)?.notifications ?? [item]).map(notification => [
				notification.title !== sessionTitle ? notification.title : '', notification.description,
				notification.needsInputPart?.kind === 'questionCarousel' ? notification.needsInputPart.questions.map(question => question.title).join('\n') : '',
				notification.needsInputPart?.kind === 'toolConfirmation' ? [notification.needsInputPart.commandLine, notification.needsInputPart.toolInput].filter(Boolean).join('\n') : '',
			].filter(Boolean).join('\n')) : []),
			...(interpretation ? [
				localize('inboxNotifications.detail.interpretation', "Agent interpretation"),
				interpretation.status,
				...interpretation.decisions,
				...interpretation.evidence.map(evidence => evidence.artifact.kind === 'session' && !evidence.artifact.uri
					? evidence.text : `${evidence.text}\n${evidence.artifact.label}${evidence.artifact.uri ? `: ${evidence.artifact.uri.toString(true)}` : ''}`),
			] : []),
			this.evidenceWidget?.getAccessibleContent(),
			...(item?.pullRequestStates?.map(state => `${state.repositoryLabel} ${state.label}: ${state.statusLabel}${state.pullRequestUri ? `\n${state.pullRequestUri.toString(true)}` : ''}`) ?? []),
			this.getDetailChatStatus(),
		].filter(Boolean).join('\n\n');
		return content ? localize('inbox.evidence.accessible', "Evidence for {0}\n\n{1}", sessionTitle, content) : undefined;
	}

	getCanvasAccessibleProvider() {
		return this.evidenceCanvases?.createAccessibleProvider();
	}

	async openNewSession(): Promise<void> {
		this.clearSelectedItem('newSession');
		await this.sessionsService.openNewSession({ preserveCustomView: true, cancelRestore: true });
		await this.ensureNewSessionComposer();
		if (!this.selectedItemId.get()) {
			this.newSessionView?.focus();
		}
	}

	private updateComposerMode(): void {
		const replying = !!this.detailChatBinding;
		const selected = this.selectedItem();
		const newSession = !selected?.sessionResource;
		this.composerLabel.setAttribute('role', 'status');
		this.composerLabel.textContent = newSession
			? localize('inbox.composer.new', "New session")
			: replying
				? localize('inbox.composer.reply', "Reply to {0}", this.getRow(selected.id)?.sessionTitle ?? selected.title)
				: localize('inbox.composer.unavailable', "Conversation unavailable. Open the full session to reconnect, or choose New Session.");
		this.newSessionElement.classList.toggle('visible', newSession);
		this.detailChatElement.classList.toggle('visible', replying);
		this.newSessionView?.setActive(this.visible.get() && newSession);
		this.newSessionView?.setVisible(this.visible.get() && newSession);
		this.detailChat.value?.setActive(this.visible.get() && replying);
		this.detailChat.value?.setVisible(this.visible.get() && replying);
		this.layoutComposer();
	}

	private async ensureNewSessionComposer(): Promise<void> {
		if (this.newSessionView) {
			this.updateComposerMode();
			return;
		}
		this.composerInitialization ??= this.createNewSessionComposer();
		try {
			await this.composerInitialization;
		} catch (error) {
			this.notificationService.error(localize('inbox.composer.failed', "Could not load the new session composer. Choose New Session to try again."));
			throw error;
		} finally {
			this.composerInitialization = undefined;
		}
	}

	private async createNewSessionComposer(): Promise<void> {
		if (this._store.isDisposed) {
			return;
		}
		if (!this.newSessionView) {
			const scopedContext = this.newSessionDisposables.add(this.contextKeyService.createScoped(this.newSessionElement));
			const instantiationService = this.newSessionDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContext])));
			this.newSessionView = this.newSessionDisposables.add(this.chatViewFactory.createNewChatView(false, { hostVisible: this.visible, preserveCustomView: true, backgroundSend: true, renderChatPet: false }, instantiationService));
			this.newSessionElement.appendChild(this.newSessionView.element);
			this.newSessionView.setPrimary(false, true);
		}
		this.updateComposerMode();
	}
}

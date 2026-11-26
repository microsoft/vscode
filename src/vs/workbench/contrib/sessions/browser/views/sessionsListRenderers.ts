/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getPendingSessionAriaLabel, isPendingSessionItem, PendingSessionRenderer } from './pendingSessions.js';
import '../media/sessionsList.css';
import '../media/disclosure.css';
import { ISessionSearchHint } from './sessionsListSearch.js';
import { CANVASES_SECTION_ID, SessionSectionToolbarMenuId, SessionGroupToolbarMenuId, NEW_SESSION_FOR_WORKSPACE_ACTION_ID, IsSessionPinnedContext, SessionItemStatusContext, SessionChatItemCanArchiveContext, SessionChatItemCanDeleteContext, SessionChatItemIsArchivedContext, SessionChatItemIsUntitledContext, SessionChatItemIsStandaloneContext, SessionItemInExternalSectionContext, SessionItemIsCloudContext, SessionItemCanImportContext, SessionSectionTypeContext, SessionSectionHasGitHubRepositoryContext, SessionSectionHasNonCloudRepositoryContext, SessionGroupHasVisibleSessionsContext, SessionGroupIsEmptyContext, SessionGroupIsComparisonContext, SessionsGrouping, ISessionSection, ISessionGroupItem, ISessionShowMore, ISessionPlaceholder, ISessionChatItem, SessionListItem, isSessionChatItem, isSessionGroupItem, isSessionSection, isSessionShowMore, isSessionPlaceholder, isSessionItem } from './sessionsListCommon.js';
import { NEW_SESSION_SECTION_ID, AUTOMATIONS_SECTION_ID, CUSTOMIZATIONS_SECTION_ID, EXTERNAL_SESSIONS_SECTION_ID, getChatTitle, getSessionListChats, isShortcutSection, REPOSITORY_SECTION_PREFIX, ENVIRONMENT_SECTION_PREFIX, isSessionGroupingSection, getSessionSectionType, getSessionRowApproval, QUICK_CHATS_SECTION_ID, isQuickChatSession } from './sessionsListHelpers.js';
import * as DOM from '../../../../../base/browser/dom.js';
import { $ } from '../../../../../base/browser/dom.js';
import { renderAsPlaintext } from '../../../../../base/browser/markdownRenderer.js';
import { Gesture } from '../../../../../base/browser/touch.js';
import { IListRenderer, IListVirtualDelegate } from '../../../../../base/browser/ui/list/list.js';
import { ITreeNode, ITreeRenderer } from '../../../../../base/browser/ui/tree/tree.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { HighlightedLabel } from '../../../../../base/browser/ui/highlightedlabel/highlightedLabel.js';
import { createMatches, FuzzyScore, IMatch } from '../../../../../base/common/filters.js';
import { DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { escapeControlAndFormatCharacters } from '../../../../../base/common/strings.js';
import { constObservable, IObservable, IReader, ISettableObservable, autorun, derived, observableValue } from '../../../../../base/common/observable.js';
import { ThemeIcon, themeColorFromId } from '../../../../../base/common/themables.js';
import { fromNow } from '../../../../../base/common/date.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { OS } from '../../../../../base/common/platform.js';
import { getComparisonKey, isEqual } from '../../../../../base/common/resources.js';
import { localize } from '../../../../../nls.js';
import { MenuId, IMenuService, MenuItemAction, SubmenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { MenuWorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { DropdownWithPrimaryActionViewItem } from '../../../../../platform/actions/browser/dropdownWithPrimaryActionViewItem.js';
import { createActionViewItem, getFlatContextMenuActions } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { ContextKeyValue, IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { SessionSupportsDeleteContext, SessionSupportsMultipleChatsContext, IsQuickChatSessionContext, SessionIsArchivedContext, SessionIsReadContext } from '../../common/contextkeys.js';
import { ARCHIVE_SESSION_COMMAND_ID } from '../../common/sessionCommands.js';
import { ExternalSessionApplicationBadgeMode } from '../../common/sessionConfig.js';
import { UNKNOWN_SESSION_APPLICATION_ID } from '../../../../services/sessions/common/sessionApplication.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { defaultButtonStyles, defaultInputBoxStyles, defaultKeybindingLabelStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { chartsOrange } from '../../../../../platform/theme/common/colors/chartsColors.js';
import { asCssVariable } from '../../../../../platform/theme/common/colorUtils.js';
import { listActiveSelectionBackground, listFocusBackground, listHoverBackground, listInactiveFocusBackground, listInactiveSelectionBackground } from '../../../../../platform/theme/common/colors/listColors.js';
import { isHighContrast } from '../../../../../platform/theme/common/theme.js';
import { IThemeService, Themable } from '../../../../../platform/theme/common/themeService.js';
import { agentsBackground } from '../../common/theme.js';
import { IConfigurationService, isConfigured } from '../../../../../platform/configuration/common/configuration.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { logSettingExperimentTrigger } from '../../../../../platform/telemetry/common/experimentTrigger.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { BRANCH_CHANGES_CHANGESET_ID, getChatCapabilities, getGitHubRepositoryOfRemoteFile, getSessionPresentationWorkspace, getSessionStatusMessage, getSessionWorkspaceKind, GITHUB_REMOTE_FILE_SCHEME, IChat, ISession, ISessionWorkspace, SessionStatus, SessionWorkspaceKind, hasMixedChatHarnesses } from '../../../../services/sessions/common/session.js';
import { ISessionChangesStats, readChatChangesStats } from '../../../../services/sessions/common/sessionChangesStatsCache.js';
import { AgentSessionApprovalModel, agentSessionApprovalId, IAgentSessionApprovalInfo } from '../../../chat/browser/agentSessions/agentSessionApprovalModel.js';
import { getTerminalExecutionTargetDescription, getTerminalExecutionTargetMessage } from '../../../chat/common/chat.js';
import { IVoicePlaybackService } from '../../../chat/common/voicePlaybackService.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { Action, ActionRunner, IAction, Separator } from '../../../../../base/common/actions.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { createSessionActionViewItemProvider, getSessionArchiveActionViewItemOptions, SessionArchiveActionViewItem } from '../sessionActionViewItem.js';
import { HoverStyle, IDelayedHoverOptions } from '../../../../../base/browser/ui/hover/hover.js';
import { HoverPosition } from '../../../../../base/browser/ui/hover/hoverWidget.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { ISessionsManagementService } from '../../common/sessionsManagement.js';
import { ISessionGroup, ISessionGroupAppearance } from '../sessionGroupsService.js';
import { IInputOptions, InputBox, MessageType } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { IOnboardingFocusTarget, markOnboardingTarget } from '../../../onboarding/browser/spotlight/onboardingTarget.js';
// =============================================================================
// TEMPORARY (tracked by https://github.com/microsoft/vscode/issues/320480)
// -----------------------------------------------------------------------------
// `IAgentSessionsService` is a Copilot-provider internal and must normally only
// be consumed by the Copilot chat sessions provider — the rest of the Agents
// window stays provider-agnostic (see SESSIONS.md). This single, deliberate
// exception lets the sessions list trigger lazy resolution of expensive session
// properties (e.g. changes) for rows that scroll into view, until Don
// re-implements it the right way (driven from inside the Copilot provider, or
// via a provider-agnostic visibility signal on the shared services).
// DO NOT add further usages of this import in the sessions workbench, and DO NOT
// copy this suppression elsewhere.
// =============================================================================
// eslint-disable-next-line no-restricted-imports
import { IAgentSessionsService } from '../../../chat/browser/agentSessions/agentSessionsService.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { buildOpenSessionLinkUri } from '../../../../../platform/agentHost/common/openSessionLink.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ISessionsProvidersService } from '../sessionsProvidersService.js';
import { createSessionSummaryHover, getSessionDiffStats, getSessionSummaryHoverData } from '../sessionHoverContent.js';
import { ScheduledRequestsIndicatorRenderer } from './sessionScheduledRequestsCard.js';
import { IChatScheduledRequest } from '../../../chat/common/model/chatViewModel.js';
import { SessionStatusIcon } from '../sessionStatusIcon.js';
import { IAutomationService } from '../../../chat/common/automations/automationService.js';
import { ICustomViewService } from '../customView.js';
import { AUTOMATIONS_CUSTOM_VIEW_ID } from '../automationsConstants.js';
import { ChatCustomizationsHover } from '../../../chat/browser/aiCustomization/chatCustomizationsHover.js';
import { NEW_SESSION_ACTION_ID } from '../../common/chatConstants.js';
import { Menus } from '../menus.js';
import { getSessionConversationStatusAriaLabel } from '../sessionConversationGroups.js';
import { getChatCompletedStateIcon, getSessionAgentMergeConfigurationObservable, getSessionCompletedStateIcon, ISessionAgentMergeConfiguration } from '../sessionAgentMerge.js';
import { KeybindingLabel } from '../../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { IPinnedCanvas, PinnedCanvasState } from '../pinnedCanvases.js';
import { SessionInboxSection, sessionInboxSections } from '../../common/sessionInbox.js';
import { ISessionGridPane } from '../../../../services/sessions/browser/sessionGridPane.js';
import { IShownChat } from '../../../../services/sessions/common/sessionPane.js';

export const SESSION_SHORTCUT_SECTION_TEMPLATE_ID = 'session-shortcut-section';
export const SESSION_SHORTCUT_ROW_HEIGHT = 28;
const SESSION_HEADER_DROP_TARGET_CLASS = 'session-header-drop-target';
/** Shared empty set used when no session hierarchy is selected or focused. */
export const EMPTY_GUIDE_SESSION_IDS: ReadonlySet<string> = new Set();
const SESSION_GROUP_DEPTH_PROPERTY = '--session-group-depth';

/** Steps a row in by one nesting step per level that its custom group is nested in (see `sessionsList.css`). */
function setSessionGroupDepth(container: HTMLElement, depth: number): void {
	if (depth > 0) {
		container.style.setProperty(SESSION_GROUP_DEPTH_PROPERTY, String(depth));
	} else {
		container.style.removeProperty(SESSION_GROUP_DEPTH_PROPERTY);
	}
}

export type SessionContextKeyProvider = (session: ISession, reader: IReader | undefined) => Iterable<[string, ContextKeyValue]>;

export type SessionGroupConnectorPosition = 'middle' | 'last';

export function formatSessionListTime(date: Date): string {
	const seconds = Math.round((Date.now() - date.getTime()) / 1000);
	return seconds < 60 ? localize('secondsDuration', "now") : fromNow(date, true);
}

/** Whether the chat is the open chat of the active session. */
export function isOpenChat(session: ISession, chat: IChat, mainWindowShown: IObservable<IShownChat | undefined> | undefined, reader: IReader | undefined): boolean {
	const shown = mainWindowShown?.read(reader);
	return shown?.session.sessionId === session.sessionId && isEqual(shown.chat.resource, chat.resource);
}

/** The open chat's live Branch Changes, else the session aggregate. Keep in sync with the session hover's main chat counts. */
function getSessionListChatDiffStats(session: ISession, chat: IChat, mainWindowShown: IObservable<IShownChat | undefined> | undefined, reader: IReader): { files: number; insertions: number; deletions: number } | undefined {
	if (isOpenChat(session, chat, mainWindowShown, reader)) {
		const chatStats = readChatChangesStats(chat, reader, BRANCH_CHANGES_CHANGESET_ID);
		if (chatStats !== undefined) {
			return chatStats.insertions > 0 || chatStats.deletions > 0 ? chatStats : undefined;
		}
	}
	return getSessionDiffStats(session, reader);
}

/** A chat row's own change counts, read from its catalog summary so the row does not load chat details. */
function getChatListDiffStats(chat: IChat, reader: IReader): ISessionChangesStats | undefined {
	const summary = chat.changesSummary?.read(reader);
	return summary && (summary.additions > 0 || summary.deletions > 0)
		? { files: summary.files, insertions: summary.additions, deletions: summary.deletions }
		: undefined;
}

/** Uses the session aggregate when collapsed and the main chat's status when expanded. */
export function getSessionRowStatus(session: ISession, reader: IReader | undefined, deriveFromMainChat: boolean, collapsed = true): SessionStatus {
	const sessionStatus = session.status.read(reader);
	if (!deriveFromMainChat || collapsed) {
		return sessionStatus;
	}
	return session.mainChat.read(reader).status.read(reader);
}

function getSessionRowIsRead(session: ISession, reader: IReader | undefined, deriveFromMainChat: boolean): boolean {
	return deriveFromMainChat
		? session.mainChat.read(reader).isRead.read(reader)
		: session.isRead.read(reader);
}

function getSessionRowUpdatedAt(session: ISession, mainChat: IChat, reader: IReader, grouping: SessionsGrouping | undefined, showMetadataWhileActive = false): Date | undefined {
	if (showMetadataWhileActive) {
		return session.updatedAt.read(reader);
	}
	if (mainChat.status.read(reader) === SessionStatus.InProgress) {
		return undefined;
	}
	// Inbox orders whole sessions, including activity outside the main chat.
	return (grouping === SessionsGrouping.Inbox ? session.updatedAt : mainChat.updatedAt).read(reader);
}

/** The icon of a section's header. */
function getSessionSectionIcon(sectionId: string): ThemeIcon | undefined {
	switch (sectionId) {
		case NEW_SESSION_SECTION_ID:
			return Codicon.plus;
		case QUICK_CHATS_SECTION_ID:
			return Codicon.commentDiscussion;
		case 'pinned':
			return Codicon.pinned;
		case CANVASES_SECTION_ID:
			return Codicon.preview;
		case 'drafts':
			return Codicon.edit;
		case 'scheduled':
			return Codicon.clock;
		case EXTERNAL_SESSIONS_SECTION_ID:
			return Codicon.chatImport;
		case AUTOMATIONS_SECTION_ID:
			return Codicon.calendar;
		case SessionInboxSection.ReadyForYou:
			return Codicon.inbox;
		case SessionInboxSection.Working:
			return Codicon.sessionInProgress;
		case SessionInboxSection.OnHold:
			return Codicon.history;
		case SessionInboxSection.Acknowledged:
		case SessionInboxSection.Done:
			return Codicon.mailRead;
		case CUSTOMIZATIONS_SECTION_ID:
			return Codicon.extensions;
		case 'archived':
			return Codicon.archive;
		case 'recent':
			return Codicon.history;
		case 'older':
			return Codicon.calendar;
		default:
			if (sectionId.startsWith(ENVIRONMENT_SECTION_PREFIX)) {
				return sectionId === `${ENVIRONMENT_SECTION_PREFIX}local` ? Codicon.deviceDesktop
					: sectionId === `${ENVIRONMENT_SECTION_PREFIX}cloud` ? Codicon.cloud
						: Codicon.remote;
			}
			return sectionId.startsWith('workspace:')
				? Codicon.folder
				: sectionId.startsWith(REPOSITORY_SECTION_PREFIX)
					? Codicon.repo
					: undefined;
	}
}

/** Describes a pinned canvas row: its title, owning chat, and status. */
function getPinnedCanvasDescription(entry: IPinnedCanvas, reader: IReader | undefined): string {
	const title = entry.title.read(reader);
	const status = getPinnedCanvasStatusLabel(entry.state.read(reader));
	const chatTitle = entry.chatTitle.read(reader);
	return chatTitle
		? localize('pinnedCanvasDescription', "{0}, canvas from {1}, {2}", title, chatTitle, status)
		: localize('pinnedCanvasDescriptionWithoutChat', "{0}, canvas, {1}", title, status);
}

function getPinnedCanvasStatusLabel(state: PinnedCanvasState): string {
	switch (state) {
		case PinnedCanvasState.Live: return localize('pinnedCanvasLive', "Live");
		case PinnedCanvasState.Pending: return localize('pinnedCanvasPending', "Not connected");
		case PinnedCanvasState.Unavailable: return localize('pinnedCanvasUnavailable', "Unavailable");
	}
}

function getSearchHintIcon(hint: ISessionSearchHint): ThemeIcon {
	switch (hint.kind) {
		case 'folder':
			return Codicon.folderCompact;
		case 'repository':
			return Codicon.repoCompact;
		case 'branch':
			return Codicon.gitBranchCompact;
		case 'pullRequest':
			return Codicon.gitPullRequest;
		case 'host':
			return Codicon.remoteCompact;
	}
}

function getSearchHintAriaLabel(hint: ISessionSearchHint): string {
	switch (hint.kind) {
		case 'folder':
			return localize('sessionSearchHintFolderAria', "folder {0}", hint.text);
		case 'repository':
			return localize('sessionSearchHintRepositoryAria', "repository {0}", hint.text);
		case 'branch':
			return localize('sessionSearchHintBranchAria', "branch {0}", hint.text);
		case 'pullRequest':
			return localize('sessionSearchHintPullRequestAria', "pull request {0}", hint.text);
		case 'host':
			return localize('sessionSearchHintHostAria', "host {0}", hint.text);
	}
}

/** Renders the icon of the field a search hint names, and the field's text with the searched words highlighted. */
function renderSearchHint(container: HTMLElement, hint: ISessionSearchHint, store: DisposableStore): void {
	DOM.append(DOM.append(container, $('span.session-details-icon')), $(`span${ThemeIcon.asCSSSelector(getSearchHintIcon(hint))}`));
	store.add(new HighlightedLabel(DOM.append(container, $('span.session-search-hint-label')))).set(hint.text, [...hint.matches]);
}

export const INSET_ROW_GAP = 2;

/**
 * Default number of terminal-command lines shown in a session row's approval
 * prompt. The blocked-sessions dropdown overrides this to show more lines.
 */
export const DEFAULT_APPROVAL_ROW_MAX_LINES = 3;

//#region Tree Delegate

export class SessionsTreeDelegate implements IListVirtualDelegate<SessionListItem> {
	private static readonly ITEM_HEIGHT = 54;
	private static readonly ITEM_HEIGHT_COMPACT = 28;
	private static readonly ITEM_HEIGHT_COMPARISON_ATTEMPT = 28;
	private static readonly INPUT_NEEDED_ROW_HEIGHT = 32;
	/** Quick-chat rows are single-line — see the `.session-item.quick-chat` rules in `sessionsList.css`. */
	private static readonly ITEM_HEIGHT_QUICK_CHAT = 28;
	private static readonly CHAT_ITEM_HEIGHT_PHONE = 44;
	private static readonly CHAT_FOLDER_ROW_HEIGHT = 16;
	/** Phone chat rows have no bottom padding, so approvals reserve matching rounding slack. */
	private static readonly CHAT_APPROVAL_PHONE_BOTTOM_SLACK = 6;
	/**
	 * Phone layout uses a taller row so the inline action toolbar can
	 * meet the 44px minimum touch target without overflowing. Sized to
	 * fit a 44px toolbar centered between the title and details rows.
	 * Keep in sync with the `.phone-layout .session-item` rules in
	 * `sessionsList.css`.
	 */
	private static readonly ITEM_HEIGHT_PHONE = 76;
	private static readonly SECTION_HEIGHT = 26;
	private static readonly COMPARISON_SECTION_HEIGHT = 44;
	static readonly SHOW_MORE_HEIGHT = 26;
	private static readonly PLACEHOLDER_HEIGHT = SessionsTreeDelegate.ITEM_HEIGHT_QUICK_CHAT;

	constructor(
		private readonly _approvalModel: AgentSessionApprovalModel | undefined,
		private readonly _isPhone: () => boolean,
		private readonly _isCompact: () => boolean,
		private readonly _getSessionStatus: (session: ISession) => SessionStatus,
		private readonly _approvalRowMaxLines: number = DEFAULT_APPROVAL_ROW_MAX_LINES,
		private readonly _ciFixModel: ISessionCIFixModel | undefined = undefined,
		private readonly _useCompactQuickChatRows = true,
		/**
		 * Whether the session row surfaces an approval from any of its chats. Lists
		 * that render nested chats as their own rows (the main sessions tree) keep
		 * this `false` so the session row only shows its main chat's approval;
		 * flat, chat-less lists (blocked sessions, automations) set it `true`.
		 */
		private readonly _aggregateChatApprovals = false,
		private readonly _useInsetRowSpacing = false,
		private readonly _isComparisonAttempt: (session: ISession) => boolean = () => false,
		private readonly _sectionRowHeight?: number,
		private readonly _isInbox: () => boolean = () => false,
		private readonly _titleOnlyQuickChatRowHeight?: number,
	) { }

	private withInsetRowSpacing(height: number): number {
		return height + (this._useInsetRowSpacing ? INSET_ROW_GAP : 0);
	}

	getHeight(element: SessionListItem, reader?: IReader): number {
		if (isPendingSessionItem(element)) {
			return this.withInsetRowSpacing(this._isPhone() ? SessionsTreeDelegate.ITEM_HEIGHT_PHONE
				: this._isCompact() ? SessionsTreeDelegate.ITEM_HEIGHT_COMPACT
					: this._isInbox() ? 44 : SessionsTreeDelegate.ITEM_HEIGHT);
		}
		if (isSessionChatItem(element)) {
			return this.getHeightWithoutChatWorkspace(element);
		}
		if (isSessionGroupItem(element) && element.comparison) {
			return SessionsTreeDelegate.COMPARISON_SECTION_HEIGHT;
		}

		if (isSessionSection(element)) {
			if (isShortcutSection(element.id)) {
				return this.withInsetRowSpacing(this._sectionRowHeight ?? SessionsTreeDelegate.SECTION_HEIGHT);
			}
			// Workspace and group headers expand and collapse on tap.
			return this._sectionRowHeight ?? SessionsTreeDelegate.SECTION_HEIGHT;
		}
		if (isSessionGroupItem(element)) {
			return this._sectionRowHeight ?? SessionsTreeDelegate.SECTION_HEIGHT;
		}
		if (isSessionShowMore(element)) {
			return this.withInsetRowSpacing(this._sectionRowHeight ?? SessionsTreeDelegate.SHOW_MORE_HEIGHT);
		}
		if (isSessionPlaceholder(element)) {
			return SessionsTreeDelegate.PLACEHOLDER_HEIGHT;
		}

		const session = element;
		let extraHeight = 0;
		let approval: IAgentSessionApprovalInfo | undefined;
		if (this._approvalModel) {
			// In the main tree only the main chat's approval renders on the session
			// row (nested/side chats surface theirs on their own rows); flat lists
			// with no chat rows aggregate an approval from any of the session's chats.
			approval = getSessionRowApproval(this._approvalModel, session, reader, this._aggregateChatApprovals);
			if (approval) {
				extraHeight += SessionItemRenderer.getApprovalRowHeight(approval, this._approvalRowMaxLines);
			}
		}
		if (!approval && this._isCompact() && this._getSessionStatus(session) === SessionStatus.NeedsInput) {
			extraHeight += SessionsTreeDelegate.INPUT_NEEDED_ROW_HEIGHT;
		}
		if (this._ciFixModel?.getCIFix(session).read(reader)) {
			extraHeight += SessionItemRenderer.CI_ROW_HEIGHT;
		}

		let height: number;
		if (this._isPhone()) {
			if (this._titleOnlyQuickChatRowHeight !== undefined && extraHeight === 0
				&& this._useCompactQuickChatRows && isQuickChatSession(session) && !this._isComparisonAttempt(session)) {
				return this._titleOnlyQuickChatRowHeight;
			}
			height = SessionsTreeDelegate.ITEM_HEIGHT_PHONE;
		} else if (this._isComparisonAttempt(session)) {
			height = SessionsTreeDelegate.ITEM_HEIGHT_COMPARISON_ATTEMPT;
		} else if (this._useCompactQuickChatRows && isQuickChatSession(session)) {
			height = SessionsTreeDelegate.ITEM_HEIGHT_QUICK_CHAT;
		} else if (this._isCompact()) {
			height = SessionsTreeDelegate.ITEM_HEIGHT_COMPACT;
		} else {
			height = this._isInbox() ? 44 : SessionsTreeDelegate.ITEM_HEIGHT;
		}
		return this.withInsetRowSpacing(height + extraHeight);
	}

	getHeightWithoutChatWorkspace(element: ISessionChatItem): number {
		return this.withInsetRowSpacing(this.withChatApprovalHeight(element, this.getChatBaseHeight()));
	}

	private getChatBaseHeight(): number {
		if (this._isPhone()) {
			return SessionsTreeDelegate.CHAT_ITEM_HEIGHT_PHONE + (this._isCompact() ? 0 : SessionsTreeDelegate.CHAT_FOLDER_ROW_HEIGHT);
		}
		return this._isCompact() ? SessionsTreeDelegate.ITEM_HEIGHT_COMPACT : SessionsTreeDelegate.ITEM_HEIGHT;
	}

	private withChatApprovalHeight(element: ISessionChatItem, height: number): number {
		if (!this._approvalModel) {
			return height;
		}
		const approval = this._approvalModel.getApproval(element.chat.resource).get();
		if (!approval) {
			return height;
		}
		return height
			+ SessionItemRenderer.getApprovalRowHeight(approval, this._approvalRowMaxLines)
			+ (this._isPhone() ? SessionsTreeDelegate.CHAT_APPROVAL_PHONE_BOTTOM_SLACK : 0);
	}

	hasDynamicHeight(element: SessionListItem): boolean {
		if (isSessionChatItem(element)) {
			return !!this._approvalModel;
		}
		return (!!this._approvalModel || !!this._ciFixModel) && isSessionItem(element);
	}

	getTemplateId(element: SessionListItem): string {
		if (isPendingSessionItem(element)) {
			return PendingSessionRenderer.TEMPLATE_ID;
		}
		if (isSessionChatItem(element)) {
			return SessionChatItemRenderer.TEMPLATE_ID;
		}
		if (isSessionGroupItem(element)) {
			return SessionGroupRenderer.TEMPLATE_ID;
		}
		if (isSessionSection(element)) {
			return isShortcutSection(element.id)
				? SESSION_SHORTCUT_SECTION_TEMPLATE_ID
				: SessionSectionRenderer.TEMPLATE_ID;
		}
		if (isSessionShowMore(element)) {
			return SessionShowMoreRenderer.TEMPLATE_ID;
		}
		if (isSessionPlaceholder(element)) {
			return SessionPlaceholderRenderer.TEMPLATE_ID;
		}
		return SessionItemRenderer.TEMPLATE_ID;
	}
}

//#endregion

//#region Chat Item Renderer

interface ISessionChatItemTemplate {
	readonly container: HTMLElement;
	scheduledIndicator?: HTMLElement;
	readonly statusIcon: SessionStatusIcon;
	readonly title: HighlightedLabel;
	readonly titleContainer: HTMLElement;
	/** While searching, the search hint of a standalone chat's row without a details row. */
	readonly titleSearchHint: HTMLElement;
	readonly titleInputContainer: HTMLElement;
	readonly compactHoverDescription: HTMLElement;
	readonly folderRow: HTMLElement;
	readonly titleToolbar: MenuWorkbenchToolBar;
	readonly approvalRow: HTMLElement;
	readonly approvalLabel: HTMLElement;
	readonly approvalButtonContainer: HTMLElement;
	readonly canArchiveContext: IContextKey<boolean>;
	readonly canDeleteContext: IContextKey<boolean>;
	readonly isUntitledContext: IContextKey<boolean>;
	readonly isArchivedContext: IContextKey<boolean>;
	readonly isStandaloneContext: IContextKey<boolean>;
	readonly disposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
}

interface IInlineRenameValueState {
	readonly initialValue: string;
	value: string;
	selection?: {
		readonly start: number;
		readonly end: number;
		readonly direction: 'forward' | 'backward' | 'none';
	};
	wasFocused?: boolean;
}

export function withSessionsListHoverPresentation(hover: Pick<IDelayedHoverOptions, 'content' | 'onDidShow' | 'onDidHide'>): IDelayedHoverOptions {
	return {
		...hover,
		additionalClasses: ['sessions-list-hover'],
		appearance: { showPointer: true },
		position: { hoverPosition: HoverPosition.RIGHT, forcePosition: true },
		persistence: { hideOnHover: false },
	};
}

export function getCreatorHoverData(
	session: ISession,
	sessionsManagementService: ISessionsManagementService,
	agentHostConnectionsService: IAgentHostConnectionsService,
	openerService: IOpenerService,
): { readonly title: string; readonly onOpen: () => void } | undefined {
	const creationReference = session.createdBySession?.get();
	if (!creationReference) {
		return undefined;
	}
	const creator = sessionsManagementService.getSession(creationReference.session);
	const resolved = agentHostConnectionsService.resolveSessionResource(creationReference.session);
	if (!creator || !resolved) {
		return undefined;
	}
	const target = buildOpenSessionLinkUri(resolved.backendSession, creationReference.chat?.fragment, creationReference.turnId);
	return { title: creator.title.get(), onOpen: () => openerService.open(target).catch(onUnexpectedError) };
}

export class SessionChatItemRenderer implements ITreeRenderer<SessionListItem, FuzzyScore, ISessionChatItemTemplate> {
	static readonly TEMPLATE_ID = 'session-chat-item';
	readonly templateId = SessionChatItemRenderer.TEMPLATE_ID;
	readonly rowClassName = 'session-list-inset-row';

	private readonly _onDidChangeItemHeight = new Emitter<ISessionChatItem>();
	readonly onDidChangeItemHeight: Event<ISessionChatItem> = this._onDidChangeItemHeight.event;

	private readonly _onDidApproveSession = new Emitter<IApprovedSession>();
	/** Fires when the user approves a chat's pending action via its "Allow" button. */
	readonly onDidApproveSession: Event<IApprovedSession> = this._onDidApproveSession.event;
	private readonly editingChat = observableValue<ISessionChatItem | undefined>(this, undefined);
	private activeRenameInput: { readonly item: ISessionChatItem; readonly input: InputBox } | undefined;
	private renameState: (IInlineRenameValueState & { readonly item: ISessionChatItem }) | undefined;

	constructor(
		private readonly hoverService: IHoverService,
		private readonly instantiationService: IInstantiationService,
		private readonly contextKeyService: IContextKeyService,
		private readonly sessionsManagementService: ISessionsManagementService,
		private readonly contextViewService: IContextViewService,
		private readonly markdownRendererService: IMarkdownRendererService | undefined,
		private readonly approvalModel: AgentSessionApprovalModel | undefined,
		private readonly approvalRowMaxLines: number,
		private readonly onDidDoubleClickRename: (item: ISessionChatItem) => void,
		private readonly onDidFinishRename: () => void,
		private readonly getSummaryHoverOptions: (item: ISessionChatItem) => IDelayedHoverOptions,
		private readonly compact: () => boolean,
		private readonly onDidChangeUpdatedAt: () => void,
		/**
		 * Session IDs whose hierarchy indent/connector guides show while the
		 * pointer is outside the Sessions pane, i.e. the session (or one of its
		 * chats) is selected or keyboard-focused. While the pointer is over the
		 * pane, CSS shows every hierarchy's guides.
		 */
		private readonly activeGuideSessionIds: IObservable<ReadonlySet<string>> = constObservable(EMPTY_GUIDE_SESSION_IDS),
		/** How many groups deep the custom group whose rows include a chat row is nested; the row steps in by that many levels. */
		private readonly getGroupDepth: (item: ISessionChatItem) => number = () => 0,
		private readonly getComparisonConnectorPosition: (session: ISession) => SessionGroupConnectorPosition | undefined = () => undefined,
		/** The Agent Merge configuration of the chat's folder, which decides how its pull request icon reads. */
		private readonly getAgentMergeConfiguration: (item: ISessionChatItem) => IObservable<ISessionAgentMergeConfiguration | undefined> = () => constObservable(undefined),
		/** While searching, the field a standalone chat matched in that neither its row, through `shownTexts`, nor its section headers show. */
		private readonly getSearchHint: (item: ISessionChatItem, shownTexts: readonly string[]) => ISessionSearchHint | undefined = () => undefined,
		private readonly getComparisonAttemptLabel: (session: ISession, chat: IChat) => string | undefined = () => undefined,
		private readonly scheduledIndicatorRenderer?: ScheduledRequestsIndicatorRenderer,
		private readonly focusChat: (item: ISessionChatItem) => void = () => undefined,
	) { }

	renderTemplate(container: HTMLElement): ISessionChatItemTemplate {
		const disposables = new DisposableStore();
		const elementDisposables = disposables.add(new DisposableStore());
		container.classList.add('session-chat-item');

		DOM.append(container, $('span.session-attention-indicator', { 'aria-hidden': 'true' }));
		const titleRow = DOM.append(container, $('.session-chat-title-row'));
		const iconContainer = DOM.append(titleRow, $('.session-chat-icon'));
		iconContainer.setAttribute('aria-hidden', 'true');
		const statusIcon = disposables.add(this.instantiationService.createInstance(SessionStatusIcon, iconContainer));
		const titleContainer = DOM.append(titleRow, $('.session-chat-title'));
		const title = disposables.add(new HighlightedLabel(titleContainer));
		// The row's ARIA label names the search hint.
		const titleSearchHint = DOM.append(titleRow, $('span.session-search-hint.session-search-hint-title', { 'aria-hidden': 'true' }));
		const titleInputContainer = DOM.append(titleRow, $('.session-chat-title-input.session-inline-rename-input'));
		const compactHoverDescription = DOM.append(titleRow, $('.session-compact-hover-description'));
		const folderRow = DOM.append(container, $('.session-chat-folder-row'));
		folderRow.setAttribute('aria-hidden', 'true');
		const titleToolbarContainer = DOM.append(titleRow, $('.session-title-toolbar'));
		for (const eventType of ['pointerdown', 'pointerup', 'click', 'dblclick'] as const) {
			disposables.add(DOM.addDisposableListener(titleInputContainer, eventType, e => e.stopPropagation()));
			disposables.add(DOM.addDisposableListener(titleToolbarContainer, eventType, e => e.stopPropagation()));
		}
		disposables.add(Gesture.ignoreTarget(titleInputContainer));
		disposables.add(Gesture.ignoreTarget(titleToolbarContainer));

		const contextKeyService = disposables.add(this.contextKeyService.createScoped(container));
		const canArchiveContext = SessionChatItemCanArchiveContext.bindTo(contextKeyService);
		const canDeleteContext = SessionChatItemCanDeleteContext.bindTo(contextKeyService);
		const isUntitledContext = SessionChatItemIsUntitledContext.bindTo(contextKeyService);
		const isArchivedContext = SessionChatItemIsArchivedContext.bindTo(contextKeyService);
		const isStandaloneContext = SessionChatItemIsStandaloneContext.bindTo(contextKeyService);
		const scopedInstantiationService = disposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
		const titleToolbar = disposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, titleToolbarContainer, Menus.SessionChatItemToolbar, {
			menuOptions: { shouldForwardArgs: true },
			telemetrySource: 'sessionsList.chatRow',
		}));

		// Approval row — mirrors the session row's approval prompt but scoped to
		// this specific chat (see the "Approval Row Content" region above).
		const approvalRow = DOM.append(container, $('.session-approval-row'));
		const approvalLabel = DOM.append(approvalRow, $('span.session-approval-label'));
		const approvalButtonContainer = DOM.append(approvalRow, $('.session-approval-button'));
		for (const eventType of ['pointerdown', 'pointerup', 'click', 'dblclick'] as const) {
			disposables.add(DOM.addDisposableListener(approvalRow, eventType, e => e.stopPropagation()));
		}
		disposables.add(Gesture.ignoreTarget(approvalRow));

		return { container, statusIcon, title, titleContainer, titleSearchHint, titleInputContainer, compactHoverDescription, folderRow, titleToolbar, approvalRow, approvalLabel, approvalButtonContainer, canArchiveContext, canDeleteContext, isUntitledContext, isArchivedContext, isStandaloneContext, disposables, elementDisposables };
	}

	renderElement(node: ITreeNode<SessionListItem, FuzzyScore>, _index: number, template: ISessionChatItemTemplate): void {
		const element = node.element;
		if (!isSessionChatItem(element)) {
			return;
		}

		template.elementDisposables.clear();
		this.scheduledIndicatorRenderer?.render(() => element.chat.resource, template, () => this.focusChat(element));
		template.titleToolbar.context = element;
		const groupDepth = this.getGroupDepth(element);
		setSessionGroupDepth(template.container, groupDepth);
		template.elementDisposables.add(toDisposable(() => template.container.classList.remove('renaming')));
		template.container.classList.toggle('last-chat', element.isLast);
		template.container.classList.toggle('standalone', !!element.standalone);
		const comparisonConnectorPosition = element.standalone ? undefined : this.getComparisonConnectorPosition(element.session);
		template.container.classList.toggle('session-comparison-chat', comparisonConnectorPosition !== undefined);
		if (comparisonConnectorPosition === 'middle') {
			const connector = DOM.append(template.container, $('span.session-comparison-chat-connector', { 'aria-hidden': 'true' }));
			template.elementDisposables.add(toDisposable(() => connector.remove()));
		}
		template.isStandaloneContext.set(!!element.standalone);
		let agentMergeConfiguration: IObservable<ISessionAgentMergeConfiguration | undefined> | undefined;
		template.elementDisposables.add(autorun(reader => {
			template.title.set(this.getComparisonAttemptLabel(element.session, element.chat) ?? getChatTitle(element.chat, reader), createMatches(node.filterData));
			const status = element.chat.status.read(reader);
			const isArchived = element.chat.isArchived.read(reader);
			const isRead = element.chat.isRead.read(reader);
			const completedStateIcon = getChatCompletedStateIcon(element.session, element.chat, reader, () => agentMergeConfiguration ??= this.getAgentMergeConfiguration(element));
			const capabilities = getChatCapabilities(element.chat, element.session, reader);
			template.canArchiveContext.set(capabilities.canArchive && !element.movingFrom);
			template.canDeleteContext.set(capabilities.canDelete && !element.movingFrom);
			template.isUntitledContext.set(status === SessionStatus.Untitled);
			template.isArchivedContext.set(isArchived);
			template.statusIcon.setStatus(
				status,
				isRead,
				isArchived,
				completedStateIcon,
				element.chat.resource,
			);
			template.container.classList.toggle('archived', isArchived);
			template.container.classList.toggle('unread', !isRead && !isArchived);
			template.container.classList.toggle('needs-input', status === SessionStatus.NeedsInput);
		}));
		const descriptionDisposable = template.elementDisposables.add(new MutableDisposable());
		let previousUpdatedAtTimestamp = element.chat.updatedAt.get()?.getTime();
		template.elementDisposables.add(autorun(reader => {
			const sessionWorkspace = element.session.workspace.read(reader);
			const chatWorkspace = element.chat.workspace.read(reader);
			const folderLabel = getChatWorkspaceBadgeLabel(sessionWorkspace, chatWorkspace);
			const status = element.chat.status.read(reader);
			const statusMessage = getSessionStatusMessage(status, element.chat.description.read(reader));
			const sortUpdatedAt = element.chat.updatedAt.read(reader);
			const updatedAt = status === SessionStatus.InProgress ? undefined : sortUpdatedAt;
			const updatedAtTimestamp = sortUpdatedAt?.getTime();
			if (previousUpdatedAtTimestamp !== updatedAtTimestamp) {
				previousUpdatedAtTimestamp = updatedAtTimestamp;
				this.onDidChangeUpdatedAt();
			}
			template.container.classList.toggle('has-folder-label', !!folderLabel);
			DOM.clearNode(template.compactHoverDescription);
			if (folderLabel) {
				const badge = DOM.append(template.compactHoverDescription, $('span.session-badge', undefined, folderLabel));
				reader.store.add(this.hoverService.setupDelayedHoverAtMouse(badge, { content: folderLabel }));
			}

			const showDetailsRow = !this.compact();
			const showsFolder = showDetailsRow && statusMessage === undefined && !!folderLabel && !!chatWorkspace;
			// While searching, a done chat on its own row names the field it matched in that its row doesn't show: in its
			// details row, or next to its title when it has none.
			const searchHint = element.standalone ? this.getSearchHint(element, showsFolder && folderLabel ? [folderLabel] : []) : undefined;
			DOM.clearNode(template.titleSearchHint);
			template.titleSearchHint.classList.toggle('visible', !!searchHint && !showDetailsRow);
			if (searchHint && !showDetailsRow) {
				renderSearchHint(template.titleSearchHint, searchHint, reader.store);
			}
			// Like session rows, hide change counts while the chat is running or needs input.
			const diffStats = status === SessionStatus.InProgress || status === SessionStatus.NeedsInput ? undefined : getChatListDiffStats(element.chat, reader);
			template.folderRow.hidden = !showDetailsRow;
			descriptionDisposable.clear();
			DOM.clearNode(template.folderRow);
			if (showDetailsRow && statusMessage !== undefined) {
				const statusElement = DOM.append(template.folderRow, $('span.session-description'));
				const statusDescription = typeof statusMessage === 'string'
					? statusMessage
					: renderAsPlaintext(statusMessage, { omitMarkdownSyntax: true });
				if (typeof statusMessage === 'string' || !this.markdownRendererService) {
					statusElement.textContent = statusDescription;
				} else {
					descriptionDisposable.value = this.markdownRendererService.render(statusMessage, { sanitizerConfig: { replaceWithPlaintext: true } }, statusElement);
				}
				reader.store.add(this.hoverService.setupDelayedHoverAtMouse(statusElement, { content: statusDescription }));
			} else if (showDetailsRow && folderLabel && chatWorkspace) {
				const kind = getSessionWorkspaceKind(chatWorkspace, false);
				const icon = kind === SessionWorkspaceKind.Worktree ? Codicon.worktreeCompact : Codicon.folderCompact;
				const iconContainer = DOM.append(template.folderRow, $('span.session-chat-folder-icon'));
				DOM.append(iconContainer, $(`span${ThemeIcon.asCSSSelector(icon)}`));
				const label = DOM.append(template.folderRow, $('span.session-chat-folder-label', undefined, folderLabel));
				reader.store.add(this.hoverService.setupDelayedHoverAtMouse(label, { content: folderLabel }));
			}
			let hasLeadingDetail = statusMessage !== undefined || !!folderLabel;
			if (showDetailsRow && searchHint) {
				if (hasLeadingDetail) {
					DOM.append(template.folderRow, $('span.session-chat-separator', undefined, '\u00B7'));
				}
				renderSearchHint(DOM.append(template.folderRow, $('span.session-search-hint')), searchHint, reader.store);
				hasLeadingDetail = true;
			}
			if (showDetailsRow && diffStats) {
				if (hasLeadingDetail) {
					DOM.append(template.folderRow, $('span.session-chat-separator', undefined, '\u00B7'));
				}
				const diffEl = DOM.append(template.folderRow, $('span.session-chat-diff'));
				DOM.append(diffEl, $('span.session-chat-diff-added')).textContent = `+${diffStats.insertions}`;
				DOM.append(diffEl, $('span.session-chat-diff-removed')).textContent = `-${diffStats.deletions}`;
			}
			if (showDetailsRow && updatedAt) {
				if (hasLeadingDetail || diffStats) {
					DOM.append(template.folderRow, $('span.session-chat-separator', undefined, '\u00B7'));
				}
				const time = DOM.append(template.folderRow, $('span.session-chat-time'));
				time.textContent = formatSessionListTime(updatedAt);
				const targetWindow = DOM.getWindow(time);
				const interval = targetWindow.setInterval(() => time.textContent = formatSessionListTime(updatedAt), 60_000);
				reader.store.add(toDisposable(() => targetWindow.clearInterval(interval)));
			}
		}));
		template.elementDisposables.add(autorun(reader => {
			const showGuides = !element.standalone && this.activeGuideSessionIds.read(reader).has(element.session.sessionId);
			template.container.classList.toggle('session-hierarchy-guides-visible', showGuides);
		}));
		template.elementDisposables.add(this.hoverService.setupDelayedHover(template.container, () => this.getSummaryHoverOptions(element), { groupId: 'sessions-list' }));
		template.elementDisposables.add(DOM.addDisposableListener(template.titleContainer, DOM.EventType.DBLCLICK, (event: MouseEvent) => {
			if (
				event.button !== 0 ||
				event.altKey ||
				event.ctrlKey ||
				event.metaKey ||
				event.shiftKey ||
				!this.canRename(element)
			) {
				return;
			}

			event.preventDefault();
			event.stopPropagation();
			if (this.beginRename(element)) {
				this.onDidDoubleClickRename(element);
			}
		}));
		template.elementDisposables.add(autorun(reader => {
			const editing = this.editingChat.read(reader);
			const isEditing = !!editing && this.isSameChat(editing, element);
			template.container.classList.toggle('renaming', isEditing);
			if (isEditing) {
				this.renderRenameInput(element, template, reader.store);
			}
		}));

		if (this.approvalModel) {
			this.renderApprovalRow(element, template);
		}
	}

	beginRename(item: ISessionChatItem): boolean {
		const target = this.resolveRenameTarget(item);
		if (!target) {
			return false;
		}
		if (this.activeRenameInput && this.isSameChat(this.activeRenameInput.item, target)) {
			this.activeRenameInput.input.focus();
			this.activeRenameInput.input.select();
			return true;
		}
		if (!this.renameState || !this.isSameChat(this.renameState.item, target)) {
			const initialValue = getChatTitle(target.chat);
			this.renameState = { item: target, initialValue, value: initialValue };
		}
		this.editingChat.set(target, undefined);
		return true;
	}

	private canRename(item: ISessionChatItem): boolean {
		return !!this.resolveRenameTarget(item);
	}

	private isSameChat(first: ISessionChatItem, second: ISessionChatItem): boolean {
		return isEqual(first.session.resource, second.session.resource) && isEqual(first.chat.resource, second.chat.resource);
	}

	private resolveRenameTarget(item: ISessionChatItem): ISessionChatItem | undefined {
		const session = this.sessionsManagementService.getSessions().find(session => isEqual(session.resource, item.session.resource));
		const chat = session?.chats.get().find(chat => isEqual(chat.resource, item.chat.resource));
		if (!session
			|| !chat
			|| isEqual(chat.resource, session.mainChat.get().resource)
			|| chat.status.get() === SessionStatus.Untitled
			|| !getChatCapabilities(chat, session, undefined).canRename
		) {
			return undefined;
		}
		return { session, chat };
	}

	private renderRenameInput(item: ISessionChatItem, template: ISessionChatItemTemplate, disposables: DisposableStore): void {
		const renameState = this.renameState;
		if (!renameState || !this.isSameChat(renameState.item, item)) {
			return;
		}
		const input = renderInlineRenameInput(
			template.titleInputContainer,
			this.contextViewService,
			renameState,
			localize('renameChat.inputAriaLabel', "Rename chat. Press Enter to confirm or Escape to cancel."),
			disposables,
			(title, restoreListFocus) => {
				this.editingChat.set(undefined, undefined);
				this.renameState = undefined;
				if (restoreListFocus) {
					this.onDidFinishRename();
				}
				const target = this.resolveRenameTarget(item);
				if (title && target) {
					this.sessionsManagementService.renameChat(target.session, target.chat.resource, title).catch(onUnexpectedError);
				}
			},
		);
		this.activeRenameInput = { item, input };
		disposables.add(toDisposable(() => {
			if (this.activeRenameInput?.input === input) {
				this.activeRenameInput = undefined;
			}
		}));
	}

	private renderApprovalRow(element: ISessionChatItem, template: ISessionChatItemTemplate): void {
		if (!this.approvalModel || !this.markdownRendererService) {
			return;
		}

		const approvalModel = this.approvalModel;
		const chatResource = element.chat.resource;
		bindApprovalRow(template, reader => approvalModel.getApproval(chatResource).read(reader), this.markdownRendererService, this.hoverService, true, this.approvalRowMaxLines,
			approvalId => this._onDidApproveSession.fire({ session: element.session, approvalId }),
			() => this._onDidChangeItemHeight.fire(element));
	}

	disposeElement(node: ITreeNode<SessionListItem, FuzzyScore>, _index: number, template: ISessionChatItemTemplate): void {
		if (isSessionChatItem(node.element) && this.renameState && this.isSameChat(this.renameState.item, node.element) && !this.resolveRenameTarget(node.element)) {
			this.editingChat.set(undefined, undefined);
			this.renameState = undefined;
		}
		template.elementDisposables.clear();
	}

	disposeTemplate(template: ISessionChatItemTemplate): void {
		template.disposables.dispose();
	}
}

//#endregion

//#region Approval Row Content

/** DOM slots shared by the session-row and chat-row approval prompts. */
interface IApprovalRowElements {
	readonly label: HTMLElement;
	readonly buttonContainer: HTMLElement;
}

/**
 * The vertical space a pending approval contributes to its row, or `0` when
 * there is none. Tracked by the approval renderers so a row's virtualized
 * height is refreshed whenever it changes — including when one approval is
 * replaced directly by another with a different line count (not just when an
 * approval appears or clears).
 */
function approvalRowHeightFor(info: IAgentSessionApprovalInfo | undefined, maxLines: number): number {
	return info ? SessionItemRenderer.getApprovalRowHeight(info, maxLines) : 0;
}

interface ICompactInputNeededPresentationOptions {
	readonly compact?: () => boolean;
	readonly deriveStatusFromMainChat?: boolean;
	readonly showMetadataWhileActive?: (session: ISession) => boolean;
	readonly collapsedSessionIds?: IObservable<ReadonlySet<string>>;
	readonly aggregateChatApprovals?: boolean;
}

function getCompactInputNeededMessage(
	session: ISession,
	reader: IReader | undefined,
	options: ICompactInputNeededPresentationOptions,
	approvalModel: AgentSessionApprovalModel | undefined,
): ReturnType<typeof getSessionStatusMessage> {
	if (!options.compact?.()) {
		return undefined;
	}
	const sessionStatus = getSessionRowStatus(
		session,
		reader,
		!!options.deriveStatusFromMainChat,
		options.collapsedSessionIds?.read(reader).has(session.sessionId) ?? true,
	);
	const approval = approvalModel
		? getSessionRowApproval(approvalModel, session, reader, options.aggregateChatApprovals ?? false)
		: undefined;
	return sessionStatus === SessionStatus.NeedsInput && !approval
		? getSessionStatusMessage(sessionStatus, session.description.read(reader))
		: undefined;
}

/**
 * Renders a pending approval's label (and, when requested, a hover with the
 * full content) plus an "Allow" button into the given row elements. Shared by
 * the session row (main-chat approvals) and chat rows (nested/side-chat
 * approvals) so both render identically.
 */
function renderApprovalRowContent(
	info: IAgentSessionApprovalInfo,
	elements: IApprovalRowElements,
	store: DisposableStore,
	markdownRendererService: IMarkdownRendererService,
	hoverService: IHoverService,
	showHover: boolean,
	maxLines: number,
	onApprove: (approvalId: string) => void,
): void {
	// Render up to `maxLines` lines as separate code blocks
	const lines = info.label.split('\n');
	const visibleLines = lines.slice(0, maxLines);
	if (lines.length > maxLines) {
		visibleLines[maxLines - 1] = `${visibleLines[maxLines - 1]} \u2026`;
	}
	const langId = info.languageId ?? 'json';
	const labelContent = new MarkdownString();
	for (const line of visibleLines) {
		labelContent.appendCodeblock(langId, line);
	}

	elements.label.textContent = '';
	store.add(markdownRendererService.render(labelContent, {}, elements.label));
	if (info.executionTarget?.workingDirectory) {
		appendApprovalWorkingDirectory(elements.label, info.executionTarget.workingDirectory);
	}

	if (showHover) {
		const fullContent = new MarkdownString().appendCodeblock(info.languageId ?? 'json', info.label);
		const executionTargetMessage = getTerminalExecutionTargetMessage(info);
		if (executionTargetMessage) {
			fullContent.appendMarkdown(`\n${executionTargetMessage.value}`);
		}
		store.add(hoverService.setupDelayedHover(elements.label, {
			content: fullContent,
			style: HoverStyle.Pointer,
			position: { hoverPosition: HoverPosition.BELOW },
			additionalClasses: ['session-approval-hover'],
		}));
	}

	elements.buttonContainer.textContent = '';
	const executionTargetDescription = getTerminalExecutionTargetDescription(info);
	const button = store.add(new Button(elements.buttonContainer, {
		title: localize('allowActionOnce', "Allow once"),
		// All simultaneously visible "Allow" buttons share the same visible label
		// and tooltip, so give each an explicit accessible name that names the
		// command/action it approves — otherwise screen-reader users can't tell
		// which chat's action a button belongs to. Keep the "once" scope so the
		// one-time nature of the permission is still conveyed.
		ariaLabel: executionTargetDescription
			? localize('allowActionAriaWithExecutionTarget', "Allow once: {0} ({1})", info.label, executionTargetDescription)
			: localize('allowActionAria', "Allow once: {0}", info.label),
		secondary: true,
		...defaultButtonStyles
	}));
	button.label = localize('allowAction', "Allow");
	store.add(button.onDidClick(() => {
		// Capture the approval's identity BEFORE confirming: `confirm()` may
		// synchronously clear the pending approval, so we can't read it after.
		const approvalId = agentSessionApprovalId(info);
		info.confirm();
		onApprove(approvalId);
	}));
}

/**
 * Appends the line naming where a pending command runs. A long path is cut at
 * its start, keeping the folders nearest the command, which tell same-named
 * relative commands apart.
 */
function appendApprovalWorkingDirectory(container: HTMLElement, workingDirectory: string): void {
	const line = DOM.append(container, $('.session-approval-working-directory'));
	DOM.append(line, $(`span${ThemeIcon.asCSSSelector(Codicon.folderCompact)}`));
	const path = DOM.append(line, $('span.session-approval-working-directory-path'));
	// Isolated left-to-right so the right-to-left box that moves the ellipsis to the start cannot reorder the path.
	DOM.append(path, $('span', { dir: 'ltr' }, escapeControlAndFormatCharacters(workingDirectory)));
}

/**
 * Shows the pending approval that `readApproval` reads in a row's approval slot
 * for as long as the row renders. Calls `onDidChangeHeight` on any change of the
 * height the row reserves for it: also when one approval replaces another whose
 * label spans a different number of lines, not only when an approval appears or
 * clears.
 */
function bindApprovalRow(
	template: Pick<ISessionItemTemplate, 'approvalRow' | 'approvalLabel' | 'approvalButtonContainer' | 'elementDisposables'>,
	readApproval: (reader: IReader | undefined) => IAgentSessionApprovalInfo | undefined,
	markdownRendererService: IMarkdownRendererService,
	hoverService: IHoverService,
	showHover: boolean,
	maxLines: number,
	onApprove: (approvalId: string) => void,
	onDidChangeHeight: () => void,
): void {
	let lastApprovalHeight = approvalRowHeightFor(readApproval(undefined), maxLines);
	template.approvalRow.classList.toggle('visible', lastApprovalHeight > 0);

	const buttonStore = template.elementDisposables.add(new DisposableStore());

	template.elementDisposables.add(autorun(reader => {
		buttonStore.clear();

		const info = readApproval(reader);
		template.approvalRow.classList.toggle('visible', !!info);

		if (info) {
			renderApprovalRowContent(info, {
				label: template.approvalLabel,
				buttonContainer: template.approvalButtonContainer,
			}, buttonStore, markdownRendererService, hoverService, showHover, maxLines, onApprove);
		}

		const height = approvalRowHeightFor(info, maxLines);
		if (height !== lastApprovalHeight) {
			lastApprovalHeight = height;
			onDidChangeHeight();
		}
	}));
}

//#endregion

//#region Session Item Renderer

/**
 * Resolves inline toolbar actions against either a focused-list handler or the
 * current multi-selection.
 */
export class SessionItemActionRunner extends ActionRunner {

	constructor(
		private readonly getMultiSelectedSessions: (session: ISession) => ISession[],
		private readonly handleAction?: (action: IAction, session: ISession) => boolean | Promise<boolean>,
	) {
		super();
	}

	protected override async runAction(action: IAction, context?: unknown): Promise<void> {
		if (context && !Array.isArray(context)) {
			if (this.handleAction && await this.handleAction(action, context as ISession)) {
				return;
			}
			await super.runAction(action, this.getMultiSelectedSessions(context as ISession));
			return;
		}
		await super.runAction(action, context);
	}
}

/**
 * Creates the input box of an inline rename editor from its draft state. Rows
 * are rerendered whenever the list updates, so the draft, selection, and focus
 * are kept in `state` and restored instead of resetting to the original name.
 */
function createInlineRenameInputBox(
	container: HTMLElement,
	contextViewService: IContextViewService | undefined,
	state: IInlineRenameValueState,
	options: IInputOptions,
	disposables: DisposableStore,
): InputBox {
	DOM.clearNode(container);
	const input = new InputBox(container, contextViewService, options);
	disposables.add(toDisposable(() => {
		state.selection = {
			start: input.inputElement.selectionStart ?? input.value.length,
			end: input.inputElement.selectionEnd ?? input.value.length,
			direction: input.inputElement.selectionDirection ?? 'none',
		};
		state.wasFocused = DOM.isActiveElement(input.inputElement);
		input.hideMessage();
		input.dispose();
	}));
	input.value = state.value;
	if (state.selection) {
		if (state.wasFocused) {
			input.focus();
		}
		input.inputElement.setSelectionRange(state.selection.start, state.selection.end, state.selection.direction);
	} else {
		input.focus();
		input.select();
	}
	disposables.add(DOM.addDisposableListener(input.inputElement, DOM.EventType.INPUT, () => state.value = input.value));
	return input;
}

function renderInlineRenameInput(
	container: HTMLElement,
	contextViewService: IContextViewService,
	state: IInlineRenameValueState,
	ariaLabel: string,
	disposables: DisposableStore,
	onFinish: (title: string | undefined, restoreListFocus: boolean) => void,
): InputBox {
	const input = createInlineRenameInputBox(container, contextViewService, state, {
		inputBoxStyles: defaultInputBoxStyles,
		ariaLabel,
		validationOptions: {
			validation: value => value.trim()
				? null
				: { content: localize('inlineRename.empty', "Title cannot be empty"), type: MessageType.ERROR },
		},
	}, disposables);

	let done = false;
	const finish = (commit: boolean, restoreListFocus: boolean) => {
		if (done) {
			return;
		}
		const title = input.value.trim();
		if (commit && !title) {
			if (restoreListFocus) {
				input.validate();
				input.focus();
				return;
			}
			commit = false;
		}

		done = true;
		input.hideMessage();
		onFinish(commit && title !== state.initialValue.trim() ? title : undefined, restoreListFocus);
	};

	disposables.add(DOM.addStandardDisposableListener(input.inputElement, DOM.EventType.KEY_DOWN, event => {
		if (event.equals(KeyCode.Enter)) {
			event.preventDefault();
			event.stopPropagation();
			finish(true, true);
		} else if (event.equals(KeyCode.Escape)) {
			event.preventDefault();
			event.stopPropagation();
			finish(false, true);
		}
	}));
	disposables.add(DOM.addDisposableListener(input.inputElement, DOM.EventType.BLUR, () => finish(true, false)));
	disposables.add(toDisposable(() => DOM.clearNode(container)));
	return input;
}

export interface ISessionOnboardingTarget {
	readonly session: ISession;
	readonly archiveAction: boolean;
}

const SESSION_EXTERNAL_APPLICATION_BADGE_HOVERED_CLASS = 'external-application-badge-hovered';

export interface ISessionItemTemplate {
	readonly container: HTMLElement;
	scheduledIndicator?: HTMLElement;
	readonly statusIcon: SessionStatusIcon;
	readonly title: HighlightedLabel;
	readonly titleRow: HTMLElement;
	readonly titleContainer: HTMLElement;
	readonly externalApplicationBadge: HTMLElement;
	readonly externalApplicationBadgeLabel: HTMLElement;
	/** While searching, the search hint of a row without a details row. */
	readonly titleSearchHint: HTMLElement;
	readonly titleInputContainer: HTMLElement;
	readonly compactHoverDescription: HTMLElement;
	readonly titleToolbar: MenuWorkbenchToolBar | undefined;
	readonly renderedSession: ISettableObservable<ISession | undefined>;
	readonly pendingVoiceIndicator: HTMLElement;
	readonly comparisonAttemptStatus: HTMLElement;
	readonly comparisonAttemptStatusLabel: HTMLElement;
	readonly detailsRow: HTMLElement;
	readonly approvalRow: HTMLElement;
	readonly approvalLabel: HTMLElement;
	readonly approvalButtonContainer: HTMLElement;
	readonly inputNeededRow: HTMLElement;
	readonly inputNeededLabel: HTMLElement;
	readonly ciRow: HTMLElement;
	readonly ciLabel: HTMLElement;
	readonly ciButtonContainer: HTMLElement;
	readonly contextKeyService: IContextKeyService;
	readonly statusContext: IContextKey<SessionStatus>;
	readonly isReadContext: IContextKey<boolean>;
	readonly isArchivedContext: IContextKey<boolean>;
	readonly isQuickChatContext: IContextKey<boolean>;
	readonly supportsMultipleChatsContext: IContextKey<boolean>;
	readonly supportsDeleteContext: IContextKey<boolean>;
	readonly disposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
}

/** Payload emitted when the user approves a session's pending action. */
export interface IApprovedSession {
	readonly session: ISession;
	/**
	 * Identity of the approval that was allowed, so consumers can tell this exact
	 * approval apart from a later, distinct one on the same session.
	 */
	readonly approvalId: string;
}

/** Summary of a session's failing CI checks, backing its "Fix CI" row. */
export interface ISessionCIFixState {
	/** Number of checks that have completed with a failing conclusion. */
	readonly failed: number;
	/** Number of checks still running or queued. */
	readonly pending: number;
}

/**
 * Supplies the per-session "Fix CI" row shown for blocked sessions whose pull
 * request has failing CI checks. Only the blocked-sessions dropdown provides one
 * (via {@link ISessionsFlatListOptions.ciFixModel}), so the row never appears in
 * any other session list.
 */
export interface ISessionCIFixModel {
	/**
	 * Observable CI-failure summary for a session, or `undefined` when it has no
	 * failing checks (or the user already requested a fix for the current commit).
	 */
	getCIFix(session: ISession): IObservable<ISessionCIFixState | undefined>;
	/** Kick off the fix-CI flow for the session in the background (no session is opened). */
	fixCI(session: ISession): void;
}

export class SessionItemRenderer implements ITreeRenderer<SessionListItem, FuzzyScore, ISessionItemTemplate> {
	static readonly TEMPLATE_ID = 'session-item';
	readonly templateId = SessionItemRenderer.TEMPLATE_ID;
	readonly rowClassName = 'session-list-inset-row';

	readonly scheduledIndicatorRenderer: ScheduledRequestsIndicatorRenderer;

	private static readonly _APPROVAL_ROW_LINE_HEIGHT = 18;
	private static readonly _APPROVAL_ROW_OVERHEAD = 14;

	/** Height of the single-line "Fix CI" row (label + orange button), including its top margin. */
	static readonly CI_ROW_HEIGHT = 32;

	static getApprovalRowHeight(approval: IAgentSessionApprovalInfo, maxLines: number = DEFAULT_APPROVAL_ROW_MAX_LINES): number {
		const lineCount = Math.min(approval.label.split(/\r?\n/).length, maxLines) + (approval.executionTarget?.workingDirectory ? 1 : 0);
		return lineCount * SessionItemRenderer._APPROVAL_ROW_LINE_HEIGHT + SessionItemRenderer._APPROVAL_ROW_OVERHEAD;
	}

	private readonly _onDidChangeItemHeight = new Emitter<ISession>();
	readonly onDidChangeItemHeight: Event<ISession> = this._onDidChangeItemHeight.event;

	private readonly _onDidApproveSession = new Emitter<IApprovedSession>();
	/** Fires when the user approves a session's pending action via its "Allow" button. */
	readonly onDidApproveSession: Event<IApprovedSession> = this._onDidApproveSession.event;
	private readonly editingSession = observableValue<ISession | undefined>(this, undefined);
	private activeRenameInput: { readonly session: ISession; readonly input: InputBox } | undefined;
	private renameState: (IInlineRenameValueState & { readonly session: ISession }) | undefined;

	constructor(
		private readonly options: {
			grouping: () => SessionsGrouping; isPinned: (session: ISession) => boolean; isRenderedInCustomGroup?: (session: ISession) => boolean; getGroupConnectorPosition?: (session: ISession) => SessionGroupConnectorPosition | undefined; getComparisonAttemptLabel?: (session: ISession) => string | undefined; shouldShowComparisonAttemptStatus?: (session: ISession, reader: IReader) => boolean; slotPanes: IObservable<readonly ISessionGridPane[]>; getMultiSelectedSessions: (session: ISession) => ISession[]; showHover: boolean; onDidChangeHoverVisibility?: (visible: boolean) => void; useCompactQuickChatRows: boolean; compact: () => boolean; approvalRowMaxLines: number; aggregateChatApprovals: boolean; toolbarMenuId: MenuId | undefined; toolbarTelemetrySource: string; inlineRename: boolean; contextViewService?: IContextViewService; handleToolbarAction?: (action: IAction, session: ISession) => boolean | Promise<boolean>; onDidDoubleClickRename?: (session: ISession) => void; onDidFinishRename?: () => void; onDidRequestRename?: (session: ISession) => void; activeGuideSessionIds?: IObservable<ReadonlySet<string>>;
			/** Whether status presentation derives from the main chat instead of the aggregate session. */
			deriveStatusFromMainChat?: boolean;
			/** The chat the main window shows, whose row is the open one. */
			mainWindowShown?: IObservable<IShownChat | undefined>;
			/** Sessions whose collapsed child rows should contribute active status to the parent row. */
			collapsedSessionIds?: IObservable<ReadonlySet<string>>;
			getAdditionalContextKeys?: SessionContextKeyProvider;
			showMetadataWhileActive?: (session: ISession) => boolean;
			showMetadataSeparators?: boolean;
			getCompletedStatusMessage?: (session: ISession, reader: IReader | undefined) => string | undefined;
			getTriageDescription?: (session: ISession, reader: IReader | undefined) => string | undefined;
			onboardingTarget?: IObservable<ISessionOnboardingTarget | undefined>;
			isRenderedInExternalSection?: (session: ISession) => boolean;
			isWorkspaceScoped?: () => boolean;
			/** How many groups deep the custom group whose rows include the session's row is nested; the row steps in by that many levels. */
			getGroupDepth?: (session: ISession) => number;
			/** The environment badge of a session in a repository section, or `undefined` when it runs on this computer. */
			getEnvironmentBadgeLabel?: (session: ISession) => string | undefined;
			externalApplicationBadgeMode?: IObservable<ExternalSessionApplicationBadgeMode>;
			externalApplicationBadgeShowFrom?: IObservable<boolean>;
			reportExternalApplicationBadgeModeExperimentTrigger?: () => void;
			reportExternalApplicationBadgeShowFromExperimentTrigger?: () => void;
			/** While searching, the field a session matched in that neither its row, through `shownTexts`, nor its section headers show. */
			getSearchHint?: (session: ISession, shownTexts: readonly string[]) => ISessionSearchHint | undefined;
			scheduledSessionResources?: IObservable<ReadonlySet<string>>;
			/** Scheduled messages keyed by their exact chat resource. */
			scheduledRequests?: IObservable<ReadonlyMap<string, readonly IChatScheduledRequest[]>>;
			focusSession?: (session: ISession) => void;
		},
		private readonly approvalModel: AgentSessionApprovalModel | undefined,
		private readonly ciFixModel: ISessionCIFixModel | undefined,
		private readonly instantiationService: IInstantiationService,
		private readonly contextKeyService: IContextKeyService,
		private readonly configurationService: IConfigurationService,
		private readonly markdownRendererService: IMarkdownRendererService,
		private readonly hoverService: IHoverService,
		private readonly sessionsProvidersService: ISessionsProvidersService,
		private readonly sessionsManagementService: ISessionsManagementService,
		private readonly agentHostConnectionsService: IAgentHostConnectionsService,
		private readonly openerService: IOpenerService,
		private readonly labelService: ILabelService,
		// TEMPORARY — see the note on the `IAgentSessionsService` import above (#320480).
		private readonly agentSessionsService: IAgentSessionsService,
		private readonly _voicePlaybackService: IVoicePlaybackService,
		notificationService: INotificationService,
	) {
		this.scheduledIndicatorRenderer = new ScheduledRequestsIndicatorRenderer(hoverService, notificationService, options.scheduledRequests);
	}

	renderTemplate(container: HTMLElement): ISessionItemTemplate {
		const disposables = new DisposableStore();
		const elementDisposables = disposables.add(new DisposableStore());
		const renderedSession = observableValue<ISession | undefined>('renderedSession', undefined);

		container.classList.add('session-item');

		DOM.append(container, $('span.session-group-connector', { 'aria-hidden': 'true' }));
		DOM.append(container, $('span.session-attention-indicator', { 'aria-hidden': 'true' }));
		const iconContainer = DOM.append(container, $('.session-icon'));
		const statusIcon = disposables.add(this.instantiationService.createInstance(SessionStatusIcon, iconContainer));
		const mainCol = DOM.append(container, $('.session-main'));
		const titleRow = DOM.append(mainCol, $('.session-title-row'));
		const titleContainer = DOM.append(titleRow, $('.session-title'));
		const title = disposables.add(new HighlightedLabel(titleContainer));
		const externalApplicationBadge = DOM.append(titleRow, $('span.session-external-application-badge.session-external-application-badge-title'));
		externalApplicationBadge.setAttribute('aria-hidden', 'true');
		const externalApplicationBadgeLabel = DOM.append(externalApplicationBadge, $('span.session-external-application-badge-label'));
		disposables.add(DOM.addDisposableListener(externalApplicationBadge, DOM.EventType.MOUSE_ENTER, () => {
			externalApplicationBadge.closest('.monaco-list-row')?.classList.add(SESSION_EXTERNAL_APPLICATION_BADGE_HOVERED_CLASS);
		}));
		disposables.add(DOM.addDisposableListener(externalApplicationBadge, DOM.EventType.MOUSE_LEAVE, () => {
			externalApplicationBadge.closest('.monaco-list-row')?.classList.remove(SESSION_EXTERNAL_APPLICATION_BADGE_HOVERED_CLASS);
		}));
		// The row's ARIA label names the search hint.
		const titleSearchHint = DOM.append(titleRow, $('span.session-search-hint.session-search-hint-title', { 'aria-hidden': 'true' }));
		const titleInputContainer = DOM.append(titleRow, $('.session-title-input.session-inline-rename-input'));
		for (const eventType of ['pointerdown', 'pointerup', 'click', 'dblclick'] as const) {
			disposables.add(DOM.addDisposableListener(titleInputContainer, eventType, e => e.stopPropagation()));
		}
		disposables.add(Gesture.ignoreTarget(titleInputContainer));
		const compactHoverDescription = DOM.append(titleRow, $('.session-compact-hover-description'));
		const titleToolbarContainer = DOM.append(titleRow, $('.session-title-toolbar'));
		// Shown when a voice response arrived while this session was unfocused and
		// is held until it is (mirrors the main window's sessions viewer).
		const pendingVoiceIndicator = DOM.append(titleRow, $('.session-pending-voice-indicator'));
		const comparisonAttemptStatus = DOM.append(titleRow, $('span.session-comparison-attempt-status'));
		const comparisonAttemptStatusLabel = DOM.append(comparisonAttemptStatus, $('span.session-comparison-attempt-status-label'));
		// The list opens a session on click and on Gesture `tap` (touch).
		// DOM event propagation stops only cover mouse/pointer events; the
		// list's tap handler reads from `Gesture` directly, bypassing
		// bubbling. Combine both: stop pointer/click for mouse, and
		// register the toolbar with `Gesture.ignoreTarget` so synthesized
		// tap events on touch never reach the list either.
		for (const eventType of ['pointerdown', 'pointerup', 'click', 'dblclick'] as const) {
			disposables.add(DOM.addDisposableListener(titleToolbarContainer, eventType, e => e.stopPropagation()));
		}
		disposables.add(Gesture.ignoreTarget(titleToolbarContainer));
		const detailsRow = DOM.append(mainCol, $('.session-details-row'));

		// Approval row
		const approvalRow = DOM.append(mainCol, $('.session-approval-row'));
		const approvalLabel = DOM.append(approvalRow, $('span.session-approval-label'));
		const approvalButtonContainer = DOM.append(approvalRow, $('.session-approval-button'));

		const inputNeededRow = DOM.append(mainCol, $('.session-input-needed-row.session-approval-row'));
		inputNeededRow.setAttribute('aria-hidden', 'true');
		const inputNeededLabel = DOM.append(inputNeededRow, $('span.session-input-needed-label'));

		// Fix-CI row — shown only in the blocked-sessions list for sessions whose
		// pull request has failing CI checks. Styled like the chat input's CI banner.
		const ciRow = DOM.append(mainCol, $('.session-ci-row'));
		const ciLabel = DOM.append(ciRow, $('span.session-ci-label'));
		const ciButtonContainer = DOM.append(ciRow, $('.session-ci-button'));
		// The list opens a session on click/tap. The "Fix CI" button opens the
		// session itself as part of its flow, so swallow row clicks here to stop
		// them bubbling to the tree and triggering a second, racing open.
		for (const eventType of ['pointerdown', 'pointerup', 'click', 'dblclick'] as const) {
			disposables.add(DOM.addDisposableListener(ciRow, eventType, e => e.stopPropagation()));
		}
		disposables.add(Gesture.ignoreTarget(ciRow));

		const contextKeyService = disposables.add(this.contextKeyService.createScoped(container));
		const statusContext = SessionItemStatusContext.bindTo(contextKeyService);
		const isReadContext = SessionIsReadContext.bindTo(contextKeyService);
		const isArchivedContext = SessionIsArchivedContext.bindTo(contextKeyService);
		const isQuickChatContext = IsQuickChatSessionContext.bindTo(contextKeyService);
		const supportsMultipleChatsContext = SessionSupportsMultipleChatsContext.bindTo(contextKeyService);
		const supportsDeleteContext = SessionSupportsDeleteContext.bindTo(contextKeyService);
		const scopedInstantiationService = disposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
		let titleToolbar: MenuWorkbenchToolBar | undefined;
		if (this.options.toolbarMenuId) {
			const actionRunner = disposables.add(new SessionItemActionRunner(this.options.getMultiSelectedSessions, this.options.handleToolbarAction));
			const actionViewItemProvider = createSessionActionViewItemProvider(scopedInstantiationService, this.configurationService);
			const grouping = this.options.grouping;
			const onboardingTarget = this.options.onboardingTarget;
			titleToolbar = disposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, titleToolbarContainer, this.options.toolbarMenuId, {
				menuOptions: { shouldForwardArgs: true },
				actionRunner,
				telemetrySource: this.options.toolbarTelemetrySource,
				actionViewItemProvider: (action, options) => {
					if (action.id !== ARCHIVE_SESSION_COMMAND_ID || !(action instanceof MenuItemAction)) {
						return actionViewItemProvider(action, options);
					}
					return scopedInstantiationService.createInstance(class extends SessionArchiveActionViewItem {
						protected override getTooltip(): string {
							return grouping() === SessionsGrouping.Inbox
								? this._keybindingService.appendKeybinding(action.tooltip || action.label, action.id, contextKeyService, true)
								: super.getTooltip();
						}

						override render(container: HTMLElement): void {
							super.render(container);
							if (!onboardingTarget) {
								return;
							}
							this._register(autorun(reader => {
								const session = renderedSession.read(reader);
								if (session && this.label) {
									reader.store.add(markOnboardingTarget(this.label, getSessionArchiveOnboardingTargetId(session)));
								}
							}));
						}
					}, action, getSessionArchiveActionViewItemOptions(options, this.configurationService));
				},
			}));
		}

		return { container, statusIcon, title, titleRow, titleContainer, externalApplicationBadge, externalApplicationBadgeLabel, titleSearchHint, titleInputContainer, compactHoverDescription, titleToolbar, renderedSession, pendingVoiceIndicator, comparisonAttemptStatus, comparisonAttemptStatusLabel, detailsRow, approvalRow, approvalLabel, approvalButtonContainer, inputNeededRow, inputNeededLabel, ciRow, ciLabel, ciButtonContainer, contextKeyService, statusContext, isReadContext, isArchivedContext, isQuickChatContext, supportsMultipleChatsContext, supportsDeleteContext, disposables, elementDisposables };
	}

	renderElement(node: ITreeNode<SessionListItem, FuzzyScore>, _index: number, template: ISessionItemTemplate): void {
		const element = node.element;
		if (!isSessionItem(element)) {
			return;
		}
		template.container.closest('.monaco-list-row')?.classList.toggle('sessions-disclosure-row', node.collapsible);
		this.renderSession(element, template, node.filterData && createMatches(node.filterData));
	}

	renderTwistie(element: SessionListItem, twistieElement: HTMLElement): boolean {
		// The twistie is a sibling of the row contents, so it needs its own depth to step in with them.
		setSessionGroupDepth(twistieElement, isSessionItem(element) ? this.options.getGroupDepth?.(element) ?? 0 : 0);
		return false;
	}

	private renderSession(element: ISession, template: ISessionItemTemplate, matches?: IMatch[]): void {
		template.elementDisposables.clear();
		const scheduledSessionResources = this.options.scheduledSessionResources;
		this.scheduledIndicatorRenderer.render(reader => element.mainChat.read(reader).resource, template, () => this.options.focusSession?.(element),
			scheduledSessionResources ? reader => scheduledSessionResources.read(reader).has(element.resource.toString()) : undefined);
		const groupDepth = this.options.getGroupDepth?.(element) ?? 0;
		setSessionGroupDepth(template.container, groupDepth);
		template.container.closest('.monaco-list-row')?.classList.remove(SESSION_EXTERNAL_APPLICATION_BADGE_HOVERED_CLASS);
		template.renderedSession.set(element, undefined);
		template.elementDisposables.add(toDisposable(() => {
			template.renderedSession.set(undefined, undefined);
			template.container.classList.remove('archive-onboarding', 'renaming');
		}));
		if (this.options.onboardingTarget) {
			template.elementDisposables.add(autorun(reader => {
				const target = this.options.onboardingTarget?.read(reader);
				const isTarget = target?.session.sessionId === element.sessionId;
				template.container.classList.toggle('archive-onboarding', isTarget && target.archiveAction);
				if (isTarget && !target.archiveAction) {
					reader.store.add(markOnboardingTarget(template.container, getSessionOnboardingTargetId(element)));
				}
			}));
		}
		const groupConnectorPosition = this.options.getGroupConnectorPosition?.(element);
		const comparisonAttemptLabel = this.options.getComparisonAttemptLabel?.(element);
		template.container.classList.toggle('session-comparison-attempt', comparisonAttemptLabel !== undefined);
		if (groupConnectorPosition) {
			template.container.dataset.sessionGroupConnector = groupConnectorPosition;
		} else {
			delete template.container.dataset.sessionGroupConnector;
		}

		if (this.options.inlineRename) {
			template.elementDisposables.add(DOM.addDisposableListener(template.titleRow, DOM.EventType.DBLCLICK, (event: MouseEvent) => {
				if (
					event.button !== 0 ||
					event.altKey ||
					event.ctrlKey ||
					event.metaKey ||
					event.shiftKey ||
					!element.capabilities.get().supportsRename
				) {
					return;
				}

				event.preventDefault();
				event.stopPropagation();
				if (this.beginRename(element)) {
					this.options.onDidDoubleClickRename?.(element);
				}
			}));
		}

		// TEMPORARY (#320480): trigger lazy resolve of expensive session
		// properties (e.g. changes) for rows that scroll into view, so providers
		// that populate them on demand deliver fresh data by the time the row
		// renders. This reaches into a Copilot-provider internal and must be
		// moved into the provider — see the note on the import above.
		this.agentSessionsService.model.observeSession(element.resource);

		// Set by the details row while it shows, and so observes, the open main chat's Branch Changes.
		let rowObservesMainChatBranchChanges = false;
		if (this.options.showHover) {
			// Rich hover on the row: the same widget session pills use in chat output.
			template.elementDisposables.add(this.hoverService.setupDelayedHover(template.container, () => {
				const hover = createSessionSummaryHover(
					element,
					// Observed Branch Changes are read from memory; reading unobserved ones would load the chat from its backend.
					getSessionSummaryHoverData(element, this.sessionsProvidersService, this.openerService, this.labelService, getCreatorHoverData(element, this.sessionsManagementService, this.agentHostConnectionsService, this.openerService), this.options.compact(), rowObservesMainChatBranchChanges),
					this.openerService,
				);
				const triage = this.options.getTriageDescription?.(element, undefined);
				if (triage && DOM.isHTMLElement(hover.content)) {
					DOM.append(hover.content, $('div', undefined, triage));
				}
				const presentedHover = withSessionsListHoverPresentation(hover);
				return {
					...presentedHover,
					onDidShow: () => {
						presentedHover.onDidShow?.();
						this.options.onDidChangeHoverVisibility?.(true);
					},
					onDidHide: () => {
						presentedHover.onDidHide?.();
						this.options.onDidChangeHoverVisibility?.(false);
					},
				};
			}, { groupId: 'sessions-list' }));
		}

		// Pending voice response indicator: a response arrived while this session
		// was unfocused and is held until it is.
		const pendingVoiceResource = element.resource;
		template.pendingVoiceIndicator.className = 'session-pending-voice-indicator ' + ThemeIcon.asClassName(Codicon.unmute);
		template.elementDisposables.add(this.hoverService.setupManagedHover(
			getDefaultHoverDelegate('element'),
			template.pendingVoiceIndicator,
			localize('pendingVoiceResponse', "Voice response ready"),
		));
		template.elementDisposables.add(autorun(reader => {
			this._voicePlaybackService.pendingResponseVersion.read(reader);
			template.pendingVoiceIndicator.classList.toggle('visible', this._voicePlaybackService.hasPendingResponse(pendingVoiceResource));
		}));

		// Toolbar context
		if (template.titleToolbar) {
			template.titleToolbar.context = element;
		}

		// Context keys
		const isPinned = this.options.isPinned(element);
		IsSessionPinnedContext.bindTo(template.contextKeyService).set(isPinned);
		const getAdditionalContextKeys = this.options.getAdditionalContextKeys;
		if (getAdditionalContextKeys) {
			const contextKeys = new Map<string, IContextKey<ContextKeyValue>>();
			template.elementDisposables.add(autorun(reader => {
				const values = new Map(getAdditionalContextKeys(element, reader));
				template.contextKeyService.bufferChangeEvents(() => {
					for (const [key, contextKey] of contextKeys) {
						if (!values.has(key)) {
							contextKey.reset();
							contextKeys.delete(key);
						}
					}
					for (const [key, value] of values) {
						let contextKey = contextKeys.get(key);
						if (!contextKey) {
							contextKey = template.contextKeyService.createKey<ContextKeyValue>(key, undefined);
							contextKeys.set(key, contextKey);
						}
						contextKey.set(value);
					}
				});
			}));
			template.elementDisposables.add(toDisposable(() => {
				template.contextKeyService.bufferChangeEvents(() => {
					for (const contextKey of contextKeys.values()) {
						contextKey.reset();
					}
				});
			}));
		}
		SessionItemInExternalSectionContext.bindTo(template.contextKeyService).set(this.options.isRenderedInExternalSection?.(element) ?? false);
		SessionItemIsCloudContext.bindTo(template.contextKeyService).set(element.environment === 'cloud');
		const canImportContext = SessionItemCanImportContext.bindTo(template.contextKeyService);

		// Pinned & archived styling — reactive
		template.elementDisposables.add(autorun(reader => {
			const isArchived = element.isArchived.read(reader);
			template.container.classList.toggle('archived', isArchived);
			// Only apply pinned styling when not archived to avoid persistent toolbars on archived sessions
			template.container.classList.toggle('pinned', isPinned && !isArchived);
		}));

		// Hierarchy indent/connector guides — shown for this session while it (or
		// one of its chat children) is selected or focused. While the pointer is
		// over the Sessions pane, CSS shows every hierarchy's guides.
		template.elementDisposables.add(autorun(reader => {
			const showGuides = (this.options.activeGuideSessionIds?.read(reader) ?? EMPTY_GUIDE_SESSION_IDS).has(element.sessionId);
			template.container.classList.toggle('session-hierarchy-guides-visible', showGuides);
		}));

		// Sticky styling — reactive on the sticky observable of the session's slot
		template.elementDisposables.add(autorun(reader => {
			const pane = this.options.slotPanes.read(reader).find(candidate => candidate.session.read(reader)?.sessionId === element.sessionId);
			const isSticky = pane ? pane.sticky.read(reader) : false;
			template.container.classList.toggle('sticky', isSticky);
		}));

		// Icon — reactive based on status, read state, PR, and motion preference.
		// The current icon CSS selector is stored on the template (not a local
		// variable) so it survives across renderSession calls — the tree re-renders
		// all visible rows on every splice, which clears elementDisposables and
		// recreates the autorun. Without template-level tracking, the selector
		// resets to undefined and the DOM is rebuilt every time, restarting the
		// CSS spin animation.
		let agentMergeConfiguration: IObservable<ISessionAgentMergeConfiguration | undefined> | undefined;
		template.elementDisposables.add(autorun(reader => {
			const collapsed = this.options.collapsedSessionIds?.read(reader).has(element.sessionId) ?? true;
			const sessionStatus = getSessionRowStatus(
				element,
				reader,
				!!this.options.deriveStatusFromMainChat,
				collapsed && comparisonAttemptLabel === undefined,
			);
			template.statusContext.set(sessionStatus);
			const isRead = getSessionRowIsRead(element, reader, !!this.options.deriveStatusFromMainChat);
			template.isReadContext.set(element.mainChat.read(reader).isRead.read(reader));
			const isArchived = element.isArchived.read(reader);
			template.isArchivedContext.set(isArchived);
			const isQuickChat = element.isQuickChat?.read(reader) ?? false;
			const capabilities = element.capabilities.read(reader);
			canImportContext.set(element.isExternal?.read(reader) === true && capabilities.supportsImport === true);
			template.isQuickChatContext.set(isQuickChat);
			template.supportsMultipleChatsContext.set(capabilities.supportsMultipleChats);
			template.supportsDeleteContext.set(capabilities.supportsDelete === true);
			const completedStateIcon = getSessionCompletedStateIcon(element, reader, () => agentMergeConfiguration ??= getSessionAgentMergeConfigurationObservable(element, this.sessionsProvidersService, this.configurationService));

			// The status icon widget snaps on row recycling and cross-fades real state changes.
			template.statusIcon.setStatus(sessionStatus, isRead, isArchived, completedStateIcon, element.resource);
			template.container.classList.toggle('in-progress', sessionStatus === SessionStatus.InProgress);
			template.container.classList.toggle('needs-input', sessionStatus === SessionStatus.NeedsInput);
			template.container.classList.toggle('unread', !isRead && !isArchived);
			template.container.classList.toggle('quick-chat', isQuickChat && this.options.useCompactQuickChatRows);
			let showComparisonAttemptStatus = comparisonAttemptLabel !== undefined && (this.options.shouldShowComparisonAttemptStatus?.(element, reader) ?? true);
			switch (sessionStatus) {
				case SessionStatus.InProgress:
					template.comparisonAttemptStatusLabel.textContent = '';
					showComparisonAttemptStatus = false;
					break;
				case SessionStatus.NeedsInput:
					template.comparisonAttemptStatusLabel.textContent = localize('comparisonAttemptNeedsInput', "Attention needed");
					break;
				case SessionStatus.Completed:
					template.comparisonAttemptStatusLabel.textContent = '';
					showComparisonAttemptStatus = false;
					break;
				case SessionStatus.Error:
					template.comparisonAttemptStatusLabel.textContent = localize('comparisonAttemptFailed', "Failed");
					break;
				default:
					template.comparisonAttemptStatusLabel.textContent = localize('comparisonAttemptPending', "Pending");
			}
			template.comparisonAttemptStatus.classList.toggle('visible', showComparisonAttemptStatus);
		}));

		// Title — reactive
		template.elementDisposables.add(autorun(reader => {
			const titleText = comparisonAttemptLabel ?? element.title.read(reader);
			template.title.set(titleText, matches);
		}));
		template.elementDisposables.add(autorun(reader => {
			const eligible = isExternalApplicationBadgeEligible(element, reader);
			if (!eligible) {
				template.externalApplicationBadge.classList.remove('visible');
				return;
			}
			this.options.reportExternalApplicationBadgeModeExperimentTrigger?.();
			const mode = this.options.externalApplicationBadgeMode?.read(reader) ?? ExternalSessionApplicationBadgeMode.Off;
			if (eligible && mode !== ExternalSessionApplicationBadgeMode.Off) {
				this.options.reportExternalApplicationBadgeShowFromExperimentTrigger?.();
			}
			// Rows without a details row (compact rows, compact quick-chat rows, comparison attempts) show the badge next to the title instead.
			const hasDetailsRow = comparisonAttemptLabel === undefined
				&& !((element.isQuickChat?.read(reader) ?? false) && this.options.useCompactQuickChatRows)
				&& !this.options.compact();
			const showInTitle = mode === ExternalSessionApplicationBadgeMode.Title
				|| (mode === ExternalSessionApplicationBadgeMode.Details && !hasDetailsRow);
			template.externalApplicationBadge.classList.toggle('visible', showInTitle);
			const badgeLabel = getExternalApplicationBadgeLabel(
				element.application.read(reader).label,
				this.options.externalApplicationBadgeShowFrom?.read(reader) ?? false,
			);
			template.externalApplicationBadgeLabel.textContent = badgeLabel;
			if (showInTitle) {
				reader.store.add(this.hoverService.setupDelayedHoverAtMouse(template.externalApplicationBadge, { content: badgeLabel }));
			}
		}));
		template.elementDisposables.add(autorun(reader => {
			const editingSession = this.editingSession.read(reader);
			const editing = !!editingSession && isEqual(editingSession.resource, element.resource);
			template.container.classList.toggle('renaming', editing);
			if (editing) {
				this.renderRenameInput(element, template, reader.store);
			}
		}));

		// Details row — reactive: badge · diff stats · time · status description
		const timeDisposable = template.elementDisposables.add(new MutableDisposable());
		const descriptionDisposable = template.elementDisposables.add(new MutableDisposable());
		template.elementDisposables.add(autorun(reader => {
			const sessionStatus = getSessionRowStatus(
				element,
				reader,
				!!this.options.deriveStatusFromMainChat,
				this.options.collapsedSessionIds?.read(reader).has(element.sessionId) ?? true,
			);
			const workspace = element.workspace.read(reader);
			const description = element.description.read(reader);
			const isQuickChat = element.isQuickChat?.read(reader) ?? false;
			const eligible = isExternalApplicationBadgeEligible(element, reader);
			rowObservesMainChatBranchChanges = false;

			// Clear and rebuild details row
			DOM.clearNode(template.detailsRow);
			DOM.clearNode(template.compactHoverDescription);
			DOM.clearNode(template.titleSearchHint);

			const hasDetailsRow = comparisonAttemptLabel === undefined && !(isQuickChat && this.options.useCompactQuickChatRows) && !this.options.compact();
			const workspaceBadgeLabel = getSessionRowLocationLabel(element, reader, this.options);
			// When the session is InProgress or NeedsInput, hide workspace/diff details in this row
			const hideDetails = !this.options.showMetadataWhileActive?.(element) && (sessionStatus === SessionStatus.InProgress || sessionStatus === SessionStatus.NeedsInput);
			const badgeLabel = isQuickChat
				? localize('quickChatBadge', "No workspace")
				: workspaceBadgeLabel;

			// While searching, name the field the session matched in that its row and section headers don't show: in the
			// details row, also while the session is active, or next to the title when the row has no details row.
			const searchHint = this.options.getSearchHint?.(element, hasDetailsRow && !hideDetails && badgeLabel ? [badgeLabel] : []);
			template.titleSearchHint.classList.toggle('visible', !!searchHint && !hasDetailsRow);
			if (searchHint && !hasDetailsRow) {
				renderSearchHint(template.titleSearchHint, searchHint, reader.store);
			}

			// Compact quick chats have no details row.
			if (comparisonAttemptLabel !== undefined || (isQuickChat && this.options.useCompactQuickChatRows)) {
				descriptionDisposable.clear();
				timeDisposable.clear();
				return;
			}

			if (this.options.compact()) {
				descriptionDisposable.clear();
				timeDisposable.clear();

				if (workspaceBadgeLabel) {
					DOM.append(template.compactHoverDescription, $('span.session-badge', undefined, workspaceBadgeLabel));
				}
				return;
			}

			const showsMainChatDiffStats = this.options.deriveStatusFromMainChat && (workspace?.folders.length ?? 0) > 1;
			rowObservesMainChatBranchChanges = !!showsMainChatDiffStats && isOpenChat(element, element.mainChat.read(reader), this.options.mainWindowShown, reader);
			const diffStats = showsMainChatDiffStats
				? getSessionListChatDiffStats(element, element.mainChat.read(reader), this.options.mainWindowShown, reader)
				: getSessionDiffStats(element, reader);
			const mainChat = element.mainChat.read(reader);
			const timeDate = getSessionRowUpdatedAt(element, mainChat, reader, this.options.grouping(), this.options.showMetadataWhileActive?.(element));
			const appendSeparator = () => {
				if (this.options.showMetadataSeparators && template.detailsRow.childElementCount > 0) {
					DOM.append(template.detailsRow, $('span.session-separator.has-separator', { 'aria-hidden': 'true' }));
				}
			};

			if (
				eligible &&
				this.options.externalApplicationBadgeMode?.read(reader) === ExternalSessionApplicationBadgeMode.Details
			) {
				const badgeEl = DOM.append(template.detailsRow, $('span.session-external-application-badge.session-external-application-badge-details'));
				const badgeLabel = getExternalApplicationBadgeLabel(
					element.application.read(reader).label,
					this.options.externalApplicationBadgeShowFrom?.read(reader) ?? false,
				);
				DOM.append(badgeEl, $('span.session-external-application-badge-label', undefined, badgeLabel));
				reader.store.add(this.hoverService.setupDelayedHoverAtMouse(badgeEl, { content: badgeLabel }));
			}

			const statusMessage = getSessionStatusMessage(sessionStatus, description)
				?? (sessionStatus === SessionStatus.Completed ? this.options.getCompletedStatusMessage?.(element, reader) : undefined);
			if (sessionStatus !== SessionStatus.InProgress || !hideDetails) {
				appendSeparator();
				let icon: ThemeIcon;
				if (isQuickChat) {
					icon = Codicon.commentDiscussion;
				} else {
					const presentationWorkspace = getSessionPresentationWorkspace(element, reader);
					const kind = getSessionWorkspaceKind(presentationWorkspace, element.worktreePending?.read(reader));
					icon = presentationWorkspace?.typeIcon ?? (kind === SessionWorkspaceKind.Virtual ? Codicon.cloudCompact : kind === SessionWorkspaceKind.Folder ? Codicon.folderCompact : Codicon.worktreeCompact);
				}
				const typeIconEl = DOM.append(template.detailsRow, $('span.session-details-icon'));
				DOM.append(typeIconEl, $(`span${ThemeIcon.asCSSSelector(icon)}`));
			}

			if (!hideDetails && badgeLabel) {
				const badgeEl = DOM.append(template.detailsRow, $('span.session-badge'));
				badgeEl.textContent = badgeLabel;
			}

			const triage = this.options.getTriageDescription?.(element, reader);
			if (triage) {
				appendSeparator();
				const label = DOM.append(template.detailsRow, $('span.session-description', undefined, triage));
				reader.store.add(this.hoverService.setupDelayedHoverAtMouse(label, { content: triage }));
			}

			if (searchHint) {
				appendSeparator();
				const hintEl = DOM.append(template.detailsRow, $('span.session-search-hint'));
				renderSearchHint(hintEl, searchHint, reader.store);
			}

			// Diff stats
			if (!isQuickChat && !hideDetails && diffStats) {
				appendSeparator();
				const diffEl = DOM.append(template.detailsRow, $('span.session-diff'));
				DOM.append(diffEl, $('span.session-diff-added')).textContent = `+${diffStats.insertions}`;
				DOM.append(diffEl, $('span.session-diff-removed')).textContent = `-${diffStats.deletions}`;
			}

			if (statusMessage !== undefined) {
				appendSeparator();
				const statusEl = DOM.append(template.detailsRow, $('span.session-description'));
				if (typeof statusMessage === 'string') {
					descriptionDisposable.clear();
					statusEl.textContent = statusMessage;
				} else {
					descriptionDisposable.value = this.markdownRendererService.render(statusMessage, { sanitizerConfig: { replaceWithPlaintext: true } }, statusEl);
				}
			} else {
				descriptionDisposable.clear();
			}

			if (timeDate) {
				appendSeparator();
				const timeEl = DOM.append(template.detailsRow, $('span.session-time'));
				const definiteTimeDate = timeDate;
				const formatTime = () => formatSessionListTime(definiteTimeDate);
				timeEl.textContent = formatTime();
				const targetWindow = DOM.getWindow(timeEl);
				const interval = targetWindow.setInterval(() => {
					timeEl.textContent = formatTime();
				}, 60_000);
				timeDisposable.value = toDisposable(() => targetWindow.clearInterval(interval));
			} else {
				timeDisposable.clear();
			}
		}));

		// Approval row — reactive
		if (this.approvalModel) {
			this.renderApprovalRow(element, template);
		}
		this.renderCompactInputNeededRow(element, template);

		// Fix-CI row — reactive (only supplied by the blocked-sessions list)
		if (this.ciFixModel) {
			this.renderCIRow(element, template);
		}
	}

	private renderCompactInputNeededRow(element: ISession, template: ISessionItemTemplate): void {
		const contentStore = template.elementDisposables.add(new DisposableStore());
		let wasVisible = !!getCompactInputNeededMessage(element, undefined, this.options, this.approvalModel);
		template.inputNeededRow.classList.toggle('visible', wasVisible);

		template.elementDisposables.add(autorun(reader => {
			contentStore.clear();
			const message = getCompactInputNeededMessage(element, reader, this.options, this.approvalModel);
			const visible = !!message;
			template.inputNeededRow.classList.toggle('visible', visible);
			template.inputNeededLabel.textContent = '';

			if (message) {
				if (typeof message === 'string') {
					template.inputNeededLabel.textContent = message;
				} else {
					contentStore.add(this.markdownRendererService.render(message, { sanitizerConfig: { replaceWithPlaintext: true } }, template.inputNeededLabel));
				}
				if (this.options.showHover) {
					contentStore.add(this.hoverService.setupDelayedHover(template.inputNeededLabel, {
						content: message,
						style: HoverStyle.Pointer,
						position: { hoverPosition: HoverPosition.RIGHT },
					}, { groupId: 'sessions-list' }));
				}
			}

			if (wasVisible !== visible) {
				wasVisible = visible;
				this._onDidChangeItemHeight.fire(element);
			}
		}));
	}

	private renderApprovalRow(element: ISession, template: ISessionItemTemplate): void {
		if (!this.approvalModel) {
			return;
		}

		const approvalModel = this.approvalModel;
		const aggregate = this.options.aggregateChatApprovals;
		bindApprovalRow(template, reader => getSessionRowApproval(approvalModel, element, reader, aggregate), this.markdownRendererService, this.hoverService, this.options.showHover, this.options.approvalRowMaxLines,
			approvalId => this._onDidApproveSession.fire({ session: element, approvalId }),
			() => this._onDidChangeItemHeight.fire(element));
	}

	private renderCIRow(element: ISession, template: ISessionItemTemplate): void {
		if (!this.ciFixModel) {
			return;
		}

		const ciFixModel = this.ciFixModel;
		const stateObs = ciFixModel.getCIFix(element);
		let wasVisible = !!stateObs.get();
		template.ciRow.classList.toggle('visible', wasVisible);

		const buttonStore = template.elementDisposables.add(new DisposableStore());

		template.elementDisposables.add(autorun(reader => {
			buttonStore.clear();

			const state = stateObs.read(reader);
			const visible = !!state;

			template.ciRow.classList.toggle('visible', visible);

			if (state) {
				template.ciLabel.textContent = localize('ci.blockedRow', "{0} checks failed, {1} pending", state.failed, state.pending);

				template.ciButtonContainer.textContent = '';
				// Match the chat input CI banner's prominent orange action button.
				const button = buttonStore.add(new Button(template.ciButtonContainer, {
					title: localize('ci.fixCITooltip', "Fix failing CI checks"),
					...defaultButtonStyles,
					buttonBackground: asCssVariable(chartsOrange),
					buttonHoverBackground: `color-mix(in srgb, ${asCssVariable(chartsOrange)} 88%, black)`,
					buttonBorder: asCssVariable(chartsOrange),
				}));
				button.label = localize('ci.fixCI', "Fix CI");
				buttonStore.add(button.onDidClick(() => ciFixModel.fixCI(element)));
			}

			if (wasVisible !== visible) {
				wasVisible = visible;
				this._onDidChangeItemHeight.fire(element);
			}
		}));
	}

	beginRename(session: ISession): boolean {
		const target = this.resolveRenameTarget(session);
		if (!target) {
			return false;
		}
		if (this.activeRenameInput && isEqual(this.activeRenameInput.session.resource, target.resource)) {
			this.activeRenameInput.input.focus();
			this.activeRenameInput.input.select();
			return true;
		}
		if (!this.renameState || !isEqual(this.renameState.session.resource, target.resource)) {
			const initialValue = target.title.get();
			this.renameState = { session: target, initialValue, value: initialValue };
		}
		this.editingSession.set(target, undefined);
		return true;
	}

	private renderRenameInput(session: ISession, template: ISessionItemTemplate, disposables: DisposableStore): void {
		const renameState = this.renameState;
		if (!renameState || !isEqual(renameState.session.resource, session.resource)) {
			return;
		}
		if (!this.options.contextViewService) {
			throw new Error('Inline rename requires a context view service');
		}
		const input = renderInlineRenameInput(
			template.titleInputContainer,
			this.options.contextViewService,
			renameState,
			localize('renameSession.inputAriaLabel', "Rename session. Press Enter to confirm or Escape to cancel."),
			disposables,
			(title, restoreListFocus) => {
				this.editingSession.set(undefined, undefined);
				this.renameState = undefined;
				if (restoreListFocus) {
					this.options.onDidFinishRename?.();
				}
				const target = this.resolveRenameTarget(session);
				if (title && target) {
					this.sessionsManagementService.renameSession(target, title).catch(onUnexpectedError);
				}
			},
		);
		this.activeRenameInput = { session, input };
		disposables.add(toDisposable(() => {
			if (this.activeRenameInput?.input === input) {
				this.activeRenameInput = undefined;
			}
		}));
	}

	private resolveRenameTarget(session: ISession): ISession | undefined {
		if (!this.options.inlineRename) {
			return undefined;
		}
		const target = this.sessionsManagementService.getSessions().find(candidate => isEqual(candidate.resource, session.resource));
		return target?.capabilities.get().supportsRename ? target : undefined;
	}

	disposeElement(node: ITreeNode<SessionListItem, FuzzyScore>, _index: number, template: ISessionItemTemplate): void {
		if (isSessionItem(node.element) && this.renameState && isEqual(this.renameState.session.resource, node.element.resource) && !this.resolveRenameTarget(node.element)) {
			this.editingSession.set(undefined, undefined);
			this.renameState = undefined;
		}
		template.elementDisposables.clear();
	}

	disposeTemplate(template: ISessionItemTemplate): void {
		template.disposables.dispose();
	}
}

export function getSessionArchiveOnboardingTargetId(session: ISession): string {
	return `sessions.archiveAction.${session.sessionId}`;
}

export function getSessionOnboardingTargetId(session: ISession): string {
	return `sessions.session.${session.sessionId}`;
}

export function getWorkspaceSectionOnboardingTargetId(sectionId: string): string {
	return `sessions.section.${sectionId}`;
}

/**
 * The folder a chat works in, shown on its row when the session spans more than
 * one project and the chat works in exactly one folder.
 */
/**
 * The folder a chat row shows: in a session with folders of several roots, the chat's own folder; in a session without
 * a workspace (a quick chat), the folder of a chat that has one of its own (a chat moved in with its folder).
 */
function getChatWorkspaceBadgeLabel(sessionWorkspace: ISessionWorkspace | undefined, chatWorkspace: ISessionWorkspace | undefined): string | undefined {
	if (chatWorkspace?.folders.length !== 1) {
		return undefined;
	}
	if (!sessionWorkspace) {
		return chatWorkspace.folders[0].name;
	}
	const firstSessionFolder = sessionWorkspace.folders[0];
	if (!firstSessionFolder || !sessionWorkspace.folders.some(folder => !isEqual(folder.root, firstSessionFolder.root))) {
		return undefined;
	}
	return chatWorkspace.folders[0].name;
}

function getWorkspaceBadgeLabel(workspace: ISessionWorkspace): string | undefined {
	const repository = getGitHubRepositoryOfRemoteFile(workspace.folders[0]?.root);
	return repository ? `${repository.owner}/${repository.repo}` : workspace.label;
}

interface ISessionRowLocationOptions {
	readonly grouping: () => SessionsGrouping;
	readonly isWorkspaceScoped?: () => boolean;
	readonly isPinned: (session: ISession) => boolean;
	readonly isRenderedInCustomGroup?: (session: ISession) => boolean;
	readonly isRenderedInExternalSection?: (session: ISession) => boolean;
	/** The environment badge of a session in a repository section, or `undefined` when it runs on this computer. */
	readonly getEnvironmentBadgeLabel?: (session: ISession) => string | undefined;
}

/**
 * The badge saying where a session row's session works. A row under a workspace or
 * repository section header omits the workspace that the header already names; in a
 * repository section, it names the environment instead.
 */
function getSessionRowLocationLabel(session: ISession, reader: IReader, options: ISessionRowLocationOptions): string | undefined {
	// A multi-folder session works in its main chat's folder, like its hover and the title bar say.
	const workspace = getSessionPresentationWorkspace(session, reader);
	if (!workspace) {
		return undefined;
	}
	const grouping = options.grouping();
	if (grouping === SessionsGrouping.Inbox && options.isWorkspaceScoped?.()) {
		return undefined;
	}
	const inWorkspaceOrRepositorySection = (grouping === SessionsGrouping.Workspace || grouping === SessionsGrouping.Repository)
		&& !options.isPinned(session)
		&& !session.isArchived.read(reader)
		&& !options.isRenderedInCustomGroup?.(session)
		&& !options.isRenderedInExternalSection?.(session);
	if (!inWorkspaceOrRepositorySection) {
		return getWorkspaceBadgeLabel(workspace);
	}
	return grouping === SessionsGrouping.Repository ? options.getEnvironmentBadgeLabel?.(session) : undefined;
}

function isExternalApplicationBadgeEligible(session: ISession, reader: IReader): boolean {
	const application = session.application?.read(reader);
	return application !== undefined && application.id !== 'vscode' && application.id !== UNKNOWN_SESSION_APPLICATION_ID;
}

function getExternalApplicationBadgeLabel(applicationLabel: string, showFrom: boolean): string {
	return showFrom ? localize('sessionExternalApplicationBadge', "From {0}", applicationLabel) : applicationLabel;
}

export function logDefaultSettingExperimentTrigger(configurationService: IConfigurationService, telemetryService: ITelemetryService, settingId: string): void {
	const inspected = configurationService.inspect(settingId);
	if (!isConfigured(inspected) && inspected.memoryValue === undefined && inspected.policyValue === undefined) {
		logSettingExperimentTrigger(telemetryService, settingId);
	}
}

//#endregion

//#region Section Header Renderer

interface ISessionHeaderTemplate {
	readonly container: HTMLElement;
	readonly icon: HTMLElement;
	readonly label: HTMLElement;
	readonly collapsed: ISettableObservable<boolean>;
	readonly toolbarContainer: HTMLElement;
	readonly toolbar: MenuWorkbenchToolBar;
	readonly elementDisposables: DisposableStore;
}

const sessionHeaderLabelBackgrounds = [
	['--session-group-foreground', agentsBackground],
	['--session-group-hover-foreground', listHoverBackground],
	['--session-group-focus-foreground', listFocusBackground],
	['--session-group-selection-foreground', listActiveSelectionBackground],
	['--session-group-inactive-focus-foreground', listInactiveFocusBackground],
	['--session-group-inactive-selection-foreground', listInactiveSelectionBackground],
] as const;

class SessionHeaderLabelColor extends Themable {
	constructor(
		private readonly template: ISessionHeaderTemplate,
		private readonly colorId: string,
		@IThemeService themeService: IThemeService,
	) {
		super(themeService);
		this.updateStyles();
	}

	override updateStyles(): void {
		const color = this.theme.getColor(this.colorId);
		const background = this.theme.getColor(agentsBackground);
		// A translucent shell has no single opaque surface against which to correct contrast.
		const preserveForeground = isHighContrast(this.theme.type) || background?.isOpaque() === false;
		for (const [property, backgroundId] of sessionHeaderLabelBackgrounds) {
			const surface = background && (this.theme.getColor(backgroundId)?.flatten(background) ?? background);
			const foreground = preserveForeground ? '' : color && surface ? surface.ensureConstrast(color.flatten(surface), 4.5).toString() : asCssVariable(this.colorId);
			this.template.label.style.setProperty(property, foreground);
		}
	}

	override dispose(): void {
		super.dispose();
		for (const [property] of sessionHeaderLabelBackgrounds) {
			this.template.label.style.removeProperty(property);
		}
	}
}

const enum SessionHeaderStatus {
	NeedsInput,
	FailingCI,
	Unread,
}

function hasUnreadSessionListChat(session: ISession, reader: IReader): boolean {
	if (!session.mainChat.read(reader).isRead.read(reader)) {
		return true;
	}
	return getSessionListChats(session, reader).some(chat => !chat.isRead.read(reader));
}

function getSessionHeaderStatus(sessions: readonly ISession[], reader: IReader, sessionsWithFailingCI: ReadonlySet<string> | undefined): SessionHeaderStatus | undefined {
	let hasFailingCI = false;
	let hasUnread = false;
	for (const session of sessions) {
		if (session.isArchived.read(reader)) {
			continue;
		}
		const status = session.status.read(reader);
		if (status === SessionStatus.NeedsInput) {
			return SessionHeaderStatus.NeedsInput;
		}
		hasFailingCI ||= status !== SessionStatus.InProgress && sessionsWithFailingCI?.has(session.sessionId) === true;
		hasUnread ||= hasUnreadSessionListChat(session, reader);
	}
	return hasFailingCI ? SessionHeaderStatus.FailingCI : hasUnread ? SessionHeaderStatus.Unread : undefined;
}

/**
 * Reports where a section header would show a status if
 * {@link SESSIONS_LIST_SHOW_UNREAD_IN_COLLAPSED_SECTIONS_SETTING} were enabled.
 */
export interface ISessionHeaderStatusTrigger {
	/** Cleared once reported, so that headers stop evaluating it. */
	readonly pending: IObservable<boolean>;
	/** Whether expanded headers count too, because a screen reader announces their status. */
	readonly includeExpanded: IObservable<boolean>;
	report(): void;
}

/**
 * Whether a header could show a status. Failing CI is only resolved while the indicators are
 * enabled, so every session with a pull request counts in its place, the same in every arm.
 */
function couldShowSessionHeaderStatus(sessions: readonly ISession[], reader: IReader): boolean {
	return sessions.some(session => {
		if (session.isArchived.read(reader)) {
			return false;
		}
		const status = session.status.read(reader);
		return status === SessionStatus.NeedsInput
			|| hasUnreadSessionListChat(session, reader)
			|| (status !== SessionStatus.InProgress && !!session.workspace.read(reader)?.folders[0]?.gitRepository?.gitHubInfo.read(reader)?.pullRequest);
	});
}

function renderSessionHeaderIcon(template: ISessionHeaderTemplate, sessions: readonly ISession[], icon: ThemeIcon | undefined, showUnreadInCollapsedSections: IObservable<boolean>, sessionsWithFailingCI: IObservable<ReadonlySet<string>>, statusTrigger: ISessionHeaderStatusTrigger, instantiationService: IInstantiationService, iconOverride?: IObservable<ThemeIcon | undefined>): void {
	if (icon?.color) {
		template.elementDisposables.add(instantiationService.createInstance(SessionHeaderLabelColor, template, icon.color.id));
	}
	template.elementDisposables.add(autorun(reader => {
		if (statusTrigger.pending.read(reader) && (template.collapsed.read(reader) || statusTrigger.includeExpanded.read(reader)) && couldShowSessionHeaderStatus(sessions, reader)) {
			statusTrigger.report();
		}
	}));
	const headerStatus = derived(reader => template.collapsed.read(reader) && showUnreadInCollapsedSections.read(reader)
		? getSessionHeaderStatus(sessions, reader, sessionsWithFailingCI.read(reader))
		: undefined);
	template.elementDisposables.add(autorun(reader => {
		const status = headerStatus.read(reader);
		const renderedIcon = iconOverride?.read(reader) ?? icon;
		DOM.clearNode(template.icon);
		template.icon.className = 'session-section-icon';
		template.icon.style.color = status === undefined && renderedIcon?.color ? asCssVariable(renderedIcon.color.id) : '';
		template.icon.style.display = status !== undefined || renderedIcon ? '' : 'none';
		if (status !== undefined) {
			const statusIcon = reader.store.add(instantiationService.createInstance(SessionStatusIcon, template.icon));
			statusIcon.setStatus(
				status === SessionHeaderStatus.NeedsInput ? SessionStatus.NeedsInput : SessionStatus.Completed,
				status !== SessionHeaderStatus.Unread,
				false,
				status === SessionHeaderStatus.FailingCI ? { ...Codicon.circleFilled, color: themeColorFromId('list.warningForeground') } : undefined,
			);
		} else if (renderedIcon) {
			template.icon.classList.add(...ThemeIcon.asClassNameArray(renderedIcon));
		}
	}));
}

function renderSessionHeaderToolbar<T>(template: ISessionHeaderTemplate, element: T, select: (element: T, event: MouseEvent) => void): void {
	template.elementDisposables.add(DOM.addDisposableListener(template.toolbarContainer, DOM.EventType.CONTEXT_MENU, event => select(element, event), true));
	template.toolbar.context = element;
}

interface ISessionSectionTemplate extends ISessionHeaderTemplate {
	readonly container: HTMLElement;
	readonly label: HTMLElement;
	/** Secondary text after the label, such as the chat that owns a pinned canvas. */
	readonly description: HTMLElement;
	readonly count: HTMLElement;
	readonly countLabel: HTMLElement;
	readonly keybindingHint: HTMLElement;
	readonly keybindingLabel: KeybindingLabel;
	readonly chevron: HTMLElement;
	readonly contextKeyService: IContextKeyService;
	readonly disposables: DisposableStore;
	/** The hover toolbar of a pinned canvas row, created the first time this template renders one. */
	readonly getPinnedCanvasToolbar: () => MenuWorkbenchToolBar;
}

export class SessionSectionRenderer implements ITreeRenderer<SessionListItem, FuzzyScore, ISessionSectionTemplate> {
	static readonly TEMPLATE_ID = 'session-section';

	/** Keyed by template because sticky scroll renders a second copy of a header while its tree row stays rendered. */
	private readonly renderedSections = new Map<ISessionSectionTemplate, ISessionSection>();
	// TODO@BenV: Move automation-specific code into an AutomationSectionRenderer subclass.
	readonly automationStatus = derived(this, reader => {
		const automationSessions = this.automationSessions.read(reader);
		const sessionsByResource = new Map<string, ISession>();
		for (const session of automationSessions) {
			const key = this.uriIdentityService.extUri.getComparisonKey(session.resource);
			if (!sessionsByResource.has(key)) {
				sessionsByResource.set(key, session);
			}
		}
		const personalAutomationIds = new Set(this.automationService.automations.read(reader)
			.filter(automation => automation.ownership !== 'repository')
			.map(automation => automation.id));
		// A run whose session the Sessions list shows reports its status on that row instead,
		// unless the row cannot: a cloud run can still be active while its session reports it finished.
		const runs = this.automationService.runs.read(reader).map(run => {
			const sessionResource = run.sessionResource;
			const session = sessionResource && sessionsByResource.get(this.uriIdentityService.extUri.getComparisonKey(sessionResource));
			return { automationId: run.automationId, status: run.status, session };
		}).filter(({ status, session }) => {
			if (!session || !this.isSessionListed(session, reader)) {
				return true;
			}
			const sessionStatus = session.status.read(reader);
			return (status === 'pending' || status === 'running') && sessionStatus !== SessionStatus.InProgress && sessionStatus !== SessionStatus.NeedsInput;
		});

		// NeedsInput takes priority: any running automation whose session is waiting for input.
		if (runs.some(({ status, session }) => status === 'running' && session?.status.read(reader) === SessionStatus.NeedsInput)) {
			return SessionStatus.NeedsInput;
		}

		if (runs.some(({ automationId, status }) => personalAutomationIds.has(automationId) && (status === 'pending' || status === 'running'))) {
			return SessionStatus.InProgress;
		}
		const hasUnreadRun = runs.some(({ status, session }) => (status === 'completed' || status === 'failed')
			&& !!session && !session.isRead.read(reader) && !session.isArchived.read(reader));
		if (hasUnreadRun) {
			return SessionStatus.Completed;
		}
		return undefined;
	});
	private readonly customizationsIcon = derived(this, reader => this.customizationMigrationsAvailable.read(reader)
		? { ...Codicon.circleFilled, color: themeColorFromId('activityBarBadge.background') }
		: this.customizationsBadge.read(reader) !== undefined
			? { ...Codicon.circleFilled, color: themeColorFromId('activityBarBadge.background') }
			: undefined);

	constructor(
		private readonly hideSectionCount: boolean,
		private readonly select: (element: ISessionSection, event: MouseEvent) => void,
		private readonly showUnreadInCollapsedSections: IObservable<boolean>,
		private readonly sessionsWithFailingCI: IObservable<ReadonlySet<string>>,
		private readonly headerStatusTrigger: ISessionHeaderStatusTrigger,
		private readonly instantiationService: IInstantiationService,
		private readonly hoverService: IHoverService,
		private readonly contextKeyService: IContextKeyService,
		private readonly automationService: IAutomationService,
		private readonly automationSessions: IObservable<readonly ISession[]>,
		private readonly uriIdentityService: IUriIdentityService,
		private readonly customViewService: ICustomViewService,
		private readonly menuService: IMenuService,
		private readonly keybindingService: IKeybindingService,
		private readonly customizationsActive: IObservable<boolean> = constObservable(false),
		private readonly customizationMigrationsAvailable: IObservable<boolean> = constObservable(false),
		readonly templateId = SessionSectionRenderer.TEMPLATE_ID,
		readonly rowClassName?: string,
		private readonly onboardingOptions: {
			readonly onDidActivateNewSession: Event<void>;
			readonly getNewSessionFocusTarget?: () => IOnboardingFocusTarget | undefined;
		} = { onDidActivateNewSession: Event.None },
		/** The New Session dropdown's entries for starting a session in each environment a section spans. */
		private readonly getNewSessionEnvironmentActions?: (section: ISessionSection) => readonly IAction[],
		/** Describes why the Customizations entry shows a badge, if it does. */
		private readonly customizationsBadge: IObservable<string | undefined> = constObservable(undefined),
		private readonly getGroupDepth: (section: ISessionSection) => number = () => 0,
		private readonly getAppearance: (sectionId: string) => ISessionGroupAppearance | undefined = () => undefined,
		/** Whether the Sessions list shows the session; the Automations entry ignores such runs. */
		private readonly isSessionListed: (session: ISession, reader: IReader) => boolean = () => false,
		/** Whether the canvas page shows a pinned canvas, which highlights its row. */
		private readonly isPinnedCanvasActive: (entry: IPinnedCanvas, reader: IReader) => boolean = () => false,
	) { }

	renderTemplate(container: HTMLElement): ISessionSectionTemplate {
		const disposables = new DisposableStore();
		const elementDisposables = disposables.add(new DisposableStore());
		const actionViewItemDisposables = disposables.add(new DisposableStore());
		const dropdownAction = disposables.add(new Action(
			'sessionsView.sectionNewSession.moreActions',
			localize('newSessionForWorkspaceMoreActions', "More Actions"),
		));

		container.classList.add('session-section');
		const chevron = DOM.append(container, $('span.session-section-chevron'));
		chevron.setAttribute('aria-hidden', 'true');
		const icon = DOM.append(container, $('span.session-section-icon'));
		icon.setAttribute('aria-hidden', 'true');
		const labelContainer = DOM.append(container, $('span.session-section-label-container'));
		const label = DOM.append(labelContainer, $('span.session-section-label'));
		const description = DOM.append(labelContainer, $('span.session-section-description'));
		const count = DOM.append(container, $('span.session-section-count'));
		const countLabel = DOM.append(count, $('span.session-section-count-label'));
		const keybindingHint = DOM.append(container, $('span.session-section-keybinding'));
		keybindingHint.setAttribute('aria-hidden', 'true');
		const keybindingLabel = disposables.add(new KeybindingLabel(keybindingHint, OS, {
			...defaultKeybindingLabelStyles,
			disableTitle: true,
		}));
		const toolbarContainer = DOM.append(container, $('.session-section-toolbar'));

		const contextKeyService = disposables.add(this.contextKeyService.createScoped(container));
		const scopedInstantiationService = disposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
		const toolbar = disposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, toolbarContainer, SessionSectionToolbarMenuId, {
			menuOptions: { shouldForwardArgs: true },
			telemetrySource: 'sessionsList.section',
			actionViewItemProvider: (action, options) => {
				// Dropdowns share the toolbar's action runner, which already logs
				// `workbenchActionExecuted`; skip the duplicate `contextMenu` event.
				if (action instanceof SubmenuItemAction) {
					return createActionViewItem(scopedInstantiationService, action, { ...options, skipTelemetry: true });
				}
				if (action.id !== NEW_SESSION_FOR_WORKSPACE_ACTION_ID || !(action instanceof MenuItemAction)) {
					return undefined;
				}

				actionViewItemDisposables.clear();

				const dropdownActions = getFlatContextMenuActions(this.menuService.getMenuActions(
					Menus.SessionSectionNewSession,
					contextKeyService,
					{ shouldForwardArgs: true },
				));
				// The environments depend on the section this template renders, so read them whenever the dropdown opens.
				const getEnvironmentActions = (): readonly IAction[] => {
					const section = [...this.renderedSections].find(([template]) => template.container === container)?.[1];
					return section && contextKeyService.contextMatchesRules(ChatContextKeys.enabled)
						? this.getNewSessionEnvironmentActions?.(section) ?? []
						: [];
				};
				if (dropdownActions.length === 0 && getEnvironmentActions().length === 0) {
					return undefined;
				}

				const item = scopedInstantiationService.createInstance(
					DropdownWithPrimaryActionViewItem,
					action,
					dropdownAction,
					{
						getActions: () => {
							const environmentActions = getEnvironmentActions();
							return environmentActions.length > 0 && dropdownActions.length > 0
								? [...environmentActions, new Separator(), ...dropdownActions]
								: [...environmentActions, ...dropdownActions];
						},
					},
					'',
					{
						hoverDelegate: options.hoverDelegate,
						menuAsChild: false,
						skipTelemetry: true,
					},
				);

				actionViewItemDisposables.add(item.onDidChangeDropdownVisibility(visible =>
					container.classList.toggle('dropdown-active', visible)));

				actionViewItemDisposables.add(toDisposable(() =>
					container.classList.remove('dropdown-active')));

				return item;
			},
		}));

		let pinnedCanvasToolbar: MenuWorkbenchToolBar | undefined;
		const getPinnedCanvasToolbar = () => pinnedCanvasToolbar ??= disposables.add(scopedInstantiationService.createInstance(
			MenuWorkbenchToolBar,
			DOM.append(container, $('.session-section-pinned-canvas-toolbar')),
			Menus.SidebarCanvasToolbar,
			{ menuOptions: { shouldForwardArgs: true }, telemetrySource: 'sessionsList.pinnedCanvas' },
		));

		return { container, icon, collapsed: observableValue(this, false), label, description, count, countLabel, keybindingHint, keybindingLabel, toolbarContainer, toolbar, chevron, contextKeyService, elementDisposables, disposables, getPinnedCanvasToolbar };
	}

	renderElement(node: ITreeNode<SessionListItem, FuzzyScore>, _index: number, template: ISessionSectionTemplate): void {
		const element = node.element;
		if (!isSessionSection(element)) {
			return;
		}
		this.renderSection(element, node.collapsible, node.collapsed, template);
	}

	renderShortcut(element: ISessionSection, template: ISessionSectionTemplate): void {
		template.container.closest('.monaco-list-row')?.classList.add('session-list-shortcut-row');
		this.renderSection(element, false, false, template);
	}

	private renderSection(element: ISessionSection, collapsible: boolean, collapsed: boolean, template: ISessionSectionTemplate): void {
		template.elementDisposables.clear();
		this.renderedSections.set(template, element);
		template.container.closest('.monaco-list-row')?.classList.toggle('sessions-disclosure-row', collapsible);
		const groupDepth = this.getGroupDepth(element);
		setSessionGroupDepth(template.container, groupDepth);
		template.container.classList.remove(SESSION_HEADER_DROP_TARGET_CLASS);
		template.container.classList.remove('session-section-shortcut');
		template.container.classList.remove('session-section-new-session');
		template.container.classList.remove('session-section-customizations');
		template.container.classList.remove('session-section-pinned-canvas', 'pending', 'unavailable');
		template.container.classList.remove('active');
		template.container.closest('.monaco-list-row')?.removeAttribute('aria-current');
		template.description.textContent = '';
		template.keybindingHint.classList.remove('visible');
		template.keybindingLabel.set(undefined);
		const shortcut = isShortcutSection(element.id);
		template.toolbarContainer.style.display = shortcut || element.pendingItems ? 'none' : '';
		if (shortcut) {
			template.container.classList.add('session-section-shortcut');
			template.toolbar.context = undefined;
		} else {
			renderSessionHeaderToolbar(template, element, this.select);
		}
		if (element.id.startsWith('workspace:')) {
			template.elementDisposables.add(markOnboardingTarget(template.container, getWorkspaceSectionOnboardingTargetId(element.id)));
		}
		if (element.id === NEW_SESSION_SECTION_ID) {
			template.container.classList.add('session-section-new-session');
			template.elementDisposables.add(markOnboardingTarget(template.container, 'sessions.newSession.button', {
				onDidActivate: this.onboardingOptions.onDidActivateNewSession,
				focusTarget: this.onboardingOptions.getNewSessionFocusTarget?.(),
			}));
			template.keybindingHint.classList.add('visible');
			const updateKeybinding = () => template.keybindingLabel.set(this.keybindingService.lookupKeybinding(NEW_SESSION_ACTION_ID, this.contextKeyService));
			updateKeybinding();
			template.elementDisposables.add(this.keybindingService.onDidUpdateKeybindings(updateKeybinding));
		}
		if (element.id === CUSTOMIZATIONS_SECTION_ID) {
			template.container.classList.add('session-section-customizations');
			const hover = this.instantiationService.createInstance(ChatCustomizationsHover);
			const hoverDelegate = getDefaultHoverDelegate('element');
			template.elementDisposables.add(this.hoverService.setupManagedHover(
				{
					placement: 'element',
					get delay() { return hoverDelegate.delay; },
					showHover: (options, focus) => hoverDelegate.showHover({
						...options,
						additionalClasses: [...options.additionalClasses ?? [], 'sessions-list-hover'],
						position: { ...options.position, hoverPosition: HoverPosition.RIGHT },
						appearance: { ...options.appearance, showPointer: true },
					}, focus),
				},
				template.container,
				() => hover.getManagedContent(this.customizationMigrationsAvailable.get()
					? localize('customizationsMigrationHover', "Some customizations need an update to keep working.")
					: this.customizationsBadge.get()),
				hover.getHoverOptions('sessionsHeader'),
			));
			template.elementDisposables.add(autorun(reader => {
				const active = this.customizationsActive.read(reader);
				template.container.classList.toggle('active', active);
				const row = template.container.closest('.monaco-list-row');
				if (active) {
					row?.setAttribute('aria-current', 'page');
				} else {
					row?.removeAttribute('aria-current');
				}
			}));
		}

		this.updateChevron(template, collapsible, collapsed);

		if (element.id === AUTOMATIONS_SECTION_ID) {
			template.elementDisposables.add(markOnboardingTarget(template.container, 'sessions.automations.entry'));
			DOM.clearNode(template.icon);
			template.icon.style.display = '';
			template.elementDisposables.add(autorun(reader => {
				const activeCustomView = this.customViewService.activeCustomView.read(reader);
				template.container.classList.toggle('active', activeCustomView?.id === AUTOMATIONS_CUSTOM_VIEW_ID && !this.customizationsActive.read(reader));
			}));
			const statusIcon = template.elementDisposables.add(this.instantiationService.createInstance(SessionStatusIcon, template.icon));
			template.elementDisposables.add(autorun(reader => {
				const automationStatus = this.automationStatus.read(reader);
				if (automationStatus === SessionStatus.NeedsInput) {
					template.icon.className = 'session-section-icon';
					statusIcon.setStatus(SessionStatus.NeedsInput, true, false);
				} else if (automationStatus === SessionStatus.InProgress) {
					template.icon.className = 'session-section-icon';
					statusIcon.setStatus(SessionStatus.InProgress, true, false);
				} else if (automationStatus === SessionStatus.Completed) {
					template.icon.className = 'session-section-icon';
					statusIcon.setStatus(SessionStatus.Completed, false, false);
				} else {
					statusIcon.reset();
					template.icon.className = `session-section-icon ${ThemeIcon.asClassName(Codicon.calendar)}`;
				}
			}));
		} else if (!element.pinnedCanvas) {
			const defaultIcon = getSessionSectionIcon(element.id);
			const appearance = isSessionGroupingSection(element.id) ? this.getAppearance(element.id) : undefined;
			const icon = appearance ? {
				id: appearance.icon ?? defaultIcon?.id ?? Codicon.folder.id,
				color: appearance.color ? themeColorFromId(appearance.color) : defaultIcon?.color,
			} : defaultIcon;
			renderSessionHeaderIcon(
				template,
				element.sessions,
				icon,
				this.showUnreadInCollapsedSections,
				this.sessionsWithFailingCI,
				this.headerStatusTrigger,
				this.instantiationService,
				element.id === CUSTOMIZATIONS_SECTION_ID ? this.customizationsIcon : undefined,
			);
		}

		template.label.textContent = element.label;
		template.countLabel.style.display = '';
		if (this.hideSectionCount && !element.pendingItems && !sessionInboxSections.some(id => id === element.id) || shortcut || element.id === CANVASES_SECTION_ID) {
			template.countLabel.textContent = '';
			template.count.style.display = 'none';
		} else {
			template.countLabel.textContent = String(element.pendingItems?.length ?? element.sessions.length);
			template.count.style.display = '';
		}
		if (element.pinnedCanvas) {
			this.renderPinnedCanvas(element.pinnedCanvas, template);
		}

		// Set context key for section type so toolbar actions can use when clauses
		const sectionType = getSessionSectionType(element.id);
		SessionSectionTypeContext.bindTo(template.contextKeyService).set(sectionType);
		const hasGitHubRepository = SessionSectionHasGitHubRepositoryContext.bindTo(template.contextKeyService);
		const hasNonCloudRepository = SessionSectionHasNonCloudRepositoryContext.bindTo(template.contextKeyService);
		template.elementDisposables.add(autorun(reader => {
			let hasGitHub = false;
			let hasNonCloudWorkspace = false;
			for (const session of element.sessions) {
				for (const folder of session.workspace.read(reader)?.folders ?? []) {
					// Reading `gitHubInfo` keeps the session's live pull request models alive, so stop once one repository is found.
					if (!hasGitHub && folder.gitRepository?.gitHubInfo.read(reader) !== undefined) {
						hasGitHub = true;
					}
					hasNonCloudWorkspace ||= folder.root.scheme !== GITHUB_REMOTE_FILE_SCHEME;
				}
				if (hasGitHub && hasNonCloudWorkspace) {
					break;
				}
			}
			hasGitHubRepository.set(hasGitHub);
			hasNonCloudRepository.set(hasNonCloudWorkspace);
		}));
	}

	/** Updates the leading icon and chevron when the tree toggles a section without re-rendering it. */
	updateCollapseState(element: ISessionSection, collapsible: boolean, collapsed: boolean): void {
		for (const [template, renderedElement] of this.renderedSections) {
			if (renderedElement === element) {
				this.updateChevron(template, collapsible, collapsed);
			}
		}
	}

	setDropTarget(sectionId: string, active: boolean): void {
		for (const [template, element] of this.renderedSections) {
			if (element.id === sectionId) {
				template.container.classList.toggle(SESSION_HEADER_DROP_TARGET_CLASS, active);
			}
		}
	}

	private renderPinnedCanvas(entry: IPinnedCanvas, template: ISessionSectionTemplate): void {
		template.container.classList.add('session-section-pinned-canvas');
		template.getPinnedCanvasToolbar().context = entry.id;
		DOM.clearNode(template.icon);
		template.icon.style.display = '';
		template.elementDisposables.add(autorun(reader => {
			const state = entry.state.read(reader);
			template.icon.className = `session-section-icon ${ThemeIcon.asClassName(state === PinnedCanvasState.Unavailable ? Codicon.circleSlash : Codicon.preview)}`;
			template.container.classList.toggle('pending', state === PinnedCanvasState.Pending);
			template.container.classList.toggle('unavailable', state === PinnedCanvasState.Unavailable);
			template.label.textContent = entry.title.read(reader);
			template.description.textContent = entry.chatTitle.read(reader) ?? '';
		}));
		template.elementDisposables.add(autorun(reader => {
			const active = this.isPinnedCanvasActive(entry, reader);
			template.container.classList.toggle('active', active);
			const row = template.container.closest('.monaco-list-row');
			if (active) {
				row?.setAttribute('aria-current', 'page');
			} else {
				row?.removeAttribute('aria-current');
			}
		}));
		template.elementDisposables.add(this.hoverService.setupDelayedHover(template.container, () => withSessionsListHoverPresentation({
			content: getPinnedCanvasDescription(entry, undefined),
		})));
	}

	private updateChevron(template: ISessionSectionTemplate, collapsible: boolean, collapsed: boolean): void {
		template.collapsed.set(collapsible && collapsed, undefined);
		template.chevron.className = 'session-section-chevron';
		if (collapsible) {
			template.chevron.classList.add('collapsible');
			const icon = collapsed ? Codicon.chevronRight : Codicon.chevronDown;
			template.chevron.classList.add(...ThemeIcon.asClassNameArray(icon));
		}
	}

	disposeElement(_node: ITreeNode<SessionListItem, FuzzyScore>, _index: number, template: ISessionSectionTemplate): void {
		template.elementDisposables.clear();
		this.renderedSections.delete(template);
	}

	disposeShortcut(_element: ISessionSection, template: ISessionSectionTemplate): void {
		template.elementDisposables.clear();
		this.renderedSections.delete(template);
	}

	disposeTemplate(template: ISessionSectionTemplate): void {
		this.renderedSections.delete(template);
		template.disposables.dispose();
	}
}

export class SessionShortcutListDelegate implements IListVirtualDelegate<ISessionSection> {
	getHeight(): number {
		return SESSION_SHORTCUT_ROW_HEIGHT;
	}

	getTemplateId(): string {
		return SESSION_SHORTCUT_SECTION_TEMPLATE_ID;
	}
}

export class SessionShortcutListRenderer implements IListRenderer<ISessionSection, ISessionSectionTemplate> {
	readonly templateId = SESSION_SHORTCUT_SECTION_TEMPLATE_ID;

	constructor(private readonly renderer: SessionSectionRenderer) { }

	renderTemplate(container: HTMLElement): ISessionSectionTemplate {
		return this.renderer.renderTemplate(container);
	}

	renderElement(element: ISessionSection, _index: number, template: ISessionSectionTemplate): void {
		this.renderer.renderShortcut(element, template);
	}

	disposeElement(element: ISessionSection, _index: number, template: ISessionSectionTemplate): void {
		this.renderer.disposeShortcut(element, template);
	}

	disposeTemplate(template: ISessionSectionTemplate): void {
		this.renderer.disposeTemplate(template);
	}
}

//#endregion

//#region Session Group Renderer

interface ISessionGroupTemplate extends ISessionHeaderTemplate {
	readonly container: HTMLElement;
	readonly labelContainer: HTMLElement;
	readonly icon: HTMLElement;
	readonly label: HTMLElement;
	readonly description: HTMLElement;
	readonly inputContainer: HTMLElement;
	readonly chevron: HTMLElement;
	readonly contextKeyService: IContextKeyService;
	readonly disposables: DisposableStore;
}

/**
 * Callbacks the group renderer uses to commit or cancel inline renaming.
 */
interface ISessionGroupRendererDelegate {
	commitEdit(group: ISessionGroup, name: string): void;
	cancelEdit(group: ISessionGroup): void;
	select(element: ISessionGroupItem, event: MouseEvent): void;
	toggleCollapsed(element: ISessionGroupItem): void;
}

export class SessionGroupRenderer implements ITreeRenderer<SessionListItem, FuzzyScore, ISessionGroupTemplate> {
	static readonly TEMPLATE_ID = 'session-group';
	readonly templateId = SessionGroupRenderer.TEMPLATE_ID;
	readonly rowClassName = 'session-list-section-row';

	/** Keyed by template because sticky scroll renders a second copy of a header while its tree row stays rendered. */
	private readonly renderedGroups = new Map<ISessionGroupTemplate, ISessionGroupItem>();
	private renameState: (IInlineRenameValueState & { readonly groupId: string }) | undefined;

	constructor(
		private readonly delegate: ISessionGroupRendererDelegate,
		private readonly showUnreadInCollapsedSections: IObservable<boolean>,
		private readonly sessionsWithFailingCI: IObservable<ReadonlySet<string>>,
		private readonly headerStatusTrigger: ISessionHeaderStatusTrigger,
		private readonly instantiationService: IInstantiationService,
		private readonly contextKeyService: IContextKeyService,
		private readonly configurationService: IConfigurationService,
		private readonly hoverService: IHoverService,
	) { }

	renderTemplate(container: HTMLElement): ISessionGroupTemplate {
		const disposables = new DisposableStore();

		container.classList.add('session-section', 'session-group');
		const chevron = DOM.append(container, $('span.session-section-chevron'));
		chevron.setAttribute('aria-hidden', 'true');
		const icon = DOM.append(container, $('span.session-section-icon'));
		icon.setAttribute('aria-hidden', 'true');
		const labelContainer = DOM.append(container, $('.session-section-label-container.session-group-labels'));
		const label = DOM.append(labelContainer, $('span.session-section-label'));
		const description = DOM.append(labelContainer, $('span.session-group-description'));
		const inputContainer = DOM.append(container, $('.session-group-input'));
		const toolbarContainer = DOM.append(container, $('.session-section-toolbar'));
		const contextKeyService = disposables.add(this.contextKeyService.createScoped(container));
		const scopedInstantiationService = disposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
		const toolbar = disposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, toolbarContainer, SessionGroupToolbarMenuId, {
			menuOptions: { shouldForwardArgs: true },
			telemetrySource: 'sessionsList.group',
			actionViewItemProvider: createSessionActionViewItemProvider(scopedInstantiationService, this.configurationService, context => {
				const group = context as ISessionGroupItem | undefined;
				return !!group && !group.comparison?.launching && group.subtreeSessions.length > 0 && group.subtreeSessions.every(session => session.isArchived.get());
			}),
		}));

		return { container, icon, collapsed: observableValue(this, false), labelContainer, label, description, inputContainer, toolbarContainer, toolbar, chevron, contextKeyService, disposables, elementDisposables: disposables.add(new DisposableStore()) };
	}

	renderElement(node: ITreeNode<SessionListItem, FuzzyScore>, _index: number, template: ISessionGroupTemplate): void {
		const element = node.element;
		if (!isSessionGroupItem(element)) {
			return;
		}
		template.container.closest('.monaco-list-row')?.classList.toggle('sessions-disclosure-row', node.collapsible);
		template.elementDisposables.clear();
		renderSessionHeaderToolbar(template, element, this.delegate.select);
		this.renderedGroups.set(template, element);
		template.container.classList.remove(SESSION_HEADER_DROP_TARGET_CLASS);
		setSessionGroupDepth(template.container, element.depth);

		const isComparison = element.comparison !== undefined;
		template.container.classList.toggle('session-comparison-group', isComparison);
		const groupIcon: ThemeIcon = isComparison ? Codicon.layers : {
			id: element.group.icon ?? Codicon.folderLibrary.id,
			color: element.group.color ? themeColorFromId(element.group.color) : undefined,
		};
		template.label.textContent = element.comparison?.title ?? element.group.name;
		const comparison = element.comparison;
		if (comparison) {
			template.elementDisposables.add(autorun(reader => {
				template.description.textContent = comparison.summary(reader);
			}));
			template.elementDisposables.add(this.hoverService.setupDelayedHover(template.container, () => withSessionsListHoverPresentation({
				content: comparison.configuration,
			}), { groupId: 'sessions-list' }));
		} else {
			template.description.textContent = '';
		}
		template.description.classList.toggle('visible', isComparison);
		this.updateChevron(template, node.collapsible, node.collapsed);
		renderSessionHeaderIcon(template, element.subtreeSessions, groupIcon, this.showUnreadInCollapsedSections, this.sessionsWithFailingCI, this.headerStatusTrigger, this.instantiationService);
		if (isComparison) {
			for (const eventType of ['pointerdown', 'pointerup', 'click', 'dblclick'] as const) {
				template.elementDisposables.add(DOM.addDisposableListener(template.chevron, eventType, event => {
					event.preventDefault();
					event.stopPropagation();
					if (eventType === 'click') {
						this.delegate.toggleCollapsed(element);
					}
				}));
			}
			template.elementDisposables.add(Gesture.ignoreTarget(template.chevron));
		}
		SessionGroupHasVisibleSessionsContext.bindTo(template.contextKeyService).set(element.subtreeSessions.length > 0 && comparison?.launching !== true);
		SessionGroupIsEmptyContext.bindTo(template.contextKeyService).set(element.isEmpty);
		SessionGroupIsComparisonContext.bindTo(template.contextKeyService).set(isComparison);

		template.container.classList.toggle('session-group-editing', element.editing);
		if (element.editing) {
			this.renderInput(element, template);
		} else {
			if (this.renameState?.groupId === element.group.id) {
				this.renameState = undefined;
			}
			template.inputContainer.style.display = 'none';
			template.labelContainer.style.display = '';
		}
	}

	private renderInput(element: ISessionGroupItem, template: ISessionGroupTemplate): void {
		template.labelContainer.style.display = 'none';
		template.inputContainer.style.display = '';

		if (this.renameState?.groupId !== element.group.id) {
			this.renameState = { groupId: element.group.id, initialValue: element.group.name, value: element.group.name };
		}
		const input = createInlineRenameInputBox(template.inputContainer, undefined, this.renameState, {
			inputBoxStyles: defaultInputBoxStyles,
			ariaLabel: localize('sessionGroupName', "Group name"),
		}, template.elementDisposables);

		let done = false;
		const commit = () => {
			if (done) {
				return;
			}
			done = true;
			this.renameState = undefined;
			this.delegate.commitEdit(element.group, input.value.trim());
		};
		const cancel = () => {
			if (done) {
				return;
			}
			done = true;
			this.renameState = undefined;
			this.delegate.cancelEdit(element.group);
		};

		template.elementDisposables.add(DOM.addStandardDisposableListener(input.inputElement, DOM.EventType.KEY_DOWN, e => {
			if (e.equals(KeyCode.Enter)) {
				e.preventDefault();
				e.stopPropagation();
				commit();
			} else if (e.equals(KeyCode.Escape)) {
				e.preventDefault();
				e.stopPropagation();
				cancel();
			}
		}));
		template.elementDisposables.add(DOM.addDisposableListener(input.inputElement, DOM.EventType.BLUR, () => commit()));
	}

	/** Forwarded from the owning list when the group's collapse state toggles. */
	updateCollapseState(element: ISessionGroupItem, collapsed: boolean): void {
		for (const [template, renderedElement] of this.renderedGroups) {
			if (renderedElement === element) {
				this.updateChevron(template, true, collapsed);
			}
		}
	}

	setDropTarget(groupId: string, active: boolean): void {
		for (const [template, element] of this.renderedGroups) {
			if (element.group.id === groupId) {
				template.container.classList.toggle(SESSION_HEADER_DROP_TARGET_CLASS, active);
			}
		}
	}

	private updateChevron(template: ISessionGroupTemplate, collapsible: boolean, collapsed: boolean): void {
		template.collapsed.set(collapsible && collapsed, undefined);
		template.chevron.className = 'session-section-chevron';
		if (collapsible) {
			template.chevron.classList.add('collapsible');
			const icon = collapsed ? Codicon.chevronRight : Codicon.chevronDown;
			template.chevron.classList.add(...ThemeIcon.asClassNameArray(icon));
		}
	}

	disposeElement(_node: ITreeNode<SessionListItem, FuzzyScore>, _index: number, template: ISessionGroupTemplate): void {
		this.renderedGroups.delete(template);
		template.elementDisposables.clear();
	}

	disposeTemplate(template: ISessionGroupTemplate): void {
		this.renderedGroups.delete(template);
		template.disposables.dispose();
	}
}

//#endregion

//#region Show More Renderer

function getSessionShowMoreLabel(element: ISessionShowMore): string {
	if (element.mode === 'less') {
		return element.kind === 'folders'
			? localize('showLessWorkspacesCompact', "Show fewer workspaces")
			: element.kind === 'repositories'
				? localize('showLessRepositoriesCompact', "Show fewer repositories")
				: element.kind === 'environments'
					? localize('showLessEnvironmentsCompact', "Show fewer environments")
					: localize('showLessCompact', "Show less");
	}
	return element.kind === 'folders'
		? element.remainingCount === 1
			? localize('showMoreWorkspaceCompact', "+{0} more workspace", element.remainingCount)
			: localize('showMoreWorkspacesCompact', "+{0} more workspaces", element.remainingCount)
		: element.kind === 'repositories'
			? element.remainingCount === 1
				? localize('showMoreRepositoryCompact', "+{0} more repository", element.remainingCount)
				: localize('showMoreRepositoriesCompact', "+{0} more repositories", element.remainingCount)
			: element.kind === 'environments'
				? element.remainingCount === 1
					? localize('showMoreEnvironmentCompact', "+{0} more environment", element.remainingCount)
					: localize('showMoreEnvironmentsCompact', "+{0} more environments", element.remainingCount)
				: localize('showMoreCompact', "+{0} more", element.remainingCount);
}

export class SessionShowMoreRenderer implements ITreeRenderer<SessionListItem, FuzzyScore, HTMLElement> {
	static readonly TEMPLATE_ID = 'session-show-more';
	readonly templateId = SessionShowMoreRenderer.TEMPLATE_ID;
	readonly rowClassName = 'session-list-inset-row';

	constructor(
		/** How many groups deep the custom group whose rows include a show more row is nested; the row steps in by that many levels. */
		private readonly getGroupDepth: (element: ISessionShowMore) => number = () => 0,
	) { }

	renderTemplate(container: HTMLElement): HTMLElement {
		container.classList.add('session-show-more');
		return DOM.append(container, $('span.session-show-more-label'));
	}

	renderElement(node: ITreeNode<SessionListItem | null, FuzzyScore>, _index: number, template: HTMLElement): void {
		const element = node.element;
		if (!element || !isSessionShowMore(element)) {
			return;
		}
		const container = template.parentElement;
		if (container) {
			setSessionGroupDepth(container, this.getGroupDepth(element));
		}
		container?.classList.toggle('session-show-more-folders', element.kind !== 'sessions');
		template.textContent = getSessionShowMoreLabel(element);
	}

	disposeTemplate(_template: HTMLElement): void { }
}

interface ISessionPlaceholderTemplate {
	readonly container: HTMLElement;
	readonly label: HTMLElement;
	readonly hover: MutableDisposable<IDisposable>;
}

export class SessionPlaceholderRenderer implements ITreeRenderer<SessionListItem, FuzzyScore, ISessionPlaceholderTemplate> {
	static readonly TEMPLATE_ID = 'session-placeholder';
	readonly templateId = SessionPlaceholderRenderer.TEMPLATE_ID;

	constructor(
		private readonly hoverService: IHoverService,
		/** How many groups deep the custom group whose rows include a placeholder row is nested; the row steps in by that many levels. */
		private readonly getGroupDepth: (element: ISessionPlaceholder) => number = () => 0,
	) { }

	renderTemplate(container: HTMLElement): ISessionPlaceholderTemplate {
		container.classList.add('session-placeholder');
		return {
			container,
			label: DOM.append(container, $('span.session-placeholder-label')),
			hover: new MutableDisposable(),
		};
	}

	renderElement(node: ITreeNode<SessionListItem, FuzzyScore>, _index: number, template: ISessionPlaceholderTemplate): void {
		const element = node.element;
		if (!isSessionPlaceholder(element)) {
			return;
		}
		setSessionGroupDepth(template.container, this.getGroupDepth(element));
		template.label.textContent = element.label;
		template.hover.value = element.hover
			? this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), template.container, element.hover)
			: undefined;
	}

	disposeTemplate(template: ISessionPlaceholderTemplate): void {
		template.hover.dispose();
	}
}

//#region Accessibility

interface ISessionsAccessibilityProviderOptions extends ICompactInputNeededPresentationOptions {
	readonly scheduledSessionResources?: IObservable<ReadonlySet<string>>;
	readonly scheduledRequests?: IObservable<ReadonlyMap<string, readonly IChatScheduledRequest[]>>;
	readonly grouping: () => SessionsGrouping;
	readonly isWorkspaceScoped?: () => boolean;
	readonly isPinned: (session: ISession) => boolean;
	readonly widgetAriaLabel?: string;
	readonly isRenderedInCustomGroup?: (session: ISession) => boolean;
	readonly getComparisonAttemptLabel?: (session: ISession, chat?: IChat) => string | undefined;
	readonly isRenderedInExternalSection?: (session: ISession) => boolean;
	readonly getEnvironmentBadgeLabel?: (session: ISession) => string | undefined;
	readonly includeQuickChatInAriaLabel?: boolean;
	readonly customizationsCount?: IObservable<number>;
	readonly customizationMigrationsAvailable?: IObservable<boolean>;
	/** Describes why the Customizations entry shows a badge, if it does. */
	readonly customizationsBadge?: IObservable<string | undefined>;
	readonly newSessionKeybindingAriaLabel?: IObservable<string | undefined>;
	readonly showUnreadInCollapsedSections?: IObservable<boolean>;
	readonly sessionsWithFailingCI?: IObservable<ReadonlySet<string>>;
	/** Mirrors {@link SessionItemRenderer}'s option of the same name — see there for rationale. */
	readonly deriveStatusFromMainChat?: boolean;
	readonly collapsedSessionIds?: IObservable<ReadonlySet<string>>;
	readonly approvalModel?: AgentSessionApprovalModel;
	readonly externalApplicationBadgeMode?: IObservable<ExternalSessionApplicationBadgeMode>;
	readonly reportExternalApplicationBadgeModeExperimentTrigger?: () => void;
	readonly reportExternalApplicationBadgeShowFromExperimentTrigger?: () => void;
	readonly getCompletedStatusMessage?: (session: ISession, reader: IReader | undefined) => string | undefined;
	readonly getTriageDescription?: (session: ISession, reader: IReader | undefined) => string | undefined;
	/** The harness label of a nested chat whose harness differs from its session's. */
	readonly getChatHarnessLabel?: (session: ISession, chat: IChat, reader: IReader | undefined) => string | undefined;
	/** While searching, the field a session or a standalone chat matched in that neither its row, through `shownTexts`, nor its section headers show. */
	readonly getSearchHint?: (element: ISession | ISessionChatItem, shownTexts: readonly string[]) => ISessionSearchHint | undefined;
}

export class SessionsAccessibilityProvider {
	constructor(
		private readonly automationStatus?: IObservable<SessionStatus | undefined>,
		private readonly options?: ISessionsAccessibilityProviderOptions,
	) { }

	getWidgetAriaLabel(): string {
		return this.options?.widgetAriaLabel ?? localize('sessionsList', "Sessions");
	}

	getAriaLabel(element: SessionListItem): string | IObservable<string> | null {
		if (isPendingSessionItem(element)) {
			return getPendingSessionAriaLabel(element);
		}
		if (isSessionChatItem(element)) {
			return derived(this, reader => {
				const title = this.options?.getComparisonAttemptLabel?.(element.session, element.chat) ?? getChatTitle(element.chat, reader);
				const chatStatus = element.chat.status.read(reader);
				const updatedAt = chatStatus === SessionStatus.InProgress ? undefined : element.chat.updatedAt.read(reader);
				const status = getSessionConversationStatusAriaLabel(chatStatus);
				const chatDescription = element.chat.description.read(reader);
				const statusMessage = getSessionStatusMessage(chatStatus, chatDescription);
				const folderLabel = getChatWorkspaceBadgeLabel(element.session.workspace.read(reader), element.chat.workspace.read(reader));
				let label = updatedAt
					? folderLabel
						? localize('sessionChatItemFolderAria', "{0}, chat in folder {1}, updated {2}, {3}", title, folderLabel, fromNow(updatedAt, true), status)
						: localize('sessionChatItemAria', "{0}, chat, updated {1}, {2}", title, fromNow(updatedAt, true), status)
					: folderLabel
						? localize('sessionChatItemFolderWithoutTimeAria', "{0}, chat in folder {1}, {2}", title, folderLabel, status)
						: localize('sessionChatItemWithoutTimeAria', "{0}, chat, {1}", title, status);
				if (statusMessage !== undefined && (chatStatus === SessionStatus.InProgress || chatDescription !== undefined)) {
					const statusMessageText = typeof statusMessage === 'string'
						? statusMessage
						: renderAsPlaintext(statusMessage, { omitMarkdownSyntax: true });
					label = localize('sessionChatItemStatusMessageAria', "{0}, {1}", label, statusMessageText);
				}
				const diffStats = chatStatus === SessionStatus.InProgress || chatStatus === SessionStatus.NeedsInput ? undefined : getChatListDiffStats(element.chat, reader);
				if (diffStats) {
					label = localize('sessionChatItemChangesAria', "{0}, {1} lines added, {2} lines removed", label, diffStats.insertions, diffStats.deletions);
				}
				const harnessLabel = this.options?.getChatHarnessLabel?.(element.session, element.chat, reader);
				if (harnessLabel) {
					label = localize('sessionChatItemHarnessAria', "{0}, uses harness {1}", label, harnessLabel);
				}
				if (this.options?.scheduledRequests?.read(reader).get(getComparisonKey(element.chat.resource))?.length) {
					label = localize('scheduledSessionAria', "{0}, has scheduled messages", label);
				}
				const isArchived = element.chat.isArchived.read(reader);
				const readLabel = !isArchived && !element.chat.isRead.read(reader)
					? localize('sessionChatItemUnreadAria', "{0}, unread", label)
					: label;
				const stateLabel = isArchived
					? localize('sessionChatItemArchivedAria', "{0}, archived", label)
					: readLabel;
				if (!element.standalone) {
					return stateLabel;
				}
				const standaloneLabel = localize('sessionChatItemStandaloneAria', "{0}, in session {1}", stateLabel, element.session.title.read(reader));
				const searchHint = this.options?.getSearchHint?.(element, folderLabel ? [folderLabel] : []);
				return searchHint
					? localize('sessionChatItemSearchHintAria', "{0}, matches {1}", standaloneLabel, getSearchHintAriaLabel(searchHint))
					: standaloneLabel;
			});
		}
		if (isSessionGroupItem(element)) {
			return element.comparison
				? derived(this, reader => localize('comparisonGroupAria', "{0}, {1}, {2}", element.comparison!.title, element.comparison!.summary(reader), element.comparison!.configuration))
				: this.getSectionAriaLabel(element.group.name, element.subtreeSessions);
		}
		if (isSessionSection(element)) {
			if (element.pendingItems) {
				return localize('pendingSessionSectionAria', "{0}, {1}", element.label, element.pendingItems.length);
			}
			if (element.id === NEW_SESSION_SECTION_ID) {
				return derived(this, reader => {
					const keybindingAriaLabel = this.options?.newSessionKeybindingAriaLabel?.read(reader);
					return keybindingAriaLabel
						? localize('newSessionAria', "New Session ({0})", keybindingAriaLabel)
						: localize('newSessionAriaWithoutKeybinding', "New Session");
				});
			}
			if (element.id === AUTOMATIONS_SECTION_ID) {
				return derived(this, reader => {
					let label = element.label;
					switch (this.automationStatus?.read(reader)) {
						case SessionStatus.NeedsInput:
							label = localize('automationsNeedsInputAria', "{0}, run needs attention", element.label);
							break;
						case SessionStatus.InProgress:
							label = localize('automationsActiveAria', "{0}, run in progress", element.label);
							break;
						case SessionStatus.Completed:
							label = localize('automationsUnreadRunAria', "{0}, unread run", element.label);
							break;
					}
					return label;
				});
			}
			if (element.id === CUSTOMIZATIONS_SECTION_ID) {
				return derived(this, reader => {
					const count = this.options?.customizationsCount?.read(reader) ?? 0;
					const countLabel = count === 1
						? localize('customizationCountAria', "1 customization")
						: localize('customizationsCountAria', "{0} customizations", count);
					if (this.options?.customizationMigrationsAvailable?.read(reader)) {
						return localize('customizationsMigrationAvailableAria', "{0}, {1}, customization migrations available", element.label, countLabel);
					}
					const badge = this.options?.customizationsBadge?.read(reader);
					return badge !== undefined
						? localize('customizationsBadgeAria', "{0}, {1}, {2}", element.label, countLabel, badge)
						: localize('customizationsAria', "{0}, {1}", element.label, countLabel);
				});
			}
			const pinnedCanvas = element.pinnedCanvas;
			if (pinnedCanvas) {
				return derived(this, reader => getPinnedCanvasDescription(pinnedCanvas, reader));
			}
			if (isShortcutSection(element.id) || element.id === CANVASES_SECTION_ID) {
				return element.label;
			}
			return this.getSectionAriaLabel(element.label, element.sessions);
		}
		if (isSessionShowMore(element)) {
			if (element.mode === 'less') {
				return element.kind === 'folders'
					? localize('showLessWorkspacesAria', "Show fewer workspaces")
					: element.kind === 'repositories'
						? localize('showLessRepositoriesAria', "Show fewer repositories")
						: element.kind === 'environments'
							? localize('showLessEnvironmentsAria', "Show fewer environments")
							: localize('showLessAria', "Show fewer sessions");
			}
			return element.kind === 'folders'
				? element.remainingCount === 1
					? localize('showMoreWorkspaceAria', "Show {0} more workspace", element.remainingCount)
					: localize('showMoreWorkspacesAria', "Show {0} more workspaces", element.remainingCount)
				: element.kind === 'repositories'
					? element.remainingCount === 1
						? localize('showMoreRepositoryAria', "Show {0} more repository", element.remainingCount)
						: localize('showMoreRepositoriesAria', "Show {0} more repositories", element.remainingCount)
					: element.kind === 'environments'
						? element.remainingCount === 1
							? localize('showMoreEnvironmentAria', "Show {0} more environment", element.remainingCount)
							: localize('showMoreEnvironmentsAria', "Show {0} more environments", element.remainingCount)
						: localize('showMoreAria', "Show {0} more sessions", element.remainingCount);
		}
		if (isSessionPlaceholder(element)) {
			return element.hover
				? localize('sessionPlaceholderAria', "{0}. {1}", element.label, element.hover)
				: element.label;
		}
		return derived(this, reader => {
			const title = this.options?.getComparisonAttemptLabel?.(element) ?? element.title.read(reader);
			const mainChat = element.mainChat.read(reader);
			const showMetadataWhileActive = this.options?.showMetadataWhileActive?.(element);
			const updatedAt = getSessionRowUpdatedAt(element, mainChat, reader, this.options?.grouping?.(), showMetadataWhileActive);
			let label: string;
			if (this.options?.includeQuickChatInAriaLabel && element.isQuickChat?.read(reader)) {
				label = updatedAt ? localize('sessionItemQuickChatAria', "{0}, chat, updated {1}", title, fromNow(updatedAt, true)) : localize('sessionItemQuickChatWithoutTimeAria', "{0}, chat", title);
			} else if (element.worktreePending?.read(reader)) {
				label = updatedAt ? localize('sessionItemWorktreePendingAria', "{0}, creating worktree, updated {1}", title, fromNow(updatedAt, true)) : localize('sessionItemWorktreePendingWithoutTimeAria', "{0}, creating worktree", title);
			} else {
				label = updatedAt ? localize('sessionItemAria', "{0}, updated {1}", title, fromNow(updatedAt, true)) : title;
			}
			const collapsed = this.options?.collapsedSessionIds?.read(reader).has(element.sessionId) ?? true;
			if (this.options?.scheduledRequests
				? this.options.scheduledRequests.read(reader).get(getComparisonKey(mainChat.resource))?.length
				: this.options?.scheduledSessionResources?.read(reader).has(element.resource.toString())) {
				label = localize('scheduledSessionAria', "{0}, has scheduled messages", label);
			}
			const status = getSessionRowStatus(
				element,
				reader,
				!!this.options?.deriveStatusFromMainChat,
				collapsed,
			);
			if (this.options?.deriveStatusFromMainChat) {
				label = localize('sessionItemStatusAria', "{0}, {1}", label, getSessionConversationStatusAriaLabel(status));
			}
			// History rows show their status next to the time, so their label reads it too.
			const historyStatusMessage = (showMetadataWhileActive ? getSessionStatusMessage(status, element.description.read(reader)) : undefined)
				?? (status === SessionStatus.Completed ? this.options?.getCompletedStatusMessage?.(element, reader) : undefined);
			if (historyStatusMessage) {
				label = localize('sessionItemHistoryStatusAria', "{0}, {1}", label, typeof historyStatusMessage === 'string' ? historyStatusMessage : renderAsPlaintext(historyStatusMessage, { omitMarkdownSyntax: true }));
			}
			const triage = this.options?.getTriageDescription?.(element, reader);
			if (triage) {
				label = localize('sessionItemTriageAria', "{0}, {1}", label, triage);
			}
			const eligible = isExternalApplicationBadgeEligible(element, reader);
			if (eligible) {
				this.options?.reportExternalApplicationBadgeModeExperimentTrigger?.();
			}
			const badgeMode = this.options?.externalApplicationBadgeMode?.read(reader) ?? ExternalSessionApplicationBadgeMode.Off;
			if (eligible && badgeMode !== ExternalSessionApplicationBadgeMode.Off) {
				this.options?.reportExternalApplicationBadgeShowFromExperimentTrigger?.();
				label = localize('sessionItemExternalAria', "{0}, created in {1}", label, element.application.read(reader).label);
			}
			if (hasMixedChatHarnesses(element, reader)) {
				label = localize('sessionItemMixedHarnessesAria', "{0}, chats use different harnesses", label);
			}
			if (!element.isArchived.read(reader) && !getSessionRowIsRead(element, reader, !!this.options?.deriveStatusFromMainChat)) {
				label = localize('sessionItemUnreadAria', "{0}, unread", label);
			}
			const inputNeededMessage = this.options
				? getCompactInputNeededMessage(element, reader, this.options, this.options.approvalModel)
				: undefined;
			if (inputNeededMessage) {
				label = localize('sessionItemInputNeededMessageAria', "{0}, {1}", label, renderAsPlaintext(inputNeededMessage, { omitMarkdownSyntax: true }));
			}
			const locationLabel = this.options ? getSessionRowLocationLabel(element, reader, this.options) : undefined;
			const labeledLocation = showMetadataWhileActive || (status !== SessionStatus.InProgress && status !== SessionStatus.NeedsInput)
				? locationLabel
				: undefined;
			if (labeledLocation) {
				label = localize('sessionItemWorkspaceAria', "{0}, in {1}", label, labeledLocation);
			}
			const searchHint = this.options?.getSearchHint?.(element, labeledLocation ? [labeledLocation] : []);
			if (searchHint) {
				label = localize('sessionItemSearchHintAria', "{0}, matches {1}", label, getSearchHintAriaLabel(searchHint));
			}
			return label;
		});
	}

	private getSectionAriaLabel(label: string, sessions: readonly ISession[]): IObservable<string> {
		return derived(this, reader => {
			const status = this.options?.showUnreadInCollapsedSections?.read(reader) ? getSessionHeaderStatus(sessions, reader, this.options.sessionsWithFailingCI?.read(reader)) : undefined;
			switch (status) {
				case SessionHeaderStatus.NeedsInput:
					return localize('sessionSectionNeedsInputAria', "{0}, {1}, session needs attention", label, sessions.length);
				case SessionHeaderStatus.FailingCI:
					return localize('sessionSectionFailingCIAria', "{0}, {1}, session has failing CI checks", label, sessions.length);
				case SessionHeaderStatus.Unread:
					return localize('sessionSectionUnreadAria', "{0}, {1}, contains unread sessions", label, sessions.length);
				default:
					return localize('sessionSectionAria', "{0}, {1}", label, sessions.length);
			}
		});
	}
}

//#endregion

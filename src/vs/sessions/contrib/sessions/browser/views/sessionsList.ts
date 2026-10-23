/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../media/sessionsList.css';
import { SessionGroupAppearancePicker } from './sessionGroupAppearancePicker.js';
import * as DOM from '../../../../../base/browser/dom.js';
import { renderAsPlaintext } from '../../../../../base/browser/markdownRenderer.js';
import { Gesture } from '../../../../../base/browser/touch.js';
import { IListRenderer, IListVirtualDelegate, ListDragOverEffectPosition, ListDragOverEffectType, NotSelectableGroupId } from '../../../../../base/browser/ui/list/list.js';
import { IListStyles } from '../../../../../base/browser/ui/list/listWidget.js';
import { IObjectTreeElement, ITreeNode, ITreeRenderer, ITreeContextMenuEvent, ObjectTreeElementCollapseState, ITreeDragAndDrop, ITreeDragOverReaction, TreeDragOverBubble } from '../../../../../base/browser/ui/tree/tree.js';
import { LabelFuzzyScore, RenderIndentGuides, TreeFindMode } from '../../../../../base/browser/ui/tree/abstractTree.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { groupByMap } from '../../../../../base/common/collections.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { HighlightedLabel } from '../../../../../base/browser/ui/highlightedlabel/highlightedLabel.js';
import { createMatches, FuzzyScore, IMatch } from '../../../../../base/common/filters.js';
import { disposableTimeout } from '../../../../../base/common/async.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { constObservable, IObservable, IReader, ISettableObservable, autorun, derived, observableFromEvent, observableSignalFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { ThemeIcon, themeColorFromId } from '../../../../../base/common/themables.js';
import { hasKey, isDefined } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { fromNow } from '../../../../../base/common/date.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { OS } from '../../../../../base/common/platform.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { localize } from '../../../../../nls.js';
import { MenuId, IMenuService, MenuItemAction, SubmenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { MenuWorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { DropdownWithPrimaryActionViewItem } from '../../../../../platform/actions/browser/dropdownWithPrimaryActionViewItem.js';
import { createActionViewItem, getFlatContextMenuActions } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyValue, IContextKey, IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { MarshalledId } from '../../../../../base/common/marshallingIds.js';
import { SessionProviderIdContext, SessionSupportsDeleteContext, SessionSupportsMultipleChatsContext, SessionSupportsRenameContext, SessionTypeContext, IsPhoneLayoutContext, IsQuickChatSessionContext, SessionIsArchivedContext, SessionIsReadContext, SessionHasPullRequestContext, SessionItemIsMultiSelectionContext } from '../../../../common/contextkeys.js';
import { ARCHIVE_SESSION_COMMAND_ID, ARCHIVE_SESSIONS_WITH_UNDO_COMMAND_ID, DELETE_SESSION_GROUP_WITH_UNDO_COMMAND_ID, RENAME_CHAT_COMMAND_ID, RENAME_SESSION_COMMAND_ID } from '../../../../common/sessionCommands.js';
import { ExternalSessionApplicationBadgeMode, SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SETTING, SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SHOW_FROM_SETTING, SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING } from '../../../../common/sessionConfig.js';
import { UNKNOWN_SESSION_APPLICATION_ID } from '../../../../common/sessionApplication.js';
import { IContextMenuService, IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { parseGitHubPullRequestUrl } from '../../../../../platform/github/common/githubUrls.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { WorkbenchList, WorkbenchObjectTree } from '../../../../../platform/list/browser/listService.js';
import { IStyleOverride, defaultButtonStyles, defaultFindWidgetStyles, defaultInputBoxStyles, defaultKeybindingLabelStyles, defaultToggleStyles, getButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { chartsOrange } from '../../../../../platform/theme/common/colors/chartsColors.js';
import { asCssVariable } from '../../../../../platform/theme/common/colorUtils.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IConfigurationService, isConfigured } from '../../../../../platform/configuration/common/configuration.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { logSettingExperimentTrigger } from '../../../../../platform/telemetry/common/experimentTrigger.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ChatSessionArchiveActionWording, ChatSessionArchiveActionWordingSettingId, getChatSessionArchivedSectionLabel, getChatSessionArchiveActionWording } from '../../../../../platform/chat/common/sessionArchiveActions.js';
import { BRANCH_CHANGES_CHANGESET_ID, ChatInteractivity, ChatOriginKind, getChatCapabilities, getGitHubPullRequestRefs, getHighestPriorityPullRequestIcon, getSessionStatusMessage, getSessionWorkspaceKind, getUntitledSessionTitle, GITHUB_REMOTE_FILE_SCHEME, IChat, isActiveSessionStatus, ISession, ISessionEnvironment, ISessionWorkspace, SessionArtifactKind, SessionStatus, SessionWorkspaceKind } from '../../../../services/sessions/common/session.js';
import { ISessionChangesStats, readChatChangesStats } from '../../../../services/sessions/common/sessionChangesStatsCache.js';
import { AgentSessionApprovalModel, agentSessionApprovalId, IAgentSessionApprovalInfo } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionApprovalModel.js';
import { IVoicePlaybackService } from '../../../../../workbench/contrib/chat/common/voicePlaybackService.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import * as aria from '../../../../../base/browser/ui/aria/aria.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { Action, ActionRunner, IAction, Separator, SubmenuAction, toAction } from '../../../../../base/common/actions.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { createSessionActionViewItemProvider, getSessionArchiveActionViewItemOptions, SessionArchiveActionViewItem } from '../../../../browser/sessionActionViewItem.js';
import { HoverStyle, IDelayedHoverOptions } from '../../../../../base/browser/ui/hover/hover.js';
import { HoverPosition } from '../../../../../base/browser/ui/hover/hoverWidget.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { ISessionsManagementService, IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { getSessionComparisonHarnessLabel, getSessionComparisonParticipantsInDisplayOrder, ISessionComparison, ISessionComparisonService, SessionComparisonParticipantRole } from '../../../../services/sessions/common/sessionComparison.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionsListModelService, SessionSortMode } from '../../../../services/sessions/browser/sessionsListModelService.js';
import { getSessionGroupIdOfSection, getSessionGroupSectionId, ISessionGroup, ISessionGroupAppearance, ISessionGroupPlacement, ISessionGroupsService } from '../../../../services/sessions/browser/sessionGroupsService.js';
import { ISessionSectionOrderService } from '../../../../services/sessions/browser/sessionSectionOrderService.js';
import { InputBox, MessageType } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { IWorkbenchAssignmentService } from '../../../../../workbench/services/assignment/common/assignmentService.js';
import { IOnboardingFocusTarget, markOnboardingTarget } from '../../../../../workbench/contrib/onboarding/browser/spotlight/onboardingTarget.js';
import { OPEN_SESSION_COMPARISON_COMMAND_ID } from '../../../sessionComparison/common/sessionComparison.js';
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
import { IAgentSessionsService } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { IAgentHostFilterService } from '../../../../services/agentHostFilter/common/agentHostFilter.js';
import { compareSessionEnvironments, getSessionEnvironments, ISessionsListResettableState, SessionsListFilters } from './sessionsListFilters.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { buildOpenSessionLinkUri } from '../../../../../platform/agentHost/common/openSessionLink.js';
import { LocalSelectionTransfer } from '../../../../../platform/dnd/browser/dnd.js';
import { DraggedSessionIdentifier, fillSessionChatDragData, SessionsDataTransfers } from '../../../../browser/dnd.js';
import { getSessionsListChatDrop, getSessionsListSessionDrop, isChatMoveDndEnabled, ISessionsListChatDropTarget, runSessionsListMove, SessionsListChatDrop, SessionsListMove, SessionsListMoveNotice, SessionsListSessionDrop } from './sessionsListChatMove.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IDragAndDropData } from '../../../../../base/browser/dnd.js';
import { ElementsDragAndDropData, ListViewTargetSector } from '../../../../../base/browser/ui/list/listView.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { createSessionSummaryHover, getChatSummaryHoverData, getSessionDiffStats, getSessionSummaryHoverData } from '../sessionHoverContent.js';
import { SessionStatusIcon } from '../../../../browser/sessionStatusIcon.js';
import { ChatAutomationsEnabledContext } from '../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { AICustomizationManagementEditorInput } from '../../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditorInput.js';
import { IAutomationService } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { ICustomViewService } from '../../../../services/customView/browser/customViewService.js';
import { AUTOMATIONS_CUSTOM_VIEW_ID } from '../automationsConstants.js';
import { OPEN_AI_CUSTOMIZATIONS_COMMAND_ID } from '../customizationsConstants.js';
import { NEW_SESSION_ACTION_ID } from '../../../chat/common/constants.js';
import { Menus } from '../../../../browser/menus.js';
import { getSessionConversationStatusAriaLabel } from '../../../../browser/sessionConversationGroups.js';
import { getAgentMergeAwarePullRequestIcon, getSessionAgentMergeConfigurationObservable, ISessionAgentMergeConfiguration, isAgentMergePullRequestIcon } from '../../../../browser/sessionAgentMerge.js';
import { BlockedSessionReason, BlockedSessions } from '../../../blockedSessions/browser/blockedSessions.js';
import { getExtensionSuggestionsBadgeDescription } from '../../../extensions/browser/agentsWindowExtensionSuggestions.js';
import { KeybindingLabel } from '../../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { logSessionsInteraction } from '../../../../common/sessionsTelemetry.js';

const $ = DOM.$;

const NEW_SESSION_SECTION_ID = 'newSession';
const AUTOMATIONS_SECTION_ID = 'automations';
const CUSTOMIZATIONS_SECTION_ID = 'customizations';
const EXTERNAL_SESSIONS_SECTION_ID = 'external';
/** Ungrouped sessions sectioned by date share one sort order across these sections, in display order. */
const DATE_SECTION_IDS: readonly string[] = ['recent', 'older'];
const SESSION_SHORTCUT_SECTION_TEMPLATE_ID = 'session-shortcut-section';
const SESSION_SHORTCUT_ROW_HEIGHT = 28;
const SESSION_SECTION_FOCUS_FROM_POINTER_CLASS = 'session-section-focus-from-pointer';
const SESSION_HEADER_DROP_TARGET_CLASS = 'session-header-drop-target';
/** Shared empty set used as the default "no session hierarchy is hovered/selected" value. */
const EMPTY_GUIDE_SESSION_IDS: ReadonlySet<string> = new Set();
const SESSION_GROUP_DEPTH_PROPERTY = '--session-group-depth';

/** Steps a row in by one nesting step per level that its custom group is nested in (see `sessionsList.css`). */
function setSessionGroupDepth(container: HTMLElement, depth: number): void {
	if (depth > 0) {
		container.style.setProperty(SESSION_GROUP_DEPTH_PROPERTY, String(depth));
	} else {
		container.style.removeProperty(SESSION_GROUP_DEPTH_PROPERTY);
	}
}

export const SessionItemContextMenuId = MenuId.SessionItemContextMenu;
export const SessionSectionToolbarMenuId = new MenuId('SessionSectionToolbar');
export const SessionGroupToolbarMenuId = new MenuId('SessionGroupToolbar');
export const NEW_SESSION_FOR_WORKSPACE_ACTION_ID = 'sessionsView.sectionNewSession';
/** Starts a new session like a repository section's most recent session in one environment. Arguments: the section and the environment id. */
export const NEW_SESSION_IN_ENVIRONMENT_ACTION_ID = 'sessionsView.sectionNewSessionInEnvironment';

/** Controls whether the empty default Chats group is shown in the sessions list. */
export const SESSIONS_LIST_SHOW_EMPTY_DEFAULT_GROUPS_SETTING = 'sessions.list.showEmptyDefaultGroups';
export const SESSIONS_LIST_SHOW_UNREAD_IN_COLLAPSED_SECTIONS_SETTING = 'sessions.list.showUnreadInCollapsedSections';
export const SESSIONS_LIST_SHOW_ARCHIVED_BY_DEFAULT_SETTING = 'sessions.list.showArchivedByDefault';

export const IsSessionPinnedContext = new RawContextKey<boolean>('sessionItem.isPinned', false);
export const SessionItemStatusContext = new RawContextKey<SessionStatus>('sessionItem.status', SessionStatus.Completed);
export const SessionItemHasUnreadNestedSessionsContext = new RawContextKey<boolean>('sessionItem.hasUnreadNestedSessions', false);
type SessionContextKeyProvider = (session: ISession, reader: IReader | undefined) => Iterable<[string, ContextKeyValue]>;
export const SessionChatItemCanRenameContext = new RawContextKey<boolean>('sessionChatItem.canRename', false);
export const SessionChatItemCanArchiveContext = new RawContextKey<boolean>('sessionChatItem.canArchive', false);
export const SessionChatItemCanDeleteContext = new RawContextKey<boolean>('sessionChatItem.canDelete', false);
/** Whether the chat item's chat can move out of its session, e.g. into a new session: its provider moves chats and the chat is movable. */
export const SessionChatItemCanMoveContext = new RawContextKey<boolean>('sessionChatItem.canMove', false);
export const SessionChatItemIsArchivedContext = new RawContextKey<boolean>('sessionChatItem.isArchived', false);
export const SessionChatItemIsReadContext = new RawContextKey<boolean>('sessionChatItem.isRead', true);
/** Whether the chat item's chat can be marked read or unread on its own: it is its session's main chat, or its session tracks read state per chat. */
export const SessionChatItemCanSetReadStateContext = new RawContextKey<boolean>('sessionChatItem.canSetReadState', false);
export const SessionChatItemIsUntitledContext = new RawContextKey<boolean>('sessionChatItem.isUntitled', false);
/** Whether the chat row stands on its own in its section instead of being nested under its session's row. */
export const SessionChatItemIsStandaloneContext = new RawContextKey<boolean>('sessionChatItem.isStandalone', false);
export const SessionChatItemCanMoveUpContext = new RawContextKey<boolean>('sessionChatItem.canMoveUp', false);
export const SessionChatItemCanMoveDownContext = new RawContextKey<boolean>('sessionChatItem.canMoveDown', false);
export const SessionsListFocusedChatItemContext = new RawContextKey<boolean>('sessionsList.focusedChatItem', false);
/** Whether the focused session item currently belongs to a user group. */
export const SessionItemInGroupContext = new RawContextKey<boolean>('sessionItem.inGroup', false);
export const SessionItemInExternalSectionContext = new RawContextKey<boolean>('sessionItem.inExternalSection', false);
export const SessionItemIsCloudContext = new RawContextKey<boolean>('sessionItem.isCloud', false);
export const SessionItemCanImportContext = new RawContextKey<boolean>('sessionItem.canImport', false);
export const SessionSectionTypeContext = new RawContextKey<string>('sessionSection.type', '');
export const SessionSectionHasGitHubRepositoryContext = new RawContextKey<boolean>('sessionSection.hasGitHubRepository', false);
export const SessionSectionHasNonCloudRepositoryContext = new RawContextKey<boolean>('sessionSection.hasNonCloudRepository', false);
export const SessionGroupHasVisibleSessionsContext = new RawContextKey<boolean>('sessionGroup.hasVisibleSessions', false);
export const SessionGroupIsEmptyContext = new RawContextKey<boolean>('sessionGroup.isEmpty', false);
export const SessionGroupIsComparisonContext = new RawContextKey<boolean>('sessionGroup.isComparison', false);

//#region Types

export enum SessionsGrouping {
	Workspace = 'workspace',
	Repository = 'repository',
	Environment = 'environment',
	Date = 'date',
}

export enum SessionsSorting {
	Created = 'created',
	Updated = 'updated',
}

function sortingToMode(sorting: SessionsSorting): SessionSortMode {
	return sorting === SessionsSorting.Updated ? 'updated' : 'created';
}

/** Fallback spacing (ms) used when assigning synthetic sort keys past an open boundary. */
const SORT_FALLBACK_STEP_MS = 60_000;

/** Spacing (ms) between synthetic sort keys that keep dropped sessions directly next to their anchor. */
const ADJACENT_SORT_STEP_MS = 1;

export interface ISessionSection {
	readonly id: string;
	readonly collapseStateId?: string;
	readonly label: string;
	readonly sessions: ISession[];
	/** The repository of a repository section. */
	readonly repository?: ISessionRepository;
	readonly environment?: ISessionEnvironment;
}

/** A GitHub repository that sessions work in, whichever environment they run in. */
export interface ISessionRepository {
	readonly owner: string;
	readonly name: string;
}

/**
 * A user-created group rendered as a section-like header. Carries the backing
 * {@link ISessionGroup} plus its currently-visible member sessions and whether
 * the header should render its inline name editor. Its subgroups render above
 * its own sessions.
 */
export interface ISessionGroupItem {
	readonly group: ISessionGroup;
	/** How many groups the group is nested in: 0 for a top-level group. */
	readonly depth: number;
	/** The group's own visible sessions, not those of its subgroups. */
	readonly sessions: ISession[];
	/** The visible sessions of the group and of its subgroups at any depth. */
	readonly subtreeSessions: readonly ISession[];
	/** Whether the group has neither member sessions nor subgroups. */
	readonly isEmpty: boolean;
	readonly editing: boolean;
	readonly comparison?: {
		readonly id: string;
		readonly title: string;
		readonly launching: boolean;
		readonly summary: (reader?: IReader) => string;
	};
}

// allow-any-unicode-next-line
/** A group's name after the names of the groups it is nested in, such as "Release work › Hotfixes". */
function getSessionGroupPathLabel(path: readonly ISessionGroup[]): string {
	// allow-any-unicode-next-line
	return path.reduce((label, group, index) => index === 0 ? group.name : localize('sessionGroupPathLabel', "{0} › {1}", label, group.name), '');
}

export interface ISessionShowMore {
	readonly showMore: true;
	/** What the row reveals: a section's sessions, or the grouping sections capping hides. */
	readonly kind: 'sessions' | 'folders' | 'repositories' | 'environments';
	readonly mode: 'more' | 'less';
	readonly sectionId: string;
	/** Stable identity of the show more/show less state this row toggles. */
	readonly stateId: string;
	readonly sectionLabel: string;
	readonly remainingCount: number;
}

/** Synthetic muted row shown when a section is empty. */
export interface ISessionPlaceholder {
	readonly placeholder: true;
	readonly sectionId: string;
	readonly label: string;
	readonly hover?: string;
}

export class SessionChatItem {
	constructor(
		readonly session: ISession,
		readonly chat: IChat,
		readonly isLast?: boolean,
		/**
		 * Whether the chat has its own row in a section rather than being
		 * nested under its session's row: a done chat of a session that is
		 * not done, listed in the Done section.
		 */
		readonly standalone?: boolean,
	) { }
}

export type ISessionChatItem = SessionChatItem;

export type SessionListItem = ISession | SessionChatItem | ISessionSection | ISessionGroupItem | ISessionShowMore | ISessionPlaceholder;
type SessionGroupConnectorPosition = 'first' | 'middle' | 'last';

function isSessionChatItem(item: SessionListItem): item is ISessionChatItem {
	return item instanceof SessionChatItem;
}

/** The done chats of a session that is not done, which the Done section lists as rows of their own. */
function getSessionDoneListChats(session: ISession, reader?: IReader): readonly IChat[] {
	return session.isArchived.read(reader) ? [] : getSessionListChats(session, reader, true).filter(chat => chat.isArchived.read(reader));
}

function getChatTitle(chat: IChat, reader?: IReader): string {
	if (chat.status.read(reader) === SessionStatus.Untitled) {
		return getUntitledSessionTitle(false);
	}
	return chat.title.read(reader).trim() || localize('untitledChat', "Untitled Chat");
}

export function formatSessionListTime(date: Date): string {
	const seconds = Math.round((Date.now() - date.getTime()) / 1000);
	return seconds < 60 ? localize('secondsDuration', "now") : fromNow(date, true);
}

export function getSessionListChats(session: ISession, reader?: IReader, showArchived = false): readonly IChat[] {
	const mainChat = session.mainChat.read(reader);
	return session.chats.read(reader).filter(chat =>
		!isEqual(chat.resource, mainChat.resource) &&
		chat.origin?.kind !== ChatOriginKind.Tool &&
		(!chat.isArchived.read(reader) || showArchived) &&
		chat.interactivity.read(reader) !== ChatInteractivity.Hidden
	);
}

/** Whether a session is archived or lists archived chats, both of which the archived filter hides. */
function hasArchivedListContent(session: ISession): boolean {
	return session.isArchived.get() || getSessionListChats(session, undefined, true).some(chat => chat.isArchived.get());
}

/** Whether the chat is the open chat of the active session. */
function isOpenChat(session: ISession, chat: IChat, activeSession: IObservable<IActiveSession | undefined> | undefined, reader: IReader | undefined): boolean {
	const active = activeSession?.read(reader);
	return active?.sessionId === session.sessionId && isEqual(active.activeChat.read(reader).resource, chat.resource);
}

/** The open chat's live Branch Changes, else the session aggregate. Keep in sync with the session hover's main chat counts. */
function getSessionListChatDiffStats(session: ISession, chat: IChat, activeSession: IObservable<IActiveSession | undefined> | undefined, reader: IReader): { files: number; insertions: number; deletions: number } | undefined {
	if (isOpenChat(session, chat, activeSession, reader)) {
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
function getSessionRowStatus(session: ISession, reader: IReader | undefined, deriveFromMainChat: boolean, collapsed = true): SessionStatus {
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

function isSessionActive(session: ISession, reader: IReader | undefined): boolean {
	return isActiveSessionStatus(session.status.read(reader));
}

function getComparisonSessions(comparison: ISessionComparison, sessionsManagementService: ISessionsManagementService): ISession[] {
	return comparison.participants.flatMap(participant => {
		if (!participant.sessionResource) {
			return [];
		}
		const session = sessionsManagementService.getSession(participant.sessionResource);
		return session ? [session] : [];
	});
}

function isSessionGroupItem(item: SessionListItem): item is ISessionGroupItem {
	return 'group' in item;
}

function isSessionSection(item: SessionListItem): item is ISessionSection {
	return !isSessionGroupItem(item) && 'sessions' in item && Array.isArray((item as ISessionSection).sessions);
}

function getSessionSectionIcon(sectionId: string): ThemeIcon | undefined {
	switch (sectionId) {
		case NEW_SESSION_SECTION_ID:
			return Codicon.plus;
		case QUICK_CHATS_SECTION_ID:
			return Codicon.commentDiscussion;
		case 'pinned':
			return Codicon.pinned;
		case EXTERNAL_SESSIONS_SECTION_ID:
			return Codicon.chatImport;
		case AUTOMATIONS_SECTION_ID:
			return Codicon.calendar;
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

function isShortcutSection(sectionId: string): boolean {
	return sectionId === NEW_SESSION_SECTION_ID || sectionId === AUTOMATIONS_SECTION_ID || sectionId === CUSTOMIZATIONS_SECTION_ID;
}

const REPOSITORY_SECTION_PREFIX = 'repository:';
const ENVIRONMENT_SECTION_PREFIX = 'environment:';

/** Whether a section lists one workspace, repository, or environment and can be reordered among custom groups. */
function isSessionGroupingSection(sectionId: string): boolean {
	return sectionId.startsWith('workspace:') || sectionId.startsWith(REPOSITORY_SECTION_PREFIX) || sectionId.startsWith(ENVIRONMENT_SECTION_PREFIX);
}

function isSessionShowMore(item: SessionListItem): item is ISessionShowMore {
	return 'showMore' in item && (item as ISessionShowMore).showMore === true;
}

function isSessionPlaceholder(item: SessionListItem): item is ISessionPlaceholder {
	return 'placeholder' in item && (item as ISessionPlaceholder).placeholder === true;
}

function isSessionItem(item: SessionListItem): item is ISession {
	return !isSessionChatItem(item) && !isSessionGroupItem(item) && !isSessionSection(item) && !isSessionShowMore(item) && !isSessionPlaceholder(item);
}

function getSessionKeyboardNavigationLabels(session: ISession): string[] {
	const labels = [session.title.get()];
	for (const folder of session.workspace.get()?.folders ?? []) {
		for (const pullRequest of getGitHubPullRequestRefs(folder.gitRepository?.gitHubInfo.get())) {
			labels.push(`#${pullRequest.number}`);
		}
	}
	for (const artifact of session.artifacts?.get() ?? []) {
		const pullRequest = artifact.kind === SessionArtifactKind.PullRequest && artifact.isGitHub !== false && artifact.link
			? parseGitHubPullRequestUrl(artifact.link.toString(true))
			: undefined;
		if (pullRequest) {
			labels.push(`#${pullRequest.number}`);
		}
	}
	return labels;
}

function getSessionTitleMatches(session: ISession, filterData: FuzzyScore | LabelFuzzyScore | undefined): IMatch[] | undefined {
	if (!filterData) {
		return undefined;
	}
	if (Array.isArray(filterData)) {
		return createMatches(filterData);
	}
	return filterData.label === session.title.get() ? createMatches(filterData.score) : undefined;
}

const SHOW_MORE_FOLDERS_LABEL = '__more_folders__';
const FOUR_DAYS_MS = 4 * 24 * 60 * 60 * 1000;
const INSET_ROW_GAP = 2;

/**
 * Default number of terminal-command lines shown in a session row's approval
 * prompt. The blocked-sessions dropdown overrides this to show more lines.
 */
const DEFAULT_APPROVAL_ROW_MAX_LINES = 3;

//#endregion

//#region Tree Delegate

class SessionsTreeDelegate implements IListVirtualDelegate<SessionListItem> {
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
	) { }

	private withInsetRowSpacing(height: number): number {
		return height + (this._useInsetRowSpacing ? INSET_ROW_GAP : 0);
	}

	getHeight(element: SessionListItem): number {
		if (isSessionChatItem(element)) {
			return this.withInsetRowSpacing(this.withChatApprovalHeight(element, this.getChatBaseHeight()));
		}
		if (isSessionGroupItem(element) && element.comparison) {
			return SessionsTreeDelegate.COMPARISON_SECTION_HEIGHT;
		}

		if (isSessionSection(element)) {
			return isShortcutSection(element.id)
				? this.withInsetRowSpacing(SessionsTreeDelegate.SECTION_HEIGHT)
				: SessionsTreeDelegate.SECTION_HEIGHT;
		}
		if (isSessionGroupItem(element)) {
			return SessionsTreeDelegate.SECTION_HEIGHT;
		}
		if (isSessionShowMore(element)) {
			return this.withInsetRowSpacing(SessionsTreeDelegate.SHOW_MORE_HEIGHT);
		}
		if (isSessionPlaceholder(element)) {
			return SessionsTreeDelegate.PLACEHOLDER_HEIGHT;
		}

		let height: number;
		if (this._isPhone()) {
			height = SessionsTreeDelegate.ITEM_HEIGHT_PHONE;
		} else if (this._isComparisonAttempt(element as ISession)) {
			height = SessionsTreeDelegate.ITEM_HEIGHT_COMPARISON_ATTEMPT;
		} else if (this._useCompactQuickChatRows && isQuickChatSession(element as ISession)) {
			height = SessionsTreeDelegate.ITEM_HEIGHT_QUICK_CHAT;
		} else if (this._isCompact()) {
			height = SessionsTreeDelegate.ITEM_HEIGHT_COMPACT;
		} else {
			height = SessionsTreeDelegate.ITEM_HEIGHT;
		}
		const session = element as ISession;
		let approval: IAgentSessionApprovalInfo | undefined;
		if (this._approvalModel) {
			// In the main tree only the main chat's approval renders on the session
			// row (nested/side chats surface theirs on their own rows); flat lists
			// with no chat rows aggregate an approval from any of the session's chats.
			approval = getSessionRowApproval(this._approvalModel, session, undefined, this._aggregateChatApprovals);
			if (approval) {
				height += SessionItemRenderer.getApprovalRowHeight(approval.label, this._approvalRowMaxLines);
			}
		}
		if (!approval && this._isCompact() && this._getSessionStatus(session) === SessionStatus.NeedsInput) {
			height += SessionsTreeDelegate.INPUT_NEEDED_ROW_HEIGHT;
		}
		if (this._ciFixModel && this._ciFixModel.getCIFix(element as ISession).get()) {
			height += SessionItemRenderer.CI_ROW_HEIGHT;
		}
		return this.withInsetRowSpacing(height);
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
			+ SessionItemRenderer.getApprovalRowHeight(approval.label, this._approvalRowMaxLines)
			+ (this._isPhone() ? SessionsTreeDelegate.CHAT_APPROVAL_PHONE_BOTTOM_SLACK : 0);
	}

	hasDynamicHeight(element: SessionListItem): boolean {
		if (isSessionChatItem(element)) {
			return !!this._approvalModel;
		}
		return (!!this._approvalModel || !!this._ciFixModel) && isSessionItem(element);
	}

	getTemplateId(element: SessionListItem): string {
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
	readonly statusIcon: SessionStatusIcon;
	readonly title: HighlightedLabel;
	readonly titleContainer: HTMLElement;
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

function withSessionsListHoverPresentation(hover: Pick<IDelayedHoverOptions, 'content' | 'onDidShow' | 'onDidHide'>): IDelayedHoverOptions {
	return {
		...hover,
		additionalClasses: ['sessions-list-hover'],
		appearance: { showPointer: true },
		position: { hoverPosition: HoverPosition.RIGHT, forcePosition: true },
		persistence: { hideOnHover: false },
	};
}

function getCreatorHoverData(
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

class SessionChatItemRenderer implements ITreeRenderer<SessionListItem, FuzzyScore, ISessionChatItemTemplate> {
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
		 * Session IDs whose hierarchy indent/connector guides should be shown —
		 * i.e. the session (or one of its chats) is currently hovered or
		 * selected. Read reactively so guides appear only while the pointer or
		 * selection is within this exact session's hierarchy.
		 */
		private readonly activeGuideSessionIds: IObservable<ReadonlySet<string>> = constObservable(EMPTY_GUIDE_SESSION_IDS),
		/** How many groups deep the custom group whose rows include a chat row is nested; the row steps in by that many levels. */
		private readonly getGroupDepth: (item: ISessionChatItem) => number = () => 0,
	) { }

	renderTemplate(container: HTMLElement): ISessionChatItemTemplate {
		const disposables = new DisposableStore();
		const elementDisposables = disposables.add(new DisposableStore());
		container.classList.add('session-chat-item');

		const titleRow = DOM.append(container, $('.session-chat-title-row'));
		const iconContainer = DOM.append(titleRow, $('.session-chat-icon'));
		iconContainer.setAttribute('aria-hidden', 'true');
		const statusIcon = disposables.add(this.instantiationService.createInstance(SessionStatusIcon, iconContainer));
		const titleContainer = DOM.append(titleRow, $('.session-chat-title'));
		const title = disposables.add(new HighlightedLabel(titleContainer));
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

		return { container, statusIcon, title, titleContainer, titleInputContainer, compactHoverDescription, folderRow, titleToolbar, approvalRow, approvalLabel, approvalButtonContainer, canArchiveContext, canDeleteContext, isUntitledContext, isArchivedContext, isStandaloneContext, disposables, elementDisposables };
	}

	renderElement(node: ITreeNode<SessionListItem, FuzzyScore>, _index: number, template: ISessionChatItemTemplate): void {
		const element = node.element;
		if (!isSessionChatItem(element)) {
			return;
		}

		template.elementDisposables.clear();
		template.titleToolbar.context = element;
		setSessionGroupDepth(template.container, this.getGroupDepth(element));
		template.elementDisposables.add(toDisposable(() => template.container.classList.remove('renaming')));
		template.container.classList.toggle('last-chat', element.isLast);
		template.container.classList.toggle('standalone', !!element.standalone);
		template.isStandaloneContext.set(!!element.standalone);
		template.elementDisposables.add(autorun(reader => {
			template.title.set(getChatTitle(element.chat, reader), createMatches(node.filterData));
			const status = element.chat.status.read(reader);
			const isArchived = element.chat.isArchived.read(reader);
			const isRead = element.chat.isRead.read(reader);
			const completedStateIcon = (element.session.workspace.read(reader)?.folders.length ?? 0) > 1
				? getHighestPriorityPullRequestIcon(
					element.chat.workspace.read(reader)?.folders.flatMap(folder =>
						getGitHubPullRequestRefs(folder.gitRepository?.gitHubInfo.read(reader)).map(pullRequest => pullRequest.icon)
					) ?? []
				)
				: undefined;
			const capabilities = getChatCapabilities(element.chat, element.session, reader);
			template.canArchiveContext.set(capabilities.canArchive);
			template.canDeleteContext.set(capabilities.canDelete);
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
				reader.store.add(this.hoverService.setupDelayedHover(badge, { content: folderLabel }, { groupId: 'sessions-list' }));
			}

			const showDetailsRow = !this.compact();
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
				reader.store.add(this.hoverService.setupDelayedHover(statusElement, { content: statusDescription }, { groupId: 'sessions-list' }));
			} else if (showDetailsRow && folderLabel && chatWorkspace) {
				const kind = getSessionWorkspaceKind(chatWorkspace, false);
				const icon = kind === SessionWorkspaceKind.Worktree ? Codicon.worktreeCompact : Codicon.folderCompact;
				const iconContainer = DOM.append(template.folderRow, $('span.session-chat-folder-icon'));
				DOM.append(iconContainer, $(`span${ThemeIcon.asCSSSelector(icon)}`));
				const label = DOM.append(template.folderRow, $('span.session-chat-folder-label', undefined, folderLabel));
				reader.store.add(this.hoverService.setupDelayedHover(label, { content: folderLabel }, { groupId: 'sessions-list' }));
			}
			const hasLeadingDetail = statusMessage !== undefined || !!folderLabel;
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
		const markdownRendererService = this.markdownRendererService;
		const chatResource = element.chat.resource;
		let lastApprovalHeight = approvalRowHeightFor(approvalModel.getApproval(chatResource).get(), this.approvalRowMaxLines);
		template.approvalRow.classList.toggle('visible', lastApprovalHeight > 0);

		const buttonStore = template.elementDisposables.add(new DisposableStore());

		template.elementDisposables.add(autorun(reader => {
			buttonStore.clear();

			const info = approvalModel.getApproval(chatResource).read(reader);
			const visible = !!info;

			template.approvalRow.classList.toggle('visible', visible);

			if (info) {
				renderApprovalRowContent(info, {
					label: template.approvalLabel,
					buttonContainer: template.approvalButtonContainer,
				}, buttonStore, markdownRendererService, this.hoverService, true, this.approvalRowMaxLines, approvalId => {
					this._onDidApproveSession.fire({ session: element.session, approvalId });
				});
			}

			// Fire on any height change while onscreen, not just visibility — the
			// model can swap one pending approval for another whose label spans a
			// different number of lines, changing the reserved row height.
			const height = approvalRowHeightFor(info, this.approvalRowMaxLines);
			if (height !== lastApprovalHeight) {
				lastApprovalHeight = height;
				this._onDidChangeItemHeight.fire(element);
			}
		}));
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
	return info ? SessionItemRenderer.getApprovalRowHeight(info.label, maxLines) : 0;
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

	if (showHover) {
		const fullContent = new MarkdownString().appendCodeblock(info.languageId ?? 'json', info.label);
		store.add(hoverService.setupDelayedHover(elements.label, {
			content: fullContent,
			style: HoverStyle.Pointer,
			position: { hoverPosition: HoverPosition.BELOW },
		}));
	}

	elements.buttonContainer.textContent = '';
	const button = store.add(new Button(elements.buttonContainer, {
		title: localize('allowActionOnce', "Allow once"),
		// All simultaneously visible "Allow" buttons share the same visible label
		// and tooltip, so give each an explicit accessible name that names the
		// command/action it approves — otherwise screen-reader users can't tell
		// which chat's action a button belongs to. Keep the "once" scope so the
		// one-time nature of the permission is still conveyed.
		ariaLabel: localize('allowActionAria', "Allow once: {0}", info.label),
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

//#endregion

//#region Session Item Renderer

/**
 * Resolves inline toolbar actions against either a focused-list handler or the
 * current multi-selection.
 */
class SessionItemActionRunner extends ActionRunner {

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

function renderInlineRenameInput(
	container: HTMLElement,
	contextViewService: IContextViewService,
	state: IInlineRenameValueState,
	ariaLabel: string,
	disposables: DisposableStore,
	onFinish: (title: string | undefined, restoreListFocus: boolean) => void,
): InputBox {
	DOM.clearNode(container);
	const input = new InputBox(container, contextViewService, {
		inputBoxStyles: defaultInputBoxStyles,
		ariaLabel,
		validationOptions: {
			validation: value => value.trim()
				? null
				: { content: localize('inlineRename.empty', "Title cannot be empty"), type: MessageType.ERROR },
		},
	});
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

	disposables.add(DOM.addDisposableListener(input.inputElement, DOM.EventType.INPUT, () => state.value = input.value));
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

interface ISessionOnboardingTarget {
	readonly session: ISession;
	readonly archiveAction: boolean;
}

const SESSION_EXTERNAL_APPLICATION_BADGE_HOVERED_CLASS = 'external-application-badge-hovered';

interface ISessionItemTemplate {
	readonly container: HTMLElement;
	readonly statusIcon: SessionStatusIcon;
	readonly title: HighlightedLabel;
	readonly titleRow: HTMLElement;
	readonly titleContainer: HTMLElement;
	readonly externalApplicationBadge: HTMLElement;
	readonly externalApplicationBadgeLabel: HTMLElement;
	readonly titleInputContainer: HTMLElement;
	readonly compactHoverDescription: HTMLElement;
	readonly titleToolbar: MenuWorkbenchToolBar | undefined;
	readonly renderedSession: ISettableObservable<ISession | undefined>;
	readonly pendingVoiceIndicator: HTMLElement;
	readonly comparisonAttemptStatus: HTMLElement;
	readonly comparisonAttemptStatusIcon: HTMLElement;
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

class SessionItemRenderer implements ITreeRenderer<SessionListItem, FuzzyScore | LabelFuzzyScore, ISessionItemTemplate> {
	static readonly TEMPLATE_ID = 'session-item';
	readonly templateId = SessionItemRenderer.TEMPLATE_ID;
	readonly rowClassName = 'session-list-inset-row';

	private static readonly _APPROVAL_ROW_LINE_HEIGHT = 18;
	private static readonly _APPROVAL_ROW_OVERHEAD = 14;

	/** Height of the single-line "Fix CI" row (label + orange button), including its top margin. */
	static readonly CI_ROW_HEIGHT = 32;

	static getApprovalRowHeight(label: string, maxLines: number = DEFAULT_APPROVAL_ROW_MAX_LINES): number {
		const lineCount = Math.min(label.split(/\r?\n/).length, maxLines);
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
			grouping: () => SessionsGrouping; isPinned: (session: ISession) => boolean; isRenderedInCustomGroup?: (session: ISession) => boolean; getGroupConnectorPosition?: (session: ISession) => SessionGroupConnectorPosition | undefined; getComparisonAttemptLabel?: (session: ISession) => string | undefined; shouldShowComparisonAttemptStatus?: (session: ISession, reader: IReader) => boolean; visibleSessions: IObservable<readonly (IActiveSession | undefined)[]>; getMultiSelectedSessions: (session: ISession) => ISession[]; showHover: boolean; useCompactQuickChatRows: boolean; compact: () => boolean; approvalRowMaxLines: number; aggregateChatApprovals: boolean; toolbarMenuId: MenuId | undefined; toolbarTelemetrySource: string; inlineRename: boolean; contextViewService?: IContextViewService; handleToolbarAction?: (action: IAction, session: ISession) => boolean | Promise<boolean>; onDidDoubleClickRename?: (session: ISession) => void; onDidFinishRename?: () => void; onDidRequestRename?: (session: ISession) => void; activeGuideSessionIds?: IObservable<ReadonlySet<string>>;
			/** Whether status presentation derives from the main chat instead of the aggregate session. */
			deriveStatusFromMainChat?: boolean;
			activeSession?: IObservable<IActiveSession | undefined>;
			/** Sessions whose collapsed child rows should contribute active status to the parent row. */
			collapsedSessionIds?: IObservable<ReadonlySet<string>>;
			getAdditionalContextKeys?: SessionContextKeyProvider;
			showMetadataWhileActive?: (session: ISession) => boolean;
			getCompletedStatusMessage?: (session: ISession, reader: IReader | undefined) => string | undefined;
			onboardingTarget?: IObservable<ISessionOnboardingTarget | undefined>;
			isRenderedInExternalSection?: (session: ISession) => boolean;
			/** How many groups deep the custom group whose rows include the session's row is nested; the row steps in by that many levels. */
			getGroupDepth?: (session: ISession) => number;
			/** The environment badge of a session in a repository section, or `undefined` when it runs on this computer. */
			getEnvironmentBadgeLabel?: (session: ISession) => string | undefined;
			externalApplicationBadgeMode?: IObservable<ExternalSessionApplicationBadgeMode>;
			externalApplicationBadgeShowFrom?: IObservable<boolean>;
			reportExternalApplicationBadgeModeExperimentTrigger?: () => void;
			reportExternalApplicationBadgeShowFromExperimentTrigger?: () => void;
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
	) {
	}

	renderTemplate(container: HTMLElement): ISessionItemTemplate {
		const disposables = new DisposableStore();
		const elementDisposables = disposables.add(new DisposableStore());
		const renderedSession = observableValue<ISession | undefined>('renderedSession', undefined);

		container.classList.add('session-item');

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
		const comparisonAttemptStatusIcon = DOM.append(comparisonAttemptStatus, $('span.session-comparison-attempt-status-icon'));
		comparisonAttemptStatusIcon.setAttribute('aria-hidden', 'true');
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
			titleToolbar = disposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, titleToolbarContainer, this.options.toolbarMenuId, {
				menuOptions: { shouldForwardArgs: true },
				actionRunner,
				telemetrySource: this.options.toolbarTelemetrySource,
				actionViewItemProvider: (action, options) => {
					if (action.id !== ARCHIVE_SESSION_COMMAND_ID || !(action instanceof MenuItemAction) || !this.options.onboardingTarget) {
						return actionViewItemProvider(action, options);
					}
					return scopedInstantiationService.createInstance(class extends SessionArchiveActionViewItem {
						override render(container: HTMLElement): void {
							super.render(container);
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

		return { container, statusIcon, title, titleRow, titleContainer, externalApplicationBadge, externalApplicationBadgeLabel, titleInputContainer, compactHoverDescription, titleToolbar, renderedSession, pendingVoiceIndicator, comparisonAttemptStatus, comparisonAttemptStatusIcon, comparisonAttemptStatusLabel, detailsRow, approvalRow, approvalLabel, approvalButtonContainer, inputNeededRow, inputNeededLabel, ciRow, ciLabel, ciButtonContainer, contextKeyService, statusContext, isReadContext, isArchivedContext, isQuickChatContext, supportsMultipleChatsContext, supportsDeleteContext, disposables, elementDisposables };
	}

	renderElement(node: ITreeNode<SessionListItem, FuzzyScore | LabelFuzzyScore>, _index: number, template: ISessionItemTemplate): void {
		const element = node.element;
		if (!isSessionItem(element)) {
			return;
		}
		this.renderSession(element, template, getSessionTitleMatches(element, node.filterData));
	}

	private renderSession(element: ISession, template: ISessionItemTemplate, matches?: IMatch[]): void {
		template.elementDisposables.clear();
		setSessionGroupDepth(template.container, this.options.getGroupDepth?.(element) ?? 0);
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
			template.elementDisposables.add(this.hoverService.setupDelayedHover(template.container, () =>
				withSessionsListHoverPresentation(createSessionSummaryHover(
					element,
					// Observed Branch Changes are read from memory; reading unobserved ones would load the chat from its backend.
					getSessionSummaryHoverData(element, this.sessionsProvidersService, this.openerService, this.labelService, getCreatorHoverData(element, this.sessionsManagementService, this.agentHostConnectionsService, this.openerService), this.options.compact(), rowObservesMainChatBranchChanges),
					this.openerService,
				)), { groupId: 'sessions-list' }));
		}

		// Pending voice response indicator: a response arrived while this session
		// was unfocused and is held until it is.
		const pendingVoiceResource = element.resource;
		template.pendingVoiceIndicator.className = 'session-pending-voice-indicator ' + ThemeIcon.asClassName(Codicon.unmute);
		template.elementDisposables.add(this.hoverService.setupManagedHover(
			getDefaultHoverDelegate('mouse'),
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

		// Hierarchy indent/connector guides — visible only while this exact
		// session (or one of its chat children) is hovered or selected.
		template.elementDisposables.add(autorun(reader => {
			const showGuides = (this.options.activeGuideSessionIds?.read(reader) ?? EMPTY_GUIDE_SESSION_IDS).has(element.sessionId);
			template.container.classList.toggle('session-hierarchy-guides-visible', showGuides);
		}));

		// Sticky styling — reactive on the wrapper's sticky observable
		template.elementDisposables.add(autorun(reader => {
			const wrapper = this.options.visibleSessions.read(reader).find(s => s?.sessionId === element.sessionId);
			const isSticky = wrapper ? wrapper.sticky.read(reader) : false;
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
				collapsed,
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
			const gitHubInfo = element.workspace.read(reader)?.folders[0]?.gitRepository?.gitHubInfo.read(reader);
			let completedStateIcon = element.completedStateIcon?.read(reader)
				?? getHighestPriorityPullRequestIcon(getGitHubPullRequestRefs(gitHubInfo).map(pullRequest => pullRequest.icon));
			if (completedStateIcon && isAgentMergePullRequestIcon(completedStateIcon)) {
				agentMergeConfiguration ??= getSessionAgentMergeConfigurationObservable(element, this.sessionsProvidersService, this.configurationService);
				completedStateIcon = getAgentMergeAwarePullRequestIcon(completedStateIcon, agentMergeConfiguration.read(reader));
			}

			// The status icon widget snaps on row recycling and cross-fades real state changes.
			template.statusIcon.setStatus(sessionStatus, isRead, isArchived, completedStateIcon, element.resource);
			template.container.classList.toggle('in-progress', sessionStatus === SessionStatus.InProgress);
			template.container.classList.toggle('needs-input', sessionStatus === SessionStatus.NeedsInput);
			template.container.classList.toggle('unread', !isRead && !isArchived);
			template.container.classList.toggle('quick-chat', isQuickChat && this.options.useCompactQuickChatRows);
			let showComparisonAttemptStatus = comparisonAttemptLabel !== undefined && (this.options.shouldShowComparisonAttemptStatus?.(element, reader) ?? true);
			template.comparisonAttemptStatusIcon.className = 'session-comparison-attempt-status-icon';
			switch (sessionStatus) {
				case SessionStatus.InProgress:
					template.comparisonAttemptStatusIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.loading), 'codicon-modifier-spin');
					template.comparisonAttemptStatusLabel.textContent = '';
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
				this.options.externalApplicationBadgeShowFrom?.read(reader) ?? true,
			);
			template.externalApplicationBadgeLabel.textContent = badgeLabel;
			if (showInTitle) {
				reader.store.add(this.hoverService.setupDelayedHover(template.externalApplicationBadge, { content: badgeLabel }, { groupId: 'sessions-list' }));
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

			// Compact quick chats have no details row.
			if (comparisonAttemptLabel !== undefined || (isQuickChat && this.options.useCompactQuickChatRows)) {
				descriptionDisposable.clear();
				timeDisposable.clear();
				return;
			}

			const workspaceBadgeLabel = getSessionRowLocationLabel(element, workspace, reader, this.options);
			if (this.options.compact()) {
				descriptionDisposable.clear();
				timeDisposable.clear();

				if (workspaceBadgeLabel) {
					DOM.append(template.compactHoverDescription, $('span.session-badge', undefined, workspaceBadgeLabel));
				}
				return;
			}

			const showsMainChatDiffStats = this.options.deriveStatusFromMainChat && (workspace?.folders.length ?? 0) > 1;
			rowObservesMainChatBranchChanges = !!showsMainChatDiffStats && isOpenChat(element, element.mainChat.read(reader), this.options.activeSession, reader);
			const diffStats = showsMainChatDiffStats
				? getSessionListChatDiffStats(element, element.mainChat.read(reader), this.options.activeSession, reader)
				: getSessionDiffStats(element, reader);
			// When the session is InProgress or NeedsInput, hide workspace/diff details in this row
			const hideDetails = !this.options.showMetadataWhileActive?.(element) && (sessionStatus === SessionStatus.InProgress || sessionStatus === SessionStatus.NeedsInput);
			const mainChat = element.mainChat.read(reader);
			const timeDate = this.options.showMetadataWhileActive?.(element) ? element.updatedAt.read(reader) : mainChat.status.read(reader) === SessionStatus.InProgress ? undefined : mainChat.updatedAt.read(reader);

			const parts: HTMLElement[] = [];
			if (
				eligible &&
				this.options.externalApplicationBadgeMode?.read(reader) === ExternalSessionApplicationBadgeMode.Details
			) {
				const badgeEl = DOM.append(template.detailsRow, $('span.session-external-application-badge.session-external-application-badge-details'));
				const badgeLabel = getExternalApplicationBadgeLabel(
					element.application.read(reader).label,
					this.options.externalApplicationBadgeShowFrom?.read(reader) ?? true,
				);
				DOM.append(badgeEl, $('span.session-external-application-badge-label', undefined, badgeLabel));
				reader.store.add(this.hoverService.setupDelayedHover(badgeEl, { content: badgeLabel }, { groupId: 'sessions-list' }));
				parts.push(badgeEl);
			}

			const statusMessage = getSessionStatusMessage(sessionStatus, description)
				?? (sessionStatus === SessionStatus.Completed ? this.options.getCompletedStatusMessage?.(element, reader) : undefined);
			if (sessionStatus !== SessionStatus.InProgress || !hideDetails) {
				if (parts.length > 0) {
					DOM.append(template.detailsRow, $('span.session-separator.has-separator'));
				}
				let icon: ThemeIcon;
				if (isQuickChat) {
					icon = Codicon.commentDiscussion;
				} else {
					const kind = getSessionWorkspaceKind(workspace, element.worktreePending?.read(reader));
					icon = workspace?.typeIcon ?? (kind === SessionWorkspaceKind.Virtual ? Codicon.cloudCompact : kind === SessionWorkspaceKind.Folder ? Codicon.folderCompact : Codicon.worktreeCompact);
				}
				const typeIconEl = DOM.append(template.detailsRow, $('span.session-details-icon'));
				DOM.append(typeIconEl, $(`span${ThemeIcon.asCSSSelector(icon)}`));
				parts.push(typeIconEl);
			}

			if (!hideDetails) {
				const badgeLabel = isQuickChat
					? localize('quickChatBadge', "No workspace")
					: workspaceBadgeLabel;
				if (badgeLabel) {
					const badgeEl = DOM.append(template.detailsRow, $('span.session-badge'));
					badgeEl.textContent = badgeLabel;
					parts.push(badgeEl);
				}
			}

			// Diff stats
			if (!isQuickChat && !hideDetails && diffStats) {
				if (parts.length > 0) {
					DOM.append(template.detailsRow, $('span.session-separator.has-separator'));
				}
				const diffEl = DOM.append(template.detailsRow, $('span.session-diff'));
				DOM.append(diffEl, $('span.session-diff-added')).textContent = `+${diffStats.insertions}`;
				DOM.append(diffEl, $('span.session-diff-removed')).textContent = `-${diffStats.deletions}`;
				parts.push(diffEl);
			}

			if (statusMessage !== undefined) {
				if (parts.length > 0) {
					DOM.append(template.detailsRow, $('span.session-separator.has-separator'));
				}
				const statusEl = DOM.append(template.detailsRow, $('span.session-description'));
				if (typeof statusMessage === 'string') {
					descriptionDisposable.clear();
					statusEl.textContent = statusMessage;
				} else {
					descriptionDisposable.value = this.markdownRendererService.render(statusMessage, { sanitizerConfig: { replaceWithPlaintext: true } }, statusEl);
				}
				parts.push(statusEl);
			} else {
				descriptionDisposable.clear();
			}

			if (timeDate) {
				if (parts.length > 0) {
					DOM.append(template.detailsRow, $('span.session-separator.has-separator'));
				}
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
						position: { hoverPosition: HoverPosition.BELOW },
					}));
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
		const initialInfo = getSessionRowApproval(approvalModel, element, undefined, aggregate);
		let lastApprovalHeight = approvalRowHeightFor(initialInfo, this.options.approvalRowMaxLines);
		template.approvalRow.classList.toggle('visible', lastApprovalHeight > 0);

		const buttonStore = template.elementDisposables.add(new DisposableStore());

		template.elementDisposables.add(autorun(reader => {
			buttonStore.clear();

			const info = getSessionRowApproval(approvalModel, element, reader, aggregate);
			const visible = !!info;

			template.approvalRow.classList.toggle('visible', visible);

			if (info) {
				renderApprovalRowContent(info, {
					label: template.approvalLabel,
					buttonContainer: template.approvalButtonContainer,
				}, buttonStore, this.markdownRendererService, this.hoverService, this.options.showHover, this.options.approvalRowMaxLines, approvalId => {
					this._onDidApproveSession.fire({ session: element, approvalId });
				});
			}

			// Fire on any height change while onscreen, not just visibility — the
			// model can swap one pending approval for another whose label spans a
			// different number of lines, changing the reserved row height.
			const height = approvalRowHeightFor(info, this.options.approvalRowMaxLines);
			if (height !== lastApprovalHeight) {
				lastApprovalHeight = height;
				this._onDidChangeItemHeight.fire(element);
			}
		}));
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

	disposeElement(node: ITreeNode<SessionListItem, FuzzyScore | LabelFuzzyScore>, _index: number, template: ISessionItemTemplate): void {
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
	const repository = getGitHubRemoteFileRepository(workspace.folders[0]?.root);
	return repository ? `${repository.owner}/${repository.name}` : workspace.label;
}

/** The repository of a `github-remote-file` URI, such as a cloud session's workspace folder. */
function getGitHubRemoteFileRepository(uri: URI | undefined): ISessionRepository | undefined {
	if (uri?.scheme !== GITHUB_REMOTE_FILE_SCHEME) {
		return undefined;
	}
	const [owner, name] = uri.path.split('/').filter(Boolean);
	return owner && name ? { owner, name } : undefined;
}

interface ISessionRowLocationOptions {
	readonly grouping: () => SessionsGrouping;
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
function getSessionRowLocationLabel(session: ISession, workspace: ISessionWorkspace | undefined, reader: IReader, options: ISessionRowLocationOptions): string | undefined {
	if (!workspace) {
		return undefined;
	}
	const grouping = options.grouping();
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

function logDefaultSettingExperimentTrigger(configurationService: IConfigurationService, telemetryService: ITelemetryService, settingId: string): void {
	const inspected = configurationService.inspect(settingId);
	if (!isConfigured(inspected) && inspected.memoryValue === undefined && inspected.policyValue === undefined) {
		logSettingExperimentTrigger(telemetryService, settingId);
	}
}

//#endregion

//#region Section Header Renderer

interface ISessionHeaderTemplate {
	readonly icon: HTMLElement;
	readonly collapsed: ISettableObservable<boolean>;
	readonly toolbarContainer: HTMLElement;
	readonly toolbar: MenuWorkbenchToolBar;
	readonly elementDisposables: DisposableStore;
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
interface ISessionHeaderStatusTrigger {
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
	readonly count: HTMLElement;
	readonly countLabel: HTMLElement;
	readonly keybindingHint: HTMLElement;
	readonly keybindingLabel: KeybindingLabel;
	readonly chevron: HTMLElement;
	readonly contextKeyService: IContextKeyService;
	readonly disposables: DisposableStore;
}

export class SessionSectionRenderer implements ITreeRenderer<SessionListItem, FuzzyScore, ISessionSectionTemplate> {
	static readonly TEMPLATE_ID = 'session-section';

	/** Keyed by template because sticky scroll renders a second copy of a header while its tree row stays rendered. */
	private readonly renderedSections = new Map<ISessionSectionTemplate, ISessionSection>();
	// TODO@BenV: Move automation-specific code into an AutomationSectionRenderer subclass.
	readonly automationStatus = derived(this, reader => {
		const runs = this.automationService.runs.read(reader);
		const automationSessions = this.automationSessions.read(reader);

		// NeedsInput takes priority: any running automation whose session is waiting for input.
		const hasNeedsInput = runs.some(run => {
			if (run.status !== 'running' || !run.sessionResource) {
				return false;
			}
			const session = automationSessions.find(candidate => this.uriIdentityService.extUri.isEqual(candidate.resource, run.sessionResource));
			return !!session && session.status.read(reader) === SessionStatus.NeedsInput;
		});
		if (hasNeedsInput) {
			return SessionStatus.NeedsInput;
		}

		if (runs.some(run => run.status === 'pending' || run.status === 'running')) {
			return SessionStatus.InProgress;
		}
		const hasUnreadRun = runs.some(run => {
			if ((run.status !== 'completed' && run.status !== 'failed') || !run.sessionResource) {
				return false;
			}
			const sessionResource = run.sessionResource;
			const session = automationSessions.find(candidate => this.uriIdentityService.extUri.isEqual(candidate.resource, sessionResource));
			return !!session && !session.isRead.read(reader) && !session.isArchived.read(reader);
		});
		if (hasUnreadRun) {
			return SessionStatus.Completed;
		}
		return undefined;
	});
	private readonly customizationsIcon = derived(this, reader => this.customizationMigrationsAvailable.read(reader)
		? { ...Codicon.circleFilled, color: themeColorFromId('activityWarningBadge.background') }
		: this.customizationExtensionSuggestionsAvailable.read(reader)
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
		/** Whether installed extensions can be enabled in the Agents window, signaled on the Customizations entry. */
		private readonly customizationExtensionSuggestionsAvailable: IObservable<boolean> = constObservable(false),
		private readonly getGroupDepth: (section: ISessionSection) => number = () => 0,
		private readonly getAppearance: (sectionId: string) => ISessionGroupAppearance | undefined = () => undefined,
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

		return { container, icon, collapsed: observableValue(this, false), label, count, countLabel, keybindingHint, keybindingLabel, toolbarContainer, toolbar, chevron, contextKeyService, elementDisposables, disposables };
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
		setSessionGroupDepth(template.container, this.getGroupDepth(element));
		template.container.classList.remove(SESSION_HEADER_DROP_TARGET_CLASS);
		template.container.classList.remove('session-section-shortcut');
		template.container.classList.remove('session-section-new-session');
		template.container.classList.remove('session-section-customizations');
		template.container.classList.remove('active');
		template.container.closest('.monaco-list-row')?.removeAttribute('aria-current');
		template.keybindingHint.classList.remove('visible');
		template.keybindingLabel.set(undefined);
		const shortcut = isShortcutSection(element.id);
		template.toolbarContainer.style.display = shortcut ? 'none' : '';
		if (shortcut) {
			template.container.classList.add('session-section-shortcut');
			template.toolbar.context = undefined;
		} else {
			renderSessionHeaderToolbar(template, element, this.select);
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
			template.elementDisposables.add(this.hoverService.setupDelayedHover(
				template.container,
				() => withSessionsListHoverPresentation({
					content: this.customizationMigrationsAvailable.get()
						? localize('customizationsMigrationHover', "Some customizations need an update to keep working.")
						: this.customizationExtensionSuggestionsAvailable.get()
							? getExtensionSuggestionsBadgeDescription()
							: element.label,
				}),
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
		} else {
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
		if (this.hideSectionCount || shortcut) {
			template.countLabel.textContent = '';
			template.count.style.display = 'none';
		} else {
			template.countLabel.textContent = String(element.sessions.length);
			template.count.style.display = '';
		}

		// Set context key for section type so toolbar actions can use when clauses
		const sectionType = element.id.startsWith('workspace:') ? 'workspace' : element.id.startsWith(REPOSITORY_SECTION_PREFIX) ? 'repository' : element.id.startsWith(ENVIRONMENT_SECTION_PREFIX) ? 'environment' : element.id;
		SessionSectionTypeContext.bindTo(template.contextKeyService).set(sectionType);
		const hasGitHubRepository = SessionSectionHasGitHubRepositoryContext.bindTo(template.contextKeyService);
		const hasNonCloudRepository = SessionSectionHasNonCloudRepositoryContext.bindTo(template.contextKeyService);
		template.elementDisposables.add(autorun(reader => {
			let hasGitHub = false;
			let hasNonCloudWorkspace = false;
			for (const session of element.sessions) {
				for (const folder of session.workspace.read(reader)?.folders ?? []) {
					if (folder.gitRepository?.gitHubInfo.read(reader) !== undefined) {
						hasGitHub = true;
					}
					hasNonCloudWorkspace ||= folder.root.scheme !== GITHUB_REMOTE_FILE_SCHEME;
				}
			}
			hasGitHubRepository.set(hasGitHub);
			hasNonCloudRepository.set(hasNonCloudWorkspace);
		}));
	}

	/** Updates the leading icon and chevron when the tree toggles a section without re-rendering it. */
	updateCollapseState(element: ISessionSection, collapsed: boolean): void {
		for (const [template, renderedElement] of this.renderedSections) {
			if (renderedElement === element) {
				this.updateChevron(template, true, collapsed);
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

class SessionShortcutListDelegate implements IListVirtualDelegate<ISessionSection> {
	getHeight(): number {
		return SESSION_SHORTCUT_ROW_HEIGHT;
	}

	getTemplateId(): string {
		return SESSION_SHORTCUT_SECTION_TEMPLATE_ID;
	}
}

class SessionShortcutListRenderer implements IListRenderer<ISessionSection, ISessionSectionTemplate> {
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

class SessionGroupRenderer implements ITreeRenderer<SessionListItem, FuzzyScore, ISessionGroupTemplate> {
	static readonly TEMPLATE_ID = 'session-group';
	readonly templateId = SessionGroupRenderer.TEMPLATE_ID;
	readonly rowClassName = 'session-list-section-row';

	/** Keyed by template because sticky scroll renders a second copy of a header while its tree row stays rendered. */
	private readonly renderedGroups = new Map<ISessionGroupTemplate, ISessionGroupItem>();

	constructor(
		private readonly delegate: ISessionGroupRendererDelegate,
		private readonly showUnreadInCollapsedSections: IObservable<boolean>,
		private readonly sessionsWithFailingCI: IObservable<ReadonlySet<string>>,
		private readonly headerStatusTrigger: ISessionHeaderStatusTrigger,
		private readonly instantiationService: IInstantiationService,
		private readonly contextKeyService: IContextKeyService,
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
		}));

		return { container, icon, collapsed: observableValue(this, false), labelContainer, label, description, inputContainer, toolbarContainer, toolbar, chevron, contextKeyService, disposables, elementDisposables: disposables.add(new DisposableStore()) };
	}

	renderElement(node: ITreeNode<SessionListItem, FuzzyScore>, _index: number, template: ISessionGroupTemplate): void {
		const element = node.element;
		if (!isSessionGroupItem(element)) {
			return;
		}
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
			template.inputContainer.style.display = 'none';
			template.labelContainer.style.display = '';
		}
	}

	private renderInput(element: ISessionGroupItem, template: ISessionGroupTemplate): void {
		template.labelContainer.style.display = 'none';
		template.inputContainer.style.display = '';
		DOM.clearNode(template.inputContainer);

		const input = template.elementDisposables.add(new InputBox(template.inputContainer, undefined, {
			inputBoxStyles: defaultInputBoxStyles,
			ariaLabel: localize('sessionGroupName', "Group name"),
		}));
		input.value = element.group.name;
		input.focus();
		input.select();

		let done = false;
		const commit = () => {
			if (done) {
				return;
			}
			done = true;
			this.delegate.commitEdit(element.group, input.value.trim());
		};
		const cancel = () => {
			if (done) {
				return;
			}
			done = true;
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

class SessionShowMoreRenderer implements ITreeRenderer<SessionListItem, FuzzyScore, HTMLElement> {
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

class SessionPlaceholderRenderer implements ITreeRenderer<SessionListItem, FuzzyScore, ISessionPlaceholderTemplate> {
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
	readonly grouping: () => SessionsGrouping;
	readonly isPinned: (session: ISession) => boolean;
	readonly widgetAriaLabel?: string;
	readonly isRenderedInCustomGroup?: (session: ISession) => boolean;
	readonly getComparisonAttemptLabel?: (session: ISession) => string | undefined;
	readonly isRenderedInExternalSection?: (session: ISession) => boolean;
	readonly getEnvironmentBadgeLabel?: (session: ISession) => string | undefined;
	readonly includeQuickChatInAriaLabel?: boolean;
	readonly customizationsCount?: IObservable<number>;
	readonly customizationMigrationsAvailable?: IObservable<boolean>;
	readonly customizationExtensionSuggestionsAvailable?: IObservable<boolean>;
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
}

class SessionsAccessibilityProvider {
	constructor(
		private readonly automationStatus?: IObservable<SessionStatus | undefined>,
		private readonly options?: ISessionsAccessibilityProviderOptions,
	) { }

	getWidgetAriaLabel(): string {
		return this.options?.widgetAriaLabel ?? localize('sessionsList', "Sessions");
	}

	getAriaLabel(element: SessionListItem): string | IObservable<string> | null {
		if (isSessionChatItem(element)) {
			return derived(this, reader => {
				const title = getChatTitle(element.chat, reader);
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
				const isArchived = element.chat.isArchived.read(reader);
				const readLabel = !isArchived && !element.chat.isRead.read(reader)
					? localize('sessionChatItemUnreadAria', "{0}, unread", label)
					: label;
				const stateLabel = isArchived
					? localize('sessionChatItemArchivedAria', "{0}, archived", label)
					: readLabel;
				return element.standalone
					? localize('sessionChatItemStandaloneAria', "{0}, in session {1}", stateLabel, element.session.title.read(reader))
					: stateLabel;
			});
		}
		if (isSessionGroupItem(element)) {
			return element.comparison
				? derived(this, reader => localize('comparisonGroupAria', "{0}, {1}", element.comparison!.title, element.comparison!.summary(reader)))
				: this.getSectionAriaLabel(element.group.name, element.subtreeSessions);
		}
		if (isSessionSection(element)) {
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
					return this.options?.customizationMigrationsAvailable?.read(reader)
						? localize('customizationsMigrationAvailableAria', "{0}, {1}, customization migrations available", element.label, countLabel)
						: this.options?.customizationExtensionSuggestionsAvailable?.read(reader)
							? localize('customizationsExtensionSuggestionsAria', "{0}, {1}, {2}", element.label, countLabel, getExtensionSuggestionsBadgeDescription())
							: localize('customizationsAria', "{0}, {1}", element.label, countLabel);
				});
			}
			if (isShortcutSection(element.id)) {
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
			const updatedAt = showMetadataWhileActive ? element.updatedAt.read(reader) : mainChat.status.read(reader) === SessionStatus.InProgress ? undefined : mainChat.updatedAt.read(reader);
			let label: string;
			if (this.options?.includeQuickChatInAriaLabel && element.isQuickChat?.read(reader)) {
				label = updatedAt ? localize('sessionItemQuickChatAria', "{0}, chat, updated {1}", title, fromNow(updatedAt, true)) : localize('sessionItemQuickChatWithoutTimeAria', "{0}, chat", title);
			} else if (element.worktreePending?.read(reader)) {
				label = updatedAt ? localize('sessionItemWorktreePendingAria', "{0}, creating worktree, updated {1}", title, fromNow(updatedAt, true)) : localize('sessionItemWorktreePendingWithoutTimeAria', "{0}, creating worktree", title);
			} else {
				label = updatedAt ? localize('sessionItemAria', "{0}, updated {1}", title, fromNow(updatedAt, true)) : title;
			}
			const collapsed = this.options?.collapsedSessionIds?.read(reader).has(element.sessionId) ?? true;
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
			const eligible = isExternalApplicationBadgeEligible(element, reader);
			if (eligible) {
				this.options?.reportExternalApplicationBadgeModeExperimentTrigger?.();
			}
			const badgeMode = this.options?.externalApplicationBadgeMode?.read(reader) ?? ExternalSessionApplicationBadgeMode.Off;
			if (eligible && badgeMode !== ExternalSessionApplicationBadgeMode.Off) {
				this.options?.reportExternalApplicationBadgeShowFromExperimentTrigger?.();
				label = localize('sessionItemExternalAria', "{0}, created in {1}", label, element.application.read(reader).label);
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
			const workspace = element.workspace.read(reader);
			const locationLabel = this.options ? getSessionRowLocationLabel(element, workspace, reader, this.options) : undefined;
			if (
				(showMetadataWhileActive || (status !== SessionStatus.InProgress && status !== SessionStatus.NeedsInput)) &&
				locationLabel
			) {
				label = localize('sessionItemWorkspaceAria', "{0}, in {1}", label, locationLabel);
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

//#region Drag and Drop

/**
 * Where dropped sessions end up. Each placement is a rung of the list's
 * placement precedence (archived > pinned > custom group > ungrouped section),
 * so moving sessions into one only changes the state that precedence reads.
 */
type SessionListPlacement =
	| { readonly kind: 'archived' }
	| { readonly kind: 'pinned' }
	| { readonly kind: 'group'; readonly groupId: string }
	/** The section a session renders in when it is neither archived, pinned, nor grouped. */
	| { readonly kind: 'section'; readonly sectionId: string };

/** The list-owned state a session needs to render in a placement. */
interface ISessionPlacementState {
	readonly archived: boolean;
	/** The pin state, or `undefined` to leave it unchanged. */
	readonly pinned?: boolean;
	/** The custom group, `null` for none, or `undefined` to leave membership unchanged. */
	readonly groupId?: string | null;
}

function getPlacementState(placement: SessionListPlacement): ISessionPlacementState {
	switch (placement.kind) {
		case 'archived':
			return { archived: true };
		case 'pinned':
			return { archived: false, pinned: true };
		case 'group':
			return { archived: false, pinned: false, groupId: placement.groupId };
		case 'section':
			return { archived: false, pinned: false, groupId: null };
	}
}

/** The placement of the sessions rendered under a section or group id, or `undefined` when it does not accept sessions. */
function getSectionPlacement(sectionId: string): SessionListPlacement | undefined {
	if (sectionId === 'pinned') {
		return { kind: 'pinned' };
	}
	if (sectionId === 'archived') {
		return { kind: 'archived' };
	}
	const groupId = getSessionGroupIdOfSection(sectionId);
	if (groupId !== undefined) {
		return { kind: 'group', groupId };
	}
	return isShortcutSection(sectionId) ? undefined : { kind: 'section', sectionId };
}

function isSamePlacement(a: SessionListPlacement, b: SessionListPlacement): boolean {
	const header = getPlacementHeader(a);
	const other = getPlacementHeader(b);
	return header.kind === other.kind && header.id === other.id;
}

function getPlacementHeader(placement: SessionListPlacement): ISessionDropTargetHeader {
	switch (placement.kind) {
		case 'archived':
			return { kind: 'section', id: 'archived' };
		case 'pinned':
			return { kind: 'section', id: 'pinned' };
		case 'group':
			return { kind: 'group', id: placement.groupId };
		case 'section':
			return { kind: 'section', id: placement.sectionId };
	}
}

/** A session row that dropped sessions are positioned against. */
interface ISessionDropAnchor {
	readonly session: ISession;
	readonly position: 'before' | 'after';
	/**
	 * The anchor's section is derived from the sort key (date sections), so the
	 * sessions must stay next to the anchor rather than drift past a neighbour
	 * in another section.
	 */
	readonly staysInSection: boolean;
}

/** Row feedback shown while hovering a drop target. */
interface ISessionDropFeedback {
	readonly position: ListDragOverEffectPosition;
	/** The list index that shows the feedback, when it differs from the hovered row. */
	readonly index?: number;
}

/** Where sessions dropped on a list target go. */
interface ISessionDropDestination {
	readonly placement: SessionListPlacement;
	/** The row to position the sessions against; `undefined` keeps their natural sort position. */
	readonly anchor?: ISessionDropAnchor;
	/** Whether the drop may restore archived sessions. */
	readonly restoresArchived: boolean;
	/** Row feedback; `undefined` relies on the destination header highlight alone. */
	readonly feedback?: ISessionDropFeedback;
}

/** What a valid session drop changes: the placement of at least one session, or only the manual order. */
type SessionDropEffect = 'move' | 'reorder';

/**
 * Callbacks the sessions list provides to its drag-and-drop controller. The
 * controller decides where a drop goes; the list decides whether its sessions
 * may go there and applies the change.
 */
interface ISessionsListDndDelegate {
	/** The placement of the section or group a rendered session row belongs to. */
	getRowPlacement(session: ISession): SessionListPlacement | undefined;
	/** The visible nested chat rows of a rendered session, in display order. */
	getVisibleChatRows(session: ISession): readonly ISessionChatItem[];
	/** The rendered date sections in display order, or `undefined` when not grouping by date. */
	getDateSections(): readonly ISessionSection[] | undefined;
	/** What moving the sessions to the destination changes, or `undefined` when the move is not allowed. */
	getSessionDropEffect(sessions: readonly ISession[], destination: ISessionDropDestination): SessionDropEffect | undefined;
	/** Move the sessions to the destination. */
	moveSessions(sessions: readonly ISession[], destination: ISessionDropDestination): void;
	/** Whether a group, or workspace or repository header can be dragged to move it. */
	isHeaderReorderable(element: ISessionGroupItem | ISessionSection): boolean;
	/** Highlight only the header that will receive the dragged sessions. */
	setDropTargetHeader(header: ISessionDropTargetHeader | undefined): void;
	/** Where a dragged header lands when dropped on the target in the given quarter of its row, or `undefined` when it can't land there. */
	getHeaderDrop(header: IDraggedHeader, target: SessionListItem, sector: ListViewTargetSector | undefined): SessionHeaderDrop | undefined;
	/** Move a dragged header to where it lands. */
	moveHeader(header: IDraggedHeader, drop: SessionHeaderDrop): void;
	/** Steps the insertion line of a header drop in to the depth where the header lands, or resets it. */
	setHeaderInsertionDepth(depth: number | undefined): void;
	/** The dragged chat row's chat, with its session, when moving chats by drag and drop is on and it can move. */
	getMovableDraggedChat(item: ISessionChatItem): { readonly session: ISession; readonly chat: IChat } | undefined;
	/** Whether the session can move under another session, when moving chats by drag and drop is on. */
	canMoveSessionUnder(session: ISession): boolean;
	/** Move the chat of `session` as the drop says. */
	moveChat(session: ISession, chat: IChat, drop: SessionsListChatDrop): void;
	/** Move `session` under `target`, after its chat `after` (`undefined`: first). */
	moveSessionUnder(session: ISession, target: ISession, after: IChat | undefined): void;
	/** Whether the session is in a section the user orders by hand: Pinned or a custom group. */
	isInManuallyOrderedSection(session: ISession): boolean;
	/**
	 * Whether the row is the last one its section shows (under a find filter, the last one that matches): its last
	 * session's row, or that session's last chat row.
	 */
	isLastRowOfSection(element: ISession | ISessionChatItem): boolean;
	/**
	 * Shows the drop feedback for moving a chat or session rather than the list's other drags: `'move'` for a drop into
	 * a session, a new session, or a placement between sessions; `'nested'` for an insertion line among a session's
	 * nested rows, drawn at their indent; `'none'` for the list's other drags.
	 */
	setMoveDropFeedback(kind: 'none' | 'move' | 'nested'): void;
}

interface ISessionDropTargetHeader {
	readonly kind: 'group' | 'section';
	readonly id: string;
}

/** A group, or workspace or repository header being dragged to move it. */
interface IDraggedHeader {
	/** The header's section id, under which the section order stores its position. */
	readonly id: string;
	/** The dragged group, or `undefined` for a workspace or repository header. */
	readonly group?: ISessionGroupItem;
}

/**
 * Where a dragged header lands: next to a top-level header, which the list
 * orders; next to a subgroup of `parentId`, `depth` groups deep, which the
 * groups service orders; or inside a group as its first subgroup.
 */
type SessionHeaderDrop =
	| { readonly kind: 'topLevel'; readonly targetId: string; readonly position: 'before' | 'after' }
	| { readonly kind: 'subgroup'; readonly parentId: string; readonly depth: number; readonly placement: ISessionGroupPlacement }
	| { readonly kind: 'into'; readonly groupId: string };

/** A resolved drop: its hover feedback and what dropping does. */
interface ISessionsListDropOperation {
	readonly reaction: ITreeDragOverReaction;
	/** The header highlighted as the destination of the drop. */
	readonly header?: ISessionDropTargetHeader;
	/** The feedback for moving a chat or session through its provider; `'none'` (default) for the list's own drops. */
	readonly moveFeedback?: 'move' | 'nested';
	/** How many groups deep a header lands next to its siblings, which its insertion line steps in by. */
	readonly insertionDepth?: number;
	run(): void;
}

class SessionsListDragAndDrop extends Disposable implements ITreeDragAndDrop<SessionListItem> {

	private readonly _transfer = LocalSelectionTransfer.getInstance<DraggedSessionIdentifier>();
	/** The chat row this list is dragging and what it moves, resolved once when the drag starts. */
	private _draggedChat: { readonly item: ISessionChatItem; readonly movable: { readonly session: ISession; readonly chat: IChat } | undefined } | undefined;

	constructor(private readonly delegate: ISessionsListDndDelegate) {
		super();
	}

	getDragURI(element: SessionListItem): string | null {
		if (isSessionGroupItem(element)) {
			return this.delegate.isHeaderReorderable(element) ? `sessionGroup:${element.group.id}` : null;
		}
		if (isSessionSection(element)) {
			// Only grouping sections are reorderable; Pinned, Done
			// and the date sections stay fixed and are therefore not draggable.
			return isSessionGroupingSection(element.id) && this.delegate.isHeaderReorderable(element) ? `sessionWorkspace:${element.id}` : null;
		}
		if (isSessionShowMore(element)) {
			return null;
		}
		if (isSessionPlaceholder(element)) {
			return null;
		}
		if (isSessionChatItem(element)) {
			return element.standalone ? null : element.chat.resource.toString();
		}
		return element.resource.toString();
	}

	getDragLabel(elements: SessionListItem[]): string | undefined {
		const chatItem = elements.find(isSessionChatItem);
		if (chatItem) {
			return getChatTitle(chatItem.chat);
		}
		const groupItem = elements.find(isSessionGroupItem);
		if (groupItem) {
			return groupItem.group.name;
		}
		const workspaceSection = elements.find((e): e is ISessionSection => isSessionSection(e) && isSessionGroupingSection(e.id));
		if (workspaceSection) {
			return workspaceSection.label;
		}
		const sessions = elements.filter(isSessionItem);
		if (sessions.length === 0) {
			return undefined;
		}
		if (sessions.length === 1) {
			return sessions[0].title.get();
		}
		return localize('sessions.dragLabel', "{0} sessions", sessions.length);
	}

	onDragStart(data: IDragAndDropData, originalEvent: DragEvent): void {
		const elements = this.draggedElements(data);
		const chatItem = elements.find(isSessionChatItem);
		if (chatItem) {
			fillSessionChatDragData(originalEvent, chatItem.session.sessionId, chatItem.chat.resource);
			this._draggedChat = { item: chatItem, movable: this.delegate.getMovableDraggedChat(chatItem) };
			return;
		}
		const sessions = elements.filter(isSessionItem);
		if (sessions.length === 0) {
			return;
		}

		const identifiers = sessions.map(s => new DraggedSessionIdentifier(s.sessionId, s.resource));
		this._transfer.setData(identifiers, DraggedSessionIdentifier.prototype);

		if (originalEvent.dataTransfer) {
			// Expose the first dragged session as a typed payload as well so external
			// drop handlers can read it without using the local transfer.
			const payload = JSON.stringify({ sessionId: sessions[0].sessionId, resource: sessions[0].resource.toString() });
			originalEvent.dataTransfer.setData(SessionsDataTransfers.SESSION, payload);
		}
	}

	onDragEnd(): void {
		this._transfer.clearData(DraggedSessionIdentifier.prototype);
		this._draggedChat = undefined;
		this.delegate.setDropTargetHeader(undefined);
		this.delegate.setMoveDropFeedback('none');
		this.delegate.setHeaderInsertionDepth(undefined);
	}

	onDragOver(data: IDragAndDropData, targetElement: SessionListItem | undefined, targetIndex: number | undefined, listTargetSector: ListViewTargetSector | undefined, originalEvent?: DragEvent): boolean | ITreeDragOverReaction {
		const operation = this.resolveDrop(data, targetElement, targetIndex, getRowSector(originalEvent, listTargetSector));
		this.delegate.setDropTargetHeader(operation?.header);
		this.delegate.setMoveDropFeedback(operation?.moveFeedback ?? 'none');
		this.delegate.setHeaderInsertionDepth(operation?.insertionDepth);
		return operation?.reaction ?? false;
	}

	drop(data: IDragAndDropData, targetElement: SessionListItem | undefined, targetIndex: number | undefined, listTargetSector: ListViewTargetSector | undefined, originalEvent?: DragEvent): void {
		this.delegate.setDropTargetHeader(undefined);
		this.delegate.setMoveDropFeedback('none');
		this.delegate.setHeaderInsertionDepth(undefined);
		this.resolveDrop(data, targetElement, targetIndex, getRowSector(originalEvent, listTargetSector))?.run();
	}

	/**
	 * Resolve dropping the current drag on a target, the same way on drag over and on drop. Each kind of dragged item
	 * has its own resolver; moves through the sessions provider take precedence over the list's own placement.
	 */
	private resolveDrop(data: IDragAndDropData, target: SessionListItem | undefined, targetIndex: number | undefined, sector: ListViewTargetSector | undefined): ISessionsListDropOperation | undefined {
		// The Done section's rows for done chats of sessions that are not done are not drop targets.
		if (target && isSessionChatItem(target) && target.standalone) {
			return undefined;
		}
		const elements = this.draggedElements(data);
		const header = this.draggedHeader(elements);
		if (header) {
			return this.resolveHeaderDrop(header, target, sector);
		}
		if (elements.length > 0 && elements.every(isSessionChatItem)) {
			// Only the provider orders nested chats: a chat it can't move, or several chats, can't be dropped.
			const movable = elements.length === 1 ? this.movableChat(elements[0]) : undefined;
			return movable ? this.resolveChatMove(movable, target, sector) : undefined;
		}
		const sessions = elements.filter(isSessionItem);
		if (sessions.length === 0) {
			return undefined;
		}
		const nest = this.resolveSessionNest(sessions, target, sector);
		if (nest?.kind === 'nest') {
			const session = sessions[0];
			return {
				reaction: nest.position === 'over' ? intoSessionDropReaction() : toDropReaction({ position: toEffectPosition(nest.position) }),
				moveFeedback: nest.position === 'over' ? 'move' : 'nested',
				run: () => this.delegate.moveSessionUnder(session, nest.session, nest.after),
			};
		}
		if (nest?.kind === 'place') {
			const operation = this.resolveSessionDrop(sessions, nest.session, undefined, nest.position === 'before' ? ListViewTargetSector.TOP : ListViewTargetSector.BOTTOM);
			return operation && { ...operation, moveFeedback: 'move' };
		}
		return this.resolveSessionDrop(sessions, target, targetIndex, sector);
	}

	/**
	 * A header lands next to another header, shown by an insertion line, or inside
	 * a group, shown by highlighting the group's header (and its row, when it is
	 * the hovered row).
	 */
	private resolveHeaderDrop(header: IDraggedHeader, target: SessionListItem | undefined, sector: ListViewTargetSector | undefined): ISessionsListDropOperation | undefined {
		const drop = target && this.delegate.getHeaderDrop(header, target, sector);
		if (!drop) {
			return undefined;
		}
		const run = () => this.delegate.moveHeader(header, drop);
		if (drop.kind === 'topLevel') {
			return { reaction: toDropReaction({ position: toEffectPosition(drop.position) }), insertionDepth: 0, run };
		}
		if (drop.kind === 'subgroup') {
			return { reaction: toDropReaction({ position: toEffectPosition(drop.placement.position) }), insertionDepth: drop.depth, run };
		}
		const isHeaderRow = !!target && isSessionGroupItem(target) && target.group.id === drop.groupId;
		return {
			reaction: toDropReaction(isHeaderRow ? { position: ListDragOverEffectPosition.Over } : undefined),
			header: { kind: 'group', id: drop.groupId },
			run,
		};
	}

	/** The chat a dragged chat row moves through its provider, when chats can move by drag and drop and this one can. */
	private movableChat(item: ISessionChatItem): { readonly session: ISession; readonly chat: IChat } | undefined {
		return this._draggedChat?.item === item ? this._draggedChat.movable : this.delegate.getMovableDraggedChat(item);
	}

	/**
	 * Where a chat that its provider can move goes when dropped here (see {@link getSessionsListChatDrop}): within or
	 * into a session, or into a new session. The provider then owns the chat order.
	 */
	private resolveChatMove(dragged: { readonly session: ISession; readonly chat: IChat }, targetElement: SessionListItem | undefined, sector: ListViewTargetSector | undefined): ISessionsListDropOperation | undefined {
		let target: ISessionsListChatDropTarget | undefined;
		if (targetElement && isSessionChatItem(targetElement)) {
			target = { session: targetElement.session, chat: targetElement.chat, position: sectorToPosition(sector) };
		} else if (targetElement && isSessionItem(targetElement)) {
			target = { session: targetElement, chat: undefined, position: 'before' };
		}
		const drop = getSessionsListChatDrop(dragged.session, dragged.chat, target);
		if (!drop) {
			return undefined;
		}
		let reaction: ITreeDragOverReaction;
		if (drop.kind === 'newSession') {
			// The whole list shows it receives the chat as a new session.
			reaction = { accept: true, feedback: [-1], effect: { type: ListDragOverEffectType.Move, position: ListDragOverEffectPosition.Over } };
		} else if (drop.position === 'over') {
			reaction = intoSessionDropReaction();
		} else {
			reaction = toDropReaction({ position: toEffectPosition(drop.position) });
		}
		return {
			reaction,
			moveFeedback: drop.kind === 'session' && drop.position !== 'over' ? 'nested' : 'move',
			run: () => this.delegate.moveChat(dragged.session, dragged.chat, drop),
		};
	}

	/**
	 * What a single dragged session that can move under another session does here (see
	 * {@link getSessionsListSessionDrop}), or `undefined` when the list places it as any dragged session.
	 */
	private resolveSessionNest(sessions: readonly ISession[], targetElement: SessionListItem | undefined, sector: ListViewTargetSector | undefined): SessionsListSessionDrop | undefined {
		if (sessions.length !== 1 || !targetElement || sector === undefined || !this.delegate.canMoveSessionUnder(sessions[0])) {
			return undefined;
		}
		const chatItem = isSessionChatItem(targetElement) ? targetElement : undefined;
		const session = chatItem ? chatItem.session : isSessionItem(targetElement) ? targetElement : undefined;
		if (!session || (!chatItem && session.sessionId === sessions[0].sessionId)) {
			return undefined;
		}
		return getSessionsListSessionDrop(sessions[0], {
			session,
			chat: chatItem?.chat,
			quarter: sector,
			isManuallyOrdered: () => this.delegate.isInManuallyOrderedSection(session),
			isLastInSection: () => this.delegate.isLastRowOfSection(chatItem ?? session),
			canPlace: position => !!this.resolveSessionDrop(sessions, session, undefined, position === 'before' ? ListViewTargetSector.TOP : ListViewTargetSector.BOTTOM),
		});
	}

	private resolveSessionDrop(sessions: readonly ISession[], target: SessionListItem | undefined, targetIndex: number | undefined, sector: ListViewTargetSector | undefined): ISessionsListDropOperation | undefined {
		const destination = this.resolveSessionDestination(sessions, target, targetIndex, sector);
		const effect = destination && this.delegate.getSessionDropEffect(sessions, destination);
		if (!destination || !effect) {
			return undefined;
		}
		// A reorder shown as an insertion line needs no header; anything else marks where the sessions land.
		const showsInsertionLine = destination.feedback !== undefined && destination.feedback.position !== ListDragOverEffectPosition.Over;
		return {
			reaction: toDropReaction(destination.feedback),
			header: effect === 'move' || !showsInsertionLine ? getPlacementHeader(destination.placement) : undefined,
			run: () => this.delegate.moveSessions(sessions, destination),
		};
	}

	/**
	 * Map the hovered element to where dropped sessions go, with one case per
	 * kind of list element. Whether the sessions may go there is decided by
	 * {@link ISessionsListDndDelegate.getSessionDropEffect}.
	 */
	private resolveSessionDestination(sessions: readonly ISession[], target: SessionListItem | undefined, targetIndex: number | undefined, sector: ListViewTargetSector | undefined): ISessionDropDestination | undefined {
		const over: ISessionDropFeedback = { position: ListDragOverEffectPosition.Over };
		if (target === undefined) {
			return this.resolveEmptySpaceDestination(sessions);
		}
		if (isSessionGroupItem(target)) {
			return { placement: { kind: 'group', groupId: target.group.id }, restoresArchived: true, feedback: over };
		}
		if (isSessionSection(target)) {
			return this.resolveSectionHeaderDestination(sessions, target);
		}
		if (isSessionPlaceholder(target) || (isSessionShowMore(target) && target.kind === 'sessions')) {
			const placement = getSectionPlacement(target.sectionId);
			return placement && { placement, restoresArchived: true, feedback: over };
		}
		if (isSessionShowMore(target)) {
			return undefined;
		}
		if (isSessionChatItem(target)) {
			// A nested chat row stands for its parent session: drop below the parent and all of its chats.
			const chatIndex = this.delegate.getVisibleChatRows(target.session).indexOf(target);
			const parentIndex = targetIndex === undefined || chatIndex < 0 ? undefined : targetIndex - chatIndex - 1;
			return this.resolveRowDestination(sessions, target.session, 'after', parentIndex);
		}
		return this.resolveRowDestination(sessions, target, sectorToPosition(sector), targetIndex);
	}

	private resolveRowDestination(sessions: readonly ISession[], row: ISession, position: 'before' | 'after', rowIndex: number | undefined): ISessionDropDestination | undefined {
		const placement = this.delegate.getRowPlacement(row);
		if (!placement || sessions.some(session => session.sessionId === row.sessionId)) {
			return undefined;
		}
		if (placement.kind === 'archived') {
			// Archived sessions keep a fixed order, so their rows only stand for the section.
			return { placement, restoresArchived: true };
		}
		// Dropping after a session lands below its nested chats, so show the line there.
		const feedback: ISessionDropFeedback = position === 'after' && rowIndex !== undefined
			? { position: ListDragOverEffectPosition.After, index: rowIndex + this.delegate.getVisibleChatRows(row).length }
			: { position: toEffectPosition(position) };
		return {
			placement,
			anchor: { session: row, position, staysInSection: isDateSectionPlacement(placement) },
			restoresArchived: true,
			feedback,
		};
	}

	/** Date sections derive from the sort key, so a header drop places the sessions at the top of that section. */
	private resolveSectionHeaderDestination(sessions: readonly ISession[], section: ISessionSection): ISessionDropDestination | undefined {
		const placement = getSectionPlacement(section.id);
		if (!placement) {
			return undefined;
		}
		const over: ISessionDropFeedback = { position: ListDragOverEffectPosition.Over };
		if (!isDateSectionPlacement(placement)) {
			return { placement, restoresArchived: true, feedback: over };
		}
		const draggedIds = new Set(sessions.map(session => session.sessionId));
		const first = section.sessions.find(session => !draggedIds.has(session.sessionId));
		return {
			placement,
			anchor: first && { session: first, position: 'before', staysInSection: true },
			restoresArchived: true,
			feedback: over,
		};
	}

	/** Below the last row, sessions go to the end of the date sections. Archived sessions stay put. */
	private resolveEmptySpaceDestination(sessions: readonly ISession[]): ISessionDropDestination | undefined {
		const dateSections = this.delegate.getDateSections();
		if (!dateSections) {
			return undefined;
		}
		// Anchor on the last session that is not being dragged, even when that empties the final section.
		const draggedIds = new Set(sessions.map(session => session.sessionId));
		for (let index = dateSections.length - 1; index >= 0; index--) {
			const last = dateSections[index].sessions.findLast(session => !draggedIds.has(session.sessionId));
			if (last) {
				return {
					placement: { kind: 'section', sectionId: dateSections[index].id },
					anchor: { session: last, position: 'after', staysInSection: true },
					restoresArchived: false,
				};
			}
		}
		return { placement: { kind: 'section', sectionId: DATE_SECTION_IDS[0] }, restoresArchived: false };
	}

	private draggedElements(data: IDragAndDropData): SessionListItem[] {
		return data instanceof ElementsDragAndDropData ? data.elements as SessionListItem[] : [];
	}

	private draggedHeader(elements: readonly SessionListItem[]): IDraggedHeader | undefined {
		const groupItem = elements.find(isSessionGroupItem);
		if (groupItem && this.delegate.isHeaderReorderable(groupItem)) {
			return { id: getSessionGroupSectionId(groupItem.group.id), group: groupItem };
		}
		const section = elements.find((e): e is ISessionSection => isSessionSection(e) && isSessionGroupingSection(e.id));
		if (section && this.delegate.isHeaderReorderable(section)) {
			return { id: section.id };
		}
		return undefined;
	}
}

function isDateSectionPlacement(placement: SessionListPlacement): boolean {
	return placement.kind === 'section' && DATE_SECTION_IDS.includes(placement.sectionId);
}

function sectorToPosition(sector: ListViewTargetSector | undefined): 'before' | 'after' {
	return sector !== undefined && sector >= ListViewTargetSector.CENTER_BOTTOM ? 'after' : 'before';
}

function toEffectPosition(position: 'before' | 'after'): ListDragOverEffectPosition {
	return position === 'after' ? ListDragOverEffectPosition.After : ListDragOverEffectPosition.Before;
}

/**
 * The quarter of the row under the pointer. The list computes it from `offsetY`, which is relative to the element under
 * the pointer (e.g. a row's title or description), not to the row: a pointer low on a row's title reads as its top.
 */
function getRowSector(e: DragEvent | undefined, listSector: ListViewTargetSector | undefined): ListViewTargetSector | undefined {
	const row = listSector !== undefined && e && DOM.isHTMLElement(e.target) ? e.target.closest<HTMLElement>('.monaco-list-row') : null;
	const bounds = row?.getBoundingClientRect();
	if (!e || !bounds?.height) {
		return listSector;
	}
	return Math.min(Math.max(Math.floor((e.clientY - bounds.top) / bounds.height * 4), ListViewTargetSector.TOP), ListViewTargetSector.BOTTOM);
}

/**
 * Dropping into a session, like into a folder in the Explorer: the session's row and its shown nested rows highlight,
 * and a collapsed session expands after a moment so the drop can go between its nested rows.
 */
function intoSessionDropReaction(): ITreeDragOverReaction {
	return { accept: true, bubble: TreeDragOverBubble.Down, autoExpand: true, effect: { type: ListDragOverEffectType.Move, position: ListDragOverEffectPosition.Over } };
}

/** The last of `nodes` the tree shows (a find filter can hide some) whose element is a `T`, scanning from the end. */
function findLastVisible<T extends SessionListItem>(nodes: readonly ITreeNode<SessionListItem | null, FuzzyScore>[], is: (element: SessionListItem) => element is T): T | undefined {
	for (let i = nodes.length - 1; i >= 0; i--) {
		const element = nodes[i].element;
		if (nodes[i].visible && element && is(element)) {
			return element;
		}
	}
	return undefined;
}

function toDropReaction(feedback: ISessionDropFeedback | undefined): ITreeDragOverReaction {
	if (!feedback) {
		// An empty feedback list suppresses both row and whole-list feedback.
		return { accept: true, feedback: [] };
	}
	return {
		accept: true,
		effect: { type: ListDragOverEffectType.Move, position: feedback.position },
		feedback: feedback.index === undefined ? undefined : [feedback.index],
	};
}

//#endregion

//#region Sessions List Control

interface ISessionsListControlBaseOptions {
	readonly overrideStyles?: IStyleOverride<IListStyles>;
	readonly grouping: () => SessionsGrouping;
	readonly sorting: () => SessionsSorting;
	readonly compact?: () => boolean;
	readonly showNavigationShortcuts?: () => boolean;
	readonly customizationsCount?: IObservable<number>;
	readonly customizationMigrationsAvailable?: IObservable<boolean>;
	/** Whether installed extensions can be enabled in the Agents window, signaled on the Customizations navigation entry. */
	readonly customizationExtensionSuggestionsAvailable?: IObservable<boolean>;
	readonly navigationContainer?: HTMLElement;
	readonly onDidChangeNavigationHeight?: () => void;
	readonly focusNewSessionInput?: () => void;
	readonly findWidgetContainer?: HTMLElement;
	readonly onDidScroll?: () => void;
	onSessionOpen(resource: URI, preserveFocus: boolean, sideBySide: boolean): void | Promise<void>;

	/**
	 * Gate invoked before a session is opened (before mark-read, activation, and
	 * folder mount). Return `false` to refuse the open — e.g. the session's folder
	 * is not trusted — leaving the current session/empty slot untouched. When
	 * omitted, opens are not gated.
	 */
	canOpenSession?(session: ISession): Promise<boolean>;
	onChatOpen?(session: ISession, chat: IChat, preserveFocus: boolean, sideBySide: boolean): void | Promise<void>;

	/**
	 * Approval model tracking pending tool confirmations for the shown sessions
	 * and their chats. When omitted the list creates and owns its own; injectable
	 * so tests and fixtures can supply pending approvals without a live chat model.
	 */
	readonly approvalModel?: AgentSessionApprovalModel;

	/**
	 * The notice at the bottom of the sessions list when it shows, to report the moves the list makes (their progress,
	 * result and Undo). Without it, a move that fails is a notification.
	 */
	getMoveNotice?(): SessionsListMoveNotice | undefined;
}

export type ISessionsListControlOptions = ISessionsListControlBaseOptions;

/**
 * @deprecated Use {@link ISessionsListControlOptions} instead.
 */
export type ISessionsListOptions = ISessionsListControlOptions;

interface IListOpenRequest {
	readonly session: ISession;
	readonly chat: IChat | undefined;
	readonly sideBySide: boolean;
	preserveFocus: boolean;
	started: boolean;
	invocation: number;
}

/**
 * Identifies a sessions list row by the model identity it renders. Only test
 * subclasses use it, to drive rows that production reaches through user input.
 */
export type SessionsListItemReference =
	| { readonly session: URI; readonly chat?: URI }
	| { readonly group: string }
	| { readonly section: string };

export interface ISessionsList {
	readonly element: HTMLElement;
	readonly onDidUpdate: Event<void>;
	readonly onDidChangeFindOpenState: Event<boolean>;
	refresh(): void;
	reveal(sessionResource: URI): boolean;
	/**
	 * Returns the sessions currently visible in the list, in display order.
	 * Sessions hidden by section capping ("show more") are excluded.
	 */
	getVisibleSessions(): readonly ISession[];
	clearFocus(): void;
	hasFocusOrSelection(): boolean;
	setVisible(visible: boolean): void;
	layout(height: number, width: number): void;
	setCompact(): void;
	focus(): void;
	update(expandAll?: boolean): void;
	openFind(): void;
	closeFind(): void;
	/** Forgets the collapse state of sections that only the previous grouping renders, keeping custom groups and other shared placements. */
	resetSectionCollapseState(): void;
	pinSession(session: ISession): void;
	unpinSession(session: ISession): void;
	isSessionPinned(session: ISession): boolean;
	readonly filters: SessionsListFilters;
	setExcludeArchived(exclude: boolean): void;
	isExcludeArchived(): boolean;
	/**
	 * Returns every filter and display option to its default. Returns a function
	 * that restores them as they were before the reset.
	 */
	resetFilters(): () => void;
	setWorkspaceGroupCapped(capped: boolean): void;
	isWorkspaceGroupCapped(): boolean;
	setOpenWindowSourceFolder(folder: URI | undefined): void;
	collapseAllSections(): void;
	createGroupFromSessions(sessions: ISession[]): void;
	createSubgroup(parentId: string): void;
	beginRenameGroup(groupId: string): void;
	beginRenameSession(session: ISession): boolean;
	beginRenameChat(item: ISessionChatItem): boolean;
	addSessionsToGroup(sessions: ISession[], groupId: string): void;
	getGroupsInDisplayOrder(): ISessionGroup[];
}

/**
 * A node of {@link SessionsList.getTreeSnapshot}: a section or custom group
 * header with its rows, or a session row. Headers are identified by their
 * section id, such as `pinned`, `workspace:<label>`, or `group:<groupId>`.
 */
export type SessionsListSnapshotNode =
	| {
		readonly type: 'section' | 'group';
		readonly id: string;
		readonly label: string;
		readonly collapsed: boolean;
		/** Capping hides the header behind the "+N more" row. */
		readonly hidden?: boolean;
		/** A comparison group, which owns its membership and position. */
		readonly comparison?: boolean;
		readonly children: readonly SessionsListSnapshotNode[];
	}
	| {
		readonly type: 'session';
		readonly session: ISession;
		/** Capping hides the row behind its section's "Show more" row. */
		readonly hidden?: boolean;
	};

/** Where {@link SessionsList.moveSessionsTo} positions sessions within their placement. */
export type SessionsListSessionPosition =
	| 'top'
	| 'bottom'
	| { readonly session: ISession; readonly position: 'before' | 'after' };

/** Where {@link SessionsList.moveHeaderTo} positions a header among its new siblings. */
export interface ISessionsListHeaderPosition {
	/** The section id of a sibling header. */
	readonly siblingId: string;
	readonly position: 'before' | 'after';
}

/** The placement of the section a session renders in when it is neither archived, pinned, nor grouped. */
export const SESSIONS_LIST_UNGROUPED_PLACEMENT = 'ungrouped';

/** The resettable state of a single value, which Reset Filters sets to `defaultValue`. */
function resettableValue<T>(read: () => T, write: (value: T) => void, defaultValue: T): ISessionsListResettableState {
	return {
		capture: () => {
			const value = read();
			return () => write(value);
		},
		reset: () => write(defaultValue),
	};
}

export class SessionsList extends Disposable implements ISessionsList {

	private static readonly SECTION_COLLAPSE_STATE_KEY = 'sessionsListControl.sectionCollapseState';
	private static readonly SESSION_COLLAPSE_STATE_KEY = 'sessionsListControl.sessionCollapseState';
	private static readonly EXCLUDED_TYPES_KEY = 'sessionsListControl.excludedSessionTypes';
	private static readonly EXCLUDED_STATUSES_KEY = 'sessionsListControl.excludedStatuses';
	private static readonly EXCLUDE_ARCHIVED_KEY = 'sessionsListControl.excludeArchived';
	private static readonly EXCLUDE_READ_KEY = 'sessionsListControl.excludeRead';
	private static readonly SHOW_EMPTY_GROUPS_KEY = 'sessionsListControl.showEmptyGroups';
	private static readonly WORKSPACE_GROUP_CAPPED_KEY = 'sessionsListControl.workspaceGroupCapped';
	/**
	 * The user's last show more/show less choice per capped workspace section and
	 * custom group: `true` lists every session, `false` caps the section.
	 */
	private static readonly SESSION_GROUP_EXPANSION_STATE_KEY = 'sessionsListControl.sessionGroupExpansionState';
	private static readonly DEFAULT_SESSION_GROUP_LIMIT = 5;

	/**
	 * Experiment treatment that overrides how many sessions are shown per group
	 * before the "show more" affordance appears.
	 */
	private static readonly SESSION_GROUP_LIMIT_TREATMENT = 'sessions.workspaceGroupLimit';

	private readonly listContainer: HTMLElement;
	private readonly stickyShowMoreContainer: HTMLElement;
	private readonly stickyShowMoreButton: Button;
	private readonly stickyShowMoreLabel: HTMLElement;
	private readonly showMoreRenderer: SessionShowMoreRenderer;
	private stickyShowMoreItem: ISessionShowMore | undefined;
	private pendingOpenRequest: IListOpenRequest | undefined;
	protected readonly tree: WorkbenchObjectTree<SessionListItem, FuzzyScore>;
	private readonly navigationList: WorkbenchList<ISessionSection> | undefined;
	private navigationSections: readonly ISessionSection[] = [];
	private sessions: ISession[] = [];
	private readonly pendingListUpdate = this._register(new MutableDisposable());
	private refreshPending = false;
	private readonly sessionChatsObserver = this._register(new MutableDisposable());
	private readonly sessionChatsUpdate = this._register(new MutableDisposable());
	private readonly activeSessionUpdate = this._register(new MutableDisposable());
	private readonly nestedSessionOrderUpdate = this._register(new MutableDisposable());
	/** Reveals what a move started from the list moved, once the list shows it; see {@link watchMoveForReveal}. */
	private readonly pendingMoveReveal = this._register(new MutableDisposable<DisposableStore>());
	private tryPendingMoveReveal: (() => void) | undefined;
	/** Whether the focused nested chat can move up or down through its provider, for the Move Up and Move Down keybindings. */
	private readonly focusedChatCanMoveUpContext: IContextKey<boolean>;
	private readonly focusedChatCanMoveDownContext: IContextKey<boolean>;
	private readonly collapsedSessionResources: Set<string>;
	private nestedSessionResources = new Set<string>();
	/**
	 * Reactively reconciles each chat row's virtualized height with its live
	 * approval and workspace state. Owned by the list (not the row templates), so
	 * changes while a row is virtualized offscreen still correct the ListView's
	 * cached height. Re-established after every {@link update} because chat items
	 * are rebuilt each render.
	 */
	private readonly chatRowHeightReconcile = this._register(new MutableDisposable());
	private readonly automationSessions = observableValue<readonly ISession[]>(this, []);
	private readonly collapsedSessionIds = observableValue<ReadonlySet<string>>(this, new Set());
	/**
	 * Session IDs whose hierarchy indent/connector guides should be visible:
	 * the union of the currently-hovered session (if any) and every session
	 * that is the parent of, or itself, a currently selected or keyboard-focused
	 * row. Focus is tracked separately from selection because arrow-key
	 * navigation (via the workbench `list.focusUp`/`list.focusDown` commands)
	 * moves the tree's focus without changing its selection.
	 * Hovering, selecting, or focusing a chat child reveals its own parent's
	 * guides only.
	 */
	private readonly hoveredGuideSessionId = observableValue<string | undefined>(this, undefined);
	private readonly selectedGuideSessionIds = observableValue<ReadonlySet<string>>(this, EMPTY_GUIDE_SESSION_IDS);
	private readonly focusedGuideSessionIds = observableValue<ReadonlySet<string>>(this, EMPTY_GUIDE_SESSION_IDS);
	private readonly activeGuideSessionIds = derived(this, reader => {
		const hovered = this.hoveredGuideSessionId.read(reader);
		const selected = this.selectedGuideSessionIds.read(reader);
		const focused = this.focusedGuideSessionIds.read(reader);
		if (!hovered && focused.size === 0) {
			return selected;
		}
		const ids = new Set(selected);
		for (const id of focused) {
			ids.add(id);
		}
		if (hovered) {
			ids.add(hovered);
		}
		return ids;
	});
	private visible = true;
	private readonly onboardingTarget = observableValue<ISessionOnboardingTarget | undefined>(this, undefined);
	readonly filters: SessionsListFilters;
	private _excludeArchived: boolean;
	/** Whether the archived filter still follows {@link SESSIONS_LIST_SHOW_ARCHIVED_BY_DEFAULT_SETTING} because the user has not chosen one. */
	private _excludeArchivedIsDefault: boolean;
	private workspaceGroupCapped: boolean;
	/**
	 * Everything Reset Filters returns to its default, and that undoing it
	 * restores. Add the state of a new filter or display option here so that
	 * both cover it.
	 */
	private readonly resettableStates: readonly ISessionsListResettableState[];

	/** Tree delegate, retained so height reconciliation can recompute row heights. */
	private _delegate!: SessionsTreeDelegate;
	/** Approval model tracking pending tool confirmations across the shown chats. */
	private _approvalModel!: AgentSessionApprovalModel;
	private _sessionRenderer!: SessionItemRenderer;
	private _chatRenderer!: SessionChatItemRenderer;
	private readonly _sessionContextMenuDisposables = this._register(new MutableDisposable<DisposableStore>());

	/**
	 * Maximum number of sessions shown per workspace section or user group.
	 */
	private readonly sessionGroupLimit = observableValue<number>(this, SessionsList.DEFAULT_SESSION_GROUP_LIMIT);
	private readonly renderedComparisonAttemptConnectorPositions = new Map<string, SessionGroupConnectorPosition>();
	private readonly renderedComparisonAttemptLabels = new Map<string, string>();
	/** How many groups each rendered custom group is nested in, by group id. */
	private readonly groupDepths = new Map<string, number>();
	private expandedMoreFolders = false;
	/** The grouping sections that capping currently hides behind the "+N more" row. */
	private hiddenGroupingSections: readonly ISessionSection[] = [];
	private openWindowSourceFolder: URI | undefined;
	private hasFindPattern = false;
	private suspendCollapseStatePersistence = false;
	private readonly findOpen = observableValue(this, false);

	/** The group whose header is currently showing its inline name editor. */
	private _editingGroupId: string | undefined;
	private _groupRenderer!: SessionGroupRenderer;
	private readonly groupAppearancePicker: SessionGroupAppearancePicker;
	private _sectionRenderer!: SessionSectionRenderer;
	private _sessionsProvidersService!: ISessionsProvidersService;
	private _dropTargetHeader: ISessionDropTargetHeader | undefined;
	/** Current comparison placement, shared by rendering and unfiltered bulk actions. */
	private readonly comparisonSectionIds = new Map<string, string>();

	/**
	 * Snapshot of the currently-rendered reorderable top-level headers (groups
	 * and, in workspace and repository modes, their sections) in display order,
	 * by reorder identity. Captured each render and used as the basis for
	 * drag-reorder math.
	 */
	private _topLevelOrder: string[] = [];

	private readonly _onDidUpdate = this._register(new Emitter<void>());
	readonly onDidUpdate: Event<void> = this._onDidUpdate.event;
	private readonly _onDidOpenSession = this._register(new Emitter<URI>());
	readonly onDidOpenSession = this._onDidOpenSession.event;
	private readonly _onDidActivateNewSession = this._register(new Emitter<void>());

	private readonly _onDidChangeFindOpenState = this._register(new Emitter<boolean>());
	readonly onDidChangeFindOpenState: Event<boolean> = this._onDidChangeFindOpenState.event;

	get element(): HTMLElement { return this.listContainer; }

	private isCompact(): boolean {
		return (this.options.compact?.() ?? false) && !IsPhoneLayoutContext.getValue(this.contextKeyService);
	}

	constructor(
		container: HTMLElement,
		private readonly options: ISessionsListControlOptions,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@ICustomViewService private readonly customViewService: ICustomViewService,
		@ISessionsListModelService private readonly _sessionsListModelService: ISessionsListModelService,
		@ISessionGroupsService private readonly _sessionGroupsService: ISessionGroupsService,
		@ISessionComparisonService private readonly sessionComparisonService: ISessionComparisonService,
		@ISessionSectionOrderService private readonly _sessionSectionOrderService: ISessionSectionOrderService,
		@IAgentHostFilterService private readonly _agentHostFilterService: IAgentHostFilterService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IStorageService private readonly storageService: IStorageService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IMenuService private readonly menuService: IMenuService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@ICommandService private readonly commandService: ICommandService,
		@IAutomationService private readonly automationService: IAutomationService,
		@IVoicePlaybackService private readonly _listVoicePlaybackService: IVoicePlaybackService,
		@IWorkbenchAssignmentService private readonly assignmentService: IWorkbenchAssignmentService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IAgentHostConnectionsService private readonly agentHostConnectionsService: IAgentHostConnectionsService,
		@IOpenerService private readonly openerService: IOpenerService,
		@ILabelService private readonly labelService: ILabelService,
		@IEditorService editorService: IEditorService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
		@INotificationService private readonly notificationService: INotificationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.groupAppearancePicker = this._register(instantiationService.createInstance(SessionGroupAppearancePicker));
		this.filters = this._register(instantiationService.createInstance(SessionsListFilters));
		for (const key of [SessionsList.EXCLUDED_TYPES_KEY, SessionsList.EXCLUDED_STATUSES_KEY, SessionsList.EXCLUDE_READ_KEY, SessionsList.SHOW_EMPTY_GROUPS_KEY]) {
			this.storageService.remove(key, StorageScope.PROFILE);
		}

		// Load property filter state
		const storedExcludeArchived = this.storageService.getBoolean(SessionsList.EXCLUDE_ARCHIVED_KEY, StorageScope.PROFILE);
		this._excludeArchivedIsDefault = storedExcludeArchived === undefined;
		this._excludeArchived = storedExcludeArchived ?? this.excludesArchivedByDefault();
		this.workspaceGroupCapped = this.storageService.getBoolean(SessionsList.WORKSPACE_GROUP_CAPPED_KEY, StorageScope.PROFILE, true);
		this.collapsedSessionResources = this.loadCollapsedSessionResources();
		this.resettableStates = [
			this.filters,
			// `undefined` follows the archived filter's default setting.
			resettableValue(() => this._excludeArchivedIsDefault ? undefined : this._excludeArchived, exclude => this.applyExcludeArchived(exclude), true),
			resettableValue(() => this.workspaceGroupCapped, capped => this.applyWorkspaceGroupCapped(capped), true),
			resettableValue(() => this.loadSessionGroupExpansion(), state => this.storeSessionGroupExpansion(state), new Map()),
			resettableValue(() => this.expandedMoreFolders, expanded => { this.expandedMoreFolders = expanded; }, false),
		];

		this.listContainer = DOM.append(container, $('.sessions-list-control.session-list-row-spacing'));
		this.listContainer.classList.toggle('compact', this.isCompact());
		const markSectionFocusFromPointer = (element: HTMLElement) => this._register(DOM.addDisposableListener(element, DOM.EventType.POINTER_DOWN, () => {
			element.classList.add(SESSION_SECTION_FOCUS_FROM_POINTER_CLASS);
		}));
		markSectionFocusFromPointer(this.listContainer);
		if (this.options.navigationContainer) {
			markSectionFocusFromPointer(this.options.navigationContainer);
		}
		this._register(DOM.addDisposableListener(this.listContainer.ownerDocument, DOM.EventType.KEY_DOWN, () => {
			this.listContainer.classList.remove(SESSION_SECTION_FOCUS_FROM_POINTER_CLASS);
			this.options.navigationContainer?.classList.remove(SESSION_SECTION_FOCUS_FROM_POINTER_CLASS);
		}, true));

		const approvalModel = this.options.approvalModel ?? this._register(instantiationService.createInstance(AgentSessionApprovalModel));
		this._approvalModel = approvalModel;
		const markdownRendererService = instantiationService.invokeFunction(accessor => accessor.get(IMarkdownRendererService));
		const hoverService = instantiationService.invokeFunction(accessor => accessor.get(IHoverService));
		const sessionsProvidersService = instantiationService.invokeFunction(accessor => accessor.get(ISessionsProvidersService));
		this._sessionsProvidersService = sessionsProvidersService;
		// Re-render so the always-visible "Chats" section appears/disappears when a
		// quick-chat-capable provider is (de)registered (e.g. agent host toggled),
		// or when a registered provider toggles a capability at runtime (e.g. its
		// `supportsQuickChats` flips with agent-host enablement).
		const providerCapabilityListeners = this._register(new DisposableStore());
		const subscribeProviderCapabilities = () => {
			providerCapabilityListeners.clear();
			for (const provider of sessionsProvidersService.getProviders()) {
				if (provider.onDidChangeCapabilities) {
					providerCapabilityListeners.add(provider.onDidChangeCapabilities(() => this.update()));
				}
			}
		};
		subscribeProviderCapabilities();
		this._register(sessionsProvidersService.onDidChangeProviders(() => {
			subscribeProviderCapabilities();
			this.scheduleListUpdate();
		}));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(SESSIONS_LIST_SHOW_EMPTY_DEFAULT_GROUPS_SETTING) || e.affectsConfiguration(SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING) || e.affectsConfiguration(ChatSessionArchiveActionWordingSettingId)) {
				this.update();
			}
		}));
		// TEMPORARY (#320480): see the note on the `IAgentSessionsService` import.
		const agentSessionsService = instantiationService.invokeFunction(accessor => accessor.get(IAgentSessionsService));
		const voicePlaybackService = instantiationService.invokeFunction(accessor => accessor.get(IVoicePlaybackService));
		const externalApplicationBadgeMode = observableConfigValue(SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SETTING, ExternalSessionApplicationBadgeMode.Off, this.configurationService);
		const externalApplicationBadgeShowFrom = observableConfigValue(SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SHOW_FROM_SETTING, true, this.configurationService);
		const reportExternalApplicationBadgeModeExperimentTrigger = () => logDefaultSettingExperimentTrigger(this.configurationService, this.telemetryService, SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SETTING);
		const reportExternalApplicationBadgeShowFromExperimentTrigger = () => logDefaultSettingExperimentTrigger(this.configurationService, this.telemetryService, SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SHOW_FROM_SETTING);
		const sessionRenderer = new SessionItemRenderer(
			{
				grouping: this.options.grouping,
				isPinned: s => this.isSessionPinned(s),
				isRenderedInCustomGroup: s => this.isRenderedInCustomGroup(s),
				getGroupConnectorPosition: s => this.renderedComparisonAttemptConnectorPositions.get(s.sessionId),
				getComparisonAttemptLabel: s => this.renderedComparisonAttemptLabels.get(s.sessionId),
				shouldShowComparisonAttemptStatus: (s, reader) => this.shouldShowComparisonAttemptStatus(s, reader),
				isRenderedInExternalSection: s => this.isRenderedInExternalSection(s),
				getEnvironmentBadgeLabel: s => this.getEnvironmentBadgeLabel(s),
				visibleSessions: this._sessionsService.visibleSessions,
				getMultiSelectedSessions: s => this.getMultiSelectedSessions(s),
				showHover: true,
				useCompactQuickChatRows: true,
				compact: () => this.isCompact(),
				approvalRowMaxLines: DEFAULT_APPROVAL_ROW_MAX_LINES,
				aggregateChatApprovals: false,
				toolbarMenuId: Menus.SessionItemToolbar,
				toolbarTelemetrySource: 'sessionsList.row',
				inlineRename: true,
				contextViewService: this.contextViewService,
				onDidDoubleClickRename: session => this.preservePendingOpenFocus(session),
				onDidFinishRename: () => this.tree.domFocus(),
				activeGuideSessionIds: this.activeGuideSessionIds,
				deriveStatusFromMainChat: true,
				activeSession: this._sessionsService.activeSession,
				externalApplicationBadgeMode,
				externalApplicationBadgeShowFrom,
				reportExternalApplicationBadgeModeExperimentTrigger,
				reportExternalApplicationBadgeShowFromExperimentTrigger,
				collapsedSessionIds: this.collapsedSessionIds,
				onboardingTarget: this.onboardingTarget,
				getGroupDepth: session => this.getRowGroupDepth(session),
			},
			approvalModel,
			undefined,
			instantiationService,
			contextKeyService,
			this.configurationService,
			markdownRendererService,
			hoverService,
			sessionsProvidersService,
			this._sessionsManagementService,
			this.agentHostConnectionsService,
			this.openerService,
			this.labelService,
			agentSessionsService,
			voicePlaybackService,
		);
		this._sessionRenderer = sessionRenderer;

		const showMoreRenderer = new SessionShowMoreRenderer(element => this.getRowGroupDepth(element));
		this.showMoreRenderer = showMoreRenderer;
		const placeholderRenderer = new SessionPlaceholderRenderer(hoverService, element => this.getRowGroupDepth(element));
		const chatRenderer = new SessionChatItemRenderer(
			hoverService,
			instantiationService,
			this.contextKeyService,
			this._sessionsManagementService,
			this.contextViewService,
			markdownRendererService,
			approvalModel,
			DEFAULT_APPROVAL_ROW_MAX_LINES,
			item => this.preservePendingOpenFocus(item.session, item.chat),
			() => this.tree.domFocus(),
			item => withSessionsListHoverPresentation(createSessionSummaryHover(
				item.session,
				getChatSummaryHoverData(item.session, item.chat, sessionsProvidersService, this.openerService, this.labelService, getCreatorHoverData(item.session, this._sessionsManagementService, this.agentHostConnectionsService, this.openerService), this.isCompact()),
				this.openerService,
			)),
			() => this.isCompact(),
			() => {
				if (this.options.sorting() === SessionsSorting.Updated) {
					this.nestedSessionOrderUpdate.value = DOM.scheduleAtNextAnimationFrame(DOM.getWindow(this.listContainer), () => {
						if (this.visible) {
							this.update();
						}
					});
				}
			},
			this.activeGuideSessionIds,
			item => this.getRowGroupDepth(item),
		);
		this._chatRenderer = chatRenderer;
		const selectHeader = (element: ISessionSection | ISessionGroupItem, event: MouseEvent) => {
			this.tree.setFocus([element], event);
			this.tree.setSelection([element], event);
		};
		const showUnreadInCollapsedSections = observableConfigValue(SESSIONS_LIST_SHOW_UNREAD_IN_COLLAPSED_SECTIONS_SETTING, false, this.configurationService);
		const headerStatusTriggerPending = observableValue(this, true);
		const headerStatusTrigger: ISessionHeaderStatusTrigger = {
			pending: headerStatusTriggerPending,
			includeExpanded: observableFromEvent(this, accessibilityService.onDidChangeScreenReaderOptimized, () => accessibilityService.isScreenReaderOptimized()),
			report: () => {
				logSettingExperimentTrigger(this.telemetryService, SESSIONS_LIST_SHOW_UNREAD_IN_COLLAPSED_SECTIONS_SETTING);
				headerStatusTriggerPending.set(false, undefined);
			},
		};
		const blockedSessions = derived(this, reader => showUnreadInCollapsedSections.read(reader)
			? reader.store.add(instantiationService.createInstance(BlockedSessions))
			: undefined);
		const sessionsWithFailingCI = derived(this, reader => new Set(
			blockedSessions.read(reader)?.blockedSessionsWithReasons.read(reader)
				.filter(blocked => blocked.reason === BlockedSessionReason.FailingCI)
				.map(blocked => blocked.session.sessionId)
		));
		const customizationsActive = observableFromEvent(this, editorService.onDidActiveEditorChange, () => editorService.activeEditor instanceof AICustomizationManagementEditorInput);
		const newSessionKeybindingAriaLabel = observableFromEvent(this, keybindingService.onDidUpdateKeybindings, () => keybindingService.lookupKeybinding(NEW_SESSION_ACTION_ID, this.contextKeyService)?.getAriaLabel() ?? undefined);
		const customizationsCount = this.options.customizationsCount ?? constObservable(0);
		const customizationMigrationsAvailable = this.options.customizationMigrationsAvailable ?? constObservable(false);
		const customizationExtensionSuggestionsAvailable = this.options.customizationExtensionSuggestionsAvailable ?? constObservable(false);
		const createSectionRenderer = (templateId?: string, rowClassName?: string) => new SessionSectionRenderer(
			true /* hideSectionCount */,
			selectHeader,
			showUnreadInCollapsedSections,
			sessionsWithFailingCI,
			headerStatusTrigger,
			instantiationService,
			hoverService,
			contextKeyService,
			this.automationService,
			this.automationSessions,
			this.uriIdentityService,
			this.customViewService,
			this.menuService,
			this.keybindingService,
			customizationsActive,
			customizationMigrationsAvailable,
			templateId,
			rowClassName,
			{
				onDidActivateNewSession: this._onDidActivateNewSession.event,
				getNewSessionFocusTarget: () => this.navigationList ? {
					element: this.navigationList.getHTMLElement(),
					focus: () => this.focusNavigationSection(NEW_SESSION_SECTION_ID),
				} : undefined,
			},
			section => this.getNewSessionEnvironmentActions(section),
			customizationExtensionSuggestionsAvailable,
			section => this.getRowGroupDepth(section),
			sectionId => this._sessionGroupsService.getSectionAppearance(sectionId),
		);
		const sectionRenderer = createSectionRenderer(undefined, 'session-list-section-row');
		const shortcutSectionRenderer = createSectionRenderer(SESSION_SHORTCUT_SECTION_TEMPLATE_ID, 'session-list-shortcut-row');
		this._sectionRenderer = sectionRenderer;
		const groupRenderer = new SessionGroupRenderer({
			commitEdit: (group, name) => this.commitGroupEdit(group, name),
			cancelEdit: group => this.cancelGroupEdit(group),
			select: selectHeader,
			toggleCollapsed: element => this.tree.toggleCollapsed(element),
		}, showUnreadInCollapsedSections, sessionsWithFailingCI, headerStatusTrigger, instantiationService, contextKeyService);
		this._groupRenderer = groupRenderer;

		// Read (don't bind) `IsPhoneLayoutContext` from the parent context so we
		// observe the workbench's value rather than shadowing it with a fresh
		// scoped default of `false`. The reactive height refresh below listens
		// on the same scoped service for changes.
		const delegate = new SessionsTreeDelegate(
			approvalModel,
			() => !!IsPhoneLayoutContext.getValue(contextKeyService),
			() => this.isCompact(),
			session => getSessionRowStatus(session, undefined, true, this.collapsedSessionIds.get().has(session.sessionId)),
			DEFAULT_APPROVAL_ROW_MAX_LINES,
			undefined,
			true /* useCompactQuickChatRows */,
			false /* aggregateChatApprovals */,
			true /* useInsetRowSpacing */,
			session => this.renderedComparisonAttemptLabels.has(session.sessionId),
		);
		this._delegate = delegate;

		this.options.navigationContainer?.classList.add('empty');
		this.navigationList = this.options.navigationContainer
			? this._register(instantiationService.createInstance(
				WorkbenchList<ISessionSection>,
				'SessionsNavigationList',
				this.options.navigationContainer,
				new SessionShortcutListDelegate(),
				[new SessionShortcutListRenderer(shortcutSectionRenderer)],
				{
					accessibilityProvider: new SessionsAccessibilityProvider(shortcutSectionRenderer.automationStatus, {
						grouping: this.options.grouping,
						isPinned: session => this.isSessionPinned(session),
						widgetAriaLabel: localize('sessionsNavigation', "Sessions Navigation"),
						customizationsCount,
						customizationMigrationsAvailable,
						customizationExtensionSuggestionsAvailable,
						newSessionKeybindingAriaLabel,
					}),
					keyboardNavigationLabelProvider: {
						getKeyboardNavigationLabel: section => section.label,
					},
					multipleSelectionSupport: false,
					openOnSingleClick: true,
					overrideStyles: this.options.overrideStyles,
				},
			))
			: undefined;
		if (this.navigationList) {
			this._register(this.navigationList.onDidOpen(e => this.openNavigationSection(e.element, e.sideBySide)));
			this._register(this.navigationList.onContextMenu(e => {
				if (e.element?.id === AUTOMATIONS_SECTION_ID) {
					this.showAutomationsContextMenu(e.anchor);
				}
			}));
		}

		this.tree = this._register(instantiationService.createInstance(
			WorkbenchObjectTree<SessionListItem, FuzzyScore>,
			'SessionsListTree',
			this.listContainer,
			delegate,
			[
				sessionRenderer,
				chatRenderer,
				sectionRenderer,
				shortcutSectionRenderer,
				groupRenderer,
				showMoreRenderer,
				placeholderRenderer,
			],
			{
				accessibilityProvider: new SessionsAccessibilityProvider(sectionRenderer.automationStatus, {
					grouping: this.options.grouping,
					isPinned: session => this.isSessionPinned(session),
					isRenderedInCustomGroup: session => this.isRenderedInCustomGroup(session),
					getComparisonAttemptLabel: session => this.renderedComparisonAttemptLabels.get(session.sessionId),
					isRenderedInExternalSection: session => this.isRenderedInExternalSection(session),
					getEnvironmentBadgeLabel: session => this.getEnvironmentBadgeLabel(session),
					compact: () => this.isCompact(),
					approvalModel,
					aggregateChatApprovals: false,
					deriveStatusFromMainChat: true,
					collapsedSessionIds: this.collapsedSessionIds,
					showUnreadInCollapsedSections,
					sessionsWithFailingCI,
					externalApplicationBadgeMode,
					reportExternalApplicationBadgeModeExperimentTrigger,
					reportExternalApplicationBadgeShowFromExperimentTrigger,
				}),
				dnd: this._register(new SessionsListDragAndDrop({
					getRowPlacement: session => this.getRowPlacement(session),
					getVisibleChatRows: session => this.getVisibleChatRows(session),
					getDateSections: () => this.getDateSections(),
					getSessionDropEffect: (sessions, destination) => this.getSessionDropEffect(sessions, destination),
					moveSessions: (sessions, destination) => this.moveSessions(sessions, destination).catch(onUnexpectedError),
					isHeaderReorderable: element => this.isHeaderReorderable(element),
					setDropTargetHeader: header => this.setDropTargetHeader(header),
					getHeaderDrop: (header, target, sector) => this.getHeaderDrop(header, target, sector),
					moveHeader: (header, drop) => this.moveHeader(header, drop),
					getMovableDraggedChat: item => this.getMovableDraggedChat(item),
					canMoveSessionUnder: session => this.isChatMoveDndEnabled() && this._sessionsManagementService.canMoveSessionUnder(session),
					moveChat: (session, chat, drop) => this.moveChatByDrop(session, chat, drop),
					moveSessionUnder: (session, target, after) => this.moveSessionUnderByDrop(session, target, after),
					isInManuallyOrderedSection: session => this.isSessionPinned(session) || this._sessionGroupsService.getGroupOfSession(session.sessionId) !== undefined,
					isLastRowOfSection: element => this.isLastRowOfSection(element),
					setMoveDropFeedback: kind => {
						this.listContainer.classList.toggle('move-drag', kind !== 'none');
						this.listContainer.classList.toggle('move-drag-nested', kind === 'nested');
					},
					setHeaderInsertionDepth: depth => {
						this.listContainer.classList.toggle('session-group-insertion', !!depth);
						if (depth) {
							this.listContainer.style.setProperty('--session-group-insertion-depth', String(depth));
						} else {
							this.listContainer.style.removeProperty('--session-group-insertion-depth');
						}
					},
				})),
				identityProvider: {
					getId: (element: SessionListItem) => {
						if (isSessionGroupItem(element)) {
							return getSessionGroupSectionId(element.group.id);
						}
						if (isSessionSection(element)) {
							return `section:${element.id}`;
						}
						if (isSessionShowMore(element)) {
							return `show-more:${element.kind}:${element.mode}:${element.sectionId}`;
						}
						if (isSessionPlaceholder(element)) {
							return `placeholder:${element.sectionId}`;
						}
						if (isSessionChatItem(element)) {
							return `chat:${element.session.sessionId}:${element.chat.resource.toString()}`;
						}
						return element.resource.toString();
					},
					getGroupId: (element: SessionListItem) => {
						if (isSessionGroupItem(element)) {
							return NotSelectableGroupId;
						}
						if (isSessionSection(element)) {
							return NotSelectableGroupId;
						}
						if (isSessionShowMore(element)) {
							return NotSelectableGroupId;
						}
						if (isSessionPlaceholder(element)) {
							return NotSelectableGroupId;
						}
						if (isSessionChatItem(element)) {
							// Standalone chats in the Done section cannot be selected together with nested chats, which can be dragged.
							return element.standalone ? 4 : 3;
						}
						// Use a distinct group for archived (done) sessions so that
						// multi-selection cannot span the workspace and done sections.
						return element.isArchived.get() ? 2 : 1;
					}
				},
				horizontalScrolling: false,
				// Avoid stale composited row textures over the transparent shell gradient while scrolling.
				transformOptimization: false,
				multipleSelectionSupport: true,
				allowNonCollapsibleParents: true,
				enableStickyScroll: true,
				expandOnlyOnTwistieClick: element => isSessionItem(element) || (isSessionGroupItem(element) && element.comparison !== undefined),
				findWidgetEnabled: true,
				defaultFindMode: TreeFindMode.Filter,
				findWidgetContainer: this.options.findWidgetContainer,
				findWidgetStyles: {
					...defaultFindWidgetStyles,
					toggleStyles: {
						...defaultToggleStyles,
						inputActiveOptionBorder: 'transparent',
					},
				},
				keyboardNavigationLabelProvider: {
					getKeyboardNavigationLabel: (element: SessionListItem) => {
						if (isSessionGroupItem(element)) {
							return element.comparison?.title ?? element.group.name;
						}
						if (isSessionSection(element)) {
							return element.label;
						}
						if (isSessionShowMore(element)) {
							return element.sectionLabel;
						}
						if (isSessionPlaceholder(element)) {
							return element.label;
						}
						if (isSessionChatItem(element)) {
							return getChatTitle(element.chat);
						}
						return getSessionKeyboardNavigationLabels(element);
					}
				},
				overrideStyles: this.options.overrideStyles,
				renderIndentGuides: RenderIndentGuides.None,
				twistieAdditionalCssClass: element => isSessionItem(element) && this.getRenderedSessionListChats(element).length > 0
					? 'session-chat-twistie'
					: 'force-no-twistie',
			}
		));
		const focusedChatItemContext = SessionsListFocusedChatItemContext.bindTo(this.tree.contextKeyService);
		this.focusedChatCanMoveUpContext = SessionChatItemCanMoveUpContext.bindTo(this.tree.contextKeyService);
		this.focusedChatCanMoveDownContext = SessionChatItemCanMoveDownContext.bindTo(this.tree.contextKeyService);
		this.tree.updateOptions({ indent: 0, defaultIndent: 0, expandOnDoubleClick: false });
		this.stickyShowMoreContainer = DOM.append(this.listContainer, $('.sessions-list-sticky-show-more'));
		this.stickyShowMoreContainer.hidden = true;
		this.stickyShowMoreButton = this._register(new Button(this.stickyShowMoreContainer, getButtonStyles({
			buttonBackground: undefined,
			buttonHoverBackground: undefined,
			buttonForeground: undefined,
			buttonBorder: undefined,
		})));
		this.stickyShowMoreLabel = showMoreRenderer.renderTemplate(this.stickyShowMoreButton.element);
		this._register(this.stickyShowMoreButton.onDidClick(() => {
			const item = this.stickyShowMoreItem;
			if (!item) {
				return;
			}
			const parent = this.tree.getParentElement(item);
			const reference = parent && isSessionGroupItem(parent) ? { group: parent.group.id }
				: parent && isSessionSection(parent) ? { section: parent.id } : undefined;
			const scrollTop = this.tree.scrollTop;
			this.toggleShowMore(item);
			const header = reference && this.findItem(reference);
			if (header && item.mode === 'less') {
				this.tree.setFocus([header]);
				this.tree.reveal(header);
			}
			this.tree.domFocus();
			if (item.mode === 'more') {
				this.tree.scrollTop = scrollTop;
			}
		}));
		this._register(this.stickyShowMoreButton.onDidEscape(() => this.tree.domFocus()));
		this._register(this.tree.onDidScroll(() => this.updateStickyShowMore()));
		this._register(this.tree.onDidChangeContentHeight(() => this.updateStickyShowMore()));
		this._register(this.tree.onDidChangeFocus(e => {
			const element = e.elements[0];
			if (element && e.browserEvent && DOM.isKeyboardEvent(e.browserEvent)) {
				this.revealAboveStickyShowMore(element);
			}
		}));
		if (this.options.onDidScroll) {
			this._register(this.tree.onDidScroll(() => this.options.onDidScroll?.()));
		}

		// Hierarchy guides: resolve any row (a session or one of its chats) to
		// the session whose guides it belongs to, so hovering/selecting/focusing
		// a chat child reveals only its own parent's guides, never an unrelated
		// session's.
		const guideOwnerSessionId = (element: SessionListItem | null): string | undefined => {
			if (element && isSessionItem(element)) {
				return element.sessionId;
			}
			if (element && isSessionChatItem(element) && !element.standalone) {
				return element.session.sessionId;
			}
			return undefined;
		};
		const guideOwnerSessionIds = (elements: readonly (SessionListItem | null)[]): Set<string> => {
			const ids = new Set<string>();
			for (const element of elements) {
				const id = guideOwnerSessionId(element);
				if (id) {
					ids.add(id);
				}
			}
			return ids;
		};
		this._register(this.tree.onMouseOver(e => {
			this.hoveredGuideSessionId.set(guideOwnerSessionId(e.element), undefined);
		}));
		this._register(this.tree.onMouseOut(e => {
			// Only clear if the pointer left the row that set the hover, i.e. no
			// unrelated `mouseout` (e.g. bubbling from a child element within the
			// same row) resets a hover another row's `mouseover` just established.
			if (guideOwnerSessionId(e.element) === this.hoveredGuideSessionId.get()) {
				this.hoveredGuideSessionId.set(undefined, undefined);
			}
		}));
		this._register(this.tree.onMouseClick(e => {
			if (e.element && isSessionGroupItem(e.element) && e.element.comparison && e.browserEvent.button === 0) {
				this.commandService.executeCommand(OPEN_SESSION_COMPARISON_COMMAND_ID, e.element.comparison.id);
			}
		}));
		this._register(this.tree.onDidChangeSelection(() => {
			this.selectedGuideSessionIds.set(guideOwnerSessionIds(this.tree.getSelection()), undefined);
		}));
		const updateFocusedGuideSessionIds = () => {
			this.focusedGuideSessionIds.set(guideOwnerSessionIds(this.tree.getFocus()), undefined);
			focusedChatItemContext.set(DOM.isAncestorOfActiveElement(this.listContainer) && this.tree.getFocus().some(item => !!item && isSessionChatItem(item)));
			this.updateFocusedChatMoveContexts();
		};
		this._register(this.tree.onDidChangeFocus(updateFocusedGuideSessionIds));
		this._register(this.tree.onDidFocus(updateFocusedGuideSessionIds));
		this._register(this.tree.onDidBlur(() => {
			this.focusedGuideSessionIds.set(EMPTY_GUIDE_SESSION_IDS, undefined);
			focusedChatItemContext.reset();
			this.focusedChatCanMoveUpContext.reset();
			this.focusedChatCanMoveDownContext.reset();
		}));

		this._register(this.tree.onDidOpen(async e => {
			const element = e.element;
			if (!element) {
				return;
			}
			if (isSessionSection(element) && element.id === AUTOMATIONS_SECTION_ID) {
				await this.commandService.executeCommand('sessionsView.manageAutomations');
				return;
			}
			if (isSessionShowMore(element)) {
				this.toggleShowMore(element);
				return;
			}
			if (isSessionPlaceholder(element)) {
				return;
			}
			if (isSessionChatItem(element)) {
				const isLeftClick = DOM.isMouseEvent(e.browserEvent) && e.browserEvent.button === 0;
				const preserveFocus = isLeftClick ? false : (e.editorOptions.preserveFocus ?? false);
				await this.beginOpenRequest(element.session, element.chat, preserveFocus, e.sideBySide);
				return;
			}
			if (isSessionGroupItem(element) && element.comparison) {
				if (!DOM.isMouseEvent(e.browserEvent) || e.browserEvent.button !== 0) {
					this.commandService.executeCommand(OPEN_SESSION_COMPARISON_COMMAND_ID, element.comparison.id);
				}
				return;
			}
			if (!isSessionSection(element) && !isSessionGroupItem(element)) {
				// Gate the open on workspace trust before any side effect (mark-read,
				// activation, folder mount). A refused open leaves the current
				// session (or empty new-session slot) untouched.
				// A deliberate left mouse click on a session should move keyboard
				// focus into the chat input so the user can start typing right
				// away. A single click always reports `preserveFocus: true`, so
				// detect the mouse click explicitly. Keyboard navigation keeps
				// `preserveFocus` as reported so browsing the list never steals
				// focus from it.
				const isLeftClick = DOM.isMouseEvent(e.browserEvent) && e.browserEvent.button === 0;
				const preserveFocus = isLeftClick ? false : (e.editorOptions.preserveFocus ?? false);
				if (!await this.beginOpenRequest(element, undefined, preserveFocus, e.sideBySide)) {
					return;
				}
				// If this session has an unheard voice response, opening it may not
				// change the active-session observable (it can already be the active
				// session, just not focused), so the voice controller would never
				// re-activate it. Ask it to narrate the pending item explicitly.
				if (this._listVoicePlaybackService.hasPendingResponse(element.resource)) {
					this.commandService.executeCommand('_chat.voice.activateSession', element.resource.toString());
				}
			}
		}));

		this._register(sessionRenderer.onDidChangeItemHeight(session => {
			if (this.tree.hasElement(session)) {
				this.tree.updateElementHeight(session, delegate.getHeight(session));
			}
		}));

		this._register(chatRenderer.onDidChangeItemHeight(chatItem => {
			if (this.tree.hasElement(chatItem)) {
				this.tree.updateElementHeight(chatItem, delegate.getHeight(chatItem));
			}
		}));

		// React to phone <-> desktop viewport transitions: refresh heights
		// for all known sessions so the virtual list reserves the correct
		// space for the new layout. Iterates `this.sessions` (all known
		// sessions) — a phone/desktop transition is a rare event so the
		// extra work over filtered-out sessions is negligible. Relies on
		// the `IsPhoneLayoutContext` reactive signal already maintained by
		// the agents workbench.
		const phoneKeys = new Set<string>([IsPhoneLayoutContext.key]);
		const automationKeys = new Set<string>([ChatAutomationsEnabledContext.key]);
		this._register(this.contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(automationKeys)) {
				this.update();
			}
			if (!e.affectsSome(phoneKeys)) {
				return;
			}
			this.setCompact();
		}));

		this._register(this.tree.onContextMenu(e => this.onContextMenu(e)));

		this._register(this.tree.onDidChangeCollapseState(e => {
			const element = e.node.element;
			if (element && isSessionGroupItem(element)) {
				this._groupRenderer.updateCollapseState(element, e.node.collapsed);
				if (!this.suspendCollapseStatePersistence) {
					this.saveSectionCollapseState(getSessionGroupSectionId(element.group.id), e.node.collapsed);
				}
			} else if (element && isSessionSection(element)) {
				sectionRenderer.updateCollapseState(element, e.node.collapsed);
				if (!this.suspendCollapseStatePersistence) {
					this.saveSectionCollapseState(element.collapseStateId ?? element.id, e.node.collapsed);
				}
			} else if (element && isSessionItem(element)) {
				this.syncCollapsedSessionIds();
				if (!this.suspendCollapseStatePersistence) {
					this.saveSessionCollapseState(element, e.node.collapsed);
				}
			}
			this.updateStickyShowMore();
		}));

		let isFindOpen = false;
		let findPattern = '';
		const updateFindPatternState = () => {
			const hasFindPattern = isFindOpen && findPattern.length > 0;
			if (hasFindPattern !== this.hasFindPattern) {
				this.hasFindPattern = hasFindPattern;
				this.update();
			}
		};

		this._register(this.tree.onDidChangeFindOpenState(open => {
			isFindOpen = open;
			this.findOpen.set(open, undefined);
			this._onDidChangeFindOpenState.fire(open);
			updateFindPatternState();
		}));

		// Only treat the find as "active" for layout purposes (bypassing workspace
		// capping and per-group limits) once the user has actually typed a pattern
		// and the find widget is open. Opening the empty find widget should not
		// reorder the list, and closing find should restore the capped layout.
		this._register(this.tree.onDidChangeFindPattern(pattern => {
			findPattern = pattern;
			updateFindPatternState();
		}));

		this._register(this._sessionsManagementService.onDidChangeSessions(e => {
			if (this.visible) {
				// Move and reveal operations depend on concrete deltas being rendered synchronously.
				if (e.added.length || e.removed.length || e.changed.length) {
					this.refresh();
				} else {
					this.scheduleListUpdate(true);
				}
			}
			// A removed session may have been the last one in its workspace.
			// Garbage-collect manual order / promotion entries for identities
			// that no longer exist. This runs only on removals (never on
			// additions or the initial load) so that asynchronous session
			// loading on a window reload can never prune the user's manual
			// ordering of workspaces relative to groups before their sessions
			// have loaded.
			if (e.removed.length > 0) {
				this._sessionSectionOrderService.retain(this.liveSectionOrderIds());
			}
		}));

		this._register(this._sessionsListModelService.onDidChange(() => {
			if (this.visible) {
				this.update();
			}
		}));

		this._register(this._sessionGroupsService.onDidChange(e => {
			if (this.visible) {
				this.update();
			}
			// Garbage-collect manual order / promotion entries when groups are
			// deleted or nested, since the order only keeps top-level headers.
			// Group changes are user-driven and happen after sessions have
			// loaded, so pruning here is safe (unlike at render time during the
			// asynchronous initial load).
			if (e.groupsChanged) {
				this._sessionSectionOrderService.retain(this.liveSectionOrderIds());
			}
		}));

		this._register(this._sessionSectionOrderService.onDidChange(() => {
			if (this.visible) {
				this.update();
			}
		}));

		this._register(this._agentHostFilterService.onDidChange(() => {
			if (this.visible) {
				this.scheduleListUpdate();
			}
		}));
		this._register(this.filters.onDidChange(() => this.update()));

		// Re-render when the active session changes.
		this._register(autorun(reader => {
			const activeSession = this._sessionsService.activeSession.read(reader);
			activeSession?.activeChat.read(reader);
			this.activeSessionUpdate.value = DOM.scheduleAtNextAnimationFrame(DOM.getWindow(this.listContainer), () => {
				if (this.visible) {
					this.update();
					this.syncActiveChatSelection(activeSession);
				}
			});
		}));

		// Resolve the per-group session limit from the experiment service and
		// keep it current when treatments are refetched. The async fetch is
		// confined to `updateSessionGroupLimit`; the rest of the list reads the
		// resolved value synchronously off `sessionGroupLimit`. The autorun runs
		// immediately for the initial fetch and again whenever treatments refetch.
		const assignmentRefetchSignal = observableSignalFromEvent(this, this.assignmentService.onDidRefetchAssignments);
		this._register(autorun(reader => {
			assignmentRefetchSignal.read(reader);
			this.updateSessionGroupLimit();
		}));

		this.refresh();
		this.syncActiveChatSelection(this._sessionsService.activeSession.get());
	}

	/**
	 * Fetches the session group limit treatment and updates the backing
	 * observable. Invalid or unset treatments fall back to the default limit.
	 */
	private updateSessionGroupLimit(): void {
		this.assignmentService.getTreatment<number>(SessionsList.SESSION_GROUP_LIMIT_TREATMENT).then(value => {
			const limit = typeof value === 'number' && Number.isInteger(value) && value > 0
				? value
				: SessionsList.DEFAULT_SESSION_GROUP_LIMIT;
			if (this.sessionGroupLimit.get() !== limit) {
				this.sessionGroupLimit.set(limit, undefined);
				if (this.visible) {
					this.update();
				}
			}
		});
	}

	private scheduleListUpdate(refresh = false): void {
		this.refreshPending ||= refresh;
		if (!this.pendingListUpdate.value) {
			this.pendingListUpdate.value = DOM.scheduleAtNextAnimationFrame(DOM.getWindow(this.listContainer), () => {
				this.pendingListUpdate.clear();
				if (this.visible) {
					if (this.refreshPending) {
						this.refresh();
					} else {
						this.update();
					}
				}
			});
		}
	}

	refresh(): void {
		this.refreshPending = true;
		this.update();
	}

	private refreshSessions(): void {
		this.sessions = this._sessionsManagementService.getSessions();
		this.sessionChatsUpdate.clear();
		let initialized = false;
		this.sessionChatsObserver.value = autorun(reader => {
			for (const session of this.sessions) {
				getSessionListChats(session, reader, !this._excludeArchived);
				session.isExternal?.read(reader);
				session.application.read(reader);
			}
			if (initialized && this.visible) {
				this.sessionChatsUpdate.value = DOM.scheduleAtNextAnimationFrame(DOM.getWindow(this.listContainer), () => {
					if (this.visible) {
						this.update();
					}
				});
			}
			initialized = true;
		});
		this.automationSessions.set(this.sessions, undefined);
		for (const session of this.sessions) {
			this._sessionsListModelService.migrateLegacyReadState(session);
		}
	}

	update(expandAll?: boolean): void {
		this.pendingListUpdate.clear();
		if (this.refreshPending) {
			this.refreshPending = false;
			this.refreshSessions();
		}
		const activeSession = this._sessionsService.activeSession.get();
		const onboardingSession = this.onboardingTarget.get()?.session;
		const nextNestedSessionResources = new Set(
			this.sessions
				.filter(session => getSessionListChats(session).length > 0)
				.map(session => session.resource.toString())
		);

		// Scope to the selected host's providers; an empty set (a declared
		// group with no members yet) matches nothing rather than everything.
		let filtered = this.sessions.filter(session => !isAutomationSession(session));
		const scopedProviderIds = this._agentHostFilterService.selectedHost?.providerIds;
		if (scopedProviderIds) {
			const scoped = new Set(scopedProviderIds);
			filtered = filtered.filter(s => scoped.has(s.providerId));
		}
		filtered = filtered.filter(session => this.filters.matches(session));
		// The default only changes what the list shows for archived content that the other filters keep.
		if (this._excludeArchivedIsDefault && filtered.some(session => hasArchivedListContent(session))) {
			logSettingExperimentTrigger(this.telemetryService, SESSIONS_LIST_SHOW_ARCHIVED_BY_DEFAULT_SETTING);
		}
		if (this._excludeArchived) {
			filtered = filtered.filter(s => !s.isArchived.get());
		}

		// Keep the active user-facing session visible even when another filter excludes it.
		for (const revealedSession of [activeSession, onboardingSession]) {
			if (revealedSession && !filtered.some(s => s.sessionId === revealedSession.sessionId)) {
				const match = this.sessions.find(s => s.sessionId === revealedSession.sessionId && !isAutomationSession(s));
				if (match) {
					filtered = [...filtered, match];
				}
			}
		}
		filtered = filtered.filter(session => {
			const comparison = this.sessionComparisonService.getComparisonForSession(session.resource);
			return !comparison || !isComparisonLaunchPending(comparison);
		});

		const grouping = this.options.grouping();
		const sorting = this.options.sorting();
		const sortKeyForGrouping = (s: ISession, srt: SessionsSorting) => this._sessionsListModelService.getSortKey(s, sortingToMode(srt));

		// Pull regular (non-pinned, non-archived) grouped sessions out of the
		// normal date/workspace sectioning so they render under their group.
		// Pinned and archived sessions keep their precedence and stay in their
		// sections even when they belong to a group (their membership is
		// retained so they return to the group once unpinned/restored).
		const groupedMembers = new Map<string, ISession[]>();
		const groupedRegularIds = new Set<string>();
		for (const s of filtered) {
			const group = this.getRenderedSessionGroup(s);
			if (group) {
				let members = groupedMembers.get(group.id);
				if (!members) {
					members = [];
					groupedMembers.set(group.id, members);
				}
				members.push(s);
				groupedRegularIds.add(s.sessionId);
			}
		}
		const forSections = groupedRegularIds.size > 0 ? filtered.filter(s => !groupedRegularIds.has(s.sessionId)) : filtered;
		if (forSections.some(session => session.isExternal?.get() && !session.isArchived.get() && !this.isSessionPinned(session))) {
			logSettingExperimentTrigger(this.telemetryService, SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING);
		}

		const groupTree = this._sessionGroupsService.getTree();
		const topLevelGroups = groupTree.getSubgroups(undefined);
		const groups = topLevelGroups.flatMap(group => groupTree.getSubtree(group.id));
		const comparisonsByGroupId = new Map(this.sessionComparisonService.comparisons.get().map(comparison => [comparison.groupId, comparison]));
		const sortedMembersByGroupId = new Map<string, ISession[]>(groups.map(group => {
			const members = groupedMembers.get(group.id) ?? [];
			const comparison = comparisonsByGroupId.get(group.id);
			return [group.id, comparison
				? sortComparisonGroupMembers(comparison, members, sorting, sortKeyForGrouping)
				: sortSessions(members, sorting, sortKeyForGrouping)];
		}));
		this.renderedComparisonAttemptConnectorPositions.clear();
		this.renderedComparisonAttemptLabels.clear();
		this.comparisonSectionIds.clear();
		this.groupDepths.clear();
		const topLevelGroupIds = topLevelGroups.map(group => getSessionGroupSectionId(group.id));

		const archivedSectionLabel = getChatSessionArchivedSectionLabel(getChatSessionArchiveActionWording(this.configurationService));
		const environments = grouping === SessionsGrouping.Environment
			? getSessionEnvironments(this._sessionsProvidersService.getProviders().map(provider => provider.environment))
			: [];
		const sections = groupSessionsForList(forSections, grouping, sorting, session => this.isSessionPinned(session), (s, srt) => this._sessionsListModelService.getSortKey(s, sortingToMode(srt)), archivedSectionLabel, this.groupExternalSessions, environments);

		// When done items are shown, the done chats of a session that is not done
		// are listed in the Done section as rows of their own instead of under
		// their session's row.
		const standaloneDoneChats = this._excludeArchived ? [] : filtered.flatMap(session => getSessionDoneListChats(session).map(chat => ({ session, chat })));
		if (standaloneDoneChats.length > 0 && !sections.some(s => s.id === 'archived')) {
			sections.push({ id: 'archived', label: archivedSectionLabel, sessions: [] });
		}
		const comparisonGroupsBySectionId = new Map<string, ISessionGroup[]>();
		if (grouping !== SessionsGrouping.Date) {
			let addedRepositorySection = false;
			for (const group of groups) {
				const comparison = comparisonsByGroupId.get(group.id);
				if (!comparison) {
					continue;
				}
				const comparisonSessions = getComparisonSessions(comparison, this._sessionsManagementService);
				const environmentId = grouping === SessionsGrouping.Environment
					? comparisonSessions[0]?.environment
					?? comparison.participants.map(participant => this._sessionsProvidersService.getProvider(participant.harness.providerId)?.environment.id).find(isDefined)
					: undefined;
				const environment = environmentId ? environments.find(environment => environment.id === environmentId) ?? { id: environmentId, label: environmentId } : undefined;
				if (grouping === SessionsGrouping.Environment && comparison.workspace && !environment) {
					continue;
				}
				const repository = grouping === SessionsGrouping.Repository && comparison.workspace
					? comparisonSessions.map(getSessionRepository).find(isDefined)
					: undefined;
				const workspaceLabel = comparison.workspace
					? comparisonSessions.map(sessionWorkspaceLabel).find(label => label !== localize('unknown', "Unknown"))
					?? this.labelService.getWorkspaceLabel(comparison.workspace)
					: localize('chatsSection', "Chats");
				const sectionId = !comparison.workspace ? QUICK_CHATS_SECTION_ID : environment ? `${ENVIRONMENT_SECTION_PREFIX}${environment.id}` : repository ? getRepositorySectionId(repository) : `workspace:${workspaceLabel}`;
				this.comparisonSectionIds.set(group.id, sectionId);
				let workspaceGroups = comparisonGroupsBySectionId.get(sectionId);
				if (!workspaceGroups) {
					workspaceGroups = [];
					comparisonGroupsBySectionId.set(sectionId, workspaceGroups);
				}
				workspaceGroups.push(group);
				let workspaceSection = sections.find(section => section.id === sectionId);
				if (!workspaceSection) {
					workspaceSection = environment && comparison.workspace
						? { id: sectionId, label: environment.label, environment, sessions: [] }
						: repository
							? { id: sectionId, label: repository.name, repository, sessions: [] }
							: {
								id: sectionId,
								collapseStateId: comparison.workspace ? `workspace:${comparison.workspace.toString()}` : QUICK_CHATS_SECTION_ID,
								label: workspaceLabel,
								sessions: [],
							};
					sections.push(workspaceSection);
					addedRepositorySection ||= !!repository;
				}
				const existingSessionIds = new Set(workspaceSection.sessions.map(session => session.sessionId));
				workspaceSection.sessions.push(...sortedMembersByGroupId.get(group.id)!.filter(session => !existingSessionIds.has(session.sessionId)));
			}
			if (addedRepositorySection) {
				labelRepositorySections(sections);
			}
		}

		const sectionById = new Map(sections.map(section => [this.getSectionGroupKey(section.id), section]));
		const nestedSectionsByGroup = new Map<string, ISessionSection[]>();
		for (const section of sections) {
			const parentId = this.getSectionParentId(section.id);
			if (parentId !== undefined) {
				const siblings = nestedSectionsByGroup.get(parentId) ?? [];
				siblings.push(section);
				nestedSectionsByGroup.set(parentId, siblings);
			}
		}
		const groupItemsById = new Map<string, ISessionGroupItem>();
		const buildGroupItem = (group: ISessionGroup, depth: number): ISessionGroupItem => {
			const comparisonSectionId = this.comparisonSectionIds.get(group.id);
			const comparisonParentId = comparisonSectionId ? this.getSectionParentId(comparisonSectionId) : undefined;
			if (comparisonParentId !== undefined) {
				depth = groupTree.getPath(comparisonParentId).length;
			}
			const subgroups = groupTree.getSubgroups(group.id).map(subgroup => buildGroupItem(subgroup, depth + 1));
			const members = sortedMembersByGroupId.get(group.id)!;
			const comparison = comparisonsByGroupId.get(group.id);
			if (comparison) {
				for (const participant of comparison.participants) {
					if (participant.role !== SessionComparisonParticipantRole.Attempt) {
						continue;
					}
					const session = participant.sessionResource
						? members.find(member => isEqual(member.resource, participant.sessionResource))
						: undefined;
					if (session) {
						this.renderedComparisonAttemptLabels.set(session.sessionId, getSessionComparisonHarnessLabel(participant));
					}
				}
			}
			const item: ISessionGroupItem = {
				group,
				depth,
				sessions: members,
				subtreeSessions: [
					...members,
					...subgroups.flatMap(subgroup => subgroup.subtreeSessions),
					...(nestedSectionsByGroup.get(group.id) ?? []).flatMap(section => section.sessions),
				],
				isEmpty: subgroups.length === 0
					&& this._sessionGroupsService.getSessionIdsInGroup(group.id).length === 0
					&& this._sessionGroupsService.getSectionIdsInGroup(group.id).length === 0,
				editing: group.id === this._editingGroupId,
				comparison: comparison ? {
					id: comparison.id,
					title: comparison.title,
					launching: comparison.launching === true,
					summary: reader => getComparisonGroupSummary(comparison, this.sessions, reader),
				} : undefined,
			};
			this.groupDepths.set(group.id, depth);
			groupItemsById.set(group.id, item);
			return item;
		};
		for (const group of topLevelGroups) {
			buildGroupItem(group, 0);
		}

		const hasRecentSessions = sections.some(s => s.id === 'recent' && s.sessions.length > 0);

		// Keep the "Chats" default section visible even when empty so it stays
		// discoverable, unless the user opts out via the setting. The
		// "Pinned" section is only shown when it actually has pinned sessions.
		const showEmptyDefaultGroups = this.configurationService.getValue<boolean>(SESSIONS_LIST_SHOW_EMPTY_DEFAULT_GROUPS_SETTING);

		// Keep the "Chats" section always visible (even with no quick chats) so its
		// header — leading chat icon, label, and the "+" create action — is always
		// reachable. Only when a provider can actually serve quick chats.
		if (showEmptyDefaultGroups && this._someProviderSupportsQuickChats() && !sections.some(s => s.id === QUICK_CHATS_SECTION_ID)) {
			sections.push({ id: QUICK_CHATS_SECTION_ID, label: localize('chatsSection', "Chats"), sessions: [] });
		}

		// Partition grouping sections into "primary" (meets criteria) and "more". An active
		// find pattern bypasses partitioning so all matching sessions are visible.
		// When the user has chosen "Show All Sessions" (uncapped), show every
		// section inline instead of hiding some behind a "+N more" entry.
		const partitionFolders = grouping !== SessionsGrouping.Date && !this.hasFindPattern && this.workspaceGroupCapped;
		const moreFolderSectionIds = new Set<string>();
		if (partitionFolders) {
			const workspaceSections = sections.filter(s => isSessionGroupingSection(s.id) && this.getSectionParentId(s.id) === undefined);
			if (workspaceSections.length > 0) {
				const now = Date.now();
				const isRecent = (section: ISessionSection) =>
					section.sessions.some(s => s.updatedAt.get().getTime() >= now - FOUR_DAYS_MS);
				const isOpenWindow = (section: ISessionSection) =>
					!!this.openWindowSourceFolder && section.sessions.some(s => sessionMatchesFolder(s, this.openWindowSourceFolder!));
				const meetsCriteria = (section: ISessionSection) => comparisonGroupsBySectionId.has(section.id) || isRecent(section) || isOpenWindow(section);

				let anyMeets = false;
				for (const section of workspaceSections) {
					if (meetsCriteria(section)) {
						anyMeets = true;
						break;
					}
				}

				let fallbackId: string | undefined;
				if (!anyMeets) {
					// Criterion 3: pick the folder with the most recently updated session.
					let bestTime = -Infinity;
					for (const section of workspaceSections) {
						for (const s of section.sessions) {
							const t = s.updatedAt.get().getTime();
							if (t > bestTime) {
								bestTime = t;
								fallbackId = section.id;
							}
						}
					}
				}

				for (const section of workspaceSections) {
					if (!meetsCriteria(section) && section.id !== fallbackId && !this._sessionSectionOrderService.isPromoted(section.id) && !section.sessions.some(session => session.sessionId === onboardingSession?.sessionId)) {
						moreFolderSectionIds.add(section.id);
					}
				}
			}
		}

		const children: IObjectTreeElement<SessionListItem>[] = [];

		const sessionGroupLimit = this.sessionGroupLimit.get();
		const sessionGroupExpansion = this.loadSessionGroupExpansion();

		const toSessionChildren = (sessions: readonly ISession[]): IObjectTreeElement<SessionListItem>[] =>
			sessions.map(session => {
				const chats = sortSessionListChats(this.getRenderedSessionListChats(session), sorting);
				const resource = session.resource.toString();
				const wasNested = this.nestedSessionResources.has(resource);
				const persistedCollapsed = this.collapsedSessionResources.has(resource);
				return {
					element: session as SessionListItem,
					collapsible: chats.length > 0,
					collapsed: wasNested
						? persistedCollapsed
							? ObjectTreeElementCollapseState.PreserveOrCollapsed
							: ObjectTreeElementCollapseState.PreserveOrExpanded
						: persistedCollapsed
							? ObjectTreeElementCollapseState.Collapsed
							: ObjectTreeElementCollapseState.Expanded,
					children: chats.length > 0
						? chats.map((chat, index) => ({ element: new SessionChatItem(session, chat, index === chats.length - 1) }))
						: undefined,
				};
			});

		/**
		 * Renders a section's session rows. A capped section (`cap`) lists all of its
		 * sessions or only the first ones, following the user's last show more/show less
		 * choice saved under `cap.stateId`, or else `cap.expandedByDefault`.
		 */
		const renderSessionChildren = (sessions: readonly ISession[], sectionId: string, sectionLabel: string, cap: { readonly stateId: string; readonly expandedByDefault: boolean } | undefined): IObjectTreeElement<SessionListItem>[] => {
			const limited = limitSessionsForList(sessions, sessionGroupLimit, {
				enabled: cap !== undefined,
				expanded: cap !== undefined && (sessionGroupExpansion.get(cap.stateId) ?? cap.expandedByDefault),
				sectionId,
				stateId: cap?.stateId,
				sectionLabel,
				revealSessionId: onboardingSession?.sessionId,
			});
			const children = sectionId === 'archived' && standaloneDoneChats.length > 0
				? this.toDoneSectionChildren(limited.sessions, standaloneDoneChats, sorting, toSessionChildren)
				: toSessionChildren(limited.sessions);
			if (limited.showMore) {
				children.push({ element: limited.showMore });
			}
			return children;
		};

		const renderSection = (section: ISessionSection, renderedSessions: readonly ISession[] = section.sessions): IObjectTreeElement<SessionListItem> => {
			if (isShortcutSection(section.id)) {
				return {
					element: section as SessionListItem,
					children: [],
					collapsible: false,
				};
			}

			const isWorkspaceGroup = grouping !== SessionsGrouping.Date
				&& isSessionGroupingSection(section.id);
			const limitSessions = isWorkspaceGroup
				&& !this.hasFindPattern
				&& this.workspaceGroupCapped;
			let sectionChildren = renderSessionChildren(renderedSessions, section.id, section.label, limitSessions
				? { stateId: section.collapseStateId ?? section.id, expandedByDefault: false }
				: undefined);

			// The always-visible "Chats" section shows a muted placeholder row
			// when it has no sessions yet.
			if (section.id === QUICK_CHATS_SECTION_ID && section.sessions.length === 0) {
				sectionChildren = [{ element: { placeholder: true as const, sectionId: section.id, label: localize('noChats', "No chats") } }];
			}

			// Default collapse state for older time sections
			let defaultCollapsed: boolean | ObjectTreeElementCollapseState = ObjectTreeElementCollapseState.PreserveOrExpanded;
			if (grouping === SessionsGrouping.Date && hasRecentSessions) {
				const olderSections = ['older', 'archived'];
				if (olderSections.includes(section.id)) {
					defaultCollapsed = ObjectTreeElementCollapseState.PreserveOrCollapsed;
				}
			}
			if (section.id === 'archived') {
				defaultCollapsed = ObjectTreeElementCollapseState.PreserveOrCollapsed;
			}

			// The "Pinned" and "Chats" sections start collapsed on first open; the
			// user's later choice is persisted and honored via getSavedCollapseState.
			if (section.id === 'pinned' || section.id === QUICK_CHATS_SECTION_ID) {
				defaultCollapsed = ObjectTreeElementCollapseState.PreserveOrCollapsed;
			}

			return {
				element: section as SessionListItem,
				collapsible: true,
				collapsed: this.getSavedCollapseState(section.collapseStateId ?? section.id, section.collapseStateId ? section.id : undefined) ?? defaultCollapsed,
				children: sectionChildren,
			};
		};

		const renderGroup = (groupItem: ISessionGroupItem): IObjectTreeElement<SessionListItem> => {
			const sectionId = getSessionGroupSectionId(groupItem.group.id);
			// Subgroups always render above the group's own sessions.
			const subgroupChildren = this._sessionGroupsService.getChildIds(groupItem.group.id).flatMap(id => {
				const subgroup = groupItemsById.get(id);
				if (subgroup) {
					return [renderGroup(subgroup)];
				}
				const section = sectionById.get(id);
				return section && this.getSectionParentId(section.id) === groupItem.group.id ? [renderWorkspaceSection(section)] : [];
			});
			const sessionChildren: IObjectTreeElement<SessionListItem>[] = groupItem.sessions.length === 0
				? subgroupChildren.length === 0
					? [{
						element: {
							placeholder: true as const,
							sectionId,
							label: localize('noSessionInGroup', "No session"),
							hover: localize('noSessionInGroupHover', "Use Add to Group from a session's context menu, or drag it into this group."),
						}
					}]
					: []
				: renderSessionChildren(groupItem.sessions, sectionId, groupItem.group.name, !this.hasFindPattern && this.workspaceGroupCapped
					// Custom groups list all of their sessions until the user chooses "Show less".
					? { stateId: sectionId, expandedByDefault: true }
					: undefined);
			const visibleGroupSessions = sessionChildren.map(child => child.element).filter(isSessionItem);
			const connectorSessions = groupItem.comparison
				? visibleGroupSessions.filter(session => this.renderedComparisonAttemptLabels.has(session.sessionId))
				: [];
			if (connectorSessions.length > 1) {
				for (let index = 0; index < connectorSessions.length; index++) {
					this.renderedComparisonAttemptConnectorPositions.set(
						connectorSessions[index].sessionId,
						index === 0 ? 'first' : index === connectorSessions.length - 1 ? 'last' : 'middle',
					);
				}
			}
			return {
				element: groupItem,
				collapsible: true,
				collapsed: this.getSavedCollapseState(sectionId) ?? ObjectTreeElementCollapseState.PreserveOrExpanded,
				children: [...subgroupChildren, ...sessionChildren],
			};
		};

		const renderWorkspaceSection = (section: ISessionSection): IObjectTreeElement<SessionListItem> => {
			const comparisonGroups = comparisonGroupsBySectionId.get(section.id)?.map(group => groupItemsById.get(group.id)!);
			if (!comparisonGroups) {
				return renderSection(section);
			}
			const comparisonSessionIds = new Set(comparisonGroups.flatMap(group => group.sessions.map(session => session.sessionId)));
			const renderedSection = renderSection(section, section.sessions.filter(session => !comparisonSessionIds.has(session.sessionId)));
			return {
				...renderedSection,
				children: [
					...comparisonGroups.map(renderGroup),
					...(renderedSection.children ?? []),
				],
			};
		};

		const navigationSections: ISessionSection[] = [];
		const showNavigationShortcuts = this.options.showNavigationShortcuts?.() === true;
		if (showNavigationShortcuts) {
			navigationSections.push({ id: NEW_SESSION_SECTION_ID, label: localize('newSession', "New Session"), sessions: [] });
		}
		if (this.contextKeyService.getContextKeyValue<boolean>(ChatAutomationsEnabledContext.key)) {
			const automationsSection: ISessionSection = { id: AUTOMATIONS_SECTION_ID, label: localize('automations', "Automations"), sessions: [] };
			if (showNavigationShortcuts) {
				navigationSections.push(automationsSection);
			} else {
				children.push(renderSection(automationsSection));
			}
		}
		if (showNavigationShortcuts) {
			navigationSections.push({ id: CUSTOMIZATIONS_SECTION_ID, label: localize('customizations', "Customizations"), sessions: [] });
		}
		this.setNavigationSections(navigationSections);

		const pinnedSection = sections.find(s => s.id === 'pinned');
		if (pinnedSection) {
			children.push(renderSection(pinnedSection));
		}

		// Quick chats render as a single "Chats" entry directly below Pinned (above
		// the workspace/repository/date groups) in every grouping mode.
		const quickChatsSection = sections.find(s => s.id === QUICK_CHATS_SECTION_ID);
		if (quickChatsSection) {
			children.push(grouping !== SessionsGrouping.Date ? renderWorkspaceSection(quickChatsSection) : renderSection(quickChatsSection));
		}

		const renderGroupById = (groupId: string): void => {
			const groupItem = groupItemsById.get(groupId);
			if (groupItem) {
				children.push(renderGroup(groupItem));
			}
		};

		this.hiddenGroupingSections = [];
		if (grouping === SessionsGrouping.Date) {
			// Groups form a contiguous, fully user-ordered block right below the
			// Pinned section. They no longer interleave with the date sections by
			// recency and never mix into Today/Yesterday/etc. Pinned stays at the
			// top, Done (archived) stays at the bottom.
			this._topLevelOrder = topLevelGroupIds;
			for (const group of topLevelGroups) {
				renderGroupById(group.id);
			}
			for (const section of sections) {
				if (section.id === 'pinned' || section.id === 'archived' || section.id === QUICK_CHATS_SECTION_ID || section.id === EXTERNAL_SESSIONS_SECTION_ID) {
					continue;
				}
				children.push(renderSection(section));
			}
		} else {
			// Groups and primary grouping sections share one freely-reorderable, user-managed order
			// right below Pinned. Groups default above sections; sections default to
			// their alphabetical order. Pinned stays first, Done last, and hidden
			// ("+N more") sections are appended below the ordered block.
			const workspaceSections = sections.filter(s => isSessionGroupingSection(s.id) && this.getSectionParentId(s.id) === undefined);
			if (comparisonGroupsBySectionId.size > 0) {
				const unknownWorkspaceId = `workspace:${localize('unknown', "Unknown")}`;
				workspaceSections.sort((a, b) => a.environment && b.environment
					? compareSessionEnvironments(a.environment, b.environment)
					: Number(a.id === unknownWorkspaceId) - Number(b.id === unknownWorkspaceId) || a.label.localeCompare(b.label));
			}
			const sectionById = new Map(workspaceSections.map(s => [s.id, s] as const));
			const primaryWorkspaceIds = workspaceSections
				.filter(s => !moreFolderSectionIds.has(s.id))
				.map(s => s.id);

			const comparisonGroupIds = new Set(
				[...comparisonGroupsBySectionId.values()].flat()
					.map(group => getSessionGroupSectionId(group.id)),
			);
			const defaultOrder = [...topLevelGroupIds.filter(id => !comparisonGroupIds.has(id)), ...primaryWorkspaceIds];
			const resolvedIds = this._sessionSectionOrderService.resolveOrder(defaultOrder);
			this._topLevelOrder = resolvedIds;
			for (const id of resolvedIds) {
				const groupId = getSessionGroupIdOfSection(id);
				if (groupId !== undefined) {
					renderGroupById(groupId);
				} else {
					const section = sectionById.get(id);
					if (section) {
						children.push(renderWorkspaceSection(section));
					}
				}
			}

			const moreFolderSections = workspaceSections.filter(s => moreFolderSectionIds.has(s.id));
			if (moreFolderSections.length > 0) {
				const kind = grouping === SessionsGrouping.Environment ? 'environments' : grouping === SessionsGrouping.Repository ? 'repositories' : 'folders';
				if (this.expandedMoreFolders) {
					for (const section of moreFolderSections) {
						children.push(renderWorkspaceSection(section));
					}
					children.push({
						element: { showMore: true as const, kind, mode: 'less' as const, sectionId: SHOW_MORE_FOLDERS_LABEL, stateId: SHOW_MORE_FOLDERS_LABEL, sectionLabel: SHOW_MORE_FOLDERS_LABEL, remainingCount: 0 },
					});
				} else {
					this.hiddenGroupingSections = moreFolderSections;
					children.push({
						element: { showMore: true as const, kind, mode: 'more' as const, sectionId: SHOW_MORE_FOLDERS_LABEL, stateId: SHOW_MORE_FOLDERS_LABEL, sectionLabel: SHOW_MORE_FOLDERS_LABEL, remainingCount: moreFolderSections.length },
					});
				}
			}
		}

		const externalSection = sections.find(s => s.id === EXTERNAL_SESSIONS_SECTION_ID);
		if (externalSection) {
			children.push(renderSection(externalSection));
		}
		const archivedSection = sections.find(s => s.id === 'archived');
		if (archivedSection) {
			children.push(renderSection(archivedSection));
		}

		this.tree.setChildren(null, children);
		this.nestedSessionResources = nextNestedSessionResources;
		this.syncCollapsedSessionIds();
		this.reconcileChatRowHeights();
		this.tryPendingMoveReveal?.();
		this.updateFocusedChatMoveContexts();
		this.updateStickyShowMore();
		this._onDidUpdate.fire();
	}

	private toggleShowMore(element: ISessionShowMore): void {
		if (element.kind !== 'sessions') {
			this.expandedMoreFolders = element.mode === 'more';
		} else {
			this.saveSessionGroupExpanded(element.stateId, element.mode === 'more');
		}
		this.update();
	}

	private updateStickyShowMore(): void {
		const rowHeight = SessionsTreeDelegate.SHOW_MORE_HEIGHT + INSET_ROW_GAP;
		const lastVisible = this.tree.renderHeight > rowHeight * 2 && this.tree.firstVisibleElement !== undefined ? this.tree.lastVisibleElement : undefined;
		let item: ISessionShowMore | undefined;
		if (lastVisible && this.tree.hasElement(lastVisible)) {
			for (let element: SessionListItem | null = lastVisible; element; element = this.tree.getParentElement(element)) {
				const node = this.tree.getNode(element);
				if (node.collapsed || (!isSessionSection(element) && !isSessionGroupItem(element))) {
					continue;
				}
				const lastChild = node.children.at(-1)?.element;
				if (lastChild && isSessionShowMore(lastChild) && lastChild.kind === 'sessions') {
					const top = this.tree.getElementTop(lastChild);
					if (top !== undefined && top + rowHeight > this.tree.scrollTop + this.tree.renderHeight) {
						item = lastChild;
					}
					break;
				}
			}
		}
		if ((!item || item.stateId !== this.stickyShowMoreItem?.stateId) && DOM.isAncestorOfActiveElement(this.stickyShowMoreContainer)) {
			this.tree.domFocus();
		}
		this.stickyShowMoreItem = item;
		this.stickyShowMoreContainer.hidden = !item;
		if (item) {
			this.showMoreRenderer.renderElement(this.tree.getNode(item), 0, this.stickyShowMoreLabel);
			this.stickyShowMoreContainer.style.lineHeight = `${rowHeight}px`;
			this.stickyShowMoreButton.element.setAttribute('aria-label', item.mode === 'less'
				? localize('stickyShowLessAria', "Show fewer sessions in {0}", item.sectionLabel)
				: item.remainingCount === 1
					? localize('stickyShowMoreSessionAria', "Show {0} more session in {1}", item.remainingCount, item.sectionLabel)
					: localize('stickyShowMoreSessionsAria', "Show {0} more sessions in {1}", item.remainingCount, item.sectionLabel));
		}
	}

	private revealAboveStickyShowMore(element: SessionListItem): void {
		this.tree.reveal(element);
		if (this.stickyShowMoreContainer.hidden) {
			return;
		}
		const top = this.tree.getElementTop(element);
		const height = this._delegate.getHeight(element);
		const visibleHeight = this.tree.renderHeight - SessionsTreeDelegate.SHOW_MORE_HEIGHT - INSET_ROW_GAP;
		if (top !== undefined && height <= visibleHeight && top + height > this.tree.scrollTop + visibleHeight) {
			this.tree.scrollTop = top + height - visibleHeight;
		}
	}

	/**
	 * The chats listed under a session's regular row. Done chats are listed
	 * there only when the session itself is done; the done chats of a session
	 * that is not done are listed in the Done section instead.
	 */
	private getRenderedSessionListChats(session: ISession): readonly IChat[] {
		return getSessionListChats(session, undefined, !this._excludeArchived && session.isArchived.get());
	}

	/** The Done section's rows: its done sessions and the standalone done chats of sessions that are not done, newest first. */
	private toDoneSectionChildren(
		sessions: readonly ISession[],
		chats: readonly { readonly session: ISession; readonly chat: IChat }[],
		sorting: SessionsSorting,
		toSessionChildren: (sessions: readonly ISession[]) => IObjectTreeElement<SessionListItem>[],
	): IObjectTreeElement<SessionListItem>[] {
		const sessionChildren = toSessionChildren(sessions);
		const rows = [
			...sessions.map((session, index) => ({ time: this._sessionsListModelService.getSortKey(session, sortingToMode(sorting)), child: sessionChildren[index] })),
			...chats.map(({ session, chat }) => ({
				time: sorting === SessionsSorting.Updated ? chat.updatedAt.get()?.getTime() ?? chat.createdAt.getTime() : chat.createdAt.getTime(),
				child: { element: new SessionChatItem(session, chat, true, true) } satisfies IObjectTreeElement<SessionListItem>,
			})),
		];
		return rows.sort((a, b) => b.time - a.time).map(row => row.child);
	}

	private setNavigationSections(sections: readonly ISessionSection[]): void {
		if (!this.navigationList || !this.options.navigationContainer) {
			return;
		}
		if (sections.length === this.navigationSections.length && sections.every((section, index) => section.id === this.navigationSections[index].id)) {
			return;
		}

		const focusedSectionId = this.navigationList.getFocusedElements()[0]?.id;
		const hadDomFocus = DOM.isAncestorOfActiveElement(this.options.navigationContainer);
		this.navigationSections = sections;
		this.navigationList.splice(0, this.navigationList.length, sections);
		this.options.navigationContainer.classList.toggle('empty', sections.length === 0);
		this.layoutNavigation(this.options.navigationContainer.clientWidth);
		this.options.onDidChangeNavigationHeight?.();

		if (hadDomFocus && focusedSectionId) {
			const focusedIndex = sections.findIndex(section => section.id === focusedSectionId);
			if (focusedIndex >= 0) {
				this.navigationList.setFocus([focusedIndex]);
				this.navigationList.domFocus();
			}
		}
	}

	private layoutNavigation(width: number): void {
		this.navigationList?.layout(this.navigationSections.length * SESSION_SHORTCUT_ROW_HEIGHT, width);
	}

	private async openNavigationSection(section: ISessionSection | undefined, sideBySide: boolean): Promise<void> {
		if (!section || !this.navigationList) {
			return;
		}
		this.navigationList.setSelection([]);
		switch (section.id) {
			case NEW_SESSION_SECTION_ID:
				this._onDidActivateNewSession.fire();
				logSessionsInteraction(this.telemetryService, 'newSession', 'sidebar');
				await this.commandService.executeCommand(NEW_SESSION_ACTION_ID, sideBySide ? { toSide: true } : undefined);
				if (this.options.navigationContainer && DOM.isAncestorOfActiveElement(this.options.navigationContainer)) {
					this.options.focusNewSessionInput?.();
				}
				break;
			case AUTOMATIONS_SECTION_ID:
				await this.commandService.executeCommand('sessionsView.manageAutomations');
				break;
			case CUSTOMIZATIONS_SECTION_ID:
				await this.commandService.executeCommand(OPEN_AI_CUSTOMIZATIONS_COMMAND_ID);
				break;
		}
	}

	private syncCollapsedSessionIds(): void {
		const collapsedSessionIds = new Set<string>();
		const collect = (node: ITreeNode<SessionListItem | null, FuzzyScore | undefined>): void => {
			if (node.element && isSessionItem(node.element) && node.collapsed) {
				collapsedSessionIds.add(node.element.sessionId);
			}
			for (const child of node.children) {
				collect(child);
			}
		};
		collect(this.tree.getNode(null));

		const current = this.collapsedSessionIds.get();
		if (current.size !== collapsedSessionIds.size || [...current].some(sessionId => !collapsedSessionIds.has(sessionId))) {
			this.collapsedSessionIds.set(collapsedSessionIds, undefined);
		}
	}

	/**
	 * (Re-)establish the list-owned autorun that keeps each chat row's cached
	 * height in sync with its live approval and workspace state, independent of
	 * whether the row is currently rendered. Chat items are rebuilt on every
	 * {@link update}, so the autorun is recreated to track the current set.
	 */
	private reconcileChatRowHeights(): void {
		const chatItems: ISessionChatItem[] = [];
		const collect = (node: ITreeNode<SessionListItem | null, FuzzyScore | undefined>): void => {
			if (node.element && isSessionChatItem(node.element)) {
				chatItems.push(node.element);
			}
			for (const child of node.children) {
				collect(child);
			}
		};
		collect(this.tree.getNode());

		if (chatItems.length === 0) {
			this.chatRowHeightReconcile.clear();
			return;
		}

		this.chatRowHeightReconcile.value = autorun(reader => {
			for (const chatItem of chatItems) {
				this._approvalModel.getApproval(chatItem.chat.resource).read(reader);
				if (this.tree.hasElement(chatItem) && this.tree.getRelativeTop(chatItem) !== null) {
					chatItem.session.workspace.read(reader);
					chatItem.chat.workspace.read(reader);
					chatItem.chat.updatedAt.read(reader);
					this.tree.updateElementHeight(chatItem, this._delegate.getHeight(chatItem));
				} else if (this.tree.hasElement(chatItem)) {
					this.tree.updateElementHeight(chatItem, this._delegate.getHeightWithoutChatWorkspace(chatItem));
				}
			}
		});
	}

	private syncActiveChatSelection(activeSession: IActiveSession | undefined): void {
		if (!activeSession) {
			return;
		}
		const session = this.sessions.find(candidate => candidate.sessionId === activeSession.sessionId);
		if (!session) {
			return;
		}
		const activeChat = activeSession.activeChat.get();
		const chatRow = this.findChatRow(session, activeChat.resource);
		if (!chatRow) {
			if (this.tree.hasElement(session)) {
				this.tree.setFocus([session]);
				this.tree.setSelection([session]);
			}
			return;
		}
		const { parent, chatItem } = chatRow;
		if (parent) {
			const previousSuspendCollapseStatePersistence = this.suspendCollapseStatePersistence;
			this.suspendCollapseStatePersistence = true;
			try {
				this.tree.expand(parent);
			} finally {
				this.suspendCollapseStatePersistence = previousSuspendCollapseStatePersistence;
			}
		}
		if (this.tree.getRelativeTop(chatItem) === null) {
			this.tree.reveal(chatItem, 0.5);
		}
		this.tree.setFocus([chatItem]);
		this.tree.setSelection([chatItem]);
	}

	/**
	 * The row of a session's chat and the session row it is nested under, if
	 * any: a done chat of a session that is not done has a standalone row in
	 * the Done section.
	 */
	private findChatRow(session: ISession, chat: URI): { readonly parent: SessionListItem | undefined; readonly chatItem: ISessionChatItem } | undefined {
		const extUri = this.uriIdentityService.extUri;
		const nested = this.tree.hasElement(session)
			? this.tree.getNode(session).children
				.map(node => node.element)
				.find((element): element is ISessionChatItem => !!element && isSessionChatItem(element) && extUri.isEqual(element.chat.resource, chat))
			: undefined;
		if (nested) {
			return { parent: session, chatItem: nested };
		}
		const standalone = this.findTreeElement((element): element is ISessionChatItem => isSessionChatItem(element) && !!element.standalone && element.session.sessionId === session.sessionId && extUri.isEqual(element.chat.resource, chat));
		return standalone && { parent: undefined, chatItem: standalone };
	}

	getVisibleSessions(): readonly ISession[] {
		// Derive the visible session list from the tree model so that index-based
		// navigation matches what the user actually sees: this respects collapsed
		// sections, find-widget filtering, and excludes section / show-more nodes.
		const sessions = new Set<ISession>(this.sessions);
		const visibleSessions: ISession[] = [];

		const collect = (node: ITreeNode<SessionListItem | null, FuzzyScore | undefined>): void => {
			if (!node.visible) {
				return;
			}
			if (node.element && sessions.has(node.element as ISession)) {
				visibleSessions.push(node.element as ISession);
			}
			if (node.collapsed) {
				return;
			}
			for (const child of node.children) {
				collect(child);
			}
		};

		const root = this.tree.getNode();
		for (const child of root.children) {
			collect(child);
		}

		return visibleSessions;
	}

	reveal(sessionResource: URI): boolean {
		const resourceStr = sessionResource.toString();
		for (const session of this.sessions) {
			if (session.resource.toString() === resourceStr) {
				if (this.tree.hasElement(session)) {
					if (this.tree.getRelativeTop(session) === null) {
						this.tree.reveal(session, 0.5);
					}
					this.tree.setFocus([session]);
					this.tree.setSelection([session]);
					return true;
				}
			}
		}
		return false;
	}

	/** Reveals a session and keeps its archive action visible until the caller releases it. */
	revealArchiveAction(session: ISession): IDisposable & { readonly targetId: string } {
		return this.revealOnboardingTarget(session, true);
	}

	/** Keeps a session visible for a spotlight without changing the user's filters. */
	revealSessionForOnboarding(session: ISession): IDisposable & { readonly targetId: string } {
		return this.revealOnboardingTarget(session, false);
	}

	private revealOnboardingTarget(session: ISession, archiveAction: boolean): IDisposable & { readonly targetId: string } {
		this.customViewService.hideCustomView();
		this.closeFind();
		const target = { session, archiveAction };
		this.onboardingTarget.set(target, undefined);
		const release = toDisposable(() => {
			if (this.onboardingTarget.get() !== target) {
				return;
			}
			this.onboardingTarget.set(undefined, undefined);
			if (!this._store.isDisposed) {
				this.update();
			}
		});
		try {
			this.update();
			if (!this.reveal(session.resource)) {
				throw new Error(localize('sessionsList.archiveOnboardingUnavailable', "The session could not be revealed in the sessions list. Try again."));
			}
		} catch (error) {
			release.dispose();
			throw error;
		}
		return { targetId: archiveAction ? getSessionArchiveOnboardingTargetId(session) : getSessionOnboardingTargetId(session), dispose: () => release.dispose() };
	}

	clearFocus(): void {
		this.tree.setFocus([]);
		this.tree.setSelection([]);
	}

	/** Finds the tree element that renders the referenced row. */
	protected findItem(item: SessionsListItemReference): SessionListItem | undefined {
		const extUri = this.uriIdentityService.extUri;
		if (hasKey(item, { group: true })) {
			return this.findTreeElement((element): element is ISessionGroupItem => isSessionGroupItem(element) && element.group.id === item.group);
		}
		if (hasKey(item, { section: true })) {
			return this.findTreeElement((element): element is ISessionSection => isSessionSection(element) && element.id === item.section);
		}
		const { session, chat } = item;
		if (chat) {
			return this.findTreeElement((element): element is ISessionChatItem => isSessionChatItem(element) && extUri.isEqual(element.session.resource, session) && extUri.isEqual(element.chat.resource, chat));
		}
		return this.findTreeElement((element): element is ISession => isSessionItem(element) && extUri.isEqual(element.resource, session));
	}

	hasFocusOrSelection(): boolean {
		return this.tree.getFocus().length > 0 || this.tree.getSelection().length > 0;
	}

	/** Returns the focused selection while this list owns DOM focus, or `undefined` otherwise. */
	getFocusedSessions(): readonly ISession[] | undefined {
		if (!DOM.isAncestorOfActiveElement(this.listContainer)) {
			return undefined;
		}

		const focusedSession = this.tree.getFocus().find((item): item is ISession => !!item && isSessionItem(item));
		return focusedSession ? this.getMultiSelectedSessions(focusedSession) : [];
	}

	/** Returns the focused chat row while this list owns DOM focus. */
	getFocusedChatItem(): ISessionChatItem | undefined {
		if (!DOM.isAncestorOfActiveElement(this.listContainer)) {
			return undefined;
		}

		return this.tree.getFocus().find((item): item is ISessionChatItem => !!item && isSessionChatItem(item));
	}

	getFocusedChatItems(): readonly ISessionChatItem[] {
		const focused = this.getFocusedChatItem();
		if (!focused) {
			return [];
		}
		const selected = this.tree.getSelection().filter((item): item is ISessionChatItem => !!item && isSessionChatItem(item));
		return selected.includes(focused) ? selected : [focused];
	}

	setVisible(visible: boolean): void {
		if (this.visible === visible) {
			return;
		}
		this.visible = visible;
		if (this.visible) {
			this.refresh();
		}
	}

	layout(height: number, width: number): void {
		this.layoutNavigation(width);
		this.listContainer.style.height = `${height}px`;
		this.tree.layout(height, width);
		this.updateStickyShowMore();
	}

	setCompact(): void {
		this.listContainer.classList.toggle('compact', this.isCompact());
		this.update();
	}

	focus(): void {
		this.tree.domFocus();

		if (this.tree.getFocus().length === 0) {
			this.tree.focusFirst();
		}
	}

	isAutomationsFocused(): boolean {
		return this.isNavigationSectionFocused(AUTOMATIONS_SECTION_ID)
			|| (DOM.isAncestorOfActiveElement(this.listContainer)
				&& this.tree.getFocus().some(element => !!element && isSessionSection(element) && element.id === AUTOMATIONS_SECTION_ID));
	}

	focusAutomations(): void {
		if (this.navigationSections.some(section => section.id === AUTOMATIONS_SECTION_ID)) {
			this.focusNavigationSection(AUTOMATIONS_SECTION_ID);
		} else {
			this.closeFind();
			const section = this.tree.getNode().children.find(node => node.element && isSessionSection(node.element) && node.element.id === AUTOMATIONS_SECTION_ID)?.element;
			if (section) {
				this.tree.setFocus([section]);
				this.tree.setSelection([]);
				this.tree.reveal(section);
				this.tree.domFocus();
			}
		}
	}

	isCustomizationsFocused(): boolean {
		return this.isNavigationSectionFocused(CUSTOMIZATIONS_SECTION_ID);
	}

	focusCustomizations(): void {
		this.focusNavigationSection(CUSTOMIZATIONS_SECTION_ID);
	}

	private isNavigationSectionFocused(sectionId: string): boolean {
		return !!this.options.navigationContainer
			&& DOM.isAncestorOfActiveElement(this.options.navigationContainer)
			&& this.navigationList?.getFocusedElements().some(section => section.id === sectionId) === true;
	}

	private focusNavigationSection(sectionId: string): void {
		this.closeFind();
		const index = this.navigationSections.findIndex(section => section.id === sectionId);
		if (!this.navigationList || index < 0) {
			return;
		}
		this.navigationList.setFocus([index]);
		this.navigationList.setSelection([]);
		this.navigationList.domFocus();
	}

	updateNavigationVisibility(): void {
		this.update();
	}

	openFind(): void {
		this.tree.openFind();
	}

	closeFind(): void {
		this.tree.closeFind();
	}

	// -- Drag and drop --

	/** The placement of the section or group a rendered session row belongs to. */
	private getRowPlacement(session: ISession): SessionListPlacement | undefined {
		if (!this.tree.hasElement(session)) {
			return undefined;
		}
		const parent = this.tree.getParentElement(session);
		if (parent && isSessionGroupItem(parent)) {
			return { kind: 'group', groupId: parent.group.id };
		}
		return parent && isSessionSection(parent) ? getSectionPlacement(parent.id) : undefined;
	}

	private getVisibleChatRows(session: ISession): readonly ISessionChatItem[] {
		if (!this.tree.hasElement(session)) {
			return [];
		}
		const node = this.tree.getNode(session);
		if (node.collapsed) {
			return [];
		}
		return node.children
			.filter(child => child.visible)
			.map(child => child.element)
			.filter((element): element is ISessionChatItem => !!element && isSessionChatItem(element));
	}

	private getDateSections(): readonly ISessionSection[] | undefined {
		if (this.options.grouping() !== SessionsGrouping.Date) {
			return undefined;
		}
		return this.tree.getNode().children
			.map(child => child.element)
			.filter((element): element is ISessionSection => !!element && isSessionSection(element) && DATE_SECTION_IDS.includes(element.id));
	}

	/**
	 * The ungrouped sections a session can render in, following the list's
	 * placement precedence below custom groups. Date sections share one sort
	 * order, so a session may render in either of them.
	 */
	private getUngroupedSectionIds(session: ISession): readonly string[] {
		if (this.groupExternalSessions && session.isExternal?.get()) {
			return [EXTERNAL_SESSIONS_SECTION_ID];
		}
		if (isQuickChatSession(session)) {
			return [QUICK_CHATS_SECTION_ID];
		}
		const grouping = this.options.grouping();
		if (grouping !== SessionsGrouping.Date) {
			return [getSessionGroupingSectionId(session, grouping)];
		}
		return DATE_SECTION_IDS;
	}

	/**
	 * The sessions a session is manually ordered among, or `undefined` when its
	 * section keeps a fixed order (archived sessions and comparison groups).
	 */
	private getReorderScope(session: ISession): string | undefined {
		if (session.isArchived.get() || isAutomationSession(session)) {
			return undefined;
		}
		if (this.isSessionPinned(session)) {
			return 'pinned';
		}
		const group = this.getRenderedSessionGroup(session);
		if (group) {
			return this.isComparisonGroup(group.id) ? undefined : getSessionGroupSectionId(group.id);
		}
		return this.getUngroupedSectionIds(session)[0];
	}

	/** Whether the session may move into the destination, regardless of its position. */
	private canMoveSession(session: ISession, destination: ISessionDropDestination): boolean {
		const { placement } = destination;
		const state = getPlacementState(placement);
		if (session.isArchived.get() && !state.archived && !destination.restoresArchived) {
			return false;
		}
		if (placement.kind === 'section' && !this.getUngroupedSectionIds(session).includes(placement.sectionId)) {
			return false;
		}
		const groupId = this._sessionGroupsService.getGroupOfSession(session.sessionId) ?? null;
		if (state.groupId !== undefined && state.groupId !== groupId) {
			// Comparison groups own their membership.
			if (this.isActiveComparisonSession(session) || (state.groupId !== null && this.isComparisonGroup(state.groupId))) {
				return false;
			}
		}
		return true;
	}

	/** Whether moving the session into the placement changes any of its list state. */
	private changesPlacement(session: ISession, placement: SessionListPlacement): boolean {
		const state = getPlacementState(placement);
		return session.isArchived.get() !== state.archived
			|| (state.pinned !== undefined && this.isSessionPinned(session) !== state.pinned)
			|| (state.groupId !== undefined && (this._sessionGroupsService.getGroupOfSession(session.sessionId) ?? null) !== state.groupId);
	}

	/** Whether moving chats by drag and drop is on: the setting, and AI features enabled. */
	private isChatMoveDndEnabled(): boolean {
		return isChatMoveDndEnabled(this.configurationService, this.chatEntitlementService) && this.contextKeyService.contextMatchesRules(ChatContextKeys.enabled);
	}

	/** The chat of a dragged chat row, with its session, when chats can move by drag and drop and this one can move. */
	private getMovableDraggedChat(item: ISessionChatItem): { readonly session: ISession; readonly chat: IChat } | undefined {
		if (!this.isChatMoveDndEnabled()) {
			return undefined;
		}
		// The row's objects may be stale: use the session's current ones.
		const session = this._sessionsManagementService.getSessions().find(candidate => candidate.sessionId === item.session.sessionId);
		const chat = session?.chats.get().find(candidate => candidate.resource.toString() === item.chat.resource.toString());
		return session && chat && this._sessionsManagementService.canMoveChat(session, chat) ? { session, chat } : undefined;
	}

	/**
	 * Whether `element` is the last row its section shows: its last session's row, or that session's last chat row. Rows
	 * a find filter hides don't count.
	 */
	private isLastRowOfSection(element: ISession | ISessionChatItem): boolean {
		const session = isSessionChatItem(element) ? element.session : element;
		if (!this.tree.hasElement(session)) {
			return false;
		}
		const lastSession = findLastVisible(this.tree.getNode(this.tree.getParentElement(session)).children, isSessionItem);
		if (lastSession?.sessionId !== session.sessionId) {
			return false;
		}
		const lastChat = this.tree.isCollapsed(session) ? undefined : findLastVisible(this.tree.getNode(session).children, isSessionChatItem);
		return isSessionChatItem(element) ? lastChat?.chat.resource.toString() === element.chat.resource.toString() : !lastChat;
	}

	private moveChatByDrop(session: ISession, chat: IChat, drop: SessionsListChatDrop): void {
		const destination = drop.kind === 'session' ? { kind: 'session' as const, session: drop.session, after: drop.after } : { kind: 'newSession' as const };
		this.runMove({ kind: 'chat', session, chat, destination });
	}

	private moveSessionUnderByDrop(session: ISession, target: ISession, after: IChat | undefined): void {
		this.runMove({ kind: 'session', session, destination: target, after });
	}

	private runMove(move: SessionsListMove): void {
		runSessionsListMove(move, this._sessionsManagementService, this.notificationService, this.logService, {
			notice: this.options.getMoveNotice?.(),
			watch: watched => this.watchMoveForReveal(watched),
		}).catch(onUnexpectedError);
	}

	/**
	 * Reveals and selects where `move` puts what it moves once the list shows it: the moved chat's row, or the new
	 * session's row for a chat moved into a new session. Call it before the move starts, as the provider reports where
	 * the chat went while the move runs, then call the returned function with whether the move succeeded. Doesn't move
	 * focus into the list. Gives up when the row doesn't show within a few updates of the list or a few seconds, and when
	 * a later move is watched.
	 */
	watchMoveForReveal(move: SessionsListMove): (moved: boolean) => void {
		const store = new DisposableStore();
		this.pendingMoveReveal.value = store;
		const extUri = this.uriIdentityService.extUri;
		let target: { readonly sessionId: string; readonly chat: URI | undefined } | undefined;
		if (move.kind === 'chat' && move.destination.kind === 'session' && move.destination.session.sessionId === move.session.sessionId) {
			// A reorder keeps the chat in its session.
			target = { sessionId: move.session.sessionId, chat: move.chat.resource };
		} else {
			const movedChat = move.kind === 'chat' ? move.chat.resource : move.session.mainChat.get().resource;
			const toNewSession = move.kind === 'chat' && move.destination.kind === 'newSession';
			store.add(this._sessionsManagementService.onDidMoveChat(({ from, to }) => {
				if (from.session.sessionId === move.session.sessionId && extUri.isEqual(from.chat, movedChat)) {
					target = { sessionId: to.session.sessionId, chat: toNewSession ? undefined : to.chat };
					tryReveal();
				}
			}));
		}
		let succeeded = false;
		let updates = 0;
		const tryReveal = () => {
			if (!succeeded || !target || store.isDisposed) {
				return;
			}
			if (this.revealMoved(target.sessionId, target.chat) || ++updates > 5) {
				this.pendingMoveReveal.clear();
			}
		};
		this.tryPendingMoveReveal = tryReveal;
		store.add(toDisposable(() => {
			if (this.tryPendingMoveReveal === tryReveal) {
				this.tryPendingMoveReveal = undefined;
			}
		}));
		return moved => {
			if (store.isDisposed) {
				return;
			}
			if (!moved) {
				this.pendingMoveReveal.clear();
				return;
			}
			succeeded = true;
			store.add(disposableTimeout(() => this.pendingMoveReveal.clear(), 3000));
			tryReveal();
		};
	}

	/**
	 * Reveals and selects the row of the session `sessionId`, or of its chat `chat`; whether the list shows it. A find
	 * filter that hides the row is cleared, keeping focus where it was.
	 */
	private revealMoved(sessionId: string, chat: URI | undefined): boolean {
		const session = this.sessions.find(candidate => candidate.sessionId === sessionId);
		if (!session || !this.tree.hasElement(session)) {
			return false;
		}
		let element: SessionListItem = session;
		if (chat && !this.uriIdentityService.extUri.isEqual(session.mainChat.get().resource, chat)) {
			const chatRow = this.findChatRow(session, chat);
			if (!chatRow) {
				return false;
			}
			element = chatRow.chatItem;
		}
		if (!this.tree.getNode(element).visible) {
			if (!this.hasFindPattern) {
				return false;
			}
			const activeElement = DOM.getActiveElement();
			const hadFocus = DOM.isAncestorOfActiveElement(this.listContainer);
			this.tree.closeFind();
			if (!hadFocus && DOM.isHTMLElement(activeElement)) {
				activeElement.focus();
			}
			if (!this.tree.hasElement(element) || !this.tree.getNode(element).visible) {
				return false;
			}
		}
		this.tree.reveal(element, 0.5);
		this.tree.setFocus([element]);
		this.tree.setSelection([element]);
		return true;
	}

	private getSessionDropEffect(sessions: readonly ISession[], destination: ISessionDropDestination): SessionDropEffect | undefined {
		if (!sessions.every(session => this.canMoveSession(session, destination))) {
			return undefined;
		}
		const moves = sessions.some(session => this.changesPlacement(session, destination.placement));
		if (!moves && (!destination.anchor || this.getReorderScope(destination.anchor.session) === undefined)) {
			return undefined;
		}
		if (!this.rendersInDateSection(sessions, destination)) {
			return undefined;
		}
		return moves ? 'move' : 'reorder';
	}

	/**
	 * Whether every session renders in the destination's date section after the
	 * move. Date sections derive from sort keys and grouping rules, such as
	 * promoting recently updated sessions and capping Recent, so the drop slot
	 * alone does not decide the section.
	 */
	private rendersInDateSection(sessions: readonly ISession[], destination: ISessionDropDestination): boolean {
		const { placement } = destination;
		if (placement.kind !== 'section' || !isDateSectionPlacement(placement)) {
			return true;
		}
		const sorting = this.options.sorting();
		const mode = sortingToMode(sorting);
		const changes = destination.anchor && this.computeSessionReorder(this.sortInDisplayOrder(sessions), destination.anchor);
		const getSortKey = (session: ISession) => changes?.set.get(session.sessionId)
			?? (changes?.clear.includes(session.sessionId) ? this._sessionsListModelService.getNaturalSortKey(session, mode) : this._sessionsListModelService.getSortKey(session, mode));
		const movedIds = new Set(sessions.map(session => session.sessionId));
		const dateSessions = (this.getDateSections() ?? []).flatMap(section => section.sessions).filter(session => !movedIds.has(session.sessionId));
		const sections = groupByDate(sortSessions([...dateSessions, ...sessions], sorting, getSortKey), sorting, getSortKey);
		const target = sections.find(section => section.id === placement.sectionId);
		return sessions.every(session => target?.sessions.includes(session));
	}

	/** The sessions in the order the tree renders them, including collapsed sections. */
	private sortInDisplayOrder(sessions: readonly ISession[]): ISession[] {
		const indices = new Map<string, number>();
		const visit = (nodes: readonly ITreeNode<SessionListItem | null, FuzzyScore>[]): void => {
			for (const node of nodes) {
				if (node.element && isSessionItem(node.element)) {
					indices.set(node.element.sessionId, indices.size);
				}
				visit(node.children);
			}
		};
		visit(this.tree.getNode().children);
		const indexOf = (session: ISession) => indices.get(session.sessionId) ?? Number.MAX_SAFE_INTEGER;
		return [...sessions].sort((a, b) => indexOf(a) - indexOf(b));
	}

	/**
	 * Move sessions into the destination by applying only the archive, pin, and
	 * group changes its placement needs, then position them next to the anchor.
	 */
	private async moveSessions(sessions: readonly ISession[], destination: ISessionDropDestination): Promise<void> {
		// Capture the display order before state changes move the rows.
		const ordered = this.sortInDisplayOrder(sessions);
		const state = getPlacementState(destination.placement);
		if (state.archived) {
			const toArchive = ordered.filter(session => !session.isArchived.get());
			if (toArchive.length > 0) {
				await this.commandService.executeCommand(ARCHIVE_SESSIONS_WITH_UNDO_COMMAND_ID, toArchive);
			}
			return;
		}

		// Archived sessions lose their group membership, so restore them before changing it.
		for (const session of ordered) {
			if (session.isArchived.get()) {
				await this._sessionsManagementService.unarchiveSession(session);
			}
		}
		if (state.pinned) {
			for (const session of ordered) {
				this._sessionsListModelService.pinSession(session);
			}
		} else if (state.pinned === false) {
			this._sessionsListModelService.unpinSessions(ordered.filter(session => this.isSessionPinned(session)));
		}
		if (state.groupId === null) {
			for (const session of ordered) {
				if (this._sessionGroupsService.getGroupOfSession(session.sessionId) !== undefined) {
					this._sessionGroupsService.removeFromGroup(session.sessionId);
				}
			}
		} else if (state.groupId !== undefined) {
			const groupId = state.groupId;
			const joining = ordered.filter(session => this._sessionGroupsService.getGroupOfSession(session.sessionId) !== groupId);
			if (joining.length > 0) {
				this._sessionGroupsService.addToGroup(joining.map(session => session.sessionId), groupId);
			}
		}
		const changes = destination.anchor && this.computeSessionReorder(ordered, destination.anchor);
		if (changes) {
			this._sessionsListModelService.applySortChanges(sortingToMode(this.options.sorting()), changes.set, changes.clear);
		}
	}

	/**
	 * The sort changes that place the sessions, in display order, as a contiguous
	 * block next to the anchor: synthetic keys between the surrounding sessions'
	 * keys, or cleared overrides when the sessions' natural timestamps already
	 * sort them into the slot.
	 */
	private computeSessionReorder(sessions: readonly ISession[], anchor: ISessionDropAnchor): { set: Map<string, number>; clear: string[] } | undefined {
		const scope = this.getReorderScope(anchor.session);
		if (scope === undefined) {
			return undefined;
		}
		const mode = sortingToMode(this.options.sorting());
		const getKey = (session: ISession) => this._sessionsListModelService.getSortKey(session, mode);

		// Neighbours come from every session that shares the anchor's sort order,
		// including collapsed sections, so the slot matches the rendered order.
		const draggedIds = new Set(sessions.map(session => session.sessionId));
		const remaining = this.sessions
			.filter(session => !draggedIds.has(session.sessionId) && this.getReorderScope(session) === scope)
			.sort((a, b) => getKey(b) - getKey(a));
		const anchorIndex = remaining.findIndex(session => session.sessionId === anchor.session.sessionId);
		if (anchorIndex === -1) {
			return undefined;
		}
		const insertIndex = anchor.position === 'before' ? anchorIndex : anchorIndex + 1;
		const above: ISession | undefined = remaining[insertIndex - 1];
		const below: ISession | undefined = remaining[insertIndex];
		let aboveKey = above && getKey(above);
		let belowKey = below && getKey(below);
		const now = Date.now();
		if (anchor.staysInSection) {
			// Hug the anchor when the far side of the gap belongs to another section.
			// An open boundary belongs to the first or last date section.
			const dateSections = this.getDateSections() ?? [];
			const anchorSection = dateSections.find(section => section.sessions.includes(anchor.session));
			const isInAnchorSection = (neighbour: ISession | undefined, boundarySection: ISessionSection | undefined) =>
				neighbour ? !!anchorSection?.sessions.includes(neighbour) : anchorSection === boundarySection;
			const span = (sessions.length + 1) * ADJACENT_SORT_STEP_MS;
			const anchorKey = getKey(anchor.session);
			if (anchor.position === 'before' && !isInAnchorSection(above, dateSections.at(0))) {
				aboveKey = Math.min(aboveKey ?? Number.POSITIVE_INFINITY, anchorKey + span);
			} else if (anchor.position === 'after' && !isInAnchorSection(below, dateSections.at(-1))) {
				belowKey = Math.max(belowKey ?? Number.NEGATIVE_INFINITY, anchorKey - span);
			} else if (anchor.position === 'before' && !above) {
				// The top of the first date section is the newest slot, so keep the sessions as recent as possible.
				belowKey = Math.max(anchorKey, now - span);
			}
		}

		return computeReorderSortChanges({
			draggedIds: sessions.map(session => session.sessionId),
			naturalKeys: sessions.map(session => this._sessionsListModelService.getNaturalSortKey(session, mode)),
			aboveKey,
			belowKey,
			now,
			fallbackStep: SORT_FALLBACK_STEP_MS,
		});
	}

	/** The nested chat rows of a rendered session in display order, including collapsed ones. */
	private getChatRows(session: ISession): readonly ISessionChatItem[] {
		if (!this.tree.hasElement(session)) {
			return [];
		}
		return this.tree.getNode(session).children
			.map(child => child.element)
			.filter((element): element is ISessionChatItem => !!element && isSessionChatItem(element));
	}

	/** The sibling chat row a nested chat swaps with when moved up or down, if any. */
	private getAdjacentChatRow(item: ISessionChatItem, direction: 'up' | 'down'): ISessionChatItem | undefined {
		const rows = this.getChatRows(item.session);
		const index = rows.findIndex(row => isEqual(row.chat.resource, item.chat.resource));
		return index === -1 ? undefined : rows[direction === 'up' ? index - 1 : index + 1];
	}

	/**
	 * The move through its provider that puts a nested chat one row up or down, or `undefined` when there is no row
	 * there or its provider can't move the chat there. Only the provider orders nested chats.
	 */
	private getAdjacentChatMove(item: ISessionChatItem, direction: 'up' | 'down'): { readonly session: ISession; readonly chat: IChat; readonly drop: SessionsListChatDrop } | undefined {
		const target = this.getAdjacentChatRow(item, direction);
		const movable = target && this.getMovableDraggedChat(item);
		const drop = target && movable && getSessionsListChatDrop(movable.session, movable.chat, { session: target.session, chat: target.chat, position: direction === 'up' ? 'before' : 'after' });
		return movable && drop ? { session: movable.session, chat: movable.chat, drop } : undefined;
	}

	private updateFocusedChatMoveContexts(): void {
		const focused = this.getFocusedChatItem();
		this.focusedChatCanMoveUpContext.set(!!focused && this.getAdjacentChatMove(focused, 'up') !== undefined);
		this.focusedChatCanMoveDownContext.set(!!focused && this.getAdjacentChatMove(focused, 'down') !== undefined);
	}

	/**
	 * Move a nested chat one position up or down among its session's chats through its provider, as dragging it does,
	 * keeping it focused. Returns whether it moved: a chat its provider can't move stays where it is.
	 */
	moveChat(item: ISessionChatItem, direction: 'up' | 'down'): boolean {
		const move = this.getAdjacentChatMove(item, direction);
		if (!move) {
			return false;
		}
		// Its progress and result are shown and announced like a drop's.
		this.moveChatByDrop(move.session, move.chat, move.drop);
		return true;
	}

	// -- Groups --

	/**
	 * Create a new group containing the given sessions and start renaming it.
	 * Archived (Done) sessions are ignored. When every session renders in the
	 * same custom group, the new group is nested in that group.
	 */
	createGroupFromSessions(sessions: ISession[]): void {
		if (sessions.some(session => this.isActiveComparisonSession(session))) {
			return;
		}
		const groupSessions = sessions.filter(session => !session.isArchived.get());
		if (groupSessions.length === 0) {
			return;
		}
		const renderedGroupIds = new Set(groupSessions.map(session => this.getRenderedSessionGroup(session)?.id));
		const sharedGroupId = renderedGroupIds.size === 1 ? [...renderedGroupIds][0] : undefined;
		this.createGroup(groupSessions, sharedGroupId !== undefined && this.canHoldSubgroups(sharedGroupId) ? sharedGroupId : undefined);
	}

	/** Create an empty group nested in the given group and start renaming it. */
	createSubgroup(parentId: string): void {
		if (!this.canHoldSubgroups(parentId)) {
			return;
		}
		this.createGroup([], parentId);
	}

	private createGroup(groupSessions: ISession[], parentId?: string): void {
		this._sessionsListModelService.unpinSessions(groupSessions);
		if (parentId !== undefined) {
			// Show the new group's name editor inside its parent.
			this.saveSectionCollapseState(getSessionGroupSectionId(parentId), false);
			const parent = this.findTreeElement((element): element is ISessionGroupItem => isSessionGroupItem(element) && element.group.id === parentId);
			if (parent) {
				this.tree.expand(parent);
			}
		}
		const group = this._sessionGroupsService.createGroup(localize('newGroupName', "New Group"), groupSessions.map(s => s.sessionId), parentId);
		this._editingGroupId = group.id;
		this.update();
		this.revealGroup(group.id);
	}

	/** Scroll the group's header into view so its inline name editor is visible. */
	private revealGroup(groupId: string): void {
		const group = this.findTreeElement((element): element is ISessionGroupItem => isSessionGroupItem(element) && element.group.id === groupId);
		if (group && this.tree.getRelativeTop(group) === null) {
			this.tree.reveal(group, 0.5);
		}
	}

	/** Begin inline renaming of the group's header. */
	beginRenameGroup(groupId: string): void {
		if (!this._sessionGroupsService.getGroup(groupId) || this.isComparisonGroup(groupId)) {
			return;
		}
		this._editingGroupId = groupId;
		this.update();
	}

	private async beginOpenRequest(session: ISession, chat: IChat | undefined, preserveFocus: boolean, sideBySide: boolean): Promise<boolean> {
		const request: IListOpenRequest = { session, chat, preserveFocus, sideBySide, started: false, invocation: 0 };
		this.pendingOpenRequest = request;
		try {
			if (this.options.canOpenSession && !(await this.options.canOpenSession(session))) {
				if (this.pendingOpenRequest === request) {
					this.pendingOpenRequest = undefined;
				}
				return false;
			}
		} catch (error) {
			if (this.pendingOpenRequest === request) {
				this.pendingOpenRequest = undefined;
			}
			throw error;
		}
		if (this.pendingOpenRequest !== request) {
			return false;
		}
		const sessionRowRepresentsSession = getSessionListChats(session).length === 0 || this.collapsedSessionIds.get().has(session.sessionId);
		if (!request.chat && sessionRowRepresentsSession && this._sessionsService.activeSession.get()?.sessionId !== session.sessionId) {
			this.markRead(session);
		}
		this.invokeOpenRequest(request);
		return true;
	}

	private invokeOpenRequest(request: IListOpenRequest): void {
		request.started = true;
		const invocation = ++request.invocation;
		const finish = (opened: boolean) => {
			if (this.pendingOpenRequest === request && request.invocation === invocation) {
				this.pendingOpenRequest = undefined;
				if (opened) { this._onDidOpenSession.fire(request.chat?.resource ?? request.session.resource); }
			}
		};

		let open: void | Promise<void>;
		try {
			if (request.chat) {
				open = this.options.onChatOpen
					? this.options.onChatOpen(request.session, request.chat, request.preserveFocus, request.sideBySide)
					: this._sessionsService.openChat(request.session, request.chat.resource, { preserveFocus: request.preserveFocus }).catch(onUnexpectedError);
			} else {
				open = this.options.onSessionOpen(request.session.resource, request.preserveFocus, request.sideBySide);
			}
		} catch (error) {
			finish(false);
			throw error;
		}

		if (!open) {
			finish(true);
			return;
		}
		open.then(() => finish(true), error => {
			finish(false);
			onUnexpectedError(error);
		});
	}

	private preservePendingOpenFocus(session: ISession, chat?: IChat): void {
		const request = this.pendingOpenRequest;
		if (!request
			|| !this.uriIdentityService.extUri.isEqual(request.session.resource, session.resource)
			|| (!!request.chat !== !!chat)
			|| (request.chat && chat && !this.uriIdentityService.extUri.isEqual(request.chat.resource, chat.resource))
		) {
			return;
		}
		request.preserveFocus = true;
		if (request.started) {
			this.invokeOpenRequest(request);
		}
	}

	beginRenameSession(session: ISession): boolean {
		const target = this.findTreeElement((element): element is ISession => isSessionItem(element) && this.uriIdentityService.extUri.isEqual(element.resource, session.resource));
		if (!target) {
			return false;
		}
		if (this.tree.getRelativeTop(target) === null) {
			this.tree.reveal(target, 0.5);
		}
		if (!this._sessionRenderer.beginRename(target)) {
			return false;
		}
		return true;
	}

	beginRenameChat(item: ISessionChatItem): boolean {
		const target = this.findTreeElement((element): element is ISessionChatItem =>
			isSessionChatItem(element)
			&& this.uriIdentityService.extUri.isEqual(element.session.resource, item.session.resource)
			&& this.uriIdentityService.extUri.isEqual(element.chat.resource, item.chat.resource)
		);
		if (!target) {
			return false;
		}
		if (this.tree.getRelativeTop(target) === null) {
			this.tree.reveal(target, 0.5);
		}
		if (!this._chatRenderer.beginRename(target)) {
			return false;
		}
		return true;
	}

	private findTreeElement<T extends SessionListItem>(predicate: (element: SessionListItem) => element is T): T | undefined {
		const visit = (nodes: readonly ITreeNode<SessionListItem | null, FuzzyScore>[]): T | undefined => {
			for (const node of nodes) {
				if (node.element && predicate(node.element)) {
					return node.element;
				}
				const match = visit(node.children);
				if (match) {
					return match;
				}
			}
			return undefined;
		};
		return visit(this.tree.getNode().children);
	}

	addSessionsToGroup(sessions: ISession[], groupId: string): void {
		if (this.isComparisonGroup(groupId) || sessions.some(session => this.isActiveComparisonSession(session))) {
			return;
		}
		const groupSessions = sessions.filter(session => !session.isArchived.get());
		this._sessionsListModelService.unpinSessions(groupSessions);
		this._sessionGroupsService.addToGroup(groupSessions.map(s => s.sessionId), groupId);
	}

	private commitGroupEdit(group: ISessionGroup, name: string): void {
		this._editingGroupId = undefined;
		const trimmed = name.trim();
		if (trimmed) {
			this._sessionGroupsService.renameGroup(group.id, trimmed);
		}
		this.update();
	}

	private cancelGroupEdit(_group: ISessionGroup): void {
		this._editingGroupId = undefined;
		this.update();
	}

	/** Comparison groups keep their place inside grouping sections; any other group or grouping header can be dragged. */
	private isHeaderReorderable(element: ISessionGroupItem | ISessionSection): boolean {
		return !isSessionGroupItem(element) || !element.comparison || this.options.grouping() === SessionsGrouping.Date;
	}

	/**
	 * Where a dragged header lands. A group lands inside another group when it is
	 * dropped on the middle of that group's header, on the lower edge of its
	 * expanded header (which shows the group's rows below it), or on one of its
	 * rows. Otherwise a header lands before or after the hovered header, among
	 * that header's siblings. Groups only nest where {@link canNestGroup} allows.
	 */
	private getHeaderDrop(header: IDraggedHeader, target: SessionListItem, sector: ListViewTargetSector | undefined): SessionHeaderDrop | undefined {
		const groupTree = this._sessionGroupsService.getTree();
		const draggedId = header.group?.group.id;
		const canNestIn = (groupId: string) => draggedId !== undefined
			? this.canNestGroup(draggedId, groupId, groupTree)
			: this.canHoldSubgroups(groupId);

		if (isSessionGroupItem(target)) {
			if (target.group.id === draggedId || !this.isHeaderReorderable(target)) {
				return undefined;
			}
			const node = this.tree.hasElement(target) ? this.tree.getNode(target) : undefined;
			const showsRows = !!node && !node.collapsed && node.children.some(child => child.visible);
			const onEdge = sector === ListViewTargetSector.TOP || sector === ListViewTargetSector.BOTTOM;
			if (canNestIn(target.group.id) && (!onEdge || (sector === ListViewTargetSector.BOTTOM && showsRows))) {
				return { kind: 'into', groupId: target.group.id };
			}
			const position = sectorToPosition(sector);
			const path = groupTree.getPath(target.group.id);
			const parentId = path.at(-2)?.id;
			if (parentId === undefined) {
				return { kind: 'topLevel', targetId: getSessionGroupSectionId(target.group.id), position };
			}
			return canNestIn(parentId)
				? { kind: 'subgroup', parentId, depth: path.length - 1, placement: { siblingId: target.group.id, position } }
				: undefined;
		}
		if (isSessionSection(target)) {
			if (!isSessionGroupingSection(target.id) || target.id === header.id) {
				return undefined;
			}
			const parentId = this.getSectionParentId(target.id);
			const position = sectorToPosition(sector);
			return parentId === undefined
				? { kind: 'topLevel', targetId: target.id, position }
				: canNestIn(parentId)
					? { kind: 'subgroup', parentId, depth: groupTree.getPath(parentId).length, placement: { siblingId: this.getSectionGroupKey(target.id), position } }
					: undefined;
		}
		const groupItem = this.getContainingGroupItem(target);
		return groupItem && canNestIn(groupItem.group.id) ? { kind: 'into', groupId: groupItem.group.id } : undefined;
	}

	/**
	 * Move a dragged header to where it lands. The groups service nests a dragged
	 * group and orders it among its new siblings, while the list orders the
	 * top-level headers, which include grouping sections.
	 */
	private moveHeader(header: IDraggedHeader, drop: SessionHeaderDrop): void {
		this.applyHeaderDrop(header.id, header.group?.group.id, drop);
	}

	/** Moves the header with the given section id, the header of `groupId` when it is a group, to where `drop` says. */
	private applyHeaderDrop(headerId: string, groupId: string | undefined, drop: SessionHeaderDrop): void {
		if (drop.kind !== 'topLevel') {
			const parentId = drop.kind === 'into' ? drop.groupId : drop.parentId;
			if (groupId === undefined ? !this.canHoldSubgroups(parentId) : !this.canNestGroup(groupId, parentId)) {
				return;
			}
			this.saveSectionCollapseState(getSessionGroupSectionId(parentId), false);
		}
		switch (drop.kind) {
			case 'into':
				if (groupId !== undefined) {
					this._sessionGroupsService.moveGroup(groupId, drop.groupId);
				} else {
					this._sessionGroupsService.moveSection(this.getSectionGroupKey(headerId), drop.groupId);
				}
				return;
			case 'subgroup':
				if (groupId !== undefined) {
					this._sessionGroupsService.moveGroup(groupId, drop.parentId, drop.placement);
				} else {
					this._sessionGroupsService.moveSection(this.getSectionGroupKey(headerId), drop.parentId, drop.placement);
				}
				return;
			case 'topLevel': {
				const topLevelOrder = this._topLevelOrder;
				if (groupId !== undefined) {
					this._sessionGroupsService.moveGroup(groupId, undefined);
				} else {
					this._sessionGroupsService.moveSection(this.getSectionGroupKey(headerId), undefined);
				}
				// A moved grouping section is promoted so it stays visible (escapes the "+N more" capping).
				this._sessionSectionOrderService.reorder(topLevelOrder, headerId, drop.targetId, drop.position, groupId === undefined ? headerId : undefined);
				return;
			}
		}
	}

	/**
	 * Whether a group can be nested in `parentId`: comparison groups neither nest
	 * nor hold subgroups, and a group never nests in itself or its own subgroups.
	 */
	private canNestGroup(groupId: string, parentId: string, groupTree = this._sessionGroupsService.getTree()): boolean {
		return !this.isComparisonGroup(groupId) && this.canHoldSubgroups(parentId) && groupTree.canMove(groupId, parentId);
	}

	/** Whether the group can hold subgroups: any group except a comparison group. */
	private canHoldSubgroups(groupId: string): boolean {
		return this._sessionGroupsService.getGroup(groupId) !== undefined && !this.isComparisonGroup(groupId);
	}

	/** The custom group whose rows include the element, or `undefined` when it renders outside custom groups. */
	private getContainingGroupItem(element: SessionListItem): ISessionGroupItem | undefined {
		if (!this.tree.hasElement(element)) {
			return undefined;
		}
		for (let parent = this.tree.getParentElement(element); parent; parent = this.tree.getParentElement(parent)) {
			if (isSessionGroupItem(parent)) {
				return parent;
			}
		}
		return undefined;
	}

	/**
	 * Groups in their current top-to-bottom display order, each group followed
	 * by its subgroups. Groups are fully user-managed (see
	 * {@link ISessionGroupsService.getTree}); the order defaults to newest-first.
	 * Used to keep the "Add to Group" / "Move to Group" menu consistent with the
	 * rendered order.
	 */
	getGroupsInDisplayOrder(): ISessionGroup[] {
		const groupTree = this._sessionGroupsService.getTree();
		const result: ISessionGroup[] = [];
		const append = (groups: readonly ISessionGroup[]) => {
			for (const group of groups) {
				result.push(group);
				append(groupTree.getSubgroups(group.id));
			}
		};
		append(groupTree.getSubgroups(undefined));
		return result;
	}

	// -- Programmatic organization --

	/**
	 * The list as it is composed, independent of scrolling, collapsing, and the
	 * find filter, including the sections and session rows that capping hides.
	 * Shortcut sections and nested chat rows are omitted.
	 */
	getTreeSnapshot(): SessionsListSnapshotNode[] {
		const toSessionNodes = (sessions: readonly ISession[], hidden: boolean): SessionsListSnapshotNode[] =>
			sessions.map(session => hidden ? { type: 'session', session, hidden } : { type: 'session', session });
		const collectSessionIds = (nodes: readonly SessionsListSnapshotNode[], ids: Set<string>): Set<string> => {
			for (const node of nodes) {
				if (node.type === 'session') {
					ids.add(node.session.sessionId);
				} else {
					collectSessionIds(node.children, ids);
				}
			}
			return ids;
		};
		const visitRows = (node: ITreeNode<SessionListItem | null, FuzzyScore>, sessions: readonly ISession[]): SessionsListSnapshotNode[] => {
			const rows = visit(node.children);
			if (node.children.some(child => child.element && isSessionShowMore(child.element) && child.element.kind === 'sessions' && child.element.mode === 'more')) {
				const shown = collectSessionIds(rows, new Set());
				rows.push(...toSessionNodes(sessions.filter(session => !shown.has(session.sessionId)), true));
			}
			return rows;
		};
		const visit = (nodes: readonly ITreeNode<SessionListItem | null, FuzzyScore>[]): SessionsListSnapshotNode[] => nodes.flatMap((node): SessionsListSnapshotNode[] => {
			const element = node.element;
			if (!element) {
				return [];
			}
			if (isSessionGroupItem(element)) {
				return [{
					type: 'group',
					id: getSessionGroupSectionId(element.group.id),
					label: element.group.name,
					collapsed: node.collapsed,
					...(element.comparison ? { comparison: true } : {}),
					children: visitRows(node, element.sessions),
				}];
			}
			if (isSessionSection(element)) {
				return isShortcutSection(element.id) ? [] : [{ type: 'section', id: element.id, label: element.label, collapsed: node.collapsed, children: visitRows(node, element.sessions) }];
			}
			if (isSessionShowMore(element)) {
				return element.kind !== 'sessions' && element.mode === 'more'
					? this.hiddenGroupingSections.map(section => ({ type: 'section', id: section.id, label: section.label, collapsed: true, hidden: true, children: toSessionNodes(section.sessions, true) }))
					: [];
			}
			return isSessionItem(element) ? [{ type: 'session', session: element }] : [];
		});
		return visit(this.tree.getNode().children);
	}

	/**
	 * Moves sessions as dropping them does: into a placement, which is `pinned`,
	 * `archived`, {@link SESSIONS_LIST_UNGROUPED_PLACEMENT}, or the section id of
	 * a custom group or an ungrouped section, and optionally to a position among
	 * the sessions there. Without a placement, the sessions move to the placement
	 * of the session they are positioned against.
	 * @throws when the sessions cannot move there.
	 */
	async moveSessionsTo(sessions: readonly ISession[], placementId: string | undefined, position: SessionsListSessionPosition | undefined): Promise<void> {
		const anchorSession = typeof position === 'object' ? position.session : undefined;
		if (anchorSession && sessions.some(session => session.sessionId === anchorSession.sessionId)) {
			throw new Error(`Session "${anchorSession.sessionId}" cannot be positioned relative to itself.`);
		}
		if (placementId === undefined && !anchorSession) {
			throw new Error('Provide a destination, a session to position against, or both.');
		}
		if (placementId === SESSIONS_LIST_UNGROUPED_PLACEMENT && !anchorSession) {
			// Each session has its own ungrouped section.
			for (const [sectionId, sectionSessions] of groupByMap([...sessions], session => this.getUngroupedSectionId(session))) {
				await this.moveSessionsToPlacement(sectionSessions, { kind: 'section', sectionId }, position);
			}
			return;
		}
		const placement = placementId === undefined || placementId === SESSIONS_LIST_UNGROUPED_PLACEMENT
			? this.getSessionPlacement(anchorSession!)
			: getSectionPlacement(placementId);
		if (!placement || (placement.kind === 'group' && !this._sessionGroupsService.getGroup(placement.groupId))) {
			throw new Error(`"${placementId}" is not a placement that holds sessions.`);
		}
		if (placementId === SESSIONS_LIST_UNGROUPED_PLACEMENT && placement.kind !== 'section') {
			throw new Error(`Session "${anchorSession!.sessionId}" is not in an ungrouped section.`);
		}
		if (anchorSession && !isSamePlacement(this.getSessionPlacement(anchorSession), placement)) {
			throw new Error(`Session "${anchorSession.sessionId}" is not in "${placementId}".`);
		}
		await this.moveSessionsToPlacement(sessions, placement, position);
	}

	private async moveSessionsToPlacement(sessions: readonly ISession[], placement: SessionListPlacement, position: SessionsListSessionPosition | undefined): Promise<void> {
		// Archived sessions keep a fixed order.
		const anchor = placement.kind === 'archived' || position === undefined ? undefined
			: typeof position === 'object' ? { session: position.session, position: position.position, staysInSection: isDateSectionPlacement(placement) }
				: this.getEdgeAnchor(sessions, placement, position);
		const destination: ISessionDropDestination = { placement, anchor, restoresArchived: true };
		if (!anchor && !sessions.some(session => this.changesPlacement(session, placement))) {
			return;
		}
		if (!this.getSessionDropEffect(sessions, destination)) {
			const target = placement.kind === 'group' ? getSessionGroupSectionId(placement.groupId) : getPlacementHeader(placement).id;
			throw new Error(`The sessions cannot move to "${target}"${anchor ? ' at that position' : ''}: comparison groups own their membership, an ungrouped section only takes the sessions that render in it, and date sections only take sessions that their sort order places there.`);
		}
		await this.moveSessions(sessions, destination);
	}

	/** The section a session renders in when it is neither archived, pinned, nor grouped. */
	private getUngroupedSectionId(session: ISession): string {
		const sectionIds = this.getUngroupedSectionIds(session);
		return sectionIds.find(sectionId => this.getSessionDropEffect([session], { placement: { kind: 'section', sectionId }, restoresArchived: true }) !== undefined) ?? sectionIds[0];
	}

	/** Where a session renders: its row's placement, or for a row that capping hides, the placement its state selects. */
	private getSessionPlacement(session: ISession): SessionListPlacement {
		const rowPlacement = this.getRowPlacement(session);
		if (rowPlacement) {
			return rowPlacement;
		}
		if (session.isArchived.get()) {
			return { kind: 'archived' };
		}
		if (this.isSessionPinned(session)) {
			return { kind: 'pinned' };
		}
		const group = this.getRenderedSessionGroup(session);
		return group ? { kind: 'group', groupId: group.id } : { kind: 'section', sectionId: this.getUngroupedSectionIds(session)[0] };
	}

	/** The anchor that places sessions first or last among the other sessions the list composes into the placement. */
	private getEdgeAnchor(sessions: readonly ISession[], placement: SessionListPlacement, edge: 'top' | 'bottom'): ISessionDropAnchor | undefined {
		const movedIds = new Set(sessions.map(session => session.sessionId));
		const candidates = this.getComposedPlacementSessions(placement).filter(session => !movedIds.has(session.sessionId) && this.getReorderScope(session) !== undefined);
		const anchorSession = edge === 'top' ? candidates.at(0) : candidates.at(-1);
		return anchorSession && { session: anchorSession, position: edge === 'top' ? 'before' : 'after', staysInSection: isDateSectionPlacement(placement) };
	}

	/**
	 * The sessions the list composes into the placement, in display order and
	 * including those that capping hides. A section also lists the members of
	 * comparison groups nested in it, which belong to their group's placement.
	 */
	private getComposedPlacementSessions(placement: SessionListPlacement): readonly ISession[] {
		const header = placement.kind === 'group'
			? this.findTreeElement((element): element is ISessionGroupItem => isSessionGroupItem(element) && element.group.id === placement.groupId)
			: this.findTreeElement((element): element is ISessionSection => isSessionSection(element) && element.id === getPlacementHeader(placement).id)
			?? this.hiddenGroupingSections.find(section => section.id === getPlacementHeader(placement).id);
		return (header?.sessions ?? []).filter(session => isSamePlacement(this.getSessionPlacement(session), placement));
	}

	/**
	 * Moves a custom group or a workspace, repository, or environment section as
	 * dragging its header does: into the custom group with section id
	 * `parentId`, or to the top level when it is `undefined`, optionally next to
	 * one of its new siblings. A group nested without a sibling becomes the first
	 * child of its parent.
	 * @throws when the header cannot move there.
	 */
	moveHeaderTo(headerId: string, parentId: string | undefined, sibling: ISessionsListHeaderPosition | undefined): void {
		const groupId = getSessionGroupIdOfSection(headerId);
		if (groupId !== undefined) {
			if (!this._sessionGroupsService.getGroup(groupId)) {
				throw new Error(`Group "${headerId}" does not exist.`);
			}
			if (this.isComparisonGroup(groupId) && this.options.grouping() !== SessionsGrouping.Date) {
				throw new Error(`Comparison group "${headerId}" keeps its place inside its grouping section.`);
			}
		} else if (!isSessionGroupingSection(headerId) || this.options.grouping() === SessionsGrouping.Date) {
			throw new Error(`"${headerId}" cannot move: only custom groups and workspace, repository, or environment sections of the current grouping move.`);
		}
		if (sibling?.siblingId === headerId) {
			throw new Error(`"${headerId}" cannot be positioned relative to itself.`);
		}

		let drop: SessionHeaderDrop;
		if (parentId === undefined) {
			if (!sibling) {
				// The list arranges a top-level header among the others.
				if (groupId !== undefined) {
					this._sessionGroupsService.moveGroup(groupId, undefined);
				} else {
					this._sessionGroupsService.moveSection(this.getSectionGroupKey(headerId), undefined);
				}
				return;
			}
			if (!this._topLevelOrder.includes(sibling.siblingId)) {
				throw new Error(`"${sibling.siblingId}" is not a top-level header that can be ordered.`);
			}
			drop = { kind: 'topLevel', targetId: sibling.siblingId, position: sibling.position };
		} else {
			const parentGroupId = getSessionGroupIdOfSection(parentId);
			if (parentGroupId === undefined || !this.canHoldSubgroups(parentGroupId)) {
				throw new Error(`"${parentId}" is not a custom group that can hold groups and sections.`);
			}
			if (groupId !== undefined && !this.canNestGroup(groupId, parentGroupId)) {
				throw new Error(`"${headerId}" cannot move into "${parentId}": a group never moves into itself or one of its subgroups.`);
			}
			if (sibling) {
				const siblingKey = getSessionGroupIdOfSection(sibling.siblingId) ?? this.getSectionGroupKey(sibling.siblingId);
				if (!this._sessionGroupsService.getChildIds(parentGroupId).includes(siblingKey)) {
					throw new Error(`"${sibling.siblingId}" is not a group or section nested directly in "${parentId}".`);
				}
				drop = { kind: 'subgroup', parentId: parentGroupId, depth: 0, placement: { siblingId: siblingKey, position: sibling.position } };
			} else {
				drop = { kind: 'into', groupId: parentGroupId };
			}
		}
		this.applyHeaderDrop(headerId, groupId, drop);
	}

	/**
	 * Collapses or expands the section or group header with the given section id.
	 * @throws when the list does not show the header.
	 */
	setHeaderCollapsed(headerId: string, collapsed: boolean): void {
		const header = this.findTreeElement((element): element is ISessionSection | ISessionGroupItem =>
			isSessionGroupItem(element) ? getSessionGroupSectionId(element.group.id) === headerId : isSessionSection(element) && element.id === headerId && !isShortcutSection(element.id));
		if (!header) {
			throw new Error(`The list does not show a section or group "${headerId}".`);
		}
		if (collapsed) {
			this.tree.collapse(header);
		} else {
			this.tree.expand(header);
		}
	}

	/**
	 * Creates an empty custom group, nested first in the custom group with
	 * section id `parentId` when given.
	 * @throws when the parent cannot hold groups.
	 */
	addGroup(name: string, parentId: string | undefined): ISessionGroup {
		const parentGroupId = parentId === undefined ? undefined : getSessionGroupIdOfSection(parentId);
		if (parentId !== undefined && (parentGroupId === undefined || !this.canHoldSubgroups(parentGroupId))) {
			throw new Error(`"${parentId}" is not a custom group that can hold groups.`);
		}
		if (parentGroupId !== undefined) {
			this.saveSectionCollapseState(getSessionGroupSectionId(parentGroupId), false);
		}
		return this._sessionGroupsService.createGroup(name, [], parentGroupId);
	}

	/**
	 * Renames the custom group with the given section id.
	 * @throws when the group does not exist or is a comparison group.
	 */
	renameGroup(headerId: string, name: string): void {
		this._sessionGroupsService.renameGroup(this.getEditableGroupId(headerId), name);
	}

	/**
	 * Deletes the custom group with the given section id as its Delete Group
	 * action does, offering Undo when subgroups or nested sections are affected.
	 * @throws when the group does not exist or is a comparison group.
	 */
	async deleteGroup(headerId: string): Promise<void> {
		await this.commandService.executeCommand(DELETE_SESSION_GROUP_WITH_UNDO_COMMAND_ID, this.getEditableGroupId(headerId));
	}

	private getEditableGroupId(headerId: string): string {
		const groupId = getSessionGroupIdOfSection(headerId);
		if (groupId === undefined || !this._sessionGroupsService.getGroup(groupId)) {
			throw new Error(`Group "${headerId}" does not exist.`);
		}
		if (this.isComparisonGroup(groupId)) {
			throw new Error(`Comparison group "${headerId}" is managed by its comparison.`);
		}
		return groupId;
	}

	/**
	 * The set of top-level reorder identities that currently exist (every
	 * top-level group, plus every workspace label and repository present across
	 * all sessions,
	 * regardless of grouping mode or capping). Used to garbage-collect stale
	 * manual order and promotion entries. Reads sessions fresh from the
	 * management service so it reflects the latest loaded state even when the
	 * list is not visible.
	 */
	private liveSectionOrderIds(): Set<string> {
		const ids = new Set<string>();
		for (const group of this._sessionGroupsService.getTree().getSubgroups(undefined)) {
			ids.add(getSessionGroupSectionId(group.id));
		}
		for (const session of this._sessionsManagementService.getSessions()) {
			ids.add(`workspace:${sessionWorkspaceLabel(session)}`);
			ids.add(`${ENVIRONMENT_SECTION_PREFIX}${session.environment}`);
			const repository = getSessionRepository(session);
			if (repository) {
				ids.add(getRepositorySectionId(repository));
			}
		}
		return ids;
	}

	private setDropTargetHeader(header: ISessionDropTargetHeader | undefined): void {
		const current = this._dropTargetHeader;
		if (current?.kind === header?.kind && current?.id === header?.id) {
			this.toggleDropTargetHeader(header, header !== undefined);
			return;
		}
		this.toggleDropTargetHeader(current, false);
		this._dropTargetHeader = header;
		this.toggleDropTargetHeader(header, true);
	}

	private toggleDropTargetHeader(header: ISessionDropTargetHeader | undefined, active: boolean): void {
		if (!header) {
			return;
		}
		if (header.kind === 'group') {
			this._groupRenderer.setDropTarget(header.id, active);
		} else {
			this._sectionRenderer.setDropTarget(header.id, active);
		}
	}

	private showAutomationsContextMenu(anchor: ITreeContextMenuEvent<SessionListItem>['anchor']): void {
		this.contextMenuService.showContextMenu({
			menuId: Menus.AutomationsContext,
			contextKeyService: this.contextKeyService,
			getAnchor: () => anchor,
		});
	}

	private getMultiSelectedSessions(session: ISession): ISession[] {
		const selection = this.tree.getSelection().filter((s): s is ISession => !!s && isSessionItem(s));
		return selection.includes(session) ? [session, ...selection.filter(s => s !== session)] : [session];
	}

	private onContextMenu(e: ITreeContextMenuEvent<SessionListItem | null>): void {
		const element = e.element;
		if (element && isSessionChatItem(element)) {
			this.showChatContextMenu(element, e.anchor);
			return;
		}
		if (!element || isSessionShowMore(element) || isSessionPlaceholder(element)) {
			this.showCreateGroupContextMenu(e.anchor);
			return;
		}

		if (isSessionSection(element)) {
			if (element.id === AUTOMATIONS_SECTION_ID) {
				this.showAutomationsContextMenu(e.anchor);
				return;
			}
			if (isShortcutSection(element.id)) {
				return;
			}
			this.showSectionContextMenu(element, e.anchor);
			return;
		}

		if (isSessionGroupItem(element)) {
			this.showGroupContextMenu(element, e.anchor);
			return;
		}

		const selectedSessions = this.getMultiSelectedSessions(element);

		const inGroup = this._sessionGroupsService.getGroupOfSession(element.sessionId) !== undefined;
		const contextOverlay: [string, boolean | string][] = [
			[IsSessionPinnedContext.key, this.isSessionPinned(element)],
			[SessionItemIsMultiSelectionContext.key, selectedSessions.length > 1],
			[SessionItemHasUnreadNestedSessionsContext.key, selectedSessions.some(session =>
				!session.isArchived.get()
				&& session.capabilities.get().supportsIndependentChatReadState === true
				&& getSessionListChats(session).some(chat => !chat.isRead.get()))],
			[SessionIsArchivedContext.key, element.isArchived.get()],
			[SessionIsReadContext.key, element.mainChat.get().isRead.get()],
			[SessionItemInGroupContext.key, inGroup],
			[SessionItemInExternalSectionContext.key, this.isRenderedInExternalSection(element)],
			[SessionItemCanImportContext.key, element.isExternal?.get() === true && element.capabilities.get().supportsImport === true],
			[SessionTypeContext.key, element.sessionType],
			[SessionProviderIdContext.key, element.providerId],
			[SessionSupportsMultipleChatsContext.key, element.capabilities.get().supportsMultipleChats],
			[SessionSupportsRenameContext.key, element.capabilities.get().supportsRename ?? false],
			[SessionSupportsDeleteContext.key, element.capabilities.get().supportsDelete ?? false],
			[IsQuickChatSessionContext.key, element.isQuickChat?.get() ?? false],
			[SessionHasPullRequestContext.key, !!element.workspace.get()?.folders[0]?.gitRepository?.gitHubInfo.get()?.pullRequest],
		];

		const disposables = new DisposableStore();
		this._sessionContextMenuDisposables.value = disposables;
		const menu = disposables.add(this.menuService.createMenu(SessionItemContextMenuId, this.contextKeyService.createOverlay(contextOverlay)));

		// Extension contributions on this menu need a marshalled AgentSessionContext arg; built-in actions take ISession[].
		const marshalledArg = {
			$mid: MarshalledId.AgentSessionContext,
			session: { resource: element.resource },
			sessions: selectedSessions.map(s => ({ resource: s.resource })),
		};
		const wrapAction = (action: IAction): IAction => {
			if (action.id === RENAME_SESSION_COMMAND_ID) {
				return toAction({
					id: action.id,
					label: action.label,
					class: action.class,
					enabled: action.enabled,
					tooltip: action.tooltip,
					checked: action.checked,
					run: () => this.beginRenameSession(element),
				});
			}
			if (!(action instanceof MenuItemAction) || !action.item.source) {
				return action;
			}
			return toAction({
				id: action.id,
				label: action.label,
				class: action.class,
				enabled: action.enabled,
				tooltip: action.tooltip,
				checked: action.checked,
				run: () => this.commandService.executeCommand(action.id, marshalledArg),
			});
		};

		const baseActions = Separator.join(...menu.getActions({ arg: selectedSessions, shouldForwardArgs: true }).map(([, actions]) => actions.map(wrapAction)));
		const groupActions = this.getGroupSessionActions(selectedSessions);
		const actions = groupActions.length > 0 ? [...baseActions, new Separator(), ...groupActions] : baseActions;
		if (actions.length === 0) {
			this._sessionContextMenuDisposables.clear();
			return;
		}

		this.contextMenuService.showContextMenu({
			getActions: () => actions,
			getAnchor: () => e.anchor,
			getKeyBinding: (action) => this.keybindingService.lookupKeybinding(action.id) ?? undefined,
			onHide: () => {
				if (this._sessionContextMenuDisposables.value === disposables) {
					this._sessionContextMenuDisposables.clear();
				} else {
					disposables.dispose();
				}
			},
		});
	}

	private showChatContextMenu(element: ISessionChatItem, anchor: ITreeContextMenuEvent<SessionListItem | null>['anchor']): void {
		const capabilities = getChatCapabilities(element.chat, element.session, undefined);
		const contextKeyService = this.contextKeyService.createOverlay([
			[SessionChatItemCanRenameContext.key, capabilities.canRename],
			[SessionChatItemCanArchiveContext.key, capabilities.canArchive],
			[SessionChatItemCanDeleteContext.key, capabilities.canDelete],
			[SessionChatItemIsArchivedContext.key, element.chat.isArchived.get()],
			[SessionChatItemIsReadContext.key, element.chat.isRead.get()],
			[SessionChatItemCanSetReadStateContext.key, isEqual(element.chat.resource, element.session.mainChat.get().resource) || element.session.capabilities.get().supportsIndependentChatReadState === true],
			[SessionChatItemIsUntitledContext.key, element.chat.status.get() === SessionStatus.Untitled],
			[SessionChatItemIsStandaloneContext.key, !!element.standalone],
			[SessionChatItemCanMoveUpContext.key, this.getAdjacentChatMove(element, 'up') !== undefined],
			[SessionChatItemCanMoveDownContext.key, this.getAdjacentChatMove(element, 'down') !== undefined],
			[SessionChatItemCanMoveContext.key, this._sessionsManagementService.canMoveChat(element.session, element.chat)],
			[SessionProviderIdContext.key, element.session.providerId],
		]);
		const menu = this.menuService.createMenu(Menus.SessionChatItemContext, contextKeyService);
		const wrapAction = (action: IAction): IAction => action.id === RENAME_CHAT_COMMAND_ID
			? toAction({
				id: action.id,
				label: action.label,
				class: action.class,
				enabled: action.enabled,
				tooltip: action.tooltip,
				checked: action.checked,
				run: () => this.beginRenameChat(element),
			})
			: action;
		const actions = Separator.join(...menu.getActions({ arg: element, shouldForwardArgs: true }).map(([, groupActions]) => groupActions.map(wrapAction)));
		if (actions.length === 0) {
			menu.dispose();
			return;
		}
		this.contextMenuService.showContextMenu({
			getActions: () => actions,
			getAnchor: () => anchor,
			getKeyBinding: action => this.keybindingService.lookupKeybinding(action.id) ?? undefined,
			onHide: () => menu.dispose(),
		});
	}

	/**
	 * Build the group-related context menu actions for the given session(s):
	 * "Create Group", an "Add to Group"/"Move to Group" submenu listing the
	 * groups in display order, named by their path, and "Remove from Group"
	 * when applicable.
	 */
	private getGroupSessionActions(selected: ISession[]): IAction[] {
		const actions: IAction[] = [];
		if (selected.some(session => session.isArchived.get() || this.isActiveComparisonSession(session))) {
			return actions;
		}

		actions.push(this.getCreateGroupAction(selected));

		const currentGroupIds = new Set(selected.map(s => this._sessionGroupsService.getGroupOfSession(s.sessionId)));
		const currentGroupId = currentGroupIds.size === 1 ? [...currentGroupIds][0] : undefined;

		const groups = this.getGroupsInDisplayOrder();
		const groupTree = this._sessionGroupsService.getTree();
		const targetGroups = groups.filter(g => g.id !== currentGroupId);
		if (targetGroups.length > 0) {
			const subActions = targetGroups.map(g => toAction({
				id: `sessions.addToGroup.${g.id}`,
				label: getSessionGroupPathLabel(groupTree.getPath(g.id)),
				run: () => this.addSessionsToGroup(selected, g.id),
			}));
			const label = currentGroupId !== undefined ? localize('moveToGroupAction', "Move to Group") : localize('addToGroupAction', "Add to Group");
			actions.push(new SubmenuAction('sessions.addToGroupSubmenu', label, subActions));
		}

		if (currentGroupId !== undefined) {
			actions.push(toAction({
				id: 'sessions.removeFromGroup',
				label: localize('removeFromGroupAction', "Remove from Group"),
				run: () => {
					for (const session of selected) {
						this._sessionGroupsService.removeFromGroup(session.sessionId);
					}
				},
			}));
		}

		return actions;
	}

	private isActiveComparisonSession(session: ISession): boolean {
		const comparison = this.sessionComparisonService.getComparisonForSession(session.resource);
		return comparison !== undefined && comparison.archivedAt === undefined;
	}

	private getCreateGroupAction(sessions?: ISession[]): IAction {
		return toAction({
			id: 'sessions.createGroup',
			label: localize('createGroupAction', "Create Group"),
			run: () => {
				if (sessions) {
					this.createGroupFromSessions(sessions);
				} else {
					this.createGroup([]);
				}
			},
		});
	}

	private showCreateGroupContextMenu(anchor: ITreeContextMenuEvent<SessionListItem | null>['anchor']): void {
		this.contextMenuService.showContextMenu({
			getActions: () => [this.getCreateGroupAction()],
			getAnchor: () => anchor,
		});
	}

	private getMarkAllSessionsReadAction(getSessions: () => readonly ISession[]): IAction {
		return toAction({
			id: 'sessionsViewPane.markAllInSectionRead',
			label: localize('markAllInSectionRead', "Mark All as Read"),
			run: () => {
				const sessions = getSessions().filter(session => !isAutomationSession(session) && !session.isArchived.get() && !session.isRead.get());
				return this._sessionsManagementService.markAllRead(sessions);
			},
		});
	}

	private showSectionContextMenu(section: ISessionSection, anchor: ITreeContextMenuEvent<SessionListItem>['anchor']): void {
		const actions: IAction[] = [];
		if (section.id === EXTERNAL_SESSIONS_SECTION_ID) {
			const contextKeyService = this.contextKeyService.createOverlay([[SessionSectionTypeContext.key, EXTERNAL_SESSIONS_SECTION_ID]]);
			actions.push(...getFlatContextMenuActions(this.menuService.getMenuActions(SessionSectionToolbarMenuId, contextKeyService, { arg: section, shouldForwardArgs: true })), new Separator());
		}
		const grouping = this.options.grouping();
		if (grouping !== SessionsGrouping.Date && isSessionGroupingSection(section.id)) {
			actions.push(this.getMarkAllSessionsReadAction(() => this.sessions.filter(session => getSessionGroupingSectionId(session, grouping) === section.id)));
			const parentId = this.getSectionParentId(section.id);
			const groups = this.getGroupsInDisplayOrder().filter(group => this.canHoldSubgroups(group.id));
			if (groups.length > 0) {
				actions.push(new Separator(), new SubmenuAction('sessions.moveSectionToGroup', localize('moveSectionToGroup', "Move to Group"), groups.map(group => toAction({
					id: `sessions.moveSectionToGroup.${group.id}`,
					label: getSessionGroupPathLabel(this._sessionGroupsService.getTree().getPath(group.id)),
					checked: group.id === parentId,
					enabled: group.id !== parentId,
					run: () => this.moveSectionToGroup(section, group.id),
				}))));
			}
			if (parentId !== undefined) {
				actions.push(toAction({
					id: 'sessions.removeSectionFromGroup',
					label: localize('removeSectionFromGroup', "Remove from Group"),
					run: () => this.moveSectionToGroup(section, undefined),
				}));
			}
			actions.push(new Separator(), ...this.getGroupAppearanceActions(
				this._sessionGroupsService.getSectionAppearance(section.id),
				icon => this._sessionGroupsService.setSectionIcon(section.id, icon),
				color => this._sessionGroupsService.setSectionColor(section.id, color),
			), new Separator());
		}
		actions.push(this.getCreateGroupAction());
		this.contextMenuService.showContextMenu({
			getActions: () => actions,
			getAnchor: () => anchor,
		});
	}

	private moveSectionToGroup(section: ISessionSection, parentId: string | undefined): void {
		if (parentId !== undefined) {
			this.moveHeader({ id: section.id }, { kind: 'into', groupId: parentId });
		} else {
			const targetId = this._topLevelOrder[0];
			if (targetId !== undefined) {
				this.moveHeader({ id: section.id }, { kind: 'topLevel', targetId, position: 'after' });
			} else {
				this._sessionGroupsService.moveSection(this.getSectionGroupKey(section.id), undefined);
			}
		}
		const element = this.findTreeElement((element): element is ISessionSection => isSessionSection(element) && element.id === section.id);
		if (element) {
			this.tree.expandTo(element);
			this.tree.reveal(element);
			this.tree.setFocus([element]);
			this.tree.domFocus();
		}
		const parent = parentId === undefined ? undefined : this._sessionGroupsService.getGroup(parentId);
		aria.status(parent
			? localize('sectionMovedToGroup', "Moved {0} to {1}", section.label, parent.name)
			: localize('sectionRemovedFromGroup', "Removed {0} from its group", section.label));
	}

	private getDeleteGroupAction(groupItem: ISessionGroupItem): IAction {
		return toAction({
			id: 'sessions.deleteGroupAction',
			label: localize('deleteGroupAction', "Delete Group"),
			run: () => this.commandService.executeCommand(DELETE_SESSION_GROUP_WITH_UNDO_COMMAND_ID, groupItem.group.id),
		});
	}

	private getCreateSubgroupAction(groupItem: ISessionGroupItem): IAction {
		return toAction({
			id: 'sessions.createSubgroup',
			label: localize('createSubgroupAction', "Create Subgroup"),
			run: () => this.createSubgroup(groupItem.group.id),
		});
	}

	private getGroupAppearanceActions(appearance: ISessionGroupAppearance | undefined, setIcon: (icon: string | undefined) => void, setColor: (color: string | undefined) => void): IAction[] {
		return [
			toAction({
				id: 'sessions.changeGroupIcon',
				label: localize('changeGroupIcon', "Change Icon..."),
				run: () => this.groupAppearancePicker.changeIcon(setIcon),
			}),
			toAction({
				id: 'sessions.changeGroupColor',
				label: localize('changeGroupColor', "Change Color..."),
				run: () => this.groupAppearancePicker.changeColor(appearance?.color, setColor),
			}),
		];
	}

	private showGroupContextMenu(groupItem: ISessionGroupItem, anchor: ITreeContextMenuEvent<SessionListItem>['anchor']): void {
		const actions: IAction[] = [];
		const comparison = groupItem.comparison;
		if (this.options.grouping() !== SessionsGrouping.Date && !groupItem.isEmpty) {
			actions.push(this.getMarkAllSessionsReadAction(() => {
				const subtree = this._sessionGroupsService.getTree().getSubtree(groupItem.group.id);
				const sessionIds = new Set(subtree.flatMap(group => this._sessionGroupsService.getSessionIdsInGroup(group.id)));
				const groupIds = new Set(subtree.map(group => group.id));
				return this.sessions.filter(session => {
					const renderedGroup = this.getRenderedSessionGroup(session);
					const sectionId = renderedGroup
						? this.comparisonSectionIds.get(renderedGroup.id)
						: this.getUngroupedSectionIds(session)[0];
					const parentId = sectionId === undefined ? undefined : this.getSectionParentId(sectionId);
					return sessionIds.has(session.sessionId)
						|| (!session.isArchived.get() && !this.isSessionPinned(session) && parentId !== undefined && groupIds.has(parentId));
				});
			}), new Separator());
		}
		actions.push(this.canHoldSubgroups(groupItem.group.id) ? this.getCreateSubgroupAction(groupItem) : this.getCreateGroupAction());
		if (!comparison) {
			actions.push(
				new Separator(),
				...this.getGroupAppearanceActions(
					groupItem.group,
					icon => this._sessionGroupsService.setGroupIcon(groupItem.group.id, icon),
					color => this._sessionGroupsService.setGroupColor(groupItem.group.id, color),
				),
				new Separator(),
				toAction({
					id: 'sessions.renameGroupAction',
					label: localize('renameGroupAction', "Rename..."),
					run: () => this.beginRenameGroup(groupItem.group.id),
				}),
				this.getDeleteGroupAction(groupItem),
			);
		} else {
			if (this.sessionComparisonService.canRetryJudge(comparison.id)) {
				actions.push(
					new Separator(),
					toAction({
						id: 'sessions.retryComparisonJudge',
						label: localize('retryComparisonJudge', "Retry Judge"),
						run: () => this.sessionComparisonService.retryJudge(comparison.id),
					}),
				);
			}
			const comparisonRecord = this.sessionComparisonService.getComparison(comparison.id);
			const comparisonSessions = comparisonRecord ? getComparisonSessions(comparisonRecord, this._sessionsManagementService) : [];
			// Deleting while attempts are still launching would retire the comparison under its in-flight launches.
			if (comparisonRecord?.launching !== true && !comparisonSessions.some(session => isSessionActive(session, undefined))) {
				actions.push(new Separator(), this.getDeleteGroupAction(groupItem));
			}
		}
		this.contextMenuService.showContextMenu({
			getActions: () => actions,
			getAnchor: () => anchor,
		});
	}

	resetSectionCollapseState(): void {
		// Custom groups and shared sections (Pinned, Chats, External, Done) keep
		// their tree identity across a grouping change, so the tree preserves their
		// collapse state. Dropping it from storage would make them silently reopen
		// on the next restart.
		const state = this.readSectionCollapseState();
		for (const sectionId of Object.keys(state)) {
			if (isGroupingSpecificCollapseStateId(sectionId)) {
				delete state[sectionId];
			}
		}
		this.writeSectionCollapseState(state);
	}

	// -- Pinning --

	pinSession(session: ISession): void {
		this._sessionsListModelService.pinSession(session);
	}

	unpinSession(session: ISession): void {
		this._sessionsListModelService.unpinSession(session);
	}

	isSessionPinned(session: ISession): boolean {
		return this._sessionsListModelService.isSessionPinned(session);
	}

	getRenderedSessionGroup(session: ISession): ISessionGroup | undefined {
		if (session.isArchived.get() || this.isSessionPinned(session)) {
			return undefined;
		}
		const groupId = this._sessionGroupsService.getGroupOfSession(session.sessionId);
		return groupId === undefined ? undefined : this._sessionGroupsService.getGroup(groupId);
	}

	isRenderedInCustomGroup(session: ISession): boolean {
		return this.getRenderedSessionGroup(session) !== undefined;
	}

	/**
	 * How many groups deep the custom group whose rows include the row is nested:
	 * rows step in by one level per group. Rows outside custom groups, such as a
	 * done chat listed in the Done section, don't step in.
	 */
	private getRowGroupDepth(element: ISession | ISessionChatItem | ISessionShowMore | ISessionPlaceholder | ISessionSection): number {
		let groupId: string | undefined;
		let sectionId: string | undefined;
		if (isSessionSection(element)) {
			sectionId = element.id;
		} else if (isSessionShowMore(element) || isSessionPlaceholder(element)) {
			groupId = getSessionGroupIdOfSection(element.sectionId);
			sectionId = element.sectionId;
		} else if (isSessionChatItem(element)) {
			groupId = element.standalone ? undefined : this.getRenderedSessionGroup(element.session)?.id;
			sectionId = element.standalone || element.session.isArchived.get() || this.isSessionPinned(element.session) ? undefined : this.getUngroupedSectionIds(element.session)[0];
		} else {
			groupId = this.getRenderedSessionGroup(element)?.id;
			sectionId = element.isArchived.get() || this.isSessionPinned(element) ? undefined : this.getUngroupedSectionIds(element)[0];
		}
		if (groupId === undefined && sectionId !== undefined) {
			const parentId = this.getSectionParentId(sectionId);
			if (parentId !== undefined) {
				return (this.groupDepths.get(parentId) ?? 0) + 1;
			}
		}
		return groupId === undefined ? 0 : this.groupDepths.get(groupId) ?? 0;
	}

	private getSectionParentId(sectionId: string): string | undefined {
		const parentId = isSessionGroupingSection(sectionId) ? this._sessionGroupsService.getGroupOfSection(this.getSectionGroupKey(sectionId)) : undefined;
		return parentId !== undefined && this.canHoldSubgroups(parentId) ? parentId : undefined;
	}

	private getSectionGroupKey(sectionId: string): string {
		// Repository grouping's workspace fallback has placement independent of Workspace mode.
		return this.options.grouping() === SessionsGrouping.Repository && sectionId.startsWith('workspace:')
			? `${REPOSITORY_SECTION_PREFIX}${sectionId}`
			: sectionId;
	}

	private isComparisonGroup(groupId: string): boolean {
		return this.sessionComparisonService.comparisons.get().some(comparison => comparison.groupId === groupId);
	}

	private shouldShowComparisonAttemptStatus(session: ISession, reader: IReader): boolean {
		const comparison = this.sessionComparisonService.getComparisonForSession(session.resource);
		if (!comparison) {
			return false;
		}
		if (getSessionRowStatus(session, reader, false) === SessionStatus.InProgress) {
			return true;
		}
		const statuses = comparison.participants
			.filter(participant => participant.role === SessionComparisonParticipantRole.Attempt)
			.map(participant => {
				if (participant.launchError) {
					return SessionStatus.Error;
				}
				const attemptSession = participant.sessionResource
					? this.sessions.find(candidate => isEqual(candidate.resource, participant.sessionResource))
					: undefined;
				return attemptSession?.status.read(reader);
			});
		return statuses.includes(SessionStatus.Error) || new Set(statuses).size > 1;
	}

	private get groupExternalSessions(): boolean {
		return this.configurationService.getValue<boolean>(SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING) === true;
	}

	private isRenderedInExternalSection(session: ISession): boolean {
		return this.groupExternalSessions
			&& session.isExternal?.get() === true
			&& !session.isArchived.get()
			&& !this.isSessionPinned(session)
			&& !this.isRenderedInCustomGroup(session);
	}

	/**
	 * Where a session in a repository section runs, which its row shows because the
	 * section spans environments. Sessions on this computer, the default, show none.
	 */
	private getEnvironmentBadgeLabel(session: ISession): string | undefined {
		if (session.environment === 'local' || !getSessionRepository(session)) {
			return undefined;
		}
		return this._sessionsProvidersService.getProvider(session.providerId)?.environment.label;
	}

	/**
	 * The New Session dropdown's entries for a repository section with sessions in
	 * several available environments: one per environment, starting in the workspace
	 * of its most recently created session there.
	 */
	private getNewSessionEnvironmentActions(section: ISessionSection): readonly IAction[] {
		const sources = section.repository ? getNewSessionSources(section.sessions, this._sessionsProvidersService) : [];
		if (sources.length < 2) {
			return [];
		}
		return sources.map(({ environment }) => toAction({
			id: `${NEW_SESSION_IN_ENVIRONMENT_ACTION_ID}.${environment.id}`,
			label: environment.id === 'cloud'
				? localize('newSessionInCloud', "New Session in {0}", environment.label)
				: localize('newSessionOnEnvironment', "New Session on {0}", environment.label),
			run: () => this.commandService.executeCommand(NEW_SESSION_IN_ENVIRONMENT_ACTION_ID, section, environment.id),
		}));
	}

	/** Whether any registered provider can create quick chats (gates the always-visible "Chats" section). */
	private _someProviderSupportsQuickChats(): boolean {
		return this._sessionsProvidersService.getProviders().some(p => !!p.supportsQuickChats);
	}

	// -- Read/Unread --

	/** Opens a session the same way as clicking its row. */
	openSession(session: ISession): void {
		this.beginOpenRequest(session, undefined, false, false).catch(onUnexpectedError);
	}

	markRead(session: ISession): void {
		this._sessionsManagementService.markRead(session);
	}

	markUnread(session: ISession): void {
		this._sessionsManagementService.markUnread(session);
	}

	// -- Archived filtering --

	setExcludeArchived(exclude: boolean): void {
		this.applyExcludeArchived(exclude);
		this.update();
	}

	isExcludeArchived(): boolean {
		return this._excludeArchived;
	}

	/** Records the archived filter choice; `undefined` follows {@link SESSIONS_LIST_SHOW_ARCHIVED_BY_DEFAULT_SETTING} again. */
	private applyExcludeArchived(exclude: boolean | undefined): void {
		this._excludeArchivedIsDefault = exclude === undefined;
		this._excludeArchived = exclude ?? this.excludesArchivedByDefault();
		if (exclude === undefined) {
			this.storageService.remove(SessionsList.EXCLUDE_ARCHIVED_KEY, StorageScope.PROFILE);
		} else {
			this.storageService.store(SessionsList.EXCLUDE_ARCHIVED_KEY, exclude, StorageScope.PROFILE, StorageTarget.USER);
		}
	}

	private excludesArchivedByDefault(): boolean {
		return this.configurationService.getValue<boolean>(SESSIONS_LIST_SHOW_ARCHIVED_BY_DEFAULT_SETTING) !== true;
	}

	/** Reports the Done-default experiment trigger when a Done option is shown whose state still follows that default. */
	reportFilterMenuShown(): void {
		if (this._excludeArchivedIsDefault) {
			logSettingExperimentTrigger(this.telemetryService, SESSIONS_LIST_SHOW_ARCHIVED_BY_DEFAULT_SETTING);
		}
	}

	resetFilters(): () => void {
		const restores = this.resettableStates.map(state => state.capture());
		for (const state of this.resettableStates) {
			state.reset();
		}
		this.update();
		return () => {
			for (const restore of restores) {
				restore();
			}
			this.update();
		};
	}

	// Session group capping

	setWorkspaceGroupCapped(capped: boolean): void {
		this.applyWorkspaceGroupCapped(capped);
		this.update();
	}

	private applyWorkspaceGroupCapped(capped: boolean): void {
		this.workspaceGroupCapped = capped;
		this.storageService.store(SessionsList.WORKSPACE_GROUP_CAPPED_KEY, capped, StorageScope.PROFILE, StorageTarget.USER);
	}

	isWorkspaceGroupCapped(): boolean {
		return this.workspaceGroupCapped;
	}

	setOpenWindowSourceFolder(folder: URI | undefined): void {
		const before = this.openWindowSourceFolder?.toString();
		const after = folder?.toString();
		if (before === after) {
			return;
		}
		this.openWindowSourceFolder = folder;
		this.update();
	}

	collapseAllSections(): void {
		this.suspendCollapseStatePersistence = true;
		try {
			this.tree.collapseAll();
		} finally {
			this.suspendCollapseStatePersistence = false;
		}
		this.saveBulkCollapseState(true);
	}

	// -- Section collapse persistence --

	private getSavedCollapseState(sectionId: string, legacySectionId?: string): boolean | undefined {
		const raw = this.storageService.get(SessionsList.SECTION_COLLAPSE_STATE_KEY, StorageScope.PROFILE);
		if (raw) {
			try {
				const state: Record<string, boolean> = JSON.parse(raw);
				if (typeof state[sectionId] === 'boolean') {
					return state[sectionId];
				}
				if (legacySectionId && typeof state[legacySectionId] === 'boolean') {
					const collapsed = state[legacySectionId];
					delete state[legacySectionId];
					state[sectionId] = collapsed;
					this.storageService.store(SessionsList.SECTION_COLLAPSE_STATE_KEY, JSON.stringify(state), StorageScope.PROFILE, StorageTarget.USER);
					return collapsed;
				}
			} catch {
				// ignore corrupt data
			}
		}
		return undefined;
	}

	private readSectionCollapseState(): Record<string, boolean> {
		const raw = this.storageService.get(SessionsList.SECTION_COLLAPSE_STATE_KEY, StorageScope.PROFILE);
		if (raw) {
			try {
				const parsed = JSON.parse(raw);
				if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
					return parsed;
				}
			} catch {
				// ignore corrupt data
			}
		}
		return {};
	}

	private writeSectionCollapseState(state: Record<string, boolean>): void {
		if (Object.keys(state).length === 0) {
			this.storageService.remove(SessionsList.SECTION_COLLAPSE_STATE_KEY, StorageScope.PROFILE);
		} else {
			this.storageService.store(SessionsList.SECTION_COLLAPSE_STATE_KEY, JSON.stringify(state), StorageScope.PROFILE, StorageTarget.USER);
		}
	}

	private saveSectionCollapseState(sectionId: string, collapsed: boolean): void {
		const state = this.readSectionCollapseState();
		state[sectionId] = collapsed;
		this.writeSectionCollapseState(state);
	}

	private saveBulkCollapseState(collapsed: boolean): void {
		// Merge so that sections and groups this tree does not currently render keep their state.
		const state = this.readSectionCollapseState();
		const collectSections = (node: ITreeNode<SessionListItem | null, FuzzyScore | undefined>): void => {
			const element = node.element;
			if (element && isSessionGroupItem(element)) {
				state[getSessionGroupSectionId(element.group.id)] = collapsed;
			} else if (element && isSessionSection(element) && !isShortcutSection(element.id)) {
				state[element.collapseStateId ?? element.id] = collapsed;
			}
			for (const child of node.children) {
				collectSections(child);
			}
		};
		collectSections(this.tree.getNode(null));
		this.writeSectionCollapseState(state);
	}

	private loadCollapsedSessionResources(): Set<string> {
		const raw = this.storageService.get(SessionsList.SESSION_COLLAPSE_STATE_KEY, StorageScope.PROFILE);
		if (raw) {
			try {
				const resources = JSON.parse(raw);
				if (Array.isArray(resources)) {
					return new Set(resources.filter(resource => typeof resource === 'string'));
				}
			} catch {
				// Ignore corrupt persisted state.
			}
		}
		return new Set();
	}

	private saveSessionCollapseState(session: ISession, collapsed: boolean): void {
		const resource = session.resource.toString();
		const changed = collapsed
			? !this.collapsedSessionResources.has(resource)
			: this.collapsedSessionResources.delete(resource);
		if (!changed) {
			return;
		}
		if (collapsed) {
			this.collapsedSessionResources.add(resource);
		}
		if (this.collapsedSessionResources.size === 0) {
			this.storageService.remove(SessionsList.SESSION_COLLAPSE_STATE_KEY, StorageScope.PROFILE);
		} else {
			this.storageService.store(SessionsList.SESSION_COLLAPSE_STATE_KEY, JSON.stringify([...this.collapsedSessionResources]), StorageScope.PROFILE, StorageTarget.USER);
		}
	}

	// -- Session group show more/show less persistence --

	private loadSessionGroupExpansion(): Map<string, boolean> {
		const raw = this.storageService.get(SessionsList.SESSION_GROUP_EXPANSION_STATE_KEY, StorageScope.PROFILE);
		if (raw) {
			try {
				const state = JSON.parse(raw);
				if (typeof state === 'object' && state !== null && !Array.isArray(state)) {
					return new Map(Object.entries(state).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean'));
				}
			} catch {
				// Ignore corrupt persisted state.
			}
		}
		return new Map();
	}

	/** Records the choice by merging into the stored state, so choices saved by other windows are kept. */
	private saveSessionGroupExpanded(stateId: string, expanded: boolean): void {
		const state = this.loadSessionGroupExpansion();
		state.set(stateId, expanded);
		this.storeSessionGroupExpansion(state);
	}

	private storeSessionGroupExpansion(state: ReadonlyMap<string, boolean>): void {
		if (state.size === 0) {
			this.storageService.remove(SessionsList.SESSION_GROUP_EXPANSION_STATE_KEY, StorageScope.PROFILE);
		} else {
			this.storageService.store(SessionsList.SESSION_GROUP_EXPANSION_STATE_KEY, JSON.stringify(Object.fromEntries(state)), StorageScope.PROFILE, StorageTarget.USER);
		}
	}

}

//#endregion

//#region Approval Helpers

/**
 * The oldest pending approval across every chat in the session, regardless of
 * which chat it belongs to. Used where chats aren't rendered as separate rows
 * (e.g. the flat blocked-sessions dropdown), so the session row is the only
 * place an approval from any of its chats can surface.
 */
export function getFirstApprovalAcrossChats(approvalModel: AgentSessionApprovalModel, session: ISession, reader: IReader | undefined,): IAgentSessionApprovalInfo | undefined {
	let oldest: IAgentSessionApprovalInfo | undefined;
	for (const chat of session.chats.read(reader)) {
		const approval = approvalModel.getApproval(chat.resource).read(reader);
		if (approval && (!oldest || approval.since.getTime() < oldest.since.getTime())) {
			oldest = approval;
		}
	}
	return oldest;
}

/**
 * The pending approval on a session's main chat only. Used by the main
 * sessions tree, where nested/side chats are rendered as their own rows and
 * surface their own approval there instead of being aggregated onto the
 * parent session row.
 */
function getMainChatApproval(approvalModel: AgentSessionApprovalModel, session: ISession, reader: IReader | undefined): IAgentSessionApprovalInfo | undefined {
	const mainChat = session.mainChat.read(reader);
	if (!mainChat?.resource) {
		return undefined;
	}
	return approvalModel.getApproval(mainChat.resource).read(reader);
}

/**
 * The approval to show on a session row. When `aggregate` is true (flat lists
 * with no chat rows) it is the oldest approval across all chats; otherwise (the
 * main tree, which renders chats as their own rows) it is only the main chat's.
 */
function getSessionRowApproval(approvalModel: AgentSessionApprovalModel, session: ISession, reader: IReader | undefined, aggregate: boolean): IAgentSessionApprovalInfo | undefined {
	return aggregate ? getFirstApprovalAcrossChats(approvalModel, session, reader) : getMainChatApproval(approvalModel, session, reader);
}

//#endregion

//#region Folder Matching

function sessionMatchesFolder(session: ISession, folder: URI): boolean {
	const workspace = session.workspace.get();
	if (!workspace) {
		return false;
	}
	const folderStr = folder.toString();
	for (const folder of workspace.folders) {
		if (folder.workingDirectory?.toString() === folderStr || folder.root.toString() === folderStr) {
			return true;
		}
	}
	return false;
}

//#endregion

//#region Sorting & Grouping Helpers

export function sortSessions(sessions: ISession[], sorting: SessionsSorting, getSortKey?: (session: ISession, sorting: SessionsSorting) => number): ISession[] {
	const key = getSortKey ?? defaultSortKey;
	return [...sessions].sort((a, b) => key(b, sorting) - key(a, sorting));
}

function sortSessionListChats(chats: readonly IChat[], sorting: SessionsSorting): readonly IChat[] {
	if (sorting === SessionsSorting.Created) {
		return chats;
	}
	return [...chats].sort((a, b) =>
		(b.updatedAt.get()?.getTime() ?? b.createdAt.getTime()) -
		(a.updatedAt.get()?.getTime() ?? a.createdAt.getTime())
	);
}

function sortComparisonGroupMembers(comparison: ISessionComparison, sessions: ISession[], sorting: SessionsSorting, getSortKey: (session: ISession, sorting: SessionsSorting) => number): ISession[] {
	const participants = getSessionComparisonParticipantsInDisplayOrder(comparison.participants);
	const participantOrder = (session: ISession) => participants.findIndex(participant => participant.sessionResource && isEqual(participant.sessionResource, session.resource));
	return sortSessions(sessions, sorting, getSortKey).sort((a, b) => {
		const aIndex = participantOrder(a);
		const bIndex = participantOrder(b);
		if (aIndex < 0) {
			return bIndex < 0 ? 0 : 1;
		}
		if (bIndex < 0) {
			return -1;
		}
		return aIndex - bIndex;
	});
}

function isComparisonLaunchPending(comparison: ISessionComparison): boolean {
	return comparison.launching === true;
}

function getComparisonGroupSummary(comparison: ISessionComparison, sessions: readonly ISession[], reader?: IReader): string {
	if (comparison.launching) {
		const attempts = comparison.participants.filter(participant => participant.role === SessionComparisonParticipantRole.Attempt);
		const readyAttemptCount = attempts.filter(participant =>
			participant.sessionResource
			&& sessions.some(session => isEqual(session.resource, participant.sessionResource))).length;
		return readyAttemptCount === 0
			? localize('comparisonGroup.startingAttempts', "Comparison · Starting {0} attempts", attempts.length)
			: localize('comparisonGroup.startingAttemptsProgress', "Comparison · Starting attempts · {0} of {1} ready", readyAttemptCount, attempts.length);
	}
	if (comparison.verdict) {
		return localize('comparisonGroup.reviewReady', "Comparison · Review ready");
	}
	const judge = comparison.participants.find(participant => participant.role === SessionComparisonParticipantRole.Judge);
	const attempts = comparison.participants.filter(participant => participant.role === SessionComparisonParticipantRole.Attempt);
	const statuses = attempts.map(participant => {
		if (participant.launchError) {
			return SessionStatus.Error;
		}
		return participant.sessionResource
			? reader
				? sessions.find(session => isEqual(session.resource, participant.sessionResource))?.status.read(reader)
				: sessions.find(session => isEqual(session.resource, participant.sessionResource))?.status.get()
			: undefined;
	});
	const needsInput = statuses.filter(status => status === SessionStatus.NeedsInput).length;
	const working = statuses.filter(status => status === SessionStatus.InProgress).length;
	const finished = statuses.filter(status => status === SessionStatus.Completed || status === SessionStatus.Error).length;
	if (needsInput > 0) {
		return needsInput === 1
			? localize('comparisonGroup.oneAttemptNeedsInput', "Comparison · 1 attempt needs attention")
			: localize('comparisonGroup.attemptsNeedInput', "Comparison · {0} attempts need attention", needsInput);
	}
	if (working > 0) {
		return working === 1
			? localize('comparisonGroup.oneAttemptWorking', "Comparison · 1 attempt working")
			: localize('comparisonGroup.attemptsWorking', "Comparison · {0} attempts working", working);
	}
	if (judge?.launchError) {
		return localize('comparisonGroup.reviewFailed', "Comparison · Review failed");
	}
	if (judge?.sessionResource) {
		const judgeStatus = reader
			? sessions.find(session => isEqual(session.resource, judge.sessionResource))?.status.read(reader)
			: sessions.find(session => isEqual(session.resource, judge.sessionResource))?.status.get();
		if (judgeStatus === SessionStatus.NeedsInput) {
			return localize('comparisonGroup.judgeNeedsInput', "Comparison · Judge needs attention");
		}
		if (judgeStatus === SessionStatus.Untitled || judgeStatus === SessionStatus.InProgress) {
			return localize('comparisonGroup.reviewing', "Comparison · Reviewing attempts");
		}
		if (judgeStatus === SessionStatus.Error) {
			return localize('comparisonGroup.reviewFailed', "Comparison · Review failed");
		}
		if (judgeStatus === SessionStatus.Completed) {
			return localize('comparisonGroup.reviewIncomplete', "Comparison · Review incomplete");
		}
	}
	if (finished === attempts.length) {
		return localize('comparisonGroup.attemptsFinished', "Comparison · {0} attempts finished", attempts.length);
	}
	return localize('comparisonGroup.attempts', "Comparison · {0} attempts", attempts.length);
}

export interface ISessionLimitResult {
	readonly sessions: readonly ISession[];
	readonly showMore: ISessionShowMore | undefined;
}

export function limitSessionsForList(
	sessions: readonly ISession[],
	limit: number,
	options: {
		readonly enabled: boolean;
		readonly expanded: boolean;
		readonly sectionId: string;
		/** Identity of the section's show more/show less state; defaults to {@link sectionId}. */
		readonly stateId?: string;
		readonly sectionLabel: string;
		readonly revealSessionId?: string;
	},
): ISessionLimitResult {
	if (!options.enabled || sessions.length <= limit) {
		return { sessions, showMore: undefined };
	}

	const stateId = options.stateId ?? options.sectionId;
	if (options.expanded) {
		return {
			sessions,
			showMore: {
				showMore: true,
				kind: 'sessions',
				mode: 'less',
				sectionId: options.sectionId,
				stateId,
				sectionLabel: options.sectionLabel,
				remainingCount: 0,
			},
		};
	}

	const visibleSessions = sessions.slice(0, limit);
	if (options.revealSessionId !== undefined) {
		const revealIndex = sessions.findIndex(session => session.sessionId === options.revealSessionId);
		if (revealIndex >= limit) {
			visibleSessions.push(sessions[revealIndex]);
		}
	}
	const remainingCount = sessions.length - visibleSessions.length;

	return {
		sessions: visibleSessions,
		showMore: remainingCount > 0 ? {
			showMore: true,
			kind: 'sessions',
			mode: 'more',
			sectionId: options.sectionId,
			stateId,
			sectionLabel: options.sectionLabel,
			remainingCount,
		} : undefined,
	};
}

function defaultSortKey(session: ISession, sorting: SessionsSorting): number {
	if (sorting === SessionsSorting.Updated) {
		return session.updatedAt.get().getTime();
	}
	return session.createdAt.getTime();
}

export interface IReorderSortInput {
	/** Dragged session ids in display (descending-key) order. */
	readonly draggedIds: readonly string[];
	/** Natural sort key per dragged session (same order as {@link draggedIds}). */
	readonly naturalKeys: readonly number[];
	/** Effective key of the neighbour above the drop point (higher), if any. */
	readonly aboveKey: number | undefined;
	/** Effective key of the neighbour below the drop point (lower), if any. */
	readonly belowKey: number | undefined;
	/** Current time, used when dropping above the first session. */
	readonly now: number;
	/** Spacing used when stepping past an open boundary. */
	readonly fallbackStep: number;
}

/**
 * Compute the manual sort-override changes for a reorder drop. Assigns the
 * dragged block strictly-descending synthetic keys spread between the
 * surrounding neighbours, except when the sessions' natural keys already sort
 * them into the dropped slot — in which case any existing override is dropped.
 */
export function computeReorderSortChanges(input: IReorderSortInput): { set: Map<string, number>; clear: string[] } {
	const { draggedIds, naturalKeys, aboveKey, belowKey, now, fallbackStep } = input;
	const count = draggedIds.length;

	// "Drop the fake value": when every dragged session's natural key already
	// lands strictly inside the surrounding gap (and in descending display
	// order), clear overrides instead of storing synthetic keys.
	const upperFit = aboveKey ?? Number.POSITIVE_INFINITY;
	const lowerFit = belowKey ?? Number.NEGATIVE_INFINITY;
	let naturalFits = true;
	for (let i = 0; i < count; i++) {
		if (!(naturalKeys[i] < upperFit && naturalKeys[i] > lowerFit)) {
			naturalFits = false;
			break;
		}
		if (i > 0 && !(naturalKeys[i] < naturalKeys[i - 1])) {
			naturalFits = false;
			break;
		}
	}

	const set = new Map<string, number>();
	const clear: string[] = [];
	if (naturalFits) {
		for (const id of draggedIds) {
			clear.push(id);
		}
	} else {
		// Spread `count` strictly-descending synthetic keys across the gap. An
		// open top boundary uses the current time so the block sorts to the very
		// top; an open bottom boundary steps below the last key.
		const upper = aboveKey ?? now;
		const lower = belowKey ?? (upper - (count + 1) * fallbackStep);
		const step = (upper - lower) / (count + 1);
		for (let i = 0; i < count; i++) {
			set.set(draggedIds[i], upper - (i + 1) * step);
		}
	}
	return { set, clear };
}

/** Fixed section id for workspace-less "quick chat" sessions. */
export const QUICK_CHATS_SECTION_ID = 'quickchats';

/**
 * Whether a session is a workspace-less "quick chat", per the session's own
 * {@link ISession.isQuickChat} flag (absent means `false`).
 */
export function isQuickChatSession(session: ISession): boolean {
	return session.isQuickChat?.get() ?? false;
}

/** Whether a session is associated with an automation run. */
export function isAutomationSession(session: ISession): boolean {
	return session.isAutomation?.get() ?? false;
}

export function groupSessionsForList(
	sessions: ISession[],
	grouping: SessionsGrouping,
	sorting: SessionsSorting,
	isSessionPinned: (session: ISession) => boolean,
	getSortKey?: (session: ISession, sorting: SessionsSorting) => number,
	archivedSectionLabel: string = getChatSessionArchivedSectionLabel(ChatSessionArchiveActionWording.MarkAsDone),
	groupExternalSessions = false,
	normalizedEnvironments: readonly ISessionEnvironment[] = getSessionEnvironments([]),
): ISessionSection[] {
	const sorted = sortSessions(sessions.filter(session => !isAutomationSession(session)), sorting, getSortKey);

	// Archived and explicit pins take precedence over the automatic buckets.
	const pinned: ISession[] = [];
	const archived: ISession[] = [];
	const external: ISession[] = [];
	const quickChats: ISession[] = [];
	const regular: ISession[] = [];
	for (const session of sorted) {
		if (session.isArchived.get()) {
			archived.push(session);
		} else if (isSessionPinned(session)) {
			pinned.push(session);
		} else if (groupExternalSessions && session.isExternal?.get()) {
			external.push(session);
		} else if (isQuickChatSession(session)) {
			quickChats.push(session);
		} else {
			regular.push(session);
		}
	}

	const sections: ISessionSection[] = [];
	if (pinned.length > 0) {
		sections.push({ id: 'pinned', label: localize('pinned', "Pinned"), sessions: pinned });
	}

	// Quick chats render as a single "Chats" entry directly below Pinned (above
	// the workspace/date groups), regardless of grouping mode.
	if (quickChats.length > 0) {
		sections.push({ id: QUICK_CHATS_SECTION_ID, label: localize('chatsSection', "Chats"), sessions: quickChats });
	}

	sections.push(...(grouping === SessionsGrouping.Workspace
		? groupByWorkspace(regular)
		: grouping === SessionsGrouping.Repository
			? groupByRepository(regular)
			: grouping === SessionsGrouping.Environment
				? groupByEnvironment(regular, normalizedEnvironments)
				: groupByDate(regular, sorting, getSortKey)));

	if (external.length > 0) {
		sections.push({ id: EXTERNAL_SESSIONS_SECTION_ID, label: localize('externalSessionsSection', "External"), sessions: external });
	}

	if (archived.length > 0) {
		sections.push({ id: 'archived', label: archivedSectionLabel, sessions: archived });
	}

	return sections;
}

/** The workspace group label a session belongs to (matches {@link groupByWorkspace}). */
function sessionWorkspaceLabel(session: ISession): string {
	return session.workspace.get()?.label || localize('unknown', "Unknown");
}

export function groupByWorkspace(sessions: ISession[]): ISessionSection[] {
	const groups = new Map<string, ISession[]>();
	for (const session of sessions) {
		const label = sessionWorkspaceLabel(session);
		let group = groups.get(label);
		if (!group) {
			group = [];
			groups.set(label, group);
		}
		group.push(session);
	}

	const unknownWorkspaceLabel = localize('unknown', "Unknown");
	const order = [...groups.keys()]
		.filter(k => k !== unknownWorkspaceLabel)
		.sort((a, b) => a.localeCompare(b));

	const result: ISessionSection[] = order.map(label => ({
		id: `workspace:${label}`,
		collapseStateId: workspaceCollapseStateId(groups.get(label)!),
		label,
		sessions: groups.get(label)!,
	}));

	// "Unknown Workspace" always at the bottom
	const unknownWorkspace = groups.get(unknownWorkspaceLabel);
	if (unknownWorkspace) {
		result.push({ id: `workspace:${unknownWorkspaceLabel}`, label: unknownWorkspaceLabel, sessions: unknownWorkspace });
	}

	return result;
}

/** Whether a persisted collapse state id belongs to a grouping-specific section. */
function isGroupingSpecificCollapseStateId(id: string): boolean {
	return id.startsWith('workspace:') || id.startsWith(ENVIRONMENT_SECTION_PREFIX) || id === 'recent' || id === 'older';
}

function workspaceCollapseStateId(sessions: readonly ISession[]): string | undefined {
	const resource = sessions[0]?.workspace.get()?.uri.toString();
	return resource && sessions.every(session => session.workspace.get()?.uri.toString() === resource)
		? `workspace:${resource}`
		: undefined;
}

/**
 * The GitHub repository of a session's primary folder. A cloud session's folder names it
 * in its `github-remote-file` URI; other sessions report it through their Git metadata.
 */
export function getSessionRepository(session: ISession): ISessionRepository | undefined {
	const folder = session.workspace.get()?.folders[0];
	const gitHubInfo = folder?.gitRepository?.gitHubInfo.get();
	return getGitHubRemoteFileRepository(folder?.root) ?? (gitHubInfo ? { owner: gitHubInfo.owner, name: gitHubInfo.repo } : undefined);
}

function getRepositorySectionId(repository: ISessionRepository): string {
	// GitHub matches owner and repository names case-insensitively.
	return `${REPOSITORY_SECTION_PREFIX}${repository.owner.toLowerCase()}/${repository.name.toLowerCase()}`;
}

/** The grouping section a session renders in when nothing with higher precedence places it. */
function getSessionGroupingSectionId(session: ISession, grouping: SessionsGrouping): string {
	if (grouping === SessionsGrouping.Environment) {
		return `${ENVIRONMENT_SECTION_PREFIX}${session.environment}`;
	}
	const repository = grouping === SessionsGrouping.Repository ? getSessionRepository(session) : undefined;
	return repository ? getRepositorySectionId(repository) : `workspace:${sessionWorkspaceLabel(session)}`;
}

export function groupByEnvironment(sessions: ISession[], normalizedEnvironments: readonly ISessionEnvironment[] = getSessionEnvironments([])): ISessionSection[] {
	const byId = new Map(normalizedEnvironments.map(environment => [environment.id, environment]));
	const sections = new Map<string, ISessionSection & { readonly environment: ISessionEnvironment }>();
	for (const session of sessions) {
		let section = sections.get(session.environment);
		if (!section) {
			const environment = byId.get(session.environment) ?? { id: session.environment, label: session.environment };
			section = { id: `${ENVIRONMENT_SECTION_PREFIX}${environment.id}`, label: environment.label, environment, sessions: [] };
			sections.set(environment.id, section);
		}
		section.sessions.push(session);
	}
	return [...sections.values()].sort((a, b) => compareSessionEnvironments(a.environment, b.environment));
}

/**
 * Groups sessions by GitHub repository, whichever environment they run in. Sessions without
 * a repository keep their workspace section. Sections sort by label, with "Unknown" last.
 */
export function groupByRepository(sessions: ISession[]): ISessionSection[] {
	const repositorySections = new Map<string, ISessionSection>();
	const withoutRepository: ISession[] = [];
	for (const session of sessions) {
		const repository = getSessionRepository(session);
		if (!repository) {
			withoutRepository.push(session);
			continue;
		}
		const id = getRepositorySectionId(repository);
		let section = repositorySections.get(id);
		if (!section) {
			section = { id, label: repository.name, repository, sessions: [] };
			repositorySections.set(id, section);
		}
		section.sessions.push(session);
	}
	const unknownWorkspaceId = `workspace:${localize('unknown', "Unknown")}`;
	const workspaceSections = groupByWorkspace(withoutRepository);
	const sections = [...repositorySections.values(), ...workspaceSections.filter(section => section.id !== unknownWorkspaceId)];
	labelRepositorySections(sections);
	sections.sort((a, b) => a.label.localeCompare(b.label));
	sections.push(...workspaceSections.filter(section => section.id === unknownWorkspaceId));
	return sections;
}

/** Labels repository sections by repository name, adding the owner when several repository sections share a name. */
function labelRepositorySections(sections: ISessionSection[]): void {
	const nameCounts = new Map<string, number>();
	for (const { repository } of sections) {
		if (repository) {
			const name = repository.name.toLowerCase();
			nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
		}
	}
	for (let index = 0; index < sections.length; index++) {
		const repository = sections[index].repository;
		if (repository) {
			const label = nameCounts.get(repository.name.toLowerCase())! > 1 ? `${repository.owner}/${repository.name}` : repository.name;
			sections[index] = { ...sections[index], label };
		}
	}
}

/** A session that a new session can start like: in the same environment and workspace. */
export interface INewSessionSource {
	readonly environment: ISessionEnvironment;
	readonly session: ISession;
}

/**
 * The most recently created session of each available environment among `sessions`, in
 * Environment filter order. New sessions in a repository section start in their workspaces.
 */
export function getNewSessionSources(sessions: readonly ISession[], sessionsProvidersService: ISessionsProvidersService): INewSessionSource[] {
	const sources = new Map<string, INewSessionSource>();
	for (const session of sessions) {
		const environment = sessionsProvidersService.getProvider(session.providerId)?.environment;
		if (!environment || environment.isConnected?.get() === false) {
			continue;
		}
		const source = sources.get(environment.id);
		if (!source || session.createdAt.getTime() > source.session.createdAt.getTime()) {
			sources.set(environment.id, { environment, session });
		}
	}
	return [...sources.values()].sort((a, b) => compareSessionEnvironments(a.environment, b.environment));
}

/** Maximum number of sessions shown in the "Recent" date section. */
const RECENT_SESSIONS_LIMIT = 10;
const RECENT_SESSIONS_LIMIT_WITH_UPDATES = 15;
const RECENTLY_UPDATED_SESSION_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export function groupByDate(sessions: ISession[], sorting: SessionsSorting, getSortKey?: (session: ISession, sorting: SessionsSorting) => number): ISessionSection[] {
	const key = getSortKey ?? defaultSortKey;
	const now = new Date();
	const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
	const startOfWeek = startOfToday - 7 * 86_400_000;
	const recentlyUpdatedThreshold = now.getTime() - RECENTLY_UPDATED_SESSION_THRESHOLD_MS;

	const recent: ISession[] = [];
	const older: ISession[] = [];

	for (const session of sessions) {
		const time = key(session, sorting);
		const wasRecentlyUpdated = sorting === SessionsSorting.Created && session.updatedAt.get().getTime() >= recentlyUpdatedThreshold;
		const isWithinRecentLimit = recent.length < RECENT_SESSIONS_LIMIT && time >= startOfWeek;
		const isWithinUpdatedRecentLimit = recent.length < RECENT_SESSIONS_LIMIT_WITH_UPDATES && wasRecentlyUpdated;

		if (isWithinRecentLimit || isWithinUpdatedRecentLimit) {
			recent.push(session);
		} else {
			older.push(session);
		}
	}

	const sections: ISessionSection[] = [];
	const addGroup = (id: string, label: string, groupSessions: ISession[]) => {
		if (groupSessions.length > 0) {
			sections.push({ id, label, sessions: groupSessions });
		}
	};

	addGroup('recent', localize('recent', "Recent"), recent);
	addGroup('older', localize('older', "Older"), older);

	return sections;
}

//#endregion

//#region Flat List

export interface ISessionsFlatListOptions {
	readonly overrideStyles?: IStyleOverride<IListStyles>;
	readonly showSessionHover?: boolean;
	/** Called when a session row is opened (clicked / activated). */
	onSessionOpen(resource: URI, preserveFocus: boolean, sideBySide: boolean): void;
	/**
	 * Approval model tracking pending tool confirmations for the shown sessions.
	 * When omitted the list creates and owns its own; injectable so tests and
	 * fixtures can supply pending approvals without a live chat session.
	 */
	readonly approvalModel?: AgentSessionApprovalModel;
	/**
	 * Supplies the per-session "Fix CI" row for sessions whose pull request has
	 * failing CI checks. Only the blocked-sessions dropdown passes one, so the row
	 * never appears in other lists. When omitted no fix-CI rows are rendered.
	 */
	readonly ciFixModel?: ISessionCIFixModel;
	/**
	 * Maximum number of terminal-command lines shown in a session's approval
	 * prompt. Defaults to the same limit as the main sessions list; the
	 * blocked-sessions dropdown passes a larger value.
	 */
	readonly approvalRowMaxLines?: number;
	/**
	 * Menu used by each session row's inline toolbar. Defaults to the main sessions
	 * item toolbar menu.
	 */
	readonly toolbarMenuId?: MenuId;
	/**
	 * The `from` value of the `workbenchActionExecuted` event sent for row toolbar
	 * actions. Defaults to `sessionsFlatList.row`.
	 */
	readonly toolbarTelemetrySource?: string;
	/** Allows focused list surfaces to handle actions from their custom toolbar menu. */
	readonly onToolbarAction?: (action: IAction, session: ISession) => boolean | Promise<boolean>;
	/** Optional context menu shown for each session row. */
	readonly contextMenuId?: MenuId;
	/** Allows focused list surfaces to handle actions from their custom context menu. */
	readonly onContextMenuAction?: (action: IAction, session: ISession) => boolean | Promise<boolean>;
	/** Per-session context shared by the inline toolbar and context menu. */
	readonly getAdditionalContextKeys?: SessionContextKeyProvider;
	/** Keeps repository and time visible alongside progress in history views. */
	readonly showMetadataWhileActive?: (session: ISession) => boolean;
	/** Short outcome shown before the time of a completed row, such as "Cancelled". */
	readonly getCompletedStatusMessage?: (session: ISession, reader: IReader | undefined) => string | undefined;
	/** Whether opening a row immediately marks its session as read. Defaults to `true`. */
	readonly markSessionReadOnOpen?: boolean;
	/**
	 * When `false` wheel events bubble to the parent scroller instead of being
	 * consumed by the embedded tree. Defaults to `true` (standard list behavior).
	 */
	readonly alwaysConsumeMouseWheel?: boolean;
	/**
	 * Whether quick chats use the compact single-line presentation. Defaults to
	 * `true`; consumers showing homogeneous history entries can opt into regular rows.
	 */
	readonly useCompactQuickChatRows?: boolean;
}

/**
 * A lightweight, flat sessions list that renders session rows exactly like the
 * main {@link SessionsList} but without any sections, groups or workspace
 * headers. Only the sessions passed to {@link setSessions} are shown. Used by
 * surfaces that need a focused, sectionless view of a specific set of sessions
 * (e.g. the titlebar "N blocked" hover).
 */
export class SessionsFlatList extends Disposable {

	private static readonly ROW_HEIGHT = 54;

	private readonly _onDidChangeContentHeight = this._register(new Emitter<void>());
	readonly onDidChangeContentHeight = this._onDidChangeContentHeight.event;
	private readonly _onDidApproveSession = this._register(new Emitter<IApprovedSession>());
	/** Fires when a session's pending action is approved from its "Allow" button. */
	readonly onDidApproveSession: Event<IApprovedSession> = this._onDidApproveSession.event;
	private readonly tree: WorkbenchObjectTree<SessionListItem, FuzzyScore>;
	private readonly _delegate: SessionsTreeDelegate;
	private _sessions: readonly ISession[] = [];

	constructor(
		container: HTMLElement,
		private readonly options: ISessionsFlatListOptions,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@ISessionsListModelService private readonly _sessionsListModelService: ISessionsListModelService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IMarkdownRendererService markdownRendererService: IMarkdownRendererService,
		@IHoverService hoverService: IHoverService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IConfigurationService configurationService: IConfigurationService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@IVoicePlaybackService voicePlaybackService: IVoicePlaybackService,
		@IAgentHostConnectionsService agentHostConnectionsService: IAgentHostConnectionsService,
		@IOpenerService openerService: IOpenerService,
		@ILabelService labelService: ILabelService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super();

		// Wrap in `.sessions-list-control` so the row styles scoped to that class
		// (needs-input/pinned row highlights) apply exactly like the main list.
		const listRoot = DOM.append(container, $('.sessions-list-control'));
		const approvalModel = this.options.approvalModel ?? this._register(instantiationService.createInstance(AgentSessionApprovalModel));

		// TEMPORARY (#320480): the row renderer reaches into a Copilot-provider
		// internal to lazily resolve expensive session properties. Resolved via
		// the instantiation service so this file's single suppressed import stays
		// the only reference. See the note on the `IAgentSessionsService` import.
		const agentSessionsService = instantiationService.invokeFunction(accessor => accessor.get(IAgentSessionsService));
		const useCompactQuickChatRows = this.options.useCompactQuickChatRows ?? true;
		const externalApplicationBadgeMode = observableConfigValue(SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SETTING, ExternalSessionApplicationBadgeMode.Off, configurationService);
		const externalApplicationBadgeShowFrom = observableConfigValue(SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SHOW_FROM_SETTING, true, configurationService);
		const reportExternalApplicationBadgeModeExperimentTrigger = () => logDefaultSettingExperimentTrigger(configurationService, telemetryService, SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SETTING);
		const reportExternalApplicationBadgeShowFromExperimentTrigger = () => logDefaultSettingExperimentTrigger(configurationService, telemetryService, SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SHOW_FROM_SETTING);

		const sessionRenderer = new SessionItemRenderer(
			{
				grouping: () => SessionsGrouping.Date,
				isPinned: s => this._sessionsListModelService.isSessionPinned(s),
				visibleSessions: this._sessionsService.visibleSessions,
				getMultiSelectedSessions: s => [s],
				showHover: this.options.showSessionHover ?? true,
				useCompactQuickChatRows,
				compact: () => false,
				approvalRowMaxLines: this.options.approvalRowMaxLines ?? DEFAULT_APPROVAL_ROW_MAX_LINES,
				// This list renders no nested chat rows, so the session row is the
				// only place an approval on any of its chats can surface.
				aggregateChatApprovals: true,
				toolbarMenuId: this.options.toolbarMenuId ?? Menus.SessionItemToolbar,
				toolbarTelemetrySource: this.options.toolbarTelemetrySource ?? 'sessionsFlatList.row',
				inlineRename: false,
				handleToolbarAction: this.options.onToolbarAction,
				externalApplicationBadgeMode,
				externalApplicationBadgeShowFrom,
				reportExternalApplicationBadgeModeExperimentTrigger,
				reportExternalApplicationBadgeShowFromExperimentTrigger,
				getAdditionalContextKeys: this.options.getAdditionalContextKeys,
				showMetadataWhileActive: this.options.showMetadataWhileActive,
				getCompletedStatusMessage: this.options.getCompletedStatusMessage,
			},
			approvalModel,
			this.options.ciFixModel,
			instantiationService,
			contextKeyService,
			configurationService,
			markdownRendererService,
			hoverService,
			sessionsProvidersService,
			this._sessionsManagementService,
			agentHostConnectionsService,
			openerService,
			labelService,
			agentSessionsService,
			voicePlaybackService,
		);

		this._delegate = new SessionsTreeDelegate(approvalModel, () => false, () => false, session => session.status.get(), this.options.approvalRowMaxLines ?? DEFAULT_APPROVAL_ROW_MAX_LINES, this.options.ciFixModel, useCompactQuickChatRows, true /* aggregateChatApprovals */);

		this.tree = this._register(instantiationService.createInstance(
			WorkbenchObjectTree<SessionListItem, FuzzyScore>,
			'SessionsFlatList',
			listRoot,
			this._delegate,
			[sessionRenderer],
			{
				accessibilityProvider: new SessionsAccessibilityProvider(undefined, {
					grouping: () => SessionsGrouping.Date,
					isPinned: session => this._sessionsListModelService.isSessionPinned(session),
					includeQuickChatInAriaLabel: !useCompactQuickChatRows,
					externalApplicationBadgeMode,
					reportExternalApplicationBadgeModeExperimentTrigger,
					reportExternalApplicationBadgeShowFromExperimentTrigger,
					showMetadataWhileActive: this.options.showMetadataWhileActive,
					getCompletedStatusMessage: this.options.getCompletedStatusMessage,
				}),
				identityProvider: {
					getId: (element: SessionListItem) => (element as ISession).resource.toString(),
				},
				horizontalScrolling: false,
				alwaysConsumeMouseWheel: this.options.alwaysConsumeMouseWheel ?? true,
				multipleSelectionSupport: false,
				indent: 0,
				overrideStyles: this.options.overrideStyles,
				renderIndentGuides: RenderIndentGuides.None,
				twistieAdditionalCssClass: () => 'force-no-twistie',
			}
		));

		this._register(this.tree.onDidOpen(e => {
			const element = e.element;
			if (!element || !isSessionItem(element)) {
				return;
			}
			if (this.options.markSessionReadOnOpen !== false && this._sessionsService.activeSession.get()?.sessionId !== element.sessionId) {
				this._sessionsManagementService.markRead(element);
			}
			const isLeftClick = DOM.isMouseEvent(e.browserEvent) && e.browserEvent.button === 0;
			const preserveFocus = isLeftClick ? false : (e.editorOptions.preserveFocus ?? false);
			this.options.onSessionOpen(element.resource, preserveFocus, e.sideBySide);
		}));
		if (this.options.contextMenuId) {
			this._register(this.tree.onContextMenu(e => this.onContextMenu(e)));
		}

		this._register(sessionRenderer.onDidChangeItemHeight(session => {
			if (this.tree.hasElement(session)) {
				this.tree.updateElementHeight(session, this._delegate.getHeight(session));
				this._onDidChangeContentHeight.fire();
			}
		}));

		this._register(sessionRenderer.onDidApproveSession(approved => this._onDidApproveSession.fire(approved)));
	}

	private onContextMenu(e: ITreeContextMenuEvent<SessionListItem | null>): void {
		const session = e.element;
		if (!session || !isSessionItem(session) || !this.options.contextMenuId) {
			return;
		}

		const disposables = new DisposableStore();
		const contextKeyService = this.contextKeyService.createOverlay([
			[SessionIsArchivedContext.key, session.isArchived.get()],
			[SessionIsReadContext.key, session.mainChat.get().isRead.get()],
			[SessionTypeContext.key, session.sessionType],
			[SessionProviderIdContext.key, session.providerId],
			[SessionSupportsMultipleChatsContext.key, session.capabilities.get().supportsMultipleChats],
			[SessionSupportsRenameContext.key, session.capabilities.get().supportsRename ?? false],
			[SessionSupportsDeleteContext.key, session.capabilities.get().supportsDelete ?? false],
			[IsQuickChatSessionContext.key, session.isQuickChat?.get() ?? false],
			[SessionItemStatusContext.key, session.status.get()],
			...(this.options.getAdditionalContextKeys?.(session, undefined) ?? []),
		]);
		const menu = disposables.add(this.menuService.createMenu(this.options.contextMenuId, contextKeyService));
		const actions = Separator.join(...menu.getActions({ shouldForwardArgs: true }).map(([, groupActions]) => groupActions));
		if (actions.length === 0) {
			disposables.dispose();
			return;
		}

		const actionRunner = disposables.add(new SessionItemActionRunner(selected => [selected], this.options.onContextMenuAction));
		this.contextMenuService.showContextMenu({
			getActions: () => actions,
			getActionsContext: () => session,
			getAnchor: () => e.anchor,
			getKeyBinding: action => this.keybindingService.lookupKeybinding(action.id, contextKeyService, true) ?? undefined,
			actionRunner,
			onHide: () => disposables.dispose(),
		});
	}

	setSessions(sessions: readonly ISession[]): void {
		this._sessions = sessions;
		this.tree.setChildren(null, sessions.map(session => ({ element: session })));
	}

	/** The total pixel height required to render all current rows without scrolling. */
	getContentHeight(): number {
		return this._sessions.reduce((total, session) => total + this._delegate.getHeight(session), 0);
	}

	getRowHeight(): number {
		return SessionsFlatList.ROW_HEIGHT;
	}

	layout(height: number, width: number): void {
		this.tree.layout(height, width);
	}

	focus(): void {
		this.tree.domFocus();
	}

	focusSession(session: ISession): void {
		if (!this.tree.hasElement(session)) {
			return;
		}
		this.tree.setFocus([session]);
		this.tree.domFocus();
	}

	getFocusedSession(): ISession | undefined {
		const focused = this.tree.getFocus()[0];
		return focused && isSessionItem(focused) ? focused : undefined;
	}
}

//#endregion

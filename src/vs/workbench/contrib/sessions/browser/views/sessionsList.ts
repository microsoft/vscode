/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getPendingSessionActions, IPendingSessionItem, IPendingSessionSection, isPendingSessionItem, matchesPendingSession, PendingSessionRenderer } from './pendingSessions.js';
import '../media/sessionsList.css';
import '../media/disclosure.css';
import { SessionGroupAppearancePicker } from './sessionGroupAppearancePicker.js';
import { findSearchWords, getSessionSearchHint, ISessionSearchDocument, ISessionSearchField, ISessionSearchHint, ISessionSearchMatch, ISessionsListSearchResults, matchSessionSearch, SessionsListFindController, SessionsListSearchQuery, SessionsListSearchTelemetry, SessionSearchFieldKind, toSearchFilterData } from './sessionsListSearch.js';
import { ISessionRowIndent, SessionRowIndent, SessionsListIndentGuides } from './sessionsListIndentGuides.js';
import { CANVASES_SECTION_ID, SessionItemContextMenuId, SessionItemOrganizeMenuGroup, NEW_SESSION_IN_ENVIRONMENT_ACTION_ID, SESSIONS_LIST_SHOW_EMPTY_DEFAULT_GROUPS_SETTING, SESSIONS_LIST_SHOW_UNREAD_IN_COLLAPSED_SECTIONS_SETTING, SESSIONS_LIST_SHOW_ARCHIVED_BY_DEFAULT_SETTING, SESSIONS_LIST_INDENT_ITEMS_SETTING, SESSIONS_LIST_CANVASES_SECTION_SETTING, NEW_CANVAS_SESSION_COMMAND_ID, IsSessionPinnedContext, SessionItemInboxStateContext, SessionItemCanAcknowledgeContext, SessionItemCanMergePullRequestContext, SessionItemHasUnreadNestedSessionsContext, SessionChatItemCanRenameContext, SessionChatItemCanArchiveContext, SessionChatItemCanDeleteContext, SessionChatItemCanMoveContext, SessionChatItemHasMoveDestinationContext, SessionItemHasMoveDestinationContext, SessionChatItemIsArchivedContext, SessionChatItemIsReadContext, SessionChatItemCanSetReadStateContext, SessionChatItemIsUntitledContext, SessionChatItemIsStandaloneContext, SessionChatItemCanMoveUpContext, SessionChatItemCanMoveDownContext, SessionsListFocusedChatItemContext, SessionItemInGroupContext, SessionItemInExternalSectionContext, SessionItemCanImportContext, SessionItemIsAutomationContext, SessionItemIsInSessionsListContext, SessionSectionTypeContext, SessionSectionHasNonCloudRepositoryContext, SessionGroupHasVisibleSessionsContext, SessionGroupIsEmptyContext, SessionGroupIsComparisonContext, SessionsGrouping, SessionsSorting, ISessionSection, ISessionGroupItem, ISessionShowMore, ISessionPlaceholder, SessionChatItem, ISessionChatItem, SessionListItem, isSessionChatItem, isSessionGroupItem, isSessionSection, isSessionShowMore, isSessionPlaceholder, isSessionItem, SessionsListSearchOpenContext } from './sessionsListCommon.js';
import { NEW_SESSION_SECTION_ID, AUTOMATIONS_SECTION_ID, CUSTOMIZATIONS_SECTION_ID, PINNED_CANVAS_SECTION_PREFIX, EXTERNAL_SESSIONS_SECTION_ID, DATE_SECTION_IDS, getChatTitle, getSessionListChats, isShortcutSection, REPOSITORY_SECTION_PREFIX, ENVIRONMENT_SECTION_PREFIX, isSessionGroupingSection, getSessionSectionType, sessionMatchesFolder, sortSessions, sortSessionListChats, sortComparisonGroupMembers, isComparisonLaunchPending, getComparisonGroupConfiguration, getComparisonGroupSummary, limitSessionsForList, computeReorderSortChanges, QUICK_CHATS_SECTION_ID, isQuickChatSession, groupingHasQuickChatsSection, isAutomationSession, groupSessionsForList, IInboxPlacement, inboxPlacementsEqual, sessionWorkspaceLabel, isGroupingSpecificCollapseStateId, getSessionRepository, getRepositorySectionId, getSessionGroupingSectionId, labelRepositorySections, getNewSessionSources, RECENTLY_UPDATED_SESSION_THRESHOLD_MS, partitionByDate } from './sessionsListHelpers.js';
import { SESSION_SHORTCUT_SECTION_TEMPLATE_ID, SESSION_SHORTCUT_ROW_HEIGHT, EMPTY_GUIDE_SESSION_IDS, SessionGroupConnectorPosition, isOpenChat, getSessionRowStatus, INSET_ROW_GAP, DEFAULT_APPROVAL_ROW_MAX_LINES, SessionsTreeDelegate, withSessionsListHoverPresentation, getCreatorHoverData, SessionChatItemRenderer, SessionItemActionRunner, ISessionOnboardingTarget, SessionItemRenderer, getSessionArchiveOnboardingTargetId, getSessionOnboardingTargetId, getWorkspaceSectionOnboardingTargetId, logDefaultSettingExperimentTrigger, ISessionHeaderStatusTrigger, SessionSectionRenderer, SessionShortcutListDelegate, SessionShortcutListRenderer, SessionGroupRenderer, SessionShowMoreRenderer, SessionPlaceholderRenderer, SessionsAccessibilityProvider } from './sessionsListRenderers.js';
import { SessionListPlacement, getPlacementState, getSectionPlacement, isSamePlacement, getPlacementHeader, ISessionDropAnchor, ISessionDropDestination, SessionDropEffect, ISessionDropTargetHeader, IDraggedHeader, SessionHeaderDrop, SessionsListDragAndDrop, isDateSectionPlacement, keepDateSectionOrder, sectorToPosition, findLastVisible } from './sessionsListDragAndDrop.js';
import * as DOM from '../../../../../base/browser/dom.js';
import { NotSelectableGroupId } from '../../../../../base/browser/ui/list/list.js';
import { IListStyles } from '../../../../../base/browser/ui/list/listWidget.js';
import { IObjectTreeElement, ITreeNode, ITreeRenderer, ITreeContextMenuEvent, ObjectTreeElementCollapseState, TreeFilterResult, TreeVisibility } from '../../../../../base/browser/ui/tree/tree.js';
import { IFindFilter, RenderIndentGuides } from '../../../../../base/browser/ui/tree/abstractTree.js';
import { groupByMap } from '../../../../../base/common/collections.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { FuzzyScore } from '../../../../../base/common/filters.js';
import { disposableTimeout } from '../../../../../base/common/async.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, IObservable, IReader, autorun, derived, observableFromEvent, observableSignalFromEvent, observableValue, runOnChange } from '../../../../../base/common/observable.js';
import { hasKey, isDefined } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { localize } from '../../../../../nls.js';
import { MenuId, IMenuService, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { MarshalledId } from '../../../../../base/common/marshallingIds.js';
import { SessionProviderIdContext, SessionSupportsDeleteContext, SessionSupportsMultipleChatsContext, SessionSupportsRenameContext, SessionTypeContext, IsPhoneLayoutContext, IsQuickChatSessionContext, SessionIsArchivedContext, SessionIsReadContext, SessionHasPullRequestContext, SessionItemIsMultiSelectionContext } from '../../common/contextkeys.js';
import { ACKNOWLEDGE_INBOX_SESSION_COMMAND_ID, ARCHIVE_SESSIONS_WITH_UNDO_COMMAND_ID, DELETE_SESSION_GROUP_WITH_UNDO_COMMAND_ID, HOLD_INBOX_SESSION_COMMAND_ID, RENAME_CHAT_COMMAND_ID, RENAME_SESSION_COMMAND_ID, RESUME_INBOX_SESSION_COMMAND_ID } from '../../common/sessionCommands.js';
import { ExternalSessionApplicationBadgeMode, SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SETTING, SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SHOW_FROM_SETTING, SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING, SESSIONS_LIST_INBOX_AUTO_ADVANCE_SETTING } from '../../common/sessionConfig.js';
import { IContextMenuService, IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { getGitHubRepositoryId, parseGitHubPullRequestUrl } from '../../../../../platform/github/common/githubUrls.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { WorkbenchList, WorkbenchObjectTree } from '../../../../../platform/list/browser/listService.js';
import { IStyleOverride, defaultFindWidgetStyles, getButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { logSettingExperimentTrigger } from '../../../../../platform/telemetry/common/experimentTrigger.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { ISessionsListPresentation } from '../sessionsListPresentation.js';
import { ISideChatPlacementService } from '../sideChatPlacement.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ChatSessionArchiveActionWordingSettingId, getChatSessionArchivedSectionLabel, getChatSessionArchiveActionWording } from '../../../../../platform/chat/common/sessionArchiveActions.js';
import { getChatCapabilities, getGitHubPullRequestRefs, getGitHubRepositoryOfUrl, GITHUB_REMOTE_FILE_SCHEME, IChat, isActiveSessionStatus, ISession, SessionArtifactKind, SessionStatus } from '../../../../services/sessions/common/session.js';
import { AgentSessionApprovalModel } from '../../../chat/browser/agentSessions/agentSessionApprovalModel.js';
import { IVoicePlaybackService } from '../../../chat/common/voicePlaybackService.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { IChatService, IChatToolInvocation, ToolConfirmKind } from '../../../chat/common/chatService/chatService.js';
import { IChatResponseModel } from '../../../chat/common/model/chatModel.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import * as aria from '../../../../../base/browser/ui/aria/aria.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { IAction, Separator, SubmenuAction, toAction } from '../../../../../base/common/actions.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { ISessionsManagementService } from '../../common/sessionsManagement.js';
import { getMainWindowHost, ISessionHostService, shownChatOf } from '../../../../services/sessions/browser/sessionHost.js';
import { getSessionComparisonChat, getSessionComparisonHarnessLabel, ISessionComparison, ISessionComparisonService, SessionComparisonParticipantRole } from '../../common/sessionComparison.js';
import { ISessionsNavigationService } from '../sessionsNavigationService.js';
import { ISessionListModelChangeEvent, ISessionsListModelService, SessionListModelChangeKind, SessionSortEntry, SessionSortMode } from '../sessionsListModelService.js';
import { getSessionGroupIdOfSection, getSessionGroupSectionId, ISessionGroup, ISessionGroupAppearance, ISessionGroupsService } from '../sessionGroupsService.js';
import { ISessionSectionOrderService } from '../../../../services/sessions/browser/sessionSectionOrderService.js';
import { IWorkbenchAssignmentService } from '../../../../services/assignment/common/assignmentService.js';
import { OPEN_SESSION_COMPARISON_COMMAND_ID } from '../../common/sessionComparisonConstants.js';
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
import { IAgentHostFilterService } from '../../common/agentHostFilter.js';
import { compareSessionEnvironments, getSessionEnvironments, getWorktreeFilterKeys, ISessionsListResettableState, SessionsListFilters } from './sessionsListFilters.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { fillSessionChatReferenceDragData } from '../dnd.js';
import { getChatMoveDestinations, getSessionMoveDestinations, getSessionsListChatDrop, isChatMoveDndEnabled, isCrossAgentChatMoveEnabled, runSessionsListMove, SessionsListChatDrop, SessionsListMove } from './sessionsListChatMove.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { InboxAutoAdvanceSpotlight } from './inboxAutoAdvanceSpotlight.js';
import { ONBOARDING_ENABLED_CONFIG } from '../../../onboarding/common/onboardingScenarioService.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ListViewTargetSector } from '../../../../../base/browser/ui/list/listView.js';
import { ISessionsProvidersService } from '../sessionsProvidersService.js';
import { createSessionSummaryHover, getChatSummaryHoverData, getDistinctChatHarnessLabel } from '../sessionHoverContent.js';
import { IChatScheduledRequest } from '../../../chat/common/model/chatViewModel.js';
import { ChatAutomationsEnabledContext } from '../../../chat/common/automations/automationsEnabled.js';
import { AICustomizationManagementEditorInput } from '../../../chat/browser/aiCustomization/aiCustomizationManagementEditorInput.js';
import { IAutomationService } from '../../../chat/common/automations/automationService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ICustomViewService } from '../customView.js';
import { IOpenAICustomizationsCommandOptions, OPEN_AI_CUSTOMIZATIONS_COMMAND_ID } from '../customizationsConstants.js';
import { ChatCustomizationsTelemetry } from '../../../chat/browser/aiCustomization/chatCustomizationsTelemetry.js';
import { NEW_SESSION_ACTION_ID } from '../../common/chatConstants.js';
import { Menus } from '../menus.js';
import { getSessionAgentMergeConfigurationObservable } from '../sessionAgentMerge.js';
import { BlockedSessionReason, BlockedSessions } from '../blockedSessions.js';
import { IInboxSessionAttention, ISessionAttentionService, InboxNotificationPriority, InboxTab } from '../../common/sessionAttentionService.js';
import { IPinnedCanvas, IPinnedCanvasService, PINNED_CANVAS_PAGE_ID, PinnedCanvasConnectedContext } from '../pinnedCanvases.js';
import { getSessionsTelemetryEnvironmentId, logSessionsInteraction } from '../../common/sessionsTelemetry.js';
import { getInboxPullRequestMergeOperation, getSessionInboxDescription, getSessionInboxPriority, getSessionInboxSection, SessionInboxSection, sessionInboxSections } from '../../common/sessionInbox.js';
import { IShownChat } from '../../../../services/sessions/common/sessionPane.js';

const $ = DOM.$;

const SESSION_SECTION_FOCUS_FROM_POINTER_CLASS = 'session-section-focus-from-pointer';

//#region Types

function sortingToMode(sorting: SessionsSorting): SessionSortMode {
	return sorting === SessionsSorting.Updated ? 'updated' : 'created';
}

/** Fallback spacing (ms) used when assigning synthetic sort keys past an open boundary. */
const SORT_FALLBACK_STEP_MS = 60_000;

/** Spacing (ms) between synthetic sort keys that keep dropped sessions directly next to their anchor. */
const ADJACENT_SORT_STEP_MS = 1;

// allow-any-unicode-next-line
/** A group's name after the names of the groups it is nested in, such as "Release work › Hotfixes". */
function getSessionGroupPathLabel(path: readonly ISessionGroup[]): string {
	// allow-any-unicode-next-line
	return path.reduce((label, group, index) => index === 0 ? group.name : localize('sessionGroupPathLabel', "{0} › {1}", label, group.name), '');
}

/** The done chats of a session that is not done, which the Done section lists as rows of their own. */
function getSessionDoneListChats(session: ISession, hideSideChats: boolean, reader?: IReader): readonly IChat[] {
	return session.isArchived.read(reader) ? [] : getSessionListChats(session, reader, true, hideSideChats).filter(chat => chat.isArchived.read(reader));
}

/** Whether a session is archived or lists archived chats, both of which the archived filter hides. */
function hasArchivedListContent(session: ISession, hideSideChats: boolean): boolean {
	return session.isArchived.get() || getSessionListChats(session, undefined, true, hideSideChats).some(chat => chat.isArchived.get());
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

/**
 * Joins context menu groups with separators, merging groups of the same name in
 * the order given and ordering the groups as the menu service does: `navigation`
 * first, ungrouped actions last, and the rest by name. Lets the list merge its
 * own actions into contributed groups.
 */
function joinContextMenuGroups(groups: readonly (readonly [string, readonly IAction[]])[]): IAction[] {
	const merged = new Map<string, IAction[]>();
	for (const [group, actions] of groups) {
		let target = merged.get(group);
		if (!target) {
			target = [];
			merged.set(group, target);
		}
		target.push(...actions);
	}
	const rank = (group: string) => group === 'navigation' ? 0 : group ? 1 : 2;
	return Separator.join(...[...merged].sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b)).map(([, actions]) => actions));
}

/** The identity of a row, which keeps its state, such as whether it is collapsed, while the list renders again. */
function getSessionListItemId(element: SessionListItem): string {
	if (isPendingSessionItem(element)) {
		return `pending:${element.kind}:${element.id}`;
	}
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
}

/** The pull requests of a session, as `#number` followed by the title when it is known. */
function getSessionPullRequestSearchTexts(session: ISession): string[] {
	// Pull request numbers are only unique within a repository.
	const pullRequests = new Map<string, { readonly number: number; readonly title: string | undefined }>();
	const add = (owner: string, repo: string, number: number, title: string | undefined) => {
		const key = `${owner}/${repo}#${number}`.toLowerCase();
		pullRequests.set(key, { number, title: pullRequests.get(key)?.title ?? title });
	};
	for (const folder of session.workspace.get()?.folders ?? []) {
		for (const pullRequest of getGitHubPullRequestRefs(folder.gitRepository?.gitHubInfo.get())) {
			add(pullRequest.owner, pullRequest.repo, pullRequest.number, pullRequest.title);
		}
	}
	for (const artifact of session.artifacts?.get() ?? []) {
		const pullRequest = artifact.kind === SessionArtifactKind.PullRequest && artifact.isGitHub !== false && artifact.link
			? parseGitHubPullRequestUrl(artifact.link.toString(true))
			: undefined;
		if (pullRequest) {
			add(pullRequest.owner, pullRequest.repo, pullRequest.number, undefined);
		}
	}
	return [...pullRequests.values()].map(({ number, title }) => title ? `#${number} ${title}` : `#${number}`);
}

/**
 * Filters the Sessions list by its search. A session shows when its title, the titles of its chats, or its other text
 * (see {@link ISessionSearchDocument}) contain each word of the query, and its chats show when their title contains
 * one of them. Sections and groups show while they contain a session or chat that shows.
 */
class SessionsListSearchFilter implements IFindFilter<SessionListItem> {

	private query = SessionsListSearchQuery.empty;
	/** The match of each session and standalone chat that the current query has matched, or `null` for a mismatch. */
	private readonly matches = new Map<ISession | ISessionChatItem | IPendingSessionItem, ISessionSearchMatch | null>();

	constructor(
		private readonly getDocument: (session: ISession) => ISessionSearchDocument,
	) { }

	set pattern(pattern: string) {
		this.query = new SessionsListSearchQuery(pattern);
		this.matches.clear();
	}

	get isSearching(): boolean {
		return !this.query.isEmpty;
	}

	get wordCount(): number {
		return this.query.words.length;
	}

	/** Forgets the matches of the current query, as the text of sessions may have changed since. */
	invalidate(): void {
		this.matches.clear();
	}

	/** How a session or a standalone chat matches the search, or `undefined` when it does not or there is none. */
	getMatch(element: ISession | ISessionChatItem | IPendingSessionItem): ISessionSearchMatch | undefined {
		if (this.query.isEmpty) {
			return undefined;
		}
		let match = this.matches.get(element);
		if (match === undefined) {
			let document: ISessionSearchDocument;
			if (isPendingSessionItem(element)) {
				document = {
					title: element.title,
					chatTitles: [element.description],
					fields: element.folderUri ? [{ kind: 'folder', text: element.folderUri.path }] : [],
				};
			} else if (isSessionChatItem(element)) {
				// A done chat listed on its own row matches by its own title and its session's location only.
				const sessionDocument = this.getDocument(element.session);
				document = { title: getChatTitle(element.chat), chatTitles: [], fields: sessionDocument.fields.filter(field => field.kind === 'folder' || field.kind === 'repository') };
			} else {
				document = this.getDocument(element);
			}
			match = matchSessionSearch(this.query, document) ?? null;
			this.matches.set(element, match);
		}
		return match ?? undefined;
	}

	filter(element: SessionListItem): TreeFilterResult<FuzzyScore> {
		if (this.query.isEmpty) {
			return TreeVisibility.Visible;
		}
		if (isSessionChatItem(element) && !element.standalone) {
			if (!this.getMatch(element.session)) {
				return TreeVisibility.Hidden;
			}
			const titleMatches = findSearchWords(this.query.words, getChatTitle(element.chat));
			return titleMatches.length > 0 ? { data: toSearchFilterData(titleMatches), visibility: TreeVisibility.Visible } : TreeVisibility.Hidden;
		}
		if (isSessionItem(element) || isSessionChatItem(element) || isPendingSessionItem(element)) {
			const match = this.getMatch(element);
			return match ? { data: toSearchFilterData(match.titleMatches), visibility: TreeVisibility.Visible } : TreeVisibility.Hidden;
		}
		return isSessionSection(element) || isSessionGroupItem(element) ? TreeVisibility.Recurse : TreeVisibility.Hidden;
	}
}

const SHOW_MORE_FOLDERS_LABEL = '__more_folders__';
/** The section id of the placeholder a scoped list shows while none of its folders' sessions are listed. */
const SCOPE_EMPTY_PLACEHOLDER_ID = '__scope_empty__';
const FOUR_DAYS_MS = 4 * 24 * 60 * 60 * 1000;

//#endregion

//#region Sessions List Control

interface ISessionsListControlOptions {
	readonly pendingSections?: IObservable<readonly IPendingSessionSection[]>;
	readonly schedulingEnabled?: IObservable<boolean>;
	readonly scheduledSessions?: IObservable<readonly IPendingSessionItem[]>;
	readonly scheduledSessionResources?: IObservable<ReadonlySet<string>>;
	readonly scheduledRequests?: IObservable<ReadonlyMap<string, readonly IChatScheduledRequest[]>>;
	readonly sectionRowHeight?: number;
	readonly titleOnlyQuickChatRowHeight?: number;
	readonly overrideStyles?: IStyleOverride<IListStyles>;
	readonly grouping: () => SessionsGrouping;
	readonly sorting: () => SessionsSorting;
	readonly compact?: () => boolean;
	readonly showNavigationShortcuts?: () => boolean;
	readonly showCustomizations?: () => boolean;
	readonly customizationsCount?: IObservable<number>;
	readonly customizationMigrationsAvailable?: IObservable<boolean>;
	/** Describes why the Customizations navigation entry shows a badge, if it does. */
	readonly customizationsBadge?: IObservable<string | undefined>;
	readonly navigationContainer?: HTMLElement;
	readonly onDidChangeNavigationHeight?: () => void;
	/** Canvases pinned to the sidebar, listed as navigation rows below the navigation shortcuts. */
	readonly pinnedCanvases?: IPinnedCanvasService;
	readonly focusNewSessionInput?: () => void;
	readonly findWidgetContainer?: HTMLElement;
	readonly onDidScroll?: () => void;
	/**
	 * Whether the sessions providers list only the sessions of a scope, such as of the folders of the window's workspace:
	 * then the list shows no workspace and no comparison without a listed session, hides none of its workspaces, and says
	 * so when it shows no session. The providers scope the sessions themselves.
	 */
	readonly scoped?: IObservable<boolean>;
	/**
	 * Whether grouping by time lists the sessions without a workspace in the "Chats" section, flat, as the other groupings
	 * do, rather than among the time sections; it does not by default. A {@link scoped} list has no Chats section at all.
	 */
	readonly quickChatsInTimeGrouping?: boolean;
	onSessionOpen(resource: URI, preserveFocus: boolean, sideBySide: boolean): void | Promise<void>;

	/**
	 * Gate invoked before a session is opened (before mark-read, activation, and
	 * folder mount). Return `false` to refuse the open — e.g. the session's folder
	 * is not trusted — leaving the current session/empty slot untouched. When
	 * omitted, opens are not gated.
	 */
	canOpenSession?(session: ISession): Promise<boolean>;
	/** Whether the Worktrees filter applies, as it does outside the Agents window. Defaults to `true`. */
	readonly offersWorktreeFilter?: boolean;
	/**
	 * Whether it lists quick chats, which have no workspace: as the Agents window and an editor window without a folder do,
	 * and an editor window with one does not. It lists them again, or no longer, as this changes. Defaults to listing them.
	 */
	readonly listsQuickChats?: IObservable<boolean>;
	onChatOpen?(session: ISession, chat: IChat, preserveFocus: boolean, sideBySide: boolean): void | Promise<void>;

	/**
	 * Approval model tracking pending tool confirmations for the shown sessions
	 * and their chats. When omitted the list creates and owns its own; injectable
	 * so tests and fixtures can supply pending approvals without a live chat model.
	 */
	readonly approvalModel?: AgentSessionApprovalModel;
}

interface IListOpenRequest {
	readonly session: ISession;
	readonly chat: IChat | undefined;
	readonly sideBySide: boolean;
	readonly onOpened?: () => void;
	preserveFocus: boolean;
	started: boolean;
	invocation: number;
}

/** A session that the list shows as a chat of the session it moves under while its provider moves it. */
interface IPendingSessionMove extends IDisposable {
	readonly session: ISession;
	/** The main chat of {@link session}, which the move takes along. */
	readonly chat: IChat;
	readonly destination: ISession;
	/** The chat of {@link destination} that the moved chat follows; `undefined`: first. */
	readonly after: IChat | undefined;
}

/**
 * Identifies a sessions list row by the model identity it renders. Only test
 * subclasses use it, to drive rows that production reaches through user input.
 */
export type SessionsListItemReference =
	| { readonly session: URI; readonly chat?: URI }
	| { readonly pendingSession: string }
	| { readonly group: string }
	| { readonly section: string };

export interface ISessionsList {
	readonly element: HTMLElement;
	readonly onDidUpdate: Event<void>;
	readonly onDidChangeFindOpenState: Event<boolean>;
	refresh(): void;
	reveal(sessionResource: URI): boolean;
	revealPendingSession(id: string): boolean;
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
	isSessionListed(session: ISession, reader?: IReader): boolean;
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
		readonly children?: readonly SessionsListSnapshotNode[];
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

/** The session row the user is on in a focused list, with the session rows it shows, so that it can keep their place. */
interface IKeyboardPosition {
	/** The id of the focused session row. */
	readonly id: string;
	/** The session rows the list shows, in display order, each with the id of the top-level row it is under. */
	readonly rows: ReadonlyMap<string, { readonly session: ISession; readonly topLevelRowId: string }>;
}

export class SessionsList extends Disposable implements ISessionsList {
	private readonly archiveDemand = this._register(new MutableDisposable());

	private static readonly SECTION_COLLAPSE_STATE_KEY = 'sessionsListControl.sectionCollapseState';
	private static readonly SESSION_COLLAPSE_STATE_KEY = 'sessionsListControl.sessionCollapseState';
	private static readonly EXCLUDED_TYPES_KEY = 'sessionsListControl.excludedSessionTypes';
	private static readonly EXCLUDED_STATUSES_KEY = 'sessionsListControl.excludedStatuses';
	private static readonly EXCLUDE_ARCHIVED_KEY = 'sessionsListControl.excludeArchived';
	private static readonly EXCLUDE_READ_KEY = 'sessionsListControl.excludeRead';
	private static readonly SHOW_EMPTY_GROUPS_KEY = 'sessionsListControl.showEmptyGroups';
	private static readonly WORKSPACE_GROUP_CAPPED_KEY = 'sessionsListControl.workspaceGroupCapped';
	private static readonly INBOX_AUTO_ADVANCE_EXPLAINED_KEY = 'sessionsListControl.inboxAutoAdvanceExplained';
	/**
	 * The user's last show more/show less choice per capped workspace section and
	 * custom group: `true` lists every session, `false` caps the section.
	 */
	private static readonly SESSION_GROUP_EXPANSION_STATE_KEY = 'sessionsListControl.sessionGroupExpansionState';
	/** Set once {@link SessionsList.migrateCloudSandboxRepositorySections} has run. */
	private static readonly CLOUD_SANDBOX_REPOSITORY_SECTIONS_MIGRATED_KEY = 'sessionsListControl.cloudSandboxRepositorySectionsMigrated';
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
	private readonly selectedSessions: IObservable<readonly ISession[]>;
	private readonly navigationList: WorkbenchList<ISessionSection> | undefined;
	private navigationSections: readonly ISessionSection[] = [];
	private sessions: ISession[] = [];
	private readonly pendingListUpdate = this._register(new MutableDisposable());
	private refreshPending = false;
	private readonly sessionChatsObserver = this._register(new MutableDisposable());
	/** Whether side chats show in the side pane, which the list then does not list below their sessions. */
	private readonly _hideSideChats: IObservable<boolean>;
	private readonly inboxObserver = this._register(new MutableDisposable());
	/** Inbox placements computed by {@link inboxObserver}, reused while building the tree. */
	private inboxPlacements: ReadonlyMap<string, IInboxPlacement> | undefined;
	private readonly inboxDemand = this._register(new MutableDisposable());
	private readonly sessionChatsUpdate = this._register(new MutableDisposable());
	private readonly activeSessionUpdate = this._register(new MutableDisposable());
	private readonly pendingInboxAdvance = this._register(new MutableDisposable());
	private readonly inboxAutoAdvanceSpotlight = this._register(new MutableDisposable<InboxAutoAdvanceSpotlight>());
	private readonly nestedSessionOrderUpdate = this._register(new MutableDisposable());
	/** Reveals what a move started from the list moved, once the list shows it; see {@link watchMove}. */
	private readonly pendingMoveReveal = this._register(new MutableDisposable<DisposableStore>());
	/** Sessions shown as chats of the sessions they move under while their provider moves them, by session ID; see {@link showPendingSessionMove}. */
	private readonly pendingSessionMoves = this._register(new DisposableMap<string, IPendingSessionMove>());
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
	 * Session IDs whose hierarchy indent/connector guides show while the pointer
	 * is outside the Sessions pane: every session that is the parent of, or
	 * itself, a currently selected or keyboard-focused row. Focus is tracked
	 * separately from selection because arrow-key navigation (via the workbench
	 * `list.focusUp`/`list.focusDown` commands) moves the tree's focus without
	 * changing its selection. While the pointer is over the pane, CSS shows
	 * every hierarchy's guides.
	 */
	private readonly selectedGuideSessionIds = observableValue<ReadonlySet<string>>(this, EMPTY_GUIDE_SESSION_IDS);
	private readonly focusedGuideSessionIds = observableValue<ReadonlySet<string>>(this, EMPTY_GUIDE_SESSION_IDS);
	private readonly activeGuideSessionIds = derived(this, reader => {
		const selected = this.selectedGuideSessionIds.read(reader);
		const focused = this.focusedGuideSessionIds.read(reader);
		if (focused.size === 0) {
			return selected;
		}
		const ids = new Set(selected);
		for (const id of focused) {
			ids.add(id);
		}
		return ids;
	});
	private visible = true;
	/** Whether something the list shows changed while it was hidden, which it skips rendering until it shows again. */
	private changedWhileHidden = false;
	/** Until when what the list rendered last holds, as its sections and caps also follow the time: see {@link getRenderValidUntil}. */
	private renderValidUntil = Number.POSITIVE_INFINITY;
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
	private readonly renderedComparisonParticipantConnectorPositions = new Map<string, SessionGroupConnectorPosition>();
	private readonly renderedComparisonAttemptLabels = new Map<string, string>();
	/** How many groups each rendered custom group is nested in, by group id. */
	private readonly groupDepths = new Map<string, number>();
	private readonly comparisonParentSessionIds = new Set<string>();
	private readonly attachedComparisonSessionIds = new Set<string>();
	private expandedMoreFolders = false;
	/** The grouping sections that capping currently hides behind the "+N more" row. */
	private hiddenGroupingSections: readonly ISessionSection[] = [];
	private openWindowSourceFolder: URI | undefined;
	/** Whether the search is open with a query that has words to search for. */
	private hasFindPattern = false;
	private suspendCollapseStatePersistence = false;
	private hadInboxSessions = false;
	private readonly findOpen = observableValue(this, false);
	private readonly searchFilter: SessionsListSearchFilter;
	private readonly findController: SessionsListFindController<SessionListItem | null>;
	/**
	 * While searching, the collapse state of the rows from before the search expanded them. A search expands the rows
	 * that hold its results without persisting that, and restores this state once it ends.
	 */
	private searchCollapseSnapshot: Map<string, boolean> | undefined;
	/** Whether the next {@link update} expands the rows for a search that just started. */
	private expandForSearch = false;
	/** The collapse state that the next {@link update} restores, as a search just ended. */
	private collapseStateToRestore: Map<string, boolean> | undefined;

	/** The group whose header is currently showing its inline name editor. */
	private _editingGroupId: string | undefined;
	private _groupRenderer!: SessionGroupRenderer;
	private readonly groupAppearancePicker: SessionGroupAppearancePicker;
	private _sectionRenderer!: SessionSectionRenderer;
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

	/** The workspace sections capped behind "+N more", shown in the list or not. */
	private _moreFolderSectionIds: ReadonlySet<string> = new Set();

	private readonly _onDidUpdate = this._register(new Emitter<void>());
	readonly onDidUpdate: Event<void> = this._onDidUpdate.event;
	private readonly _onDidOpenSession = this._register(new Emitter<URI>());
	readonly onDidOpenSession = this._onDidOpenSession.event;
	private readonly _onDidActivateNewSession = this._register(new Emitter<void>());

	private readonly _onDidChangeFindOpenState = this._register(new Emitter<boolean>());
	readonly onDidChangeFindOpenState: Event<boolean> = this._onDidChangeFindOpenState.event;

	get element(): HTMLElement { return this.listContainer; }
	get scrollTop(): number { return this.tree.scrollTop; }

	/** Describes the list to screen readers beyond its label, such as how to open accessibility help. */
	setAriaDescription(description: string | undefined): void {
		if (description) {
			this.tree.getHTMLElement().setAttribute('aria-description', description);
		} else {
			this.tree.getHTMLElement().removeAttribute('aria-description');
		}
	}

	private isCompact(): boolean {
		return (this.options.compact?.() ?? false) && !IsPhoneLayoutContext.getValue(this.contextKeyService);
	}

	private isInboxLayout(): boolean {
		return this.options.grouping() === SessionsGrouping.Inbox;
	}

	/** The chat the main window shows, which its row reflects as the open one. */
	private readonly _mainWindowShown: IObservable<IShownChat | undefined>;

	constructor(
		container: HTMLElement,
		private readonly options: ISessionsListControlOptions,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsNavigationService private readonly _sessionsNavigationService: ISessionsNavigationService,
		@ISessionHostService sessionHostService: ISessionHostService,
		@ICustomViewService private readonly customViewService: ICustomViewService,
		@ISessionsListModelService private readonly _sessionsListModelService: ISessionsListModelService,
		@ISessionGroupsService private readonly _sessionGroupsService: ISessionGroupsService,
		@ISessionComparisonService private readonly sessionComparisonService: ISessionComparisonService,
		@ISessionSectionOrderService private readonly _sessionSectionOrderService: ISessionSectionOrderService,
		@IAgentHostFilterService private readonly _agentHostFilterService: IAgentHostFilterService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IStorageService private readonly storageService: IStorageService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IMenuService private readonly menuService: IMenuService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@ICommandService private readonly commandService: ICommandService,
		@IAutomationService private readonly automationService: IAutomationService,
		@IVoicePlaybackService private readonly voicePlaybackService: IVoicePlaybackService,
		@IWorkbenchAssignmentService private readonly assignmentService: IWorkbenchAssignmentService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IAgentHostConnectionsService private readonly agentHostConnectionsService: IAgentHostConnectionsService,
		@IOpenerService private readonly openerService: IOpenerService,
		@ILabelService private readonly labelService: ILabelService,
		@ISessionAttentionService private readonly sessionAttentionService: ISessionAttentionService,
		@IEditorService editorService: IEditorService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
		@INotificationService private readonly notificationService: INotificationService,
		@ILogService private readonly logService: ILogService,
		@ISessionsListPresentation private readonly presentation: ISessionsListPresentation,
		@IChatService chatService: IChatService,
		@ISideChatPlacementService sideChatPlacementService: ISideChatPlacementService,
		@IMarkdownRendererService markdownRendererService: IMarkdownRendererService,
		@IHoverService hoverService: IHoverService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@IProductService productService: IProductService,
	) {
		super();
		this._hideSideChats = sideChatPlacementService.inSidePane;
		const mainWindowHost = getMainWindowHost(sessionHostService);
		this._mainWindowShown = derived(this, reader => shownChatOf(mainWindowHost, reader));
		this.groupAppearancePicker = this._register(instantiationService.createInstance(SessionGroupAppearancePicker));
		this.filters = this._register(instantiationService.createInstance(SessionsListFilters));
		this._register(chatService.onDidAcceptRequest(event => {
			if (!event.isNewSession && !event.agentHostMessageOrigin) {
				this.advanceInboxAfterReplyOrApproval(event.chatSessionResource);
			}
		}));
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
			resettableValue(() => this._excludeArchivedIsDefault ? undefined : this._excludeArchived, exclude => this.applyExcludeArchived(exclude), undefined),
			resettableValue(() => this.workspaceGroupCapped, capped => this.applyWorkspaceGroupCapped(capped), true),
			resettableValue(() => this.loadSessionGroupExpansion(), state => this.storeSessionGroupExpansion(state), new Map()),
			resettableValue(() => this.expandedMoreFolders, expanded => { this.expandedMoreFolders = expanded; }, false),
		];

		this.listContainer = DOM.append(container, $('.sessions-list-control.session-list-row-spacing'));
		const primaryContainer = DOM.append(this.listContainer, $('.sessions-list-primary'));
		const searchMessage = DOM.append(primaryContainer, $('.sessions-list-search-empty', { role: 'status' }));
		const treeDisposables = this._register(new DisposableStore());
		const listContextKeyService = this._register(contextKeyService.createScoped(this.listContainer));
		const treeInstantiationService = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, listContextKeyService])));
		this.listContainer.classList.toggle('compact', this.isCompact());
		this.updateIndentItems();
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
		// Re-render so the always-visible "Chats" section appears/disappears when a
		// quick-chat-capable provider is (de)registered (e.g. agent host toggled),
		// or when a registered provider toggles a capability at runtime (e.g. its
		// `supportsQuickChats` flips with agent-host enablement).
		const providerCapabilityListeners = this._register(new DisposableStore());
		const subscribeProviderCapabilities = () => {
			providerCapabilityListeners.clear();
			for (const provider of this._sessionsProvidersService.getProviders()) {
				if (provider.onDidChangeCapabilities) {
					providerCapabilityListeners.add(provider.onDidChangeCapabilities(() => this.update()));
				}
			}
		};
		subscribeProviderCapabilities();
		this._register(this._sessionsProvidersService.onDidChangeProviders(() => {
			subscribeProviderCapabilities();
			this.scheduleListUpdate();
		}));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ONBOARDING_ENABLED_CONFIG) && this.configurationService.getValue<boolean>(ONBOARDING_ENABLED_CONFIG) === false) {
				this.inboxAutoAdvanceSpotlight.clear();
			}
			if (e.affectsConfiguration(SESSIONS_LIST_SHOW_EMPTY_DEFAULT_GROUPS_SETTING) || e.affectsConfiguration(SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING) || e.affectsConfiguration(ChatSessionArchiveActionWordingSettingId)) {
				this.update();
			}
			if (e.affectsConfiguration(SESSIONS_LIST_INDENT_ITEMS_SETTING)) {
				this.updateIndentItems();
			}
			if (e.affectsConfiguration(SESSIONS_LIST_CANVASES_SECTION_SETTING)) {
				this.update();
			}
		}));
		// TEMPORARY (#320480): see the note on the `IAgentSessionsService` import.
		const agentSessionsService = instantiationService.invokeFunction(accessor => accessor.get(IAgentSessionsService));
		const externalApplicationBadgeMode = observableConfigValue(SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SETTING, ExternalSessionApplicationBadgeMode.Off, this.configurationService);
		const externalApplicationBadgeShowFrom = observableConfigValue(SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SHOW_FROM_SETTING, false, this.configurationService);
		const reportExternalApplicationBadgeModeExperimentTrigger = () => logDefaultSettingExperimentTrigger(this.configurationService, this.telemetryService, SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SETTING);
		const reportExternalApplicationBadgeShowFromExperimentTrigger = () => logDefaultSettingExperimentTrigger(this.configurationService, this.telemetryService, SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SHOW_FROM_SETTING);
		this.searchFilter = new SessionsListSearchFilter(session => this.getSessionSearchDocument(session));
		const getSearchHint = (element: ISession | ISessionChatItem, shownTexts: readonly string[]) => this.getSearchHint(element, shownTexts);
		const sessionRenderer = new SessionItemRenderer(
			{
				grouping: this.options.grouping,
				isWorkspaceScoped: () => this.filters.hasInboxWorkspaceScope,
				isPinned: s => this.isSessionPinned(s),
				isRenderedInCustomGroup: s => this.isRenderedInCustomGroup(s),
				getGroupConnectorPosition: s => this.renderedComparisonParticipantConnectorPositions.get(s.sessionId),
				getComparisonAttemptLabel: s => this.getComparisonAttemptLabel(s),
				shouldShowComparisonAttemptStatus: (s, reader) => this.shouldShowComparisonAttemptStatus(s, reader),
				isRenderedInExternalSection: s => this.isRenderedInExternalSection(s),
				getEnvironmentBadgeLabel: s => this.getEnvironmentBadgeLabel(s),
				slotPanes: this._sessionsNavigationService.slotPanes,
				getMultiSelectedSessions: s => this.getMultiSelectedSessions(s),
				handleToolbarAction: async (action, session) => {
					if (!this.isInboxLayout()) {
						return false;
					}
					const sessions = this.getMultiSelectedSessions(session);
					const keyboardPosition = action.id === ACKNOWLEDGE_INBOX_SESSION_COMMAND_ID ? this.captureKeyboardPosition(session) : undefined;
					await action.run(sessions);
					if (action.id === ACKNOWLEDGE_INBOX_SESSION_COMMAND_ID) {
						this.restoreAcknowledgementPosition(keyboardPosition, sessions);
					}
					return true;
				},
				showHover: true,
				useCompactQuickChatRows: true,
				compact: () => this.isCompact(),
				approvalRowMaxLines: DEFAULT_APPROVAL_ROW_MAX_LINES,
				aggregateChatApprovals: false,
				toolbarMenuId: Menus.SessionItemToolbar,
				toolbarTelemetrySource: 'sessionsList.row',
				getAdditionalContextKeys: (session, reader) => [
					[SessionItemInboxStateContext.key, this.getInboxStateContext(session, reader)],
					[SessionItemCanAcknowledgeContext.key, this.getMultiSelectedSessions(session, reader).some(session => this.canAcknowledgeInboxSession(session, reader))],
					[SessionItemCanMergePullRequestContext.key, this.canMergeInboxPullRequest(session, reader)],
					[SessionItemIsMultiSelectionContext.key, this.getMultiSelectedSessions(session, reader).length > 1],
				],
				getTriageDescription: (session, reader) => this.getInboxDescription(session, reader),
				inlineRename: true,
				contextViewService: this.contextViewService,
				onDidDoubleClickRename: session => this.preservePendingOpenFocus(session),
				onDidFinishRename: () => this.tree.domFocus(),
				activeGuideSessionIds: this.activeGuideSessionIds,
				deriveStatusFromMainChat: true,
				mainWindowShown: this._mainWindowShown,
				externalApplicationBadgeMode,
				externalApplicationBadgeShowFrom,
				reportExternalApplicationBadgeModeExperimentTrigger,
				reportExternalApplicationBadgeShowFromExperimentTrigger,
				collapsedSessionIds: this.collapsedSessionIds,
				onboardingTarget: this.onboardingTarget,
				getGroupDepth: session => this.getRowGroupDepth(session),
				getSearchHint,
				scheduledSessionResources: this.options.scheduledSessionResources,
				scheduledRequests: this.options.scheduledRequests,
				focusSession: session => {
					if (this.tree.hasElement(session)) {
						this.tree.setFocus([session]);
					}
					this.tree.domFocus();
				},
			},
			approvalModel,
			undefined,
			instantiationService,
			contextKeyService,
			this.configurationService,
			markdownRendererService,
			hoverService,
			this._sessionsProvidersService,
			this._sessionsManagementService,
			this.agentHostConnectionsService,
			this.openerService,
			this.labelService,
			agentSessionsService,
			this.voicePlaybackService,
			this.notificationService,
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
				getChatSummaryHoverData(item.session, item.chat, this._sessionsProvidersService, this.openerService, this.labelService, getCreatorHoverData(item.session, this._sessionsManagementService, this.agentHostConnectionsService, this.openerService), this.isCompact()),
				this.openerService,
			)),
			() => this.isCompact(),
			() => {
				if (this.options.sorting() === SessionsSorting.Updated) {
					this.nestedSessionOrderUpdate.value = DOM.scheduleAtNextAnimationFrame(DOM.getWindow(this.listContainer), () => {
						if (this.visible) {
							this.update();
						} else {
							this.changedWhileHidden = true;
						}
					});
				}
			},
			this.activeGuideSessionIds,
			item => this.getRowGroupDepth(item),
			session => this.renderedComparisonParticipantConnectorPositions.get(session.sessionId),
			item => getSessionAgentMergeConfigurationObservable(item.session, this._sessionsProvidersService, this.configurationService, item.chat),
			getSearchHint,
			(session, chat) => this.getComparisonAttemptLabel(session, chat),
			sessionRenderer.scheduledIndicatorRenderer,
			item => {
				if (this.tree.hasElement(item)) {
					this.tree.setFocus([item]);
				}
				this.tree.domFocus();
			},
		);
		this._chatRenderer = chatRenderer;
		const selectHeader = (element: ISessionSection | ISessionGroupItem, event: MouseEvent) => {
			// A header of the separate navigation list, such as Canvases, is a row of that list and not of the tree.
			const navigationIndex = this.navigationSections.indexOf(element as ISessionSection);
			if (this.navigationList && navigationIndex >= 0) {
				this.navigationList.setFocus([navigationIndex], event);
				this.navigationList.setSelection([], event);
				return;
			}
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
		const customizationsBadge = this.options.customizationsBadge ?? constObservable(undefined);
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
			customizationsBadge,
			section => this.getRowGroupDepth(section),
			sectionId => this._sessionGroupsService.getSectionAppearance(sectionId),
			(session, reader) => this.isSessionListed(session, reader),
			(entry, reader) => this.customViewService.activeCustomView.read(reader)?.id === PINNED_CANVAS_PAGE_ID
				&& this.options.pinnedCanvases?.selected.read(reader) === entry,
		);
		const sectionRenderer = createSectionRenderer(undefined, 'session-list-section-row');
		const shortcutSectionRenderer = createSectionRenderer(SESSION_SHORTCUT_SECTION_TEMPLATE_ID, 'session-list-shortcut-row');
		this._sectionRenderer = sectionRenderer;
		const groupRenderer = new SessionGroupRenderer({
			commitEdit: (group, name) => this.commitGroupEdit(group, name),
			cancelEdit: group => this.cancelGroupEdit(group),
			select: selectHeader,
			toggleCollapsed: element => this.tree.toggleCollapsed(element),
		}, showUnreadInCollapsedSections, sessionsWithFailingCI, headerStatusTrigger, instantiationService, contextKeyService, this.configurationService, hoverService);
		this._groupRenderer = groupRenderer;

		// Read (don't bind) `IsPhoneLayoutContext` from the parent context so we
		// observe the workbench's value rather than shadowing it with a fresh
		// scoped default of `false`. The reactive height refresh below listens
		// on the same scoped service for changes.
		const isPhone = () => !!IsPhoneLayoutContext.getValue(contextKeyService);
		const delegate = new SessionsTreeDelegate(
			approvalModel,
			isPhone,
			() => this.isCompact(),
			session => getSessionRowStatus(session, undefined, true, this.collapsedSessionIds.get().has(session.sessionId)),
			DEFAULT_APPROVAL_ROW_MAX_LINES,
			undefined,
			true /* useCompactQuickChatRows */,
			false /* aggregateChatApprovals */,
			true /* useInsetRowSpacing */,
			session => this.getComparisonAttemptLabel(session) !== undefined,
			this.options.sectionRowHeight,
			() => this.isInboxLayout(),
			this.options.titleOnlyQuickChatRowHeight,
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
						customizationsBadge,
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
				} else if (e.element?.pinnedCanvas) {
					this.showPinnedCanvasContextMenu(e.element.pinnedCanvas, e.anchor);
				} else if (e.element?.id === CANVASES_SECTION_ID) {
					this.showHeaderContextMenu(Menus.SessionSectionContext, this.contextKeyService.createOverlay([[SessionSectionTypeContext.key, CANVASES_SECTION_ID]]), e.element, [], e.anchor);
				}
			}));
		}
		const pinnedCanvases = this.options.pinnedCanvases;
		if (pinnedCanvases) {
			this._register(runOnChange(pinnedCanvases.entries, () => this.update()));
			this._register(runOnChange(pinnedCanvases.enabled, () => this.update()));
		}
		const scoped = this.options.scoped;
		if (scoped) {
			this._register(runOnChange(scoped, () => this.update()));
		}

		const indentGuides = new SessionsListIndentGuides<SessionListItem>(element => this.getRowIndent(element), () => this.tree);
		this.tree = treeDisposables.add(treeInstantiationService.createInstance(
			WorkbenchObjectTree<SessionListItem, FuzzyScore>,
			'SessionsListTree',
			primaryContainer,
			delegate,
			[
				sessionRenderer,
				chatRenderer,
				sectionRenderer,
				shortcutSectionRenderer,
				groupRenderer,
				showMoreRenderer,
				placeholderRenderer,
				new PendingSessionRenderer(instantiationService, (item, anchor) => this.showPendingSessionContextMenu(item, anchor), error => this.notificationService.error(error)),
			].map((renderer: ITreeRenderer<SessionListItem, FuzzyScore, unknown>) => indentGuides.wrapRenderer(renderer)),
			{
				accessibilityProvider: new SessionsAccessibilityProvider(sectionRenderer.automationStatus, {
					scheduledSessionResources: this.options.scheduledSessionResources,
					scheduledRequests: this.options.scheduledRequests,
					widgetAriaLabel: localize('sessionsPrimaryList', "Sessions"),
					getTriageDescription: (session, reader) => this.getInboxDescription(session, reader),
					grouping: this.options.grouping,
					isWorkspaceScoped: () => this.filters.hasInboxWorkspaceScope,
					getChatHarnessLabel: (session, chat, reader) => getDistinctChatHarnessLabel(session, chat, this._sessionsProvidersService, reader),
					isPinned: session => this.isSessionPinned(session),
					isRenderedInCustomGroup: session => this.isRenderedInCustomGroup(session),
					getComparisonAttemptLabel: (session, chat) => this.getComparisonAttemptLabel(session, chat),
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
					getSearchHint,
				}),
				dnd: this._register(new SessionsListDragAndDrop({
					getRowPlacement: session => this.getRowPlacement(session),
					getVisibleChatRows: session => this.getVisibleChatRows(session),
					getDateSections: () => this.getDateSections(),
					getSessionDropEffect: (sessions, destination) => this.getSessionDropEffect(sessions, destination),
					moveSessions: (sessions, destination) => this.moveSessions(sessions, destination).catch(onUnexpectedError),
					setDropTargetHeader: header => this.setDropTargetHeader(header),
					getHeaderDrop: (header, target, sector) => this.options.grouping() === SessionsGrouping.Inbox ? undefined : this.getHeaderDrop(header, target, sector),
					getRenderedRowCount: element => this.tree.hasElement(element) ? this.tree.getListRenderCount(element) : 1,
					getMoreFoldersDropIndex: () => this.getMoreFoldersDropIndex(),
					moveHeader: (header, drop) => this.moveHeader(header, drop),
					getMovableDraggedChat: item => this.getMovableDraggedChat(item),
					fillChatReferenceDragData: (event, session, chat) => fillSessionChatReferenceDragData(event, session, chat, this._sessionsProvidersService),
					areChatPositionsShown: () => this.areChatPositionsShown(),
					isCrossAgentChatMoveEnabled: () => isCrossAgentChatMoveEnabled(this.configurationService),
					canMoveSessionUnder: session => this.isChatMoveDndEnabled() && this._sessionsManagementService.canMoveSessionUnder(session),
					moveChat: (session, chat, drop) => this.moveChatByDrop(session, chat, drop),
					moveSessionUnder: (session, target, after) => this.moveSessionUnderByDrop(session, target, after),
					isInManuallyOrderedSection: session => this.isSessionPinned(session) || this._sessionGroupsService.getGroupOfSession(session.sessionId) !== undefined || isSessionGroupingSection(this.getUngroupedSectionIds(session)[0]),
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
					getId: getSessionListItemId,
					getGroupId: (element: SessionListItem) => {
						if (isPendingSessionItem(element)) {
							return element.kind === 'draft' ? 5 : 6;
						}
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
				// The list's own find widget searches with `searchFilter` instead of fuzzy matching row labels.
				findWidgetEnabled: false,
				filter: this.searchFilter,
				keyboardNavigationLabelProvider: {
					getKeyboardNavigationLabel: (element: SessionListItem) => {
						if (isPendingSessionItem(element)) {
							return element.title;
						}
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
							return this.getComparisonAttemptLabel(element.session, element.chat) ?? getChatTitle(element.chat);
						}
						return this.getComparisonAttemptLabel(element) ?? element.title.get();
					}
				},
				overrideStyles: this.options.overrideStyles,
				// Indent guides are not in Stable yet; elsewhere they follow `workbench.tree.renderIndentGuides`.
				renderIndentGuides: productService.quality === 'stable' ? RenderIndentGuides.None : undefined,
				twistieAdditionalCssClass: element => {
					if (!isSessionItem(element) || this.getRenderedSessionListChats(element).length === 0 && !this.comparisonParentSessionIds.has(element.sessionId)) {
						return 'force-no-twistie';
					}
					if (this.getComparisonAttemptLabel(element) !== undefined) {
						return 'session-comparison-attempt-twistie';
					}
					return this.renderedComparisonParticipantConnectorPositions.has(element.sessionId) ? 'session-comparison-twistie' : 'session-chat-twistie';
				},
			}
		));
		// Collapsing a row, or diffing children, changes the row below a row without rendering it again.
		treeDisposables.add(this.tree.onDidChangeModel(() => indentGuides.refresh()));
		treeDisposables.add(this.tree.onDidChangeCollapseState(() => indentGuides.refresh()));
		this.selectedSessions = observableFromEvent(this, this.tree.onDidChangeSelection,
			() => this.tree.getSelection().filter((item): item is ISession => !!item && isSessionItem(item)));
		this.findController = this._register(new SessionsListFindController(this.tree, this.searchFilter, this.contextViewService, {
			isSearching: () => this.searchFilter.isSearching,
			// Showing no chats of a session that has some makes its row stand for the whole session.
			didFilter: () => this.syncCollapsedSessionIds(),
			getResults: () => this.getSearchResults(),
			renderInlineMessage: message => {
				const inline = isPhone();
				const text = inline ? message : '';
				// Don't announce the same empty state again when the tree refreshes.
				if (searchMessage.textContent !== text) {
					searchMessage.textContent = text;
				}
				return inline;
			},
		}, {
			findWidgetContainer: this.options.findWidgetContainer,
			styles: defaultFindWidgetStyles,
		}));
		const focusedChatItemContext = SessionsListFocusedChatItemContext.bindTo(listContextKeyService);
		this.focusedChatCanMoveUpContext = SessionChatItemCanMoveUpContext.bindTo(listContextKeyService);
		this.focusedChatCanMoveDownContext = SessionChatItemCanMoveDownContext.bindTo(listContextKeyService);
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
		this._register(this.tree.onDidChangeContentHeight(() => {
			this.updateStickyShowMore();
		}));
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
		// the session whose guides it belongs to, so selecting/focusing a chat
		// child reveals only its own parent's guides, never an unrelated
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
			if (isPendingSessionItem(element)) {
				try {
					await element.open();
				} catch (error) {
					this.notificationService.error(error);
				}
				return;
			}
			if (isSessionSection(element) && element.id === AUTOMATIONS_SECTION_ID) {
				await this.commandService.executeCommand('sessionsView.manageAutomations');
				return;
			}
			if (isSessionSection(element) && element.pinnedCanvas) {
				await this.options.pinnedCanvases?.show(element.pinnedCanvas);
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
				if (element.movingFrom) {
					// Until the move ends, the chat is the main chat of the session it moves from.
					await this.beginOpenRequest(element.movingFrom, undefined, preserveFocus, e.sideBySide);
					return;
				}
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
				const comparison = this.sessionComparisonService.getComparisonForSession(element.resource);
				if (comparison?.sessionResource && comparison.archivedAt === undefined && isEqual(comparison.sessionResource, element.resource) && !e.sideBySide) {
					await this.commandService.executeCommand(OPEN_SESSION_COMPARISON_COMMAND_ID, comparison.id);
					return;
				}
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
				if (this.voicePlaybackService.hasPendingResponse(element.resource)) {
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
		const sectionVisibilityKeys = new Set<string>([ChatAutomationsEnabledContext.key, ChatContextKeys.enabled.key]);
		this._register(this.contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(sectionVisibilityKeys)) {
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
				if (this.persistsCollapseState()) {
					this.saveSectionCollapseState(getSessionGroupSectionId(element.group.id), e.node.collapsed);
				}
			} else if (element && isSessionSection(element)) {
				sectionRenderer.updateCollapseState(element, e.node.collapsible, e.node.collapsed);
				if (this.persistsCollapseState()) {
					this.saveSectionCollapseState(element.collapseStateId ?? element.id, e.node.collapsed);
				}
				if (element.id === 'archived') {
					this.updateArchiveDemand();
				}
			} else if (element && isSessionItem(element)) {
				this.syncCollapsedSessionIds();
				if (this.persistsCollapseState()) {
					this.saveSessionCollapseState(element, e.node.collapsed);
				}
			}
			this.updateStickyShowMore();
		}));

		const updateFindPatternState = (hasFindPattern: boolean) => {
			if (hasFindPattern !== this.hasFindPattern) {
				this.hasFindPattern = hasFindPattern;
				if (hasFindPattern) {
					this.searchCollapseSnapshot = this.captureCollapseState();
					this.expandForSearch = true;
				} else {
					this.collapseStateToRestore = this.searchCollapseSnapshot;
					this.searchCollapseSnapshot = undefined;
				}
				this.update();
			}
		};

		const searchOpenContext = SessionsListSearchOpenContext.bindTo(listContextKeyService);
		this._register(this.findController.onDidChangeOpenState(open => {
			searchOpenContext.set(open);
			this.findOpen.set(open, undefined);
			this._onDidChangeFindOpenState.fire(open);
		}));

		// Only treat the find as "active" for layout purposes (bypassing workspace
		// capping and per-group limits, expanding the rows with results) once the
		// user has actually typed a word. Opening the empty find widget should not
		// reorder the list, and closing find, which clears its pattern, should
		// restore the capped layout. Reopening it restores its last pattern.
		this._register(this.findController.onDidChangePattern(pattern => {
			this.searchFilter.pattern = pattern;
			const wasSearching = this.hasFindPattern;
			updateFindPatternState(!new SessionsListSearchQuery(pattern).isEmpty);
			if (wasSearching === this.hasFindPattern && (this.isInboxLayout()
				|| this.sessionComparisonService.comparisons.get().some(comparison => comparison.originatingChatResource))) {
				this.update();
			}
		}));

		const searchTelemetry = this._register(new SessionsListSearchTelemetry(this.telemetryService));
		this._register(this.findController.onDidSearch(results => searchTelemetry.queryChanged(this.searchFilter.wordCount, results?.count ?? 0, results?.beyondTitleCount ?? 0)));
		this._register(this.findController.onDidChangeResults(results => {
			// Not while the list renders for a query that is being cleared: it no longer filters by the query's words.
			if (this.hasFindPattern) {
				searchTelemetry.resultsChanged(results.count, results.beyondTitleCount);
			}
		}));
		this._register(this.onDidOpenSession(() => searchTelemetry.resultOpened()));

		this._register(this._sessionsManagementService.onDidChangeSessions(e => {
			if (this.visible) {
				// Additions and removals stay synchronous for move/reveal; lazy metadata changes must not reenter row rendering.
				if (e.added.length || e.removed.length) {
					this.refresh();
				} else {
					this.scheduleListUpdate(true);
				}
			} else {
				this.changedWhileHidden = true;
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

		this._register(this._sessionsListModelService.onDidChange(e => {
			this.expandPinnedSectionForNewPins(e);
			if (this.visible) {
				this.update();
			} else {
				this.changedWhileHidden = true;
			}
		}));

		this._register(this._sessionGroupsService.onDidChange(e => {
			if (this.visible) {
				this.update();
			} else {
				this.changedWhileHidden = true;
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
			} else {
				this.changedWhileHidden = true;
			}
		}));

		this._register(this._agentHostFilterService.onDidChange(() => {
			if (this.visible) {
				this.scheduleListUpdate();
			} else {
				this.changedWhileHidden = true;
			}
		}));
		this._register(this.filters.onDidChange(() => this.update()));
		if (this.options.pendingSections) {
			this._register(runOnChange(this.options.pendingSections, () => this.update()));
		}
		if (this.options.listsQuickChats) {
			this._register(runOnChange(this.options.listsQuickChats, () => this.scheduleListUpdate()));
		}
		if (this.options.schedulingEnabled || this.options.scheduledSessions || this.options.scheduledSessionResources) {
			this._register(autorun(reader => {
				this.options.schedulingEnabled?.read(reader);
				this.options.scheduledSessions?.read(reader);
				this.options.scheduledSessionResources?.read(reader);
				this.scheduleListUpdate();
			}));
		}
		const archivesAvailable = derived(this, reader => this._sessionsManagementService.archivedSessionItems.read(reader).available);
		this._register(autorun(reader => {
			archivesAvailable.read(reader);
			this.scheduleListUpdate();
		}));

		// Re-render when the session the main window shows changes: chat windows, which are other windows, do not select theirs.
		// The list renders and selects the session it shows first as it is created, below.
		let initialShown = true;
		this._register(autorun(reader => {
			const shown = this._mainWindowShown.read(reader);
			if (initialShown) {
				initialShown = false;
				return;
			}
			this.activeSessionUpdate.value = DOM.scheduleAtNextAnimationFrame(DOM.getWindow(this.listContainer), () => {
				if (this.visible) {
					this.update();
					this.syncActiveChatSelection(shown);
				} else {
					this.changedWhileHidden = true;
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

		this._register(runOnChange(this.customViewService.activeCustomView, () => this.syncActiveChatSelection(this._mainWindowShown.get())));

		this.refresh();
		this.syncActiveChatSelection(this._mainWindowShown.get());
		this.observeInboxApprovals(chatService);
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
				} else {
					this.changedWhileHidden = true;
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
				} else {
					this.changedWhileHidden = true;
				}
			});
		}
	}

	refresh(): void {
		this.refreshPending = true;
		this.update();
	}

	/**
	 * Until when the sections and caps of the list hold as it renders them now: they also follow the time, without an event
	 * as it passes, such as a session moving from Recent to Older at midnight, a session updated in the last day staying
	 * Recent (see `RECENTLY_UPDATED_SESSION_THRESHOLD_MS`), or a workspace updated in the last days staying uncapped (see
	 * `FOUR_DAYS_MS`).
	 */
	private getRenderValidUntil(): number {
		const now = new Date();
		let validUntil = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
		for (const session of this.sessions) {
			const updated = session.updatedAt.get().getTime();
			// The first moment after each threshold, as the list counts a session updated exactly at the threshold as within it
			for (const boundary of [updated + RECENTLY_UPDATED_SESSION_THRESHOLD_MS + 1, updated + FOUR_DAYS_MS + 1]) {
				if (boundary > now.getTime() && boundary < validUntil) {
					validUntil = boundary;
				}
			}
		}
		return validUntil;
	}

	private refreshSessions(): void {
		this.sessions = this._sessionsManagementService.getSessions();
		this.sessionChatsUpdate.clear();
		let initialized = false;
		this.sessionChatsObserver.value = autorun(reader => {
			for (const session of this.sessions) {
				getSessionListChats(session, reader, !this._excludeArchived, this._hideSideChats.read(reader));
				session.isExternal?.read(reader);
				session.application.read(reader);
				session.workspace.read(reader);
				session.isQuickChat?.read(reader);
			}
			if (initialized && this.visible) {
				this.sessionChatsUpdate.value = DOM.scheduleAtNextAnimationFrame(DOM.getWindow(this.listContainer), () => {
					if (this.visible) {
						this.update();
					} else {
						this.changedWhileHidden = true;
					}
				});
			} else if (initialized) {
				this.changedWhileHidden = true;
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
		this.renderValidUntil = this.getRenderValidUntil();
		this.updateInboxDemand();
		const activeSession = this._mainWindowShown.get()?.session;
		const onboardingSession = this.onboardingTarget.get()?.session;
		const grouping = this.options.grouping();
		const inbox = grouping === SessionsGrouping.Inbox;
		const nextNestedSessionResources = new Set(
			this.sessions
				.filter(session => getSessionListChats(session, undefined, false, this._hideSideChats.get()).length > 0)
				.map(session => session.resource.toString())
		);

		// Scope to the selected host's providers; an empty set (a declared
		// group with no members yet) matches nothing rather than everything.
		// Which sessions it can list at all, which no other filter and no active session overrides
		const listsQuickChats = this.options.listsQuickChats?.get() ?? true;
		const isEligible = (session: ISession) => this.isSessionListed(session) && (listsQuickChats || !isQuickChatSession(session));
		let filtered = this.sessions.filter(isEligible);
		// The Worktrees filter is of an editor window: in the Agents window, a folder selected there selects nothing
		const availableWorktrees = this.options.offersWorktreeFilter === false ? new Set<string>() : getWorktreeFilterKeys(filtered, () => true, this.uriIdentityService.extUri);
		const scopedProviderIds = this._agentHostFilterService.selectedHost?.providerIds;
		if (scopedProviderIds) {
			const scoped = new Set(scopedProviderIds);
			filtered = filtered.filter(s => scoped.has(s.providerId));
		}
		filtered = filtered.filter(session => this.filters.matches(session, inbox, availableWorktrees));
		const scheduledOnly = this.options.schedulingEnabled?.get() && this.filters.isScheduledOnly();
		if (scheduledOnly) {
			filtered = filtered.filter(session => this.options.scheduledSessionResources?.get().has(session.resource.toString()));
		}
		// The default only changes what the list shows for archived content that the other filters keep.
		if (this._excludeArchivedIsDefault && filtered.some(session => hasArchivedListContent(session, this._hideSideChats.get()))) {
			logSettingExperimentTrigger(this.telemetryService, SESSIONS_LIST_SHOW_ARCHIVED_BY_DEFAULT_SETTING);
		}
		if (this._excludeArchived) {
			filtered = filtered.filter(s => !s.isArchived.get());
		}

		// Keep the active user-facing session visible even when another filter excludes it.
		for (const revealedSession of [activeSession, onboardingSession]) {
			if (revealedSession && !filtered.some(s => s.sessionId === revealedSession.sessionId)) {
				const match = this.sessions.find(s => s.sessionId === revealedSession.sessionId && isEligible(s));
				if (match) {
					filtered = [...filtered, match];
				}
			}
		}
		// A session moving under another session shows as a chat of that session instead.
		if (this.pendingSessionMoves.size > 0) {
			filtered = filtered.filter(session => !this.pendingSessionMoves.has(session.sessionId));
		}
		if (inbox) {
			filtered = filtered.filter(session => this.filters.matchesInboxScope(session));
		}
		// The same sessions also stay visible past the "+N more" caps of sections and folders.
		const revealedSessionIds = [activeSession, onboardingSession].flatMap(session => session ? [session.sessionId] : []);
		// The providers list only the sessions of a host scope (the window's workspace folders), but a comparison can have
		// sessions of other folders, which lookups still find
		const scope = this.getHostScope();
		const isComparisonInScope = (comparison: ISessionComparison) => !scope || getComparisonSessions(comparison, this._sessionsManagementService).some(session => scope.has(session.sessionId));
		filtered = filtered.filter(session => {
			const comparison = this.sessionComparisonService.getComparisonForSession(session.resource);
			return !comparison || !isComparisonLaunchPending(comparison);
		});

		const sorting = this.options.sorting();
		this.inboxObserver.clear();
		this.inboxPlacements = undefined;
		if (inbox && this.visible) {
			let rendered: ReadonlyMap<string, IInboxPlacement> | undefined;
			this.inboxObserver.value = autorun(reader => {
				const attention = this.sessionAttentionService.sessionAttention.read(reader);
				const placements = new Map<string, IInboxPlacement>();
				for (const session of filtered) {
					const sessionAttention = attention.get(session.sessionId);
					placements.set(session.sessionId, {
						section: getSessionInboxSection(session, this._sessionsListModelService.getInboxState(session, reader), reader, sessionAttention),
						priority: getSessionInboxPriority(session, sessionAttention, reader),
						updatedAt: session.updatedAt.read(reader).getTime(),
					});
				}
				this.inboxPlacements = placements;
				// Attention is one map that changes whenever any session's notifications do;
				// rebuild the tree only when a rendered placement or order actually moved.
				if (rendered && !inboxPlacementsEqual(rendered, placements)) {
					this.scheduleListUpdate();
				}
				rendered ??= placements;
			});
		}
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
		const comparisonsByGroupId = new Map(this.sessionComparisonService.comparisons.get().map(comparison => [comparison.groupId, comparison]));
		const topLevelGroups = inbox
			? [...comparisonsByGroupId.keys()].map(id => this._sessionGroupsService.getGroup(id)).filter(isDefined)
			: groupTree.getSubgroups(undefined);
		const groups = inbox ? topLevelGroups : topLevelGroups.flatMap(group => groupTree.getSubtree(group.id));
		const sortedMembersByGroupId = new Map<string, ISession[]>(groups.map(group => {
			const members = groupedMembers.get(group.id) ?? [];
			const comparison = comparisonsByGroupId.get(group.id);
			return [group.id, comparison
				? sortComparisonGroupMembers(comparison, members, sorting, sortKeyForGrouping)
				: sortSessions(members, sorting, sortKeyForGrouping)];
		}));
		this.renderedComparisonParticipantConnectorPositions.clear();
		this.renderedComparisonAttemptLabels.clear();
		this.comparisonSectionIds.clear();
		this.groupDepths.clear();
		const topLevelGroupIds = topLevelGroups.filter(group => !comparisonsByGroupId.has(group.id)).map(group => getSessionGroupSectionId(group.id));

		const archivedSectionLabel = getChatSessionArchivedSectionLabel(getChatSessionArchiveActionWording(this.configurationService));
		const environments = grouping === SessionsGrouping.Environment
			? getSessionEnvironments(this._sessionsProvidersService.getProviders().map(provider => provider.environment))
			: [];
		const sections = groupSessionsForList(forSections, grouping, sorting, session => this.isSessionPinned(session), (s, srt) => this._sessionsListModelService.getSortKey(s, sortingToMode(srt)), archivedSectionLabel, this.groupExternalSessions, environments, session => this.getInboxSection(session), session => this.getInboxPriority(session), this.quickChatsInTimeGrouping, this.hasQuickChatsSection);

		// When done items are shown, the done chats of a session that is not done
		// are listed in the Done section as rows of their own instead of under
		// their session's row.
		const standaloneDoneChats = this._excludeArchived ? [] : filtered.flatMap(session => getSessionDoneListChats(session, this._hideSideChats.get()).map(chat => ({ session, chat })));
		if ((standaloneDoneChats.length > 0 || !this._excludeArchived && this._sessionsManagementService.archivedSessionItems.get().available) && !sections.some(s => s.id === 'archived')) {
			sections.push({ id: 'archived', label: archivedSectionLabel, sessions: [] });
		}
		const comparisonGroupsBySectionId = new Map<string, ISessionGroup[]>();
		const dateSectionByEntryId = new Map<string, string>();
		if (grouping === SessionsGrouping.Date) {
			const entries: SessionSortEntry[] = [
				...forSections.filter(session => !session.isArchived.get() && !this.isSessionPinned(session) && !(this.groupExternalSessions && session.isExternal?.get()) && !(this.quickChatsInTimeGrouping && isQuickChatSession(session))),
				...topLevelGroups.filter(group => comparisonsByGroupId.has(group.id) && isComparisonInScope(comparisonsByGroupId.get(group.id)!) && !(this.quickChatsInTimeGrouping && !comparisonsByGroupId.get(group.id)!.workspace)).map(group => this.getComparisonSortEntry(group.id)),
			];
			const key = (entry: SessionSortEntry) => this._sessionsListModelService.getSortKey(entry, sortingToMode(sorting));
			// A comparison counts as one entry when applying the Recent limit.
			const [recent, older] = partitionByDate(entries.sort((a, b) => key(b) - key(a)), sorting, key, entry => entry.updatedAt.get().getTime());
			for (const [id, entries] of [['recent', recent], ['older', older]] as const) {
				const memberIds = new Set(entries.map(entry => entry.sessionId));
				for (const entry of entries) {
					dateSectionByEntryId.set(entry.sessionId, id);
				}
				const index = sections.findIndex(section => section.id === id);
				const section: ISessionSection = {
					id, label: id === 'recent' ? localize('recent', "Recent") : localize('older', "Older"),
					sessions: sortSessions(forSections.filter(session => memberIds.has(session.sessionId)), sorting, sortKeyForGrouping),
				};
				if (index !== -1) {
					sections.splice(index, 1, ...(entries.length > 0 ? [section] : []));
				} else if (entries.length > 0) {
					sections.push(section);
				}
			}
		}
		{
			let addedRepositorySection = false;
			for (const group of groups) {
				const comparison = comparisonsByGroupId.get(group.id);
				if (!comparison) {
					continue;
				}
				const comparisonSessions = inbox && this.filters.hasInboxScope
					? sortedMembersByGroupId.get(group.id)!
					: getComparisonSessions(comparison, this._sessionsManagementService);
				if ((inbox && this.filters.hasInboxScope && comparisonSessions.length === 0) || !isComparisonInScope(comparison)) {
					continue;
				}
				const environmentId = grouping === SessionsGrouping.Environment
					? comparisonSessions[0]?.environment
					?? comparison.participants.map(participant => this._sessionsProvidersService.getProvider(participant.harness.providerId)?.environment.id).find(isDefined)
					: undefined;
				const environment = environmentId ? environments.find(environment => environment.id === environmentId) ?? { id: environmentId, label: environmentId } : undefined;
				if (grouping === SessionsGrouping.Environment && !environment) {
					continue;
				}
				const repository = grouping === SessionsGrouping.Repository && comparison.workspace
					? comparisonSessions.map(getSessionRepository).find(isDefined)
					: undefined;
				const workspaceLabel = comparison.workspace
					? comparisonSessions.map(sessionWorkspaceLabel).find(label => label !== localize('unknown', "Unknown"))
					?? this.labelService.getWorkspaceLabel(comparison.workspace)
					: localize('chatsSection', "Chats");
				const sectionId = inbox
					? sessionInboxSections.find(id => comparisonSessions.some(session => this.getInboxSection(session) === id)) ?? (comparisonSessions.length === 0 ? SessionInboxSection.Working : undefined)
					: grouping === SessionsGrouping.Date && !(this.quickChatsInTimeGrouping && !comparison.workspace)
						? dateSectionByEntryId.get(getSessionGroupSectionId(group.id))
						: environment ? `${ENVIRONMENT_SECTION_PREFIX}${environment.id}` : !comparison.workspace ? QUICK_CHATS_SECTION_ID : repository ? getRepositorySectionId(repository) : `workspace:${workspaceLabel}`;
				if (!sectionId) {
					continue;
				}
				this.comparisonSectionIds.set(group.id, sectionId);
				if (!inbox && group.parentId !== undefined) {
					continue;
				}
				let workspaceGroups = comparisonGroupsBySectionId.get(sectionId);
				if (!workspaceGroups) {
					workspaceGroups = [];
					comparisonGroupsBySectionId.set(sectionId, workspaceGroups);
				}
				workspaceGroups.push(group);
				let workspaceSection = sections.find(section => section.id === sectionId);
				if (!workspaceSection) {
					workspaceSection = grouping === SessionsGrouping.Date && sectionId !== QUICK_CHATS_SECTION_ID
						? { id: sectionId, label: sectionId === 'recent' ? localize('recent', "Recent") : localize('older', "Older"), sessions: [] }
						: environment
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
			const comparisonParentId = inbox ? undefined : group.parentId ?? (comparisonSectionId ? this.getSectionParentId(comparisonSectionId) : undefined);
			if (comparisonParentId !== undefined) {
				depth = groupTree.getPath(comparisonParentId).length;
			}
			const subgroups = inbox ? [] : groupTree.getSubgroups(group.id).map(subgroup => buildGroupItem(subgroup, depth + 1));
			const members = sortedMembersByGroupId.get(group.id)!;
			const comparison = comparisonsByGroupId.get(group.id);
			if (comparison) {
				const attempts = comparison.participants.filter(participant => participant.role === SessionComparisonParticipantRole.Attempt);
				const sameHarness = attempts.every(participant =>
					participant.harness.providerId === attempts[0].harness.providerId
					&& participant.harness.sessionTypeId === attempts[0].harness.sessionTypeId);
				for (const participant of comparison.participants) {
					if (participant.role !== SessionComparisonParticipantRole.Attempt) {
						continue;
					}
					const session = participant.sessionResource
						? members.find(member => isEqual(member.resource, participant.sessionResource))
						: undefined;
					if (session) {
						this.renderedComparisonAttemptLabels.set(participant.chatResource?.toString() ?? session.sessionId, getSessionComparisonHarnessLabel(participant, !sameHarness));
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
					configuration: getComparisonGroupConfiguration(comparison, this.labelService),
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
		const hasInboxSessions = inbox && sections.some(section => section.id === SessionInboxSection.ReadyForYou && section.sessions.length > 0);
		const inboxBecamePopulated = hasInboxSessions && !this.hadInboxSessions;

		// Keep the "Chats" default section visible even when empty so it stays
		// discoverable, unless the user opts out via the setting. The
		// "Pinned" section is only shown when it actually has pinned sessions.
		const showEmptyDefaultGroups = this.configurationService.getValue<boolean>(SESSIONS_LIST_SHOW_EMPTY_DEFAULT_GROUPS_SETTING);

		// Keep the "Chats" section always visible (even with no quick chats) so its
		// header — leading chat icon, label, and the "+" create action — is always
		// reachable. Only when the grouping lists quick chats there and a provider
		// can actually serve quick chats.
		if (showEmptyDefaultGroups && groupingHasQuickChatsSection(grouping, this.quickChatsInTimeGrouping, this.hasQuickChatsSection) && this._someProviderSupportsQuickChats() && !sections.some(s => s.id === QUICK_CHATS_SECTION_ID)) {
			sections.push({ id: QUICK_CHATS_SECTION_ID, label: localize('chatsSection', "Chats"), sessions: [] });
		}

		// Partition grouping sections into "primary" (meets criteria) and "more". An active
		// find pattern bypasses partitioning so all matching sessions are visible.
		// When the user has chosen "Show All Sessions" (uncapped), show every
		// section inline instead of hiding some behind a "+N more" entry.
		// A scoped list shows only its own workspaces, so it hides none of them.
		const partitionFolders = grouping !== SessionsGrouping.Date && !this.hasFindPattern && this.workspaceGroupCapped && !scope;
		const moreFolderSectionIds = new Set<string>();
		if (partitionFolders) {
			const workspaceSections = sections.filter(s => isSessionGroupingSection(s.id) && this.getSectionParentId(s.id) === undefined);
			// With only two workspaces, hiding one behind a "+1 more" row saves no space.
			if (workspaceSections.length > 2) {
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
					if (!meetsCriteria(section) && section.id !== fallbackId && !this._sessionSectionOrderService.isPromoted(section.id) && !section.sessions.some(session => revealedSessionIds.includes(session.sessionId))) {
						moreFolderSectionIds.add(section.id);
					}
				}
			}
		}

		const children: IObjectTreeElement<SessionListItem>[] = [];

		const sessionGroupLimit = this.sessionGroupLimit.get();
		const sessionGroupExpansion = this.loadSessionGroupExpansion();

		// A search expands the rows that hold its results, and the rows return to how they were once it ends.
		const expandForSearch = this.expandForSearch;
		const collapseStateToRestore = this.collapseStateToRestore;
		this.expandForSearch = false;
		this.collapseStateToRestore = undefined;
		const resolveCollapsed = (element: SessionListItem, collapsed: boolean | ObjectTreeElementCollapseState): boolean | ObjectTreeElementCollapseState => {
			if (this.hasFindPattern) {
				return expandForSearch ? ObjectTreeElementCollapseState.Expanded : ObjectTreeElementCollapseState.PreserveOrExpanded;
			}
			return collapseStateToRestore?.get(getSessionListItemId(element)) ?? collapsed;
		};

		const toSessionChildren = (sessions: readonly ISession[]): IObjectTreeElement<SessionListItem>[] =>
			sessions.map(session => {
				const chats = sortSessionListChats(this.getRenderedSessionListChats(session), sorting);
				const resource = session.resource.toString();
				const wasNested = this.nestedSessionResources.has(resource);
				const persistedCollapsed = this.collapsedSessionResources.has(resource);
				return {
					element: session as SessionListItem,
					collapsible: chats.length > 0,
					collapsed: resolveCollapsed(session, wasNested
						? persistedCollapsed
							? ObjectTreeElementCollapseState.PreserveOrCollapsed
							: ObjectTreeElementCollapseState.PreserveOrExpanded
						: persistedCollapsed
							? ObjectTreeElementCollapseState.Collapsed
							: ObjectTreeElementCollapseState.Expanded),
					children: chats.length > 0
						? chats.map((chat, index) => ({ element: new SessionChatItem(session, chat, index === chats.length - 1, undefined, this.getPendingMoveSource(session, chat)) }))
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
				revealSessionIds: revealedSessionIds,
			});
			const children = sectionId === 'archived' && standaloneDoneChats.length > 0
				? this.toDoneSectionChildren(limited.sessions, standaloneDoneChats, toSessionChildren)
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

			// The "Chats" section is capped like a workspace section in every grouping mode.
			const isWorkspaceGroup = section.id === QUICK_CHATS_SECTION_ID
				|| (grouping !== SessionsGrouping.Date && isSessionGroupingSection(section.id));
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
			if (section.id === 'archived' || inbox && section.id !== SessionInboxSection.ReadyForYou && section.id !== SessionInboxSection.Done && sessionInboxSections.some(id => id === section.id)) {
				defaultCollapsed = ObjectTreeElementCollapseState.PreserveOrCollapsed;
			}

			// The "Pinned" and "Chats" sections start collapsed on first open; the
			// user's later choice is persisted and honored via getSavedCollapseState.
			if (section.id === 'pinned' && !inbox || section.id === QUICK_CHATS_SECTION_ID) {
				defaultCollapsed = ObjectTreeElementCollapseState.PreserveOrCollapsed;
			}
			const savedCollapsed = this.getSavedCollapseState(section.collapseStateId ?? section.id, section.collapseStateId ? section.id : undefined);
			if (savedCollapsed !== undefined) {
				defaultCollapsed = inbox
					? savedCollapsed ? ObjectTreeElementCollapseState.PreserveOrCollapsed : ObjectTreeElementCollapseState.PreserveOrExpanded
					: savedCollapsed;
			} else if (hasInboxSessions && section.id !== SessionInboxSection.ReadyForYou) {
				defaultCollapsed = inboxBecamePopulated ? ObjectTreeElementCollapseState.Collapsed : ObjectTreeElementCollapseState.PreserveOrCollapsed;
			} else if (inbox && section.id === SessionInboxSection.Working) {
				defaultCollapsed = this.hadInboxSessions ? ObjectTreeElementCollapseState.Expanded : ObjectTreeElementCollapseState.PreserveOrExpanded;
			}
			if (inboxBecamePopulated && section.id === SessionInboxSection.ReadyForYou) {
				// Restore user intent rather than preserving the empty placeholder's forced expansion.
				defaultCollapsed = savedCollapsed ?? false;
			}
			return {
				element: section as SessionListItem,
				collapsible: !sessionInboxSections.some(id => id === section.id) || section.sessions.length > 0,
				collapsed: resolveCollapsed(section, defaultCollapsed),
				children: sectionChildren,
			};
		};

		const renderGroup = (groupItem: ISessionGroupItem): IObjectTreeElement<SessionListItem> => {
			const sectionId = getSessionGroupSectionId(groupItem.group.id);
			// Subgroups always render above the group's own sessions.
			const comparisonChildren: IObjectTreeElement<SessionListItem>[] = [];
			const subgroupChildren = this._sessionGroupsService.getChildIds(groupItem.group.id).flatMap(id => {
				const subgroup = groupItemsById.get(id);
				if (subgroup) {
					if (subgroup.comparison) {
						const comparison = comparisonsByGroupId.get(id);
						if (comparison && !isComparisonInScope(comparison)) {
							return [];
						}
						comparisonChildren.push(renderGroup(subgroup));
						return [];
					}
					return [renderGroup(subgroup)];
				}
				const section = sectionById.get(id);
				return section && this.getSectionParentId(section.id) === groupItem.group.id ? [renderWorkspaceSection(section)] : [];
			});
			const sessionChildren: IObjectTreeElement<SessionListItem>[] = groupItem.sessions.length === 0
				? subgroupChildren.length === 0 && comparisonChildren.length === 0
					? [{
						element: {
							placeholder: true as const,
							sectionId,
							label: localize('noSessionInGroup', "No sessions"),
							hover: localize('noSessionInGroupHover', "Use Add to Group from a session's context menu, or drag it into this group."),
						}
					}]
					: []
				: renderSessionChildren(groupItem.sessions, sectionId, groupItem.group.name, !this.hasFindPattern && this.workspaceGroupCapped
					// Custom groups list all of their sessions until the user chooses "Show less".
					? { stateId: sectionId, expandedByDefault: true }
					: undefined);
			const visibleGroupSessions = sessionChildren.map(child => child.element).filter(isSessionItem);
			const connectorSessions = groupItem.comparison ? visibleGroupSessions : [];
			if (connectorSessions.length > 0) {
				for (let index = 0; index < connectorSessions.length; index++) {
					this.renderedComparisonParticipantConnectorPositions.set(
						connectorSessions[index].sessionId,
						index === connectorSessions.length - 1 ? 'last' : 'middle',
					);
				}
			}
			return {
				element: groupItem,
				collapsible: true,
				collapsed: resolveCollapsed(groupItem, this.getSavedCollapseState(sectionId) ?? ObjectTreeElementCollapseState.PreserveOrExpanded),
				children: [...subgroupChildren, ...(comparisonChildren.length > 0 ? this.sortComparisonChildren([...comparisonChildren, ...sessionChildren]) : sessionChildren)],
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
				children: this.sortComparisonChildren([
					...comparisonGroups.map(renderGroup),
					...(renderedSection.children ?? []),
				]),
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
		// The Canvases section follows Automations: as a header and its pins in the navigation list, or as a section in the tree without one.
		const canvasesSection = this.getCanvasesSection();
		if (canvasesSection) {
			if (showNavigationShortcuts) {
				navigationSections.push(canvasesSection, ...this.getPinnedCanvasSections());
			} else {
				children.push(this.renderCanvasesSection(canvasesSection, resolveCollapsed));
			}
		}
		if (this.options.showCustomizations?.() ?? showNavigationShortcuts) {
			navigationSections.push({ id: CUSTOMIZATIONS_SECTION_ID, label: localize('customizations', "Customizations"), sessions: [] });
		}
		if (!this.showsCanvasesSection()) {
			// Pinned canvases follow Automations: in the navigation list, or in the tree without one.
			const pinnedCanvasSections = this.getPinnedCanvasSections();
			if (showNavigationShortcuts) {
				navigationSections.push(...pinnedCanvasSections);
			} else {
				children.push(...pinnedCanvasSections.map(section => renderSection(section)));
			}
		}
		this.setNavigationSections(navigationSections);

		const pinnedSection = sections.find(s => s.id === 'pinned');
		if (pinnedSection) {
			children.push(renderSection(pinnedSection));
		}

		const draftsSection = this.options.pendingSections?.get().find(section => section.id === 'drafts');
		const pendingItems = [
			...(this.options.scheduledSessions?.get() ?? []),
			...(scheduledOnly ? [] : draftsSection?.items ?? []),
		].filter(item => matchesPendingSession(item, this.filters, inbox, scopedProviderIds));
		if (pendingItems.length > 0) {
			const element: ISessionSection = { id: 'drafts', label: draftsSection?.label ?? localize('drafts', "Drafts"), sessions: [], pendingItems };
			children.push({
				element,
				collapsible: true,
				collapsed: resolveCollapsed(element, (this.getSavedCollapseState(element.id) ?? true)
					? ObjectTreeElementCollapseState.PreserveOrCollapsed : ObjectTreeElementCollapseState.PreserveOrExpanded),
				children: pendingItems.map(item => ({ element: item })),
			});
		}

		// Quick chats render as a single "Chats" entry directly below Pinned (above
		// the workspace/repository groups) when the grouping lists them there.
		const quickChatsSection = sections.find(s => s.id === QUICK_CHATS_SECTION_ID);
		if (quickChatsSection) {
			children.push(renderWorkspaceSection(quickChatsSection));
		}

		const renderGroupById = (groupId: string): void => {
			const groupItem = groupItemsById.get(groupId);
			if (groupItem) {
				children.push(renderGroup(groupItem));
			}
		};

		// Match sessions again before filtering sections: their text may have changed since the last update.
		this.searchFilter.invalidate();
		this.hiddenGroupingSections = [];
		this._moreFolderSectionIds = new Set();
		if (inbox) {
			this._topLevelOrder = [];
			for (const id of sessionInboxSections) {
				const sourceSection = sections.find(section => section.id === id);
				const section = sourceSection && this.hasFindPattern
					? { ...sourceSection, sessions: sourceSection.sessions.filter(session => !!this.searchFilter.getMatch(session)) }
					: sourceSection;
				if (section && (section.sessions.length > 0 || id === SessionInboxSection.ReadyForYou)) {
					let rendered = renderWorkspaceSection(section);
					if (id === SessionInboxSection.ReadyForYou) {
						if (section.sessions.length === 0) {
							rendered = {
								...rendered, collapsed: false, children: [{
									element: {
										placeholder: true as const, sectionId: id,
										label: this.filters.hasInboxScope ? localize('inboxScopeEmpty', "No Inbox activity matches this scope.") : localize('inboxEmpty', "Your inbox is clear"),
									},
								}]
							};
						}
					}
					children.push(rendered);
				}
			}
		} else if (grouping === SessionsGrouping.Date) {
			// Groups and the date sections share one user-managed order right
			// below Pinned and Chats. The date sections keep their fixed relative
			// order and never drag; groups default above them and can move between
			// and below them. Pinned stays at the top, Done (archived) at the bottom.
			// Date sections stay in the order even while empty so that a group
			// keeps its place relative to them when they come and go.
			const resolvedIds = keepDateSectionOrder(this._sessionSectionOrderService.resolveOrder([...topLevelGroupIds, ...DATE_SECTION_IDS]));
			this._topLevelOrder = resolvedIds;
			for (const id of resolvedIds) {
				const groupId = getSessionGroupIdOfSection(id);
				if (groupId !== undefined) {
					renderGroupById(groupId);
				} else {
					const section = sections.find(s => s.id === id);
					if (section) {
						children.push(renderWorkspaceSection(section));
					}
				}
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
			this._moreFolderSectionIds = new Set(moreFolderSections.map(s => s.id));
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
		// A scoped list that shows no session says so rather than showing nothing; its folders may have sessions the filters hide.
		if (scope && filtered.length === 0) {
			children.push({ element: { placeholder: true as const, sectionId: SCOPE_EMPTY_PLACEHOLDER_ID, label: localize('sessionsList.scopeEmpty', "No sessions to show in this folder.") } });
		}

		const inboxLayoutChanged = this.listContainer.classList.contains('inbox-layout') !== this.isInboxLayout();
		this.listContainer.classList.toggle('inbox-layout', this.isInboxLayout());
		this.tree.getHTMLElement().setAttribute('aria-label', this.isInboxLayout() ? localize('inboxHeader', "Inbox") : localize('sessionsList', "Sessions"));
		const attachedChildren = this.attachComparisonsToOriginatingSessions(children, inbox, renderSection);
		for (const session of this.sessions) {
			if (this.comparisonParentSessionIds.has(session.sessionId)) {
				nextNestedSessionResources.add(session.resource.toString());
			}
		}
		const keyboardPosition = this.captureKeyboardPosition();
		const visibleSelection = inbox ? this.tree.getSelection().filter((item): item is SessionListItem => !!item && this.isTreeItemVisible(item)) : [];
		this.tree.setChildren(null, attachedChildren);
		this.restoreKeyboardPosition(keyboardPosition);
		this.restoreVisibleInboxSelection(visibleSelection);
		this.hadInboxSessions = hasInboxSessions;
		if (inboxLayoutChanged) {
			for (const session of this.sessions) {
				if (this.tree.hasElement(session)) {
					this.tree.updateElementHeight(session, this._delegate.getHeight(session));
				}
			}
		}
		this.updateArchiveDemand();
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
		if (this.isInboxLayout()) {
			this.stickyShowMoreContainer.hidden = true;
			this.stickyShowMoreItem = undefined;
			return;
		}
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
		const chats = getSessionListChats(session, undefined, !this._excludeArchived && session.isArchived.get(), this._hideSideChats.get());
		return this.pendingSessionMoves.size > 0 ? this.withPendingMovedChats(session, chats) : chats;
	}

	/** `chats`, the chats `session` lists, with the main chats of the sessions moving under it where their moves put them. */
	private withPendingMovedChats(session: ISession, chats: readonly IChat[]): readonly IChat[] {
		let result = chats;
		for (const move of this.pendingSessionMoves.values()) {
			if (move.destination.sessionId === session.sessionId) {
				// Placed after a chat without a row, such as the main chat, or first, the moved chat is the first row.
				const index = move.after ? result.findIndex(chat => isEqual(chat.resource, move.after!.resource)) : -1;
				result = [...result.slice(0, index + 1), move.chat, ...result.slice(index + 1)];
			}
		}
		return result;
	}

	/** The session that `chat` is still in when the list shows it as a chat of `session` only because it moves there. */
	private getPendingMoveSource(session: ISession, chat: IChat): ISession | undefined {
		for (const move of this.pendingSessionMoves.values()) {
			if (move.destination.sessionId === session.sessionId && move.chat === chat) {
				return move.session;
			}
		}
		return undefined;
	}

	private attachComparisonsToOriginatingSessions(children: IObjectTreeElement<SessionListItem>[], inbox: boolean, renderSection: (section: ISessionSection) => IObjectTreeElement<SessionListItem>): IObjectTreeElement<SessionListItem>[] {
		this.comparisonParentSessionIds.clear();
		this.attachedComparisonSessionIds.clear();
		// Inbox keeps comparisons in their own attention category, independently of their caller.
		if (inbox || !this.sessionComparisonService.comparisons.get().some(comparison => comparison.originatingChatResource)) {
			return children;
		}
		const sessions = new Map<string, number>();
		const comparisons = new Map<string, IObjectTreeElement<SessionListItem>>();
		const collect = (nodes: Iterable<IObjectTreeElement<SessionListItem>>, depth: number): void => {
			for (const node of nodes) {
				if (isSessionItem(node.element)) {
					sessions.set(node.element.sessionId, depth);
				} else if (isSessionGroupItem(node.element) && node.element.comparison) {
					comparisons.set(node.element.group.id, node);
				}
				collect(node.children ?? [], depth + 1);
			}
		};
		collect(children, 0);
		const attachments = new Map<string, IObjectTreeElement<SessionListItem>[]>();
		const attachedGroupIds = new Set<string>();
		for (const comparison of this.sessionComparisonService.comparisons.get()) {
			const group = comparisons.get(comparison.groupId);
			const caller = comparison.originatingChatResource && this._sessionsManagementService.getSessionForChatResource(comparison.originatingChatResource)?.session;
			const parent = caller && sessions.get(caller.sessionId);
			if (!group || !isSessionGroupItem(group.element) || group.element.group.parentId !== undefined
				|| !caller || parent === undefined || caller.isArchived.get() || this.sessionComparisonService.getComparisonForSession(caller.resource)
				|| this.hasFindPattern && !this.searchFilter.getMatch(caller)) {
				continue;
			}
			const siblings = attachments.get(caller.sessionId) ?? [];
			siblings.push({ ...group, element: { ...group.element, depth: parent } });
			attachments.set(caller.sessionId, siblings);
			attachedGroupIds.add(comparison.groupId);
			this.comparisonParentSessionIds.add(caller.sessionId);
			for (const session of group.element.sessions) {
				this.attachedComparisonSessionIds.add(session.sessionId);
			}
			this.groupDepths.set(comparison.groupId, parent);
		}
		if (attachedGroupIds.size === 0) {
			return children;
		}
		const attach = (nodes: Iterable<IObjectTreeElement<SessionListItem>>): IObjectTreeElement<SessionListItem>[] => {
			const result: IObjectTreeElement<SessionListItem>[] = [];
			for (const node of nodes) {
				if (isSessionGroupItem(node.element) && attachedGroupIds.has(node.element.group.id)) {
					continue;
				}
				const nested = attach(node.children ?? []);
				const comparisons = isSessionItem(node.element) ? attachments.get(node.element.sessionId) : undefined;
				if (comparisons) {
					nested.push(...this.sortComparisonChildren(comparisons));
				}
				if (isSessionSection(node.element) && nested.length === 0
					&& [...(node.children ?? [])].some(child => isSessionGroupItem(child.element) && attachedGroupIds.has(child.element.group.id))) {
					if (node.element.id === QUICK_CHATS_SECTION_ID
						&& this.configurationService.getValue<boolean>(SESSIONS_LIST_SHOW_EMPTY_DEFAULT_GROUPS_SETTING)
						&& this._someProviderSupportsQuickChats()) {
						result.push(renderSection({ ...node.element, sessions: [] }));
					}
					continue;
				}
				result.push({ ...node, ...(comparisons ? { collapsible: true } : {}), children: nested });
			}
			return result;
		};
		return attach(children);
	}

	/** The Done section's rows: its done sessions and the standalone done chats of sessions that are not done, most recently updated first whatever the sorting. */
	private toDoneSectionChildren(
		sessions: readonly ISession[],
		chats: readonly { readonly session: ISession; readonly chat: IChat }[],
		toSessionChildren: (sessions: readonly ISession[]) => IObjectTreeElement<SessionListItem>[],
	): IObjectTreeElement<SessionListItem>[] {
		const sessionChildren = toSessionChildren(sessions);
		const rows = [
			...sessions.map((session, index) => ({ time: session.updatedAt.get().getTime(), child: sessionChildren[index] })),
			...chats.map(({ session, chat }) => ({
				time: chat.updatedAt.get()?.getTime() ?? chat.createdAt.getTime(),
				child: { element: new SessionChatItem(session, chat, true, true) } satisfies IObjectTreeElement<SessionListItem>,
			})),
		];
		return rows.sort((a, b) => b.time - a.time).map(row => row.child);
	}

	private setNavigationSections(sections: readonly ISessionSection[]): void {
		if (!this.navigationList || !this.options.navigationContainer) {
			return;
		}
		if (sections.length === this.navigationSections.length && sections.every((section, index) => section.id === this.navigationSections[index].id && section.pinnedCanvas === this.navigationSections[index].pinnedCanvas)) {
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
		if (section.pinnedCanvas) {
			await this.options.pinnedCanvases?.show(section.pinnedCanvas);
			return;
		}
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
			case CANVASES_SECTION_ID:
				// The navigation list does not collapse, so its Canvases header starts a session with a canvas, like its toolbar action.
				await this.commandService.executeCommand(NEW_CANVAS_SESSION_COMMAND_ID);
				break;
			case CUSTOMIZATIONS_SECTION_ID:
				this.instantiationService.createInstance(ChatCustomizationsTelemetry).logInteraction('buttonClicked', 'sessionsHeader');
				if (this.options.customizationMigrationsAvailable?.get()) {
					await this.commandService.executeCommand(OPEN_AI_CUSTOMIZATIONS_COMMAND_ID, {
						migration: true,
					} satisfies IOpenAICustomizationsCommandOptions);
				} else {
					await this.commandService.executeCommand(OPEN_AI_CUSTOMIZATIONS_COMMAND_ID);
				}
				break;
		}
	}

	/**
	 * Syncs the sessions whose row stands for the whole session, showing its aggregate status: those collapsed, and
	 * those showing none of their chats, as when a search hides them all.
	 */
	private syncCollapsedSessionIds(): void {
		const collapsedSessionIds = new Set<string>();
		const sessions = new Map<string, ISession>();
		const collect = (node: ITreeNode<SessionListItem | null, FuzzyScore | undefined>): void => {
			if (node.element && isSessionItem(node.element)) {
				sessions.set(node.element.sessionId, node.element);
				if (node.collapsed || (node.collapsible && !node.children.some(child => child.visible && child.element && isSessionChatItem(child.element)))) {
					collapsedSessionIds.add(node.element.sessionId);
				}
			}
			for (const child of node.children) {
				collect(child);
			}
		};
		collect(this.tree.getNode());

		const current = this.collapsedSessionIds.get();
		const changed = [...collapsedSessionIds].filter(sessionId => !current.has(sessionId))
			.concat([...current].filter(sessionId => !collapsedSessionIds.has(sessionId)));
		if (changed.length > 0) {
			this.collapsedSessionIds.set(collapsedSessionIds, undefined);
			// A compact row's height depends on the status it shows; rendered rows re-measure themselves, the others don't.
			for (const sessionId of changed) {
				const session = sessions.get(sessionId);
				if (session) {
					this.tree.updateElementHeight(session, this._delegate.getHeight(session));
				}
			}
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
		const quickChats: ISession[] = [];
		const trackQuickChatHeights = this.options.titleOnlyQuickChatRowHeight !== undefined && IsPhoneLayoutContext.getValue(this.contextKeyService);
		const collect = (node: ITreeNode<SessionListItem | null, FuzzyScore | undefined>): void => {
			if (node.element && isSessionChatItem(node.element)) {
				chatItems.push(node.element);
			} else if (trackQuickChatHeights && node.element && isSessionItem(node.element) && isQuickChatSession(node.element)) {
				quickChats.push(node.element);
			}
			for (const child of node.children) {
				collect(child);
			}
		};
		collect(this.tree.getNode());

		if (chatItems.length === 0 && quickChats.length === 0) {
			this.chatRowHeightReconcile.clear();
			return;
		}

		this.chatRowHeightReconcile.value = autorun(reader => {
			for (const session of quickChats) {
				if (this.tree.hasElement(session)) {
					this.tree.updateElementHeight(session, this._delegate.getHeight(session, reader));
				}
			}
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

	private syncActiveChatSelection(shown: IShownChat | undefined): void {
		// A full-page view, such as Automations or a pinned canvas, covers the shown chat and marks its own row as current.
		if (this.customViewService.activeCustomView.get()) {
			this.tree.setSelection([]);
			return;
		}
		if (!shown) {
			return;
		}
		const session = this.sessions.find(candidate => candidate.sessionId === shown.session.sessionId);
		if (!session) {
			return;
		}
		const activeChat = shown.chat;
		const chatRow = this.findChatRow(session, activeChat.resource);
		if (!chatRow) {
			if (this.tree.hasElement(session)) {
				if (!this.keepsKeyboardPosition()) {
					this.tree.setFocus([session]);
				}
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
		this.revealActiveItem(chatItem);
		if (!this.keepsKeyboardPosition()) {
			this.tree.setFocus([chatItem]);
		}
		this.tree.setSelection([chatItem]);
	}

	/**
	 * Whether the list keeps the row the user is on as it follows the active session: while it has focus, the active
	 * session's row only becomes the selected one, such as when another session opens after the user archived one from the list.
	 */
	private keepsKeyboardPosition(): boolean {
		return DOM.isAncestorOfActiveElement(this.listContainer) && this.tree.getFocus().length > 0;
	}

	/** The session rows the list shows, in display order, each with the id of the top-level row it is under: a section's own id. */
	private getVisibleSessionRows(): Map<string, { readonly session: ISession; readonly topLevelRowId: string }> {
		const rows = new Map<string, { readonly session: ISession; readonly topLevelRowId: string }>();
		const collect = (node: ITreeNode<SessionListItem | null, FuzzyScore | undefined>, topLevelRowId: string): void => {
			if (!node.visible) {
				return;
			}
			if (node.element && isSessionItem(node.element)) {
				rows.set(getSessionListItemId(node.element), { session: node.element, topLevelRowId });
			}
			if (node.collapsed) {
				return;
			}
			for (const child of node.children) {
				collect(child, topLevelRowId);
			}
		};
		for (const child of this.tree.getNode().children) {
			if (child.element) {
				collect(child, isSessionSection(child.element) ? child.element.id : getSessionListItemId(child.element));
			}
		}
		return rows;
	}

	/** The session row the user is on while the list has focus, with the session rows around it. */
	private captureKeyboardPosition(session?: ISession): IKeyboardPosition | undefined {
		if (!session && !DOM.isAncestorOfActiveElement(this.listContainer)) {
			return undefined;
		}
		const focused = session ?? this.tree.getFocus()[0];
		if (!focused || !isSessionItem(focused)) {
			return undefined;
		}
		const rows = this.getVisibleSessionRows();
		const id = getSessionListItemId(focused);
		return rows.has(id) ? { id, rows } : undefined;
	}

	/**
	 * Keeps the user's place when a session is acknowledged, archived, or deleted.
	 * Inbox triage stays among actionable categories, falling back to a heading when empty.
	 */
	private restoreKeyboardPosition(position: IKeyboardPosition | undefined): void {
		if (!position || !DOM.isAncestorOfActiveElement(this.listContainer)) {
			return;
		}
		const rows = this.getVisibleSessionRows();
		const sectionId = position.rows.get(position.id)?.topLevelRowId;
		const isInboxSection = (id: string | undefined): boolean => id === SessionInboxSection.ReadyForYou
			|| id === SessionInboxSection.Working || id === SessionInboxSection.OnHold;
		const stayInInbox = this.isInboxLayout() && isInboxSection(sectionId);
		const hasLeft = (id: string): boolean => {
			const row = rows.get(id);
			return !row || ((row.topLevelRowId === 'archived' || row.topLevelRowId === SessionInboxSection.Acknowledged)
				&& position.rows.get(id)?.topLevelRowId !== row.topLevelRowId);
		};
		if (!hasLeft(position.id)) {
			return;
		}
		const ids = [...position.rows.keys()];
		const index = ids.indexOf(position.id);
		const candidates = [...ids.slice(index + 1), ...ids.slice(0, index).reverse()].filter(id =>
			!hasLeft(id) && (!stayInInbox || isInboxSection(rows.get(id)?.topLevelRowId)));
		const next = (stayInInbox && candidates.find(id => rows.get(id)?.topLevelRowId === sectionId)) || candidates[0];
		const session = next && rows.get(next)?.session;
		const element = session || (stayInInbox && sectionId
			? this.findItem({ section: sectionId }) ?? this.findItem({ section: SessionInboxSection.ReadyForYou })
			: undefined);
		if (!element) {
			return;
		}
		this.tree.setFocus([element]);
		if (this.tree.getRelativeTop(element) === null) {
			this.tree.reveal(element);
		}
	}

	private restoreAcknowledgementPosition(position: IKeyboardPosition | undefined, sessions: readonly ISession[]): void {
		this.update();
		this.tree.domFocus();
		this.restoreKeyboardPosition(position);
		const focused = this.tree.getFocus()[0];
		const selection = this.tree.getSelection().filter(item => {
			if (!item) {
				return false;
			}
			const session = isSessionItem(item) ? item : isSessionChatItem(item) ? item.session : undefined;
			return !session || !sessions.includes(session);
		});
		if (focused && isSessionItem(focused) && !selection.includes(focused)) {
			selection.push(focused);
		}
		this.tree.setSelection(selection);
	}

	private revealActiveItem(element: SessionListItem): void {
		if (this.tree.getRelativeTop(element) !== null) {
			return;
		}
		const previousSuspendCollapseStatePersistence = this.suspendCollapseStatePersistence;
		this.suspendCollapseStatePersistence ||= this.isInboxLayout();
		try {
			this.tree.reveal(element, 0.5);
		} finally {
			this.suspendCollapseStatePersistence = previousSuspendCollapseStatePersistence;
		}
	}

	private isTreeItemVisible(element: SessionListItem): boolean {
		if (!this.tree.hasElement(element) || !this.tree.getNode(element).visible) {
			return false;
		}
		for (let parent = this.tree.getParentElement(element); parent; parent = this.tree.getParentElement(parent)) {
			if (this.tree.isCollapsed(parent)) {
				return false;
			}
		}
		return true;
	}

	private restoreVisibleInboxSelection(previous: readonly SessionListItem[]): void {
		if (previous.length === 0) {
			return;
		}
		const selection = previous.map(item => this.findTreeElement((element): element is SessionListItem => getSessionListItemId(element) === getSessionListItemId(item)));
		const visible = selection.filter((item): item is SessionListItem => !!item && this.isTreeItemVisible(item));
		if (visible.length === selection.length) {
			return;
		}
		const focused = this.tree.getFocus().find((item): item is SessionListItem => !!item && this.isTreeItemVisible(item));
		const nextInboxSession = this.getVisibleInboxSessions()[0];
		const fallback = nextInboxSession ?? focused ?? this.findTreeElement((element): element is ISessionSection => isSessionSection(element) && element.id === SessionInboxSection.ReadyForYou);
		const nextSelection = visible.length ? visible : fallback ? [fallback] : [];
		this.tree.setSelection(nextSelection);
		if (!focused && nextSelection.length) {
			this.tree.setFocus([nextSelection[0]]);
		}
		if (nextSelection.length) {
			this.revealActiveItem(nextSelection[0]);
		}
	}

	/**
	 * Keeps the row of the open chat selected and in view after `session` moved to another section, when `session` is
	 * the session the main window shows. A session row stands for its open chat when the chat's row is collapsed or a
	 * search hides it. Revealing the row expands a collapsed section that holds it.
	 */
	private revealOpenChatRow(session: ISession): void {
		const shown = this._mainWindowShown.get();
		if (!this.visible || !shown || shown.session.sessionId !== session.sessionId) {
			return;
		}
		const listed = this.sessions.find(candidate => candidate.sessionId === session.sessionId);
		if (!listed || !this.tree.hasElement(listed)) {
			return;
		}
		const chatRow = this.findChatRow(listed, shown.chat.resource);
		const chatItem = chatRow && (!chatRow.parent || !this.tree.isCollapsed(chatRow.parent)) ? chatRow.chatItem : undefined;
		const row = chatItem && this.tree.getNode(chatItem).visible ? chatItem : listed;
		if (this.tree.getRelativeTop(row) === null) {
			this.tree.reveal(row, 0.5);
		}
		this.revealAboveStickyShowMore(row);
		this.tree.setFocus([row]);
		this.tree.setSelection([row]);
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

	reveal(sessionResource: URI, preserveCollapsed = false): boolean {
		const resourceStr = sessionResource.toString();
		for (const session of this.sessions) {
			if (session.resource.toString() === resourceStr) {
				if (this.tree.hasElement(session)) {
					if (preserveCollapsed && this.isInboxLayout()) {
						for (let parent = this.tree.getParentElement(session); parent; parent = this.tree.getParentElement(parent)) {
							if (this.tree.isCollapsed(parent)) {
								return false;
							}
						}
					}
					this.revealActiveItem(session);
					if (!this.keepsKeyboardPosition()) {
						this.tree.setFocus([session]);
					}
					this.tree.setSelection([session]);
					return true;
				}
			}
		}
		return false;
	}

	/** Reveals and selects a pending row without moving DOM focus away from its composer. */
	revealPendingSession(id: string): boolean {
		const item = this.findTreeElement((element): element is IPendingSessionItem => isPendingSessionItem(element) && element.id === id);
		if (!item) {
			return false;
		}
		for (let parent = this.tree.getParentElement(item); parent; parent = this.tree.getParentElement(parent)) {
			this.tree.expand(parent);
		}
		this.revealActiveItem(item);
		this.tree.setFocus([item]);
		this.tree.setSelection([item]);
		return true;
	}

	/** Reveals a session and keeps its archive action visible until the caller releases it. */
	revealArchiveAction(session: ISession): IDisposable & { readonly targetId: string } {
		return this.revealOnboardingTarget(session, true);
	}

	/** Keeps a session visible for a spotlight without changing the user's filters. */
	revealSessionForOnboarding(session: ISession): IDisposable & { readonly targetId: string } {
		return this.revealOnboardingTarget(session, false);
	}

	/**
	 * Keeps a session visible like {@link revealSessionForOnboarding}, and targets the header of the
	 * workspace section that contains it. Targets the session row when it is not in a workspace section,
	 * for example when the list is grouped by date.
	 */
	revealSessionWorkspaceForOnboarding(session: ISession): IDisposable & { readonly targetId: string } {
		const reveal = this.revealOnboardingTarget(session, false);
		const section = this.tree.hasElement(session) ? this.tree.getParentElement(session) : undefined;
		if (!section || !isSessionSection(section) || !section.id.startsWith('workspace:')) {
			return reveal;
		}
		if (this.tree.getRelativeTop(section) === null) {
			this.tree.reveal(section);
		}
		return { targetId: getWorkspaceSectionOnboardingTargetId(section.id), dispose: () => reveal.dispose() };
	}

	private revealOnboardingTarget(session: ISession, archiveAction: boolean): IDisposable & { readonly targetId: string } {
		if (this.isInboxLayout() && !this.filters.matchesInboxScope(session)) {
			throw new Error(localize('sessionsList.outsideInboxScope', "This session is outside the current Inbox scope. Reset the scope to reveal it."));
		}
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
		if (!this.keepsKeyboardPosition()) {
			this.tree.setFocus([]);
		}
		this.tree.setSelection([]);
	}

	/** Finds the tree element that renders the referenced row. */
	protected findItem(item: SessionsListItemReference): SessionListItem | undefined {
		const extUri = this.uriIdentityService.extUri;
		if (hasKey(item, { pendingSession: true })) {
			return this.findTreeElement((element): element is IPendingSessionItem => isPendingSessionItem(element) && element.id === item.pendingSession);
		}
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
		this.updateArchiveDemand();
		this.updateInboxDemand();
		if (this.visible) {
			// Shown again, the list keeps its rows: it renders again only what changed while hidden, and the inbox observes
			// its sessions' attention again, which it stops observing while hidden
			if (this.changedWhileHidden || this.isInboxLayout() || Date.now() >= this.renderValidUntil) {
				this.changedWhileHidden = false;
				this.refresh();
			}
		} else {
			this.inboxObserver.clear();
			this.inboxPlacements = undefined;
		}
	}

	private updateInboxDemand(): void {
		if (this.visible && this.options.grouping() === SessionsGrouping.Inbox) {
			this.inboxDemand.value ??= this.sessionAttentionService.acquireSessionAttention();
		} else {
			this.inboxDemand.clear();
			this.inboxAutoAdvanceSpotlight.clear();
		}
	}

	private updateArchiveDemand(): void {
		const section = this.tree.getNode().children.find(node => node.element && isSessionSection(node.element) && node.element.id === 'archived');
		const requested = this.visible && !this._excludeArchived && section && !section.collapsed
			&& this._sessionsManagementService.archivedSessionItems.get().available;
		if (requested && !this.archiveDemand.value) {
			this.archiveDemand.value = this._sessionsManagementService.acquireArchivedSessionItems();
		} else if (!requested) {
			this.archiveDemand.clear();
		}
	}

	layout(height: number, width: number): void {
		this.layoutNavigation(width);
		this.listContainer.style.height = `${height}px`;
		this.tree.layout(Math.max(0, height), width);
		this.updateStickyShowMore();
	}

	setCompact(): void {
		this.listContainer.classList.toggle('compact', this.isCompact());
		this.update();
	}

	private updateIndentItems(): void {
		this.listContainer.classList.toggle('indent-items', this.configurationService.getValue<boolean>(SESSIONS_LIST_INDENT_ITEMS_SETTING) === true);
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
		this.findController.open();
	}

	closeFind(): void {
		this.findController.close();
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
		if (this.options.grouping() === SessionsGrouping.Inbox) {
			return [this.getInboxSection(session)];
		}
		if (this.groupExternalSessions && session.isExternal?.get()) {
			return [EXTERNAL_SESSIONS_SECTION_ID];
		}
		const grouping = this.options.grouping();
		if (groupingHasQuickChatsSection(grouping, this.quickChatsInTimeGrouping, this.hasQuickChatsSection) && isQuickChatSession(session)) {
			return [QUICK_CHATS_SECTION_ID];
		}
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
		if (session.isArchived.get() || !this.isSessionListed(session)) {
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
	private canMoveSession(session: ISession, destination: ISessionDropDestination, attention?: IInboxSessionAttention): boolean {
		if (this.options.grouping() === SessionsGrouping.Inbox) {
			const { placement } = destination;
			if (this.isActiveComparisonSession(session) || placement.kind === 'group') {
				return false;
			}
			return placement.kind === 'archived' || placement.kind === 'pinned'
				|| placement.sectionId === SessionInboxSection.OnHold
				|| placement.sectionId === getSessionInboxSection(session, undefined, undefined, attention);
		}
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
		if (this.options.grouping() === SessionsGrouping.Inbox) {
			return !isSamePlacement(this.getSessionPlacement(session), placement);
		}
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
			watch: watched => this.watchMove(watched),
		}).catch(onUnexpectedError);
	}

	/**
	 * Shows the session that `move` moves under another session as a chat of that session while the move runs (see
	 * {@link showPendingSessionMove}), and reveals what `move` moved once the list shows it (see
	 * {@link watchMoveForReveal}). Call it before the move starts, as the provider reports where the chat went while the
	 * move runs, then call the returned function with whether the move succeeded.
	 */
	watchMove(move: SessionsListMove): (moved: boolean) => void {
		const endPendingMove = move.kind === 'session' ? this.showPendingSessionMove(move.session, move.destination, move.after) : undefined;
		const watchedReveal = this.watchMoveForReveal(move);
		return moved => {
			endPendingMove?.();
			watchedReveal(moved);
		};
	}

	/**
	 * Shows `session` as a chat of `destination` right away, where moving it under `destination` puts it, rather than
	 * once its provider reports the move: the provider may first load all of the session. Call the returned function
	 * once the move ended. Until then, or until the provider reports the move, the list shows the session there; after
	 * that, it shows the session as its provider lists it, where it was when the move failed.
	 */
	private showPendingSessionMove(session: ISession, destination: ISession, after: IChat | undefined): () => void {
		const store = new DisposableStore();
		const move: IPendingSessionMove = { session, chat: session.mainChat.get(), destination, after, dispose: () => store.dispose() };
		const end = () => {
			if (this.pendingSessionMoves.get(session.sessionId) === move) {
				this.pendingSessionMoves.deleteAndDispose(session.sessionId);
				this.scheduleListUpdate();
			}
		};
		this.pendingSessionMoves.set(session.sessionId, move);
		const extUri = this.uriIdentityService.extUri;
		// The provider can report the move before the move ends; its own row then replaces this one.
		store.add(this._sessionsManagementService.onDidMoveChat(({ from }) => {
			if (from.session.sessionId === session.sessionId && extUri.isEqual(from.chat, move.chat.resource)) {
				end();
			}
		}));
		this.scheduleListUpdate();
		return end;
	}

	/**
	 * Reveals and focuses where `move` puts what it moves once the list shows it: the moved chat's row, or the new
	 * session's row for a chat moved into a new session. Call it before the move starts, as the provider reports where
	 * the chat went while the move runs, then call the returned function with whether the move succeeded. Doesn't move
	 * focus into the list. Gives up when the row doesn't show within a few updates of the list or a few seconds, and when
	 * a later move is watched.
	 */
	private watchMoveForReveal(move: SessionsListMove): (moved: boolean) => void {
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
			if (!succeeded || !target || store.isDisposed || this.refreshPending) {
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
	 * Reveals and focuses the row of the session `sessionId`, or of its chat `chat`, selecting it only when it is the open chat; whether the list shows it. A find
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
			this.findController.close();
			if (!hadFocus && DOM.isHTMLElement(activeElement)) {
				activeElement.focus();
			}
			if (!this.tree.hasElement(element) || !this.tree.getNode(element).visible) {
				return false;
			}
		}
		this.tree.reveal(element, 0.5);
		this.tree.setFocus([element]);
		const [rowSession, rowChat] = isSessionChatItem(element) ? [element.session, element.chat] : [session, session.mainChat.get()];
		if (isOpenChat(rowSession, rowChat, this._mainWindowShown, undefined)) {
			this.tree.setSelection([element]);
		}
		return true;
	}

	private getSessionDropEffect(sessions: readonly ISession[], destination: ISessionDropDestination): SessionDropEffect | undefined {
		const attention = this.isInboxLayout()
			? sessions.some(session => session.isArchived.get()) && destination.placement.kind === 'section'
				? this.sessionAttentionService.getSessionAttentionAfterUnarchive(sessions)
				: this.sessionAttentionService.sessionAttention.get()
			: undefined;
		if (!sessions.every(session => this.canMoveSession(session, destination, attention?.get(session.sessionId)))) {
			return undefined;
		}
		const moves = sessions.some(session => this.changesPlacement(session, destination.placement));
		if (this.options.grouping() === SessionsGrouping.Inbox) {
			return moves ? 'triage' : undefined;
		}
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
		const changes = destination.anchor && this.computeSessionReorder(this.sortInDisplayOrder(sessions), destination.anchor);
		return this.canPlaceInDateSection(sessions, placement.sectionId, changes);
	}

	private canPlaceInDateSection(moved: readonly SessionSortEntry[], sectionId: string, changes: { set: ReadonlyMap<string, number>; clear: readonly string[] } | undefined): boolean {
		const sorting = this.options.sorting();
		const mode = sortingToMode(sorting);
		const getSortKey = (session: SessionSortEntry) => changes?.set.get(session.sessionId)
			?? (changes?.clear.includes(session.sessionId) ? this._sessionsListModelService.getNaturalSortKey(session, mode) : this._sessionsListModelService.getSortKey(session, mode));
		const movedIds = new Set(moved.map(entry => entry.sessionId));
		const entries: SessionSortEntry[] = [
			...(this.getDateSections() ?? []).flatMap(section => section.sessions).filter(session => !this.isActiveComparisonSession(session)),
			...this._sessionGroupsService.getGroups().filter(group => group.parentId === undefined && this.isComparisonGroup(group.id) && !this.isComparisonInChatsSection(group.id)).map(group => this.getComparisonSortEntry(group.id)),
		].filter(entry => !movedIds.has(entry.sessionId)).concat(moved);
		const [recent, older] = partitionByDate(entries.sort((a, b) => getSortKey(b) - getSortKey(a)), sorting, getSortKey, entry => entry.updatedAt.get().getTime());
		const target = sectionId === 'recent' ? recent : older;
		return moved.every(entry => target.includes(entry));
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
		const inbox = this.isInboxLayout();
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
		if (inbox) {
			if (destination.placement.kind === 'section') {
				const command = destination.placement.sectionId === SessionInboxSection.OnHold ? HOLD_INBOX_SESSION_COMMAND_ID
					: RESUME_INBOX_SESSION_COMMAND_ID;
				await this.commandService.executeCommand(command, ordered);
			}
			return;
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
		const getKey = (session: SessionSortEntry) => this._sessionsListModelService.getSortKey(session, mode);

		// Neighbours come from every session that shares the anchor's sort order,
		// including collapsed sections, so the slot matches the rendered order.
		const draggedIds = new Set(sessions.map(session => session.sessionId));
		const remaining: SessionSortEntry[] = [
			...this.sessions.filter(session => !draggedIds.has(session.sessionId) && this.getReorderScope(session) === scope),
			...this._sessionGroupsService.getGroups()
				.filter(group => this.isComparisonGroup(group.id) && this.getComparisonReorderScope(group) === scope)
				.map(group => this.getComparisonSortEntry(group.id)),
		].sort((a, b) => getKey(b) - getKey(a));
		const anchorIndex = remaining.findIndex(session => session.sessionId === anchor.session.sessionId);
		if (anchorIndex === -1) {
			return undefined;
		}
		const insertIndex = anchor.position === 'before' ? anchorIndex : anchorIndex + 1;
		const above = remaining[insertIndex - 1];
		const below = remaining[insertIndex];
		let aboveKey = above && getKey(above);
		let belowKey = below && getKey(below);
		const now = Date.now();
		if (anchor.staysInSection) {
			// Hug the anchor when the far side of the gap belongs to another section.
			// An open boundary belongs to the first or last date section.
			const dateSections = this.getDateSections() ?? [];
			const anchorSection = dateSections.find(section => section.sessions.includes(anchor.session));
			const isInAnchorSection = (neighbour: SessionSortEntry | undefined, boundarySection: ISessionSection | undefined) =>
				neighbour ? !!anchorSection?.sessions.some(session => session.sessionId === neighbour.sessionId)
					|| this.comparisonSectionIds.get(getSessionGroupIdOfSection(neighbour.sessionId) ?? '') === anchorSection?.id : anchorSection === boundarySection;
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

	/** Nested chats are shown in their session's chat order, which the provider owns, only when sorting by creation. */
	private areChatPositionsShown(): boolean {
		return this.options.sorting() === SessionsSorting.Created;
	}

	/** The sibling chat row a nested chat swaps with when moved up or down, if any. */
	private getAdjacentChatRow(item: ISessionChatItem, direction: 'up' | 'down'): ISessionChatItem | undefined {
		// A chat whose move into the session is pending isn't in it yet.
		const rows = this.getChatRows(item.session).filter(row => !row.movingFrom);
		const index = rows.findIndex(row => isEqual(row.chat.resource, item.chat.resource));
		return index === -1 ? undefined : rows[direction === 'up' ? index - 1 : index + 1];
	}

	/**
	 * The move through its provider that puts a nested chat one row up or down, or `undefined` when there is no row
	 * there or its provider can't move the chat there. Only the provider orders nested chats.
	 */
	private getAdjacentChatMove(item: ISessionChatItem, direction: 'up' | 'down'): { readonly session: ISession; readonly chat: IChat; readonly drop: SessionsListChatDrop } | undefined {
		const positionsShown = this.areChatPositionsShown();
		const target = positionsShown ? this.getAdjacentChatRow(item, direction) : undefined;
		const movable = target && this.getMovableDraggedChat(item);
		const drop = target && movable && getSessionsListChatDrop(movable.session, movable.chat, { session: target.session, chat: target.chat, position: direction === 'up' ? 'before' : 'after' }, positionsShown, isCrossAgentChatMoveEnabled(this.configurationService));
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
		const defaultName = localize('newGroupName', "New Group");
		this.presentation.editName('newGroup', defaultName, () => {
			this.finishCreateGroup(groupSessions, defaultName, parentId, true);
			return true;
		}, name => {
			if (!this._store.isDisposed && (parentId === undefined || this.canHoldSubgroups(parentId))) {
				this.finishCreateGroup(groupSessions, name.trim() || defaultName, parentId, false);
			}
		});
	}

	private finishCreateGroup(groupSessions: ISession[], name: string, parentId: string | undefined, renameInline: boolean): void {
		this._sessionsListModelService.unpinSessions(groupSessions);
		if (parentId !== undefined) {
			// Show the new group's name editor inside its parent.
			this.saveSectionCollapseState(getSessionGroupSectionId(parentId), false);
			const parent = this.findTreeElement((element): element is ISessionGroupItem => isSessionGroupItem(element) && element.group.id === parentId);
			if (parent) {
				this.tree.expand(parent);
			}
		}
		const group = this._sessionGroupsService.createGroup(name, groupSessions.map(s => s.sessionId), parentId);
		if (renameInline) {
			this._editingGroupId = group.id;
		}
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
		const group = this._sessionGroupsService.getGroup(groupId);
		if (!group || this.isComparisonGroup(groupId)) {
			return;
		}
		this.presentation.editName('group', group.name, () => {
			this._editingGroupId = groupId;
			this.update();
			return true;
		}, name => {
			const trimmed = name.trim();
			if (trimmed && !this._store.isDisposed) {
				this._sessionGroupsService.renameGroup(groupId, trimmed);
				this.update();
			}
		});
	}

	private async beginOpenRequest(session: ISession, chat: IChat | undefined, preserveFocus: boolean, sideBySide: boolean, onOpened?: () => void): Promise<boolean> {
		const request: IListOpenRequest = { session, chat, preserveFocus, sideBySide, onOpened, started: false, invocation: 0 };
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
		const sessionRowRepresentsSession = getSessionListChats(session, undefined, false, this._hideSideChats.get()).length === 0 || this.collapsedSessionIds.get().has(session.sessionId);
		if (!request.chat && sessionRowRepresentsSession && this._mainWindowShown.get()?.session.sessionId !== session.sessionId) {
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
				if (opened) {
					this._onDidOpenSession.fire(request.chat?.resource ?? request.session.resource);
					request.onOpened?.();
				}
			}
		};

		let open: void | Promise<void>;
		try {
			if (request.chat) {
				open = this.options.onChatOpen
					? this.options.onChatOpen(request.session, request.chat, request.preserveFocus, request.sideBySide)
					: this._sessionsNavigationService.openChat(request.session, request.chat.resource, { preserveFocus: request.preserveFocus }).catch(onUnexpectedError);
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
		return this.presentation.editName('session', target.title.get(), () => {
			if (this.tree.getRelativeTop(target) === null) {
				this.tree.reveal(target, 0.5);
			}
			return this._sessionRenderer.beginRename(target);
		}, async title => {
			const trimmed = title.trim();
			if (trimmed && !this._store.isDisposed) {
				await this._sessionsManagementService.renameSession(target, trimmed);
			}
		});
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
		return this.presentation.editName('chat', target.chat.title.get(), () => {
			if (this.tree.getRelativeTop(target) === null) {
				this.tree.reveal(target, 0.5);
			}
			return this._chatRenderer.beginRename(target);
		}, async title => {
			const trimmed = title.trim();
			if (trimmed && !this._store.isDisposed) {
				await this._sessionsManagementService.renameChat(target.session, target.chat.resource, trimmed);
			}
		});
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

	private getComparisonSortEntry(groupId: string): SessionSortEntry {
		const comparison = this.sessionComparisonService.comparisons.get().find(comparison => comparison.groupId === groupId)!;
		const updatedAt = Math.max(comparison.createdAt, ...getComparisonSessions(comparison, this._sessionsManagementService).map(session => session.updatedAt.get().getTime()));
		return { sessionId: getSessionGroupSectionId(groupId), createdAt: new Date(comparison.createdAt), updatedAt: constObservable(new Date(updatedAt)) };
	}

	private getComparisonReorderScope(group: ISessionGroup): string | undefined {
		return group.parentId !== undefined ? getSessionGroupSectionId(group.parentId)
			: this.options.grouping() === SessionsGrouping.Date && !this.isComparisonInChatsSection(group.id) ? DATE_SECTION_IDS[0] : this.comparisonSectionIds.get(group.id);
	}

	/** Whether a comparison lists in the "Chats" section, such as one without a workspace under date grouping that keeps it, rather than in a date section. */
	private isComparisonInChatsSection(groupId: string): boolean {
		return this.comparisonSectionIds.get(groupId) === QUICK_CHATS_SECTION_ID;
	}

	private getListSortEntry(element: ISession | ISessionGroupItem): SessionSortEntry {
		return isSessionGroupItem(element) ? this.getComparisonSortEntry(element.group.id) : element;
	}

	private sortComparisonChildren(children: IObjectTreeElement<SessionListItem>[]): IObjectTreeElement<SessionListItem>[] {
		const inbox = this.options.grouping() === SessionsGrouping.Inbox;
		const key = (child: IObjectTreeElement<SessionListItem>) => isSessionItem(child.element) || (isSessionGroupItem(child.element) && child.element.comparison)
			? inbox ? (this.options.sorting() === SessionsSorting.Created ? this.getListSortEntry(child.element).createdAt : this.getListSortEntry(child.element).updatedAt.get()).getTime()
				: this._sessionsListModelService.getSortKey(this.getListSortEntry(child.element), sortingToMode(this.options.sorting()))
			: Number.NEGATIVE_INFINITY;
		const priority = (child: IObjectTreeElement<SessionListItem>) => !inbox ? InboxNotificationPriority.Later
			: isSessionItem(child.element) ? this.getInboxPriority(child.element)
				: isSessionGroupItem(child.element) ? Math.min(InboxNotificationPriority.Later, ...child.element.sessions.map(session => this.getInboxPriority(session)))
					: InboxNotificationPriority.Later;
		return children.sort((a, b) => priority(a) - priority(b) || key(b) - key(a));
	}

	private getComparisonDrop(group: ISessionGroupItem, target: SessionListItem, sector: ListViewTargetSector | undefined): SessionHeaderDrop | undefined {
		if (isSessionGroupItem(target) && !target.comparison) {
			return this.canNestGroup(group.group.id, target.group.id) ? { kind: 'into', groupId: target.group.id } : undefined;
		}
		const anchor = isSessionChatItem(target) ? target.session
			: isSessionItem(target) || (isSessionGroupItem(target) && target.comparison) ? target : undefined;
		if (anchor === group || (anchor && isSessionItem(anchor) && this._sessionGroupsService.getGroupOfSession(anchor.sessionId) === group.group.id)) {
			return undefined;
		}
		const parent = anchor ? this.tree.getParentElement(anchor) : target;
		if (!parent || (!isSessionSection(parent) && !isSessionGroupItem(parent) && !isSessionItem(parent))) {
			return undefined;
		}
		if (isSessionItem(parent)) {
			if (!anchor || !isSessionGroupItem(anchor) || !anchor.comparison || this.tree.getParentElement(group) !== parent) {
				return undefined;
			}
		} else if (isSessionGroupItem(parent)) {
			if (!this.canNestGroup(group.group.id, parent.group.id)) {
				return undefined;
			}
		} else if (parent.id !== this.comparisonSectionIds.get(group.group.id) && !(DATE_SECTION_IDS.includes(parent.id) && !this.isComparisonInChatsSection(group.group.id))) {
			return undefined;
		}
		const sectionParentId = isSessionSection(parent) ? this.getSectionParentId(parent.id) : undefined;
		const drop: Extract<SessionHeaderDrop, { kind: 'comparison' }> = {
			kind: 'comparison', parent, anchor,
			position: sector === ListViewTargetSector.TOP ? 'before' : 'after',
			depth: isSessionItem(parent) ? group.depth : isSessionGroupItem(parent) ? parent.depth + 1 : (sectionParentId ? this._sessionGroupsService.getTree().getPath(sectionParentId).length + 1 : 1),
		};
		return isSessionSection(parent) && DATE_SECTION_IDS.includes(parent.id)
			&& !this.canPlaceInDateSection([this.getComparisonSortEntry(group.group.id)], parent.id, this.computeComparisonReorder(group.group.id, drop))
			? undefined : drop;
	}

	private computeComparisonReorder(groupId: string, drop: Extract<SessionHeaderDrop, { kind: 'comparison' }>): { set: Map<string, number>; clear: string[] } {
		const mode = sortingToMode(this.options.sorting());
		const entry = this.getComparisonSortEntry(groupId);
		const parent = drop.parent;
		const siblings = isSessionItem(parent)
			? this.tree.getNode(parent).children.flatMap(node => node.element && isSessionGroupItem(node.element) && node.element.comparison && node.element.group.id !== groupId
				? [this.getComparisonSortEntry(node.element.group.id)] : [])
			: this._sessionGroupsService.getGroups().filter(group => group.id !== groupId && this.isComparisonGroup(group.id)
				&& (isSessionGroupItem(parent) ? group.parentId === parent.group.id : group.parentId === undefined && this.comparisonSectionIds.get(group.id) === parent.id))
				.map(group => this.getComparisonSortEntry(group.id));
		const getKey = (entry: SessionSortEntry) => this._sessionsListModelService.getSortKey(entry, mode);
		const remaining: SessionSortEntry[] = [
			...(isSessionItem(parent) ? [] : parent.sessions.filter(session => !this.isActiveComparisonSession(session))),
			...siblings,
		].sort((a, b) => getKey(b) - getKey(a));
		const anchorId = drop.anchor && this.getListSortEntry(drop.anchor).sessionId;
		const anchorIndex = remaining.findIndex(entry => entry.sessionId === anchorId);
		const index = anchorIndex === -1 ? (drop.position === 'before' ? 0 : remaining.length) : anchorIndex + (drop.position === 'after' ? 1 : 0);
		return computeReorderSortChanges({
			draggedIds: [entry.sessionId],
			naturalKeys: [this._sessionsListModelService.getNaturalSortKey(entry, mode)],
			aboveKey: index > 0 ? getKey(remaining[index - 1]) : undefined,
			belowKey: index < remaining.length ? getKey(remaining[index]) : undefined,
			now: Date.now(), fallbackStep: SORT_FALLBACK_STEP_MS,
		});
	}

	/**
	 * Where a dragged header lands. A group lands inside another group when it is
	 * dropped on the middle of that group's header, on the lower edge of its
	 * expanded header (which shows the group's rows below it), or on one of its
	 * rows. Otherwise a header lands before or after the hovered header, among
	 * that header's siblings. Groups only nest where {@link canNestGroup} allows.
	 */
	private getHeaderDrop(header: IDraggedHeader, target: SessionListItem, sector: ListViewTargetSector | undefined): SessionHeaderDrop | undefined {
		if (header.group?.comparison) {
			return this.getComparisonDrop(header.group, target, sector);
		}
		if (isSessionGroupItem(target) && target.comparison) {
			const parent = this.tree.getParentElement(target);
			return parent ? this.getHeaderDrop(header, parent, sector) : undefined;
		}
		if (this.isInMoreFolders(target)) {
			// Workspaces behind "+N more" are not in the reorderable order: a header dropped on
			// them or on the "+N more" row lands below the last always-visible header, above them.
			const lastId = this._topLevelOrder.findLast(id => id !== header.id);
			return lastId !== undefined && !(isSessionSection(target) && target.id === header.id)
				? { kind: 'topLevel', targetId: lastId, position: 'after', aboveMore: true }
				: undefined;
		}
		const groupTree = this._sessionGroupsService.getTree();
		const draggedId = header.group?.group.id;
		const canNestIn = (groupId: string) => draggedId !== undefined
			? this.canNestGroup(draggedId, groupId, groupTree)
			: this.canHoldSubgroups(groupId);

		if (isSessionGroupItem(target)) {
			if (target.group.id === draggedId) {
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
			// Date sections keep their fixed order, but headers can move between and around them.
			if (!(isSessionGroupingSection(target.id) || DATE_SECTION_IDS.includes(target.id)) || target.id === header.id) {
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

	/** Whether the element is the "+N more" row, a workspace it reveals, or a row inside one. */
	private isInMoreFolders(element: SessionListItem): boolean {
		if (isSessionShowMore(element) && element.sectionId === SHOW_MORE_FOLDERS_LABEL) {
			return true;
		}
		if (this._moreFolderSectionIds.size === 0 || !this.tree.hasElement(element)) {
			return false;
		}
		let topLevel = element;
		for (let parent = this.tree.getParentElement(element); parent; parent = this.tree.getParentElement(parent)) {
			topLevel = parent;
		}
		return isSessionSection(topLevel) && this._moreFolderSectionIds.has(topLevel.id);
	}

	/** The list index of the first row of the "+N more" area, or `undefined` when the list has none. */
	private getMoreFoldersDropIndex(): number | undefined {
		let index = 0;
		for (const child of this.tree.getNode().children) {
			if (child.element && this.isInMoreFolders(child.element)) {
				return index;
			}
			index += this.tree.getListRenderCount(child.element);
		}
		return undefined;
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
		if (groupId !== undefined && this.isComparisonGroup(groupId)) {
			if (drop.kind === 'into') {
				this.saveSectionCollapseState(getSessionGroupSectionId(drop.groupId), false);
				this._sessionGroupsService.moveGroup(groupId, drop.groupId);
			} else if (drop.kind === 'comparison') {
				const mode = sortingToMode(this.options.sorting());
				const changes = this.computeComparisonReorder(groupId, drop);
				this._sessionsListModelService.applySortChanges(mode, changes.set, changes.clear);
				if (!isSessionItem(drop.parent)) {
					this._sessionGroupsService.moveGroup(groupId, isSessionGroupItem(drop.parent) ? drop.parent.group.id : undefined);
				}
			}
			return;
		}
		if (drop.kind === 'comparison') {
			return;
		}
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
	 * Whether a group can be nested in `parentId`. Comparisons cannot hold
	 * subgroups, and a group never nests in itself or its own subgroups.
	 */
	private canNestGroup(groupId: string, parentId: string, groupTree = this._sessionGroupsService.getTree()): boolean {
		return this.canHoldSubgroups(parentId) && groupTree.canMove(groupId, parentId);
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
					collectSessionIds(node.children ?? [], ids);
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
				const ownComparison = node.element && isSessionGroupItem(node.element) && node.element.comparison;
				rows.push(...toSessionNodes(sessions.filter(session => !shown.has(session.sessionId) && !this.tree.hasElement(session)
					&& (ownComparison || !this.attachedComparisonSessionIds.has(session.sessionId))), true));
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
					? this.hiddenGroupingSections.map(section => ({ type: 'section', id: section.id, label: section.label, collapsed: true, hidden: true, children: toSessionNodes(section.sessions.filter(session => !this.attachedComparisonSessionIds.has(session.sessionId)), true) }))
					: [];
			}
			if (isSessionItem(element)) {
				const children = visit(node.children);
				return [{ type: 'session', session: element, ...(children.length > 0 ? { children } : {}) }];
			}
			return [];
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
		} else if (!isSessionGroupingSection(headerId) || this.options.grouping() === SessionsGrouping.Date) {
			throw new Error(`"${headerId}" cannot move: only custom groups and workspace, repository, or environment sections of the current grouping move.`);
		}
		if (sibling?.siblingId === headerId) {
			throw new Error(`"${headerId}" cannot be positioned relative to itself.`);
		}
		if (groupId !== undefined && this.isComparisonGroup(groupId) && sibling) {
			const groupItem = this.findTreeElement((element): element is ISessionGroupItem => isSessionGroupItem(element) && element.group.id === groupId);
			const target = this.findTreeElement((element): element is ISessionGroupItem => isSessionGroupItem(element) && getSessionGroupSectionId(element.group.id) === sibling.siblingId);
			const targetParent = target && this.tree.getParentElement(target);
			const targetParentId = targetParent && isSessionGroupItem(targetParent) ? getSessionGroupSectionId(targetParent.group.id) : undefined;
			const drop = groupItem && target && targetParentId === parentId
				? this.getComparisonDrop(groupItem, target, sibling.position === 'before' ? ListViewTargetSector.TOP : ListViewTargetSector.BOTTOM)
				: undefined;
			if (!drop) {
				throw new Error(`Comparison "${headerId}" can only be ordered next to comparisons in its destination.`);
			}
			this.applyHeaderDrop(headerId, groupId, drop);
			return;
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
		// The date sections stay ordered while empty or in another grouping mode.
		const ids = new Set<string>(DATE_SECTION_IDS);
		for (const group of this._sessionGroupsService.getTree().getSubgroups(undefined)) {
			ids.add(getSessionGroupSectionId(group.id));
		}
		// A scoped list keeps the saved order of every section other than a group's, as the order is shared with the Agents
		// window and the sessions of other sections are outside its listing scope; an unscoped list prunes them
		if (this.options.scoped?.get()) {
			for (const id of this._sessionSectionOrderService.capturePositions([]).order) {
				if (getSessionGroupIdOfSection(id) === undefined) {
					ids.add(id);
				}
			}
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

	private showsCanvasesSection(): boolean {
		return this.configurationService.getValue<boolean>(SESSIONS_LIST_CANVASES_SECTION_SETTING) === true;
	}

	/** The pinned canvas rows, each a section of its own. Hidden while chat is disabled; the service hides them while canvases are disabled. */
	private getPinnedCanvasSections(): ISessionSection[] {
		const pinnedCanvases = this.options.pinnedCanvases;
		if (!pinnedCanvases || this.contextKeyService.getContextKeyValue<boolean>(ChatContextKeys.enabled.key) !== true) {
			return [];
		}
		return pinnedCanvases.entries.get().map(entry => ({
			id: `${PINNED_CANVAS_SECTION_PREFIX}${entry.id}`,
			label: entry.title.get(),
			sessions: [],
			pinnedCanvas: entry,
		}));
	}

	/**
	 * The Canvases section, which lists the canvases pinned to the sidebar and offers to start a session with a new canvas.
	 * It shows while its setting, chat and canvases are enabled.
	 */
	private getCanvasesSection(): ISessionSection | undefined {
		if (!this.showsCanvasesSection() || !this.options.pinnedCanvases?.enabled.get() || this.contextKeyService.getContextKeyValue<boolean>(ChatContextKeys.enabled.key) !== true) {
			return undefined;
		}
		return { id: CANVASES_SECTION_ID, label: localize('canvases', "Canvases"), sessions: [] };
	}

	/** The Canvases section in the sessions tree, which collapses and shows a placeholder while nothing is pinned. */
	private renderCanvasesSection(element: ISessionSection, resolveCollapsed: (element: SessionListItem, collapsed: boolean | ObjectTreeElementCollapseState) => boolean | ObjectTreeElementCollapseState): IObjectTreeElement<SessionListItem> {
		const pins: IObjectTreeElement<SessionListItem>[] = this.getPinnedCanvasSections().map(element => ({ element }));
		return {
			element,
			collapsible: true,
			collapsed: resolveCollapsed(element, this.getSavedCollapseState(element.id) ? ObjectTreeElementCollapseState.PreserveOrCollapsed : ObjectTreeElementCollapseState.PreserveOrExpanded),
			children: pins.length > 0 ? pins : [{ element: { placeholder: true as const, sectionId: CANVASES_SECTION_ID, label: localize('noCanvases', "No canvases") } }],
		};
	}

	private showPinnedCanvasContextMenu(entry: IPinnedCanvas, anchor: ITreeContextMenuEvent<SessionListItem>['anchor']): void {
		this.contextMenuService.showContextMenu({
			menuId: Menus.SidebarCanvasContext,
			menuActionOptions: { arg: entry.id, shouldForwardArgs: true },
			contextKeyService: this.contextKeyService.createOverlay([[PinnedCanvasConnectedContext.key, entry.canvas.get() !== undefined]]),
			getAnchor: () => anchor,
		});
	}

	private showAutomationsContextMenu(anchor: ITreeContextMenuEvent<SessionListItem>['anchor']): void {
		this.contextMenuService.showContextMenu({
			menuId: Menus.AutomationsContext,
			contextKeyService: this.contextKeyService,
			getAnchor: () => anchor,
		});
	}

	private getMultiSelectedSessions(session: ISession, reader?: IReader): ISession[] {
		const selection = this.selectedSessions.read(reader);
		return selection.includes(session) ? [session, ...selection.filter(s => s !== session)] : [session];
	}

	private showPendingSessionContextMenu(item: IPendingSessionItem, anchor: ITreeContextMenuEvent<SessionListItem>['anchor']): void {
		const selection = this.tree.getSelection();
		const multiple = selection.includes(item) && selection.length > 1;
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => getPendingSessionActions(item, multiple),
			onHide: () => this.tree.domFocus(),
		});
	}

	/** Whether {@link onContextMenu} shows a menu of `element`'s own. */
	private hasItemContextMenu(element: SessionListItem): boolean {
		if (isSessionShowMore(element) || isSessionPlaceholder(element)) {
			return false;
		}
		if (isSessionSection(element)) {
			return element.id === AUTOMATIONS_SECTION_ID || !!element.pinnedCanvas || !(isShortcutSection(element.id) || element.pendingItems);
		}
		return true;
	}

	private onContextMenu(e: ITreeContextMenuEvent<SessionListItem | null>): void {
		const element = e.element;
		// The menu of an item is the list's own: a host that shows its own context menu, such as the view the list is in, does not
		// show it over the item's. Empty space and rows without a menu leave it to the host.
		if (element && this.hasItemContextMenu(element)) {
			DOM.EventHelper.stop(e.browserEvent, true);
		}
		if (element && isPendingSessionItem(element)) {
			this.showPendingSessionContextMenu(element, e.anchor);
			return;
		}
		if (element && isSessionChatItem(element)) {
			if (!element.movingFrom) {
				this.showChatContextMenu(element, e.anchor);
			}
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
			if (element.pinnedCanvas) {
				this.showPinnedCanvasContextMenu(element.pinnedCanvas, e.anchor);
				return;
			}
			if (isShortcutSection(element.id) || element.pendingItems) {
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
		const inboxStates = selectedSessions.map(session => this.getInboxStateContext(session));

		const inGroup = this._sessionGroupsService.getGroupOfSession(element.sessionId) !== undefined;
		const contextOverlay: [string, boolean | string][] = [
			[SessionItemInboxStateContext.key, inboxStates.every(state => state === inboxStates[0]) ? inboxStates[0] ?? '' : 'mixed'],
			[SessionItemCanAcknowledgeContext.key, selectedSessions.some(session => this.canAcknowledgeInboxSession(session))],
			[SessionItemCanMergePullRequestContext.key, this.canMergeInboxPullRequest(element)],
			[IsSessionPinnedContext.key, this.isSessionPinned(element)],
			[SessionItemIsMultiSelectionContext.key, selectedSessions.length > 1],
			[SessionItemHasMoveDestinationContext.key, getSessionMoveDestinations(element, this._sessionsManagementService.getSessions(), this._sessionsManagementService, isCrossAgentChatMoveEnabled(this.configurationService)).length > 0],
			[SessionItemHasUnreadNestedSessionsContext.key, selectedSessions.some(session =>
				!session.isArchived.get()
				&& session.capabilities.get().supportsIndependentChatReadState === true
				&& getSessionListChats(session, undefined, false, this._hideSideChats.get()).some(chat => !chat.isRead.get()))],
			[SessionIsArchivedContext.key, element.isArchived.get()],
			[SessionIsReadContext.key, element.mainChat.get().isRead.get()],
			[SessionItemInGroupContext.key, inGroup],
			[SessionItemInExternalSectionContext.key, this.isRenderedInExternalSection(element)],
			[SessionItemCanImportContext.key, element.isExternal?.get() === true && element.capabilities.get().supportsImport === true],
			[SessionItemIsAutomationContext.key, isAutomationSession(element)],
			[SessionItemIsInSessionsListContext.key, this.isSessionListed(element)],
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
		const contextKeyService = this.contextKeyService.createOverlay(contextOverlay);
		const menu = disposables.add(this.menuService.createMenu(SessionItemContextMenuId, contextKeyService));

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

		const menuGroups = menu.getActions({ arg: selectedSessions, shouldForwardArgs: true }).map(([group, actions]): [string, IAction[]] => [group, actions.map(wrapAction)]);
		// Group membership actions depend on the list's groups, so they are built here and merged into the contributed Organize group.
		const actions = joinContextMenuGroups([...menuGroups, [SessionItemOrganizeMenuGroup, this.options.grouping() === SessionsGrouping.Inbox ? [] : this.getGroupSessionActions(selectedSessions)]]);
		if (actions.length === 0) {
			this._sessionContextMenuDisposables.clear();
			return;
		}

		const keyboardPosition = this.isInboxLayout() ? this.captureKeyboardPosition(element) : undefined;
		this.contextMenuService.showContextMenu({
			getActions: () => actions,
			getAnchor: () => e.anchor,
			getActionsContext: this.isInboxLayout() ? () => element : undefined,
			actionRunner: this.isInboxLayout() ? disposables.add(new SessionItemActionRunner(() => selectedSessions, async action => {
				await action.run();
				if (action.id === ACKNOWLEDGE_INBOX_SESSION_COMMAND_ID) {
					this.restoreAcknowledgementPosition(keyboardPosition, selectedSessions);
				}
				return true;
			})) : undefined,
			getKeyBinding: action => this.options.grouping() === SessionsGrouping.Inbox
				? this.keybindingService.lookupKeybinding(action.id, contextKeyService, true) ?? undefined
				: this.keybindingService.lookupKeybinding(action.id) ?? undefined,
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
			[SessionChatItemHasMoveDestinationContext.key, getChatMoveDestinations(element.session, element.chat, this._sessionsManagementService.getSessions(), this._sessionsManagementService, isCrossAgentChatMoveEnabled(this.configurationService)).length > 0],
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
	 * Build the group membership context menu actions for the given session(s):
	 * an "Add to Group"/"Move to Group" submenu listing the other groups in
	 * display order, named by their path, "Create Group", and "Remove from
	 * Group" when applicable.
	 */
	private getGroupSessionActions(selected: ISession[]): IAction[] {
		const actions: IAction[] = [];
		if (selected.some(session => session.isArchived.get() || this.isActiveComparisonSession(session))) {
			return actions;
		}

		const currentGroupIds = new Set(selected.map(s => this._sessionGroupsService.getGroupOfSession(s.sessionId)));
		const currentGroupId = currentGroupIds.size === 1 ? [...currentGroupIds][0] : undefined;

		const groupTree = this._sessionGroupsService.getTree();
		const targetGroups = this.getGroupsInDisplayOrder().filter(g => g.id !== currentGroupId);
		if (targetGroups.length > 0) {
			const subActions = targetGroups.map(g => toAction({
				id: `sessions.addToGroup.${g.id}`,
				label: getSessionGroupPathLabel(groupTree.getPath(g.id)),
				run: () => this.addSessionsToGroup(selected, g.id),
			}));
			const label = currentGroupId !== undefined ? localize('moveToGroupAction', "Move to Group") : localize('addToGroupAction', "Add to Group");
			actions.push(new SubmenuAction('sessions.addToGroupSubmenu', label, subActions));
		}

		actions.push(this.getCreateGroupAction(selected));

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
		return comparison !== undefined && !comparison.sessionResource && comparison.archivedAt === undefined;
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
		if (this.isInboxLayout()) {
			return;
		}
		this.contextMenuService.showContextMenu({
			getActions: () => [this.getCreateGroupAction()],
			getAnchor: () => anchor,
		});
	}

	/** The IDs of the sessions the providers list in the host's scope, or `undefined` while the list is not scoped. See {@link ISessionsListControlOptions.scoped}. */
	private getHostScope(): ReadonlySet<string> | undefined {
		if (!this.options.scoped?.get()) {
			return undefined;
		}
		return new Set(this.sessions.map(session => session.sessionId));
	}

	private getMarkAllSessionsReadAction(getSessions: () => readonly ISession[]): IAction {
		return toAction({
			id: 'sessionsViewPane.markAllInSectionRead',
			label: localize('markAllInSectionRead', "Mark All as Read"),
			run: () => {
				const sessions = getSessions().filter(session => this.isSessionListed(session) && !session.isArchived.get() && !session.isRead.get());
				return this._sessionsManagementService.markAllRead(sessions);
			},
		});
	}

	private showSectionContextMenu(section: ISessionSection, anchor: ITreeContextMenuEvent<SessionListItem>['anchor']): void {
		const contextKeyService = this.contextKeyService.createOverlay([
			[SessionSectionTypeContext.key, getSessionSectionType(section.id)],
			[SessionSectionHasNonCloudRepositoryContext.key, section.sessions.some(session => session.workspace.get()?.folders.some(folder => folder.root.scheme !== GITHUB_REMOTE_FILE_SCHEME) ?? false)],
		]);
		const groups: [string, readonly IAction[]][] = [];
		const organize: IAction[] = [];
		const grouping = this.options.grouping();
		if (grouping === SessionsGrouping.Date && DATE_SECTION_IDS.includes(section.id)) {
			groups.push(['1_state', [this.getMarkAllSessionsReadAction(() => section.sessions)]]);
		}
		if (grouping !== SessionsGrouping.Date && isSessionGroupingSection(section.id)) {
			groups.push(['1_state', [this.getMarkAllSessionsReadAction(() => this.sessions.filter(session => getSessionGroupingSectionId(session, grouping) === section.id))]]);
			const parentId = this.getSectionParentId(section.id);
			const groupsInDisplayOrder = this.getGroupsInDisplayOrder().filter(group => this.canHoldSubgroups(group.id));
			if (groupsInDisplayOrder.length > 0) {
				organize.push(new SubmenuAction('sessions.moveSectionToGroup', localize('moveSectionToGroup', "Move to Group"), groupsInDisplayOrder.map(group => toAction({
					id: `sessions.moveSectionToGroup.${group.id}`,
					label: getSessionGroupPathLabel(this._sessionGroupsService.getTree().getPath(group.id)),
					checked: group.id === parentId,
					enabled: group.id !== parentId,
					run: () => this.moveSectionToGroup(section, group.id),
				}))));
			}
			if (parentId !== undefined) {
				organize.push(toAction({
					id: 'sessions.removeSectionFromGroup',
					label: localize('removeSectionFromGroup', "Remove from Group"),
					run: () => this.moveSectionToGroup(section, undefined),
				}));
			}
			groups.push(['4_manage', this.getGroupAppearanceActions(
				this._sessionGroupsService.getSectionAppearance(section.id),
				icon => this._sessionGroupsService.setSectionIcon(section.id, icon),
				color => this._sessionGroupsService.setSectionColor(section.id, color),
			)]);
		}
		if (grouping !== SessionsGrouping.Inbox) {
			organize.push(this.getCreateGroupAction());
		}
		groups.push(['2_organize', organize]);
		this.showHeaderContextMenu(Menus.SessionSectionContext, contextKeyService, section, groups, anchor);
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
		const comparison = groupItem.comparison;
		const contextKeyService = this.contextKeyService.createOverlay([
			[SessionGroupHasVisibleSessionsContext.key, groupItem.subtreeSessions.length > 0 && comparison?.launching !== true],
			[SessionGroupIsEmptyContext.key, groupItem.isEmpty],
			[SessionGroupIsComparisonContext.key, !!comparison],
		]);
		const groups: [string, readonly IAction[]][] = [];
		if (!groupItem.isEmpty) {
			groups.push(['1_state', [this.getMarkAllSessionsReadAction(() => {
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
			})]]);
		}
		if (this.canHoldSubgroups(groupItem.group.id)) {
			groups.push(['2_organize', [this.getCreateSubgroupAction(groupItem)]]);
		}
		if (comparison) {
			const move = (parentId: string | undefined) => {
				this.moveHeaderTo(getSessionGroupSectionId(groupItem.group.id), parentId === undefined ? undefined : getSessionGroupSectionId(parentId), undefined);
				aria.status(parentId === undefined
					? localize('comparisonRemovedFromGroup', "Removed {0} from its group", comparison.title)
					: localize('comparisonMovedToGroup', "Moved {0} to {1}", comparison.title, this._sessionGroupsService.getGroup(parentId)!.name));
			};
			const targets = this.getGroupsInDisplayOrder().filter(group => group.id !== groupItem.group.parentId && this.canNestGroup(groupItem.group.id, group.id));
			const organize: IAction[] = [];
			if (targets.length > 0) {
				organize.push(new SubmenuAction('sessions.moveComparisonToGroup', localize('moveToGroupAction', "Move to Group"), targets.map(group => toAction({
					id: `sessions.moveComparisonToGroup.${group.id}`,
					label: group.name,
					run: () => move(group.id),
				}))));
			}
			if (groupItem.group.parentId !== undefined) {
				organize.push(toAction({
					id: 'sessions.removeComparisonFromGroup',
					label: localize('removeFromGroupAction', "Remove from Group"),
					run: () => move(undefined),
				}));
			}
			groups.push(['2_organize', organize]);
		}
		if (!comparison) {
			groups.push(['4_manage', [
				...this.getGroupAppearanceActions(
					groupItem.group,
					icon => this._sessionGroupsService.setGroupIcon(groupItem.group.id, icon),
					color => this._sessionGroupsService.setGroupColor(groupItem.group.id, color),
				),
				toAction({
					id: 'sessions.renameGroupAction',
					label: localize('renameGroupAction', "Rename..."),
					run: () => this.beginRenameGroup(groupItem.group.id),
				}),
				this.getDeleteGroupAction(groupItem),
			]]);
		} else {
			if (this.sessionComparisonService.canRetryJudge(comparison.id)) {
				groups.push(['navigation', [toAction({
					id: 'sessions.retryComparisonJudge',
					label: localize('retryComparisonJudge', "Retry Judge"),
					run: () => this.sessionComparisonService.retryJudge(comparison.id),
				})]]);
			}
			const comparisonRecord = this.sessionComparisonService.getComparison(comparison.id);
			const comparisonSessions = comparisonRecord ? getComparisonSessions(comparisonRecord, this._sessionsManagementService) : [];
			// Deleting while attempts are still launching would retire the comparison under its in-flight launches.
			if (comparisonRecord?.launching !== true && !comparisonSessions.some(session => isSessionActive(session, undefined))) {
				groups.push(['4_manage', [this.getDeleteGroupAction(groupItem)]]);
			}
		}
		this.showHeaderContextMenu(Menus.SessionGroupContext, contextKeyService, groupItem, groups, anchor);
	}

	/** Shows a header's contributed context menu with the list's own header actions merged into its groups. */
	private showHeaderContextMenu(menuId: MenuId, contextKeyService: IContextKeyService, arg: ISessionSection | ISessionGroupItem, groups: readonly (readonly [string, readonly IAction[]])[], anchor: ITreeContextMenuEvent<SessionListItem>['anchor']): void {
		const disposables = new DisposableStore();
		this._sessionContextMenuDisposables.value = disposables;
		const menu = disposables.add(this.menuService.createMenu(menuId, contextKeyService));
		const actions = joinContextMenuGroups([...groups, ...menu.getActions({ arg, shouldForwardArgs: true })]);
		if (actions.length === 0) {
			this._sessionContextMenuDisposables.clear();
			return;
		}
		this.contextMenuService.showContextMenu({
			getActions: () => actions,
			getAnchor: () => anchor,
			getKeyBinding: action => this.keybindingService.lookupKeybinding(action.id) ?? undefined,
			onHide: () => {
				if (this._sessionContextMenuDisposables.value === disposables) {
					this._sessionContextMenuDisposables.clear();
				} else {
					disposables.dispose();
				}
			},
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
		this.revealOpenChatRow(session);
	}

	unpinSession(session: ISession): void {
		this._sessionsListModelService.unpinSession(session);
		this.revealOpenChatRow(session);
	}

	isSessionPinned(session: ISession): boolean {
		return this._sessionsListModelService.isSessionPinned(session);
	}

	/** Whether the list includes the session before its source filters apply. */
	isSessionListed(session: ISession, reader?: IReader): boolean {
		return this._sessionsListModelService.isSessionListed(session, reader);
	}

	getRenderedSessionGroup(session: ISession): ISessionGroup | undefined {
		if (session.isArchived.get() || this.isSessionPinned(session)) {
			return undefined;
		}
		const groupId = this._sessionGroupsService.getGroupOfSession(session.sessionId);
		if (this.options.grouping() === SessionsGrouping.Inbox && (groupId === undefined || !this.isComparisonGroup(groupId))) {
			return undefined;
		}
		return groupId === undefined ? undefined : this._sessionGroupsService.getGroup(groupId);
	}

	private getInboxSection(session: ISession, reader?: IReader): SessionInboxSection {
		const placement = reader ? undefined : this.inboxPlacements?.get(session.sessionId);
		return placement?.section ?? getSessionInboxSection(session, this._sessionsListModelService.getInboxState(session, reader), reader, this.sessionAttentionService.sessionAttention.read(reader).get(session.sessionId));
	}

	private canAcknowledgeInboxSession(session: ISession, reader?: IReader): boolean {
		return this.isInboxLayout() && !session.isArchived.read(reader) && this.getInboxStateContext(session, reader) !== 'done';
	}

	private getVisibleInboxSessions(): ISession[] {
		return this.getVisibleSessions().filter(session => {
			for (let parent = this.tree.getParentElement(session); parent; parent = this.tree.getParentElement(parent)) {
				if (isSessionSection(parent)) {
					return parent.id === SessionInboxSection.ReadyForYou;
				}
			}
			return false;
		});
	}

	private advanceInboxAfterReplyOrApproval(resource: URI): void {
		if (!this.isInboxAutoAdvanceEnabled() || !this.visible || !this.isInboxLayout() || !isEqual(this._mainWindowShown.get()?.chat.resource, resource)) {
			return;
		}
		// Use the rendered placement: acceptance may already have changed the session's status to Working.
		const inboxSessions = this.getVisibleInboxSessions();
		const index = inboxSessions.findIndex(session => isEqual(session.resource, this._mainWindowShown.get()?.session.resource));
		if (index < 0) {
			return;
		}
		const candidates = [...inboxSessions.slice(index + 1), ...inboxSessions.slice(0, index).reverse()];
		// Let the submitting widget finish accepting its input before moving focus to another conversation.
		this.pendingInboxAdvance.value = DOM.scheduleAtNextAnimationFrame(DOM.getWindow(this.listContainer), () => {
			this.pendingInboxAdvance.clear();
			if (!this.isInboxAutoAdvanceEnabled() || !this.visible || !this.isInboxLayout() || this.pendingOpenRequest || !isEqual(this._mainWindowShown.get()?.chat.resource, resource)) {
				return;
			}
			if (this.configurationService.getValue<string>(SESSIONS_LIST_INBOX_AUTO_ADVANCE_SETTING) === 'newSession') {
				void this.commandService.executeCommand(NEW_SESSION_ACTION_ID).catch(onUnexpectedError);
				return;
			}
			this.update();
			const visible = new Set(this.getVisibleSessions());
			const next = candidates.find(session => visible.has(session) && this.canAcknowledgeInboxSession(session) && this.getInboxSection(session) === SessionInboxSection.ReadyForYou);
			if (next) {
				void this.beginOpenRequest(next, undefined, false, false, () => {
					if (!this._store.isDisposed && this.visible && this.isInboxLayout() && isEqual(this._mainWindowShown.get()?.session.resource, next.resource)) {
						void this.explainInboxAutoAdvance(inboxSessions[index], true);
					}
				}).catch(onUnexpectedError);
			} else {
				const inbox = this.findTreeElement((element): element is ISessionSection => isSessionSection(element) && element.id === SessionInboxSection.ReadyForYou);
				if (inbox) {
					this.tree.setSelection([]);
					this.tree.setFocus([inbox]);
					this.tree.reveal(inbox);
					this.tree.domFocus();
					void this.explainInboxAutoAdvance(inboxSessions[index], false);
				}
			}
		});
	}

	private observeInboxApprovals(chatService: IChatService): void {
		this._register(autorun(reader => {
			const resource = this._mainWindowShown.read(reader)?.chat.resource;
			const model = Array.from(chatService.chatModels.read(reader)).find(model => isEqual(model.sessionResource, resource));
			if (!model) {
				return;
			}
			const requestChanges = observableSignalFromEvent(this, model.onDidChange);
			const responseChanges = new WeakMap<IChatResponseModel, IObservable<void>>();
			let pending = new Map<IChatToolInvocation, IChatToolInvocation.StateKind.WaitingForConfirmation | IChatToolInvocation.StateKind.WaitingForPostApproval>();
			reader.store.add(autorun(reader => {
				requestChanges.read(reader);
				for (const [tool, waiting] of pending) {
					const state = tool.state.read(reader);
					if (state.type === waiting) {
						continue;
					}
					const confirmed = waiting === IChatToolInvocation.StateKind.WaitingForPostApproval
						? state.type === IChatToolInvocation.StateKind.Completed ? state.postConfirmed : undefined
						: IChatToolInvocation.executionConfirmedOrDenied(tool, reader);
					if (confirmed?.type === ToolConfirmKind.UserAction && confirmed.selectedButtonKind !== 'deny') {
						this.advanceInboxAfterReplyOrApproval(model.sessionResource);
					}
				}
				const nextPending = new Map<IChatToolInvocation, IChatToolInvocation.StateKind.WaitingForConfirmation | IChatToolInvocation.StateKind.WaitingForPostApproval>();
				for (const request of model.getRequests()) {
					const response = request.response;
					if (!response || response.isCanceled || request.isHiddenFromTranscript || (request.shouldBeRemovedOnSend && !request.shouldBeRemovedOnSend.afterUndoStop)) {
						continue;
					}
					let changed = responseChanges.get(response);
					if (!changed) {
						changed = observableSignalFromEvent(this, response.onDidChange);
						responseChanges.set(response, changed);
					}
					changed.read(reader);
					for (const tool of response.pendingToolInvocations.read(reader)) {
						const state = tool.state.read(reader);
						if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation || state.type === IChatToolInvocation.StateKind.WaitingForPostApproval) {
							nextPending.set(tool, state.type);
						}
					}
				}
				pending = nextPending;
			}));
		}));
	}

	private isInboxAutoAdvanceEnabled(): boolean {
		const mode = this.configurationService.getValue<'auto' | 'on' | 'off' | 'newSession'>(SESSIONS_LIST_INBOX_AUTO_ADVANCE_SETTING) ?? 'auto';
		return mode === 'newSession' || mode === 'on' || mode === 'auto' && !this.accessibilityService.isScreenReaderOptimized();
	}

	private async explainInboxAutoAdvance(session: ISession, hasNext: boolean): Promise<void> {
		if (!this.visible || !this.isInboxLayout() || this.inboxAutoAdvanceSpotlight.value
			|| this.chatEntitlementService.sentiment.hidden
			|| this.configurationService.getValue<boolean>(ONBOARDING_ENABLED_CONFIG) === false
			|| this.storageService.getBoolean(SessionsList.INBOX_AUTO_ADVANCE_EXPLAINED_KEY, StorageScope.PROFILE, false)) {
			return;
		}
		const spotlight = this.instantiationService.createInstance(InboxAutoAdvanceSpotlight,
			() => this.revealSessionForOnboarding(session),
			() => this.openSession(session),
			hasNext,
			() => this.storageService.store(SessionsList.INBOX_AUTO_ADVANCE_EXPLAINED_KEY, true, StorageScope.PROFILE, StorageTarget.USER),
		);
		this.inboxAutoAdvanceSpotlight.value = spotlight;
		try {
			await spotlight.show();
		} catch (error) {
			this.logService.error(error);
			this.notificationService.error(error);
		} finally {
			if (this.inboxAutoAdvanceSpotlight.value === spotlight) {
				this.inboxAutoAdvanceSpotlight.clear();
			}
		}
	}

	private getInboxStateContext(session: ISession, reader?: IReader): string {
		if (!this.isInboxLayout()) {
			return '';
		}
		const state = this._sessionsListModelService.getInboxState(session, reader);
		return state?.kind === 'done' && state.isHistoricalCompletion ? 'historical' : state?.kind ?? '';
	}

	private canMergeInboxPullRequest(session: ISession, reader?: IReader): boolean {
		const attention = this.sessionAttentionService.sessionAttention.read(reader).get(session.sessionId);
		return this.isInboxLayout() && !session.isArchived.read(reader)
			&& attention?.tab === InboxTab.ReadyToMerge
			&& getSessionInboxSection(session, this._sessionsListModelService.getInboxState(session, reader), reader, attention) === SessionInboxSection.ReadyForYou
			&& getInboxPullRequestMergeOperation(session, reader) !== undefined;
	}

	private getInboxDescription(session: ISession, reader?: IReader): string | undefined {
		return this.isInboxLayout() && !session.isArchived.read(reader)
			? getSessionInboxDescription(this._sessionsListModelService.getInboxState(session, reader))
			: undefined;
	}

	private getInboxPriority(session: ISession): InboxNotificationPriority {
		return this.inboxPlacements?.get(session.sessionId)?.priority
			?? getSessionInboxPriority(session, this.sessionAttentionService.sessionAttention.get().get(session.sessionId));
	}

	isRenderedInCustomGroup(session: ISession): boolean {
		return this.getRenderedSessionGroup(session) !== undefined;
	}

	/** How the row of `element` steps in below its header, which decides the indent guides it draws. */
	private getRowIndent(element: SessionListItem): ISessionRowIndent {
		if (isPendingSessionItem(element)) {
			// Pending rows only render in the top-level Drafts section.
			return { depth: 0, indent: SessionRowIndent.Item };
		}
		if (isSessionGroupItem(element)) {
			return { depth: element.depth, indent: element.comparison !== undefined ? SessionRowIndent.Comparison : SessionRowIndent.Header };
		}
		if (isSessionSection(element)) {
			return { depth: this.getRowGroupDepth(element), indent: SessionRowIndent.Header };
		}
		if (isSessionShowMore(element)) {
			// The show more folders row lists sections, so it lines up with their headers.
			return { depth: this.getRowGroupDepth(element), indent: element.kind === 'sessions' ? SessionRowIndent.Item : SessionRowIndent.Header };
		}
		if (isSessionPlaceholder(element)) {
			return { depth: this.getRowGroupDepth(element), indent: SessionRowIndent.Item };
		}
		// A comparison's attempts and their nested chats step in with the comparison.
		const session = isSessionChatItem(element) ? element.standalone ? undefined : element.session : element;
		const isComparison = session !== undefined && this.renderedComparisonParticipantConnectorPositions.has(session.sessionId);
		return { depth: this.getRowGroupDepth(element), indent: isComparison ? SessionRowIndent.Comparison : SessionRowIndent.Item };
	}

	/**
	 * How many groups deep the custom group whose rows include the row is nested:
	 * rows step in by one level per group. Rows outside custom groups, such as a
	 * done chat listed in the Done section, don't step in.
	 */
	private getRowGroupDepth(element: ISession | ISessionChatItem | ISessionShowMore | ISessionPlaceholder | ISessionSection): number {
		// A pinned canvas steps in under the Canvases header, as a subgroup does under its group.
		if (isSessionSection(element) && element.pinnedCanvas && this.showsCanvasesSection()) {
			return 1;
		}
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

	private getComparisonAttemptLabel(session: ISession, chat?: IChat): string | undefined {
		return this.renderedComparisonAttemptLabels.get((chat ?? session.mainChat.get()).resource.toString())
			?? (chat ? undefined : this.renderedComparisonAttemptLabels.get(session.sessionId));
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
				return participant.chatResource
					? getSessionComparisonChat(participant, attemptSession, reader)?.status.read(reader)
					: attemptSession?.status.read(reader);
			});
		return statuses.includes(SessionStatus.Error) || new Set(statuses).size > 1;
	}

	private get groupExternalSessions(): boolean {
		return this.configurationService.getValue<boolean>(SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING) === true;
	}

	/** Whether grouping by time lists quick chats in the "Chats" section, while the list has one ({@link hasQuickChatsSection}). */
	private get quickChatsInTimeGrouping(): boolean {
		return !!this.options.quickChatsInTimeGrouping && this.hasQuickChatsSection;
	}

	/**
	 * Whether the list has a "Chats" section, under the groupings that show one: not while it is scoped, as in a window with
	 * folders, which lists no quick chat and starts none.
	 */
	private get hasQuickChatsSection(): boolean {
		return !this.options.scoped?.get();
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
		return this._sessionsProvidersService.getProvider(session.providerId, session.sessionId)?.environment.label;
	}

	/**
	 * The New Session dropdown's entries for a repository section with sessions in
	 * several available environments: one per environment, starting in the workspace
	 * of its most recently created session there.
	 */
	private getNewSessionEnvironmentActions(section: ISessionSection): readonly IAction[] {
		const sources = section.repository ? getNewSessionSources(section.sessions, this._sessionsProvidersService, this._sessionsManagementService) : [];
		if (sources.length < 2) {
			return [];
		}
		return sources.map(({ environment }) => toAction({
			id: `${NEW_SESSION_IN_ENVIRONMENT_ACTION_ID}.${getSessionsTelemetryEnvironmentId(environment.id)}`,
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

	// -- Search --

	/**
	 * The text of a session that searching the list matches: what its row and its section headers show, and the
	 * branches, pull requests, and remote host that its hover shows.
	 */
	private getSessionSearchDocument(session: ISession): ISessionSearchDocument {
		const fields: ISessionSearchField[] = [];
		const add = (kind: SessionSearchFieldKind, text: string | undefined) => {
			if (text) {
				fields.push({ kind, text });
			}
		};
		const workspace = session.workspace.get();
		add('folder', workspace?.label);
		for (const folder of workspace?.folders ?? []) {
			add('folder', folder.name);
		}
		const repository = getSessionRepository(session);
		if (repository) {
			add('repository', `${repository.owner}/${repository.name}`);
		}
		for (const name of this.getSessionGroupSearchNames(session)) {
			add('group', name);
		}
		for (const folder of workspace?.folders ?? []) {
			add('branch', folder.gitRepository?.branchName);
		}
		add('branch', session.branch?.get());
		for (const pullRequest of getSessionPullRequestSearchTexts(session)) {
			add('pullRequest', pullRequest);
		}
		if (session.environment !== 'local' && session.environment !== 'cloud') {
			add('host', this._sessionsProvidersService.getProvider(session.providerId, session.sessionId)?.environment.label);
		}
		return {
			title: this.getComparisonAttemptLabel(session) ?? session.title.get(),
			chatTitles: this.getRenderedSessionListChats(session).map(chat => this.getComparisonAttemptLabel(session, chat) ?? getChatTitle(chat)),
			fields,
		};
	}

	/**
	 * The names of the custom groups and comparison that the session's row is in, innermost first. Like
	 * {@link getRowGroupDepth}, that is the group the session is a member of, or else the group that its workspace,
	 * repository, or environment section is placed in, and their parents.
	 */
	private getSessionGroupSearchNames(session: ISession): string[] {
		let groupId = this.getRenderedSessionGroup(session)?.id;
		if (groupId === undefined && !session.isArchived.get() && !this.isSessionPinned(session)) {
			const [sectionId] = this.getUngroupedSectionIds(session);
			groupId = sectionId === undefined ? undefined : this.getSectionParentId(sectionId);
		}
		const names: string[] = [];
		const visited = new Set<string>();
		while (groupId !== undefined && !visited.has(groupId)) {
			visited.add(groupId);
			const group = this._sessionGroupsService.getGroup(groupId);
			if (!group) {
				break;
			}
			// A comparison's header shows its title rather than its group's name.
			names.push(this.sessionComparisonService.comparisons.get().find(comparison => comparison.groupId === group.id)?.title ?? group.name);
			const comparisonSectionId = this.comparisonSectionIds.get(group.id);
			groupId = group.parentId ?? (comparisonSectionId === undefined ? undefined : this.getSectionParentId(comparisonSectionId));
		}
		return names;
	}

	/**
	 * While searching, the field that explains why a session or a standalone chat matched when a word of the query is in
	 * neither its title, its chat titles, `shownTexts` (what its row shows besides them), nor the headers of the sections
	 * and groups above it.
	 */
	private getSearchHint(element: ISession | ISessionChatItem, shownTexts: readonly string[]): ISessionSearchHint | undefined {
		const match = this.searchFilter.getMatch(element);
		if (!match?.fieldWords.length) {
			return undefined;
		}
		const headerLabels: string[] = [];
		if (this.tree.hasElement(element)) {
			for (let parent = this.tree.getParentElement(element); parent; parent = this.tree.getParentElement(parent)) {
				if (isSessionGroupItem(parent)) {
					headerLabels.push(parent.comparison?.title ?? parent.group.name);
				} else if (isSessionSection(parent)) {
					headerLabels.push(parent.label);
				}
			}
		}
		return getSessionSearchHint(match, [...shownTexts, ...headerLabels]);
	}

	/** What the search shows: how many sessions and standalone chats, and how many of them matched beyond their title. */
	private getSearchResults(): ISessionsListSearchResults {
		let count = 0;
		let beyondTitleCount = 0;
		const visit = (node: ITreeNode<SessionListItem | null, FuzzyScore | undefined>): void => {
			for (const child of node.children) {
				const element = child.element;
				if (!child.visible || !element) {
					continue;
				}
				const match = isSessionItem(element) || isPendingSessionItem(element) || (isSessionChatItem(element) && element.standalone) ? this.searchFilter.getMatch(element) : undefined;
				if (match) {
					count++;
					if (match.matchesBeyondTitle) {
						beyondTitleCount++;
					}
				}
				visit(child);
			}
		};
		visit(this.tree.getNode());
		return { count, beyondTitleCount };
	}

	/** The collapse state of the rows that can collapse, by row identity. */
	private captureCollapseState(): Map<string, boolean> {
		const state = new Map<string, boolean>();
		const visit = (node: ITreeNode<SessionListItem | null, FuzzyScore | undefined>): void => {
			for (const child of node.children) {
				if (child.element && child.collapsible) {
					state.set(getSessionListItemId(child.element), child.collapsed);
				}
				visit(child);
			}
		};
		visit(this.tree.getNode());
		return state;
	}

	/** Whether a change of a row's collapse state is the user's to persist, rather than a search's or a reveal's. */
	private persistsCollapseState(): boolean {
		return !this.suspendCollapseStatePersistence && !this.searchCollapseSnapshot;
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

	/**
	 * Keeps a newly pinned session visible. The Pinned section is hidden while
	 * empty and defaults to collapsed, so the first pin would otherwise create a
	 * collapsed section that hides the session. A collapse the user chose is kept.
	 */
	private expandPinnedSectionForNewPins(e: ISessionListModelChangeEvent): void {
		const changedIds = new Set(e.changes.filter(change => change.kind === SessionListModelChangeKind.Pinned).map(change => change.sessionId));
		if (changedIds.size === 0 || this.getSavedCollapseState('pinned') !== undefined) {
			return;
		}
		if (this._sessionsManagementService.getSessions().some(session => changedIds.has(session.sessionId) && this._sessionsListModelService.isSessionPinned(session))) {
			this.saveSectionCollapseState('pinned', false);
		}
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
		collectSections(this.tree.getNode());
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

	// -- One-time state migration --

	/**
	 * Repository grouping showed cloud sandbox sessions in their workspace section until they joined
	 * their repository's section. Once ever, this gives each such repository section the list state
	 * recorded for that workspace section, unless the repository section has its own: its custom
	 * group and position there, top-level position, icon and color, collapse state, and show
	 * more/show less choice. Nothing is removed, as Workspace grouping still shows the workspace section.
	 *
	 * A Copilot cloud session's workspace section is named `<owner>/<repo>` like a cloud sandbox
	 * session's, so state keyed by that name (position, icon and color) is adopted only for
	 * repositories that state keyed unambiguously shows had cloud sandbox sessions: a custom group
	 * placement in Repository grouping, or a collapse or show more/show less choice keyed by an
	 * `https://github.com/<owner>/<repo>` workspace, which Copilot cloud sessions never have.
	 */
	// TODO@benibenj Remove after 2027-01-26, once profiles have run it.
	static migrateCloudSandboxRepositorySections(storageService: IStorageService, sessionGroupsService: ISessionGroupsService, sessionSectionOrderService: ISessionSectionOrderService): void {
		if (storageService.getBoolean(SessionsList.CLOUD_SANDBOX_REPOSITORY_SECTIONS_MIGRATED_KEY, StorageScope.PROFILE, false)) {
			return;
		}
		try {
			// Workspace section ids, by the id of the repository section that adopts their state.
			const workspaceSectionIds = new Map<string, Set<string>>();
			const addWorkspaceSection = (repositorySectionId: string, workspaceSectionId: string) => {
				let ids = workspaceSectionIds.get(repositorySectionId);
				if (!ids) {
					ids = new Set();
					workspaceSectionIds.set(repositorySectionId, ids);
				}
				ids.add(workspaceSectionId);
			};

			for (const key of [SessionsList.SECTION_COLLAPSE_STATE_KEY, SessionsList.SESSION_GROUP_EXPANSION_STATE_KEY]) {
				const state = readStoredBooleans(storageService, key);
				let changed = false;
				for (const [stateId, value] of Object.entries(state)) {
					const repository = stateId.startsWith('workspace:https:') ? getGitHubRepositoryOfUrl(URI.parse(stateId.slice('workspace:'.length))) : undefined;
					if (!repository) {
						continue;
					}
					const repositorySectionId = getRepositorySectionId({ owner: repository.owner, name: repository.repo });
					// A cloud sandbox session's workspace section is named after the repository it names by URL.
					addWorkspaceSection(repositorySectionId, `workspace:${repository.owner}/${repository.repo}`);
					if (state[repositorySectionId] === undefined) {
						state[repositorySectionId] = value;
						changed = true;
					}
				}
				if (changed) {
					storageService.store(key, JSON.stringify(state), StorageScope.PROFILE, StorageTarget.USER);
				}
			}

			// Repository grouping placed a workspace section without a repository under `repository:workspace:<name>`.
			const placements: { readonly key: string; readonly groupId: string; readonly repositorySectionId: string }[] = [];
			for (const group of sessionGroupsService.getGroups()) {
				for (const key of sessionGroupsService.getSectionIdsInGroup(group.id)) {
					if (!key.startsWith(`${REPOSITORY_SECTION_PREFIX}workspace:`)) {
						continue;
					}
					const workspaceSectionId = key.slice(REPOSITORY_SECTION_PREFIX.length);
					const [owner, name] = getGitHubRepositoryId(workspaceSectionId.slice('workspace:'.length))?.split('/') ?? [];
					if (owner && name) {
						const repositorySectionId = getRepositorySectionId({ owner, name });
						addWorkspaceSection(repositorySectionId, workspaceSectionId);
						placements.push({ key, groupId: group.id, repositorySectionId });
					}
				}
			}
			for (const { key, groupId, repositorySectionId } of placements) {
				// A promoted section was placed at the top level by the user, which `getGroupOfSection` does not record.
				if (sessionGroupsService.getGroupOfSection(repositorySectionId) === undefined && !sessionSectionOrderService.isPromoted(repositorySectionId)) {
					sessionGroupsService.moveSection(repositorySectionId, groupId, { siblingId: key, position: 'after' });
				}
			}

			for (const [repositorySectionId, ids] of workspaceSectionIds) {
				for (const workspaceSectionId of ids) {
					sessionSectionOrderService.adoptPosition(workspaceSectionId, repositorySectionId);
					const appearance = sessionGroupsService.getSectionAppearance(workspaceSectionId);
					if (appearance && !sessionGroupsService.getSectionAppearance(repositorySectionId)) {
						sessionGroupsService.setSectionIcon(repositorySectionId, appearance.icon);
						sessionGroupsService.setSectionColor(repositorySectionId, appearance.color);
					}
				}
			}
		} finally {
			storageService.store(SessionsList.CLOUD_SANDBOX_REPOSITORY_SECTIONS_MIGRATED_KEY, true, StorageScope.PROFILE, StorageTarget.MACHINE);
		}
	}
}

/** A stored JSON record of booleans, without its other values. */
function readStoredBooleans(storageService: IStorageService, key: string): Record<string, boolean> {
	try {
		const parsed = JSON.parse(storageService.get(key, StorageScope.PROFILE) ?? '{}');
		if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
			return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean'));
		}
	} catch {
		// Ignore corrupt persisted state.
	}
	return {};
}

/** Migrates persisted sessions list state at startup, before the list restores it. */
export class SessionsListStateMigrationContribution implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsListStateMigration';

	constructor(
		@IStorageService storageService: IStorageService,
		@ISessionGroupsService sessionGroupsService: ISessionGroupsService,
		@ISessionSectionOrderService sessionSectionOrderService: ISessionSectionOrderService,
	) {
		SessionsList.migrateCloudSandboxRepositorySections(storageService, sessionGroupsService, sessionSectionOrderService);
	}
}

//#endregion


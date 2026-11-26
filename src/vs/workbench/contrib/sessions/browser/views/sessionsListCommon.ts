/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPendingSessionItem, isPendingSessionItem } from './pendingSessions.js';
import '../media/sessionsList.css';
import '../media/disclosure.css';
import { IReader } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { IChat, ISession, ISessionEnvironment, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionGroup } from '../sessionGroupsService.js';
import { IPinnedCanvas } from '../pinnedCanvases.js';

/** The section that lists pinned canvases and starts sessions with a new canvas. Its type keys its header actions. */
export const CANVASES_SECTION_ID = 'canvases';

export const SessionItemContextMenuId = MenuId.SessionItemContextMenu;
/** The session context menu group that changes where a session is listed: Pin, the group membership actions, then Move to Session.... */
export const SessionItemOrganizeMenuGroup = '2_organize';
export const SessionSectionToolbarMenuId = new MenuId('SessionSectionToolbar');
export const SessionGroupToolbarMenuId = new MenuId('SessionGroupToolbar');
export const NEW_SESSION_FOR_WORKSPACE_ACTION_ID = 'sessionsView.sectionNewSession';
/** Starts a new session like a repository section's most recent session in one environment. Arguments: the section and the environment id. */
export const NEW_SESSION_IN_ENVIRONMENT_ACTION_ID = 'sessionsView.sectionNewSessionInEnvironment';

/** Controls whether the empty default Chats group is shown in the sessions list. */
export const SESSIONS_LIST_SHOW_EMPTY_DEFAULT_GROUPS_SETTING = 'sessions.list.showEmptyDefaultGroups';
export const SESSIONS_LIST_SHOW_UNREAD_IN_COLLAPSED_SECTIONS_SETTING = 'sessions.list.showUnreadInCollapsedSections';
export const SESSIONS_LIST_SHOW_ARCHIVED_BY_DEFAULT_SETTING = 'sessions.list.showArchivedByDefault';
/** Controls whether the rows within a section are indented to show their hierarchy below the section header. */
export const SESSIONS_LIST_INDENT_ITEMS_SETTING = 'sessions.list.indentItems';
/** Whether pinned canvases are listed in a Canvases section, which can also start a session with a new canvas. */
export const SESSIONS_LIST_CANVASES_SECTION_SETTING = 'sessions.list.canvasesSection';
/** Starts a session with a new canvas, which the Canvases section offers. */
export const NEW_CANVAS_SESSION_COMMAND_ID = 'workbench.action.agentSessions.newCanvasSession';

export const IsSessionPinnedContext = new RawContextKey<boolean>('sessionItem.isPinned', false);
export const SessionItemInboxStateContext = new RawContextKey<string>('sessionItem.inboxState', '');
export const SessionItemCanAcknowledgeContext = new RawContextKey<boolean>('sessionItem.canAcknowledge', false);
export const SessionItemCanMergePullRequestContext = new RawContextKey<boolean>('sessionItem.canMergePullRequest', false);
export const SessionItemStatusContext = new RawContextKey<SessionStatus>('sessionItem.status', SessionStatus.Completed);
export const SessionItemHasUnreadNestedSessionsContext = new RawContextKey<boolean>('sessionItem.hasUnreadNestedSessions', false);
export const SessionChatItemCanRenameContext = new RawContextKey<boolean>('sessionChatItem.canRename', false);
export const SessionChatItemCanArchiveContext = new RawContextKey<boolean>('sessionChatItem.canArchive', false);
export const SessionChatItemCanDeleteContext = new RawContextKey<boolean>('sessionChatItem.canDelete', false);
/** Whether the chat item's chat can move out of its session, e.g. into a new session: its provider moves chats and the chat is movable. */
export const SessionChatItemCanMoveContext = new RawContextKey<boolean>('sessionChatItem.canMove', false);
/** Whether another session can take the chat item's chat as its last chat. */
export const SessionChatItemHasMoveDestinationContext = new RawContextKey<boolean>('sessionChatItem.hasMoveDestination', false);
/** Whether another session can take the session item's session as its last chat. */
export const SessionItemHasMoveDestinationContext = new RawContextKey<boolean>('sessionItem.hasMoveDestination', false);
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
/** Whether the session item is the session of an automation run. */
export const SessionItemIsAutomationContext = new RawContextKey<boolean>('sessionItem.isAutomation', false);
/** Whether the session item belongs in the Sessions list. Automation sessions only do once they are shown there. */
export const SessionItemIsInSessionsListContext = new RawContextKey<boolean>('sessionItem.isInSessionsList', false);
export const SessionSectionTypeContext = new RawContextKey<string>('sessionSection.type', '');
export const SessionSectionHasGitHubRepositoryContext = new RawContextKey<boolean>('sessionSection.hasGitHubRepository', false);
export const SessionSectionHasNonCloudRepositoryContext = new RawContextKey<boolean>('sessionSection.hasNonCloudRepository', false);
export const SessionGroupHasVisibleSessionsContext = new RawContextKey<boolean>('sessionGroup.hasVisibleSessions', false);
export const SessionGroupIsEmptyContext = new RawContextKey<boolean>('sessionGroup.isEmpty', false);
export const SessionGroupIsComparisonContext = new RawContextKey<boolean>('sessionGroup.isComparison', false);

export enum SessionsGrouping {
	Workspace = 'workspace',
	Repository = 'repository',
	Environment = 'environment',
	Date = 'date',
	Inbox = 'inbox',
}

export enum SessionsSorting {
	Created = 'created',
	Updated = 'updated',
}

export interface ISessionSection {
	readonly id: string;
	readonly collapseStateId?: string;
	readonly label: string;
	readonly sessions: ISession[];
	readonly pendingItems?: readonly IPendingSessionItem[];
	/** The repository of a repository section. */
	readonly repository?: ISessionRepository;
	readonly environment?: ISessionEnvironment;
	/** The pinned canvas a navigation row opens. */
	readonly pinnedCanvas?: IPinnedCanvas;
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
		readonly configuration: string;
	};
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
		/**
		 * The session the chat is still in while a pending move shows it as a
		 * chat of {@link session}, where the move puts it: the main chat of a
		 * session moving under another session. Opening the row opens this
		 * session, and the row offers no other actions until the move ends.
		 */
		readonly movingFrom?: ISession,
	) { }
}

export type ISessionChatItem = SessionChatItem;

export type SessionListItem = ISession | SessionChatItem | ISessionSection | ISessionGroupItem | ISessionShowMore | ISessionPlaceholder | IPendingSessionItem;

export function isSessionChatItem(item: SessionListItem): item is ISessionChatItem {
	return item instanceof SessionChatItem;
}

export function isSessionGroupItem(item: SessionListItem): item is ISessionGroupItem {
	return 'group' in item;
}

export function isSessionSection(item: SessionListItem): item is ISessionSection {
	return !isSessionGroupItem(item) && 'sessions' in item && Array.isArray((item as ISessionSection).sessions);
}

export function isSessionShowMore(item: SessionListItem): item is ISessionShowMore {
	return 'showMore' in item && (item as ISessionShowMore).showMore === true;
}

export function isSessionPlaceholder(item: SessionListItem): item is ISessionPlaceholder {
	return 'placeholder' in item && (item as ISessionPlaceholder).placeholder === true;
}

export function isSessionItem(item: SessionListItem): item is ISession {
	return !isPendingSessionItem(item) && !isSessionChatItem(item) && !isSessionGroupItem(item) && !isSessionSection(item) && !isSessionShowMore(item) && !isSessionPlaceholder(item);
}

/** Whether the search of the Sessions list is open, so that Escape in the list closes it. */
export const SessionsListSearchOpenContext = new RawContextKey<boolean>('sessionsListSearchOpen', false, localize('sessionsListSearchOpen', "Whether the search of the Sessions list is open."));

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPendingSessionItem, isPendingSessionItem } from './pendingSessions.js';
import { CANVASES_SECTION_ID, ISessionGroupItem, ISessionSection, SessionChatItem, SessionGroupConnectorPosition, SessionListItem, SessionsGrouping, SessionsSorting, isSessionChatItem, isSessionGroupItem, isSessionItem, isSessionPlaceholder, isSessionSection, isSessionShowMore } from './sessionsListCommon.js';
import { AUTOMATIONS_SECTION_ID, CUSTOMIZATIONS_SECTION_ID, DATE_SECTION_IDS, ENVIRONMENT_SECTION_PREFIX, EXTERNAL_SESSIONS_SECTION_ID, NEW_SESSION_SECTION_ID, QUICK_CHATS_SECTION_ID, RECENTLY_UPDATED_SESSION_THRESHOLD_MS, REPOSITORY_SECTION_PREFIX, getComparisonGroupSummary, getRepositorySectionId, getSessionListChats, getSessionRepository, getSessionSectionType, getSessionsRootFolder, groupSessionsForList, groupingHasQuickChatsSection, isComparisonLaunchPending, isQuickChatSession, isSessionGroupingSection, isShortcutSection, keepDateSectionOrder, labelRepositorySections, limitSessionsForList, partitionByDate, sessionMatchesFolder, sessionWorkspaceLabel, sortComparisonGroupMembers, sortSessionListChats, sortSessions, IInboxPlacement } from './sessionsListHelpers.js';
import { compareSessionEnvironments, getWorktreeFilterKeys } from './sessionsListFilters.js';
import { IObjectTreeElement, ObjectTreeElementCollapseState } from '../../../../../base/browser/ui/tree/tree.js';
import { constObservable, IReader } from '../../../../../base/common/observable.js';
import { IExtUri, isEqual } from '../../../../../base/common/resources.js';
import { isDefined } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IChat, ISession, ISessionEnvironment } from '../../../../services/sessions/common/session.js';
import { ISessionSectionOrderService } from '../../../../services/sessions/browser/sessionSectionOrderService.js';
import { ISessionGroup, SessionGroupTree, getSessionGroupIdOfSection, getSessionGroupSectionId } from '../sessionGroupsService.js';
import { SessionSortEntry, SessionSortMode } from '../sessionsListModelService.js';
import { getSessionComparisonHarnessLabel, ISessionComparison, SessionComparisonParticipantRole } from '../../common/sessionComparison.js';
import { IInboxSessionAttention, InboxNotificationPriority } from '../../common/sessionAttentionService.js';
import { getSessionInboxPriority, getSessionInboxSection, SessionInboxSection, SessionInboxState, sessionInboxSections } from '../../common/sessionInbox.js';

export const SHOW_MORE_FOLDERS_LABEL = '__more_folders__';
/** The section id of the placeholder a scoped list shows while none of its folders' sessions are listed. */
export const SCOPE_EMPTY_PLACEHOLDER_ID = '__scope_empty__';
export const FOUR_DAYS_MS = 4 * 24 * 60 * 60 * 1000;

export function sortingToMode(sorting: SessionsSorting): SessionSortMode {
	return sorting === SessionsSorting.Updated ? 'updated' : 'created';
}

/** The done chats of a session that is not done, which the Done section lists as rows of their own. */
export function getSessionDoneListChats(session: ISession, hideSideChats: boolean, reader?: IReader): readonly IChat[] {
	return session.isArchived.read(reader) ? [] : getSessionListChats(session, reader, true, hideSideChats).filter(chat => chat.isArchived.read(reader));
}

/** Whether a session is archived or lists archived chats, both of which the archived filter hides. */
export function hasArchivedListContent(session: ISession, hideSideChats: boolean): boolean {
	return session.isArchived.get() || getSessionListChats(session, undefined, true, hideSideChats).some(chat => chat.isArchived.get());
}

/** The identity of a row, which keeps its state, such as whether it is collapsed, while the list renders again. */
export function getSessionListItemId(element: SessionListItem): string {
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

export function getComparisonSessions(comparison: ISessionComparison, getSession: (resource: URI) => ISession | undefined): ISession[] {
	return comparison.participants.flatMap(participant => {
		if (!participant.sessionResource) {
			return [];
		}
		const session = getSession(participant.sessionResource);
		return session ? [session] : [];
	});
}

export function getComparisonSortEntry(comparison: ISessionComparison, getSession: (resource: URI) => ISession | undefined): SessionSortEntry {
	const updatedAt = Math.max(comparison.createdAt, ...getComparisonSessions(comparison, getSession).map(session => session.updatedAt.get().getTime()));
	return { sessionId: getSessionGroupSectionId(comparison.groupId), createdAt: new Date(comparison.createdAt), updatedAt: constObservable(new Date(updatedAt)) };
}

/** Computes the Inbox placement and ordering inputs for each filtered session. */
export function computeInboxPlacements(
	sessions: readonly ISession[],
	attention: ReadonlyMap<string, IInboxSessionAttention>,
	getInboxState: (session: ISession, reader?: IReader) => SessionInboxState | undefined,
	reader?: IReader,
): ReadonlyMap<string, IInboxPlacement> {
	const placements = new Map<string, IInboxPlacement>();
	for (const session of sessions) {
		const sessionAttention = attention.get(session.sessionId);
		placements.set(session.sessionId, {
			section: getSessionInboxSection(session, getInboxState(session, reader), reader, sessionAttention),
			priority: getSessionInboxPriority(session, sessionAttention, reader),
			updatedAt: session.updatedAt.read(reader).getTime(),
		});
	}
	return placements;
}

/**
 * Until when the sections and caps of the list hold as it renders them at `now`: they also follow the time, without an
 * event as it passes, such as a session moving from Recent to Older at midnight, a session updated in the last day
 * staying Recent, or a workspace updated in the last days staying uncapped.
 */
export function computeRenderValidUntil(sessions: readonly ISession[], now: number): number {
	const nowDate = new Date(now);
	let validUntil = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() + 1).getTime();
	for (const session of sessions) {
		const updated = session.updatedAt.get().getTime();
		// The first moment after each threshold, as the list counts a session updated exactly at the threshold as within it
		for (const boundary of [updated + RECENTLY_UPDATED_SESSION_THRESHOLD_MS + 1, updated + FOUR_DAYS_MS + 1]) {
			if (boundary > now && boundary < validUntil) {
				validUntil = boundary;
			}
		}
	}
	return validUntil;
}

/** A session shown as a chat of its destination session while its provider moves it. */
export interface IPendingSessionMoveInfo {
	readonly session: ISession;
	readonly chat: IChat;
	readonly destination: ISession;
	readonly after: IChat | undefined;
}

/** Read-only view of group state consumed by {@link buildSessionsListModel}. */
export interface ISessionsListModelGroups {
	getTree(): SessionGroupTree;
	getGroup(groupId: string): ISessionGroup | undefined;
	getGroupOfSession(sessionId: string): string | undefined;
	getGroupOfSection(sectionId: string): string | undefined;
	getChildIds(groupId: string): readonly string[];
	getSessionIdsInGroup(groupId: string): readonly string[];
	getSectionIdsInGroup(groupId: string): readonly string[];
}

/** Render-local comparison metadata passed to search matching during model construction. */
export interface ISessionsListSearchContext {
	readonly comparisonAttemptLabels: ReadonlyMap<string, string>;
	readonly comparisonSectionIds: ReadonlyMap<string, string>;
}

/** Immutable render-output snapshot produced by each {@link buildSessionsListModel} call. */
export interface ISessionsListRenderSnapshot {
	/** Connector position for each rendered comparison participant session, by session id. */
	readonly comparisonParticipantConnectorPositions: ReadonlyMap<string, SessionGroupConnectorPosition>;
	/** Harness label for each rendered comparison attempt, keyed by chat resource string or session id. */
	readonly comparisonAttemptLabels: ReadonlyMap<string, string>;
	/** Section id each active comparison group renders in, by group id. */
	readonly comparisonSectionIds: ReadonlyMap<string, string>;
	/** How many groups each rendered custom group is nested in, by group id. */
	readonly groupDepths: ReadonlyMap<string, number>;
	/** Session ids of originating sessions that have comparisons attached directly below them. */
	readonly comparisonParentSessionIds: ReadonlySet<string>;
	/** Session ids of comparison attempt sessions attached below their originating session. */
	readonly attachedComparisonSessionIds: ReadonlySet<string>;
	/** Reorderable top-level headers in display order, by reorder identity. */
	readonly topLevelOrder: readonly string[];
	/** Grouping sections capped behind "+N more", whether currently expanded or collapsed. */
	readonly moreFolderSectionIds: ReadonlySet<string>;
	/** Grouping sections currently hidden behind the collapsed "+N more" row. */
	readonly hiddenGroupingSections: readonly ISessionSection[];
	/** Pinned group and grouping-section headers rendered in Pinned, by their pin key. */
	readonly renderedPinnedHeaderIds: ReadonlySet<string>;
	/** Resource strings of sessions with nested rows (chats or attached comparisons). */
	readonly nestedSessionResources: ReadonlySet<string>;
	/** Whether the Inbox "Ready for you" section had at least one session in this render. */
	readonly hadInboxSessions: boolean;
	/** Inbox placement of each filtered session in Inbox mode, or `undefined` outside Inbox mode. */
	readonly inboxPlacements: ReadonlyMap<string, IInboxPlacement> | undefined;
	/** Timestamp (ms) until which time-sensitive sectioning and capping in this render remain valid. */
	readonly renderValidUntil: number;
}

export const EMPTY_SESSIONS_LIST_RENDER_SNAPSHOT: ISessionsListRenderSnapshot = {
	comparisonParticipantConnectorPositions: new Map(),
	comparisonAttemptLabels: new Map(),
	comparisonSectionIds: new Map(),
	groupDepths: new Map(),
	comparisonParentSessionIds: new Set(),
	attachedComparisonSessionIds: new Set(),
	topLevelOrder: [],
	moreFolderSectionIds: new Set(),
	hiddenGroupingSections: [],
	renderedPinnedHeaderIds: new Set(),
	nestedSessionResources: new Set(),
	hadInboxSessions: false,
	inboxPlacements: undefined,
	renderValidUntil: Number.POSITIVE_INFINITY,
};

/** Legacy section collapse key migrated to its current key while building the model. */
export interface ICollapseStateKeyMigration {
	readonly from: string;
	readonly to: string;
	readonly collapsed: boolean;
}

export interface ISessionsListModelInput {
	readonly now: number;
	readonly sessions: readonly ISession[];
	readonly previousSnapshot: ISessionsListRenderSnapshot;
	readonly grouping: SessionsGrouping;
	readonly sorting: SessionsSorting;
	readonly scoped: boolean;
	readonly hasSessionScope: boolean;
	readonly scopeBar: boolean;
	readonly listsQuickChats: boolean;
	readonly quickChatsInTimeGrouping: boolean;
	readonly offersWorktreeFilter: boolean;
	readonly excludeArchived: boolean;
	readonly excludeArchivedIsDefault: boolean;
	readonly archivedSessionsAvailable: boolean;
	readonly archivedSectionLabel: string;
	readonly hideSideChats: boolean;
	readonly groupExternalSessions: boolean;
	readonly showEmptyDefaultGroups: boolean;
	readonly someProviderSupportsQuickChats: boolean;
	readonly workspaceGroupCapped: boolean;
	readonly sessionGroupLimit: number;
	readonly expandedMoreFolders: boolean;
	readonly openWindowSourceFolder: URI | undefined;
	readonly editingGroupId: string | undefined;
	readonly activeSession: ISession | undefined;
	readonly onboardingSession: ISession | undefined;
	readonly scopedProviderIds: readonly string[] | undefined;
	readonly matchesFilter: (session: ISession, scopedByBar: boolean, availableWorktrees: ReadonlySet<string>) => boolean;
	readonly matchesInboxScope: (session: ISession) => boolean;
	readonly hasInboxScope: boolean;
	readonly scheduledOnly: boolean;
	readonly scheduledSessionResources: ReadonlySet<string> | undefined;
	readonly draftsLabel: string;
	readonly pendingDraftItems: readonly IPendingSessionItem[];
	readonly pendingSessionMoves: { readonly size: number; has(key: string): boolean; values(): Iterable<IPendingSessionMoveInfo> };
	readonly showNavigationShortcuts: boolean;
	readonly showAutomations: boolean;
	readonly showCustomizations: boolean;
	readonly showsCanvasesSection: boolean;
	readonly canvasesSection: ISessionSection | undefined;
	readonly pinnedCanvasSections: readonly ISessionSection[];
	readonly isSessionInScope: (session: ISession) => boolean;
	readonly isSessionPinned: (session: ISession) => boolean;
	readonly pinnedSectionIds: readonly string[];
	readonly getSortKey: (entry: SessionSortEntry, sorting: SessionsSorting) => number;
	readonly groups: ISessionsListModelGroups;
	readonly sectionOrder: Pick<ISessionSectionOrderService, 'resolveOrder' | 'isPromoted'>;
	readonly comparisons: readonly ISessionComparison[];
	readonly getComparisonForSession: (resource: URI) => ISessionComparison | undefined;
	readonly getSessionByResource: (resource: URI) => ISession | undefined;
	readonly getSessionForChatResource: (chatResource: URI) => ISession | undefined;
	readonly getComparisonConfiguration: (comparison: ISessionComparison) => string;
	readonly getWorkspaceLabel: (workspace: URI) => string;
	readonly environments: readonly ISessionEnvironment[];
	readonly getProviderEnvironmentId: (providerId: string) => string | undefined;
	readonly inboxAttention: ReadonlyMap<string, IInboxSessionAttention>;
	readonly getInboxState: (session: ISession) => SessionInboxState | undefined;
	readonly savedSectionCollapseState: ReadonlyMap<string, boolean>;
	readonly collapsedSessionResources: ReadonlySet<string>;
	readonly sessionGroupExpansion: ReadonlyMap<string, boolean>;
	readonly hasFindPattern: boolean;
	readonly expandForSearch: boolean;
	readonly collapseStateToRestore: ReadonlyMap<string, boolean> | undefined;
	readonly matchesSearch?: (session: ISession, context: ISessionsListSearchContext) => boolean;
	readonly extUri: IExtUri;
}

export interface ISessionsListModelResult {
	/** Tree root children ready for `tree.setChildren(null, children)`. */
	readonly children: IObjectTreeElement<SessionListItem>[];
	/** Shortcut rows for the separate navigation list (when shown). */
	readonly navigationSections: readonly ISessionSection[];
	/** Sessions surviving filtering, observed by Inbox attention tracking. */
	readonly filteredSessions: readonly ISession[];
	/** Immutable snapshot of all derived render metadata for this render. */
	readonly snapshot: ISessionsListRenderSnapshot;
	/** Legacy section collapse keys encountered and migrated to their current keys. */
	readonly migratedCollapseStateKeys: readonly ICollapseStateKeyMigration[];
	/** Setting experiment triggers observed during this render. */
	readonly triggers: {
		readonly showArchivedByDefault: boolean;
		readonly groupExternalSessions: boolean;
	};
}

export interface ISessionsListFilterResult {
	readonly filteredSessions: ISession[];
	readonly triggerShowArchivedByDefault: boolean;
}

export interface IPrecomputedInboxFilter extends ISessionsListFilterResult {
	readonly inboxPlacements: ReadonlyMap<string, IInboxPlacement> | undefined;
}

/**
 * Pure filtering phase of {@link buildSessionsListModel}. Exposed so callers in
 * Inbox mode can compute and reactively observe {@link computeInboxPlacements}
 * over the filtered sessions in a single pass before building the tree model.
 */
export function filterSessionsForList(input: ISessionsListModelInput): ISessionsListFilterResult {
	const {
		sessions,
		grouping,
		scopeBar,
		listsQuickChats,
		offersWorktreeFilter,
		excludeArchived,
		excludeArchivedIsDefault,
		hideSideChats,
		activeSession,
		onboardingSession,
		scopedProviderIds,
		matchesFilter,
		matchesInboxScope,
		scheduledOnly,
		scheduledSessionResources,
		pendingSessionMoves,
		isSessionInScope,
		getComparisonForSession,
		extUri,
	} = input;

	const inbox = grouping === SessionsGrouping.Inbox;
	const scopedByBar = inbox || scopeBar;
	const isEligible = (session: ISession) => isSessionInScope(session) && (listsQuickChats || !isQuickChatSession(session));
	let filtered = sessions.filter(isEligible);
	const availableWorktrees = offersWorktreeFilter ? getWorktreeFilterKeys(filtered, () => true, extUri) : new Set<string>();
	if (scopedProviderIds) {
		const scopedProviders = new Set(scopedProviderIds);
		filtered = filtered.filter(s => scopedProviders.has(s.providerId));
	}
	filtered = filtered.filter(session => matchesFilter(session, scopedByBar, availableWorktrees));
	if (scheduledOnly) {
		filtered = filtered.filter(session => scheduledSessionResources?.has(session.resource.toString()));
	}
	const triggerShowArchivedByDefault = excludeArchivedIsDefault && filtered.some(session => hasArchivedListContent(session, hideSideChats));
	if (excludeArchived) {
		filtered = filtered.filter(s => !s.isArchived.get());
	}

	// Keep the active and onboarding sessions visible even when another filter excludes them.
	for (const revealedSession of [activeSession, onboardingSession]) {
		if (revealedSession && !filtered.some(s => s.sessionId === revealedSession.sessionId)) {
			const match = sessions.find(s => s.sessionId === revealedSession.sessionId && isEligible(s));
			if (match) {
				filtered = [...filtered, match];
			}
		}
	}
	// A session moving under another session shows as a chat of that session instead.
	if (pendingSessionMoves.size > 0) {
		filtered = filtered.filter(session => !pendingSessionMoves.has(session.sessionId));
	}
	if (scopedByBar) {
		filtered = filtered.filter(session => matchesInboxScope(session));
	}
	filtered = filtered.filter(session => {
		const comparison = getComparisonForSession(session.resource);
		return !comparison || !isComparisonLaunchPending(comparison);
	});

	return { filteredSessions: filtered, triggerShowArchivedByDefault };
}

/**
 * Pure model builder for the sessions list tree. Transforms sessions, filters,
 * grouping, ordering, comparisons, and persisted UI state into tree elements
 * and an immutable {@link ISessionsListRenderSnapshot} without touching the DOM.
 */
export function buildSessionsListModel(input: ISessionsListModelInput, precomputedInbox?: IPrecomputedInboxFilter): ISessionsListModelResult {
	const {
		now,
		sessions,
		previousSnapshot,
		grouping,
		sorting,
		scoped,
		hasSessionScope,
		scopeBar,
		excludeArchived,
		archivedSessionsAvailable,
		archivedSectionLabel,
		hideSideChats,
		groupExternalSessions,
		showEmptyDefaultGroups,
		someProviderSupportsQuickChats,
		workspaceGroupCapped,
		sessionGroupLimit,
		expandedMoreFolders,
		openWindowSourceFolder,
		editingGroupId,
		activeSession,
		onboardingSession,
		hasInboxScope,
		draftsLabel,
		pendingDraftItems,
		pendingSessionMoves,
		showNavigationShortcuts,
		showAutomations,
		showCustomizations,
		showsCanvasesSection,
		canvasesSection,
		pinnedCanvasSections,
		isSessionInScope,
		isSessionPinned,
		pinnedSectionIds,
		getSortKey,
		groups: groupsModel,
		sectionOrder,
		comparisons,
		getComparisonForSession,
		getSessionByResource,
		getSessionForChatResource,
		getComparisonConfiguration,
		getWorkspaceLabel,
		environments,
		getProviderEnvironmentId,
		inboxAttention,
		getInboxState,
		collapsedSessionResources,
		sessionGroupExpansion,
		hasFindPattern,
		expandForSearch,
		collapseStateToRestore,
		matchesSearch,
	} = input;

	const inbox = grouping === SessionsGrouping.Inbox;
	const hasQuickChatsSection = scopeBar || !scoped;
	const quickChatsInTimeGrouping = input.quickChatsInTimeGrouping && hasQuickChatsSection;
	const renderValidUntil = computeRenderValidUntil(sessions, now);

	const nextNestedSessionResources = new Set(
		sessions
			.filter(session => getSessionListChats(session, undefined, false, hideSideChats).length > 0)
			.map(session => session.resource.toString())
	);

	// Filter sessions and compute Inbox placements (reusing precomputed results when provided)
	const { filteredSessions: filtered, triggerShowArchivedByDefault } = precomputedInbox ?? filterSessionsForList(input);
	const revealedSessionIds = [activeSession, onboardingSession].flatMap(session => session ? [session.sessionId] : []);
	const scope = (scoped || hasSessionScope || scopeBar)
		? new Set(sessions.filter(isSessionInScope).map(session => session.sessionId))
		: undefined;
	const isComparisonInScope = (comparison: ISessionComparison) => !scope || getComparisonSessions(comparison, getSessionByResource).some(session => scope.has(session.sessionId));

	const inboxPlacements = precomputedInbox
		? precomputedInbox.inboxPlacements
		: inbox
			? computeInboxPlacements(filtered, inboxAttention, getInboxState)
			: undefined;
	const getInboxSection = (session: ISession): SessionInboxSection =>
		inboxPlacements?.get(session.sessionId)?.section
		?? getSessionInboxSection(session, getInboxState(session), undefined, inboxAttention.get(session.sessionId));
	const getInboxPriority = (session: ISession): InboxNotificationPriority =>
		inboxPlacements?.get(session.sessionId)?.priority
		?? getSessionInboxPriority(session, inboxAttention.get(session.sessionId));

	const comparisonsByGroupId = new Map(comparisons.map(comparison => [comparison.groupId, comparison]));
	const getRenderedSessionGroup = (session: ISession): ISessionGroup | undefined => {
		if (session.isArchived.get() || isSessionPinned(session)) {
			return undefined;
		}
		const groupId = groupsModel.getGroupOfSession(session.sessionId);
		if (inbox && (groupId === undefined || !comparisonsByGroupId.has(groupId))) {
			return undefined;
		}
		return groupId === undefined ? undefined : groupsModel.getGroup(groupId);
	};

	const groupedMembers = new Map<string, ISession[]>();
	const groupedRegularIds = new Set<string>();
	for (const s of filtered) {
		const group = getRenderedSessionGroup(s);
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
	const triggerGroupExternalSessions = forSections.some(session => session.isExternal?.get() && !session.isArchived.get() && !isSessionPinned(session));

	const groupTree = groupsModel.getTree();
	const topLevelGroups = inbox
		? [...comparisonsByGroupId.keys()].map(id => groupsModel.getGroup(id)).filter(isDefined)
		: groupTree.getSubgroups(undefined);
	const allGroups = inbox ? topLevelGroups : topLevelGroups.flatMap(group => groupTree.getSubtree(group.id));
	const sortedMembersByGroupId = new Map<string, ISession[]>(allGroups.map(group => {
		const members = groupedMembers.get(group.id) ?? [];
		const comparison = comparisonsByGroupId.get(group.id);
		return [group.id, comparison
			? sortComparisonGroupMembers(comparison, members, sorting, getSortKey)
			: sortSessions(members, sorting, getSortKey)];
	}));

	const comparisonParticipantConnectorPositions = new Map<string, SessionGroupConnectorPosition>();
	const comparisonAttemptLabels = new Map<string, string>();
	const comparisonSectionIds = new Map<string, string>();
	const groupDepths = new Map<string, number>();

	const topLevelGroupIds = topLevelGroups.filter(group => !comparisonsByGroupId.has(group.id)).map(group => getSessionGroupSectionId(group.id));

	const sections = groupSessionsForList(
		forSections,
		grouping,
		sorting,
		isSessionPinned,
		getSortKey,
		archivedSectionLabel,
		groupExternalSessions,
		environments,
		getInboxSection,
		getInboxPriority,
		quickChatsInTimeGrouping,
		hasQuickChatsSection,
		now,
	);

	// Standalone done chats of sessions that are not done render in the Done section.
	const standaloneDoneChats = excludeArchived ? [] : filtered.flatMap(session => getSessionDoneListChats(session, hideSideChats).map(chat => ({ session, chat })));
	if ((standaloneDoneChats.length > 0 || !excludeArchived && archivedSessionsAvailable) && !sections.some(s => s.id === 'archived')) {
		sections.push({ id: 'archived', label: archivedSectionLabel, sessions: [] });
	}

	const getSectionGroupKey = (sectionId: string): string =>
		grouping === SessionsGrouping.Repository && sectionId.startsWith('workspace:')
			? `${REPOSITORY_SECTION_PREFIX}${sectionId}`
			: sectionId;
	const canHoldSubgroups = (groupId: string): boolean =>
		groupsModel.getGroup(groupId) !== undefined && !comparisonsByGroupId.has(groupId);
	const getSectionParentId = (sectionId: string): string | undefined => {
		const parentId = isSessionGroupingSection(sectionId) ? groupsModel.getGroupOfSection(getSectionGroupKey(sectionId)) : undefined;
		return parentId !== undefined && canHoldSubgroups(parentId) ? parentId : undefined;
	};
	const comparisonSortEntry = (groupId: string): SessionSortEntry =>
		getComparisonSortEntry(comparisonsByGroupId.get(groupId)!, getSessionByResource);

	const comparisonGroupsBySectionId = new Map<string, ISessionGroup[]>();
	const dateSectionByEntryId = new Map<string, string>();
	if (grouping === SessionsGrouping.Date) {
		const entries: SessionSortEntry[] = [
			...forSections.filter(session => !session.isArchived.get() && !isSessionPinned(session) && !(groupExternalSessions && session.isExternal?.get()) && !(quickChatsInTimeGrouping && isQuickChatSession(session))),
			...topLevelGroups.filter(group => comparisonsByGroupId.has(group.id) && isComparisonInScope(comparisonsByGroupId.get(group.id)!) && !(quickChatsInTimeGrouping && !comparisonsByGroupId.get(group.id)!.workspace)).map(group => comparisonSortEntry(group.id)),
		];
		const key = (entry: SessionSortEntry) => getSortKey(entry, sorting);
		const [recent, older] = partitionByDate(entries.sort((a, b) => key(b) - key(a)), sorting, key, entry => entry.updatedAt.get().getTime(), now);
		for (const [id, partitionEntries] of [['recent', recent], ['older', older]] as const) {
			const memberIds = new Set(partitionEntries.map(entry => entry.sessionId));
			for (const entry of partitionEntries) {
				dateSectionByEntryId.set(entry.sessionId, id);
			}
			const index = sections.findIndex(section => section.id === id);
			const section: ISessionSection = {
				id,
				label: id === 'recent' ? localize('recent', "Recent") : localize('older', "Older"),
				sessions: sortSessions(forSections.filter(session => memberIds.has(session.sessionId)), sorting, getSortKey),
			};
			if (index !== -1) {
				sections.splice(index, 1, ...(partitionEntries.length > 0 ? [section] : []));
			} else if (partitionEntries.length > 0) {
				sections.push(section);
			}
		}
	}

	{
		let addedRepositorySection = false;
		for (const group of allGroups) {
			const comparison = comparisonsByGroupId.get(group.id);
			if (!comparison) {
				continue;
			}
			const comparisonSessions = inbox && hasInboxScope
				? sortedMembersByGroupId.get(group.id)!
				: getComparisonSessions(comparison, getSessionByResource);
			if ((inbox && hasInboxScope && comparisonSessions.length === 0) || !isComparisonInScope(comparison)) {
				continue;
			}
			const environmentId = grouping === SessionsGrouping.Environment
				? comparisonSessions[0]?.environment
				?? comparison.participants.map(participant => getProviderEnvironmentId(participant.harness.providerId)).find(isDefined)
				: undefined;
			const environment = environmentId ? environments.find(env => env.id === environmentId) ?? { id: environmentId, label: environmentId } : undefined;
			if (grouping === SessionsGrouping.Environment && !environment) {
				continue;
			}
			const repository = grouping === SessionsGrouping.Repository && comparison.workspace
				? comparisonSessions.map(getSessionRepository).find(isDefined)
				: undefined;
			const workspaceLabel = comparison.workspace
				? comparisonSessions.map(sessionWorkspaceLabel).find(label => label !== localize('unknown', "Unknown"))
				?? getWorkspaceLabel(comparison.workspace)
				: localize('chatsSection', "Chats");
			const sectionId = inbox
				? sessionInboxSections.find(id => comparisonSessions.some(session => getInboxSection(session) === id)) ?? (comparisonSessions.length === 0 ? SessionInboxSection.Working : undefined)
				: grouping === SessionsGrouping.Date && !(quickChatsInTimeGrouping && !comparison.workspace)
					? dateSectionByEntryId.get(getSessionGroupSectionId(group.id))
					: environment ? `${ENVIRONMENT_SECTION_PREFIX}${environment.id}` : !comparison.workspace ? QUICK_CHATS_SECTION_ID : repository ? getRepositorySectionId(repository) : `workspace:${workspaceLabel}`;
			if (!sectionId) {
				continue;
			}
			comparisonSectionIds.set(group.id, sectionId);
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
		const sectionsWithComparisons = new Set(comparisonGroupsBySectionId.keys());
		for (let index = 0; index < sections.length; index++) {
			const section = sections[index];
			const type = getSessionSectionType(section.id);
			if (sectionsWithComparisons.has(section.id) && (type === 'workspace' || type === 'repository')) {
				sections[index] = { ...section, rootFolder: getSessionsRootFolder(section.sessions) };
			}
		}
		if (addedRepositorySection) {
			labelRepositorySections(sections);
		}
	}

	const sectionByGroupKey = new Map(sections.map(section => [getSectionGroupKey(section.id), section]));
	// Pinned groups and grouping sections render at the top of the Pinned section instead of where they would otherwise.
	const pinnedHeaderIds = inbox ? [] : pinnedSectionIds.filter(id => {
		const groupId = getSessionGroupIdOfSection(id);
		if (groupId !== undefined) {
			return groupTree.getPath(groupId).length > 0 && !comparisonsByGroupId.has(groupId);
		}
		const section = sectionByGroupKey.get(id);
		return !!section && isSessionGroupingSection(section.id);
	});
	const pinnedHeaders = new Set(pinnedHeaderIds);
	const isPinnedHeader = (id: string) => pinnedHeaders.has(getSectionGroupKey(id));
	const nestedSectionsByGroup = new Map<string, ISessionSection[]>();
	for (const section of sections) {
		const parentId = getSectionParentId(section.id);
		if (parentId !== undefined && !isPinnedHeader(section.id)) {
			const siblings = nestedSectionsByGroup.get(parentId) ?? [];
			siblings.push(section);
			nestedSectionsByGroup.set(parentId, siblings);
		}
	}

	const groupItemsById = new Map<string, ISessionGroupItem>();
	const buildGroupItem = (group: ISessionGroup, depth: number, inPinned = false): ISessionGroupItem => {
		const comparisonSectionId = comparisonSectionIds.get(group.id);
		const comparisonParentId = inbox || inPinned ? undefined : group.parentId ?? (comparisonSectionId ? getSectionParentId(comparisonSectionId) : undefined);
		if (comparisonParentId !== undefined) {
			// Under a pinned ancestor, which steps in under Pinned, the comparison counts its depth from there.
			const path = groupTree.getPath(comparisonParentId);
			const pinnedIndex = path.findLastIndex(ancestor => pinnedHeaders.has(getSessionGroupSectionId(ancestor.id)));
			depth = pinnedIndex === -1 ? path.length : path.length - pinnedIndex + 1;
		}
		// A separately pinned subgroup is a branch of its own under Pinned.
		const subgroups = inbox ? [] : groupTree.getSubgroups(group.id).filter(subgroup => !pinnedHeaders.has(getSessionGroupSectionId(subgroup.id))).map(subgroup => buildGroupItem(subgroup, depth + 1, inPinned));
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
					comparisonAttemptLabels.set(participant.chatResource?.toString() ?? session.sessionId, getSessionComparisonHarnessLabel(participant, !sameHarness));
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
			isEmpty: groupTree.getSubgroups(group.id).length === 0
				&& groupsModel.getSessionIdsInGroup(group.id).length === 0
				&& groupsModel.getSectionIdsInGroup(group.id).length === 0,
			editing: group.id === editingGroupId,
			comparison: comparison ? {
				id: comparison.id,
				title: comparison.title,
				launching: comparison.launching === true,
				summary: reader => getComparisonGroupSummary(comparison, sessions, reader),
				configuration: getComparisonConfiguration(comparison),
			} : undefined,
		};
		groupDepths.set(group.id, depth);
		groupItemsById.set(group.id, item);
		return item;
	};
	// Each displayed branch is built once: pinned headers and the comparisons of pinned sections step in under the Pinned section.
	for (const group of topLevelGroups) {
		const comparisonSectionId = comparisonSectionIds.get(group.id);
		const inPinned = pinnedHeaders.has(getSessionGroupSectionId(group.id)) || comparisonSectionId !== undefined && isPinnedHeader(comparisonSectionId);
		buildGroupItem(group, inPinned ? 1 : 0, inPinned);
	}
	for (const groupId of pinnedHeaderIds.map(getSessionGroupIdOfSection).filter(isDefined)) {
		const path = groupTree.getPath(groupId);
		if (path.length > 1) {
			buildGroupItem(path.at(-1)!, 1, true);
		}
	}

	const hasRecentSessions = sections.some(s => s.id === 'recent' && s.sessions.length > 0);
	const hasInboxSessions = inbox && sections.some(section => section.id === SessionInboxSection.ReadyForYou && section.sessions.length > 0);
	const inboxBecamePopulated = hasInboxSessions && !previousSnapshot.hadInboxSessions;

	if (showEmptyDefaultGroups && groupingHasQuickChatsSection(grouping, quickChatsInTimeGrouping, hasQuickChatsSection) && someProviderSupportsQuickChats && !sections.some(s => s.id === QUICK_CHATS_SECTION_ID)) {
		sections.push({ id: QUICK_CHATS_SECTION_ID, label: localize('chatsSection', "Chats"), sessions: [] });
	}

	// Partition grouping sections into primary vs "+N more".
	const partitionFolders = grouping !== SessionsGrouping.Date && !hasFindPattern && workspaceGroupCapped && !scope;
	const moreFolderSectionIds = partitionMoreFolders(
		partitionFolders,
		sections,
		getSectionParentId,
		isPinnedHeader,
		comparisonGroupsBySectionId,
		openWindowSourceFolder,
		sectionOrder,
		revealedSessionIds,
		now,
	);

	// Copy saved collapse state lazily only if a legacy key migration occurs.
	let migratedCollapseState: Map<string, boolean> | undefined;
	const migratedCollapseStateKeys: ICollapseStateKeyMigration[] = [];
	const getSavedCollapseState = (sectionId: string, legacySectionId?: string): boolean | undefined => {
		const source = migratedCollapseState ?? input.savedSectionCollapseState;
		const value = source.get(sectionId);
		if (value !== undefined) {
			return value;
		}
		if (legacySectionId !== undefined) {
			const legacy = source.get(legacySectionId);
			if (legacy !== undefined) {
				migratedCollapseState ??= new Map(input.savedSectionCollapseState);
				migratedCollapseState.delete(legacySectionId);
				migratedCollapseState.set(sectionId, legacy);
				migratedCollapseStateKeys.push({ from: legacySectionId, to: sectionId, collapsed: legacy });
				return legacy;
			}
		}
		return undefined;
	};

	const resolveCollapsed = (element: SessionListItem, collapsed: boolean | ObjectTreeElementCollapseState): boolean | ObjectTreeElementCollapseState => {
		if (hasFindPattern) {
			return expandForSearch ? ObjectTreeElementCollapseState.Expanded : ObjectTreeElementCollapseState.PreserveOrExpanded;
		}
		return collapseStateToRestore?.get(getSessionListItemId(element)) ?? collapsed;
	};

	const getRenderedSessionListChats = (session: ISession): readonly IChat[] => {
		const chats = getSessionListChats(session, undefined, !excludeArchived && session.isArchived.get(), hideSideChats);
		if (pendingSessionMoves.size === 0) {
			return chats;
		}
		let result = chats;
		for (const move of pendingSessionMoves.values()) {
			if (move.destination.sessionId === session.sessionId) {
				const index = move.after ? result.findIndex(chat => isEqual(chat.resource, move.after!.resource)) : -1;
				result = [...result.slice(0, index + 1), move.chat, ...result.slice(index + 1)];
			}
		}
		return result;
	};

	const getPendingMoveSource = (session: ISession, chat: IChat): ISession | undefined => {
		for (const move of pendingSessionMoves.values()) {
			if (move.destination.sessionId === session.sessionId && move.chat === chat) {
				return move.session;
			}
		}
		return undefined;
	};

	const toSessionChildren = (list: readonly ISession[]): IObjectTreeElement<SessionListItem>[] =>
		list.map(session => {
			const chats = sortSessionListChats(getRenderedSessionListChats(session), sorting);
			const resource = session.resource.toString();
			const wasNested = previousSnapshot.nestedSessionResources.has(resource);
			const persistedCollapsed = collapsedSessionResources.has(resource);
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
					? chats.map((chat, index) => ({ element: new SessionChatItem(session, chat, index === chats.length - 1, undefined, getPendingMoveSource(session, chat)) }))
					: undefined,
			};
		});

	const renderSessionChildren = (list: readonly ISession[], sectionId: string, sectionLabel: string, cap: { readonly stateId: string; readonly expandedByDefault: boolean } | undefined): IObjectTreeElement<SessionListItem>[] => {
		const limited = limitSessionsForList(list, sessionGroupLimit, {
			enabled: cap !== undefined,
			expanded: cap !== undefined && (sessionGroupExpansion.get(cap.stateId) ?? cap.expandedByDefault),
			sectionId,
			stateId: cap?.stateId,
			sectionLabel,
			revealSessionIds: revealedSessionIds,
		});
		const sectionRows = sectionId === 'archived' && standaloneDoneChats.length > 0
			? toDoneSectionChildren(limited.sessions, standaloneDoneChats, toSessionChildren)
			: toSessionChildren(limited.sessions);
		if (limited.showMore) {
			sectionRows.push({ element: limited.showMore });
		}
		return sectionRows;
	};

	const sortComparisonChildren = (nodes: IObjectTreeElement<SessionListItem>[]): IObjectTreeElement<SessionListItem>[] => {
		const getEntry = (element: ISession | ISessionGroupItem): SessionSortEntry =>
			isSessionGroupItem(element) ? comparisonSortEntry(element.group.id) : element;
		const key = (child: IObjectTreeElement<SessionListItem>) => isSessionItem(child.element) || (isSessionGroupItem(child.element) && child.element.comparison)
			? inbox ? (sorting === SessionsSorting.Created ? getEntry(child.element).createdAt : getEntry(child.element).updatedAt.get()).getTime()
				: getSortKey(getEntry(child.element), sorting)
			: Number.NEGATIVE_INFINITY;
		const priority = (child: IObjectTreeElement<SessionListItem>) => !inbox ? InboxNotificationPriority.Later
			: isSessionItem(child.element) ? getInboxPriority(child.element)
				: isSessionGroupItem(child.element) ? Math.min(InboxNotificationPriority.Later, ...child.element.sessions.map(session => getInboxPriority(session)))
					: InboxNotificationPriority.Later;
		return nodes.sort((a, b) => priority(a) - priority(b) || key(b) - key(a));
	};

	const renderSection = (section: ISessionSection, renderedSessions: readonly ISession[] = section.sessions): IObjectTreeElement<SessionListItem> => {
		if (isShortcutSection(section.id)) {
			return {
				element: section as SessionListItem,
				children: [],
				collapsible: false,
			};
		}

		const isWorkspaceGroup = section.id === QUICK_CHATS_SECTION_ID
			|| (grouping !== SessionsGrouping.Date && isSessionGroupingSection(section.id));
		const limitSessions = isWorkspaceGroup && !hasFindPattern && workspaceGroupCapped;
		let sectionChildren = renderSessionChildren(renderedSessions, section.id, section.label, limitSessions
			? { stateId: section.collapseStateId ?? section.id, expandedByDefault: false }
			: undefined);

		if (section.id === QUICK_CHATS_SECTION_ID && section.sessions.length === 0) {
			sectionChildren = [{ element: { placeholder: true as const, sectionId: section.id, label: localize('noChats', "No chats") } }];
		}

		let defaultCollapsed: boolean | ObjectTreeElementCollapseState = ObjectTreeElementCollapseState.PreserveOrExpanded;
		if (grouping === SessionsGrouping.Date && hasRecentSessions) {
			if (section.id === 'older' || section.id === 'archived') {
				defaultCollapsed = ObjectTreeElementCollapseState.PreserveOrCollapsed;
			}
		}
		if (section.id === 'archived' || inbox && section.id !== SessionInboxSection.ReadyForYou && section.id !== SessionInboxSection.Done && sessionInboxSections.some(id => id === section.id)) {
			defaultCollapsed = ObjectTreeElementCollapseState.PreserveOrCollapsed;
		}
		if (section.id === 'pinned' && !inbox || section.id === QUICK_CHATS_SECTION_ID) {
			defaultCollapsed = ObjectTreeElementCollapseState.PreserveOrCollapsed;
		}
		const savedCollapsed = getSavedCollapseState(section.collapseStateId ?? section.id, section.collapseStateId ? section.id : undefined);
		if (savedCollapsed !== undefined) {
			defaultCollapsed = inbox
				? savedCollapsed ? ObjectTreeElementCollapseState.PreserveOrCollapsed : ObjectTreeElementCollapseState.PreserveOrExpanded
				: savedCollapsed;
		} else if (hasInboxSessions && section.id !== SessionInboxSection.ReadyForYou) {
			defaultCollapsed = inboxBecamePopulated ? ObjectTreeElementCollapseState.Collapsed : ObjectTreeElementCollapseState.PreserveOrCollapsed;
		} else if (inbox && section.id === SessionInboxSection.Working) {
			defaultCollapsed = previousSnapshot.hadInboxSessions ? ObjectTreeElementCollapseState.Expanded : ObjectTreeElementCollapseState.PreserveOrExpanded;
		}
		if (inboxBecamePopulated && section.id === SessionInboxSection.ReadyForYou) {
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
		const comparisonChildren: IObjectTreeElement<SessionListItem>[] = [];
		const subgroupChildren = groupsModel.getChildIds(groupItem.group.id).flatMap(id => {
			const subgroup = groupItemsById.get(id);
			if (subgroup) {
				if (pinnedHeaders.has(getSessionGroupSectionId(id))) {
					return [];
				}
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
			const section = sectionByGroupKey.get(id);
			return section && getSectionParentId(section.id) === groupItem.group.id && !isPinnedHeader(section.id) ? [renderWorkspaceSection(section)] : [];
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
			: renderSessionChildren(groupItem.sessions, sectionId, groupItem.group.name, !hasFindPattern && workspaceGroupCapped
				? { stateId: sectionId, expandedByDefault: true }
				: undefined);
		const visibleGroupSessions = sessionChildren.map(child => child.element).filter(isSessionItem);
		if (groupItem.comparison && visibleGroupSessions.length > 0) {
			for (let index = 0; index < visibleGroupSessions.length; index++) {
				comparisonParticipantConnectorPositions.set(
					visibleGroupSessions[index].sessionId,
					index === visibleGroupSessions.length - 1 ? 'last' : 'middle',
				);
			}
		}
		return {
			element: groupItem,
			collapsible: true,
			collapsed: resolveCollapsed(groupItem, getSavedCollapseState(sectionId) ?? ObjectTreeElementCollapseState.PreserveOrExpanded),
			children: [...subgroupChildren, ...(comparisonChildren.length > 0 ? sortComparisonChildren([...comparisonChildren, ...sessionChildren]) : sessionChildren)],
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
			children: sortComparisonChildren([
				...comparisonGroups.map(renderGroup),
				...(renderedSection.children ?? []),
			]),
		};
	};

	// Navigation shortcuts & top fixed sections
	const children: IObjectTreeElement<SessionListItem>[] = [];
	const navigationSections: ISessionSection[] = [];
	if (showNavigationShortcuts) {
		navigationSections.push({ id: NEW_SESSION_SECTION_ID, label: localize('newSession', "New Session"), sessions: [] });
	}
	if (showAutomations) {
		const automationsSection: ISessionSection = { id: AUTOMATIONS_SECTION_ID, label: localize('automations', "Automations"), sessions: [] };
		if (showNavigationShortcuts) {
			navigationSections.push(automationsSection);
		} else {
			children.push(renderSection(automationsSection));
		}
	}
	if (canvasesSection) {
		if (showNavigationShortcuts) {
			const collapsed = getSavedCollapseState(CANVASES_SECTION_ID) ?? false;
			navigationSections.push({ ...canvasesSection, navigationCollapsed: collapsed });
			if (!collapsed) {
				navigationSections.push(...pinnedCanvasSections);
			}
		} else {
			const pins: IObjectTreeElement<SessionListItem>[] = pinnedCanvasSections.map(element => ({ element }));
			children.push({
				element: canvasesSection,
				collapsible: true,
				collapsed: resolveCollapsed(canvasesSection, getSavedCollapseState(canvasesSection.id) ? ObjectTreeElementCollapseState.PreserveOrCollapsed : ObjectTreeElementCollapseState.PreserveOrExpanded),
				children: pins.length > 0 ? pins : [{ element: { placeholder: true as const, sectionId: CANVASES_SECTION_ID, label: localize('noCanvases', "No canvases") } }],
			});
		}
	}
	if (showCustomizations) {
		navigationSections.push({ id: CUSTOMIZATIONS_SECTION_ID, label: localize('customizations', "Customizations"), sessions: [] });
	}
	if (!showsCanvasesSection) {
		if (showNavigationShortcuts) {
			navigationSections.push(...pinnedCanvasSections);
		} else {
			children.push(...pinnedCanvasSections.map(section => renderSection(section)));
		}
	}

	const pinnedHeaderChildren = pinnedHeaderIds.flatMap(id => {
		const groupId = getSessionGroupIdOfSection(id);
		const groupItem = groupId === undefined ? undefined : groupItemsById.get(groupId);
		const section = groupId === undefined ? sectionByGroupKey.get(id) : undefined;
		return groupItem ? [renderGroup(groupItem)] : section ? [renderWorkspaceSection(section)] : [];
	});
	const pinnedSessionsSection = sections.find(s => s.id === 'pinned');
	if (pinnedSessionsSection || pinnedHeaderChildren.length > 0) {
		// The header counts and summarizes the sessions of the pinned headers too, as a group's header does its subgroups'.
		const pinnedHeaderSessions = pinnedHeaderChildren.flatMap(child => isSessionGroupItem(child.element) ? child.element.subtreeSessions : isSessionSection(child.element) ? child.element.sessions : []);
		const pinnedSessions = pinnedSessionsSection?.sessions ?? [];
		const pinnedSection: ISessionSection = {
			...pinnedSessionsSection,
			id: 'pinned',
			label: pinnedSessionsSection?.label ?? localize('pinned', "Pinned"),
			sessions: pinnedSessions,
			summarySessions: pinnedHeaderSessions.length > 0 ? [...pinnedSessions, ...pinnedHeaderSessions] : undefined,
		};
		const rendered = renderSection(pinnedSection);
		children.push({ ...rendered, children: [...pinnedHeaderChildren, ...rendered.children ?? []] });
	}

	if (pendingDraftItems.length > 0) {
		const element: ISessionSection = { id: 'drafts', label: draftsLabel, sessions: [], pendingItems: pendingDraftItems };
		children.push({
			element,
			collapsible: true,
			collapsed: resolveCollapsed(element, (getSavedCollapseState(element.id) ?? true)
				? ObjectTreeElementCollapseState.PreserveOrCollapsed : ObjectTreeElementCollapseState.PreserveOrExpanded),
			children: pendingDraftItems.map(item => ({ element: item })),
		});
	}

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

	// Body layout: Inbox, Date, or workspace/repository/environment grouping
	const searchContext: ISessionsListSearchContext = { comparisonAttemptLabels, comparisonSectionIds };
	let topLevelOrder: string[] = [];
	let hiddenGroupingSections: readonly ISessionSection[] = [];
	let renderedMoreFolderSectionIds: ReadonlySet<string> = new Set();

	if (inbox) {
		for (const id of sessionInboxSections) {
			const sourceSection = sections.find(section => section.id === id);
			const section = sourceSection && hasFindPattern && matchesSearch
				? { ...sourceSection, sessions: sourceSection.sessions.filter(session => matchesSearch(session, searchContext)) }
				: sourceSection;
			if (section && (section.sessions.length > 0 || id === SessionInboxSection.ReadyForYou)) {
				let rendered = renderWorkspaceSection(section);
				if (id === SessionInboxSection.ReadyForYou && section.sessions.length === 0) {
					rendered = {
						...rendered,
						collapsed: false,
						children: [{
							element: {
								placeholder: true as const,
								sectionId: id,
								label: hasInboxScope ? localize('inboxScopeEmpty', "No Inbox activity matches this scope.") : localize('inboxEmpty', "Your inbox is clear"),
							},
						}],
					};
				}
				children.push(rendered);
			}
		}
	} else if (grouping === SessionsGrouping.Date) {
		const resolvedIds = keepDateSectionOrder(sectionOrder.resolveOrder([...topLevelGroupIds, ...DATE_SECTION_IDS]));
		topLevelOrder = resolvedIds;
		for (const id of resolvedIds) {
			// A pinned header keeps its place in the order, to return to it when unpinned, but renders in Pinned.
			if (isPinnedHeader(id)) {
				continue;
			}
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
		const workspaceSections = sections.filter(s => isSessionGroupingSection(s.id) && getSectionParentId(s.id) === undefined);
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
		const resolvedIds = sectionOrder.resolveOrder(defaultOrder);
		topLevelOrder = resolvedIds;
		for (const id of resolvedIds) {
			// A pinned header keeps its place in the order, to return to it when unpinned, but renders in Pinned.
			if (isPinnedHeader(id)) {
				continue;
			}
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
		renderedMoreFolderSectionIds = new Set(moreFolderSections.map(s => s.id));
		if (moreFolderSections.length > 0) {
			const kind = grouping === SessionsGrouping.Environment ? 'environments' : grouping === SessionsGrouping.Repository ? 'repositories' : 'folders';
			if (expandedMoreFolders) {
				for (const section of moreFolderSections) {
					children.push(renderWorkspaceSection(section));
				}
				children.push({
					element: { showMore: true as const, kind, mode: 'less' as const, sectionId: SHOW_MORE_FOLDERS_LABEL, stateId: SHOW_MORE_FOLDERS_LABEL, sectionLabel: SHOW_MORE_FOLDERS_LABEL, remainingCount: 0 },
				});
			} else {
				hiddenGroupingSections = moreFolderSections;
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
	if (scope && filtered.length === 0) {
		children.push({ element: { placeholder: true as const, sectionId: SCOPE_EMPTY_PLACEHOLDER_ID, label: localize('sessionsList.scopeEmpty', "No sessions to show in this folder.") } });
	}

	// Attach comparisons to their originating sessions when applicable.
	const {
		children: attachedChildren,
		comparisonParentSessionIds,
		attachedComparisonSessionIds,
	} = attachComparisonsToOriginatingSessions({
		children,
		inbox,
		comparisons,
		getSessionForChatResource,
		getComparisonForSession,
		hasFindPattern,
		matchesSearch: matchesSearch ? session => matchesSearch(session, searchContext) : undefined,
		sortComparisonChildren,
		renderSection,
		showEmptyDefaultGroups,
		someProviderSupportsQuickChats,
		groupDepths,
	});
	for (const session of sessions) {
		if (comparisonParentSessionIds.has(session.sessionId)) {
			nextNestedSessionResources.add(session.resource.toString());
		}
	}

	return {
		children: attachedChildren,
		navigationSections,
		filteredSessions: filtered,
		snapshot: {
			comparisonParticipantConnectorPositions,
			comparisonAttemptLabels,
			comparisonSectionIds,
			groupDepths,
			comparisonParentSessionIds,
			attachedComparisonSessionIds,
			topLevelOrder,
			moreFolderSectionIds: renderedMoreFolderSectionIds,
			hiddenGroupingSections,
			renderedPinnedHeaderIds: pinnedHeaders,
			nestedSessionResources: nextNestedSessionResources,
			hadInboxSessions: hasInboxSessions,
			inboxPlacements,
			renderValidUntil,
		},
		migratedCollapseStateKeys,
		triggers: {
			showArchivedByDefault: triggerShowArchivedByDefault,
			groupExternalSessions: triggerGroupExternalSessions,
		},
	};
}

function partitionMoreFolders(
	enabled: boolean,
	sections: readonly ISessionSection[],
	getSectionParentId: (sectionId: string) => string | undefined,
	isPinnedHeader: (sectionId: string) => boolean,
	comparisonGroupsBySectionId: ReadonlyMap<string, readonly ISessionGroup[]>,
	openWindowSourceFolder: URI | undefined,
	sectionOrder: Pick<ISessionSectionOrderService, 'isPromoted'>,
	revealedSessionIds: readonly string[],
	now: number,
): ReadonlySet<string> {
	const moreFolderSectionIds = new Set<string>();
	if (!enabled) {
		return moreFolderSectionIds;
	}
	const workspaceSections = sections.filter(s => isSessionGroupingSection(s.id) && getSectionParentId(s.id) === undefined && !isPinnedHeader(s.id));
	// With only two workspaces, hiding one behind a "+1 more" row saves no space.
	if (workspaceSections.length <= 2) {
		return moreFolderSectionIds;
	}
	const isRecent = (section: ISessionSection) =>
		section.sessions.some(s => s.updatedAt.get().getTime() >= now - FOUR_DAYS_MS);
	const isOpenWindow = (section: ISessionSection) =>
		!!openWindowSourceFolder && section.sessions.some(s => sessionMatchesFolder(s, openWindowSourceFolder));
	const meetsCriteria = (section: ISessionSection) => comparisonGroupsBySectionId.has(section.id) || isRecent(section) || isOpenWindow(section);

	const anyMeets = workspaceSections.some(meetsCriteria);
	let fallbackId: string | undefined;
	if (!anyMeets) {
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
		if (!meetsCriteria(section) && section.id !== fallbackId && !sectionOrder.isPromoted(section.id) && !section.sessions.some(session => revealedSessionIds.includes(session.sessionId))) {
			moreFolderSectionIds.add(section.id);
		}
	}
	return moreFolderSectionIds;
}

/** The Done section's rows: its done sessions and standalone done chats, most recently updated first. */
function toDoneSectionChildren(
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

function attachComparisonsToOriginatingSessions(options: {
	readonly children: IObjectTreeElement<SessionListItem>[];
	readonly inbox: boolean;
	readonly comparisons: readonly ISessionComparison[];
	readonly getSessionForChatResource: (chatResource: URI) => ISession | undefined;
	readonly getComparisonForSession: (resource: URI) => ISessionComparison | undefined;
	readonly hasFindPattern: boolean;
	readonly matchesSearch: ((session: ISession) => boolean) | undefined;
	readonly sortComparisonChildren: (children: IObjectTreeElement<SessionListItem>[]) => IObjectTreeElement<SessionListItem>[];
	readonly renderSection: (section: ISessionSection) => IObjectTreeElement<SessionListItem>;
	readonly showEmptyDefaultGroups: boolean;
	readonly someProviderSupportsQuickChats: boolean;
	readonly groupDepths: Map<string, number>;
}): {
	readonly children: IObjectTreeElement<SessionListItem>[];
	readonly comparisonParentSessionIds: ReadonlySet<string>;
	readonly attachedComparisonSessionIds: ReadonlySet<string>;
} {
	const comparisonParentSessionIds = new Set<string>();
	const attachedComparisonSessionIds = new Set<string>();
	// Inbox keeps comparisons in their own attention category, independently of their caller.
	if (options.inbox || !options.comparisons.some(comparison => comparison.originatingChatResource)) {
		return { children: options.children, comparisonParentSessionIds, attachedComparisonSessionIds };
	}
	const sessions = new Map<string, number>();
	const comparisonNodes = new Map<string, IObjectTreeElement<SessionListItem>>();
	const collect = (nodes: Iterable<IObjectTreeElement<SessionListItem>>, depth: number): void => {
		for (const node of nodes) {
			if (isSessionItem(node.element)) {
				sessions.set(node.element.sessionId, depth);
			} else if (isSessionGroupItem(node.element) && node.element.comparison) {
				comparisonNodes.set(node.element.group.id, node);
			}
			collect(node.children ?? [], depth + 1);
		}
	};
	collect(options.children, 0);
	const attachments = new Map<string, IObjectTreeElement<SessionListItem>[]>();
	const attachedGroupIds = new Set<string>();
	for (const comparison of options.comparisons) {
		const group = comparisonNodes.get(comparison.groupId);
		const caller = comparison.originatingChatResource && options.getSessionForChatResource(comparison.originatingChatResource);
		const parent = caller && sessions.get(caller.sessionId);
		if (!group || !isSessionGroupItem(group.element) || group.element.group.parentId !== undefined
			|| !caller || parent === undefined || caller.isArchived.get() || options.getComparisonForSession(caller.resource)
			|| options.hasFindPattern && options.matchesSearch && !options.matchesSearch(caller)) {
			continue;
		}
		const siblings = attachments.get(caller.sessionId) ?? [];
		siblings.push({ ...group, element: { ...group.element, depth: parent } });
		attachments.set(caller.sessionId, siblings);
		attachedGroupIds.add(comparison.groupId);
		comparisonParentSessionIds.add(caller.sessionId);
		for (const session of group.element.sessions) {
			attachedComparisonSessionIds.add(session.sessionId);
		}
		options.groupDepths.set(comparison.groupId, parent);
	}
	if (attachedGroupIds.size === 0) {
		return { children: options.children, comparisonParentSessionIds, attachedComparisonSessionIds };
	}
	const attach = (nodes: Iterable<IObjectTreeElement<SessionListItem>>): IObjectTreeElement<SessionListItem>[] => {
		const result: IObjectTreeElement<SessionListItem>[] = [];
		for (const node of nodes) {
			if (isSessionGroupItem(node.element) && attachedGroupIds.has(node.element.group.id)) {
				continue;
			}
			const nested = attach(node.children ?? []);
			const attachedComparisons = isSessionItem(node.element) ? attachments.get(node.element.sessionId) : undefined;
			if (attachedComparisons) {
				nested.push(...options.sortComparisonChildren(attachedComparisons));
			}
			if (isSessionSection(node.element) && nested.length === 0
				&& [...(node.children ?? [])].some(child => isSessionGroupItem(child.element) && attachedGroupIds.has(child.element.group.id))) {
				if (node.element.id === QUICK_CHATS_SECTION_ID
					&& options.showEmptyDefaultGroups
					&& options.someProviderSupportsQuickChats) {
					result.push(options.renderSection({ ...node.element, sessions: [] }));
				}
				continue;
			}
			result.push({ ...node, ...(attachedComparisons ? { collapsible: true } : {}), children: nested });
		}
		return result;
	};
	return { children: attach(options.children), comparisonParentSessionIds, attachedComparisonSessionIds };
}

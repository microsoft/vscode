/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SessionsGrouping, SessionsSorting, ISessionSection, ISessionRepository, ISessionShowMore } from './sessionsListCommon.js';
import { IReader } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { localize } from '../../../../../nls.js';
import { isSideChat } from '../sideChatPlacement.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ChatSessionArchiveActionWording, getChatSessionArchivedSectionLabel } from '../../../../../platform/chat/common/sessionArchiveActions.js';
import { ChatInteractivity, ChatOriginKind, getGitHubRepositoryOfUrl, getSessionFolderGitHubRepository, getUntitledSessionTitle, IChat, ISession, ISessionEnvironment, SessionStatus } from '../../../../services/sessions/common/session.js';
import { AgentSessionApprovalModel, IAgentSessionApprovalInfo } from '../../../chat/browser/agentSessions/agentSessionApprovalModel.js';
import { inheritableSessionTarget, ISessionsManagementService } from '../../common/sessionsManagement.js';
import { getSessionComparisonChat, getSessionComparisonHarnessDisplayLabel, getSessionComparisonParticipantsInDisplayOrder, ISessionComparison, SessionComparisonParticipantRole } from '../../common/sessionComparison.js';
import { compareSessionEnvironments, getSessionEnvironments } from './sessionsListFilters.js';
import { ISessionsProvidersService } from '../sessionsProvidersService.js';
import { InboxNotificationPriority } from '../../common/sessionAttentionService.js';
import { getSessionInboxPriority, getSessionInboxSection, SessionInboxSection, sessionInboxSections } from '../../common/sessionInbox.js';

export const NEW_SESSION_SECTION_ID = 'newSession';
export const AUTOMATIONS_SECTION_ID = 'automations';
export const CUSTOMIZATIONS_SECTION_ID = 'customizations';
/** Prefixes the rows of canvases pinned to the sidebar, which the Canvases section lists. */
export const PINNED_CANVAS_SECTION_PREFIX = 'pinnedCanvas:';
export const EXTERNAL_SESSIONS_SECTION_ID = 'external';
/** Ungrouped sessions sectioned by date share one sort order across these sections, in display order. */
export const DATE_SECTION_IDS: readonly string[] = ['recent', 'older'];

export function getChatTitle(chat: IChat, reader?: IReader): string {
	if (chat.status.read(reader) === SessionStatus.Untitled) {
		return getUntitledSessionTitle(false);
	}
	return chat.title.read(reader).trim() || localize('untitledChat', "Untitled Chat");
}

/**
 * The chats a session lists below its row: its peer chats, not its main chat, subagents or hidden chats, archived chats
 * only with `showArchived`, and its side chats only without `hideSideChats`, as while side chats show in the side pane
 * ({@link ISideChatPlacementService.inSidePane}).
 */
export function getSessionListChats(session: ISession, reader?: IReader, showArchived = false, hideSideChats = false): readonly IChat[] {
	const mainChat = session.mainChat.read(reader);
	return session.chats.read(reader).filter(chat =>
		!isEqual(chat.resource, mainChat.resource) &&
		chat.origin?.kind !== ChatOriginKind.Tool &&
		!(hideSideChats && isSideChat(chat)) &&
		(!chat.isArchived.read(reader) || showArchived) &&
		chat.interactivity.read(reader) !== ChatInteractivity.Hidden
	);
}

export function isShortcutSection(sectionId: string): boolean {
	return sectionId === NEW_SESSION_SECTION_ID || sectionId === AUTOMATIONS_SECTION_ID || sectionId === CUSTOMIZATIONS_SECTION_ID || isPinnedCanvasSection(sectionId);
}

function isPinnedCanvasSection(sectionId: string): boolean {
	return sectionId.startsWith(PINNED_CANVAS_SECTION_PREFIX);
}

export const REPOSITORY_SECTION_PREFIX = 'repository:';
export const ENVIRONMENT_SECTION_PREFIX = 'environment:';

/** Whether a section lists one workspace, repository, or environment and can be reordered among custom groups. */
export function isSessionGroupingSection(sectionId: string): boolean {
	return sectionId.startsWith('workspace:') || sectionId.startsWith(REPOSITORY_SECTION_PREFIX) || sectionId.startsWith(ENVIRONMENT_SECTION_PREFIX);
}

/** The {@link SessionSectionTypeContext} value of a section: its grouping kind, or its id for the fixed sections. */
export function getSessionSectionType(sectionId: string): string {
	return sectionId.startsWith('workspace:') ? 'workspace' : sectionId.startsWith(REPOSITORY_SECTION_PREFIX) ? 'repository' : sectionId.startsWith(ENVIRONMENT_SECTION_PREFIX) ? 'environment' : sectionId;
}

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
export function getSessionRowApproval(approvalModel: AgentSessionApprovalModel, session: ISession, reader: IReader | undefined, aggregate: boolean): IAgentSessionApprovalInfo | undefined {
	return aggregate ? getFirstApprovalAcrossChats(approvalModel, session, reader) : getMainChatApproval(approvalModel, session, reader);
}

//#endregion

//#region Folder Matching

export function sessionMatchesFolder(session: ISession, folder: URI): boolean {
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

export function sortSessionListChats(chats: readonly IChat[], sorting: SessionsSorting): readonly IChat[] {
	if (sorting === SessionsSorting.Created) {
		return chats;
	}
	return [...chats].sort((a, b) =>
		(b.updatedAt.get()?.getTime() ?? b.createdAt.getTime()) -
		(a.updatedAt.get()?.getTime() ?? a.createdAt.getTime())
	);
}

export function sortComparisonGroupMembers(comparison: ISessionComparison, sessions: ISession[], sorting: SessionsSorting, getSortKey: (session: ISession, sorting: SessionsSorting) => number): ISession[] {
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

export function isComparisonLaunchPending(comparison: ISessionComparison): boolean {
	return comparison.launching === true;
}

export function getComparisonGroupConfiguration(comparison: ISessionComparison, labelService: ILabelService): string {
	const lines = [localize('comparisonGroup.originalConfiguration', "Original comparison settings")];
	if (comparison.workspace) {
		lines.push(localize('comparisonGroup.repository', "Repository: {0}", labelService.getUriLabel(comparison.workspace)));
		lines.push(localize('comparisonGroup.isolation', "Isolation: Separate worktrees"));
		if (comparison.branch) {
			lines.push(localize('comparisonGroup.branch', "Base branch: {0}", comparison.branch));
		}
	} else {
		lines.push(localize('comparisonGroup.noWorkspace', "Workspace: None"));
	}
	const attempts = comparison.participants.filter(participant => participant.role === SessionComparisonParticipantRole.Attempt);
	for (const [index, attempt] of attempts.entries()) {
		lines.push(localize('comparisonGroup.attemptConfiguration', "Attempt {0}: {1}", index + 1, getSessionComparisonHarnessDisplayLabel(attempt.harness)));
	}
	const judge = comparison.judgeHarness ?? comparison.participants.find(participant => participant.role === SessionComparisonParticipantRole.Judge)?.harness;
	const synthesizer = comparison.synthesisHarness ?? comparison.participants.find(participant => participant.role === SessionComparisonParticipantRole.Synthesis)?.harness;
	lines.push(judge
		? localize('comparisonGroup.judgeConfiguration', "Judge: {0}", getSessionComparisonHarnessDisplayLabel(judge))
		: localize('comparisonGroup.noJudge', "Judge: None"));
	lines.push(synthesizer
		? localize('comparisonGroup.synthesizerConfiguration', "Synthesizer: {0}", getSessionComparisonHarnessDisplayLabel(synthesizer))
		: localize('comparisonGroup.noSynthesizer', "Synthesizer: None"));
	return lines.join('\n');
}

export function getComparisonGroupSummary(comparison: ISessionComparison, sessions: readonly ISession[], reader?: IReader): string {
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
		const session = sessions.find(session => isEqual(session.resource, participant.sessionResource));
		return participant.chatResource ? getSessionComparisonChat(participant, session, reader)?.status.read(reader) : session?.status.read(reader);
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
		const session = sessions.find(session => isEqual(session.resource, judge.sessionResource));
		const judgeStatus = judge.chatResource ? getSessionComparisonChat(judge, session, reader)?.status.read(reader) : session?.status.read(reader);
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
		/** Sessions listed even when the cap hides them, after the sessions the cap keeps. */
		readonly revealSessionIds?: readonly string[];
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
	if (options.revealSessionIds?.length) {
		const revealSessionIds = new Set(options.revealSessionIds);
		visibleSessions.push(...sessions.slice(limit).filter(session => revealSessionIds.has(session.sessionId)));
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

/**
 * Whether the grouping lists quick chats in the dedicated "Chats" section. Only
 * workspace and repository grouping do; other groupings list quick chats with
 * the other sessions. A list without a Chats section (`quickChatsSection`
 * false), such as a scoped list, has it under no grouping.
 */
export function groupingHasQuickChatsSection(grouping: SessionsGrouping, quickChatsInTimeGrouping = false, quickChatsSection = true): boolean {
	return quickChatsSection && (grouping === SessionsGrouping.Workspace || grouping === SessionsGrouping.Repository
		|| (quickChatsInTimeGrouping && grouping === SessionsGrouping.Date));
}

/** Whether a session is associated with an automation run. */
export function isAutomationSession(session: ISession): boolean {
	return session.isAutomation?.get() ?? false;
}

/** Places sessions in the sections of the given grouping. Callers pass only the sessions the list includes. */
export function groupSessionsForList(
	sessions: ISession[],
	grouping: SessionsGrouping,
	sorting: SessionsSorting,
	isSessionPinned: (session: ISession) => boolean,
	getSortKey?: (session: ISession, sorting: SessionsSorting) => number,
	archivedSectionLabel: string = getChatSessionArchivedSectionLabel(ChatSessionArchiveActionWording.MarkAsDone),
	groupExternalSessions = false,
	normalizedEnvironments: readonly ISessionEnvironment[] = getSessionEnvironments([]),
	getInboxSection: (session: ISession) => SessionInboxSection = getSessionInboxSection,
	getInboxPriority: (session: ISession) => InboxNotificationPriority = getSessionInboxPriority,
	quickChatsInTimeGrouping = false,
	quickChatsSection = true,
): ISessionSection[] {
	const sorted = sortSessions(sessions, sorting, getSortKey);

	// Archived and explicit pins take precedence over the automatic buckets.
	const pinned: ISession[] = [];
	const archived: ISession[] = [];
	const external: ISession[] = [];
	const quickChats: ISession[] = [];
	const regular: ISession[] = [];
	const hasQuickChatsSection = groupingHasQuickChatsSection(grouping, quickChatsInTimeGrouping, quickChatsSection);
	for (const session of sorted) {
		if (session.isArchived.get()) {
			archived.push(session);
		} else if (isSessionPinned(session)) {
			pinned.push(session);
		} else if (grouping !== SessionsGrouping.Inbox && groupExternalSessions && session.isExternal?.get()) {
			external.push(session);
		} else if (hasQuickChatsSection && isQuickChatSession(session)) {
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
	// the workspace/repository groups).
	if (quickChats.length > 0) {
		sections.push({ id: QUICK_CHATS_SECTION_ID, label: localize('chatsSection', "Chats"), sessions: quickChats });
	}

	sections.push(...(grouping === SessionsGrouping.Inbox
		? groupByInboxSection(regular, sorting, getInboxSection, getInboxPriority)
		: grouping === SessionsGrouping.Workspace
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
		// Done cannot be reordered and lists the most recently updated first whatever the sorting, ignoring manual sort keys from
		// before archiving. Providers that count archiving as an update thereby list the most recently archived first.
		sections.push({ id: 'archived', label: archivedSectionLabel, sessions: sortSessions(archived, SessionsSorting.Updated) });
	}

	return sections;
}

/** Buckets sessions into the Inbox sections the list renders, classifying each session once. */
function groupByInboxSection(sessions: ISession[], sorting: SessionsSorting, getInboxSection: (session: ISession) => SessionInboxSection, getInboxPriority: (session: ISession) => InboxNotificationPriority): ISessionSection[] {
	const buckets = new Map<SessionInboxSection, ISession[]>(sessionInboxSections.map(id => [id, []]));
	const priorities = new Map<ISession, InboxNotificationPriority>();
	for (const session of sessions) {
		const bucket = buckets.get(getInboxSection(session));
		if (bucket) {
			bucket.push(session);
			priorities.set(session, getInboxPriority(session));
		}
	}
	return sessionInboxSections.map(id => ({
		id,
		label: getSessionInboxSectionLabel(id),
		sessions: sortSessions(buckets.get(id)!, sorting).sort((a, b) => priorities.get(a)! - priorities.get(b)!),
	}));
}

/** Where a session renders in Inbox mode, plus the inputs that decide its order there. */
export interface IInboxPlacement {
	readonly section: SessionInboxSection;
	readonly priority: InboxNotificationPriority;
	readonly updatedAt: number;
}

export function inboxPlacementsEqual(a: ReadonlyMap<string, IInboxPlacement>, b: ReadonlyMap<string, IInboxPlacement>): boolean {
	if (a.size !== b.size) {
		return false;
	}
	for (const [id, placement] of a) {
		const other = b.get(id);
		if (!other || other.section !== placement.section || other.priority !== placement.priority || other.updatedAt !== placement.updatedAt) {
			return false;
		}
	}
	return true;
}

function getSessionInboxSectionLabel(section: typeof sessionInboxSections[number]): string {
	switch (section) {
		case SessionInboxSection.ReadyForYou: return localize('inboxSection', "Inbox");
		case SessionInboxSection.Working: return localize('inboxWorking', "Working");
		case SessionInboxSection.OnHold: return localize('inboxOnHold', "On hold");
		case SessionInboxSection.Acknowledged: return localize('inboxAcknowledged', "Acknowledged");
	}
}

/** The workspace group label a session belongs to (matches {@link groupByWorkspace}). */
export function sessionWorkspaceLabel(session: ISession): string {
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
export function isGroupingSpecificCollapseStateId(id: string): boolean {
	return id.startsWith('workspace:') || id.startsWith(ENVIRONMENT_SECTION_PREFIX) || id === 'recent' || id === 'older';
}

function workspaceCollapseStateId(sessions: readonly ISession[]): string | undefined {
	const resource = sessions[0]?.workspace.get()?.uri.toString();
	return resource && sessions.every(session => session.workspace.get()?.uri.toString() === resource)
		? `workspace:${resource}`
		: undefined;
}

/** The GitHub repository of a session's primary folder, as {@link getSessionFolderGitHubRepository} describes. */
export function getSessionRepository(session: ISession): ISessionRepository | undefined {
	const repository = getSessionFolderGitHubRepository(session.workspace.get()?.folders[0]);
	return repository && { owner: repository.owner, name: repository.repo };
}

export function getRepositorySectionId(repository: ISessionRepository): string {
	// GitHub matches owner and repository names case-insensitively.
	return `${REPOSITORY_SECTION_PREFIX}${repository.owner.toLowerCase()}/${repository.name.toLowerCase()}`;
}

/** The grouping section a session renders in when nothing with higher precedence places it. */
export function getSessionGroupingSectionId(session: ISession, grouping: SessionsGrouping): string {
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
export function labelRepositorySections(sections: ISessionSection[]): void {
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

/** Whether a session has a reusable workspace or an available provider-supplied creation workspace. */
export function canStartNewSessionLike(session: ISession, sessionsManagementService: ISessionsManagementService): boolean {
	const folderUri = session.workspace.get()?.folders[0]?.root;
	return !getGitHubRepositoryOfUrl(folderUri) || inheritableSessionTarget(sessionsManagementService, session, folderUri).folderUri !== undefined;
}

/**
 * The most recently created session of each available environment among `sessions`, in
 * Environment filter order. New sessions in a repository section start in their workspaces.
 */
export function getNewSessionSources(sessions: readonly ISession[], sessionsProvidersService: ISessionsProvidersService, sessionsManagementService: ISessionsManagementService): INewSessionSource[] {
	const sources = new Map<string, INewSessionSource>();
	for (const session of sessions) {
		if (!canStartNewSessionLike(session, sessionsManagementService)) {
			continue;
		}
		const environment = sessionsProvidersService.getProvider(session.providerId, session.sessionId)?.environment;
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
export const RECENTLY_UPDATED_SESSION_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export function groupByDate(sessions: ISession[], sorting: SessionsSorting, getSortKey?: (session: ISession, sorting: SessionsSorting) => number): ISessionSection[] {
	const key = getSortKey ?? defaultSortKey;
	const [recent, older] = partitionByDate(sessions, sorting, session => key(session, sorting), session => session.updatedAt.get().getTime());
	const sections: ISessionSection[] = [];
	if (recent.length > 0) {
		sections.push({ id: 'recent', label: localize('recent', "Recent"), sessions: recent });
	}
	if (older.length > 0) {
		sections.push({ id: 'older', label: localize('older', "Older"), sessions: older });
	}
	return sections;
}

export function partitionByDate<T>(entries: readonly T[], sorting: SessionsSorting, getSortKey: (entry: T) => number, getUpdatedTime: (entry: T) => number): [T[], T[]] {
	const now = new Date();
	const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
	const startOfWeek = startOfToday - 7 * 86_400_000;
	const recentlyUpdatedThreshold = now.getTime() - RECENTLY_UPDATED_SESSION_THRESHOLD_MS;

	const recent: T[] = [];
	const older: T[] = [];

	for (const session of entries) {
		const time = getSortKey(session);
		const wasRecentlyUpdated = sorting === SessionsSorting.Created && getUpdatedTime(session) >= recentlyUpdatedThreshold;
		const isWithinRecentLimit = recent.length < RECENT_SESSIONS_LIMIT && time >= startOfWeek;
		const isWithinUpdatedRecentLimit = recent.length < RECENT_SESSIONS_LIMIT_WITH_UPDATES && wasRecentlyUpdated;

		if (isWithinRecentLimit || isWithinUpdatedRecentLimit) {
			recent.push(session);
		} else {
			older.push(session);
		}
	}

	return [recent, older];
}

//#endregion

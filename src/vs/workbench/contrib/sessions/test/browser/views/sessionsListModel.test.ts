/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IObjectTreeElement, ObjectTreeElementCollapseState } from '../../../../../../base/browser/ui/tree/tree.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { extUri } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ChatInteractivity, IChat, ISession, ISessionWorkspace, SessionStatus } from '../../../../../services/sessions/common/session.js';
import { ISessionGroup, SessionGroupTree } from '../../../browser/sessionGroupsService.js';
import { isSessionGroupItem, isSessionItem, isSessionPlaceholder, isSessionSection, isSessionShowMore, SessionListItem, SessionsGrouping, SessionsSorting } from '../../../browser/views/sessionsListCommon.js';
import { GROUPS_SECTION_ID, QUICK_CHATS_SECTION_ID, RECENTLY_UPDATED_SESSION_THRESHOLD_MS, WORKSPACES_SECTION_ID } from '../../../browser/views/sessionsListHelpers.js';
import { buildSessionsListModel, computeRenderValidUntil, EMPTY_SESSIONS_LIST_RENDER_SNAPSHOT, FOUR_DAYS_MS, ISessionsListModelGroups, ISessionsListModelInput, SCOPE_EMPTY_PLACEHOLDER_ID } from '../../../browser/views/sessionsListModel.js';
import { IInboxSessionAttention, InboxNotificationPriority, InboxTab } from '../../../common/sessionAttentionService.js';
import { ISessionComparison, SessionComparisonParticipantRole } from '../../../common/sessionComparison.js';
import { SessionInboxSection } from '../../../common/sessionInbox.js';

suite('Sessions - SessionsListModel', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const NOW = new Date(2026, 5, 15, 12, 0, 0).getTime();

	function createSession(id: string, opts?: {
		readonly title?: string;
		readonly workspaceLabel?: string;
		readonly workspaceUri?: URI;
		readonly createdAt?: number;
		readonly updatedAt?: number;
		readonly archived?: boolean;
		readonly external?: boolean;
		readonly quickChat?: boolean;
		readonly status?: SessionStatus;
		readonly isRead?: boolean;
		readonly extraChats?: readonly IChat[];
	}): ISession {
		const resource = URI.parse(`session://test/${id}`);
		const createdAt = new Date(opts?.createdAt ?? NOW - 60_000);
		const updatedAt = new Date(opts?.updatedAt ?? NOW - 60_000);
		const mainChat = upcastPartial<IChat>({
			resource: URI.parse(`chat://test/${id}/main`),
			title: constObservable(opts?.title ?? id),
			createdAt,
			updatedAt: constObservable(updatedAt),
			status: constObservable(opts?.status ?? SessionStatus.Completed),
			isArchived: constObservable(opts?.archived ?? false),
			isRead: constObservable(opts?.isRead ?? true),
			interactivity: constObservable(ChatInteractivity.Full),
		});
		const workspaceUri = opts?.workspaceUri ?? (opts?.workspaceLabel ? URI.parse(`file:///workspaces/${opts.workspaceLabel}`) : undefined);
		const workspace: ISessionWorkspace | undefined = opts?.workspaceLabel && workspaceUri
			? upcastPartial<ISessionWorkspace>({
				label: opts.workspaceLabel,
				uri: workspaceUri,
				folders: [{ root: workspaceUri, workingDirectory: workspaceUri, name: opts.workspaceLabel, description: undefined }],
			})
			: undefined;
		return upcastPartial<ISession>({
			sessionId: id,
			resource,
			providerId: 'test-provider',
			sessionType: 'local',
			environment: 'local',
			title: constObservable(opts?.title ?? id),
			createdAt,
			updatedAt: constObservable(updatedAt),
			status: constObservable(opts?.status ?? SessionStatus.Completed),
			isArchived: constObservable(opts?.archived ?? false),
			isRead: constObservable(opts?.isRead ?? true),
			isExternal: constObservable(opts?.external ?? false),
			isQuickChat: constObservable(opts?.quickChat ?? false),
			workspace: constObservable(workspace),
			mainChat: constObservable(mainChat),
			chats: constObservable([mainChat, ...(opts?.extraChats ?? [])]),
		});
	}

	function createGroups(groups: readonly ISessionGroup[] = [], sessionMemberships = new Map<string, string>(), sectionMemberships = new Map<string, string>()): ISessionsListModelGroups {
		const byId = new Map(groups.map(group => [group.id, group]));
		const tree = new SessionGroupTree(groups);
		return {
			getTree: () => tree,
			getGroup: id => byId.get(id),
			getGroupOfSession: sessionId => sessionMemberships.get(sessionId),
			getGroupOfSection: sectionId => sectionMemberships.get(sectionId),
			getChildIds: groupId => [
				...tree.getSubgroups(groupId).map(group => group.id),
				...[...sectionMemberships].filter(([, parent]) => parent === groupId).map(([sectionId]) => sectionId),
			],
			getSessionIdsInGroup: groupId => [...sessionMemberships].filter(([, id]) => id === groupId).map(([sessionId]) => sessionId),
			getSectionIdsInGroup: groupId => [...sectionMemberships].filter(([, id]) => id === groupId).map(([sectionId]) => sectionId),
		};
	}

	function createInput(overrides: Partial<ISessionsListModelInput> = {}): ISessionsListModelInput {
		const sessions = overrides.sessions ?? [];
		const byResource = new Map(sessions.map(session => [session.resource.toString(), session]));
		const byChatResource = new Map(sessions.flatMap(session => session.chats.get().map(chat => [chat.resource.toString(), session] as const)));
		return {
			now: NOW,
			sessions,
			previousSnapshot: EMPTY_SESSIONS_LIST_RENDER_SNAPSHOT,
			grouping: SessionsGrouping.Workspace,
			sorting: SessionsSorting.Updated,
			separateGroupsAndWorkspaces: false,
			listWorkspaces: undefined,
			scoped: false,
			hasSessionScope: false,
			scopeBar: false,
			listsQuickChats: true,
			quickChatsInTimeGrouping: false,
			offersWorktreeFilter: true,
			excludeArchived: true,
			excludeArchivedIsDefault: false,
			archivedSessionsAvailable: false,
			archivedSectionLabel: 'Done',
			hideSideChats: false,
			groupExternalSessions: false,
			showEmptyDefaultGroups: false,
			someProviderSupportsQuickChats: false,
			workspaceGroupCapped: true,
			sessionGroupLimit: 5,
			expandedMoreFolders: false,
			openWindowSourceFolder: undefined,
			editingGroupId: undefined,
			activeSession: undefined,
			onboardingSession: undefined,
			scopedProviderIds: undefined,
			matchesFilter: () => true,
			matchesInboxScope: () => true,
			hasInboxScope: false,
			scheduledOnly: false,
			scheduledSessionResources: undefined,
			draftsLabel: 'Drafts',
			pendingDraftItems: [],
			pendingSessionMoves: new Map(),
			showNavigationShortcuts: false,
			showAutomations: false,
			showCustomizations: false,
			showsCanvasesSection: false,
			canvasesSection: undefined,
			pinnedCanvasSections: [],
			isSessionInScope: () => true,
			isSessionPinned: () => false,
			pinnedSectionIds: [],
			headerAliases: new Map(),
			getSortKey: (entry, sorting) => sorting === SessionsSorting.Updated ? entry.updatedAt.get().getTime() : entry.createdAt.getTime(),
			groups: createGroups(),
			sectionOrder: { resolveOrder: ids => [...ids], isPromoted: () => false },
			comparisons: [],
			getComparisonForSession: () => undefined,
			getSessionByResource: resource => byResource.get(resource.toString()),
			getSessionForChatResource: chatResource => byChatResource.get(chatResource.toString()),
			getComparisonConfiguration: () => '',
			getWorkspaceLabel: uri => uri.path.split('/').at(-1) ?? uri.toString(),
			environments: [],
			getProviderEnvironmentId: () => undefined,
			inboxAttention: new Map(),
			getInboxState: () => undefined,
			savedSectionCollapseState: new Map(),
			collapsedSessionResources: new Set(),
			sessionGroupExpansion: new Map(),
			hasFindPattern: false,
			expandForSearch: false,
			collapseStateToRestore: undefined,
			matchesSearch: undefined,
			extUri,
			...overrides,
		};
	}

	function describeNodes(nodes: readonly IObjectTreeElement<SessionListItem>[]): unknown[] {
		return nodes.map(node => {
			const el = node.element;
			const children = node.children ? describeNodes([...node.children]) : undefined;
			if (isSessionSection(el)) {
				return { section: el.id, children };
			}
			if (isSessionGroupItem(el)) {
				return { group: el.group.id, depth: el.depth, ...(el.comparison ? { comparison: el.comparison.id } : {}), children };
			}
			if (isSessionShowMore(el)) {
				return { showMore: el.kind, mode: el.mode, remaining: el.remainingCount };
			}
			if (isSessionPlaceholder(el)) {
				return { placeholder: el.sectionId };
			}
			if (isSessionItem(el)) {
				return children?.length ? { session: el.sessionId, children } : { session: el.sessionId };
			}
			return { other: true };
		});
	}

	test('caps older workspace sections into "+N more" and populates snapshot metadata without DOM', () => {
		const recentA = createSession('a1', { workspaceLabel: 'Alpha', updatedAt: NOW - 10_000 });
		const oldB = createSession('b1', { workspaceLabel: 'Beta', updatedAt: NOW - FOUR_DAYS_MS - 10_000 });
		const oldC = createSession('c1', { workspaceLabel: 'Gamma', updatedAt: NOW - FOUR_DAYS_MS - 20_000 });

		const result = buildSessionsListModel(createInput({
			sessions: [recentA, oldB, oldC],
		}));

		assert.deepStrictEqual({
			tree: describeNodes(result.children),
			topLevelOrder: result.snapshot.topLevelOrder,
			moreFolders: [...result.snapshot.moreFolderSectionIds],
			hiddenSections: result.snapshot.hiddenGroupingSections.map(s => s.id),
		}, {
			tree: [
				{ section: 'workspace:Alpha', children: [{ session: 'a1' }] },
				{ showMore: 'folders', mode: 'more', remaining: 2 },
			],
			topLevelOrder: ['workspace:Alpha'],
			moreFolders: ['workspace:Beta', 'workspace:Gamma'],
			hiddenSections: ['workspace:Beta', 'workspace:Gamma'],
		});
	});

	test('builds Date grouping with custom groups and computes next time boundary', () => {
		const recent = createSession('r1', { updatedAt: NOW - 1_000 });
		const older = createSession('o1', { createdAt: NOW - 20 * 86_400_000, updatedAt: NOW - 20 * 86_400_000 });
		const groupedUpdatedAt = NOW - 20 * 3_600_000;
		const grouped = createSession('g1', { updatedAt: groupedUpdatedAt });
		const group: ISessionGroup = { id: 'grp1', name: 'Focus', createdAt: NOW };

		const result = buildSessionsListModel(createInput({
			grouping: SessionsGrouping.Date,
			sessions: [recent, older, grouped],
			groups: createGroups([group], new Map([['g1', 'grp1']])),
		}));

		const expectedBoundary = computeRenderValidUntil([recent, older, grouped], NOW);
		assert.deepStrictEqual({
			tree: describeNodes(result.children),
			topLevelOrder: result.snapshot.topLevelOrder,
			groupDepth: result.snapshot.groupDepths.get('grp1'),
			validUntilIsRecentThreshold: result.snapshot.renderValidUntil === expectedBoundary && expectedBoundary === groupedUpdatedAt + RECENTLY_UPDATED_SESSION_THRESHOLD_MS + 1,
		}, {
			tree: [
				{ group: 'grp1', depth: 0, children: [{ session: 'g1' }] },
				{ section: 'recent', children: [{ session: 'r1' }] },
				{ section: 'older', children: [{ session: 'o1' }] },
			],
			topLevelOrder: ['group:grp1', 'recent', 'older'],
			groupDepth: 0,
			validUntilIsRecentThreshold: true,
		});
	});

	test('builds Inbox grouping with placements and collapses Working when ReadyForYou populates', () => {
		const working = createSession('w1', { status: SessionStatus.InProgress, updatedAt: NOW - 1_000 });
		const ready = createSession('r1', { status: SessionStatus.NeedsInput, updatedAt: NOW - 500 });
		const attention = new Map<string, IInboxSessionAttention>([
			['r1', { tab: InboxTab.ReadyForYou, priority: InboxNotificationPriority.Now, notificationIds: ['n1'], isHistoricalCompletion: false }],
			['w1', { tab: InboxTab.Working, priority: InboxNotificationPriority.Later, notificationIds: [], isHistoricalCompletion: false }],
		]);

		const emptyInbox = buildSessionsListModel(createInput({
			grouping: SessionsGrouping.Inbox,
			sessions: [working],
			inboxAttention: attention,
		}));

		const populatedInbox = buildSessionsListModel(createInput({
			grouping: SessionsGrouping.Inbox,
			sessions: [working, ready],
			previousSnapshot: emptyInbox.snapshot,
			inboxAttention: attention,
		}));

		const workingNode = populatedInbox.children.find(child => isSessionSection(child.element) && child.element.id === SessionInboxSection.Working);
		assert.deepStrictEqual({
			emptyTree: describeNodes(emptyInbox.children),
			emptyHadInbox: emptyInbox.snapshot.hadInboxSessions,
			populatedTree: describeNodes(populatedInbox.children),
			populatedHadInbox: populatedInbox.snapshot.hadInboxSessions,
			workingCollapsed: workingNode?.collapsed,
			readySection: populatedInbox.snapshot.inboxPlacements?.get('r1')?.section,
		}, {
			emptyTree: [
				{ section: SessionInboxSection.ReadyForYou, children: [{ placeholder: SessionInboxSection.ReadyForYou }] },
				{ section: SessionInboxSection.Working, children: [{ session: 'w1' }] },
			],
			emptyHadInbox: false,
			populatedTree: [
				{ section: SessionInboxSection.ReadyForYou, children: [{ session: 'r1' }] },
				{ section: SessionInboxSection.Working, children: [{ session: 'w1' }] },
			],
			populatedHadInbox: true,
			workingCollapsed: ObjectTreeElementCollapseState.Collapsed,
			readySection: SessionInboxSection.ReadyForYou,
		});
	});

	test('reports legacy collapse migrations and experiment triggers without mutating input state', () => {
		const archived = createSession('arch', { workspaceLabel: 'Repo', archived: true });
		const external = createSession('ext', { workspaceLabel: 'Repo', external: true });
		const savedCollapse = new Map<string, boolean>([['workspace:Repo', true]]);

		const result = buildSessionsListModel(createInput({
			sessions: [archived, external],
			excludeArchived: true,
			excludeArchivedIsDefault: true,
			savedSectionCollapseState: savedCollapse,
		}));

		assert.deepStrictEqual({
			inputUnchanged: [...savedCollapse.entries()],
			migrations: result.migratedCollapseStateKeys,
			triggers: result.triggers,
		}, {
			inputUnchanged: [['workspace:Repo', true]],
			migrations: [{ from: 'workspace:Repo', to: 'workspace:file:///workspaces/Repo', collapsed: true }],
			triggers: { showArchivedByDefault: true, groupExternalSessions: true },
		});
	});

	test('attaches comparison groups to their originating session and records snapshot maps', () => {
		const caller = createSession('caller', { workspaceLabel: 'Repo', updatedAt: NOW - 5_000 });
		const attempt1 = createSession('att1', { workspaceLabel: 'Repo', updatedAt: NOW - 2_000 });
		const attempt2 = createSession('att2', { workspaceLabel: 'Repo', updatedAt: NOW - 1_000 });
		const cmpGroup: ISessionGroup = { id: 'cmp-group', name: 'Compare', createdAt: NOW - 3_000 };
		const comparison: ISessionComparison = {
			id: 'cmp-1',
			groupId: 'cmp-group',
			title: 'Compare models',
			prompt: 'test',
			createdAt: NOW - 3_000,
			workspace: URI.parse('file:///workspaces/Repo'),
			originatingChatResource: caller.mainChat.get().resource,
			participants: [
				{ id: 'p1', role: SessionComparisonParticipantRole.Attempt, sessionResource: attempt1.resource, harness: { providerId: 'p1', sessionTypeId: 't1', label: 'Harness', modelId: 'm1', modelLabel: 'Model A' } },
				{ id: 'p2', role: SessionComparisonParticipantRole.Attempt, sessionResource: attempt2.resource, harness: { providerId: 'p1', sessionTypeId: 't1', label: 'Harness', modelId: 'm2', modelLabel: 'Model B' } },
			],
		};

		const result = buildSessionsListModel(createInput({
			sessions: [caller, attempt1, attempt2],
			groups: createGroups([cmpGroup], new Map([['att1', 'cmp-group'], ['att2', 'cmp-group']])),
			comparisons: [comparison],
			getComparisonForSession: resource => resource.toString() === attempt1.resource.toString() || resource.toString() === attempt2.resource.toString() ? comparison : undefined,
		}));

		assert.deepStrictEqual({
			tree: describeNodes(result.children),
			parents: [...result.snapshot.comparisonParentSessionIds],
			attached: [...result.snapshot.attachedComparisonSessionIds],
			nested: [...result.snapshot.nestedSessionResources],
			connectors: [...result.snapshot.comparisonParticipantConnectorPositions.entries()],
			labels: [...result.snapshot.comparisonAttemptLabels.entries()],
		}, {
			tree: [
				{
					section: 'workspace:Repo',
					children: [
						{
							session: 'caller',
							children: [
								{
									group: 'cmp-group',
									depth: 1,
									comparison: 'cmp-1',
									children: [
										{ session: 'att1' },
										{ session: 'att2' },
									],
								},
							],
						},
					],
				},
			],
			parents: ['caller'],
			attached: ['att1', 'att2'],
			nested: [caller.resource.toString()],
			connectors: [['att1', 'middle'], ['att2', 'last']],
			labels: [['att1', 'Model A'], ['att2', 'Model B']],
		});
	});

	test('applies scopeBar and list-side session scope consistently across filtering, quick chats, and empty placeholder', () => {
		const here = createSession('here', { workspaceLabel: 'Repo', updatedAt: NOW - 2_000 });
		const other = createSession('other', { workspaceLabel: 'Other', updatedAt: NOW - 1_000 });
		const quick = createSession('quick', { quickChat: true, updatedAt: NOW - 500 });
		const observedScopedByBar: boolean[] = [];

		const barQuickOnly = buildSessionsListModel(createInput({
			grouping: SessionsGrouping.Workspace,
			sessions: [here, other, quick],
			scoped: true,
			scopeBar: true,
			activeSession: other,
			isSessionInScope: session => session.sessionId === 'quick',
			matchesFilter: (_session, scopedByBar) => {
				observedScopedByBar.push(scopedByBar);
				return true;
			},
			matchesInboxScope: session => session.sessionId === 'quick',
		}));

		const emptySessionScope = buildSessionsListModel(createInput({
			grouping: SessionsGrouping.Date,
			sessions: [here],
			hasSessionScope: true,
			isSessionInScope: () => false,
		}));

		assert.deepStrictEqual({
			barTree: describeNodes(barQuickOnly.children),
			scopedByBar: observedScopedByBar,
			emptyTree: describeNodes(emptySessionScope.children),
		}, {
			barTree: [{ section: QUICK_CHATS_SECTION_ID, children: [{ session: 'quick' }] }],
			scopedByBar: [true],
			emptyTree: [{ placeholder: SCOPE_EMPTY_PLACEHOLDER_ID }],
		});
	});

	test('renders pinned groups and workspace sections at the top of Pinned while preserving topLevelOrder', () => {
		const grouped = createSession('g1', { workspaceLabel: 'Alpha', updatedAt: NOW - 2_000 });
		const folderSession = createSession('f1', { workspaceLabel: 'Beta', updatedAt: NOW - 1_000 });
		const group: ISessionGroup = { id: 'grp1', name: 'Focus', createdAt: NOW };

		const result = buildSessionsListModel(createInput({
			grouping: SessionsGrouping.Workspace,
			sessions: [grouped, folderSession],
			groups: createGroups([group], new Map([['g1', 'grp1']])),
			pinnedSectionIds: ['group:grp1', 'workspace:Beta'],
		}));

		const pinnedNode = result.children.find(child => isSessionSection(child.element) && child.element.id === 'pinned');
		const pinnedSection = pinnedNode && isSessionSection(pinnedNode.element) ? pinnedNode.element : undefined;

		assert.deepStrictEqual({
			tree: describeNodes(result.children),
			topLevelOrder: result.snapshot.topLevelOrder,
			renderedPinned: [...result.snapshot.renderedPinnedHeaderIds],
			summaryIds: pinnedSection?.summarySessions?.map(s => s.sessionId),
		}, {
			tree: [
				{
					section: 'pinned',
					children: [
						{ group: 'grp1', depth: 1, children: [{ session: 'g1' }] },
						{ section: 'workspace:Beta', children: [{ session: 'f1' }] },
					],
				},
			],
			topLevelOrder: ['group:grp1', 'workspace:Beta'],
			renderedPinned: ['group:grp1', 'workspace:Beta'],
			summaryIds: ['g1', 'f1'],
		});
	});

	test('separates Groups and Workspaces sections with muted/spaced header metadata', () => {
		const grouped = createSession('g1', { workspaceLabel: 'Alpha', updatedAt: NOW - 2_000 });
		const inWorkspace = createSession('w1', { workspaceLabel: 'Alpha', updatedAt: NOW - 1_000 });
		const group: ISessionGroup = { id: 'grp1', name: 'Focus', createdAt: NOW };
		const emptyWsUri = URI.parse('file:///workspaces/EmptyWs');
		const alphaWsUri = URI.parse('file:///workspaces/Alpha');

		const result = buildSessionsListModel(createInput({
			grouping: SessionsGrouping.Workspace,
			separateGroupsAndWorkspaces: true,
			listWorkspaces: {
				getWorkspace: uri => uri.toString() === emptyWsUri.toString()
					? { uri: emptyWsUri, name: 'EmptyWs', folders: [], owned: true }
					: uri.toString() === alphaWsUri.toString()
						? { uri: alphaWsUri, name: 'Alpha', folders: [], owned: true }
						: undefined,
				getKey: uri => uri.toString(),
				listed: [{ uri: emptyWsUri, name: 'EmptyWs', folders: [], owned: true }],
			},
			sessions: [grouped, inWorkspace],
			groups: createGroups([group], new Map([['g1', 'grp1']])),
		}));

		assert.deepStrictEqual({
			tree: describeNodes(result.children),
			topLevelOrder: result.snapshot.topLevelOrder,
			muted: [...result.snapshot.mutedHeaderIds],
			spaced: [...result.snapshot.spacedHeaderIds],
		}, {
			tree: [
				{
					section: GROUPS_SECTION_ID,
					children: [{ group: 'grp1', depth: 0, children: [{ session: 'g1' }] }],
				},
				{
					section: WORKSPACES_SECTION_ID,
					children: [
						{ section: `workspace:${alphaWsUri.toString()}`, children: [{ session: 'w1' }] },
						{ section: `workspace:${emptyWsUri.toString()}`, children: [{ placeholder: `workspace:${emptyWsUri.toString()}` }] },
					],
				},
			],
			topLevelOrder: ['group:grp1'],
			muted: [GROUPS_SECTION_ID, WORKSPACES_SECTION_ID],
			spaced: [WORKSPACES_SECTION_ID],
		});
	});

	test('resolves header pin and collapse-state aliases into Pinned and section collapse state', () => {
		const alpha = createSession('a1', { workspaceLabel: 'Alpha', updatedAt: NOW - 1_000 });
		const beta = createSession('b1', { workspaceLabel: 'Beta', updatedAt: NOW - 2_000 });

		const result = buildSessionsListModel(createInput({
			grouping: SessionsGrouping.Workspace,
			sessions: [alpha, beta],
			pinnedSectionIds: ['workspace:old-alpha'],
			savedSectionCollapseState: new Map([['workspace:old-beta', true]]),
			headerAliases: new Map([
				['workspace:Alpha', { pin: ['workspace:old-alpha'], state: [] }],
				['workspace:Beta', { pin: [], state: ['workspace:old-beta'] }],
			]),
		}));

		const betaNode = result.children.find(child => isSessionSection(child.element) && child.element.id === 'workspace:Beta');
		assert.deepStrictEqual({
			tree: describeNodes(result.children),
			renderedPinned: [...result.snapshot.renderedPinnedHeaderIds],
			betaCollapsed: betaNode?.collapsed,
		}, {
			tree: [
				{ section: 'pinned', children: [{ section: 'workspace:Alpha', children: [{ session: 'a1' }] }] },
				{ section: 'workspace:Beta', children: [{ session: 'b1' }] },
			],
			renderedPinned: ['workspace:Alpha'],
			betaCollapsed: true,
		});
	});
});

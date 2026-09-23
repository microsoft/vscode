/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { constObservable, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AGENT_HOST_CHECKOUT_CHANGESET_OPERATION_ID } from '../../../../../platform/agentHost/common/agentHostChangesetOperationService.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { TestStorageService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { BRANCH_CHANGES_CHANGESET_ID, IChat, ISession, ISessionChangeset, ISessionChangesetOperation, ISessionFileChange, ISessionFolder, ISessionGitRepository, ISessionWorkspace, SESSION_CHANGES_CHANGESET_ID, SessionChangesetOperationScope, SessionChangesetOperationStatus, TURN_CHANGES_CHANGESET_ID, UNCOMMITTED_CHANGES_CHANGESET_ID } from '../../../../services/sessions/common/session.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IAgentFeedbackService } from '../../../agentFeedback/browser/agentFeedbackService.js';
import { ICodeReviewService, PRReviewStateKind } from '../../../codeReview/browser/codeReviewService.js';
import { ChangesViewService } from '../../browser/changesViewService.js';
import { ChangesViewMode } from '../../common/changes.js';

suite('ChangesViewService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createSession(id: string, options?: { readonly workspace?: ISessionWorkspace; readonly changesets?: readonly ISessionChangeset[]; readonly activeChat?: IObservable<IChat>; readonly mainChat?: IObservable<IChat>; readonly chats?: IObservable<readonly IChat[]>; readonly baseBranchProtected?: boolean; readonly pullRequestState?: 'open' | 'closed' | 'merged'; readonly livePullRequestState?: 'open' | 'closed' | 'merged'; readonly pullRequestIcon?: { readonly id: string } }): IActiveSession {
		const workspace = options?.workspace ?? (options?.baseBranchProtected === undefined && options?.pullRequestState === undefined && options?.livePullRequestState === undefined && options?.pullRequestIcon === undefined
			? undefined
			: upcastPartial<ISessionWorkspace>({
				folders: [upcastPartial<ISessionFolder>({
					root: URI.file('/repo'),
					name: 'repo',
					gitRepository: upcastPartial<ISessionGitRepository>({
						uri: URI.file('/repo'),
						workTreeUri: URI.file('/repo.worktrees/session'),
						baseBranchName: 'main',
						baseBranchProtected: options.baseBranchProtected,
						gitHubInfo: constObservable(options.pullRequestState || options.livePullRequestState || options.pullRequestIcon ? {
							owner: 'microsoft',
							repo: 'vscode',
							pullRequest: {
								number: 1,
								uri: URI.parse('https://github.com/microsoft/vscode/pull/1'),
								icon: options.pullRequestIcon ?? Codicon.gitPullRequest,
								state: options.pullRequestState,
								liveState: options.livePullRequestState,
							},
						} : undefined),
					}),
				})],
			}));
		const defaultChat = upcastPartial<IChat>({
			resource: URI.from({ scheme: 'test-chat', path: `/${id}` }),
			changes: constObservable([]),
			changesets: constObservable(options?.changesets ?? []),
			workspace: constObservable(workspace),
		});
		return upcastPartial<IActiveSession>({
			resource: URI.from({ scheme: 'test-session', path: `/${id}` }),
			providerId: 'local-agent-host',
			sessionType: 'test',
			loading: constObservable(false),
			workspace: constObservable(workspace),
			activeChat: options?.activeChat ?? constObservable(defaultChat),
			mainChat: options?.mainChat ?? constObservable(defaultChat),
			chats: options?.chats ?? constObservable([defaultChat]),
		});
	}

	function createWorkspace(root: string): ISessionWorkspace {
		const uri = URI.file(root);
		return upcastPartial<ISessionWorkspace>({
			uri,
			label: root,
			folders: [upcastPartial<ISessionFolder>({
				root: uri,
				workingDirectory: uri,
				name: root,
				gitRepository: upcastPartial<ISessionGitRepository>({
					uri,
					branchName: 'feature',
					baseBranchName: 'main',
				}),
			})],
		});
	}

	function createChangeset(operations: readonly ISessionChangesetOperation[], options?: {
		readonly isLoadingChanges?: IObservable<boolean>;
		readonly changes?: IObservable<readonly ISessionFileChange[]>;
		readonly resource?: URI;
	}): ISessionChangeset {
		return upcastPartial<ISessionChangeset>({
			id: 'branch',
			resource: options?.resource,
			label: 'Branch Changes',
			isDefault: constObservable(true),
			isEnabled: constObservable(true),
			isLoadingChanges: options?.isLoadingChanges ?? constObservable(false),
			operations: constObservable(operations),
			changes: options?.changes ?? constObservable([]),
		});
	}

	function createTransientChangeset(): ISessionChangeset {
		return upcastPartial<ISessionChangeset>({
			id: 'turn:request',
			label: 'Turn Changes',
			isDefault: constObservable(false),
			isEnabled: constObservable(true),
			isLoadingChanges: constObservable(false),
			operations: constObservable([]),
			changes: constObservable([]),
		});
	}

	function createHarness(initialSession: IActiveSession, storageService = disposables.add(new TestStorageService())) {
		const activeSession = observableValue<IActiveSession | undefined>('test.activeSession', initialSession);
		const onDidReplaceSession = disposables.add(new Emitter<{ readonly from: ISession; readonly to: ISession }>());
		const onDidDeleteSession = disposables.add(new Emitter<ISession>());
		const onDidDeleteChat = disposables.add(new Emitter<ISession>());
		const onDidDiscardNewSession = disposables.add(new Emitter<ISession>());
		const onDidReplaceNewDraftSession = disposables.add(new Emitter<{ readonly from: ISession; readonly to: ISession }>());
		const sessionsService = new class extends mock<ISessionsService>() {
			override readonly activeSession = activeSession;
		}();
		const sessionsManagementService = new class extends mock<ISessionsManagementService>() {
			override readonly onDidReplaceSession = onDidReplaceSession.event;
			override readonly onDidDeleteSession = onDidDeleteSession.event;
			override readonly onDidDeleteChat = onDidDeleteChat.event;
			override readonly onDidDiscardNewSession = onDidDiscardNewSession.event;
			override readonly onDidReplaceNewDraftSession = onDidReplaceNewDraftSession.event;
		}();
		const agentFeedbackService = new class extends mock<IAgentFeedbackService>() {
			override readonly onDidChangeFeedback = Event.None;
			override readonly activeFeedbackSessionResource = constObservable(URI.from({ scheme: 'test-feedback' }));
			override getFeedback() { return []; }
		}();
		const codeReviewService = new class extends mock<ICodeReviewService>() {
			override getPRReviewState() {
				return constObservable({ kind: PRReviewStateKind.None } as const);
			}
		}();
		const service = disposables.add(new ChangesViewService(
			agentFeedbackService,
			codeReviewService,
			disposables.add(new MockContextKeyService()),
			sessionsService,
			storageService,
			sessionsManagementService,
		));

		return { activeSession, onDidDeleteChat, onDidDeleteSession, onDidDiscardNewSession, onDidReplaceNewDraftSession, onDidReplaceSession, service, storageService };
	}

	test('restores section collapse state independently per session', () => {
		const sessionA = createSession('a');
		const sessionB = createSession('b');
		const { activeSession, service } = createHarness(sessionA);

		const states = [service.activeSessionSectionCollapseStateObs.get()];
		service.setSectionCollapsed(sessionA.resource, 'checks', false);
		states.push(service.activeSessionSectionCollapseStateObs.get());
		activeSession.set(sessionB, undefined);
		states.push(service.activeSessionSectionCollapseStateObs.get());
		service.setSectionCollapsed(sessionB.resource, 'checks', false);
		states.push(service.activeSessionSectionCollapseStateObs.get());
		activeSession.set(sessionA, undefined);
		states.push(service.activeSessionSectionCollapseStateObs.get());

		assert.deepStrictEqual(states, [
			{ checks: true },
			{ checks: false },
			{ checks: true },
			{ checks: false },
			{ checks: false },
		]);
	});

	test('transfers collapse state on replacement and removes it on deletion', () => {
		const draft = createSession('draft');
		const committed = createSession('committed');
		const { activeSession, onDidDeleteSession, onDidReplaceSession, service } = createHarness(draft);
		const detailsViewState = {
			focus: [],
			selection: [],
			expanded: {},
			scrollTop: 40,
		};

		service.setSectionCollapsed(draft.resource, 'checks', false);
		service.setDetailsViewState(draft.resource, ChangesViewMode.List, detailsViewState);
		activeSession.set(committed, undefined);
		onDidReplaceSession.fire({ from: draft, to: committed });
		const afterReplacement = service.activeSessionSectionCollapseStateObs.get();
		const detailsAfterReplacement = service.getDetailsViewState(committed.resource, ChangesViewMode.List);
		const detailsViewStateTransfer = service.detailsViewStateTransferObs.get();
		onDidDeleteSession.fire(committed);
		const afterDeletion = service.activeSessionSectionCollapseStateObs.get();
		const detailsAfterDeletion = service.getDetailsViewState(committed.resource, ChangesViewMode.List);

		assert.deepStrictEqual({ afterReplacement, detailsAfterReplacement, detailsViewStateTransfer, afterDeletion, detailsAfterDeletion }, {
			afterReplacement: { checks: false },
			detailsAfterReplacement: detailsViewState,
			detailsViewStateTransfer: { from: draft.resource, to: committed.resource },
			afterDeletion: { checks: true },
			detailsAfterDeletion: undefined,
		});
	});

	test('removes collapse state when a draft is discarded or replaced by another draft', () => {
		const firstDraft = createSession('first-draft');
		const secondDraft = createSession('second-draft');
		const { activeSession, onDidDiscardNewSession, onDidReplaceNewDraftSession, service } = createHarness(firstDraft);

		service.setSectionCollapsed(firstDraft.resource, 'checks', false);
		activeSession.set(secondDraft, undefined);
		onDidReplaceNewDraftSession.fire({ from: firstDraft, to: secondDraft });
		const afterReplacement = service.activeSessionSectionCollapseStateObs.get();
		service.setSectionCollapsed(secondDraft.resource, 'checks', false);
		onDidDiscardNewSession.fire(secondDraft);
		const afterDiscard = service.activeSessionSectionCollapseStateObs.get();

		assert.deepStrictEqual({ afterReplacement, afterDiscard }, {
			afterReplacement: { checks: true },
			afterDiscard: { checks: true },
		});
	});

	test('restores details view state independently per session and view mode', () => {
		const sessionA = createSession('a');
		const sessionB = createSession('b');
		const { service } = createHarness(sessionA);
		const listState = {
			focus: ['file:///repo/a.ts'],
			selection: ['file:///repo/a.ts'],
			expanded: {},
			scrollTop: 80,
		};
		const treeState = {
			focus: [],
			selection: [],
			expanded: { 'file:///repo/src': 0 as const },
			scrollTop: 120,
		};

		service.setDetailsViewState(sessionA.resource, ChangesViewMode.List, listState);
		service.setDetailsViewState(sessionA.resource, ChangesViewMode.Tree, treeState);

		assert.deepStrictEqual({
			sessionAList: service.getDetailsViewState(sessionA.resource, ChangesViewMode.List),
			sessionATree: service.getDetailsViewState(sessionA.resource, ChangesViewMode.Tree),
			sessionBList: service.getDetailsViewState(sessionB.resource, ChangesViewMode.List),
		}, {
			sessionAList: listState,
			sessionATree: treeState,
			sessionBList: undefined,
		});
	});

	test('retains details view state for the 100 most recently used sessions', () => {
		const firstSession = createSession('0');
		const { service } = createHarness(firstSession);
		const state = {
			focus: [],
			selection: [],
			expanded: {},
			scrollTop: 0,
		};

		for (let i = 0; i <= 100; i++) {
			service.setDetailsViewState(createSession(`${i}`).resource, ChangesViewMode.List, state);
		}

		assert.deepStrictEqual({
			first: service.getDetailsViewState(firstSession.resource, ChangesViewMode.List),
			last: service.getDetailsViewState(createSession('100').resource, ChangesViewMode.List),
		}, {
			first: undefined,
			last: state,
		});
	});

	test('persists Changes view state mutations immediately', () => {
		const draft = createSession('draft');
		const committed = createSession('committed');
		const storageService = disposables.add(new TestStorageService());
		const firstHarness = createHarness(draft, storageService);
		const detailsViewState = {
			focus: ['file:///repo/a.ts'],
			selection: ['file:///repo/a.ts'],
			expanded: { 'file:///repo/src': 0 as const },
			scrollTop: 64,
		};

		firstHarness.service.setDetailsViewState(draft.resource, ChangesViewMode.Tree, detailsViewState);
		firstHarness.onDidReplaceSession.fire({ from: draft, to: committed });
		firstHarness.service.dispose();

		const restoredService = createHarness(committed, storageService).service;
		assert.deepStrictEqual({
			detailsViewState: restoredService.getDetailsViewState(committed.resource, ChangesViewMode.Tree),
			draftDetailsViewState: restoredService.getDetailsViewState(draft.resource, ChangesViewMode.Tree),
		}, {
			detailsViewState,
			draftDetailsViewState: undefined,
		});
	});

	test('scopes a transient changeset to its session and clears it on provider selection', () => {
		const branchChangeset = createChangeset([]);
		const transientChangeset = createTransientChangeset();
		const sessionA = createSession('a', { changesets: [branchChangeset] });
		const sessionB = createSession('b', { changesets: [branchChangeset] });
		const { activeSession, service } = createHarness(sessionA);

		service.showChangeset(transientChangeset);
		const transientSelection = {
			changesets: service.activeSessionChangesetsObs.get()?.map(changeset => changeset.id),
			selected: service.activeSessionChangesetObs.get()?.id,
		};
		service.setChangesetId(branchChangeset.id);
		const providerSelection = {
			changesets: service.activeSessionChangesetsObs.get()?.map(changeset => changeset.id),
			selected: service.activeSessionChangesetObs.get()?.id,
		};
		service.showChangeset(transientChangeset);
		activeSession.set(sessionB, undefined);
		const afterSessionSwitch = {
			changesets: service.activeSessionChangesetsObs.get()?.map(changeset => changeset.id),
			selected: service.activeSessionChangesetObs.get()?.id,
		};
		activeSession.set(sessionA, undefined);
		const afterSwitchingBack = {
			changesets: service.activeSessionChangesetsObs.get()?.map(changeset => changeset.id),
			selected: service.activeSessionChangesetObs.get()?.id,
		};

		assert.deepStrictEqual({ transientSelection, providerSelection, afterSessionSwitch, afterSwitchingBack }, {
			transientSelection: {
				changesets: ['branch', 'turn:request'],
				selected: 'turn:request',
			},
			providerSelection: {
				changesets: ['branch'],
				selected: 'branch',
			},
			afterSessionSwitch: {
				changesets: ['branch'],
				selected: 'branch',
			},
			afterSwitchingBack: {
				changesets: ['branch', 'turn:request'],
				selected: 'turn:request',
			},
		});
	});

	test('surfaces cached changes while the changeset recomputes', () => {
		const cachedChange = upcastPartial<ISessionFileChange>({
			modifiedUri: URI.file('/repo/cached.ts'),
		});
		const isLoadingChanges = observableValue('isLoadingChanges', true);
		const changes = observableValue<readonly ISessionFileChange[]>('changes', [cachedChange]);
		const changeset = createChangeset([], { isLoadingChanges, changes });
		const { service } = createHarness(createSession('cached', { changesets: [changeset] }));

		const withCachedChanges = {
			changesetLoading: service.activeSessionChangesetLoadingObs.get(),
			sessionLoading: service.activeSessionLoadingObs.get(),
			changes: service.activeSessionChangesObs.get().map(change => change.modifiedUri?.toString()),
		};
		changes.set([], undefined);
		const withoutCachedChanges = {
			changesetLoading: service.activeSessionChangesetLoadingObs.get(),
			sessionLoading: service.activeSessionLoadingObs.get(),
			changes: service.activeSessionChangesObs.get().map(change => change.modifiedUri?.toString()),
		};
		isLoadingChanges.set(false, undefined);
		const afterRecompute = {
			changesetLoading: service.activeSessionChangesetLoadingObs.get(),
			sessionLoading: service.activeSessionLoadingObs.get(),
			changes: service.activeSessionChangesObs.get().map(change => change.modifiedUri?.toString()),
		};

		assert.deepStrictEqual({ withCachedChanges, withoutCachedChanges, afterRecompute }, {
			withCachedChanges: {
				changesetLoading: true,
				sessionLoading: false,
				changes: ['file:///repo/cached.ts'],
			},
			withoutCachedChanges: {
				changesetLoading: true,
				sessionLoading: true,
				changes: [],
			},
			afterRecompute: {
				changesetLoading: false,
				sessionLoading: false,
				changes: [],
			},
		});
	});

	test('preserves the changes summary while changes are loading', () => {
		const isLoadingChanges = observableValue('isLoadingChanges', false);
		const changes = observableValue<readonly ISessionFileChange[]>('changes', [
			upcastPartial<ISessionFileChange>({ insertions: 5, deletions: 7 }),
			upcastPartial<ISessionFileChange>({ insertions: 6, deletions: 3 }),
		]);
		const changeset = createChangeset([], { isLoadingChanges, changes });
		const { service } = createHarness(createSession('summary', { changesets: [changeset] }));

		const summaries = [service.activeSessionChangesSummaryObs.get()];
		isLoadingChanges.set(true, undefined);
		changes.set([], undefined);
		summaries.push(service.activeSessionChangesSummaryObs.get());
		isLoadingChanges.set(false, undefined);
		summaries.push(service.activeSessionChangesSummaryObs.get());

		assert.deepStrictEqual(summaries, [
			{ additions: 11, deletions: 10, files: 2 },
			{ additions: 11, deletions: 10, files: 2 },
			undefined,
		]);
	});

	test('shows only the active chat catalogue including projected session changes', () => {
		const branchChangeset = { ...createChangeset([]), id: 'branch' };
		const uncommittedChangeset = { ...createChangeset([]), id: UNCOMMITTED_CHANGES_CHANGESET_ID };
		const sessionResource = URI.parse('changeset:/session');
		const mainSessionChangeset = { ...createChangeset([], { resource: sessionResource }), id: SESSION_CHANGES_CHANGESET_ID };
		const peerSessionChangeset = { ...createChangeset([], { resource: sessionResource }), id: SESSION_CHANGES_CHANGESET_ID };
		const lastTurnChangeset = { ...createChangeset([]), id: TURN_CHANGES_CHANGESET_ID };
		const firstChat = upcastPartial<IChat>({
			resource: URI.from({ scheme: 'test-chat', path: '/first' }),
			workspace: constObservable(undefined),
			changes: constObservable([]),
			changesets: constObservable([branchChangeset, uncommittedChangeset, mainSessionChangeset, lastTurnChangeset]),
		});
		const secondChat = upcastPartial<IChat>({
			resource: URI.from({ scheme: 'test-chat', path: '/second' }),
			workspace: constObservable(undefined),
			changes: constObservable([]),
			changesets: constObservable([peerSessionChangeset, lastTurnChangeset]),
		});
		const activeChat = observableValue<IChat>('test.activeChat', firstChat);
		const { service } = createHarness(createSession('a', {
			activeChat,
			mainChat: constObservable(firstChat),
			chats: constObservable([firstChat, secondChat]),
		}));

		const first = service.activeSessionChangesetsObs.get()?.map(changeset => changeset.id);
		activeChat.set(secondChat, undefined);
		const second = service.activeSessionChangesetsObs.get()?.map(changeset => changeset.id);

		assert.deepStrictEqual({ first, second }, {
			first: ['branch', UNCOMMITTED_CHANGES_CHANGESET_ID, SESSION_CHANGES_CHANGESET_ID, TURN_CHANGES_CHANGESET_ID],
			second: [SESSION_CHANGES_CHANGESET_ID, TURN_CHANGES_CHANGESET_ID],
		});
	});

	test('retains changeset preferences independently per chat', () => {
		const branchChangeset = { ...createChangeset([]), id: 'branch' };
		const sessionResource = URI.parse('changeset:/session');
		const mainSessionChangeset = { ...createChangeset([], { resource: sessionResource }), id: SESSION_CHANGES_CHANGESET_ID, isDefault: constObservable(false) };
		const peerSessionChangeset = { ...createChangeset([], { resource: sessionResource }), id: SESSION_CHANGES_CHANGESET_ID };
		const lastTurnChangeset = { ...createChangeset([]), id: TURN_CHANGES_CHANGESET_ID, isDefault: constObservable(false) };
		const mainChat = upcastPartial<IChat>({
			resource: URI.from({ scheme: 'test-chat', path: '/main' }),
			workspace: constObservable(undefined),
			changes: constObservable([]),
			changesets: constObservable([branchChangeset, mainSessionChangeset, lastTurnChangeset]),
		});
		const peerChat = upcastPartial<IChat>({
			resource: URI.from({ scheme: 'test-chat', path: '/peer' }),
			workspace: constObservable(undefined),
			changes: constObservable([]),
			changesets: constObservable([peerSessionChangeset, lastTurnChangeset]),
		});
		const unvisitedChat = upcastPartial<IChat>({
			resource: URI.from({ scheme: 'test-chat', path: '/unvisited' }),
			workspace: constObservable(undefined),
			changes: constObservable([]),
			changesets: constObservable([peerSessionChangeset, lastTurnChangeset]),
		});
		const activeChat = observableValue<IChat>('test.activeChat', mainChat);
		const { activeSession, service } = createHarness(createSession('a', {
			activeChat,
			mainChat: constObservable(mainChat),
			chats: constObservable([mainChat, peerChat, unvisitedChat]),
		}));

		service.setChangesetId('branch');
		const mainSelection = service.activeSessionChangesetObs.get()?.id;
		activeChat.set(peerChat, undefined);
		const peerFallback = service.activeSessionChangesetObs.get()?.id;
		service.setChangesetId(TURN_CHANGES_CHANGESET_ID);
		const peerSelection = service.activeSessionChangesetObs.get()?.id;
		activeChat.set(mainChat, undefined);
		const restoredMainSelection = service.activeSessionChangesetObs.get()?.id;
		activeChat.set(peerChat, undefined);
		const restoredPeerSelection = service.activeSessionChangesetObs.get()?.id;
		activeChat.set(unvisitedChat, undefined);
		const inheritedSelection = service.activeSessionChangesetObs.get()?.id;
		activeSession.set(createSession('b', {
			changesets: [branchChangeset, lastTurnChangeset],
		}), undefined);
		const unrelatedSessionSelection = service.activeSessionChangesetObs.get()?.id;

		assert.deepStrictEqual({
			mainSelection,
			peerFallback,
			peerSelection,
			restoredMainSelection,
			restoredPeerSelection,
			inheritedSelection,
			unrelatedSessionSelection,
		}, {
			mainSelection: 'branch',
			peerFallback: SESSION_CHANGES_CHANGESET_ID,
			peerSelection: TURN_CHANGES_CHANGESET_ID,
			restoredMainSelection: 'branch',
			restoredPeerSelection: TURN_CHANGES_CHANGESET_ID,
			inheritedSelection: TURN_CHANGES_CHANGESET_ID,
			unrelatedSessionSelection: 'branch',
		});
	});

	test('preserves resolved changes while equivalent chat projections hand off', () => {
		const sharedResource = URI.parse('changeset:/shared-branch');
		const cachedChange = upcastPartial<ISessionFileChange>({
			modifiedUri: URI.file('/repo/cached.ts'),
			insertions: 1,
			deletions: 0,
		});
		const firstChangeset = createChangeset([], {
			resource: sharedResource,
			changes: constObservable([cachedChange]),
		});
		const sharedLoadingChangeset = createChangeset([], {
			resource: sharedResource,
			isLoadingChanges: constObservable(true),
			changes: constObservable([]),
		});
		const differentLoadingChangeset = createChangeset([], {
			resource: URI.parse('changeset:/different-branch'),
			isLoadingChanges: constObservable(true),
			changes: constObservable([]),
		});
		const firstChat = upcastPartial<IChat>({
			resource: URI.from({ scheme: 'test-chat', path: '/first' }),
			workspace: constObservable(undefined),
			changes: constObservable([]),
			changesets: constObservable([firstChangeset]),
		});
		const sharedChat = upcastPartial<IChat>({
			resource: URI.from({ scheme: 'test-chat', path: '/shared' }),
			workspace: constObservable(undefined),
			changes: constObservable([]),
			changesets: constObservable([sharedLoadingChangeset]),
		});
		const differentChat = upcastPartial<IChat>({
			resource: URI.from({ scheme: 'test-chat', path: '/different' }),
			workspace: constObservable(undefined),
			changes: constObservable([]),
			changesets: constObservable([differentLoadingChangeset]),
		});
		const activeChat = observableValue<IChat>('test.activeChat', firstChat);
		const { service } = createHarness(createSession('a', {
			activeChat,
			mainChat: constObservable(firstChat),
			chats: constObservable([firstChat, sharedChat, differentChat]),
		}));
		const snapshot = () => ({
			loading: service.activeSessionChangesetLoadingObs.get(),
			changes: service.activeSessionChangesObs.get().map(change => change.modifiedUri?.toString()),
		});

		const beforeSwitch = snapshot();
		activeChat.set(sharedChat, undefined);
		const sharedSwitch = snapshot();
		activeChat.set(differentChat, undefined);
		const differentSwitch = snapshot();

		assert.deepStrictEqual({ beforeSwitch, sharedSwitch, differentSwitch }, {
			beforeSwitch: { loading: false, changes: ['file:///repo/cached.ts'] },
			sharedSwitch: { loading: false, changes: ['file:///repo/cached.ts'] },
			differentSwitch: { loading: true, changes: [] },
		});
	});

	test('preserves branch changes while a same-scope chat catalogue loads', () => {
		const workspace = createWorkspace('/repo');
		const sharedResource = URI.parse('changeset:/shared-branch');
		const cachedChange = upcastPartial<ISessionFileChange>({
			modifiedUri: URI.file('/repo/cached.ts'),
			insertions: 1,
			deletions: 0,
		});
		const resolvedChange = upcastPartial<ISessionFileChange>({
			modifiedUri: URI.file('/repo/resolved.ts'),
			insertions: 1,
			deletions: 0,
		});
		const incomingLoading = observableValue('test.incomingLoading', true);
		const incomingChanges = observableValue<readonly ISessionFileChange[]>('test.incomingChanges', []);
		const mainChangeset = createChangeset([], {
			resource: sharedResource,
			changes: constObservable([cachedChange]),
		});
		const peerChangeset = createChangeset([], {
			resource: sharedResource,
			isLoadingChanges: incomingLoading,
			changes: incomingChanges,
		});
		const peerChangesets = observableValue<readonly ISessionChangeset[] | undefined>('test.peerChangesets', undefined);
		const mainChat = upcastPartial<IChat>({
			resource: URI.from({ scheme: 'test-chat', path: '/main' }),
			workspace: constObservable(workspace),
			changes: constObservable([]),
			changesets: constObservable([mainChangeset]),
		});
		const peerChat = upcastPartial<IChat>({
			resource: URI.from({ scheme: 'test-chat', path: '/peer' }),
			workspace: constObservable(workspace),
			changes: constObservable([]),
			changesets: peerChangesets,
		});
		const activeChat = observableValue<IChat>('test.activeChat', mainChat);
		const { service } = createHarness(createSession('a', {
			workspace,
			activeChat,
			mainChat: constObservable(mainChat),
			chats: constObservable([mainChat, peerChat]),
		}));
		const snapshot = () => ({
			changeset: service.activeSessionChangesetObs.get()?.id,
			catalogueLoading: service.activeSessionChangesetsLoadingObs.get(),
			sessionLoading: service.activeSessionLoadingObs.get(),
			changes: service.activeSessionChangesObs.get().map(change => change.modifiedUri?.toString()),
		});

		const beforeSwitch = snapshot();
		activeChat.set(peerChat, undefined);
		const pendingCatalogue = snapshot();
		peerChangesets.set([peerChangeset], undefined);
		const subscribed = snapshot();
		incomingChanges.set([resolvedChange], undefined);
		incomingLoading.set(false, undefined);
		const resolved = snapshot();

		assert.deepStrictEqual({ beforeSwitch, pendingCatalogue, subscribed, resolved }, {
			beforeSwitch: {
				changeset: BRANCH_CHANGES_CHANGESET_ID,
				catalogueLoading: false,
				sessionLoading: false,
				changes: ['file:///repo/cached.ts'],
			},
			pendingCatalogue: {
				changeset: BRANCH_CHANGES_CHANGESET_ID,
				catalogueLoading: true,
				sessionLoading: false,
				changes: ['file:///repo/cached.ts'],
			},
			subscribed: {
				changeset: BRANCH_CHANGES_CHANGESET_ID,
				catalogueLoading: false,
				sessionLoading: false,
				changes: ['file:///repo/cached.ts'],
			},
			resolved: {
				changeset: BRANCH_CHANGES_CHANGESET_ID,
				catalogueLoading: false,
				sessionLoading: false,
				changes: ['file:///repo/resolved.ts'],
			},
		});
	});

	test('preserves unresolved catalogues only for same-scope Branch Changes', () => {
		const mainWorkspace = createWorkspace('/repo');
		const otherWorkspace = createWorkspace('/other');
		const cachedChange = upcastPartial<ISessionFileChange>({
			modifiedUri: URI.file('/repo/cached.ts'),
			insertions: 1,
			deletions: 0,
		});
		const branchChangeset = createChangeset([], {
			resource: URI.parse('changeset:/shared-branch'),
			changes: constObservable([cachedChange]),
		});
		const sessionChangeset = {
			...createChangeset([], {
				resource: URI.parse('changeset:/session'),
				changes: constObservable([cachedChange]),
			}),
			id: SESSION_CHANGES_CHANGESET_ID,
		};
		const uncommittedChangeset = {
			...createChangeset([], {
				resource: URI.parse('changeset:/main-uncommitted'),
				changes: constObservable([cachedChange]),
			}),
			id: UNCOMMITTED_CHANGES_CHANGESET_ID,
		};
		const mainChat = upcastPartial<IChat>({
			resource: URI.from({ scheme: 'test-chat', path: '/main' }),
			workspace: constObservable(mainWorkspace),
			changes: constObservable([]),
			changesets: constObservable([branchChangeset, uncommittedChangeset, sessionChangeset]),
		});
		const sameScopePeer = upcastPartial<IChat>({
			resource: URI.from({ scheme: 'test-chat', path: '/same-scope-peer' }),
			workspace: constObservable(mainWorkspace),
			changes: constObservable([]),
			changesets: constObservable(undefined),
		});
		const otherScopePeer = upcastPartial<IChat>({
			resource: URI.from({ scheme: 'test-chat', path: '/other-scope-peer' }),
			workspace: constObservable(otherWorkspace),
			changes: constObservable([]),
			changesets: constObservable(undefined),
		});
		const activeChat = observableValue<IChat>('test.activeChat', mainChat);
		const { service } = createHarness(createSession('a', {
			workspace: mainWorkspace,
			activeChat,
			mainChat: constObservable(mainChat),
			chats: constObservable([mainChat, sameScopePeer, otherScopePeer]),
		}));
		const snapshot = () => ({
			changeset: service.activeSessionChangesetObs.get()?.id,
			loading: service.activeSessionLoadingObs.get(),
			changes: service.activeSessionChangesObs.get().map(change => change.modifiedUri?.toString()),
		});

		service.setChangesetId(SESSION_CHANGES_CHANGESET_ID);
		activeChat.set(sameScopePeer, undefined);
		const sessionOwnedChanges = snapshot();
		activeChat.set(mainChat, undefined);
		service.setChangesetId(UNCOMMITTED_CHANGES_CHANGESET_ID);
		activeChat.set(sameScopePeer, undefined);
		const uncommittedChanges = snapshot();
		activeChat.set(mainChat, undefined);
		service.setChangesetId(BRANCH_CHANGES_CHANGESET_ID);
		activeChat.set(otherScopePeer, undefined);
		const differentWorkspace = snapshot();

		assert.deepStrictEqual({ sessionOwnedChanges, uncommittedChanges, differentWorkspace }, {
			sessionOwnedChanges: {
				changeset: undefined,
				loading: true,
				changes: [],
			},
			uncommittedChanges: {
				changeset: undefined,
				loading: true,
				changes: [],
			},
			differentWorkspace: {
				changeset: undefined,
				loading: true,
				changes: [],
			},
		});
	});

	test('shows projected session changes when the main chat is the only chat', () => {
		const branchChangeset = { ...createChangeset([]), id: 'branch' };
		const uncommittedChangeset = { ...createChangeset([]), id: UNCOMMITTED_CHANGES_CHANGESET_ID };
		const sessionChangeset = { ...createChangeset([], { resource: URI.parse('changeset:/session') }), id: SESSION_CHANGES_CHANGESET_ID };
		const lastTurnChangeset = { ...createChangeset([]), id: TURN_CHANGES_CHANGESET_ID };
		const { service } = createHarness(createSession('a', {
			changesets: [branchChangeset, uncommittedChangeset, sessionChangeset, lastTurnChangeset],
		}));

		assert.deepStrictEqual(
			service.activeSessionChangesetsObs.get()?.map(changeset => changeset.id),
			['branch', UNCOMMITTED_CHANGES_CHANGESET_ID, SESSION_CHANGES_CHANGESET_ID, TURN_CHANGES_CHANGESET_ID],
		);
	});

	test('waits while the active chat has not published changesets', () => {
		const activeChat = upcastPartial<IChat>({
			resource: URI.from({ scheme: 'test-chat', path: '/active' }),
			workspace: constObservable(undefined),
			changes: constObservable([]),
			changesets: constObservable(undefined),
		});
		const { service } = createHarness(createSession('a', {
			activeChat: constObservable(activeChat),
		}));

		assert.deepStrictEqual({
			changesets: service.activeSessionChangesetsObs.get(),
			loading: service.activeSessionChangesetsLoadingObs.get(),
		}, {
			changesets: undefined,
			loading: true,
		});
	});

	test('hides checkout from generic changeset operations', () => {
		const changeset = createChangeset([
			{
				id: AGENT_HOST_CHECKOUT_CHANGESET_OPERATION_ID,
				label: 'Checkout',
				scopes: [SessionChangesetOperationScope.Changeset],
				status: SessionChangesetOperationStatus.Idle,
			},
			{
				id: 'create-pr',
				label: 'Create PR',
				scopes: [SessionChangesetOperationScope.Changeset],
				status: SessionChangesetOperationStatus.Idle,
			},
		]);
		const { service } = createHarness(createSession('draft', { changesets: [changeset] }));

		assert.deepStrictEqual(service.activeSessionChangesetOperationsObs.get().map(operation => operation.id), ['create-pr']);
	});

	test('hides the Agent Host merge operation when the base branch is protected', () => {
		const operations: readonly ISessionChangesetOperation[] = [
			{
				id: 'merge',
				label: 'Merge Changes',
				scopes: [SessionChangesetOperationScope.Changeset],
				status: SessionChangesetOperationStatus.Idle,
			},
			{
				id: 'create-pr',
				label: 'Create PR',
				scopes: [SessionChangesetOperationScope.Changeset],
				status: SessionChangesetOperationStatus.Idle,
			},
		];
		const changeset = createChangeset(operations);
		const unprotected = createSession('unprotected', { changesets: [changeset], baseBranchProtected: false });
		const protectedSession = createSession('protected', { changesets: [changeset], baseBranchProtected: true });
		const unknown = createSession('unknown', { changesets: [changeset] });
		const { activeSession, service } = createHarness(unprotected);

		const visibleOperations = [service.activeSessionChangesetOperationsObs.get().map(operation => operation.id)];
		activeSession.set(protectedSession, undefined);
		visibleOperations.push(service.activeSessionChangesetOperationsObs.get().map(operation => operation.id));
		activeSession.set(unknown, undefined);
		visibleOperations.push(service.activeSessionChangesetOperationsObs.get().map(operation => operation.id));

		assert.deepStrictEqual(visibleOperations, [
			['merge', 'create-pr'],
			['create-pr'],
			['merge', 'create-pr'],
		]);
	});

	test('reconciles host pull request state with the live icon', () => {
		const openSession = createSession('open', { pullRequestState: 'open' });
		const mergedSession = createSession('merged', { pullRequestState: 'merged', livePullRequestState: 'open' });
		const cachedTerminalSession = createSession('cached-terminal', { pullRequestState: 'open', pullRequestIcon: Codicon.gitPullRequestDone });
		const liveTerminalSession = createSession('live-terminal', { pullRequestState: 'open', livePullRequestState: 'merged', pullRequestIcon: Codicon.gitPullRequestDone });
		const { activeSession, service } = createHarness(openSession);

		const hasOpenPullRequest = [service.activeSessionStateObs.get()?.hasOpenPullRequest];
		activeSession.set(mergedSession, undefined);
		hasOpenPullRequest.push(service.activeSessionStateObs.get()?.hasOpenPullRequest);
		activeSession.set(cachedTerminalSession, undefined);
		hasOpenPullRequest.push(service.activeSessionStateObs.get()?.hasOpenPullRequest);
		activeSession.set(liveTerminalSession, undefined);
		hasOpenPullRequest.push(service.activeSessionStateObs.get()?.hasOpenPullRequest);

		assert.deepStrictEqual(hasOpenPullRequest, [true, false, true, false]);
	});
});

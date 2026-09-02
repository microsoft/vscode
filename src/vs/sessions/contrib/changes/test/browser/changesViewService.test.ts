/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { TestStorageService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISession, ISessionChangeset, ISessionChangesetOperation, ISessionFolder, ISessionGitRepository, ISessionWorkspace, SessionChangesetOperationScope, SessionChangesetOperationStatus } from '../../../../services/sessions/common/session.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IAgentFeedbackService } from '../../../agentFeedback/browser/agentFeedbackService.js';
import { ICodeReviewService, PRReviewStateKind } from '../../../codeReview/browser/codeReviewService.js';
import { ChangesViewService } from '../../browser/changesViewService.js';
import { ChangesViewMode } from '../../common/changes.js';

suite('ChangesViewService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createSession(id: string, options?: { readonly changesets?: readonly ISessionChangeset[]; readonly baseBranchProtected?: boolean; readonly pullRequestState?: 'open' | 'closed' | 'merged'; readonly livePullRequestState?: 'open' | 'closed' | 'merged'; readonly pullRequestIcon?: { readonly id: string } }): IActiveSession {
		const workspace = options?.baseBranchProtected === undefined && options?.pullRequestState === undefined && options?.livePullRequestState === undefined && options?.pullRequestIcon === undefined
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
			});
		return upcastPartial<IActiveSession>({
			resource: URI.from({ scheme: 'test-session', path: `/${id}` }),
			providerId: 'local-agent-host',
			sessionType: 'test',
			loading: constObservable(false),
			changes: constObservable([]),
			changesets: constObservable(options?.changesets ?? []),
			workspace: constObservable(workspace),
		});
	}

	function createChangeset(operations: readonly ISessionChangesetOperation[]): ISessionChangeset {
		return upcastPartial<ISessionChangeset>({
			id: 'branch',
			label: 'Branch Changes',
			isDefault: constObservable(true),
			isEnabled: constObservable(true),
			isLoadingChanges: constObservable(false),
			operations: constObservable(operations),
			changes: constObservable([]),
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
		const onDidDiscardNewSession = disposables.add(new Emitter<ISession>());
		const onDidReplaceNewDraftSession = disposables.add(new Emitter<{ readonly from: ISession; readonly to: ISession }>());
		const sessionsService = new class extends mock<ISessionsService>() {
			override readonly activeSession = activeSession;
		}();
		const sessionsManagementService = new class extends mock<ISessionsManagementService>() {
			override readonly onDidReplaceSession = onDidReplaceSession.event;
			override readonly onDidDeleteSession = onDidDeleteSession.event;
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

		return { activeSession, onDidDeleteSession, onDidDiscardNewSession, onDidReplaceNewDraftSession, onDidReplaceSession, service, storageService };
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

		assert.deepStrictEqual({ transientSelection, providerSelection, afterSessionSwitch }, {
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
		});
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

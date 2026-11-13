/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { constObservable, derived, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AGENT_HOST_CHECKOUT_CHANGESET_OPERATION_ID } from '../../../../../platform/agentHost/common/agentHostChangesetOperationService.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { IChatDeletedEvent, ISessionsManagementService } from '../../../sessions/common/sessionsManagement.js';
import { BRANCH_CHANGES_CHANGESET_ID, IChat, ISession, ISessionChangeset, ISessionChangesetOperation, ISessionFileChange, ISessionFolder, ISessionGitRepository, ISessionWorkspace, SESSION_CHANGES_CHANGESET_ID, SessionChangesetOperationScope, SessionChangesetOperationStatus, TURN_CHANGES_CHANGESET_ID, UNCOMMITTED_CHANGES_CHANGESET_ID } from '../../../../services/sessions/common/session.js';
import { IAgentFeedbackService } from '../../../sessions/browser/agentFeedback.js';
import { AgentFeedbackState, IAgentFeedback } from '../../../sessions/browser/agentFeedbackModel.js';
import { ICodeReviewService, PRReviewStateKind } from '../../../sessions/browser/codeReviewService.js';
import { ChangesetReviewedFilesContext, ChangesViewService } from '../../browser/changesViewService.js';
import { createChangesEditorScope } from '../../browser/changesView.js';
import { getChangesOfSession, IChangesSessionScope } from '../../../sessions/common/changesViewService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { SessionHost, SessionHostKind } from '../../../../services/sessions/browser/sessionHost.js';
import { ChangesViewMode } from '../../../sessions/common/changes.js';
import { ITestSessionWithChat, sessionHostServiceOf, withCreatedStatus } from '../../../sessions/test/browser/sessionHostTestUtils.js';
import { IChatSessionFileChange2 } from '../../../../common/chatSessionFileChange.js';

suite('ChangesViewService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createSession(id: string, options?: { readonly workspace?: ISessionWorkspace; readonly changesets?: readonly ISessionChangeset[]; readonly activeChat?: IObservable<IChat>; readonly mainChat?: IObservable<IChat>; readonly chats?: IObservable<readonly IChat[]>; readonly loading?: IObservable<boolean>; readonly baseBranchProtected?: boolean; readonly pullRequestState?: 'open' | 'closed' | 'merged'; readonly livePullRequestState?: 'open' | 'closed' | 'merged'; readonly pullRequestIcon?: { readonly id: string } }): ITestSessionWithChat {
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
		return upcastPartial<ITestSessionWithChat>({
			resource: URI.from({ scheme: 'test-session', path: `/${id}` }),
			...withCreatedStatus(constObservable(true)),
			providerId: 'local-agent-host',
			sessionType: 'test',
			loading: options?.loading ?? constObservable(false),
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

	function createHarness(initialSession: ITestSessionWithChat, storageService = disposables.add(new TestStorageService()), windowSessions: readonly ITestSessionWithChat[] = []) {
		const activeSession = observableValue<ITestSessionWithChat | undefined>('test.activeSession', initialSession);
		const onDidReplaceSession = disposables.add(new Emitter<{ readonly from: ISession; readonly to: ISession }>());
		const onDidDeleteSession = disposables.add(new Emitter<ISession>());
		const onDidDeleteChat = disposables.add(new Emitter<IChatDeletedEvent>());
		const onDidDiscardNewSession = disposables.add(new Emitter<ISession>());
		const onDidReplaceNewDraftSession = disposables.add(new Emitter<{ readonly from: ISession; readonly to: ISession }>());
		const sessionsManagementService = new class extends mock<ISessionsManagementService>() {
			override readonly onDidReplaceSession = onDidReplaceSession.event;
			override readonly onDidDeleteSession = onDidDeleteSession.event;
			override readonly onDidDeleteChat = onDidDeleteChat.event;
			override readonly onDidDiscardNewSession = onDidDiscardNewSession.event;
			override readonly onDidReplaceNewDraftSession = onDidReplaceNewDraftSession.event;
		}();
		const feedbackByResource = new Map<string, readonly IAgentFeedback[]>();
		const agentFeedbackService = new class extends mock<IAgentFeedbackService>() {
			override readonly onDidChangeFeedback = Event.None;
			override readonly activeFeedbackSessionResource = constObservable(URI.from({ scheme: 'test-feedback' }));
			override getFeedback(resource: URI) { return feedbackByResource.get(resource.toString()) ?? []; }
		}();
		const codeReviewService = new class extends mock<ICodeReviewService>() {
			override getPRReviewState() {
				return constObservable({ kind: PRReviewStateKind.None } as const);
			}
		}();
		const contextKeyService = disposables.add(new MockContextKeyService());
		const service = disposables.add(new ChangesViewService(
			agentFeedbackService,
			codeReviewService,
			contextKeyService,
			sessionHostServiceOf(disposables, { mainWindowActiveSession: activeSession, gridShown: constObservable([]), windowSessions: constObservable(windowSessions) }),
			storageService,
			sessionsManagementService,
		));

		return { activeSession, contextKeyService, feedbackByResource, onDidDeleteChat, onDidDeleteSession, onDidDiscardNewSession, onDidReplaceNewDraftSession, onDidReplaceSession, service, storageService };
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

	test('a Changes editor of a chat in a chat window keeps the scope of that chat, and selects its changesets, while the window shows another chat; one of the session follows the window, and the main window\'s is unchanged', () => {
		const createChat = (id: string) => upcastPartial<IChat>({
			resource: URI.from({ scheme: 'test-chat', path: `/${id}` }),
			changes: constObservable([]),
			workspace: constObservable(undefined),
			changesets: constObservable([
				createChangeset([]),
				upcastPartial<ISessionChangeset>({ ...createChangeset([]), id: SESSION_CHANGES_CHANGESET_ID, label: 'Session Changes', isDefault: constObservable(false) }),
			]),
		});
		const chatA = createChat('a');
		const chatB = createChat('b');
		const session = createSession('s', { chats: constObservable([chatA, chatB]), activeChat: constObservable(chatA), mainChat: constObservable(chatA) });
		const { service } = createHarness(session);
		const sessionsManagementService = upcastPartial<ISessionsManagementService>({ onDidChangeSessions: Event.None, getSession: resource => resource.toString() === session.resource.toString() ? session : undefined });
		const contextKeyService = upcastPartial<IContextKeyService>({});
		const windowChat = observableValue<IChat | undefined>('windowChat', chatB);
		const chatWindowHost = new SessionHost({ kind: SessionHostKind.ChatWindow, parent: undefined, session: constObservable<ITestSessionWithChat | undefined>(session), chat: windowChat, contextKeyService });
		const mainWindowHost = new SessionHost({ kind: SessionHostKind.MainWindow, parent: undefined, session: constObservable<ITestSessionWithChat | undefined>(session), chat: constObservable(chatA), contextKeyService });
		const naming = (chat: IChat | undefined) => constObservable({ session: session.resource, chat: chat?.resource });
		const ofNestedChat = createChangesEditorScope(service, sessionsManagementService, chatWindowHost, naming(chatB));
		const ofWindowChat = createChangesEditorScope(service, sessionsManagementService, chatWindowHost, naming(chatA));
		const ofSession = createChangesEditorScope(service, sessionsManagementService, chatWindowHost, naming(undefined));
		const ofMainWindow = createChangesEditorScope(service, sessionsManagementService, mainWindowHost, naming(chatB));
		const describe = (scope: IChangesSessionScope) => ({ chat: scope.chat.get()?.resource.path, changeset: scope.changes.changesetObs.get()?.id, isMainWindow: scope.isMainWindow });
		const describeAll = () => ({ ofNestedChat: describe(ofNestedChat), ofWindowChat: describe(ofWindowChat), ofSession: describe(ofSession), ofMainWindow: describe(ofMainWindow) });

		const nestedChatShown = describeAll();
		windowChat.set(chatA, undefined);
		// As the changeset picker of the editor of the nested chat selects one.
		service.setChangesetId(SESSION_CHANGES_CHANGESET_ID, ofNestedChat.session.get(), ofNestedChat.chat.get());
		const windowChatShown = describeAll();
		windowChat.set(chatB, undefined);
		const nestedChatShownAgain = describeAll();

		assert.deepStrictEqual({ nestedChatShown, windowChatShown, nestedChatShownAgain }, {
			nestedChatShown: {
				ofNestedChat: { chat: '/b', changeset: 'branch', isMainWindow: false },
				ofWindowChat: { chat: '/a', changeset: 'branch', isMainWindow: false },
				ofSession: { chat: '/b', changeset: 'branch', isMainWindow: false },
				ofMainWindow: { chat: '/a', changeset: 'branch', isMainWindow: true },
			},
			windowChatShown: {
				ofNestedChat: { chat: '/b', changeset: SESSION_CHANGES_CHANGESET_ID, isMainWindow: false },
				ofWindowChat: { chat: '/a', changeset: 'branch', isMainWindow: false },
				ofSession: { chat: '/a', changeset: 'branch', isMainWindow: false },
				ofMainWindow: { chat: '/a', changeset: 'branch', isMainWindow: true },
			},
			nestedChatShownAgain: {
				ofNestedChat: { chat: '/b', changeset: SESSION_CHANGES_CHANGESET_ID, isMainWindow: false },
				ofWindowChat: { chat: '/a', changeset: 'branch', isMainWindow: false },
				ofSession: { chat: '/b', changeset: SESSION_CHANGES_CHANGESET_ID, isMainWindow: false },
				ofMainWindow: { chat: '/a', changeset: 'branch', isMainWindow: true },
			},
		});
	});

	test('getSessionChanges observes its own session independently of the active session', () => {
		const changesetA = createChangeset([upcastPartial<ISessionChangesetOperation>({ id: 'op-a', scopes: [] })]);
		const changesetB = createChangeset([upcastPartial<ISessionChangesetOperation>({ id: 'op-b', scopes: [] })]);
		const sessionA = createSession('a', { changesets: [changesetA] });
		const sessionB = createSession('b', { changesets: [changesetB] });
		const { activeSession, service } = createHarness(sessionA);
		const scopedSession = observableValue<ITestSessionWithChat | undefined>('test.scopedSession', sessionB);

		const scoped = service.getSessionChanges(scopedSession, derived(reader => scopedSession.read(reader)?.activeChat.read(reader)));
		const read = () => ({
			scopedResource: scoped.resourceObs.get()?.toString(),
			scopedChangeset: scoped.changesetOperationsObs.get().map(o => o.id).join(),
			activeResource: service.activeSessionResourceObs.get()?.toString(),
			activeChangeset: service.activeSessionChangesetOperationsObs.get().map(o => o.id).join(),
		});
		const initial = read();
		activeSession.set(sessionB, undefined);
		const activeSwitched = read();
		scopedSession.set(sessionA, undefined);
		const scopedSwitched = read();
		scopedSession.set(undefined, undefined);
		const scopedCleared = { resource: scoped.resourceObs.get(), changeset: scoped.changesetOperationsObs.get().map(o => o.id).join() };

		assert.deepStrictEqual({ initial, activeSwitched, scopedSwitched, scopedCleared }, {
			initial: { scopedResource: sessionB.resource.toString(), scopedChangeset: 'op-b', activeResource: sessionA.resource.toString(), activeChangeset: 'op-a' },
			activeSwitched: { scopedResource: sessionB.resource.toString(), scopedChangeset: 'op-b', activeResource: sessionB.resource.toString(), activeChangeset: 'op-b' },
			scopedSwitched: { scopedResource: sessionA.resource.toString(), scopedChangeset: 'op-a', activeResource: sessionB.resource.toString(), activeChangeset: 'op-b' },
			scopedCleared: { resource: undefined, changeset: '' },
		});
	});

	test('getSessionChanges counts agent feedback of its own session', () => {
		const sessionA = createSession('a');
		const sessionB = createSession('b');
		const { feedbackByResource, service } = createHarness(sessionA);
		const feedbackItem = (path: string) => upcastPartial<IAgentFeedback>({ resourceUri: URI.file(path), state: AgentFeedbackState.Created });
		feedbackByResource.set(sessionB.resource.toString(), [feedbackItem('/b.ts'), feedbackItem('/b.ts')]);
		const scopedSession = observableValue<ITestSessionWithChat | undefined>('test.scopedSession', sessionB);

		const scoped = service.getSessionChanges(scopedSession, derived(reader => scopedSession.read(reader)?.activeChat.read(reader)));

		assert.deepStrictEqual({
			scoped: [...scoped.agentFeedbackCountByFileObs.get()],
			active: [...service.activeSessionAgentFeedbackCountByFileObs.get()],
		}, {
			scoped: [[URI.file('/b.ts').fsPath, 2]],
			active: [],
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

	test('publishes reviewed files by their file resource, including deleted files', () => {
		const changes: readonly IChatSessionFileChange2[] = [
			{ uri: URI.file('/repo/modified.ts'), modifiedUri: URI.file('/repo/modified.ts'), originalUri: URI.parse('git-blob:/repo/modified.ts'), insertions: 1, deletions: 1, reviewed: true },
			{ uri: URI.file('/repo/deleted.ts'), modifiedUri: undefined, originalUri: URI.parse('git-blob:/repo/deleted.ts'), insertions: 0, deletions: 3, reviewed: true },
			{ uri: URI.file('/repo/unreviewed.ts'), modifiedUri: URI.file('/repo/unreviewed.ts'), originalUri: undefined, insertions: 2, deletions: 0, reviewed: false },
		];
		const changeset = createChangeset([], { changes: constObservable(changes) });
		const { contextKeyService } = createHarness(createSession('reviewed', { changesets: [changeset] }));

		assert.deepStrictEqual(contextKeyService.getContextKeyValue(ChangesetReviewedFilesContext.key), [
			'file:///repo/modified.ts',
			'file:///repo/deleted.ts',
		]);
	});

	test('tracks changeset snapshot availability independently of the file count', () => {
		const cachedChange = upcastPartial<ISessionFileChange>({
			modifiedUri: URI.file('/repo/cached.ts'),
		});
		const isLoadingChanges = observableValue('isLoadingChanges', true);
		const changes = observableValue<readonly ISessionFileChange[]>('changes', [cachedChange]);
		const changeset = createChangeset([], { isLoadingChanges, changes });
		const { service } = createHarness(createSession('cached', { changesets: [changeset] }));

		const beforeSnapshot = {
			changesetLoading: service.activeSessionChangesetLoadingObs.get(),
			sessionLoading: service.activeSessionLoadingObs.get(),
			changes: service.activeSessionChangesObs.get().map(change => change.modifiedUri?.toString()),
		};
		isLoadingChanges.set(false, undefined);
		const populatedSnapshot = {
			changesetLoading: service.activeSessionChangesetLoadingObs.get(),
			sessionLoading: service.activeSessionLoadingObs.get(),
			changes: service.activeSessionChangesObs.get().map(change => change.modifiedUri?.toString()),
		};
		changes.set([], undefined);
		const emptySnapshot = {
			changesetLoading: service.activeSessionChangesetLoadingObs.get(),
			sessionLoading: service.activeSessionLoadingObs.get(),
			changes: service.activeSessionChangesObs.get().map(change => change.modifiedUri?.toString()),
		};

		assert.deepStrictEqual({ beforeSnapshot, populatedSnapshot, emptySnapshot }, {
			beforeSnapshot: {
				changesetLoading: true,
				sessionLoading: true,
				changes: [],
			},
			populatedSnapshot: {
				changesetLoading: false,
				sessionLoading: false,
				changes: ['file:///repo/cached.ts'],
			},
			emptySnapshot: {
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
		const unvisitedSelection = service.activeSessionChangesetObs.get()?.id;
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
			unvisitedSelection,
			unrelatedSessionSelection,
		}, {
			mainSelection: 'branch',
			peerFallback: SESSION_CHANGES_CHANGESET_ID,
			peerSelection: TURN_CHANGES_CHANGESET_ID,
			restoredMainSelection: 'branch',
			restoredPeerSelection: TURN_CHANGES_CHANGESET_ID,
			unvisitedSelection: SESSION_CHANGES_CHANGESET_ID,
			unrelatedSessionSelection: 'branch',
		});
	});

	test('the changes of a known session that no host shows, without view state, are those of its main chat', () => {
		const changeset = createChangeset([upcastPartial<ISessionChangesetOperation>({ id: 'op-hidden', scopes: [] })]);
		const { service } = createHarness(createSession('a'));
		// A session as the management service has it: no active chat, as no host shows it
		const { activeChat: _activeChat, ...hidden } = createSession('hidden', { changesets: [changeset] });

		const changes = getChangesOfSession(service, { session: undefined, chat: undefined }, upcastPartial<ISession>(hidden));

		assert.deepStrictEqual({ resource: changes.resourceObs.get()?.toString(), operations: changes.changesetOperationsObs.get().map(operation => operation.id) }, {
			resource: hidden.resource.toString(),
			operations: ['op-hidden'],
		});
	});

	test('an explicit chat of the active session other than the one it shows has its own changes, and its own review state', () => {
		const reviewed: string[] = [];
		const changesetOf = (id: string) => ({ ...createChangeset([upcastPartial<ISessionChangesetOperation>({ id: `op-${id}`, scopes: [] })]), id, setReviewState: () => reviewed.push(id) });
		const chatOf = (id: string) => upcastPartial<IChat>({ resource: URI.from({ scheme: 'test-chat', path: `/${id}` }), changes: constObservable([]), changesets: constObservable([changesetOf(id)]), workspace: constObservable(undefined) });
		const chatA = chatOf('a');
		const chatB = chatOf('b');
		const session = createSession('session', { activeChat: constObservable(chatA), mainChat: constObservable(chatA), chats: constObservable([chatA, chatB]) });
		const { service } = createHarness(session);
		const owner = { session, chat: chatA };

		const ofB = getChangesOfSession(service, owner, session, chatB).changesetOperationsObs.get().map(operation => operation.id);
		const ofA = getChangesOfSession(service, owner, session, chatA).changesetOperationsObs.get().map(operation => operation.id);
		service.setChangesetFilesReviewState([URI.file('/repo/file.ts')], true, session, chatB);

		assert.deepStrictEqual({ ofA, ofB, reviewed }, { ofA: ['op-a'], ofB: ['op-b'], reviewed: ['b'] });
	});

	test('selects a changeset of an explicit session without affecting the active session', () => {
		const branchChangeset = { ...createChangeset([]), id: 'branch' };
		const turnChangeset = { ...createChangeset([]), id: TURN_CHANGES_CHANGESET_ID, isDefault: constObservable(false) };
		const { service } = createHarness(createSession('a', { changesets: [branchChangeset, turnChangeset] }));
		const other = createSession('b', { changesets: [branchChangeset, turnChangeset] });

		service.setChangesetId(TURN_CHANGES_CHANGESET_ID, other, other.activeChat.get());
		const otherSelection = service.getSessionChanges(constObservable(other), other.activeChat).changesetObs.get()?.id;
		const activeSelection = service.activeSessionChangesetObs.get()?.id;

		assert.deepStrictEqual({ otherSelection, activeSelection }, { otherSelection: TURN_CHANGES_CHANGESET_ID, activeSelection: 'branch' });
	});

	test('confirmed deletion removes only the exact owner when the chat catalogue is incomplete or stale', () => {
		const branch = { ...createChangeset([]), id: 'branch' };
		const turn = { ...createChangeset([]), id: TURN_CHANGES_CHANGESET_ID, isDefault: constObservable(false) };
		const main = upcastPartial<IChat>({
			resource: URI.parse('test-chat:/main'), workspace: constObservable(undefined),
			changes: constObservable([]), changesets: constObservable([branch, turn]),
		});
		const peer = { ...main, resource: URI.parse('test-chat:/peer') };
		const third = { ...main, resource: URI.parse('test-chat:/third') };
		const activeChat = observableValue<IChat>('activeChat', main);
		const chats = observableValue<readonly IChat[]>('chats', [main, peer, third]);
		const session = createSession('a', { activeChat, chats, mainChat: constObservable(main) });
		const { service, onDidDeleteChat } = createHarness(session);
		service.setChangesetId(TURN_CHANGES_CHANGESET_ID);
		activeChat.set(peer, undefined);
		service.setChangesetId('branch');
		activeChat.set(third, undefined);
		service.setChangesetId(TURN_CHANGES_CHANGESET_ID);
		activeChat.set(peer, undefined);
		chats.set([], undefined);
		onDidDeleteChat.fire({ session, sessionResource: session.resource, chatResource: main.resource });
		const retainedPeer = service.activeSessionChangesetObs.get()?.id;
		chats.set([main, peer, third], undefined);
		activeChat.set(main, undefined);
		const deletedMain = service.activeSessionChangesetObs.get()?.id;
		assert.deepStrictEqual({ retainedPeer, deletedMain }, {
			retainedPeer: 'branch', deletedMain: 'branch',
		});
	});

	test('falls back to each chat\'s own default rather than another chat\'s selection', () => {
		const createChat = (path: string, defaultId: string) => upcastPartial<IChat>({
			resource: URI.from({ scheme: 'test-chat', path }),
			workspace: constObservable(undefined),
			changes: constObservable([]),
			changesets: constObservable([BRANCH_CHANGES_CHANGESET_ID, UNCOMMITTED_CHANGES_CHANGESET_ID, SESSION_CHANGES_CHANGESET_ID].map(id => ({
				...createChangeset([]),
				id,
				isDefault: constObservable(id === defaultId),
			}))),
		});
		const mainChat = createChat('/main', BRANCH_CHANGES_CHANGESET_ID);
		const nestedChat = createChat('/nested', SESSION_CHANGES_CHANGESET_ID);
		const activeChat = observableValue<IChat>('test.activeChat', mainChat);
		const { service } = createHarness(createSession('a', {
			activeChat,
			mainChat: constObservable(mainChat),
			chats: constObservable([mainChat, nestedChat]),
		}));
		const selected = () => service.activeSessionChangesetObs.get()?.id;

		const mainDefault = selected();
		activeChat.set(nestedChat, undefined);
		const nestedDefault = selected();
		service.setChangesetId(UNCOMMITTED_CHANGES_CHANGESET_ID);
		activeChat.set(mainChat, undefined);
		const mainAfterNestedPick = selected();
		service.setChangesetId(SESSION_CHANGES_CHANGESET_ID);
		activeChat.set(nestedChat, undefined);
		const nestedAfterMainPick = selected();

		assert.deepStrictEqual({ mainDefault, nestedDefault, mainAfterNestedPick, nestedAfterMainPick }, {
			mainDefault: BRANCH_CHANGES_CHANGESET_ID,
			nestedDefault: SESSION_CHANGES_CHANGESET_ID,
			mainAfterNestedPick: BRANCH_CHANGES_CHANGESET_ID,
			nestedAfterMainPick: UNCOMMITTED_CHANGES_CHANGESET_ID,
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

	test('preserves branch changes while a same-scope chat that selected them loads its catalogue', () => {
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

		activeChat.set(peerChat, undefined);
		service.setChangesetId(BRANCH_CHANGES_CHANGESET_ID);
		activeChat.set(mainChat, undefined);
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
		activeChat.set(mainChat, undefined);
		activeChat.set(sameScopePeer, undefined);
		const unselectedSameScope = snapshot();

		assert.deepStrictEqual({ sessionOwnedChanges, uncommittedChanges, differentWorkspace, unselectedSameScope }, {
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
			unselectedSameScope: {
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

	test('keeps projected session changes for multi-folder sessions', () => {
		const branchChangeset = { ...createChangeset([]), id: BRANCH_CHANGES_CHANGESET_ID };
		const sessionChangeset = { ...createChangeset([], { resource: URI.parse('changeset:/session') }), id: SESSION_CHANGES_CHANGESET_ID };
		const turnChangeset = { ...createChangeset([]), id: TURN_CHANGES_CHANGESET_ID };
		const chatWorkspace = createWorkspace('/repo-a');
		const multiFolderWorkspace = upcastPartial<ISessionWorkspace>({
			folders: [
				...chatWorkspace.folders,
				...createWorkspace('/repo-b').folders,
			],
		});
		const chat = upcastPartial<IChat>({
			resource: URI.from({ scheme: 'test-chat', path: '/multi-folder' }),
			workspace: constObservable(chatWorkspace),
			changes: constObservable([]),
			changesets: constObservable([branchChangeset, sessionChangeset, turnChangeset]),
		});
		const { service } = createHarness(createSession('multi-folder', {
			workspace: multiFolderWorkspace,
			activeChat: constObservable(chat),
			mainChat: constObservable(chat),
			chats: constObservable([chat]),
		}));

		assert.deepStrictEqual(
			service.activeSessionChangesetsObs.get()?.map(changeset => changeset.id),
			[BRANCH_CHANGES_CHANGESET_ID, SESSION_CHANGES_CHANGESET_ID, TURN_CHANGES_CHANGESET_ID],
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

	test('keeps the changeset loading while the next session catalogue is unpublished', () => {
		const cachedChange = upcastPartial<ISessionFileChange>({
			modifiedUri: URI.file('/repo/cached.ts'),
		});
		const firstChangeset = createChangeset([], {
			changes: constObservable([cachedChange]),
		});
		const pendingChangesets = observableValue<readonly ISessionChangeset[] | undefined>('test.pendingChangesets', undefined);
		const nextChat = upcastPartial<IChat>({
			resource: URI.parse('test-chat:/next'),
			workspace: constObservable(undefined),
			changes: constObservable([]),
			changesets: pendingChangesets,
		});
		const nextSession = createSession('next', {
			activeChat: constObservable(nextChat),
			mainChat: constObservable(nextChat),
			chats: constObservable([nextChat]),
		});
		const { activeSession, service } = createHarness(createSession('first', { changesets: [firstChangeset] }));
		const snapshot = () => ({
			loading: service.activeSessionChangesetLoadingObs.get(),
			changes: service.activeSessionChangesObs.get().map(change => change.modifiedUri?.toString()),
		});

		const beforeSwitch = snapshot();
		activeSession.set(nextSession, undefined);
		const unpublished = snapshot();
		pendingChangesets.set([], undefined);
		const authoritativeEmpty = snapshot();

		assert.deepStrictEqual({ beforeSwitch, unpublished, authoritativeEmpty }, {
			beforeSwitch: { loading: false, changes: ['file:///repo/cached.ts'] },
			unpublished: { loading: true, changes: [] },
			authoritativeEmpty: { loading: false, changes: [] },
		});
	});

	test('retains picker data until the next session publishes its catalogue', () => {
		const branchChangeset = createChangeset([]);
		const selectedChangeset = { ...createChangeset([]), id: 'selected', label: 'Selected Changes', isDefault: constObservable(false) };
		const nextChangeset = { ...createChangeset([]), id: 'next', label: 'Next Changes' };
		const pendingChangesets = observableValue<readonly ISessionChangeset[] | undefined>('test.pendingChangesets', undefined);
		const loading = observableValue('test.loading', true);
		const nextChat = upcastPartial<IChat>({
			resource: URI.parse('test-chat:/next'),
			workspace: constObservable(undefined),
			changes: constObservable([]),
			changesets: pendingChangesets,
		});
		const nextSession = createSession('next', {
			activeChat: constObservable(nextChat),
			mainChat: constObservable(nextChat),
			chats: constObservable([nextChat]),
			loading,
		});
		const firstSession = createSession('first', {
			workspace: createWorkspace('/repo'),
			changesets: [branchChangeset, selectedChangeset],
		});
		const { activeSession, service } = createHarness(firstSession);
		service.setChangesetId(selectedChangeset.id);
		const pickerState = () => ({
			changesets: service.activeSessionChangesetsObs.get()?.map(changeset => changeset.id),
			catalogueLoading: service.activeSessionChangesetsLoadingObs.get(),
			selected: service.activeSessionChangesetObs.get()?.id,
		});

		const beforeSwitch = pickerState();
		activeSession.set(nextSession, undefined);
		const unpublished = pickerState();
		pendingChangesets.set([], undefined);
		const emptyWhileLoading = pickerState();
		pendingChangesets.set([nextChangeset], undefined);
		const publishedWhileLoading = pickerState();
		loading.set(false, undefined);
		const published = pickerState();
		pendingChangesets.set([], undefined);
		const authoritativeEmpty = pickerState();
		activeSession.set(firstSession, undefined);
		const restored = pickerState();
		activeSession.set(undefined, undefined);
		const noSession = pickerState();

		assert.deepStrictEqual({ beforeSwitch, unpublished, emptyWhileLoading, publishedWhileLoading, published, authoritativeEmpty, restored, noSession }, {
			beforeSwitch: { changesets: ['branch', 'selected'], catalogueLoading: false, selected: 'selected' },
			unpublished: { changesets: ['branch', 'selected'], catalogueLoading: true, selected: undefined },
			emptyWhileLoading: { changesets: [], catalogueLoading: false, selected: undefined },
			publishedWhileLoading: { changesets: ['next'], catalogueLoading: false, selected: 'next' },
			published: { changesets: ['next'], catalogueLoading: false, selected: 'next' },
			authoritativeEmpty: { changesets: [], catalogueLoading: false, selected: undefined },
			restored: { changesets: ['branch', 'selected'], catalogueLoading: false, selected: 'selected' },
			noSession: { changesets: undefined, catalogueLoading: true, selected: undefined },
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

	test('shows the Agent Host merge operation only when the base branch is known to be unprotected', () => {
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
		const { activeSession, service } = createHarness(protectedSession);

		const visibleOperations = [service.activeSessionChangesetOperationsObs.get().map(operation => operation.id)];
		activeSession.set(unknown, undefined);
		visibleOperations.push(service.activeSessionChangesetOperationsObs.get().map(operation => operation.id));
		activeSession.set(unprotected, undefined);
		visibleOperations.push(service.activeSessionChangesetOperationsObs.get().map(operation => operation.id));

		assert.deepStrictEqual(visibleOperations, [
			['create-pr'],
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

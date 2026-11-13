/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { hash } from '../../../../../base/common/hash.js';
import { IDisposable, IReference, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, ISettableObservable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { IChatModelReference, IChatPlanReview, IChatService, IChatToolInvocation } from '../../../chat/common/chatService/chatService.js';
import { IChatSessionsService } from '../../../chat/common/chatSessionsService.js';
import { ChatAgentLocation } from '../../../chat/common/constants.js';
import { ChatResponseModelChangeReason, IChatChangeEvent, IChatModel, IChatRequestModel, IChatResponseModel } from '../../../chat/common/model/chatModel.js';
import { SessionsListModelService } from '../../browser/sessionsListModelService.js';
import { GitHubPullRequestCIModel } from '../../browser/github/models/githubPullRequestCIModel.js';
import { GitHubPullRequestModel } from '../../browser/github/models/githubPullRequestModel.js';
import { GitHubPullRequestReviewThreadsModel } from '../../browser/github/models/githubPullRequestReviewThreadsModel.js';
import { IGitHubService } from '../../browser/github/githubService.js';
import { GitHubCIOverallStatus, GitHubPullRequestState, IGitHubPullRequest, IGitHubPullRequestReviewThread } from '../../common/github/types.js';
import { InboxNotificationPriority, InboxTab } from '../../common/sessionAttentionService.js';
import { getSessionInboxActivity, isSessionInboxStateCurrent, SessionInboxState } from '../../common/sessionInbox.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../../common/sessionsManagement.js';
import { IChatEntitlementService, IChatSentiment } from '../../../../services/chat/common/chatEntitlementService.js';
import { IChat, IGitHubInfo, ISession, ISessionArtifact, ISessionWorkspace, SessionStatus } from '../../../../services/sessions/common/session.js';
import { SessionAttentionService } from '../../browser/sessionAttentionService.js';

suite('SessionAttentionService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const attentionStartTimeStorageKey = 'sessions.inboxNotifications.attentionStartTime';

	function createSession(id: string, status = SessionStatus.Completed, updatedAt = 100, pullRequests: readonly { number: number; owned?: boolean; state?: GitHubPullRequestState }[] = []): ISession {
		const chat = upcastPartial<IChat>({ resource: URI.parse(`test:///chat/${id}`), status: observableValue('chat.status', status) });
		const gitHubInfo: IGitHubInfo = {
			owner: 'owner', repo: 'repo',
			pullRequests: pullRequests.map(ref => ({
				owner: 'owner', repo: 'repo', number: ref.number, state: ref.state ?? GitHubPullRequestState.Open,
				uri: URI.parse(`https://github.com/owner/repo/pull/${ref.number}`),
				createdByThisSession: ref.owned ?? true,
			})),
		};
		return upcastPartial<ISession>({
			sessionId: id,
			resource: URI.parse(`test:///session/${id}`),
			status: observableValue('session.status', status),
			loading: observableValue('session.loading', false),
			updatedAt: observableValue('session.updatedAt', new Date(updatedAt)),
			lastTurnEnd: observableValue('session.lastTurnEnd', new Date(updatedAt)),
			isArchived: observableValue('session.archived', false),
			isRead: observableValue('session.read', false),
			chats: observableValue('session.chats', [chat]),
			artifacts: observableValue<readonly ISessionArtifact[]>('session.artifacts', []),
			workspace: observableValue<ISessionWorkspace | undefined>('session.workspace', pullRequests.length ? {
				uri: URI.parse(`test:///workspace/${id}`), label: id, icon: Codicon.folder,
				folders: [{
					root: URI.parse(`test:///workspace/${id}`), workingDirectory: URI.parse(`test:///workspace/${id}`), name: id, description: undefined,
					gitRepository: {
						uri: URI.parse(`test:///workspace/${id}`), workTreeUri: undefined, baseBranchName: undefined,
						gitHubInfo: observableValue('gitHubInfo', gitHubInfo),
					},
				}],
				requiresWorkspaceTrust: false, isVirtualWorkspace: false,
			} : undefined),
		});
	}

	function createFixture(initialSessions: readonly ISession[], storage = store.add(new InMemoryStorageService())) {
		const sessionsChanged = store.add(new Emitter<ISessionsChangeEvent>());
		const contentProvidersChanged = store.add(new Emitter<{ added: string[]; removed: string[] }>());
		let sessions = initialSessions;
		const chat = new TestChatService();
		const github = new TestGitHubService();
		const sentiment = observableValue<IChatSentiment>('sentiment', {});
		const sessionsManagement = upcastPartial<ISessionsManagementService>({
			onDidChangeSessions: sessionsChanged.event, onDidDeleteSession: Event.None, onDidReplaceSession: Event.None, getSessions: () => [...sessions],
		});
		const service = store.add(new SessionAttentionService(
			sessionsManagement,
			upcastPartial<IChatService>(chat),
			upcastPartial<IGitHubService>(github),
			storage,
			upcastPartial<IChatEntitlementService>({ sentimentObs: sentiment }),
			upcastPartial<IChatSessionsService>({ onDidChangeContentProviderSchemes: contentProvidersChanged.event }),
		));
		return {
			service, chat, github, sentiment, storage, contentProvidersChanged,
			createListModel() {
				return store.add(new SessionsListModelService(storage, sessionsManagement, new TestConfigurationService(), service));
			},
			setSessions(value: readonly ISession[]) {
				sessions = value;
				sessionsChanged.fire({ added: [], removed: [], changed: [...sessions] });
			},
			observe() {
				return store.add(autorun(reader => service.sessionAttention.read(reader)));
			},
		};
	}

	test('history cutoff starts on first visible demand and survives late history, metadata changes, new turns and restart', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const old = createSession('old', SessionStatus.Completed, Date.now() - 1);
		const fixture = createFixture([]);
		fixture.sentiment.set({ hidden: true }, undefined);
		const lease = store.add(fixture.service.acquireSessionAttention());
		const whileHidden = fixture.storage.getNumber(attentionStartTimeStorageKey, StorageScope.PROFILE);
		fixture.sentiment.set({}, undefined);
		const start = fixture.storage.getNumber(attentionStartTimeStorageKey, StorageScope.PROFILE)!;
		const boundary = createSession('boundary', SessionStatus.Completed, start);
		const late = createSession('late', SessionStatus.Completed, start - 2);
		const pending = createSession('pending', SessionStatus.NeedsInput, start - 2);
		fixture.setSessions([old, boundary, late, pending]);
		const historical = (service: SessionAttentionService) => [...service.sessionAttention.get()].filter(([, value]) => value.isHistoricalCompletion).map(([id]) => id);
		const initial = historical(fixture.service);
		(old.updatedAt as ISettableObservable<Date>).set(new Date(start + 1), undefined);
		(old.isRead as ISettableObservable<boolean>).set(true, undefined);
		const metadata = historical(fixture.service);
		transaction(tx => {
			(old.status as ISettableObservable<SessionStatus>).set(SessionStatus.InProgress, tx);
			(old.lastTurnEnd as ISettableObservable<Date | undefined>).set(undefined, tx);
		});
		const working = historical(fixture.service);
		transaction(tx => {
			(old.status as ISettableObservable<SessionStatus>).set(SessionStatus.Completed, tx);
			(old.lastTurnEnd as ISettableObservable<Date | undefined>).set(new Date(start + 1), tx);
		});
		lease.dispose();
		fixture.service.dispose();
		await timeout(1000);
		const restored = createFixture([old, boundary, late, pending, createSession('offline', SessionStatus.Completed, start + 500)], fixture.storage);
		store.add(restored.service.acquireSessionAttention());
		assert.deepStrictEqual({
			whileHidden, initial, metadata, working, restored: historical(restored.service),
			cutoff: restored.storage.getNumber(attentionStartTimeStorageKey, StorageScope.PROFILE),
			canvasCutoff: restored.storage.getNumber('sessions.inboxNotifications.completionStartTime', StorageScope.APPLICATION),
		}, { whileHidden: undefined, initial: ['old', 'late'], metadata: ['old', 'late'], working: ['late'], restored: ['late'], cutoff: start, canvasCutoff: undefined });
	}));

	test('reading Inbox completions does not dismiss them across restart', () => runWithFakedTimers({ startTime: new Date(2026, 10, 11, 12).getTime() }, async () => {
		const fixture = createFixture([]);
		store.add(fixture.service.acquireSessionAttention());
		const start = Date.now();
		await timeout(1000);
		const read = createSession('read', SessionStatus.Completed, Date.now());
		const unread = createSession('unread', SessionStatus.Completed, Date.now());
		const actionable = createSession('actionable', SessionStatus.Completed, Date.now(), [{ number: 42 }]);
		(read.isRead as ISettableObservable<boolean>).set(true, undefined);
		(actionable.isRead as ISettableObservable<boolean>).set(true, undefined);
		fixture.setSessions([read, unread, actionable]);
		const model = fixture.createListModel();
		const initial = [read, unread, actionable].map(session => model.getInboxState(session)?.kind);
		fixture.service.dispose();
		await timeout(1000);
		const restored = createFixture([read, unread, actionable], fixture.storage);
		restored.github.setPullRequest(42, openPullRequest(42));
		restored.github.setCIStatus(42, GitHubCIOverallStatus.Failure);
		store.add(restored.service.acquireSessionAttention());
		await timeout(0);
		const restoredModel = restored.createListModel();
		const afterRestart = [read, unread, actionable].map(session => restoredModel.getInboxState(session)?.kind);
		await timeout(1000);
		(read.lastTurnEnd as ISettableObservable<Date | undefined>).set(new Date(Date.now()), undefined);
		assert.deepStrictEqual({
			initial, afterRestart, newCompletion: restoredModel.getInboxState(read)?.kind,
			cutoff: restored.storage.getNumber(attentionStartTimeStorageKey, StorageScope.PROFILE),
		}, {
			initial: [undefined, undefined, undefined], afterRestart: [undefined, undefined, undefined],
			newCompletion: undefined, cutoff: start,
		});
	}));

	test('non-PR completions keep notification identities empty across metadata, model residency and new turns', () => {
		const session = createSession('complete');
		const fixture = createFixture([session]);
		store.add(fixture.service.acquireSessionAttention());
		const state = () => fixture.service.sessionAttention.get().get('complete');
		const initial = state();
		(session.updatedAt as ISettableObservable<Date>).set(new Date(200), undefined);
		(session.isRead as ISettableObservable<boolean>).set(true, undefined);
		fixture.chat.setRequests(session.chats.get()[0].resource, []);
		const resident = state();
		fixture.chat.removeSession(session.chats.get()[0].resource);
		const unloaded = state();
		(session.lastTurnEnd as ISettableObservable<Date | undefined>).set(new Date(300), undefined);
		assert.deepStrictEqual({ initial, resident, unloaded, next: state()?.notificationIds, loaded: fixture.chat.acquired }, {
			initial: { tab: InboxTab.ReadyForYou, priority: InboxNotificationPriority.Later, notificationIds: [], isHistoricalCompletion: true },
			resident: initial, unloaded: initial, next: [], loaded: [],
		});
	});

	test('reading sessions returned by activity still requires dismissal after restart', () => runWithFakedTimers({ startTime: new Date(2026, 10, 11, 12).getTime() }, async () => {
		const fixture = createFixture([]);
		store.add(fixture.service.acquireSessionAttention());
		await timeout(1000);
		const sessions = ['read', 'unread', 'explicit', 'snoozed'].map(id => createSession(id, SessionStatus.Completed, Date.now()));
		fixture.setSessions(sessions);
		const model = fixture.createListModel();
		model.setInboxState(sessions, 'done');
		await timeout(1000);
		for (const session of sessions) {
			(session.lastTurnEnd as ISettableObservable<Date | undefined>).set(new Date(Date.now()), undefined);
		}
		for (const session of [sessions[0], sessions[2], sessions[3]]) {
			(session.isRead as ISettableObservable<boolean>).set(true, undefined);
		}
		model.setInboxState([sessions[2]], undefined);
		model.setInboxState([sessions[3]], Date.now() + 100);
		await timeout(101);
		const before = sessions.map(session => model.getInboxState(session)?.kind);
		model.dispose();
		fixture.service.dispose();
		await timeout(1000);
		const restored = createFixture(sessions, fixture.storage);
		store.add(restored.service.acquireSessionAttention());
		const restoredModel = restored.createListModel();
		const after = sessions.map(session => restoredModel.getInboxState(session)?.kind);
		restoredModel.setInboxState([sessions[0]], 'done');
		restoredModel.dispose();
		const reloadedModel = restored.createListModel();
		const dismissed = reloadedModel.getInboxState(sessions[0])?.kind;
		await timeout(1000);
		(sessions[0].lastTurnEnd as ISettableObservable<Date | undefined>).set(new Date(Date.now()), undefined);
		assert.deepStrictEqual({ before, after, dismissed, newCompletion: reloadedModel.getInboxState(sessions[0])?.kind }, {
			before: [undefined, undefined, undefined, undefined],
			after: [undefined, undefined, undefined, undefined],
			dismissed: 'done',
			newCompletion: undefined,
		});
	}));

	test('existing completed-session triage stays current until provider activity changes', () => {
		const session = createSession('complete');
		const fixture = createFixture([session]);
		const activity = getSessionInboxActivity(session);
		const decisions: SessionInboxState[] = [
			{ kind: 'done', activity, notificationIds: [] },
			{ kind: 'untilActivity', activity, notificationIds: [] },
			{ kind: 'done', activity, notificationIds: ['complete:completed:100'] },
		];
		store.add(fixture.service.acquireSessionAttention());
		const current = () => decisions.map(decision => isSessionInboxStateCurrent(
			decision, session, Date.now(), undefined, fixture.service.sessionAttention.get().get(session.sessionId),
		));
		const baseline = current();
		(session.isRead as ISettableObservable<boolean>).set(true, undefined);
		fixture.chat.setRequests(session.chats.get()[0].resource, []);
		const resident = current();
		fixture.chat.removeSession(session.chats.get()[0].resource);
		const unloaded = current();
		(session.lastTurnEnd as ISettableObservable<Date | undefined>).set(new Date(300), undefined);
		assert.deepStrictEqual({ baseline, resident, unloaded, nextTurn: current(), nextIds: fixture.service.sessionAttention.get().get(session.sessionId)!.notificationIds }, {
			baseline: [true, true, true], resident: [true, true, true], unloaded: [true, true, true],
			nextTurn: [false, false, false], nextIds: [],
		});
	});

	test('attention demand is ref-counted and releases polling while hidden or without demand', async () => {
		const fixture = createFixture([
			createSession('input', SessionStatus.NeedsInput),
			createSession('working', SessionStatus.InProgress),
			createSession('old'),
			createSession('pr', SessionStatus.Completed, 100, [{ number: 42 }]),
		]);
		fixture.github.setPullRequest(42, openPullRequest(42));
		fixture.github.setCIStatus(42, GitHubCIOverallStatus.Success);
		const polling = [fixture.github.pollingCount];
		const first = store.add(fixture.service.acquireSessionAttention());
		const second = store.add(fixture.service.acquireSessionAttention());
		await timeout(0);
		const attention = [...fixture.service.sessionAttention.get()].map(([id, value]) => [id, value.tab, value.priority, value.isHistoricalCompletion]);
		polling.push(fixture.github.pollingCount);
		first.dispose();
		polling.push(fixture.github.pollingCount);
		fixture.sentiment.set({ hidden: true }, undefined);
		const hidden = fixture.service.sessionAttention.get().size;
		polling.push(fixture.github.pollingCount);
		fixture.sentiment.set({}, undefined);
		polling.push(fixture.github.pollingCount);
		second.dispose();
		polling.push(fixture.github.pollingCount);
		assert.deepStrictEqual({ attention, polling, hidden, released: fixture.service.sessionAttention.get().size }, {
			attention: [
				['input', InboxTab.ReadyForYou, InboxNotificationPriority.Now, false],
				['working', InboxTab.Working, InboxNotificationPriority.Later, false],
				['old', InboxTab.ReadyForYou, InboxNotificationPriority.Later, true],
				['pr', InboxTab.ReadyToMerge, InboxNotificationPriority.Next, false],
			],
			polling: [0, 3, 3, 0, 3, 0], hidden: 0, released: 0,
		});
	});

	for (const stop of ['release', 'hidden', 'removed', 'disposed'] as const) {
		test(`disposes an in-flight input model arriving after demand is ${stop}`, async () => {
			const fixture = createFixture([createSession('input', SessionStatus.NeedsInput)]);
			const pending = new DeferredPromise<IChatModelReference>();
			let token: CancellationToken | undefined;
			fixture.chat.acquire = async (_resource, value) => { token = value; return pending.p; };
			const lease = store.add(fixture.service.acquireSessionAttention());
			let disposed = false;
			if (stop === 'release') {
				lease.dispose();
			} else if (stop === 'hidden') {
				fixture.sentiment.set({ hidden: true }, undefined);
			} else if (stop === 'removed') {
				fixture.setSessions([]);
			} else {
				fixture.service.dispose();
			}
			const cancelled = token?.isCancellationRequested;
			await pending.complete({ object: upcastPartial<IChatModel>({}), dispose: () => { disposed = true; } });
			await timeout(0);
			assert.deepStrictEqual({ cancelled, disposed }, { cancelled: true, disposed: true });
		});
	}

	test('releases retained input references when hiding AI and reacquires on renewed demand', async () => {
		const fixture = createFixture([createSession('input', SessionStatus.NeedsInput)]);
		let references = 0;
		fixture.chat.acquire = async () => {
			references++;
			return { object: upcastPartial<IChatModel>({}), dispose: () => { references--; } };
		};
		const lease = store.add(fixture.service.acquireSessionAttention());
		await timeout(0);
		const loaded = references;
		fixture.sentiment.set({ hidden: true }, undefined);
		const hidden = references;
		fixture.sentiment.set({}, undefined);
		await timeout(0);
		const restored = references;
		lease.dispose();
		assert.deepStrictEqual({ loaded, hidden, restored, released: references }, { loaded: 1, hidden: 0, restored: 1, released: 0 });
	});

	test('provider removal cancels acquisition and retries only after registration and old acquisition settle', async () => {
		const fixture = createFixture([createSession('input', SessionStatus.NeedsInput)]);
		const pending = new DeferredPromise<IChatModelReference>();
		let disposed = 0;
		let loads = 0;
		fixture.chat.acquire = async () => {
			loads++;
			return loads === 1 ? pending.p : { object: upcastPartial<IChatModel>({}), dispose: () => { disposed++; } };
		};
		store.add(fixture.service.acquireSessionAttention());
		fixture.contentProvidersChanged.fire({ added: [], removed: ['test'] });
		fixture.contentProvidersChanged.fire({ added: ['test'], removed: [] });
		const beforeSettlement = loads;
		await pending.complete({ object: upcastPartial<IChatModel>({}), dispose: () => { disposed++; } });
		await timeout(0);
		fixture.contentProvidersChanged.fire({ added: [], removed: ['test'] });
		assert.deepStrictEqual({ beforeSettlement, loads, disposed }, { beforeSettlement: 1, loads: 2, disposed: 2 });
	});

	test('pending identities refine during hydration and structural streaming without a catalog update', () => {
		const session = createSession('input', SessionStatus.NeedsInput);
		const fixture = createFixture([session]);
		store.add(fixture.service.acquireSessionAttention());
		fixture.observe();
		const ids = () => fixture.service.sessionAttention.get().get('input')!.notificationIds;
		const fallback = ids();
		const changed = store.add(new Emitter<IChatChangeEvent>());
		let requests: IChatRequestModel[] = [];
		fixture.chat.setModel(session.chats.get()[0].resource, upcastPartial<IChatModel>({
			onDidChange: changed.event, getRequests: () => requests,
		}));
		requests = [pendingRequest('r', [question('one')])];
		changed.fire({ kind: 'addRequest', request: requests[0] });
		const hydrated = ids();
		requests = [pendingRequest('r', [question('two')])];
		changed.fire({ kind: 'changedRequest', request: requests[0] });
		assert.deepStrictEqual({ fallback, hydrated, next: ids() }, {
			fallback: ['input:needsInput:100'], hydrated: ['input:needsInput:qc:r:one'], next: ['input:needsInput:qc:r:two'],
		});
	});

	for (const action of ['done', 'untilActivity'] as const) {
		for (const initiallyHydrated of [false, true]) {
			test(`persisted ${action} survives delayed input hydration after triaging ${initiallyHydrated ? 'hydrated' : 'provisional'} input`, async () => {
				const session = createSession('input', SessionStatus.NeedsInput);
				const resource = session.chats.get()[0].resource;
				const original = createFixture([session]);
				if (initiallyHydrated) {
					original.chat.setRequests(resource, [pendingRequest('r', [question('one')])]);
				}
				store.add(original.service.acquireSessionAttention());
				const list = original.createListModel();
				list.setInboxState([session], action);
				list.dispose();
				original.service.dispose();

				const restored = createFixture([session], original.storage);
				const pending = new DeferredPromise<IChatModelReference>();
				restored.chat.acquire = async () => pending.p;
				const restoredList = restored.createListModel();
				store.add(restored.service.acquireSessionAttention());
				const provisional = restoredList.getInboxState(session)?.kind;
				restored.chat.setRequests(resource, [pendingRequest('r', [question('one')])]);
				await pending.complete({ object: restored.chat.getSession(resource)!, dispose: () => { } });
				await timeout(0);
				const hydrated = restoredList.getInboxState(session)?.kind;
				restoredList.dispose();
				const reloadedList = restored.createListModel();
				const reloaded = reloadedList.getInboxState(session)?.kind;
				restored.chat.setRequests(resource, [pendingRequest('r', [question('two')])]);
				assert.deepStrictEqual({ provisional, hydrated, reloaded, newInput: reloadedList.getInboxState(session)?.kind }, {
					provisional: action, hydrated: action, reloaded: action, newInput: undefined,
				});
			});
		}

		for (const kind of ['question', 'plan'] as const) {
			test(`${action} expires on a response-only ${kind} change and releases response listeners`, () => {
				const session = createSession('input', SessionStatus.NeedsInput);
				const fixture = createFixture([session]);
				const changed = store.add(new Emitter<ChatResponseModelChangeReason>());
				const part = (id: string) => kind === 'question' ? question(id)
					: upcastPartial<IChatPlanReview>({ kind: 'planReview', isUsed: false, resolveId: id });
				const parts = [part('one')];
				const request = pendingRequest('r', parts, 10, changed.event);
				fixture.chat.setRequests(session.chats.get()[0].resource, [request]);
				const lease = store.add(fixture.service.acquireSessionAttention());
				const list = fixture.createListModel();
				list.setInboxState([session], action);
				const before = list.getInboxState(session)?.kind;
				const listening = changed.hasListeners();
				parts.splice(0, 1, part('two'));
				changed.fire({ reason: 'other' });
				const after = list.getInboxState(session)?.kind;
				const next = fixture.service.sessionAttention.get().get(session.sessionId)!.notificationIds;
				lease.dispose();
				assert.deepStrictEqual({ before, listening, after, next, released: !changed.hasListeners() }, {
					before: action, listening: true, after: undefined,
					next: [`input:needsInput:${kind === 'question' ? 'qc' : 'pr'}:r:two`], released: true,
				});
			});
		}
	}

	test('triage before hydration remains undoable after its identity is refined', () => {
		const session = createSession('input', SessionStatus.NeedsInput);
		const fixture = createFixture([session]);
		store.add(fixture.service.acquireSessionAttention());
		const list = fixture.createListModel();
		const undo = list.setInboxState([session], 'done');
		fixture.chat.setRequests(session.chats.get()[0].resource, [pendingRequest('r', [question('one')])]);
		const hydrated = list.getInboxState(session)?.kind;
		undo();
		assert.deepStrictEqual({ hydrated, undone: list.getInboxState(session)?.kind }, { hydrated: 'done', undone: undefined });
	});

	test('input identities distinguish approvals, confirmation precedence, successive plans and question fallback keys', () => {
		const session = createSession('input', SessionStatus.NeedsInput);
		const fixture = createFixture([session]);
		store.add(fixture.service.acquireSessionAttention());
		const resource = session.chats.get()[0].resource;
		const identity = (parts: IChatResponseModel['response']['value']) => {
			fixture.chat.setRequests(resource, [pendingRequest('r', parts)]);
			return fixture.service.sessionAttention.get().get('input')!.notificationIds[0];
		};
		const approval = observableValue<IChatToolInvocation.State>('approval', upcastPartial<IChatToolInvocation.State>({ type: IChatToolInvocation.StateKind.WaitingForConfirmation }));
		const tool = upcastPartial<IChatToolInvocation>({ kind: 'toolInvocation', toolCallId: 'tool', state: approval });
		const execution = identity([tool]);
		approval.set(upcastPartial<IChatToolInvocation.State>({ type: IChatToolInvocation.StateKind.WaitingForPostApproval }), undefined);
		const result = identity([tool]);
		const confirmation = identity([question('q'), { kind: 'confirmation', title: '  Confirm   action ', message: '', data: {} }]);
		const firstPlan = identity([upcastPartial<IChatPlanReview>({ kind: 'planReview', isUsed: false })]);
		const nextPlan = identity([{ kind: 'markdownContent', content: { value: '' } }, upcastPartial<IChatPlanReview>({ kind: 'planReview', isUsed: false })]);
		const resolvedPlan = identity([upcastPartial<IChatPlanReview>({ kind: 'planReview', isUsed: false, resolveId: 'plan' })]);
		const fallbackQuestion = identity([{ ...question(''), resolveId: undefined }]);
		assert.deepStrictEqual({ execution, result, confirmation, firstPlan, nextPlan, resolvedPlan, fallbackQuestion }, {
			execution: 'input:needsInput:tc:r:tool:execution', result: 'input:needsInput:tc:r:tool:result',
			confirmation: `input:needsInput:cf:r:${hash('Confirm action')}`,
			firstPlan: 'input:needsInput:pr:r:0', nextPlan: 'input:needsInput:pr:r:1', resolvedPlan: 'input:needsInput:pr:r:plan',
			fallbackQuestion: `input:needsInput:qc:r:${hash('q')}`,
		});
	});

	test('scans waiting chats first, chooses the oldest pending request and ignores answered or hidden responses', () => {
		const session = createSession('input', SessionStatus.NeedsInput);
		const fixture = createFixture([session]);
		const first = session.chats.get()[0];
		const second = upcastPartial<IChat>({ resource: URI.parse('test:///chat/second'), status: observableValue('second.status', SessionStatus.NeedsInput) });
		(session.chats as ISettableObservable<readonly IChat[]>).set([first, second], undefined);
		fixture.chat.setRequests(first.resource, [pendingRequest('new', [question('new')], 20)]);
		fixture.chat.setRequests(second.resource, [pendingRequest('old', [question('old')], 10)]);
		store.add(fixture.service.acquireSessionAttention());
		const ids = () => fixture.service.sessionAttention.get().get('input')!.notificationIds;
		const oldest = ids();
		(second.status as ISettableObservable<SessionStatus>).set(SessionStatus.Completed, undefined);
		const waitingOnly = ids();
		const hidden = pendingRequest('hidden', [question('hidden')]);
		fixture.chat.setRequests(first.resource, [
			upcastPartial<IChatRequestModel>({ ...hidden, isHiddenFromTranscript: true }),
			pendingRequest('used', [{ ...question('used'), isUsed: true }]),
			pendingRequest('empty', [{ ...question('empty'), questions: [] }]),
			upcastPartial<IChatRequestModel>({ ...pendingRequest('cancelled', [question('cancelled')]), response: upcastPartial<IChatResponseModel>({ ...hidden.response, isCanceled: true }) }),
			upcastPartial<IChatRequestModel>({ ...pendingRequest('complete-plan', [upcastPartial<IChatPlanReview>({ kind: 'planReview', isUsed: false })]), response: upcastPartial<IChatResponseModel>({ ...pendingRequest('complete-plan', [upcastPartial<IChatPlanReview>({ kind: 'planReview', isUsed: false })]).response, isComplete: true }) }),
		]);
		assert.deepStrictEqual({ oldest, waitingOnly, ignored: ids(), acquired: fixture.chat.acquired }, {
			oldest: ['input:needsInput:qc:old:old'], waitingOnly: ['input:needsInput:qc:new:new'], ignored: ['input:needsInput:100'], acquired: [],
		});
	});

	test('PR attention tracks CI, drafts, Copilot review identities, merging and new completions', () => {
		const session = createSession('pr', SessionStatus.Completed, 100, [{ number: 42 }]);
		const fixture = createFixture([session]);
		store.add(fixture.service.acquireSessionAttention());
		fixture.github.setPullRequest(42, openPullRequest(42));
		const state = () => {
			const attention = fixture.service.sessionAttention.get().get('pr')!;
			return [attention.tab, attention.priority, attention.isHistoricalCompletion, attention.notificationIds];
		};
		fixture.github.setCIStatus(42, GitHubCIOverallStatus.Failure);
		const failing = state();
		fixture.github.setCIStatus(42, GitHubCIOverallStatus.Success);
		const passing = state();
		const threads = [reviewThread('copilot[bot]')];
		fixture.github.setReviewThreads(42, threads);
		const review = state();
		(session.updatedAt as ISettableObservable<Date>).set(new Date(200), undefined);
		const metadata = state();
		fixture.github.setReviewThreads(42, [reviewThread('human')]);
		const resolved = state();
		fixture.github.setPullRequest(42, { ...openPullRequest(42), isDraft: true });
		const draft = state();
		fixture.github.setPullRequest(42, { ...openPullRequest(42), state: GitHubPullRequestState.Merged, mergedAt: '2026-09-21T16:00:00Z' });
		const merged = state();
		(session.lastTurnEnd as ISettableObservable<Date | undefined>).set(new Date(Date.now() + 1), undefined);
		const reviewId = `pr:reviewComments:owner/repo#42:${hash(threads.map(thread => [thread.id, ...thread.comments.map(comment => [comment.id, comment.updatedAt ?? comment.createdAt])]))}`;
		assert.deepStrictEqual({ failing, passing, review, metadata, resolved, draft, merged, newCompletion: state() }, {
			failing: [InboxTab.ReadyForYou, InboxNotificationPriority.Now, false, ['pr:failingCi:owner/repo#42:sha42']],
			passing: [InboxTab.ReadyToMerge, InboxNotificationPriority.Next, false, ['pr:passingCi:owner/repo#42:sha42']],
			review: [InboxTab.ReadyForYou, InboxNotificationPriority.Now, false, ['pr:passingCi:owner/repo#42:sha42', reviewId]],
			metadata: review,
			resolved: [InboxTab.ReadyToMerge, InboxNotificationPriority.Next, false, ['pr:passingCi:owner/repo#42:sha42']],
			draft: [InboxTab.ReadyForYou, InboxNotificationPriority.Later, true, []],
			merged: [InboxTab.ReadyForYou, InboxNotificationPriority.Next, true, ['pr:pullRequestMerged:owner/repo#42:2026-09-21T16:00:00Z']],
			newCompletion: [InboxTab.ReadyForYou, InboxNotificationPriority.Next, false, ['pr:pullRequestMerged:owner/repo#42:2026-09-21T16:00:00Z']],
		});
	});

	test('new PR merges return historical completions to Inbox without overriding holds or timed snoozes', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const start = Date.now();
		const sessions = ['historical', 'cleared', 'untilActivity', 'held', 'snoozed'].map((id, index) =>
			createSession(id, SessionStatus.Completed, start - 1000, [{ number: index + 1 }]));
		for (const session of sessions) {
			(session.isRead as ISettableObservable<boolean>).set(true, undefined);
		}
		const fixture = createFixture(sessions);
		for (const [index] of sessions.entries()) {
			fixture.github.setPullRequest(index + 1, {
				...openPullRequest(index + 1), state: GitHubPullRequestState.Merged, mergedAt: new Date(start - 1).toISOString(),
			});
		}
		store.add(fixture.service.acquireSessionAttention());
		const list = fixture.createListModel();
		const states = () => sessions.map(session => list.getInboxState(session)?.kind);
		const historical = states();
		list.setInboxState([sessions[1]], 'done');
		list.setInboxState([sessions[2]], 'untilActivity');
		list.setInboxState([sessions[3]], 'hold');
		list.setInboxState([sessions[4]], start + 60_000);
		for (const [index] of sessions.entries()) {
			fixture.github.setPullRequest(index + 1, openPullRequest(index + 1));
		}
		const beforeMerge = states();
		for (const [index] of sessions.entries()) {
			fixture.github.setPullRequest(index + 1, {
				...openPullRequest(index + 1), state: GitHubPullRequestState.Merged, mergedAt: new Date(start).toISOString(),
			});
		}
		const merged = states();
		list.setInboxState([sessions[0]], 'done');
		const acknowledged = states();
		list.dispose();
		const restored = fixture.createListModel();
		assert.deepStrictEqual({
			historical, beforeMerge, merged, acknowledged,
			restored: sessions.map(session => restored.getInboxState(session)?.kind),
		}, {
			historical: ['done', 'done', 'done', 'done', 'done'],
			beforeMerge: ['done', 'done', 'untilActivity', 'hold', 'snoozed'],
			merged: [undefined, undefined, undefined, 'hold', 'snoozed'],
			acknowledged: ['done', undefined, undefined, 'hold', 'snoozed'],
			restored: ['done', undefined, undefined, 'hold', 'snoozed'],
		});
	}));

	for (const mergedAt of [undefined, 'invalid']) {
		test(`historical merges with ${mergedAt === undefined ? 'missing' : 'invalid'} merge times wait for authoritative metadata`, () => runWithFakedTimers({}, async () => {
			const start = Date.now();
			const session = createSession('pr', SessionStatus.Completed, start - 1000, [
				{ number: 41, state: GitHubPullRequestState.Merged },
				{ number: 42, state: GitHubPullRequestState.Merged },
			]);
			(session.isRead as ISettableObservable<boolean>).set(true, undefined);
			(session.updatedAt as ISettableObservable<Date>).set(new Date(start + 1000), undefined);
			const fixture = createFixture([session]);
			store.add(fixture.service.acquireSessionAttention());
			const list = fixture.createListModel();
			const states = [list.getInboxState(session)?.kind];
			fixture.github.setPullRequest(41, {
				...openPullRequest(41), state: GitHubPullRequestState.Merged, mergedAt: new Date(start - 1).toISOString(),
			});
			states.push(list.getInboxState(session)?.kind);
			const partial = {
				...openPullRequest(42), state: GitHubPullRequestState.Merged, mergedAt, updatedAt: new Date(start + 1000).toISOString(),
			};
			fixture.github.setPullRequest(42, partial);
			states.push(list.getInboxState(session)?.kind);
			fixture.github.setPullRequest(42, { ...partial, updatedAt: new Date(start + 2000).toISOString() });
			states.push(list.getInboxState(session)?.kind);
			fixture.github.setPullRequest(42, { ...partial, mergedAt: new Date(start).toISOString() });
			states.push(list.getInboxState(session)?.kind);
			assert.deepStrictEqual(states, ['done', 'done', 'done', 'done', undefined]);
		}));
	}

	test('prospective restoration uses batch PR ownership without changing archive state or polling', () => {
		const older = createSession('older', SessionStatus.Completed, 100, [{ number: 42 }]);
		const newer = createSession('newer', SessionStatus.Completed, 200, [{ number: 42 }]);
		const linked = createSession('linked', SessionStatus.Completed, 300, [{ number: 42, owned: false }]);
		for (const session of [older, newer]) {
			(session.isArchived as ISettableObservable<boolean>).set(true, undefined);
		}
		const fixture = createFixture([older, newer, linked]);
		fixture.github.setPullRequest(42, openPullRequest(42));
		fixture.github.setCIStatus(42, GitHubCIOverallStatus.Success);
		store.add(fixture.service.acquireSessionAttention());
		const prospective = fixture.service.getSessionAttentionAfterUnarchive([older, newer]);
		const snapshot = {
			tabs: [older, newer].map(session => prospective.get(session.sessionId)?.tab),
			archived: [older, newer].map(session => session.isArchived.get()),
			polling: fixture.github.pollingCount,
			currentTabs: [older, newer].map(session => fixture.service.sessionAttention.get().get(session.sessionId)?.tab),
		};
		transaction(tx => {
			for (const session of [older, newer]) {
				(session.isArchived as ISettableObservable<boolean>).set(false, tx);
			}
		});
		assert.deepStrictEqual({
			snapshot,
			restored: [older, newer].map(session => fixture.service.sessionAttention.get().get(session.sessionId)),
		}, {
			snapshot: {
				tabs: [InboxTab.ReadyForYou, InboxTab.ReadyToMerge], archived: [true, true], polling: 3,
				currentTabs: [InboxTab.ReadyForYou, InboxTab.ReadyForYou],
			},
			restored: [older, newer].map(session => prospective.get(session.sessionId)),
		});
	});

	test('PR ownership deduplicates alerts, excludes busy and archived owners, and requires all open owned PRs to pass', () => {
		const owner = createSession('owner', SessionStatus.Completed, 100, [{ number: 42 }, { number: 43 }]);
		const linked = createSession('linked', SessionStatus.Completed, 200, [{ number: 42, owned: false }]);
		const fixture = createFixture([linked, owner]);
		for (const number of [42, 43]) {
			fixture.github.setPullRequest(number, openPullRequest(number));
		}
		fixture.github.setCIStatus(42, GitHubCIOverallStatus.Success);
		store.add(fixture.service.acquireSessionAttention());
		const ids = (id: string) => fixture.service.sessionAttention.get().get(id)!.notificationIds;
		const partial = ids('owner');
		fixture.github.setCIStatus(43, GitHubCIOverallStatus.Success);
		const ready = ids('owner');
		fixture.github.setCIStatus(42, GitHubCIOverallStatus.Failure);
		const failingOwner = ids('owner');
		const duplicate = ids('linked');
		(owner.status as ISettableObservable<SessionStatus>).set(SessionStatus.InProgress, undefined);
		const busyOwner = ids('owner');
		const linkedFailure = ids('linked');
		(owner.status as ISettableObservable<SessionStatus>).set(SessionStatus.Completed, undefined);
		(owner.isArchived as ISettableObservable<boolean>).set(true, undefined);
		const archivedOwner = ids('owner');
		fixture.github.setCIStatus(42, GitHubCIOverallStatus.Success);
		assert.deepStrictEqual({ partial, ready, failingOwner, duplicate, busyOwner, linkedFailure, archivedOwner, linkedSuccess: ids('linked') }, {
			partial: [], ready: ['owner:passingCi:owner/repo#42:sha42,owner/repo#43:sha43'],
			failingOwner: ['owner:failingCi:owner/repo#42:sha42'], duplicate: [], busyOwner: [],
			linkedFailure: ['linked:failingCi:owner/repo#42:sha42'], archivedOwner: [], linkedSuccess: [],
		});
	});
});

function openPullRequest(number: number): IGitHubPullRequest {
	return upcastPartial<IGitHubPullRequest>({ number, state: GitHubPullRequestState.Open, headSha: `sha${number}`, isDraft: false });
}

function reviewThread(login: string): IGitHubPullRequestReviewThread {
	return upcastPartial<IGitHubPullRequestReviewThread>({
		id: 'thread', isResolved: false,
		comments: [upcastPartial<IGitHubPullRequestReviewThread['comments'][number]>({ id: 1, author: { login, avatarUrl: '' }, createdAt: '2026-09-21T16:00:00Z', updatedAt: '2026-09-21T16:00:00Z' })],
	});
}

function question(resolveId: string): Extract<IChatResponseModel['response']['value'][number], { kind: 'questionCarousel' }> {
	return { kind: 'questionCarousel', resolveId, allowSkip: true, questions: [{ id: 'q', type: 'text', title: 'Question', required: true }], isUsed: false };
}

function pendingRequest(requestId: string, parts: IChatResponseModel['response']['value'], startedWaitingAt = 10, onDidChange: IChatResponseModel['onDidChange'] = Event.None): IChatRequestModel {
	return upcastPartial<IChatRequestModel>({
		response: upcastPartial<IChatResponseModel>({
			requestId, isCanceled: false, isComplete: false, onDidChange,
			response: upcastPartial<IChatResponseModel['response']>({ value: parts }),
			isPendingConfirmation: observableValue('pending', { startedWaitingAt }),
		}),
	});
}

class TestChatService {
	private readonly _models = new Map<string, IChatModel>();
	readonly chatModels = observableValue<readonly IChatModel[]>('chatModels', []);
	readonly acquired: string[] = [];
	acquire: (resource: URI, token: CancellationToken) => Promise<IChatModelReference | undefined> = async () => undefined;

	getSession(resource: URI): IChatModel | undefined {
		return this._models.get(resource.toString());
	}

	async acquireOrLoadSession(resource: URI, _location: ChatAgentLocation, token: CancellationToken): Promise<IChatModelReference | undefined> {
		this.acquired.push(resource.toString());
		return this.acquire(resource, token);
	}

	setModel(resource: URI, model: IChatModel): void {
		this._models.set(resource.toString(), model);
		this.chatModels.set([...this._models.values()], undefined);
	}

	setRequests(resource: URI, requests: readonly IChatRequestModel[]): void {
		this.setModel(resource, upcastPartial<IChatModel>({ onDidChange: Event.None, getRequests: () => [...requests] }));
	}

	removeSession(resource: URI): void {
		this._models.delete(resource.toString());
		this.chatModels.set([...this._models.values()], undefined);
	}
}

class TestGitHubService {
	pollingCount = 0;
	private readonly _pullRequests = new Map<number, ReturnType<TestGitHubService['pullRequestModel']>>();
	private readonly _ci = new Map<number, ReturnType<TestGitHubService['ciModel']>>();
	private readonly _reviews = new Map<number, ReturnType<TestGitHubService['reviewModel']>>();

	private trackPolling(): IDisposable {
		this.pollingCount++;
		return toDisposable(() => { this.pollingCount--; });
	}

	private pullRequestModel() {
		return { pullRequest: observableValue<IGitHubPullRequest | undefined>('pr', undefined), refresh: async () => { }, startPolling: () => this.trackPolling() };
	}

	private ciModel() {
		return { overallStatus: observableValue('ci', GitHubCIOverallStatus.Neutral), refresh: async () => { }, startPolling: () => this.trackPolling() };
	}

	private reviewModel() {
		return { reviewThreads: observableValue<readonly IGitHubPullRequestReviewThread[]>('reviews', []), refresh: async () => { }, startPolling: () => this.trackPolling() };
	}

	createPullRequestModelReference(_owner: string, _repo: string, number: number): IReference<GitHubPullRequestModel> {
		let model = this._pullRequests.get(number);
		if (!model) {
			model = this.pullRequestModel();
			this._pullRequests.set(number, model);
		}
		return { object: upcastPartial<GitHubPullRequestModel>(model), dispose: () => { } };
	}

	createPullRequestCIModelReference(_owner: string, _repo: string, number: number): IReference<GitHubPullRequestCIModel> {
		let model = this._ci.get(number);
		if (!model) {
			model = this.ciModel();
			this._ci.set(number, model);
		}
		return { object: upcastPartial<GitHubPullRequestCIModel>(model), dispose: () => { } };
	}

	createPullRequestReviewThreadsModelReference(_owner: string, _repo: string, number: number): IReference<GitHubPullRequestReviewThreadsModel> {
		let model = this._reviews.get(number);
		if (!model) {
			model = this.reviewModel();
			this._reviews.set(number, model);
		}
		return { object: upcastPartial<GitHubPullRequestReviewThreadsModel>(model), dispose: () => { } };
	}

	setPullRequest(number: number, value: IGitHubPullRequest): void {
		this.createPullRequestModelReference('', '', number);
		this._pullRequests.get(number)!.pullRequest.set(value, undefined);
	}

	setCIStatus(number: number, value: GitHubCIOverallStatus): void {
		this.createPullRequestCIModelReference('', '', number);
		this._ci.get(number)!.overallStatus.set(value, undefined);
	}

	setReviewThreads(number: number, value: readonly IGitHubPullRequestReviewThread[]): void {
		this.createPullRequestReviewThreadsModelReference('', '', number);
		this._reviews.get(number)!.reviewThreads.set(value, undefined);
	}
}

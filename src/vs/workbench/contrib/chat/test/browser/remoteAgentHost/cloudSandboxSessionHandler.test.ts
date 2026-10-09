/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, raceCancellationError, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { IObservable, observableValue, waitForState } from '../../../../../../base/common/observable.js';
import { getMarks } from '../../../../../../base/common/performance.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/virtualScheduling/index.js';
import { CloudSandboxRequestError, ICloudSandboxApiService } from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { RemoteAgentHostConnectionStatus } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { createActiveTurn, createChatState, createDefaultChatSummary, createSessionState, MessageKind, ResponsePartKind, SessionStatus, TurnState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IReplayedTaskHistory } from '../../../../../../platform/agentHost/common/taskEventReplay.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../../platform/notification/test/common/testNotificationService.js';
import { CloudSandboxSessionHandler } from '../../../browser/remoteAgentHost/cloudSandboxSessionHandler.js';
import { CloudSandboxHistoryCache } from '../../../browser/remoteAgentHost/cloudSandboxHistoryCache.js';
import { IChatProgress, IChatRequestSubmittedEvent, IChatService } from '../../../common/chatService/chatService.js';
import { IChatSession, IChatSessionContentProvider, IChatSessionHistoryItem, IChatSessionServerRequest } from '../../../common/chatSessionsService.js';
import { CloudSandboxSessionTrace } from '../../../common/cloudSandboxSessionTrace.js';
import { CHAT_SUBAGENT_RESOURCE_QUERY_PARAM } from '../../../common/constants.js';
import { ICanvasContext } from '../../../../canvases/common/canvas.js';
import { turnsToHistory } from '../../../browser/agentSessions/agentHost/stateToProgressAdapter.js';

const resource = URI.parse('remote-agent-host-test-copilot:/session');
const peerChat = 'custom-chat:/opaque-peer';

function recordedHistory(mainTitle = '', peerTitle = ''): IReplayedTaskHistory {
	const summary = {
		resource: 'ahp-session:/session', provider: 'copilot', title: 'Recorded title',
		status: SessionStatus.Idle, createdAt: '2026-01-01T00:00:00.000Z', modifiedAt: '2026-01-01T00:00:00.000Z',
	};
	const state = createSessionState(summary);
	const chats = ['custom-chat:/opaque-main', peerChat].map(chatResource => {
		const chatSummary = { ...createDefaultChatSummary(summary, chatResource), title: chatResource === peerChat ? peerTitle : mainTitle };
		state.chats.push(chatSummary);
		const chat = createChatState(chatSummary);
		chat.turns.push({
			id: chatResource, message: { text: chatResource, origin: { kind: MessageKind.User } },
			responseParts: [], usage: undefined, state: TurnState.Complete,
		});
		return chat;
	});
	return {
		sessions: [{
			session: summary.resource, state,
			chats: new Map(chats.map(chat => [chat.resource, chat])),
			defaultChat: chats[0].resource, modifiedAt: summary.modifiedAt,
		}],
		truncated: false,
	};
}

class LiveSession extends Disposable implements IChatSession {
	readonly sessionResource = resource;
	private readonly _onWillDispose = this._register(new Emitter<void>());
	readonly onWillDispose = this._onWillDispose.event;
	readonly historyChanges = this._register(new Emitter<readonly IChatSessionHistoryItem[]>());
	readonly onDidChangeHistory = this.historyChanges.event;
	readonly serverRequests = this._register(new Emitter<IChatSessionServerRequest>());
	readonly onDidStartServerRequest = this.serverRequests.event;
	readonly isReadOnly = observableValue(this, false);
	readonly isInputBlocked = observableValue(this, false);
	readonly isCompleteObs = observableValue(this, true);
	readonly progressObs = observableValue<IChatProgress[]>(this, []);
	readonly backgroundShellCount = observableValue<number | undefined>(this, undefined);
	readonly canvasContext = observableValue<ICanvasContext | undefined>(this, undefined);
	interruptions = 0;
	disposed = false;

	constructor(readonly history: readonly IChatSessionHistoryItem[] = [
		{ type: 'request', id: 'live-turn', prompt: 'Live request', participant: 'copilot' },
		{ type: 'response', parts: [], participant: 'copilot' },
	], readonly title?: string) {
		super();
	}

	readonly interruptActiveResponseCallback = async () => {
		this.interruptions++;
		return true;
	};

	override dispose(): void {
		if (!this.disposed) {
			this.disposed = true;
			this._onWillDispose.fire();
		}
		super.dispose();
	}
}

suite('CloudSandboxSessionHandler', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createHandler(read: (token: CancellationToken, diagnosticId?: string, onCachedHistory?: (history: IReplayedTaskHistory) => void, canCacheHistory?: (history: IReplayedTaskHistory | undefined) => boolean) => Promise<IReplayedTaskHistory | undefined> = async () => recordedHistory(), notificationService: INotificationService = new TestNotificationService(), logService: ILogService = new NullLogService(), invalidate: (preserveCached?: boolean) => void = () => { }, onDidSubmitRequest: Event<IChatRequestSubmittedEvent> = Event.None, connectionStatus?: IObservable<RemoteAgentHostConnectionStatus>, setSessionTitle: IChatService['setSessionTitle'] = () => { }) {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ILogService, logService);
		instantiationService.stub(INotificationService, notificationService);
		instantiationService.stub(IChatService, new class extends mock<IChatService>() {
			override readonly onDidSubmitRequest = onDidSubmitRequest;
			override setSessionTitle(resource: URI, title: string): void { setSessionTitle(resource, title); }
		}());
		instantiationService.stub(ICloudSandboxApiService, new class extends mock<ICloudSandboxApiService>() {
			override getSessionHistory(_taskId: string, token: CancellationToken, diagnosticId?: string, onCachedHistory?: (history: IReplayedTaskHistory) => void, canCacheHistory?: (history: IReplayedTaskHistory | undefined) => boolean) { return read(token, diagnosticId, onCachedHistory, canCacheHistory); }
			override invalidateSessionHistory(_taskId: string, preserveCached?: boolean): void { invalidate(preserveCached); }
		}());
		return store.add(instantiationService.createInstance(CloudSandboxSessionHandler, {
			taskId: 'task', agentId: 'copilot', connectionAuthority: 'test', connectionStatus,
		}));
	}

	async function sharesContent(handler: CloudSandboxSessionHandler, session: IChatSession): Promise<boolean> {
		const reference = await handler.provideChatSessionContent(session.sessionResource, CancellationToken.None);
		try {
			return reference !== session && reference.history === session.history && reference.isReadOnly === session.isReadOnly;
		} finally {
			reference.dispose();
		}
	}

	test('independent readers retain promotion and streaming until the final reference is released', async () => {
		const history = new DeferredPromise<IReplayedTaskHistory>();
		let reads = 0;
		const handler = createHandler(() => { reads++; return history.p; });
		const opening = handler.provideChatSessionContent(resource, CancellationToken.None);
		const previewing = handler.provideChatSessionContent(resource, CancellationToken.None);
		await history.complete(recordedHistory());
		const [opened, preview] = await Promise.all([opening, previewing]);
		let openedDisposed = 0;
		let previewDisposed = 0;
		store.add(opened.onWillDispose(() => openedDisposed++));
		store.add(preview.onWillDispose(() => previewDisposed++));
		const trace = CloudSandboxSessionTrace.get(opened);
		const sharedTrace = trace !== undefined && CloudSandboxSessionTrace.get(preview) === trace;
		preview.dispose();
		preview.dispose();
		const afterPreview = { openedDisposed, previewDisposed };
		const updates: (readonly IChatSessionHistoryItem[])[] = [];
		store.add(opened.onDidChangeHistory!(history => updates.push(history)));
		const live = store.add(new LiveSession());
		handler.setLiveProvider({ provideChatSessionContent: async () => live });
		await waitForState(opened.isReadOnly!, value => !value);
		live.progressObs.set([{ kind: 'markdownContent', content: new MarkdownString('Still streaming') }], undefined);
		const streaming = opened.progressObs?.get();
		opened.dispose();
		assert.deepStrictEqual({
			independent: opened !== preview, reads, sharedTrace, afterPreview,
			updates, streaming, openedDisposed, previewDisposed, liveDisposed: live.disposed,
		}, {
			independent: true, reads: 1, sharedTrace: true, afterPreview: { openedDisposed: 0, previewDisposed: 1 },
			updates: [live.history], streaming: [{ kind: 'markdownContent', content: new MarkdownString('Still streaming') }],
			openedDisposed: 1, previewDisposed: 1, liveDisposed: true,
		});
	});

	test('provider teardown disposes every outstanding reference exactly once', async () => {
		const handler = createHandler();
		const first = await handler.provideChatSessionContent(resource, CancellationToken.None);
		const second = await handler.provideChatSessionContent(resource, CancellationToken.None);
		const disposals = [0, 0];
		store.add(first.onWillDispose(() => disposals[0]++));
		store.add(second.onWillDispose(() => disposals[1]++));
		handler.dispose();
		first.dispose();
		second.dispose();
		assert.deepStrictEqual(disposals, [1, 1]);
	});

	test('publishes the authoritative live title to the retained model during promotion', async () => {
		const titles: { resource: string; title: string }[] = [];
		const handler = createHandler(undefined, undefined, undefined, undefined, undefined, undefined, (resource, title) => {
			titles.push({ resource: resource.toString(), title });
		});
		const session = await handler.provideChatSessionContent(resource, CancellationToken.None);
		const initialTitle = session.title;
		const live = store.add(new LiveSession(undefined, 'Authoritative live title'));
		handler.setLiveProvider({ provideChatSessionContent: async () => live });
		await waitForState(session.isReadOnly!, value => !value);
		assert.deepStrictEqual({ initialTitle, title: session.title, titles }, {
			initialTitle: 'Recorded title', title: 'Authoritative live title',
			titles: [{ resource: resource.toString(), title: 'Authoritative live title' }],
		});
	});

	test('publishes a refreshed recorded title without replacing the open conversation', async () => {
		const fresh = new DeferredPromise<IReplayedTaskHistory>();
		const titles: string[] = [];
		const handler = createHandler((_token, _diagnosticId, onCachedHistory) => {
			onCachedHistory?.(recordedHistory());
			return fresh.p;
		}, undefined, undefined, undefined, undefined, undefined, (_resource, title) => titles.push(title));
		const session = await handler.provideChatSessionContent(resource, CancellationToken.None);
		const refreshed = Event.toPromise(session.onDidChangeHistory!);
		await fresh.complete(recordedHistory('Updated conversation title'));
		await refreshed;
		assert.deepStrictEqual({ title: session.title, titles, shared: await sharesContent(handler, session) }, {
			title: 'Updated conversation title', titles: ['Updated conversation title'], shared: true,
		});
	});

	test('invalidates local submissions only for the matching open conversation and releases the listener on close', async () => {
		const submitted = store.add(new Emitter<IChatRequestSubmittedEvent>());
		let invalidations = 0;
		const handler = createHandler(undefined, undefined, undefined, () => invalidations++, submitted.event);
		const session = await handler.provideChatSessionContent(resource, CancellationToken.None);
		submitted.fire({ chatSessionResource: resource.with({ path: '/unrelated' }) });
		const unrelated = invalidations;
		submitted.fire({ chatSessionResource: resource });
		const matching = invalidations;
		session.dispose();
		submitted.fire({ chatSessionResource: resource });
		assert.deepStrictEqual({ unrelated, matching, closed: invalidations }, { unrelated: 0, matching: 1, closed: 1 });
	});

	test('reopens cached content before revalidation and adds new turns to the same facade', async () => {
		const cache = store.add(new CloudSandboxHistoryCache());
		const fresh = new DeferredPromise<IReplayedTaskHistory>();
		let reads = 0;
		const handler = createHandler((token, _diagnosticId, onCachedHistory, canCacheHistory) => cache.load('task', token, async () => ({
			account: 'account', fetch: async () => ++reads === 1 ? recordedHistory() : fresh.p,
		}), onCachedHistory, canCacheHistory));
		const original = await handler.provideChatSessionContent(resource, CancellationToken.None);
		original.dispose();
		const reopened = await handler.provideChatSessionContent(resource, CancellationToken.None);
		const before = {
			pending: !fresh.isSettled, historyItems: reopened.history.length,
			status: reopened.historyStatus?.get(), readOnly: reopened.isReadOnly?.get(),
		};
		const changes: number[] = [];
		store.add(reopened.onDidChangeHistory!(history => changes.push(history.length)));
		const refreshed = Event.toPromise(reopened.onDidChangeHistory!);
		const updated = recordedHistory();
		updated.sessions[0].chats.get('custom-chat:/opaque-main')!.turns.push({
			id: 'new-turn', message: { text: 'New request elsewhere', origin: { kind: MessageKind.User } },
			responseParts: [], usage: undefined, state: TurnState.Complete,
		});
		await fresh.complete(updated);
		await refreshed;
		assert.deepStrictEqual({
			before, changes, reads, same: await sharesContent(handler, reopened),
			status: reopened.historyStatus?.get(), readOnly: reopened.isReadOnly?.get(),
			prompts: reopened.history.filter(item => item.type === 'request').map(item => item.prompt),
		}, {
			before: { pending: true, historyItems: 2, status: undefined, readOnly: true },
			changes: [4], reads: 2, same: true, status: undefined, readOnly: true,
			prompts: ['custom-chat:/opaque-main', 'New request elsewhere'],
		});
	});

	test('a cached peer miss waits for fresh history instead of showing the default conversation', async () => {
		const fresh = new DeferredPromise<IReplayedTaskHistory>();
		const cached = recordedHistory();
		const first = cached.sessions[0];
		const onlyMain = { ...cached, sessions: [{ ...first, chats: new Map([[first.defaultChat, first.chats.get(first.defaultChat)!]]) }] };
		const handler = createHandler((_token, _diagnosticId, onCachedHistory) => {
			onCachedHistory?.(onlyMain);
			return fresh.p;
		});
		let resolved = false;
		const pending = handler.provideChatSessionContent(resource.with({ query: `${CHAT_SUBAGENT_RESOURCE_QUERY_PARAM}=${encodeURIComponent(peerChat)}` }), CancellationToken.None);
		void pending.then(() => resolved = true);
		await timeout(0);
		const resolvedFromCache = resolved;
		await fresh.complete(recordedHistory());
		const session = await pending;
		assert.deepStrictEqual({
			resolvedFromCache, status: session.historyStatus?.get(),
			prompts: session.history.filter(item => item.type === 'request').map(item => item.prompt),
		}, { resolvedFromCache: false, status: undefined, prompts: [peerChat] });
	});

	test('retains cached rows after refresh failure and retries without replacing the session', async () => {
		let prompts = 0;
		const notifications = new class extends TestNotificationService {
			override prompt(...args: Parameters<TestNotificationService['prompt']>) {
				prompts++;
				return super.prompt(...args);
			}
		}();
		let attempts = 0;
		const handler = createHandler(async (_token, _diagnosticId, onCachedHistory) => {
			onCachedHistory?.(recordedHistory());
			if (++attempts === 1) {
				throw new Error('Offline');
			}
			return recordedHistory();
		}, notifications);
		const session = await handler.provideChatSessionContent(resource, CancellationToken.None);
		const status = await waitForState(session.historyStatus!, status => status?.kind === 'history');
		const afterFailure = { items: session.history.length, readOnly: session.isReadOnly?.get(), status: status?.message, action: status?.action.label };
		await status!.action.run();
		assert.deepStrictEqual({
			afterFailure, attempts, prompts, status: session.historyStatus?.get(),
			same: await sharesContent(handler, session),
		}, {
			afterFailure: { items: 2, readOnly: true, status: 'Couldn\'t refresh this conversation. Recent messages may be missing.', action: 'Refresh' },
			attempts: 2, prompts: 0, status: undefined, same: true,
		});
	});

	test('defers a failed API refresh through automatic resume and live snapshot loading', async () => {
		const connection = observableValue<RemoteAgentHostConnectionStatus>('connection', RemoteAgentHostConnectionStatus.connecting);
		const liveReady = new DeferredPromise<IChatSession>();
		const failed = new DeferredPromise<void>();
		const handler = createHandler(async (_token, _diagnosticId, onCachedHistory) => {
			onCachedHistory?.(recordedHistory());
			void failed.complete();
			throw new Error('API unavailable');
		}, undefined, undefined, undefined, undefined, connection);
		const session = await handler.provideChatSessionContent(resource, CancellationToken.None);
		await failed.p;
		await timeout(0);
		const whileWaking = session.historyStatus?.get();
		connection.set(RemoteAgentHostConnectionStatus.connected, undefined);
		const beforeProvider = session.historyStatus?.get();
		handler.setLiveProvider({ provideChatSessionContent: () => liveReady.p });
		const whileLoading = session.historyStatus?.get();
		const live = store.add(new LiveSession());
		await liveReady.complete(live);
		await waitForState(session.isReadOnly!, value => !value);
		assert.deepStrictEqual({ whileWaking, beforeProvider, whileLoading, afterLive: session.historyStatus?.get(), history: session.history }, {
			whileWaking: undefined, beforeProvider: undefined, whileLoading: undefined, afterLive: undefined, history: live.history,
		});
	});

	test('offers Refresh after both routes fail and Refresh retries only the history API', async () => {
		const connection = observableValue<RemoteAgentHostConnectionStatus>('connection', RemoteAgentHostConnectionStatus.connecting);
		const fresh = new DeferredPromise<IReplayedTaskHistory>();
		let reads = 0;
		let liveReads = 0;
		const handler = createHandler(async (_token, _diagnosticId, onCachedHistory) => {
			onCachedHistory?.(recordedHistory());
			if (++reads === 1) {
				throw new Error('API unavailable');
			}
			return fresh.p;
		}, undefined, undefined, undefined, undefined, connection);
		const session = await handler.provideChatSessionContent(resource, CancellationToken.None);
		connection.set(RemoteAgentHostConnectionStatus.connected, undefined);
		handler.setLiveProvider({ provideChatSessionContent: async () => { liveReads++; throw new Error('Snapshot unavailable'); } });
		const failure = await waitForState(session.historyStatus!, value => value?.kind === 'history');
		const originalHistory = session.history;
		const refresh = failure!.action.run();
		await failure!.action.run();
		const whileRefreshing = { reads, liveReads, retained: session.history === originalHistory, label: session.historyStatus?.get()?.action.label };
		await fresh.complete(recordedHistory());
		await refresh;
		assert.deepStrictEqual({
			whileRefreshing, historyWarning: session.historyStatus?.get()?.kind === 'history',
			same: await sharesContent(handler, session),
		}, {
			whileRefreshing: { reads: 2, liveReads: 1, retained: true, label: 'Refresh' },
			historyWarning: false, same: true,
		});
	});

	test('shows a failed history refresh when automatic connection fails before a live provider exists', async () => {
		const connection = observableValue<RemoteAgentHostConnectionStatus>('connection', RemoteAgentHostConnectionStatus.connecting);
		const handler = createHandler(async (_token, _diagnosticId, onCachedHistory) => {
			onCachedHistory?.(recordedHistory());
			throw new Error('Offline');
		}, undefined, undefined, undefined, undefined, connection);
		const session = await handler.provideChatSessionContent(resource, CancellationToken.None);
		await timeout(0);
		const connecting = session.historyStatus?.get();
		connection.set(RemoteAgentHostConnectionStatus.disconnected, undefined);
		assert.deepStrictEqual({ connecting, failed: session.historyStatus?.get()?.action.label }, { connecting: undefined, failed: 'Refresh' });
	});

	test('bounds waiting for live content and discards an ignored-cancellation late snapshot', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const pending = new DeferredPromise<IChatSession>();
		const handler = createHandler(async (_token, _diagnosticId, onCachedHistory) => {
			onCachedHistory?.(recordedHistory());
			throw new Error('API unavailable');
		});
		handler.setLiveProvider({ provideChatSessionContent: () => pending.p });
		const session = await handler.provideChatSessionContent(resource, CancellationToken.None);
		const originalHistory = session.history;
		await timeout(29_999);
		const beforeDeadline = session.historyStatus?.get();
		await timeout(1);
		await waitForState(session.historyStatus!, value => value?.kind === 'history');
		const late = store.add(new LiveSession());
		await pending.complete(late);
		await timeout(0);
		assert.deepStrictEqual({
			beforeDeadline, afterDeadline: session.historyStatus?.get()?.action.label,
			disposed: late.disposed, retained: session.history === originalHistory,
		}, { beforeDeadline: undefined, afterDeadline: 'Refresh', disposed: true, retained: true });
	}));

	test('bounds waiting for provider registration without timing out the sandbox wake itself', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const connection = observableValue<RemoteAgentHostConnectionStatus>('connection', RemoteAgentHostConnectionStatus.connecting);
		const handler = createHandler(async (_token, _diagnosticId, onCachedHistory) => {
			onCachedHistory?.(recordedHistory());
			throw new Error('API unavailable');
		}, undefined, undefined, undefined, undefined, connection);
		const session = await handler.provideChatSessionContent(resource, CancellationToken.None);
		await timeout(60_000);
		const waking = session.historyStatus?.get();
		connection.set(RemoteAgentHostConnectionStatus.connected, undefined);
		await timeout(29_999);
		const beforeDeadline = session.historyStatus?.get();
		await timeout(1);
		assert.deepStrictEqual({ waking, beforeDeadline, afterDeadline: session.historyStatus?.get()?.action.label }, {
			waking: undefined, beforeDeadline: undefined, afterDeadline: 'Refresh',
		});
	}));

	test('cold truncated history remains readable with an explicit incomplete-conversation warning', async () => {
		const handler = createHandler(async () => ({ ...recordedHistory(), truncated: true }));
		const session = await handler.provideChatSessionContent(resource, CancellationToken.None);
		assert.deepStrictEqual({
			prompts: session.history.filter(item => item.type === 'request').map(item => item.prompt),
			warnings: session.history.flatMap(item => item.type === 'response' ? item.parts.filter(part => part.kind === 'warning').map(part => part.content.value) : []),
			readOnly: session.isReadOnly?.get(), status: session.historyStatus?.get(),
		}, {
			prompts: ['custom-chat:/opaque-main'],
			warnings: ['This conversation is incomplete. Its recorded history ends mid-response, so the last exchange may be missing.'],
			readOnly: true, status: undefined,
		});
	});

	test('accepts a genuinely empty requested chat on a cold open', async () => {
		const history = recordedHistory();
		const original = history.sessions[0];
		const chats = new Map(original.chats);
		chats.set(original.defaultChat, { ...chats.get(original.defaultChat)!, turns: [], activeTurn: undefined });
		const handler = createHandler(async () => ({ ...history, sessions: [{ ...original, chats }] }));
		const session = await handler.provideChatSessionContent(resource, CancellationToken.None);
		assert.deepStrictEqual({
			history: session.history, readOnly: session.isReadOnly?.get(), status: session.historyStatus?.get(),
		}, { history: [], readOnly: true, status: undefined });
	});

	test('accepts active-only history on refresh and as the next cached preview', async () => {
		const cache = store.add(new CloudSandboxHistoryCache());
		const history = recordedHistory();
		const original = history.sessions[0];
		const chats = new Map(original.chats);
		chats.set(original.defaultChat, {
			...chats.get(original.defaultChat)!, turns: [],
			activeTurn: createActiveTurn('active', { text: 'Active request', origin: { kind: MessageKind.User } }, original.modifiedAt),
		});
		const fresh = new DeferredPromise<IReplayedTaskHistory>();
		const pending = new DeferredPromise<IReplayedTaskHistory>();
		let reads = 0;
		const handler = createHandler((token, _diagnosticId, onCachedHistory, canCacheHistory) => cache.load('task', token, async () => ({
			account: 'account', fetch: async () => ++reads === 1 ? history : reads === 2 ? fresh.p : pending.p,
		}), onCachedHistory, canCacheHistory));
		const first = await handler.provideChatSessionContent(resource, CancellationToken.None);
		first.dispose();
		const second = await handler.provideChatSessionContent(resource, CancellationToken.None);
		const refreshed = Event.toPromise(second.onDidChangeHistory!);
		await fresh.complete({ ...history, sessions: [{ ...original, chats }] });
		await refreshed;
		const refreshedPrompts = second.history.filter(item => item.type === 'request').map(item => item.prompt);
		second.dispose();
		const reopened = await handler.provideChatSessionContent(resource, CancellationToken.None);
		assert.deepStrictEqual({
			refreshedPrompts, cachedPrompts: reopened.history.filter(item => item.type === 'request').map(item => item.prompt),
			pending: !pending.isSettled, status: reopened.historyStatus?.get(),
		}, {
			refreshedPrompts: ['Active request'], cachedPrompts: ['Active request'], pending: true, status: undefined,
		});
	});

	for (const failure of ['truncated', 'missing session', 'missing chat', 'absent'] as const) {
		test(`retains cached messages when a successful refresh response is ${failure}`, async () => {
			const history = recordedHistory();
			const refreshed = failure === 'absent' ? undefined
				: failure === 'truncated' ? { ...history, truncated: true }
					: failure === 'missing session' ? { ...history, sessions: [] }
						: { ...history, sessions: [{ ...history.sessions[0], chats: new Map() }] };
			const handler = createHandler(async (_token, _diagnosticId, onCachedHistory) => {
				onCachedHistory?.(history);
				return refreshed;
			});
			const session = await handler.provideChatSessionContent(resource, CancellationToken.None);
			const status = await waitForState(session.historyStatus!, value => value?.kind === 'history');
			assert.deepStrictEqual({
				prompts: session.history.filter(item => item.type === 'request').map(item => item.prompt),
				action: status?.action.label,
			}, { prompts: ['custom-chat:/opaque-main'], action: 'Refresh' });
		});
	}

	for (const failure of ['missing session', 'missing chat', 'empty default chat', 'empty peer chat'] as const) {
		test(`reopening retains cached messages after invalid refresh data (${failure}) and recovers on valid history`, async () => {
			const cache = store.add(new CloudSandboxHistoryCache());
			const history = recordedHistory();
			const original = history.sessions[0];
			const requestedChat = failure === 'missing chat' || failure === 'empty peer chat' ? peerChat : original.defaultChat;
			const chats = new Map(original.chats);
			if (failure === 'missing chat') {
				chats.delete(requestedChat);
			} else if (failure === 'empty default chat' || failure === 'empty peer chat') {
				chats.set(requestedChat, { ...chats.get(requestedChat)!, turns: [], activeTurn: undefined });
			}
			const invalid = {
				...history,
				sessions: [failure === 'missing session'
					? { ...original, session: 'ahp-session:/other', state: { ...original.state, resource: 'ahp-session:/other' } }
					: { ...original, chats }],
			};
			const requested = requestedChat === peerChat
				? resource.with({ query: `${CHAT_SUBAGENT_RESOURCE_QUERY_PARAM}=${encodeURIComponent(peerChat)}` })
				: resource;
			const fresh = new DeferredPromise<IReplayedTaskHistory>();
			let reads = 0;
			const handler = createHandler((token, _diagnosticId, onCachedHistory, canCacheHistory) => cache.load('task', token, async () => ({
				account: 'account', fetch: async () => ++reads === 1 ? recordedHistory() : reads === 2 ? invalid : fresh.p,
			}), onCachedHistory, canCacheHistory));
			const first = await handler.provideChatSessionContent(requested, CancellationToken.None);
			first.dispose();
			const second = await handler.provideChatSessionContent(requested, CancellationToken.None);
			await timeout(0);
			assert.deepStrictEqual({
				prompts: second.history.filter(item => item.type === 'request').map(item => item.prompt),
				action: second.historyStatus?.get()?.action.label,
			}, { prompts: [requestedChat], action: 'Refresh' });
			second.dispose();
			const reopened = await handler.provideChatSessionContent(requested, CancellationToken.None);
			const before = { items: reopened.history.length, pending: !fresh.isSettled, status: reopened.historyStatus?.get() };
			const recovered = recordedHistory();
			recovered.sessions[0].chats.get(requestedChat)!.turns[0].message.text = 'Recovered conversation';
			const refreshed = Event.toPromise(reopened.onDidChangeHistory!);
			await fresh.complete(recovered);
			await refreshed;
			assert.deepStrictEqual({
				before, reads, prompts: reopened.history.filter(item => item.type === 'request').map(item => item.prompt),
				status: reopened.historyStatus?.get(),
			}, {
				before: { items: 2, pending: true, status: undefined }, reads: 3,
				prompts: ['Recovered conversation'], status: undefined,
			});
		});
	}

	test('a cancelled refresh does not create a stale-history warning', async () => {
		const handler = createHandler(async (_token, _diagnosticId, onCachedHistory) => {
			onCachedHistory?.(recordedHistory());
			throw new CancellationError();
		});
		const session = await handler.provideChatSessionContent(resource, CancellationToken.None);
		await timeout(0);
		assert.deepStrictEqual({ status: session.historyStatus?.get(), items: session.history.length }, { status: undefined, items: 2 });
	});

	test('Refresh respects server retry pacing without issuing another live request', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const requests: number[] = [];
		const handler = createHandler(async (_token, _diagnosticId, onCachedHistory) => {
			requests.push(Date.now());
			onCachedHistory?.(recordedHistory());
			if (requests.length === 1) {
				throw new CloudSandboxRequestError(429, 'Too many requests', 2);
			}
			return recordedHistory();
		});
		const session = await handler.provideChatSessionContent(resource, CancellationToken.None);
		const status = await waitForState(session.historyStatus!, value => value?.kind === 'history');
		await status!.action.run();
		assert.deepStrictEqual({ delays: requests.map(time => time - requests[0]), status: session.historyStatus?.get() }, {
			delays: [0, 2000], status: undefined,
		});
	}));

	test('matching live attachment retains the next preview despite live model and usage enrichment', async () => {
		const cache = store.add(new CloudSandboxHistoryCache());
		const pending = new DeferredPromise<IReplayedTaskHistory>();
		const recorded = recordedHistory();
		const chat = recorded.sessions[0].chats.get(recorded.sessions[0].defaultChat)!;
		chat.turns[0] = {
			...chat.turns[0],
			message: { ...chat.turns[0].message, model: { id: 'raw-model' } },
			responseParts: [{ kind: ResponsePartKind.Markdown, id: 'markdown', content: 'Recorded response' }],
			usage: { model: 'raw-model', inputTokens: 100, outputTokens: 20 },
		};
		let reads = 0;
		const preserved: boolean[] = [];
		const handler = createHandler((token, _diagnosticId, onCachedHistory, canCacheHistory) => cache.load('task', token, async () => ({
			account: 'account', fetch: async () => ++reads === 1 ? recorded : pending.p,
		}), onCachedHistory, canCacheHistory), undefined, undefined, preserveCached => {
			preserved.push(!!preserveCached);
			cache.invalidate('task', false, preserveCached);
		});
		const first = await handler.provideChatSessionContent(resource, CancellationToken.None);
		const live = store.add(new LiveSession(turnsToHistory(URI.parse(recorded.sessions[0].session), chat.turns, 'copilot', 'test', {
			toLanguageModelId: () => 'namespaced-model',
			toActualModelId: () => 'namespaced-model',
			toResponseDetails: () => 'Live model display name',
			toAutoModeResolution: () => ({ kind: 'autoModeResolution', resolved: { id: 'raw-model', name: 'Live model display name' } }),
		})));
		assert.notDeepStrictEqual(first.history, live.history);
		let loads = 0;
		const nextLive = new DeferredPromise<IChatSession>();
		handler.setLiveProvider({ provideChatSessionContent: () => ++loads === 1 ? Promise.resolve(live) : nextLive.p });
		await waitForState(first.isReadOnly!, value => !value);
		first.dispose();
		const reopened = await handler.provideChatSessionContent(resource, CancellationToken.None);
		assert.deepStrictEqual({
			preserved, items: reopened.history.length, readOnly: reopened.isReadOnly?.get(),
			pending: !pending.isSettled && !nextLive.isSettled, status: reopened.historyStatus?.get(),
			preserveHistoryItemIdentity: reopened.preserveHistoryItemIdentity,
		}, { preserved: [true], items: 2, readOnly: true, pending: true, status: undefined, preserveHistoryItemIdentity: true });
	});

	for (const status of [401, 403, 404]) {
		test(`does not retain cached rows after HTTP ${status}`, async () => {
			const handler = createHandler(async (_token, _diagnosticId, onCachedHistory) => {
				onCachedHistory?.(recordedHistory());
				throw new CloudSandboxRequestError(status, `HTTP ${status}`);
			});
			const session = await handler.provideChatSessionContent(resource, CancellationToken.None);
			await timeout(0);
			assert.deepStrictEqual({
				prompts: session.history.filter(item => item.type === 'request').map(item => item.prompt),
				error: session.history.find(item => item.type === 'response')?.errorDetails?.message,
			}, { prompts: [''], error: `HTTP ${status}` });
		});
	}

	test('live content wins over an in-flight refresh and invalidates on live history, requests and progress', async () => {
		const fresh = new DeferredPromise<IReplayedTaskHistory>();
		let invalidations = 0;
		const handler = createHandler((_token, _diagnosticId, onCachedHistory) => {
			onCachedHistory?.(recordedHistory());
			return fresh.p;
		}, undefined, undefined, () => invalidations++);
		const session = await handler.provideChatSessionContent(resource, CancellationToken.None);
		const live = store.add(new LiveSession());
		handler.setLiveProvider({ provideChatSessionContent: async () => live });
		await waitForState(session.isReadOnly!, value => !value);
		const afterLive = invalidations;
		live.historyChanges.fire(live.history);
		live.serverRequests.fire({ id: 'new', prompt: 'New request' });
		live.progressObs.set([{ kind: 'markdownContent', content: new MarkdownString('New response') }], undefined);
		live.isCompleteObs.set(false, undefined);
		await fresh.complete(recordedHistory());
		await timeout(0);
		assert.deepStrictEqual({
			afterLive, invalidations, history: session.history, status: session.historyStatus?.get(), readOnly: session.isReadOnly?.get(),
		}, { afterLive: 1, invalidations: 5, history: live.history, status: undefined, readOnly: false });
	});

	function captureTrace() {
		const messages: string[] = [];
		const logService = new class extends NullLogService {
			override info(message: string): void {
				if (message.startsWith('[CloudSandboxTrace]')) {
					messages.push(message);
				}
			}
		}();
		return { logService, messages };
	}

	test('correlates recorded content and live promotion with API diagnostics and cleans up performance marks', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { logService, messages } = captureTrace();
		let apiTraceId: string | undefined;
		const handler = createHandler(async (_token, diagnosticId) => {
			apiTraceId = diagnosticId;
			await timeout(30);
			return recordedHistory();
		}, undefined, logService);
		const session = await handler.provideChatSessionContent(resource, CancellationToken.None);
		const trace = CloudSandboxSessionTrace.get(session)!;
		await timeout(20);
		const live = store.add(new LiveSession());
		handler.setLiveProvider({ provideChatSessionContent: async () => { await timeout(40); return live; } });
		await waitForState(session.isReadOnly!, readOnly => !readOnly);
		const events = messages.map(message => message.replace(`[CloudSandboxTrace] traceId=${trace.id} `, ''));
		const marksBefore = getMarks().filter(mark => mark.name.startsWith(`code/cloudSandbox/${trace.id}/`)).length;
		session.dispose();
		const marksAfter = getMarks().filter(mark => mark.name.startsWith(`code/cloudSandbox/${trace.id}/`)).length;
		trace.record('modelReady');

		assert.deepStrictEqual({
			correlated: apiTraceId === trace.id, events, marksBefore, marksAfter,
			lastEvent: messages.at(-1)?.replace(`[CloudSandboxTrace] traceId=${trace.id} `, ''),
		}, {
			correlated: true,
			events: [
				'event=contentRequested elapsedMs=0',
				'event=historyStarted elapsedMs=0',
				'event=historyReady elapsedMs=30 durationMs=30 historyItems=2',
				'event=contentReady elapsedMs=30 source=history historyItems=2',
				'event=liveProviderReady elapsedMs=50',
				'event=liveStarted elapsedMs=50',
				'event=liveReady elapsedMs=90 durationMs=40 historyItems=2',
				'event=promoted elapsedMs=90 source=live historyItems=2',
			],
			marksBefore: 8, marksAfter: 0, lastEvent: 'event=disposed elapsedMs=90',
		});
	}));

	for (const reason of ['liveWon', 'disposed']) {
		test(`explains history cancellation when ${reason}`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { logService, messages } = captureTrace();
			let traceId: string | undefined;
			const handler = createHandler((token, diagnosticId) => {
				traceId = diagnosticId;
				return raceCancellationError(new DeferredPromise<IReplayedTaskHistory>().p, token);
			}, undefined, logService);
			const cancellation = store.add(new CancellationTokenSource());
			const opened = handler.provideChatSessionContent(resource, cancellation.token);
			if (reason === 'liveWon') {
				handler.setLiveProvider({ provideChatSessionContent: async () => store.add(new LiveSession()) });
				await opened;
			} else {
				const rejected = assert.rejects(opened, isCancellationError);
				cancellation.cancel();
				await rejected;
			}
			await timeout(0);

			assert.deepStrictEqual({
				cancelled: messages.filter(message => message.includes('event=historyCancelled')),
				liveWon: messages.some(message => message.includes('event=contentReady') && message.includes('source=live')),
			}, {
				cancelled: [`[CloudSandboxTrace] traceId=${traceId} event=historyCancelled elapsedMs=0 reason=${reason} durationMs=0`],
				liveWon: reason === 'liveWon',
			});
		}));
	}

	test('promotes the same recorded session and forwards live state without disposing it', async () => {
		const handler = createHandler();
		const session = await handler.provideChatSessionContent(resource, CancellationToken.None);
		const before = { readOnly: session.isReadOnly?.get(), title: session.title };
		const histories: string[] = [];
		let disposed = false;
		store.add(session.onWillDispose(() => disposed = true));
		store.add(session.onDidChangeHistory!(history => histories.push(history[0].type === 'request' ? history[0].prompt : '')));
		const live = store.add(new LiveSession());
		handler.setLiveProvider({ provideChatSessionContent: async () => live });
		await timeout(0);
		live.isInputBlocked.set(true, undefined);
		live.backgroundShellCount.set(2, undefined);
		const canvas: ICanvasContext = {
			owner: { providerId: 'copilot', session: resource, chat: URI.parse(peerChat) },
			canvases: observableValue('canvases', []),
		};
		live.canvasContext.set(canvas, undefined);
		await session.interruptActiveResponseCallback!();

		assert.deepStrictEqual({
			before, same: await sharesContent(handler, session),
			resource: session.sessionResource.toString(), histories, disposed,
			readOnly: session.isReadOnly?.get(), blocked: session.isInputBlocked?.get(), interruptions: live.interruptions,
			backgroundShellCount: session.backgroundShellCount?.get(), sameCanvas: session.canvasContext?.get() === canvas,
		}, {
			before: { readOnly: true, title: 'Recorded title' }, same: true,
			resource: resource.toString(), histories: ['Live request'], disposed: false,
			readOnly: false, blocked: true, interruptions: 1,
			backgroundShellCount: 2, sameCanvas: true,
		});
	});

	test('resumes a recorded turn before publishing its live snapshot', async () => {
		const handler = createHandler();
		const session = await handler.provideChatSessionContent(resource, CancellationToken.None);
		const events: string[] = [];
		store.add(session.onDidChangeHistory!(() => events.push('history')));
		store.add(session.onDidStartServerRequest!(request => events.push(`${request.id}:${request.resume}`)));
		const live = store.add(new LiveSession(session.history));
		live.isCompleteObs.set(false, undefined);
		live.progressObs.set([{ kind: 'markdownContent', content: new MarkdownString('Live snapshot') }], undefined);
		handler.setLiveProvider({ provideChatSessionContent: async () => live });
		await timeout(0);

		assert.deepStrictEqual({
			events, complete: session.isCompleteObs?.get(),
			progress: session.progressObs?.get().map(part => part.kind === 'markdownContent' ? part.content.value : part.kind),
		}, { events: ['history', 'custom-chat:/opaque-main:true'], complete: false, progress: ['Live snapshot'] });
	});

	test('uses live content first when history is slow and cancels the unused history read', async () => {
		const history = new DeferredPromise<IReplayedTaskHistory>();
		let historyToken: CancellationToken | undefined;
		const handler = createHandler(token => { historyToken = token; return history.p; });
		const live = store.add(new LiveSession());
		const opened = handler.provideChatSessionContent(resource, CancellationToken.None);
		handler.setLiveProvider({ provideChatSessionContent: async () => live });
		const session = await opened;
		let historyUpdates = 0;
		store.add(session.onDidChangeHistory!(() => historyUpdates++));
		await history.complete(recordedHistory());
		await timeout(0);

		assert.deepStrictEqual({
			readOnly: session.isReadOnly?.get(), history: session.history, historyUpdates,
			cancelled: historyToken?.isCancellationRequested,
		}, { readOnly: false, history: live.history, historyUpdates: 0, cancelled: true });
	});

	test('shows history failures explicitly and can still promote the same session', async () => {
		const handler = createHandler(async () => { throw new Error('History unavailable'); });
		const session = await handler.provideChatSessionContent(resource, CancellationToken.None);
		const failure = session.history.find(item => item.type === 'response')?.errorDetails?.message;
		const live = store.add(new LiveSession());
		handler.setLiveProvider({ provideChatSessionContent: async () => live });
		await timeout(0);

		assert.deepStrictEqual({
			failure, same: await sharesContent(handler, session),
			readOnly: session.isReadOnly?.get(), history: session.history,
		}, { failure: 'History unavailable', same: true, readOnly: false, history: live.history });
	});

	test('cancelling one reader does not cancel a history read needed by another reader', async () => {
		const history = new DeferredPromise<IReplayedTaskHistory>();
		let historyToken: CancellationToken | undefined;
		const handler = createHandler(token => { historyToken = token; return history.p; });
		const cancellation = store.add(new CancellationTokenSource());
		const cancelled = handler.provideChatSessionContent(resource, cancellation.token);
		const retained = handler.provideChatSessionContent(resource, CancellationToken.None);
		cancellation.cancel();
		await assert.rejects(cancelled, isCancellationError);
		await history.complete(recordedHistory());
		const session = await retained;

		assert.deepStrictEqual({
			cancelled: historyToken?.isCancellationRequested, readOnly: session.isReadOnly?.get(),
		}, { cancelled: false, readOnly: true });
	});

	test('cancelling every reader releases the pending history read', async () => {
		const history = new DeferredPromise<IReplayedTaskHistory>();
		let historyToken: CancellationToken | undefined;
		const handler = createHandler(token => { historyToken = token; return history.p; });
		const cancellation = store.add(new CancellationTokenSource());
		const opened = handler.provideChatSessionContent(resource, cancellation.token);
		cancellation.cancel();
		await assert.rejects(opened, isCancellationError);
		await history.complete(recordedHistory());
		await timeout(0);

		assert.strictEqual(historyToken?.isCancellationRequested, true);
	});

	test('a cancelled history operation does not leave initial loading pending', async () => {
		const handler = createHandler(async () => { throw new CancellationError(); });
		await assert.rejects(handler.provideChatSessionContent(resource, CancellationToken.None), isCancellationError);
	});

	test('a failed live load retains history and a retry promotes the original session', async () => {
		let prompts = 0;
		const notificationService = new class extends TestNotificationService {
			override prompt(...args: Parameters<INotificationService['prompt']>) {
				prompts++;
				return super.prompt(...args);
			}
		}();
		const handler = createHandler(undefined, notificationService);
		const session = await handler.provideChatSessionContent(resource, CancellationToken.None);
		const initialHistory = session.history;
		const live = store.add(new LiveSession());
		let attempts = 0;
		handler.setLiveProvider({
			provideChatSessionContent: async () => {
				if (++attempts === 1) {
					throw new Error('Live history unavailable');
				}
				return live;
			},
		});
		const status = await waitForState(session.historyStatus!, status => status?.kind === 'live');
		const afterFailure = { retained: session.history === initialHistory, readOnly: session.isReadOnly?.get(), kind: status?.kind };
		await status!.action.run();
		assert.deepStrictEqual({
			afterFailure, attempts, prompts, readOnly: session.isReadOnly?.get(),
			same: await sharesContent(handler, session),
		}, { afterFailure: { retained: true, readOnly: true, kind: 'live' }, attempts: 2, prompts: 0, readOnly: false, same: true });
	});

	test('disposal releases the live session and completes an active turn', async () => {
		const handler = createHandler();
		const session = await handler.provideChatSessionContent(resource, CancellationToken.None);
		const live = store.add(new LiveSession());
		live.isCompleteObs.set(false, undefined);
		handler.setLiveProvider({ provideChatSessionContent: async () => live });
		await timeout(0);
		session.dispose();

		assert.deepStrictEqual({ disposed: live.disposed, complete: session.isCompleteObs?.get() }, { disposed: true, complete: true });
	});

	test('promotion preserves host-enforced read-only state', async () => {
		const handler = createHandler();
		const session = await handler.provideChatSessionContent(resource, CancellationToken.None);
		const live = store.add(new LiveSession());
		live.isReadOnly.set(true, undefined);
		handler.setLiveProvider({ provideChatSessionContent: async () => live });
		await timeout(0);
		assert.deepStrictEqual({ readOnly: session.isReadOnly?.get(), history: session.history }, { readOnly: true, history: live.history });
	});

	test('a late live result is disposed after its recorded session is closed', async () => {
		const handler = createHandler();
		const session = await handler.provideChatSessionContent(resource, CancellationToken.None);
		const pending = new DeferredPromise<IChatSession>();
		handler.setLiveProvider({ provideChatSessionContent: () => pending.p });
		session.dispose();
		const live = store.add(new LiveSession());
		await pending.complete(live);
		await timeout(0);
		assert.strictEqual(live.disposed, true);
	});

	for (const explicit of [false, true]) {
		test(`reads the requested opaque peer chat and title (${explicit ? 'query' : 'fragment'}) instead of the default`, async () => {
			const handler = createHandler(async () => recordedHistory('', 'Peer conversation'));
			const peerResource = resource.with(explicit
				? { query: new URLSearchParams({ [CHAT_SUBAGENT_RESOURCE_QUERY_PARAM]: peerChat }).toString() }
				: { fragment: peerChat });
			const session = await handler.provideChatSessionContent(peerResource, CancellationToken.None);
			assert.deepStrictEqual({
				prompts: session.history.filter(item => item.type === 'request').map(item => item.prompt), title: session.title,
			}, { prompts: [peerChat], title: 'Peer conversation' });
		});
	}

	test('falls back to the session title only for the recorded default chat', async () => {
		const handler = createHandler();
		const main = await handler.provideChatSessionContent(resource, CancellationToken.None);
		const peer = await handler.provideChatSessionContent(resource.with({ fragment: peerChat }), CancellationToken.None);
		assert.deepStrictEqual({ main: main.title, peer: peer.title }, { main: 'Recorded title', peer: undefined });
	});

	test('uses the default chat summary title before the parent title', async () => {
		const handler = createHandler(async () => recordedHistory('Default conversation'));
		const session = await handler.provideChatSessionContent(resource, CancellationToken.None);
		assert.strictEqual(session.title, 'Default conversation');
	});

	test('defers completion triggers until live capabilities exist and forwards URI resolution', async () => {
		const handler = createHandler();
		const triggers = handler.provideChatInputCompletionTriggerCharacters();
		const provider: IChatSessionContentProvider = {
			provideChatSessionContent: async () => store.add(new LiveSession()),
			provideChatInputCompletionTriggerCharacters: async () => ['@', '/'],
			resolveChatResponseUri: (_resource, href) => `resolved:${href}`,
		};
		handler.setLiveProvider(provider);
		assert.deepStrictEqual({
			triggers: await triggers,
			uri: handler.resolveChatResponseUri(resource, 'file.txt', 'link'),
		}, { triggers: ['@', '/'], uri: 'resolved:file.txt' });
	});
});

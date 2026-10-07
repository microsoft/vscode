/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../../../base/common/errors.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ICloudSandboxApiService } from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { createChatState, createDefaultChatSummary, createSessionState, MessageKind, SessionStatus, TurnState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IReplayedTaskHistory } from '../../../../../../platform/agentHost/common/taskEventReplay.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService, IPromptChoice } from '../../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../../platform/notification/test/common/testNotificationService.js';
import { CloudSandboxSessionHandler } from '../../../browser/remoteAgentHost/cloudSandboxSessionHandler.js';
import { IChatProgress } from '../../../common/chatService/chatService.js';
import { IChatSession, IChatSessionContentProvider, IChatSessionHistoryItem, IChatSessionServerRequest } from '../../../common/chatSessionsService.js';
import { CHAT_SUBAGENT_RESOURCE_QUERY_PARAM } from '../../../common/constants.js';

const resource = URI.parse('remote-agent-host-test-copilot:/session');
const peerChat = 'custom-chat:/opaque-peer';

function recordedHistory(): IReplayedTaskHistory {
	const summary = {
		resource: 'ahp-session:/session', provider: 'copilot', title: 'Recorded title',
		status: SessionStatus.Idle, createdAt: '2026-01-01T00:00:00.000Z', modifiedAt: '2026-01-01T00:00:00.000Z',
	};
	const chats = ['custom-chat:/opaque-main', peerChat].map(chatResource => {
		const chat = createChatState(createDefaultChatSummary(summary, chatResource));
		chat.turns.push({
			id: chatResource, message: { text: chatResource, origin: { kind: MessageKind.User } },
			responseParts: [], usage: undefined, state: TurnState.Complete,
		});
		return chat;
	});
	return {
		sessions: [{
			session: summary.resource, state: createSessionState(summary),
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
	interruptions = 0;
	disposed = false;

	constructor(readonly history: readonly IChatSessionHistoryItem[] = [
		{ type: 'request', id: 'live-turn', prompt: 'Live request', participant: 'copilot' },
		{ type: 'response', parts: [], participant: 'copilot' },
	]) {
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

	function createHandler(read: (token: CancellationToken) => Promise<IReplayedTaskHistory | undefined> = async () => recordedHistory(), notificationService: INotificationService = new TestNotificationService()) {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(INotificationService, notificationService);
		instantiationService.stub(ICloudSandboxApiService, new class extends mock<ICloudSandboxApiService>() {
			override getSessionHistory(_taskId: string, token: CancellationToken) { return read(token); }
		}());
		return store.add(instantiationService.createInstance(CloudSandboxSessionHandler, {
			taskId: 'task', agentId: 'copilot', connectionAuthority: 'test',
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
		await session.interruptActiveResponseCallback!();

		assert.deepStrictEqual({
			before, same: session === await handler.provideChatSessionContent(resource, CancellationToken.None),
			resource: session.sessionResource.toString(), histories, disposed,
			readOnly: session.isReadOnly?.get(), blocked: session.isInputBlocked?.get(), interruptions: live.interruptions,
		}, {
			before: { readOnly: true, title: 'Recorded title' }, same: true,
			resource: resource.toString(), histories: ['Live request'], disposed: false,
			readOnly: false, blocked: true, interruptions: 1,
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
			failure, same: session === await handler.provideChatSessionContent(resource, CancellationToken.None),
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
		let retry: IPromptChoice | undefined;
		const notificationService = new class extends TestNotificationService {
			override prompt(...args: Parameters<INotificationService['prompt']>) {
				retry = args[2][0];
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
		await timeout(0);
		const afterFailure = { retained: session.history === initialHistory, readOnly: session.isReadOnly?.get() };
		await retry!.run();
		await timeout(0);
		assert.deepStrictEqual({
			afterFailure, attempts, readOnly: session.isReadOnly?.get(),
			same: session === await handler.provideChatSessionContent(resource, CancellationToken.None),
		}, { afterFailure: { retained: true, readOnly: true }, attempts: 2, readOnly: false, same: true });
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
		test(`reads the requested opaque peer chat (${explicit ? 'query' : 'fragment'}) instead of the default`, async () => {
			const handler = createHandler();
			const peerResource = resource.with(explicit
				? { query: new URLSearchParams({ [CHAT_SUBAGENT_RESOURCE_QUERY_PARAM]: peerChat }).toString() }
				: { fragment: peerChat });
			const session = await handler.provideChatSessionContent(peerResource, CancellationToken.None);
			assert.deepStrictEqual(session.history.filter(item => item.type === 'request').map(item => item.prompt), [peerChat]);
		});
	}

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

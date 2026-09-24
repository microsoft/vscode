/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { derived, observableValue, waitForState } from '../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ArtifactPromptRequest, ArtifactPromptTrackingError } from '../../../artifactIntegrations/common/artifactRuntime.js';
import { ArtifactChatAction, ArtifactChatEvent, ArtifactProtocolChatAccess, IArtifactChatBackend } from '../../common/artifactIntegrationChat.js';
import { getAgentHostArtifactIntegrationsCapability } from '../../common/meta/agentHostArtifactIntegrationMeta.js';
import { ActionType, ChatAction } from '../../common/state/sessionActions.js';
import { chatReducer } from '../../common/state/protocol/reducers.js';
import { PROTOCOL_VERSION } from '../../common/state/protocol/version/registry.js';
import { buildDefaultChatUri, ChatOriginKind, ChatState, MessageAttachmentKind, MessageKind, PendingMessageKind, ResponsePartKind, SessionStatus } from '../../common/state/sessionState.js';

suite('Artifact Integration Chat', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const session = 'copilot:/session';
	const chat = buildDefaultChatUri(session);
	const request: ArtifactPromptRequest = { session, chat, requestId: 'artifact-run', prompt: { text: 'Analyse the resource' } };

	function fixture(admission: 'atomic' | 'bestEffort' = 'bestEffort') {
		const state = observableValue<ChatState>('chat', {
			resource: chat, title: 'Chat', modifiedAt: new Date(0).toISOString(), status: SessionStatus.Idle,
			origin: { kind: ChatOriginKind.User }, turns: [],
			draft: { text: 'Keep my draft', origin: { kind: MessageKind.User }, attachments: [{ type: MessageAttachmentKind.EmbeddedResource, label: 'Plan', data: 'cGxhbg==', contentType: 'text/plain' }] },
		});
		const events = store.add(new Emitter<ArtifactChatEvent>());
		const available = observableValue('connected', true);
		const chatError = observableValue<Error | undefined>('chatError', undefined);
		const loading = observableValue('loading', false);
		const subscription = derived(reader => chatError.read(reader) ?? (loading.read(reader) ? undefined : state.read(reader)));
		const dispatches: ArtifactChatAction[] = [];
		let leases = 0;
		let beforeDispatch: ((action: ArtifactChatAction) => void) | undefined;
		let dispatchError: Error | undefined;
		const apply = (action: ChatAction, notify = true) => {
			state.set(chatReducer(state.get(), action), undefined);
			if (notify) {
				events.fire({ channel: chat, action });
			}
		};
		const backend: IArtifactChatBackend = {
			admission, available, onDidAction: events.event,
			acquireChat: async () => {
				leases++;
				const lifetime = toDisposable(() => leases--);
				return { object: subscription, dispose: () => lifetime.dispose() };
			},
			dispatch: async (_chat, action) => {
				beforeDispatch?.(action);
				dispatches.push(action);
				apply(action);
				if (dispatchError) {
					throw dispatchError;
				}
			},
		};
		const createAccess = () => store.add(new ArtifactProtocolChatAccess(backend));
		const access = createAccess();
		return { access, createAccess, state, available, chatError, loading, dispatches, apply, leases: () => leases, beforeDispatch: (handler: (action: ArtifactChatAction) => void) => { beforeDispatch = handler; }, failAfterDispatch: () => { dispatchError = new Error('Lost acknowledgement'); } };
	}

	async function submit(f: ReturnType<typeof fixture>) {
		const result = await f.access.submit(request, CancellationToken.None);
		assert.ok(result.kind === 'accepted');
		return store.add(result.handle);
	}

	test('capability discovery distinguishes unknown, unsupported, and supported hosts', () => {
		const initialize = { protocolVersion: PROTOCOL_VERSION, serverSeq: 0, snapshots: [] };
		assert.deepStrictEqual([
			getAgentHostArtifactIntegrationsCapability(undefined),
			getAgentHostArtifactIntegrationsCapability(initialize),
			getAgentHostArtifactIntegrationsCapability({ ...initialize, _meta: { 'vscode.artifactIntegrations': 1 } }),
			getAgentHostArtifactIntegrationsCapability({ ...initialize, _meta: { 'vscode.artifactIntegrations': 2 } }),
			getAgentHostArtifactIntegrationsCapability({ ...initialize, _meta: { 'vscode.artifactIntegrations': true } }),
		], ['pending', 'unsupported', 'supported', 'pending', 'pending']);
	});

	test('best-effort delivery queues without steering or changing draft text and attachments', async () => {
		const f = fixture();
		const draft = f.state.get().draft;
		const handle = await submit(f);
		assert.deepStrictEqual({
			requestId: handle.requestId,
			receipt: handle.receipt,
			draft: f.state.get().draft,
			steering: f.state.get().steeringMessage,
			actions: f.dispatches.map(action => action.type),
		}, {
			requestId: request.requestId,
			receipt: { kind: 'queued', queuedMessageId: request.requestId },
			draft, steering: undefined, actions: [ActionType.ChatPendingMessageSet],
		});
	});

	test('queue acceptance, correlated start, and technical completion remain distinct', async () => {
		const f = fixture();
		const handle = await submit(f);
		let completed = false;
		const completion = handle.completion.then(outcome => { completed = true; return outcome; });
		const completedOnAcceptance = completed;
		const draft = f.state.get().draft;
		const queued = f.state.get().queuedMessages![0];
		// Legacy hosts may omit message metadata; the queued-message correlation still identifies this turn.
		f.apply({ type: ActionType.ChatTurnStarted, turnId: 'backend-turn', queuedMessageId: queued.id, startedAt: new Date(1).toISOString(), message: { text: queued.message.text, origin: { kind: MessageKind.User } } });
		await waitForState(handle.state, value => value.kind === 'running');
		const completedWhileRunning = completed;
		f.apply({ type: ActionType.ChatTurnComplete, turnId: 'backend-turn', duration: 1 });
		const outcome = await completion;
		assert.deepStrictEqual({
			completedOnAcceptance, completedWhileRunning, outcome: outcome.kind, turnId: outcome.turnId,
			state: handle.state.get().kind, draft: f.state.get().draft, dispatches: f.dispatches.length, leases: f.leases(),
		}, { completedOnAcceptance: false, completedWhileRunning: false, outcome: 'completed', turnId: 'backend-turn', state: 'completed', draft, dispatches: 1, leases: 0 });
	});

	test('an active human turn wins the idle check and is never steered or replaced', async () => {
		const f = fixture();
		f.apply({ type: ActionType.ChatTurnStarted, turnId: 'human-turn', startedAt: new Date(1).toISOString(), message: { text: 'Human message', origin: { kind: MessageKind.User } } });
		assert.deepStrictEqual({ result: await f.access.submit(request, CancellationToken.None), dispatches: f.dispatches, active: f.state.get().activeTurn?.id }, { result: { kind: 'busy' }, dispatches: [], active: 'human-turn' });
	});

	test('best-effort admission queues behind a human turn that wins the dispatch race', async () => {
		const f = fixture();
		f.beforeDispatch(() => {
			f.apply({ type: ActionType.ChatTurnStarted, turnId: 'human-turn', startedAt: new Date(1).toISOString(), message: { text: 'Human message', origin: { kind: MessageKind.User } } });
		});
		await submit(f);
		assert.deepStrictEqual({
			active: f.state.get().activeTurn?.id,
			queued: f.state.get().queuedMessages?.map(message => message.id),
			steering: f.state.get().steeringMessage,
		}, { active: 'human-turn', queued: ['artifact-run'], steering: undefined });
	});

	test('lost acknowledgement is reconciled without resending', async () => {
		const f = fixture();
		f.failAfterDispatch();
		await assert.rejects(f.access.submit(request, CancellationToken.None), /Lost acknowledgement/);
		const recovered = await f.access.recover(request, undefined, CancellationToken.None);
		assert.ok(recovered.kind === 'attached');
		const handle = store.add(recovered.handle);
		assert.deepStrictEqual({ receipt: handle.receipt, dispatches: f.dispatches.length }, { receipt: { kind: 'queued', queuedMessageId: request.requestId }, dispatches: 1 });
	});

	test('missing queue entries are not evidence that a message was never sent', async () => {
		const f = fixture();
		const result = await f.access.recover(request, undefined, CancellationToken.None);
		assert.deepStrictEqual({ kind: result.kind, dispatches: f.dispatches }, { kind: 'indeterminate', dispatches: [] });
	});

	test('cancellation follows queue consumption and cancels only the correlated turn', async () => {
		const f = fixture();
		const handle = await submit(f);
		f.beforeDispatch(action => {
			if (action.type === ActionType.ChatPendingMessageRemoved) {
				f.apply({
					type: ActionType.ChatTurnStarted, turnId: 'consumed-turn', queuedMessageId: request.requestId,
					startedAt: new Date(1).toISOString(), message: f.state.get().queuedMessages![0].message,
				});
			}
		});
		await handle.cancel(CancellationToken.None);
		const outcome = await handle.completion;
		assert.deepStrictEqual({
			actions: f.dispatches.map(action => action.type), outcome: outcome.kind, turnId: outcome.turnId,
		}, { actions: [ActionType.ChatPendingMessageSet, ActionType.ChatPendingMessageRemoved, ActionType.ChatTurnCancelled], outcome: 'cancelled', turnId: 'consumed-turn' });
	});

	test('user removal of a known queued prompt is a confirmed cancellation', async () => {
		const f = fixture();
		const handle = await submit(f);
		f.apply({ type: ActionType.ChatPendingMessageRemoved, kind: PendingMessageKind.Queued, id: request.requestId });
		assert.deepStrictEqual((await handle.completion).kind, 'cancelled');
	});

	test('a failed turn resolves completion with failure rather than a tracking error', async () => {
		const f = fixture('atomic');
		const handle = await submit(f);
		f.apply({
			type: ActionType.ChatError, turnId: request.requestId, duration: 1,
			part: { kind: ResponsePartKind.Error, error: { errorType: 'test', message: 'Turn failed' } },
		});
		const outcome = await handle.completion;
		assert.deepStrictEqual({ outcome: outcome.kind, turnId: outcome.turnId, state: handle.state.get().kind }, { outcome: 'failed', turnId: request.requestId, state: 'failed' });
	});

	test('completion can be awaited after the terminal handle was disposed', async () => {
		const f = fixture('atomic');
		const handle = await submit(f);
		f.apply({ type: ActionType.ChatTurnComplete, turnId: request.requestId, duration: 1 });
		await waitForState(handle.state, state => state.kind === 'completed');
		handle.dispose();
		assert.deepStrictEqual({ outcome: (await handle.completion).kind, leases: f.leases() }, { outcome: 'completed', leases: 0 });
	});

	test('concurrent cancellation calls share one cancellation operation', async () => {
		const f = fixture();
		const handle = await submit(f);
		await Promise.all([handle.cancel(CancellationToken.None), handle.cancel(CancellationToken.None)]);
		assert.deepStrictEqual({
			outcome: (await handle.completion).kind, actions: f.dispatches.map(action => action.type),
		}, { outcome: 'cancelled', actions: [ActionType.ChatPendingMessageSet, ActionType.ChatPendingMessageRemoved] });
	});

	test('state loading after recovery is not mistaken for a missing request', async () => {
		const f = fixture();
		const first = await submit(f);
		const receipt = first.receipt;
		first.dispose();
		f.loading.set(true, undefined);
		const recovered = await f.access.recover(request, receipt, CancellationToken.None);
		assert.ok(recovered.kind === 'attached');
		const handle = store.add(recovered.handle);
		await waitForState(handle.state, state => state.kind === 'unavailable');
		const pending = handle.state.get().kind;
		f.loading.set(false, undefined);
		await waitForState(handle.state, state => state.kind === 'submitted');
		f.apply({ type: ActionType.ChatPendingMessageRemoved, kind: PendingMessageKind.Queued, id: request.requestId });
		assert.deepStrictEqual({
			pending, outcome: (await handle.completion).kind, dispatches: f.dispatches.length,
		}, { pending: 'unavailable', outcome: 'cancelled', dispatches: 1 });
	});

	test('recovery without a receipt waits for initial chat state without resending', async () => {
		const f = fixture();
		(await submit(f)).dispose();
		f.loading.set(true, undefined);
		const recovery = f.access.recover(request, undefined, CancellationToken.None);
		await Promise.resolve();
		f.loading.set(false, undefined);
		const recovered = await recovery;
		assert.ok(recovered.kind === 'attached');
		const handle = store.add(recovered.handle);
		assert.deepStrictEqual({ receipt: handle.receipt, dispatches: f.dispatches.length }, { receipt: { kind: 'queued', queuedMessageId: request.requestId }, dispatches: 1 });
	});

	test('cancelling a recovery releases its pending chat subscription', async () => {
		const f = fixture();
		const cancellation = store.add(new CancellationTokenSource());
		f.loading.set(true, undefined);
		const cancelled = assert.rejects(f.access.recover(request, undefined, cancellation.token), isCancellationError);
		await Promise.resolve();
		cancellation.cancel();
		await cancelled;
		assert.deepStrictEqual({ leases: f.leases(), dispatches: f.dispatches }, { leases: 0, dispatches: [] });
	});

	test('disposing the adapter releases a recovery waiting for initial state', async () => {
		const f = fixture();
		f.loading.set(true, undefined);
		const stopped = assert.rejects(f.access.recover(request, undefined, CancellationToken.None), isCancellationError);
		await Promise.resolve();
		f.access.dispose();
		await stopped;
		assert.deepStrictEqual({ leases: f.leases(), dispatches: f.dispatches }, { leases: 0, dispatches: [] });
	});

	test('disconnecting while recovery loads leaves delivery uncertain', async () => {
		const f = fixture();
		f.loading.set(true, undefined);
		const recovery = f.access.recover(request, undefined, CancellationToken.None);
		await Promise.resolve();
		f.available.set(false, undefined);
		assert.deepStrictEqual({ result: (await recovery).kind, leases: f.leases(), dispatches: f.dispatches }, { result: 'indeterminate', leases: 0, dispatches: [] });
	});

	test('chat errors before sending report not sent rather than an uncertain execution', async () => {
		const f = fixture();
		f.chatError.set(new Error('Chat was deleted'), undefined);
		assert.deepStrictEqual({
			submission: await f.access.submit(request, CancellationToken.None),
			recovery: await f.access.recover(request, undefined, CancellationToken.None),
			dispatches: f.dispatches,
		}, {
			submission: { kind: 'notSent', reason: 'Chat was deleted' },
			recovery: { kind: 'indeterminate', reason: 'Chat was deleted' },
			dispatches: [],
		});
	});

	test('permanent chat errors reject pending completion with a tracking error', async () => {
		const f = fixture();
		const handle = await submit(f);
		const failed = assert.rejects(handle.completion, ArtifactPromptTrackingError);
		f.chatError.set(new Error('Chat was deleted'), undefined);
		await failed;
		assert.deepStrictEqual({ state: handle.state.get().kind, dispatches: f.dispatches.length, leases: f.leases() }, { state: 'indeterminate', dispatches: 1, leases: 0 });
	});

	test('completion remains pending during disconnection and resumes without resending', async () => {
		const f = fixture();
		const handle = await submit(f);
		let settled = false;
		const completion = handle.completion.then(outcome => { settled = true; return outcome; });
		f.available.set(false, undefined);
		await waitForState(handle.state, value => value.kind === 'unavailable');
		f.apply({ type: ActionType.ChatTurnStarted, turnId: 'offline-turn', queuedMessageId: request.requestId, startedAt: new Date(1).toISOString(), message: f.state.get().queuedMessages![0].message }, false);
		f.apply({ type: ActionType.ChatTurnComplete, turnId: 'offline-turn', duration: 1 }, false);
		const disconnected = { state: handle.state.get().kind, settled };
		f.available.set(true, undefined);
		const outcome = await completion;
		assert.deepStrictEqual({
			disconnected, outcome: outcome.kind, turnId: outcome.turnId, dispatches: f.dispatches.length,
		}, { disconnected: { state: 'unavailable', settled: false }, outcome: 'completed', turnId: 'offline-turn', dispatches: 1 });
	});

	test('a persisted turn receipt reattaches after restart even without message metadata', async () => {
		const f = fixture();
		const first = await submit(f);
		f.apply({
			type: ActionType.ChatTurnStarted, turnId: 'legacy-turn', queuedMessageId: request.requestId,
			startedAt: new Date(1).toISOString(), message: { text: request.prompt.text, origin: { kind: MessageKind.User } },
		});
		await waitForState(first.state, value => value.kind === 'running');
		const receipt = first.receipt;
		f.access.dispose();
		const recovered = await f.createAccess().recover(request, receipt, CancellationToken.None);
		assert.ok(recovered.kind === 'attached');
		const handle = store.add(recovered.handle);
		f.apply({ type: ActionType.ChatTurnComplete, turnId: 'legacy-turn', duration: 1 });
		const outcome = await handle.completion;
		assert.deepStrictEqual({
			requestId: handle.requestId, receipt, outcome: outcome.kind, turnId: outcome.turnId, dispatches: f.dispatches.length,
		}, { requestId: request.requestId, receipt: { kind: 'turn', turnId: 'legacy-turn' }, outcome: 'completed', turnId: 'legacy-turn', dispatches: 1 });
	});

	test('a queued receipt can recover work that completed while the caller was closed', async () => {
		const f = fixture();
		const first = await submit(f);
		const receipt = first.receipt;
		f.access.dispose();
		f.apply({ type: ActionType.ChatTurnStarted, turnId: 'finished-turn', queuedMessageId: request.requestId, startedAt: new Date(1).toISOString(), message: f.state.get().queuedMessages![0].message });
		f.apply({ type: ActionType.ChatTurnComplete, turnId: 'finished-turn', duration: 1 });
		const recovered = await f.createAccess().recover(request, receipt, CancellationToken.None);
		assert.ok(recovered.kind === 'attached');
		const handle = store.add(recovered.handle);
		assert.deepStrictEqual({
			outcome: (await handle.completion).kind, receipt: handle.receipt, dispatches: f.dispatches.length,
		}, { outcome: 'completed', receipt: { kind: 'turn', turnId: 'finished-turn' }, dispatches: 1 });
	});

	test('a legacy turn without persisted correlation remains uncertain after restart', async () => {
		const f = fixture();
		const first = await submit(f);
		const receipt = first.receipt;
		f.access.dispose();
		f.apply({
			type: ActionType.ChatTurnStarted, turnId: 'unidentified-turn', queuedMessageId: request.requestId,
			startedAt: new Date(1).toISOString(), message: { text: request.prompt.text, origin: { kind: MessageKind.User } },
		});
		f.apply({ type: ActionType.ChatTurnComplete, turnId: 'unidentified-turn', duration: 1 });
		const recovered = await f.createAccess().recover(request, receipt, CancellationToken.None);
		assert.ok(recovered.kind === 'attached');
		const handle = store.add(recovered.handle);
		await assert.rejects(handle.completion, ArtifactPromptTrackingError);
		assert.deepStrictEqual({ state: handle.state.get().kind, dispatches: f.dispatches.length }, { state: 'indeterminate', dispatches: 1 });
	});

	test('disposing a handle stops observation without cancelling its queued message', async () => {
		const f = fixture();
		const handle = await submit(f);
		const stopped = assert.rejects(handle.completion, isCancellationError);
		handle.dispose();
		await stopped;
		assert.deepStrictEqual({
			queued: f.state.get().queuedMessages?.map(message => message.id),
			actions: f.dispatches.map(action => action.type), leases: f.leases(),
		}, { queued: [request.requestId], actions: [ActionType.ChatPendingMessageSet], leases: 0 });
	});

	test('disposing one handle does not discard another handle correlation', async () => {
		const f = fixture();
		const first = await submit(f);
		const recovered = await f.access.recover(request, first.receipt, CancellationToken.None);
		assert.ok(recovered.kind === 'attached');
		const second = store.add(recovered.handle);
		first.dispose();
		f.apply({
			type: ActionType.ChatTurnStarted, turnId: 'shared-turn', queuedMessageId: request.requestId,
			startedAt: new Date(1).toISOString(), message: { text: request.prompt.text, origin: { kind: MessageKind.User } },
		});
		f.apply({ type: ActionType.ChatTurnComplete, turnId: 'shared-turn', duration: 1 });
		const outcome = await second.completion;
		assert.deepStrictEqual({ outcome: outcome.kind, turnId: outcome.turnId, dispatches: f.dispatches.length }, { outcome: 'completed', turnId: 'shared-turn', dispatches: 1 });
	});

	test('losing the tracked request rejects completion without claiming failure or resending', async () => {
		const f = fixture();
		const handle = await submit(f);
		const uncertain = assert.rejects(handle.completion, ArtifactPromptTrackingError);
		f.state.set({ ...f.state.get(), queuedMessages: [] }, undefined);
		await uncertain;
		assert.deepStrictEqual({ state: handle.state.get().kind, dispatches: f.dispatches.length, leases: f.leases() }, { state: 'indeterminate', dispatches: 1, leases: 0 });
	});

	test('cancellation racing completion does not cancel a later human turn', async () => {
		const f = fixture();
		const handle = await submit(f);
		f.beforeDispatch(action => {
			if (action.type === ActionType.ChatPendingMessageRemoved) {
				f.apply({ type: ActionType.ChatTurnStarted, turnId: 'finished-turn', queuedMessageId: request.requestId, startedAt: new Date(1).toISOString(), message: { text: request.prompt.text, origin: { kind: MessageKind.User } } });
				f.apply({ type: ActionType.ChatTurnComplete, turnId: 'finished-turn', duration: 1 });
				f.apply({ type: ActionType.ChatTurnStarted, turnId: 'human-turn', startedAt: new Date(2).toISOString(), message: { text: 'Human message', origin: { kind: MessageKind.User } } });
			}
		});
		await handle.cancel(CancellationToken.None);
		const outcome = await handle.completion;
		assert.deepStrictEqual({
			outcome: outcome.kind, active: f.state.get().activeTurn?.id, actions: f.dispatches.map(action => action.type),
		}, { outcome: 'completed', active: 'human-turn', actions: [ActionType.ChatPendingMessageSet, ActionType.ChatPendingMessageRemoved] });
	});

	test('a destination in another session is rejected before dispatch', async () => {
		const f = fixture();
		await assert.rejects(f.access.submit({ ...request, session: 'copilot:/other' }, CancellationToken.None), /another session/);
		assert.deepStrictEqual(f.dispatches, []);
	});
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { IChatStatusCanvas, parseChatStatusCanvasContent, parseChatStatusCanvases, readChatStatusCanvases, STATUS_CANVASES_META_KEY, UPDATE_CARD_CANVAS_TOOL, withChatStatusCanvases } from '../../common/chatStatusCanvas.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { buildChatUri, buildDefaultChatUri, ChatOriginKind, MessageKind, SessionStatus, withSessionCreationReference } from '../../common/state/sessionState.js';
import { AgentHostStateManager, creationTimeChatStorageResource } from '../../node/agentHostStateManager.js';
import { AgentServerToolHost } from '../../node/shared/agentServerToolHost.js';
import { createStatusCanvasServerToolGroup } from '../../node/shared/statusCanvasServerTools.js';

suite('Status canvas server tools', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const content = { kind: 'status', topic: 'Status canvas', currentStep: 'Testing', justDone: ['Added persistence'], pullRequests: [{ url: 'https://github.com/microsoft/vscode/pull/1' }], nextSteps: ['Validate UI'] };

	function harness(persist?: (value: readonly IChatStatusCanvas[]) => Promise<void>) {
		const manager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const session = 'copilotcli:/canvas';
		const main = buildDefaultChatUri(session);
		const peer = buildChatUri(session, 'peer');
		manager.createSession({
			resource: session, provider: 'copilotcli', title: 'Canvas', status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(), modifiedAt: new Date(0).toISOString(), defaultChat: main,
		});
		manager.addChat(session, peer, creationTimeChatStorageResource(session, peer, main));
		let saved: readonly IChatStatusCanvas[] = [];
		const group = createStatusCanvasServerToolGroup({ persist: async (_session, next) => {
			await persist?.(next);
			saved = parseChatStatusCanvases(JSON.parse(JSON.stringify(next)));
		} });
		const host = new AgentServerToolHost(manager, [group]);
		host.advertise(session);
		const start = (chat: string, turnId: string) => manager.dispatchServerAction(chat, {
			type: ActionType.ChatTurnStarted, turnId, startedAt: new Date().toISOString(), message: { text: 'Test', origin: { kind: MessageKind.User } },
		});
		return {
			manager, session, main, peer, host, group, start,
			read: () => readChatStatusCanvases(manager.getSessionState(session)?._meta),
			get saved() { return saved; },
			update: (chat = main, value: unknown = content, turnId = manager.getActiveTurnId(chat)) => Promise.resolve(host.executeTool(chat, UPDATE_CARD_CANVAS_TOOL, value, { turnId })),
		};
	}

	test('publishes independently for exact main and peer chats, preserves unrelated metadata and runtime', async () => {
		const h = harness();
		h.start(h.main, 'main-turn');
		h.start(h.peer, 'peer-turn');
		h.manager.setSessionMeta(h.session, { unrelated: true });
		const status = h.manager.getSessionState(h.session)?.status;
		const turns = [h.manager.getActiveTurnId(h.main), h.manager.getActiveTurnId(h.peer)];
		await Promise.all([h.update(), h.update(h.peer, { ...content, topic: 'Peer' })]);
		assert.deepStrictEqual(h.read().map(({ chat, turnId, topic, revision }) => ({ chat, turnId, topic, revision })), [
			{ chat: h.main, turnId: 'main-turn', topic: 'Status canvas', revision: 1 },
			{ chat: h.peer, turnId: 'peer-turn', topic: 'Peer', revision: 1 },
		]);
		assert.deepStrictEqual(h.read(), h.saved);
		assert.deepStrictEqual([h.manager.getActiveTurnId(h.main), h.manager.getActiveTurnId(h.peer)], turns);
		assert.strictEqual(h.manager.getSessionState(h.session)?.status, status);
		assert.strictEqual(h.manager.getSessionState(h.session)?._meta?.unrelated, true);
		const first = await h.update();
		assert.strictEqual(JSON.parse(first).revision, 1, 'Identical same-turn publication is idempotent');
		await h.update(h.main, { ...content, nextSteps: [] });
		assert.strictEqual(h.read().find(canvas => canvas.chat === h.main)?.revision, 2);
		assert.strictEqual(h.read().find(canvas => canvas.chat === h.peer)?.revision, 1);
	});

	test('keeps the previous snapshot visible until persistence succeeds and merges independent metadata changes', async () => {
		const entered = new DeferredPromise<void>();
		const release = new DeferredPromise<void>();
		const h = harness(async () => { await entered.complete(); await release.p; });
		h.start(h.main, 'turn');
		const pending = h.update();
		await entered.p;
		assert.deepStrictEqual(h.read(), []);
		h.manager.setSessionMeta(h.session, { changedWhileSaving: true });
		await release.complete();
		await pending;
		assert.strictEqual(h.manager.getSessionState(h.session)?._meta?.changedWhileSaving, true);
		assert.strictEqual(h.read().length, 1);
	});

	test('persistence errors are failures and do not replace the previous visible or saved snapshot', async () => {
		let fail = false;
		const h = harness(async () => { if (fail) { throw new Error('disk failed'); } });
		h.start(h.main, 'turn');
		await h.update();
		const previous = h.read();
		fail = true;
		await assert.rejects(async () => h.update(h.main, { ...content, topic: 'Not saved' }), /storage recovers/);
		assert.deepStrictEqual(h.read(), previous);
		assert.deepStrictEqual(h.saved, previous);
		fail = false;
		await h.update(h.main, { ...content, topic: 'Retry' });
		assert.strictEqual(h.read()[0].revision, 2);
	});

	test('restores the previous durable snapshot when a persistence failure follows a partial write', async () => {
		let durable: readonly IChatStatusCanvas[] = [];
		let failReceipt = false;
		const h = harness(async value => {
			durable = value;
			if (failReceipt) {
				failReceipt = false;
				throw new Error('receipt failed after write');
			}
		});
		h.start(h.main, 'turn');
		await h.update();
		const previous = h.read();
		failReceipt = true;
		await assert.rejects(async () => h.update(h.main, { ...content, topic: 'Unacknowledged' }), /receipt failed/);
		assert.deepStrictEqual(durable, previous);
		assert.deepStrictEqual(h.read(), previous);
	});

	test('rejects old provider tool-call provenance even after a new active turn starts', async () => {
		const h = harness();
		h.start(h.main, 'new-turn');
		await assert.rejects(async () => h.update(h.main, content, 'old-turn'), /current active turn/);
		assert.deepStrictEqual(h.saved, []);
	});

	test('rolls back an in-flight superseded save before allowing the next turn to publish', async () => {
		const entered = new DeferredPromise<void>();
		const release = new DeferredPromise<void>();
		let writes = 0;
		const h = harness(async () => { if (++writes === 1) { await entered.complete(); await release.p; } });
		h.start(h.main, 'old-turn');
		const pending = h.update();
		const failed = assert.rejects(pending, /current active turn/);
		await entered.p;
		h.start(h.main, 'new-turn');
		const latest = h.update(h.main, { ...content, topic: 'Latest' });
		await release.complete();
		await failed;
		await latest;
		assert.strictEqual(writes, 3, 'Late write, rollback, then the queued current-turn write');
		assert.deepStrictEqual(h.read(), h.saved);
		assert.strictEqual(h.saved[0].turnId, 'new-turn');
		assert.strictEqual(h.saved[0].topic, 'Latest');
	});

	test('cannot publish outside a turn or from a tool-created chat or parent-managed session', async () => {
		const h = harness();
		await assert.rejects(async () => h.update(), /turn/);
		h.start(h.peer, 'peer');
		h.manager.dispatchServerAction(h.session, { type: ActionType.SessionChatUpdated, chat: h.peer, changes: { origin: { kind: ChatOriginKind.Tool, chat: h.main, toolCallId: 'parent' } } });
		await assert.rejects(async () => h.update(h.peer), /invoking user chat/);
		h.start(h.main, 'main');
		h.manager.setSessionMeta(h.session, withSessionCreationReference(undefined, { session: 'copilotcli:/parent', chat: buildDefaultChatUri('copilotcli:/parent'), turnId: 'parent' }));
		await assert.rejects(async () => h.update(), /invoking user chat/);
		assert.deepStrictEqual(h.saved, []);
	});

	test('a queued peer update superseded behind a sibling save never reaches persistence', async () => {
		const entered = new DeferredPromise<void>();
		const release = new DeferredPromise<void>();
		let writes = 0;
		const h = harness(async () => {
			if (++writes === 1) {
				await entered.complete();
				await release.p;
			}
		});
		h.start(h.main, 'main-turn');
		h.start(h.peer, 'old-peer-turn');
		const main = h.update();
		await entered.p;
		const superseded = assert.rejects(h.update(h.peer, { ...content, topic: 'Obsolete peer' }), /current active turn/);
		h.start(h.peer, 'new-peer-turn');
		const peer = h.update(h.peer, { ...content, topic: 'Current peer' });
		await release.complete();
		await Promise.all([main, superseded, peer]);
		assert.deepStrictEqual({
			writes,
			snapshots: h.saved.map(canvas => [canvas.chat, canvas.turnId, canvas.topic, canvas.revision]),
			published: h.read(),
		}, {
			writes: 2,
			snapshots: [[h.main, 'main-turn', content.topic, 1], [h.peer, 'new-peer-turn', 'Current peer', 1]],
			published: h.saved,
		});
	});

	test('tool is discoverable without an inference account and explains before-final publication', () => {
		const h = harness();
		const definition = h.host.getDefinitionsForSession(h.session)[0];
		assert.strictEqual(definition.name, UPDATE_CARD_CANVAS_TOOL);
		assert.strictEqual(definition.deferLoading, false);
		assert.strictEqual(definition.topLevelChatOnly, true);
		assert.match(definition.description!, /before your final response/);
		assert.strictEqual(h.host.requiresConfirmation(h.main, UPDATE_CARD_CANVAS_TOOL), false);
	});

	test('cancelling a turn during persistence restores both chat snapshots before rejecting the tool', async () => {
		const entered = new DeferredPromise<void>();
		const release = new DeferredPromise<void>();
		let delayNext = false;
		const h = harness(async () => {
			if (delayNext) {
				delayNext = false;
				await entered.complete();
				await release.p;
			}
		});
		h.start(h.main, 'main-turn');
		h.start(h.peer, 'peer-turn');
		await h.update();
		await h.update(h.peer, { ...content, topic: 'Peer snapshot' });
		const previous = h.saved;
		delayNext = true;
		const cancelled = assert.rejects(h.update(h.main, { ...content, topic: 'Interrupted update' }), /current active turn/);
		await entered.p;
		h.manager.dispatchServerAction(h.main, { type: ActionType.ChatTurnCancelled, turnId: 'main-turn', duration: 1 });
		await release.complete();
		await cancelled;
		assert.deepStrictEqual({
			saved: h.saved, visible: h.read(), mainTurn: h.manager.getActiveTurnId(h.main), peerTurn: h.manager.getActiveTurnId(h.peer),
		}, { saved: previous, visible: previous, mainTurn: undefined, peerTurn: 'peer-turn' });
	});

	for (const invalid of [
		{ ...content, chat: 'other' }, { ...content, turnId: 'spoofed' }, { ...content, revision: 77 },
		{ ...content, kind: 'html' }, { ...content, topic: '' }, { ...content, currentStep: 'x'.repeat(401) },
		{ ...content, justDone: Array(9).fill('x') }, { ...content, nextSteps: [42] },
		{ ...content, pullRequests: [{ url: 'javascript:alert(1)' }] },
		{ ...content, pullRequests: [{ url: 'https://user:pass@github.com/a/b/pull/1' }] },
		{ ...content, pullRequests: [{ url: 'https://bad host/a/b/pull/1' }] },
		{ ...content, pullRequests: [{ url: 'https://github.com/a/b/pull/1', state: 'merged' }] },
	]) {
		test(`rejects invalid input shape ${JSON.stringify(invalid).slice(-90)}`, () => {
			assert.throws(() => parseChatStatusCanvasContent(invalid));
		});
	}

	test('enforces the exact UTF-8 byte limit in addition to individual field limits', () => {
		const url = (length: number) => `https://github.com/o/${'r'.repeat(length - 'https://github.com/o//pull/1'.length)}/pull/1`;
		const candidate = {
			kind: 'status', topic: 'x'.repeat(200), currentStep: 'x'.repeat(400),
			justDone: Array(8).fill('x'.repeat(400)), pullRequests: [...Array(4).fill({ url: url(2048) }), { url: url(30) }], nextSteps: Array(8).fill('x'.repeat(400)),
		};
		const remaining = 16_384 - new TextEncoder().encode(JSON.stringify(candidate)).byteLength;
		assert.ok(remaining > 0 && remaining + 30 <= 2048);
		candidate.pullRequests[4] = { url: url(30 + remaining) };
		assert.strictEqual(new TextEncoder().encode(JSON.stringify(candidate)).byteLength, 16_384);
		assert.doesNotThrow(() => parseChatStatusCanvasContent(candidate));
		candidate.pullRequests[4] = { url: url(31 + remaining) };
		assert.throws(() => parseChatStatusCanvasContent(candidate), /size limit/);
	});

	test('roundtrips bounded literal text and rejects duplicate owners and malformed stored state', async () => {
		const h = harness();
		h.start(h.main, 'turn');
		await h.update(h.main, { ...content, topic: '<script>not HTML</script>' });
		const raw = JSON.parse(JSON.stringify(h.saved));
		assert.deepStrictEqual(readChatStatusCanvases(withChatStatusCanvases({ sibling: true }, h.saved)), raw);
		assert.throws(() => parseChatStatusCanvases([...raw, ...raw]), /Invalid status canvas/);
		assert.throws(() => parseChatStatusCanvases([{ ...raw[0], updatedAt: 'yesterday' }]), /Invalid status canvas/);
		assert.strictEqual(withChatStatusCanvases({ [STATUS_CANVASES_META_KEY]: raw }, [])[STATUS_CANVASES_META_KEY], undefined);
	});
});

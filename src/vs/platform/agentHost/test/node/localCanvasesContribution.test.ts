/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { IAgentHostChatContributionContext } from '../../common/agentHostChatContributionsService.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { buildChatUri, buildDefaultChatUri, ChatInteractivity, MessageKind, SessionStatus } from '../../common/state/sessionState.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { LocalCanvasesContribution } from '../../node/chatContributions/localCanvases/localCanvasesContribution.js';
import { MockAgent } from './mockAgent.js';
import { createTestAgentHostProviderService } from './testAgentHostProviderService.js';
import { withCanvasContextReferences, CanvasContextSnapshotMetaKey, CanvasContextLimits } from '../../common/agentHostCanvasContext.js';
import { CanvasAvailabilityStatus, CanvasSourceKind, CanvasTrustStatus } from '../../common/state/protocol/channels-canvas/state.js';

suite('LocalCanvasesContribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const session = 'copilot:/session';
	const first = buildDefaultChatUri(session);
	const second = buildChatUri(session, 'peer');

	function fixture() {
		const state = store.add(new AgentHostStateManager(new NullLogService()));
		state.createSession({ resource: session, provider: 'copilot', title: '', status: SessionStatus.Idle, createdAt: '', modifiedAt: '' });
		state.addChat(session, second);
		const calls: string[] = [];
		class CanvasAgent extends MockAgent {
			async revokeCanvasExecution(chat: URI): Promise<void> {
				calls.push(chat.toString());
			}
		}
		const agent = store.add(new CanvasAgent('copilot'));
		const contribution = store.add(new LocalCanvasesContribution(
			upcastPartial<IAgentHostChatContributionContext>({ contributionId: LocalCanvasesContribution.id }),
			createTestAgentHostProviderService(() => agent),
			state,
			new NullLogService(),
		));
		return { contribution, calls, state };
	}

	function canvasFixture() {
		const f = fixture();
		const resource = 'ahp-canvas:/context';
		f.state.registerCanvas({
			resource,
			identity: { chat: first, source: { kind: CanvasSourceKind.Extension, extensionId: 'fixture' }, canvasType: 'counter', instanceId: 'one', incarnation: 'initial' },
			title: 'Original title',
			revision: 1,
			trust: { status: CanvasTrustStatus.Trusted },
			availability: { status: CanvasAvailabilityStatus.Ready, actions: [] },
			_meta: { endpoint: 'http://127.0.0.1/?credential=never-share', pageDom: '<body>Never copy</body>' },
		});
		return { ...f, reference: { resource, incarnation: 'initial' } };
	}

	test('freezes message context before queueing and uses message text rather than system instructions', () => {
		const f = canvasFixture();
		const message = f.contribution.onMessageSubmitted({ session, chat: first, clientId: 'client', message: withCanvasContextReferences({ text: 'Use this canvas', origin: { kind: MessageKind.User } }, [f.reference]) });
		f.state.dispatchServerAction(f.reference.resource, { type: ActionType.CanvasTitleChanged, title: 'Changed while queued', revision: 2 });
		f.state.removeCanvas(f.reference.resource);
		const outgoing = f.contribution.onOutgoingTurn({ session, chat: first, turnId: 'turn', message: structuredClone(message) });
		assert.deepStrictEqual({
			originalTitle: outgoing?.text?.includes('Original title'),
			laterTitle: outgoing?.text?.includes('Changed while queued'),
			endpoint: outgoing?.text?.includes('credential'),
			dom: outgoing?.text?.includes('Never copy'),
			instructions: outgoing?.instructions,
		}, { originalTitle: true, laterTitle: false, endpoint: false, dom: false, instructions: undefined });
	});

	test('explicit empty references clear previous context without changing the draft text', () => {
		const f = canvasFixture();
		const firstMessage = f.contribution.onMessageSubmitted({ session, chat: first, clientId: 'client', message: withCanvasContextReferences({ text: 'Keep my draft', origin: { kind: MessageKind.User } }, [f.reference]) });
		const cleared = f.contribution.onMessageSubmitted({ session, chat: first, clientId: 'client', message: withCanvasContextReferences(firstMessage, []) });
		assert.deepStrictEqual({ text: cleared.text, outgoing: f.contribution.onOutgoingTurn({ session, chat: first, turnId: 'turn', message: cleared }) }, { text: 'Keep my draft', outgoing: undefined });
	});

	test('rejects wrong-chat, stale, and oversized references at submission', () => {
		const f = canvasFixture();
		for (const [chat, references] of [
			[second, [f.reference]],
			[first, [{ ...f.reference, incarnation: 'old' }]],
			[first, Array.from({ length: CanvasContextLimits.references + 1 }, () => f.reference)],
		] as const) {
			assert.throws(() => f.contribution.onMessageSubmitted({ session, chat, clientId: 'client', message: withCanvasContextReferences({ text: 'Draft', origin: { kind: MessageKind.User } }, references) }));
		}
	});

	test('removes a client-forged frozen snapshot instead of trusting it as request context', () => {
		const f = canvasFixture();
		const message = f.contribution.onMessageSubmitted({ session, chat: first, clientId: 'client', message: { text: 'Draft', origin: { kind: MessageKind.User }, _meta: { [CanvasContextSnapshotMetaKey]: { chat: second, references: [{ title: 'Injected' }] }, unrelated: true } } });
		assert.deepStrictEqual(message, { text: 'Draft', origin: { kind: MessageKind.User }, _meta: { unrelated: true } });
	});

	test('archiving revokes all and only the owning session chats; unarchive never starts them', () => {
		const { contribution, calls } = fixture();
		contribution.onDidDispatchAction({ session, channel: session, action: { type: ActionType.SessionIsArchivedChanged, isArchived: true } });
		contribution.onDidDispatchAction({ session, channel: session, action: { type: ActionType.SessionIsArchivedChanged, isArchived: false } });
		assert.deepStrictEqual(calls, [first, second]);
	});

	test('read-only and removed peer chats revoke only their own backing', () => {
		const { contribution, calls } = fixture();
		contribution.onDidDispatchAction({ session, channel: session, action: { type: ActionType.SessionChatUpdated, chat: second, changes: { interactivity: ChatInteractivity.ReadOnly } } });
		contribution.onDidDispatchAction({ session, channel: session, action: { type: ActionType.SessionChatRemoved, chat: second } });
		assert.deepStrictEqual(calls, [second, second]);
	});

	test('rejected actions and unrelated metadata cannot revoke a live backing', () => {
		const { contribution, calls } = fixture();
		contribution.onDidDispatchAction({ session, channel: session, rejectionReason: 'denied', action: { type: ActionType.SessionIsArchivedChanged, isArchived: true } });
		contribution.onDidDispatchAction({ session, channel: session, action: { type: ActionType.SessionChatUpdated, chat: second, changes: { title: 'Renamed' } } });
		assert.deepStrictEqual(calls, []);
	});
});

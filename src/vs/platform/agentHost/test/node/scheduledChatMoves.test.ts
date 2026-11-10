/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentChatMoveRefusal, AgentChatMoveRefusedError } from '../../common/agentHostChatMove.js';
import { SessionStatus } from '../../common/state/protocol/channels-session/state.js';
import { buildDefaultChatUri } from '../../common/state/sessionState.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentHostScheduledChatMoves } from '../../node/chatContributions/scheduledChatMoves/scheduledChatMovesService.js';
import type { ISessionServerToolMove } from '../../node/shared/sessionServerTools.js';

suite('AgentHostScheduledChatMoves', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const session = 'copilot:/s1';
	const chat = buildDefaultChatUri(session);
	const move: ISessionServerToolMove = { kind: 'session', session: URI.parse(session), destination: URI.parse('copilot:/s2'), after: 'end' };

	function create(apply: (move: ISessionServerToolMove) => Promise<URI> = async () => URI.parse('copilot:/s2')) {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const applied: string[] = [];
		const moves = disposables.add(new AgentHostScheduledChatMoves({
			applyChatMove: scheduled => {
				applied.push(scheduled.session.toString());
				return apply(scheduled);
			},
		}, stateManager, new NullLogService()));
		return { stateManager, moves, applied };
	}

	function createSession(stateManager: AgentHostStateManager): void {
		stateManager.createSession({
			resource: session,
			provider: 'copilot',
			title: 'Session',
			status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(),
			modifiedAt: new Date(0).toISOString(),
			defaultChat: chat,
		});
	}

	test('applies a scheduled move once, when the turn that requested it succeeds', () => {
		const { moves, applied } = create();
		moves.schedule(chat, 'turn-1', move);
		moves.turnEnded(chat, 'turn-0', true);
		const beforeItsTurnEnded = [...applied];
		moves.turnEnded(chat, 'turn-1', true);
		moves.turnEnded(chat, 'turn-1', true);

		assert.deepStrictEqual({ beforeItsTurnEnded, applied }, { beforeItsTurnEnded: [], applied: [session] });
	});

	test('holds the chat\'s queued turns from its turn end until the move is done, also when it is refused', async () => {
		const moving = new DeferredPromise<URI>();
		const { stateManager, moves } = create(() => moving.p);
		const released: string[][] = [];
		disposables.add(stateManager.onDidReleaseChatAdmission(chats => released.push([...chats])));
		moves.schedule(chat, 'turn-1', move);
		const beforeTurnEnd = stateManager.isChatAdmissionHeld(chat);
		moves.turnEnded(chat, 'turn-1', true);
		// Synchronous: a queue drain later in the same turn end already sees the hold.
		const atTurnEnd = stateManager.isChatAdmissionHeld(chat);
		await timeout(0);
		const whileMoving = stateManager.isChatAdmissionHeld(chat);
		moving.complete(URI.parse('copilot:/s2'));
		await timeout(0);
		const moved = { held: stateManager.isChatAdmissionHeld(chat), released: [...released] };

		const refused = create(async () => { throw new AgentChatMoveRefusedError(AgentChatMoveRefusal.Conflict, 'changed'); });
		refused.moves.schedule(chat, 'turn-2', move);
		refused.moves.turnEnded(chat, 'turn-2', true);
		await timeout(0);

		assert.deepStrictEqual({ beforeTurnEnd, atTurnEnd, whileMoving, moved, heldAfterRefusal: refused.stateManager.isChatAdmissionHeld(chat) }, {
			beforeTurnEnd: false,
			atTurnEnd: true,
			whileMoving: true,
			moved: { held: false, released: [[chat]] },
			heldAfterRefusal: false,
		});
	});

	test('drops a move whose turn did not succeed, and refuses a second move in one turn', () => {
		const { stateManager, moves, applied } = create();
		moves.schedule(chat, 'cancelled', move);
		moves.turnEnded(chat, 'cancelled', false);
		moves.turnEnded(chat, 'cancelled', true);

		moves.schedule(chat, 'twice', move);
		let second: string | undefined;
		try {
			moves.schedule(chat, 'twice', move);
		} catch (error) {
			second = (error as Error).message;
		}

		assert.deepStrictEqual({ applied, second, held: stateManager.isChatAdmissionHeld(chat) }, { applied: [], second: 'A move of this chat is already scheduled for when this turn ends.', held: false });
	});

	test('clears a scheduled move when its chat is unregistered', () => {
		const { stateManager, moves, applied } = create();
		createSession(stateManager);
		moves.schedule(chat, 'deleted', move);
		// Deleting the session unregisters its chats.
		stateManager.deleteSession(session);
		moves.turnEnded(chat, 'deleted', true);

		assert.deepStrictEqual({ applied, held: stateManager.isChatAdmissionHeld(chat) }, { applied: [], held: false });
	});
});

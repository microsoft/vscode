/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
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

	function create() {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const applied: string[] = [];
		const moves = disposables.add(new AgentHostScheduledChatMoves({
			applyChatMove: async scheduled => {
				applied.push(scheduled.session.toString());
				return URI.parse('copilot:/s2');
			},
		}, stateManager, new NullLogService()));
		return { stateManager, moves, applied };
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

	test('drops a move whose turn did not succeed or whose chat is gone, and refuses a second move in one turn', () => {
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

		stateManager.createSession({
			resource: session,
			provider: 'copilot',
			title: 'Session',
			status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(),
			modifiedAt: new Date(0).toISOString(),
			defaultChat: chat,
		});
		moves.schedule(chat, 'deleted', move);
		stateManager.deleteSession(session);
		moves.turnEnded(chat, 'deleted', true);

		assert.deepStrictEqual({ applied, second }, { applied: [], second: 'A move of this chat is already scheduled for when this turn ends.' });
	});
});

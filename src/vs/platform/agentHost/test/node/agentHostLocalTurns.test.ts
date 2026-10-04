/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { NullLogService } from '../../../log/common/log.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { MessageKind, TurnState, type Turn } from '../../common/state/sessionState.js';
import { AgentHostLocalTurns } from '../../node/agentHostLocalTurns.js';
import { TestSessionDatabase, createSessionDataService } from '../common/sessionTestHelpers.js';

suite('AgentHostLocalTurns', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const session = 'mock:/session-1';

	function turn(id: string): Turn {
		return { id, message: { text: id, origin: { kind: MessageKind.User } }, responseParts: [], usage: undefined, state: TurnState.Complete };
	}

	test('records, resolves anchors, persists, and deletes local turns', async () => {
		const db = new TestSessionDatabase();
		const registry = new AgentHostLocalTurns(createSessionDataService(db), new NullLogService());
		const chat = 'ahp-chat://default/xyz';

		// Two locals: one anchored to a real turn, one anchored before any real turn.
		registry.record(session, chat, turn('local-a'), 'real-1');
		registry.record(session, chat, turn('local-b'), undefined);

		assert.strictEqual(registry.isLocal(chat, 'local-a'), true);
		assert.strictEqual(registry.isLocal(chat, 'real-1'), false);
		// Local resolves to its concrete anchor; a concrete turn resolves to itself.
		assert.strictEqual(registry.resolveConcreteTurnId(chat, 'local-a'), 'real-1');
		assert.strictEqual(registry.resolveConcreteTurnId(chat, 'local-b'), undefined);
		assert.strictEqual(registry.resolveConcreteTurnId(chat, 'real-1'), 'real-1');
		assert.deepStrictEqual(new Set(registry.getLocalTurnIds(chat)), new Set(['local-a', 'local-b']));

		// Persisted to the database with the chat discriminator.
		const persisted = (await db.getPersistedTurns()).filter(record => record.kind === 'local');
		assert.deepStrictEqual(persisted.map(r => ({ turnId: r.turnId, chatUri: r.chatUri, anchorTurnId: r.anchorTurnId })), [
			{ turnId: 'local-a', chatUri: chat, anchorTurnId: 'real-1' },
			{ turnId: 'local-b', chatUri: chat, anchorTurnId: undefined },
		]);

		// Delete removes from memory and the database.
		registry.deleteLocals(session, ['local-a']);
		assert.strictEqual(registry.isLocal(chat, 'local-a'), false);
		assert.deepStrictEqual((await db.getPersistedTurns()).map(r => r.turnId), ['local-b']);
	});

	test('load re-populates the in-memory index from the database, scoped per chat', async () => {
		const db = new TestSessionDatabase();
		const chatA = 'ahp-chat://default/a';
		const chatB = 'ahp-chat://peer/b';
		await db.insertPersistedTurn({ kind: 'local', turnId: 'local-x', chatUri: chatA, anchorTurnId: 'real-9', seq: 3, payload: JSON.stringify(turn('local-x')) });
		await db.insertPersistedTurn({ kind: 'local', turnId: 'local-y', chatUri: chatB, anchorTurnId: undefined, seq: 4, payload: JSON.stringify(turn('local-y')) });

		const registry = new AgentHostLocalTurns(createSessionDataService(db), new NullLogService());
		const recordsA = await registry.loadForChat(session, chatA);

		// loadForChat returns only the requested chat's records...
		assert.deepStrictEqual(recordsA.map(r => r.turnId), ['local-x']);
		// ...but the in-memory index is populated for every chat in the session.
		assert.strictEqual(registry.isLocal(chatA, 'local-x'), true);
		assert.strictEqual(registry.resolveConcreteTurnId(chatA, 'local-x'), 'real-9');
		assert.strictEqual(registry.isLocal(chatB, 'local-y'), true);
	});

	test('continues local ordering after persisted failed turns', async () => {
		const db = new TestSessionDatabase();
		const chat = 'ahp-chat://default/a';
		await db.insertPersistedTurn({ kind: 'local', turnId: 'local-a', chatUri: chat, anchorTurnId: undefined, seq: 3, payload: JSON.stringify(turn('local-a')) });
		await db.insertPersistedTurn({ kind: 'failed', turnId: 'failed-a', chatUri: chat, anchorTurnId: 'real-1', payload: JSON.stringify(turn('failed-a')) });

		const registry = new AgentHostLocalTurns(createSessionDataService(db), new NullLogService());
		await registry.loadForChat(session, chat);
		registry.record(session, chat, turn('local-b'), 'real-1');

		assert.deepStrictEqual((await db.getPersistedTurns()).map(record => ({ kind: record.kind, turnId: record.turnId, seq: record.seq })), [
			{ kind: 'local', turnId: 'local-a', seq: 3 },
			{ kind: 'failed', turnId: 'failed-a', seq: 4 },
			{ kind: 'local', turnId: 'local-b', seq: 5 },
		]);
	});
});

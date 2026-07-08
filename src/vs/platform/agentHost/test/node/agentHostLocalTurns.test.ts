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
		const persisted = await db.getLocalTurns();
		assert.deepStrictEqual(persisted.map(r => ({ turnId: r.turnId, chatUri: r.chatUri, anchorTurnId: r.anchorTurnId })), [
			{ turnId: 'local-a', chatUri: chat, anchorTurnId: 'real-1' },
			{ turnId: 'local-b', chatUri: chat, anchorTurnId: undefined },
		]);

		// Delete removes from memory and the database.
		registry.deleteLocals(session, ['local-a']);
		assert.strictEqual(registry.isLocal(chat, 'local-a'), false);
		assert.deepStrictEqual((await db.getLocalTurns()).map(r => r.turnId), ['local-b']);
	});

	test('load re-populates the in-memory index from the database, scoped per chat', async () => {
		const db = new TestSessionDatabase();
		const chatA = 'ahp-chat://default/a';
		const chatB = 'ahp-chat://peer/b';
		await db.insertLocalTurn({ turnId: 'local-x', chatUri: chatA, anchorTurnId: 'real-9', seq: 3, payload: JSON.stringify(turn('local-x')) });
		await db.insertLocalTurn({ turnId: 'local-y', chatUri: chatB, anchorTurnId: undefined, seq: 4, payload: JSON.stringify(turn('local-y')) });

		const registry = new AgentHostLocalTurns(createSessionDataService(db), new NullLogService());
		const recordsA = await registry.loadForChat(session, chatA);

		// loadForChat returns only the requested chat's records...
		assert.deepStrictEqual(recordsA.map(r => r.turnId), ['local-x']);
		// ...but the in-memory index is populated for every chat in the session.
		assert.strictEqual(registry.isLocal(chatA, 'local-x'), true);
		assert.strictEqual(registry.resolveConcreteTurnId(chatA, 'local-x'), 'real-9');
		assert.strictEqual(registry.isLocal(chatB, 'local-y'), true);
	});

	test('carries model context through record, persistence, and reload', async () => {
		const db = new TestSessionDatabase();
		const chat = 'ahp-chat://default/xyz';
		const registry = new AgentHostLocalTurns(createSessionDataService(db), new NullLogService());
		registry.record(session, chat, turn('local-a'), 'real-1', 'ran !ls\nfoo');
		registry.record(session, chat, turn('local-b'), 'real-1');

		assert.strictEqual(registry.getModelContext(chat, 'local-a'), 'ran !ls\nfoo');
		assert.strictEqual(registry.getModelContext(chat, 'local-b'), undefined);

		// Survives a reload into a fresh registry backed by the same database.
		const reloaded = new AgentHostLocalTurns(createSessionDataService(db), new NullLogService());
		await reloaded.loadForChat(session, chat);
		assert.strictEqual(reloaded.getModelContext(chat, 'local-a'), 'ran !ls\nfoo');
		assert.strictEqual(reloaded.getModelContext(chat, 'local-b'), undefined);
	});

	test('collectPendingModelContext returns context of the trailing locals after the last concrete turn, in order, skipping context-less locals', () => {
		const db = new TestSessionDatabase();
		const chat = 'ahp-chat://default/xyz';
		const registry = new AgentHostLocalTurns(createSessionDataService(db), new NullLogService());
		// A bang (ctx) and a context-less local (e.g. /rename) recorded after real-1.
		registry.record(session, chat, turn('local-a'), 'real-1', 'ctx-a');
		registry.record(session, chat, turn('local-rename'), 'real-1');
		// The in-flight real message being sent is NOT part of the completed
		// transcript, so the pending locals are the trailing entries.
		const transcript = [turn('real-1'), turn('local-a'), turn('local-rename')];

		// Context of the pending locals since real-1, in order (rename skipped).
		assert.deepStrictEqual(registry.collectPendingModelContext(chat, transcript), ['ctx-a']);
		// No trailing locals once the transcript ends on a concrete turn.
		assert.deepStrictEqual(registry.collectPendingModelContext(chat, [turn('real-1')]), []);
		// Empty transcript yields nothing.
		assert.deepStrictEqual(registry.collectPendingModelContext(chat, []), []);
	});
});

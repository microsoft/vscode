/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentSession } from '../../../agent/common/agentService.js';
import { NativeAgent } from '../../node/nativeAgent.js';

suite('NativeAgent', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let agent: NativeAgent;

	setup(() => {
		agent = store.add(new NativeAgent(new NullLogService()));
	});

	test('returns correct descriptor', () => {
		const desc = agent.getDescriptor();
		assert.strictEqual(desc.provider, 'native');
		assert.strictEqual(desc.requiresAuth, true);
		assert.ok(desc.displayName);
		assert.ok(desc.description);
	});

	test('creates a session and returns a URI', async () => {
		const sessionUri = await agent.createSession();
		assert.ok(sessionUri);
		assert.strictEqual(AgentSession.provider(sessionUri), 'native');
	});

	test('creates a session with custom config', async () => {
		const sessionUri = await agent.createSession({
			model: 'claude-sonnet-4-20250514',
			workingDirectory: '/tmp/test',
		});
		assert.ok(sessionUri);
		assert.strictEqual(AgentSession.provider(sessionUri), 'native');
	});

	test('lists created sessions', async () => {
		const s1 = await agent.createSession();
		const s2 = await agent.createSession();

		const sessions = await agent.listSessions();
		assert.strictEqual(sessions.length, 2);
		assert.ok(sessions.some(s => s.session.toString() === s1.toString()));
		assert.ok(sessions.some(s => s.session.toString() === s2.toString()));
	});

	test('disposes a session', async () => {
		const sessionUri = await agent.createSession();
		await agent.disposeSession(sessionUri);

		const sessions = await agent.listSessions();
		assert.strictEqual(sessions.length, 0);
	});

	test('getSessionMessages returns empty for new session', async () => {
		const sessionUri = await agent.createSession();
		const messages = await agent.getSessionMessages(sessionUri);
		assert.strictEqual(messages.length, 0);
	});

	test('lists models (falls back to defaults without auth)', async () => {
		const models = await agent.listModels();
		assert.ok(models.length > 0);
		assert.strictEqual(models[0].provider, 'native');
		assert.ok(models[0].id);
		assert.ok(models[0].name);
		assert.ok(models[0].maxContextWindow > 0);
	});

	test('throws on sendMessage to nonexistent session', async () => {
		const fakeUri = AgentSession.uri('native', 'nonexistent');
		await assert.rejects(
			() => agent.sendMessage(fakeUri, 'hello'),
			/Session not found/,
		);
	});

	test('abort clears running state', async () => {
		const sessionUri = await agent.createSession();
		// Abort a session that isn't running -- should not throw
		await agent.abortSession(sessionUri);
	});

	test('shutdown disposes all sessions', async () => {
		await agent.createSession();
		await agent.createSession();

		await agent.shutdown();

		const sessions = await agent.listSessions();
		assert.strictEqual(sessions.length, 0);
	});
});

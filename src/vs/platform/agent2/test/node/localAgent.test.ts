/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import { join } from '../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { AgentSession } from '../../../agent/common/agentService.js';
import { LocalAgent } from '../../node/localAgent.js';
import { CopilotApiService, ICopilotApiService } from '../../node/copilotToken.js';

suite('LocalAgent', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let agent: LocalAgent;
	let tmpDir: string;

	setup(async () => {
		tmpDir = await fs.promises.mkdtemp(join(os.tmpdir(), 'agent2-local-'));
		const log = new NullLogService();

		const services = new ServiceCollection();
		services.set(ILogService, log);
		services.set(ICopilotApiService, new CopilotApiService(log));
		services.set(INativeEnvironmentService, { userDataPath: tmpDir } as Partial<INativeEnvironmentService> as INativeEnvironmentService);
		const instantiationService = store.add(new InstantiationService(services));

		agent = store.add(instantiationService.createInstance(LocalAgent));
	});

	teardown(async () => {
		await fs.promises.rm(tmpDir, { recursive: true, force: true });
	});

	test('returns correct descriptor', () => {
		const desc = agent.getDescriptor();
		assert.strictEqual(desc.provider, 'local');
		assert.strictEqual(desc.requiresAuth, true);
		assert.ok(desc.displayName);
		assert.ok(desc.description);
	});

	test('creates a session and returns a URI', async () => {
		const sessionUri = await agent.createSession();
		assert.ok(sessionUri);
		assert.strictEqual(AgentSession.provider(sessionUri), 'local');
	});

	test('creates a session with custom config', async () => {
		const sessionUri = await agent.createSession({
			model: 'claude-sonnet-4-20250514',
			workingDirectory: '/tmp/test',
		});
		assert.ok(sessionUri);
		assert.strictEqual(AgentSession.provider(sessionUri), 'local');
	});

	test('lists created sessions', async () => {
		const s1 = await agent.createSession();
		const s2 = await agent.createSession();

		const sessions = await agent.listSessions();
		assert.strictEqual(sessions.length, 2);
		assert.ok(sessions.some(s => s.session.toString() === s1.toString()));
		assert.ok(sessions.some(s => s.session.toString() === s2.toString()));
	});

	test('disposes a session from memory', async () => {
		const sessionUri = await agent.createSession();
		await agent.disposeSession(sessionUri);

		// Session is removed from in-memory state but remains on disk.
		// getSessionMessages still works (reads from persisted storage).
		const messages = await agent.getSessionMessages(sessionUri);
		assert.strictEqual(messages.length, 0);
	});

	test('getSessionMessages returns empty for new session', async () => {
		const sessionUri = await agent.createSession();
		const messages = await agent.getSessionMessages(sessionUri);
		assert.strictEqual(messages.length, 0);
	});

	test('lists models (falls back to defaults without auth)', async () => {
		const models = await agent.listModels();
		assert.ok(models.length > 0);
		assert.strictEqual(models[0].provider, 'local');
		assert.ok(models[0].id);
		assert.ok(models[0].name);
		assert.ok(models[0].maxContextWindow > 0);
	});

	test('throws on sendMessage to nonexistent session', async () => {
		const fakeUri = AgentSession.uri('local', 'nonexistent');
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

	test('shutdown clears in-memory sessions', async () => {
		await agent.createSession();
		await agent.createSession();

		await agent.shutdown();

		// In-memory sessions are gone, but a truly nonexistent session
		// (never persisted anywhere) still fails.
		const fakeUri = AgentSession.uri('local', 'never-existed');
		await assert.rejects(
			() => agent.sendMessage(fakeUri, 'hello'),
			/Session not found/,
		);
	});

	test('persisted sessions survive dispose and are listed', async () => {
		const s1 = await agent.createSession({ workingDirectory: '/workspace' });
		await agent.disposeSession(s1);

		// Session was disposed from memory but persisted on disk.
		// listSessions should still find it.
		const sessions = await agent.listSessions();
		assert.ok(sessions.some(s => s.session.toString() === s1.toString()));
	});

	test('getSessionMessages works after dispose (reads from storage)', async () => {
		const s1 = await agent.createSession();

		// Verify messages are empty on new session
		const before = await agent.getSessionMessages(s1);
		assert.strictEqual(before.length, 0);

		// Dispose removes from memory
		await agent.disposeSession(s1);

		// getSessionMessages still reads from persisted storage
		const after = await agent.getSessionMessages(s1);
		assert.strictEqual(after.length, 0);
	});

	test('persisted sessions show up after shutdown', async () => {
		const s1 = await agent.createSession({ workingDirectory: '/workspace' });
		const s2 = await agent.createSession({ workingDirectory: '/workspace' });

		await agent.shutdown();

		// After shutdown, sessions are gone from memory but persisted.
		// listSessions still returns them from storage.
		const sessions = await agent.listSessions();
		assert.ok(sessions.some(s => s.session.toString() === s1.toString()));
		assert.ok(sessions.some(s => s.session.toString() === s2.toString()));
	});
});

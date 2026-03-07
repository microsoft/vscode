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

		// Session is removed from in-memory state but persisted sessions
		// remain on disk, so listSessions may still return it.
		// Verify that sendMessage throws (session no longer active).
		await assert.rejects(
			() => agent.sendMessage(sessionUri, 'hello'),
			/Session not found/,
		);
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
		const s1 = await agent.createSession();
		await agent.createSession();

		await agent.shutdown();

		// In-memory sessions are gone
		await assert.rejects(
			() => agent.sendMessage(s1, 'hello'),
			/Session not found/,
		);
	});
});

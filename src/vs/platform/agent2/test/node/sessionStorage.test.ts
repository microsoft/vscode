/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import { join } from '../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentSession } from '../../../agent/common/agentService.js';
import { SessionStorage } from '../../node/sessionStorage.js';
import { SESSION_ENTRY_VERSION } from '../../common/sessionTypes.js';

const V = SESSION_ENTRY_VERSION;

suite('SessionStorage', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let tmpDir: string;
	let storage: SessionStorage;

	setup(async () => {
		tmpDir = await fs.promises.mkdtemp(join(os.tmpdir(), 'agent2-storage-'));
		storage = new SessionStorage(tmpDir, new NullLogService());
	});

	teardown(async () => {
		await fs.promises.rm(tmpDir, { recursive: true, force: true });
	});

	test('creates and lists a session', async () => {
		const uri = AgentSession.uri('local', 'test-session-1');
		await storage.createSession(uri, 'claude-sonnet-4-20250514', '/workspace', Date.now());

		const sessions = await storage.listSessions('/workspace');
		assert.strictEqual(sessions.length, 1);
		assert.strictEqual(AgentSession.id(sessions[0].session), 'test-session-1');
	});

	test('persists and restores entries', async () => {
		const uri = AgentSession.uri('local', 'test-session-2');
		const wd = '/workspace';
		await storage.createSession(uri, 'claude-sonnet-4-20250514', wd, Date.now());

		storage.append(uri, wd, { v: V, type: 'user-message', messageId: 'msg-1', content: 'Hello world' });
		storage.append(uri, wd, {
			v: V, type: 'assistant-message', messageId: 'msg-2',
			contentParts: [{ type: 'text', text: 'Hi there!' }],
			modelIdentity: { provider: 'anthropic', modelId: 'claude-sonnet-4-20250514' },
		});
		await storage.flush('test-session-2');

		const restored = await storage.restoreSession(uri, wd);
		assert.ok(restored);
		assert.strictEqual(restored.entries.length, 2);
		assert.strictEqual(restored.entries[0].type, 'user-message');
		if (restored.entries[0].type === 'user-message') {
			assert.strictEqual(restored.entries[0].content, 'Hello world');
		}
		assert.strictEqual(restored.entries[1].type, 'assistant-message');
		if (restored.entries[1].type === 'assistant-message') {
			assert.strictEqual(restored.entries[1].contentParts[0].type, 'text');
		}
	});

	test('persists tool start and complete entries', async () => {
		const uri = AgentSession.uri('local', 'test-session-3');
		const wd = '/workspace';
		await storage.createSession(uri, 'claude-sonnet-4-20250514', wd, Date.now());

		storage.append(uri, wd, {
			v: V,
			type: 'tool-start',
			toolCallId: 'tc-1',
			toolName: 'readFile',
			displayName: 'Read File',
			invocationMessage: 'Reading test.txt',
		});
		storage.append(uri, wd, {
			v: V,
			type: 'tool-complete',
			toolCallId: 'tc-1',
			toolName: 'readFile',
			success: true,
			pastTenseMessage: 'Read test.txt',
			toolOutput: 'file contents',
		});
		await storage.flush('test-session-3');

		const restored = await storage.restoreSession(uri, wd);
		assert.ok(restored);
		assert.strictEqual(restored.entries.length, 2);
		assert.strictEqual(restored.entries[0].type, 'tool-start');
		assert.strictEqual(restored.entries[1].type, 'tool-complete');
	});

	test('JSONL file is append-only', async () => {
		const uri = AgentSession.uri('local', 'test-session-4');
		const wd = '/workspace';
		await storage.createSession(uri, 'claude-sonnet-4-20250514', wd, Date.now());
		storage.append(uri, wd, { v: V, type: 'user-message', messageId: 'msg-1', content: 'First message' });
		storage.append(uri, wd, { v: V, type: 'user-message', messageId: 'msg-2', content: 'Second message' });
		await storage.flush('test-session-4');

		// Read raw file and verify it has exactly 3 lines (created + 2 messages)
		const sessionDir = join(tmpDir, 'agentSessions');
		const dirs = await fs.promises.readdir(sessionDir);
		assert.strictEqual(dirs.length, 1);
		const files = await fs.promises.readdir(join(sessionDir, dirs[0]));
		assert.strictEqual(files.length, 1);
		assert.ok(files[0].endsWith('.jsonl'));

		const content = await fs.promises.readFile(join(sessionDir, dirs[0], files[0]), 'utf-8');
		const lines = content.split('\n').filter(l => l.trim());
		assert.strictEqual(lines.length, 3);

		// Each line is valid JSON
		for (const line of lines) {
			JSON.parse(line); // should not throw
		}
	});

	test('lists sessions across workspaces', async () => {
		const uri1 = AgentSession.uri('local', 'session-ws1');
		const uri2 = AgentSession.uri('local', 'session-ws2');
		await storage.createSession(uri1, 'claude-sonnet-4-20250514', '/workspace1', Date.now());
		await storage.createSession(uri2, 'claude-sonnet-4-20250514', '/workspace2', Date.now());

		// List all sessions (no workspace filter)
		const all = await storage.listSessions();
		assert.strictEqual(all.length, 2);

		// List per workspace
		const ws1 = await storage.listSessions('/workspace1');
		assert.strictEqual(ws1.length, 1);
		assert.strictEqual(AgentSession.id(ws1[0].session), 'session-ws1');
	});

	test('findAndRestoreSession scans all workspaces', async () => {
		const uri = AgentSession.uri('local', 'session-find');
		await storage.createSession(uri, 'claude-sonnet-4-20250514', '/some-workspace', Date.now());
		storage.append(uri, '/some-workspace', { v: V, type: 'user-message', messageId: 'msg-1', content: 'test' });
		await storage.flush('session-find');

		// Should find it without knowing the workspace
		const restored = await storage.findAndRestoreSession(uri);
		assert.ok(restored);
		assert.strictEqual(restored.sessionId, 'session-find');
		assert.strictEqual(restored.entries.length, 1);
	});

	test('extracts summary from first user message', async () => {
		const uri = AgentSession.uri('local', 'session-summary');
		await storage.createSession(uri, 'claude-sonnet-4-20250514', '/workspace', Date.now());
		storage.append(uri, '/workspace', { v: V, type: 'user-message', messageId: 'msg-1', content: 'Help me refactor this function' });
		await storage.flush('session-summary');

		const sessions = await storage.listSessions('/workspace');
		assert.strictEqual(sessions.length, 1);
		assert.strictEqual(sessions[0].summary, 'Help me refactor this function');
	});

	test('deletes a session', async () => {
		const uri = AgentSession.uri('local', 'session-delete');
		const wd = '/workspace';
		await storage.createSession(uri, 'claude-sonnet-4-20250514', wd, Date.now());

		let sessions = await storage.listSessions(wd);
		assert.strictEqual(sessions.length, 1);

		await storage.deleteSession(uri, wd);
		sessions = await storage.listSessions(wd);
		assert.strictEqual(sessions.length, 0);
	});

	test('modifiedTime reflects file modification time', async () => {
		const uri = AgentSession.uri('local', 'session-modified');
		const wd = '/workspace';
		const startTime = Date.now() - 10000;
		await storage.createSession(uri, 'claude-sonnet-4-20250514', wd, startTime);

		// Append an entry so the file mtime updates
		storage.append(uri, wd, { v: V, type: 'user-message', messageId: 'msg-1', content: 'test' });
		await storage.flush('session-modified');

		const sessions = await storage.listSessions(wd);
		assert.strictEqual(sessions.length, 1);
		assert.ok(sessions[0].modifiedTime >= startTime);
	});
});

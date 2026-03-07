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
import { SessionStorage, SessionWriter } from '../../node/sessionStorage.js';

const log = new NullLogService();

suite('SessionStorage', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let tmpDir: string;
	let storage: SessionStorage;

	/** Create a writer, write the header, and register for disposal. */
	async function createWriter(sessionId: string, wd: string): Promise<SessionWriter> {
		const writer = store.add(new SessionWriter(join(tmpDir, 'agentSessions'), sessionId, wd, log));
		await writer.writeHeader('claude-sonnet-4-20250514', wd, Date.now(), sessionId);
		return writer;
	}

	setup(async () => {
		tmpDir = await fs.promises.mkdtemp(join(os.tmpdir(), 'agent2-storage-'));
		storage = new SessionStorage(tmpDir, log);
	});

	teardown(async () => {
		await fs.promises.rm(tmpDir, { recursive: true, force: true });
	});

	test('creates and lists a session', async () => {
		await createWriter('test-session-1', '/workspace');

		const sessions = await storage.listSessions('/workspace');
		assert.strictEqual(sessions.length, 1);
		assert.strictEqual(AgentSession.id(sessions[0].session), 'test-session-1');
	});

	test('persists and restores entries', async () => {
		const wd = '/workspace';
		const writer = await createWriter('test-session-2', wd);

		writer.append({ type: 'user-message', id: 'msg-1', content: 'Hello world' });
		writer.append({
			type: 'assistant-message', id: 'msg-2',
			parts: [{ type: 'text', text: 'Hi there!' }],
			modelIdentity: { provider: 'anthropic', modelId: 'claude-sonnet-4-20250514' },
		});
		await writer.flush();

		const uri = AgentSession.uri('local', 'test-session-2');
		const restored = await storage.restoreSession(uri, wd);
		assert.ok(restored);
		assert.strictEqual(restored.entries.length, 2);
		assert.strictEqual(restored.entries[0].type, 'user-message');
		if (restored.entries[0].type === 'user-message') {
			assert.strictEqual(restored.entries[0].content, 'Hello world');
		}
		assert.strictEqual(restored.entries[1].type, 'assistant-message');
		if (restored.entries[1].type === 'assistant-message') {
			assert.strictEqual(restored.entries[1].parts[0].type, 'text');
		}
	});

	test('persists tool start and complete entries', async () => {
		const wd = '/workspace';
		const writer = await createWriter('test-session-3', wd);

		writer.append({
			type: 'tool-start', toolCallId: 'tc-1', toolName: 'readFile',
			displayName: 'Read File', invocationMessage: 'Reading test.txt',
		});
		writer.append({
			type: 'tool-complete', toolCallId: 'tc-1', toolName: 'readFile',
			success: true, pastTenseMessage: 'Read test.txt', toolOutput: 'file contents',
		});
		await writer.flush();

		const uri = AgentSession.uri('local', 'test-session-3');
		const restored = await storage.restoreSession(uri, wd);
		assert.ok(restored);
		assert.strictEqual(restored.entries.length, 2);
		assert.strictEqual(restored.entries[0].type, 'tool-start');
		assert.strictEqual(restored.entries[1].type, 'tool-complete');
	});

	test('JSONL file is append-only', async () => {
		const wd = '/workspace';
		const writer = await createWriter('test-session-4', wd);
		writer.append({ type: 'user-message', id: 'msg-1', content: 'First message' });
		writer.append({ type: 'user-message', id: 'msg-2', content: 'Second message' });
		await writer.flush();

		const sessionDir = join(tmpDir, 'agentSessions');
		const dirs = await fs.promises.readdir(sessionDir);
		assert.strictEqual(dirs.length, 1);
		const files = await fs.promises.readdir(join(sessionDir, dirs[0]));
		assert.strictEqual(files.length, 1);
		assert.ok(files[0].endsWith('.jsonl'));

		const content = await fs.promises.readFile(join(sessionDir, dirs[0], files[0]), 'utf-8');
		const lines = content.split('\n').filter(l => l.trim());
		assert.strictEqual(lines.length, 3);

		for (const line of lines) {
			const record = JSON.parse(line);
			assert.strictEqual(typeof record.v, 'number', 'every persisted line must have a version');
		}
	});

	test('lists sessions across workspaces', async () => {
		await createWriter('session-ws1', '/workspace1');
		await createWriter('session-ws2', '/workspace2');

		const all = await storage.listSessions();
		assert.strictEqual(all.length, 2);

		const ws1 = await storage.listSessions('/workspace1');
		assert.strictEqual(ws1.length, 1);
		assert.strictEqual(AgentSession.id(ws1[0].session), 'session-ws1');
	});

	test('findAndRestoreSession scans all workspaces', async () => {
		const writer = await createWriter('session-find', '/some-workspace');
		writer.append({ type: 'user-message', id: 'msg-1', content: 'test' });
		await writer.flush();

		const uri = AgentSession.uri('local', 'session-find');
		const restored = await storage.findAndRestoreSession(uri);
		assert.ok(restored);
		assert.strictEqual(restored.sessionId, 'session-find');
		assert.strictEqual(restored.entries.length, 1);
	});

	test('extracts summary from first user message', async () => {
		const writer = await createWriter('session-summary', '/workspace');
		writer.append({ type: 'user-message', id: 'msg-1', content: 'Help me refactor this function' });
		await writer.flush();

		const sessions = await storage.listSessions('/workspace');
		assert.strictEqual(sessions.length, 1);
		assert.strictEqual(sessions[0].summary, 'Help me refactor this function');
	});

	test('deletes a session', async () => {
		const wd = '/workspace';
		await createWriter('session-delete', wd);

		let sessions = await storage.listSessions(wd);
		assert.strictEqual(sessions.length, 1);

		const uri = AgentSession.uri('local', 'session-delete');
		await storage.deleteSession(uri, wd);
		sessions = await storage.listSessions(wd);
		assert.strictEqual(sessions.length, 0);
	});

	test('modifiedTime reflects file modification time', async () => {
		const wd = '/workspace';
		const startTime = Date.now() - 10000;
		const writer = await createWriter('session-modified', wd);
		writer.append({ type: 'user-message', id: 'msg-1', content: 'test' });
		await writer.flush();

		const sessions = await storage.listSessions(wd);
		assert.strictEqual(sessions.length, 1);
		assert.ok(sessions[0].modifiedTime >= startTime);
	});

	test('normalizes legacy v1 field names on restore', async () => {
		// Write a raw JSONL file using the old v1 field names (messageId, contentParts)
		const wd = '/legacy-workspace';
		const writer = await createWriter('session-legacy', wd);
		// Bypass typed append() to write raw legacy-shaped JSON
		const legacyUser = JSON.stringify({ v: 1, type: 'user-message', messageId: 'old-1', content: 'Hi' });
		const legacyAssistant = JSON.stringify({
			v: 1, type: 'assistant-message', messageId: 'old-2',
			contentParts: [{ type: 'text', text: 'Hello!' }],
			modelIdentity: { provider: 'anthropic', modelId: 'test-model' },
		});
		// Write legacy lines directly to the JSONL file
		const crypto = await import('crypto');
		const key = crypto.createHash('sha256').update(wd).digest('hex').substring(0, 16);
		const filePath = join(tmpDir, 'agentSessions', key, 'session-legacy.jsonl');
		await fs.promises.appendFile(filePath, legacyUser + '\n' + legacyAssistant + '\n', 'utf-8');
		await writer.flush();

		const uri = AgentSession.uri('local', 'session-legacy');
		const restored = await storage.restoreSession(uri, wd);
		assert.ok(restored);
		assert.strictEqual(restored.entries.length, 2);
		// Verify legacy messageId was normalized to id
		if (restored.entries[0].type === 'user-message') {
			assert.strictEqual(restored.entries[0].id, 'old-1');
		}
		// Verify legacy contentParts was normalized to parts
		if (restored.entries[1].type === 'assistant-message') {
			assert.strictEqual(restored.entries[1].id, 'old-2');
			assert.strictEqual(restored.entries[1].parts[0].type, 'text');
		}
	});
});

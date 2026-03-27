/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { mkdirSync, rmSync } from 'fs';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentSession } from '../../common/agentService.js';
import { ToolResultContentType } from '../../common/state/sessionState.js';
import { SessionDatabase } from '../../node/sessionDatabase.js';
import { parseSessionDbUri } from '../../node/copilot/fileEditTracker.js';
import { mapSessionEvents, type ISessionEvent } from '../../node/copilot/mapSessionEvents.js';
import { join } from '../../../../base/common/path.js';

suite('mapSessionEvents', () => {

	const disposables = new DisposableStore();
	let testDir: string;
	let db: SessionDatabase | undefined;
	const session = AgentSession.uri('copilot', 'test-session');

	setup(() => {
		testDir = join(tmpdir(), `vscode-map-events-test-${randomUUID()}`);
		mkdirSync(testDir, { recursive: true });
	});

	teardown(async () => {
		disposables.clear();
		await db?.close();
		rmSync(testDir, { recursive: true, force: true });
	});
	ensureNoDisposablesAreLeakedInTestSuite();

	function dbPath(): string {
		return join(testDir, 'session.db');
	}

	// ---- Basic event mapping --------------------------------------------

	test('maps user and assistant messages', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', data: { messageId: 'msg-1', content: 'hello' } },
			{ type: 'assistant.message', data: { messageId: 'msg-2', content: 'world' } },
		];

		const result = await mapSessionEvents(session, undefined, events);
		assert.strictEqual(result.length, 2);
		assert.deepStrictEqual(result[0], {
			session,
			type: 'message',
			role: 'user',
			messageId: 'msg-1',
			content: 'hello',
			toolRequests: undefined,
			reasoningOpaque: undefined,
			reasoningText: undefined,
			encryptedContent: undefined,
			parentToolCallId: undefined,
		});
		assert.strictEqual(result[1].type, 'message');
		assert.strictEqual((result[1] as { role: string }).role, 'assistant');
	});

	test('maps tool start and complete events', async () => {
		const events: ISessionEvent[] = [
			{
				type: 'tool.execution_start',
				data: { toolCallId: 'tc-1', toolName: 'shell', arguments: { command: 'echo hi' } },
			},
			{
				type: 'tool.execution_complete',
				data: { toolCallId: 'tc-1', success: true, result: { content: 'hi\n' } },
			},
		];

		const result = await mapSessionEvents(session, undefined, events);
		assert.strictEqual(result.length, 2);
		assert.strictEqual(result[0].type, 'tool_start');
		assert.strictEqual(result[1].type, 'tool_complete');

		const complete = result[1] as { result: { content?: readonly { type: string; text?: string }[] } };
		assert.ok(complete.result.content);
		assert.strictEqual(complete.result.content[0].type, ToolResultContentType.Text);
	});

	test('skips tool_complete without matching tool_start', async () => {
		const events: ISessionEvent[] = [
			{ type: 'tool.execution_complete', data: { toolCallId: 'orphan', success: true } },
		];

		const result = await mapSessionEvents(session, undefined, events);
		assert.strictEqual(result.length, 0);
	});

	test('ignores unknown event types', async () => {
		const events: ISessionEvent[] = [
			{ type: 'some.unknown.event', data: {} },
			{ type: 'user.message', data: { messageId: 'msg-1', content: 'test' } },
		];

		const result = await mapSessionEvents(session, undefined, events);
		assert.strictEqual(result.length, 1);
	});

	// ---- File edit restoration ------------------------------------------

	suite('file edit restoration', () => {

		test('restores file edits from database for edit tools', async () => {
			db = disposables.add(await SessionDatabase.open(dbPath()));
			await db.createTurn('turn-1');
			await db.storeFileEdit({
				turnId: 'turn-1',
				toolCallId: 'tc-edit',
				filePath: '/workspace/file.ts',
				beforeContent: new TextEncoder().encode('before'),
				afterContent: new TextEncoder().encode('after'),
				addedLines: 3,
				removedLines: 1,
			});

			const events: ISessionEvent[] = [
				{
					type: 'tool.execution_start',
					data: { toolCallId: 'tc-edit', toolName: 'edit', arguments: { filePath: '/workspace/file.ts' } },
				},
				{
					type: 'tool.execution_complete',
					data: { toolCallId: 'tc-edit', success: true, result: { content: 'Edited file.ts' } },
				},
			];

			const result = await mapSessionEvents(session, db, events);
			const complete = result[1];
			assert.strictEqual(complete.type, 'tool_complete');

			const content = (complete as { result: { content?: readonly Record<string, unknown>[] } }).result.content;
			assert.ok(content);
			// Should have text content + file edit
			assert.strictEqual(content.length, 2);
			assert.strictEqual(content[0].type, ToolResultContentType.Text);
			assert.strictEqual(content[1].type, ToolResultContentType.FileEdit);

			// File edit URIs should be parseable
			const fileEdit = content[1] as { beforeURI: string; afterURI: string; diff?: { added?: number; removed?: number } };
			const beforeFields = parseSessionDbUri(fileEdit.beforeURI);
			assert.ok(beforeFields);
			assert.strictEqual(beforeFields.toolCallId, 'tc-edit');
			assert.strictEqual(beforeFields.filePath, '/workspace/file.ts');
			assert.strictEqual(beforeFields.part, 'before');
			assert.deepStrictEqual(fileEdit.diff, { added: 3, removed: 1 });
		});

		test('handles multiple file edits for one tool call', async () => {
			db = disposables.add(await SessionDatabase.open(dbPath()));
			await db.createTurn('turn-1');
			await db.storeFileEdit({
				turnId: 'turn-1',
				toolCallId: 'tc-multi',
				filePath: '/workspace/a.ts',
				beforeContent: new Uint8Array(0),
				afterContent: new TextEncoder().encode('a'),
				addedLines: undefined,
				removedLines: undefined,
			});
			await db.storeFileEdit({
				turnId: 'turn-1',
				toolCallId: 'tc-multi',
				filePath: '/workspace/b.ts',
				beforeContent: new Uint8Array(0),
				afterContent: new TextEncoder().encode('b'),
				addedLines: undefined,
				removedLines: undefined,
			});

			const events: ISessionEvent[] = [
				{
					type: 'tool.execution_start',
					data: { toolCallId: 'tc-multi', toolName: 'write' },
				},
				{
					type: 'tool.execution_complete',
					data: { toolCallId: 'tc-multi', success: true },
				},
			];

			const result = await mapSessionEvents(session, db, events);
			const content = (result[1] as { result: { content?: readonly Record<string, unknown>[] } }).result.content;
			assert.ok(content);
			// Two file edits (no text since result had no content)
			const fileEdits = content.filter(c => c.type === ToolResultContentType.FileEdit);
			assert.strictEqual(fileEdits.length, 2);
		});

		test('works without database (no file edits restored)', async () => {
			const events: ISessionEvent[] = [
				{
					type: 'tool.execution_start',
					data: { toolCallId: 'tc-1', toolName: 'edit', arguments: { filePath: '/workspace/file.ts' } },
				},
				{
					type: 'tool.execution_complete',
					data: { toolCallId: 'tc-1', success: true, result: { content: 'done' } },
				},
			];

			const result = await mapSessionEvents(session, undefined, events);
			const content = (result[1] as { result: { content?: readonly Record<string, unknown>[] } }).result.content;
			assert.ok(content);
			// Only text content, no file edits
			assert.strictEqual(content.length, 1);
			assert.strictEqual(content[0].type, ToolResultContentType.Text);
		});

		test('non-edit tools do not get file edits even if db has data', async () => {
			db = disposables.add(await SessionDatabase.open(dbPath()));

			const events: ISessionEvent[] = [
				{
					type: 'tool.execution_start',
					data: { toolCallId: 'tc-1', toolName: 'shell', arguments: { command: 'ls' } },
				},
				{
					type: 'tool.execution_complete',
					data: { toolCallId: 'tc-1', success: true, result: { content: 'files' } },
				},
			];

			const result = await mapSessionEvents(session, db, events);
			const content = (result[1] as { result: { content?: readonly Record<string, unknown>[] } }).result.content;
			assert.ok(content);
			assert.strictEqual(content.length, 1);
			assert.strictEqual(content[0].type, ToolResultContentType.Text);
		});
	});
});

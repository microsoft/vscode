/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentSession } from '../../common/agentService.js';
import { FileEditKind, ToolResultContentType } from '../../common/state/sessionState.js';
import { SessionDatabase } from '../../node/sessionDatabase.js';
import { parseSessionDbUri } from '../../node/copilot/fileEditTracker.js';
import { mapSessionEvents, type ISessionEvent } from '../../node/copilot/mapSessionEvents.js';

suite('mapSessionEvents', () => {

	const disposables = new DisposableStore();
	let db: SessionDatabase | undefined;
	const session = AgentSession.uri('copilot', 'test-session');

	teardown(async () => {
		disposables.clear();
		await db?.close();
	});
	ensureNoDisposablesAreLeakedInTestSuite();

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
			db = disposables.add(await SessionDatabase.open(':memory:'));
			await db.createTurn('turn-1');
			await db.storeFileEdit({
				turnId: 'turn-1',
				toolCallId: 'tc-edit',
				filePath: '/workspace/file.ts',
				kind: FileEditKind.Edit,
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
			const fileEdit = content[1] as { before: { uri: any; content: { uri: any } }; after: { uri: any; content: { uri: any } }; diff?: { added?: number; removed?: number } };
			const beforeFields = parseSessionDbUri(fileEdit.before.content.uri);
			assert.ok(beforeFields);
			assert.strictEqual(beforeFields.toolCallId, 'tc-edit');
			assert.strictEqual(beforeFields.filePath, '/workspace/file.ts');
			assert.strictEqual(beforeFields.part, 'before');
			assert.deepStrictEqual(fileEdit.diff, { added: 3, removed: 1 });
		});

		test('handles multiple file edits for one tool call', async () => {
			db = disposables.add(await SessionDatabase.open(':memory:'));
			await db.createTurn('turn-1');
			await db.storeFileEdit({
				turnId: 'turn-1',
				toolCallId: 'tc-multi',
				filePath: '/workspace/a.ts',
				kind: FileEditKind.Edit,
				beforeContent: new Uint8Array(0),
				afterContent: new TextEncoder().encode('a'),
				addedLines: undefined,
				removedLines: undefined,
			});
			await db.storeFileEdit({
				turnId: 'turn-1',
				toolCallId: 'tc-multi',
				filePath: '/workspace/b.ts',
				kind: FileEditKind.Edit,
				beforeContent: new Uint8Array(0),
				afterContent: new TextEncoder().encode('b'),
				addedLines: undefined,
				removedLines: undefined,
			});

			const events: ISessionEvent[] = [
				{
					type: 'tool.execution_start',
					data: { toolCallId: 'tc-multi', toolName: 'edit' },
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
			db = disposables.add(await SessionDatabase.open(':memory:'));

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

	// ---- Subagent events ------------------------------------------------

	suite('subagent events', () => {

		test('maps subagent.started event to subagent_started progress event', async () => {
			const events: ISessionEvent[] = [
				{
					type: 'subagent.started',
					data: {
						toolCallId: 'tc-1',
						agentName: 'code-reviewer',
						agentDisplayName: 'Code Reviewer',
						agentDescription: 'Reviews code',
					},
				},
			];

			const result = await mapSessionEvents(session, undefined, events);
			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].type, 'subagent_started');
			const event = result[0] as { type: string; toolCallId: string; agentName: string; agentDisplayName: string };
			assert.strictEqual(event.toolCallId, 'tc-1');
			assert.strictEqual(event.agentName, 'code-reviewer');
			assert.strictEqual(event.agentDisplayName, 'Code Reviewer');
		});
	});

	// ---- cd-prefix rewriting --------------------------------------------

	suite('cd-prefix rewriting', () => {

		const cwd = URI.file('/workspace/proj');

		function makeBashEvent(command: string, toolCallId = 'tc-1'): ISessionEvent {
			return {
				type: 'tool.execution_start',
				data: { toolCallId, toolName: 'bash', arguments: { command } },
			};
		}

		function getStart(events: ReturnType<typeof mapSessionEvents> extends Promise<infer R> ? R : never) {
			return events[0] as { toolInput: string; toolArguments?: string };
		}

		test('strips redundant bash cd prefix matching workingDirectory', async () => {
			const result = await mapSessionEvents(session, undefined, [
				makeBashEvent('cd /workspace/proj && ls -la'),
			], cwd);
			const start = getStart(result);
			assert.strictEqual(start.toolInput, 'ls -la');
			assert.deepStrictEqual(JSON.parse(start.toolArguments!), { command: 'ls -la' });
		});

		test('leaves command unchanged when cd dir does not match', async () => {
			const result = await mapSessionEvents(session, undefined, [
				makeBashEvent('cd /other && ls'),
			], cwd);
			const start = getStart(result);
			assert.strictEqual(start.toolInput, 'cd /other && ls');
		});

		test('leaves command unchanged when no workingDirectory provided', async () => {
			const result = await mapSessionEvents(session, undefined, [
				makeBashEvent('cd /workspace/proj && ls'),
			]);
			const start = getStart(result);
			assert.strictEqual(start.toolInput, 'cd /workspace/proj && ls');
		});

		test('non-shell tools are not rewritten even with matching command field', async () => {
			const result = await mapSessionEvents(session, undefined, [
				{
					type: 'tool.execution_start',
					data: { toolCallId: 'tc-1', toolName: 'edit', arguments: { command: 'cd /workspace/proj && ls' } },
				},
			], cwd);
			const start = getStart(result);
			// edit tool's toolInput is derived from filePath, not command — but toolArguments preserves original
			assert.deepStrictEqual(JSON.parse(start.toolArguments!), { command: 'cd /workspace/proj && ls' });
		});

		test('handles trailing slash on workingDirectory', async () => {
			const result = await mapSessionEvents(session, undefined, [
				makeBashEvent('cd /workspace/proj && ls'),
			], URI.file('/workspace/proj/'));
			const start = getStart(result);
			assert.strictEqual(start.toolInput, 'ls');
		});

		test('handles quoted directory in cd prefix', async () => {
			const cwdWithSpaces = URI.file('/workspace/my proj');
			const result = await mapSessionEvents(session, undefined, [
				makeBashEvent('cd "/workspace/my proj" && ls'),
			], cwdWithSpaces);
			const start = getStart(result);
			assert.strictEqual(start.toolInput, 'ls');
		});

		test('rewrites powershell commands too', async () => {
			const result = await mapSessionEvents(session, undefined, [
				{
					type: 'tool.execution_start',
					data: { toolCallId: 'tc-1', toolName: 'powershell', arguments: { command: 'cd /workspace/proj; dir' } },
				},
			], cwd);
			const start = getStart(result);
			assert.strictEqual(start.toolInput, 'dir');
		});
	});
});

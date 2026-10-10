/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ActionType, type ChatToolCallCompleteAction, type ChatToolCallStartAction } from '../../../../common/state/sessionActions.js';
import { buildDefaultChatUri } from '../../../../common/state/sessionState.js';
import { getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import { assertToolCallCompleteText, createRealSession, driveTurnToCompletion, textFromContent } from '../harness/agentHostE2ETestHarness.js';
import type { IAgentHostE2ETestContext } from './e2eTestContext.js';

export function defineCopilotRuntimeDataCoverageTests(context: IAgentHostE2ETestContext): void {
	if (context.tier !== 'parity' || context.config.provider !== 'copilotcli') {
		return;
	}

	async function createSession(): Promise<{ sessionUri: string; workspace: string }> {
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-runtime-data-'));
		context.tempDirs.push(workspace);
		const sessionUri = await createRealSession(context.client, context.config, 'runtime-data-client', context.createdSessions, URI.file(workspace));
		return { sessionUri, workspace };
	}

	function toolResults(sessionUri: string, turnId: string, toolName: string): ChatToolCallCompleteAction[] {
		const channel = buildDefaultChatUri(sessionUri);
		const calls = new Set(context.client.receivedNotifications(notification =>
			isActionNotification(notification, ActionType.ChatToolCallStart) && getActionEnvelope(notification).channel === channel)
			.map(notification => getActionEnvelope(notification).action as ChatToolCallStartAction)
			.filter(action => action.turnId === turnId && action.toolName === toolName)
			.map(action => action.toolCallId));
		return context.client.receivedNotifications(notification =>
			isActionNotification(notification, ActionType.ChatToolCallComplete) && getActionEnvelope(notification).channel === channel)
			.map(notification => getActionEnvelope(notification).action as ChatToolCallCompleteAction)
			.filter(action => action.turnId === turnId && calls.has(action.toolCallId));
	}

	async function query(sessionUri: string, turnId: string, sql: string, expected: readonly RegExp[], clientSeq = 1): Promise<void> {
		await driveTurnToCompletion(context.client, sessionUri, turnId,
			`Call sql exactly once with database "session", description "Check runtime data", and this exact query. Do not use other tools. Then reply exactly DATA_CHECKED.\n${sql}`, clientSeq);
		assertToolCallCompleteText(context.client, {
			channel: buildDefaultChatUri(sessionUri), turnId, toolNames: ['sql'], expected,
		});
		assert.strictEqual(toolResults(sessionUri, turnId, 'sql').length, 1);
	}

	test('runtime coverage data: SQL schema mutations and values persist into the next turn', async function () {
		this.timeout(180_000);
		const { sessionUri } = await createSession();
		await query(sessionUri, 'data-create',
			`CREATE TABLE inventory (id INTEGER PRIMARY KEY, label TEXT); INSERT INTO inventory VALUES (7, 'STORED_LABEL'); UPDATE inventory SET label = 'UPDATED_LABEL' WHERE id = 7; SELECT id, label FROM inventory;`,
			[/UPDATED_LABEL/, /1 row\(s\) inserted/, /1 row\(s\) updated/]);
		await query(sessionUri, 'data-read', 'SELECT id, label FROM inventory;', [/7/, /UPDATED_LABEL/], 100);
	});

	test('runtime coverage data: SQL savepoint rollback preserves earlier committed rows', async function () {
		this.timeout(180_000);
		const { sessionUri } = await createSession();
		await query(sessionUri, 'data-savepoint',
			`CREATE TABLE stages (name TEXT); INSERT INTO stages VALUES ('PRESERVED_STAGE'); SAVEPOINT pending; INSERT INTO stages VALUES ('ROLLED_BACK_STAGE'); ROLLBACK TO pending; RELEASE pending; SELECT name FROM stages;`,
			[/PRESERVED_STAGE/]);
		await query(sessionUri, 'data-savepoint-read', 'SELECT name FROM stages;', [/PRESERVED_STAGE/], 100);
		const results = toolResults(sessionUri, 'data-savepoint-read', 'sql');
		assert.ok(!textFromContent(results[0].result.content ?? []).includes('ROLLED_BACK_STAGE'));
	});

	test('runtime coverage data: SQL semicolons in quoted values and comments are not statement separators', async function () {
		this.timeout(180_000);
		const { sessionUri } = await createSession();
		await query(sessionUri, 'data-quoted-sql',
			`CREATE TABLE quoted_values (value TEXT); /* a; comment */ INSERT INTO quoted_values VALUES ('FIRST;SECOND'), ('it''s;quoted'); SELECT value FROM quoted_values ORDER BY value;`,
			[/FIRST;SECOND/, /it's;quoted/, /2 row\(s\) returned/]);
	});

	// Multi-statement trigger creation reports an incomplete-input SQL error.
	(context.runKnownIssueTests ? test : test.skip)('runtime coverage data: SQL triggers execute all statements in their bodies', async function () {
		this.timeout(180_000);
		const { sessionUri } = await createSession();
		await query(sessionUri, 'data-trigger',
			`CREATE TABLE source (value TEXT); CREATE TABLE audit (value TEXT); CREATE TRIGGER audit_insert AFTER INSERT ON source BEGIN INSERT INTO audit VALUES ('TRIGGER_FIRST'); INSERT INTO audit VALUES ('TRIGGER_SECOND'); END; INSERT INTO source VALUES ('source'); SELECT value FROM audit ORDER BY value;`,
			[/TRIGGER_FIRST/, /TRIGGER_SECOND/]);
	});

	test('runtime coverage data: SQL formatting preserves NULL real and blob values', async function () {
		this.timeout(180_000);
		const { sessionUri } = await createSession();
		await query(sessionUri, 'data-value-types',
			`SELECT NULL AS missing, 12.5 AS fraction, X'414243' AS bytes, 'VALUE_TYPES' AS marker;`,
			[/NULL/, /12\.5/, /VALUE_TYPES/, /65/]);
	});

	test('runtime coverage data: SQL common table expressions resolve task dependencies', async function () {
		this.timeout(180_000);
		const { sessionUri } = await createSession();
		await query(sessionUri, 'data-task-dependencies',
			`INSERT INTO todos (id, title, status) VALUES ('first', 'FIRST_TASK', 'done'), ('second', 'READY_TASK', 'pending'); INSERT INTO todo_deps (todo_id, depends_on) VALUES ('second', 'first'); WITH ready AS (SELECT t.title FROM todos t WHERE t.status = 'pending' AND NOT EXISTS (SELECT 1 FROM todo_deps d JOIN todos dependency ON d.depends_on = dependency.id WHERE d.todo_id = t.id AND dependency.status != 'done')) SELECT title FROM ready;`,
			[/READY_TASK/]);
	});

	test('runtime coverage data: SQL schema alterations and deletion report affected rows', async function () {
		this.timeout(180_000);
		const { sessionUri } = await createSession();
		await query(sessionUri, 'data-schema-alter',
			`CREATE TABLE disposable (value TEXT); ALTER TABLE disposable ADD COLUMN rank INTEGER DEFAULT 4; INSERT INTO disposable (value) VALUES ('DELETE_ME'); DELETE FROM disposable; SELECT COUNT(*) AS remaining FROM disposable; DROP TABLE disposable;`,
			[/1 row\(s\) deleted/, /remaining/, /Schema operation completed/]);
	});

	test('runtime coverage data: SQL query errors do not corrupt the next query', async function () {
		this.timeout(180_000);
		const { sessionUri } = await createSession();
		await driveTurnToCompletion(context.client, sessionUri, 'data-query-error',
			'Call sql exactly once with query "SELECT * FROM missing_table" and description "Check missing table". Do not retry. Reply exactly QUERY_FAILED.', 1);
		const failures = toolResults(sessionUri, 'data-query-error', 'sql');
		assert.deepStrictEqual(failures.map(action => ({
			success: action.result.success,
			missingTable: textFromContent(action.result.content ?? []).includes('missing_table'),
		})), [{ success: false, missingTable: true }]);
		await query(sessionUri, 'data-error-recovery', `SELECT 'QUERY_RECOVERED' AS marker;`, [/QUERY_RECOVERED/], 100);
	});

	// Directory results currently include dotfiles and omit the advertised second level.
	(context.runKnownIssueTests ? test : test.skip)('runtime coverage data: view directory listings exclude hidden entries and deeper descendants', async function () {
		this.timeout(180_000);
		const { sessionUri, workspace } = await createSession();
		mkdirSync(join(workspace, 'visible', 'nested'), { recursive: true });
		mkdirSync(join(workspace, '.hidden'));
		writeFileSync(join(workspace, 'visible', 'child.txt'), 'CHILD');
		writeFileSync(join(workspace, 'visible', 'nested', 'deep.txt'), 'DEEP');
		writeFileSync(join(workspace, '.hidden', 'secret.txt'), 'HIDDEN');
		await driveTurnToCompletion(context.client, sessionUri, 'data-directory',
			`Call view exactly once on this exact directory path: "${workspace}". Do not read files or use other tools. Reply exactly DIRECTORY_CHECKED.`, 1);
		const results = toolResults(sessionUri, 'data-directory', 'view');
		assert.strictEqual(results.length, 1);
		const output = textFromContent(results[0].result.content ?? []);
		assert.deepStrictEqual({
			success: results[0].result.success,
			child: output.includes('child.txt'),
			hidden: output.includes('.hidden'),
			deep: output.includes('deep.txt'),
		}, { success: true, child: true, hidden: false, deep: false });
	});

	test('runtime coverage data: view ranges recover the end of a large streamed file', async function () {
		this.timeout(180_000);
		const { sessionUri, workspace } = await createSession();
		writeFileSync(join(workspace, 'large.txt'), `${'prefix line\n'.repeat(6000)}LARGE_END_ONE\nLARGE_END_TWO\n`);
		await driveTurnToCompletion(context.client, sessionUri, 'data-large-range',
			`Call view exactly once on "${join(workspace, 'large.txt')}" using view_range [6001, -1]. Do not use another tool. Reply exactly RANGE_CHECKED.`, 1);
		assertToolCallCompleteText(context.client, {
			channel: buildDefaultChatUri(sessionUri), turnId: 'data-large-range', toolNames: ['view'],
			expected: [/LARGE_END_ONE/, /LARGE_END_TWO/],
		});
		assert.ok(!textFromContent(toolResults(sessionUri, 'data-large-range', 'view')[0].result.content ?? []).includes('prefix line'));
	});

	test('runtime coverage data: view forceReadLargeFiles includes the otherwise truncated tail', async function () {
		this.timeout(180_000);
		const { sessionUri, workspace } = await createSession();
		writeFileSync(join(workspace, 'force.txt'), `FORCE_BEGIN\n${'body line\n'.repeat(3000)}FORCE_END\n`);
		await driveTurnToCompletion(context.client, sessionUri, 'data-force-read',
			`Call view exactly once on "${join(workspace, 'force.txt')}" with forceReadLargeFiles true. Do not use another tool. Reply exactly FORCE_CHECKED.`, 1);
		assertToolCallCompleteText(context.client, {
			channel: buildDefaultChatUri(sessionUri), turnId: 'data-force-read', toolNames: ['view'],
			expected: [/FORCE_BEGIN/, /FORCE_END/],
		});
	});

	test('runtime coverage data: view UTF-8 ranges preserve text across the streaming buffer boundary', async function () {
		this.timeout(180_000);
		const { sessionUri, workspace } = await createSession();
		writeFileSync(join(workspace, 'utf8.txt'), `${'a'.repeat(65_535)}\u00e9\nUTF8_TAIL\n`);
		await driveTurnToCompletion(context.client, sessionUri, 'data-utf8-range',
			`Call view exactly once on "${join(workspace, 'utf8.txt')}" using view_range [1, 1] and forceReadLargeFiles true. Do not use another tool. Reply exactly UTF8_CHECKED.`, 1);
		assertToolCallCompleteText(context.client, {
			channel: buildDefaultChatUri(sessionUri), turnId: 'data-utf8-range', toolNames: ['view'],
			expected: [/\u00e9/],
		});
		const output = textFromContent(toolResults(sessionUri, 'data-utf8-range', 'view')[0].result.content ?? []);
		assert.deepStrictEqual({
			completeLine: output.includes(`${'a'.repeat(65_535)}\u00e9`),
			replacement: output.includes('\ufffd'),
			nextLine: output.includes('UTF8_TAIL'),
		}, { completeLine: true, replacement: false, nextLine: false });
	});

	test('runtime coverage data: a missing view file returns an error without blocking a later read', async function () {
		this.timeout(180_000);
		const { sessionUri, workspace } = await createSession();
		writeFileSync(join(workspace, 'recovery.txt'), 'FILE_RECOVERED');
		await driveTurnToCompletion(context.client, sessionUri, 'data-missing-file',
			`Call view exactly once on "${join(workspace, 'nonexistent.txt')}". Do not retry. Reply exactly FILE_MISSING.`, 1);
		assert.deepStrictEqual(toolResults(sessionUri, 'data-missing-file', 'view').map(action => action.result.success), [false]);
		await driveTurnToCompletion(context.client, sessionUri, 'data-file-recovery',
			`Call view exactly once on "${join(workspace, 'recovery.txt')}". Do not use another tool. Reply exactly FILE_CHECKED.`, 100);
		assertToolCallCompleteText(context.client, {
			channel: buildDefaultChatUri(sessionUri), turnId: 'data-file-recovery', toolNames: ['view'],
			expected: [/FILE_RECOVERED/],
		});
	});

	test('runtime coverage data: glob selects nested workspace files without unrelated extensions', async function () {
		this.timeout(180_000);
		const { sessionUri, workspace } = await createSession();
		mkdirSync(join(workspace, 'src', 'nested'), { recursive: true });
		writeFileSync(join(workspace, 'src', 'one.ts'), 'export const one = 1;');
		writeFileSync(join(workspace, 'src', 'nested', 'two.ts'), 'export const two = 2;');
		writeFileSync(join(workspace, 'src', 'skip.js'), 'const skip = 3;');
		await driveTurnToCompletion(context.client, sessionUri, 'data-glob',
			'Call glob exactly once with pattern "src/**/*.ts" in the workspace. Do not use another tool. Reply exactly GLOB_CHECKED.', 1);
		assertToolCallCompleteText(context.client, {
			channel: buildDefaultChatUri(sessionUri), turnId: 'data-glob', toolNames: ['glob'],
			expected: [/one\.ts/, /two\.ts/],
		});
		assert.ok(!textFromContent(toolResults(sessionUri, 'data-glob', 'glob')[0].result.content ?? []).includes('skip.js'));
	});

	test('runtime coverage data: grep counts matching lines per file with a type filter', async function () {
		this.timeout(180_000);
		const { sessionUri, workspace } = await createSession();
		writeFileSync(join(workspace, 'one.ts'), 'COUNT_NEEDLE\nCOUNT_NEEDLE\n');
		writeFileSync(join(workspace, 'two.ts'), 'COUNT_NEEDLE\n');
		writeFileSync(join(workspace, 'skip.txt'), 'COUNT_NEEDLE\n');
		await driveTurnToCompletion(context.client, sessionUri, 'data-grep-count',
			'Call grep exactly once with pattern COUNT_NEEDLE, output_mode "count", and glob "*.ts". Do not use other tools. Reply exactly COUNT_CHECKED.', 1);
		assertToolCallCompleteText(context.client, {
			channel: buildDefaultChatUri(sessionUri), turnId: 'data-grep-count', toolNames: ['grep'],
			expected: [/one\.ts.*2/, /two\.ts.*1/],
		});
		assert.ok(!textFromContent(toolResults(sessionUri, 'data-grep-count', 'grep')[0].result.content ?? []).includes('skip.txt'));
	});

	test('runtime coverage data: grep multiline content includes contextual lines', async function () {
		this.timeout(180_000);
		const { sessionUri, workspace } = await createSession();
		writeFileSync(join(workspace, 'multiline.txt'), 'CONTEXT_BEFORE\nMULTILINE_FIRST\nMULTILINE_SECOND\nCONTEXT_AFTER\n');
		await driveTurnToCompletion(context.client, sessionUri, 'data-grep-multiline',
			'Call grep exactly once with pattern "MULTILINE_FIRST\\nMULTILINE_SECOND", multiline true, output_mode "content", and -C 1. Do not use other tools. Reply exactly MULTILINE_CHECKED.', 1);
		assertToolCallCompleteText(context.client, {
			channel: buildDefaultChatUri(sessionUri), turnId: 'data-grep-multiline', toolNames: ['grep'],
			expected: [/CONTEXT_BEFORE/, /MULTILINE_FIRST/, /MULTILINE_SECOND/, /CONTEXT_AFTER/],
		});
	});
}

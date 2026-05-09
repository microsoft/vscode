/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import {
	extractPermissionPath,
	getClaudeConfirmationTitle,
	getClaudePermissionKind,
	getClaudeToolDisplayName,
	INTERACTIVE_CLAUDE_TOOLS,
} from '../../node/claude/claudeToolDisplay.js';

/**
 * Pure-data snapshot tests for [claudeToolDisplay.ts](../../node/claude/claudeToolDisplay.ts).
 * Phase 7 plan §4: every cell of the mapping table must be reachable
 * from one assertion. The snapshot lives here, not in a fixture file,
 * so future renames flow through compile-checks.
 */
suite('claudeToolDisplay — §4 mapping table', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('mapping snapshot covers every Phase 7 §4 row', () => {
		const TOOLS = [
			'Bash', 'BashOutput', 'KillBash',
			'Read', 'Glob', 'Grep', 'LS', 'NotebookRead',
			'Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'TodoWrite',
			'WebFetch', 'Task',
			'ExitPlanMode', 'AskUserQuestion',
		] as const;

		const snapshot = TOOLS.map(t => [t, getClaudePermissionKind(t), getClaudeToolDisplayName(t)] as const);

		assert.deepStrictEqual(snapshot, [
			['Bash', 'shell', 'Run shell command'],
			['BashOutput', 'shell', 'Read shell output'],
			['KillBash', 'shell', 'Kill shell command'],
			['Read', 'read', 'Read file'],
			['Glob', 'read', 'Find files'],
			['Grep', 'read', 'Search files'],
			['LS', 'read', 'List directory'],
			['NotebookRead', 'read', 'Read notebook'],
			['Write', 'write', 'Write file'],
			['Edit', 'write', 'Edit file'],
			['MultiEdit', 'write', 'Edit file'],
			['NotebookEdit', 'write', 'Edit notebook'],
			['TodoWrite', 'write', 'Update todo list'],
			['WebFetch', 'url', 'Fetch URL'],
			['Task', 'custom-tool', 'Run subagent task'],
			['ExitPlanMode', 'custom-tool', 'Ready to code?'],
			['AskUserQuestion', 'custom-tool', 'Ask user a question'],
		]);
	});

	test('mcp__-prefixed tool maps to mcp / strips prefix in displayName', () => {
		assert.deepStrictEqual(
			[
				getClaudePermissionKind('mcp__github__listIssues'),
				getClaudeToolDisplayName('mcp__github__listIssues'),
			],
			['mcp', 'Run MCP tool github__listIssues'],
		);
	});

	test('unknown tool defaults to custom-tool / toolName', () => {
		assert.deepStrictEqual(
			[
				getClaudePermissionKind('SomeNewTool'),
				getClaudeToolDisplayName('SomeNewTool'),
			],
			['custom-tool', 'SomeNewTool'],
		);
	});

	test('extractPermissionPath snapshot for path-bearing tools', () => {
		assert.deepStrictEqual(
			{
				read: extractPermissionPath('Read', { file_path: '/tmp/a' }),
				write: extractPermissionPath('Write', { file_path: '/tmp/b' }),
				edit: extractPermissionPath('Edit', { file_path: '/tmp/c' }),
				multiEdit: extractPermissionPath('MultiEdit', { file_path: '/tmp/d' }),
				notebookRead: extractPermissionPath('NotebookRead', { notebook_path: '/tmp/e.ipynb' }),
				notebookEdit: extractPermissionPath('NotebookEdit', { notebook_path: '/tmp/f.ipynb' }),
				glob: extractPermissionPath('Glob', { path: '/tmp/g', pattern: '*' }),
				grep: extractPermissionPath('Grep', { path: '/tmp/h', pattern: 'foo' }),
				ls: extractPermissionPath('LS', { path: '/tmp/i' }),
				webFetch: extractPermissionPath('WebFetch', { url: 'https://example.com' }),
				bash: extractPermissionPath('Bash', { command: 'ls' }),
				wrongTypeRead: extractPermissionPath('Read', { file_path: 42 }),
				missingRead: extractPermissionPath('Read', {}),
			},
			{
				read: '/tmp/a',
				write: '/tmp/b',
				edit: '/tmp/c',
				multiEdit: '/tmp/d',
				notebookRead: '/tmp/e.ipynb',
				notebookEdit: '/tmp/f.ipynb',
				glob: '/tmp/g',
				grep: '/tmp/h',
				ls: '/tmp/i',
				webFetch: 'https://example.com',
				bash: undefined,
				wrongTypeRead: undefined,
				missingRead: undefined,
			},
		);
	});

	test('INTERACTIVE_CLAUDE_TOOLS contains exactly the user-input round-trip tools', () => {
		assert.deepStrictEqual(
			[...INTERACTIVE_CLAUDE_TOOLS].sort(),
			['AskUserQuestion', 'ExitPlanMode'],
		);
	});

	test('getClaudeConfirmationTitle returns per-permissionKind localized title', () => {
		assert.deepStrictEqual(
			{
				shell: getClaudeConfirmationTitle('Bash'),
				write: getClaudeConfirmationTitle('Write'),
				read: getClaudeConfirmationTitle('Read'),
				url: getClaudeConfirmationTitle('WebFetch'),
				mcpWithServer: getClaudeConfirmationTitle('mcp__github__listIssues'),
				custom: getClaudeConfirmationTitle('Task'),
				unknown: getClaudeConfirmationTitle('SomeNewTool'),
			},
			{
				shell: 'Run in terminal?',
				write: 'Edit file?',
				read: 'Read file?',
				url: 'Fetch URL?',
				mcpWithServer: 'Allow tool from github?',
				custom: 'Allow tool call?',
				unknown: 'Allow tool call?',
			},
		);
	});
});

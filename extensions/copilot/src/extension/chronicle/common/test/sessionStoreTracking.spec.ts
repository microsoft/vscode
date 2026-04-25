/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { extractFilePath, extractRefsFromMcpTool, extractRefsFromTerminal, extractRepoFromMcpTool, isGitHubMcpTool } from '../sessionStoreTracking';

describe('extractFilePath', () => {
	it('extracts filePath from replace_string_in_file', () => {
		expect(extractFilePath('replace_string_in_file', { filePath: '/src/foo.ts', oldString: 'a', newString: 'b' }))
			.toBe('/src/foo.ts');
	});

	it('extracts filePath from multi_replace_string_in_file replacements array', () => {
		expect(extractFilePath('multi_replace_string_in_file', {
			explanation: 'fix imports',
			replacements: [
				{ filePath: '/src/bar.ts', oldString: 'a', newString: 'b' },
				{ filePath: '/src/baz.ts', oldString: 'c', newString: 'd' },
			]
		})).toBe('/src/bar.ts');
	});

	it('extracts filePath from insert_edit_into_file', () => {
		expect(extractFilePath('insert_edit_into_file', { filePath: '/src/edit.ts', code: '// new' }))
			.toBe('/src/edit.ts');
	});

	it('extracts filePath from create_file', () => {
		expect(extractFilePath('create_file', { filePath: '/src/new.ts', content: '' }))
			.toBe('/src/new.ts');
	});

	it('extracts filePath from edit_notebook_file', () => {
		expect(extractFilePath('edit_notebook_file', { filePath: '/nb.ipynb', editType: 'edit', cellId: 'c1' }))
			.toBe('/nb.ipynb');
	});

	it('extracts filePath from read_file', () => {
		expect(extractFilePath('read_file', { filePath: '/src/read.ts', startLine: 1, endLine: 10 }))
			.toBe('/src/read.ts');
	});

	it('extracts path from list_dir', () => {
		expect(extractFilePath('list_dir', { path: '/src' }))
			.toBe('/src');
	});

	it('extracts dirPath from create_directory', () => {
		expect(extractFilePath('create_directory', { dirPath: '/src/new-dir' }))
			.toBe('/src/new-dir');
	});

	it('extracts file path from apply_patch input text', () => {
		const input = '*** Begin Patch\n*** Update File: /src/hello.ts\n@@class Foo\n-  bar\n+  baz\n*** End Patch';
		expect(extractFilePath('apply_patch', { input }))
			.toBe('/src/hello.ts');
	});

	it('extracts file path from apply_patch Add File', () => {
		const input = '*** Begin Patch\n*** Add File: /src/new.ts\n+export const x = 1;\n*** End Patch';
		expect(extractFilePath('apply_patch', { input }))
			.toBe('/src/new.ts');
	});

	it('extracts file path from apply_patch Delete File', () => {
		const input = '*** Begin Patch\n*** Delete File: /src/old.ts\n*** End Patch';
		expect(extractFilePath('apply_patch', { input }))
			.toBe('/src/old.ts');
	});

	it('falls back to filePath arg for apply_patch when present', () => {
		expect(extractFilePath('apply_patch', { filePath: '/from/arg.ts', input: '*** Update File: /from/input.ts' }))
			.toBe('/from/arg.ts');
	});

	it('extracts path from CLI str_replace_editor (backward compat)', () => {
		expect(extractFilePath('str_replace_editor', { path: '/cli/file.py' }))
			.toBe('/cli/file.py');
	});

	it('extracts path from CLI create tool (backward compat)', () => {
		expect(extractFilePath('create', { path: '/cli/new.py' }))
			.toBe('/cli/new.py');
	});

	it('returns undefined for unknown tools', () => {
		expect(extractFilePath('run_in_terminal', { command: 'ls' }))
			.toBeUndefined();
		expect(extractFilePath('file_search', { query: '**/*.ts' }))
			.toBeUndefined();
	});

	it('returns undefined for null args', () => {
		expect(extractFilePath('create_file', null))
			.toBeUndefined();
	});

	it('returns undefined when filePath is not a string', () => {
		expect(extractFilePath('create_file', { filePath: 42 }))
			.toBeUndefined();
	});
});

describe('isGitHubMcpTool', () => {
	it('matches mcp_github_ prefix (VS Code)', () => {
		expect(isGitHubMcpTool('mcp_github_issue_write')).toBe(true);
		expect(isGitHubMcpTool('mcp_github_create_pull_request')).toBe(true);
		expect(isGitHubMcpTool('mcp_github_search_issues')).toBe(true);
	});

	it('matches github-mcp-server- prefix (CLI)', () => {
		expect(isGitHubMcpTool('github-mcp-server-create_issue')).toBe(true);
	});

	it('rejects non-GitHub MCP tools', () => {
		expect(isGitHubMcpTool('read_file')).toBe(false);
		expect(isGitHubMcpTool('mcp_perplexity_ask')).toBe(false);
		expect(isGitHubMcpTool('run_in_terminal')).toBe(false);
	});
});

describe('extractRefsFromMcpTool', () => {
	it('extracts PR ref from mcp_github_pull_request_read', () => {
		const refs = extractRefsFromMcpTool('mcp_github_pull_request_read', { pullNumber: 42, owner: 'ms', repo: 'vscode' });
		expect(refs).toEqual([{ ref_type: 'pr', ref_value: '42' }]);
	});

	it('extracts issue ref from mcp_github_issue_write', () => {
		const refs = extractRefsFromMcpTool('mcp_github_issue_write', { issue_number: 123, owner: 'ms', repo: 'vscode' });
		expect(refs).toEqual([{ ref_type: 'issue', ref_value: '123' }]);
	});

	it('extracts commit ref from mcp_github_get_commit', () => {
		const refs = extractRefsFromMcpTool('mcp_github_get_commit', { sha: 'abc123', owner: 'ms', repo: 'vscode' });
		expect(refs).toEqual([{ ref_type: 'commit', ref_value: 'abc123' }]);
	});

	it('returns empty for non-matching tool name', () => {
		expect(extractRefsFromMcpTool('mcp_github_search_code', { query: 'foo' })).toEqual([]);
	});
});

describe('extractRepoFromMcpTool', () => {
	it('extracts owner/repo', () => {
		expect(extractRepoFromMcpTool({ owner: 'microsoft', repo: 'vscode' }))
			.toBe('microsoft/vscode');
	});

	it('returns undefined when missing', () => {
		expect(extractRepoFromMcpTool({ owner: 'microsoft' })).toBeUndefined();
		expect(extractRepoFromMcpTool({})).toBeUndefined();
	});
});

describe('extractRefsFromTerminal', () => {
	it('extracts PR ref from gh pr create output', () => {
		const refs = extractRefsFromTerminal(
			{ command: 'gh pr create --title "fix"' },
			'https://github.com/microsoft/vscode/pull/999',
		);
		expect(refs).toEqual([{ ref_type: 'pr', ref_value: '999' }]);
	});

	it('extracts issue ref from gh issue create output', () => {
		const refs = extractRefsFromTerminal(
			{ command: 'gh issue create --title "bug"' },
			'https://github.com/microsoft/vscode/issues/456',
		);
		expect(refs).toEqual([{ ref_type: 'issue', ref_value: '456' }]);
	});

	it('extracts commit SHA from git commit output', () => {
		const refs = extractRefsFromTerminal(
			{ command: 'git commit -m "fix"' },
			'[main abc1234] fix\n 1 file changed',
		);
		expect(refs).toEqual([{ ref_type: 'commit', ref_value: 'abc1234' }]);
	});

	it('returns empty for unrelated commands', () => {
		expect(extractRefsFromTerminal({ command: 'ls -la' }, 'output')).toEqual([]);
	});
});

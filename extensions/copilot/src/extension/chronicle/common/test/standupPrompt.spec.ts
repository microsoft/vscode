/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { extractFilePath, extractRefsFromMcpTool, extractRefsFromTerminal, extractRepoFromMcpTool, isGitHubMcpTool } from '../sessionStoreTracking';
import { type AnnotatedRef, type AnnotatedSession, buildRefsQuery, buildStandupPrompt } from '../standupPrompt';

describe('buildStandupPrompt', () => {
	it('returns no-activity message when no sessions', () => {
		const result = buildStandupPrompt([], [], [], []);
		expect(result).toContain('no sessions were found');
	});

	it('includes session data in prompt', () => {
		const sessions: AnnotatedSession[] = [
			{ id: 'sess-1', branch: 'feature/auth', repository: 'owner/repo', summary: 'Added OAuth', updated_at: '2026-04-06T10:00:00Z', source: 'cloud' },
		];
		const result = buildStandupPrompt(sessions, [], [], []);
		expect(result).toContain('sess-1');
		expect(result).toContain('feature/auth');
		expect(result).toContain('owner/repo');
		expect(result).toContain('Added OAuth');
	});

	it('includes refs in prompt', () => {
		const sessions: AnnotatedSession[] = [
			{ id: 'sess-1', branch: 'main', summary: 'Fix', source: 'cloud' },
		];
		const refs: AnnotatedRef[] = [
			{ session_id: 'sess-1', ref_type: 'pr', ref_value: '42', source: 'cloud' },
			{ session_id: 'sess-1', ref_type: 'commit', ref_value: 'abc123', source: 'cloud' },
		];
		const result = buildStandupPrompt(sessions, refs, [], []);
		expect(result).toContain('commit: abc123');
	});

	it('shows "No references found" when refs empty', () => {
		const sessions: AnnotatedSession[] = [{ id: 'sess-1', branch: 'main', summary: 'Fix', source: 'cloud' }];
		const result = buildStandupPrompt(sessions, [], [], []);
		expect(result).toContain('No references found.');
	});

	it('includes extra context when provided', () => {
		const sessions: AnnotatedSession[] = [{ id: 'sess-1', summary: 'Work', source: 'cloud' }];
		const result = buildStandupPrompt(sessions, [], [], [], 'Focus on backend changes');
		expect(result).toContain('Additional context: Focus on backend changes');
	});

	it('shows "unknown" for missing branch and repo', () => {
		const sessions: AnnotatedSession[] = [{ id: 'sess-1', summary: 'Work', source: 'cloud' }];
		const result = buildStandupPrompt(sessions, [], [], []);
		expect(result).toContain('unknown (unknown)');
	});

	it('handles multiple sessions from different branches', () => {
		const sessions: AnnotatedSession[] = [
			{ id: 'sess-1', branch: 'feature/a', repository: 'org/repo', summary: 'Feature A', source: 'cloud' },
			{ id: 'sess-2', branch: 'feature/b', repository: 'org/repo', summary: 'Feature B', source: 'cloud' },
		];
		const result = buildStandupPrompt(sessions, [], [], []);
		expect(result).toContain('feature/a');
		expect(result).toContain('feature/b');
	});

	it('shows source tags for cloud sessions', () => {
		const sessions: AnnotatedSession[] = [
			{ id: 'cloud-1', branch: 'main', summary: 'Cloud work 1', source: 'cloud' },
			{ id: 'cloud-2', branch: 'feature/x', summary: 'Cloud work 2', source: 'cloud' },
		];
		const refs: AnnotatedRef[] = [
			{ session_id: 'cloud-2', ref_type: 'pr', ref_value: '99', source: 'cloud' },
		];
		const result = buildStandupPrompt(sessions, refs, [], []);
		expect(result).toContain('cloud-2 | pr: 99');
	});
});

describe('buildRefsQuery', () => {
	it('builds IN clause with escaped IDs', () => {
		const query = buildRefsQuery(['sess-1', 'sess-2']);
		expect(query).toContain('\'sess-1\'');
		expect(query).toContain('\'sess-2\'');
		expect(query).toContain('session_refs');
	});

	it('escapes single quotes in session IDs', () => {
		const query = buildRefsQuery(['it\'s']);
		expect(query).toContain('\'it\'\'s\'');
	});
});

describe('extractFilePath', () => {
	it('extracts filePath from apply_patch args', () => {
		expect(extractFilePath('apply_patch', { filePath: '/src/index.ts' })).toBe('/src/index.ts');
	});

	it('extracts path from create tool args', () => {
		expect(extractFilePath('create', { path: '/src/new.ts' })).toBe('/src/new.ts');
	});

	it('extracts filePath from read_file args', () => {
		expect(extractFilePath('read_file', { filePath: '/src/index.ts' })).toBe('/src/index.ts');
	});

	it('returns undefined for null args', () => {
		expect(extractFilePath('apply_patch', null)).toBeUndefined();
	});

	it('returns undefined when no path field exists', () => {
		expect(extractFilePath('apply_patch', { content: 'hello' })).toBeUndefined();
	});
});

describe('extractRefsFromMcpTool', () => {
	it('extracts PR number from pull_request tool', () => {
		const refs = extractRefsFromMcpTool('github-mcp-server-pull_request_read', { pullNumber: 42 });
		expect(refs).toEqual([{ ref_type: 'pr', ref_value: '42' }]);
	});

	it('extracts issue number from issue tool', () => {
		const refs = extractRefsFromMcpTool('github-mcp-server-issue_read', { issue_number: 99 });
		expect(refs).toEqual([{ ref_type: 'issue', ref_value: '99' }]);
	});

	it('extracts commit SHA from commit tool', () => {
		const refs = extractRefsFromMcpTool('github-mcp-server-get_commit', { sha: 'abc123' });
		expect(refs).toEqual([{ ref_type: 'commit', ref_value: 'abc123' }]);
	});

	it('returns empty for unrecognized tool', () => {
		expect(extractRefsFromMcpTool('github-mcp-server-list_repos', {})).toEqual([]);
	});
});

describe('extractRefsFromTerminal', () => {
	it('extracts PR URL from gh pr create output', () => {
		const refs = extractRefsFromTerminal(
			{ command: 'gh pr create --title "feat"' },
			'https://github.com/owner/repo/pull/123'
		);
		expect(refs).toEqual([{ ref_type: 'pr', ref_value: '123' }]);
	});

	it('extracts issue URL from gh issue create output', () => {
		const refs = extractRefsFromTerminal(
			{ command: 'gh issue create --title "bug"' },
			'https://github.com/owner/repo/issues/456'
		);
		expect(refs).toEqual([{ ref_type: 'issue', ref_value: '456' }]);
	});

	it('extracts commit SHA from git commit output', () => {
		const refs = extractRefsFromTerminal(
			{ command: 'git commit -m "fix"' },
			'[main abc1234] fix'
		);
		expect(refs).toEqual([{ ref_type: 'commit', ref_value: 'abc1234' }]);
	});

	it('returns empty for missing command', () => {
		expect(extractRefsFromTerminal({}, undefined)).toEqual([]);
	});

	it('returns empty for unrecognized command', () => {
		expect(extractRefsFromTerminal({ command: 'npm install' }, 'done')).toEqual([]);
	});
});

describe('extractRepoFromMcpTool', () => {
	it('extracts owner/repo', () => {
		expect(extractRepoFromMcpTool({ owner: 'microsoft', repo: 'vscode' })).toBe('microsoft/vscode');
	});

	it('returns undefined when owner missing', () => {
		expect(extractRepoFromMcpTool({ repo: 'vscode' })).toBeUndefined();
	});

	it('returns undefined when repo missing', () => {
		expect(extractRepoFromMcpTool({ owner: 'microsoft' })).toBeUndefined();
	});
});

describe('isGitHubMcpTool', () => {
	it('returns true for github-mcp-server-* tools', () => {
		expect(isGitHubMcpTool('github-mcp-server-pull_request_read')).toBe(true);
	});

	it('returns false for other tools', () => {
		expect(isGitHubMcpTool('apply_patch')).toBe(false);
	});
});

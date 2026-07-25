/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { buildClaudeDebugArtifacts, buildClaudeDebugFilePath, buildClaudeTranscriptPath, CLAUDE_DEBUG_LOG_LABEL, CLAUDE_TRANSCRIPT_LABEL, claudeDebugLogSessionToken, claudeProjectSlug, sanitizeFilePart, toFileTimestamp } from '../../common/agentHostLogNaming.js';

suite('agentHostLogNaming', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('buildClaudeDebugFilePath is a deterministic projection of logsHome/sessionId/timestamp', () => {
		const { dir, file } = buildClaudeDebugFilePath(URI.file('/logs'), 'sess-123', '2026-07-21T12-34-56-789Z');
		assert.deepStrictEqual(
			{ dir: dir.path, file: file.path },
			{ dir: '/logs/claude', file: '/logs/claude/claude-2026-07-21T12-34-56-789Z-sess-123.log' },
		);
	});

	test('claudeDebugLogSessionToken sanitizes and caps the id at 64 chars', () => {
		assert.deepStrictEqual(
			{
				hostile: claudeDebugLogSessionToken('a/b:c d'),
				capped: claudeDebugLogSessionToken('x'.repeat(100)).length,
			},
			{ hostile: 'a-b-c-d', capped: 64 },
		);
	});

	test('sanitizeFilePart collapses hostile runs and falls back to "connection" when empty', () => {
		assert.deepStrictEqual(
			{ hostile: sanitizeFilePart('a\\b/c:d*e?f"g<h>i|j k'), empty: sanitizeFilePart('///') },
			{ hostile: 'a-b-c-d-e-f-g-h-i-j-k', empty: 'connection' },
		);
	});

	test('toFileTimestamp renders a file-name-safe ISO timestamp', () => {
		assert.strictEqual(toFileTimestamp(new Date('2026-07-21T12:34:56.789Z')), '2026-07-21T12-34-56-789Z');
	});

	test('buildClaudeDebugArtifacts: unnumbered lone log, sorted+numbered multiples, transcript appended last', () => {
		assert.deepStrictEqual(buildClaudeDebugArtifacts([], undefined), []);
		assert.deepStrictEqual(buildClaudeDebugArtifacts(['/logs/claude/claude-b.log'], undefined), [
			{ label: CLAUDE_DEBUG_LOG_LABEL, uri: '/logs/claude/claude-b.log' },
		]);
		assert.deepStrictEqual(
			buildClaudeDebugArtifacts(['/logs/claude/claude-b.log', '/logs/claude/claude-a.log'], '/home/.claude/projects/p/s.jsonl'),
			[
				{ label: `${CLAUDE_DEBUG_LOG_LABEL} 1`, uri: '/logs/claude/claude-a.log' },
				{ label: `${CLAUDE_DEBUG_LOG_LABEL} 2`, uri: '/logs/claude/claude-b.log' },
				{ label: CLAUDE_TRANSCRIPT_LABEL, uri: '/home/.claude/projects/p/s.jsonl' },
			],
		);
	});

	test('claudeProjectSlug + buildClaudeTranscriptPath encode the cwd like the CLI', () => {
		assert.deepStrictEqual(
			{
				slug: claudeProjectSlug('/Users/tyleonha/Code/Microsoft/vscode-2'),
				symlinked: claudeProjectSlug('/private/tmp'),
				windows: claudeProjectSlug('c:\\Users\\test\\project'),
				transcript: buildClaudeTranscriptPath(URI.file('/home'), '/work/my-proj', 'sess-1').path,
			},
			{
				slug: '-Users-tyleonha-Code-Microsoft-vscode-2',
				symlinked: '-private-tmp',
				// VS Code lowercases the URI drive, but the CLI keeps it uppercase.
				windows: 'C--Users-test-project',
				transcript: '/home/.claude/projects/-work-my-proj/sess-1.jsonl',
			},
		);
	});
});

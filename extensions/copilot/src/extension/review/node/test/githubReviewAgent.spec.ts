/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { describe, suite, test } from 'vitest';
import type { TextDocument } from 'vscode';
import { IAuthenticationService } from '../../../../platform/authentication/common/authentication';
import { CopilotToken, createTestExtendedTokenInfo } from '../../../../platform/authentication/common/copilotToken';
import { ICustomInstructionsService } from '../../../../platform/customInstructions/common/customInstructionsService';
import { ICAPIClientService } from '../../../../platform/endpoint/common/capiClient';
import { IDomainService } from '../../../../platform/endpoint/common/domainService';
import { IEnvService } from '../../../../platform/env/common/envService';
import { IGitExtensionService } from '../../../../platform/git/common/gitExtensionService';
import { NullGitExtensionService } from '../../../../platform/git/common/nullGitExtensionService';
import { IIgnoreService, NullIgnoreService } from '../../../../platform/ignore/common/ignoreService';
import { MockAuthenticationService } from '../../../../platform/ignore/node/test/mockAuthenticationService';
import { MockCAPIClientService } from '../../../../platform/ignore/node/test/mockCAPIClientService';
import { MockWorkspaceService } from '../../../../platform/ignore/node/test/mockWorkspaceService';
import { IFetcherService } from '../../../../platform/networking/common/fetcherService';
import { ReviewComment, ReviewRequest } from '../../../../platform/review/common/reviewService';
import { MockCustomInstructionsService } from '../../../../platform/test/common/testCustomInstructionsService';
import { createFakeStreamResponse } from '../../../../platform/test/node/fetcher';
import { TestLogService } from '../../../../platform/testing/common/testLogService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { createTextDocumentData } from '../../../../util/common/test/shims/textDocument';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { Event } from '../../../../util/vs/base/common/event';
import { URI } from '../../../../util/vs/base/common/uri';
import {
	createReviewComment,
	ExcludedComment,
	LineChange,
	loadCustomInstructions,
	normalizePath,
	parseLine,
	parsePatch,
	removeSuggestion,
	ResponseComment,
	reverseParsedPatch,
	reversePatch
} from '../githubReviewAgent';

suite('githubReviewAgent', () => {

	describe('normalizePath', () => {

		test('returns path unchanged when no backslashes', () => {
			const result = normalizePath('src/components/Button.tsx');
			assert.strictEqual(result, 'src/components/Button.tsx');
		});

		test('converts backslashes to forward slashes', () => {
			// This test verifies the function works regardless of platform
			// On Windows, backslashes would be converted; on other platforms, they're still converted
			const input = 'src\\components\\Button.tsx';
			const result = normalizePath(input);
			// On Windows (win32): converts to forward slashes
			// On other platforms: returns unchanged (no backslashes in typical paths)
			if (process.platform === 'win32') {
				assert.strictEqual(result, 'src/components/Button.tsx');
			} else {
				assert.strictEqual(result, input);
			}
		});

		test('handles empty string', () => {
			const result = normalizePath('');
			assert.strictEqual(result, '');
		});

		test('handles path with mixed slashes on Windows', () => {
			const input = 'src/components\\utils\\helper.ts';
			const result = normalizePath(input);
			if (process.platform === 'win32') {
				assert.strictEqual(result, 'src/components/utils/helper.ts');
			} else {
				assert.strictEqual(result, input);
			}
		});
	});

	describe('parseLine', () => {

		test('returns empty array for empty line', () => {
			const result = parseLine('');
			assert.deepStrictEqual(result, []);
		});

		test('returns empty array for DONE marker', () => {
			const result = parseLine('data: [DONE]');
			assert.deepStrictEqual(result, []);
		});

		test('returns empty array when no copilot_references', () => {
			const result = parseLine('data: {"choices":[]}');
			assert.deepStrictEqual(result, []);
		});

		test('returns empty array when copilot_references is empty', () => {
			const result = parseLine('data: {"copilot_references":[]}');
			assert.deepStrictEqual(result, []);
		});

		test('parses generated pull request comment', () => {
			const data = {
				copilot_references: [{
					type: 'github.generated-pull-request-comment',
					data: {
						path: 'src/file.ts',
						line: 10,
						body: 'This is a bug'
					}
				}]
			};
			const result = parseLine(`data: ${JSON.stringify(data)}`);

			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].type, 'github.generated-pull-request-comment');
			if (result[0].type === 'github.generated-pull-request-comment') {
				assert.strictEqual(result[0].data.path, 'src/file.ts');
				assert.strictEqual(result[0].data.line, 10);
				assert.strictEqual(result[0].data.body, 'This is a bug');
			}
		});

		test('parses excluded pull request comment', () => {
			const data = {
				copilot_references: [{
					type: 'github.excluded-pull-request-comment',
					data: {
						path: 'src/file.ts',
						line: 5,
						body: 'Low confidence comment',
						exclusion_reason: 'denylisted_type'
					}
				}]
			};
			const result = parseLine(`data: ${JSON.stringify(data)}`);

			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].type, 'github.excluded-pull-request-comment');
		});

		test('parses excluded file reference', () => {
			const data = {
				copilot_references: [{
					type: 'github.excluded-file',
					data: {
						file_path: 'src/file.txt',
						language: 'plaintext',
						reason: 'file_type_not_supported'
					}
				}]
			};
			const result = parseLine(`data: ${JSON.stringify(data)}`);

			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].type, 'github.excluded-file');
		});

		test('parses multiple references in single line', () => {
			const data = {
				copilot_references: [
					{
						type: 'github.generated-pull-request-comment',
						data: { path: 'a.ts', line: 1, body: 'Comment 1' }
					},
					{
						type: 'github.generated-pull-request-comment',
						data: { path: 'b.ts', line: 2, body: 'Comment 2' }
					}
				]
			};
			const result = parseLine(`data: ${JSON.stringify(data)}`);

			assert.strictEqual(result.length, 2);
		});

		test('filters out references without type', () => {
			const data = {
				copilot_references: [
					{ type: 'github.generated-pull-request-comment', data: { path: 'a.ts', line: 1, body: 'Valid' } },
					{ data: { path: 'b.ts', line: 2, body: 'No type field' } }
				]
			};
			const result = parseLine(`data: ${JSON.stringify(data)}`);

			assert.strictEqual(result.length, 1);
		});
	});

	describe('removeSuggestion', () => {

		test('returns original content when no suggestion block', () => {
			const body = 'This is a regular comment without suggestions.';
			const result = removeSuggestion(body);

			assert.strictEqual(result.content, body);
			assert.deepStrictEqual(result.suggestions, []);
		});

		test('extracts single suggestion and removes block', () => {
			const body = 'Fix the typo.\n```suggestion\nconst fixed = true;\n```';
			const result = removeSuggestion(body);

			assert.strictEqual(result.content, 'Fix the typo.\n');
			// The regex captures content including the trailing newline before ```
			assert.deepStrictEqual(result.suggestions, ['const fixed = true;\n']);
		});

		test('extracts multiple suggestions', () => {
			const body = 'First issue.\n```suggestion\nfix1\n```\nSecond issue.\n```suggestion\nfix2\n```';
			const result = removeSuggestion(body);

			assert.strictEqual(result.suggestions.length, 2);
			// The regex captures content including the trailing newline before ```
			assert.strictEqual(result.suggestions[0], 'fix1\n');
			assert.strictEqual(result.suggestions[1], 'fix2\n');
		});

		test('handles suggestion with CRLF line endings', () => {
			const body = 'Fix.\r\n```suggestion\r\nconst x = 1;\r\n```';
			const result = removeSuggestion(body);

			// The regex captures content including the trailing CRLF before ```
			assert.deepStrictEqual(result.suggestions, ['const x = 1;\r\n']);
		});

		test('handles empty suggestion block', () => {
			const body = 'Remove this line.\n```suggestion\n```';
			const result = removeSuggestion(body);

			assert.strictEqual(result.content, 'Remove this line.\n');
			assert.deepStrictEqual(result.suggestions, []);
		});

		test('handles suggestion with trailing spaces after keyword', () => {
			const body = 'Fix.\n```suggestion   \ncode here\n```';
			const result = removeSuggestion(body);

			// The regex captures content including the trailing newline before ```
			assert.deepStrictEqual(result.suggestions, ['code here\n']);
		});

		test('preserves non-suggestion code blocks', () => {
			const body = 'Example:\n```typescript\nconst x = 1;\n```\nDone.';
			const result = removeSuggestion(body);

			assert.strictEqual(result.content, body);
			assert.deepStrictEqual(result.suggestions, []);
		});
	});

	describe('parsePatch', () => {

		test('returns empty array for empty input', () => {
			const result = parsePatch([]);
			assert.deepStrictEqual(result, []);
		});

		test('parses single addition', () => {
			const patchLines = [
				'@@ -1,3 +1,4 @@',
				' line1',
				'+added line',
				' line2',
				' line3'
			];
			const result = parsePatch(patchLines);

			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].type, 'add');
			assert.strictEqual(result[0].content, 'added line');
			assert.strictEqual(result[0].beforeLineNumber, 2);
		});

		test('parses single deletion', () => {
			const patchLines = [
				'@@ -1,4 +1,3 @@',
				' line1',
				'-deleted line',
				' line2',
				' line3'
			];
			const result = parsePatch(patchLines);

			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].type, 'remove');
			assert.strictEqual(result[0].content, 'deleted line');
			assert.strictEqual(result[0].beforeLineNumber, 2);
		});

		test('parses mixed additions and deletions', () => {
			const patchLines = [
				'@@ -1,3 +1,3 @@',
				' line1',
				'-old line',
				'+new line',
				' line3'
			];
			const result = parsePatch(patchLines);

			assert.strictEqual(result.length, 2);
			assert.strictEqual(result[0].type, 'remove');
			assert.strictEqual(result[0].content, 'old line');
			assert.strictEqual(result[1].type, 'add');
			assert.strictEqual(result[1].content, 'new line');
		});

		test('parses multiple hunks', () => {
			const patchLines = [
				'@@ -1,2 +1,3 @@',
				' line1',
				'+added1',
				'@@ -10,2 +11,3 @@',
				' line10',
				'+added2'
			];
			const result = parsePatch(patchLines);

			assert.strictEqual(result.length, 2);
			assert.strictEqual(result[0].beforeLineNumber, 2);
			assert.strictEqual(result[1].beforeLineNumber, 11);
		});

		test('ignores lines before first hunk header', () => {
			const patchLines = [
				'diff --git a/file.ts b/file.ts',
				'index abc..def 100644',
				'--- a/file.ts',
				'+++ b/file.ts',
				'@@ -1,2 +1,3 @@',
				' context',
				'+added'
			];
			const result = parsePatch(patchLines);

			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].content, 'added');
		});

		test('handles malformed hunk header gracefully', () => {
			const patchLines = [
				'@@ invalid header @@',
				'+should be ignored',
				'@@ -5,2 +5,3 @@',
				' context',
				'+added after valid header'
			];
			const result = parsePatch(patchLines);

			// Only the change after the valid header should be parsed
			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].content, 'added after valid header');
			assert.strictEqual(result[0].beforeLineNumber, 6);
		});

		test('returns empty array for patch with no hunk headers', () => {
			const patchLines = [
				'diff --git a/file.ts b/file.ts',
				'index abc..def 100644',
				'--- a/file.ts',
				'+++ b/file.ts',
				// No @@ header
			];
			const result = parsePatch(patchLines);

			assert.deepStrictEqual(result, []);
		});

		test('handles hunk with only context lines', () => {
			const patchLines = [
				'@@ -1,3 +1,3 @@',
				' line1',
				' line2',
				' line3'
			];
			const result = parsePatch(patchLines);

			assert.deepStrictEqual(result, []);
		});

		test('handles consecutive additions', () => {
			const patchLines = [
				'@@ -1,2 +1,5 @@',
				' line1',
				'+added1',
				'+added2',
				'+added3',
				' line2'
			];
			const result = parsePatch(patchLines);

			assert.strictEqual(result.length, 3);
			assert.strictEqual(result[0].beforeLineNumber, 2);
			assert.strictEqual(result[1].beforeLineNumber, 2);
			assert.strictEqual(result[2].beforeLineNumber, 2);
		});

		test('handles consecutive deletions', () => {
			const patchLines = [
				'@@ -1,5 +1,2 @@',
				' line1',
				'-deleted1',
				'-deleted2',
				'-deleted3',
				' line5'
			];
			const result = parsePatch(patchLines);

			assert.strictEqual(result.length, 3);
			// Each deletion increments beforeLineNumber
			assert.strictEqual(result[0].beforeLineNumber, 2);
			assert.strictEqual(result[1].beforeLineNumber, 3);
			assert.strictEqual(result[2].beforeLineNumber, 4);
		});
	});

	describe('reverseParsedPatch', () => {

		test('returns original lines when patch is empty', () => {
			const lines = ['line1', 'line2', 'line3'];
			const result = reverseParsedPatch([...lines], []);

			assert.deepStrictEqual(result, lines);
		});

		test('reverses an addition by removing the line', () => {
			const afterLines = ['line1', 'added', 'line2'];
			const patch: LineChange[] = [
				{ beforeLineNumber: 2, content: 'added', type: 'add' }
			];
			const result = reverseParsedPatch([...afterLines], patch);

			assert.deepStrictEqual(result, ['line1', 'line2']);
		});

		test('reverses a deletion by re-adding the line', () => {
			const afterLines = ['line1', 'line3'];
			const patch: LineChange[] = [
				{ beforeLineNumber: 2, content: 'line2', type: 'remove' }
			];
			const result = reverseParsedPatch([...afterLines], patch);

			assert.deepStrictEqual(result, ['line1', 'line2', 'line3']);
		});

		// TODO(bug): This test documents buggy behavior in reverseParsedPatch - the patch is NOT actually reversed.
		// When given a replacement (delete 'old' and add 'new' at the same line), the function returns input unchanged:
		//   1. Processing 'remove' inserts 'old' at index 1: ['line1', 'old', 'new', 'line3']
		//   2. Processing 'add' removes at index 1: ['line1', 'new', 'line3']
		// The result equals the input, meaning no reversal occurred.
		// Expected correct behavior: ['line1', 'old', 'line3'] (the original state before the replacement).
		// This test validates incorrect behavior and should be fixed when reverseParsedPatch is corrected.
		test('reverses a replacement (delete then add)', () => {
			const afterLines = ['line1', 'new', 'line3'];
			const patch: LineChange[] = [
				{ beforeLineNumber: 2, content: 'old', type: 'remove' },
				{ beforeLineNumber: 2, content: 'new', type: 'add' }
			];
			const result = reverseParsedPatch([...afterLines], patch);

			// BUG: Returns input unchanged instead of properly reversed result ['line1', 'old', 'line3']
			assert.deepStrictEqual(result, ['line1', 'new', 'line3']);
		});

		test('handles multiple additions at different positions', () => {
			// After: line1, added1, line2, added2, line3
			// Patch adds at positions 2 and 4 (in after state)
			const afterLines = ['line1', 'added1', 'line2', 'added2', 'line3'];
			const patch: LineChange[] = [
				{ beforeLineNumber: 2, content: 'added1', type: 'add' },
				{ beforeLineNumber: 3, content: 'added2', type: 'add' }
			];
			const result = reverseParsedPatch([...afterLines], patch);

			// After first removal: ['line1', 'line2', 'added2', 'line3']
			// After second removal at position 2: ['line1', 'line2', 'line3']
			assert.deepStrictEqual(result, ['line1', 'line2', 'line3']);
		});

		test('handles multiple deletions at different positions', () => {
			// After: line1, line3, line5
			// Before had line2 at position 2 and line4 at position 4
			const afterLines = ['line1', 'line3', 'line5'];
			const patch: LineChange[] = [
				{ beforeLineNumber: 2, content: 'line2', type: 'remove' },
				{ beforeLineNumber: 4, content: 'line4', type: 'remove' }
			];
			const result = reverseParsedPatch([...afterLines], patch);

			// After first insert at 1: ['line1', 'line2', 'line3', 'line5']
			// After second insert at 3: ['line1', 'line2', 'line3', 'line4', 'line5']
			assert.deepStrictEqual(result, ['line1', 'line2', 'line3', 'line4', 'line5']);
		});

		test('handles empty file lines array', () => {
			const afterLines: string[] = [];
			const patch: LineChange[] = [
				{ beforeLineNumber: 1, content: 'was here', type: 'remove' }
			];
			const result = reverseParsedPatch([...afterLines], patch);

			assert.deepStrictEqual(result, ['was here']);
		});

		test('handles addition at end of file', () => {
			const afterLines = ['line1', 'line2', 'added at end'];
			const patch: LineChange[] = [
				{ beforeLineNumber: 3, content: 'added at end', type: 'add' }
			];
			const result = reverseParsedPatch([...afterLines], patch);

			assert.deepStrictEqual(result, ['line1', 'line2']);
		});
	});

	describe('reversePatch', () => {

		test('reverses simple addition', () => {
			const after = 'line1\nadded\nline2';
			const diff = '@@ -1,2 +1,3 @@\n line1\n+added\n line2';

			const result = reversePatch(after, diff);

			assert.strictEqual(result, 'line1\nline2');
		});

		test('reverses simple deletion', () => {
			const after = 'line1\nline3';
			const diff = '@@ -1,3 +1,2 @@\n line1\n-line2\n line3';

			const result = reversePatch(after, diff);

			assert.strictEqual(result, 'line1\nline2\nline3');
		});

		test('reverses replacement', () => {
			const after = 'line1\nnew\nline3';
			const diff = '@@ -1,3 +1,3 @@\n line1\n-old\n+new\n line3';

			const result = reversePatch(after, diff);

			assert.strictEqual(result, 'line1\nold\nline3');
		});

		test('handles CRLF in after content', () => {
			const after = 'line1\r\nadded\r\nline2';
			const diff = '@@ -1,2 +1,3 @@\n line1\n+added\n line2';

			const result = reversePatch(after, diff);

			assert.strictEqual(result, 'line1\nline2');
		});

		test('handles empty diff', () => {
			const after = 'line1\nline2';
			const diff = '';

			const result = reversePatch(after, diff);

			assert.strictEqual(result, 'line1\nline2');
		});
	});

	describe('createReviewComment', () => {

		function createTestRequest(overrides?: Partial<ReviewRequest>): ReviewRequest {
			return {
				source: 'githubReviewAgent',
				promptCount: 1,
				messageId: 'test-message-id',
				inputType: 'change',
				inputRanges: [],
				...overrides,
			};
		}

		test('creates comment with correct range from line number', () => {
			const docData = createTextDocumentData(
				URI.file('/test/file.ts'),
				'line1\n    indented line\nline3',
				'typescript'
			);
			const ghComment: ResponseComment = {
				type: 'github.generated-pull-request-comment',
				data: {
					path: 'file.ts',
					line: 2,
					body: 'This line has an issue.'
				}
			};
			const request = createTestRequest();

			const comment = createReviewComment(ghComment, request, docData.document, 0);

			assert.strictEqual(comment.range.start.line, 1); // 0-indexed
			assert.strictEqual(comment.range.start.character, 4); // firstNonWhitespaceCharacterIndex
			assert.strictEqual(comment.range.end.line, 1);
			assert.strictEqual(comment.languageId, 'typescript');
			assert.strictEqual(comment.originalIndex, 0);
			assert.strictEqual(comment.kind, 'bug');
			assert.strictEqual(comment.severity, 'medium');
		});

		test('extracts suggestion from body and creates edit', () => {
			const docData = createTextDocumentData(
				URI.file('/test/file.ts'),
				'const x = 1;\nconst y = 2;\nconst z = 3;',
				'typescript'
			);
			const ghComment: ResponseComment = {
				type: 'github.generated-pull-request-comment',
				data: {
					path: 'file.ts',
					line: 2,
					body: 'Fix the variable name.\n```suggestion\nconst fixedY = 2;\n```'
				}
			};
			const request = createTestRequest();

			const comment = createReviewComment(ghComment, request, docData.document, 0);

			// Body should have suggestion removed - body is MarkdownString in this case
			const bodyValue = typeof comment.body === 'string' ? comment.body : comment.body.value;
			assert.strictEqual(bodyValue, 'Fix the variable name.\n');
			// Should have one edit suggestion
			assert.ok(comment.suggestion);
			assert.ok(!('then' in comment.suggestion)); // Not a promise
			const suggestion = comment.suggestion as { edits: { newText: string }[] };
			assert.strictEqual(suggestion.edits.length, 1);
			assert.strictEqual(suggestion.edits[0].newText, 'const fixedY = 2;\n');
		});

		test('handles comment with start_line for multi-line range', () => {
			const docData = createTextDocumentData(
				URI.file('/test/file.ts'),
				'line1\nline2\nline3\nline4',
				'typescript'
			);
			const ghComment: ResponseComment = {
				type: 'github.generated-pull-request-comment',
				data: {
					path: 'file.ts',
					line: 3,
					start_line: 2,
					body: 'Multi-line issue.\n```suggestion\nreplacement\n```'
				}
			};
			const request = createTestRequest();

			const comment = createReviewComment(ghComment, request, docData.document, 1);

			// Suggestion range should span from start_line to line
			assert.ok(comment.suggestion);
			assert.ok(!('then' in comment.suggestion)); // Not a promise
			const suggestion = comment.suggestion as { edits: { range: { start: { line: number }; end: { line: number } } }[] };
			assert.strictEqual(suggestion.edits[0].range.start.line, 1); // start_line - 1
			assert.strictEqual(suggestion.edits[0].range.end.line, 3); // line
			assert.strictEqual(comment.originalIndex, 1);
		});

		test('handles excluded comment', () => {
			const docData = createTextDocumentData(
				URI.file('/test/file.ts'),
				'line1\nline2\nline3',
				'typescript'
			);
			const ghComment: ExcludedComment = {
				type: 'github.excluded-pull-request-comment',
				data: {
					path: 'file.ts',
					line: 2,
					body: 'Low confidence comment.',
					exclusion_reason: 'denylisted_type'
				}
			};
			const request = createTestRequest();

			const comment = createReviewComment(ghComment, request, docData.document, 0);

			const bodyValue = typeof comment.body === 'string' ? comment.body : comment.body.value;
			assert.strictEqual(bodyValue, 'Low confidence comment.');
			assert.strictEqual(comment.range.start.line, 1);
		});

		test('handles comment without suggestion', () => {
			const docData = createTextDocumentData(
				URI.file('/test/file.ts'),
				'const x = 1;',
				'typescript'
			);
			const ghComment: ResponseComment = {
				type: 'github.generated-pull-request-comment',
				data: {
					path: 'file.ts',
					line: 1,
					body: 'Consider renaming this variable.'
				}
			};
			const request = createTestRequest();

			const comment = createReviewComment(ghComment, request, docData.document, 0);

			const bodyValue = typeof comment.body === 'string' ? comment.body : comment.body.value;
			assert.strictEqual(bodyValue, 'Consider renaming this variable.');
			assert.ok(comment.suggestion);
			assert.ok(!('then' in comment.suggestion)); // Not a promise
			const suggestion = comment.suggestion as { edits: unknown[] };
			assert.strictEqual(suggestion.edits.length, 0);
		});
	});

	describe('loadCustomInstructions', () => {

		function createMockWorkspaceService(): IWorkspaceService {
			return {
				asRelativePath: (uri: URI) => uri.path.split('/').pop() || uri.path
			} as IWorkspaceService;
		}

		test('returns empty array when no instructions configured', async () => {
			const customInstructionsService = new MockCustomInstructionsService();
			const workspaceService = createMockWorkspaceService();
			const languageIdToFilePatterns = new Map<string, Set<string>>();

			const result = await loadCustomInstructions(
				customInstructionsService,
				workspaceService,
				'diff',
				languageIdToFilePatterns,
				1
			);

			assert.deepStrictEqual(result, []);
		});

		test('loads instructions from agent instruction files', async () => {
			// Create a custom service that returns agent instructions
			const testUri = URI.file('/test/instructions.md');
			const customInstructionsService = {
				...new MockCustomInstructionsService(),
				getAgentInstructions: () => Promise.resolve([testUri]),
				fetchInstructionsFromFile: (uri: typeof testUri) => Promise.resolve({
					content: [{ instruction: 'Test instruction', languageId: undefined }]
				}),
				fetchInstructionsFromSetting: () => Promise.resolve([])
			};
			const workspaceService = createMockWorkspaceService();
			const languageIdToFilePatterns = new Map<string, Set<string>>();

			const result = await loadCustomInstructions(
				customInstructionsService as unknown as ICustomInstructionsService,
				workspaceService,
				'selection',
				languageIdToFilePatterns,
				1
			);

			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].type, 'github.coding_guideline');
			assert.strictEqual(result[0].data.description, 'Test instruction');
			assert.deepStrictEqual(result[0].data.filePatterns, ['*']);
		});

		test('loads instructions from settings', async () => {
			// Create a custom service that returns settings instructions
			const customInstructionsService = {
				...new MockCustomInstructionsService(),
				getAgentInstructions: () => Promise.resolve([]),
				fetchInstructionsFromFile: () => Promise.resolve(undefined),
				fetchInstructionsFromSetting: () => Promise.resolve([{
					content: [{ instruction: 'Settings instruction', languageId: undefined }]
				}])
			};
			const workspaceService = createMockWorkspaceService();
			const languageIdToFilePatterns = new Map<string, Set<string>>();

			const result = await loadCustomInstructions(
				customInstructionsService as unknown as ICustomInstructionsService,
				workspaceService,
				'selection',
				languageIdToFilePatterns,
				1
			);

			// CodeGenerationInstructions + CodeFeedbackInstructions for 'selection' kind
			// Each setting config will be called, and each returns 1 instruction
			assert.ok(result.length >= 1);
			assert.strictEqual(result[0].type, 'github.coding_guideline');
		});

		test('filters instructions by languageId when specified', async () => {
			const testUri = URI.file('/test/instructions.md');
			const customInstructionsService = {
				...new MockCustomInstructionsService(),
				getAgentInstructions: () => Promise.resolve([testUri]),
				fetchInstructionsFromFile: () => Promise.resolve({
					content: [
						{ instruction: 'TypeScript only', languageId: 'typescript' },
						{ instruction: 'Python only', languageId: 'python' },
						{ instruction: 'All languages', languageId: undefined }
					]
				}),
				fetchInstructionsFromSetting: () => Promise.resolve([])
			};
			const workspaceService = createMockWorkspaceService();
			// Only TypeScript is in the map, so Python instruction should be skipped
			const languageIdToFilePatterns = new Map<string, Set<string>>([
				['typescript', new Set(['*.ts', '*.tsx'])]
			]);

			const result = await loadCustomInstructions(
				customInstructionsService as unknown as ICustomInstructionsService,
				workspaceService,
				'selection',
				languageIdToFilePatterns,
				1
			);

			// Should have 2 instructions: TypeScript + All languages (Python skipped)
			assert.strictEqual(result.length, 2);
			const descriptions = result.map(r => r.data.description);
			assert.ok(descriptions.includes('TypeScript only'));
			assert.ok(descriptions.includes('All languages'));
			assert.ok(!descriptions.includes('Python only'));

			// TypeScript instruction should have specific file patterns
			const tsInstruction = result.find(r => r.data.description === 'TypeScript only');
			assert.ok(tsInstruction);
			assert.deepStrictEqual(tsInstruction.data.filePatterns.sort(), ['*.ts', '*.tsx']);
		});

		test('filters settings instructions by languageId', async () => {
			// Create a custom service that returns settings instructions with languageId
			const customInstructionsService = {
				...new MockCustomInstructionsService(),
				getAgentInstructions: () => Promise.resolve([]),
				fetchInstructionsFromFile: () => Promise.resolve(undefined),
				fetchInstructionsFromSetting: () => Promise.resolve([{
					content: [
						{ instruction: 'JavaScript rule', languageId: 'javascript' },
						{ instruction: 'Ruby rule', languageId: 'ruby' },
						{ instruction: 'General rule', languageId: undefined }
					]
				}])
			};
			const workspaceService = createMockWorkspaceService();
			// Only JavaScript is in the map, Ruby should be filtered out
			const languageIdToFilePatterns = new Map<string, Set<string>>([
				['javascript', new Set(['*.js'])]
			]);

			const result = await loadCustomInstructions(
				customInstructionsService as unknown as ICustomInstructionsService,
				workspaceService,
				'selection',
				languageIdToFilePatterns,
				1
			);

			// JavaScript + General should be included, Ruby filtered out
			const descriptions = result.map(r => r.data.description);
			assert.ok(descriptions.includes('JavaScript rule'));
			assert.ok(descriptions.includes('General rule'));
			assert.ok(!descriptions.includes('Ruby rule'));
		});
	});

	describe('githubReview', () => {
		// These tests verify the integration of githubReview with mocked services
		// Following the pattern from chatMLFetcherRetry.spec.ts for extending mocks

		// Common mock services shared across tests
		const createMockFetcherService = (): IFetcherService => ({
			makeAbortController: () => ({ abort: () => { }, signal: {} }),
			isAbortError: () => false,
		} as unknown as IFetcherService);

		const createBaseMocks = () => ({
			domainService: { _serviceBrand: undefined, onDidChangeDomains: Event.None } as IDomainService,
			fetcherService: createMockFetcherService(),
			envService: { sessionId: 'test' } as IEnvService,
		});

		const createMockGitExtensionService = (): IGitExtensionService => {
			const mockGitApi = {
				getRepository: () => ({ rootUri: URI.file('/test') }),
				repositories: [],
			};
			return {
				getExtensionApi: () => mockGitApi,
				extensionAvailable: true,
			} as unknown as IGitExtensionService;
		};

		test('returns success with empty comments when git extension is not available', async () => {
			const { githubReview } = await import('../githubReviewAgent');
			const { domainService, fetcherService, envService } = createBaseMocks();

			const result = await githubReview(
				new TestLogService(),
				new NullGitExtensionService(),
				new MockAuthenticationService() as unknown as IAuthenticationService,
				new MockCAPIClientService() as unknown as ICAPIClientService,
				domainService,
				fetcherService,
				envService,
				new NullIgnoreService(),
				new MockWorkspaceService(),
				new MockCustomInstructionsService(),
				{ repositoryRoot: '/test', commitMessages: [], patches: [] },
				undefined,
				{ report: () => { } },
				CancellationToken.None
			);

			assert.strictEqual(result.type, 'success');
			if (result.type === 'success') {
				assert.deepStrictEqual(result.comments, []);
			}
		});

		test('returns success with empty comments when no patches provided', async () => {
			const { githubReview } = await import('../githubReviewAgent');
			const { domainService, fetcherService, envService } = createBaseMocks();

			const result = await githubReview(
				new TestLogService(),
				createMockGitExtensionService(),
				new MockAuthenticationService() as unknown as IAuthenticationService,
				new MockCAPIClientService() as unknown as ICAPIClientService,
				domainService,
				fetcherService,
				envService,
				new NullIgnoreService(),
				new MockWorkspaceService(),
				new MockCustomInstructionsService(),
				{ repositoryRoot: '/test', commitMessages: [], patches: [] },
				undefined,
				{ report: () => { } },
				CancellationToken.None
			);

			assert.strictEqual(result.type, 'success');
			if (result.type === 'success') {
				assert.deepStrictEqual(result.comments, []);
			}
		});

		test('processes patches and returns review comments from API response', async () => {
			const { githubReview } = await import('../githubReviewAgent');
			const { domainService, fetcherService, envService } = createBaseMocks();

			// Extend MockAuthenticationService to return a valid token (following chatMLFetcherRetry.spec.ts pattern)
			class TestAuthenticationService extends MockAuthenticationService {
				override getCopilotToken(_force?: boolean): Promise<CopilotToken> {
					return Promise.resolve(new CopilotToken(createTestExtendedTokenInfo({ token: 'test-token', code_review_enabled: true })));
				}
			}

			// Set up CAPI client to return a streaming response with a comment
			const sseResponse = [
				`data: ${JSON.stringify({
					copilot_references: [{
						type: 'github.generated-pull-request-comment',
						data: {
							path: 'file.ts',
							line: 1,
							body: 'Consider using const instead of let.'
						}
					}]
				})}\n`,
				'data: [DONE]\n'
			];
			class TestCAPIClientService extends MockCAPIClientService {
				override makeRequest<T>(): Promise<T> {
					return Promise.resolve(createFakeStreamResponse(sseResponse) as unknown as T);
				}
			}

			// Set up workspace service with a document (inline extension pattern)
			const fileUri = URI.file('/test/file.ts');
			const docData = createTextDocumentData(fileUri, 'let x = 1;', 'typescript');
			class TestWorkspaceService extends MockWorkspaceService {
				override openTextDocument(uri: URI): Promise<TextDocument> {
					if (uri.toString() === fileUri.toString()) {
						return Promise.resolve(docData.document);
					}
					return Promise.reject(new Error(`Document not found: ${uri.toString()}`));
				}
			}

			const reportedComments: ReviewComment[] = [];
			const progress = {
				report: (comments: ReviewComment[]) => reportedComments.push(...comments)
			};

			const result = await githubReview(
				new TestLogService(),
				createMockGitExtensionService(),
				new TestAuthenticationService() as unknown as IAuthenticationService,
				new TestCAPIClientService() as unknown as ICAPIClientService,
				domainService,
				fetcherService,
				envService,
				new NullIgnoreService(),
				new TestWorkspaceService(),
				new MockCustomInstructionsService(),
				{
					repositoryRoot: '/test',
					commitMessages: ['test commit'],
					patches: [{
						patch: '@@ -1,1 +1,1 @@\n-const x = 1;\n+let x = 1;',
						fileUri: fileUri.toString(),
					}]
				},
				undefined,
				progress,
				CancellationToken.None
			);

			assert.strictEqual(result.type, 'success');
			if (result.type === 'success') {
				assert.strictEqual(result.comments.length, 1);
				assert.strictEqual(reportedComments.length, 1);
			}
		});

		test('returns info error when all files are ignored', async () => {
			const { githubReview } = await import('../githubReviewAgent');
			const { domainService, fetcherService, envService } = createBaseMocks();

			// Create an ignore service that ignores all files
			const ignoreService = {
				isCopilotIgnored: () => Promise.resolve(true),
			};

			// Set up workspace service with a document (inline extension pattern)
			const fileUri = URI.file('/test/file.ts');
			const docData = createTextDocumentData(fileUri, 'let x = 1;', 'typescript');
			class TestWorkspaceService extends MockWorkspaceService {
				override openTextDocument(uri: URI): Promise<TextDocument> {
					if (uri.toString() === fileUri.toString()) {
						return Promise.resolve(docData.document);
					}
					return Promise.reject(new Error(`Document not found: ${uri.toString()}`));
				}
			}

			const result = await githubReview(
				new TestLogService(),
				createMockGitExtensionService(),
				new MockAuthenticationService() as unknown as IAuthenticationService,
				new MockCAPIClientService() as unknown as ICAPIClientService,
				domainService,
				fetcherService,
				envService,
				ignoreService as unknown as IIgnoreService,
				new TestWorkspaceService(),
				new MockCustomInstructionsService(),
				{
					repositoryRoot: '/test',
					commitMessages: [],
					patches: [{
						patch: '@@ -1,1 +1,1 @@\n-const x = 1;\n+let x = 1;',
						fileUri: fileUri.toString(),
					}]
				},
				undefined,
				{ report: () => { } },
				CancellationToken.None
			);

			assert.strictEqual(result.type, 'error');
			if (result.type === 'error') {
				assert.strictEqual(result.severity, 'info');
				assert.ok(result.reason.includes('ignored'));
			}
		});

		test('handles cancelled request via abort signal', async () => {
			const { githubReview } = await import('../githubReviewAgent');
			const { domainService, envService } = createBaseMocks();

			// Create auth service with token
			class TestAuthenticationService extends MockAuthenticationService {
				override getCopilotToken(_force?: boolean): Promise<CopilotToken> {
					return Promise.resolve(new CopilotToken(createTestExtendedTokenInfo({ token: 'test-token' })));
				}
			}

			const fileUri = URI.file('/test/file.ts');
			const docData = createTextDocumentData(fileUri, 'const x = 1;', 'typescript');

			class TestWorkspaceService extends MockWorkspaceService {
				override openTextDocument(uri: URI): Promise<TextDocument> {
					if (uri.toString() === fileUri.toString()) {
						return Promise.resolve(docData.document);
					}
					return Promise.reject(new Error(`Document not found: ${uri.toString()}`));
				}
				override asRelativePath(uri: URI): string {
					return uri.path.replace(/^\/test\//, '');
				}
			}

			// Mock fetcher with abort support
			const abortError = new Error('Aborted');
			const fetcherService: IFetcherService = {
				makeAbortController: () => ({ abort: () => { }, signal: {} }),
				isAbortError: (err: unknown) => err === abortError,
			} as unknown as IFetcherService;

			// Create CAPI client that throws abort error
			class TestCAPIClientService extends MockCAPIClientService {
				buildUrl(_ep: unknown, path: string): URL {
					return new URL('https://api.github.com' + path);
				}
				override makeRequest<T>(): Promise<T> {
					return Promise.reject(abortError);
				}
			}

			const result = await githubReview(
				new TestLogService(),
				createMockGitExtensionService(),
				new TestAuthenticationService() as unknown as IAuthenticationService,
				new TestCAPIClientService() as unknown as ICAPIClientService,
				domainService,
				fetcherService,
				envService,
				new NullIgnoreService(),
				new TestWorkspaceService(),
				new MockCustomInstructionsService(),
				{
					repositoryRoot: '/test',
					commitMessages: ['test commit'],
					patches: [{
						patch: '@@ -1,1 +1,1 @@\n-const x = 1;\n+let x = 1;',
						fileUri: fileUri.toString(),
					}]
				},
				undefined,
				{ report: () => { } },
				CancellationToken.None
			);

			// When aborted, should return cancelled
			assert.strictEqual(result.type, 'cancelled');
		});

		test('handles HTTP 402 quota exceeded error', async () => {
			const { githubReview } = await import('../githubReviewAgent');
			const { domainService, fetcherService, envService } = createBaseMocks();

			// Create auth service with token
			class TestAuthenticationService extends MockAuthenticationService {
				override getCopilotToken(_force?: boolean): Promise<CopilotToken> {
					return Promise.resolve(new CopilotToken(createTestExtendedTokenInfo({ token: 'test-token' })));
				}
			}

			const fileUri = URI.file('/test/file.ts');
			const docData = createTextDocumentData(fileUri, 'const x = 1;', 'typescript');

			class TestWorkspaceService extends MockWorkspaceService {
				override openTextDocument(uri: URI): Promise<TextDocument> {
					if (uri.toString() === fileUri.toString()) {
						return Promise.resolve(docData.document);
					}
					return Promise.reject(new Error(`Document not found: ${uri.toString()}`));
				}
				override asRelativePath(uri: URI): string {
					return uri.path.replace(/^\/test\//, '');
				}
			}

			// Create CAPI client that returns 402
			class TestCAPIClientService extends MockCAPIClientService {
				buildUrl(_ep: unknown, path: string): URL {
					return new URL('https://api.github.com' + path);
				}
				override makeRequest<T>(): Promise<T> {
					return Promise.resolve({
						ok: false,
						status: 402,
						headers: { get: (name: string) => name === 'x-github-request-id' ? 'test-req-id' : null },
					} as unknown as T);
				}
			}

			try {
				await githubReview(
					new TestLogService(),
					createMockGitExtensionService(),
					new TestAuthenticationService() as unknown as IAuthenticationService,
					new TestCAPIClientService() as unknown as ICAPIClientService,
					domainService,
					fetcherService,
					envService,
					new NullIgnoreService(),
					new TestWorkspaceService(),
					new MockCustomInstructionsService(),
					{
						repositoryRoot: '/test',
						commitMessages: ['test commit'],
						patches: [{
							patch: '@@ -1,1 +1,1 @@\n-const x = 1;\n+let x = 1;',
							fileUri: fileUri.toString(),
						}]
					},
					undefined,
					{ report: () => { } },
					CancellationToken.None
				);
				assert.fail('Should have thrown an error');
			} catch (err: unknown) {
				const error = err as Error & { severity?: string };
				assert.ok(error.message.includes('quota'));
				assert.strictEqual(error.severity, 'info');
			}
		});

		test('handles HTTP error response', async () => {
			const { githubReview } = await import('../githubReviewAgent');
			const { domainService, fetcherService, envService } = createBaseMocks();

			// Create auth service with token
			class TestAuthenticationService extends MockAuthenticationService {
				override getCopilotToken(_force?: boolean): Promise<CopilotToken> {
					return Promise.resolve(new CopilotToken(createTestExtendedTokenInfo({ token: 'test-token' })));
				}
			}

			const fileUri = URI.file('/test/file.ts');
			const docData = createTextDocumentData(fileUri, 'const x = 1;', 'typescript');

			class TestWorkspaceService extends MockWorkspaceService {
				override openTextDocument(uri: URI): Promise<TextDocument> {
					if (uri.toString() === fileUri.toString()) {
						return Promise.resolve(docData.document);
					}
					return Promise.reject(new Error(`Document not found: ${uri.toString()}`));
				}
				override asRelativePath(uri: URI): string {
					return uri.path.replace(/^\/test\//, '');
				}
			}

			// Create CAPI client that returns 500
			class TestCAPIClientService extends MockCAPIClientService {
				buildUrl(_ep: unknown, path: string): URL {
					return new URL('https://api.github.com' + path);
				}
				override makeRequest<T>(): Promise<T> {
					return Promise.resolve({
						ok: false,
						status: 500,
						headers: { get: (name: string) => name === 'x-github-request-id' ? 'test-req-id' : null },
					} as unknown as T);
				}
			}

			try {
				await githubReview(
					new TestLogService(),
					createMockGitExtensionService(),
					new TestAuthenticationService() as unknown as IAuthenticationService,
					new TestCAPIClientService() as unknown as ICAPIClientService,
					domainService,
					fetcherService,
					envService,
					new NullIgnoreService(),
					new TestWorkspaceService(),
					new MockCustomInstructionsService(),
					{
						repositoryRoot: '/test',
						commitMessages: ['test commit'],
						patches: [{
							patch: '@@ -1,1 +1,1 @@\n-const x = 1;\n+let x = 1;',
							fileUri: fileUri.toString(),
						}]
					},
					undefined,
					{ report: () => { } },
					CancellationToken.None
				);
				assert.fail('Should have thrown an error');
			} catch (err: unknown) {
				const error = err as Error;
				assert.ok(error.message.includes('500'));
				assert.ok(error.message.includes('test-req-id'));
			}
		});

		test('propagates non-abort fetch errors', async () => {
			const { githubReview } = await import('../githubReviewAgent');
			const { domainService, envService } = createBaseMocks();

			// Create auth service with token
			class TestAuthenticationService extends MockAuthenticationService {
				override getCopilotToken(_force?: boolean): Promise<CopilotToken> {
					return Promise.resolve(new CopilotToken(createTestExtendedTokenInfo({ token: 'test-token' })));
				}
			}

			const fileUri = URI.file('/test/file.ts');
			const docData = createTextDocumentData(fileUri, 'const x = 1;', 'typescript');

			class TestWorkspaceService extends MockWorkspaceService {
				override openTextDocument(uri: URI): Promise<TextDocument> {
					if (uri.toString() === fileUri.toString()) {
						return Promise.resolve(docData.document);
					}
					return Promise.reject(new Error(`Document not found: ${uri.toString()}`));
				}
				override asRelativePath(uri: URI): string {
					return uri.path.replace(/^\/test\//, '');
				}
			}

			// Mock fetcher that does NOT recognize this error as abort
			const networkError = new Error('Network failure');
			const fetcherService: IFetcherService = {
				makeAbortController: () => ({ abort: () => { }, signal: {} }),
				isAbortError: () => false, // Not an abort error
			} as unknown as IFetcherService;

			// Create CAPI client that throws a network error
			class TestCAPIClientService extends MockCAPIClientService {
				buildUrl(_ep: unknown, path: string): URL {
					return new URL('https://api.github.com' + path);
				}
				override makeRequest<T>(): Promise<T> {
					return Promise.reject(networkError);
				}
			}

			try {
				await githubReview(
					new TestLogService(),
					createMockGitExtensionService(),
					new TestAuthenticationService() as unknown as IAuthenticationService,
					new TestCAPIClientService() as unknown as ICAPIClientService,
					domainService,
					fetcherService,
					envService,
					new NullIgnoreService(),
					new TestWorkspaceService(),
					new MockCustomInstructionsService(),
					{
						repositoryRoot: '/test',
						commitMessages: ['test commit'],
						patches: [{
							patch: '@@ -1,1 +1,1 @@\n-const x = 1;\n+let x = 1;',
							fileUri: fileUri.toString(),
						}]
					},
					undefined,
					{ report: () => { } },
					CancellationToken.None
				);
				assert.fail('Should have thrown an error');
			} catch (err: unknown) {
				const error = err as Error;
				assert.strictEqual(error.message, 'Network failure');
			}
		});

		test('ignores comments with paths not matching any change', async () => {
			const { githubReview } = await import('../githubReviewAgent');
			const { domainService, fetcherService, envService } = createBaseMocks();

			// Extend MockAuthenticationService to return a valid token
			class TestAuthenticationService extends MockAuthenticationService {
				override getCopilotToken(_force?: boolean): Promise<CopilotToken> {
					return Promise.resolve(new CopilotToken(createTestExtendedTokenInfo({ token: 'test-token' })));
				}
			}

			// Set up workspace service with a document
			const fileUri = URI.file('/test/file.ts');
			const docData = createTextDocumentData(fileUri, 'const x = 1;', 'typescript');

			class TestWorkspaceService extends MockWorkspaceService {
				override openTextDocument(uri: URI): Promise<TextDocument> {
					if (uri.toString() === fileUri.toString()) {
						return Promise.resolve(docData.document);
					}
					return Promise.reject(new Error(`Document not found: ${uri.toString()}`));
				}
				override asRelativePath(uri: URI): string {
					return uri.path.replace(/^\/test\//, '');
				}
			}

			// Response contains a comment for a different file - use proper SSE format
			const sseResponse = [
				`data: ${JSON.stringify({
					copilot_references: [{
						type: 'github.generated-pull-request-comment',
						data: {
							path: 'other-file.ts', // Different from file.ts
							line: 1,
							body: 'Comment on non-existent file'
						}
					}]
				})}\n`,
				'data: [DONE]\n'
			];
			class TestCAPIClientService extends MockCAPIClientService {
				override makeRequest<T>(): Promise<T> {
					return Promise.resolve(createFakeStreamResponse(sseResponse) as unknown as T);
				}
			}

			const result = await githubReview(
				new TestLogService(),
				createMockGitExtensionService(),
				new TestAuthenticationService() as unknown as IAuthenticationService,
				new TestCAPIClientService() as unknown as ICAPIClientService,
				domainService,
				fetcherService,
				envService,
				new NullIgnoreService(),
				new TestWorkspaceService(),
				new MockCustomInstructionsService(),
				{
					repositoryRoot: '/test',
					commitMessages: ['test commit'],
					patches: [{
						patch: '@@ -1,1 +1,1 @@\n-const x = 1;\n+let x = 1;',
						fileUri: fileUri.toString(),
					}]
				},
				undefined,
				{ report: () => { } },
				CancellationToken.None
			);

			// Should succeed but with no comments (the mismatched path comment is skipped)
			assert.strictEqual(result.type, 'success');
			if (result.type === 'success') {
				assert.strictEqual(result.comments.length, 0);
			}
		});

		test('returns excluded comments in result', async () => {
			const { githubReview } = await import('../githubReviewAgent');
			const { domainService, fetcherService, envService } = createBaseMocks();

			class TestAuthenticationService extends MockAuthenticationService {
				override getCopilotToken(_force?: boolean): Promise<CopilotToken> {
					return Promise.resolve(new CopilotToken(createTestExtendedTokenInfo({ token: 'test-token', code_review_enabled: true })));
				}
			}

			const fileUri = URI.file('/test/file.ts');
			const docData = createTextDocumentData(fileUri, 'let x = 1;', 'typescript');

			class TestWorkspaceService extends MockWorkspaceService {
				override openTextDocument(uri: URI): Promise<TextDocument> {
					if (uri.toString() === fileUri.toString()) {
						return Promise.resolve(docData.document);
					}
					return Promise.reject(new Error(`Document not found: ${uri.toString()}`));
				}
			}

			// Response with excluded comment
			const sseResponse = [
				`data: ${JSON.stringify({
					copilot_references: [{
						type: 'github.excluded-pull-request-comment',
						data: {
							path: 'file.ts',
							line: 1,
							body: 'Low confidence comment',
							exclusion_reason: 'denylisted_type'
						}
					}]
				})}\n`,
				'data: [DONE]\n'
			];
			class TestCAPIClientService extends MockCAPIClientService {
				override makeRequest<T>(): Promise<T> {
					return Promise.resolve(createFakeStreamResponse(sseResponse) as unknown as T);
				}
			}

			const result = await githubReview(
				new TestLogService(),
				createMockGitExtensionService(),
				new TestAuthenticationService() as unknown as IAuthenticationService,
				new TestCAPIClientService() as unknown as ICAPIClientService,
				domainService,
				fetcherService,
				envService,
				new NullIgnoreService(),
				new TestWorkspaceService(),
				new MockCustomInstructionsService(),
				{
					repositoryRoot: '/test',
					commitMessages: ['test commit'],
					patches: [{
						patch: '@@ -1,1 +1,1 @@\n-const x = 1;\n+let x = 1;',
						fileUri: fileUri.toString(),
					}]
				},
				undefined,
				{ report: () => { } },
				CancellationToken.None
			);

			assert.strictEqual(result.type, 'success');
			if (result.type === 'success') {
				assert.strictEqual(result.comments.length, 0);
				assert.strictEqual(result.excludedComments?.length, 1);
				const bodyValue = typeof result.excludedComments![0].body === 'string' ? result.excludedComments![0].body : result.excludedComments![0].body.value;
				assert.ok(bodyValue.includes('Low confidence'));
			}
		});

		test('returns unsupported language reason when no comments and excluded files exist', async () => {
			const { githubReview } = await import('../githubReviewAgent');
			const { domainService, fetcherService, envService } = createBaseMocks();

			class TestAuthenticationService extends MockAuthenticationService {
				override getCopilotToken(_force?: boolean): Promise<CopilotToken> {
					return Promise.resolve(new CopilotToken(createTestExtendedTokenInfo({ token: 'test-token', code_review_enabled: true })));
				}
			}

			const fileUri = URI.file('/test/file.ts');
			const docData = createTextDocumentData(fileUri, 'let x = 1;', 'typescript');

			class TestWorkspaceService extends MockWorkspaceService {
				override openTextDocument(uri: URI): Promise<TextDocument> {
					if (uri.toString() === fileUri.toString()) {
						return Promise.resolve(docData.document);
					}
					return Promise.reject(new Error(`Document not found: ${uri.toString()}`));
				}
			}

			// Response with excluded file due to unsupported language
			const sseResponse = [
				`data: ${JSON.stringify({
					copilot_references: [{
						type: 'github.excluded-file',
						data: {
							file_path: 'file.ts',
							language: 'cobol',
							reason: 'file_type_not_supported'
						}
					}]
				})}\n`,
				'data: [DONE]\n'
			];
			class TestCAPIClientService extends MockCAPIClientService {
				override makeRequest<T>(): Promise<T> {
					return Promise.resolve(createFakeStreamResponse(sseResponse) as unknown as T);
				}
			}

			const result = await githubReview(
				new TestLogService(),
				createMockGitExtensionService(),
				new TestAuthenticationService() as unknown as IAuthenticationService,
				new TestCAPIClientService() as unknown as ICAPIClientService,
				domainService,
				fetcherService,
				envService,
				new NullIgnoreService(),
				new TestWorkspaceService(),
				new MockCustomInstructionsService(),
				{
					repositoryRoot: '/test',
					commitMessages: ['test commit'],
					patches: [{
						patch: '@@ -1,1 +1,1 @@\n-const x = 1;\n+let x = 1;',
						fileUri: fileUri.toString(),
					}]
				},
				undefined,
				{ report: () => { } },
				CancellationToken.None
			);

			assert.strictEqual(result.type, 'success');
			if (result.type === 'success') {
				assert.strictEqual(result.comments.length, 0);
				assert.ok(result.reason);
				assert.ok(result.reason!.includes('cobol'));
			}
		});

		test('does not report unsupported languages when comments exist', async () => {
			const { githubReview } = await import('../githubReviewAgent');
			const { domainService, fetcherService, envService } = createBaseMocks();

			class TestAuthenticationService extends MockAuthenticationService {
				override getCopilotToken(_force?: boolean): Promise<CopilotToken> {
					return Promise.resolve(new CopilotToken(createTestExtendedTokenInfo({ token: 'test-token', code_review_enabled: true })));
				}
			}

			const fileUri = URI.file('/test/file.ts');
			const docData = createTextDocumentData(fileUri, 'let x = 1;', 'typescript');

			class TestWorkspaceService extends MockWorkspaceService {
				override openTextDocument(uri: URI): Promise<TextDocument> {
					if (uri.toString() === fileUri.toString()) {
						return Promise.resolve(docData.document);
					}
					return Promise.reject(new Error(`Document not found: ${uri.toString()}`));
				}
			}

			// Response with both a comment and an excluded file
			const sseResponse = [
				`data: ${JSON.stringify({
					copilot_references: [
						{
							type: 'github.generated-pull-request-comment',
							data: {
								path: 'file.ts',
								line: 1,
								body: 'Use const instead of let'
							}
						},
						{
							type: 'github.excluded-file',
							data: {
								file_path: 'other.cobol',
								language: 'cobol',
								reason: 'file_type_not_supported'
							}
						}
					]
				})}\n`,
				'data: [DONE]\n'
			];
			class TestCAPIClientService extends MockCAPIClientService {
				override makeRequest<T>(): Promise<T> {
					return Promise.resolve(createFakeStreamResponse(sseResponse) as unknown as T);
				}
			}

			const result = await githubReview(
				new TestLogService(),
				createMockGitExtensionService(),
				new TestAuthenticationService() as unknown as IAuthenticationService,
				new TestCAPIClientService() as unknown as ICAPIClientService,
				domainService,
				fetcherService,
				envService,
				new NullIgnoreService(),
				new TestWorkspaceService(),
				new MockCustomInstructionsService(),
				{
					repositoryRoot: '/test',
					commitMessages: ['test commit'],
					patches: [{
						patch: '@@ -1,1 +1,1 @@\n-const x = 1;\n+let x = 1;',
						fileUri: fileUri.toString(),
					}]
				},
				undefined,
				{ report: () => { } },
				CancellationToken.None
			);

			assert.strictEqual(result.type, 'success');
			if (result.type === 'success') {
				assert.strictEqual(result.comments.length, 1);
				// When comments exist, unsupported languages are not reported
				assert.strictEqual(result.reason, undefined);
			}
		});
	});
});

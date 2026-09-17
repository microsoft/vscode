/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { describe, suite, test } from 'vitest';
import { TextDocumentSnapshot } from '../../../../platform/editing/common/textDocumentSnapshot';
import { toCodeReviewResult } from '../../../../platform/review/common/reviewCommand';
import { ReviewComment, ReviewSuggestion } from '../../../../platform/review/common/reviewService';
import { createTextDocumentData } from '../../../../util/common/test/shims/textDocument';
import { URI } from '../../../../util/vs/base/common/uri';
import { Range } from '../../../../vscodeTypes';

function createMockDocument(uri = URI.file('/test.ts'), content = 'test content') {
	return TextDocumentSnapshot.create(createTextDocumentData(uri, content, 'typescript').document);
}

function createTestComment(overrides: Partial<ReviewComment> = {}): ReviewComment {
	return {
		request: {
			source: 'githubReviewAgent',
			promptCount: -1,
			messageId: 'test-id',
			inputType: 'change',
			inputRanges: [],
		},
		document: createMockDocument(),
		uri: URI.file('/test.ts'),
		languageId: 'typescript',
		range: new Range(0, 0, 0, 10),
		body: 'Test comment body',
		kind: 'bug',
		severity: 'medium',
		originalIndex: 0,
		actionCount: 0,
		...overrides,
	};
}

suite('reviewCommand', () => {

	describe('toCodeReviewResult', () => {

		test('maps empty comments array to empty result', async () => {
			const result = await toCodeReviewResult([]);

			assert.strictEqual(result.type, 'success');
			assert.ok(result.type === 'success');
			assert.strictEqual(result.comments.length, 0);
		});

		test('maps string body correctly', async () => {
			const comment = createTestComment({ body: 'plain text body' });

			const result = await toCodeReviewResult([comment]);

			assert.ok(result.type === 'success');
			assert.strictEqual(result.comments.length, 1);
			assert.strictEqual(result.comments[0].body, 'plain text body');
		});

		test('maps MarkdownString body to its value', async () => {
			const { MarkdownString } = await import('../../../../vscodeTypes');
			const comment = createTestComment({ body: new MarkdownString('**bold** text') });

			const result = await toCodeReviewResult([comment]);

			assert.ok(result.type === 'success');
			assert.strictEqual(result.comments[0].body, '**bold** text');
		});

		test('preserves uri, range, kind, severity', async () => {
			const uri = URI.file('/foo/bar.ts');
			const range = new Range(5, 2, 5, 20);
			const comment = createTestComment({ uri, range, kind: 'style', severity: 'high' });

			const result = await toCodeReviewResult([comment]);

			assert.ok(result.type === 'success');
			const c = result.comments[0];
			assert.strictEqual(c.uri.toString(), uri.toString());
			assert.strictEqual(c.range.start.line, 5);
			assert.strictEqual(c.range.start.character, 2);
			assert.strictEqual(c.kind, 'style');
			assert.strictEqual(c.severity, 'high');
		});

		test('excludes internal fields like request, document, originalIndex, actionCount', async () => {
			const comment = createTestComment();

			const result = await toCodeReviewResult([comment]);

			assert.ok(result.type === 'success');
			const c = result.comments[0] as unknown as Record<string, unknown>;
			assert.strictEqual('request' in c, false);
			assert.strictEqual('document' in c, false);
			assert.strictEqual('originalIndex' in c, false);
			assert.strictEqual('actionCount' in c, false);
			assert.strictEqual('languageId' in c, false);
		});

		test('maps sync suggestion with edits', async () => {
			const suggestion: ReviewSuggestion = {
				markdown: '',
				edits: [{
					range: new Range(1, 0, 2, 0),
					newText: 'fixed code\n',
					oldText: 'broken code\n',
				}],
			};
			const comment = createTestComment({ suggestion });

			const result = await toCodeReviewResult([comment]);

			assert.ok(result.type === 'success');
			const s = result.comments[0].suggestion;
			assert.ok(s);
			assert.strictEqual(s.edits.length, 1);
			assert.strictEqual(s.edits[0].newText, 'fixed code\n');
			assert.strictEqual(s.edits[0].oldText, 'broken code\n');
		});

		test('omits suggestion when edits array is empty', async () => {
			const suggestion: ReviewSuggestion = { markdown: '', edits: [] };
			const comment = createTestComment({ suggestion });

			const result = await toCodeReviewResult([comment]);

			assert.ok(result.type === 'success');
			assert.strictEqual(result.comments[0].suggestion, undefined);
		});

		test('omits suggestion when undefined', async () => {
			const comment = createTestComment({ suggestion: undefined });

			const result = await toCodeReviewResult([comment]);

			assert.ok(result.type === 'success');
			assert.strictEqual(result.comments[0].suggestion, undefined);
		});

		test('resolves promise-based suggestion', async () => {
			const suggestion: ReviewSuggestion = {
				markdown: '',
				edits: [{
					range: new Range(0, 0, 1, 0),
					newText: 'new\n',
					oldText: 'old\n',
				}],
			};
			const comment = createTestComment({ suggestion: Promise.resolve(suggestion) });

			const result = await toCodeReviewResult([comment]);

			assert.ok(result.type === 'success');
			const s = result.comments[0].suggestion;
			assert.ok(s);
			assert.strictEqual(s.edits[0].newText, 'new\n');
		});

		test('maps multiple comments', async () => {
			const comments = [
				createTestComment({ body: 'first', kind: 'bug' }),
				createTestComment({ body: 'second', kind: 'style', uri: URI.file('/other.ts') }),
			];

			const result = await toCodeReviewResult(comments);

			assert.ok(result.type === 'success');
			assert.strictEqual(result.comments.length, 2);
			assert.strictEqual(result.comments[0].body, 'first');
			assert.strictEqual(result.comments[1].body, 'second');
			assert.strictEqual(result.comments[1].kind, 'style');
		});
	});
});

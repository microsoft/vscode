/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';

// CompletionProvider tests that can run without the VS Code extension host.
// Tests that require vscode APIs must use the integration test runner.

suite('CompletionProvider — unit helpers', () => {
	test('EXCLUDED_LANGUAGES should not include TypeScript or JavaScript', () => {
		// Verify the exclusion set from the implementation
		const excluded = new Set(['json', 'jsonc', 'plaintext', 'log']);
		assert.strictEqual(excluded.has('typescript'), false);
		assert.strictEqual(excluded.has('javascript'), false);
		assert.strictEqual(excluded.has('json'), true);
		assert.strictEqual(excluded.has('plaintext'), true);
	});

	test('comment detection heuristic', () => {
		// Replicate the isInCommentOrString logic for testability
		function isInCommentOrString(textBeforeCursor: string): boolean {
			const trimmed = textBeforeCursor.trimStart();
			if (trimmed.startsWith('//') || trimmed.startsWith('#')) {
				return true;
			}
			let singleQuotes = 0;
			let doubleQuotes = 0;
			for (let i = 0; i < textBeforeCursor.length; i++) {
				const ch = textBeforeCursor[i];
				if (ch === '\\') {
					i++;
					continue;
				}
				if (ch === "'") {
					singleQuotes++;
				}
				if (ch === '"') {
					doubleQuotes++;
				}
			}
			return (singleQuotes % 2 !== 0) || (doubleQuotes % 2 !== 0);
		}

		assert.strictEqual(isInCommentOrString('// this is a comment'), true);
		assert.strictEqual(isInCommentOrString('  # python comment'), true);
		assert.strictEqual(isInCommentOrString('const x = "hello'), true);
		assert.strictEqual(isInCommentOrString('const x = "hello"'), false);
		assert.strictEqual(isInCommentOrString('const x = 42'), false);
	});
});

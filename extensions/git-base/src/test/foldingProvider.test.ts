/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import * as vscode from 'vscode';
import { GitCommitFoldingProvider } from '../foldingProvider';

suite('GitCommitFoldingProvider', () => {

	function createMockDocument(content: string): vscode.TextDocument {
		const lines = content.split('\n');
		return {
			lineCount: lines.length,
			lineAt: (index: number) => ({
				text: lines[index] || '',
				lineNumber: index
			}),
		} as vscode.TextDocument;
	}

	const mockContext: vscode.FoldingContext = {} as vscode.FoldingContext;
	const mockToken: vscode.CancellationToken = { isCancellationRequested: false } as vscode.CancellationToken;

	test('empty document returns no folding ranges', () => {
		const provider = new GitCommitFoldingProvider();
		const doc = createMockDocument('');
		const ranges = provider.provideFoldingRanges(doc, mockContext, mockToken);

		assert.strictEqual(Array.isArray(ranges) ? ranges.length : 0, 0);
	});

	test('single line document returns no folding ranges', () => {
		const provider = new GitCommitFoldingProvider();
		const doc = createMockDocument('commit message');
		const ranges = provider.provideFoldingRanges(doc, mockContext, mockToken);

		assert.strictEqual(Array.isArray(ranges) ? ranges.length : 0, 0);
	});

	test('single comment line returns no folding ranges', () => {
		const provider = new GitCommitFoldingProvider();
		const doc = createMockDocument('# Comment');
		const ranges = provider.provideFoldingRanges(doc, mockContext, mockToken);

		assert.strictEqual(Array.isArray(ranges) ? ranges.length : 0, 0);
	});

	test('two comment lines create one folding range', () => {
		const provider = new GitCommitFoldingProvider();
		const content = '# Comment 1\n# Comment 2';
		const doc = createMockDocument(content);
		const ranges = provider.provideFoldingRanges(doc, mockContext, mockToken) as vscode.FoldingRange[];

		assert.strictEqual(ranges.length, 1);
		assert.strictEqual(ranges[0].start, 0);
		assert.strictEqual(ranges[0].end, 1);
		assert.strictEqual(ranges[0].kind, vscode.FoldingRangeKind.Comment);
	});

	test('multiple comment lines create one folding range', () => {
		const provider = new GitCommitFoldingProvider();
		const content = '# Comment 1\n# Comment 2\n# Comment 3\n# Comment 4';
		const doc = createMockDocument(content);
		const ranges = provider.provideFoldingRanges(doc, mockContext, mockToken) as vscode.FoldingRange[];

		assert.strictEqual(ranges.length, 1);
		assert.strictEqual(ranges[0].start, 0);
		assert.strictEqual(ranges[0].end, 3);
		assert.strictEqual(ranges[0].kind, vscode.FoldingRangeKind.Comment);
	});

	test('comment block followed by content', () => {
		const provider = new GitCommitFoldingProvider();
		const content = '# Comment 1\n# Comment 2\nCommit message';
		const doc = createMockDocument(content);
		const ranges = provider.provideFoldingRanges(doc, mockContext, mockToken) as vscode.FoldingRange[];

		assert.strictEqual(ranges.length, 1);
		assert.strictEqual(ranges[0].start, 0);
		assert.strictEqual(ranges[0].end, 1);
		assert.strictEqual(ranges[0].kind, vscode.FoldingRangeKind.Comment);
	});

	test('comment block at end of document', () => {
		const provider = new GitCommitFoldingProvider();
		const content = 'Commit message\n\n# Comment 1\n# Comment 2';
		const doc = createMockDocument(content);
		const ranges = provider.provideFoldingRanges(doc, mockContext, mockToken) as vscode.FoldingRange[];

		assert.strictEqual(ranges.length, 1);
		assert.strictEqual(ranges[0].start, 2);
		assert.strictEqual(ranges[0].end, 3);
		assert.strictEqual(ranges[0].kind, vscode.FoldingRangeKind.Comment);
	});

	test('multiple separated comment blocks', () => {
		const provider = new GitCommitFoldingProvider();
		const content = '# Comment 1\n# Comment 2\n\nCommit message\n\n# Comment 3\n# Comment 4';
		const doc = createMockDocument(content);
		const ranges = provider.provideFoldingRanges(doc, mockContext, mockToken) as vscode.FoldingRange[];

		assert.strictEqual(ranges.length, 2);
		assert.strictEqual(ranges[0].start, 0);
		assert.strictEqual(ranges[0].end, 1);
		assert.strictEqual(ranges[0].kind, vscode.FoldingRangeKind.Comment);
		assert.strictEqual(ranges[1].start, 5);
		assert.strictEqual(ranges[1].end, 6);
		assert.strictEqual(ranges[1].kind, vscode.FoldingRangeKind.Comment);
	});

	test('single diff line returns no folding ranges', () => {
		const provider = new GitCommitFoldingProvider();
		const doc = createMockDocument('diff --git a/file.txt b/file.txt');
		const ranges = provider.provideFoldingRanges(doc, mockContext, mockToken);

		assert.strictEqual(Array.isArray(ranges) ? ranges.length : 0, 0);
	});

	test('diff block with content creates folding range', () => {
		const provider = new GitCommitFoldingProvider();
		const content = 'diff --git a/file.txt b/file.txt\nindex 1234..5678\n--- a/file.txt\n+++ b/file.txt';
		const doc = createMockDocument(content);
		const ranges = provider.provideFoldingRanges(doc, mockContext, mockToken) as vscode.FoldingRange[];

		assert.strictEqual(ranges.length, 1);
		assert.strictEqual(ranges[0].start, 0);
		assert.strictEqual(ranges[0].end, 3);
		assert.strictEqual(ranges[0].kind, undefined); // Diff blocks don't have a specific kind
	});

	test('multiple diff blocks', () => {
		const provider = new GitCommitFoldingProvider();
		const content = [
			'diff --git a/file1.txt b/file1.txt',
			'--- a/file1.txt',
			'+++ b/file1.txt',
			'diff --git a/file2.txt b/file2.txt',
			'--- a/file2.txt',
			'+++ b/file2.txt'
		].join('\n');
		const doc = createMockDocument(content);
		const ranges = provider.provideFoldingRanges(doc, mockContext, mockToken) as vscode.FoldingRange[];

		assert.strictEqual(ranges.length, 2);
		assert.strictEqual(ranges[0].start, 0);
		assert.strictEqual(ranges[0].end, 2);
		assert.strictEqual(ranges[1].start, 3);
		assert.strictEqual(ranges[1].end, 5);
	});

	test('diff block at end of document', () => {
		const provider = new GitCommitFoldingProvider();
		const content = [
			'Commit message',
			'',
			'diff --git a/file.txt b/file.txt',
			'--- a/file.txt',
			'+++ b/file.txt'
		].join('\n');
		const doc = createMockDocument(content);
		const ranges = provider.provideFoldingRanges(doc, mockContext, mockToken) as vscode.FoldingRange[];

		assert.strictEqual(ranges.length, 1);
		assert.strictEqual(ranges[0].start, 2);
		assert.strictEqual(ranges[0].end, 4);
	});

	test('realistic git commit message with comments and verbose diff', () => {
		const provider = new GitCommitFoldingProvider();
		const content = [
			'Add folding support for git commit messages',
			'',
			'# Please enter the commit message for your changes. Lines starting',
			'# with \'#\' will be ignored, and an empty message aborts the commit.',
			'#',
			'# On branch main',
			'# Changes to be committed:',
			'#\tmodified:   extension.ts',
			'#\tnew file:   foldingProvider.ts',
			'#',
			'# ------------------------ >8 ------------------------',
			'# Do not modify or remove the line above.',
			'# Everything below it will be ignored.',
			'diff --git a/extensions/git-base/src/extension.ts b/extensions/git-base/src/extension.ts',
			'index 17ffb89..453d8f7 100644',
			'--- a/extensions/git-base/src/extension.ts',
			'+++ b/extensions/git-base/src/extension.ts',
			'@@ -3,14 +3,20 @@',
			' *  Licensed under the MIT License.',
			'-import { ExtensionContext } from \'vscode\';',
			'+import { ExtensionContext, languages } from \'vscode\';',
			'diff --git a/extensions/git-base/src/foldingProvider.ts b/extensions/git-base/src/foldingProvider.ts',
			'new file mode 100644',
			'index 0000000..2c4a9c3',
			'--- /dev/null',
			'+++ b/extensions/git-base/src/foldingProvider.ts'
		].join('\n');
		const doc = createMockDocument(content);
		const ranges = provider.provideFoldingRanges(doc, mockContext, mockToken) as vscode.FoldingRange[];

		// Should have one comment block and two diff blocks
		assert.strictEqual(ranges.length, 3);

		// Comment block (lines 2-12)
		assert.strictEqual(ranges[0].start, 2);
		assert.strictEqual(ranges[0].end, 12);
		assert.strictEqual(ranges[0].kind, vscode.FoldingRangeKind.Comment);

		// First diff block (lines 13-20)
		assert.strictEqual(ranges[1].start, 13);
		assert.strictEqual(ranges[1].end, 20);
		assert.strictEqual(ranges[1].kind, undefined);

		// Second diff block (lines 21-25)
		assert.strictEqual(ranges[2].start, 21);
		assert.strictEqual(ranges[2].end, 25);
		assert.strictEqual(ranges[2].kind, undefined);
	});

	test('mixed comment and diff content', () => {
		const provider = new GitCommitFoldingProvider();
		const content = [
			'Fix bug in parser',
			'',
			'# Comment 1',
			'# Comment 2',
			'',
			'diff --git a/file.txt b/file.txt',
			'--- a/file.txt',
			'+++ b/file.txt',
			'',
			'# Comment 3',
			'# Comment 4'
		].join('\n');
		const doc = createMockDocument(content);
		const ranges = provider.provideFoldingRanges(doc, mockContext, mockToken) as vscode.FoldingRange[];

		assert.strictEqual(ranges.length, 3);

		// First comment block
		assert.strictEqual(ranges[0].start, 2);
		assert.strictEqual(ranges[0].end, 3);
		assert.strictEqual(ranges[0].kind, vscode.FoldingRangeKind.Comment);

		// Diff block
		assert.strictEqual(ranges[1].start, 5);
		assert.strictEqual(ranges[1].end, 7);
		assert.strictEqual(ranges[1].kind, undefined);

		// Second comment block
		assert.strictEqual(ranges[2].start, 9);
		assert.strictEqual(ranges[2].end, 10);
		assert.strictEqual(ranges[2].kind, vscode.FoldingRangeKind.Comment);
	});

	test('comment lines not starting with # are not folded', () => {
		const provider = new GitCommitFoldingProvider();
		const content = '# Comment\n## Not a git comment\n# Another comment';
		const doc = createMockDocument(content);
		const ranges = provider.provideFoldingRanges(doc, mockContext, mockToken) as vscode.FoldingRange[];

		// The middle line breaks the comment block, so we should get 0 ranges
		// (single-line blocks at start and end are not created)
		assert.strictEqual(ranges.length, 0);
	});

	test('diff-like lines that dont start with "diff --git" are not folded', () => {
		const provider = new GitCommitFoldingProvider();
		const content = 'diff between files\ndiff --git a/file.txt b/file.txt\n--- a/file.txt';
		const doc = createMockDocument(content);
		const ranges = provider.provideFoldingRanges(doc, mockContext, mockToken) as vscode.FoldingRange[];

		// Should only fold the actual diff block
		assert.strictEqual(ranges.length, 1);
		assert.strictEqual(ranges[0].start, 1);
		assert.strictEqual(ranges[0].end, 2);
	});

	test('trailing empty lines dont affect folding', () => {
		const provider = new GitCommitFoldingProvider();
		const content = '# Comment 1\n# Comment 2\n\n\n';
		const doc = createMockDocument(content);
		const ranges = provider.provideFoldingRanges(doc, mockContext, mockToken) as vscode.FoldingRange[];

		assert.strictEqual(ranges.length, 1);
		assert.strictEqual(ranges[0].start, 0);
		assert.strictEqual(ranges[0].end, 1);
		assert.strictEqual(ranges[0].kind, vscode.FoldingRangeKind.Comment);
	});

	test('leading empty lines dont affect folding', () => {
		const provider = new GitCommitFoldingProvider();
		const content = '\n\n# Comment 1\n# Comment 2';
		const doc = createMockDocument(content);
		const ranges = provider.provideFoldingRanges(doc, mockContext, mockToken) as vscode.FoldingRange[];

		assert.strictEqual(ranges.length, 1);
		assert.strictEqual(ranges[0].start, 2);
		assert.strictEqual(ranges[0].end, 3);
		assert.strictEqual(ranges[0].kind, vscode.FoldingRangeKind.Comment);
	});

	test('large document with many blocks', () => {
		const provider = new GitCommitFoldingProvider();
		const lines: string[] = ['Initial commit message', ''];

		// Add 10 comment blocks
		for (let i = 0; i < 10; i++) {
			lines.push(`# Comment block ${i} line 1`);
			lines.push(`# Comment block ${i} line 2`);
			lines.push('');
		}

		// Add 10 diff blocks
		for (let i = 0; i < 10; i++) {
			lines.push(`diff --git a/file${i}.txt b/file${i}.txt`);
			lines.push(`--- a/file${i}.txt`);
			lines.push(`+++ b/file${i}.txt`);
			if (i < 9) {
				lines.push('');
			}
		}

		const content = lines.join('\n');
		const doc = createMockDocument(content);
		const ranges = provider.provideFoldingRanges(doc, mockContext, mockToken) as vscode.FoldingRange[];

		// Should have 10 comment blocks + 10 diff blocks = 20 ranges
		assert.strictEqual(ranges.length, 20);

		// Verify first comment block
		assert.strictEqual(ranges[0].start, 2);
		assert.strictEqual(ranges[0].end, 3);
		assert.strictEqual(ranges[0].kind, vscode.FoldingRangeKind.Comment);

		// Verify first diff block starts after all comments
		const firstDiffIndex = 10; // After 10 comment blocks
		assert.strictEqual(ranges[firstDiffIndex].kind, undefined);
	});
});

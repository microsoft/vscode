/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it } from 'vitest';
import { DocumentId } from '../../../../platform/inlineEdits/common/dataTypes/documentId';
import { NoNextEditReason, StreamedEdit } from '../../../../platform/inlineEdits/common/statelessNextEditProvider';
import { TestLogService } from '../../../../platform/testing/common/testLogService';
import { AsyncIterUtils } from '../../../../util/common/asyncIterableUtils';
import { AsyncIterableSource } from '../../../../util/vs/base/common/async';
import { LineReplacement } from '../../../../util/vs/editor/common/core/edits/lineEdit';
import { Position } from '../../../../util/vs/editor/common/core/position';
import { StringText } from '../../../../util/vs/editor/common/core/text/abstractText';
import { ensureDependenciesAreSet } from '../../../../util/vs/editor/common/core/text/positionToOffset';
import { FetchStreamError } from '../../common/fetchStreamError';
import { CurrentDocument } from '../../common/xtabCurrentDocument';
import { tryRemoveDuplicateAdditions, XtabCustomDiffPatchResponseHandler } from '../../node/xtabCustomDiffPatchResponseHandler';

async function consumeHandleResponse(
	...args: Parameters<typeof XtabCustomDiffPatchResponseHandler.handleResponse>
): Promise<{ edits: StreamedEdit[]; returnValue: NoNextEditReason }> {
	const gen = XtabCustomDiffPatchResponseHandler.handleResponse(...args);
	const edits: StreamedEdit[] = [];
	for (; ;) {
		const result = await gen.next();
		if (result.done) {
			return { edits, returnValue: result.value };
		}
		edits.push(result.value);
	}
}

describe('XtabCustomDiffPatchResponseHandler', () => {

	beforeEach(() => {
		ensureDependenciesAreSet();
	});

	async function collectPatches(patchText: string): Promise<string> {
		const linesStream = AsyncIterUtils.fromArray(patchText.split('\n'));
		const patches = await AsyncIterUtils.toArray(XtabCustomDiffPatchResponseHandler.extractEdits(linesStream));
		return patches.map(p => p.toString()).join('\n');
	}

	it('should parse a simple patch correctly', async () => {
		const patchText = `file1.txt:10
-Old line 1
-Old line 2
+New line 1
+New line 2`;
		const patches = await collectPatches(patchText);
		expect(patches).toEqual(patchText);
	});

	it('should parse a simple patch correctly despite trailing newline', async () => {
		const patchText = `file1.txt:10
-Old line 1
-Old line 2
+New line 1
+New line 2
`;
		const patches = await collectPatches(patchText);
		expect(patches).toEqual(patchText.trim());
	});

	it('should parse a simple patch correctly', async () => {
		const patchText = `/absolutePath/to/my_file.ts:1
-Old line 1
+New line 1
+New line 2
relative/path/to/another_file.js:42
-Removed line
+Added line`;
		const patches = await collectPatches(patchText);
		expect(patches).toEqual(patchText);
	});

	it('discard a patch if no valid header', async () => {
		const patchText = `myFile.ts:
+New line 1
+New line 2
another_file.js:32
-Removed line
+Added line`;
		const patches = await collectPatches(patchText);
		expect(patches).toMatchInlineSnapshot(`
			"another_file.js:32
			-Removed line
			+Added line"
		`);
	});

	it('discard a patch if no valid header - 2', async () => {
		const patchText = `myFile.ts:42
+New line 1
+New line 2
another_file.js:
-Removed line
+Added line`;
		const patches = await collectPatches(patchText);
		expect(patches).toMatchInlineSnapshot(`
			"myFile.ts:42
			+New line 1
			+New line 2"
		`);
	});

	it('discard a patch has no removed lines', async () => {
		const patchText = `myFile.ts:42
+New line 1
+New line 2`;
		const patches = await collectPatches(patchText);
		expect(patches).toMatchInlineSnapshot(`
			"myFile.ts:42
			+New line 1
			+New line 2"
		`);
	});

	it('discard a patch has no new lines', async () => {
		const patchText = `myFile.ts:42
-Old line 1
-Old line 2`;
		const patches = await collectPatches(patchText);
		expect(patches).toMatchInlineSnapshot(`
			"myFile.ts:42
			-Old line 1
			-Old line 2"
		`);
	});

	it('no-op diff', async () => {
		const patchText = `myFile.ts:42
-Old line 1
+Old line 1`;
		const patches = await collectPatches(patchText);
		expect(patches).toMatchInlineSnapshot(`
			"myFile.ts:42
			-Old line 1
			+Old line 1"
		`);
	});

	it('stops yielding edits when stream rejects with FetchStreamError', async () => {
		const cancellationReason = new NoNextEditReason.GotCancelled('afterFetchCall');
		const docId = DocumentId.create('file:///file.ts');
		const documentBeforeEdits = new CurrentDocument(new StringText('old\n'), new Position(1, 1));

		// Emit the first patch completely, then reject with FetchStreamError
		async function* makeStream(): AsyncGenerator<string> {
			yield '/file.ts:0';
			yield '-old';
			yield '+new';
			yield '/file.ts:5';
			yield '-another old';
			yield '+another new';
			throw new FetchStreamError(cancellationReason);
		}

		const { edits, returnValue } = await consumeHandleResponse(
			makeStream(),
			documentBeforeEdits,
			docId,
			undefined,
			undefined,
			new TestLogService(),
		);

		expect(edits).toHaveLength(1);
		expect(returnValue).toEqual(cancellationReason);
	});

	it('returns FetchStreamError reason when stream rejects before any patches', async () => {
		const cancellationReason = new NoNextEditReason.GotCancelled('afterFetchCall');
		const docId = DocumentId.create('file:///file.ts');
		const documentBeforeEdits = new CurrentDocument(new StringText('old\n'), new Position(1, 1));

		const source = new AsyncIterableSource<string>();
		source.reject(new FetchStreamError(cancellationReason));

		const { edits, returnValue } = await consumeHandleResponse(
			source.asyncIterable,
			documentBeforeEdits,
			docId,
			undefined,
			undefined,
			new TestLogService(),
		);

		expect(edits).toHaveLength(0);
		expect(returnValue).toBe(cancellationReason);
	});

	describe('tryRemoveDuplicateAdditions', () => {

		it('removes a single trailing duplicate (closing brace case)', () => {
			// File:
			//   0: function foo() {
			//   1:     let x = 1;
			//   2: }
			//
			// Patch replaces line 1 and tries to add `let y = 2;` after it,
			// but mistakenly re-emits the closing brace.
			const fileLines = ['function foo() {', '    let x = 1;', '}'];
			const result = tryRemoveDuplicateAdditions(
				{
					addedLines: ['    let x = 1;', '    let y = 2;', '}'],
					removedLines: ['    let x = 1;'],
					lineNumZeroBased: 1,
				},
				fileLines,
			);
			expect(result?.kind).toBe('suffix');
			expect(result?.newAdditions).toEqual(['    let x = 1;', '    let y = 2;']);
			expect(result?.removedLines).toEqual(['}']);
		});

		it('removes a multi-line trailing duplicate', () => {
			const fileLines = ['a', 'b', 'c', 'd', 'e'];
			// Patch at line 1 replaces `b`. Additions repeat `b`, `c`, `d`.
			// `c`, `d` are the lines following the deletion and would be duplicated.
			const result = tryRemoveDuplicateAdditions(
				{
					addedLines: ['B', 'c', 'd'],
					removedLines: ['b'],
					lineNumZeroBased: 1,
				},
				fileLines,
			);
			expect(result?.kind).toBe('suffix');
			expect(result?.newAdditions).toEqual(['B']);
			expect(result?.removedLines).toEqual(['c', 'd']);
		});

		it('picks the longest suffix match', () => {
			// File: ['a', 'b', 'c'] following the patch.
			// Additions end with ['a', 'b', 'c'] — both k=1 and k=3 would match
			// (k=3 only because the whole following matches), but the longest
			// match wins to remove as much duplication as possible.
			const fileLines = ['x', 'a', 'b', 'c'];
			const result = tryRemoveDuplicateAdditions(
				{
					addedLines: ['new', 'a', 'b', 'c'],
					removedLines: [],
					lineNumZeroBased: 1,
				},
				fileLines,
			);
			expect(result?.kind).toBe('suffix');
			expect(result?.newAdditions).toEqual(['new']);
			expect(result?.removedLines).toEqual(['a', 'b', 'c']);
		});

		it('removes a leading duplicate when the line is meaningful', () => {
			// File:
			//   0: header
			//   1: existing line
			//   2: trailer
			//
			// Patch at line 1 with no removals tries to add `existing line`.
			const fileLines = ['header', 'existing line', 'trailer'];
			const result = tryRemoveDuplicateAdditions(
				{
					addedLines: ['existing line', 'extra'],
					removedLines: [],
					lineNumZeroBased: 1,
				},
				fileLines,
			);
			expect(result?.kind).toBe('prefix');
			expect(result?.newAdditions).toEqual(['extra']);
			expect(result?.removedLines).toEqual(['existing line']);
		});

		it('does not drop a single-character prefix (e.g. inner-scope `}`)', () => {
			// Model legitimately closes an inner scope with `}`, and the next
			// line happens to be the outer scope's `}`. This must NOT be
			// treated as a duplicate.
			const fileLines = ['function outer() {', '  inner();', '}', '}'];
			const result = tryRemoveDuplicateAdditions(
				{
					addedLines: ['}'],
					removedLines: [],
					lineNumZeroBased: 2,
				},
				fileLines,
			);
			expect(result).toBeUndefined();
		});

		it('does not drop a leading whitespace-only duplicate', () => {
			const fileLines = ['', '', 'existing'];
			const result = tryRemoveDuplicateAdditions(
				{
					addedLines: ['', 'first new line'],
					removedLines: [],
					lineNumZeroBased: 1,
				},
				fileLines,
			);
			expect(result).toBeUndefined();
		});

		it('removes streamEdits-style middle duplicate', () => {
			// additions partially copy continuation starting at offset 2.
			const fileLines = ['x', 'cont1 long', 'cont2 long', 'y'];
			const result = tryRemoveDuplicateAdditions(
				{
					addedLines: ['new1', 'new2', 'cont1 long', 'cont2 long', 'extra'],
					removedLines: [],
					lineNumZeroBased: 1,
				},
				fileLines,
			);
			expect(result?.kind).toBe('middle');
			expect(result?.newAdditions).toEqual(['new1', 'new2']);
			expect(result?.removedLines).toEqual(['cont1 long', 'cont2 long', 'extra']);
		});

		it('does not match a middle pair when the following lines are not meaningful', () => {
			// Two consecutive blank lines are too common to safely match on.
			const fileLines = ['x', '', '', 'y'];
			const result = tryRemoveDuplicateAdditions(
				{
					addedLines: ['new1', 'new2', '', '', 'extra'],
					removedLines: [],
					lineNumZeroBased: 1,
				},
				fileLines,
			);
			expect(result).toBeUndefined();
		});

		it('returns undefined when no duplicate is detected', () => {
			const fileLines = ['unrelated1', 'unrelated2'];
			const result = tryRemoveDuplicateAdditions(
				{
					addedLines: ['new1', 'new2'],
					removedLines: [],
					lineNumZeroBased: 0,
				},
				fileLines,
			);
			expect(result).toBeUndefined();
		});

		it('returns undefined when there are no following lines', () => {
			const fileLines = ['only line'];
			const result = tryRemoveDuplicateAdditions(
				{
					addedLines: ['new1'],
					removedLines: ['only line'],
					lineNumZeroBased: 0,
				},
				fileLines,
			);
			expect(result).toBeUndefined();
		});

		it('returns undefined when there are no additions', () => {
			const fileLines = ['a', 'b'];
			const result = tryRemoveDuplicateAdditions(
				{
					addedLines: [],
					removedLines: ['a'],
					lineNumZeroBased: 0,
				},
				fileLines,
			);
			expect(result).toBeUndefined();
		});

		it('handles patch at the very end of the file (no following lines)', () => {
			const fileLines = ['line0', 'line1'];
			// Replacing the last line with no extra following content.
			const result = tryRemoveDuplicateAdditions(
				{
					addedLines: ['new1'],
					removedLines: ['line1'],
					lineNumZeroBased: 1,
				},
				fileLines,
			);
			expect(result).toBeUndefined();
		});

		it('does not chain shapes — suffix match returns immediately without firing middle', () => {
			// Without single-shape semantics, the original implementation could
			// trim a suffix and then the (now shortened) additions would expose
			// a "middle" pair that incorrectly truncated even more lines.
			//
			// File: outer-scope code where '  }', '}' appear before nextLine.
			// Additions: real new code followed by '  }', '}', '  }', '}'.
			// The longest-matching suffix is k=2 (matches the 2-line following
			// `[' }', '}']`), so only those last 2 lines should be removed.
			const fileLines = ['  }', '}', 'nextLine'];
			const result = tryRemoveDuplicateAdditions(
				{
					addedLines: ['  newCode();', '  }', '}', '  }', '}'],
					removedLines: [],
					lineNumZeroBased: 0,
				},
				fileLines,
			);
			expect(result?.kind).toBe('suffix');
			expect(result?.newAdditions).toEqual(['  newCode();', '  }', '}']);
			expect(result?.removedLines).toEqual(['  }', '}']);
		});

		it('handles file without trailing newline', () => {
			// `splitLines('a\\nb\\nc')` returns ['a','b','c'] (no trailing empty).
			// The dedup must still work correctly against this shape.
			const fileLines = 'function foo() {\n    let x = 1;\n}'.split('\n');
			const result = tryRemoveDuplicateAdditions(
				{
					addedLines: ['    let x = 1;', '    let y = 2;', '}'],
					removedLines: ['    let x = 1;'],
					lineNumZeroBased: 1,
				},
				fileLines,
			);
			expect(result?.kind).toBe('suffix');
			expect(result?.newAdditions).toEqual(['    let x = 1;', '    let y = 2;']);
		});

		it('handles file with trailing newline (extra empty line at end)', () => {
			// `splitLines('a\\nb\\nc\\n')` returns ['a','b','c',''] — the trailing
			// empty string can become a "following" line and must not cause
			// false positives via the prefix/middle checks.
			const fileLines = 'function foo() {\n    let x = 1;\n}\n'.split('\n');
			const result = tryRemoveDuplicateAdditions(
				{
					addedLines: ['    let x = 1;', '    let y = 2;', '}'],
					removedLines: ['    let x = 1;'],
					lineNumZeroBased: 1,
				},
				fileLines,
			);
			expect(result?.kind).toBe('suffix');
			expect(result?.newAdditions).toEqual(['    let x = 1;', '    let y = 2;']);
		});

		it('returns undefined for an out-of-range lineNumZeroBased', () => {
			const fileLines = ['a', 'b'];
			const result = tryRemoveDuplicateAdditions(
				{
					addedLines: ['x'],
					removedLines: [],
					lineNumZeroBased: 100,
				},
				fileLines,
			);
			expect(result).toBeUndefined();
		});
	});

	describe('handleResponse with removeDuplicates', () => {

		it('strips trailing duplicate addition when enabled', async () => {
			const docId = DocumentId.create('file:///test.ts');
			const docContent = 'function foo() {\n    let x = 1;\n}\n';
			const documentBeforeEdits = new CurrentDocument(new StringText(docContent), new Position(2, 1));

			async function* makeStream(): AsyncGenerator<string> {
				yield '/test.ts:1';
				yield '-    let x = 1;';
				yield '+    let x = 1;';
				yield '+    let y = 2;';
				yield '+}';
			}

			const { edits } = await consumeHandleResponse(
				makeStream(),
				documentBeforeEdits,
				docId,
				undefined,
				undefined,
				new TestLogService(),
				/* removeDuplicates */ true,
			);

			expect(edits).toHaveLength(1);
			const lineReplacement = edits[0].edit as LineReplacement;
			expect(lineReplacement.newLines).toEqual(['    let x = 1;', '    let y = 2;']);
		});

		it('does not strip duplicates when flag is disabled (default)', async () => {
			const docId = DocumentId.create('file:///test.ts');
			const docContent = 'function foo() {\n    let x = 1;\n}\n';
			const documentBeforeEdits = new CurrentDocument(new StringText(docContent), new Position(2, 1));

			async function* makeStream(): AsyncGenerator<string> {
				yield '/test.ts:1';
				yield '-    let x = 1;';
				yield '+    let x = 1;';
				yield '+    let y = 2;';
				yield '+}';
			}

			const { edits } = await consumeHandleResponse(
				makeStream(),
				documentBeforeEdits,
				docId,
				undefined,
				undefined,
				new TestLogService(),
			);

			expect(edits).toHaveLength(1);
			const lineReplacement = edits[0].edit as LineReplacement;
			expect(lineReplacement.newLines).toEqual(['    let x = 1;', '    let y = 2;', '}']);
		});

		it('drops a patch that becomes empty after dedup and returns FilteredOut', async () => {
			const docId = DocumentId.create('file:///test.ts');
			const docContent = 'function foo() {\n    let x = 1;\n    let y = 2;\n}\n';
			const documentBeforeEdits = new CurrentDocument(new StringText(docContent), new Position(1, 1));

			// Patch adds 'let x = 1;' at line 1 with no removals — but that
			// line already exists at line 1 (prefix match against a meaningful line).
			async function* makeStream(): AsyncGenerator<string> {
				yield '/test.ts:1';
				yield '+    let x = 1;';
			}

			const { edits, returnValue } = await consumeHandleResponse(
				makeStream(),
				documentBeforeEdits,
				docId,
				undefined,
				undefined,
				new TestLogService(),
				/* removeDuplicates */ true,
			);

			expect(edits).toHaveLength(0);
			expect(returnValue).toBeInstanceOf(NoNextEditReason.FilteredOut);
		});

		it('returns NoSuggestions (not FilteredOut) when the model produces no edits at all', async () => {
			const docId = DocumentId.create('file:///test.ts');
			const documentBeforeEdits = new CurrentDocument(new StringText('a\nb\n'), new Position(1, 1));

			async function* makeStream(): AsyncGenerator<string> {
				// no patches
			}

			const { edits, returnValue } = await consumeHandleResponse(
				makeStream(),
				documentBeforeEdits,
				docId,
				undefined,
				undefined,
				new TestLogService(),
				/* removeDuplicates */ true,
			);

			expect(edits).toHaveLength(0);
			expect(returnValue).toBeInstanceOf(NoNextEditReason.NoSuggestions);
		});

		it('still returns NoSuggestions if at least one edit was yielded after dedup', async () => {
			const docId = DocumentId.create('file:///test.ts');
			const docContent = 'function foo() {\n    let x = 1;\n    let y = 2;\n}\n';
			const documentBeforeEdits = new CurrentDocument(new StringText(docContent), new Position(2, 1));

			async function* makeStream(): AsyncGenerator<string> {
				// First patch survives (no duplicate). Second patch adds a
				// meaningful prefix duplicate of an existing line — drops to no-op.
				yield '/test.ts:1';
				yield '-    let x = 1;';
				yield '+    let z = 99;';
				yield '/test.ts:2';
				yield '+    let y = 2;';
			}

			const { edits, returnValue } = await consumeHandleResponse(
				makeStream(),
				documentBeforeEdits,
				docId,
				undefined,
				undefined,
				new TestLogService(),
				/* removeDuplicates */ true,
			);

			expect(edits).toHaveLength(1);
			// Mixed: one yielded, one dropped — should still report NoSuggestions
			// since at least one edit was produced.
			expect(returnValue).toBeInstanceOf(NoNextEditReason.NoSuggestions);
		});

		it('skips dedup for non-active documents', async () => {
			const docId = DocumentId.create('file:///active.ts');
			const docContent = 'a\nb\nc\n';
			const documentBeforeEdits = new CurrentDocument(new StringText(docContent), new Position(1, 1));

			// Patch targets a different file; the active doc's content must
			// not be used to dedup against, so the patch should be yielded as-is.
			async function* makeStream(): AsyncGenerator<string> {
				yield '/other.ts:0';
				yield '-old';
				yield '+a';
				yield '+b';
			}

			const { edits } = await consumeHandleResponse(
				makeStream(),
				documentBeforeEdits,
				docId,
				undefined,
				undefined,
				new TestLogService(),
				/* removeDuplicates */ true,
			);

			expect(edits).toHaveLength(1);
			const lineReplacement = edits[0].edit as LineReplacement;
			expect(lineReplacement.newLines).toEqual(['a', 'b']);
		});
	});
});

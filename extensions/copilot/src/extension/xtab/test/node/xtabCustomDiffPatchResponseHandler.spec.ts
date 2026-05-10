/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it } from 'vitest';
import { DocumentId } from '../../../../platform/inlineEdits/common/dataTypes/documentId';
import { DuplicateAdditionsMode } from '../../../../platform/inlineEdits/common/dataTypes/xtabPromptOptions';
import { NoNextEditReason, StreamedEdit } from '../../../../platform/inlineEdits/common/statelessNextEditProvider';
import { TestLogService } from '../../../../platform/testing/common/testLogService';
import { AsyncIterUtils } from '../../../../util/common/asyncIterableUtils';
import { AsyncIterableSource } from '../../../../util/vs/base/common/async';
import { LineReplacement } from '../../../../util/vs/editor/common/core/edits/lineEdit';
import { Position } from '../../../../util/vs/editor/common/core/position';
import { LineRange } from '../../../../util/vs/editor/common/core/ranges/lineRange';
import { StringText } from '../../../../util/vs/editor/common/core/text/abstractText';
import { ensureDependenciesAreSet } from '../../../../util/vs/editor/common/core/text/positionToOffset';
import { FetchStreamError } from '../../common/fetchStreamError';
import { CurrentDocument } from '../../common/xtabCurrentDocument';
import { DuplicateAdditionRemoval, DuplicateAdditionRemovalSummary, OnDuplicateRemovedCallback, tryRemoveDuplicateAdditions, XtabCustomDiffPatchResponseHandler } from '../../node/xtabCustomDiffPatchResponseHandler';

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

/**
 * Adapts the legacy tuple-shaped patch input used in tests to the new
 * `LineReplacement` + `AbstractText` API surface of `tryRemoveDuplicateAdditions`.
 *
 * Builds a `StringText` from the file lines (joined with `\n`, no synthetic
 * trailing newline added) so `splitLines` round-trips back to the same array.
 */
function callDedup(
	patch: { addedLines: string[]; removedLines: string[]; lineNumZeroBased: number },
	fileLines: string[],
): DuplicateAdditionRemoval | undefined {
	const text = new StringText(fileLines.join('\n'));
	const replacement = new LineReplacement(
		new LineRange(patch.lineNumZeroBased + 1, patch.lineNumZeroBased + 1 + patch.removedLines.length),
		patch.addedLines,
	);
	return tryRemoveDuplicateAdditions(replacement, text);
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
			const result = callDedup(
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
			const result = callDedup(
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
			const result = callDedup(
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
			const result = callDedup(
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

		it('drops a duplicate inner `}` when the patch is purely additive (headline bug fix)', () => {
			// Headline bug case: file ends with a `}`, model emits an extra
			// `}` addition with no removals at the same line. Adding it would
			// produce two adjacent `}` where one is enough — this is a
			// duplicate of the existing closing token and must be trimmed.
			const fileLines = ['function f() {', '  doIt();', '}'];
			const result = callDedup(
				{
					addedLines: ['}'],
					removedLines: [],
					lineNumZeroBased: 2,
				},
				fileLines,
			);
			expect(result?.kind).toBe('suffix');
			expect(result?.newAdditions).toEqual([]);
			expect(result?.removedLines).toEqual(['}']);
		});

		it('drops a duplicate `}` even when the patch removes content first', () => {
			// Restructure-shape variant of the headline bug. The previous
			// guard preserved this case (k===addedLines.length, all
			// non-meaningful, removedLines>0) on the rationale of "legitimate
			// inner-scope close". In practice the result still has two
			// adjacent `}` after applying — that's a duplicate. We always
			// trim, accepting the rare false positive of a mid-typing
			// unbalanced file where the model is correctly closing.
			const fileLines = ['function outer() {', '  body();', '}'];
			const result = callDedup(
				{
					addedLines: ['}'],
					removedLines: ['  body();'],
					lineNumZeroBased: 1,
				},
				fileLines,
			);
			expect(result?.kind).toBe('suffix');
			expect(result?.newAdditions).toEqual([]);
			expect(result?.removedLines).toEqual(['}']);
		});

		it('does not drop a leading whitespace-only duplicate', () => {
			const fileLines = ['', '', 'existing'];
			const result = callDedup(
				{
					addedLines: ['', 'first new line'],
					removedLines: [],
					lineNumZeroBased: 1,
				},
				fileLines,
			);
			expect(result).toBeUndefined();
		});

		it('removes streamEdits-style middle duplicate but preserves new content after the matched range', () => {
			// Additions partially copy continuation starting at offset 2
			// ('cont1 long', 'cont2 long' match the file's following lines),
			// but 'extra' is genuinely new and must be preserved. The middle
			// shape only drops the verified-equal range — not everything
			// trailing.
			const fileLines = ['x', 'cont1 long', 'cont2 long', 'y'];
			const result = callDedup(
				{
					addedLines: ['new1', 'new2', 'cont1 long', 'cont2 long', 'extra'],
					removedLines: [],
					lineNumZeroBased: 1,
				},
				fileLines,
			);
			expect(result?.kind).toBe('middle');
			expect(result?.newAdditions).toEqual(['new1', 'new2', 'extra']);
			expect(result?.removedLines).toEqual(['cont1 long', 'cont2 long']);
		});

		it('greedily extends a middle match while the streamEdits regenerated context continues', () => {
			// When more than two consecutive following lines match, the
			// match should extend to cover all of them so we drop the
			// entire regenerated continuation block.
			const fileLines = ['x', 'cont1 long', 'cont2 long', 'cont3 long', 'y'];
			const result = callDedup(
				{
					addedLines: ['new1', 'new2', 'cont1 long', 'cont2 long', 'cont3 long', 'tail'],
					removedLines: [],
					lineNumZeroBased: 1,
				},
				fileLines,
			);
			expect(result?.kind).toBe('middle');
			expect(result?.newAdditions).toEqual(['new1', 'new2', 'tail']);
			expect(result?.removedLines).toEqual(['cont1 long', 'cont2 long', 'cont3 long']);
		});

		it('does not match a middle pair when the following lines are not meaningful', () => {
			// Two consecutive blank lines are too common to safely match on.
			const fileLines = ['x', '', '', 'y'];
			const result = callDedup(
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
			const result = callDedup(
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
			const result = callDedup(
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
			const result = callDedup(
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
			const result = callDedup(
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
			const result = callDedup(
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
			const result = callDedup(
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
			const result = callDedup(
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
			const result = callDedup(
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

	describe('handleResponse with duplicateAdditionsMode', () => {

		it('strips trailing duplicate addition in TrimDuplicate mode', async () => {
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
				DuplicateAdditionsMode.TrimDuplicate,
			);

			expect(edits).toHaveLength(1);
			const lineReplacement = edits[0].edit as LineReplacement;
			expect(lineReplacement.newLines).toEqual(['    let x = 1;', '    let y = 2;']);
		});

		it('does not strip duplicates in Off mode (default)', async () => {
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

		it('Log mode reports detection but does not modify additions', async () => {
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

			const seen: DuplicateAdditionRemovalSummary[] = [];
			const onDuplicateRemoved: OnDuplicateRemovedCallback = info => seen.push(info.summary);

			const { edits } = await consumeHandleResponse(
				makeStream(),
				documentBeforeEdits,
				docId,
				undefined,
				undefined,
				new TestLogService(),
				DuplicateAdditionsMode.Log,
				onDuplicateRemoved,
			);

			expect(edits).toHaveLength(1);
			// Additions are NOT modified in Log mode — the trailing `}` is kept.
			const lineReplacement = edits[0].edit as LineReplacement;
			expect(lineReplacement.newLines).toEqual(['    let x = 1;', '    let y = 2;', '}']);
			// Detection is reported via the callback. Payload is redacted —
			// only metadata (kind + counts), no raw line content.
			expect(seen).toHaveLength(1);
			expect(seen[0].kind).toBe('suffix');
			expect(seen[0].removedLineCount).toBe(1);
			expect(seen[0].remainingAdditionCount).toBe(2);
		});

		it('returns NoSuggestions (not FilteredOut) when every patch is dropped by TrimDuplicate dedup', async () => {
			const docId = DocumentId.create('file:///test.ts');
			const docContent = 'function foo() {\n    let x = 1;\n    let y = 2;\n}\n';
			const documentBeforeEdits = new CurrentDocument(new StringText(docContent), new Position(1, 1));

			// Patch adds 'let x = 1;' at line 1 with no removals — but that
			// line already exists at line 1 (prefix match against a meaningful line).
			async function* makeStream(): AsyncGenerator<string> {
				yield '/test.ts:1';
				yield '+    let x = 1;';
			}

			const seen: DuplicateAdditionRemovalSummary[] = [];
			const onDuplicateRemoved: OnDuplicateRemovedCallback = info => seen.push(info.summary);

			const { edits, returnValue } = await consumeHandleResponse(
				makeStream(),
				documentBeforeEdits,
				docId,
				undefined,
				undefined,
				new TestLogService(),
				DuplicateAdditionsMode.TrimDuplicate,
				onDuplicateRemoved,
			);

			expect(edits).toHaveLength(0);
			// No more FilteredOut: cache and cursor-jump retry are preserved.
			expect(returnValue).toBeInstanceOf(NoNextEditReason.NoSuggestions);
			// The dedup signal is still observable via the callback.
			expect(seen).toHaveLength(1);
		});

		it('returns NoSuggestions when the model produces no edits at all', async () => {
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
				DuplicateAdditionsMode.TrimDuplicate,
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
				DuplicateAdditionsMode.TrimDuplicate,
			);

			expect(edits).toHaveLength(1);
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
				DuplicateAdditionsMode.TrimDuplicate,
			);

			expect(edits).toHaveLength(1);
			const lineReplacement = edits[0].edit as LineReplacement;
			expect(lineReplacement.newLines).toEqual(['a', 'b']);
		});

		it('DropPatch mode drops the offending patch but continues yielding subsequent patches', async () => {
			const docId = DocumentId.create('file:///test.ts');
			const docContent = 'function foo() {\n    let x = 1;\n}\nfunction bar() {\n    let y = 2;\n}\n';
			const documentBeforeEdits = new CurrentDocument(new StringText(docContent), new Position(2, 1));

			async function* makeStream(): AsyncGenerator<string> {
				// First patch: duplicates the trailing `}` (suffix shape) — should be dropped.
				yield '/test.ts:1';
				yield '-    let x = 1;';
				yield '+    let x = 1;';
				yield '+}';
				// Second patch: legitimate change to a different region — should be yielded.
				yield '/test.ts:4';
				yield '-    let y = 2;';
				yield '+    let y = 42;';
			}

			const seen: DuplicateAdditionRemovalSummary[] = [];
			const onDuplicateRemoved: OnDuplicateRemovedCallback = info => seen.push(info.summary);

			const { edits, returnValue } = await consumeHandleResponse(
				makeStream(),
				documentBeforeEdits,
				docId,
				undefined,
				undefined,
				new TestLogService(),
				DuplicateAdditionsMode.DropPatch,
				onDuplicateRemoved,
			);

			expect(edits).toHaveLength(1);
			const lineReplacement = edits[0].edit as LineReplacement;
			expect(lineReplacement.newLines).toEqual(['    let y = 42;']);
			expect(seen).toHaveLength(1);
			expect(returnValue).toBeInstanceOf(NoNextEditReason.NoSuggestions);
		});

		it('DropAllRemaining mode drops the offending patch and every subsequent patch', async () => {
			const docId = DocumentId.create('file:///test.ts');
			const docContent = 'function foo() {\n    let x = 1;\n}\nfunction bar() {\n    let y = 2;\n}\n';
			const documentBeforeEdits = new CurrentDocument(new StringText(docContent), new Position(2, 1));

			async function* makeStream(): AsyncGenerator<string> {
				// First patch: legitimate, yielded as-is.
				yield '/test.ts:0';
				yield '-function foo() {';
				yield '+function fooRenamed() {';
				// Second patch: duplicates trailing `}` — triggers DropAllRemaining.
				yield '/test.ts:1';
				yield '-    let x = 1;';
				yield '+    let x = 1;';
				yield '+}';
				// Third patch: would have been legitimate, but must NOT be yielded.
				yield '/test.ts:4';
				yield '-    let y = 2;';
				yield '+    let y = 42;';
			}

			const seen: DuplicateAdditionRemovalSummary[] = [];
			const onDuplicateRemoved: OnDuplicateRemovedCallback = info => seen.push(info.summary);

			const { edits, returnValue } = await consumeHandleResponse(
				makeStream(),
				documentBeforeEdits,
				docId,
				undefined,
				undefined,
				new TestLogService(),
				DuplicateAdditionsMode.DropAllRemaining,
				onDuplicateRemoved,
			);

			// Only the patch yielded before the detection survives. The
			// triggering patch and every subsequent patch are dropped.
			expect(edits).toHaveLength(1);
			const lineReplacement = edits[0].edit as LineReplacement;
			expect(lineReplacement.newLines).toEqual(['function fooRenamed() {']);
			// Callback fires exactly once — for the triggering detection.
			expect(seen).toHaveLength(1);
			expect(returnValue).toBeInstanceOf(NoNextEditReason.NoSuggestions);
		});
	});
});

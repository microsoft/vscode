/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { StringEdit, StringReplacement } from '../../../../util/vs/editor/common/core/edits/stringEdit';
import { OffsetRange } from '../../../../util/vs/editor/common/core/ranges/offsetRange';
import { PositionOffsetTransformer } from '../../../../util/vs/editor/common/core/text/positionToOffset';
import { getCurrentLine, isModelLineCompatible } from '../../node/cursorLineDivergence';

// ============================================================================
// isModelCursorLineCompatible — unit tests
// ============================================================================

describe('isModelCursorLineCompatible', () => {

	// ── Visual helper ──────────────────────────────────────────────────────
	//
	// Each test case is written as a table row:
	//   original cursor line  →  what user typed  →  what model produced
	//   expected: compatible / incompatible
	//
	// "compatible" means the model's output is consistent with the user's
	// typing and the stream should continue. "incompatible" means the model
	// diverged and the stream should be cancelled early.
	// ────────────────────────────────────────────────────────────────────────

	describe('user typed text that the model also predicted', () => {

		it('user typed one char that starts the model completion', () => {
			//  original:  `function fi`
			//  user typed `b`            → current: `function fib`
			//  model:     `function fibonacci(n: number): number`
			expect(isModelLineCompatible(
				'function fi',
				'function fib',
				'function fibonacci(n: number): number',
			)).toBe(true);
		});

		it('user typed several chars that the model also predicted', () => {
			//  original:  `const x`
			//  user typed ` = 4`     → current: `const x = 4`
			//  model:     `const x = 42;`
			expect(isModelLineCompatible(
				'const x',
				'const x = 4',
				'const x = 42;',
			)).toBe(true);
		});

		it('user typed the exact text the model produced', () => {
			//  original:  `return`
			//  user typed ` 0;`   → current: `return 0;`
			//  model:     `return 0;`
			expect(isModelLineCompatible(
				'return',
				'return 0;',
				'return 0;',
			)).toBe(true);
		});
	});

	describe('user typed text that diverges from the model', () => {

		it('user typed a different character', () => {
			//  original:  `function fi`
			//  user typed `x`             → current: `function fix`
			//  model:     `function fibonacci(n: number): number`
			expect(isModelLineCompatible(
				'function fi',
				'function fix',
				'function fibonacci(n: number): number',
			)).toBe(false);
		});

		it('user typed a completely different word', () => {
			//  original:  `const `
			//  user typed `bar`       → current: `const bar`
			//  model:     `const foo = 1;`
			expect(isModelLineCompatible(
				'const ',
				'const bar',
				'const foo = 1;',
			)).toBe(false);
		});

		it('user typed text that appears later but not at the right position', () => {
			//  original:  `ab`
			//  user typed `z`     → current: `abz`
			//  model:     `abcz`
			//  modelNewText = "cz", userTypedText = "z"
			//  → "cz" does not start with "z" → cancel
			expect(isModelLineCompatible(
				'ab',
				'abz',
				'abcz',
			)).toBe(false);
		});
	});

	describe('user typed in the middle of the line', () => {

		it('user inserted text at cursor mid-line, model also inserts at same spot', () => {
			//  original:  `foo()` (cursor between the parens)
			//  user typed `x`          → current: `foo(x)`
			//  model:     `foo(x, y)`
			expect(isModelLineCompatible(
				'foo()',
				'foo(x)',
				'foo(x, y)',
			)).toBe(true);
		});

		it('user inserted text mid-line, model changed something else', () => {
			//  original:  `foo()`
			//  user typed `x`          → current: `foo(x)`
			//  model:     `bar(a, b)`
			expect(isModelLineCompatible(
				'foo()',
				'foo(x)',
				'bar(a, b)',
			)).toBe(false);
		});
	});

	describe('model did not change the cursor line', () => {

		it('user typed but model kept cursor line identical — incompatible', () => {
			//  original:  `const x = 1;`
			//  user typed `2`              → current: `const x = 12;`
			//  model:     `const x = 1;`   (no change)
			//
			// The model's edit range is empty (no diff), so the user's edit
			// range cannot be "within" it → incompatible.
			expect(isModelLineCompatible(
				'const x = 1;',
				'const x = 12;',
				'const x = 1;',
			)).toBe(false);
		});
	});

	describe('edge cases', () => {

		it('empty original line, user typed, model also added text', () => {
			//  original:  ``
			//  user typed `f`    → current: `f`
			//  model:     `function foo() {`
			expect(isModelLineCompatible(
				'',
				'f',
				'function foo() {',
			)).toBe(true);
		});

		it('empty original line, user typed char not in model text', () => {
			//  original:  ``
			//  user typed `z`    → current: `z`
			//  model:     `let x = 1;`
			//  → "z" is not found in "let x = 1;" → incompatible
			expect(isModelLineCompatible(
				'',
				'z',
				'let x = 1;',
			)).toBe(false);
		});

		it('user deleted text from the cursor line', () => {
			//  original:  `foobar`
			//  user deleted `bar`  → current: `foo`
			//  model:     `foobaz`
			expect(isModelLineCompatible(
				'foobar',
				'foo',
				'foobaz',
			)).toBe(false);
		});

		it('user replaced text at cursor, model has same replacement', () => {
			//  original:  `hello world`
			//  user replaced `world` → current: `hello earth`
			//  model:     `hello earth!`  (same replacement + extra)
			expect(isModelLineCompatible(
				'hello world',
				'hello earth',
				'hello earth!',
			)).toBe(true);
		});

		it('all three lines identical — trivially compatible', () => {
			expect(isModelLineCompatible(
				'no change',
				'no change',
				'no change',
			)).toBe(true);
		});

		it('user typed t continuing class name, model adds braces', () => {
			//  original:  `class Poin`
			//  user typed `t`           → current: `class Point`
			//  model:     `class Point {`
			expect(isModelLineCompatible(
				'class Poin',
				'class Point',
				'class Point {',
			)).toBe(true);
		});
	});

	// ── Adversarial scenarios ──────────────────────────────────────────────
	// These document known limitations and intentional false-positive /
	// false-negative behaviour so that regressions are caught if the
	// implementation changes.
	// ────────────────────────────────────────────────────────────────────────

	describe('auto-close pairs', () => {

		it('user typed ( which auto-closed to () — model fills parens', () => {
			//  original:  `foo`
			//  user typed `(`, editor auto-closed → current: `foo()`
			//  model:     `foo(x, y)`
			//  → userTypedText="()" is an auto-close pair
			//  → subsequence check: "(" at 0, ")" at 5 in "(x, y)" → compatible
			expect(isModelLineCompatible(
				'foo',
				'foo()',
				'foo(x, y)',
			)).toBe(true);
		});

		it('user typed { which auto-closed to {} — model fills braces', () => {
			//  original:  `if (x) `
			//  → current: `if (x) {}`
			//  model:     `if (x) { return 1; }`
			expect(isModelLineCompatible(
				'if (x) ',
				'if (x) {}',
				'if (x) { return 1; }',
			)).toBe(true);
		});

		it('user typed [ which auto-closed to []', () => {
			expect(isModelLineCompatible(
				'arr',
				'arr[]',
				'arr[0]',
			)).toBe(true);
		});

		it('user typed " which auto-closed to "" — model fills string', () => {
			expect(isModelLineCompatible(
				'const s = ',
				'const s = ""',
				'const s = "hello"',
			)).toBe(true);
		});

		it('auto-close pair but model has no closing char — incompatible', () => {
			//  user typed `(` auto-closed to `()`, model has `(x, y` with no `)`
			expect(isModelLineCompatible(
				'foo',
				'foo()',
				'foo(x, y',
			)).toBe(false);
		});
	});

	describe('known limitations — non-overlapping edits on the same line', () => {

		it('user appended ; at end, model changed identifier at start (FALSE POSITIVE: cancels)', () => {
			//  original:  `const x = foo()`
			//  user typed `;` at end → current: `const x = foo();`
			//  model:     `const y = foo()`  (changed x→y)
			//  → The edit ranges don't overlap: user at col 15, model at col 6-7.
			//    The range check rejects because user's edit position (15) is
			//    outside the model's edit range (6–7).
			//
			//  This is a false positive: the model's rename of `x`→`y` is independent
			//  of the user's `;`, but we cancel because our range-containment check is
			//  overly strict. The full rebase system handles disjoint edits correctly.
			expect(isModelLineCompatible(
				'const x = foo()',
				'const x = foo();',
				'const y = foo()',
			)).toBe(false); // false positive — ideally should be true
		});
	});

	describe('prefix match and coincidental matches', () => {

		it('user typed char that starts model text — compatible', () => {
			//  original:  `let `
			//  user typed `a` → current: `let a`
			//  model:     `let apple = 1;`
			//  → modelNewText = "apple = 1;", starts with "a" → compatible
			expect(isModelLineCompatible(
				'let ',
				'let a',
				'let apple = 1;',
			)).toBe(true);
		});

		it('user typed char that does NOT start model text — cancel', () => {
			//  original:  `let `
			//  user typed `a` → current: `let a`
			//  model:     `let banana = 1;`
			//  → modelNewText = "banana = 1;", does not start with "a"
			//  → Even though "a" appears inside "banana", it's coincidental → cancel
			expect(isModelLineCompatible(
				'let ',
				'let a',
				'let banana = 1;',
			)).toBe(false);
		});

		it('user typed text that does not start model text — cancel', () => {
			//  original:  `x`
			//  user typed `y` → current: `xy`
			//  model:     `x01234567890y`  ("y" appears far in, not at start)
			expect(isModelLineCompatible(
				'x',
				'xy',
				'x01234567890y',
			)).toBe(false);
		});

		it('user typed text at non-zero offset — cancel', () => {
			//  original:  `prefix`
			//  user typed `ABCDEF` → current: `prefixABCDEF`
			//  model:     `prefix_ABCDEF_suffix`
			//  → modelNewText = "_ABCDEF_suffix", does not start with "ABCDEF" → cancel
			expect(isModelLineCompatible(
				'prefix',
				'prefixABCDEF',
				'prefix_ABCDEF_suffix',
			)).toBe(false);
		});

		it('user typed text at position 0 — compatible', () => {
			//  original:  `prefix`
			//  user typed `ABCDEF` → current: `prefixABCDEF`
			//  model:     `prefixABCDEF_and_more`
			//  → modelNewText = "ABCDEF_and_more", starts with "ABCDEF" → compatible
			expect(isModelLineCompatible(
				'prefix',
				'prefixABCDEF',
				'prefixABCDEF_and_more',
			)).toBe(true);
		});
	});

	describe('user deleted text', () => {

		it('user deleted suffix, model replaced same suffix differently', () => {
			//  original:  `foobar`
			//  user deleted `bar` → current: `foo`
			//  model:     `foobaz`
			//  → User's edit starts at offset 3, model's edit starts at offset 5.
			//    user's prefixLen (3) < model's prefixLen (5) → range check fails → cancels.
			//  Correct: user deleted text, model wants different text in same area.
			expect(isModelLineCompatible(
				'foobar',
				'foo',
				'foobaz',
			)).toBe(false);
		});

		it('user deleted text, model predicted the same deletion', () => {
			//  original:  `console.log(x);`
			//  user deleted `console.log(` → current: `x);`
			//  model:     `x);`   (same result)
			expect(isModelLineCompatible(
				'console.log(x);',
				'x);',
				'x);',
			)).toBe(true);
		});
	});

	describe('whitespace edits', () => {

		it('user added indentation, model suggests code at different indent — compatible (short text)', () => {
			//  original:  `return 1;`
			//  user typed `  ` (2 chars) → current: `  return 1;`
			//  model:     `    return value;`
			//  → "  " found at position 0 in model new text → compatible
			expect(isModelLineCompatible(
				'return 1;',
				'  return 1;',
				'    return value;',
			)).toBe(true);
		});

		it('user added indentation, model has same indentation and more changes', () => {
			//  original:  `return 1;`
			//  user typed `  ` → current: `  return 1;`
			//  model:     `  return 42;`
			//  → "  " found at position 0 → compatible
			expect(isModelLineCompatible(
				'return 1;',
				'  return 1;',
				'  return 42;',
			)).toBe(true);
		});
	});

	describe('repeated characters and prefix/suffix ambiguity', () => {

		it('repeated chars at divergence point', () => {
			//  original:  `aaa`
			//  user typed `b` → current: `aaab`
			//  model:     `aaac`
			//  → prefixLen=3, modelPrefixLen=3, userTypedText="b", modelNewText="c"
			//  → "c".startsWith("b") → false → cancel
			expect(isModelLineCompatible(
				'aaa',
				'aaab',
				'aaac',
			)).toBe(false);
		});

		it('repeated chars — user typed same char as existing', () => {
			//  original:  `aaa`
			//  user typed `a` → current: `aaaa`
			//  model:     `aaaab`
			//  → prefixLen=3, suffixLen=0, userTypedText="a", originalReplacedText=""
			//  → modelPrefixLen=3, modelNewText="ab"
			//  → "ab".startsWith("a") → true → compatible
			expect(isModelLineCompatible(
				'aaa',
				'aaaa',
				'aaaab',
			)).toBe(true);
		});
	});

	describe('model output edge cases', () => {

		it('model produces empty line, user typed text', () => {
			//  original:  `foo`
			//  user typed `b` → current: `foob`
			//  model:     `` (empty)
			expect(isModelLineCompatible(
				'foo',
				'foob',
				'',
			)).toBe(false);
		});

		it('model produces shorter line than original, user typed at end', () => {
			//  original:  `const x = 1;`
			//  user typed `!` → current: `const x = 1;!`
			//  model:     `const x;`  (removed ` = 1`)
			//  → user edit at col 13, model edit at col 7–12 → ranges don't overlap → cancel
			expect(isModelLineCompatible(
				'const x = 1;',
				'const x = 1;!',
				'const x;',
			)).toBe(false);
		});
	});

	// ── Case sensitivity ───────────────────────────────────────────────────
	// `startsWith` is case-sensitive by design — in code, `F` and `f` are
	// different identifiers and should cancel.
	// ────────────────────────────────────────────────────────────────────────

	describe('case sensitivity', () => {

		it('user typed uppercase, model starts with lowercase — cancel', () => {
			//  original:  `let `
			//  user typed `F` → current: `let F`
			//  model:     `let function() {}`
			//  → "function() {}".startsWith("F") → false → cancel
			expect(isModelLineCompatible(
				'let ',
				'let F',
				'let function() {}',
			)).toBe(false);
		});

		it('user typed lowercase matching model lowercase — compatible', () => {
			//  original:  `let `
			//  user typed `f` → current: `let f`
			//  model:     `let function() {}`
			expect(isModelLineCompatible(
				'let ',
				'let f',
				'let function() {}',
			)).toBe(true);
		});
	});

	// ── Unicode / multi-byte characters ────────────────────────────────────

	describe('unicode and multi-byte characters', () => {

		it('user typed emoji, model produced ASCII — cancel', () => {
			//  original:  `const x = `
			//  user typed `🎉` → current: `const x = 🎉`
			//  model:     `const x = 42;`
			//  → "42;".startsWith("🎉") → false → cancel
			expect(isModelLineCompatible(
				'const x = ',
				'const x = 🎉',
				'const x = 42;',
			)).toBe(false);
		});

		it('user typed emoji matching model — compatible', () => {
			//  original:  `const x = `
			//  user typed `🎉` → current: `const x = 🎉`
			//  model:     `const x = 🎉🎊`
			expect(isModelLineCompatible(
				'const x = ',
				'const x = 🎉',
				'const x = 🎉🎊',
			)).toBe(true);
		});

		it('user typed CJK character, model produced different CJK — cancel', () => {
			expect(isModelLineCompatible(
				'const s = "',
				'const s = "你',
				'const s = "世界"',
			)).toBe(false);
		});
	});

	// ── Replacement edge cases ─────────────────────────────────────────────

	describe('replacement edge cases', () => {

		it('user replaced text with shorter string, model replaced same region with compatible text', () => {
			//  original:  `abcdef`
			//  user replaced `cd` with `x` → current: `abxef`
			//  model:     `abxyzef`  (replaced `cd` with `xyz`, starts with `x`)
			expect(isModelLineCompatible(
				'abcdef',
				'abxef',
				'abxyzef',
			)).toBe(true);
		});

		it('user replaced text with shorter string, model replaced same region differently — cancel', () => {
			//  original:  `abcdef`
			//  user replaced `cd` with `x` → current: `abxef`
			//  model:     `abYZef`  (replaced `cd` with `YZ`)
			//  → "YZ".startsWith("x") → false → cancel
			expect(isModelLineCompatible(
				'abcdef',
				'abxef',
				'abYZef',
			)).toBe(false);
		});

		it('user replaced text with empty string (pure deletion), model replaced same region — cancel', () => {
			//  original:  `abcdef`
			//  user deleted `cd` → current: `abef`
			//  model:     `abXYef`  (replaced `cd` with `XY`)
			//  → isUserEditCompatibleWithModelEdit: replaced.length > 0, currentCursorLine !== modelCursorLine,
			//    same start/end/replaced, but userEdit.inserted.length === 0 → false → cancel
			expect(isModelLineCompatible(
				'abcdef',
				'abef',
				'abXYef',
			)).toBe(false);
		});

		it('user replaced text, model replaced different region — cancel', () => {
			//  original:  `hello world`
			//  user replaced `hello` (0..5) with `hi` → current: `hi world`
			//  model:     `hello earth`   (replaced `world` at 6..11)
			//  → user edit range [0,5) is not within model edit range [6,11) → cancel
			expect(isModelLineCompatible(
				'hello world',
				'hi world',
				'hello earth',
			)).toBe(false);
		});
	});

	// ── Auto-close pair: angle brackets ────────────────────────────────────

	describe('auto-close pair: angle brackets', () => {

		it('user typed < auto-closed to <>, model has <Component> — compatible', () => {
			//  original:  `div`
			//  user typed `<>` → current: `div<>`
			//  model:     `div<Component>`
			//  → userTypedText="<>", AUTO_CLOSE_PAIRS.has("<>") → true
			//  → isSubsequenceOf("<>", "<Component>") → true → compatible
			expect(isModelLineCompatible(
				'div',
				'div<>',
				'div<Component>',
			)).toBe(true);
		});

		it('user typed < auto-closed to <>, model has no > — cancel', () => {
			//  model:     `div<Component`  (no closing >)
			expect(isModelLineCompatible(
				'div',
				'div<>',
				'div<Component',
			)).toBe(false);
		});
	});

	// ── Non-auto-close text that resembles pairs ───────────────────────────

	describe('non-auto-close pair text', () => {

		it('user typed (x) which is not an auto-close pair — cancel if model differs', () => {
			//  original:  `foo`
			//  user typed `(x)` → current: `foo(x)`
			//  model:     `foo(a, b)`
			//  → userTypedText = "(x)", not in AUTO_CLOSE_PAIRS
			//  → "(a, b)".startsWith("(x)") → false → cancel
			expect(isModelLineCompatible(
				'foo',
				'foo(x)',
				'foo(a, b)',
			)).toBe(false);
		});

		it('user typed (x) and model starts with (x — cancel because ) vs , diverges', () => {
			//  original:  `foo`
			//  user typed `(x)` → current: `foo(x)`
			//  model:     `foo(x, y)`
			//  → userTypedText = "(x)", modelNewText = "(x, y)"
			//  → "(x, y)".startsWith("(x)") → false (position 2: ')' vs ',')
			//  → "(x)" not in AUTO_CLOSE_PAIRS → no subsequence fallback
			//  → cancel. User closed parens but model wants different content.
			expect(isModelLineCompatible(
				'foo',
				'foo(x)',
				'foo(x, y)',
			)).toBe(false);
		});
	});

	// ── Model line is prefix of current line ───────────────────────────────

	describe('model produced less than user typed', () => {

		it('user typed more chars than model predicted — cancel', () => {
			//  original:  `let `
			//  user typed `abc` → current: `let abc`
			//  model:     `let ab`  (model predicted fewer chars)
			//  → userTypedText="abc", modelNewText="ab"
			//  → "ab".startsWith("abc") → false → cancel
			expect(isModelLineCompatible(
				'let ',
				'let abc',
				'let ab',
			)).toBe(false);
		});
	});

	// ── Both user and model made identical changes ─────────────────────────

	describe('identical changes', () => {

		it('user and model both inserted the same text — compatible', () => {
			//  original:  `foo`
			//  user typed `bar` → current: `foobar`
			//  model:     `foobar`
			expect(isModelLineCompatible(
				'foo',
				'foobar',
				'foobar',
			)).toBe(true);
		});

		it('user and model both replaced the same region identically — compatible', () => {
			//  original:  `aXa`
			//  user replaced `X` with `Y` → current: `aYa`
			//  model:     `aYa`  (same)
			expect(isModelLineCompatible(
				'aXa',
				'aYa',
				'aYa',
			)).toBe(true);
		});
	});

	// ── Net-zero edits ────────────────────────────────────────────────────

	describe('net-zero edits', () => {

		it('user backspaced and retyped same char — no change, trivially compatible', () => {
			//  The net result is original === current → userEdit has no diff.
			//  Detected by: replaced.length === 0 && inserted.length === 0 → true
			expect(isModelLineCompatible(
				'hello',
				'hello',
				'completely different',
			)).toBe(true);
		});
	});

	// ── Substring vs prefix ────────────────────────────────────────────────

	describe('user typed substring (not prefix) of model text', () => {

		it('user typed middle portion of model insertion — cancel', () => {
			//  original:  `x`
			//  user typed `bc` → current: `xbc`
			//  model:     `xabcd`
			//  → userTypedText="bc", modelNewText="abcd"
			//  → "abcd".startsWith("bc") → false → cancel
			expect(isModelLineCompatible(
				'x',
				'xbc',
				'xabcd',
			)).toBe(false);
		});

		it('user typed suffix portion of model insertion — cancel', () => {
			//  original:  `x`
			//  user typed `cd` → current: `xcd`
			//  model:     `xabcd`
			//  → userTypedText="cd", modelNewText="abcd"
			//  → "abcd".startsWith("cd") → false → cancel
			expect(isModelLineCompatible(
				'x',
				'xcd',
				'xabcd',
			)).toBe(false);
		});
	});

	// ── Whitespace-only user edit at position model didn't touch ──────────

	describe('whitespace edit outside model edit range', () => {

		it('user added trailing space, model changed identifier — cancel', () => {
			//  original:  `const x = 1;`
			//  user typed ` ` at end → current: `const x = 1; `
			//  model:     `const y = 1;`  (changed x→y at col 6-7)
			//  → user edit at offset 13 (append), model edit at offset 6-7
			//  → user offset outside model range → cancel
			expect(isModelLineCompatible(
				'const x = 1;',
				'const x = 1; ',
				'const y = 1;',
			)).toBe(false);
		});
	});

	// ── User pure deletion, model also deleted same text ──────────────────

	describe('user deletion matching model deletion', () => {

		it('user deleted text, model deleted exact same text — compatible', () => {
			//  original:  `foobar`
			//  user deleted `bar` → current: `foo`
			//  model:     `foo`
			//  → currentCursorLine === modelCursorLine → true
			expect(isModelLineCompatible(
				'foobar',
				'foo',
				'foo',
			)).toBe(true);
		});
	});
});

// ============================================================================
// getCurrentCursorLine — unit tests
// ============================================================================

describe('getCurrentCursorLine', () => {

	function t(doc: string): PositionOffsetTransformer {
		return new PositionOffsetTransformer(doc);
	}

	/**
	 * Helper: builds a StringEdit that inserts `text` at `offset` in the
	 * original document (a pure insertion, no deletion).
	 */
	function insertAt(offset: number, text: string): StringEdit {
		return StringEdit.single(new StringReplacement(OffsetRange.emptyAt(offset), text));
	}

	/**
	 * Helper: builds a StringEdit that deletes `length` characters starting at
	 * `offset` in the original document.
	 */
	function deleteAt(offset: number, length: number): StringEdit {
		return StringEdit.single(new StringReplacement(new OffsetRange(offset, offset + length), ''));
	}

	describe('no line-shifting edits', () => {

		it('returns the cursor line when the edit only modifies the cursor line', () => {
			//  Doc: "aaa\nbbb\nccc"  (cursor on line 1 = "bbb")
			//  User typed "X" at offset 4 (start of "bbb") → "aaa\nXbbb\nccc"
			const doc = 'aaa\nbbb\nccc';
			const edit = insertAt(4, 'X');

			expect(getCurrentLine(t(doc), 1, edit)).toBe('Xbbb');
		});

		it('returns the unmodified cursor line when the edit is empty', () => {
			const doc = 'aaa\nbbb\nccc';

			expect(getCurrentLine(t(doc), 1, StringEdit.empty)).toBe('bbb');
		});
	});

	describe('line inserted above cursor', () => {

		it('returns the correct cursor line after a newline is inserted above', () => {
			//  Doc: "aaa\nbbb\nccc"  (cursor on line 2 = "ccc")
			//  User inserts "\nNEW" at offset 3 (end of "aaa") → "aaa\nNEW\nbbb\nccc"
			//  Cursor line 2 in the original ("ccc") is now at line 3.
			//  Without the fix, naively reading line 2 would give "bbb".
			const doc = 'aaa\nbbb\nccc';
			const edit = insertAt(3, '\nNEW');

			expect(getCurrentLine(t(doc), 2, edit)).toBe('ccc');
		});

		it('handles multiple lines inserted above the cursor', () => {
			//  Doc: "L0\nL1\nL2"  (cursor on line 2 = "L2")
			//  Insert two new lines after L0: "\nA\nB"
			//  New doc: "L0\nA\nB\nL1\nL2"
			//  Cursor line should still resolve to "L2"
			const doc = 'L0\nL1\nL2';
			const edit = insertAt(2, '\nA\nB');

			expect(getCurrentLine(t(doc), 2, edit)).toBe('L2');
		});
	});

	describe('line deleted above cursor', () => {

		it('returns the correct cursor line after a line above is deleted', () => {
			//  Doc: "aaa\nbbb\nccc\nddd"  (cursor on line 3 = "ddd")
			//  User deletes "bbb\n" (offsets 4..8) → "aaa\nccc\nddd"
			//  Cursor line 3 ("ddd") is now at line 2.
			const doc = 'aaa\nbbb\nccc\nddd';
			const edit = deleteAt(4, 4); // delete "bbb\n"

			expect(getCurrentLine(t(doc), 3, edit)).toBe('ddd');
		});
	});

	describe('edit on a line below cursor', () => {

		it('does not affect the cursor line', () => {
			//  Doc: "aaa\nbbb\nccc"  (cursor on line 0 = "aaa")
			//  User edits line 2 → "aaa\nbbb\nCCC"
			const doc = 'aaa\nbbb\nccc';
			const edit = StringEdit.single(new StringReplacement(new OffsetRange(8, 11), 'CCC'));

			expect(getCurrentLine(t(doc), 0, edit)).toBe('aaa');
		});
	});

	describe('edge cases', () => {

		it('cursor on the first line', () => {
			const doc = 'hello\nworld';
			const edit = insertAt(0, 'XY');

			expect(getCurrentLine(t(doc), 0, edit)).toBe('XYhello');
		});

		it('cursor on the last line', () => {
			const doc = 'aaa\nbbb';
			const edit = insertAt(3, '\nNEW');

			expect(getCurrentLine(t(doc), 1, edit)).toBe('bbb');
		});

		it('returns undefined for out-of-bounds line index', () => {
			const doc = 'aaa\nbbb';

			expect(getCurrentLine(t(doc), 5, StringEdit.empty)).toBeUndefined();
		});

		it('returns undefined when cursor line start is inside a replacement', () => {
			//  Doc: "aaa\nbbb\nccc"  (cursor on line 1, starts at offset 4)
			//  Edit replaces offsets 2..6 (spans across line boundary including cursor line start)
			const doc = 'aaa\nbbb\nccc';
			const edit = StringEdit.single(new StringReplacement(new OffsetRange(2, 6), 'Z'));

			expect(getCurrentLine(t(doc), 1, edit)).toBeUndefined();
		});

		it('single-line document, cursor on line 0', () => {
			const doc = 'hello';
			const edit = insertAt(5, ' world');

			expect(getCurrentLine(t(doc), 0, edit)).toBe('hello world');
		});
	});

	// ── Compound edits ────────────────────────────────────────────────────

	describe('compound edits: line shift + cursor line modification', () => {

		it('handles new line inserted above AND cursor line modified', () => {
			//  Doc: "aaa\nbbb\nccc"  (cursor on line 1 = "bbb")
			//  Edit 1: insert "\nNEW" at offset 3 (after "aaa") — shifts cursor line down
			//  Edit 2: insert "X" at offset 4 (start of original "bbb")
			//  New doc: "aaa\nNEW\nXbbb\nccc"
			//  Cursor line 1 in original was "bbb", which now maps to "Xbbb".
			const doc = 'aaa\nbbb\nccc';
			const edit = StringEdit.create([
				new StringReplacement(OffsetRange.emptyAt(3), '\nNEW'),
				new StringReplacement(OffsetRange.emptyAt(4), 'X'),
			]);

			expect(getCurrentLine(t(doc), 1, edit)).toBe('Xbbb');
		});

		it('handles line deleted above AND cursor line modified', () => {
			//  Doc: "aaa\nbbb\nccc\nddd"  (cursor on line 3 = "ddd")
			//  Edit 1: delete "bbb\n" (offsets 4..8), pulling cursor line up
			//  Edit 2: insert "Z" at offset 12 (start of "ddd")
			//  New doc: "aaa\nccc\nZddd"
			const doc = 'aaa\nbbb\nccc\nddd';
			const edit = StringEdit.create([
				new StringReplacement(new OffsetRange(4, 8), ''),
				new StringReplacement(OffsetRange.emptyAt(12), 'Z'),
			]);

			expect(getCurrentLine(t(doc), 3, edit)).toBe('Zddd');
		});
	});

	// ── Edit replaces cursor line with multiple lines ──────────────────────

	describe('cursor line replaced with multiple lines', () => {

		it('returns first replacement line when cursor line start coincides with replacement start', () => {
			//  Doc: "aaa\nbbb\nccc"  (cursor on line 1 = "bbb", starts at offset 4)
			//  Edit replaces "bbb" (offsets 4..7) with "X\nY\nZ"
			//  The cursor line start offset (4) falls at the start of the replacement.
			//  The check `replacement.replaceRange.start < cursorLineStartOffset` is
			//  false (4 < 4 is false), so the mapping is unambiguous.
			//  mappedOffset = 4 + 0 = 4. In new doc "aaa\nX\nY\nZ\nccc", offset 4 → "X".
			const doc = 'aaa\nbbb\nccc';
			const edit = StringEdit.single(
				new StringReplacement(new OffsetRange(4, 7), 'X\nY\nZ')
			);

			expect(getCurrentLine(t(doc), 1, edit)).toBe('X');
		});
	});

	// ── Empty document ────────────────────────────────────────────────────

	describe('empty document', () => {

		it('empty single-line document, cursor on line 0, user types', () => {
			const doc = '';
			const edit = insertAt(0, 'hello');

			expect(getCurrentLine(t(doc), 0, edit)).toBe('hello');
		});
	});

	// ── Edit at end of document ───────────────────────────────────────────

	describe('edit at document end', () => {

		it('cursor on last line, text appended after it', () => {
			//  Doc: "aaa\nbbb"  (cursor on line 1 = "bbb")
			//  Edit: append "XYZ" at offset 7 (end of "bbb")
			//  New doc: "aaa\nbbbXYZ"
			const doc = 'aaa\nbbb';
			const edit = insertAt(7, 'XYZ');

			expect(getCurrentLine(t(doc), 1, edit)).toBe('bbbXYZ');
		});

		it('cursor on last line, new line appended after it', () => {
			//  Doc: "aaa\nbbb"  (cursor on line 1 = "bbb")
			//  Edit: append "\nccc" at offset 7
			//  New doc: "aaa\nbbb\nccc"
			//  Cursor line 1 should still be "bbb"
			const doc = 'aaa\nbbb';
			const edit = insertAt(7, '\nccc');

			expect(getCurrentLine(t(doc), 1, edit)).toBe('bbb');
		});
	});
});

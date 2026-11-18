/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { expect, suite, test } from 'vitest';
import { decomposeStringEdit } from '../../../../platform/inlineEdits/common/dataTypes/editUtils';
import { TestLogService } from '../../../../platform/testing/common/testLogService';
import { StringEdit, StringReplacement } from '../../../../util/vs/editor/common/core/edits/stringEdit';
import { OffsetRange } from '../../../../util/vs/editor/common/core/ranges/offsetRange';
import { maxAgreementOffset, maxImperfectAgreementLength, tryRebase, tryRebaseStringEdits } from '../../common/editRebase';


suite('NextEditCache', () => {
	test('tryRebase keeps index and full edit', async () => {
		const originalDocument = `
class Point3D {
	constructor(x, y) {
		this.x = x;
		this.y = y;
	}
}
`;
		const suggestedEdit = StringEdit.create([
			StringReplacement.replace(new OffsetRange(17, 37), '	constructor(x, y, z) {'),
			StringReplacement.replace(new OffsetRange(65, 65), '\n		this.z = z;'),
		]);
		const userEdit = StringEdit.create([
			StringReplacement.replace(new OffsetRange(34, 34), ', z'),
			StringReplacement.replace(new OffsetRange(65, 65), '\n		this.'),
		]);
		const final = suggestedEdit.apply(originalDocument);
		expect(final).toStrictEqual(`
class Point3D {
	constructor(x, y, z) {
		this.x = x;
		this.y = y;
		this.z = z;
	}
}
`);
		const currentDocument = userEdit.apply(originalDocument);
		expect(currentDocument).toStrictEqual(`
class Point3D {
	constructor(x, y, z) {
		this.x = x;
		this.y = y;
		this.
	}
}
`);

		const logger = new TestLogService();
		{
			const res = tryRebase(originalDocument, undefined, decomposeStringEdit(suggestedEdit).edits, [], userEdit, currentDocument, [], 'strict', logger);
			expect(res).toBeTypeOf('object');
			const result = res as Exclude<typeof res, string | undefined>;
			expect(result[0].rebasedEditIndex).toBe(1);
			expect(result[0].rebasedEdit.toString()).toMatchInlineSnapshot(`"[68, 76) -> "\\n\\t\\tthis.z = z;""`);
		}
		{
			const res = tryRebase(originalDocument, undefined, decomposeStringEdit(suggestedEdit).edits, [], userEdit, currentDocument, [], 'lenient', logger);
			expect(res).toBeTypeOf('object');
			const result = res as Exclude<typeof res, string | undefined>;
			expect(result[0].rebasedEditIndex).toBe(1);
			expect(result[0].rebasedEdit.toString()).toMatchInlineSnapshot(`"[68, 76) -> "\\n\\t\\tthis.z = z;""`);
		}
	});

	test('tryRebase matches up edits', async () => {
		// Ambiguity with shifted edits.
		const originalDocument = `
function getEnvVar(name): string | undefined {
	const value = process.env[name] || undefined;
	if (!value) {
		console.warn(\`Environment variable \${name} is not set\`);
	}
	return value;
}

function main() {
	const foo = getEnvVar("FOO");
	if (!foo) {
		return;
	}
}
`;
		const suggestedEdit = StringEdit.create([
			StringReplacement.replace(new OffsetRange(265, 266), `	// Do something with foo
}`),
		]);
		const userEdit = StringEdit.create([
			StringReplacement.replace(new OffsetRange(264, 264), `



	// Do something with foo`),
		]);
		const final = suggestedEdit.apply(originalDocument);
		expect(final).toStrictEqual(`
function getEnvVar(name): string | undefined {
	const value = process.env[name] || undefined;
	if (!value) {
		console.warn(\`Environment variable \${name} is not set\`);
	}
	return value;
}

function main() {
	const foo = getEnvVar("FOO");
	if (!foo) {
		return;
	}
	// Do something with foo
}
`);
		const currentDocument = userEdit.apply(originalDocument);
		expect(currentDocument).toStrictEqual(`
function getEnvVar(name): string | undefined {
	const value = process.env[name] || undefined;
	if (!value) {
		console.warn(\`Environment variable \${name} is not set\`);
	}
	return value;
}

function main() {
	const foo = getEnvVar("FOO");
	if (!foo) {
		return;
	}



	// Do something with foo
}
`);

		const logger = new TestLogService();
		expect(tryRebase(originalDocument, undefined, suggestedEdit.replacements, [], userEdit, currentDocument, [], 'strict', logger)).toStrictEqual('rebaseFailed');
		expect(tryRebase(originalDocument, undefined, suggestedEdit.replacements, [], userEdit, currentDocument, [], 'lenient', logger)).toStrictEqual('rebaseFailed');
	});

	test('tryRebase correct offsets', async () => {
		const originalDocument = `
#include <vector>
namespace
{
size_t func()
{
    std::vector<int> result42;
    if (result.empty())
        return result.size();
    result.clear();
    return result.size();
}
}


int main()
{
    return 0;
}
`;
		const suggestedEdit = StringEdit.create([
			StringReplacement.replace(new OffsetRange(78, 178), `    if (result42.empty())
        return result42.size();
    result42.clear();
    return result42.size();
`),
		]);
		const userEdit = StringEdit.create([
			StringReplacement.replace(new OffsetRange(86, 92), `r`),
		]);
		const final = suggestedEdit.apply(originalDocument);
		expect(final).toStrictEqual(`
#include <vector>
namespace
{
size_t func()
{
    std::vector<int> result42;
    if (result42.empty())
        return result42.size();
    result42.clear();
    return result42.size();
}
}


int main()
{
    return 0;
}
`);
		const currentDocument = userEdit.apply(originalDocument);
		expect(currentDocument).toStrictEqual(`
#include <vector>
namespace
{
size_t func()
{
    std::vector<int> result42;
    if (r.empty())
        return result.size();
    result.clear();
    return result.size();
}
}


int main()
{
    return 0;
}
`);

		const logger = new TestLogService();
		{
			const res = tryRebase(originalDocument, undefined, suggestedEdit.replacements, [], userEdit, currentDocument, [], 'strict', logger);
			expect(res).toBeTypeOf('object');
			const result = res as Exclude<typeof res, string | undefined>;
			expect(result[0].rebasedEditIndex).toBe(0);
			expect(StringEdit.single(result[0].rebasedEdit).apply(currentDocument)).toStrictEqual(final);
			expect(result[0].rebasedEdit.removeCommonSuffixAndPrefix(currentDocument).toString()).toMatchInlineSnapshot(`"[87, 164) -> "esult42.empty())\\n        return result42.size();\\n    result42.clear();\\n    return result42""`);
		}
		{
			const res = tryRebase(originalDocument, undefined, suggestedEdit.replacements, [], userEdit, currentDocument, [], 'lenient', logger);
			expect(res).toBeTypeOf('object');
			const result = res as Exclude<typeof res, string | undefined>;
			expect(result[0].rebasedEditIndex).toBe(0);
			expect(StringEdit.single(result[0].rebasedEdit).apply(currentDocument)).toStrictEqual(final);
			expect(result[0].rebasedEdit.removeCommonSuffixAndPrefix(currentDocument).toString()).toMatchInlineSnapshot(`"[87, 164) -> "esult42.empty())\\n        return result42.size();\\n    result42.clear();\\n    return result42""`);
		}
	});

	test('tryRebase fails when user types characters absent from the suggestion', () => {
		// Document state when suggestion was cached:
		//   "function fib\n"
		//                ^ cursor at offset 12
		//
		// Suggestion (two edits):
		//   edit 0: replace [0,12) "function fib" → "function fib(n: number): number {"
		//   edit 1: insert at 34                  → "    if (n <= 1) return n;\n    return fib(n - 1) + fib(n - 2);\n}\n"
		//
		// User then types "()" at offset 12, producing:
		//   "function fib()\n"
		//
		// Rebase fails because the diff of edit 0 inserts "(n: number): number {" at offset 12,
		// but the user typed "()" — and "()" is not a substring of "(n: number): number {",
		// so agreementIndexOf returns -1 and the rebase cannot reconcile the two.
		const originalDocument = 'function fib\n';
		const originalEdits = [
			StringReplacement.replace(new OffsetRange(0, 12), 'function fib(n: number): number {'),
			StringReplacement.replace(new OffsetRange(34, 34), '    if (n <= 1) return n;\n    return fib(n - 1) + fib(n - 2);\n}\n'),
		];
		const userEditSince = StringEdit.create([
			StringReplacement.replace(new OffsetRange(12, 12), '()'),
		]);
		const currentDocumentContent = 'function fib()\n';
		const editWindow = new OffsetRange(0, 13);
		const currentSelection = [new OffsetRange(13, 13)];

		const logger = new TestLogService();
		expect(tryRebase(originalDocument, editWindow, originalEdits, [], userEditSince, currentDocumentContent, currentSelection, 'strict', logger)).toBe('rebaseFailed');
		expect(tryRebase(originalDocument, editWindow, originalEdits, [], userEditSince, currentDocumentContent, currentSelection, 'lenient', logger)).toBe('rebaseFailed');
	});

	test('absorbSubsequenceTyping: parentheses typed by user are absorbed', () => {
		// The "()" the user typed is a subsequence of the suggestion's "(n: number): number {",
		// so the rebased edit replaces it with the suggestion's text.
		const originalDocument = 'function fib\n';
		const originalEdits = [
			StringReplacement.replace(new OffsetRange(0, 12), 'function fib(n: number): number {'),
			StringReplacement.replace(new OffsetRange(34, 34), '    if (n <= 1) return n;\n    return fib(n - 1) + fib(n - 2);\n}\n'),
		];
		const userEditSince = StringEdit.create([
			StringReplacement.replace(new OffsetRange(12, 12), '()'),
		]);
		const currentDocumentContent = 'function fib()\n';
		const editWindow = new OffsetRange(0, 13);
		const currentSelection = [new OffsetRange(13, 13)];
		const nesConfigs = { absorbSubsequenceTyping: true, maxImperfectAgreementLength };
		const logger = new TestLogService();

		const final = 'function fib(n: number): number {\n    if (n <= 1) return n;\n    return fib(n - 1) + fib(n - 2);\n}\n';

		{
			const res = tryRebase(originalDocument, editWindow, originalEdits, [], userEditSince, currentDocumentContent, currentSelection, 'strict', logger, nesConfigs);
			expect(res).toBeTypeOf('object');
			const result = res as Exclude<typeof res, string>;
			expect(StringEdit.create(result.map(r => r.rebasedEdit)).apply(currentDocumentContent)).toBe(final);
		}
		{
			const res = tryRebase(originalDocument, editWindow, originalEdits, [], userEditSince, currentDocumentContent, currentSelection, 'lenient', logger, nesConfigs);
			expect(res).toBeTypeOf('object');
			const result = res as Exclude<typeof res, string>;
			expect(StringEdit.create(result.map(r => r.rebasedEdit)).apply(currentDocumentContent)).toBe(final);
		}
	});

	test('absorbSubsequenceTyping: user types partial params "(n: )" NOT absorbed (not an auto-close pair)', () => {
		// User types "(n: )" in "function fib" → "function fib(n: )\n"
		// "(n: )" is a subsequence of the suggestion but is NOT an auto-close pair,
		// so absorption does not apply.
		const originalDocument = 'function fib\n';
		const originalEdits = [
			StringReplacement.replace(new OffsetRange(0, 12), 'function fib(n: number): number {'),
			StringReplacement.replace(new OffsetRange(34, 34), '    if (n <= 1) return n;\n    return fib(n - 1) + fib(n - 2);\n}\n'),
		];
		const userEditSince = StringEdit.create([
			StringReplacement.replace(new OffsetRange(12, 12), '(n: )'),
		]);
		const currentDocumentContent = 'function fib(n: )\n';
		const editWindow = new OffsetRange(0, 13);
		const currentSelection = [new OffsetRange(16, 16)];
		const nesConfigs = { absorbSubsequenceTyping: true, maxImperfectAgreementLength };
		const logger = new TestLogService();

		expect(tryRebase(originalDocument, editWindow, originalEdits, [], userEditSince, currentDocumentContent, currentSelection, 'strict', logger, nesConfigs)).toBe('rebaseFailed');
		expect(tryRebase(originalDocument, editWindow, originalEdits, [], userEditSince, currentDocumentContent, currentSelection, 'lenient', logger, nesConfigs)).toBe('rebaseFailed');
	});

	test('absorbSubsequenceTyping: semicolon NOT absorbed when it cannot align with suggestion', () => {
		// User types ";" but suggestion wants to insert ": string = \"hello\""
		// ";" is not a subsequence of ": string = \"hello\"", so absorption fails
		const originalDocument = 'const x\n';
		const originalEdits = [
			StringReplacement.replace(new OffsetRange(0, 7), 'const x: string = "hello"'),
		];
		const userEditSince = StringEdit.create([
			StringReplacement.replace(new OffsetRange(7, 7), ';'),
		]);
		const currentDocumentContent = 'const x;\n';
		const editWindow = new OffsetRange(0, 8);
		const currentSelection = [new OffsetRange(8, 8)];
		const nesConfigs = { absorbSubsequenceTyping: true, maxImperfectAgreementLength };
		const logger = new TestLogService();

		expect(tryRebase(originalDocument, editWindow, originalEdits, [], userEditSince, currentDocumentContent, currentSelection, 'strict', logger, nesConfigs)).toBe('rebaseFailed');
		expect(tryRebase(originalDocument, editWindow, originalEdits, [], userEditSince, currentDocumentContent, currentSelection, 'lenient', logger, nesConfigs)).toBe('rebaseFailed');
	});

	test('absorbSubsequenceTyping: semicolon NOT absorbed (not an auto-close pair)', () => {
		// User types ";" and suggestion inserts ": string = \"hello\";"
		// ";" is present in the suggestion but is NOT an auto-close pair,
		// so absorption does not apply.
		const originalDocument = 'const x\n';
		const originalEdits = [
			StringReplacement.replace(new OffsetRange(0, 7), 'const x: string = "hello";'),
		];
		const userEditSince = StringEdit.create([
			StringReplacement.replace(new OffsetRange(7, 7), ';'),
		]);
		const currentDocumentContent = 'const x;\n';
		const editWindow = new OffsetRange(0, 8);
		const currentSelection = [new OffsetRange(8, 8)];
		const nesConfigs = { absorbSubsequenceTyping: true, maxImperfectAgreementLength };
		const logger = new TestLogService();

		// Strict rejects the exact match (offset 25 > maxAgreementOffset) and absorption
		// doesn't apply because ";" is not an auto-close pair.
		expect(tryRebase(originalDocument, editWindow, originalEdits, [], userEditSince, currentDocumentContent, currentSelection, 'strict', logger, nesConfigs)).toBe('rebaseFailed');
	});

	test('absorbSubsequenceTyping: text NOT a subsequence of suggestion is NOT absorbed', () => {
		// User types "abc" — not a subsequence of "(n: number): number {", so not absorbed
		const originalDocument = 'function fib\n';
		const originalEdits = [
			StringReplacement.replace(new OffsetRange(0, 12), 'function fib(n: number): number {'),
			StringReplacement.replace(new OffsetRange(34, 34), '    if (n <= 1) return n;\n    return fib(n - 1) + fib(n - 2);\n}\n'),
		];
		const userEditSince = StringEdit.create([
			StringReplacement.replace(new OffsetRange(12, 12), 'abc'),
		]);
		const currentDocumentContent = 'function fibabc\n';
		const editWindow = new OffsetRange(0, 13);
		const currentSelection = [new OffsetRange(15, 15)];
		const nesConfigs = { absorbSubsequenceTyping: true, maxImperfectAgreementLength };
		const logger = new TestLogService();

		expect(tryRebase(originalDocument, editWindow, originalEdits, [], userEditSince, currentDocumentContent, currentSelection, 'strict', logger, nesConfigs)).toBe('rebaseFailed');
		expect(tryRebase(originalDocument, editWindow, originalEdits, [], userEditSince, currentDocumentContent, currentSelection, 'lenient', logger, nesConfigs)).toBe('rebaseFailed');
	});

	test('absorbSubsequenceTyping: text NOT a subsequence of suggestion is NOT absorbed (2)', () => {
		// User types "(a" — "a" is not found in "(n: number): number {", so not absorbed
		const originalDocument = 'function fib\n';
		const originalEdits = [
			StringReplacement.replace(new OffsetRange(0, 12), 'function fib(n: number): number {'),
			StringReplacement.replace(new OffsetRange(34, 34), '    if (n <= 1) return n;\n    return fib(n - 1) + fib(n - 2);\n}\n'),
		];
		const userEditSince = StringEdit.create([
			StringReplacement.replace(new OffsetRange(12, 12), '(a'),
		]);
		const currentDocumentContent = 'function fib(a\n';
		const editWindow = new OffsetRange(0, 13);
		const currentSelection = [new OffsetRange(14, 14)];
		const nesConfigs = { absorbSubsequenceTyping: true, maxImperfectAgreementLength };
		const logger = new TestLogService();

		expect(tryRebase(originalDocument, editWindow, originalEdits, [], userEditSince, currentDocumentContent, currentSelection, 'strict', logger, nesConfigs)).toBe('rebaseFailed');
		expect(tryRebase(originalDocument, editWindow, originalEdits, [], userEditSince, currentDocumentContent, currentSelection, 'lenient', logger, nesConfigs)).toBe('rebaseFailed');
	});

	test('absorbSubsequenceTyping: config disabled means punctuation is NOT absorbed', () => {
		// Same fib scenario with "()" but config is explicitly false
		const originalDocument = 'function fib\n';
		const originalEdits = [
			StringReplacement.replace(new OffsetRange(0, 12), 'function fib(n: number): number {'),
			StringReplacement.replace(new OffsetRange(34, 34), '    if (n <= 1) return n;\n    return fib(n - 1) + fib(n - 2);\n}\n'),
		];
		const userEditSince = StringEdit.create([
			StringReplacement.replace(new OffsetRange(12, 12), '()'),
		]);
		const currentDocumentContent = 'function fib()\n';
		const editWindow = new OffsetRange(0, 13);
		const currentSelection = [new OffsetRange(13, 13)];
		const logger = new TestLogService();

		// Explicitly disabled
		expect(tryRebase(originalDocument, editWindow, originalEdits, [], userEditSince, currentDocumentContent, currentSelection, 'strict', logger, { absorbSubsequenceTyping: false, maxImperfectAgreementLength })).toBe('rebaseFailed');
		// Default (no config)
		expect(tryRebase(originalDocument, editWindow, originalEdits, [], userEditSince, currentDocumentContent, currentSelection, 'strict', logger)).toBe('rebaseFailed');
	});

	test('absorbSubsequenceTyping: normal agreement still works when user types text present in suggestion', () => {
		// User types "(n" which IS a prefix found in the suggestion "(n: number): number {"
		// Normal agreement should handle this regardless of the config
		const originalDocument = 'function fib\n';
		const suggestedEdit = StringEdit.create([
			StringReplacement.replace(new OffsetRange(0, 12), 'function fib(n: number): number {'),
		]);
		const userEdit = StringEdit.create([
			StringReplacement.replace(new OffsetRange(12, 12), '(n'),
		]);
		const currentDocument = userEdit.apply(originalDocument);
		expect(currentDocument).toBe('function fib(n\n');

		const nesConfigs = { absorbSubsequenceTyping: true, maxImperfectAgreementLength };
		const res = tryRebaseStringEdits(originalDocument, suggestedEdit, userEdit, 'strict', nesConfigs);
		expect(res).toBeDefined();
		expect(res!.apply(currentDocument)).toBe(suggestedEdit.apply(originalDocument));
	});

	test('absorbSubsequenceTyping via tryRebaseStringEdits: single curly brace NOT absorbed (not an auto-close pair)', () => {
		const text = 'if (true)\n';
		const suggestion = StringEdit.create([
			StringReplacement.replace(new OffsetRange(0, 9), 'if (true) {\n    console.log("yes");\n}'),
		]);
		const userEdit = StringEdit.create([
			StringReplacement.replace(new OffsetRange(9, 9), '{'),
		]);
		const current = userEdit.apply(text);
		expect(current).toBe('if (true){\n');

		// Without config: fails
		expect(tryRebaseStringEdits(text, suggestion, userEdit, 'strict')).toBeUndefined();

		// With config: still fails because a single "{" is not an auto-close pair
		expect(tryRebaseStringEdits(text, suggestion, userEdit, 'strict', { absorbSubsequenceTyping: true, maxImperfectAgreementLength })).toBeUndefined();
	});

	test('absorbSubsequenceTyping: "{}" NOT absorbed when suggestion only has opening brace', () => {
		// User types "{}" but suggestion only inserts " {" (no closing brace in suggestion text)
		// "}" is not found after "{" in " {", so subsequence check fails
		const text = 'if (true)\n';
		const suggestion = StringEdit.create([
			StringReplacement.replace(new OffsetRange(0, 9), 'if (true) {\n    console.log("yes");'),
		]);
		const userEdit = StringEdit.create([
			StringReplacement.replace(new OffsetRange(9, 9), '{}'),
		]);
		const current = userEdit.apply(text);
		expect(current).toBe('if (true){}\n');

		expect(tryRebaseStringEdits(text, suggestion, userEdit, 'strict', { absorbSubsequenceTyping: true, maxImperfectAgreementLength })).toBeUndefined();
	});

	test('absorbSubsequenceTyping: "{}" absorbed when suggestion has both braces', () => {
		const text = 'if (true)\n';
		const suggestion = StringEdit.create([
			StringReplacement.replace(new OffsetRange(0, 9), 'if (true) {\n    console.log("yes");\n}'),
		]);
		const userEdit = StringEdit.create([
			StringReplacement.replace(new OffsetRange(9, 9), '{}'),
		]);
		const current = userEdit.apply(text);
		expect(current).toBe('if (true){}\n');

		const final = suggestion.apply(text);
		expect(final).toBe('if (true) {\n    console.log("yes");\n}\n');

		const result = tryRebaseStringEdits(text, suggestion, userEdit, 'strict', { absorbSubsequenceTyping: true, maxImperfectAgreementLength });
		expect(result).toBeDefined();
		expect(result!.apply(current)).toBe(final);
	});

	test('absorbSubsequenceTyping: "{}" typed after function signature, suggestion fills body', () => {
		// User types "{}" after "function fib(n: number) " → "function fib(n: number) {}\n"
		// Suggestion wants to replace with a full function body including { ... }
		// "{}" is a subsequence of "{\n    if ...\n}" so absorption succeeds
		const originalDocument = 'function fib(n: number) \n';
		const originalEdits = [
			StringReplacement.replace(new OffsetRange(0, 24), 'function fib(n: number) {\n    if (n <= 1) return 1;\n    return n * factorial(n - 1);\n}'),
		];
		const userEditSince = StringEdit.create([
			StringReplacement.replace(new OffsetRange(24, 24), '{}'),
		]);
		const currentDocumentContent = 'function fib(n: number) {}\n';
		const editWindow = new OffsetRange(0, 25);
		const currentSelection = [new OffsetRange(26, 26)];
		const nesConfigs = { absorbSubsequenceTyping: true, maxImperfectAgreementLength };
		const logger = new TestLogService();

		const final = 'function fib(n: number) {\n    if (n <= 1) return 1;\n    return n * factorial(n - 1);\n}\n';

		{
			const res = tryRebase(originalDocument, editWindow, originalEdits, [], userEditSince, currentDocumentContent, currentSelection, 'strict', logger, nesConfigs);
			expect(res).toBeTypeOf('object');
			const result = res as Exclude<typeof res, string>;
			expect(StringEdit.create(result.map(r => r.rebasedEdit)).apply(currentDocumentContent)).toBe(final);
		}
		{
			const res = tryRebase(originalDocument, editWindow, originalEdits, [], userEditSince, currentDocumentContent, currentSelection, 'lenient', logger, nesConfigs);
			expect(res).toBeTypeOf('object');
			const result = res as Exclude<typeof res, string>;
			expect(StringEdit.create(result.map(r => r.rebasedEdit)).apply(currentDocumentContent)).toBe(final);
		}
	});
});

suite('NextEditCache.tryRebaseStringEdits', () => {
	test('insert', () => {
		const text = 'class Point3 {';
		const edit = StringEdit.create([
			StringReplacement.replace(new OffsetRange(0, 14), 'class Point3D {'),
		]);
		const base = StringEdit.create([
			StringReplacement.replace(new OffsetRange(12, 12), 'D'),
		]);
		expect(edit.apply(text)).toStrictEqual('class Point3D {');
		expect(base.apply(text)).toStrictEqual('class Point3D {');

		expect(tryRebaseStringEdits(text, edit, base, 'strict')?.replacements.toString()).toMatchInlineSnapshot(`"[0, 15) -> "class Point3D {""`);
		expect(tryRebaseStringEdits(text, edit, base, 'lenient')?.replacements.toString()).toMatchInlineSnapshot(`"[0, 15) -> "class Point3D {""`);
	});
	test('replace', () => {
		const text = 'class Point3d {';
		const edit = StringEdit.create([
			StringReplacement.replace(new OffsetRange(0, 15), 'class Point3D {'),
		]);
		const base = StringEdit.create([
			StringReplacement.replace(new OffsetRange(12, 13), 'D'),
		]);
		expect(edit.apply(text)).toStrictEqual('class Point3D {');
		expect(base.apply(text)).toStrictEqual('class Point3D {');

		expect(tryRebaseStringEdits(text, edit, base, 'strict')?.replacements.toString()).toMatchInlineSnapshot(`"[0, 15) -> "class Point3D {""`);
		expect(tryRebaseStringEdits(text, edit, base, 'lenient')?.replacements.toString()).toMatchInlineSnapshot(`"[0, 15) -> "class Point3D {""`);
	});
	test('delete', () => {
		const text = 'class Point34D {';
		const edit = StringEdit.create([
			StringReplacement.replace(new OffsetRange(0, 16), 'class Point3D {'),
		]);
		const base = StringEdit.create([
			StringReplacement.replace(new OffsetRange(12, 13), ''),
		]);
		expect(edit.apply(text)).toStrictEqual('class Point3D {');
		expect(base.apply(text)).toStrictEqual('class Point3D {');

		expect(tryRebaseStringEdits(text, edit, base, 'strict')?.replacements.toString()).toMatchInlineSnapshot(`"[0, 15) -> "class Point3D {""`);
		expect(tryRebaseStringEdits(text, edit, base, 'lenient')?.replacements.toString()).toMatchInlineSnapshot(`"[0, 15) -> "class Point3D {""`);
	});
	test('insert', () => {
		const text = 'class Point3 {';
		const edit = StringEdit.create([
			StringReplacement.replace(new OffsetRange(0, 14), 'class Point3D {'),
		]);
		const base = StringEdit.create([
			StringReplacement.replace(new OffsetRange(12, 12), 'd'),
		]);
		expect(edit.apply(text)).toStrictEqual('class Point3D {');
		expect(base.apply(text)).toStrictEqual('class Point3d {');

		expect(tryRebaseStringEdits(text, edit, base, 'strict')?.replacements.toString()).toBeUndefined();
		expect(tryRebaseStringEdits(text, edit, base, 'lenient')?.replacements.toString()).toBeUndefined();
	});

	test('insert 2 edits', () => {
		const text = `
class Point3D {
	constructor(x, y) {
		this.x = x;
		this.y = y;
	}
}
`;
		const edit = StringEdit.create([
			StringReplacement.replace(new OffsetRange(17, 37), '	constructor(x, y, z) {'),
			StringReplacement.replace(new OffsetRange(66, 66), '		this.z = z;\n'),
		]);
		const base = StringEdit.create([
			StringReplacement.replace(new OffsetRange(34, 34), ', z'),
		]);
		const final = edit.apply(text);
		expect(final).toStrictEqual(`
class Point3D {
	constructor(x, y, z) {
		this.x = x;
		this.y = y;
		this.z = z;
	}
}
`);
		const current = base.apply(text);
		expect(current).toStrictEqual(`
class Point3D {
	constructor(x, y, z) {
		this.x = x;
		this.y = y;
	}
}
`);

		const strict = tryRebaseStringEdits(text, edit, base, 'strict')?.removeCommonSuffixAndPrefix(current);
		expect(strict?.apply(current)).toStrictEqual(final);
		expect(strict?.replacements.toString()).toMatchInlineSnapshot(`"[69, 69) -> "\\t\\tthis.z = z;\\n""`);
		const lenient = tryRebaseStringEdits(text, edit, base, 'lenient')?.removeCommonSuffixAndPrefix(current);
		expect(lenient?.apply(current)).toStrictEqual(final);
		expect(lenient?.replacements.toString()).toMatchInlineSnapshot(`"[69, 69) -> "\\t\\tthis.z = z;\\n""`);
	});
	test('insert 2 and 2 edits', () => {
		const text = `
class Point3D {
	constructor(x, y) {
		this.x = x;
		this.y = y;
	}
}
`;
		const edit = StringEdit.create([
			StringReplacement.replace(new OffsetRange(17, 37), '	constructor(x, y, z) {'),
			StringReplacement.replace(new OffsetRange(65, 65), '\n		this.z = z;'),
		]);
		const base = StringEdit.create([
			StringReplacement.replace(new OffsetRange(34, 34), ', z'),
			StringReplacement.replace(new OffsetRange(65, 65), '\n		this.z = z;'),
		]);
		const final = edit.apply(text);
		expect(final).toStrictEqual(`
class Point3D {
	constructor(x, y, z) {
		this.x = x;
		this.y = y;
		this.z = z;
	}
}
`);
		const current = base.apply(text);
		expect(current).toStrictEqual(`
class Point3D {
	constructor(x, y, z) {
		this.x = x;
		this.y = y;
		this.z = z;
	}
}
`);

		const strict = tryRebaseStringEdits(text, edit, base, 'strict')?.removeCommonSuffixAndPrefix(current);
		expect(strict?.apply(current)).toStrictEqual(final);
		expect(strict?.replacements.toString()).toMatchInlineSnapshot(`""`);
		const lenient = tryRebaseStringEdits(text, edit, base, 'lenient')?.removeCommonSuffixAndPrefix(current);
		expect(lenient?.apply(current)).toStrictEqual(final);
		expect(lenient?.replacements.toString()).toMatchInlineSnapshot(`""`);
	});
	test('insert 2 and 1 edits, 1 fully contained', () => {
		const text = `abcdefghi`;
		const suggestion = StringEdit.create([
			StringReplacement.replace(new OffsetRange(4, 5), '234'),
			StringReplacement.replace(new OffsetRange(7, 8), 'ABC'),
		]);
		const userEdit = StringEdit.create([
			StringReplacement.replace(new OffsetRange(1, 6), '123456'),
		]);
		const intermediate = suggestion.apply(text);
		expect(intermediate).toStrictEqual(`abcd234fgABCi`);
		const current = userEdit.apply(text);
		expect(current).toStrictEqual(`a123456ghi`);

		expect(tryRebaseStringEdits(text, suggestion, userEdit, 'strict')).toBeUndefined();
		expect(tryRebaseStringEdits(text, suggestion, userEdit, 'lenient')).toBeUndefined();
	});

	test('2 user edits contained in 1', () => {
		const text = `abcdef`;
		const suggestion = StringEdit.create([
			StringReplacement.replace(new OffsetRange(1, 4), 'b1c2d'),
		]);
		const applied = suggestion.apply(text);
		expect(applied).toStrictEqual(`ab1c2def`);

		const userEdit = StringEdit.create([
			StringReplacement.replace(new OffsetRange(2, 2), '1'),
			StringReplacement.replace(new OffsetRange(3, 3), '2'),
			StringReplacement.replace(new OffsetRange(5, 5), '3'),
		]);
		const current = userEdit.apply(text);
		expect(current).toStrictEqual(`ab1c2de3f`);

		expect(tryRebaseStringEdits(text, suggestion, userEdit, 'strict')).toBeUndefined();
		const lenient = tryRebaseStringEdits(text, suggestion, userEdit, 'lenient')?.removeCommonSuffixAndPrefix(current);
		expect(lenient?.apply(current)).toStrictEqual('ab1c2de3f');
		expect(lenient?.replacements.toString()).toMatchInlineSnapshot(`""`);
	});

	test('2 user edits contained in 1, conflicting 1', () => {
		const text = `abcde`;
		const suggestion = StringEdit.create([
			StringReplacement.replace(new OffsetRange(1, 4), 'b1c2d'),
		]);
		const applied = suggestion.apply(text);
		expect(applied).toStrictEqual(`ab1c2de`);

		const userEdit = StringEdit.create([
			StringReplacement.replace(new OffsetRange(2, 2), '1'),
			StringReplacement.replace(new OffsetRange(3, 3), '3'),
		]);
		const current = userEdit.apply(text);
		expect(current).toStrictEqual(`ab1c3de`);

		expect(tryRebaseStringEdits(text, suggestion, userEdit, 'strict')).toBeUndefined();
		expect(tryRebaseStringEdits(text, suggestion, userEdit, 'lenient')).toBeUndefined();
	});

	test('2 user edits contained in 1, conflicting 2', () => {
		const text = `abcde`;
		const suggestion = StringEdit.create([
			StringReplacement.replace(new OffsetRange(1, 4), 'b1c2d'),
		]);
		const applied = suggestion.apply(text);
		expect(applied).toStrictEqual(`ab1c2de`);

		const userEdit = StringEdit.create([
			StringReplacement.replace(new OffsetRange(2, 2), '2'),
			StringReplacement.replace(new OffsetRange(3, 3), '1'),
		]);
		const current = userEdit.apply(text);
		expect(current).toStrictEqual(`ab2c1de`);

		expect(tryRebaseStringEdits(text, suggestion, userEdit, 'strict')).toBeUndefined();
		expect(tryRebaseStringEdits(text, suggestion, userEdit, 'lenient')).toBeUndefined();
	});

	test('2 edits contained in 1 user edit', () => {
		const text = `abcdef`;
		const userEdit = StringEdit.create([
			StringReplacement.replace(new OffsetRange(1, 4), 'b1c2d'),
		]);
		const current = userEdit.apply(text);
		expect(current).toStrictEqual(`ab1c2def`);

		const suggestion = StringEdit.create([
			StringReplacement.replace(new OffsetRange(2, 2), '1'),
			StringReplacement.replace(new OffsetRange(3, 3), '2'),
			StringReplacement.replace(new OffsetRange(5, 5), '3'),
		]);
		const applied = suggestion.apply(text);
		expect(applied).toStrictEqual(`ab1c2de3f`);

		expect(tryRebaseStringEdits(text, suggestion, userEdit, 'strict')).toBeUndefined();
		expect(tryRebaseStringEdits(text, suggestion, userEdit, 'lenient')).toBeUndefined();
	});

	test('2 edits contained in 1 user edit, conflicting 1', () => {
		const text = `abcde`;
		const userEdit = StringEdit.create([
			StringReplacement.replace(new OffsetRange(1, 4), 'b1c2d'),
		]);
		const current = userEdit.apply(text);
		expect(current).toStrictEqual(`ab1c2de`);

		const suggestion = StringEdit.create([
			StringReplacement.replace(new OffsetRange(2, 2), '1'),
			StringReplacement.replace(new OffsetRange(3, 3), '3'),
		]);
		const applied = suggestion.apply(text);
		expect(applied).toStrictEqual(`ab1c3de`);

		expect(tryRebaseStringEdits(text, suggestion, userEdit, 'strict')).toBeUndefined();
		expect(tryRebaseStringEdits(text, suggestion, userEdit, 'lenient')).toBeUndefined();
	});

	test('2 edits contained in 1 user edit, conflicting 2', () => {
		const text = `abcde`;
		const userEdit = StringEdit.create([
			StringReplacement.replace(new OffsetRange(1, 4), 'b1c2d'),
		]);
		const current = userEdit.apply(text);
		expect(current).toStrictEqual(`ab1c2de`);

		const suggestion = StringEdit.create([
			StringReplacement.replace(new OffsetRange(2, 2), '2'),
			StringReplacement.replace(new OffsetRange(3, 3), '1'),
		]);
		const applied = suggestion.apply(text);
		expect(applied).toStrictEqual(`ab2c1de`);

		expect(tryRebaseStringEdits(text, suggestion, userEdit, 'strict')).toBeUndefined();
		expect(tryRebaseStringEdits(text, suggestion, userEdit, 'lenient')).toBeUndefined();
	});

	test('1 additional user edit', () => {
		const text = `abcdef`;
		const userEdit = StringEdit.create([
			StringReplacement.replace(new OffsetRange(2, 2), '1'),
			StringReplacement.replace(new OffsetRange(3, 3), '2'),
			StringReplacement.replace(new OffsetRange(5, 5), '3'),
		]);
		const current = userEdit.apply(text);
		expect(current).toStrictEqual(`ab1c2de3f`);

		const suggestion = StringEdit.create([
			StringReplacement.replace(new OffsetRange(2, 2), '1'),
			StringReplacement.replace(new OffsetRange(5, 5), '3'),
		]);
		const applied = suggestion.apply(text);
		expect(applied).toStrictEqual(`ab1cde3f`);

		expect(tryRebaseStringEdits(text, suggestion, userEdit, 'strict')).toBeUndefined();
		const lenient = tryRebaseStringEdits(text, suggestion, userEdit, 'lenient')?.removeCommonSuffixAndPrefix(current);
		expect(lenient?.apply(current)).toStrictEqual('ab1c2de3f');
		expect(lenient?.replacements.toString()).toMatchInlineSnapshot(`""`);
	});

	test('1 additional suggestion edit', () => {
		const text = `abcdef`;
		const userEdit = StringEdit.create([
			StringReplacement.replace(new OffsetRange(2, 2), '1'),
			StringReplacement.replace(new OffsetRange(5, 5), '3'),
		]);
		const current = userEdit.apply(text);
		expect(current).toStrictEqual(`ab1cde3f`);

		const suggestion = StringEdit.create([
			StringReplacement.replace(new OffsetRange(2, 2), '1'),
			StringReplacement.replace(new OffsetRange(3, 3), '2'),
			StringReplacement.replace(new OffsetRange(5, 5), '3'),
		]);
		const applied = suggestion.apply(text);
		expect(applied).toStrictEqual(`ab1c2de3f`);

		const strict = tryRebaseStringEdits(text, suggestion, userEdit, 'strict');
		expect(strict?.apply(current)).toStrictEqual('ab1c2de3f');
		expect(strict?.removeCommonSuffixAndPrefix(current).replacements.toString()).toMatchInlineSnapshot(`"[4, 4) -> "2""`);
		const lenient = tryRebaseStringEdits(text, suggestion, userEdit, 'lenient');
		expect(lenient?.apply(current)).toStrictEqual('ab1c2de3f');
		expect(lenient?.removeCommonSuffixAndPrefix(current).replacements.toString()).toMatchInlineSnapshot(`"[4, 4) -> "2""`);
	});

	test('shifted edits 1', () => {
		const text = `abcde`;
		const userEdit = StringEdit.create([
			StringReplacement.replace(new OffsetRange(2, 2), 'c1'),
		]);
		const current = userEdit.apply(text);
		expect(current).toStrictEqual(`abc1cde`);

		const suggestion = StringEdit.create([
			StringReplacement.replace(new OffsetRange(1, 1), '0'),
			StringReplacement.replace(new OffsetRange(3, 3), '1c'),
			StringReplacement.replace(new OffsetRange(4, 4), '2'),
		]);
		const applied = suggestion.apply(text);
		expect(applied).toStrictEqual(`a0bc1cd2e`);

		const strict = tryRebaseStringEdits(text, suggestion, userEdit, 'strict');
		expect(strict?.apply(current)).toStrictEqual('a0bc1cd2e');
		expect(strict?.removeCommonSuffixAndPrefix(current).replacements.toString()).toMatchInlineSnapshot(`"[1, 1) -> "0",[6, 6) -> "2""`);
		const lenient = tryRebaseStringEdits(text, suggestion, userEdit, 'lenient');
		expect(lenient?.apply(current)).toStrictEqual('a0bc1cd2e');
		expect(lenient?.removeCommonSuffixAndPrefix(current).replacements.toString()).toMatchInlineSnapshot(`"[1, 1) -> "0",[6, 6) -> "2""`);
	});

	test('shifted edits 2', () => {
		const text = `abcde`;
		const userEdit = StringEdit.create([
			StringReplacement.replace(new OffsetRange(3, 3), '1c'),
		]);
		const current = userEdit.apply(text);
		expect(current).toStrictEqual(`abc1cde`);

		const suggestion = StringEdit.create([
			StringReplacement.replace(new OffsetRange(1, 1), '0'),
			StringReplacement.replace(new OffsetRange(2, 2), 'c1'),
		]);
		const applied = suggestion.apply(text);
		expect(applied).toStrictEqual(`a0bc1cde`);

		const strict = tryRebaseStringEdits(text, suggestion, userEdit, 'strict');
		expect(strict?.apply(current)).toStrictEqual('a0bc1cde');
		expect(strict?.removeCommonSuffixAndPrefix(current).replacements.toString()).toMatchInlineSnapshot(`"[1, 1) -> "0""`);
		const lenient = tryRebaseStringEdits(text, suggestion, userEdit, 'lenient');
		expect(lenient?.apply(current)).toStrictEqual('a0bc1cde');
		expect(lenient?.removeCommonSuffixAndPrefix(current).replacements.toString()).toMatchInlineSnapshot(`"[1, 1) -> "0""`);
	});

	test('user deletes 1', () => {
		const text = `abcde`;
		const userEdit = StringEdit.create([
			StringReplacement.replace(new OffsetRange(2, 3), ''),
		]);
		const current = userEdit.apply(text);
		expect(current).toStrictEqual(`abde`);

		const suggestion = StringEdit.create([
			StringReplacement.replace(new OffsetRange(3, 3), '1c'),
		]);
		const applied = suggestion.apply(text);
		expect(applied).toStrictEqual(`abc1cde`);

		expect(tryRebaseStringEdits(text, suggestion, userEdit, 'strict')).toBeUndefined();
		expect(tryRebaseStringEdits(text, suggestion, userEdit, 'lenient')).toBeUndefined();
	});

	test('user deletes 2', () => {
		const text = `abcde`;
		const userEdit = StringEdit.create([
			StringReplacement.replace(new OffsetRange(2, 3), ''),
		]);
		const current = userEdit.apply(text);
		expect(current).toStrictEqual(`abde`);

		const suggestion = StringEdit.create([
			StringReplacement.replace(new OffsetRange(2, 2), 'c1'),
		]);
		const applied = suggestion.apply(text);
		expect(applied).toStrictEqual(`abc1cde`);

		expect(tryRebaseStringEdits(text, suggestion, userEdit, 'strict')).toBeUndefined();
		expect(tryRebaseStringEdits(text, suggestion, userEdit, 'lenient')).toBeUndefined();
	});

	test('overlap: suggestion replaces in disagreement', () => {
		const text = `this.myPet = g`;
		const userEdit = StringEdit.create([
			StringReplacement.replace(new OffsetRange(14, 14), 'et'),
		]);
		const current = userEdit.apply(text);
		expect(current).toStrictEqual(`this.myPet = get`);

		const suggestion = StringEdit.create([
			StringReplacement.replace(new OffsetRange(13, 14), 'new Pet("Buddy", 3);'),
		]);
		const applied = suggestion.apply(text);
		expect(applied).toStrictEqual(`this.myPet = new Pet("Buddy", 3);`);

		expect(tryRebaseStringEdits(text, suggestion, userEdit, 'strict')).toBeUndefined();
		expect(tryRebaseStringEdits(text, suggestion, userEdit, 'lenient')).toBeUndefined();
	});

	test('overlap: suggestion replaces in agreement', () => {
		const text = `this.myPet = g`;
		const userEdit = StringEdit.create([
			StringReplacement.replace(new OffsetRange(14, 14), 'et'),
		]);
		const current = userEdit.apply(text);
		expect(current).toStrictEqual(`this.myPet = get`);

		const suggestion = StringEdit.create([
			StringReplacement.replace(new OffsetRange(13, 14), 'getPet();'),
		]);
		const applied = suggestion.apply(text);
		expect(applied).toStrictEqual(`this.myPet = getPet();`);

		const strict = tryRebaseStringEdits(text, suggestion, userEdit, 'strict');
		expect(strict?.apply(current)).toStrictEqual('this.myPet = getPet();');
		expect(strict?.removeCommonSuffixAndPrefix(current).replacements.toString()).toMatchInlineSnapshot(`"[16, 16) -> "Pet();""`);
		const lenient = tryRebaseStringEdits(text, suggestion, userEdit, 'lenient');
		expect(lenient?.apply(current)).toStrictEqual('this.myPet = getPet();');
		expect(lenient?.removeCommonSuffixAndPrefix(current).replacements.toString()).toMatchInlineSnapshot(`"[16, 16) -> "Pet();""`);
	});

	test('overlap: both replace in agreement 1', () => {
		const text = `abcdefg`;
		const userEdit = StringEdit.create([
			StringReplacement.replace(new OffsetRange(2, 5), 'CD'),
		]);
		const current = userEdit.apply(text);
		expect(current).toStrictEqual(`abCDfg`);

		const suggestion = StringEdit.create([
			StringReplacement.replace(new OffsetRange(1, 6), 'bCDEF'),
		]);
		const applied = suggestion.apply(text);
		expect(applied).toStrictEqual(`abCDEFg`);

		const strict = tryRebaseStringEdits(text, suggestion, userEdit, 'strict');
		expect(strict?.apply(current)).toStrictEqual('abCDEFg');
		expect(strict?.removeCommonSuffixAndPrefix(current).replacements.toString()).toMatchInlineSnapshot(`"[4, 5) -> "EF""`);
		const lenient = tryRebaseStringEdits(text, suggestion, userEdit, 'lenient');
		expect(lenient?.apply(current)).toStrictEqual('abCDEFg');
		expect(lenient?.removeCommonSuffixAndPrefix(current).replacements.toString()).toMatchInlineSnapshot(`"[4, 5) -> "EF""`);
	});

	test('overlap: both replace in agreement 2', () => {
		const text = `abcdefg`;
		const userEdit = StringEdit.create([
			StringReplacement.replace(new OffsetRange(1, 5), 'bC'),
		]);
		const current = userEdit.apply(text);
		expect(current).toStrictEqual(`abCfg`);

		const suggestion = StringEdit.create([
			StringReplacement.replace(new OffsetRange(2, 5), 'CDE'),
		]);
		const applied = suggestion.apply(text);
		expect(applied).toStrictEqual(`abCDEfg`);

		const strict = tryRebaseStringEdits(text, suggestion, userEdit, 'strict');
		expect(strict?.apply(current)).toStrictEqual('abCDEfg');
		expect(strict?.removeCommonSuffixAndPrefix(current).replacements.toString()).toMatchInlineSnapshot(`"[3, 3) -> "DE""`);
		const lenient = tryRebaseStringEdits(text, suggestion, userEdit, 'lenient');
		expect(lenient?.apply(current)).toStrictEqual('abCDEfg');
		expect(lenient?.removeCommonSuffixAndPrefix(current).replacements.toString()).toMatchInlineSnapshot(`"[3, 3) -> "DE""`);
	});

	test('overlap: both insert in agreement with large offset', () => {
		const text = `abcdefg`;
		const userEdit = StringEdit.create([
			StringReplacement.replace(new OffsetRange(7, 7), 'h'),
		]);
		const current = userEdit.apply(text);
		expect(current).toStrictEqual(`abcdefgh`);

		const suggestion1 = StringEdit.create([
			StringReplacement.replace(new OffsetRange(7, 7), 'x'.repeat(maxAgreementOffset) + 'h'),
		]);
		const applied1 = suggestion1.apply(text);
		expect(applied1).toStrictEqual(`abcdefg${'x'.repeat(maxAgreementOffset)}h`);

		const strict1 = tryRebaseStringEdits(text, suggestion1, userEdit, 'strict');
		expect(strict1?.apply(current)).toStrictEqual(applied1);
		expect(strict1?.removeCommonSuffixAndPrefix(current).replacements.toString()).toMatchInlineSnapshot(`"[7, 7) -> "${'x'.repeat(maxAgreementOffset)}""`);
		const lenient1 = tryRebaseStringEdits(text, suggestion1, userEdit, 'lenient');
		expect(lenient1?.apply(current)).toStrictEqual(applied1);
		expect(lenient1?.removeCommonSuffixAndPrefix(current).replacements.toString()).toMatchInlineSnapshot(`"[7, 7) -> "${'x'.repeat(maxAgreementOffset)}""`);

		const suggestion2 = StringEdit.create([
			StringReplacement.replace(new OffsetRange(7, 7), 'x'.repeat(maxAgreementOffset + 1) + 'h'),
		]);
		const applied2 = suggestion2.apply(text);
		expect(applied2).toStrictEqual(`abcdefg${'x'.repeat(maxAgreementOffset + 1)}h`);

		expect(tryRebaseStringEdits(text, suggestion2, userEdit, 'strict')).toBeUndefined();
		const lenient2 = tryRebaseStringEdits(text, suggestion2, userEdit, 'lenient');
		expect(lenient2?.apply(current)).toStrictEqual(applied2);
		expect(lenient2?.removeCommonSuffixAndPrefix(current).replacements.toString()).toMatchInlineSnapshot(`"[7, 7) -> "${'x'.repeat(maxAgreementOffset + 1)}""`);
	});

	test('overlap: both insert in agreement with an offset with longish user edit', () => {
		const text = `abcdefg`;
		const userEdit1 = StringEdit.create([
			StringReplacement.replace(new OffsetRange(7, 7), 'h'.repeat(maxImperfectAgreementLength)),
		]);
		const current1 = userEdit1.apply(text);
		expect(current1).toStrictEqual(`abcdefg${'h'.repeat(maxImperfectAgreementLength)}`);

		const suggestion = StringEdit.create([
			StringReplacement.replace(new OffsetRange(7, 7), `x${'h'.repeat(maxImperfectAgreementLength + 2)}x`),
		]);
		const applied = suggestion.apply(text);
		expect(applied).toStrictEqual(`abcdefgx${'h'.repeat(maxImperfectAgreementLength + 2)}x`);

		const strict1 = tryRebaseStringEdits(text, suggestion, userEdit1, 'strict');
		expect(strict1?.apply(current1)).toStrictEqual(applied);
		expect(strict1?.removeCommonSuffixAndPrefix(current1).replacements.toString()).toMatchInlineSnapshot(`"[7, ${7 + maxImperfectAgreementLength}) -> "x${'h'.repeat(maxImperfectAgreementLength + 2)}x""`);
		const lenient1 = tryRebaseStringEdits(text, suggestion, userEdit1, 'lenient');
		expect(lenient1?.apply(current1)).toStrictEqual(applied);
		expect(lenient1?.removeCommonSuffixAndPrefix(current1).replacements.toString()).toMatchInlineSnapshot(`"[7, ${7 + maxImperfectAgreementLength}) -> "x${'h'.repeat(maxImperfectAgreementLength + 2)}x""`);

		const userEdit2 = StringEdit.create([
			StringReplacement.replace(new OffsetRange(7, 7), 'h'.repeat(maxImperfectAgreementLength + 1)),
		]);
		const current2 = userEdit2.apply(text);
		expect(current2).toStrictEqual(`abcdefg${'h'.repeat(maxImperfectAgreementLength + 1)}`);

		expect(tryRebaseStringEdits(text, suggestion, userEdit2, 'strict')).toBeUndefined();
		const lenient2 = tryRebaseStringEdits(text, suggestion, userEdit2, 'lenient');
		expect(lenient2?.apply(current2)).toStrictEqual(applied);
		expect(lenient2?.removeCommonSuffixAndPrefix(current2).replacements.toString()).toMatchInlineSnapshot(`"[7, ${7 + maxImperfectAgreementLength + 1}) -> "x${'h'.repeat(maxImperfectAgreementLength + 2)}x""`);
	});

	test('reverse agreement: user typed more than model predicted at same position', () => {
		// Model predicts two edits: insert "{" and insert body.
		// User typed "{\n\t" which covers the first edit and the start of the second.
		// Rebase should succeed, offering the unconsumed portion of the second edit.
		const originalDocument = 'class Fibonacci \n';
		const originalEdits = [
			StringReplacement.replace(new OffsetRange(0, 16), 'class Fibonacci {'),
			StringReplacement.replace(OffsetRange.emptyAt(17), '\n\tprivate memo: Map<number, number>;\n}'),
		];
		const userEditSince = StringEdit.create([
			StringReplacement.replace(new OffsetRange(0, 16), 'class Fibonacci {\n\t'),
		]);
		const currentDocumentContent = 'class Fibonacci {\n\t\n';
		const nesConfigs = { reverseAgreement: true, maxImperfectAgreementLength };

		const logger = new TestLogService();
		// Without flag: rebase fails
		expect(tryRebase(originalDocument, undefined, originalEdits, [], userEditSince, currentDocumentContent, [], 'strict', logger)).toBe('rebaseFailed');
		// With flag: rebase succeeds
		const res = tryRebase(originalDocument, undefined, originalEdits, [], userEditSince, currentDocumentContent, [], 'strict', logger, nesConfigs);
		expect(res).toBeTypeOf('object');
		const result = res as Exclude<typeof res, string>;
		expect(result.length).toBe(1);
		expect(result[0].rebasedEditIndex).toBe(1);
		// The unconsumed portion of the body edit should be offered
		expect(result[0].rebasedEdit.newText).toContain('private memo');
	});

	test('reverse agreement: user typed exactly the first model edit', () => {
		// User typed exactly "{" which is the model's first edit.
		// The second edit (body) should be offered in full.
		// Note: this case is actually handled by the existing forward agreement path
		// (user text length == model text length), so it works regardless of the flag.
		const originalDocument = 'class Foo \n';
		const originalEdits = [
			StringReplacement.replace(new OffsetRange(0, 10), 'class Foo {'),
			StringReplacement.replace(OffsetRange.emptyAt(12), '\n\tbar(): void {}\n}'),
		];
		const userEditSince = StringEdit.create([
			StringReplacement.replace(new OffsetRange(0, 10), 'class Foo {'),
		]);
		const currentDocumentContent = 'class Foo {\n';

		const logger = new TestLogService();
		// Works without reverse agreement flag (handled by forward agreement)
		const res = tryRebase(originalDocument, undefined, originalEdits, [], userEditSince, currentDocumentContent, [], 'strict', logger);
		expect(res).toBeTypeOf('object');
		const result = res as Exclude<typeof res, string>;
		expect(result.length).toBe(1);
		expect(result[0].rebasedEditIndex).toBe(1);
		expect(result[0].rebasedEdit.newText).toContain('bar(): void {}');
	});

	test('reverse agreement: user typed completely different text — should conflict', () => {
		// Model: "class Foo " → "class Foo {"
		// User:  "class Foo " → "class Foo XYZ"
		// "XYZ" is NOT found in "{", so this should fail.
		const originalDocument = 'class Foo \n';
		const originalEdits = [
			StringReplacement.replace(new OffsetRange(0, 10), 'class Foo {'),
		];
		const userEditSince = StringEdit.create([
			StringReplacement.replace(new OffsetRange(0, 10), 'class Foo XYZ'),
		]);
		const currentDocumentContent = 'class Foo XYZ\n';
		const nesConfigs = { reverseAgreement: true, maxImperfectAgreementLength };

		const logger = new TestLogService();
		expect(tryRebase(originalDocument, undefined, originalEdits, [], userEditSince, currentDocumentContent, [], 'strict', logger, nesConfigs)).toBe('rebaseFailed');
		expect(tryRebase(originalDocument, undefined, originalEdits, [], userEditSince, currentDocumentContent, [], 'lenient', logger, nesConfigs)).toBe('rebaseFailed');
	});

	test('reverse agreement: user typed text that accidentally contains model text as substring', () => {
		// Model: replace [0,5) "hello" → "hello{" (diff: insert "{" at 5), then insert body at 6.
		// User: replace [0,5) "hello" → "helloXX{YY" (diff: insert "XX{YY" at 5).
		// The model's first diff ("{") IS found in user's "XX{YY" at offset 2, so it's consumed.
		// But the model's second edit ("\n\tworld\n}") can't be found in the remaining
		// user text "YY" — partial consumption also fails ("YY" doesn't start with "\n\tworld\n}").
		// So the rebase correctly fails for the second edit.
		const originalDocument = 'hello\n';
		const originalEdits = [
			StringReplacement.replace(new OffsetRange(0, 5), 'hello{'),
			StringReplacement.replace(OffsetRange.emptyAt(6), '\n\tworld\n}'),
		];
		const userEditSince = StringEdit.create([
			StringReplacement.replace(new OffsetRange(0, 5), 'helloXX{YY'),
		]);
		const currentDocumentContent = 'helloXX{YY\n';
		const nesConfigs = { reverseAgreement: true, maxImperfectAgreementLength };

		const logger = new TestLogService();
		// Fails because user's remaining text "YY" doesn't match model's second edit
		expect(tryRebase(originalDocument, undefined, originalEdits, [], userEditSince, currentDocumentContent, [], 'strict', logger, nesConfigs)).toBe('rebaseFailed');
		expect(tryRebase(originalDocument, undefined, originalEdits, [], userEditSince, currentDocumentContent, [], 'lenient', logger, nesConfigs)).toBe('rebaseFailed');
	});

	test('reverse agreement: user typed text with model text at large offset — strict rejects', () => {
		// Model: "a" → "a{"
		// User:  "a" → "a" + "X".repeat(15) + "{"
		// The "{" is at offset 15 into the user text, which exceeds maxAgreementOffset (10).
		// Strict should reject; lenient should also fail since there's no lenient fallback
		// in the reverse branch.
		const pad = 'X'.repeat(maxAgreementOffset + 1);
		const originalDocument = 'a\n';
		const originalEdits = [
			StringReplacement.replace(new OffsetRange(0, 1), 'a{'),
		];
		const userEditSince = StringEdit.create([
			StringReplacement.replace(new OffsetRange(0, 1), 'a' + pad + '{'),
		]);
		const currentDocumentContent = 'a' + pad + '{\n';
		const nesConfigs = { reverseAgreement: true, maxImperfectAgreementLength };

		const logger = new TestLogService();
		expect(tryRebase(originalDocument, undefined, originalEdits, [], userEditSince, currentDocumentContent, [], 'strict', logger, nesConfigs)).toBe('rebaseFailed');
	});

	test('reverse agreement: user typed long text at small offset — strict rejects imperfect agreement', () => {
		// Model: "a" → "a{"
		// User:  "a" → "aX" + "{".repeat(maxImperfectAgreementLength + 1)
		// The model text "{" is found at offset 1 (> 0) and the effective text length
		// is 1 (≤ maxImperfectAgreementLength), so this should pass strict.
		// But if effectiveText were longer...
		const longText = 'Z'.repeat(maxImperfectAgreementLength + 1);
		const originalDocument = 'a\n';
		const originalEdits = [
			StringReplacement.replace(new OffsetRange(0, 1), 'a' + longText),
		];
		const userEditSince = StringEdit.create([
			StringReplacement.replace(new OffsetRange(0, 1), 'aX' + longText),
		]);
		const currentDocumentContent = 'aX' + longText + '\n';
		const nesConfigs = { reverseAgreement: true, maxImperfectAgreementLength };

		const logger = new TestLogService();
		// offset = 1 > 0, effectiveText.length = longText.length > maxImperfectAgreementLength
		// → strict rejected
		expect(tryRebase(originalDocument, undefined, originalEdits, [], userEditSince, currentDocumentContent, [], 'strict', logger, nesConfigs)).toBe('rebaseFailed');
	});

	test('reverse agreement: all model edits fully consumed by user — no rebased edit emitted', () => {
		// Model predicts single edit: insert "{\n\t"
		// User typed "{\n\tfoo\n}" which fully contains "{\n\t"
		// All model edits consumed → nothing to offer
		const originalDocument = 'fn \n';
		const originalEdits = [
			StringReplacement.replace(new OffsetRange(0, 3), 'fn {\n\t'),
		];
		const userEditSince = StringEdit.create([
			StringReplacement.replace(new OffsetRange(0, 3), 'fn {\n\tfoo\n}'),
		]);
		const currentDocumentContent = 'fn {\n\tfoo\n}\n';
		const nesConfigs = { reverseAgreement: true, maxImperfectAgreementLength };

		const logger = new TestLogService();
		// Without flag: rebase fails
		expect(tryRebase(originalDocument, undefined, originalEdits, [], userEditSince, currentDocumentContent, [], 'strict', logger)).toBe('rebaseFailed');
		// With flag: succeeds with no edits to offer
		const res = tryRebase(originalDocument, undefined, originalEdits, [], userEditSince, currentDocumentContent, [], 'strict', logger, nesConfigs);
		expect(res).toBeTypeOf('object');
		const result = res as Exclude<typeof res, string>;
		// The single model edit was fully consumed — nothing left to suggest
		expect(result.length).toBe(0);
	});

	test('reverse agreement: consistency check — rebased edit applied to current doc produces expected result', () => {
		// This is the key correctness check: applying the rebased edit to the current
		// document should produce the same result as applying the original edits to
		// the original document.
		const originalDocument = 'class Fibonacci \n';
		const originalEdits = [
			StringReplacement.replace(new OffsetRange(0, 16), 'class Fibonacci {'),
			StringReplacement.replace(OffsetRange.emptyAt(17), '\n\tprivate memo: Map<number, number>;\n}'),
		];
		const userEditSince = StringEdit.create([
			StringReplacement.replace(new OffsetRange(0, 16), 'class Fibonacci {\n\t'),
		]);
		const currentDocumentContent = 'class Fibonacci {\n\t\n';
		const nesConfigs = { reverseAgreement: true, maxImperfectAgreementLength };

		// Expected final: apply both model edits in sequence to original
		const expectedFinal = new StringEdit([originalEdits[0]]).apply(originalDocument);
		const expectedFinal2 = new StringEdit([originalEdits[1]]).apply(expectedFinal);

		const logger = new TestLogService();
		const res = tryRebase(originalDocument, undefined, originalEdits, [], userEditSince, currentDocumentContent, [], 'strict', logger, nesConfigs);
		expect(res).toBeTypeOf('object');
		const result = res as Exclude<typeof res, string>;
		expect(result.length).toBe(1);

		// Apply rebased edit to current document
		const actualFinal = StringEdit.single(result[0].rebasedEdit).apply(currentDocumentContent);
		expect(actualFinal).toBe(expectedFinal2);
	});

	test('reverse agreement: pure inserts at same position — user insert is superset of model insert', () => {
		// Both edits are pure inserts at position 5.
		// Model inserts "X", user inserts "XY".
		// After removeCommonSuffixAndPrefix on user edit:
		//   user edit: insert at 5 → "XY", model edit: insert at 5 → "X"
		// These have equal replaceRange (both emptyAt(5)).
		// The reverse branch should fire: "X" found in "XY" at offset 0 → consumed.
		// Nothing left to suggest from this model edit.
		const originalDocument = 'hello world\n';
		const suggestedEdit = StringEdit.create([
			StringReplacement.replace(OffsetRange.emptyAt(5), 'X'),
		]);
		const userEdit = StringEdit.create([
			StringReplacement.replace(OffsetRange.emptyAt(5), 'XY'),
		]);
		const current = userEdit.apply(originalDocument);
		expect(current).toBe('helloXY world\n');

		// Without flag: rebase fails
		expect(tryRebaseStringEdits(originalDocument, suggestedEdit, userEdit, 'strict')).toBeUndefined();
		// With flag: model edit fully consumed → empty result
		const nesConfigs = { reverseAgreement: true, maxImperfectAgreementLength };
		const res = tryRebaseStringEdits(originalDocument, suggestedEdit, userEdit, 'strict', nesConfigs);
		expect(res).toBeDefined();
		expect(res!.replacements.length).toBe(0);
	});

	test('reverse agreement: does NOT fire when ranges differ', () => {
		// Model replaces [0,3), user replaces [0,5) — different ranges.
		// The reverse branch requires equal ranges, so this should NOT trigger it.
		// Instead, this falls through to the conflict branch.
		const originalDocument = 'abcde\n';
		const originalEdits = [
			StringReplacement.replace(new OffsetRange(0, 3), 'XYZ'),
		];
		const userEditSince = StringEdit.create([
			StringReplacement.replace(new OffsetRange(0, 5), 'XYZWV'),
		]);
		const currentDocumentContent = 'XYZWV\n';
		const nesConfigs = { reverseAgreement: true, maxImperfectAgreementLength };

		const logger = new TestLogService();
		// The ranges don't match after removeCommonSuffixAndPrefix, so this conflicts
		expect(tryRebase(originalDocument, undefined, originalEdits, [], userEditSince, currentDocumentContent, [], 'strict', logger, nesConfigs)).toBe('rebaseFailed');
	});
});

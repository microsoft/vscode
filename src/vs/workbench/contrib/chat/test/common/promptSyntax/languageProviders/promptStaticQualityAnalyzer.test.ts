/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IMarkerData, MarkerSeverity } from '../../../../../../../platform/markers/common/markers.js';
import { createTextModel } from '../../../../../../../editor/test/common/testTextModel.js';
import { PromptStaticQualityAnalyzer } from '../../../../common/promptSyntax/languageProviders/promptStaticQualityAnalyzer.js';

suite('PromptStaticQualityAnalyzer', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let analyzer: PromptStaticQualityAnalyzer;

	setup(() => {
		analyzer = new PromptStaticQualityAnalyzer();
	});

	function collect(text: string, bodyStartLine = 1): IMarkerData[] {
		const model = disposables.add(createTextModel(text));
		const markers: IMarkerData[] = [];
		analyzer.analyze(model, bodyStartLine, m => markers.push(m));
		return markers;
	}

	function findByCode(markers: IMarkerData[], code: string): IMarkerData[] {
		return markers.filter(m => {
			const markerCode = typeof m.code === 'string' ? m.code : '';
			return markerCode === code || markerCode.startsWith(code + ':');
		});
	}

	// --- Instruction strength ------------------------------------------------

	test('detects weak instruction language', () => {
		const markers = collect('You might consider using TypeScript.');
		const weak = findByCode(markers, 'prompt-quality-weak-instruction');
		assert.ok(weak.length > 0, 'Should flag "might" as weak instruction');
	});

	test('does not flag strong instruction language', () => {
		const markers = collect('You must always use TypeScript.');
		const weak = findByCode(markers, 'prompt-quality-weak-instruction');
		assert.deepStrictEqual(weak, []);
	});

	test('detects instruction dilution with many constraints', () => {
		const lines: string[] = [];
		for (let i = 0; i < 20; i++) {
			lines.push(`You must always follow rule ${i}.`);
		}
		const markers = collect(lines.join('\n'));
		const dilution = findByCode(markers, 'prompt-quality-instruction-dilution');
		assert.ok(dilution.length > 0, 'Should flag instruction dilution');
	});

	// --- Ambiguity detection -------------------------------------------------

	test('detects ambiguous quantifiers', () => {
		const markers = collect('Include several examples in your response.');
		const ambiguous = findByCode(markers, 'prompt-quality-ambiguous-quantifier');
		assert.ok(ambiguous.length > 0, 'Should flag "several" as ambiguous');
	});

	test('detects vague terms', () => {
		const markers = collect('Responses should be appropriate and in a professional tone.');
		const vague = findByCode(markers, 'prompt-quality-vague-term');
		assert.ok(vague.length > 0, 'Should flag vague terms');
	});

	test('detects unresolved positional references', () => {
		const markers = collect('Follow the guidelines mentioned above.');
		const unresolved = findByCode(markers, 'prompt-quality-unresolved-reference');
		assert.ok(unresolved.length > 0, 'Should flag "mentioned above"');
	});

	// --- Structure linting ---------------------------------------------------

	test('detects mixed XML and Markdown conventions', () => {
		const text = '# Header\n\nSome text\n\n<instructions>\nDo something\n</instructions>';
		const markers = collect(text);
		const mixed = findByCode(markers, 'prompt-quality-mixed-conventions');
		assert.ok(mixed.length > 0, 'Should flag mixed conventions');
	});

	test('detects unclosed XML tags', () => {
		const text = '<instructions>\nDo something\n';
		const markers = collect(text);
		const unclosed = findByCode(markers, 'prompt-quality-unclosed-tag');
		assert.ok(unclosed.length > 0, 'Should flag unclosed <instructions> tag');
	});

	test('does not flag balanced XML tags', () => {
		const text = '<instructions>\nDo something\n</instructions>';
		const markers = collect(text);
		const unclosed = findByCode(markers, 'prompt-quality-unclosed-tag');
		assert.deepStrictEqual(unclosed, []);
	});

	// --- Redundancy detection ------------------------------------------------

	test('detects redundant instructions', () => {
		const text = 'You must always use TypeScript for all code.\nYou must always use TypeScript for all code.';
		const markers = collect(text);
		const redundant = findByCode(markers, 'prompt-quality-redundant-instruction');
		assert.ok(redundant.length > 0, 'Should flag repeated instructions');
	});

	test('detects subsumed constraints (never/avoid)', () => {
		const text = 'Never use raw SQL in the codebase.\nAvoid raw SQL in the codebase.';
		const markers = collect(text);
		const subsumed = findByCode(markers, 'prompt-quality-subsumed-constraint');
		assert.ok(subsumed.length > 0, 'Should flag avoid subsumed by never');
	});

	// --- Example sufficiency -------------------------------------------------

	test('flags missing examples when output format is specified', () => {
		const text = 'Return the output as a JSON object with the following schema.';
		const markers = collect(text);
		const missing = findByCode(markers, 'prompt-quality-missing-examples');
		assert.ok(missing.length > 0, 'Should flag missing examples');
	});

	test('does not flag missing examples for plain text', () => {
		const text = 'You are a helpful assistant. Answer questions clearly.';
		const markers = collect(text);
		const missing = findByCode(markers, 'prompt-quality-missing-examples');
		assert.deepStrictEqual(missing, []);
	});

	test('detects input/output example mismatch', () => {
		const text = 'Example:\nInput: Hello\nOutput: Hi\nInput: Goodbye';
		const markers = collect(text);
		const mismatch = findByCode(markers, 'prompt-quality-example-mismatch');
		assert.ok(mismatch.length > 0, 'Should flag example mismatch');
	});

	// --- Range accuracy ------------------------------------------------------

	test('reports correct line and column for weak instruction', () => {
		const markers = collect('Line one.\nYou might want to do this.');
		const weak = findByCode(markers, 'prompt-quality-weak-instruction');
		assert.ok(weak.length > 0);
		const marker = weak.find(m => m.message.includes('might'));
		assert.ok(marker);
		assert.strictEqual(marker.startLineNumber, 2);
	});

	test('respects bodyStartLine offset', () => {
		const text = '---\ndescription: test\n---\nYou might do this.';
		const model = disposables.add(createTextModel(text));
		const markers: IMarkerData[] = [];
		// Body starts at line 4 (after frontmatter)
		analyzer.analyze(model, 4, m => markers.push(m));
		const weak = findByCode(markers, 'prompt-quality-weak-instruction');
		assert.ok(weak.length > 0);
		assert.strictEqual(weak[0].startLineNumber, 4);
	});

	// --- Severity levels -----------------------------------------------------

	test('weak instructions are Info severity', () => {
		const markers = collect('You might want to do this.');
		const weak = findByCode(markers, 'prompt-quality-weak-instruction');
		assert.ok(weak.length > 0);
		assert.strictEqual(weak[0].severity, MarkerSeverity.Info);
	});

	test('instruction dilution is Warning severity', () => {
		const lines: string[] = [];
		for (let i = 0; i < 20; i++) {
			lines.push(`You must always follow rule ${i}.`);
		}
		const markers = collect(lines.join('\n'));
		const dilution = findByCode(markers, 'prompt-quality-instruction-dilution');
		assert.ok(dilution.length > 0);
		assert.strictEqual(dilution[0].severity, MarkerSeverity.Warning);
	});

	// --- Clean prompts produce no markers ------------------------------------

	test('clean prompt produces no markers', () => {
		const text = 'You are a code review assistant.\n\nAlways check for security issues.\nNever approve code with SQL injection.\n\nExample:\nInput: SELECT * FROM users WHERE id = $id\nOutput: Potential SQL injection — use parameterized queries.';
		const markers = collect(text);
		const qualityMarkers = markers.filter(m => typeof m.code === 'string' && (m.code.startsWith('prompt-quality-') || m.code.includes(':suggestion:')));
		assert.deepStrictEqual(qualityMarkers, []);
	});

	// --- Variable validation -------------------------------------------------

	test('detects empty variable placeholder', () => {
		const markers = collect('Use {{}} for the value.');
		const empty = findByCode(markers, 'prompt-quality-empty-variable');
		assert.ok(empty.length > 0, 'Should flag empty {{}}');
		assert.strictEqual(empty[0].severity, MarkerSeverity.Error);
	});

	test('detects undefined variable', () => {
		const markers = collect('Hello {{custom_var}}, welcome!');
		const undef = findByCode(markers, 'prompt-quality-undefined-variable');
		assert.ok(undef.length > 0, 'Should flag undefined variable');
	});

	test('does not flag common context variables', () => {
		const markers = collect('Hello {{user_name}}, your {{input}} is received.');
		const undef = findByCode(markers, 'prompt-quality-undefined-variable');
		assert.deepStrictEqual(undef, []);
	});

	test('does not flag defined variables', () => {
		const markers = collect('my_var: some value\nUse {{my_var}} here.');
		const undef = findByCode(markers, 'prompt-quality-undefined-variable');
		assert.deepStrictEqual(undef, []);
	});

	// --- Token usage analysis ------------------------------------------------

	test('flags large prompts', () => {
		// Create a prompt with >2000 estimated tokens (~8000+ chars)
		const text = 'x'.repeat(9000);
		const markers = collect(text);
		const large = findByCode(markers, 'prompt-quality-large-prompt');
		assert.ok(large.length > 0, 'Should flag large prompt');
	});

	test('does not flag small prompts', () => {
		const markers = collect('A short prompt.');
		const large = findByCode(markers, 'prompt-quality-large-prompt');
		assert.deepStrictEqual(large, []);
	});

	test('flags inefficient tokenization for long acronyms', () => {
		const markers = collect('Use the ABCDEFGHIJKLMNOP protocol.');
		const inefficient = findByCode(markers, 'prompt-quality-inefficient-tokenization');
		assert.ok(inefficient.length > 0, 'Should flag long acronym');
	});
});

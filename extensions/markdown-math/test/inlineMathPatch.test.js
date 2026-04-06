/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

const assert = require('assert');
const path = require('path');

// Use markdown-it from the markdown-language-features extension
const markdownIt = require(path.join(__dirname, '..', '..', 'markdown-language-features', 'node_modules', 'markdown-it'));
const katexPlugin = require('@vscode/markdown-it-katex').default;

/**
 * Characters that, when appearing immediately after an opening `$`, indicate
 * that the `$` is not a math delimiter.
 */
const nonMathAfterDollarSign = new Set(['.', '(', '#', '\'', '"', ',', ';']);

/**
 * Patches the katex plugin's math_inline rule to prevent false-positive
 * math parsing when `$` is used as a non-math symbol.
 */
function patchInlineMathRule(md) {
	const inlineRules = md.inline.ruler.__rules__;
	if (!inlineRules) {
		return;
	}
	const mathInlineEntry = inlineRules.find(r => r.name === 'math_inline');
	if (!mathInlineEntry) {
		return;
	}
	const originalFn = mathInlineEntry.fn;
	mathInlineEntry.fn = function patchedInlineMath(state, silent) {
		if (state.src[state.pos] === '$') {
			const nextChar = state.src[state.pos + 1];
			if (nextChar && nonMathAfterDollarSign.has(nextChar)) {
				if (!silent) {
					state.pending += '$';
				}
				state.pos += 1;
				return true;
			}
		}
		return originalFn.call(this, state, silent);
	};
}

function createUnpatchedEngine() {
	const md = markdownIt({ html: true });
	md.use(katexPlugin);
	return md;
}

function createPatchedEngine() {
	const md = markdownIt({ html: true });
	md.use(katexPlugin);
	patchInlineMathRule(md);
	return md;
}

// ---- Tests ----

let passed = 0;
let failed = 0;

function test(name, fn) {
	try {
		fn();
		passed++;
		console.log(`  PASS: ${name}`);
	} catch (e) {
		failed++;
		console.log(`  FAIL: ${name}`);
		console.log(`        ${e.message}`);
	}
}

console.log('Suite: Inline math delimiter patch\n');

// --- Verify the problem exists without the patch ---

test('Unpatched: $.getJSON triggers katex parsing', () => {
	const md = createUnpatchedEngine();
	const result = md.render('$.getJSON, $.ajax');
	assert.ok(
		result.includes('katex'),
		`Expected katex class in output, got: ${result}`);
});

// --- Verify the patch fixes the problem ---

test('Patched: $.getJSON not parsed as math', () => {
	const md = createPatchedEngine();
	const result = md.render('$.getJSON, $.ajax');
	assert.ok(
		!result.includes('katex-error'),
		`Should not contain katex-error, got: ${result}`);
	assert.ok(
		result.includes('$.getJSON'),
		`Should contain literal $.getJSON, got: ${result}`);
	assert.ok(
		result.includes('$.ajax'),
		`Should contain literal $.ajax, got: ${result}`);
});

test('Patched: $(selector) not parsed as math', () => {
	const md = createPatchedEngine();
	const result = md.render('$("#medico").autocomplete()');
	assert.ok(
		!result.includes('katex-error'),
		`Should not contain katex-error, got: ${result}`);
	assert.ok(
		result.includes('$(&quot;#medico&quot;)'),
		`Should contain escaped $(\"#medico\"), got: ${result}`);
});

test('Patched: $# not parsed as math', () => {
	const md = createPatchedEngine();
	const result = md.render('Variable $#foo in Perl');
	assert.ok(
		!result.includes('katex-error'),
		`Should not contain katex-error, got: ${result}`);
});

test('Patched: $. not parsed as math', () => {
	const md = createPatchedEngine();
	const result = md.render('Use $.get() and $.post()');
	assert.ok(
		!result.includes('katex-error'),
		`Should not contain katex-error, got: ${result}`);
	assert.ok(
		result.includes('$.get()'),
		`Should contain literal $.get(), got: ${result}`);
});

test('Patched: $( not parsed as math', () => {
	const md = createPatchedEngine();
	const result = md.render("Use $('select') for jQuery");
	assert.ok(
		!result.includes('katex-error'),
		`Should not contain katex-error, got: ${result}`);
});

// --- Verify valid math still works ---

test('Patched: simple inline math still works', () => {
	const md = createPatchedEngine();
	const result = md.render('The formula $x^2 + y^2 = z^2$ is famous');
	assert.ok(
		result.includes('katex'),
		`Should render katex math, got: ${result}`);
	assert.ok(
		!result.includes('katex-error'),
		`Valid math should not error, got: ${result}`);
});

test('Patched: math with backslash commands still works', () => {
	const md = createPatchedEngine();
	const result = md.render('$\\alpha + \\beta$');
	assert.ok(
		result.includes('katex'),
		`Should render katex math, got: ${result}`);
});

test('Patched: math with digits still works', () => {
	const md = createPatchedEngine();
	const result = md.render('$1 + 2 = 3$');
	assert.ok(
		result.includes('katex'),
		`Should render katex math, got: ${result}`);
});

test('Patched: math with curly braces still works', () => {
	const md = createPatchedEngine();
	const result = md.render('${x}_{i}$');
	assert.ok(
		result.includes('katex'),
		`Should render katex math, got: ${result}`);
});

test('Patched: block math ($$) still works', () => {
	const md = createPatchedEngine();
	const result = md.render('$$\nx^2\n$$');
	assert.ok(
		result.includes('katex'),
		`Should render block math, got: ${result}`);
});

// --- Table-specific tests (the original issue) ---

test('Patched: jQuery in markdown table not parsed as math', () => {
	const md = createPatchedEngine();
	const input = [
		'| Usage | Location |',
		'|---|---|',
		'| $.getJSON, $.ajax, $.get | Multiple functions |',
		'| $("#medico").autocomplete({...}) | addAutoComplete |',
	].join('\n');
	const result = md.render(input);
	assert.ok(
		!result.includes('katex-error'),
		`Table should not contain katex errors, got: ${result}`);
	assert.ok(
		result.includes('$.getJSON'),
		`Table should preserve $.getJSON as text, got: ${result}`);
});

test('Patched: mixed math and jQuery in table', () => {
	const md = createPatchedEngine();
	const input = [
		'| Expression | Type |',
		'|---|---|',
		'| $x^2$ | math |',
		'| $.ajax() | jQuery |',
	].join('\n');
	const result = md.render(input);
	// Valid math should be rendered
	assert.ok(
		result.includes('katex'),
		`Should render valid math in table, got: ${result}`);
	// jQuery should not produce errors
	assert.ok(
		!result.includes('katex-error'),
		`Should not produce katex errors for jQuery, got: ${result}`);
	assert.ok(
		result.includes('$.ajax()'),
		`jQuery method should be plain text, got: ${result}`);
});

// --- Summary ---
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
	process.exit(1);
}

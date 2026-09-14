/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';
import vm from 'vm';
import { escapeJavaScriptUnicode } from '../escapeJavaScriptUnicode.ts';

function evaluate(code: string): string {
	return vm.runInNewContext(`${code}\nJSON.stringify(result);`);
}

suite('escapeJavaScriptUnicode', () => {
	test('leaves ASCII and Latin-1 source unchanged', () => {
		const code = 'const r = /\\u2014|\u00e9/; // \u00a9';
		assert.deepStrictEqual(escapeJavaScriptUnicode(code, 'fixture.js'), {
			code, edits: [], regularExpressions: 0, comments: 0, sourceMap: undefined,
		});
	});

	const cases = [
		{ label: 'BMP literal', pattern: '/\u1e9e/g', inputs: ['\u1e9e', '\u00df', 'a'] },
		{ label: 'literal identity escape', pattern: '/\\\u03c0/g', inputs: ['\u03c0', '\\u03c0', 'a'] },
		{ label: 'character-class identity escape', pattern: '/[\\\u03c0]/', inputs: ['\u03c0', 'u', '\\'] },
		{ label: 'Unicode range', pattern: '/[\u03b1-\u03c9]+/u', inputs: ['\u03b1\u03c0', '\u03a0', 'a'] },
		{ label: 'named capture and backreference', pattern: '/(?<\u03c0>x)\\k<\u03c0>/u', inputs: ['xx', 'xy'] },
		{ label: 'named capture without u', pattern: '/(?<\u03c0>x)\\k<\u03c0>/', inputs: ['xx', 'xy'] },
		{ label: 'mixed raw and escaped group name', pattern: '/(?<\\u03b1\u03c0>x)\\k<\\u03b1\u03c0>/u', inputs: ['xx', 'xy'] },
		{ label: 'astral group name', pattern: '/(?<\u{10400}>x)\\k<\u{10400}>/u', inputs: ['xx', 'xy'] },
		{ label: 'astral literal without u', pattern: '/\u{1f600}+/', inputs: ['\u{1f600}', '\ud83d\ude00\ude00', '\u{1f600}\u{1f600}'] },
		{ label: 'astral class without u', pattern: '/[\u{1f600}]/', inputs: ['\ud83d', '\ude00', '\u{1f600}', 'x'] },
		{ label: 'astral literal with u', pattern: '/\u{1f600}+/u', inputs: ['\u{1f600}', '\u{1f600}\u{1f600}', '\ud83d'] },
		{ label: 'astral range with u', pattern: '/[\u{1f600}-\u{1f64f}]/u', inputs: ['\u{1f600}', '\u{1f601}', '\u{1f64f}', '\u{1f680}'] },
		{ label: 'Unicode-set intersection', pattern: '/[[\u03b1-\u03c9]&&\\p{Letter}]/v', inputs: ['\u03b1', '\u03c0', '1'] },
		{ label: 'Unicode-set strings', pattern: '/[\\q{\u{1f600}|\u6f22}]/v', inputs: ['\u{1f600}', '\u6f22', 'x'] },
		{ label: 'flags and named capture output', pattern: '/(?<value>\u03c0)/dgi', inputs: ['a\u03a0b', '\u03c0\u03c0', 'a'] },
	];
	for (const fixture of cases) {
		test(`preserves matching: ${fixture.label}`, () => {
			const code = `const r=${fixture.pattern}; const result=${JSON.stringify(fixture.inputs)}.map(input => { r.lastIndex=0; const m=r.exec(input); return m ? { match:[...m], groups:m.groups, indices:m.indices, index:m.index, lastIndex:r.lastIndex } : null; });`;
			const result = escapeJavaScriptUnicode(code, 'fixture.js');
			assert.deepStrictEqual({
				matches: evaluate(result.code),
				regularExpressions: result.regularExpressions,
				repeatedEdits: escapeJavaScriptUnicode(result.code, 'fixture.js').edits,
			}, {
				matches: evaluate(code),
				regularExpressions: 1,
				repeatedEdits: [],
			});
		});
	}

	test('does not mistake division, strings, or template text for regexes', () => {
		const code = 'const text="/\u03c0/"; const template=`/* \u6f22 */`; const result=[text,template,12/3];';
		const result = escapeJavaScriptUnicode(code, 'fixture.js');
		assert.deepStrictEqual({ code: result.code, edits: result.edits }, { code, edits: [] });
	});

	test('preserves raw tagged-template values while escaping interpolation code', () => {
		const code = 'function tag(s,v){return {raw:s.raw,cooked:[...s],v};} const result=tag`/\u03c0/${/\u6f22/.test("\u6f22")}/*\u2014*/`;';
		const result = escapeJavaScriptUnicode(code, 'fixture.js');
		assert.deepStrictEqual({ value: evaluate(result.code), regexes: result.regularExpressions, comments: result.comments }, {
			value: evaluate(code), regexes: 1, comments: 0,
		});
	});

	test('escapes only ordinary comment contents', () => {
		const code = '// \u2014 /fake\u03c0/\r\nconst value=1; /* \u6f22 \u{1f680} */ const result=value;';
		const result = escapeJavaScriptUnicode(code, 'fixture.js');
		assert.deepStrictEqual({
			value: evaluate(result.code),
			wide: /[^\x00-\xFF]/.test(result.code),
			comments: result.comments,
			regexes: result.regularExpressions,
		}, { value: '1', wide: false, comments: 2, regexes: 0 });
	});

	for (const separator of ['\u2028', '\u2029']) {
		test(`preserves ASI for block-comment U+${separator.charCodeAt(0).toString(16)}`, () => {
			const code = `function f(){return /*x${separator}y*/ 1;} const result=[f(),2];`;
			const result = escapeJavaScriptUnicode(code, 'fixture.js');
			assert.deepStrictEqual({ value: evaluate(result.code), wide: /[^\x00-\xFF]/.test(result.code) }, {
				value: evaluate(code), wide: false,
			});
		});
	}

	for (const comment of [
		'/*! license \u6f22 */',
		'/* @license \u6f22 */',
		'// @preserve \u6f22',
		'/* Copyright \u6f22 */',
		'//# sourceURL=virtual-\u6f22.js',
		'//# sourceMappingURL=virtual-\u6f22.js.map',
		'#!/bin/\u6f22',
	]) {
		test(`preserves protected comment ${JSON.stringify(comment)}`, () => {
			const code = `${comment}\nconst value=1;`;
			const result = escapeJavaScriptUnicode(code, 'fixture.js');
			assert.deepStrictEqual({ code: result.code, edits: result.edits }, { code, edits: [] });
		});
	}

	test('finds only real source-map directives and exact URL spans', () => {
		const code = 'const fake="//# sourceMappingURL=fake.map"; const r=/\u2014/;\n//# sourceMappingURL=sourceMappingURL.map';
		const result = escapeJavaScriptUnicode(code, 'fixture.js');
		assert.deepStrictEqual({
			url: result.sourceMap?.url,
			span: result.sourceMap && code.slice(result.sourceMap.start, result.sourceMap.end),
		}, { url: 'sourceMappingURL.map', span: 'sourceMappingURL.map' });
	});

	test('handles minified generator-yield ternaries and regexes', () => {
		const code = 'function* f(){let s=true,c=true,h="a";s?c?h==="b"?(c=false):yield{}:yield{}:yield{};return /\u2014/;}';
		const result = escapeJavaScriptUnicode(code, 'fixture.js');
		assert.deepStrictEqual({ regexes: result.regularExpressions, wide: /[^\x00-\xFF]/.test(result.code) }, { regexes: 1, wide: false });
	});

	test('retains explicit source-text reflection differences', () => {
		const code = 'const result=/\u2014/.source;';
		const result = escapeJavaScriptUnicode(code, 'fixture.js');
		assert.deepStrictEqual([evaluate(code), evaluate(result.code)], [JSON.stringify('\u2014'), JSON.stringify('\\u2014')]);
	});

	test('fails with the file name on invalid JavaScript rather than silently skipping it', () => {
		assert.throws(() => escapeJavaScriptUnicode('const = "\u6f22";', 'broken-output.js'), /broken-output\.js/);
	});
});

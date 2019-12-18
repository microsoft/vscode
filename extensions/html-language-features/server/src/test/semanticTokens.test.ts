/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import { TextDocument, getLanguageModes, ClientCapabilities, Range, Position } from '../modes/languageModes';

interface ExpectedToken {
	startLine: number;
	character: number;
	length: number;
	tokenClassifiction: string;
}

function assertTokens(lines: string[], expected: ExpectedToken[], range?: Range, message?: string): void {
	const document = TextDocument.create('test://foo/bar.html', 'html', 1, lines.join('\n'));
	const workspace = {
		settings: {},
		folders: [{ name: 'foo', uri: 'test://foo' }]
	};
	const languageModes = getLanguageModes({ css: true, javascript: true }, workspace, ClientCapabilities.LATEST);

	if (!range) {
		range = Range.create(Position.create(0, 0), document.positionAt(document.getText().length));
	}

	const jsMode = languageModes.getMode('javascript')!;

	const legend = jsMode.getSemanticTokenLegend!();
	const actual = jsMode.getSemanticTokens!(document, [range]);

	let actualRanges = [];
	let lastLine = 0;
	let lastCharacter = 0;
	for (let i = 0; i < actual.length; i += 5) {
		const lineDelta = actual[i], charDelta = actual[i + 1], len = actual[i + 2], typeIdx = actual[i + 3], modSet = actual[i + 4];
		const line = lastLine + lineDelta;
		const character = lineDelta === 0 ? lastCharacter + charDelta : charDelta;
		const tokenClassifiction = [legend.types[typeIdx], ...legend.modifiers.filter((_, i) => modSet & 1 << i)].join('.');
		actualRanges.push(t(line, character, len, tokenClassifiction));
		lastLine = line;
		lastCharacter = character;
	}
	assert.deepEqual(actualRanges, expected, message);
}

function t(startLine: number, character: number, length: number, tokenClassifiction: string): ExpectedToken {
	return { startLine, character, length, tokenClassifiction };
}

suite('JavaScript Semantic Tokens', () => {

	test('variables', () => {
		const input = [
			/*0*/'<html>',
			/*1*/'<head>',
			/*2*/'<script>',
			/*3*/'  var x = 9, y1 = x;',
			/*4*/'  throw y1;',
			/*5*/'</script>',
			/*6*/'</head>',
			/*7*/'</html>',
		];
		assertTokens(input, [
			t(3, 6, 1, 'variable.declaration'), t(3, 13, 2, 'variable.declaration'), t(3, 18, 1, 'variable'),
			t(4, 8, 2, 'variable')
		]);
	});

	test('function', () => {
		const input = [
			/*0*/'<html>',
			/*1*/'<head>',
			/*2*/'<script>',
			/*3*/'  function foo(p1) {',
			/*4*/'    return foo(Math.abs(p1))',
			/*5*/'  }',
			/*6*/'</script>',
			/*7*/'</head>',
			/*8*/'</html>',
		];
		assertTokens(input, [
			t(3, 11, 3, 'function.declaration'), t(3, 15, 2, 'parameter.declaration'),
			t(4, 11, 3, 'function'), t(4, 15, 4, 'variable'), t(4, 20, 3, 'member'), t(4, 24, 2, 'parameter')
		]);
	});

	test('members', () => {
		const input = [
			/*0*/'<html>',
			/*1*/'<head>',
			/*2*/'<script>',
			/*3*/'  class A {',
			/*4*/'    static x = 9;',
			/*5*/'    f = 9;',
			/*6*/'    m() { return A.x; };',
			/*7*/'    get s() { return this.f + this.m() }',
			/*8*/'  }',
			/*9*/'</script>',
			/*10*/'</head>',
			/*11*/'</html>',
		];
		assertTokens(input, [
			t(3, 8, 1, 'class.declaration'),
			t(4, 11, 1, 'member.declaration'),
			t(5, 4, 1, 'property.declaration'),
			t(6, 4, 1, 'member.declaration'), t(6, 17, 1, 'class'), t(6, 19, 1, 'property'),
			t(7, 8, 1, 'member.declaration'),
		]);
	});



});

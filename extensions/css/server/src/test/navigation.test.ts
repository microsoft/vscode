/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {Scope, GlobalScope, ScopeBuilder} from '../parser/cssSymbolScope';
import * as nodes from '../parser/cssNodes';
import {Parser} from '../parser/cssParser';
import {CSSNavigation} from '../services/cssNavigation';

import {TextDocument, DocumentHighlightKind} from 'vscode-languageserver';

export function assertScopesAndSymbols(p: Parser, input: string, expected: string): void {
	let global = createScope(p, input);
	assert.equal(scopeToString(global), expected);
}

export function assertHighlights(p: Parser, input: string, marker: string, expectedMatches: number, expectedWrites: number): void {
	let document = TextDocument.create('test://test/test.css', 'css', 0, input);

	let stylesheet = p.parseStylesheet(document);
	assertNoErrors(stylesheet);

	let index = input.indexOf(marker) + marker.length;
	let position = document.positionAt(index);

	let highlights = new CSSNavigation().findDocumentHighlights(document, position, stylesheet);
	assert.equal(highlights.length, expectedMatches);

	let nWrites = 0;
	for (let highlight of highlights) {
		if (highlight.kind === DocumentHighlightKind.Write) {
			nWrites++;
		}
		let range = highlight.range;
		let start = document.offsetAt(range.start), end = document.offsetAt(range.end);
		assert.equal(document.getText().substring(start, end), marker);
	}
	assert.equal(nWrites, expectedWrites);
}


export function assertSymbolsInScope(p: Parser, input: string, offset: number, ...selections: { name: string; type: nodes.ReferenceType }[]): void {

	let global = createScope(p, input);

	let scope = global.findScope(offset);

	let getErrorMessage = function (name: string) {
		let all = 'symbol ' + name + ' not found. In scope: ';
		scope.getSymbols().forEach((sym) => { all += (sym.name + ' '); });
		return all;
	};

	for (let i = 0; i < selections.length; i++) {
		let selection = selections[i];
		let sym = scope.getSymbol(selection.name, selection.type) || global.getSymbol(selection.name, selection.type);
		assert.ok(!!sym, getErrorMessage(selection.name));
	}
}

export function assertScopeBuilding(p: Parser, input: string, ...scopes: { offset: number; length: number; }[]): void {

	let global = createScope(p, input);

	function assertChildren(scope: Scope): void {

		scope.children.forEach((scope) => {

			// check bounds
			let expected = scopes.shift();
			assert.equal(scope.offset, expected.offset);
			assert.equal(scope.length, expected.length);

			// recursive descent
			assertChildren(scope);
		});
	}

	assertChildren(global);

	assert.equal(scopes.length, 0, 'remainig scopes: ' + scopes.join());
}

function scopeToString(scope: Scope): string {
	let str = '';
	let symbols = scope.getSymbols();
	for (let index = 0; index < symbols.length; index++) {
		if (str.length > 0) {
			str += ',';
		}
		str += symbols[index].name;
	}
	let scopes = scope.children;
	for (let index = 0; index < scopes.length; index++) {
		if (str.length > 0) {
			str += ',';
		}
		str += ('[' + scopeToString(scopes[index]) + ']');
	}
	return str;
}

function assertNoErrors(node: nodes.Node): void {
	let markers = nodes.ParseErrorCollector.entries(node);
	if (markers.length > 0) {
		assert.ok(false, 'node has errors: ' + markers[0].getMessage() + ', offset: ' + markers[0].getNode().offset);
	}
}

function createScope(p: Parser, input: string): Scope {
	let document = TextDocument.create('test://test/test.css', 'css', 0, input);

	let styleSheet = p.parseStylesheet(document),
		global = new GlobalScope(),
		builder = new ScopeBuilder(global);

	assertNoErrors(styleSheet);
	styleSheet.accept(builder);
	return global;
}

suite('CSS - symbols', () => {

	test('scope creation', function () {

		let global = new GlobalScope(),
			child1 = new Scope(10, 5),
			child2 = new Scope(15, 5);

		global.addChild(child1);
		global.addChild(child2);

		assert.equal(global.children.length, 2);
		assert.ok(child1.parent === global);
		assert.ok(child2.parent === global);

		// find children
		assert.ok(global.findScope(-1) === null);
		assert.ok(global.findScope(0) === global);
		assert.ok(global.findScope(10) === child1);
		assert.ok(global.findScope(14) === child1);
		assert.ok(global.findScope(15) === child2);
		assert.ok(global.findScope(19) === child2);
		assert.ok(global.findScope(19).parent === global);
	});

	test('scope building', function () {
		let p = new Parser();
		assertScopeBuilding(p, '.class {}', { offset: 7, length: 2 });
		assertScopeBuilding(p, '.class {} .class {}', { offset: 7, length: 2 }, { offset: 17, length: 2 });
	});

	test('symbols in scopes', function () {
		let p = new Parser();
		assertSymbolsInScope(p, '@keyframes animation {};', 0, { name: 'animation', type: nodes.ReferenceType.Keyframe });
		assertSymbolsInScope(p, ' .class1 {} .class2 {}', 0, { name: '.class1', type: nodes.ReferenceType.Rule }, { name: '.class2', type: nodes.ReferenceType.Rule });
	});

	test('scopes and symbols', function () {
		let p = new Parser();
		assertScopesAndSymbols(p, '.class {}', '.class,[]');
		assertScopesAndSymbols(p, '@keyframes animation {}; .class {}', 'animation,.class,[],[]');
		assertScopesAndSymbols(p, '@page :pseudo-class { margin:2in; }', '[]');
		assertScopesAndSymbols(p, '@media print { body { font-size: 10pt } }', '[body,[]]');
		assertScopesAndSymbols(p, '@-moz-keyframes identifier { 0% { top: 0; } 50% { top: 30px; left: 20px; }}', 'identifier,[[],[]]');
		assertScopesAndSymbols(p, '@font-face { font-family: "Bitstream Vera Serif Bold"; }', '[]');
	});

	test('mark occurrences', function () {
		let p = new Parser();
		assertHighlights(p, '@keyframes id {}; #main { animation: id 4s linear 0s infinite alternate; }', 'id', 2, 1);
		assertHighlights(p, '@keyframes id {}; #main { animation-name: id; foo: id;}', 'id', 2, 1);
	});

	test('test variables in root scope', function () {
		let p = new Parser();
		assertSymbolsInScope(p, ':root{ --var1: abc; --var2: def; }', 0, { name: '--var1', type: nodes.ReferenceType.Variable }, { name: '--var2', type: nodes.ReferenceType.Variable });
	});

	test('test variables in local scope', function () {
		let p = new Parser();
		assertSymbolsInScope(p, '.a{ --var1: abc; --var2: def; }', 2, { name: '--var1', type: nodes.ReferenceType.Variable }, { name: '--var2', type: nodes.ReferenceType.Variable });
	});

	test('test variables in local scope get root variables too', function () {
		let p = new Parser();
		assertSymbolsInScope(p, '.a{ --var1: abc; } :root{ --var2: abc;}', 2, { name: '--var1', type: nodes.ReferenceType.Variable }, { name: '--var2', type: nodes.ReferenceType.Variable });
	});

	test('test variables in local scope get root variables and other local variables too', function () {
		let p = new Parser();
		assertSymbolsInScope(p, '.a{ --var1: abc; } .b{ --var2: abc; } :root{ --var3: abc;}', 2, { name: '--var1', type: nodes.ReferenceType.Variable }, { name: '--var2', type: nodes.ReferenceType.Variable }, { name: '--var3', type: nodes.ReferenceType.Variable });
	});

	test('mark occurrences for variable defined in root and used in a rule', function () {
		let p = new Parser();
		assertHighlights(p, '.a{ background: let(--var1); } :root{ --var1: abc;}', '--var1', 2, 1);
	});

	test('mark occurrences for variable defined in a rule and used in a different rule', function () {
		let p = new Parser();
		assertHighlights(p, '.a{ background: let(--var1); } :b{ --var1: abc;}', '--var1', 2, 1);
	});

	test('mark occurrences for property', function () {
		let p = new Parser();
		assertHighlights(p, 'body { display: inline } #foo { display: inline }', 'display', 2, 0);
	});

	test('mark occurrences for value', function () {
		let p = new Parser();
		assertHighlights(p, 'body { display: inline } #foo { display: inline }', 'inline', 2, 0);
	});

	test('mark occurrences for selector', function () {
		let p = new Parser();
		assertHighlights(p, 'body { display: inline } #foo { display: inline }', 'body', 1, 1);
	});

	test('mark occurrences for comment', function () {
		let p = new Parser();
		assertHighlights(p, '/* comment */body { display: inline } ', 'comment', 0, 0);
	});
});
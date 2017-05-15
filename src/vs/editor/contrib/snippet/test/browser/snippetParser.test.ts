/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { Scanner, TokenType, SnippetParser, Text, Placeholder, Variable, Marker, walk } from 'vs/editor/contrib/snippet/common/snippetParser';


suite('SnippetParser', () => {

	test('Scanner', () => {

		const scanner = new Scanner();
		assert.equal(scanner.next().type, TokenType.EOF);

		scanner.text('abc');
		assert.equal(scanner.next().type, TokenType.VariableName);
		assert.equal(scanner.next().type, TokenType.EOF);

		scanner.text('{{abc}}');
		assert.equal(scanner.next().type, TokenType.CurlyOpen);
		assert.equal(scanner.next().type, TokenType.CurlyOpen);
		assert.equal(scanner.next().type, TokenType.VariableName);
		assert.equal(scanner.next().type, TokenType.CurlyClose);
		assert.equal(scanner.next().type, TokenType.CurlyClose);
		assert.equal(scanner.next().type, TokenType.EOF);

		scanner.text('abc() ');
		assert.equal(scanner.next().type, TokenType.VariableName);
		assert.equal(scanner.next().type, TokenType.Format);
		assert.equal(scanner.next().type, TokenType.EOF);

		scanner.text('abc 123');
		assert.equal(scanner.next().type, TokenType.VariableName);
		assert.equal(scanner.next().type, TokenType.Format);
		assert.equal(scanner.next().type, TokenType.Int);
		assert.equal(scanner.next().type, TokenType.EOF);

		scanner.text('$foo');
		assert.equal(scanner.next().type, TokenType.Dollar);
		assert.equal(scanner.next().type, TokenType.VariableName);
		assert.equal(scanner.next().type, TokenType.EOF);

		scanner.text('$foo_bar');
		assert.equal(scanner.next().type, TokenType.Dollar);
		assert.equal(scanner.next().type, TokenType.VariableName);
		assert.equal(scanner.next().type, TokenType.EOF);

		scanner.text('$foo-bar');
		assert.equal(scanner.next().type, TokenType.Dollar);
		assert.equal(scanner.next().type, TokenType.VariableName);
		assert.equal(scanner.next().type, TokenType.Format);
		assert.equal(scanner.next().type, TokenType.VariableName);
		assert.equal(scanner.next().type, TokenType.EOF);

		scanner.text('${foo}');
		assert.equal(scanner.next().type, TokenType.Dollar);
		assert.equal(scanner.next().type, TokenType.CurlyOpen);
		assert.equal(scanner.next().type, TokenType.VariableName);
		assert.equal(scanner.next().type, TokenType.CurlyClose);
		assert.equal(scanner.next().type, TokenType.EOF);

		scanner.text('${1223:foo}');
		assert.equal(scanner.next().type, TokenType.Dollar);
		assert.equal(scanner.next().type, TokenType.CurlyOpen);
		assert.equal(scanner.next().type, TokenType.Int);
		assert.equal(scanner.next().type, TokenType.Colon);
		assert.equal(scanner.next().type, TokenType.VariableName);
		assert.equal(scanner.next().type, TokenType.CurlyClose);
		assert.equal(scanner.next().type, TokenType.EOF);

		scanner.text('\\${}');
		assert.equal(scanner.next().type, TokenType.Backslash);
		assert.equal(scanner.next().type, TokenType.Dollar);
		assert.equal(scanner.next().type, TokenType.CurlyOpen);
		assert.equal(scanner.next().type, TokenType.CurlyClose);
	});

	function assertText(value: string, expected: string) {
		const p = new SnippetParser();
		const actual = p.text(value);
		assert.equal(actual, expected);
	}

	function assertMarker(valueOrMarker: Marker[] | string, ...ctors: Function[]) {
		let marker: Marker[];
		if (typeof valueOrMarker === 'string') {
			const p = new SnippetParser();
			marker = p.parse(valueOrMarker);
		} else {
			marker = valueOrMarker;
		}
		while (marker.length > 0) {
			let m = marker.pop();
			let ctor = ctors.pop();
			assert.ok(m instanceof ctor);
		}
		assert.equal(marker.length, ctors.length);
		assert.equal(marker.length, 0);
	}

	function assertTextAndMarker(value: string, escaped: string, ...ctors: Function[]) {
		assertText(value, escaped);
		assertMarker(value, ...ctors);
	}

	function assertEscaped(value: string, expected: string) {
		const actual = SnippetParser.escape(value);
		assert.equal(actual, expected);
	}

	test('Parser, escaped', function () {
		assertEscaped('foo$0', 'foo\\$0');
		assertEscaped('foo\\$0', 'foo\\\\\\$0');
		assertEscaped('f$1oo$0', 'f\\$1oo\\$0');
		assertEscaped('${1:foo}$0', '\\${1:foo\\}\\$0');
		assertEscaped('$', '\\$');
	});

	test('Parser, text', () => {
		assertText('$', '$');
		assertText('\\\\$', '\\$');
		assertText('{', '{');
		assertText('\\}', '}');
		assertText('\\abc', '\\abc');
		assertText('foo${f:\\}}bar', 'foo}bar');
		assertText('\\{', '{');
		assertText('I need \\\\\\$', 'I need \\$');
		assertText('\\', '\\');
		assertText('\\{{', '{{');
		assertText('{{', '{{');
		assertText('{{dd', '{{dd');
		assertText('}}', '}}');
		assertText('ff}}', 'ff}}');

		assertText('farboo', 'farboo');
		assertText('far{{}}boo', 'farboo');
		assertText('far{{123}}boo', 'far123boo');
		assertText('far\\{{123}}boo', 'far{{123}}boo');
		assertText('far{{id:bern}}boo', 'farbernboo');
		assertText('far{{id:bern {{basel}}}}boo', 'farbern baselboo');
		assertText('far{{id:bern {{id:basel}}}}boo', 'farbern baselboo');
		assertText('far{{id:bern {{id2:basel}}}}boo', 'farbern baselboo');
	});


	test('Parser, TM text', () => {
		assertTextAndMarker('foo${1:bar}}', 'foobar}', Text, Placeholder, Text);
		assertTextAndMarker('foo${1:bar}${2:foo}}', 'foobarfoo}', Text, Placeholder, Placeholder, Text);

		assertTextAndMarker('foo${1:bar\\}${2:foo}}', 'foobar}foo', Text, Placeholder);

		let [, placeholder] = new SnippetParser(true, false).parse('foo${1:bar\\}${2:foo}}');
		let { defaultValue } = (<Placeholder>placeholder);

		assert.equal((<Placeholder>placeholder).index, '1');
		assert.ok(defaultValue[0] instanceof Text);
		assert.equal(defaultValue[0].toString(), 'bar}');
		assert.ok(defaultValue[1] instanceof Placeholder);
		assert.equal(defaultValue[1].toString(), 'foo');
	});

	test('Parser, placeholder', () => {
		assertTextAndMarker('farboo', 'farboo', Text);
		assertTextAndMarker('far{{}}boo', 'farboo', Text, Placeholder, Text);
		assertTextAndMarker('far{{123}}boo', 'far123boo', Text, Placeholder, Text);
		assertTextAndMarker('far\\{{123}}boo', 'far{{123}}boo', Text);
	});

	test('Parser, literal code', () => {
		assertTextAndMarker('far`123`boo', 'far`123`boo', Text);
		assertTextAndMarker('far\\`123\\`boo', 'far\\`123\\`boo', Text);
	});

	test('Parser, variables/tabstop', () => {
		assertTextAndMarker('$far-boo', '-boo', Variable, Text);
		assertTextAndMarker('\\$far-boo', '$far-boo', Text);
		assertTextAndMarker('far$farboo', 'far', Text, Variable);
		assertTextAndMarker('far${farboo}', 'far', Text, Variable);
		assertTextAndMarker('$123', '', Placeholder);
		assertTextAndMarker('$farboo', '', Variable);
		assertTextAndMarker('$far12boo', '', Variable);
	});

	test('Parser, variables/placeholder with defaults', () => {
		assertTextAndMarker('${name:value}', 'value', Variable);
		assertTextAndMarker('${1:value}', 'value', Placeholder);
		assertTextAndMarker('${1:bar${2:foo}bar}', 'barfoobar', Placeholder);

		assertTextAndMarker('${name:value', '${name:value', Text);
		assertTextAndMarker('${1:bar${2:foobar}', '${1:barfoobar', Text, Placeholder);
	});

	test('Parser, only textmate', () => {
		const p = new SnippetParser(true, false);
		assertMarker(p.parse('far{{}}boo'), Text);
		assertMarker(p.parse('far{{123}}boo'), Text);
		assertMarker(p.parse('far\\{{123}}boo'), Text);

		assertMarker(p.parse('far$0boo'), Text, Placeholder, Text);
		assertMarker(p.parse('far${123}boo'), Text, Placeholder, Text);
		assertMarker(p.parse('far\\${123}boo'), Text);
	});

	test('Parser, only internal', () => {
		const p = new SnippetParser(false, true);
		assertMarker(p.parse('far{{}}boo'), Text, Placeholder, Text);
		assertMarker(p.parse('far{{123}}boo'), Text, Placeholder, Text);
		assertMarker(p.parse('far\\{{123}}boo'), Text);

		assertMarker(p.parse('far$0boo'), Text);
		assertMarker(p.parse('far${123}boo'), Text);
		assertMarker(p.parse('far\\${123}boo'), Text);
	});

	test('Parser, real world', () => {
		let marker = new SnippetParser().parse('console.warn(${1: $TM_SELECTED_TEXT })');

		assert.equal(marker[0].toString(), 'console.warn(');
		assert.ok(marker[1] instanceof Placeholder);
		assert.equal(marker[2].toString(), ')');

		const placeholder = <Placeholder>marker[1];
		assert.equal(placeholder, false);
		assert.equal(placeholder.index, '1');
		assert.equal(placeholder.defaultValue.length, 3);
		assert.ok(placeholder.defaultValue[0] instanceof Text);
		assert.ok(placeholder.defaultValue[1] instanceof Variable);
		assert.ok(placeholder.defaultValue[2] instanceof Text);
		assert.equal(placeholder.defaultValue[0].toString(), ' ');
		assert.equal(placeholder.defaultValue[1].toString(), '');
		assert.equal(placeholder.defaultValue[2].toString(), ' ');

		const nestedVariable = <Variable>placeholder.defaultValue[1];
		assert.equal(nestedVariable.name, 'TM_SELECTED_TEXT');
		assert.equal(nestedVariable.defaultValue.length, 0);

		marker = new SnippetParser().parse('$TM_SELECTED_TEXT');
		assert.equal(marker.length, 1);
		assert.ok(marker[0] instanceof Variable);
	});

	test('Parser, real world, mixed', () => {

		assertTextAndMarker(
			'finished:{{}}, second:{{2:name}}, first:{{1:}}, third:{{3:}}',
			'finished:, second:name, first:, third:',
			Text, Placeholder, Text, Placeholder, Text, Placeholder, Text, Placeholder
		);


		assertTextAndMarker(
			'begin\\{{{1:enumerate}}\\}\n\t{{}}\nend\\{{{1:}}\\}',
			'begin{enumerate}\n\t\nend{enumerate}',
			Text, Placeholder, Text, Placeholder, Text, Placeholder, Text
		);

	});

	test('Parser, default name/value', () => {
		assertTextAndMarker(
			'{{first}}-{{2:}}-{{second}}-{{1:}}',
			'first--second-',
			Placeholder, Text, Placeholder, Text, Placeholder, Text, Placeholder
		);

		const [p1, , p2, , p3] = new SnippetParser().parse('{{first}}-{{2:}}-{{second}}-{{1:}}');
		assert.equal((<Placeholder>p1).index, 'first');
		assert.equal(Marker.toString((<Placeholder>p1).defaultValue), 'first');

		assert.equal((<Placeholder>p2).index, '2');
		assert.equal(Marker.toString((<Placeholder>p2).defaultValue), '');

		assert.equal((<Placeholder>p3).index, 'second');
		assert.equal(Marker.toString((<Placeholder>p3).defaultValue), 'second');
	});

	test('Parser, default placeholder values', () => {

		assertMarker('errorContext: `${1:err}`, error: $1', Text, Placeholder, Text, Placeholder);

		const [, p1, , p2] = new SnippetParser().parse('errorContext: `${1:err}`, error:$1');

		assert.equal((<Placeholder>p1).index, '1');
		assert.equal((<Placeholder>p1).defaultValue.length, '1');
		assert.equal((<Text>(<Placeholder>p1).defaultValue[0]), 'err');

		assert.equal((<Placeholder>p2).index, '1');
		assert.equal((<Placeholder>p2).defaultValue.length, '1');
		assert.equal((<Text>(<Placeholder>p2).defaultValue[0]), 'err');

	});

	test('backspace esapce in TM only, #16212', () => {
		const actual = new SnippetParser(true, false).text('Foo \\\\${abc}bar');
		assert.equal(actual, 'Foo \\bar');
	});

	test('colon as variable/placeholder value, #16717', () => {
		let actual = new SnippetParser(true, false).text('${TM_SELECTED_TEXT:foo:bar}');
		assert.equal(actual, 'foo:bar');

		actual = new SnippetParser(true, false).text('${1:foo:bar}');
		assert.equal(actual, 'foo:bar');
	});

	test('marker#len', () => {

		function assertLen(template: string, ...lengths: number[]): void {
			const { marker } = SnippetParser.parse(template);
			walk(marker, m => {
				const expected = lengths.shift();
				assert.equal(m.len(), expected);
				return true;
			});
			assert.equal(lengths.length, 0);
		}

		assertLen('text$0', 4, 0);
		assertLen('$1text$0', 0, 4, 0);
		assertLen('te$1xt$0', 2, 0, 2, 0);
		assertLen('errorContext: `${1:err}`, error: $0', 15, 0, 3, 10, 0);
		assertLen('errorContext: `${1:err}`, error: $1$0', 15, 0, 3, 10, 0, 3, 0);
		assertLen('$TM_SELECTED_TEXT$0', 0, 0);
		assertLen('${TM_SELECTED_TEXT:def}$0', 0, 3, 0);
	});

	test('parser, parent node', function () {
		let snippet = SnippetParser.parse('This ${1:is ${2:nested}}$0');

		assert.equal(snippet.placeholders.length, 3);
		let [first, second] = snippet.placeholders;
		assert.equal(first.index, '1');
		assert.equal(second.index, '2');
		assert.ok(second.parent === first);
		assert.ok(first.parent === undefined);

		snippet = SnippetParser.parse('${VAR:default${1:value}}$0');
		assert.equal(snippet.placeholders.length, 2);
		[first] = snippet.placeholders;
		assert.equal(first.index, '1');

		assert.ok(snippet.marker[0] instanceof Variable);
		assert.ok(first.parent === snippet.marker[0]);
	});

	test('TextmateSnippet#enclosingPlaceholders', function () {
		let snippet = SnippetParser.parse('This ${1:is ${2:nested}}$0');
		let [first, second] = snippet.placeholders;

		assert.deepEqual(snippet.enclosingPlaceholders(first), []);
		assert.deepEqual(snippet.enclosingPlaceholders(second), [first]);
	});

	test('TextmateSnippet#offset', () => {
		let snippet = SnippetParser.parse('te$1xt');
		assert.equal(snippet.offset(snippet.marker[0]), 0);
		assert.equal(snippet.offset(snippet.marker[1]), 2);
		assert.equal(snippet.offset(snippet.marker[2]), 2);

		snippet = SnippetParser.parse('${TM_SELECTED_TEXT:def}');
		assert.equal(snippet.offset(snippet.marker[0]), 0);
		assert.equal(snippet.offset((<Variable>snippet.marker[0]).defaultValue[0]), 0);

		// forgein marker
		assert.equal(snippet.offset(new Text('foo')), -1);
	});

	test('TextmateSnippet#placeholder', () => {
		let snippet = SnippetParser.parse('te$1xt$0');
		let placeholders = snippet.placeholders;
		assert.equal(placeholders.length, 2);

		snippet = SnippetParser.parse('te$1xt$1$0');
		placeholders = snippet.placeholders;
		assert.equal(placeholders.length, 3);


		snippet = SnippetParser.parse('te$1xt$2$0');
		placeholders = snippet.placeholders;
		assert.equal(placeholders.length, 3);

		snippet = SnippetParser.parse('${1:bar${2:foo}bar}$0');
		placeholders = snippet.placeholders;
		assert.equal(placeholders.length, 3);
	});
});

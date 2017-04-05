/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { Scanner, TokenType, SnippetParser, Text, Placeholder, Variable, Marker } from 'vs/editor/contrib/snippet/common/snippetParser';


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

	function assertEscape(value: string, expected: string) {
		const p = new SnippetParser();
		const actual = p.escape(value);
		assert.equal(actual, expected);
	}

	function assertMarker(marker: Marker[], ...ctors: Function[]);
	function assertMarker(value: string, ...ctors: Function[]);
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

	function assertEscapeAndMarker(value: string, escaped: string, ...ctors: Function[]) {
		assertEscape(value, escaped);
		assertMarker(value, ...ctors);
	}

	test('Parser, escaping', () => {
		assertEscape('$', '$');
		assertEscape('\\\\$', '\\$');
		assertEscape('{', '{');
		assertEscape('\\}', '}');
		assertEscape('\\abc', '\\abc');
		assertEscape('foo${f:\\}}bar', 'foo}bar');
		assertEscape('\\{', '{');
		assertEscape('I need \\\\\\$', 'I need \\$');
		assertEscape('\\', '\\');
		assertEscape('\\{{', '{{');
		assertEscape('{{', '{{');
		assertEscape('{{dd', '{{dd');
		assertEscape('}}', '}}');
		assertEscape('ff}}', 'ff}}');

		assertEscape('farboo', 'farboo');
		assertEscape('far{{}}boo', 'farboo');
		assertEscape('far{{123}}boo', 'far123boo');
		assertEscape('far\\{{123}}boo', 'far{{123}}boo');
		assertEscape('far{{id:bern}}boo', 'farbernboo');
		assertEscape('far{{id:bern {{basel}}}}boo', 'farbern baselboo');
		assertEscape('far{{id:bern {{id:basel}}}}boo', 'farbern baselboo');
		assertEscape('far{{id:bern {{id2:basel}}}}boo', 'farbern baselboo');

	});

	test('Parser, TM escaping', () => {
		assertEscapeAndMarker('foo${1:bar}}', 'foobar}', Text, Placeholder, Text);
		assertEscapeAndMarker('foo${1:bar}${2:foo}}', 'foobarfoo}', Text, Placeholder, Placeholder, Text);

		assertEscapeAndMarker('foo${1:bar\\}${2:foo}}', 'foobar}foo', Text, Placeholder);

		let [, placeholder] = new SnippetParser(true, false).parse('foo${1:bar\\}${2:foo}}');
		let {defaultValue} = (<Placeholder>placeholder);

		assert.equal((<Placeholder>placeholder).name, '1');
		assert.ok(defaultValue[0] instanceof Text);
		assert.equal(defaultValue[0].toString(), 'bar}');
		assert.ok(defaultValue[1] instanceof Placeholder);
		assert.equal(defaultValue[1].toString(), 'foo');
	});

	test('Parser, placeholder', () => {
		assertEscapeAndMarker('farboo', 'farboo', Text);
		assertEscapeAndMarker('far{{}}boo', 'farboo', Text, Placeholder, Text);
		assertEscapeAndMarker('far{{123}}boo', 'far123boo', Text, Placeholder, Text);
		assertEscapeAndMarker('far\\{{123}}boo', 'far{{123}}boo', Text);
	});

	test('Parser, literal code', () => {
		assertEscapeAndMarker('far`123`boo', 'far`123`boo', Text);
		assertEscapeAndMarker('far\\`123\\`boo', 'far\\`123\\`boo', Text);
	});

	test('Parser, variables/tabstop', () => {
		assertEscapeAndMarker('$far-boo', '-boo', Variable, Text);
		assertEscapeAndMarker('\\$far-boo', '$far-boo', Text);
		assertEscapeAndMarker('far$farboo', 'far', Text, Variable);
		assertEscapeAndMarker('far${farboo}', 'far', Text, Variable);
		assertEscapeAndMarker('$123', '', Placeholder);
		assertEscapeAndMarker('$farboo', '', Variable);
		assertEscapeAndMarker('$far12boo', '', Variable);
	});

	test('Parser, variables/placeholder with defaults', () => {
		assertEscapeAndMarker('${name:value}', 'value', Variable);
		assertEscapeAndMarker('${1:value}', 'value', Placeholder);
		assertEscapeAndMarker('${1:bar${2:foo}bar}', 'barfoobar', Placeholder);

		assertEscapeAndMarker('${name:value', '${name:value', Text);
		assertEscapeAndMarker('${1:bar${2:foobar}', '${1:barfoobar', Text, Placeholder);
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
		assert.equal(placeholder.name, '1');
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

		assertEscapeAndMarker(
			'finished:{{}}, second:{{2:name}}, first:{{1:}}, third:{{3:}}',
			'finished:, second:name, first:, third:',
			Text, Placeholder, Text, Placeholder, Text, Placeholder, Text, Placeholder
		);


		assertEscapeAndMarker(
			'begin\\{{{1:enumerate}}\\}\n\t{{}}\nend\\{{{1:}}\\}',
			'begin{enumerate}\n\t\nend{enumerate}',
			Text, Placeholder, Text, Placeholder, Text, Placeholder, Text
		);

	});

	test('Parser, default name/value', () => {
		assertEscapeAndMarker(
			'{{first}}-{{2:}}-{{second}}-{{1:}}',
			'first--second-',
			Placeholder, Text, Placeholder, Text, Placeholder, Text, Placeholder
		);

		const [p1, , p2, , p3] = new SnippetParser().parse('{{first}}-{{2:}}-{{second}}-{{1:}}');
		assert.equal((<Placeholder>p1).name, 'first');
		assert.equal(Marker.toString((<Placeholder>p1).defaultValue), 'first');

		assert.equal((<Placeholder>p2).name, '2');
		assert.equal(Marker.toString((<Placeholder>p2).defaultValue), '');

		assert.equal((<Placeholder>p3).name, 'second');
		assert.equal(Marker.toString((<Placeholder>p3).defaultValue), 'second');
	});

	test('Parser, default placeholder values', () => {

		assertMarker('errorContext: `${1:err}`, error: $1', Text, Placeholder, Text, Placeholder);

		const [, p1, , p2] = new SnippetParser().parse('errorContext: `${1:err}`, error:$1');

		assert.equal((<Placeholder>p1).name, '1');
		assert.equal((<Placeholder>p1).defaultValue.length, '1');
		assert.equal((<Text>(<Placeholder>p1).defaultValue[0]), 'err');

		assert.equal((<Placeholder>p2).name, '1');
		assert.equal((<Placeholder>p2).defaultValue.length, '1');
		assert.equal((<Text>(<Placeholder>p2).defaultValue[0]), 'err');

	});

	test('backspace esapce in TM only, #16212', () => {
		const actual = new SnippetParser(true, false).escape('Foo \\\\${abc}bar');
		assert.equal(actual, 'Foo \\bar');
	});

	test('colon as variable/placeholder value, #16717', () => {
		let actual = new SnippetParser(true, false).escape('${TM_SELECTED_TEXT:foo:bar}');
		assert.equal(actual, 'foo:bar');

		actual = new SnippetParser(true, false).escape('${1:foo:bar}');
		assert.equal(actual, 'foo:bar');
	});
});

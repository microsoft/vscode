/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { Scanner, TokenType, SnippetParser, Text, Placeholder, Marker } from 'vs/editor/contrib/snippet/common/snippetParser';


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

	function assertMarker(value: string, ...ctors: Function[]) {
		const p = new SnippetParser();
		const marker = p.parse(value);
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
		assertEscape('{', '{');
		assertEscape('\\{', '{');
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


	test('Parser, placeholder', () => {
		assertEscapeAndMarker('farboo', 'farboo', Text);
		assertEscapeAndMarker('far{{}}boo', 'farboo', Text, Placeholder, Text);
		assertEscapeAndMarker('far{{123}}boo', 'far123boo', Text, Placeholder, Text);
		assertEscapeAndMarker('far\\{{123}}boo', 'far{{123}}boo', Text);
	});

	test('Parser, variables/tabstop', () => {
		assertEscapeAndMarker('$far-boo', '-boo', Placeholder, Text);
		assertEscapeAndMarker('\\$far-boo', '$far-boo', Text);
		assertEscapeAndMarker('far$farboo', 'far', Text, Placeholder);
		assertEscapeAndMarker('far${farboo}', 'far', Text, Placeholder);
		assertEscapeAndMarker('$123', '', Placeholder);
		assertEscapeAndMarker('$farboo', '', Placeholder);
		assertEscapeAndMarker('$far12boo', '', Placeholder);
	});

	test('Parser, variables/placeholder with defaults', () => {
		assertEscapeAndMarker('${name:value}', 'value', Placeholder);
		assertEscapeAndMarker('${1:value}', 'value', Placeholder);
		assertEscapeAndMarker('${1:bar${2:foo}bar}', 'barfoobar', Placeholder);

		assertEscapeAndMarker('${name:value', '${name:value', Text);
		assertEscapeAndMarker('${1:bar${2:foobar}', '${1:barfoobar', Text, Placeholder);
	});

	test('Parser, real world', () => {
		const marker = new SnippetParser().parse('console.warn(${1: $TM_SELECTED_TEXT })');

		assert.equal(marker[0].toString(), 'console.warn(');
		assert.ok(marker[1] instanceof Placeholder);
		assert.equal(marker[2].toString(), ')');

		const placeholder = <Placeholder>marker[1];
		assert.equal(placeholder.isVariable, false);
		assert.equal(placeholder.name, '1');
		assert.equal(placeholder.value.length, 3);
		assert.ok(placeholder.value[0] instanceof Text);
		assert.ok(placeholder.value[1] instanceof Placeholder);
		assert.ok(placeholder.value[2] instanceof Text);
		assert.equal(placeholder.value[0].toString(), ' ');
		assert.equal(placeholder.value[1].toString(), '');
		assert.equal(placeholder.value[2].toString(), ' ');

		const nestedPlaceholder = <Placeholder>placeholder.value[1];
		assert.equal(nestedPlaceholder.isVariable, true);
		assert.equal(nestedPlaceholder.name, 'TM_SELECTED_TEXT');
		assert.equal(nestedPlaceholder.value.length, 0);
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
		assert.equal(Marker.toString((<Placeholder>p1).value), 'first');

		assert.equal((<Placeholder>p2).name, '2');
		assert.equal(Marker.toString((<Placeholder>p2).value), '');

		assert.equal((<Placeholder>p3).name, 'second');
		assert.equal(Marker.toString((<Placeholder>p3).value), 'second');
	});

	test('Parser, default placeholder values', () => {

		assertMarker('errorContext: `${1:err}`, error: $1', Text, Placeholder, Text, Placeholder);

		const [, p1, , p2] = new SnippetParser().parse('errorContext: `${1:err}`, error:$1');

		assert.equal((<Placeholder>p1).name, '1');
		assert.equal((<Placeholder>p1).value.length, '1');
		assert.equal((<Text>(<Placeholder>p1).value[0]), 'err');

		assert.equal((<Placeholder>p2).name, '1');
		assert.equal((<Placeholder>p2).value.length, '1');
		assert.equal((<Text>(<Placeholder>p2).value[0]), 'err');

	});
});

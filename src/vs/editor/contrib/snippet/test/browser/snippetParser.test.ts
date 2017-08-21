/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { Scanner, TokenType, SnippetParser, Text, Placeholder, Variable, Marker, TextmateSnippet, Choice } from 'vs/editor/contrib/snippet/browser/snippetParser';


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

		scanner.text('${foo/regex/format/option}');
		assert.equal(scanner.next().type, TokenType.Dollar);
		assert.equal(scanner.next().type, TokenType.CurlyOpen);
		assert.equal(scanner.next().type, TokenType.VariableName);
		assert.equal(scanner.next().type, TokenType.Forwardslash);
		assert.equal(scanner.next().type, TokenType.VariableName);
		assert.equal(scanner.next().type, TokenType.Forwardslash);
		assert.equal(scanner.next().type, TokenType.VariableName);
		assert.equal(scanner.next().type, TokenType.Forwardslash);
		assert.equal(scanner.next().type, TokenType.VariableName);
		assert.equal(scanner.next().type, TokenType.CurlyClose);
		assert.equal(scanner.next().type, TokenType.EOF);
	});

	function assertText(value: string, expected: string) {
		const p = new SnippetParser();
		const actual = p.text(value);
		assert.equal(actual, expected);
	}

	function assertMarker(input: TextmateSnippet | Marker[] | string, ...ctors: Function[]) {
		let marker: Marker[];
		if (input instanceof TextmateSnippet) {
			marker = input.children;
		} else if (typeof input === 'string') {
			const p = new SnippetParser();
			marker = p.parse(input).children;
		} else {
			marker = input;
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
		assertText('\\{', '\\{');
		assertText('I need \\\\\\$', 'I need \\$');
		assertText('\\', '\\');
		assertText('\\{{', '\\{{');
		assertText('{{', '{{');
		assertText('{{dd', '{{dd');
		assertText('}}', '}}');
		assertText('ff}}', 'ff}}');

		assertText('farboo', 'farboo');
		assertText('far{{}}boo', 'far{{}}boo');
		assertText('far{{123}}boo', 'far{{123}}boo');
		assertText('far\\{{123}}boo', 'far\\{{123}}boo');
		assertText('far{{id:bern}}boo', 'far{{id:bern}}boo');
		assertText('far{{id:bern {{basel}}}}boo', 'far{{id:bern {{basel}}}}boo');
		assertText('far{{id:bern {{id:basel}}}}boo', 'far{{id:bern {{id:basel}}}}boo');
		assertText('far{{id:bern {{id2:basel}}}}boo', 'far{{id:bern {{id2:basel}}}}boo');
	});


	test('Parser, TM text', () => {
		assertTextAndMarker('foo${1:bar}}', 'foobar}', Text, Placeholder, Text);
		assertTextAndMarker('foo${1:bar}${2:foo}}', 'foobarfoo}', Text, Placeholder, Placeholder, Text);

		assertTextAndMarker('foo${1:bar\\}${2:foo}}', 'foobar}foo', Text, Placeholder);

		let [, placeholder] = new SnippetParser().parse('foo${1:bar\\}${2:foo}}').children;
		let { children } = (<Placeholder>placeholder);

		assert.equal((<Placeholder>placeholder).index, '1');
		assert.ok(children[0] instanceof Text);
		assert.equal(children[0].toString(), 'bar}');
		assert.ok(children[1] instanceof Placeholder);
		assert.equal(children[1].toString(), 'foo');
	});

	test('Parser, placeholder', () => {
		assertTextAndMarker('farboo', 'farboo', Text);
		assertTextAndMarker('far{{}}boo', 'far{{}}boo', Text);
		assertTextAndMarker('far{{123}}boo', 'far{{123}}boo', Text);
		assertTextAndMarker('far\\{{123}}boo', 'far\\{{123}}boo', Text);
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
		assertTextAndMarker('000_${far}_000', '000__000', Text, Variable, Text);
		assertTextAndMarker('FFF_${TM_SELECTED_TEXT}_FFF$0', 'FFF__FFF', Text, Variable, Text, Placeholder);
	});

	test('Parser, variables/placeholder with defaults', () => {
		assertTextAndMarker('${name:value}', 'value', Variable);
		assertTextAndMarker('${1:value}', 'value', Placeholder);
		assertTextAndMarker('${1:bar${2:foo}bar}', 'barfoobar', Placeholder);

		assertTextAndMarker('${name:value', '${name:value', Text);
		assertTextAndMarker('${1:bar${2:foobar}', '${1:barfoobar', Text, Placeholder);
	});

	test('Parser, placeholder with choice', () => {

		assertTextAndMarker('${1|one,two,three|}', 'one', Placeholder);
		assertTextAndMarker('${1|one|}', 'one', Placeholder);
		assertTextAndMarker('${1|one1,two2|}', 'one1', Placeholder);
		assertTextAndMarker('${1|one1\\,two2|}', 'one1,two2', Placeholder);
		assertTextAndMarker('${1|one1\\|two2|}', 'one1|two2', Placeholder);
		assertTextAndMarker('${1|one1\\atwo2|}', 'one1\\atwo2', Placeholder);
		assertTextAndMarker('${1|one,two,three,|}', '${1|one,two,three,|}', Text);
		assertTextAndMarker('${1|one,', '${1|one,', Text);

		const p = new SnippetParser();
		const snippet = p.parse('${1|one,two,three|}');
		assertMarker(snippet, Placeholder);
		const expected = [Placeholder, Text, Text, Text];
		snippet.walk(marker => {
			assert.equal(marker, expected.shift());
			return true;
		});
	});

	test('Snippet choices: unable to escape comma and pipe, #31521', function () {
		assertTextAndMarker('console.log(${1|not\\, not, five, 5, 1   23|});', 'console.log(not, not);', Text, Placeholder, Text);
	});

	test('Marker, toTextmateString()', function () {

		function assertTextsnippetString(input: string, expected: string): void {
			const snippet = new SnippetParser().parse(input);
			const actual = snippet.toTextmateString();
			assert.equal(actual, expected);
		}

		assertTextsnippetString('$1', '$1');
		assertTextsnippetString('\\$1', '\\$1');
		assertTextsnippetString('console.log(${1|not\\, not, five, 5, 1   23|});', 'console.log(${1|not\\, not, five, 5, 1   23|});');
		assertTextsnippetString('console.log(${1|not\\, not, \\| five, 5, 1   23|});', 'console.log(${1|not\\, not, \\| five, 5, 1   23|});');
		assertTextsnippetString('this is text', 'this is text');
		assertTextsnippetString('this ${1:is ${2:nested with $var}}', 'this ${1:is ${2:nested with ${var}}}');
		assertTextsnippetString('this ${1:is ${2:nested with $var}}}', 'this ${1:is ${2:nested with ${var}}}\\}');
	});

	test('Marker, toTextmateString() <-> identity', function () {

		function assertIdent(input: string): void {
			// full loop: (1) parse input, (2) generate textmate string, (3) parse, (4) ensure both trees are equal
			const snippet = new SnippetParser().parse(input);
			const input2 = snippet.toTextmateString();
			const snippet2 = new SnippetParser().parse(input2);

			function checkCheckChildren(marker1: Marker, marker2: Marker) {
				assert.ok(marker1 instanceof Object.getPrototypeOf(marker2).constructor);
				assert.ok(marker2 instanceof Object.getPrototypeOf(marker1).constructor);

				assert.equal(marker1.children.length, marker2.children.length);
				assert.equal(marker1.toString(), marker2.toString());

				for (let i = 0; i < marker1.children.length; i++) {
					checkCheckChildren(marker1.children[i], marker2.children[i]);
				}
			}

			checkCheckChildren(snippet, snippet2);
		}

		assertIdent('$1');
		assertIdent('\\$1');
		assertIdent('console.log(${1|not\\, not, five, 5, 1   23|});');
		assertIdent('console.log(${1|not\\, not, \\| five, 5, 1   23|});');
		assertIdent('this is text');
		assertIdent('this ${1:is ${2:nested with $var}}');
		assertIdent('this ${1:is ${2:nested with $var}}}');
		assertIdent('this ${1:is ${2:nested with $var}} and repeating $1');
	});

	test('Parser, choise marker', () => {
		const { placeholders } = new SnippetParser().parse('${1|one,two,three|}');

		assert.equal(placeholders.length, 1);
		assert.ok(placeholders[0].choice instanceof Choice);
		assert.ok(placeholders[0].children[0] instanceof Choice);
		assert.equal((<Choice>placeholders[0].children[0]).options.length, 3);

		assertText('${1|one,two,three|}', 'one');
		assertText('\\${1|one,two,three|}', '${1|one,two,three|}');
		assertText('${1\\|one,two,three|}', '${1\\|one,two,three|}');
		assertText('${1||}', '${1||}');
	});


	test('Parser, only textmate', () => {
		const p = new SnippetParser();
		assertMarker(p.parse('far{{}}boo'), Text);
		assertMarker(p.parse('far{{123}}boo'), Text);
		assertMarker(p.parse('far\\{{123}}boo'), Text);

		assertMarker(p.parse('far$0boo'), Text, Placeholder, Text);
		assertMarker(p.parse('far${123}boo'), Text, Placeholder, Text);
		assertMarker(p.parse('far\\${123}boo'), Text);
	});

	test('Parser, real world', () => {
		let marker = new SnippetParser().parse('console.warn(${1: $TM_SELECTED_TEXT })').children;

		assert.equal(marker[0].toString(), 'console.warn(');
		assert.ok(marker[1] instanceof Placeholder);
		assert.equal(marker[2].toString(), ')');

		const placeholder = <Placeholder>marker[1];
		assert.equal(placeholder, false);
		assert.equal(placeholder.index, '1');
		assert.equal(placeholder.children.length, 3);
		assert.ok(placeholder.children[0] instanceof Text);
		assert.ok(placeholder.children[1] instanceof Variable);
		assert.ok(placeholder.children[2] instanceof Text);
		assert.equal(placeholder.children[0].toString(), ' ');
		assert.equal(placeholder.children[1].toString(), '');
		assert.equal(placeholder.children[2].toString(), ' ');

		const nestedVariable = <Variable>placeholder.children[1];
		assert.equal(nestedVariable.name, 'TM_SELECTED_TEXT');
		assert.equal(nestedVariable.children.length, 0);

		marker = new SnippetParser().parse('$TM_SELECTED_TEXT').children;
		assert.equal(marker.length, 1);
		assert.ok(marker[0] instanceof Variable);
	});

	test('Parser, default placeholder values', () => {

		assertMarker('errorContext: `${1:err}`, error: $1', Text, Placeholder, Text, Placeholder);

		const [, p1, , p2] = new SnippetParser().parse('errorContext: `${1:err}`, error:$1').children;

		assert.equal((<Placeholder>p1).index, '1');
		assert.equal((<Placeholder>p1).children.length, '1');
		assert.equal((<Text>(<Placeholder>p1).children[0]), 'err');

		assert.equal((<Placeholder>p2).index, '1');
		assert.equal((<Placeholder>p2).children.length, '1');
		assert.equal((<Text>(<Placeholder>p2).children[0]), 'err');
	});

	test('Repeated snippet placeholder should always inherit, #31040', function () {
		assertText('${1:foo}-abc-$1', 'foo-abc-foo');
		assertText('${1:foo}-abc-${1}', 'foo-abc-foo');
		assertText('${1:foo}-abc-${1:bar}', 'foo-abc-foo');
		assertText('${1}-abc-${1:foo}', 'foo-abc-foo');
	});

	test('backspace esapce in TM only, #16212', () => {
		const actual = new SnippetParser().text('Foo \\\\${abc}bar');
		assert.equal(actual, 'Foo \\bar');
	});

	test('colon as variable/placeholder value, #16717', () => {
		let actual = new SnippetParser().text('${TM_SELECTED_TEXT:foo:bar}');
		assert.equal(actual, 'foo:bar');

		actual = new SnippetParser().text('${1:foo:bar}');
		assert.equal(actual, 'foo:bar');
	});

	test('incomplete placeholder', () => {
		assertTextAndMarker('${1:}', '', Placeholder);
	});

	test('marker#len', () => {

		function assertLen(template: string, ...lengths: number[]): void {
			const snippet = new SnippetParser().parse(template, true);
			snippet.walk(m => {
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
		let snippet = new SnippetParser().parse('This ${1:is ${2:nested}}$0', true);

		assert.equal(snippet.placeholders.length, 3);
		let [first, second] = snippet.placeholders;
		assert.equal(first.index, '1');
		assert.equal(second.index, '2');
		assert.ok(second.parent === first);
		assert.ok(first.parent === snippet);

		snippet = new SnippetParser().parse('${VAR:default${1:value}}$0', true);
		assert.equal(snippet.placeholders.length, 2);
		[first] = snippet.placeholders;
		assert.equal(first.index, '1');

		assert.ok(snippet.children[0] instanceof Variable);
		assert.ok(first.parent === snippet.children[0]);
	});

	test('TextmateSnippet#enclosingPlaceholders', function () {
		let snippet = new SnippetParser().parse('This ${1:is ${2:nested}}$0', true);
		let [first, second] = snippet.placeholders;

		assert.deepEqual(snippet.enclosingPlaceholders(first), []);
		assert.deepEqual(snippet.enclosingPlaceholders(second), [first]);
	});

	test('TextmateSnippet#offset', () => {
		let snippet = new SnippetParser().parse('te$1xt', true);
		assert.equal(snippet.offset(snippet.children[0]), 0);
		assert.equal(snippet.offset(snippet.children[1]), 2);
		assert.equal(snippet.offset(snippet.children[2]), 2);

		snippet = new SnippetParser().parse('${TM_SELECTED_TEXT:def}', true);
		assert.equal(snippet.offset(snippet.children[0]), 0);
		assert.equal(snippet.offset((<Variable>snippet.children[0]).children[0]), 0);

		// forgein marker
		assert.equal(snippet.offset(new Text('foo')), -1);
	});

	test('TextmateSnippet#placeholder', () => {
		let snippet = new SnippetParser().parse('te$1xt$0', true);
		let placeholders = snippet.placeholders;
		assert.equal(placeholders.length, 2);

		snippet = new SnippetParser().parse('te$1xt$1$0', true);
		placeholders = snippet.placeholders;
		assert.equal(placeholders.length, 3);


		snippet = new SnippetParser().parse('te$1xt$2$0', true);
		placeholders = snippet.placeholders;
		assert.equal(placeholders.length, 3);

		snippet = new SnippetParser().parse('${1:bar${2:foo}bar}$0', true);
		placeholders = snippet.placeholders;
		assert.equal(placeholders.length, 3);
	});

	test('TextmateSnippet#replace 1/2', function () {
		let snippet = new SnippetParser().parse('aaa${1:bbb${2:ccc}}$0', true);

		assert.equal(snippet.placeholders.length, 3);
		const [, second] = snippet.placeholders;
		assert.equal(second.index, '2');

		const enclosing = snippet.enclosingPlaceholders(second);
		assert.equal(enclosing.length, 1);
		assert.equal(enclosing[0].index, '1');

		let nested = new SnippetParser().parse('ddd$1eee$0', true);
		snippet.replace(second, nested.children);

		assert.equal(snippet.toString(), 'aaabbbdddeee');
		assert.equal(snippet.placeholders.length, 4);
		assert.equal(snippet.placeholders[0].index, '1');
		assert.equal(snippet.placeholders[1].index, '1');
		assert.equal(snippet.placeholders[2].index, '0');
		assert.equal(snippet.placeholders[3].index, '0');

		const newEnclosing = snippet.enclosingPlaceholders(snippet.placeholders[1]);
		assert.ok(newEnclosing[0] === snippet.placeholders[0]);
		assert.equal(newEnclosing.length, 1);
		assert.equal(newEnclosing[0].index, '1');
	});

	test('TextmateSnippet#replace 2/2', function () {
		let snippet = new SnippetParser().parse('aaa${1:bbb${2:ccc}}$0', true);

		assert.equal(snippet.placeholders.length, 3);
		const [, second] = snippet.placeholders;
		assert.equal(second.index, '2');

		let nested = new SnippetParser().parse('dddeee$0', true);
		snippet.replace(second, nested.children);

		assert.equal(snippet.toString(), 'aaabbbdddeee');
		assert.equal(snippet.placeholders.length, 3);
	});

	test('Snippet order for placeholders, #28185', function () {

		const _10 = new Placeholder(10);
		const _2 = new Placeholder(2);

		assert.equal(Placeholder.compareByIndex(_10, _2), 1);
	});

	test('Maximum call stack size exceeded, #28983', function () {
		new SnippetParser().parse('${1:${foo:${1}}}');
	});

	test('Snippet can freeze the editor, #30407', function () {

		const seen = new Set<Marker>();

		seen.clear();
		new SnippetParser().parse('class ${1:${TM_FILENAME/(?:\\A|_)([A-Za-z0-9]+)(?:\\.rb)?/(?2::\\u$1)/g}} < ${2:Application}Controller\n  $3\nend').walk(marker => {
			assert.ok(!seen.has(marker));
			seen.add(marker);
			return true;
		});

		seen.clear();
		new SnippetParser().parse('${1:${FOO:abc$1def}}').walk(marker => {
			assert.ok(!seen.has(marker));
			seen.add(marker);
			return true;
		});
	});
});

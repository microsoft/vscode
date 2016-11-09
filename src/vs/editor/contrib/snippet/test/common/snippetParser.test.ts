/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { Scanner, TokenType, SnippetParser } from 'vs/editor/contrib/snippet/common/snippetParser';


suite('SnippetParser', () => {

	test('Scanner', () => {

		const scanner = new Scanner();
		assert.equal(scanner.next().type, TokenType.EOF);

		scanner.text('abc');
		assert.equal(scanner.next().type, TokenType.VariableName);
		assert.equal(scanner.next().type, TokenType.EOF);

		scanner.text('{{abc}}');
		assert.equal(scanner.next().type, TokenType.DoubleCurlyOpen);
		assert.equal(scanner.next().type, TokenType.VariableName);
		assert.equal(scanner.next().type, TokenType.DoubleCurlyClose);
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

	function assertOutput(value: string, expected: string) {
		const p = new SnippetParser();
		const {lines} = p.parse(value);
		assert.equal(lines.join('\n'), expected);
	}

	test('Snippet, Output', () => {
		assertOutput('$', '$');
		assertOutput('{', '{');
		assertOutput('{{', '{{');
		assertOutput('{{dd', '{{dd');
		assertOutput('}}', '}}');
		assertOutput('ff}}', 'ff}}');

		assertOutput('farboo', 'farboo');
		assertOutput('far{{}}boo', 'farboo');
		assertOutput('far{{123}}boo', 'far123boo');
		assertOutput('far{{id:bern}}boo', 'farbernboo');
		assertOutput('far{{id:bern {{basel}}}}boo', 'farbern baselboo');
		assertOutput('far{{id:bern {{id:basel}}}}boo', 'farbern baselboo');
		assertOutput('far{{id:bern {{id2:basel}}}}boo', 'farbern baselboo');
	});

});

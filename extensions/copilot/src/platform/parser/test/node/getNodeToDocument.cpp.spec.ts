/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { outdent } from 'outdent';
import { afterAll, expect, suite, test } from 'vitest';
import {
	_dispose
} from '../../node/parserImpl';
import { WASMLanguage } from '../../node/treeSitterLanguages';
import { srcWithAnnotatedNodeToDoc } from './getNodeToDocument.util';


suite('getNodeToDocument - cpp', () => {

	afterAll(() => _dispose());

	async function run(annotatedSrc: string, includeSelection = false) {
		return srcWithAnnotatedNodeToDoc(
			WASMLanguage.Cpp,
			annotatedSrc,
			includeSelection,
		);
	}

	test('basic function', async () => {
		const result = await run(
			outdent`
			void foo() {
				<<>>
			}
			`,
			true
		);
		expect(result).toMatchInlineSnapshot(`
			"<FUNCTION_DEFINITION>void <IDENT>foo</IDENT>() {
				<SELECTION></SELECTION>
			}</FUNCTION_DEFINITION>"
		`);
	});

	test('function with qualified identifier and qualified return type - selection in body', async () => {
		const result = await run(
			outdent`
			Foo::Bar baz::foo() {
				<<>>
			}
			`,
			true
		);
		expect(result).toMatchInlineSnapshot(`
			"<FUNCTION_DEFINITION>Foo::Bar <IDENT>baz::foo</IDENT>() {
				<SELECTION></SELECTION>
			}</FUNCTION_DEFINITION>"
		`);
	});

	test('function with qualified identifier and qualified return type - selection on return type', async () => {
		const result = await run(
			outdent`
			<<Foo::Bar>> baz::foo() {

			}
			`
		);
		expect(result).toMatchInlineSnapshot(`
			"<FUNCTION_DEFINITION>Foo::Bar <IDENT>baz::foo</IDENT>() {

			}</FUNCTION_DEFINITION>"
		`);
	});

	test('function with qualified identifier and qualified return type - selection on function qualified identifier', async () => {
		const result = await run(
			outdent`
			Foo::Bar baz<<>>::foo() {

			}
			`
		);
		expect(result).toMatchInlineSnapshot(`
			"<FUNCTION_DEFINITION>Foo::Bar <IDENT>baz::foo</IDENT>() {

			}</FUNCTION_DEFINITION>"
		`);
	});
});

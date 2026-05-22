/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { outdent } from 'outdent';
import { afterAll, expect, suite, test } from 'vitest';
import {
	_dispose,
	_getNodeToDocument
} from '../../node/parserImpl';
import { WASMLanguage } from '../../node/treeSitterLanguages';
import { srcWithAnnotatedNodeToDoc } from './getNodeToDocument.util';


suite('getNodeToDocument - typescript', () => {

	afterAll(() => _dispose());

	async function run(annotatedSrc: string) {
		return srcWithAnnotatedNodeToDoc(
			WASMLanguage.TypeScript,
			annotatedSrc,
		);
	}

	test('should return root node for invalid range', async () => {
		const result = await _getNodeToDocument(
			WASMLanguage.TypeScript,
			'const a = 1;',
			{
				startIndex: 100,
				endIndex: 200,
			}
		);
		expect(result).toMatchInlineSnapshot(`
		{
		  "nodeIdentifier": undefined,
		  "nodeSelectionBy": "expanding",
		  "nodeToDocument": {
		    "endIndex": 12,
		    "startIndex": 0,
		    "type": "program",
		  },
		}
	`);
	});

	test('should return root node for empty source', async () => {

		const result = await run('<<>>');

		expect(result).toMatchInlineSnapshot(`"<PROGRAM></PROGRAM>"`);
	});

	test('should return node position for a variable declaration', async () => {
		const result = await run(
			'<<const>> a = 1;',
		);
		expect(result).toMatchInlineSnapshot(`"<LEXICAL_DECLARATION>const <IDENT>a</IDENT> = 1;</LEXICAL_DECLARATION>"`);
	});

	test('should return node position for a function declaration', async () => {
		const result = await srcWithAnnotatedNodeToDoc(
			WASMLanguage.TypeScript,
			'<<function>> add(a: number, b: number): number { return a + b; }',
		);
		expect(result).toMatchInlineSnapshot(`"<FUNCTION_DECLARATION>function <IDENT>add</IDENT>(a: number, b: number): number { return a + b; }</FUNCTION_DECLARATION>"`);
	});

	test('should return node position for a class declaration', async () => {
		const result = await run(
			'<<class>> MyClass { constructor() {} }',
		);
		expect(result).toMatchInlineSnapshot(`"<CLASS_DECLARATION>class <IDENT>MyClass</IDENT> { constructor() {} }</CLASS_DECLARATION>"`);
	});

	test('should return the whole program', async () => {
		const result = await run(
			outdent`
			/**
			* This is a comment
			*/
			<<const>> foo = 1;
			`,
		);
		expect(result).toMatchInlineSnapshot(`
			"/**
			* This is a comment
			*/
			<LEXICAL_DECLARATION>const <IDENT>foo</IDENT> = 1;</LEXICAL_DECLARATION>"
		`);
	});

	test('should return the whole program - function', async () => {
		const result = await run(
			outdent`
			/**
			* This is a comment
			*/
			<<function>> add(a: number, b: number): number {
				return a + b;
			}
			`,
		);
		expect(result).toMatchInlineSnapshot(`
			"/**
			* This is a comment
			*/
			<FUNCTION_DECLARATION>function <IDENT>add</IDENT>(a: number, b: number): number {
				return a + b;
			}</FUNCTION_DECLARATION>"
		`);
	});

	test('should return the whole program - class', async () => {
		const result = await run(
			outdent`
				/**
				* This is a comment
				*/
				<<class>> MyClass {
					constructor() {}
				}
				`,
		);
		expect(result).toMatchInlineSnapshot(`
			"/**
			* This is a comment
			*/
			<CLASS_DECLARATION>class <IDENT>MyClass</IDENT> {
				constructor() {}
			}</CLASS_DECLARATION>"
		`);
	});
});

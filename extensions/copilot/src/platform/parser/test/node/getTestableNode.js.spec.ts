/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { outdent } from 'outdent';
import { afterAll, expect, suite, test } from 'vitest';
import { _dispose } from '../../node/parserWithCaching';
import { WASMLanguage } from '../../node/treeSitterLanguages';
import { srcWithAnnotatedTestableNode } from './getTestableNode.util';

suite('getTestableNode - js', () => {
	afterAll(() => _dispose());

	function run(annotatedSrc: string) {
		return srcWithAnnotatedTestableNode(
			WASMLanguage.JavaScript,
			annotatedSrc,
		);
	}

	test('function declaration', async () => {
		const result = await run(
			outdent`
			function <<add>>(a: number, b: number): number {
				return a + b;
			}
			`,
		);
		expect(result).toMatchInlineSnapshot(`
			"<NODE(function_declaration)>function <IDENT>add</IDENT>(a: number, b: number): number {
				return a + b;
			}</NODE(function_declaration)>"
		`);
	});

	test('method', async () => {
		const result = await run(
			outdent`
			class Foo {
				<<method>>(a: number, b: number): number {
					return a + b;
				}
			}
			`,
		);
		expect(result).toMatchInlineSnapshot(`
			"class Foo {
				<NODE(method_definition)><IDENT>method</IDENT>(a: number, b: number): number {
					return a + b;
				}</NODE(method_definition)>
			}"
		`);
	});

	test('public method', async () => {
		const result = await run(
			outdent`
			class Foo {
				<<method>>(a: number, b: number): number {
					return a + b;
				}
			}
			`,
		);
		expect(result).toMatchInlineSnapshot(`
			"class Foo {
				<NODE(method_definition)><IDENT>method</IDENT>(a: number, b: number): number {
					return a + b;
				}</NODE(method_definition)>
			}"
		`);
	});

	test('does not capture private method', async () => {
		const result = await run(
			outdent`
			class Foo {
				private <<#method>>(a: number, b: number): number {
					return a + b;
				}
			}
			`,
		);
		expect(result).toMatchInlineSnapshot(`"testable node NOT found"`);
	});

	test('static method', async () => {
		const result = await run(
			outdent`
			class Foo {
				static <<method>>(a: number, b: number): number {
					return a + b;
				}
			}
			`,
		);
		expect(result).toMatchInlineSnapshot(`
			"class Foo {
				<NODE(method_definition)>static <IDENT>method</IDENT>(a: number, b: number): number {
					return a + b;
				}</NODE(method_definition)>
			}"
		`);
	});

	test('private static method', async () => {
		const result = await run(
			outdent`
			class Foo {
				static <<#method>>(a: number, b: number): number {
					return a + b;
				}
			}
			`,
		);
		expect(result).toMatchInlineSnapshot(`"testable node NOT found"`);
	});

	test('public static method', async () => {
		const result = await run(
			outdent`
			class Foo {
				public static <<method>>(a: number, b: number): number {
					return a + b;
				}
			}
			`,
		);
		expect(result).toMatchInlineSnapshot(`
			"class Foo {
				public <NODE(method_definition)>static <IDENT>method</IDENT>(a: number, b: number): number {
					return a + b;
				}</NODE(method_definition)>
			}"
		`);
	});
});

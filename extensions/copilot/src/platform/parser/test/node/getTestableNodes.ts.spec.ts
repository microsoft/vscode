/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { outdent } from 'outdent';
import { afterAll, expect, suite, test } from 'vitest';
import { _dispose } from '../../node/parserWithCaching';
import { WASMLanguage } from '../../node/treeSitterLanguages';
import { annotTestableNodes } from './getTestableNodes.util';

suite('getTestableNodes - ts', () => {
	afterAll(() => _dispose());

	function run(annotatedSrc: string) {
		return annotTestableNodes(
			WASMLanguage.TypeScript,
			annotatedSrc,
		);
	}

	test('function declaration', async () => {
		const result = await run(
			outdent`
			function add(a: number, b: number): number {
				return a + b;
			}
			`,
		);
		expect(result).toMatchInlineSnapshot(`
			"<NODE>function <IDENT>add</IDENT>(a: number, b: number): number {
				return a + b;
			}</NODE>"
		`);
	});

	test('method', async () => {
		const result = await run(
			outdent`
			class Foo {
				method(a: number, b: number): number {
					return a + b;
				}
			}
			`,
		);
		expect(result).toMatchInlineSnapshot(`
			"<NODE>class <IDENT>Foo</IDENT> {
				<NODE-1><IDENT-1>method</IDENT-1>(a: number, b: number): number {
					return a + b;
				}</NODE-1>
			}</NODE>"
		`);
	});

	test('public method', async () => {
		const result = await run(
			outdent`
			class Foo {
				method(a: number, b: number): number {
					return a + b;
				}
			}
			`,
		);
		expect(result).toMatchInlineSnapshot(`
			"<NODE>class <IDENT>Foo</IDENT> {
				<NODE-1><IDENT-1>method</IDENT-1>(a: number, b: number): number {
					return a + b;
				}</NODE-1>
			}</NODE>"
		`);
	});

	test('several public methods', async () => {
		const result = await run(
			outdent`
			class Foo {
				method(a: number, b: number): number {
					return a + b;
				}

				method2(a: number, b: number): number {
					return a + b;
				}

				method3(a: number, b: number): number {
					return a + b;
				}

				method4(a: number, b: number): number {
					return a + b;
				}
			}
			`,
		);
		expect(result).toMatchInlineSnapshot(`
			"<NODE>class <IDENT>Foo</IDENT> {
				<NODE-1><IDENT-1>method</IDENT-1>(a: number, b: number): number {
					return a + b;
				}</NODE-1>

				<NODE-2><IDENT-2>method2</IDENT-2>(a: number, b: number): number {
					return a + b;
				}</NODE-2>

				<NODE-3><IDENT-3>method3</IDENT-3>(a: number, b: number): number {
					return a + b;
				}</NODE-3>

				<NODE-4><IDENT-4>method4</IDENT-4>(a: number, b: number): number {
					return a + b;
				}</NODE-4>
			}</NODE>"
		`);
	});

	test('captures mix', async () => {
		const result = await run(
			outdent`
			class Foo {
				methodPub() {
				}

				private method(a: number, b: number): number {
					return a + b;
				}
			}
			`,
		);
		expect(result).toMatchInlineSnapshot(`
			"<NODE>class <IDENT>Foo</IDENT> {
				<NODE-1><IDENT-1>methodPub</IDENT-1>() {
				}</NODE-1>

				private method(a: number, b: number): number {
					return a + b;
				}
			}</NODE>"
		`);
	});

	test('does NOT capture private method', async () => {
		const result = await run(
			outdent`
			class Foo {
				private method(a: number, b: number): number {
					return a + b;
				}
			}
			`,
		);
		expect(result).toMatchInlineSnapshot(`
			"class Foo {
				private method(a: number, b: number): number {
					return a + b;
				}
			}"
		`);
	});

	test('static method', async () => {
		const result = await run(
			outdent`
			class Foo {
				static method(a: number, b: number): number {
					return a + b;
				}
			}
			`,
		);
		expect(result).toMatchInlineSnapshot(`
			"<NODE>class <IDENT>Foo</IDENT> {
				<NODE-1>static <IDENT-1>method</IDENT-1>(a: number, b: number): number {
					return a + b;
				}</NODE-1>
			}</NODE>"
		`);
	});

	test('private static method', async () => {
		const result = await run(
			outdent`
			class Foo {
				private static method(a: number, b: number): number {
					return a + b;
				}
			}
			`,
		);
		expect(result).toMatchInlineSnapshot(`
			"class Foo {
				private static method(a: number, b: number): number {
					return a + b;
				}
			}"
		`);
	});


	test('public static method', async () => {
		const result = await run(
			outdent`
			class Foo {
				public static method(a: number, b: number): number {
					return a + b;
				}
			}
			`,
		);
		expect(result).toMatchInlineSnapshot(`
			"<NODE>class <IDENT>Foo</IDENT> {
				<NODE-1>public static <IDENT-1>method</IDENT-1>(a: number, b: number): number {
					return a + b;
				}</NODE-1>
			}</NODE>"
		`);
	});

	test('class declaration', async () => {
		const result = await run(
			outdent`
			export class Foo {
				method(a: number, b: number): number {
					return a + b;
				}
			}
			`,
		);
		expect(result).toMatchInlineSnapshot(`
			"export <NODE>class <IDENT>Foo</IDENT> {
				<NODE-1><IDENT-1>method</IDENT-1>(a: number, b: number): number {
					return a + b;
				}</NODE-1>
			}</NODE>"
		`);
	});

	test('class declaration with prop and method', async () => {
		const result = await run(
			outdent`
			export class Foo {
				bar = 1;

				method(a: number, b: number): number {
					return a + b;
				}
			}
			`,
		);
		expect(result).toMatchInlineSnapshot(`
			"export <NODE>class <IDENT>Foo</IDENT> {
				bar = 1;

				<NODE-1><IDENT-1>method</IDENT-1>(a: number, b: number): number {
					return a + b;
				}</NODE-1>
			}</NODE>"
		`);
	});

	test('class declaration with prop and static method', async () => {
		const result = await run(
			outdent`
			export class Foo {
				bar = 1;

				static method(a: number, b: number): number {
					return a + b;
				}
			}
			`,
		);
		expect(result).toMatchInlineSnapshot(`
			"export <NODE>class <IDENT>Foo</IDENT> {
				bar = 1;

				<NODE-1>static <IDENT-1>method</IDENT-1>(a: number, b: number): number {
					return a + b;
				}</NODE-1>
			}</NODE>"
		`);
	});
});

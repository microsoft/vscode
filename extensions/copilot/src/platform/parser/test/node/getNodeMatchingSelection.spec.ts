/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { outdent } from 'outdent';
import { afterAll, expect, suite, test } from 'vitest';
import {
	_dispose,
} from '../../node/parserImpl';
import { _parse } from '../../node/parserWithCaching';
import { _getNodeMatchingSelection } from '../../node/selectionParsing';
import { WASMLanguage } from '../../node/treeSitterLanguages';

suite('getNodeMatchingSelection', () => {
	function deannotateSrc(annotatedSrc: string) {
		const startIndex = annotatedSrc.indexOf('<<');
		const endIndex = annotatedSrc.indexOf('>>') - 2;
		return {
			deannotatedSrc: annotatedSrc.replace('<<', '').replace('>>', ''),
			annotatedRange: {
				startIndex,
				endIndex,
			},
		};
	}

	async function getNode(
		annotatedSrc: string,
		languageId = WASMLanguage.TypeScript
	) {
		const { deannotatedSrc, annotatedRange } = deannotateSrc(annotatedSrc);

		const parseTreeRef = await _parse(languageId, deannotatedSrc);

		try {
			const r = _getNodeMatchingSelection(
				parseTreeRef.tree,
				annotatedRange,
				languageId
			);
			return r ? r.text : 'undefined';
		} finally {
			parseTreeRef.dispose();
		}
	}

	afterAll(() => _dispose());

	suite('with function', () => {
		test('within identifier', async () => {
			const source = outdent`
				class Foo {

					ba<<>>r() {

					}
				}
				`;
			expect(await getNode(source)).toMatchInlineSnapshot(`"undefined"`);
		});

		test('whitespace before', async () => {
			const source = outdent`
				class Foo {

				<<	bar() {

					}>>
				}
				`;
			expect(await getNode(source)).toMatchInlineSnapshot(`
				"bar() {

					}"
				`);
		});

		test('whitespace before & after', async () => {
			const source = outdent`
				class Foo {

				<<	bar() {

					}
				>>
				}
				`;
			expect(await getNode(source)).toMatchInlineSnapshot(`
				"bar() {

					}"
				`);
		});

		test('range misses closes }', async () => {
			const source = outdent`
				class Foo {

					<<bar() {

					>>}
				}
				`;
			expect(await getNode(source)).toMatchInlineSnapshot(`
				"bar() {

					}"
			`);
		});

		test('imprecise selection', async () => {
			const source = outdent`
				class Foo {

					b<<ar() {

					>>}
				}
				`;
			expect(await getNode(source)).toMatchInlineSnapshot(`
				"bar() {

					}"
			`);
		});
	});

	suite('with class', () => {
		test('precise selection', async () => {
			const source = outdent`
				<<class Foo {

					bar() {

					}
				}>>
				`;
			expect(await getNode(source)).toMatchInlineSnapshot(`
				"class Foo {

					bar() {

					}
				}"
			`);
		});

		test('range misses closing }', async () => {
			const source = outdent`
				<<class Foo {

					bar() {

					}
				>>}
				`;
			expect(await getNode(source)).toMatchInlineSnapshot(`
				"class Foo {

					bar() {

					}
				}"
			`);
		});

		test('imprecise selection', async () => {
			const source = outdent`
				class Foo << {

					bar() {

					}>>
				}
				`;
			expect(await getNode(source)).toMatchInlineSnapshot(`
				"class Foo  {

					bar() {

					}
				}"
			`);
		});
	});

	suite('with interface', () => {
		test('precise selection', async () => {
			const source = outdent`
				<<interface Foo {

					bar(): void;

				}>>`;
			expect(await getNode(source)).toMatchInlineSnapshot(`
			"interface Foo {

				bar(): void;

			}"
		`);
		});

		test('whitespace before & after', async () => {
			const source = outdent`
				<<
					interface Foo {

						bar(): void;

					}
				>>`;
			expect(await getNode(source)).toMatchInlineSnapshot(`
			"interface Foo {

					bar(): void;

				}"
		`);
		});

		test('within a function', async () => {
			const source = outdent`
				<<
				function bar() {
					interface Foo {

						bar(): void;

					}

					return 42;
				}
				>>`;
			expect(await getNode(source)).toMatchInlineSnapshot(`
			"function bar() {
				interface Foo {

					bar(): void;

				}

				return 42;
			}"
		`);
		});

		test('most of function is selected', async () => {
			const source = outdent`
				<<
				function bar() {
					interface Foo {

						bar(): void;

					}

					return 42;>>
				}
				`;
			expect(await getNode(source)).toMatchInlineSnapshot(`
			"function bar() {
				interface Foo {

					bar(): void;

				}

				return 42;
			}"
		`);
		});
	});
});


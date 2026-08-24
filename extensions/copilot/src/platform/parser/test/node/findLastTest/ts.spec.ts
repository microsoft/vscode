/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { outdent } from 'outdent';
import { afterAll, expect, suite, test } from 'vitest';
import { _dispose } from '../../../node/parserWithCaching';
import { WASMLanguage } from '../../../node/treeSitterLanguages';
import { srcWithAnnotatedLastTest } from './util';

suite('findLastTest - ts', () => {
	afterAll(() => _dispose());

	function run(annotatedSrc: string) {
		return srcWithAnnotatedLastTest(
			WASMLanguage.TypeScript,
			annotatedSrc,
		);
	}

	test('one test in suite', async () => {
		const result = await run(
			outdent`
			suite(() => {
				test('foo', () => {
					expect(1).toBe(1);
				});
			})
			`,
		);
		expect(result).toMatchInlineSnapshot(`
			"suite(() => {
				<TEST>test('foo', () => {
					expect(1).toBe(1);
				});</TEST>
			})"
		`);
	});

	test('two tests in suite', async () => {
		const result = await run(
			outdent`
			suite(() => {
				test('foo', () => {
					expect(1).toBe(1);
				});

				test('bar', () => {
					expect(1).toBe(1);
				});
			})
			`,
		);
		expect(result).toMatchInlineSnapshot(`
			"suite(() => {
				test('foo', () => {
					expect(1).toBe(1);
				});

				<TEST>test('bar', () => {
					expect(1).toBe(1);
				});</TEST>
			})"
		`);
	});

	test('one test', async () => {
		const result = await run(
			outdent`
			test('foo', () => {
				expect(1).toBe(1);
			});
			`,
		);
		expect(result).toMatchInlineSnapshot(`
			"<TEST>test('foo', () => {
				expect(1).toBe(1);
			});</TEST>"
		`);
	});

	test('two tests', async () => {
		const result = await run(
			outdent`
			test('foo', () => {
				expect(1).toBe(1);
			});

			test('bar', () => {
				expect(1).toBe(1);
			});
			`,
		);
		expect(result).toMatchInlineSnapshot(`
			"test('foo', () => {
				expect(1).toBe(1);
			});

			<TEST>test('bar', () => {
				expect(1).toBe(1);
			});</TEST>"
		`);
	});

	test('FIXME: test within not file and not suite should not be captured', async () => {
		const result = await run(
			outdent`
			for (const i of [1, 2, 3]) {
				test('foo', () => {
					expect(1).toBe(1);
				});
			}
			`,
		);
		expect(result).toMatchInlineSnapshot(`
			"for (const i of [1, 2, 3]) {
				<TEST>test('foo', () => {
					expect(1).toBe(1);
				});</TEST>
			}"
		`);
	});
});

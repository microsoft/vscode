/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { afterAll, expect, suite, test } from 'vitest';
import { _getDocumentableNodeIfOnIdentifier } from '../../node/docGenParsing';
import { _getCoarseParentScope, } from '../../node/parserImpl';
import { _dispose, _parse } from '../../node/parserWithCaching';
import { WASMLanguage } from '../../node/treeSitterLanguages';
import { allKnownQueries } from '../../node/treeSitterQueries';
import { insertRangeMarkers } from './markers';

suite('getDocumentableNodeIfOnIdentifier', () => {
	// TODO@ulugbekna: rewrite all tests using insertRangeMarkers for better visualization

	test('should return undefined for range not containing an identifier', async () => {
		const result = await _getDocumentableNodeIfOnIdentifier(
			WASMLanguage.TypeScript,
			'const x = 1;',
			{
				startIndex: 0,
				endIndex: 0,
			}
		);
		expect(result).toBeUndefined();
	});

	test('should return object for range containing an identifier not in a definition or declaration', async () => {
		const result = await _getDocumentableNodeIfOnIdentifier(
			WASMLanguage.TypeScript,
			'const x = 1;',
			{
				startIndex: 6,
				endIndex: 7,
			}
		);
		expect(result).toMatchInlineSnapshot(`
		{
		  "identifier": "x",
		  "nodeRange": {
		    "endIndex": 11,
		    "startIndex": 6,
		  },
		}
	`);
		expect(
			insertRangeMarkers('const x = 1;', [result?.nodeRange!])
		).toMatchInlineSnapshot(
			`"const <>x = 1</>;"`
		);
	});

	test('should return the identifier and node range for a range containing an identifier in a definition', async () => {
		const result = await _getDocumentableNodeIfOnIdentifier(
			WASMLanguage.TypeScript,
			'function foo() {}',
			{ startIndex: 9, endIndex: 12 }
		);
		expect(result).toMatchInlineSnapshot(`
		{
		  "identifier": "foo",
		  "nodeRange": {
		    "endIndex": 17,
		    "startIndex": 0,
		  },
		}
	`);
		expect(
			insertRangeMarkers('function foo() {}', [result?.nodeRange!])
		).toMatchInlineSnapshot(`"<>function foo() {}</>"`);
	});

	test('should return the identifier and node range for a range containing an identifier in a declaration', async () => {
		const result = await _getDocumentableNodeIfOnIdentifier(
			WASMLanguage.TypeScript,
			'const x = 1;',
			{
				startIndex: 6,
				endIndex: 7,
			}
		);
		expect(result).toMatchInlineSnapshot(`
		{
		  "identifier": "x",
		  "nodeRange": {
		    "endIndex": 11,
		    "startIndex": 6,
		  },
		}
	`);
	});

	test('should return the identifier and node range for a range containing an identifier in a var spec', async () => {
		const result = await _getDocumentableNodeIfOnIdentifier(
			WASMLanguage.TypeScript,
			'var x: number;',
			{ startIndex: 4, endIndex: 5 }
		);
		expect(result).toMatchInlineSnapshot(`
		{
		  "identifier": "x",
		  "nodeRange": {
		    "endIndex": 13,
		    "startIndex": 4,
		  },
		}
	`);
	});
});

suite('getParentScope', () => {
	test('Finding parent node in TypeScript', async () => {
		const result = await _getCoarseParentScope(
			WASMLanguage.TypeScript,
			[
				'interface IFar {',
				'  bar(): void;',
				'  foo(): void;',
				'}'
			].join('\n'),
			{ startPosition: { row: 1, column: 2 }, endPosition: { row: 1, column: 5 } }
		);
		expect(result).toStrictEqual({
			startPosition: { row: 0, column: 0 },
			endPosition: { row: 3, column: 1 },
		});
	});

	test('Finding parent node in Python', async () => {
		const result = await _getCoarseParentScope(
			WASMLanguage.Python,
			[
				'# some comment',
				'class Room:',
				'   length = 0.0',
				'   breadth = 0.0',
				'   def Area(abc):',
				'      print("The area is " + length*breadth)',
				'',
				'# some other comment',
			].join('\n'),
			{
				startPosition: { row: 5, column: 5 },
				endPosition: { row: 5, column: 5 },
			}
		);
		expect(result).toStrictEqual({
			startPosition: { row: 4, column: 3 },
			endPosition: { row: 5, column: 44 },
		});
	});

	test('Finding parent node in Java', async () => {
		const result = await _getCoarseParentScope(
			WASMLanguage.Java,
			[
				'/*** comment',
				'',
				' comment ***/ ',
				'public class Main {',
				'	public static void main(String[] args) {',
				'	  System.out.println("Hello World");',
				'	}',
				'}',
			].join('\n'),
			{
				startPosition: { row: 5, column: 5 },
				endPosition: { row: 5, column: 5 },
			}
		);
		expect(result).toStrictEqual({
			startPosition: { row: 4, column: 1 },
			endPosition: { row: 6, column: 2 },
		});
	});
});


suite('All Tree Sitter Queries are valid', () => {

	afterAll(() => _dispose());

	for (const language in allKnownQueries) {
		generateTest(language as WASMLanguage);
	}

	function generateTest(language: WASMLanguage) {
		test(`Valid queries for ${language}`, async () => {
			const queries = allKnownQueries[language];
			const parseTreeRef = await _parse(language, '');
			try {
				const lang = parseTreeRef.tree.getLanguage();
				for (const query of queries) {
					try {
						lang.query(query);
					} catch (err) {
						assert.fail(`Query failed for ${query}: ${err}`);
					}
				}
			} finally {
				parseTreeRef.dispose();
			}
		});
	}
});

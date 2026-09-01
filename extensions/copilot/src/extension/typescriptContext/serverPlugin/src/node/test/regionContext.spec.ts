/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { beforeAll, suite, test } from 'vitest';

import ts from 'typescript';

import type { LineRange, Range, Region } from '../../common/protocol';
import type * as regionContextProvider from '../../common/regionContextProvider';

let RegionContextProvider: typeof regionContextProvider.RegionContextProvider;

beforeAll(async () => {
	const TS = await import('../../common/typescript');
	TS.default.install(ts);
	RegionContextProvider = (await import('../../common/regionContextProvider')).RegionContextProvider;
});

function getRegionContext(sourceFile: ts.SourceFile, ranges: readonly Range[], requested?: LineRange): Region[] | undefined {
	return new RegionContextProvider().getRegions(sourceFile, ranges, requested);
}

function range(line: number, character: number = 0): Range {
	return {
		start: { line, character },
		end: { line, character }
	};
}

suite('Region context', () => {
	test('returns enclosing structural regions', () => {
		const sourceFile = ts.createSourceFile('C:\\workspace\\regions.ts', [
			'class Container {',
			'\tmethod(): void {',
			'\t\tconst callback = () => {',
			'\t\t\treturn;',
			'\t\t};',
			'\t}',
			'}',
		].join('\n'), ts.ScriptTarget.Latest, true);

		assert.deepStrictEqual(getRegionContext(sourceFile, [range(3)]), [
			{ kind: 'arrow-function', name: 'callback', range: { start: 2, end: 4 } },
			{ kind: 'method', name: 'method', range: { start: 1, end: 5 } },
			{ kind: 'class', name: 'Container', range: { start: 0, end: 6 } },
			{ kind: 'sourceFile', name: 'regions.ts', range: { start: 0, end: 6 } },
		] satisfies Region[]);
	});

	test('merges distinct innermost regions', () => {
		const sourceFile = ts.createSourceFile('regions.ts', [
			'class Container {',
			'\tfirst(): void {',
			'\t\treturn;',
			'\t}',
			'\tsecond(): void {',
			'\t\treturn;',
			'\t}',
			'}',
		].join('\n'), ts.ScriptTarget.Latest, true);

		assert.deepStrictEqual(getRegionContext(sourceFile, [range(2), range(5)]), [
			{ kind: 'merged', range: { start: 1, end: 6 } },
			{ kind: 'class', name: 'Container', range: { start: 0, end: 7 } },
			{ kind: 'sourceFile', name: 'regions.ts', range: { start: 0, end: 7 } },
		] satisfies Region[]);
	});

	test('groups property signatures within the requested range', () => {
		const sourceFile = ts.createSourceFile('regions.ts', [
			'interface Result {',
			'\tvalue: number;',
			'\tmessage: string;',
			'}',
		].join('\n'), ts.ScriptTarget.Latest, true);

		assert.deepStrictEqual(getRegionContext(sourceFile, [range(1, 1), range(2, 1)], { start: 1, end: 2 }), [
			{ kind: 'interface-members', name: 'Result', range: { start: 1, end: 2 } },
			{ kind: 'sourceFile', name: 'regions.ts', range: { start: 0, end: 3 } },
		] satisfies Region[]);
	});
});

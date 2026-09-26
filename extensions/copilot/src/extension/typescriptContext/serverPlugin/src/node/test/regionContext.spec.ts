/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { beforeAll, suite, test } from 'vitest';

import ts from 'typescript';

import type { LineRange, Range, RegionResult } from '../../common/protocol';
import type * as regionContextProvider from '../../common/regionContextProvider';

let RegionContextProvider: typeof regionContextProvider.RegionContextProvider;

beforeAll(async () => {
	const TS = await import('../../common/typescript');
	TS.default.install(ts);
	RegionContextProvider = (await import('../../common/regionContextProvider')).RegionContextProvider;
});

function getRegionContext(sourceFile: ts.SourceFile, ranges: readonly Range[], requested?: LineRange): RegionResult | undefined {
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

		assert.deepStrictEqual(getRegionContext(sourceFile, [range(3)]), {
			regions: [
				{ kind: 'arrow-function', name: 'callback', range: { start: 2, end: 4 } },
				{ kind: 'method', name: 'method', range: { start: 1, end: 5 } },
				{ kind: 'class', name: 'Container', range: { start: 0, end: 6 } },
				{ kind: 'sourceFile', name: 'regions.ts', range: { start: 0, end: 6 } },
			],
			paths: { smallest: [241, 219, 260, 261, 243, 241, 174, 263, 307] }
		} satisfies RegionResult);
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

		assert.deepStrictEqual(getRegionContext(sourceFile, [range(2), range(5)]), {
			regions: [
				{ kind: 'merged', range: { start: 1, end: 6 } },
				{ kind: 'class', name: 'Container', range: { start: 0, end: 7 } },
				{ kind: 'sourceFile', name: 'regions.ts', range: { start: 0, end: 7 } },
			],
			paths: {
				smallest: [241, 174, 263, 307],
				largest: [241, 174, 263, 307]
			}
		} satisfies RegionResult);
	});

	test('selects paths by region span', () => {
		const sourceFile = ts.createSourceFile('regions.ts', [
			'class Container {',
			'\tconstructor() {',
			'\t\tthis.value = 0;',
			'\t}',
			'',
			'\tmethod(): void {',
			'\t\tconst value = 1;',
			'\t\treturn;',
			'\t}',
			'}',
		].join('\n'), ts.ScriptTarget.Latest, true);
		const smallest = getRegionContext(sourceFile, [range(2)])?.paths.smallest;
		const largest = getRegionContext(sourceFile, [range(6)])?.paths.smallest;

		assert.deepStrictEqual(getRegionContext(sourceFile, [range(2), range(6)])?.paths, {
			smallest,
			largest
		});
	});

	test('groups property signatures within the requested range', () => {
		const sourceFile = ts.createSourceFile('regions.ts', [
			'interface Result {',
			'\tvalue: number;',
			'\tmessage: string;',
			'}',
		].join('\n'), ts.ScriptTarget.Latest, true);

		assert.deepStrictEqual(getRegionContext(sourceFile, [range(1, 1), range(2, 1)], { start: 1, end: 2 }), {
			regions: [
				{ kind: 'interface-members', name: 'Result', range: { start: 1, end: 2 } },
				{ kind: 'sourceFile', name: 'regions.ts', range: { start: 0, end: 3 } },
			],
			paths: {
				smallest: [80, 171, 264, 307],
				largest: [80, 171, 264, 307]
			}
		} satisfies RegionResult);
	});

	test('returns expression-backed structural regions', () => {
		const source = [
			'const assignedFunction = function () { return 1; };',
			'const assignedArrow = () => { return 2; };',
			'const AssignedClass = class Inner {',
			'\tmethod() { return 3; }',
			'};',
			'class Fields {',
			'\tfield = () => { return 4; };',
			'\twrapped = ((() => { return 5; }) satisfies () => number);',
			'}',
		].join('\n');
		const sourceFile = ts.createSourceFile('regions.ts', source, ts.ScriptTarget.Latest, true);

		assert.deepStrictEqual(regionKinds(getRegionContext(sourceFile, [rangeAt(source, 'return 1')])), [
			['function', 'assignedFunction'],
			['sourceFile', 'regions.ts'],
		]);
		assert.deepStrictEqual(regionKinds(getRegionContext(sourceFile, [rangeAt(source, 'assignedArrow')])), [
			['arrow-function', 'assignedArrow'],
			['sourceFile', 'regions.ts'],
		]);
		assert.deepStrictEqual(regionKinds(getRegionContext(sourceFile, [rangeAt(source, 'return 3')])), [
			['method', 'method'],
			['class', 'AssignedClass'],
			['sourceFile', 'regions.ts'],
		]);
		assert.deepStrictEqual(regionKinds(getRegionContext(sourceFile, [rangeAt(source, 'return 4')])), [
			['function', 'field'],
			['class', 'Fields'],
			['sourceFile', 'regions.ts'],
		]);
		assert.deepStrictEqual(regionKinds(getRegionContext(sourceFile, [rangeAt(source, 'return 5')])), [
			['function', 'wrapped'],
			['class', 'Fields'],
			['sourceFile', 'regions.ts'],
		]);
	});

	test('returns additional declaration regions', () => {
		const source = [
			'class Container {',
			'\tstatic { const value = 1; }',
			'}',
			'enum Choice { First, Second }',
			'interface Callable {',
			'\t(): number;',
			'\tnew (): Callable;',
			'\t[key: string]: unknown;',
			'}',
		].join('\n');
		const sourceFile = ts.createSourceFile('regions.ts', source, ts.ScriptTarget.Latest, true);

		assert.deepStrictEqual(regionKinds(getRegionContext(sourceFile, [rangeAt(source, 'value')])), [
			['static-block', undefined],
			['class', 'Container'],
			['sourceFile', 'regions.ts'],
		]);
		assert.deepStrictEqual(regionKinds(getRegionContext(sourceFile, [rangeAt(source, 'Second')])), [
			['enum-member', 'Second'],
			['enum', 'Choice'],
			['sourceFile', 'regions.ts'],
		]);
		assert.deepStrictEqual(regionKinds(getRegionContext(sourceFile, [rangeAt(source, '(): number')])), [
			['call-signature', undefined],
			['interface', 'Callable'],
			['sourceFile', 'regions.ts'],
		]);
		assert.deepStrictEqual(regionKinds(getRegionContext(sourceFile, [rangeAt(source, 'new ()')])), [
			['construct-signature', undefined],
			['interface', 'Callable'],
			['sourceFile', 'regions.ts'],
		]);
		assert.deepStrictEqual(regionKinds(getRegionContext(sourceFile, [rangeAt(source, '[key')])), [
			['index-signature', undefined],
			['interface', 'Callable'],
			['sourceFile', 'regions.ts'],
		]);
	});

	test('returns import and export assignment regions', () => {
		const source = [
			'import legacy = require(\'./legacy\');',
			'export = legacy;',
		].join('\n');
		const sourceFile = ts.createSourceFile('regions.ts', source, ts.ScriptTarget.Latest, true);

		assert.deepStrictEqual(regionKinds(getRegionContext(sourceFile, [rangeAt(source, 'legacy =')])), [
			['import', 'require(\'./legacy\')'],
			['sourceFile', 'regions.ts'],
		]);
		assert.deepStrictEqual(regionKinds(getRegionContext(sourceFile, [rangeAt(source, 'export =')])), [
			['export', undefined],
			['sourceFile', 'regions.ts'],
		]);

		const exportDefaultSource = 'export default createValue();';
		const exportDefaultFile = ts.createSourceFile('regions.ts', exportDefaultSource, ts.ScriptTarget.Latest, true);
		assert.deepStrictEqual(regionKinds(getRegionContext(exportDefaultFile, [rangeAt(exportDefaultSource, 'export default')])), [
			['export', undefined],
			['sourceFile', 'regions.ts'],
		]);
	});

	test('returns object and collection member regions', () => {
		const configBlock = [
			'const config = {',
			'\tshorthand,',
			'\t...defaults,',
			'\tnested: true,',
			'};',
		].join('\n');
		const valuesBlock = [
			'const values = [',
			'\t1,',
			'\tcreateValue(),',
			'\t...otherValues,',
			'];',
		].join('\n');
		const source = [
			'const shorthand = 1;',
			'const defaults = {};',
			configBlock,
			valuesBlock,
		].join('\n');
		const sourceFile = ts.createSourceFile('regions.ts', source, ts.ScriptTarget.Latest, true);

		assert.deepStrictEqual(regionKinds(getRegionContext(sourceFile, [rangeAt(source, 'config')])), [
			['object-literal', 'config'],
			['sourceFile', 'regions.ts'],
		]);
		const shorthandRange = rangeAt(source, 'shorthand,');
		assert.deepStrictEqual(regionKinds(getRegionContext(sourceFile, [shorthandRange], lineRange(shorthandRange))), [
			['object-literal-members', 'config'],
			['object-literal', 'config'],
			['sourceFile', 'regions.ts'],
		]);
		const spreadRange = rangeAt(source, '...defaults');
		assert.deepStrictEqual(regionKinds(getRegionContext(sourceFile, [spreadRange], lineRange(spreadRange))), [
			['object-literal-members', 'config'],
			['object-literal', 'config'],
			['sourceFile', 'regions.ts'],
		]);
		const arrayElementRange = rangeAt(source, 'createValue()');
		assert.deepStrictEqual(regionKinds(getRegionContext(sourceFile, [arrayElementRange], lineRange(arrayElementRange))), [
			['array-elements', 'values'],
			['array-literal', 'values'],
			['sourceFile', 'regions.ts'],
		]);
		const arraySpreadRange = rangeAt(source, '...otherValues');
		assert.deepStrictEqual(regionKinds(getRegionContext(sourceFile, [arraySpreadRange], lineRange(arraySpreadRange))), [
			['array-elements', 'values'],
			['array-literal', 'values'],
			['sourceFile', 'regions.ts'],
		]);

		assert.deepStrictEqual(regionKinds(getRegionContext(sourceFile, [shorthandRange], lineRangeOf(source, configBlock))), [
			['object-literal', 'config'],
			['sourceFile', 'regions.ts'],
		]);
		assert.deepStrictEqual(regionKinds(getRegionContext(sourceFile, [arrayElementRange], lineRangeOf(source, valuesBlock))), [
			['array-literal', 'values'],
			['sourceFile', 'regions.ts'],
		]);
	});

	test('handles full ranges for property, nested, and wrapped literals', () => {
		const fieldBlock = [
			'\toptions = {',
			'\t\tfieldValue: true,',
			'\t};',
		].join('\n');
		const classBlock = [
			'class LiteralFields {',
			fieldBlock,
			'}',
		].join('\n');
		const nestedInnerBlock = [
			'\tinner: {',
			'\t\tnestedValue: true,',
			'\t},',
		].join('\n');
		const nestedBlock = [
			'const nestedConfig = {',
			nestedInnerBlock,
			'};',
		].join('\n');
		const wrappedBlock = [
			'const wrappedConfig = ({',
			'\twrappedValue: true,',
			'} satisfies object);',
		].join('\n');
		const source = [classBlock, nestedBlock, wrappedBlock].join('\n');
		const sourceFile = ts.createSourceFile('regions.ts', source, ts.ScriptTarget.Latest, true);
		const sourceFileRange = lineRangeOf(source, source);

		assert.deepStrictEqual(getRegionContext(sourceFile, [rangeAt(source, 'fieldValue')], lineRangeOf(source, fieldBlock))?.regions, [
			{ kind: 'object-literal', name: 'options', range: lineRangeOf(source, fieldBlock) },
			{ kind: 'class', name: 'LiteralFields', range: lineRangeOf(source, classBlock) },
			{ kind: 'sourceFile', name: 'regions.ts', range: sourceFileRange },
		]);
		assert.deepStrictEqual(getRegionContext(sourceFile, [rangeAt(source, 'nestedValue')], lineRangeOf(source, nestedInnerBlock))?.regions, [
			{ kind: 'object-literal', name: 'inner', range: lineRangeOf(source, nestedInnerBlock) },
			{ kind: 'object-literal', name: 'nestedConfig', range: lineRangeOf(source, nestedBlock) },
			{ kind: 'sourceFile', name: 'regions.ts', range: sourceFileRange },
		]);
		assert.deepStrictEqual(getRegionContext(sourceFile, [rangeAt(source, 'wrappedValue')], lineRangeOf(source, wrappedBlock))?.regions, [
			{ kind: 'object-literal', name: 'wrappedConfig', range: lineRangeOf(source, wrappedBlock) },
			{ kind: 'sourceFile', name: 'regions.ts', range: sourceFileRange },
		]);
	});
});

function rangeAt(source: string, text: string): Range {
	const offset = source.indexOf(text);
	assert.notStrictEqual(offset, -1, `Expected to find ${JSON.stringify(text)} in source`);
	const lines = source.substring(0, offset).split(/\r?\n/);
	return range(lines.length - 1, lines[lines.length - 1].length);
}

function lineRange(range: Range): LineRange {
	return { start: range.start.line, end: range.end.line };
}

function lineRangeOf(source: string, text: string): LineRange {
	const start = rangeAt(source, text).start.line;
	const end = source.substring(0, source.indexOf(text) + text.length).split(/\r?\n/).length - 1;
	return { start, end };
}

function regionKinds(result: RegionResult | undefined): [string, string | undefined][] | undefined {
	return result?.regions.map(region => [region.kind, region.name]);
}

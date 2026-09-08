/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

import { API } from '@typescript/native/unstable/async';
import * as vscode from 'vscode';
import { afterAll, beforeAll, suite, test } from 'vitest';

import type { LineRange, RegionResult } from '../../../../../platform/languageContextProvider/common/regionContextProvider';
import { TestLogService } from '../../../../../platform/testing/common/testLogService';
import { TS7RegionContextProvider } from '../regionContextProvider';

const fixtures = path.join(__dirname, '../../../serverPlugin/fixtures/context');
const projectDirectory = path.join(fixtures, 'p14');
const configFile = path.join(projectDirectory, 'tsconfig.json');
const fileName = path.join(projectDirectory, 'source/f1.ts');
const structuralEntitiesFile = path.join(projectDirectory, 'source/structuralEntities.ts');
const structuralEntitiesSource = fs.readFileSync(structuralEntitiesFile, 'utf8');

suite('TypeScript 7 region context', () => {
	let api: API;

	beforeAll(() => {
		api = new API({ cwd: process.cwd() });
	});

	afterAll(async () => {
		await api.close();
	});

	async function getRegions(ranges: vscode.Range[], requested?: LineRange, sourceFile: string = fileName): Promise<RegionResult | undefined> {
		const provider = new TS7RegionContextProvider(new TestLogService(), new TestTypeScript7Api(api, configFile));
		try {
			return await provider.getRegions(vscode.Uri.file(sourceFile), 'typescript', ranges, requested);
		} finally {
			provider.dispose();
		}
	}

	test('returns enclosing structural regions', async () => {
		assert.deepStrictEqual(await getRegions([range(9, 2)]), {
			regions: [
				{ kind: 'constructor', name: 'constructor', range: { start: 8, end: 10 } },
				{ kind: 'class', name: 'Calculator', range: { start: 5, end: 23 } },
				{ kind: 'sourceFile', name: 'f1.ts', range: { start: 0, end: 32 } },
			],
			paths: { smallest: [110, 211, 226, 244, 241, 176, 263, 307] }
		} satisfies RegionResult);
	});

	test('merges distinct innermost regions', async () => {
		assert.deepStrictEqual(await getRegions([range(13, 2), range(18, 2)]), {
			regions: [
				{ kind: 'merged', range: { start: 12, end: 22 } },
				{ kind: 'class', name: 'Calculator', range: { start: 5, end: 23 } },
				{ kind: 'sourceFile', name: 'f1.ts', range: { start: 0, end: 32 } },
			],
			paths: {
				smallest: [110, 211, 226, 244, 241, 174, 263, 307],
				largest: [107, 253, 241, 174, 263, 307]
			}
		} satisfies RegionResult);
	});

	test('selects paths by region span', async () => {
		assert.deepStrictEqual((await getRegions([range(9, 2), range(13, 2)]))?.paths, {
			smallest: [110, 211, 226, 244, 241, 176, 263, 307],
			largest: [110, 211, 226, 244, 241, 174, 263, 307]
		});
	});

	test('groups property signatures within the requested range', async () => {
		assert.deepStrictEqual(await getRegions([range(1, 1), range(2, 1)], { start: 1, end: 2 }), {
			regions: [
				{ kind: 'interface-members', name: 'Result', range: { start: 1, end: 2 } },
				{ kind: 'sourceFile', name: 'f1.ts', range: { start: 0, end: 32 } },
			],
			paths: {
				smallest: [80, 171, 264, 307],
				largest: [80, 171, 264, 307]
			}
		} satisfies RegionResult);
	});

	test('returns assigned function expressions as named function regions', async () => {
		assert.deepStrictEqual(regionKinds(await getRegions([rangeAt(structuralEntitiesSource, 'return 0')], undefined, structuralEntitiesFile)), [
			['function', 'assignedFunction'],
			['sourceFile', 'structuralEntities.ts'],
		]);
	});

	test('returns assigned structural expressions when the binding name is matched', async () => {
		assert.deepStrictEqual(regionKinds(await getRegions([rangeAt(structuralEntitiesSource, 'assignedArrow')], undefined, structuralEntitiesFile)), [
			['arrow-function', 'assignedArrow'],
			['sourceFile', 'structuralEntities.ts'],
		]);
		assert.deepStrictEqual(regionKinds(await getRegions([rangeAt(structuralEntitiesSource, 'AssignedClass')], undefined, structuralEntitiesFile)), [
			['class', 'AssignedClass'],
			['sourceFile', 'structuralEntities.ts'],
		]);
	});

	test('returns class expressions as structural containers', async () => {
		assert.deepStrictEqual(regionKinds(await getRegions([rangeAt(structuralEntitiesSource, 'return 2')], undefined, structuralEntitiesFile)), [
			['method', 'method'],
			['class', 'AssignedClass'],
			['sourceFile', 'structuralEntities.ts'],
		]);
	});

	test('does not duplicate class field arrow regions', async () => {
		assert.deepStrictEqual(regionKinds(await getRegions([rangeAt(structuralEntitiesSource, 'return 3')], undefined, structuralEntitiesFile)), [
			['function', 'field'],
			['class', 'ClassFields'],
			['sourceFile', 'structuralEntities.ts'],
		]);
	});

	test('recognizes callable initializers through outer expressions', async () => {
		const expected = [
			['function', 'wrapped'],
			['class', 'ClassFields'],
			['sourceFile', 'structuralEntities.ts'],
		];
		assert.deepStrictEqual(regionKinds(await getRegions([rangeAt(structuralEntitiesSource, 'wrapped')], undefined, structuralEntitiesFile)), expected);
		assert.deepStrictEqual(regionKinds(await getRegions([rangeAt(structuralEntitiesSource, 'return 4')], undefined, structuralEntitiesFile)), expected);
	});

	test('returns enum, static block, and signature regions', async () => {
		assert.deepStrictEqual(regionKinds(await getRegions([rangeAt(structuralEntitiesSource, 'Second')], undefined, structuralEntitiesFile)), [
			['enum-member', 'Second'],
			['enum', 'Choice'],
			['sourceFile', 'structuralEntities.ts'],
		]);
		assert.deepStrictEqual(regionKinds(await getRegions([rangeAt(structuralEntitiesSource, 'staticValue')], undefined, structuralEntitiesFile)), [
			['static-block', undefined],
			['class', 'ClassFields'],
			['sourceFile', 'structuralEntities.ts'],
		]);
		assert.deepStrictEqual(regionKinds(await getRegions([rangeAt(structuralEntitiesSource, '(): number;')], undefined, structuralEntitiesFile)), [
			['call-signature', undefined],
			['interface', 'Callable'],
			['sourceFile', 'structuralEntities.ts'],
		]);
		assert.deepStrictEqual(regionKinds(await getRegions([rangeAt(structuralEntitiesSource, 'new(): Callable')], undefined, structuralEntitiesFile)), [
			['construct-signature', undefined],
			['interface', 'Callable'],
			['sourceFile', 'structuralEntities.ts'],
		]);
		assert.deepStrictEqual(regionKinds(await getRegions([rangeAt(structuralEntitiesSource, '[key: string]')], undefined, structuralEntitiesFile)), [
			['index-signature', undefined],
			['interface', 'Callable'],
			['sourceFile', 'structuralEntities.ts'],
		]);
	});

	test('returns import-equals and export-assignment regions', async () => {
		const importExportFile = path.join(projectDirectory, 'source/importExportEquals.ts');
		const importExportSource = fs.readFileSync(importExportFile, 'utf8');
		assert.deepStrictEqual(regionKinds(await getRegions([rangeAt(importExportSource, 'legacy =')], undefined, importExportFile)), [
			['import', 'require(\'./f1\')'],
			['sourceFile', 'importExportEquals.ts'],
		]);
		assert.deepStrictEqual(regionKinds(await getRegions([rangeAt(importExportSource, 'export =')], undefined, importExportFile)), [
			['export', undefined],
			['sourceFile', 'importExportEquals.ts'],
		]);

		assert.deepStrictEqual(regionKinds(await getRegions([rangeAt(structuralEntitiesSource, 'export default')], undefined, structuralEntitiesFile)), [
			['export', undefined],
			['sourceFile', 'structuralEntities.ts'],
		]);
	});

	test('returns object and collection member regions', async () => {
		assert.deepStrictEqual(regionKinds(await getRegions([rangeAt(structuralEntitiesSource, 'config')], undefined, structuralEntitiesFile)), [
			['object-literal', 'config'],
			['sourceFile', 'structuralEntities.ts'],
		]);

		const shorthandRange = rangeAt(structuralEntitiesSource, 'shorthand,');
		assert.deepStrictEqual(regionKinds(await getRegions([shorthandRange], lineRange(shorthandRange), structuralEntitiesFile)), [
			['object-literal-members', 'config'],
			['object-literal', 'config'],
			['sourceFile', 'structuralEntities.ts'],
		]);

		const spreadRange = rangeAt(structuralEntitiesSource, '...defaults');
		assert.deepStrictEqual(regionKinds(await getRegions([spreadRange], lineRange(spreadRange), structuralEntitiesFile)), [
			['object-literal-members', 'config'],
			['object-literal', 'config'],
			['sourceFile', 'structuralEntities.ts'],
		]);

		const arrayElementRange = rangeAt(structuralEntitiesSource, 'createValue(),');
		assert.deepStrictEqual(regionKinds(await getRegions([arrayElementRange], lineRange(arrayElementRange), structuralEntitiesFile)), [
			['array-elements', 'values'],
			['array-literal', 'values'],
			['sourceFile', 'structuralEntities.ts'],
		]);

		const arraySpreadRange = rangeAt(structuralEntitiesSource, '...[3]');
		assert.deepStrictEqual(regionKinds(await getRegions([arraySpreadRange], lineRange(arraySpreadRange), structuralEntitiesFile)), [
			['array-elements', 'values'],
			['array-literal', 'values'],
			['sourceFile', 'structuralEntities.ts'],
		]);

		assert.deepStrictEqual(regionKinds(await getRegions([shorthandRange], lineRangeOf(structuralEntitiesSource, [
			'export const config = {',
			'\tshorthand,',
			'\t...defaults,',
			'\tnested: true,',
			'};',
		].join('\n')), structuralEntitiesFile)), [
			['object-literal', 'config'],
			['sourceFile', 'structuralEntities.ts'],
		]);
		assert.deepStrictEqual(regionKinds(await getRegions([arrayElementRange], lineRangeOf(structuralEntitiesSource, [
			'export const values = [',
			'\t\'first\',',
			'\tcreateValue(),',
			'\t...[3],',
			'];',
		].join('\n')), structuralEntitiesFile)), [
			['array-literal', 'values'],
			['sourceFile', 'structuralEntities.ts'],
		]);
	});

	test('handles full ranges for property, nested, and wrapped literals', async () => {
		const sourceFileRange = lineRangeOf(structuralEntitiesSource, structuralEntitiesSource);
		const fieldBlock = [
			'\toptions = {',
			'\t\tfieldValue: true,',
			'\t};',
		].join('\n');
		const classBlock = [
			'export class LiteralFields {',
			fieldBlock,
			'}',
		].join('\n');
		const nestedInnerBlock = [
			'\tinner: {',
			'\t\tnestedValue: true,',
			'\t},',
		].join('\n');
		const nestedBlock = [
			'export const nestedConfig = {',
			nestedInnerBlock,
			'};',
		].join('\n');
		const wrappedBlock = [
			'export const wrappedConfig = ({',
			'\twrappedValue: true,',
			'} satisfies object);',
		].join('\n');

		assert.deepStrictEqual((await getRegions([rangeAt(structuralEntitiesSource, 'fieldValue')], lineRangeOf(structuralEntitiesSource, fieldBlock), structuralEntitiesFile))?.regions, [
			{ kind: 'object-literal', name: 'options', range: lineRangeOf(structuralEntitiesSource, fieldBlock) },
			{ kind: 'class', name: 'LiteralFields', range: lineRangeOf(structuralEntitiesSource, classBlock) },
			{ kind: 'sourceFile', name: 'structuralEntities.ts', range: sourceFileRange },
		]);
		assert.deepStrictEqual((await getRegions([rangeAt(structuralEntitiesSource, 'nestedValue')], lineRangeOf(structuralEntitiesSource, nestedInnerBlock), structuralEntitiesFile))?.regions, [
			{ kind: 'object-literal', name: 'inner', range: lineRangeOf(structuralEntitiesSource, nestedInnerBlock) },
			{ kind: 'object-literal', name: 'nestedConfig', range: lineRangeOf(structuralEntitiesSource, nestedBlock) },
			{ kind: 'sourceFile', name: 'structuralEntities.ts', range: sourceFileRange },
		]);
		assert.deepStrictEqual((await getRegions([rangeAt(structuralEntitiesSource, 'wrappedValue')], lineRangeOf(structuralEntitiesSource, wrappedBlock), structuralEntitiesFile))?.regions, [
			{ kind: 'object-literal', name: 'wrappedConfig', range: lineRangeOf(structuralEntitiesSource, wrappedBlock) },
			{ kind: 'sourceFile', name: 'structuralEntities.ts', range: sourceFileRange },
		]);
	});
});

class TestTypeScript7Api {
	constructor(
		private readonly api: API,
		private readonly configFile: string,
	) { }

	async getApi() {
		return {
			clearSourceFileCache: () => this.api.clearSourceFileCache(),
			updateSnapshot: () => this.api.updateSnapshot({ openProjects: [this.configFile] }),
		};
	}

	dispose(): void { }
}

function range(line: number, character: number = 0): vscode.Range {
	return new vscode.Range(line, character, line, character);
}

function rangeAt(source: string, text: string): vscode.Range {
	const offset = source.indexOf(text);
	assert.notStrictEqual(offset, -1, `Expected to find ${JSON.stringify(text)} in fixture`);
	const lines = source.substring(0, offset).split(/\r?\n/);
	return range(lines.length - 1, lines[lines.length - 1].length);
}

function lineRange(range: vscode.Range): LineRange {
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

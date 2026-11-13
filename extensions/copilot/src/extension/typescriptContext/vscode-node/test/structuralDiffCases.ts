/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert';
import path from 'node:path';
import { test } from 'vitest';
import * as vscode from 'vscode';
import { createTextDocumentData } from '../../../../util/common/test/shims/textDocument';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';

/**
 * The TS7 provider opens these files to look up their project. The TS6 provider only uses their names.
 */
export const fixtureDirectory = path.join(__dirname, '../ts7/fixtures/structuralDiff/source');

/** A node that lists its children even when it has none, so that tests can read them directly. */
interface NodeWithChildren extends vscode.StructuralDiffNode {
	readonly children: readonly NodeWithChildren[];
}

interface StructuralDiffWithChildren extends vscode.StructuralDiff {
	readonly root: NodeWithChildren;
}

export type ComputeStructuralDiff = (originalText: string, modifiedText: string, changes?: readonly vscode.DiffTextChange[], fileUri?: vscode.Uri, languageId?: string, originalUri?: vscode.Uri) => Promise<StructuralDiffWithChildren>;

/**
 * Returns a function that diffs two texts with the provider and checks the result against the provider
 * contract. Without explicit changes, the whole texts form one change. Nodes without children get an
 * empty list.
 */
export function createCompute(getProvider: () => vscode.StructuralDiffProvider, defaultUri: vscode.Uri): ComputeStructuralDiff {
	return async (originalText, modifiedText, changes, fileUri = defaultUri, languageId = 'typescript', originalUri = fileUri.with({ scheme: 'git' })) => {
		const original = createTextDocumentData(originalUri, originalText, languageId).document;
		const modified = createTextDocumentData(fileUri, modifiedText, languageId).document;
		const context = { changes: changes ?? [{ originalRange: fullRange(original), modifiedRange: fullRange(modified) }] };
		const result = await getProvider().provideStructuralDiff(original, modified, context, CancellationToken.None);
		assert.ok(result);
		assertContract(result, original, modified, context);
		return { ...result, root: withChildren(result.root) };
	};
}

/**
 * Defines the tests that every TypeScript structural diff provider must pass in the current suite.
 */
export function defineStructuralDiffCases(compute: ComputeStructuralDiff): void {
	test('groups a changed method under its unchanged class', async () => {
		const original = 'class Calculator {\n\tcalculate(value: number) {\n\t\treturn value + 1;\n\t}\n}';
		const modified = original.replace('value + 1', 'value * 2');
		const result = await compute(original, modified, [{
			originalRange: rangeOf(original, 'value + 1'),
			modifiedRange: rangeOf(modified, 'value * 2'),
		}]);
		assert.deepStrictEqual(summarize(result, original, modified), [{
			path: ['Calculator'], original: 'Calculator', modified: 'Calculator', kind: vscode.SymbolKind.Class, originalChanges: [], modifiedChanges: [],
		}, {
			path: ['Calculator', 'calculate'], original: 'calculate', modified: 'calculate', kind: vscode.SymbolKind.Method,
			originalChanges: [[0, vscode.StructuralDiffClassification.Implementation, 'value + 1', []]],
			modifiedChanges: [[0, vscode.StructuralDiffClassification.Implementation, 'value * 2', []]],
		}]);
	});

	test('splits a same-line header and body change into non-overlapping character ranges', async () => {
		const original = 'function compute(value: number) { return value + 1; }';
		const modified = original.replace('value: number', 'value: string').replace('value + 1', 'value.length');
		const result = await compute(original, modified);
		const node = result.root.children[0];
		assert.deepStrictEqual({
			original: node.originalChanges.map(change => change.classification),
			modified: node.modifiedChanges.map(change => change.classification),
			header: node.modifiedChanges.filter(change => change.classification === vscode.StructuralDiffClassification.Header).map(change => modifiedText(change.range, modified)),
		}, {
			original: [vscode.StructuralDiffClassification.Header, vscode.StructuralDiffClassification.Other, vscode.StructuralDiffClassification.Implementation, vscode.StructuralDiffClassification.Other],
			modified: [vscode.StructuralDiffClassification.Header, vscode.StructuralDiffClassification.Other, vscode.StructuralDiffClassification.Implementation, vscode.StructuralDiffClassification.Other],
			header: ['function compute(value: string) '],
		});
	});

	test('reports a whole added class as one declaration instead of duplicating its members', async () => {
		const modified = 'export class Added {\n\tvalue = 1;\n\tmethod() { return this.value; }\n}';
		const result = await compute('', modified);
		assert.deepStrictEqual(summarize(result, '', modified), [{
			path: ['Added'], original: undefined, modified: 'Added', kind: vscode.SymbolKind.Class, originalChanges: [],
			modifiedChanges: [[0, vscode.StructuralDiffClassification.Declaration, modified, []]],
		}]);
	});

	test('reports whole deleted declarations against the original snapshot', async () => {
		const original = 'function removed() {\n\treturn 1;\n}';
		const result = await compute(original, '');
		assert.deepStrictEqual(summarize(result, original, ''), [{
			path: ['removed'], original: 'removed', modified: undefined, kind: vscode.SymbolKind.Function,
			originalChanges: [[0, vscode.StructuralDiffClassification.Declaration, original, []]], modifiedChanges: [],
		}]);
	});

	test('matches a name-only rename with its original entity', async () => {
		const original = 'function before() { return 1; }';
		const modified = 'function after() { return 1; }';
		const result = await compute(original, modified, [{
			originalRange: rangeOf(original, 'before'), modifiedRange: rangeOf(modified, 'after'),
		}]);
		assert.deepStrictEqual(summarize(result, original, modified).map(node => ({
			path: node.path, original: node.original, modified: node.modified,
		})), [
			{ path: ['after'], original: 'before', modified: 'after' },
		]);
	});

	for (const [source, before, after] of [
		['class Example { private before: number = 1; }', 'before', 'after'],
		['class Example { private runNext(): void { schedule(); } }', 'runNext', 'runNext2'],
		['class Example { private runNext2(): void { schedule(); } }', 'runNext2', 'runNext'],
		['class Example { _value = 1; }', '_value', 'value'],
		['class Example { value = 1; }', 'value', '_value'],
		['class Example { calculate() { return 1; } }', 'calculate', 'calcFastulate'],
		['class Example { #before = 1; }', '#before', '#after'],
		['interface Example { before: number; }', 'before', 'after'],
		['const options = { before: 1 };', 'before', 'after'],
		['const before = () => 1;', 'before', 'after'],
		['class Example { before = () => 1; }', 'before', 'after'],
		['const before = 1;', 'before', 'after'],
	] as const) {
		test(`matches a declaration-name edit including empty ranges: ${before} -> ${after} in ${source}`, async () => {
			const modified = source.replace(before, after);
			let prefix = 0;
			while (prefix < Math.min(before.length, after.length) && before[prefix] === after[prefix]) {
				prefix++;
			}
			let suffix = 0;
			while (suffix < Math.min(before.length, after.length) - prefix
				&& before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) {
				suffix++;
			}
			const originalDocument = createTextDocumentData(vscode.Uri.parse('test:/file.ts'), source, 'typescript').document;
			const modifiedDocument = createTextDocumentData(vscode.Uri.parse('test:/file.ts'), modified, 'typescript').document;
			const originalName = rangeOf(source, before);
			const modifiedName = rangeOf(modified, after);
			const originalStart = originalDocument.offsetAt(originalName.start);
			const modifiedStart = modifiedDocument.offsetAt(modifiedName.start);
			const result = await compute(source, modified, [{
				originalRange: new vscode.Range(originalDocument.positionAt(originalStart + prefix), originalDocument.positionAt(originalStart + before.length - suffix)),
				modifiedRange: new vscode.Range(modifiedDocument.positionAt(modifiedStart + prefix), modifiedDocument.positionAt(modifiedStart + after.length - suffix)),
			}]);
			const allNodes = flatten(result.root);
			const renamed = allNodes.filter(node => node.modifiedItem?.name === after);
			assert.deepStrictEqual({
				renamed: renamed.map(node => ({
					original: node.originalItem?.name,
					modified: node.modifiedItem?.name,
					originalSelection: node.originalItem?.selectionRange,
					modifiedSelection: node.modifiedItem?.selectionRange,
				})),
				unmatched: allNodes.filter(node => !node.originalItem || !node.modifiedItem).map(node => (node.modifiedItem ?? node.originalItem)?.name),
			}, {
				renamed: [{ original: before, modified: after, originalSelection: originalName, modifiedSelection: modifiedName }],
				unmatched: [],
			});
		});
	}

	test('matches renamed getters and setters independently', async () => {
		const original = 'class Example { get before() { return 1; } set before(value: number) { consume(value); } }';
		const modified = original.replaceAll('before', 'after');
		const result = await compute(original, modified, [
			{ originalRange: rangeOf(original, 'before'), modifiedRange: rangeOf(modified, 'after') },
			{ originalRange: rangeOf(original, 'before', original.indexOf('set')), modifiedRange: rangeOf(modified, 'after', modified.indexOf('set')) },
		]);
		assert.deepStrictEqual(result.root.children[0].children.map(node => [
			node.originalItem?.name, node.modifiedItem?.name, declarationKeyword(node.originalItem, original), declarationKeyword(node.modifiedItem, modified),
		]), [
			['before', 'after', 'get', 'get'], ['before', 'after', 'set', 'set'],
		]);
	});

	test('reserves exact-name matches before searching for renames', async () => {
		const original = 'class Example { before() { return 1; } unchangedName() { return 1; } }';
		const modified = 'class Example { after() { return 1; } unchangedName() { return 2; } }';
		const result = await compute(original, modified);
		assert.deepStrictEqual(result.root.children[0].children.map(node => [node.originalItem?.name, node.modifiedItem?.name]), [
			['before', 'after'], ['unchangedName', 'unchangedName'],
		]);
	});

	test('matches rename locations after earlier edits and allows reference changes outside the declaration', async () => {
		const original = 'const value = 0;\nclass Example { before() { return 1; } }\nnew Example().before();';
		const modified = `// An earlier insertion\n${original.replaceAll('before', 'after')}`;
		const result = await compute(original, modified, [
			{ originalRange: new vscode.Range(0, 0, 0, 0), modifiedRange: new vscode.Range(0, 0, 1, 0) },
			{ originalRange: rangeOf(original, 'before'), modifiedRange: rangeOf(modified, 'after') },
			{ originalRange: rangeOf(original, 'before', original.indexOf('new Example')), modifiedRange: rangeOf(modified, 'after', modified.indexOf('new Example')) },
		]);
		assert.deepStrictEqual(result.root.children[0].children.map(node => [node.originalItem?.name, node.modifiedItem?.name]), [['before', 'after']]);
	});

	test('ignores formatting trivia without changing the syntax fingerprint', async () => {
		const original = 'class Example { before(value: number) { return value + 1; } }';
		const modified = 'class Example { after ( value : number ) {\n // Comment\n return value + 1;\n} }';
		const result = await compute(original, modified, [{
			originalRange: rangeOf(original, 'before'), modifiedRange: rangeOf(modified, 'after'),
		}]);
		assert.deepStrictEqual(result.root.children[0].children.map(node => [node.originalItem?.name, node.modifiedItem?.name]), [['before', 'after']]);
	});

	for (const [original, modified] of [
		['class Example { before() { return 1; } }', 'class Example { after() { return 2; } }'],
		['class Example { before = 1; }', 'class Example { after = 2; }'],
		['class Example { before: number; }', 'class Example { after: string; }'],
		['class Example { before(value: number) {} }', 'class Example { after(value: string) {} }'],
		['class Example { private before() {} }', 'class Example { public after() {} }'],
		['function before() { return before(); }', 'function after() { return after(); }'],
		['function before() { return "before"; }', 'function after() { return "after"; }'],
		['function before() { return\nvalue; }', 'function after() { return value; }'],
	] as const) {
		test(`does not infer a rename when syntax outside the name changes: ${original}`, async () => {
			const result = await compute(original, modified);
			assert.deepStrictEqual(flatten(result.root).filter(node => node.originalItem?.name === 'before' || node.modifiedItem?.name === 'after').map(node => [
				node.originalItem?.name, node.modifiedItem?.name,
			]), [[undefined, 'after'], ['before', undefined]]);
		});
	}

	for (const [beforeMembers, afterMembers] of [
		['before() {} other() {}', 'after() {} another() {}'],
		['before() {}', 'after() {} another() {}'],
		['before() {} other() {}', 'after() {}'],
	] as const) {
		test(`does not infer ambiguous one-to-one rename candidates: ${beforeMembers} -> ${afterMembers}`, async () => {
			const result = await compute(`class Example { ${beforeMembers} }`, `class Example { ${afterMembers} }`);
			assert.strictEqual(result.root.children[0].children.every(node => !node.originalItem || !node.modifiedItem), true);
		});
	}

	test('does not infer rename pairs for overloads', async () => {
		const original = 'function before(value: string): void;\nfunction before(value: number): void;\nfunction before(value: string | number) {}';
		const modified = original.replaceAll('before', 'after');
		const result = await compute(original, modified);
		assert.strictEqual(result.root.children.every(node => !node.originalItem || !node.modifiedItem), true);
	});

	test('requires paired name-location evidence instead of equating independent additions and deletions', async () => {
		const original = 'class Example {\n\tbefore() { return 1; }\n\tkeep() { return 2; }\n}';
		const modified = 'class Example {\n\tkeep() { return 2; }\n\tafter() { return 1; }\n}';
		const result = await compute(original, modified, [
			{ originalRange: rangeOf(original, '\tbefore() { return 1; }\n'), modifiedRange: new vscode.Range(1, 0, 1, 0) },
			{ originalRange: new vscode.Range(3, 0, 3, 0), modifiedRange: rangeOf(modified, '\tafter() { return 1; }\n') },
		]);
		assert.deepStrictEqual(result.root.children[0].children.map(node => [node.originalItem?.name, node.modifiedItem?.name]), [
			[undefined, 'after'], ['before', undefined],
		]);
	});

	test('does not search across different matched parent entities', async () => {
		const original = 'class First { before() {} }\nclass Second {}';
		const modified = 'class First {}\nclass Second { after() {} }';
		const result = await compute(original, modified);
		assert.deepStrictEqual(result.root.children.map(node => ({
			parent: node.modifiedItem?.name,
			children: node.children.map(child => [child.originalItem?.name, child.modifiedItem?.name]),
		})), [
			{ parent: 'First', children: [['before', undefined]] },
			{ parent: 'Second', children: [[undefined, 'after']] },
		]);
	});

	test('does not infer computed-name changes as simple identifier renames', async () => {
		const original = 'class Example { [before]() {} }';
		const modified = 'class Example { [after]() {} }';
		const result = await compute(original, modified);
		assert.deepStrictEqual(result.root.children[0].children.map(node => [node.originalItem?.name, node.modifiedItem?.name]), [
			[undefined, '[after]'], ['[before]', undefined],
		]);
	});

	test('keeps getters and setters with the same name distinct', async () => {
		const original = 'class Accessors {\n\tget value() { return 1; }\n\tset value(value: number) { consume(value); }\n}';
		const modified = original.replace('return 1', 'return 2').replace('consume(value)', 'consume(value + 1)');
		const result = await compute(original, modified, [
			{ originalRange: rangeOf(original, 'return 1'), modifiedRange: rangeOf(modified, 'return 2') },
			{ originalRange: rangeOf(original, 'consume(value)'), modifiedRange: rangeOf(modified, 'consume(value + 1)') },
		]);
		assert.deepStrictEqual(result.root.children[0].children.map(node => [declarationKeyword(node.originalItem, original), declarationKeyword(node.modifiedItem, modified)]), [
			['get', 'get'], ['set', 'set'],
		]);
	});

	test('does not merge duplicate declarations and overloads by name', async () => {
		const original = 'function overloaded(value: string): void;\nfunction overloaded(value: number): void;\nfunction overloaded(value: string | number) {}';
		const modified = original.replace('value: number', 'value: boolean');
		const result = await compute(original, modified, [{
			originalRange: rangeOf(original, 'value: number'), modifiedRange: rangeOf(modified, 'value: boolean'),
		}]);
		assert.deepStrictEqual(result.root.children.map(node => [node.originalItem?.name, node.modifiedItem?.name]), [
			[undefined, 'overloaded'], ['overloaded', undefined],
		]);
	});

	test('retains namespaces and assigned object containers without duplicate callable nodes', async () => {
		const original = 'namespace Example {\n\texport const options = {\n\t\tcalculate: (() => { return 1; }) satisfies Function,\n\t};\n}';
		const modified = original.replace('return 1', 'return 2');
		const result = await compute(original, modified, [{
			originalRange: rangeOf(original, 'return 1'), modifiedRange: rangeOf(modified, 'return 2'),
		}]);
		assert.deepStrictEqual(summarize(result, original, modified).map(node => [node.path, node.kind]), [
			[['Example'], vscode.SymbolKind.Module],
			[['Example', 'options'], vscode.SymbolKind.Object],
			[['Example', 'options', 'calculate'], vscode.SymbolKind.Function],
		]);
	});

	test('groups imports and re-exports separately without duplicating root coverage', async () => {
		const original = 'import { oldName } from "dependency";\nexport { oldName } from "dependency";';
		const modified = original.replaceAll('oldName', 'newName');
		const result = await compute(original, modified, [
			{ originalRange: rangeOf(original, 'oldName'), modifiedRange: rangeOf(modified, 'newName') },
			{ originalRange: rangeOf(original, 'oldName', original.indexOf('export')), modifiedRange: rangeOf(modified, 'newName', modified.indexOf('export')) },
		]);
		assert.deepStrictEqual({
			nodes: summarize(result, original, modified),
			original: result.root.originalChanges,
			modified: result.root.modifiedChanges,
		}, {
			nodes: [{
				path: ['Imports'], original: 'Imports', modified: 'Imports', kind: vscode.SymbolKind.Module,
				originalChanges: [[0, vscode.StructuralDiffClassification.Dependency, 'oldName', []]],
				modifiedChanges: [[0, vscode.StructuralDiffClassification.Dependency, 'newName', []]],
			}, {
				path: ['Exports'], original: 'Exports', modified: 'Exports', kind: vscode.SymbolKind.Module,
				originalChanges: [[1, vscode.StructuralDiffClassification.Dependency, 'oldName', []]],
				modifiedChanges: [[1, vscode.StructuralDiffClassification.Dependency, 'newName', []]],
			}],
			original: [], modified: [],
		});
	});

	test('keeps added imports and deleted re-exports classified as dependencies', async () => {
		const imports = 'import type { Value } from "dependency";';
		const exports = 'export { Value } from "dependency";';
		const added = await compute('', imports);
		const deleted = await compute(exports, '');
		assert.deepStrictEqual({
			added: summarize(added, '', imports),
			deleted: summarize(deleted, exports, ''),
		}, {
			added: [{
				path: ['Imports'], original: undefined, modified: 'Imports', kind: vscode.SymbolKind.Module, originalChanges: [],
				modifiedChanges: [[0, vscode.StructuralDiffClassification.Dependency, imports, []]],
			}],
			deleted: [{
				path: ['Exports'], original: 'Exports', modified: undefined, kind: vscode.SymbolKind.Module, modifiedChanges: [],
				originalChanges: [[0, vscode.StructuralDiffClassification.Dependency, exports, []]],
			}],
		});
	});

	test('groups side-effect and import-equals statements with ordinary imports', async () => {
		const original = [
			'import "old-side-effect";',
			'import Alias = require("old-module");',
			'import type { Value } from "old-types";',
		].join('\n');
		const modified = original.replaceAll('old-', 'new-');
		const changes = ['old-side-effect', 'old-module', 'old-types'].map(value => ({
			originalRange: rangeOf(original, value), modifiedRange: rangeOf(modified, value.replace('old-', 'new-')),
		}));
		const result = await compute(original, modified, changes);
		const group = result.root.children[0];
		assert.deepStrictEqual({
			groups: result.root.children.map(node => node.modifiedItem?.name),
			original: group.originalChanges.map(change => [change.textChangeIndex, change.classification, modifiedText(change.range, original)]),
			modified: group.modifiedChanges.map(change => [change.textChangeIndex, change.classification, modifiedText(change.range, modified)]),
			root: [result.root.originalChanges, result.root.modifiedChanges],
			selection: group.modifiedItem?.selectionRange,
		}, {
			groups: ['Imports'],
			original: [
				[0, vscode.StructuralDiffClassification.Dependency, 'old-side-effect'],
				[1, vscode.StructuralDiffClassification.Dependency, 'old-module'],
				[2, vscode.StructuralDiffClassification.Dependency, 'old-types'],
			],
			modified: [
				[0, vscode.StructuralDiffClassification.Dependency, 'new-side-effect'],
				[1, vscode.StructuralDiffClassification.Dependency, 'new-module'],
				[2, vscode.StructuralDiffClassification.Dependency, 'new-types'],
			],
			root: [[], []],
			selection: rangeOf(modified, 'import "new-side-effect";'),
		});
	});

	for (const [original, modified, classification] of [
		['export { oldName };', 'export { newName };', vscode.StructuralDiffClassification.Implementation],
		['export default oldName;', 'export default newName;', vscode.StructuralDiffClassification.Implementation],
		['export = oldName;', 'export = newName;', vscode.StructuralDiffClassification.Implementation],
		['export as namespace OldName;', 'export as namespace NewName;', vscode.StructuralDiffClassification.Implementation],
		['export type { Value } from "old-module";', 'export type { Value } from "new-module";', vscode.StructuralDiffClassification.Dependency],
		['export * from "old-module";', 'export * from "new-module";', vscode.StructuralDiffClassification.Dependency],
	] as const) {
		test(`groups standalone export syntax: ${original}`, async () => {
			const result = await compute(original, modified);
			assert.deepStrictEqual({
				groups: result.root.children.map(node => node.modifiedItem?.name),
				classifications: result.root.children[0].modifiedChanges.map(change => change.classification),
				root: [result.root.originalChanges, result.root.modifiedChanges],
			}, { groups: ['Exports'], classifications: [classification], root: [[], []] });
		});
	}

	test('does not put exported declarations or their export modifier changes in Exports', async () => {
		const original = 'class Calculator {}\nfunction calculate() { return 1; }\nconst value = 1;';
		const modified = original.split('\n').map(line => `export ${line}`).join('\n');
		const changes = original.split('\n').map((_, line) => ({
			originalRange: new vscode.Range(line, 0, line, 0),
			modifiedRange: new vscode.Range(line, 0, line, 'export '.length),
		}));
		const result = await compute(original, modified, changes);
		assert.deepStrictEqual(result.root.children.map(node => ({
			name: node.modifiedItem?.name,
			kind: node.modifiedItem?.kind,
			classifications: node.modifiedChanges.map(change => [change.classification, modifiedText(change.range, modified)]),
		})), [
			{ name: 'Calculator', kind: vscode.SymbolKind.Class, classifications: [[vscode.StructuralDiffClassification.Header, 'export ']] },
			{ name: 'calculate', kind: vscode.SymbolKind.Function, classifications: [[vscode.StructuralDiffClassification.Header, 'export ']] },
			{ name: 'value', kind: vscode.SymbolKind.Variable, classifications: [[vscode.StructuralDiffClassification.Header, 'export ']] },
		]);
	});

	for (const original of [
		'export default class Calculator { value = 1; }',
		'export default function calculate() { return 1; }',
	]) {
		test(`keeps default exported declarations in their normal structural location: ${original}`, async () => {
			const modified = original.replace('1', '2');
			const result = await compute(original, modified, [{
				originalRange: rangeOf(original, '1'), modifiedRange: rangeOf(modified, '2'),
			}]);
			const name = original.includes('class') ? 'Calculator' : 'calculate';
			assert.deepStrictEqual(result.root.children.map(node => [node.originalItem?.name, node.modifiedItem?.name]), [[name, name]]);
		});
	}

	test('does not let discontiguous import/export groups swallow intervening declarations', async () => {
		const original = [
			'import { first } from "one";',
			'export function between() { return 1; }',
			'import { second } from "two";',
			'export { first };',
			'export class Between { value = 1; }',
			'export { second } from "two";',
		].join('\n');
		const modified = original.replaceAll('first', 'firstChanged').replaceAll('second', 'secondChanged').replaceAll('1', '2');
		const result = await compute(original, modified);
		assert.deepStrictEqual({
			names: result.root.children.map(node => node.modifiedItem?.name),
			imports: result.root.children[0].modifiedChanges.map(change => modifiedText(change.range, modified)),
			exports: result.root.children[2].modifiedChanges.map(change => modifiedText(change.range, modified)),
			functionCoverage: result.root.children[1].modifiedChanges.map(change => modifiedText(change.range, modified)).join(''),
			rootCoverage: result.root.modifiedChanges.map(change => modifiedText(change.range, modified)).join(''),
		}, {
			names: ['Imports', 'between', 'Exports', 'Between'],
			imports: ['import { firstChanged } from "one";', 'import { secondChanged } from "two";'],
			exports: ['export { firstChanged };', 'export { secondChanged } from "two";'],
			functionCoverage: 'export function between() { return 2; }',
			rootCoverage: '\n\n\n\n\n',
		});
	});

	test('groups declarations within an export statement under Exports', async () => {
		const original = [
			'export { value };',
			'function between() { return 1; }',
			'export default { calculate() { return 1; } };',
		].join('\n');
		const modified = original.replaceAll('return 1', 'return 2');
		const result = await compute(original, modified);
		assert.deepStrictEqual(summarize(result, original, modified).map(node => node.path), [
			['Exports'], ['Exports', 'calculate'], ['between'],
		]);
	});

	test('omits unchanged import/export groups when only a declaration body changes', async () => {
		const original = 'import { Value } from "dependency";\nexport function calculate() { return 1; }\nexport { Value };';
		const modified = original.replace('return 1', 'return 2');
		const result = await compute(original, modified, [{
			originalRange: rangeOf(original, 'return 1'), modifiedRange: rangeOf(modified, 'return 2'),
		}]);
		assert.deepStrictEqual(result.root.children.map(node => [node.originalItem?.name, node.modifiedItem?.name]), [['calculate', 'calculate']]);
	});

	test('keeps import/export groups within their enclosing namespace', async () => {
		const original = 'namespace Container {\n\timport Alias = Library.Old;\n\texport { Alias };\n}';
		const modified = original.replace('Library.Old', 'Library.New').replace('export { Alias }', 'export { Alias as Public }');
		const result = await compute(original, modified, [
			{ originalRange: rangeOf(original, 'Library.Old'), modifiedRange: rangeOf(modified, 'Library.New') },
			{ originalRange: rangeOf(original, 'export { Alias }'), modifiedRange: rangeOf(modified, 'export { Alias as Public }') },
		]);
		assert.deepStrictEqual(summarize(result, original, modified).map(node => [node.path, node.kind]), [
			[['Container'], vscode.SymbolKind.Module],
			[['Container', 'Imports'], vscode.SymbolKind.Module],
			[['Container', 'Exports'], vscode.SymbolKind.Module],
		]);
	});

	test('does not match import/export groups with declarations having the same display names', async () => {
		const original = 'namespace Imports { export const value = 1; }\nimport { oldName } from "dependency";\nnamespace Exports { export const value = 1; }\nexport { oldName };';
		const modified = original.replaceAll('1', '2').replaceAll('oldName', 'newName');
		const result = await compute(original, modified);
		assert.deepStrictEqual(result.root.children.map(node => [
			node.originalItem?.name, node.modifiedItem?.name, declarationKeyword(node.originalItem, original), declarationKeyword(node.modifiedItem, modified),
		]), [
			['Imports', 'Imports', 'namespace', 'namespace'],
			['Imports', 'Imports', 'import', 'import'],
			['Exports', 'Exports', 'namespace', 'namespace'],
			['Exports', 'Exports', 'export', 'export'],
		]);
	});

	test('tags test callbacks without tagging unrelated code in the same change', async () => {
		const original = 'const setup = 1;\ntest("works", () => { expect(setup).toBe(1); });';
		const modified = original.replaceAll('1', '2');
		const result = await compute(original, modified);
		assert.deepStrictEqual(result.root.modifiedChanges.map(change => [modifiedText(change.range, modified), change.tags]), [
			['\n', []],
			['test("works", ', []],
			['() => { expect(setup).toBe(2); }', [vscode.StructuralDiffTag.Test]],
			[');', []],
		]);
	});

	test('tags named test functions and test files', async () => {
		const original = 'function testValue() { return 1; }';
		const modified = original.replace('1', '2');
		const result = await compute(original, modified, [{ originalRange: rangeOf(original, '1'), modifiedRange: rangeOf(modified, '2') }]);
		assert.deepStrictEqual(result.root.children[0].modifiedChanges.map(change => change.tags), [[vscode.StructuralDiffTag.Test]]);
		const testUri = vscode.Uri.file(path.join(fixtureDirectory, 'example.spec.ts'));
		const fileResult = await compute('const value = 1;', 'const value = 2;', undefined, testUri);
		assert.deepStrictEqual(fileResult.root.children[0].modifiedChanges.map(change => [change.classification, change.tags]), [
			[vscode.StructuralDiffClassification.Header, [vscode.StructuralDiffTag.Test]],
			[vscode.StructuralDiffClassification.Implementation, [vscode.StructuralDiffTag.Test]],
			[vscode.StructuralDiffClassification.Other, [vscode.StructuralDiffTag.Test]],
		]);
	});

	test('supports TypeScript React snapshots and JSX expression bodies', async () => {
		const original = 'export const Component = () => <div>old text</div>;';
		const modified = original.replace('old text', 'new text');
		const tsxUri = vscode.Uri.file(path.join(fixtureDirectory, 'component.tsx'));
		const result = await compute(original, modified, [{
			originalRange: rangeOf(original, 'old text'), modifiedRange: rangeOf(modified, 'new text'),
		}], tsxUri, 'typescriptreact');
		assert.deepStrictEqual(summarize(result, original, modified), [{
			path: ['Component'], original: 'Component', modified: 'Component', kind: vscode.SymbolKind.Function,
			originalChanges: [[0, vscode.StructuralDiffClassification.Implementation, 'old text', []]],
			modifiedChanges: [[0, vscode.StructuralDiffClassification.Implementation, 'new text', []]],
		}]);
	});

	test('handles interface signatures, type aliases, enums, class fields and static blocks', async () => {
		const original = [
			'interface Callable { (value: number): number; new (): Callable; [key: string]: number; }',
			'type Alias = number;',
			'enum Choice { Value = 1 }',
			'class Fields { field = ((value: number) => value + 1) satisfies Function; static { const initial = 1; } }',
		].join('\n');
		const modified = original.replaceAll('number', 'string').replaceAll('1', '2');
		const result = await compute(original, modified);
		assert.deepStrictEqual(summarize(result, original, modified).map(node => [node.path, node.kind]), [
			[['Callable'], vscode.SymbolKind.Interface],
			[['Callable', '(call)'], vscode.SymbolKind.Method],
			[['Callable', '(new)'], vscode.SymbolKind.Constructor],
			[['Callable', '[index]'], vscode.SymbolKind.Method],
			[['Alias'], vscode.SymbolKind.Variable],
			[['Choice'], vscode.SymbolKind.Enum],
			[['Choice', 'Value'], vscode.SymbolKind.EnumMember],
			[['Fields'], vscode.SymbolKind.Class],
			[['Fields', 'field'], vscode.SymbolKind.Function],
			[['Fields', 'static'], vscode.SymbolKind.Method],
			[['Fields', 'static', 'initial'], vscode.SymbolKind.Variable],
		]);
	});

	test('keeps unchanged entities out of the result', async () => {
		const text = 'class Unchanged { method() { return 1; } }';
		const result = await compute(text, text, []);
		assert.deepStrictEqual({ children: result.root.children, original: result.root.originalChanges, modified: result.root.modifiedChanges }, { children: [], original: [], modified: [] });
	});

	test('handles UTF-16 offsets, CRLF and changes spanning multiple entities', async () => {
		const original = 'const emoji = "😀";\r\nfunction first() { return 1; }\r\nfunction second() { return 2; }\r\n';
		const modified = original.replace('😀', '🙂').replace('return 1', 'return 3').replace('return 2', 'return 4');
		const result = await compute(original, modified, [
			{ originalRange: rangeOf(original, '😀'), modifiedRange: rangeOf(modified, '🙂') },
			{ originalRange: rangeOf(original, 'return 1; }\r\nfunction second() { return 2'), modifiedRange: rangeOf(modified, 'return 3; }\r\nfunction second() { return 4') },
		]);
		assert.deepStrictEqual(result.root.children.map(node => node.modifiedItem?.name), ['emoji', 'first', 'second']);
	});

	test('classifies file-level comments as other syntax', async () => {
		const original = '// old comment\n';
		const modified = '// new comment\n';
		const result = await compute(original, modified);
		assert.deepStrictEqual(result.root.modifiedChanges.map(change => [change.classification, modifiedText(change.range, modified)]), [[vscode.StructuralDiffClassification.Other, modified]]);
	});
}

function fullRange(document: vscode.TextDocument): vscode.Range {
	return new vscode.Range(new vscode.Position(0, 0), document.positionAt(document.getText().length));
}

function flatten(node: NodeWithChildren): NodeWithChildren[] {
	return [node, ...node.children.flatMap(flatten)];
}

function withChildren(node: vscode.StructuralDiffNode): NodeWithChildren {
	return { ...node, children: (node.children ?? []).map(withChildren) };
}

export function rangeOf(text: string, part: string, from = 0): vscode.Range {
	const offset = text.indexOf(part, from);
	assert.ok(offset >= 0, `Cannot find ${JSON.stringify(part)}`);
	const document = createTextDocumentData(vscode.Uri.parse('test:/file.ts'), text, 'typescript').document;
	return new vscode.Range(document.positionAt(offset), document.positionAt(offset + part.length));
}

function modifiedText(range: vscode.Range, text: string): string {
	return createTextDocumentData(vscode.Uri.parse('test:/file.ts'), text, 'typescript').document.getText(range);
}

/**
 * The first word of the text of an entity, such as `get` or `namespace`, which tells what declares the entity.
 */
function declarationKeyword(entity: vscode.StructuralDiffItem | undefined, text: string): string | undefined {
	return entity && modifiedText(entity.range, text).split(' ')[0];
}

export function summarize(diff: StructuralDiffWithChildren, original: string, modified: string) {
	const result: {
		path: string[];
		original: string | undefined;
		modified: string | undefined;
		kind: vscode.SymbolKind | undefined;
		originalChanges: [number, vscode.StructuralDiffClassification, string, readonly vscode.StructuralDiffTag[] | undefined][];
		modifiedChanges: [number, vscode.StructuralDiffClassification, string, readonly vscode.StructuralDiffTag[] | undefined][];
	}[] = [];
	const visit = (node: NodeWithChildren, parent: string[]) => {
		const path = [...parent, (node.modifiedItem ?? node.originalItem)!.name];
		result.push({
			path,
			original: node.originalItem?.name,
			modified: node.modifiedItem?.name,
			kind: (node.modifiedItem ?? node.originalItem)?.kind,
			originalChanges: node.originalChanges.map(change => [change.textChangeIndex, change.classification, modifiedText(change.range, original), change.tags]),
			modifiedChanges: node.modifiedChanges.map(change => [change.textChangeIndex, change.classification, modifiedText(change.range, modified), change.tags]),
		});
		node.children.forEach(child => visit(child, path));
	};
	diff.root.children.forEach(node => visit(node, []));
	return result;
}

function assertContract(diff: vscode.StructuralDiff, original: vscode.TextDocument, modified: vscode.TextDocument, context: vscode.StructuralDiffContext): void {
	const ids = new Set<string>();
	const errors: string[] = [];
	const coverage: Record<'original' | 'modified', vscode.StructuralDiffCoverage[]> = { original: [], modified: [] };
	const getItem = (node: vscode.StructuralDiffNode, side: 'original' | 'modified') => side === 'original' ? node.originalItem : node.modifiedItem;
	const visit = (node: vscode.StructuralDiffNode, parent?: vscode.StructuralDiffNode) => {
		if (ids.has(node.id) || (!node.originalItem && !node.modifiedItem)) {
			errors.push(`Invalid entity ${node.id}`);
		}
		ids.add(node.id);
		for (const side of ['original', 'modified'] as const) {
			const entity = getItem(node, side);
			const changes = side === 'original' ? node.originalChanges : node.modifiedChanges;
			if (entity === undefined && changes.length > 0) {
				errors.push(`Missing ${side} entity ${node.id}`);
			}
			if (entity !== undefined && parent !== undefined && !getItem(parent, side)?.range.contains(entity.range)) {
				errors.push(`Invalid ${side} parent ${node.id}`);
			}
			if (entity?.selectionRange !== undefined && !entity.range.contains(entity.selectionRange)) {
				errors.push(`Invalid ${side} selection ${node.id}`);
			}
			for (const change of changes) {
				const range = context.changes[change.textChangeIndex]?.[side === 'original' ? 'originalRange' : 'modifiedRange'];
				if (range === undefined || !range.contains(change.range) || change.range.isEmpty || !entity?.range.contains(change.range)) {
					errors.push(`Invalid ${side} coverage ${node.id}`);
				}
			}
			coverage[side].push(...changes);
		}
		node.children?.forEach(child => visit(child, node));
	};
	visit(diff.root);
	for (const [index, change] of context.changes.entries()) {
		for (const side of ['original', 'modified'] as const) {
			const document = side === 'original' ? original : modified;
			const range = side === 'original' ? change.originalRange : change.modifiedRange;
			let cursor = document.offsetAt(range.start);
			const pieces = coverage[side].filter(value => value.textChangeIndex === index)
				.sort((left, right) => left.range.start.compareTo(right.range.start));
			for (const piece of pieces) {
				if (document.offsetAt(piece.range.start) !== cursor) {
					errors.push(`Gap or overlap in ${side} change ${index}`);
				}
				cursor = document.offsetAt(piece.range.end);
			}
			if (cursor !== document.offsetAt(range.end)) {
				errors.push(`Incomplete ${side} change ${index}`);
			}
		}
	}
	assert.deepStrictEqual({
		errors, isIncomplete: diff.isIncomplete,
		rootOriginal: diff.root.originalItem?.range, rootModified: diff.root.modifiedItem?.range,
		kinds: [diff.root.originalItem?.kind, diff.root.modifiedItem?.kind],
	}, {
		errors: [], isIncomplete: false, rootOriginal: fullRange(original), rootModified: fullRange(modified),
		kinds: [vscode.SymbolKind.File, vscode.SymbolKind.File],
	});
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'node:assert';

import ts from 'typescript';
import { beforeAll, suite, test } from 'vitest';

import type * as changeClassifier from '../../common/changeClassifier';
import { TypeScriptChangeClassification, type LineRange, type TypeScriptChangeTag } from '../../common/protocol';

let TypeScriptChangeClassifier: typeof changeClassifier.TypeScriptChangeClassifier;

beforeAll(async () => {
	const TS = await import('../../common/typescript');
	TS.default.install(ts);
	TypeScriptChangeClassifier = (await import('../../common/changeClassifier')).TypeScriptChangeClassifier;
});

suite('TypeScript 6 change classifier', () => {
	test('classifies callable body and signature buckets independently', () => {
		const source = [
			'class Calculator {',
			'\tcalculate(value: number, factor: number): number {',
			'\t\treturn value * factor;',
			'\t}',
			'}',
		].join('\n');

		assert.deepStrictEqual({
			signatureOnly: classify(source, {
				added: [],
				changed: [{ start: 1, end: 2 }],
				deleted: [],
			}),
			bodyOnly: classify(source, {
				added: [],
				changed: [{ start: 2, end: 3 }],
				deleted: [],
			}),
			signatureAndBody: classify(source, {
				added: [],
				changed: [{ start: 1, end: 3 }],
				deleted: [],
			}),
			grouped: classify(source, {
				added: [{ start: 2, end: 3 }],
				changed: [{ start: 1, end: 2 }],
				deleted: [],
			}),
		}, {
			signatureOnly: [{
				kind: 'method',
				path: ['Calculator', 'calculate'],
				pathKinds: ['class', 'method'],
				range: { start: 1, end: 4 },
				changes: [{
					classifications: [coverage(TypeScriptChangeClassification.Signature, { start: 1, end: 2 })],
					changeType: 'changed',
					range: { start: 1, end: 2 },
				}],
			}],
			bodyOnly: [{
				kind: 'method',
				path: ['Calculator', 'calculate'],
				pathKinds: ['class', 'method'],
				range: { start: 1, end: 4 },
				changes: [{
					classifications: [coverage(TypeScriptChangeClassification.Statement, { start: 2, end: 3 })],
					changeType: 'changed',
					range: { start: 2, end: 3 },
				}],
			}],
			signatureAndBody: [{
				kind: 'method',
				path: ['Calculator', 'calculate'],
				pathKinds: ['class', 'method'],
				range: { start: 1, end: 4 },
				changes: [{
					classifications: [
						coverage(TypeScriptChangeClassification.Signature, { start: 1, end: 2 }),
						coverage(TypeScriptChangeClassification.Statement, { start: 2, end: 3 }),
					],
					changeType: 'changed',
					range: { start: 1, end: 3 },
				}],
			}],
			grouped: [{
				kind: 'method',
				path: ['Calculator', 'calculate'],
				pathKinds: ['class', 'method'],
				range: { start: 1, end: 4 },
				changes: [
					{
						classifications: [coverage(TypeScriptChangeClassification.Signature, { start: 1, end: 2 })],
						changeType: 'changed',
						range: { start: 1, end: 2 },
					},
					{
						classifications: [coverage(TypeScriptChangeClassification.Statement, { start: 2, end: 3 })],
						changeType: 'added',
						range: { start: 2, end: 3 },
					},
				],
			}],
		});
	});

	test('classifies complete added declarations once', () => {
		const source = [
			'class Calculator {',
			'\tvalue = 1;',
			'\texisting(): void { }',
			'\tadded(value: number): number {',
			'\t\treturn value;',
			'\t}',
			'}',
		].join('\n');

		assert.deepStrictEqual(classify(source, {
			added: [{ start: 1, end: 2 }, { start: 3, end: 6 }],
			changed: [],
			deleted: [],
		}), [
			{
				kind: 'property',
				path: ['Calculator', 'value'],
				pathKinds: ['class', 'property'],
				range: { start: 1, end: 2 },
				changes: [{
					classifications: [coverage(TypeScriptChangeClassification.Declaration, { start: 1, end: 2 })],
					changeType: 'added',
					range: { start: 1, end: 2 },
				}],
			},
			{
				kind: 'method',
				path: ['Calculator', 'added'],
				pathKinds: ['class', 'method'],
				range: { start: 3, end: 6 },
				changes: [{
					classifications: [coverage(TypeScriptChangeClassification.Declaration, { start: 3, end: 6 })],
					changeType: 'added',
					range: { start: 3, end: 6 },
				}],
			},
		]);
	});

	test('reports whole added containers instead of their children', () => {
		const classSource = [
			'class Added {',
			'\tvalue = 1;',
			'\tmethod(): number {',
			'\t\treturn this.value;',
			'\t}',
			'}',
		].join('\n');
		const namespaceSource = [
			'namespace Added {',
			'\texport function method(): number {',
			'\t\treturn 1;',
			'\t}',
			'}',
		].join('\n');

		assert.deepStrictEqual({
			addedClass: classify(classSource, {
				added: [{ start: 0, end: 6 }],
				changed: [],
				deleted: [],
			}),
			addedNamespace: classify(namespaceSource, {
				added: [{ start: 0, end: 5 }],
				changed: [],
				deleted: [],
			}),
		}, {
			addedClass: [{
				kind: 'class',
				path: ['Added'],
				pathKinds: ['class'],
				range: { start: 0, end: 6 },
				changes: [{
					classifications: [coverage(TypeScriptChangeClassification.Declaration, { start: 0, end: 6 })],
					changeType: 'added',
					range: { start: 0, end: 6 },
				}],
			}],
			addedNamespace: [{
				kind: 'module',
				path: ['Added'],
				pathKinds: ['module'],
				range: { start: 0, end: 5 },
				changes: [{
					classifications: [coverage(TypeScriptChangeClassification.Declaration, { start: 0, end: 5 })],
					changeType: 'added',
					range: { start: 0, end: 5 },
				}],
			}],
		});
	});

	test('classifies deleted ranges against the original source', () => {
		const source = [
			'class Calculator {',
			'',
			'\tcalculate(): number {',
			'\t\treturn 1;',
			'\t}',
			'}',
		].join('\n');

		assert.deepStrictEqual({
			declaration: classify(source, {
				added: [],
				changed: [],
				deleted: [{ start: 2, end: 5 }],
			}),
			statement: classify(source, {
				added: [],
				changed: [],
				deleted: [{ start: 3, end: 4 }],
			}),
		}, {
			declaration: [{
				kind: 'method',
				path: ['Calculator', 'calculate'],
				pathKinds: ['class', 'method'],
				range: { start: 2, end: 5 },
				changes: [{
					classifications: [coverage(TypeScriptChangeClassification.Declaration, { start: 2, end: 5 })],
					changeType: 'deleted',
					range: { start: 2, end: 5 },
				}],
			}],
			statement: [{
				kind: 'method',
				path: ['Calculator', 'calculate'],
				pathKinds: ['class', 'method'],
				range: { start: 2, end: 5 },
				changes: [{
					classifications: [coverage(TypeScriptChangeClassification.Statement, { start: 3, end: 4 })],
					changeType: 'deleted',
					range: { start: 3, end: 4 },
				}],
			}],
		});
	});

	test('uses distinct paths for getter and setter buckets', () => {
		const source = [
			'class State {',
			'\tget state(): number {',
			'\t\treturn this.value;',
			'\t}',
			'\tset state(value: number) {',
			'\t\tthis.value = value;',
			'\t}',
			'}',
		].join('\n');

		assert.deepStrictEqual(classify(source, {
			added: [],
			changed: [{ start: 2, end: 3 }, { start: 5, end: 6 }],
			deleted: [],
		}), [
			{
				kind: 'getter',
				path: ['State', 'get state'],
				pathKinds: ['class', 'getter'],
				range: { start: 1, end: 4 },
				changes: [{
					classifications: [coverage(TypeScriptChangeClassification.Statement, { start: 2, end: 3 })],
					changeType: 'changed',
					range: { start: 2, end: 3 },
				}],
			},
			{
				kind: 'setter',
				path: ['State', 'set state'],
				pathKinds: ['class', 'setter'],
				range: { start: 4, end: 7 },
				changes: [{
					classifications: [coverage(TypeScriptChangeClassification.Statement, { start: 5, end: 6 })],
					changeType: 'changed',
					range: { start: 5, end: 6 },
				}],
			},
		]);
	});

	test('classifies imports, class signatures, statements, fallback syntax, and test changes', () => {
		const source = [
			'import { value } from \'./value\';',
			'class Box<T> {',
			'\ttestRun(input: T): T {',
			'\t\treturn input;',
			'\t}',
			'}',
			'// changed comment',
		].join('\n');
		const callbackSource = [
			'test(\'runs\', () => {',
			'\texecute();',
			'});',
		].join('\n');

		assert.deepStrictEqual({
			testFileImport: classify(source, { added: [], changed: [{ start: 0, end: 1 }], deleted: [] }, 'box.test.ts'),
			classTypeParameter: classify(source, { added: [], changed: [{ start: 1, end: 2 }], deleted: [] }),
			testMethodStatement: classify(source, { added: [], changed: [{ start: 3, end: 4 }], deleted: [] }),
			other: classify(source, { added: [], changed: [{ start: 6, end: 7 }], deleted: [] }),
			testCallbackStatement: classify(callbackSource, { added: [], changed: [{ start: 1, end: 2 }], deleted: [] }),
		}, {
			testFileImport: [{
				kind: 'sourceFile',
				path: [],
				pathKinds: [],
				range: { start: 0, end: 7 },
				changes: [{
					classifications: [coverage(TypeScriptChangeClassification.Import, { start: 0, end: 1 }, ['test'])],
					changeType: 'changed',
					range: { start: 0, end: 1 },
				}],
			}],
			classTypeParameter: [{
				kind: 'class',
				path: ['Box'],
				pathKinds: ['class'],
				range: { start: 1, end: 6 },
				changes: [{
					classifications: [coverage(TypeScriptChangeClassification.Signature, { start: 1, end: 2 })],
					changeType: 'changed',
					range: { start: 1, end: 2 },
				}],
			}],
			testMethodStatement: [{
				kind: 'method',
				path: ['Box', 'testRun'],
				pathKinds: ['class', 'method'],
				range: { start: 2, end: 5 },
				changes: [{
					classifications: [coverage(TypeScriptChangeClassification.Statement, { start: 3, end: 4 }, ['test'])],
					changeType: 'changed',
					range: { start: 3, end: 4 },
				}],
			}],
			other: [{
				kind: 'sourceFile',
				path: [],
				pathKinds: [],
				range: { start: 0, end: 7 },
				changes: [{
					classifications: [coverage(TypeScriptChangeClassification.Other, { start: 6, end: 7 })],
					changeType: 'changed',
					range: { start: 6, end: 7 },
				}],
			}],
			testCallbackStatement: [{
				kind: 'sourceFile',
				path: [],
				pathKinds: [],
				range: { start: 0, end: 3 },
				changes: [{
					classifications: [coverage(TypeScriptChangeClassification.Statement, { start: 1, end: 2 }, ['test'])],
					changeType: 'changed',
					range: { start: 1, end: 2 },
				}],
			}],
		});
	});
});

interface TestChanges {
	readonly added: readonly LineRange[];
	readonly changed: readonly LineRange[];
	readonly deleted: readonly LineRange[];
}

function classify(source: string, changes: TestChanges, fileName: string = 'changes.ts'): object[] {
	const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
	const classifier = new TypeScriptChangeClassifier();
	if (changes.deleted.length > 0) {
		assert.deepStrictEqual({ added: changes.added, changed: changes.changed }, { added: [], changed: [] });
		return classifier.classifyOriginal(sourceFile, changes.deleted);
	}
	return classifier.classifyModified(sourceFile, changes);
}

function coverage(classification: TypeScriptChangeClassification, ranges: LineRange | readonly LineRange[], tags: readonly TypeScriptChangeTag[] = []): object {
	return {
		classification,
		ranges: Array.isArray(ranges) ? ranges : [ranges],
		tags,
	};
}

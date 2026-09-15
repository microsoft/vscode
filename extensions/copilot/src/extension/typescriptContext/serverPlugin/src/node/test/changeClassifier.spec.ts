/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'node:assert';

import ts from 'typescript';
import { beforeAll, suite, test } from 'vitest';

import type * as changeClassifier from '../../common/changeClassifier';
import type { LineRange } from '../../common/protocol';

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
					classifications: ['structural'],
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
					classifications: ['code'],
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
					classifications: ['structural', 'code'],
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
						classifications: ['structural'],
						changeType: 'changed',
						range: { start: 1, end: 2 },
					},
					{
						classifications: ['code'],
						changeType: 'added',
						range: { start: 2, end: 3 },
					},
				],
			}],
		});
	});

	test('classifies added properties and whole methods as structural buckets', () => {
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
					classifications: ['structural'],
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
					classifications: ['structural'],
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
					classifications: ['structural'],
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
					classifications: ['structural'],
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
			structural: classify(source, {
				added: [],
				changed: [],
				deleted: [{ start: 2, end: 5 }],
			}),
			code: classify(source, {
				added: [],
				changed: [],
				deleted: [{ start: 3, end: 4 }],
			}),
		}, {
			structural: [{
				kind: 'method',
				path: ['Calculator', 'calculate'],
				pathKinds: ['class', 'method'],
				range: { start: 2, end: 5 },
				changes: [{
					classifications: ['structural'],
					changeType: 'deleted',
					range: { start: 2, end: 5 },
				}],
			}],
			code: [{
				kind: 'method',
				path: ['Calculator', 'calculate'],
				pathKinds: ['class', 'method'],
				range: { start: 2, end: 5 },
				changes: [{
					classifications: ['code'],
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
					classifications: ['code'],
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
					classifications: ['code'],
					changeType: 'changed',
					range: { start: 5, end: 6 },
				}],
			},
		]);
	});
});

interface TestChanges {
	readonly added: readonly LineRange[];
	readonly changed: readonly LineRange[];
	readonly deleted: readonly LineRange[];
}

function classify(source: string, changes: TestChanges): object[] {
	const sourceFile = ts.createSourceFile('changes.ts', source, ts.ScriptTarget.Latest, true);
	const classifier = new TypeScriptChangeClassifier();
	if (changes.deleted.length > 0) {
		assert.deepStrictEqual({ added: changes.added, changed: changes.changed }, { added: [], changed: [] });
		return classifier.classifyOriginal(sourceFile, changes.deleted);
	}
	return classifier.classifyModified(sourceFile, changes);
}

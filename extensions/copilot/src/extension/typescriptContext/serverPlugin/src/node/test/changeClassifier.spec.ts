/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'node:assert';

import ts from 'typescript';
import { beforeAll, suite, test } from 'vitest';

import type * as changeClassifier from '../../common/changeClassifier';
import type { TypeScriptChangeClassificationInput } from '../../common/protocol';

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
				range: { start: 1, end: 4 },
				changes: [{
					classifications: ['structural'],
					changeType: 'changed',
					start: 1,
					end: 2,
				}],
			}],
			bodyOnly: [{
				kind: 'method',
				path: ['Calculator', 'calculate'],
				range: { start: 1, end: 4 },
				changes: [{
					classifications: ['algorithmic'],
					changeType: 'changed',
					start: 2,
					end: 3,
				}],
			}],
			signatureAndBody: [{
				kind: 'method',
				path: ['Calculator', 'calculate'],
				range: { start: 1, end: 4 },
				changes: [{
					classifications: ['structural', 'algorithmic'],
					changeType: 'changed',
					start: 1,
					end: 3,
				}],
			}],
			grouped: [{
				kind: 'method',
				path: ['Calculator', 'calculate'],
				range: { start: 1, end: 4 },
				changes: [
					{
						classifications: ['structural'],
						changeType: 'changed',
						start: 1,
						end: 2,
					},
					{
						classifications: ['algorithmic'],
						changeType: 'added',
						start: 2,
						end: 3,
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
				range: { start: 1, end: 2 },
				changes: [{
					classifications: ['structural'],
					changeType: 'added',
					start: 1,
					end: 2,
				}],
			},
			{
				kind: 'method',
				path: ['Calculator', 'added'],
				range: { start: 3, end: 6 },
				changes: [{
					classifications: ['structural'],
					changeType: 'added',
					start: 3,
					end: 6,
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
				range: { start: 0, end: 6 },
				changes: [{
					classifications: ['structural'],
					changeType: 'added',
					start: 0,
					end: 6,
				}],
			}],
			addedNamespace: [{
				kind: 'module',
				path: ['Added'],
				range: { start: 0, end: 5 },
				changes: [{
					classifications: ['structural'],
					changeType: 'added',
					start: 0,
					end: 5,
				}],
			}],
		});
	});

	test('uses the current-snapshot deletion anchor', () => {
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
				deleted: [{ line: 1, deletedLineCount: 3 }],
			}),
			algorithmic: classify(source, {
				added: [],
				changed: [],
				deleted: [{ line: 3, deletedLineCount: 1 }],
			}),
		}, {
			structural: [{
				kind: 'class',
				path: ['Calculator'],
				range: { start: 0, end: 6 },
				changes: [{
					classifications: ['structural'],
					changeType: 'deleted',
					line: 1,
					deletedLineCount: 3,
				}],
			}],
			algorithmic: [{
				kind: 'method',
				path: ['Calculator', 'calculate'],
				range: { start: 2, end: 5 },
				changes: [{
					classifications: ['algorithmic'],
					changeType: 'deleted',
					line: 3,
					deletedLineCount: 1,
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
				range: { start: 1, end: 4 },
				changes: [{
					classifications: ['algorithmic'],
					changeType: 'changed',
					start: 2,
					end: 3,
				}],
			},
			{
				kind: 'setter',
				path: ['State', 'set state'],
				range: { start: 4, end: 7 },
				changes: [{
					classifications: ['algorithmic'],
					changeType: 'changed',
					start: 5,
					end: 6,
				}],
			},
		]);
	});
});

function classify(source: string, changes: TypeScriptChangeClassificationInput): object[] {
	const sourceFile = ts.createSourceFile('changes.ts', source, ts.ScriptTarget.Latest, true);
	return new TypeScriptChangeClassifier().classify(sourceFile, changes).buckets;
}

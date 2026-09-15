/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

import { API } from '@typescript/native/unstable/async';
import { afterAll, beforeAll, suite, test } from 'vitest';

import type { LineRange } from '../../../../../platform/languageContextProvider/common/regionContextProvider';
import { TestLogService } from '../../../../../platform/testing/common/testLogService';
import { TS7CodeReviewProvider } from '../codeReviewService';

suite('TypeScript 7 change classifier', () => {
	let api: API;
	let filePath: string;
	let source: string;

	beforeAll(() => {
		api = new API({ cwd: process.cwd() });
		filePath = path.join(__dirname, '../../../serverPlugin/fixtures/context/p14/source/f1.ts');
		source = fs.readFileSync(filePath, 'utf8');
	});

	afterAll(async () => {
		await api.close();
	});

	test('classifies algorithmic and mixed callable buckets', async () => {
		const bodyLine = lineAt(source, 'this.result += x;');
		const signatureLine = lineAt(source, 'public add(x: number): Calculator');

		assert.deepStrictEqual({
			signatureOnly: await classify({
				added: [],
				changed: [{ start: signatureLine, end: signatureLine + 1 }],
				deleted: [],
			}),
			bodyOnly: await classify({
				added: [],
				changed: [{ start: bodyLine, end: bodyLine + 1 }],
				deleted: [],
			}),
			signatureAndBody: await classify({
				added: [],
				changed: [{ start: signatureLine, end: bodyLine + 1 }],
				deleted: [],
			}),
			grouped: await classify({
				added: [{ start: bodyLine, end: bodyLine + 1 }],
				changed: [{ start: signatureLine, end: signatureLine + 1 }],
				deleted: [],
			}),
		}, {
			signatureOnly: [{
				kind: 'method',
				path: ['Calculator', 'add'],
				range: { start: 12, end: 16 },
				changes: [{
					classifications: ['structural'],
					changeType: 'changed',
					range: { start: signatureLine, end: signatureLine + 1 },
				}],
			}],
			bodyOnly: [{
				kind: 'method',
				path: ['Calculator', 'add'],
				range: { start: 12, end: 16 },
				changes: [{
					classifications: ['algorithmic'],
					changeType: 'changed',
					range: { start: bodyLine, end: bodyLine + 1 },
				}],
			}],
			signatureAndBody: [{
				kind: 'method',
				path: ['Calculator', 'add'],
				range: { start: 12, end: 16 },
				changes: [{
					classifications: ['structural', 'algorithmic'],
					changeType: 'changed',
					range: { start: signatureLine, end: bodyLine + 1 },
				}],
			}],
			grouped: [{
				kind: 'method',
				path: ['Calculator', 'add'],
				range: { start: 12, end: 16 },
				changes: [
					{
						classifications: ['structural'],
						changeType: 'changed',
						range: { start: signatureLine, end: signatureLine + 1 },
					},
					{
						classifications: ['algorithmic'],
						changeType: 'added',
						range: { start: bodyLine, end: bodyLine + 1 },
					},
				],
			}],
		});
	});

	test('reports a whole added class instead of its children', async () => {
		const addedClass = [
			'class Added {',
			'\tvalue = 1;',
			'\tmethod(): number {',
			'\t\treturn this.value;',
			'\t}',
			'}',
		].join('\n');
		const content = `${source}\n${addedClass}`;
		const start = lineAt(content, 'class Added');

		assert.deepStrictEqual(await classify({
			added: [{ start, end: start + 6 }],
			changed: [],
			deleted: [],
		}, content), [{
			kind: 'class',
			path: ['Added'],
			range: { start, end: start + 6 },
			changes: [{
				classifications: ['structural'],
				changeType: 'added',
				range: { start, end: start + 6 },
			}],
		}]);
	});

	test('classifies deleted ranges against the original snapshot', async () => {
		const propertyLine = lineAt(source, 'private result: number;');
		const bodyLine = lineAt(source, 'this.result += x;');
		const methodStart = lineAt(source, 'public add(x: number): Calculator');

		assert.deepStrictEqual({
			structural: await classify({
				added: [],
				changed: [],
				deleted: [{ start: propertyLine, end: propertyLine + 1 }],
			}),
			algorithmic: await classify({
				added: [],
				changed: [],
				deleted: [{ start: bodyLine, end: bodyLine + 1 }],
			}),
			wholeMethod: await classify({
				added: [],
				changed: [],
				deleted: [{ start: methodStart, end: methodStart + 4 }],
			}),
		}, {
			structural: [{
				kind: 'property',
				path: ['Calculator', 'result'],
				range: { start: propertyLine, end: propertyLine + 1 },
				changes: [{
					classifications: ['structural'],
					changeType: 'deleted',
					range: { start: propertyLine, end: propertyLine + 1 },
				}],
			}],
			algorithmic: [{
				kind: 'method',
				path: ['Calculator', 'add'],
				range: { start: 12, end: 16 },
				changes: [{
					classifications: ['algorithmic'],
					changeType: 'deleted',
					range: { start: bodyLine, end: bodyLine + 1 },
				}],
			}],
			wholeMethod: [{
				kind: 'method',
				path: ['Calculator', 'add'],
				range: { start: 12, end: 16 },
				changes: [{
					classifications: ['structural'],
					changeType: 'deleted',
					range: { start: methodStart, end: methodStart + 4 },
				}],
			}],
		});
	});

	test('uses distinct paths for getter and setter buckets', async () => {
		const content = [
			'class State {',
			'\tget state(): number {',
			'\t\treturn this.value;',
			'\t}',
			'\tset state(value: number) {',
			'\t\tthis.value = value;',
			'\t}',
			'}',
		].join('\n');

		assert.deepStrictEqual(await classify({
			added: [],
			changed: [{ start: 2, end: 3 }, { start: 5, end: 6 }],
			deleted: [],
		}, content), [
			{
				kind: 'getter',
				path: ['State', 'get state'],
				range: { start: 1, end: 4 },
				changes: [{
					classifications: ['algorithmic'],
					changeType: 'changed',
					range: { start: 2, end: 3 },
				}],
			},
			{
				kind: 'setter',
				path: ['State', 'set state'],
				range: { start: 4, end: 7 },
				changes: [{
					classifications: ['algorithmic'],
					changeType: 'changed',
					range: { start: 5, end: 6 },
				}],
			},
		]);
	});

	interface TestChanges {
		readonly added: readonly LineRange[];
		readonly changed: readonly LineRange[];
		readonly deleted: readonly LineRange[];
	}

	async function classify(changes: TestChanges, content?: string): Promise<readonly object[]> {
		const provider = new TS7CodeReviewProvider(new TestLogService(), new TestTypeScript7Api(api));
		try {
			const result = await provider.classifyChanges({
				filePath,
				modified: {
					content,
					added: changes.added,
					changed: changes.changed,
				},
				original: {
					content: source,
					deleted: changes.deleted,
				},
			});
			assert.ok(result !== undefined);
			return [...result.modified, ...result.original];
		} finally {
			provider.dispose();
		}
	}
});

class TestTypeScript7Api {
	constructor(private readonly api: API) { }

	async getApi(): Promise<API> {
		return this.api;
	}

	dispose(): void { }
}

function lineAt(source: string, text: string): number {
	const offset = source.indexOf(text);
	assert.notStrictEqual(offset, -1, `Expected to find ${JSON.stringify(text)} in source`);
	return source.substring(0, offset).split(/\r?\n/).length - 1;
}

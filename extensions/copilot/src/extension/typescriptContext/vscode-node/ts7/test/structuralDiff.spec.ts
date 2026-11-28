/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { API } from '@typescript/native/async';
import { afterAll, afterEach, beforeAll, beforeEach, suite, test } from 'vitest';
import * as vscode from 'vscode';
import { toGitUri } from '../../../../../platform/git/common/utils';
import { TestLogService } from '../../../../../platform/testing/common/testLogService';
import { createTextDocumentData, setDocText } from '../../../../../util/common/test/shims/textDocument';
import { CancellationToken } from '../../../../../util/vs/base/common/cancellation';
import { isCancellationError } from '../../../../../util/vs/base/common/errors';
import { DisposableStore } from '../../../../../util/vs/base/common/lifecycle';
import { createCompute, defineStructuralDiffCases, fixtureDirectory, rangeOf, summarize } from '../../test/structuralDiffCases';
import { TS7StructuralDiffProvider } from '../structuralDiffProvider';

suite('TypeScript 7 structural diff', () => {
	const store = new DisposableStore();
	const fileName = path.join(fixtureDirectory, 'example.ts');
	const uri = vscode.Uri.file(fileName);
	let api: API;
	let native: TestTypeScript7Api;
	let provider: TS7StructuralDiffProvider;
	const compute = createCompute(() => provider, uri);

	beforeAll(() => {
		api = new API({ cwd: process.cwd() });
	});

	beforeEach(() => {
		native = new TestTypeScript7Api(api);
		provider = store.add(new TS7StructuralDiffProvider(new TestLogService(), native));
	});

	afterEach(() => store.clear());
	afterAll(async () => {
		store.dispose();
		await api.close();
	});

	for (const [file, languageId] of [['example.ts', 'typescript'], ['component.tsx', 'typescriptreact']]) {
		test(`analyzes staged ${languageId} contents using the backing file only to choose how to parse them`, async () => {
			const fileUri = vscode.Uri.file(path.join(fixtureDirectory, file));
			const diskContents = fs.readFileSync(fileUri.fsPath, 'utf8');
			const original = 'function stagedOnly() { return 1; }';
			const modified = 'function stagedOnly() { return 2; }';
			const result = await compute(original, modified, [{
				originalRange: rangeOf(original, '1'), modifiedRange: rangeOf(modified, '2'),
			}], toGitUri(fileUri, ''), languageId, toGitUri(fileUri, 'HEAD'));
			assert.deepStrictEqual({
				nodes: summarize(result, original, modified).map(node => ({
					name: node.modified, originalChanges: node.originalChanges, modifiedChanges: node.modifiedChanges,
				})),
				requests: native.requests,
				released: native.released,
				diskContents: fs.readFileSync(fileUri.fsPath, 'utf8'),
			}, {
				nodes: [{
					name: 'stagedOnly',
					originalChanges: [[0, vscode.StructuralDiffClassification.Implementation, '1', []]],
					modifiedChanges: [[0, vscode.StructuralDiffClassification.Implementation, '2', []]],
				}],
				requests: [fileUri.fsPath, fileUri.fsPath],
				released: [true, true], diskContents,
			});
		});
	}

	test('resolves the backing path from Git metadata rather than a decorated document path', async () => {
		const original = 'function stagedOnly() { return 1; }';
		const modified = 'function stagedOnly() { return 2; }';
		const result = await compute(original, modified, undefined, toGitUri(uri, '', { replaceFileExtension: true }), 'typescript', toGitUri(uri, 'HEAD'));
		assert.deepStrictEqual({
			names: result.root.children.map(node => node.modifiedItem?.name),
			requests: native.requests,
		}, {
			names: ['stagedOnly'],
			requests: [uri.fsPath, uri.fsPath],
		});
	});

	test('keeps simultaneous staged and unstaged requests for the same backing file isolated', async () => {
		const head = 'function before() { return 1; }';
		const index = 'function renamed() { return 1; }';
		const working = 'function renamed() { return 2; }';
		const [staged, unstaged] = await Promise.all([
			compute(head, index, [{ originalRange: rangeOf(head, 'before'), modifiedRange: rangeOf(index, 'renamed') }], toGitUri(uri, ''), 'typescript', toGitUri(uri, 'HEAD')),
			compute(index, working, [{ originalRange: rangeOf(index, '1'), modifiedRange: rangeOf(working, '2') }], uri, 'typescript', toGitUri(uri, '')),
		]);
		assert.deepStrictEqual({
			staged: summarize(staged, head, index).map(node => ({
				original: node.original, modified: node.modified, modifiedChanges: node.modifiedChanges,
			})),
			unstaged: summarize(unstaged, index, working).map(node => ({
				original: node.original, modified: node.modified, modifiedChanges: node.modifiedChanges,
			})),
			released: native.released,
		}, {
			staged: [{ original: 'before', modified: 'renamed', modifiedChanges: [[0, vscode.StructuralDiffClassification.Header, 'renamed', []]] }],
			unstaged: [{ original: 'renamed', modified: 'renamed', modifiedChanges: [[0, vscode.StructuralDiffClassification.Implementation, '2', []]] }],
			released: [true, true, true, true],
		});
	});

	for (const [name, query, error] of [
		['malformed JSON', '{', SyntaxError],
		['null metadata', 'null', /absolute file path and a string ref/],
		['missing path', JSON.stringify({ ref: '' }), /absolute file path and a string ref/],
		['relative path', JSON.stringify({ path: 'example.ts', ref: '' }), /absolute file path and a string ref/],
		['missing ref', JSON.stringify({ path: fileName }), /absolute file path and a string ref/],
	] as const) {
		test(`rejects a Git snapshot with ${name} before starting native analysis`, async () => {
			const original = createTextDocumentData(toGitUri(uri, 'HEAD'), '', 'typescript').document;
			const modified = createTextDocumentData(uri.with({ scheme: 'git', query }), '', 'typescript').document;
			await assert.rejects(provider.provideStructuralDiff(original, modified, { changes: [] }, CancellationToken.None), error);
			assert.deepStrictEqual(native.requests, []);
		});
	}

	defineStructuralDiffCases(compute);

	test('releases the parsed contents and leaves the project of the backing file unchanged', async () => {
		await compute('function oldName() {}', 'function newName() {}');
		const snapshot = await api.createSnapshot({ openFiles: [fileName] });
		try {
			const project = await snapshot.getDefaultProjectForFile(fileName);
			const source = await project?.program.getSourceFile(fileName);
			assert.deepStrictEqual({
				released: native.released,
				contents: source?.text,
			}, {
				released: [true, true],
				contents: fs.readFileSync(fileName, 'utf8'),
			});
		} finally {
			await snapshot.dispose();
			await (await api.createSnapshot({ closeFiles: [fileName] })).dispose();
		}
	});

	test('keeps concurrent requests for different versions of the same file isolated', async () => {
		const results = await Promise.all([
			compute('function first() { return 1; }', 'function first() { return 2; }'),
			compute('function second() { return "before"; }', 'function second() { return "after"; }'),
		]);
		assert.deepStrictEqual({
			names: results.map(result => result.root.children[0].modifiedItem?.name),
			released: native.released,
		}, { names: ['first', 'second'], released: [true, true, true, true] });
	});

	test('declines when TS7 is unavailable', async () => {
		native.available = false;
		const document = createTextDocumentData(uri, 'const value = 1;', 'typescript').document;
		assert.deepStrictEqual({
			result: await provider.provideStructuralDiff(document, document, { changes: [] }, CancellationToken.None),
			requests: native.requests,
		}, { result: undefined, requests: [] });
	});

	test('does not start analysis for an already cancelled request', async () => {
		const document = createTextDocumentData(uri, '', 'typescript').document;
		await assert.rejects(provider.provideStructuralDiff(document, document, { changes: [] }, CancellationToken.Cancelled), isCancellationError);
		assert.deepStrictEqual(native.requests, []);
	});

	test('cancels during analysis and releases the parsed contents', async () => {
		const source = store.add(new vscode.CancellationTokenSource());
		const document = createTextDocumentData(uri, 'const value = 1;', 'typescript').document;
		native.beforeCreate = index => {
			if (index === 1) {
				source.cancel();
			}
		};
		await assert.rejects(provider.provideStructuralDiff(document, document, { changes: [] }, source.token), isCancellationError);
		assert.deepStrictEqual(native.released, [true, true]);
	});

	test('does not publish a result when cancelled while releasing the parsed contents', async () => {
		const source = store.add(new vscode.CancellationTokenSource());
		const document = createTextDocumentData(uri, 'const value = 1;', 'typescript').document;
		native.beforeRelease = () => source.cancel();
		await assert.rejects(provider.provideStructuralDiff(document, document, { changes: [] }, source.token), isCancellationError);
		assert.deepStrictEqual(native.released, [true, true]);
	});

	test('releases the parsed original contents when parsing the modified contents fails', async () => {
		native.beforeCreate = index => {
			if (index === 1) {
				throw new Error('Native analysis failed');
			}
		};
		await assert.rejects(compute('const x = 1;', 'const x = 2;'), /Native analysis failed/);
		assert.deepStrictEqual(native.released, [true]);
	});

	for (const side of ['original', 'modified'] as const) {
		test(`rejects stale ${side} documents and releases the parsed contents`, async () => {
			const original = createTextDocumentData(uri.with({ scheme: 'git' }), 'const x = 1;', 'typescript');
			const modified = createTextDocumentData(uri, 'const x = 2;', 'typescript');
			native.beforeCreate = () => setDocText(side === 'original' ? original : modified, 'const x = 3;');
			await assert.rejects(provider.provideStructuralDiff(original.document, modified.document, { changes: [] }, CancellationToken.None), isCancellationError);
			assert.deepStrictEqual(native.released, [true]);
		});
	}
});

/**
 * Passes the provider's requests to the TypeScript 7 API and records the files whose contents the provider parses and
 * whether it releases them. Hooks run before a text is parsed and before parsed contents are released.
 */
class TestTypeScript7Api {
	available = true;
	beforeCreate?: (index: number) => void;
	beforeRelease?: () => void;
	readonly requests: string[] = [];
	/** Whether the provider released each parsed text, in the order in which it parsed them. */
	readonly released: boolean[] = [];

	constructor(private readonly api: API) { }

	async getApi() {
		if (!this.available) {
			return undefined;
		}
		return {
			createSourceFile: async (fileName: string, sourceText: string) => {
				this.beforeCreate?.(this.requests.length);
				this.requests.push(fileName);
				const retained = await this.api.createSourceFile(fileName, sourceText);
				const index = this.released.push(false) - 1;
				return {
					sourceFile: retained.sourceFile,
					dispose: async () => {
						this.beforeRelease?.();
						await retained.dispose();
						this.released[index] = true;
					},
				};
			},
		};
	}

	dispose(): void { }
}

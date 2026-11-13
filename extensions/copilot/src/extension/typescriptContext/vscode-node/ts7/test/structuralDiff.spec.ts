/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { API, type DocumentIdentifier, type Snapshot } from '@typescript/native/async';
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
		test(`analyzes staged ${languageId} contents using the backing file only for project lookup`, async () => {
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
				disposed: native.snapshots.every(snapshot => snapshot.isDisposed()),
				diskContents: fs.readFileSync(fileUri.fsPath, 'utf8'),
			}, {
				nodes: [{
					name: 'stagedOnly',
					originalChanges: [[0, vscode.StructuralDiffClassification.Implementation, '1', []]],
					modifiedChanges: [[0, vscode.StructuralDiffClassification.Implementation, '2', []]],
				}],
				requests: [{ openFiles: [{ uri: fileUri.toString() }] }, { closeFiles: [{ uri: fileUri.toString() }] }],
				disposed: true, diskContents,
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
			requests: [{ openFiles: [{ uri: uri.toString() }] }, { closeFiles: [{ uri: uri.toString() }] }],
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
			disposed: native.snapshots.every(snapshot => snapshot.isDisposed()),
		}, {
			staged: [{ original: 'before', modified: 'renamed', modifiedChanges: [[0, vscode.StructuralDiffClassification.Header, 'renamed', []]] }],
			unstaged: [{ original: 'renamed', modified: 'renamed', modifiedChanges: [[0, vscode.StructuralDiffClassification.Implementation, '2', []]] }],
			disposed: true,
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

	test('balances opened files and disposes all native snapshots without modifying the project file', async () => {
		await compute('function oldName() {}', 'function newName() {}');
		const snapshot = await api.createSnapshot({ openFiles: [fileName] });
		try {
			const project = await snapshot.getDefaultProjectForFile(fileName);
			const source = await project?.program.getSourceFile(fileName);
			assert.deepStrictEqual({
				requests: native.requests,
				disposed: native.snapshots.map(value => value.isDisposed()),
				contents: source?.text,
			}, {
				requests: [{ openFiles: [{ uri: uri.toString() }] }, { closeFiles: [{ uri: uri.toString() }] }],
				disposed: [true, true, true, true],
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
			open: native.requests.filter(request => request?.openFiles !== undefined).length,
			close: native.requests.filter(request => request?.closeFiles !== undefined).length,
			disposed: native.snapshots.every(snapshot => snapshot.isDisposed()),
		}, { names: ['first', 'second'], open: 2, close: 2, disposed: true });
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

	test('cancels during analysis and disposes all snapshots', async () => {
		const source = store.add(new vscode.CancellationTokenSource());
		const document = createTextDocumentData(uri, 'const value = 1;', 'typescript').document;
		native.beforeTemporaryUpdate = () => source.cancel();
		await assert.rejects(provider.provideStructuralDiff(document, document, { changes: [] }, source.token), isCancellationError);
		assert.deepStrictEqual(native.snapshots.map(snapshot => snapshot.isDisposed()), [true, true, true]);
	});

	test('does not publish a result when cancelled during asynchronous cleanup', async () => {
		const source = store.add(new vscode.CancellationTokenSource());
		const document = createTextDocumentData(uri, 'const value = 1;', 'typescript').document;
		native.afterCloseSnapshot = () => source.cancel();
		await assert.rejects(provider.provideStructuralDiff(document, document, { changes: [] }, source.token), isCancellationError);
		assert.deepStrictEqual(native.snapshots.map(snapshot => snapshot.isDisposed()), [true, true, true, true]);
	});

	test('disposes snapshots on native analysis errors', async () => {
		native.failure = new Error('Native analysis failed');
		await assert.rejects(compute('const x = 1;', 'const x = 2;'), /Native analysis failed/);
		assert.deepStrictEqual(native.snapshots.map(snapshot => snapshot.isDisposed()), [true, true]);
	});

	test('rejects native snapshots with different contents', async () => {
		native.mapText = text => `${text}\n`;
		await assert.rejects(compute('const x = 1;', 'const x = 2;'), /snapshot does not match/);
		assert.deepStrictEqual(native.snapshots.map(snapshot => snapshot.isDisposed()), [true, true, true]);
	});

	for (const side of ['original', 'modified'] as const) {
		test(`rejects stale ${side} documents and releases the snapshots`, async () => {
			const original = createTextDocumentData(uri.with({ scheme: 'git' }), 'const x = 1;', 'typescript');
			const modified = createTextDocumentData(uri, 'const x = 2;', 'typescript');
			native.beforeTemporaryUpdate = () => setDocText(side === 'original' ? original : modified, 'const x = 3;');
			await assert.rejects(provider.provideStructuralDiff(original.document, modified.document, { changes: [] }, CancellationToken.None), isCancellationError);
			assert.deepStrictEqual(native.snapshots.map(snapshot => snapshot.isDisposed()), [true, true, true]);
		});
	}
});

type FirstOfTwoOverloads<T> = T extends {
    (...args: infer A): infer R;
    (...args: never[]): unknown;
} ? (...args: A) => R : never;

type CreateSnapshotParams = Parameters<
    FirstOfTwoOverloads<API<true>['createSnapshot']>
>[0];

class TestTypeScript7Api {
	available = true;
	failure?: Error;
	mapText?: (text: string) => string;
	beforeTemporaryUpdate?: () => void;
	afterCloseSnapshot?: () => void;
	readonly snapshots: Snapshot[] = [];
	readonly requests: CreateSnapshotParams[] = [];

	constructor(private readonly api: API) { }

	async getApi() {
		if (!this.available) {
			return undefined;
		}
		return {
			clearSourceFileCache: () => this.api.clearSourceFileCache(),
			createSnapshot: async (params?: CreateSnapshotParams) => {
				this.requests.push(params ?? {});
				const snapshot = params === undefined ? await this.api.createSnapshot() : await this.api.createSnapshot(params);
				this.snapshots.push(snapshot);
				if (params?.closeFiles !== undefined) {
					this.afterCloseSnapshot?.();
				}
				return snapshot;
			},
			runWithTemporaryFileUpdate: async (snapshot: Snapshot, file: DocumentIdentifier, text: string, callback: (snapshot: Snapshot) => void | Promise<void>) => {
				if (this.failure !== undefined) {
					throw this.failure;
				}
				await this.api.runWithTemporaryFileUpdate(snapshot, file, this.mapText?.(text) ?? text, async temporarySnapshot => {
					this.snapshots.push(temporarySnapshot);
					this.beforeTemporaryUpdate?.();
					await callback(temporarySnapshot);
				});
			},
		};
	}

	dispose(): void { }
}

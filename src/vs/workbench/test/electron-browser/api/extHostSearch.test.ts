/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import * as path from 'path';
import URI, { UriComponents } from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IRawFileMatch2, IRawSearchQuery, QueryType, ISearchQuery, IPatternInfo, IFileMatch } from 'vs/platform/search/common/search';
import { MainContext, MainThreadSearchShape } from 'vs/workbench/api/node/extHost.protocol';
import { ExtHostSearch } from 'vs/workbench/api/node/extHostSearch';
import { TestRPCProtocol } from 'vs/workbench/test/electron-browser/api/testRPCProtocol';
import * as vscode from 'vscode';
import { dispose } from 'vs/base/common/lifecycle';
import { isPromiseCanceledError } from 'vs/base/common/errors';
import { Range } from 'vs/workbench/api/node/extHostTypes';

let rpcProtocol: TestRPCProtocol;
let extHostSearch: ExtHostSearch;
let disposables: vscode.Disposable[] = [];

let mockMainThreadSearch: MockMainThreadSearch;
class MockMainThreadSearch implements MainThreadSearchShape {
	lastHandle: number;

	results: (UriComponents | IRawFileMatch2)[] = [];

	$registerSearchProvider(handle: number, scheme: string): void {
		this.lastHandle = handle;
	}

	$unregisterProvider(handle: number): void {
	}

	$handleFindMatch(handle: number, session: number, data: UriComponents | IRawFileMatch2[]): void {
		if (Array.isArray(data)) {
			this.results.push(...data);
		} else {
			this.results.push(data);
		}
	}

	dispose() {
	}
}

suite('ExtHostSearch', () => {
	async function registerTestSearchProvider(provider: vscode.SearchProvider): TPromise<void> {
		disposables.push(extHostSearch.registerSearchProvider('file', provider));
		await rpcProtocol.sync();
	}

	async function runFileSearch(query: IRawSearchQuery, cancel = false): TPromise<URI[]> {
		try {
			const p = extHostSearch.$provideFileSearchResults(mockMainThreadSearch.lastHandle, 0, query);
			if (cancel) {
				await new TPromise(resolve => process.nextTick(resolve));
				p.cancel();
			}

			await p;
		} catch (err) {
			if (!isPromiseCanceledError(err)) {
				await rpcProtocol.sync();
				throw err;
			}
		}

		await rpcProtocol.sync();
		return (<UriComponents[]>mockMainThreadSearch.results).map(r => URI.revive(r));
	}

	async function runTextSearch(pattern: IPatternInfo, query: IRawSearchQuery, cancel = false): TPromise<IFileMatch[]> {
		try {
			const p = extHostSearch.$provideTextSearchResults(mockMainThreadSearch.lastHandle, 0, pattern, query);
			if (cancel) {
				await new TPromise(resolve => process.nextTick(resolve));
				p.cancel();
			}

			await p;
		} catch (err) {
			if (!isPromiseCanceledError(err)) {
				await rpcProtocol.sync();
				throw err;
			}
		}

		await rpcProtocol.sync();
		return (<IRawFileMatch2[]>mockMainThreadSearch.results).map(r => ({
			...r,
			...{
				resource: URI.revive(r.resource)
			}
		}));
	}

	setup(() => {
		rpcProtocol = new TestRPCProtocol();

		mockMainThreadSearch = new MockMainThreadSearch();

		rpcProtocol.set(MainContext.MainThreadSearch, mockMainThreadSearch);
		extHostSearch = new ExtHostSearch(rpcProtocol, null);
	});

	teardown(() => {
		dispose(disposables);
		return rpcProtocol.sync();
	});

	const rootFolderA = URI.file('/foo/bar');
	const rootFolderB = URI.file('/foo/bar2');
	// const rootFolderC = URI.file('/foo/bar3');

	function makeAbsoluteURI(root: URI, relativePath: string): URI {
		return URI.file(
			path.join(root.fsPath, relativePath));
	}

	suite('File:', () => {

		function getSimpleQuery(filePattern = ''): ISearchQuery {
			return {
				type: QueryType.File,

				filePattern,
				folderQueries: [
					{ folder: rootFolderA }
				]
			};
		}

		function compareURIs(actual: URI[], expected: URI[]) {
			const sortAndStringify = (arr: URI[]) => arr.sort().map(u => u.toString());

			assert.deepEqual(
				sortAndStringify(actual),
				sortAndStringify(expected));
		}

		test('no results', async () => {
			await registerTestSearchProvider({
				provideFileSearchResults(options: vscode.FileSearchOptions, progress: vscode.Progress<vscode.Uri>, token: vscode.CancellationToken): Thenable<void> {
					return TPromise.wrap(null);
				}
			});

			const results = await runFileSearch(getSimpleQuery());
			assert(!results.length);
		});

		test('simple results', async () => {
			const reportedResults = [
				makeAbsoluteURI(rootFolderA, 'file1.ts'),
				makeAbsoluteURI(rootFolderA, 'file2.ts'),
				makeAbsoluteURI(rootFolderA, 'file3.ts'),
			];

			await registerTestSearchProvider({
				provideFileSearchResults(options: vscode.FileSearchOptions, progress: vscode.Progress<vscode.Uri>, token: vscode.CancellationToken): Thenable<void> {
					reportedResults.forEach(r => progress.report(r));
					return TPromise.wrap(null);
				}
			});

			const results = await runFileSearch(getSimpleQuery());
			assert.equal(results.length, 3);
			compareURIs(results, reportedResults);
		});

		// Sibling clauses
		// Extra files
		// Max result count
		// Absolute/relative logic
		// Includes/excludes passed to provider correctly
		// Provider misbehaves

		test('Search canceled', async () => {
			let cancelRequested = false;
			await registerTestSearchProvider({
				provideFileSearchResults(options: vscode.FileSearchOptions, progress: vscode.Progress<vscode.Uri>, token: vscode.CancellationToken): Thenable<void> {
					return new TPromise((resolve, reject) => {
						token.onCancellationRequested(() => {
							cancelRequested = true;
							progress.report(makeAbsoluteURI(rootFolderA, 'file1.ts'));

							resolve(null); // or reject or nothing?
						});
					});
				}
			});

			const results = await runFileSearch(getSimpleQuery(), true);
			assert(cancelRequested);
			assert(!results.length);
		});

		test('provider fail', async () => {
			const reportedResults = [
				makeAbsoluteURI(rootFolderA, 'file1.ts'),
				makeAbsoluteURI(rootFolderA, 'file2.ts'),
				makeAbsoluteURI(rootFolderA, 'file3.ts'),
			];

			await registerTestSearchProvider({
				provideFileSearchResults(options: vscode.FileSearchOptions, progress: vscode.Progress<vscode.Uri>, token: vscode.CancellationToken): Thenable<void> {
					reportedResults.forEach(r => progress.report(r));
					throw new Error('I broke');
				}
			});

			try {
				await runFileSearch(getSimpleQuery());
				assert(false, 'Expected to fail');
			} catch {
				// Expected to throw
			}
		});

		test('provider returns null', async () => {
			await registerTestSearchProvider({
				provideFileSearchResults(options: vscode.FileSearchOptions, progress: vscode.Progress<vscode.Uri>, token: vscode.CancellationToken): Thenable<void> {
					return null;
				}
			});

			try {
				await runFileSearch(getSimpleQuery());
				assert(false, 'Expected to fail');
			} catch {
				// Expected to throw
			}
		});

		test('all provider calls get global include/excludes', async () => {
			await registerTestSearchProvider({
				provideFileSearchResults(options: vscode.FileSearchOptions, progress: vscode.Progress<vscode.Uri>, token: vscode.CancellationToken): Thenable<void> {
					assert(options.excludes.length === 2 && options.includes.length === 2, 'Missing global include/excludes');
					return TPromise.wrap(null);
				}
			});

			const query: ISearchQuery = {
				type: QueryType.File,

				filePattern: '',
				includePattern: {
					'foo': true,
					'bar': true
				},
				excludePattern: {
					'something': true,
					'else': true
				},
				folderQueries: [
					{ folder: rootFolderA },
					{ folder: rootFolderB }
				]
			};

			await runFileSearch(query);
		});

		test('global/local include/excludes combined', async () => {
			await registerTestSearchProvider({
				provideFileSearchResults(options: vscode.FileSearchOptions, progress: vscode.Progress<vscode.Uri>, token: vscode.CancellationToken): Thenable<void> {
					if (options.folder.toString() === rootFolderA.toString()) {
						assert.deepEqual(options.includes.sort(), ['*.ts', 'foo']);
						assert.deepEqual(options.excludes.sort(), ['*.js', 'bar']);
					} else {
						assert.deepEqual(options.includes.sort(), ['*.ts']);
						assert.deepEqual(options.excludes.sort(), ['*.js']);
					}

					return TPromise.wrap(null);
				}
			});

			const query: ISearchQuery = {
				type: QueryType.File,

				filePattern: '',
				includePattern: {
					'*.ts': true
				},
				excludePattern: {
					'*.js': true
				},
				folderQueries: [
					{
						folder: rootFolderA,
						includePattern: {
							'foo': true
						},
						excludePattern: {
							'bar': true
						}
					},
					{ folder: rootFolderB }
				]
			};

			await runFileSearch(query);
		});

		test('include/excludes resolved correctly', async () => {
			await registerTestSearchProvider({
				provideFileSearchResults(options: vscode.FileSearchOptions, progress: vscode.Progress<vscode.Uri>, token: vscode.CancellationToken): Thenable<void> {
					assert.deepEqual(options.includes.sort(), ['*.jsx', '*.ts']);
					assert.deepEqual(options.excludes.sort(), []);

					return TPromise.wrap(null);
				}
			});

			const query: ISearchQuery = {
				type: QueryType.File,

				filePattern: '',
				includePattern: {
					'*.ts': true,
					'*.jsx': false
				},
				excludePattern: {
					'*.js': true,
					'*.tsx': false
				},
				folderQueries: [
					{
						folder: rootFolderA,
						includePattern: {
							'*.jsx': true
						},
						excludePattern: {
							'*.js': false
						}
					}
				]
			};

			await runFileSearch(query);
		});

		test('basic sibling exclude clause', async () => {
			const reportedResults = [
				makeAbsoluteURI(rootFolderA, 'file1.ts'),
				makeAbsoluteURI(rootFolderA, 'file1.js'),
			];

			await registerTestSearchProvider({
				provideFileSearchResults(options: vscode.FileSearchOptions, progress: vscode.Progress<vscode.Uri>, token: vscode.CancellationToken): Thenable<void> {
					reportedResults.forEach(r => progress.report(r));
					return TPromise.wrap(null);
				}
			});

			const query: ISearchQuery = {
				type: QueryType.File,

				filePattern: '',
				excludePattern: {
					'*.js': {
						when: '$(basename).ts'
					}
				},
				folderQueries: [
					{ folder: rootFolderA }
				]
			};

			const results = await runFileSearch(query);
			compareURIs(
				results,
				[
					makeAbsoluteURI(rootFolderA, 'file1.ts')
				]);
		});

		test('multiroot sibling exclude clause', async () => {

			await registerTestSearchProvider({
				provideFileSearchResults(options: vscode.FileSearchOptions, progress: vscode.Progress<vscode.Uri>, token: vscode.CancellationToken): Thenable<void> {
					let reportedResults;
					if (options.folder.fsPath === rootFolderA.fsPath) {
						reportedResults = [
							makeAbsoluteURI(rootFolderA, 'folder/fileA.scss'),
							makeAbsoluteURI(rootFolderA, 'folder/fileA.css'),
							makeAbsoluteURI(rootFolderA, 'folder/file2.css')
						];
					} else {
						reportedResults = [
							makeAbsoluteURI(rootFolderB, 'fileB.ts'),
							makeAbsoluteURI(rootFolderB, 'fileB.js'),
							makeAbsoluteURI(rootFolderB, 'file3.js')
						];
					}

					reportedResults.forEach(r => progress.report(r));
					return TPromise.wrap(null);
				}
			});

			const query: ISearchQuery = {
				type: QueryType.File,

				filePattern: '',
				excludePattern: {
					'*.js': {
						when: '$(basename).ts'
					},
					'*.css': true
				},
				folderQueries: [
					{
						folder: rootFolderA,
						excludePattern: {
							'folder/*.css': {
								when: '$(basename).scss'
							}
						}
					},
					{
						folder: rootFolderB,
						excludePattern: {
							'*.js': false
						}
					}
				]
			};

			const results = await runFileSearch(query);
			compareURIs(
				results,
				[
					makeAbsoluteURI(rootFolderA, 'folder/fileA.scss'),
					makeAbsoluteURI(rootFolderA, 'folder/file2.css'),

					makeAbsoluteURI(rootFolderB, 'fileB.ts'),
					makeAbsoluteURI(rootFolderB, 'fileB.js'),
					makeAbsoluteURI(rootFolderB, 'file3.js'),
				]);
		});

		test('max results = 1', async () => {
			const reportedResults = [
				makeAbsoluteURI(rootFolderA, 'file1.ts'),
				makeAbsoluteURI(rootFolderA, 'file2.ts'),
				makeAbsoluteURI(rootFolderA, 'file3.ts'),
			];

			let wasCanceled = false;
			await registerTestSearchProvider({
				provideFileSearchResults(options: vscode.FileSearchOptions, progress: vscode.Progress<vscode.Uri>, token: vscode.CancellationToken): Thenable<void> {
					reportedResults.forEach(r => progress.report(r));
					token.onCancellationRequested(() => wasCanceled = true);

					return TPromise.wrap(null);
				}
			});

			const query: ISearchQuery = {
				type: QueryType.File,

				filePattern: '',
				maxResults: 1,

				folderQueries: [
					{
						folder: rootFolderA
					}
				]
			};

			const results = await runFileSearch(query);
			assert.equal(results.length, 1);
			assert(wasCanceled, 'Expected to be canceled when hitting limit');
			compareURIs(results, reportedResults.slice(0, 1));
		});

		test('max results = 2', async () => {
			const reportedResults = [
				makeAbsoluteURI(rootFolderA, 'file1.ts'),
				makeAbsoluteURI(rootFolderA, 'file2.ts'),
				makeAbsoluteURI(rootFolderA, 'file3.ts'),
			];

			let wasCanceled = false;
			await registerTestSearchProvider({
				provideFileSearchResults(options: vscode.FileSearchOptions, progress: vscode.Progress<vscode.Uri>, token: vscode.CancellationToken): Thenable<void> {
					reportedResults.forEach(r => progress.report(r));
					token.onCancellationRequested(() => wasCanceled = true);

					return TPromise.wrap(null);
				}
			});

			const query: ISearchQuery = {
				type: QueryType.File,

				filePattern: '',
				maxResults: 2,

				folderQueries: [
					{
						folder: rootFolderA
					}
				]
			};

			const results = await runFileSearch(query);
			assert.equal(results.length, 2);
			assert(wasCanceled, 'Expected to be canceled when hitting limit');
			compareURIs(results, reportedResults.slice(0, 2));
		});

		// Mock fs?
		// test('Returns result for absolute path', async () => {
		// 	const queriedFile = makeFileResult(rootFolderA, 'file2.ts');
		// 	const reportedResults = [
		// 		makeFileResult(rootFolderA, 'file1.ts'),
		// 		queriedFile,
		// 		makeFileResult(rootFolderA, 'file3.ts'),
		// 	];

		// 	await registerTestSearchProvider({
		// 		provideFileSearchResults(options: vscode.FileSearchOptions, progress: vscode.Progress<vscode.Uri>, token: vscode.CancellationToken): Thenable<void> {
		// 			reportedResults.forEach(r => progress.report(r));
		// 			return TPromise.wrap(null);
		// 		}
		// 	});

		// 	const queriedFilePath = queriedFile.fsPath;
		// 	const results = await runFileSearch(getSimpleQuery(queriedFilePath));
		// 	assert.equal(results.length, 1);
		// 	compareURIs(results, [queriedFile]);
		// });
	});

	suite('Text:', () => {

		function makePreview(text: string): vscode.TextSearchResult['preview'] {
			return {
				match: new Range(0, 0, 0, text.length),
				text
			};
		}

		function getSimpleQuery(): ISearchQuery {
			return {
				type: QueryType.Text,

				folderQueries: [
					{ folder: rootFolderA }
				]
			};
		}

		function getPattern(queryText: string): IPatternInfo {
			return {
				pattern: queryText
			};
		}

		function assertResults(actual: IFileMatch[], expected: vscode.TextSearchResult[]) {
			const actualTextSearchResults: vscode.TextSearchResult[] = [];
			for (let fileMatch of actual) {
				for (let lineMatch of fileMatch.lineMatches) {
					for (let [offset, length] of lineMatch.offsetAndLengths) {
						actualTextSearchResults.push({
							preview: { text: lineMatch.preview, match: null },
							range: new Range(lineMatch.lineNumber, offset, lineMatch.lineNumber, length + offset),
							uri: fileMatch.resource
						});
					}
				}
			}

			const rangeToString = (r: vscode.Range) => `(${r.start.line}, ${r.start.character}), (${r.end.line}, ${r.end.character})`;

			const makeComparable = (results: vscode.TextSearchResult[]) => results
				.sort((a, b) => b.preview.text.localeCompare(a.preview.text))
				.map(r => ({
					...r,
					...{
						uri: r.uri.toString(),
						range: rangeToString(r.range),
						preview: {
							text: r.preview.text,
							match: null // Don't care about this right now
						}
					}
				}));

			return assert.deepEqual(
				makeComparable(actualTextSearchResults),
				makeComparable(expected));
		}

		test('no results', async () => {
			await registerTestSearchProvider({
				provideTextSearchResults(query: vscode.TextSearchQuery, options: vscode.TextSearchOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Thenable<void> {
					return TPromise.wrap(null);
				}
			});

			const results = await runTextSearch(getPattern('foo'), getSimpleQuery());
			assert(!results.length);
		});

		test('basic results', async () => {
			const providedResults: vscode.TextSearchResult[] = [
				{
					preview: makePreview('foo'),
					range: new Range(0, 0, 0, 3),
					uri: makeAbsoluteURI(rootFolderA, 'file1.ts')
				},
				{
					preview: makePreview('bar'),
					range: new Range(1, 0, 1, 3),
					uri: makeAbsoluteURI(rootFolderA, 'file2.ts')
				}
			];

			await registerTestSearchProvider({
				provideTextSearchResults(query: vscode.TextSearchQuery, options: vscode.TextSearchOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Thenable<void> {
					providedResults.forEach(r => progress.report(r));
					return TPromise.wrap(null);
				}
			});

			const results = await runTextSearch(getPattern('foo'), getSimpleQuery());
			assertResults(results, providedResults);
		});
	});
});

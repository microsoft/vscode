/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { isPromiseCanceledError } from 'vs/base/common/errors';
import { dispose } from 'vs/base/common/lifecycle';
import { joinPath } from 'vs/base/common/resources';
import { URI, UriComponents } from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import * as extfs from 'vs/base/node/extfs';
import { IFileMatch, IPatternInfo, IRawFileMatch2, IRawSearchQuery, ISearchCompleteStats, ISearchQuery, QueryType } from 'vs/platform/search/common/search';
import { MainContext, MainThreadSearchShape } from 'vs/workbench/api/node/extHost.protocol';
import { ExtHostSearch } from 'vs/workbench/api/node/extHostSearch';
import { Range } from 'vs/workbench/api/node/extHostTypes';
import { TestRPCProtocol } from 'vs/workbench/test/electron-browser/api/testRPCProtocol';
import * as vscode from 'vscode';
import { CancellationTokenSource } from 'vs/base/common/cancellation';

let rpcProtocol: TestRPCProtocol;
let extHostSearch: ExtHostSearch;
let disposables: vscode.Disposable[] = [];

let mockMainThreadSearch: MockMainThreadSearch;
class MockMainThreadSearch implements MainThreadSearchShape {
	lastHandle: number;

	results: (UriComponents | IRawFileMatch2)[] = [];

	$registerFileSearchProvider(handle: number, scheme: string): void {
		this.lastHandle = handle;
	}

	$registerFileIndexProvider(handle: number, scheme: string): void {
		this.lastHandle = handle;
	}

	$registerTextSearchProvider(handle: number, scheme: string): void {
		this.lastHandle = handle;
	}

	$unregisterProvider(handle: number): void {
	}

	$handleFileMatch(handle: number, session: number, data: UriComponents[]): void {
		this.results.push(...data);
	}

	$handleTextMatch(handle: number, session: number, data: IRawFileMatch2[]): void {
		this.results.push(...data);
	}

	$handleTelemetry(eventName: string, data: any): void {
	}

	dispose() {
	}
}

let mockExtfs: Partial<typeof extfs>;

suite('ExtHostSearch', () => {
	async function registerTestTextSearchProvider(provider: vscode.TextSearchProvider, scheme = 'file'): Promise<void> {
		disposables.push(extHostSearch.registerTextSearchProvider(scheme, provider));
		await rpcProtocol.sync();
	}

	async function registerTestFileSearchProvider(provider: vscode.FileSearchProvider, scheme = 'file'): Promise<void> {
		disposables.push(extHostSearch.registerFileSearchProvider(scheme, provider));
		await rpcProtocol.sync();
	}

	async function runFileSearch(query: IRawSearchQuery, cancel = false): Promise<{ results: URI[]; stats: ISearchCompleteStats }> {
		let stats: ISearchCompleteStats;
		try {
			const cancellation = new CancellationTokenSource();
			const p = extHostSearch.$provideFileSearchResults(mockMainThreadSearch.lastHandle, 0, query, cancellation.token);
			if (cancel) {
				await new TPromise(resolve => process.nextTick(resolve));
				cancellation.cancel();
			}

			stats = await p;
		} catch (err) {
			if (!isPromiseCanceledError(err)) {
				await rpcProtocol.sync();
				throw err;
			}
		}

		await rpcProtocol.sync();
		return {
			results: (<UriComponents[]>mockMainThreadSearch.results).map(r => URI.revive(r)),
			stats
		};
	}

	async function runTextSearch(pattern: IPatternInfo, query: IRawSearchQuery, cancel = false): Promise<{ results: IFileMatch[], stats: ISearchCompleteStats }> {
		let stats: ISearchCompleteStats;
		try {
			const cancellation = new CancellationTokenSource();
			const p = extHostSearch.$provideTextSearchResults(mockMainThreadSearch.lastHandle, 0, pattern, query, cancellation.token);
			if (cancel) {
				await new TPromise(resolve => process.nextTick(resolve));
				cancellation.cancel();
			}

			stats = await p;
		} catch (err) {
			if (!isPromiseCanceledError(err)) {
				await rpcProtocol.sync();
				throw err;
			}
		}

		await rpcProtocol.sync();
		const results = (<IRawFileMatch2[]>mockMainThreadSearch.results).map(r => ({
			...r,
			...{
				resource: URI.revive(r.resource)
			}
		}));

		return { results, stats };
	}

	setup(() => {
		rpcProtocol = new TestRPCProtocol();

		mockMainThreadSearch = new MockMainThreadSearch();

		rpcProtocol.set(MainContext.MainThreadSearch, mockMainThreadSearch);

		mockExtfs = {};
		extHostSearch = new ExtHostSearch(rpcProtocol, null, mockExtfs as typeof extfs);
	});

	teardown(() => {
		dispose(disposables);
		return rpcProtocol.sync();
	});

	const rootFolderA = URI.file('/foo/bar1');
	const rootFolderB = URI.file('/foo/bar2');
	const fancyScheme = 'fancy';
	const fancySchemeFolderA = URI.from({ scheme: fancyScheme, path: '/project/folder1' });

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
			await registerTestFileSearchProvider({
				provideFileSearchResults(query: vscode.FileSearchQuery, options: vscode.FileSearchOptions, token: vscode.CancellationToken): Thenable<URI[]> {
					return TPromise.wrap(null);
				}
			});

			const { results, stats } = await runFileSearch(getSimpleQuery());
			assert(!stats.limitHit);
			assert(!results.length);
		});

		test('simple results', async () => {
			const reportedResults = [
				joinPath(rootFolderA, 'file1.ts'),
				joinPath(rootFolderA, 'file2.ts'),
				joinPath(rootFolderA, 'file3.ts')
			];

			await registerTestFileSearchProvider({
				provideFileSearchResults(query: vscode.FileSearchQuery, options: vscode.FileSearchOptions, token: vscode.CancellationToken): Thenable<URI[]> {
					return TPromise.wrap(reportedResults);
				}
			});

			const { results, stats } = await runFileSearch(getSimpleQuery());
			assert(!stats.limitHit);
			assert.equal(results.length, 3);
			compareURIs(results, reportedResults);
		});

		test('Search canceled', async () => {
			let cancelRequested = false;
			await registerTestFileSearchProvider({
				provideFileSearchResults(query: vscode.FileSearchQuery, options: vscode.FileSearchOptions, token: vscode.CancellationToken): Thenable<URI[]> {
					return new TPromise((resolve, reject) => {
						token.onCancellationRequested(() => {
							cancelRequested = true;

							resolve([joinPath(options.folder, 'file1.ts')]); // or reject or nothing?
						});
					});
				}
			});

			const { results } = await runFileSearch(getSimpleQuery(), true);
			assert(cancelRequested);
			assert(!results.length);
		});

		test('provider returns null', async () => {
			await registerTestFileSearchProvider({
				provideFileSearchResults(query: vscode.FileSearchQuery, options: vscode.FileSearchOptions, token: vscode.CancellationToken): Thenable<URI[]> {
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
			await registerTestFileSearchProvider({
				provideFileSearchResults(query: vscode.FileSearchQuery, options: vscode.FileSearchOptions, token: vscode.CancellationToken): Thenable<URI[]> {
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
			await registerTestFileSearchProvider({
				provideFileSearchResults(query: vscode.FileSearchQuery, options: vscode.FileSearchOptions, token: vscode.CancellationToken): Thenable<URI[]> {
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
			await registerTestFileSearchProvider({
				provideFileSearchResults(query: vscode.FileSearchQuery, options: vscode.FileSearchOptions, token: vscode.CancellationToken): Thenable<URI[]> {
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
				'file1.ts',
				'file1.js',
			];

			await registerTestFileSearchProvider({
				provideFileSearchResults(query: vscode.FileSearchQuery, options: vscode.FileSearchOptions, token: vscode.CancellationToken): Thenable<URI[]> {
					return TPromise.wrap(reportedResults
						.map(relativePath => joinPath(options.folder, relativePath)));
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

			const { results } = await runFileSearch(query);
			compareURIs(
				results,
				[
					joinPath(rootFolderA, 'file1.ts')
				]);
		});

		test('multiroot sibling exclude clause', async () => {

			await registerTestFileSearchProvider({
				provideFileSearchResults(query: vscode.FileSearchQuery, options: vscode.FileSearchOptions, token: vscode.CancellationToken): Thenable<URI[]> {
					let reportedResults: URI[];
					if (options.folder.fsPath === rootFolderA.fsPath) {
						reportedResults = [
							'folder/fileA.scss',
							'folder/fileA.css',
							'folder/file2.css'
						].map(relativePath => joinPath(rootFolderA, relativePath));
					} else {
						reportedResults = [
							'fileB.ts',
							'fileB.js',
							'file3.js'
						].map(relativePath => joinPath(rootFolderB, relativePath));
					}

					return TPromise.wrap(reportedResults);
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

			const { results } = await runFileSearch(query);
			compareURIs(
				results,
				[
					joinPath(rootFolderA, 'folder/fileA.scss'),
					joinPath(rootFolderA, 'folder/file2.css'),

					joinPath(rootFolderB, 'fileB.ts'),
					joinPath(rootFolderB, 'fileB.js'),
					joinPath(rootFolderB, 'file3.js'),
				]);
		});

		test.skip('max results = 1', async () => {
			const reportedResults = [
				joinPath(rootFolderA, 'file1.ts'),
				joinPath(rootFolderA, 'file2.ts'),
				joinPath(rootFolderA, 'file3.ts'),
			];

			let wasCanceled = false;
			await registerTestFileSearchProvider({
				provideFileSearchResults(query: vscode.FileSearchQuery, options: vscode.FileSearchOptions, token: vscode.CancellationToken): Thenable<URI[]> {
					token.onCancellationRequested(() => wasCanceled = true);

					return TPromise.wrap(reportedResults);
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

			const { results, stats } = await runFileSearch(query);
			assert(stats.limitHit, 'Expected to return limitHit');
			assert.equal(results.length, 1);
			compareURIs(results, reportedResults.slice(0, 1));
			assert(wasCanceled, 'Expected to be canceled when hitting limit');
		});

		test.skip('max results = 2', async () => {
			const reportedResults = [
				joinPath(rootFolderA, 'file1.ts'),
				joinPath(rootFolderA, 'file2.ts'),
				joinPath(rootFolderA, 'file3.ts'),
			];

			let wasCanceled = false;
			await registerTestFileSearchProvider({
				provideFileSearchResults(query: vscode.FileSearchQuery, options: vscode.FileSearchOptions, token: vscode.CancellationToken): Thenable<URI[]> {
					token.onCancellationRequested(() => wasCanceled = true);

					return TPromise.wrap(reportedResults);
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

			const { results, stats } = await runFileSearch(query);
			assert(stats.limitHit, 'Expected to return limitHit');
			assert.equal(results.length, 2);
			compareURIs(results, reportedResults.slice(0, 2));
			assert(wasCanceled, 'Expected to be canceled when hitting limit');
		});

		test.skip('provider returns maxResults exactly', async () => {
			const reportedResults = [
				joinPath(rootFolderA, 'file1.ts'),
				joinPath(rootFolderA, 'file2.ts'),
			];

			let wasCanceled = false;
			await registerTestFileSearchProvider({
				provideFileSearchResults(query: vscode.FileSearchQuery, options: vscode.FileSearchOptions, token: vscode.CancellationToken): Thenable<URI[]> {
					token.onCancellationRequested(() => wasCanceled = true);

					return TPromise.wrap(reportedResults);
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

			const { results, stats } = await runFileSearch(query);
			assert(!stats.limitHit, 'Expected not to return limitHit');
			assert.equal(results.length, 2);
			compareURIs(results, reportedResults);
			assert(!wasCanceled, 'Expected not to be canceled when just reaching limit');
		});

		test('multiroot max results', async () => {
			let cancels = 0;
			await registerTestFileSearchProvider({
				provideFileSearchResults(query: vscode.FileSearchQuery, options: vscode.FileSearchOptions, token: vscode.CancellationToken): Thenable<URI[]> {
					token.onCancellationRequested(() => cancels++);

					// Provice results async so it has a chance to invoke every provider
					return new TPromise(r => process.nextTick(r))
						.then(() => {
							return [
								'file1.ts',
								'file2.ts',
								'file3.ts',
							].map(relativePath => joinPath(options.folder, relativePath));
						});
				}
			});

			const query: ISearchQuery = {
				type: QueryType.File,

				filePattern: '',
				maxResults: 2,

				folderQueries: [
					{
						folder: rootFolderA
					},
					{
						folder: rootFolderB
					}
				]
			};

			const { results } = await runFileSearch(query);
			assert.equal(results.length, 2); // Don't care which 2 we got
			assert.equal(cancels, 2, 'Expected all invocations to be canceled when hitting limit');
		});

		test('works with non-file schemes', async () => {
			const reportedResults = [
				joinPath(fancySchemeFolderA, 'file1.ts'),
				joinPath(fancySchemeFolderA, 'file2.ts'),
				joinPath(fancySchemeFolderA, 'file3.ts'),

			];

			await registerTestFileSearchProvider({
				provideFileSearchResults(query: vscode.FileSearchQuery, options: vscode.FileSearchOptions, token: vscode.CancellationToken): Thenable<URI[]> {
					return TPromise.wrap(reportedResults);
				}
			}, fancyScheme);

			const query: ISearchQuery = {
				type: QueryType.File,
				filePattern: '',
				folderQueries: [
					{
						folder: fancySchemeFolderA
					}
				]
			};

			const { results } = await runFileSearch(query);
			compareURIs(results, reportedResults);
		});
	});

	suite('Text:', () => {

		function makePreview(text: string): vscode.TextSearchResult['preview'] {
			return {
				match: new Range(0, 0, 0, text.length),
				text
			};
		}

		function makeTextResult(baseFolder: URI, relativePath: string): vscode.TextSearchResult {
			return {
				preview: makePreview('foo'),
				range: new Range(0, 0, 0, 3),
				uri: joinPath(baseFolder, relativePath)
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
				// Make relative
				for (let lineMatch of fileMatch.matches) {
					actualTextSearchResults.push({
						preview: {
							text: lineMatch.preview.text,
							match: new Range(lineMatch.preview.match.startLineNumber, lineMatch.preview.match.startColumn, lineMatch.preview.match.endLineNumber, lineMatch.preview.match.endColumn)
						},
						range: new Range(lineMatch.range.startLineNumber, lineMatch.range.startColumn, lineMatch.range.endLineNumber, lineMatch.range.endColumn),
						uri: fileMatch.resource
					});
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
			await registerTestTextSearchProvider({
				provideTextSearchResults(query: vscode.TextSearchQuery, options: vscode.TextSearchOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Thenable<vscode.TextSearchComplete> {
					return TPromise.wrap(null);
				}
			});

			const { results, stats } = await runTextSearch(getPattern('foo'), getSimpleQuery());
			assert(!stats.limitHit);
			assert(!results.length);
		});

		test('basic results', async () => {
			const providedResults: vscode.TextSearchResult[] = [
				makeTextResult(rootFolderA, 'file1.ts'),
				makeTextResult(rootFolderA, 'file2.ts')
			];

			await registerTestTextSearchProvider({
				provideTextSearchResults(query: vscode.TextSearchQuery, options: vscode.TextSearchOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Thenable<vscode.TextSearchComplete> {
					providedResults.forEach(r => progress.report(r));
					return TPromise.wrap(null);
				}
			});

			const { results, stats } = await runTextSearch(getPattern('foo'), getSimpleQuery());
			assert(!stats.limitHit);
			assertResults(results, providedResults);
		});

		test('all provider calls get global include/excludes', async () => {
			await registerTestTextSearchProvider({
				provideTextSearchResults(query: vscode.TextSearchQuery, options: vscode.TextSearchOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Thenable<vscode.TextSearchComplete> {
					assert.equal(options.includes.length, 1);
					assert.equal(options.excludes.length, 1);
					return TPromise.wrap(null);
				}
			});

			const query: IRawSearchQuery = {
				type: QueryType.Text,

				includePattern: {
					'*.ts': true
				},

				excludePattern: {
					'*.js': true
				},

				folderQueries: [
					{ folder: rootFolderA },
					{ folder: rootFolderB }
				]
			};

			await runTextSearch(getPattern('foo'), query);
		});

		test('global/local include/excludes combined', async () => {
			await registerTestTextSearchProvider({
				provideTextSearchResults(query: vscode.TextSearchQuery, options: vscode.TextSearchOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Thenable<vscode.TextSearchComplete> {
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

			const query: IRawSearchQuery = {
				type: QueryType.Text,

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

			await runTextSearch(getPattern('foo'), query);
		});

		test('include/excludes resolved correctly', async () => {
			await registerTestTextSearchProvider({
				provideTextSearchResults(query: vscode.TextSearchQuery, options: vscode.TextSearchOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Thenable<vscode.TextSearchComplete> {
					assert.deepEqual(options.includes.sort(), ['*.jsx', '*.ts']);
					assert.deepEqual(options.excludes.sort(), []);

					return TPromise.wrap(null);
				}
			});

			const query: ISearchQuery = {
				type: QueryType.Text,

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

			await runTextSearch(getPattern('foo'), query);
		});

		test('provider fail', async () => {
			await registerTestTextSearchProvider({
				provideTextSearchResults(query: vscode.TextSearchQuery, options: vscode.TextSearchOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Thenable<vscode.TextSearchComplete> {
					throw new Error('Provider fail');
				}
			});

			try {
				await runTextSearch(getPattern('foo'), getSimpleQuery());
				assert(false, 'Expected to fail');
			} catch {
				// expected to fail
			}
		});

		test('basic sibling clause', async () => {
			mockExtfs.readdir = (_path: string, callback: (error: Error, files: string[]) => void) => {
				if (_path === rootFolderA.fsPath) {
					callback(null, [
						'file1.js',
						'file1.ts'
					]);
				} else {
					callback(new Error('Wrong path'), null);
				}
			};

			const providedResults: vscode.TextSearchResult[] = [
				makeTextResult(rootFolderA, 'file1.js'),
				makeTextResult(rootFolderA, 'file1.ts')
			];

			await registerTestTextSearchProvider({
				provideTextSearchResults(query: vscode.TextSearchQuery, options: vscode.TextSearchOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Thenable<vscode.TextSearchComplete> {
					providedResults.forEach(r => progress.report(r));
					return TPromise.wrap(null);
				}
			});

			const query: ISearchQuery = {
				type: QueryType.Text,

				excludePattern: {
					'*.js': {
						when: '$(basename).ts'
					}
				},

				folderQueries: [
					{ folder: rootFolderA }
				]
			};

			const { results } = await runTextSearch(getPattern('foo'), query);
			assertResults(results, providedResults.slice(1));
		});

		test('multiroot sibling clause', async () => {
			mockExtfs.readdir = (_path: string, callback: (error: Error, files: string[]) => void) => {
				if (_path === joinPath(rootFolderA, 'folder').fsPath) {
					callback(null, [
						'fileA.scss',
						'fileA.css',
						'file2.css'
					]);
				} else if (_path === rootFolderB.fsPath) {
					callback(null, [
						'fileB.ts',
						'fileB.js',
						'file3.js'
					]);
				} else {
					callback(new Error('Wrong path'), null);
				}
			};

			await registerTestTextSearchProvider({
				provideTextSearchResults(query: vscode.TextSearchQuery, options: vscode.TextSearchOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Thenable<vscode.TextSearchComplete> {
					let reportedResults;
					if (options.folder.fsPath === rootFolderA.fsPath) {
						reportedResults = [
							makeTextResult(rootFolderA, 'folder/fileA.scss'),
							makeTextResult(rootFolderA, 'folder/fileA.css'),
							makeTextResult(rootFolderA, 'folder/file2.css')
						];
					} else {
						reportedResults = [
							makeTextResult(rootFolderB, 'fileB.ts'),
							makeTextResult(rootFolderB, 'fileB.js'),
							makeTextResult(rootFolderB, 'file3.js')
						];
					}

					reportedResults.forEach(r => progress.report(r));
					return TPromise.wrap(null);
				}
			});

			const query: ISearchQuery = {
				type: QueryType.Text,

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

			const { results } = await runTextSearch(getPattern('foo'), query);
			assertResults(results, [
				makeTextResult(rootFolderA, 'folder/fileA.scss'),
				makeTextResult(rootFolderA, 'folder/file2.css'),
				makeTextResult(rootFolderB, 'fileB.ts'),
				makeTextResult(rootFolderB, 'fileB.js'),
				makeTextResult(rootFolderB, 'file3.js')]);
		});

		test('include pattern applied', async () => {
			const providedResults: vscode.TextSearchResult[] = [
				makeTextResult(rootFolderA, 'file1.js'),
				makeTextResult(rootFolderA, 'file1.ts')
			];

			await registerTestTextSearchProvider({
				provideTextSearchResults(query: vscode.TextSearchQuery, options: vscode.TextSearchOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Thenable<vscode.TextSearchComplete> {
					providedResults.forEach(r => progress.report(r));
					return TPromise.wrap(null);
				}
			});

			const query: ISearchQuery = {
				type: QueryType.Text,

				includePattern: {
					'*.ts': true
				},

				folderQueries: [
					{ folder: rootFolderA }
				]
			};

			const { results } = await runTextSearch(getPattern('foo'), query);
			assertResults(results, providedResults.slice(1));
		});

		test('max results = 1', async () => {
			const providedResults: vscode.TextSearchResult[] = [
				makeTextResult(rootFolderA, 'file1.ts'),
				makeTextResult(rootFolderA, 'file2.ts')
			];

			let wasCanceled = false;
			await registerTestTextSearchProvider({
				provideTextSearchResults(query: vscode.TextSearchQuery, options: vscode.TextSearchOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Thenable<vscode.TextSearchComplete> {
					token.onCancellationRequested(() => wasCanceled = true);
					providedResults.forEach(r => progress.report(r));
					return TPromise.wrap(null);
				}
			});

			const query: ISearchQuery = {
				type: QueryType.Text,

				maxResults: 1,

				folderQueries: [
					{ folder: rootFolderA }
				]
			};

			const { results, stats } = await runTextSearch(getPattern('foo'), query);
			assert(stats.limitHit, 'Expected to return limitHit');
			assertResults(results, providedResults.slice(0, 1));
			assert(wasCanceled, 'Expected to be canceled');
		});

		test('max results = 2', async () => {
			const providedResults: vscode.TextSearchResult[] = [
				makeTextResult(rootFolderA, 'file1.ts'),
				makeTextResult(rootFolderA, 'file2.ts'),
				makeTextResult(rootFolderA, 'file3.ts')
			];

			let wasCanceled = false;
			await registerTestTextSearchProvider({
				provideTextSearchResults(query: vscode.TextSearchQuery, options: vscode.TextSearchOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Thenable<vscode.TextSearchComplete> {
					token.onCancellationRequested(() => wasCanceled = true);
					providedResults.forEach(r => progress.report(r));
					return TPromise.wrap(null);
				}
			});

			const query: ISearchQuery = {
				type: QueryType.Text,

				maxResults: 2,

				folderQueries: [
					{ folder: rootFolderA }
				]
			};

			const { results, stats } = await runTextSearch(getPattern('foo'), query);
			assert(stats.limitHit, 'Expected to return limitHit');
			assertResults(results, providedResults.slice(0, 2));
			assert(wasCanceled, 'Expected to be canceled');
		});

		test('provider returns maxResults exactly', async () => {
			const providedResults: vscode.TextSearchResult[] = [
				makeTextResult(rootFolderA, 'file1.ts'),
				makeTextResult(rootFolderA, 'file2.ts')
			];

			let wasCanceled = false;
			await registerTestTextSearchProvider({
				provideTextSearchResults(query: vscode.TextSearchQuery, options: vscode.TextSearchOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Thenable<vscode.TextSearchComplete> {
					token.onCancellationRequested(() => wasCanceled = true);
					providedResults.forEach(r => progress.report(r));
					return TPromise.wrap(null);
				}
			});

			const query: ISearchQuery = {
				type: QueryType.Text,

				maxResults: 2,

				folderQueries: [
					{ folder: rootFolderA }
				]
			};

			const { results, stats } = await runTextSearch(getPattern('foo'), query);
			assert(!stats.limitHit, 'Expected not to return limitHit');
			assertResults(results, providedResults);
			assert(!wasCanceled, 'Expected not to be canceled');
		});

		test('provider returns early with limitHit', async () => {
			const providedResults: vscode.TextSearchResult[] = [
				makeTextResult(rootFolderA, 'file1.ts'),
				makeTextResult(rootFolderA, 'file2.ts'),
				makeTextResult(rootFolderA, 'file3.ts')
			];

			await registerTestTextSearchProvider({
				provideTextSearchResults(query: vscode.TextSearchQuery, options: vscode.TextSearchOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Thenable<vscode.TextSearchComplete> {
					providedResults.forEach(r => progress.report(r));
					return TPromise.wrap({ limitHit: true });
				}
			});

			const query: ISearchQuery = {
				type: QueryType.Text,

				maxResults: 1000,

				folderQueries: [
					{ folder: rootFolderA }
				]
			};

			const { results, stats } = await runTextSearch(getPattern('foo'), query);
			assert(stats.limitHit, 'Expected to return limitHit');
			assertResults(results, providedResults);
		});

		test('multiroot max results', async () => {
			let cancels = 0;
			await registerTestTextSearchProvider({
				provideTextSearchResults(query: vscode.TextSearchQuery, options: vscode.TextSearchOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Thenable<vscode.TextSearchComplete> {
					token.onCancellationRequested(() => cancels++);
					return new TPromise(r => process.nextTick(r))
						.then(() => {
							[
								'file1.ts',
								'file2.ts',
								'file3.ts',
							].forEach(f => progress.report(makeTextResult(options.folder, f)));

							return null;
						});
				}
			});

			const query: ISearchQuery = {
				type: QueryType.Text,

				maxResults: 2,

				folderQueries: [
					{ folder: rootFolderA },
					{ folder: rootFolderB }
				]
			};

			const { results } = await runTextSearch(getPattern('foo'), query);
			assert.equal(results.length, 2);
			assert.equal(cancels, 2);
		});

		test('works with non-file schemes', async () => {
			const providedResults: vscode.TextSearchResult[] = [
				makeTextResult(fancySchemeFolderA, 'file1.ts'),
				makeTextResult(fancySchemeFolderA, 'file2.ts'),
				makeTextResult(fancySchemeFolderA, 'file3.ts')
			];

			await registerTestTextSearchProvider({
				provideTextSearchResults(query: vscode.TextSearchQuery, options: vscode.TextSearchOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Thenable<vscode.TextSearchComplete> {
					providedResults.forEach(r => progress.report(r));
					return TPromise.wrap(null);
				}
			}, fancyScheme);

			const query: ISearchQuery = {
				type: QueryType.Text,

				folderQueries: [
					{ folder: fancySchemeFolderA }
				]
			};

			const { results } = await runTextSearch(getPattern('foo'), query);
			assertResults(results, providedResults);
		});
	});
});

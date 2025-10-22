/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mapArrayOrNot } from '../../../../base/common/arrays.js';
import { timeout } from '../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { revive } from '../../../../base/common/marshalling.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import * as pfs from '../../../../base/node/pfs.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { MainContext, MainThreadSearchShape } from '../../common/extHost.protocol.js';
import { ExtHostConfigProvider, IExtHostConfiguration } from '../../common/extHostConfiguration.js';
import { IExtHostInitDataService } from '../../common/extHostInitDataService.js';
import { Range } from '../../common/extHostTypes.js';
import { URITransformerService } from '../../common/extHostUriTransformerService.js';
import { NativeExtHostSearch } from '../../node/extHostSearch.js';
import { TestRPCProtocol } from '../common/testRPCProtocol.js';
import { IFileMatch, IFileQuery, IPatternInfo, IRawFileMatch2, ISearchCompleteStats, ISearchQuery, ITextQuery, QueryType, resultIsMatch } from '../../../services/search/common/search.js';
import { TextSearchManager } from '../../../services/search/common/textSearchManager.js';
import { NativeTextSearchManager } from '../../../services/search/node/textSearchManager.js';
import type * as vscode from 'vscode';
import { AISearchKeyword } from '../../../services/search/common/searchExtTypes.js';

let rpcProtocol: TestRPCProtocol;
let extHostSearch: NativeExtHostSearch;

let mockMainThreadSearch: MockMainThreadSearch;
class MockMainThreadSearch implements MainThreadSearchShape {
	lastHandle!: number;

	results: Array<UriComponents | IRawFileMatch2> = [];

	keywords: Array<AISearchKeyword> = [];

	$registerFileSearchProvider(handle: number, scheme: string): void {
		this.lastHandle = handle;
	}

	$registerTextSearchProvider(handle: number, scheme: string): void {
		this.lastHandle = handle;
	}

	$registerAITextSearchProvider(handle: number, scheme: string): void {
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

	$handleKeywordResult(handle: number, session: number, data: AISearchKeyword): void {
		this.keywords.push(data);
	}

	$handleTelemetry(eventName: string, data: any): void {
	}

	dispose() {
	}
}

let mockPFS: Partial<typeof pfs>;

function extensionResultIsMatch(data: vscode.TextSearchResult): data is vscode.TextSearchMatch {
	return !!(<vscode.TextSearchMatch>data).preview;
}

suite('ExtHostSearch', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	async function registerTestTextSearchProvider(provider: vscode.TextSearchProvider, scheme = 'file'): Promise<void> {
		disposables.add(extHostSearch.registerTextSearchProviderOld(scheme, provider));
		await rpcProtocol.sync();
	}

	async function registerTestFileSearchProvider(provider: vscode.FileSearchProvider, scheme = 'file'): Promise<void> {
		disposables.add(extHostSearch.registerFileSearchProviderOld(scheme, provider));
		await rpcProtocol.sync();
	}

	async function runFileSearch(query: IFileQuery, cancel = false): Promise<{ results: URI[]; stats: ISearchCompleteStats }> {
		let stats: ISearchCompleteStats;
		try {
			const cancellation = new CancellationTokenSource();
			const p = extHostSearch.$provideFileSearchResults(mockMainThreadSearch.lastHandle, 0, query, cancellation.token);
			if (cancel) {
				await timeout(0);
				cancellation.cancel();
			}

			stats = await p;
		} catch (err) {
			if (!isCancellationError(err)) {
				await rpcProtocol.sync();
				throw err;
			}
		}

		await rpcProtocol.sync();
		return {
			results: (<UriComponents[]>mockMainThreadSearch.results).map(r => URI.revive(r)),
			stats: stats!
		};
	}

	async function runTextSearch(query: ITextQuery): Promise<{ results: IFileMatch[]; stats: ISearchCompleteStats }> {
		let stats: ISearchCompleteStats;
		try {
			const cancellation = new CancellationTokenSource();
			const p = extHostSearch.$provideTextSearchResults(mockMainThreadSearch.lastHandle, 0, query, cancellation.token);

			stats = await p;
		} catch (err) {
			if (!isCancellationError(err)) {
				await rpcProtocol.sync();
				throw err;
			}
		}

		await rpcProtocol.sync();
		const results: IFileMatch[] = revive(<IRawFileMatch2[]>mockMainThreadSearch.results);

		return { results, stats: stats! };
	}

	setup(() => {
		rpcProtocol = new TestRPCProtocol();

		mockMainThreadSearch = new MockMainThreadSearch();
		const logService = new NullLogService();

		rpcProtocol.set(MainContext.MainThreadSearch, mockMainThreadSearch);

		mockPFS = {};
		extHostSearch = disposables.add(new class extends NativeExtHostSearch {
			constructor() {
				super(
					rpcProtocol,
					new class extends mock<IExtHostInitDataService>() { override remote = { isRemote: false, authority: undefined, connectionData: null }; },
					new URITransformerService(null),
					new class extends mock<IExtHostConfiguration>() {
						override async getConfigProvider(): Promise<ExtHostConfigProvider> {
							return {
								onDidChangeConfiguration(_listener: (event: vscode.ConfigurationChangeEvent) => void) { },
								getConfiguration(): vscode.WorkspaceConfiguration {
									return {
										get() { },
										has() {
											return false;
										},
										inspect() {
											return undefined;
										},
										async update() { }
									};
								},

							} as ExtHostConfigProvider;
						}
					},
					logService
				);
				// eslint-disable-next-line local/code-no-any-casts
				this._pfs = mockPFS as any;
			}

			protected override createTextSearchManager(query: ITextQuery, provider: vscode.TextSearchProvider2): TextSearchManager {
				return new NativeTextSearchManager(query, provider, this._pfs);
			}
		});
	});

	teardown(() => {
		return rpcProtocol.sync();
	});

	const rootFolderA = URI.file('/foo/bar1');
	const rootFolderB = URI.file('/foo/bar2');
	const fancyScheme = 'fancy';
	const fancySchemeFolderA = URI.from({ scheme: fancyScheme, path: '/project/folder1' });

	suite('File:', () => {

		function getSimpleQuery(filePattern = ''): IFileQuery {
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

			assert.deepStrictEqual(
				sortAndStringify(actual),
				sortAndStringify(expected));
		}

		test('no results', async () => {
			await registerTestFileSearchProvider({
				provideFileSearchResults(query: vscode.FileSearchQuery, options: vscode.FileSearchOptions, token: vscode.CancellationToken): Promise<URI[]> {
					return Promise.resolve(null!);
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
				joinPath(rootFolderA, 'subfolder/file3.ts')
			];

			await registerTestFileSearchProvider({
				provideFileSearchResults(query: vscode.FileSearchQuery, options: vscode.FileSearchOptions, token: vscode.CancellationToken): Promise<URI[]> {
					return Promise.resolve(reportedResults);
				}
			});

			const { results, stats } = await runFileSearch(getSimpleQuery());
			assert(!stats.limitHit);
			assert.strictEqual(results.length, 3);
			compareURIs(results, reportedResults);
		});

		test('Search canceled', async () => {
			let cancelRequested = false;
			await registerTestFileSearchProvider({
				provideFileSearchResults(query: vscode.FileSearchQuery, options: vscode.FileSearchOptions, token: vscode.CancellationToken): Promise<URI[]> {

					return new Promise((resolve, reject) => {
						function onCancel() {
							cancelRequested = true;

							resolve([joinPath(options.folder, 'file1.ts')]); // or reject or nothing?
						}

						if (token.isCancellationRequested) {
							onCancel();
						} else {
							disposables.add(token.onCancellationRequested(() => onCancel()));
						}
					});
				}
			});

			const { results } = await runFileSearch(getSimpleQuery(), true);
			assert(cancelRequested);
			assert(!results.length);
		});

		test('session cancellation should work', async () => {
			let numSessionCancelled = 0;
			const disposables: (vscode.Disposable | undefined)[] = [];
			await registerTestFileSearchProvider({
				provideFileSearchResults(query: vscode.FileSearchQuery, options: vscode.FileSearchOptions, token: vscode.CancellationToken): Promise<URI[]> {

					disposables.push(options.session?.onCancellationRequested(() => {
						numSessionCancelled++;
					}));

					return Promise.resolve([]);
				}
			});


			await runFileSearch({ ...getSimpleQuery(), cacheKey: '1' }, true);
			await runFileSearch({ ...getSimpleQuery(), cacheKey: '2' }, true);
			extHostSearch.$clearCache('1');
			assert.strictEqual(numSessionCancelled, 1);
			disposables.forEach(d => d?.dispose());
		});

		test('provider returns null', async () => {
			await registerTestFileSearchProvider({
				provideFileSearchResults(query: vscode.FileSearchQuery, options: vscode.FileSearchOptions, token: vscode.CancellationToken): Promise<URI[]> {
					return null!;
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
				provideFileSearchResults(query: vscode.FileSearchQuery, options: vscode.FileSearchOptions, token: vscode.CancellationToken): Promise<URI[]> {
					assert(options.excludes.length === 2 && options.includes.length === 2, 'Missing global include/excludes');
					return Promise.resolve(null!);
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
				provideFileSearchResults(query: vscode.FileSearchQuery, options: vscode.FileSearchOptions, token: vscode.CancellationToken): Promise<URI[]> {
					if (options.folder.toString() === rootFolderA.toString()) {
						assert.deepStrictEqual(options.includes.sort(), ['*.ts', 'foo']);
						assert.deepStrictEqual(options.excludes.sort(), ['*.js', 'bar']);
					} else {
						assert.deepStrictEqual(options.includes.sort(), ['*.ts']);
						assert.deepStrictEqual(options.excludes.sort(), ['*.js']);
					}

					return Promise.resolve(null!);
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
						excludePattern: [{
							pattern: {
								'bar': true
							}
						}]
					},
					{ folder: rootFolderB }
				]
			};

			await runFileSearch(query);
		});

		test('include/excludes resolved correctly', async () => {
			await registerTestFileSearchProvider({
				provideFileSearchResults(query: vscode.FileSearchQuery, options: vscode.FileSearchOptions, token: vscode.CancellationToken): Promise<URI[]> {
					assert.deepStrictEqual(options.includes.sort(), ['*.jsx', '*.ts']);
					assert.deepStrictEqual(options.excludes.sort(), []);

					return Promise.resolve(null!);
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
						excludePattern: [{
							pattern: {
								'*.js': false
							}
						}]
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
				provideFileSearchResults(query: vscode.FileSearchQuery, options: vscode.FileSearchOptions, token: vscode.CancellationToken): Promise<URI[]> {
					return Promise.resolve(reportedResults
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

		// https://github.com/microsoft/vscode-remotehub/issues/255
		test('include, sibling exclude, and subfolder', async () => {
			const reportedResults = [
				'foo/file1.ts',
				'foo/file1.js',
			];

			await registerTestFileSearchProvider({
				provideFileSearchResults(query: vscode.FileSearchQuery, options: vscode.FileSearchOptions, token: vscode.CancellationToken): Promise<URI[]> {
					return Promise.resolve(reportedResults
						.map(relativePath => joinPath(options.folder, relativePath)));
				}
			});

			const query: ISearchQuery = {
				type: QueryType.File,

				filePattern: '',
				includePattern: { '**/*.ts': true },
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
					joinPath(rootFolderA, 'foo/file1.ts')
				]);
		});

		test('multiroot sibling exclude clause', async () => {

			await registerTestFileSearchProvider({
				provideFileSearchResults(query: vscode.FileSearchQuery, options: vscode.FileSearchOptions, token: vscode.CancellationToken): Promise<URI[]> {
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

					return Promise.resolve(reportedResults);
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
						excludePattern: [{
							pattern: {
								'folder/*.css': {
									when: '$(basename).scss'
								}
							}
						}]
					},
					{
						folder: rootFolderB,
						excludePattern: [{
							pattern: {
								'*.js': false
							}
						}]
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

		test('max results = 1', async () => {
			const reportedResults = [
				joinPath(rootFolderA, 'file1.ts'),
				joinPath(rootFolderA, 'file2.ts'),
				joinPath(rootFolderA, 'file3.ts'),
			];

			let wasCanceled = false;
			await registerTestFileSearchProvider({
				provideFileSearchResults(query: vscode.FileSearchQuery, options: vscode.FileSearchOptions, token: vscode.CancellationToken): Promise<URI[]> {
					disposables.add(token.onCancellationRequested(() => wasCanceled = true));

					return Promise.resolve(reportedResults);
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
			assert.strictEqual(results.length, 1);
			compareURIs(results, reportedResults.slice(0, 1));
			assert(wasCanceled, 'Expected to be canceled when hitting limit');
		});

		test('max results = 2', async () => {
			const reportedResults = [
				joinPath(rootFolderA, 'file1.ts'),
				joinPath(rootFolderA, 'file2.ts'),
				joinPath(rootFolderA, 'file3.ts'),
			];

			let wasCanceled = false;
			await registerTestFileSearchProvider({
				provideFileSearchResults(query: vscode.FileSearchQuery, options: vscode.FileSearchOptions, token: vscode.CancellationToken): Promise<URI[]> {
					disposables.add(token.onCancellationRequested(() => wasCanceled = true));

					return Promise.resolve(reportedResults);
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
			assert.strictEqual(results.length, 2);
			compareURIs(results, reportedResults.slice(0, 2));
			assert(wasCanceled, 'Expected to be canceled when hitting limit');
		});

		test('provider returns maxResults exactly', async () => {
			const reportedResults = [
				joinPath(rootFolderA, 'file1.ts'),
				joinPath(rootFolderA, 'file2.ts'),
			];

			let wasCanceled = false;
			await registerTestFileSearchProvider({
				provideFileSearchResults(query: vscode.FileSearchQuery, options: vscode.FileSearchOptions, token: vscode.CancellationToken): Promise<URI[]> {
					disposables.add(token.onCancellationRequested(() => wasCanceled = true));

					return Promise.resolve(reportedResults);
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
			assert.strictEqual(results.length, 2);
			compareURIs(results, reportedResults);
			assert(!wasCanceled, 'Expected not to be canceled when just reaching limit');
		});

		test('multiroot max results', async () => {
			let cancels = 0;
			await registerTestFileSearchProvider({
				async provideFileSearchResults(query: vscode.FileSearchQuery, options: vscode.FileSearchOptions, token: vscode.CancellationToken): Promise<URI[]> {
					disposables.add(token.onCancellationRequested(() => cancels++));

					// Provice results async so it has a chance to invoke every provider
					await new Promise(r => process.nextTick(r));
					return [
						'file1.ts',
						'file2.ts',
						'file3.ts',
					].map(relativePath => joinPath(options.folder, relativePath));
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
			assert.strictEqual(results.length, 2); // Don't care which 2 we got
			assert.strictEqual(cancels, 2, 'Expected all invocations to be canceled when hitting limit');
		});

		test('works with non-file schemes', async () => {
			const reportedResults = [
				joinPath(fancySchemeFolderA, 'file1.ts'),
				joinPath(fancySchemeFolderA, 'file2.ts'),
				joinPath(fancySchemeFolderA, 'subfolder/file3.ts'),

			];

			await registerTestFileSearchProvider({
				provideFileSearchResults(query: vscode.FileSearchQuery, options: vscode.FileSearchOptions, token: vscode.CancellationToken): Promise<URI[]> {
					return Promise.resolve(reportedResults);
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
		test('if onlyFileScheme is set, do not call custom schemes', async () => {
			let fancySchemeCalled = false;
			await registerTestFileSearchProvider({
				provideFileSearchResults(query: vscode.FileSearchQuery, options: vscode.FileSearchOptions, token: vscode.CancellationToken): Promise<URI[]> {
					fancySchemeCalled = true;
					return Promise.resolve([]);
				}
			}, fancyScheme);

			const query: ISearchQuery = {
				type: QueryType.File,
				filePattern: '',
				folderQueries: []
			};

			await runFileSearch(query);
			assert(!fancySchemeCalled);
		});
	});

	suite('Text:', () => {

		function makePreview(text: string): vscode.TextSearchMatch['preview'] {
			return {
				matches: [new Range(0, 0, 0, text.length)],
				text
			};
		}

		function makeTextResult(baseFolder: URI, relativePath: string): vscode.TextSearchMatch {
			return {
				preview: makePreview('foo'),
				ranges: [new Range(0, 0, 0, 3)],
				uri: joinPath(baseFolder, relativePath)
			};
		}

		function getSimpleQuery(queryText: string): ITextQuery {
			return {
				type: QueryType.Text,
				contentPattern: getPattern(queryText),

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
			for (const fileMatch of actual) {
				// Make relative
				for (const lineResult of fileMatch.results!) {
					if (resultIsMatch(lineResult)) {
						actualTextSearchResults.push({
							preview: {
								text: lineResult.previewText,
								matches: mapArrayOrNot(
									lineResult.rangeLocations.map(r => r.preview),
									m => new Range(m.startLineNumber, m.startColumn, m.endLineNumber, m.endColumn))
							},
							ranges: mapArrayOrNot(
								lineResult.rangeLocations.map(r => r.source),
								r => new Range(r.startLineNumber, r.startColumn, r.endLineNumber, r.endColumn),
							),
							uri: fileMatch.resource
						});
					} else {
						actualTextSearchResults.push(<vscode.TextSearchContext>{
							text: lineResult.text,
							lineNumber: lineResult.lineNumber,
							uri: fileMatch.resource
						});
					}
				}
			}

			const rangeToString = (r: vscode.Range) => `(${r.start.line}, ${r.start.character}), (${r.end.line}, ${r.end.character})`;

			const makeComparable = (results: vscode.TextSearchResult[]) => results
				.sort((a, b) => {
					const compareKeyA = a.uri.toString() + ': ' + (extensionResultIsMatch(a) ? a.preview.text : a.text);
					const compareKeyB = b.uri.toString() + ': ' + (extensionResultIsMatch(b) ? b.preview.text : b.text);
					return compareKeyB.localeCompare(compareKeyA);
				})
				.map(r => extensionResultIsMatch(r) ? {
					uri: r.uri.toString(),
					range: mapArrayOrNot(r.ranges, rangeToString),
					preview: {
						text: r.preview.text,
						match: null // Don't care about this right now
					}
				} : {
					uri: r.uri.toString(),
					text: r.text,
					lineNumber: r.lineNumber
				});

			return assert.deepStrictEqual(
				makeComparable(actualTextSearchResults),
				makeComparable(expected));
		}

		test('no results', async () => {
			await registerTestTextSearchProvider({
				provideTextSearchResults(query: vscode.TextSearchQuery, options: vscode.TextSearchOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Promise<vscode.TextSearchComplete> {
					return Promise.resolve(null!);
				}
			});

			const { results, stats } = await runTextSearch(getSimpleQuery('foo'));
			assert(!stats.limitHit);
			assert(!results.length);
		});

		test('basic results', async () => {
			const providedResults: vscode.TextSearchResult[] = [
				makeTextResult(rootFolderA, 'file1.ts'),
				makeTextResult(rootFolderA, 'file2.ts')
			];

			await registerTestTextSearchProvider({
				provideTextSearchResults(query: vscode.TextSearchQuery, options: vscode.TextSearchOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Promise<vscode.TextSearchComplete> {
					providedResults.forEach(r => progress.report(r));
					return Promise.resolve(null!);
				}
			});

			const { results, stats } = await runTextSearch(getSimpleQuery('foo'));
			assert(!stats.limitHit);
			assertResults(results, providedResults);
		});

		test('all provider calls get global include/excludes', async () => {
			await registerTestTextSearchProvider({
				provideTextSearchResults(query: vscode.TextSearchQuery, options: vscode.TextSearchOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Promise<vscode.TextSearchComplete> {
					assert.strictEqual(options.includes.length, 1);
					assert.strictEqual(options.excludes.length, 1);
					return Promise.resolve(null!);
				}
			});

			const query: ITextQuery = {
				type: QueryType.Text,
				contentPattern: getPattern('foo'),

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

			await runTextSearch(query);
		});

		test('global/local include/excludes combined', async () => {
			await registerTestTextSearchProvider({
				provideTextSearchResults(query: vscode.TextSearchQuery, options: vscode.TextSearchOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Promise<vscode.TextSearchComplete> {
					if (options.folder.toString() === rootFolderA.toString()) {
						assert.deepStrictEqual(options.includes.sort(), ['*.ts', 'foo']);
						assert.deepStrictEqual(options.excludes.sort(), ['*.js', 'bar']);
					} else {
						assert.deepStrictEqual(options.includes.sort(), ['*.ts']);
						assert.deepStrictEqual(options.excludes.sort(), ['*.js']);
					}

					return Promise.resolve(null!);
				}
			});

			const query: ITextQuery = {
				type: QueryType.Text,
				contentPattern: getPattern('foo'),

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
						excludePattern: [{
							pattern: {
								'bar': true
							}
						}]
					},
					{ folder: rootFolderB }
				]
			};

			await runTextSearch(query);
		});

		test('include/excludes resolved correctly', async () => {
			await registerTestTextSearchProvider({
				provideTextSearchResults(query: vscode.TextSearchQuery, options: vscode.TextSearchOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Promise<vscode.TextSearchComplete> {
					assert.deepStrictEqual(options.includes.sort(), ['*.jsx', '*.ts']);
					assert.deepStrictEqual(options.excludes.sort(), []);

					return Promise.resolve(null!);
				}
			});

			const query: ISearchQuery = {
				type: QueryType.Text,
				contentPattern: getPattern('foo'),

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
						excludePattern: [{
							pattern: {
								'*.js': false
							}
						}]
					}
				]
			};

			await runTextSearch(query);
		});

		test('provider fail', async () => {
			await registerTestTextSearchProvider({
				provideTextSearchResults(query: vscode.TextSearchQuery, options: vscode.TextSearchOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Promise<vscode.TextSearchComplete> {
					throw new Error('Provider fail');
				}
			});

			try {
				await runTextSearch(getSimpleQuery('foo'));
				assert(false, 'Expected to fail');
			} catch {
				// expected to fail
			}
		});

		test('basic sibling clause', async () => {
			// eslint-disable-next-line local/code-no-any-casts
			(mockPFS as any).Promises = {
				readdir: (_path: string): any => {
					if (_path === rootFolderA.fsPath) {
						return Promise.resolve([
							'file1.js',
							'file1.ts'
						]);
					} else {
						return Promise.reject(new Error('Wrong path'));
					}
				}
			};

			const providedResults: vscode.TextSearchResult[] = [
				makeTextResult(rootFolderA, 'file1.js'),
				makeTextResult(rootFolderA, 'file1.ts')
			];

			await registerTestTextSearchProvider({
				provideTextSearchResults(query: vscode.TextSearchQuery, options: vscode.TextSearchOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Promise<vscode.TextSearchComplete> {
					providedResults.forEach(r => progress.report(r));
					return Promise.resolve(null!);
				}
			});

			const query: ISearchQuery = {
				type: QueryType.Text,
				contentPattern: getPattern('foo'),

				excludePattern: {
					'*.js': {
						when: '$(basename).ts'
					}
				},

				folderQueries: [
					{ folder: rootFolderA }
				]
			};

			const { results } = await runTextSearch(query);
			assertResults(results, providedResults.slice(1));
		});

		test('multiroot sibling clause', async () => {
			// eslint-disable-next-line local/code-no-any-casts
			(mockPFS as any).Promises = {
				readdir: (_path: string): any => {
					if (_path === joinPath(rootFolderA, 'folder').fsPath) {
						return Promise.resolve([
							'fileA.scss',
							'fileA.css',
							'file2.css'
						]);
					} else if (_path === rootFolderB.fsPath) {
						return Promise.resolve([
							'fileB.ts',
							'fileB.js',
							'file3.js'
						]);
					} else {
						return Promise.reject(new Error('Wrong path'));
					}
				}
			};

			await registerTestTextSearchProvider({
				provideTextSearchResults(query: vscode.TextSearchQuery, options: vscode.TextSearchOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Promise<vscode.TextSearchComplete> {
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
					return Promise.resolve(null!);
				}
			});

			const query: ISearchQuery = {
				type: QueryType.Text,
				contentPattern: getPattern('foo'),

				excludePattern: {
					'*.js': {
						when: '$(basename).ts'
					},
					'*.css': true
				},
				folderQueries: [
					{
						folder: rootFolderA,
						excludePattern: [{
							pattern: {
								'folder/*.css': {
									when: '$(basename).scss'
								}
							}
						}]
					},
					{
						folder: rootFolderB,
						excludePattern: [{
							pattern: {
								'*.js': false
							}
						}]
					}
				]
			};

			const { results } = await runTextSearch(query);
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
				provideTextSearchResults(query: vscode.TextSearchQuery, options: vscode.TextSearchOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Promise<vscode.TextSearchComplete> {
					providedResults.forEach(r => progress.report(r));
					return Promise.resolve(null!);
				}
			});

			const query: ISearchQuery = {
				type: QueryType.Text,
				contentPattern: getPattern('foo'),

				includePattern: {
					'*.ts': true
				},

				folderQueries: [
					{ folder: rootFolderA }
				]
			};

			const { results } = await runTextSearch(query);
			assertResults(results, providedResults.slice(1));
		});

		test('max results = 1', async () => {
			const providedResults: vscode.TextSearchResult[] = [
				makeTextResult(rootFolderA, 'file1.ts'),
				makeTextResult(rootFolderA, 'file2.ts')
			];

			let wasCanceled = false;
			await registerTestTextSearchProvider({
				provideTextSearchResults(query: vscode.TextSearchQuery, options: vscode.TextSearchOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Promise<vscode.TextSearchComplete> {
					disposables.add(token.onCancellationRequested(() => wasCanceled = true));
					providedResults.forEach(r => progress.report(r));
					return Promise.resolve(null!);
				}
			});

			const query: ISearchQuery = {
				type: QueryType.Text,
				contentPattern: getPattern('foo'),

				maxResults: 1,

				folderQueries: [
					{ folder: rootFolderA }
				]
			};

			const { results, stats } = await runTextSearch(query);
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
				provideTextSearchResults(query: vscode.TextSearchQuery, options: vscode.TextSearchOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Promise<vscode.TextSearchComplete> {
					disposables.add(token.onCancellationRequested(() => wasCanceled = true));
					providedResults.forEach(r => progress.report(r));
					return Promise.resolve(null!);
				}
			});

			const query: ISearchQuery = {
				type: QueryType.Text,
				contentPattern: getPattern('foo'),

				maxResults: 2,

				folderQueries: [
					{ folder: rootFolderA }
				]
			};

			const { results, stats } = await runTextSearch(query);
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
				provideTextSearchResults(query: vscode.TextSearchQuery, options: vscode.TextSearchOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Promise<vscode.TextSearchComplete> {
					disposables.add(token.onCancellationRequested(() => wasCanceled = true));
					providedResults.forEach(r => progress.report(r));
					return Promise.resolve(null!);
				}
			});

			const query: ISearchQuery = {
				type: QueryType.Text,
				contentPattern: getPattern('foo'),

				maxResults: 2,

				folderQueries: [
					{ folder: rootFolderA }
				]
			};

			const { results, stats } = await runTextSearch(query);
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
				provideTextSearchResults(query: vscode.TextSearchQuery, options: vscode.TextSearchOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Promise<vscode.TextSearchComplete> {
					providedResults.forEach(r => progress.report(r));
					return Promise.resolve({ limitHit: true });
				}
			});

			const query: ISearchQuery = {
				type: QueryType.Text,
				contentPattern: getPattern('foo'),

				maxResults: 1000,

				folderQueries: [
					{ folder: rootFolderA }
				]
			};

			const { results, stats } = await runTextSearch(query);
			assert(stats.limitHit, 'Expected to return limitHit');
			assertResults(results, providedResults);
		});

		test('multiroot max results', async () => {
			let cancels = 0;
			await registerTestTextSearchProvider({
				async provideTextSearchResults(query: vscode.TextSearchQuery, options: vscode.TextSearchOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Promise<vscode.TextSearchComplete> {
					disposables.add(token.onCancellationRequested(() => cancels++));
					await new Promise(r => process.nextTick(r));
					[
						'file1.ts',
						'file2.ts',
						'file3.ts',
					].forEach(f => progress.report(makeTextResult(options.folder, f)));
					return null!;
				}
			});

			const query: ISearchQuery = {
				type: QueryType.Text,
				contentPattern: getPattern('foo'),

				maxResults: 2,

				folderQueries: [
					{ folder: rootFolderA },
					{ folder: rootFolderB }
				]
			};

			const { results } = await runTextSearch(query);
			assert.strictEqual(results.length, 2);
			assert.strictEqual(cancels, 2);
		});

		test('works with non-file schemes', async () => {
			const providedResults: vscode.TextSearchResult[] = [
				makeTextResult(fancySchemeFolderA, 'file1.ts'),
				makeTextResult(fancySchemeFolderA, 'file2.ts'),
				makeTextResult(fancySchemeFolderA, 'file3.ts')
			];

			await registerTestTextSearchProvider({
				provideTextSearchResults(query: vscode.TextSearchQuery, options: vscode.TextSearchOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Promise<vscode.TextSearchComplete> {
					providedResults.forEach(r => progress.report(r));
					return Promise.resolve(null!);
				}
			}, fancyScheme);

			const query: ISearchQuery = {
				type: QueryType.Text,
				contentPattern: getPattern('foo'),

				folderQueries: [
					{ folder: fancySchemeFolderA }
				]
			};

			const { results } = await runTextSearch(query);
			assertResults(results, providedResults);
		});
	});
});

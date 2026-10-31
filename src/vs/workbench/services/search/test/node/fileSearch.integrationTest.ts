/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import { tmpdir } from 'os';
import { FileAccess } from '../../../../../base/common/network.js';
import * as path from '../../../../../base/common/path.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { flakySuite, getRandomTestPath } from '../../../../../base/test/node/testUtils.js';
import { IFileQuery, IFileSearchStats, IFolderQuery, ISearchEngineStats, ISerializedFileMatch, ISerializedSearchProgressItem, isProgressMessage, QueryType } from '../../common/search.js';
import { SearchService } from '../../node/rawSearchService.js';

const TEST_FIXTURES = path.normalize(FileAccess.asFileUri('vs/workbench/services/search/test/node/fixtures').fsPath);
const TEST_FIXTURES2 = path.normalize(FileAccess.asFileUri('vs/workbench/services/search/test/node/fixtures2').fsPath);
const EXAMPLES_FIXTURES = path.join(TEST_FIXTURES, 'examples');
const MORE_FIXTURES = path.join(TEST_FIXTURES, 'more');
const TEST_ROOT_FOLDER: IFolderQuery = { folder: URI.file(TEST_FIXTURES) };
const ROOT_FOLDER_QUERY: IFolderQuery[] = [
	TEST_ROOT_FOLDER
];

const MULTIROOT_QUERIES: IFolderQuery[] = [
	{ folder: URI.file(EXAMPLES_FIXTURES), folderName: 'examples_folder' },
	{ folder: URI.file(MORE_FIXTURES) }
];

const numThreads = undefined;

async function doSearchTest(query: IFileQuery, expectedResultCount: number | Function): Promise<void> {
	const results = await doSearch(query);
	assert.strictEqual(results.length, expectedResultCount, `rg ${results.length} !== ${expectedResultCount}`);
}

async function doSearch(query: IFileQuery): Promise<ISerializedSearchProgressItem[]> {
	const svc = new SearchService();

	const results: ISerializedSearchProgressItem[] = [];
	await svc.doFileSearch(query, numThreads, e => {
		if (!isProgressMessage(e)) {
			if (Array.isArray(e)) {
				results.push(...e);
			} else {
				results.push(e);
			}
		}
	});

	return results;
}

async function getRelativePaths(query: IFileQuery, folder: string): Promise<string[]> {
	const results = await doSearch(query);
	return results.map(result => path.relative(folder, (result as ISerializedFileMatch).path!).replace(/\\/g, '/')).sort();
}

flakySuite('FileSearch-integration', function () {

	test('File - simple', () => {
		const config: IFileQuery = {
			type: QueryType.File,
			folderQueries: ROOT_FOLDER_QUERY
		};

		return doSearchTest(config, 14);
	});

	test('File - filepattern', () => {
		const config: IFileQuery = {
			type: QueryType.File,
			folderQueries: ROOT_FOLDER_QUERY,
			filePattern: 'anotherfile'
		};

		return doSearchTest(config, 1);
	});

	test('File - exclude', () => {
		const config: IFileQuery = {
			type: QueryType.File,
			folderQueries: ROOT_FOLDER_QUERY,
			filePattern: 'file',
			excludePattern: { '**/anotherfolder/**': true }
		};

		return doSearchTest(config, 2);
	});

	test('File - multiroot', () => {
		const config: IFileQuery = {
			type: QueryType.File,
			folderQueries: MULTIROOT_QUERIES,
			filePattern: 'file',
			excludePattern: { '**/anotherfolder/**': true }
		};

		return doSearchTest(config, 2);
	});

	test('File - multiroot with folder name', () => {
		const config: IFileQuery = {
			type: QueryType.File,
			folderQueries: MULTIROOT_QUERIES,
			filePattern: 'examples_folder anotherfile'
		};

		return doSearchTest(config, 1);
	});

	test('File - multiroot with folder name and sibling exclude', () => {
		const config: IFileQuery = {
			type: QueryType.File,
			folderQueries: [
				{ folder: URI.file(TEST_FIXTURES), folderName: 'folder1' },
				{ folder: URI.file(TEST_FIXTURES2) }
			],
			filePattern: 'folder1 site',
			excludePattern: { '*.css': { when: '$(basename).less' } }
		};

		return doSearchTest(config, 1);
	});

	test('File - exclude exception re-includes a folder below an excluded folder', async () => {
		const config: IFileQuery = {
			type: QueryType.File,
			folderQueries: ROOT_FOLDER_QUERY,
			excludePattern: { 'examples': true, '!examples/subfolder/anotherfolder': true }
		};

		const paths = await getRelativePaths(config, TEST_FIXTURES);
		assert.deepStrictEqual(paths.filter(p => p.startsWith('examples/')), ['examples/subfolder/anotherfolder/anotherfile.txt']);
		assert.strictEqual(paths.length, 9);
	});

	test('File - exclude exception run is reported in the stats', async () => {
		const complete = await new SearchService().doFileSearch({
			type: QueryType.File,
			folderQueries: ROOT_FOLDER_QUERY,
			excludePattern: { 'examples': true, '!examples/subfolder/anotherfolder': true }
		}, numThreads, () => { });
		const stats = (complete.stats as IFileSearchStats).detailStats as ISearchEngineStats;

		assert.deepStrictEqual({ runs: stats.excludeExceptionRuns, hasTime: stats.excludeExceptionTime! > 0 }, { runs: 1, hasTime: true });
	});

	test('File - exclude exception re-includes a gitignored file', async () => {
		const root = getRandomTestPath(tmpdir(), 'vsctests', 'filesearch-exclude-exceptions');
		try {
			await fs.promises.mkdir(path.join(root, 'build'), { recursive: true });
			await fs.promises.mkdir(path.join(root, 'node_modules', '@types', 'node'), { recursive: true });
			await fs.promises.mkdir(path.join(root, 'node_modules', 'react'), { recursive: true });
			await fs.promises.writeFile(path.join(root, '.gitignore'), 'build/\n');
			await fs.promises.writeFile(path.join(root, 'build', 'keep.txt'), '');
			await fs.promises.writeFile(path.join(root, 'build', 'drop.txt'), '');
			await fs.promises.writeFile(path.join(root, 'node_modules', '@types', 'node', 'index.d.ts'), '');
			await fs.promises.writeFile(path.join(root, 'node_modules', 'react', 'index.js'), '');
			await fs.promises.writeFile(path.join(root, 'index.js'), '');

			const paths = await getRelativePaths({
				type: QueryType.File,
				folderQueries: [{ folder: URI.file(root), disregardIgnoreFiles: false }],
				excludePattern: { 'node_modules': true, '!node_modules/@types': true, '!build/keep.txt': true }
			}, root);

			assert.deepStrictEqual(paths, ['.gitignore', 'build/keep.txt', 'index.js', 'node_modules/@types/node/index.d.ts']);

			const pathsWithUnanchoredException = await getRelativePaths({
				type: QueryType.File,
				folderQueries: [{ folder: URI.file(root), disregardIgnoreFiles: false }],
				excludePattern: { 'node_modules': true, '!**/keep.txt': true, '!**/@types': true }
			}, root);

			assert.deepStrictEqual(pathsWithUnanchoredException, ['.gitignore', 'build/keep.txt', 'index.js', 'node_modules/@types/node/index.d.ts']);
		} finally {
			await fs.promises.rm(root, { recursive: true, force: true });
		}
	});

	test('File - exclude exception results respect folder includes and nested root folders', async () => {
		const withFolderInclude = await getRelativePaths({
			type: QueryType.File,
			folderQueries: [{ folder: URI.file(TEST_FIXTURES), includePattern: { 'more/**': true } }],
			excludePattern: { 'examples': true, '!examples/subfolder/anotherfolder': true }
		}, TEST_FIXTURES);

		const withNestedRoot = await getRelativePaths({
			type: QueryType.File,
			folderQueries: [{ folder: URI.file(TEST_FIXTURES) }, { folder: URI.file(EXAMPLES_FIXTURES) }],
			filePattern: 'small',
			excludePattern: { '!**/small.js': true }
		}, TEST_FIXTURES);

		assert.deepStrictEqual({ withFolderInclude, withNestedRoot }, {
			withFolderInclude: ['more/file.txt'],
			withNestedRoot: ['examples/small.js'],
		});
	});

	test('File - exists queries only count exclude exception results that pass the includes', async () => {
		const exists = async (includePattern: string) => {
			const svc = new SearchService();
			const complete = await svc.doFileSearch({
				type: QueryType.File,
				folderQueries: [{ folder: URI.file(TEST_FIXTURES), includePattern: { [includePattern]: true } }],
				excludePattern: { 'examples': true, '!examples/small.js': true },
				exists: true
			}, numThreads, () => { });
			return complete.limitHit;
		};

		assert.deepStrictEqual([await exists('nonexistent/**'), await exists('examples/**')], [false, true]);
	});

	test('File - exclude exception with different casing reports each file once with its casing on disk', async () => {
		const paths = await getRelativePaths({
			type: QueryType.File,
			folderQueries: ROOT_FOLDER_QUERY,
			filePattern: 'small',
			ignoreGlobCase: true,
			excludePattern: { '!EXAMPLES/small.js': true }
		}, TEST_FIXTURES);

		assert.deepStrictEqual(paths, ['examples/small.js']);
	});

	test('File - exclude exception with a parent folder segment does not search outside the folder', async () => {
		const root = getRandomTestPath(tmpdir(), 'vsctests', 'filesearch-exclude-exception-parent');
		try {
			await fs.promises.mkdir(path.join(root, 'folder'), { recursive: true });
			await fs.promises.writeFile(path.join(root, 'folder', 'a.txt'), '');
			await fs.promises.writeFile(path.join(root, 'secret.txt'), '');

			const folder = path.join(root, 'folder');
			const paths = await getRelativePaths({
				type: QueryType.File,
				folderQueries: [{ folder: URI.file(folder) }],
				excludePattern: { '*.txt': true, '!../secret.txt': true }
			}, folder);

			assert.deepStrictEqual(paths, []);
		} finally {
			await fs.promises.rm(root, { recursive: true, force: true });
		}
	});

	(isWindows ? test.skip : test)('File - exclude exception does not follow symbolic links when they are ignored', async () => {
		const root = getRandomTestPath(tmpdir(), 'vsctests', 'filesearch-exclude-exception-symlinks');
		try {
			await fs.promises.mkdir(path.join(root, 'target'), { recursive: true });
			await fs.promises.writeFile(path.join(root, 'target', 'file.txt'), '');
			await fs.promises.symlink(path.join(root, 'target'), path.join(root, 'link'));

			const paths = await getRelativePaths({
				type: QueryType.File,
				folderQueries: [{ folder: URI.file(root), ignoreSymlinks: true }],
				excludePattern: { 'target': true, '!link': true }
			}, root);

			assert.deepStrictEqual(paths, []);
		} finally {
			await fs.promises.rm(root, { recursive: true, force: true });
		}
	});
});

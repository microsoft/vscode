/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { FileAccess } from '../../../../../base/common/network.js';
import * as path from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { flakySuite } from '../../../../../base/test/node/testUtils.js';
import { IFileQuery, IFolderQuery, ISerializedSearchProgressItem, isProgressMessage, QueryType } from '../../common/search.js';
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

	assert.strictEqual(results.length, expectedResultCount, `rg ${results.length} !== ${expectedResultCount}`);
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
});

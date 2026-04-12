/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { FileAccess } from '../../../../../base/common/network.js';
import * as path from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { flakySuite } from '../../../../../base/test/node/testUtils.js';
import { isProgressMessage } from '../../common/search.js';
import { SearchService } from '../../node/rawSearchService.js';
const TEST_FIXTURES = path.normalize(FileAccess.asFileUri('vs/workbench/services/search/test/node/fixtures').fsPath);
const TEST_FIXTURES2 = path.normalize(FileAccess.asFileUri('vs/workbench/services/search/test/node/fixtures2').fsPath);
const EXAMPLES_FIXTURES = path.join(TEST_FIXTURES, 'examples');
const MORE_FIXTURES = path.join(TEST_FIXTURES, 'more');
const TEST_ROOT_FOLDER = { folder: URI.file(TEST_FIXTURES) };
const ROOT_FOLDER_QUERY = [
    TEST_ROOT_FOLDER
];
const MULTIROOT_QUERIES = [
    { folder: URI.file(EXAMPLES_FIXTURES), folderName: 'examples_folder' },
    { folder: URI.file(MORE_FIXTURES) }
];
const numThreads = undefined;
async function doSearchTest(query, expectedResultCount) {
    const svc = new SearchService();
    const results = [];
    await svc.doFileSearch(query, numThreads, e => {
        if (!isProgressMessage(e)) {
            if (Array.isArray(e)) {
                results.push(...e);
            }
            else {
                results.push(e);
            }
        }
    });
    assert.strictEqual(results.length, expectedResultCount, `rg ${results.length} !== ${expectedResultCount}`);
}
flakySuite('FileSearch-integration', function () {
    test('File - simple', () => {
        const config = {
            type: 1 /* QueryType.File */,
            folderQueries: ROOT_FOLDER_QUERY
        };
        return doSearchTest(config, 14);
    });
    test('File - filepattern', () => {
        const config = {
            type: 1 /* QueryType.File */,
            folderQueries: ROOT_FOLDER_QUERY,
            filePattern: 'anotherfile'
        };
        return doSearchTest(config, 1);
    });
    test('File - exclude', () => {
        const config = {
            type: 1 /* QueryType.File */,
            folderQueries: ROOT_FOLDER_QUERY,
            filePattern: 'file',
            excludePattern: { '**/anotherfolder/**': true }
        };
        return doSearchTest(config, 2);
    });
    test('File - multiroot', () => {
        const config = {
            type: 1 /* QueryType.File */,
            folderQueries: MULTIROOT_QUERIES,
            filePattern: 'file',
            excludePattern: { '**/anotherfolder/**': true }
        };
        return doSearchTest(config, 2);
    });
    test('File - multiroot with folder name', () => {
        const config = {
            type: 1 /* QueryType.File */,
            folderQueries: MULTIROOT_QUERIES,
            filePattern: 'examples_folder anotherfile'
        };
        return doSearchTest(config, 1);
    });
    test('File - multiroot with folder name and sibling exclude', () => {
        const config = {
            type: 1 /* QueryType.File */,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmlsZVNlYXJjaC5pbnRlZ3JhdGlvblRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvc2VhcmNoL3Rlc3Qvbm9kZS9maWxlU2VhcmNoLmludGVncmF0aW9uVGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ25FLE9BQU8sS0FBSyxJQUFJLE1BQU0sb0NBQW9DLENBQUM7QUFDM0QsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN4RSxPQUFPLEVBQTJELGlCQUFpQixFQUFhLE1BQU0sd0JBQXdCLENBQUM7QUFDL0gsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBRS9ELE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxpREFBaUQsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQ3JILE1BQU0sY0FBYyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxrREFBa0QsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQ3ZILE1BQU0saUJBQWlCLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsVUFBVSxDQUFDLENBQUM7QUFDL0QsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsTUFBTSxDQUFDLENBQUM7QUFDdkQsTUFBTSxnQkFBZ0IsR0FBaUIsRUFBRSxNQUFNLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENB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
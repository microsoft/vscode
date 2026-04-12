/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as path from '../../../../../base/common/path.js';
import * as platform from '../../../../../base/common/platform.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { Engine as FileSearchEngine, FileWalker } from '../../node/fileSearch.js';
import { flakySuite } from '../../../../../base/test/node/testUtils.js';
import { FileAccess } from '../../../../../base/common/network.js';
const TEST_FIXTURES = path.normalize(FileAccess.asFileUri('vs/workbench/services/search/test/node/fixtures').fsPath);
const EXAMPLES_FIXTURES = URI.file(path.join(TEST_FIXTURES, 'examples'));
const MORE_FIXTURES = URI.file(path.join(TEST_FIXTURES, 'more'));
const TEST_ROOT_FOLDER = { folder: URI.file(TEST_FIXTURES) };
const ROOT_FOLDER_QUERY = [
    TEST_ROOT_FOLDER
];
const ROOT_FOLDER_QUERY_36438 = [
    { folder: URI.file(path.normalize(FileAccess.asFileUri('vs/workbench/services/search/test/node/fixtures2/36438').fsPath)) }
];
const MULTIROOT_QUERIES = [
    { folder: EXAMPLES_FIXTURES },
    { folder: MORE_FIXTURES }
];
flakySuite('FileSearchEngine', () => {
    test('Files: *.js', function (done) {
        const engine = new FileSearchEngine({
            type: 1 /* QueryType.File */,
            folderQueries: ROOT_FOLDER_QUERY,
            filePattern: '*.js'
        });
        let count = 0;
        engine.search((result) => {
            if (result) {
                count++;
            }
        }, () => { }, (error) => {
            assert.ok(!error);
            assert.strictEqual(count, 4);
            done();
        });
    });
    test('Files: maxResults', function (done) {
        const engine = new FileSearchEngine({
            type: 1 /* QueryType.File */,
            folderQueries: ROOT_FOLDER_QUERY,
            maxResults: 1
        });
        let count = 0;
        engine.search((result) => {
            if (result) {
                count++;
            }
        }, () => { }, (error) => {
            assert.ok(!error);
            assert.strictEqual(count, 1);
            done();
        });
    });
    test('Files: maxResults without Ripgrep', function (done) {
        const engine = new FileSearchEngine({
            type: 1 /* QueryType.File */,
            folderQueries: ROOT_FOLDER_QUERY,
            maxResults: 1,
        });
        let count = 0;
        engine.search((result) => {
            if (result) {
                count++;
            }
        }, () => { }, (error) => {
            assert.ok(!error);
            assert.strictEqual(count, 1);
            done();
        });
    });
    test('Files: exists', function (done) {
        const engine = new FileSearchEngine({
            type: 1 /* QueryType.File */,
            folderQueries: ROOT_FOLDER_QUERY,
            includePattern: { '**/file.txt': true },
            exists: true
        });
        let count = 0;
        engine.search((result) => {
            if (result) {
                count++;
            }
        }, () => { }, (error, complete) => {
            assert.ok(!error);
            assert.strictEqual(count, 0);
            assert.ok(complete.limitHit);
            done();
        });
    });
    test('Files: not exists', function (done) {
        const engine = new FileSearchEngine({
            type: 1 /* QueryType.File */,
            folderQueries: ROOT_FOLDER_QUERY,
            includePattern: { '**/nofile.txt': true },
            exists: true
        });
        let count = 0;
        engine.search((result) => {
            if (result) {
                count++;
            }
        }, () => { }, (error, complete) => {
            assert.ok(!error);
            assert.strictEqual(count, 0);
            assert.ok(!complete.limitHit);
            done();
        });
    });
    test('Files: exists without Ripgrep', function (done) {
        const engine = new FileSearchEngine({
            type: 1 /* QueryType.File */,
            folderQueries: ROOT_FOLDER_QUERY,
            includePattern: { '**/file.txt': true },
            exists: true,
        });
        let count = 0;
        engine.search((result) => {
            if (result) {
                count++;
            }
        }, () => { }, (error, complete) => {
            assert.ok(!error);
            assert.strictEqual(count, 0);
            assert.ok(complete.limitHit);
            done();
        });
    });
    test('Files: not exists without Ripgrep', function (done) {
        const engine = new FileSearchEngine({
            type: 1 /* QueryType.File */,
            folderQueries: ROOT_FOLDER_QUERY,
            includePattern: { '**/nofile.txt': true },
            exists: true,
        });
        let count = 0;
        engine.search((result) => {
            if (result) {
                count++;
            }
        }, () => { }, (error, complete) => {
            assert.ok(!error);
            assert.strictEqual(count, 0);
            assert.ok(!complete.limitHit);
            done();
        });
    });
    test('Files: examples/com*', function (done) {
        const engine = new FileSearchEngine({
            type: 1 /* QueryType.File */,
            folderQueries: ROOT_FOLDER_QUERY,
            filePattern: path.join('examples', 'com*')
        });
        let count = 0;
        engine.search((result) => {
            if (result) {
                count++;
            }
        }, () => { }, (error) => {
            assert.ok(!error);
            assert.strictEqual(count, 1);
            done();
        });
    });
    test('Files: examples (fuzzy)', function (done) {
        const engine = new FileSearchEngine({
            type: 1 /* QueryType.File */,
            folderQueries: ROOT_FOLDER_QUERY,
            filePattern: 'xl'
        });
        let count = 0;
        engine.search((result) => {
            if (result) {
                count++;
            }
        }, () => { }, (error) => {
            assert.ok(!error);
            assert.strictEqual(count, 7);
            done();
        });
    });
    test('Files: multiroot', function (done) {
        const engine = new FileSearchEngine({
            type: 1 /* QueryType.File */,
            folderQueries: MULTIROOT_QUERIES,
            filePattern: 'file'
        });
        let count = 0;
        engine.search((result) => {
            if (result) {
                count++;
            }
        }, () => { }, (error) => {
            assert.ok(!error);
            assert.strictEqual(count, 3);
            done();
        });
    });
    test('Files: multiroot with includePattern and maxResults', function (done) {
        const engine = new FileSearchEngine({
            type: 1 /* QueryType.File */,
            folderQueries: MULTIROOT_QUERIES,
            maxResults: 1,
            includePattern: {
                '*.txt': true,
                '*.js': true
            },
        });
        let count = 0;
        engine.search((result) => {
            if (result) {
                count++;
            }
        }, () => { }, (error, complete) => {
            assert.ok(!error);
            assert.strictEqual(count, 1);
            done();
        });
    });
    test('Files: multiroot with includePattern and exists', function (done) {
        const engine = new FileSearchEngine({
            type: 1 /* QueryType.File */,
            folderQueries: MULTIROOT_QUERIES,
            exists: true,
            includePattern: {
                '*.txt': true,
                '*.js': true
            },
        });
        let count = 0;
        engine.search((result) => {
            if (result) {
                count++;
            }
        }, () => { }, (error, complete) => {
            assert.ok(!error);
            assert.strictEqual(count, 0);
            assert.ok(complete.limitHit);
            done();
        });
    });
    test('Files: NPE (CamelCase)', function (done) {
        const engine = new FileSearchEngine({
            type: 1 /* QueryType.File */,
            folderQueries: ROOT_FOLDER_QUERY,
            filePattern: 'NullPE'
        });
        let count = 0;
        engine.search((result) => {
            if (result) {
                count++;
            }
        }, () => { }, (error) => {
            assert.ok(!error);
            assert.strictEqual(count, 1);
            done();
        });
    });
    test('Files: *.*', function (done) {
        const engine = new FileSearchEngine({
            type: 1 /* QueryType.File */,
            folderQueries: ROOT_FOLDER_QUERY,
            filePattern: '*.*'
        });
        let count = 0;
        engine.search((result) => {
            if (result) {
                count++;
            }
        }, () => { }, (error) => {
            assert.ok(!error);
            assert.strictEqual(count, 14);
            done();
        });
    });
    test('Files: *.as', function (done) {
        const engine = new FileSearchEngine({
            type: 1 /* QueryType.File */,
            folderQueries: ROOT_FOLDER_QUERY,
            filePattern: '*.as'
        });
        let count = 0;
        engine.search((result) => {
            if (result) {
                count++;
            }
        }, () => { }, (error) => {
            assert.ok(!error);
            assert.strictEqual(count, 0);
            done();
        });
    });
    test('Files: *.* without derived', function (done) {
        const engine = new FileSearchEngine({
            type: 1 /* QueryType.File */,
            folderQueries: ROOT_FOLDER_QUERY,
            filePattern: 'site.*',
            excludePattern: { '**/*.css': { 'when': '$(basename).less' } }
        });
        let count = 0;
        let res;
        engine.search((result) => {
            if (result) {
                count++;
            }
            res = result;
        }, () => { }, (error) => {
            assert.ok(!error);
            assert.strictEqual(count, 1);
            assert.strictEqual(path.basename(res.relativePath), 'site.less');
            done();
        });
    });
    test('Files: *.* exclude folder without wildcard', function (done) {
        const engine = new FileSearchEngine({
            type: 1 /* QueryType.File */,
            folderQueries: ROOT_FOLDER_QUERY,
            filePattern: '*.*',
            excludePattern: { 'examples': true }
        });
        let count = 0;
        engine.search((result) => {
            if (result) {
                count++;
            }
        }, () => { }, (error) => {
            assert.ok(!error);
            assert.strictEqual(count, 8);
            done();
        });
    });
    test('Files: exclude folder without wildcard #36438', function (done) {
        const engine = new FileSearchEngine({
            type: 1 /* QueryType.File */,
            folderQueries: ROOT_FOLDER_QUERY_36438,
            excludePattern: { 'modules': true }
        });
        let count = 0;
        engine.search((result) => {
            if (result) {
                count++;
            }
        }, () => { }, (error) => {
            assert.ok(!error);
            assert.strictEqual(count, 1);
            done();
        });
    });
    test('Files: include folder without wildcard #36438', function (done) {
        const engine = new FileSearchEngine({
            type: 1 /* QueryType.File */,
            folderQueries: ROOT_FOLDER_QUERY_36438,
            includePattern: { 'modules/**': true }
        });
        let count = 0;
        engine.search((result) => {
            if (result) {
                count++;
            }
        }, () => { }, (error) => {
            assert.ok(!error);
            assert.strictEqual(count, 1);
            done();
        });
    });
    test('Files: *.* exclude folder with leading wildcard', function (done) {
        const engine = new FileSearchEngine({
            type: 1 /* QueryType.File */,
            folderQueries: ROOT_FOLDER_QUERY,
            filePattern: '*.*',
            excludePattern: { '**/examples': true }
        });
        let count = 0;
        engine.search((result) => {
            if (result) {
                count++;
            }
        }, () => { }, (error) => {
            assert.ok(!error);
            assert.strictEqual(count, 8);
            done();
        });
    });
    test('Files: *.* exclude folder with trailing wildcard', function (done) {
        const engine = new FileSearchEngine({
            type: 1 /* QueryType.File */,
            folderQueries: ROOT_FOLDER_QUERY,
            filePattern: '*.*',
            excludePattern: { 'examples/**': true }
        });
        let count = 0;
        engine.search((result) => {
            if (result) {
                count++;
            }
        }, () => { }, (error) => {
            assert.ok(!error);
            assert.strictEqual(count, 8);
            done();
        });
    });
    test('Files: *.* exclude with unicode', function (done) {
        const engine = new FileSearchEngine({
            type: 1 /* QueryType.File */,
            folderQueries: ROOT_FOLDER_QUERY,
            filePattern: '*.*',
            excludePattern: { '**/üm laut汉语': true }
        });
        let count = 0;
        engine.search((result) => {
            if (result) {
                count++;
            }
        }, () => { }, (error) => {
            assert.ok(!error);
            assert.strictEqual(count, 13);
            done();
        });
    });
    test('Files: *.* include with unicode', function (done) {
        const engine = new FileSearchEngine({
            type: 1 /* QueryType.File */,
            folderQueries: ROOT_FOLDER_QUERY,
            filePattern: '*.*',
            includePattern: { '**/üm laut汉语/*': true }
        });
        let count = 0;
        engine.search((result) => {
            if (result) {
                count++;
            }
        }, () => { }, (error) => {
            assert.ok(!error);
            assert.strictEqual(count, 1);
            done();
        });
    });
    test('Files: multiroot with exclude', function (done) {
        const folderQueries = [
            {
                folder: EXAMPLES_FIXTURES,
                excludePattern: [{
                        pattern: { '**/anotherfile.txt': true }
                    }]
            },
            {
                folder: MORE_FIXTURES,
                excludePattern: [{
                        pattern: {
                            '**/file.txt': true
                        }
                    }]
            }
        ];
        const engine = new FileSearchEngine({
            type: 1 /* QueryType.File */,
            folderQueries,
            filePattern: '*'
        });
        let count = 0;
        engine.search((result) => {
            if (result) {
                count++;
            }
        }, () => { }, (error) => {
            assert.ok(!error);
            assert.strictEqual(count, 5);
            done();
        });
    });
    test('Files: Unicode and Spaces', function (done) {
        const engine = new FileSearchEngine({
            type: 1 /* QueryType.File */,
            folderQueries: ROOT_FOLDER_QUERY,
            filePattern: '汉语'
        });
        let count = 0;
        let res;
        engine.search((result) => {
            if (result) {
                count++;
            }
            res = result;
        }, () => { }, (error) => {
            assert.ok(!error);
            assert.strictEqual(count, 1);
            assert.strictEqual(path.basename(res.relativePath), '汉语.txt');
            done();
        });
    });
    test('Files: no results', function (done) {
        const engine = new FileSearchEngine({
            type: 1 /* QueryType.File */,
            folderQueries: ROOT_FOLDER_QUERY,
            filePattern: 'nofilematch'
        });
        let count = 0;
        engine.search((result) => {
            if (result) {
                count++;
            }
        }, () => { }, (error) => {
            assert.ok(!error);
            assert.strictEqual(count, 0);
            done();
        });
    });
    test('Files: relative path matched once', function (done) {
        const engine = new FileSearchEngine({
            type: 1 /* QueryType.File */,
            folderQueries: ROOT_FOLDER_QUERY,
            filePattern: path.normalize(path.join('examples', 'company.js'))
        });
        let count = 0;
        let res;
        engine.search((result) => {
            if (result) {
                count++;
            }
            res = result;
        }, () => { }, (error) => {
            assert.ok(!error);
            assert.strictEqual(count, 1);
            assert.strictEqual(path.basename(res.relativePath), 'company.js');
            done();
        });
    });
    test('Files: Include pattern, single files', function (done) {
        const engine = new FileSearchEngine({
            type: 1 /* QueryType.File */,
            folderQueries: ROOT_FOLDER_QUERY,
            includePattern: {
                'site.css': true,
                'examples/company.js': true,
                'examples/subfolder/subfile.txt': true
            }
        });
        const res = [];
        engine.search((result) => {
            res.push(result);
        }, () => { }, (error) => {
            assert.ok(!error);
            const basenames = res.map(r => path.basename(r.relativePath));
            assert.ok(basenames.indexOf('site.css') !== -1, `site.css missing in ${JSON.stringify(basenames)}`);
            assert.ok(basenames.indexOf('company.js') !== -1, `company.js missing in ${JSON.stringify(basenames)}`);
            assert.ok(basenames.indexOf('subfile.txt') !== -1, `subfile.txt missing in ${JSON.stringify(basenames)}`);
            done();
        });
    });
    test('Files: extraFiles only', function (done) {
        const engine = new FileSearchEngine({
            type: 1 /* QueryType.File */,
            folderQueries: [],
            extraFileResources: [
                URI.file(path.normalize(path.join(FileAccess.asFileUri('vs/workbench/services/search/test/node/fixtures').fsPath, 'site.css'))),
                URI.file(path.normalize(path.join(FileAccess.asFileUri('vs/workbench/services/search/test/node/fixtures').fsPath, 'examples', 'company.js'))),
                URI.file(path.normalize(path.join(FileAccess.asFileUri('vs/workbench/services/search/test/node/fixtures').fsPath, 'index.html')))
            ],
            filePattern: '*.js'
        });
        let count = 0;
        let res;
        engine.search((result) => {
            if (result) {
                count++;
            }
            res = result;
        }, () => { }, (error) => {
            assert.ok(!error);
            assert.strictEqual(count, 1);
            assert.strictEqual(path.basename(res.relativePath), 'company.js');
            done();
        });
    });
    test('Files: extraFiles only (with include)', function (done) {
        const engine = new FileSearchEngine({
            type: 1 /* QueryType.File */,
            folderQueries: [],
            extraFileResources: [
                URI.file(path.normalize(path.join(FileAccess.asFileUri('vs/workbench/services/search/test/node/fixtures').fsPath, 'site.css'))),
                URI.file(path.normalize(path.join(FileAccess.asFileUri('vs/workbench/services/search/test/node/fixtures').fsPath, 'examples', 'company.js'))),
                URI.file(path.normalize(path.join(FileAccess.asFileUri('vs/workbench/services/search/test/node/fixtures').fsPath, 'index.html')))
            ],
            filePattern: '*.*',
            includePattern: { '**/*.css': true }
        });
        let count = 0;
        let res;
        engine.search((result) => {
            if (result) {
                count++;
            }
            res = result;
        }, () => { }, (error) => {
            assert.ok(!error);
            assert.strictEqual(count, 1);
            assert.strictEqual(path.basename(res.relativePath), 'site.css');
            done();
        });
    });
    test('Files: extraFiles only (with exclude)', function (done) {
        const engine = new FileSearchEngine({
            type: 1 /* QueryType.File */,
            folderQueries: [],
            extraFileResources: [
                URI.file(path.normalize(path.join(FileAccess.asFileUri('vs/workbench/services/search/test/node/fixtures').fsPath, 'site.css'))),
                URI.file(path.normalize(path.join(FileAccess.asFileUri('vs/workbench/services/search/test/node/fixtures').fsPath, 'examples', 'company.js'))),
                URI.file(path.normalize(path.join(FileAccess.asFileUri('vs/workbench/services/search/test/node/fixtures').fsPath, 'index.html')))
            ],
            filePattern: '*.*',
            excludePattern: { '**/*.css': true }
        });
        let count = 0;
        engine.search((result) => {
            if (result) {
                count++;
            }
        }, () => { }, (error) => {
            assert.ok(!error);
            assert.strictEqual(count, 2);
            done();
        });
    });
    test('Files: no dupes in nested folders', function (done) {
        const engine = new FileSearchEngine({
            type: 1 /* QueryType.File */,
            folderQueries: [
                { folder: EXAMPLES_FIXTURES },
                { folder: joinPath(EXAMPLES_FIXTURES, 'subfolder') }
            ],
            filePattern: 'subfile.txt'
        });
        let count = 0;
        engine.search((result) => {
            if (result) {
                count++;
            }
        }, () => { }, (error) => {
            assert.ok(!error);
            assert.strictEqual(count, 1);
            done();
        });
    });
});
flakySuite('FileWalker', () => {
    (platform.isWindows ? test.skip : test)('Find: exclude subfolder', function (done) {
        const file0 = './more/file.txt';
        const file1 = './examples/subfolder/subfile.txt';
        const walker = new FileWalker({
            type: 1 /* QueryType.File */,
            folderQueries: ROOT_FOLDER_QUERY,
            excludePattern: { '**/something': true }
        });
        const cmd1 = walker.spawnFindCmd(TEST_ROOT_FOLDER);
        walker.readStdout(cmd1, 'utf8', (err1, stdout1) => {
            assert.strictEqual(err1, null);
            assert.notStrictEqual(stdout1.split('\n').indexOf(file0), -1, stdout1);
            assert.notStrictEqual(stdout1.split('\n').indexOf(file1), -1, stdout1);
            const walker = new FileWalker({
                type: 1 /* QueryType.File */,
                folderQueries: ROOT_FOLDER_QUERY,
                excludePattern: { '**/subfolder': true }
            });
            const cmd2 = walker.spawnFindCmd(TEST_ROOT_FOLDER);
            walker.readStdout(cmd2, 'utf8', (err2, stdout2) => {
                assert.strictEqual(err2, null);
                assert.notStrictEqual(stdout1.split('\n').indexOf(file0), -1, stdout1);
                assert.strictEqual(stdout2.split('\n').indexOf(file1), -1, stdout2);
                done();
            });
        });
    });
    (platform.isWindows ? test.skip : test)('Find: folder excludes', function (done) {
        const folderQueries = [
            {
                folder: URI.file(TEST_FIXTURES),
                excludePattern: [{
                        pattern: { '**/subfolder': true }
                    }]
            }
        ];
        const file0 = './more/file.txt';
        const file1 = './examples/subfolder/subfile.txt';
        const walker = new FileWalker({ type: 1 /* QueryType.File */, folderQueries });
        const cmd1 = walker.spawnFindCmd(folderQueries[0]);
        walker.readStdout(cmd1, 'utf8', (err1, stdout1) => {
            assert.strictEqual(err1, null);
            assert(outputContains(stdout1, file0), stdout1);
            assert(!outputContains(stdout1, file1), stdout1);
            done();
        });
    });
    (platform.isWindows ? test.skip : test)('Find: exclude multiple folders', function (done) {
        const file0 = './index.html';
        const file1 = './examples/small.js';
        const file2 = './more/file.txt';
        const walker = new FileWalker({ type: 1 /* QueryType.File */, folderQueries: ROOT_FOLDER_QUERY, excludePattern: { '**/something': true } });
        const cmd1 = walker.spawnFindCmd(TEST_ROOT_FOLDER);
        walker.readStdout(cmd1, 'utf8', (err1, stdout1) => {
            assert.strictEqual(err1, null);
            assert.notStrictEqual(stdout1.split('\n').indexOf(file0), -1, stdout1);
            assert.notStrictEqual(stdout1.split('\n').indexOf(file1), -1, stdout1);
            assert.notStrictEqual(stdout1.split('\n').indexOf(file2), -1, stdout1);
            const walker = new FileWalker({ type: 1 /* QueryType.File */, folderQueries: ROOT_FOLDER_QUERY, excludePattern: { '{**/examples,**/more}': true } });
            const cmd2 = walker.spawnFindCmd(TEST_ROOT_FOLDER);
            walker.readStdout(cmd2, 'utf8', (err2, stdout2) => {
                assert.strictEqual(err2, null);
                assert.notStrictEqual(stdout1.split('\n').indexOf(file0), -1, stdout1);
                assert.strictEqual(stdout2.split('\n').indexOf(file1), -1, stdout2);
                assert.strictEqual(stdout2.split('\n').indexOf(file2), -1, stdout2);
                done();
            });
        });
    });
    (platform.isWindows ? test.skip : test)('Find: exclude folder path suffix', function (done) {
        const file0 = './examples/company.js';
        const file1 = './examples/subfolder/subfile.txt';
        const walker = new FileWalker({ type: 1 /* QueryType.File */, folderQueries: ROOT_FOLDER_QUERY, excludePattern: { '**/examples/something': true } });
        const cmd1 = walker.spawnFindCmd(TEST_ROOT_FOLDER);
        walker.readStdout(cmd1, 'utf8', (err1, stdout1) => {
            assert.strictEqual(err1, null);
            assert.notStrictEqual(stdout1.split('\n').indexOf(file0), -1, stdout1);
            assert.notStrictEqual(stdout1.split('\n').indexOf(file1), -1, stdout1);
            const walker = new FileWalker({ type: 1 /* QueryType.File */, folderQueries: ROOT_FOLDER_QUERY, excludePattern: { '**/examples/subfolder': true } });
            const cmd2 = walker.spawnFindCmd(TEST_ROOT_FOLDER);
            walker.readStdout(cmd2, 'utf8', (err2, stdout2) => {
                assert.strictEqual(err2, null);
                assert.notStrictEqual(stdout1.split('\n').indexOf(file0), -1, stdout1);
                assert.strictEqual(stdout2.split('\n').indexOf(file1), -1, stdout2);
                done();
            });
        });
    });
    (platform.isWindows ? test.skip : test)('Find: exclude subfolder path suffix', function (done) {
        const file0 = './examples/subfolder/subfile.txt';
        const file1 = './examples/subfolder/anotherfolder/anotherfile.txt';
        const walker = new FileWalker({ type: 1 /* QueryType.File */, folderQueries: ROOT_FOLDER_QUERY, excludePattern: { '**/subfolder/something': true } });
        const cmd1 = walker.spawnFindCmd(TEST_ROOT_FOLDER);
        walker.readStdout(cmd1, 'utf8', (err1, stdout1) => {
            assert.strictEqual(err1, null);
            assert.notStrictEqual(stdout1.split('\n').indexOf(file0), -1, stdout1);
            assert.notStrictEqual(stdout1.split('\n').indexOf(file1), -1, stdout1);
            const walker = new FileWalker({ type: 1 /* QueryType.File */, folderQueries: ROOT_FOLDER_QUERY, excludePattern: { '**/subfolder/anotherfolder': true } });
            const cmd2 = walker.spawnFindCmd(TEST_ROOT_FOLDER);
            walker.readStdout(cmd2, 'utf8', (err2, stdout2) => {
                assert.strictEqual(err2, null);
                assert.notStrictEqual(stdout1.split('\n').indexOf(file0), -1, stdout1);
                assert.strictEqual(stdout2.split('\n').indexOf(file1), -1, stdout2);
                done();
            });
        });
    });
    (platform.isWindows ? test.skip : test)('Find: exclude folder path', function (done) {
        const file0 = './examples/company.js';
        const file1 = './examples/subfolder/subfile.txt';
        const walker = new FileWalker({ type: 1 /* QueryType.File */, folderQueries: ROOT_FOLDER_QUERY, excludePattern: { 'examples/something': true } });
        const cmd1 = walker.spawnFindCmd(TEST_ROOT_FOLDER);
        walker.readStdout(cmd1, 'utf8', (err1, stdout1) => {
            assert.strictEqual(err1, null);
            assert.notStrictEqual(stdout1.split('\n').indexOf(file0), -1, stdout1);
            assert.notStrictEqual(stdout1.split('\n').indexOf(file1), -1, stdout1);
            const walker = new FileWalker({ type: 1 /* QueryType.File */, folderQueries: ROOT_FOLDER_QUERY, excludePattern: { 'examples/subfolder': true } });
            const cmd2 = walker.spawnFindCmd(TEST_ROOT_FOLDER);
            walker.readStdout(cmd2, 'utf8', (err2, stdout2) => {
                assert.strictEqual(err2, null);
                assert.notStrictEqual(stdout1.split('\n').indexOf(file0), -1, stdout1);
                assert.strictEqual(stdout2.split('\n').indexOf(file1), -1, stdout2);
                done();
            });
        });
    });
    (platform.isWindows ? test.skip : test)('Find: exclude combination of paths', function (done) {
        const filesIn = [
            './examples/subfolder/subfile.txt',
            './examples/company.js',
            './index.html'
        ];
        const filesOut = [
            './examples/subfolder/anotherfolder/anotherfile.txt',
            './more/file.txt'
        ];
        const walker = new FileWalker({
            type: 1 /* QueryType.File */,
            folderQueries: ROOT_FOLDER_QUERY,
            excludePattern: {
                '**/subfolder/anotherfolder': true,
                '**/something/else': true,
                '**/more': true,
                '**/andmore': true
            }
        });
        const cmd1 = walker.spawnFindCmd(TEST_ROOT_FOLDER);
        walker.readStdout(cmd1, 'utf8', (err1, stdout1) => {
            assert.strictEqual(err1, null);
            for (const fileIn of filesIn) {
                assert.notStrictEqual(stdout1.split('\n').indexOf(fileIn), -1, stdout1);
            }
            for (const fileOut of filesOut) {
                assert.strictEqual(stdout1.split('\n').indexOf(fileOut), -1, stdout1);
            }
            done();
        });
    });
    function outputContains(stdout, ...files) {
        const lines = stdout.split('\n');
        return files.every(file => lines.indexOf(file) >= 0);
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VhcmNoLmludGVncmF0aW9uVGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9zZWFyY2gvdGVzdC9ub2RlL3NlYXJjaC5pbnRlZ3JhdGlvblRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sS0FBSyxJQUFJLE1BQU0sb0NBQW9DLENBQUM7QUFDM0QsT0FBTyxLQUFLLFFBQVEsTUFBTSx3Q0FBd0MsQ0FBQztBQUNuRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDbkUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRXhELE9BQU8sRUFBRSxNQUFNLElBQUksZ0JBQWdCLEVBQUUsVUFBVSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDbEYsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUVuRSxNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsaURBQWlELENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUNySCxNQUFNLGlCQUFpQixHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsVUFBVSxDQUFDLENBQUMsQ0FBQztBQUN6RSxNQUFNLGFBQWEsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUM7QUFDakUsTUFBTSxnQkFBZ0IsR0FBaUIsRUFBRSxNQUFNLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDO0FBQzNFLE1BQU0saUJBQWlCLEdBQW1CO0lBQ3pDLGdCQUFnQjtDQUNoQixDQUFDO0FBRUYsTUFBTSx1QkFBdUIsR0FBbUI7SUFDL0MsRUFBRSxNQUFNLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsd0RBQXdELENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFO0NBQzNILENBQUM7QUFFRixNQUFNLGlCQUFpQixHQUFtQjtJQUN6QyxFQUFFLE1BQU0sRUFBRSxpQkFBaUIsRUFBRTtJQUM3QixFQUFFLE1BQU0sRUFBRSxhQUFhLEVBQUU7Q0FDekIsQ0FBQztBQUVGLFVBQVUsQ0FBQyxrQkFBa0IsRUFBRSxHQUFHLEVBQUU7SUFFbkMsSUFBSSxDQUFDLGFBQWEsRUFBRSxVQUFVLElBQWdCO1FBQzdDLE1BQU0sTUFBTSxHQUFHLElBQUksZ0JBQWdCLENBQUM7WUFDbkMsSUFBSSx3QkFBZ0I7WUFDcEIsYUFBYSxFQUFFLGlCQUFpQjtZQUNoQyxXQUFXLEVBQUUsTUFBTTtTQUNuQixDQUFDLENBQUM7UUFFSCxJQUFJLEtBQUssR0FBRyxDQUFDLENBQUM7UUFDZCxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUU7WUFDeEIsSUFBSSxNQUFNLEVBQUUsQ0FBQztnQkFDWixLQUFLLEVBQUUsQ0FBQztZQUNULENBQUM7UUFDRixDQUFDLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUMsS0FBSyxFQUFFLEVBQUU7WUFDdkIsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2xCLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzdCLElBQUksRUFBRSxDQUFDO1FBQ1IsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxtQkFBbUIsRUFBRSxVQUFVLElBQWdCO1FBQ25ELE1BQU0sTUFBTSxHQUFHLElBQUksZ0JBQWdCLENBQUM7WUFDbkMsSUFBSSx3QkFBZ0I7WUFDcEIsYUFBYSxFQUFFLGlCQUFpQjtZQUNoQyxVQUFVLEVBQUUsQ0FBQztTQUNiLENBQUMsQ0FBQztRQUVILElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQztRQUNkLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRTtZQUN4QixJQUFJLE1BQU0sRUFBRSxDQUFDO2dCQUNaLEtBQUssRUFBRSxDQUFDO1lBQ1QsQ0FBQztRQUNGLENBQUMsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQyxLQUFLLEVBQUUsRUFBRTtZQUN2QixNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDbEIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDN0IsSUFBSSxFQUFFLENBQUM7UUFDUixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLG1DQUFtQyxFQUFFLFVBQVUsSUFBZ0I7UUFDbkUsTUFBTSxNQUFNLEdBQUcsSUFBSSxnQkFBZ0IsQ0FBQztZQUNuQyxJQUFJLHdCQUFnQjtZQUNwQixhQUFhLEVBQUUsaUJBQWlCO1lBQ2hDLFVBQVUsRUFBRSxDQUFDO1NBQ2IsQ0FBQyxDQUFDO1FBRUgsSUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDO1FBQ2QsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFO1lBQ3hCLElBQUksTUFBTSxFQUFFLENBQUM7Z0JBQ1osS0FBSyxFQUFFLENBQUM7WUFDVCxDQUFDO1FBQ0YsQ0FBQyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDLEtBQUssRUFBRSxFQUFFO1lBQ3ZCLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNsQixNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztZQUM3QixJQUFJLEVBQUUsQ0FBQztRQUNSLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsZUFBZSxFQUFFLFVBQVUsSUFBZ0I7UUFDL0MsTUFBTSxNQUFNLEdBQUcsSUFBSSxnQkFBZ0IsQ0FBQztZQUNuQyxJQUFJLHdCQUFnQjtZQUNwQixhQUFhLEVBQUUsaUJBQWlCO1lBQ2hDLGNBQWMsRUFBRSxFQUFFLGFBQWEsRUFBRSxJQUFJLEVBQUU7WUFDdkMsTUFBTSxFQUFFLElBQUk7U0FDWixDQUFDLENBQUM7UUFFSCxJQUFJLEtBQUssR0FBRyxDQUFDLENBQUM7UUFDZCxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUU7WUFDeEIsSUFBSSxNQUFNLEVBQUUsQ0FBQztnQkFDWixLQUFLLEVBQUUsQ0FBQztZQUNULENBQUM7UUFDRixDQUFDLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUMsS0FBSyxFQUFFLFFBQVEsRUFBRSxFQUFFO1lBQ2pDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNsQixNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztZQUM3QixNQUFNLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUM3QixJQUFJLEVBQUUsQ0FBQztRQUNSLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsbUJBQW1CLEVBQUUsVUFBVSxJQUFnQjtRQUNuRCxNQUFNLE1BQU0sR0FBRyxJQUFJLGdCQUFnQixDQUFDO1lBQ25DLElBQUksd0JBQWdCO1lBQ3BCLGFBQWEsRUFBRSxpQkFBaUI7WUFDaEMsY0FBYyxFQUFFLEVBQUUsZUFBZSxFQUFFLElBQUksRUFBRTtZQUN6QyxNQUFNLEVBQUUsSUFBSTtTQUNaLENBQUMsQ0FBQztRQUVILElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQztRQUNkLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRTtZQUN4QixJQUFJLE1BQU0sRUFBRSxDQUFDO2dCQUNaLEtBQUssRUFBRSxDQUFDO1lBQ1QsQ0FBQztRQUNGLENBQUMsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQyxLQUFLLEVBQUUsUUFBUSxFQUFFLEVBQUU7WUFDakMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2xCLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzdCLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDOUIsSUFBSSxFQUFFLENBQUM7UUFDUixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLCtCQUErQixFQUFFLFVBQVUsSUFBZ0I7UUFDL0QsTUFBTSxNQUFNLEdBQUcsSUFBSSxnQkFBZ0IsQ0FBQztZQUNuQyxJQUFJLHdCQUFnQjtZQUNwQixhQUFhLEVBQUUsaUJBQWlCO1lBQ2hDLGNBQWMsRUFBRSxFQUFFLGFBQWEsRUFBRSxJQUFJLEVBQUU7WUFDdkMsTUFBTSxFQUFFLElBQUk7U0FDWixDQUFDLENBQUM7UUFFSCxJQUFJLEtBQUssR0FBRyxDQUFDLENBQUM7UUFDZCxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUU7WUFDeEIsSUFBSSxNQUFNLEVBQUUsQ0FBQztnQkFDWixLQUFLLEVBQUUsQ0FBQztZQUNULENBQUM7UUFDRixDQUFDLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUMsS0FBSyxFQUFFLFFBQVEsRUFBRSxFQUFFO1lBQ2pDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNsQixNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztZQUM3QixNQUFNLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUM3QixJQUFJLEVBQUUsQ0FBQztRQUNSLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsbUNBQW1DLEVBQUUsVUFBVSxJQUFnQjtRQUNuRSxNQUFNLE1BQU0sR0FBRyxJQUFJLGdCQUFnQixDQUFDO1lBQ25DLElBQUksd0JBQWdCO1lBQ3BCLGFBQWEsRUFBRSxpQkFBaUI7WUFDaEMsY0FBYyxFQUFFLEVBQUUsZUFBZSxFQUFFLElBQUksRUFBRTtZQUN6QyxNQUFNLEVBQUUsSUFBSTtTQUNaLENBQUMsQ0FBQztRQUVILElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQztRQUNkLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRTtZQUN4QixJQUFJLE1BQU0sRUFBRSxDQUFDO2dCQUNaLEtBQUssRUFBRSxDQUFDO1lBQ1QsQ0FBQztRQUNGLENBQUMsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQyxLQUFLLEVBQUUsUUFBUSxFQUFFLEVBQUU7WUFDakMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2xCLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzdCLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDOUIsSUFBSSxFQUFFLENBQUM7UUFDUixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHNCQUFzQixFQUFFLFVBQVUsSUFBZ0I7UUFDdEQsTUFBTSxNQUFNLEdBQUcsSUFBSSxnQkFBZ0IsQ0FBQztZQUNuQyxJQUFJLHdCQUFnQjtZQUNwQixhQUFhLEVBQUUsaUJBQWlCO1lBQ2hDLFdBQVcsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxNQUFNLENBQUM7U0FDMUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDO1FBQ2QsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFO1lBQ3hCLElBQUksTUFBTSxFQUFFLENBQUM7Z0JBQ1osS0FBSyxFQUFFLENBQUM7WUFDVCxDQUFDO1FBQ0YsQ0FBQyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDLEtBQUssRUFBRSxFQUFFO1lBQ3ZCLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNsQixNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztZQUM3QixJQUFJLEVBQUUsQ0FBQztRQUNSLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMseUJBQXlCLEVBQUUsVUFBVSxJQUFnQjtRQUN6RCxNQUFNLE1BQU0sR0FBRyxJQUFJLGdCQUFnQixDQUFDO1lBQ25DLElBQUksd0JBQWdCO1lBQ3BCLGFBQWEsRUFBRSxpQkFBaUI7WUFDaEMsV0FBVyxFQUFFLElBQUk7U0FDakIsQ0FBQyxDQUFDO1FBRUgsSUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDO1FBQ2QsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFO1lBQ3hCLElBQUksTUFBTSxFQUFFLENBQUM7Z0JBQ1osS0FBSyxFQUFFLENBQUM7WUFDVCxDQUFDO1FBQ0YsQ0FBQyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDLEtBQUssRUFBRSxFQUFFO1lBQ3ZCLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNsQixNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztZQUM3QixJQUFJLEVBQUUsQ0FBQztRQUNSLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsa0JBQWtCLEVBQUUsVUFBVSxJQUFnQjtRQUNsRCxNQUFNLE1BQU0sR0FBRyxJQUFJLGdCQUFnQixDQUFDO1lBQ25DLElBQUksd0JBQWdCO1lBQ3BCLGFBQWEsRUFBRSxpQkFBaUI7WUFDaEMsV0FBVyxFQUFFLE1BQU07U0FDbkIsQ0FBQyxDQUFDO1FBRUgsSUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDO1FBQ2QsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFO1lBQ3hCLElBQUksTUFBTSxFQUFFLENBQUM7Z0JBQ1osS0FBSyxFQUFFLENBQUM7WUFDVCxDQUFDO1FBQ0YsQ0FBQyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDLEtBQUssRUFBRSxFQUFFO1lBQ3ZCLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNsQixNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztZQUM3QixJQUFJLEVBQUUsQ0FBQztRQUNSLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMscURBQXFELEVBQUUsVUFBVSxJQUFnQjtRQUNyRixNQUFNLE1BQU0sR0FBRyxJQUFJLGdCQUFnQixDQUFDO1lBQ25DLElBQUksd0JBQWdCO1lBQ3BCLGFBQWEsRUFBRSxpQkFBaUI7WUFDaEMsVUFBVSxFQUFFLENBQUM7WUFDYixjQUFjLEVBQUU7Z0JBQ2YsT0FBTyxFQUFFLElBQUk7Z0JBQ2IsTUFBTSxFQUFFLElBQUk7YUFDWjtTQUNELENBQUMsQ0FBQztRQUVILElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQztRQUNkLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRTtZQUN4QixJQUFJLE1BQU0sRUFBRSxDQUFDO2dCQUNaLEtBQUssRUFBRSxDQUFDO1lBQ1QsQ0FBQztRQUNGLENBQUMsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQyxLQUFLLEVBQUUsUUFBUSxFQUFFLEVBQUU7WUFDakMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2xCLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzdCLElBQUksRUFBRSxDQUFDO1FBQ1IsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxpREFBaUQsRUFBRSxVQUFVLElBQWdCO1FBQ2pGLE1BQU0sTUFBTSxHQUFHLElBQUksZ0JBQWdCLENBQUM7WUFDbkMsSUFBSSx3QkFBZ0I7WUFDcEIsYUFBYSxFQUFFLGlCQUFpQjtZQUNoQyxNQUFNLEVBQUUsSUFBSTtZQUNaLGNBQWMsRUFBRTtnQkFDZixPQUFPLEVBQUUsSUFBSTtnQkFDYixNQUFNLEVBQUUsSUFBSTthQUNaO1NBQ0QsQ0FBQyxDQUFDO1FBRUgsSUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDO1FBQ2QsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFO1lBQ3hCLElBQUksTUFBTSxFQUFFLENBQUM7Z0JBQ1osS0FBSyxFQUFFLENBQUM7WUFDVCxDQUFDO1FBQ0YsQ0FBQyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDLEtBQUssRUFBRSxRQUFRLEVBQUUsRUFBRTtZQUNqQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDbEIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDN0IsTUFBTSxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDN0IsSUFBSSxFQUFFLENBQUM7UUFDUixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHdCQUF3QixFQUFFLFVBQVUsSUFBZ0I7UUFDeEQsTUFBTSxNQUFNLEdBQUcsSUFBSSxnQkFBZ0IsQ0FBQztZQUNuQyxJQUFJLHdCQUFnQjtZQUNwQixhQUFhLEVBQUUsaUJBQWlCO1lBQ2hDLFdBQVcsRUFBRSxRQUFRO1NBQ3JCLENBQUMsQ0FBQztRQUVILElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQztRQUNkLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRTtZQUN4QixJQUFJLE1BQU0sRUFBRSxDQUFDO2dCQUNaLEtBQUssRUFBRSxDQUFDO1lBQ1QsQ0FBQztRQUNGLENBQUMsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQyxLQUFLLEVBQUUsRUFBRTtZQUN2QixNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDbEIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDN0IsSUFBSSxFQUFFLENBQUM7UUFDUixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLFlBQVksRUFBRSxVQUFVLElBQWdCO1FBQzVDLE1BQU0sTUFBTSxHQUFHLElBQUksZ0JBQWdCLENBQUM7WUFDbkMsSUFBSSx3QkFBZ0I7WUFDcEIsYUFBYSxFQUFFLGlCQUFpQjtZQUNoQyxXQUFXLEVBQUUsS0FBSztTQUNsQixDQUFDLENBQUM7UUFFSCxJQUFJLEtBQUssR0FBRyxDQUFDLENBQUM7UUFDZCxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUU7WUFDeEIsSUFBSSxNQUFNLEVBQUUsQ0FBQztnQkFDWixLQUFLLEVBQUUsQ0FBQztZQUNULENBQUM7UUFDRixDQUFDLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUMsS0FBSyxFQUFFLEVBQUU7WUFDdkIsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2xCLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQzlCLElBQUksRUFBRSxDQUFDO1FBQ1IsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxhQUFhLEVBQUUsVUFBVSxJQUFnQjtRQUM3QyxNQUFNLE1BQU0sR0FBRyxJQUFJLGdCQUFnQixDQUFDO1lBQ25DLElBQUksd0JBQWdCO1lBQ3BCLGFBQWEsRUFBRSxpQkFBaUI7WUFDaEMsV0FBVyxFQUFFLE1BQU07U0FDbkIsQ0FBQyxDQUFDO1FBRUgsSUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDO1FBQ2QsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFO1lBQ3hCLElBQUksTUFBTSxFQUFFLENBQUM7Z0JBQ1osS0FBSyxFQUFFLENBQUM7WUFDVCxDQUFDO1FBQ0YsQ0FBQyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDLEtBQUssRUFBRSxFQUFFO1lBQ3ZCLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNsQixNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztZQUM3QixJQUFJLEVBQUUsQ0FBQztRQUNSLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsNEJBQTRCLEVBQUUsVUFBVSxJQUFnQjtRQUM1RCxNQUFNLE1BQU0sR0FBRyxJQUFJLGdCQUFnQixDQUFDO1lBQ25DLElBQUksd0JBQWdCO1lBQ3BCLGFBQWEsRUFBRSxpQkFBaUI7WUFDaEMsV0FBVyxFQUFFLFFBQVE7WUFDckIsY0FBYyxFQUFFLEVBQUUsVUFBVSxFQUFFLEVBQUUsTUFBTSxFQUFFLGtCQUFrQixFQUFFLEVBQUU7U0FDOUQsQ0FBQyxDQUFDO1FBRUgsSUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDO1FBQ2QsSUFBSSxHQUFrQixDQUFDO1FBQ3ZCLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRTtZQUN4QixJQUFJLE1BQU0sRUFBRSxDQUFDO2dCQUNaLEtBQUssRUFBRSxDQUFDO1lBQ1QsQ0FBQztZQUNELEdBQUcsR0FBRyxNQUFNLENBQUM7UUFDZCxDQUFDLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUMsS0FBSyxFQUFFLEVBQUU7WUFDdkIsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2xCLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzdCLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLEVBQUUsV0FBVyxDQUFDLENBQUM7WUFDakUsSUFBSSxFQUFFLENBQUM7UUFDUixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDRDQUE0QyxFQUFFLFVBQVUsSUFBZ0I7UUFDNUUsTUFBTSxNQUFNLEdBQUcsSUFBSSxnQkFBZ0IsQ0FBQztZQUNuQyxJQUFJLHdCQUFnQjtZQUNwQixhQUFhLEVBQUUsaUJBQWlCO1lBQ2hDLFdBQVcsRUFBRSxLQUFLO1lBQ2xCLGNBQWMsRUFBRSxFQUFFLFVBQVUsRUFBRSxJQUFJLEVBQUU7U0FDcEMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDO1FBQ2QsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFO1lBQ3hCLElBQUksTUFBTSxFQUFFLENBQUM7Z0JBQ1osS0FBSyxFQUFFLENBQUM7WUFDVCxDQUFDO1FBQ0YsQ0FBQyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDLEtBQUssRUFBRSxFQUFFO1lBQ3ZCLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNsQixNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztZQUM3QixJQUFJLEVBQUUsQ0FBQztRQUNSLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsK0NBQStDLEVBQUUsVUFBVSxJQUFnQjtRQUMvRSxNQUFNLE1BQU0sR0FBRyxJQUFJLGdCQUFnQixDQUFDO1lBQ25DLElBQUksd0JBQWdCO1lBQ3BCLGFBQWEsRUFBRSx1QkFBdUI7WUFDdEMsY0FBYyxFQUFFLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRTtTQUNuQyxDQUFDLENBQUM7UUFFSCxJQUFJLEtBQUssR0FBRyxDQUFDLENBQUM7UUFDZCxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUU7WUFDeEIsSUFBSSxNQUFNLEVBQUUsQ0FBQztnQkFDWixLQUFLLEVBQUUsQ0FBQztZQUNULENBQUM7UUFDRixDQUFDLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUMsS0FBSyxFQUFFLEVBQUU7WUFDdkIsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2xCLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzdCLElBQUksRUFBRSxDQUFDO1FBQ1IsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQywrQ0FBK0MsRUFBRSxVQUFVLElBQWdCO1FBQy9FLE1BQU0sTUFBTSxHQUFHLElBQUksZ0JBQWdCLENBQUM7WUFDbkMsSUFBSSx3QkFBZ0I7WUFDcEIsYUFBYSxFQUFFLHVCQUF1QjtZQUN0QyxjQUFjLEVBQUUsRUFBRSxZQUFZLEVBQUUsSUFBSSxFQUFFO1NBQ3RDLENBQUMsQ0FBQztRQUVILElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQztRQUNkLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRTtZQUN4QixJQUFJLE1BQU0sRUFBRSxDQUFDO2dCQUNaLEtBQUssRUFBRSxDQUFDO1lBQ1QsQ0FBQztRQUNGLENBQUMsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQyxLQUFLLEVBQUUsRUFBRTtZQUN2QixNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDbEIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDN0IsSUFBSSxFQUFFLENBQUM7UUFDUixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGlEQUFpRCxFQUFFLFVBQVUsSUFBZ0I7UUFDakYsTUFBTSxNQUFNLEdBQUcsSUFBSSxnQkFBZ0IsQ0FBQztZQUNuQyxJQUFJLHdCQUFnQjtZQUNwQixhQUFhLEVBQUUsaUJBQWlCO1lBQ2hDLFdBQVcsRUFBRSxLQUFLO1lBQ2xCLGNBQWMsRUFBRSxFQUFFLGFBQWEsRUFBRSxJQUFJLEVBQUU7U0FDdkMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDO1FBQ2QsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFO1lBQ3hCLElBQUksTUFBTSxFQUFFLENBQUM7Z0JBQ1osS0FBSyxFQUFFLENBQUM7WUFDVCxDQUFDO1FBQ0YsQ0FBQyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDLEtBQUssRUFBRSxFQUFFO1lBQ3ZCLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNsQixNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztZQUM3QixJQUFJLEVBQUUsQ0FBQztRQUNSLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsa0RBQWtELEVBQUUsVUFBVSxJQUFnQjtRQUNsRixNQUFNLE1BQU0sR0FBRyxJQUFJLGdCQUFnQixDQUFDO1lBQ25DLElBQUksd0JBQWdCO1lBQ3BCLGFBQWEsRUFBRSxpQkFBaUI7WUFDaEMsV0FBVyxFQUFFLEtBQUs7WUFDbEIsY0FBYyxFQUFFLEVBQUUsYUFBYSxFQUFFLElBQUksRUFBRTtTQUN2QyxDQUFDLENBQUM7UUFFSCxJQUFJLEtBQUssR0FBRyxDQUFDLENBQUM7UUFDZCxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUU7WUFDeEIsSUFBSSxNQUFNLEVBQUUsQ0FBQztnQkFDWixLQUFLLEVBQUUsQ0FBQztZQUNULENBQUM7UUFDRixDQUFDLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUMsS0FBSyxFQUFFLEVBQUU7WUFDdkIsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2xCLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzdCLElBQUksRUFBRSxDQUFDO1FBQ1IsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxpQ0FBaUMsRUFBRSxVQUFVLElBQWdCO1FBQ2pFLE1BQU0sTUFBTSxHQUFHLElBQUksZ0JBQWdCLENBQUM7WUFDbkMsSUFBSSx3QkFBZ0I7WUFDcEIsYUFBYSxFQUFFLGlCQUFpQjtZQUNoQyxXQUFXLEVBQUUsS0FBSztZQUNsQixjQUFjLEVBQUUsRUFBRSxjQUFjLEVBQUUsSUFBSSxFQUFFO1NBQ3hDLENBQUMsQ0FBQztRQUVILElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQztRQUNkLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRTtZQUN4QixJQUFJLE1BQU0sRUFBRSxDQUFDO2dCQUNaLEtBQUssRUFBRSxDQUFDO1lBQ1QsQ0FBQztRQUNGLENBQUMsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQyxLQUFLLEVBQUUsRUFBRTtZQUN2QixNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDbEIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDOUIsSUFBSSxFQUFFLENBQUM7UUFDUixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGlDQUFpQyxFQUFFLFVBQVUsSUFBZ0I7UUFDakUsTUFBTSxNQUFNLEdBQUcsSUFBSSxnQkFBZ0IsQ0FBQztZQUNuQyxJQUFJLHdCQUFnQjtZQUNwQixhQUFhLEVBQUUsaUJBQWlCO1lBQ2hDLFdBQVcsRUFBRSxLQUFLO1lBQ2xCLGNBQWMsRUFBRSxFQUFFLGdCQUFnQixFQUFFLElBQUksRUFBRTtTQUMxQyxDQUFDLENBQUM7UUFFSCxJQUFJLEtBQUssR0FBRyxDQUFDLENBQUM7UUFDZCxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUU7WUFDeEIsSUFBSSxNQUFNLEVBQUUsQ0FBQztnQkFDWixLQUFLLEVBQUUsQ0FBQztZQUNULENBQUM7UUFDRixDQUFDLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUMsS0FBSyxFQUFFLEVBQUU7WUFDdkIsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2xCLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzdCLElBQUksRUFBRSxDQUFDO1FBQ1IsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQywrQkFBK0IsRUFBRSxVQUFVLElBQWdCO1FBQy9ELE1BQU0sYUFBYSxHQUFtQjtZQUNyQztnQkFDQyxNQUFNLEVBQUUsaUJBQWlCO2dCQUN6QixjQUFjLEVBQUUsQ0FBQzt3QkFDaEIsT0FBTyxFQUFFLEVBQUUsb0JBQW9CLEVBQUUsSUFBSSxFQUFFO3FCQUN2QyxDQUFDO2FBQ0Y7WUFDRDtnQkFDQyxNQUFNLEVBQUUsYUFBYTtnQkFDckIsY0FBYyxFQUFFLENBQUM7d0JBQ2hCLE9BQU8sRUFBRTs0QkFDUixhQUFhLEVBQUUsSUFBSTt5QkFDbkI7cUJBQ0QsQ0FBQzthQUNGO1NBQ0QsQ0FBQztRQUVGLE1BQU0sTUFBTSxHQUFHLElBQUksZ0JBQWdCLENBQUM7WUFDbkMsSUFBSSx3QkFBZ0I7WUFDcEIsYUFBYTtZQUNiLFdBQVcsRUFBRSxHQUFHO1NBQ2hCLENBQUMsQ0FBQztRQUVILElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQztRQUNkLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRTtZQUN4QixJQUFJLE1BQU0sRUFBRSxDQUFDO2dCQUNaLEtBQUssRUFBRSxDQUFDO1lBQ1QsQ0FBQztRQUNGLENBQUMsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQyxLQUFLLEVBQUUsRUFBRTtZQUN2QixNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDbEIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDN0IsSUFBSSxFQUFFLENBQUM7UUFDUixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDJCQUEyQixFQUFFLFVBQVUsSUFBZ0I7UUFDM0QsTUFBTSxNQUFNLEdBQUcsSUFBSSxnQkFBZ0IsQ0FBQztZQUNuQyxJQUFJLHdCQUFnQjtZQUNwQixhQUFhLEVBQUUsaUJBQWlCO1lBQ2hDLFdBQVcsRUFBRSxJQUFJO1NBQ2pCLENBQUMsQ0FBQztRQUVILElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQztRQUNkLElBQUksR0FBa0IsQ0FBQztRQUN2QixNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUU7WUFDeEIsSUFBSSxNQUFNLEVBQUUsQ0FBQztnQkFDWixLQUFLLEVBQUUsQ0FBQztZQUNULENBQUM7WUFDRCxHQUFHLEdBQUcsTUFBTSxDQUFDO1FBQ2QsQ0FBQyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDLEtBQUssRUFBRSxFQUFFO1lBQ3ZCLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNsQixNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztZQUM3QixNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1lBQzlELElBQUksRUFBRSxDQUFDO1FBQ1IsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxtQkFBbUIsRUFBRSxVQUFVLElBQWdCO1FBQ25ELE1BQU0sTUFBTSxHQUFHLElBQUksZ0JBQWdCLENBQUM7WUFDbkMsSUFBSSx3QkFBZ0I7WUFDcEIsYUFBYSxFQUFFLGlCQUFpQjtZQUNoQyxXQUFXLEVBQUUsYUFBYTtTQUMxQixDQUFDLENBQUM7UUFFSCxJQUFJLEtBQUssR0FBRyxDQUFDLENBQUM7UUFDZCxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUU7WUFDeEIsSUFBSSxNQUFNLEVBQUUsQ0FBQztnQkFDWixLQUFLLEVBQUUsQ0FBQztZQUNULENBQUM7UUFDRixDQUFDLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUMsS0FBSyxFQUFFLEVBQUU7WUFDdkIsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2xCLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzdCLElBQUksRUFBRSxDQUFDO1FBQ1IsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxtQ0FBbUMsRUFBRSxVQUFVLElBQWdCO1FBQ25FLE1BQU0sTUFBTSxHQUFHLElBQUksZ0JBQWdCLENBQUM7WUFDbkMsSUFBSSx3QkFBZ0I7WUFDcEIsYUFBYSxFQUFFLGlCQUFpQjtZQUNoQyxXQUFXLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxZQUFZLENBQUMsQ0FBQztTQUNoRSxDQUFDLENBQUM7UUFFSCxJQUFJLEtBQUssR0FBRyxDQUFDLENBQUM7UUFDZCxJQUFJLEdBQWtCLENBQUM7UUFDdkIsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFO1lBQ3hCLElBQUksTUFBTSxFQUFFLENBQUM7Z0JBQ1osS0FBSyxFQUFFLENBQUM7WUFDVCxDQUFDO1lBQ0QsR0FBRyxHQUFHLE1BQU0sQ0FBQztRQUNkLENBQUMsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQyxLQUFLLEVBQUUsRUFBRTtZQUN2QixNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDbEIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDN0IsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsRUFBRSxZQUFZLENBQUMsQ0FBQztZQUNsRSxJQUFJLEVBQUUsQ0FBQztRQUNSLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsc0NBQXNDLEVBQUUsVUFBVSxJQUFnQjtRQUN0RSxNQUFNLE1BQU0sR0FBRyxJQUFJLGdCQUFnQixDQUFDO1lBQ25DLElBQUksd0JBQWdCO1lBQ3BCLGFBQWEsRUFBRSxpQkFBaUI7WUFDaEMsY0FBYyxFQUFFO2dCQUNmLFVBQVUsRUFBRSxJQUFJO2dCQUNoQixxQkFBcUIsRUFBRSxJQUFJO2dCQUMzQixnQ0FBZ0MsRUFBRSxJQUFJO2FBQ3RDO1NBQ0QsQ0FBQyxDQUFDO1FBRUgsTUFBTSxHQUFHLEdBQW9CLEVBQUUsQ0FBQztRQUNoQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUU7WUFDeEIsR0FBRyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNsQixDQUFDLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUMsS0FBSyxFQUFFLEVBQUU7WUFDdkIsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2xCLE1BQU0sU0FBUyxHQUFHLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDO1lBQzlELE1BQU0sQ0FBQyxFQUFFLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSx1QkFBdUIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDcEcsTUFBTSxDQUFDLEVBQUUsQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLHlCQUF5QixJQUFJLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUN4RyxNQUFNLENBQUMsRUFBRSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsMEJBQTBCLElBQUksQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQzFHLElBQUksRUFBRSxDQUFDO1FBQ1IsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx3QkFBd0IsRUFBRSxVQUFVLElBQWdCO1FBQ3hELE1BQU0sTUFBTSxHQUFHLElBQUksZ0JBQWdCLENBQUM7WUFDbkMsSUFBSSx3QkFBZ0I7WUFDcEIsYUFBYSxFQUFFLEVBQUU7WUFDakIsa0JBQWtCLEVBQUU7Z0JBQ25CLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsaURBQWlELENBQUMsQ0FBQyxNQUFNLEVBQUUsVUFBVSxDQUFDLENBQUMsQ0FBQztnQkFDL0gsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxpREFBaUQsQ0FBQyxDQUFDLE1BQU0sRUFBRSxVQUFVLEVBQUUsWUFBWSxDQUFDLENBQUMsQ0FBQztnQkFDN0ksR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxpREFBaUQsQ0FBQyxDQUFDLE1BQU0sRUFBRSxZQUFZLENBQUMsQ0FBQyxDQUFDO2FBQ2pJO1lBQ0QsV0FBVyxFQUFFLE1BQU07U0FDbkIsQ0FBQyxDQUFDO1FBRUgsSUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDO1FBQ2QsSUFBSSxHQUFrQixDQUFDO1FBQ3ZCLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRTtZQUN4QixJQUFJLE1BQU0sRUFBRSxDQUFDO2dCQUNaLEtBQUssRUFBRSxDQUFDO1lBQ1QsQ0FBQztZQUNELEdBQUcsR0FBRyxNQUFNLENBQUM7UUFDZCxDQUFDLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUMsS0FBSyxFQUFFLEVBQUU7WUFDdkIsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2xCLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzdCLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLEVBQUUsWUFBWSxDQUFDLENBQUM7WUFDbEUsSUFBSSxFQUFFLENBQUM7UUFDUixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHVDQUF1QyxFQUFFLFVBQVUsSUFBZ0I7UUFDdkUsTUFBTSxNQUFNLEdBQUcsSUFBSSxnQkFBZ0IsQ0FBQztZQUNuQyxJQUFJLHdCQUFnQjtZQUNwQixhQUFhLEVBQUUsRUFBRTtZQUNqQixrQkFBa0IsRUFBRTtnQkFDbkIsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxpREFBaUQsQ0FBQyxDQUFDLE1BQU0sRUFBRSxVQUFVLENBQUMsQ0FBQyxDQUFDO2dCQUMvSCxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLGlEQUFpRCxDQUFDLENBQUMsTUFBTSxFQUFFLFVBQVUsRUFBRSxZQUFZLENBQUMsQ0FBQyxDQUFDO2dCQUM3SSxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLGlEQUFpRCxDQUFDLENBQUMsTUFBTSxFQUFFLFlBQVksQ0FBQyxDQUFDLENBQUM7YUFDakk7WUFDRCxXQUFXLEVBQUUsS0FBSztZQUNsQixjQUFjLEVBQUUsRUFBRSxVQUFVLEVBQUUsSUFBSSxFQUFFO1NBQ3BDLENBQUMsQ0FBQztRQUVILElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQztRQUNkLElBQUksR0FBa0IsQ0FBQztRQUN2QixNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUU7WUFDeEIsSUFBSSxNQUFNLEVBQUUsQ0FBQztnQkFDWixLQUFLLEVBQUUsQ0FBQztZQUNULENBQUM7WUFDRCxHQUFHLEdBQUcsTUFBTSxDQUFDO1FBQ2QsQ0FBQyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDLEtBQUssRUFBRSxFQUFFO1lBQ3ZCLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNsQixNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztZQUM3QixNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxFQUFFLFVBQVUsQ0FBQyxDQUFDO1lBQ2hFLElBQUksRUFBRSxDQUFDO1FBQ1IsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx1Q0FBdUMsRUFBRSxVQUFVLElBQWdCO1FBQ3ZFLE1BQU0sTUFBTSxHQUFHLElBQUksZ0JBQWdCLENBQUM7WUFDbkMsSUFBSSx3QkFBZ0I7WUFDcEIsYUFBYSxFQUFFLEVBQUU7WUFDakIsa0JBQWtCLEVBQUU7Z0JBQ25CLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsaURBQWlELENBQUMsQ0FBQyxNQUFNLEVBQUUsVUFBVSxDQUFDLENBQUMsQ0FBQztnQkFDL0gsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxpREFBaUQsQ0FBQyxDQUFDLE1BQU0sRUFBRSxVQUFVLEVBQUUsWUFBWSxDQUFDLENBQUMsQ0FBQztnQkFDN0ksR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxpREFBaUQsQ0FBQyxDQUFDLE1BQU0sRUFBRSxZQUFZLENBQUMsQ0FBQyxDQUFDO2FBQ2pJO1lBQ0QsV0FBVyxFQUFFLEtBQUs7WUFDbEIsY0FBYyxFQUFFLEVBQUUsVUFBVSxFQUFFLElBQUksRUFBRTtTQUNwQyxDQUFDLENBQUM7UUFFSCxJQUFJLEtBQUssR0FBRyxDQUFDLENBQUM7UUFDZCxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUU7WUFDeEIsSUFBSSxNQUFNLEVBQUUsQ0FBQztnQkFDWixLQUFLLEVBQUUsQ0FBQztZQUNULENBQUM7UUFDRixDQUFDLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUMsS0FBSyxFQUFFLEVBQUU7WUFDdkIsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2xCLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzdCLElBQUksRUFBRSxDQUFDO1FBQ1IsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxtQ0FBbUMsRUFBRSxVQUFVLElBQWdCO1FBQ25FLE1BQU0sTUFBTSxHQUFHLElBQUksZ0JBQWdCLENBQUM7WUFDbkMsSUFBSSx3QkFBZ0I7WUFDcEIsYUFBYSxFQUFFO2dCQUNkLEVBQUUsTUFBTSxFQUFFLGlCQUFpQixFQUFFO2dCQUM3QixFQUFFLE1BQU0sRUFBRSxRQUFRLENBQUMsaUJBQWlCLEVBQUUsV0FBVyxDQUFDLEVBQUU7YUFDcEQ7WUFDRCxXQUFXLEVBQUUsYUFBYTtTQUMxQixDQUFDLENBQUM7UUFFSCxJQUFJLEtBQUssR0FBRyxDQUFDLENBQUM7UUFDZCxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUU7WUFDeEIsSUFBSSxNQUFNLEVBQUUsQ0FBQztnQkFDWixLQUFLLEVBQUUsQ0FBQztZQUNULENBQUM7UUFDRixDQUFDLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUMsS0FBSyxFQUFFLEVBQUU7WUFDdkIsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2xCLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzdCLElBQUksRUFBRSxDQUFDO1FBQ1IsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztBQUNKLENBQUMsQ0FBQyxDQUFDO0FBRUgsVUFBVSxDQUFDLFlBQVksRUFBRSxHQUFHLEVBQUU7SUFFN0IsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyx5QkFBeUIsRUFBRSxVQUFVLElBQWdCO1FBQzVGLE1BQU0sS0FBSyxHQUFHLGlCQUFpQixDQUFDO1FBQ2hDLE1BQU0sS0FBSyxHQUFHLGtDQUFrQyxDQUFDO1FBRWpELE1BQU0sTUFBTSxHQUFHLElBQUksVUFBVSxDQUFDO1lBQzdCLElBQUksd0JBQWdCO1lBQ3BCLGFBQWEsRUFBRSxpQkFBaUI7WUFDaEMsY0FBYyxFQUFFLEVBQUUsY0FBYyxFQUFFLElBQUksRUFBRTtTQUN4QyxDQUFDLENBQUM7UUFDSCxNQUFNLElBQUksR0FBRyxNQUFNLENBQUMsWUFBWSxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDbkQsTUFBTSxDQUFDLFVBQVUsQ0FBQyxJQUFJLEVBQUUsTUFBTSxFQUFFLENBQUMsSUFBSSxFQUFFLE9BQU8sRUFBRSxFQUFFO1lBQ2pELE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQy9CLE1BQU0sQ0FBQyxjQUFjLENBQUMsT0FBUSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDeEUsTUFBTSxDQUFDLGNBQWMsQ0FBQyxPQUFRLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxPQUFPLENBQUMsQ0FBQztZQUV4RSxNQUFNLE1BQU0sR0FBRyxJQUFJLFVBQVUsQ0FBQztnQkFDN0IsSUFBSSx3QkFBZ0I7Z0JBQ3BCLGFBQWEsRUFBRSxpQkFBaUI7Z0JBQ2hDLGNBQWMsRUFBRSxFQUFFLGNBQWMsRUFBRSxJQUFJLEVBQUU7YUFDeEMsQ0FBQyxDQUFDO1lBQ0gsTUFBTSxJQUFJLEdBQUcsTUFBTSxDQUFDLFlBQVksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1lBQ25ELE1BQU0sQ0FBQyxVQUFVLENBQUMsSUFBSSxFQUFFLE1BQU0sRUFBRSxDQUFDLElBQUksRUFBRSxPQUFPLEVBQUUsRUFBRTtnQkFDakQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7Z0JBQy9CLE1BQU0sQ0FBQyxjQUFjLENBQUMsT0FBUSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsT0FBTyxDQUFDLENBQUM7Z0JBQ3hFLE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBUSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsT0FBTyxDQUFDLENBQUM7Z0JBQ3JFLElBQUksRUFBRSxDQUFDO1lBQ1IsQ0FBQyxDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyx1QkFBdUIsRUFBRSxVQUFVLElBQWdCO1FBQzFGLE1BQU0sYUFBYSxHQUFtQjtZQUNyQztnQkFDQyxNQUFNLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUM7Z0JBQy9CLGNBQWMsRUFBRSxDQUFDO3dCQUNoQixPQUFPLEVBQUUsRUFBRSxjQUFjLEVBQUUsSUFBSSxFQUFFO3FCQUNqQyxDQUFDO2FBQ0Y7U0FDRCxDQUFDO1FBRUYsTUFBTSxLQUFLLEdBQUcsaUJBQWlCLENBQUM7UUFDaEMsTUFBTSxLQUFLLEdBQUcsa0NBQWtDLENBQUM7UUFFakQsTUFBTSxNQUFNLEdBQUcsSUFBSSxVQUFVLENBQUMsRUFBRSxJQUFJLHdCQUFnQixFQUFFLGFBQWEsRUFBRSxDQUFDLENBQUM7UUFDdkUsTUFBTSxJQUFJLEdBQUcsTUFBTSxDQUFDLFlBQVksQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNuRCxNQUFNLENBQUMsVUFBVSxDQUFDLElBQUksRUFBRSxNQUFNLEVBQUUsQ0FBQyxJQUFJLEVBQUUsT0FBTyxFQUFFLEVBQUU7WUFDakQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDL0IsTUFBTSxDQUFDLGNBQWMsQ0FBQyxPQUFRLEVBQUUsS0FBSyxDQUFDLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDakQsTUFBTSxDQUFDLENBQUMsY0FBYyxDQUFDLE9BQVEsRUFBRSxLQUFLLENBQUMsRUFBRSxPQUFPLENBQUMsQ0FBQztZQUNsRCxJQUFJLEVBQUUsQ0FBQztRQUNSLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLGdDQUFnQyxFQUFFLFVBQVUsSUFBZ0I7UUFDbkcsTUFBTSxLQUFLLEdBQUcsY0FBYyxDQUFDO1FBQzdCLE1BQU0sS0FBSyxHQUFHLHFCQUFxQixDQUFDO1FBQ3BDLE1BQU0sS0FBSyxHQUFHLGlCQUFpQixDQUFDO1FBRWhDLE1BQU0sTUFBTSxHQUFHLElBQUksVUFBVSxDQUFDLEVBQUUsSUFBSSx3QkFBZ0IsRUFBRSxhQUFhLEVBQUUsaUJBQWlCLEVBQUUsY0FBYyxFQUFFLEVBQUUsY0FBYyxFQUFFLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNwSSxNQUFNLElBQUksR0FBRyxNQUFNLENBQUMsWUFBWSxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDbkQsTUFBTSxDQUFDLFVBQVUsQ0FBQyxJQUFJLEVBQUUsTUFBTSxFQUFFLENBQUMsSUFBSSxFQUFFLE9BQU8sRUFBRSxFQUFFO1lBQ2pELE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQy9CLE1BQU0sQ0FBQyxjQUFjLENBQUMsT0FBUSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDeEUsTUFBTSxDQUFDLGNBQWMsQ0FBQyxPQUFRLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxPQUFPLENBQUMsQ0FBQztZQUN4RSxNQUFNLENBQUMsY0FBYyxDQUFDLE9BQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBRXhFLE1BQU0sTUFBTSxHQUFHLElBQUksVUFBVSxDQUFDLEVBQUUsSUFBSSx3QkFBZ0IsRUFBRSxhQUFhLEVBQUUsaUJBQWlCLEVBQUUsY0FBYyxFQUFFLEVBQUUsdUJBQXVCLEVBQUUsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQzdJLE1BQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQyxZQUFZLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztZQUNuRCxNQUFNLENBQUMsVUFBVSxDQUFDLElBQUksRUFBRSxNQUFNLEVBQUUsQ0FBQyxJQUFJLEVBQUUsT0FBTyxFQUFFLEVBQUU7Z0JBQ2pELE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO2dCQUMvQixNQUFNLENBQUMsY0FBYyxDQUFDLE9BQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxDQUFDO2dCQUN4RSxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxDQUFDO2dCQUNyRSxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxDQUFDO2dCQUNyRSxJQUFJLEVBQUUsQ0FBQztZQUNSLENBQUMsQ0FBQyxDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsa0NBQWtDLEVBQUUsVUFBVSxJQUFnQjtRQUNyRyxNQUFNLEtBQUssR0FBRyx1QkFBdUIsQ0FBQztRQUN0QyxNQUFNLEtBQUssR0FBRyxrQ0FBa0MsQ0FBQztRQUVqRCxNQUFNLE1BQU0sR0FBRyxJQUFJLFVBQVUsQ0FBQyxFQUFFLElBQUksd0JBQWdCLEVBQUUsYUFBYSxFQUFFLGlCQUFpQixFQUFFLGNBQWMsRUFBRSxFQUFFLHVCQUF1QixFQUFFLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQztRQUM3SSxNQUFNLElBQUksR0FBRyxNQUFNLENBQUMsWUFBWSxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDbkQsTUFBTSxDQUFDLFVBQVUsQ0FBQyxJQUFJLEVBQUUsTUFBTSxFQUFFLENBQUMsSUFBSSxFQUFFLE9BQU8sRUFBRSxFQUFFO1lBQ2pELE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQy9CLE1BQU0sQ0FBQyxjQUFjLENBQUMsT0FBUSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDeEUsTUFBTSxDQUFDLGNBQWMsQ0FBQyxPQUFRLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxPQUFPLENBQUMsQ0FBQztZQUV4RSxNQUFNLE1BQU0sR0FBRyxJQUFJLFVBQVUsQ0FBQyxFQUFFLElBQUksd0JBQWdCLEVBQUUsYUFBYSxFQUFFLGlCQUFpQixFQUFFLGNBQWMsRUFBRSxFQUFFLHVCQUF1QixFQUFFLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQztZQUM3SSxNQUFNLElBQUksR0FBRyxNQUFNLENBQUMsWUFBWSxDQUFDLGdCQUFnQixDQUFDLENBQUM7WUFDbkQsTUFBTSxDQUFDLFVBQVUsQ0FBQyxJQUFJLEVBQUUsTUFBTSxFQUFFLENBQUMsSUFBSSxFQUFFLE9BQU8sRUFBRSxFQUFFO2dCQUNqRCxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztnQkFDL0IsTUFBTSxDQUFDLGNBQWMsQ0FBQyxPQUFRLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxPQUFPLENBQUMsQ0FBQztnQkFDeEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFRLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxPQUFPLENBQUMsQ0FBQztnQkFDckUsSUFBSSxFQUFFLENBQUM7WUFDUixDQUFDLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLHFDQUFxQyxFQUFFLFVBQVUsSUFBZ0I7UUFDeEcsTUFBTSxLQUFLLEdBQUcsa0NBQWtDLENBQUM7UUFDakQsTUFBTSxLQUFLLEdBQUcsb0RBQW9ELENBQUM7UUFFbkUsTUFBTSxNQUFNLEdBQUcsSUFBSSxVQUFVLENBQUMsRUFBRSxJQUFJLHdCQUFnQixFQUFFLGFBQWEsRUFBRSxpQkFBaUIsRUFBRSxjQUFjLEVBQUUsRUFBRSx3QkFBd0IsRUFBRSxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDOUksTUFBTSxJQUFJLEdBQUcsTUFBTSxDQUFDLFlBQVksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBQ25ELE1BQU0sQ0FBQyxVQUFVLENBQUMsSUFBSSxFQUFFLE1BQU0sRUFBRSxDQUFDLElBQUksRUFBRSxPQUFPLEVBQUUsRUFBRTtZQUNqRCxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztZQUMvQixNQUFNLENBQUMsY0FBYyxDQUFDLE9BQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQ3hFLE1BQU0sQ0FBQyxjQUFjLENBQUMsT0FBUSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFFeEUsTUFBTSxNQUFNLEdBQUcsSUFBSSxVQUFVLENBQUMsRUFBRSxJQUFJLHdCQUFnQixFQUFFLGFBQWEsRUFBRSxpQkFBaUIsRUFBRSxjQUFjLEVBQUUsRUFBRSw0QkFBNEIsRUFBRSxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDbEosTUFBTSxJQUFJLEdBQUcsTUFBTSxDQUFDLFlBQVksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1lBQ25ELE1BQU0sQ0FBQyxVQUFVLENBQUMsSUFBSSxFQUFFLE1BQU0sRUFBRSxDQUFDLElBQUksRUFBRSxPQUFPLEVBQUUsRUFBRTtnQkFDakQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7Z0JBQy9CLE1BQU0sQ0FBQyxjQUFjLENBQUMsT0FBUSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsT0FBTyxDQUFDLENBQUM7Z0JBQ3hFLE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBUSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsT0FBTyxDQUFDLENBQUM7Z0JBQ3JFLElBQUksRUFBRSxDQUFDO1lBQ1IsQ0FBQyxDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQywyQkFBMkIsRUFBRSxVQUFVLElBQWdCO1FBQzlGLE1BQU0sS0FBSyxHQUFHLHVCQUF1QixDQUFDO1FBQ3RDLE1BQU0sS0FBSyxHQUFHLGtDQUFrQyxDQUFDO1FBRWpELE1BQU0sTUFBTSxHQUFHLElBQUksVUFBVSxDQUFDLEVBQUUsSUFBSSx3QkFBZ0IsRUFBRSxhQUFhLEVBQUUsaUJBQWlCLEVBQUUsY0FBYyxFQUFFLEVBQUUsb0JBQW9CLEVBQUUsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQzFJLE1BQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQyxZQUFZLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUNuRCxNQUFNLENBQUMsVUFBVSxDQUFDLElBQUksRUFBRSxNQUFNLEVBQUUsQ0FBQyxJQUFJLEVBQUUsT0FBTyxFQUFFLEVBQUU7WUFDakQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDL0IsTUFBTSxDQUFDLGNBQWMsQ0FBQyxPQUFRLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxPQUFPLENBQUMsQ0FBQztZQUN4RSxNQUFNLENBQUMsY0FBYyxDQUFDLE9BQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBRXhFLE1BQU0sTUFBTSxHQUFHLElBQUksVUFBVSxDQUFDLEVBQUUsSUFBSSx3QkFBZ0IsRUFBRSxhQUFhLEVBQUUsaUJBQWlCLEVBQUUsY0FBYyxFQUFFLEVBQUUsb0JBQW9CLEVBQUUsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQzFJLE1BQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQyxZQUFZLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztZQUNuRCxNQUFNLENBQUMsVUFBVSxDQUFDLElBQUksRUFBRSxNQUFNLEVBQUUsQ0FBQyxJQUFJLEVBQUUsT0FBTyxFQUFFLEVBQUU7Z0JBQ2pELE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO2dCQUMvQixNQUFNLENBQUMsY0FBYyxDQUFDLE9BQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxDQUFDO2dCQUN4RSxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxDQUFDO2dCQUNyRSxJQUFJLEVBQUUsQ0FBQztZQUNSLENBQUMsQ0FBQyxDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsb0NBQW9DLEVBQUUsVUFBVSxJQUFnQjtRQUN2RyxNQUFNLE9BQU8sR0FBRztZQUNmLGtDQUFrQztZQUNsQyx1QkFBdUI7WUFDdkIsY0FBYztTQUNkLENBQUM7UUFDRixNQUFNLFFBQVEsR0FBRztZQUNoQixvREFBb0Q7WUFDcEQsaUJBQWlCO1NBQ2pCLENBQUM7UUFFRixNQUFNLE1BQU0sR0FBRyxJQUFJLFVBQVUsQ0FBQztZQUM3QixJQUFJLHdCQUFnQjtZQUNwQixhQUFhLEVBQUUsaUJBQWlCO1lBQ2hDLGNBQWMsRUFBRTtnQkFDZiw0QkFBNEIsRUFBRSxJQUFJO2dCQUNsQyxtQkFBbUIsRUFBRSxJQUFJO2dCQUN6QixTQUFTLEVBQUUsSUFBSTtnQkFDZixZQUFZLEVBQUUsSUFBSTthQUNsQjtTQUNELENBQUMsQ0FBQztRQUNILE1BQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQyxZQUFZLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUNuRCxNQUFNLENBQUMsVUFBVSxDQUFDLElBQUksRUFBRSxNQUFNLEVBQUUsQ0FBQyxJQUFJLEVBQUUsT0FBTyxFQUFFLEVBQUU7WUFDakQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDL0IsS0FBSyxNQUFNLE1BQU0sSUFBSSxPQUFPLEVBQUUsQ0FBQztnQkFDOUIsTUFBTSxDQUFDLGNBQWMsQ0FBQyxPQUFRLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxPQUFPLENBQUMsQ0FBQztZQUMxRSxDQUFDO1lBQ0QsS0FBSyxNQUFNLE9BQU8sSUFBSSxRQUFRLEVBQUUsQ0FBQztnQkFDaEMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFRLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxPQUFPLENBQUMsQ0FBQztZQUN4RSxDQUFDO1lBQ0QsSUFBSSxFQUFFLENBQUM7UUFDUixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsU0FBUyxjQUFjLENBQUMsTUFBYyxFQUFFLEdBQUcsS0FBZTtRQUN6RCxNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2pDLE9BQU8sS0FBSyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDdEQsQ0FBQztBQUNGLENBQUMsQ0FBQyxDQUFDIn0=
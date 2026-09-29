/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'vitest';
import type * as vscode from 'vscode';
import { TextDocumentSnapshot } from '../../../../platform/editing/common/textDocumentSnapshot';
import { AbstractSearchService } from '../../../../platform/search/common/searchService';
import { ITabsAndEditorsService, TabChangeEvent, TabInfo } from '../../../../platform/tabs/common/tabsAndEditorsService';
import * as glob from '../../../../util/common/glob';
import { createTextDocumentData } from '../../../../util/common/test/shims/textDocument';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { Event } from '../../../../util/vs/base/common/event';
import { normalize } from '../../../../util/vs/base/common/path';
import { basename } from '../../../../util/vs/base/common/resources';
import { URI } from '../../../../util/vs/base/common/uri';
import { TestFileFinder, isTestFile, suffix2Language } from '../testFiles';

suite.skipIf(process.platform === 'win32')('TestFileFinder', function () {

	class TestSearchService extends AbstractSearchService {
		override async findTextInFiles(query: vscode.TextSearchQuery, options: vscode.FindTextInFilesOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Promise<vscode.TextSearchComplete> {
			return {};
		}

		override findTextInFiles2(query: vscode.TextSearchQuery2, options?: vscode.FindTextInFilesOptions2, token?: vscode.CancellationToken): vscode.FindTextInFilesResponse {
			return {} as vscode.FindTextInFilesResponse;
		}

		override async findFiles(filePattern: vscode.GlobPattern, options?: vscode.FindFiles2Options | undefined, token?: vscode.CancellationToken | undefined): Promise<vscode.Uri[]> {
			return [];
		}
	}

	class TestTabsService implements ITabsAndEditorsService {
		declare _serviceBrand: undefined;
		onDidChangeActiveTextEditor: vscode.Event<vscode.TextEditor | undefined> = Event.None;
		onDidChangeTabs: vscode.Event<TabChangeEvent> = Event.None;
		activeTextEditor: vscode.TextEditor | undefined = undefined;
		visibleTextEditors: readonly vscode.TextEditor[] = [];
		activeNotebookEditor: vscode.NotebookEditor | undefined = undefined;
		visibleNotebookEditors: readonly vscode.NotebookEditor[] = [];
		tabs: TabInfo[] = [];
	}

	test('returns undefined when no test file exists', async function () {
		const testFileFinder = new TestFileFinder(new TestSearchService(), new TestTabsService());
		const sourceFile = URI.file('/path/to/source/file.ts');

		const result = await testFileFinder.findTestFileForSourceFile(createTextDocument(sourceFile), CancellationToken.None);

		assert.deepStrictEqual(result, undefined);
	});

	test('uses tab info', async function () {

		const sourceFile = URI.file('/path/to/source/file.ts');
		const testFileFinder = new TestFileFinder(new TestSearchService(), new class extends TestTabsService {
			override tabs: TabInfo[] = [{
				uri: URI.file('/path/to/source/file.spec.ts'),
				tab: null!
			}];
		});

		const result = await testFileFinder.findTestFileForSourceFile(createTextDocument(sourceFile), CancellationToken.None);
		assert.deepStrictEqual(result?.toString(), 'file:///path/to/source/file.spec.ts');
	});

	test('returns test file URI when it exists', async function () {
		const sourceFile = '/path/to/source/file.ts';
		const testFile = '/path/to/source/file.test.ts';
		await assertTestFileFoundAsync(sourceFile, testFile);
	});

	const possibleTestNames = ['file.test.xx', 'file_test.xx', 'file.spec.xx', 'fileSpec.xx', 'test_file.xx'];
	for (const testName of possibleTestNames) {
		test(`for unknown languages, returns test file URI if it exists (${testName})`, async function () {
			await assertTestFileFoundAsync('/path/file.xx', '/path/file.test.xx');
		});
	}

	test('returns a test for Go', async function () {
		const sourceFile = '/path/to/source/foo.go';
		const testFile = '/path/to/source/foo_test.go';
		await assertTestFileFoundAsync(sourceFile, testFile);
	});

	test('returns impl for Go', async function () {
		const sourceFile = '/path/to/source/foo.go';
		const testFile = '/path/to/source/foo_test.go';
		await assertImplFileFoundAsync(testFile, sourceFile);
	});

	test('returns same folder with prefix as fallback', async function () {
		const sourceFile = '/path/to/source/foo.go';
		const existingTestFile = '/path/to/source/foo_test.go';
		await assertTestFileFoundAsync(sourceFile, existingTestFile, '/path/to/source');
	});



	test('returns a test for Java for maven layout', async function () {
		const sourceFile = '/src/main/java/p/Foo.java';
		const testFile = '/src/test/java/p/FooTest.java';
		await assertTestFileFoundAsync(sourceFile, testFile);
	});

	test('returns a impl for Java for maven layout', async function () {
		const testFile = '/src/test/java/p/FooTest.java';
		const sourceFile = '/src/main/java/p/Foo.java';
		await assertImplFileFoundAsync(testFile, sourceFile);
	});

	test('returns a test for PHP', async function () {
		const sourceFile = '/src/Foo.php';
		const testFile = '/tests/FooTest.php';
		await assertTestFileFoundAsync(sourceFile, testFile);
	});

	test('returns a test for Dart', async function () {
		const sourceFile = '/project/Foo.dart';
		const testFile = '/tests/Foo_test.dart';
		await assertTestFileFoundAsync(sourceFile, testFile);
	});

	test('returns a test for Python', async function () {
		const sourceFile = '/project/foo.py';
		const testFile = '/tests/test_foo.py';
		await assertTestFileFoundAsync(sourceFile, testFile);
	});

	test('returns a test for C#', async function () {
		const sourceFile = 'src/project/Foo.cs';
		await assertTestFileFoundAsync(sourceFile, '/src/tests/project/FooTest.cs');
		// assertTestFileFound(sourceFile, '/unit-tests/project/FooTest.cs');
		// assertTestFileFound(sourceFile, '/unittests/project/FooTest.cs');
	});

	test('returns a test for Ruby', async function () {
		const sourceFile = 'app/api/foo.rb';
		await assertTestFileFoundAsync(sourceFile, '/test/app/api/foo_test.rb');
	});

	test('determine java test file with absolute path', async () => {
		await assertTestFileFoundAsync(
			'/Users/copilot/git/commons-io/src/main/java/org/apache/commons/io/EndianUtils.java',
			'/Users/copilot/git/commons-io/src/test/java/org/apache/commons/io/EndianUtilsTest.java',
			'file:///Users/copilot/git/commons-io'
		);
	});

	test('determine rb test file with absolute path', async () => {
		await assertTestFileFoundAsync(
			'/Users/copilot/git/github/foo/util.rb',
			'/Users/copilot/git/github/test/foo/util_test.rb',
			'file:///Users/copilot/git/github'
		);
	});

	test('determine php test file with absolute path', async () => {
		await assertTestFileFoundAsync(
			'/Users/copilot/git/github/foo/util.php',
			'/Users/copilot/git/github/tests/utilTest.php',
			'file:///Users/copilot/git/github'
		);
	});

	test('determine ps1 test file with absolute path', async () => {
		await assertTestFileFoundAsync(
			'/Users/copilot/git/github/foo/util.ps1',
			'/Users/copilot/git/github/Tests/util.Tests.ps1',
			'file:///Users/copilot/git/github'
		);
	});

	type TestSample = { filename: string; isTestFile: boolean };
	const testSamples: TestSample[] = [
		{ filename: 'foo.js', isTestFile: false },
		{ filename: 'foo.test.js', isTestFile: true },
		{ filename: 'foo.spec.js', isTestFile: true },
		{ filename: 'foo.ts', isTestFile: false },
		{ filename: 'foo.test.ts', isTestFile: true },
		{ filename: 'foo.spec.ts', isTestFile: true },
		{ filename: 'foo.py', isTestFile: false },
		{ filename: 'test_foo.py', isTestFile: true },
		{ filename: 'foo_test.py', isTestFile: true },
		{ filename: 'foo.rb', isTestFile: false },
		{ filename: 'foo_test.rb', isTestFile: true },
		{ filename: 'foo.go', isTestFile: false },
		{ filename: 'foo_test.go', isTestFile: true },
		{ filename: 'foo.php', isTestFile: false },
		{ filename: 'fooTest.php', isTestFile: true },
		{ filename: 'Foo.java', isTestFile: false },
		{ filename: 'FooTest.java', isTestFile: true },
		{ filename: 'Foo.cs', isTestFile: false },
		{ filename: 'FooTest.cs', isTestFile: true },
		{ filename: 'foo.xx', isTestFile: false },
		{ filename: 'foo~Test.xx', isTestFile: true },
		{ filename: 'foo.spec.xx', isTestFile: true },
		{ filename: 'fooTest.xx', isTestFile: true },
		{ filename: 'test_foo.xx', isTestFile: true },
		{ filename: 'foo.Tests.ps1', isTestFile: true },
	];
	// test for each sample
	for (const sample of testSamples) {
		test(`is ${sample.filename} a test file?`, () => {
			const isTest = isTestFile(URI.file(sample.filename));
			assert.strictEqual(isTest, sample.isTestFile);
		});
	}

	function createTextDocument(uri: URI) {
		const sourceDocumentData = createTextDocumentData(uri, '', suffix2Language[basename(uri).substring(1)] ?? '');
		return TextDocumentSnapshot.create(sourceDocumentData.document);
	}

	async function assertTestFileFoundAsync(sourceFilePath: string, expectedTestFilePath: string, workspaceUri?: string) {

		const sourceFile = URI.file(sourceFilePath);
		const expectedTestFile = URI.file(expectedTestFilePath);

		const testFileFinder = new TestFileFinder(new class extends AbstractSearchService {
			override async findTextInFiles(query: vscode.TextSearchQuery, options: vscode.FindTextInFilesOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Promise<vscode.TextSearchComplete> {
				if (glob.shouldInclude(expectedTestFile, { include: options.include ? [options.include] : undefined, exclude: options.exclude ? [options.exclude] : undefined })) {
					progress.report({ uri: expectedTestFile, ranges: [], preview: { matches: [], text: '' } });
				}
				return {};
			}
			override findTextInFiles2(query: vscode.TextSearchQuery2, options?: vscode.FindTextInFilesOptions2, token?: vscode.CancellationToken): vscode.FindTextInFilesResponse {
				throw new Error('not implemented');
			}
			override async findFiles(filePattern: vscode.GlobPattern, options?: vscode.FindFiles2Options | undefined, token?: vscode.CancellationToken | undefined): Promise<vscode.Uri[]> {
				if (glob.shouldInclude(expectedTestFile, { include: [filePattern], exclude: options?.exclude ? options.exclude : undefined })) {
					return [expectedTestFile];
				}
				return [];
			}
		}, new TestTabsService());

		const sourceDocument = createTextDocument(sourceFile);
		const result = await testFileFinder.findTestFileForSourceFile(sourceDocument, CancellationToken.None);

		assert.ok(result);
		assert.strictEqual(normalize(result!.path), normalize(expectedTestFilePath.toString()));
	}

	async function assertImplFileFoundAsync(testFilePath: string, expectedImplFilePath: string) {

		const testFile = URI.file(testFilePath);
		const expectedImplFile = URI.file(expectedImplFilePath);

		const testFileFinder = new TestFileFinder(new class extends AbstractSearchService {
			override async findTextInFiles(query: vscode.TextSearchQuery, options: vscode.FindTextInFilesOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Promise<vscode.TextSearchComplete> {
				if (glob.isMatch(expectedImplFile, options.include!) && (!options.exclude || !glob.isMatch(expectedImplFile, options.exclude))) {
					progress.report({
						uri: expectedImplFile,
						ranges: [],
						preview: { text: '', matches: [] }
					});
				}
				return {};
			}
			override findTextInFiles2(query: vscode.TextSearchQuery2, options?: vscode.FindTextInFilesOptions2, token?: vscode.CancellationToken): vscode.FindTextInFilesResponse {
				throw new Error('not implemented');
			}
			override async findFiles(filePattern: vscode.GlobPattern, options?: vscode.FindFiles2Options | undefined, token?: vscode.CancellationToken | undefined): Promise<vscode.Uri[]> {
				if (glob.isMatch(expectedImplFile, filePattern) && (!options?.exclude || !options.exclude.some(e => glob.isMatch(expectedImplFile, e)))) {
					return [expectedImplFile];
				}
				return [];
			}
		}, new TestTabsService());

		const testFileDocument = createTextDocument(testFile);
		const result = await testFileFinder.findFileForTestFile(testFileDocument, CancellationToken.None);

		assert.notStrictEqual(result, undefined);
		assert.strictEqual(normalize(result!.path), normalize(expectedImplFilePath.toString()));
	}
});

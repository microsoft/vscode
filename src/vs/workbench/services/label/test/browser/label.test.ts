/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as resources from 'vs/base/common/resources';
import assert from 'assert';
import { TestEnvironmentService, TestLifecycleService, TestPathService, TestRemoteAgentService } from 'vs/workbench/test/browser/workbenchTestServices';
import { URI } from 'vs/base/common/uri';
import { LabelService } from 'vs/workbench/services/label/common/labelService';
import { TestContextService, TestStorageService } from 'vs/workbench/test/common/workbenchTestServices';
import { WorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { TestWorkspace, Workspace } from 'vs/platform/workspace/test/common/testWorkspace';
import { isWindows } from 'vs/base/common/platform';
import { StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { Memento } from 'vs/workbench/common/memento';
import { ResourceLabelFormatter } from 'vs/platform/label/common/label';
import { sep } from 'vs/base/common/path';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { DisposableStore } from 'vs/base/common/lifecycle';

suite('URI Label', () => {
	let labelService: LabelService;
	let storageService: TestStorageService;

	setup(() => {
		storageService = new TestStorageService();
		labelService = new LabelService(TestEnvironmentService, new TestContextService(), new TestPathService(URI.file('/foobar')), new TestRemoteAgentService(), storageService, new TestLifecycleService());
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('custom scheme', function () {
		labelService.registerFormatter({
			scheme: 'vscode',
			formatting: {
				label: 'LABEL/${path}/${authority}/END',
				separator: '/',
				tildify: true,
				normalizeDriveLetter: true
			}
		});

		const uri1 = URI.parse('vscode://microsoft.com/1/2/3/4/5');
		assert.strictEqual(labelService.getUriLabel(uri1, { relative: false }), 'LABEL//1/2/3/4/5/microsoft.com/END');
		assert.strictEqual(labelService.getUriBasenameLabel(uri1), 'END');
	});

	test('file scheme', function () {
		labelService.registerFormatter({
			scheme: 'file',
			formatting: {
				label: '${path}',
				separator: sep,
				tildify: !isWindows,
				normalizeDriveLetter: isWindows
			}
		});

		const uri1 = TestWorkspace.folders[0].uri.with({ path: TestWorkspace.folders[0].uri.path.concat('/a/b/c/d') });
		assert.strictEqual(labelService.getUriLabel(uri1, { relative: true }), isWindows ? 'a\\b\\c\\d' : 'a/b/c/d');
		assert.strictEqual(labelService.getUriLabel(uri1, { relative: false }), isWindows ? 'C:\\testWorkspace\\a\\b\\c\\d' : '/testWorkspace/a/b/c/d');
		assert.strictEqual(labelService.getUriBasenameLabel(uri1), 'd');

		const uri2 = URI.file('c:\\1/2/3');
		assert.strictEqual(labelService.getUriLabel(uri2, { relative: false }), isWindows ? 'C:\\1\\2\\3' : '/c:\\1/2/3');
		assert.strictEqual(labelService.getUriBasenameLabel(uri2), '3');
	});

	test('separator', function () {
		labelService.registerFormatter({
			scheme: 'vscode',
			formatting: {
				label: 'LABEL\\${path}\\${authority}\\END',
				separator: '\\',
				tildify: true,
				normalizeDriveLetter: true
			}
		});

		const uri1 = URI.parse('vscode://microsoft.com/1/2/3/4/5');
		assert.strictEqual(labelService.getUriLabel(uri1, { relative: false }), 'LABEL\\\\1\\2\\3\\4\\5\\microsoft.com\\END');
		assert.strictEqual(labelService.getUriBasenameLabel(uri1), 'END');
	});

	test('custom authority', function () {
		labelService.registerFormatter({
			scheme: 'vscode',
			authority: 'micro*',
			formatting: {
				label: 'LABEL/${path}/${authority}/END',
				separator: '/'
			}
		});

		const uri1 = URI.parse('vscode://microsoft.com/1/2/3/4/5');
		assert.strictEqual(labelService.getUriLabel(uri1, { relative: false }), 'LABEL//1/2/3/4/5/microsoft.com/END');
		assert.strictEqual(labelService.getUriBasenameLabel(uri1), 'END');
	});

	test('mulitple authority', function () {
		labelService.registerFormatter({
			scheme: 'vscode',
			authority: 'not_matching_but_long',
			formatting: {
				label: 'first',
				separator: '/'
			}
		});
		labelService.registerFormatter({
			scheme: 'vscode',
			authority: 'microsof*',
			formatting: {
				label: 'second',
				separator: '/'
			}
		});
		labelService.registerFormatter({
			scheme: 'vscode',
			authority: 'mi*',
			formatting: {
				label: 'third',
				separator: '/'
			}
		});

		// Make sure the most specific authority is picked
		const uri1 = URI.parse('vscode://microsoft.com/1/2/3/4/5');
		assert.strictEqual(labelService.getUriLabel(uri1, { relative: false }), 'second');
		assert.strictEqual(labelService.getUriBasenameLabel(uri1), 'second');
	});

	test('custom query', function () {
		labelService.registerFormatter({
			scheme: 'vscode',
			formatting: {
				label: 'LABEL${query.prefix}: ${query.path}/END',
				separator: '/',
				tildify: true,
				normalizeDriveLetter: true
			}
		});

		const uri1 = URI.parse(`vscode://microsoft.com/1/2/3/4/5?${encodeURIComponent(JSON.stringify({ prefix: 'prefix', path: 'path' }))}`);
		assert.strictEqual(labelService.getUriLabel(uri1, { relative: false }), 'LABELprefix: path/END');
	});

	test('custom query without value', function () {
		labelService.registerFormatter({
			scheme: 'vscode',
			formatting: {
				label: 'LABEL${query.prefix}: ${query.path}/END',
				separator: '/',
				tildify: true,
				normalizeDriveLetter: true
			}
		});

		const uri1 = URI.parse(`vscode://microsoft.com/1/2/3/4/5?${encodeURIComponent(JSON.stringify({ path: 'path' }))}`);
		assert.strictEqual(labelService.getUriLabel(uri1, { relative: false }), 'LABEL: path/END');
	});

	test('custom query without query json', function () {
		labelService.registerFormatter({
			scheme: 'vscode',
			formatting: {
				label: 'LABEL${query.prefix}: ${query.path}/END',
				separator: '/',
				tildify: true,
				normalizeDriveLetter: true
			}
		});

		const uri1 = URI.parse('vscode://microsoft.com/1/2/3/4/5?path=foo');
		assert.strictEqual(labelService.getUriLabel(uri1, { relative: false }), 'LABEL: /END');
	});

	test('custom query without query', function () {
		labelService.registerFormatter({
			scheme: 'vscode',
			formatting: {
				label: 'LABEL${query.prefix}: ${query.path}/END',
				separator: '/',
				tildify: true,
				normalizeDriveLetter: true
			}
		});

		const uri1 = URI.parse('vscode://microsoft.com/1/2/3/4/5');
		assert.strictEqual(labelService.getUriLabel(uri1, { relative: false }), 'LABEL: /END');
	});


	test('label caching', () => {
		const m = new Memento('cachedResourceLabelFormatters2', storageService).getMemento(StorageScope.PROFILE, StorageTarget.MACHINE);
		const makeFormatter = (scheme: string): ResourceLabelFormatter => ({ formatting: { label: `\${path} (${scheme})`, separator: '/' }, scheme });
		assert.deepStrictEqual(m, {});

		// registers a new formatter:
		labelService.registerCachedFormatter(makeFormatter('a'));
		assert.deepStrictEqual(m, { formatters: [makeFormatter('a')] });

		// registers a 2nd formatter:
		labelService.registerCachedFormatter(makeFormatter('b'));
		assert.deepStrictEqual(m, { formatters: [makeFormatter('b'), makeFormatter('a')] });

		// promotes a formatter on re-register:
		labelService.registerCachedFormatter(makeFormatter('a'));
		assert.deepStrictEqual(m, { formatters: [makeFormatter('a'), makeFormatter('b')] });

		// no-ops if already in first place:
		labelService.registerCachedFormatter(makeFormatter('a'));
		assert.deepStrictEqual(m, { formatters: [makeFormatter('a'), makeFormatter('b')] });

		// limits the cache:
		for (let i = 0; i < 100; i++) {
			labelService.registerCachedFormatter(makeFormatter(`i${i}`));
		}
		const expected: ResourceLabelFormatter[] = [];
		for (let i = 50; i < 100; i++) {
			expected.unshift(makeFormatter(`i${i}`));
		}
		assert.deepStrictEqual(m, { formatters: expected });

		delete (m as any).formatters;
	});
});


suite('multi-root workspace', () => {
	let labelService: LabelService;
	const disposables = new DisposableStore();

	setup(() => {
		const sources = URI.file('folder1/src');
		const tests = URI.file('folder1/test');
		const other = URI.file('folder2');

		labelService = disposables.add(new LabelService(
			TestEnvironmentService,
			new TestContextService(
				new Workspace('test-workspace', [
					new WorkspaceFolder({ uri: sources, index: 0, name: 'Sources' }),
					new WorkspaceFolder({ uri: tests, index: 1, name: 'Tests' }),
					new WorkspaceFolder({ uri: other, index: 2, name: resources.basename(other) }),
				])),
			new TestPathService(),
			new TestRemoteAgentService(),
			disposables.add(new TestStorageService()),
			disposables.add(new TestLifecycleService())
		));
	});

	teardown(() => {
		disposables.clear();
	});

	test('labels of files in multiroot workspaces are the foldername followed by offset from the folder', () => {
		labelService.registerFormatter({
			scheme: 'file',
			formatting: {
				label: '${authority}${path}',
				separator: '/',
				tildify: false,
				normalizeDriveLetter: false,
				authorityPrefix: '//',
				workspaceSuffix: ''
			}
		});

		const tests = {
			'folder1/src/file': 'Sources • file',
			'folder1/src/folder/file': 'Sources • folder/file',
			'folder1/src': 'Sources',
			'folder1/other': '/folder1/other',
			'folder2/other': 'folder2 • other',
		};

		Object.entries(tests).forEach(([path, label]) => {
			const generated = labelService.getUriLabel(URI.file(path), { relative: true });
			assert.strictEqual(generated, label);
		});
	});

	test('labels with context after path', () => {
		labelService.registerFormatter({
			scheme: 'file',
			formatting: {
				label: '${path} (${scheme})',
				separator: '/',
			}
		});

		const tests = {
			'folder1/src/file': 'Sources • file (file)',
			'folder1/src/folder/file': 'Sources • folder/file (file)',
			'folder1/src': 'Sources',
			'folder1/other': '/folder1/other (file)',
			'folder2/other': 'folder2 • other (file)',
		};

		Object.entries(tests).forEach(([path, label]) => {
			const generated = labelService.getUriLabel(URI.file(path), { relative: true });
			assert.strictEqual(generated, label, path);
		});
	});

	test('stripPathStartingSeparator', () => {
		labelService.registerFormatter({
			scheme: 'file',
			formatting: {
				label: '${path}',
				separator: '/',
				stripPathStartingSeparator: true
			}
		});

		const tests = {
			'folder1/src/file': 'Sources • file',
			'other/blah': 'other/blah',
		};

		Object.entries(tests).forEach(([path, label]) => {
			const generated = labelService.getUriLabel(URI.file(path), { relative: true });
			assert.strictEqual(generated, label, path);
		});
	});

	test('relative label without formatter', () => {
		const rootFolder = URI.parse('myscheme://myauthority/');

		labelService = disposables.add(new LabelService(
			TestEnvironmentService,
			new TestContextService(
				new Workspace('test-workspace', [
					new WorkspaceFolder({ uri: rootFolder, index: 0, name: 'FSProotFolder' }),
				])),
			new TestPathService(undefined, rootFolder.scheme),
			new TestRemoteAgentService(),
			disposables.add(new TestStorageService()),
			disposables.add(new TestLifecycleService())
		));

		const generated = labelService.getUriLabel(URI.parse('myscheme://myauthority/some/folder/test.txt'), { relative: true });
		if (isWindows) {
			assert.strictEqual(generated, 'some\\folder\\test.txt');
		} else {
			assert.strictEqual(generated, 'some/folder/test.txt');
		}
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});

suite('workspace at FSP root', () => {
	let labelService: LabelService;

	setup(() => {
		const rootFolder = URI.parse('myscheme://myauthority/');

		labelService = new LabelService(
			TestEnvironmentService,
			new TestContextService(
				new Workspace('test-workspace', [
					new WorkspaceFolder({ uri: rootFolder, index: 0, name: 'FSProotFolder' }),
				])),
			new TestPathService(),
			new TestRemoteAgentService(),
			new TestStorageService(),
			new TestLifecycleService()
		);
		labelService.registerFormatter({
			scheme: 'myscheme',
			formatting: {
				label: '${scheme}://${authority}${path}',
				separator: '/',
				tildify: false,
				normalizeDriveLetter: false,
				workspaceSuffix: '',
				authorityPrefix: '',
				stripPathStartingSeparator: false
			}
		});
	});

	test('non-relative label', () => {

		const tests = {
			'myscheme://myauthority/myFile1.txt': 'myscheme://myauthority/myFile1.txt',
			'myscheme://myauthority/folder/myFile2.txt': 'myscheme://myauthority/folder/myFile2.txt',
		};

		Object.entries(tests).forEach(([uriString, label]) => {
			const generated = labelService.getUriLabel(URI.parse(uriString), { relative: false });
			assert.strictEqual(generated, label);
		});
	});

	test('relative label', () => {

		const tests = {
			'myscheme://myauthority/myFile1.txt': 'myFile1.txt',
			'myscheme://myauthority/folder/myFile2.txt': 'folder/myFile2.txt',
		};

		Object.entries(tests).forEach(([uriString, label]) => {
			const generated = labelService.getUriLabel(URI.parse(uriString), { relative: true });
			assert.strictEqual(generated, label);
		});
	});

	test('relative label with explicit path separator', () => {
		let generated = labelService.getUriLabel(URI.parse('myscheme://myauthority/some/folder/test.txt'), { relative: true, separator: '/' });
		assert.strictEqual(generated, 'some/folder/test.txt');

		generated = labelService.getUriLabel(URI.parse('myscheme://myauthority/some/folder/test.txt'), { relative: true, separator: '\\' });
		assert.strictEqual(generated, 'some\\folder\\test.txt');
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as resources from '../../../../../base/common/resources.js';
import assert from 'assert';
import { TestEnvironmentService, TestLifecycleService, TestNotebookDocumentService, TestPathService, TestRemoteAgentService } from '../../../../test/browser/workbenchTestServices.js';
import { URI } from '../../../../../base/common/uri.js';
import { LabelService } from '../../common/labelService.js';
import { TestContextService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { WorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { TestWorkspace, Workspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { Memento } from '../../../../common/memento.js';
import { ResourceLabelFormatter } from '../../../../../platform/label/common/label.js';
import { sep } from '../../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { INotebookDocument } from '../../../notebook/common/notebookDocumentService.js';
import { Schemas } from '../../../../../base/common/network.js';

suite('URI Label', () => {
	let labelService: LabelService;
	let storageService: TestStorageService;

	setup(() => {
		storageService = new TestStorageService();
		labelService = new LabelService(TestEnvironmentService, new TestContextService(), new TestPathService(URI.file('/foobar')), new TestRemoteAgentService(), storageService, new TestLifecycleService(), createTestNotebookService());
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
			disposables.add(new TestLifecycleService()),
			createTestNotebookService()
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
			disposables.add(new TestLifecycleService()),
			createTestNotebookService()
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
			new TestLifecycleService(),
			createTestNotebookService()
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

suite('Notebooks URI Label', () => {
	let labelService: LabelService;
	let storageService: TestStorageService;
	setup(() => {
		const workspace = TestWorkspace;
		const notebooks: INotebookDocument[] = [
			{
				uri: URI.joinPath(workspace.folders[0].uri, 'test.ipynb'),
				getCellIndex(cellUri) {
					const cells = [
						URI.joinPath(workspace.folders[0].uri, 'test.ipynb').with({ scheme: Schemas.vscodeNotebookCell, fragment: 'cell=1' }),
						URI.joinPath(workspace.folders[0].uri, 'test.ipynb').with({ scheme: Schemas.vscodeNotebookCell, fragment: 'cell=2' }),
						URI.joinPath(workspace.folders[0].uri, 'test.ipynb').with({ scheme: Schemas.vscodeNotebookCell, fragment: 'cell=3' }),
					];
					return cells.findIndex(cell => cell.toString() === cellUri.toString());
				},
			},
			{
				uri: URI.joinPath(workspace.folders[0].uri, 'two.ipynb'),
				getCellIndex(cellUri) {
					const cells = [
						URI.joinPath(workspace.folders[0].uri, 'two.ipynb').with({ scheme: Schemas.vscodeNotebookCell, fragment: 'cell=1' }),
						URI.joinPath(workspace.folders[0].uri, 'two.ipynb').with({ scheme: Schemas.vscodeNotebookCell, fragment: 'cell=2' })
					];
					return cells.findIndex(cell => cell.toString() === cellUri.toString());
				},
			}
		];

		storageService = new TestStorageService();
		labelService = new LabelService(TestEnvironmentService, new TestContextService(workspace), new TestPathService(URI.file('/foobar')), new TestRemoteAgentService(), storageService, new TestLifecycleService(), createTestNotebookService(notebooks));
	});

	ensureNoDisposablesAreLeakedInTestSuite();


	test('Notebook Uri instead of Cell Uri', function () {
		const uri1 = URI.joinPath(TestWorkspace.folders[0].uri, 'test.ipynb');
		assert.strictEqual(labelService.getUriLabel(uri1, { relative: true, noPrefix: true, appendCellNumber: true }), 'test.ipynb');
	});

	test('Notebook Uri instead of Cell Uri', function () {
		const uri1 = URI.joinPath(TestWorkspace.folders[0].uri, 'test.ipynb').with({ scheme: Schemas.vscodeNotebookCell, fragment: 'cell=2' });
		assert.strictEqual(labelService.getUriLabel(uri1, { relative: true, noPrefix: true, appendCellNumber: true }), 'test.ipynb • Cell 2');

		const uri2 = URI.joinPath(TestWorkspace.folders[0].uri, 'two.ipynb').with({ scheme: Schemas.vscodeNotebookCell, fragment: 'cell=1' });
		assert.strictEqual(labelService.getUriLabel(uri2, { relative: true, noPrefix: true, appendCellNumber: true }), 'two.ipynb • Cell 1');
	});

	test('Invalid Cell Uri', function () {
		const uri1 = URI.joinPath(TestWorkspace.folders[0].uri, 'test.ipynb').with({ scheme: Schemas.vscodeNotebookCell, fragment: 'cell=4' });
		assert.strictEqual(labelService.getUriLabel(uri1, { relative: true, noPrefix: true, appendCellNumber: true }), 'test.ipynb');
	});
});

function createTestNotebookService(notebooks: INotebookDocument[] = []) {
	return new TestNotebookDocumentService(notebooks);
}


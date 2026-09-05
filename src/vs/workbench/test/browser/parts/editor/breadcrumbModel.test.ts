/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { IWorkspaceFoldersChangeEvent, WorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { BreadcrumbsModel, FileElement } from '../../../../browser/parts/editor/breadcrumbsModel.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { FileKind } from '../../../../../platform/files/common/files.js';
import { TestContextService } from '../../../common/workbenchTestServices.js';
import { Workspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IOutlineService } from '../../../../services/outline/browser/outline.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MockLabelService } from '../../../../services/label/test/common/mockLabelService.js';
import { IWorkspaceFolderLabelService } from '../../../../services/workspaces/common/workspaceFolderLabelService.js';
import { Emitter } from '../../../../../base/common/event.js';

suite('Breadcrumb Model', function () {

	let model: BreadcrumbsModel;
	const workspaceService = new TestContextService(new Workspace('ffff', [new WorkspaceFolder({ uri: URI.parse('foo:/bar/baz/ws'), name: 'ws', index: 0 })]));
	const workspaceFolderLabelService = new class extends mock<IWorkspaceFolderLabelService>() {
		override getWorkspaceFolderLabel(folder: WorkspaceFolder): string {
			return folder.uri.path.slice(folder.uri.path.lastIndexOf('/') + 1);
		}
	};
	const outlineService = new class extends mock<IOutlineService>() { };
	const labelService = new MockLabelService();
	const configService = new class extends TestConfigurationService {
		override getValue<T>(...args: Parameters<TestConfigurationService['getValue']>): T | undefined {
			if (args[0] === 'breadcrumbs.filePath') {
				return 'on' as T;
			}
			if (args[0] === 'breadcrumbs.symbolPath') {
				return 'on' as T;
			}
			return super.getValue(...args);
		}
		override updateValue() {
			return Promise.resolve();
		}
	};

	function createModel(resource: URI, workspace: TestContextService = workspaceService): BreadcrumbsModel {
		return new BreadcrumbsModel(resource, undefined, configService, workspace, workspaceFolderLabelService, outlineService, labelService);
	}

	teardown(function () {
		model.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('file element equality includes the rendered label', function () {
		model = createModel(URI.parse('foo:/bar/baz/ws/file.ts'));
		const uri = URI.parse('foo:/worktrees/project-feature');

		assert.deepStrictEqual({
			sameLabel: new FileElement(uri, FileKind.ROOT_FOLDER, 'project').equals(new FileElement(uri, FileKind.ROOT_FOLDER, 'project')),
			changedLabel: new FileElement(uri, FileKind.ROOT_FOLDER, 'project').equals(new FileElement(uri, FileKind.ROOT_FOLDER, 'renamed-project')),
		}, {
			sameLabel: true,
			changedLabel: false,
		});
	});

	test('only uri, inside workspace', function () {

		model = createModel(URI.parse('foo:/bar/baz/ws/some/path/file.ts'));
		const elements = model.getElements();

		assert.strictEqual(elements.length, 3);
		const [one, two, three] = elements as FileElement[];
		assert.strictEqual(one.kind, FileKind.FOLDER);
		assert.strictEqual(two.kind, FileKind.FOLDER);
		assert.strictEqual(three.kind, FileKind.FILE);
		assert.strictEqual(one.uri.toString(), 'foo:/bar/baz/ws/some');
		assert.strictEqual(two.uri.toString(), 'foo:/bar/baz/ws/some/path');
		assert.strictEqual(three.uri.toString(), 'foo:/bar/baz/ws/some/path/file.ts');
	});

	test('display uri matters for FileElement', function () {

		model = createModel(URI.parse('foo:/bar/baz/ws/some/PATH/file.ts'));
		const elements = model.getElements();

		assert.strictEqual(elements.length, 3);
		const [one, two, three] = elements as FileElement[];
		assert.strictEqual(one.kind, FileKind.FOLDER);
		assert.strictEqual(two.kind, FileKind.FOLDER);
		assert.strictEqual(three.kind, FileKind.FILE);
		assert.strictEqual(one.uri.toString(), 'foo:/bar/baz/ws/some');
		assert.strictEqual(two.uri.toString(), 'foo:/bar/baz/ws/some/PATH');
		assert.strictEqual(three.uri.toString(), 'foo:/bar/baz/ws/some/PATH/file.ts');
	});

	test('only uri, outside workspace', function () {

		model = createModel(URI.parse('foo:/outside/file.ts'));
		const elements = model.getElements();

		assert.strictEqual(elements.length, 2);
		const [one, two] = elements as FileElement[];
		assert.strictEqual(one.kind, FileKind.FOLDER);
		assert.strictEqual(two.kind, FileKind.FILE);
		assert.strictEqual(one.uri.toString(), 'foo:/outside');
		assert.strictEqual(two.uri.toString(), 'foo:/outside/file.ts');
	});

	test('shows only the path relative to a contributed resource label home', function () {
		const root = URI.file('/Users/test/.copilot/session-state/5ec17bb7-5596-41c5-9d24-4787d8b0a698');
		const registration = labelService.registerFormatter({ scheme: root.scheme, home: root.path, formatting: { label: 'Copilot/Session', separator: '/' } });
		const resource = URI.file('/Users/test/.copilot/session-state/5ec17bb7-5596-41c5-9d24-4787d8b0a698/folder/file.md');
		model = createModel(resource);

		assert.deepStrictEqual({
			isRelative: model.isRelative(),
			elements: (model.getElements() as FileElement[]).map(element => ({
				name: element.label ?? element.uri.path.slice(element.uri.path.lastIndexOf('/') + 1),
				kind: element.kind,
			}))
		}, {
			isRelative: true,
			elements: [
				{ name: 'Copilot', kind: FileKind.ROOT_FOLDER },
				{ name: 'Session', kind: FileKind.FOLDER },
				{ name: 'folder', kind: FileKind.FOLDER },
				{ name: 'file.md', kind: FileKind.FILE },
			]
		});
		registration.dispose();
	});

	test('updates when a resource label home is contributed after model creation', function () {
		const resource = URI.file('/Users/test/.copilot/session-state/5ec17bb7-5596-41c5-9d24-4787d8b0a698/file.md');
		model = createModel(resource);
		const root = URI.file('/Users/test/.copilot/session-state/5ec17bb7-5596-41c5-9d24-4787d8b0a698');
		const registration = labelService.registerFormatter({ scheme: root.scheme, home: root.path, formatting: { label: 'Copilot/Session', separator: '/' } });

		assert.deepStrictEqual((model.getElements() as FileElement[]).map(element => ({
			name: element.label ?? element.uri.path.slice(element.uri.path.lastIndexOf('/') + 1),
			kind: element.kind,
		})), [
			{ name: 'Copilot', kind: FileKind.ROOT_FOLDER },
			{ name: 'Session', kind: FileKind.FOLDER },
			{ name: 'file.md', kind: FileKind.FILE },
		]);
		registration.dispose();
	});

	test('stops at a resource label home when the resource has a query', function () {
		const home = URI.from({ scheme: 'vscode-agent-host', authority: 'remote', path: '/home/.copilot/session-state/session' });
		const resource = URI.from({ scheme: home.scheme, authority: home.authority, path: `${home.path}/file.md`, query: '_ah=metadata' });
		const registration = labelService.registerFormatter({ scheme: home.scheme, authority: home.authority, home: home.path, formatting: { label: 'Copilot/Session', separator: '/' } });
		model = createModel(resource);

		assert.deepStrictEqual((model.getElements() as FileElement[]).map(element => element.label ?? element.uri.path.split('/').at(-1)), [
			'Copilot',
			'Session',
			'file.md',
		]);
		registration.dispose();
	});

	test('keeps the full path without a contributed resource label home', function () {
		const resource = URI.file('/Users/test/.copilot/session-state/5ec17bb7-5596-41c5-9d24-4787d8b0a698/file.md');
		model = createModel(resource);

		assert.deepStrictEqual({
			isRelative: model.isRelative(),
			names: (model.getElements() as FileElement[]).map(element => element.uri.path.slice(element.uri.path.lastIndexOf('/') + 1))
		}, {
			isRelative: false,
			names: ['Users', 'test', '.copilot', 'session-state', '5ec17bb7-5596-41c5-9d24-4787d8b0a698', 'file.md']
		});
	});

	test('omits workspace root in single-root VS Code workspace', function () {
		const workspace = new TestContextService(new Workspace(
			'ffff',
			[new WorkspaceFolder({ uri: URI.parse('foo:/bar/baz/ws'), name: 'ws', index: 0 })],
			URI.parse('foo:/workspace.code-workspace')
		));
		model = createModel(URI.parse('foo:/bar/baz/ws/file.ts'), workspace);

		assert.deepStrictEqual((model.getElements() as FileElement[]).map(element => ({
			uri: element.uri.toString(),
			kind: element.kind
		})), [
			{ uri: 'foo:/bar/baz/ws/file.ts', kind: FileKind.FILE }
		]);
	});

	test('omits workspace root in single-root Sessions window', function () {
		const workspace = new TestContextService(new Workspace(
			'ffff',
			[new WorkspaceFolder({ uri: URI.parse('foo:/bar/baz/ws'), name: 'ws (branch)', index: 0 })],
			URI.parse('foo:/workspace.code-workspace')
		));
		model = createModel(URI.parse('foo:/bar/baz/ws/some/file.ts'), workspace);

		assert.deepStrictEqual((model.getElements() as FileElement[]).map(element => ({
			uri: element.uri.toString(),
			kind: element.kind
		})), [
			{ uri: 'foo:/bar/baz/ws/some', kind: FileKind.FOLDER },
			{ uri: 'foo:/bar/baz/ws/some/file.ts', kind: FileKind.FILE }
		]);
	});

	test('keeps workspace root when it is the breadcrumb resource', function () {
		const workspace = new TestContextService(new Workspace(
			'ffff',
			[new WorkspaceFolder({ uri: URI.parse('foo:/bar/baz/ws'), name: 'ws (branch)', index: 0 })],
			URI.parse('foo:/workspace.code-workspace')
		));
		model = createModel(URI.parse('foo:/bar/baz/ws'), workspace);

		assert.deepStrictEqual((model.getElements() as FileElement[]).map(element => ({
			uri: element.uri.toString(),
			kind: element.kind,
			label: element.label
		})), [
			{ uri: 'foo:/bar/baz/ws', kind: FileKind.ROOT_FOLDER, label: 'ws' }
		]);
	});

	test('shows plain workspace root in multi-root Sessions window', function () {
		const workspace = new TestContextService(new Workspace(
			'ffff',
			[
				new WorkspaceFolder({ uri: URI.parse('foo:/worktrees/project-feature'), name: 'project (feature)', index: 0 }),
				new WorkspaceFolder({ uri: URI.parse('foo:/worktrees/docs-feature'), name: 'docs (feature)', index: 1 })
			],
			URI.parse('foo:/workspace.code-workspace')
		));
		model = createModel(URI.parse('foo:/worktrees/docs-feature/guide.md'), workspace);

		assert.deepStrictEqual((model.getElements() as FileElement[]).map(element => ({
			uri: element.uri.toString(),
			kind: element.kind,
			label: element.label
		})), [
			{ uri: 'foo:/worktrees/docs-feature', kind: FileKind.ROOT_FOLDER, label: 'docs-feature' },
			{ uri: 'foo:/worktrees/docs-feature/guide.md', kind: FileKind.FILE, label: undefined }
		]);
	});

	test('updates workspace root and label when folders change', function () {
		const firstFolder = new WorkspaceFolder({ uri: URI.parse('foo:/worktrees/project-feature'), name: 'project (feature)', index: 0 });
		const workspace = new TestContextService(new Workspace('ffff', [firstFolder], URI.parse('foo:/workspace.code-workspace')));
		model = createModel(URI.parse('foo:/worktrees/project-feature/file.ts'), workspace);

		const secondFolder = new WorkspaceFolder({ uri: URI.parse('foo:/worktrees/docs-feature'), name: 'docs (feature)', index: 1 });
		workspace.setWorkspace(new Workspace('ffff', [firstFolder, secondFolder], URI.parse('foo:/workspace.code-workspace')));
		const onDidChangeWorkspaceFolders = Reflect.get(workspace, '_onDidChangeWorkspaceFolders') as Emitter<IWorkspaceFoldersChangeEvent>;
		onDidChangeWorkspaceFolders.fire({ added: [secondFolder], removed: [], changed: [] });

		assert.deepStrictEqual((model.getElements() as FileElement[]).map(element => ({
			uri: element.uri.toString(),
			kind: element.kind,
			label: element.label
		})), [
			{ uri: 'foo:/worktrees/project-feature', kind: FileKind.ROOT_FOLDER, label: 'project-feature' },
			{ uri: 'foo:/worktrees/project-feature/file.ts', kind: FileKind.FILE, label: undefined }
		]);
	});
});

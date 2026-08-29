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

	teardown(function () {
		model.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('file element equality includes the rendered label', function () {
		model = new BreadcrumbsModel(URI.parse('foo:/bar/baz/ws/file.ts'), undefined, configService, workspaceService, workspaceFolderLabelService, new class extends mock<IOutlineService>() { });
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

		model = new BreadcrumbsModel(URI.parse('foo:/bar/baz/ws/some/path/file.ts'), undefined, configService, workspaceService, workspaceFolderLabelService, new class extends mock<IOutlineService>() { });
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

		model = new BreadcrumbsModel(URI.parse('foo:/bar/baz/ws/some/PATH/file.ts'), undefined, configService, workspaceService, workspaceFolderLabelService, new class extends mock<IOutlineService>() { });
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

		model = new BreadcrumbsModel(URI.parse('foo:/outside/file.ts'), undefined, configService, workspaceService, workspaceFolderLabelService, new class extends mock<IOutlineService>() { });
		const elements = model.getElements();

		assert.strictEqual(elements.length, 2);
		const [one, two] = elements as FileElement[];
		assert.strictEqual(one.kind, FileKind.FOLDER);
		assert.strictEqual(two.kind, FileKind.FILE);
		assert.strictEqual(one.uri.toString(), 'foo:/outside');
		assert.strictEqual(two.uri.toString(), 'foo:/outside/file.ts');
	});

	test('omits workspace root in single-root VS Code workspace', function () {
		const workspace = new TestContextService(new Workspace(
			'ffff',
			[new WorkspaceFolder({ uri: URI.parse('foo:/bar/baz/ws'), name: 'ws', index: 0 })],
			URI.parse('foo:/workspace.code-workspace')
		));
		model = new BreadcrumbsModel(URI.parse('foo:/bar/baz/ws/file.ts'), undefined, configService, workspace, workspaceFolderLabelService, new class extends mock<IOutlineService>() { });

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
		model = new BreadcrumbsModel(URI.parse('foo:/bar/baz/ws/some/file.ts'), undefined, configService, workspace, workspaceFolderLabelService, new class extends mock<IOutlineService>() { });

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
		model = new BreadcrumbsModel(URI.parse('foo:/bar/baz/ws'), undefined, configService, workspace, workspaceFolderLabelService, new class extends mock<IOutlineService>() { });

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
		model = new BreadcrumbsModel(URI.parse('foo:/worktrees/docs-feature/guide.md'), undefined, configService, workspace, workspaceFolderLabelService, new class extends mock<IOutlineService>() { });

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
		model = new BreadcrumbsModel(URI.parse('foo:/worktrees/project-feature/file.ts'), undefined, configService, workspace, workspaceFolderLabelService, new class extends mock<IOutlineService>() { });

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

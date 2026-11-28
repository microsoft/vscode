/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { TreeVisibility } from '../../../../../base/browser/ui/tree/tree.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { IExpression } from '../../../../../base/common/glob.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { FileChangeType, FileChangesEvent, IFileService } from '../../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { NullFilesConfigurationService, TestFileService } from '../../../../test/common/workbenchTestServices.js';
import { IExplorerService } from '../../browser/files.js';
import { FilesFilter } from '../../browser/views/explorerViewer.js';
import { ExplorerItem } from '../../common/explorerModel.js';

suite('Files - FilesFilter', () => {

	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	function createFilter(exclude: IExpression, excludeGitIgnore = false) {
		const instantiationService = workbenchInstantiationService({
			configurationService: () => new TestConfigurationService({ files: { exclude }, explorer: { excludeGitIgnore } }),
		}, ds);
		instantiationService.stub(IExplorerService, {
			getEditableData: () => undefined,
			findClosest: () => null,
			findClosestRoot: () => null,
		});

		const fileService = instantiationService.get(IFileService);
		const configurationService = instantiationService.get(IConfigurationService);
		const root = new ExplorerItem(instantiationService.get(IWorkspaceContextService).getWorkspace().folders[0].uri, fileService, configurationService, NullFilesConfigurationService, undefined, true);
		const createItem = (parent: ExplorerItem, name: string, isDirectory: boolean) => new ExplorerItem(joinPath(parent.resource, name), fileService, configurationService, NullFilesConfigurationService, parent, isDirectory);
		const filter = ds.add(instantiationService.createInstance(FilesFilter));

		return { root, createItem, filter, fileService: fileService as TestFileService };
	}

	test('shows exclude exceptions and the folders that lead to them without marking those folders as excluded', () => {
		const { root, createItem, filter } = createFilter({ 'node_modules': true, '*.js': true, '!node_modules/@types': true, '!gulpfile.js': true });
		const nodeModules = createItem(root, 'node_modules', true);
		const types = createItem(nodeModules, '@types', true);
		const tree = [
			nodeModules,
			types,
			createItem(types, 'index.d.ts', false),
			createItem(nodeModules, 'react', true),
			createItem(root, 'gulpfile.js', false),
			createItem(root, 'index.js', false),
		];

		const visibility = new Map<ExplorerItem, TreeVisibility>();
		const result: Record<string, { visible: boolean; isExcluded: boolean }> = {};
		for (const item of tree) {
			const visible = filter.filter(item, visibility.get(item.parent!) ?? TreeVisibility.Visible);
			visibility.set(item, visible ? TreeVisibility.Visible : TreeVisibility.Hidden);
			result[item.resource.path.substring(root.resource.path.length + 1)] = { visible, isExcluded: item.isExcluded };
		}

		assert.deepStrictEqual(result, {
			'node_modules': { visible: true, isExcluded: false },
			'node_modules/@types': { visible: true, isExcluded: false },
			'node_modules/@types/index.d.ts': { visible: true, isExcluded: false },
			'node_modules/react': { visible: false, isExcluded: true },
			'gulpfile.js': { visible: true, isExcluded: false },
			'index.js': { visible: false, isExcluded: true },
		});
	});

	test('gitignored folders that lead to an exception are not ignored', async () => {
		const { root, createItem, filter, fileService } = createFilter({ '!build/keep.txt': true }, true);
		fileService.setContent('build/\nout/\n');
		const changed = Event.toPromise(filter.onDidChange);
		filter.filter(createItem(root, '.gitignore', false), TreeVisibility.Visible);
		await changed;

		const build = createItem(root, 'build', true);
		assert.deepStrictEqual({
			folderLeadingToException: filter.isIgnored(build.resource, root.resource, true),
			exception: filter.isIgnored(createItem(build, 'keep.txt', false).resource, root.resource, false),
			ignoredFolder: filter.isIgnored(createItem(root, 'out', true).resource, root.resource, true),
		}, {
			folderLeadingToException: false,
			exception: false,
			ignoredFolder: true,
		});
	});

	test('handles multiple deleted ignore files in a single change event without set mutation issues and batches onDidChange', async () => {
		const { root, createItem, filter, fileService } = createFilter({}, true);
		fileService.setContent('out/\n');

		const gitignore1 = createItem(root, '.gitignore', false);
		const folder = createItem(root, 'sub', true);
		const gitignore2 = createItem(folder, '.gitignore', false);

		// Initialize both ignore files
		let changed = Event.toPromise(filter.onDidChange);
		filter.filter(gitignore1, TreeVisibility.Visible);
		await changed;

		changed = Event.toPromise(filter.onDidChange);
		filter.filter(gitignore2, TreeVisibility.Visible);
		await changed;

		const rootOut = createItem(root, 'out', true);
		const subOut = createItem(folder, 'out', true);
		assert.strictEqual(filter.isIgnored(rootOut.resource, root.resource, true), true, 'rootOut should initially be ignored');
		assert.strictEqual(filter.isIgnored(subOut.resource, root.resource, true), true, 'subOut should initially be ignored');

		// Fire deletion event for both ignore files simultaneously
		let fireCount = 0;
		const sub = filter.onDidChange(() => { fireCount++; });

		const deleteEvent = new FileChangesEvent([
			{ resource: gitignore1.resource, type: FileChangeType.DELETED },
			{ resource: gitignore2.resource, type: FileChangeType.DELETED }
		], false);

		fileService.fireFileChanges(deleteEvent);
		sub.dispose();

		assert.strictEqual(fireCount, 1, 'onDidChange should be batched once per root for multiple deletions');
		assert.strictEqual(filter.isIgnored(rootOut.resource, root.resource, true), false, 'rootOut should no longer be ignored after deletion');
		assert.strictEqual(filter.isIgnored(subOut.resource, root.resource, true), false, 'subOut should no longer be ignored after deletion');
	});

	test('serializes update reads and recovers after read failures', async () => {
		const { root, createItem, filter, fileService } = createFilter({}, true);
		fileService.setContent('out/\n');

		const gitignore1 = createItem(root, '.gitignore', false);
		const folder = createItem(root, 'sub', true);
		const gitignore2 = createItem(folder, '.gitignore', false);

		// Initialize both ignore files
		let changed = Event.toPromise(filter.onDidChange);
		filter.filter(gitignore1, TreeVisibility.Visible);
		await changed;

		changed = Event.toPromise(filter.onDidChange);
		filter.filter(gitignore2, TreeVisibility.Visible);
		await changed;

		// Track readFile calls and control resolution
		const readEvents: string[] = [];
		const deferred1 = new DeferredPromise<void>();
		const deferred2 = new DeferredPromise<void>();

		const origReadFile = fileService.readFile.bind(fileService);
		fileService.readFile = async (resource, options) => {
			const name = resource.path.endsWith('sub/.gitignore') ? 'gitignore2' : 'gitignore1';
			readEvents.push(`start:${name}`);
			if (name === 'gitignore1') {
				await deferred1.p;
				readEvents.push(`end:${name}`);
				throw new Error('read failure');
			} else {
				await deferred2.p;
				readEvents.push(`end:${name}`);
				return origReadFile(resource, options);
			}
		};

		fileService.setContent('target/\n');
		const updateEvent = new FileChangesEvent([
			{ resource: gitignore1.resource, type: FileChangeType.UPDATED },
			{ resource: gitignore2.resource, type: FileChangeType.UPDATED },
		], false);

		fileService.fireFileChanges(updateEvent);

		// Verify gitignore1 read started, but gitignore2 has NOT started yet (strictly serialized)
		assert.deepStrictEqual(readEvents, ['start:gitignore1']);

		// Settle gitignore1 with failure
		deferred1.complete();
		await timeout(0);

		// Verify gitignore2 only starts after gitignore1 settles, proving rejection does not abort subsequent updates
		assert.deepStrictEqual(readEvents, ['start:gitignore1', 'end:gitignore1', 'start:gitignore2']);

		// Settle gitignore2 successfully
		deferred2.complete();
		await timeout(0);

		assert.deepStrictEqual(readEvents, ['start:gitignore1', 'end:gitignore1', 'start:gitignore2', 'end:gitignore2']);

		// Verify gitignore2 update was processed despite gitignore1 failure
		const subTarget = createItem(folder, 'target', true);
		assert.strictEqual(filter.isIgnored(subTarget.resource, root.resource, true), true);
	});
});

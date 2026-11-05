/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { TreeVisibility } from '../../../../../base/browser/ui/tree/tree.js';
import { Event } from '../../../../../base/common/event.js';
import { IExpression } from '../../../../../base/common/glob.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
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
});

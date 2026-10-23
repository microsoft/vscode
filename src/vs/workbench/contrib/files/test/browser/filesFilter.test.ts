/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { TreeVisibility } from '../../../../../base/browser/ui/tree/tree.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Event } from '../../../../../base/common/event.js';
import { Schemas } from '../../../../../base/common/network.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { testWorkspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { TestContextService } from '../../../../test/common/workbenchTestServices.js';
import { FilesFilter } from '../../browser/views/explorerViewer.js';
import { IExplorerService } from '../../browser/files.js';
import { ExplorerItem } from '../../common/explorerModel.js';

suite('Files - FilesFilter', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('hides gitignored paths like git, including folders whose own .gitignore ignores everything', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
		const root = URI.from({ scheme: Schemas.inMemory, path: '/repo' });
		const other = URI.from({ scheme: Schemas.inMemory, path: '/other' });

		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IWorkspaceContextService, new TestContextService(testWorkspace(root, other)));
		instantiationService.stub(IConfigurationService, new TestConfigurationService({ files: { exclude: {} }, explorer: { excludeGitIgnore: true } }));
		instantiationService.stub(IExplorerService, {});
		instantiationService.stub(IEditorService, { onDidVisibleEditorsChange: Event.None, visibleEditors: [] });
		instantiationService.stub(IUriIdentityService, disposables.add(new UriIdentityService(fileService)));
		const filter = disposables.add(instantiationService.createInstance(FilesFilter));

		// The Explorer reads an ignore file when it shows it
		const ignoreFiles: [URI, string, string][] = [
			[root, '.gitignore', '/target/\n'],
			[root, '.pytest_cache/.gitignore', '# Created by pytest automatically.\n*\n'],
			[root, 'bfdd/.gitignore', 'bfdd\n'],
			[root, 'allowlist/.gitignore', '*\n!keep.txt\n'],
			[other, '.gitignore', '*\n'],
		];
		for (const [folder, path, contents] of ignoreFiles) {
			const resource = joinPath(folder, path);
			await fileService.writeFile(resource, VSBuffer.fromString(contents));
			const processed = Event.toPromise(filter.onDidChange);
			filter.filter(upcastPartial<ExplorerItem>({ name: '.gitignore', resource, root: upcastPartial<ExplorerItem>({ resource: folder }) }), TreeVisibility.Visible);
			await processed;
		}

		const paths: [URI, string, boolean][] = [
			[root, 'target', true], [root, 'src', true],
			[root, '.pytest_cache', true], [root, '.pytest_cache/README.md', false],
			[root, 'bfdd', true], [root, 'bfdd/bfdd', false], [root, 'bfdd/bfd.c', false],
			[root, 'allowlist', true], [root, 'allowlist/keep.txt', false], [root, 'allowlist/other.txt', false],
			[other, '', true], [other, 'file.txt', false],
		];
		const ignored = paths.filter(([folder, path, isDirectory]) => filter.isIgnored(joinPath(folder, path), folder, isDirectory)).map(([folder, path]) => `${folder.path}/${path}`);

		assert.deepStrictEqual(ignored, [
			'/repo/target',
			'/repo/.pytest_cache',
			'/repo/.pytest_cache/README.md',
			'/repo/bfdd/bfdd',
			'/repo/allowlist/other.txt',
			'/other/file.txt',
		]);
	});
});

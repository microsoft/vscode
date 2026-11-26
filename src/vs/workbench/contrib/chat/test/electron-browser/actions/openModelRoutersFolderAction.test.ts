/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { joinPath } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../../../platform/native/common/native.js';
import { IPathService } from '../../../../../services/path/common/pathService.js';
import { OpenModelRoutersFolderAction } from '../../../electron-browser/actions/openModelRoutersFolderAction.js';

suite('Open Model Routers Folder', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('shows the folder, creating it first, and a router inside it once it has one', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider(Schemas.file, store.add(new InMemoryFileSystemProvider())));
		const home = URI.file('/home/user');
		const shown: string[] = [];
		function userHome(options: { preferLocal: true }): URI;
		function userHome(options?: { preferLocal: boolean }): Promise<URI>;
		function userHome(options?: { preferLocal: boolean }): Promise<URI> | URI {
			return options?.preferLocal ? home : Promise.resolve(home);
		}
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IPathService, upcastPartial<IPathService>({ userHome }));
		instantiationService.stub(INativeHostService, upcastPartial<INativeHostService>({ showItemInFolder: async path => { shown.push(path); } }));
		const run = () => instantiationService.invokeFunction(accessor => new OpenModelRoutersFolderAction().run(accessor));
		const folder = joinPath(home, '.agents', 'model-routers');

		await run();
		const created = await fileService.exists(folder);
		const router = joinPath(folder, 'daily.model-router.yaml');
		await fileService.writeFile(router, VSBuffer.fromString('version: 1'));
		await run();

		assert.deepStrictEqual({ created, shown }, { created: true, shown: [folder.fsPath, router.fsPath] });
	});
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { tmpdir } from 'os';
import { FileService2 } from 'vs/workbench/services/files2/common/fileService2';
import { Schemas } from 'vs/base/common/network';
import { DiskFileSystemProvider } from 'vs/workbench/services/files2/node/diskFileSystemProvider';
import { getRandomTestPath } from 'vs/base/test/node/testUtils';
import { generateUuid } from 'vs/base/common/uuid';
import { join } from 'vs/base/common/path';
import { getPathFromAmdModule } from 'vs/base/common/amd';
import { copy, del } from 'vs/base/node/pfs';
import { URI } from 'vs/base/common/uri';
import { existsSync } from 'fs';
import { FileOperation, FileOperationEvent } from 'vs/platform/files/common/files';
import { FileService } from 'vs/workbench/services/files/node/fileService';
import { TestContextService, TestEnvironmentService, TestTextResourceConfigurationService, TestLifecycleService, TestStorageService } from 'vs/workbench/test/workbenchTestServices';
import { Workspace, toWorkspaceFolders } from 'vs/platform/workspace/common/workspace';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { TestNotificationService } from 'vs/platform/notification/test/common/testNotificationService';

suite('Disk File Service', () => {

	const parentDir = getRandomTestPath(tmpdir(), 'vsctests', 'diskfileservice');

	let service: FileService2;
	let testDir: string;

	setup(async () => {
		service = new FileService2();
		service.registerProvider(Schemas.file, new DiskFileSystemProvider());

		const id = generateUuid();
		testDir = join(parentDir, id);
		const sourceDir = getPathFromAmdModule(require, './fixtures/service');

		await copy(sourceDir, testDir);

		const legacyService = new FileService(new TestContextService(new Workspace(testDir, toWorkspaceFolders([{ path: testDir }]))), TestEnvironmentService, new TestTextResourceConfigurationService(), new TestConfigurationService(), new TestLifecycleService(), new TestStorageService(), new TestNotificationService(), { disableWatcher: true });
		service.setImpl(legacyService);
	});

	teardown(async () => {
		service.dispose();
		await del(parentDir, tmpdir());
	});

	test('createFolder', async () => {
		let event: FileOperationEvent;
		const toDispose = service.onAfterOperation(e => {
			event = e;
		});

		return service.resolveFile(URI.file(testDir)).then(parent => {
			const resource = URI.file(join(parent.resource.fsPath, 'newFolder'));

			return service.createFolder(resource).then(f => {
				assert.equal(f.name, 'newFolder');
				assert.equal(existsSync(f.resource.fsPath), true);

				assert.ok(event);
				assert.equal(event.resource.fsPath, resource.fsPath);
				assert.equal(event.operation, FileOperation.CREATE);
				assert.equal(event.target!.resource.fsPath, resource.fsPath);
				assert.equal(event.target!.isDirectory, true);
				toDispose.dispose();
			});
		});
	});

	test('createFolder: creating multiple folders at once', function () {
		let event: FileOperationEvent;
		const toDispose = service.onAfterOperation(e => {
			event = e;
		});

		const multiFolderPaths = ['a', 'couple', 'of', 'folders'];
		return service.resolveFile(URI.file(testDir)).then(parent => {
			const resource = URI.file(join(parent.resource.fsPath, ...multiFolderPaths));

			return service.createFolder(resource).then(f => {
				const lastFolderName = multiFolderPaths[multiFolderPaths.length - 1];
				assert.equal(f.name, lastFolderName);
				assert.equal(existsSync(f.resource.fsPath), true);

				assert.ok(event);
				assert.equal(event.resource.fsPath, resource.fsPath);
				assert.equal(event.operation, FileOperation.CREATE);
				assert.equal(event.target!.resource.fsPath, resource.fsPath);
				assert.equal(event.target!.isDirectory, true);
				toDispose.dispose();
			});
		});
	});
});
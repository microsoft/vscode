/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { FileService } from 'vs/platform/files/common/fileService';
import { InMemoryFileSystemProvider } from 'vs/platform/files/common/inMemoryFilesystemProvider';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { NullLogService } from 'vs/platform/log/common/log';
import { workbenchInstantiationService } from 'vs/workbench/test/browser/workbenchTestServices';
import { IExtensionStorageService, ExtensionStorageService } from 'vs/platform/extensionManagement/common/extensionStorage';
import { URI } from 'vs/base/common/uri';
import { joinPath } from 'vs/base/common/resources';
import { VSBuffer } from 'vs/base/common/buffer';
import { TestWorkspace } from 'vs/platform/workspace/test/common/testWorkspace';
import { migrateExtensionStorage } from 'vs/workbench/services/extensions/common/extensionStorageMigration';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IUserDataProfilesService, UserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { UserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfileService';
import { IUserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import { UriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentityService';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

suite('ExtensionStorageMigration', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const ROOT = URI.file('tests').with({ scheme: 'vscode-tests' });
	const workspaceStorageHome = joinPath(ROOT, 'workspaceStorageHome');

	let instantiationService: TestInstantiationService;

	setup(() => {
		instantiationService = workbenchInstantiationService(undefined, disposables);

		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(ROOT.scheme, disposables.add(new InMemoryFileSystemProvider())));
		instantiationService.stub(IFileService, fileService);
		const environmentService = instantiationService.stub(IEnvironmentService, { userRoamingDataHome: ROOT, workspaceStorageHome, cacheHome: ROOT });
		const userDataProfilesService = instantiationService.stub(IUserDataProfilesService, disposables.add(new UserDataProfilesService(environmentService, fileService, disposables.add(new UriIdentityService(fileService)), new NullLogService())));
		instantiationService.stub(IUserDataProfileService, disposables.add(new UserDataProfileService(userDataProfilesService.defaultProfile)));

		instantiationService.stub(IExtensionStorageService, disposables.add(instantiationService.createInstance(ExtensionStorageService)));
	});

	test('migrate extension storage', async () => {
		const fromExtensionId = 'pub.from', toExtensionId = 'pub.to', storageMigratedKey = `extensionStorage.migrate.${fromExtensionId}-${toExtensionId}`;
		const extensionStorageService = instantiationService.get(IExtensionStorageService), fileService = instantiationService.get(IFileService), storageService = instantiationService.get(IStorageService), userDataProfilesService = instantiationService.get(IUserDataProfilesService);

		extensionStorageService.setExtensionState(fromExtensionId, { globalKey: 'hello global state' }, true);
		extensionStorageService.setExtensionState(fromExtensionId, { workspaceKey: 'hello workspace state' }, false);
		await fileService.writeFile(joinPath(userDataProfilesService.defaultProfile.globalStorageHome, fromExtensionId), VSBuffer.fromString('hello global storage'));
		await fileService.writeFile(joinPath(workspaceStorageHome, TestWorkspace.id, fromExtensionId), VSBuffer.fromString('hello workspace storage'));

		await migrateExtensionStorage(fromExtensionId, toExtensionId, true, instantiationService);
		await migrateExtensionStorage(fromExtensionId, toExtensionId, false, instantiationService);

		assert.deepStrictEqual(extensionStorageService.getExtensionState(fromExtensionId, true), undefined);
		assert.deepStrictEqual(extensionStorageService.getExtensionState(fromExtensionId, false), undefined);
		assert.deepStrictEqual((await fileService.exists(joinPath(userDataProfilesService.defaultProfile.globalStorageHome, fromExtensionId))), false);
		assert.deepStrictEqual((await fileService.exists(joinPath(workspaceStorageHome, TestWorkspace.id, fromExtensionId))), false);

		assert.deepStrictEqual(extensionStorageService.getExtensionState(toExtensionId, true), { globalKey: 'hello global state' });
		assert.deepStrictEqual(extensionStorageService.getExtensionState(toExtensionId, false), { workspaceKey: 'hello workspace state' });
		assert.deepStrictEqual((await fileService.readFile(joinPath(userDataProfilesService.defaultProfile.globalStorageHome, toExtensionId))).value.toString(), 'hello global storage');
		assert.deepStrictEqual((await fileService.readFile(joinPath(workspaceStorageHome, TestWorkspace.id, toExtensionId))).value.toString(), 'hello workspace storage');

		assert.deepStrictEqual(storageService.get(storageMigratedKey, StorageScope.PROFILE), 'true');
		assert.deepStrictEqual(storageService.get(storageMigratedKey, StorageScope.WORKSPACE), 'true');

	});

	test('migrate extension storage when does not exist', async () => {
		const fromExtensionId = 'pub.from', toExtensionId = 'pub.to', storageMigratedKey = `extensionStorage.migrate.${fromExtensionId}-${toExtensionId}`;
		const extensionStorageService = instantiationService.get(IExtensionStorageService), fileService = instantiationService.get(IFileService), storageService = instantiationService.get(IStorageService), userDataProfilesService = instantiationService.get(IUserDataProfilesService);

		await migrateExtensionStorage(fromExtensionId, toExtensionId, true, instantiationService);
		await migrateExtensionStorage(fromExtensionId, toExtensionId, false, instantiationService);

		assert.deepStrictEqual(extensionStorageService.getExtensionState(fromExtensionId, true), undefined);
		assert.deepStrictEqual(extensionStorageService.getExtensionState(fromExtensionId, false), undefined);
		assert.deepStrictEqual((await fileService.exists(joinPath(userDataProfilesService.defaultProfile.globalStorageHome, fromExtensionId))), false);
		assert.deepStrictEqual((await fileService.exists(joinPath(workspaceStorageHome, TestWorkspace.id, fromExtensionId))), false);

		assert.deepStrictEqual(extensionStorageService.getExtensionState(toExtensionId, true), undefined);
		assert.deepStrictEqual(extensionStorageService.getExtensionState(toExtensionId, false), undefined);
		assert.deepStrictEqual((await fileService.exists(joinPath(userDataProfilesService.defaultProfile.globalStorageHome, toExtensionId))), false);
		assert.deepStrictEqual((await fileService.exists(joinPath(workspaceStorageHome, TestWorkspace.id, toExtensionId))), false);

		assert.deepStrictEqual(storageService.get(storageMigratedKey, StorageScope.PROFILE), 'true');
		assert.deepStrictEqual(storageService.get(storageMigratedKey, StorageScope.WORKSPACE), 'true');

	});


});

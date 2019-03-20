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
import { join, basename } from 'vs/base/common/path';
import { getPathFromAmdModule } from 'vs/base/common/amd';
import { copy, del } from 'vs/base/node/pfs';
import { URI } from 'vs/base/common/uri';
import { existsSync } from 'fs';
import { FileOperation, FileOperationEvent, IFileStat } from 'vs/platform/files/common/files';
import { FileService } from 'vs/workbench/services/files/node/fileService';
import { TestContextService, TestEnvironmentService, TestTextResourceConfigurationService, TestLifecycleService, TestStorageService } from 'vs/workbench/test/workbenchTestServices';
import { Workspace, toWorkspaceFolders } from 'vs/platform/workspace/common/workspace';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { TestNotificationService } from 'vs/platform/notification/test/common/testNotificationService';
import { NullLogService } from 'vs/platform/log/common/log';

function getByName(root: IFileStat, name: string): IFileStat | null {
	if (root.children === undefined) {
		return null;
	}

	for (const child of root.children) {
		if (child.name === name) {
			return child;
		}
	}

	return null;
}

suite('Disk File Service', () => {

	const parentDir = getRandomTestPath(tmpdir(), 'vsctests', 'diskfileservice');

	let service: FileService2;
	let testDir: string;

	setup(async () => {
		service = new FileService2(new NullLogService());
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
		let event: FileOperationEvent | undefined;
		const toDispose = service.onAfterOperation(e => {
			event = e;
		});

		const parent = await service.resolveFile(URI.file(testDir));

		const resource = URI.file(join(parent.resource.fsPath, 'newFolder'));

		const folder = await service.createFolder(resource);

		assert.equal(folder.name, 'newFolder');
		assert.equal(existsSync(folder.resource.fsPath), true);

		assert.ok(event);
		assert.equal(event!.resource.fsPath, resource.fsPath);
		assert.equal(event!.operation, FileOperation.CREATE);
		assert.equal(event!.target!.resource.fsPath, resource.fsPath);
		assert.equal(event!.target!.isDirectory, true);

		toDispose.dispose();
	});

	test('createFolder: creating multiple folders at once', async function () {
		let event: FileOperationEvent;
		const toDispose = service.onAfterOperation(e => {
			event = e;
		});

		const multiFolderPaths = ['a', 'couple', 'of', 'folders'];
		const parent = await service.resolveFile(URI.file(testDir));

		const resource = URI.file(join(parent.resource.fsPath, ...multiFolderPaths));

		const folder = await service.createFolder(resource);

		const lastFolderName = multiFolderPaths[multiFolderPaths.length - 1];
		assert.equal(folder.name, lastFolderName);
		assert.equal(existsSync(folder.resource.fsPath), true);

		assert.ok(event!);
		assert.equal(event!.resource.fsPath, resource.fsPath);
		assert.equal(event!.operation, FileOperation.CREATE);
		assert.equal(event!.target!.resource.fsPath, resource.fsPath);
		assert.equal(event!.target!.isDirectory, true);

		toDispose.dispose();
	});

	test('existsFile', async () => {
		let exists = await service.existsFile(URI.file(testDir));
		assert.equal(exists, true);

		exists = await service.existsFile(URI.file(testDir + 'something'));
		assert.equal(exists, false);
	});

	test('resolveFile', async () => {
		const resolved = await service.resolveFile(URI.file(testDir), { resolveTo: [URI.file(join(testDir, 'deep'))] });
		assert.equal(resolved.children!.length, 8);

		const deep = (getByName(resolved, 'deep')!);
		assert.equal(deep.children!.length, 4);
	});

	test('resolveFile - directory', async () => {
		const testsElements = ['examples', 'other', 'index.html', 'site.css'];

		const result = await service.resolveFile(URI.file(getPathFromAmdModule(require, './fixtures/resolver')));

		assert.ok(result);
		assert.ok(result.children);
		assert.ok(result.children!.length > 0);
		assert.ok(result!.isDirectory);
		assert.equal(result.children!.length, testsElements.length);

		assert.ok(result.children!.every((entry) => {
			return testsElements.some((name) => {
				return basename(entry.resource.fsPath) === name;
			});
		}));

		result.children!.forEach((value) => {
			assert.ok(basename(value.resource.fsPath));
			if (['examples', 'other'].indexOf(basename(value.resource.fsPath)) >= 0) {
				assert.ok(value.isDirectory);
			} else if (basename(value.resource.fsPath) === 'index.html') {
				assert.ok(!value.isDirectory);
				assert.ok(!value.children);
			} else if (basename(value.resource.fsPath) === 'site.css') {
				assert.ok(!value.isDirectory);
				assert.ok(!value.children);
			} else {
				assert.ok(!'Unexpected value ' + basename(value.resource.fsPath));
			}
		});
	});

	test('resolveFile - directory - resolveTo single directory', async () => {
		const resolverFixturesPath = getPathFromAmdModule(require, './fixtures/resolver');
		const result = await service.resolveFile(URI.file(resolverFixturesPath), { resolveTo: [URI.file(join(resolverFixturesPath, 'other/deep'))] });

		assert.ok(result);
		assert.ok(result.children);
		assert.ok(result.children!.length > 0);
		assert.ok(result.isDirectory);

		const children = result.children!;
		assert.equal(children.length, 4);

		const other = getByName(result, 'other');
		assert.ok(other);
		assert.ok(other!.children!.length > 0);

		const deep = getByName(other!, 'deep');
		assert.ok(deep);
		assert.ok(deep!.children!.length > 0);
		assert.equal(deep!.children!.length, 4);
	});

	test('resolve directory - resolveTo multiple directories', async () => {
		const resolverFixturesPath = getPathFromAmdModule(require, './fixtures/resolver');
		const result = await service.resolveFile(URI.file(resolverFixturesPath), {
			resolveTo: [
				URI.file(join(resolverFixturesPath, 'other/deep')),
				URI.file(join(resolverFixturesPath, 'examples'))
			]
		});

		assert.ok(result);
		assert.ok(result.children);
		assert.ok(result.children!.length > 0);
		assert.ok(result.isDirectory);

		const children = result.children!;
		assert.equal(children.length, 4);

		const other = getByName(result, 'other');
		assert.ok(other);
		assert.ok(other!.children!.length > 0);

		const deep = getByName(other!, 'deep');
		assert.ok(deep);
		assert.ok(deep!.children!.length > 0);
		assert.equal(deep!.children!.length, 4);

		const examples = getByName(result, 'examples');
		assert.ok(examples);
		assert.ok(examples!.children!.length > 0);
		assert.equal(examples!.children!.length, 4);
	});

	test('resolve directory - resolveSingleChildFolders', async () => {
		const resolverFixturesPath = getPathFromAmdModule(require, './fixtures/resolver/other');
		const result = await service.resolveFile(URI.file(resolverFixturesPath), { resolveSingleChildDescendants: true });

		assert.ok(result);
		assert.ok(result.children);
		assert.ok(result.children!.length > 0);
		assert.ok(result.isDirectory);

		const children = result.children!;
		assert.equal(children.length, 1);

		let deep = getByName(result, 'deep');
		assert.ok(deep);
		assert.ok(deep!.children!.length > 0);
		assert.equal(deep!.children!.length, 4);
	});

	test('resolveFiles', async () => {
		const res = await service.resolveFiles([
			{ resource: URI.file(testDir), options: { resolveTo: [URI.file(join(testDir, 'deep'))] } },
			{ resource: URI.file(join(testDir, 'deep')) }
		]);

		const r1 = (res[0].stat!);
		assert.equal(r1.children!.length, 8);

		const deep = (getByName(r1, 'deep')!);
		assert.equal(deep.children!.length, 4);

		const r2 = (res[1].stat!);
		assert.equal(r2.children!.length, 4);
		assert.equal(r2.name, 'deep');
	});

	test('deleteFile', async () => {
		let event: FileOperationEvent;
		const toDispose = service.onAfterOperation(e => {
			event = e;
		});

		const resource = URI.file(join(testDir, 'deep', 'conway.js'));
		const source = await service.resolveFile(resource);

		await service.del(source.resource);

		assert.equal(existsSync(source.resource.fsPath), false);
		assert.ok(event!);
		assert.equal(event!.resource.fsPath, resource.fsPath);
		assert.equal(event!.operation, FileOperation.DELETE);

		toDispose.dispose();
	});

	test('deleteFolder (recursive)', async () => {
		let event: FileOperationEvent;
		const toDispose = service.onAfterOperation(e => {
			event = e;
		});

		const resource = URI.file(join(testDir, 'deep'));
		const source = await service.resolveFile(resource);

		await service.del(source.resource, { recursive: true });

		assert.equal(existsSync(source.resource.fsPath), false);
		assert.ok(event!);
		assert.equal(event!.resource.fsPath, resource.fsPath);
		assert.equal(event!.operation, FileOperation.DELETE);

		toDispose.dispose();
	});

	test('deleteFolder (non recursive)', async () => {
		const resource = URI.file(join(testDir, 'deep'));
		const source = await service.resolveFile(resource);
		try {
			await service.del(source.resource);
			return Promise.reject(new Error('Unexpected'));
		}
		catch (error) {
			return Promise.resolve(true);
		}
	});
});
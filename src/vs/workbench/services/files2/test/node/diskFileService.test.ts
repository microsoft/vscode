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
import { join, basename, dirname, posix } from 'vs/base/common/path';
import { getPathFromAmdModule } from 'vs/base/common/amd';
import { copy, del } from 'vs/base/node/pfs';
import { URI } from 'vs/base/common/uri';
import { existsSync, statSync, readdirSync } from 'fs';
import { FileOperation, FileOperationEvent, IFileStat, FileOperationResult } from 'vs/platform/files/common/files';
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
		service.setLegacyService(legacyService);
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

		assert.ok(result.children!.every(entry => {
			return testsElements.some(name => {
				return basename(entry.resource.fsPath) === name;
			});
		}));

		result.children!.forEach(value => {
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

	test('resolveFile - directory - with metadata', async () => {
		const testsElements = ['examples', 'other', 'index.html', 'site.css'];

		const result = await service.resolveFile(URI.file(getPathFromAmdModule(require, './fixtures/resolver')), { resolveMetadata: true });

		assert.ok(result);
		assert.ok(result.children);
		assert.ok(result.children!.length > 0);
		assert.ok(result!.isDirectory);
		assert.equal(result.children!.length, testsElements.length);

		assert.ok(result.children!.every(entry => {
			return testsElements.some(name => {
				return basename(entry.resource.fsPath) === name;
			});
		}));

		assert.ok(result.children!.every(entry => entry.etag.length > 0));

		result.children!.forEach(value => {
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

	test('renameFile', async () => {
		let event: FileOperationEvent;
		const toDispose = service.onAfterOperation(e => {
			event = e;
		});

		const resource = URI.file(join(testDir, 'index.html'));
		const source = await service.resolveFile(resource);

		const renamed = await service.moveFile(source.resource, URI.file(join(dirname(source.resource.fsPath), 'other.html')));

		assert.equal(existsSync(renamed.resource.fsPath), true);
		assert.equal(existsSync(source.resource.fsPath), false);
		assert.ok(event!);
		assert.equal(event!.resource.fsPath, resource.fsPath);
		assert.equal(event!.operation, FileOperation.MOVE);
		assert.equal(event!.target!.resource.fsPath, renamed.resource.fsPath);

		toDispose.dispose();
	});

	test('renameFile - multi folder', async () => {
		let event: FileOperationEvent;
		const toDispose = service.onAfterOperation(e => {
			event = e;
		});

		const multiFolderPaths = ['a', 'couple', 'of', 'folders'];
		const renameToPath = join(...multiFolderPaths, 'other.html');

		const resource = URI.file(join(testDir, 'index.html'));
		const source = await service.resolveFile(resource);

		const renamed = await service.moveFile(source.resource, URI.file(join(dirname(source.resource.fsPath), renameToPath)));

		assert.equal(existsSync(renamed.resource.fsPath), true);
		assert.equal(existsSync(source.resource.fsPath), false);
		assert.ok(event!);
		assert.equal(event!.resource.fsPath, resource.fsPath);
		assert.equal(event!.operation, FileOperation.MOVE);
		assert.equal(event!.target!.resource.fsPath, renamed.resource.fsPath);

		toDispose.dispose();
	});

	test('renameFolder', async () => {
		let event: FileOperationEvent;
		const toDispose = service.onAfterOperation(e => {
			event = e;
		});

		const resource = URI.file(join(testDir, 'deep'));
		const source = await service.resolveFile(resource);

		const renamed = await service.moveFile(source.resource, URI.file(join(dirname(source.resource.fsPath), 'deeper')));

		assert.equal(existsSync(renamed.resource.fsPath), true);
		assert.equal(existsSync(source.resource.fsPath), false);
		assert.ok(event!);
		assert.equal(event!.resource.fsPath, resource.fsPath);
		assert.equal(event!.operation, FileOperation.MOVE);
		assert.equal(event!.target!.resource.fsPath, renamed.resource.fsPath);

		toDispose.dispose();
	});

	test('renameFolder - multi folder', async () => {
		let event: FileOperationEvent;
		const toDispose = service.onAfterOperation(e => {
			event = e;
		});

		const multiFolderPaths = ['a', 'couple', 'of', 'folders'];
		const renameToPath = join(...multiFolderPaths);

		const resource = URI.file(join(testDir, 'deep'));
		const source = await service.resolveFile(resource);

		const renamed = await service.moveFile(source.resource, URI.file(join(dirname(source.resource.fsPath), renameToPath)));

		assert.equal(existsSync(renamed.resource.fsPath), true);
		assert.equal(existsSync(source.resource.fsPath), false);
		assert.ok(event!);
		assert.equal(event!.resource.fsPath, resource.fsPath);
		assert.equal(event!.operation, FileOperation.MOVE);
		assert.equal(event!.target!.resource.fsPath, renamed.resource.fsPath);

		toDispose.dispose();
	});
	test('renameFile - MIX CASE', function () {
		let event: FileOperationEvent;
		const toDispose = service.onAfterOperation(e => {
			event = e;
		});

		const resource = URI.file(join(testDir, 'index.html'));
		return service.resolveFile(resource).then(source => {
			return service.moveFile(source.resource, URI.file(join(dirname(source.resource.fsPath), 'INDEX.html'))).then(renamed => {
				assert.equal(existsSync(renamed.resource.fsPath), true);
				assert.equal(basename(renamed.resource.fsPath), 'INDEX.html');

				assert.ok(event);
				assert.equal(event.resource.fsPath, resource.fsPath);
				assert.equal(event.operation, FileOperation.MOVE);
				assert.equal(event.target!.resource.fsPath, renamed.resource.fsPath);
				toDispose.dispose();
			});
		});
	});

	test('moveFile', async () => {
		let event: FileOperationEvent;
		const toDispose = service.onAfterOperation(e => {
			event = e;
		});

		const resource = URI.file(join(testDir, 'index.html'));
		const source = await service.resolveFile(resource);

		const renamed = await service.moveFile(source.resource, URI.file(join(testDir, 'other.html')));

		assert.equal(existsSync(renamed.resource.fsPath), true);
		assert.equal(existsSync(source.resource.fsPath), false);
		assert.ok(event!);
		assert.equal(event!.resource.fsPath, resource.fsPath);
		assert.equal(event!.operation, FileOperation.MOVE);
		assert.equal(event!.target!.resource.fsPath, renamed.resource.fsPath);

		toDispose.dispose();
	});

	test('move - source parent of target', async () => {
		let event: FileOperationEvent;
		const toDispose = service.onAfterOperation(e => {
			event = e;
		});

		await service.resolveFile(URI.file(join(testDir, 'index.html')));
		try {
			await service.moveFile(URI.file(testDir), URI.file(join(testDir, 'binary.txt')));
		} catch (e) {
			assert.ok(e);
			assert.ok(!event!);
			toDispose.dispose();
		}
	});

	test('move - FILE_MOVE_CONFLICT', async () => {
		let event: FileOperationEvent;
		const toDispose = service.onAfterOperation(e => {
			event = e;
		});

		const source = await service.resolveFile(URI.file(join(testDir, 'index.html')));
		try {
			await service.moveFile(source.resource, URI.file(join(testDir, 'binary.txt')));
		} catch (e) {
			assert.equal(e.fileOperationResult, FileOperationResult.FILE_MOVE_CONFLICT);
			assert.ok(!event!);
			toDispose.dispose();
		}
	});

	test('moveFile - MIX CASE', async () => {
		let event: FileOperationEvent;
		const toDispose = service.onAfterOperation(e => {
			event = e;
		});

		const resource = URI.file(join(testDir, 'index.html'));
		const source = await service.resolveFile(resource);

		const renamed = await service.moveFile(source.resource, URI.file(join(testDir, 'INDEX.html')));

		assert.equal(existsSync(renamed.resource.fsPath), true);
		assert.equal(basename(renamed.resource.fsPath), 'INDEX.html');
		assert.ok(event!);
		assert.equal(event!.resource.fsPath, resource.fsPath);
		assert.equal(event!.operation, FileOperation.MOVE);
		assert.equal(event!.target!.resource.fsPath, renamed.resource.fsPath);

		toDispose.dispose();
	});

	test('moveFile - overwrite folder with file', async () => {
		let createEvent: FileOperationEvent;
		let moveEvent: FileOperationEvent;
		let deleteEvent: FileOperationEvent;
		const toDispose = service.onAfterOperation(e => {
			if (e.operation === FileOperation.CREATE) {
				createEvent = e;
			} else if (e.operation === FileOperation.DELETE) {
				deleteEvent = e;
			} else if (e.operation === FileOperation.MOVE) {
				moveEvent = e;
			}
		});

		const parent = await service.resolveFile(URI.file(testDir));
		const folderResource = URI.file(join(parent.resource.fsPath, 'conway.js'));
		const f = await service.createFolder(folderResource);
		const resource = URI.file(join(testDir, 'deep', 'conway.js'));

		const moved = await service.moveFile(resource, f.resource, true);

		assert.equal(existsSync(moved.resource.fsPath), true);
		assert.ok(statSync(moved.resource.fsPath).isFile);
		assert.ok(createEvent!);
		assert.ok(deleteEvent!);
		assert.ok(moveEvent!);
		assert.equal(moveEvent!.resource.fsPath, resource.fsPath);
		assert.equal(moveEvent!.target!.resource.fsPath, moved.resource.fsPath);
		assert.equal(deleteEvent!.resource.fsPath, folderResource.fsPath);

		toDispose.dispose();
	});

	test('copyFile', async () => {
		let event: FileOperationEvent;
		const toDispose = service.onAfterOperation(e => {
			event = e;
		});

		const source = await service.resolveFile(URI.file(join(testDir, 'index.html')));
		const resource = URI.file(join(testDir, 'other.html'));

		const copied = await service.copyFile(source.resource, resource);

		assert.equal(existsSync(copied.resource.fsPath), true);
		assert.equal(existsSync(source.resource.fsPath), true);
		assert.ok(event!);
		assert.equal(event!.resource.fsPath, source.resource.fsPath);
		assert.equal(event!.operation, FileOperation.COPY);
		assert.equal(event!.target!.resource.fsPath, copied.resource.fsPath);
		toDispose.dispose();
	});

	test('copyFile - overwrite folder with file', async () => {
		let createEvent: FileOperationEvent;
		let copyEvent: FileOperationEvent;
		let deleteEvent: FileOperationEvent;
		const toDispose = service.onAfterOperation(e => {
			if (e.operation === FileOperation.CREATE) {
				createEvent = e;
			} else if (e.operation === FileOperation.DELETE) {
				deleteEvent = e;
			} else if (e.operation === FileOperation.COPY) {
				copyEvent = e;
			}
		});

		const parent = await service.resolveFile(URI.file(testDir));
		const folderResource = URI.file(join(parent.resource.fsPath, 'conway.js'));
		const f = await service.createFolder(folderResource);
		const resource = URI.file(join(testDir, 'deep', 'conway.js'));

		const copied = await service.copyFile(resource, f.resource, true);

		assert.equal(existsSync(copied.resource.fsPath), true);
		assert.ok(statSync(copied.resource.fsPath).isFile);
		assert.ok(createEvent!);
		assert.ok(deleteEvent!);
		assert.ok(copyEvent!);
		assert.equal(copyEvent!.resource.fsPath, resource.fsPath);
		assert.equal(copyEvent!.target!.resource.fsPath, copied.resource.fsPath);
		assert.equal(deleteEvent!.resource.fsPath, folderResource.fsPath);

		toDispose.dispose();
	});

	test('copyFile - MIX CASE', async () => {
		const source = await service.resolveFile(URI.file(join(testDir, 'index.html')));
		const renamed = await service.moveFile(source.resource, URI.file(join(dirname(source.resource.fsPath), 'CONWAY.js')));
		assert.equal(existsSync(renamed.resource.fsPath), true);
		assert.ok(readdirSync(testDir).some(f => f === 'CONWAY.js'));
		const source_1 = await service.resolveFile(URI.file(join(testDir, 'deep', 'conway.js')));
		const targetParent = URI.file(testDir);
		const target = targetParent.with({ path: posix.join(targetParent.path, posix.basename(source_1.resource.path)) });

		const res = await service.copyFile(source_1.resource, target, true);
		assert.equal(existsSync(res.resource.fsPath), true);
		assert.ok(readdirSync(testDir).some(f => f === 'conway.js'));
	});

	test('copyFile - same file should throw', async () => {
		const source = await service.resolveFile(URI.file(join(testDir, 'index.html')));
		const targetParent = URI.file(dirname(source.resource.fsPath));
		const target = targetParent.with({ path: posix.join(targetParent.path, posix.basename(source.resource.path)) });

		try {
			await service.copyFile(source.resource, target, true);
		} catch (error) {
			assert.ok(error);
		}
	});
});
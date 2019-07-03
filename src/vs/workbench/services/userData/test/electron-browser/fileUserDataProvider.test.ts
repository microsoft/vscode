/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as os from 'os';
import * as path from 'vs/base/common/path';
import * as uuid from 'vs/base/common/uuid';
import * as pfs from 'vs/base/node/pfs';
import { IFileService } from 'vs/platform/files/common/files';
import { FileService } from 'vs/workbench/services/files/common/fileService';
import { NullLogService } from 'vs/platform/log/common/log';
import { Schemas } from 'vs/base/common/network';
import { UserDataFileSystemProvider } from 'vs/workbench/services/userData/common/userDataFileSystemProvider';
import { URI } from 'vs/base/common/uri';
import { FileUserDataProvider } from 'vs/workbench/services/userData/common/fileUserDataProvider';
import { joinPath } from 'vs/base/common/resources';
import { VSBuffer } from 'vs/base/common/buffer';
import { DiskFileSystemProvider } from 'vs/workbench/services/files/electron-browser/diskFileSystemProvider';
import { Registry } from 'vs/platform/registry/common/platform';
import { IUserDataContainerRegistry, Extensions } from 'vs/workbench/services/userData/common/userData';
import { BACKUPS } from 'vs/platform/environment/common/environment';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { isLinux } from 'vs/base/common/platform';

suite('FileUserDataProvider', () => {

	let testObject: IFileService;
	let rootPath: string;
	let userDataPath: string;
	let backupsPath: string;
	let userDataResource: URI;
	const userDataContainersRegistry = Registry.as<IUserDataContainerRegistry>(Extensions.UserDataContainers);
	const disposables = new DisposableStore();

	setup(async () => {
		const logService = new NullLogService();
		testObject = new FileService(logService);
		disposables.add(testObject);

		const diskFileSystemProvider = new DiskFileSystemProvider(logService);
		disposables.add(diskFileSystemProvider);
		disposables.add(testObject.registerProvider(Schemas.file, diskFileSystemProvider));

		rootPath = path.join(os.tmpdir(), 'vsctests', uuid.generateUuid());
		userDataPath = path.join(rootPath, 'user');
		backupsPath = path.join(rootPath, BACKUPS);
		userDataResource = URI.from({ scheme: Schemas.userData, path: '/user' });
		await Promise.all([pfs.mkdirp(userDataPath), pfs.mkdirp(backupsPath)]);

		const fileUserDataProvider = new FileUserDataProvider(URI.file(userDataPath), testObject);
		disposables.add(fileUserDataProvider);
		const userDataFileSystemProvider = new UserDataFileSystemProvider(userDataResource, fileUserDataProvider);
		disposables.add(userDataFileSystemProvider);
		disposables.add(testObject.registerProvider(Schemas.userData, userDataFileSystemProvider));

		userDataContainersRegistry.registerContainer('testContainer');
		userDataContainersRegistry.registerContainer('testContainer/subContainer');
		userDataContainersRegistry.registerContainer(BACKUPS);
	});

	teardown(async () => {
		disposables.clear();
		await pfs.rimraf(rootPath, pfs.RimRafMode.MOVE);
	});

	test('exists return false when file does not exist', async () => {
		const exists = await testObject.exists(joinPath(userDataResource, 'settings.json'));
		assert.equal(exists, false);
	});

	test('read file throws error if not exist', async () => {
		try {
			await testObject.readFile(joinPath(userDataResource, 'settings.json'));
			assert.fail('Should fail since file does not exist');
		} catch (e) { }
	});

	test('read existing file', async () => {
		await pfs.writeFile(path.join(userDataPath, 'settings.json'), '{}');
		const result = await testObject.readFile(joinPath(userDataResource, 'settings.json'));
		assert.equal(result.value, '{}');
	});

	test('create file', async () => {
		await testObject.createFile(joinPath(userDataResource, 'settings.json'), VSBuffer.fromString('{}'));
		const result = await pfs.readFile(path.join(userDataPath, 'settings.json'));
		assert.equal(result, '{}');
	});

	test('write file creates the file if not exist', async () => {
		await testObject.writeFile(joinPath(userDataResource, 'settings.json'), VSBuffer.fromString('{}'));
		const result = await pfs.readFile(path.join(userDataPath, 'settings.json'));
		assert.equal(result, '{}');
	});

	test('write to existing file', async () => {
		await pfs.writeFile(path.join(userDataPath, 'settings.json'), '{}');
		await testObject.writeFile(joinPath(userDataResource, 'settings.json'), VSBuffer.fromString('{a:1}'));
		const result = await pfs.readFile(path.join(userDataPath, 'settings.json'));
		assert.equal(result, '{a:1}');
	});

	test('watch file - event is triggerred when file is created', async (done) => {
		if (!isLinux) {
			return done(); // watch tests are flaky on other platforms
		}
		const resource = joinPath(userDataResource, 'settings.json');
		disposables.add(testObject.watch(resource));
		testObject.onFileChanges(e => {
			if (e.contains(resource)) {
				done();
			}
		});
		await testObject.writeFile(resource, VSBuffer.fromString('{a:1}'));
	});

	test('watch file - event is triggerred when file is created externally', async (done) => {
		if (!isLinux) {
			return done(); // watch tests are flaky on other platforms
		}
		const resource = joinPath(userDataResource, 'settings.json');
		disposables.add(testObject.watch(resource));
		testObject.onFileChanges(e => {
			if (e.contains(resource)) {
				done();
			}
		});
		await pfs.writeFile(path.join(userDataPath, 'settings.json'), '{}');
	});

	test('watch file - event is triggerred when file is updated', async (done) => {
		if (!isLinux) {
			return done(); // watch tests are flaky on other platforms
		}
		const resource = joinPath(userDataResource, 'settings.json');
		await testObject.writeFile(resource, VSBuffer.fromString('{}'));
		disposables.add(testObject.watch(resource));
		testObject.onFileChanges(e => {
			if (e.contains(resource)) {
				done();
			}
		});
		await testObject.writeFile(resource, VSBuffer.fromString('{a:1}'));
	});

	test('watch file - event is triggerred when file is update externally', async (done) => {
		if (!isLinux) {
			return done(); // watch tests are flaky on other platforms
		}
		const resource = joinPath(userDataResource, 'settings.json');
		await testObject.writeFile(resource, VSBuffer.fromString('{}'));
		disposables.add(testObject.watch(resource));
		testObject.onFileChanges(e => {
			if (e.contains(resource)) {
				done();
			}
		});
		await pfs.writeFile(path.join(userDataPath, 'settings.json'), '{a:1}');
	});

	test('watch file - event is triggerred when file is deleted', async (done) => {
		if (!isLinux) {
			return done(); // watch tests are flaky on other platforms
		}
		const resource = joinPath(userDataResource, 'settings.json');
		await testObject.writeFile(resource, VSBuffer.fromString('{}'));
		disposables.add(testObject.watch(resource));
		testObject.onFileChanges(e => {
			if (e.contains(resource)) {
				done();
			}
		});
		await testObject.del(resource);
	});

	test('watch file - event is triggerred when file is deleted externally', async (done) => {
		if (!isLinux) {
			return done(); // watch tests are flaky on other platforms
		}
		const resource = joinPath(userDataResource, 'settings.json');
		await testObject.writeFile(resource, VSBuffer.fromString('{}'));
		disposables.add(testObject.watch(resource));
		testObject.onFileChanges(e => {
			if (e.contains(resource)) {
				done();
			}
		});
		await pfs.unlink(path.join(userDataPath, 'settings.json'));
	});

	test('delete file', async () => {
		await pfs.writeFile(path.join(userDataPath, 'settings.json'), '');
		await testObject.del(joinPath(userDataResource, 'settings.json'));
		const result = await pfs.exists(path.join(userDataPath, 'settings.json'));
		assert.equal(false, result);
	});

	test('resolve file', async () => {
		await pfs.writeFile(path.join(userDataPath, 'settings.json'), '');
		const result = await testObject.resolve(joinPath(userDataResource, 'settings.json'));
		assert.ok(!result.isDirectory);
		assert.ok(result.children === undefined);
	});

	test('exists return true for container', async () => {
		const exists = await testObject.exists(joinPath(userDataResource, 'testContainer'));
		assert.equal(exists, true);
	});

	test('exists return false for non registered container', async () => {
		await pfs.mkdirp(path.join(userDataPath, 'container'));
		const exists = await testObject.exists(joinPath(userDataResource, 'container'));
		assert.equal(exists, false);
	});

	test('read file throws error for container', async () => {
		try {
			await testObject.readFile(joinPath(userDataResource, 'testContainer'));
			assert.fail('Should fail since read file is not supported for container');
		} catch (e) { }
	});

	test('read file under container', async () => {
		await pfs.mkdirp(path.join(userDataPath, 'testContainer'));
		await pfs.writeFile(path.join(userDataPath, 'testContainer', 'settings.json'), '{}');
		const actual = await testObject.readFile(joinPath(userDataResource, 'testContainer/settings.json'));
		assert.equal(actual.value, '{}');
	});

	test('read file under sub container', async () => {
		await pfs.mkdirp(path.join(userDataPath, 'testContainer', 'subContainer'));
		await pfs.writeFile(path.join(userDataPath, 'testContainer', 'subContainer', 'settings.json'), '{}');
		const actual = await testObject.readFile(joinPath(userDataResource, 'testContainer/subContainer/settings.json'));
		assert.equal(actual.value, '{}');
	});

	test('create file throws error for container', async () => {
		try {
			await testObject.createFile(joinPath(userDataResource, 'testContainer'), VSBuffer.fromString('{}'));
			assert.fail('Should fail since create file is not supported for container');
		} catch (e) { }
	});

	test('create file under container that exists', async () => {
		await pfs.mkdirp(path.join(userDataPath, 'testContainer'));
		await testObject.createFile(joinPath(userDataResource, 'testContainer/settings.json'), VSBuffer.fromString('{}'));
		const actual = await pfs.readFile(path.join(userDataPath, 'testContainer', 'settings.json'));
		assert.equal(actual, '{}');
	});

	test('create file under container that does not exist', async () => {
		await testObject.createFile(joinPath(userDataResource, 'testContainer/settings.json'), VSBuffer.fromString('{}'));
		const actual = await pfs.readFile(path.join(userDataPath, 'testContainer', 'settings.json'));
		assert.equal(actual, '{}');
	});

	test('write file throws error for container', async () => {
		try {
			await testObject.writeFile(joinPath(userDataResource, 'testContainer'), VSBuffer.fromString('{}'));
			assert.fail('Should fail since write file is not supported for container');
		} catch (e) { }
	});

	test('write to not existing file under container that exists', async () => {
		await pfs.mkdirp(path.join(userDataPath, 'testContainer'));
		await testObject.writeFile(joinPath(userDataResource, 'testContainer/settings.json'), VSBuffer.fromString('{}'));
		const actual = await pfs.readFile(path.join(userDataPath, 'testContainer', 'settings.json'));
		assert.equal(actual, '{}');
	});

	test('write to not existing file under container that does not exists', async () => {
		await testObject.writeFile(joinPath(userDataResource, 'testContainer/settings.json'), VSBuffer.fromString('{}'));
		const actual = await pfs.readFile(path.join(userDataPath, 'testContainer', 'settings.json'));
		assert.equal(actual, '{}');
	});

	test('write to existing file under container', async () => {
		await pfs.mkdirp(path.join(userDataPath, 'testContainer'));
		await pfs.writeFile(path.join(userDataPath, 'testContainer', 'settings.json'), '{}');
		await testObject.writeFile(joinPath(userDataResource, 'testContainer/settings.json'), VSBuffer.fromString('{a:1}'));
		const actual = await pfs.readFile(path.join(userDataPath, 'testContainer', 'settings.json'));
		assert.equal(actual.toString(), '{a:1}');
	});

	test('write file under sub container', async () => {
		await testObject.writeFile(joinPath(userDataResource, 'testContainer/subContainer/settings.json'), VSBuffer.fromString('{}'));
		const actual = await pfs.readFile(path.join(userDataPath, 'testContainer', 'subContainer', 'settings.json'));
		assert.equal(actual, '{}');
	});

	test('delete file throws error for container that does not exist', async () => {
		try {
			await testObject.del(joinPath(userDataResource, 'testContainer'));
			assert.fail('Should fail since delete file is not supported for container');
		} catch (e) { }
	});

	test('delete file throws error for container that exist', async () => {
		await pfs.mkdirp(path.join(userDataPath, 'testContainer'));
		try {
			await testObject.del(joinPath(userDataResource, 'testContainer'));
			assert.fail('Should fail since delete file is not supported for container');
		} catch (e) { }
	});

	test('delete not existing file under container that exists', async () => {
		await pfs.mkdirp(path.join(userDataPath, 'testContainer'));
		try {
			await testObject.del(joinPath(userDataResource, 'testContainer'));
			assert.fail('Should fail since file does not exist');
		} catch (e) { }
	});

	test('delete not existing file under container that does not exists', async () => {
		try {
			await testObject.del(joinPath(userDataResource, 'testContainer/settings.json'));
			assert.fail('Should fail since file does not exist');
		} catch (e) { }
	});

	test('delete existing file under container', async () => {
		await pfs.mkdirp(path.join(userDataPath, 'testContainer'));
		pfs.writeFile(path.join(userDataPath, 'testContainer', 'settings.json'), '{}');
		await testObject.del(joinPath(userDataResource, 'testContainer/settings.json'));
		const exists = await pfs.exists(path.join(userDataPath, 'testContainer', 'settings.json'));
		assert.equal(exists, false);
	});

	test('resolve container', async () => {
		await pfs.mkdirp(path.join(userDataPath, 'testContainer'));
		pfs.writeFile(path.join(userDataPath, 'testContainer', 'settings.json'), '{}');
		const result = await testObject.resolve(joinPath(userDataResource, 'testContainer'));
		assert.ok(result.isDirectory);
		assert.ok(result.children !== undefined);
		assert.equal(result.children!.length, 1);
		assert.equal(result.children![0].name, 'settings.json');
	});

	test('watch file under container - event is triggerred when file is created', async (done) => {
		if (!isLinux) {
			return done(); // watch tests are flaky on other platforms
		}
		const resource = joinPath(userDataResource, 'testContainer/settings.json');
		disposables.add(testObject.watch(resource));
		testObject.onFileChanges(e => {
			if (e.contains(resource)) {
				done();
			}
		});
		await testObject.writeFile(joinPath(userDataResource, 'testContainer/settings.json'), VSBuffer.fromString('{a:1}'));
	});

	test('watch file under container - event is triggerred when file is created externally', async (done) => {
		if (!isLinux) {
			return done(); // watch tests are flaky on other platforms
		}
		const resource = joinPath(userDataResource, 'testContainer/settings.json');
		disposables.add(testObject.watch(resource));
		testObject.onFileChanges(e => {
			if (e.contains(resource)) {
				done();
			}
		});
		await pfs.mkdirp(path.join(userDataPath, 'testContainer'));
		await pfs.writeFile(path.join(userDataPath, 'testContainer', 'settings.json'), '{}');
	});

	test('watch file under container - event is triggerred when file is updated', async (done) => {
		if (!isLinux) {
			return done(); // watch tests are flaky on other platforms
		}
		const resource = joinPath(userDataResource, 'testContainer/settings.json');
		await pfs.mkdirp(path.join(userDataPath, 'testContainer'));
		await pfs.writeFile(path.join(userDataPath, 'testContainer', 'settings.json'), '{}');
		disposables.add(testObject.watch(resource));
		testObject.onFileChanges(e => {
			if (e.contains(resource)) {
				done();
			}
		});
		await testObject.writeFile(resource, VSBuffer.fromString('{a:1}'));
	});

	test('watch file under container - event is triggerred when file is updated externally', async (done) => {
		if (!isLinux) {
			return done(); // watch tests are flaky on other platforms
		}
		const resource = joinPath(userDataResource, 'testContainer/settings.json');
		await pfs.mkdirp(path.join(userDataPath, 'testContainer'));
		await pfs.writeFile(path.join(userDataPath, 'testContainer', 'settings.json'), '{}');
		disposables.add(testObject.watch(resource));
		testObject.onFileChanges(e => {
			if (e.contains(resource)) {
				done();
			}
		});
		await pfs.writeFile(path.join(userDataPath, 'testContainer', 'settings.json'), '{a:1}');
	});

	test('watch file under container - event is triggerred when file is deleted', async (done) => {
		if (!isLinux) {
			return done(); // watch tests are flaky on other platforms
		}
		const resource = joinPath(userDataResource, 'testContainer/settings.json');
		await testObject.writeFile(resource, VSBuffer.fromString('{}'));
		disposables.add(testObject.watch(resource));
		testObject.onFileChanges(e => {
			if (e.contains(resource)) {
				done();
			}
		});
		await testObject.del(resource);
	});

	test('watch file under container - event is triggerred when file is deleted externally', async (done) => {
		if (!isLinux) {
			return done(); // watch tests are flaky on other platforms
		}
		const resource = joinPath(userDataResource, 'testContainer/settings.json');
		await testObject.writeFile(resource, VSBuffer.fromString('{}'));
		disposables.add(testObject.watch(resource));
		testObject.onFileChanges(e => {
			if (e.contains(resource)) {
				done();
			}
		});
		await pfs.unlink(path.join(userDataPath, 'testContainer', 'settings.json'));
	});

	test('watch container - event is triggerred when file under container is created', async (done) => {
		if (!isLinux) {
			return done(); // watch tests are flaky on other platforms
		}
		const container = joinPath(userDataResource, 'testContainer');
		disposables.add(testObject.watch(container));
		testObject.onFileChanges(e => {
			if (e.contains(container)) {
				done();
			}
		});
		await testObject.writeFile(joinPath(userDataResource, 'testContainer/settings.json'), VSBuffer.fromString('{a:1}'));
	});

	test('watch container - event is triggerred when file under container is created externally', async (done) => {
		if (!isLinux) {
			return done(); // watch tests are flaky on other platforms
		}
		await pfs.mkdirp(path.join(userDataPath, 'testContainer'));
		const container = joinPath(userDataResource, 'testContainer');
		disposables.add(testObject.watch(container));
		testObject.onFileChanges(e => {
			if (e.contains(container)) {
				done();
			}
		});
		await pfs.writeFile(path.join(userDataPath, 'testContainer', 'settings.json'), '{}');
	});

	test('watch container - event is triggerred when file under container is deleted', async (done) => {
		if (!isLinux) {
			return done(); // watch tests are flaky on other platforms
		}
		const container = joinPath(userDataResource, 'testContainer');
		const resource = joinPath(userDataResource, 'testContainer/settings.json');
		await testObject.writeFile(resource, VSBuffer.fromString('{}'));
		disposables.add(testObject.watch(container));
		testObject.onFileChanges(e => {
			if (e.contains(container)) {
				done();
			}
		});
		await testObject.del(resource);
	});

	test('watch container - event is triggerred when file under container is deleted externally ', async (done) => {
		if (!isLinux) {
			return done(); // watch tests are flaky on other platforms
		}
		const container = joinPath(userDataResource, 'testContainer');
		const resource = joinPath(userDataResource, 'testContainer/settings.json');
		await testObject.writeFile(resource, VSBuffer.fromString('{}'));
		disposables.add(testObject.watch(container));
		testObject.onFileChanges(e => {
			if (e.contains(container)) {
				done();
			}
		});
		await pfs.unlink(path.join(userDataPath, 'testContainer', 'settings.json'));
	});

	test('read backup file', async () => {
		await pfs.writeFile(path.join(backupsPath, 'backup.json'), '{}');
		const result = await testObject.readFile(joinPath(userDataResource, `${BACKUPS}/backup.json`));
		assert.equal(result.value, '{}');
	});

	test('create backup file', async () => {
		await testObject.createFile(joinPath(userDataResource, `${BACKUPS}/backup.json`), VSBuffer.fromString('{}'));
		const result = await pfs.readFile(path.join(backupsPath, 'backup.json'));
		assert.equal(result, '{}');
	});

	test('write backup file', async () => {
		await pfs.writeFile(path.join(backupsPath, 'backup.json'), '{}');
		await testObject.writeFile(joinPath(userDataResource, `${BACKUPS}/backup.json`), VSBuffer.fromString('{a:1}'));
		const result = await pfs.readFile(path.join(backupsPath, 'backup.json'));
		assert.equal(result, '{a:1}');
	});

	test('resolve backups container', async () => {
		pfs.writeFile(path.join(backupsPath, 'backup.json'), '{}');
		const result = await testObject.resolve(joinPath(userDataResource, BACKUPS));
		assert.ok(result.isDirectory);
		assert.ok(result.children !== undefined);
		assert.equal(result.children!.length, 1);
		assert.equal(result.children![0].name, 'backup.json');
	});
});
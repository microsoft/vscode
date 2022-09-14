/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Emitter, Event } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { InMemoryStorageDatabase, IStorageItemsChangeEvent, IUpdateRequest, Storage } from 'vs/base/parts/storage/common/storage';
import { AbstractUserDataSyncProfilesStorageService, IUserDataSyncProfilesStorageService } from 'vs/platform/userDataSync/common/userDataSyncProfilesStorageService';
import { InMemoryStorageService, loadKeyTargets, StorageTarget, TARGET_KEY } from 'vs/platform/storage/common/storage';
import { IUserDataProfile, toUserDataProfile } from 'vs/platform/userDataProfile/common/userDataProfile';

class TestStorageDatabase extends InMemoryStorageDatabase {

	private readonly _onDidChangeItemsExternal = new Emitter<IStorageItemsChangeEvent>();
	override readonly onDidChangeItemsExternal = this._onDidChangeItemsExternal.event;

	override async updateItems(request: IUpdateRequest): Promise<void> {
		await super.updateItems(request);
		if (request.insert || request.delete) {
			this._onDidChangeItemsExternal.fire({ changed: request.insert, deleted: request.delete });
		}
	}
}

export class TestUserDataSyncProfilesStorageService extends AbstractUserDataSyncProfilesStorageService implements IUserDataSyncProfilesStorageService {

	readonly onDidChange = Event.None;
	private databases = new Map<string, InMemoryStorageDatabase>();

	async createStorageDatabase(profile: IUserDataProfile): Promise<InMemoryStorageDatabase> {
		let database = this.databases.get(profile.id);
		if (!database) {
			this.databases.set(profile.id, database = new TestStorageDatabase());
		}
		return database;
	}

	protected override async closeAndDispose(): Promise<void> { }
}

suite('ProfileStorageService', () => {

	const disposables = new DisposableStore();
	const profile = toUserDataProfile('test', 'test', URI.file('foo'));
	let testObject: TestUserDataSyncProfilesStorageService;
	let storage: Storage;

	setup(async () => {
		testObject = disposables.add(new TestUserDataSyncProfilesStorageService(new InMemoryStorageService()));
		storage = new Storage(await testObject.createStorageDatabase(profile));
		await storage.init();
	});

	teardown(() => disposables.clear());

	test('read empty storage', async () => {
		const actual = await testObject.readStorageData(profile);

		assert.strictEqual(actual.size, 0);
	});

	test('read storage with data', async () => {
		storage.set('foo', 'bar');
		storage.set(TARGET_KEY, JSON.stringify({ foo: StorageTarget.USER }));
		await storage.flush();

		const actual = await testObject.readStorageData(profile);

		assert.strictEqual(actual.size, 1);
		assert.deepStrictEqual(actual.get('foo'), { 'value': 'bar', 'target': StorageTarget.USER });
	});

	test('write in empty storage', async () => {
		const data = new Map<string, string>();
		data.set('foo', 'bar');
		await testObject.updateStorageData(profile, data, StorageTarget.USER);

		assert.strictEqual(storage.items.size, 2);
		assert.deepStrictEqual(loadKeyTargets(storage), { foo: StorageTarget.USER });
		assert.strictEqual(storage.get('foo'), 'bar');
	});

	test('write in storage with data', async () => {
		storage.set('foo', 'bar');
		storage.set(TARGET_KEY, JSON.stringify({ foo: StorageTarget.USER }));
		await storage.flush();

		const data = new Map<string, string>();
		data.set('abc', 'xyz');
		await testObject.updateStorageData(profile, data, StorageTarget.MACHINE);

		assert.strictEqual(storage.items.size, 3);
		assert.deepStrictEqual(loadKeyTargets(storage), { foo: StorageTarget.USER, abc: StorageTarget.MACHINE });
		assert.strictEqual(storage.get('foo'), 'bar');
		assert.strictEqual(storage.get('abc'), 'xyz');
	});

	test('write in storage with data (insert, update, remove)', async () => {
		storage.set('foo', 'bar');
		storage.set('abc', 'xyz');
		storage.set(TARGET_KEY, JSON.stringify({ foo: StorageTarget.USER, abc: StorageTarget.MACHINE }));
		await storage.flush();

		const data = new Map<string, string | undefined>();
		data.set('foo', undefined);
		data.set('abc', 'def');
		data.set('var', 'const');
		await testObject.updateStorageData(profile, data, StorageTarget.USER);

		assert.strictEqual(storage.items.size, 3);
		assert.deepStrictEqual(loadKeyTargets(storage), { abc: StorageTarget.USER, var: StorageTarget.USER });
		assert.strictEqual(storage.get('abc'), 'def');
		assert.strictEqual(storage.get('var'), 'const');
	});

});

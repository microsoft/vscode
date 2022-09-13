/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { FileService } from 'vs/platform/files/common/fileService';
import { NullLogService } from 'vs/platform/log/common/log';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { joinPath } from 'vs/base/common/resources';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { InMemoryFileSystemProvider } from 'vs/platform/files/common/inMemoryFilesystemProvider';
import { AbstractNativeEnvironmentService } from 'vs/platform/environment/common/environmentService';
import product from 'vs/platform/product/common/product';
import { StoredProfileAssociations, StoredUserDataProfile, UserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { UriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentityService';

const ROOT = URI.file('tests').with({ scheme: 'vscode-tests' });

class TestEnvironmentService extends AbstractNativeEnvironmentService {
	constructor(private readonly _appSettingsHome: URI) {
		super(Object.create(null), Object.create(null), { _serviceBrand: undefined, ...product });
	}
	override get userRoamingDataHome() { return this._appSettingsHome.with({ scheme: Schemas.vscodeUserData }); }
}

class TestUserDataProfilesService extends UserDataProfilesService {

	private storedProfiles: StoredUserDataProfile[] = [];
	protected override getStoredProfiles(): StoredUserDataProfile[] { return this.storedProfiles; }
	protected override saveStoredProfiles(storedProfiles: StoredUserDataProfile[]): void { this.storedProfiles = storedProfiles; }

	private storedProfileAssociations: StoredProfileAssociations = {};
	protected override getStoredProfileAssociations(): StoredProfileAssociations { return this.storedProfileAssociations; }
	protected override saveStoredProfileAssociations(storedProfileAssociations: StoredProfileAssociations): void { this.storedProfileAssociations = storedProfileAssociations; }
}

suite('UserDataProfileService (Common)', () => {

	const disposables = new DisposableStore();
	let testObject: UserDataProfilesService;
	let environmentService: TestEnvironmentService;

	setup(async () => {
		const logService = new NullLogService();
		const fileService = disposables.add(new FileService(logService));
		const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(ROOT.scheme, fileSystemProvider));
		disposables.add(fileService.registerProvider(Schemas.vscodeUserData, fileSystemProvider));

		environmentService = new TestEnvironmentService(joinPath(ROOT, 'User'));
		testObject = new TestUserDataProfilesService(environmentService, fileService, new UriIdentityService(fileService), logService);
		testObject.setEnablement(true);
	});

	teardown(() => disposables.clear());

	test('default profile', () => {
		assert.strictEqual(testObject.defaultProfile.isDefault, true);
		assert.strictEqual(testObject.defaultProfile.useDefaultFlags, undefined);
		assert.strictEqual(testObject.defaultProfile.location.toString(), environmentService.userRoamingDataHome.toString());
		assert.strictEqual(testObject.defaultProfile.globalStorageHome.toString(), joinPath(environmentService.userRoamingDataHome, 'globalStorage').toString());
		assert.strictEqual(testObject.defaultProfile.keybindingsResource.toString(), joinPath(environmentService.userRoamingDataHome, 'keybindings.json').toString());
		assert.strictEqual(testObject.defaultProfile.settingsResource.toString(), joinPath(environmentService.userRoamingDataHome, 'settings.json').toString());
		assert.strictEqual(testObject.defaultProfile.snippetsHome.toString(), joinPath(environmentService.userRoamingDataHome, 'snippets').toString());
		assert.strictEqual(testObject.defaultProfile.tasksResource.toString(), joinPath(environmentService.userRoamingDataHome, 'tasks.json').toString());
		assert.strictEqual(testObject.defaultProfile.extensionsResource, undefined);
	});

	test('profiles always include default profile', () => {
		assert.deepStrictEqual(testObject.profiles.length, 1);
		assert.deepStrictEqual(testObject.profiles[0].isDefault, true);
		assert.deepStrictEqual(testObject.profiles[0].extensionsResource, undefined);
	});

	test('create profile with id', async () => {
		const profile = await testObject.createProfile('id', 'name');
		assert.deepStrictEqual(testObject.profiles.length, 2);
		assert.deepStrictEqual(profile.id, 'id');
		assert.deepStrictEqual(profile.name, 'name');
		assert.deepStrictEqual(!!profile.isTransient, false);
		assert.deepStrictEqual(testObject.profiles[1].id, profile.id);
		assert.deepStrictEqual(testObject.profiles[1].name, profile.name);
	});

	test('create profile with id, name and transient', async () => {
		const profile = await testObject.createProfile('id', 'name', undefined, true);
		assert.deepStrictEqual(testObject.profiles.length, 2);
		assert.deepStrictEqual(profile.id, 'id');
		assert.deepStrictEqual(profile.name, 'name');
		assert.deepStrictEqual(!!profile.isTransient, true);
		assert.deepStrictEqual(testObject.profiles[1].id, profile.id);
	});

	test('create transient profiles', async () => {
		const profile1 = await testObject.createTransientProfile();
		const profile2 = await testObject.createTransientProfile();
		const profile3 = await testObject.createTransientProfile();
		const profile4 = await testObject.createProfile('id', 'name', undefined, true);

		assert.deepStrictEqual(testObject.profiles.length, 5);
		assert.deepStrictEqual(profile1.name, 'Temp 1');
		assert.deepStrictEqual(profile1.isTransient, true);
		assert.deepStrictEqual(testObject.profiles[1].id, profile1.id);
		assert.deepStrictEqual(profile2.name, 'Temp 2');
		assert.deepStrictEqual(profile2.isTransient, true);
		assert.deepStrictEqual(testObject.profiles[2].id, profile2.id);
		assert.deepStrictEqual(profile3.name, 'Temp 3');
		assert.deepStrictEqual(profile3.isTransient, true);
		assert.deepStrictEqual(testObject.profiles[3].id, profile3.id);
		assert.deepStrictEqual(profile4.name, 'name');
		assert.deepStrictEqual(profile4.isTransient, true);
		assert.deepStrictEqual(testObject.profiles[4].id, profile4.id);
	});

	test('create transient profile when a normal profile with Temp is already created', async () => {
		await testObject.createNamedProfile('Temp 1');
		const profile1 = await testObject.createTransientProfile();

		assert.deepStrictEqual(profile1.name, 'Temp 2');
		assert.deepStrictEqual(profile1.isTransient, true);
	});

	test('profiles include default profile with extension resource defined when transiet prrofile is created', async () => {
		await testObject.createTransientProfile();

		assert.deepStrictEqual(testObject.profiles.length, 2);
		assert.deepStrictEqual(testObject.profiles[0].isDefault, true);
		assert.deepStrictEqual(testObject.profiles[0].extensionsResource?.toString(), joinPath(environmentService.userRoamingDataHome, 'extensions.json').toString());
	});

	test('profiles include default profile with extension resource undefined when transiet prrofile is removed', async () => {
		const profile = await testObject.createTransientProfile();
		await testObject.removeProfile(profile);

		assert.deepStrictEqual(testObject.profiles.length, 1);
		assert.deepStrictEqual(testObject.profiles[0].isDefault, true);
		assert.deepStrictEqual(testObject.profiles[0].extensionsResource, undefined);
	});

	test('update named profile', async () => {
		const profile = await testObject.createNamedProfile('name');
		await testObject.updateProfile(profile, 'name changed');

		assert.deepStrictEqual(testObject.profiles.length, 2);
		assert.deepStrictEqual(testObject.profiles[1].name, 'name changed');
		assert.deepStrictEqual(!!testObject.profiles[1].isTransient, false);
		assert.deepStrictEqual(testObject.profiles[1].id, profile.id);
	});

	test('persist transient profile', async () => {
		const profile = await testObject.createTransientProfile();
		await testObject.updateProfile(profile, 'saved', undefined, false);

		assert.deepStrictEqual(testObject.profiles.length, 2);
		assert.deepStrictEqual(testObject.profiles[1].name, 'saved');
		assert.deepStrictEqual(!!testObject.profiles[1].isTransient, false);
		assert.deepStrictEqual(testObject.profiles[1].id, profile.id);
	});

	test('persist transient profile (2)', async () => {
		const profile = await testObject.createProfile('id', 'name', undefined, true);
		await testObject.updateProfile(profile, 'saved', undefined, false);

		assert.deepStrictEqual(testObject.profiles.length, 2);
		assert.deepStrictEqual(testObject.profiles[1].name, 'saved');
		assert.deepStrictEqual(!!testObject.profiles[1].isTransient, false);
		assert.deepStrictEqual(testObject.profiles[1].id, profile.id);
	});

	test('save transient profile', async () => {
		const profile = await testObject.createTransientProfile();
		await testObject.updateProfile(profile, 'saved');

		assert.deepStrictEqual(testObject.profiles.length, 2);
		assert.deepStrictEqual(testObject.profiles[1].name, 'saved');
		assert.deepStrictEqual(!!testObject.profiles[1].isTransient, true);
		assert.deepStrictEqual(testObject.profiles[1].id, profile.id);
	});

});

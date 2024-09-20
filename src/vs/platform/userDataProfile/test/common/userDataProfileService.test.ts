/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { FileService } from '../../../files/common/fileService.js';
import { NullLogService } from '../../../log/common/log.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { joinPath } from '../../../../base/common/resources.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { AbstractNativeEnvironmentService } from '../../../environment/common/environmentService.js';
import product from '../../../product/common/product.js';
import { InMemoryUserDataProfilesService, UserDataProfilesService } from '../../common/userDataProfile.js';
import { UriIdentityService } from '../../../uriIdentity/common/uriIdentityService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { Event } from '../../../../base/common/event.js';

const ROOT = URI.file('tests').with({ scheme: 'vscode-tests' });

class TestEnvironmentService extends AbstractNativeEnvironmentService {
	constructor(private readonly _appSettingsHome: URI) {
		super(Object.create(null), Object.create(null), { _serviceBrand: undefined, ...product });
	}
	override get userRoamingDataHome() { return this._appSettingsHome.with({ scheme: Schemas.vscodeUserData }); }
	override get cacheHome() { return this.userRoamingDataHome; }
}

suite('UserDataProfileService (Common)', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let testObject: UserDataProfilesService;
	let environmentService: TestEnvironmentService;

	setup(async () => {
		const logService = new NullLogService();
		const fileService = disposables.add(new FileService(logService));
		const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(ROOT.scheme, fileSystemProvider));
		disposables.add(fileService.registerProvider(Schemas.vscodeUserData, fileSystemProvider));

		environmentService = new TestEnvironmentService(joinPath(ROOT, 'User'));
		testObject = disposables.add(new InMemoryUserDataProfilesService(environmentService, fileService, disposables.add(new UriIdentityService(fileService)), logService));
	});


	test('default profile', () => {
		assert.strictEqual(testObject.defaultProfile.isDefault, true);
		assert.strictEqual(testObject.defaultProfile.useDefaultFlags, undefined);
		assert.strictEqual(testObject.defaultProfile.location.toString(), environmentService.userRoamingDataHome.toString());
		assert.strictEqual(testObject.defaultProfile.globalStorageHome.toString(), joinPath(environmentService.userRoamingDataHome, 'globalStorage').toString());
		assert.strictEqual(testObject.defaultProfile.keybindingsResource.toString(), joinPath(environmentService.userRoamingDataHome, 'keybindings.json').toString());
		assert.strictEqual(testObject.defaultProfile.settingsResource.toString(), joinPath(environmentService.userRoamingDataHome, 'settings.json').toString());
		assert.strictEqual(testObject.defaultProfile.snippetsHome.toString(), joinPath(environmentService.userRoamingDataHome, 'snippets').toString());
		assert.strictEqual(testObject.defaultProfile.tasksResource.toString(), joinPath(environmentService.userRoamingDataHome, 'tasks.json').toString());
		assert.strictEqual(testObject.defaultProfile.extensionsResource.toString(), joinPath(environmentService.userRoamingDataHome, 'extensions.json').toString());
	});

	test('profiles always include default profile', () => {
		assert.deepStrictEqual(testObject.profiles.length, 1);
		assert.deepStrictEqual(testObject.profiles[0].isDefault, true);
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
		const profile = await testObject.createProfile('id', 'name', { transient: true });
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
		const profile4 = await testObject.createProfile('id', 'name', { transient: true });

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
	});

	test('profiles include default profile with extension resource undefined when transiet prrofile is removed', async () => {
		const profile = await testObject.createTransientProfile();
		await testObject.removeProfile(profile);

		assert.deepStrictEqual(testObject.profiles.length, 1);
		assert.deepStrictEqual(testObject.profiles[0].isDefault, true);
	});

	test('update named profile', async () => {
		const profile = await testObject.createNamedProfile('name');
		await testObject.updateProfile(profile, { name: 'name changed' });

		assert.deepStrictEqual(testObject.profiles.length, 2);
		assert.deepStrictEqual(testObject.profiles[1].name, 'name changed');
		assert.deepStrictEqual(!!testObject.profiles[1].isTransient, false);
		assert.deepStrictEqual(testObject.profiles[1].id, profile.id);
	});

	test('persist transient profile', async () => {
		const profile = await testObject.createTransientProfile();
		await testObject.updateProfile(profile, { name: 'saved', transient: false });

		assert.deepStrictEqual(testObject.profiles.length, 2);
		assert.deepStrictEqual(testObject.profiles[1].name, 'saved');
		assert.deepStrictEqual(!!testObject.profiles[1].isTransient, false);
		assert.deepStrictEqual(testObject.profiles[1].id, profile.id);
	});

	test('persist transient profile (2)', async () => {
		const profile = await testObject.createProfile('id', 'name', { transient: true });
		await testObject.updateProfile(profile, { name: 'saved', transient: false });

		assert.deepStrictEqual(testObject.profiles.length, 2);
		assert.deepStrictEqual(testObject.profiles[1].name, 'saved');
		assert.deepStrictEqual(!!testObject.profiles[1].isTransient, false);
		assert.deepStrictEqual(testObject.profiles[1].id, profile.id);
	});

	test('save transient profile', async () => {
		const profile = await testObject.createTransientProfile();
		await testObject.updateProfile(profile, { name: 'saved' });

		assert.deepStrictEqual(testObject.profiles.length, 2);
		assert.deepStrictEqual(testObject.profiles[1].name, 'saved');
		assert.deepStrictEqual(!!testObject.profiles[1].isTransient, true);
		assert.deepStrictEqual(testObject.profiles[1].id, profile.id);
	});

	test('short name', async () => {
		const profile = await testObject.createNamedProfile('name', { shortName: 'short' });
		assert.strictEqual(profile.shortName, 'short');

		await testObject.updateProfile(profile, { shortName: 'short changed' });

		assert.deepStrictEqual(testObject.profiles.length, 2);
		assert.deepStrictEqual(testObject.profiles[1].name, 'name');
		assert.deepStrictEqual(testObject.profiles[1].shortName, 'short changed');
		assert.deepStrictEqual(!!testObject.profiles[1].isTransient, false);
		assert.deepStrictEqual(testObject.profiles[1].id, profile.id);
	});

	test('profile using default profile for settings', async () => {
		const profile = await testObject.createNamedProfile('name', { useDefaultFlags: { settings: true } });

		assert.strictEqual(profile.isDefault, false);
		assert.deepStrictEqual(profile.useDefaultFlags, { settings: true });
		assert.strictEqual(profile.settingsResource.toString(), testObject.defaultProfile.settingsResource.toString());
	});

	test('profile using default profile for keybindings', async () => {
		const profile = await testObject.createNamedProfile('name', { useDefaultFlags: { keybindings: true } });

		assert.strictEqual(profile.isDefault, false);
		assert.deepStrictEqual(profile.useDefaultFlags, { keybindings: true });
		assert.strictEqual(profile.keybindingsResource.toString(), testObject.defaultProfile.keybindingsResource.toString());
	});

	test('profile using default profile for snippets', async () => {
		const profile = await testObject.createNamedProfile('name', { useDefaultFlags: { snippets: true } });

		assert.strictEqual(profile.isDefault, false);
		assert.deepStrictEqual(profile.useDefaultFlags, { snippets: true });
		assert.strictEqual(profile.snippetsHome.toString(), testObject.defaultProfile.snippetsHome.toString());
	});

	test('profile using default profile for tasks', async () => {
		const profile = await testObject.createNamedProfile('name', { useDefaultFlags: { tasks: true } });

		assert.strictEqual(profile.isDefault, false);
		assert.deepStrictEqual(profile.useDefaultFlags, { tasks: true });
		assert.strictEqual(profile.tasksResource.toString(), testObject.defaultProfile.tasksResource.toString());
	});

	test('profile using default profile for global state', async () => {
		const profile = await testObject.createNamedProfile('name', { useDefaultFlags: { globalState: true } });

		assert.strictEqual(profile.isDefault, false);
		assert.deepStrictEqual(profile.useDefaultFlags, { globalState: true });
		assert.strictEqual(profile.globalStorageHome.toString(), testObject.defaultProfile.globalStorageHome.toString());
	});

	test('profile using default profile for extensions', async () => {
		const profile = await testObject.createNamedProfile('name', { useDefaultFlags: { extensions: true } });

		assert.strictEqual(profile.isDefault, false);
		assert.deepStrictEqual(profile.useDefaultFlags, { extensions: true });
		assert.strictEqual(profile.extensionsResource.toString(), testObject.defaultProfile.extensionsResource.toString());
	});

	test('update profile using default profile for keybindings', async () => {
		let profile = await testObject.createNamedProfile('name');
		profile = await testObject.updateProfile(profile, { useDefaultFlags: { keybindings: true } });

		assert.strictEqual(profile.isDefault, false);
		assert.deepStrictEqual(profile.useDefaultFlags, { keybindings: true });
		assert.strictEqual(profile.keybindingsResource.toString(), testObject.defaultProfile.keybindingsResource.toString());
	});

	test('create profile with a workspace associates it to the profile', async () => {
		const workspace = URI.file('/workspace1');
		const profile = await testObject.createProfile('id', 'name', {}, { id: workspace.path, uri: workspace });
		assert.deepStrictEqual(profile.workspaces?.length, 1);
		assert.deepStrictEqual(profile.workspaces?.[0].toString(), workspace.toString());
	});

	test('associate workspace to a profile should update workspaces', async () => {
		const profile = await testObject.createProfile('id', 'name', {});
		const workspace = URI.file('/workspace1');

		const promise = Event.toPromise(testObject.onDidChangeProfiles);
		await testObject.setProfileForWorkspace({ id: workspace.path, uri: workspace }, profile);

		const actual = await promise;
		assert.deepStrictEqual(actual.added.length, 0);
		assert.deepStrictEqual(actual.removed.length, 0);
		assert.deepStrictEqual(actual.updated.length, 1);

		assert.deepStrictEqual(actual.updated[0].id, profile.id);
		assert.deepStrictEqual(actual.updated[0].workspaces?.length, 1);
		assert.deepStrictEqual(actual.updated[0].workspaces[0].toString(), workspace.toString());
	});

	test('associate same workspace to a profile should not duplicate', async () => {
		const workspace = URI.file('/workspace1');
		const profile = await testObject.createProfile('id', 'name', { workspaces: [workspace] });

		await testObject.setProfileForWorkspace({ id: workspace.path, uri: workspace }, profile);

		assert.deepStrictEqual(testObject.profiles[1].workspaces?.length, 1);
		assert.deepStrictEqual(testObject.profiles[1].workspaces[0].toString(), workspace.toString());
	});

	test('associate workspace to another profile should update workspaces', async () => {
		const workspace = URI.file('/workspace1');
		const profile1 = await testObject.createProfile('id', 'name', {}, { id: workspace.path, uri: workspace });
		const profile2 = await testObject.createProfile('id1', 'name1');

		const promise = Event.toPromise(testObject.onDidChangeProfiles);
		await testObject.setProfileForWorkspace({ id: workspace.path, uri: workspace }, profile2);

		const actual = await promise;
		assert.deepStrictEqual(actual.added.length, 0);
		assert.deepStrictEqual(actual.removed.length, 0);
		assert.deepStrictEqual(actual.updated.length, 2);

		assert.deepStrictEqual(actual.updated[0].id, profile1.id);
		assert.deepStrictEqual(actual.updated[0].workspaces, undefined);

		assert.deepStrictEqual(actual.updated[1].id, profile2.id);
		assert.deepStrictEqual(actual.updated[1].workspaces?.length, 1);
		assert.deepStrictEqual(actual.updated[1].workspaces[0].toString(), workspace.toString());
	});

	test('unassociate workspace to a profile should update workspaces', async () => {
		const workspace = URI.file('/workspace1');
		const profile = await testObject.createProfile('id', 'name', {}, { id: workspace.path, uri: workspace });

		const promise = Event.toPromise(testObject.onDidChangeProfiles);
		testObject.unsetWorkspace({ id: workspace.path, uri: workspace });

		const actual = await promise;
		assert.deepStrictEqual(actual.added.length, 0);
		assert.deepStrictEqual(actual.removed.length, 0);
		assert.deepStrictEqual(actual.updated.length, 1);

		assert.deepStrictEqual(actual.updated[0].id, profile.id);
		assert.deepStrictEqual(actual.updated[0].workspaces, undefined);
	});

	test('update profile workspaces - add workspace', async () => {
		let profile = await testObject.createNamedProfile('name');
		const workspace = URI.file('/workspace1');
		profile = await testObject.updateProfile(profile, { workspaces: [workspace] });

		assert.deepStrictEqual(profile.workspaces?.length, 1);
		assert.deepStrictEqual(profile.workspaces[0].toString(), workspace.toString());
	});

	test('update profile workspaces - remove workspace', async () => {
		let profile = await testObject.createNamedProfile('name');
		const workspace = URI.file('/workspace1');
		profile = await testObject.updateProfile(profile, { workspaces: [workspace] });
		profile = await testObject.updateProfile(profile, { workspaces: [] });

		assert.deepStrictEqual(profile.workspaces, undefined);
	});

	test('update profile workspaces - replace workspace', async () => {
		let profile = await testObject.createNamedProfile('name');
		profile = await testObject.updateProfile(profile, { workspaces: [URI.file('/workspace1')] });

		const workspace = URI.file('/workspace2');
		profile = await testObject.updateProfile(profile, { workspaces: [workspace] });

		assert.deepStrictEqual(profile.workspaces?.length, 1);
		assert.deepStrictEqual(profile.workspaces[0].toString(), workspace.toString());
	});

	test('update default profile workspaces - add workspace', async () => {
		const workspace = URI.file('/workspace1');
		await testObject.updateProfile(testObject.defaultProfile, { workspaces: [workspace] });

		assert.deepStrictEqual(testObject.profiles.length, 1);
		assert.deepStrictEqual(testObject.profiles[0], testObject.defaultProfile);
		assert.deepStrictEqual(testObject.defaultProfile.isDefault, true);
		assert.deepStrictEqual(testObject.defaultProfile.workspaces?.length, 1);
		assert.deepStrictEqual(testObject.defaultProfile.workspaces[0].toString(), workspace.toString());
	});

	test('can create transient and persistent profiles with same name', async () => {
		const profile1 = await testObject.createNamedProfile('name', { transient: true });
		const profile2 = await testObject.createNamedProfile('name', { transient: true });
		const profile3 = await testObject.createNamedProfile('name');

		assert.deepStrictEqual(profile1.name, 'name');
		assert.deepStrictEqual(!!profile1.isTransient, true);
		assert.deepStrictEqual(profile2.name, 'name');
		assert.deepStrictEqual(!!profile2.isTransient, true);
		assert.deepStrictEqual(profile3.name, 'name');
		assert.deepStrictEqual(!!profile3.isTransient, false);
		assert.deepStrictEqual(testObject.profiles.length, 4);
		assert.deepStrictEqual(testObject.profiles[1].id, profile3.id);
		assert.deepStrictEqual(testObject.profiles[2].id, profile1.id);
		assert.deepStrictEqual(testObject.profiles[3].id, profile2.id);
	});

});

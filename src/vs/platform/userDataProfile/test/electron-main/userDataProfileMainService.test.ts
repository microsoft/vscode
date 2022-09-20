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
import { UserDataProfilesMainService } from 'vs/platform/userDataProfile/electron-main/userDataProfile';
import { StateMainService } from 'vs/platform/state/electron-main/stateMainService';
import { UriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentityService';

const ROOT = URI.file('tests').with({ scheme: 'vscode-tests' });

class TestEnvironmentService extends AbstractNativeEnvironmentService {
	constructor(private readonly _appSettingsHome: URI) {
		super(Object.create(null), Object.create(null), { _serviceBrand: undefined, ...product });
	}
	override get userRoamingDataHome() { return this._appSettingsHome.with({ scheme: Schemas.vscodeUserData }); }
	override get stateResource() { return joinPath(this.userRoamingDataHome, 'state.json'); }
}

suite('UserDataProfileMainService', () => {

	const disposables = new DisposableStore();
	let testObject: UserDataProfilesMainService;
	let environmentService: TestEnvironmentService, stateService: StateMainService;

	setup(async () => {
		const logService = new NullLogService();
		const fileService = disposables.add(new FileService(logService));
		const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(Schemas.vscodeUserData, fileSystemProvider));

		environmentService = new TestEnvironmentService(joinPath(ROOT, 'User'));
		stateService = new StateMainService(environmentService, logService, fileService);

		testObject = new UserDataProfilesMainService(stateService, new UriIdentityService(fileService), environmentService, fileService, logService);
		await stateService.init();
		testObject.setEnablement(true);
	});

	teardown(() => disposables.clear());

	test('default profile', () => {
		assert.strictEqual(testObject.defaultProfile.isDefault, true);
		assert.strictEqual(testObject.defaultProfile.extensionsResource, undefined);
	});

	test('profiles always include default profile', () => {
		assert.deepStrictEqual(testObject.profiles.length, 1);
		assert.deepStrictEqual(testObject.profiles[0].isDefault, true);
		assert.deepStrictEqual(testObject.profiles[0].extensionsResource, undefined);
	});

	test('default profile when there are profiles', async () => {
		await testObject.createNamedProfile('test');
		assert.strictEqual(testObject.defaultProfile.isDefault, true);
		assert.strictEqual(testObject.defaultProfile.extensionsResource?.toString(), joinPath(environmentService.userRoamingDataHome, 'extensions.json').toString());
	});

	test('default profile when profiles are removed', async () => {
		const profile = await testObject.createNamedProfile('test');
		await testObject.removeProfile(profile);
		assert.strictEqual(testObject.defaultProfile.isDefault, true);
		assert.strictEqual(testObject.defaultProfile.extensionsResource, undefined);
	});

});

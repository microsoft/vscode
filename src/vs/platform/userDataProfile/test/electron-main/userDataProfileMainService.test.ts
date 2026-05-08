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
import { AbstractNativeEnvironmentService, INativeEnvironmentPaths } from '../../../environment/common/environmentService.js';
import product from '../../../product/common/product.js';
import { UserDataProfilesMainService } from '../../electron-main/userDataProfile.js';
import { SaveStrategy, StateService } from '../../../state/node/stateService.js';
import { UriIdentityService } from '../../../uriIdentity/common/uriIdentityService.js';
import { IProductService } from '../../../product/common/productService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

const ROOT = URI.file('tests').with({ scheme: 'vscode-tests' });

class TestEnvironmentService extends AbstractNativeEnvironmentService {
	constructor(private readonly _appSettingsHome: URI) {
		const userDataDir = _appSettingsHome.fsPath.replace(/\/User$/, '');
		const paths: INativeEnvironmentPaths = {
			userDataDir,
			homeDir: userDataDir,
			tmpDir: userDataDir,
		};
		super(Object.create(null), paths, { _serviceBrand: undefined, ...product });
	}
	override get userHome() { return this._appSettingsHome; }
	override get userRoamingDataHome() { return this._appSettingsHome.with({ scheme: Schemas.vscodeUserData }); }
	override get extensionsPath() { return joinPath(this.userRoamingDataHome, 'extensions.json').path; }
	override get stateResource() { return joinPath(this.userRoamingDataHome, 'state.json'); }
	override get cacheHome() { return joinPath(this.userRoamingDataHome, 'cache'); }
}

suite('UserDataProfileMainService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let testObject: UserDataProfilesMainService;
	let environmentService: TestEnvironmentService, stateService: StateService;

	setup(async () => {
		const logService = new NullLogService();
		const fileService = disposables.add(new FileService(logService));
		const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(Schemas.vscodeUserData, fileSystemProvider));

		environmentService = new TestEnvironmentService(joinPath(ROOT, 'User'));
		stateService = disposables.add(new StateService(SaveStrategy.DELAYED, environmentService, logService, fileService));

		const productService: IProductService = { _serviceBrand: undefined, ...product };
		testObject = disposables.add(new UserDataProfilesMainService(stateService, disposables.add(new UriIdentityService(fileService)), environmentService, fileService, logService, productService));
		await stateService.init();
	});

	test('default profile', () => {
		assert.strictEqual(testObject.defaultProfile.isDefault, true);
	});

	test('profiles always include default profile', () => {
		assert.deepStrictEqual(testObject.profiles.length, 1);
		assert.deepStrictEqual(testObject.profiles[0].isDefault, true);
	});

	test('default profile when there are profiles', async () => {
		await testObject.createNamedProfile('test');
		assert.strictEqual(testObject.defaultProfile.isDefault, true);
	});

	test('default profile when profiles are removed', async () => {
		const profile = await testObject.createNamedProfile('test');
		await testObject.removeProfile(profile);
		assert.strictEqual(testObject.defaultProfile.isDefault, true);
	});

	test('when no profile is set', async () => {
		await testObject.createNamedProfile('profile1');

		assert.equal(testObject.getProfileForWorkspace({ id: 'id' }), undefined);
		assert.equal(testObject.getProfileForWorkspace({ id: 'id', configPath: environmentService.userRoamingDataHome }), undefined);
		assert.equal(testObject.getProfileForWorkspace({ id: 'id', uri: environmentService.userRoamingDataHome }), undefined);
	});

	test('set profile to a workspace', async () => {
		const workspace = { id: 'id', configPath: environmentService.userRoamingDataHome };
		const profile = await testObject.createNamedProfile('profile1');

		testObject.setProfileForWorkspace(workspace, profile);

		assert.strictEqual(testObject.getProfileForWorkspace(workspace)?.id, profile.id);
	});

	test('set profile to a folder', async () => {
		const workspace = { id: 'id', uri: environmentService.userRoamingDataHome };
		const profile = await testObject.createNamedProfile('profile1');

		testObject.setProfileForWorkspace(workspace, profile);

		assert.strictEqual(testObject.getProfileForWorkspace(workspace)?.id, profile.id);
	});

	test('set profile to a window', async () => {
		const workspace = { id: 'id' };
		const profile = await testObject.createNamedProfile('profile1');

		testObject.setProfileForWorkspace(workspace, profile);

		assert.strictEqual(testObject.getProfileForWorkspace(workspace)?.id, profile.id);
	});

	test('creating agents window profile should return profile with agent window default flags', async () => {
		const profile = await testObject.createAgentsWindowProfile();

		assert.deepStrictEqual(profile.id, 'agents');
		assert.deepStrictEqual(profile.name, 'Agents');
		assert.deepStrictEqual(profile.isDefault, false);
		assert.deepStrictEqual(profile.isAgentsWindowProfile, true);
		assert.deepStrictEqual(profile.isInternal, true);
		assert.deepStrictEqual(profile.useDefaultFlags, {
			settings: true,
			keybindings: true,
			prompts: true,
			mcp: true,
			snippets: true,
			tasks: true,
			extensions: true,
		});
		assert.strictEqual(profile.settingsResource.toString(), testObject.defaultProfile.settingsResource.toString());
		assert.strictEqual(profile.keybindingsResource.toString(), testObject.defaultProfile.keybindingsResource.toString());
		assert.strictEqual(profile.snippetsHome.toString(), testObject.defaultProfile.snippetsHome.toString());
		assert.strictEqual(profile.tasksResource.toString(), testObject.defaultProfile.tasksResource.toString());
		assert.strictEqual(profile.extensionsResource.toString(), testObject.defaultProfile.extensionsResource.toString());
		assert.strictEqual(profile.promptsHome.toString(), testObject.defaultProfile.promptsHome.toString());
		assert.strictEqual(profile.mcpResource.toString(), testObject.defaultProfile.mcpResource.toString());
	});

});

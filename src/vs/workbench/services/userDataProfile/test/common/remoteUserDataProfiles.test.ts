/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Schemas } from '../../../../../base/common/network.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { DefaultURITransformer } from '../../../../../base/common/uriIpc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { AbstractNativeEnvironmentService, INativeEnvironmentPaths } from '../../../../../platform/environment/common/environmentService.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import product from '../../../../../platform/product/common/product.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { InMemoryUserDataProfilesService, IUserDataProfile } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { RemoteUserDataProfilesServiceChannel } from '../../../../../platform/userDataProfile/common/userDataProfileIpc.js';
import { IWorkbenchEnvironmentService } from '../../../environment/common/environmentService.js';
import { IRemoteAgentService } from '../../../remote/common/remoteAgentService.js';
import { RemoteUserDataProfilesService } from '../../common/remoteUserDataProfiles.js';
import { UserDataProfileService } from '../../common/userDataProfileService.js';

const ROOT = URI.file('tests').with({ scheme: 'vscode-tests' });

class TestEnvironmentService extends AbstractNativeEnvironmentService {
	constructor(private readonly _appSettingsHome: URI) {
		const userDataDir = _appSettingsHome.fsPath.replace(/\/User$/, '');
		const paths: INativeEnvironmentPaths = { userDataDir, homeDir: userDataDir, tmpDir: userDataDir };
		super(Object.create(null), paths, { _serviceBrand: undefined, ...product });
	}
	override get userRoamingDataHome() { return this._appSettingsHome.with({ scheme: Schemas.vscodeUserData }); }
	override get cacheHome() { return this.userRoamingDataHome; }
}

suite('RemoteUserDataProfilesService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const logService = new NullLogService();

	function createProfilesService(root: string): InMemoryUserDataProfilesService {
		const fileService = disposables.add(new FileService(logService));
		const provider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(ROOT.scheme, provider));
		disposables.add(fileService.registerProvider(Schemas.vscodeUserData, provider));
		const environmentService = new TestEnvironmentService(joinPath(ROOT, root, 'User'));
		return disposables.add(new InMemoryUserDataProfilesService(environmentService, fileService, disposables.add(new UriIdentityService(fileService)), logService));
	}

	/** Connects to the server's userDataProfiles channel in-process, standing in for the remote connection. */
	function createChannel(server: InMemoryUserDataProfilesService): IChannel {
		const serverChannel = new RemoteUserDataProfilesServiceChannel(server, () => DefaultURITransformer);
		return {
			call: <T>(command: string, arg?: unknown) => serverChannel.call(undefined, command, arg) as Promise<T>,
			listen: <T>(event: string) => (event === 'onDidChangeProfiles' ? serverChannel.listen(undefined, event) : Event.None) as Event<T>,
		};
	}

	function createTestObject(local: InMemoryUserDataProfilesService, server: InMemoryUserDataProfilesService, currentProfile: IUserDataProfile): RemoteUserDataProfilesService {
		const channel = createChannel(server);
		const remoteAgentService = {
			getConnection: () => ({ getChannel: () => channel }),
			getEnvironment: async () => ({ profiles: { all: server.profiles, home: server.profilesHome } }),
		} as unknown as IRemoteAgentService;
		const environmentService = { remoteAuthority: 'ssh-remote+test' } as IWorkbenchEnvironmentService;
		return disposables.add(new RemoteUserDataProfilesService(
			environmentService,
			remoteAgentService,
			local,
			disposables.add(new UserDataProfileService(currentProfile)),
			disposables.add(new InMemoryStorageService()),
			logService,
		));
	}

	test('remote profile created by the server on connect gets the local useDefaultFlags', async () => {
		const local = createProfilesService('local');
		const server = createProfilesService('remote');

		// Local profile uses the Default profile's extensions from the start
		const localProfile = await local.createProfile('p1', 'MyProfile', { useDefaultFlags: { extensions: true } });

		// On connect, the server creates the missing profile from the id only (see RemoteAgentEnvironmentChannel._getEnvironmentData)
		await server.createProfile('p1', 'p1');

		const testObject = createTestObject(local, server, localProfile);
		const remoteProfile = await testObject.getRemoteProfile(localProfile);

		assert.deepStrictEqual(
			{ useDefaultFlags: remoteProfile.useDefaultFlags, extensionsResource: remoteProfile.extensionsResource.toString() },
			{ useDefaultFlags: { extensions: true }, extensionsResource: server.defaultProfile.extensionsResource.toString() }
		);
	});

	test('remote profile picks up useDefaultFlags changed locally after it was created', async () => {
		const local = createProfilesService('local');
		const server = createProfilesService('remote');

		// Profile existed locally and on the remote with its own extensions
		let localProfile = await local.createProfile('p1', 'MyProfile');
		await server.createProfile('p1', 'MyProfile');

		// User later switches "Extensions" to use the Default profile
		localProfile = await local.updateProfile(localProfile, { useDefaultFlags: { extensions: true } });

		const testObject = createTestObject(local, server, localProfile);
		const remoteProfile = await testObject.getRemoteProfile(localProfile);

		assert.deepStrictEqual(
			{ useDefaultFlags: remoteProfile.useDefaultFlags, extensionsResource: remoteProfile.extensionsResource.toString() },
			{ useDefaultFlags: { extensions: true }, extensionsResource: server.defaultProfile.extensionsResource.toString() }
		);
	});

	test('remote profile flags are cleared when the local profile has no flags', async () => {
		const local = createProfilesService('local');
		const server = createProfilesService('remote');

		const localProfile = await local.createProfile('p1', 'MyProfile');
		await server.createProfile('p1', 'MyProfile', { useDefaultFlags: { extensions: true } });

		const testObject = createTestObject(local, server, localProfile);
		const remoteProfile = await testObject.getRemoteProfile(localProfile);

		assert.strictEqual(remoteProfile.extensionsResource.toString(), joinPath(remoteProfile.location, 'extensions.json').toString());
	});

	test('remote profile is created with local useDefaultFlags', async () => {
		const local = createProfilesService('local');
		const server = createProfilesService('remote');

		const localProfile = await local.createProfile('p1', 'MyProfile', { useDefaultFlags: { extensions: true } });

		const testObject = createTestObject(local, server, localProfile);
		const remoteProfile = await testObject.getRemoteProfile(localProfile);

		assert.strictEqual(remoteProfile.extensionsResource.toString(), server.defaultProfile.extensionsResource.toString());
	});
});

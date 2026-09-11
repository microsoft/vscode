/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { deepClone } from '../../../../../../base/common/objects.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ITextModelService } from '../../../../../../editor/common/services/resolverService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ConfigurationScope, Extensions, IConfigurationNode, IConfigurationRegistry } from '../../../../../../platform/configuration/common/configurationRegistry.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService, NotificationMessage } from '../../../../../../platform/notification/common/notification.js';
import { NullPolicyService } from '../../../../../../platform/policy/common/policy.js';
import { IQuickInputService } from '../../../../../../platform/quickinput/common/quickInput.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { TestSecretStorageService } from '../../../../../../platform/secrets/test/common/testSecretStorageService.js';
import { UriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { FileUserDataProvider } from '../../../../../../platform/userData/common/fileUserDataProvider.js';
import { IUserDataProfilesService, UserDataProfilesService } from '../../../../../../platform/userDataProfile/common/userDataProfile.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { WorkspaceService } from '../../../../../services/configuration/browser/configurationService.js';
import { IConfigurationCache } from '../../../../../services/configuration/common/configuration.js';
import { RemoteAgentService } from '../../../../../services/remote/browser/remoteAgentService.js';
import { IRemoteAgentService } from '../../../../../services/remote/common/remoteAgentService.js';
import { TextModelResolverService } from '../../../../../services/textmodelResolver/common/textModelResolverService.js';
import { ITextFileService } from '../../../../../services/textfile/common/textfiles.js';
import { IUserDataProfileService } from '../../../../../services/userDataProfile/common/userDataProfile.js';
import { UserDataProfileService } from '../../../../../services/userDataProfile/common/userDataProfileService.js';
import { TestEnvironmentService, TestTextFileService, workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { SetUpImageGenerationAction } from '../../../browser/imageGeneration/imageGenerationActions.js';
import { ImageGenerationCredentialsService } from '../../../browser/imageGeneration/imageGenerationCredentials.js';
import { IImageGenerationConfiguration, IImageGenerationCredentialsService, ImageGenerationConnectionSetting, imageGenerationConfiguration } from '../../../common/imageGeneration.js';

class ConfigurationCache implements IConfigurationCache {
	needsCaching(): boolean { return false; }
	async read(): Promise<string> { return ''; }
	async write(): Promise<void> { }
	async remove(): Promise<void> { }
}

suite('ImageGenerationConfiguration', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const registry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
	const connection: IImageGenerationConfiguration = { endpoint: 'https://images.example.test', deployment: 'image-deployment' };
	let schema: IConfigurationNode;
	let instantiationService: TestInstantiationService;
	let fileService: FileService;
	let configurationService: WorkspaceService;
	let credentialsService: ImageGenerationCredentialsService;
	let settingsResource: URI;
	let notifications: NotificationMessage[];

	setup(async () => {
		schema = deepClone(imageGenerationConfiguration);
		registry.registerConfiguration(schema);
		store.add(toDisposable(() => registry.deregisterConfigurations([schema])));

		const logService = store.add(new NullLogService());
		fileService = store.add(new FileService(logService));
		const provider = store.add(new InMemoryFileSystemProvider());
		store.add(fileService.registerProvider('vscode-tests', provider));
		instantiationService = workbenchInstantiationService(undefined, store);
		const remoteAgentService = store.add(instantiationService.createInstance(RemoteAgentService));
		instantiationService.stub(IRemoteAgentService, remoteAgentService);
		const uriIdentityService = store.add(new UriIdentityService(fileService));
		const profilesService = store.add(new UserDataProfilesService(TestEnvironmentService, fileService, uriIdentityService, logService));
		instantiationService.stub(IUserDataProfilesService, profilesService);
		store.add(fileService.registerProvider(Schemas.vscodeUserData,
			store.add(new FileUserDataProvider('vscode-tests', provider, Schemas.vscodeUserData, profilesService, uriIdentityService, logService))));
		const profileService = store.add(new UserDataProfileService(profilesService.defaultProfile));
		instantiationService.stub(IUserDataProfileService, profileService);
		settingsResource = profileService.currentProfile.settingsResource;
		configurationService = store.add(new WorkspaceService(
			{ configurationCache: new ConfigurationCache() },
			TestEnvironmentService, profileService, profilesService, fileService, remoteAgentService,
			uriIdentityService, logService, new NullPolicyService()));
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IWorkspaceContextService, configurationService);
		instantiationService.stub(IConfigurationService, configurationService);
		await configurationService.initialize({ id: 'image-configuration-test' });
		instantiationService.stub(ITextFileService, store.add(instantiationService.createInstance(TestTextFileService)));
		instantiationService.stub(ITextModelService, store.add(instantiationService.createInstance(TextModelResolverService)));
		configurationService.acquireInstantiationService(instantiationService);

		credentialsService = store.add(new ImageGenerationCredentialsService(configurationService, store.add(new TestSecretStorageService()), logService));
		instantiationService.stub(IImageGenerationCredentialsService, credentialsService);
		instantiationService.stub(IChatEntitlementService, { sentiment: { hidden: false } });
		const answers = [connection.endpoint, connection.deployment, 'test-api-key'];
		instantiationService.stub(IQuickInputService, { input: async () => answers.shift() });
		notifications = [];
		instantiationService.stub(INotificationService, { info: message => notifications.push(...(Array.isArray(message) ? message : [message])) });
		await credentialsService.whenReady;
	});

	test('registers a writable, application-scoped connection outside settings sync', () => {
		const property = registry.getConfigurationProperties()[ImageGenerationConnectionSetting];
		assert.deepStrictEqual({
			registered: configurationService.keys().default.includes(ImageGenerationConnectionSetting),
			excluded: !!registry.getExcludedConfigurationProperties()[ImageGenerationConnectionSetting],
			scope: property?.scope,
			ignoreSync: property?.ignoreSync,
		}, { registered: true, excluded: false, scope: ConfigurationScope.APPLICATION, ignoreSync: true });
	});

	test('completes setup using the real settings writer before announcing success', async () => {
		await instantiationService.invokeFunction(accessor => new SetUpImageGenerationAction().run(accessor));
		const content = (await fileService.readFile(settingsResource)).value.toString();
		assert.deepStrictEqual({
			saved: JSON.parse(content)[ImageGenerationConnectionSetting],
			resolved: credentialsService.configuration,
			keyInSettings: content.includes('test-api-key'),
			successNotifications: notifications.length,
		}, { saved: connection, resolved: connection, keyInSettings: false, successNotifications: 1 });
	});

	test('does not announce success when the real settings writer rejects an unregistered connection', async () => {
		registry.deregisterConfigurations([schema]);
		await assert.rejects(instantiationService.invokeFunction(accessor => new SetUpImageGenerationAction().run(accessor)), /not a registered configuration/);
		assert.deepStrictEqual({ configured: credentialsService.configuration, notifications }, { configured: undefined, notifications: [] });
	});

	test('does not announce success when user settings contain invalid JSON', async () => {
		await fileService.writeFile(settingsResource, VSBuffer.fromString(',,,,'));
		await assert.rejects(instantiationService.invokeFunction(accessor => new SetUpImageGenerationAction().run(accessor)), /Unable to write/);
		assert.deepStrictEqual({ configured: credentialsService.configuration, notifications }, { configured: undefined, notifications: [] });
	});
});

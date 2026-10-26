/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Schemas } from '../../../../../base/common/network.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/index.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { CopilotImageGenerationEnabledSettingId, CopilotImageGenerationModelSettingId } from '../../../../../platform/agentHost/common/copilotCliConfig.js';
import { imageGenerationConfigurationProperties } from '../../../../../platform/agentHost/common/imageGenerationConfiguration.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions, IConfigurationNode, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { NullPolicyService } from '../../../../../platform/policy/common/policy.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { FileUserDataProvider } from '../../../../../platform/userData/common/fileUserDataProvider.js';
import { IUserDataProfilesService, toUserDataProfile, UserDataProfilesService } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { ConfigurationMigrationWorkbenchContribution } from '../../../../common/configuration.js';
import { WorkspaceService } from '../../../../services/configuration/browser/configurationService.js';
import { IConfigurationCache } from '../../../../services/configuration/common/configuration.js';
import { RemoteAgentService } from '../../../../services/remote/browser/remoteAgentService.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { TextModelResolverService } from '../../../../services/textmodelResolver/common/textModelResolverService.js';
import { IUserDataProfileService } from '../../../../services/userDataProfile/common/userDataProfile.js';
import { UserDataProfileService } from '../../../../services/userDataProfile/common/userDataProfileService.js';
import { TestEnvironmentService, TestTextFileService, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import '../../browser/agentSessionsConfiguration.js';

const configurationCache: IConfigurationCache = {
	needsCaching: () => false,
	read: async () => '',
	write: async () => { },
	remove: async () => { },
};

suite('Image generation setting migration', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
	// Registration mutates the node's properties, so register a copy of the shared definitions.
	const imageGenerationConfiguration: IConfigurationNode = { id: 'imageGenerationSettingMigrationTest', type: 'object', properties: { ...imageGenerationConfigurationProperties } };

	let fileService: FileService;
	let configurationService: WorkspaceService;
	let defaultProfileSettings: URI;
	let currentProfileSettings: URI;

	suiteSetup(() => configurationRegistry.registerConfiguration(imageGenerationConfiguration));
	suiteTeardown(() => configurationRegistry.deregisterConfigurations([imageGenerationConfiguration]));

	setup(async () => {
		const logService = new NullLogService();
		const root = URI.file('tests').with({ scheme: 'vscode-tests' });
		fileService = disposables.add(new FileService(logService));
		const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(root.scheme, fileSystemProvider));

		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const remoteAgentService = disposables.add(instantiationService.createInstance(RemoteAgentService));
		instantiationService.stub(IRemoteAgentService, remoteAgentService);
		const uriIdentityService = disposables.add(new UriIdentityService(fileService));
		const userDataProfilesService = instantiationService.stub(IUserDataProfilesService, disposables.add(new UserDataProfilesService(TestEnvironmentService, fileService, uriIdentityService, logService)));
		disposables.add(fileService.registerProvider(Schemas.vscodeUserData, disposables.add(new FileUserDataProvider(root.scheme, fileSystemProvider, Schemas.vscodeUserData, userDataProfilesService, uriIdentityService, logService))));
		const customProfile = toUserDataProfile('custom', 'custom', joinPath(TestEnvironmentService.userRoamingDataHome, 'profiles', 'custom'), joinPath(TestEnvironmentService.cacheHome, 'profilesCache'));
		const userDataProfileService = instantiationService.stub(IUserDataProfileService, disposables.add(new UserDataProfileService(customProfile)));
		configurationService = disposables.add(new WorkspaceService({ configurationCache }, TestEnvironmentService, userDataProfileService, userDataProfilesService, fileService, remoteAgentService, uriIdentityService, logService, new NullPolicyService()));
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IWorkspaceContextService, configurationService);
		instantiationService.stub(IConfigurationService, configurationService);

		defaultProfileSettings = userDataProfilesService.defaultProfile.settingsResource;
		currentProfileSettings = customProfile.settingsResource;
		await fileService.writeFile(defaultProfileSettings, VSBuffer.fromString(JSON.stringify({ [CopilotImageGenerationEnabledSettingId]: true })));
		await fileService.writeFile(currentProfileSettings, VSBuffer.fromString('{}'));
		await configurationService.initialize({ id: 'empty' });
		instantiationService.stub(ITextFileService, disposables.add(instantiationService.createInstance(TestTextFileService)));
		instantiationService.stub(ITextModelService, disposables.add(instantiationService.createInstance(TextModelResolverService)));
		configurationService.acquireInstantiationService(instantiationService);
	});

	test('migrates the legacy setting in the default profile settings while another profile is active', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		disposables.add(new ConfigurationMigrationWorkbenchContribution(configurationService, configurationService));
		// Virtual time advances only after pending microtasks settle, so the migration's writes finish first.
		await timeout(1000);

		const readSettings = async (resource: URI): Promise<unknown> => JSON.parse((await fileService.readFile(resource)).value.toString());
		assert.deepStrictEqual({
			defaultProfile: await readSettings(defaultProfileSettings),
			currentProfile: await readSettings(currentProfileSettings),
			model: configurationService.getValue(CopilotImageGenerationModelSettingId),
		}, {
			defaultProfile: { [CopilotImageGenerationModelSettingId]: 'gpt-image-2.5-flare' },
			currentProfile: {},
			model: 'gpt-image-2.5-flare',
		});
	}));
});

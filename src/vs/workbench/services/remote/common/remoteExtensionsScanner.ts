/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRemoteAgentService } from './remoteAgentService';
import { IRemoteExtensionsScannerService, RemoteExtensionsScannerChannelName } from '../../../../platform/remote/common/remoteExtensionsScanner';
import * as platform from '../../../../base/common/platform';
import { IChannel } from '../../../../base/parts/ipc/common/ipc';
import { IExtensionDescription } from '../../../../platform/extensions/common/extensions';
import { URI } from '../../../../base/common/uri';
import { IUserDataProfileService } from '../../userDataProfile/common/userDataProfile';
import { IRemoteUserDataProfilesService } from '../../userDataProfile/common/remoteUserDataProfiles';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService';
import { ILogService } from '../../../../platform/log/common/log';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions';
import { IActiveLanguagePackService } from '../../localization/common/locale';
import { IWorkbenchExtensionManagementService } from '../../extensionManagement/common/extensionManagement';
import { Mutable } from '../../../../base/common/types';

class RemoteExtensionsScannerService implements IRemoteExtensionsScannerService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IRemoteAgentService private readonly remoteAgentService: IRemoteAgentService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IRemoteUserDataProfilesService private readonly remoteUserDataProfilesService: IRemoteUserDataProfilesService,
		@IActiveLanguagePackService private readonly activeLanguagePackService: IActiveLanguagePackService,
		@IWorkbenchExtensionManagementService private readonly extensionManagementService: IWorkbenchExtensionManagementService,
		@ILogService private readonly logService: ILogService,
	) { }

	whenExtensionsReady(): Promise<void> {
		return this.withChannel(
			channel => channel.call('whenExtensionsReady'),
			undefined
		);
	}

	async scanExtensions(): Promise<IExtensionDescription[]> {
		try {
			const languagePack = await this.activeLanguagePackService.getExtensionIdProvidingCurrentLocale();
			return await this.withChannel(
				async (channel) => {
					const profileLocation = this.userDataProfileService.currentProfile.isDefault ? undefined : (await this.remoteUserDataProfilesService.getRemoteProfile(this.userDataProfileService.currentProfile)).extensionsResource;
					const scannedExtensions = await channel.call<Mutable<IExtensionDescription>[]>('scanExtensions', [
						platform.language,
						profileLocation,
						this.extensionManagementService.getInstalledWorkspaceExtensionLocations(),
						this.environmentService.extensionDevelopmentLocationURI,
						languagePack
					]);
					scannedExtensions.forEach((extension) => {
						extension.extensionLocation = URI.revive(extension.extensionLocation);
					});
					return scannedExtensions;
				},
				[]
			);
		} catch (error) {
			this.logService.error(error);
			return [];
		}
	}

	private withChannel<R>(callback: (channel: IChannel) => Promise<R>, fallback: R): Promise<R> {
		const connection = this.remoteAgentService.getConnection();
		if (!connection) {
			return Promise.resolve(fallback);
		}
		return connection.withChannel(RemoteExtensionsScannerChannelName, (channel) => callback(channel));
	}
}

registerSingleton(IRemoteExtensionsScannerService, RemoteExtensionsScannerService, InstantiationType.Delayed);

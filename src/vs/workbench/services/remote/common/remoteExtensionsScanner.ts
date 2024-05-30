/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IRemoteExtensionsScannerService, RemoteExtensionsScannerChannelName } from 'vs/platform/remote/common/remoteExtensionsScanner';
import * as platform from 'vs/base/common/platform';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { IExtensionDescription, IRelaxedExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { URI } from 'vs/base/common/uri';
import { IUserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import { IRemoteUserDataProfilesService } from 'vs/workbench/services/userDataProfile/common/remoteUserDataProfiles';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { ILogService } from 'vs/platform/log/common/log';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IActiveLanguagePackService } from 'vs/workbench/services/localization/common/locale';
import { IWorkbenchExtensionManagementService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';

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
					const scannedExtensions = await channel.call<IRelaxedExtensionDescription[]>('scanExtensions', [
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

	async scanSingleExtension(extensionLocation: URI, isBuiltin: boolean): Promise<IExtensionDescription | null> {
		try {
			return await this.withChannel(
				async (channel) => {
					const extension = await channel.call<IRelaxedExtensionDescription>('scanSingleExtension', [extensionLocation, isBuiltin, platform.language]);
					if (extension !== null) {
						extension.extensionLocation = URI.revive(extension.extensionLocation);
						// ImplicitActivationEvents.updateManifest(extension);
					}
					return extension;
				},
				null
			);
		} catch (error) {
			this.logService.error(error);
			return null;
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

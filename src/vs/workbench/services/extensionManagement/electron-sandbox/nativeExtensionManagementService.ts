/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { DidChangeProfileEvent, IProfileAwareExtensionManagementService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { URI } from 'vs/base/common/uri';
import { ILocalExtension, InstallOptions } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { IUserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import { joinPath } from 'vs/base/common/resources';
import { Schemas } from 'vs/base/common/network';
import { ILogService } from 'vs/platform/log/common/log';
import { IDownloadService } from 'vs/platform/download/common/download';
import { IFileService } from 'vs/platform/files/common/files';
import { generateUuid } from 'vs/base/common/uuid';
import { ProfileAwareExtensionManagementChannelClient } from 'vs/workbench/services/extensionManagement/common/extensionManagementChannelClient';
import { ExtensionIdentifier, ExtensionType, isResolverExtension } from 'vs/platform/extensions/common/extensions';
import { INativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-sandbox/environmentService';

export class NativeExtensionManagementService extends ProfileAwareExtensionManagementChannelClient implements IProfileAwareExtensionManagementService {

	constructor(
		channel: IChannel,
		@IUserDataProfileService userDataProfileService: IUserDataProfileService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@IFileService private readonly fileService: IFileService,
		@IDownloadService private readonly downloadService: IDownloadService,
		@INativeWorkbenchEnvironmentService private readonly nativeEnvironmentService: INativeWorkbenchEnvironmentService,
		@ILogService private readonly logService: ILogService,
	) {
		super(channel, userDataProfileService, uriIdentityService);
	}

	protected filterEvent({ profileLocation, applicationScoped }: { readonly profileLocation?: URI; readonly applicationScoped?: boolean }): boolean {
		return applicationScoped || this.uriIdentityService.extUri.isEqual(this.userDataProfileService.currentProfile.extensionsResource, profileLocation);
	}

	override async install(vsix: URI, options?: InstallOptions): Promise<ILocalExtension> {
		const { location, cleanup } = await this.downloadVsix(vsix);
		try {
			return await super.install(location, options);
		} finally {
			await cleanup();
		}
	}

	private async downloadVsix(vsix: URI): Promise<{ location: URI; cleanup: () => Promise<void> }> {
		if (vsix.scheme === Schemas.file) {
			return { location: vsix, async cleanup() { } };
		}
		this.logService.trace('Downloading extension from', vsix.toString());
		const location = joinPath(this.nativeEnvironmentService.extensionsDownloadLocation, generateUuid());
		await this.downloadService.download(vsix, location);
		this.logService.info('Downloaded extension to', location.toString());
		const cleanup = async () => {
			try {
				await this.fileService.del(location);
			} catch (error) {
				this.logService.error(error);
			}
		};
		return { location, cleanup };
	}

	protected override async switchExtensionsProfile(previousProfileLocation: URI, currentProfileLocation: URI, preserveExtensions?: ExtensionIdentifier[]): Promise<DidChangeProfileEvent> {
		if (this.nativeEnvironmentService.remoteAuthority) {
			const previousInstalledExtensions = await this.getInstalled(ExtensionType.User, previousProfileLocation);
			const resolverExtension = previousInstalledExtensions.find(e => isResolverExtension(e.manifest, this.nativeEnvironmentService.remoteAuthority));
			if (resolverExtension) {
				if (!preserveExtensions) {
					preserveExtensions = [];
				}
				preserveExtensions.push(new ExtensionIdentifier(resolverExtension.identifier.id));
			}
		}
		return super.switchExtensionsProfile(previousProfileLocation, currentProfileLocation, preserveExtensions);
	}
}

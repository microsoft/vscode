/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { DidUninstallExtensionEvent, IExtensionManagementService, InstallExtensionResult } from 'vs/platform/extensionManagement/common/extensionManagement';
import { USER_MANIFEST_CACHE_FILE } from 'vs/platform/extensions/common/extensions';
import { FileOperationResult, IFileService, toFileOperationResult } from 'vs/platform/files/common/files';
import { ILogService } from 'vs/platform/log/common/log';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { IUserDataProfile, IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';

export class ExtensionsManifestCache extends Disposable {

	constructor(
		private readonly userDataProfilesService: IUserDataProfilesService,
		private readonly fileService: IFileService,
		private readonly uriIdentityService: IUriIdentityService,
		extensionsManagementService: IExtensionManagementService,
		private readonly logService: ILogService,
	) {
		super();
		this._register(extensionsManagementService.onDidInstallExtensions(e => this.onDidInstallExtensions(e)));
		this._register(extensionsManagementService.onDidUninstallExtension(e => this.onDidUnInstallExtension(e)));
	}

	private onDidInstallExtensions(results: readonly InstallExtensionResult[]): void {
		for (const r of results) {
			if (r.local) {
				this.invalidate(r.profileLocation);
			}
		}
	}

	private onDidUnInstallExtension(e: DidUninstallExtensionEvent): void {
		if (!e.error) {
			this.invalidate(e.profileLocation);
		}
	}

	async invalidate(extensionsManifestLocation: URI | undefined): Promise<void> {
		if (extensionsManifestLocation) {
			for (const profile of this.userDataProfilesService.profiles) {
				if (this.uriIdentityService.extUri.isEqual(profile.extensionsResource, extensionsManifestLocation)) {
					await this.deleteUserCacheFile(profile);
				}
			}
		} else {
			await this.deleteUserCacheFile(this.userDataProfilesService.defaultProfile);
		}
	}

	private async deleteUserCacheFile(profile: IUserDataProfile): Promise<void> {
		try {
			await this.fileService.del(this.uriIdentityService.extUri.joinPath(profile.cacheHome, USER_MANIFEST_CACHE_FILE));
		} catch (error) {
			if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
				this.logService.error(error);
			}
		}
	}
}

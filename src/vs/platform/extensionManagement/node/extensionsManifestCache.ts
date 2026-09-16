/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { DidUninstallExtensionEvent, IExtensionManagementService, InstallExtensionResult } from '../common/extensionManagement.js';
import { USER_MANIFEST_CACHE_FILE } from '../../extensions/common/extensions.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';
import { IUserDataProfile, IUserDataProfilesService } from '../../userDataProfile/common/userDataProfile.js';

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
					await this.deleteUserCacheFiles(profile);
				}
			}
		} else {
			await this.deleteUserCacheFiles(this.userDataProfilesService.defaultProfile);
		}
	}

	private async deleteUserCacheFiles(profile: IUserDataProfile): Promise<void> {
		try {
			const stat = await this.fileService.resolve(profile.cacheHome);
			await Promise.all((stat.children ?? [])
				.filter(child => {
					const name = this.uriIdentityService.extUri.ignorePathCasing(child.resource) ? child.name.toLowerCase() : child.name;
					return name === USER_MANIFEST_CACHE_FILE || name.endsWith(`.${USER_MANIFEST_CACHE_FILE}`);
				})
				.map(child => this.deleteUserCacheFile(child.resource)));
		} catch (error) {
			if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
				this.logService.error(error);
			}
		}
	}

	private async deleteUserCacheFile(cacheFile: URI): Promise<void> {
		try {
			await this.fileService.del(cacheFile);
		} catch (error) {
			if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
				this.logService.error(error);
			}
		}
	}
}

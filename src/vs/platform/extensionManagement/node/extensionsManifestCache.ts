/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { DidUninstallExtensionEvent, IExtensionManagementService, InstallExtensionResult } from '../common/extensionManagement.js';
import { ExtensionType, isManifestCacheFileName } from '../../extensions/common/extensions.js';
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
			// Every consumer scans with a language, so there is one cache file per language
			const cacheHome = await this.fileService.resolve(profile.cacheHome);
			const ignorePathCasing = this.uriIdentityService.extUri.ignorePathCasing(profile.cacheHome);
			await Promise.all((cacheHome.children ?? [])
				.filter(child => !child.isDirectory && isManifestCacheFileName(child.name, ExtensionType.User, ignorePathCasing))
				.map(child => this.fileService.del(child.resource)));
		} catch (error) {
			if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
				this.logService.error(error);
			}
		}
	}
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { joinPath } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { IExtensionsProfileScannerService } from 'vs/platform/extensionManagement/common/extensionsProfileScannerService';
import { IExtensionsScannerService } from 'vs/platform/extensionManagement/common/extensionsScannerService';
import { IFileService } from 'vs/platform/files/common/files';
import { ILogService } from 'vs/platform/log/common/log';
import { EXTENSIONS_RESOURCE_NAME } from 'vs/platform/userDataProfile/common/userDataProfile';
import { IUserDataProfilesMainService } from 'vs/platform/userDataProfile/electron-main/userDataProfile';

export class DefaultExtensionsProfileInitHandler extends Disposable {
	constructor(
		@IUserDataProfilesMainService private readonly userDataProfilesService: IUserDataProfilesMainService,
		@IFileService private readonly fileService: IFileService,
		@IExtensionsScannerService private readonly extensionsScannerService: IExtensionsScannerService,
		@IExtensionsProfileScannerService private readonly extensionsProfileScannerService: IExtensionsProfileScannerService,
		@ILogService logService: ILogService,
	) {
		super();
		if (userDataProfilesService.isEnabled()) {
			this._register(userDataProfilesService.onWillCreateProfile(e => {
				if (userDataProfilesService.profiles.length === 1) {
					e.join(this.initialize());
				}
			}));
			this._register(userDataProfilesService.onDidChangeProfiles(e => {
				if (userDataProfilesService.profiles.length === 1) {
					this.uninitialize();
				}
			}));
		} else {
			this.uninitialize().then(null, e => logService.error(e));
		}
	}

	private async initialize(): Promise<void> {
		/* Create and populate the default extensions profile resource */
		const extensionsProfileResource = this.getDefaultExtensionsProfileResource();
		try { await this.fileService.del(extensionsProfileResource); } catch (error) { /* ignore */ }
		const userExtensions = await this.extensionsScannerService.scanUserExtensions({ includeInvalid: true });
		await this.extensionsProfileScannerService.addExtensionsToProfile(userExtensions.map(e => [e, e.metadata]), extensionsProfileResource);
	}

	private async uninitialize(): Promise<void> {
		/* Remove the default extensions profile resource */
		try { await this.fileService.del(this.getDefaultExtensionsProfileResource()); } catch (error) { /* ignore */ }
	}

	private getDefaultExtensionsProfileResource(): URI {
		return this.userDataProfilesService.defaultProfile.extensionsResource ?? joinPath(this.userDataProfilesService.defaultProfile.location, EXTENSIONS_RESOURCE_NAME);
	}
}

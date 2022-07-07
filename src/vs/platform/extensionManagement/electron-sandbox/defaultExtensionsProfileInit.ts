/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { joinPath } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { IDefaultExtensionsProfileInitService, IExtensionManagementService, ILocalExtension, Metadata } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IExtensionsProfileScannerService } from 'vs/platform/extensionManagement/common/extensionsProfileScannerService';
import { ExtensionType } from 'vs/platform/extensions/common/extensions';
import { IFileService } from 'vs/platform/files/common/files';
import { EXTENSIONS_RESOURCE_NAME, IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';

export class DefaultExtensionsProfileInitService extends Disposable implements IDefaultExtensionsProfileInitService {

	readonly _serviceBrand: undefined;

	constructor(
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IFileService private readonly fileService: IFileService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IExtensionsProfileScannerService private readonly extensionsProfileScannerService: IExtensionsProfileScannerService,
	) {
		super();
	}

	async initialize(): Promise<void> {
		/* Create and populate the default extensions profile resource */
		const extensionsProfileResource = this.getDefaultExtensionsProfileResource();
		try { await this.fileService.del(extensionsProfileResource); } catch (error) { /* ignore */ }
		const userExtensions = await this.extensionManagementService.getInstalled(ExtensionType.User);
		const extensions: [ILocalExtension, Metadata | undefined][] = await Promise.all(userExtensions.map(async e => ([e, await this.extensionManagementService.getMetadata(e)])));
		await this.extensionsProfileScannerService.addExtensionsToProfile(extensions, extensionsProfileResource);
	}

	async uninitialize(): Promise<void> {
		/* Remove the default extensions profile resource */
		try { await this.fileService.del(this.getDefaultExtensionsProfileResource()); } catch (error) { /* ignore */ }
	}

	private getDefaultExtensionsProfileResource(): URI {
		return this.userDataProfilesService.defaultProfile.extensionsResource ?? joinPath(this.userDataProfilesService.defaultProfile.location, EXTENSIONS_RESOURCE_NAME);
	}
}

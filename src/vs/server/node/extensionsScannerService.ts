/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { joinPath } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { IExtensionsProfileScannerService } from 'vs/platform/extensionManagement/common/extensionsProfileScannerService';
import { AbstractExtensionsScannerService, IExtensionsScannerService, Translations } from 'vs/platform/extensionManagement/common/extensionsScannerService';
import { IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { IProductService } from 'vs/platform/product/common/productService';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { getNLSConfiguration } from 'vs/server/node/remoteLanguagePacks';

export class ExtensionsScannerService extends AbstractExtensionsScannerService implements IExtensionsScannerService {

	constructor(
		@IUserDataProfilesService userDataProfilesService: IUserDataProfilesService,
		@IExtensionsProfileScannerService extensionsProfileScannerService: IExtensionsProfileScannerService,
		@IFileService fileService: IFileService,
		@ILogService logService: ILogService,
		@INativeEnvironmentService private readonly nativeEnvironmentService: INativeEnvironmentService,
		@IProductService productService: IProductService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super(
			URI.file(nativeEnvironmentService.builtinExtensionsPath),
			URI.file(nativeEnvironmentService.extensionsPath),
			joinPath(nativeEnvironmentService.userHome, '.vscode-oss-dev', 'extensions', 'control.json'),
			userDataProfilesService.defaultProfile,
			userDataProfilesService, extensionsProfileScannerService, fileService, logService, nativeEnvironmentService, productService, uriIdentityService, instantiationService);
	}

	protected async getTranslations(language: string): Promise<Translations> {
		const config = await getNLSConfiguration(language, this.nativeEnvironmentService.userDataPath);
		if (config.languagePack) {
			try {
				const content = await this.fileService.readFile(URI.file(config.languagePack.translationsConfigFile));
				return JSON.parse(content.value.toString());
			} catch (err) { /* Ignore error */ }
		}
		return Object.create(null);
	}

}

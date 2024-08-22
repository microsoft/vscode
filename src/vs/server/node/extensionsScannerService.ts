/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { joinPath } from '../../base/common/resources';
import { URI } from '../../base/common/uri';
import { INativeEnvironmentService } from '../../platform/environment/common/environment';
import { IExtensionsProfileScannerService } from '../../platform/extensionManagement/common/extensionsProfileScannerService';
import { AbstractExtensionsScannerService, IExtensionsScannerService, Translations } from '../../platform/extensionManagement/common/extensionsScannerService';
import { IFileService } from '../../platform/files/common/files';
import { IInstantiationService } from '../../platform/instantiation/common/instantiation';
import { ILogService } from '../../platform/log/common/log';
import { IProductService } from '../../platform/product/common/productService';
import { IUriIdentityService } from '../../platform/uriIdentity/common/uriIdentity';
import { IUserDataProfilesService } from '../../platform/userDataProfile/common/userDataProfile';
import { getNLSConfiguration } from './remoteLanguagePacks';

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

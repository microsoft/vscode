/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { joinPath } from '../../base/common/resources.js';
import { URI } from '../../base/common/uri.js';
import { INativeEnvironmentService } from '../../platform/environment/common/environment.js';
import { IExtensionsProfileScannerService } from '../../platform/extensionManagement/common/extensionsProfileScannerService.js';
import { AbstractExtensionsScannerService, IExtensionsScannerService, Translations } from '../../platform/extensionManagement/common/extensionsScannerService.js';
import { IFileService } from '../../platform/files/common/files.js';
import { IInstantiationService } from '../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../platform/log/common/log.js';
import { IProductService } from '../../platform/product/common/productService.js';
import { IUriIdentityService } from '../../platform/uriIdentity/common/uriIdentity.js';
import { IUserDataProfilesService } from '../../platform/userDataProfile/common/userDataProfile.js';
import { getNLSConfiguration } from './remoteLanguagePacks.js';

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
		this.logService.trace(`[ExtensionsScannerService] getTranslations called with language: "${language}"`);
		this.logService.trace(`[ExtensionsScannerService] userDataPath: ${this.nativeEnvironmentService.userDataPath}`);

		const config = await getNLSConfiguration(language, this.nativeEnvironmentService.userDataPath);
		this.logService.trace(`[ExtensionsScannerService] NLS config received:`, {
			userLocale: config.userLocale,
			resolvedLanguage: config.resolvedLanguage,
			hasLanguagePack: !!config.languagePack,
			languagePackPath: config.languagePack?.translationsConfigFile
		});

		if (config.languagePack) {
			this.logService.trace(`[ExtensionsScannerService] Found language pack, attempting to read: ${config.languagePack.translationsConfigFile}`);
			try {
				const content = await this.fileService.readFile(URI.file(config.languagePack.translationsConfigFile));
				const translations = JSON.parse(content.value.toString());
				this.logService.trace(`[ExtensionsScannerService] Successfully loaded translations, keys count: ${Object.keys(translations).length}`);
				this.logService.trace(`[ExtensionsScannerService] Translation sample (first 3 keys):`, Object.keys(translations).slice(0, 3));
				return translations;
			} catch (err) {
				this.logService.trace(`[ExtensionsScannerService] Error reading language pack:`, err);
			}
		} else {
			this.logService.trace(`[ExtensionsScannerService] No language pack found, returning empty translations`);
		}

		const emptyTranslations = Object.create(null);
		this.logService.trace(`[ExtensionsScannerService] Returning empty translations object`);
		return emptyTranslations;
	}

}

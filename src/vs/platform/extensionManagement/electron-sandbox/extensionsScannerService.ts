/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { joinPath } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { AbstractExtensionsScannerService, IExtensionsScannerService, Translations } from 'vs/platform/extensionManagement/common/extensionsScannerService';
import { IFileService } from 'vs/platform/files/common/files';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { IProductService } from 'vs/platform/product/common/productService';
import * as platform from 'vs/base/common/platform';
import { MANIFEST_CACHE_FOLDER } from 'vs/platform/extensions/common/extensions';

export class ExtensionsScannerService extends AbstractExtensionsScannerService implements IExtensionsScannerService {

	private readonly translationsPromise: Promise<Translations>;

	constructor(
		@IFileService fileService: IFileService,
		@ILogService logService: ILogService,
		@INativeEnvironmentService environmentService: INativeEnvironmentService,
		@IProductService productService: IProductService,
	) {
		super(
			URI.file(environmentService.builtinExtensionsPath),
			URI.file(environmentService.extensionsPath),
			joinPath(environmentService.userHome, '.vscode-oss-dev', 'extensions', 'control.json'),
			joinPath(URI.file(environmentService.userDataPath), MANIFEST_CACHE_FOLDER),
			fileService, logService, environmentService, productService);
		this.translationsPromise = (async () => {
			if (platform.translationsConfigFile) {
				try {
					const content = await this.fileService.readFile(URI.file(platform.translationsConfigFile));
					return JSON.parse(content.value.toString());
				} catch (err) { /* Ignore Error */ }
			}
			return Object.create(null);
		})();
	}

	protected getTranslations(language: string): Promise<Translations> {
		return this.translationsPromise;
	}

}

registerSingleton(IExtensionsScannerService, ExtensionsScannerService);

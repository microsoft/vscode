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

export class ExtensionsScannerService extends AbstractExtensionsScannerService implements IExtensionsScannerService {

	readonly systemExtensionsLocation: URI;
	readonly userExtensionsLocation: URI;
	protected readonly extensionsControlLocation: URI;

	private readonly translationsPromise: Promise<Translations>;

	constructor(
		@IFileService fileService: IFileService,
		@ILogService logService: ILogService,
		@INativeEnvironmentService environmentService: INativeEnvironmentService,
		@IProductService productService: IProductService,
	) {
		super(fileService, logService, environmentService, productService);
		this.systemExtensionsLocation = URI.file(environmentService.builtinExtensionsPath);
		this.userExtensionsLocation = URI.file(environmentService.extensionsPath);
		this.extensionsControlLocation = joinPath(environmentService.userHome, '.vscode-oss-dev', 'extensions', 'control.json');
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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { joinPath } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { AbstractExtensionsScannerService, IExtensionsScannerService } from 'vs/platform/extensionManagement/common/extensionsScannerService';
import { IFileService } from 'vs/platform/files/common/files';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { IProductService } from 'vs/platform/product/common/productService';
import { INativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-sandbox/environmentService';

export class ExtensionsScannerService extends AbstractExtensionsScannerService implements IExtensionsScannerService {

	readonly systemExtensionsLocation: URI;
	readonly userExtensionsLocation: URI;
	protected readonly extensionsControlLocation: URI;

	constructor(
		@IFileService fileService: IFileService,
		@ILogService logService: ILogService,
		@INativeEnvironmentService environmentService: INativeWorkbenchEnvironmentService,
		@IProductService productService: IProductService,
	) {
		super(fileService, logService, environmentService, productService);
		this.systemExtensionsLocation = URI.file(environmentService.builtinExtensionsPath);
		this.userExtensionsLocation = URI.file(environmentService.extensionsPath);
		this.extensionsControlLocation = joinPath(environmentService.userHome, '.vscode-oss-dev', 'extensions', 'control.json');
	}

}

registerSingleton(IExtensionsScannerService, ExtensionsScannerService);

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { IExtensionsProfileScannerService } from 'vs/platform/extensionManagement/common/extensionsProfileScannerService';
import { IExtensionsScannerService, NativeExtensionsScannerService, } from 'vs/platform/extensionManagement/common/extensionsScannerService';
import { IFileService } from 'vs/platform/files/common/files';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { IProductService } from 'vs/platform/product/common/productService';
import { IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';

export class ExtensionsScannerService extends NativeExtensionsScannerService implements IExtensionsScannerService {

	constructor(
		@IUserDataProfilesService userDataProfilesService: IUserDataProfilesService,
		@IExtensionsProfileScannerService extensionsProfileScannerService: IExtensionsProfileScannerService,
		@IFileService fileService: IFileService,
		@ILogService logService: ILogService,
		@INativeEnvironmentService environmentService: INativeEnvironmentService,
		@IProductService productService: IProductService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super(
			URI.file(environmentService.builtinExtensionsPath),
			URI.file(environmentService.extensionsPath),
			environmentService.userHome,
			URI.file(environmentService.userDataPath),
			userDataProfilesService, extensionsProfileScannerService, fileService, logService, environmentService, productService, instantiationService);
	}

}

registerSingleton(IExtensionsScannerService, ExtensionsScannerService, false);

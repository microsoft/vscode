/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { dirname, join } from '../../../../base/common/path.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isWindows } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { INativeEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { INativeServerExtensionManagementService } from '../../../../platform/extensionManagement/node/extensionManagementService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { FileOperationResult, IFileService, IFileStat, toFileOperationResult } from '../../../../platform/files/common/files.js';
import { getErrorMessage } from '../../../../base/common/errors.js';
import { IProductService } from '../../../../platform/product/common/productService.js';

const defaultExtensionsInitStatusKey = 'initializing-default-extensions';

export class DefaultExtensionsInitializer extends Disposable {
	constructor(
		@INativeEnvironmentService private readonly environmentService: INativeEnvironmentService,
		@INativeServerExtensionManagementService private readonly extensionManagementService: INativeServerExtensionManagementService,
		@IStorageService storageService: IStorageService,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
		@IProductService private readonly productService: IProductService,
	) {
		super();

		if (isWindows && storageService.getBoolean(defaultExtensionsInitStatusKey, StorageScope.APPLICATION, true)) {
			storageService.store(defaultExtensionsInitStatusKey, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
			this.initializeDefaultExtensions().then(() => storageService.store(defaultExtensionsInitStatusKey, false, StorageScope.APPLICATION, StorageTarget.MACHINE));
		}
	}

	private async initializeDefaultExtensions(): Promise<void> {
		const extensionsLocation = this.getDefaultExtensionVSIXsLocation();
		let stat: IFileStat;
		try {
			stat = await this.fileService.resolve(extensionsLocation);
			if (!stat.children) {
				this.logService.debug('There are no default extensions to initialize', extensionsLocation.toString());
				return;
			}
		} catch (error) {
			if (toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND) {
				this.logService.debug('There are no default extensions to initialize', extensionsLocation.toString());
				return;
			}
			this.logService.error('Error initializing extensions', error);
			return;
		}

		const vsixs = stat.children.filter(child => child.name.toLowerCase().endsWith('.vsix'));
		if (vsixs.length === 0) {
			this.logService.debug('There are no default extensions to initialize', extensionsLocation.toString());
			return;
		}

		this.logService.info('Initializing default extensions', extensionsLocation.toString());
		await Promise.all(vsixs.map(async vsix => {
			this.logService.info('Installing default extension', vsix.resource.toString());
			try {
				await this.extensionManagementService.install(vsix.resource, { donotIncludePackAndDependencies: true, keepExisting: false });
				this.logService.info('Default extension installed', vsix.resource.toString());
			} catch (error) {
				this.logService.error('Error installing default extension', vsix.resource.toString(), getErrorMessage(error));
			}
		}));
		this.logService.info('Default extensions initialized', extensionsLocation.toString());
	}

	private getDefaultExtensionVSIXsLocation(): URI {
		if (this.productService.quality === 'insider') {
			// appRoot = C:\Users\<name>\AppData\Local\Programs\Microsoft VS Code Insiders\<version>\resources\app
			// extensionsPath = C:\Users\<name>\AppData\Local\Programs\Microsoft VS Code Insiders\<version>\bootstrap\extensions
			return URI.file(join(dirname(dirname(dirname(this.environmentService.appRoot))), 'bootstrap', 'extensions'));
		} else {
			// appRoot = C:\Users\<name>\AppData\Local\Programs\Microsoft VS Code Insiders\resources\app
			// extensionsPath = C:\Users\<name>\AppData\Local\Programs\Microsoft VS Code Insiders\bootstrap\extensions
			return URI.file(join(dirname(dirname(this.environmentService.appRoot)), 'bootstrap', 'extensions'));
		}
	}

}

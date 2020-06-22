/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IBuiltinExtensionsScannerService, IScannedExtension, ExtensionType } from 'vs/platform/extensions/common/extensions';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IWebExtensionsScannerService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { isWeb } from 'vs/base/common/platform';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

export class WebExtensionsScannerService implements IWebExtensionsScannerService {

	declare readonly _serviceBrand: undefined;

	private readonly systemExtensionsPromise: Promise<IScannedExtension[]>;
	private readonly userExtensions: IScannedExtension[];

	constructor(
		@IBuiltinExtensionsScannerService private readonly builtinExtensionsScannerService: IBuiltinExtensionsScannerService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService
	) {
		this.systemExtensionsPromise = isWeb ? this.builtinExtensionsScannerService.scanBuiltinExtensions() : Promise.resolve([]);
		const staticExtensions = environmentService.options && Array.isArray(environmentService.options.staticExtensions) ? environmentService.options.staticExtensions : [];
		this.userExtensions = staticExtensions.map(data => <IScannedExtension>{
			location: data.extensionLocation,
			type: ExtensionType.User,
			packageJSON: data.packageJSON,
		});
	}

	async scanExtensions(type?: ExtensionType): Promise<IScannedExtension[]> {
		const extensions = [];
		if (type === undefined || type === ExtensionType.System) {
			const systemExtensions = await this.systemExtensionsPromise;
			extensions.push(...systemExtensions);
		}
		if (type === undefined || type === ExtensionType.User) {
			extensions.push(...this.userExtensions);
		}
		return extensions;
	}

}

registerSingleton(IWebExtensionsScannerService, WebExtensionsScannerService);

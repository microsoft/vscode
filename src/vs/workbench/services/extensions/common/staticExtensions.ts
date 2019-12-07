/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IExtensionDescription, ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';

export const IStaticExtensionsService = createDecorator<IStaticExtensionsService>('IStaticExtensionsService');

export interface IStaticExtensionsService {
	_serviceBrand: undefined;
	getExtensions(): Promise<IExtensionDescription[]>;
}

export class StaticExtensionsService implements IStaticExtensionsService {

	_serviceBrand: undefined;

	private readonly _descriptions: IExtensionDescription[] = [];

	constructor(@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService) {
		const staticExtensions = environmentService.options && Array.isArray(environmentService.options.staticExtensions) ? environmentService.options.staticExtensions : [];

		this._descriptions = staticExtensions.map(data => <IExtensionDescription>{
			identifier: new ExtensionIdentifier(`${data.packageJSON.publisher}.${data.packageJSON.name}`),
			extensionLocation: data.extensionLocation,
			...data.packageJSON,
		});
	}

	async getExtensions(): Promise<IExtensionDescription[]> {
		return this._descriptions;
	}
}

registerSingleton(IStaticExtensionsService, StaticExtensionsService, true);

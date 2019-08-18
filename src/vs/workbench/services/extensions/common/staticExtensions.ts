/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IExtensionDescription, IExtensionManifest, ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { UriComponents, URI } from 'vs/base/common/uri';

export const IStaticExtensionsService = createDecorator<IStaticExtensionsService>('IStaticExtensionsService');

export interface IStaticExtensionsService {
	_serviceBrand: any;
	getExtensions(): Promise<IExtensionDescription[]>;
}

export class StaticExtensionsService implements IStaticExtensionsService {

	_serviceBrand: any;

	private readonly _descriptions: IExtensionDescription[] = [];

	constructor(staticExtensions: { packageJSON: IExtensionManifest, extensionLocation: UriComponents }[]) {
		this._descriptions = staticExtensions.map(data => <IExtensionDescription>{
			identifier: new ExtensionIdentifier(`${data.packageJSON.publisher}.${data.packageJSON.name}`),
			extensionLocation: URI.revive(data.extensionLocation),
			...data.packageJSON,
		});
	}

	async getExtensions(): Promise<IExtensionDescription[]> {
		return this._descriptions;
	}
}

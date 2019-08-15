/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IProductService, IProductConfiguration } from 'vs/platform/product/common/product';
import { ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';

export class ProductService implements IProductService {

	_serviceBrand!: ServiceIdentifier<IProductService>;

	readonly productConfiguration: IProductConfiguration;

	constructor() {
		const element = document.getElementById('vscode-remote-product-configuration');
		this.productConfiguration = {
			...element ? JSON.parse(element.getAttribute('data-settings')!) : {
				version: '1.38.0-unknown',
				nameLong: 'Unknown',
				extensionAllowedProposedApi: [],
			}, ...{ urlProtocol: '', enableTelemetry: false }
		};
	}

}

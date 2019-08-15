/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IProductService, IProductConfiguration } from 'vs/platform/product/common/product';
import product from 'vs/platform/product/node/product';
import pkg from 'vs/platform/product/node/package';
import { ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';

export class ProductService implements IProductService {

	_serviceBrand!: ServiceIdentifier<IProductService>;

	readonly productConfiguration: IProductConfiguration;

	constructor() {
		this.productConfiguration = {
			...product, ...{ version: pkg.version }
		};
	}

}

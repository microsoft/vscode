/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IProductConfiguration } from 'vs/base/common/product';
import { Extensions, IEmbedderApiRegistry } from 'vs/platform/embedder/common/embedderRegistry';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Registry } from 'vs/platform/registry/common/platform';

export const IProductService = createDecorator<IProductService>('productService');

export interface IProductService extends Readonly<IProductConfiguration> {

	readonly _serviceBrand: undefined;

}

export const productSchemaId = 'vscode://schemas/vscode-product';

export class EmbedderProductApi {
	constructor(@IProductService private readonly _productService: IProductService) {
	}

	getUriScheme(): Promise<string> {
		return Promise.resolve(this._productService.urlProtocol);
	}
}

Registry.as<IEmbedderApiRegistry>(Extensions.EmbedderApiContrib).register('product', new SyncDescriptor(EmbedderProductApi));


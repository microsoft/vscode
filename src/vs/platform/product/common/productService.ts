/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IProductConfiguration } from 'vs/base/common/product';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IProductService = createDecorator<IProductService>('productService');

export interface IProductService extends Readonly<IProductConfiguration> {

	readonly _serviceBrand: undefined;

}

export const productSchemaId = 'vscode://schemas/vscode-product';

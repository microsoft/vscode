/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IProductService } from 'vs/platform/product/common/product';
import product from 'vs/platform/product/node/product';
import pkg from 'vs/platform/product/node/package';

export class ProductService implements IProductService {

	_serviceBrand: any;

	get version(): string { return pkg.version; }

	get commit(): string | undefined { return product.commit; }

	get nameLong(): string { return product.nameLong; }

	get urlProtocol(): string { return product.urlProtocol; }

	get extensionAllowedProposedApi(): string[] { return product.extensionAllowedProposedApi; }

	get uiExtensions(): string[] | undefined { return product.uiExtensions; }

	get enableTelemetry(): boolean { return product.enableTelemetry; }
}
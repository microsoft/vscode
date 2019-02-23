/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IProductService } from 'vs/platform/product/common/product';

export class SimpleProductService implements IProductService {

	_serviceBrand: any;

	version?: string;
	commit?: string;

	enableTelemetry: boolean = false;
}
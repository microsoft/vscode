/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ICommonProperties } from '../../../../platform/telemetry/common/telemetry.js';
import { IProductService } from '../../../../platform/product/common/productService.js';

export function resolveWorkbenchCommonProperties(
	storageService: IStorageService,
	productService: IProductService,
	isInternalTelemetry: boolean,
	remoteAuthority?: string,
	resolveAdditionalProperties?: () => { [key: string]: unknown }
): ICommonProperties {
	// Telemetry disabled - return empty properties
	return {};
}


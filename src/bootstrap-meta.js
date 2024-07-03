/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
'use strict';

/**
 * @import { IProductConfiguration } from './vs/base/common/product'
 */

/** @type Partial<IProductConfiguration> & { BUILD_INSERT_PRODUCT_CONFIGURATION?: string } */
let product = { BUILD_INSERT_PRODUCT_CONFIGURATION: 'BUILD_INSERT_PRODUCT_CONFIGURATION' }; // DO NOT MODIFY, PATCHED DURING BUILD
if (product['BUILD_INSERT_PRODUCT_CONFIGURATION']) {
	// @ts-ignore
	product = require('../product.json'); // Running out of sources
}

/** @type object & { BUILD_INSERT_PACKAGE_CONFIGURATION?: string } */
let pkg = { BUILD_INSERT_PACKAGE_CONFIGURATION: 'BUILD_INSERT_PACKAGE_CONFIGURATION' }; // DO NOT MODIFY, PATCHED DURING BUILD
if (pkg['BUILD_INSERT_PACKAGE_CONFIGURATION']) {
	// @ts-ignore
	pkg = require('../package.json'); // Running out of sources
}

exports.product = product;
exports.pkg = pkg;

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
'use strict';

/**
 * @import { IProductConfiguration } from './vs/base/common/product'
 */

// ESM-uncomment-begin
// import { createRequire } from 'node:module';
//
// const require = createRequire(import.meta.url);
// const module = { exports: {} };
// ESM-uncomment-end

/** @type Partial<IProductConfiguration> & { BUILD_INSERT_PRODUCT_CONFIGURATION?: string } */
let productObj = { BUILD_INSERT_PRODUCT_CONFIGURATION: 'BUILD_INSERT_PRODUCT_CONFIGURATION' }; // DO NOT MODIFY, PATCHED DURING BUILD
if (productObj['BUILD_INSERT_PRODUCT_CONFIGURATION']) {
	// @ts-ignore
	productObj = require('../product.json'); // Running out of sources
}

/** @type object & { BUILD_INSERT_PACKAGE_CONFIGURATION?: string } */
let pkgObj = { BUILD_INSERT_PACKAGE_CONFIGURATION: 'BUILD_INSERT_PACKAGE_CONFIGURATION' }; // DO NOT MODIFY, PATCHED DURING BUILD
if (pkgObj['BUILD_INSERT_PACKAGE_CONFIGURATION']) {
	// @ts-ignore
	pkgObj = require('../package.json'); // Running out of sources
}

module.exports.product = productObj;
module.exports.pkg = pkgObj;

// ESM-uncomment-begin
// export const product = module.exports.product;
// export const pkg = module.exports.pkg;
// ESM-uncomment-end

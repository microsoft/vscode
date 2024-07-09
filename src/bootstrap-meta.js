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
module.exports.product = { BUILD_INSERT_PRODUCT_CONFIGURATION: 'BUILD_INSERT_PRODUCT_CONFIGURATION' }; // DO NOT MODIFY, PATCHED DURING BUILD
if (module.exports.product['BUILD_INSERT_PRODUCT_CONFIGURATION']) {
	// @ts-ignore
	module.exports.product = require('../product.json'); // Running out of sources
}

/** @type object & { BUILD_INSERT_PACKAGE_CONFIGURATION?: string } */
module.exports.pkg = { BUILD_INSERT_PACKAGE_CONFIGURATION: 'BUILD_INSERT_PACKAGE_CONFIGURATION' }; // DO NOT MODIFY, PATCHED DURING BUILD
if (module.exports.pkg['BUILD_INSERT_PACKAGE_CONFIGURATION']) {
	// @ts-ignore
	module.exports.pkg = require('../package.json'); // Running out of sources
}

module.exports.product = product;
module.exports.pkg = pkg;

// ESM-uncomment-begin
// export const product = module.exports.product;
// export const pkg = module.exports.pkg;
// ESM-uncomment-end

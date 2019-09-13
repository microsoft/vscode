/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IProductConfiguration } from 'vs/platform/product/common/product';
import { assign } from 'vs/base/common/objects';

// Built time configuration (do NOT modify)
const product = { /*BUILD->INSERT_PRODUCT_CONFIGURATION*/ } as IProductConfiguration;

// Running out of sources
if (Object.keys(product).length === 0) {
	assign(product, {
		version: '1.39.0-dev',
		nameLong: 'Visual Studio Code Web Dev',
		nameShort: 'VSCode Web Dev'
	});
}

export default product;

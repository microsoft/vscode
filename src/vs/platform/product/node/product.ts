/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'vs/base/common/path';
import { getPathFromAmdModule } from 'vs/base/common/amd';
import { IProductConfiguration } from 'vs/platform/product/common/product';
import pkg from 'vs/platform/product/node/package';
import { assign } from 'vs/base/common/objects';

const rootPath = path.dirname(getPathFromAmdModule(require, ''));
const productJsonPath = path.join(rootPath, 'product.json');
const product = require.__$__nodeRequire(productJsonPath) as IProductConfiguration;

if (process.env['VSCODE_DEV']) {
	assign(product, {
		nameShort: `${product.nameShort} Dev`,
		nameLong: `${product.nameLong} Dev`,
		dataFolderName: `${product.dataFolderName}-dev`
	});
}

assign(product, {
	version: pkg.version
});

export default product;

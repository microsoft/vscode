/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'vs/base/common/path';
import { getPathFromAmdModule } from 'vs/base/common/amd';
import { IProductConfiguration } from 'vs/platform/product/common/product';
import { assign } from 'vs/base/common/objects';

const rootPath = path.dirname(getPathFromAmdModule(require, ''));
const productJsonPath = path.join(rootPath, 'product.json');
const product = assign({}, require.__$__nodeRequire(productJsonPath) as IProductConfiguration);

const packageJsonPath = path.join(rootPath, 'package.json');
const pkg = require.__$__nodeRequire(packageJsonPath) as { version: string; };

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

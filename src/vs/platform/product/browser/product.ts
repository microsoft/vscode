/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IProductConfiguration } from 'vs/platform/product/common/product';
import { assign } from 'vs/base/common/objects';
import { isWeb } from 'vs/base/common/platform';
import * as path from 'vs/base/common/path';
import { getPathFromAmdModule } from 'vs/base/common/amd';
import { env } from 'vs/base/common/process';

let product: IProductConfiguration;
if (isWeb) {

	// Built time configuration (do NOT modify)
	product = { /*BUILD->INSERT_PRODUCT_CONFIGURATION*/ } as IProductConfiguration;

	// Running out of sources
	if (Object.keys(product).length === 0) {
		assign(product, {
			version: '1.39.0-dev',
			nameLong: 'Visual Studio Code Web Dev',
			nameShort: 'VSCode Web Dev'
		});
	}
} else {

	// Obtain values from product.json and package.json
	const rootPath = path.dirname(getPathFromAmdModule(require, ''));
	const productJsonPath = path.join(rootPath, 'product.json');
	const packageJsonPath = path.join(rootPath, 'package.json');

	product = assign({}, require.__$__nodeRequire(productJsonPath) as IProductConfiguration);
	const pkg = require.__$__nodeRequire(packageJsonPath) as { version: string; };

	// Running out of sources
	if (env['VSCODE_DEV']) {
		assign(product, {
			nameShort: `${product.nameShort} Dev`,
			nameLong: `${product.nameLong} Dev`,
			dataFolderName: `${product.dataFolderName}-dev`
		});
	}

	assign(product, {
		version: pkg.version
	});
}

export default product;

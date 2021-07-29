/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FileAccess } from 'vs/base/common/network';
import { isWeb, isWindows, globals } from 'vs/base/common/platform';
import { env } from 'vs/base/common/process';
import { dirname, joinPath } from 'vs/base/common/resources';
import { IProductConfiguration } from 'vs/base/common/product';
import { ISandboxConfiguration } from 'vs/base/parts/sandbox/common/sandboxTypes';
import { getUserDataPath } from 'vs/platform/environment/node/userDataPath';

let product: IProductConfiguration;

// Native sandbox environment
if (typeof globals.vscode !== 'undefined' && typeof globals.vscode.context !== 'undefined') {
	const configuration: ISandboxConfiguration | undefined = globals.vscode.context.configuration();
	if (configuration) {
		product = configuration.product;
	} else {
		throw new Error('Sandbox: unable to resolve product configuration from preload script.');
	}
}

// Native node.js environment
else if (typeof require?.__$__nodeRequire === 'function') {

	// Obtain values from product.json and package.json
	const rootPath = dirname(FileAccess.asFileUri('', require));

	product = require.__$__nodeRequire(joinPath(rootPath, 'product.json').fsPath);
	const pkg = require.__$__nodeRequire(joinPath(rootPath, 'package.json').fsPath) as { version: string; };

	// Merge user-customized product.json
	try {
		const merge = (...objects: any[]) =>
			objects.reduce((result, current) => {
				Object.keys(current).forEach((key) => {
					if (Array.isArray(result[key]) && Array.isArray(current[key])) {
						result[key] = current[key];
					} else if (typeof result[key] === 'object' && typeof current[key] === 'object') {
						result[key] = merge(result[key], current[key]);
					} else {
						result[key] = current[key];
					}
				});

				return result;
			}, {}) as any;

		const userDataPath = getUserDataPath({} as any);
		const userProductPath = isWindows ? `file:///${userDataPath}/product.json` : `file://${userDataPath}/product.json`;

		const userProduct = require.__$__nodeRequire(FileAccess.asFileUri(userProductPath, require).fsPath);

		product = merge(product, userProduct);
	} catch (ex) {
	}

	// Running out of sources
	if (env['VSCODE_DEV']) {
		Object.assign(product, {
			nameShort: `${product.nameShort} Dev`,
			nameLong: `${product.nameLong} Dev`,
			dataFolderName: `${product.dataFolderName}-dev`
		});
	}

	// Set user-defined extension gallery
	const { serviceUrl, cacheUrl, itemUrl, controlUrl, recommendationsUrl } = product.extensionsGallery || {}

	Object.assign(product, {
		extensionsGallery: {
			serviceUrl: env['VSCODE_GALLERY_SERVICE_URL'] || serviceUrl,
			cacheUrl: env['VSCODE_GALLERY_CACHE_URL'] || cacheUrl,
			itemUrl: env['VSCODE_GALLERY_ITEM_URL'] || itemUrl,
			controlUrl: env['VSCODE_GALLERY_CONTROL_URL'] || controlUrl,
			recommendationsUrl: env['VSCODE_GALLERY_RECOMMENDATIONS_URL'] || recommendationsUrl
		}
	})

	Object.assign(product, {
		version: pkg.version
	});
}

// Web environment or unknown
else {

	// Built time configuration (do NOT modify)
	product = { /*BUILD->INSERT_PRODUCT_CONFIGURATION*/ } as IProductConfiguration;

	// Running out of sources
	if (Object.keys(product).length === 0) {
		Object.assign(product, {
			version: '1.59.0-dev',
			nameShort: isWeb ? 'Code Web - OSS Dev' : 'Code - OSS Dev',
			nameLong: isWeb ? 'Code Web - OSS Dev' : 'Code - OSS Dev',
			applicationName: 'code-oss',
			dataFolderName: '.vscode-oss',
			urlProtocol: 'code-oss',
			reportIssueUrl: 'https://github.com/microsoft/vscode/issues/new',
			licenseName: 'MIT',
			licenseUrl: 'https://github.com/microsoft/vscode/blob/main/LICENSE.txt',
			extensionAllowedProposedApi: [
				'ms-vscode.vscode-js-profile-flame',
				'ms-vscode.vscode-js-profile-table',
				'ms-vscode.remotehub',
				'ms-vscode.remotehub-insiders',
				'GitHub.remotehub',
				'GitHub.remotehub-insiders'
			],
		});
	}
}

export default product;

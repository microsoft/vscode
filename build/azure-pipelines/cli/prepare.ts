/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getVersion } from '../../lib/getVersion';
import * as fs from 'fs';
import * as path from 'path';
import * as packageJson from '../../../package.json';

const root = process.env.VSCODE_CLI_PREPARE_ROOT || path.dirname(path.dirname(path.dirname(__dirname)));
const readJSON = (path: string) => JSON.parse(fs.readFileSync(path, 'utf8'));

let productJsonPath: string;
const isOSS = process.env.VSCODE_QUALITY === 'oss' || !process.env.VSCODE_QUALITY;
if (isOSS) {
	productJsonPath = path.join(root, 'product.json');
} else {
	productJsonPath = path.join(root, 'mixin', process.env.VSCODE_QUALITY!, 'product.json');
}

console.error('Loading product.json from', productJsonPath);
const product = readJSON(productJsonPath);
const allProductsAndQualities = isOSS ? [product] : fs.readdirSync(path.join(root, 'mixin'))
	.map(quality => ({ quality, json: readJSON(path.join(root, 'mixin', quality, 'product.json')) }));
const commit = getVersion(root);

const makeQualityMap = <T>(m: (productJson: any, quality: string) => T): Record<string, T> => {
	const output: Record<string, T> = {};
	for (const { quality, json } of allProductsAndQualities) {
		output[quality] = m(json, quality);
	}
	return output;
};

/**
 * Sets build environment variables for the CLI for current contextual info.
 */
const setLauncherEnvironmentVars = () => {
	const vars = new Map([
		['VSCODE_CLI_ALREADY_PREPARED', 'true'],
		['VSCODE_CLI_REMOTE_LICENSE_TEXT', product.serverLicense?.join('\\n')],
		['VSCODE_CLI_REMOTE_LICENSE_PROMPT', product.serverLicensePrompt],
		['VSCODE_CLI_AI_KEY', product.aiConfig?.cliKey],
		['VSCODE_CLI_AI_ENDPOINT', product.aiConfig?.cliEndpoint],
		['VSCODE_CLI_VERSION', packageJson.version],
		['VSCODE_CLI_UPDATE_ENDPOINT', product.updateUrl],
		['VSCODE_CLI_QUALITY', product.quality],
		['VSCODE_CLI_NAME_SHORT', product.nameShort],
		['VSCODE_CLI_NAME_LONG', product.nameLong],
		['VSCODE_CLI_QUALITYLESS_PRODUCT_NAME', product.nameLong.replace(/ - [a-z]+$/i, '')],
		['VSCODE_CLI_DOCUMENTATION_URL', product.documentationUrl],
		['VSCODE_CLI_APPLICATION_NAME', product.applicationName],
		['VSCODE_CLI_EDITOR_WEB_URL', product.tunnelApplicationConfig?.editorWebUrl],
		['VSCODE_CLI_TUNNEL_SERVICE_MUTEX', product.win32TunnelServiceMutex],
		['VSCODE_CLI_TUNNEL_CLI_MUTEX', product.win32TunnelMutex],
		['VSCODE_CLI_COMMIT', commit],
		['VSCODE_CLI_DEFAULT_PARENT_DATA_DIR', product.dataFolderName],
		[
			'VSCODE_CLI_WIN32_APP_IDS',
			!isOSS && JSON.stringify(
				makeQualityMap(json => Object.entries(json)
					.filter(([key]) => /^win32.*AppId$/.test(key))
					.map(([, value]) => String(value).replace(/[{}]/g, ''))),
			),
		],
		[
			'VSCODE_CLI_NAME_LONG_MAP',
			!isOSS && JSON.stringify(makeQualityMap(json => json.nameLong)),
		],
		[
			'VSCODE_CLI_APPLICATION_NAME_MAP',
			!isOSS && JSON.stringify(makeQualityMap(json => json.applicationName)),
		],
		[
			'VSCODE_CLI_SERVER_NAME_MAP',
			!isOSS && JSON.stringify(makeQualityMap(json => json.serverApplicationName)),
		],
		[
			'VSCODE_CLI_QUALITY_DOWNLOAD_URIS',
			!isOSS && JSON.stringify(makeQualityMap(json => json.downloadUrl)),
		],
	]);

	if (process.env.VSCODE_CLI_PREPARE_OUTPUT === 'json') {
		console.log(JSON.stringify([...vars].filter(([, v]) => !!v)));
	} else {
		for (const [key, value] of vars) {
			if (value) {
				console.log(`##vso[task.setvariable variable=${key}]${value}`);
			}
		}
	}

};

if (require.main === module) {
	setLauncherEnvironmentVars();
}

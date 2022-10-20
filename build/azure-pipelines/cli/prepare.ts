/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getVersion } from '../../lib/getVersion';
import * as fs from 'fs';
import * as path from 'path';
import * as packageJson from '../../../package.json';

const root = path.dirname(path.dirname(path.dirname(__dirname)));

let productJsonPath: string;
if (process.env.VSCODE_QUALITY === 'oss' || !process.env.VSCODE_QUALITY) {
	productJsonPath = path.join(root, 'product.json');
} else {
	productJsonPath = path.join(root, 'quality', process.env.VSCODE_QUALITY, 'product.json');
}

console.log('Loading product.json from', productJsonPath);
const product = JSON.parse(fs.readFileSync(productJsonPath, 'utf8'));
const commit = getVersion(root);

/**
 * Sets build environment variables for the CLI for current contextual info.
 */
const setLauncherEnvironmentVars = () => {
	const vars = new Map([
		['VSCODE_CLI_REMOTE_LICENSE_TEXT', product.serverLicense?.join('\\n')],
		['VSCODE_CLI_REMOTE_LICENSE_PROMPT', product.serverLicensePrompt],
		['VSCODE_CLI_AI_KEY', product.aiConfig?.cliKey],
		['VSCODE_CLI_AI_ENDPOINT', product.aiConfig?.cliEndpoint],
		['VSCODE_CLI_VERSION', packageJson.version],
		['VSCODE_CLI_UPDATE_ENDPOINT', product.updateUrl],
		['VSCODE_CLI_QUALITY', product.quality],
		['VSCODE_CLI_COMMIT', commit],
	]);

	for (const [key, value] of vars) {
		if (value) {
			console.log(`##vso[task.setvariable variable=${key}]${value}`);
		}
	}
};

if (require.main === module) {
	setLauncherEnvironmentVars();
}

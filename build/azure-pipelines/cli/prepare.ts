/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getVersion } from '../../lib/getVersion';
import * as fs from 'fs';
import * as path from 'path';
import * as packageJson from '../../../package.json';

const root = path.dirname(path.dirname(path.dirname(__dirname)));
const product = JSON.parse(fs.readFileSync(path.join(root, 'product.json'), 'utf8'));
const commit = getVersion(root);

/**
 * Sets build environment variables for the CLI for current contextual info.
 */
const setLauncherEnvironmentVars = () => {
	const vars = new Map([
		['VSCODE_CLI_REMOTE_LICENSE_TEXT', product.serverLicense],
		['VSCODE_CLI_REMOTE_LICENSE_PROMPT', product.serverLicensePrompt],
		['VSCODE_CLI_VERSION', packageJson.version],
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

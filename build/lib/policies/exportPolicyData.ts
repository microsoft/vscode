/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execSync, execFileSync } from 'child_process';
import { resolve } from 'path';

const rootPath = resolve(import.meta.dirname, '..', '..', '..');

// Ensure sources are transpiled
console.log('Transpiling client sources...');
execSync('npm run transpile-client', { cwd: rootPath, stdio: 'inherit' });

// Set up GITHUB_TOKEN if not already set and .build/distro is not available
if (!process.env['GITHUB_TOKEN'] && !process.env['DISTRO_PRODUCT_JSON']) {
	const { existsSync } = await import('fs');
	const localDistro = resolve(rootPath, '.build/distro/mixin/stable/product.json');

	if (!existsSync(localDistro)) {
		try {
			const token = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();
			process.env['GITHUB_TOKEN'] = token;
			console.log('Set GITHUB_TOKEN from gh CLI.');
		} catch {
			console.error(
				'Error: GITHUB_TOKEN is not set, .build/distro is not available, and gh CLI is not installed or not authenticated.\n\n' +
				'Please do one of the following:\n' +
				'  1. Install and authenticate the GitHub CLI: https://cli.github.com\n' +
				'  2. Set GITHUB_TOKEN manually: export GITHUB_TOKEN=<your-token>\n' +
				'  3. Download the distro locally\n'
			);
			process.exit(1);
		}
	}
}

// Run the export
console.log('Exporting policy data...');
const codeScript = process.platform === 'win32'
	? resolve(rootPath, 'scripts', 'code.bat')
	: resolve(rootPath, 'scripts', 'code.sh');

execSync(`"${codeScript}" --export-policy-data`, {
	cwd: rootPath,
	stdio: 'inherit',
	env: process.env,
});

console.log('\nPolicy data exported to build/lib/policies/policyData.jsonc');

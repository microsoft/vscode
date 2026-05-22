/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execSync, execFileSync } from 'child_process';
import { resolve } from 'path';

const rootPath = resolve(import.meta.dirname, '..', '..', '..');

// VS Code OAuth app client ID (same as the GitHub Authentication extension)
const CLIENT_ID = '01ab8ac9400c4e429b23';

/**
 * Acquires a GitHub token via the OAuth device flow.
 * Opens the browser for the user to authorize, then polls for the token.
 */
async function acquireTokenViaDeviceFlow(): Promise<string> {
	const response1 = await (await fetch('https://github.com/login/device/code', {
		method: 'POST',
		body: JSON.stringify({ client_id: CLIENT_ID, scope: 'repo' }),
		headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
	})).json() as { user_code: string; device_code: string; verification_uri: string; expires_in: number; interval: number };

	console.log(`\n  Copy this code: ${response1.user_code}`);
	console.log(`  Then open: ${response1.verification_uri}`);
	console.log(`  Waiting for authorization (up to ${response1.expires_in}s)...\n`);

	let expiresIn = response1.expires_in;
	while (expiresIn > 0) {
		await new Promise(resolve => setTimeout(resolve, 1000 * response1.interval));
		expiresIn -= response1.interval;

		const response2 = await (await fetch('https://github.com/login/oauth/access_token', {
			method: 'POST',
			body: JSON.stringify({
				client_id: CLIENT_ID,
				device_code: response1.device_code,
				grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
			}),
			headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
		})).json() as { access_token?: string };

		if (response2.access_token) {
			return response2.access_token;
		}
	}

	throw new Error('Timed out waiting for GitHub authorization');
}

// Ensure sources are transpiled
console.log('Transpiling client sources...');
execSync('npm run transpile-client', { cwd: rootPath, stdio: 'inherit' });

// Set up GITHUB_TOKEN if not already set
if (!process.env['GITHUB_TOKEN'] && !process.env['DISTRO_PRODUCT_JSON']) {
	// Try gh CLI first (fast, non-interactive)
	let token: string | undefined;
	try {
		token = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();
		console.log('Set GITHUB_TOKEN from gh CLI.');
	} catch {
		// Fall back to OAuth device flow (interactive)
		console.log('gh CLI not available, starting GitHub OAuth device flow...');
		token = await acquireTokenViaDeviceFlow();
		console.log('GitHub authorization successful.');
	}

	process.env['GITHUB_TOKEN'] = token;
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

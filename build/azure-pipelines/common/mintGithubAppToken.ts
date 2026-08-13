/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from 'crypto';
import * as https from 'https';

/**
 * Mints a short-lived GitHub App installation token so a runtime `git:<ref>`
 * source build can clone the private `github/copilot-agent-runtime` repo. Mirrors
 * the JWT + installation-token flow used by
 * `build/azure-pipelines/github-check-run.js`.
 *
 * The `copilot-agent-runtime` GitHub App:
 *   App ID  4297675
 *   Secret  vscode-build-secrets / copilot-agent-runtime-gh-app (private key PEM)
 */

/** Default App ID for the `copilot-agent-runtime` GitHub App. */
export const COPILOT_APP_ID = '4297675';

/**
 * Mints a clone token from the App key in the environment, or returns undefined
 * when there is none. The key arrives as the literal `$(...)` macro when the
 * gated Key Vault step did not run — treat that (and empty) as "no key", leaving
 * an explicit `COPILOT_OVERRIDE_TOKEN` or a public clone to cover local runs.
 */
export async function mintCloneTokenFromEnv(repo: string, env: NodeJS.ProcessEnv = process.env): Promise<string | undefined> {
	const privateKey = (env['GITHUB_APP_PRIVATE_KEY'] ?? '').trim();
	if (!privateKey || privateKey.startsWith('$(')) {
		return undefined;
	}
	const appId = (env['GITHUB_APP_ID'] ?? COPILOT_APP_ID).trim();
	const [owner, name] = repo.split('/');
	console.log(`[copilot-override] Minting GitHub App installation token (app ${appId}) for ${repo}.`);
	return mintInstallationToken(appId, privateKey, owner, name);
}

function createJwt(appId: string, privateKey: string): string {
	const now = Math.floor(Date.now() / 1000);
	const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
	// `iat` backdated 60s for clock skew; `exp` is the 10 min JWT max.
	const payload = Buffer.from(JSON.stringify({ iat: now - 60, exp: now + 600, iss: appId })).toString('base64url');
	const signature = crypto.sign('sha256', Buffer.from(`${header}.${payload}`), privateKey).toString('base64url');
	return `${header}.${payload}.${signature}`;
}

function request(options: https.RequestOptions, body?: object): Promise<any> {
	return new Promise((resolve, reject) => {
		const req = https.request(options, res => {
			let data = '';
			res.on('data', chunk => data += chunk);
			res.on('end', () => {
				if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
					resolve(data ? JSON.parse(data) : {});
				} else {
					reject(new Error(`HTTP ${res.statusCode}: ${data}`));
				}
			});
		});
		req.on('error', reject);
		if (body) {
			req.write(JSON.stringify(body));
		}
		req.end();
	});
}

const ghHeaders = (auth: string): https.RequestOptions['headers'] => ({
	'Authorization': auth,
	'Accept': 'application/vnd.github+json',
	'User-Agent': 'VSCode-ADO-Pipeline',
	'X-GitHub-Api-Version': '2022-11-28',
});

/**
 * Mints an installation token scoped to `owner/repo` with `contents:read` — the
 * least privilege needed to clone it. Normalizes `\n`-escaped PEM keys.
 */
export async function mintInstallationToken(appId: string, privateKey: string, owner: string, repo: string): Promise<string> {
	const jwt = createJwt(appId, privateKey.includes('\\n') ? privateKey.replace(/\\n/g, '\n') : privateKey);

	const installation: { id: number } = await request({
		hostname: 'api.github.com',
		path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/installation`,
		method: 'GET',
		headers: ghHeaders(`Bearer ${jwt}`),
	});

	const result: { token: string } = await request({
		hostname: 'api.github.com',
		path: `/app/installations/${installation.id}/access_tokens`,
		method: 'POST',
		headers: ghHeaders(`Bearer ${jwt}`),
	}, { repositories: [repo], permissions: { contents: 'read' } });

	return result.token;
}

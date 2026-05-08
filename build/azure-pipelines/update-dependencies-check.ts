/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import crypto from 'crypto';
import https from 'https';

function createJwt(appId: string, privateKey: string): string {
	const now = Math.floor(Date.now() / 1000);
	const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
	const payload = Buffer.from(JSON.stringify({ iat: now - 60, exp: now + 600, iss: appId })).toString('base64url');
	const signature = crypto.sign('sha256', Buffer.from(`${header}.${payload}`), privateKey).toString('base64url');
	return `${header}.${payload}.${signature}`;
}

function request(options: https.RequestOptions, body?: object): Promise<Record<string, unknown>> {
	return new Promise((resolve, reject) => {
		const req = https.request(options, res => {
			let data = '';
			res.on('data', chunk => data += chunk);
			res.on('end', () => {
				if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
					resolve(JSON.parse(data));
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

async function getInstallationToken(jwt: string, installationId: string): Promise<string> {
	const result = await request({
		hostname: 'api.github.com',
		path: `/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${jwt}`,
			'Accept': 'application/vnd.github+json',
			'User-Agent': 'VSCode-ADO-Pipeline',
			'X-GitHub-Api-Version': '2022-11-28'
		}
	});
	return result.token as string;
}

function updateCheckRun(token: string, checkRunId: string, conclusion: string, detailsUrl: string) {
	return request({
		hostname: 'api.github.com',
		path: `/repos/microsoft/vscode/check-runs/${encodeURIComponent(checkRunId)}`,
		method: 'PATCH',
		headers: {
			'Authorization': `token ${token}`,
			'Accept': 'application/vnd.github+json',
			'User-Agent': 'VSCode-ADO-Pipeline',
			'X-GitHub-Api-Version': '2022-11-28'
		}
	}, {
		status: 'completed',
		conclusion,
		completed_at: new Date().toISOString(),
		details_url: detailsUrl
	});
}

async function main() {
	const appId = process.env.GITHUB_APP_ID;
	const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
	const installationId = process.env.GITHUB_APP_INSTALLATION_ID;
	const checkRunId = process.env.CHECK_RUN_ID;
	const jobStatus = process.env.AGENT_JOBSTATUS;
	const detailsUrl = `${process.env.SYSTEM_COLLECTIONURI}${process.env.SYSTEM_TEAMPROJECT}/_build/results?buildId=${process.env.BUILD_BUILDID}`;

	if (!appId || !privateKey || !installationId || !checkRunId) {
		throw new Error('Missing required environment variables');
	}

	const jwt = createJwt(appId, privateKey);
	const token = await getInstallationToken(jwt, installationId);

	let conclusion: string;
	switch (jobStatus) {
		case 'Succeeded':
		case 'SucceededWithIssues':
			conclusion = 'success';
			break;
		case 'Canceled':
			conclusion = 'cancelled';
			break;
		default:
			conclusion = 'failure';
			break;
	}

	await updateCheckRun(token, checkRunId, conclusion, detailsUrl);
	console.log(`Updated check run ${checkRunId} with conclusion: ${conclusion}`);
}

main().catch(err => {
	console.error(err);
	process.exit(1);
});

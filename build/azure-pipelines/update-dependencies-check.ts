/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import https from 'https';

function request(options: https.RequestOptions, body?: object): Promise<Record<string, unknown>> {
	return new Promise((resolve, reject) => {
		const req = https.request({ timeout: 30_000, ...options }, res => {
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
		req.on('timeout', () => req.destroy(new Error('Request timed out')));
		if (body) {
			req.write(JSON.stringify(body));
		}
		req.end();
	});
}

function delay(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
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
	const token = process.env.GITHUB_INSTALLATION_TOKEN;
	const checkRunId = process.env.CHECK_RUN_ID;
	const jobStatus = process.env.AGENT_JOBSTATUS;
	const detailsUrl = `${process.env.SYSTEM_COLLECTIONURI}${process.env.SYSTEM_TEAMPROJECT}/_build/results?buildId=${process.env.BUILD_BUILDID}`;

	if (!token || !checkRunId) {
		throw new Error('Missing required environment variables');
	}

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

	await updateCheckRunWithRetries(token, checkRunId, conclusion, detailsUrl);
	console.log(`Updated check run ${checkRunId} with conclusion: ${conclusion}`);
}

async function updateCheckRunWithRetries(token: string, checkRunId: string, conclusion: string, detailsUrl: string) {
	// Retry transient PATCH failures (network blips, brief GitHub 5xx). We do NOT retry
	// 401s — those mean the GitHub App installation token (1h lifetime) has expired and
	// no amount of retrying will help. Surface that clearly so the pipeline owner can
	// see it in the log.
	const attempts = 3;
	let lastErr: unknown;
	for (let i = 1; i <= attempts; i++) {
		try {
			await updateCheckRun(token, checkRunId, conclusion, detailsUrl);
			return;
		} catch (err) {
			lastErr = err;
			const message = err instanceof Error ? err.message : String(err);
			if (message.startsWith('HTTP 401')) {
				console.error('GitHub returned 401 updating the check run. The installation token (1h lifetime) likely expired before the pipeline finished. The Dependencies Check will remain IN_PROGRESS until manually resolved.');
				throw err;
			}
			console.error(`Attempt ${i}/${attempts} to update check run failed: ${message}`);
			if (i < attempts) {
				await delay(2_000 * i);
			}
		}
	}
	throw lastErr;
}

main().catch(err => {
	console.error(err);
	process.exit(1);
});

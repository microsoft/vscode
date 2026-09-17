/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import https from 'https';

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

	await updateCheckRun(token, checkRunId, conclusion, detailsUrl);
	console.log(`Updated check run ${checkRunId} with conclusion: ${conclusion}`);
}

main().catch(err => {
	console.error(err);
	process.exit(1);
});

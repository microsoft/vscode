/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import open from 'open';

const REQUEST1_URL = 'https://github.com/login/device/code';
const REQUEST2_URL = 'https://github.com/login/oauth/access_token';

// this is the VS Code OAuth app that the GitHub Authentication extension also uses
const CLIENT_ID = '01ab8ac9400c4e429b23';

const keypress = async () => {
	if (process.stdin.isTTY) {
		process.stdin.setRawMode(true);
	}

	return new Promise<void>(resolve =>
		process.stdin.once('data', data => {
			const byteArray = [...data];
			if (byteArray.length > 0 && byteArray[0] === 3) {
				console.log('^C');
				process.exit(1);
			}
			if (process.stdin.isTTY) {
				process.stdin.setRawMode(false);
			}
			resolve();
		})
	);
};

async function main(): Promise<void> {
	const requestOptions: RequestInit = {
		method: 'POST',
		body: JSON.stringify({
			client_id: CLIENT_ID,
			// Needed for codesearch to access any private repos
			scope: 'repo',
		}),
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
		},
	};
	const request1 = await fetch(REQUEST1_URL, requestOptions);
	const response1 = (await request1.json()) as any;
	console.log(`Copy this code: ${response1.user_code}`);
	console.log('Then press any key to launch the authorization page, paste the code in and approve the access.');
	console.log(`It will take up to ${response1.interval} seconds after approval for the token to be retrieved.`);
	await keypress();
	console.log(`Attempting to open ${response1.verification_uri}, if it doesn't open please manually navigate to the link and paste the code.`);
	const timeout = new Promise((resolve) => setTimeout(resolve, 5000));
	await Promise.race([open(response1.verification_uri), timeout]);
	let expiresIn = response1.expires_in;
	let accessToken: undefined | string;
	while (expiresIn > 0) {
		const requestOptions: RequestInit = {
			method: 'POST',
			body: JSON.stringify({
				client_id: CLIENT_ID,
				device_code: response1.device_code,
				grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
			}),
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
			},
		};
		const response2 = (await (await fetch(REQUEST2_URL, requestOptions)).json()) as any;
		expiresIn -= response1.interval;
		await new Promise(resolve => setTimeout(resolve, 1000 * response1.interval));
		if (response2.access_token) {
			accessToken = response2.access_token;
			break;
		}
	}
	if (accessToken === undefined) {
		console.log('Timed out waiting for authorization');
		process.exit(1);
	} else {
		const raw = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '';
		const result = raw.split('\n')
			.filter(line => !line.startsWith('GITHUB_OAUTH_TOKEN='))
			.concat([`GITHUB_OAUTH_TOKEN=${accessToken}`])
			.filter(line => line.trim() !== '') // Remove empty lines
			.join('\n');

		fs.writeFileSync('.env', result);
		console.log('Wrote token to .env');
		process.exit(0);
	}
}

if (!process.stdin.isTTY) {
	console.log('Not running in a TTY environment, skipping token generation.');
	process.exit(0);
}

main();

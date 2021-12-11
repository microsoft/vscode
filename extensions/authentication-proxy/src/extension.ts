/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, commands, env, ExtensionContext, Progress, ProgressLocation, Uri, window } from 'vscode';
import fetch from 'node-fetch';
import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();
const CLIENT_ID = '01ab8ac9400c4e429b23';

interface IGitHubDeviceCodeResponse {
	device_code: string;
	user_code: string;
	verification_uri: string;
	interval: number;
}

async function waitForDeviceCodeAccessToken(
	json: IGitHubDeviceCodeResponse,
	progress: Progress<{ message?: string | undefined; increment?: number | undefined; }>,
	token: CancellationToken
): Promise<string> {

	const refreshTokenUri = `https://github.com/login/oauth/access_token?client_id=${CLIENT_ID}&device_code=${json.device_code}&grant_type=urn:ietf:params:oauth:grant-type:device_code`;
	const attempts = 120 / json.interval;
	for (let i = 0; i < attempts; i++) {
		await new Promise(resolve => setTimeout(resolve, json.interval * 1000));
		progress.report({ message: localize('progress.update', "attempt {0} of {1}", i + 1, attempts + 1) });
		if (token.isCancellationRequested) {
			throw new Error(localize('cancelled', "Cancelled"));
		}
		let accessTokenResult;
		try {
			accessTokenResult = await fetch(refreshTokenUri, {
				method: 'POST',
				headers: {
					Accept: 'application/json'
				}
			});
		} catch {
			continue;
		}

		if (!accessTokenResult.ok) {
			continue;
		}

		const accessTokenJson = await accessTokenResult.json();

		if (accessTokenJson.error === 'authorization_pending') {
			continue;
		}

		if (accessTokenJson.error) {
			throw new Error(accessTokenJson.error_description);
		}

		return accessTokenJson.access_token;
	}

	throw new Error('Failed to get access token');
}

export async function activate(context: ExtensionContext) {
	context.subscriptions.push(commands.registerCommand('authentication.github.device.code', async (scopes: string) => {
		const uri = `https://github.com/login/device/code?client_id=${CLIENT_ID}&scope=${scopes}`;
		const result = await fetch(uri, {
			method: 'POST',
			headers: {
				Accept: 'application/json'
			}
		});
		if (!result.ok) {
			throw new Error(`Failed to get device code: ${await result.text()}`);
		}

		const json = await result.json() as IGitHubDeviceCodeResponse;

		await env.clipboard.writeText(json.user_code);

		const modalResult = await window.showInformationMessage(
			localize('code.title', "Your Code: {0}", json.user_code),
			{
				modal: true,
				detail: localize('code.detail', "The above one-time code has been copied to your clipboard. Continue to {0}  to finish authenticating?", json.verification_uri)
			}, 'OK');

		if (modalResult !== 'OK') {
			throw new Error('Cancelled');
		}

		const uriToOpen = await env.asExternalUri(Uri.parse(json.verification_uri));
		await env.openExternal(uriToOpen);

		return await window.withProgress<string>({
			location: ProgressLocation.Notification,
			cancellable: true,
			title: localize('progress', "• Code: {0} • Url: {1} • Polling GitHub to finish authenticating", json.user_code, json.verification_uri)
		}, async (progress, token) => {
			return await waitForDeviceCodeAccessToken(json, progress, token);
		});
	}));
}

export async function deactivate() { }

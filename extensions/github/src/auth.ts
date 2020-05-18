/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AuthenticationSession, authentication, window } from 'vscode';
import { Agent, globalAgent } from 'https';
import { Octokit } from '@octokit/rest';
import { httpsOverHttp } from 'tunnel';
import { URL } from 'url';

function getAgent(url: string | undefined = process.env.HTTPS_PROXY): Agent {
	if (!url) {
		return globalAgent;
	}

	try {
		const { hostname, port, username, password } = new URL(url);
		const auth = username && password && `${username}:${password}`;
		return httpsOverHttp({ proxy: { host: hostname, port, proxyAuth: auth } });
	} catch (e) {
		window.showErrorMessage(`HTTPS_PROXY environment variable ignored: ${e.message}`);
		return globalAgent;
	}
}

const scopes = ['repo'];

export async function getSession(): Promise<AuthenticationSession> {
	const authenticationSessions = await authentication.getSessions('github', scopes);

	if (authenticationSessions.length) {
		return await authenticationSessions[0];
	} else {
		return await authentication.login('github', scopes);
	}
}

let _octokit: Promise<Octokit> | undefined;

export function getOctokit(): Promise<Octokit> {
	if (!_octokit) {
		_octokit = getSession().then(async session => {
			const token = await session.getAccessToken();
			const agent = getAgent();

			return new Octokit({
				request: { agent },
				userAgent: 'GitHub VSCode',
				auth: `token ${token}`
			});
		}).then(null, async err => {
			_octokit = undefined;
			throw err;
		});
	}

	return _octokit;
}


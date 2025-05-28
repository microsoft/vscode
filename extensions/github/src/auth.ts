/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AuthenticationSession, authentication, window } from 'vscode';
import { Agent, globalAgent } from 'https';
import { graphql } from '@octokit/graphql/types';
import { Octokit } from '@octokit/rest';
import { httpsOverHttp } from 'tunnel';
import { URL } from 'url';
import { sequentialize } from './util.js';

export class AuthenticationError extends Error { }

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

const scopes = ['repo', 'workflow', 'user:email', 'read:user'];

export async function getSession(): Promise<AuthenticationSession> {
	return await authentication.getSession('github', scopes, { createIfNone: true });
}

let _octokit: Promise<Octokit> | undefined;

export function getOctokit(): Promise<Octokit> {
	if (!_octokit) {
		_octokit = getSession().then(async session => {
			const token = session.accessToken;
			const agent = getAgent();

			const { Octokit } = await import('@octokit/rest');

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

export class AuthHelper {
	private static _octokitGraphql: graphql | undefined;

	@sequentialize
	static async getOctokitGraphql(): Promise<graphql> {
		if (AuthHelper._octokitGraphql) {
			return AuthHelper._octokitGraphql;
		}

		const session = await authentication.getSession('github', scopes);
		if (!session) {
			throw new AuthenticationError('User is not signed in to GitHub');
		}

		const { graphql } = await import('@octokit/graphql');

		AuthHelper._octokitGraphql = graphql.defaults({
			headers: {
				authorization: `token ${session.accessToken}`,
				'user-agent': 'GitHub VSCode'
			},
			request: { agent: getAgent() }
		});

		return AuthHelper._octokitGraphql;
	}
}

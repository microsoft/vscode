/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { NETWORK_ERROR } from './errors';
import { IHttpClient, IHttpResponse } from './http';
import { Log } from './logger';

/**
 * The GitHub identity an access token belongs to, as reported by `GET /user`.
 */
export interface IGitHubUserInfo {
	readonly id: string;
	/** The GitHub login, without a leading `@`. */
	readonly accountName: string;
	readonly avatarUrl: string | undefined;
}

/**
 * Asks a GitHub host who an access token belongs to.
 *
 * Takes the endpoint rather than deriving it, because the answer is only meaningful for the host
 * that minted the token: `url` and `token` have to come from the same place.
 */
export async function fetchUserInfo(http: IHttpClient, url: string, token: string, logger: Log): Promise<IGitHubUserInfo> {
	let result: IHttpResponse;
	try {
		logger.info('Getting user info...');
		result = await http.send({
			url,
			method: 'GET',
			retryFallbacks: true,
			headers: {
				Authorization: `token ${token}`,
				'User-Agent': `${vscode.env.appName} (${vscode.env.appHost})`
			}
		});
	} catch (ex) {
		logger.error(ex.message);
		throw new Error(NETWORK_ERROR);
	}

	if (result.ok) {
		try {
			const json = await result.json() as { id: number; login: string; avatar_url?: string };
			logger.info('Got account info!');
			return { id: `${json.id}`, accountName: json.login, avatarUrl: json.avatar_url };
		} catch (e) {
			logger.error(`Unexpected error parsing response from GitHub: ${e.message ?? e}`);
			throw e;
		}
	}

	// either display the response message or the http status text
	let errorMessage = result.statusText;
	try {
		const json = await result.json() as { message?: string };
		if (json.message) {
			errorMessage = json.message;
		}
	} catch (err) {
		// noop
	}
	logger.error(`Getting account info failed: ${errorMessage}`);
	throw new Error(errorMessage);
}

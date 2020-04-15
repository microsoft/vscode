/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as https from 'https';
import * as vscode from 'vscode';
import * as uuid from 'uuid';
import { PromiseAdapter, promiseFromEvent } from './common/utils';
import Logger from './common/logger';
import ClientRegistrar, { ClientDetails } from './common/clientRegistrar';

class UriEventHandler extends vscode.EventEmitter<vscode.Uri> implements vscode.UriHandler {
	public handleUri(uri: vscode.Uri) {
		this.fire(uri);
	}
}

export const uriHandler = new UriEventHandler;

const exchangeCodeForToken: (state: string, clientDetails: ClientDetails) => PromiseAdapter<vscode.Uri, string> =
	(state, clientDetails) => async (uri, resolve, reject) => {
		Logger.info('Exchanging code for token...');
		const query = parseQuery(uri);
		const code = query.code;

		if (query.state !== state) {
			reject('Received mismatched state');
			return;
		}

		const post = https.request({
			host: 'github.com',
			path: `/login/oauth/access_token?client_id=${clientDetails.id}&client_secret=${clientDetails.secret}&state=${query.state}&code=${code}`,
			method: 'POST',
			headers: {
				Accept: 'application/json'
			}
		}, result => {
			const buffer: Buffer[] = [];
			result.on('data', (chunk: Buffer) => {
				buffer.push(chunk);
			});
			result.on('end', () => {
				if (result.statusCode === 200) {
					const json = JSON.parse(Buffer.concat(buffer).toString());
					Logger.info('Token exchange success!');
					resolve(json.access_token);
				} else {
					reject(new Error(result.statusMessage));
				}
			});
		});

		post.end();
		post.on('error', err => {
			reject(err);
		});
	};

function parseQuery(uri: vscode.Uri) {
	return uri.query.split('&').reduce((prev: any, current) => {
		const queryString = current.split('=');
		prev[queryString[0]] = queryString[1];
		return prev;
	}, {});
}

export class GitHubServer {
	public async login(scopes: string): Promise<string> {
		Logger.info('Logging in...');
		const state = uuid();
		const callbackUri = await vscode.env.asExternalUri(vscode.Uri.parse(`${vscode.env.uriScheme}://vscode.github-authentication/did-authenticate`));
		const clientDetails = scopes === 'vso' ? ClientRegistrar.getGitHubAppDetails() : ClientRegistrar.getClientDetails(callbackUri);
		const uri = vscode.Uri.parse(`https://github.com/login/oauth/authorize?redirect_uri=${encodeURIComponent(callbackUri.toString())}&scope=${scopes}&state=${state}&client_id=${clientDetails.id}`);

		vscode.env.openExternal(uri);
		return promiseFromEvent(uriHandler.event, exchangeCodeForToken(state, clientDetails));
	}

	public async hasUserInstallation(token: string): Promise<boolean> {
		return new Promise((resolve, reject) => {
			Logger.info('Getting user installations...');
			const post = https.request({
				host: 'api.github.com',
				path: `/user/installations`,
				method: 'GET',
				headers: {
					Accept: 'application/vnd.github.machine-man-preview+json',
					Authorization: `token ${token}`,
					'User-Agent': 'Visual-Studio-Code'
				}
			}, result => {
				const buffer: Buffer[] = [];
				result.on('data', (chunk: Buffer) => {
					buffer.push(chunk);
				});
				result.on('end', () => {
					if (result.statusCode === 200) {
						const json = JSON.parse(Buffer.concat(buffer).toString());
						Logger.info('Got installation info!');
						const hasInstallation = json.installations.some((installation: { app_slug: string }) => installation.app_slug === 'microsoft-visual-studio-code');
						resolve(hasInstallation);
					} else {
						reject(new Error(result.statusMessage));
					}
				});
			});

			post.end();
			post.on('error', err => {
				reject(err);
			});
		});
	}

	public async installApp(): Promise<string> {
		const clientDetails = ClientRegistrar.getGitHubAppDetails();
		const state = uuid();
		const uri = vscode.Uri.parse(`https://github.com/apps/microsoft-visual-studio-code/installations/new?state=${state}`);

		vscode.env.openExternal(uri);
		return promiseFromEvent(uriHandler.event, exchangeCodeForToken(state, clientDetails));
	}

	public async getUserInfo(token: string): Promise<{ id: string, accountName: string }> {
		return new Promise((resolve, reject) => {
			Logger.info('Getting account info...');
			const post = https.request({
				host: 'api.github.com',
				path: `/user`,
				method: 'GET',
				headers: {
					Authorization: `token ${token}`,
					'User-Agent': 'Visual-Studio-Code'
				}
			}, result => {
				const buffer: Buffer[] = [];
				result.on('data', (chunk: Buffer) => {
					buffer.push(chunk);
				});
				result.on('end', () => {
					if (result.statusCode === 200) {
						const json = JSON.parse(Buffer.concat(buffer).toString());
						Logger.info('Got account info!');
						resolve({ id: json.id, accountName: json.login });
					} else {
						reject(new Error(result.statusMessage));
					}
				});
			});

			post.end();
			post.on('error', err => {
				reject(err);
			});
		});
	}

	public async revokeToken(token: string): Promise<void> {
		return new Promise(async (resolve, reject) => {
			const callbackUri = await vscode.env.asExternalUri(vscode.Uri.parse(`${vscode.env.uriScheme}://vscode.github-authentication/did-authenticate`));
			const clientDetails = ClientRegistrar.getClientDetails(callbackUri);
			const detailsString = `${clientDetails.id}:${clientDetails.secret}`;

			const payload = JSON.stringify({ access_token: token });

			Logger.info('Revoking token...');
			const post = https.request({
				host: 'api.github.com',
				path: `/applications/${clientDetails.id}/token`,
				method: 'DELETE',
				headers: {
					Authorization: `Basic ${Buffer.from(detailsString).toString('base64')}`,
					'User-Agent': 'Visual-Studio-Code',
					'Content-Type': 'application/json',
					'Content-Length': Buffer.byteLength(payload)
				}
			}, result => {
				const buffer: Buffer[] = [];
				result.on('data', (chunk: Buffer) => {
					buffer.push(chunk);
				});
				result.on('end', () => {
					if (result.statusCode === 204) {
						Logger.info('Revoked token!');
						resolve();
					} else {
						reject(new Error(result.statusMessage));
					}
				});
			});

			post.write(payload);
			post.end();
			post.on('error', err => {
				reject(err);
			});
		});
	}
}

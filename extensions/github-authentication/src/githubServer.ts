/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as https from 'https';
import * as nls from 'vscode-nls';
import * as vscode from 'vscode';
import * as uuid from 'uuid';
import { PromiseAdapter, promiseFromEvent } from './common/utils';
import Logger from './common/logger';

const localize = nls.loadMessageBundle();

export const NETWORK_ERROR = 'network error';
const AUTH_RELAY_SERVER = 'vscode-auth.github.com';

class UriEventHandler extends vscode.EventEmitter<vscode.Uri> implements vscode.UriHandler {
	public handleUri(uri: vscode.Uri) {
		this.fire(uri);
	}
}

export const uriHandler = new UriEventHandler;

const exchangeCodeForToken: (state: string) => PromiseAdapter<vscode.Uri, string> =
	(state) => async (uri, resolve, reject) => {
		Logger.info('Exchanging code for token...');
		const query = parseQuery(uri);
		const code = query.code;

		if (query.state !== state) {
			reject('Received mismatched state');
			return;
		}

		const post = https.request({
			host: AUTH_RELAY_SERVER,
			path: `/token?code=${code}&state=${state}`,
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
	private _statusBarItem: vscode.StatusBarItem | undefined;

	public async login(scopes: string): Promise<string> {
		Logger.info('Logging in...');
		this.updateStatusBarItem(true);

		const state = uuid();
		const callbackUri = await vscode.env.asExternalUri(vscode.Uri.parse(`${vscode.env.uriScheme}://vscode.github-authentication/did-authenticate`));
		const uri = vscode.Uri.parse(`https://${AUTH_RELAY_SERVER}/authorize/?callbackUri=${encodeURIComponent(callbackUri.toString())}&scope=${scopes}&state=${state}&responseType=code`);

		vscode.env.openExternal(uri);

		return promiseFromEvent(uriHandler.event, exchangeCodeForToken(state)).finally(() => {
			this.updateStatusBarItem(false);
		});
	}

	private updateStatusBarItem(isStart?: boolean) {
		if (isStart && !this._statusBarItem) {
			this._statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
			this._statusBarItem.text = localize('signingIn', "$(mark-github) Signing in to github.com...");
			this._statusBarItem.command = 'github.provide-token';
			this._statusBarItem.show();
		}

		if (!isStart && this._statusBarItem) {
			this._statusBarItem.dispose();
			this._statusBarItem = undefined;
		}
	}

	public async manuallyProvideToken() {
		const uriOrToken = await vscode.window.showInputBox({ prompt: 'Token', ignoreFocusOut: true });
		if (!uriOrToken) { return; }
		try {
			const uri = vscode.Uri.parse(uriOrToken);
			if (!uri.scheme || uri.scheme === 'file') { throw new Error; }
			uriHandler.handleUri(uri);
		} catch (e) {
			Logger.error(e);
			vscode.window.showErrorMessage(localize('unexpectedInput', "The input did not matched the expected format"));
		}
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
						Logger.error(`Getting account info failed: ${result.statusMessage}`);
						reject(new Error(result.statusMessage));
					}
				});
			});

			post.end();
			post.on('error', err => {
				Logger.error(err.message);
				reject(new Error(NETWORK_ERROR));
			});
		});
	}
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from 'crypto';
import * as vscode from 'vscode';
import * as https from 'https';
import * as querystring from 'querystring';
import { keychain } from './keychain';
import { toBase64UrlEncoding } from './utils';
import { createServer, startServer } from './authServer';

const redirectUrl = 'https://vscode-redirect.azurewebsites.net/';
const loginEndpointUrl = 'https://login.microsoftonline.com/';
const clientId = 'aebc6443-996d-45c2-90f0-388ff96faa56';
const scope = 'https://management.core.windows.net/.default offline_access';
const tenant = 'common';

interface IToken {
	expiresIn: string; // How long access token is valid, in seconds
	accessToken: string;
	refreshToken: string;
}

export const onDidChangeAccounts = new vscode.EventEmitter<vscode.Account[]>();

export class AzureActiveDirectoryService {
	private _token: IToken | undefined;
	private _refreshTimeout: NodeJS.Timeout | undefined;

	public async initialize(): Promise<void> {
		const existingRefreshToken = await keychain.getToken();
		if (existingRefreshToken) {
			await this.refreshToken(existingRefreshToken);
		}
	}

	private tokenToAccount(token: IToken): vscode.Account {
		return {
			id: '',
			accessToken: token.accessToken,
			displayName: this.getDisplayNameFromToken(token.accessToken)
		};
	}

	private getDisplayNameFromToken(accessToken: string): string {
		let displayName = 'user@example.com';
		try {
			// TODO fixme
			displayName = JSON.parse(atob(accessToken.split('.')[1]));
		} catch (e) {
			// Fall back to example display name
		}

		return displayName;
	}

	get accounts(): vscode.Account[] {
		return this._token ? [this.tokenToAccount(this._token)] : [];
	}

	public async login(): Promise<void> {
		const nonce = crypto.randomBytes(16).toString('base64');
		const { server, redirectPromise, codePromise } = createServer(nonce);

		let token: IToken | undefined;
		try {
			const port = await startServer(server);
			vscode.env.openExternal(vscode.Uri.parse(`http://localhost:${port}/signin?nonce=${encodeURIComponent(nonce)}`));

			const redirectReq = await redirectPromise;
			if ('err' in redirectReq) {
				const { err, res } = redirectReq;
				res.writeHead(302, { Location: `/?error=${encodeURIComponent(err && err.message || 'Unknown error')}` });
				res.end();
				throw err;
			}

			const host = redirectReq.req.headers.host || '';
			const updatedPortStr = (/^[^:]+:(\d+)$/.exec(Array.isArray(host) ? host[0] : host) || [])[1];
			const updatedPort = updatedPortStr ? parseInt(updatedPortStr, 10) : port;

			const state = `${updatedPort},${encodeURIComponent(nonce)}`;

			const codeVerifier = toBase64UrlEncoding(crypto.randomBytes(32).toString('base64'));
			const codeChallenge = toBase64UrlEncoding(crypto.createHash('sha256').update(codeVerifier).digest('base64'));
			const loginUrl = `${loginEndpointUrl}${tenant}/oauth2/v2.0/authorize?response_type=code&response_mode=query&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUrl)}&state=${state}&scope=${encodeURIComponent(scope)}&prompt=select_account&code_challenge_method=S256&code_challenge=${codeChallenge}`;

			await redirectReq.res.writeHead(302, { Location: loginUrl });
			redirectReq.res.end();

			const codeRes = await codePromise;
			const res = codeRes.res;

			try {
				if ('err' in codeRes) {
					throw codeRes.err;
				}
				token = await this.exchangeCodeForToken(codeRes.code, codeVerifier);
				this.setToken(token);
				res.writeHead(302, { Location: '/' });
				res.end();
			} catch (err) {
				res.writeHead(302, { Location: `/?error=${encodeURIComponent(err && err.message || 'Unknown error')}` });
				res.end();
			}
		} finally {
			setTimeout(() => {
				server.close();
			}, 5000);
		}
	}

	private async setToken(token: IToken): Promise<void> {
		this._token = token;

		if (this._refreshTimeout) {
			clearTimeout(this._refreshTimeout);
		}

		this._refreshTimeout = setTimeout(async () => {
			try {
				await this.refreshToken(token.refreshToken);
			} catch (e) {
				vscode.window.showErrorMessage(`You have been signed out.`);
				this._token = undefined;
			} finally {
				onDidChangeAccounts.fire(this.accounts);
			}
		}, 1000 * (parseInt(token.expiresIn) - 10));

		await keychain.setToken(token.refreshToken);
	}

	private async exchangeCodeForToken(code: string, codeVerifier: string): Promise<IToken> {
		return new Promise((resolve: (value: IToken) => void, reject) => {
			try {
				const postData = querystring.stringify({
					grant_type: 'authorization_code',
					code: code,
					client_id: clientId,
					scope: scope,
					code_verifier: codeVerifier,
					redirect_uri: redirectUrl
				});

				const tokenUrl = vscode.Uri.parse(`${loginEndpointUrl}${tenant}/oauth2/v2.0/token`);

				const post = https.request({
					host: tokenUrl.authority,
					path: tokenUrl.path,
					method: 'POST',
					headers: {
						'Content-Type': 'application/x-www-form-urlencoded',
						'Content-Length': postData.length
					}
				}, result => {
					const buffer: Buffer[] = [];
					result.on('data', (chunk: Buffer) => {
						buffer.push(chunk);
					});
					result.on('end', () => {
						if (result.statusCode === 200) {
							const json = JSON.parse(Buffer.concat(buffer).toString());
							resolve({
								expiresIn: json.expires_in,
								accessToken: json.access_token,
								refreshToken: json.refresh_token
							});
						} else {
							reject(new Error('Unable to login.'));
						}
					});
				});

				post.write(postData);

				post.end();
				post.on('error', err => {
					reject(err);
				});

			} catch (e) {
				reject(e);
			}
		});
	}

	private async refreshToken(refreshToken: string): Promise<IToken> {
		return new Promise((resolve: (value: IToken) => void, reject) => {
			const postData = querystring.stringify({
				refresh_token: refreshToken,
				client_id: clientId,
				grant_type: 'refresh_token',
				scope: scope
			});

			const post = https.request({
				host: 'login.microsoftonline.com',
				path: `/${tenant}/oauth2/v2.0/token`,
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					'Content-Length': postData.length
				}
			}, result => {
				const buffer: Buffer[] = [];
				result.on('data', (chunk: Buffer) => {
					buffer.push(chunk);
				});
				result.on('end', () => {
					if (result.statusCode === 200) {
						const json = JSON.parse(Buffer.concat(buffer).toString());
						const token = {
							expiresIn: json.expires_in,
							accessToken: json.access_token,
							refreshToken: json.refresh_token
						};
						this.setToken(token);
						resolve(token);
					} else {
						vscode.window.showInformationMessage(`error`);
						reject(new Error('Bad!'));
					}
				});
			});

			post.write(postData);

			post.end();
			post.on('error', err => {
				reject(err);
			});
		});
	}

	public async logout() {
		delete this._token;
		await keychain.deleteToken();
		if (this._refreshTimeout) {
			clearTimeout(this._refreshTimeout);
		}
	}
}

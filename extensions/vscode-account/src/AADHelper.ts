/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from 'crypto';
import * as https from 'https';
import * as querystring from 'querystring';
import * as vscode from 'vscode';
import { createServer, startServer } from './authServer';
import { keychain } from './keychain';
import Logger from './logger';
import { toBase64UrlEncoding } from './utils';

const redirectUrl = 'https://vscode-redirect.azurewebsites.net/';
const loginEndpointUrl = 'https://login.microsoftonline.com/';
const clientId = 'aebc6443-996d-45c2-90f0-388ff96faa56';
const resourceId = 'https://management.core.windows.net/';
const tenant = 'common';

interface IToken {
	expiresIn: string; // How long access token is valid, in seconds
	accessToken: string;
	refreshToken: string;
}

interface ITokenClaims {
	email?: string;
	unique_name?: string;
	oid?: string;
	altsecid?: string;
}

export const onDidChangeSessions = new vscode.EventEmitter<void>();

export class AzureActiveDirectoryService {
	private _token: IToken | undefined;
	private _refreshTimeout: NodeJS.Timeout | undefined;

	public async initialize(): Promise<void> {
		const existingRefreshToken = await keychain.getToken();
		if (existingRefreshToken) {
			await this.refreshToken(existingRefreshToken);
		}

		this.pollForChange();
	}

	private pollForChange() {
		setTimeout(async () => {
			const refreshToken = await keychain.getToken();
			// Another window has logged in, generate access token for this instance.
			if (refreshToken && !this._token) {
				await this.refreshToken(refreshToken);
				onDidChangeSessions.fire();
			}

			// Another window has logged out
			if (!refreshToken && this._token) {
				await this.logout();
				onDidChangeSessions.fire();
			}

			this.pollForChange();
		}, 1000 * 30);
	}

	private tokenToAccount(token: IToken): vscode.Session {
		const claims = this.getTokenClaims(token.accessToken);
		return {
			id: claims?.oid || claims?.altsecid || '',
			accessToken: token.accessToken,
			displayName: claims?.email || claims?.unique_name || 'user@example.com'
		};
	}

	private getTokenClaims(accessToken: string): ITokenClaims | undefined {
		try {
			return JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString());
		} catch (e) {
			Logger.error(e.message);
		}
	}

	get sessions(): vscode.Session[] {
		return this._token ? [this.tokenToAccount(this._token)] : [];
	}

	public async login(): Promise<void> {
		Logger.info('Logging in...');
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
			const loginUrl = `${loginEndpointUrl}${tenant}/oauth2/authorize?response_type=code&response_mode=query&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUrl)}&state=${state}&resource=${encodeURIComponent(resourceId)}&prompt=select_account&code_challenge_method=S256&code_challenge=${codeChallenge}`;

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
				Logger.info('Login successful');
				res.writeHead(302, { Location: '/' });
				res.end();
			} catch (err) {
				Logger.error(err.message);
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
				await this.logout();
			} finally {
				onDidChangeSessions.fire();
			}
		}, 1000 * (parseInt(token.expiresIn) - 10));

		await keychain.setToken(token.refreshToken);
	}

	private async exchangeCodeForToken(code: string, codeVerifier: string): Promise<IToken> {
		return new Promise((resolve: (value: IToken) => void, reject) => {
			Logger.info('Exchanging login code for token');
			try {
				const postData = querystring.stringify({
					grant_type: 'authorization_code',
					code: code,
					client_id: clientId,
					resource: resourceId,
					code_verifier: codeVerifier,
					redirect_uri: redirectUrl
				});

				const tokenUrl = vscode.Uri.parse(`${loginEndpointUrl}${tenant}/oauth2/token`);

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
				Logger.error(e.message);
				reject(e);
			}
		});
	}

	private async refreshToken(refreshToken: string): Promise<IToken> {
		return new Promise((resolve: (value: IToken) => void, reject) => {
			Logger.info('Refreshing token...');
			const postData = querystring.stringify({
				refresh_token: refreshToken,
				client_id: clientId,
				grant_type: 'refresh_token',
				resource: resourceId
			});

			const post = https.request({
				host: 'login.microsoftonline.com',
				path: `/${tenant}/oauth2/token`,
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
				result.on('end', async () => {
					if (result.statusCode === 200) {
						const json = JSON.parse(Buffer.concat(buffer).toString());
						const token = {
							expiresIn: json.expires_in,
							accessToken: json.access_token,
							refreshToken: json.refresh_token
						};
						this.setToken(token);
						Logger.info('Token refresh success');
						resolve(token);
					} else {
						await this.logout();
						Logger.error('Refreshing token failed');
						reject(new Error('Refreshing token failed.'));
					}
				});
			});

			post.write(postData);

			post.end();
			post.on('error', err => {
				Logger.error(err.message);
				reject(err);
			});
		});
	}

	public async logout() {
		Logger.info('Logging out');
		delete this._token;
		await keychain.deleteToken();
		if (this._refreshTimeout) {
			clearTimeout(this._refreshTimeout);
		}
	}
}

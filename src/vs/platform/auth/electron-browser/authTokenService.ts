/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from 'crypto';
import * as https from 'https';
import { Event, Emitter } from 'vs/base/common/event';
import { IAuthTokenService, AuthTokenStatus } from 'vs/platform/auth/common/auth';
import { ICredentialsService } from 'vs/platform/credentials/common/credentials';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { shell } from 'electron';

const SERVICE_NAME = 'VS Code';
const ACCOUNT = 'MyAccount';

const redirectUrlAAD = 'https://vscode-redirect.azurewebsites.net/';
const activeDirectoryEndpointUrl = 'https://login.microsoftonline.com/';
const activeDirectoryResourceId = 'https://management.core.windows.net/';

const clientId = 'aebc6443-996d-45c2-90f0-388ff96faa56';
const tenantId = 'common';

function parseQuery(uri: URI) {
	return uri.query.split('&').reduce((prev: any, current) => {
		const queryString = current.split('=');
		prev[queryString[0]] = queryString[1];
		return prev;
	}, {});
}

function toQuery(obj: any): string {
	return Object.keys(obj).map(key => `${key}=${obj[key]}`).join('&');
}

function toBase64UrlEncoding(base64string: string) {
	return base64string.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_'); // Need to use base64url encoding
}

export interface IToken {
	expiresIn: string; // How long access token is valid, in seconds
	expiresOn: string; // When the access token expires in epoch time
	accessToken: string;
	refreshToken: string;
}

export class AuthTokenService extends Disposable implements IAuthTokenService {
	_serviceBrand: undefined;

	private _status: AuthTokenStatus = AuthTokenStatus.Inactive;
	get status(): AuthTokenStatus { return this._status; }
	private _onDidChangeStatus: Emitter<AuthTokenStatus> = this._register(new Emitter<AuthTokenStatus>());
	readonly onDidChangeStatus: Event<AuthTokenStatus> = this._onDidChangeStatus.event;

	public readonly _onDidGetCallback: Emitter<URI> = this._register(new Emitter<URI>());
	readonly onDidGetCallback: Event<URI> = this._onDidGetCallback.event;

	private _activeToken: IToken | undefined;

	constructor(
		@ICredentialsService private readonly credentialsService: ICredentialsService,
	) {
		super();
		this.credentialsService.getPassword(SERVICE_NAME, ACCOUNT).then(storedRefreshToken => {
			if (storedRefreshToken) {
				this.refresh(storedRefreshToken);
			}
		});
	}

	public async login(callbackUri: URI): Promise<void> {
		this.setStatus(AuthTokenStatus.SigningIn);
		const nonce = generateUuid();
		const port = (callbackUri.authority.match(/:([0-9]*)$/) || [])[1] || (callbackUri.scheme === 'https' || callbackUri.scheme === 'http' ? 443 : 80);
		const state = `${callbackUri.scheme},${port},${encodeURIComponent(nonce)},${encodeURIComponent(callbackUri.query)}`;
		const signInUrl = `${activeDirectoryEndpointUrl}${tenantId}/oauth2/authorize`;

		const codeVerifier = toBase64UrlEncoding(crypto.randomBytes(32).toString('base64'));
		const codeChallenge = toBase64UrlEncoding(crypto.createHash('sha256').update(codeVerifier).digest('base64'));

		let uri = URI.parse(signInUrl);
		uri = uri.with({
			query: `response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${redirectUrlAAD}&state=${encodeURIComponent(state)}&resource=${activeDirectoryResourceId}&prompt=select_account&code_challenge_method=S256&code_challenge=${codeChallenge}`
		});

		await shell.openExternal(uri.toString(true));

		const timeoutPromise = new Promise((resolve: (value: IToken) => void, reject) => {
			const wait = setTimeout(() => {
				this.setStatus(AuthTokenStatus.Inactive);
				clearTimeout(wait);
				reject('Login timed out.');
			}, 1000 * 60 * 5);
		});

		return Promise.race([this.exchangeCodeForToken(clientId, tenantId, codeVerifier, state), timeoutPromise]).then(token => {
			this.setToken(token);
		});
	}

	public getToken(): Promise<string | undefined> {
		return Promise.resolve(this._activeToken?.accessToken);
	}

	public async refreshToken(): Promise<void> {
		if (!this._activeToken) {
			throw new Error('No token to refresh');
		}

		this.refresh(this._activeToken.refreshToken);
	}

	private setToken(token: IToken) {
		this._activeToken = token;
		this.credentialsService.setPassword(SERVICE_NAME, ACCOUNT, token.refreshToken);
		this.setStatus(AuthTokenStatus.Active);
	}

	private async exchangeCodeForToken(clientId: string, tenantId: string, codeVerifier: string, state: string): Promise<IToken> {
		let uriEventListener: IDisposable;
		return new Promise((resolve: (value: IToken) => void, reject) => {
			uriEventListener = this.onDidGetCallback(async (uri: URI) => {
				try {
					const query = parseQuery(uri);
					const code = query.code;

					if (query.state !== state) {
						return;
					}

					const postData = toQuery({
						grant_type: 'authorization_code',
						code: code,
						client_id: clientId,
						code_verifier: codeVerifier,
						redirect_uri: redirectUrlAAD
					});

					const post = https.request({
						host: 'login.microsoftonline.com',
						path: `/${tenantId}/oauth2/token`,
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
									expiresIn: json.access_token,
									expiresOn: json.expires_on,
									accessToken: json.access_token,
									refreshToken: json.refresh_token
								});
							} else {
								reject(new Error('Bad!'));
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
		}).then(result => {
			uriEventListener.dispose();
			return result;
		}).catch(err => {
			uriEventListener.dispose();
			throw err;
		});
	}

	private async refresh(refreshToken: string): Promise<void> {
		return new Promise((resolve, reject) => {
			const postData = toQuery({
				refresh_token: refreshToken,
				client_id: clientId,
				grant_type: 'refresh_token',
				resource: activeDirectoryResourceId
			});

			const post = https.request({
				host: 'login.microsoftonline.com',
				path: `/${tenantId}/oauth2/token`,
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
						this.setToken({
							expiresIn: json.access_token,
							expiresOn: json.expires_on,
							accessToken: json.access_token,
							refreshToken: json.refresh_token
						});
						resolve();
					} else {
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

	async logout(): Promise<void> {
		await this.credentialsService.deletePassword(SERVICE_NAME, ACCOUNT);
		this._activeToken = undefined;
		this.setStatus(AuthTokenStatus.Inactive);
	}

	private setStatus(status: AuthTokenStatus): void {
		if (this._status !== status) {
			this._status = status;
			this._onDidChangeStatus.fire(status);
		}
	}

}


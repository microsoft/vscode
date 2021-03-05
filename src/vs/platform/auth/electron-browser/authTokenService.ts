/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from 'crypto';
import * as https from 'https';
import { Event, Emitter } from 'vs/base/common/event';
import { IAuthTokenService, AuthTokenStatus } from 'vs/platform/auth/common/auth';
import { ICredentialsService } from 'vs/platform/credentials/common/credentials';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { shell } from 'electron';
import { createServer, startServer } from 'vs/platform/auth/electron-browser/authServer';
import { IProductService } from 'vs/platform/product/common/productService';

const SERVICE_NAME = 'VS Code';
const ACCOUNT = 'MyAccount';

const activeDirectoryResourceId = 'https://management.core.windows.net/';

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

	private _status: AuthTokenStatus = AuthTokenStatus.Initializing;
	get status(): AuthTokenStatus { return this._status; }
	private _onDidChangeStatus: Emitter<AuthTokenStatus> = this._register(new Emitter<AuthTokenStatus>());
	readonly onDidChangeStatus: Event<AuthTokenStatus> = this._onDidChangeStatus.event;

	public readonly _onDidGetCallback: Emitter<URI> = this._register(new Emitter<URI>());
	readonly onDidGetCallback: Event<URI> = this._onDidGetCallback.event;

	private _activeToken: IToken | undefined;

	constructor(
		@ICredentialsService private readonly credentialsService: ICredentialsService,
		@IProductService private readonly productService: IProductService
	) {
		super();
		if (!this.productService.auth) {
			return;
		}

		this.credentialsService.getPassword(SERVICE_NAME, ACCOUNT).then(storedRefreshToken => {
			if (storedRefreshToken) {
				this.refresh(storedRefreshToken);
			} else {
				this.setStatus(AuthTokenStatus.SignedOut);
			}
		});
	}

	public async login(): Promise<void> {
		if (!this.productService.auth) {
			throw new Error('Authentication is not configured.');
		}

		this.setStatus(AuthTokenStatus.SigningIn);

		const nonce = generateUuid();
		const { server, redirectPromise, codePromise } = createServer(nonce);

		try {
			const port = await startServer(server);
			shell.openExternal(`http://localhost:${port}/signin?nonce=${encodeURIComponent(nonce)}`);

			const redirectReq = await redirectPromise;
			if ('err' in redirectReq) {
				const { err, res } = redirectReq;
				res.writeHead(302, { Location: `/?error=${encodeURIComponent(err && err.message || 'Unkown error')}` });
				res.end();
				throw err;
			}

			const host = redirectReq.req.headers.host || '';
			const updatedPortStr = (/^[^:]+:(\d+)$/.exec(Array.isArray(host) ? host[0] : host) || [])[1];
			const updatedPort = updatedPortStr ? parseInt(updatedPortStr, 10) : port;

			const state = `${updatedPort},${encodeURIComponent(nonce)}`;

			const codeVerifier = toBase64UrlEncoding(crypto.randomBytes(32).toString('base64'));
			const codeChallenge = toBase64UrlEncoding(crypto.createHash('sha256').update(codeVerifier).digest('base64'));

			let uri = URI.parse(this.productService.auth.loginUrl);
			uri = uri.with({
				query: `response_type=code&client_id=${encodeURIComponent(this.productService.auth.clientId)}&redirect_uri=${this.productService.auth.redirectUrl}&state=${encodeURIComponent(state)}&resource=${activeDirectoryResourceId}&prompt=select_account&code_challenge_method=S256&code_challenge=${codeChallenge}`
			});

			await redirectReq.res.writeHead(302, { Location: uri.toString(true) });
			redirectReq.res.end();

			const codeRes = await codePromise;
			const res = codeRes.res;

			try {
				if ('err' in codeRes) {
					throw codeRes.err;
				}
				const token = await this.exchangeCodeForToken(codeRes.code, codeVerifier);
				this.setToken(token);
				res.writeHead(302, { Location: '/' });
				res.end();
			} catch (err) {
				res.writeHead(302, { Location: `/?error=${encodeURIComponent(err && err.message || 'Unkown error')}` });
				res.end();
			}
		} finally {
			setTimeout(() => {
				server.close();
			}, 5000);
		}

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
		this.setStatus(AuthTokenStatus.SignedIn);
	}

	private exchangeCodeForToken(code: string, codeVerifier: string): Promise<IToken> {
		return new Promise((resolve: (value: IToken) => void, reject) => {
			try {
				if (!this.productService.auth) {
					throw new Error('Authentication is not configured.');
				}

				const postData = toQuery({
					grant_type: 'authorization_code',
					code: code,
					client_id: this.productService.auth?.clientId,
					code_verifier: codeVerifier,
					redirect_uri: this.productService.auth?.redirectUrl
				});

				const tokenUrl = URI.parse(this.productService.auth.tokenUrl);

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
	}

	private async refresh(refreshToken: string): Promise<void> {
		return new Promise((resolve, reject) => {
			if (!this.productService.auth) {
				throw new Error('Authentication is not configured.');
			}

			this.setStatus(AuthTokenStatus.RefreshingToken);
			const postData = toQuery({
				refresh_token: refreshToken,
				client_id: this.productService.auth?.clientId,
				grant_type: 'refresh_token',
				resource: activeDirectoryResourceId
			});

			const tokenUrl = URI.parse(this.productService.auth.tokenUrl);

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
						this.setToken({
							expiresIn: json.access_token,
							expiresOn: json.expires_on,
							accessToken: json.access_token,
							refreshToken: json.refresh_token
						});
						resolve();
					} else {
						reject(new Error('Refreshing token failed.'));
					}
				});
			});

			post.write(postData);

			post.end();
			post.on('error', err => {
				this.setStatus(AuthTokenStatus.SignedOut);
				reject(err);
			});
		});
	}

	async logout(): Promise<void> {
		await this.credentialsService.deletePassword(SERVICE_NAME, ACCOUNT);
		this._activeToken = undefined;
		this.setStatus(AuthTokenStatus.SignedOut);
	}

	private setStatus(status: AuthTokenStatus): void {
		if (this._status !== status) {
			this._status = status;
			this._onDidChangeStatus.fire(status);
		}
	}

}


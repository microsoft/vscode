/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as https from 'https';
import * as url from 'url';
import { SUPABASE_URL, WEB_BASE } from '../common/authConstants.js';
import { ILogService } from '../../log/common/log.js';

export interface ITokenResponse {
	readonly access_token: string;
	readonly refresh_token: string;
	readonly token_type: string;
	readonly expires_in: number;
	readonly expires_at?: number;
	readonly user: {
		readonly id: string;
		readonly email?: string;
		readonly user_metadata?: {
			readonly full_name?: string;
		};
	};
}

export class ExchangeError extends Error {
	constructor(public readonly statusCode: number, message: string) {
		super(message);
		this.name = 'ExchangeError';
	}
}

export class AuthExchangeService {
	constructor(
		private readonly anonKey: string,
		private readonly logService: ILogService
	) { }

	public async exchangeCode(code: string, codeVerifier: string): Promise<ITokenResponse> {
		this.logService.trace('AuthExchangeService#exchangeCode: Starting token exchange');

		return this.postRequest<ITokenResponse>(`${WEB_BASE}/api/desktop-auth/exchange`, {
			code,
			code_verifier: codeVerifier
		});
	}

	public async refreshAccessToken(refreshToken: string): Promise<ITokenResponse> {
		this.logService.trace('AuthExchangeService#refreshAccessToken: Refreshing token');

		return this.postRequest<ITokenResponse>(
			`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
			{ refresh_token: refreshToken },
			{ 'apikey': this.anonKey }
		);
	}

	public async signOutRemote(accessToken: string): Promise<void> {
		this.logService.trace('AuthExchangeService#signOutRemote: Signing out');

		try {
			await this.postRequest<any>(
				`${SUPABASE_URL}/auth/v1/logout?scope=local`,
				undefined,
				{
					'apikey': this.anonKey,
					'Authorization': `Bearer ${accessToken}`
				}
			);
		} catch (e) {
			this.logService.warn('AuthExchangeService#signOutRemote: Failed to sign out remotely', e instanceof Error ? e.message : 'Unknown error');
		}
	}

	private postRequest<T>(requestUrl: string, body?: any, additionalHeaders?: Record<string, string>): Promise<T> {
		return new Promise((resolve, reject) => {
			const parsedUrl = url.parse(requestUrl);
			const requestBody = body ? JSON.stringify(body) : '';

			const options: https.RequestOptions = {
				hostname: parsedUrl.hostname,
				port: parsedUrl.port || 443,
				path: parsedUrl.path,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Content-Length': Buffer.byteLength(requestBody),
					...additionalHeaders
				}
			};

			const req = https.request(options, (res) => {
				let data = '';

				res.on('data', (chunk) => {
					data += chunk;
				});

				res.on('end', () => {
					if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
						if (!data) {
							resolve({} as T);
							return;
						}
						try {
							resolve(JSON.parse(data) as T);
						} catch (e) {
							reject(new Error('Invalid JSON response'));
						}
					} else {
						// Don't log the full response body as it might contain sensitive info if it's a weird error page
						let errorMessage = `HTTP Error ${res.statusCode}`;
						try {
							const parsedError = JSON.parse(data);
							if (parsedError.error) {
								errorMessage = `${parsedError.error}: ${parsedError.error_description || ''}`;
							}
						} catch { }
						reject(new ExchangeError(res.statusCode || 500, errorMessage));
					}
				});
			});

			req.on('error', (e) => {
				reject(e);
			});

			req.write(requestBody);
			req.end();
		});
	}
}

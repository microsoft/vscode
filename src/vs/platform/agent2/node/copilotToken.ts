/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Copilot token exchange service.
 *
 * Exchanges a GitHub OAuth token for a Copilot JWT that can be used to
 * authenticate requests to the GitHub Copilot API (CAPI). The JWT is cached
 * and auto-refreshed when it expires.
 */

import { CancellationToken } from '../../../base/common/cancellation.js';
import { ILogService } from '../../log/common/log.js';

// -- Token types --------------------------------------------------------------

export interface ICopilotToken {
	/** The Copilot JWT used as Bearer token for API requests. */
	readonly token: string;
	/** Unix timestamp (seconds) when the token expires. */
	readonly expiresAt: number;
	/** The CAPI base URL to use for API requests. */
	readonly apiBaseUrl: string;
}

interface ITokenEnvelope {
	readonly token: string;
	readonly expires_at: number;
	readonly refresh_in: number;
	readonly endpoints?: {
		readonly api?: string;
	};
}

// -- Service ------------------------------------------------------------------

const DEFAULT_CAPI_BASE_URL = 'https://api.githubcopilot.com';
const TOKEN_REFRESH_MARGIN_SECONDS = 60;
const GITHUB_API_VERSION = '2025-04-01';

/**
 * Service that manages the Copilot JWT lifecycle:
 * - Exchanges a GitHub OAuth token for a Copilot JWT
 * - Caches the JWT and auto-refreshes before expiry
 */
export class CopilotTokenService {
	private _githubToken: string | undefined;
	private _cachedToken: ICopilotToken | undefined;
	private _refreshPromise: Promise<ICopilotToken> | undefined;

	constructor(
		private readonly _logService: ILogService,
		private readonly _fetch: typeof globalThis.fetch = globalThis.fetch.bind(globalThis),
	) { }

	setGitHubToken(token: string): void {
		if (this._githubToken !== token) {
			this._githubToken = token;
			this._cachedToken = undefined;
			this._refreshPromise = undefined;
			this._logService.info('[CopilotToken] GitHub token updated');
		}
	}

	/**
	 * Returns a valid Copilot JWT, exchanging or refreshing as needed.
	 * Throws if no GitHub token has been set.
	 */
	async getToken(cancellationToken: CancellationToken): Promise<ICopilotToken> {
		if (!this._githubToken) {
			throw new Error('No GitHub token set. Call setGitHubToken() first.');
		}

		// Check if cached token is still valid
		if (this._cachedToken && !this._isExpired(this._cachedToken)) {
			return this._cachedToken;
		}

		// Avoid concurrent refresh requests
		if (this._refreshPromise) {
			return this._refreshPromise;
		}

		this._refreshPromise = this._exchange(this._githubToken, cancellationToken);
		try {
			const token = await this._refreshPromise;
			this._cachedToken = token;
			return token;
		} finally {
			this._refreshPromise = undefined;
		}
	}

	/** Returns the CAPI base URL from the last token exchange, or the default. */
	getApiBaseUrl(): string {
		return this._cachedToken?.apiBaseUrl ?? DEFAULT_CAPI_BASE_URL;
	}

	private _isExpired(token: ICopilotToken): boolean {
		const nowSeconds = Date.now() / 1000;
		return nowSeconds >= (token.expiresAt - TOKEN_REFRESH_MARGIN_SECONDS);
	}

	private async _exchange(githubToken: string, cancellationToken: CancellationToken): Promise<ICopilotToken> {
		this._logService.info('[CopilotToken] Exchanging GitHub token for Copilot JWT...');

		const abortController = new AbortController();
		const disposable = cancellationToken.onCancellationRequested(() => abortController.abort());

		try {
			const response = await this._fetch(
				`${DEFAULT_CAPI_BASE_URL}/copilot_internal/v2/token`,
				{
					method: 'GET',
					headers: {
						'Authorization': `token ${githubToken}`,
						'X-GitHub-Api-Version': GITHUB_API_VERSION,
					},
					signal: abortController.signal,
				},
			);

			if (!response.ok) {
				const body = await response.text().catch(() => '');
				throw new Error(`Copilot token exchange failed: ${response.status} ${response.statusText}${body ? ` - ${body}` : ''}`);
			}

			const envelope: ITokenEnvelope = await response.json() as ITokenEnvelope;

			const token: ICopilotToken = {
				token: envelope.token,
				expiresAt: envelope.expires_at,
				apiBaseUrl: envelope.endpoints?.api ?? DEFAULT_CAPI_BASE_URL,
			};

			this._logService.info(`[CopilotToken] Token acquired, expires at ${new Date(token.expiresAt * 1000).toISOString()}, API base: ${token.apiBaseUrl}`);
			return token;
		} finally {
			disposable.dispose();
		}
	}
}

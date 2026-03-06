/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Copilot API client service.
 *
 * Wraps the CAPIClient from `@vscode/copilot-api` to provide:
 * - GitHub OAuth token -> Copilot JWT exchange
 * - URL routing for all API endpoints (models, messages, completions, etc.)
 * - Standard header injection (session ID, machine ID, integration ID)
 * - Domain updates from Copilot token endpoints
 *
 * This follows the same pattern used by the copilot-chat extension's
 * ICAPIClientService but adapted for the agent host process.
 *
 * Note: We use `require()` to load @vscode/copilot-api because its .d.ts
 * files use extensionless relative imports which are incompatible with
 * TypeScript's `nodenext` module resolution. The types are defined locally.
 */

import { CancellationToken } from '../../../base/common/cancellation.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { ILogService } from '../../log/common/log.js';

// -- Types mirroring @vscode/copilot-api -------------------------------------

/** Mirrors @vscode/copilot-api FetchOptions */
interface ICAPIFetchOptions {
	headers?: Record<string, string>;
	body?: BodyInit;
	timeout?: number;
	json?: unknown;
	method?: 'GET' | 'POST' | 'PUT';
	signal?: AbortSignal;
}

/** Mirrors @vscode/copilot-api IFetcherService */
interface ICAPIFetcherService {
	fetch(url: string, options: ICAPIFetchOptions): Promise<unknown>;
}

/** Mirrors @vscode/copilot-api IExtensionInformation */
interface ICAPIExtensionInformation {
	name: string;
	sessionId: string;
	machineId: string;
	vscodeVersion: string;
	version: string;
	buildType: 'dev' | 'prod';
}

/** Mirrors @vscode/copilot-api CopilotToken (for updateDomains) */
interface ICAPICopilotToken {
	endpoints: {
		api?: string;
		telemetry?: string;
		proxy?: string;
	};
	sku: string;
}

/**
 * Type for request metadata. We only use a subset of request types.
 */
interface ICAPIRequestMetadata {
	type: string;
	isModelLab?: boolean;
}

/** Mirrors the CAPIClient class interface */
interface ICAPIClient {
	updateDomains(copilotToken: ICAPICopilotToken | undefined, enterpriseUrl: string | undefined): unknown;
	makeRequest<T>(request: ICAPIFetchOptions, requestMetadata: ICAPIRequestMetadata): Promise<T>;
}

/** Well-known request type constants (matching @vscode/copilot-api RequestType) */
export const CAPIRequestType = {
	CopilotToken: 'CopilotToken',
	ChatMessages: 'ChatMessages',
	ChatCompletions: 'ChatCompletions',
	ChatResponses: 'ChatResponses',
	Models: 'Models',
} as const;

// -- Token types --------------------------------------------------------------

export interface ICopilotToken {
	/** The Copilot JWT used as Bearer token for API requests. */
	readonly token: string;
	/** Unix timestamp (seconds) when the token expires. */
	readonly expiresAt: number;
}

interface ITokenEnvelope {
	readonly token: string;
	readonly expires_at: number;
	readonly refresh_in: number;
	readonly endpoints?: {
		readonly api?: string;
		readonly telemetry?: string;
		readonly proxy?: string;
	};
	readonly sku?: string;
}

// -- Lazy loader for CAPIClient -----------------------------------------------

let _CAPIClientCtor: (new (
	extInfo: ICAPIExtensionInformation,
	license: string | undefined,
	fetcherService?: ICAPIFetcherService,
	hmacSecret?: string,
	integrationId?: string,
) => ICAPIClient) | undefined;

let _loadingPromise: Promise<void> | undefined;

async function ensureCAPIClientCtor(): Promise<typeof _CAPIClientCtor> {
	if (_CAPIClientCtor) {
		return _CAPIClientCtor;
	}
	if (!_loadingPromise) {
		_loadingPromise = (async () => {
			const mod = await import('@vscode/copilot-api');
			_CAPIClientCtor = (mod as { CAPIClient: typeof _CAPIClientCtor }).CAPIClient;
		})();
	}
	await _loadingPromise;
	return _CAPIClientCtor;
}

// -- Service ------------------------------------------------------------------

const TOKEN_REFRESH_MARGIN_SECONDS = 60;
const GITHUB_API_VERSION = '2025-04-01';

/**
 * Service that manages the Copilot API client and JWT lifecycle:
 * - Wraps CAPIClient for URL routing and header management
 * - Exchanges GitHub OAuth tokens for Copilot JWTs
 * - Caches JWTs and auto-refreshes before expiry
 * - Provides makeRequest() for routing API calls
 */
export class CopilotTokenService {
	private _githubToken: string | undefined;
	private _cachedToken: ICopilotToken | undefined;
	private _refreshPromise: Promise<ICopilotToken> | undefined;
	private _capiClient: ICAPIClient | undefined;
	private _capiClientPromise: Promise<ICAPIClient> | undefined;
	private readonly _fetcherService: ICAPIFetcherService | undefined;

	constructor(
		private readonly _logService: ILogService,
		fetcherService?: ICAPIFetcherService,
	) {
		this._fetcherService = fetcherService;
	}

	private async _ensureCAPIClient(): Promise<ICAPIClient> {
		if (this._capiClient) {
			return this._capiClient;
		}
		if (this._capiClientPromise) {
			return this._capiClientPromise;
		}
		this._capiClientPromise = (async () => {
			const ClientCtor = await ensureCAPIClientCtor();
			if (!ClientCtor) {
				throw new Error('@vscode/copilot-api CAPIClient not available');
			}
			this._capiClient = new ClientCtor(
				{
					name: 'vscode.agent-host',
					sessionId: generateUuid(),
					machineId: generateUuid(),
					vscodeVersion: '1.111.0', // TODO: get from product service
					version: '1.0.0',
					buildType: 'dev',
				},
				undefined, // license (undefined for dev builds)
				this._fetcherService,
			);
			return this._capiClient;
		})();
		return this._capiClientPromise;
	}

	/**
	 * Makes a request through CAPIClient with proper URL routing and headers.
	 * Use this instead of raw fetch for all Copilot API calls.
	 */
	async makeRequest<T>(options: ICAPIFetchOptions, requestType: ICAPIRequestMetadata): Promise<T> {
		const client = await this._ensureCAPIClient();
		return client.makeRequest<T>(options, requestType);
	}

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
	 * Throws if no GitHub token has been set via the renderer's auth flow.
	 */
	async getToken(cancellationToken: CancellationToken): Promise<ICopilotToken> {
		if (!this._githubToken) {
			throw new Error('No GitHub token available. Sign in to GitHub in VS Code to use the native agent.');
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

	private _isExpired(token: ICopilotToken): boolean {
		const nowSeconds = Date.now() / 1000;
		return nowSeconds >= (token.expiresAt - TOKEN_REFRESH_MARGIN_SECONDS);
	}

	private async _exchange(githubToken: string, _cancellationToken: CancellationToken): Promise<ICopilotToken> {
		this._logService.info('[CopilotToken] Exchanging GitHub token for Copilot JWT...');

		const client = await this._ensureCAPIClient();

		const options: ICAPIFetchOptions = {
			headers: {
				'Authorization': `token ${githubToken}`,
				'X-GitHub-Api-Version': GITHUB_API_VERSION,
			},
			method: 'GET',
		};

		const response = await client.makeRequest<ITokenEnvelope>(
			options,
			{ type: CAPIRequestType.CopilotToken },
		);

		// Update CAPIClient domains from the token's endpoint configuration
		if (response.endpoints || response.sku) {
			const copilotToken: ICAPICopilotToken = {
				endpoints: {
					api: response.endpoints?.api,
					telemetry: response.endpoints?.telemetry,
					proxy: response.endpoints?.proxy,
				},
				sku: response.sku ?? '',
			};
			client.updateDomains(copilotToken, undefined);
		}

		const token: ICopilotToken = {
			token: response.token,
			expiresAt: response.expires_at,
		};

		this._logService.info(`[CopilotToken] Token acquired, expires at ${new Date(token.expiresAt * 1000).toISOString()}`);
		return token;
	}
}

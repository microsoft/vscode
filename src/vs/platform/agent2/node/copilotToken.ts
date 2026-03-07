/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Copilot API service.
 *
 * A unified service for making authenticated requests to the GitHub Copilot
 * API (CAPI). This is the single place where auth tokens are managed and
 * authorization headers are set. Individual model providers should NOT handle
 * tokens or auth headers -- they call this service's methods which handle
 * all of that transparently.
 *
 * Wraps the CAPIClient from `@vscode/copilot-api` to provide:
 * - GitHub OAuth token -> Copilot JWT exchange (automatic, transparent)
 * - Authenticated requests with proper Authorization headers
 * - URL routing for all API endpoints (models, messages, completions, etc.)
 * - Standard header injection (session ID, machine ID, integration ID)
 * - Domain updates from Copilot token endpoints
 *
 * Note: We use dynamic import() to load @vscode/copilot-api because its
 * .d.ts files use extensionless relative imports which are incompatible
 * with TypeScript's `nodenext` module resolution. The types are defined
 * locally.
 */

import { CancellationToken } from '../../../base/common/cancellation.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { ILogService } from '../../log/common/log.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

// -- Types mirroring @vscode/copilot-api -------------------------------------

/** Mirrors @vscode/copilot-api FetchOptions */
export interface ICAPIFetchOptions {
	headers?: Record<string, string>;
	body?: BodyInit;
	timeout?: number;
	json?: unknown;
	method?: 'GET' | 'POST' | 'PUT';
	signal?: AbortSignal;
}

/** Mirrors @vscode/copilot-api IFetcherService */
export interface ICAPIFetcherService {
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

/** Type for request metadata. */
export interface ICAPIRequestMetadata {
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

// -- CAPI model list response types -------------------------------------------

export interface ICAPIModelCapabilities {
	readonly type: string;
	readonly family: string;
	readonly supports: {
		readonly vision?: boolean;
		readonly thinking?: boolean;
		readonly adaptive_thinking?: boolean;
		readonly streaming?: boolean;
		readonly tool_calls?: boolean;
	};
	readonly limits?: {
		readonly max_prompt_tokens?: number;
		readonly max_output_tokens?: number;
		readonly max_context_window_tokens?: number;
	};
}

export interface ICAPIModelInfo {
	readonly id: string;
	readonly name: string;
	readonly vendor: string;
	readonly version: string;
	readonly model_picker_enabled: boolean;
	readonly capabilities: ICAPIModelCapabilities;
	readonly policy?: { readonly state: 'enabled' | 'disabled' | 'unconfigured' };
	readonly billing?: { readonly is_premium: boolean; readonly multiplier: number };
	readonly supported_endpoints?: readonly string[];
}

export interface ICAPIModelsResponse {
	readonly data: readonly ICAPIModelInfo[];
}

// -- Token types --------------------------------------------------------------

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
 * Process-level identity information for the CAPI client.
 *
 * Note: sessionId is intentionally absent. The agent host is a singleton
 * process serving multiple VS Code windows, so per-window session IDs
 * must flow through the IPC protocol per-request rather than being baked
 * into the CAPI client at startup.
 */
export interface ICopilotApiIdentity {
	/** Stable machine identifier (should persist across sessions). */
	readonly machineId: string;
	/** VS Code version string (e.g., '1.111.0'). */
	readonly vscodeVersion: string;
	/** Build type: 'dev' for OSS/dev builds, 'prod' for stable/insiders. */
	readonly buildType: 'dev' | 'prod';
}

// -- Service interface --------------------------------------------------------

export const ICopilotApiService = createDecorator<ICopilotApiService>('copilotApiService');

export interface ICopilotApiService {
	readonly _serviceBrand: undefined;

	sendModelRequest(
		body: unknown,
		requestType: ICAPIRequestMetadata,
		extraHeaders?: Record<string, string>,
		cancellationToken?: CancellationToken,
	): Promise<Response>;

	sendRequest<T>(
		requestType: ICAPIRequestMetadata,
		extraHeaders?: Record<string, string>,
		cancellationToken?: CancellationToken,
	): Promise<T>;

	setGitHubToken(token: string): void;
	setIdentity(identity: ICopilotApiIdentity): void;
	setCopilotToken(
		copilotJwt: string,
		endpoints?: { api?: string; telemetry?: string; proxy?: string },
		sku?: string,
	): Promise<void>;
}

// -- Service ------------------------------------------------------------------

/**
 * Unified service for making authenticated requests to the Copilot API.
 *
 * Model providers should use {@link sendModelRequest} to make model calls --
 * auth is handled transparently. The service manages the full token lifecycle
 * (exchange, caching, refresh) and delegates URL routing to CAPIClient.
 */
export class CopilotApiService implements ICopilotApiService {
	declare readonly _serviceBrand: undefined;
	private _githubToken: string | undefined;
	private _cachedToken: { token: string; expiresAt: number } | undefined;
	private _refreshPromise: Promise<{ token: string; expiresAt: number }> | undefined;
	private _capiClient: ICAPIClient | undefined;
	private _capiClientPromise: Promise<ICAPIClient> | undefined;
	private readonly _fetcherService: ICAPIFetcherService | undefined;
	private _identity: ICopilotApiIdentity;

	constructor(
		private readonly _logService: ILogService,
		identity?: ICopilotApiIdentity,
		fetcherService?: ICAPIFetcherService,
	) {
		this._fetcherService = fetcherService;
		this._identity = identity ?? {
			machineId: generateUuid(),
			vscodeVersion: '1.111.0',
			buildType: 'dev',
		};
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
					sessionId: generateUuid(), // Process-level placeholder; per-window sessionId TODO
					machineId: this._identity.machineId,
					vscodeVersion: this._identity.vscodeVersion,
					version: '1.0.0',
					buildType: this._identity.buildType,
				},
				undefined, // license (undefined for dev builds)
				this._fetcherService,
			);
			return this._capiClient;
		})();
		return this._capiClientPromise;
	}

	// ---- Public API --------------------------------------------------------

	/**
	 * Makes an authenticated request to a CAPI model endpoint.
	 * Automatically handles token exchange, Authorization header, and
	 * URL routing via CAPIClient. Callers should NOT set the
	 * Authorization header -- this method does it.
	 *
	 * @param body - The JSON request body (will be stringified).
	 * @param requestType - The CAPI request type for URL routing.
	 * @param extraHeaders - Additional headers (e.g., anthropic-beta).
	 * @param cancellationToken - VS Code cancellation token for cancellation.
	 * @returns The raw Response from the API.
	 */
	async sendModelRequest(
		body: unknown,
		requestType: ICAPIRequestMetadata,
		extraHeaders?: Record<string, string>,
		cancellationToken?: CancellationToken,
	): Promise<Response> {
		const token = await this._getToken(cancellationToken ?? CancellationToken.None);
		const client = await this._ensureCAPIClient();

		const abortController = new AbortController();
		const disposable = cancellationToken?.onCancellationRequested(() => abortController.abort());

		try {
			const options: ICAPIFetchOptions = {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${token.token}`,
					'Content-Type': 'application/json',
					'X-Request-Id': generateUuid(),
					'OpenAI-Intent': 'conversation-agent',
					...extraHeaders,
				},
				body: JSON.stringify(body),
				signal: abortController.signal,
			};

			return await client.makeRequest<Response>(options, requestType);
		} finally {
			disposable?.dispose();
		}
	}

	/**
	 * Makes an authenticated non-streaming request and returns parsed JSON.
	 */
	async sendRequest<T>(
		requestType: ICAPIRequestMetadata,
		extraHeaders?: Record<string, string>,
		cancellationToken?: CancellationToken,
	): Promise<T> {
		const token = await this._getToken(cancellationToken ?? CancellationToken.None);
		const client = await this._ensureCAPIClient();

		const options: ICAPIFetchOptions = {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${token.token}`,
				...extraHeaders,
			},
		};

		const rawResponse = await client.makeRequest<Response>(options, requestType);
		if (!rawResponse.ok) {
			const body = await rawResponse.text().catch(() => '');
			throw new Error(`CAPI ${requestType.type} request failed: ${rawResponse.status} ${rawResponse.statusText} - ${body}`);
		}
		return rawResponse.json() as Promise<T>;
	}

	setGitHubToken(token: string): void {
		if (this._githubToken !== token) {
			this._githubToken = token;
			this._cachedToken = undefined;
			this._refreshPromise = undefined;
			this._logService.info('[CopilotApi] GitHub token updated');
		}
	}

	/**
	 * Updates the process-level identity. If the CAPI client has already been
	 * created, it will be discarded so the next request creates a new one with
	 * the updated identity. Called from {@link LocalAgent.initialize} when the
	 * renderer sends init data over IPC.
	 */
	setIdentity(identity: ICopilotApiIdentity): void {
		this._identity = identity;
		// Force re-creation of the CAPI client with the new identity
		this._capiClient = undefined;
		this._capiClientPromise = undefined;
		this._logService.info('[CopilotApi] Identity updated');
	}

	/**
	 * Sets a pre-minted Copilot JWT directly, bypassing the GitHub token
	 * exchange. Used when `VSCODE_COPILOT_CHAT_TOKEN` provides a base64-
	 * encoded token envelope for test/automation scenarios.
	 *
	 * @param copilotJwt - The Copilot JWT to use for API requests.
	 * @param endpoints - Optional endpoint overrides from the token envelope.
	 * @param sku - Optional SKU from the token envelope.
	 */
	async setCopilotToken(
		copilotJwt: string,
		endpoints?: { api?: string; telemetry?: string; proxy?: string },
		sku?: string,
	): Promise<void> {
		this._cachedToken = {
			token: copilotJwt,
			expiresAt: (Date.now() / 1000) + 3600,
		};
		// Mark that we have a github token so _getToken doesn't throw
		this._githubToken = 'pre-minted';

		// Update CAPI domains if endpoint info was provided
		if (endpoints || sku) {
			const client = await this._ensureCAPIClient();
			client.updateDomains({
				endpoints: {
					api: endpoints?.api,
					telemetry: endpoints?.telemetry,
					proxy: endpoints?.proxy,
				},
				sku: sku ?? '',
			}, undefined);
		}

		this._logService.info('[CopilotApi] Pre-minted Copilot token set');
	}

	// ---- Token management (private) ----------------------------------------

	private async _getToken(cancellationToken: CancellationToken): Promise<{ token: string; expiresAt: number }> {
		if (!this._githubToken) {
			throw new Error('No GitHub token available. Sign in to GitHub in VS Code to use the local agent.');
		}

		if (this._cachedToken && !this._isExpired(this._cachedToken)) {
			return this._cachedToken;
		}

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

	private _isExpired(token: { expiresAt: number }): boolean {
		const nowSeconds = Date.now() / 1000;
		return nowSeconds >= (token.expiresAt - TOKEN_REFRESH_MARGIN_SECONDS);
	}

	private async _exchange(githubToken: string, _cancellationToken: CancellationToken): Promise<{ token: string; expiresAt: number }> {
		this._logService.info('[CopilotApi] Exchanging GitHub token for Copilot JWT...');

		const client = await this._ensureCAPIClient();

		const options: ICAPIFetchOptions = {
			headers: {
				'Authorization': `token ${githubToken}`,
				'X-GitHub-Api-Version': GITHUB_API_VERSION,
			},
			method: 'GET',
		};

		const rawResponse = await client.makeRequest<Response>(
			options,
			{ type: CAPIRequestType.CopilotToken },
		);

		if (!rawResponse.ok) {
			const errorBody = await rawResponse.text().catch(() => '');
			throw new Error(`Copilot token exchange failed: ${rawResponse.status} ${rawResponse.statusText}${errorBody ? ` - ${errorBody}` : ''}`);
		}

		const response = await rawResponse.json() as ITokenEnvelope;

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

		// Use refresh_in relative to local clock rather than the server's
		// expires_at. Some clients have clocks that run ahead, which would
		// make a freshly minted token look immediately expired if we trust
		// the server timestamp. Adding a buffer ensures the token stays
		// valid long enough for the refresh cycle to fire.
		const nowSeconds = Date.now() / 1000;
		const expiresAt = nowSeconds + response.refresh_in + 60;

		const token = {
			token: response.token,
			expiresAt,
		};

		this._logService.info(`[CopilotApi] Token acquired, expires in ~${Math.round(response.refresh_in / 60)}m (refresh_in=${response.refresh_in}s)`);
		return token;
	}
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RequestType } from '@vscode/copilot-api';
import { Emitter } from '../../../util/vs/base/common/event';
import { Disposable, toDisposable } from '../../../util/vs/base/common/lifecycle';
import { SyncDescriptor } from '../../../util/vs/platform/instantiation/common/descriptors';
import { IConfigurationService } from '../../configuration/common/configurationService';
import { ICAPIClientService } from '../../endpoint/common/capiClient';
import { IDomainService } from '../../endpoint/common/domainService';
import { IEnvService, isScenarioAutomation } from '../../env/common/envService';
import { BaseOctoKitService } from '../../github/common/githubService';
import { NullBaseOctoKitService } from '../../github/common/nullOctokitServiceImpl';
import { ILogService } from '../../log/common/logService';
import { FetchOptions, IFetcherService, Response, jsonVerboseError } from '../../networking/common/fetcherService';
import { ITelemetryService } from '../../telemetry/common/telemetry';
import { TelemetryData } from '../../telemetry/common/telemetryData';
import { CopilotToken, CopilotUserInfo, ErrorEnvelope, ExtendedTokenInfo, StandardErrorEnvelope, TokenEnvelope, TokenInfoOrError, TokenValidationResult, containsVSCodeOrg, createTestExtendedTokenInfo, isErrorEnvelope, isStandardErrorEnvelope, validateTokenEnvelope } from '../common/copilotToken';
import { CheckCopilotToken, ICopilotTokenManager, NotGitHubLoginFailed, nowSeconds } from '../common/copilotTokenManager';

/**
 * Result of fetching a Copilot token from the server.
 * Includes HTTP status info and the validated response body.
 */
type FetchTokenResult = {
	ok: boolean;
	status: number;
	statusText: string;
} & (
		// success
		| { body: TokenEnvelope; kind: 'token' }
		// Copilot-specific error
		| { body: ErrorEnvelope; kind: 'error-envelope' }
		// Standard error - e.g., rate limiting
		| { body: StandardErrorEnvelope; kind: 'error' }
		// Parse failures (either from failed Fetches or invalid JSON)
		| { body: undefined; kind: 'parse-failed'; parseError: string }
	);

export const tokenErrorString = `Tests: either GITHUB_PAT, GITHUB_OAUTH_TOKEN, or GITHUB_OAUTH_TOKEN+VSCODE_COPILOT_CHAT_TOKEN must be set unless running from an IS_SCENARIO_AUTOMATION environment. Run "npm run get_token" to get credentials.`;

export function createStaticGitHubTokenProvider(): (() => string) | undefined {
	const pat = process.env.GITHUB_PAT;
	const oauthToken = process.env.GITHUB_OAUTH_TOKEN;

	// In automation scenarios, NoAuth/BYOK-only scenarios are expected to not have any tokens set.
	if (isScenarioAutomation && !pat && !oauthToken) {
		return undefined;
	}

	return () => {
		if (pat) {
			return pat;
		}

		if (oauthToken) {
			return oauthToken;
		}

		throw new Error(tokenErrorString);
	};
}

export function getOrCreateTestingCopilotTokenManager(deviceId: string): SyncDescriptor<ICopilotTokenManager & CheckCopilotToken> {
	if (process.env.VSCODE_COPILOT_CHAT_TOKEN) {
		return new SyncDescriptor(StaticExtendedTokenInfoCopilotTokenManager, [process.env.VSCODE_COPILOT_CHAT_TOKEN]);
	}

	if (process.env.GITHUB_OAUTH_TOKEN) {
		return new SyncDescriptor(CopilotTokenManagerFromGitHubToken, [process.env.GITHUB_OAUTH_TOKEN, 'unknown']);
	}

	if (process.env.GITHUB_PAT) {
		return new SyncDescriptor(FixedCopilotTokenManager, [process.env.GITHUB_PAT]);
	}

	// In automation scenarios, NoAuth/BYOK-only scenarios are expected to not have any tokens set.
	if (isScenarioAutomation) {
		return new SyncDescriptor(CopilotTokenManagerFromDeviceId, [deviceId]);
	}

	throw new Error(tokenErrorString);
}

//TODO: Move this to common
export abstract class BaseCopilotTokenManager extends Disposable implements ICopilotTokenManager {
	declare readonly _serviceBrand: undefined;

	protected _isDisposed = false;

	//#region Events
	private readonly _copilotTokenRefreshEmitter = this._register(new Emitter<void>());
	readonly onDidCopilotTokenRefresh = this._copilotTokenRefreshEmitter.event;

	//#endregion
	constructor(
		protected readonly _baseOctokitservice: BaseOctoKitService,
		protected readonly _logService: ILogService,
		protected readonly _telemetryService: ITelemetryService,
		protected readonly _domainService: IDomainService,
		protected readonly _capiClientService: ICAPIClientService,
		protected readonly _fetcherService: IFetcherService,
		protected readonly _envService: IEnvService
	) {
		super();
		this._register(toDisposable(() => this._isDisposed = true));
	}

	//#region Property getters and setters
	private _copilotToken: ExtendedTokenInfo | undefined;
	get copilotToken(): ExtendedTokenInfo | undefined {
		return this._copilotToken;
	}
	set copilotToken(token: ExtendedTokenInfo | undefined) {
		if (token !== this._copilotToken) {
			this._copilotToken = token;
			this._copilotTokenRefreshEmitter.fire();
		}
	}

	//#endregion
	//#region Abstract methods
	abstract getCopilotToken(force?: boolean): Promise<CopilotToken>;

	//#endregion
	//#region Public methods
	resetCopilotToken(httpError?: number): void {
		if (httpError !== undefined) {
			this._telemetryService.sendGHTelemetryEvent('auth.reset_token_' + httpError);
		}
		this._logService.debug(`Resetting copilot token on HTTP error ${httpError || 'unknown'}`);
		this.copilotToken = undefined;
	}

	/**
	 * Fetches a Copilot token from the GitHub token.
	 * @param githubToken A GitHub token to mint a Copilot token from.
	 * @returns A Copilot token info or an error.
	 * @todo this should be not be public, but it is for now to allow testing.
	 */
	async authFromGitHubToken(githubToken: string, ghUsername: string): Promise<TokenInfoOrError & NotGitHubLoginFailed> {
		return this.doAuthFromGitHubTokenOrDevDeviceId({ githubToken, ghUsername });
	}

	/**
	 * Fetches a Copilot token from the devDeviceId.
	 * @param devDeviceId A device ID to mint a Copilot token from.
	 * @returns A Copilot token info or an error.
	 * @todo this should be not be public, but it is for now to allow testing.
	 */
	async authFromDevDeviceId(devDeviceId: string): Promise<TokenInfoOrError & NotGitHubLoginFailed> {
		return this.doAuthFromGitHubTokenOrDevDeviceId({ devDeviceId });
	}

	private async doAuthFromGitHubTokenOrDevDeviceId(
		context: { githubToken: string; ghUsername: string } | { devDeviceId: string }
	): Promise<TokenInfoOrError & NotGitHubLoginFailed> {
		this._telemetryService.sendGHTelemetryEvent('auth.new_login');

		let result: FetchTokenResult;
		let userInfo: CopilotUserInfo | undefined;
		let ghUsername: string | undefined;
		try {
			if ('githubToken' in context) {
				ghUsername = context.ghUsername;
				[result, userInfo] = (await Promise.all([
					this.fetchCopilotTokenFromGitHubToken(context.githubToken),
					this.fetchCopilotUserInfo(context.githubToken)
				]));
			} else {
				result = await this.fetchCopilotTokenFromDevDeviceId(context.devDeviceId);
			}
		} catch (e) {
			this._logService.warn('Failed to get copilot token due to fetch throwing: ' + (e.message || String(e)));
			return { kind: 'failure', reason: 'RequestFailed', message: e.message || String(e) };
		}

		// Handle HTTP errors
		if (!result.ok) {
			this._logService.warn(`Failed to get copilot token due to status ${result.status} ${result.statusText}`);
			const data = TelemetryData.createAndMarkAsIssued({
				status: result.status.toString(),
				status_text: result.statusText,
			});
			this._telemetryService.sendGHTelemetryErrorEvent('auth.invalid_token', data.properties, data.measurements);
			// TODO: Look at telemetry to see if this even happens
			// because looking at the backend code, 401s aren't expected here
			if (result.status === 401) {
				this._logService.warn('Failed to get copilot token due to 401 status');
				this._telemetryService.sendGHTelemetryErrorEvent('auth.unknown_401');
				return { kind: 'failure', reason: 'HTTP401' };
			}
		}

		// Copilot Errors
		if (result.kind === 'error-envelope') {
			this._logService.warn(`Failed to get copilot token due to: ${result.body.error_details.message}`);
			this._telemetryService.sendGHTelemetryErrorEvent('auth.request_read_failed');
			return { kind: 'failure', reason: 'NotAuthorized', ...result.body.error_details };
		}

		// Standard Errors like rate limiting
		if (result.kind === 'error') {
			if (result.body.message?.startsWith('API rate limit exceeded')) {
				this._logService.warn('Failed to get copilot token due to exceeding API rate limit');
				this._telemetryService.sendGHTelemetryErrorEvent('auth.rate_limited');
				return { kind: 'failure', reason: 'RateLimited' };
			}
			this._logService.warn(`Failed to get copilot token due to: ${result.body.message}`);
			return { kind: 'failure', reason: 'NotAuthorized' };
		}

		// Parse errors
		if (result.kind === 'parse-failed') {
			this._logService.warn(`Failed to get copilot token due to: ${result.parseError}`);
			this._telemetryService.sendGHTelemetryErrorEvent('auth.request_read_failed');
			return { kind: 'failure', reason: 'ParseFailed', message: result.parseError };
		}

		// Success - we have a validated TokenEnvelope
		const tokenInfo = result.body;

		const expires_at = tokenInfo.expires_at;
		// some users have clocks adjusted ahead, expires_at will immediately be less than current clock time;
		// adjust expires_at to the refresh time + a buffer to avoid expiring the token before the refresh can fire.
		tokenInfo.expires_at = nowSeconds() + tokenInfo.refresh_in + 60; // extra buffer to allow refresh to happen successfully

		// extend the token envelope
		const login = ghUsername ?? 'unknown';
		const extendedInfo: ExtendedTokenInfo = {
			...tokenInfo,
			copilot_plan: userInfo?.copilot_plan ?? tokenInfo.sku ?? '',
			quota_snapshots: userInfo?.quota_snapshots,
			quota_reset_date: userInfo?.quota_reset_date,
			codex_agent_enabled: userInfo?.codex_agent_enabled,
			organization_login_list: userInfo?.organization_login_list ?? [],
			username: login,
			isVscodeTeamMember: containsVSCodeOrg(tokenInfo.organization_list ?? []),
		};
		const telemetryData = TelemetryData.createAndMarkAsIssued(
			{},
			{
				adjusted_expires_at: tokenInfo.expires_at,
				expires_at: expires_at, // track original expires_at
				current_time: nowSeconds(),
			}
		);

		this._telemetryService.sendGHTelemetryEvent('auth.new_token', telemetryData.properties, telemetryData.measurements);

		return { kind: 'success', ...extendedInfo };
	}

	//#endregion

	//#region Private methods
	private async fetchCopilotTokenFromGitHubToken(githubToken: string): Promise<FetchTokenResult> {
		const options: FetchOptions = {
			callSite: 'copilot-token-github',
			headers: {
				Authorization: `token ${githubToken}`,
				'X-GitHub-Api-Version': '2025-04-01'
			},
			retryFallbacks: true,
			expectJSON: true,
		};
		const response = await this._capiClientService.makeRequest<Response>(options, { type: RequestType.CopilotToken });
		return this.parseTokenResponse(response);
	}

	private async fetchCopilotTokenFromDevDeviceId(devDeviceId: string): Promise<FetchTokenResult> {
		const options: FetchOptions = {
			callSite: 'copilot-token-device',
			headers: {
				'X-GitHub-Api-Version': '2025-04-01',
				'Editor-Device-Id': `${devDeviceId}`
			},
			retryFallbacks: true,
			expectJSON: true,
		};
		const response = await this._capiClientService.makeRequest<Response>(options, { type: RequestType.CopilotNLToken });
		return this.parseTokenResponse(response);
	}

	/**
	 * Parses and validates a token endpoint response.
	 * Returns a structured result with HTTP status and validated body.
	 */
	private async parseTokenResponse(response: Response): Promise<FetchTokenResult> {
		const httpInfo = { ok: response.ok, status: response.status, statusText: response.statusText };

		let parsed: unknown;
		try {
			parsed = await jsonVerboseError(response);
		} catch (err) {
			return { ...httpInfo, body: undefined, kind: 'parse-failed', parseError: err.message || String(err) };
		}

		const validationResult = validateTokenEnvelope(parsed);
		if (validationResult.valid) {
			this.sendTokenValidationTelemetry(validationResult);
			return { ...httpInfo, body: validationResult.envelope, kind: 'token' };
		}
		if (isErrorEnvelope(parsed)) {
			return { ...httpInfo, body: parsed, kind: 'error-envelope' };
		}
		if (isStandardErrorEnvelope(parsed)) {
			return { ...httpInfo, body: parsed, kind: 'error' };
		}

		// Token validation failed entirely - send telemetry for the failed case
		this.sendTokenValidationTelemetry(validationResult);
		return { ...httpInfo, body: undefined, kind: 'parse-failed', parseError: 'Response is not valid: ' + JSON.stringify(parsed) };
	}

	/**
	 * Sends telemetry when token validation uses fallback strategy or fails entirely.
	 * This helps track server schema drift over time.
	 */
	private sendTokenValidationTelemetry(validationResult: TokenValidationResult): void {
		if (validationResult.strategy === 'strict') {
			// We were able to validate strictly as expected - no telemetry needed
			return;
		}

		/* __GDPR__
			"copilotTokenFetching.validation" : {
				"owner": "TylerLeonhardt",
				"comment": "Track token envelope validation strategy to detect server schema drift.",
				"strategy": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "The validation strategy used: 'fallback' or 'failed'" },
				"strictError": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "The error from strict validation, if any" },
				"fallbackError": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "The error from fallback validation, if failed" }
			}
		*/
		this._telemetryService.sendMSFTTelemetryEvent('copilotTokenFetching.validation', {
			strategy: validationResult.strategy,
			strictError: validationResult.strictError,
			fallbackError: validationResult.fallbackError,
		});
	}

	private async fetchCopilotUserInfo(githubToken: string): Promise<CopilotUserInfo> {
		const options: FetchOptions = {
			callSite: 'copilot-token-user-info',
			headers: {
				Authorization: `token ${githubToken}`,
				'X-GitHub-Api-Version': '2025-04-01',
			},
			retryFallbacks: true,
			expectJSON: true,
		};
		const response = await this._capiClientService.makeRequest<Response>(options, { type: RequestType.CopilotUserInfo });
		const data = await response.json();
		return data;
	}
}

//#region FixedCopilotTokenManager

/**
 * A `CopilotTokenManager` that always returns the same token.
 * Mostly only useful for short periods, e.g. tests or single completion requests,
 * as these tokens typically expire after a few hours.
 * @todo Move this to a test layer
 */

export class FixedCopilotTokenManager extends BaseCopilotTokenManager implements CheckCopilotToken {
	constructor(
		private _completionsToken: string,
		@ILogService logService: ILogService,
		@ITelemetryService telemetryService: ITelemetryService,
		@ICAPIClientService capiClientService: ICAPIClientService,
		@IDomainService domainService: IDomainService,
		@IFetcherService fetcherService: IFetcherService,
		@IEnvService envService: IEnvService
	) {
		super(new NullBaseOctoKitService(capiClientService, fetcherService, logService, telemetryService), logService, telemetryService, domainService, capiClientService, fetcherService, envService);
		this.copilotToken = createTestExtendedTokenInfo({ token: _completionsToken, username: 'fixedTokenManager', copilot_plan: 'unknown' });
	}

	set completionsToken(token: string) {
		this._completionsToken = token;
		this.copilotToken = createTestExtendedTokenInfo({ token, username: 'fixedTokenManager', copilot_plan: 'unknown' });
	}
	get completionsToken(): string {
		return this._completionsToken;
	}

	async getCopilotToken(): Promise<CopilotToken> {
		return new CopilotToken(this.copilotToken!);
	}

	async checkCopilotToken(): Promise<{ status: 'OK' }> {
		// assume it's valid
		return { status: 'OK' };
	}
}

//#endregion

//#region StaticExtendedTokenInfoCopilotTokenManager

/**
 * Use the `StaticExtendedTokenInfoCopilotTokenManager` when you have a base64, JSON-encoded `ExtendedTokenInfo`
 * in an automation scenario.
 */
export class StaticExtendedTokenInfoCopilotTokenManager extends BaseCopilotTokenManager implements CheckCopilotToken {
	private readonly _initialToken: ExtendedTokenInfo;

	constructor(
		serializedToken: string,
		@ILogService logService: ILogService,
		@ITelemetryService telemetryService: ITelemetryService,
		@ICAPIClientService capiClientService: ICAPIClientService,
		@IDomainService domainService: IDomainService,
		@IFetcherService fetcherService: IFetcherService,
		@IEnvService envService: IEnvService
	) {
		super(new NullBaseOctoKitService(capiClientService, fetcherService, logService, telemetryService), logService, telemetryService, domainService, capiClientService, fetcherService, envService);
		const data = Buffer.from(serializedToken, 'base64').toString('utf8');
		this._initialToken = JSON.parse(data);
	}

	override async getCopilotToken(): Promise<CopilotToken> {
		if (!this.copilotToken) {
			this.copilotToken = { ...this._initialToken };
		}

		return new CopilotToken(this._initialToken);
	}

	async checkCopilotToken(): Promise<{ status: 'OK' }> {
		return { status: 'OK' };
	}
}
//#endregion

//#region RefreshableCopilotTokenManager

/**
 * Generic token manager that handles token caching and refresh logic.
 * Takes an authentication function to fetch new tokens.
 */
export abstract class RefreshableCopilotTokenManager extends BaseCopilotTokenManager implements CheckCopilotToken {
	protected abstract authenticateAndGetToken(): Promise<TokenInfoOrError & NotGitHubLoginFailed>;

	async getCopilotToken(force?: boolean): Promise<CopilotToken> {
		if (!this.copilotToken || this.copilotToken.expires_at < nowSeconds() + (60 * 5 /* 5min */) || force) {
			const tokenResult = await this.authenticateAndGetToken();
			if (tokenResult.kind === 'failure') {
				throw Error(
					`Failed to get copilot token: ${tokenResult.reason.toString()} ${tokenResult.message ?? ''}`
				);
			}
			this.copilotToken = { ...tokenResult };
		}
		return new CopilotToken(this.copilotToken);
	}

	async checkCopilotToken() {
		if (!this.copilotToken || this.copilotToken.expires_at < nowSeconds()) {
			const tokenResult = await this.authenticateAndGetToken();
			if (tokenResult.kind === 'failure') {
				return tokenResult;
			}
			this.copilotToken = { ...tokenResult };
		}
		const result: { status: 'OK' } = {
			status: 'OK',
		};
		return result;
	}
}

//#endregion

//#region CopilotTokenManagerFromDeviceId

export class CopilotTokenManagerFromDeviceId extends RefreshableCopilotTokenManager {

	constructor(
		private readonly deviceId: string,
		@ILogService logService: ILogService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IDomainService domainService: IDomainService,
		@ICAPIClientService capiClientService: ICAPIClientService,
		@IFetcherService fetcherService: IFetcherService,
		@IEnvService envService: IEnvService,
		@IConfigurationService protected readonly configurationService: IConfigurationService
	) {
		super(new NullBaseOctoKitService(capiClientService, fetcherService, logService, telemetryService), logService, telemetryService, domainService, capiClientService, fetcherService, envService);
	}

	protected async authenticateAndGetToken(): Promise<TokenInfoOrError & NotGitHubLoginFailed> {
		return this.authFromDevDeviceId(this.deviceId);
	}
}

//#endregion

//#region CopilotTokenManagerFromGitHubToken

/**
 * Given a GitHub token, return a Copilot token, refreshing it as needed.
 * The caller that initializes the object is responsible for checking telemetry consent before
 * using the object.
 */
export class CopilotTokenManagerFromGitHubToken extends RefreshableCopilotTokenManager {

	constructor(
		private readonly githubToken: string,
		private readonly githubUsername: string,
		@ILogService logService: ILogService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IDomainService domainService: IDomainService,
		@ICAPIClientService capiClientService: ICAPIClientService,
		@IFetcherService fetcherService: IFetcherService,
		@IEnvService envService: IEnvService,
		@IConfigurationService protected readonly configurationService: IConfigurationService
	) {
		super(new NullBaseOctoKitService(capiClientService, fetcherService, logService, telemetryService), logService, telemetryService, domainService, capiClientService, fetcherService, envService);
	}

	protected async authenticateAndGetToken(): Promise<TokenInfoOrError & NotGitHubLoginFailed> {
		return this.authFromGitHubToken(this.githubToken, this.githubUsername);
	}
}

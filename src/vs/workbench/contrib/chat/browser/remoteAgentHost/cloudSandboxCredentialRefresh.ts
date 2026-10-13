/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError, timeout } from '../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { equals } from '../../../../../base/common/objects.js';
import {
	CLOUD_SANDBOX_SEALED_TOKEN_PREFIX,
	CloudSandboxRequestError,
	ICloudSandboxApiService,
	isCloudSandboxSealedToken,
	isRetryableCloudSandboxError,
	type CloudSandboxConnectResult,
	type ICloudSandboxClientToken,
	type ICloudSandboxConnectionRequest,
} from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ICloudSandboxTelemetryService, type CloudSandboxRefreshStopReason } from './cloudSandboxTelemetry.js';

const LOG_PREFIX = '[CloudSandboxAgentHost]';

/** A broker may omit unchanged sealing material; a replacement key needs matching new ciphertext. */
export function mergeCloudSandboxConnectionToken(previous: ICloudSandboxClientToken, refreshed: ICloudSandboxClientToken): ICloudSandboxClientToken | undefined {
	const reusesSealedToken = !refreshed.encrypted_github_token;
	const sealedToken = refreshed.encrypted_github_token || previous.encrypted_github_token;
	const hostKey = refreshed.host_encryption_key;
	if (hostKey) {
		const matchesKey = typeof sealedToken === 'string'
			&& typeof hostKey.key_id === 'string' && hostKey.key_id.length > 0
			&& sealedToken.startsWith(`${CLOUD_SANDBOX_SEALED_TOKEN_PREFIX}${hostKey.key_id}.`);
		const reusedKeyChanged = reusesSealedToken && previous.host_encryption_key !== undefined
			&& !equals(previous.host_encryption_key, hostKey);
		if (!matchesKey || reusedKeyChanged) {
			return undefined;
		}
	}
	return reusesSealedToken
		? { ...refreshed, encrypted_github_token: sealedToken, host_encryption_key: hostKey ?? previous.host_encryption_key }
		: refreshed;
}

/** Minimum delay between connection repairs or failed credential requests. */
export const MIN_CREDENTIAL_REFRESH_DELAY_MS = 30_000;
const MAX_CREDENTIAL_RETRY_WAIT_MS = 55 * 60_000;

/** Maximum consecutive failed on-demand acquisitions, retained across protocol-client replacements. */
export const MAX_CONSECUTIVE_CREDENTIAL_REFRESH_FAILURES = 10;

/** Mutable holder for the current Web PubSub credentials, read by the transport factory. */
export interface ICloudSandboxCreds {
	token: ICloudSandboxClientToken;
}

/** Retry bookkeeping retained by a staged sandbox connection across protocol-client replacements. */
export class CloudSandboxCredentialRefreshState {
	unhealthyCycles = 0;
	lastRefreshAt: number | undefined;
	nextRetryAt: number | undefined;
	stopped = false;
	permanentFailure = false;
	permanentFailureStatus: number | undefined;
}

/**
 * Acquires credentials on demand for connection repair and authentication, sharing requests and bounding retries.
 * Web PubSub token expiry governs admission to new sockets, not the lifetime of an established connection.
 */
export class CloudSandboxCredentialRefresher extends Disposable {

	private readonly _cts = new CancellationTokenSource();

	private _refreshInFlight: Promise<boolean> | undefined;

	constructor(
		private readonly _address: string,
		private readonly _request: ICloudSandboxConnectionRequest,
		private readonly _clientId: string,
		private readonly _creds: ICloudSandboxCreds,
		private readonly _refreshState: CloudSandboxCredentialRefreshState,
		@ICloudSandboxApiService private readonly _apiService: ICloudSandboxApiService,
		@ICloudSandboxTelemetryService private readonly _telemetry: ICloudSandboxTelemetryService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register(toDisposable(() => this._cts.dispose(true)));
	}

	/** Share an in-flight refresh or refresh expired credentials before opening a replacement transport. */
	ensureUnexpiredCredentials(): Promise<void> {
		return this._ensureCredentials(false);
	}

	/** Repair connection setup even with a valid cached ticket, waiting for any refresh backoff or rate limit. */
	refreshConnectionCredentials(): Promise<void> {
		return this._ensureCredentials(true);
	}

	/** Renew authentication without falling back to the previously used sealed envelope. */
	async refreshAuthenticationCredentials(): Promise<string> {
		const previousToken = this._creds.token.encrypted_github_token;
		await this.refreshConnectionCredentials();
		const sealedToken = this._creds.token.encrypted_github_token;
		if (!sealedToken || !isCloudSandboxSealedToken(sealedToken) || sealedToken === previousToken) {
			throw new Error('Sandbox authentication refresh did not provide a new sealed token.');
		}
		return sealedToken;
	}

	private async _ensureCredentials(refreshConnection: boolean): Promise<void> {
		if (this._cts.token.isCancellationRequested) {
			throw new CancellationError();
		}
		if (!refreshConnection && this._hasUnexpiredCredentials()) {
			return;
		}
		const previousToken = this._creds.token;
		let waited = false;
		while (!this._refreshInFlight) {
			if (this._refreshState.stopped) {
				throw new Error('Sandbox credential refresh is stopped.');
			}
			if (waited && this._creds.token !== previousToken && this._hasUnexpiredCredentials()) {
				return;
			}
			const retryAt = this._refreshState.nextRetryAt ?? 0;
			const rateLimitAt = refreshConnection && this._refreshState.lastRefreshAt !== undefined
				? this._refreshState.lastRefreshAt + MIN_CREDENTIAL_REFRESH_DELAY_MS : 0;
			const delay = Math.max(retryAt, rateLimitAt) - Date.now();
			if (delay <= 0) {
				break;
			}
			waited = true;
			await timeout(Math.min(MAX_CREDENTIAL_RETRY_WAIT_MS, delay), this._cts.token);
		}
		const refreshed = await raceCancellationError(this._refresh(), this._cts.token);
		if (!this._hasUnexpiredCredentials()) {
			throw new Error('Sandbox credential refresh did not provide credentials with a usable future expiry.');
		}
		if (refreshConnection && !refreshed) {
			throw new Error('Sandbox connection setup could not be refreshed.');
		}
	}

	private _hasUnexpiredCredentials(): boolean {
		return Date.parse(this._creds.token.expires_at) > Date.now();
	}

	private _stop(reason: CloudSandboxRefreshStopReason, detail: string, error?: unknown): void {
		this._refreshState.stopped = true;
		this._telemetry.reportCredentialRefreshStopped(reason, this._refreshState.unhealthyCycles, error);
		this._logService.error(`${LOG_PREFIX} Stopped refreshing credentials for ${this._address}: ${detail}. Further credential acquisition requires a new connection attempt; an established Web PubSub socket is not closed by token expiry.`);
	}

	/** Record a failed acquisition and its earliest retry time without scheduling a request. */
	private _recordFailure(delayMs: number, reason: CloudSandboxRefreshStopReason, detail: string): void {
		if (++this._refreshState.unhealthyCycles >= MAX_CONSECUTIVE_CREDENTIAL_REFRESH_FAILURES) {
			this._stop(reason, `${detail} across ${this._refreshState.unhealthyCycles} consecutive attempts`);
			return;
		}
		this._refreshState.nextRetryAt = Date.now() + Math.max(MIN_CREDENTIAL_REFRESH_DELAY_MS, delayMs);
	}

	private async _refresh(): Promise<boolean> {
		if (this._refreshInFlight) {
			return this._refreshInFlight;
		}
		this._refreshState.lastRefreshAt = Date.now();
		const pending = this._doRefresh();
		this._refreshInFlight = pending;
		try {
			return await pending;
		} finally {
			this._refreshInFlight = undefined;
		}
	}

	private async _doRefresh(): Promise<boolean> {
		let result: CloudSandboxConnectResult;
		const previousToken = this._creds.token;
		try {
			result = await this._apiService.reconnect(this._request, this._clientId, this._cts.token);
		} catch (err) {
			// Teardown cancels the in-flight request, which is a disposal rather than a refresh
			// failure: counting it would log a warning for an ordinary disconnect and could report
			// the loop as having given up when it was simply torn down.
			if (this._cts.token.isCancellationRequested || isCancellationError(err) || err instanceof CancellationError) {
				return false;
			}
			// A rejected request (deleted environment, revoked token) fails identically however
			// often it is repeated, so retrying only adds load without any prospect of recovery.
			if (!isRetryableCloudSandboxError(err)) {
				this._refreshState.permanentFailure = true;
				this._refreshState.permanentFailureStatus = err instanceof CloudSandboxRequestError ? err.statusCode : undefined;
				this._stop('permanentError', toErrorMessage(err), err);
				return false;
			}
			this._logService.warn(`${LOG_PREFIX} Credential refresh failed for ${this._address}; retrying`, err);
			const delayMs = err instanceof CloudSandboxRequestError && err.retryAfterSeconds !== undefined
				? Math.max(MIN_CREDENTIAL_REFRESH_DELAY_MS, err.retryAfterSeconds * 1000)
				: MIN_CREDENTIAL_REFRESH_DELAY_MS;
			this._recordFailure(delayMs, 'consecutiveFailures', 'credential refresh kept failing');
			return false;
		}

		// The connection went away while the request was in flight; its credentials are moot.
		if (this._cts.token.isCancellationRequested) {
			return false;
		}
		if (this._creds.token !== previousToken) {
			this._logService.trace(`${LOG_PREFIX} Ignoring a superseded credential refresh for ${this._address}`);
			return true;
		}

		if (result.kind === 'waking') {
			this._recordFailure(result.waking.retryAfterSeconds * 1000, 'environmentWaking', 'environment kept reporting waking');
			return false;
		}

		const refreshedToken = mergeCloudSandboxConnectionToken(previousToken, result.token);
		if (!refreshedToken) {
			this._logService.warn(`${LOG_PREFIX} Credential refresh for ${this._address} returned inconsistent host credentials; retrying`);
			this._recordFailure(MIN_CREDENTIAL_REFRESH_DELAY_MS, 'unusableToken', 'refreshed host keys did not match the sealed credentials');
			return false;
		}
		if (!(Date.parse(refreshedToken.expires_at) > Date.now())) {
			this._logService.warn(`${LOG_PREFIX} Credential refresh for ${this._address} returned no usable future expiry; retrying`);
			this._recordFailure(MIN_CREDENTIAL_REFRESH_DELAY_MS, 'unusableToken', 'refreshed tokens did not have a usable future expiry');
			return false;
		}
		this._creds.token = refreshedToken;

		this._logService.trace(`${LOG_PREFIX} Refreshed Web PubSub credentials for ${this._address}`);
		this._refreshState.unhealthyCycles = 0;
		this._refreshState.nextRetryAt = undefined;
		return true;
	}
}

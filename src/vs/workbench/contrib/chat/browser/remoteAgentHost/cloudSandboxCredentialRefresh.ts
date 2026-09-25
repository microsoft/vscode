/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout, raceCancellationError } from '../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { equals } from '../../../../../base/common/objects.js';
import {
	CLOUD_SANDBOX_SEALED_TOKEN_PREFIX,
	ICloudSandboxApiService,
	isRetryableCloudSandboxError,
	type CloudSandboxConnectResult,
	type ICloudSandboxClientToken,
	type ICloudSandboxConnectionRequest,
} from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ICloudSandboxTelemetryService, type CloudSandboxRefreshStopReason } from './cloudSandboxTelemetry.js';

const LOG_PREFIX = '[CloudSandboxAgentHost]';

/** Refresh the Web PubSub credentials this long before the access token's `expires_at`. */
const CREDENTIAL_REFRESH_LEAD_MS = 60_000;

/**
 * Floor / ceiling for the scheduled credential-refresh delay.
 *
 * The floor doubles as the rate limit on `/reconnect`: a token that is already at or past its
 * refresh point re-mints on every tick, so this bounds how fast that can happen. Tokens live for
 * the best part of an hour, so a floor this high only ever applies to a degenerate one.
 */
export const MIN_CREDENTIAL_REFRESH_DELAY_MS = 30_000;
const MAX_CREDENTIAL_REFRESH_DELAY_MS = 55 * 60_000;

/** Backoff delay after a failed credential refresh before retrying. */
const CREDENTIAL_REFRESH_RETRY_MS = 30_000;

/**
 * Consecutive refresh cycles that may fail to produce a healthy token before the scheduler gives up.
 *
 * The refresh timer outlives every user interaction — it runs for as long as the window is open — so
 * without a ceiling one unrecoverable environment turns into an unbounded stream of `/reconnect`
 * calls, each of which asks Mission Control to resume a sandbox that cannot be resumed.
 */
export const MAX_CONSECUTIVE_CREDENTIAL_REFRESH_FAILURES = 10;

/**
 * Refresh interval used when a token carries no usable `expires_at`.
 *
 * `expires_at` is required by the API, so this only covers a malformed response. Refreshing on a
 * conservative fixed interval keeps such a connection working rather than dropping it outright,
 * while being far enough apart that it cannot amount to a meaningful load on Mission Control.
 */
const CREDENTIAL_REFRESH_FALLBACK_MS = 15 * 60_000;

/** Upper bound on a single waking Retry-After wait (ms), guarding against a hostile header. */
export const MAX_WAKING_DELAY_MS = 30_000;

/** Mutable holder for the current Web PubSub credentials, read by the transport factory. */
export interface ICloudSandboxCreds {
	token: ICloudSandboxClientToken;
}

/**
 * Delay (ms) until credentials should be refreshed, computed as `expires_at` minus a lead time and
 * clamped to a sane range. Returns `undefined` when `expires_at` is missing or unparseable, leaving
 * the caller to decide — there is no basis for scheduling, so silently substituting the floor would
 * make a token that never reports an expiry re-mint on every tick.
 */
export function credentialRefreshDelayMs(expiresAt: string | undefined, now = Date.now()): number | undefined {
	const expiryMs = expiresAt ? Date.parse(expiresAt) : NaN;
	if (Number.isNaN(expiryMs)) {
		return undefined;
	}
	const delay = expiryMs - now - CREDENTIAL_REFRESH_LEAD_MS;
	return Math.min(MAX_CREDENTIAL_REFRESH_DELAY_MS, Math.max(MIN_CREDENTIAL_REFRESH_DELAY_MS, delay));
}

/**
 * Refreshes credentials before expiry and on demand during recovery, sharing in-flight requests.
 * The open socket is untouched; replacement transports use the refreshed credentials.
 *
 * The loop is bounded in three ways, because it runs unattended for the life of the window and every
 * cycle costs Mission Control a sandbox resume: a permanent rejection stops it outright,
 * {@link MAX_CONSECUTIVE_CREDENTIAL_REFRESH_FAILURES} caps a run of transient ones, and
 * {@link MIN_CREDENTIAL_REFRESH_DELAY_MS} rate-limits a token that always looks due for refresh.
 *
 * Disposing stops the loop and cancels any request in flight.
 */
export class CloudSandboxCredentialRefresher extends Disposable {

	private readonly _timer = this._register(new MutableDisposable());

	/**
	 * A `MutableDisposable` silently drops a value assigned after it is disposed, so a timeout armed
	 * while a refresh was in flight — the connection can go away mid-request — would never be
	 * cancelled and would keep calling `/reconnect` for the life of the window. Cancelling on
	 * teardown both aborts the in-flight request and stops anything being armed afterwards.
	 */
	private readonly _cts = new CancellationTokenSource();

	/** Consecutive cycles that did not yield a healthy, long-lived token. */
	private _unhealthyCycles = 0;
	private _refreshInFlight: Promise<void> | undefined;
	private _hasRefreshed = false;
	private _nextRefreshAt = 0;
	private _stopped = false;

	constructor(
		private readonly _address: string,
		private readonly _request: ICloudSandboxConnectionRequest,
		private readonly _clientId: string,
		private readonly _creds: ICloudSandboxCreds,
		@ICloudSandboxApiService private readonly _apiService: ICloudSandboxApiService,
		@ICloudSandboxTelemetryService private readonly _telemetry: ICloudSandboxTelemetryService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register(toDisposable(() => this._cts.dispose(true)));

		const initialDelayMs = credentialRefreshDelayMs(this._creds.token.expires_at);
		if (initialDelayMs === undefined) {
			this._armUnhealthy(CREDENTIAL_REFRESH_FALLBACK_MS, 'unusableToken', `tokens kept arriving without a usable 'expires_at'`);
			return;
		}
		this._arm(initialDelayMs);
	}

	/** Share an in-flight refresh or refresh expired credentials before opening a replacement transport. */
	async ensureUnexpiredCredentials(): Promise<void> {
		if (this._cts.token.isCancellationRequested) {
			throw new CancellationError();
		}
		if (this._hasUnexpiredCredentials()) {
			return;
		}
		const awaitingRetry = this._hasRefreshed && this._unhealthyCycles > 0 && Date.now() < this._nextRefreshAt;
		if (!this._refreshInFlight && (this._stopped || awaitingRetry)) {
			throw new Error('No unexpired sandbox credentials are available; credential refresh is stopped or waiting to retry.');
		}
		await raceCancellationError(this._refresh(), this._cts.token);
		if (!this._hasUnexpiredCredentials()) {
			throw new Error('Sandbox credential refresh did not provide credentials with a usable future expiry.');
		}
	}

	private _hasUnexpiredCredentials(): boolean {
		return Date.parse(this._creds.token.expires_at) > Date.now();
	}

	private _stop(reason: CloudSandboxRefreshStopReason, detail: string, error?: unknown): void {
		this._stopped = true;
		this._timer.clear();
		this._telemetry.reportCredentialRefreshStopped(reason, this._unhealthyCycles, error);
		this._logService.error(`${LOG_PREFIX} Stopped refreshing credentials for ${this._address}: ${detail}. The connection will drop when the current token expires.`);
	}

	private _arm(delayMs: number): void {
		if (this._cts.token.isCancellationRequested) {
			return;
		}
		const delay = Math.max(MIN_CREDENTIAL_REFRESH_DELAY_MS, delayMs);
		this._nextRefreshAt = Date.now() + delay;
		this._timer.value = disposableTimeout(() => void this._refresh(), delay);
	}

	/** Re-arm after a cycle that produced no usable token, giving up once too many pile up. */
	private _armUnhealthy(delayMs: number, reason: CloudSandboxRefreshStopReason, detail: string): void {
		if (++this._unhealthyCycles >= MAX_CONSECUTIVE_CREDENTIAL_REFRESH_FAILURES) {
			this._stop(reason, `${detail} across ${this._unhealthyCycles} consecutive attempts`);
			return;
		}
		this._arm(delayMs);
	}

	private async _refresh(): Promise<void> {
		if (this._refreshInFlight) {
			return this._refreshInFlight;
		}
		this._timer.clear();
		this._hasRefreshed = true;
		const pending = this._doRefresh();
		this._refreshInFlight = pending;
		try {
			await pending;
		} finally {
			this._refreshInFlight = undefined;
		}
	}

	private async _doRefresh(): Promise<void> {
		let result: CloudSandboxConnectResult;
		try {
			result = await this._apiService.reconnect(this._request, this._clientId, this._cts.token);
		} catch (err) {
			// Teardown cancels the in-flight request, which is a disposal rather than a refresh
			// failure: counting it would log a warning for an ordinary disconnect and could report
			// the loop as having given up when it was simply torn down.
			if (this._cts.token.isCancellationRequested || isCancellationError(err) || err instanceof CancellationError) {
				return;
			}
			// A rejected request (deleted environment, revoked token) fails identically however
			// often it is repeated, so retrying only adds load without any prospect of recovery.
			if (!isRetryableCloudSandboxError(err)) {
				this._stop('permanentError', toErrorMessage(err), err);
				return;
			}
			this._logService.warn(`${LOG_PREFIX} Credential refresh failed for ${this._address}; retrying`, err);
			this._armUnhealthy(CREDENTIAL_REFRESH_RETRY_MS, 'consecutiveFailures', 'credential refresh kept failing');
			return;
		}

		// The connection went away while the request was in flight; its credentials are moot.
		if (this._cts.token.isCancellationRequested) {
			return;
		}

		if (result.kind === 'waking') {
			// `/reconnect` refreshes an already-connected client, so a waking environment here is the
			// sandbox disappearing underneath us rather than a wake worth waiting out.
			this._armUnhealthy(Math.min(result.waking.retryAfterSeconds * 1000, MAX_WAKING_DELAY_MS), 'environmentWaking', 'environment kept reporting waking');
			return;
		}

		const previousToken = this._creds.token;
		const refreshedToken = result.token;
		const reusesSealedToken = !refreshedToken.encrypted_github_token;
		const sealedToken = refreshedToken.encrypted_github_token || previousToken.encrypted_github_token;
		const hostKey = refreshedToken.host_encryption_key;
		if (hostKey) {
			const sealedTokenMatchesKey = typeof sealedToken === 'string'
				&& typeof hostKey.key_id === 'string' && hostKey.key_id.length > 0
				&& sealedToken.startsWith(`${CLOUD_SANDBOX_SEALED_TOKEN_PREFIX}${hostKey.key_id}.`);
			const reusedKeyChanged = reusesSealedToken && previousToken.host_encryption_key !== undefined
				&& !equals(previousToken.host_encryption_key, hostKey);
			if (!sealedTokenMatchesKey || reusedKeyChanged) {
				this._logService.warn(`${LOG_PREFIX} Credential refresh for ${this._address} returned inconsistent host credentials; retrying`);
				this._armUnhealthy(CREDENTIAL_REFRESH_RETRY_MS, 'unusableToken', 'refreshed host keys did not match the sealed credentials');
				return;
			}
		}
		this._creds.token = reusesSealedToken
			? { ...refreshedToken, encrypted_github_token: sealedToken, host_encryption_key: hostKey ?? previousToken.host_encryption_key }
			: refreshedToken;

		this._logService.trace(`${LOG_PREFIX} Refreshed Web PubSub credentials for ${this._address}`);
		const delayMs = credentialRefreshDelayMs(result.token.expires_at);
		if (delayMs === undefined) {
			// No basis for scheduling. Keep the connection alive on a conservative interval, but
			// count the cycles so an endless stream of unschedulable tokens still terminates.
			this._armUnhealthy(CREDENTIAL_REFRESH_FALLBACK_MS, 'unusableToken', `tokens kept arriving without a usable 'expires_at'`);
			return;
		}
		if (delayMs <= MIN_CREDENTIAL_REFRESH_DELAY_MS) {
			// Already at (or past) its refresh point, so the next cycle would re-mint immediately.
			this._armUnhealthy(delayMs, 'unusableToken', 'refreshed tokens kept expiring immediately');
			return;
		}
		this._unhealthyCycles = 0;
		this._arm(delayMs);
	}
}

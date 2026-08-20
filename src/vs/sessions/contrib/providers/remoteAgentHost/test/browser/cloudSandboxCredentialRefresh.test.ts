/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import {
	CloudSandboxRequestError,
	type CloudSandboxConnectResult,
	type ICloudSandboxClientToken,
	type ICloudSandboxApiService,
} from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import {
	CloudSandboxCredentialRefresher,
	credentialRefreshDelayMs,
	MAX_CONSECUTIVE_CREDENTIAL_REFRESH_FAILURES,
	type ICloudSandboxCreds,
} from '../../browser/cloudSandboxCredentialRefresh.js';
import type {
	CloudSandboxRefreshStopReason,
	CloudSandboxRequestAction,
	CloudSandboxRequestOutcome,
	ICloudSandboxTelemetryService,
} from '../../browser/cloudSandboxTelemetry.js';

const START_TIME = Date.parse('2026-01-01T00:00:00Z');

/** A token expiring `minutes` from `from`. 40 minutes sits comfortably clear of the refresh floor. */
function tokenExpiringIn(minutes: number, from: number, overrides: Partial<ICloudSandboxClientToken> = {}): ICloudSandboxClientToken {
	return {
		access_token: 'tok',
		expires_at: new Date(from + minutes * 60_000).toISOString(),
		wps_endpoint: 'wss://wps.example/client/hubs/h',
		hub: 'h',
		subprotocol: 'json.reliable.webpubsub.azure.v1',
		client_id: 'client-1',
		groups: { broadcast: 'b', to_client: 'tc', to_host: 'th' },
		...overrides,
	};
}

/** Records the stop reports the refresher emits; request counting is covered by its own suite. */
class RecordingTelemetry implements ICloudSandboxTelemetryService {
	declare readonly _serviceBrand: undefined;

	readonly stops: { reason: CloudSandboxRefreshStopReason; consecutiveFailures: number; statusCode: number | undefined }[] = [];

	reportRequest(_action: CloudSandboxRequestAction, _outcome: CloudSandboxRequestOutcome): void { }

	reportCredentialRefreshStopped(reason: CloudSandboxRefreshStopReason, consecutiveFailures: number, error?: unknown): void {
		this.stops.push({
			reason,
			consecutiveFailures,
			statusCode: error instanceof CloudSandboxRequestError ? error.statusCode : undefined,
		});
	}
}

/** Answers every `reconnect` from a single scripted step, so a loop can run as long as it likes. */
class ScriptedCredentialsService {
	callCount = 0;

	constructor(private readonly _step: () => CloudSandboxConnectResult | Promise<never>) { }

	async reconnect(): Promise<CloudSandboxConnectResult> {
		this.callCount++;
		return this._step() as CloudSandboxConnectResult;
	}
}

suite('CloudSandboxCredentialRefresher', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * Run a refresher over `durationMs` of virtual time and report what it did. The refresher is
	 * disposed before returning so nothing survives into the next test.
	 */
	async function runRefresher(
		step: () => CloudSandboxConnectResult | Promise<never>,
		durationMs: number,
		initialToken = tokenExpiringIn(40, START_TIME),
	): Promise<{ calls: number; stops: RecordingTelemetry['stops']; creds: ICloudSandboxCreds }> {
		const telemetry = new RecordingTelemetry();
		const credentials = new ScriptedCredentialsService(step);
		const creds: ICloudSandboxCreds = { token: initialToken };
		const disposables = new DisposableStore();

		disposables.add(new CloudSandboxCredentialRefresher(
			'cloudsandbox:env_1',
			{ environmentId: 'env_1', sessionId: 'session-1' },
			'client-1',
			creds,
			credentials as unknown as ICloudSandboxApiService,
			telemetry,
			new NullLogService(),
		));

		await new Promise<void>(resolve => setTimeout(resolve, durationMs));
		disposables.dispose();
		return { calls: credentials.callCount, stops: telemetry.stops, creds };
	}

	test('a healthy token keeps refreshing and never reports a stop', () => runWithFakedTimers<void>({ useFakeTimers: true, startTime: START_TIME }, async () => {
		// Every refresh yields another healthy token, so the loop should simply keep going. Twelve
		// hours is far more than the failure cap would allow if the counter were mis-managed.
		const result = await runRefresher(() => ({ kind: 'token', token: tokenExpiringIn(40, Date.now()) }), 12 * 60 * 60_000);

		assert.deepStrictEqual(
			{ keptRefreshing: result.calls > 10, stops: result.stops },
			{ keptRefreshing: true, stops: [] },
		);
	}));

	test('a permanently rejected refresh stops at once, reporting the status', () => runWithFakedTimers<void>({ useFakeTimers: true, startTime: START_TIME }, async () => {
		const result = await runRefresher(() => Promise.reject(new CloudSandboxRequestError(404, 'environment gone')), 12 * 60 * 60_000);

		assert.deepStrictEqual(
			result,
			{
				calls: 1,
				stops: [{ reason: 'permanentError', consecutiveFailures: 0, statusCode: 404 }],
				creds: result.creds,
			},
		);
	}));

	test('transient failures stop once the consecutive-failure cap is reached', () => runWithFakedTimers<void>({ useFakeTimers: true, startTime: START_TIME }, async () => {
		const result = await runRefresher(() => Promise.reject(new CloudSandboxRequestError(500, 'server error')), 12 * 60 * 60_000);

		assert.deepStrictEqual(
			{ calls: result.calls, stops: result.stops },
			{
				calls: MAX_CONSECUTIVE_CREDENTIAL_REFRESH_FAILURES,
				stops: [{ reason: 'consecutiveFailures', consecutiveFailures: MAX_CONSECUTIVE_CREDENTIAL_REFRESH_FAILURES, statusCode: undefined }],
			},
		);
	}));

	test('a success between failures resets the cap, so a flaky connection survives', () => runWithFakedTimers<void>({ useFakeTimers: true, startTime: START_TIME }, async () => {
		// Fail nine times, recover on the tenth, then fail forever. The recovery must reset the
		// counter, so the stop lands a further ten failures later rather than on the tenth overall.
		let call = 0;
		const result = await runRefresher(
			() => {
				call++;
				if (call === MAX_CONSECUTIVE_CREDENTIAL_REFRESH_FAILURES) {
					return { kind: 'token', token: tokenExpiringIn(40, Date.now()) };
				}
				return Promise.reject(new CloudSandboxRequestError(503, 'unavailable'));
			},
			24 * 60 * 60_000,
		);

		assert.deepStrictEqual(
			{ calls: result.calls, stops: result.stops },
			{
				calls: 2 * MAX_CONSECUTIVE_CREDENTIAL_REFRESH_FAILURES,
				stops: [{ reason: 'consecutiveFailures', consecutiveFailures: MAX_CONSECUTIVE_CREDENTIAL_REFRESH_FAILURES, statusCode: undefined }],
			},
		);
	}));

	test('a waking answer to /reconnect is bounded, since that client is already connected', () => runWithFakedTimers<void>({ useFakeTimers: true, startTime: START_TIME }, async () => {
		const result = await runRefresher(() => ({ kind: 'waking', waking: { retryAfterSeconds: 5 } }), 12 * 60 * 60_000);

		assert.deepStrictEqual(
			{ calls: result.calls, stops: result.stops },
			{
				calls: MAX_CONSECUTIVE_CREDENTIAL_REFRESH_FAILURES,
				stops: [{ reason: 'environmentWaking', consecutiveFailures: MAX_CONSECUTIVE_CREDENTIAL_REFRESH_FAILURES, statusCode: undefined }],
			},
		);
	}));

	test('tokens that arrive already due are bounded, not re-minted on every tick', () => runWithFakedTimers<void>({ useFakeTimers: true, startTime: START_TIME }, async () => {
		// Expiring inside the lead time, so each refreshed token is immediately due again.
		const result = await runRefresher(() => ({ kind: 'token', token: tokenExpiringIn(-5, Date.now()) }), 12 * 60 * 60_000);

		assert.deepStrictEqual(
			{ calls: result.calls, stops: result.stops },
			{
				calls: MAX_CONSECUTIVE_CREDENTIAL_REFRESH_FAILURES,
				stops: [{ reason: 'unusableToken', consecutiveFailures: MAX_CONSECUTIVE_CREDENTIAL_REFRESH_FAILURES, statusCode: undefined }],
			},
		);
	}));

	test('a token with no usable expiry falls back to a fixed interval, still bounded', () => runWithFakedTimers<void>({ useFakeTimers: true, startTime: START_TIME }, async () => {
		const result = await runRefresher(() => ({ kind: 'token', token: tokenExpiringIn(40, Date.now(), { expires_at: 'not-a-date' }) }), 24 * 60 * 60_000);

		assert.deepStrictEqual(
			{ calls: result.calls, stops: result.stops },
			{
				calls: MAX_CONSECUTIVE_CREDENTIAL_REFRESH_FAILURES,
				stops: [{ reason: 'unusableToken', consecutiveFailures: MAX_CONSECUTIVE_CREDENTIAL_REFRESH_FAILURES, statusCode: undefined }],
			},
		);
	}));

	test('disposal stops the loop without reporting it as a failure', () => runWithFakedTimers<void>({ useFakeTimers: true, startTime: START_TIME }, async () => {
		// Disposing cancels the in-flight request, so the refresh rejects with a cancellation. That
		// is an ordinary teardown, and must not be counted or reported as the loop giving up.
		const telemetry = new RecordingTelemetry();
		const credentials = new ScriptedCredentialsService(() => Promise.reject(new CancellationError()));
		const creds: ICloudSandboxCreds = { token: tokenExpiringIn(40, START_TIME) };
		const disposables = new DisposableStore();

		disposables.add(new CloudSandboxCredentialRefresher(
			'cloudsandbox:env_1',
			{ environmentId: 'env_1', sessionId: 'session-1' },
			'client-1',
			creds,
			credentials as unknown as ICloudSandboxApiService,
			telemetry,
			new NullLogService(),
		));

		await new Promise<void>(resolve => setTimeout(resolve, 40 * 60_000));
		const callsBeforeDispose = credentials.callCount;
		disposables.dispose();
		await new Promise<void>(resolve => setTimeout(resolve, 12 * 60 * 60_000));

		assert.deepStrictEqual(
			{ callsBeforeDispose, callsAfterDispose: credentials.callCount, stops: telemetry.stops },
			{ callsBeforeDispose: 1, callsAfterDispose: 1, stops: [] },
		);
	}));

	test('a refreshed token without a sealed GitHub token keeps the previous one', () => runWithFakedTimers<void>({ useFakeTimers: true, startTime: START_TIME }, async () => {
		const result = await runRefresher(
			() => ({ kind: 'token', token: tokenExpiringIn(40, Date.now(), { access_token: 'fresh' }) }),
			40 * 60_000,
			tokenExpiringIn(40, START_TIME, { encrypted_github_token: 'copilot-sealed.v1.k.abc' }),
		);

		assert.deepStrictEqual(
			{ accessToken: result.creds.token.access_token, sealed: result.creds.token.encrypted_github_token },
			{ accessToken: 'fresh', sealed: 'copilot-sealed.v1.k.abc' },
		);
	}));
});

suite('credentialRefreshDelayMs', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const inMinutes = (minutes: number) => new Date(START_TIME + minutes * 60_000).toISOString();

	test('schedules a refresh one minute before expiry, clamped to the supported range', () => {
		assert.deepStrictEqual(
			{
				typicalToken: credentialRefreshDelayMs(inMinutes(40), START_TIME),
				beyondCeiling: credentialRefreshDelayMs(inMinutes(24 * 60), START_TIME),
				dueImminently: credentialRefreshDelayMs(inMinutes(1), START_TIME),
				alreadyExpired: credentialRefreshDelayMs(inMinutes(-30), START_TIME),
			},
			{
				typicalToken: 39 * 60_000,
				beyondCeiling: 55 * 60_000,
				// Never faster than the floor: a token that always looks due would otherwise re-mint
				// on every tick, and each mint asks Mission Control to resume a sandbox.
				dueImminently: 30_000,
				alreadyExpired: 30_000,
			},
		);
	});

	test('reports no schedule when expiry is missing or unparseable', () => {
		assert.deepStrictEqual(
			[
				credentialRefreshDelayMs(undefined, START_TIME),
				credentialRefreshDelayMs('', START_TIME),
				credentialRefreshDelayMs('not-a-date', START_TIME),
			],
			[undefined, undefined, undefined],
		);
	});
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../../../base/common/errors.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import {
	CloudSandboxRequestError,
	type CloudSandboxConnectResult,
	type ICloudSandboxClientToken,
	type ICloudSandboxApiService,
	type ICloudSandboxConnectionRequest,
	type IHostEncryptionKey,
} from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import {
	CloudSandboxCredentialRefresher,
	credentialRefreshDelayMs,
	MAX_CONSECUTIVE_CREDENTIAL_REFRESH_FAILURES,
	type ICloudSandboxCreds,
} from '../../../browser/remoteAgentHost/cloudSandboxCredentialRefresh.js';
import type {
	CloudSandboxRefreshStopReason,
	CloudSandboxRequestAction,
	CloudSandboxRequestOutcome,
	ICloudSandboxTelemetryService,
} from '../../../browser/remoteAgentHost/cloudSandboxTelemetry.js';

const START_TIME = Date.parse('2026-01-01T00:00:00Z');
const HOST_KEY: IHostEncryptionKey = { key_id: 'key-1', use: 'auth-token', algorithm: 'x25519-sealedbox', public_key: 'AQID' };
const REPLACEMENT_HOST_KEY: IHostEncryptionKey = { ...HOST_KEY, key_id: 'key-2', public_key: 'BAUG' };
const SEALED_TOKEN = 'copilot-sealed.v1.key-1.abc';

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
class RecordingTelemetry extends mock<ICloudSandboxTelemetryService>() {
	declare readonly _serviceBrand: undefined;

	readonly stops: { reason: CloudSandboxRefreshStopReason; consecutiveFailures: number; statusCode: number | undefined }[] = [];

	override reportRequest(_action: CloudSandboxRequestAction, _outcome: CloudSandboxRequestOutcome): void { }

	override reportCredentialRefreshStopped(reason: CloudSandboxRefreshStopReason, consecutiveFailures: number, error?: unknown): void {
		this.stops.push({
			reason,
			consecutiveFailures,
			statusCode: error instanceof CloudSandboxRequestError ? error.statusCode : undefined,
		});
	}
}

/** Answers every `reconnect` from a single scripted step, so a loop can run as long as it likes. */
class ScriptedCredentialsService extends mock<ICloudSandboxApiService>() {
	callCount = 0;
	readonly requests: { request: ICloudSandboxConnectionRequest; clientId: string; token: CancellationToken }[] = [];

	constructor(private readonly _step: () => CloudSandboxConnectResult | Promise<CloudSandboxConnectResult>) {
		super();
	}

	override async reconnect(request: ICloudSandboxConnectionRequest, clientId: string, token: CancellationToken): Promise<CloudSandboxConnectResult> {
		this.callCount++;
		this.requests.push({ request, clientId, token });
		return this._step();
	}
}

suite('CloudSandboxCredentialRefresher', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * Run a refresher over `durationMs` of virtual time and report what it did. The refresher is
	 * disposed before returning so nothing survives into the next test.
	 */
	async function runRefresher(
		step: () => CloudSandboxConnectResult | Promise<CloudSandboxConnectResult>,
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
			credentials,
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
			credentials,
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

	for (const previousKey of [undefined, HOST_KEY]) {
		test(`retains the sealed token with a matching refreshed key ${previousKey ? 'with' : 'without'} cached key metadata`, () => runWithFakedTimers<void>({ useFakeTimers: true, startTime: START_TIME }, async () => {
			const refreshed = tokenExpiringIn(80, START_TIME, { access_token: 'fresh', host_encryption_key: { ...HOST_KEY } });
			const result = await runRefresher(
				() => ({ kind: 'token', token: refreshed }),
				40 * 60_000,
				tokenExpiringIn(40, START_TIME, { encrypted_github_token: SEALED_TOKEN, host_encryption_key: previousKey }),
			);

			assert.deepStrictEqual(result, {
				calls: 1,
				stops: [],
				creds: { token: { ...refreshed, encrypted_github_token: SEALED_TOKEN } },
			});
		}));
	}

	test('retains the existing sealed token and key when a refresh omits both', () => runWithFakedTimers<void>({ useFakeTimers: true, startTime: START_TIME }, async () => {
		const refreshed = tokenExpiringIn(80, START_TIME, { access_token: 'fresh' });
		const result = await runRefresher(
			() => ({ kind: 'token', token: refreshed }),
			40 * 60_000,
			tokenExpiringIn(40, START_TIME, { encrypted_github_token: SEALED_TOKEN, host_encryption_key: HOST_KEY }),
		);

		assert.deepStrictEqual(result, {
			calls: 1,
			stops: [],
			creds: { token: { ...refreshed, encrypted_github_token: SEALED_TOKEN, host_encryption_key: HOST_KEY } },
		});
	}));

	const inconsistentRefreshes: { readonly name: string; readonly credentials: Partial<ICloudSandboxClientToken> }[] = [
		{ name: 'a replacement host key without a sealed token', credentials: { host_encryption_key: REPLACEMENT_HOST_KEY } },
		{ name: 'different key material under the same key ID', credentials: { host_encryption_key: { ...HOST_KEY, public_key: 'BAUG' } } },
		{ name: 'a different key algorithm', credentials: { host_encryption_key: { ...HOST_KEY, algorithm: 'other' } } },
		{ name: 'a different key use', credentials: { host_encryption_key: { ...HOST_KEY, use: 'other' } } },
		{ name: 'a new sealed token for the wrong key', credentials: { host_encryption_key: REPLACEMENT_HOST_KEY, encrypted_github_token: SEALED_TOKEN } },
	];
	for (const { name, credentials } of inconsistentRefreshes) {
		test(`keeps the complete previous credentials on ${name}`, () => runWithFakedTimers<void>({ useFakeTimers: true, startTime: START_TIME }, async () => {
			const initialToken = tokenExpiringIn(40, START_TIME, { encrypted_github_token: SEALED_TOKEN, host_encryption_key: HOST_KEY });
			const result = await runRefresher(
				() => ({ kind: 'token', token: tokenExpiringIn(80, START_TIME, { access_token: 'fresh', ...credentials }) }),
				39 * 60_000 + 29_999,
				initialToken,
			);

			assert.deepStrictEqual(result, { calls: 1, stops: [], creds: { token: initialToken } });
		}));
	}

	test('retries an incomplete key replacement and accepts the matching sealed token atomically', () => runWithFakedTimers<void>({ useFakeTimers: true, startTime: START_TIME }, async () => {
		const callTimes: number[] = [];
		const refreshed = tokenExpiringIn(80, START_TIME, {
			access_token: 'fresh',
			host_encryption_key: REPLACEMENT_HOST_KEY,
			encrypted_github_token: 'copilot-sealed.v1.key-2.def',
		});
		const result = await runRefresher(
			() => {
				callTimes.push(Date.now() - START_TIME);
				return { kind: 'token', token: callTimes.length === 1 ? { ...refreshed, encrypted_github_token: undefined } : refreshed };
			},
			40 * 60_000,
			tokenExpiringIn(40, START_TIME, { encrypted_github_token: SEALED_TOKEN, host_encryption_key: HOST_KEY }),
		);

		assert.deepStrictEqual({ ...result, callTimes }, {
			calls: 2,
			stops: [],
			creds: { token: refreshed },
			callTimes: [39 * 60_000, 39 * 60_000 + 30_000],
		});
	}));

	test('bounds retries for a host key that never receives matching sealed credentials', () => runWithFakedTimers<void>({ useFakeTimers: true, startTime: START_TIME }, async () => {
		const initialToken = tokenExpiringIn(40, START_TIME, { encrypted_github_token: SEALED_TOKEN, host_encryption_key: HOST_KEY });
		const callTimes: number[] = [];
		const result = await runRefresher(
			() => {
				callTimes.push(Date.now() - START_TIME);
				return { kind: 'token', token: tokenExpiringIn(40, Date.now(), { access_token: 'fresh', host_encryption_key: REPLACEMENT_HOST_KEY }) };
			},
			12 * 60 * 60_000,
			initialToken,
		);

		assert.deepStrictEqual({ ...result, callTimes }, {
			calls: MAX_CONSECUTIVE_CREDENTIAL_REFRESH_FAILURES,
			stops: [{ reason: 'unusableToken', consecutiveFailures: MAX_CONSECUTIVE_CREDENTIAL_REFRESH_FAILURES, statusCode: undefined }],
			creds: { token: initialToken },
			callTimes: Array.from({ length: MAX_CONSECUTIVE_CREDENTIAL_REFRESH_FAILURES }, (_, index) => 39 * 60_000 + index * 30_000),
		});
	}));
});

suite('CloudSandboxCredentialRefresher recovery', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createRefresher(
		initialToken: ICloudSandboxClientToken,
		step: () => CloudSandboxConnectResult | Promise<CloudSandboxConnectResult>,
	) {
		const credentials = new ScriptedCredentialsService(step);
		const creds: ICloudSandboxCreds = { token: initialToken };
		const telemetry = new RecordingTelemetry();
		const refresher = store.add(new CloudSandboxCredentialRefresher(
			'cloudsandbox:env_1',
			{ environmentId: 'env_1', sessionId: 'session-1' },
			'client-1',
			creds,
			credentials,
			telemetry,
			new NullLogService(),
		));
		return { refresher, credentials, creds, telemetry };
	}

	test('reuses still-valid credentials without a refresh, even inside the refresh lead time', () => runWithFakedTimers({ useFakeTimers: true, startTime: START_TIME }, async () => {
		const initialToken = tokenExpiringIn(0.5, START_TIME);
		const { refresher, credentials, creds } = createRefresher(initialToken, () => {
			throw new Error('No refresh expected');
		});
		await refresher.ensureUnexpiredCredentials();
		refresher.dispose();

		assert.deepStrictEqual({ calls: credentials.callCount, token: creds.token }, { calls: 0, token: initialToken });
	}));

	test('does not wait for a background refresh while the cached token is still valid', () => runWithFakedTimers({ useFakeTimers: true, startTime: START_TIME }, async () => {
		const response = new DeferredPromise<CloudSandboxConnectResult>();
		const initialToken = tokenExpiringIn(1, START_TIME);
		const { refresher, credentials, creds } = createRefresher(initialToken, () => response.p);
		await timeout(30_000);
		await refresher.ensureUnexpiredCredentials();
		const tokenWhileRefreshing = creds.token;
		refresher.dispose();
		await response.complete({ kind: 'token', token: tokenExpiringIn(40, Date.now()) });

		assert.deepStrictEqual({ calls: credentials.callCount, tokenWhileRefreshing }, { calls: 1, tokenWhileRefreshing: initialToken });
	}));

	for (const expiresAt of [new Date(START_TIME).toISOString(), '', 'not-a-date']) {
		test(`refreshes credentials immediately when expiry is ${expiresAt}`, () => runWithFakedTimers({ useFakeTimers: true, startTime: START_TIME }, async () => {
			const refreshed = tokenExpiringIn(40, START_TIME, { access_token: 'fresh' });
			const { refresher, credentials, creds } = createRefresher(
				tokenExpiringIn(40, START_TIME, { expires_at: expiresAt }),
				() => ({ kind: 'token', token: refreshed }),
			);
			await refresher.ensureUnexpiredCredentials();
			refresher.dispose();

			assert.deepStrictEqual({
				calls: credentials.callCount,
				token: creds.token,
				requests: credentials.requests.map(({ request, clientId }) => ({ request, clientId })),
			}, {
				calls: 1,
				token: { ...refreshed, encrypted_github_token: undefined, host_encryption_key: undefined },
				requests: [{ request: { environmentId: 'env_1', sessionId: 'session-1' }, clientId: 'client-1' }],
			});
		}));
	}

	for (const backgroundRefresh of [false, true]) {
		test(`shares ${backgroundRefresh ? 'a background' : 'a recovery'} refresh across concurrent reconnect waits`, () => runWithFakedTimers({ useFakeTimers: true, startTime: START_TIME }, async () => {
			const response = new DeferredPromise<CloudSandboxConnectResult>();
			const { refresher, credentials, creds } = createRefresher(tokenExpiringIn(backgroundRefresh ? 1 : 0, START_TIME), () => response.p);
			if (backgroundRefresh) {
				await timeout(60_000);
			}
			const first = refresher.ensureUnexpiredCredentials();
			const second = refresher.ensureUnexpiredCredentials();
			const callsWhilePending = credentials.callCount;
			const refreshed = tokenExpiringIn(40, Date.now(), { access_token: 'fresh' });
			await response.complete({ kind: 'token', token: refreshed });
			await Promise.all([first, second]);
			refresher.dispose();

			assert.deepStrictEqual({ callsWhilePending, calls: credentials.callCount, token: creds.token.access_token }, {
				callsWhilePending: 1, calls: 1, token: 'fresh',
			});
		}));
	}

	test('keeps refresh retries bounded when reconnect keeps asking for expired credentials', () => runWithFakedTimers({ useFakeTimers: true, startTime: START_TIME }, async () => {
		const { refresher, credentials, telemetry } = createRefresher(
			tokenExpiringIn(0, START_TIME),
			() => { throw new CloudSandboxRequestError(503, 'unavailable'); },
		);
		await assert.rejects(refresher.ensureUnexpiredCredentials(), /usable future expiry/);
		await timeout(29_999);
		await assert.rejects(refresher.ensureUnexpiredCredentials(), /waiting to retry/);
		const callsBeforeRetry = credentials.callCount;
		await timeout(30_000 * MAX_CONSECUTIVE_CREDENTIAL_REFRESH_FAILURES);
		await assert.rejects(refresher.ensureUnexpiredCredentials(), /stopped/);
		refresher.dispose();

		assert.deepStrictEqual({ callsBeforeRetry, calls: credentials.callCount, stops: telemetry.stops }, {
			callsBeforeRetry: 1,
			calls: MAX_CONSECUTIVE_CREDENTIAL_REFRESH_FAILURES,
			stops: [{ reason: 'consecutiveFailures', consecutiveFailures: MAX_CONSECUTIVE_CREDENTIAL_REFRESH_FAILURES, statusCode: undefined }],
		});
	}));

	for (const { name, result } of [
		{ name: 'waking', result: { kind: 'waking', waking: { retryAfterSeconds: 5 } } },
		{ name: 'already expired', result: { kind: 'token', token: tokenExpiringIn(-1, START_TIME) } },
		{ name: 'invalid expiry', result: { kind: 'token', token: tokenExpiringIn(40, START_TIME, { expires_at: 'not-a-date' }) } },
	] satisfies { name: string; result: CloudSandboxConnectResult }[]) {
		test(`rejects unusable credentials during recovery: ${name}`, () => runWithFakedTimers({ useFakeTimers: true, startTime: START_TIME }, async () => {
			const { refresher, credentials } = createRefresher(tokenExpiringIn(0, START_TIME), () => result);
			await assert.rejects(refresher.ensureUnexpiredCredentials(), /usable future expiry/);
			await assert.rejects(refresher.ensureUnexpiredCredentials(), /waiting to retry/);
			refresher.dispose();

			assert.strictEqual(credentials.callCount, 1);
		}));
	}

	test('does not restart a permanently rejected refresh during recovery', () => runWithFakedTimers({ useFakeTimers: true, startTime: START_TIME }, async () => {
		const { refresher, credentials, telemetry } = createRefresher(
			tokenExpiringIn(0, START_TIME),
			() => { throw new CloudSandboxRequestError(404, 'environment gone'); },
		);
		await assert.rejects(refresher.ensureUnexpiredCredentials(), /usable future expiry/);
		await timeout(60_000);
		await assert.rejects(refresher.ensureUnexpiredCredentials(), /stopped/);
		refresher.dispose();

		assert.deepStrictEqual({ calls: credentials.callCount, stops: telemetry.stops }, {
			calls: 1, stops: [{ reason: 'permanentError', consecutiveFailures: 0, statusCode: 404 }],
		});
	}));

	test('disposal cancels recovery waits and prevents a late refresh from replacing credentials', () => runWithFakedTimers({ useFakeTimers: true, startTime: START_TIME }, async () => {
		const response = new DeferredPromise<CloudSandboxConnectResult>();
		const initialToken = tokenExpiringIn(0, START_TIME);
		const { refresher, credentials, creds, telemetry } = createRefresher(initialToken, () => response.p);
		const rejected = assert.rejects(refresher.ensureUnexpiredCredentials(), isCancellationError);
		refresher.dispose();
		await rejected;
		await response.complete({ kind: 'token', token: tokenExpiringIn(40, START_TIME, { access_token: 'late' }) });
		await timeout(60_000);
		await assert.rejects(refresher.ensureUnexpiredCredentials(), isCancellationError);

		assert.deepStrictEqual({
			calls: credentials.callCount, cancelled: credentials.requests[0].token.isCancellationRequested, token: creds.token, stops: telemetry.stops,
		}, {
			calls: 1, cancelled: true, token: initialToken, stops: [],
		});
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

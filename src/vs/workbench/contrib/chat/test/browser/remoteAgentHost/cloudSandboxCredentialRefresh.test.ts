/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
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
	CloudSandboxCredentialRefreshState,
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

/** A token expiring `minutes` from `from`. */
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

	/** Request credentials explicitly, respecting retry state until the attempt limit or a stop. */
	async function runRefresher(
		step: () => CloudSandboxConnectResult | Promise<CloudSandboxConnectResult>,
		attempts: number,
		initialToken = tokenExpiringIn(40, START_TIME),
	): Promise<{ calls: number; stops: RecordingTelemetry['stops']; creds: ICloudSandboxCreds }> {
		const telemetry = new RecordingTelemetry();
		const credentials = new ScriptedCredentialsService(step);
		const creds: ICloudSandboxCreds = { token: initialToken };
		const disposables = new DisposableStore();

		const state = new CloudSandboxCredentialRefreshState();
		const refresher = disposables.add(new CloudSandboxCredentialRefresher(
			'cloudsandbox:env_1',
			{ environmentId: 'env_1', sessionId: 'session-1' },
			'client-1',
			creds,
			state,
			credentials,
			telemetry,
			new NullLogService(),
		));

		try {
			for (let attempt = 0; attempt < attempts && !state.stopped; attempt++) {
				try {
					await refresher.refreshConnectionCredentials();
				} catch (error) {
					assert.ok(error instanceof Error);
					assert.match(error.message, /could not be refreshed|usable future expiry/);
				}
			}
			await timeout(12 * 60 * 60_000);
		} finally {
			disposables.dispose();
		}
		return { calls: credentials.callCount, stops: telemetry.stops, creds };
	}

	for (const expiresAt of [new Date(START_TIME + 120_000).toISOString(), '', 'not-a-date']) {
		test(`does not acquire credentials while idle through the refresh margin, expiry and multiple lifetimes: ${expiresAt}`, async () => {
			const clock = sinon.useFakeTimers({ now: START_TIME, toFake: ['Date', 'setTimeout', 'clearTimeout'] });
			const telemetry = new RecordingTelemetry();
			const credentials = new ScriptedCredentialsService(() => ({ kind: 'token', token: tokenExpiringIn(2, Date.now()) }));
			const initialToken = tokenExpiringIn(2, START_TIME, { expires_at: expiresAt });
			const creds = { token: initialToken };
			const state = new CloudSandboxCredentialRefreshState();
			const refresher = new CloudSandboxCredentialRefresher('cloudsandbox:env_1', { environmentId: 'env_1' }, 'client-1', creds, state, credentials, telemetry, new NullLogService());
			try {
				const snapshots = [];
				for (const elapsed of [60_000, 120_000, 600_000, 12 * 60 * 60_000]) {
					await clock.tickAsync(START_TIME + elapsed - Date.now());
					snapshots.push({ elapsed, calls: credentials.callCount, token: creds.token, stopped: state.stopped, failures: state.unhealthyCycles });
				}
				assert.deepStrictEqual({ snapshots, stops: telemetry.stops }, {
					snapshots: [60_000, 120_000, 600_000, 12 * 60 * 60_000].map(elapsed => ({ elapsed, calls: 0, token: initialToken, stopped: false, failures: 0 })),
					stops: [],
				});
			} finally {
				refresher.dispose();
				clock.restore();
			}
		});
	}

	test('a permanently rejected refresh stops at once, reporting the status', () => runWithFakedTimers<void>({ useFakeTimers: true, startTime: START_TIME }, async () => {
		const result = await runRefresher(() => Promise.reject(new CloudSandboxRequestError(404, 'environment gone')), MAX_CONSECUTIVE_CREDENTIAL_REFRESH_FAILURES);

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
		const result = await runRefresher(() => Promise.reject(new CloudSandboxRequestError(500, 'server error')), MAX_CONSECUTIVE_CREDENTIAL_REFRESH_FAILURES);

		assert.deepStrictEqual(
			{ calls: result.calls, stops: result.stops },
			{
				calls: 4,
				stops: [{ reason: 'consecutiveFailures', consecutiveFailures: 4, statusCode: 500 }],
			},
		);
	}));

	test('a success between failures resets the cap, so a flaky connection survives', () => runWithFakedTimers<void>({ useFakeTimers: true, startTime: START_TIME }, async () => {
		let call = 0;
		const result = await runRefresher(
			() => {
				call++;
				if (call === 3) {
					return { kind: 'token', token: tokenExpiringIn(40, Date.now()) };
				}
				return Promise.reject(new CloudSandboxRequestError(503, 'unavailable'));
			},
			2 * MAX_CONSECUTIVE_CREDENTIAL_REFRESH_FAILURES,
		);

		assert.deepStrictEqual(
			{ calls: result.calls, stops: result.stops },
			{
				calls: 7,
				stops: [{ reason: 'consecutiveFailures', consecutiveFailures: 4, statusCode: 503 }],
			},
		);
	}));

	for (const [status, code, expectedCalls, reason] of [
		[403, 'rate_limit_exceeded', 4, 'consecutiveFailures'],
		[500, 'internal_error', 3, 'consecutiveFailures'],
		[501, 'not_implemented', 1, 'permanentError'],
		[409, 'environment_compute_terminal', 1, 'permanentError'],
		[409, 'environment_compute_missing', 1, 'permanentError'],
		[409, 'environment_unreachable', 1, 'permanentError'],
		[403, 'forbidden', 1, 'permanentError'],
	] as const) {
		test(`bounds recovery for ${code} without confusing rate limits with access denials`, () => runWithFakedTimers({ useFakeTimers: true, startTime: START_TIME }, async () => {
			const result = await runRefresher(() => Promise.reject(new CloudSandboxRequestError(status, code, 5, { code })), 20);
			assert.deepStrictEqual({ calls: result.calls, stops: result.stops }, {
				calls: expectedCalls, stops: [{ reason, consecutiveFailures: reason === 'permanentError' ? 0 : expectedCalls, statusCode: status }],
			});
		}));
	}

	test('waking answers to on-demand /reconnect requests are bounded', () => runWithFakedTimers<void>({ useFakeTimers: true, startTime: START_TIME }, async () => {
		const result = await runRefresher(() => ({ kind: 'waking', waking: { retryAfterSeconds: 5 } }), MAX_CONSECUTIVE_CREDENTIAL_REFRESH_FAILURES);

		assert.deepStrictEqual(
			{ calls: result.calls, stops: result.stops },
			{
				calls: MAX_CONSECUTIVE_CREDENTIAL_REFRESH_FAILURES,
				stops: [{ reason: 'environmentWaking', consecutiveFailures: MAX_CONSECUTIVE_CREDENTIAL_REFRESH_FAILURES, statusCode: undefined }],
			},
		);
	}));

	test('on-demand acquisitions of already-expired tokens are bounded', () => runWithFakedTimers<void>({ useFakeTimers: true, startTime: START_TIME }, async () => {
		const result = await runRefresher(() => ({ kind: 'token', token: tokenExpiringIn(-5, Date.now()) }), MAX_CONSECUTIVE_CREDENTIAL_REFRESH_FAILURES);

		assert.deepStrictEqual(
			{ calls: result.calls, stops: result.stops },
			{
				calls: MAX_CONSECUTIVE_CREDENTIAL_REFRESH_FAILURES,
				stops: [{ reason: 'unusableToken', consecutiveFailures: MAX_CONSECUTIVE_CREDENTIAL_REFRESH_FAILURES, statusCode: undefined }],
			},
		);
	}));

	test('on-demand acquisitions with no usable expiry are bounded', () => runWithFakedTimers<void>({ useFakeTimers: true, startTime: START_TIME }, async () => {
		const result = await runRefresher(() => ({ kind: 'token', token: tokenExpiringIn(40, Date.now(), { expires_at: 'not-a-date' }) }), MAX_CONSECUTIVE_CREDENTIAL_REFRESH_FAILURES);

		assert.deepStrictEqual(
			{ calls: result.calls, stops: result.stops },
			{
				calls: MAX_CONSECUTIVE_CREDENTIAL_REFRESH_FAILURES,
				stops: [{ reason: 'unusableToken', consecutiveFailures: MAX_CONSECUTIVE_CREDENTIAL_REFRESH_FAILURES, statusCode: undefined }],
			},
		);
	}));

	test('request cancellation is not reported as a credential failure', () => runWithFakedTimers<void>({ useFakeTimers: true, startTime: START_TIME }, async () => {
		// Disposing cancels the in-flight request, so the refresh rejects with a cancellation. That
		// is an ordinary teardown, and must not be counted or reported as the loop giving up.
		const telemetry = new RecordingTelemetry();
		const credentials = new ScriptedCredentialsService(() => Promise.reject(new CancellationError()));
		const creds: ICloudSandboxCreds = { token: tokenExpiringIn(40, START_TIME) };
		const disposables = new DisposableStore();

		const refresher = disposables.add(new CloudSandboxCredentialRefresher(
			'cloudsandbox:env_1',
			{ environmentId: 'env_1', sessionId: 'session-1' },
			'client-1',
			creds,
			new CloudSandboxCredentialRefreshState(),
			credentials,
			telemetry,
			new NullLogService(),
		));

		await assert.rejects(refresher.refreshConnectionCredentials(), /could not be refreshed/);
		const callsBeforeDispose = credentials.callCount;
		disposables.dispose();
		await new Promise<void>(resolve => setTimeout(resolve, 12 * 60 * 60_000));

		assert.deepStrictEqual(
			{ callsBeforeDispose, callsAfterDispose: credentials.callCount, stops: telemetry.stops },
			{ callsBeforeDispose: 1, callsAfterDispose: 1, stops: [] },
		);
	}));

	test('a late on-demand refresh cannot replace a newer host-recovery credential', () => runWithFakedTimers<void>({ useFakeTimers: true, startTime: START_TIME }, async () => {
		const response = new DeferredPromise<CloudSandboxConnectResult>();
		const started = new DeferredPromise<void>();
		const creds: ICloudSandboxCreds = { token: tokenExpiringIn(2, START_TIME) };
		const replacement = tokenExpiringIn(40, START_TIME, { access_token: 'recovery-token', host_encryption_key: REPLACEMENT_HOST_KEY });
		const telemetry = new RecordingTelemetry();
		const api = new class extends mock<ICloudSandboxApiService>() {
			override reconnect(): Promise<CloudSandboxConnectResult> {
				started.complete();
				return response.p;
			}
		}();
		const owner = new DisposableStore();
		try {
			const refresher = owner.add(new CloudSandboxCredentialRefresher('cloudsandbox:env_1', { environmentId: 'env_1' }, 'client-1', creds, new CloudSandboxCredentialRefreshState(), api, telemetry, new NullLogService()));
			const refreshing = refresher.refreshConnectionCredentials();
			await started.p;
			creds.token = replacement;
			response.complete({ kind: 'token', token: tokenExpiringIn(40, START_TIME, { access_token: 'stale-token' }) });
			await refreshing;
			await timeout(12 * 60 * 60_000);
			assert.strictEqual(creds.token, replacement);
			assert.deepStrictEqual(telemetry.stops, []);
		} finally {
			owner.dispose();
		}
	}));

	test('a refreshed token without a sealed GitHub token keeps the previous one', () => runWithFakedTimers<void>({ useFakeTimers: true, startTime: START_TIME }, async () => {
		const result = await runRefresher(
			() => ({ kind: 'token', token: tokenExpiringIn(40, Date.now(), { access_token: 'fresh' }) }),
			1,
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
				1,
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
			1,
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
				1,
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
			2,
			tokenExpiringIn(40, START_TIME, { encrypted_github_token: SEALED_TOKEN, host_encryption_key: HOST_KEY }),
		);

		assert.deepStrictEqual({ ...result, callTimes }, {
			calls: 2,
			stops: [],
			creds: { token: refreshed },
			callTimes: [0, 30_000],
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
			MAX_CONSECUTIVE_CREDENTIAL_REFRESH_FAILURES,
			initialToken,
		);

		assert.deepStrictEqual({ ...result, callTimes }, {
			calls: MAX_CONSECUTIVE_CREDENTIAL_REFRESH_FAILURES,
			stops: [{ reason: 'unusableToken', consecutiveFailures: MAX_CONSECUTIVE_CREDENTIAL_REFRESH_FAILURES, statusCode: undefined }],
			creds: { token: initialToken },
			callTimes: Array.from({ length: MAX_CONSECUTIVE_CREDENTIAL_REFRESH_FAILURES }, (_, index) => index * 30_000),
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
			new CloudSandboxCredentialRefreshState(),
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

	test('does not wait for an authentication refresh while the cached admission token is still valid', () => runWithFakedTimers({ useFakeTimers: true, startTime: START_TIME }, async () => {
		const response = new DeferredPromise<CloudSandboxConnectResult>();
		const initialToken = tokenExpiringIn(1, START_TIME);
		const { refresher, credentials, creds } = createRefresher(initialToken, () => response.p);
		const refreshing = assert.rejects(refresher.refreshAuthenticationCredentials(), isCancellationError);
		await refresher.ensureUnexpiredCredentials();
		const tokenWhileRefreshing = creds.token;
		refresher.dispose();
		await refreshing;
		await response.complete({ kind: 'token', token: tokenExpiringIn(40, Date.now()) });

		assert.deepStrictEqual({ calls: credentials.callCount, tokenWhileRefreshing }, { calls: 1, tokenWhileRefreshing: initialToken });
	}));

	test('repairs connection setup with a scoped refresh despite a valid expiry', () => runWithFakedTimers({ useFakeTimers: true, startTime: START_TIME }, async () => {
		const { refresher, credentials, creds } = createRefresher(
			tokenExpiringIn(40, START_TIME),
			() => ({ kind: 'token', token: tokenExpiringIn(40, Date.now(), { access_token: 'refreshed' }) }),
		);
		await refresher.refreshConnectionCredentials();
		refresher.dispose();

		assert.deepStrictEqual({
			token: creds.token.access_token,
			requests: credentials.requests.map(({ request, clientId }) => ({ request, clientId })),
		}, {
			token: 'refreshed',
			requests: [{ request: { environmentId: 'env_1', sessionId: 'session-1' }, clientId: 'client-1' }],
		});
	}));

	test('connection repairs share an on-demand request even while cached credentials are valid', () => runWithFakedTimers({ useFakeTimers: true, startTime: START_TIME }, async () => {
		const response = new DeferredPromise<CloudSandboxConnectResult>();
		const { refresher, credentials, creds } = createRefresher(tokenExpiringIn(1, START_TIME), () => response.p);
		const first = refresher.refreshConnectionCredentials();
		const second = refresher.refreshConnectionCredentials();
		await response.complete({ kind: 'token', token: tokenExpiringIn(40, Date.now(), { access_token: 'shared' }) });
		await Promise.all([first, second]);
		refresher.dispose();

		assert.deepStrictEqual({ calls: credentials.callCount, token: creds.token.access_token }, { calls: 1, token: 'shared' });
	}));

	test('connection repair waits for retry-after without an unattended retry', async () => {
		const clock = sinon.useFakeTimers({ now: START_TIME, toFake: ['Date', 'setTimeout', 'clearTimeout'] });
		try {
			const response = new DeferredPromise<CloudSandboxConnectResult>();
			let requests = 0;
			const { refresher, credentials, creds } = createRefresher(tokenExpiringIn(0, START_TIME), () => {
				if (++requests === 1) {
					throw new CloudSandboxRequestError(429, 'rate limited', 45);
				}
				return response.p;
			});
			await assert.rejects(refresher.refreshConnectionCredentials(), /usable future expiry/);
			let outcome = 'pending';
			const recovery = refresher.refreshConnectionCredentials().then(() => { outcome = 'ready'; }, () => { outcome = 'rejected'; });
			await clock.tickAsync(44_999);
			const beforeRetry = { outcome, calls: credentials.callCount };
			await clock.tickAsync(1);
			await response.complete({ kind: 'token', token: tokenExpiringIn(40, Date.now(), { access_token: 'shared' }) });
			await recovery;
			assert.deepStrictEqual({ beforeRetry, outcome, calls: credentials.callCount, token: creds.token.access_token }, {
				beforeRetry: { outcome: 'pending', calls: 1 }, outcome: 'ready', calls: 2, token: 'shared',
			});
			refresher.dispose();
		} finally {
			clock.restore();
		}
	});

	test('concurrent retry waits can use a newly refreshed short-lived ticket', () => runWithFakedTimers({ useFakeTimers: true, startTime: START_TIME }, async () => {
		let requests = 0;
		const { refresher, credentials, creds } = createRefresher(tokenExpiringIn(0, START_TIME), () => {
			if (++requests === 1) {
				throw new CloudSandboxRequestError(503, 'unavailable');
			}
			return { kind: 'token', token: tokenExpiringIn(0.5, Date.now(), { access_token: 'fresh' }) };
		});
		await assert.rejects(refresher.refreshConnectionCredentials(), /usable future expiry/);
		const first = refresher.refreshConnectionCredentials();
		const second = refresher.refreshConnectionCredentials();
		await timeout(30_000);
		await Promise.all([first, second]);
		refresher.dispose();
		assert.deepStrictEqual({ calls: credentials.callCount, token: creds.token.access_token }, { calls: 2, token: 'fresh' });
	}));

	for (const { name, step } of [
		{ name: 'transient rejection', step: () => Promise.reject(new CloudSandboxRequestError(503, 'unavailable')) },
		{ name: 'permanent rejection', step: () => Promise.reject(new CloudSandboxRequestError(403, 'forbidden')) },
		{ name: 'waking', step: () => ({ kind: 'waking', waking: { retryAfterSeconds: 5 } }) },
		{ name: 'invalid expiry', step: () => ({ kind: 'token', token: tokenExpiringIn(40, START_TIME, { expires_at: 'invalid' }) }) },
		{ name: 'inconsistent host key', step: () => ({ kind: 'token', token: tokenExpiringIn(40, START_TIME, { host_encryption_key: REPLACEMENT_HOST_KEY }) }) },
	] satisfies { name: string; step: () => CloudSandboxConnectResult | Promise<CloudSandboxConnectResult> }[]) {
		test(`does not mistake cached valid credentials for a successful connection repair after ${name}`, () => runWithFakedTimers({ useFakeTimers: true, startTime: START_TIME }, async () => {
			const { refresher, credentials } = createRefresher(
				tokenExpiringIn(40, START_TIME, { encrypted_github_token: SEALED_TOKEN, host_encryption_key: HOST_KEY }),
				step,
			);
			await assert.rejects(refresher.refreshConnectionCredentials(), /could not be refreshed|usable future expiry/);
			if (name === 'permanent rejection') {
				await assert.rejects(refresher.refreshConnectionCredentials(), /stopped/);
			} else {
				const cancelled = assert.rejects(refresher.refreshConnectionCredentials(), isCancellationError);
				refresher.dispose();
				await cancelled;
			}
			refresher.dispose();
			assert.strictEqual(credentials.callCount, 1);
		}));
	}

	test('rate limits repeated successful connection repairs', () => runWithFakedTimers({ useFakeTimers: true, startTime: START_TIME }, async () => {
		const { refresher, credentials } = createRefresher(
			tokenExpiringIn(40, START_TIME),
			() => ({ kind: 'token', token: tokenExpiringIn(40, Date.now()) }),
		);
		await refresher.refreshConnectionCredentials();
		await timeout(29_999);
		const recovery = refresher.refreshConnectionCredentials();
		const beforeDeadline = credentials.callCount;
		await timeout(1);
		await recovery;
		refresher.dispose();

		assert.deepStrictEqual({ beforeDeadline, calls: credentials.callCount }, { beforeDeadline: 1, calls: 2 });
	}));

	for (const retryAfterSeconds of [45, 7_200]) {
		for (const response of ['rate limited', 'waking'] as const) {
			test(`does not shorten a ${retryAfterSeconds}-second ${response} response`, () => runWithFakedTimers({ useFakeTimers: true, startTime: START_TIME }, async () => {
				let requests = 0;
				const { refresher, credentials } = createRefresher(tokenExpiringIn(0, START_TIME), () => {
					if (++requests === 1) {
						if (response === 'rate limited') {
							throw new CloudSandboxRequestError(429, 'rate limited', retryAfterSeconds);
						}
						return { kind: 'waking', waking: { retryAfterSeconds } };
					}
					return { kind: 'token', token: tokenExpiringIn(40, Date.now()) };
				});
				await assert.rejects(refresher.ensureUnexpiredCredentials(), /usable future expiry/);
				if (response === 'rate limited' && retryAfterSeconds > 120) {
					await timeout(retryAfterSeconds * 1000);
					await assert.rejects(refresher.ensureUnexpiredCredentials(), /stopped/);
					refresher.dispose();
					assert.strictEqual(credentials.callCount, 1);
					return;
				}
				await timeout(retryAfterSeconds * 1000 - 1);
				const recovery = refresher.ensureUnexpiredCredentials();
				const callsBeforeDeadline = credentials.callCount;
				await timeout(1);
				await recovery;
				refresher.dispose();
				assert.deepStrictEqual({ callsBeforeDeadline, calls: credentials.callCount }, { callsBeforeDeadline: 1, calls: 2 });
			}));
		}
	}

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

	for (const repairFirst of [false, true]) {
		test(`shares ${repairFirst ? 'a connection repair' : 'an expired-ticket acquisition'} across concurrent reconnect waits`, () => runWithFakedTimers({ useFakeTimers: true, startTime: START_TIME }, async () => {
			const response = new DeferredPromise<CloudSandboxConnectResult>();
			const { refresher, credentials, creds } = createRefresher(tokenExpiringIn(0, START_TIME), () => response.p);
			const first = repairFirst ? refresher.refreshConnectionCredentials() : refresher.ensureUnexpiredCredentials();
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
		for (let attempt = 0; attempt < 4; attempt++) {
			await assert.rejects(refresher.ensureUnexpiredCredentials(), /usable future expiry/);
		}
		await timeout(12 * 60 * 60_000);
		await assert.rejects(refresher.ensureUnexpiredCredentials(), /stopped/);
		refresher.dispose();

		assert.deepStrictEqual({ calls: credentials.callCount, stops: telemetry.stops }, {
			calls: 4,
			stops: [{ reason: 'consecutiveFailures', consecutiveFailures: 4, statusCode: 503 }],
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
			const cancelled = assert.rejects(refresher.ensureUnexpiredCredentials(), isCancellationError);
			refresher.dispose();
			await cancelled;

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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { ConnectConfig } from 'ssh2';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { NullLogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { isSSHHostKeyDeniedError, SSHAuthMethod, type ISSHAgentHostConfig, type ISSHHostKeyVerificationRequest } from '../../common/sshRemoteAgentHost.js';
import { SSHRemoteAgentHostMainService, type SSHAuthAttempt } from '../../node/sshRemoteAgentHostService.js';
import { computeHostKeyFingerprint, parseKnownHosts, type IKnownHostsEntry } from '../../node/sshKnownHosts.js';

/** Build a syntactically valid SSH wire-format public key blob. */
function makeKeyBlob(keyType: string, material: Buffer): Buffer {
	const type = Buffer.from(keyType, 'ascii');
	const header = Buffer.alloc(4);
	header.writeUInt32BE(type.length, 0);
	const body = Buffer.alloc(4);
	body.writeUInt32BE(material.length, 0);
	return Buffer.concat([header, type, body, material]);
}

const HOST_KEY = makeKeyBlob('ssh-ed25519', Buffer.alloc(32, 0xaa));

/**
 * Mock client that drives only the host key verification path: on `connect` it
 * invokes `hostVerifier` and records the verdict, without attempting auth.
 */
class HostKeyMockSSHClient {
	ended = false;
	/** The verdict `hostVerifier` produced, once it settles. */
	verdict: boolean | undefined;
	verdictCount = 0;
	/** The `readyTimeout` ssh2 was configured with for this attempt. */
	readyTimeout: number | undefined;
	/**
	 * When set, the connection is not driven to ready/error by the verdict, so
	 * a test can control what happens while verification is still pending.
	 */
	deferVerification = false;

	/** Resolves once ssh2 has entered `hostVerifier` for this connection. */
	readonly verifierEntered: Promise<void>;
	private _verifierEntered!: () => void;

	private readonly _errorListeners: Array<(err: Error) => void> = [];
	private readonly _readyListeners: Array<() => void> = [];
	private readonly _hostKeysListeners: Array<(keys: readonly { getPublicSSH(): Buffer; type: string }[]) => void> = [];

	constructor() {
		this.verifierEntered = new Promise<void>(resolve => { this._verifierEntered = resolve; });
	}

	on(event: string, listener: (...args: never[]) => void): this {
		if (event === 'error') {
			this._errorListeners.push(listener as (err: Error) => void);
		} else if (event === 'ready') {
			this._readyListeners.push(listener as () => void);
		} else if (event === 'hostkeys') {
			this._hostKeysListeners.push(listener as (keys: readonly { getPublicSSH(): Buffer; type: string }[]) => void);
		}
		return this;
	}

	removeListener(_event: string, _listener: (...args: never[]) => void): this {
		return this;
	}

	/** ssh2's auth callback, so tests can drive the interactive prompt paths. */
	authHandler: ((methodsLeft: string[] | null, partialSuccess: boolean, cb: (next: unknown) => void) => void) | undefined;

	connect(config: ConnectConfig): void {
		this.readyTimeout = config.readyTimeout;
		this.authHandler = config.authHandler as unknown as typeof this.authHandler;
		const hostVerifier = config.hostVerifier as ((key: Buffer, verify: (permitted: boolean) => void) => void) | undefined;
		assert.ok(hostVerifier, 'hostVerifier must be installed — without it ssh2 accepts any host key');
		this._verifierEntered();
		hostVerifier(HOST_KEY, permitted => {
			this.verdictCount++;
			this.verdict = permitted;
			if (this.deferVerification) {
				return;
			}
			if (permitted) {
				this._readyListeners.forEach(l => l());
			} else {
				this.fireError(new Error('Host denied (verification failed)'));
			}
		});
	}

	announceHostKeys(keys: readonly { getPublicSSH(): Buffer; type: string }[]): void {
		this._hostKeysListeners.forEach(l => l(keys));
	}

	fireError(err: Error): void {
		this._errorListeners.forEach(l => l(err));
	}

	end(): void {
		this.ended = true;
	}
}

class HostKeyTestService extends SSHRemoteAgentHostMainService {
	readonly client = new HostKeyMockSSHClient();
	knownHostsContents = '';
	/** Set to make the known_hosts read throw, exercising the fail-closed path. */
	knownHostsError: Error | undefined;
	/**
	 * When set, the known_hosts read blocks on this promise, so a test can
	 * make the connection die while evidence gathering is still in flight.
	 */
	knownHostsGate: Promise<void> | undefined;

	protected override async _createSSHClient() {
		return this.client as never;
	}

	/** Auth attempts to offer; set to exercise the interactive prompt paths. */
	authAttempts: SSHAuthAttempt[] = [];

	protected override async _buildAuthAttempts(_config: ISSHAgentHostConfig): Promise<SSHAuthAttempt[]> {
		return this.authAttempts;
	}

	protected override async _readKnownHostsEntries(_host: string): Promise<{ entries: IKnownHostsEntry[]; strictHostKeyChecking: undefined }> {
		if (this.knownHostsGate) {
			await this.knownHostsGate;
		}
		if (this.knownHostsError) {
			throw this.knownHostsError;
		}
		return { entries: parseKnownHosts(this.knownHostsContents), strictHostKeyChecking: undefined };
	}

	/** Expose the pending-request map so tests can assert nothing is leaked. */
	get pendingHostKeyRequestCount(): number {
		return this['_pendingHostKeyRequests'].size;
	}

	/** Every deadline armed during the connect, in order. */
	readonly deadlineHistory: number[] = [];
	/** The currently armed deadline, or undefined when no timer is running. */
	currentDeadlineMs: number | undefined;

	protected override _armHandshakeDeadline(ms: number, onExpired: () => void): ReturnType<typeof setTimeout> {
		this.deadlineHistory.push(ms);
		this.currentDeadlineMs = ms;
		return super._armHandshakeDeadline(ms, onExpired);
	}

	protected override _clearHandshakeDeadline(timer: ReturnType<typeof setTimeout> | undefined): void {
		this.currentDeadlineMs = undefined;
		super._clearHandshakeDeadline(timer);
	}

	connectSSHForTest(config: ISSHAgentHostConfig) {
		return this._connectSSH(config, 'ssh:test-host');
	}
}

function makeConfig(overrides?: Partial<ISSHAgentHostConfig>): ISSHAgentHostConfig {
	return {
		host: 'test.example.com',
		username: 'testuser',
		authMethod: SSHAuthMethod.Agent,
		name: 'Test Host',
		sshConfigHost: 'test-host',
		...overrides,
	};
}

suite('SSHRemoteAgentHostMainService - host key verification', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(): HostKeyTestService {
		const productService: Pick<IProductService, '_serviceBrand' | 'quality' | 'dataFolderName'> = {
			_serviceBrand: undefined,
			quality: 'stable',
			dataFolderName: '.vscode-oss',
		};
		return disposables.add(new HostKeyTestService(new NullLogService(), productService as IProductService, NullTelemetryService));
	}

	/** Run a connect attempt, answering the verification request with `trusted`. */
	async function connectAnswering(service: HostKeyTestService, trusted: boolean, config = makeConfig()) {
		const requests: ISSHHostKeyVerificationRequest[] = [];
		const store = new DisposableStore();
		store.add(service.onDidRequestHostKeyVerification(request => {
			requests.push(request);
			void service.respondHostKeyVerification(request.requestId, trusted);
		}));
		try {
			let error: unknown;
			const result = await service.connectSSHForTest(config).then(() => 'resolved', err => {
				error = err;
				return `rejected: ${err.message}`;
			});
			return { requests, result, error };
		} finally {
			store.dispose();
		}
	}

	test('installs hostVerifier and reports the key to the renderer', async () => {
		const service = createService();
		const { requests, result } = await connectAnswering(service, true);

		assert.deepStrictEqual(
			{
				requestCount: requests.length,
				keyType: requests[0]?.keyType,
				fingerprint: requests[0]?.fingerprint,
				host: requests[0]?.host,
				port: requests[0]?.port,
				knownHostsMatch: requests[0]?.knownHostsMatch,
				userInitiated: requests[0]?.userInitiated,
				verdict: service.client.verdict,
				result,
			},
			{
				requestCount: 1,
				keyType: 'ssh-ed25519',
				fingerprint: computeHostKeyFingerprint(HOST_KEY),
				host: 'test.example.com',
				port: 22,
				knownHostsMatch: 'unknown',
				userInitiated: true,
				verdict: true,
				result: 'resolved',
			});
	});

	test('declining fails the connection with a clean host key error', async () => {
		// ssh2 reports this as "Host denied (verification failed)". That is
		// jargon, and the host key UI has already explained what happened, so
		// the connect attempt surfaces a recognizable error instead.
		const service = createService();
		const { result, error } = await connectAnswering(service, false);

		assert.deepStrictEqual(
			{
				verdict: service.client.verdict,
				result,
				denied: isSSHHostKeyDeniedError(error),
			},
			{
				verdict: false,
				result: 'rejected: Host key verification failed for test-host',
				denied: true,
			});
	});

	test('reports the known_hosts verdict for a matching entry', async () => {
		const service = createService();
		service.knownHostsContents = `test.example.com ssh-ed25519 ${HOST_KEY.toString('base64')}`;
		const { requests } = await connectAnswering(service, true);
		assert.strictEqual(requests[0]?.knownHostsMatch, 'match');
	});

	test('reports a mismatch when known_hosts holds a different key', async () => {
		const service = createService();
		const other = makeKeyBlob('ssh-ed25519', Buffer.alloc(32, 0xbb));
		service.knownHostsContents = `test.example.com ssh-ed25519 ${other.toString('base64')}`;
		const { requests } = await connectAnswering(service, false);
		assert.strictEqual(requests[0]?.knownHostsMatch, 'mismatch');
	});

	test('forwards userInitiated so background reconnects can be declined', async () => {
		const service = createService();
		const { requests } = await connectAnswering(service, false, makeConfig({ userInitiated: false }));
		assert.strictEqual(requests[0]?.userInitiated, false);
	});

	test('bounds the handshake, and only widens it while a prompt is outstanding', async () => {
		// ssh2's own readyTimeout is disabled because it keeps running while
		// hostVerifier waits on a human. We arm the short network deadline up
		// front, widen it only for the interval a prompt is actually
		// outstanding, and restore it once the verdict arrives — so a user
		// gets time to compare a fingerprint without an unreachable host
		// taking minutes to fail.
		const service = createService();
		const observed: number[] = [];
		const store = new DisposableStore();
		store.add(service.onDidRequestHostKeyVerification(request => {
			observed.push(service.currentDeadlineMs!);
			void service.respondHostKeyVerification(request.requestId, true);
		}));
		await service.connectSSHForTest(makeConfig());
		store.dispose();

		assert.deepStrictEqual(
			{
				ssh2TimerDisabled: service.client.readyTimeout,
				armedBeforeConnect: service.deadlineHistory[0],
				whilePrompting: observed[0],
				// Cleared once the connect settles — no timer left running.
				afterSettle: service.currentDeadlineMs,
			},
			{ ssh2TimerDisabled: 0, armedBeforeConnect: 30_000, whilePrompting: 300_000, afterSettle: undefined });
	});

	test('widens the deadline for the password prompt too, not just the host key dialog', async () => {
		// The interactive window must bracket *every* human prompt. A user
		// typing a password is no faster than one comparing a fingerprint, and
		// holding them to the 30s network deadline would abort the connection
		// out from under them.
		const service = createService();
		service.authAttempts = [{ type: 'keyboard-interactive', username: 'test' }];
		service.client.deferVerification = true;

		const store = new DisposableStore();
		store.add(service.onDidRequestHostKeyVerification(request => {
			void service.respondHostKeyVerification(request.requestId, true);
		}));

		let whilePrompting: number | undefined;
		const prompted = new Promise<void>(resolve => {
			store.add(service.onDidRequestKeyboardInteractive(request => {
				whilePrompting = service.currentDeadlineMs;
				void service.respondKeyboardInteractive(request.requestId, ['hunter2']);
				resolve();
			}));
		});

		const connectPromise = service.connectSSHForTest(makeConfig());
		await service.client.verifierEntered;
		// Drive ssh2's auth flow the way the real client would: ask for the
		// next method, then invoke that method's `prompt` callback.
		service.client.authHandler?.(['keyboard-interactive'], false, next => {
			const method = next as { prompt: (name: string, instructions: string, lang: string, prompts: readonly { prompt: string; echo?: boolean }[], finish: (responses: string[]) => void) => void };
			method.prompt('', '', '', [{ prompt: 'Password:', echo: false }], () => { });
		});
		await prompted;
		const afterAnswering = service.currentDeadlineMs;

		// Settle the connect so its deadline timer is cleared. Leaving it armed
		// would fire ~30s later, long after this test finished, and surface as
		// an unexpected error in whichever suite happened to be running.
		service.client.fireError(new Error('Connection lost'));
		await connectPromise.catch(() => undefined);
		store.dispose();

		assert.deepStrictEqual(
			{ whilePrompting, afterAnswering },
			{ whilePrompting: 300_000, afterAnswering: 30_000 });
	});

	test('a connection that dies during evidence gathering leaves nothing pending', async () => {
		// `_verifyHostKey` awaits the known_hosts read, so the connection can
		// die before the request is ever registered for cancellation. If that
		// window isn't handled, we leak a pending entry forever and pop a
		// dialog for a connection that is already gone.
		const service = createService();
		let openGate = () => { };
		service.knownHostsGate = new Promise<void>(resolve => { openGate = resolve; });

		const requests: ISSHHostKeyVerificationRequest[] = [];
		const store = new DisposableStore();
		store.add(service.onDidRequestHostKeyVerification(request => requests.push(request)));

		const connectPromise = service.connectSSHForTest(makeConfig());
		// Wait until ssh2 has actually entered hostVerifier and blocked inside
		// the known_hosts read, then kill the connection underneath it.
		await service.client.verifierEntered;
		service.client.fireError(new Error('Connection lost'));
		const result = await connectPromise.then(() => 'resolved', err => `rejected: ${err.message}`);

		// Now release the read: verification resumes on a dead connection.
		openGate();
		await new Promise(resolve => setTimeout(resolve, 10));
		store.dispose();

		assert.deepStrictEqual(
			{
				result,
				// No orphaned prompt, and no leaked map entry.
				requestCount: requests.length,
				pending: service.pendingHostKeyRequestCount,
				verdict: service.client.verdict,
			},
			{ result: 'rejected: Connection lost', requestCount: 0, pending: 0, verdict: false });
	});

	test('fails closed when gathering evidence throws', async () => {
		// A transient error must never become a way to reach a server without
		// verification, so no request is raised and the key is refused.
		const service = createService();
		service.knownHostsError = new Error('boom');
		const requests: ISSHHostKeyVerificationRequest[] = [];
		const store = new DisposableStore();
		store.add(service.onDidRequestHostKeyVerification(request => requests.push(request)));
		const result = await service.connectSSHForTest(makeConfig()).then(() => 'resolved', err => `rejected: ${err.message}`);
		store.dispose();

		assert.deepStrictEqual(
			{ requestCount: requests.length, verdict: service.client.verdict, result },
			{ requestCount: 0, verdict: false, result: 'rejected: Host denied (verification failed)' });
	});

	test('cancelling an in-flight verification denies rather than hanging', async () => {
		// If the connection drops while we're still waiting on a verdict, ssh2
		// must still be told "no" — otherwise the handshake stalls until
		// readyTimeout elapses, and the renderer's prompt is left orphaned.
		const service = createService();
		service.client.deferVerification = true;

		const cancelled: string[] = [];
		const requests: ISSHHostKeyVerificationRequest[] = [];
		const store = new DisposableStore();
		store.add(service.onDidCancelHostKeyVerification(requestId => cancelled.push(requestId)));
		store.add(service.onDidRequestHostKeyVerification(request => {
			requests.push(request);
			// Simulate the connection dying while the user is still deciding.
			service.client.fireError(new Error('Connection lost'));
		}));

		const result = await service.connectSSHForTest(makeConfig()).then(() => 'resolved', err => `rejected: ${err.message}`);
		store.dispose();

		assert.deepStrictEqual(
			{
				result,
				cancelled: cancelled.length === 1 && cancelled[0] === requests[0]?.requestId,
				verdict: service.client.verdict,
				verdictCount: service.client.verdictCount,
			},
			{ result: 'rejected: Connection lost', cancelled: true, verdict: false, verdictCount: 1 });
	});

	test('surfaces proven announced host keys', async () => {
		const service = createService();
		const announcements: { host: string; keys: readonly { keyType: string; fingerprint: string }[] }[] = [];
		const store = new DisposableStore();
		store.add(service.onDidAnnounceHostKeys(a => announcements.push({ host: a.host, keys: a.keys })));
		await connectAnswering(service, true);

		const rotated = makeKeyBlob('ssh-ed25519', Buffer.alloc(32, 0xcc));
		service.client.announceHostKeys([
			{ getPublicSSH: () => rotated, type: 'ssh-ed25519' },
			// A certificate: ssh2 misparses these (it returns the cert's nonce
			// as the key material), so the blob's embedded type disagrees with
			// the declared type and it must be skipped rather than trusted.
			{ getPublicSSH: () => makeKeyBlob('ssh-ed25519', Buffer.alloc(32, 0xdd)), type: 'ssh-ed25519-cert-v01@openssh.com' },
		]);
		store.dispose();

		assert.deepStrictEqual(announcements, [{
			host: 'test.example.com',
			keys: [{ keyType: 'ssh-ed25519', fingerprint: computeHostKeyFingerprint(rotated) }],
		}]);
	});
});

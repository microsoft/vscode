/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { ConnectConfig } from 'ssh2';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { NullLogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { SSHAuthMethod, type ISSHAgentHostConfig, type ISSHHostKeyVerificationRequest } from '../../common/sshRemoteAgentHost.js';
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
	/**
	 * When set, the connection is not driven to ready/error by the verdict, so
	 * a test can control what happens while verification is still pending.
	 */
	deferVerification = false;

	private readonly _errorListeners: Array<(err: Error) => void> = [];
	private readonly _readyListeners: Array<() => void> = [];
	private readonly _hostKeysListeners: Array<(keys: readonly { getPublicSSH(): Buffer; type: string }[]) => void> = [];

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

	connect(config: ConnectConfig): void {
		const hostVerifier = config.hostVerifier as ((key: Buffer, verify: (permitted: boolean) => void) => void) | undefined;
		assert.ok(hostVerifier, 'hostVerifier must be installed — without it ssh2 accepts any host key');
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

	protected override async _createSSHClient() {
		return this.client as never;
	}

	protected override async _buildAuthAttempts(_config: ISSHAgentHostConfig): Promise<SSHAuthAttempt[]> {
		return [];
	}

	protected override async _readKnownHostsEntries(_host: string): Promise<{ entries: IKnownHostsEntry[]; strictHostKeyChecking: undefined }> {
		if (this.knownHostsError) {
			throw this.knownHostsError;
		}
		return { entries: parseKnownHosts(this.knownHostsContents), strictHostKeyChecking: undefined };
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
		return disposables.add(new HostKeyTestService(new NullLogService(), productService as IProductService));
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
			const result = await service.connectSSHForTest(config).then(() => 'resolved', err => `rejected: ${err.message}`);
			return { requests, result };
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

	test('declining fails the connection before authentication', async () => {
		const service = createService();
		const { result } = await connectAnswering(service, false);

		assert.deepStrictEqual(
			{ verdict: service.client.verdict, result },
			{ verdict: false, result: 'rejected: Host denied (verification failed)' });
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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import * as net from 'net';
import * as fs from 'fs';
import { CredentialBroker } from '../src/auth/CredentialBroker';
import { BrokerServer } from '../src/auth/BrokerServer';
import type { SecretStore, TokenRecord, ProviderConfig } from '../src/auth/types';

// ── Fakes ─────────────────────────────────────────────────────────────────────

class FakeSecretStore implements SecretStore {
	private readonly data = new Map<string, string>();

	get(key: string): Promise<string | undefined> {
		return Promise.resolve(this.data.get(key));
	}

	store(key: string, value: string): Promise<void> {
		this.data.set(key, value);
		return Promise.resolve();
	}

	delete(key: string): Promise<void> {
		this.data.delete(key);
		return Promise.resolve();
	}
}

const FAKE_PROVIDER: ProviderConfig = {
	id: 'test-provider',
	displayName: 'Test Provider',
	authorizationEndpoint: 'https://example.com/oauth/authorize',
	tokenEndpoint: 'https://example.com/oauth/token',
	clientId: 'test-client-id',
	scopes: ['read', 'write'],
};

function makeToken(overrides: Partial<TokenRecord> = {}): TokenRecord {
	return {
		token: 'tok-abc',
		refreshToken: 'rtok-xyz',
		expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour from now
		...overrides,
	};
}

function makeBroker(store?: SecretStore): CredentialBroker {
	return new CredentialBroker(store ?? new FakeSecretStore(), () => Promise.resolve(true));
}

// ── CredentialBroker unit tests ───────────────────────────────────────────────

suite('CredentialBroker', () => {
	test('getToken returns cached token when not near expiry', async () => {
		const broker = makeBroker();
		broker.registerProvider(FAKE_PROVIDER);

		const token = makeToken();
		// Seed the cache by going through storage
		const store = new FakeSecretStore();
		await store.store('son-of-anton.broker.token.test-provider', JSON.stringify(token));

		const broker2 = new CredentialBroker(store, () => Promise.resolve(true));
		broker2.registerProvider(FAKE_PROVIDER);

		const result = await broker2.getToken('test-provider');
		assert.deepStrictEqual(result, token);
	});

	test('getToken throws when no credentials exist', async () => {
		const broker = makeBroker();
		broker.registerProvider(FAKE_PROVIDER);

		await assert.rejects(
			() => broker.getToken('test-provider'),
			/No credentials stored for provider: test-provider/,
		);
	});

	test('getToken loads from SecretStore on cache miss', async () => {
		const store = new FakeSecretStore();
		const token = makeToken();
		await store.store('son-of-anton.broker.token.test-provider', JSON.stringify(token));

		const broker = new CredentialBroker(store, () => Promise.resolve(true));
		broker.registerProvider(FAKE_PROVIDER);

		const result = await broker.getToken('test-provider');
		assert.deepStrictEqual(result, token);
	});

	test('invalidate marks the token as expired without removing the refresh token', async () => {
		const store = new FakeSecretStore();
		const token = makeToken();
		await store.store('son-of-anton.broker.token.test-provider', JSON.stringify(token));

		const broker = new CredentialBroker(store, () => Promise.resolve(true));
		broker.registerProvider(FAKE_PROVIDER);

		await broker.invalidate('test-provider');

		const raw = await store.get('son-of-anton.broker.token.test-provider');
		const stored = JSON.parse(raw!) as TokenRecord;
		assert.deepStrictEqual(
			{ expiresAt: stored.expiresAt, refreshToken: stored.refreshToken },
			{ expiresAt: 0, refreshToken: 'rtok-xyz' },
		);
	});

	test('disconnect removes credentials entirely', async () => {
		const store = new FakeSecretStore();
		await store.store('son-of-anton.broker.token.test-provider', JSON.stringify(makeToken()));

		const broker = new CredentialBroker(store, () => Promise.resolve(true));
		broker.registerProvider(FAKE_PROVIDER);

		await broker.disconnect('test-provider');

		assert.strictEqual(await store.get('son-of-anton.broker.token.test-provider'), undefined);
		await assert.rejects(() => broker.getToken('test-provider'), /No credentials stored/);
	});

	test('status returns connected=true for valid token', async () => {
		const store = new FakeSecretStore();
		await store.store('son-of-anton.broker.token.test-provider', JSON.stringify(makeToken()));

		const broker = new CredentialBroker(store, () => Promise.resolve(true));
		broker.registerProvider(FAKE_PROVIDER);

		const statuses = await broker.status();
		assert.deepStrictEqual(
			statuses.map(s => ({ id: s.id, connected: s.connected })),
			[{ id: 'test-provider', connected: true }],
		);
	});

	test('status returns connected=false for expired token', async () => {
		const store = new FakeSecretStore();
		const expired = makeToken({ expiresAt: Date.now() - 1000 });
		await store.store('son-of-anton.broker.token.test-provider', JSON.stringify(expired));

		const broker = new CredentialBroker(store, () => Promise.resolve(true));
		broker.registerProvider(FAKE_PROVIDER);

		const statuses = await broker.status();
		assert.strictEqual(statuses[0].connected, false);
	});

	test('status returns connected=false when no token stored', async () => {
		const broker = makeBroker();
		broker.registerProvider(FAKE_PROVIDER);

		const statuses = await broker.status();
		assert.deepStrictEqual(
			statuses.map(s => ({ id: s.id, connected: s.connected })),
			[{ id: 'test-provider', connected: false }],
		);
	});

	test('connect throws for unknown provider', async () => {
		const broker = makeBroker();
		await assert.rejects(
			() => broker.connect('unknown-provider'),
			/Unknown provider: unknown-provider/,
		);
	});

	test('onDidDisconnect fires when refresh fails without a refresh token', async () => {
		const store = new FakeSecretStore();
		const expired = makeToken({ expiresAt: 0, refreshToken: undefined });
		await store.store('son-of-anton.broker.token.test-provider', JSON.stringify(expired));

		const broker = new CredentialBroker(store, () => Promise.resolve(true));
		broker.registerProvider(FAKE_PROVIDER);

		const disconnected: string[] = [];
		broker.onDidDisconnect(id => disconnected.push(id));

		await assert.rejects(
			() => broker.getToken('test-provider'),
			/No refresh token for provider/,
		);
		assert.deepStrictEqual(disconnected, ['test-provider']);
	});

	test('multiple providers tracked independently', async () => {
		const store = new FakeSecretStore();
		const providerB: ProviderConfig = {
			...FAKE_PROVIDER,
			id: 'provider-b',
			displayName: 'Provider B',
		};

		const tokenA = makeToken({ token: 'tok-a' });
		await store.store('son-of-anton.broker.token.test-provider', JSON.stringify(tokenA));

		const broker = new CredentialBroker(store, () => Promise.resolve(true));
		broker.registerProvider(FAKE_PROVIDER);
		broker.registerProvider(providerB);

		const resultA = await broker.getToken('test-provider');
		assert.strictEqual(resultA.token, 'tok-a');

		await assert.rejects(() => broker.getToken('provider-b'), /No credentials stored/);
	});
});

// ── BrokerServer integration tests ───────────────────────────────────────────

/**
 * Helper that connects to the broker socket, authenticates, sends a request,
 * and returns the parsed response.
 */
async function brokerRpc(
	socketPath: string,
	token: string,
	request: object,
): Promise<Record<string, unknown>> {
	return new Promise((resolve, reject) => {
		const client = net.createConnection(socketPath, () => {
			// Step 1: send auth
			client.write(JSON.stringify({ auth: token }) + '\n');
		});

		let buffer = '';
		let authDone = false;

		client.on('data', (chunk: Buffer) => {
			buffer += chunk.toString('utf-8');
			const lines = buffer.split('\n');
			buffer = lines.pop() ?? '';

			for (const line of lines) {
				if (!line.trim()) {
					continue;
				}
				const msg = JSON.parse(line) as Record<string, unknown>;
				if (!authDone) {
					authDone = true;
					if (msg['ok']) {
						// Step 2: send the actual request
						client.write(JSON.stringify(request) + '\n');
					} else {
						client.destroy();
						reject(new Error(`Auth rejected: ${JSON.stringify(msg)}`));
					}
				} else {
					client.destroy();
					resolve(msg);
				}
			}
		});

		client.on('error', reject);
	});
}

suite('BrokerServer', () => {
	let brokerServer: BrokerServer;
	let socketPath: string;
	let sessionToken: string;
	let store: FakeSecretStore;

	setup(async function () {
		this.timeout(5000);
		store = new FakeSecretStore();
		const broker = new CredentialBroker(store, () => Promise.resolve(true));
		broker.registerProvider(FAKE_PROVIDER);

		brokerServer = new BrokerServer(broker);
		const info = await brokerServer.start();
		socketPath = info.socketPath;
		sessionToken = fs.readFileSync(info.tokenFilePath, 'utf-8').trim();
	});

	teardown(() => {
		brokerServer.stop();
	});

	test('auth handshake succeeds with valid session token', async () => {
		const response = await brokerRpc(socketPath, sessionToken, {
			method: 'status',
			requestId: 'r1',
		});
		assert.ok(response['result']);
	});

	test('auth handshake rejects wrong token', async () => {
		await assert.rejects(
			() => brokerRpc(socketPath, 'wrong-token', { method: 'status', requestId: 'r2' }),
			/Auth rejected/,
		);
	});

	test('status RPC returns provider list', async () => {
		const response = await brokerRpc(socketPath, sessionToken, {
			method: 'status',
			requestId: 'r3',
		});
		const result = response['result'] as { providers: Array<{ id: string }> };
		assert.ok(Array.isArray(result.providers));
		assert.ok(result.providers.some(p => p.id === 'test-provider'));
	});

	test('getToken RPC returns error when no credentials stored', async () => {
		const response = await brokerRpc(socketPath, sessionToken, {
			method: 'getToken',
			providerId: 'test-provider',
			requestId: 'r4',
		});
		assert.ok(typeof response['error'] === 'string');
		assert.ok((response['error'] as string).includes('No credentials stored'));
	});

	test('getToken RPC returns token when credentials are stored', async () => {
		const token = makeToken();
		await store.store('son-of-anton.broker.token.test-provider', JSON.stringify(token));

		const response = await brokerRpc(socketPath, sessionToken, {
			method: 'getToken',
			providerId: 'test-provider',
			requestId: 'r5',
		});
		const result = response['result'] as TokenRecord;
		assert.strictEqual(result.token, 'tok-abc');
	});

	test('disconnect RPC removes credentials', async () => {
		const token = makeToken();
		await store.store('son-of-anton.broker.token.test-provider', JSON.stringify(token));

		await brokerRpc(socketPath, sessionToken, {
			method: 'disconnect',
			providerId: 'test-provider',
			requestId: 'r6',
		});

		const afterDisconnect = await brokerRpc(socketPath, sessionToken, {
			method: 'getToken',
			providerId: 'test-provider',
			requestId: 'r7',
		});
		assert.ok(typeof afterDisconnect['error'] === 'string');
	});

	test('invalidate RPC marks token expired', async () => {
		const token = makeToken();
		await store.store('son-of-anton.broker.token.test-provider', JSON.stringify(token));

		const invalidateResponse = await brokerRpc(socketPath, sessionToken, {
			method: 'invalidate',
			providerId: 'test-provider',
			requestId: 'r8',
		});
		assert.deepStrictEqual(
			(invalidateResponse['result'] as { ok: boolean }),
			{ ok: true },
		);

		const raw = await store.get('son-of-anton.broker.token.test-provider');
		const stored = JSON.parse(raw!) as TokenRecord;
		assert.strictEqual(stored.expiresAt, 0);
	});

	test('session token file has restricted permissions on Unix', async function () {
		if (process.platform === 'win32') {
			this.skip();
		}
		const info = await (async () => {
			// Re-check the token file permissions from setup
			const tokenDir = process.env['XDG_RUNTIME_DIR'] ?? require('os').tmpdir();
			const tokenFilePath = require('path').join(tokenDir, 'son-of-anton-broker.token');
			return fs.statSync(tokenFilePath);
		})();
		// 0o600 = rw------- — only owner can read/write
		assert.strictEqual(info.mode & 0o777, 0o600);
	});
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import {
	AccountInfo,
	INetworkModule,
	NetworkRequestOptions,
	NetworkResponse,
	PublicClientApplication,
	SilentFlowRequest,
} from '@azure/msal-node';
import {
	Disposable,
	LogOutputChannel,
	EventEmitter,
	SecretStorage,
	SecretStorageChangeEvent,
	window,
	workspace,
	ConfigurationTarget,
} from 'vscode';
import { SecretStorageCachePlugin } from '../../common/cachePlugin';
import { CachedPublicClientApplication } from '../cachedPublicClientApplication';
import { MicrosoftAuthenticationTelemetryReporter } from '../../common/telemetryReporter';

const clientId = '00000000-0000-4000-8000-000000000001';
const tenantId = '00000000-0000-4000-8000-000000000002';
const userId = '00000000-0000-4000-8000-000000000003';
const environment = 'login.microsoftonline.com';
const authority = `https://${environment}/${tenantId}`;
const cacheKey = `pca:${clientId}`;

class TestSecretStorage implements SecretStorage, Disposable {
	private readonly _onDidChange = new EventEmitter<SecretStorageChangeEvent>();
	readonly onDidChange = this._onDidChange.event;
	private readonly _values = new Map<string, string>();
	writes = 0;
	failWrites = false;

	async keys(): Promise<string[]> {
		return [...this._values.keys()];
	}
	async get(key: string): Promise<string | undefined> {
		return this._values.get(key);
	}
	async store(key: string, value: string): Promise<void> {
		if (this.failWrites) {
			throw new Error('SecretStorage write failed');
		}
		this._values.set(key, value);
		this.writes++;
		this._onDidChange.fire({ key });
	}
	async delete(key: string): Promise<void> {
		this._values.delete(key);
		this._onDidChange.fire({ key });
	}
	dispose(): void {
		this._onDidChange.dispose();
	}
}

function encode(value: object): string {
	return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/** Uses real MSAL code and cache handling; only the identity server is simulated. */
class TestIdentityServer implements INetworkModule {
	issueFamilyToken = true;
	idTokenExpiresIn = 3600;
	rejectApplicationToken = false;
	refreshError = 'invalid_grant';
	refreshSubError = 'bad_token';
	readonly requests: URLSearchParams[] = [];
	beforeReject: (() => Promise<void>) | undefined;

	async sendGetRequestAsync<T>(): Promise<NetworkResponse<T>> {
		throw new Error(
			'Unexpected network GET: authority metadata is supplied by the test',
		);
	}

	async sendPostRequestAsync<T>(
		_url: string,
		options?: NetworkRequestOptions,
	): Promise<NetworkResponse<T>> {
		const request = new URLSearchParams(options?.body);
		this.requests.push(request);
		const refreshToken = request.get('refresh_token');
		if (
			refreshToken === 'expired-family-token' ||
			(refreshToken && this.rejectApplicationToken)
		) {
			await this.beforeReject?.();
			return {
				headers: {},
				status: 400,
				body: {
					error: this.refreshError,
					error_description:
						'AADSTS700082: The refresh token has expired due to inactivity.',
					suberror: this.refreshSubError,
					error_codes: [700082],
				} as T,
			};
		}
		const now = Math.floor(Date.now() / 1000);
		const idToken = `${encode({ alg: 'none' })}.${encode({
			aud: clientId,
			iss: `${authority}/v2.0`,
			iat: now,
			exp: now + this.idTokenExpiresIn,
			tid: tenantId,
			oid: userId,
			sub: userId,
			preferred_username: 'test@example.com',
		})}.synthetic-signature`;
		return {
			headers: {},
			status: 200,
			body: {
				token_type: 'Bearer',
				scope: request.get('scope'),
				expires_in: 3600,
				access_token: 'fresh-access-token',
				id_token: idToken,
				refresh_token: this.issueFamilyToken
					? 'expired-family-token'
					: 'fresh-application-token',
				foci: this.issueFamilyToken ? '1' : undefined,
				client_info: encode({ uid: userId, utid: tenantId }),
			} as T,
		};
	}
}

suite('Microsoft authentication token cache', () => {
	let secrets: TestSecretStorage;
	let cachePlugin: SecretStorageCachePlugin;
	let server: TestIdentityServer;
	let pca: PublicClientApplication;
	let account: AccountInfo;
	let app: CachedPublicClientApplication | undefined;
	let disposables: Disposable[];
	let previousImplementation: string | undefined;
	let logger: LogOutputChannel;

	suiteSetup(() => {
		logger = window.createOutputChannel('Microsoft authentication cache test', { log: true });
	});

	suiteTeardown(() => {
		logger.dispose();
	});

	async function acquireTokenSilent(request: SilentFlowRequest) {
		if (!app) {
			const accessChanged = new EventEmitter<void>();
			disposables.push(accessChanged);
			app = await CachedPublicClientApplication.create(clientId, secrets, {
				onDidAccountAccessChange: accessChanged.event,
				isAllowedAccess: () => true,
				setAllowedAccess: async () => { }
			}, logger, sinon.createStubInstance(MicrosoftAuthenticationTelemetryReporter) as unknown as MicrosoftAuthenticationTelemetryReporter);
			disposables.push(app);
			assert.strictEqual(app.isBrokerAvailable, false);
		}
		// Install real MSAL with simulated transport on this instance, without replacing acquisition or persistence methods.
		Object.assign(app, { _pca: pca, _secretStorageCachePlugin: cachePlugin });
		return app.acquireTokenSilent(request);
	}

	function createPca(plugin = cachePlugin): PublicClientApplication {
		return new PublicClientApplication({
			auth: {
				clientId,
				authority,
				cloudDiscoveryMetadata: JSON.stringify({
					metadata: [
						{
							preferred_network: environment,
							preferred_cache: environment,
							aliases: [environment],
						},
					],
				}),
				authorityMetadata: JSON.stringify({
					authorization_endpoint: `${authority}/oauth2/v2.0/authorize`,
					token_endpoint: `${authority}/oauth2/v2.0/token`,
					issuer: `${authority}/v2.0`,
					jwks_uri: `${authority}/discovery/v2.0/keys`,
				}),
			},
			system: { networkClient: server },
			cache: { cachePlugin: plugin },
		});
	}

	async function signIn(): Promise<void> {
		// This is the code exchange used by acquireTokenInteractive after browser authorization.
		const result = await pca.acquireTokenByCode({
			code: 'synthetic-code',
			redirectUri: 'http://localhost',
			scopes: ['User.Read'],
		});
		assert.ok(result.account);
		account = result.account;
	}

	function request(): SilentFlowRequest {
		return { account, authority, scopes: ['User.Read'], forceRefresh: true };
	}

	function refreshTokensSent(): (string | null)[] {
		return server.requests
			.filter((r) => r.get('grant_type') === 'refresh_token')
			.map((r) => r.get('refresh_token'));
	}

	async function storedRefreshTokens(): Promise<string[]> {
		const cache = JSON.parse((await secrets.get(cacheKey))!) as {
			RefreshToken: Record<string, { secret: string }>;
		};
		return Object.values(cache.RefreshToken).map((token) => token.secret);
	}

	setup(async () => {
		disposables = [];
		app = undefined;
		const configuration = workspace.getConfiguration('microsoft-authentication');
		previousImplementation = configuration.inspect<string>('implementation')?.globalValue;
		await configuration.update('implementation', 'msal-no-broker', ConfigurationTarget.Global);
		secrets = new TestSecretStorage();
		cachePlugin = new SecretStorageCachePlugin(secrets, cacheKey);
		server = new TestIdentityServer();
		pca = createPca();
		await signIn();
		server.issueFamilyToken = false;
	});

	teardown(async () => {
		for (const disposable of disposables.reverse()) {
			disposable.dispose();
		}
		cachePlugin.dispose();
		secrets.dispose();
		sinon.restore();
		await workspace.getConfiguration('microsoft-authentication').update('implementation', previousImplementation, ConfigurationTarget.Global);
	});

	test('uses fresh credentials after signing in over an expired family refresh token', async () => {
		await signIn();
		assert.strictEqual((await pca.getAllAccounts()).length, 1);
		const result = await acquireTokenSilent(request());
		assert.deepStrictEqual(
			{
				token: result.accessToken,
				sent: refreshTokensSent(),
				stored: await storedRefreshTokens(),
			},
			{
				token: 'fresh-access-token',
				sent: ['expired-family-token', 'fresh-application-token'],
				stored: ['fresh-application-token'],
			},
		);
	});

	test('recovers when a cached access token requires an ID-token refresh', async () => {
		server.idTokenExpiresIn = 120;
		await signIn();
		server.idTokenExpiresIn = 3600;
		const result = await acquireTokenSilent({ ...request(), forceRefresh: false });
		assert.deepStrictEqual({ token: result.accessToken, sent: refreshTokensSent(), stored: await storedRefreshTokens() }, {
			token: 'fresh-access-token',
			sent: ['expired-family-token', 'fresh-application-token'],
			stored: ['fresh-application-token']
		});
	});

	test('does not reload the rejected token after restarting', async () => {
		await signIn();
		await acquireTokenSilent(request());
		app?.dispose();
		app = undefined;
		pca = createPca();
		await acquireTokenSilent(request());
		assert.deepStrictEqual(refreshTokensSent(), [
			'expired-family-token',
			'fresh-application-token',
			'fresh-application-token',
		]);
	});

	test('persists invalidation when no usable refresh token remains', async () => {
		await assert.rejects(
			acquireTokenSilent(request()),
			{ errorCode: 'no_tokens_found' },
		);
		app?.dispose();
		app = undefined;
		pca = createPca();
		await assert.rejects(
			acquireTokenSilent(request()),
			{ errorCode: 'no_tokens_found' },
		);
		assert.deepStrictEqual(
			{ sent: refreshTokensSent(), stored: await storedRefreshTokens() },
			{ sent: ['expired-family-token'], stored: [] },
		);
	});

	test('bounds retries and persists invalidation when both refresh tokens are rejected', async () => {
		await signIn();
		server.rejectApplicationToken = true;
		await assert.rejects(
			acquireTokenSilent(request()),
			{ errorCode: 'invalid_grant', subError: 'bad_token' },
		);
		assert.deepStrictEqual(
			{ sent: refreshTokensSent(), stored: await storedRefreshTokens() },
			{
				sent: ['expired-family-token', 'fresh-application-token'],
				stored: [],
			},
		);
	});

	test('does not retry or change credentials for unrelated server errors', async () => {
		await signIn();
		server.refreshError = 'temporarily_unavailable';
		server.refreshSubError = '';
		const before = await secrets.get(cacheKey);
		await assert.rejects(
			acquireTokenSilent(request()),
			{ errorCode: 'temporarily_unavailable' },
		);
		assert.deepStrictEqual(
			{ sent: refreshTokensSent(), cache: await secrets.get(cacheKey) },
			{ sent: ['expired-family-token'], cache: before },
		);
	});

	test('does not write or retry when the cached access token is valid', async () => {
		await signIn();
		const writes = secrets.writes;
		const result = await acquireTokenSilent({
			...request(),
			forceRefresh: false,
		});
		assert.deepStrictEqual(
			{
				cached: result.fromCache,
				sent: refreshTokensSent(),
				writes: secrets.writes,
			},
			{ cached: true, sent: [], writes },
		);
	});

	test('does not retry if persisting the invalidation fails', async () => {
		await signIn();
		secrets.failWrites = true;
		await assert.rejects(
			acquireTokenSilent(request()),
			/SecretStorage write failed/,
		);
		assert.deepStrictEqual(refreshTokensSent(), ['expired-family-token']);
	});

	test('preserves a concurrent sign-in while a refresh request is in flight', async () => {
		const otherPlugin = new SecretStorageCachePlugin(secrets, cacheKey);
		try {
			const otherPca = createPca(otherPlugin);
			server.beforeReject = async () => {
				server.beforeReject = undefined;
				await otherPca.acquireTokenByCode({
					code: 'other-window-code',
					redirectUri: 'http://localhost',
					scopes: ['Other.Read'],
				});
			};
			// The bounded retry can encounter the old family token again, but must
			// preserve the application token that was written by the other window.
			await assert.rejects(
				acquireTokenSilent(request()),
				{ subError: 'bad_token' },
			);
			const result = await acquireTokenSilent(request());
			assert.deepStrictEqual(
				{ token: result.accessToken, stored: await storedRefreshTokens() },
				{ token: 'fresh-access-token', stored: ['fresh-application-token'] },
			);
		} finally {
			otherPlugin.dispose();
		}
	});

	test('does not restore credentials removed by another window', async () => {
		server.beforeReject = () => secrets.delete(cacheKey);
		await assert.rejects(
			acquireTokenSilent(request()),
			{ errorCode: 'no_tokens_found' },
		);
		assert.strictEqual(await secrets.get(cacheKey), undefined);
	});
});

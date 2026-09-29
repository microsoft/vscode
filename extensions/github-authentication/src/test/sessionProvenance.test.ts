/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { AccountLinks } from '../common/accountLinks';
import { isSupportedClient, isSupportedTarget } from '../common/env';
import { Log } from '../common/logger';
import { ExtensionHost, getFlows, GitHubTarget } from '../flows';
import { AuthProviderType, GitHubSessionEngine, UriEventHandler } from '../github';
import { GitHubServer, IGitHubServer, IGitHubToken } from '../githubServer';
import { TestMemento } from './testMemento';

interface TestSessionProvider extends vscode.AuthenticationProvider, vscode.Disposable {
	_persistedSessionsPromise: Promise<vscode.AuthenticationSession[]>;
	readSessions(): Promise<vscode.AuthenticationSession[]>;
	checkForUpdates(): Promise<void>;
	getCachedSessions(): Promise<readonly vscode.AuthenticationSession[]>;
	setAccountLabelSuffix(suffix: string | undefined): Promise<void>;
}

suite('GitHub session provenance', () => {
	const disposables: vscode.Disposable[] = [];
	teardown(() => {
		while (disposables.length) {
			disposables.pop()!.dispose();
		}
	});

	function session(id: string): vscode.AuthenticationSession {
		return {
			id,
			accessToken: `test-token-${id}`,
			account: { id: '42', label: 'octocat', icon: vscode.Uri.parse('https://avatars.example/42') },
			scopes: ['repo']
		};
	}

	function createHarness(type: AuthProviderType, baseUri: vscode.Uri, initial: vscode.AuthenticationSession[], authorizationServer = vscode.Uri.joinPath(baseUri, '/login/oauth'), accountLabelSuffix?: string) {
		const logger = new Log(type);
		const emitter = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
		disposables.push(emitter);
		let stored = JSON.stringify(initial);
		const writes: string[] = [];
		const changes: vscode.AuthenticationProviderAuthenticationSessionsChangeEvent[] = [];
		const revocations: string[] = [];
		const loginHints: (string | undefined)[] = [];
		let fallbackCalls = 0;
		let userInfoCalls = 0;
		const provider = Object.assign(Object.create(GitHubSessionEngine.prototype), {
			_logger: logger,
			_accountLabelSuffix: accountLabelSuffix,
			_keychain: {
				getToken: async () => stored,
				setToken: async (value: string) => { stored = value; writes.push(value); },
				deleteToken: async () => { stored = ''; writes.push(''); }
			},
			_githubServer: {
				getFallbackBaseUri: () => { fallbackCalls++; return baseUri; },
				login: async (...args: Parameters<IGitHubServer['login']>) => {
					loginHints.push(args[3]);
					return { token: 'test-new-token', authorizationServer };
				},
				getUserInfo: async () => {
					userInfoCalls++;
					return { id: '42', accountName: 'octocat', avatarUrl: 'https://avatars.example/42' };
				},
				logout: async (removed: vscode.AuthenticationSession) => { revocations.push(removed.id); },
				sendAdditionalTelemetryInfo: async () => { }
			},
			_accountLinks: new AccountLinks(new TestMemento(), 'test.microsoftAccountLinks', logger),
			_accountsSeen: new Set<string>(),
			_transientSessions: new Map<string, { session: vscode.AuthenticationSession; expiresAt: number }>(),
			_renewals: new Map<string, Promise<vscode.AuthenticationSession | undefined>>(),
			_restores: new Map<string, Promise<vscode.AuthenticationSession | undefined>>(),
			_restoresTried: new Set<string>(),
			_microsoftGeneration: 0,
			_microsoft: { getAccounts: async () => [] },
			_sessionChangeEmitter: emitter
		}) as TestSessionProvider;
		disposables.push(provider);
		disposables.push(provider.onDidChangeSessions(event => changes.push(event)));
		provider._persistedSessionsPromise = provider.readSessions();
		return {
			provider, changes, writes, revocations, loginHints,
			get stored() { return stored; },
			get fallbackCalls() { return fallbackCalls; },
			get userInfoCalls() { return userInfoCalls; },
			async changeStoredSessions(sessions: vscode.AuthenticationSession[]) {
				stored = JSON.stringify(sessions);
				await provider.checkForUpdates();
			}
		};
	}

	test('creates host labels at the engine boundary while preserving native IDs and saved usernames', async () => {
		const base = vscode.Uri.parse('https://tenant.ghe.com');
		const suffix = ` (${base.toString(true)})`;
		const original = session('native-session-id');
		const issuer = vscode.Uri.joinPath(base, '/login/oauth');
		const harness = createHarness(AuthProviderType.githubEnterprise, base, [original], issuer, suffix);
		const [loaded] = await harness.provider.getSessions(['repo'], {});
		const created = await harness.provider.createSession(['repo'], { account: loaded.account, authorizationServer: issuer });
		const [cached] = await harness.provider.getCachedSessions();
		assert.deepStrictEqual({
			loadedId: loaded.id,
			accountId: created.account.id,
			labels: [loaded.account.label, created.account.label],
			loginHints: harness.loginHints,
			storedLabel: JSON.parse(harness.stored)[0].account.label,
			sameSession: cached === created && harness.changes[0].added?.[0] === created
		}, {
			loadedId: 'native-session-id',
			accountId: '42',
			labels: [`octocat${suffix}`, `octocat${suffix}`],
			loginHints: ['octocat'],
			storedLabel: 'octocat',
			sameSession: true
		});
	});

	test('changing host labels updates cached sessions without writing credentials', async () => {
		const base = vscode.Uri.parse('https://tenant.ghe.com');
		const original = session('native-session-id');
		const harness = createHarness(AuthProviderType.githubEnterprise, base, [original]);
		await harness.provider.setAccountLabelSuffix(` (${base.toString(true)})`);
		await harness.provider.setAccountLabelSuffix(undefined);
		assert.deepStrictEqual({
			changes: harness.changes.map(event => event.changed?.map(session => ({ id: session.id, label: session.account.label }))),
			writes: harness.writes,
			stored: harness.stored
		}, {
			changes: [[{ id: original.id, label: 'octocat (https://tenant.ghe.com/)' }], [{ id: original.id, label: 'octocat' }]],
			writes: [],
			stored: JSON.stringify([original])
		});
	});

	test('issuer-filtered reads do not return a session from another server', async () => {
		const base = vscode.Uri.parse('https://tenant.ghe.com');
		const issuer = vscode.Uri.joinPath(base, '/login/oauth');
		const original = { ...session('native-session-id'), authorizationServer: vscode.Uri.parse('https://other.ghe.com/login/oauth') };
		const harness = createHarness(AuthProviderType.githubEnterprise, base, [original]);
		assert.deepStrictEqual(await harness.provider.getSessions(['repo'], { authorizationServer: issuer }), []);
	});

	test('a token for a different requested issuer is rejected before user lookup or publication', async () => {
		const errorMessage = sinon.stub(vscode.window, 'showErrorMessage').resolves(undefined);
		disposables.push(new vscode.Disposable(() => errorMessage.restore()));
		const base = vscode.Uri.parse('https://tenant.ghe.com');
		const harness = createHarness(AuthProviderType.githubEnterprise, base, [], vscode.Uri.parse('https://other.ghe.com/login/oauth'));
		await assert.rejects(Promise.resolve(harness.provider.createSession(['repo'], { authorizationServer: vscode.Uri.joinPath(base, '/login/oauth') })), /does not belong to the requested authorization server/);
		assert.deepStrictEqual({ userLookups: harness.userInfoCalls, writes: harness.writes, changes: harness.changes }, { userLookups: 0, writes: [], changes: [] });
	});

	for (const { type, base, issuer } of [
		{ type: AuthProviderType.github, base: 'https://github.com', issuer: 'https://github.com/login/oauth' },
		{ type: AuthProviderType.githubEnterprise, base: 'https://ghe.example:8443/Team%20Space/', issuer: 'https://ghe.example:8443/Team%20Space/login/oauth' }
	]) {
		suite(type, () => {
			const authorizationServer = vscode.Uri.parse(issuer);

			test('loads old saved sessions with provenance without rewriting storage', async () => {
				const oldSession = session('original-session');
				const harness = createHarness(type, vscode.Uri.parse(base), [oldSession]);
				const loaded = await harness.provider._persistedSessionsPromise;
				const returned = await harness.provider.getSessions(['repo'], {});
				assert.deepStrictEqual({
					loaded,
					sessions: returned,
					sameSession: returned[0] === loaded[0],
					stored: harness.stored,
					writes: harness.writes,
					changes: harness.changes,
					fallbackCalls: harness.fallbackCalls,
				}, {
					loaded: [{ ...oldSession, authorizationServer }],
					sessions: [{ ...oldSession, authorizationServer }],
					sameSession: true,
					stored: JSON.stringify([oldSession]),
					writes: [],
					changes: [],
					fallbackCalls: 1,
				});
			});

			test('persists and reloads session provenance on creation', async () => {
				const oldSession = session('original-session');
				const harness = createHarness(type, vscode.Uri.parse(base), [oldSession]);
				const created = await harness.provider.createSession(['repo'], {});
				const held = (await harness.provider._persistedSessionsPromise)[0];
				const native = { id: created.id, accessToken: 'test-new-token', account: oldSession.account, scopes: ['repo'] };
				const reloaded = await harness.provider.readSessions();
				await harness.provider.removeSession(created.id);
				assert.deepStrictEqual({
					created,
					sameSession: created === held && harness.changes[0].added?.[0] === created,
					changes: harness.changes,
					writes: harness.writes.map(value => JSON.parse(value)),
					reloaded: reloaded.map(session => session.authorizationServer?.toString()),
					revocations: harness.revocations,
					remaining: await harness.provider.getSessions(['repo'], {})
				}, {
					created: { ...native, authorizationServer },
					sameSession: true,
					changes: [
						{ added: [{ ...native, authorizationServer }], removed: [{ ...oldSession, authorizationServer }], changed: [] },
						{ added: [], removed: [{ ...native, authorizationServer }], changed: [] }
					],
					writes: [JSON.parse(JSON.stringify([{ ...native, authorizationServer }])), []],
					reloaded: [issuer],
					revocations: [created.id],
					remaining: []
				});
			});

			test('secret-storage additions and removals publish provenance without migrating tokens', async () => {
				const oldSession = session('original-session');
				const addedSession = session('other-window-session');
				const harness = createHarness(type, vscode.Uri.parse(base), [oldSession]);
				await harness.provider.getSessions(undefined, {});
				await harness.changeStoredSessions([addedSession]);
				assert.deepStrictEqual({
					changes: harness.changes,
					sessions: await harness.provider.getSessions(undefined, {}),
					stored: harness.stored,
					writes: harness.writes
				}, {
					changes: [{ added: [{ ...addedSession, authorizationServer }], removed: [{ ...oldSession, authorizationServer }], changed: [] }],
					sessions: [{ ...addedSession, authorizationServer }],
					stored: JSON.stringify([addedSession]),
					writes: []
				});
			});

			test('retains the issuer returned with the token rather than looking up the server base again', async () => {
				const returnedIssuer = vscode.Uri.parse('https://returned.example/login/oauth');
				const harness = createHarness(type, vscode.Uri.parse(base), [], returnedIssuer);
				const created = await harness.provider.createSession(['repo'], {});
				const reloaded = await harness.provider.readSessions();
				assert.deepStrictEqual({
					created: created.authorizationServer?.toString(),
					stored: reloaded[0].authorizationServer?.toString(),
					announced: harness.changes[0].added?.[0].authorizationServer?.toString(),
					fallbackCalls: harness.fallbackCalls,
				}, { created: returnedIssuer.toString(), stored: returnedIssuer.toString(), announced: returnedIssuer.toString(), fallbackCalls: 0 });
			});
		});
	}
});

suite('GitHub server token provenance', () => {
	const sandbox = sinon.createSandbox();
	teardown(() => sandbox.restore());

	for (const enterprise of [false, true]) {
		test(`${enterprise ? 'enterprise' : 'public'} login and Microsoft exchange results include their issuer`, async () => {
			const baseUri = vscode.Uri.parse(enterprise ? 'https://enterprise.example:8443/Team' : 'https://github.com/');
			const type = enterprise ? AuthProviderType.githubEnterprise : AuthProviderType.github;
			const callbackUri = vscode.Uri.parse('vscode://vscode.github-authentication/callback');
			sandbox.stub(vscode.env, 'asExternalUri').resolves(callbackUri);
			const flows = getFlows({
				target: enterprise ? isSupportedTarget(type, baseUri) ? GitHubTarget.HostedEnterprise : GitHubTarget.Enterprise : GitHubTarget.DotCom,
				extensionHost: ExtensionHost.Local,
				isSupportedClient: isSupportedClient(callbackUri),
			});
			assert.ok(flows.length);
			const flow = sandbox.stub(flows[0], 'trigger').resolves('oauth-token');
			const account = { id: '42', accountName: 'octocat', avatarUrl: undefined };
			const exchanged = { token: 'microsoft-token', expiresAfter: 3600, account };
			const renewed = { ...exchanged, token: 'renewed-token', scopes: ['repo'] };
			const uriHandler = new UriEventHandler();
			try {
				const server = Object.assign(Object.create(GitHubServer.prototype), {
					_type: type,
					_ghesUri: enterprise ? baseUri : undefined,
					_extensionKind: vscode.ExtensionKind.UI,
					_uriHandler: uriHandler,
					_redirectEndpoint: 'https://vscode.dev/redirect',
					_logger: { info: () => { } },
					_entraTokenExchange: { login: async () => exchanged, renew: async () => renewed },
				}) as GitHubServer;
				const describe = (result: IGitHubToken) => ({ ...result, authorizationServer: result.authorizationServer.toString() });
				const authorizationServer = vscode.Uri.joinPath(baseUri, '/login/oauth').toString();

				assert.deepStrictEqual({
					oauth: describe(await server.login('repo')),
					microsoft: describe(await server.loginWithMicrosoft(['repo'])),
					renewed: describe(await server.renewWithMicrosoft({ scopes: ['repo'], gitHubAccountId: '42', microsoftAccount: { id: 'entra-id', label: 'mona' } })),
					flowBase: flow.firstCall.args[0].baseUri.toString(),
				}, {
					oauth: { token: 'oauth-token', authorizationServer },
					microsoft: { ...exchanged, authorizationServer },
					renewed: { ...renewed, authorizationServer },
					flowBase: baseUri.toString(),
				});
			} finally {
				uriHandler.dispose();
			}
		});
	}
});

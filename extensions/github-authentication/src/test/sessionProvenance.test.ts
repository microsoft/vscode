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
import { AuthProviderType, GitHubAuthenticationProvider, UriEventHandler } from '../github';
import { GitHubServer, IGitHubToken } from '../githubServer';
import { TestMemento } from './testMemento';

interface TestSessionProvider extends vscode.AuthenticationProvider, vscode.Disposable {
	_persistedSessionsPromise: Promise<vscode.AuthenticationSession[]>;
	readSessions(): Promise<vscode.AuthenticationSession[]>;
	checkForUpdates(): Promise<void>;
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

	function createHarness(type: AuthProviderType, baseUri: vscode.Uri, initial: vscode.AuthenticationSession[], authorizationServer = vscode.Uri.joinPath(baseUri, '/login/oauth')) {
		const logger = new Log(type);
		const emitter = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
		disposables.push(emitter);
		let stored = JSON.stringify(initial);
		const writes: string[] = [];
		const changes: vscode.AuthenticationProviderAuthenticationSessionsChangeEvent[] = [];
		const revocations: string[] = [];
		let fallbackCalls = 0;
		const provider = Object.assign(Object.create(GitHubAuthenticationProvider.prototype), {
			_logger: logger,
			_keychain: {
				getToken: async () => stored,
				setToken: async (value: string) => { stored = value; writes.push(value); },
				deleteToken: async () => { stored = ''; writes.push(''); }
			},
			_githubServer: {
				getFallbackBaseUri: () => { fallbackCalls++; return baseUri; },
				login: async () => ({ token: 'test-new-token', authorizationServer }),
				getUserInfo: async () => ({ id: '42', accountName: 'octocat', avatarUrl: 'https://avatars.example/42' }),
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
			provider, changes, writes, revocations,
			get stored() { return stored; },
			get fallbackCalls() { return fallbackCalls; },
			async changeStoredSessions(sessions: vscode.AuthenticationSession[]) {
				stored = JSON.stringify(sessions);
				await provider.checkForUpdates();
			}
		};
	}

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

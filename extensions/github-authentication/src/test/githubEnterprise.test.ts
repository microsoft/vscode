/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { Log } from '../common/logger';
import { AccountLinks } from '../common/accountLinks';
import { AuthProviderType, IGitHubAuthenticationProvider, IGitHubAuthenticationProviderFactory, UriEventHandler } from '../github';
import { GitHubEnterpriseAuthenticationProvider } from '../githubEnterprise';
import { TestMemento } from './testMemento';
import { TestSecretStorage } from './testSecretStorage';

class TestProvider implements IGitHubAuthenticationProvider {
	readonly changes = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
	readonly onDidChangeSessions = this.changes.event;
	readonly reads: { scopes: readonly string[] | undefined; options: vscode.AuthenticationProviderSessionOptions | undefined }[] = [];
	readonly creations: { scopes: readonly string[]; options: vscode.AuthenticationProviderSessionOptions | undefined }[] = [];
	readonly removals: string[] = [];
	disposed = false;
	sessions: vscode.AuthenticationSession[];
	private readonly initialized: Promise<void>;

	constructor(readonly uri: vscode.Uri, readonly storageKey: string, secrets: TestSecretStorage, storedOnly: boolean) {
		this.sessions = storedOnly ? [] : [{
			id: 'session',
			accessToken: `fake-token-${uri.authority}`,
			account: { id: '42', label: 'octocat', icon: vscode.Uri.parse('https://avatars.example/42') },
			scopes: ['repo'],
			authorizationServer: vscode.Uri.joinPath(uri, '/login/oauth'),
			expiresAfter: 60_000
		}];
		this.initialized = secrets.get(storageKey).then(value => {
			if (value) {
				const stored: vscode.AuthenticationSession[] = JSON.parse(value);
				this.sessions = stored.map(session => ({
					...session,
					authorizationServer: vscode.Uri.from(session.authorizationServer!)
				}));
			}
		});
	}

	async getSessionSnapshot(): Promise<readonly vscode.AuthenticationSession[]> {
		await this.initialized;
		return this.sessions;
	}

	async getSessions(scopes: readonly string[] | undefined, options?: vscode.AuthenticationProviderSessionOptions): Promise<vscode.AuthenticationSession[]> {
		await this.initialized;
		this.reads.push({ scopes, options });
		return this.sessions.filter(session => (!scopes?.length || session.scopes.join(' ') === scopes.join(' ')) && (!options?.account || session.account.label === options.account.label));
	}

	async createSession(scopes: readonly string[], options?: vscode.AuthenticationProviderSessionOptions): Promise<vscode.AuthenticationSession> {
		this.creations.push({ scopes, options });
		const session = { ...this.sessions[0], scopes };
		this.changes.fire({ added: [session], removed: [], changed: [] });
		return session;
	}

	async removeSession(id: string): Promise<void> {
		this.removals.push(id);
		const removed = this.sessions.filter(session => session.id === id);
		this.sessions = this.sessions.filter(session => session.id !== id);
		this.changes.fire({ added: [], removed, changed: [] });
	}

	dispose(): void {
		this.disposed = true;
		this.changes.dispose();
	}
}

class TestProviderFactory implements IGitHubAuthenticationProviderFactory {
	readonly engines: TestProvider[] = [];
	failFor: string | undefined;

	constructor(private readonly secrets: TestSecretStorage, private readonly storedOnly = false) { }

	create(uri: vscode.Uri, storageKey: string): TestProvider {
		if (uri.authority === this.failFor) {
			throw new Error('Engine initialization failed');
		}
		const engine = new TestProvider(uri, storageKey, this.secrets, this.storedOnly);
		this.engines.push(engine);
		return engine;
	}
}

suite('GitHub Enterprise multi-host provider', () => {
	const a = vscode.Uri.parse('https://a.example');
	const b = vscode.Uri.parse('https://b.example/Deployment');
	let registration: sinon.SinonStub;
	let picker: sinon.SinonStub;
	const disposables: vscode.Disposable[] = [];

	setup(() => {
		registration = sinon.stub(vscode.authentication, 'registerAuthenticationProvider').callsFake((_id, _label, provider) => provider.onDidChangeSessions(() => { }));
		picker = sinon.stub(vscode.window, 'showQuickPick').rejects(new Error('Unexpected host picker'));
		const logLevels = new vscode.EventEmitter<vscode.LogLevel>();
		disposables.push(logLevels);
		sinon.stub(vscode.window, 'createOutputChannel').returns({
			name: 'Test',
			logLevel: vscode.LogLevel.Info,
			onDidChangeLogLevel: logLevels.event,
			trace: sinon.stub(),
			debug: sinon.stub(),
			info: sinon.stub(),
			warn: sinon.stub(),
			error: sinon.stub(),
			append: sinon.stub(),
			appendLine: sinon.stub(),
			replace: sinon.stub(),
			clear: sinon.stub(),
			show: () => { },
			hide: sinon.stub(),
			dispose: sinon.stub()
		});
	});

	teardown(() => {
		disposables.splice(0).reverse().forEach(disposable => disposable.dispose());
		sinon.restore();
	});

	async function create(uris: readonly vscode.Uri[] = [a, b], state = new TestMemento(), secrets = new TestSecretStorage(), storedOnly = false) {
		disposables.push(secrets);
		const factory = new TestProviderFactory(secrets, storedOnly);
		const provider = new GitHubEnterpriseAuthenticationProvider(state, secrets, factory);
		disposables.push(provider);
		await provider.update(uris);
		return { provider, engines: factory.engines, state, secrets, factory };
	}

	test('one provider advertises every issuer and returns all eligible sessions without a picker', async () => {
		const { provider } = await create([b, a]);
		const all = await provider.getSessions(undefined, {});
		const scoped = await provider.getSessions(['repo'], {});
		assert.deepStrictEqual({
			providers: registration.getCalls().map(call => ({
				id: call.args[0],
				servers: call.args[3].supportedAuthorizationServers.map((uri: vscode.Uri) => uri.toString())
			})),
			accounts: all.map(session => session.account.label),
			uniqueAccountIds: new Set(all.map(session => session.account.id)).size,
			uniqueSessionIds: new Set(all.map(session => session.id)).size,
			sameCandidates: scoped.map(session => session.id),
			pickerCalls: picker.callCount
		}, {
			providers: [{ id: 'github-enterprise', servers: ['https://a.example/login/oauth', 'https://b.example/Deployment/login/oauth'] }],
			accounts: ['octocat (https://a.example/)', 'octocat (https://b.example/Deployment)'],
			uniqueAccountIds: 2,
			uniqueSessionIds: 2,
			sameCandidates: all.map(session => session.id),
			pickerCalls: 0
		});
	});

	test('issuer and account filters intersect before querying an engine and retain request options', async () => {
		const { provider, engines } = await create();
		const selected = (await provider.getSessions())[1];
		engines.forEach(engine => engine.reads.length = 0);
		const options = { account: selected.account, authorizationServer: selected.authorizationServer, clientId: 'client', resource: 'resource', provider: 'microsoft', extraAuthorizeParameters: { prompt: 'test' } };
		const sessions = await provider.getSessions(['repo'], options);
		assert.deepStrictEqual({
			sessions,
			reads: engines.map(engine => engine.reads)
		}, {
			sessions: [selected],
			reads: [[], [{ scopes: ['repo'], options: { ...options, account: engines[1].sessions[0].account } }]]
		});
		assert.deepStrictEqual(await provider.getSessions(['other'], options), []);
	});

	test('conflicting host hints and unsupported issuers fail before accessing engines', async () => {
		const { provider, engines } = await create();
		const selected = (await provider.getSessions())[1];
		engines.forEach(engine => engine.reads.length = 0);
		const mismatch = { account: selected.account, authorizationServer: vscode.Uri.joinPath(a, '/login/oauth') };
		await assert.rejects(provider.getSessions(['repo'], mismatch), /different instances/);
		await assert.rejects(provider.createSession(['repo'], mismatch), /different instances/);
		await assert.rejects(provider.getSessions(['repo'], { authorizationServer: vscode.Uri.parse('https://unknown.example/login/oauth') }), /not configured/);
		assert.deepStrictEqual(engines.map(engine => ({ reads: engine.reads, creations: engine.creations })), [{ reads: [], creations: [] }, { reads: [], creations: [] }]);
	});

	test('single host signs in without showing a picker', async () => {
		const { provider, engines } = await create([b]);
		const session = await provider.createSession(['repo']);
		assert.deepStrictEqual({
			issuer: session.authorizationServer?.toString(),
			creations: engines[0].creations.length,
			pickerCalls: picker.callCount
		}, { issuer: 'https://b.example/Deployment/login/oauth', creations: 1, pickerCalls: 0 });
	});

	test('multiple hosts use the selected second host, never the configured first host', async () => {
		const { provider, engines } = await create();
		picker.callsFake(async items => (await items)[1]);
		const session = await provider.createSession(['repo']);
		assert.deepStrictEqual({
			issuer: session.authorizationServer?.toString(),
			creations: engines.map(engine => engine.creations.length),
			labels: picker.firstCall.args[0].map((item: vscode.QuickPickItem) => item.label),
			title: picker.firstCall.args[1].title
		}, {
			issuer: 'https://b.example/Deployment/login/oauth',
			creations: [0, 1],
			labels: ['https://a.example/', 'https://b.example/Deployment'],
			title: 'Sign in to GitHub Enterprise'
		});
	});

	test('cancelling the host picker starts no authentication flow or session event', async () => {
		const { provider, engines } = await create();
		const events: vscode.AuthenticationProviderAuthenticationSessionsChangeEvent[] = [];
		disposables.push(provider.onDidChangeSessions(event => events.push(event)));
		picker.resolves(undefined);
		await assert.rejects(provider.createSession(['repo']), /Cancelled/);
		assert.deepStrictEqual({ creations: engines.map(engine => engine.creations), events }, { creations: [[], []], events: [] });
	});

	test('explicit issuer and host-qualified account skip the picker and recover the native login hint', async () => {
		const { provider, engines } = await create();
		const selected = (await provider.getSessions())[1];
		await provider.createSession(['repo'], { authorizationServer: selected.authorizationServer });
		await provider.createSession(['repo', 'workflow'], { account: selected.account });
		assert.deepStrictEqual({
			creations: engines.map(engine => engine.creations),
			pickerCalls: picker.callCount
		}, {
			creations: [[], [
				{ scopes: ['repo'], options: { authorizationServer: selected.authorizationServer } },
				{ scopes: ['repo', 'workflow'], options: { account: engines[1].sessions[0].account } }
			]],
			pickerCalls: 0
		});
	});

	test('public session representation preserves provenance, account icons and expiry without mutating engine data', async () => {
		const { provider, engines } = await create([a]);
		const native = engines[0].sessions[0];
		const [published] = await provider.getSessions();
		assert.deepStrictEqual({
			published: { ...published, id: native.id, account: { ...published.account, id: native.account.id, label: native.account.label } },
			nativeIdentity: [native.id, native.account.id, native.account.label]
		}, { published: native, nativeIdentity: ['session', '42', 'octocat'] });
	});

	test('session events use the same host-qualified identity as reads and removal targets only that host', async () => {
		const { provider, engines } = await create();
		const selected = (await provider.getSessions())[1];
		const events: vscode.AuthenticationProviderAuthenticationSessionsChangeEvent[] = [];
		disposables.push(provider.onDidChangeSessions(event => events.push(event)));
		engines[1].changes.fire({ added: [], removed: [], changed: [engines[1].sessions[0]] });
		await provider.removeSession(selected.id);
		assert.deepStrictEqual({
			events,
			removals: engines.map(engine => engine.removals),
			remaining: (await provider.getSessions()).map(session => session.authorizationServer?.toString())
		}, {
			events: [{ added: [], removed: [], changed: [selected] }, { added: [], removed: [selected], changed: [] }],
			removals: [[], ['session']],
			remaining: ['https://a.example/login/oauth']
		});
	});

	test('reorder and equivalent spellings retain engines, registration and identities', async () => {
		const { provider, engines } = await create();
		const before = await provider.getSessions();
		await provider.update([b, vscode.Uri.parse('https://A.EXAMPLE/'), a]);
		assert.deepStrictEqual({
			sessions: await provider.getSessions(),
			created: engines.length,
			disposed: engines.map(engine => engine.disposed),
			registrations: registration.callCount
		}, { sessions: before, created: 2, disposed: [false, false], registrations: 1 });
	});

	test('equivalent host aliases choose the same storage independent of their initial array order', async () => {
		const alias = vscode.Uri.parse('https://A.EXAMPLE/');
		const first = await create([a, alias]);
		const second = await create([alias, a]);
		assert.deepStrictEqual({
			storage: second.engines.map(engine => engine.storageKey),
			sessions: await second.provider.getSessions()
		}, {
			storage: first.engines.map(engine => engine.storageKey),
			sessions: await first.provider.getSessions()
		});
		assert.strictEqual(first.engines.length, 1);
	});

	test('removing a host disposes only its engine, retains stored tokens and rejects stale account hints', async () => {
		const { provider, engines, state } = await create();
		const [removedAccount, retainedAccount] = await provider.getSessions();
		await provider.update([b]);
		const restarted = await create([b, a], state);
		assert.deepStrictEqual({
			remaining: await provider.getSessions(),
			disposed: engines.map(engine => engine.disposed),
			removals: engines.map(engine => engine.removals),
			restored: await restarted.provider.getSessions()
		}, { remaining: [retainedAccount], disposed: [true, false], removals: [[], []], restored: [removedAccount, retainedAccount] });
		await assert.rejects(provider.createSession(['repo'], { account: removedAccount.account }), /no longer configured/);
	});

	test('configuration changes announce retired and restored sessions without disturbing retained hosts', async () => {
		const { provider } = await create();
		const original = await provider.getSessions();
		const events: vscode.AuthenticationProviderAuthenticationSessionsChangeEvent[] = [];
		disposables.push(provider.onDidChangeSessions(event => events.push(event)));
		await provider.update([b]);
		await provider.update([a, b]);
		assert.deepStrictEqual(events, [
			{ added: [], removed: [original[0]], changed: [] },
			{ added: [original[0]], removed: [], changed: [] }
		]);
		await provider.getSessions();
		await provider.getSessions();
		await provider.update([b, a]);
		assert.strictEqual(events.length, 2);
	});

	test('first upgrade finds saved tokens and Microsoft links under an equivalent legacy alias', async () => {
		const state = new TestMemento();
		const secrets = new TestSecretStorage();
		disposables.push(secrets);
		const original = vscode.Uri.parse('https://tenant.example/Team/');
		const alias = vscode.Uri.parse('https://tenant.example/Team');
		const storageKey = 'tenant.example/Team/.ghes.auth';
		const session: vscode.AuthenticationSession = {
			id: 'saved',
			account: { id: '42', label: 'octocat' },
			accessToken: 'fake-stored-token',
			scopes: ['repo'],
			authorizationServer: vscode.Uri.joinPath(original, '/login/oauth')
		};
		await secrets.store(storageKey, JSON.stringify([session]));
		const links = [{ gitHubAccountId: '42', gitHubAccountLabel: 'octocat', microsoftAccountLabel: 'mona@example.com' }];
		await state.update(`${storageKey}.microsoftAccountLinks`, links);
		const { provider, engines } = await create([], state, secrets, true);
		const events: vscode.AuthenticationProviderAuthenticationSessionsChangeEvent[] = [];
		disposables.push(provider.onDidChangeSessions(event => events.push(event)));
		await provider.update([original, alias]);
		assert.strictEqual(events[0].added?.[0].accessToken, session.accessToken);
		const logger = new Log(AuthProviderType.githubEnterprise);
		disposables.push(logger);
		assert.deepStrictEqual({
			storageKey: engines[0].storageKey,
			sessions: (await provider.getSessions()).map(value => value.accessToken),
			links: new AccountLinks(state, `${engines[0].storageKey}.microsoftAccountLinks`, logger).linkedAccounts(),
			saved: await secrets.get(storageKey)
		}, { storageKey, sessions: [session.accessToken], links, saved: JSON.stringify([session]) });
	});

	test('first upgrade preserves a Microsoft-only legacy namespace without requiring a stored token', async () => {
		const state = new TestMemento();
		const storageKey = 'tenant.example/Team/.ghes.auth';
		await state.update(`${storageKey}.microsoftAccountLinks`, [{ gitHubAccountId: '42', gitHubAccountLabel: 'octocat', microsoftAccountLabel: 'mona@example.com' }]);
		const { engines } = await create([vscode.Uri.parse('https://tenant.example/Team'), vscode.Uri.parse('https://tenant.example/Team/')], state);
		assert.strictEqual(engines[0].storageKey, storageKey);
	});

	test('failed engine preparation preserves live hosts and disposes every new engine', async () => {
		const { provider, engines, factory } = await create([a]);
		const before = await provider.getSessions();
		factory.failFor = 'c.example';
		await assert.rejects(provider.update([a, b, vscode.Uri.parse('https://c.example')]), /Engine initialization failed/);
		assert.deepStrictEqual({
			sessions: await provider.getSessions(),
			disposed: engines.map(engine => engine.disposed),
			registrations: registration.callCount
		}, { sessions: before, disposed: [false, true], registrations: 1 });
		factory.failFor = undefined;
		await provider.update([a, b]);
		assert.strictEqual((await provider.getSessions()).length, 2);
	});

	test('failed mapping persistence does not replace the working registration', async () => {
		const { provider, engines, state } = await create([a]);
		const before = await provider.getSessions();
		state.updateError = new Error('Storage is unavailable');
		await assert.rejects(provider.update([a, b]), /Storage is unavailable/);
		assert.deepStrictEqual({
			sessions: await provider.getSessions(),
			disposed: engines.map(engine => engine.disposed),
			registrations: registration.callCount
		}, { sessions: before, disposed: [false], registrations: 1 });
	});

	test('disposal while storage is being inspected cannot resurrect a registration', async () => {
		const { provider, engines, secrets } = await create([a]);
		let complete!: (value: string | undefined) => void;
		const pending = new Promise<string | undefined>(resolve => complete = resolve);
		let inspecting!: () => void;
		const started = new Promise<void>(resolve => inspecting = resolve);
		sinon.stub(secrets, 'get').callThrough().withArgs('b.example/Deployment.ghes.auth').callsFake(() => {
			inspecting();
			return pending;
		});
		const update = provider.update([a, b]);
		await started;
		provider.dispose();
		complete(undefined);
		await assert.rejects(update, vscode.CancellationError);
		assert.deepStrictEqual({ engines: engines.length, disposed: engines[0].disposed, registrations: registration.callCount }, { engines: 1, disposed: true, registrations: 1 });
	});

	test('queued configurations publish in order and retain the last host set', async () => {
		const { provider } = await create([]);
		const events: string[][] = [];
		disposables.push(provider.onDidChangeSessions(event => events.push((event.added ?? []).map(session => session.authorizationServer!.toString()))));
		await Promise.all([provider.update([a]), provider.update([b])]);
		assert.deepStrictEqual({
			events,
			sessions: (await provider.getSessions()).map(session => session.authorizationServer!.toString())
		}, {
			events: [['https://a.example/login/oauth'], ['https://b.example/Deployment/login/oauth']],
			sessions: ['https://b.example/Deployment/login/oauth']
		});
	});

	test('a subsequent configuration cannot discard notifications awaiting registration', async () => {
		const { provider } = await create([a]);
		const registeredProviders: vscode.AuthenticationProvider[] = [];
		const registering = [Promise.withResolvers<void>(), Promise.withResolvers<void>()];
		registration.callsFake((_id, _label, registered) => {
			registeredProviders.push(registered);
			registering[registeredProviders.length - 1].resolve();
			return new vscode.Disposable(() => { });
		});
		const first = provider.update([]);
		const second = provider.update([b]);
		await registering[0].promise;
		assert.strictEqual(registeredProviders.length, 1);
		const events: string[][] = [];
		disposables.push(registeredProviders[0].onDidChangeSessions(event => events.push((event.removed ?? []).map(session => `removed:${session.authorizationServer!.toString()}`))));
		await first;
		await registering[1].promise;
		disposables.push(registeredProviders[1].onDidChangeSessions(event => events.push((event.added ?? []).map(session => `added:${session.authorizationServer!.toString()}`))));
		await second;
		assert.deepStrictEqual(events, [
			['removed:https://a.example/login/oauth'],
			['added:https://b.example/Deployment/login/oauth']
		]);
	});

	test('removing a host does not announce a session twice after it was already signed out', async () => {
		const { provider } = await create([a]);
		const [session] = await provider.getSessions();
		const events: vscode.AuthenticationProviderAuthenticationSessionsChangeEvent[] = [];
		disposables.push(provider.onDidChangeSessions(event => events.push(event)));
		await provider.removeSession(session.id);
		await provider.update([]);
		assert.deepStrictEqual(events, [{ added: [], removed: [session], changed: [] }]);
	});

	test('legacy storage identifiers survive canonicalization and restart', async () => {
		const { provider, engines, state } = await create([vscode.Uri.parse('https://GHE.EXAMPLE:8443/Team/')]);
		const before = await provider.getSessions();
		const restarted = await create([vscode.Uri.parse('https://ghe.example:8443/Team')], state);
		assert.deepStrictEqual({
			storageKeys: [...engines, ...restarted.engines].map(engine => engine.storageKey),
			reloaded: await restarted.provider.getSessions()
		}, { storageKeys: ['GHE.EXAMPLE:8443/Team/.ghes.auth', 'GHE.EXAMPLE:8443/Team/.ghes.auth'], reloaded: before });
	});

	test('an equivalent deprecated URI preserves the pre-upgrade storage key without becoming a default host', async () => {
		const { provider, engines } = await create([]);
		await provider.update([a, vscode.Uri.parse('https://ghe.example/Team')], { legacyUri: vscode.Uri.parse('https://GHE.EXAMPLE/Team/') });
		assert.deepStrictEqual({
			storageKeys: engines.map(engine => engine.storageKey),
			accounts: (await provider.getSessions()).map(session => session.account.label)
		}, {
			storageKeys: ['a.example/.ghes.auth', 'GHE.EXAMPLE/Team/.ghes.auth'],
			accounts: ['octocat (https://a.example/)', 'octocat (https://ghe.example/Team)']
		});
	});

	test('different schemes never share a keychain even though legacy keys omitted the scheme', async () => {
		const http = vscode.Uri.parse('http://a.example');
		const first = await create([http, a]);
		const second = await create([a]);
		await second.provider.update([http, a]);
		assert.deepStrictEqual({
			freshKeys: new Set(first.engines.map(engine => engine.storageKey)).size,
			updatedKeys: new Set(second.engines.map(engine => engine.storageKey)).size,
			originalKey: second.engines[0].storageKey
		}, { freshKeys: 2, updatedKeys: 2, originalKey: 'a.example/.ghes.auth' });
	});

	test('a session from another issuer cannot satisfy an explicitly selected server', async () => {
		const { provider, engines } = await create();
		engines[0].sessions[0] = { ...engines[0].sessions[0], authorizationServer: vscode.Uri.joinPath(b, '/login/oauth') };
		await assert.rejects(provider.getSessions(['repo'], { authorizationServer: vscode.Uri.joinPath(a, '/login/oauth') }), /does not belong/);
	});

	test('an empty or invalid configuration exposes no sessions and interactive creation explains the problem', async () => {
		const { provider } = await create([]);
		assert.deepStrictEqual(await provider.getSessions(), []);
		await assert.rejects(provider.createSession(['repo']), /Configure github-enterprise.uris/);
		await provider.update([], { error: 'Invalid enterprise configuration' });
		await assert.rejects(provider.createSession(['repo']), /Invalid enterprise configuration/);
		assert.strictEqual(picker.callCount, 0);
	});

	test('a host removed while the picker is open cannot start authentication', async () => {
		const { provider, engines } = await create();
		picker.callsFake(async items => {
			await provider.update([a]);
			return (await items)[1];
		});
		await assert.rejects(provider.createSession(['repo']), /no longer configured/);
		assert.deepStrictEqual(engines.map(engine => engine.creations), [[], []]);
	});

	test('a read completing after its host was removed cannot publish a retired session', async () => {
		const { provider, engines } = await create();
		let complete!: (sessions: vscode.AuthenticationSession[]) => void;
		const pending = new Promise<vscode.AuthenticationSession[]>(resolve => complete = resolve);
		sinon.stub(engines[1], 'getSessions').returns(pending);
		const read = provider.getSessions(['repo'], { authorizationServer: vscode.Uri.joinPath(b, '/login/oauth') });
		await provider.update([a]);
		complete(engines[1].sessions);
		assert.deepStrictEqual(await read, []);
	});

	test('a login completing after its host was removed is not returned as a configured session', async () => {
		const { provider, engines } = await create();
		let complete!: (session: vscode.AuthenticationSession) => void;
		const pending = new Promise<vscode.AuthenticationSession>(resolve => complete = resolve);
		sinon.stub(engines[1], 'createSession').returns(pending);
		const login = provider.createSession(['repo'], { authorizationServer: vscode.Uri.joinPath(b, '/login/oauth') });
		await provider.update([a]);
		complete(engines[1].sessions[0]);
		await assert.rejects(login, /no longer configured/);
	});

	test('disposal releases every engine and no longer forwards events', async () => {
		const { provider, engines } = await create();
		provider.dispose();
		assert.deepStrictEqual(engines.map(engine => engine.disposed), [true, true]);
	});

	test('in-flight work can finish logging after its host has been retired', () => {
		const logger = new Log(AuthProviderType.githubEnterprise, a);
		disposables.push(logger);
		logger.dispose();
		assert.doesNotThrow(() => {
			logger.trace('late read');
			logger.debug('late read');
			logger.info('late read');
			logger.warn('late read');
			logger.error('late read');
		});
	});

	test('simultaneous OAuth callbacks for identical scopes remain isolated by host', async () => {
		const clock = sinon.useFakeTimers();
		disposables.push(new vscode.Disposable(() => clock.restore()));
		const handler = new UriEventHandler();
		const cancellation = new vscode.CancellationTokenSource();
		const logger = new Log(AuthProviderType.githubEnterprise);
		disposables.push(handler, cancellation, logger);
		const received: string[] = [];
		const first = handler.waitForCode(logger, 'repo', 'nonce-a', cancellation.token, a).then(code => received.push(`a:${code}`));
		const second = handler.waitForCode(logger, 'repo', 'nonce-b', cancellation.token, b).then(code => received.push(`b:${code}`));
		handler.handleUri(vscode.Uri.parse('vscode://vscode.github-authentication/did-authenticate?nonce=nonce-b&code=code-b'));
		await second;
		assert.deepStrictEqual(received, ['b:code-b']);
		handler.handleUri(vscode.Uri.parse('vscode://vscode.github-authentication/did-authenticate?nonce=nonce-a&code=code-a'));
		await first;
		assert.deepStrictEqual(received, ['b:code-b', 'a:code-a']);
	});
});

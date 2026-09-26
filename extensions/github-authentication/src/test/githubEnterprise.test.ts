/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { Log } from '../common/logger';
import { AuthProviderType, IGitHubAuthenticationProvider, IGitHubAuthenticationProviderFactory, UriEventHandler } from '../github';
import { GitHubEnterpriseAuthenticationProvider } from '../githubEnterprise';
import { TestMemento } from './testMemento';
import { TestSecretStorage } from './testSecretStorage';
import { AccountLinks } from '../common/accountLinks';

class TestProvider implements IGitHubAuthenticationProvider {
	readonly changes = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
	readonly onDidChangeSessions = this.changes.event;
	disposed = false;
	sessions: vscode.AuthenticationSession[];
	readonly removals: string[] = [];
	readonly reads: vscode.AuthenticationProviderSessionOptions[] = [];
	readonly creations: vscode.AuthenticationProviderSessionOptions[] = [];

	constructor(readonly uri: vscode.Uri, readonly storageKey: string) {
		this.sessions = [{
			id: 'session',
			account: { id: '42', label: 'octocat', icon: vscode.Uri.parse('https://avatars.example/42') },
			accessToken: 'fake-token',
			scopes: ['repo'],
			authorizationServer: vscode.Uri.joinPath(uri, '/login/oauth'),
			expiresAfter: 60_000
		}];
	}

	async getSessionSnapshot(): Promise<readonly vscode.AuthenticationSession[]> { return this.sessions; }
	async getSessions(_scopes: readonly string[] | undefined, options: vscode.AuthenticationProviderSessionOptions): Promise<vscode.AuthenticationSession[]> {
		this.reads.push(options);
		return this.sessions;
	}
	async createSession(_scopes: readonly string[], options: vscode.AuthenticationProviderSessionOptions): Promise<vscode.AuthenticationSession> {
		this.creations.push(options);
		return this.sessions[0];
	}
	async removeSession(id: string): Promise<void> {
		this.removals.push(id);
		const removed = this.sessions;
		this.sessions = [];
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

	create(uri: vscode.Uri, storageKey: string): TestProvider {
		if (uri.authority === this.failFor) {
			throw new Error('Engine initialization failed');
		}
		const engine = new TestProvider(uri, storageKey);
		this.engines.push(engine);
		return engine;
	}
}

suite('GitHub Enterprise provider lifecycle', () => {
	const a = vscode.Uri.parse('https://a.example');
	const b = vscode.Uri.parse('https://b.example/Deployment');
	const disposables: vscode.Disposable[] = [];
	let registration: sinon.SinonStub;

	setup(() => {
		registration = sinon.stub(vscode.authentication, 'registerAuthenticationProvider').callsFake((_id, _label, provider) => provider.onDidChangeSessions(() => { }));
		sinon.stub(vscode.window, 'showQuickPick').rejects(new Error('Unexpected picker'));
		const logLevels = new vscode.EventEmitter<vscode.LogLevel>();
		disposables.push(logLevels);
		sinon.stub(vscode.window, 'createOutputChannel').returns({
			name: 'Test', logLevel: vscode.LogLevel.Info, onDidChangeLogLevel: logLevels.event,
			trace: sinon.stub(), debug: sinon.stub(), info: sinon.stub(), warn: sinon.stub(), error: sinon.stub(),
			append: sinon.stub(), appendLine: sinon.stub(), replace: sinon.stub(), clear: sinon.stub(),
			show: () => { }, hide: sinon.stub(), dispose: sinon.stub()
		});
	});

	teardown(() => {
		disposables.splice(0).reverse().forEach(disposable => disposable.dispose());
		sinon.restore();
	});

	async function create(uri?: vscode.Uri, state = new TestMemento(), secrets = new TestSecretStorage()) {
		const factory = new TestProviderFactory();
		const provider = new GitHubEnterpriseAuthenticationProvider(state, secrets, factory);
		disposables.push(secrets, provider);
		await provider.update(uri);
		return { provider, factory, state, secrets };
	}

	test('one registered host keeps native session identities and provider options', async () => {
		const { provider, factory } = await create(b);
		const native = factory.engines[0].sessions[0];
		const options = { account: native.account, authorizationServer: native.authorizationServer, resource: 'resource', clientId: 'client' };
		const sessions = await provider.getSessions(['repo'], options);
		const created = await provider.createSession(['repo'], options);
		assert.deepStrictEqual({
			sessions, created,
			options: factory.engines[0].creations,
			servers: registration.firstCall.args[3].supportedAuthorizationServers.map((uri: vscode.Uri) => uri.toString()),
			storageKey: factory.engines[0].storageKey
		}, { sessions: [native], created: native, options: [options], servers: ['https://b.example/Deployment/login/oauth'], storageKey: 'b.example/Deployment.ghes.auth' });
	});

	test('removing and restoring a host announces sessions without a client read', async () => {
		const { provider, factory } = await create(a);
		const native = factory.engines[0].sessions[0];
		const events: vscode.AuthenticationProviderAuthenticationSessionsChangeEvent[] = [];
		disposables.push(provider.onDidChangeSessions(event => events.push(event)));
		await provider.update();
		await provider.update(a);
		assert.deepStrictEqual({ events, retired: factory.engines[0].disposed }, {
			events: [{ added: [], removed: [native], changed: [] }, { added: [native], removed: [], changed: [] }],
			retired: true
		});
	});

	test('unchanged configuration preserves its engine and registration', async () => {
		const { provider, factory } = await create(a);
		await provider.update(a);
		assert.deepStrictEqual({ engines: factory.engines.length, registrations: registration.callCount }, { engines: 1, registrations: 1 });
	});

	test('equivalent URI edits retain the engine and its original token and account-link namespace', async () => {
		const original = vscode.Uri.parse('https://TENANT.example/Team/');
		const normalized = vscode.Uri.parse('https://tenant.example/Team');
		const state = new TestMemento();
		const secrets = new TestSecretStorage();
		disposables.push(secrets);
		const storageKey = 'TENANT.example/Team/.ghes.auth';
		await secrets.store(storageKey, 'fake-saved-token');
		const links = [{ gitHubAccountId: '42', gitHubAccountLabel: 'octocat', microsoftAccountLabel: 'mona@example.com' }];
		await state.update(`${storageKey}.microsoftAccountLinks`, links);
		const { provider, factory } = await create(original, state, secrets);
		await provider.update(normalized);
		const restarted = await create(normalized, state, secrets);
		const logger = new Log(AuthProviderType.githubEnterprise);
		disposables.push(logger);
		assert.deepStrictEqual({
			created: factory.engines.length,
			storage: [factory.engines[0].storageKey, restarted.factory.engines[0].storageKey],
			saved: await secrets.get(storageKey),
			links: new AccountLinks(state, `${restarted.factory.engines[0].storageKey}.microsoftAccountLinks`, logger).linkedAccounts()
		}, { created: 1, storage: [storageKey, storageKey], saved: 'fake-saved-token', links });
	});

	test('storage failures leave the live host usable without creating replacement engines', async () => {
		const { provider, factory, secrets } = await create(a);
		sinon.stub(secrets, 'get').callThrough().withArgs('b.example/Deployment.ghes.auth').rejects(new Error('Secret storage is unavailable'));
		await assert.rejects(provider.update(b), /Secret storage is unavailable/);
		assert.deepStrictEqual({ sessions: await provider.getSessions(), engines: factory.engines.length }, { sessions: factory.engines[0].sessions, engines: 1 });
	});

	test('a new scheme cannot claim an existing instance namespace', async () => {
		const { provider, factory } = await create(vscode.Uri.parse('https://a.example'));
		await provider.update(vscode.Uri.parse('http://a.example'));
		assert.deepStrictEqual(factory.engines.map(engine => engine.storageKey), [
			'a.example/.ghes.auth',
			'http%3A%2F%2Fa.example%2F.ghes.auth'
		]);
	});

	test('configuration failure leaves the current host usable and a later update can recover', async () => {
		const { provider, factory } = await create(a);
		factory.failFor = b.authority;
		await assert.rejects(provider.update(b), /Engine initialization failed/);
		assert.deepStrictEqual(await provider.getSessions(), factory.engines[0].sessions);
		factory.failFor = undefined;
		await provider.update(b);
		assert.deepStrictEqual({ retired: factory.engines[0].disposed, sessions: await provider.getSessions() }, { retired: true, sessions: factory.engines[1].sessions });
	});

	test('native session events and removals are forwarded unchanged', async () => {
		const { provider, factory } = await create(a);
		const native = factory.engines[0].sessions[0];
		const events: vscode.AuthenticationProviderAuthenticationSessionsChangeEvent[] = [];
		disposables.push(provider.onDidChangeSessions(event => events.push(event)));
		factory.engines[0].changes.fire({ added: [], removed: [], changed: [native] });
		await provider.removeSession(native.id);
		assert.deepStrictEqual({ events, removals: factory.engines[0].removals }, {
			events: [{ added: [], removed: [], changed: [native] }, { added: [], removed: [native], changed: [] }],
			removals: ['session']
		});
	});

	test('an unconfigured provider has empty reads and actionable interactive errors', async () => {
		const { provider } = await create();
		await provider.update(undefined, 'Invalid enterprise configuration');
		assert.deepStrictEqual(await provider.getSessions(), []);
		await assert.rejects(provider.createSession(['repo']), /Invalid enterprise configuration/);
	});

	test('configuration changes do not return a late result from a retired host', async () => {
		const { provider, factory } = await create(a);
		const pending = Promise.withResolvers<vscode.AuthenticationSession[]>();
		sinon.stub(factory.engines[0], 'getSessions').returns(pending.promise);
		const read = provider.getSessions(['repo']);
		await provider.update(b);
		pending.resolve(factory.engines[0].sessions);
		assert.deepStrictEqual(await read, []);
	});

	test('disposal cannot be followed by a new registration', async () => {
		const { provider, factory } = await create(a);
		provider.dispose();
		await assert.rejects(provider.update(b), vscode.CancellationError);
		assert.deepStrictEqual({ retired: factory.engines[0].disposed, registrations: registration.callCount }, { retired: true, registrations: 1 });
	});

	test('late logging after engine disposal is harmless', () => {
		const logger = new Log(AuthProviderType.githubEnterprise, a);
		disposables.push(logger);
		logger.dispose();
		assert.doesNotThrow(() => logger.info('late operation'));
	});

	test('public and enterprise OAuth callbacks with identical scopes stay isolated by host', async () => {
		const clock = sinon.useFakeTimers();
		disposables.push(new vscode.Disposable(() => clock.restore()));
		const handler = new UriEventHandler();
		const cancellation = new vscode.CancellationTokenSource();
		const logger = new Log(AuthProviderType.githubEnterprise);
		disposables.push(handler, cancellation, logger);
		const received: string[] = [];
		const first = handler.waitForCode(logger, 'repo', 'nonce-a', cancellation.token, vscode.Uri.parse('https://github.com')).then(code => received.push(`public:${code}`));
		const second = handler.waitForCode(logger, 'repo', 'nonce-b', cancellation.token, b).then(code => received.push(`enterprise:${code}`));
		handler.handleUri(vscode.Uri.parse('vscode://vscode.github-authentication/did-authenticate?nonce=nonce-b&code=code-b'));
		await second;
		assert.deepStrictEqual(received, ['enterprise:code-b']);
		handler.handleUri(vscode.Uri.parse('vscode://vscode.github-authentication/did-authenticate?nonce=nonce-a&code=code-a'));
		await first;
		assert.deepStrictEqual(received, ['enterprise:code-b', 'public:code-a']);
	});
});

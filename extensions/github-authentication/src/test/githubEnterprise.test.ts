/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { Log } from '../common/logger';
import * as github from '../github';
import { GitHubEnterpriseAuthenticationProvider } from '../githubEnterprise';
import { createTestExtensionContext } from './testExtensionContext';
import { TestSecretStorage } from './testSecretStorage';

const EngineConstructor = github.GitHubSessionEngine;

class TestSessionEngine {
	readonly changes = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
	readonly onDidChangeSessions = this.changes.event;
	readonly instance = sinon.createStubInstance(EngineConstructor);
	disposed = false;
	sessions: vscode.AuthenticationSession[];
	readonly removals: string[] = [];
	readonly reads: vscode.AuthenticationProviderSessionOptions[] = [];
	readonly creations: vscode.AuthenticationProviderSessionOptions[] = [];

	constructor(readonly uri: vscode.Uri, readonly storageKey: string) {
		sinon.stub(this.instance, 'onDidChangeSessions').get(() => this.onDidChangeSessions);
		this.instance.getSessions.callsFake((scopes, options) => this.getSessions(scopes, options ?? {}));
		this.instance.getCachedSessions.callsFake(() => this.getCachedSessions());
		this.instance.createSession.callsFake((scopes, options) => this.createSession(scopes, options ?? {}));
		this.instance.removeSession.callsFake(id => this.removeSession(id));
		this.instance.dispose.callsFake(() => this.dispose());
		this.sessions = [{
			id: 'session',
			account: { id: '42', label: 'octocat', icon: vscode.Uri.parse('https://avatars.example/42') },
			accessToken: 'fake-token',
			scopes: ['repo'],
			authorizationServer: vscode.Uri.joinPath(uri, '/login/oauth'),
			expiresAfter: 60_000
		}];
	}

	async getCachedSessions(): Promise<readonly vscode.AuthenticationSession[]> { return this.sessions; }
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

suite('GitHub Enterprise provider lifecycle', () => {
	const a = vscode.Uri.parse('https://a.example');
	const b = vscode.Uri.parse('https://b.example/Deployment');
	const disposables: vscode.Disposable[] = [];
	const constructions = new Map<vscode.ExtensionContext, { engines: TestSessionEngine[]; failFor?: string }>();
	let registration: sinon.SinonStub;

	setup(() => {
		sinon.stub(github, 'GitHubSessionEngine').callsFake((context, _uriHandler, uri, storageKey) => {
			const construction = constructions.get(context);
			assert.ok(construction && uri && storageKey);
			if (uri.authority === construction.failFor) {
				throw new Error('Engine initialization failed');
			}
			const engine = new TestSessionEngine(uri, storageKey);
			construction.engines.push(engine);
			return engine.instance;
		});
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
		constructions.clear();
		sinon.restore();
	});

	async function create(uri?: vscode.Uri) {
		const factory: { engines: TestSessionEngine[]; failFor?: string } = { engines: [] };
		const secrets = new TestSecretStorage();
		const uriHandler = new github.UriEventHandler();
		disposables.push(secrets, uriHandler);
		const context = createTestExtensionContext(disposables, secrets);
		constructions.set(context, factory);
		const provider = new GitHubEnterpriseAuthenticationProvider(context, uriHandler);
		disposables.push(provider);
		await provider.update(uri);
		return { provider, factory };
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

	for (const change of ['removed', 'changed', 'added'] as const) {
		test(`reconciles replacement sessions ${change} during preparation`, async () => {
			const { provider, factory } = await create(a);
			const previous = factory.engines[0].sessions[0];
			const snapshot = Promise.withResolvers<readonly vscode.AuthenticationSession[]>();
			const preparing = Promise.withResolvers<void>();
			sinon.stub(factory.engines[0], 'getCachedSessions').callsFake(() => {
				preparing.resolve();
				return snapshot.promise;
			});
			const events: vscode.AuthenticationProviderAuthenticationSessionsChangeEvent[] = [];
			disposables.push(provider.onDidChangeSessions(event => events.push(event)));
			const update = provider.update(b);
			await preparing.promise;
			const replacement = factory.engines[1];
			const original = replacement.sessions[0];
			const changed = { ...original, accessToken: 'changed-token' };
			const added = { ...original, id: 'added-session', account: { id: 'other', label: 'other' } };
			switch (change) {
				case 'removed':
					replacement.sessions = [];
					replacement.changes.fire({ added: [], changed: [], removed: [original] });
					break;
				case 'changed':
					replacement.sessions = [changed];
					replacement.changes.fire({ added: [], changed: [changed], removed: [] });
					break;
				case 'added':
					replacement.sessions = [original, added];
					replacement.changes.fire({ added: [added], changed: [], removed: [] });
					break;
			}
			snapshot.resolve([previous]);
			await update;
			assert.deepStrictEqual({
				events,
				sessions: await provider.getSessions()
			}, {
				events: [{ added: replacement.sessions, removed: [previous], changed: [] }],
				sessions: replacement.sessions
			});
		});
	}

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

	test('disposal releases a preparing engine and prevents in-flight and queued updates from registering', async () => {
		const { provider, factory } = await create(a);
		const preparing = Promise.withResolvers<void>();
		const pending = Promise.withResolvers<vscode.AuthenticationSession[]>();
		sinon.stub(TestSessionEngine.prototype, 'getSessions').callsFake(() => {
			preparing.resolve();
			return pending.promise;
		});
		const update = provider.update(b);
		await preparing.promise;
		const queued = provider.update(a);
		provider.dispose();
		const disposedBeforeCompletion = factory.engines.map(engine => engine.disposed);
		pending.resolve(factory.engines[1].sessions);
		await Promise.all([
			assert.rejects(update, vscode.CancellationError),
			assert.rejects(queued, vscode.CancellationError)
		]);
		assert.deepStrictEqual({
			disposedBeforeCompletion,
			engines: factory.engines.length,
			registrations: registration.callCount,
			sessions: await provider.getSessions()
		}, {
			disposedBeforeCompletion: [true, true],
			engines: 2,
			registrations: 1,
			sessions: []
		});
	});

	test('late logging after engine disposal is harmless', () => {
		const logger = new Log(github.AuthProviderType.githubEnterprise, a);
		disposables.push(logger);
		logger.dispose();
		assert.doesNotThrow(() => logger.info('late operation'));
	});

	test('public and enterprise OAuth callbacks with identical scopes stay isolated by host', async () => {
		const clock = sinon.useFakeTimers();
		disposables.push(new vscode.Disposable(() => clock.restore()));
		const handler = new github.UriEventHandler();
		const cancellation = new vscode.CancellationTokenSource();
		const logger = new Log(github.AuthProviderType.githubEnterprise);
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

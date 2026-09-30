/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { enterpriseUrisSetting } from '../common/enterpriseConfiguration';
import { enterpriseUriSetting } from '../common/enterpriseStorage';
import { activate } from '../extension';
import { GitHubSessionEngine } from '../github';
import { GitHubEnterpriseAuthenticationProvider } from '../githubEnterprise';
import { GitHubServer } from '../githubServer';
import { TestMemento } from './testMemento';
import { TestSecretStorage } from './testSecretStorage';
import { createTestExtensionContext } from './testExtensionContext';

suite('GitHub authentication activation', () => {
	const disposables: vscode.Disposable[] = [];
	const providers = new Map<string, vscode.AuthenticationProvider>();
	let registration: sinon.SinonStub;
	let errors: sinon.SinonStub;
	let configurationChanged: vscode.EventEmitter<vscode.ConfigurationChangeEvent>;
	let trustGranted: vscode.EventEmitter<void>;

	setup(() => {
		const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		disposables.push(new vscode.Disposable(() => clock.restore()));
		configurationChanged = new vscode.EventEmitter<vscode.ConfigurationChangeEvent>();
		trustGranted = new vscode.EventEmitter<void>();
		const logLevels = new vscode.EventEmitter<vscode.LogLevel>();
		disposables.push(configurationChanged, trustGranted, logLevels);
		sinon.stub(vscode.workspace, 'onDidChangeConfiguration').callsFake(configurationChanged.event);
		sinon.stub(vscode.workspace, 'onDidGrantWorkspaceTrust').callsFake(trustGranted.event);
		sinon.stub(vscode.window, 'registerUriHandler').returns(new vscode.Disposable(() => { }));
		sinon.stub(vscode.window, 'createOutputChannel').returns({
			name: 'Test',
			logLevel: vscode.LogLevel.Info,
			onDidChangeLogLevel: logLevels.event,
			trace: sinon.stub(), debug: sinon.stub(), info: sinon.stub(), warn: sinon.stub(), error: sinon.stub(),
			append: sinon.stub(), appendLine: sinon.stub(), replace: sinon.stub(), clear: sinon.stub(),
			show: () => { }, hide: sinon.stub(), dispose: sinon.stub()
		});
		sinon.stub(GitHubServer.prototype, 'sendAdditionalTelemetryInfo').resolves();
		errors = sinon.stub(vscode.window, 'showErrorMessage').resolves(undefined);
		registration = sinon.stub(vscode.authentication, 'registerAuthenticationProvider').callsFake((id, _label, provider) => {
			providers.set(id, provider);
			const listener = provider.onDidChangeSessions(() => { });
			return new vscode.Disposable(() => {
				listener.dispose();
				providers.delete(id);
			});
		});
	});

	teardown(() => {
		disposables.splice(0).reverse().forEach(disposable => disposable.dispose());
		providers.clear();
		sinon.restore();
	});

	function context(secrets: TestSecretStorage, state: TestMemento): vscode.ExtensionContext {
		return createTestExtensionContext(disposables, secrets, state);
	}

	function configure(uris: string[], legacy?: string, scope: 'globalValue' | 'workspaceValue' = 'globalValue') {
		const config: vscode.WorkspaceConfiguration = {
			get: sinon.stub().callsFake(key => key === enterpriseUrisSetting ? uris : key === enterpriseUriSetting ? legacy : true),
			inspect: sinon.stub().callsFake(() => ({ key: enterpriseUrisSetting, defaultValue: [], [scope]: uris })),
			has: sinon.stub(),
			update: sinon.stub()
		};
		sinon.stub(vscode.workspace, 'getConfiguration').returns(config);
		return {
			setUri(value: string): void { uris = [value]; }
		};
	}

	const publicSession: vscode.AuthenticationSession = {
		id: 'public-session',
		account: { id: '42', label: 'octocat' },
		accessToken: 'fake-public-token',
		scopes: ['repo'],
		authorizationServer: vscode.Uri.parse('https://github.com/login/oauth')
	};

	test('enterprise account-menu labels always include the host and stay stable across configuration changes', async () => {
		const secrets = new TestSecretStorage();
		disposables.push(secrets);
		await secrets.store('github.auth', JSON.stringify([publicSession]));
		await secrets.store('https://tenant.ghe.com/.ghes.auth', JSON.stringify([{
			...publicSession, id: 'tenant-session', authorizationServer: vscode.Uri.parse('https://tenant.ghe.com/login/oauth')
		}]));
		await secrets.store('https://server.example:8443/Team.ghes.auth', JSON.stringify([{
			...publicSession, id: 'server-session', authorizationServer: vscode.Uri.parse('https://server.example:8443/Team/login/oauth')
		}]));
		const hosts = ['https://tenant.ghe.com'];
		configure(hosts);
		const update = sinon.spy(GitHubEnterpriseAuthenticationProvider.prototype, 'update');
		const writes = sinon.spy(secrets, 'store');
		await activate(context(secrets, new TestMemento()));
		const enterprise = providers.get('github-enterprise');
		const publicProvider = providers.get('github');
		assert.ok(enterprise && publicProvider);
		const menuLabels = async () => (await enterprise.getSessions(['repo'], {})).map(session => `${session.account.label} (${registration.lastCall.args[1]})`);
		const single = await menuLabels();

		hosts.push('https://server.example:8443/Team');
		configurationChanged.fire({ affectsConfiguration: section => section === enterpriseUrisSetting });
		await update.lastCall.returnValue;
		const multiple = await menuLabels();

		hosts.splice(1, 1);
		configurationChanged.fire({ affectsConfiguration: section => section === enterpriseUrisSetting });
		await update.lastCall.returnValue;
		assert.deepStrictEqual({
			single, multiple,
			singleAgain: await menuLabels(),
			publicLabels: (await publicProvider.getSessions(['repo'], {})).map(session => session.account.label),
			writes: writes.callCount
		}, {
			single: ['octocat - tenant.ghe.com (GitHub Enterprise)'],
			multiple: ['octocat - server.example:8443/Team (GitHub Enterprise)', 'octocat - tenant.ghe.com (GitHub Enterprise)'],
			singleAgain: single,
			publicLabels: ['octocat'],
			writes: 0
		});
	});

	test('enterprise initialization failure leaves public GitHub active and registers an actionable error', async () => {
		const secrets = new TestSecretStorage();
		disposables.push(secrets);
		await secrets.store('github.auth', JSON.stringify([publicSession]));
		const state = new TestMemento();
		configure(['https://tenant.example/Team']);
		const read = sinon.stub(GitHubSessionEngine.prototype, 'getSessions').callThrough();
		read.onFirstCall().rejects(new Error('Enterprise initialization failed'));

		await activate(context(secrets, state));

		const publicProvider = providers.get('github');
		const enterpriseProvider = providers.get('github-enterprise');
		assert.ok(publicProvider && enterpriseProvider);
		const message = /Enterprise initialization failed/;
		assert.match(errors.firstCall.args[0], message);
		await assert.rejects(Promise.resolve(enterpriseProvider.createSession(['repo'], {})), message);
		assert.deepStrictEqual({
			publicTokens: (await publicProvider.getSessions(['repo'], {})).map(session => session.accessToken),
			enterpriseSessions: await enterpriseProvider.getSessions(undefined, {}),
			providers: [...providers.keys()],
			errorCount: errors.callCount
		}, { publicTokens: [publicSession.accessToken], enterpriseSessions: [], providers: ['github', 'github-enterprise'], errorCount: 1 });
	});

	test('a configuration change can recover enterprise authentication after an initial failure', async () => {
		const secrets = new TestSecretStorage();
		disposables.push(secrets);
		configure(['https://tenant.example/Team']);
		const read = sinon.stub(GitHubSessionEngine.prototype, 'getSessions').callThrough();
		read.onFirstCall().rejects(new Error('Enterprise initialization failed'));
		const update = sinon.spy(GitHubEnterpriseAuthenticationProvider.prototype, 'update');
		await activate(context(secrets, new TestMemento()));
		const publicProvider = providers.get('github');

		configurationChanged.fire({ affectsConfiguration: section => section === enterpriseUriSetting });
		await update.lastCall.returnValue;

		assert.deepStrictEqual({
			samePublicProvider: providers.get('github') === publicProvider,
			issuers: registration.lastCall.args[3].supportedAuthorizationServers.map((uri: vscode.Uri) => uri.toString()),
			errorCount: errors.callCount,
			attempts: read.callCount
		}, { samePublicProvider: true, issuers: ['https://tenant.example/Team/login/oauth'], errorCount: 1, attempts: 2 });
	});

	for (const failure of ['secret read', 'account link migration', 'conflicting stores'] as const) {
		test(`enterprise ${failure} failure leaves public GitHub active and registers an actionable enterprise error`, async () => {
			const secrets = new TestSecretStorage();
			disposables.push(secrets);
			await secrets.store('github.auth', JSON.stringify([publicSession]));
			const state = new TestMemento();
			configure(['https://tenant.example/Team', 'https://tenant.example/Team/']);
			if (failure === 'secret read') {
				sinon.stub(secrets, 'get').callThrough().withArgs('https://tenant.example/Team.ghes.auth').rejects(new Error('Secret storage is unavailable'));
			} else if (failure === 'account link migration') {
				await state.update('tenant.example/Team.ghes.auth.microsoftAccountLinks', [{
					gitHubAccountId: '42', gitHubAccountLabel: 'octocat', microsoftAccountLabel: 'mona@example.com'
				}]);
				state.updateError = new Error('Account link storage is unavailable');
			} else {
				await secrets.store('tenant.example/Team.ghes.auth', JSON.stringify([publicSession]));
				await secrets.store('tenant.example/Team/.ghes.auth', JSON.stringify([publicSession]));
			}

			await activate(context(secrets, state));

			const publicProvider = providers.get('github');
			const enterpriseProvider = providers.get('github-enterprise');
			assert.ok(publicProvider && enterpriseProvider);
			const message = failure === 'secret read' ? /Secret storage is unavailable/ : failure === 'account link migration' ? /Account link storage is unavailable/ : /Multiple saved authentication stores/;
			assert.match(errors.firstCall.args[0], message);
			await assert.rejects(Promise.resolve(enterpriseProvider.createSession(['repo'], {})), message);
			assert.deepStrictEqual({
				publicTokens: (await publicProvider.getSessions(['repo'], {})).map(session => session.accessToken),
				enterpriseSessions: await enterpriseProvider.getSessions(undefined, {}),
				providers: [...providers.keys()],
				errorCount: errors.callCount
			}, { publicTokens: [publicSession.accessToken], enterpriseSessions: [], providers: ['github', 'github-enterprise'], errorCount: 1 });
		});
	}

	test('a configuration change can recover enterprise authentication after an initial storage failure', async () => {
		const secrets = new TestSecretStorage();
		disposables.push(secrets);
		configure(['https://tenant.example/Team']);
		const read = sinon.stub(secrets, 'get').callThrough().withArgs('https://tenant.example/Team.ghes.auth').rejects(new Error('Secret storage is unavailable'));
		const update = sinon.spy(GitHubEnterpriseAuthenticationProvider.prototype, 'update');
		await activate(context(secrets, new TestMemento()));
		const publicProvider = providers.get('github');
		read.resolves(undefined);

		configurationChanged.fire({ affectsConfiguration: section => section === enterpriseUrisSetting });
		await update.lastCall.returnValue;

		assert.deepStrictEqual({
			samePublicProvider: providers.get('github') === publicProvider,
			issuers: registration.lastCall.args[3].supportedAuthorizationServers.map((uri: vscode.Uri) => uri.toString()),
			errorCount: errors.callCount
		}, { samePublicProvider: true, issuers: ['https://tenant.example/Team/login/oauth'], errorCount: 1 });
	});

	for (const { changes, replacementFails } of [
		{ changes: ['https://replacement.example'], replacementFails: false },
		{ changes: ['https://replacement.example', 'https://initial.example'], replacementFails: false },
		{ changes: ['https://replacement.example'], replacementFails: true },
	]) {
		test(`initial failure preserves the latest configuration ${replacementFails ? 'error' : 'session'} (${changes.join(' -> ')})`, async () => {
			const secrets = new TestSecretStorage();
			disposables.push(secrets);
			const config = configure(['https://initial.example']);
			const initialRead = Promise.withResolvers<vscode.AuthenticationSession[]>();
			const initialStarted = Promise.withResolvers<void>();
			for (const uri of new Set(['https://initial.example', ...changes])) {
				const parsed = vscode.Uri.parse(uri);
				await secrets.store(`${parsed.authority}${parsed.path}.ghes.auth`, JSON.stringify([{
					...publicSession,
					accessToken: 'fake-enterprise-token',
					authorizationServer: vscode.Uri.joinPath(parsed, '/login/oauth')
				}]));
			}
			const read = sinon.stub(GitHubSessionEngine.prototype, 'getSessions').callThrough();
			const disposed = sinon.spy(GitHubSessionEngine.prototype, 'dispose');
			read.onFirstCall().callsFake(() => {
				initialStarted.resolve();
				return initialRead.promise;
			});
			if (replacementFails) {
				read.onSecondCall().rejects(new Error('Replacement initialization failed'));
			}
			const update = sinon.spy(GitHubEnterpriseAuthenticationProvider.prototype, 'update');
			const activation = activate(context(secrets, new TestMemento()));
			await initialStarted.promise;
			for (const uri of changes) {
				config.setUri(uri);
				configurationChanged.fire({ affectsConfiguration: section => section === enterpriseUrisSetting });
			}
			const latestUpdate = update.lastCall.returnValue;
			initialRead.reject(new Error('Superseded initialization failed'));
			await activation;
			if (replacementFails) {
				await assert.rejects(latestUpdate, /Replacement initialization failed/);
			} else {
				await latestUpdate;
			}
			const enterpriseProvider = providers.get('github-enterprise');
			assert.ok(enterpriseProvider);
			if (replacementFails) {
				await assert.rejects(Promise.resolve(enterpriseProvider.createSession(['repo'], {})), /Replacement initialization failed/);
			}
			assert.deepStrictEqual({
				issuers: (await enterpriseProvider.getSessions(undefined, {})).map(session => session.authorizationServer?.toString()),
				disposed: disposed.callCount,
				errors: errors.callCount,
				updates: update.callCount
			}, {
				issuers: replacementFails ? [] : [`${changes[changes.length - 1]}/login/oauth`],
				disposed: replacementFails ? 1 + changes.length : changes.length,
				errors: replacementFails ? 2 : 1,
				updates: 1 + changes.length
			});
		});
	}

	test('granting trust applies an explicitly empty workspace list without depending on a value-change event', async () => {
		const secrets = new TestSecretStorage();
		disposables.push(secrets);
		let trusted = false;
		sinon.stub(vscode.workspace, 'isTrusted').get(() => trusted);
		configure([], 'https://legacy.example', 'workspaceValue');
		const update = sinon.spy(GitHubEnterpriseAuthenticationProvider.prototype, 'update');
		await activate(context(secrets, new TestMemento()));
		const before = registration.lastCall.args[3].supportedAuthorizationServers.map((uri: vscode.Uri) => uri.toString());

		trusted = true;
		trustGranted.fire();
		await update.lastCall.returnValue;

		assert.deepStrictEqual({
			before,
			after: registration.lastCall.args[3].supportedAuthorizationServers,
			errorCount: errors.callCount
		}, { before: ['https://legacy.example/login/oauth'], after: [], errorCount: 0 });
	});
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { enterpriseUriSetting } from '../common/enterpriseConfiguration';
import { activate } from '../extension';
import { GitHubEnterpriseAuthenticationProvider } from '../githubEnterprise';
import { GitHubServer } from '../githubServer';
import { TestMemento } from './testMemento';
import { TestSecretStorage } from './testSecretStorage';

suite('GitHub authentication activation', () => {
	const disposables: vscode.Disposable[] = [];
	const providers = new Map<string, vscode.AuthenticationProvider>();
	let registration: sinon.SinonStub;
	let errors: sinon.SinonStub;
	let configurationChanged: vscode.EventEmitter<vscode.ConfigurationChangeEvent>;

	setup(() => {
		const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		disposables.push(new vscode.Disposable(() => clock.restore()));
		configurationChanged = new vscode.EventEmitter<vscode.ConfigurationChangeEvent>();
		const logLevels = new vscode.EventEmitter<vscode.LogLevel>();
		disposables.push(configurationChanged, logLevels);
		sinon.stub(vscode.workspace, 'onDidChangeConfiguration').callsFake(configurationChanged.event);
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
		const extension = vscode.extensions.getExtension('vscode.github-authentication');
		assert.ok(extension);
		const storageUri = vscode.Uri.parse('test-storage:/github-authentication');
		return {
			subscriptions: disposables,
			workspaceState: state,
			globalState: Object.assign(state, { setKeysForSync: () => { } }),
			secrets,
			extension,
			extensionUri: extension.extensionUri,
			extensionPath: extension.extensionPath,
			extensionMode: vscode.ExtensionMode.Test,
			storageUri: undefined,
			storagePath: undefined,
			globalStorageUri: storageUri,
			globalStoragePath: storageUri.fsPath,
			logUri: storageUri,
			logPath: storageUri.fsPath,
			asAbsolutePath: relativePath => vscode.Uri.joinPath(extension.extensionUri, relativePath).fsPath,
			get environmentVariableCollection(): vscode.GlobalEnvironmentVariableCollection { throw new Error('Unexpected environment access'); },
			get languageModelAccessInformation(): vscode.LanguageModelAccessInformation { throw new Error('Unexpected language model access'); }
		};
	}

	function configure(uri: string) {
		const config: vscode.WorkspaceConfiguration = {
			get: sinon.stub().callsFake(key => key === enterpriseUriSetting ? uri : true),
			inspect: sinon.stub(),
			has: sinon.stub(),
			update: sinon.stub()
		};
		sinon.stub(vscode.workspace, 'getConfiguration').returns(config);
	}

	const publicSession: vscode.AuthenticationSession = {
		id: 'public-session',
		account: { id: '42', label: 'octocat' },
		accessToken: 'fake-public-token',
		scopes: ['repo'],
		authorizationServer: vscode.Uri.parse('https://github.com/login/oauth')
	};

	for (const failure of ['secret read', 'mapping write'] as const) {
		test(`enterprise ${failure} failure leaves public GitHub active and registers an actionable enterprise error`, async () => {
			const secrets = new TestSecretStorage();
			disposables.push(secrets);
			await secrets.store('github.auth', JSON.stringify([publicSession]));
			const state = new TestMemento();
			configure('https://tenant.example/Team');
			if (failure === 'secret read') {
				sinon.stub(secrets, 'get').callThrough().withArgs('tenant.example/Team.ghes.auth').rejects(new Error('Secret storage is unavailable'));
			} else {
				state.updateError = new Error('Namespace mapping is unavailable');
			}

			await activate(context(secrets, state));

			const publicProvider = providers.get('github');
			const enterpriseProvider = providers.get('github-enterprise');
			assert.ok(publicProvider && enterpriseProvider);
			const message = failure === 'secret read' ? /Secret storage is unavailable/ : /Namespace mapping is unavailable/;
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
		configure('https://tenant.example/Team');
		const read = sinon.stub(secrets, 'get').callThrough().withArgs('tenant.example/Team.ghes.auth').rejects(new Error('Secret storage is unavailable'));
		const update = sinon.spy(GitHubEnterpriseAuthenticationProvider.prototype, 'update');
		await activate(context(secrets, new TestMemento()));
		const publicProvider = providers.get('github');
		read.resolves(undefined);

		configurationChanged.fire({ affectsConfiguration: section => section === enterpriseUriSetting });
		await update.lastCall.returnValue;

		assert.deepStrictEqual({
			samePublicProvider: providers.get('github') === publicProvider,
			issuers: registration.lastCall.args[3].supportedAuthorizationServers.map((uri: vscode.Uri) => uri.toString()),
			errorCount: errors.callCount
		}, { samePublicProvider: true, issuers: ['https://tenant.example/Team/login/oauth'], errorCount: 1 });
	});

});

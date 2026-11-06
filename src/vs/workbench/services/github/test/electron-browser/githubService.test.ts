/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { IDefaultAccount } from '../../../../../base/common/defaultAccount.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IGitHubAccountClient } from '../../../../../platform/github/common/account/account.js';
import { IGitHubAnonymousClient } from '../../../../../platform/github/common/anonymous/anonymous.js';
import { GitHubAuthorizationContext } from '../../../../../platform/github/common/githubTypes.js';
import { ISharedProcessGitHubService } from '../../../../../platform/github/common/remote/ipc.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IAuthenticationService } from '../../../authentication/common/authentication.js';
import { NativeWorkbenchGitHubService } from '../../electron-browser/githubService.js';

suite('Native workbench GitHub API clients', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const signal = () => new AbortController().signal;

	function setup() {
		const accountChanged = store.add(new Emitter<IDefaultAccount | null>());
		const account: IDefaultAccount = {
			accountName: 'account', sessionId: 'default', enterprise: false,
			authenticationProvider: { id: 'github', name: 'GitHub', enterprise: false },
		};
		const accounts = new class extends mock<IDefaultAccountService>() {
			override currentDefaultAccount: IDefaultAccount | null = account;
			override readonly onDidChangeDefaultAccount = accountChanged.event;
			override getDefaultAccountAuthenticationProvider() { return account.authenticationProvider; }
		}();
		const requests: GitHubAuthorizationContext[] = [];
		const anonymousSignals: AbortSignal[] = [];
		let authenticationLookups = 0;
		let disposed = 0;
		const client = new class extends mock<IGitHubAccountClient>() {
			override dispose(): void { disposed++; }
		}();
		const anonymousClient = new class extends mock<IGitHubAnonymousClient>() {
			override dispose(): void { disposed++; }
		}();
		const pending = new DeferredPromise<IGitHubAccountClient>();
		const started = new DeferredPromise<void>();
		let delayed = false;
		const configuration = new TestConfigurationService({});
		store.add(configuration.onDidChangeConfigurationEmitter);
		const service = store.add(new NativeWorkbenchGitHubService(
			new class extends mock<IAuthenticationService>() {
				override readonly onDidChangeSessions = Event.None;
				override async getSessions(_provider: string, _scopes: readonly string[], options?: { silent?: boolean }) {
					authenticationLookups++;
					assert.deepStrictEqual(options, { silent: true });
					return [
						{ id: 'default', account: { id: 'account', label: 'Account' }, scopes: ['user:email'], accessToken: 'never-forwarded' },
						{ id: 'repo', account: { id: 'account', label: 'Account' }, scopes: ['repo'], accessToken: 'never-forwarded' },
						{ id: 'other', account: { id: 'other', label: 'Other' }, scopes: ['repo'], accessToken: 'never-forwarded' },
					];
				}
			}(),
			accounts, new NullLogService(), NullTelemetryService,
			new class extends mock<IProductService>() { override readonly applicationName = 'test'; override readonly version = '1'; }(),
			configuration,
			new class extends mock<ISharedProcessGitHubService>() {
				override async acquireAnonymousClient(signal: AbortSignal) {
					signal.throwIfAborted();
					anonymousSignals.push(signal);
					return anonymousClient;
				}
				override async acquireClient(authorization: GitHubAuthorizationContext) {
					requests.push(authorization);
					void started.complete();
					return delayed ? pending.p : client;
				}
			}(),
		));
		return {
			service, client, requests, accountChanged, accounts, pending, started, anonymousClient, anonymousSignals,
			delay: () => { delayed = true; }, disposed: () => disposed, authenticationLookups: () => authenticationLookups,
		};
	}

	test('forwards anonymous acquisition to IPC without resolving an account', async () => {
		const { service, accounts, anonymousClient, anonymousSignals, requests, authenticationLookups, disposed } = setup();
		accounts.currentDefaultAccount = null;
		const acquisitionSignal = signal();
		const client = await service.acquireAnonymousApiClient(acquisitionSignal);
		client.dispose();
		assert.deepStrictEqual({
			remoteClient: client === anonymousClient, signal: anonymousSignals[0] === acquisitionSignal,
			acquisitions: anonymousSignals.length, requests, authenticationLookups: authenticationLookups(), disposed: disposed(),
		}, { remoteClient: true, signal: true, acquisitions: 1, requests: [], authenticationLookups: 0, disposed: 1 });
	});

	test('selects the repository grant in the renderer and acquires the actual client through IPC', async () => {
		const { service, requests, client } = setup();
		const result = await service.acquireDefaultAccountApiClient(signal());
		assert.deepStrictEqual({ sameClient: result === client, requests }, {
			sameClient: true, requests: [{ providerId: 'github', sessionId: 'repo', accountId: 'account', scopes: ['repo'] }],
		});
		result.dispose();
	});

	test('forwards an explicitly selected grant through IPC without choosing the default account', async () => {
		const { service, requests, client, accounts } = setup();
		accounts.currentDefaultAccount = null;
		const authorization = { providerId: 'github', sessionId: 'other', accountId: 'other', scopes: ['repo'] };
		const result = await service.acquireAccountApiClient(authorization, signal());
		assert.deepStrictEqual({ sameClient: result === client, requests }, {
			sameClient: true, requests: [{ ...authorization, authorizationServer: undefined }],
		});
		result.dispose();
	});

	test('disposes an explicit shared-process lease that arrives after cancellation', async () => {
		const { service, client, delay, pending, started, disposed } = setup();
		delay();
		const controller = new AbortController();
		const rejected = assert.rejects(service.acquireAccountApiClient({ providerId: 'github', sessionId: 'other', accountId: 'other', scopes: ['repo'] }, controller.signal));
		await started.p;
		controller.abort(new Error('cancelled'));
		await pending.complete(client);
		await rejected;
		assert.strictEqual(disposed(), 1);
	});

	test('disposes a late shared-process lease after cancellation', async () => {
		const { service, client, delay, pending, started, disposed } = setup();
		delay();
		const controller = new AbortController();
		const rejected = assert.rejects(service.acquireDefaultAccountApiClient(controller.signal));
		await started.p;
		controller.abort(new Error('cancelled'));
		await pending.complete(client);
		await rejected;
		assert.strictEqual(disposed(), 1);
	});

	test('disposes a shared-process lease that arrives after the selected default account changes', async () => {
		const { service, client, delay, pending, started, accounts, accountChanged, disposed } = setup();
		delay();
		const rejected = assert.rejects(service.acquireDefaultAccountApiClient(signal()), { kind: 'authentication' });
		await started.p;
		accounts.currentDefaultAccount = null;
		accountChanged.fire(null);
		await pending.complete(client);
		await rejected;
		assert.strictEqual(disposed(), 1);
	});
});

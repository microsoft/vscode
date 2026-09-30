/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { IDefaultAccount } from '../../../../../base/common/defaultAccount.js';
import { Emitter } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { ITelemetryService, TELEMETRY_SETTING_ID, TelemetryLevel } from '../../../../../platform/telemetry/common/telemetry.js';
import { AuthenticationSession, AuthenticationSessionsChangeEvent, IAuthenticationGetSessionsOptions, IAuthenticationService } from '../../../authentication/common/authentication.js';
import { WorkbenchGitHubService } from '../../browser/githubService.js';

suite('Workbench GitHub service', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const signal = () => new AbortController().signal;
	const provider = { id: 'github', name: 'GitHub', enterprise: false };

	function session(id = 'session', accountId = 'account', scopes: readonly string[] = ['repo']): AuthenticationSession {
		return { id, accessToken: `token-${id}`, account: { id: accountId, label: accountId }, scopes };
	}

	function setup(sessions: AuthenticationSession[] = [session()], telemetryService: ITelemetryService = NullTelemetryService, getSessions?: () => Promise<readonly AuthenticationSession[]>) {
		const changed = store.add(new Emitter<{ providerId: string; label: string; event: AuthenticationSessionsChangeEvent }>());
		const defaultChanged = store.add(new Emitter<IDefaultAccount | null>());
		const configuration = new TestConfigurationService({ [TELEMETRY_SETTING_ID]: 'all' });
		store.add(configuration.onDidChangeConfigurationEmitter);
		const state: { account: IDefaultAccount | null; enterpriseUrl?: string; pendingDefaultAccount?: Promise<IDefaultAccount | null> } = {
			account: { authenticationProvider: provider, accountName: 'account', sessionId: 'session', enterprise: false },
		};
		const calls: { providerId: string; options: IAuthenticationGetSessionsOptions | undefined }[] = [];
		const service = store.add(new WorkbenchGitHubService(
			new class extends mock<IAuthenticationService>() {
				override readonly onDidChangeSessions = changed.event;
				override async getSessions(providerId: string, _scopes: readonly string[], options?: IAuthenticationGetSessionsOptions): Promise<readonly AuthenticationSession[]> {
					calls.push({ providerId, options });
					return getSessions ? getSessions() : sessions;
				}
			}(),
			new class extends mock<IDefaultAccountService>() {
				override readonly onDidChangeDefaultAccount = defaultChanged.event;
				override get currentDefaultAccount() { return state.account; }
				override async getDefaultAccount() { return state.pendingDefaultAccount ?? state.account; }
				override getDefaultAccountAuthenticationProvider() { return state.account?.authenticationProvider ?? provider; }
				override resolveGitHubUrl() { return state.enterpriseUrl; }
			}(),
			new NullLogService(), telemetryService,
			new class extends mock<IProductService>() {
				override readonly applicationName = 'code-insiders';
				override readonly version = '1.141.0';
			}(),
			configuration,
		));
		return { service, sessions, state, changed, defaultChanged, calls, configuration };
	}

	for (const selection of ['default', 'explicit'] as const) {
		test(`${selection} selection cancels while the authentication provider is pending`, async () => {
			const lookup = new DeferredPromise<readonly AuthenticationSession[]>();
			const { service } = setup(undefined, undefined, () => lookup.p);
			const controller = new AbortController();
			const reason = new Error('cancelled');
			const pending = selection === 'default'
				? service.acquireDefaultAccountClient(controller.signal)
				: service.acquireSessionClient('github', 'session', controller.signal);
			let settled = false;
			const rejected = assert.rejects(pending, error => error === reason).then(() => { settled = true; });
			controller.abort(reason);
			await timeout(0);
			const cancelledBeforeProviderResolved = settled;
			await lookup.complete([session()]);
			await rejected;
			assert.strictEqual(cancelledBeforeProviderResolved, true);
		});

		test(`${selection} selection expires while the authentication provider is pending`, async () => {
			await runWithFakedTimers({}, async () => {
				const lookup = new DeferredPromise<readonly AuthenticationSession[]>();
				const { service } = setup(undefined, undefined, () => lookup.p);
				const pending = selection === 'default'
					? service.acquireDefaultAccountClient(signal())
					: service.acquireSessionClient('github', 'session', signal());
				let settled = false;
				const rejected = assert.rejects(pending, { kind: 'timeout' }).then(() => { settled = true; });
				await timeout(5 * 60_000);
				const timedOutBeforeProviderResolved = settled;
				await lookup.complete([session()]);
				await rejected;
				assert.strictEqual(timedOutBeforeProviderResolved, true);
			});
		});
	}

	test('retains the selected default client between consumers', async () => {
		const { service } = setup();
		const first = store.add(await service.acquireDefaultAccountClient(signal()));
		first.dispose();
		const next = store.add(await service.acquireDefaultAccountClient(signal()));
		assert.strictEqual(next.object === first.object, true);
	});

	for (const stop of ['cancel', 'dispose'] as const) {
		test(`default account lookup stops on ${stop} before the account provider responds`, async () => {
			const { service, state, calls } = setup();
			const account = state.account;
			const lookup = new DeferredPromise<IDefaultAccount | null>();
			state.account = null;
			state.pendingDefaultAccount = lookup.p;
			const controller = new AbortController();
			const reason = new Error('cancelled');
			const pending = service.acquireDefaultAccountClient(controller.signal);
			let settled = false;
			const rejected = assert.rejects(pending, error => stop === 'cancel' ? error === reason : error instanceof Error && /disposed/.test(error.message)).then(() => { settled = true; });
			if (stop === 'cancel') {
				controller.abort(reason);
			} else {
				service.dispose();
			}
			await timeout(0);
			const stoppedBeforeProviderResolved = settled;
			await lookup.complete(account);
			await rejected;
			assert.deepStrictEqual({ stoppedBeforeProviderResolved, calls }, { stoppedBeforeProviderResolved: true, calls: [] });
		});
	}

	test('does not combine a stale account selection with a replacement enterprise endpoint', async () => {
		const lookup = new DeferredPromise<readonly AuthenticationSession[]>();
		const { service, state, defaultChanged } = setup(undefined, undefined, () => lookup.p);
		state.account = { authenticationProvider: { id: 'github-enterprise', name: 'Enterprise', enterprise: true }, accountName: 'account', sessionId: 'session', enterprise: true };
		state.enterpriseUrl = 'https://first.ghe.com';
		const pending = assert.rejects(service.acquireDefaultAccountClient(signal()), { kind: 'authentication' });
		state.enterpriseUrl = 'https://second.ghe.com';
		defaultChanged.fire(state.account);
		await lookup.complete([session()]);
		await pending;
	});

	test('selects an existing least-scoped repository session for the default account silently', async () => {
		const { service, calls } = setup([
			session('session', 'account', ['read:user']),
			session('broad', 'account', ['repo', 'user:email']),
			session('other-account', 'other', ['repo']),
			session('repository', 'account', ['repo']),
		]);
		const client = store.add(await service.acquireDefaultAccountClient(signal())).object;
		assert.deepStrictEqual({ authorization: client.authorization, endpoint: client.endpoint.getApiBaseUri(), calls }, {
			authorization: { providerId: 'github', sessionId: 'repository', scopes: ['repo'] },
			endpoint: 'https://api.github.com', calls: [{ providerId: 'github', options: { silent: true } }],
		});
	});

	test('missing repository access does not prompt or use another account', async () => {
		const { service, calls } = setup([session('session', 'account', ['read:user']), session('other', 'other', ['repo'])]);
		await assert.rejects(service.acquireDefaultAccountClient(signal()), { kind: 'authentication' });
		assert.deepStrictEqual(calls, [{ providerId: 'github', options: { silent: true } }]);
	});

	test('missing default account or session does not silently select another', async () => {
		const { service, state } = setup([session('other')]);
		await assert.rejects(service.acquireDefaultAccountClient(signal()), { kind: 'authentication' });
		state.account = null;
		await assert.rejects(service.acquireDefaultAccountClient(signal()), { kind: 'authentication' });
	});

	test('explicit session clients coexist without using the default account', async () => {
		const { service, state } = setup([session('first'), session('second', 'other')]);
		state.account = null;
		const first = store.add(await service.acquireSessionClient('github', 'first', signal())).object;
		const second = store.add(await service.acquireSessionClient('github', 'second', signal())).object;
		assert.deepStrictEqual({ sessions: [first.authorization.sessionId, second.authorization.sessionId], isolated: first !== second }, {
			sessions: ['first', 'second'], isolated: true,
		});
	});

	test('session changes invalidate only the affected authorization context', async () => {
		const { service, sessions, changed } = setup([session('first'), session('second', 'other')]);
		const first = store.add(await service.acquireSessionClient('github', 'first', signal())).object;
		const second = store.add(await service.acquireSessionClient('github', 'second', signal())).object;
		const invalidated: string[] = [];
		store.add(first.onDidInvalidate(() => invalidated.push('first')));
		store.add(second.onDidInvalidate(() => invalidated.push('second')));
		changed.fire({ providerId: 'github', label: 'GitHub', event: { added: [], changed: [], removed: [sessions[0]] } });
		await assert.rejects(first.credentials.getCredential(signal()), /disposed/);
		const retained = store.add(await service.acquireSessionClient('github', 'second', signal())).object;
		assert.deepStrictEqual({ invalidated, retained: retained === second }, { invalidated: ['first'], retained: true });
	});

	test('changing the default account does not revoke explicit clients for the old account', async () => {
		const { service, state, defaultChanged } = setup([session(), session('second', 'other')]);
		const first = store.add(await service.acquireDefaultAccountClient(signal())).object;
		let invalidated = false;
		store.add(first.onDidInvalidate(() => { invalidated = true; }));
		state.account = { authenticationProvider: provider, accountName: 'other', sessionId: 'second', enterprise: false };
		defaultChanged.fire(state.account);
		const second = store.add(await service.acquireDefaultAccountClient(signal())).object;
		const retained = store.add(await service.acquireSessionClient('github', 'session', signal())).object;
		assert.deepStrictEqual({ invalidated, retained: retained === first, changed: first !== second }, { invalidated: false, retained: true, changed: true });
	});

	test('enterprise selection requires a known endpoint and pins it per client', async () => {
		const { service, state } = setup();
		state.account = { authenticationProvider: { id: 'github-enterprise', name: 'Enterprise', enterprise: true }, accountName: 'account', sessionId: 'session', enterprise: true };
		await assert.rejects(service.acquireDefaultAccountClient(signal()), { kind: 'authentication' });
		state.enterpriseUrl = 'https://tenant.ghe.com';
		const first = store.add(await service.acquireDefaultAccountClient(signal())).object;
		state.enterpriseUrl = 'https://ghe.example.test';
		const second = store.add(await service.acquireDefaultAccountClient(signal())).object;
		assert.deepStrictEqual([first.endpoint.getApiBaseUri(), first.endpoint.getGraphQlUri(), second.endpoint.getApiBaseUri(), second.endpoint.getGraphQlUri()], [
			'https://api.tenant.ghe.com', 'https://api.tenant.ghe.com/graphql', 'https://ghe.example.test/api/v3', 'https://ghe.example.test/api/graphql',
		]);
	});

	test('explicit enterprise clients use their session issuer rather than the default endpoint', async () => {
		const enterprise = { ...session('enterprise'), authorizationServer: URI.parse('https://ghe.example.test/login/oauth') };
		const { service } = setup([enterprise]);
		const client = store.add(await service.acquireSessionClient('github-enterprise', 'enterprise', signal())).object;
		assert.strictEqual(client.endpoint.getApiBaseUri(), 'https://ghe.example.test/api/v3');
	});

	test('drops pending GitHub telemetry when configuration opts out and back in while idle', async () => {
		const events: string[] = [];
		const { service, configuration } = setup(undefined, new class extends mock<ITelemetryService>() {
			override readonly telemetryLevel = TelemetryLevel.USAGE;
			override publicLog2(name: string): void { events.push(name); }
		}());
		const client = store.add(await service.acquireDefaultAccountClient(signal())).object;
		const controller = new AbortController();
		const reason = new Error('cancelled');
		controller.abort(reason);
		await assert.rejects(client.transport.rest({ host: 'api.github.com', accountId: '1' }, 'token', {
			method: 'GET', url: 'https://api.github.com/user',
		}, controller.signal), error => error === reason);
		for (const level of ['off', 'all']) {
			await configuration.setUserConfiguration(TELEMETRY_SETTING_ID, level);
			configuration.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
				override affectsConfiguration(key: string): boolean { return key === TELEMETRY_SETTING_ID; }
			}());
		}
		service.dispose();
		assert.deepStrictEqual(events, []);
	});
});

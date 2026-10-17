/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
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
import { GitHubClientOptions } from '../../../../../platform/github/common/githubTypes.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { ITelemetryService, TELEMETRY_SETTING_ID, TelemetryLevel } from '../../../../../platform/telemetry/common/telemetry.js';
import { AuthenticationSession, AuthenticationSessionsChangeEvent, IAuthenticationGetSessionsOptions, IAuthenticationService } from '../../../authentication/common/authentication.js';
import { WorkbenchGitHubService } from '../../browser/githubService.js';
import { getGitHubClientInternals } from '../../../../../platform/github/test/common/githubClientTestUtils.js';

suite('Workbench GitHub service', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());
	const signal = () => new AbortController().signal;
	const provider = { id: 'github', name: 'GitHub', enterprise: false };

	function session(id = 'session', accountId = 'account', scopes: readonly string[] = ['repo']): AuthenticationSession {
		return { id, accessToken: `token-${id}`, account: { id: accountId, label: accountId }, scopes };
	}

	function clientOptions(sessionId: string): GitHubClientOptions {
		return {
			authorization: { providerId: 'github', sessionId, scopes: ['repo'] },
			apiBaseUri: 'https://api.github.com',
			graphQlUri: 'https://api.github.com/graphql',
		};
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

	for (const selection of ['legacy', 'portable'] as const) {
		test(`${selection} selection cancels while the authentication provider is pending`, async () => {
			const lookup = new DeferredPromise<readonly AuthenticationSession[]>();
			const { service } = setup(undefined, undefined, () => lookup.p);
			const controller = new AbortController();
			const reason = new Error('cancelled');
			const pending = selection === 'legacy'
				? service.acquireDefaultAccountClient(controller.signal)
				: service.acquireDefaultAccountApiClient(controller.signal);
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
				const pending = selection === 'legacy'
					? service.acquireDefaultAccountClient(signal())
					: service.acquireDefaultAccountApiClient(signal());
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

	test('the browser binding acquires anonymous API clients locally without account selection', async () => {
		const { service, state, calls } = setup([]);
		state.account = null;
		const acquire = sinon.spy(service, 'acquireAnonymousClient');
		const client = store.add(await service.acquireAnonymousApiClient(signal()));
		const controller = new AbortController();
		const reason = new Error('Cancelled acquisition');
		controller.abort(reason);
		await assert.rejects(service.acquireAnonymousApiClient(controller.signal), error => error === reason);
		assert.deepStrictEqual({
			wrapped: Object.hasOwn(client, 'object'), acquired: acquire.callCount,
			local: acquire.firstCall.returnValue === client, authenticationCalls: calls,
		}, { wrapped: false, acquired: 1, local: true, authenticationCalls: [] });
	});

	test('retains the selected default client between consumers', async () => {
		const { service } = setup();
		const first = store.add(await service.acquireDefaultAccountClient(signal()));
		first.dispose();
		const next = store.add(await service.acquireDefaultAccountClient(signal()));
		assert.strictEqual(next.object === first.object, true);
	});

	test('the browser binding acquires disposable portable clients locally and reports grant invalidation', async () => {
		const { service, sessions, changed } = setup();
		const client = store.add(await service.acquireDefaultAccountApiClient(signal()));
		let invalidations = 0;
		store.add(client.onDidInvalidate(() => invalidations++));
		sessions[0] = { ...sessions[0], scopes: ['repo', 'gist'] };
		changed.fire({ providerId: 'github', label: 'GitHub', event: { added: [], changed: [sessions[0]], removed: [] } });
		assert.deepStrictEqual({
			wrapped: Object.hasOwn(client, 'object'), authorization: client.authorization,
			domains: [typeof client.automations.list, typeof client.tasks.abort, typeof client.repositories.get], invalidations,
		}, {
			wrapped: false, authorization: { providerId: 'github', sessionId: 'session', accountId: 'account', scopes: ['repo'] },
			domains: ['function', 'function', 'function'], invalidations: 1,
		});
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
		assert.deepStrictEqual({ authorization: client.authorization, endpoint: getGitHubClientInternals(client).endpoint.getApiBaseUri(), calls }, {
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

	for (const change of ['scopes', 'issuer', 'removed'] as const) {
		test(`rejects a stale default selection after ${change} changes and permits a fresh lookup`, async () => {
			const staleSession = session();
			const currentSession = {
				...staleSession,
				...(change === 'scopes' ? { scopes: ['repo', 'gist'] }
					: change === 'issuer' ? { authorizationServer: URI.parse('https://github.com/login/oauth') } : {}),
			};
			const currentSessions = change === 'removed' ? [] : [currentSession];
			const lookup = new DeferredPromise<readonly AuthenticationSession[]>();
			let requested = false;
			const { service, changed, calls } = setup(undefined, undefined, () => {
				if (!requested) {
					requested = true;
					return lookup.p;
				}
				return Promise.resolve(currentSessions);
			});
			const rejected = assert.rejects(service.acquireDefaultAccountApiClient(signal()), { kind: 'authentication' });
			changed.fire({
				providerId: 'github', label: 'GitHub',
				event: { added: [], changed: change === 'removed' ? [] : [currentSession], removed: change === 'removed' ? [staleSession] : [] },
			});
			await lookup.complete([staleSession]);
			await rejected;
			if (change === 'removed') {
				await assert.rejects(service.acquireDefaultAccountApiClient(signal()), { kind: 'authentication' });
			} else {
				const client = store.add(await service.acquireDefaultAccountApiClient(signal()));
				assert.deepStrictEqual(client.authorization, {
					providerId: 'github', sessionId: 'session', accountId: 'account', scopes: [...currentSession.scopes].sort(),
					...(currentSession.authorizationServer ? { authorizationServer: currentSession.authorizationServer.toString() } : {}),
				});
			}
			assert.deepStrictEqual(calls, [
				{ providerId: 'github', options: { silent: true } },
				{ providerId: 'github', options: { silent: true } },
				{ providerId: 'github', options: { silent: true } },
			]);
		});
	}

	test('retries a pending token-only renewal without retiring the existing default client', async () => {
		const original = session();
		const renewed = { ...original, accessToken: 'renewed-token' };
		const lookup = new DeferredPromise<readonly AuthenticationSession[]>();
		let call = 0;
		const { service, changed, calls } = setup(undefined, undefined, () => {
			switch (++call) {
				case 1: return Promise.resolve([original]);
				case 2: return lookup.p;
				default: return Promise.resolve([renewed]);
			}
		});
		const first = store.add(await service.acquireDefaultAccountClient(signal())).object;
		let invalidations = 0;
		store.add(getGitHubClientInternals(first).onDidInvalidate(() => invalidations++));
		const pending = service.acquireDefaultAccountClient(signal());
		changed.fire({ providerId: 'github', label: 'GitHub', event: { added: [], changed: [renewed], removed: [] } });
		await lookup.complete([original]);
		const reference = store.add(await pending);
		assert.deepStrictEqual({ lookups: calls.length, sameClient: reference.object === first, invalidations }, {
			lookups: 3, sameClient: true, invalidations: 0,
		});
	});

	test('does not retry a pending session lookup for another provider change', async () => {
		const lookup = new DeferredPromise<readonly AuthenticationSession[]>();
		const { service, changed, calls } = setup(undefined, undefined, () => lookup.p);
		const pending = service.acquireDefaultAccountApiClient(signal());
		changed.fire({ providerId: 'github-enterprise', label: 'Enterprise', event: { added: [], changed: [session()], removed: [] } });
		await lookup.complete([session()]);
		const client = store.add(await pending);
		assert.deepStrictEqual({ lookups: calls.length, providerId: client.authorization.providerId }, {
			lookups: 1, providerId: 'github',
		});
	});

	test('session lookup retries remain cancellable without another provider call', async () => {
		const first = new DeferredPromise<readonly AuthenticationSession[]>();
		const second = new DeferredPromise<readonly AuthenticationSession[]>();
		let call = 0;
		const { service, changed } = setup(undefined, undefined, () => {
			if (++call === 1) {
				return first.p;
			}
			return second.p;
		});
		const controller = new AbortController();
		const reason = new Error('cancelled');
		const pending = service.acquireDefaultAccountApiClient(controller.signal).then(
			client => { store.add(client); return undefined; },
			error => error,
		);
		changed.fire({ providerId: 'github', label: 'GitHub', event: { added: [], changed: [session('session', 'account', ['repo', 'gist'])], removed: [] } });
		await first.complete([session()]);
		await timeout(0);
		controller.abort(reason);
		const result = await pending;
		await second.complete([session()]);
		assert.deepStrictEqual({ calls: call, cancelled: result === reason }, { calls: 2, cancelled: true });
	});

	for (const selection of ['legacy', 'portable'] as const) {
		test(`${selection} client survives same-session token renewal`, async () => {
			const { service, sessions, changed } = setup([session('session', 'account', ['repo', 'user:email'])]);
			const acquire = async () => selection === 'legacy'
				? getGitHubClientInternals(store.add(await service.acquireDefaultAccountClient(signal())).object)
				: store.add(await service.acquireDefaultAccountApiClient(signal()));
			const first = await acquire();
			let invalidations = 0;
			let selectionsChanged = 0;
			store.add(first.onDidInvalidate(() => invalidations++));
			store.add(service.onDidChangeDefaultClient(() => selectionsChanged++));
			sessions[0] = { ...sessions[0], accessToken: 'renewed-token', scopes: ['user:email', 'repo'] };
			changed.fire({ providerId: 'github', label: 'GitHub', event: { added: [], removed: [], changed: [sessions[0]] } });
			const next = await acquire();
			assert.deepStrictEqual({
				sameLegacyClient: selection === 'legacy' ? next === first : undefined,
				authorization: next.authorization, invalidations, selectionsChanged,
			}, {
				sameLegacyClient: selection === 'legacy' ? true : undefined,
				authorization: first.authorization, invalidations: 0, selectionsChanged: 0,
			});
		});
	}

	test('token renewal during default selection does not invalidate the selection', async () => {
		let renew = () => { };
		const original = [session()];
		const { service, sessions, changed } = setup(original, undefined, async () => {
			renew();
			return original;
		});
		const first = store.add(await service.acquireDefaultAccountClient(signal())).object;
		renew = () => {
			renew = () => { };
			sessions[0] = { ...sessions[0], accessToken: 'renewed-token' };
			changed.fire({ providerId: 'github', label: 'GitHub', event: { added: [], removed: [], changed: [sessions[0]] } });
		};
		const next = store.add(await service.acquireDefaultAccountClient(signal())).object;
		assert.strictEqual(next === first, true);
	});

	test('refreshing default-account metadata does not replace an unchanged selection', async () => {
		const { service, state, defaultChanged } = setup();
		const first = store.add(await service.acquireDefaultAccountClient(signal()));
		first.dispose();
		let selectionsChanged = 0;
		store.add(service.onDidChangeDefaultClient(() => selectionsChanged++));
		defaultChanged.fire(state.account);
		const next = store.add(await service.acquireDefaultAccountClient(signal()));
		assert.deepStrictEqual({ sameClient: next.object === first.object, selectionsChanged }, {
			sameClient: true, selectionsChanged: 0,
		});
	});

	for (const grant of ['account', 'scopes', 'issuer'] as const) {
		test(`${grant} changes retire only the affected workbench client`, async () => {
			const { service, sessions, changed } = setup([session(), session('peer', 'other-account')]);
			const first = store.add(await service.acquireDefaultAccountClient(signal())).object;
			const peer = store.add(service.acquireClient(clientOptions('peer'))).object;
			const invalidations: string[] = [];
			let selectionsChanged = 0;
			store.add(getGitHubClientInternals(first).onDidInvalidate(() => invalidations.push('first')));
			store.add(getGitHubClientInternals(peer).onDidInvalidate(() => invalidations.push('peer')));
			store.add(service.onDidChangeDefaultClient(() => selectionsChanged++));
			sessions[0] = {
				...sessions[0],
				...(grant === 'account' ? { account: { id: 'replacement', label: 'replacement' } }
					: grant === 'scopes' ? { scopes: ['repo', 'gist'] }
						: { authorizationServer: URI.parse('https://github.com/login/oauth') }),
			};
			changed.fire({ providerId: 'github', label: 'GitHub', event: { added: [], removed: [], changed: [sessions[0]] } });
			await assert.rejects(first.credentials.getCredential(signal()), /disposed/);
			const retained = store.add(service.acquireClient(clientOptions('peer'))).object;
			const replacement = store.add(await service.acquireDefaultAccountClient(signal())).object;
			assert.deepStrictEqual({ invalidations, selectionsChanged, retainedPeer: retained === peer, replaced: replacement !== first }, {
				invalidations: ['first'], selectionsChanged: 1, retainedPeer: true, replaced: true,
			});
		});
	}

	test('session changes invalidate only the affected authorization context', async () => {
		const { service, sessions, changed } = setup([session('first'), session('second', 'other')]);
		const first = store.add(service.acquireClient(clientOptions('first'))).object;
		const second = store.add(service.acquireClient(clientOptions('second'))).object;
		const invalidated: string[] = [];
		store.add(getGitHubClientInternals(first).onDidInvalidate(() => invalidated.push('first')));
		store.add(getGitHubClientInternals(second).onDidInvalidate(() => invalidated.push('second')));
		changed.fire({ providerId: 'github', label: 'GitHub', event: { added: [], changed: [], removed: [sessions[0]] } });
		await assert.rejects(first.credentials.getCredential(signal()), /disposed/);
		const retained = store.add(service.acquireClient(clientOptions('second'))).object;
		assert.deepStrictEqual({ invalidated, retained: retained === second }, { invalidated: ['first'], retained: true });
	});

	test('switching default accounts does not revoke captured clients for the old account', async () => {
		const { service, state, defaultChanged } = setup([session(), session('second', 'other')]);
		const originalAccount = state.account;
		const first = store.add(await service.acquireDefaultAccountClient(signal())).object;
		let invalidated = false;
		store.add(getGitHubClientInternals(first).onDidInvalidate(() => { invalidated = true; }));
		state.account = { authenticationProvider: provider, accountName: 'other', sessionId: 'second', enterprise: false };
		defaultChanged.fire(state.account);
		const second = store.add(await service.acquireDefaultAccountClient(signal())).object;
		state.account = originalAccount;
		defaultChanged.fire(state.account);
		const retained = store.add(await service.acquireDefaultAccountClient(signal())).object;
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
		assert.deepStrictEqual([getGitHubClientInternals(first).endpoint.getApiBaseUri(), getGitHubClientInternals(first).endpoint.getGraphQlUri(), getGitHubClientInternals(second).endpoint.getApiBaseUri(), getGitHubClientInternals(second).endpoint.getGraphQlUri()], [
			'https://api.tenant.ghe.com', 'https://api.tenant.ghe.com/graphql', 'https://ghe.example.test/api/v3', 'https://ghe.example.test/api/graphql',
		]);
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
		await assert.rejects(getGitHubClientInternals(client).transport.rest({ host: 'api.github.com', accountId: '1' }, 'token', {
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

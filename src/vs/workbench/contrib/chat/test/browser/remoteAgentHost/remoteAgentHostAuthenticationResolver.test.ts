/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { URI } from '../../../../../../base/common/uri.js';
import { AgentHostAuthenticationPendingError } from '../../../../../../platform/agentHost/common/agentHostAdvertisedAuthentication.js';
import { authenticationAccountMeta } from '../../../../../../platform/agentHost/common/meta/agentAuthenticationAccount.js';
import { readAgentEntitlementHint } from '../../../../../../platform/agentHost/common/meta/agentEntitlementHintMeta.js';
import type { AgentInfo } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IAuthenticationService, type AuthenticationSession, type AuthenticationSessionsChangeEvent } from '../../../../../services/authentication/common/authentication.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IExtensionService } from '../../../../../services/extensions/common/extensions.js';
import { authenticateProtectedResources } from '../../../browser/agentSessions/agentHost/agentHostAuth.js';
import { RemoteAgentHostAuthenticationResolver } from '../../../browser/remoteAgentHost/remoteAgentHostAuthenticationResolver.js';
import { IRemoteAgentHostConnectionCustomizationService } from '../../../browser/remoteAgentHost/remoteAgentHostConnectionCustomization.js';

suite('RemoteAgentHostAuthenticationResolver', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const resource = { resource: 'https://api.example.com', authorization_servers: ['https://example.com'], scopes_supported: ['read'] };
	const agents: AgentInfo[] = [{ provider: 'conforming-host', displayName: 'Test', description: 'test', models: [], protectedResources: [resource] }];
	const session: AuthenticationSession = {
		id: 'session', accessToken: 'existing-token', scopes: ['read'], account: { id: 'account', label: 'Account' },
		expiresAfter: 1500, authorizationServer: URI.parse('https://example.com'),
	};

	function fixture(options?: { editor?: boolean; transform?: boolean; smokeTest?: boolean; testToken?: string; lookup?: () => Promise<readonly AuthenticationSession[]> }) {
		const instantiationService = store.add(new TestInstantiationService());
		const extensions = new DeferredPromise<boolean>();
		const sessionChanges = store.add(new Emitter<{ providerId: string; label: string; event: AuthenticationSessionsChangeEvent }>());
		const state = {
			registered: true,
			sessions: [session],
			sessionError: false,
			extensionWaits: 0,
			lookups: 0,
		};
		instantiationService.stub(ILogService, NullLogService);
		instantiationService.stub(IDefaultAccountService, { currentDefaultAccount: null });
		instantiationService.stub(IConfigurationService, new TestConfigurationService({ 'chat.agentHost.unsafeTestToken': options?.testToken }));
		instantiationService.stub(IWorkbenchEnvironmentService, { isSessionsWindow: !options?.editor, enableSmokeTestDriver: options?.smokeTest });
		instantiationService.stub(IExtensionService, new class extends mock<IExtensionService>() {
			override whenInstalledExtensionsRegistered(): Promise<boolean> {
				state.extensionWaits++;
				return extensions.p;
			}
		}());
		instantiationService.stub(IRemoteAgentHostConnectionCustomizationService, {
			get: () => options?.transform ? { authenticate: async request => request } : undefined,
		});
		instantiationService.stub(IAuthenticationService, new class extends mock<IAuthenticationService>() {
			override readonly onDidChangeSessions = sessionChanges.event;
			override readonly declaredProviders = [{ id: 'test', label: 'Test', authorizationServerGlobs: ['https://example.com/*'] }];
			override isAuthenticationProviderRegistered(): boolean { return state.registered; }
			override async getOrActivateProviderIdForServer(): Promise<string | undefined> {
				state.lookups++;
				return state.registered ? 'test' : undefined;
			}
			override async getSessions(): Promise<readonly AuthenticationSession[]> {
				if (options?.lookup) {
					return options.lookup();
				}
				if (state.sessionError) {
					throw new Error('Keychain unavailable');
				}
				return state.sessions;
			}
		}());
		const manager = instantiationService.createInstance(RemoteAgentHostAuthenticationResolver);
		const resolver = store.add(manager.createResolver('host'));
		return { resolver, manager, instantiationService, extensions, state, sessionChanges };
	}

	test('waits for extension registration and builds the same request as ongoing authentication', async () => {
		const { resolver, instantiationService, extensions, state } = fixture();
		const pending = resolver.resolve(agents);
		assert.strictEqual(state.lookups, 0);
		await extensions.complete(true);
		const requests = await pending;
		const ongoing: object[] = [];
		await instantiationService.invokeFunction(authenticateProtectedResources, agents, {
			logPrefix: 'test', authenticate: async request => { ongoing.push(request); },
		});
		assert.deepStrictEqual({ requests, ongoing }, {
			requests: [{
				resource: resource.resource, scopes: ['read'], token: session.accessToken, expiresIn: 2,
				_meta: authenticationAccountMeta({ providerId: 'test', accountId: 'account', authorizationServer: 'https://example.com/' }),
			}],
			ongoing: requests,
		});
	});

	test('does not mistake a declared provider still starting for a signed-out account', async () => {
		const { resolver, extensions, state } = fixture();
		await extensions.complete(true);
		state.registered = false;
		await assert.rejects(resolver.resolve(agents), AgentHostAuthenticationPendingError);
		state.registered = true;
		assert.strictEqual((await resolver.resolve(agents))[0]?.token, session.accessToken);
	});

	test('initial and ongoing authentication preserve default-account entitlement metadata', async () => {
		const { resolver, instantiationService, extensions } = fixture();
		await extensions.complete(true);
		instantiationService.stub(IDefaultAccountService, {
			currentDefaultAccount: {
				sessionId: session.id, accountName: 'Account', enterprise: false,
				authenticationProvider: { id: 'test', name: 'Test', enterprise: false },
				entitlementsData: {
					access_type_sku: 'free_limited_copilot', analytics_tracking_id: 'analytics', chat_enabled: true,
					assigned_date: '', can_signup_for_limited: false, copilot_plan: 'individual', organization_login_list: [],
				},
			},
		});
		const requests = await resolver.resolve(agents);
		const ongoing: object[] = [];
		await instantiationService.invokeFunction(authenticateProtectedResources, agents, {
			logPrefix: 'test', authenticate: async request => { ongoing.push(request); },
		});
		assert.deepStrictEqual({ initial: readAgentEntitlementHint(requests[0]), ongoing }, {
			initial: { trackingId: 'analytics', sku: 'free_limited_copilot' },
			ongoing: requests,
		});
	});

	for (const lifetime of [1, 5, undefined]) {
		test(`credential lifetime accounts for later resource lookups (expiresIn=${lifetime})`, async () => {
			const clock = sinon.useFakeTimers({ toFake: ['Date'] });
			const secondLookup = new DeferredPromise<readonly AuthenticationSession[]>();
			const started = new DeferredPromise<void>();
			let lookups = 0;
			const { resolver, extensions } = fixture({
				lookup: async () => {
					if (++lookups === 1) {
						return [{ ...session, expiresAfter: lifetime === undefined ? undefined : lifetime * 1000 }];
					}
					started.complete();
					return secondLookup.p;
				},
			});
			try {
				await extensions.complete(true);
				const second = { ...resource, resource: 'https://api.example.com/second' };
				const pending = resolver.resolve([{ ...agents[0], protectedResources: [resource, second] }]);
				await started.p;
				clock.tick(1_500);
				await secondLookup.complete([{ ...session, accessToken: 'second-token', expiresAfter: 10_000 }]);
				const requests = await pending;
				assert.deepStrictEqual(requests.map(request => ({ token: request.token, expiresIn: request.expiresIn })), [
					{ token: session.accessToken, expiresIn: lifetime === undefined ? undefined : lifetime === 1 ? 0 : 4 },
					{ token: 'second-token', expiresIn: 10 },
				]);
			} finally {
				await secondLookup.complete([]);
				clock.restore();
			}
		});
	}

	for (const sessionError of [false, true]) {
		test(`keeps signed-out and unusable-credential hosts available without prompting (sessionError=${sessionError})`, async () => {
			const { resolver, extensions, state } = fixture();
			await extensions.complete(true);
			state.sessions = [];
			state.sessionError = sessionError;
			assert.deepStrictEqual(await resolver.resolve(agents), []);
		});
	}

	test('deduplicates advertised resources without losing distinct scopes', async () => {
		const { resolver, extensions, state } = fixture();
		await extensions.complete(true);
		state.sessions = [{ ...session, scopes: ['read', 'repo'] }];
		const duplicateAgents: AgentInfo[] = [
			agents[0],
			{ ...agents[0], provider: 'other', protectedResources: [resource, { ...resource, scopes_supported: ['repo'] }] },
		];
		assert.deepStrictEqual((await resolver.resolve(duplicateAgents)).map(request => request.scopes), [['read'], ['repo']]);
	});

	for (const options of [{ editor: true }, { transform: true }]) {
		test(`does not resolve editor or transformed-connection credentials (${JSON.stringify(options)})`, async () => {
			const { resolver, state } = fixture(options);
			assert.deepStrictEqual({ requests: await resolver.resolve(agents), waits: state.extensionWaits, lookups: state.lookups }, {
				requests: [], waits: 0, lookups: 0,
			});
		});
	}

	test('does not wait for authentication startup when a host advertises no protected resources', async () => {
		const { resolver, state } = fixture();
		assert.deepStrictEqual({ requests: await resolver.resolve([{ ...agents[0], protectedResources: undefined }]), waits: state.extensionWaits }, {
			requests: [], waits: 0,
		});
	});

	test('only uses an automation credential when the smoke-test driver is enabled', async () => {
		const enabled = fixture({ smokeTest: true, testToken: 'test-token' });
		const disabled = fixture({ smokeTest: false, testToken: 'test-token' });
		await disabled.extensions.complete(true);
		disabled.state.sessions = [];
		assert.deepStrictEqual({
			enabled: await enabled.resolver.resolve(agents),
			disabled: await disabled.resolver.resolve(agents),
			enabledWaits: enabled.state.extensionWaits,
		}, {
			enabled: [{ resource: resource.resource, scopes: ['read'], token: 'test-token' }],
			disabled: [], enabledWaits: 0,
		});
	});

	test('an unavailable optional provider does not block an available required credential', async () => {
		const { resolver, instantiationService, extensions } = fixture();
		await extensions.complete(true);
		instantiationService.stub(IAuthenticationService, {
			declaredProviders: [{ id: 'optional', label: 'Optional', authorizationServerGlobs: ['https://optional.example/*'] }],
			isAuthenticationProviderRegistered: id => id !== 'optional',
			getOrActivateProviderIdForServer: async server => {
				assert.notStrictEqual(server.authority, 'optional.example');
				return 'required';
			},
			getSessions: async () => [session],
		});
		const optional = { resource: 'https://optional.example', authorization_servers: ['https://optional.example'], required: false };
		assert.deepStrictEqual((await resolver.resolve([{ ...agents[0], protectedResources: [optional, resource] }])).map(request => request.resource), [resource.resource]);
	});

	test('optional authentication cannot hold readiness behind a stalled provider activation or session lookup', async () => {
		const lookup = new DeferredPromise<readonly AuthenticationSession[]>();
		const { resolver, extensions, state } = fixture({ lookup: () => lookup.p });
		let settled = false;
		const resolving = resolver.resolve([{ ...agents[0], protectedResources: [{ ...resource, required: false }] }]).then(requests => {
			settled = true;
			return requests;
		});
		await extensions.complete(true);
		await timeout(0);
		const beforeLookupSettles = { settled, extensionWaits: state.extensionWaits, lookups: state.lookups };
		await lookup.complete([]);
		const requests = await resolving;
		assert.deepStrictEqual({ beforeLookupSettles, requests }, {
			beforeLookupSettles: { settled: true, extensionWaits: 0, lookups: 0 },
			requests: [],
		});
	});

	test('optional credentials remain on the ongoing authentication path after required bootstrap', async () => {
		const { resolver, instantiationService, extensions } = fixture();
		await extensions.complete(true);
		const optional = { ...resource, resource: 'https://api.example.com/optional', required: false };
		const advertised = [{ ...agents[0], protectedResources: [resource, optional] }];
		const initial = await resolver.resolve(advertised);
		const ongoing: string[] = [];
		await instantiationService.invokeFunction(authenticateProtectedResources, advertised, {
			logPrefix: 'test', authenticate: async request => { ongoing.push(request.resource); },
		});
		assert.deepStrictEqual({ initial: initial.map(request => request.resource), ongoing }, {
			initial: [resource.resource],
			ongoing: [resource.resource, optional.resource],
		});
	});

	for (const optionalFirst of [false, true]) {
		test(`required advertisement wins over an optional duplicate for a provider that never starts (optionalFirst=${optionalFirst})`, async () => {
			const { resolver, extensions, state } = fixture();
			await extensions.complete(true);
			state.registered = false;
			const duplicates = [agents[0], { ...agents[0], protectedResources: [{ ...resource, required: false }] }];
			await assert.rejects(resolver.resolve(optionalFirst ? duplicates.reverse() : duplicates), AgentHostAuthenticationPendingError);
			assert.deepStrictEqual(await resolver.resolve([{ ...agents[0], protectedResources: [{ ...resource, required: false }] }]), []);
		});
	}

	for (const duringLookup of [false, true]) {
		test(`retains startup session removals until the contribution attaches (duringLookup=${duringLookup})`, async () => {
			const lookup = new DeferredPromise<readonly AuthenticationSession[]>();
			const { resolver, manager, extensions, sessionChanges } = fixture(duringLookup ? { lookup: () => lookup.p } : undefined);
			await extensions.complete(true);
			const resolving = resolver.resolve(agents);
			if (!duringLookup) {
				await resolving;
			}
			sessionChanges.fire({ providerId: 'test', label: 'Test', event: { removed: [session], added: [], changed: [] } });
			await lookup.complete([session]);
			await resolving;
			const first = manager.takePendingSessionRemovals('host');
			sessionChanges.fire({ providerId: 'test', label: 'Test', event: { removed: [session], added: [], changed: [] } });
			assert.deepStrictEqual({ first, subsequent: manager.takePendingSessionRemovals('host') }, {
				first: [{ providerId: 'test', sessions: [{ id: session.id, scopes: session.scopes }] }],
				subsequent: [],
			});
		});
	}

	test('disposal releases an unconnected authentication record without consuming its replacement', () => {
		const { resolver, manager, sessionChanges } = fixture();
		const replacement = store.add(manager.createResolver('host'));
		resolver.dispose();
		sessionChanges.fire({ providerId: 'test', label: 'Test', event: { removed: [session], added: [], changed: [] } });
		assert.deepStrictEqual(manager.takePendingSessionRemovals('host'), [{ providerId: 'test', sessions: [{ id: session.id, scopes: session.scopes }] }]);
		replacement.dispose();
	});
});

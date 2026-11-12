/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationError, isCancellationError } from '../../../../../../base/common/errors.js';
import type { IDefaultAccount } from '../../../../../../base/common/defaultAccount.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { copilotEntraAuthorizationServer, copilotEntraDiscoveryResource, copilotEntraM365Audience, copilotEntraResources } from '../../../../../../platform/agentHost/common/copilotEntraAuthentication.js';
import { authenticationAccountMeta } from '../../../../../../platform/agentHost/common/meta/agentAuthenticationAccount.js';
import type { ProtectedResourceMetadata } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IAuthenticationService, type AuthenticationSession } from '../../../../../services/authentication/common/authentication.js';
import { AgentHostAuthenticationRecovery, AgentHostAuthTokenCache, AgentHostInteractiveAuthentication, authenticateProtectedResources, resolveAuthenticationInteractively, resolveProtectedResourceAuthentication, revokeAuthenticationForRemovedSessions, type IAgentHostAuthenticateRequest } from '../../../browser/agentSessions/agentHost/agentHostAuth.js';

class MicrosoftAuthentication extends mock<IAuthenticationService>() {
	readonly calls: Parameters<IAuthenticationService['getSessions']>[] = [];
	readonly created: Parameters<IAuthenticationService['createSession']>[] = [];
	sessions: readonly AuthenticationSession[] = [];
	interactiveResult: AuthenticationSession | Promise<AuthenticationSession> | undefined;
	readonly interactiveStarted = new DeferredPromise<void>();
	pending: DeferredPromise<readonly AuthenticationSession[]> | undefined;
	pendingStarted: DeferredPromise<void> | undefined;
	pendingIdentity: DeferredPromise<readonly AuthenticationSession[]> | undefined;
	pendingIdentityStarted: DeferredPromise<void> | undefined;

	override async getOrActivateProviderIdForServer(): Promise<string> {
		return 'microsoft';
	}

	override async getSessions(...args: Parameters<IAuthenticationService['getSessions']>): Promise<readonly AuthenticationSession[]> {
		this.calls.push(args);
		if (args[1] === undefined) {
			this.pendingIdentityStarted?.complete();
			if (this.pendingIdentity) {
				return this.pendingIdentity.p;
			}
			return this.sessions.map(session => ({ ...session, scopes: [], accessToken: 'account-list-placeholder' }));
		}
		this.pendingStarted?.complete();
		return this.pending ? this.pending.p : this.sessions;
	}

	override async createSession(...args: Parameters<IAuthenticationService['createSession']>): Promise<AuthenticationSession> {
		this.created.push(args);
		this.interactiveStarted.complete();
		assert.ok(this.interactiveResult);
		return this.interactiveResult;
	}
}

suite('Agent Host Microsoft credential acquisition', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const resource: ProtectedResourceMetadata = {
		resource: copilotEntraDiscoveryResource,
		authorization_servers: [copilotEntraAuthorizationServer],
		scopes_supported: ['User.Read'],
	};
	const selected: AuthenticationSession = {
		id: 'selected',
		account: { id: 'selected', label: 'Selected' },
		scopes: ['User.Read'],
		accessToken: 'synthetic-selected-token',
	};
	const other: AuthenticationSession = {
		...selected, id: 'other', account: { id: 'other', label: 'Other' }, accessToken: 'synthetic-other-token',
	};

	function fixture() {
		const authentication = new MicrosoftAuthentication();
		authentication.sessions = [other, selected];
		const defaults = new class extends mock<IDefaultAccountService>() {
			override currentDefaultAccount: IDefaultAccount | null = {
				authenticationProvider: { id: 'microsoft', name: 'Microsoft', enterprise: false },
				sessionId: selected.id, accountName: selected.account.label, enterprise: false,
			};
			// The product sign-in dialog signs in GitHub, so a rejected Microsoft credential never opens it.
			override getDefaultAccountAuthenticationProvider() { return { id: 'github', name: 'GitHub', enterprise: false }; }
		}();
		const instantiation = store.add(new TestInstantiationService());
		instantiation.stub(IAuthenticationService, authentication);
		instantiation.stub(IDefaultAccountService, defaults);
		instantiation.stub(ILogService, new NullLogService());
		instantiation.stub(IConfigurationService, new TestConfigurationService());
		instantiation.stub(ICommandService, new class extends mock<ICommandService>() {
			override async executeCommand<R>(): Promise<R> {
				const session = await authentication.createSession('microsoft', resource.scopes_supported ?? [], {
					account: authentication.sessions.find(session => session.id === defaults.currentDefaultAccount?.sessionId)?.account,
					authorizationServer: URI.parse(copilotEntraAuthorizationServer),
				});
				authentication.sessions = [session];
				return { success: true } as R;
			}
		}());
		instantiation.stub(ITelemetryService, NullTelemetryService);
		const resolve = () => instantiation.invokeFunction(resolveProtectedResourceAuthentication, resource, '[test]');
		return { authentication, defaults, resolve, instantiation };
	}

	test('acquires scoped credentials silently for the default account through provider defaults', async () => {
		const f = fixture();
		const credential = await f.resolve();
		assert.deepStrictEqual({ calls: f.authentication.calls, credential }, {
			calls: [
				['microsoft', undefined, { authorizationServer: URI.parse(copilotEntraAuthorizationServer) }, true],
				['microsoft', ['User.Read'], { account: selected.account, authorizationServer: URI.parse(copilotEntraAuthorizationServer), silent: true }, true],
			],
			credential: { resource: resource.resource, scopes: ['User.Read'], token: selected.accessToken, _meta: authenticationAccountMeta({ providerId: 'microsoft', accountId: selected.account.id, label: selected.account.label }) },
		});
	});

	test('does not substitute another account or its display label for a missing default identity', async () => {
		const f = fixture();
		const credentials = [];
		for (const label of [other.account.label, selected.account.label]) {
			f.authentication.sessions = [{ ...other, account: { ...other.account, label } }];
			credentials.push(await f.resolve());
		}
		assert.deepStrictEqual(credentials, [undefined, undefined]);
	});

	test('a default account of another provider does not change Microsoft resource authentication', async () => {
		const f = fixture();
		f.defaults.currentDefaultAccount = {
			authenticationProvider: { id: 'github', name: 'GitHub', enterprise: false },
			sessionId: selected.id, accountName: selected.account.label, enterprise: false,
		};
		const credential = await f.resolve();
		assert.deepStrictEqual({ token: credential?.token, provider: credential?._meta }, {
			token: other.accessToken,
			provider: authenticationAccountMeta({ providerId: 'microsoft', accountId: other.account.id, label: other.account.label }),
		});
	});

	test('passive optional authentication neither switches provider nor chooses cached service credentials', async () => {
		const f = fixture();
		const target: ProtectedResourceMetadata = {
			resource: copilotEntraResources.get(copilotEntraM365Audience)!,
			authorization_servers: [copilotEntraAuthorizationServer],
			scopes_supported: [`${copilotEntraM365Audience}/.default`], required: false,
		};
		f.authentication.sessions = [selected, { ...selected, id: 'm365-scoped', scopes: target.scopes_supported!, accessToken: 'cached-m365' }];
		const forwarded: string[] = [];
		const agents = [{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [], protectedResources: [{ ...resource, required: false }, target] }];
		const options = { logPrefix: '[test]', authenticate: async (request: IAgentHostAuthenticateRequest) => { forwarded.push(request.resource); } };
		await f.instantiation.invokeFunction(authenticateProtectedResources, agents, options);
		const microsoft = [...forwarded];
		forwarded.length = 0;
		f.defaults.currentDefaultAccount = { ...f.defaults.currentDefaultAccount!, authenticationProvider: { id: 'github', name: 'GitHub', enterprise: false } };
		await f.instantiation.invokeFunction(authenticateProtectedResources, agents, options);
		assert.deepStrictEqual({ microsoft, github: forwarded, interactive: f.authentication.created }, {
			microsoft: [copilotEntraDiscoveryResource], github: [], interactive: [],
		});
	});

	test('rejects a returned session for the wrong resource scopes', async () => {
		const f = fixture();
		f.authentication.sessions = [{ ...selected, scopes: ['different'] }];
		assert.strictEqual(await f.resolve(), undefined);
	});

	test('rejects a late credential after the default account signs out', async () => {
		const f = fixture();
		f.authentication.pending = new DeferredPromise();
		const resolved = f.resolve();
		await Promise.resolve();
		f.defaults.currentDefaultAccount = null;
		f.authentication.pending.complete([selected]);
		await assert.rejects(resolved, isCancellationError);
	});

	for (const phase of ['identity', 'scoped'] as const) {
		test(`a superseded ${phase} lookup cannot withdraw the account forwarded by a newer pass`, async () => {
			const f = fixture();
			const pending = new DeferredPromise<readonly AuthenticationSession[]>();
			const started = new DeferredPromise<void>();
			if (phase === 'identity') {
				f.authentication.pendingIdentity = pending;
				f.authentication.pendingIdentityStarted = started;
			} else {
				f.authentication.pending = pending;
				f.authentication.pendingStarted = started;
			}
			const forwarded: string[] = [];
			const options = {
				logPrefix: '[test]', authTokenCache: new AgentHostAuthTokenCache(),
				authenticate: async (request: IAgentHostAuthenticateRequest) => { forwarded.push(request.token); },
			};
			const agents = [{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [], protectedResources: [resource] }];
			const original = f.instantiation.invokeFunction(authenticateProtectedResources, agents, options);
			const cancelled = assert.rejects(original, isCancellationError);
			await started.p;
			f.defaults.currentDefaultAccount = {
				authenticationProvider: { id: 'microsoft', name: 'Microsoft', enterprise: false },
				sessionId: other.id, accountName: other.account.label, enterprise: false,
			};
			f.authentication.pending = undefined;
			f.authentication.pendingIdentity = undefined;
			f.authentication.sessions = [other];
			await f.instantiation.invokeFunction(authenticateProtectedResources, agents, options);
			pending.complete([selected]);
			await cancelled;
			assert.deepStrictEqual({
				forwarded,
				account: options.authTokenCache.getAccountId(resource.resource, resource.scopes_supported),
				obsoleteScopedQueries: f.authentication.calls.filter(([, scopes, options]) => scopes !== undefined && options?.account?.id === selected.account.id).length,
			}, { forwarded: [other.accessToken], account: other.account.id, obsoleteScopedQueries: phase === 'identity' ? 0 : 1 });
		});
	}

	test('an unmarked Graph requirement retains generic resolution and explicit recovery with a GitHub default', async () => {
		const f = fixture();
		f.defaults.currentDefaultAccount = {
			authenticationProvider: { id: 'github', name: 'GitHub', enterprise: false },
			sessionId: 'github', accountName: 'GitHub', enterprise: false,
		};
		f.authentication.sessions = [{ ...other, scopes: ['Mail.Read'] }];
		const graph = { ...resource, scopes_supported: ['Mail.Read'] };
		const forwarded: string[] = [];
		const resolved = await f.instantiation.invokeFunction(resolveProtectedResourceAuthentication, graph, '[test]');
		const interactive = await f.instantiation.invokeFunction(resolveAuthenticationInteractively, [graph], {
			logPrefix: '[test]', authenticate: async request => { forwarded.push(request.token); },
		});
		assert.deepStrictEqual({
			token: resolved?.token, interactive, forwarded,
			clientRegistrations: f.authentication.calls.map(([, , options]) => options?.clientId),
			prompts: f.authentication.created,
		}, {
			token: other.accessToken, interactive: true, forwarded: [other.accessToken],
			clientRegistrations: f.authentication.calls.map(() => undefined), prompts: [],
		});
	});

	test('surfaces provider errors instead of treating them as successful authentication', async () => {
		const f = fixture();
		f.authentication.pending = new DeferredPromise();
		const resolved = f.resolve();
		f.authentication.pending.error(new Error('authentication provider unavailable'));
		await assert.rejects(resolved, /authentication provider unavailable/);
	});

	test('revokes only the forwarded Microsoft account, including scope-less account-removal events', async () => {
		const f = fixture();
		const cache = new AgentHostAuthTokenCache();
		const forwarded: IAgentHostAuthenticateRequest[] = [];
		await cache.authenticate(resource.resource, resource.scopes_supported, selected.accessToken, async () => { }, selected.account.id, undefined, undefined, { sessionId: selected.id, accountId: selected.account.id });
		for (const session of [other, selected]) {
			await f.instantiation.invokeFunction(revokeAuthenticationForRemovedSessions,
				[{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [], protectedResources: [resource] }],
				'microsoft', [{ id: session.id, scopes: [] }],
				{ logPrefix: '[test]', authTokenCache: cache, authenticate: async request => { forwarded.push(request); } });
		}
		assert.deepStrictEqual(forwarded, [{ resource: resource.resource, scopes: ['User.Read'], token: '' }]);
	});

	test('uses the existing Microsoft interactive flow for the same default account after silent acquisition fails', async () => {
		const f = fixture();
		f.authentication.sessions = [{ ...selected, scopes: ['unrelated'] }];
		f.authentication.interactiveResult = selected;
		const forwarded: IAgentHostAuthenticateRequest[] = [];
		const signedIn = await f.instantiation.invokeFunction(resolveAuthenticationInteractively, [resource], {
			logPrefix: '[test]', authenticate: async request => { forwarded.push(request); },
		});
		assert.deepStrictEqual({
			signedIn,
			created: f.authentication.created,
			forwarded,
		}, {
			signedIn: true,
			created: [['microsoft', ['User.Read'], { account: selected.account, authorizationServer: URI.parse(copilotEntraAuthorizationServer) }]],
			forwarded: [{ resource: resource.resource, scopes: ['User.Read'], token: selected.accessToken, _meta: authenticationAccountMeta({ providerId: 'microsoft', accountId: selected.account.id, label: selected.account.label }) }],
		});
	});

	test('a missing silent credential neither prompts nor revokes the signed-in account', async () => {
		const f = fixture();
		f.authentication.sessions = [{ ...selected, scopes: [] }];
		f.authentication.interactiveResult = selected;
		const forwarded: IAgentHostAuthenticateRequest[] = [];
		const recovery = f.instantiation.createInstance(AgentHostAuthenticationRecovery);
		await f.instantiation.invokeFunction(accessor => recovery.recover(accessor, resource, {
			logPrefix: '[test]', authenticate: async request => { forwarded.push(request); },
		}));
		assert.deepStrictEqual({
			interactiveAccounts: f.authentication.created.map(([, , options]) => options?.account),
			tokens: forwarded.map(request => request.token),
		}, { interactiveAccounts: [], tokens: [] });
	});

	test('a second window without the Microsoft account cannot revoke another window through discovery or recovery', async () => {
		const f = fixture();
		f.defaults.currentDefaultAccount = null;
		f.authentication.sessions = [];
		const forwarded: IAgentHostAuthenticateRequest[] = [];
		const options = { logPrefix: '[test]', authTokenCache: new AgentHostAuthTokenCache(), authenticate: async (request: IAgentHostAuthenticateRequest) => { forwarded.push(request); } };
		const recovery = f.instantiation.createInstance(AgentHostAuthenticationRecovery);
		await f.instantiation.invokeFunction(accessor => recovery.recover(accessor, resource, options));
		await f.instantiation.invokeFunction(authenticateProtectedResources,
			[{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [], protectedResources: [resource] }], options);
		assert.deepStrictEqual({ forwarded, interactive: f.authentication.created }, { forwarded: [], interactive: [] });
	});

	test('distinguishes the default session id from its account id', async () => {
		const f = fixture();
		f.authentication.sessions = [{ ...selected, account: { ...selected.account, id: 'opaque-account' } }];
		const result = await f.resolve();
		assert.deepStrictEqual(result?._meta, authenticationAccountMeta({ providerId: 'microsoft', accountId: 'opaque-account', label: selected.account.label }));
	});

	test('same-token deduplication retains the replacement session identity for sign-out', async () => {
		const cache = new AgentHostAuthTokenCache();
		const calls: string[] = [];
		for (const id of ['old-session', 'new-session']) {
			await cache.authenticate(resource.resource, resource.scopes_supported, selected.accessToken, async () => { calls.push(id); }, selected.account.id, undefined, undefined, { sessionId: id, accountId: selected.account.id });
		}
		assert.deepStrictEqual({ calls, session: cache.getSessionId(resource.resource, resource.scopes_supported) }, { calls: ['old-session'], session: 'new-session' });
	});

	test('sign-out during interactive Graph recovery still withdraws the forwarded identity', async () => {
		const f = fixture();
		const cache = new AgentHostAuthTokenCache();
		const forwarded: IAgentHostAuthenticateRequest[] = [];
		const options = { logPrefix: '[test]', authTokenCache: cache, authenticate: async (request: IAgentHostAuthenticateRequest) => { forwarded.push(request); } };
		const agents = [{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [], protectedResources: [resource] }];
		const recovery = f.instantiation.createInstance(AgentHostAuthenticationRecovery);
		await f.instantiation.invokeFunction(accessor => recovery.recover(accessor, resource, options));
		const interactive = new DeferredPromise<AuthenticationSession>();
		f.authentication.interactiveResult = interactive.p;
		const recovering = f.instantiation.createInstance(AgentHostInteractiveAuthentication).request(resource, options);
		await f.authentication.interactiveStarted.p;
		const duringRecovery = cache.getSessionId(resource.resource, resource.scopes_supported);

		f.defaults.currentDefaultAccount = null;
		f.authentication.sessions = [];
		await f.instantiation.invokeFunction(revokeAuthenticationForRemovedSessions, agents, 'microsoft', [{ id: selected.id, scopes: [] }], options);
		interactive.complete(selected);
		await assert.rejects(recovering, isCancellationError);
		assert.deepStrictEqual({ duringRecovery, tokens: forwarded.map(request => request.token) }, { duringRecovery: selected.id, tokens: [selected.accessToken, ''] });
	});

	for (const hasScopedCredential of [true, false]) {
		test(`a client default change cannot silently replace a bound host account (scoped=${hasScopedCredential})`, async () => {
			const f = fixture();
			f.authentication.sessions = [selected, { ...other, scopes: hasScopedCredential ? ['User.Read'] : [] }];
			const forwarded: IAgentHostAuthenticateRequest[] = [];
			const options = {
				logPrefix: '[test]', authTokenCache: new AgentHostAuthTokenCache(),
				authenticate: async (request: IAgentHostAuthenticateRequest) => {
					forwarded.push(request);
					if (request.token === other.accessToken) {
						throw new Error('Host requires the original account');
					}
				},
			};
			const agents = [{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [], protectedResources: [resource] }];
			await f.instantiation.invokeFunction(authenticateProtectedResources, agents, options);
			f.authentication.calls.length = 0;
			f.defaults.currentDefaultAccount = {
				authenticationProvider: { id: 'microsoft', name: 'Microsoft', enterprise: false },
				sessionId: other.id, accountName: other.account.label, enterprise: false,
			};
			const changed = f.instantiation.invokeFunction(authenticateProtectedResources, agents, options);
			if (hasScopedCredential) {
				await assert.rejects(changed, /original account/);
			} else {
				await changed;
			}
			assert.deepStrictEqual({
				tokens: forwarded.map(request => request.token),
				scopedAcquisitions: f.authentication.calls.filter(([, scopes]) => scopes !== undefined).length,
				remaining: options.authTokenCache.getAccountId(resource.resource, resource.scopes_supported),
				accounts: f.authentication.sessions.map(session => session.account.id),
			}, {
				tokens: hasScopedCredential ? [selected.accessToken, other.accessToken] : [selected.accessToken],
				scopedAcquisitions: 1, remaining: selected.account.id,
				accounts: [selected.account.id, other.account.id],
			});
		});
	}

	test('a superseded default-account lookup does not revoke the current account', async () => {
		const f = fixture();
		const forwarded: IAgentHostAuthenticateRequest[] = [];
		const options = { logPrefix: '[test]', authTokenCache: new AgentHostAuthTokenCache(), authenticate: async (request: IAgentHostAuthenticateRequest) => { forwarded.push(request); } };
		const agents = [{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [], protectedResources: [resource] }];
		await f.instantiation.invokeFunction(authenticateProtectedResources, agents, options);
		const originalDefault = f.defaults.currentDefaultAccount;
		f.defaults.currentDefaultAccount = {
			authenticationProvider: { id: 'microsoft', name: 'Microsoft', enterprise: false },
			sessionId: other.id, accountName: other.account.label, enterprise: false,
		};
		const forwarding = f.instantiation.invokeFunction(authenticateProtectedResources, agents, options);
		f.defaults.currentDefaultAccount = originalDefault;
		await assert.rejects(forwarding, isCancellationError);
		assert.deepStrictEqual(forwarded.map(request => request.token), [selected.accessToken]);
	});

	test('repeated recovery notifications remain silent even for an unchanged available token', async () => {
		const f = fixture();
		const forwarded: IAgentHostAuthenticateRequest[] = [];
		const recovery = f.instantiation.createInstance(AgentHostAuthenticationRecovery);
		const options = { logPrefix: '[test]', authTokenCache: new AgentHostAuthTokenCache(), authenticate: async (request: IAgentHostAuthenticateRequest) => { forwarded.push(request); } };
		await f.instantiation.invokeFunction(accessor => recovery.recover(accessor, resource, options));
		await f.instantiation.invokeFunction(accessor => recovery.recover(accessor, resource, options));
		assert.deepStrictEqual({ tokens: forwarded.map(request => request.token), prompts: f.authentication.created }, { tokens: [selected.accessToken], prompts: [] });
	});

	test('repeated challenges never prompt for a Microsoft credential and accept a later silent replacement', async () => {
		const f = fixture();
		const forwarded: IAgentHostAuthenticateRequest[] = [];
		const options = { logPrefix: '[test]', authTokenCache: new AgentHostAuthTokenCache(), authenticate: async (request: IAgentHostAuthenticateRequest) => { forwarded.push(request); } };
		const recovery = f.instantiation.createInstance(AgentHostAuthenticationRecovery);
		await f.instantiation.invokeFunction(accessor => recovery.recover(accessor, resource, options));
		await f.instantiation.invokeFunction(accessor => recovery.recover(accessor, resource, options));
		assert.ok(f.defaults.currentDefaultAccount);
		f.defaults.currentDefaultAccount = { ...f.defaults.currentDefaultAccount, sessionId: 'rotated-session' };
		f.authentication.sessions = [{ ...selected, id: 'rotated-session' }];
		await f.instantiation.invokeFunction(accessor => recovery.recover(accessor, resource, options));
		f.authentication.sessions = [{ ...selected, id: 'rotated-session', accessToken: 'replacement-token' }];
		await f.instantiation.invokeFunction(accessor => recovery.recover(accessor, resource, options));
		assert.deepStrictEqual({
			tokens: forwarded.map(request => request.token), prompts: f.authentication.created,
			account: options.authTokenCache.getAccountId(resource.resource, resource.scopes_supported),
		}, { tokens: [selected.accessToken, 'replacement-token'], prompts: [], account: selected.account.id });
	});

	test('recovery retains sign-out ownership while the first credential push is pending', async () => {
		const f = fixture();
		const forwarded: string[] = [];
		const accepted = new DeferredPromise<void>();
		const started = new DeferredPromise<void>();
		const options = {
			logPrefix: '[test]', authTokenCache: new AgentHostAuthTokenCache(),
			authenticate: async (request: IAgentHostAuthenticateRequest) => {
				forwarded.push(request.token);
				if (request.token) {
					started.complete();
					await accepted.p;
				}
			},
		};
		const recovery = f.instantiation.createInstance(AgentHostAuthenticationRecovery);
		const initial = f.instantiation.invokeFunction(accessor => recovery.recover(accessor, resource, options));
		const finished = assert.rejects(initial, isCancellationError);
		await started.p;
		f.defaults.currentDefaultAccount = null;
		f.authentication.sessions = [];
		await f.instantiation.invokeFunction(revokeAuthenticationForRemovedSessions,
			[{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [], protectedResources: [resource] }],
			'microsoft', [{ id: selected.id, scopes: [] }], options);
		accepted.complete();
		await finished;
		assert.deepStrictEqual(forwarded, [selected.accessToken, '']);
	});

	test('a silent provider failure is surfaced without revocation or interactive fallback', async () => {
		const f = fixture();
		const forwarded: IAgentHostAuthenticateRequest[] = [];
		const recovery = f.instantiation.createInstance(AgentHostAuthenticationRecovery);
		f.authentication.pending = new DeferredPromise();
		const result = f.instantiation.invokeFunction(accessor => recovery.recover(accessor, resource, {
			logPrefix: '[test]', authenticate: async request => { forwarded.push(request); },
		}));
		f.authentication.pending.error(new Error('provider unavailable'));
		await assert.rejects(result, /provider unavailable/);
		assert.deepStrictEqual({ forwarded, prompts: f.authentication.created }, { forwarded: [], prompts: [] });
	});

	test('cancelling explicit interactive recovery does not send a revocation', async () => {
		const f = fixture();
		const forwarded: IAgentHostAuthenticateRequest[] = [];
		const interactive = new DeferredPromise<AuthenticationSession>();
		f.authentication.interactiveResult = interactive.p;
		const result = f.instantiation.createInstance(AgentHostInteractiveAuthentication).request(resource, {
			logPrefix: '[test]', authenticate: async request => { forwarded.push(request); },
		});
		await f.authentication.interactiveStarted.p;
		interactive.error(new CancellationError());
		await assert.rejects(result, isCancellationError);
		assert.deepStrictEqual({ forwarded, account: f.defaults.currentDefaultAccount?.sessionId }, { forwarded: [], account: selected.id });
	});

	test('a superseded silent recovery never forwards its late credential', async () => {
		const f = fixture();
		const forwarded: IAgentHostAuthenticateRequest[] = [];
		const recovery = f.instantiation.createInstance(AgentHostAuthenticationRecovery);
		let current = true;
		f.authentication.pending = new DeferredPromise();
		const result = f.instantiation.invokeFunction(accessor => recovery.recover(accessor, resource, {
			logPrefix: '[test]', isCurrent: () => current, authenticate: async request => { forwarded.push(request); },
		}));
		current = false;
		f.authentication.pending.complete([selected]);
		await assert.rejects(result, isCancellationError);
		assert.deepStrictEqual({ forwarded, prompts: f.authentication.created }, { forwarded: [], prompts: [] });
	});
});

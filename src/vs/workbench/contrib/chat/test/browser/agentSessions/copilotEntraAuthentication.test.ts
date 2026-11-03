/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import type { IDefaultAccount } from '../../../../../../base/common/defaultAccount.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { copilotEntraAuthorizationServer, copilotEntraClientId, copilotEntraDiscoveryResource } from '../../../../../../platform/agentHost/common/copilotEntraAuthentication.js';
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
import { AgentHostAuthenticationRecovery, AgentHostAuthTokenCache, authenticateProtectedResources, resolveAuthenticationInteractively, resolveProtectedResourceAuthentication, revokeAuthenticationForRemovedSessions, type IAgentHostAuthenticateRequest } from '../../../browser/agentSessions/agentHost/agentHostAuth.js';

class MicrosoftAuthentication extends mock<IAuthenticationService>() {
	readonly calls: Parameters<IAuthenticationService['getSessions']>[] = [];
	readonly created: Parameters<IAuthenticationService['createSession']>[] = [];
	sessions: readonly AuthenticationSession[] = [];
	interactiveResult: AuthenticationSession | undefined;
	pending: DeferredPromise<readonly AuthenticationSession[]> | undefined;

	override async getOrActivateProviderIdForServer(): Promise<string> {
		return 'microsoft';
	}

	override async getSessions(...args: Parameters<IAuthenticationService['getSessions']>): Promise<readonly AuthenticationSession[]> {
		this.calls.push(args);
		if (args[1] === undefined) {
			return this.sessions.map(session => ({ ...session, scopes: [], accessToken: 'account-list-placeholder' }));
		}
		return this.pending ? this.pending.p : this.sessions;
	}

	override async createSession(...args: Parameters<IAuthenticationService['createSession']>): Promise<AuthenticationSession> {
		this.created.push(args);
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
		}();
		const instantiation = store.add(new TestInstantiationService());
		instantiation.stub(IAuthenticationService, authentication);
		instantiation.stub(IDefaultAccountService, defaults);
		instantiation.stub(ILogService, new NullLogService());
		instantiation.stub(IConfigurationService, new TestConfigurationService());
		instantiation.stub(ICommandService, new class extends mock<ICommandService>() { }());
		instantiation.stub(ITelemetryService, NullTelemetryService);
		const resolve = () => instantiation.invokeFunction(resolveProtectedResourceAuthentication, resource, '[test]');
		return { authentication, defaults, resolve, instantiation };
	}

	test('acquires real scoped credentials silently for the default account and fixed client registration', async () => {
		const f = fixture();
		const credential = await f.resolve();
		assert.deepStrictEqual({ calls: f.authentication.calls, credential }, {
			calls: [
				['microsoft', undefined, { silent: true, clientId: copilotEntraClientId }, true],
				['microsoft', ['User.Read'], { account: selected.account, authorizationServer: URI.parse(copilotEntraAuthorizationServer), clientId: copilotEntraClientId, silent: true }, true],
			],
			credential: { resource: resource.resource, scopes: ['User.Read'], token: selected.accessToken, _meta: authenticationAccountMeta({ providerId: 'microsoft', accountId: selected.account.id }) },
		});
	});

	test('does not use a sole different account when the default account is absent', async () => {
		const f = fixture();
		f.authentication.sessions = [other];
		assert.strictEqual(await f.resolve(), undefined);
	});

	test('does not treat a GitHub default account as a Microsoft identity', async () => {
		const f = fixture();
		f.defaults.currentDefaultAccount = {
			authenticationProvider: { id: 'github', name: 'GitHub', enterprise: false },
			sessionId: selected.id, accountName: selected.account.label, enterprise: false,
		};
		assert.deepStrictEqual({ credential: await f.resolve(), calls: f.authentication.calls }, { credential: undefined, calls: [] });
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
		assert.strictEqual(await resolved, undefined);
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
		await cache.authenticate(resource.resource, resource.scopes_supported, selected.accessToken, async () => { }, selected.account.id, undefined, undefined, selected.id);
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
			created: [['microsoft', ['User.Read'], { account: selected.account, authorizationServer: URI.parse(copilotEntraAuthorizationServer), clientId: copilotEntraClientId }]],
			forwarded: [{ resource: resource.resource, scopes: ['User.Read'], token: selected.accessToken, _meta: authenticationAccountMeta({ providerId: 'microsoft', accountId: selected.account.id }) }],
		});
	});

	test('an auth-required notification recovers a missing scoped credential rather than revoking the signed-in account', async () => {
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
		}, { interactiveAccounts: [selected.account], tokens: [selected.accessToken] });
	});

	test('a second window without the Microsoft account cannot revoke another window through discovery or recovery', async () => {
		const f = fixture();
		f.defaults.currentDefaultAccount = null;
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
		assert.deepStrictEqual(result?._meta, authenticationAccountMeta({ providerId: 'microsoft', accountId: 'opaque-account' }));
	});

	test('same-token deduplication retains the replacement session identity for sign-out', async () => {
		const cache = new AgentHostAuthTokenCache();
		const calls: string[] = [];
		for (const id of ['old-session', 'new-session']) {
			await cache.authenticate(resource.resource, resource.scopes_supported, selected.accessToken, async () => { calls.push(id); }, selected.account.id, undefined, undefined, id);
		}
		assert.deepStrictEqual({ calls, session: cache.getSessionId(resource.resource, resource.scopes_supported) }, { calls: ['old-session'], session: 'new-session' });
	});
});

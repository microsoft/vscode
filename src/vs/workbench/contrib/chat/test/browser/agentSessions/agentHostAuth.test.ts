/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { isObject } from '../../../../../../base/common/types.js';
import { URI } from '../../../../../../base/common/uri.js';
import { type ProtectedResourceMetadata } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import type { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { authenticationAccountMeta, readAuthenticationAccount } from '../../../../../../platform/agentHost/common/meta/agentAuthenticationAccount.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { CustomizationMarketplaceConfiguration } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { type AgentInfo } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IAuthenticationMcpAccessService } from '../../../../../services/authentication/browser/authenticationMcpAccessService.js';
import { IAuthenticationMcpService } from '../../../../../services/authentication/browser/authenticationMcpService.js';
import { IAuthenticationMcpUsageService } from '../../../../../services/authentication/browser/authenticationMcpUsageService.js';
import { IAuthenticationService, type AuthenticationSession, type IAuthenticationProvider, type IAuthenticationProviderSessionOptions } from '../../../../../services/authentication/common/authentication.js';
import { IDynamicAuthenticationProviderStorageService } from '../../../../../services/authentication/common/dynamicAuthenticationProviderStorage.js';
import { CHAT_SETUP_ACTION_ID } from '../../../browser/actions/chatActions.js';
import { type IChatSetupCommandOptions } from '../../../browser/chatSetup/chatSetup.js';
import { AgentHostAuthenticationRecovery, autoAuthenticateMcpServer, authenticateNativeLokiWithMicrosoft, authenticateProtectedResources, resolveAuthenticationInteractively, resolveSessionForResource, AgentHostAuthTokenCache, agentHostMcpServerId, resolveMcpServerAuthentication, modelRequiresAgentAuthentication, revokeAuthenticationForRemovedSessions, renewNativeLokiToken, type IAgentHostAuthenticateRequest, type IAgentHostAuthenticationOptions } from '../../../browser/agentSessions/agentHost/agentHostAuth.js';
import { createAgentModelByokMeta } from '../../../../../../platform/agentHost/common/agentModelByokMeta.js';
import { nativeCopilotModelProviderMeta, nativeLokiActiveAccountMeta, nativeLokiAuthenticationMeta, NATIVE_EMU_PROTECTED_RESOURCE, NATIVE_EMU_SCOPE, NATIVE_LOKI_AUTHORITY, NATIVE_LOKI_BASE_URLS, NATIVE_LOKI_PROTECTED_RESOURCE, NATIVE_LOKI_SCOPE, type INativeLokiProtectedResource } from '../../../../../../platform/agentHost/common/meta/nativeLoki.js';

class TestCommandService extends mock<ICommandService>() {
	readonly calls: { commandId: string; args: unknown[] }[] = [];
	result: unknown = { success: true, dialogSkipped: false };
	onExecute: ((commandId: string, args: unknown[]) => void | Promise<void>) | undefined;

	override async executeCommand<R = unknown>(commandId: string, ...args: unknown[]): Promise<R | undefined> {
		this.calls.push({ commandId, args });
		await this.onExecute?.(commandId, args);
		return this.result as R;
	}
}

class TestAuthTelemetryService extends mock<ITelemetryService>() {
	readonly events: { name: string; data: Record<string, unknown> }[] = [];

	override publicLog2<E, C>(name: string, data?: E): void {
		assert.ok(isObject(data));
		const properties: Record<string, unknown> = Object.fromEntries(Object.entries(data));
		for (const key of ['windowAgeMs', 'durationMs']) {
			if (Object.hasOwn(properties, key)) {
				assert.ok(typeof properties[key] === 'number' && Number.isFinite(properties[key]) && properties[key] >= 0);
				properties[key] = '<duration>';
			}
		}
		this.events.push({ name, data: properties });
	}
}

function createAuthInstantiationService(disposables: Pick<DisposableStore, 'add'>, authenticationService: IAuthenticationService, commandService = new TestCommandService()): TestInstantiationService {
	const instantiationService = disposables.add(new TestInstantiationService());
	instantiationService.stub(IAuthenticationService, authenticationService);
	instantiationService.stub(ICommandService, commandService);
	instantiationService.stub(ILogService, new NullLogService());
	instantiationService.stub(ITelemetryService, NullTelemetryService);
	instantiationService.stub(IConfigurationService, new TestConfigurationService());
	return instantiationService;
}

function isDirectMicrosoftSignInSetup(value: unknown): value is IChatSetupCommandOptions & { readonly directMicrosoftSignIn: () => Promise<void> } {
	return isObject(value) && 'directMicrosoftSignIn' in value && typeof value.directMicrosoftSignIn === 'function';
}

function createMockAuthService(overrides: {
	getOrActivateProviderIdForServer?: (serverUri: URI, resourceUri: URI) => Promise<string | undefined>;
	getSessions?: (providerId: string, scopes: string[] | undefined, options: any, activate: boolean) => Promise<readonly { id?: string; scopes: readonly string[]; accessToken: string; expiresAfter?: number; account?: { id: string; label: string } }[]>;
	createSession?: (providerId: string, scopes: string[], options: any) => Promise<{ accessToken: string }>;
	createDynamicAuthenticationProvider?: (...args: Parameters<IAuthenticationService['createDynamicAuthenticationProvider']>) => Promise<{ readonly id: string } | undefined>;
	getProvider?: IAuthenticationService['getProvider'];
	isDynamicAuthenticationProvider?: (providerId: string) => boolean;
	isAuthenticationProviderRegistered?: (providerId: string) => boolean;
	declaredProviders?: IAuthenticationService['declaredProviders'];
	unregisterAuthenticationProvider?: (providerId: string) => void;
}): IAuthenticationService {
	return {
		getOrActivateProviderIdForServer: overrides.getOrActivateProviderIdForServer ?? (() => Promise.resolve(undefined)),
		getSessions: overrides.getSessions ?? (() => Promise.resolve([])),
		createSession: overrides.createSession ?? (() => Promise.reject(new Error('Unexpected createSession call'))),
		createDynamicAuthenticationProvider: overrides.createDynamicAuthenticationProvider ?? (() => Promise.resolve(undefined)),
		getProvider: overrides.getProvider ?? (() => { throw new Error('Unexpected getProvider call'); }),
		isDynamicAuthenticationProvider: overrides.isDynamicAuthenticationProvider ?? (() => false),
		isAuthenticationProviderRegistered: overrides.isAuthenticationProviderRegistered ?? (() => true),
		declaredProviders: overrides.declaredProviders ?? [],
		unregisterAuthenticationProvider: overrides.unregisterAuthenticationProvider ?? (() => { }),
	} as unknown as IAuthenticationService;
}

suite('native Loki authentication', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const session: AuthenticationSession = { id: 'session', accessToken: 'microsoft-token', account: { id: 'microsoft-account', label: 'Microsoft account' }, scopes: [NATIVE_LOKI_SCOPE] };
	const request: INativeLokiProtectedResource = { ...NATIVE_LOKI_PROTECTED_RESOURCE, _meta: nativeLokiAuthenticationMeta({ accountId: session.account.id, requestId: 'renewal' }) };
	const forwardedMicrosoftAccountMeta = {
		...authenticationAccountMeta({ providerId: 'microsoft', accountId: session.account.id }),
		...nativeLokiAuthenticationMeta({ accountId: session.account.id }),
	};

	test('generic Microsoft sign-in reuses the selected account when its Loki token already works', async () => {
		const resource: INativeLokiProtectedResource = { ...NATIVE_LOKI_PROTECTED_RESOURCE, _meta: nativeLokiAuthenticationMeta({ accountId: session.account.id }) };
		const lookups: object[] = [];
		const forwarded: object[] = [];
		const authenticationService = createMockAuthService({
			getSessions: async (providerId, scopes, options, activate) => {
				lookups.push({ providerId, scopes, options, activate });
				return [{ ...session, account: { id: 'personal-account', label: 'Personal' }, accessToken: 'other-token' }, session];
			},
			createSession: async () => { assert.fail('A usable Microsoft account must not start interactive broker sign-in'); },
		});
		const success = await authenticateNativeLokiWithMicrosoft(authenticationService, resource, {
			logPrefix: 'test',
			authenticate: async value => { forwarded.push(value); },
		});
		assert.deepStrictEqual({ success, lookups, forwarded }, {
			success: true,
			lookups: [{
				providerId: 'microsoft', scopes: [NATIVE_LOKI_SCOPE],
				options: {
					silent: true,
					account: { id: session.account.id, label: '' },
					authorizationServer: URI.parse(NATIVE_LOKI_AUTHORITY),
				},
				activate: true,
			}],
			forwarded: [{
				resource: resource.resource,
				scopes: [NATIVE_LOKI_SCOPE],
				token: session.accessToken,
				_meta: resource._meta,
			}],
		});
	});

	test('generic Microsoft sign-in does not reuse a quarantined Microsoft token', async () => {
		const resource: INativeLokiProtectedResource = { ...NATIVE_LOKI_PROTECTED_RESOURCE, _meta: nativeLokiAuthenticationMeta({ accountId: session.account.id }) };
		const replacement = { ...session, accessToken: 'fresh-token' };
		const cache = new AgentHostAuthTokenCache();
		cache.rejectSession(resource.resource, [NATIVE_LOKI_SCOPE], session);
		const forwarded: object[] = [];
		let interactiveCalls = 0;
		const authenticationService = createMockAuthService({
			getSessions: async () => [session],
			createSession: async () => { interactiveCalls++; return replacement; },
		});
		const success = await authenticateNativeLokiWithMicrosoft(authenticationService, resource, {
			authTokenCache: cache,
			logPrefix: 'test',
			authenticate: async value => { forwarded.push(value); },
		});
		assert.deepStrictEqual({ success, interactiveCalls, forwarded }, {
			success: true,
			interactiveCalls: 1,
			forwarded: [{
				resource: resource.resource,
				scopes: [NATIVE_LOKI_SCOPE],
				token: replacement.accessToken,
				_meta: resource._meta,
			}],
		});
	});

	test('generic Microsoft sign-in forwards the Microsoft provider token to native Loki', async () => {
		const resource: INativeLokiProtectedResource = { ...NATIVE_LOKI_PROTECTED_RESOURCE, _meta: nativeLokiAuthenticationMeta({ accountId: session.account.id }) };
		const acquisitions: object[] = [];
		const forwarded: object[] = [];
		const authenticationService = createMockAuthService({
			createSession: async (providerId, scopes, options) => {
				acquisitions.push({ providerId, scopes, options });
				return session;
			},
		});
		const success = await authenticateNativeLokiWithMicrosoft(authenticationService, resource, {
			logPrefix: 'test',
			authenticate: async value => { forwarded.push(value); },
		});
		assert.deepStrictEqual({ success, acquisitions, forwarded }, {
			success: true,
			acquisitions: [{
				providerId: 'microsoft',
				scopes: [NATIVE_LOKI_SCOPE],
				options: {
					activateImmediate: true,
					authorizationServer: URI.parse(NATIVE_LOKI_AUTHORITY),
					account: { id: session.account.id, label: '' },
				},
			}],
			forwarded: [{
				resource: resource.resource,
				scopes: [NATIVE_LOKI_SCOPE],
				token: session.accessToken,
				_meta: resource._meta,
			}],
		});
	});

	test('generic Microsoft sign-in never forwards a different account', async () => {
		const resource: INativeLokiProtectedResource = { ...NATIVE_LOKI_PROTECTED_RESOURCE, _meta: nativeLokiAuthenticationMeta({ accountId: session.account.id }) };
		const authenticationService = createMockAuthService({
			createSession: async () => ({ ...session, account: { id: 'other-account', label: 'Other account' } }),
		});
		const forwarded: object[] = [];
		await assert.rejects(authenticateNativeLokiWithMicrosoft(authenticationService, resource, {
			logPrefix: 'test',
			authenticate: async value => { forwarded.push(value); },
		}), /selected Microsoft account/);
		assert.deepStrictEqual(forwarded, []);
	});

	for (const scenario of [
		{ name: 'both', loki: true, emu: true, expectedScopes: [NATIVE_LOKI_SCOPE, NATIVE_EMU_SCOPE] },
		{ name: 'M365 only', loki: true, emu: false, expectedScopes: [NATIVE_LOKI_SCOPE] },
		{ name: 'EMU only', loki: false, emu: true, expectedScopes: [NATIVE_EMU_SCOPE] },
	]) {
		test(`one Microsoft sign-in enables ${scenario.name} without requiring the other service`, async () => {
			const resource: INativeLokiProtectedResource = { ...NATIVE_LOKI_PROTECTED_RESOURCE, _meta: nativeLokiAuthenticationMeta({ accountId: session.account.id }) };
			const emuSession: AuthenticationSession = { ...session, accessToken: 'emu-token', scopes: [NATIVE_EMU_SCOPE] };
			const forwarded: IAgentHostAuthenticateRequest[] = [];
			const prompted: string[] = [];
			const authenticationService = createMockAuthService({
				getSessions: async (_providerId, scopes) => scopes?.includes(NATIVE_EMU_SCOPE)
					? scenario.emu ? [emuSession] : []
					: scenario.loki ? [session] : [],
				createSession: async (_providerId, scopes) => {
					prompted.push(scopes[0]);
					throw new Error(`${scopes[0]} unavailable`);
				},
			});
			const success = await authenticateNativeLokiWithMicrosoft(authenticationService, resource, {
				logPrefix: 'test',
				authenticate: async value => { forwarded.push(value); },
			}, { resource: NATIVE_EMU_PROTECTED_RESOURCE, logService: store.add(new NullLogService()) });

			assert.deepStrictEqual({
				success,
				forwardedScopes: forwarded.map(value => value.scopes?.[0]),
				forwardedAccounts: forwarded.map(value => value._meta),
				prompted,
			}, {
				success: true,
				forwardedScopes: scenario.expectedScopes,
				forwardedAccounts: scenario.expectedScopes.map(() => nativeLokiAuthenticationMeta({ accountId: session.account.id })),
				prompted: scenario.loki && scenario.emu ? [] : [scenario.loki ? NATIVE_EMU_SCOPE : NATIVE_LOKI_SCOPE],
			});
		});
	}

	test('one Microsoft sign-in fails explicitly when neither audience is available', async () => {
		const resource: INativeLokiProtectedResource = { ...NATIVE_LOKI_PROTECTED_RESOURCE, _meta: nativeLokiAuthenticationMeta({ accountId: session.account.id }) };
		const forwarded: object[] = [];
		const authenticationService = createMockAuthService({
			getSessions: async () => [],
			createSession: async (_providerId, scopes) => { throw new Error(`${scopes[0]} unavailable`); },
		});
		await assert.rejects(authenticateNativeLokiWithMicrosoft(authenticationService, resource, {
			logPrefix: 'test',
			authenticate: async value => { forwarded.push(value); },
		}, { resource: NATIVE_EMU_PROTECTED_RESOURCE, logService: store.add(new NullLogService()) }), /unavailable/);
		assert.deepStrictEqual(forwarded, []);
	});

	test('switching Microsoft accounts revokes both old runtime credentials before forwarding either new one', async () => {
		const oldAccountId = 'previous-microsoft-account';
		const active = nativeLokiActiveAccountMeta(oldAccountId);
		const resource: INativeLokiProtectedResource = { ...NATIVE_LOKI_PROTECTED_RESOURCE, _meta: active };
		const emuResource: INativeLokiProtectedResource = { ...NATIVE_EMU_PROTECTED_RESOURCE, _meta: active };
		const emuSession: AuthenticationSession = { ...session, scopes: [NATIVE_EMU_SCOPE], accessToken: 'emu-token' };
		const forwarded: IAgentHostAuthenticateRequest[] = [];
		const authenticationService = createMockAuthService({
			getSessions: async (_providerId, scopes) => scopes?.includes(NATIVE_EMU_SCOPE) ? [emuSession] : [],
			createSession: async () => session,
		});
		await authenticateNativeLokiWithMicrosoft(authenticationService, resource, {
			logPrefix: 'test',
			authTokenCache: new AgentHostAuthTokenCache(),
			authenticate: async value => { forwarded.push(value); },
		}, { resource: emuResource, logService: store.add(new NullLogService()) });
		assert.deepStrictEqual(forwarded, [
			{ resource: resource.resource, scopes: [NATIVE_LOKI_SCOPE], token: '', _meta: nativeLokiAuthenticationMeta({ accountId: oldAccountId }) },
			{ resource: emuResource.resource, scopes: [NATIVE_EMU_SCOPE], token: '', _meta: nativeLokiAuthenticationMeta({ accountId: oldAccountId }) },
			{ resource: resource.resource, scopes: [NATIVE_LOKI_SCOPE], token: session.accessToken, _meta: nativeLokiAuthenticationMeta({ accountId: session.account.id }) },
			{ resource: emuResource.resource, scopes: [NATIVE_EMU_SCOPE], token: emuSession.accessToken, _meta: nativeLokiAuthenticationMeta({ accountId: session.account.id }) },
		]);
	});

	test('an unavailable optional service revokes its old token while keeping the other service', async () => {
		const active = nativeLokiActiveAccountMeta(session.account.id);
		const resource: INativeLokiProtectedResource = { ...NATIVE_LOKI_PROTECTED_RESOURCE, _meta: active };
		const emuResource: INativeLokiProtectedResource = { ...NATIVE_EMU_PROTECTED_RESOURCE, _meta: active };
		const forwarded: IAgentHostAuthenticateRequest[] = [];
		const authenticationService = createMockAuthService({
			getSessions: async () => [],
			createSession: async (_providerId, scopes) => {
				if (scopes.includes(NATIVE_EMU_SCOPE)) {
					throw new Error('EMU unavailable');
				}
				return session;
			},
		});
		const success = await authenticateNativeLokiWithMicrosoft(authenticationService, resource, {
			logPrefix: 'test',
			authenticate: async value => { forwarded.push(value); },
		}, { resource: emuResource, logService: store.add(new NullLogService()) });
		assert.deepStrictEqual({ success, forwarded }, {
			success: true,
			forwarded: [
				{ resource: emuResource.resource, scopes: [NATIVE_EMU_SCOPE], token: '', _meta: nativeLokiAuthenticationMeta({ accountId: session.account.id }) },
				{ resource: resource.resource, scopes: [NATIVE_LOKI_SCOPE], token: session.accessToken, _meta: nativeLokiAuthenticationMeta({ accountId: session.account.id }) },
			],
		});
	});

	for (const selectedAccount of [true, false]) {
		test(`signed-out MSIT sign-in uses the Microsoft provider without GitHub (pinned: ${selectedAccount})`, async () => {
			let signedIn = false;
			const otherSession = { ...session, accessToken: 'other-token', account: { id: 'other-account', label: 'Other account' } };
			const acquisitions: object[] = [];
			const requests: object[] = [];
			const resource: INativeLokiProtectedResource = {
				...NATIVE_LOKI_PROTECTED_RESOURCE,
				resource: NATIVE_LOKI_BASE_URLS[1],
				...(selectedAccount ? { _meta: nativeLokiAuthenticationMeta({ accountId: session.account.id }) } : {}),
			};
			const authenticationService = createMockAuthService({
				getOrActivateProviderIdForServer: async () => 'microsoft',
				getSessions: async () => signedIn ? [otherSession, session] : [],
				createSession: async (providerId, scopes, options) => {
					acquisitions.push({ providerId, scopes, options });
					signedIn = true;
					return session;
				},
			});
			const commandService = new TestCommandService();
			commandService.onExecute = async (commandId, args) => {
				assert.strictEqual(commandId, CHAT_SETUP_ACTION_ID);
				const setup = args[1];
				assert.ok(isDirectMicrosoftSignInSetup(setup));
				await setup.directMicrosoftSignIn();
			};
			const instantiation = createAuthInstantiationService(store, authenticationService, commandService);
			const success = await instantiation.invokeFunction(resolveAuthenticationInteractively, [resource], {
				logPrefix: 'test',
				authenticate: async value => { requests.push(value); },
			});
			const setup = commandService.calls[0].args[1];
			assert.ok(isDirectMicrosoftSignInSetup(setup));
			assert.deepStrictEqual({
				success,
				dialogTitle: setup.dialogTitle,
				buttonAction: typeof setup.directMicrosoftSignIn,
				additionalScopes: setup.additionalScopes,
				acquisitions,
				requests,
			}, {
				success: true,
				dialogTitle: 'Sign in to use Copilot',
				buttonAction: 'function',
				additionalScopes: undefined,
				acquisitions: [{
					providerId: 'microsoft',
					scopes: [NATIVE_LOKI_SCOPE],
					options: {
						activateImmediate: true,
						authorizationServer: URI.parse(NATIVE_LOKI_AUTHORITY),
						...(selectedAccount ? { account: { id: session.account.id, label: '' } } : {}),
					},
				}],
				requests: [{
					resource: resource.resource,
					scopes: [NATIVE_LOKI_SCOPE],
					token: session.accessToken,
					_meta: forwardedMicrosoftAccountMeta,
				}],
			});
		});
	}

	for (const hasLokiSession of [true, false]) {
		test(`the shared sign-in picker enables ${hasLokiSession ? 'both providers' : 'EMU without Loki'}`, async () => {
			const resource: INativeLokiProtectedResource = { ...NATIVE_LOKI_PROTECTED_RESOURCE, _meta: nativeLokiAuthenticationMeta({ accountId: session.account.id }) };
			const emuSession: AuthenticationSession = { ...session, scopes: [NATIVE_EMU_SCOPE], accessToken: 'emu-token' };
			const requests: IAgentHostAuthenticateRequest[] = [];
			const auth = createMockAuthService({
				getOrActivateProviderIdForServer: async () => 'microsoft',
				getSessions: async (_providerId, scopes) => scopes?.includes(NATIVE_EMU_SCOPE)
					? [emuSession] : hasLokiSession ? [session] : [],
				createSession: async (_providerId, scopes) => { throw new Error(`${scopes[0]} unavailable`); },
			});
			const commands = new TestCommandService();
			commands.onExecute = async (_commandId, args) => {
				const setup = args[1];
				assert.ok(isDirectMicrosoftSignInSetup(setup));
				await setup.directMicrosoftSignIn();
			};
			const instantiation = createAuthInstantiationService(store, auth, commands);
			const success = await instantiation.invokeFunction(resolveAuthenticationInteractively, [resource, NATIVE_EMU_PROTECTED_RESOURCE], {
				logPrefix: 'test',
				forceSignInDialog: true,
				optionalEmuResource: NATIVE_EMU_PROTECTED_RESOURCE,
				authenticate: async request => { requests.push(request); },
			});
			assert.deepStrictEqual({
				success,
				scopes: requests.map(request => request.scopes?.[0]),
				accounts: requests.map(request => request._meta),
			}, {
				success: true,
				scopes: hasLokiSession ? [NATIVE_LOKI_SCOPE, NATIVE_EMU_SCOPE] : [NATIVE_EMU_SCOPE],
				accounts: (hasLokiSession ? [NATIVE_LOKI_SCOPE, NATIVE_EMU_SCOPE] : [NATIVE_EMU_SCOPE])
					.map(() => nativeLokiAuthenticationMeta({ accountId: session.account.id })),
			});
		});
	}

	test('rejects a different account returned by Microsoft sign-in', async () => {
		const requests: object[] = [];
		const resource: INativeLokiProtectedResource = { ...NATIVE_LOKI_PROTECTED_RESOURCE, _meta: nativeLokiAuthenticationMeta({ accountId: session.account.id }) };
		const authenticationService = createMockAuthService({
			getOrActivateProviderIdForServer: async () => 'microsoft',
			getSessions: async () => [],
			createSession: async () => ({ ...session, account: { id: 'other-account', label: 'Other account' } }),
		});
		const commandService = new TestCommandService();
		commandService.onExecute = async (_commandId, args) => {
			const setup = args[1];
			assert.ok(isDirectMicrosoftSignInSetup(setup));
			await setup.directMicrosoftSignIn();
		};
		const instantiation = createAuthInstantiationService(store, authenticationService, commandService);
		await assert.rejects(instantiation.invokeFunction(resolveAuthenticationInteractively, [resource], {
			logPrefix: 'test',
			authenticate: async value => { requests.push(value); },
		}), /selected Microsoft account/);
		assert.deepStrictEqual(requests, []);
	});

	test('cancelling native Loki sign-in does not acquire or forward a token', async () => {
		const resource: INativeLokiProtectedResource = { ...NATIVE_LOKI_PROTECTED_RESOURCE, _meta: nativeLokiAuthenticationMeta({ accountId: session.account.id }) };
		let createSessionCalls = 0;
		const authenticationService = createMockAuthService({
			getOrActivateProviderIdForServer: async () => 'microsoft',
			getSessions: async () => [],
			createSession: async () => { createSessionCalls++; return session; },
		});
		const commandService = new TestCommandService();
		commandService.result = { success: undefined, dialogSkipped: false };
		const instantiation = createAuthInstantiationService(store, authenticationService, commandService);
		const success = await instantiation.invokeFunction(resolveAuthenticationInteractively, [resource], {
			logPrefix: 'test',
			authenticate: async () => { assert.fail('Unexpected token forwarding'); },
		});
		assert.deepStrictEqual({ success, createSessionCalls }, { success: false, createSessionCalls: 0 });
	});

	test('the explicit native Loki sign-in action prompts even with a cached Microsoft session', async () => {
		const resource: INativeLokiProtectedResource = { ...NATIVE_LOKI_PROTECTED_RESOURCE, _meta: nativeLokiAuthenticationMeta({ accountId: session.account.id }) };
		const requests: object[] = [];
		let createSessionCalls = 0;
		const authenticationService = createMockAuthService({
			getOrActivateProviderIdForServer: async () => 'microsoft',
			getSessions: async () => [session],
			createSession: async () => { createSessionCalls++; return session; },
		});
		const commandService = new TestCommandService();
		commandService.onExecute = async (_commandId, args) => {
			const setup = args[1];
			assert.ok(isDirectMicrosoftSignInSetup(setup));
			await setup.directMicrosoftSignIn();
		};
		const instantiation = createAuthInstantiationService(store, authenticationService, commandService);
		const success = await instantiation.invokeFunction(resolveAuthenticationInteractively, [resource], {
			forceSignInDialog: true,
			logPrefix: 'test',
			authenticate: async value => { requests.push(value); },
		});
		assert.deepStrictEqual({ success, dialogCount: commandService.calls.length, createSessionCalls, requests }, {
			success: true,
			dialogCount: 1,
			createSessionCalls: 1,
			requests: [{
				resource: resource.resource, scopes: [NATIVE_LOKI_SCOPE], token: session.accessToken,
				_meta: forwardedMicrosoftAccountMeta,
			}],
		});
	});

	test('rejects unexpected native Loki scopes before showing Microsoft sign-in', async () => {
		const authenticationService = createMockAuthService({
			getOrActivateProviderIdForServer: async () => 'microsoft',
			getSessions: async () => [],
		});
		const commandService = new TestCommandService();
		const instantiation = createAuthInstantiationService(store, authenticationService, commandService);
		await assert.rejects(instantiation.invokeFunction(resolveAuthenticationInteractively, [{
			...NATIVE_LOKI_PROTECTED_RESOURCE, scopes_supported: ['unexpected-scope']
		}], { logPrefix: 'test', authenticate: async () => { } }), /unexpected Microsoft scope/);
		assert.deepStrictEqual(commandService.calls, []);
	});

	for (const selectedAvailable of [true, false]) {
		test(`explicit initial account selection never borrows another account (available: ${selectedAvailable})`, async () => {
			const requests: object[] = [];
			const lookups: object[] = [];
			const otherSession = { ...session, id: 'other', accessToken: 'other-token', account: { id: 'other-account', label: 'Other' } };
			const auth = createMockAuthService({
				getOrActivateProviderIdForServer: async () => 'microsoft',
				getSessions: async (_provider, _scopes, options) => {
					lookups.push(options.account);
					return selectedAvailable ? [otherSession, session] : [otherSession];
				},
			});
			const instantiation = createAuthInstantiationService(store, auth);
			const resource = { ...NATIVE_LOKI_PROTECTED_RESOURCE, _meta: nativeLokiAuthenticationMeta({ accountId: session.account.id }) };
			await instantiation.invokeFunction(authenticateProtectedResources, [{ provider: 'copilotcli', displayName: 'Copilot', description: 'Copilot', models: [], protectedResources: [resource] }], {
				logPrefix: 'test',
				authenticate: async request => { requests.push(request); },
			});
			assert.deepStrictEqual({ requests, lookups }, {
				requests: selectedAvailable ? [{
					resource: resource.resource, scopes: [NATIVE_LOKI_SCOPE], token: session.accessToken,
					_meta: forwardedMicrosoftAccountMeta,
				}] : [],
				lookups: Array.from({ length: selectedAvailable ? 1 : 2 }, () => ({ id: session.account.id, label: '' })),
			});
		});
	}

	test('initial protected-resource forwarding includes the host account identity', async () => {
		const requests: object[] = [];
		const auth = createMockAuthService({ getOrActivateProviderIdForServer: async () => 'microsoft', getSessions: async () => [session] });
		const instantiation = createAuthInstantiationService(store, auth);
		await instantiation.invokeFunction(authenticateProtectedResources, [{ provider: 'copilotcli', displayName: 'Copilot', description: 'Copilot', models: [], protectedResources: [NATIVE_LOKI_PROTECTED_RESOURCE] }], {
			logPrefix: 'test',
			authenticate: async request => { requests.push(request); },
		});
		assert.deepStrictEqual(requests, [{
			resource: NATIVE_LOKI_PROTECTED_RESOURCE.resource,
			scopes: [NATIVE_LOKI_SCOPE],
			token: session.accessToken,
			_meta: forwardedMicrosoftAccountMeta,
		}]);
	});

	test('MSIT initial authentication and renewal retain the selected resource and account', async () => {
		const replies: object[] = [];
		const resource = { ...NATIVE_LOKI_PROTECTED_RESOURCE, resource: NATIVE_LOKI_BASE_URLS[1] };
		const auth = createMockAuthService({ getOrActivateProviderIdForServer: async () => 'microsoft', getSessions: async () => [session] });
		const instantiation = createAuthInstantiationService(store, auth);
		const options: IAgentHostAuthenticationOptions = { logPrefix: 'test', authenticate: async reply => { replies.push(reply); } };
		await instantiation.invokeFunction(authenticateProtectedResources, [{ provider: 'copilotcli', displayName: 'Copilot', description: 'Copilot', models: [], protectedResources: [resource] }], options);
		const challenge: INativeLokiProtectedResource = { ...resource, _meta: request._meta };
		const recovery = new AgentHostAuthenticationRecovery(NullTelemetryService);
		await instantiation.invokeFunction(accessor => recovery.recover(accessor, challenge, options));
		assert.deepStrictEqual(replies, [
			{ resource: resource.resource, scopes: [NATIVE_LOKI_SCOPE], token: session.accessToken, _meta: forwardedMicrosoftAccountMeta },
			{ resource: resource.resource, scopes: [NATIVE_LOKI_SCOPE], token: session.accessToken, _meta: request._meta },
		]);
	});

	for (const available of [true, false]) {
		test(`renewal is silent and ${available ? 'uses the exact account' : 'does not substitute another account'}`, async () => {
			const acquisitions: object[] = [];
			const replies: object[] = [];
			const auth = createMockAuthService({
				getSessions: async (providerId, scopes, options) => {
					acquisitions.push({ providerId, scopes, options });
					return [available ? session : { ...session, account: { id: 'other-account', label: 'Other' } }];
				},
			});
			await renewNativeLokiToken(auth, request, {
				logPrefix: 'test',
				authTokenCache: new AgentHostAuthTokenCache(),
				authenticate: async reply => { replies.push(reply); },
			});
			assert.deepStrictEqual({ acquisitions, replies }, {
				acquisitions: [{
					providerId: 'microsoft', scopes: [NATIVE_LOKI_SCOPE],
					options: { silent: true, account: { id: session.account.id, label: '' }, authorizationServer: URI.parse(NATIVE_LOKI_AUTHORITY) },
				}],
				replies: [{
					resource: request.resource,
					scopes: [NATIVE_LOKI_SCOPE],
					token: available ? session.accessToken : '',
					_meta: request._meta,
				}],
			});
		});
	}

	test('initial authentication forwards both Microsoft audiences for the same account', async () => {
		const replies: object[] = [];
		const emuSession: AuthenticationSession = { ...session, accessToken: 'emu-token', scopes: [NATIVE_EMU_SCOPE] };
		const auth = createMockAuthService({
			getOrActivateProviderIdForServer: async () => 'microsoft',
			getSessions: async (_providerId, scopes) => scopes?.includes(NATIVE_EMU_SCOPE) ? [emuSession] : [session],
		});
		const instantiation = createAuthInstantiationService(store, auth);
		await instantiation.invokeFunction(authenticateProtectedResources, [{
			provider: 'copilotcli', displayName: 'Copilot', description: 'Copilot', models: [],
			protectedResources: [NATIVE_LOKI_PROTECTED_RESOURCE, NATIVE_EMU_PROTECTED_RESOURCE],
		}], {
			logPrefix: 'test',
			authenticate: async reply => { replies.push(reply); },
		});
		assert.deepStrictEqual(replies, [
			{ resource: NATIVE_LOKI_PROTECTED_RESOURCE.resource, scopes: [NATIVE_LOKI_SCOPE], token: session.accessToken, _meta: forwardedMicrosoftAccountMeta },
			{ resource: NATIVE_EMU_PROTECTED_RESOURCE.resource, scopes: [NATIVE_EMU_SCOPE], token: emuSession.accessToken, _meta: forwardedMicrosoftAccountMeta },
		]);
	});

	test('EMU renewal is silent and a missing token does not prompt or borrow another account', async () => {
		const replies: object[] = [];
		const resource: INativeLokiProtectedResource = {
			...NATIVE_EMU_PROTECTED_RESOURCE,
			_meta: nativeLokiAuthenticationMeta({ accountId: session.account.id, requestId: 'emu-renewal' }),
		};
		const auth = createMockAuthService({
			getSessions: async () => [{ ...session, scopes: [NATIVE_EMU_SCOPE], account: { id: 'other-account', label: 'Other' } }],
		});
		await renewNativeLokiToken(auth, resource, {
			logPrefix: 'test',
			authenticate: async reply => { replies.push(reply); },
		});
		assert.deepStrictEqual(replies, [{
			resource: resource.resource, scopes: [NATIVE_EMU_SCOPE], token: '', _meta: resource._meta,
		}]);
	});

	test('a disconnected client cannot forward a late renewal', async () => {
		let current = true;
		const auth = createMockAuthService({ getSessions: async () => { current = false; return [session]; } });
		await assert.rejects(renewNativeLokiToken(auth, request, {
			logPrefix: 'test',
			isCurrent: () => current,
			authenticate: async () => { assert.fail('Unexpected token forwarding'); },
		}), isCancellationError);
	});

	test('recovery answers concurrent renewals even when the host returns the same token', async () => {
		const replies: object[] = [];
		const auth = createMockAuthService({ getSessions: async () => [session] });
		const instantiation = createAuthInstantiationService(store, auth);
		const recovery = new AgentHostAuthenticationRecovery(NullTelemetryService);
		const options: IAgentHostAuthenticationOptions = {
			logPrefix: 'test',
			authTokenCache: new AgentHostAuthTokenCache(),
			authenticate: async reply => { replies.push(reply); },
		};
		await Promise.all(['one', 'two'].map(requestId => {
			const resource: INativeLokiProtectedResource = { ...request, _meta: nativeLokiAuthenticationMeta({ accountId: session.account.id, requestId }) };
			return instantiation.invokeFunction(accessor => recovery.recover(accessor, resource, options));
		}));
		assert.deepStrictEqual(replies, ['one', 'two'].map(requestId => ({
			resource: request.resource, scopes: [NATIVE_LOKI_SCOPE], token: session.accessToken,
			_meta: nativeLokiAuthenticationMeta({ accountId: session.account.id, requestId }),
		})));
	});

	test('authentication failures release the runtime callback and remain visible to the caller', async () => {
		const replies: object[] = [];
		const auth = createMockAuthService({ getSessions: async () => { throw new Error('Microsoft authentication failed'); } });
		await assert.rejects(renewNativeLokiToken(auth, request, {
			logPrefix: 'test',
			authenticate: async reply => { replies.push(reply); },
		}), /Microsoft authentication failed/);
		assert.deepStrictEqual(replies, [{
			resource: request.resource, scopes: [NATIVE_LOKI_SCOPE], token: '', _meta: request._meta,
		}]);
	});
});

suite('agentHostMcpServerId', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('is stable for the same authority, server name and resource url', () => {
		// The key must not depend on the (per-session / per-sync) customization id, so remembered
		// auth survives reloads. Same inputs must always produce the same key.
		const a = agentHostMcpServerId('remote-host', 'GitHub', 'https://api.githubcopilot.com/mcp/');
		const b = agentHostMcpServerId('remote-host', 'GitHub', 'https://api.githubcopilot.com/mcp/');
		assert.strictEqual(a, b);
		assert.strictEqual(a, 'agent-host-mcp:remote-host/GitHub/https%3A%2F%2Fapi.githubcopilot.com%2Fmcp%2F');
	});

	test('differs when authority, name or url differ', () => {
		const base = agentHostMcpServerId('host-1', 'GitHub', 'https://a.example/mcp');
		const keys = new Set([
			base,
			agentHostMcpServerId('host-2', 'GitHub', 'https://a.example/mcp'),
			agentHostMcpServerId('host-1', 'Other', 'https://a.example/mcp'),
			agentHostMcpServerId('host-1', 'GitHub', 'https://b.example/mcp'),
		]);
		assert.strictEqual(keys.size, 4);
	});
});

suite('resolveSessionForResource', () => {

	const log = new NullLogService();
	const resource = URI.parse('https://api.example.com');

	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns undefined when no authorization servers provided', async () => {
		const authService = createMockAuthService({});
		const token = (await resolveSessionForResource(resource, [], ['read'], authService, log, 'test'))?.accessToken;
		assert.strictEqual(token, undefined);
	});

	test('returns undefined when no provider matches the server', async () => {
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve(undefined),
		});
		const token = (await resolveSessionForResource(resource, ['https://auth.example.com'], ['read'], authService, log, 'test'))?.accessToken;
		assert.strictEqual(token, undefined);
	});

	test('returns token from exact scope match', async () => {
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
			getSessions: (_providerId, scopes) => {
				if (scopes && scopes.length === 1 && scopes[0] === 'read') {
					return Promise.resolve([{ scopes: ['read'], accessToken: 'exact-token' }]);
				}
				return Promise.resolve([]);
			},
		});
		const token = (await resolveSessionForResource(resource, ['https://auth.example.com'], ['read'], authService, log, 'test'))?.accessToken;
		assert.strictEqual(token, 'exact-token');
	});

	test('falls back to narrowest superset session when exact match fails', async () => {
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
			getSessions: (_providerId, scopes) => {
				if (scopes !== undefined) {
					// Exact match returns empty
					return Promise.resolve([]);
				}
				// All sessions — return two superset options
				return Promise.resolve([
					{ scopes: ['read', 'write', 'admin'], accessToken: 'wide-token' },
					{ scopes: ['read', 'write'], accessToken: 'narrow-token' },
				]);
			},
		});
		const token = (await resolveSessionForResource(resource, ['https://auth.example.com'], ['read'], authService, log, 'test'))?.accessToken;
		assert.strictEqual(token, 'narrow-token');
	});

	test('returns undefined when no session has matching scopes', async () => {
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
			getSessions: (_providerId, scopes) => {
				if (scopes !== undefined) {
					return Promise.resolve([]);
				}
				// No session contains the 'read' scope
				return Promise.resolve([
					{ scopes: ['write'], accessToken: 'wrong-token' },
				]);
			},
		});
		const token = (await resolveSessionForResource(resource, ['https://auth.example.com'], ['read'], authService, log, 'test'))?.accessToken;
		assert.strictEqual(token, undefined);
	});

	test('tries multiple authorization servers in order', async () => {
		const calls: string[] = [];
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: (serverUri) => {
				calls.push(serverUri.toString());
				if (serverUri.toString() === 'https://auth2.example.com/') {
					return Promise.resolve('provider-2');
				}
				return Promise.resolve(undefined);
			},
			getSessions: () => Promise.resolve([{ scopes: ['read'], accessToken: 'server2-token' }]),
		});
		const token = (await resolveSessionForResource(
			resource,
			['https://auth1.example.com', 'https://auth2.example.com'],
			['read'], authService, log, 'test',
		))?.accessToken;
		assert.strictEqual(token, 'server2-token');
		assert.strictEqual(calls.length, 2);
	});
});

suite('AgentHostAuthTokenCache', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('forwards the first token and skips it after completion', async () => {
		const cache = new AgentHostAuthTokenCache();
		let authenticateCalls = 0;
		const authenticate = async () => { authenticateCalls++; };

		const results = [
			await cache.authenticate('https://api.example.com', ['read'], 'tok1', authenticate),
			await cache.authenticate('https://api.example.com', ['read'], 'tok1', authenticate),
		];

		assert.deepStrictEqual({ results, authenticateCalls }, { results: [true, false], authenticateCalls: 1 });
	});

	test('same-token callers await the in-flight authentication', async () => {
		const cache = new AgentHostAuthTokenCache();
		const authentication = new DeferredPromise<void>();
		let authenticateCalls = 0;
		const authenticate = async () => {
			authenticateCalls++;
			await authentication.p;
		};
		let secondSettled = false;

		const first = cache.authenticate('https://api.example.com', ['read'], 'tok1', authenticate);
		const second = cache.authenticate('https://api.example.com', ['read'], 'tok1', authenticate).then(result => {
			secondSettled = true;
			return result;
		});
		await Promise.resolve();
		const beforeCompletion = { authenticateCalls, secondSettled };
		authentication.complete();

		assert.deepStrictEqual({
			beforeCompletion,
			results: await Promise.all([first, second]),
			authenticateCalls,
		}, {
			beforeCompletion: { authenticateCalls: 1, secondSettled: false },
			results: [true, false],
			authenticateCalls: 1,
		});
	});

	test('forwards changed account provenance even when the token is unchanged', async () => {
		const cache = new AgentHostAuthTokenCache();
		let calls = 0;
		const send = async () => { calls++; };
		const results = [
			await cache.authenticate('resource', ['repo'], 'token', send),
			await cache.authenticate('resource', ['repo'], 'token', send, 'account-a'),
			await cache.authenticate('resource', ['repo'], 'token', send, 'account-a'),
			await cache.authenticate('resource', ['repo'], 'token', send, 'account-b'),
		];
		assert.deepStrictEqual({ results, calls }, { results: [true, true, false, true], calls: 3 });
	});

	test('different tokens are serialized for the same resource and scopes', async () => {
		const cache = new AgentHostAuthTokenCache();
		const firstAuthentication = new DeferredPromise<void>();
		const calls: string[] = [];

		const first = cache.authenticate('https://api.example.com', ['read'], 'tok1', async () => {
			calls.push('tok1');
			await firstAuthentication.p;
		});
		const second = cache.authenticate('https://api.example.com', ['read'], 'tok2', async () => {
			calls.push('tok2');
		});
		await Promise.resolve();
		const beforeCompletion = [...calls];
		firstAuthentication.complete();
		await Promise.all([first, second]);

		assert.deepStrictEqual({ beforeCompletion, calls }, { beforeCompletion: ['tok1'], calls: ['tok1', 'tok2'] });
	});

	test('a completed token waits for a newer in-flight authentication', async () => {
		const cache = new AgentHostAuthTokenCache();
		const newerAuthentication = new DeferredPromise<void>();
		const calls: string[] = [];
		await cache.authenticate('https://api.example.com', ['read'], 'tok1', async () => {
			calls.push('tok1');
		});
		const newer = cache.authenticate('https://api.example.com', ['read'], 'tok2', async () => {
			calls.push('tok2');
			await newerAuthentication.p;
		});
		let olderSettled = false;
		const older = cache.authenticate('https://api.example.com', ['read'], 'tok1', async () => {
			calls.push('tok1');
		}).then(result => {
			olderSettled = true;
			return result;
		});
		await Promise.resolve();
		const beforeCompletion = { calls: [...calls], olderSettled };
		newerAuthentication.complete();

		assert.deepStrictEqual({
			beforeCompletion,
			results: await Promise.all([newer, older]),
			calls,
		}, {
			beforeCompletion: { calls: ['tok1', 'tok2'], olderSettled: false },
			results: [true, true],
			calls: ['tok1', 'tok2', 'tok1'],
		});
	});

	test('clear cancels queued authentication from the previous generation', async () => {
		const cache = new AgentHostAuthTokenCache();
		const firstAuthentication = new DeferredPromise<void>();
		const calls: string[] = [];
		const first = cache.authenticate('https://api.example.com', ['read'], 'tok1', async () => {
			calls.push('tok1');
			await firstAuthentication.p;
		});
		const queued = cache.authenticate('https://api.example.com', ['read'], 'tok2', async () => {
			calls.push('tok2');
		});
		cache.clear();
		await cache.authenticate('https://api.example.com', ['read'], 'tok3', async () => {
			calls.push('tok3');
		});
		firstAuthentication.complete();

		await assert.rejects(first);
		await assert.rejects(queued);
		assert.deepStrictEqual(calls, ['tok1', 'tok3']);
	});

	test('scoped clear does not cancel unrelated in-flight authentication', async () => {
		const cache = new AgentHostAuthTokenCache();
		const unrelatedAuthentication = new DeferredPromise<void>();
		let unrelatedCalls = 0;
		const unrelated = cache.authenticate('https://other.example.com', ['read'], 'other-token', async () => {
			unrelatedCalls++;
			await unrelatedAuthentication.p;
		});
		cache.clear('https://api.example.com', ['read']);
		unrelatedAuthentication.complete();

		assert.deepStrictEqual({
			result: await unrelated,
			unrelatedCalls,
			repeated: await cache.authenticate('https://other.example.com', ['read'], 'other-token', async () => {
				unrelatedCalls++;
			}),
		}, {
			result: true,
			unrelatedCalls: 1,
			repeated: false,
		});
	});

	test('tokens for distinct scopes and resources are tracked independently', async () => {
		const cache = new AgentHostAuthTokenCache();
		let authenticateCalls = 0;
		const authenticate = async () => { authenticateCalls++; };

		await Promise.all([
			cache.authenticate('https://api.example.com', ['read'], 'read-token', authenticate),
			cache.authenticate('https://api.example.com', ['write'], 'write-token', authenticate),
			cache.authenticate('https://other.example.com', ['read'], 'read-token', authenticate),
		]);

		assert.strictEqual(authenticateCalls, 3);
	});

	test('failed authentication is not cached', async () => {
		const cache = new AgentHostAuthTokenCache();
		let authenticateCalls = 0;
		await assert.rejects(cache.authenticate('https://api.example.com', ['read'], 'tok1', async () => {
			authenticateCalls++;
			throw new Error('failed');
		}), /failed/);
		await cache.authenticate('https://api.example.com', ['read'], 'tok1', async () => {
			authenticateCalls++;
		});

		assert.strictEqual(authenticateCalls, 2);
	});

	test('clear forgets every completed token', async () => {
		const cache = new AgentHostAuthTokenCache();
		let authenticateCalls = 0;
		const authenticate = async () => { authenticateCalls++; };
		await cache.authenticate('https://api.example.com', ['read'], 'tok1', authenticate);
		await cache.authenticate('https://other.example.com', ['read'], 'tok2', authenticate);
		cache.clear();
		await cache.authenticate('https://api.example.com', ['read'], 'tok1', authenticate);
		await cache.authenticate('https://other.example.com', ['read'], 'tok2', authenticate);

		assert.strictEqual(authenticateCalls, 4);
	});
});

suite('AgentHostAuthenticationRecovery', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('cancels recovery when its enablement generation becomes stale', async () => {
		const sessions = new DeferredPromise<readonly { scopes: string[]; accessToken: string }[]>();
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
			getSessions: () => sessions.p,
		});
		const commandService = new TestCommandService();
		const instantiationService = createAuthInstantiationService(disposables, authService, commandService);
		const recovery = new AgentHostAuthenticationRecovery(NullTelemetryService);
		const authenticateCalls: string[] = [];
		let current = true;
		const recoveryPromise = instantiationService.invokeFunction(accessor => recovery.recover(accessor, {
			resource: 'https://api.example.com',
			authorization_servers: ['https://auth.example.com'],
			scopes_supported: ['read'],
		}, {
			logPrefix: '[AgentHost]',
			isCurrent: () => current,
			authenticate: async request => { authenticateCalls.push(request.token); },
		}));

		current = false;
		recovery.clear();
		sessions.complete([{ scopes: ['read'], accessToken: 'tok-1' }]);

		await assert.rejects(recoveryPromise, /Canceled/);
		assert.deepStrictEqual({
			commandCalls: commandService.calls.length,
			authenticateCalls,
		}, {
			commandCalls: 0,
			authenticateCalls: [],
		});
	});

	test('force-forwards the post-sign-in token when session-change handling repopulates the cache', async () => {
		const token = { value: 'tok-1' };
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
			getSessions: (_providerId, scopes) => Promise.resolve(scopes ? [{
				id: 'session-id',
				account: { id: 'account-1', label: 'Account 1' },
				scopes,
				accessToken: token.value,
			}] : []),
		});
		const commandService = new TestCommandService();
		const instantiationService = createAuthInstantiationService(disposables, authService, commandService);
		const cache = new AgentHostAuthTokenCache();
		const recovery = new AgentHostAuthenticationRecovery(NullTelemetryService);
		const resource: ProtectedResourceMetadata = {
			resource: 'https://api.example.com',
			authorization_servers: ['https://auth.example.com'],
			scopes_supported: ['read'],
		};
		const authenticateCalls: string[] = [];
		const options: IAgentHostAuthenticationOptions = {
			authTokenCache: cache,
			logPrefix: '[AgentHost]',
			authenticate: async request => { authenticateCalls.push(request.token); },
		};

		await instantiationService.invokeFunction(accessor => recovery.recover(accessor, resource, options));
		commandService.onExecute = async () => {
			token.value = 'tok-2';
			await cache.authenticate(resource.resource, resource.scopes_supported, token.value, async () => {
				authenticateCalls.push(token.value);
			});
		};
		await instantiationService.invokeFunction(accessor => recovery.recover(accessor, resource, options));

		assert.deepStrictEqual({
			commandCalls: commandService.calls.length,
			authenticateCalls,
		}, {
			commandCalls: 1,
			authenticateCalls: ['tok-1', 'tok-2', 'tok-2'],
		});

		await instantiationService.invokeFunction(accessor => recovery.recover(accessor, resource, options));
		assert.strictEqual(commandService.calls.length, 2);
	});

	test('tries a broader matching session once before prompting again', async () => {
		const account = { id: 'account-1', label: 'Account 1' };
		const exactSession = { id: 'exact-session', scopes: ['read'], accessToken: 'stale-token', account };
		const broaderSession = { id: 'broader-session', scopes: ['read', 'write'], accessToken: 'fresh-token', account };
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
			getSessions: (_providerId, scopes) => Promise.resolve(scopes ? [exactSession] : [exactSession, broaderSession]),
		});
		const commandService = new TestCommandService();
		const instantiationService = createAuthInstantiationService(disposables, authService, commandService);
		const recovery = new AgentHostAuthenticationRecovery(NullTelemetryService);
		const resource: ProtectedResourceMetadata = {
			resource: 'https://api.example.com',
			authorization_servers: ['https://auth.example.com'],
			scopes_supported: ['read'],
		};
		const authenticateCalls: string[] = [];
		const options: IAgentHostAuthenticationOptions = {
			authTokenCache: new AgentHostAuthTokenCache(),
			logPrefix: '[AgentHost]',
			authenticate: async request => { authenticateCalls.push(request.token); },
		};

		await instantiationService.invokeFunction(accessor => recovery.recover(accessor, resource, options));
		await instantiationService.invokeFunction(accessor => recovery.recover(accessor, resource, options));
		const afterFallback = { commandCalls: commandService.calls.length, authenticateCalls: [...authenticateCalls] };
		await instantiationService.invokeFunction(accessor => recovery.recover(accessor, resource, options));

		assert.deepStrictEqual({
			afterFallback,
			commandCalls: commandService.calls.length,
			authenticateCalls,
		}, {
			afterFallback: { commandCalls: 0, authenticateCalls: ['stale-token', 'fresh-token'] },
			commandCalls: 1,
			authenticateCalls: ['stale-token', 'fresh-token', 'fresh-token'],
		});
	});

	test('defers when the quarantined replacement cannot be resolved yet', async () => {
		const account = { id: 'account-1', label: 'Account 1' };
		const exactSession = { id: 'exact-session', scopes: ['read'], accessToken: 'stale-token', account };
		const broaderSession = { id: 'broader-session', scopes: ['read', 'write'], accessToken: 'fresh-token', account };
		let providerReady = true;
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: async () => 'provider-1',
			getSessions: async (_providerId, scopes) => {
				if (scopes) {
					return [exactSession];
				}
				if (!providerReady) {
					throw new Error('Authentication provider unavailable');
				}
				return [exactSession, broaderSession];
			},
		});
		const commandService = new TestCommandService();
		const instantiationService = createAuthInstantiationService(disposables, authService, commandService);
		const recovery = new AgentHostAuthenticationRecovery(NullTelemetryService);
		const resource: ProtectedResourceMetadata = {
			resource: 'https://api.example.com',
			authorization_servers: ['https://auth.example.com'],
			scopes_supported: ['read'],
		};
		const authenticateCalls: string[] = [];
		const options: IAgentHostAuthenticationOptions = {
			authTokenCache: new AgentHostAuthTokenCache(),
			logPrefix: '[AgentHost]',
			authenticate: async request => { authenticateCalls.push(request.token); },
		};

		await instantiationService.invokeFunction(accessor => recovery.recover(accessor, resource, options));
		await instantiationService.invokeFunction(accessor => recovery.recover(accessor, resource, options));
		providerReady = false;
		await instantiationService.invokeFunction(accessor => recovery.recover(accessor, resource, options));

		assert.deepStrictEqual({ commandCalls: commandService.calls.length, authenticateCalls }, {
			commandCalls: 0,
			authenticateCalls: ['stale-token', 'fresh-token'],
		});
	});

	test('prompts when the broader session is removed after replacing a rejected exact session', async () => {
		const account = { id: 'account-1', label: 'Account 1' };
		const exactSession = { id: 'exact-session', scopes: ['read'], accessToken: 'stale-token', account };
		const broaderSession = { id: 'broader-session', scopes: ['read', 'write'], accessToken: 'fresh-token', account };
		let broaderSessionAvailable = true;
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
			getSessions: (_providerId, scopes) => Promise.resolve(scopes ? [exactSession] : [exactSession, ...(broaderSessionAvailable ? [broaderSession] : [])]),
		});
		const commandService = new TestCommandService();
		commandService.result = { success: undefined, dialogSkipped: false };
		const instantiationService = createAuthInstantiationService(disposables, authService, commandService);
		const recovery = new AgentHostAuthenticationRecovery(NullTelemetryService);
		const resource: ProtectedResourceMetadata = {
			resource: 'https://api.example.com',
			authorization_servers: ['https://auth.example.com'],
			scopes_supported: ['read'],
		};
		const authenticateCalls: string[] = [];
		const options: IAgentHostAuthenticationOptions = {
			authTokenCache: new AgentHostAuthTokenCache(),
			logPrefix: '[AgentHost]',
			authenticate: async request => { authenticateCalls.push(request.token); },
		};

		await instantiationService.invokeFunction(accessor => recovery.recover(accessor, resource, options));
		await instantiationService.invokeFunction(accessor => recovery.recover(accessor, resource, options));
		broaderSessionAvailable = false;
		await instantiationService.invokeFunction(accessor => recovery.recover(accessor, resource, options));

		assert.deepStrictEqual({
			commandCalls: commandService.calls.length,
			authenticateCalls,
		}, {
			commandCalls: 1,
			authenticateCalls: ['stale-token', 'fresh-token'],
		});
	});

	test('does not switch accounts without interactive sign-in', async () => {
		const exactSession = {
			id: 'exact-session',
			scopes: ['read'],
			accessToken: 'stale-token',
			account: { id: 'account-1', label: 'Account 1' },
		};
		const otherAccountSession = {
			id: 'other-account-session',
			scopes: ['read', 'write'],
			accessToken: 'other-account-token',
			account: { id: 'account-2', label: 'Account 2' },
		};
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
			getSessions: (_providerId, scopes) => Promise.resolve(scopes ? [exactSession] : [exactSession, otherAccountSession]),
		});
		const commandService = new TestCommandService();
		commandService.result = { success: undefined, dialogSkipped: false };
		const instantiationService = createAuthInstantiationService(disposables, authService, commandService);
		const recovery = new AgentHostAuthenticationRecovery(NullTelemetryService);
		const resource: ProtectedResourceMetadata = {
			resource: 'https://api.example.com',
			authorization_servers: ['https://auth.example.com'],
			scopes_supported: ['read'],
		};
		const authenticateCalls: string[] = [];
		const options: IAgentHostAuthenticationOptions = {
			authTokenCache: new AgentHostAuthTokenCache(),
			logPrefix: '[AgentHost]',
			authenticate: async request => { authenticateCalls.push(request.token); },
		};

		await instantiationService.invokeFunction(accessor => recovery.recover(accessor, resource, options));
		await instantiationService.invokeFunction(accessor => recovery.recover(accessor, resource, options));

		assert.deepStrictEqual({
			commandCalls: commandService.calls.length,
			authenticateCalls,
		}, {
			commandCalls: 1,
			authenticateCalls: ['stale-token'],
		});
	});

	test('does not forward credential removal and resets escalation when the current token disappears', async () => {
		const token = { value: 'tok-1' as string | undefined };
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
			getSessions: (_providerId, scopes) => Promise.resolve(token.value && scopes ? [{ scopes, accessToken: token.value }] : []),
		});
		const commandService = new TestCommandService();
		const instantiationService = createAuthInstantiationService(disposables, authService, commandService);
		const recovery = new AgentHostAuthenticationRecovery(NullTelemetryService);
		const resource: ProtectedResourceMetadata = {
			resource: 'https://api.example.com',
			authorization_servers: ['https://auth.example.com'],
			scopes_supported: ['read'],
		};
		const authenticateCalls: string[] = [];
		const options: IAgentHostAuthenticationOptions = {
			authTokenCache: new AgentHostAuthTokenCache(),
			logPrefix: '[AgentHost]',
			authenticate: async request => { authenticateCalls.push(request.token); },
		};

		await instantiationService.invokeFunction(accessor => recovery.recover(accessor, resource, options));
		token.value = undefined;
		await instantiationService.invokeFunction(accessor => recovery.recover(accessor, resource, options));
		token.value = 'tok-1';
		await instantiationService.invokeFunction(accessor => recovery.recover(accessor, resource, options));

		assert.deepStrictEqual({
			commandCalls: commandService.calls.length,
			authenticateCalls,
		}, {
			commandCalls: 0,
			authenticateCalls: ['tok-1', 'tok-1'],
		});
	});
});

suite('AgentHost authentication telemetry', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const resource: ProtectedResourceMetadata = {
		resource: 'https://private.example.com',
		authorization_servers: ['https://auth.example.com'],
		scopes_supported: ['read'],
	};
	const account = { id: 'private-account-id', label: 'Private Account' };
	const exactSession: AuthenticationSession = { id: 'private-session-id', scopes: ['read'], accessToken: 'private-token', account };
	const broaderSession: AuthenticationSession = { id: 'private-broader-session-id', scopes: ['read', 'write'], accessToken: 'private-broader-token', account };

	test('reports the recovery decisions and cancelled sign-in without session data', async () => {
		const telemetry = new TestAuthTelemetryService();
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: async () => 'private-provider-id',
			getSessions: async (_providerId, scopes) => scopes ? [exactSession] : [exactSession, broaderSession],
		});
		const commandService = new TestCommandService();
		commandService.result = { success: undefined, dialogSkipped: false };
		const instantiationService = createAuthInstantiationService(disposables, authService, commandService);
		instantiationService.stub(ITelemetryService, telemetry);
		const recovery = instantiationService.createInstance(AgentHostAuthenticationRecovery);
		const options: IAgentHostAuthenticationOptions = {
			authTokenCache: new AgentHostAuthTokenCache(),
			logPrefix: '[AgentHost]',
			authenticate: async () => { },
		};

		await instantiationService.invokeFunction(accessor => recovery.recover(accessor, resource, options));
		await instantiationService.invokeFunction(accessor => recovery.recover(accessor, resource, options));
		await instantiationService.invokeFunction(accessor => recovery.recover(accessor, resource, options));

		assert.deepStrictEqual(telemetry.events, [
			{ name: 'agentHost.authRecovery', data: { trigger: 'hostChallenge', action: 'forwardCurrent', initialSessionMatch: 'exact', quarantinePresent: false, windowAgeMs: '<duration>' } },
			{ name: 'agentHost.authRecovery', data: { trigger: 'hostChallenge', action: 'forwardAlternative', initialSessionMatch: 'exact', quarantinePresent: false, windowAgeMs: '<duration>' } },
			{ name: 'agentHost.authRecovery', data: { trigger: 'hostChallenge', action: 'prompt', initialSessionMatch: 'exact', quarantinePresent: true, windowAgeMs: '<duration>' } },
			{ name: 'agentHost.authSignInResult', data: { trigger: 'hostChallenge', result: 'cancelled', credentialChanged: undefined, sessionMatch: undefined, durationMs: '<duration>' } },
		]);
	});

	test('reports one decision for concurrent challenges', async () => {
		const telemetry = new TestAuthTelemetryService();
		const sessions = new DeferredPromise<AuthenticationSession[]>();
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: async () => 'private-provider-id',
			getSessions: async () => sessions.p,
		});
		const instantiationService = createAuthInstantiationService(disposables, authService);
		instantiationService.stub(ITelemetryService, telemetry);
		const recovery = instantiationService.createInstance(AgentHostAuthenticationRecovery);
		const options: IAgentHostAuthenticationOptions = { logPrefix: '[AgentHost]', authenticate: async () => { } };
		const first = instantiationService.invokeFunction(accessor => recovery.recover(accessor, resource, options));
		const second = instantiationService.invokeFunction(accessor => recovery.recover(accessor, resource, options));
		sessions.complete([exactSession]);
		await Promise.all([first, second]);

		assert.deepStrictEqual(telemetry.events, [
			{ name: 'agentHost.authRecovery', data: { trigger: 'hostChallenge', action: 'forwardCurrent', initialSessionMatch: 'exact', quarantinePresent: false, windowAgeMs: '<duration>' } },
		]);
	});

	test('does not emit recovery telemetry for ordinary background authentication', async () => {
		const telemetry = new TestAuthTelemetryService();
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: async () => 'private-provider-id',
			getSessions: async () => [exactSession],
		});
		const instantiationService = createAuthInstantiationService(disposables, authService);
		instantiationService.stub(ITelemetryService, telemetry);
		const agents: AgentInfo[] = [{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [], protectedResources: [resource] }];
		await instantiationService.invokeFunction(authenticateProtectedResources, agents, {
			logPrefix: '[AgentHost]',
			authenticate: async () => { },
		});

		assert.deepStrictEqual(telemetry.events, []);
	});

	test('distinguishes provider unavailability from missing sessions', async () => {
		const telemetry = new TestAuthTelemetryService();
		for (const available of [false, true]) {
			const authService = createMockAuthService({
				getOrActivateProviderIdForServer: async () => {
					if (!available) {
						throw new Error('Private provider error');
					}
					return 'private-provider-id';
				},
			});
			const instantiationService = createAuthInstantiationService(disposables, authService);
			instantiationService.stub(ITelemetryService, telemetry);
			const recovery = instantiationService.createInstance(AgentHostAuthenticationRecovery);
			await instantiationService.invokeFunction(accessor => recovery.recover(accessor, resource, {
				logPrefix: '[AgentHost]',
				authenticate: async () => { assert.fail('Should not forward a token'); },
			}));
		}
		assert.deepStrictEqual(telemetry.events, [
			{ name: 'agentHost.authRecovery', data: { trigger: 'hostChallenge', action: 'defer', initialSessionMatch: 'unavailable', quarantinePresent: false, windowAgeMs: '<duration>' } },
			{ name: 'agentHost.authRecovery', data: { trigger: 'hostChallenge', action: 'noSession', initialSessionMatch: 'none', quarantinePresent: false, windowAgeMs: '<duration>' } },
		]);
	});

	test('reports session creation without counting repeated cached forwards', async () => {
		const telemetry = new TestAuthTelemetryService();
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: async () => 'private-provider-id',
			getSessions: async (_providerId, scopes) => scopes ? [] : [broaderSession],
		});
		const instantiationService = createAuthInstantiationService(disposables, authService);
		instantiationService.stub(ITelemetryService, telemetry);
		const options: IAgentHostAuthenticationOptions = {
			authTokenCache: new AgentHostAuthTokenCache(),
			logPrefix: '[AgentHost]',
			authenticate: async () => { },
		};

		await instantiationService.invokeFunction(resolveAuthenticationInteractively, [resource], options);
		await instantiationService.invokeFunction(resolveAuthenticationInteractively, [resource], options);

		assert.deepStrictEqual(telemetry.events, [
			{ name: 'agentHost.authRecovery', data: { trigger: 'sessionCreation', action: 'forwardCurrent', initialSessionMatch: 'superset', quarantinePresent: false, windowAgeMs: '<duration>' } },
		]);
	});

	test('reports the actual scopes when a scoped lookup returns a broader session', async () => {
		const telemetry = new TestAuthTelemetryService();
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: async () => 'private-provider-id',
			getSessions: async () => [broaderSession],
		});
		const instantiationService = createAuthInstantiationService(disposables, authService);
		instantiationService.stub(ITelemetryService, telemetry);
		await instantiationService.invokeFunction(resolveAuthenticationInteractively, [resource], {
			logPrefix: '[AgentHost]',
			authenticate: async () => { },
		});

		assert.deepStrictEqual(telemetry.events, [
			{ name: 'agentHost.authRecovery', data: { trigger: 'sessionCreation', action: 'forwardCurrent', initialSessionMatch: 'superset', quarantinePresent: false, windowAgeMs: '<duration>' } },
		]);
	});

	for (const match of ['unchanged', 'exact', 'superset'] as const) {
		test(`reports sign-in credential selection: ${match}`, async () => {
			const telemetry = new TestAuthTelemetryService();
			let signedIn = false;
			const signedInSession = match === 'superset' ? broaderSession : {
				...exactSession,
				accessToken: match === 'unchanged' ? exactSession.accessToken : 'private-new-token',
			};
			const authService = createMockAuthService({
				getOrActivateProviderIdForServer: async () => 'private-provider-id',
				getSessions: async (_providerId, scopes) => {
					const session = signedIn ? signedInSession : exactSession;
					return scopes && session.scopes.length !== scopes.length ? [] : [session];
				},
			});
			const commandService = new TestCommandService();
			commandService.onExecute = () => { signedIn = true; };
			const instantiationService = createAuthInstantiationService(disposables, authService, commandService);
			instantiationService.stub(ITelemetryService, telemetry);
			const recovery = instantiationService.createInstance(AgentHostAuthenticationRecovery);
			const options: IAgentHostAuthenticationOptions = { logPrefix: '[AgentHost]', authenticate: async () => { } };

			await instantiationService.invokeFunction(accessor => recovery.recover(accessor, resource, options));
			await instantiationService.invokeFunction(accessor => recovery.recover(accessor, resource, options));

			assert.deepStrictEqual({ events: telemetry.events.length, result: telemetry.events.at(-1) }, {
				events: 3,
				result: {
					name: 'agentHost.authSignInResult',
					data: { trigger: 'hostChallenge', result: 'tokenForwarded', credentialChanged: match !== 'unchanged', sessionMatch: match === 'superset' ? 'superset' : 'exact', durationMs: '<duration>' },
				},
			});
		});
	}

	for (const outcome of ['setupFailure', 'forwardFailure', 'superseded', 'noSession', 'providerUnavailable', 'noPreviousCredential', 'deduplicated'] as const) {
		test(`reports sign-in ${outcome} without hiding errors or claiming authentication success`, async () => {
			const telemetry = new TestAuthTelemetryService();
			let signedIn = false;
			let current = true;
			const failure = new Error('Private error with private-token');
			const commandService = new TestCommandService();
			if (outcome === 'setupFailure') {
				commandService.result = { success: false, error: failure };
			}
			commandService.onExecute = () => {
				signedIn = true;
				current = outcome !== 'superseded';
			};
			const authService = createMockAuthService({
				getOrActivateProviderIdForServer: async () => 'private-provider-id',
				getSessions: async (_providerId, scopes) => {
					if (signedIn && outcome === 'providerUnavailable') {
						throw failure;
					}
					return signedIn && outcome !== 'noSession' && !scopes ? [broaderSession] : [];
				},
			});
			const instantiationService = createAuthInstantiationService(disposables, authService, commandService);
			instantiationService.stub(ITelemetryService, telemetry);
			const operation = instantiationService.invokeFunction(resolveAuthenticationInteractively, [resource], {
				logPrefix: '[AgentHost]',
				isCurrent: () => current,
				authTokenCache: outcome === 'deduplicated' ? new class extends AgentHostAuthTokenCache {
					override async authenticate(): Promise<boolean> { return false; }
				}() : undefined,
				authenticate: async () => {
					if (outcome === 'forwardFailure') {
						throw failure;
					}
				},
			});

			if (outcome === 'setupFailure' || outcome === 'forwardFailure') {
				await assert.rejects(operation, error => error === failure);
			} else if (outcome === 'superseded') {
				await assert.rejects(operation, isCancellationError);
			} else {
				assert.strictEqual(await operation, outcome === 'noPreviousCredential');
			}
			const expectedResult = outcome === 'noPreviousCredential' ? 'tokenForwarded'
				: outcome === 'noSession' || outcome === 'providerUnavailable' ? 'noSessionResolved'
					: outcome === 'superseded' || outcome === 'deduplicated' ? outcome : 'failed';
			const expectedMatch = outcome === 'noSession' ? 'none'
				: outcome === 'providerUnavailable' ? 'unavailable'
					: outcome === 'forwardFailure' || outcome === 'noPreviousCredential' || outcome === 'deduplicated' ? 'superset' : undefined;
			assert.deepStrictEqual(telemetry.events, [
				{ name: 'agentHost.authRecovery', data: { trigger: 'sessionCreation', action: 'prompt', initialSessionMatch: 'none', quarantinePresent: false, windowAgeMs: '<duration>' } },
				{ name: 'agentHost.authSignInResult', data: { trigger: 'sessionCreation', result: expectedResult, credentialChanged: undefined, sessionMatch: expectedMatch, durationMs: '<duration>' } },
			]);
		});
	}
});

suite('autoAuthenticateMcpServer', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('reuses remembered server access silently and pushes tokens only when allowed', async () => {
		const results: {
			authenticated: boolean;
			serverIds: string[];
			sessionRequests: { scopes: readonly string[] | undefined; silent: boolean | undefined }[];
			authenticateRequests: { resource: string; scopes?: readonly string[]; token: string }[];
		}[] = [];
		for (const allowed of [true, false]) {
			const serverIds: string[] = [];
			const sessionRequests: { scopes: readonly string[] | undefined; silent: boolean | undefined }[] = [];
			const authenticateRequests: { resource: string; scopes?: readonly string[]; token: string }[] = [];
			const instantiationService = disposables.add(new TestInstantiationService());
			instantiationService.stub(IAuthenticationService, createMockAuthService({
				isDynamicAuthenticationProvider: () => true,
				getSessions: async (_providerId, scopes, options) => {
					sessionRequests.push({ scopes, silent: options.silent });
					return [{
						id: 'docs-session', scopes: ['read'], accessToken: 'docs-token',
						account: { id: 'account-id', label: 'Docs Account' },
					}];
				},
			}));
			instantiationService.stub(IAuthenticationMcpAccessService, {
				isAccessAllowedForUrl: (_providerId, _accountName, serverId) => {
					serverIds.push(serverId);
					return allowed;
				},
			});
			instantiationService.stub(IAuthenticationMcpService, { getAccountPreference: () => undefined });
			instantiationService.stub(IAuthenticationMcpUsageService, { addAccountUsage: () => { } });
			instantiationService.stub(IDynamicAuthenticationProviderStorageService, {
				getClientRegistration: async () => ({ clientId: 'docs-client' }),
			});
			instantiationService.stub(ILogService, new NullLogService());
			instantiationService.stub(ILabelService, { getHostLabel: () => 'Host' });
			const connection = new class extends mock<IAgentConnection>() {
				override async authenticate(request: { resource: string; scopes?: readonly string[]; token: string }) {
					authenticateRequests.push(request);
					return { authenticated: true };
				}
			}();
			const authenticated = await instantiationService.invokeFunction(autoAuthenticateMcpServer,
				connection, { scheme: 'vscode-agent-host', authority: '' }, 'Docs', {
				resource: {
					resource: 'https://docs.example/mcp',
					authorization_servers: ['https://issuer.example'],
					scopes_supported: ['read', 'write'],
				},
				oauthClient: { clientId: 'docs-client' },
				requiredScopes: ['read'],
			});
			results.push({ authenticated, serverIds, sessionRequests, authenticateRequests });
		}
		assert.deepStrictEqual(results, [true, false].map(allowed => ({
			authenticated: allowed,
			serverIds: [agentHostMcpServerId('', 'Docs', 'https://docs.example/mcp')],
			sessionRequests: [{ scopes: ['read'], silent: true }],
			authenticateRequests: allowed ? [{ resource: 'https://docs.example/mcp', scopes: ['read'], token: 'docs-token' }] : [],
		})));
	});
});

suite('resolveMcpServerAuthentication', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('preserves OAuth context when selecting an account', async () => {
		const authorizationServer = URI.parse('https://issuer.example/tenant');
		const resource = 'https://resource.example/mcp';
		const oauthClient = { clientId: 'client-a', clientSecret: 'client-secret' };
		const session: AuthenticationSession = {
			id: 'session', accessToken: 'token', account: { id: 'account', label: 'Account' }, scopes: ['read']
		};
		const selections: (IAuthenticationProviderSessionOptions | undefined)[] = [];
		const authService = createMockAuthService({
			isDynamicAuthenticationProvider: () => true,
			getSessions: async () => [session],
			getProvider: () => new class extends mock<IAuthenticationProvider>() {
				override readonly supportsMultipleAccounts = true;
			}(),
		});
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IAuthenticationService, authService);
		instantiationService.stub(IAuthenticationMcpAccessService, {
			isAccessAllowedForUrl: () => false,
			updateAllowedMcpServers: () => { },
		});
		instantiationService.stub(IAuthenticationMcpService, {
			getAccountPreference: () => undefined,
			updateAccountPreference: () => { },
			selectSession: async (_providerId, _serverId, _serverName, _scopes, _sessions, options) => {
				selections.push(options);
				return session;
			},
		});
		instantiationService.stub(IAuthenticationMcpUsageService, { addAccountUsage: () => { } });
		instantiationService.stub(IDynamicAuthenticationProviderStorageService, {
			getClientRegistration: async () => oauthClient,
		});
		instantiationService.stub(ILogService, new NullLogService());

		const authenticated = await instantiationService.invokeFunction(resolveMcpServerAuthentication, {
			resource,
			authorization_servers: [authorizationServer.toString(true)],
		}, {
			allowInteraction: true,
			logPrefix: '[Test]',
			mcpServerId: 'server',
			mcpServerName: 'Server',
			mcpServerUrl: resource,
			oauthClient,
			scopes: ['read'],
			authenticate: async () => { },
		});

		assert.deepStrictEqual({ authenticated, selections }, {
			authenticated: true,
			selections: [{ authorizationServer, resource, ...oauthClient }]
		});
	});

	test('uses challenge scopes without replacing the protected resource scope catalog', async () => {
		const requestedScopes: (readonly string[] | undefined)[] = [];
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
			getSessions: (_providerId, scopes) => {
				requestedScopes.push(scopes);
				return Promise.resolve([]);
			},
		});
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IAuthenticationService, authService);
		instantiationService.stub(IAuthenticationMcpAccessService, {});
		instantiationService.stub(IAuthenticationMcpService, {
			getAccountPreference: () => undefined,
		});
		instantiationService.stub(IAuthenticationMcpUsageService, {});
		instantiationService.stub(IDynamicAuthenticationProviderStorageService, {});
		instantiationService.stub(ILogService, new NullLogService());

		const result = await instantiationService.invokeFunction(resolveMcpServerAuthentication, {
			resource: 'https://mcp.example.com',
			authorization_servers: ['https://auth.example.com'],
			scopes_supported: ['repo', 'read:org', 'notifications'],
		}, {
			allowInteraction: false,
			logPrefix: '[AgentHost]',
			mcpServerId: 'server-id',
			mcpServerName: 'Example',
			mcpServerUrl: 'https://mcp.example.com',
			scopes: ['notifications'],
			authenticate: async () => { },
		});

		assert.deepStrictEqual({ result, requestedScopes }, {
			result: false,
			requestedScopes: [['notifications']],
		});
	});

	test('uses supported scopes when the challenge does not specify scopes', async () => {
		const requestedScopes: (readonly string[])[] = [];
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
			getSessions: (_providerId, scopes) => {
				requestedScopes.push(scopes ?? []);
				return Promise.resolve([]);
			},
		});
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IAuthenticationService, authService);
		instantiationService.stub(IAuthenticationMcpAccessService, {});
		instantiationService.stub(IAuthenticationMcpService, {
			getAccountPreference: () => undefined,
		});
		instantiationService.stub(IAuthenticationMcpUsageService, {});
		instantiationService.stub(IDynamicAuthenticationProviderStorageService, {});
		instantiationService.stub(ILogService, new NullLogService());

		const result = await instantiationService.invokeFunction(resolveMcpServerAuthentication, {
			resource: 'https://mcp.slack.com',
			resource_name: 'Slack API',
			authorization_servers: ['https://mcp.slack.com'],
			scopes_supported: ['search:read.public', 'chat:write'],
		}, {
			allowInteraction: false,
			logPrefix: '[AgentHost]',
			mcpServerId: 'slack',
			mcpServerName: 'Slack',
			mcpServerUrl: 'https://mcp.slack.com',
			scopes: [],
			authenticate: async () => { },
		});

		assert.deepStrictEqual({ result, requestedScopes }, {
			result: false,
			requestedScopes: [['search:read.public', 'chat:write']],
		});
	});

	test('does not eagerly request GitHub MCP supported scopes', async () => {
		const requestedScopes: (readonly string[])[] = [];
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
			getSessions: (_providerId, scopes) => {
				requestedScopes.push(scopes ?? []);
				return Promise.resolve([]);
			},
		});
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IAuthenticationService, authService);
		instantiationService.stub(IAuthenticationMcpAccessService, {});
		instantiationService.stub(IAuthenticationMcpService, {
			getAccountPreference: () => undefined,
		});
		instantiationService.stub(IAuthenticationMcpUsageService, {});
		instantiationService.stub(IDynamicAuthenticationProviderStorageService, {});
		instantiationService.stub(ILogService, new NullLogService());

		const result = await instantiationService.invokeFunction(resolveMcpServerAuthentication, {
			resource: 'https://api.githubcopilot.com/mcp',
			resource_name: 'GitHub MCP Server',
			authorization_servers: ['https://github.com/login/oauth'],
			scopes_supported: ['repo', 'notifications'],
		}, {
			allowInteraction: false,
			logPrefix: '[AgentHost]',
			mcpServerId: 'github',
			mcpServerName: 'GitHub',
			mcpServerUrl: 'https://api.githubcopilot.com/mcp',
			scopes: [],
			authenticate: async () => { },
		});

		assert.deepStrictEqual({ result, requestedScopes }, {
			result: false,
			requestedScopes: [[]],
		});
	});

	test('does not create a dynamic provider silently without a persisted registration', async () => {
		const warnings: string[] = [];
		const providerCreations: string[] = [];
		const metadataRequests: string[] = [];
		const logService = new class extends NullLogService {
			override warn(message: string): void {
				warnings.push(message);
			}
		}();
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IAuthenticationService, createMockAuthService({
			createDynamicAuthenticationProvider: async authorizationServer => {
				providerCreations.push(authorizationServer.toString(true));
				return undefined;
			},
		}));
		instantiationService.stub(IAuthenticationMcpAccessService, {});
		instantiationService.stub(IAuthenticationMcpService, {
			getAccountPreference: () => undefined,
		});
		instantiationService.stub(IAuthenticationMcpUsageService, {});
		instantiationService.stub(IDynamicAuthenticationProviderStorageService, {
			getClientRegistration: () => Promise.resolve(undefined),
		});
		instantiationService.stub(ILogService, logService);

		const result = await instantiationService.invokeFunction(resolveMcpServerAuthentication, {
			resource: 'https://mcp.example.com',
			authorization_servers: ['https://auth.example.com'],
		}, {
			allowInteraction: false,
			logPrefix: '[AgentHost]',
			mcpServerId: 'server-id',
			mcpServerName: 'Example',
			mcpServerUrl: 'https://mcp.example.com',
			scopes: [],
			authorizationServerMetadataFetcher: async authorizationServer => {
				metadataRequests.push(authorizationServer);
				throw new Error('Unexpected metadata request');
			},
			authenticate: async () => { },
		});

		assert.deepStrictEqual({ result, warnings, metadataRequests, providerCreations }, {
			result: false,
			warnings: [],
			metadataRequests: [],
			providerCreations: [],
		});
	});

	test('restores a persisted dynamically registered provider without user interaction', async () => {
		const dynamicProviderId = 'https://mcp.notion.com/ https://mcp.notion.com/mcp';
		const providerCreations: { clientId: string | undefined; clientSecret: string | undefined }[] = [];
		const sessionRequests: { silent: boolean | undefined }[] = [];
		const authenticateRequests: { resource: string; scopes?: readonly string[]; token: string }[] = [];
		const authService = createMockAuthService({
			createDynamicAuthenticationProvider: async (_authorizationServer, _metadata, _resource, clientId, clientSecret) => {
				providerCreations.push({ clientId, clientSecret });
				return { id: dynamicProviderId };
			},
			getSessions: (_providerId, _scopes, options) => {
				sessionRequests.push({ silent: options.silent });
				return Promise.resolve([{
					id: 'notion-session',
					scopes: [],
					accessToken: 'notion-token',
					account: { id: 'account-id', label: 'Notion Account' },
				}]);
			},
		});
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IAuthenticationService, authService);
		instantiationService.stub(IAuthenticationMcpAccessService, {
			isAccessAllowedForUrl: () => true,
		});
		instantiationService.stub(IAuthenticationMcpService, {
			getAccountPreference: () => 'Notion Account',
		});
		instantiationService.stub(IAuthenticationMcpUsageService, {
			addAccountUsage: () => { },
		});
		instantiationService.stub(IDynamicAuthenticationProviderStorageService, {
			getClientRegistration: () => Promise.resolve({ clientId: 'notion-client-id', clientSecret: 'notion-client-secret' }),
		});
		instantiationService.stub(ILogService, new NullLogService());

		const result = await instantiationService.invokeFunction(resolveMcpServerAuthentication, {
			resource: 'https://mcp.notion.com/mcp',
			authorization_servers: ['https://mcp.notion.com'],
		}, {
			allowInteraction: false,
			logPrefix: '[AgentHost]',
			mcpServerId: 'notion',
			mcpServerName: 'notion',
			mcpServerUrl: 'https://mcp.notion.com/mcp',
			scopes: [],
			authorizationServerMetadataFetcher: async authorizationServer => ({
				metadata: {
					issuer: authorizationServer,
					response_types_supported: ['code'],
				},
				discoveryUrl: `${authorizationServer}/.well-known/oauth-authorization-server`,
				errors: [],
			}),
			authenticate: async request => {
				authenticateRequests.push(request);
			},
		});

		assert.deepStrictEqual({ result, providerCreations, sessionRequests, authenticateRequests }, {
			result: true,
			providerCreations: [{ clientId: 'notion-client-id', clientSecret: 'notion-client-secret' }],
			sessionRequests: [{ silent: true }],
			authenticateRequests: [{
				resource: 'https://mcp.notion.com/mcp',
				scopes: [],
				token: 'notion-token',
			}],
		});
	});

	test('serializes authentication transactions for different configured clients', async () => {
		const dynamicProviderId = 'https://mcp.example.com/ https://mcp.example.com/resource';
		const firstSessionStarted = new DeferredPromise<void>();
		const firstSessionGate = new DeferredPromise<void>();
		const providerCreations: string[] = [];
		const sessionRequests: string[] = [];
		const authenticateRequests: string[] = [];
		let activeClient: string | undefined;
		let providerActive = false;
		const authService = createMockAuthService({
			isDynamicAuthenticationProvider: providerId => providerId === dynamicProviderId && providerActive,
			createDynamicAuthenticationProvider: async (_authorizationServer, _metadata, _resource, clientId) => {
				activeClient = clientId;
				providerActive = true;
				providerCreations.push(clientId ?? '');
				return { id: dynamicProviderId };
			},
			unregisterAuthenticationProvider: () => {
				providerActive = false;
			},
			getSessions: async () => {
				const clientId = activeClient ?? '';
				sessionRequests.push(clientId);
				if (clientId === 'first-client') {
					firstSessionStarted.complete();
					await firstSessionGate.p;
				}
				return [{
					id: `${clientId}-session`,
					scopes: [],
					accessToken: `${clientId}-token`,
					account: { id: 'account-id', label: 'MCP Account' },
				}];
			},
		});
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IAuthenticationService, authService);
		instantiationService.stub(IAuthenticationMcpAccessService, {
			isAccessAllowedForUrl: () => true,
		});
		instantiationService.stub(IAuthenticationMcpService, {
			getAccountPreference: () => 'MCP Account',
		});
		instantiationService.stub(IAuthenticationMcpUsageService, {
			addAccountUsage: () => { },
		});
		instantiationService.stub(IDynamicAuthenticationProviderStorageService, {
			getClientRegistration: () => Promise.resolve(activeClient ? { clientId: activeClient } : undefined),
			removeDynamicProvider: async () => {
				activeClient = undefined;
			},
		});
		instantiationService.stub(ILogService, new NullLogService());
		const protectedResource = {
			resource: 'https://mcp.example.com/resource',
			authorization_servers: ['https://mcp.example.com'],
		};
		const options = (clientId: string) => ({
			allowInteraction: true,
			logPrefix: '[AgentHost]',
			mcpServerId: 'example',
			mcpServerName: 'Example',
			mcpServerUrl: 'https://mcp.example.com/resource',
			oauthClient: { clientId },
			scopes: [],
			authorizationServerMetadataFetcher: async (authorizationServer: string) => ({
				metadata: {
					issuer: authorizationServer,
					response_types_supported: ['code'],
				},
				discoveryUrl: `${authorizationServer}/.well-known/oauth-authorization-server`,
				errors: [],
			}),
			authenticate: async (request: { token: string }) => {
				authenticateRequests.push(request.token);
			},
		});

		const first = instantiationService.invokeFunction(resolveMcpServerAuthentication, protectedResource, options('first-client'));
		const second = instantiationService.invokeFunction(resolveMcpServerAuthentication, protectedResource, options('second-client'));
		await firstSessionStarted.p;
		const beforeResolution = {
			providerCreations: [...providerCreations],
			sessionRequests: [...sessionRequests],
		};
		firstSessionGate.complete();
		const results = await Promise.all([first, second]);

		assert.deepStrictEqual({
			beforeResolution,
			results,
			providerCreations,
			sessionRequests,
			authenticateRequests,
		}, {
			beforeResolution: {
				providerCreations: ['first-client'],
				sessionRequests: ['first-client'],
			},
			results: [true, true],
			providerCreations: ['first-client', 'second-client'],
			sessionRequests: ['first-client', 'second-client'],
			authenticateRequests: ['first-client-token', 'second-client-token'],
		});
	});

	test('restores a persisted configured provider without user interaction', async () => {
		const dynamicProviderId = 'https://mcp.slack.com/ https://mcp.slack.com';
		const providerCreations: string[] = [];
		const authenticateRequests: { resource: string; scopes?: readonly string[]; token: string }[] = [];
		let isProviderActive = false;
		const authService = createMockAuthService({
			isDynamicAuthenticationProvider: providerId => providerId === dynamicProviderId && isProviderActive,
			createDynamicAuthenticationProvider: async (_authorizationServer, _metadata, _resource, clientId) => {
				providerCreations.push(clientId ?? '');
				isProviderActive = true;
				return { id: dynamicProviderId };
			},
			getSessions: () => Promise.resolve([{
				id: 'slack-session',
				scopes: ['search:read.public'],
				accessToken: 'slack-token',
				account: { id: 'account-id', label: 'Slack Account' },
			}]),
		});
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IAuthenticationService, authService);
		instantiationService.stub(IAuthenticationMcpAccessService, {
			isAccessAllowedForUrl: () => true,
		});
		instantiationService.stub(IAuthenticationMcpService, {
			getAccountPreference: () => 'Slack Account',
		});
		instantiationService.stub(IAuthenticationMcpUsageService, {
			addAccountUsage: () => { },
		});
		instantiationService.stub(IDynamicAuthenticationProviderStorageService, {
			getClientRegistration: () => Promise.resolve({ clientId: 'slack-client-id' }),
		});
		instantiationService.stub(ILogService, new NullLogService());

		const result = await instantiationService.invokeFunction(resolveMcpServerAuthentication, {
			resource: 'https://mcp.slack.com',
			authorization_servers: ['https://mcp.slack.com'],
			scopes_supported: ['search:read.public'],
		}, {
			allowInteraction: false,
			logPrefix: '[AgentHost]',
			mcpServerId: 'slack',
			mcpServerName: 'Slack',
			mcpServerUrl: 'https://mcp.slack.com',
			oauthClient: { clientId: 'slack-client-id' },
			scopes: [],
			authorizationServerMetadataFetcher: async authorizationServer => ({
				metadata: {
					issuer: authorizationServer,
					response_types_supported: ['code'],
				},
				discoveryUrl: `${authorizationServer}/.well-known/oauth-authorization-server`,
				errors: [],
			}),
			authenticate: async request => {
				authenticateRequests.push(request);
			},
		});

		assert.deepStrictEqual({ result, providerCreations, authenticateRequests }, {
			result: true,
			providerCreations: ['slack-client-id'],
			authenticateRequests: [{
				resource: 'https://mcp.slack.com',
				scopes: ['search:read.public'],
				token: 'slack-token',
			}],
		});
	});

	test('uses configured public and confidential clients when creating a dynamic provider', async () => {
		const dynamicProviderId = 'https://mcp.slack.com/ https://mcp.slack.com';
		const providerCreations: { authorizationServer: string; resource: string | undefined; clientId: string | undefined; clientSecret: string | undefined }[] = [];
		const sessionRequests: { clientId: string | undefined; clientSecret: string | undefined }[] = [];
		const sessionCreations: { clientId: string | undefined; clientSecret: string | undefined }[] = [];
		const authenticateRequests: { resource: string; scopes?: readonly string[]; token: string }[] = [];
		const removedProviders: string[] = [];
		let registeredClient: { clientId?: string; clientSecret?: string } | undefined;
		let getSessionsCall = 0;
		const provider: IAuthenticationProvider = {
			id: dynamicProviderId,
			label: 'Slack',
			supportsMultipleAccounts: false,
			onDidChangeSessions: Event.None,
			getSessions: () => Promise.reject(new Error('Unexpected provider getSessions call')),
			createSession: () => Promise.reject(new Error('Unexpected provider createSession call')),
			removeSession: () => Promise.reject(new Error('Unexpected provider removeSession call')),
		};
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.reject(new Error('Configured clients must not use a built-in provider')),
			getSessions: (_providerId, _scopes, options) => {
				sessionRequests.push({ clientId: options.clientId, clientSecret: options.clientSecret });
				getSessionsCall++;
				return Promise.resolve(getSessionsCall === 1 ? [{
					scopes: ['search:read.public'],
					accessToken: 'public-token',
					account: { id: 'account-id', label: 'Slack Account' },
				}] : []);
			},
			createSession: (_providerId, _scopes, options) => {
				sessionCreations.push({ clientId: options.clientId, clientSecret: options.clientSecret });
				return Promise.resolve({
					id: 'confidential-session',
					accessToken: 'confidential-token',
					account: { id: 'account-id', label: 'Slack Account' },
					scopes: ['search:read.public'],
				});
			},
			createDynamicAuthenticationProvider: async (authorizationServer, _metadata, resource, clientId, clientSecret) => {
				providerCreations.push({
					authorizationServer: authorizationServer.toString(true),
					resource: resource?.resource,
					clientId,
					clientSecret,
				});
				registeredClient = { clientId, clientSecret };
				return { id: dynamicProviderId };
			},
			getProvider: () => provider,
			isDynamicAuthenticationProvider: providerId => providerId === dynamicProviderId && registeredClient !== undefined,
			unregisterAuthenticationProvider: providerId => {
				removedProviders.push(providerId);
				registeredClient = undefined;
			},
		});
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IAuthenticationService, authService);
		instantiationService.stub(IAuthenticationMcpAccessService, {
			isAccessAllowedForUrl: () => true,
			updateAllowedMcpServers: () => { },
		});
		instantiationService.stub(IAuthenticationMcpService, {
			getAccountPreference: () => 'Slack Account',
			updateAccountPreference: () => { },
		});
		instantiationService.stub(IAuthenticationMcpUsageService, {
			addAccountUsage: () => { },
		});
		instantiationService.stub(IDynamicAuthenticationProviderStorageService, {
			getClientRegistration: () => Promise.resolve(registeredClient),
			removeDynamicProvider: async providerId => {
				removedProviders.push(providerId);
			},
		});
		instantiationService.stub(ILogService, new NullLogService());

		const results: boolean[] = [];
		for (const oauthClient of [
			{ clientId: 'public-client-id' },
			{ clientId: 'confidential-client-id', clientSecret: 'confidential-client-secret' },
		]) {
			results.push(await instantiationService.invokeFunction(resolveMcpServerAuthentication, {
				resource: 'https://mcp.slack.com',
				authorization_servers: ['https://mcp.slack.com'],
				scopes_supported: ['search:read.public'],
			}, {
				allowInteraction: true,
				logPrefix: '[AgentHost]',
				mcpServerId: 'slack',
				mcpServerName: 'Slack',
				mcpServerUrl: 'https://mcp.slack.com',
				oauthClient,
				scopes: ['search:read.public'],
				authorizationServerMetadataFetcher: async authorizationServer => ({
					metadata: {
						issuer: authorizationServer,
						response_types_supported: ['code'],
					},
					discoveryUrl: `${authorizationServer}/.well-known/oauth-authorization-server`,
					errors: [],
				}),
				authenticate: async request => {
					authenticateRequests.push(request);
				},
			}));
		}

		assert.deepStrictEqual({
			results,
			providerCreations,
			sessionRequests,
			sessionCreations,
			authenticateRequests,
			removedProviders,
		}, {
			results: [true, true],
			providerCreations: [
				{
					authorizationServer: 'https://mcp.slack.com/',
					resource: 'https://mcp.slack.com',
					clientId: 'public-client-id',
					clientSecret: undefined,
				},
				{
					authorizationServer: 'https://mcp.slack.com/',
					resource: 'https://mcp.slack.com',
					clientId: 'confidential-client-id',
					clientSecret: 'confidential-client-secret',
				},
			],
			sessionRequests: [
				{ clientId: 'public-client-id', clientSecret: undefined },
				{ clientId: 'confidential-client-id', clientSecret: 'confidential-client-secret' },
			],
			sessionCreations: [
				{ clientId: 'confidential-client-id', clientSecret: 'confidential-client-secret' },
			],
			authenticateRequests: [
				{
					resource: 'https://mcp.slack.com',
					scopes: ['search:read.public'],
					token: 'public-token',
				},
				{
					resource: 'https://mcp.slack.com',
					scopes: ['search:read.public'],
					token: 'confidential-token',
				},
			],
			removedProviders: [dynamicProviderId, dynamicProviderId],
		});
	});
});

suite('modelRequiresAgentAuthentication', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const requiredResource: ProtectedResourceMetadata = { resource: 'https://api.github.com', required: true };
	const byokModel = {
		id: 'gemini/gemini-2.5-pro',
		_meta: createAgentModelByokMeta('gemini/Gemini/gemini-2.5-pro'),
	};
	const copilotModel = { id: 'gpt-5' };
	const agent = {
		models: [byokModel, copilotModel],
		protectedResources: [requiredResource],
	} as AgentInfo;

	test('bypasses required agent auth only for an advertised BYOK model', () => {
		const optionalResourceAgent = { ...agent, protectedResources: [{ ...requiredResource, required: false }] };
		const optionalResourceAgentWithoutByok = { ...optionalResourceAgent, models: [copilotModel] } as AgentInfo;
		assert.deepStrictEqual({
			byokEnabled: modelRequiresAgentAuthentication(agent, { id: byokModel.id }, true),
			byokDisabled: modelRequiresAgentAuthentication(agent, { id: byokModel.id }, false),
			copilot: modelRequiresAgentAuthentication(agent, { id: copilotModel.id }, true),
			unknown: modelRequiresAgentAuthentication(agent, { id: 'unknown' }, true),
			noSelection: modelRequiresAgentAuthentication(agent, undefined, true),
			optionalResourceByok: modelRequiresAgentAuthentication(optionalResourceAgent, { id: byokModel.id }, true),
			optionalResourceCopilot: modelRequiresAgentAuthentication(optionalResourceAgent, { id: copilotModel.id }, true),
			optionalResourceUnknown: modelRequiresAgentAuthentication(optionalResourceAgent, { id: 'unknown' }, true),
			optionalResourceSignedOutDisabled: modelRequiresAgentAuthentication(optionalResourceAgent, { id: copilotModel.id }, false),
			optionalResourceWithoutByok: modelRequiresAgentAuthentication(optionalResourceAgentWithoutByok, { id: copilotModel.id }, true),
			noProtectedResource: modelRequiresAgentAuthentication({ ...agent, protectedResources: [] }, { id: copilotModel.id }, true),
		}, {
			byokEnabled: false,
			byokDisabled: true,
			copilot: true,
			unknown: true,
			noSelection: true,
			optionalResourceByok: false,
			optionalResourceCopilot: true,
			optionalResourceUnknown: true,
			optionalResourceSignedOutDisabled: false,
			optionalResourceWithoutByok: false,
			noProtectedResource: false,
		});
	});

	test('requires only the selected native model provider instead of both Microsoft audiences', () => {
		const mixedAgent = {
			...agent,
			models: [
				{ id: 'capi-gpt-5', _meta: nativeCopilotModelProviderMeta('copilot') },
				{ id: 'loki-gpt-5', _meta: nativeCopilotModelProviderMeta('loki:corporate-account') },
			],
			protectedResources: [NATIVE_LOKI_PROTECTED_RESOURCE, NATIVE_EMU_PROTECTED_RESOURCE],
		} as AgentInfo;
		assert.deepStrictEqual({
			capi: modelRequiresAgentAuthentication(mixedAgent, { id: 'capi-gpt-5' }),
			loki: modelRequiresAgentAuthentication(mixedAgent, { id: 'loki-gpt-5' }),
			unknown: modelRequiresAgentAuthentication(mixedAgent, { id: 'missing-model' }),
			noSelection: modelRequiresAgentAuthentication(mixedAgent, undefined),
		}, {
			capi: false,
			loki: true,
			unknown: true,
			noSelection: true,
		});
	});
});

suite('authenticateProtectedResources', () => {

	const protectedResource: ProtectedResourceMetadata = {
		resource: 'https://api.example.com',
		authorization_servers: ['https://auth.example.com'],
		scopes_supported: ['read'],
	};

	const removedSession = (scopes: readonly string[]): AuthenticationSession => ({
		id: `session-${scopes.join('-')}`,
		accessToken: 'removed-token',
		account: { id: 'account-1', label: 'Account' },
		scopes,
	});

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('forwards selected account provenance without changing the host resource', async () => {
		const resource = { ...protectedResource, resource: 'https://other-host.example/custom/repository-resource' };
		const account = { id: 'provider-account', label: 'Private account label' };
		const authentication = createMockAuthService({
			getOrActivateProviderIdForServer: async () => 'provider',
			getSessions: async () => [{ id: 'session', scopes: ['read'], accessToken: 'token', account }],
		});
		const instantiation = createAuthInstantiationService(disposables, authentication);
		const agents = [new class extends mock<AgentInfo>() { override readonly protectedResources = [resource]; }()];
		const requests: { resource: string; account: ReturnType<typeof readAuthenticationAccount>; metadata: Record<string, unknown> | undefined }[] = [];
		await instantiation.invokeFunction(authenticateProtectedResources, agents, {
			logPrefix: '[AgentHost]',
			authenticate: async request => {
				requests.push({ resource: request.resource, account: readAuthenticationAccount(request), metadata: request._meta });
			},
		});
		assert.deepStrictEqual(requests, [{
			resource: resource.resource,
			account: { providerId: 'provider', accountId: 'provider-account' },
			metadata: { 'vscode.authentication.account': { providerId: 'provider', accountId: 'provider-account' } },
		}]);
	});

	for (const enabled of [undefined, false, true]) {
		test(`connector-scoped authentication preference is experiment gated: ${enabled}`, async () => {
			const account = { id: 'active-account', label: 'Active' };
			const scopes = ['read:user', 'user:email'];
			const current: AuthenticationSession = { id: 'current', accessToken: 'current-token', account, scopes };
			const authorized: AuthenticationSession = {
				id: 'authorized', accessToken: 'authorized-token', account, scopes: [...scopes, 'write:plugin_gateway_connections'],
			};
			const lookups: { scopes: string[] | undefined; accountId: string | undefined; silent: boolean | undefined }[] = [];
			const authService = createMockAuthService({
				getOrActivateProviderIdForServer: async () => 'github',
				getSessions: async (_providerId, requested, options: IAuthenticationProviderSessionOptions) => {
					lookups.push({ scopes: requested, accountId: options.account?.id, silent: options.silent });
					return requested ? [current] : [
						{ ...authorized, id: 'another-account', accessToken: 'another-token', account: { id: 'other', label: 'Other' } },
						{ ...authorized, id: 'broader', accessToken: 'broader-token', scopes: [...authorized.scopes, 'repo'] },
						authorized,
						current,
					];
				},
			});
			const commandService = new TestCommandService();
			const instantiationService = createAuthInstantiationService(disposables, authService, commandService);
			instantiationService.stub(IConfigurationService, new TestConfigurationService({
				[CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled]: enabled,
			}));
			const agents = [new class extends mock<AgentInfo>() {
				override readonly protectedResources = [{ resource: 'https://api.github.com', authorization_servers: ['https://github.com/login/oauth'], scopes_supported: scopes }];
			}()];
			const tokens: string[] = [];
			await instantiationService.invokeFunction(authenticateProtectedResources, agents, {
				logPrefix: '[AgentHost]',
				authenticate: async request => { tokens.push(request.token); },
			});
			assert.deepStrictEqual({ tokens, lookups, prompts: commandService.calls }, {
				tokens: [enabled ? 'authorized-token' : 'current-token'],
				lookups: [
					{ scopes, accountId: undefined, silent: undefined },
					...(enabled ? [{ scopes: undefined, accountId: account.id, silent: true }] : []),
				],
				prompts: [],
			});
		});
	}

	test('a connector authorization upgrade replaces the token forwarded to a running agent host', async () => {
		const account = { id: 'active-account', label: 'Active' };
		const scopes = ['read:user', 'user:email'];
		const current: AuthenticationSession = { id: 'current', accessToken: 'current-token', account, scopes };
		const authorized: AuthenticationSession = {
			id: 'authorized', accessToken: 'authorized-token', account, scopes: [...scopes, 'write:plugin_gateway_connections'],
		};
		let sessions: readonly AuthenticationSession[] = [current];
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: async () => 'github',
			getSessions: async (_providerId, requested) => requested ? [current] : sessions,
		});
		const instantiationService = createAuthInstantiationService(disposables, authService);
		instantiationService.stub(IConfigurationService, new TestConfigurationService({
			[CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled]: true,
		}));
		const agents = [new class extends mock<AgentInfo>() {
			override readonly protectedResources = [{ resource: 'https://api.github.com', authorization_servers: ['https://github.com/login/oauth'], scopes_supported: scopes }];
		}()];
		const tokens: string[] = [];
		const options: IAgentHostAuthenticationOptions = {
			authTokenCache: new AgentHostAuthTokenCache(),
			logPrefix: '[AgentHost]',
			authenticate: async request => { tokens.push(request.token); },
		};
		await instantiationService.invokeFunction(authenticateProtectedResources, agents, options);
		sessions = [current, authorized];
		await instantiationService.invokeFunction(authenticateProtectedResources, agents, options);
		await instantiationService.invokeFunction(authenticateProtectedResources, agents, options);
		assert.deepStrictEqual(tokens, ['current-token', 'authorized-token']);
	});

	for (const alternative of ['other-account', 'missing-base-scope', 'rejected', 'lookup-failed']) {
		test(`connector preference retains usable Copilot authentication for ${alternative}`, async () => {
			const account = { id: 'active-account', label: 'Active' };
			const scopes = ['read:user', 'user:email'];
			const current: AuthenticationSession = { id: 'current', accessToken: 'current-token', account, scopes };
			const authorized: AuthenticationSession = {
				id: 'authorized', accessToken: 'authorized-token',
				account: alternative === 'other-account' ? { id: 'other', label: 'Other' } : account,
				scopes: [...(alternative === 'missing-base-scope' ? [] : scopes), 'write:plugin_gateway_connections'],
			};
			const authService = createMockAuthService({
				getOrActivateProviderIdForServer: async () => 'github',
				getSessions: async (_providerId, requested) => {
					if (!requested && alternative === 'lookup-failed') {
						throw new Error('Provider unavailable');
					}
					return requested ? [current] : [current, authorized];
				},
			});
			const commandService = new TestCommandService();
			const instantiationService = createAuthInstantiationService(disposables, authService, commandService);
			instantiationService.stub(IConfigurationService, new TestConfigurationService({
				[CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled]: true,
			}));
			const resource = { resource: 'https://api.github.com', authorization_servers: ['https://github.com/login/oauth'], scopes_supported: scopes };
			const agents = [new class extends mock<AgentInfo>() { override readonly protectedResources = [resource]; }()];
			const cache = new AgentHostAuthTokenCache();
			if (alternative === 'rejected') {
				cache.rejectSession(resource.resource, scopes, authorized);
			}
			const tokens: string[] = [];
			await instantiationService.invokeFunction(authenticateProtectedResources, agents, {
				authTokenCache: cache, logPrefix: '[AgentHost]',
				authenticate: async request => { tokens.push(request.token); },
			});
			assert.deepStrictEqual({ tokens, prompts: commandService.calls }, { tokens: ['current-token'], prompts: [] });
		});
	}

	test('skips authenticate when the cached token is unchanged', async () => {
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
			getSessions: (_providerId, scopes) => {
				if (scopes) {
					return Promise.resolve([{ scopes: ['read'], accessToken: 'cached-token', expiresAfter: 3_600_000 }]);
				}

				return Promise.resolve([]);
			},
		});
		const cache = new AgentHostAuthTokenCache();
		const requests: { resource: string; scopes?: readonly string[]; token: string; expiresIn?: number }[] = [];
		const agents = [{ protectedResources: [protectedResource] }] as unknown as readonly AgentInfo[];
		const instantiationService = createAuthInstantiationService(disposables, authService);

		await instantiationService.invokeFunction(authenticateProtectedResources, agents, {
			authTokenCache: cache,
			logPrefix: '[AgentHost]',
			authenticate: async request => {
				requests.push(request);
			},
		});
		await instantiationService.invokeFunction(authenticateProtectedResources, agents, {
			authTokenCache: cache,
			logPrefix: '[AgentHost]',
			authenticate: async request => {
				requests.push(request);
			},
		});

		assert.deepStrictEqual(requests, [{ resource: protectedResource.resource, scopes: ['read'], token: 'cached-token', expiresIn: 3600 }]);
	});

	test('allows a newly signed-in account after removing a quarantined session', async () => {
		const account = { id: 'account-1', label: 'Account 1' };
		const exactSession: AuthenticationSession = { id: 'exact-session', scopes: ['read'], accessToken: 'stale-token', account };
		const broaderSession: AuthenticationSession = { id: 'broader-session', scopes: ['read', 'write'], accessToken: 'fresh-token', account };
		const newSession: AuthenticationSession = {
			id: 'new-session', scopes: ['read'], accessToken: 'new-account-token',
			account: { id: 'account-2', label: 'Account 2' },
		};
		let sessions = [exactSession, broaderSession];
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: async () => 'provider-1',
			getSessions: async (_providerId, scopes) => scopes
				? sessions.filter(session => scopes.length === session.scopes.length && scopes.every(scope => session.scopes.includes(scope)))
				: sessions,
		});
		const commandService = new TestCommandService();
		const instantiationService = createAuthInstantiationService(disposables, authService, commandService);
		const authTokenCache = new AgentHostAuthTokenCache();
		const recovery = new AgentHostAuthenticationRecovery(NullTelemetryService);
		const agents: AgentInfo[] = [{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [], protectedResources: [protectedResource] }];
		const tokens: string[] = [];
		const options: IAgentHostAuthenticationOptions = {
			authTokenCache,
			logPrefix: '[AgentHost]',
			authenticate: async request => { tokens.push(request.token); },
		};

		await instantiationService.invokeFunction(accessor => recovery.recover(accessor, protectedResource, options));
		await instantiationService.invokeFunction(accessor => recovery.recover(accessor, protectedResource, options));
		sessions = [newSession];
		await instantiationService.invokeFunction(revokeAuthenticationForRemovedSessions, agents, 'provider-1', [exactSession, broaderSession], options);
		const success = await instantiationService.invokeFunction(resolveAuthenticationInteractively, [protectedResource], options);

		assert.deepStrictEqual({
			success,
			tokens,
			prompts: commandService.calls.length,
			quarantine: authTokenCache.getRejectedSession(protectedResource.resource, protectedResource.scopes_supported),
		}, {
			success: true,
			tokens: ['stale-token', 'fresh-token', 'new-account-token'],
			prompts: 0,
			quarantine: undefined,
		});
	});

	test('cancels a background lookup that returns a token quarantined while it was pending', async () => {
		const account = { id: 'account-1', label: 'Account 1' };
		const exactSession: AuthenticationSession = { id: 'exact-session', scopes: ['read'], accessToken: 'stale-token', account };
		const broaderSession: AuthenticationSession = { id: 'broader-session', scopes: ['read', 'write'], accessToken: 'fresh-token', account };
		const lookupStarted = new DeferredPromise<void>();
		const pendingSessions = new DeferredPromise<AuthenticationSession[]>();
		let delayNextLookup = false;
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: async () => 'provider-1',
			getSessions: async (_providerId, scopes) => {
				if (scopes && delayNextLookup) {
					delayNextLookup = false;
					lookupStarted.complete();
					return pendingSessions.p;
				}
				return scopes ? [exactSession] : [exactSession, broaderSession];
			},
		});
		const instantiationService = createAuthInstantiationService(disposables, authService);
		const recovery = new AgentHostAuthenticationRecovery(NullTelemetryService);
		const agents: AgentInfo[] = [{ provider: 'copilotcli', displayName: 'Copilot', description: '', models: [], protectedResources: [protectedResource] }];
		const tokens: string[] = [];
		const options: IAgentHostAuthenticationOptions = {
			authTokenCache: new AgentHostAuthTokenCache(),
			logPrefix: '[AgentHost]',
			authenticate: async request => { tokens.push(request.token); },
		};

		await instantiationService.invokeFunction(accessor => recovery.recover(accessor, protectedResource, options));
		delayNextLookup = true;
		const backgroundAuthentication = instantiationService.invokeFunction(authenticateProtectedResources, agents, options);
		await lookupStarted.p;
		await instantiationService.invokeFunction(accessor => recovery.recover(accessor, protectedResource, options));
		const cancelled = assert.rejects(backgroundAuthentication, isCancellationError);
		pendingSessions.complete([exactSession]);
		await cancelled;

		assert.deepStrictEqual(tokens, ['stale-token', 'fresh-token']);
	});

	test('forwards a token without a malformed session expiry', async () => {
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
			getSessions: (_providerId, scopes) => Promise.resolve(scopes ? [{ scopes: ['read'], accessToken: 'cached-token', expiresAfter: 0 }] : []),
		});
		const requests: { resource: string; scopes?: readonly string[]; token: string; expiresIn?: number }[] = [];
		const agents = [{ protectedResources: [protectedResource] }] as unknown as readonly AgentInfo[];
		const instantiationService = createAuthInstantiationService(disposables, authService);

		await instantiationService.invokeFunction(authenticateProtectedResources, agents, {
			logPrefix: '[AgentHost]',
			authenticate: async request => {
				requests.push(request);
			},
		});

		assert.deepStrictEqual(requests, [{ resource: protectedResource.resource, scopes: ['read'], token: 'cached-token' }]);
	});

	test('does not infer credential removal when a previously available token disappears', async () => {
		let token: string | undefined = 'cached-token';
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
			getSessions: (_providerId, scopes) => {
				if (scopes && token) {
					return Promise.resolve([{ scopes: ['read'], accessToken: token }]);
				}

				return Promise.resolve([]);
			},
		});
		const cache = new AgentHostAuthTokenCache();
		const requests: { resource: string; scopes?: readonly string[]; token: string }[] = [];
		const agents = [{ protectedResources: [protectedResource] }] as unknown as readonly AgentInfo[];
		const instantiationService = createAuthInstantiationService(disposables, authService);
		const options: IAgentHostAuthenticationOptions = {
			authTokenCache: cache,
			logPrefix: '[AgentHost]',
			authenticate: async request => {
				requests.push(request);
			},
		};

		await instantiationService.invokeFunction(authenticateProtectedResources, agents, options);
		token = undefined;
		await instantiationService.invokeFunction(authenticateProtectedResources, agents, options);
		await instantiationService.invokeFunction(authenticateProtectedResources, agents, options);

		assert.deepStrictEqual(requests, [
			{ resource: protectedResource.resource, scopes: ['read'], token: 'cached-token' },
		]);
	});

	test('does not clear shared authentication while the provider is not ready', async () => {
		let providerReady = false;
		let sharedHostToken: string | undefined = 'other-client-token';
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve(providerReady ? 'provider-1' : undefined),
			isAuthenticationProviderRegistered: () => providerReady,
			declaredProviders: [{
				id: 'provider-1',
				label: 'Provider',
				authorizationServerGlobs: ['https://auth.example.com/*'],
			}],
			getSessions: () => Promise.resolve([{ scopes: ['read'], accessToken: 'healthy-client-token' }]),
		});
		const requests: { resource: string; scopes?: readonly string[]; token: string }[] = [];
		const agents = [{ protectedResources: [protectedResource] }] as unknown as readonly AgentInfo[];
		const instantiationService = createAuthInstantiationService(disposables, authService);
		const options: IAgentHostAuthenticationOptions = {
			authTokenCache: new AgentHostAuthTokenCache(),
			logPrefix: '[AgentHost]',
			authenticate: async request => {
				requests.push(request);
				sharedHostToken = request.token || undefined;
			},
		};

		await instantiationService.invokeFunction(authenticateProtectedResources, agents, options);
		providerReady = true;
		await instantiationService.invokeFunction(authenticateProtectedResources, agents, options);

		assert.deepStrictEqual({ requests, sharedHostToken }, {
			requests: [{ resource: protectedResource.resource, scopes: ['read'], token: 'healthy-client-token' }],
			sharedHostToken: 'healthy-client-token',
		});
	});

	test('clears shared authentication after an explicit session removal', async () => {
		let sharedHostToken: string | undefined = 'healthy-client-token';
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
		});
		const requests: { resource: string; scopes?: readonly string[]; token: string }[] = [];
		const agents = [{ protectedResources: [protectedResource] }] as unknown as readonly AgentInfo[];
		const instantiationService = createAuthInstantiationService(disposables, authService);

		await instantiationService.invokeFunction(revokeAuthenticationForRemovedSessions, agents, 'provider-1', [removedSession(['read'])], {
			authTokenCache: new AgentHostAuthTokenCache(),
			logPrefix: '[AgentHost]',
			authenticate: async request => {
				requests.push(request);
				sharedHostToken = request.token || undefined;
			},
		});

		assert.deepStrictEqual({ requests, sharedHostToken }, {
			requests: [{ resource: protectedResource.resource, scopes: ['read'], token: '' }],
			sharedHostToken: undefined,
		});
	});

	test('forwards the surviving token instead of revoking when another account remains', async () => {
		let sharedHostToken: string | undefined = 'removed-account-token';
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
			getSessions: () => Promise.resolve([{ scopes: ['read'], accessToken: 'surviving-account-token' }]),
		});
		const requests: { resource: string; scopes?: readonly string[]; token: string }[] = [];
		const agents = [{ protectedResources: [protectedResource] }] as unknown as readonly AgentInfo[];
		const instantiationService = createAuthInstantiationService(disposables, authService);

		await instantiationService.invokeFunction(revokeAuthenticationForRemovedSessions, agents, 'provider-1', [removedSession(['read'])], {
			authTokenCache: new AgentHostAuthTokenCache(),
			logPrefix: '[AgentHost]',
			authenticate: async request => {
				requests.push(request);
				sharedHostToken = request.token || undefined;
			},
		});

		assert.deepStrictEqual({ requests, sharedHostToken }, {
			requests: [{ resource: protectedResource.resource, scopes: ['read'], token: 'surviving-account-token' }],
			sharedHostToken: 'surviving-account-token',
		});
	});

	test('leaves resources the removed session could not satisfy untouched', async () => {
		// One provider commonly serves several resources with different scope sets.
		// Signing out of an account that never covered a resource must not make this
		// client re-evaluate -- and possibly revoke -- a credential another client owns.
		let sharedHostToken: string | undefined = 'other-client-token';
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
		});
		const requests: { resource: string; scopes?: readonly string[]; token: string }[] = [];
		const agents = [{ protectedResources: [protectedResource] }] as unknown as readonly AgentInfo[];
		const instantiationService = createAuthInstantiationService(disposables, authService);

		await instantiationService.invokeFunction(revokeAuthenticationForRemovedSessions, agents, 'provider-1', [removedSession(['repo'])], {
			authTokenCache: new AgentHostAuthTokenCache(),
			logPrefix: '[AgentHost]',
			authenticate: async request => {
				requests.push(request);
				sharedHostToken = request.token || undefined;
			},
		});

		assert.deepStrictEqual({ requests, sharedHostToken }, { requests: [], sharedHostToken: 'other-client-token' });
	});

	test('repairs host authentication after an external clear without replacing the cache', async () => {
		let sharedHostToken: string | undefined;
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
			getSessions: () => Promise.resolve([{ scopes: ['read'], accessToken: 'healthy-client-token' }]),
		});
		const cache = new AgentHostAuthTokenCache();
		const requests: { resource: string; scopes?: readonly string[]; token: string }[] = [];
		const agents = [{ protectedResources: [protectedResource] }] as unknown as readonly AgentInfo[];
		const instantiationService = createAuthInstantiationService(disposables, authService);
		const options: IAgentHostAuthenticationOptions = {
			authTokenCache: cache,
			logPrefix: '[AgentHost]',
			authenticate: async request => {
				requests.push(request);
				sharedHostToken = request.token || undefined;
			},
		};

		await instantiationService.invokeFunction(authenticateProtectedResources, agents, options);
		sharedHostToken = undefined;
		cache.clear();
		await instantiationService.invokeFunction(authenticateProtectedResources, agents, options);

		assert.deepStrictEqual({ requests, sharedHostToken }, {
			requests: [
				{ resource: protectedResource.resource, scopes: ['read'], token: 'healthy-client-token' },
				{ resource: protectedResource.resource, scopes: ['read'], token: 'healthy-client-token' },
			],
			sharedHostToken: 'healthy-client-token',
		});
	});
});

suite('resolveAuthenticationInteractively', () => {

	const protectedResource: ProtectedResourceMetadata = {
		resource: 'https://api.example.com',
		authorization_servers: ['https://auth.example.com'],
		scopes_supported: ['read'],
	};

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('uses an existing token before prompting and dedupes repeated checks', async () => {
		let createSessionCalls = 0;
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
			getSessions: (_providerId, scopes) => {
				if (scopes) {
					return Promise.resolve([{ scopes: ['read'], accessToken: 'existing-token' }]);
				}

				return Promise.resolve([]);
			},
			createSession: async () => {
				createSessionCalls++;
				return { accessToken: 'new-token' };
			},
		});
		const requests: { resource: string; scopes?: readonly string[]; token: string }[] = [];
		const cache = new AgentHostAuthTokenCache();
		const instantiationService = createAuthInstantiationService(disposables, authService);

		const options: IAgentHostAuthenticationOptions = {
			authTokenCache: cache,
			logPrefix: '[AgentHost]',
			authenticate: async request => {
				requests.push(request);
			},
		};
		const results = [
			await instantiationService.invokeFunction(resolveAuthenticationInteractively, [protectedResource], options),
			await instantiationService.invokeFunction(resolveAuthenticationInteractively, [protectedResource], options),
		];

		assert.deepStrictEqual({ results, requests, createSessionCalls }, {
			results: [true, true],
			requests: [{ resource: protectedResource.resource, scopes: ['read'], token: 'existing-token' }],
			createSessionCalls: 0,
		});
	});

	test('uses a non-rejected existing session before prompting', async () => {
		const account = { id: 'account-1', label: 'Account 1' };
		const exactSession = { id: 'exact-session', scopes: ['read'], accessToken: 'stale-token', account };
		const broaderSession = { id: 'broader-session', scopes: ['read', 'write'], accessToken: 'fresh-token', account };
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
			getSessions: (_providerId, scopes) => Promise.resolve(scopes ? [exactSession] : [exactSession, broaderSession]),
		});
		const commandService = new TestCommandService();
		const instantiationService = createAuthInstantiationService(disposables, authService, commandService);
		const authTokenCache = new AgentHostAuthTokenCache();
		authTokenCache.rejectSession(protectedResource.resource, protectedResource.scopes_supported, exactSession);
		const requests: { resource: string; scopes?: readonly string[]; token: string }[] = [];

		const success = await instantiationService.invokeFunction(resolveAuthenticationInteractively, [protectedResource], {
			authTokenCache,
			logPrefix: '[AgentHost]',
			authenticate: async request => {
				requests.push(request);
			},
		});

		assert.deepStrictEqual({ success, commandCalls: commandService.calls.length, requests }, {
			success: true,
			commandCalls: 0,
			requests: [{
				resource: protectedResource.resource, scopes: ['read'], token: 'fresh-token',
				_meta: authenticationAccountMeta({ providerId: 'provider-1', accountId: 'account-1' }),
			}],
		});
	});

	test('uses the product sign-in flow and forwards its token', async () => {
		let signedIn = false;
		const commandService = new TestCommandService();
		commandService.onExecute = () => { signedIn = true; };
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
			getSessions: () => Promise.resolve(signedIn ? [{ scopes: ['read'], accessToken: 'signed-in-token' }] : []),
		});
		const requests: { resource: string; scopes?: readonly string[]; token: string }[] = [];
		const instantiationService = createAuthInstantiationService(disposables, authService, commandService);

		const success = await instantiationService.invokeFunction(resolveAuthenticationInteractively, [protectedResource], {
			authTokenCache: new AgentHostAuthTokenCache(),
			logPrefix: '[AgentHost]',
			authenticate: async request => {
				requests.push(request);
			},
		});

		assert.deepStrictEqual({ success, commandCalls: commandService.calls, requests }, {
			success: true,
			commandCalls: [{
				commandId: CHAT_SETUP_ACTION_ID,
				args: [undefined, {
					telemetrySource: 'agentHost',
					forceSignInDialog: true,
					additionalScopes: ['read'],
					dialogTitle: 'Sign in to use GitHub Copilot',
					disableChatViewReveal: true,
					returnResult: true,
				}],
			}],
			requests: [{ resource: protectedResource.resource, scopes: ['read'], token: 'signed-in-token' }],
		});
	});

	test('does not fall back to direct provider login when product sign-in is canceled', async () => {
		const commandService = new TestCommandService();
		commandService.result = { success: undefined, dialogSkipped: false };
		let createSessionCalls = 0;
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
			getSessions: () => Promise.resolve([]),
			createSession: async () => {
				createSessionCalls++;
				return { accessToken: 'unexpected-token' };
			},
		});
		const instantiationService = createAuthInstantiationService(disposables, authService, commandService);

		const success = await instantiationService.invokeFunction(resolveAuthenticationInteractively, [protectedResource], {
			logPrefix: '[AgentHost]',
			authenticate: async () => { },
		});

		assert.deepStrictEqual({ success, createSessionCalls }, { success: false, createSessionCalls: 0 });
	});

	test('propagates product sign-in failures', async () => {
		const commandService = new TestCommandService();
		commandService.result = { success: false, dialogSkipped: false, error: new Error('Bad credentials') };
		const authService = createMockAuthService({
			getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
			getSessions: () => Promise.resolve([]),
		});
		const instantiationService = createAuthInstantiationService(disposables, authService, commandService);

		await assert.rejects(instantiationService.invokeFunction(resolveAuthenticationInteractively, [protectedResource], {
			logPrefix: '[AgentHost]',
			authenticate: async () => { },
		}), /Bad credentials/);
	});
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { bufferToStream, VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { IRequestContext, IRequestOptions } from '../../../../../base/parts/request/common/request.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/index.js';
import { AgentHostCopilotM365EnabledSettingId } from '../../../../../platform/chat/common/chatSettings.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { Configuration, ConfigurationChangeEvent } from '../../../../../platform/configuration/common/configurationModels.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { CustomizationMarketplaceConfiguration } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY, IFileManagedSettingsService, INativeManagedSettingsService, ManagedSettingsData, NullFileManagedSettingsService, NullNativeManagedSettingsService } from '../../../../../platform/policy/common/copilotManagedSettings.js';
import { IManagedSettingsFreshness, ManagedSettingsFreshnessFailure, ManagedSettingsFreshnessState } from '../../../../../platform/policy/common/managedSettingsFreshness.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IRequestService } from '../../../../../platform/request/common/request.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { AuthenticationSession, AuthenticationSessionsChangeEvent, IAuthenticationExtensionsService, IAuthenticationProvider, IAuthenticationService } from '../../../authentication/common/authentication.js';
import { IWorkbenchEnvironmentService } from '../../../environment/common/environmentService.js';
import { IExtensionService } from '../../../extensions/common/extensions.js';
import { IHostService } from '../../../host/browser/host.js';
import { DefaultAccountProvider, DefaultAccountService } from '../../browser/defaultAccount.js';
import { IManagedSettingsResponse } from '../../browser/managedSettings.js';
import { TestProductService } from '../../../../test/common/workbenchTestServices.js';
import { AccountPolicyGateState, AccountPolicyService } from '../../../policies/common/accountPolicyService.js';

suite('DefaultAccountProvider', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const accountId = 'account';
	const sessions: AuthenticationSession[] = [{
		id: 'session',
		accessToken: 'token',
		account: { id: accountId, label: 'octocat' },
		scopes: ['user:email'],
		authorizationServer: URI.parse('https://github.com/login/oauth'),
	}];

	test('cached settings perform one startup compatibility fetch', async () => {
		const requestService = new TestRequestService(async () => jsonResponse({
			forceRemoteSettingsRefresh: true,
			permissions: { disableBypassPermissionsMode: 'disable' },
		}));
		const provider = await createProvider(requestService);
		const cachedPolicy = createCachedPolicy(true);

		const first = await provider['getManagedSettings'](sessions, cachedPolicy);
		const second = await provider['getManagedSettings'](sessions, cachedPolicy);

		assert.deepStrictEqual({
			requestCount: requestService.requestCount,
			requestQuery: new URL(requestService.requests[0].url!).search,
			disableCache: requestService.requests[0].disableCache,
			first: first.data,
			second: second.data,
		}, {
			requestCount: 1,
			requestQuery: '?client_id=vscode&client_version=1.132.0&copilot_runtime_version=0.0.344',
			disableCache: true,
			first: cachedPolicy.policyData,
			second: cachedPolicy.policyData,
		});
	});

	test('settings without a refresh requirement use the cache without fetching', async () => {
		const requestService = new TestRequestService(async () => jsonResponse({
			permissions: { disableBypassPermissionsMode: 'disable' },
		}));
		const provider = await createProvider(requestService);
		const cachedPolicy = createCachedPolicy(false);

		const first = await provider['getManagedSettings'](sessions, cachedPolicy);
		const second = await provider['getManagedSettings'](sessions, cachedPolicy);

		assert.deepStrictEqual({
			requestCount: requestService.requestCount,
			first: first.data,
			second: second.data,
		}, {
			requestCount: 0,
			first: cachedPolicy.policyData,
			second: cachedPolicy.policyData,
		});
	});

	test('forceRefresh fetches fresh even when the cache is fresh, without it the cache is honored', async () => {
		const requestService = new TestRequestService(async () => jsonResponse({
			permissions: { disableBypassPermissionsMode: 'disable' },
		}));
		const provider = await createProvider(requestService);
		const cachedPolicy = createCachedPolicy(false);

		// Without forceRefresh the fresh cache is served with no network round-trip.
		const cached = await provider['getManagedSettings'](sessions, cachedPolicy);
		// The forceRefresh command bypasses the fresh cache and fetches.
		const forced = await provider['getManagedSettings'](sessions, cachedPolicy, { forceRefresh: true, retryManagedSettings: true });

		assert.deepStrictEqual({
			requestCount: requestService.requestCount,
			cached: cached.data,
			forced: forced.data,
		}, {
			requestCount: 1,
			cached: cachedPolicy.policyData,
			forced: { managedSettings: { 'permissions.disableBypassPermissionsMode': 'disable' } },
		});
	});

	test('entitlement refresh preserves satisfied governed managed settings', async () => {
		const freshEntitlements = {
			access_type_sku: 'copilot_business_seat',
			chat_enabled: true,
			assigned_date: '2026-01-01',
			can_signup_for_limited: false,
			copilot_plan: 'business',
			organization_login_list: [],
			analytics_tracking_id: 'tracking-id',
		};
		const requestService = new TestRequestService(async options => options.callSite === 'defaultAccount.entitlements'
			? jsonResponse(freshEntitlements)
			: Promise.reject(new Error(`Unexpected request: ${options.url}`)));
		const provider = await createProvider(requestService);
		const fetchedAt = Date.now() - 1000;
		const managedSettingsScope = {
			accountId,
			authenticationProviderId: 'github',
			endpointOrigin: 'https://api.github.com',
		};
		const cachedPolicy = {
			...createCachedPolicy(true),
			managedSettingsScope,
		};
		const policyData = {
			...cachedPolicy,
			entitlementsFetchedAt: fetchedAt,
			managedSettingsFetchedAt: fetchedAt,
		};
		provider['setDefaultAccount']({
			defaultAccount: {
				authenticationProvider: { id: 'github', name: 'GitHub', enterprise: false },
				accountName: sessions[0].account.label,
				sessionId: sessions[0].id,
				enterprise: false,
				entitlementsData: { ...freshEntitlements, copilot_plan: 'individual' },
			},
			accountId,
			policyData,
			copilotTokenInfo: null,
		});
		provider['setManagedSettingsFreshness']({
			state: ManagedSettingsFreshnessState.Satisfied,
			source: 'server',
			scope: managedSettingsScope,
			lastAttemptAt: fetchedAt,
			satisfiedAt: fetchedAt,
		});

		const refreshedEntitlements = await provider['getDefaultAccountFromAuthenticatedSessions'](
			{ id: 'github', name: 'GitHub', enterprise: false },
			sessions,
			{ refreshEntitlements: true }
		);

		assert.deepStrictEqual({
			callSites: requestService.requests.map(request => request.callSite),
			refreshedCopilotPlan: refreshedEntitlements?.defaultAccount.entitlementsData?.copilot_plan,
			freshness: describeFreshness(provider.managedSettingsFreshness),
		}, {
			callSites: ['defaultAccount.entitlements'],
			refreshedCopilotPlan: 'business',
			freshness: {
				state: ManagedSettingsFreshnessState.Satisfied,
				source: 'server',
				scope: managedSettingsScope,
				hasLastAttempt: true,
				hasSatisfiedAt: true,
			},
		});
	});

	test('settings without a refresh requirement refetch only after the cache becomes stale', async () => {
		const requestService = new TestRequestService(async () => jsonResponse({}));
		const provider = await createProvider(requestService);
		const cachedPolicy = createCachedPolicy(false);

		await provider['getManagedSettings'](sessions, cachedPolicy);
		await provider['getManagedSettings'](sessions, cachedPolicy);
		await provider['getManagedSettings'](sessions, {
			...cachedPolicy,
			managedSettingsFetchedAt: Date.now() - 60 * 60 * 1000,
		});

		assert.strictEqual(requestService.requestCount, 1);
	});

	test('outstanding compatibility error revalidates instead of serving a fresh cache', async () => {
		const requestService = new TestRequestService(async () => jsonResponse({}));
		const provider = await createProvider(requestService);
		provider['setManagedSettingsCompatibilityError']({ errorCode: 'client_update_required' });
		const cachedPolicy = createCachedPolicy(false);

		const result = await provider['getManagedSettings'](sessions, cachedPolicy);

		assert.deepStrictEqual({
			requestCount: requestService.requestCount,
			compatibilityError: result.compatibilityError,
		}, {
			requestCount: 1,
			compatibilityError: null,
		});
	});

	test('a fresh cache from a different scope is not reused', async () => {
		const requestService = new TestRequestService(async () => jsonResponse({
			permissions: { disableBypassPermissionsMode: 'disable' },
		}));
		const provider = await createProvider(requestService);
		const cachedPolicy = {
			...createCachedPolicy(false),
			managedSettingsScope: {
				accountId,
				authenticationProviderId: 'github-enterprise',
				endpointOrigin: 'https://api.ghe.example.com',
			},
		};

		// The cache was captured for a different provider/endpoint than the current github/api.github.com
		// scope, so it must be revalidated rather than served for the rest of the cache lifetime.
		const result = await provider['getManagedSettings'](sessions, cachedPolicy);

		assert.deepStrictEqual({
			requestCount: requestService.requestCount,
			data: result.data,
		}, {
			requestCount: 1,
			data: { managedSettings: { 'permissions.disableBypassPermissionsMode': 'disable' } },
		});
	});

	test('a fresh cache from a different scope is not retained when refetch fails', async () => {
		const requestService = new TestRequestService(async () => {
			throw new Error('managed settings unavailable');
		});
		const provider = await createProvider(requestService);
		const cachedPolicy = {
			...createCachedPolicy(false),
			managedSettingsScope: {
				accountId,
				authenticationProviderId: 'github-enterprise',
				endpointOrigin: 'https://api.ghe.example.com',
			},
		};

		const result = await provider['getManagedSettings'](sessions, cachedPolicy);

		assert.deepStrictEqual({
			requestCount: requestService.requestCount,
			data: result.data,
			fetchedAt: result.fetchedAt,
			scope: result.scope,
		}, {
			requestCount: 1,
			data: { managedSettings: undefined },
			fetchedAt: undefined,
			scope: {
				accountId,
				authenticationProviderId: 'github',
				endpointOrigin: 'https://api.github.com',
			},
		});
	});

	test('a cache from a different scope is not retained by forced refresh failure or retry blocking', async () => {
		const requestService = new TestRequestService(async () => {
			throw new Error('managed settings unavailable');
		});
		const provider = await createProvider(requestService, { [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true });
		const cachedPolicy = {
			...createCachedPolicy(false),
			managedSettingsScope: {
				accountId,
				authenticationProviderId: 'github-enterprise',
				endpointOrigin: 'https://api.ghe.example.com',
			},
		};

		const failed = await provider['getManagedSettings'](sessions, cachedPolicy);
		const blocked = await provider['getManagedSettings'](sessions, cachedPolicy);

		assert.deepStrictEqual({
			requestCount: requestService.requestCount,
			failed: {
				data: failed.data,
				fetchedAt: failed.fetchedAt,
				scope: failed.scope,
			},
			blocked: {
				data: blocked.data,
				fetchedAt: blocked.fetchedAt,
				scope: blocked.scope,
			},
		}, {
			requestCount: 1,
			failed: {
				data: { managedSettings: undefined },
				fetchedAt: undefined,
				scope: {
					accountId,
					authenticationProviderId: 'github',
					endpointOrigin: 'https://api.github.com',
				},
			},
			blocked: {
				data: { managedSettings: undefined },
				fetchedAt: undefined,
				scope: {
					accountId,
					authenticationProviderId: 'github',
					endpointOrigin: 'https://api.github.com',
				},
			},
		});
	});

	test('fresh 404 clears a cached server requirement', async () => {
		const requestService = new TestRequestService(async () => jsonResponse({}, 404));
		const provider = await createProvider(requestService);
		const cachedPolicy = createCachedPolicy(true);

		const result = await provider['getManagedSettings'](sessions, cachedPolicy);

		assert.deepStrictEqual({
			requestCount: requestService.requestCount,
			status: provider.managedSettingsFetchStatus,
			data: result.data,
			compatibilityError: provider.managedSettingsCompatibilityError,
			freshness: provider.managedSettingsFreshness,
		}, {
			requestCount: 1,
			status: 404,
			data: { managedSettings: undefined },
			compatibilityError: null,
			freshness: { state: ManagedSettingsFreshnessState.NotRequired },
		});
	});

	test('managed settings 404 does not retry with another authentication session', async () => {
		const requestService = new TestRequestService(async () => jsonResponse({}, 404));
		const provider = await createProvider(requestService);

		const result = await provider['getManagedSettings']([
			sessions[0],
			{ ...sessions[0], id: 'second-session' },
		], undefined);

		assert.deepStrictEqual({
			requestCount: requestService.requestCount,
			status: provider.managedSettingsFetchStatus,
			data: result.data,
		}, {
			requestCount: 1,
			status: 404,
			data: { managedSettings: undefined },
		});
	});

	test('fresh 404 satisfies a native refresh requirement', async () => {
		const requestService = new TestRequestService(async () => jsonResponse({}, 404));
		const provider = await createProvider(requestService, { [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true });

		await provider['getManagedSettings'](sessions, undefined);

		assert.deepStrictEqual(describeFreshness(provider.managedSettingsFreshness), {
			state: ManagedSettingsFreshnessState.Satisfied,
			source: 'nativeMdm',
			scope: {
				accountId,
				authenticationProviderId: 'github',
				endpointOrigin: 'https://api.github.com',
			},
			hasLastAttempt: true,
			hasSatisfiedAt: true,
		});
	});

	test('466 blocks and does not fall back to cached server managed settings', async () => {
		const requestService = new TestRequestService(async () => jsonResponse({
			error_code: 'client_update_required',
			client_id: 'vscode',
			client_version: '1.132.0',
			minimum_client_version: '1.133.0',
		}, 466));
		const provider = await createProvider(requestService);
		const cachedPolicy = createCachedPolicy(false);

		const result = await provider['getManagedSettings'](sessions, cachedPolicy, { forceRefresh: true });

		assert.deepStrictEqual({
			status: provider.managedSettingsFetchStatus,
			data: result.data,
			compatibilityError: provider.managedSettingsCompatibilityError,
		}, {
			status: 466,
			data: { managedSettings: undefined },
			compatibilityError: {
				errorCode: 'client_update_required',
				clientVersion: '1.132.0',
				minimumClientVersion: '1.133.0',
			},
		});
	});

	test('malformed 466 still blocks without compatibility metadata', async () => {
		const requestService = new TestRequestService(async () => jsonResponse({ error_code: 'unexpected' }, 466));
		const provider = await createProvider(requestService);

		const result = await provider['getManagedSettings'](sessions, createCachedPolicy(false), { forceRefresh: true });

		assert.deepStrictEqual({
			data: result.data,
			compatibilityError: provider.managedSettingsCompatibilityError,
		}, {
			data: { managedSettings: undefined },
			compatibilityError: { errorCode: 'client_update_required' },
		});
	});

	test('466 is a blocked forced refresh and keeps cached restrictions', async () => {
		const requestService = new TestRequestService(async () => jsonResponse({
			error_code: 'client_update_required',
			client_id: 'vscode',
		}, 466));
		const provider = await createProvider(requestService);
		const cachedPolicy = createCachedPolicy(true);

		const result = await provider['getManagedSettings'](sessions, cachedPolicy);

		assert.deepStrictEqual({
			freshness: describeFreshness(provider.managedSettingsFreshness),
			data: result.data,
		}, {
			freshness: {
				state: ManagedSettingsFreshnessState.Blocked,
				source: 'server',
				failure: ManagedSettingsFreshnessFailure.UpdateRequired,
				hasLastAttempt: true,
				hasScope: true,
			},
			data: cachedPolicy.policyData,
		});
	});

	test('failed forced refresh retains cached managed settings when no rejection is known', async () => {
		const requestService = new TestRequestService(async () => {
			throw new Error('managed settings unavailable');
		});
		const provider = await createProvider(requestService);
		const cachedPolicy = createCachedPolicy(false);

		const result = await provider['getManagedSettings'](sessions, cachedPolicy, { forceRefresh: true });

		assert.deepStrictEqual({
			requestCount: requestService.requestCount,
			status: provider.managedSettingsFetchStatus,
			data: result.data,
		}, {
			requestCount: 1,
			status: 'no-response',
			data: cachedPolicy.policyData,
		});
	});

	test('failed forced refresh blocks without treating cached settings as fresh', async () => {
		const requestService = new TestRequestService(async () => {
			throw new Error('managed settings unavailable');
		});
		const provider = await createProvider(requestService);
		const cachedPolicy = createCachedPolicy(true);

		const result = await provider['getManagedSettings'](sessions, cachedPolicy);

		assert.deepStrictEqual({
			requestCount: requestService.requestCount,
			status: provider.managedSettingsFetchStatus,
			freshness: describeFreshness(provider.managedSettingsFreshness),
			data: result.data,
			fetchedAt: result.fetchedAt,
		}, {
			requestCount: 1,
			status: 'no-response',
			freshness: {
				state: ManagedSettingsFreshnessState.Blocked,
				source: 'server',
				failure: ManagedSettingsFreshnessFailure.Network,
				hasLastAttempt: true,
				hasScope: true,
			},
			data: cachedPolicy.policyData,
			fetchedAt: cachedPolicy.managedSettingsFetchedAt,
		});
	});

	test('retry after a failed forced refresh stays forced and blocked', async () => {
		const requestService = new TestRequestService(async () => {
			throw new Error('managed settings unavailable');
		});
		const provider = await createProvider(requestService);
		const cachedPolicy = createCachedPolicy(true);

		const first = await provider['getManagedSettings'](sessions, cachedPolicy);
		const retryPolicy = {
			...cachedPolicy,
			policyData: first.data ?? {},
			managedSettingsFetchedAt: first.fetchedAt,
		};
		await provider['getManagedSettings'](sessions, retryPolicy, { forceRefresh: true, retryManagedSettings: true });

		assert.deepStrictEqual({
			requestCount: requestService.requestCount,
			freshness: describeFreshness(provider.managedSettingsFreshness),
		}, {
			requestCount: 2,
			freshness: {
				state: ManagedSettingsFreshnessState.Blocked,
				source: 'server',
				failure: ManagedSettingsFreshnessFailure.Network,
				hasLastAttempt: true,
				hasScope: true,
			},
		});
	});

	test('automatic refreshes stop after failure while explicit retry bypasses the guard', async () => {
		const requestService = new TestRequestService(async () => {
			throw new Error('managed settings unavailable');
		});
		const provider = await createProvider(requestService);
		const cachedPolicy = createCachedPolicy(true);

		await provider['getManagedSettings'](sessions, cachedPolicy);
		await provider['getManagedSettings'](sessions, cachedPolicy, { forceRefresh: true });
		await provider['getManagedSettings'](sessions, cachedPolicy, { forceRefresh: true, retryManagedSettings: true });

		assert.deepStrictEqual({
			requestCount: requestService.requestCount,
			freshness: describeFreshness(provider.managedSettingsFreshness),
		}, {
			requestCount: 2,
			freshness: {
				state: ManagedSettingsFreshnessState.Blocked,
				source: 'server',
				failure: ManagedSettingsFreshnessFailure.Network,
				hasLastAttempt: true,
				hasScope: true,
			},
		});
	});

	test('settings without a refresh requirement do not latch failures', async () => {
		const requestService = new TestRequestService(async () => {
			throw new Error('managed settings unavailable');
		});
		const provider = await createProvider(requestService);
		const cachedPolicy = createCachedPolicy(false);

		await provider['getManagedSettings'](sessions, cachedPolicy, { forceRefresh: true });
		await provider['getManagedSettings'](sessions, cachedPolicy, { forceRefresh: true });

		assert.strictEqual(requestService.requestCount, 2);
	});

	test('managed settings endpoint outage without a refresh requirement keeps freshness non-blocking', async () => {
		let managedSettingsRequestCount = 0;
		const requestService = new TestRequestService(async options => {
			if (options.url?.endsWith('/copilot_internal/user')) {
				return jsonResponse({ chat_enabled: true });
			}
			if (options.url?.includes('/copilot_internal/managed_settings')) {
				managedSettingsRequestCount++;
				if (managedSettingsRequestCount === 1) {
					return jsonResponse({
						permissions: { disableBypassPermissionsMode: 'disable' },
					});
				}
				throw new Error('managed settings request timed out');
			}
			throw new Error(`Unexpected request: ${options.url}`);
		});
		const provider = await createProvider(
			requestService,
			{},
			{},
			'https://api.github.com/copilot_internal/managed_settings',
			{ getSessions: async () => sessions }
		);

		await provider.refresh({ forceRefresh: true });
		const accountService = disposables.add(new DefaultAccountService(TestProductService));
		accountService.setDefaultAccountProvider(provider);
		await accountService.refresh();
		const gateService = disposables.add(new AccountPolicyService(new NullLogService(), accountService));
		await timeout(0);

		assert.deepStrictEqual({
			managedSettingsRequestCount,
			requestTimeouts: requestService.requests
				.filter(request => request.url?.includes('/copilot_internal/managed_settings'))
				.map(request => request.timeout),
			defaultAccount: provider.defaultAccount,
			managedSettings: provider.policyData?.managedSettings,
			freshness: provider.managedSettingsFreshness,
			compatibilityError: provider.managedSettingsCompatibilityError,
			gateState: gateService.gateInfo.state,
		}, {
			managedSettingsRequestCount: 2,
			requestTimeouts: [5000, 5000],
			defaultAccount: {
				authenticationProvider: { id: 'github', name: 'GitHub', enterprise: false },
				accountName: 'octocat',
				sessionId: 'session',
				enterprise: false,
				entitlementsData: { chat_enabled: true },
			},
			managedSettings: {
				'permissions.disableBypassPermissionsMode': 'disable',
			},
			freshness: { state: ManagedSettingsFreshnessState.NotRequired },
			compatibilityError: null,
			gateState: AccountPolicyGateState.Inactive,
		});
	});

	test('refreshing to Local-only permission or empty settings clears cached raw governance', async () => {
		let response: IManagedSettingsResponse = { futureControl: {} };
		const requestService = new TestRequestService(async options => {
			if (options.url?.endsWith('/copilot_internal/user')) {
				return jsonResponse({ chat_enabled: true });
			}
			if (options.url?.includes('/copilot_internal/managed_settings')) {
				return jsonResponse(response);
			}
			throw new Error(`Unexpected request: ${options.url}`);
		});
		const provider = await createProvider(requestService, {}, {},
			'https://api.github.com/copilot_internal/managed_settings', { getSessions: async () => sessions });
		const responses: IManagedSettingsResponse[] = [
			{ futureControl: {} },
			{ vscode: { temporaryAllowLocalHarness: false } },
			{ vscode: { temporaryAllowLocalHarness: true }, futureControl: {} },
			{},
		];
		const results = [];
		for (response of responses) {
			await provider.refresh({ forceRefresh: true });
			const refreshed = provider.policyData?.managedSettingsActive;
			await provider.refresh();
			results.push({ refreshed, cached: provider.policyData?.managedSettingsActive });
		}
		assert.deepStrictEqual(results, [
			{ refreshed: true, cached: true }, { refreshed: false, cached: false },
			{ refreshed: true, cached: true }, { refreshed: false, cached: false },
		]);
	});

	test('truthy non-boolean server refresh control remains non-blocking after an endpoint outage', async () => {
		let managedSettingsRequestCount = 0;
		const requestService = new TestRequestService(async options => {
			if (options.url?.endsWith('/copilot_internal/user')) {
				return jsonResponse({ chat_enabled: true });
			}
			if (options.url?.includes('/copilot_internal/managed_settings')) {
				managedSettingsRequestCount++;
				if (managedSettingsRequestCount === 1) {
					return jsonResponse({
						forceRemoteSettingsRefresh: 'true',
						permissions: { disableBypassPermissionsMode: 'disable' },
					});
				}
				throw new Error('managed settings request timed out');
			}
			throw new Error(`Unexpected request: ${options.url}`);
		});
		const provider = await createProvider(
			requestService,
			{},
			{},
			'https://api.github.com/copilot_internal/managed_settings',
			{ getSessions: async () => sessions }
		);

		await provider.refresh({ forceRefresh: true });

		assert.deepStrictEqual({
			managedSettingsRequestCount,
			managedSettings: provider.policyData?.managedSettings,
			freshness: provider.managedSettingsFreshness,
			compatibilityError: provider.managedSettingsCompatibilityError,
		}, {
			managedSettingsRequestCount: 2,
			managedSettings: {
				forceRemoteSettingsRefresh: 'true',
				'permissions.disableBypassPermissionsMode': 'disable',
			},
			freshness: { state: ManagedSettingsFreshnessState.NotRequired },
			compatibilityError: null,
		});
	});

	test('non-466 managed settings failures remain non-blocking without a refresh requirement', async () => {
		const failures: { name: string; response: () => IRequestContext }[] = [
			{ name: 'http error', response: () => jsonResponse({}, 500) },
			{
				name: 'malformed response',
				response: () => ({
					res: { statusCode: 200, headers: {} },
					stream: bufferToStream(VSBuffer.fromString('{')),
				}),
			},
			{ name: 'rate limited', response: () => jsonResponse({}, 429, { 'retry-after': '60' }) },
		];
		const outcomes = [];

		for (const failure of failures) {
			const requestService = new TestRequestService(async () => failure.response());
			const provider = await createProvider(requestService);
			const cachedPolicy = createCachedPolicy(false);
			const result = await provider['getManagedSettings'](sessions, cachedPolicy, { forceRefresh: true });
			outcomes.push({
				name: failure.name,
				status: provider.managedSettingsFetchStatus,
				data: result.data,
				keptCachedTimestamp: result.fetchedAt === cachedPolicy.managedSettingsFetchedAt,
				freshness: provider.managedSettingsFreshness,
				compatibilityError: provider.managedSettingsCompatibilityError,
			});
		}

		assert.deepStrictEqual(outcomes, [
			{
				name: 'http error',
				status: 500,
				data: createCachedPolicy(false).policyData,
				keptCachedTimestamp: true,
				freshness: { state: ManagedSettingsFreshnessState.NotRequired },
				compatibilityError: null,
			},
			{
				name: 'malformed response',
				status: 'parse-error',
				data: createCachedPolicy(false).policyData,
				keptCachedTimestamp: true,
				freshness: { state: ManagedSettingsFreshnessState.NotRequired },
				compatibilityError: null,
			},
			{
				name: 'rate limited',
				status: 429,
				data: createCachedPolicy(false).policyData,
				keptCachedTimestamp: true,
				freshness: { state: ManagedSettingsFreshnessState.NotRequired },
				compatibilityError: null,
			},
		]);
	});

	test('managed settings source change preserves a prior blocked state', async () => {
		const requestService = new TestRequestService(async () => {
			throw new Error('managed settings unavailable');
		});
		const provider = await createProvider(requestService, { [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true });

		await provider['getManagedSettings'](sessions, undefined);
		provider['initialized'] = false;
		provider['onManagedSettingsSourceChanged']();
		await provider['getDefaultAccountFromAuthenticatedSessions'](
			{ id: 'github', name: 'GitHub', enterprise: false },
			sessions,
			{ forceRefresh: true }
		);

		assert.deepStrictEqual({
			managedSettingsRequestCount: requestService.requests.filter(request => request.url?.includes('/copilot_internal/managed_settings')).length,
			freshness: describeFreshness(provider.managedSettingsFreshness),
		}, {
			managedSettingsRequestCount: 1,
			freshness: {
				state: ManagedSettingsFreshnessState.Blocked,
				source: 'nativeMdm',
				failure: ManagedSettingsFreshnessFailure.Network,
				hasLastAttempt: true,
				hasScope: true,
			},
		});
	});

	test('managed-settings failure guard is scoped to the account', async () => {
		const requestService = new TestRequestService(async () => {
			throw new Error('managed settings unavailable');
		});
		const provider = await createProvider(requestService, { [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true });

		await provider['getManagedSettings'](sessions, undefined);
		await provider['getManagedSettings']([
			{ ...sessions[0], account: { id: 'second-account', label: 'hubot' } },
		], undefined);

		assert.strictEqual(requestService.requestCount, 2);
	});

	test('forced managed-settings attempt uses only the selected authentication session', async () => {
		const requestService = new TestRequestService(async () => {
			throw new Error('managed settings unavailable');
		});
		const provider = await createProvider(requestService, { [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true });

		await provider['getManagedSettings']([
			sessions[0],
			{ ...sessions[0], id: 'second-session' },
		], undefined);

		assert.strictEqual(requestService.requestCount, 1);
	});

	test('settings without a refresh requirement retain session fallback', async () => {
		let requestCount = 0;
		const requestService = new TestRequestService(async () => {
			requestCount++;
			return requestCount === 1 ? jsonResponse({}, 401) : jsonResponse({});
		});
		const provider = await createProvider(requestService);

		await provider['getManagedSettings']([
			sessions[0],
			{ ...sessions[0], id: 'second-session' },
		], undefined);

		assert.strictEqual(requestService.requestCount, 2);
	});

	test('public GitHub issuer metadata does not classify the account as enterprise', async () => {
		const requestService = new TestRequestService(async () => jsonResponse({ chat_enabled: false }));
		const provider = await createProvider(requestService, {}, {}, undefined, { getSessions: async () => sessions });

		assert.deepStrictEqual({
			issuer: sessions[0].authorizationServer?.toString(),
			base: provider.resolveGitHubUrl(''),
			provider: provider.defaultAccount?.authenticationProvider,
			enterprise: provider.defaultAccount?.enterprise,
			hosts: requestService.requests.map(request => new URL(request.url!).hostname),
		}, {
			issuer: 'https://github.com/login/oauth',
			base: 'https://github.com/',
			provider: { id: 'github', name: 'GitHub', enterprise: false },
			enterprise: false,
			hosts: ['api.github.com'],
		});
	});

	test('matching authentication sessions are not duplicated by overlapping accepted scopes', async () => {
		const broadSession: AuthenticationSession = {
			...sessions[0],
			scopes: ['read:user', 'user:email', 'repo', 'workflow'],
		};
		const provider = await createProvider(
			new TestRequestService(async () => jsonResponse({})),
			{},
			{},
			'',
			{ getSessions: async () => [broadSession] }
		);

		const matching = await provider['findMatchingProviderSession']('github', [
			['read:user', 'user:email', 'repo', 'workflow'],
			['user:email'],
			['read:user'],
		]);

		assert.deepStrictEqual(matching?.map(session => session.id), ['session']);
	});

	test('first server response can establish and satisfy a refresh requirement', async () => {
		const requestService = new TestRequestService(async () => jsonResponse({
			forceRemoteSettingsRefresh: true,
		}));
		const provider = await createProvider(requestService);

		await provider['getManagedSettings'](sessions, undefined);

		assert.deepStrictEqual(describeFreshness(provider.managedSettingsFreshness), {
			state: ManagedSettingsFreshnessState.Satisfied,
			source: 'server',
			scope: {
				accountId,
				authenticationProviderId: 'github',
				endpointOrigin: 'https://api.github.com',
			},
			hasLastAttempt: true,
			hasSatisfiedAt: true,
		});
	});

	test('forced refresh remains pending until the live request completes', async () => {
		let resolveRequest!: (response: IRequestContext) => void;
		const response = new Promise<IRequestContext>(resolve => resolveRequest = resolve);
		const provider = await createProvider(new TestRequestService(() => response));

		const refresh = provider['getManagedSettings'](sessions, createCachedPolicy(true));
		await timeout(0);
		assert.deepStrictEqual(describeFreshness(provider.managedSettingsFreshness), {
			state: ManagedSettingsFreshnessState.Pending,
			source: 'server',
			hasLastAttempt: true,
			hasScope: true,
		});

		resolveRequest(jsonResponse({ forceRemoteSettingsRefresh: true }));
		await refresh;
		assert.strictEqual(provider.managedSettingsFreshness.state, ManagedSettingsFreshnessState.Satisfied);
	});

	for (const forceRefresh of [false, true]) {
		test(`${forceRefresh ? 'forced' : 'expired-cache'} background refresh preserves accepted policy while fetching`, async () => {
			const started = new DeferredPromise<void>();
			const response = new DeferredPromise<IRequestContext>();
			let delaySettings = false;
			const requestService = new TestRequestService(async options => {
				if (options.callSite === 'defaultAccount.entitlements') {
					return jsonResponse({ chat_enabled: true });
				}
				if (options.callSite === 'defaultAccount.managedSettings') {
					if (delaySettings) {
						started.complete();
						return response.p;
					}
					return jsonResponse({ forceRemoteSettingsRefresh: true, model: 'original-model' });
				}
				throw new Error(`Unexpected request: ${options.callSite}`);
			});
			const provider = await createProvider(requestService, {}, {}, undefined, { getSessions: async () => sessions });
			const accountService = disposables.add(new DefaultAccountService(TestProductService));
			accountService.setDefaultAccountProvider(provider);
			await accountService.refresh();
			const gateService = disposables.add(new AccountPolicyService(new NullLogService(), accountService));
			await gateService.whenInitialized();
			const gateStates: AccountPolicyGateState[] = [];
			disposables.add(gateService.onDidChangeGateInfo(info => gateStates.push(info.state)));

			if (!forceRefresh) {
				const policyData = provider['_policyData'];
				assert.ok(policyData);
				provider['setPolicyData']({
					...policyData,
					managedSettingsFetchedAt: Date.now() - 60 * 60 * 1000,
				});
			}
			const acceptedFreshness = provider.managedSettingsFreshness;
			delaySettings = true;
			const refresh = accountService.refresh({ forceRefresh });
			await started.p;
			const duringRefresh = {
				freshness: provider.managedSettingsFreshness,
				model: provider.policyData?.managedSettings?.model,
				gateState: gateService.gateInfo.state,
			};
			response.complete(jsonResponse({ forceRemoteSettingsRefresh: true, model: 'updated-model' }));
			await refresh;

			assert.deepStrictEqual({
				duringRefresh,
				afterRefresh: {
					freshness: provider.managedSettingsFreshness.state,
					model: provider.policyData?.managedSettings?.model,
					gateState: gateService.gateInfo.state,
				},
				gateStates,
			}, {
				duringRefresh: {
					freshness: acceptedFreshness,
					model: 'original-model',
					gateState: AccountPolicyGateState.Inactive,
				},
				afterRefresh: {
					freshness: ManagedSettingsFreshnessState.Satisfied,
					model: 'updated-model',
					gateState: AccountPolicyGateState.Inactive,
				},
				gateStates: [],
			});
		});
	}

	test('background refresh failure blocks until a live retry succeeds', async () => {
		let started = new DeferredPromise<void>();
		let response = new DeferredPromise<IRequestContext>();
		let delaySettings = false;
		const provider = await createProvider(new TestRequestService(async () => {
			if (delaySettings) {
				started.complete();
				return response.p;
			}
			return jsonResponse({ forceRemoteSettingsRefresh: true });
		}));
		const cachedPolicy = createCachedPolicy(true);
		await provider['getManagedSettings'](sessions, cachedPolicy);
		delaySettings = true;

		const refresh = provider['getManagedSettings'](sessions, cachedPolicy, { forceRefresh: true });
		await started.p;
		const duringRefresh = provider.managedSettingsFreshness.state;
		response.error(new Error('managed settings request timed out'));
		const failed = await refresh;
		const afterFailure = provider.managedSettingsFreshness;

		started = new DeferredPromise<void>();
		response = new DeferredPromise<IRequestContext>();
		const retry = provider['getManagedSettings'](sessions, cachedPolicy, { forceRefresh: true, retryManagedSettings: true });
		await started.p;
		const duringRetry = provider.managedSettingsFreshness.state;
		response.complete(jsonResponse({ forceRemoteSettingsRefresh: true }));
		await retry;

		assert.deepStrictEqual({
			duringRefresh,
			afterFailure: describeFreshness(afterFailure),
			retainedPolicy: failed.data,
			duringRetry,
			afterRetry: provider.managedSettingsFreshness.state,
		}, {
			duringRefresh: ManagedSettingsFreshnessState.Satisfied,
			afterFailure: {
				state: ManagedSettingsFreshnessState.Blocked,
				source: 'server',
				failure: ManagedSettingsFreshnessFailure.Network,
				hasLastAttempt: true,
				hasScope: true,
			},
			retainedPolicy: cachedPolicy.policyData,
			duringRetry: ManagedSettingsFreshnessState.Pending,
			afterRetry: ManagedSettingsFreshnessState.Satisfied,
		});
	});

	test('a satisfied refresh does not authorize a different account while fetching', async () => {
		const started = new DeferredPromise<void>();
		const response = new DeferredPromise<IRequestContext>();
		let delaySettings = false;
		const provider = await createProvider(new TestRequestService(async () => {
			if (delaySettings) {
				started.complete();
				return response.p;
			}
			return jsonResponse({});
		}), { [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true });
		await provider['getManagedSettings'](sessions, undefined);
		delaySettings = true;

		const refresh = provider['getManagedSettings']([
			{ ...sessions[0], account: { id: 'second-account', label: 'hubot' } },
		], undefined);
		await started.p;
		const duringRefresh = provider.managedSettingsFreshness.state;
		response.complete(jsonResponse({}));
		await refresh;

		assert.deepStrictEqual({
			duringRefresh,
			afterRefresh: provider.managedSettingsFreshness.state,
			account: provider.managedSettingsFreshness.state === ManagedSettingsFreshnessState.Satisfied
				? provider.managedSettingsFreshness.scope.accountId : undefined,
		}, {
			duringRefresh: ManagedSettingsFreshnessState.Pending,
			afterRefresh: ManagedSettingsFreshnessState.Satisfied,
			account: 'second-account',
		});
	});

	test('successful retry clears a blocked requirement when the server removes it', async () => {
		let requestCount = 0;
		const requestService = new TestRequestService(async () => {
			requestCount++;
			if (requestCount === 1) {
				throw new Error('managed settings unavailable');
			}
			return jsonResponse({});
		});
		const provider = await createProvider(requestService);
		const cachedPolicy = createCachedPolicy(true);

		const failed = await provider['getManagedSettings'](sessions, cachedPolicy);
		await provider['getManagedSettings'](sessions, {
			...cachedPolicy,
			policyData: failed.data ?? {},
			managedSettingsFetchedAt: failed.fetchedAt,
		}, { forceRefresh: true, retryManagedSettings: true });

		assert.deepStrictEqual({
			requestCount,
			freshness: provider.managedSettingsFreshness,
		}, {
			requestCount: 2,
			freshness: { state: ManagedSettingsFreshnessState.NotRequired },
		});
	});

	test('sign-out closes a satisfied native refresh gate', async () => {
		const requestService = new TestRequestService(async options => {
			if (options.url?.endsWith('/copilot_internal/user')) {
				return jsonResponse({ chat_enabled: true });
			}
			if (options.url?.includes('/copilot_internal/managed_settings')) {
				return jsonResponse({});
			}
			throw new Error(`Unexpected request: ${options.url}`);
		});
		const provider = await createProvider(requestService, { [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true });
		const account = await provider['getDefaultAccountFromAuthenticatedSessions'](
			{ id: 'github', name: 'GitHub', enterprise: false },
			sessions,
			{ forceRefresh: true }
		);
		assert.ok(account);
		provider['setDefaultAccount'](account);
		assert.strictEqual(provider.managedSettingsFreshness.state, ManagedSettingsFreshnessState.Satisfied);

		provider['setDefaultAccount'](null);

		assert.deepStrictEqual(provider.managedSettingsFreshness, {
			state: ManagedSettingsFreshnessState.Blocked,
			source: 'nativeMdm',
			failure: ManagedSettingsFreshnessFailure.NoToken,
		});
	});

	test('a failed session lookup keeps the signed-in account and satisfied refresh gate', () => runWithFakedTimers({}, async () => {
		let sessionLookupFails = false;
		const requestService = new TestRequestService(async options => {
			if (options.url?.endsWith('/copilot_internal/user')) {
				return jsonResponse({ chat_enabled: true });
			}
			if (options.url?.includes('/copilot_internal/managed_settings')) {
				return jsonResponse({ [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true });
			}
			throw new Error(`Unexpected request: ${options.url}`);
		});
		const provider = await createProvider(requestService, {}, {}, undefined, {
			getSessions: async () => {
				if (sessionLookupFails) {
					// Mirrors the extension host restart race: the provider's RPC is torn down mid-lookup.
					throw new CancellationError();
				}
				return sessions;
			},
		});
		const observedSessionIds: Array<string | null> = [];
		disposables.add(provider.onDidChangeDefaultAccount(account => observedSessionIds.push(account?.sessionId ?? null)));
		const snapshot = () => ({
			account: provider.defaultAccount?.sessionId,
			freshness: describeFreshness(provider.managedSettingsFreshness),
			forceRemoteSettingsRefresh: provider.policyData?.managedSettings?.[COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY],
		});
		const expected = () => ({
			account: 'session',
			freshness: {
				state: ManagedSettingsFreshnessState.Satisfied,
				source: 'server',
				scope: { accountId, authenticationProviderId: 'github', endpointOrigin: 'https://api.github.com' },
				hasLastAttempt: true,
				hasSatisfiedAt: true,
			},
			forceRemoteSettingsRefresh: true,
		});
		const beforeLookupFailure = snapshot();

		sessionLookupFails = true;
		await provider.refresh();

		assert.deepStrictEqual({
			beforeLookupFailure,
			afterLookupFailure: snapshot(),
			observedSessionIds,
		}, {
			beforeLookupFailure: expected(),
			afterLookupFailure: expected(),
			observedSessionIds: [],
		});
	}));

	test('a failed session lookup without a known account still reports a missing token', () => runWithFakedTimers({}, async () => {
		const provider = await createProvider(
			new TestRequestService(async options => {
				throw new Error(`Unexpected request: ${options.url}`);
			}),
			{ [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true },
			{},
			undefined,
			{
				getSessions: async () => {
					throw new CancellationError();
				},
			}
		);

		assert.deepStrictEqual({
			account: provider.defaultAccount,
			freshness: describeFreshness(provider.managedSettingsFreshness),
		}, {
			account: null,
			freshness: {
				state: ManagedSettingsFreshnessState.Blocked,
				source: 'nativeMdm',
				failure: ManagedSettingsFreshnessFailure.NoToken,
				hasLastAttempt: false,
			},
		});
	}));

	test('native false disables a cached server refresh requirement', async () => {
		const requestService = new TestRequestService(async () => {
			throw new Error('managed settings unavailable');
		});
		const provider = await createProvider(requestService, { [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: false });
		const cachedPolicy = createCachedPolicy(true);

		const result = await provider['getManagedSettings'](sessions, cachedPolicy);

		assert.deepStrictEqual({
			freshness: provider.managedSettingsFreshness,
			data: result.data,
		}, {
			freshness: { state: ManagedSettingsFreshnessState.NotRequired },
			data: cachedPolicy.policyData,
		});
	});

	test('file-delivered refresh requirement fails closed', async () => {
		const requestService = new TestRequestService(async () => jsonResponse({}, 503));
		const provider = await createProvider(requestService, {}, { [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true });

		await provider['getManagedSettings'](sessions, undefined);

		assert.deepStrictEqual(describeFreshness(provider.managedSettingsFreshness), {
			state: ManagedSettingsFreshnessState.Blocked,
			source: 'file',
			failure: ManagedSettingsFreshnessFailure.HttpError,
			httpStatus: 503,
			hasLastAttempt: true,
			hasScope: true,
		});
	});

	test('stale server scope cannot override a file-delivered refresh requirement', async () => {
		const requestService = new TestRequestService(async () => jsonResponse({}, 503));
		const provider = await createProvider(requestService, {}, { [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true });
		const cachedPolicy = {
			...createCachedPolicy(false),
			managedSettingsScope: {
				accountId,
				authenticationProviderId: 'github-enterprise',
				endpointOrigin: 'https://api.enterprise.example.com',
			},
		};

		await provider['getManagedSettings'](sessions, cachedPolicy);

		assert.deepStrictEqual(describeFreshness(provider.managedSettingsFreshness), {
			state: ManagedSettingsFreshnessState.Blocked,
			source: 'file',
			failure: ManagedSettingsFreshnessFailure.HttpError,
			httpStatus: 503,
			hasLastAttempt: true,
			hasScope: true,
		});
	});

	test('rate-limited forced refresh blocks automatic retries', async () => {
		const requestService = new TestRequestService(async () => jsonResponse({}, 429, { 'retry-after': '60' }));
		const provider = await createProvider(requestService, { [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true });

		await provider['getManagedSettings'](sessions, undefined);
		await provider['getManagedSettings'](sessions, undefined, { forceRefresh: true });
		provider['_rateLimitBackoffUntil'] = 0;
		await provider['getManagedSettings'](sessions, undefined, { forceRefresh: true, retryManagedSettings: true });

		assert.deepStrictEqual({
			requestCount: requestService.requestCount,
			freshness: describeFreshness(provider.managedSettingsFreshness),
		}, {
			requestCount: 2,
			freshness: {
				state: ManagedSettingsFreshnessState.Blocked,
				source: 'nativeMdm',
				failure: ManagedSettingsFreshnessFailure.RateLimited,
				hasLastAttempt: true,
				hasScope: true,
			},
		});
	});

	test('shared backoff does not permanently latch managed settings without an attempted request', async () => {
		const requestService = new TestRequestService(async () => jsonResponse({}));
		const provider = await createProvider(requestService);
		const cachedPolicy = createCachedPolicy(true);

		provider['_rateLimitBackoffUntil'] = Date.now() + 60_000;
		await provider['getManagedSettings'](sessions, cachedPolicy);
		provider['_rateLimitBackoffUntil'] = 0;
		await provider['getManagedSettings'](sessions, cachedPolicy);

		assert.deepStrictEqual({
			requestCount: requestService.requestCount,
			freshness: provider.managedSettingsFreshness,
		}, {
			requestCount: 1,
			freshness: { state: ManagedSettingsFreshnessState.NotRequired },
		});
	});

	test('malformed forced refresh response fails closed', async () => {
		const requestService = new TestRequestService(async () => ({
			res: { statusCode: 200, headers: {} },
			stream: bufferToStream(VSBuffer.fromString('{')),
		}));
		const provider = await createProvider(requestService, { [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true });

		await provider['getManagedSettings'](sessions, undefined);

		assert.deepStrictEqual(describeFreshness(provider.managedSettingsFreshness), {
			state: ManagedSettingsFreshnessState.Blocked,
			source: 'nativeMdm',
			failure: ManagedSettingsFreshnessFailure.Malformed,
			hasLastAttempt: true,
			hasScope: true,
		});
	});

	test('forced refresh without an endpoint fails closed', async () => {
		const provider = await createProvider(new TestRequestService(async () => jsonResponse({})), { [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true }, {}, '');

		await provider['getManagedSettings'](sessions, undefined);

		assert.deepStrictEqual(describeFreshness(provider.managedSettingsFreshness), {
			state: ManagedSettingsFreshnessState.Blocked,
			source: 'nativeMdm',
			failure: ManagedSettingsFreshnessFailure.NoUrl,
			hasLastAttempt: false,
		});
	});

	test('scoped cached server requirement fails closed when the endpoint is missing', async () => {
		const provider = await createProvider(new TestRequestService(async () => jsonResponse({})), {}, {}, '');
		const cachedPolicy = {
			...createCachedPolicy(true),
			managedSettingsScope: {
				accountId,
				authenticationProviderId: 'github',
				endpointOrigin: 'https://api.github.com',
			},
		};

		await provider['getManagedSettings'](sessions, cachedPolicy);

		assert.deepStrictEqual(describeFreshness(provider.managedSettingsFreshness), {
			state: ManagedSettingsFreshnessState.Blocked,
			source: 'server',
			failure: ManagedSettingsFreshnessFailure.NoUrl,
			hasLastAttempt: false,
		});
	});

	test('re-enabled refresh requirement restores the prior blocked state', async () => {
		const requestService = new TestRequestService(async () => {
			throw new Error('managed settings unavailable');
		});
		const provider = await createProvider(requestService, { [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true });

		await provider['getManagedSettings'](sessions, undefined);
		provider['setManagedSettingsFreshness']({ state: ManagedSettingsFreshnessState.NotRequired });
		await provider['getManagedSettings'](sessions, undefined, { forceRefresh: true });

		assert.deepStrictEqual({
			requestCount: requestService.requestCount,
			freshness: describeFreshness(provider.managedSettingsFreshness),
		}, {
			requestCount: 1,
			freshness: {
				state: ManagedSettingsFreshnessState.Blocked,
				source: 'nativeMdm',
				failure: ManagedSettingsFreshnessFailure.Network,
				hasLastAttempt: true,
				hasScope: true,
			},
		});
	});

	test('forced refresh without authentication fails closed but leaves sign-in available', async () => {
		const provider = await createProvider(new TestRequestService(async () => jsonResponse({})), { [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true });
		await provider.refresh();

		assert.deepStrictEqual(describeFreshness(provider.managedSettingsFreshness), {
			state: ManagedSettingsFreshnessState.Blocked,
			source: 'nativeMdm',
			failure: ManagedSettingsFreshnessFailure.NoToken,
			hasLastAttempt: false,
		});
	});

	test('failed fetches retain the last successful managed settings without renewing them', async () => {
		const failures: { name: string; response: () => IRequestContext }[] = [
			{ name: 'no response', response: () => { throw new Error('managed settings unavailable'); } },
			{ name: '401', response: () => jsonResponse({}, 401) },
			{ name: '403', response: () => jsonResponse({}, 403) },
		];
		const freshlyCached = createCachedPolicy(false);
		const staleFetchedAt = Date.now() - 7 * 24 * 60 * 60 * 1000; // long past the one-hour cache boundary
		const outcomes = [];

		for (const failure of failures) {
			const provider = await createProvider(new TestRequestService(async () => failure.response()));
			const whileFresh = await provider['getManagedSettings'](sessions, freshlyCached, { forceRefresh: true });
			const onceStale = await provider['getManagedSettings'](
				sessions,
				{ ...freshlyCached, managedSettingsFetchedAt: staleFetchedAt },
				{ forceRefresh: true }
			);
			outcomes.push({
				name: failure.name,
				whileFresh: { data: whileFresh.data, fetchedAt: whileFresh.fetchedAt },
				onceStale: { data: onceStale.data, fetchedAt: onceStale.fetchedAt },
			});
		}

		// Only an affirmative service answer withdraws policy, and a failure never renews the cached timestamp.
		assert.deepStrictEqual(outcomes, failures.map(failure => ({
			name: failure.name,
			whileFresh: { data: freshlyCached.policyData, fetchedAt: freshlyCached.managedSettingsFetchedAt },
			onceStale: { data: freshlyCached.policyData, fetchedAt: staleFetchedAt },
		})));
	});

	test('transient failure does not clear an update-required state', async () => {
		let requestCount = 0;
		const requestService = new TestRequestService(async () => {
			requestCount++;
			if (requestCount === 1) {
				return jsonResponse({ error_code: 'client_update_required', client_id: 'vscode' }, 466);
			}
			throw new Error('managed settings unavailable');
		});
		const provider = await createProvider(requestService);
		const cachedPolicy = createCachedPolicy(false);

		await provider['getManagedSettings'](sessions, cachedPolicy, { forceRefresh: true });
		const result = await provider['getManagedSettings'](sessions, cachedPolicy, { forceRefresh: true });

		assert.deepStrictEqual({
			status: provider.managedSettingsFetchStatus,
			data: result.data,
			compatibilityError: provider.managedSettingsCompatibilityError,
		}, {
			status: 'no-response',
			data: { managedSettings: undefined },
			compatibilityError: { errorCode: 'client_update_required' },
		});
	});

	test('successful full refresh clears a prior update-required state', async () => {
		const requestService = new TestRequestService(async options => {
			if (options.url?.endsWith('/copilot_internal/user')) {
				return jsonResponse({ chat_enabled: true });
			}
			if (options.url?.includes('/copilot_internal/managed_settings')) {
				return jsonResponse({});
			}
			throw new Error(`Unexpected request: ${options.url}`);
		});
		const provider = await createProvider(requestService);
		provider['setManagedSettingsCompatibilityError']({ errorCode: 'client_update_required' });

		const account = await provider['getDefaultAccountFromAuthenticatedSessions'](
			{ id: 'github', name: 'GitHub', enterprise: false },
			sessions,
			{ forceRefresh: true }
		);
		assert.ok(account);
		provider['setDefaultAccount'](account);

		assert.deepStrictEqual({
			compatibilityError: provider.managedSettingsCompatibilityError,
			managedSettings: provider.policyData?.managedSettings,
		}, {
			compatibilityError: null,
			managedSettings: {},
		});
	});

	test('reconciles a replacement without a signed-out gap and preserves removal-only behavior', async () => {
		const sessionChanges = disposables.add(new Emitter<{ providerId: string; label: string; event: AuthenticationSessionsChangeEvent }>());
		let authenticationSessions = sessions;
		const provider = await createProvider(
			new TestRequestService(async () => jsonResponse({ chat_enabled: true })),
			{},
			{},
			'',
			{
				getSessions: async () => authenticationSessions,
				onDidChangeSessions: sessionChanges.event,
			}
		);
		const observedSessionIds: Array<string | null> = [];
		disposables.add(provider.onDidChangeDefaultAccount(account => observedSessionIds.push(account?.sessionId ?? null)));
		const replacementSession = { ...sessions[0], id: 'replacement-session', accessToken: 'replacement-token' };
		authenticationSessions = [replacementSession];
		const beforeReplacement = provider.defaultAccount?.sessionId;
		const replacement = Event.toPromise(Event.filter(
			provider.onDidChangeDefaultAccount,
			account => account?.sessionId === replacementSession.id
		));

		sessionChanges.fire({
			providerId: 'github',
			label: 'GitHub',
			event: { added: [replacementSession], removed: sessions, changed: [] },
		});
		const afterReplacementEvent = provider.defaultAccount?.sessionId;
		const afterReplacement = (await replacement)?.sessionId;

		authenticationSessions = [];
		sessionChanges.fire({
			providerId: 'github',
			label: 'GitHub',
			event: { added: [], removed: [replacementSession], changed: [] },
		});

		assert.deepStrictEqual({
			beforeReplacement,
			afterReplacementEvent,
			afterReplacement,
			afterRemovalOnlyEvent: provider.defaultAccount?.sessionId,
			observedSessionIds,
		}, {
			beforeReplacement: 'session',
			afterReplacementEvent: 'session',
			afterReplacement: 'replacement-session',
			afterRemovalOnlyEvent: undefined,
			observedSessionIds: ['replacement-session', null],
		});
	});

	test('does not restore a removed session from an in-flight replacement refresh', async () => {
		const sessionChanges = disposables.add(new Emitter<{ providerId: string; label: string; event: AuthenticationSessionsChangeEvent }>());
		const refreshStarted = new DeferredPromise<void>();
		const releaseRefresh = new DeferredPromise<IRequestContext>();
		let authenticationSessions = sessions;
		let blockRefresh = false;
		const provider = await createProvider(
			new TestRequestService(async options => {
				if (blockRefresh && options.callSite === 'defaultAccount.entitlements') {
					refreshStarted.complete();
					return releaseRefresh.p;
				}
				return jsonResponse({ chat_enabled: true });
			}),
			{},
			{},
			'',
			{
				getSessions: async () => authenticationSessions,
				onDidChangeSessions: sessionChanges.event,
			}
		);
		const observedSessionIds: Array<string | null> = [];
		disposables.add(provider.onDidChangeDefaultAccount(account => observedSessionIds.push(account?.sessionId ?? null)));
		const replacementSession = { ...sessions[0], accessToken: 'replacement-token' };
		authenticationSessions = [replacementSession];
		blockRefresh = true;

		sessionChanges.fire({
			providerId: 'github',
			label: 'GitHub',
			event: { added: [replacementSession], removed: sessions, changed: [] },
		});
		const replacementRefresh = provider.refresh({ forceRefresh: true });
		await refreshStarted.p;

		authenticationSessions = [];
		sessionChanges.fire({
			providerId: 'github',
			label: 'GitHub',
			event: { added: [], removed: [replacementSession], changed: [] },
		});
		const afterRemoval = provider.defaultAccount?.sessionId;
		releaseRefresh.complete(jsonResponse({ chat_enabled: false }));
		await replacementRefresh;

		assert.deepStrictEqual({
			afterRemoval,
			afterBlockedRefresh: provider.defaultAccount?.sessionId,
			observedSessionIds,
		}, {
			afterRemoval: undefined,
			afterBlockedRefresh: undefined,
			observedSessionIds: [null],
		});
	});

	test('signed-out URL availability depends on the authentication provider, not enrollment configuration', async () => {
		const outcomes = [];
		for (const enterprise of [false, true]) {
			const configuration = enterprise ? enterpriseConfiguration() : new TestConfigurationService();
			await configuration.setUserConfiguration('github-enterprise.uri', 'https://enrollment.ghe.com');
			const provider = await createProvider(new TestRequestService(async () => jsonResponse({})), {}, {}, undefined, {}, configuration);
			outcomes.push({
				base: provider.resolveGitHubUrl(''),
				settings: provider.resolveGitHubUrl('settings/copilot'),
			});
		}

		assert.deepStrictEqual(outcomes, [
			{ base: 'https://github.com/', settings: 'https://github.com/settings/copilot' },
			{ base: undefined, settings: undefined },
		]);
	});

	test('enterprise URLs use the selected issuer and retain their source-specific mapping regardless of settings', async () => {
		const cases = [
			{ issuer: 'https://b.ghe.com/login/oauth', enrollment: undefined, base: 'https://b.ghe.com/', api: 'https://api.b.ghe.com' },
			{ issuer: 'https://b.ghe.com/login/oauth', enrollment: 'https://other.ghe.com', base: 'https://b.ghe.com/', api: 'https://api.b.ghe.com' },
			{ issuer: 'http://ghe.local:8080/login/oauth', enrollment: 'https://other.ghe.com', base: 'http://ghe.local:8080/', api: 'http://api.ghe.local:8080' },
			{ issuer: 'https://B.GHE.COM:443/Team/login/oauth', enrollment: undefined, base: 'https://b.ghe.com/', api: 'https://api.b.ghe.com' },
		];
		const paths = ['/copilot_internal/user', '/copilot_internal/v2/token', '/copilot_internal/managed_settings', '/copilot/mcp_registry'];
		const outcomes = [];
		for (const { issuer, enrollment } of cases) {
			const selected = { ...enterpriseSession('b'), authorizationServer: URI.parse(issuer) };
			const configuration = enterpriseConfiguration();
			await configuration.setUserConfiguration('github-enterprise.uri', enrollment);
			const requestService = new TestRequestService(enterpriseResponse);
			const provider = await createProvider(requestService, {}, {}, undefined, { getSessions: async () => [selected] }, configuration);
			outcomes.push({
				settings: provider.resolveGitHubUrl('settings/copilot'),
				tokenStamp: provider.copilotTokenInfo?.st,
				requests: requestService.requests.map(request => ({ url: request.url?.split('?')[0], token: request.headers?.Authorization })),
			});
		}

		assert.deepStrictEqual(outcomes, cases.map(({ base, api }) => ({
			settings: `${base}settings/copilot`,
			tokenStamp: 'proxima',
			requests: paths.map(path => ({ url: `${api}${path}`, token: 'Bearer b-token' })),
		})));
	});

	test('enterprise scope retries never send another host token to the selected endpoint', async () => {
		const selected = enterpriseSession('b');
		const otherHost = enterpriseSession('a');
		const broader = { ...selected, id: 'b-broad', accessToken: 'b-broad-token', scopes: ['user:email', 'repo'] };
		const requestService = new TestRequestService(async request => request.headers?.Authorization === 'Bearer b-token' ? jsonResponse({}, 401) : enterpriseResponse(request));
		await createProvider(requestService, {}, {}, undefined, {
			getSessions: async () => [selected, otherHost, broader],
		}, enterpriseConfiguration());

		assert.deepStrictEqual(requestService.requests.map(request => ({
			host: new URL(request.url!).hostname, token: request.headers?.Authorization,
		})), [
			{ host: 'api.b.ghe.com', token: 'Bearer b-token' },
			{ host: 'api.b.ghe.com', token: 'Bearer b-broad-token' },
			{ host: 'api.b.ghe.com', token: 'Bearer b-token' },
			{ host: 'api.b.ghe.com', token: 'Bearer b-token' },
			{ host: 'api.b.ghe.com', token: 'Bearer b-broad-token' },
			{ host: 'api.b.ghe.com', token: 'Bearer b-broad-token' },
			{ host: 'api.b.ghe.com', token: 'Bearer b-token' },
			{ host: 'api.b.ghe.com', token: 'Bearer b-broad-token' },
		]);
	});

	test('enterprise endpoint and token pairing survives an authentication-provider switch during a request', async () => {
		const configuration = enterpriseConfiguration();
		const requestService = new TestRequestService(async request => {
			if (request.callSite === 'defaultAccount.entitlements') {
				await configuration.setUserConfiguration('github.copilot.advanced.authProvider', undefined);
			}
			return enterpriseResponse(request);
		});
		const provider = await createProvider(requestService, {}, {}, undefined, { getSessions: async () => [enterpriseSession('b')] }, configuration);

		assert.deepStrictEqual({
			provider: provider.defaultAccount?.authenticationProvider.id,
			requests: requestService.requests.map(request => ({ host: new URL(request.url!).hostname, token: request.headers?.Authorization })),
		}, {
			provider: 'github-enterprise',
			requests: Array.from({ length: 4 }, () => ({ host: 'api.b.ghe.com', token: 'Bearer b-token' })),
		});
	});

	test('missing or invalid enterprise provenance never falls back to enrollment configuration', async () => {
		const outcomes = [];
		for (const authorizationServer of [undefined, URI.parse('https://github.com/login/oauth'), URI.parse('https://a.ghe.com/not-an-oauth-server')]) {
			const configuration = enterpriseConfiguration();
			await configuration.setUserConfiguration('github-enterprise.uri', 'https://enrollment.ghe.com');
			const requestService = new TestRequestService(async () => jsonResponse({ chat_enabled: false }));
			const provider = await createProvider(requestService, {}, {}, undefined, {
				getSessions: async () => [{ ...sessions[0], authorizationServer }],
			}, configuration);
			outcomes.push({
				account: provider.defaultAccount,
				base: provider.resolveGitHubUrl(''),
				requests: requestService.requestCount,
			});
		}
		assert.deepStrictEqual(outcomes, Array.from({ length: 3 }, () => ({
			account: null,
			base: undefined,
			requests: 0,
		})));
	});

	test('changing the Copilot provider reconciles existing accounts without authentication events', () => runWithFakedTimers({}, async () => {
		const configuration = enterpriseConfiguration();
		const enterprise = enterpriseSession('b');
		const requestService = new TestRequestService(enterpriseResponse);
		const provider = await createProvider(requestService, { [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true }, {}, undefined, {
			getSessions: async providerId => providerId === 'github' ? sessions : [enterprise],
		}, configuration);
		const snapshot = () => {
			const freshness = provider.managedSettingsFreshness;
			return {
				provider: provider.defaultAccount?.authenticationProvider.id,
				session: provider.defaultAccount?.sessionId,
				policy: provider.policyData?.managedSettings,
				scope: freshness.state === ManagedSettingsFreshnessState.NotRequired ? undefined : freshness.scope,
				freshness: freshness.state,
			};
		};
		const outcomes = [snapshot()];
		const key = 'github.copilot.advanced.authProvider';
		for (const value of [undefined, 'github-enterprise']) {
			await changeConfiguration(configuration, key, value);
			await timeout(200);
			outcomes.push(snapshot());
		}

		assert.deepStrictEqual({
			outcomes,
			requests: requestService.requests.filter(request => request.callSite === 'defaultAccount.managedSettings').map(request => ({
				host: new URL(request.url!).hostname,
				token: request.headers?.Authorization,
			})),
		}, {
			outcomes: [
				{
					provider: 'github-enterprise', session: enterprise.id,
					policy: { model: 'api.b.ghe.com' },
					scope: { accountId, authenticationProviderId: 'github-enterprise', endpointOrigin: 'https://api.b.ghe.com' },
					freshness: ManagedSettingsFreshnessState.Satisfied,
				},
				{
					provider: 'github', session: sessions[0].id,
					policy: { model: 'api.github.com' },
					scope: { accountId, authenticationProviderId: 'github', endpointOrigin: 'https://api.github.com' },
					freshness: ManagedSettingsFreshnessState.Satisfied,
				},
				{
					provider: 'github-enterprise', session: enterprise.id,
					policy: { model: 'api.b.ghe.com' },
					scope: { accountId, authenticationProviderId: 'github-enterprise', endpointOrigin: 'https://api.b.ghe.com' },
					freshness: ManagedSettingsFreshnessState.Satisfied,
				},
			],
			requests: [
				{ host: 'api.b.ghe.com', token: `Bearer ${enterprise.accessToken}` },
				{ host: 'api.github.com', token: `Bearer ${sessions[0].accessToken}` },
				{ host: 'api.b.ghe.com', token: `Bearer ${enterprise.accessToken}` },
			],
		});
	}));

	test('parent-key configuration events reconcile only effective Copilot provider changes', () => runWithFakedTimers({}, async () => {
		const configuration = new TestConfigurationService({
			github: { copilot: { advanced: { authProvider: 'github-enterprise' } } },
		});
		const enterprise = enterpriseSession('b');
		let sessionLookups = 0;
		const provider = await createProvider(new TestRequestService(enterpriseResponse), {}, {}, undefined, {
			getSessions: async id => {
				sessionLookups++;
				return id === 'github' ? sessions : [enterprise];
			},
		}, configuration);
		const outcomes = [];
		for (const authProvider of [undefined, 'github', 'github-enterprise', 'github-enterprise']) {
			const lookupsBefore = sessionLookups;
			const contents = { github: { copilot: { advanced: { authProvider, unrelated: String(lookupsBefore) } } } };
			await configuration.setUserConfiguration('github', contents.github);
			const empty = { contents: {}, keys: [], overrides: [] };
			const logService = new NullLogService();
			const currentConfiguration = Configuration.parse({
				defaults: empty, policy: empty, application: empty, userRemote: empty, workspace: empty, folders: [],
				userLocal: { contents, keys: ['github.copilot.advanced'], overrides: [] },
			}, logService);
			const event = new ConfigurationChangeEvent(
				{ keys: ['github.copilot.advanced'], overrides: [] }, undefined, currentConfiguration, undefined, logService);
			event.source = ConfigurationTarget.USER;
			configuration.onDidChangeConfigurationEmitter.fire(event);
			await timeout(200);
			outcomes.push({
				matchesNestedKey: event.affectsConfiguration('github.copilot.advanced.authProvider'),
				provider: provider.defaultAccount?.authenticationProvider.id,
				session: provider.defaultAccount?.sessionId,
				policy: provider.policyData?.managedSettings,
				refreshed: sessionLookups > lookupsBefore,
			});
		}

		assert.deepStrictEqual(outcomes, [
			{ matchesNestedKey: false, provider: 'github', session: sessions[0].id, policy: { model: 'api.github.com' }, refreshed: true },
			{ matchesNestedKey: false, provider: 'github', session: sessions[0].id, policy: { model: 'api.github.com' }, refreshed: false },
			{ matchesNestedKey: false, provider: 'github-enterprise', session: enterprise.id, policy: { model: 'api.b.ghe.com' }, refreshed: true },
			{ matchesNestedKey: false, provider: 'github-enterprise', session: enterprise.id, policy: { model: 'api.b.ghe.com' }, refreshed: false },
		]);
	}));

	for (const providerId of ['github', 'github-enterprise']) {
		test(`unrelated configuration changes leave the single ${providerId} account unchanged`, () => runWithFakedTimers({}, async () => {
			const configuration = providerId === 'github' ? new TestConfigurationService() : enterpriseConfiguration();
			const session = providerId === 'github' ? sessions[0] : enterpriseSession('b');
			const requestService = new TestRequestService(enterpriseResponse);
			const provider = await createProvider(requestService, {}, {}, undefined, {
				getSessions: async id => id === providerId ? [session] : [],
			}, configuration);
			const account = provider.defaultAccount;
			const requests = [...requestService.requests];

			await changeConfiguration(configuration, 'github.copilot.advanced.unrelated', 'changed');
			await timeout(200);

			assert.deepStrictEqual({
				provider: provider.defaultAccount?.authenticationProvider.id,
				session: provider.defaultAccount?.sessionId,
				sameAccount: provider.defaultAccount === account,
				requests: requestService.requests,
			}, { provider: providerId, session: session.id, sameAccount: true, requests });
		}));
	}

	test('a failed policy fetch after a provider change cannot reuse the previous provider freshness or policy', () => runWithFakedTimers({}, async () => {
		const configuration = enterpriseConfiguration();
		const enterprise = enterpriseSession('b');
		const requestService = new TestRequestService(async request =>
			request.callSite === 'defaultAccount.managedSettings' && new URL(request.url!).hostname === 'api.github.com'
				? jsonResponse({}, 503)
				: enterpriseResponse(request));
		const provider = await createProvider(requestService, { [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true }, {}, undefined, {
			getSessions: async id => id === 'github' ? sessions : [enterprise],
		}, configuration);

		await changeConfiguration(configuration, 'github.copilot.advanced.authProvider', undefined);
		await timeout(200);

		assert.deepStrictEqual({
			provider: provider.defaultAccount?.authenticationProvider.id,
			session: provider.defaultAccount?.sessionId,
			policy: provider.policyData?.managedSettings,
			freshness: { ...provider.managedSettingsFreshness, lastAttemptAt: undefined },
		}, {
			provider: 'github',
			session: sessions[0].id,
			policy: undefined,
			freshness: {
				state: ManagedSettingsFreshnessState.Blocked,
				source: 'nativeMdm',
				scope: { accountId, authenticationProviderId: 'github', endpointOrigin: 'https://api.github.com' },
				failure: ManagedSettingsFreshnessFailure.HttpError,
				httpStatus: 503,
				lastAttemptAt: undefined,
			},
		});
	}));

	test('a changed issuer refreshes the selected native account cache without configuration changes', async () => {
		let currentSession = enterpriseSession('a');
		const sessionChanges = disposables.add(new Emitter<{ providerId: string; label: string; event: AuthenticationSessionsChangeEvent }>());
		const requestService = new TestRequestService(enterpriseResponse);
		const provider = await createProvider(requestService, {}, {}, undefined, {
			getSessions: async () => [currentSession],
			onDidChangeSessions: sessionChanges.event,
		}, enterpriseConfiguration());
		const beforeChange = requestService.requestCount;
		const changed = Event.toPromise(provider.onDidChangeDefaultAccount);

		currentSession = { ...currentSession, authorizationServer: URI.parse('https://b.ghe.com/login/oauth') };
		sessionChanges.fire({ providerId: 'github-enterprise', label: 'GitHub Enterprise', event: { added: [], removed: [], changed: [currentSession] } });
		await changed;

		assert.deepStrictEqual({
			base: provider.resolveGitHubUrl(''),
			account: provider.defaultAccount?.accountName,
			session: provider.defaultAccount?.sessionId,
			policy: provider.policyData?.managedSettings,
			hosts: requestService.requests.slice(beforeChange).map(request => new URL(request.url!).hostname),
		}, {
			base: 'https://b.ghe.com/',
			account: 'octocat',
			session: 'a-session',
			policy: { model: 'api.b.ghe.com' },
			hosts: Array.from({ length: 4 }, () => 'api.b.ghe.com'),
		});
	});

	test('MCP registry policy survives failed refreshes and is cleared only by an affirmative answer', async () => {
		const refreshWithRegistryResponse = async (registryResponse: () => IRequestContext) => {
			let useRegistryResponse = false;
			const requestService = new TestRequestService(async request => useRegistryResponse && request.callSite === 'defaultAccount.mcpRegistryProvider' ? registryResponse() : enterpriseResponse(request));
			const provider = await createProvider(requestService, {}, {}, undefined, { getSessions: async () => [enterpriseSession('b')] }, enterpriseConfiguration());
			const fetchedAt = provider['_policyData']?.mcpRegistryDataFetchedAt;
			useRegistryResponse = true;
			await provider.refresh({ forceRefresh: true });
			return {
				url: provider.policyData?.mcpRegistryUrl,
				access: provider.policyData?.mcpAccess,
				keptFetchedAt: fetchedAt !== undefined && provider['_policyData']?.mcpRegistryDataFetchedAt === fetchedAt,
			};
		};
		const failures: { name: string; response: () => IRequestContext }[] = [
			{ name: 'no response', response: () => { throw new Error('MCP registry unavailable'); } },
			{ name: 'malformed', response: () => jsonResponse({}) },
			{ name: '401', response: () => jsonResponse({}, 401) },
			{ name: '403', response: () => jsonResponse({}, 403) },
			{ name: '429', response: () => jsonResponse({}, 429) },
			{ name: '500', response: () => jsonResponse({}, 500) },
		];
		const answers: { name: string; response: () => IRequestContext }[] = [
			{ name: '404', response: () => jsonResponse({}, 404) },
			{ name: 'no registries', response: () => jsonResponse({ mcp_registries: [] }) },
		];

		const outcomes = [];
		for (const { name, response } of failures) {
			outcomes.push({ name, ...await refreshWithRegistryResponse(response) });
		}
		for (const { name, response } of answers) {
			const { url, access } = await refreshWithRegistryResponse(response);
			outcomes.push({ name, url, access });
		}

		// A failure keeps the last known registry policy and its original timestamp; only an answer from the service clears it.
		assert.deepStrictEqual(outcomes, [
			...failures.map(({ name }) => ({ name, url: 'https://registry.example.test', access: 'registry_only', keptFetchedAt: true })),
			...answers.map(({ name }) => ({ name, url: undefined, access: undefined })),
		]);
	});

	test('losing the account keeps cached policy only while a server-delivered refresh requirement is blocking', async () => {
		const signOutOutcome = async (nativeManagedSettings: ManagedSettingsData, managedSettingsResponse: object) => {
			const requestService = new TestRequestService(async options => {
				if (options.url?.endsWith('/copilot_internal/user')) {
					return jsonResponse({ chat_enabled: true });
				}
				if (options.url?.includes('/copilot_internal/managed_settings')) {
					return jsonResponse(managedSettingsResponse);
				}
				throw new Error(`Unexpected request: ${options.url}`);
			});
			const provider = await createProvider(requestService, nativeManagedSettings);
			const account = await provider['getDefaultAccountFromAuthenticatedSessions'](
				{ id: 'github', name: 'GitHub', enterprise: false },
				sessions,
				{ forceRefresh: true }
			);
			assert.ok(account);
			provider['setDefaultAccount'](account);
			const hadPolicyData = provider.policyData !== null;

			provider['setDefaultAccount'](null);

			return {
				hadPolicyData,
				retainedPolicyData: provider.policyData?.managedSettings?.['permissions.disableBypassPermissionsMode'] ?? provider.policyData,
				freshness: describeFreshness(provider.managedSettingsFreshness),
			};
		};

		assert.deepStrictEqual({
			serverRequirement: await signOutOutcome({}, { forceRemoteSettingsRefresh: true, permissions: { disableBypassPermissionsMode: 'disable' } }),
			nativeRequirement: await signOutOutcome({ [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true }, {}),
			noRequirement: await signOutOutcome({}, {}),
		}, {
			serverRequirement: {
				hadPolicyData: true,
				retainedPolicyData: 'disable',
				freshness: { state: ManagedSettingsFreshnessState.Blocked, source: 'server', failure: ManagedSettingsFreshnessFailure.NoToken, hasLastAttempt: false },
			},
			nativeRequirement: {
				hadPolicyData: true,
				retainedPolicyData: null,
				freshness: { state: ManagedSettingsFreshnessState.Blocked, source: 'nativeMdm', failure: ManagedSettingsFreshnessFailure.NoToken, hasLastAttempt: false },
			},
			noRequirement: {
				hadPolicyData: true,
				retainedPolicyData: null,
				freshness: { state: ManagedSettingsFreshnessState.NotRequired },
			},
		});
	});

	function enterpriseSession(host: string): AuthenticationSession {
		return {
			...sessions[0],
			id: `${host}-session`,
			accessToken: `${host}-token`,
			authorizationServer: URI.parse(`https://${host}.ghe.com/login/oauth`),
		};
	}

	function enterpriseConfiguration(): TestConfigurationService {
		return new TestConfigurationService({
			'github.copilot.advanced.authProvider': 'github-enterprise',
		});
	}

	async function enterpriseResponse(request: IRequestOptions): Promise<IRequestContext> {
		switch (request.callSite) {
			case 'defaultAccount.entitlements': return jsonResponse({ chat_enabled: true });
			case 'defaultAccount.tokenEntitlements': return jsonResponse({ token: 'mcp=1;sn=test;st=proxima:signature' });
			case 'defaultAccount.managedSettings': return jsonResponse({ model: new URL(request.url!).hostname });
			case 'defaultAccount.mcpRegistryProvider': return jsonResponse({ mcp_registries: [{ url: 'https://registry.example.test', registry_access: 'registry_only' }] });
			default: throw new Error(`Unexpected request: ${request.callSite}`);
		}
	}

	async function changeConfiguration(configuration: TestConfigurationService, key: string, value: string | undefined): Promise<void> {
		await configuration.setUserConfiguration(key, value);
		configuration.onDidChangeConfigurationEmitter.fire({
			source: ConfigurationTarget.USER,
			affectedKeys: new Set([key]),
			change: { keys: [key], overrides: [] },
			affectsConfiguration: section => section === key,
		});
	}

	async function createProvider(
		requestService: TestRequestService,
		nativeManagedSettings: ManagedSettingsData = {},
		fileManagedSettings: ManagedSettingsData = {},
		managedSettingsUrl = 'https://api.github.com/copilot_internal/managed_settings',
		authenticationServiceOverrides: Partial<IAuthenticationService> = {},
		configurationService = new TestConfigurationService(),
	): Promise<DefaultAccountProvider> {
		const instantiationService = disposables.add(new TestInstantiationService());
		disposables.add(configurationService.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IAuthenticationService, {
			declaredProviders: [],
			isAuthenticationProviderRegistered: () => true,
			getAccounts: async () => [],
			getSessions: async () => [],
			onDidChangeDeclaredProviders: Event.None,
			onDidChangeSessions: Event.None,
			onDidRegisterAuthenticationProvider: Event.None,
			onDidUnregisterAuthenticationProvider: Event.None,
			...authenticationServiceOverrides,
		});
		instantiationService.stub(IAuthenticationExtensionsService, {
			getAccountPreference: () => undefined,
			onDidChangeAccountPreference: Event.None,
		});
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IExtensionService, {});
		instantiationService.stub(IRequestService, requestService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IWorkbenchEnvironmentService, {
			remoteAuthority: isWeb ? 'test-remote' : undefined,
			isSessionsWindow: false,
		});
		instantiationService.stub(IProductService, {
			...TestProductService,
			version: '1.132.0',
			copilotVersions: { runtime: '0.0.344', sdk: '0.1.0' },
		});
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
		instantiationService.stub(IHostService, {
			hasFocus: true,
			onDidChangeFocus: Event.None,
		});
		instantiationService.stub(ICommandService, {});
		instantiationService.stub(INativeManagedSettingsService, {
			_serviceBrand: undefined,
			managedSettings: nativeManagedSettings,
			onDidChangeManagedSettings: Event.None,
			initialize: async () => nativeManagedSettings,
			updatePolicyDefinitions: async () => nativeManagedSettings,
		});
		instantiationService.stub(IFileManagedSettingsService, {
			_serviceBrand: undefined,
			rawManagedSettings: fileManagedSettings,
			managedSettings: fileManagedSettings,
			onDidChangeRawManagedSettings: Event.None,
			onDidChangeManagedSettings: Event.None,
			initialize: async () => fileManagedSettings,
		});

		const provider = disposables.add(instantiationService.createInstance(DefaultAccountProvider, {
			preferredExtensions: [],
			authenticationProvider: {
				default: { id: 'github', name: 'GitHub' },
				enterprise: { id: 'github-enterprise', name: 'GitHub Enterprise' },
				enterpriseProviderConfig: 'github.copilot.advanced.authProvider',
				scopes: [['user:email']],
			},
			tokenEntitlementUrl: '',
			entitlementUrl: 'https://api.github.com/copilot_internal/user',
			mcpRegistryDataUrl: '',
			managedSettingsUrl,
		}));
		await provider.refresh();
		return provider;
	}

	function createCachedPolicy(forceRemoteSettingsRefresh: boolean) {
		return {
			accountId,
			policyData: {
				managedSettings: {
					[COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: forceRemoteSettingsRefresh,
					'permissions.disableBypassPermissionsMode': 'disable',
				},
			},
			managedSettingsFetchedAt: Date.now(),
		};
	}

	function describeFreshness(freshness: IManagedSettingsFreshness): object {
		if (freshness.state === ManagedSettingsFreshnessState.Satisfied) {
			const { lastAttemptAt, satisfiedAt, ...rest } = freshness;
			return { ...rest, hasLastAttempt: lastAttemptAt !== undefined, hasSatisfiedAt: satisfiedAt !== undefined };
		}
		if (freshness.state === ManagedSettingsFreshnessState.Pending) {
			const { lastAttemptAt, scope, ...rest } = freshness;
			return { ...rest, hasLastAttempt: lastAttemptAt !== undefined, ...(scope ? { hasScope: true } : {}) };
		}
		if (freshness.state === ManagedSettingsFreshnessState.Blocked) {
			const { lastAttemptAt, scope, ...rest } = freshness;
			return { ...rest, hasLastAttempt: lastAttemptAt !== undefined, ...(scope ? { hasScope: true } : {}) };
		}
		return freshness;
	}
});

suite('DefaultAccountProvider sign in scopes', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	interface ICreateSessionCall {
		readonly scopes: readonly string[];
		readonly options: Record<string, unknown>;
	}

	async function signIn(options?: Parameters<DefaultAccountProvider['signIn']>[0], configuration: Record<string, boolean | string> = {}): Promise<ICreateSessionCall[]> {
		const calls: ICreateSessionCall[] = [];
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, new TestConfigurationService(configuration));
		instantiationService.stub(IAuthenticationService, {
			declaredProviders: [],
			isAuthenticationProviderRegistered: () => true,
			getAccounts: async () => [],
			getSessions: async () => [],
			createSession: async (_providerId: string, scopes: readonly string[], sessionOptions: Record<string, unknown>) => {
				calls.push({ scopes: [...scopes], options: sessionOptions });
				return { id: 'session', accessToken: 'token', account: { id: 'account', label: 'octocat' }, scopes: [...scopes] };
			},
			onDidChangeDeclaredProviders: Event.None,
			onDidChangeSessions: Event.None,
			onDidRegisterAuthenticationProvider: Event.None,
			onDidUnregisterAuthenticationProvider: Event.None,
		});
		instantiationService.stub(IAuthenticationExtensionsService, {
			getAccountPreference: () => undefined,
			updateAccountPreference: () => { },
			onDidChangeAccountPreference: Event.None,
		});
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IExtensionService, {});
		instantiationService.stub(IRequestService, new TestRequestService(async () => jsonResponse({})));
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IWorkbenchEnvironmentService, { remoteAuthority: undefined, isSessionsWindow: false });
		instantiationService.stub(IProductService, TestProductService);
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
		instantiationService.stub(IHostService, { hasFocus: true, onDidChangeFocus: Event.None });
		instantiationService.stub(ICommandService, {});
		instantiationService.stub(INativeManagedSettingsService, new NullNativeManagedSettingsService());
		instantiationService.stub(IFileManagedSettingsService, new NullFileManagedSettingsService());

		const provider = disposables.add(instantiationService.createInstance(DefaultAccountProvider, {
			preferredExtensions: [],
			authenticationProvider: {
				default: { id: 'github', name: 'GitHub' },
				enterprise: { id: 'github-enterprise', name: 'GitHub Enterprise' },
				enterpriseProviderConfig: 'github.copilot.advanced.authProvider',
				scopes: [['read:user', 'user:email', 'repo']],
			},
			tokenEntitlementUrl: '',
			entitlementUrl: 'https://api.github.com/copilot_internal/user',
			mcpRegistryDataUrl: '',
			managedSettingsUrl: '',
		}));
		await provider.signIn(options);
		return calls;
	}

	test('widens the default scopes and never forwards the scope option to the session', async () => {
		assert.deepStrictEqual({
			none: await signIn(),
			additive: await signIn({ additionalScopes: ['workflow', 'repo'], provider: 'google' }),
		}, {
			none: [{ scopes: ['read:user', 'user:email', 'repo'], options: {} }],
			// The broad defaults plus the extra scopes, deduplicated.
			additive: [{ scopes: ['read:user', 'user:email', 'repo', 'workflow'], options: { provider: 'google' } }],
		});
	});

	test('connector experiments never change default sign-in scopes', async () => {
		assert.deepStrictEqual({
			unset: await signIn(),
			disabled: await signIn(undefined, { [CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled]: false }),
			publicFeedOnly: await signIn(undefined, { [CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled]: true }),
			enabled: await signIn(undefined, { [CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled]: true }),
			enterprise: await signIn(undefined, {
				[CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled]: true,
				'github.copilot.advanced.authProvider': 'github-enterprise',
			}),
		}, {
			unset: [{ scopes: ['read:user', 'user:email', 'repo'], options: {} }],
			disabled: [{ scopes: ['read:user', 'user:email', 'repo'], options: {} }],
			publicFeedOnly: [{ scopes: ['read:user', 'user:email', 'repo'], options: {} }],
			enabled: [{ scopes: ['read:user', 'user:email', 'repo'], options: {} }],
			enterprise: [{ scopes: ['read:user', 'user:email', 'repo'], options: {} }],
		});
	});

	test('preserves only explicitly requested additional scopes when connectors are enabled', async () => {
		assert.deepStrictEqual(await signIn({
			additionalScopes: ['workflow', 'workflow'],
			provider: 'google',
		}, { [CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled]: true }), [{
			scopes: ['read:user', 'user:email', 'repo', 'workflow'],
			options: { provider: 'google' },
		}]);
	});
});

suite('DefaultAccountProvider Microsoft account', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const microsoftAccountKey = 'defaultAccount.microsoftAccount';
	const githubScopes = ['user:email'];

	interface IWorld {
		/** The label of the remembered Microsoft account in the application storage; setting it is a change made by this window. */
		rememberedAccountLabel: string | undefined;
		microsoftSessions: AuthenticationSession[];
		githubSessions: AuthenticationSession[];
		failMicrosoftLookup: boolean;
		/** When set, the next Microsoft sessions lookup returns this promise instead of the current sessions. */
		pendingMicrosoftLookup: DeferredPromise<AuthenticationSession[]> | undefined;
		nativeManagedSettings: ManagedSettingsData;
		microsoftProviderAvailable: boolean;
		readonly microsoftLookups: string[];
		readonly lookups: string[];
		readonly requests: string[];
		readonly preferenceChanges: Emitter<{ extensionIds: string[]; providerId: string }>;
		readonly sessionChanges: Emitter<{ providerId: string; label: string; event: AuthenticationSessionsChangeEvent }>;
		readonly nativeChanges: Emitter<ManagedSettingsData>;
		readonly registrations: Emitter<{ id: string; label: string }>;
		readonly unregistrations: Emitter<{ id: string; label: string }>;
		readonly configuration: TestConfigurationService;
		setPreference(extensionId: string, providerId: string, label: string): void;
		/** Changes the remembered account like another window does. */
		storeInAnotherWindow(accountLabel: string): void;
		removeInAnotherWindow(): void;
		/** The keys of the application storage with the given target. */
		applicationKeys(target: StorageTarget): string[];
	}

	function session(id: string, label: string, scopes: string[] = []): AuthenticationSession {
		return { id, accessToken: 'token', account: { id: `id-${label}`, label }, scopes };
	}

	function githubSession(label: string): AuthenticationSession {
		return { ...session(`github-${label}`, label, githubScopes), authorizationServer: URI.parse('https://github.com/login/oauth') };
	}

	function describeFreshness(freshness: IManagedSettingsFreshness): object {
		if (freshness.state === ManagedSettingsFreshnessState.NotRequired) {
			return { state: freshness.state };
		}
		return { state: freshness.state, ...(freshness.state === ManagedSettingsFreshnessState.Blocked ? { source: freshness.source, failure: freshness.failure } : {}) };
	}

	/** The policy state that a Microsoft account must not change compared with a window without an account. */
	function describePolicyState(provider: DefaultAccountProvider): object {
		return {
			policyData: provider.policyData,
			compatibilityError: provider.managedSettingsCompatibilityError,
			copilotTokenInfo: provider.copilotTokenInfo,
			freshness: describeFreshness(provider.managedSettingsFreshness),
		};
	}

	async function createWorld(options: { enabled?: boolean; rememberedAccountLabel?: string; microsoftSessions?: AuthenticationSession[]; githubSessions?: AuthenticationSession[]; failMicrosoftLookup?: boolean; microsoftProviderAvailable?: boolean; nativeManagedSettings?: ManagedSettingsData; cachedPolicy?: object; managedSettingsUrl?: string; onRequest?: (url: string) => object } = {}): Promise<{ world: IWorld; provider: DefaultAccountProvider }> {
		const preferences = new Map<string, string>();
		const preferenceKey = (extensionId: string, providerId: string) => `${ExtensionIdentifier.toKey(extensionId)}|${providerId}`;
		const configuration = new TestConfigurationService({ [AgentHostCopilotM365EnabledSettingId]: options.enabled ?? true });
		const storageService = disposables.add(new InMemoryStorageService());
		const world: IWorld = {
			get rememberedAccountLabel() { return storageService.get(microsoftAccountKey, StorageScope.APPLICATION); },
			set rememberedAccountLabel(accountLabel: string | undefined) {
				if (accountLabel === undefined) {
					storageService.remove(microsoftAccountKey, StorageScope.APPLICATION);
				} else {
					storageService.store(microsoftAccountKey, accountLabel, StorageScope.APPLICATION, StorageTarget.MACHINE);
				}
			},
			storeInAnotherWindow(accountLabel) {
				storageService.store(microsoftAccountKey, accountLabel, StorageScope.APPLICATION, StorageTarget.MACHINE, true);
			},
			removeInAnotherWindow() {
				storageService.remove(microsoftAccountKey, StorageScope.APPLICATION, true);
			},
			applicationKeys(target) {
				return storageService.keys(StorageScope.APPLICATION, target);
			},
			microsoftSessions: options.microsoftSessions ?? [],
			githubSessions: options.githubSessions ?? [],
			failMicrosoftLookup: options.failMicrosoftLookup ?? false,
			pendingMicrosoftLookup: undefined,
			microsoftProviderAvailable: options.microsoftProviderAvailable ?? true,
			nativeManagedSettings: options.nativeManagedSettings ?? {},
			microsoftLookups: [],
			lookups: [],
			requests: [],
			preferenceChanges: disposables.add(new Emitter()),
			sessionChanges: disposables.add(new Emitter()),
			nativeChanges: disposables.add(new Emitter<ManagedSettingsData>()),
			registrations: disposables.add(new Emitter()),
			unregistrations: disposables.add(new Emitter()),
			configuration,
			setPreference(extensionId, providerId, label) {
				preferences.set(preferenceKey(extensionId, providerId), label);
				world.preferenceChanges.fire({ extensionIds: [ExtensionIdentifier.toKey(extensionId)], providerId });
			},
		};
		if (options.rememberedAccountLabel !== undefined) {
			world.rememberedAccountLabel = options.rememberedAccountLabel;
		}
		const instantiationService = disposables.add(new TestInstantiationService());
		disposables.add(configuration.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configuration);
		instantiationService.stub(IAuthenticationService, {
			declaredProviders: [],
			isAuthenticationProviderRegistered: (providerId: string) => providerId !== 'microsoft' || world.microsoftProviderAvailable,
			getAccounts: async () => [],
			getSessions: async (providerId: string) => {
				world.lookups.push(providerId);
				if (providerId === 'microsoft') {
					world.microsoftLookups.push(providerId);
					if (world.failMicrosoftLookup) {
						throw new Error('Microsoft sessions unavailable');
					}
					if (world.pendingMicrosoftLookup) {
						const pending = world.pendingMicrosoftLookup;
						world.pendingMicrosoftLookup = undefined;
						return pending.p;
					}
					return world.microsoftSessions;
				}
				return world.githubSessions;
			},
			getProvider: () => ({ label: 'Microsoft' } as IAuthenticationProvider),
			onDidChangeDeclaredProviders: Event.None,
			onDidChangeSessions: world.sessionChanges.event,
			onDidRegisterAuthenticationProvider: world.registrations.event,
			onDidUnregisterAuthenticationProvider: world.unregistrations.event,
		});
		// Like the real service, the account preference is keyed by extension and provider, a removal raises no event
		// and an update raises one with the extension ids. The GitHub path reads it.
		instantiationService.stub(IAuthenticationExtensionsService, {
			getAccountPreference: (extensionId: string, providerId: string) => preferences.get(preferenceKey(extensionId, providerId)),
			updateAccountPreference: (extensionId: string, providerId: string, account: { label: string }) => world.setPreference(extensionId, providerId, account.label),
			removeAccountPreference: (extensionId: string, providerId: string) => { preferences.delete(preferenceKey(extensionId, providerId)); },
			onDidChangeAccountPreference: world.preferenceChanges.event,
		});
		if (options.cachedPolicy) {
			storageService.store('defaultAccount.cachedPolicyData', JSON.stringify(options.cachedPolicy), StorageScope.APPLICATION, StorageTarget.MACHINE);
		}
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IExtensionService, {});
		instantiationService.stub(IRequestService, new TestRequestService(async request => {
			world.requests.push(request.url ?? '');
			return jsonResponse(options.onRequest?.(request.url ?? '') ?? {});
		}));
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IWorkbenchEnvironmentService, { remoteAuthority: isWeb ? 'test-remote' : undefined, isSessionsWindow: false });
		instantiationService.stub(IProductService, TestProductService);
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(IStorageService, storageService);
		instantiationService.stub(IHostService, { hasFocus: true, onDidChangeFocus: Event.None });
		instantiationService.stub(ICommandService, {});
		instantiationService.stub(INativeManagedSettingsService, {
			_serviceBrand: undefined,
			get managedSettings() { return world.nativeManagedSettings; },
			onDidChangeManagedSettings: world.nativeChanges.event,
			initialize: async () => world.nativeManagedSettings,
			updatePolicyDefinitions: async () => world.nativeManagedSettings,
		});
		instantiationService.stub(IFileManagedSettingsService, new NullFileManagedSettingsService());

		const provider = disposables.add(instantiationService.createInstance(DefaultAccountProvider, {
			preferredExtensions: [],
			authenticationProvider: {
				default: { id: 'github', name: 'GitHub' },
				enterprise: { id: 'github-enterprise', name: 'GitHub Enterprise' },
				enterpriseProviderConfig: 'github.copilot.advanced.authProvider',
				scopes: [githubScopes],
			},
			tokenEntitlementUrl: '',
			entitlementUrl: 'https://api.github.com/copilot_internal/user',
			mcpRegistryDataUrl: '',
			managedSettingsUrl: options.managedSettingsUrl ?? '',
		}));
		await provider.refresh();
		return { world, provider };
	}

	test('a remembered Microsoft account is the default account without any GitHub request or entitlement data', async () => {
		const { world, provider } = await createWorld({ rememberedAccountLabel: 'alice', microsoftSessions: [session('s1', 'alice')], githubSessions: [githubSession('octocat')] });

		assert.deepStrictEqual({ account: provider.defaultAccount, policyData: provider.policyData, requests: world.requests }, {
			account: {
				authenticationProvider: { id: 'microsoft', name: 'Microsoft', enterprise: false },
				accountName: 'alice',
				sessionId: 's1',
				enterprise: false,
			},
			policyData: null,
			requests: [],
		});
	});

	test('without a remembered account the Microsoft sessions are never read', async () => {
		const { world, provider } = await createWorld({ microsoftSessions: [session('s1', 'alice')] });

		assert.deepStrictEqual({ account: provider.defaultAccount, lookups: world.microsoftLookups }, { account: null, lookups: [] });
	});

	test('the setting off leaves a remembered Microsoft account unused', async () => {
		const { world, provider } = await createWorld({ enabled: false, rememberedAccountLabel: 'alice', microsoftSessions: [session('s1', 'alice')] });
		await provider.rememberMicrosoftAccount({ id: 'id-bob', label: 'bob' }, 'github');

		assert.deepStrictEqual({ account: provider.defaultAccount, lookups: world.microsoftLookups, rememberedAccountLabel: world.rememberedAccountLabel }, { account: null, lookups: [], rememberedAccountLabel: 'alice' });
	});

	test('a remembered account without a session leaves the GitHub account as the default account and keeps the stored choice', async () => {
		const { world, provider } = await createWorld({ rememberedAccountLabel: 'stale', microsoftSessions: [session('s1', 'alice')], githubSessions: [githubSession('octocat')] });

		assert.deepStrictEqual({ provider: provider.defaultAccount?.authenticationProvider.id, accountName: provider.defaultAccount?.accountName, rememberedAccountLabel: world.rememberedAccountLabel }, { provider: 'github', accountName: 'octocat', rememberedAccountLabel: 'stale' });
	});

	test('remembering an account makes it the default account once the update has finished', async () => {
		const { world, provider } = await createWorld({ microsoftSessions: [session('s1', 'alice')] });

		await provider.rememberMicrosoftAccount({ id: 'id-alice', label: 'alice' }, 'github');

		// A user target value would roam with Settings Sync.
		assert.deepStrictEqual({
			accountName: provider.defaultAccount?.accountName,
			machineKeys: world.applicationKeys(StorageTarget.MACHINE).filter(key => key === microsoftAccountKey),
			userKeys: world.applicationKeys(StorageTarget.USER).filter(key => key === microsoftAccountKey),
		}, { accountName: 'alice', machineKeys: [microsoftAccountKey], userKeys: [] });
	});

	test('forgetting the account removes the Microsoft default account once the update has finished', async () => {
		const { world, provider } = await createWorld({ rememberedAccountLabel: 'alice', microsoftSessions: [session('s1', 'alice')] });

		await provider.forgetMicrosoftAccount();

		assert.deepStrictEqual({ account: provider.defaultAccount, rememberedAccountLabel: world.rememberedAccountLabel }, { account: null, rememberedAccountLabel: undefined });
	});

	test('a failed lookup at startup is not a GitHub sign-in: no account, no GitHub request, the remembered account is kept, freshness blocks like without an account', async () => {
		const outcome = await inBothWorlds(async microsoft => {
			const { world, provider } = await createWorld({
				nativeManagedSettings: nativeRequirement,
				...(microsoft ? { rememberedAccountLabel: 'alice', failMicrosoftLookup: true, githubSessions: [githubSession('octocat')] } : {}),
			});
			return { account: provider.defaultAccount, requests: world.requests, rememberedAccountLabel: world.rememberedAccountLabel ?? null, ...describePolicyState(provider) };
		});

		const blocked = { policyData: null, compatibilityError: null, copilotTokenInfo: null, freshness: { state: ManagedSettingsFreshnessState.Blocked, source: 'nativeMdm', failure: ManagedSettingsFreshnessFailure.NoToken } };
		assert.deepStrictEqual(outcome, {
			signedOut: { account: null, requests: [], rememberedAccountLabel: null, ...blocked },
			microsoft: { account: null, requests: [], rememberedAccountLabel: 'alice', ...blocked },
		});
	});

	test('a failed lookup keeps the Microsoft default account and blocks a refresh requirement that appeared meanwhile', async () => {
		const { world, provider } = await createWorld({ rememberedAccountLabel: 'alice', microsoftSessions: [session('s1', 'alice')], githubSessions: [githubSession('octocat')] });

		world.nativeManagedSettings = nativeRequirement;
		world.failMicrosoftLookup = true;
		await provider.refresh();

		assert.deepStrictEqual({ provider: provider.defaultAccount?.authenticationProvider.id, accountName: provider.defaultAccount?.accountName, requests: world.requests, freshness: describeFreshness(provider.managedSettingsFreshness) }, {
			provider: 'microsoft',
			accountName: 'alice',
			requests: [],
			freshness: { state: ManagedSettingsFreshnessState.Blocked, source: 'nativeMdm', failure: ManagedSettingsFreshnessFailure.NoToken },
		});
	});

	test('a failed Microsoft lookup keeps a GitHub default account, its policy data and its freshness, and makes no request that a refresh without the failure would not make', async () => {
		const serverResponse = { forceRemoteSettingsRefresh: true, permissions: { disableBypassPermissionsMode: 'disable' } };
		const run = async (failLookup: boolean) => {
			const { world, provider } = await createWorld({
				rememberedAccountLabel: 'stale',
				microsoftSessions: [session('s1', 'alice')],
				githubSessions: [githubSession('octocat')],
				managedSettingsUrl: 'https://api.github.com/copilot_internal/managed_settings',
				onRequest: url => url.endsWith('/copilot_internal/user') ? { chat_enabled: true } : serverResponse,
			});
			const snapshot = () => ({ provider: provider.defaultAccount?.authenticationProvider.id, accountName: provider.defaultAccount?.accountName, hadPolicyData: provider.policyData !== null, ...describePolicyState(provider) });
			const before = snapshot();
			const requestsBefore = world.requests.length;
			world.failMicrosoftLookup = failLookup;
			await provider.refresh({ forceRefresh: true });
			const after = snapshot();
			return { before, after, requests: world.requests.length - requestsBefore };
		};

		const withoutFailure = await run(false);
		const withFailure = await run(true);

		assert.deepStrictEqual({
			before: { provider: withFailure.before.provider, accountName: withFailure.before.accountName, hadPolicyData: withFailure.before.hadPolicyData },
			unchanged: withFailure.after,
			requestsNotMore: withFailure.requests <= withoutFailure.requests,
		}, {
			before: { provider: 'github', accountName: 'octocat', hadPolicyData: true },
			unchanged: withFailure.before,
			requestsNotMore: true,
		});
	});

	test('a failed Microsoft lookup does not leave a refresh requirement that appeared meanwhile unapplied for a GitHub default account', async () => {
		const { world, provider } = await createWorld({
			rememberedAccountLabel: 'stale',
			microsoftSessions: [session('s1', 'alice')],
			githubSessions: [githubSession('octocat')],
			managedSettingsUrl: 'https://api.github.com/copilot_internal/managed_settings',
			onRequest: url => url.endsWith('/copilot_internal/user') ? { chat_enabled: true } : {},
		});
		const requestsBefore = world.requests.length;

		world.nativeManagedSettings = nativeRequirement;
		world.failMicrosoftLookup = true;
		await provider.refresh();

		assert.deepStrictEqual({
			provider: provider.defaultAccount?.authenticationProvider.id,
			accountName: provider.defaultAccount?.accountName,
			requests: world.requests.slice(requestsBefore).map(url => url.split('?')[0]),
			freshness: provider.managedSettingsFreshness.state,
		}, {
			provider: 'github',
			accountName: 'octocat',
			requests: ['https://api.github.com/copilot_internal/managed_settings'],
			freshness: ManagedSettingsFreshnessState.Satisfied,
		});
	});

	test('an unavailable Microsoft provider is not read and the GitHub account is the default account', async () => {
		const { world, provider } = await createWorld({ rememberedAccountLabel: 'alice', microsoftProviderAvailable: false, microsoftSessions: [session('s1', 'alice')], githubSessions: [githubSession('octocat')] });

		assert.deepStrictEqual({ provider: provider.defaultAccount?.authenticationProvider.id, lookups: world.microsoftLookups, rememberedAccountLabel: world.rememberedAccountLabel }, { provider: 'github', lookups: [], rememberedAccountLabel: 'alice' });
	});

	test('removing the session of the remembered account forgets it', async () => {
		const { world, provider } = await createWorld({ rememberedAccountLabel: 'alice', microsoftSessions: [session('s1', 'alice')] });
		const changed = Event.toPromise(provider.onDidChangeDefaultAccount);

		world.microsoftSessions = [];
		world.sessionChanges.fire({ providerId: 'microsoft', label: 'Microsoft', event: { added: [], removed: [session('s1', 'alice')], changed: [] } });
		await changed;

		assert.deepStrictEqual({ account: provider.defaultAccount, rememberedAccountLabel: world.rememberedAccountLabel }, { account: null, rememberedAccountLabel: undefined });
	});

	test('removing the session of an account remembered with its service forgets it', async () => {
		const { world, provider } = await createWorld({ rememberedAccountLabel: JSON.stringify({ label: 'alice', service: 'm365' }), microsoftSessions: [session('s1', 'alice')] });
		const changed = Event.toPromise(provider.onDidChangeDefaultAccount);

		world.microsoftSessions = [];
		world.sessionChanges.fire({ providerId: 'microsoft', label: 'Microsoft', event: { added: [], removed: [session('s1', 'alice')], changed: [] } });
		await changed;

		assert.deepStrictEqual({ account: provider.defaultAccount, rememberedAccountLabel: world.rememberedAccountLabel }, { account: null, rememberedAccountLabel: undefined });
	});

	test('the remembered service is part of the Microsoft default account: stored value, plain label and unknown service', async () => {
		const outcome: Record<string, object | undefined> = {};
		for (const [name, stored] of [
			['service', JSON.stringify({ label: 'alice', service: 'm365' })],
			['plainLabel', 'alice'],
			['unknownService', JSON.stringify({ label: 'alice', service: 'other' })],
		]) {
			const { provider } = await createWorld({ rememberedAccountLabel: stored, microsoftSessions: [session('s1', 'alice')] });
			outcome[name] = { accountName: provider.defaultAccount?.accountName, copilotService: provider.defaultAccount?.copilotService };
		}

		assert.deepStrictEqual(outcome, {
			service: { accountName: 'alice', copilotService: 'm365' },
			plainLabel: { accountName: 'alice', copilotService: undefined },
			unknownService: { accountName: 'alice', copilotService: undefined },
		});
	});

	test('removing a session of the remembered account keeps it while the account still has a session', async () => {
		// The Microsoft provider returns one session per account and all of its sessions share the id of the account.
		const { world, provider } = await createWorld({ rememberedAccountLabel: 'alice', microsoftSessions: [session('s1', 'alice')] });

		world.sessionChanges.fire({ providerId: 'microsoft', label: 'Microsoft', event: { added: [], removed: [session('s1', 'alice')], changed: [] } });
		await provider.refresh();

		assert.deepStrictEqual({ accountName: provider.defaultAccount?.accountName, sessionId: provider.defaultAccount?.sessionId, rememberedAccountLabel: world.rememberedAccountLabel }, { accountName: 'alice', sessionId: 's1', rememberedAccountLabel: 'alice' });
	});

	test('an account remembered while the lookup after a removal is pending is not forgotten', async () => {
		const { world, provider } = await createWorld({ rememberedAccountLabel: 'alice', microsoftSessions: [session('s1', 'alice')] });
		const lookup = new DeferredPromise<AuthenticationSession[]>();
		world.pendingMicrosoftLookup = lookup;

		world.sessionChanges.fire({ providerId: 'microsoft', label: 'Microsoft', event: { added: [], removed: [session('s1', 'alice')], changed: [] } });
		world.microsoftSessions = [session('s2', 'bob')];
		await provider.rememberMicrosoftAccount({ id: 'id-bob', label: 'bob' }, 'github');
		await lookup.complete([session('s2', 'bob')]);
		await provider.refresh();

		assert.deepStrictEqual({ rememberedAccountLabel: world.rememberedAccountLabel, accountName: provider.defaultAccount?.accountName, providerId: provider.defaultAccount?.authenticationProvider.id }, { rememberedAccountLabel: JSON.stringify({ label: 'bob', service: 'github' }), accountName: 'bob', providerId: 'microsoft' });
	});

	test('a remembered account stored by another window makes the Microsoft account the default account', async () => {
		const { world, provider } = await createWorld({ microsoftSessions: [session('s1', 'alice')], githubSessions: [githubSession('octocat')] });
		const before = provider.defaultAccount?.authenticationProvider.id;
		const changed = Event.toPromise(provider.onDidChangeDefaultAccount);

		world.storeInAnotherWindow('alice');
		await changed;

		assert.deepStrictEqual({ before, after: provider.defaultAccount?.authenticationProvider.id, accountName: provider.defaultAccount?.accountName }, { before: 'github', after: 'microsoft', accountName: 'alice' });
	});

	test('a remembered account removed by another window ends the Microsoft default account', async () => {
		const outcome: Record<string, { before: string | undefined; after: string | undefined }> = {};
		for (const [name, githubSessions] of [['withGitHubSession', [githubSession('octocat')]], ['withoutGitHubSession', []]] as const) {
			const { world, provider } = await createWorld({ rememberedAccountLabel: 'alice', microsoftSessions: [session('s1', 'alice')], githubSessions: [...githubSessions] });
			const before = provider.defaultAccount?.authenticationProvider.id;
			const changed = Event.toPromise(provider.onDidChangeDefaultAccount);

			world.removeInAnotherWindow();
			await changed;
			outcome[name] = { before, after: provider.defaultAccount?.authenticationProvider.id };
		}

		assert.deepStrictEqual(outcome, {
			withGitHubSession: { before: 'microsoft', after: 'github' },
			withoutGitHubSession: { before: 'microsoft', after: undefined },
		});
	});

	test('a change of the remembered account made by another window causes no update with the setting off', () => runWithFakedTimers({}, async () => {
		const { world } = await createWorld({ enabled: false, microsoftSessions: [session('s1', 'alice')], githubSessions: [githubSession('octocat')] });
		const lookupsAfterStart = world.lookups.length;

		world.storeInAnotherWindow('alice');
		world.removeInAnotherWindow();
		await timeout(300);

		assert.deepStrictEqual({ extraLookups: world.lookups.length - lookupsAfterStart }, { extraLookups: 0 });
	}));

	// Pins the throttling: removing a line of the change cannot make it fail.
	test('remembering an account in this window causes one update', () => runWithFakedTimers({}, async () => {
		const { world, provider } = await createWorld({ microsoftSessions: [session('s1', 'alice')] });
		const lookupsAfterStart = world.microsoftLookups.length;

		await provider.rememberMicrosoftAccount({ id: 'id-alice', label: 'alice' }, 'github');
		await timeout(300);

		assert.deepStrictEqual({ accountName: provider.defaultAccount?.accountName, microsoftLookups: world.microsoftLookups.length - lookupsAfterStart }, { accountName: 'alice', microsoftLookups: 1 });
	}));

	// Pins the throttling: removing a line of the change cannot make it fail.
	test('forgetting the account in this window causes one update', () => runWithFakedTimers({}, async () => {
		const { world, provider } = await createWorld({ rememberedAccountLabel: 'alice', microsoftSessions: [session('s1', 'alice')] });
		const lookupsAfterStart = world.microsoftLookups.length;

		await provider.forgetMicrosoftAccount();
		await timeout(300);

		assert.deepStrictEqual({ account: provider.defaultAccount, microsoftLookups: world.microsoftLookups.length - lookupsAfterStart }, { account: null, microsoftLookups: 0 });
	}));

	test('an event that removes the session of the remembered account and adds another account forgets it', async () => {
		const { world, provider } = await createWorld({ rememberedAccountLabel: 'alice', microsoftSessions: [session('s1', 'alice')] });
		const changed = Event.toPromise(provider.onDidChangeDefaultAccount);

		world.microsoftSessions = [session('s2', 'bob')];
		world.sessionChanges.fire({ providerId: 'microsoft', label: 'Microsoft', event: { added: [session('s2', 'bob')], removed: [session('s1', 'alice')], changed: [] } });
		await changed;

		assert.deepStrictEqual({ account: provider.defaultAccount, rememberedAccountLabel: world.rememberedAccountLabel }, { account: null, rememberedAccountLabel: undefined });
	});

	test('a Microsoft provider registration and the account preference of another extension cause no update without a remembered account', () => runWithFakedTimers({}, async () => {
		const { world } = await createWorld({ githubSessions: [githubSession('octocat')] });
		const lookupsAfterStart = world.lookups.length;

		world.registrations.fire({ id: 'microsoft', label: 'Microsoft' });
		world.unregistrations.fire({ id: 'microsoft', label: 'Microsoft' });
		world.setPreference('some.extension', 'microsoft', 'alice');
		await timeout(300);

		// An update of the default account would read the sessions of the authentication providers again.
		assert.deepStrictEqual({ started: lookupsAfterStart > 0, extraLookups: world.lookups.length - lookupsAfterStart }, { started: true, extraLookups: 0 });
	}));

	test('a Microsoft provider registration makes the remembered account the default account once its session exists', async () => {
		const { world, provider } = await createWorld({ rememberedAccountLabel: 'alice', githubSessions: [githubSession('octocat')] });
		const before = provider.defaultAccount?.authenticationProvider.id;
		const changed = Event.toPromise(provider.onDidChangeDefaultAccount);

		world.microsoftSessions = [session('s1', 'alice')];
		world.registrations.fire({ id: 'microsoft', label: 'Microsoft' });
		await changed;

		assert.deepStrictEqual({ before, after: provider.defaultAccount?.authenticationProvider.id, accountName: provider.defaultAccount?.accountName }, { before: 'github', after: 'microsoft', accountName: 'alice' });
	});

	test('with the setting off a remembered account is left alone by session removals and provider registrations', () => runWithFakedTimers({}, async () => {
		const { world } = await createWorld({ enabled: false, rememberedAccountLabel: 'alice', microsoftSessions: [session('s1', 'alice')], githubSessions: [githubSession('octocat')] });
		const lookupsAfterStart = world.lookups.length;

		world.sessionChanges.fire({ providerId: 'microsoft', label: 'Microsoft', event: { added: [], removed: [session('s1', 'alice')], changed: [] } });
		world.registrations.fire({ id: 'microsoft', label: 'Microsoft' });
		await timeout(300);

		assert.deepStrictEqual({ extraLookups: world.lookups.length - lookupsAfterStart, rememberedAccountLabel: world.rememberedAccountLabel }, { extraLookups: 0, rememberedAccountLabel: 'alice' });
	}));

	test('a Microsoft default account whose remembered account was removed elsewhere is no longer the default account after a provider or session event', async () => {
		const outcome: Record<string, { before: string | undefined; after: string | undefined }> = {};
		for (const trigger of ['unregistration', 'sessionChange'] as const) {
			const { world, provider } = await createWorld({ rememberedAccountLabel: 'alice', microsoftSessions: [session('s1', 'alice')] });
			const before = provider.defaultAccount?.authenticationProvider.id;
			const changed = Event.toPromise(provider.onDidChangeDefaultAccount);

			world.rememberedAccountLabel = undefined;
			if (trigger === 'unregistration') {
				world.unregistrations.fire({ id: 'microsoft', label: 'Microsoft' });
			} else {
				world.sessionChanges.fire({ providerId: 'microsoft', label: 'Microsoft', event: { added: [], removed: [], changed: [session('s1', 'alice')] } });
			}
			await changed;
			outcome[trigger] = { before, after: provider.defaultAccount?.authenticationProvider.id };
		}

		assert.deepStrictEqual(outcome, {
			unregistration: { before: 'microsoft', after: undefined },
			sessionChange: { before: 'microsoft', after: undefined },
		});
	});

	test('with GitHub Enterprise configured a Microsoft default account resolves GitHub URLs like a window without an account', async () => {
		const resolve = async (rememberedAccountLabel: string | undefined) => {
			const { world, provider } = await createWorld({ rememberedAccountLabel, microsoftSessions: [session('s1', 'alice')] });
			await world.configuration.setUserConfiguration('github.copilot.advanced.authProvider', 'github-enterprise');
			return { account: provider.defaultAccount?.authenticationProvider.id ?? null, url: provider.resolveGitHubUrl('login') ?? null };
		};

		const signedOut = await resolve(undefined);
		const microsoft = await resolve('alice');

		assert.deepStrictEqual({ signedOut, microsoft }, { signedOut: { account: null, url: null }, microsoft: { account: 'microsoft', url: null } });
	});

	/** Runs the same scenario in a window without an account and in a window whose default account is Microsoft. */
	async function inBothWorlds<T>(scenario: (microsoft: boolean) => Promise<T>): Promise<{ signedOut: T; microsoft: T }> {
		return { signedOut: await scenario(false), microsoft: await scenario(true) };
	}

	const nativeRequirement: ManagedSettingsData = { [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true };
	const policyRows: { name: string; native: ManagedSettingsData; response: object }[] = [
		{ name: 'serverRequirement', native: {}, response: { forceRemoteSettingsRefresh: true, permissions: { disableBypassPermissionsMode: 'disable' } } },
		{ name: 'nativeRequirement', native: nativeRequirement, response: {} },
		{ name: 'noRequirement', native: {}, response: {} },
	];

	test('a refresh requirement that appears while the Microsoft account is unchanged blocks like in a window without an account', async () => {
		const outcome = await inBothWorlds(async microsoft => {
			const { world, provider } = await createWorld(microsoft ? { rememberedAccountLabel: 'alice', microsoftSessions: [session('s1', 'alice')] } : {});
			world.nativeManagedSettings = nativeRequirement;
			world.nativeChanges.fire(nativeRequirement);
			await provider.refresh();
			return describePolicyState(provider);
		});

		const blocked = {
			policyData: null,
			compatibilityError: null,
			copilotTokenInfo: null,
			freshness: { state: ManagedSettingsFreshnessState.Blocked, source: 'nativeMdm', failure: ManagedSettingsFreshnessFailure.NoToken },
		};
		assert.deepStrictEqual(outcome, { signedOut: blocked, microsoft: blocked });
	});

	const cachedPolicy = {
		accountPolicyData: {
			accountId: 'account',
			policyData: { managedSettings: { 'permissions.disableBypassPermissionsMode': 'disable' } },
			managedSettingsCompatibilityError: { errorCode: 'client_update_required', minimumClientVersion: '99.0.0' },
		},
		copilotTokenInfo: { sn: 'cached' },
	};
	const keptCachedPolicy = {
		policyData: { managedSettings: { 'permissions.disableBypassPermissionsMode': 'disable' } },
		compatibilityError: { errorCode: 'client_update_required', minimumClientVersion: '99.0.0' },
		copilotTokenInfo: { sn: 'cached' },
		freshness: { state: ManagedSettingsFreshnessState.NotRequired },
	};

	test('a Microsoft account keeps the cached policy of an earlier session like a window without an account', async () => {
		const outcome = await inBothWorlds(async microsoft => {
			const { provider } = await createWorld({ cachedPolicy, ...(microsoft ? { rememberedAccountLabel: 'alice', microsoftSessions: [session('s1', 'alice')] } : {}) });
			return describePolicyState(provider);
		});

		assert.deepStrictEqual(outcome, { signedOut: keptCachedPolicy, microsoft: keptCachedPolicy });
	});

	test('forgetting the Microsoft account keeps the cached policy like a window that never had an account', async () => {
		const outcome = await inBothWorlds(async microsoft => {
			const { provider } = await createWorld({ cachedPolicy, ...(microsoft ? { rememberedAccountLabel: 'alice', microsoftSessions: [session('s1', 'alice')] } : {}) });
			const wasMicrosoft = provider.defaultAccount?.authenticationProvider.id === 'microsoft';
			if (microsoft) {
				await provider.forgetMicrosoftAccount();
			} else {
				await provider.refresh();
			}
			return { wasMicrosoft, account: provider.defaultAccount, ...describePolicyState(provider) };
		});

		assert.deepStrictEqual(outcome, {
			signedOut: { wasMicrosoft: false, account: null, ...keptCachedPolicy },
			microsoft: { wasMicrosoft: true, account: null, ...keptCachedPolicy },
		});
	});

	test('replacing a GitHub account that has policy data by a Microsoft account leaves the policy state of losing the account', async () => {
		const outcome: Record<string, { signedOut: object; microsoft: object }> = {};
		for (const row of policyRows) {
			outcome[row.name] = await inBothWorlds(async microsoft => {
				const { world, provider } = await createWorld({
					microsoftSessions: [session('s1', 'alice')],
					githubSessions: [githubSession('octocat')],
					nativeManagedSettings: row.native,
					managedSettingsUrl: 'https://api.github.com/copilot_internal/managed_settings',
					onRequest: url => url.endsWith('/copilot_internal/user') ? { chat_enabled: true } : row.response,
				});
				const hadPolicyData = provider.policyData !== null;
				if (microsoft) {
					world.rememberedAccountLabel = 'alice';
				} else {
					world.githubSessions = [];
				}
				await provider.refresh();
				return { hadPolicyData, ...describePolicyState(provider) };
			});
		}

		const lost = (retained: object | null, freshness: object) => ({ hadPolicyData: true, policyData: retained, compatibilityError: null, copilotTokenInfo: null, freshness });
		const noToken = (source: string) => ({ state: ManagedSettingsFreshnessState.Blocked, source, failure: ManagedSettingsFreshnessFailure.NoToken });
		const expected = (retained: object | null, freshness: object) => ({ signedOut: lost(retained, freshness), microsoft: lost(retained, freshness) });
		assert.deepStrictEqual(outcome, {
			serverRequirement: expected({ cloud_session_storage_enabled: undefined, managedSettings: { 'permissions.disableBypassPermissionsMode': 'disable', forceRemoteSettingsRefresh: true } }, noToken('server')),
			nativeRequirement: expected(null, noToken('nativeMdm')),
			noRequirement: expected(null, { state: ManagedSettingsFreshnessState.NotRequired }),
		});
	});

	test('a Microsoft default account gets the policy outcome of a window without an account at startup', async () => {
		const outcome: Record<string, { signedOut: object; microsoft: object }> = {};
		for (const [name, nativeManagedSettings] of [['nativeRequirement', nativeRequirement], ['noRequirement', {}]] as const) {
			outcome[name] = await inBothWorlds(async microsoft => {
				const { provider } = await createWorld({ nativeManagedSettings, ...(microsoft ? { rememberedAccountLabel: 'alice', microsoftSessions: [session('s1', 'alice')] } : {}) });
				return describePolicyState(provider);
			});
		}

		const unavailable = (freshness: object) => ({ policyData: null, compatibilityError: null, copilotTokenInfo: null, freshness });
		const blocked = unavailable({ state: ManagedSettingsFreshnessState.Blocked, source: 'nativeMdm', failure: ManagedSettingsFreshnessFailure.NoToken });
		const notRequired = unavailable({ state: ManagedSettingsFreshnessState.NotRequired });
		assert.deepStrictEqual(outcome, {
			nativeRequirement: { signedOut: blocked, microsoft: blocked },
			noRequirement: { signedOut: notRequired, microsoft: notRequired },
		});
	});

	test('a Microsoft default account with a remembered service has the policy state of one without', async () => {
		const outcome: Record<string, object> = {};
		for (const [name, rememberedAccountLabel] of [['withoutService', 'alice'], ['withService', JSON.stringify({ label: 'alice', service: 'm365' })]] as const) {
			const { provider } = await createWorld({ nativeManagedSettings: nativeRequirement, rememberedAccountLabel, microsoftSessions: [session('s1', 'alice')] });
			outcome[name] = describePolicyState(provider);
		}

		assert.deepStrictEqual(outcome.withService, outcome.withoutService);
	});

	test('a change of only the remembered service by another window updates the Microsoft default account', async () => {
		const { world, provider } = await createWorld({ rememberedAccountLabel: JSON.stringify({ label: 'alice', service: 'github' }), microsoftSessions: [session('s1', 'alice')] });
		const before = provider.defaultAccount?.copilotService;
		const changed = Event.toPromise(provider.onDidChangeDefaultAccount);

		world.storeInAnotherWindow(JSON.stringify({ label: 'alice', service: 'm365' }));
		await changed;

		assert.deepStrictEqual({ before, after: provider.defaultAccount?.copilotService, accountName: provider.defaultAccount?.accountName }, { before: 'github', after: 'm365', accountName: 'alice' });
	});
});

class TestRequestService implements IRequestService {
	readonly _serviceBrand: undefined;
	readonly onDidCompleteRequest = Event.None;
	requestCount = 0;
	readonly requests: IRequestOptions[] = [];

	constructor(private readonly requestHandler: (options: IRequestOptions) => Promise<IRequestContext>) { }

	request(options: IRequestOptions): Promise<IRequestContext> {
		this.requestCount++;
		this.requests.push(options);
		return this.requestHandler(options);
	}

	async resolveProxy(): Promise<string | undefined> {
		return undefined;
	}

	async lookupAuthorization(): Promise<undefined> {
		return undefined;
	}

	async lookupKerberosAuthorization(): Promise<undefined> {
		return undefined;
	}

	async loadCertificates(): Promise<string[]> {
		return [];
	}
}

function jsonResponse(data: unknown, statusCode = 200, headers: Record<string, string> = {}): IRequestContext {
	return {
		res: { statusCode, headers },
		stream: bufferToStream(VSBuffer.fromString(JSON.stringify(data))),
	};
}

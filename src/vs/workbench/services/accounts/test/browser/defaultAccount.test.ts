/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { bufferToStream, VSBuffer } from '../../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IRequestContext, IRequestOptions } from '../../../../../base/parts/request/common/request.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY, IFileManagedSettingsService, INativeManagedSettingsService, ManagedSettingsData } from '../../../../../platform/policy/common/copilotManagedSettings.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IRequestService } from '../../../../../platform/request/common/request.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { AuthenticationSession, IAuthenticationExtensionsService, IAuthenticationService } from '../../../authentication/common/authentication.js';
import { IWorkbenchEnvironmentService } from '../../../environment/common/environmentService.js';
import { IExtensionService } from '../../../extensions/common/extensions.js';
import { IHostService } from '../../../host/browser/host.js';
import { DefaultAccountProvider } from '../../browser/defaultAccount.js';
import { TestProductService } from '../../../../test/common/workbenchTestServices.js';

suite('DefaultAccountProvider managed settings', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const accountId = 'account';
	const sessions: AuthenticationSession[] = [{
		id: 'session',
		accessToken: 'token',
		account: { id: accountId, label: 'octocat' },
		scopes: ['user:email'],
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
			first: first.data,
			second: second.data,
		}, {
			requestCount: 1,
			requestQuery: '?client_id=vscode&client_version=1.132.0&copilot_runtime_version=0.0.344',
			first: cachedPolicy.policyData,
			second: cachedPolicy.policyData,
		});
	});

	test('404 clears cached server managed settings', async () => {
		const requestService = new TestRequestService(async () => jsonResponse({}, 404));
		const provider = await createProvider(requestService);
		const cachedPolicy = createCachedPolicy(true);

		const result = await provider['getManagedSettings'](sessions, cachedPolicy);

		assert.deepStrictEqual({
			requestCount: requestService.requestCount,
			status: provider.managedSettingsFetchStatus,
			data: result.data,
			compatibilityError: provider.managedSettingsCompatibilityError,
		}, {
			requestCount: 1,
			status: 404,
			data: { managedSettings: undefined },
			compatibilityError: null,
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

		const result = await provider['getManagedSettings'](sessions, cachedPolicy);

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

		const result = await provider['getManagedSettings'](sessions, createCachedPolicy(false));

		assert.deepStrictEqual({
			data: result.data,
			compatibilityError: provider.managedSettingsCompatibilityError,
		}, {
			data: { managedSettings: undefined },
			compatibilityError: { errorCode: 'client_update_required' },
		});
	});

	test('failed startup fetch retains cached managed settings when no rejection is known', async () => {
		const requestService = new TestRequestService(async () => {
			throw new Error('managed settings unavailable');
		});
		const provider = await createProvider(requestService);
		const cachedPolicy = createCachedPolicy(false);

		const result = await provider['getManagedSettings'](sessions, cachedPolicy);

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

	test('repeated no-response fetches let cached managed settings age out instead of renewing them', async () => {
		const requestService = new TestRequestService(async () => {
			throw new Error('managed settings unavailable');
		});
		const provider = await createProvider(requestService);
		const freshlyCached = createCachedPolicy(false);
		const staleFetchedAt = Date.now() - 2 * 60 * 60 * 1000; // twice the one-hour poll interval

		const whileFresh = await provider['getManagedSettings'](sessions, freshlyCached, { forceRefresh: true });
		const onceStale = await provider['getManagedSettings'](
			sessions,
			{ ...freshlyCached, managedSettingsFetchedAt: staleFetchedAt },
			{ forceRefresh: true }
		);

		assert.deepStrictEqual({
			status: provider.managedSettingsFetchStatus,
			whileFresh: { data: whileFresh.data, fetchedAt: whileFresh.fetchedAt },
			onceStale: { data: onceStale.data, fetchedAt: onceStale.fetchedAt },
		}, {
			status: 'no-response',
			// A fresh cache still applies, but keeps its original timestamp so it can expire.
			whileFresh: { data: freshlyCached.policyData, fetchedAt: freshlyCached.managedSettingsFetchedAt },
			// Once expired it is dropped rather than replayed with a renewed timestamp.
			onceStale: { data: { managedSettings: undefined }, fetchedAt: undefined },
		});
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

		await provider['getManagedSettings'](sessions, cachedPolicy);
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

	test('no fetch is blocked when the refresh flag is not set anywhere', async () => {
		const requestService = new TestRequestService(async () => {
			throw new Error('managed settings unavailable');
		});
		const provider = await createProvider(requestService);
		const cachedPolicy = {
			accountId,
			policyData: { managedSettings: { 'permissions.disableBypassPermissionsMode': 'disable' } },
			managedSettingsFetchedAt: Date.now(),
		};

		const blockedBeforeAnyFetch = provider.managedSettingsRefreshBlocked;
		await provider['getManagedSettings'](sessions, cachedPolicy);
		const success = new TestRequestService(async () => jsonResponse({}));
		const freshProvider = await createProvider(success);
		await freshProvider['getManagedSettings'](sessions, cachedPolicy);

		assert.deepStrictEqual({
			beforeAnyFetch: blockedBeforeAnyFetch,
			afterFailedFetch: provider.managedSettingsRefreshBlocked,
			afterSuccessfulFetch: freshProvider.managedSettingsRefreshBlocked,
		}, {
			// Completely inert: an unflagged org is never gated, even when the endpoint is down.
			beforeAnyFetch: false,
			afterFailedFetch: false,
			afterSuccessfulFetch: false,
		});
	});

	test('a signed-out machine with a locally delivered flag blocks without any fetch', async () => {
		// First launch, no account yet. The flag must still resolve: it arrives via MDM or the
		// on-disk file, neither of which depends on a session. Previously the control was only ever
		// consulted behind an authenticated fetch, so such a machine read as unmanaged.
		const requestService = new TestRequestService(async () => {
			throw new Error('managed settings unavailable');
		});

		const viaNativeMdm = await createProvider(requestService, {
			nativeManagedSettings: { [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true },
		});
		const viaFile = await createProvider(requestService, {
			fileManagedSettings: { [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true },
		});
		const unflagged = await createProvider(requestService);

		assert.deepStrictEqual({
			requestCount: requestService.requestCount,
			blockedViaNativeMdm: viaNativeMdm.managedSettingsRefreshBlocked,
			blockedViaFile: viaFile.managedSettingsRefreshBlocked,
			blockedWhenUnflagged: unflagged.managedSettingsRefreshBlocked,
		}, {
			// No sign-in, no fetch — the gate is decided from the local channels alone.
			requestCount: 0,
			blockedViaNativeMdm: true,
			blockedViaFile: true,
			blockedWhenUnflagged: false,
		});
	});

	test('flagged org blocks until a fresh fetch succeeds', async () => {
		let succeed = false;
		const requestService = new TestRequestService(async options => {
			if (options.url?.endsWith('/copilot_internal/user')) {
				return jsonResponse({ chat_enabled: true });
			}
			if (!succeed) {
				throw new Error('managed settings unavailable');
			}
			return jsonResponse({ forceRemoteSettingsRefresh: true, permissions: { disableBypassPermissionsMode: 'disable' } });
		});
		const provider = await createProvider(requestService, {
			nativeManagedSettings: { [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true },
		});

		await refreshAccount(provider);
		const blockedWhileOffline = provider.managedSettingsRefreshBlocked;

		succeed = true;
		await refreshAccount(provider);

		assert.deepStrictEqual({
			blockedWhileOffline,
			blockedAfterSuccess: provider.managedSettingsRefreshBlocked,
			managedSettings: provider.policyData?.managedSettings,
		}, {
			blockedWhileOffline: true,
			blockedAfterSuccess: false,
			managedSettings: {
				[COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true,
				'permissions.disableBypassPermissionsMode': 'disable',
			},
		});
	});

	test('a fresh 404 satisfies the requirement instead of locking the org out', async () => {
		const requestService = new TestRequestService(async options => {
			if (options.url?.endsWith('/copilot_internal/user')) {
				return jsonResponse({ chat_enabled: true });
			}
			return jsonResponse({}, 404);
		});
		const provider = await createProvider(requestService, {
			nativeManagedSettings: { [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true },
		});

		await refreshAccount(provider);

		assert.deepStrictEqual({
			status: provider.managedSettingsFetchStatus,
			blocked: provider.managedSettingsRefreshBlocked,
			managedSettings: provider.policyData?.managedSettings,
		}, {
			status: 404,
			// "No policy file configured" is an authoritative answer, not a failure to refresh.
			blocked: false,
			managedSettings: undefined,
		});
	});

	test('the requirement outlives the cached payload it arrived in', async () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const seed = new TestRequestService(async () => jsonResponse({ forceRemoteSettingsRefresh: true }));
		const seedProvider = await createProvider(seed, { storageService });
		await seedProvider['getManagedSettings'](sessions, undefined);

		// Restart offline, with the policy cache aged past the one-hour poll interval so the
		// server-delivered flag is no longer readable from it.
		const offline = new TestRequestService(async () => {
			throw new Error('managed settings unavailable');
		});
		const restarted = await createProvider(offline, { storageService });
		const staleCache = {
			accountId,
			policyData: { managedSettings: { [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true } },
			managedSettingsFetchedAt: Date.now() - 2 * 60 * 60 * 1000,
		};
		const result = await restarted['getManagedSettings'](sessions, staleCache);

		assert.deepStrictEqual({
			requiredAfterRestart: restarted['_serverRefreshRequiredAccounts'].has(accountId),
			blockedAfterRestart: restarted.managedSettingsRefreshBlocked,
			managedSettings: result.data?.managedSettings,
		}, {
			// The stale cache dropped the flag, but the recorded requirement survives it.
			requiredAfterRestart: true,
			blockedAfterRestart: true,
			managedSettings: undefined,
		});
	});

	test('an explicit managed false lifts a sticky requirement even while offline', async () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const seed = new TestRequestService(async () => jsonResponse({ forceRemoteSettingsRefresh: true }));
		await (await createProvider(seed, { storageService }))['getManagedSettings'](sessions, undefined);

		const offline = new TestRequestService(async () => {
			throw new Error('managed settings unavailable');
		});
		const restarted = await createProvider(offline, {
			storageService,
			nativeManagedSettings: { [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: false },
		});
		await restarted['getManagedSettings'](sessions, undefined);

		assert.strictEqual(restarted.managedSettingsRefreshBlocked, false);
	});

	test('a native requirement arriving after the fetch applies without a refetch', async () => {
		// The native/file channels load asynchronously and start empty, so a value can land after
		// the gate has already been evaluated. Precedence is resolved when the requirement is read,
		// so a late arrival takes effect immediately.
		let nativeManagedSettings: ManagedSettingsData = {};
		const onDidChangeNative = disposables.add(new Emitter<ManagedSettingsData>());
		const requestService = new TestRequestService(async options => {
			if (options.url?.endsWith('/copilot_internal/user')) {
				return jsonResponse({ chat_enabled: true });
			}
			return jsonResponse({}, 404);
		});
		const provider = await createProvider(requestService, {
			getNativeManagedSettings: () => nativeManagedSettings,
			onDidChangeNativeManagedSettings: onDidChangeNative.event,
		});

		await refreshAccount(provider);
		const blockedBeforeMdmArrives = provider.managedSettingsRefreshBlocked;

		nativeManagedSettings = { [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true };
		onDidChangeNative.fire(nativeManagedSettings);
		const blockedThisSession = provider.managedSettingsRefreshBlocked;

		// Signing out leaves no account that can have been freshly fetched, and the requirement is
		// machine-wide, so the gate closes.
		provider['setDefaultAccount'](null);

		assert.deepStrictEqual({
			blockedBeforeMdmArrives,
			blockedThisSession,
			blockedAfterSignOut: provider.managedSettingsRefreshBlocked,
		}, {
			blockedBeforeMdmArrives: false,
			// This account did fetch freshly this session, so the late requirement is satisfied.
			blockedThisSession: false,
			blockedAfterSignOut: true,
		});
	});

	test('a native requirement arriving while offline closes the gate immediately', async () => {
		let nativeManagedSettings: ManagedSettingsData = {};
		const onDidChangeNative = disposables.add(new Emitter<ManagedSettingsData>());
		const requestService = new TestRequestService(async options => {
			if (options.url?.endsWith('/copilot_internal/user')) {
				return jsonResponse({ chat_enabled: true });
			}
			throw new Error('managed settings unavailable');
		});
		const provider = await createProvider(requestService, {
			getNativeManagedSettings: () => nativeManagedSettings,
			onDidChangeNativeManagedSettings: onDidChangeNative.event,
		});

		await refreshAccount(provider);
		const blockedBeforeMdmArrives = provider.managedSettingsRefreshBlocked;

		nativeManagedSettings = { [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true };
		onDidChangeNative.fire(nativeManagedSettings);

		assert.deepStrictEqual({
			blockedBeforeMdmArrives,
			blockedAfterMdmArrives: provider.managedSettingsRefreshBlocked,
		}, {
			blockedBeforeMdmArrives: false,
			// No fresh fetch happened this session, so the late requirement must close the gate.
			blockedAfterMdmArrives: true,
		});
	});

	test('a fresh fetch for one account does not satisfy another account requirement', async () => {
		const requestService = new TestRequestService(async options => {
			if (options.url?.endsWith('/copilot_internal/user')) {
				return jsonResponse({ chat_enabled: true });
			}
			return jsonResponse({});
		});
		const provider = await createProvider(requestService, {
			nativeManagedSettings: { [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true },
		});

		await refreshAccount(provider);
		const blockedAfterFirstAccount = provider.managedSettingsRefreshBlocked;

		const otherSessions: AuthenticationSession[] = [{
			...sessions[0],
			account: { id: 'other-account', label: 'hubot' },
		}];
		await refreshAccount(provider, otherSessions);
		const blockedAfterSwitch = provider.managedSettingsRefreshBlocked;

		// Signing out cannot leave a stale per-account pass behind either.
		provider['setDefaultAccount'](null);

		assert.deepStrictEqual({
			blockedAfterFirstAccount,
			blockedAfterSwitch,
			blockedAfterSignOut: provider.managedSettingsRefreshBlocked,
		}, {
			blockedAfterFirstAccount: false,
			// The second account got its own fresh fetch, so it is released on its own merit.
			blockedAfterSwitch: false,
			blockedAfterSignOut: true,
		});
	});

	test('an unrelated channel update cannot clear a sticky requirement via a stale cached false', async () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const seed = new TestRequestService(async () => jsonResponse({ forceRemoteSettingsRefresh: true }));
		await (await createProvider(seed, { storageService }))['getManagedSettings'](sessions, undefined);

		storageService.store(
			'defaultAccount.cachedPolicyData',
			JSON.stringify({
				accountPolicyData: {
					accountId,
					policyData: { managedSettings: { [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: false } },
					managedSettingsFetchedAt: Date.now(),
				},
			}),
			StorageScope.APPLICATION,
			StorageTarget.MACHINE,
		);

		let nativeManagedSettings: ManagedSettingsData = {};
		const onDidChangeNative = disposables.add(new Emitter<ManagedSettingsData>());
		const offline = new TestRequestService(async () => {
			throw new Error('managed settings unavailable');
		});
		const restarted = await createProvider(offline, {
			storageService,
			getNativeManagedSettings: () => nativeManagedSettings,
			onDidChangeNativeManagedSettings: onDidChangeNative.event,
		});
		const blockedAtStartup = restarted.managedSettingsRefreshBlocked;

		// MDM reports settings that say nothing about the refresh control. The stale cached `false`
		// must not be promoted into a decision to reopen the gate.
		nativeManagedSettings = { 'permissions.disableBypassPermissionsMode': 'disable' };
		onDidChangeNative.fire(nativeManagedSettings);

		assert.deepStrictEqual({
			blockedAtStartup,
			blockedAfterUnrelatedChannelUpdate: restarted.managedSettingsRefreshBlocked,
		}, {
			blockedAtStartup: true,
			blockedAfterUnrelatedChannelUpdate: true,
		});
	});

	test('a live local channel false still clears the requirement', async () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const seed = new TestRequestService(async () => jsonResponse({ forceRemoteSettingsRefresh: true }));
		await (await createProvider(seed, { storageService }))['getManagedSettings'](sessions, undefined);

		let nativeManagedSettings: ManagedSettingsData = {};
		const onDidChangeNative = disposables.add(new Emitter<ManagedSettingsData>());
		const offline = new TestRequestService(async () => {
			throw new Error('managed settings unavailable');
		});
		const restarted = await createProvider(offline, {
			storageService,
			getNativeManagedSettings: () => nativeManagedSettings,
			onDidChangeNativeManagedSettings: onDidChangeNative.event,
		});

		nativeManagedSettings = { [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: false };
		onDidChangeNative.fire(nativeManagedSettings);

		assert.strictEqual(restarted.managedSettingsRefreshBlocked, false);
	});

	test('another account session cannot answer for the account being evaluated', async () => {
		// `request` falls through to the next session on 401/404, so without restricting the fetch
		// to the evaluated account, another organization would answer — releasing this account's
		// gate and having its settings cached here.
		const requestService = new TestRequestService(async options => {
			if (options.url?.includes('/copilot_internal/managed_settings')) {
				return options.headers?.['Authorization'] === 'Bearer token'
					? jsonResponse({}, 401)
					: jsonResponse({});
			}
			throw new Error(`Unexpected request: ${options.url}`);
		});
		const provider = await createProvider(requestService, {
			nativeManagedSettings: { [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true },
		});
		const mixedSessions: AuthenticationSession[] = [
			...sessions,
			{ id: 'session-b', accessToken: 'token-b', account: { id: 'other-account', label: 'hubot' }, scopes: ['user:email'] },
		];

		await provider['getManagedSettings'](mixedSessions, undefined);
		provider['setDefaultAccount'](accountData());

		assert.deepStrictEqual({
			requestCount: requestService.requestCount,
			freshForAccount: provider['_managedSettingsFreshForAccount'],
			blocked: provider.managedSettingsRefreshBlocked,
		}, {
			// Only this account's session is tried; the other account is never asked.
			requestCount: 1,
			freshForAccount: undefined,
			blocked: true,
		});
	});

	test('a failed fetch never escalates from another account cached settings', async () => {
		// The policy cache is written per account but can hold a response fetched with a different
		// account's token. Escalating from it would gate a user whose own org never set the control.
		const requestService = new TestRequestService(async () => {
			throw new Error('managed settings unavailable');
		});
		const provider = await createProvider(requestService);

		await provider['getManagedSettings'](sessions, {
			accountId,
			policyData: { managedSettings: { [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true } },
			managedSettingsFetchedAt: Date.now(),
		});

		assert.deepStrictEqual({
			requiredAccounts: Array.from(provider['_serverRefreshRequiredAccounts']),
			blocked: provider.managedSettingsRefreshBlocked,
		}, {
			requiredAccounts: [],
			blocked: false,
		});
	});

	test('cache-bypassing retries are throttled while the gate is closed', async () => {
		const requestService = new TestRequestService(async () => {
			throw new Error('managed settings unavailable');
		});
		const provider = await createProvider(requestService, {
			nativeManagedSettings: { [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true },
		});
		const cachedPolicy = createCachedPolicy(true);

		await provider['getManagedSettings'](sessions, cachedPolicy);
		await provider['getManagedSettings'](sessions, cachedPolicy);
		const requestsWithinThrottleWindow = requestService.requestCount;

		// An absent cache must not defeat the throttle either.
		await provider['getManagedSettings'](sessions, undefined);
		const requestsWithoutCache = requestService.requestCount;

		// Simulate the throttle window elapsing; a window-focus refresh must retry after it.
		provider['_managedSettingsAttemptedAt'] = Date.now() - 61 * 1000;
		await provider['getManagedSettings'](sessions, cachedPolicy);

		assert.deepStrictEqual({
			requestsWithinThrottleWindow,
			requestsWithoutCache,
			requestsAfterThrottleWindow: requestService.requestCount,
			blocked: provider.managedSettingsRefreshBlocked,
		}, {
			// A refresh fires on every window focus, so repeated attempts must not storm the endpoint.
			requestsWithinThrottleWindow: 1,
			requestsWithoutCache: 1,
			requestsAfterThrottleWindow: 2,
			// Serving the cache inside the throttle window never reopens the gate.
			blocked: true,
		});
	});

	test('another account answering cannot clear a server-set requirement', async () => {
		// No local MDM flag to re-escalate, so an empty response from another account would
		// otherwise clear the recorded requirement outright.
		const storageService = disposables.add(new InMemoryStorageService());
		const seed = new TestRequestService(async () => jsonResponse({ forceRemoteSettingsRefresh: true }));
		await (await createProvider(seed, { storageService }))['getManagedSettings'](sessions, undefined);

		const requestService = new TestRequestService(async options => {
			if (options.url?.includes('/copilot_internal/managed_settings')) {
				return options.headers?.['Authorization'] === 'Bearer token'
					? jsonResponse({}, 401)
					: jsonResponse({});
			}
			throw new Error(`Unexpected request: ${options.url}`);
		});
		const provider = await createProvider(requestService, { storageService });
		const mixedSessions: AuthenticationSession[] = [
			...sessions,
			{ id: 'session-b', accessToken: 'token-b', account: { id: 'other-account', label: 'hubot' }, scopes: ['user:email'] },
		];

		await provider['getManagedSettings'](mixedSessions, undefined);
		provider['setDefaultAccount'](accountData());

		assert.deepStrictEqual({
			requiredForThisAccount: provider['_serverRefreshRequiredAccounts'].has(accountId),
			blocked: provider.managedSettingsRefreshBlocked,
		}, {
			// Another organization has no say over whether this account's requirement is satisfied.
			requiredForThisAccount: true,
			blocked: true,
		});
	});

	test('a stale cached server false does not lift a sticky requirement at startup', async () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const seed = new TestRequestService(async () => jsonResponse({ forceRemoteSettingsRefresh: true }));
		await (await createProvider(seed, { storageService }))['getManagedSettings'](sessions, undefined);

		// A cached server bag that explicitly says `false`, from before the admin enabled the
		// control. At construction the local channels have not loaded, so this must not be trusted
		// to open the gate — only a real fetch or a channel update may clear the requirement.
		storageService.store(
			'defaultAccount.cachedPolicyData',
			JSON.stringify({
				accountPolicyData: {
					accountId,
					policyData: { managedSettings: { [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: false } },
					managedSettingsFetchedAt: Date.now(),
				},
			}),
			StorageScope.APPLICATION,
			StorageTarget.MACHINE,
		);
		const offline = new TestRequestService(async () => {
			throw new Error('managed settings unavailable');
		});
		const restarted = await createProvider(offline, { storageService });

		assert.strictEqual(restarted.managedSettingsRefreshBlocked, true);
	});

	test('a second account being refreshed does not erase the first account requirement', async () => {
		// A's org requires a refresh; B's does not. B's authoritative response must not clear A's
		// requirement, or switching back to A while offline would leave it ungated.
		const storageService = disposables.add(new InMemoryStorageService());
		const requestService = new TestRequestService(async options => {
			if (options.url?.endsWith('/copilot_internal/user')) {
				return jsonResponse({ chat_enabled: true });
			}
			return options.headers?.['Authorization'] === 'Bearer token'
				? jsonResponse({ forceRemoteSettingsRefresh: true })
				: jsonResponse({});
		});
		const provider = await createProvider(requestService, { storageService });
		const accountBSessions: AuthenticationSession[] = [{
			id: 'session-b', accessToken: 'token-b', account: { id: 'account-b', label: 'hubot' }, scopes: ['user:email'],
		}];

		await refreshAccount(provider);
		await refreshAccount(provider, accountBSessions);

		// Now restart offline as the first account.
		const offline = new TestRequestService(async () => {
			throw new Error('managed settings unavailable');
		});
		const restarted = await createProvider(offline, { storageService });
		restarted['setDefaultAccount'](accountData());

		assert.deepStrictEqual({
			requiredForAccountA: provider['_serverRefreshRequiredAccounts'].has(accountId),
			requiredForAccountB: provider['_serverRefreshRequiredAccounts'].has('account-b'),
			blockedForAccountBWhileCurrent: provider.managedSettingsRefreshBlocked,
			blockedForAccountAOffline: restarted.managedSettingsRefreshBlocked,
		}, {
			requiredForAccountA: true,
			requiredForAccountB: false,
			// B's own org has no requirement and B was freshly fetched, so B is unaffected.
			blockedForAccountBWhileCurrent: false,
			// A's requirement survived B entirely.
			blockedForAccountAOffline: true,
		});
	});

	test('a requirement recorded before the per-account store survives the upgrade', async () => {
		// Builds predating the per-account store kept the flag only in the cached server bag. That
		// bag is written per account, so it can be attributed on first run rather than lost.
		const storageService = disposables.add(new InMemoryStorageService());
		storageService.store(
			'defaultAccount.cachedPolicyData',
			JSON.stringify({
				accountPolicyData: {
					accountId,
					policyData: { managedSettings: { [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true } },
					managedSettingsFetchedAt: Date.now(),
				},
			}),
			StorageScope.APPLICATION,
			StorageTarget.MACHINE,
		);
		const offline = new TestRequestService(async () => {
			throw new Error('managed settings unavailable');
		});

		const provider = await createProvider(offline, { storageService });

		assert.strictEqual(provider.managedSettingsRefreshBlocked, true);
	});

	test('the gate holds through the window in which the local channels are still loading', async () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const seedNative = { [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true };
		const onDidChangeSeed = disposables.add(new Emitter<ManagedSettingsData>());
		const offline = new TestRequestService(async () => {
			throw new Error('managed settings unavailable');
		});
		// A prior session in which MDM reported the requirement, recording the startup hint.
		const seeded = await createProvider(offline, {
			storageService,
			getNativeManagedSettings: () => seedNative,
			onDidChangeNativeManagedSettings: onDidChangeSeed.event,
		});
		onDidChangeSeed.fire(seedNative);
		assert.strictEqual(seeded.managedSettingsRefreshBlocked, true);

		// Relaunch: the native channel has not answered yet, so it reports nothing.
		let reportChannels: () => void = () => { };
		const pendingInitialize = new Promise<ManagedSettingsData>(resolve => {
			reportChannels = () => resolve({});
		});
		const relaunched = await createProvider(offline, { storageService, nativeInitialize: () => pendingInitialize });
		const blockedWhileLoading = relaunched.managedSettingsRefreshBlocked;

		// MDM has since been removed, so once the channel reports the requirement is lifted.
		reportChannels();
		await pendingInitialize;
		await new Promise<void>(resolve => setTimeout(resolve, 0));

		assert.deepStrictEqual({
			blockedWhileLoading,
			blockedOnceChannelsReported: relaunched.managedSettingsRefreshBlocked,
		}, {
			blockedWhileLoading: true,
			blockedOnceChannelsReported: false,
		});
	});

	test('removing the local setting clears the persisted startup hint', async () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const nativeWithFlag = { [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true };
		const onDidChangeSeed = disposables.add(new Emitter<ManagedSettingsData>());
		const offline = new TestRequestService(async () => {
			throw new Error('managed settings unavailable');
		});
		const seeded = await createProvider(offline, {
			storageService,
			getNativeManagedSettings: () => nativeWithFlag,
			onDidChangeNativeManagedSettings: onDidChangeSeed.event,
		});
		onDidChangeSeed.fire(nativeWithFlag);
		const hintAfterSeeding = seeded['_localRefreshRequiredHint'];

		// The admin removes the MDM value; the channel reports an empty bag.
		const onDidChangeCleared = disposables.add(new Emitter<ManagedSettingsData>());
		const cleared = await createProvider(offline, {
			storageService,
			getNativeManagedSettings: () => ({}),
			onDidChangeNativeManagedSettings: onDidChangeCleared.event,
		});
		onDidChangeCleared.fire({});

		assert.deepStrictEqual({
			hintAfterSeeding,
			hintAfterRemoval: cleared['_localRefreshRequiredHint'],
			// A relaunch must not keep blocking through its startup window.
			storedAfterRemoval: storageService.get('defaultAccount.managedSettingsRefreshRequired', StorageScope.APPLICATION),
		}, {
			hintAfterSeeding: true,
			hintAfterRemoval: false,
			storedAfterRemoval: undefined,
		});
	});

	function accountData() {
		return {
			accountId,
			defaultAccount: {
				authenticationProvider: { id: 'github', name: 'GitHub', enterprise: false },
				accountName: 'octocat',
				sessionId: 'session',
				enterprise: false,
			},
			policyData: null,
			copilotTokenInfo: null,
		};
	}

	async function refreshAccount(provider: DefaultAccountProvider, withSessions = sessions): Promise<void> {
		const account = await provider['getDefaultAccountFromAuthenticatedSessions'](
			{ id: 'github', name: 'GitHub', enterprise: false },
			withSessions,
			{ forceRefresh: true }
		);
		provider['setDefaultAccount'](account);
	}

	async function createProvider(requestService: TestRequestService, options?: {
		storageService?: IStorageService;
		nativeManagedSettings?: ManagedSettingsData;
		fileManagedSettings?: ManagedSettingsData;
		onDidChangeNativeManagedSettings?: Event<ManagedSettingsData>;
		getNativeManagedSettings?: () => ManagedSettingsData;
		nativeInitialize?: () => Promise<ManagedSettingsData>;
	}): Promise<DefaultAccountProvider> {
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(IAuthenticationService, {
			declaredProviders: [],
			isAuthenticationProviderRegistered: () => true,
			getAccounts: async () => [],
			getSessions: async () => [],
			onDidChangeDeclaredProviders: Event.None,
			onDidChangeSessions: Event.None,
			onDidRegisterAuthenticationProvider: Event.None,
			onDidUnregisterAuthenticationProvider: Event.None,
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
			remoteAuthority: undefined,
			isSessionsWindow: false,
		});
		instantiationService.stub(IProductService, {
			...TestProductService,
			version: '1.132.0',
			copilotVersions: { runtime: '0.0.344', sdk: '0.1.0' },
		});
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(IStorageService, options?.storageService ?? disposables.add(new InMemoryStorageService()));
		const getNativeManagedSettings = options?.getNativeManagedSettings ?? (() => options?.nativeManagedSettings ?? {});
		instantiationService.stub(INativeManagedSettingsService, {
			get managedSettings() { return getNativeManagedSettings(); },
			onDidChangeManagedSettings: options?.onDidChangeNativeManagedSettings ?? Event.None,
			initialize: options?.nativeInitialize ?? (async () => ({})),
			updatePolicyDefinitions: async () => ({}),
		});
		instantiationService.stub(IFileManagedSettingsService, {
			managedSettings: options?.fileManagedSettings ?? {},
			rawManagedSettings: {},
			onDidChangeManagedSettings: Event.None,
			onDidChangeRawManagedSettings: Event.None,
		});
		instantiationService.stub(IHostService, {
			hasFocus: true,
			onDidChangeFocus: Event.None,
		});
		instantiationService.stub(ICommandService, {});

		const provider = disposables.add(instantiationService.createInstance(DefaultAccountProvider, {
			preferredExtensions: [],
			authenticationProvider: {
				default: { id: 'github', name: 'GitHub' },
				enterprise: { id: 'github-enterprise', name: 'GitHub Enterprise' },
				enterpriseProviderConfig: 'github.copilot.advanced.authProvider',
				enterpriseProviderUriSetting: 'github-enterprise.uri',
				scopes: [['user:email']],
			},
			tokenEntitlementUrl: '',
			entitlementUrl: 'https://api.github.com/copilot_internal/user',
			mcpRegistryDataUrl: '',
			managedSettingsUrl: 'https://api.github.com/copilot_internal/managed_settings',
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

function jsonResponse(data: unknown, statusCode = 200): IRequestContext {
	return {
		res: { statusCode, headers: {} },
		stream: bufferToStream(VSBuffer.fromString(JSON.stringify(data))),
	};
}

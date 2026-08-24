/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { bufferToStream, VSBuffer } from '../../../../../base/common/buffer.js';
import { Event } from '../../../../../base/common/event.js';
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
import { IManagedSettingsFreshness, ManagedSettingsFreshnessFailure, ManagedSettingsFreshnessState } from '../../../../../platform/policy/common/managedSettingsFreshness.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IRequestService } from '../../../../../platform/request/common/request.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
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
			},
			data: cachedPolicy.policyData,
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
		await provider['getManagedSettings'](sessions, retryPolicy, { forceRefresh: true });

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
			},
		});
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
		});

		resolveRequest(jsonResponse({ forceRemoteSettingsRefresh: true }));
		await refresh;
		assert.strictEqual(provider.managedSettingsFreshness.state, ManagedSettingsFreshnessState.Satisfied);
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
		}, { forceRefresh: true });

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
		});
	});

	test('rate-limited forced refresh records retry timing', async () => {
		const requestService = new TestRequestService(async () => jsonResponse({}, 429, { 'retry-after': '60' }));
		const provider = await createProvider(requestService, { [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true });

		await provider['getManagedSettings'](sessions, undefined);

		const freshness = provider.managedSettingsFreshness;
		assert.deepStrictEqual({
			...describeFreshness(freshness),
			hasFutureRetry: freshness.state === ManagedSettingsFreshnessState.Blocked
				&& freshness.failure === ManagedSettingsFreshnessFailure.RateLimited
				&& freshness.retryAfter > Date.now(),
		}, {
			state: ManagedSettingsFreshnessState.Blocked,
			source: 'nativeMdm',
			failure: ManagedSettingsFreshnessFailure.RateLimited,
			hasLastAttempt: true,
			hasRetryAfter: true,
			hasFutureRetry: true,
		});
	});

	test('expired rate-limit deadline falls back to the normal poll interval', async () => {
		const provider = await createProvider(new TestRequestService(async () => jsonResponse({})));
		provider['_managedSettingsFreshness'] = {
			state: ManagedSettingsFreshnessState.Blocked,
			source: 'server',
			failure: ManagedSettingsFreshnessFailure.RateLimited,
			retryAfter: Date.now() - 1,
		};

		assert.strictEqual(provider['getAccountDataPollDelay'](), 60 * 60 * 1000);
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

	test('forced refresh without authentication fails closed but leaves sign-in available', async () => {
		const provider = await createProvider(new TestRequestService(async () => jsonResponse({})), { [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true });

		assert.deepStrictEqual(describeFreshness(provider.managedSettingsFreshness), {
			state: ManagedSettingsFreshnessState.Blocked,
			source: 'nativeMdm',
			failure: ManagedSettingsFreshnessFailure.NoToken,
			hasLastAttempt: false,
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

	async function createProvider(
		requestService: TestRequestService,
		nativeManagedSettings: ManagedSettingsData = {},
		fileManagedSettings: ManagedSettingsData = {},
		managedSettingsUrl = 'https://api.github.com/copilot_internal/managed_settings'
	): Promise<DefaultAccountProvider> {
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
				enterpriseProviderUriSetting: 'github-enterprise.uri',
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
			const { lastAttemptAt, ...rest } = freshness;
			return { ...rest, hasLastAttempt: lastAttemptAt !== undefined };
		}
		if (freshness.state === ManagedSettingsFreshnessState.Blocked) {
			const { lastAttemptAt, ...rest } = freshness;
			if (rest.failure === ManagedSettingsFreshnessFailure.RateLimited) {
				const { retryAfter, ...withoutRetryAfter } = rest;
				return { ...withoutRetryAfter, hasLastAttempt: lastAttemptAt !== undefined, hasRetryAfter: retryAfter !== undefined };
			}
			return { ...rest, hasLastAttempt: lastAttemptAt !== undefined };
		}
		return freshness;
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

function jsonResponse(data: unknown, statusCode = 200, headers: Record<string, string> = {}): IRequestContext {
	return {
		res: { statusCode, headers },
		stream: bufferToStream(VSBuffer.fromString(JSON.stringify(data))),
	};
}

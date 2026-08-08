/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
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
import { COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY } from '../../../../../platform/policy/common/copilotManagedSettings.js';
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
			userAgent: requestService.requests[0].headers?.['User-Agent'],
			first: first.data,
			second: second.data,
		}, {
			requestCount: 1,
			userAgent: 'vscode/1.132.0 copilot-runtime/1.0.80',
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
			error_code: 'copilot_runtime_update_required',
			client_version: '1.0.80',
			minimum_client_version: '1.0.81',
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
				errorCode: 'copilot_runtime_update_required',
				clientVersion: '1.0.80',
				minimumClientVersion: '1.0.81',
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
			compatibilityError: { errorCode: 'copilot_runtime_update_required' },
		});
	});

	test('fresh success returns a compatible result for the policy commit boundary', async () => {
		const responses = [
			jsonResponse({ error_code: 'copilot_runtime_update_required', minimum_client_version: '1.0.81' }, 466),
			jsonResponse({ permissions: { disableBypassPermissionsMode: 'disable' } }),
		];
		const requestService = new TestRequestService(async () => {
			const response = responses.shift();
			assert.ok(response);
			return response;
		});
		const provider = await createProvider(requestService);
		const cachedPolicy = createCachedPolicy(false);

		await provider['getManagedSettings'](sessions, cachedPolicy);
		const result = await provider['getManagedSettings'](sessions, cachedPolicy, { forceRefresh: true });

		assert.deepStrictEqual({
			requestCount: requestService.requestCount,
			data: result.data,
			resultCompatibilityError: result.compatibilityError,
			activeCompatibilityError: provider.managedSettingsCompatibilityError,
		}, {
			requestCount: 2,
			data: { managedSettings: { 'permissions.disableBypassPermissionsMode': 'disable' } },
			resultCompatibilityError: null,
			activeCompatibilityError: {
				errorCode: 'copilot_runtime_update_required',
				minimumClientVersion: '1.0.81',
			},
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

	test('transient failure does not clear an update-required state', async () => {
		let requestCount = 0;
		const requestService = new TestRequestService(async () => {
			requestCount++;
			if (requestCount === 1) {
				return jsonResponse({ error_code: 'copilot_runtime_update_required' }, 466);
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
			compatibilityError: { errorCode: 'copilot_runtime_update_required' },
		});
	});

	test('compatible state is published after updated policy data', async () => {
		const provider = await createProvider(new TestRequestService(async () => jsonResponse({})));
		provider['setManagedSettingsCompatibilityError']({ errorCode: 'copilot_runtime_update_required' });
		const events: string[] = [];
		disposables.add(provider.onDidChangePolicyData(() => {
			events.push(`policy:${provider.managedSettingsCompatibilityError ? 'blocked' : 'compatible'}`);
		}));
		disposables.add(provider.onDidChangeManagedSettingsCompatibilityError(error => {
			events.push(`compatibility:${error ? 'blocked' : 'compatible'}`);
		}));

		provider['setDefaultAccount']({
			accountId,
			defaultAccount: {
				authenticationProvider: { id: 'github', name: 'GitHub', enterprise: false },
				accountName: 'octocat',
				sessionId: 'session',
				enterprise: false,
			},
			policyData: { accountId, policyData: {} },
			copilotTokenInfo: null,
		});

		assert.deepStrictEqual(events, ['policy:blocked', 'compatibility:compatible']);
	});

	test('successful full refresh clears a prior update-required state', async () => {
		const requestService = new TestRequestService(async options => {
			if (options.url?.endsWith('/copilot_internal/user')) {
				return jsonResponse({ chat_enabled: true });
			}
			if (options.url?.endsWith('/copilot_internal/managed_settings')) {
				return jsonResponse({});
			}
			throw new Error(`Unexpected request: ${options.url}`);
		});
		const provider = await createProvider(requestService);
		provider['setManagedSettingsCompatibilityError']({ errorCode: 'copilot_runtime_update_required' });

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

	async function createProvider(requestService: TestRequestService): Promise<DefaultAccountProvider> {
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
			copilotVersions: { runtime: '1.0.80', sdk: '1.0.9' },
		});
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
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

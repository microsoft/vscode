/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { bufferToStream, VSBuffer } from '../../../../../base/common/buffer.js';
import { Event } from '../../../../../base/common/event.js';
import { IRequestContext } from '../../../../../base/parts/request/common/request.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY, INativeManagedSettingsService } from '../../../../../platform/policy/common/copilotManagedSettings.js';
import { IRequestService } from '../../../../../platform/request/common/request.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { AuthenticationSession, IAuthenticationExtensionsService, IAuthenticationService } from '../../../authentication/common/authentication.js';
import { IWorkbenchEnvironmentService } from '../../../environment/common/environmentService.js';
import { IExtensionService } from '../../../extensions/common/extensions.js';
import { IHostService } from '../../../host/browser/host.js';
import { DefaultAccountProvider } from '../../browser/defaultAccount.js';
import { IManagedSettingsResponse } from '../../browser/managedSettings.js';

suite('DefaultAccountProvider managed settings', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const accountId = 'account';
	const sessions: AuthenticationSession[] = [{
		id: 'session',
		accessToken: 'token',
		account: { id: accountId, label: 'octocat' },
		scopes: ['user:email'],
	}];

	test('cached server control forces only the first fetch', async () => {
		const requestService = new TestRequestService(async () => jsonResponse({
			forceRemoteSettingsRefresh: true,
			permissions: { disableBypassPermissionsMode: 'disable' },
		}));
		const provider = await createProvider({}, requestService);
		const cachedPolicy = createCachedPolicy(true);

		const first = await provider['getManagedSettings'](sessions, cachedPolicy);
		const second = await provider['getManagedSettings'](sessions, cachedPolicy);

		assert.deepStrictEqual({
			requestCount: requestService.requestCount,
			first: first.data,
			second: second.data,
		}, {
			requestCount: 1,
			first: cachedPolicy.policyData,
			second: cachedPolicy.policyData,
		});
	});

	test('native false suppresses cached server true', async () => {
		const requestService = new TestRequestService(async () => {
			throw new Error('unexpected request');
		});
		const provider = await createProvider({ [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: false }, requestService);
		const cachedPolicy = createCachedPolicy(true);

		const result = await provider['getManagedSettings'](sessions, cachedPolicy);

		assert.deepStrictEqual({
			requestCount: requestService.requestCount,
			data: result.data,
		}, {
			requestCount: 0,
			data: cachedPolicy.policyData,
		});
	});

	test('failed forced fetch retains cached managed settings', async () => {
		const requestService = new TestRequestService(async () => {
			throw new Error('managed settings unavailable');
		});
		const provider = await createProvider({ [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true }, requestService);
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

	async function createProvider(nativeManagedSettings: Record<string, boolean>, requestService: TestRequestService): Promise<DefaultAccountProvider> {
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
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
		instantiationService.stub(IHostService, {
			hasFocus: true,
			onDidChangeFocus: Event.None,
		});
		instantiationService.stub(ICommandService, {});
		instantiationService.stub(INativeManagedSettingsService, {
			managedSettings: nativeManagedSettings,
			initialize: async () => nativeManagedSettings,
			onDidChangeManagedSettings: Event.None,
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
			entitlementUrl: '',
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

	constructor(private readonly requestHandler: () => Promise<IRequestContext>) { }

	request(): Promise<IRequestContext> {
		this.requestCount++;
		return this.requestHandler();
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

function jsonResponse(data: IManagedSettingsResponse): IRequestContext {
	return {
		res: { statusCode: 200, headers: {} },
		stream: bufferToStream(VSBuffer.fromString(JSON.stringify(data))),
	};
}

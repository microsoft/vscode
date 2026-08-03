/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { bufferToStream, VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IRequestContext, IRequestOptions } from '../../../../../base/parts/request/common/request.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IRequestService } from '../../../../../platform/request/common/request.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { DefaultAccountProvider, IDefaultAccountConfig } from '../../browser/defaultAccount.js';
import { AuthenticationSession, IAuthenticationExtensionsService, IAuthenticationService } from '../../../authentication/common/authentication.js';
import { IWorkbenchEnvironmentService } from '../../../environment/common/environmentService.js';
import { IExtensionService } from '../../../extensions/common/extensions.js';
import { IHostService } from '../../../host/browser/host.js';

const entitlementUrl = 'https://api.example.test/copilot_internal/user';
const tokenEntitlementUrl = 'https://api.example.test/copilot_internal/v2/token';
const managedSettingsUrl = 'https://api.example.test/copilot_internal/managed_settings';

const defaultAccountConfig: IDefaultAccountConfig = {
	preferredExtensions: [],
	authenticationProvider: {
		default: { id: 'github', name: 'GitHub' },
		enterprise: { id: 'github-enterprise', name: 'GitHub Enterprise' },
		enterpriseProviderConfig: 'github.copilot.advanced.authProvider',
		enterpriseProviderUriSetting: 'github-enterprise.uri',
		scopes: [['read:user']],
	},
	entitlementUrl,
	tokenEntitlementUrl,
	mcpRegistryDataUrl: '',
	managedSettingsUrl,
};

const authenticationSession: AuthenticationSession = {
	id: 'session-1',
	accessToken: 'token',
	account: { id: 'account-1', label: 'octocat' },
	scopes: ['read:user'],
};

function response(statusCode: number, body: string): IRequestContext {
	return {
		res: { statusCode, headers: {} },
		stream: bufferToStream(VSBuffer.fromString(body)),
	};
}

class TestRequestService extends mock<IRequestService>() {
	managedSettingsRequestCount = 0;

	constructor(private readonly managedSettingsResponses: Array<IRequestContext | Error>) {
		super();
	}

	override async request(options: IRequestOptions, _token: CancellationToken): Promise<IRequestContext> {
		switch (options.url) {
			case entitlementUrl:
				return response(200, JSON.stringify({ chat_enabled: true, cloud_session_storage_enabled: true }));
			case tokenEntitlementUrl:
				return response(200, JSON.stringify({ token: 'agent_mode=1;editor_preview_features=1;mcp=0:' }));
			case managedSettingsUrl: {
				this.managedSettingsRequestCount++;
				const next = this.managedSettingsResponses.shift();
				if (!next) {
					throw new Error('No managed-settings response configured');
				}
				if (next instanceof Error) {
					throw next;
				}
				return next;
			}
			default:
				throw new Error(`Unexpected request URL: ${options.url}`);
		}
	}
}

async function createProvider(disposables: Pick<DisposableStore, 'add'>, managedSettingsResponses: Array<IRequestContext | Error>) {
	const instantiationService = disposables.add(new TestInstantiationService());
	const requestService = new TestRequestService(managedSettingsResponses);

	instantiationService.stub(IConfigurationService, new TestConfigurationService());
	instantiationService.stub(IAuthenticationService, new class extends mock<IAuthenticationService>() {
		override readonly declaredProviders = [{ id: 'github', label: 'GitHub' }];
		override readonly onDidChangeSessions = Event.None;
		override readonly onDidChangeDeclaredProviders = Event.None;
		override readonly onDidRegisterAuthenticationProvider = Event.None;
		override readonly onDidUnregisterAuthenticationProvider = Event.None;
		override isAuthenticationProviderRegistered(): boolean { return true; }
		override async getAccounts() { return [authenticationSession.account]; }
		override async getSessions() { return [authenticationSession]; }
	});
	instantiationService.stub(IAuthenticationExtensionsService, new class extends mock<IAuthenticationExtensionsService>() {
		override readonly onDidChangeAccountPreference = Event.None;
		override getAccountPreference(): undefined { return undefined; }
	});
	instantiationService.stub(ITelemetryService, NullTelemetryService);
	instantiationService.stub(IExtensionService, new class extends mock<IExtensionService>() {
		override whenInstalledExtensionsRegistered(): Promise<boolean> { return Promise.resolve(true); }
	});
	instantiationService.stub(IRequestService, requestService);
	instantiationService.stub(ILogService, new NullLogService());
	instantiationService.stub(IWorkbenchEnvironmentService, new class extends mock<IWorkbenchEnvironmentService>() {
		override readonly remoteAuthority = undefined;
		override readonly isSessionsWindow = true;
	});
	instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
	instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
	instantiationService.stub(IHostService, new class extends mock<IHostService>() {
		override readonly hasFocus = true;
		override readonly onDidChangeFocus = Event.None;
	});
	instantiationService.stub(ICommandService, new class extends mock<ICommandService>() { });

	const provider = disposables.add(instantiationService.createInstance(DefaultAccountProvider, defaultAccountConfig));
	await provider.refresh();
	return { provider, requestService };
}

suite('DefaultAccountProvider - managed settings', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('failed responses do not become fresh or successful', async () => {
		const cases = [
			{ name: 'network failure', response: new Error('offline'), status: 'no-response' },
			{ name: 'server failure', response: response(500, '{}'), status: 500 },
			{ name: 'not found', response: response(404, '{}'), status: 404 },
			{ name: 'parse failure', response: response(200, '{'), status: 'parse-error' },
		] as const;
		const actual = [];

		for (const testCase of cases) {
			const { provider } = await createProvider(disposables, [testCase.response]);
			actual.push({
				name: testCase.name,
				status: provider.managedSettingsFetchStatus,
				fetchedAt: provider.managedSettingsFetchedAt,
				managedSettings: provider.policyData?.managedSettings,
			});
		}

		assert.deepStrictEqual(actual, cases.map(testCase => ({
			name: testCase.name,
			status: testCase.status,
			fetchedAt: null,
			managedSettings: undefined,
		})));
	});

	test('preserves prior policy after failure, retries promptly, and accepts confirmed empty policy', async () => {
		const { provider, requestService } = await createProvider(disposables, [
			response(200, JSON.stringify({ permissions: { disableBypassPermissionsMode: 'disable' } })),
			new Error('offline'),
			response(200, '{}'),
		]);
		const initialFetchedAt = provider.managedSettingsFetchedAt;

		await provider.refresh({ forceRefresh: true });
		const afterFailure = {
			status: provider.managedSettingsFetchStatus,
			fetchedAt: provider.managedSettingsFetchedAt,
			managedSettings: provider.policyData?.managedSettings,
		};

		await provider.refresh();

		assert.deepStrictEqual({
			initial: {
				status: 'ok',
				hasFetchedAt: typeof initialFetchedAt === 'number',
			},
			afterFailure,
			afterRetry: {
				status: provider.managedSettingsFetchStatus,
				hasFetchedAt: typeof provider.managedSettingsFetchedAt === 'number',
				managedSettings: provider.policyData?.managedSettings,
			},
			requestCount: requestService.managedSettingsRequestCount,
		}, {
			initial: {
				status: 'ok',
				hasFetchedAt: true,
			},
			afterFailure: {
				status: 'no-response',
				fetchedAt: null,
				managedSettings: { 'permissions.disableBypassPermissionsMode': 'disable' },
			},
			afterRetry: {
				status: 'ok',
				hasFetchedAt: true,
				managedSettings: {},
			},
			requestCount: 3,
		});
	});
});

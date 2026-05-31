/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SessionOptions } from '@github/copilot/sdk';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IAuthenticationService } from '../../../../../platform/authentication/common/authentication';
import { ConfigKey, IConfigurationService } from '../../../../../platform/configuration/common/configurationService';
import { IEnvService } from '../../../../../platform/env/common/envService';
import { IVSCodeExtensionContext } from '../../../../../platform/extContext/common/extensionContext';
import { ILogService } from '../../../../../platform/log/common/logService';
import { DisposableStore } from '../../../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { CopilotCLISDK } from '../copilotCli';

type TokenAuthInfo = Extract<NonNullable<SessionOptions['authInfo']>, { type: 'token' }>;
type HmacAuthInfo = Extract<NonNullable<SessionOptions['authInfo']>, { type: 'hmac' }>;

describe('CopilotCLISDK Authentication', () => {
	const disposables = new DisposableStore();
	let instantiationService: IInstantiationService;
	let logService: ILogService;

	class TestCopilotCLISDK extends CopilotCLISDK {
		protected override async ensureShims(): Promise<void> {
			return;
		}
	}

	// Helper to create a mock extension context
	function createMockExtensionContext(): IVSCodeExtensionContext {
		return {
			workspaceState: {
				get: () => ({}),
				update: async () => { },
				keys: () => []
			}
		} as unknown as IVSCodeExtensionContext;
	}

	// Helper to create a mock env service
	function createMockEnvService(): IEnvService {
		return {} as unknown as IEnvService;
	}

	beforeEach(() => {
		const services = disposables.add(createExtensionUnitTestingServices());
		const accessor = services.createTestingAccessor();
		instantiationService = services.seal();
		logService = accessor.get(ILogService);
	});

	afterEach(() => {
		disposables.clear();
	});

	it('should skip token validation when proxy URL is configured', async () => {
		// Mock configuration to return a proxy URL
		const mockConfigService = {
			getConfig(key: unknown) {
				if (key === ConfigKey.Shared.DebugOverrideProxyUrl) {
					return 'https://proxy.example.com';
				}
				return undefined;
			}
		} as unknown as IConfigurationService;

		const mockAuthService = {
			async getGitHubSession(): Promise<undefined> {
				// This should not be called when proxy is configured
				throw new Error('getGitHubSession should not be called when proxy is configured');
			}
		} as unknown as IAuthenticationService;

		const sdk = new TestCopilotCLISDK(
			createMockExtensionContext(),
			createMockEnvService(),
			logService,
			instantiationService,
			mockAuthService,
			mockConfigService
		);

		const authInfo = await sdk.getAuthInfo() as HmacAuthInfo;

		expect(authInfo.type).toBe('hmac');
		expect(authInfo.hmac).toBe('empty');
		expect(authInfo.host).toBe('https://github.com');
		expect(authInfo.copilotUser?.endpoints?.api).toBe('https://proxy.example.com');
	});

	it('should call getGitHubSession when no proxy URL is configured', async () => {
		let getGitHubSessionCalled = false;

		// Mock configuration to return no proxy URLs
		const mockConfigService = {
			getConfig() {
				return undefined;
			}
		} as unknown as IConfigurationService;

		const mockAuthService = {
			async getGitHubSession() {
				getGitHubSessionCalled = true;
				return {
					accessToken: 'test-token',
					id: 'test-id',
					scopes: [] as readonly string[],
					account: { id: 'test-account', label: 'Test User' }
				};
			}
		} as unknown as IAuthenticationService;

		const sdk = new TestCopilotCLISDK(
			createMockExtensionContext(),
			createMockEnvService(),
			logService,
			instantiationService,
			mockAuthService,
			mockConfigService
		);

		const authInfo = await sdk.getAuthInfo() as TokenAuthInfo;

		expect(getGitHubSessionCalled).toBe(true);
		expect(authInfo.type).toBe('token');
		expect(authInfo.token).toBe('test-token');
		expect(authInfo.host).toBe('https://github.com');
	});

	it('should return empty token when getGitHubSession returns undefined and no proxy is configured', async () => {
		// Mock configuration to return no proxy URLs
		const mockConfigService = {
			getConfig() {
				return undefined;
			}
		} as unknown as IConfigurationService;

		const mockAuthService = {
			async getGitHubSession() {
				return undefined;
			}
		} as unknown as IAuthenticationService;

		const sdk = new TestCopilotCLISDK(
			createMockExtensionContext(),
			createMockEnvService(),
			logService,
			instantiationService,
			mockAuthService,
			mockConfigService
		);

		const authInfo = await sdk.getAuthInfo() as TokenAuthInfo;

		expect(authInfo.type).toBe('token');
		expect(authInfo.token).toBe('');
		expect(authInfo.host).toBe('https://github.com');
	});
});

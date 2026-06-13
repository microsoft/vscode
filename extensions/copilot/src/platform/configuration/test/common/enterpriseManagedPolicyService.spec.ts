/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, expect, suite, test, vi } from 'vitest';
import { IAuthenticationService } from '../../../authentication/common/authentication';
import { ICAPIClientService } from '../../../endpoint/common/capiClient';
import { ILogService } from '../../../log/common/logService';
import { FetchOptions, HeadersImpl, IFetcherService, Response } from '../../../networking/common/fetcherService';
import { ConfigKey, EnterprisePolicyConfigValue, IConfigurationService } from '../../common/configurationService';
import { EnterpriseManagedPolicyService, extractEnterprisePolicyFromManagedSettings, normalizeEnterprisePolicyValue } from '../../common/enterpriseManagedPolicyService';

suite('EnterpriseManagedPolicyService', () => {
	let localPolicy: EnterprisePolicyConfigValue;
	let authToken: string | undefined;
	let fetchResponseFactory: () => Promise<Response>;
	let fetchCalls = 0;

	beforeEach(() => {
		localPolicy = null;
		authToken = 'github-user-token';
		fetchCalls = 0;
		fetchResponseFactory = async () => Response.fromText(200, 'OK', new HeadersImpl({}), '{}', 'test-stub');
	});

	function createService(): EnterpriseManagedPolicyService {
		const configurationService = {
			getConfig: <T>(key: { id: string }): T => {
				if (key.id === ConfigKey.EnterprisePolicy.id) {
					return localPolicy as T;
				}
				throw new Error(`Unexpected config key: ${key.id}`);
			},
		} as unknown as IConfigurationService;

		const authenticationService = {
			anyGitHubSession: authToken ? { accessToken: authToken } : undefined,
		} as unknown as IAuthenticationService;

		const capiClientService = {
			dotcomAPIURL: 'https://api.github.com',
		} as unknown as ICAPIClientService;

		const fetcherService = {
			fetch: async (_url: string, _options: FetchOptions) => {
				fetchCalls++;
				return fetchResponseFactory();
			},
		} as unknown as IFetcherService;

		const logService = {
			debug: vi.fn(),
		} as unknown as ILogService;

		return new EnterpriseManagedPolicyService(authenticationService, capiClientService, configurationService, fetcherService, logService);
	}

	test('prefers managed settings policy when present', async () => {
		localPolicy = 'always reply in plain text';
		fetchResponseFactory = async () => Response.fromText(200, 'OK', new HeadersImpl({}), JSON.stringify({
			'github.copilot.enterprisePolicy': {
				responseStyle: 'always reply in pirate speak',
			},
		}), 'test-stub');

		const service = createService();
		const value = await service.getEffectiveEnterprisePolicy();

		expect(value).toContain('"responseStyle": "always reply in pirate speak"');
	});

	test('falls back to local config when managed settings are missing', async () => {
		localPolicy = 'always reply in pirate speak';
		fetchResponseFactory = async () => Response.fromText(200, 'OK', new HeadersImpl({}), '{}', 'test-stub');

		const service = createService();
		const value = await service.getEffectiveEnterprisePolicy();

		expect(value).toBe('always reply in pirate speak');
	});

	test('returns undefined when both managed settings and local fallback are absent', async () => {
		localPolicy = null;
		fetchResponseFactory = async () => Response.fromText(200, 'OK', new HeadersImpl({}), '{}', 'test-stub');

		const service = createService();
		const value = await service.getEffectiveEnterprisePolicy();

		expect(value).toBeUndefined();
	});

	test('handles invalid managed response gracefully and falls back', async () => {
		localPolicy = 'fallback policy';
		fetchResponseFactory = async () => Response.fromText(200, 'OK', new HeadersImpl({}), '{ not-valid-json', 'test-stub');

		const service = createService();
		const value = await service.getEffectiveEnterprisePolicy();

		expect(value).toBe('fallback policy');
	});

	test('caches managed settings fetch results', async () => {
		fetchResponseFactory = async () => Response.fromText(200, 'OK', new HeadersImpl({}), JSON.stringify({
			'github.copilot.enterprisePolicy': 'always reply in pirate speak',
		}), 'test-stub');

		const service = createService();
		await service.getEffectiveEnterprisePolicy();
		await service.getEffectiveEnterprisePolicy();

		expect(fetchCalls).toBe(1);
	});

	test('extractEnterprisePolicyFromManagedSettings reads dotted and nested keys', () => {
		expect(extractEnterprisePolicyFromManagedSettings({ 'github.copilot.enterprisePolicy': 'x' })).toBe('x');
		expect(extractEnterprisePolicyFromManagedSettings({ github: { copilot: { enterprisePolicy: { y: 1 } } } })).toEqual({ y: 1 });
		expect(extractEnterprisePolicyFromManagedSettings({})).toBeUndefined();
		expect(extractEnterprisePolicyFromManagedSettings('nope')).toBeUndefined();
	});

	test('normalizeEnterprisePolicyValue trims empty strings', () => {
		expect(normalizeEnterprisePolicyValue('   ')).toBeUndefined();
		expect(normalizeEnterprisePolicyValue(' pirate ')).toBe('pirate');
		expect(normalizeEnterprisePolicyValue({ x: true })).toContain('"x": true');
	});
});

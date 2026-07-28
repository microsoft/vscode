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
import { EnterpriseManagedPolicyService, extractEMSSettingsFromManagedSettings, extractEnterprisePolicyFromManagedSettings, normalizeEnterprisePolicyValue } from '../../common/enterpriseManagedPolicyService';

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

	test('prefers managed settings emsPrompt over github.copilot.enterprisePolicy', async () => {
		localPolicy = 'always reply in plain text';
		fetchResponseFactory = async () => Response.fromText(200, 'OK', new HeadersImpl({}), JSON.stringify({
			emsPrompt: 'Speak like Yoda to the User',
			'github.copilot.enterprisePolicy': 'this should be ignored',
		}), 'test-stub');

		const service = createService();
		const value = await service.getEffectiveEnterprisePolicy();

		expect(value).toContain('Speak like Yoda to the User');
		expect(value).not.toContain('this should be ignored');
	});

	test('prefers managed settings github.copilot.enterprisePolicy when emsPrompt absent', async () => {
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

		expect(value).toContain('always reply in pirate speak');
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

		expect(value).toContain('Enterprise policy: fallback policy');
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

	test('includes toolAllowList prompt when present', async () => {
		fetchResponseFactory = async () => Response.fromText(200, 'OK', new HeadersImpl({}), JSON.stringify({
			toolAllowList: ['read_file', 'run_terminal'],
		}), 'test-stub');

		const service = createService();
		const value = await service.getEffectiveEnterprisePolicy();

		expect(value).toContain('read_file, run_terminal, run_in_terminal');
		expect(value).toContain('restricts you to the following tools');
	});

	test('includes toolDenyList prompt when present and no allowList', async () => {
		fetchResponseFactory = async () => Response.fromText(200, 'OK', new HeadersImpl({}), JSON.stringify({
			toolDenyList: ['web_fetch'],
		}), 'test-stub');

		const service = createService();
		const value = await service.getEffectiveEnterprisePolicy();

		expect(value).toContain('web_fetch');
		expect(value).toContain('prohibited the following tools');
	});

	test('expands CLI tool aliases in toolDenyList for VS Code prompts', async () => {
		fetchResponseFactory = async () => Response.fromText(200, 'OK', new HeadersImpl({}), JSON.stringify({
			toolDenyList: ['web_fetch'],
		}), 'test-stub');

		const service = createService();
		const value = await service.getEffectiveEnterprisePolicy();

		expect(value).toContain('web_fetch');
		expect(value).toContain('fetch_webpage');
	});

	test('ignores toolDenyList when toolAllowList is present', async () => {
		fetchResponseFactory = async () => Response.fromText(200, 'OK', new HeadersImpl({}), JSON.stringify({
			toolAllowList: ['read_file'],
			toolDenyList: ['web_fetch'],
		}), 'test-stub');

		const service = createService();
		const value = await service.getEffectiveEnterprisePolicy();

		expect(value).toContain('read_file');
		expect(value).not.toContain('restricted access');
	});

	test('expands CLI tool aliases in toolAllowList for VS Code prompts', async () => {
		fetchResponseFactory = async () => Response.fromText(200, 'OK', new HeadersImpl({}), JSON.stringify({
			toolAllowList: ['run_terminal'],
		}), 'test-stub');

		const service = createService();
		const value = await service.getEffectiveEnterprisePolicy();

		expect(value).toContain('run_terminal');
		expect(value).toContain('run_in_terminal');
	});

	test('builds combined prompt from all sections', async () => {
		fetchResponseFactory = async () => Response.fromText(200, 'OK', new HeadersImpl({}), JSON.stringify({
			emsPrompt: 'Speak like Yoda',
			toolDenyList: ['web_fetch'],
		}), 'test-stub');

		const service = createService();
		const value = await service.getEffectiveEnterprisePolicy();

		expect(value).toContain('Speak like Yoda');
		expect(value).toContain('web_fetch');
	});

	test('includes bypass-permissions prompt when disabled by policy', async () => {
		fetchResponseFactory = async () => Response.fromText(200, 'OK', new HeadersImpl({}), JSON.stringify({
			permissions: { disableBypassPermissionsMode: 'disable' },
		}), 'test-stub');

		const service = createService();
		const value = await service.getEffectiveEnterprisePolicy();

		expect(value).toContain('Bypass-permissions mode is disabled by policy');
	});

	test('omits bypass-permissions prompt when not disabled', async () => {
		fetchResponseFactory = async () => Response.fromText(200, 'OK', new HeadersImpl({}), JSON.stringify({
			emsPrompt: 'Speak like Yoda',
			permissions: { disableBypassPermissionsMode: 'enable' },
		}), 'test-stub');

		const service = createService();
		const value = await service.getEffectiveEnterprisePolicy();

		expect(value).not.toContain('Bypass-permissions mode is disabled');
	});

	test('extractEMSSettingsFromManagedSettings extracts all fields', () => {
		const result = extractEMSSettingsFromManagedSettings({
			emsPrompt: 'Speak like Yoda',
			'github.copilot.enterprisePolicy': 'fallback policy',
			toolAllowList: ['read_file'],
			toolDenyList: ['web_fetch'],
		});
		expect(result).toBeDefined();
		expect(result?.emsPrompt).toBe('Speak like Yoda');
		expect(result?.enterprisePolicy).toBe('fallback policy');
		expect(result?.toolAllowList).toEqual(['read_file']);
		expect(result?.toolDenyList).toEqual(['web_fetch']);
	});

	test('extractEMSSettingsFromManagedSettings returns undefined for empty object', () => {
		expect(extractEMSSettingsFromManagedSettings({})).toBeUndefined();
		expect(extractEMSSettingsFromManagedSettings('nope')).toBeUndefined();
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

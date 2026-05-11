/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DeferredPromise } from '../../../../util/vs/base/common/async';
import { Event } from '../../../../util/vs/base/common/event';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { ICAPIClientService } from '../../../endpoint/common/capiClient';
import { IDomainService } from '../../../endpoint/common/domainService';
import { IEnvService } from '../../../env/common/envService';
import { NullBaseOctoKitService } from '../../../github/common/nullOctokitServiceImpl';
import { ILogService } from '../../../log/common/logService';
import { FetchOptions, IAbortController, IFetcherService, PaginationOptions, Response, WebSocketConnection } from '../../../networking/common/fetcherService';
import { ITelemetryService } from '../../../telemetry/common/telemetry';
import { createFakeResponse } from '../../../test/node/fetcher';
import { createPlatformServices, ITestingServicesAccessor } from '../../../test/node/services';
import { CopilotToken, createTestExtendedTokenInfo, isErrorEnvelope, isStandardErrorEnvelope, isTokenEnvelope, validateTokenEnvelope } from '../../common/copilotToken';
import { BaseCopilotTokenManager, CopilotTokenManagerFromGitHubToken } from '../../node/copilotTokenManager';

// This is a fake version of CopilotTokenManagerFromGitHubToken.
class RefreshFakeCopilotTokenManager extends BaseCopilotTokenManager {
	calls = 0;
	constructor(
		private readonly throwErrorCount: number,
		@ILogService logService: ILogService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IDomainService domainService: IDomainService,
		@ICAPIClientService capiClientService: ICAPIClientService,
		@IFetcherService fetcherService: IFetcherService,
		@IEnvService envService: IEnvService,
	) {
		super(new NullBaseOctoKitService(capiClientService, fetcherService, logService, telemetryService), logService, telemetryService, domainService, capiClientService, fetcherService, envService);
	}

	async getCopilotToken(force?: boolean): Promise<CopilotToken> {
		this.calls++;
		await new Promise(resolve => setTimeout(resolve, 10));
		if (this.calls === this.throwErrorCount) {
			throw new Error('fake error');
		}
		if (!force && this.copilotToken) {
			return new CopilotToken(this.copilotToken);
		}
		this.copilotToken = createTestExtendedTokenInfo({ token: 'done', username: 'fake', copilot_plan: 'unknown' });
		return new CopilotToken(this.copilotToken);
	}
}

describe('Copilot token unit tests', function () {
	let accessor: ITestingServicesAccessor;
	let disposables: DisposableStore;

	beforeEach(() => {
		disposables = new DisposableStore();
		accessor = disposables.add(createPlatformServices().createTestingAccessor());
	});

	afterEach(() => {
		disposables.dispose();
	});

	it('includes editor information in token request', async function () {
		const fetcher = new StaticFetcherService({
			token: 'token',
			expires_at: 1,
			refresh_in: 1,
		});
		const testingServiceCollection = createPlatformServices();
		testingServiceCollection.define(IFetcherService, fetcher);
		accessor = disposables.add(testingServiceCollection.createTestingAccessor());

		const tokenManager = disposables.add(accessor.get(IInstantiationService).createInstance(RefreshFakeCopilotTokenManager, 1));
		await tokenManager.authFromGitHubToken('fake-token', 'fake-user');

		expect(fetcher.requests.size).toBe(2);
	});

	it(`notifies about token on token retrieval`, async function () {
		const tokenManager = disposables.add(accessor.get(IInstantiationService).createInstance(RefreshFakeCopilotTokenManager, 3));
		const deferredTokenPromise = new DeferredPromise<CopilotToken>();
		tokenManager.onDidCopilotTokenRefresh(async () => {
			const notifiedValue = await tokenManager.getCopilotToken();
			deferredTokenPromise.complete(notifiedValue);
		});
		await tokenManager.getCopilotToken(true);
		const notifiedValue = await deferredTokenPromise.p;
		expect(notifiedValue.token).toBe('done');
	});

	it('invalid GitHub token', async function () {
		const fetcher = new StaticFetcherService({
			can_signup_for_limited: false,
			message: 'You do not have access to Copilot',
			error_details: {
				message: 'fake error message',
				url: 'https://github.com/settings?param={EDITOR}',
				notification_id: 'fake-notification-id',
				title: 'Access Denied',
			},
		});

		const testingServiceCollection = createPlatformServices();
		testingServiceCollection.define(IFetcherService, fetcher);
		accessor = disposables.add(testingServiceCollection.createTestingAccessor());

		const tokenManager = accessor.get(IInstantiationService).createInstance(CopilotTokenManagerFromGitHubToken, 'invalid', 'invalid-user');
		const result = await tokenManager.checkCopilotToken();
		expect(result).toEqual({
			kind: 'failure',
			reason: 'NotAuthorized',
			message: 'fake error message',
			notification_id: 'fake-notification-id',
			url: 'https://github.com/settings?param={EDITOR}',
			title: 'Access Denied',
		});
	});

	it('network request failed', async function () {
		const fetcher = new StaticFetcherService('NETWORK_FAILURE'); // special sentinel simulates network failure

		const testingServiceCollection = createPlatformServices();
		testingServiceCollection.define(IFetcherService, fetcher);
		accessor = disposables.add(testingServiceCollection.createTestingAccessor());

		const tokenManager = accessor.get(IInstantiationService).createInstance(CopilotTokenManagerFromGitHubToken, 'valid', 'valid-user');
		const result = await tokenManager.checkCopilotToken();
		expect(result).toEqual({
			kind: 'failure',
			message: 'Network request failed',
			reason: 'RequestFailed',
		});
	});

	it('JSON parse failed', async function () {
		const fetcher = new StaticFetcherService(null); // null tokenInfo simulates parse failure (JSON.parse returns null)

		const testingServiceCollection = createPlatformServices();
		testingServiceCollection.define(IFetcherService, fetcher);
		accessor = disposables.add(testingServiceCollection.createTestingAccessor());

		const tokenManager = accessor.get(IInstantiationService).createInstance(CopilotTokenManagerFromGitHubToken, 'valid', 'valid-user');
		const result = await tokenManager.checkCopilotToken();
		expect(result).toEqual({
			kind: 'failure',
			message: 'Response is not valid: null',
			reason: 'ParseFailed',
		});
	});

	it('properly propagates errors', async function () {
		const expectedError = new Error('to be handled');

		const testingServiceCollection = createPlatformServices();
		testingServiceCollection.define(IFetcherService, new ErrorFetcherService(expectedError));
		accessor = disposables.add(testingServiceCollection.createTestingAccessor());

		const tokenManager = accessor.get(IInstantiationService).createInstance(CopilotTokenManagerFromGitHubToken, 'invalid', 'invalid-user');
		try {
			await tokenManager.checkCopilotToken();
		} catch (err: any) {
			expect(err).toBe(expectedError);
		}
	});

	it('ignore v1 token', async function () {
		const token =
			'0123456789abcdef0123456789abcdef:org1.com:1674258990:0000000000000000000000000000000000000000000000000000000000000000';

		const copilotToken = new CopilotToken(createTestExtendedTokenInfo({ token, username: 'fake', copilot_plan: 'unknown' }));
		expect(copilotToken.getTokenValue('tid')).toBeUndefined();
	});

	it('parsing v2 token', async function () {
		const token =
			'tid=0123456789abcdef0123456789abcdef;dom=org1.com;ol=org1,org2;exp=1674258990:0000000000000000000000000000000000000000000000000000000000000000';

		const copilotToken = new CopilotToken(createTestExtendedTokenInfo({ token, username: 'fake', copilot_plan: 'unknown' }));
		expect(copilotToken.getTokenValue('tid')).toBe('0123456789abcdef0123456789abcdef');
	});

	it('parsing v2 token, multiple values', async function () {
		const token =
			'tid=0123456789abcdef0123456789abcdef;rt=1;ssc=0;dom=org1.com;ol=org1,org2;exp=1674258990:0000000000000000000000000000000000000000000000000000000000000000';

		const copilotToken = new CopilotToken(createTestExtendedTokenInfo({ token, username: 'fake', copilot_plan: 'unknown' }));
		expect(copilotToken.getTokenValue('rt')).toBe('1');
		expect(copilotToken.getTokenValue('ssc')).toBe('0');
		expect(copilotToken.getTokenValue('foo')).toBeUndefined();
	});

	it('With a GitHub Enterprise configuration, retrieves token from the GHEC server', async () => {
		const ghecConfig: IDomainService = {
			_serviceBrand: undefined,
			onDidChangeDomains: Event.None,
		};
		const fetcher = new StaticFetcherService({
			token: 'token',
			expires_at: 1,
			refresh_in: 1,
		});

		const testingServiceCollection = createPlatformServices();
		testingServiceCollection.define(IDomainService, ghecConfig);
		testingServiceCollection.define(IFetcherService, fetcher);
		accessor = disposables.add(testingServiceCollection.createTestingAccessor());

		const tokenManager = disposables.add(accessor.get(IInstantiationService).createInstance(RefreshFakeCopilotTokenManager, 1));
		await tokenManager.authFromGitHubToken('fake-token', 'invalid-user');

		expect(fetcher.requests.size).toBe(2);
	});

	it('rate limiting (StandardErrorEnvelope)', async function () {
		const fetcher = new StaticFetcherService({
			message: 'API rate limit exceeded for user ID 12345.',
			documentation_url: 'https://developer.github.com/rest/overview/rate-limits-for-the-rest-api',
			status: '403',
		});

		const testingServiceCollection = createPlatformServices();
		testingServiceCollection.define(IFetcherService, fetcher);
		accessor = disposables.add(testingServiceCollection.createTestingAccessor());

		const tokenManager = accessor.get(IInstantiationService).createInstance(CopilotTokenManagerFromGitHubToken, 'valid', 'valid-user');
		const result = await tokenManager.checkCopilotToken();
		expect(result).toEqual({
			kind: 'failure',
			reason: 'RateLimited',
		});
	});

	it('HTTP 401 unauthorized', async function () {
		const fetcher = new HttpStatusFetcherService(401);

		const testingServiceCollection = createPlatformServices();
		testingServiceCollection.define(IFetcherService, fetcher);
		accessor = disposables.add(testingServiceCollection.createTestingAccessor());

		const tokenManager = accessor.get(IInstantiationService).createInstance(CopilotTokenManagerFromGitHubToken, 'bad-token', 'bad-user');
		const result = await tokenManager.checkCopilotToken();
		expect(result).toEqual({
			kind: 'failure',
			reason: 'HTTP401',
		});
	});
});

describe('Token envelope validators', function () {
	it('isTokenEnvelope returns true for valid token', function () {
		const validToken = {
			token: 'test-token',
			expires_at: 1234567890,
			refresh_in: 300,
			sku: 'free_limited_copilot',
			individual: true,
			blackbird_clientside_indexing: false,
			code_quote_enabled: false,
			code_review_enabled: false,
			codesearch: false,
			copilotignore_enabled: false,
			vsc_electron_fetcher_v2: false,
			public_suggestions: 'enabled',
			telemetry: 'enabled',
		};
		expect(isTokenEnvelope(validToken)).toBe(true);
	});

	it('isTokenEnvelope returns true when limited_user_quotas and limited_user_reset_date are null', function () {
		// Enterprise/paid users get null for these fields
		const validToken = {
			token: 'test-token',
			expires_at: 1234567890,
			refresh_in: 300,
			sku: 'free_limited_copilot',
			individual: true,
			blackbird_clientside_indexing: false,
			code_quote_enabled: false,
			code_review_enabled: false,
			codesearch: false,
			copilotignore_enabled: false,
			vsc_electron_fetcher_v2: false,
			public_suggestions: 'enabled',
			telemetry: 'enabled',
			limited_user_quotas: null,
			limited_user_reset_date: null,
		};
		expect(isTokenEnvelope(validToken)).toBe(true);
	});

	it('isTokenEnvelope returns false for missing required fields', function () {
		expect(isTokenEnvelope({})).toBe(false);
		expect(isTokenEnvelope({ token: 'test' })).toBe(false);
		expect(isTokenEnvelope({ token: 'test', expires_at: 123 })).toBe(false);
		expect(isTokenEnvelope(null)).toBe(false);
		expect(isTokenEnvelope(undefined)).toBe(false);
	});

	it('isErrorEnvelope returns true for valid error envelope', function () {
		const validError = {
			can_signup_for_limited: false,
			message: 'Access denied',
			error_details: {
				message: 'You do not have access',
				notification_id: 'no_copilot_access',
				title: 'No Access',
				url: 'https://github.com/settings/copilot',
			},
		};
		expect(isErrorEnvelope(validError)).toBe(true);
	});

	it('isErrorEnvelope returns false for invalid structures', function () {
		expect(isErrorEnvelope({})).toBe(false);
		expect(isErrorEnvelope({ message: 'error' })).toBe(false);
		expect(isErrorEnvelope({ error_details: {} })).toBe(false);
		expect(isErrorEnvelope(null)).toBe(false);
	});

	it('isStandardErrorEnvelope returns true for rate limit response', function () {
		const rateLimitError = {
			message: 'API rate limit exceeded for user ID 12345.',
			documentation_url: 'https://developer.github.com/rest/overview/rate-limits-for-the-rest-api',
			status: '403',
		};
		expect(isStandardErrorEnvelope(rateLimitError)).toBe(true);
	});

	it('isStandardErrorEnvelope returns false for invalid structures', function () {
		expect(isStandardErrorEnvelope({})).toBe(false);
		expect(isStandardErrorEnvelope({ message: 'error' })).toBe(false);
		expect(isStandardErrorEnvelope(null)).toBe(false);
	});

	describe('validateTokenEnvelope', function () {
		it('returns strict strategy for fully valid token envelope', function () {
			const validToken = {
				token: 'test-token',
				expires_at: 1234567890,
				refresh_in: 300,
				sku: 'free_limited_copilot',
				individual: true,
				blackbird_clientside_indexing: false,
				code_quote_enabled: false,
				code_review_enabled: false,
				codesearch: false,
				copilotignore_enabled: false,
				vsc_electron_fetcher_v2: false,
				public_suggestions: 'enabled',
				telemetry: 'enabled',
			};
			const result = validateTokenEnvelope(validToken);
			expect(result.valid).toBe(true);
			expect(result.strategy).toBe('strict');
			if (result.strategy === 'strict') {
				expect(result.envelope).toBeDefined();
				expect(result.envelope.token).toBe('test-token');
				expect(result.envelope.expires_at).toBe(1234567890);
				expect(result.envelope.refresh_in).toBe(300);
				expect(result.envelope.sku).toBe('free_limited_copilot');
			}
		});

		it('returns strict strategy for minimal token with only required fields', function () {
			// The strict validator only requires token, expires_at, refresh_in
			// Other fields are optional, so a minimal token passes strict validation
			const minimalToken = {
				token: 'test-token',
				expires_at: 1234567890,
				refresh_in: 300,
			};
			const result = validateTokenEnvelope(minimalToken);
			expect(result.valid).toBe(true);
			expect(result.strategy).toBe('strict');
			if (result.strategy === 'strict') {
				expect(result.envelope).toBeDefined();
				expect(result.envelope.token).toBe('test-token');
				expect(result.envelope.expires_at).toBe(1234567890);
				expect(result.envelope.refresh_in).toBe(300);
			}
		});

		it('returns fallback strategy when optional field has wrong type', function () {
			// Server changes sku from string to number - strict fails, fallback succeeds
			const tokenWithWrongOptionalType = {
				token: 'test-token',
				expires_at: 1234567890,
				refresh_in: 300,
				sku: 12345, // wrong type - should be string
			};
			const result = validateTokenEnvelope(tokenWithWrongOptionalType);
			expect(result.valid).toBe(true);
			expect(result.strategy).toBe('fallback');
			if (result.strategy === 'fallback') {
				expect(result.strictError).toContain('sku');
				expect(result.fallbackError).toBeUndefined();
				// Envelope is returned with critical fields even when fallback is used
				expect(result.envelope).toBeDefined();
				expect(result.envelope.token).toBe('test-token');
				expect(result.envelope.expires_at).toBe(1234567890);
				expect(result.envelope.refresh_in).toBe(300);
			}
		});

		it('returns fallback strategy when server changes enum values', function () {
			const tokenWithNewEnumValue = {
				token: 'test-token',
				expires_at: 1234567890,
				refresh_in: 300,
				public_suggestions: 'new_unknown_value', // not in enum
			};
			const result = validateTokenEnvelope(tokenWithNewEnumValue);
			expect(result.valid).toBe(true);
			expect(result.strategy).toBe('fallback');
			if (result.strategy === 'fallback') {
				expect(result.strictError).toContain('public_suggestions');
				// Envelope is returned with critical fields
				expect(result.envelope).toBeDefined();
				expect(result.envelope.token).toBe('test-token');
			}
		});

		it('returns failed strategy when missing critical token field', function () {
			const missingToken = {
				expires_at: 1234567890,
				refresh_in: 300,
			};
			const result = validateTokenEnvelope(missingToken);
			expect(result.valid).toBe(false);
			expect(result.strategy).toBe('failed');
			if (result.strategy === 'failed') {
				expect(result.strictError).toBeDefined();
				expect(result.fallbackError).toContain('token');
			}
		});

		it('returns failed strategy when missing critical expires_at field', function () {
			const missingExpiresAt = {
				token: 'test-token',
				refresh_in: 300,
			};
			const result = validateTokenEnvelope(missingExpiresAt);
			expect(result.valid).toBe(false);
			expect(result.strategy).toBe('failed');
			if (result.strategy === 'failed') {
				expect(result.fallbackError).toContain('expires_at');
			}
		});

		it('returns failed strategy when missing critical refresh_in field', function () {
			const missingRefreshIn = {
				token: 'test-token',
				expires_at: 1234567890,
			};
			const result = validateTokenEnvelope(missingRefreshIn);
			expect(result.valid).toBe(false);
			expect(result.strategy).toBe('failed');
			if (result.strategy === 'failed') {
				expect(result.fallbackError).toContain('refresh_in');
			}
		});

		it('returns failed strategy for null input', function () {
			const result = validateTokenEnvelope(null);
			expect(result.valid).toBe(false);
			expect(result.strategy).toBe('failed');
		});

		it('returns failed strategy for undefined input', function () {
			const result = validateTokenEnvelope(undefined);
			expect(result.valid).toBe(false);
			expect(result.strategy).toBe('failed');
		});

		it('returns failed strategy when critical field has wrong type', function () {
			const wrongTypeToken = {
				token: 12345, // should be string
				expires_at: 1234567890,
				refresh_in: 300,
			};
			const result = validateTokenEnvelope(wrongTypeToken);
			expect(result.valid).toBe(false);
			expect(result.strategy).toBe('failed');
			if (result.strategy === 'failed') {
				expect(result.fallbackError).toContain('token');
			}
		});
	});
});

describe('CopilotToken class', function () {
	it('isFreeUser returns true for free_limited_copilot sku', function () {
		const token = new CopilotToken(createTestExtendedTokenInfo({ sku: 'free_limited_copilot' }));
		expect(token.isFreeUser).toBe(true);
		expect(token.isNoAuthUser).toBe(false);
	});

	it('isNoAuthUser returns true for no_auth_limited_copilot sku', function () {
		const token = new CopilotToken(createTestExtendedTokenInfo({ sku: 'no_auth_limited_copilot' }));
		expect(token.isFreeUser).toBe(false);
		expect(token.isNoAuthUser).toBe(true);
	});

	it('isTelemetryEnabled reflects token state', function () {
		const enabledToken = new CopilotToken(createTestExtendedTokenInfo({ telemetry: 'enabled' }));
		const disabledToken = new CopilotToken(createTestExtendedTokenInfo({ telemetry: 'disabled' }));
		expect(enabledToken.isTelemetryEnabled()).toBe(true);
		expect(disabledToken.isTelemetryEnabled()).toBe(false);
	});

	it('isPublicSuggestionsEnabled reflects token state', function () {
		const enabledToken = new CopilotToken(createTestExtendedTokenInfo({ public_suggestions: 'enabled' }));
		const disabledToken = new CopilotToken(createTestExtendedTokenInfo({ public_suggestions: 'disabled' }));
		const unconfiguredToken = new CopilotToken(createTestExtendedTokenInfo({ public_suggestions: 'unconfigured' }));
		expect(enabledToken.isPublicSuggestionsEnabled()).toBe(true);
		expect(disabledToken.isPublicSuggestionsEnabled()).toBe(false);
		expect(unconfiguredToken.isPublicSuggestionsEnabled()).toBe(false);
	});

	it('copilotPlan returns correct plan type', function () {
		const freeToken = new CopilotToken(createTestExtendedTokenInfo({ sku: 'free_limited_copilot', copilot_plan: 'free' }));
		const individualToken = new CopilotToken(createTestExtendedTokenInfo({ sku: 'copilot_individual', copilot_plan: 'individual' }));
		const businessToken = new CopilotToken(createTestExtendedTokenInfo({ sku: 'copilot_business', copilot_plan: 'business' }));
		const enterpriseToken = new CopilotToken(createTestExtendedTokenInfo({ sku: 'copilot_enterprise', copilot_plan: 'enterprise' }));

		expect(freeToken.copilotPlan).toBe('free');
		expect(individualToken.copilotPlan).toBe('individual');
		expect(businessToken.copilotPlan).toBe('business');
		expect(enterpriseToken.copilotPlan).toBe('enterprise');
	});

	it('isChatQuotaExceeded for free users with zero quota', function () {
		const exceededToken = new CopilotToken(createTestExtendedTokenInfo({
			sku: 'free_limited_copilot',
			limited_user_quotas: { chat: 0, completions: 10 }
		}));
		const notExceededToken = new CopilotToken(createTestExtendedTokenInfo({
			sku: 'free_limited_copilot',
			limited_user_quotas: { chat: 5, completions: 10 }
		}));
		const nonFreeToken = new CopilotToken(createTestExtendedTokenInfo({
			sku: 'copilot_individual',
			limited_user_quotas: { chat: 0, completions: 0 }
		}));

		expect(exceededToken.isChatQuotaExceeded).toBe(true);
		expect(notExceededToken.isChatQuotaExceeded).toBe(false);
		expect(nonFreeToken.isChatQuotaExceeded).toBe(false); // Non-free users don't have quota limits
	});

	it('isCompletionsQuotaExceeded for free users with zero quota', function () {
		const exceededToken = new CopilotToken(createTestExtendedTokenInfo({
			sku: 'free_limited_copilot',
			limited_user_quotas: { chat: 10, completions: 0 }
		}));
		const notExceededToken = new CopilotToken(createTestExtendedTokenInfo({
			sku: 'free_limited_copilot',
			limited_user_quotas: { chat: 10, completions: 5 }
		}));

		expect(exceededToken.isCompletionsQuotaExceeded).toBe(true);
		expect(notExceededToken.isCompletionsQuotaExceeded).toBe(false);
	});

	it('isInternal detects GitHub and Microsoft organizations', function () {
		const githubOrgToken = new CopilotToken(createTestExtendedTokenInfo({
			organization_list: ['4535c7beffc844b46bb1ed4aa04d759a']
		}));
		const microsoftOrgToken = new CopilotToken(createTestExtendedTokenInfo({
			organization_list: ['a5db0bcaae94032fe715fb34a5e4bce2']
		}));
		const externalToken = new CopilotToken(createTestExtendedTokenInfo({
			organization_list: ['some-other-org']
		}));
		const noOrgToken = new CopilotToken(createTestExtendedTokenInfo({
			organization_list: []
		}));

		expect(githubOrgToken.isInternal).toBe(true);
		expect(githubOrgToken.isGitHubInternal).toBe(true);
		expect(githubOrgToken.isMicrosoftInternal).toBe(false);

		expect(microsoftOrgToken.isInternal).toBe(true);
		expect(microsoftOrgToken.isGitHubInternal).toBe(false);
		expect(microsoftOrgToken.isMicrosoftInternal).toBe(true);

		expect(externalToken.isInternal).toBe(false);
		expect(noOrgToken.isInternal).toBe(false);
	});

	it('codeQuoteEnabled reflects token state', function () {
		const enabledToken = new CopilotToken(createTestExtendedTokenInfo({ code_quote_enabled: true }));
		const disabledToken = new CopilotToken(createTestExtendedTokenInfo({ code_quote_enabled: false }));
		expect(enabledToken.codeQuoteEnabled).toBe(true);
		expect(disabledToken.codeQuoteEnabled).toBe(false);
	});

	it('isCopilotCodeReviewEnabled reflects token state', function () {
		const enabledToken = new CopilotToken(createTestExtendedTokenInfo({ code_review_enabled: true }));
		const disabledToken = new CopilotToken(createTestExtendedTokenInfo({ code_review_enabled: false }));
		expect(enabledToken.isCopilotCodeReviewEnabled).toBe(true);
		expect(disabledToken.isCopilotCodeReviewEnabled).toBe(false);
	});

	it('isExpandedClientSideIndexingEnabled reflects token state', function () {
		const enabledToken = new CopilotToken(createTestExtendedTokenInfo({ blackbird_clientside_indexing: true }));
		const disabledToken = new CopilotToken(createTestExtendedTokenInfo({ blackbird_clientside_indexing: false }));
		expect(enabledToken.isExpandedClientSideIndexingEnabled()).toBe(true);
		expect(disabledToken.isExpandedClientSideIndexingEnabled()).toBe(false);
	});
});

class StaticFetcherService implements IFetcherService {

	declare readonly _serviceBrand: undefined;
	readonly onDidFetch = Event.None;
	readonly onDidCompleteFetch = Event.None;

	public requests = new Map<string, FetchOptions>();
	constructor(readonly tokenResponse: any) {
	}

	fetchWithPagination<T>(baseUrl: string, options: PaginationOptions<T>): Promise<T[]> {
		throw new Error('Method not implemented.');
	}

	getUserAgentLibrary(): string {
		return 'test';
	}
	async fetch(url: string, options: FetchOptions): Promise<Response> {
		this.requests.set(url, options);
		if (url.endsWith('copilot_internal/v2/token')) {
			if (this.tokenResponse === 'NETWORK_FAILURE') {
				// Simulate network failure - fetch throws
				throw new Error('Network request failed');
			}
			// null will parse successfully as JSON (returns null) but fails tokenInfo check
			return createFakeResponse(200, this.tokenResponse);
		} else if (url.endsWith('copilot_internal/notification')) {
			return createFakeResponse(200, '');
		}
		return createFakeResponse(404, '');
	}
	createWebSocket(_url: string): WebSocketConnection {
		throw new Error('Method not implemented.');
	}
	disconnectAll(): Promise<unknown> {
		throw new Error('Method not implemented.');
	}
	makeAbortController(): IAbortController {
		throw new Error('Method not implemented.');
	}
	isAbortError(e: any): boolean {
		throw new Error('Method not implemented.');
	}
	isInternetDisconnectedError(e: any): boolean {
		throw new Error('Method not implemented.');
	}
	isFetcherError(err: any): boolean {
		throw new Error('Method not implemented.');
	}
	isNetworkProcessCrashedError(err: any): boolean {
		throw new Error('Method not implemented.');
	}
	getUserMessageForFetcherError(err: any): string {
		throw new Error('Method not implemented.');
	}
}

class ErrorFetcherService extends StaticFetcherService {
	constructor(private readonly error: any) {
		super({});
	}

	override fetch(url: string, options: FetchOptions): Promise<Response> {
		throw this.error;
	}
}

class HttpStatusFetcherService extends StaticFetcherService {
	constructor(private readonly status: number) {
		super({});
	}

	override async fetch(url: string, options: FetchOptions): Promise<Response> {
		this.requests.set(url, options);
		return createFakeResponse(this.status, {});
	}
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticationSession } from 'vscode';
import { DeferredPromise } from '../../../../util/vs/base/common/async';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { Event } from '../../../../util/vs/base/common/event';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { CopilotToken, createTestExtendedTokenInfo, ExtendedTokenInfo } from '../../../authentication/common/copilotToken';
import { ICopilotTokenManager } from '../../../authentication/common/copilotTokenManager';
import { CopilotTokenStore } from '../../../authentication/common/copilotTokenStore';
import { StaticGitHubAuthenticationService } from '../../../authentication/common/staticGitHubAuthenticationService';
import { DefaultsOnlyConfigurationService } from '../../../configuration/common/defaultsOnlyConfigurationService';
import { NullEnvService } from '../../../env/common/nullEnvService';
import { MockAuthenticationService } from '../../../ignore/node/test/mockAuthenticationService';
import { Response } from '../../../networking/common/fetcherService';
import { NodeFetcherService } from '../../../networking/node/test/nodeFetcherService';
import { NullRequestLogger } from '../../../requestLogger/node/nullRequestLogger';
import { TestLogService } from '../../../testing/common/testLogService';
import { FakeHeaders } from '../../../test/node/fetcher';
import { CompletionsFetchService } from '../../node/completionsFetchServiceImpl';

describe('CompletionsFetchService quota handling', () => {
	let disposables: DisposableStore;

	beforeEach(() => {
		disposables = new DisposableStore();
		vi.useFakeTimers({ toFake: ['Date'] });
	});

	afterEach(() => {
		disposables.dispose();
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	function createServices(tokenInfo: Partial<ExtendedTokenInfo> = {}) {
		const authenticationService = disposables.add(new QuotaAuthenticationService(tokenInfo));
		const fetcherService = new QuotaFetcherService();
		const service = new CompletionsFetchService(authenticationService, fetcherService, new NullRequestLogger());
		return { authenticationService, fetcherService, service };
	}

	function fetch(service: CompletionsFetchService, model = 'test-model') {
		return service.fetch(
			'https://example.com/completions',
			'test-token',
			{ prompt: 'test', stream: true, model },
			'request-id',
			CancellationToken.None,
		);
	}

	it.each<{ name: string; tokenInfo: Partial<ExtendedTokenInfo> }>([
		{
			name: 'free user with completions remaining',
			tokenInfo: { sku: 'free_limited_copilot', limited_user_quotas: { chat: 0, completions: 100 } },
		},
		{
			name: 'free user without legacy quota fields',
			tokenInfo: { sku: 'free_limited_copilot', limited_user_quotas: undefined },
		},
		{
			name: 'paid user',
			tokenInfo: { sku: 'copilot_individual', limited_user_quotas: { chat: 0, completions: 0 } },
		},
	])('bounds token refreshes for repeated NES 402s: $name', async ({ tokenInfo }) => {
		const { authenticationService, fetcherService, service } = createServices(tokenInfo);

		for (let i = 0; i < 3; i++) {
			const result = await fetch(service);
			expect(result.isError() && result.err).toMatchObject({ kind: 'not-200-status', status: 402 });
			vi.setSystemTime(Date.now() + 60 * 60 * 1000);
		}

		expect({
			requests: fetcherService.fetch.mock.calls.length,
			resets: authenticationService.resetCopilotToken.mock.calls,
			refreshes: authenticationService.getCopilotToken.mock.calls.length,
		}).toEqual({
			requests: 3,
			resets: [[402]],
			refreshes: 1,
		});
	});

	it('does not refresh when the token already reports exhausted completions quota', async () => {
		const { authenticationService, service } = createServices({
			limited_user_quotas: { chat: 100, completions: 0 },
		});

		await fetch(service);
		vi.setSystemTime(Date.now() + 60 * 60 * 1000);
		await fetch(service);

		expect({
			resets: authenticationService.resetCopilotToken.mock.calls,
			refreshes: authenticationService.getCopilotToken.mock.calls,
		}).toEqual({ resets: [], refreshes: [] });
	});

	it('keeps the quota latch after the cooldown and ordinary token refreshes', async () => {
		const { authenticationService, service } = createServices();
		const start = Date.now();

		await fetch(service);
		vi.setSystemTime(start + 5 * 60 * 1000 - 1);
		await fetch(service);
		const refreshesBeforeCooldown = authenticationService.getCopilotToken.mock.calls.length;
		vi.setSystemTime(start + 5 * 60 * 1000);
		await fetch(service);
		authenticationService.setCopilotToken(new CopilotToken(createTestExtendedTokenInfo({ token: 'rotated-token' })));
		vi.setSystemTime(start + 24 * 60 * 60 * 1000);
		await fetch(service);

		expect({
			refreshesBeforeCooldown,
			refreshesAfterCooldown: authenticationService.getCopilotToken.mock.calls.length,
			resets: authenticationService.resetCopilotToken.mock.calls,
		}).toEqual({ refreshesBeforeCooldown: 1, refreshesAfterCooldown: 1, resets: [[402]] });
	});

	it('rearms after success without bypassing the five-minute backstop', async () => {
		const { authenticationService, fetcherService, service } = createServices();
		const start = Date.now();
		await fetch(service);
		fetcherService.fetch.mockResolvedValueOnce(createSuccessfulResponse());
		const success = await fetch(service);
		if (success.isError()) {
			throw new Error(`Unexpected fetch failure: ${success.err.kind}`);
		}
		for await (const _chunk of success.val.stream) { }

		await fetch(service);
		const resetsDuringBackstop = authenticationService.resetCopilotToken.mock.calls.length;
		vi.setSystemTime(start + 5 * 60 * 1000);
		await fetch(service);
		vi.setSystemTime(start + 60 * 60 * 1000);
		await fetch(service);

		expect({
			resetsDuringBackstop,
			resets: authenticationService.resetCopilotToken.mock.calls,
		}).toEqual({ resetsDuringBackstop: 1, resets: [[402], [402]] });
	});

	it('keeps separate quota episodes for different models', async () => {
		const { authenticationService, fetcherService, service } = createServices();
		await fetch(service, 'first-model');
		await fetch(service, 'second-model');
		const resetsBeforeSuccess = authenticationService.resetCopilotToken.mock.calls.length;
		fetcherService.fetch.mockResolvedValueOnce(createSuccessfulResponse());
		const success = await fetch(service, 'second-model');
		if (success.isError()) {
			throw new Error(`Unexpected fetch failure: ${success.err.kind}`);
		}
		for await (const _chunk of success.val.stream) { }
		vi.setSystemTime(Date.now() + 60 * 60 * 1000);
		await fetch(service, 'first-model');

		expect({
			resetsBeforeSuccess,
			resetsAfterSuccess: authenticationService.resetCopilotToken.mock.calls.length,
		}).toEqual({ resetsBeforeSuccess: 2, resetsAfterSuccess: 2 });
	});

	it.each([false, true])('does not share the quota latch or cooldown with another account (GitHub session: %s)', async hasSession => {
		const { authenticationService, service } = createServices();
		authenticationService.switchAccount('first-account', hasSession);
		await fetch(service);
		authenticationService.switchAccount('second-account', hasSession);
		await fetch(service);

		expect(authenticationService.resetCopilotToken.mock.calls).toEqual([[402], [402]]);
	});

	it('distinguishes accounts with the static GitHub session placeholder identity', async () => {
		let account = 'first-account';
		const manager = new TestCopilotTokenManager(() => new CopilotToken(createTestExtendedTokenInfo({
			token: `tid=${account}`,
			username: account,
		})));
		const auth = disposables.add(new StaticGitHubAuthenticationService(
			() => account,
			new TestLogService(),
			disposables.add(new CopilotTokenStore()),
			manager,
			new DefaultsOnlyConfigurationService(),
		));
		const service = new CompletionsFetchService(auth, new QuotaFetcherService(), new NullRequestLogger());

		await auth.getCopilotToken();
		await fetch(service);
		account = 'second-account';
		await auth.getCopilotToken(true);
		await fetch(service);

		expect(manager.resetCopilotToken.mock.calls).toEqual([[402], [402]]);
	});

	it('ignores a quota response from before an account switch', async () => {
		const { authenticationService, fetcherService, service } = createServices();
		authenticationService.switchAccount('first-account');
		const response = new DeferredPromise<Response>();
		fetcherService.fetch.mockImplementationOnce(() => response.p);
		const first = fetch(service);

		authenticationService.switchAccount('second-account');
		await fetch(service);
		vi.setSystemTime(Date.now() + 60 * 60 * 1000);
		await response.complete(Response.fromText(402, 'Payment Required', new FakeHeaders(), 'Quota exceeded', 'test-stub'));
		await first;

		expect(authenticationService.resetCopilotToken.mock.calls).toEqual([[402]]);
	});

	it('does not let a late success from another account clear the quota latch', async () => {
		const { authenticationService, fetcherService, service } = createServices();
		authenticationService.switchAccount('first-account');
		const response = new DeferredPromise<Response>();
		fetcherService.fetch.mockImplementationOnce(() => response.p);
		const first = fetch(service);

		authenticationService.switchAccount('second-account');
		await fetch(service);
		vi.setSystemTime(Date.now() + 60 * 60 * 1000);
		await response.complete(createSuccessfulResponse());
		const success = await first;
		if (success.isError()) {
			throw new Error(`Unexpected fetch failure: ${success.err.kind}`);
		}
		for await (const _chunk of success.val.stream) { }
		await fetch(service);

		expect(authenticationService.resetCopilotToken.mock.calls).toEqual([[402]]);
	});

	it('ignores a quota response from before a newer successful request', async () => {
		const { authenticationService, fetcherService, service } = createServices();
		const response = new DeferredPromise<Response>();
		fetcherService.fetch.mockImplementationOnce(() => response.p);
		const first = fetch(service);
		fetcherService.fetch.mockResolvedValueOnce(createSuccessfulResponse());
		const success = await fetch(service);
		if (success.isError()) {
			throw new Error(`Unexpected fetch failure: ${success.err.kind}`);
		}
		for await (const _chunk of success.val.stream) { }

		await response.complete(Response.fromText(402, 'Payment Required', new FakeHeaders(), 'Quota exceeded', 'test-stub'));
		await first;
		expect(authenticationService.resetCopilotToken).not.toHaveBeenCalled();
	});

	it('refreshes a newer quota failure after an older successful request', async () => {
		const { authenticationService, fetcherService, service } = createServices();
		const firstResponse = new DeferredPromise<Response>();
		const secondResponse = new DeferredPromise<Response>();
		fetcherService.fetch.mockImplementationOnce(() => firstResponse.p).mockImplementationOnce(() => secondResponse.p);
		const first = fetch(service);
		const second = fetch(service);

		await firstResponse.complete(createSuccessfulResponse());
		const success = await first;
		if (success.isError()) {
			throw new Error(`Unexpected fetch failure: ${success.err.kind}`);
		}
		for await (const _chunk of success.val.stream) { }
		await secondResponse.complete(Response.fromText(402, 'Payment Required', new FakeHeaders(), 'Quota exceeded', 'test-stub'));
		const failure = await second;

		expect({
			failure: failure.isError() && failure.err.kind,
			resets: authenticationService.resetCopilotToken.mock.calls,
		}).toEqual({ failure: 'not-200-status', resets: [[402]] });
	});

	it('does not let an older success rearm a newer quota episode', async () => {
		const { authenticationService, fetcherService, service } = createServices();
		const response = new DeferredPromise<Response>();
		fetcherService.fetch.mockImplementationOnce(() => response.p);
		const first = fetch(service);
		await fetch(service);

		vi.setSystemTime(Date.now() + 60 * 60 * 1000);
		await response.complete(createSuccessfulResponse());
		const success = await first;
		if (success.isError()) {
			throw new Error(`Unexpected fetch failure: ${success.err.kind}`);
		}
		for await (const _chunk of success.val.stream) { }
		await fetch(service);

		expect(authenticationService.resetCopilotToken.mock.calls).toEqual([[402]]);
	});

	it('shares an in-flight quota refresh even after the cooldown elapses', async () => {
		const { authenticationService, service } = createServices();
		const started = new DeferredPromise<void>();
		const refresh = new DeferredPromise<CopilotToken>();
		authenticationService.getCopilotToken.mockImplementationOnce(async () => {
			await started.complete();
			return refresh.p;
		});

		const first = fetch(service);
		await started.p;
		vi.setSystemTime(Date.now() + 5 * 60 * 1000);
		const second = fetch(service);
		const third = fetch(service);
		await refresh.complete(new CopilotToken(createTestExtendedTokenInfo()));
		const results = await Promise.all([first, second, third]);

		expect({
			failures: results.map(result => result.isError() && result.err.kind),
			resets: authenticationService.resetCopilotToken.mock.calls,
			refreshes: authenticationService.getCopilotToken.mock.calls.length,
		}).toEqual({
			failures: ['not-200-status', 'not-200-status', 'not-200-status'],
			resets: [[402]],
			refreshes: 1,
		});
	});

	it('propagates refresh failures without repeatedly resetting the token', async () => {
		const { authenticationService, service } = createServices();
		const error = new Error('Token refresh failed');
		authenticationService.getCopilotToken.mockRejectedValueOnce(error);

		const first = await fetch(service);
		const second = await fetch(service);
		expect(first.isError() && first.err).toMatchObject({ kind: 'unexpected', error });
		expect(second.isError() && second.err).toMatchObject({ kind: 'not-200-status', status: 402 });
		expect(authenticationService.resetCopilotToken.mock.calls).toEqual([[402]]);

		vi.setSystemTime(Date.now() + 5 * 60 * 1000);
		const third = await fetch(service);
		expect(third.isError() && third.err).toMatchObject({ kind: 'not-200-status', status: 402 });
		expect(authenticationService.resetCopilotToken.mock.calls).toEqual([[402], [402]]);
	});

	it('shares the cooldown across fetchers but not authentication services', async () => {
		const { authenticationService, fetcherService, service } = createServices();
		const otherFetcher = new CompletionsFetchService(authenticationService, fetcherService, new NullRequestLogger());
		const other = createServices();

		await fetch(service);
		await fetch(otherFetcher);
		await fetch(other.service);

		expect({
			resets: authenticationService.resetCopilotToken.mock.calls,
			otherResets: other.authenticationService.resetCopilotToken.mock.calls,
		}).toEqual({ resets: [[402]], otherResets: [[402]] });
	});

	it('does not reset the token on successful NES responses because chat quota is exhausted', async () => {
		const { authenticationService, fetcherService, service } = createServices({
			limited_user_quotas: { chat: 0, completions: 100 },
		});
		fetcherService.fetch.mockImplementation(async () => createSuccessfulResponse());

		for (let i = 0; i < 2; i++) {
			const result = await fetch(service);
			if (result.isError()) {
				throw new Error(`Unexpected fetch failure: ${result.err.kind}`);
			}
			const completions = [];
			for await (const chunk of result.val.stream) {
				completions.push(chunk);
			}
			expect(completions).toEqual([{
				choices: [{ index: 0, text: 'completion', finish_reason: 'stop' }],
				system_fingerprint: 'test',
				object: 'text_completion',
			}]);
		}

		expect(authenticationService.resetCopilotToken).not.toHaveBeenCalled();
	});
});

class QuotaAuthenticationService extends MockAuthenticationService {
	override anyGitHubSession: AuthenticationSession | undefined = undefined;

	constructor(private tokenInfo: Partial<ExtendedTokenInfo>) {
		super();
		this.setCopilotToken(new CopilotToken(createTestExtendedTokenInfo(tokenInfo)));
	}

	switchAccount(id: string, hasSession = true): void {
		this.anyGitHubSession = hasSession ? { id, accessToken: `test-${id}`, account: { id, label: id }, scopes: [] } : undefined;
		this.tokenInfo = { ...this.tokenInfo, token: `tid=${id}`, username: id };
		this.setCopilotToken(new CopilotToken(createTestExtendedTokenInfo(this.tokenInfo)));
	}

	override resetCopilotToken = vi.fn((_httpError?: number) => {
		this.setCopilotToken(undefined);
	});

	override getCopilotToken = vi.fn(async () => {
		const token = new CopilotToken(createTestExtendedTokenInfo(this.tokenInfo));
		this.setCopilotToken(token);
		return token;
	});
}

class QuotaFetcherService extends NodeFetcherService {
	constructor() {
		super(new NullEnvService());
	}

	override fetch = vi.fn(async () => Response.fromText(402, 'Payment Required', new FakeHeaders(), 'Quota exceeded', 'test-stub'));
}

class TestCopilotTokenManager implements ICopilotTokenManager {
	declare readonly _serviceBrand: undefined;
	readonly onDidCopilotTokenRefresh = Event.None;
	readonly resetCopilotToken = vi.fn((_httpError?: number) => { });

	constructor(private readonly getToken: () => CopilotToken) { }

	async getCopilotToken(): Promise<CopilotToken> {
		return this.getToken();
	}
}

function createSuccessfulResponse(): Response {
	const completion = {
		choices: [{ index: 0, text: 'completion', finish_reason: 'stop' }],
		system_fingerprint: 'test',
		object: 'text_completion',
	};
	return Response.fromText(200, 'OK', new FakeHeaders(), `data: ${JSON.stringify(completion)}\n\ndata: [DONE]\n`, 'test-stub');
}

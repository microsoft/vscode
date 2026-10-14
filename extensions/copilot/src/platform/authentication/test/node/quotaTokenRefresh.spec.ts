/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticationSession } from 'vscode';
import { DeferredPromise } from '../../../../util/vs/base/common/async';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../util/vs/base/common/uri';
import { MockAuthenticationService } from '../../../ignore/node/test/mockAuthenticationService';
import { CopilotToken, createTestExtendedTokenInfo } from '../../common/copilotToken';
import { QuotaTokenRefreshRequest } from '../../common/quotaTokenRefresh';

describe('QuotaTokenRefreshRequest', () => {
	const cooldown = 5 * 60 * 1000;
	let store: DisposableStore;
	let auth: TestAuthenticationService;

	beforeEach(() => {
		store = new DisposableStore();
		auth = store.add(new TestAuthenticationService());
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(0);
	});

	afterEach(() => {
		store.dispose();
		vi.useRealTimers();
	});

	function request(scope = 'model') {
		return new QuotaTokenRefreshRequest(scope, auth);
	}

	it('refreshes once despite repeated quota errors, elapsed time, and tracking ID rotation', async () => {
		for (let i = 0; i < 3; i++) {
			await request().onQuotaExceeded(false);
			auth.updateToken();
			vi.setSystemTime(Date.now() + 24 * 60 * 60 * 1000);
		}
		expect(auth.resetCopilotToken.mock.calls).toEqual([[402]]);
	});

	it('does not refresh an already known exhausted quota', async () => {
		await request().onQuotaExceeded(true);
		await request().onQuotaExceeded(false);
		expect(auth.getCopilotToken).not.toHaveBeenCalled();
	});

	it('keeps scopes and authentication services independent', async () => {
		const other = store.add(new TestAuthenticationService());
		await request().onQuotaExceeded(false);
		await request('other-model').onQuotaExceeded(false);
		await request().onQuotaExceeded(false);
		await new QuotaTokenRefreshRequest('model', other).onQuotaExceeded(false);
		expect([auth.resetCopilotToken.mock.calls, other.resetCopilotToken.mock.calls]).toEqual([[[402], [402]], [[402]]]);
	});

	it('rearms after success without bypassing the cooldown', async () => {
		await request().onQuotaExceeded(false);
		request().onSuccess();
		vi.setSystemTime(cooldown - 1);
		await request().onQuotaExceeded(false);
		const beforeExpiry = auth.resetCopilotToken.mock.calls.length;
		vi.setSystemTime(cooldown);
		await request().onQuotaExceeded(false);
		expect({ beforeExpiry, resets: auth.resetCopilotToken.mock.calls }).toEqual({ beforeExpiry: 1, resets: [[402], [402]] });
	});

	it('coalesces an in-flight refresh even after the cooldown expires', async () => {
		const started = new DeferredPromise<void>();
		const refresh = new DeferredPromise<CopilotToken>();
		auth.getCopilotToken.mockImplementationOnce(async () => {
			await started.complete();
			return refresh.p;
		});
		const first = request().onQuotaExceeded(false);
		await started.p;
		vi.setSystemTime(cooldown);
		const second = request().onQuotaExceeded(false);
		await refresh.complete(auth.updateToken());
		await Promise.all([first, second]);
		expect(auth.resetCopilotToken.mock.calls).toEqual([[402]]);
	});

	it('shares refresh failures and permits a bounded retry', async () => {
		const started = new DeferredPromise<void>();
		const refresh = new DeferredPromise<CopilotToken>();
		const error = new Error('Refresh failed');
		auth.getCopilotToken.mockImplementationOnce(async () => {
			await started.complete();
			return refresh.p;
		});
		const first = request().onQuotaExceeded(false);
		await started.p;
		const results = Promise.allSettled([first, request().onQuotaExceeded(false)]);
		await refresh.error(error);
		expect(await results).toEqual([{ status: 'rejected', reason: error }, { status: 'rejected', reason: error }]);
		await request().onQuotaExceeded(false);
		const beforeExpiry = auth.resetCopilotToken.mock.calls.length;
		vi.setSystemTime(cooldown);
		await request().onQuotaExceeded(false);
		expect({ beforeExpiry, resets: auth.resetCopilotToken.mock.calls }).toEqual({ beforeExpiry: 1, resets: [[402], [402]] });
	});

	it.each([false, true])('a newer success supersedes an older quota error (refresh queued: %s)', async queued => {
		const older = request();
		const newer = request();
		const pending = queued ? older.onQuotaExceeded(false) : undefined;
		newer.onSuccess();
		await (pending ?? older.onQuotaExceeded(false));
		const beforeNewQuota = auth.resetCopilotToken.mock.calls.length;
		await request().onQuotaExceeded(false);
		expect({ beforeNewQuota, resets: auth.resetCopilotToken.mock.calls }).toEqual({ beforeNewQuota: 0, resets: [[402]] });
	});

	it('does not discard a newer quota error after an older success', async () => {
		const older = request();
		const newer = request();
		older.onSuccess();
		await newer.onQuotaExceeded(false);
		expect(auth.resetCopilotToken.mock.calls).toEqual([[402]]);
	});

	it('does not let an older success rearm a newer quota episode', async () => {
		const older = request();
		await request().onQuotaExceeded(false);
		older.onSuccess();
		vi.setSystemTime(cooldown);
		await request().onQuotaExceeded(false);
		expect(auth.resetCopilotToken.mock.calls).toEqual([[402]]);
	});

	it.each(['oauth', 'static', 'token-only'])('isolates account switches and rejects stale responses: %s', async kind => {
		if (kind !== 'token-only') {
			auth.anyGitHubSession = {
				get id() { return auth.username; },
				accessToken: 'test-token',
				account: { get id() { return kind === 'oauth' ? auth.username : 'placeholder'; }, label: 'User' },
				scopes: [],
				authorizationServer: kind === 'oauth' ? URI.parse('https://github.com/login/oauth') : undefined,
			};
		}
		const stale = request();
		auth.username = 'second-account';
		auth.updateToken();
		await request().onQuotaExceeded(false);
		auth.username = 'first-account';
		auth.updateToken();
		await request().onQuotaExceeded(false);
		await stale.onQuotaExceeded(false);
		expect(auth.resetCopilotToken.mock.calls).toEqual([[402], [402]]);
	});

	it.each([
		{ issuer: 'https://github.com/login/oauth', resets: [[402]] },
		{ issuer: 'https://enterprise.example/login/oauth', resets: [[402], [402]] },
	])('uses OAuth account and issuer rather than session credentials: $issuer', async ({ issuer, resets }) => {
		const session: AuthenticationSession = {
			id: 'original', accessToken: 'original-token', account: { id: 'account', label: 'User' },
			scopes: [], authorizationServer: URI.parse('https://github.com/login/oauth'),
		};
		auth.anyGitHubSession = session;
		await request().onQuotaExceeded(false);
		auth.anyGitHubSession = { ...session, id: 'renewed', accessToken: 'renewed-token', authorizationServer: URI.parse(issuer) };
		await request().onQuotaExceeded(false);
		expect(auth.resetCopilotToken.mock.calls).toEqual(resets);
	});

	it('learns a token-only identity after the initially missing token is acquired', async () => {
		auth.setCopilotToken(undefined);
		await request().onQuotaExceeded(false);
		await request().onQuotaExceeded(false);
		auth.username = 'second-account';
		auth.updateToken();
		await request().onQuotaExceeded(false);
		expect(auth.resetCopilotToken.mock.calls).toEqual([[402], [402]]);
	});
});

class TestAuthenticationService extends MockAuthenticationService {
	override anyGitHubSession: AuthenticationSession | undefined = undefined;
	username = 'first-account';
	private tokenVersion = 0;

	constructor() {
		super();
		this.updateToken();
	}

	updateToken(): CopilotToken {
		const token = new CopilotToken(createTestExtendedTokenInfo({ token: `tid=tracking-${++this.tokenVersion}`, username: this.username }));
		this.setCopilotToken(token);
		return token;
	}

	override resetCopilotToken = vi.fn((_httpError?: number) => this.setCopilotToken(undefined));
	override getCopilotToken = vi.fn(async () => this.updateToken());
}

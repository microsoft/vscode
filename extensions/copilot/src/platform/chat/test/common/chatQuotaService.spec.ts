/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Emitter, Event } from '../../../../util/vs/base/common/event';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { IAuthenticationService } from '../../../authentication/common/authentication';
import { CopilotUserQuotaInfo } from '../../common/chatQuotaService';
import { ChatQuotaService } from '../../common/chatQuotaServiceImpl';

function makeQuotaInfo(overrides?: Partial<CopilotUserQuotaInfo>): CopilotUserQuotaInfo {
	return {
		quota_reset_date: '2026-06-01T00:00:00Z',
		quota_snapshots: {
			chat: { quota_id: 'chat', entitlement: 100, remaining: 0, unlimited: false, overage_count: 0, overage_permitted: false, percent_remaining: 0 },
			completions: { quota_id: 'completions', entitlement: 100, remaining: 100, unlimited: false, overage_count: 0, overage_permitted: false, percent_remaining: 100 },
			premium_interactions: { quota_id: 'premium', entitlement: 100, remaining: 0, unlimited: false, overage_count: 0, overage_permitted: false, percent_remaining: 0 },
		},
		...overrides,
	};
}

class MockAuthenticationService {
	declare readonly _serviceBrand: undefined;
	private readonly _onDidAuthenticationChange = new Emitter<void>();
	readonly onDidAuthenticationChange: Event<void> = this._onDidAuthenticationChange.event;
	readonly onDidAccessTokenChange: Event<void> = Event.None;
	readonly onDidAdoAuthenticationChange: Event<void> = Event.None;

	copilotToken: { quotaInfo?: CopilotUserQuotaInfo; isFreeUser?: boolean; isNoAuthUser?: boolean } | undefined;

	fireAuthChange(): void {
		this._onDidAuthenticationChange.fire();
	}

	dispose(): void {
		this._onDidAuthenticationChange.dispose();
	}
}

describe('ChatQuotaService', () => {
	let disposables: DisposableStore;
	let authService: MockAuthenticationService;
	let quotaService: ChatQuotaService;

	beforeEach(() => {
		disposables = new DisposableStore();
		authService = new MockAuthenticationService();
		disposables.add({ dispose: () => authService.dispose() });
		quotaService = disposables.add(new ChatQuotaService(authService as unknown as IAuthenticationService));
	});

	test('starts with no quota info and not exhausted', () => {
		expect(quotaService.quotaInfo).toBeUndefined();
		expect(quotaService.quotaExhausted).toBe(false);
	});

	test('picks up quota info from auth change', () => {
		const info = makeQuotaInfo();
		authService.copilotToken = { quotaInfo: info, isFreeUser: true };
		authService.fireAuthChange();

		expect(quotaService.quotaInfo).toBeDefined();
		expect(quotaService.quotaInfo!.percentRemaining).toBe(0);
		expect(quotaService.quotaExhausted).toBe(true);
	});

	test('clears quota when auth changes to signed-out (no copilotToken)', () => {
		// Set up exhausted state
		authService.copilotToken = { quotaInfo: makeQuotaInfo(), isFreeUser: true };
		authService.fireAuthChange();
		expect(quotaService.quotaExhausted).toBe(true);

		// Simulate sign-out: copilotToken becomes undefined
		authService.copilotToken = undefined;
		authService.fireAuthChange();

		expect(quotaService.quotaInfo).toBeUndefined();
		expect(quotaService.quotaExhausted).toBe(false);
		expect(quotaService.rateLimitInfo.session).toBeUndefined();
		expect(quotaService.rateLimitInfo.weekly).toBeUndefined();
	});

	test('fires onDidChange when quota is cleared on sign-out', () => {
		// Set up exhausted state
		authService.copilotToken = { quotaInfo: makeQuotaInfo(), isFreeUser: true };
		authService.fireAuthChange();

		const onChange = vi.fn();
		disposables.add(quotaService.onDidChange(onChange));

		// Sign out
		authService.copilotToken = undefined;
		authService.fireAuthChange();

		expect(onChange).toHaveBeenCalled();
	});

	test('does not fire onDidChange when sign-out occurs with no prior quota', () => {
		// No quota set initially
		const onChange = vi.fn();
		disposables.add(quotaService.onDidChange(onChange));

		authService.copilotToken = undefined;
		authService.fireAuthChange();

		expect(onChange).not.toHaveBeenCalled();
	});

	test('clears quota when auth changes to token without quotaInfo', () => {
		// Set up exhausted state
		authService.copilotToken = { quotaInfo: makeQuotaInfo(), isFreeUser: true };
		authService.fireAuthChange();
		expect(quotaService.quotaExhausted).toBe(true);

		// Sign in with different account that has no quotaInfo yet
		authService.copilotToken = { isFreeUser: false };
		authService.fireAuthChange();

		expect(quotaService.quotaInfo).toBeUndefined();
		expect(quotaService.quotaExhausted).toBe(false);
	});

	test('quota is not exhausted when percentRemaining > 0', () => {
		const info = makeQuotaInfo();
		info.quota_snapshots!.premium_interactions.percent_remaining = 50;
		authService.copilotToken = { quotaInfo: info, isFreeUser: true };
		authService.fireAuthChange();

		expect(quotaService.quotaExhausted).toBe(false);
	});

	test('quota is not exhausted when additional usage is enabled', () => {
		const info = makeQuotaInfo();
		info.quota_snapshots!.premium_interactions.overage_permitted = true;
		authService.copilotToken = { quotaInfo: info, isFreeUser: true };
		authService.fireAuthChange();

		expect(quotaService.quotaExhausted).toBe(false);
	});

	test('quota is not exhausted when unlimited', () => {
		const info = makeQuotaInfo();
		info.quota_snapshots!.premium_interactions.unlimited = true;
		info.quota_snapshots!.premium_interactions.entitlement = -1;
		authService.copilotToken = { quotaInfo: info, isFreeUser: true };
		authService.fireAuthChange();

		expect(quotaService.quotaExhausted).toBe(false);
	});

	afterEach(() => {
		disposables.dispose();
	});
});

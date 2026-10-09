/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICodexAccountInfo } from '../../../../../platform/agentHost/common/codexAccount.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import product from '../../../../../platform/product/common/product.js';
import { ITelemetryData, ITelemetryService, TelemetryLevel } from '../../../../../platform/telemetry/common/telemetry.js';
import { TelemetryService } from '../../../../../platform/telemetry/common/telemetryService.js';
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { ICodexAccountService } from '../../../../../workbench/services/agentHost/browser/codexAccountService.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { SessionsAccountTelemetryContribution } from '../../browser/sessionsAccountTelemetry.js';

suite('SessionsAccountTelemetryContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const weeklyWindowMins = 7 * 24 * 60;
	const signedOutSnapshot = {
		copilotSku: 'signedOut',
		copilotAccountState: 'signedOut',
		copilotQuotaPercentRemaining: undefined,
		chatgptAccountState: 'signedOut',
		chatgptQuotaPercentRemaining: undefined,
	};

	function createHarness(initial: {
		entitlement?: ChatEntitlement;
		sku?: string;
		anonymous?: boolean;
		quotas?: IChatEntitlementService['quotas'];
		account?: ICodexAccountInfo;
		defaultAccount?: IDefaultAccountService['currentDefaultAccount'];
		defaultAccountReady?: Promise<void>;
		telemetryService?: ITelemetryService;
	} = {}) {
		const entitlementChanged = disposables.add(new Emitter<void>());
		const anonymousChanged = disposables.add(new Emitter<void>());
		const quotaChanged = disposables.add(new Emitter<void>());
		const accountChanged = disposables.add(new Emitter<ICodexAccountInfo>());
		const defaultAccountChanged = disposables.add(new Emitter<IDefaultAccountService['currentDefaultAccount']>());
		const chatEntitlementService = new class extends mock<IChatEntitlementService>() {
			override entitlement = initial.entitlement ?? ChatEntitlement.Unknown;
			override sku = initial.sku;
			override anonymous = initial.anonymous ?? false;
			override quotas: IChatEntitlementService['quotas'] = initial.quotas ?? {};
			override onDidChangeEntitlement = entitlementChanged.event;
			override onDidChangeAnonymous = anonymousChanged.event;
			override onDidChangeQuotaRemaining = quotaChanged.event;
		};
		const codexAccountService = new class extends mock<ICodexAccountService>() {
			override account: ICodexAccountInfo = initial.account ?? { status: 'signedOut' };
			override onDidChangeAccount = accountChanged.event;
		};
		const defaultAccountService = new class extends mock<IDefaultAccountService>() {
			override currentDefaultAccount = initial.defaultAccount ?? null;
			override onDidChangeDefaultAccount = defaultAccountChanged.event;
			override async getDefaultAccount() {
				await initial.defaultAccountReady;
				return this.currentDefaultAccount;
			}
		};
		const events: { name: string; data?: ITelemetryData }[] = [];
		const telemetryService = initial.telemetryService ?? new class extends NullTelemetryServiceShape {
			override publicLog2(name?: string, data?: ITelemetryData): void {
				if (name) {
					events.push({ name, data });
				}
			}
		};
		const tracker = disposables.add(new SessionsAccountTelemetryContribution(telemetryService, chatEntitlementService, codexAccountService, new NullLogService(), defaultAccountService));
		return { tracker, chatEntitlementService, codexAccountService, defaultAccountService, entitlementChanged, anonymousChanged, quotaChanged, accountChanged, defaultAccountChanged, events };
	}

	test('emits one standalone startup event with one remaining-percentage metric per provider', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const harness = createHarness({
				entitlement: ChatEntitlement.Pro,
				sku: 'copilot_for_individual_user',
				quotas: {
					premiumChat: { percentRemaining: 75, unlimited: false },
					chat: { percentRemaining: 95, unlimited: false },
					sessionRateLimit: { percentRemaining: 10, unlimited: false },
					weeklyRateLimit: { percentRemaining: 20, unlimited: false },
				},
				account: {
					status: 'signedIn',
					email: 'private@example.com',
					authUrl: 'https://auth.openai.com/private-token',
					planType: 'private-plan',
					rateLimit: { usedPercent: 90, windowDurationMins: 300 },
					rateLimits: [
						{ usedPercent: 90, windowDurationMins: 300 },
						{ usedPercent: 40, windowDurationMins: weeklyWindowMins },
					],
				},
			});
			await timeout(1);
			harness.entitlementChanged.fire();
			harness.quotaChanged.fire();
			harness.accountChanged.fire(harness.codexAccountService.account);
			await timeout(30_000);

			assert.deepStrictEqual(harness.events, [{
				name: 'agents/accountState',
				data: {
					copilotSku: 'copilot_for_individual_user',
					copilotAccountState: 'signedIn',
					copilotQuotaPercentRemaining: 75,
					chatgptAccountState: 'signedIn',
					chatgptQuotaPercentRemaining: 60,
				},
			}]);
		});
	});

	test('waits for entitlement and both providers quota data instead of emitting initial-resolution changes', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const harness = createHarness({ entitlement: ChatEntitlement.Unresolved, account: { status: 'unknown' } });
			await timeout(0);
			const eventCounts = [harness.events.length];
			harness.chatEntitlementService.entitlement = ChatEntitlement.Pro;
			harness.chatEntitlementService.sku = 'copilot_for_individual_user';
			harness.entitlementChanged.fire();
			await timeout(0);
			eventCounts.push(harness.events.length);
			harness.chatEntitlementService.quotas = { premiumChat: { percentRemaining: 75, unlimited: false } };
			harness.quotaChanged.fire();
			await timeout(0);
			eventCounts.push(harness.events.length);
			harness.codexAccountService.account = { status: 'signedIn' };
			harness.accountChanged.fire(harness.codexAccountService.account);
			await timeout(0);
			eventCounts.push(harness.events.length);
			harness.codexAccountService.account = { status: 'signedIn', rateLimit: { usedPercent: 40, windowDurationMins: weeklyWindowMins } };
			harness.accountChanged.fire(harness.codexAccountService.account);
			await timeout(0);

			assert.deepStrictEqual({ eventCounts, events: harness.events }, {
				eventCounts: [0, 0, 0, 0],
				events: [{
					name: 'agents/accountState',
					data: { copilotSku: 'copilot_for_individual_user', copilotAccountState: 'signedIn', copilotQuotaPercentRemaining: 75, chatgptAccountState: 'signedIn', chatgptQuotaPercentRemaining: 60 },
				}],
			});
		});
	});

	test('waits for default-account initialization before trusting cached signed-out state', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const accountReady = new DeferredPromise<void>();
			const harness = createHarness({
				defaultAccountReady: accountReady.p,
				defaultAccount: upcastPartial<NonNullable<IDefaultAccountService['currentDefaultAccount']>>({}),
			});
			await timeout(0);
			const eventCounts = [harness.events.length];
			await accountReady.complete();
			await timeout(0);
			eventCounts.push(harness.events.length);
			harness.chatEntitlementService.entitlement = ChatEntitlement.Pro;
			harness.chatEntitlementService.sku = 'copilot_for_individual_user';
			harness.chatEntitlementService.quotas = { premiumChat: { percentRemaining: 80, unlimited: false } };
			harness.entitlementChanged.fire();
			await timeout(0);

			assert.deepStrictEqual({ eventCounts, events: harness.events }, {
				eventCounts: [0, 0],
				events: [{
					name: 'agents/accountState',
					data: { ...signedOutSnapshot, copilotSku: 'copilot_for_individual_user', copilotAccountState: 'signedIn', copilotQuotaPercentRemaining: 80 },
				}],
			});
		});
	});

	test('uses the monthly chat quota when no premium quota exists and supports the legacy weekly summary', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { events } = createHarness({
				entitlement: ChatEntitlement.Free,
				sku: 'free_limited_copilot',
				quotas: { chat: { percentRemaining: 45, unlimited: false } },
				account: { status: 'signedIn', rateLimit: { usedPercent: 80, windowDurationMins: weeklyWindowMins } },
			});
			await timeout(1);

			assert.deepStrictEqual(events, [{
				name: 'agents/accountState',
				data: { copilotSku: 'free_limited_copilot', copilotAccountState: 'signedIn', copilotQuotaPercentRemaining: 45, chatgptAccountState: 'signedIn', chatgptQuotaPercentRemaining: 20 },
			}]);
		});
	});

	test('preserves zero, full, and fractional percentages with the same direction for both providers', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const harnesses = [0, 100, 12.5].map(remaining => createHarness({
				entitlement: ChatEntitlement.Pro,
				sku: 'copilot_for_individual_user',
				quotas: { premiumChat: { percentRemaining: remaining, unlimited: false } },
				account: { status: 'signedIn', rateLimit: { usedPercent: 100 - remaining, windowDurationMins: weeklyWindowMins } },
			}));
			await timeout(1);

			assert.deepStrictEqual(harnesses.map(({ events }) => [events[0].data?.copilotQuotaPercentRemaining, events[0].data?.chatgptQuotaPercentRemaining]), [
				[0, 0], [100, 100], [12.5, 12.5],
			]);
		});
	});

	test('emits available fields at exactly the 30-second deadline and later reports quota resolution', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const harness = createHarness({ entitlement: ChatEntitlement.Pro, sku: 'copilot_for_individual_user', account: { status: 'signedIn' } });
			await timeout(29_999);
			const beforeDeadline = [...harness.events];
			await timeout(1);
			harness.chatEntitlementService.quotas = { premiumChat: { percentRemaining: 0, unlimited: false } };
			harness.quotaChanged.fire();
			harness.codexAccountService.account = { status: 'signedIn', rateLimit: { usedPercent: 100, windowDurationMins: weeklyWindowMins } };
			harness.accountChanged.fire(harness.codexAccountService.account);
			await timeout(0);
			await timeout(30_000);

			assert.deepStrictEqual({ beforeDeadline, events: harness.events }, {
				beforeDeadline: [],
				events: [
					{
						name: 'agents/accountState',
						data: { copilotSku: 'copilot_for_individual_user', copilotAccountState: 'signedIn', copilotQuotaPercentRemaining: undefined, chatgptAccountState: 'signedIn', chatgptQuotaPercentRemaining: undefined },
					},
					{
						name: 'agents/accountStateChanged',
						data: {
							copilotSku: 'copilot_for_individual_user', copilotAccountState: 'signedIn', copilotQuotaPercentRemaining: 0,
							chatgptAccountState: 'signedIn', chatgptQuotaPercentRemaining: 0,
							changeReason: 'quotaResolved', previousCopilotSku: 'copilot_for_individual_user', previousCopilotAccountState: 'signedIn', previousChatgptAccountState: 'signedIn',
						},
					},
				],
			});
		});
	});

	test('keeps unresolved and signed-out states distinct and drops cached account quotas', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const harnesses = [ChatEntitlement.Unknown, ChatEntitlement.Unresolved].map(entitlement => createHarness({
				entitlement,
				sku: 'cached_sku',
				quotas: { premiumChat: { percentRemaining: 50, unlimited: false } },
				account: { status: 'signedOut', rateLimit: { usedPercent: 50, windowDurationMins: weeklyWindowMins } },
			}));
			await timeout(30_000);

			assert.deepStrictEqual(harnesses.map(({ events }) => events), [
				[{ name: 'agents/accountState', data: signedOutSnapshot }],
				[{ name: 'agents/accountState', data: { ...signedOutSnapshot, copilotSku: 'unknown', copilotAccountState: 'unknown' } }],
			]);
		});
	});

	test('reports unknown rather than cached sign-out if account initialization times out', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const accountReady = new DeferredPromise<void>();
			const harness = createHarness({ defaultAccountReady: accountReady.p, account: { status: 'unknown' } });
			await timeout(30_000);
			await accountReady.complete();
			await timeout(1);

			assert.deepStrictEqual(harness.events, [
				{
					name: 'agents/accountState',
					data: { ...signedOutSnapshot, copilotSku: 'unknown', copilotAccountState: 'unknown', chatgptAccountState: 'unknown' },
				},
				{
					name: 'agents/accountStateChanged',
					data: {
						...signedOutSnapshot, chatgptAccountState: 'unknown',
						changeReason: 'accountChanged', previousCopilotSku: 'unknown', previousCopilotAccountState: 'unknown', previousChatgptAccountState: 'unknown',
					},
				},
			]);
		});
	});

	test('reports unknown at the deadline for a resolved signed-in account awaiting entitlement', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const harness = createHarness({
				defaultAccount: upcastPartial<NonNullable<IDefaultAccountService['currentDefaultAccount']>>({}),
				sku: 'cached_sku',
				quotas: { premiumChat: { percentRemaining: 50, unlimited: false } },
			});
			await timeout(29_999);
			const beforeDeadline = [...harness.events];
			await timeout(1);
			harness.chatEntitlementService.entitlement = ChatEntitlement.Pro;
			harness.chatEntitlementService.sku = 'copilot_for_individual_user';
			harness.chatEntitlementService.quotas = { premiumChat: { percentRemaining: 75, unlimited: false } };
			harness.entitlementChanged.fire();
			await timeout(0);

			assert.deepStrictEqual({ beforeDeadline, events: harness.events }, {
				beforeDeadline: [],
				events: [
					{
						name: 'agents/accountState',
						data: { ...signedOutSnapshot, copilotSku: 'unknown', copilotAccountState: 'unknown' },
					},
					{
						name: 'agents/accountStateChanged',
						data: {
							...signedOutSnapshot, copilotSku: 'copilot_for_individual_user', copilotAccountState: 'signedIn', copilotQuotaPercentRemaining: 75,
							changeReason: 'accountChanged', previousCopilotSku: 'unknown', previousCopilotAccountState: 'unknown', previousChatgptAccountState: 'signedOut',
						},
					},
				],
			});
		});
	});

	test('observes pending sign-in and sign-out while entitlement remains Unknown', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const harness = createHarness();
			await timeout(1);
			harness.defaultAccountService.currentDefaultAccount = upcastPartial<NonNullable<IDefaultAccountService['currentDefaultAccount']>>({});
			harness.defaultAccountChanged.fire(harness.defaultAccountService.currentDefaultAccount);
			await timeout(0);
			harness.defaultAccountService.currentDefaultAccount = null;
			harness.defaultAccountChanged.fire(null);
			await timeout(0);

			assert.deepStrictEqual(harness.events, [
				{ name: 'agents/accountState', data: signedOutSnapshot },
				{
					name: 'agents/accountStateChanged',
					data: {
						...signedOutSnapshot, copilotSku: 'unknown', copilotAccountState: 'unknown',
						changeReason: 'accountChanged', previousCopilotSku: 'signedOut', previousCopilotAccountState: 'signedOut', previousChatgptAccountState: 'signedOut',
					},
				},
				{
					name: 'agents/accountStateChanged',
					data: {
						...signedOutSnapshot,
						changeReason: 'accountChanged', previousCopilotSku: 'unknown', previousCopilotAccountState: 'unknown', previousChatgptAccountState: 'signedOut',
					},
				},
			]);
		});
	});

	test('preserves the anonymous SKU at startup and on anonymous access changes', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const harness = createHarness({ anonymous: true, sku: 'no_auth_limited_copilot' });
			await timeout(1);
			harness.chatEntitlementService.anonymous = false;
			harness.anonymousChanged.fire();
			await timeout(0);
			harness.chatEntitlementService.anonymous = true;
			harness.anonymousChanged.fire();
			await timeout(0);

			assert.deepStrictEqual(harness.events, [
				{ name: 'agents/accountState', data: { ...signedOutSnapshot, copilotSku: 'no_auth_limited_copilot' } },
				{
					name: 'agents/accountStateChanged',
					data: {
						...signedOutSnapshot,
						changeReason: 'accountChanged', previousCopilotSku: 'no_auth_limited_copilot', previousCopilotAccountState: 'signedOut', previousChatgptAccountState: 'signedOut',
					},
				},
				{
					name: 'agents/accountStateChanged',
					data: {
						...signedOutSnapshot, copilotSku: 'no_auth_limited_copilot',
						changeReason: 'accountChanged', previousCopilotSku: 'signedOut', previousCopilotAccountState: 'signedOut', previousChatgptAccountState: 'signedOut',
					},
				},
			]);
		});
	});

	test('retains the anonymous SKU as the previous SKU after sign-in', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const harness = createHarness({ anonymous: true, sku: 'no_auth_limited_copilot' });
			await timeout(1);
			harness.chatEntitlementService.anonymous = false;
			harness.chatEntitlementService.entitlement = ChatEntitlement.Pro;
			harness.chatEntitlementService.sku = 'copilot_for_individual_user';
			harness.chatEntitlementService.quotas = { premiumChat: { percentRemaining: 75, unlimited: false } };
			harness.entitlementChanged.fire();
			harness.anonymousChanged.fire();
			await timeout(0);

			assert.deepStrictEqual(harness.events, [
				{ name: 'agents/accountState', data: { ...signedOutSnapshot, copilotSku: 'no_auth_limited_copilot' } },
				{
					name: 'agents/accountStateChanged',
					data: {
						...signedOutSnapshot, copilotSku: 'copilot_for_individual_user', copilotAccountState: 'signedIn', copilotQuotaPercentRemaining: 75,
						changeReason: 'accountChanged', previousCopilotSku: 'no_auth_limited_copilot', previousCopilotAccountState: 'signedOut', previousChatgptAccountState: 'signedOut',
					},
				},
			]);
		});
	});

	test('does not wait on known unlimited or empty quota responses', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { events } = createHarness({
				entitlement: ChatEntitlement.Business,
				sku: 'copilot_for_business',
				quotas: { premiumChat: { percentRemaining: 100, unlimited: true, creditsUsed: 42 } },
				account: { status: 'signedIn', rateLimits: [] },
			});
			await timeout(1);

			assert.deepStrictEqual(events, [{
				name: 'agents/accountState',
				data: { ...signedOutSnapshot, copilotSku: 'copilot_for_business', copilotAccountState: 'signedIn', chatgptAccountState: 'signedIn' },
			}]);
		});
	});

	test('omits missing, non-weekly, invalid, and expired quota percentages instead of reporting zero', async () => {
		await runWithFakedTimers({ useFakeTimers: true, startTime: 100_000 }, async () => {
			const harnesses = [
				createHarness({ entitlement: ChatEntitlement.Pro, account: { status: 'signedIn' } }),
				createHarness({ account: { status: 'signedIn', rateLimit: { usedPercent: 50, windowDurationMins: 300 } } }),
				createHarness({ account: { status: 'signedIn', rateLimit: { usedPercent: 50 } } }),
				createHarness({
					entitlement: ChatEntitlement.Pro,
					quotas: { premiumChat: { percentRemaining: 50, unlimited: false, resetAt: 99 } },
					account: { status: 'signedIn', rateLimit: { usedPercent: 50, windowDurationMins: weeklyWindowMins, resetsAt: 99 } },
				}),
				...[-1, 101, NaN, Infinity].map(value => createHarness({
					entitlement: ChatEntitlement.Pro,
					quotas: { premiumChat: { percentRemaining: value, unlimited: false } },
					account: { status: 'signedIn', rateLimit: { usedPercent: value, windowDurationMins: weeklyWindowMins } },
				})),
			];
			await timeout(30_000);

			assert.deepStrictEqual(harnesses.map(({ events }) => [events[0].data?.copilotQuotaPercentRemaining, events[0].data?.chatgptQuotaPercentRemaining]), Array.from({ length: 8 }, () => [undefined, undefined]));
		});
	});

	test('reports later sign-in, SKU changes, and sign-out after the matching quota update', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const harness = createHarness();
			await timeout(1);
			harness.chatEntitlementService.entitlement = ChatEntitlement.Pro;
			harness.chatEntitlementService.sku = 'copilot_for_individual_user';
			harness.entitlementChanged.fire();
			harness.chatEntitlementService.quotas = { premiumChat: { percentRemaining: 75, unlimited: false } };
			harness.quotaChanged.fire();
			await timeout(0);
			harness.chatEntitlementService.entitlement = ChatEntitlement.ProPlus;
			harness.chatEntitlementService.sku = 'copilot_for_individual_user_pro';
			harness.entitlementChanged.fire();
			harness.chatEntitlementService.quotas = { premiumChat: { percentRemaining: 90, unlimited: false } };
			harness.quotaChanged.fire();
			await timeout(0);
			harness.chatEntitlementService.entitlement = ChatEntitlement.Unknown;
			harness.entitlementChanged.fire();
			await timeout(0);

			assert.deepStrictEqual(harness.events, [
				{ name: 'agents/accountState', data: signedOutSnapshot },
				{
					name: 'agents/accountStateChanged',
					data: {
						...signedOutSnapshot, copilotSku: 'copilot_for_individual_user', copilotAccountState: 'signedIn', copilotQuotaPercentRemaining: 75,
						changeReason: 'accountChanged', previousCopilotSku: 'signedOut', previousCopilotAccountState: 'signedOut', previousChatgptAccountState: 'signedOut',
					},
				},
				{
					name: 'agents/accountStateChanged',
					data: {
						...signedOutSnapshot, copilotSku: 'copilot_for_individual_user_pro', copilotAccountState: 'signedIn', copilotQuotaPercentRemaining: 90,
						changeReason: 'accountChanged', previousCopilotSku: 'copilot_for_individual_user', previousCopilotAccountState: 'signedIn', previousChatgptAccountState: 'signedOut',
					},
				},
				{
					name: 'agents/accountStateChanged',
					data: {
						...signedOutSnapshot,
						changeReason: 'accountChanged', previousCopilotSku: 'copilot_for_individual_user_pro', previousCopilotAccountState: 'signedIn', previousChatgptAccountState: 'signedOut',
					},
				},
			]);
		});
	});

	test('reports later ChatGPT sign-in and sign-out without retaining a signed-out quota', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const harness = createHarness();
			await timeout(1);
			harness.codexAccountService.account = { status: 'signedIn', rateLimit: { usedPercent: 40, windowDurationMins: weeklyWindowMins } };
			harness.accountChanged.fire(harness.codexAccountService.account);
			await timeout(0);
			harness.codexAccountService.account = { ...harness.codexAccountService.account, status: 'signedOut' };
			harness.accountChanged.fire(harness.codexAccountService.account);
			await timeout(0);

			assert.deepStrictEqual(harness.events, [
				{ name: 'agents/accountState', data: signedOutSnapshot },
				{
					name: 'agents/accountStateChanged',
					data: {
						...signedOutSnapshot, chatgptAccountState: 'signedIn', chatgptQuotaPercentRemaining: 60,
						changeReason: 'accountChanged', previousCopilotSku: 'signedOut', previousCopilotAccountState: 'signedOut', previousChatgptAccountState: 'signedOut',
					},
				},
				{
					name: 'agents/accountStateChanged',
					data: {
						...signedOutSnapshot,
						changeReason: 'accountChanged', previousCopilotSku: 'signedOut', previousCopilotAccountState: 'signedOut', previousChatgptAccountState: 'signedIn',
					},
				},
			]);
		});
	});

	test('ignores routine quota consumption and unrelated account updates after startup', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const harness = createHarness({
				entitlement: ChatEntitlement.Pro,
				sku: 'copilot_for_individual_user',
				quotas: { premiumChat: { percentRemaining: 75, unlimited: false } },
				account: { status: 'signedIn', rateLimit: { usedPercent: 40, windowDurationMins: weeklyWindowMins } },
			});
			await timeout(1);
			harness.chatEntitlementService.quotas = { premiumChat: { percentRemaining: 50, unlimited: false } };
			harness.quotaChanged.fire();
			harness.codexAccountService.account = { status: 'signedIn', email: 'private@example.com', rateLimit: { usedPercent: 60, windowDurationMins: weeklyWindowMins } };
			harness.accountChanged.fire(harness.codexAccountService.account);
			harness.entitlementChanged.fire();
			await timeout(30_000);

			assert.deepStrictEqual(harness.events, [{
				name: 'agents/accountState',
				data: { copilotSku: 'copilot_for_individual_user', copilotAccountState: 'signedIn', copilotQuotaPercentRemaining: 75, chatgptAccountState: 'signedIn', chatgptQuotaPercentRemaining: 60 },
			}]);
		});
	});

	test('startup and change events honor the existing usage telemetry consent', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const results = [TelemetryLevel.NONE, TelemetryLevel.CRASH, TelemetryLevel.ERROR, TelemetryLevel.USAGE].map(level => {
				const names: string[] = [];
				const telemetryService = disposables.add(TelemetryService.createWithLevel({
					telemetryLevel: level,
					appenders: [{ log: name => names.push(name), flush: async () => { } }],
				}, { ...product, _serviceBrand: undefined }));
				return { names, harness: createHarness({ telemetryService }) };
			});
			await timeout(1);
			for (const { harness } of results) {
				harness.codexAccountService.account = { status: 'signedIn' };
				harness.accountChanged.fire(harness.codexAccountService.account);
			}
			await timeout(0);

			assert.deepStrictEqual(results.map(result => result.names), [[], [], [], ['agents/accountState', 'agents/accountStateChanged']]);
		});
	});

	test('disposes pending startup, initialization continuations, and account listeners', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const accountReady = new DeferredPromise<void>();
			const harness = createHarness({ defaultAccountReady: accountReady.p });
			harness.entitlementChanged.fire();
			harness.tracker.dispose();
			await accountReady.complete();
			harness.quotaChanged.fire();
			harness.accountChanged.fire({ status: 'signedIn' });
			await timeout(30_000);

			assert.deepStrictEqual(harness.events, []);
		});
	});

	test('disposes a pending change without emitting a second startup event', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const harness = createHarness();
			await timeout(1);
			harness.chatEntitlementService.entitlement = ChatEntitlement.Free;
			harness.entitlementChanged.fire();
			harness.tracker.dispose();
			await timeout(30_000);

			assert.deepStrictEqual(harness.events, [{ name: 'agents/accountState', data: signedOutSnapshot }]);
		});
	});
});

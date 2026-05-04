/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IInlineCompletionsService } from '../../../../../editor/browser/services/inlineCompletionsService.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { ChatStatusDashboard, IChatStatusDashboardOptions } from '../../../chat/browser/chatStatus/chatStatusDashboard.js';
import { IChatStatusItemService } from '../../../chat/browser/chatStatus/chatStatusItemService.js';

interface IQuotaConfig {
	percentRemaining: number;
	unlimited: boolean;
	usageBasedBilling?: boolean;
	resetAt?: number;
	entitlement?: number;
}

function createEntitlementService(opts: {
	chat?: IQuotaConfig;
	completions?: IQuotaConfig;
	premiumChat?: IQuotaConfig;
	additionalUsageEnabled?: boolean;
	entitlement?: ChatEntitlement;
}): IChatEntitlementService {
	return {
		_serviceBrand: undefined,
		organisations: undefined,
		isInternal: false,
		sku: undefined,
		copilotTrackingId: undefined,
		onDidChangeQuotaExceeded: Event.None,
		onDidChangeQuotaRemaining: Event.None,
		quotas: {
			chat: opts.chat,
			completions: opts.completions,
			premiumChat: opts.premiumChat,
			additionalUsageEnabled: opts.additionalUsageEnabled,
		},
		update: (_token: CancellationToken) => Promise.resolve(),
		onDidChangeSentiment: Event.None,
		sentimentObs: observableValue({}, {}),
		sentiment: { completed: true },
		onDidChangeEntitlement: Event.None,
		entitlement: opts.entitlement ?? ChatEntitlement.Free,
		entitlementObs: observableValue({}, opts.entitlement ?? ChatEntitlement.Free),
		anonymous: false,
		onDidChangeAnonymous: Event.None,
		anonymousObs: observableValue({}, false),
		markAnonymousRateLimited: () => { },
		setForceHidden: () => { },
		previewFeaturesDisabled: false,
		clientByokEnabled: false,
	} as IChatEntitlementService;
}

function getQuotaLabels(element: HTMLElement): string[] {
	const indicators = element.querySelectorAll('.quota-indicator:not(.included) .quota-title');
	return Array.from(indicators).map(el => el.textContent ?? '');
}

function getIncludedLabels(element: HTMLElement): string[] {
	const indicators = element.querySelectorAll('.quota-indicator.included .quota-title');
	return Array.from(indicators).map(el => el.textContent ?? '');
}

function getQuotaValues(element: HTMLElement): string[] {
	const values = element.querySelectorAll('.quota-indicator:not(.included) .quota-value');
	return Array.from(values).map(el => el.textContent ?? '');
}

const dashboardOptions: IChatStatusDashboardOptions = {
	disableInlineSuggestionsSettings: true,
	disableModelSelection: true,
	disableProviderOptions: true,
	disableCompletionsSnooze: true,
};

suite('ChatStatusDashboard', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createDashboard(entitlementService: IChatEntitlementService): ChatStatusDashboard {
		const instantiationService = workbenchInstantiationService(undefined, store);

		instantiationService.stub(IChatEntitlementService, entitlementService);
		instantiationService.stub(IChatStatusItemService, {
			_serviceBrand: undefined,
			onDidChange: Event.None,
			setOrUpdateEntry: () => { },
			deleteEntry: () => { },
			getEntries: () => [],
		});
		instantiationService.stub(IInlineCompletionsService, {
			_serviceBrand: undefined,
			onDidChangeIsSnoozing: Event.None,
			snoozeTimeLeft: 0,
			snooze: () => { },
			setSnoozeDuration: () => { },
		});
		instantiationService.stub(IMarkdownRendererService, {
			_serviceBrand: undefined,
		});

		const dashboard = store.add(instantiationService.createInstance(ChatStatusDashboard, dashboardOptions));

		mainWindow.document.body.appendChild(dashboard.element);
		store.add({ dispose: () => dashboard.element.remove() });

		return dashboard;
	}

	// --- COPILOT FREE ---

	test('Free — PRU: shows Chat messages and Inline Suggestions', () => {
		const dashboard = createDashboard(createEntitlementService({
			chat: { percentRemaining: 80, unlimited: false },
			completions: { percentRemaining: 70, unlimited: false },
			entitlement: ChatEntitlement.Free,
		}));

		assert.deepStrictEqual(getQuotaLabels(dashboard.element), ['Chat messages', 'Inline Suggestions']);
		assert.deepStrictEqual(getQuotaValues(dashboard.element), ['20%', '30%']);
	});

	test('Free — PRU exhausted: shows Chat messages and Inline Suggestions at 0%', () => {
		const dashboard = createDashboard(createEntitlementService({
			chat: { percentRemaining: 0, unlimited: false },
			completions: { percentRemaining: 0, unlimited: false },
			entitlement: ChatEntitlement.Free,
		}));

		assert.deepStrictEqual(getQuotaLabels(dashboard.element), ['Chat messages', 'Inline Suggestions']);
		assert.deepStrictEqual(getQuotaValues(dashboard.element), ['100%', '100%']);
	});

	test('Free — TBB: shows Monthly Limit and Inline Suggestions, not Chat messages', () => {
		const dashboard = createDashboard(createEntitlementService({
			chat: { percentRemaining: 80, unlimited: false },
			premiumChat: { percentRemaining: 60, unlimited: false, usageBasedBilling: true },
			completions: { percentRemaining: 70, unlimited: false },
			entitlement: ChatEntitlement.Free,
		}));

		assert.deepStrictEqual(getQuotaLabels(dashboard.element), ['Monthly Limit', 'Inline Suggestions']);
		assert.deepStrictEqual(getQuotaValues(dashboard.element), ['40%', '30%']);
	});

	test('Free — TBB exhausted: shows Monthly Limit and Inline Suggestions at 0%', () => {
		const dashboard = createDashboard(createEntitlementService({
			chat: { percentRemaining: 0, unlimited: false },
			premiumChat: { percentRemaining: 0, unlimited: false, usageBasedBilling: true },
			completions: { percentRemaining: 0, unlimited: false },
			entitlement: ChatEntitlement.Free,
		}));

		assert.deepStrictEqual(getQuotaLabels(dashboard.element), ['Monthly Limit', 'Inline Suggestions']);
		assert.deepStrictEqual(getQuotaValues(dashboard.element), ['100%', '100%']);
	});

	// --- COPILOT PRO (EDU/Pro) ---

	test('EDU/Pro — PRU: shows Chat messages, Premium requests, and Inline Suggestions', () => {
		const dashboard = createDashboard(createEntitlementService({
			chat: { percentRemaining: 80, unlimited: false },
			premiumChat: { percentRemaining: 60, unlimited: false },
			completions: { percentRemaining: 90, unlimited: false },
			entitlement: ChatEntitlement.Pro,
		}));

		assert.deepStrictEqual(getQuotaLabels(dashboard.element), ['Chat messages', 'Premium requests', 'Inline Suggestions']);
	});

	test('EDU/Pro — TBB: shows only Monthly Limit, not Chat messages or Inline Suggestions', () => {
		const dashboard = createDashboard(createEntitlementService({
			chat: { percentRemaining: 80, unlimited: false },
			premiumChat: { percentRemaining: 60, unlimited: false, usageBasedBilling: true },
			completions: { percentRemaining: 90, unlimited: false },
			entitlement: ChatEntitlement.Pro,
		}));

		assert.deepStrictEqual(getQuotaLabels(dashboard.element), ['Monthly Limit']);
	});

	test('EDU/Pro — TBB exhausted (no overages): shows only Monthly Limit', () => {
		const dashboard = createDashboard(createEntitlementService({
			chat: { percentRemaining: 0, unlimited: false },
			premiumChat: { percentRemaining: 0, unlimited: false, usageBasedBilling: true },
			completions: { percentRemaining: 90, unlimited: false },
			additionalUsageEnabled: false,
			entitlement: ChatEntitlement.Pro,
		}));

		assert.deepStrictEqual(getQuotaLabels(dashboard.element), ['Monthly Limit']);
		assert.deepStrictEqual(getQuotaValues(dashboard.element), ['100%']);
	});

	test('EDU/Pro — TBB exhausted (with overages): shows only Monthly Limit', () => {
		const dashboard = createDashboard(createEntitlementService({
			chat: { percentRemaining: 0, unlimited: false },
			premiumChat: { percentRemaining: 0, unlimited: false, usageBasedBilling: true },
			completions: { percentRemaining: 90, unlimited: false },
			additionalUsageEnabled: true,
			entitlement: ChatEntitlement.Pro,
		}));

		assert.deepStrictEqual(getQuotaLabels(dashboard.element), ['Monthly Limit']);
		assert.deepStrictEqual(getQuotaValues(dashboard.element), ['100%']);
	});

	// --- COPILOT PRO+ ---

	test('Pro+ — PRU: shows Premium requests and Inline Suggestions', () => {
		const dashboard = createDashboard(createEntitlementService({
			premiumChat: { percentRemaining: 60, unlimited: false },
			completions: { percentRemaining: 90, unlimited: false },
			entitlement: ChatEntitlement.ProPlus,
		}));

		assert.deepStrictEqual(getQuotaLabels(dashboard.element), ['Premium requests', 'Inline Suggestions']);
	});

	test('Pro+ — TBB with quota: shows only Monthly Limit', () => {
		const dashboard = createDashboard(createEntitlementService({
			chat: { percentRemaining: 80, unlimited: false },
			premiumChat: { percentRemaining: 60, unlimited: false, usageBasedBilling: true },
			completions: { percentRemaining: 90, unlimited: false },
			entitlement: ChatEntitlement.ProPlus,
		}));

		assert.deepStrictEqual(getQuotaLabels(dashboard.element), ['Monthly Limit']);
	});

	test('Pro+ — TBB out of quota: shows only Monthly Limit', () => {
		const dashboard = createDashboard(createEntitlementService({
			chat: { percentRemaining: 0, unlimited: false },
			premiumChat: { percentRemaining: 0, unlimited: false, usageBasedBilling: true },
			completions: { percentRemaining: 90, unlimited: false },
			entitlement: ChatEntitlement.ProPlus,
		}));

		assert.deepStrictEqual(getQuotaLabels(dashboard.element), ['Monthly Limit']);
		assert.deepStrictEqual(getQuotaValues(dashboard.element), ['100%']);
	});

	// --- COPILOT MAX ---

	test('Max Yearly — no TBB: shows unlimited Premium Requests included indicator', () => {
		const dashboard = createDashboard(createEntitlementService({
			premiumChat: { percentRemaining: 100, unlimited: true },
			completions: { percentRemaining: 100, unlimited: true },
			entitlement: ChatEntitlement.Max,
		}));

		// Unlimited quotas are not shown as quota indicators
		assert.deepStrictEqual(getQuotaLabels(dashboard.element), []);
		// Instead shown as "included" indicator
		assert.deepStrictEqual(getIncludedLabels(dashboard.element), ['Premium Requests']);
	});

	test('Max Monthly — TBB: shows unlimited Monthly Limit included indicator', () => {
		const dashboard = createDashboard(createEntitlementService({
			premiumChat: { percentRemaining: 100, unlimited: true, usageBasedBilling: true },
			completions: { percentRemaining: 100, unlimited: true },
			entitlement: ChatEntitlement.Max,
		}));

		assert.deepStrictEqual(getQuotaLabels(dashboard.element), []);
		assert.deepStrictEqual(getIncludedLabels(dashboard.element), ['Monthly Limit']);
	});

	// --- BUSINESS / ENTERPRISE ---

	test('Enterprise Managed — PRU: shows Premium requests with unlimited included', () => {
		const dashboard = createDashboard(createEntitlementService({
			premiumChat: { percentRemaining: 100, unlimited: true },
			completions: { percentRemaining: 100, unlimited: true },
			entitlement: ChatEntitlement.Business,
		}));

		assert.deepStrictEqual(getQuotaLabels(dashboard.element), []);
		assert.deepStrictEqual(getIncludedLabels(dashboard.element), ['Premium Requests']);
	});

	test('Enterprise — TBB (multi-quota): shows only Monthly Limit, not Chat messages or Inline Suggestions', () => {
		const dashboard = createDashboard(createEntitlementService({
			chat: { percentRemaining: 80, unlimited: false },
			premiumChat: { percentRemaining: 60, unlimited: false, usageBasedBilling: true },
			completions: { percentRemaining: 70, unlimited: false },
			entitlement: ChatEntitlement.Enterprise,
		}));

		assert.deepStrictEqual(getQuotaLabels(dashboard.element), ['Monthly Limit']);
	});

	// --- HOVER: CREDIT FRACTIONS ---

	test('Hover shows credit fractions when entitlement is available', () => {
		const dashboard = createDashboard(createEntitlementService({
			chat: { percentRemaining: 80, unlimited: false, entitlement: 2000 },
			completions: { percentRemaining: 70, unlimited: false, entitlement: 5000 },
			entitlement: ChatEntitlement.Free,
		}));

		const quotaPercentages = dashboard.element.querySelectorAll('.quota-indicator:not(.included) .quota-percentage');
		assert.strictEqual(quotaPercentages.length, 2);

		// Before hover: shows percentages
		assert.deepStrictEqual(getQuotaValues(dashboard.element), ['20%', '30%']);

		// Hover: shows credit fractions
		quotaPercentages[0].dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
		const chatValue = quotaPercentages[0].querySelector('.quota-value');
		assert.ok(chatValue?.textContent?.includes('/'));

		// Mouse leave: reverts to percentage
		quotaPercentages[0].dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
		assert.deepStrictEqual(getQuotaValues(dashboard.element), ['20%', '30%']);
	});

	test('Hover is a no-op when entitlement is not available', () => {
		const dashboard = createDashboard(createEntitlementService({
			chat: { percentRemaining: 80, unlimited: false },
			completions: { percentRemaining: 70, unlimited: false },
			entitlement: ChatEntitlement.Free,
		}));

		const quotaPercentages = dashboard.element.querySelectorAll('.quota-indicator:not(.included) .quota-percentage');
		assert.strictEqual(quotaPercentages.length, 2);

		// Before hover: shows percentages
		assert.deepStrictEqual(getQuotaValues(dashboard.element), ['20%', '30%']);

		// Hover: still shows percentages (no entitlement data)
		quotaPercentages[0].dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
		assert.deepStrictEqual(getQuotaValues(dashboard.element), ['20%', '30%']);
	});

	test('Focus shows credit fractions (keyboard accessibility)', () => {
		const dashboard = createDashboard(createEntitlementService({
			chat: { percentRemaining: 80, unlimited: false, entitlement: 2000 },
			completions: { percentRemaining: 70, unlimited: false, entitlement: 5000 },
			entitlement: ChatEntitlement.Free,
		}));

		const quotaPercentages = dashboard.element.querySelectorAll('.quota-indicator:not(.included) .quota-percentage');
		assert.strictEqual(quotaPercentages.length, 2);

		// Before focus: shows percentages
		assert.deepStrictEqual(getQuotaValues(dashboard.element), ['20%', '30%']);

		// Focus: shows credit fractions
		quotaPercentages[0].dispatchEvent(new FocusEvent('focus', { bubbles: true }));
		const chatValue = quotaPercentages[0].querySelector('.quota-value');
		assert.ok(chatValue?.textContent?.includes('/'));

		// Blur: reverts to percentage
		quotaPercentages[0].dispatchEvent(new FocusEvent('blur', { bubbles: true }));
		assert.deepStrictEqual(getQuotaValues(dashboard.element), ['20%', '30%']);
	});

	test('Quota percentage element is keyboard-focusable', () => {
		const dashboard = createDashboard(createEntitlementService({
			chat: { percentRemaining: 80, unlimited: false, entitlement: 2000 },
			entitlement: ChatEntitlement.Free,
		}));

		const quotaPercentage = dashboard.element.querySelector('.quota-indicator:not(.included) .quota-percentage') as HTMLElement;
		assert.ok(quotaPercentage);
		assert.strictEqual(quotaPercentage.tabIndex, 0);
	});
});

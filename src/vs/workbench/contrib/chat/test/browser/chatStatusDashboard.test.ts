/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IInlineCompletionsService } from '../../../../../editor/browser/services/inlineCompletionsService.js';
import { ConfigurationTarget, type IConfigurationOverrides, type IConfigurationValue } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import product from '../../../../../platform/product/common/product.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { ChatStatusDashboard, IChatStatusDashboardOptions } from '../../../chat/browser/chatStatus/chatStatusDashboard.js';
import { IChatStatusItemService } from '../../../chat/browser/chatStatus/chatStatusItemService.js';

interface IQuotaConfig {
	percentRemaining: number;
	unlimited: boolean;
	hasQuota?: boolean;
	usageBasedBilling?: boolean;
	resetAt?: number;
	entitlement?: number;
	creditsUsed?: number;
}

function createEntitlementService(opts: {
	chat?: IQuotaConfig;
	completions?: IQuotaConfig;
	premiumChat?: IQuotaConfig;
	usageBasedBilling?: boolean;
	additionalUsageEnabled?: boolean;
	additionalUsageCount?: number;
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
		onDidChangeUsageBasedBilling: Event.None,
		quotas: {
			chat: opts.chat,
			completions: opts.completions,
			premiumChat: opts.premiumChat,
			usageBasedBilling: opts.usageBasedBilling ?? opts.premiumChat?.usageBasedBilling,
			additionalUsageEnabled: opts.additionalUsageEnabled,
			additionalUsageCount: opts.additionalUsageCount,
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
		acceptQuotas: () => { },
		clearQuotas: () => { },
		markAnonymousRateLimited: () => { },
		markSetupCompleted: () => { },
		setForceHidden: () => { },
		clientByokEnabled: false,
		hasByokModels: false,
	} as IChatEntitlementService;
}

function getCalloutText(element: HTMLElement): string | null {
	const callout = element.querySelector('.quota-callout') as HTMLElement | null;
	if (!callout || callout.style.display === 'none') {
		return null;
	}
	const text = callout.querySelector('.callout-text');
	return text?.textContent ?? null;
}

function getQuotaLabels(element: HTMLElement): string[] {
	const indicators = element.querySelectorAll('.quota-indicator:not(.included) .quota-title');
	return Array.from(indicators).map(el => el.textContent ?? '');
}

function getIncludedLabels(element: HTMLElement): string[] {
	const indicators = element.querySelectorAll('.quota-indicator.included .quota-title');
	return Array.from(indicators).map(el => el.textContent ?? '');
}

function getIncludedDescriptions(element: HTMLElement): string[] {
	const indicators = element.querySelectorAll('.quota-indicator.included .description');
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

class TestCompletionsConfigurationService extends TestConfigurationService {

	private pendingUpdate: { value: Record<string, boolean>; target: ConfigurationTarget; deferred: DeferredPromise<void> } | undefined;

	constructor(
		private readonly settingId: string,
		private readonly defaultValue: Record<string, boolean>,
		private userValue: Record<string, boolean>,
		private workspaceValue?: Record<string, boolean>,
	) {
		super();
	}

	override getValue<T>(arg1?: string | IConfigurationOverrides, arg2?: IConfigurationOverrides): T | undefined {
		if (arg1 === this.settingId) {
			return { ...this.defaultValue, ...this.userValue, ...this.workspaceValue } as T;
		}
		return super.getValue<T>(arg1, arg2);
	}

	override inspect<T>(key: string, overrides?: IConfigurationOverrides): IConfigurationValue<T> {
		if (key === this.settingId) {
			const userValue = this.userValue as T;
			return {
				defaultValue: this.defaultValue as T,
				userValue,
				userLocalValue: userValue,
				workspaceValue: this.workspaceValue as T | undefined,
				value: { ...this.defaultValue, ...this.userValue, ...this.workspaceValue } as T,
			};
		}
		return super.inspect<T>(key, overrides);
	}

	override updateValue(key: string, value: unknown, target?: ConfigurationTarget): Promise<void> {
		if (key !== this.settingId || typeof value !== 'object' || value === null || this.pendingUpdate) {
			throw new Error('Unexpected configuration update');
		}

		const deferred = new DeferredPromise<void>();
		this.pendingUpdate = {
			value: { ...value } as Record<string, boolean>,
			target: target ?? ConfigurationTarget.USER_LOCAL,
			deferred,
		};
		return deferred.p;
	}

	async completeUpdate(): Promise<void> {
		if (!this.pendingUpdate) {
			await timeout(0);
		}
		const pendingUpdate = this.pendingUpdate;
		if (!pendingUpdate) {
			throw new Error('No configuration update is pending');
		}

		this.pendingUpdate = undefined;
		if (pendingUpdate.target === ConfigurationTarget.WORKSPACE) {
			this.workspaceValue = pendingUpdate.value;
		} else if (pendingUpdate.target === ConfigurationTarget.USER_LOCAL) {
			this.userValue = pendingUpdate.value;
		} else {
			throw new Error(`Unexpected configuration target: ${pendingUpdate.target}`);
		}
		this.onDidChangeConfigurationEmitter.fire({
			source: pendingUpdate.target,
			affectedKeys: new Set([this.settingId]),
			change: { keys: [this.settingId], overrides: [] },
			affectsConfiguration: candidate => candidate === this.settingId,
		});
		await pendingUpdate.deferred.complete(undefined);
		await timeout(0);
	}

	async failUpdate(error: Error): Promise<void> {
		if (!this.pendingUpdate) {
			await timeout(0);
		}
		const pendingUpdate = this.pendingUpdate;
		if (!pendingUpdate) {
			throw new Error('No configuration update is pending');
		}

		this.pendingUpdate = undefined;
		await pendingUpdate.deferred.error(error);
		await timeout(0);
	}

	get configuredValue(): Record<string, boolean> {
		return this.userValue;
	}

	get configuredWorkspaceValue(): Record<string, boolean> | undefined {
		return this.workspaceValue;
	}
}

suite('ChatStatusDashboard', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createDashboard(entitlementService: IChatEntitlementService, options: {
		dashboardOptions?: IChatStatusDashboardOptions;
		configurationService?: TestConfigurationService;
		activeTextEditorLanguageId?: string;
	} = {}): ChatStatusDashboard {
		const configurationService = options.configurationService;
		const instantiationService = workbenchInstantiationService(configurationService ? { configurationService: () => configurationService } : undefined, store);

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
		if (options.activeTextEditorLanguageId) {
			const activeTextEditorLanguageId = options.activeTextEditorLanguageId;
			instantiationService.stub(IEditorService, new class extends mock<IEditorService>() {
				override readonly activeTextEditorLanguageId = activeTextEditorLanguageId;
			});
		}

		const dashboard = store.add(instantiationService.createInstance(ChatStatusDashboard, options.dashboardOptions ?? dashboardOptions));

		mainWindow.document.body.appendChild(dashboard.element);
		store.add({ dispose: () => dashboard.element.remove() });

		return dashboard;
	}

	test('preserves inline suggestion language setting state across writes', async () => {
		const defaultChat = product.defaultChatAgent;
		assert.ok(defaultChat);

		const configurationService = new TestCompletionsConfigurationService(
			defaultChat.completionsEnablementSetting,
			{ '*': true, markdown: false },
			{ '*': true, markdown: false },
		);
		const dashboard = createDashboard(createEntitlementService({ entitlement: ChatEntitlement.Pro }), {
			dashboardOptions: {
				...dashboardOptions,
				disableInlineSuggestionsSettings: false,
			},
			configurationService,
			activeTextEditorLanguageId: 'markdown',
		});

		const languageCheckbox = dashboard.element.querySelectorAll<HTMLElement>('.settings .monaco-checkbox').item(1);
		const overriddenHint = dashboard.element.querySelector<HTMLElement>('.setting-overridden');
		assert.ok(languageCheckbox && overriddenHint);
		const getState = () => ({
			ariaChecked: languageCheckbox.getAttribute('aria-checked'),
			className: languageCheckbox.className,
			overriddenHint: overriddenHint.textContent,
			configuredValue: { ...configurationService.configuredValue },
		});

		languageCheckbox.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		const pointerRequestedState = getState();
		await configurationService.completeUpdate();
		const pointerCommittedState = getState();

		const spaceEvent = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, shiftKey: true });
		Object.defineProperty(spaceEvent, 'keyCode', { value: 32 });
		languageCheckbox.dispatchEvent(spaceEvent);
		const keyboardRequestedState = getState();
		await configurationService.completeUpdate();
		const keyboardCommittedState = getState();

		languageCheckbox.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		const pointerUncheckedRequestedState = getState();
		await configurationService.completeUpdate();
		const pointerUncheckedCommittedState = getState();

		assert.deepStrictEqual({
			pointerRequested: pointerRequestedState,
			pointerCommitted: pointerCommittedState,
			keyboardRequested: keyboardRequestedState,
			keyboardCommitted: keyboardCommittedState,
			pointerUncheckedRequested: pointerUncheckedRequestedState,
			pointerUncheckedCommitted: pointerUncheckedCommittedState,
		}, {
			pointerRequested: {
				ariaChecked: 'mixed',
				className: 'monaco-custom-toggle monaco-checkbox codicon codicon-dash',
				overriddenHint: '(overridden)',
				configuredValue: { '*': true, markdown: false },
			},
			pointerCommitted: {
				ariaChecked: 'mixed',
				className: 'monaco-custom-toggle monaco-checkbox codicon codicon-dash',
				overriddenHint: '',
				configuredValue: { '*': true },
			},
			keyboardRequested: {
				ariaChecked: 'true',
				className: 'monaco-custom-toggle monaco-checkbox checked codicon codicon-check',
				overriddenHint: '',
				configuredValue: { '*': true },
			},
			keyboardCommitted: {
				ariaChecked: 'true',
				className: 'monaco-custom-toggle monaco-checkbox checked codicon codicon-check',
				overriddenHint: '',
				configuredValue: { '*': true, markdown: true },
			},
			pointerUncheckedRequested: {
				ariaChecked: 'false',
				className: 'monaco-custom-toggle monaco-checkbox',
				overriddenHint: '',
				configuredValue: { '*': true, markdown: true },
			},
			pointerUncheckedCommitted: {
				ariaChecked: 'false',
				className: 'monaco-custom-toggle monaco-checkbox',
				overriddenHint: '(overridden)',
				configuredValue: { '*': true, markdown: false },
			},
		});

		for (let i = 0; i < 3; i++) {
			languageCheckbox.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		}
		const rapidRequestedState = getState();
		for (let i = 0; i < 3; i++) {
			await configurationService.completeUpdate();
		}

		assert.deepStrictEqual({
			requested: rapidRequestedState,
			committed: getState(),
		}, {
			requested: {
				ariaChecked: 'false',
				className: 'monaco-custom-toggle monaco-checkbox',
				overriddenHint: '(overridden)',
				configuredValue: { '*': true, markdown: false },
			},
			committed: {
				ariaChecked: 'false',
				className: 'monaco-custom-toggle monaco-checkbox',
				overriddenHint: '(overridden)',
				configuredValue: { '*': true, markdown: false },
			},
		});
	});

	test('removes inherited language overrides from every configured scope', async () => {
		const defaultChat = product.defaultChatAgent;
		assert.ok(defaultChat);

		const configurationService = new TestCompletionsConfigurationService(
			defaultChat.completionsEnablementSetting,
			{ '*': true, markdown: false },
			{ '*': true, markdown: true },
			{ markdown: false },
		);
		const dashboard = createDashboard(createEntitlementService({ entitlement: ChatEntitlement.Pro }), {
			dashboardOptions: {
				...dashboardOptions,
				disableInlineSuggestionsSettings: false,
			},
			configurationService,
			activeTextEditorLanguageId: 'markdown',
		});

		const languageCheckbox = dashboard.element.querySelectorAll<HTMLElement>('.settings .monaco-checkbox').item(1);
		const overriddenHint = dashboard.element.querySelector<HTMLElement>('.setting-overridden');
		assert.ok(languageCheckbox && overriddenHint);

		languageCheckbox.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await configurationService.completeUpdate();
		const intermediateState = {
			ariaChecked: languageCheckbox.getAttribute('aria-checked'),
			overriddenHint: overriddenHint.textContent,
			userValue: { ...configurationService.configuredValue },
			workspaceValue: { ...configurationService.configuredWorkspaceValue },
		};

		await configurationService.completeUpdate();

		assert.deepStrictEqual({
			intermediate: intermediateState,
			committed: {
				ariaChecked: languageCheckbox.getAttribute('aria-checked'),
				overriddenHint: overriddenHint.textContent,
				userValue: configurationService.configuredValue,
				workspaceValue: configurationService.configuredWorkspaceValue,
			},
		}, {
			intermediate: {
				ariaChecked: 'mixed',
				overriddenHint: '(overridden)',
				userValue: { '*': true, markdown: true },
				workspaceValue: {},
			},
			committed: {
				ariaChecked: 'mixed',
				overriddenHint: '',
				userValue: { '*': true },
				workspaceValue: {},
			},
		});
	});

	test('restores the override hint when the final queued write fails', async () => {
		const defaultChat = product.defaultChatAgent;
		assert.ok(defaultChat);

		const configurationService = new TestCompletionsConfigurationService(
			defaultChat.completionsEnablementSetting,
			{ '*': true, markdown: false },
			{ '*': true, markdown: false },
		);
		const dashboard = createDashboard(createEntitlementService({ entitlement: ChatEntitlement.Pro }), {
			dashboardOptions: {
				...dashboardOptions,
				disableInlineSuggestionsSettings: false,
			},
			configurationService,
			activeTextEditorLanguageId: 'markdown',
		});

		const languageCheckbox = dashboard.element.querySelectorAll<HTMLElement>('.settings .monaco-checkbox').item(1);
		const overriddenHint = dashboard.element.querySelector<HTMLElement>('.setting-overridden');
		assert.ok(languageCheckbox && overriddenHint);

		languageCheckbox.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		languageCheckbox.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await configurationService.completeUpdate();
		await configurationService.failUpdate(new Error('Unable to update configuration'));

		assert.deepStrictEqual({
			ariaChecked: languageCheckbox.getAttribute('aria-checked'),
			overriddenHint: overriddenHint.textContent,
			configuredValue: configurationService.configuredValue,
		}, {
			ariaChecked: 'mixed',
			overriddenHint: '',
			configuredValue: { '*': true },
		});
	});

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

	test('Free — TBB: shows Credits and Inline Suggestions', () => {
		const dashboard = createDashboard(createEntitlementService({
			chat: { percentRemaining: 80, unlimited: false },
			completions: { percentRemaining: 70, unlimited: false },
			usageBasedBilling: true,
			entitlement: ChatEntitlement.Free,
		}));

		assert.deepStrictEqual(getQuotaLabels(dashboard.element), ['Credits', 'Inline Suggestions']);
		assert.deepStrictEqual(getQuotaValues(dashboard.element), ['20%', '30%']);
	});

	test('Free — TBB exhausted: shows Credits and Inline Suggestions at 0%', () => {
		const dashboard = createDashboard(createEntitlementService({
			chat: { percentRemaining: 0, unlimited: false },
			completions: { percentRemaining: 0, unlimited: false },
			usageBasedBilling: true,
			entitlement: ChatEntitlement.Free,
		}));

		assert.deepStrictEqual(getQuotaLabels(dashboard.element), ['Credits', 'Inline Suggestions']);
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

	test('EDU/Pro — TBB: shows only Credits, not Chat messages or Inline Suggestions', () => {
		const dashboard = createDashboard(createEntitlementService({
			chat: { percentRemaining: 80, unlimited: false },
			premiumChat: { percentRemaining: 60, unlimited: false, usageBasedBilling: true },
			completions: { percentRemaining: 90, unlimited: false },
			entitlement: ChatEntitlement.Pro,
		}));

		assert.deepStrictEqual(getQuotaLabels(dashboard.element), ['Credits']);
	});

	test('EDU/Pro — TBB exhausted (no overages): shows only Credits', () => {
		const dashboard = createDashboard(createEntitlementService({
			chat: { percentRemaining: 0, unlimited: false },
			premiumChat: { percentRemaining: 0, unlimited: false, usageBasedBilling: true },
			completions: { percentRemaining: 90, unlimited: false },
			additionalUsageEnabled: false,
			entitlement: ChatEntitlement.Pro,
		}));

		assert.deepStrictEqual(getQuotaLabels(dashboard.element), ['Credits']);
		assert.deepStrictEqual(getQuotaValues(dashboard.element), ['100%']);
	});

	test('EDU/Pro — TBB exhausted (with overages): shows only Credits', () => {
		const dashboard = createDashboard(createEntitlementService({
			chat: { percentRemaining: 0, unlimited: false },
			premiumChat: { percentRemaining: 0, unlimited: false, usageBasedBilling: true },
			completions: { percentRemaining: 90, unlimited: false },
			additionalUsageEnabled: true,
			entitlement: ChatEntitlement.Pro,
		}));

		assert.deepStrictEqual(getQuotaLabels(dashboard.element), ['Credits']);
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

	test('Pro+ — TBB with quota: shows only Credits', () => {
		const dashboard = createDashboard(createEntitlementService({
			chat: { percentRemaining: 80, unlimited: false },
			premiumChat: { percentRemaining: 60, unlimited: false, usageBasedBilling: true },
			completions: { percentRemaining: 90, unlimited: false },
			entitlement: ChatEntitlement.ProPlus,
		}));

		assert.deepStrictEqual(getQuotaLabels(dashboard.element), ['Credits']);
	});

	test('Pro+ — TBB out of quota: shows only Credits', () => {
		const dashboard = createDashboard(createEntitlementService({
			chat: { percentRemaining: 0, unlimited: false },
			premiumChat: { percentRemaining: 0, unlimited: false, usageBasedBilling: true },
			completions: { percentRemaining: 90, unlimited: false },
			entitlement: ChatEntitlement.ProPlus,
		}));

		assert.deepStrictEqual(getQuotaLabels(dashboard.element), ['Credits']);
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

	test('Max Monthly — TBB: shows unlimited Credits included indicator', () => {
		const dashboard = createDashboard(createEntitlementService({
			premiumChat: { percentRemaining: 100, unlimited: true, usageBasedBilling: true },
			completions: { percentRemaining: 100, unlimited: true },
			entitlement: ChatEntitlement.Max,
		}));

		assert.deepStrictEqual(getQuotaLabels(dashboard.element), []);
		assert.deepStrictEqual(getIncludedLabels(dashboard.element), ['Credits']);
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
		assert.deepStrictEqual(getIncludedDescriptions(dashboard.element), ['Included with your organization\'s plan.']);
	});

	test('Enterprise Managed — PRU with credits used: shows consumed credits', () => {
		const dashboard = createDashboard(createEntitlementService({
			premiumChat: { percentRemaining: 100, unlimited: true, creditsUsed: 127 },
			completions: { percentRemaining: 100, unlimited: true },
			entitlement: ChatEntitlement.Business,
		}));

		assert.deepStrictEqual(getIncludedLabels(dashboard.element), ['Premium Requests']);
		assert.deepStrictEqual(getIncludedDescriptions(dashboard.element), ['127 used']);
	});

	test('Business — pooled exhausted (no overages): shows exhausted indicator and callout', () => {
		const dashboard = createDashboard(createEntitlementService({
			premiumChat: { percentRemaining: 0, unlimited: true, hasQuota: false },
			completions: { percentRemaining: 100, unlimited: true },
			additionalUsageEnabled: false,
			entitlement: ChatEntitlement.Business,
		}));

		assert.deepStrictEqual(getIncludedLabels(dashboard.element), ['Premium Requests']);
		assert.deepStrictEqual(getIncludedDescriptions(dashboard.element), ['Organization limit reached.']);
		assert.strictEqual(getCalloutText(dashboard.element), 'Your organization or enterprise has exceeded its Copilot budget. Contact your admin to resume usage.');
	});

	test('Enterprise — pooled exhausted (no overages): shows exhausted indicator and enterprise callout', () => {
		const dashboard = createDashboard(createEntitlementService({
			premiumChat: { percentRemaining: 0, unlimited: true, hasQuota: false },
			completions: { percentRemaining: 100, unlimited: true },
			additionalUsageEnabled: false,
			entitlement: ChatEntitlement.Enterprise,
		}));

		assert.deepStrictEqual(getIncludedLabels(dashboard.element), ['Premium Requests']);
		assert.deepStrictEqual(getIncludedDescriptions(dashboard.element), ['Organization limit reached.']);
		assert.strictEqual(getCalloutText(dashboard.element), 'Your organization or enterprise has exceeded its Copilot budget. Contact your admin to resume usage.');
	});

	test('Enterprise — pooled exhausted TBB (no overages): shows Credits exhausted', () => {
		const dashboard = createDashboard(createEntitlementService({
			premiumChat: { percentRemaining: 0, unlimited: true, usageBasedBilling: true, hasQuota: false },
			completions: { percentRemaining: 100, unlimited: true },
			additionalUsageEnabled: false,
			entitlement: ChatEntitlement.Enterprise,
		}));

		assert.deepStrictEqual(getIncludedLabels(dashboard.element), ['Credits']);
		assert.deepStrictEqual(getIncludedDescriptions(dashboard.element), ['Organization limit reached.']);
	});

	test('Enterprise — pooled exhausted but overages enabled: shows budget exceeded (hasQuota=false overrides overages)', () => {
		const dashboard = createDashboard(createEntitlementService({
			premiumChat: { percentRemaining: 0, unlimited: true, hasQuota: false },
			completions: { percentRemaining: 100, unlimited: true },
			additionalUsageEnabled: true,
			entitlement: ChatEntitlement.Enterprise,
		}));

		assert.deepStrictEqual(getIncludedLabels(dashboard.element), ['Premium Requests']);
		assert.deepStrictEqual(getIncludedDescriptions(dashboard.element), ['Organization limit reached.']);
		assert.strictEqual(getCalloutText(dashboard.element), 'Your organization or enterprise has exceeded its Copilot budget. Contact your admin to resume usage.');
	});

	test('Enterprise — TBB (multi-quota): shows only Credits, not Chat messages or Inline Suggestions', () => {
		const dashboard = createDashboard(createEntitlementService({
			chat: { percentRemaining: 80, unlimited: false },
			premiumChat: { percentRemaining: 60, unlimited: false, usageBasedBilling: true },
			completions: { percentRemaining: 70, unlimited: false },
			entitlement: ChatEntitlement.Enterprise,
		}));

		assert.deepStrictEqual(getQuotaLabels(dashboard.element), ['Credits']);
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

	test('Hover is a no-op when entitlement is zero', () => {
		const dashboard = createDashboard(createEntitlementService({
			premiumChat: { percentRemaining: 0, unlimited: false, usageBasedBilling: true, entitlement: 0 },
			completions: { percentRemaining: 70, unlimited: false, entitlement: 0 },
			entitlement: ChatEntitlement.Free,
		}));

		const quotaPercentages = dashboard.element.querySelectorAll('.quota-indicator:not(.included) .quota-percentage');
		assert.strictEqual(quotaPercentages.length, 2);

		// Before hover: shows percentages
		const valuesBefore = getQuotaValues(dashboard.element);

		// Hover: still shows percentages (entitlement is 0, no meaningful total)
		quotaPercentages[0].dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
		assert.deepStrictEqual(getQuotaValues(dashboard.element), valuesBefore);
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

	// --- CALLOUT MESSAGES ---

	test('Callout: no callout when quota is not approaching limit', () => {
		const dashboard = createDashboard(createEntitlementService({
			premiumChat: { percentRemaining: 50, unlimited: false },
			completions: { percentRemaining: 90, unlimited: false },
			additionalUsageEnabled: true,
			entitlement: ChatEntitlement.Pro,
		}));

		assert.strictEqual(getCalloutText(dashboard.element), null);
	});

	test('Callout: PRU — shows approaching message with budget wording', () => {
		const dashboard = createDashboard(createEntitlementService({
			premiumChat: { percentRemaining: 20, unlimited: false },
			completions: { percentRemaining: 90, unlimited: false },
			additionalUsageEnabled: true,
			entitlement: ChatEntitlement.Pro,
		}));

		assert.strictEqual(getCalloutText(dashboard.element), 'Once the limit is reached, premium request budget will be used.');
	});

	test('Callout: UBB — shows approaching message with additional spend wording', () => {
		const dashboard = createDashboard(createEntitlementService({
			premiumChat: { percentRemaining: 20, unlimited: false, usageBasedBilling: true },
			completions: { percentRemaining: 90, unlimited: false },
			additionalUsageEnabled: true,
			entitlement: ChatEntitlement.Pro,
		}));

		assert.strictEqual(getCalloutText(dashboard.element), 'Once the limit is reached, additional budget will be used.');
	});

	test('Callout: shows paused when quota exhausted and overage not permitted', () => {
		const dashboard = createDashboard(createEntitlementService({
			premiumChat: { percentRemaining: 0, unlimited: false },
			completions: { percentRemaining: 90, unlimited: false },
			additionalUsageEnabled: false,
			entitlement: ChatEntitlement.Pro,
		}));

		assert.strictEqual(getCalloutText(dashboard.element), 'Copilot is paused until the limit resets.');
	});

	test('Callout: Free — no paused message when only inline suggestions limit is reached', () => {
		const dashboard = createDashboard(createEntitlementService({
			chat: { percentRemaining: 90, unlimited: false },
			completions: { percentRemaining: 0, unlimited: false },
			additionalUsageEnabled: false,
			entitlement: ChatEntitlement.Free,
		}));

		assert.strictEqual(getCalloutText(dashboard.element), null);
	});

	test('Callout: Free — shows paused when chat limit is reached', () => {
		const dashboard = createDashboard(createEntitlementService({
			chat: { percentRemaining: 0, unlimited: false },
			completions: { percentRemaining: 90, unlimited: false },
			additionalUsageEnabled: false,
			entitlement: ChatEntitlement.Free,
		}));

		assert.strictEqual(getCalloutText(dashboard.element), 'Copilot is paused until the limit resets.');
	});

	test('Callout: shows budget active when quota exhausted and overage permitted but no overage used yet', () => {
		const dashboard = createDashboard(createEntitlementService({
			premiumChat: { percentRemaining: 0, unlimited: false },
			completions: { percentRemaining: 90, unlimited: false },
			additionalUsageEnabled: true,
			additionalUsageCount: 0,
			entitlement: ChatEntitlement.Pro,
		}));

		assert.strictEqual(getCalloutText(dashboard.element), 'Premium request budget is configured. Usage will continue until limits reset.');
	});

	test('Callout: PRU — shows budget active when quota exhausted and overage count > 0', () => {
		const dashboard = createDashboard(createEntitlementService({
			premiumChat: { percentRemaining: 0, unlimited: false },
			completions: { percentRemaining: 90, unlimited: false },
			additionalUsageEnabled: true,
			additionalUsageCount: 5,
			entitlement: ChatEntitlement.Pro,
		}));

		assert.strictEqual(getCalloutText(dashboard.element), 'Premium request budget is configured. Usage will continue until limits reset.');
	});

	test('Callout: UBB — shows additional budget active when quota exhausted and overage count > 0', () => {
		const dashboard = createDashboard(createEntitlementService({
			premiumChat: { percentRemaining: 0, unlimited: false, usageBasedBilling: true },
			completions: { percentRemaining: 90, unlimited: false },
			additionalUsageEnabled: true,
			additionalUsageCount: 5,
			entitlement: ChatEntitlement.Pro,
		}));

		assert.strictEqual(getCalloutText(dashboard.element), 'Additional budget is configured. Usage will continue until limits reset.');
	});

	test('Callout: shows warning when quota >= 75% used and overage not permitted', () => {
		const dashboard = createDashboard(createEntitlementService({
			premiumChat: { percentRemaining: 20, unlimited: false },
			completions: { percentRemaining: 90, unlimited: false },
			additionalUsageEnabled: false,
			entitlement: ChatEntitlement.Pro,
		}));

		assert.strictEqual(getCalloutText(dashboard.element), 'Copilot will pause when the limit is reached.');
	});

	test('Callout: shows paused for enterprise when quota exhausted', () => {
		const dashboard = createDashboard(createEntitlementService({
			premiumChat: { percentRemaining: 0, unlimited: false },
			additionalUsageEnabled: false,
			entitlement: ChatEntitlement.Enterprise,
		}));

		assert.strictEqual(getCalloutText(dashboard.element), 'Copilot is paused until the limit resets. Contact your administrator for more information.');
	});

	test('Callout: TBB — shows additional budget active when exhausted with overage permitted but no usage yet', () => {
		const dashboard = createDashboard(createEntitlementService({
			premiumChat: { percentRemaining: 0, unlimited: false, usageBasedBilling: true },
			additionalUsageEnabled: true,
			additionalUsageCount: 0,
			entitlement: ChatEntitlement.Pro,
		}));

		assert.strictEqual(getCalloutText(dashboard.element), 'Additional budget is configured. Usage will continue until limits reset.');
	});

	test('Callout: TBB — shows additional budget wording when overage count > 0', () => {
		const dashboard = createDashboard(createEntitlementService({
			premiumChat: { percentRemaining: 0, unlimited: false, usageBasedBilling: true },
			additionalUsageEnabled: true,
			additionalUsageCount: 3,
			entitlement: ChatEntitlement.Pro,
		}));

		assert.strictEqual(getCalloutText(dashboard.element), 'Additional budget is configured. Usage will continue until limits reset.');
	});

	test('Callout: Enterprise — shows org-specific wording when approaching limit with additional usage', () => {
		const dashboard = createDashboard(createEntitlementService({
			premiumChat: { percentRemaining: 20, unlimited: false, usageBasedBilling: true },
			completions: { percentRemaining: 90, unlimited: false },
			additionalUsageEnabled: true,
			entitlement: ChatEntitlement.Enterprise,
		}));

		assert.strictEqual(getCalloutText(dashboard.element), 'Copilot will pause when your limits are reached. Please contact your admin to increase your limits.');
	});

	test('Callout: Business — shows org-specific wording when approaching limit with additional usage', () => {
		const dashboard = createDashboard(createEntitlementService({
			premiumChat: { percentRemaining: 20, unlimited: false, usageBasedBilling: true },
			completions: { percentRemaining: 90, unlimited: false },
			additionalUsageEnabled: true,
			entitlement: ChatEntitlement.Business,
		}));

		assert.strictEqual(getCalloutText(dashboard.element), 'Copilot will pause when your limits are reached. Please contact your admin to increase your limits.');
	});

	test('Callout: Enterprise — shows org-specific wording when quota exhausted with additional usage', () => {
		const dashboard = createDashboard(createEntitlementService({
			premiumChat: { percentRemaining: 0, unlimited: false, usageBasedBilling: true },
			completions: { percentRemaining: 90, unlimited: false },
			additionalUsageEnabled: true,
			additionalUsageCount: 5,
			entitlement: ChatEntitlement.Enterprise,
		}));

		assert.strictEqual(getCalloutText(dashboard.element), 'Copilot has paused because your limits are reached. Please contact your admin to increase your limits.');
	});

	test('Callout: Business — shows org-specific wording when quota exhausted with additional usage', () => {
		const dashboard = createDashboard(createEntitlementService({
			premiumChat: { percentRemaining: 0, unlimited: false, usageBasedBilling: true },
			completions: { percentRemaining: 90, unlimited: false },
			additionalUsageEnabled: true,
			additionalUsageCount: 5,
			entitlement: ChatEntitlement.Business,
		}));

		assert.strictEqual(getCalloutText(dashboard.element), 'Copilot has paused because your limits are reached. Please contact your admin to increase your limits.');
	});

	// --- LIVE UPDATES ---

	function createMutableEntitlementService(opts: {
		chat?: IQuotaConfig;
		completions?: IQuotaConfig;
		premiumChat?: IQuotaConfig;
		usageBasedBilling?: boolean;
		additionalUsageEnabled?: boolean;
		additionalUsageCount?: number;
		entitlement?: ChatEntitlement;
	}, emitterStore: Pick<DisposableStore, 'add'>): IChatEntitlementService & { quotas: ReturnType<typeof createEntitlementService>['quotas']; fireQuotaRemaining: () => void; fireQuotaExceeded: () => void } {
		const onDidChangeQuotaRemaining = emitterStore.add(new Emitter<void>());
		const onDidChangeQuotaExceeded = emitterStore.add(new Emitter<void>());
		const svc = {
			...createEntitlementService(opts),
			onDidChangeQuotaRemaining: onDidChangeQuotaRemaining.event,
			onDidChangeQuotaExceeded: onDidChangeQuotaExceeded.event,
			fireQuotaRemaining: () => onDidChangeQuotaRemaining.fire(),
			fireQuotaExceeded: () => onDidChangeQuotaExceeded.fire(),
		};
		return svc;
	}

	test('Live update: quota indicators update when onDidChangeQuotaRemaining fires', () => {
		const svc = createMutableEntitlementService({
			chat: { percentRemaining: 80, unlimited: false },
			completions: { percentRemaining: 70, unlimited: false },
			entitlement: ChatEntitlement.Free,
		}, store);

		const dashboard = createDashboard(svc);
		assert.deepStrictEqual(getQuotaValues(dashboard.element), ['20%', '30%']);

		// Simulate fresh quota data arriving
		(svc as { quotas: typeof svc.quotas }).quotas = {
			...svc.quotas,
			chat: { percentRemaining: 50, unlimited: false },
			completions: { percentRemaining: 40, unlimited: false },
		};
		svc.fireQuotaRemaining();

		assert.deepStrictEqual(getQuotaValues(dashboard.element), ['50%', '60%']);
	});

	test('Live update: callout appears when onDidChangeQuotaExceeded fires and quota becomes exhausted', () => {
		const svc = createMutableEntitlementService({
			premiumChat: { percentRemaining: 50, unlimited: false },
			completions: { percentRemaining: 90, unlimited: false },
			additionalUsageEnabled: false,
			entitlement: ChatEntitlement.Pro,
		}, store);

		const dashboard = createDashboard(svc);
		assert.strictEqual(getCalloutText(dashboard.element), null);

		// Quota becomes exhausted
		(svc as { quotas: typeof svc.quotas }).quotas = {
			...svc.quotas,
			premiumChat: { percentRemaining: 0, unlimited: false },
		};
		svc.fireQuotaExceeded();

		assert.strictEqual(getCalloutText(dashboard.element), 'Copilot is paused until the limit resets.');
	});

	test('Live update: header button visibility updates when quota changes', () => {
		const svc = createMutableEntitlementService({
			premiumChat: { percentRemaining: 50, unlimited: false },
			completions: { percentRemaining: 90, unlimited: false },
			additionalUsageEnabled: true,
			entitlement: ChatEntitlement.Pro,
		}, store);

		const dashboard = createDashboard(svc);

		// No callout initially (quota < 75% used), so button should be hidden
		const headerButton = dashboard.element.querySelector('.header-cta-button') as HTMLElement;
		assert.ok(headerButton);
		assert.strictEqual(headerButton.style.display, 'none');

		// Quota approaches limit (>= 75% used)
		(svc as { quotas: typeof svc.quotas }).quotas = {
			...svc.quotas,
			premiumChat: { percentRemaining: 20, unlimited: false },
		};
		svc.fireQuotaRemaining();

		assert.notStrictEqual(headerButton.style.display, 'none');
	});

});

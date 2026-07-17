/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import type { IDisposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandEvent, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { getSingletonServiceDescriptors } from '../../../../../platform/instantiation/common/extensions.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryData, ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { TelemetryService } from '../../../../../platform/telemetry/common/telemetryService.js';
import { ITelemetryAppender } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { ChatEntitlement, IChatEntitlementService, IChatSentiment, IQuotaSnapshot } from '../../../../services/chat/common/chatEntitlementService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { ChatQuotaNotificationContribution } from '../../browser/chatQuotaNotification.js';
import { ChatInputNotificationSeverity, IChatInputNotificationService } from '../../browser/widget/input/chatInputNotificationService.js';
import { ChatInputNotificationWidget } from '../../browser/widget/input/chatInputNotificationWidget.js';
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../../common/languageModels.js';

interface ILoggedTelemetryEvent {
	readonly eventName: string;
	readonly data: ITelemetryData;
}

class TestTelemetryAppender implements ITelemetryAppender {
	readonly events: ILoggedTelemetryEvent[] = [];

	log(eventName: string, data: ITelemetryData): void {
		this.events.push({ eventName, data });
	}

	flush(): Promise<void> {
		return Promise.resolve();
	}
}

class TestCommandService implements ICommandService {
	declare readonly _serviceBrand: undefined;

	readonly onWillExecuteCommand: Event<ICommandEvent> = Event.None;
	readonly onDidExecuteCommand: Event<ICommandEvent> = Event.None;
	readonly executedCommands: string[] = [];

	async executeCommand(commandId: string): Promise<undefined> {
		this.executedCommands.push(commandId);
		return undefined;
	}
}

function createQuotaSnapshot(percentRemaining: number, opts?: Partial<IQuotaSnapshot>): IQuotaSnapshot {
	return {
		percentRemaining,
		unlimited: false,
		...opts,
	};
}

function createEntitlementService(opts?: {
	entitlement?: ChatEntitlement;
	quotas?: Partial<IChatEntitlementService['quotas']>;
}) {
	const onDidChangeQuotaRemaining = new Emitter<void>();
	const onDidChangeQuotaExceeded = new Emitter<void>();
	const onDidChangeEntitlement = new Emitter<void>();
	const sentiment: IChatSentiment = {};

	const service: IChatEntitlementService = {
		_serviceBrand: undefined,
		entitlement: opts?.entitlement ?? ChatEntitlement.Pro,
		entitlementObs: observableValue({}, opts?.entitlement ?? ChatEntitlement.Pro),
		onDidChangeEntitlement: onDidChangeEntitlement.event,
		onDidChangeQuotaExceeded: onDidChangeQuotaExceeded.event,
		onDidChangeQuotaRemaining: onDidChangeQuotaRemaining.event,
		onDidChangeUsageBasedBilling: Event.None,
		quotas: {
			usageBasedBilling: true,
			premiumChat: createQuotaSnapshot(0),
			additionalUsageEnabled: false,
			...opts?.quotas,
		},
		organisations: undefined,
		isInternal: false,
		sku: undefined,
		copilotTrackingId: undefined,
		clientByokEnabled: false,
		hasByokModels: false,
		onDidChangeSentiment: Event.None,
		sentiment,
		sentimentObs: observableValue({}, sentiment),
		onDidChangeAnonymous: Event.None,
		anonymous: false,
		anonymousObs: observableValue({}, false),
		acceptQuotas() { },
		clearQuotas() { },
		markAnonymousRateLimited() { },
		markSetupCompleted() { },
		setForceHidden() { },
		update() { return Promise.resolve(); },
	};

	return { service, onDidChangeQuotaRemaining, onDidChangeQuotaExceeded, onDidChangeEntitlement };
}

suite('ChatQuotaNotificationContribution integration', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createHarness(opts?: Parameters<typeof createEntitlementService>[0]) {
		const instantiationService = store.add(workbenchInstantiationService(undefined, store));
		const telemetryAppender = new TestTelemetryAppender();
		const telemetryService = store.add(instantiationService.createInstance(TelemetryService, { appenders: [telemetryAppender] }));
		const entitlementService = createEntitlementService(opts);
		const commandService = new TestCommandService();
		const storageService = instantiationService.get(IStorageService);
		storageService.store('chat.currentLanguageModel.panel', 'copilot/test-model', StorageScope.APPLICATION, StorageTarget.USER);

		instantiationService.stub(ITelemetryService, telemetryService);
		instantiationService.stub(IChatEntitlementService, entitlementService.service);
		instantiationService.stub(ICommandService, commandService);
		instantiationService.stub(ILanguageModelsService, {
			_serviceBrand: undefined,
			onDidChangeLanguageModelVendors: Event.None,
			onDidChangeLanguageModels: Event.None,
			getLanguageModelIds: () => ['test-model'],
			getVendors: () => [],
			lookupLanguageModel: (_id: string): ILanguageModelChatMetadata => ({
				id: 'test-model',
				name: 'Test Model',
				vendor: 'copilot',
				version: '1.0',
				family: 'test',
				extension: new ExtensionIdentifier('test.extension'),
				maxInputTokens: 1,
				maxOutputTokens: 1,
				isDefaultForLocation: {},
			} satisfies ILanguageModelChatMetadata),
			lookupLanguageModelByQualifiedName: () => undefined,
		});

		store.add(entitlementService.onDidChangeQuotaRemaining);
		store.add(entitlementService.onDidChangeQuotaExceeded);
		store.add(entitlementService.onDidChangeEntitlement);

		const notificationDescriptor = getSingletonServiceDescriptors().find(([id]) => id === IChatInputNotificationService)?.[1];
		assert.ok(notificationDescriptor);
		const eagerNotificationDescriptor = new SyncDescriptor(notificationDescriptor.ctor, notificationDescriptor.staticArguments);
		const childInstantiationService = store.add(instantiationService.createChild(new ServiceCollection([IChatInputNotificationService, eagerNotificationDescriptor])));
		const contribution = store.add(childInstantiationService.createInstance(ChatQuotaNotificationContribution));
		const notificationService = childInstantiationService.get(IChatInputNotificationService);
		store.add(notificationService as IChatInputNotificationService & IDisposable);

		return { instantiationService: childInstantiationService, telemetryAppender, commandService, contribution, entitlementService, notificationService };
	}

	function getNotificationTelemetryEvents(telemetryAppender: TestTelemetryAppender): ILoggedTelemetryEvent[] {
		return telemetryAppender.events.filter(e => e.eventName === 'chatInputNotificationShown' || e.eventName === 'chatInputNotificationDismissed');
	}

	function getRenderedText(widget: ChatInputNotificationWidget): string {
		return widget.domNode.querySelector<HTMLElement>('.chat-input-notification')?.textContent ?? '';
	}

	function assertShownTelemetry(telemetryAppender: TestTelemetryAppender, telemetryId: string): void {
		assert.deepStrictEqual(getNotificationTelemetryEvents(telemetryAppender), [{
			eventName: 'chatInputNotificationShown',
			data: {
				id: 'copilot.quotaStatus',
				telemetryId,
			},
		}]);
	}

	test('emits generic shown telemetry through the real widget render path', () => {
		const { instantiationService, telemetryAppender } = createHarness();

		assert.deepStrictEqual(getNotificationTelemetryEvents(telemetryAppender), []);

		const widget = store.add(instantiationService.createInstance(ChatInputNotificationWidget, undefined));
		assert.ok(widget.domNode.querySelector('.chat-input-notification'));

		assertShownTelemetry(telemetryAppender, 'quotaExhausted');
	});

	test('emits shown telemetry for each quota notification variant through the real widget render path', () => {
		const cases: readonly {
			readonly name: string;
			readonly setup: () => ReturnType<typeof createHarness>;
			readonly expectedText: string;
			readonly expectedTelemetryId: string;
			readonly afterCreate?: (harness: ReturnType<typeof createHarness>) => void;
		}[] = [
				{
					name: 'quota exhausted',
					setup: () => createHarness({
						quotas: {
							premiumChat: createQuotaSnapshot(0),
							additionalUsageEnabled: false,
						},
					}),
					expectedText: 'Credit Limit Reached',
					expectedTelemetryId: 'quotaExhausted',
				},
				{
					name: 'overage activation',
					setup: () => createHarness({
						quotas: {
							premiumChat: createQuotaSnapshot(50),
							additionalUsageEnabled: true,
						},
					}),
					expectedText: 'Additional budget is now covering extra usage.',
					expectedTelemetryId: 'overageActivation',
					afterCreate: ({ entitlementService }) => {
						(entitlementService.service as IChatEntitlementService & { quotas: IChatEntitlementService['quotas'] }).quotas = {
							...entitlementService.service.quotas,
							premiumChat: createQuotaSnapshot(0),
						};
						entitlementService.onDidChangeQuotaRemaining.fire();
					},
				},
				{
					name: 'quota approaching',
					setup: () => createHarness({
						quotas: {
							premiumChat: createQuotaSnapshot(50),
						},
					}),
					expectedText: 'Credits at 75%',
					expectedTelemetryId: 'quotaApproaching75',
					afterCreate: ({ entitlementService }) => {
						(entitlementService.service as IChatEntitlementService & { quotas: IChatEntitlementService['quotas'] }).quotas = {
							...entitlementService.service.quotas,
							premiumChat: createQuotaSnapshot(25),
						};
						entitlementService.onDidChangeQuotaRemaining.fire();
					},
				},
				{
					name: 'rate limit warning',
					setup: () => createHarness({
						quotas: {
							premiumChat: createQuotaSnapshot(50),
							sessionRateLimit: { percentRemaining: 50, unlimited: false, resetDate: '2026-06-01T00:00:00Z' },
						},
					}),
					expectedText: 'You\'ve used 75% of your session rate limit.',
					expectedTelemetryId: 'sessionRateLimitWarning',
					afterCreate: ({ entitlementService }) => {
						(entitlementService.service as IChatEntitlementService & { quotas: IChatEntitlementService['quotas'] }).quotas = {
							...entitlementService.service.quotas,
							sessionRateLimit: { percentRemaining: 25, unlimited: false, resetDate: '2026-06-01T00:00:00Z' },
						};
						entitlementService.onDidChangeQuotaRemaining.fire();
					},
				},
				{
					name: 'managed plan blocked',
					setup: () => createHarness({
						entitlement: ChatEntitlement.Business,
						quotas: {
							premiumChat: createQuotaSnapshot(0, {
								unlimited: true,
								hasQuota: false,
							}),
						},
					}),
					expectedText: 'Usage Blocked',
					expectedTelemetryId: 'managedPlanBlocked',
				},
			];

		const results = cases.map(testCase => {
			const harness = testCase.setup();
			testCase.afterCreate?.(harness);

			const widget = store.add(harness.instantiationService.createInstance(ChatInputNotificationWidget, undefined));
			const renderedText = getRenderedText(widget);
			assert.ok(renderedText.includes(testCase.expectedText), `${testCase.name} did not render expected text`);
			assertShownTelemetry(harness.telemetryAppender, testCase.expectedTelemetryId);

			return {
				name: testCase.name,
				renderedText: testCase.expectedText,
				telemetry: getNotificationTelemetryEvents(harness.telemetryAppender),
			};
		});

		assert.deepStrictEqual(results.map(result => result.name), [
			'quota exhausted',
			'overage activation',
			'quota approaching',
			'rate limit warning',
			'managed plan blocked',
		]);
	});

	test('emits quota approaching telemetry for the crossed checkpoint when usage jumps past it', () => {
		const { instantiationService, telemetryAppender, entitlementService } = createHarness({
			quotas: {
				premiumChat: createQuotaSnapshot(26),
			},
		});

		(entitlementService.service as IChatEntitlementService & { quotas: IChatEntitlementService['quotas'] }).quotas = {
			...entitlementService.service.quotas,
			premiumChat: createQuotaSnapshot(17),
		};
		entitlementService.onDidChangeQuotaRemaining.fire();

		const widget = store.add(instantiationService.createInstance(ChatInputNotificationWidget, undefined));
		assert.ok(getRenderedText(widget).includes('Credits at 83%'));
		assertShownTelemetry(telemetryAppender, 'quotaApproaching75');
	});

	test('emits shown telemetry when the same notification id changes telemetry context', () => {
		const { instantiationService, telemetryAppender } = createHarness();
		const widget = store.add(instantiationService.createInstance(ChatInputNotificationWidget, undefined));
		const notificationService = instantiationService.get(IChatInputNotificationService);

		notificationService.setNotification({
			id: 'copilot.quotaStatus',
			telemetryId: 'quotaApproaching',
			severity: ChatInputNotificationSeverity.Info,
			message: 'Credits at 75%',
			description: undefined,
			actions: [],
			dismissible: true,
			autoDismissOnMessage: true,
		});

		assert.ok(widget.domNode.querySelector('.chat-input-notification'));
		assert.deepStrictEqual(getNotificationTelemetryEvents(telemetryAppender), [
			{
				eventName: 'chatInputNotificationShown',
				data: {
					id: 'copilot.quotaStatus',
					telemetryId: 'quotaExhausted',
				},
			},
			{
				eventName: 'chatInputNotificationShown',
				data: {
					id: 'copilot.quotaStatus',
					telemetryId: 'quotaApproaching',
				},
			},
		]);
	});

	test('does not emit duplicate shown telemetry when the notification rerenders unchanged', () => {
		const { instantiationService, telemetryAppender, notificationService } = createHarness();
		store.add(instantiationService.createInstance(ChatInputNotificationWidget, undefined));

		const notification = notificationService.getActiveNotification();
		assert.ok(notification);
		notificationService.setNotification(notification);
		notificationService.setNotification(notification);

		assert.deepStrictEqual(getNotificationTelemetryEvents(telemetryAppender), [
			{
				eventName: 'chatInputNotificationShown',
				data: {
					id: 'copilot.quotaStatus',
					telemetryId: 'quotaExhausted',
				},
			},
		]);
	});

	test('emits existing action telemetry and dismisses from real DOM interaction', async () => {
		const { instantiationService, telemetryAppender, commandService } = createHarness();
		const widget = store.add(instantiationService.createInstance(ChatInputNotificationWidget, undefined));

		const actionButton = widget.domNode.querySelector<HTMLElement>('.chat-input-notification-action-button');
		assert.ok(actionButton);
		actionButton.click();
		await timeout(0);

		assert.strictEqual(widget.domNode.querySelector('.chat-input-notification'), null);
		assert.deepStrictEqual(commandService.executedCommands, ['workbench.action.chat.manageAdditionalSpend']);
		assert.deepStrictEqual(telemetryAppender.events.filter(e => e.eventName === 'workbenchActionExecuted' || e.eventName === 'chatInputNotificationShown'), [
			{
				eventName: 'chatInputNotificationShown',
				data: {
					id: 'copilot.quotaStatus',
					telemetryId: 'quotaExhausted',
				},
			},
			{
				eventName: 'workbenchActionExecuted',
				data: {
					id: 'workbench.action.chat.manageAdditionalSpend',
					from: 'chatInputNotification',
				},
			},
		]);
	});

	test('emits generic dismissed telemetry from real DOM interaction', async () => {
		const { instantiationService, telemetryAppender } = createHarness();
		const widget = store.add(instantiationService.createInstance(ChatInputNotificationWidget, undefined));

		const dismissButton = widget.domNode.querySelector<HTMLElement>('.chat-input-notification-dismiss');
		assert.ok(dismissButton);
		dismissButton.click();
		await timeout(0);

		assert.deepStrictEqual(telemetryAppender.events.filter(e => e.eventName === 'chatInputNotificationShown' || e.eventName === 'chatInputNotificationDismissed'), [
			{
				eventName: 'chatInputNotificationShown',
				data: {
					id: 'copilot.quotaStatus',
					telemetryId: 'quotaExhausted',
				},
			},
			{
				eventName: 'chatInputNotificationDismissed',
				data: {
					id: 'copilot.quotaStatus',
					telemetryId: 'quotaExhausted',
				},
			},
		]);
	});
});

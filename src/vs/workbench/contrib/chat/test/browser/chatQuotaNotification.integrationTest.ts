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
import { IChatInputNotificationService } from '../../browser/widget/input/chatInputNotificationService.js';
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

function createQuotaSnapshot(percentRemaining: number): IQuotaSnapshot {
	return {
		percentRemaining,
		unlimited: false,
	};
}

function createEntitlementService() {
	const onDidChangeQuotaRemaining = new Emitter<void>();
	const onDidChangeQuotaExceeded = new Emitter<void>();
	const onDidChangeEntitlement = new Emitter<void>();
	const sentiment: IChatSentiment = {};

	const service: IChatEntitlementService = {
		_serviceBrand: undefined,
		entitlement: ChatEntitlement.Pro,
		entitlementObs: observableValue({}, ChatEntitlement.Pro),
		onDidChangeEntitlement: onDidChangeEntitlement.event,
		onDidChangeQuotaExceeded: onDidChangeQuotaExceeded.event,
		onDidChangeQuotaRemaining: onDidChangeQuotaRemaining.event,
		onDidChangeUsageBasedBilling: Event.None,
		quotas: {
			usageBasedBilling: true,
			premiumChat: createQuotaSnapshot(0),
			additionalUsageEnabled: false,
		},
		organisations: undefined,
		isInternal: false,
		sku: undefined,
		copilotTrackingId: undefined,
		previewFeaturesDisabled: false,
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

	function createHarness() {
		const instantiationService = store.add(workbenchInstantiationService(undefined, store));
		const telemetryAppender = new TestTelemetryAppender();
		const telemetryService = store.add(instantiationService.createInstance(TelemetryService, { appenders: [telemetryAppender] }));
		const entitlementService = createEntitlementService();
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
		store.add(childInstantiationService.get(IChatInputNotificationService) as IChatInputNotificationService & IDisposable);

		return { instantiationService: childInstantiationService, telemetryAppender, commandService, contribution };
	}

	function getQuotaTelemetryEvents(telemetryAppender: TestTelemetryAppender): ILoggedTelemetryEvent[] {
		return telemetryAppender.events.filter(e => e.eventName.startsWith('chat.quotaNotification'));
	}

	test('emits shown telemetry through the real widget render path', () => {
		const { instantiationService, telemetryAppender } = createHarness();

		assert.deepStrictEqual(getQuotaTelemetryEvents(telemetryAppender), []);

		const widget = store.add(instantiationService.createInstance(ChatInputNotificationWidget, undefined));
		assert.ok(widget.domNode.querySelector('.chat-input-notification'));

		assert.deepStrictEqual(getQuotaTelemetryEvents(telemetryAppender), [{
			eventName: 'chat.quotaNotificationShown',
			data: {
				notificationType: 'quotaExhausted',
				limitType: 'quota',
				entitlement: 'Pro',
				additionalUsageEnabled: false,
				hasActions: true,
				percentUsed: 100,
			},
		}]);
	});

	test('emits action and dismissed telemetry from real DOM interaction', async () => {
		const { instantiationService, telemetryAppender, commandService } = createHarness();
		const widget = store.add(instantiationService.createInstance(ChatInputNotificationWidget, undefined));

		const actionButton = widget.domNode.querySelector<HTMLElement>('.chat-input-notification-action-button');
		assert.ok(actionButton);
		actionButton.click();
		await timeout(0);

		const dismissButton = widget.domNode.querySelector<HTMLElement>('.chat-input-notification-dismiss');
		assert.ok(dismissButton);
		dismissButton.click();
		await timeout(0);

		assert.deepStrictEqual(commandService.executedCommands, ['workbench.action.chat.manageAdditionalSpend']);
		assert.deepStrictEqual(getQuotaTelemetryEvents(telemetryAppender), [
			{
				eventName: 'chat.quotaNotificationShown',
				data: {
					notificationType: 'quotaExhausted',
					limitType: 'quota',
					entitlement: 'Pro',
					additionalUsageEnabled: false,
					hasActions: true,
					percentUsed: 100,
				},
			},
			{
				eventName: 'chat.quotaNotificationActionInvoked',
				data: {
					notificationType: 'quotaExhausted',
					limitType: 'quota',
					entitlement: 'Pro',
					additionalUsageEnabled: false,
					hasActions: true,
					percentUsed: 100,
					commandId: 'workbench.action.chat.manageAdditionalSpend',
				},
			},
			{
				eventName: 'chat.quotaNotificationDismissed',
				data: {
					notificationType: 'quotaExhausted',
					limitType: 'quota',
					entitlement: 'Pro',
					additionalUsageEnabled: false,
					hasActions: true,
					percentUsed: 100,
				},
			},
		]);
	});
});

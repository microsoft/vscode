/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { IDisposable } from '../../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ICommandEvent, ICommandService } from '../../../../../../../platform/commands/common/commands.js';
import { SyncDescriptor } from '../../../../../../../platform/instantiation/common/descriptors.js';
import { getSingletonServiceDescriptors } from '../../../../../../../platform/instantiation/common/extensions.js';
import { ServiceCollection } from '../../../../../../../platform/instantiation/common/serviceCollection.js';
import { ITelemetryService } from '../../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../../platform/telemetry/common/telemetryUtils.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { ChatInputNotificationSeverity, IChatInputNotification, IChatInputNotificationService } from '../../../../browser/widget/input/chatInputNotificationService.js';
import { ChatInputNotificationWidget } from '../../../../browser/widget/input/chatInputNotificationWidget.js';
import { localChatSessionType, SessionType } from '../../../../common/chatSessionsService.js';

class TestCommandService implements ICommandService {
	declare readonly _serviceBrand: undefined;

	readonly onWillExecuteCommand: Event<ICommandEvent> = Event.None;
	readonly onDidExecuteCommand: Event<ICommandEvent> = Event.None;

	readonly executed: { readonly id: string; readonly args: readonly unknown[] }[] = [];

	async executeCommand(id: string, ...args: unknown[]): Promise<undefined> {
		this.executed.push({ id, args });
		return undefined;
	}
}

suite('ChatInputNotificationWidget', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createNotificationService(): IChatInputNotificationService {
		const descriptor = getSingletonServiceDescriptors().find(([id]) => id === IChatInputNotificationService)?.[1];
		assert.ok(descriptor);
		const instantiationService = store.add(workbenchInstantiationService(undefined, store));
		instantiationService.stub(ICommandService, new TestCommandService());
		instantiationService.stub(ITelemetryService, NullTelemetryService);

		const childInstantiationService = store.add(instantiationService.createChild(new ServiceCollection(
			[IChatInputNotificationService, new SyncDescriptor(descriptor.ctor, descriptor.staticArguments)]
		)));
		const notificationService = childInstantiationService.get(IChatInputNotificationService);
		store.add(notificationService as IChatInputNotificationService & IDisposable);
		return notificationService;
	}

	test('rerender applies session type filter when pending delegation target changes', () => {
		let currentSessionType = localChatSessionType;
		const notificationService = createNotificationService();
		const instantiationService = store.add(workbenchInstantiationService(undefined, store));
		instantiationService.stub(IChatInputNotificationService, notificationService);
		instantiationService.stub(ICommandService, new TestCommandService());
		instantiationService.stub(ITelemetryService, NullTelemetryService);

		const widget = store.add(instantiationService.createInstance(ChatInputNotificationWidget, () => currentSessionType));

		notificationService.setNotification({
			id: 'local-only',
			severity: ChatInputNotificationSeverity.Info,
			message: 'Local only',
			description: undefined,
			actions: [],
			dismissible: false,
			autoDismissOnMessage: false,
			sessionTypes: [localChatSessionType],
		});

		assert.strictEqual(widget.domNode.querySelector('.chat-input-notification')?.textContent, 'Local only');

		currentSessionType = SessionType.AgentHostCopilot;
		widget.rerender();
		assert.strictEqual(widget.domNode.querySelector('.chat-input-notification'), null);

		currentSessionType = localChatSessionType;
		widget.rerender();
		assert.strictEqual(widget.domNode.querySelector('.chat-input-notification')?.textContent, 'Local only');
	});

	/**
	 * A notification service mock that records the notifications forwarded to
	 * {@link IChatInputNotificationService.announceRendered} and applies the
	 * `getActiveNotification` filter, so tests can observe exactly what a chat
	 * input would render and announce for its session.
	 */
	function createRecordingNotificationService() {
		const notifications = new Map<string, IChatInputNotification>();
		const announced: (IChatInputNotification | undefined)[] = [];
		const onDidChange = store.add(new Emitter<void>());
		const service: IChatInputNotificationService = {
			_serviceBrand: undefined,
			onDidChange: onDidChange.event,
			onDidDismiss: Event.None,
			setNotification(notification) { notifications.set(notification.id, notification); onDidChange.fire(); },
			deleteNotification(id) { if (notifications.delete(id)) { onDidChange.fire(); } },
			dismissNotification() { },
			getActiveNotification(filter) {
				let active: IChatInputNotification | undefined;
				for (const notification of notifications.values()) {
					if (filter && !filter(notification)) {
						continue;
					}
					active = notification;
				}
				return active;
			},
			handleMessageSent() { },
			announceRendered(notification) { announced.push(notification); },
		};
		return { service, announced, set: (notification: IChatInputNotification) => service.setNotification(notification) };
	}

	test('action commands execute with provided args', async () => {
		const commandService = new TestCommandService();
		const notificationService = createRecordingNotificationService();

		const instantiationService = store.add(workbenchInstantiationService(undefined, store));
		instantiationService.stub(IChatInputNotificationService, notificationService.service);
		instantiationService.stub(ICommandService, commandService);
		instantiationService.stub(ITelemetryService, NullTelemetryService);

		const widget = store.add(instantiationService.createInstance(ChatInputNotificationWidget, () => localChatSessionType));

		notificationService.set({
			id: 'promo',
			severity: ChatInputNotificationSeverity.Info,
			message: 'Promo',
			description: undefined,
			actions: [{ label: 'Use', commandId: 'test.usePromo', commandArgs: [{ modelIdentifier: 'm' }] }],
			dismissible: true,
			autoDismissOnMessage: false,
		});

		const button = widget.domNode.querySelector<HTMLElement>('.chat-input-notification-action-button');
		assert.ok(button);
		button.click();
		await Promise.resolve();

		assert.deepStrictEqual(commandService.executed, [{ id: 'test.usePromo', args: [{ modelIdentifier: 'm' }] }]);
	});

	test('actions without explicit commandArgs are executed with empty args', async () => {
		const commandService = new TestCommandService();
		const notificationService = createRecordingNotificationService();

		const instantiationService = store.add(workbenchInstantiationService(undefined, store));
		instantiationService.stub(IChatInputNotificationService, notificationService.service);
		instantiationService.stub(ICommandService, commandService);
		instantiationService.stub(ITelemetryService, NullTelemetryService);

		const widget = store.add(instantiationService.createInstance(ChatInputNotificationWidget, () => localChatSessionType));

		notificationService.set({
			id: 'info',
			severity: ChatInputNotificationSeverity.Info,
			message: 'Info',
			description: undefined,
			actions: [{ label: 'Upgrade', commandId: 'test.upgrade' }],
			dismissible: true,
			autoDismissOnMessage: false,
		});

		const button = widget.domNode.querySelector<HTMLElement>('.chat-input-notification-action-button');
		assert.ok(button);
		button.click();
		await Promise.resolve();

		assert.deepStrictEqual(commandService.executed, [{ id: 'test.upgrade', args: [] }]);
	});

	test('announces only the notification rendered in the current session', () => {
		let currentSessionType = localChatSessionType;
		const notificationService = createRecordingNotificationService();

		const instantiationService = store.add(workbenchInstantiationService(undefined, store));
		instantiationService.stub(IChatInputNotificationService, notificationService.service);
		instantiationService.stub(ICommandService, new TestCommandService());
		instantiationService.stub(ITelemetryService, NullTelemetryService);

		const widget = store.add(instantiationService.createInstance(ChatInputNotificationWidget, () => currentSessionType));
		const lastAnnounced = () => notificationService.announced[notificationService.announced.length - 1];

		// A promo scoped to the Copilot harness must not be announced while the
		// input is in the local session.
		notificationService.set({
			id: 'copilot-promo',
			severity: ChatInputNotificationSeverity.Info,
			message: 'Copilot promo',
			description: undefined,
			actions: [],
			dismissible: true,
			autoDismissOnMessage: false,
			sessionTypes: [SessionType.AgentHostCopilot],
		});
		assert.strictEqual(lastAnnounced(), undefined, 'nothing should be announced in a non-matching session');

		currentSessionType = SessionType.AgentHostCopilot;
		widget.rerender();
		assert.strictEqual(lastAnnounced()?.id, 'copilot-promo', 'the promo should be announced once its session is active');
	});
});

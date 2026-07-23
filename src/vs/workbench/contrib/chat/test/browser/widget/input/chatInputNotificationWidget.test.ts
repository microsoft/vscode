/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { IDisposable } from '../../../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ICommandEvent, ICommandService } from '../../../../../../../platform/commands/common/commands.js';
import { SyncDescriptor } from '../../../../../../../platform/instantiation/common/descriptors.js';
import { getSingletonServiceDescriptors } from '../../../../../../../platform/instantiation/common/extensions.js';
import { ServiceCollection } from '../../../../../../../platform/instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService, NullTelemetryServiceShape } from '../../../../../../../platform/telemetry/common/telemetryUtils.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { ChatInputNotificationActionKind, ChatInputNotificationSeverity, IChatInputNotification, IChatInputNotificationService } from '../../../../browser/widget/input/chatInputNotificationService.js';
import { ChatInputNotificationWidget, IChatInputNotificationDelegate } from '../../../../browser/widget/input/chatInputNotificationWidget.js';
import { localChatSessionType, SessionType } from '../../../../common/chatSessionsService.js';
import { getChatSessionType } from '../../../../common/model/chatUri.js';

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

class RecordingLogService extends NullLogService {
	private readonly _onError = new Emitter<void>();
	readonly onError = this._onError.event;

	override error(): void {
		this._onError.fire();
	}

	override dispose(): void {
		this._onError.dispose();
		super.dispose();
	}
}

class RecordingTelemetryService extends NullTelemetryServiceShape {
	readonly events: { name: string; data: unknown }[] = [];

	override publicLog2(eventName?: string, data?: unknown): void {
		if (eventName) {
			this.events.push({ name: eventName, data });
		}
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

	test('reactively applies session type filter when pending delegation target changes', () => {
		const currentSessionType = observableValue<string | undefined>('currentSessionType', localChatSessionType);
		const notificationService = createNotificationService();
		const instantiationService = store.add(workbenchInstantiationService(undefined, store));
		instantiationService.stub(IChatInputNotificationService, notificationService);
		instantiationService.stub(ICommandService, new TestCommandService());
		instantiationService.stub(ITelemetryService, NullTelemetryService);

		const widget = store.add(instantiationService.createInstance(ChatInputNotificationWidget, { modelTargetChatSessionType: currentSessionType }));

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

		currentSessionType.set(SessionType.AgentHostCopilot, undefined);
		assert.strictEqual(widget.domNode.querySelector('.chat-input-notification'), null);

		currentSessionType.set(localChatSessionType, undefined);
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
		const dismissed: string[] = [];
		const onDidChange = store.add(new Emitter<void>());
		const onDidDismiss = store.add(new Emitter<string>());
		const service: IChatInputNotificationService = {
			_serviceBrand: undefined,
			onDidChange: onDidChange.event,
			onDidDismiss: onDidDismiss.event,
			setNotification(notification) { notifications.set(notification.id, notification); onDidChange.fire(); },
			deleteNotification(id) { if (notifications.delete(id)) { onDidChange.fire(); } },
			dismissNotification(id) { dismissed.push(id); onDidDismiss.fire(id); },
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
		return { service, announced, dismissed, set: (notification: IChatInputNotification) => service.setNotification(notification) };
	}

	function createWidget(options: {
		delegate?: IChatInputNotificationDelegate;
		commandService?: ICommandService;
		telemetryService?: ITelemetryService;
		logService?: ILogService;
	} = {}) {
		const notificationService = createRecordingNotificationService();
		const instantiationService = store.add(workbenchInstantiationService(undefined, store));
		instantiationService.stub(IChatInputNotificationService, notificationService.service);
		instantiationService.stub(ICommandService, options.commandService ?? new TestCommandService());
		instantiationService.stub(ITelemetryService, options.telemetryService ?? NullTelemetryService);
		if (options.logService) {
			instantiationService.stub(ILogService, options.logService);
		}
		const widget = store.add(instantiationService.createInstance(ChatInputNotificationWidget, options.delegate));
		return { notificationService, widget };
	}

	function clickAction(widget: ChatInputNotificationWidget): void {
		const button = widget.domNode.querySelector<HTMLElement>('.chat-input-notification-action-button');
		assert.ok(button);
		button.click();
	}

	function showNotification(
		notificationService: ReturnType<typeof createRecordingNotificationService>,
		notification: Pick<IChatInputNotification, 'id' | 'message' | 'actions'> & Partial<IChatInputNotification>,
	): void {
		notificationService.set({
			severity: ChatInputNotificationSeverity.Info,
			description: undefined,
			dismissible: true,
			autoDismissOnMessage: false,
			...notification,
		});
	}

	test('action commands execute with provided args', async () => {
		const commandService = new TestCommandService();
		const { notificationService, widget } = createWidget({ commandService });
		showNotification(notificationService, {
			id: 'promo',
			message: 'Promo',
			actions: [{ kind: ChatInputNotificationActionKind.Command, label: 'Use', commandId: 'test.usePromo', commandArgs: [{ modelIdentifier: 'm' }] }],
		});

		const didDismiss = Event.toPromise(notificationService.service.onDidDismiss);
		clickAction(widget);
		await didDismiss;

		assert.deepStrictEqual(commandService.executed, [{ id: 'test.usePromo', args: [{ modelIdentifier: 'm' }] }]);
		assert.strictEqual(notificationService.dismissed.join(','), 'promo');
	});

	test('actions without explicit commandArgs are executed with empty args', async () => {
		const commandService = new TestCommandService();
		const { notificationService, widget } = createWidget({ commandService });
		showNotification(notificationService, {
			id: 'info',
			message: 'Info',
			actions: [{ kind: ChatInputNotificationActionKind.Command, label: 'Upgrade', commandId: 'test.upgrade' }],
		});

		const didDismiss = Event.toPromise(notificationService.service.onDidDismiss);
		clickAction(widget);
		await didDismiss;

		assert.deepStrictEqual(commandService.executed, [{ id: 'test.upgrade', args: [] }]);
		assert.strictEqual(notificationService.dismissed.join(','), 'info');
	});

	test('catches rejected command actions', async () => {
		const logService = store.add(new RecordingLogService());
		const commandService = new class extends TestCommandService {
			override async executeCommand(id: string, ...args: unknown[]): Promise<undefined> {
				await super.executeCommand(id, ...args);
				throw new Error('command failed');
			}
		};

		const { notificationService, widget } = createWidget({ commandService, logService });
		showNotification(notificationService, {
			id: 'rejected-command',
			message: 'Rejected command',
			actions: [{ kind: ChatInputNotificationActionKind.Command, label: 'Run', commandId: 'test.reject' }],
			dismissible: false,
		});

		const didLogError = Event.toPromise(logService.onError);
		clickAction(widget);
		await didLogError;

		assert.deepStrictEqual(commandService.executed, [{ id: 'test.reject', args: [] }]);
	});

	test('switch-to-model actions use the rendering input delegate', async () => {
		const telemetryService = new RecordingTelemetryService();
		const switchedModels: string[] = [];
		let pickerOpenCount = 0;
		const { notificationService, widget } = createWidget({
			telemetryService,
			delegate: {
				switchToModel: modelIdentifier => {
					switchedModels.push(modelIdentifier);
					return true;
				},
				openModelPicker: () => pickerOpenCount++,
			},
		});

		showNotification(notificationService, {
			id: 'promo',
			message: 'Promo',
			actions: [{ label: 'Try Model', kind: ChatInputNotificationActionKind.SwitchToModel, modelIdentifier: 'vendor/model' }],
		});

		clickAction(widget);
		await Promise.resolve();

		assert.deepStrictEqual({
			switchedModels,
			pickerOpenCount,
			actionEvents: telemetryService.events.filter(event => event.name === 'chatInputNotificationAction').map(event => event.data),
		}, {
			switchedModels: ['vendor/model'],
			pickerOpenCount: 0,
			actionEvents: [{ id: 'promo', telemetryId: undefined, actionKind: ChatInputNotificationActionKind.SwitchToModel }],
		});
	});

	test('opens the local model picker when the requested model is unavailable', async () => {
		let pickerOpenCount = 0;
		const { notificationService, widget } = createWidget({
			delegate: {
				switchToModel: () => false,
				openModelPicker: () => pickerOpenCount++,
			},
		});

		showNotification(notificationService, {
			id: 'promo',
			message: 'Promo',
			actions: [{ label: 'Try Model', kind: ChatInputNotificationActionKind.SwitchToModel, modelIdentifier: 'missing/model' }],
		});

		clickAction(widget);
		await Promise.resolve();

		assert.strictEqual(pickerOpenCount, 1);
	});

	test('opens the local model picker when direct selection fails', async () => {
		let pickerOpenCount = 0;
		const logService = store.add(new RecordingLogService());
		const { notificationService, widget } = createWidget({
			logService,
			delegate: {
				switchToModel: () => { throw new Error('selection failed'); },
				openModelPicker: () => pickerOpenCount++,
			},
		});

		showNotification(notificationService, {
			id: 'promo',
			message: 'Promo',
			actions: [{ label: 'Try Model', kind: ChatInputNotificationActionKind.SwitchToModel, modelIdentifier: 'vendor/model' }],
		});

		const didLogError = Event.toPromise(logService.onError);
		clickAction(widget);
		await didLogError;

		assert.strictEqual(pickerOpenCount, 1);
	});

	test('attempts the model picker fallback only once when it fails', async () => {
		const logService = store.add(new RecordingLogService());
		let pickerOpenCount = 0;
		const { notificationService, widget } = createWidget({
			logService,
			delegate: {
				switchToModel: () => false,
				openModelPicker: () => {
					pickerOpenCount++;
					throw new Error('picker failed');
				},
			},
		});
		showNotification(notificationService, {
			id: 'promo',
			message: 'Promo',
			actions: [{ label: 'Try Model', kind: ChatInputNotificationActionKind.SwitchToModel, modelIdentifier: 'missing/model' }],
		});

		const didLogError = Event.toPromise(logService.onError);
		clickAction(widget);
		await didLogError;

		assert.strictEqual(pickerOpenCount, 1);
	});

	test('does not render semantic actions unsupported by the input', () => {
		const { notificationService, widget } = createWidget();

		showNotification(notificationService, {
			id: 'promo',
			message: 'Promo',
			actions: [{ label: 'Try Model', kind: ChatInputNotificationActionKind.SwitchToModel, modelIdentifier: 'vendor/model' }],
		});

		assert.strictEqual(widget.domNode.querySelector('.chat-input-notification-action-button'), null);
	});

	test('matches Agent Host notifications against the resource scheme', () => {
		const sessionResource = URI.from({ scheme: 'agent-host-copilotcli', path: '/untitled-session' });
		const { notificationService, widget } = createWidget({
			delegate: { modelTargetChatSessionType: constObservable(getChatSessionType(sessionResource)) },
		});

		showNotification(notificationService, {
			id: 'agent-host-promo',
			message: 'Agent Host promo',
			actions: [],
			sessionTypes: ['agent-host-copilotcli'],
		});

		assert.strictEqual(widget.domNode.querySelector('.chat-input-notification')?.textContent, 'Agent Host promo');
	});

	test('announces only the notification rendered in the current session', () => {
		const currentSessionType = observableValue<string | undefined>('currentSessionType', localChatSessionType);
		const notificationService = createRecordingNotificationService();

		const instantiationService = store.add(workbenchInstantiationService(undefined, store));
		instantiationService.stub(IChatInputNotificationService, notificationService.service);
		instantiationService.stub(ICommandService, new TestCommandService());
		instantiationService.stub(ITelemetryService, NullTelemetryService);

		store.add(instantiationService.createInstance(ChatInputNotificationWidget, { modelTargetChatSessionType: currentSessionType }));
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

		currentSessionType.set(SessionType.AgentHostCopilot, undefined);
		assert.strictEqual(lastAnnounced()?.id, 'copilot-promo', 'the promo should be announced once its session is active');
	});
});

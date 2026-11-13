/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { IDisposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IRemoteAgentHostConnectionInfo, IRemoteAgentHostService, RemoteAgentHostConnectionStatus } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { getSingletonServiceDescriptors } from '../../../../../../platform/instantiation/common/extensions.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { ConnectionGainEvent, ConnectionLostEvent, PersistentConnectionEvent, PersistentConnectionEventType, ReconnectionPermanentFailureEvent, ReconnectionRunningEvent } from '../../../../../../platform/remote/common/remoteAgentConnection.js';
import { IRemoteAgentEnvironment } from '../../../../../../platform/remote/common/remoteAgentEnvironment.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IRemoteAgentConnection, IRemoteAgentService } from '../../../../../services/remote/common/remoteAgentService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { AgentHostRemoteByokNotificationContribution } from '../../../browser/agentSessions/agentHost/agentHostRemoteByokNotification.js';
import { ChatInputNotificationSeverity, IChatInputNotificationContext, IChatInputNotificationService, resolveChatInputNotificationBody } from '../../../browser/widget/input/chatInputNotificationService.js';
import { ChatInputNotificationWidget } from '../../../browser/widget/input/chatInputNotificationWidget.js';
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../../../common/languageModels.js';
import { ILanguageModelsConfigurationService } from '../../../common/languageModelsConfiguration.js';

suite('AgentHostRemoteByokNotification', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const remoteType = 'remote-host-copilot';
	const storageKey = 'chat.agentHost.remoteByokNotification.disabled';

	function context(overrides: Partial<IChatInputNotificationContext> = {}): IChatInputNotificationContext {
		return {
			inputUri: URI.parse('test-input:/first'),
			sessionType: remoteType,
			sessionResource: URI.parse(`${remoteType}:/first`),
			deferredNotificationsEnabled: false,
			isTransientChat: false,
			sessionStarted: false,
			modelState: { currentModel: undefined, models: [] },
			...overrides,
		};
	}

	function createModel(overrides: Partial<ILanguageModelChatMetadata> = {}): ILanguageModelChatMetadata {
		return {
			extension: new ExtensionIdentifier('test.byok'),
			id: 'test-model',
			name: 'Test Model',
			vendor: 'test',
			version: '1',
			family: 'test',
			maxInputTokens: 1000,
			maxOutputTokens: 1000,
			isDefaultForLocation: {},
			isBYOK: true,
			...overrides,
		};
	}

	function createFixture(options: {
		models?: ILanguageModelChatMetadata[];
		resolved?: boolean;
		vendors?: string[];
		remoteAuthority?: string;
		remoteEnvironment?: Promise<IRemoteAgentEnvironment | null>;
		workspaceConnectionState?: PersistentConnectionEventType;
		hasWorkspaceConnection?: boolean;
		connections?: IRemoteAgentHostConnectionInfo[];
		isSessionsWindow?: boolean;
		hidden?: boolean;
		storageService?: IStorageService;
	} = {}) {
		const instantiationService = store.add(new TestInstantiationService());
		const storageService = options.storageService ?? store.add(new InMemoryStorageService());
		const modelsChanged = store.add(new Emitter<string>());
		const sentimentChanged = store.add(new Emitter<void>());
		const connectionsChanged = store.add(new Emitter<void>());
		const workspaceConnectionChanged = store.add(new Emitter<PersistentConnectionEvent>());
		let workspaceConnectionState = options.workspaceConnectionState ?? PersistentConnectionEventType.ConnectionGain;
		let environmentReads = 0;
		let models = options.models ?? [];
		let resolved = options.resolved ?? true;
		let connections = options.connections ?? [{ address: 'host', name: 'Host', status: RemoteAgentHostConnectionStatus.connected }];
		const sentiment = { hidden: options.hidden ?? false };
		instantiationService.stub(ILogService, new NullLogService());
		const descriptor = getSingletonServiceDescriptors().find(([id]) => id === IChatInputNotificationService)?.[1];
		assert.ok(descriptor);
		const notificationService = store.add(instantiationService.createInstance<IChatInputNotificationService & IDisposable>(descriptor));
		instantiationService.stub(IChatInputNotificationService, notificationService);
		instantiationService.stub(IStorageService, storageService);
		instantiationService.stub(ILanguageModelsService, {
			onDidChangeLanguageModels: modelsChanged.event,
			getLanguageModelIds: () => models.map(model => model.id),
			lookupLanguageModel: id => models.find(model => model.id === id),
			hasResolvedVendor: () => resolved,
		});
		instantiationService.stub(ILanguageModelsConfigurationService, {
			getLanguageModelsProviderGroups: () => (options.vendors ?? []).map(vendor => ({ name: vendor, vendor })),
		});
		instantiationService.stub(IChatEntitlementService, {
			onDidChangeSentiment: sentimentChanged.event,
			sentiment,
		});
		instantiationService.stub(IWorkbenchEnvironmentService, {
			remoteAuthority: options.remoteAuthority,
			isSessionsWindow: options.isSessionsWindow ?? false,
		});
		instantiationService.stub(IRemoteAgentHostService, {
			onDidChangeConnections: connectionsChanged.event,
			get connections() { return connections; },
		});
		instantiationService.stub(IRemoteAgentService, {
			getConnection: () => options.remoteAuthority && options.hasWorkspaceConnection !== false ? upcastPartial<IRemoteAgentConnection>({
				onDidStateChange: workspaceConnectionChanged.event,
				get isConnected() { return workspaceConnectionState === PersistentConnectionEventType.ConnectionGain; },
			}) : null,
			getRawEnvironment: () => {
				environmentReads++;
				return options.remoteEnvironment ?? Promise.resolve(upcastPartial<IRemoteAgentEnvironment>({}));
			},
		});
		const contribution = store.add(instantiationService.createInstance(AgentHostRemoteByokNotificationContribution));
		const getNotification = (inputContext = context()) => notificationService.getActiveNotification(notification =>
			!!resolveChatInputNotificationBody(notification, inputContext, error => { throw error; }));
		return {
			contribution,
			storageService,
			notificationService,
			get environmentReads() { return environmentReads; },
			getNotification,
			isVisible: (inputContext = context()) => !!getNotification(inputContext),
			show(inputContext = context()) {
				const notification = getNotification(inputContext);
				assert.ok(notification);
				notification.onDidShow?.(inputContext);
			},
			dismiss() {
				const notification = getNotification();
				assert.ok(notification);
				notificationService.dismissNotification(notification.id);
			},
			mute() {
				const mute = getNotification()?.mute;
				assert.ok(mute);
				const command = CommandsRegistry.getCommand(mute.commandId);
				assert.ok(command);
				return instantiationService.invokeFunction(accessor => command.handler(accessor));
			},
			setModels(value: ILanguageModelChatMetadata[], vendorsResolved = true) {
				models = value;
				resolved = vendorsResolved;
				modelsChanged.fire('test');
			},
			setConnections(value: IRemoteAgentHostConnectionInfo[]) {
				connections = value;
				connectionsChanged.fire();
			},
			setWorkspaceConnection: (event: PersistentConnectionEvent) => {
				workspaceConnectionState = event.type;
				workspaceConnectionChanged.fire(event);
			},
			setHidden(hidden: boolean) {
				sentiment.hidden = hidden;
				sentimentChanged.fire();
			},
		};
	}

	test('never warns with no BYOK models, even with saved provider groups', () => {
		const fixture = createFixture({ vendors: ['copilot', 'copilotcli', 'agent-host-copilotcli', remoteType, 'anthropic'] });
		const empty = fixture.isVisible();
		fixture.setModels([createModel({ vendor: 'copilot', isBYOK: false })]);
		const copilotOnly = fixture.isVisible();
		fixture.setModels([createModel({ targetChatSessionType: remoteType })]);
		assert.deepStrictEqual([empty, copilotOnly, fixture.isVisible()], [false, false, false]);
	});

	test('waits for cached BYOK models to resolve before warning', () => {
		const fixture = createFixture({ models: [createModel()], resolved: false });
		const unresolved = fixture.isVisible();
		fixture.setModels([]);
		const removed = fixture.isVisible();
		fixture.setModels([createModel()]);
		assert.deepStrictEqual([unresolved, removed, fixture.isVisible()], [false, false, true]);
	});

	test('never warns unless the selected harness is remote Copilot', () => {
		const fixture = createFixture({ models: [createModel()] });
		assert.deepStrictEqual([
			undefined, 'local', 'copilotcli', 'agent-host-copilot', 'agent-host-copilotcli',
			'remote-host-claude', 'remote-host-codex', 'remote-copilot',
			'remote-host-copilot', 'remote-host-copilotcli',
		].map(sessionType => fixture.isVisible(context({ sessionType }))), [
			false, false, false, false, false, false, false, false, true, true,
		]);
	});

	for (const isSessionsWindow of [false, true]) {
		test(`only warns in the editor, including after adding models (isSessionsWindow: ${isSessionsWindow})`, () => {
			const fixture = createFixture({ models: [createModel()], isSessionsWindow });
			const initiallyVisible = fixture.isVisible();
			fixture.setModels([]);
			fixture.setModels([createModel()]);
			assert.deepStrictEqual([initiallyVisible, fixture.isVisible()], [!isSessionsWindow, !isSessionsWindow]);
		});
	}

	test('requires the selected host to be connected, not merely configured or reconnecting', () => {
		const fixture = createFixture({ models: [createModel()], connections: [] });
		const visibility = [fixture.isVisible()];
		for (const status of [
			RemoteAgentHostConnectionStatus.connecting, RemoteAgentHostConnectionStatus.reconnecting,
			RemoteAgentHostConnectionStatus.disconnected, RemoteAgentHostConnectionStatus.incompatible('Old host', []),
			RemoteAgentHostConnectionStatus.connected,
		]) {
			fixture.setConnections([{ address: 'host', name: 'Host', status }]);
			visibility.push(fixture.isVisible());
		}
		fixture.setConnections([{ address: 'different-host', name: 'Other Host', status: RemoteAgentHostConnectionStatus.connected }]);
		visibility.push(fixture.isVisible());
		assert.deepStrictEqual(visibility, [false, false, false, false, false, true, false]);
	});

	for (const remoteAuthority of ['ssh-remote+host', 'wsl+Ubuntu', 'dev-container+container', 'codespaces+space']) {
		test(`waits for a connected ${remoteAuthority} workspace and hides on connection loss`, () => {
			const fixture = createFixture({ models: [createModel()], remoteAuthority, workspaceConnectionState: PersistentConnectionEventType.ReconnectionRunning, connections: [] });
			const input = context({ sessionType: 'agent-host-copilotcli' });
			const visibility = [fixture.isVisible(input)];
			fixture.setWorkspaceConnection(new ConnectionGainEvent('test', 0, 0));
			visibility.push(fixture.isVisible(input));
			fixture.setWorkspaceConnection(new ConnectionLostEvent('test', 0));
			visibility.push(fixture.isVisible(input));
			fixture.setWorkspaceConnection(new ReconnectionRunningEvent('test', 0, 1));
			visibility.push(fixture.isVisible(input));
			fixture.setWorkspaceConnection(new ConnectionGainEvent('test', 0, 1));
			visibility.push(fixture.isVisible(input));
			fixture.setWorkspaceConnection(new ReconnectionPermanentFailureEvent('test', 0, 1, true));
			visibility.push(fixture.isVisible(input));
			assert.deepStrictEqual(visibility, [false, true, false, false, true, false]);
		});
	}

	for (const state of [
		PersistentConnectionEventType.ConnectionGain,
		PersistentConnectionEventType.ConnectionLost,
		PersistentConnectionEventType.ReconnectionRunning,
		PersistentConnectionEventType.ReconnectionPermanentFailure,
	]) {
		test(`uses the current connection state at startup despite a cached environment (${state})`, async () => {
			const fixture = createFixture({
				models: [createModel()],
				remoteAuthority: 'ssh-remote+host',
				workspaceConnectionState: state,
				remoteEnvironment: Promise.resolve(upcastPartial<IRemoteAgentEnvironment>({})),
			});
			await Promise.resolve();
			assert.deepStrictEqual({
				visible: fixture.isVisible(context({ sessionType: 'agent-host-copilotcli' })),
				environmentReads: fixture.environmentReads,
			}, { visible: state === PersistentConnectionEventType.ConnectionGain, environmentReads: 0 });
		});
	}

	test('a remote authority without a connection never qualifies', async () => {
		const fixture = createFixture({ models: [createModel()], remoteAuthority: 'ssh-remote+host', hasWorkspaceConnection: false });
		await Promise.resolve();
		assert.strictEqual(fixture.isVisible(context({ sessionType: 'agent-host-copilotcli' })), false);
	});

	test('a late environment response cannot override connection loss', async () => {
		const environment = new DeferredPromise<IRemoteAgentEnvironment | null>();
		const fixture = createFixture({ models: [createModel()], remoteAuthority: 'ssh-remote+host', remoteEnvironment: environment.p });
		fixture.setWorkspaceConnection(new ConnectionLostEvent('test', 0));
		await environment.complete(upcastPartial({}));
		assert.strictEqual(fixture.isVisible(context({ sessionType: 'agent-host-copilotcli' })), false);
	});

	test('does not fall back to a connected workspace for a disconnected external host', async () => {
		const fixture = createFixture({ models: [createModel()], remoteAuthority: 'ssh-remote+host', connections: [] });
		await Promise.resolve();
		assert.deepStrictEqual([
			fixture.isVisible(context({ sessionType: 'agent-host-copilotcli' })),
			fixture.isVisible(),
			fixture.isVisible(context({ sessionType: 'agent-host-claude' })),
		], [true, false, false]);
	});

	test('refreshes existing inputs when the first BYOK model is added', () => {
		const fixture = createFixture();
		const visibility: boolean[] = [];
		store.add(fixture.notificationService.onDidChange(() => visibility.push(fixture.isVisible())));
		fixture.setModels([createModel()]);
		fixture.setModels([]);
		assert.deepStrictEqual(visibility, [true, false]);
	});

	test('only the first input and session to show the warning can keep showing it', () => {
		const fixture = createFixture({ models: [createModel()] });
		fixture.show();
		const anotherSession = context({ sessionResource: URI.parse(`${remoteType}:/second`) });
		const anotherInput = context({ inputUri: URI.parse('test-input:/second') });
		fixture.setModels([createModel({ id: 'new-model' })]);
		assert.deepStrictEqual([
			fixture.isVisible(),
			fixture.isVisible(anotherSession),
			fixture.isVisible(anotherInput),
			fixture.isVisible(context({ sessionType: 'remote-host-copilotcli' })),
		], [true, false, false, false]);
	});

	test('real input widgets claim the warning once when visible, not when filtered or hidden', () => {
		const fixture = createFixture({ models: [createModel()] });
		const instantiationService = store.add(workbenchInstantiationService(undefined, store));
		instantiationService.stub(IChatInputNotificationService, fixture.notificationService);
		const hostVisible = observableValue('hostVisible', false);
		const sessionType = observableValue('sessionType', 'agent-host-copilotcli');
		const sessionResource = observableValue('sessionResource', URI.parse(`${remoteType}:/first`));
		const first = store.add(instantiationService.createInstance(ChatInputNotificationWidget, {
			inputUri: URI.parse('test-input:/first'),
			hostVisible,
			modelTargetChatSessionType: sessionType,
			sessionResource,
		}));
		const hasWarning = (widget: ChatInputNotificationWidget) => !!widget.domNode.querySelector('.chat-input-notification-header');
		const local = hasWarning(first);
		sessionType.set(remoteType, undefined);
		const hiddenInputDidNotConsume = fixture.isVisible(context({ inputUri: URI.parse('test-input:/another') }));
		hostVisible.set(true, undefined);
		const firstVisible = hasWarning(first);
		const second = store.add(instantiationService.createInstance(ChatInputNotificationWidget, {
			inputUri: URI.parse('test-input:/second'),
			modelTargetChatSessionType: constObservable(remoteType),
			sessionResource: constObservable(URI.parse(`${remoteType}:/second`)),
		}));
		sessionResource.set(URI.parse(`${remoteType}:/third`), undefined);
		fixture.setModels([createModel({ id: 'new-model' })]);
		assert.deepStrictEqual({
			local, hiddenInputDidNotConsume, firstVisible,
			second: hasWarning(second),
			newSessionInFirst: hasWarning(first),
		}, { local: false, hiddenInputDidNotConsume: true, firstVisible: true, second: false, newSessionInFirst: false });
	});

	test('does not repeat after models are removed and added once the warning was shown', () => {
		const fixture = createFixture({ models: [createModel()] });
		fixture.show();
		fixture.setModels([]);
		fixture.setModels([createModel()]);
		assert.strictEqual(fixture.isVisible(), false);
	});

	test('does not repeat after disconnecting and reconnecting once the warning was shown', () => {
		const fixture = createFixture({ models: [createModel()] });
		fixture.show();
		fixture.setConnections([]);
		fixture.setConnections([{ address: 'host', name: 'Host', status: RemoteAgentHostConnectionStatus.connected }]);
		assert.strictEqual(fixture.isVisible(), false);
	});

	test('evaluating an ineligible input does not consume the one-time warning', () => {
		const fixture = createFixture();
		const noModels = fixture.isVisible();
		fixture.setModels([createModel()]);
		const local = fixture.isVisible(context({ sessionType: 'agent-host-copilotcli' }));
		assert.deepStrictEqual([noModels, local, fixture.isVisible()], [false, false, true]);
	});

	test('waits for session initialization before consuming the one-time warning', () => {
		const fixture = createFixture({ models: [createModel()] });
		const instantiationService = store.add(workbenchInstantiationService(undefined, store));
		instantiationService.stub(IChatInputNotificationService, fixture.notificationService);
		const sessionResource = observableValue<URI | undefined>('sessionResource', undefined);
		const widget = store.add(instantiationService.createInstance(ChatInputNotificationWidget, {
			inputUri: context().inputUri,
			modelTargetChatSessionType: constObservable(remoteType),
			sessionResource,
		}));
		const hasWarning = () => !!widget.domNode.querySelector('.chat-input-notification-header');
		const beforeInitialization = hasWarning();
		sessionResource.set(context().sessionResource, undefined);
		const afterInitialization = hasWarning();
		fixture.notificationService.refresh();
		assert.deepStrictEqual([beforeInitialization, afterInitialization, hasWarning()], [false, true, true]);
	});

	test('dismissal lasts for the instance despite model removal, additions, visibility changes and reconnects', () => {
		const fixture = createFixture({ models: [createModel()] });
		fixture.show();
		fixture.dismiss();
		fixture.setModels([]);
		fixture.setModels([createModel()]);
		fixture.setHidden(true);
		fixture.setHidden(false);
		fixture.setConnections([]);
		fixture.setConnections([{ address: 'host', name: 'Host', status: RemoteAgentHostConnectionStatus.connected }]);
		assert.deepStrictEqual([
			fixture.isVisible(),
			fixture.isVisible(context({ sessionResource: URI.parse(`${remoteType}:/second`) })),
		], [false, false]);
	});

	test('a new instance can show again after ordinary dismissal', () => {
		const fixture = createFixture({ models: [createModel()] });
		fixture.show();
		fixture.dismiss();
		fixture.contribution.dispose();
		const reloaded = createFixture({ models: [createModel()], storageService: fixture.storageService });
		assert.strictEqual(reloaded.isVisible(), true);
	});

	test('never shows again after muting, including new models and a new instance', async () => {
		const fixture = createFixture({ models: [createModel()] });
		await fixture.mute();
		const muted = fixture.isVisible();
		fixture.setModels([]);
		fixture.setModels([createModel()]);
		const newModels = fixture.isVisible();
		fixture.contribution.dispose();
		const reloaded = createFixture({ models: [createModel()], storageService: fixture.storageService });
		assert.deepStrictEqual({
			muted, newModels, reloaded: reloaded.isVisible(),
			persisted: fixture.storageService.getBoolean(storageKey, StorageScope.PROFILE),
			userKeys: fixture.storageService.keys(StorageScope.PROFILE, StorageTarget.USER),
		}, { muted: false, newModels: false, reloaded: false, persisted: true, userKeys: [storageKey] });
	});

	test('reacts to permanent mute changes from another window', () => {
		const fixture = createFixture({ models: [createModel()] });
		fixture.storageService.store(storageKey, true, StorageScope.PROFILE, StorageTarget.USER);
		assert.strictEqual(fixture.isVisible(), false);
	});

	test('sending a message does not permanently mute the warning or repeat it in another session', () => {
		const fixture = createFixture({ models: [createModel()] });
		fixture.show();
		fixture.notificationService.handleMessageSent(context());
		assert.deepStrictEqual({
			currentSession: fixture.isVisible(),
			nextSession: fixture.isVisible(context({ sessionResource: URI.parse(`${remoteType}:/second`) })),
			muted: fixture.storageService.getBoolean(storageKey, StorageScope.PROFILE, false),
		}, { currentSession: true, nextSession: false, muted: false });
	});

	test('permanent muting in one profile does not mute a separate profile', async () => {
		const fixture = createFixture({ models: [createModel()] });
		await fixture.mute();
		fixture.contribution.dispose();
		const anotherProfile = createFixture({ models: [createModel()] });
		assert.strictEqual(anotherProfile.isVisible(), true);
	});

	test('never shows while AI features are hidden', () => {
		const fixture = createFixture({ models: [createModel()], hidden: true });
		const initial = fixture.isVisible();
		fixture.setHidden(false);
		const visible = fixture.isVisible();
		fixture.setHidden(true);
		assert.deepStrictEqual([initial, visible, fixture.isVisible()], [false, true, false]);
	});

	test('offers both ordinary dismissal and permanent mute', () => {
		const fixture = createFixture({ models: [createModel()] });
		const notification = fixture.getNotification();
		assert.deepStrictEqual({
			severity: notification?.severity,
			dismissible: notification?.dismissible,
			muteTooltip: notification?.mute?.tooltip,
		}, { severity: ChatInputNotificationSeverity.Warning, dismissible: true, muteTooltip: 'Don\'t Show Again' });
	});

	test('removes the warning and listeners on disposal', () => {
		const fixture = createFixture({ models: [createModel()] });
		fixture.contribution.dispose();
		fixture.setModels([createModel({ id: 'another-model' })]);
		assert.strictEqual(fixture.isVisible(), false);
	});
});

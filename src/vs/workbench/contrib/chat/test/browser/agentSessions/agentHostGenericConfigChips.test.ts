/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationError, isCancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { IReference } from '../../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentConnection, IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { AMBIENT_AGENT_HOST_AUTHORITY, IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { AgentHostConnectionsService } from '../../../../../../platform/agentHost/browser/agentHostConnectionsService.js';
import { agentHostAuthority } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { IRemoteAgentHostConnectionInfo, IRemoteAgentHostService } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { AgentSubscriptionManager, IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { type ComponentToState, StateComponents } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/protocol/actions.js';
import { ResolveSessionConfigResult, SessionConfigCompletionsResult } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { SessionState, SessionSummary } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { INotification, NotificationType } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { IStateSnapshot } from '../../../../../../platform/agentHost/common/state/sessionProtocol.js';
import { IAgentHostEnablementService } from '../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionListDelegate, IActionListItem } from '../../../../../../platform/actionWidget/browser/actionList.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { TestDialogService } from '../../../../../../platform/dialogs/test/common/testDialogService.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../../platform/hover/test/browser/nullHoverService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { NullOpenerService } from '../../../../../../platform/opener/test/common/nullOpenerService.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IChatWidget, IChatWidgetViewModelChangeEvent } from '../../../browser/chat.js';
import { IChatViewModel } from '../../../common/model/chatViewModel.js';
import { IChatPhoneInputPresenter } from '../../../browser/widget/input/chatPhoneInputPresenter.js';
import { TestStorageService } from '../../../../../test/common/workbenchTestServices.js';
import { IPreferencesService } from '../../../../../services/preferences/common/preferences.js';
import { AgentHostGenericConfigChips } from '../../../browser/agentSessions/agentHost/agentHostGenericConfigChips.js';
import { AgentHostChatInputPicker } from '../../../browser/agentSessions/agentHost/agentHostChatInputPicker.js';
import { retrySessionConfigSubscriptionOnCreation } from '../../../browser/agentSessions/agentHost/agentHostSessionConfigSubscription.js';
import { IAgentHostNewSessionFolderService } from '../../../browser/agentSessions/agentHost/agentHostNewSessionFolderService.js';
import { IAgentHostSessionWorkingDirectoryResolver } from '../../../browser/agentSessions/agentHost/agentHostSessionWorkingDirectoryResolver.js';
import { IAgentHostUntitledProvisionalSessionService } from '../../../browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';

function createSubscription<T>(): IAgentSubscription<T> {
	return {
		value: undefined,
		verifiedValue: undefined,
		onDidChange: Event.None,
		onWillApplyAction: Event.None,
		onDidApplyAction: Event.None,
	};
}

suite('AgentHostGenericConfigChips', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('moves its subscription when the provisional generation changes', () => {
		const sessionResource = URI.parse('agent-host-copilot:/untitled-test');
		const firstBackend = URI.parse('copilot:/first-generation');
		const secondBackend = URI.parse('copilot:/second-generation');
		const provisionalChanged = disposables.add(new Emitter<URI>());
		let currentBackend = firstBackend;
		const provisionalService = {
			onDidChange: provisionalChanged.event,
			get: () => currentBackend,
		} as Partial<IAgentHostUntitledProvisionalSessionService> as IAgentHostUntitledProvisionalSessionService;
		const acquired: string[] = [];
		const released: string[] = [];
		const agentHostService = new class extends mock<IAgentHostService>() {
			declare readonly _serviceBrand: undefined;
			override readonly onDidNotification = Event.None;

			override getSubscription<T extends StateComponents>(_kind: T, resource: URI, _owner: string): IReference<IAgentSubscription<ComponentToState[T]>> {
				acquired.push(resource.toString());
				return {
					object: createSubscription<ComponentToState[T]>(),
					dispose: () => released.push(resource.toString()),
				};
			}
		}();
		const widget = {
			viewModel: { sessionResource },
			onDidChangeViewModel: Event.None,
		} as Partial<IChatWidget> as IChatWidget;
		const chips = disposables.add(new AgentHostGenericConfigChips(
			widget,
			disposables.add(new TestInstantiationService()),
			new class extends mock<IAgentHostConnectionsService>() {
				override readonly onDidChangeSessionResolution = Event.None;
				override resolveSessionResource() {
					return { connection: agentHostService, connectionAuthority: AMBIENT_AGENT_HOST_AUTHORITY, backendSession: firstBackend };
				}
			}(),
			provisionalService,
			{} as IAgentHostSessionWorkingDirectoryResolver,
			{} as IWorkspaceContextService,
			{} as IAgentHostNewSessionFolderService,
		));

		currentBackend = secondBackend;
		provisionalChanged.fire(sessionResource);

		assert.deepStrictEqual({
			acquired,
			released,
		}, {
			acquired: [firstBackend.toString(), secondBackend.toString()],
			released: [firstBackend.toString()],
		});

		chips.dispose();
	});
});

suite('AgentHostGenericConfigChips - remote sessions', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const firstResource = URI.parse('remote-host-one-test-agent:/same-id');
	const secondResource = URI.parse('remote-host-two-test-agent:/same-id');
	const backendSession = URI.parse('ahp-session:/same-id');
	const workingDirectory = URI.file('/remote/workspace');

	function makeConfig(): ResolveSessionConfigResult {
		return {
			schema: {
				type: 'object', properties: {
					customChoice: { type: 'string', title: 'Custom Choice', enum: ['first', 'second'], enumLabels: ['First Option', 'Second Option'], sessionMutable: true },
					toggle: { type: 'boolean', title: 'Toggle', sessionMutable: true },
					mode: { type: 'string', title: 'Mode', enum: ['interactive', 'plan'], sessionMutable: true },
					autoApprove: { type: 'string', title: 'Approvals', enum: ['default', 'autoApprove'], sessionMutable: true },
					immutable: { type: 'string', title: 'Immutable', enum: ['first'], sessionMutable: false },
					unspecified: { type: 'boolean', title: 'Unspecified' },
					locked: { type: 'string', title: 'Locked', enum: ['first'], sessionMutable: true, readOnly: true },
					structured: { type: 'object', title: 'Structured', sessionMutable: true },
				}
			},
			values: { customChoice: 'first', toggle: false, locked: 'first' },
		};
	}

	function makeHost(config: ResolveSessionConfigResult) {
		const changed = store.add(new Emitter<SessionState>());
		let state = new class extends mock<SessionState>() {
			override readonly provider = 'test-agent';
			override readonly workingDirectories = [workingDirectory.toString()];
			override readonly config = config;
		}();
		const subscriptions: { [K in StateComponents]?: IAgentSubscription<ComponentToState[K]> } = {
			[StateComponents.Session]: {
				get value() { return state; },
				get verifiedValue() { return state; },
				onDidChange: changed.event, onWillApplyAction: Event.None, onDidApplyAction: Event.None,
			},
		};
		const connection = new class extends mock<IAgentConnection>() {
			override readonly onDidNotification = Event.None;
			acquired = 0;
			released = 0;
			readonly dispatches: { channel: string; config: Record<string, unknown> }[] = [];
			readonly completionRequests: Parameters<IAgentConnection['sessionConfigCompletions']>[0][] = [];
			completionResult: Promise<SessionConfigCompletionsResult> = Promise.resolve({ items: [{ value: 'second', label: 'Dynamic Option' }] });

			override getSubscription<T extends StateComponents>(kind: T, resource: URI): IReference<IAgentSubscription<ComponentToState[T]>> {
				assert.strictEqual(resource.toString(), backendSession.toString());
				const subscription = subscriptions[kind];
				assert.ok(subscription);
				this.acquired++;
				return { object: subscription, dispose: () => this.released++ };
			}
			override dispatch(channel: string, action: Parameters<IAgentConnection['dispatch']>[1]): void {
				assert.strictEqual(action.type, ActionType.SessionConfigChanged);
				if (action.type === ActionType.SessionConfigChanged) {
					this.dispatches.push({ channel, config: action.config });
				}
			}
			override async sessionConfigCompletions(params: Parameters<IAgentConnection['sessionConfigCompletions']>[0]): Promise<SessionConfigCompletionsResult> {
				this.completionRequests.push(params);
				return this.completionResult;
			}
		}();
		return {
			connection, update: (config: ResolveSessionConfigResult) => {
				state = { ...state, config };
				changed.fire(state);
			}
		};
	}

	function setup(config = makeConfig(), connected = true, firstConnection?: IAgentConnection) {
		const host = makeHost(config);
		const secondHost = makeHost(makeConfig());
		const connectionsChanged = store.add(new Emitter<void>());
		const viewModelChanged = store.add(new Emitter<IChatWidgetViewModelChangeEvent>());
		const remoteConnections = new Map<string, IAgentConnection>();
		if (connected) {
			remoteConnections.set('host-one', firstConnection ?? host.connection);
		}
		remoteConnections.set('host-two', secondHost.connection);
		const ambient = new class extends mock<IAgentHostService>() {
			override readonly onAgentHostStart = Event.None;
			override readonly onAgentHostExit = Event.None;
		}();
		const remoteService = new class extends mock<IRemoteAgentHostService>() {
			override readonly onDidChangeConnections = connectionsChanged.event;
			override get connections(): readonly IRemoteAgentHostConnectionInfo[] {
				return [...remoteConnections.keys()].map(address => ({ address, name: address, status: { kind: 'connected' } }));
			}
			override getConnection(address: string) { return remoteConnections.get(address); }
			override getConnectionByAuthority(authority: string) {
				return [...remoteConnections].find(([address]) => agentHostAuthority(address) === authority)?.[1];
			}
		}();
		const connectionsService = store.add(new AgentHostConnectionsService(ambient, remoteService));
		const registerPolicy = (address: string) => store.add(connectionsService.registerSessionResolutionPolicy(agentHostAuthority(address), {
			sessionSchemeAlias: { ui: 'test-agent', backend: 'ahp-session' },
		}));
		registerPolicy('host-one');
		registerPolicy('host-two');
		const widget = new class extends mock<IChatWidget>() {
			override readonly onDidChangeViewModel = viewModelChanged.event;
			override viewModel = new class extends mock<IChatViewModel>() {
				override readonly sessionResource = firstResource;
			}();
		}();
		const shown = store.add(new Emitter<void>());
		const actionWidget = new class extends mock<IActionWidgetService>() {
			override isVisible = false;
			showCount = 0;
			labels: (string | undefined)[] = [];
			select: (label: string) => Promise<void> = async () => { throw new Error('Picker is not open'); };
			onHide: (() => void) | undefined;
			override show<T>(_id: string, _preview: boolean, items: readonly IActionListItem<T>[], delegate: IActionListDelegate<T>): void {
				this.isVisible = true;
				this.showCount++;
				this.labels = items.map(item => item.label);
				this.onHide = delegate.onHide;
				this.select = async label => {
					const item = items.find(item => item.label === label)?.item;
					assert.ok(item);
					await delegate.onSelect(item);
				};
				shown.fire();
			}
			override hide(): void {
				this.isVisible = false;
				const onHide = this.onHide;
				this.onHide = undefined;
				onHide?.();
			}
		}();
		const refreshes: Parameters<IAgentHostUntitledProvisionalSessionService['refreshResolvedConfig']>[] = [];
		const warnings: string[] = [];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.set(ILogService, new class extends NullLogService {
			override warn(message: string): void { warnings.push(message); }
		}());
		instantiationService.set(IAgentHostConnectionsService, connectionsService);
		instantiationService.set(IAgentHostService, ambient);
		instantiationService.set(IActionWidgetService, actionWidget);
		const configuration = new TestConfigurationService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		instantiationService.set(IConfigurationService, configuration);
		instantiationService.set(IHoverService, NullHoverService);
		instantiationService.set(IOpenerService, NullOpenerService);
		instantiationService.set(IDialogService, new TestDialogService());
		instantiationService.set(IStorageService, store.add(new TestStorageService()));
		instantiationService.stub(IPreferencesService, {});
		instantiationService.stub(IAgentHostSessionWorkingDirectoryResolver, { resolve: () => undefined });
		instantiationService.stub(IWorkspaceContextService, { getWorkspace: () => ({ id: 'test', folders: [] }) });
		instantiationService.stub(IAgentHostNewSessionFolderService, { getFolder: () => undefined, getDefaultFolder: () => undefined });
		instantiationService.stub(IAgentHostUntitledProvisionalSessionService, {
			onDidChange: Event.None, get: () => undefined, getResolvedConfig: () => undefined,
			refreshResolvedConfig: async (...args) => { refreshes.push(args); },
		});
		instantiationService.stub(IAgentHostEnablementService, { managedSandboxEnforced: constObservable(false), managedSandboxAllowsBypass: constObservable(false) });
		instantiationService.stub(IChatPhoneInputPresenter, { enabled: constObservable(false) });
		const lane = store.add(instantiationService.createInstance(AgentHostGenericConfigChips, widget));
		const container = document.createElement('div');
		lane.render(container);
		function trigger(property: string): HTMLElement {
			const trigger = container.querySelector<HTMLElement>(`.agent-host-chat-input-picker-host-${property} [role="button"]`);
			assert.ok(trigger);
			return trigger;
		}
		return {
			host, secondHost, config, lane, container, widget, instantiationService, remoteConnections, connectionsChanged, actionWidget, refreshes, warnings,
			trigger,
			addHost: (address: string, connection: IAgentConnection) => {
				remoteConnections.set(address, connection);
				registerPolicy(address);
				connectionsChanged.fire();
			},
			open: async (property = 'customChoice') => {
				const opened = Event.toPromise(shown.event);
				trigger(property).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
				await opened;
			},
			switchSession: (sessionResource = secondResource) => {
				const previousSessionResource = widget.viewModel.sessionResource;
				widget.viewModel = new class extends mock<IChatViewModel>() { override readonly sessionResource = sessionResource; }();
				viewModelChanged.fire({ previousSessionResource, currentSessionResource: sessionResource });
			},
		};
	}

	test('renders only supported mutable generic properties and preserves read-only presentation', () => {
		const { container } = setup();
		assert.deepStrictEqual({
			chips: container.querySelectorAll('.agent-host-generic-chip-slot').length,
			buttons: [...container.querySelectorAll('[role="button"]')].map(element => element.getAttribute('aria-label')),
			readOnly: container.querySelectorAll('[aria-readonly="true"]').length,
		}, {
			chips: 3,
			buttons: ['Custom Choice: First Option', 'Toggle: Off'],
			readOnly: 1,
		});
	});

	test('sends the raw selection to the owning session and refreshes with its advertised provider', async () => {
		const { open, actionWidget, host, secondHost, refreshes, config, trigger } = setup();
		await open();
		await actionWidget.select('Second Option');
		host.update({ ...config, values: { ...config.values, customChoice: 'second' } });
		assert.deepStrictEqual({
			writes: host.connection.dispatches,
			otherWrites: secondHost.connection.dispatches,
			refreshes: refreshes.map(([resource, provider, directory, values]) => [resource.toString(), provider, directory?.toString(), values]),
			label: trigger('customChoice').getAttribute('aria-label'),
		}, {
			writes: [{ channel: backendSession.toString(), config: { customChoice: 'second' } }],
			otherWrites: [],
			refreshes: [[firstResource.toString(), 'test-agent', workingDirectory.toString(), { ...config.values, customChoice: 'second' }]],
			label: 'Custom Choice: Second Option',
		});
	});

	test('preserves boolean values when writing a generic property', async () => {
		const { open, actionWidget, host } = setup();
		await open('toggle');
		await actionWidget.select('On');
		assert.deepStrictEqual(host.connection.dispatches, [{ channel: backendSession.toString(), config: { toggle: true } }]);
	});

	test('routes a reopened picker to the second host even with the same backend session URI', async () => {
		const { switchSession, open, actionWidget, host, secondHost } = setup();
		switchSession();
		await open();
		await actionWidget.select('Second Option');
		assert.deepStrictEqual([host.connection.dispatches, secondHost.connection.dispatches], [
			[], [{ channel: backendSession.toString(), config: { customChoice: 'second' } }],
		]);
	});

	test('routes selections to a third, fourth and fifth host added after the picker was created', async () => {
		const { addHost, switchSession, open, actionWidget, host, secondHost, refreshes } = setup();
		const additionalHosts = ['host-three', 'host-four', 'host-five'].map(address => ({ address, ...makeHost(makeConfig()) }));
		for (const { address, connection } of additionalHosts) {
			addHost(address, connection);
			switchSession(URI.parse(`remote-${agentHostAuthority(address)}-test-agent:/same-id`));
			await open();
			await actionWidget.select('Second Option');
		}
		assert.deepStrictEqual({
			originalWrites: [host.connection.dispatches, secondHost.connection.dispatches],
			additionalWrites: additionalHosts.map(({ connection }) => connection.dispatches),
			refreshTargets: refreshes.map(([resource, provider]) => [resource.toString(), provider]),
		}, {
			originalWrites: [[], []],
			additionalWrites: additionalHosts.map(() => [{ channel: backendSession.toString(), config: { customChoice: 'second' } }]),
			refreshTargets: additionalHosts.map(({ address }) => [`remote-${agentHostAuthority(address)}-test-agent:/same-id`, 'test-agent']),
		});
	});

	test('waits for the remote connection and releases subscriptions when disconnected', () => {
		const { host, lane, container, remoteConnections, connectionsChanged } = setup(makeConfig(), false);
		assert.strictEqual(container.childElementCount, 0);
		remoteConnections.set('host-one', host.connection);
		connectionsChanged.fire();
		const connectedChips = container.childElementCount;
		remoteConnections.delete('host-one');
		connectionsChanged.fire();
		assert.deepStrictEqual({
			connectedChips, disconnectedChips: container.childElementCount,
			acquired: host.connection.acquired, released: host.connection.released,
		}, { connectedChips: 3, disconnectedChips: 0, acquired: 4, released: 4 });
		lane.dispose();
	});

	for (const notificationFirst of [false, true]) {
		test(`recovers a not-yet-created session when the creation notification arrives ${notificationFirst ? 'before' : 'after'} the subscription error`, async () => {
			const config = makeConfig();
			const notifications = store.add(new Emitter<INotification>());
			const initial = new DeferredPromise<IStateSnapshot>();
			store.add({ dispose: () => initial.cancel() });
			let subscribeCalls = 0;
			let seq = 0;
			const state = new class extends mock<SessionState>() {
				override readonly provider = 'test-agent';
				override readonly config = config;
			}();
			const manager = store.add(new AgentSubscriptionManager('test-client', () => ++seq, () => { }, async resource => {
				subscribeCalls++;
				return subscribeCalls === 1 ? initial.p : { resource: resource.toString(), state, fromSeq: 0 };
			}, () => { }));
			const connection = new class extends mock<IAgentConnection>() {
				override readonly onDidNotification = notifications.event;
				override getSubscription<T extends StateComponents>(kind: T, resource: URI, owner: string): IReference<IAgentSubscription<ComponentToState[T]>> {
					return manager.getSubscription(kind, resource, owner);
				}
			}();
			const { container, widget, instantiationService } = setup(config, true, connection);
			const standalone = document.createElement('div');
			store.add(instantiationService.createInstance(AgentHostChatInputPicker, widget, 'customChoice')).render(standalone);
			const notify = () => notifications.fire({
				type: NotificationType.SessionAdded,
				channel: 'ahp-root://',
				summary: new class extends mock<SessionSummary>() { override readonly resource = backendSession.toString(); }(),
			});
			if (notificationFirst) {
				notify();
			}
			initial.error(new Error('Session has not been created yet'));
			await timeout(0);
			if (!notificationFirst) {
				notify();
			}
			await timeout(0);

			assert.deepStrictEqual({
				subscribeCalls,
				buttons: [...container.querySelectorAll('[role="button"]')].map(element => element.getAttribute('aria-label')),
				standaloneButton: standalone.querySelector('[role="button"]')?.getAttribute('aria-label'),
			}, {
				subscribeCalls: 2,
				buttons: ['Custom Choice: First Option', 'Toggle: Off'],
				standaloneButton: 'Custom Choice: First Option',
			});
		});
	}

	test('retries only once per matching creation notification and stops listening on disposal', async () => {
		const notifications = store.add(new Emitter<INotification>());
		const errors = store.add(new Emitter<Error>());
		const subscription: IAgentSubscription<SessionState> = {
			...createSubscription<SessionState>(),
			value: new Error('Session not available'),
			onDidError: errors.event,
		};
		const connection = new class extends mock<IAgentConnection>() {
			override readonly onDidNotification = notifications.event;
		}();
		let retries = 0;
		const listener = store.add(retrySessionConfigSubscriptionOnCreation(connection, backendSession, subscription, () => retries++));
		const notify = (resource: string) => notifications.fire({
			type: NotificationType.SessionAdded,
			channel: 'ahp-root://',
			summary: new class extends mock<SessionSummary>() { override readonly resource = resource; }(),
		});
		errors.fire(new Error('Still unavailable'));
		notify('ahp-session:/unrelated');
		const unrelatedRetries = retries;
		notify(backendSession.toString());
		await timeout(0);
		errors.fire(new Error('Retry also failed'));
		await timeout(0);
		const failedRetryCount = retries;
		notify(backendSession.toString());
		listener.dispose();
		notify(backendSession.toString());
		await timeout(0);
		assert.deepStrictEqual({ unrelatedRetries, failedRetryCount, afterDisposal: retries }, {
			unrelatedRetries: 0, failedRetryCount: 1, afterDisposal: 1,
		});
	});

	test('keeps an open picker when another connection changes', async () => {
		const { open, actionWidget, connectionsChanged, host } = setup();
		await open();
		const acquired = host.connection.acquired;
		connectionsChanged.fire();
		assert.deepStrictEqual({ open: actionWidget.isVisible, acquired: host.connection.acquired }, { open: true, acquired });
	});

	for (const change of ['session', 'connection', 'readOnly', 'sessionMutable'] as const) {
		test(`rejects an obsolete selection after a ${change} change`, async () => {
			const { open, actionWidget, host, secondHost, config, switchSession, remoteConnections, connectionsChanged } = setup();
			await open();
			const select = actionWidget.select;
			if (change === 'session') {
				switchSession();
			} else if (change === 'connection') {
				remoteConnections.set('host-one', secondHost.connection);
				connectionsChanged.fire();
			} else {
				host.update({
					...config,
					schema: {
						...config.schema, properties: {
							...config.schema.properties,
							customChoice: { ...config.schema.properties.customChoice, [change]: change === 'readOnly' },
						}
					},
				});
			}
			await assert.rejects(select('Second Option'), isCancellationError);
			assert.deepStrictEqual([host.connection.dispatches, secondHost.connection.dispatches], [[], []]);
		});
	}

	test('requests dynamic options from the remote provider and current working directory', async () => {
		const config = makeConfig();
		config.schema.properties.customChoice = { ...config.schema.properties.customChoice, enumDynamic: true };
		const { open, host, actionWidget } = setup(config);
		await open();
		assert.deepStrictEqual({
			requests: host.connection.completionRequests.map(request => ({ ...request, workingDirectory: request.workingDirectory?.toString() })), labels: actionWidget.labels,
		}, {
			requests: [{ provider: 'test-agent', property: 'customChoice', query: undefined, workingDirectory: workingDirectory.toString(), config: config.values }],
			labels: ['Dynamic Option'],
		});
	});

	test('uses schema options when a dynamic lookup fails', async () => {
		const config = makeConfig();
		config.schema.properties.customChoice.enumDynamic = true;
		const { open, host, actionWidget, warnings } = setup(config);
		const pending = new DeferredPromise<SessionConfigCompletionsResult>();
		store.add({ dispose: () => pending.cancel() });
		host.connection.completionResult = pending.p;
		const opened = open();
		pending.error(new Error('Provider unavailable'));
		await opened;
		await actionWidget.select('Second Option');

		assert.deepStrictEqual({
			labels: actionWidget.labels,
			writes: host.connection.dispatches,
			warnings,
		}, {
			labels: ['First Option', 'Second Option'],
			writes: [{ channel: backendSession.toString(), config: { customChoice: 'second' } }],
			warnings: ['[AgentHostChatInputPicker] Failed to load dynamic session configuration options; using schema options.'],
		});
	});

	for (const cancellation of ['provider cancellation', 'session switch'] as const) {
		test(`does not show schema options after ${cancellation}`, async () => {
			const config = makeConfig();
			config.schema.properties.customChoice.enumDynamic = true;
			const { trigger, host, actionWidget, switchSession, warnings } = setup(config);
			const pending = new DeferredPromise<SessionConfigCompletionsResult>();
			store.add({ dispose: () => pending.cancel() });
			host.connection.completionResult = pending.p;
			trigger('customChoice').click();
			if (cancellation === 'session switch') {
				switchSession();
			}
			pending.error(cancellation === 'provider cancellation' ? new CancellationError() : new Error('Provider unavailable'));
			await timeout(0);
			assert.deepStrictEqual({ shown: actionWidget.showCount, warnings }, { shown: 0, warnings: [] });
		});
	}

	test('does not show late completions after switching to a host with the same backend session URI', async () => {
		const config = makeConfig();
		config.schema.properties.customChoice.enumDynamic = true;
		const { trigger, host, switchSession, actionWidget } = setup(config);
		const pending = new DeferredPromise<SessionConfigCompletionsResult>();
		store.add({ dispose: () => pending.cancel() });
		host.connection.completionResult = pending.p;
		trigger('customChoice').click();
		switchSession();
		pending.complete({ items: [{ value: 'second', label: 'Obsolete Option' }] });
		await timeout(0);
		assert.strictEqual(actionWidget.showCount, 0);
	});

	test('does not open after the host makes a field read-only during a dynamic lookup', async () => {
		const config = makeConfig();
		config.schema.properties.customChoice.enumDynamic = true;
		const { trigger, host, actionWidget } = setup(config);
		const pending = new DeferredPromise<SessionConfigCompletionsResult>();
		store.add({ dispose: () => pending.cancel() });
		host.connection.completionResult = pending.p;
		trigger('customChoice').click();
		host.update({
			...config,
			schema: {
				...config.schema, properties: {
					...config.schema.properties,
					customChoice: { ...config.schema.properties.customChoice, readOnly: true },
				}
			},
		});
		pending.complete({ items: [{ value: 'second', label: 'Obsolete Option' }] });
		await timeout(0);
		assert.strictEqual(actionWidget.showCount, 0);
	});

});

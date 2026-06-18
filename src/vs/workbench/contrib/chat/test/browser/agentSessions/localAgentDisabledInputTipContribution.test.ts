/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { ConfigurationTarget } from '../../../../../../platform/configuration/common/configuration.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IsSessionsWindowContext } from '../../../../../common/contextkeys.js';
import { IChatWidget, IChatWidgetService, IChatWidgetViewContext } from '../../../browser/chat.js';
import { LocalAgentDisabledInputTipContribution, LOCAL_AGENT_DISABLED_CONTINUE_IN_AGENT_HOST_COPILOT_COMMAND_ID } from '../../../browser/agentSessions/localAgentDisabledInputTipContribution.js';
import { ChatInputNotificationSeverity, IChatInputNotification, IChatInputNotificationService } from '../../../browser/widget/input/chatInputNotificationService.js';
import { IChatModel } from '../../../common/model/chatModel.js';
import { LocalChatSessionUri } from '../../../common/model/chatUri.js';
import { IChatViewModel } from '../../../common/model/chatViewModel.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { IChatSessionsExtensionPoint, IChatSessionsService, localChatSessionType, SessionType } from '../../../common/chatSessionsService.js';
import { MockChatSessionsService } from '../../common/mockChatSessionsService.js';

class TestChatWidgetService implements IChatWidgetService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidAddWidget = new Emitter<IChatWidget>();
	readonly onDidAddWidget = this._onDidAddWidget.event;

	private readonly _onDidChangeFocusedSession = new Emitter<void>();
	readonly onDidChangeFocusedSession = this._onDidChangeFocusedSession.event;

	readonly onDidBackgroundSession = Event.None;
	readonly onDidChangeFocusedWidget = Event.None;

	lastFocusedWidget: IChatWidget | undefined;

	setFocusedWidget(widget: IChatWidget | undefined): void {
		this.lastFocusedWidget = widget;
		this._onDidChangeFocusedSession.fire();
	}

	fireDidAddWidget(widget: IChatWidget): void {
		this._onDidAddWidget.fire(widget);
	}

	revealWidget(): Promise<IChatWidget | undefined> { return Promise.resolve(undefined); }
	reveal(): Promise<boolean> { return Promise.resolve(true); }
	getAllWidgets(): ReadonlyArray<IChatWidget> { return []; }
	getWidgetByInputUri(): IChatWidget | undefined { return undefined; }
	getWidgetBySessionResource(): IChatWidget | undefined { return undefined; }
	getWidgetsByLocations(): ReadonlyArray<IChatWidget> { return []; }
	openSession(): Promise<IChatWidget | undefined> { return Promise.resolve(undefined); }
	register(): { dispose(): void } { return { dispose() { } }; }
}

class TestChatInputNotificationService implements IChatInputNotificationService {
	declare readonly _serviceBrand: undefined;

	readonly onDidChange = Event.None;
	readonly onDidDismiss = Event.None;
	readonly setCalls: IChatInputNotification[] = [];
	readonly deleteCalls: string[] = [];

	setNotification(notification: IChatInputNotification): void {
		this.setCalls.push(notification);
	}

	deleteNotification(id: string): void {
		this.deleteCalls.push(id);
	}

	dismissNotification(): void { }
	getActiveNotification(): IChatInputNotification | undefined { return this.setCalls.at(-1); }
	handleMessageSent(): void { }
}

suite('LocalAgentDisabledInputTipContribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let widgetService: TestChatWidgetService;
	let notificationService: TestChatInputNotificationService;
	let configurationService: TestConfigurationService;
	let chatSessionsService: MockChatSessionsService;
	let testDisposables: DisposableStore;

	setup(() => {
		testDisposables = store.add(new DisposableStore());
		widgetService = new TestChatWidgetService();
		notificationService = new TestChatInputNotificationService();
		configurationService = new TestConfigurationService({
			[ChatConfiguration.EditorLocalAgentEnabled]: false,
			[ChatConfiguration.EditorDefaultProvider]: 'copilotAh',
		});
		chatSessionsService = new MockChatSessionsService();
		chatSessionsService.setContributions([createContribution(SessionType.AgentHostCopilot)]);
	});

	teardown(() => {
		testDisposables.dispose();
	});

	function createContribution(type: string): IChatSessionsExtensionPoint {
		return {
			type,
			name: type,
			displayName: type,
			description: type,
		};
	}

	function createTipContribution(): LocalAgentDisabledInputTipContribution {
		const contribution = new LocalAgentDisabledInputTipContribution(widgetService, notificationService, configurationService, chatSessionsService);
		testDisposables.add(contribution);
		return contribution;
	}

	function createWidget(options?: {
		readonly sessionResource?: URI;
		readonly hasRequests?: boolean;
		readonly viewContext?: IChatWidgetViewContext;
		readonly isSessionsWindow?: boolean;
	}): IChatWidget {
		const contextKeyService = new MockContextKeyService();
		IsSessionsWindowContext.bindTo(contextKeyService).set(options?.isSessionsWindow ?? false);

		const sessionResource = options?.sessionResource ?? LocalChatSessionUri.forSession('history');
		const model = { hasRequests: options?.hasRequests ?? true } as IChatModel;
		const viewModel = { sessionResource, model } as IChatViewModel;

		return {
			viewModel,
			viewContext: options?.viewContext ?? { viewId: 'workbench.panel.chat' },
			scopedContextKeyService: contextKeyService,
		} as unknown as IChatWidget;
	}

	function fireConfigChange(...keys: string[]): void {
		configurationService.onDidChangeConfigurationEmitter.fire({
			source: ConfigurationTarget.USER,
			affectsConfiguration: (key: string) => keys.includes(key),
			affectedKeys: new Set(keys),
			change: { keys, overrides: [] },
		});
	}

	test('shows tip for non-empty local session when local is disabled and agent host Copilot is configured', () => {
		createTipContribution();

		widgetService.setFocusedWidget(createWidget());

		assert.strictEqual(notificationService.setCalls.length, 1);
		assert.strictEqual(notificationService.setCalls[0].id, 'chat.localAgentDisabled.continueInAgentHostCopilot');
		assert.strictEqual(notificationService.setCalls[0].severity, ChatInputNotificationSeverity.Info);
		assert.strictEqual(notificationService.setCalls[0].actions.length, 1);
		assert.strictEqual(notificationService.setCalls[0].actions[0].label, 'Continue In Agent Host');
		assert.strictEqual(notificationService.setCalls[0].actions[0].commandId, LOCAL_AGENT_DISABLED_CONTINUE_IN_AGENT_HOST_COPILOT_COMMAND_ID);
		assert.deepStrictEqual(notificationService.setCalls[0].sessionTypes, [localChatSessionType]);
	});

	test('continue action selects agent host Copilot as pending delegation target', async () => {
		const instantiationService = new TestInstantiationService();
		instantiationService.set(IChatWidgetService, widgetService);
		instantiationService.set(IChatSessionsService, chatSessionsService);

		let continuedInSession: string | undefined;
		widgetService.setFocusedWidget(Object.assign(createWidget(), {
			input: {
				continueInSession: (provider: string) => continuedInSession = provider,
			},
		}) as unknown as IChatWidget);

		const command = CommandsRegistry.getCommand(LOCAL_AGENT_DISABLED_CONTINUE_IN_AGENT_HOST_COPILOT_COMMAND_ID);
		assert.ok(command);

		await command.handler(instantiationService);

		assert.strictEqual(continuedInSession, SessionType.AgentHostCopilot);
	});

	test('shows tip for normal Chat view sessions', () => {
		createTipContribution();

		widgetService.setFocusedWidget(createWidget({ viewContext: { viewId: 'workbench.panel.chat' } }));

		assert.strictEqual(notificationService.setCalls.length, 1);
	});

	test('does not show tip for empty local session', () => {
		createTipContribution();

		widgetService.setFocusedWidget(createWidget({ hasRequests: false }));

		assert.strictEqual(notificationService.setCalls.length, 0);
	});

	test('does not show tip when local is enabled', () => {
		configurationService = new TestConfigurationService({
			[ChatConfiguration.EditorLocalAgentEnabled]: true,
			[ChatConfiguration.EditorDefaultProvider]: 'copilotAh',
		});
		createTipContribution();

		widgetService.setFocusedWidget(createWidget());

		assert.strictEqual(notificationService.setCalls.length, 0);
	});

	test('does not show tip when default provider is not agent host Copilot', () => {
		configurationService = new TestConfigurationService({
			[ChatConfiguration.EditorLocalAgentEnabled]: false,
			[ChatConfiguration.EditorDefaultProvider]: 'copilotEh',
		});
		createTipContribution();

		widgetService.setFocusedWidget(createWidget());

		assert.strictEqual(notificationService.setCalls.length, 0);
	});

	test('does not show tip before agent host Copilot contribution registers', () => {
		chatSessionsService.setContributions([]);
		createTipContribution();

		widgetService.setFocusedWidget(createWidget());

		assert.strictEqual(notificationService.setCalls.length, 0);
	});

	test('does not show tip for non-local sessions', () => {
		createTipContribution();

		widgetService.setFocusedWidget(createWidget({ sessionResource: URI.from({ scheme: SessionType.AgentHostCopilot, path: '/session' }) }));

		assert.strictEqual(notificationService.setCalls.length, 0);
	});

	test('does not show tip for quick, inline, or Agents Window sessions', () => {
		createTipContribution();

		widgetService.setFocusedWidget(createWidget({ viewContext: { isQuickChat: true } }));
		widgetService.setFocusedWidget(createWidget({ viewContext: { isInlineChat: true } }));
		widgetService.setFocusedWidget(createWidget({ isSessionsWindow: true }));

		assert.strictEqual(notificationService.setCalls.length, 0);
	});

	test('clears tip when focused session becomes ineligible', () => {
		createTipContribution();
		widgetService.setFocusedWidget(createWidget());

		widgetService.setFocusedWidget(createWidget({ hasRequests: false }));

		assert.deepStrictEqual(notificationService.deleteCalls, ['chat.localAgentDisabled.continueInAgentHostCopilot']);
	});

	test('does not repost for the same eligible session unless relevant configuration changes', async () => {
		createTipContribution();
		const widget = createWidget();
		widgetService.setFocusedWidget(widget);

		widgetService.setFocusedWidget(widget);
		assert.strictEqual(notificationService.setCalls.length, 1);

		await configurationService.setUserConfiguration(ChatConfiguration.EditorDefaultProvider, 'copilotAh');
		fireConfigChange(ChatConfiguration.EditorDefaultProvider);

		assert.strictEqual(notificationService.setCalls.length, 2);
	});

	test('shows tip when agent host Copilot contribution registers after focus', () => {
		chatSessionsService.setContributions([]);
		createTipContribution();
		widgetService.setFocusedWidget(createWidget());

		chatSessionsService.setContributions([createContribution(SessionType.AgentHostCopilot)]);
		chatSessionsService.fireDidChangeAvailability();

		assert.strictEqual(notificationService.setCalls.length, 1);
	});
});

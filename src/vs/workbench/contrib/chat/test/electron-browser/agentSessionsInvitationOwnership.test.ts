/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import * as dom from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyChangeEvent, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { getSingletonServiceDescriptors } from '../../../../../platform/instantiation/common/extensions.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { INativeHostService, IOpenAgentsWindowOptions } from '../../../../../platform/native/common/native.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IWorkspaceContextService, WorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IWorkbenchAssignmentService } from '../../../../services/assignment/common/assignmentService.js';
import { NullWorkbenchAssignmentService } from '../../../../services/assignment/test/common/nullAssignmentService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IChatWidget, IChatWidgetService } from '../../browser/chat.js';
import { AgentSessionStatus, IAgentSession, IAgentSessionsModel } from '../../browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../browser/agentSessions/agentSessionsService.js';
import { ChatInputPart } from '../../browser/widget/input/chatInputPart.js';
import { ChatInputNotificationActionKind, IChatInputNotificationCommandAction, IChatInputNotificationModelState, IChatInputNotificationService } from '../../browser/widget/input/chatInputNotificationService.js';
import { ChatInputNotificationWidget } from '../../browser/widget/input/chatInputNotificationWidget.js';
import { IChatDraft, reviveChatDraft } from '../../common/attachments/chatDraft.js';
import { IChatRequestVariableEntry, toFileVariableEntry } from '../../common/attachments/chatVariableEntries.js';
import { SessionType } from '../../common/chatSessionsService.js';
import { ChatAgentLocation, ChatConfiguration } from '../../common/constants.js';
import { IChatModel } from '../../common/model/chatModel.js';
import { IChatViewModel } from '../../common/model/chatViewModel.js';
import { AgentsParallelWorkContribution } from '../../electron-browser/agentSessions/agentSessionsActions.js';

interface IWidgetFixture {
	readonly widget: IChatWidget;
	readonly resource: URI;
	readonly inputUri: URI;
	readonly renderer: ChatInputNotificationWidget;
	readonly container: HTMLElement;
	readonly input: HTMLElement;
	readonly state: { text: string; attachments: IChatRequestVariableEntry[]; visible: boolean };
}

suite('Agents invitation widget ownership', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createHarness() {
		const instantiation = disposables.add(workbenchInstantiationService(undefined, disposables));
		const focused = disposables.add(new Emitter<void>());
		const added = disposables.add(new Emitter<IChatWidget>());
		const removed = disposables.add(new Emitter<IChatWidget>());
		const visibility = disposables.add(new Emitter<IChatWidget>());
		const contextChanged = disposables.add(new Emitter<IContextKeyChangeEvent>());
		const configuration = new class extends TestConfigurationService {
			override async updateValue(key: string, value: unknown): Promise<void> {
				await this.setUserConfiguration(key, value);
				this.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: section => section === key }));
			}
		}({
			[ChatConfiguration.OpenInAgentsWindowTransferDraft]: false,
			[ChatConfiguration.AgentsParallelWorkBannerEnabled]: true,
		});
		disposables.add(configuration.onDidChangeConfigurationEmitter);
		const contextService = upcastPartial<IContextKeyService>({
			onDidChangeContext: contextChanged.event,
			contextMatchesRules: () => true,
		});
		const widgets: IChatWidget[] = [];
		const fixtures: IWidgetFixture[] = [];
		const visible = new Map<IChatWidget, boolean>();
		let lastFocused: IChatWidget | undefined;
		let nextInput = 0;
		let peakVisible = 0;
		const opened: IOpenAgentsWindowOptions[] = [];
		instantiation.stub(IConfigurationService, configuration);
		instantiation.stub(IWorkbenchAssignmentService, new NullWorkbenchAssignmentService());
		instantiation.stub(IContextKeyService, contextService);
		instantiation.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
			get lastFocusedWidget() { return lastFocused; },
			getAllWidgets: () => widgets,
			getWidgetByInputUri: inputUri => widgets.find(widget => isEqual(widget.inputPart.inputUri, inputUri)),
			getWidgetBySessionResource: resource => widgets.find(widget => isEqual(widget.viewModel?.sessionResource, resource)),
			onDidChangeFocusedSession: focused.event,
			onDidAddWidget: added.event,
			onDidRemoveWidget: removed.event,
			onDidChangeWidgetVisibility: visibility.event,
		}));
		instantiation.stub(IAgentSessionsService, upcastPartial<IAgentSessionsService>({
			model: upcastPartial<IAgentSessionsModel>({
				onDidChangeSessions: Event.None,
				sessions: [upcastPartial<IAgentSession>({ providerType: SessionType.AgentHostCopilot, status: AgentSessionStatus.InProgress, isArchived: () => false })],
			}),
		}));
		instantiation.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({
			getWorkspace: () => ({ id: 'source', folders: [new WorkspaceFolder({ uri: URI.file('/source'), name: 'source', index: 0 })] }),
		}));
		instantiation.stub(IEditorService, upcastPartial<IEditorService>({ activeEditor: undefined }));
		instantiation.stub(INativeHostService, upcastPartial<INativeHostService>({
			openAgentsWindow: async options => { opened.push(options ?? {}); },
		}));
		instantiation.stub(ITelemetryService, NullTelemetryService);
		instantiation.stub(ICommandService, upcastPartial<ICommandService>({
			executeCommand: async (id, ...args) => {
				const command = CommandsRegistry.getCommand(id);
				assert.ok(command);
				await instantiation.invokeFunction(accessor => command.handler(accessor, ...args));
				return undefined;
			},
		}));
		const descriptor = getSingletonServiceDescriptors().find(([id]) => id === IChatInputNotificationService)?.[1];
		assert.ok(descriptor);
		const child = disposables.add(instantiation.createChild(new ServiceCollection(
			[IChatInputNotificationService, new SyncDescriptor(descriptor.ctor, descriptor.staticArguments)],
		)));
		const notifications = child.get(IChatInputNotificationService);
		disposables.add(notifications as IChatInputNotificationService & IDisposable);
		instantiation.stub(IChatInputNotificationService, notifications);
		const sandbox = sinon.createSandbox();
		disposables.add(toDisposable(() => sandbox.restore()));
		const announcementWrites = sandbox.spy(Reflect.get(notifications, '_announcedById') as Map<string, string>, 'set');
		let changes = 0;
		disposables.add(notifications.onDidChange(() => changes++));

		const focusWidget = (widget: IChatWidget) => {
			if (!widgets.includes(widget)) {
				return;
			}
			fixtures.find(fixture => fixture.widget === widget)?.input.focus();
			lastFocused = widget;
			focused.fire();
		};
		const addWidget = (resource: URI) => {
			const inputUri = URI.from({ scheme: Schemas.vscodeChatInput, path: `/owner-${nextInput++}` });
			const container = dom.append(mainWindow.document.body, dom.$('div'));
			disposables.add(toDisposable(() => container.remove()));
			const slot = dom.append(container, dom.$('div'));
			const input = dom.append(container, dom.$('textarea'));
			const state = { text: 'Initial draft', attachments: [] as IChatRequestVariableEntry[], visible: true };
			const notificationWidget = disposables.add(new MutableDisposable<ChatInputNotificationWidget>());
			const inputPart: ChatInputPart = Object.assign(Object.create(ChatInputPart.prototype), {
				inputUri,
				instantiationService: instantiation,
				options: {},
				_notificationWidget: notificationWidget,
				_notificationModelTargetChatSessionType: constObservable(SessionType.AgentHostCopilot),
				_currentSessionResourceObservable: constObservable(resource),
				_deferredNotificationsEnabled: constObservable(true),
				_sessionStarted: constObservable(false),
				_notificationModelState: constObservable<IChatInputNotificationModelState>({ currentModel: undefined, models: [] }),
				chatInputNotificationContainer: slot,
				noticeHost: {
					setOccupied: (_lane: number, shown: boolean) => {
						visible.set(widget, shown);
						peakVisible = Math.max(peakVisible, fixtures.filter(fixture => fixture.renderer.domNode.isConnected && visible.get(fixture.widget)).length);
					},
				},
				focus: () => focusWidget(widget),
			});
			const widget = upcastPartial<IChatWidget>({
				location: ChatAgentLocation.Chat,
				viewContext: {},
				get visible() { return state.visible; },
				viewModel: upcastPartial<IChatViewModel>({ sessionResource: resource, model: upcastPartial<IChatModel>({ hasRequests: false }) }),
				getInput: () => state.text,
				get attachmentModel() { return upcastPartial<IChatWidget['attachmentModel']>({ attachments: state.attachments }); },
				inputPart,
				input: inputPart,
				scopedContextKeyService: contextService,
			});
			const ensureNotificationWidget = Reflect.get(ChatInputPart.prototype, 'ensureNotificationWidget') as (this: ChatInputPart) => void;
			ensureNotificationWidget.call(inputPart);
			assert.ok(notificationWidget.value);
			const fixture = { widget, resource, inputUri, renderer: notificationWidget.value, container, input, state };
			fixtures.push(fixture);
			widgets.push(widget);
			added.fire(widget);
			return fixture;
		};
		return {
			addWidget, notifications, configuration, opened, announcementWrites,
			start: () => disposables.add(instantiation.createInstance(AgentsParallelWorkContribution)),
			focus: (fixture: IWidgetFixture) => focusWidget(fixture.widget),
			hide: (fixture: IWidgetFixture) => { fixture.state.visible = false; visibility.fire(fixture.widget); },
			remove: (fixture: IWidgetFixture) => {
				widgets.splice(widgets.indexOf(fixture.widget), 1);
				if (lastFocused === fixture.widget) {
					lastFocused = undefined;
					focused.fire();
				}
				removed.fire(fixture.widget);
				fixture.renderer.dispose();
				fixture.container.remove();
			},
			reevaluate: () => {
				focused.fire();
				contextChanged.fire({ affectsSome: () => true, allKeysContainedIn: () => false });
			},
			owners: () => fixtures.filter(fixture => fixture.renderer.domNode.isConnected && !!fixture.renderer.domNode.querySelector('.chat-input-notification-action-button')).map(fixture => fixture.inputUri),
			get peakVisible() { return peakVisible; },
			get changes() { return changes; },
			invoke: async (action: IChatInputNotificationCommandAction) => {
				const command = CommandsRegistry.getCommand(action.commandId);
				assert.ok(command);
				await instantiation.invokeFunction(accessor => command.handler(accessor, ...action.commandArgs ?? []));
			},
		};
	}

	for (const sameChat of [false, true]) {
		test(`renders exactly one owner and revokes it before switching (${sameChat ? 'same chat in two widgets' : 'two different chats'})`, () => {
			const h = createHarness();
			const resource = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-first' });
			const first = h.addWidget(resource);
			const second = h.addWidget(sameChat ? resource : URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-second' }));
			h.focus(first);
			h.start();
			const initially = h.owners();
			h.focus(second);
			const switched = h.owners();
			h.focus(first);
			const changes = h.changes;
			h.reevaluate();
			h.reevaluate();
			assert.deepStrictEqual({
				initially, switched, returned: h.owners(), peak: h.peakVisible,
				stableChanges: h.changes === changes, announcements: h.announcementWrites.callCount,
			}, {
				initially: [first.inputUri], switched: [second.inputUri], returned: [first.inputUri], peak: 1,
				stableChanges: true, announcements: 1,
			});
		});
	}

	test('captures the displayed widget current draft, not the first widget for the shared session', async () => {
		const h = createHarness();
		const resource = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-shared' });
		const first = h.addWidget(resource);
		const second = h.addWidget(resource);
		first.state.text = 'Wrong widget';
		h.focus(second);
		h.start();
		second.state.text = 'Latest owning-widget draft';
		second.state.attachments = [toFileVariableEntry(URI.file('/source/current-context'))];
		const button = second.renderer.domNode.querySelector<HTMLElement>('.chat-input-notification-action-button');
		assert.ok(button);
		button.click();
		await timeout(0);
		const draft: IChatDraft = { inputText: second.state.text, attachments: second.state.attachments };
		assert.deepStrictEqual({
			copied: h.opened[0]?.draft && reviveChatDraft(h.opened[0].draft),
			count: h.opened.length, owners: h.owners(), first: first.state.text, second: second.state.text,
		}, {
			copied: draft, count: 1, owners: [], first: 'Wrong widget', second: 'Latest owning-widget draft',
		});
	});

	test('a revoked widget action cannot transfer the new owner draft', async () => {
		const h = createHarness();
		const resource = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-shared' });
		const first = h.addWidget(resource);
		const second = h.addWidget(resource);
		h.focus(first);
		h.start();
		const action = h.notifications.getActiveNotification()?.actions[0];
		assert.ok(action?.kind === ChatInputNotificationActionKind.Command);
		h.focus(second);
		await h.invoke(action);
		assert.deepStrictEqual({ opened: h.opened, owners: h.owners() }, { opened: [], owners: [second.inputUri] });
	});

	test('X dismisses the owning chat in every duplicate widget without hiding a different new chat', async () => {
		const h = createHarness();
		const resource = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-shared' });
		const first = h.addWidget(resource);
		const second = h.addWidget(resource);
		h.focus(second);
		h.start();
		const dismiss = second.renderer.domNode.querySelector<HTMLElement>('.chat-input-notification-dismiss');
		assert.ok(dismiss);
		dismiss.click();
		await timeout(0);
		h.focus(first);
		h.reevaluate();
		const dismissed = h.owners();
		const next = h.addWidget(URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-next' }));
		h.focus(next);
		assert.deepStrictEqual({ dismissed, next: h.owners(), peak: h.peakVisible }, { dismissed: [], next: [next.inputUri], peak: 1 });
	});

	test('X dismissal is memory-only and a reload allows the same chat to show again', async () => {
		const h = createHarness();
		const resource = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-shared' });
		const first = h.addWidget(resource);
		const second = h.addWidget(resource);
		h.focus(second);
		const contribution = h.start();
		const dismiss = second.renderer.domNode.querySelector<HTMLElement>('.chat-input-notification-dismiss');
		assert.ok(dismiss);
		dismiss.click();
		await timeout(0);
		h.focus(first);
		h.reevaluate();
		const beforeReload = h.owners();
		contribution.dispose();
		h.start();
		assert.deepStrictEqual({
			beforeReload, afterReload: h.owners(),
			enabled: h.configuration.getValue(ChatConfiguration.AgentsParallelWorkBannerEnabled),
			announcements: h.announcementWrites.callCount, peak: h.peakVisible,
		}, {
			beforeReload: [], afterReload: [first.inputUri], enabled: true, announcements: 2, peak: 1,
		});
	});

	test('Ignore remains disabled when the contribution is recreated on reload', async () => {
		const h = createHarness();
		const fixture = h.addWidget(URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-draft' }));
		h.focus(fixture);
		const contribution = h.start();
		const ignore = fixture.renderer.domNode.querySelectorAll<HTMLElement>('.chat-input-notification-action-button')[1];
		assert.ok(ignore);
		ignore.click();
		await timeout(0);
		contribution.dispose();
		h.start();
		h.reevaluate();
		assert.deepStrictEqual({
			afterReload: h.owners(), enabled: h.configuration.getValue(ChatConfiguration.AgentsParallelWorkBannerEnabled),
		}, { afterReload: [], enabled: false });
	});

	test('a queued X dismisses its original chat rather than a newly displayed owner', async () => {
		const h = createHarness();
		const first = h.addWidget(URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-first' }));
		const second = h.addWidget(URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-second' }));
		h.focus(first);
		h.start();
		const dismiss = first.renderer.domNode.querySelector<HTMLElement>('.chat-input-notification-dismiss');
		assert.ok(dismiss);
		dismiss.click();
		h.focus(second);
		await timeout(0);
		const successor = h.owners();
		h.focus(first);
		assert.deepStrictEqual({ successor, original: h.owners(), peak: h.peakVisible }, {
			successor: [second.inputUri], original: [], peak: 1,
		});
	});

	test('hiding and disposing owners selects the most recent eligible widget and releases the banner', () => {
		const h = createHarness();
		const first = h.addWidget(URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-first' }));
		const second = h.addWidget(URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-second' }));
		const third = h.addWidget(URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-third' }));
		h.focus(first);
		const contribution = h.start();
		h.focus(second);
		h.focus(third);
		h.hide(third);
		const hidden = h.owners();
		h.remove(third);
		const removed = h.owners();
		contribution.dispose();
		h.reevaluate();
		assert.deepStrictEqual({ hidden, removed, disposed: h.owners(), peak: h.peakVisible, announcements: h.announcementWrites.callCount }, {
			hidden: [second.inputUri], removed: [second.inputUri], disposed: [], peak: 1, announcements: 1,
		});
	});

	test('disposing the active visible owner transfers ownership before rendering its successor', () => {
		const h = createHarness();
		const first = h.addWidget(URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-first' }));
		const second = h.addWidget(URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-second' }));
		h.focus(first);
		h.start();
		h.focus(second);
		second.renderer.focus();
		h.remove(second);
		const transferred = h.owners();
		h.remove(first);
		assert.deepStrictEqual({ transferred, lastRemoved: h.owners(), peak: h.peakVisible }, {
			transferred: [first.inputUri], lastRemoved: [], peak: 1,
		});
	});

	test('Ignore disables invitations in every current and subsequent widget', async () => {
		const h = createHarness();
		const first = h.addWidget(URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-first' }));
		const second = h.addWidget(URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-second' }));
		h.focus(first);
		h.start();
		h.focus(second);
		const ignore = second.renderer.domNode.querySelectorAll<HTMLElement>('.chat-input-notification-action-button')[1];
		assert.ok(ignore);
		ignore.click();
		await timeout(0);
		h.focus(first);
		const next = h.addWidget(URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-next' }));
		h.focus(next);
		h.reevaluate();
		assert.deepStrictEqual({
			enabled: h.configuration.getValue(ChatConfiguration.AgentsParallelWorkBannerEnabled), owners: h.owners(), peak: h.peakVisible,
		}, { enabled: false, owners: [], peak: 1 });
	});
});

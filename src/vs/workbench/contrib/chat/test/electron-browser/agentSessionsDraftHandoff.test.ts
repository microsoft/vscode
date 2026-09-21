/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { MarshalledId } from '../../../../../base/common/marshallingIds.js';
import { Schemas } from '../../../../../base/common/network.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/index.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, IConfigurationChangeEvent, IConfigurationOverrides, IConfigurationService, IConfigurationUpdateOverrides } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyChangeEvent, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INativeHostService, IOpenAgentsWindowOptions } from '../../../../../platform/native/common/native.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import product from '../../../../../platform/product/common/product.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { AgentsWindowOpenSource, isAgentsWindowOpenSource } from '../../../../../platform/window/common/window.js';
import { IWorkspaceContextService, WorkbenchState, WorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IWorkbenchAssignmentService } from '../../../../services/assignment/common/assignmentService.js';
import { NullWorkbenchAssignmentService } from '../../../../services/assignment/test/common/nullAssignmentService.js';
import { IChatWidget, IChatWidgetService } from '../../browser/chat.js';
import { ChatViewPane } from '../../browser/widgetHosts/viewPane/chatViewPane.js';
import { AgentSessionStatus, IAgentSession, IAgentSessionsModel } from '../../browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../browser/agentSessions/agentSessionsService.js';
import { ChatInputNotificationActionKind, IChatInputNotification, IChatInputNotificationService, isChatInputNotificationApplicableToSession } from '../../browser/widget/input/chatInputNotificationService.js';
import { reviveChatDraft } from '../../common/attachments/chatDraft.js';
import { IChatRequestVariableEntry, toFileVariableEntry } from '../../common/attachments/chatVariableEntries.js';
import { ChatAgentLocation, ChatConfiguration, DEFAULT_AGENTS_HANDOFF_TIP_DELAY_SECONDS, OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID } from '../../common/constants.js';
import { SessionType } from '../../common/chatSessionsService.js';
import { IChatChangeEvent, IChatModel, IChatPendingRequest, IChatRequestModel } from '../../common/model/chatModel.js';
import { IChatViewModel } from '../../common/model/chatViewModel.js';
import { getChatSessionType, LocalChatSessionUri } from '../../common/model/chatUri.js';
import { AgentsHandoffInputTipContribution, AgentsParallelWorkContribution, OpenAgentsWindowAction, OpenChatSessionInAgentsWindowAction, OpenWorkspaceInAgentsWindowAction, OpenWorkspaceInAgentsWindowChatTitleAction, OpenWorkspaceInAgentsWindowTitleBarAction } from '../../electron-browser/agentSessions/agentSessionsActions.js';
import { agentsWindowHandoffConfigurationProperties } from '../../browser/agentSessionsConfiguration.js';

suite('Agents Window draft handoff and parallel invitation', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const titleTreatment = 'chatAgentsParallelWorkBannerTitle';
	const descriptionTreatment = 'chatAgentsParallelWorkBannerDescription';
	const defaultTitle = 'Run agents side by side';
	const defaultDescription = 'Run multiple tasks in the Agents Window, in one workspace or across projects.';
	const agentHostSessionTypes = [
		SessionType.AgentHostCopilot,
		SessionType.AgentHostClaude,
		SessionType.AgentHostCodex,
		'agent-host-custom',
		'remote-test-copilotcli',
		'remote-test-claude',
		'remote-test-codex',
		'remote-test-custom',
	];

	function createHarness(options: { transfer?: boolean; reveal?: boolean; running?: boolean; banner?: boolean; runningProviderType?: string; handoffDelaySeconds?: number } = {}) {
		const instantiation = disposables.add(new TestInstantiationService());
		const focused = disposables.add(new Emitter<void>());
		const sessionsChanged = disposables.add(new Emitter<void>());
		const contextChanged = disposables.add(new Emitter<IContextKeyChangeEvent>());
		const dismissed = disposables.add(new Emitter<string>());
		const assignmentsRefetched = disposables.add(new Emitter<void>());
		const requestsChanged = disposables.add(new Emitter<IChatChangeEvent>());
		const pendingRequestsChanged = disposables.add(new Emitter<void>());
		const configuration = new class extends TestConfigurationService {
			readonly updates: { key: string; value: unknown; target?: ConfigurationTarget }[] = [];
			override async updateValue(key: string, value: unknown, targetOrOverrides?: ConfigurationTarget | IConfigurationOverrides | IConfigurationUpdateOverrides): Promise<void> {
				this.updates.push({ key, value, target: typeof targetOrOverrides === 'number' ? targetOrOverrides : undefined });
				await this.setUserConfiguration(key, value);
				this.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: section => section === key }));
			}
		}({
			[ChatConfiguration.OpenInAgentsWindowTransferDraft]: options.transfer ?? true,
			[ChatConfiguration.OpenInAgentsWindowRevealCurrentSession]: options.reveal ?? false,
			[ChatConfiguration.AgentsHandoffTipMode]: 'default',
			[ChatConfiguration.AgentsHandoffTipDelaySeconds]: options.handoffDelaySeconds ?? DEFAULT_AGENTS_HANDOFF_TIP_DELAY_SECONDS,
			[ChatConfiguration.AgentsParallelWorkBannerEnabled]: options.banner ?? true,
		});
		disposables.add(configuration.onDidChangeConfigurationEmitter);
		let resource = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-draft' });
		let input = 'Original prompt';
		let hasRequests = false;
		const requests: IChatRequestModel[] = [];
		const pendingRequests: IChatPendingRequest[] = [];
		const requestInProgress = observableValue('requestInProgress', false);
		const model = upcastPartial<IChatModel>({
			get hasRequests() { return hasRequests; },
			requestInProgress,
			onDidChange: requestsChanged.event,
			onDidChangePendingRequests: pendingRequestsChanged.event,
			getRequests: () => requests,
			getPendingRequests: () => pendingRequests,
		});
		let attachments: IChatRequestVariableEntry[] = [toFileVariableEntry(URI.file('/source/context.ts'))];
		let allowed = true;
		let viewContext: IChatWidget['viewContext'] = {};
		let status = options.running === false ? AgentSessionStatus.Completed : AgentSessionStatus.InProgress;
		let runningProviderType = options.runningProviderType ?? 'remote-test-copilotcli';
		const notifications = new Map<string, IChatInputNotification>();
		let workbenchState = WorkbenchState.FOLDER;
		let posts = 0;
		let openReady = Promise.resolve();
		const calls: IOpenAgentsWindowOptions[] = [];
		const warnings: string[] = [];
		const treatmentWarnings: string[] = [];
		const treatmentNames: string[] = [];
		let readTreatment: (name: string) => Promise<string | undefined> = async () => undefined;
		instantiation.stub(IWorkbenchAssignmentService, new class extends NullWorkbenchAssignmentService {
			override readonly onDidRefetchAssignments = assignmentsRefetched.event;
			override async getTreatment<T extends string | number | boolean>(name: string): Promise<T | undefined> {
				treatmentNames.push(name);
				return await readTreatment(name) as T | undefined;
			}
		}());
		instantiation.stub(ILogService, upcastPartial<ILogService>({
			warn: message => { treatmentWarnings.push(message); },
		}));
		const models = new ResourceMap<ITextModel>();
		instantiation.stub(IModelService, upcastPartial<IModelService>({ getModel: uri => models.get(uri) ?? null }));
		const contextService = upcastPartial<IContextKeyService>({
			onDidChangeContext: contextChanged.event,
			contextMatchesRules: () => allowed,
			getContextKeyValue: <T>() => getChatSessionType(resource) as T,
		});
		const inputUri = URI.from({ scheme: Schemas.vscodeChatInput, path: '/source-input' });
		const inputPart = upcastPartial<IChatWidget['inputPart']>({ inputUri });
		const widget = upcastPartial<IChatWidget>({
			location: ChatAgentLocation.Chat,
			visible: true,
			inputPart,
			input: inputPart,
			get viewContext() { return viewContext; },
			get viewModel() { return upcastPartial<IChatViewModel>({ sessionResource: resource, model }); },
			getInput: () => input,
			get attachmentModel() { return upcastPartial<IChatWidget['attachmentModel']>({ attachments }); },
			scopedContextKeyService: contextService,
		});
		let lastFocusedWidget: IChatWidget | undefined = widget;
		instantiation.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
			get lastFocusedWidget() { return lastFocusedWidget; },
			onDidChangeFocusedSession: focused.event,
			onDidAddWidget: Event.None,
			onDidRemoveWidget: Event.None,
			onDidChangeWidgetVisibility: Event.None,
			getAllWidgets: () => [widget],
			getWidgetByInputUri: target => isEqual(target, inputUri) ? widget : undefined,
			getWidgetBySessionResource: target => isEqual(target, resource) ? widget : undefined,
		}));
		instantiation.stub(IContextKeyService, contextService);
		instantiation.stub(IConfigurationService, configuration);
		instantiation.stub(IAgentSessionsService, upcastPartial<IAgentSessionsService>({
			model: upcastPartial<IAgentSessionsModel>({
				onDidChangeSessions: sessionsChanged.event,
				get sessions() {
					return [upcastPartial<IAgentSession>({
						resource: URI.from({ scheme: runningProviderType, path: '/other-workspace' }),
						providerType: runningProviderType,
						status,
						isArchived: () => false,
					})];
				},
			}),
		}));
		instantiation.stub(IChatInputNotificationService, upcastPartial<IChatInputNotificationService>({
			onDidDismiss: dismissed.event,
			setNotification: value => { notifications.delete(value.id); notifications.set(value.id, value); posts++; },
			deleteNotification: id => { notifications.delete(id); },
			refresh: () => { },
		}));
		instantiation.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({
			getWorkspace: () => ({ id: 'source', folders: [new WorkspaceFolder({ uri: URI.file('/source'), name: 'source', index: 0 })] }),
			getWorkbenchState: () => workbenchState,
			onDidChangeWorkbenchState: Event.None,
		}));
		instantiation.stub(IEditorService, upcastPartial<IEditorService>({ activeEditor: undefined }));
		instantiation.stub(INativeHostService, upcastPartial<INativeHostService>({ openAgentsWindow: async value => { calls.push(value ?? {}); await openReady; } }));
		instantiation.stub(INotificationService, upcastPartial<INotificationService>({ warn: message => { warnings.push(String(message)); } }));
		instantiation.stub(ITelemetryService, NullTelemetryService);
		instantiation.stub(ICommandService, upcastPartial<ICommandService>({
			executeCommand: async (id, ...args) => {
				if (id === OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID) {
					await instantiation.invokeFunction(accessor => new OpenWorkspaceInAgentsWindowAction().run(accessor, args[0] as { source?: AgentsWindowOpenSource; sessionResource?: URI; inputUri?: URI }));
				} else if (id === OpenChatSessionInAgentsWindowAction.ID) {
					await instantiation.invokeFunction(accessor => new OpenChatSessionInAgentsWindowAction().run(accessor, ...args));
				} else {
					const command = CommandsRegistry.getCommand(id);
					assert.ok(command);
					await instantiation.invokeFunction(accessor => command.handler(accessor, ...args));
				}
				return undefined;
			},
		}));
		return {
			instantiation, configuration, calls, warnings, focused, sessionsChanged, models, treatmentWarnings, treatmentNames, widget, inputUri,
			focusWidget: (value: IChatWidget | undefined) => { lastFocusedWidget = value; focused.fire(); },
			sendMessage: (timestamp = Date.now(), isSystemInitiated = false) => {
				const request = upcastPartial<IChatRequestModel>({ timestamp, isSystemInitiated });
				requests.push(request);
				hasRequests = true;
				requestInProgress.set(true, undefined);
				requestsChanged.fire({ kind: 'addRequest', request });
			},
			queueMessage: (timestamp = Date.now()) => {
				pendingRequests.push(upcastPartial<IChatPendingRequest>({ request: upcastPartial<IChatRequestModel>({ timestamp }) }));
				pendingRequestsChanged.fire();
			},
			set requestInProgress(value: boolean) { requestInProgress.set(value, undefined); },
			set readTreatment(value: (name: string) => Promise<string | undefined>) { readTreatment = value; },
			refetchTreatments: async () => { assignmentsRefetched.fire(); await timeout(0); },
			setTreatments: async (title?: string, description?: string) => {
				readTreatment = async name => name === titleTreatment ? title : name === descriptionTreatment ? description : undefined;
				assignmentsRefetched.fire();
				await timeout(0);
			},
			get resource() { return resource; },
			set resource(value: URI) { resource = value; focused.fire(); },
			get input() { return input; },
			set input(value: string) { input = value; },
			set hasRequests(value: boolean) { hasRequests = value; focused.fire(); },
			get attachments() { return attachments; },
			set attachments(value: IChatRequestVariableEntry[]) { attachments = value; },
			set status(value: AgentSessionStatus) { status = value; sessionsChanged.fire(); },
			set runningProviderType(value: string) { runningProviderType = value; sessionsChanged.fire(); },
			set allowed(value: boolean) { allowed = value; contextChanged.fire({ affectsSome: () => true, allKeysContainedIn: () => false }); },
			set viewContext(value: IChatWidget['viewContext']) { viewContext = value; focused.fire(); },
			get notification() { return [...notifications.values()].at(-1); },
			get posts() { return posts; },
			set openReady(value: Promise<void>) { openReady = value; },
			set workbenchState(value: WorkbenchState) { workbenchState = value; },
			showBanner: () => disposables.add(instantiation.createInstance(AgentsParallelWorkContribution)),
			showGenericTip: () => disposables.add(instantiation.createInstance(AgentsHandoffInputTipContribution)),
			dismiss: () => {
				const notification = [...notifications.values()].at(-1);
				assert.ok(notification);
				dismissed.fire(notification.id);
				notification.onDismiss?.();
			},
			click: async (index: number) => {
				const action = [...notifications.values()].at(-1)?.actions[index];
				assert.ok(action && action.kind === ChatInputNotificationActionKind.Command);
				const command = CommandsRegistry.getCommand(action.commandId);
				assert.ok(command);
				await instantiation.invokeFunction(accessor => command.handler(accessor, ...action.commandArgs ?? []));
			},
		};
	}

	test('defines handoff feature flags and an advanced experimental delay, not copy treatments', () => {
		const properties = agentsWindowHandoffConfigurationProperties;
		const delay = properties[ChatConfiguration.AgentsHandoffTipDelaySeconds];
		assert.deepStrictEqual({
			keys: Object.keys(properties),
			settings: Object.values(properties).map(property => ({ type: property.type, default: property.default, experiment: property.experiment })),
			delay: { minimum: delay.minimum, tags: delay.tags },
		}, {
			keys: [ChatConfiguration.OpenInAgentsWindowTransferDraft, ChatConfiguration.AgentsParallelWorkBannerEnabled, ChatConfiguration.AgentsHandoffTipDelaySeconds],
			settings: [
				{ type: 'boolean', default: product.quality === 'insider', experiment: { mode: 'auto' } },
				{ type: 'boolean', default: product.quality === 'insider', experiment: { mode: 'auto' } },
				{ type: 'number', default: 5, experiment: { mode: 'auto' } },
			],
			delay: { minimum: 0, tags: ['experimental', 'advanced'] },
		});
	});

	for (const surface of ['titleBar', 'chatTitle', 'command', 'workspace', 'chatSession'] as const) {
		test(`${surface} snapshots the current draft and retains the source`, async () => {
			const h = createHarness();
			h.input = 'Current prompt at invocation';
			const originalAttachments = h.attachments;
			await h.instantiation.invokeFunction(async accessor => {
				switch (surface) {
					case 'titleBar': return new OpenWorkspaceInAgentsWindowTitleBarAction().run(accessor);
					case 'chatTitle': return new OpenWorkspaceInAgentsWindowChatTitleAction().run(accessor, { $mid: MarshalledId.ChatViewContext, sessionResource: h.resource, inputUri: h.inputUri });
					case 'command': return new OpenAgentsWindowAction().run(accessor);
					case 'workspace': return new OpenWorkspaceInAgentsWindowAction().run(accessor);
					case 'chatSession': return new OpenChatSessionInAgentsWindowAction().run(accessor, h.resource);
				}
			});
			assert.deepStrictEqual({
				count: h.calls.length,
				folder: URI.revive(h.calls[0].folderUri)?.path,
				draft: h.calls[0].draft && reviveChatDraft(h.calls[0].draft),
				source: { inputText: h.input, attachments: h.attachments },
			}, {
				count: 1, folder: '/source',
				draft: { inputText: 'Current prompt at invocation', attachments: originalAttachments },
				source: { inputText: 'Current prompt at invocation', attachments: originalAttachments },
			});
		});
	}

	for (const surface of ['workspaceTitle', 'sessionTitle'] as const) {
		for (const inputState of ['available', 'closed', 'rebound'] as const) {
			test(`${surface} uses its input instance without falling back to a duplicate chat widget (${inputState})`, async () => {
				const h = createHarness();
				const inputUri = URI.from({ scheme: Schemas.vscodeChatInput, path: '/second-widget' });
				let secondSession = h.resource;
				let secondText = 'Second view draft';
				const secondAttachments = [toFileVariableEntry(URI.file('/source/second-view.ts'))];
				const second = upcastPartial<IChatWidget>({
					location: ChatAgentLocation.Chat,
					viewContext: {},
					scopedContextKeyService: h.widget.scopedContextKeyService,
					inputPart: upcastPartial<IChatWidget['inputPart']>({ inputUri }),
					get viewModel() { return upcastPartial<IChatViewModel>({ sessionResource: secondSession, model: upcastPartial<IChatModel>({ hasRequests: false }) }); },
					getInput: () => secondText,
					attachmentModel: upcastPartial<IChatWidget['attachmentModel']>({ attachments: secondAttachments }),
				});
				let inputLookups = 0;
				let resourceLookups = 0;
				h.instantiation.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
					lastFocusedWidget: h.widget,
					getWidgetByInputUri: uri => {
						inputLookups++;
						return inputState !== 'closed' && isEqual(uri, inputUri) ? second : undefined;
					},
					getWidgetBySessionResource: () => { resourceLookups++; return h.widget; },
				}));
				const pane: ChatViewPane = Object.assign(Object.create(ChatViewPane.prototype), { _widget: second });
				const context = pane.getActionsContext();
				assert.ok(context);
				secondText = 'Latest second-view edit';
				if (inputState === 'rebound') {
					secondSession = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-another-chat' });
				}
				await h.instantiation.invokeFunction(accessor => surface === 'workspaceTitle'
					? new OpenWorkspaceInAgentsWindowChatTitleAction().run(accessor, context)
					: new OpenChatSessionInAgentsWindowAction().run(accessor, context));
				assert.deepStrictEqual({
					contextInput: context.inputUri, inputLookups, resourceLookups,
					draft: h.calls[0].draft && reviveChatDraft(h.calls[0].draft),
					firstRetained: h.input, secondRetained: secondText,
				}, {
					contextInput: inputUri, inputLookups: 1, resourceLookups: 0,
					draft: inputState === 'available' ? { inputText: secondText, attachments: secondAttachments } : undefined,
					firstRetained: 'Original prompt', secondRetained: 'Latest second-view edit',
				});
			});
		}
	}

	test('retains resource-only fallback while no-argument session opens use the last focused input', async () => {
		const h = createHarness();
		const inputUri = URI.from({ scheme: Schemas.vscodeChatInput, path: '/second-widget' });
		const second = upcastPartial<IChatWidget>({
			location: ChatAgentLocation.Chat, viewContext: {},
			viewModel: h.widget.viewModel,
			inputPart: upcastPartial<IChatWidget['inputPart']>({ inputUri }),
			scopedContextKeyService: h.widget.scopedContextKeyService,
			getInput: () => 'Last focused draft',
			attachmentModel: upcastPartial<IChatWidget['attachmentModel']>({ attachments: [] }),
		});
		h.instantiation.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
			lastFocusedWidget: second,
			getWidgetByInputUri: uri => isEqual(uri, inputUri) ? second : undefined,
			getWidgetBySessionResource: () => h.widget,
		}));
		await h.instantiation.invokeFunction(accessor => new OpenWorkspaceInAgentsWindowChatTitleAction().run(accessor, {
			$mid: MarshalledId.ChatViewContext, sessionResource: h.resource,
		}));
		await h.instantiation.invokeFunction(accessor => new OpenChatSessionInAgentsWindowAction().run(accessor, h.resource));
		await h.instantiation.invokeFunction(accessor => new OpenChatSessionInAgentsWindowAction().run(accessor));
		assert.deepStrictEqual(h.calls.map(call => call.draft?.inputText), [
			'Original prompt', 'Original prompt', 'Last focused draft',
		]);
	});

	for (const transfer of [false, true]) {
		for (const reveal of [false, true]) {
			test(`draft transfer is independent of session reveal (transfer=${transfer}, reveal=${reveal})`, async () => {
				const h = createHarness({ transfer, reveal });
				await h.instantiation.invokeFunction(accessor => new OpenWorkspaceInAgentsWindowTitleBarAction().run(accessor));
				h.resource = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/persisted' });
				await h.instantiation.invokeFunction(accessor => new OpenWorkspaceInAgentsWindowTitleBarAction().run(accessor));
				assert.deepStrictEqual(h.calls.map(call => ({ draft: !!call.draft, session: URI.revive(call.sessionResource)?.path })), [
					{ draft: transfer, session: undefined },
					{ draft: false, session: reveal ? '/persisted' : undefined },
				]);
			});
		}
	}

	for (const session of [
		{ name: 'built-in local Chat', resource: LocalChatSessionUri.getNewSessionUri(), invitation: false },
		{ name: 'local chat-editor resource', resource: URI.from({ scheme: Schemas.vscodeChatEditor, path: '/new-editor-chat' }), invitation: false },
		{ name: 'cloud agent', resource: URI.from({ scheme: SessionType.CopilotCloud, path: '/untitled-draft' }), invitation: false },
		{ name: 'extension agent', resource: URI.from({ scheme: 'extension-agent', path: '/untitled-draft' }), invitation: false },
		{ name: 'Agent Host Copilot', resource: URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-draft' }), invitation: true },
		{ name: 'Agent Host Claude', resource: URI.from({ scheme: SessionType.AgentHostClaude, path: '/untitled-draft' }), invitation: true },
		{ name: 'Agent Host Codex', resource: URI.from({ scheme: SessionType.AgentHostCodex, path: '/untitled-draft' }), invitation: true },
		{ name: 'remote Agent Host', resource: URI.from({ scheme: 'remote-test-claude', path: '/untitled-draft' }), invitation: true },
	]) {
		for (const surface of ['view', 'editor'] as const) {
			test(`transfers unsent drafts but invites only Agent Host chats: ${session.name} in a normal chat ${surface}`, async () => {
				const h = createHarness();
				h.resource = session.resource;
				h.viewContext = surface === 'view' ? { viewId: 'workbench.panel.chat.view' } : {};
				h.showBanner();
				const invitationBeforeSend = !!h.notification;
				await h.instantiation.invokeFunction(accessor => new OpenAgentsWindowAction().run(accessor));
				h.hasRequests = true;
				await h.instantiation.invokeFunction(accessor => new OpenAgentsWindowAction().run(accessor));
				assert.deepStrictEqual({
					drafts: h.calls.map(call => !!call.draft),
					invitationBeforeSend,
					invitationAfterSend: h.notification,
					source: h.input,
				}, {
					drafts: [true, false], invitationBeforeSend: session.invitation, invitationAfterSend: undefined, source: 'Original prompt',
				});
			});
		}
	}

	test('preserves explicit caller folder, session and draft arguments instead of inferring the current draft', async () => {
		const h = createHarness({ reveal: true });
		const targets: IOpenAgentsWindowOptions[] = [
			{ folderUri: URI.file('/explicit-workspace') },
			{ sessionResource: URI.from({ scheme: SessionType.AgentHostCopilot, path: '/explicit-session' }) },
			{ folderUri: URI.file('/explicit-workspace'), sessionResource: URI.from({ scheme: SessionType.AgentHostCopilot, path: '/explicit-session' }) },
			{ folderUri: URI.file('/explicit-workspace'), folderUriIsDefault: true, draft: { inputText: 'Explicit caller draft', attachments: '[]' } },
		];
		for (const target of targets) {
			await h.instantiation.invokeFunction(accessor => new OpenAgentsWindowAction().run(accessor, target));
		}
		assert.deepStrictEqual(h.calls, targets.map(target => ({ ...target, source: AgentsWindowOpenSource.CommandPalette })));
	});

	test('does not treat a persisted contributed session awaiting its history as a new unsent chat', async () => {
		const h = createHarness({ reveal: true });
		h.resource = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/persisted' });
		h.showBanner();
		await h.instantiation.invokeFunction(accessor => new OpenWorkspaceInAgentsWindowTitleBarAction().run(accessor));
		assert.deepStrictEqual({
			draft: h.calls[0].draft,
			session: URI.revive(h.calls[0].sessionResource)?.path,
			invitation: h.notification,
		}, { draft: undefined, session: '/persisted', invitation: undefined });
	});

	test('repeated opens snapshot independently and never clear newer source edits', async () => {
		const h = createHarness();
		const opened = new DeferredPromise<void>();
		h.openReady = opened.p;
		const first = h.instantiation.invokeFunction(accessor => new OpenAgentsWindowAction().run(accessor));
		h.input = 'Newer source edit';
		h.attachments = [];
		const second = h.instantiation.invokeFunction(accessor => new OpenAgentsWindowAction().run(accessor));
		await opened.complete();
		await Promise.all([first, second]);
		assert.deepStrictEqual({
			prompts: h.calls.map(call => call.draft?.inputText),
			source: { inputText: h.input, attachments: h.attachments },
		}, {
			prompts: ['Original prompt', 'Newer source edit'],
			source: { inputText: 'Newer source edit', attachments: [] },
		});
	});

	test('does not transfer from hidden AI, inline chat or Quick Chat', async () => {
		const h = createHarness();
		h.allowed = false;
		await h.instantiation.invokeFunction(accessor => new OpenAgentsWindowAction().run(accessor));
		h.allowed = true;
		h.viewContext = { isInlineChat: true };
		await h.instantiation.invokeFunction(accessor => new OpenAgentsWindowAction().run(accessor));
		h.viewContext = { isQuickChat: true };
		await h.instantiation.invokeFunction(accessor => new OpenAgentsWindowAction().run(accessor));
		assert.deepStrictEqual(h.calls.map(call => call.draft), [undefined, undefined, undefined]);
	});

	test('captures an untitled editor attachment from the source window model', async () => {
		const h = createHarness();
		const resource = URI.from({ scheme: Schemas.untitled, path: '/Unsaved-1' });
		const model = disposables.add(createTextModel('Unsaved source contents', 'plaintext', undefined, resource));
		h.models.set(resource, model);
		h.attachments = [toFileVariableEntry(resource)];
		await h.instantiation.invokeFunction(accessor => new OpenAgentsWindowAction().run(accessor));
		const draft = h.calls[0].draft && reviveChatDraft(h.calls[0].draft);
		assert.deepStrictEqual({
			destination: draft?.attachments.map(entry => ({ kind: entry.kind, text: entry.value })),
			source: h.attachments[0].value,
			model: model.getValue(), warnings: h.warnings,
		}, {
			destination: [{ kind: 'paste', text: 'Unsaved source contents' }],
			source: resource, model: 'Unsaved source contents', warnings: [],
		});
	});

	test('warns and retains the source when an untitled attachment has no loaded model', async () => {
		const h = createHarness();
		h.attachments = [toFileVariableEntry(URI.from({ scheme: Schemas.untitled, path: '/Unavailable' }))];
		await h.instantiation.invokeFunction(accessor => new OpenAgentsWindowAction().run(accessor));
		assert.deepStrictEqual({ warnings: h.warnings.length, draft: h.calls[0].draft, isDefault: h.calls[0].folderUriIsDefault, attachments: h.attachments.length }, {
			warnings: 1, draft: undefined, isDefault: true, attachments: 1,
		});
	});

	test('reports untransferable context and opens without losing or retargeting a destination draft', async () => {
		const h = createHarness();
		h.attachments = [{ kind: 'string', id: 'unresolved', name: 'Context', value: undefined, uri: URI.parse('context:/item'), handle: 7 }];
		await h.instantiation.invokeFunction(accessor => new OpenWorkspaceInAgentsWindowAction().run(accessor));
		assert.deepStrictEqual({ warnings: h.warnings.length, draft: h.calls[0].draft, isDefault: h.calls[0].folderUriIsDefault, retained: h.attachments.length }, {
			warnings: 1, draft: undefined, isDefault: true, retained: 1,
		});
	});

	for (const provider of [
		{ type: SessionType.AgentHostCopilot, invitation: true },
		{ type: SessionType.AgentHostClaude, invitation: true },
		{ type: SessionType.AgentHostCodex, invitation: true },
		{ type: 'remote-test-copilotcli', invitation: true },
		{ type: SessionType.Local, invitation: false },
		{ type: SessionType.CopilotCLI, invitation: false },
		{ type: SessionType.CopilotCloud, invitation: false },
		{ type: SessionType.Codex, invitation: false },
		{ type: 'extension-agent', invitation: false },
	]) {
		test(`requires an actively running Agent Host provider in the Sessions list: ${provider.type}`, () => {
			const h = createHarness({ runningProviderType: provider.type });
			h.showBanner();
			assert.deepStrictEqual({ shown: !!h.notification, ordinaryTransferEnabled: h.configuration.getValue(ChatConfiguration.OpenInAgentsWindowTransferDraft) }, {
				shown: provider.invitation, ordinaryTransferEnabled: true,
			});
		});
	}

	test('a non-Agent Host running session does not make an existing draft eligible when an Agent Host later starts', () => {
		const h = createHarness({ runningProviderType: SessionType.Local });
		h.showBanner();
		const nonAgentHost = h.notification;
		h.runningProviderType = SessionType.AgentHostCopilot;
		h.focused.fire();
		const existingDraft = h.notification;
		h.resource = URI.from({ scheme: SessionType.AgentHostClaude, path: '/untitled-next' });
		const newDraft = !!h.notification;
		h.runningProviderType = SessionType.CopilotCloud;
		assert.deepStrictEqual({ nonAgentHost, existingDraft, newDraft, afterAgentHostStops: h.notification }, {
			nonAgentHost: undefined, existingDraft: undefined, newDraft: true, afterAgentHostStops: undefined,
		});
	});

	test('invitation requires a new draft transition while an Agent Host catalog session is actively running', () => {
		const h = createHarness({ running: false });
		h.showBanner();
		h.status = AgentSessionStatus.InProgress;
		h.focused.fire();
		const existingDraft = h.notification;
		h.resource = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-second' });
		const running = !!h.notification;
		h.status = AgentSessionStatus.NeedsInput;
		assert.deepStrictEqual({ existingDraft, running, waiting: h.notification }, { existingDraft: undefined, running: true, waiting: undefined });
	});

	test('X stays dismissed for this draft through repeated events and copy changes', async () => {
		const h = createHarness();
		h.showBanner();
		h.focused.fire();
		h.sessionsChanged.fire();
		const initialPosts = h.posts;
		h.dismiss();
		await h.setTreatments('A different title');
		h.input = 'Typed after dismissal';
		h.focused.fire();
		h.sessionsChanged.fire();
		const dismissed = h.notification;
		h.resource = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-next' });
		const next = h.notification?.message;
		h.resource = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-draft' });
		assert.deepStrictEqual({ initialPosts, dismissed, next, returned: h.notification }, {
			initialPosts: 1, dismissed: undefined, next: 'A different title', returned: undefined,
		});
	});

	test('Ignore persistently disables invitations for subsequent new chats', async () => {
		const h = createHarness();
		h.showBanner();
		await h.click(1);
		h.resource = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-next' });
		assert.deepStrictEqual({ enabled: h.configuration.getValue(ChatConfiguration.AgentsParallelWorkBannerEnabled), notification: h.notification, updates: h.configuration.updates }, {
			enabled: false, notification: undefined,
			updates: [{ key: ChatConfiguration.AgentsParallelWorkBannerEnabled, value: false, target: ConfigurationTarget.USER }],
		});
	});

	test('does not replace a dismissed parallel invitation with the generic empty-workspace tip', () => {
		const h = createHarness();
		h.workbenchState = WorkbenchState.EMPTY;
		h.showGenericTip();
		h.showBanner();
		const invitation = h.notification?.id;
		h.dismiss();
		h.sessionsChanged.fire();
		const dismissed = h.notification;
		h.resource = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/persisted' });
		h.sendMessage(Date.now() - 5000);
		assert.deepStrictEqual({ invitation, dismissed, persisted: h.notification?.id }, {
			invitation: 'chat.agentsParallelWork', dismissed: undefined, persisted: 'chat.agentsHandoff.openInAgentsWindow',
		});
	});

	test('non-Agent Host activity does not suppress the generic empty-workspace tip', () => {
		const h = createHarness({ runningProviderType: SessionType.CopilotCloud });
		h.workbenchState = WorkbenchState.EMPTY;
		h.showGenericTip();
		h.showBanner();
		assert.strictEqual(h.notification?.id, 'chat.agentsHandoff.openInAgentsWindow');
	});

	test('switches between the generic tip and invitation when its experiment changes', async () => {
		const h = createHarness({ banner: false });
		h.workbenchState = WorkbenchState.EMPTY;
		h.showGenericTip();
		h.showBanner();
		const initial = h.notification?.id;
		await h.configuration.updateValue(ChatConfiguration.AgentsParallelWorkBannerEnabled, true);
		const enabled = h.notification?.id;
		await h.configuration.updateValue(ChatConfiguration.AgentsParallelWorkBannerEnabled, false);
		assert.deepStrictEqual({ initial, enabled, disabled: h.notification?.id }, {
			initial: 'chat.agentsHandoff.openInAgentsWindow',
			enabled: 'chat.agentsParallelWork',
			disabled: 'chat.agentsHandoff.openInAgentsWindow',
		});
	});

	suite('handoff tip eligibility', () => {
		for (const sessionType of agentHostSessionTypes) {
			test(`renders only for the target ${sessionType} session and hands off that session`, async () => {
				const h = createHarness({ banner: false });
				h.resource = URI.from({ scheme: sessionType, path: '/persisted' });
				h.sendMessage(Date.now() - 5000);
				h.showGenericTip();
				const notification = h.notification;
				assert.ok(notification);
				await h.click(0);

				assert.deepStrictEqual({
					sessionTypes: notification.sessionTypes,
					appliesToTarget: isChatInputNotificationApplicableToSession(notification, sessionType, h.resource),
					appliesToOtherSession: isChatInputNotificationApplicableToSession(notification, sessionType, h.resource.with({ path: '/other-session' })),
					appliesToExtensionCli: isChatInputNotificationApplicableToSession(notification, SessionType.CopilotCLI, URI.from({ scheme: SessionType.CopilotCLI, path: '/persisted' })),
					opens: h.calls.map(call => ({ source: call.source, sessionResource: URI.revive(call.sessionResource)?.toString() })),
				}, {
					sessionTypes: [sessionType],
					appliesToTarget: true,
					appliesToOtherSession: false,
					appliesToExtensionCli: false,
					opens: [{ source: 'currentChatHandoff', sessionResource: h.resource.toString() }],
				});
			});
		}

		for (const sessionType of [SessionType.CopilotCLI, SessionType.Local, SessionType.CopilotCloud, SessionType.Codex, 'extension-agent']) {
			for (const workbenchState of [WorkbenchState.FOLDER, WorkbenchState.EMPTY]) {
				test(`does not offer a handoff for ${sessionType} in ${workbenchState === WorkbenchState.EMPTY ? 'an empty workspace' : 'a folder'}`, async () => {
					await runWithFakedTimers({ useFakeTimers: true, startTime: 10_000 }, async () => {
						const h = createHarness({ banner: false });
						h.resource = sessionType === SessionType.Local
							? LocalChatSessionUri.forSession('persisted')
							: URI.from({ scheme: sessionType, path: '/persisted' });
						h.workbenchState = workbenchState;
						h.showGenericTip();
						h.sendMessage();
						await timeout(5000);
						h.focused.fire();

						assert.deepStrictEqual({ notification: h.notification, posts: h.posts }, { notification: undefined, posts: 0 });
					});
				});
			}
		}

		test('removes the handoff when switching to extension-backed Copilot CLI', () => {
			const h = createHarness({ banner: false });
			h.resource = URI.from({ scheme: SessionType.AgentHostClaude, path: '/persisted' });
			h.sendMessage(Date.now() - 5000);
			h.showGenericTip();
			const initial = h.notification?.id;
			h.resource = URI.from({ scheme: SessionType.CopilotCLI, path: '/extension-session' });

			assert.deepStrictEqual({ initial, notification: h.notification }, {
				initial: 'chat.agentsHandoff.openInAgentsWindow', notification: undefined,
			});
		});
	});

	suite('handoff tip delay', () => {
		function createTimedHandoff(delaySeconds = DEFAULT_AGENTS_HANDOFF_TIP_DELAY_SECONDS) {
			const h = createHarness({ banner: false, handoffDelaySeconds: delaySeconds });
			h.resource = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/persisted' });
			return h;
		}

		for (const sessionType of agentHostSessionTypes) {
			test(`shows after exactly five seconds and hides when ${sessionType} stops running`, async () => {
				await runWithFakedTimers({ useFakeTimers: true, startTime: 10_000 }, async () => {
					const h = createTimedHandoff();
					h.resource = URI.from({ scheme: sessionType, path: '/persisted' });
					h.showGenericTip();
					h.sendMessage();
					const visible = [!!h.notification];
					await timeout(4999);
					visible.push(!!h.notification);
					h.focused.fire();
					await timeout(1);
					visible.push(!!h.notification);
					h.requestInProgress = false;
					visible.push(!!h.notification);

					assert.deepStrictEqual(visible, [false, false, true, false]);
				});
			});
		}

		test('does not show for a request that finishes before the deadline', async () => {
			await runWithFakedTimers({ useFakeTimers: true, startTime: 10_000 }, async () => {
				const h = createTimedHandoff();
				h.sendMessage();
				h.showGenericTip();
				await timeout(4999);
				h.requestInProgress = false;
				await timeout(10_000);

				assert.deepStrictEqual({ notification: h.notification, posts: h.posts }, { notification: undefined, posts: 0 });
			});
		});

		for (const messageKind of ['request', 'pending'] as const) {
			test(`measures from the most recent ${messageKind} message, not the first one`, async () => {
				await runWithFakedTimers({ useFakeTimers: true, startTime: 10_000 }, async () => {
					const h = createTimedHandoff();
					h.sendMessage();
					h.showGenericTip();
					await timeout(4000);
					if (messageKind === 'request') {
						h.sendMessage();
					} else {
						h.queueMessage();
					}
					await timeout(1000);
					const visible = [!!h.notification];
					await timeout(3999);
					visible.push(!!h.notification);
					await timeout(1);
					visible.push(!!h.notification);
					h.sendMessage();
					visible.push(!!h.notification);
					await timeout(5000);
					visible.push(!!h.notification);

					assert.deepStrictEqual(visible, [false, false, true, false, true]);
				});
			});
		}

		test('uses the message timestamp rather than when the session is focused', async () => {
			await runWithFakedTimers({ useFakeTimers: true, startTime: 10_000 }, async () => {
				const h = createTimedHandoff();
				h.sendMessage(Date.now() - 4000);
				h.showGenericTip();
				await timeout(999);
				const before = h.notification;
				await timeout(1);

				assert.deepStrictEqual({ before, visible: !!h.notification }, { before: undefined, visible: true });
			});
		});

		for (const seconds of [0, 0.25, 10]) {
			test(`honors a configured delay of ${seconds} seconds`, async () => {
				await runWithFakedTimers({ useFakeTimers: true, startTime: 10_000 }, async () => {
					const h = createTimedHandoff(seconds);
					h.sendMessage();
					h.showGenericTip();
					const initial = !!h.notification;
					if (seconds > 0) {
						await timeout(seconds * 1000 - 1);
					}
					const beforeDeadline = !!h.notification;
					if (seconds > 0) {
						await timeout(1);
					}

					assert.deepStrictEqual({ initial, beforeDeadline, atDeadline: !!h.notification }, {
						initial: seconds === 0, beforeDeadline: seconds === 0, atDeadline: true,
					});
				});
			});
		}

		test('recalculates a changed delay from the original send time', async () => {
			await runWithFakedTimers({ useFakeTimers: true, startTime: 10_000 }, async () => {
				const h = createTimedHandoff();
				h.sendMessage();
				h.showGenericTip();
				await timeout(2000);
				await h.configuration.updateValue(ChatConfiguration.AgentsHandoffTipDelaySeconds, 10);
				await timeout(3000);
				const visible = [!!h.notification];
				await h.configuration.updateValue(ChatConfiguration.AgentsHandoffTipDelaySeconds, 3);
				visible.push(!!h.notification);
				await h.configuration.updateValue(ChatConfiguration.AgentsHandoffTipDelaySeconds, 8);
				visible.push(!!h.notification);
				await timeout(2999);
				visible.push(!!h.notification);
				await timeout(1);
				visible.push(!!h.notification);

				assert.deepStrictEqual(visible, [false, true, false, false, true]);
			});
		});

		test('switches timers and progress tracking to the newly focused session', async () => {
			await runWithFakedTimers({ useFakeTimers: true, startTime: 10_000 }, async () => {
				const h = createTimedHandoff();
				h.sendMessage();
				h.showGenericTip();
				await timeout(2000);
				const other = createTimedHandoff();
				other.resource = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/other-session' });
				other.sendMessage();
				h.focusWidget(other.widget);
				await timeout(3000);
				const visible = [!!h.notification];
				h.requestInProgress = false;
				await timeout(1999);
				visible.push(!!h.notification);
				await timeout(1);
				visible.push(!!h.notification);
				other.requestInProgress = false;
				visible.push(!!h.notification);

				assert.deepStrictEqual(visible, [false, false, true, false]);
			});
		});

		test('treatment refreshes do not restart the delay', async () => {
			await runWithFakedTimers({ useFakeTimers: true, startTime: 10_000 }, async () => {
				const h = createTimedHandoff();
				h.sendMessage();
				h.showGenericTip();
				await timeout(4000);
				h.readTreatment = async () => 'Treatment copy';
				await h.refetchTreatments();
				await timeout(999);
				const before = h.notification;
				await timeout(1);

				assert.deepStrictEqual({ before, title: h.notification?.message, description: h.notification?.description }, {
					before: undefined, title: 'Treatment copy', description: 'Treatment copy',
				});
			});
		});

		test('only user messages start or reset the delay', async () => {
			await runWithFakedTimers({ useFakeTimers: true, startTime: 10_000 }, async () => {
				const h = createTimedHandoff();
				h.showGenericTip();
				h.sendMessage(Date.now(), true);
				await timeout(5000);
				const systemOnly = h.notification;
				h.sendMessage();
				await timeout(4000);
				h.sendMessage(Date.now(), true);
				await timeout(1000);

				assert.deepStrictEqual({ systemOnly, visible: !!h.notification }, { systemOnly: undefined, visible: true });
			});
		});

		for (const action of ['hide', 'disable', 'switch', 'unfocus', 'dispose'] as const) {
			test(`cancels a pending handoff after ${action}`, async () => {
				await runWithFakedTimers({ useFakeTimers: true, startTime: 10_000 }, async () => {
					const h = createTimedHandoff();
					h.sendMessage();
					const contribution = h.showGenericTip();
					await timeout(4000);
					switch (action) {
						case 'hide':
							await h.configuration.updateValue(ChatConfiguration.AgentsHandoffTipMode, 'hidden');
							break;
						case 'disable':
							h.allowed = false;
							break;
						case 'switch':
							h.resource = LocalChatSessionUri.forSession('other');
							break;
						case 'unfocus':
							h.focusWidget(undefined);
							break;
						case 'dispose':
							contribution.dispose();
							break;
					}
					await timeout(10_000);

					assert.deepStrictEqual({ notification: h.notification, posts: h.posts }, { notification: undefined, posts: 0 });
				});
			});
		}

		for (const invalidDelay of [-1, 'invalid', Number.NaN, Number.POSITIVE_INFINITY]) {
			test(`logs and uses five seconds for invalid delay ${invalidDelay}`, async () => {
				await runWithFakedTimers({ useFakeTimers: true, startTime: 10_000 }, async () => {
					const h = createTimedHandoff();
					await h.configuration.updateValue(ChatConfiguration.AgentsHandoffTipDelaySeconds, invalidDelay);
					h.sendMessage();
					h.showGenericTip();
					await timeout(4999);
					const before = h.notification;
					await timeout(1);

					assert.deepStrictEqual({ before, visible: !!h.notification, warnings: h.treatmentWarnings.length }, {
						before: undefined, visible: true, warnings: 1,
					});
				});
			});
		}
	});

	suite('handoff tip copy treatments', () => {
		const handoffTitleTreatment = 'chatAgentsHandoffTipTitle';
		const handoffDescriptionTreatment = 'chatAgentsHandoffTipDescription';
		const defaultHandoffTitle = 'Continue this session in the Agents Window';
		const defaultHandoffDescription = 'Get a dedicated, multi-pane view alongside your workspace.';

		function createHandoffHarness() {
			const h = createHarness({ banner: false });
			h.resource = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/persisted' });
			h.sendMessage(Date.now() - 5000);
			return h;
		}

		for (const context of [
			{ name: 'default', mode: 'default', emptyWorkspace: false, title: defaultHandoffTitle, description: defaultHandoffDescription, action: 'Continue in Agents Window' },
			{ name: 'custom', mode: 'custom', emptyWorkspace: false, title: defaultHandoffTitle, description: 'Free with your Copilot plan \u2014 get a dedicated, multi-pane view alongside your workspace.', action: 'Give your agent more room?' },
			{ name: 'empty workspace', mode: 'default', emptyWorkspace: true, title: 'Copilot isn\'t available without an open folder', description: 'Open the Agents Window to start a Copilot session.', action: 'Open in Agents Window' },
		]) {
			for (const treatment of [
				{ name: 'unassigned copy', title: undefined, description: undefined },
				{ name: 'title only', title: 'Treatment title', description: undefined },
				{ name: 'body only', title: undefined, description: 'Treatment body' },
				{ name: 'both strings', title: 'Treatment title', description: 'Treatment body' },
			]) {
				test(`reads ${treatment.name} directly from assignments with ${context.name} fallbacks`, async () => {
					const h = createHandoffHarness();
					await h.configuration.updateValue(ChatConfiguration.AgentsHandoffTipMode, context.mode);
					if (context.emptyWorkspace) {
						h.resource = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-draft' });
						h.hasRequests = false;
						h.workbenchState = WorkbenchState.EMPTY;
					}
					h.readTreatment = async name => name === handoffTitleTreatment ? treatment.title : name === handoffDescriptionTreatment ? treatment.description : undefined;
					h.showGenericTip();
					await timeout(0);

					assert.deepStrictEqual({
						queries: h.treatmentNames,
						title: h.notification?.message,
						description: h.notification?.description,
						action: h.notification?.actions[0]?.label,
						warnings: h.treatmentWarnings,
					}, {
						queries: [handoffTitleTreatment, handoffDescriptionTreatment],
						title: treatment.title ?? context.title,
						description: treatment.description ?? context.description,
						action: context.action,
						warnings: [],
					});
				});
			}
		}

		test('updates the same session on refetch and restores defaults without reposting unchanged copy', async () => {
			const h = createHandoffHarness();
			let title: string | undefined;
			let description: string | undefined;
			h.readTreatment = async name => name === handoffTitleTreatment ? title : name === handoffDescriptionTreatment ? description : undefined;
			h.showGenericTip();
			await timeout(0);
			title = 'Updated title';
			description = 'Updated body';
			await h.refetchTreatments();
			const updated = { title: h.notification?.message, description: h.notification?.description };
			await h.refetchTreatments();
			h.focused.fire();
			title = undefined;
			description = undefined;
			await h.refetchTreatments();
			title = defaultHandoffTitle;
			description = defaultHandoffDescription;
			await h.refetchTreatments();

			assert.deepStrictEqual({
				updated, title: h.notification?.message, description: h.notification?.description, posts: h.posts,
			}, {
				updated: { title: 'Updated title', description: 'Updated body' },
				title: defaultHandoffTitle, description: defaultHandoffDescription, posts: 3,
			});
		});

		test('assigned copy does not enable a hidden tip', async () => {
			const h = createHandoffHarness();
			await h.configuration.updateValue(ChatConfiguration.AgentsHandoffTipMode, 'hidden');
			h.readTreatment = async name => name === handoffTitleTreatment ? 'Treatment title' : 'Treatment body';
			h.showGenericTip();
			await timeout(0);
			const hidden = h.notification;
			await h.configuration.updateValue(ChatConfiguration.AgentsHandoffTipMode, 'default');

			assert.deepStrictEqual({ hidden, title: h.notification?.message, description: h.notification?.description }, {
				hidden: undefined, title: 'Treatment title', description: 'Treatment body',
			});
		});

		for (const action of ['dismiss', 'open', 'mute', 'hide', 'dispose'] as const) {
			test(`late assignments cannot reshow the tip after ${action}`, async () => {
				const h = createHandoffHarness();
				const pending = new DeferredPromise<string | undefined>();
				h.readTreatment = () => pending.p;
				const contribution = h.showGenericTip();
				switch (action) {
					case 'dismiss':
						h.dismiss();
						break;
					case 'open':
						await h.click(0);
						break;
					case 'mute': {
						const commandId = h.notification?.mute?.commandId;
						assert.ok(commandId);
						await h.instantiation.invokeFunction(accessor => accessor.get(ICommandService).executeCommand(commandId));
						break;
					}
					case 'hide':
						await h.configuration.updateValue(ChatConfiguration.AgentsHandoffTipMode, 'hidden');
						break;
					case 'dispose':
						contribution.dispose();
						break;
				}
				const posts = h.posts;
				await pending.complete('Late treatment');
				await h.refetchTreatments();
				h.resource = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/another-session' });

				assert.deepStrictEqual({ notification: h.notification, posts: h.posts, warnings: h.treatmentWarnings }, {
					notification: undefined, posts, warnings: [],
				});
			});
		}
	});

	for (const source of ['currentChatHandoff', 'emptyWorkspaceCurrentChatHandoff', 'parallelWorkEmptyChatHandoff'] as const) {
		test(`opens the Agents window with the ${source} telemetry source`, async () => {
			const h = createHarness({ banner: source !== 'emptyWorkspaceCurrentChatHandoff' });
			if (source === 'currentChatHandoff') {
				h.resource = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/persisted' });
				h.sendMessage(Date.now() - 5000);
				h.showGenericTip();
			} else if (source === 'emptyWorkspaceCurrentChatHandoff') {
				h.workbenchState = WorkbenchState.EMPTY;
				h.showGenericTip();
			} else {
				h.showBanner();
			}
			await h.click(0);

			assert.deepStrictEqual(h.calls.map(call => ({
				source: call.source,
				accepted: isAgentsWindowOpenSource(call.source),
				sessionResource: URI.revive(call.sessionResource)?.toString(),
			})), [{
				source,
				accepted: true,
				sessionResource: source === 'currentChatHandoff' ? h.resource.toString() : undefined,
			}]);
		});
	}

	test('banner uses click-time content and forces transfer while the ordinary setting is off', async () => {
		const h = createHarness({ transfer: false });
		h.showBanner();
		h.input = 'Written after the banner appeared';
		h.attachments = [{ kind: 'image', id: 'new-image', name: 'New image', value: new Uint8Array([9, 8, 7]) }];
		await h.click(0);
		const draft = h.calls[0].draft && reviveChatDraft(h.calls[0].draft);
		const image = draft?.attachments[0].value;
		assert.deepStrictEqual({
			text: draft?.inputText,
			attachmentIds: draft?.attachments.map(attachment => attachment.id),
			image: image instanceof Uint8Array ? [...image] : undefined,
			source: h.calls[0].source,
			retained: h.input,
			notification: h.notification,
		}, {
			text: h.input, attachmentIds: ['new-image'], image: [9, 8, 7],
			source: AgentsWindowOpenSource.ParallelWorkEmptyChatHandoff,
			retained: 'Written after the banner appeared',
			notification: undefined,
		});
	});

	for (const change of ['source', 'hidden'] as const) {
		test(`a stale banner action does not open Agents after its ${change} eligibility changes`, async () => {
			const h = createHarness();
			h.showBanner();
			const action = h.notification?.actions[0];
			assert.ok(action && action.kind === ChatInputNotificationActionKind.Command);
			if (change === 'source') {
				h.resource = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/persisted' });
			} else {
				h.allowed = false;
			}
			const command = CommandsRegistry.getCommand(action.commandId);
			assert.ok(command);
			await h.instantiation.invokeFunction(accessor => command.handler(accessor, ...action.commandArgs ?? []));
			assert.deepStrictEqual(h.calls, []);
		});
	}

	test('invitation respects AI gates and independent title and body treatments', async () => {
		const h = createHarness();
		h.allowed = false;
		h.showBanner();
		const hidden = h.notification;
		await h.setTreatments('Experiment title', 'Experiment body');
		h.allowed = true;
		assert.deepStrictEqual({
			hidden,
			title: h.notification?.message,
			body: h.notification?.description,
			actions: h.notification?.actions.map(action => ({ label: action.label, primary: action.primary, tooltip: action.tooltip })),
			scoped: h.notification?.sessionResources,
		}, {
			hidden: undefined, title: 'Experiment title', body: 'Experiment body',
			actions: [
				{ label: 'Open Agents Window', primary: true, tooltip: undefined },
				{ label: 'Ignore', primary: false, tooltip: 'Don\'t Show Again' },
			],
			scoped: [h.resource],
		});
	});

	for (const scenario of [
		{ name: 'unassigned copy', title: undefined, description: undefined },
		{ name: 'title only', title: 'Treatment title', description: undefined },
		{ name: 'body only', title: undefined, description: 'Treatment body' },
		{ name: 'both strings', title: 'Treatment title', description: 'Treatment body' },
	]) {
		test(`reads copy directly from treatments with localized fallbacks: ${scenario.name}`, async () => {
			const h = createHarness();
			h.readTreatment = async name => name === titleTreatment ? scenario.title : name === descriptionTreatment ? scenario.description : undefined;
			h.showBanner();
			await timeout(0);
			assert.deepStrictEqual({
				queries: h.treatmentNames, title: h.notification?.message, description: h.notification?.description, warnings: h.treatmentWarnings,
			}, {
				queries: [titleTreatment, descriptionTreatment],
				title: scenario.title ?? defaultTitle, description: scenario.description ?? defaultDescription, warnings: [],
			});
		});
	}

	test('uses defaults when assignments are removed and does not repost unchanged copy', async () => {
		const h = createHarness();
		h.showBanner();
		await h.setTreatments('Treatment title', 'Treatment body');
		const posts = h.posts;
		await h.refetchTreatments();
		h.focused.fire();
		const unchanged = h.posts === posts;
		await h.setTreatments();
		assert.deepStrictEqual({ unchanged, title: h.notification?.message, description: h.notification?.description }, {
			unchanged: true, title: defaultTitle, description: defaultDescription,
		});
	});

	test('falls back and logs invalid blank treatment strings', async () => {
		const h = createHarness();
		h.showBanner();
		await h.setTreatments('', '   ');
		assert.deepStrictEqual({ title: h.notification?.message, description: h.notification?.description, warnings: h.treatmentWarnings.length }, {
			title: defaultTitle, description: defaultDescription, warnings: 2,
		});
	});

	test('a failed treatment lookup logs the error without losing default or resolved copy', async () => {
		const h = createHarness();
		h.showBanner();
		h.readTreatment = async () => { throw new Error('Assignment unavailable'); };
		await h.refetchTreatments();
		const fallback = h.notification?.message;
		await h.setTreatments('Resolved title', 'Resolved body');
		h.readTreatment = async () => { throw new Error('Assignment unavailable'); };
		await h.refetchTreatments();
		assert.deepStrictEqual({
			fallback, title: h.notification?.message, description: h.notification?.description, warnings: h.treatmentWarnings.length,
		}, { fallback: defaultTitle, title: 'Resolved title', description: 'Resolved body', warnings: 2 });
	});

	test('a superseded treatment lookup cannot overwrite newer copy', async () => {
		const h = createHarness();
		const pending = new DeferredPromise<string | undefined>();
		h.readTreatment = () => pending.p;
		h.showBanner();
		await h.setTreatments('Latest title', 'Latest body');
		await pending.complete('Stale copy');
		await timeout(0);
		assert.deepStrictEqual({ title: h.notification?.message, description: h.notification?.description }, {
			title: 'Latest title', description: 'Latest body',
		});
	});

	test('late treatment results cannot republish an invitation after disposal', async () => {
		const h = createHarness();
		const pending = new DeferredPromise<string | undefined>();
		h.readTreatment = () => pending.p;
		const contribution = h.showBanner();
		const posts = h.posts;
		contribution.dispose();
		await pending.complete('Late copy');
		await h.refetchTreatments();
		assert.deepStrictEqual({ notification: h.notification, posts: h.posts, warnings: h.treatmentWarnings }, {
			notification: undefined, posts, warnings: [],
		});
	});
});

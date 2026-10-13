/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { isMarkdownString } from '../../../../../base/common/htmlContent.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { MarshalledId } from '../../../../../base/common/marshallingIds.js';
import { Schemas } from '../../../../../base/common/network.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, IConfigurationChangeEvent, IConfigurationOverrides, IConfigurationService, IConfigurationUpdateOverrides } from '../../../../../platform/configuration/common/configuration.js';
import { ConfigurationScope } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyChangeEvent, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INativeHostService, IOpenAgentsWindowOptions } from '../../../../../platform/native/common/native.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { TestExperimentTriggerTelemetryService } from '../../../../../platform/telemetry/test/common/experimentTriggerTestUtils.js';
import { AgentsWindowOpenSource } from '../../../../../platform/window/common/window.js';
import { IWorkspaceContextService, WorkbenchState, WorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IWorkbenchAssignmentService } from '../../../../services/assignment/common/assignmentService.js';
import { NullWorkbenchAssignmentService } from '../../../../services/assignment/test/common/nullAssignmentService.js';
import { IChatWidget, IChatWidgetService } from '../../browser/chat.js';
import { ChatViewPane } from '../../browser/widgetHosts/viewPane/chatViewPane.js';
import { AgentSessionStatus, IAgentSession, IAgentSessionsModel } from '../../browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../browser/agentSessions/agentSessionsService.js';
import { ChatInputNotificationActionKind, IChatInputNotification, IChatInputNotificationContext, IChatInputNotificationService } from '../../browser/widget/input/chatInputNotificationService.js';
import { reviveChatDraft } from '../../common/attachments/chatDraft.js';
import { IChatRequestVariableEntry, toFileVariableEntry } from '../../common/attachments/chatVariableEntries.js';
import { ChatAgentLocation, ChatConfiguration, CopilotHarnessIntroductionMode, DEFAULT_AGENTS_HANDOFF_TIP_DELAY_SECONDS, OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID } from '../../common/constants.js';
import { IChatSessionsService, ResolvedChatSessionsExtensionPoint, SessionType } from '../../common/chatSessionsService.js';
import { IChatChangeEvent, IChatModel, IChatPendingRequest, IChatRequestModel } from '../../common/model/chatModel.js';
import { IChatViewModel } from '../../common/model/chatViewModel.js';
import { getChatSessionType, LocalChatSessionUri } from '../../common/model/chatUri.js';
import { CopilotHarnessIntroductionContribution, OpenAgentsWindowAction, OpenChatSessionInAgentsWindowAction, OpenWorkspaceInAgentsWindowAction, OpenWorkspaceInAgentsWindowChatTitleAction, OpenWorkspaceInAgentsWindowTitleBarAction, ResetCopilotHarnessIntroductionAction } from '../../electron-browser/agentSessions/agentSessionsActions.js';
import { agentsWindowHandoffConfigurationProperties } from '../../browser/agentSessionsConfiguration.js';
import { IAgentHostEditorActivityService } from '../../electron-browser/agentSessions/agentHostEditorActivity.js';

suite('Agents Window draft handoff and Copilot introduction', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const titleTreatment = 'chatAgentsParallelWorkBannerTitle';
	const descriptionTreatment = 'chatAgentsParallelWorkBannerDescription';
	const introductionCopyTreatment = 'chatCopilotHarnessIntroductionCopy';
	const introductionButtonsTreatment = 'chatCopilotHarnessIntroductionButtons';

	function createHarness(options: { transfer?: boolean; reveal?: boolean; running?: boolean; banner?: boolean; introductionMode?: CopilotHarnessIntroductionMode; runningProviderType?: string; handoffDelaySeconds?: number } = {}) {
		const instantiation = disposables.add(new TestInstantiationService());
		const focused = disposables.add(new Emitter<void>());
		const sessionsChanged = disposables.add(new Emitter<void>());
		const contextChanged = disposables.add(new Emitter<IContextKeyChangeEvent>());
		const workbenchStateChanged = disposables.add(new Emitter<WorkbenchState>());
		const sessionCommitted = disposables.add(new Emitter<{ readonly original: URI; readonly committed: URI }>());
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
			[ChatConfiguration.CopilotHarnessIntroductionMode]: options.introductionMode ?? CopilotHarnessIntroductionMode.Off,
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
		let introductionImpressions = 0;
		let openReady = Promise.resolve();
		const calls: IOpenAgentsWindowOptions[] = [];
		const warnings: string[] = [];
		const treatmentWarnings: string[] = [];
		const treatmentNames: string[] = [];
		const openedResources: Array<URI | string> = [];
		const telemetryEvents: { readonly name: string; readonly data: unknown }[] = [];
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
		instantiation.stub(IStorageService, disposables.add(new InMemoryStorageService()));
		const copilotHarnessContribution = upcastPartial<ResolvedChatSessionsExtensionPoint>({ agentHostProviderId: SessionType.CopilotCLI });
		instantiation.stub(IChatSessionsService, upcastPartial<IChatSessionsService>({
			onDidCommitSession: sessionCommitted.event,
			getChatSessionContribution: sessionType => sessionType.endsWith(`-${SessionType.CopilotCLI}`) ? copilotHarnessContribution : undefined,
		}));
		instantiation.stub(IAgentSessionsService, upcastPartial<IAgentSessionsService>({
			model: upcastPartial<IAgentSessionsModel>({
				onDidChangeSessions: sessionsChanged.event,
				get sessions(): IAgentSession[] {
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
			onDidChangeWorkbenchState: workbenchStateChanged.event,
		}));
		instantiation.stub(IEditorService, upcastPartial<IEditorService>({ activeEditor: undefined }));
		instantiation.stub(INativeHostService, upcastPartial<INativeHostService>({ openAgentsWindow: async value => { calls.push(value ?? {}); await openReady; } }));
		instantiation.stub(IAgentHostEditorActivityService, upcastPartial<IAgentHostEditorActivityService>({
			recordCopilotHarnessIntroductionShown: async () => { introductionImpressions++; },
		}));
		instantiation.stub(INotificationService, upcastPartial<INotificationService>({ warn: message => { warnings.push(String(message)); } }));
		instantiation.stub(IOpenerService, upcastPartial<IOpenerService>({
			open: async resource => {
				openedResources.push(resource);
				return true;
			},
		}));
		const telemetryService = new class extends TestExperimentTriggerTelemetryService {
			override publicLog2(name?: string, data?: object): void {
				super.publicLog2(name, data);
				if (name) {
					telemetryEvents.push({ name, data });
				}
			}
		}();
		instantiation.stub(ITelemetryService, telemetryService);
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
		const notificationContext = (sessionStarted = hasRequests): IChatInputNotificationContext => ({
			inputUri,
			sessionType: getChatSessionType(resource),
			sessionResource: resource,
			deferredNotificationsEnabled: true,
			isTransientChat: false,
			sessionStarted,
			modelState: { currentModel: undefined, models: [] },
		});
		return {
			instantiation, configuration, calls, warnings, focused, sessionsChanged, models, treatmentWarnings, treatmentNames, openedResources, telemetryEvents, widget, inputUri,
			notificationContext,
			triggers: telemetryService.triggers,
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
			setIntroductionTreatments: async (copy?: string, buttons?: string) => {
				readTreatment = async name => name === introductionCopyTreatment ? copy : name === introductionButtonsTreatment ? buttons : undefined;
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
			get notificationCount() { return notifications.size; },
			notificationVisible: (sessionStarted = hasRequests) => {
				const notification = [...notifications.values()].at(-1);
				return !!notification && (notification.when?.(notificationContext(sessionStarted)) ?? true);
			},
			get posts() { return posts; },
			get introductionImpressions() { return introductionImpressions; },
			set openReady(value: Promise<void>) { openReady = value; },
			set workbenchState(value: WorkbenchState) {
				workbenchState = value;
				workbenchStateChanged.fire(value);
			},
			showBanner: () => disposables.add(instantiation.createInstance(CopilotHarnessIntroductionContribution)),
			showCurrentNotification: () => [...notifications.values()].at(-1)?.onDidShow?.(notificationContext()),
			commitSession: (original: URI, committed: URI) => sessionCommitted.fire({ original, committed }),
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

	test('defines unified banner settings and a separate advanced developer preview', () => {
		const properties = agentsWindowHandoffConfigurationProperties;
		const banner = properties[ChatConfiguration.AgentsWindowBannerEnabled];
		const developer = properties[ChatConfiguration.AgentsWindowBannerDeveloperMode];
		const reveal = properties[ChatConfiguration.AgentsWindowBannerRevealCurrentSession];
		const introduction = properties[ChatConfiguration.CopilotHarnessIntroductionMode];
		assert.deepStrictEqual({
			banner: { default: banner.default, experiment: banner.experiment },
			developer: { default: developer.default, tags: developer.tags, experiment: Object.hasOwn(developer, 'experiment') },
			reveal: { type: reveal.type, default: reveal.default, scope: reveal.scope, tags: reveal.tags, experiment: reveal.experiment },
			introduction: { enum: introduction.enum, tags: introduction.tags },
		}, {
			banner: { default: false, experiment: { mode: 'auto' } },
			developer: { default: false, tags: ['experimental', 'advanced'], experiment: false },
			reveal: { type: 'boolean', default: true, scope: ConfigurationScope.APPLICATION, tags: ['experimental', 'advanced'], experiment: { mode: 'auto' } },
			introduction: {
				enum: [CopilotHarnessIntroductionMode.Off, CopilotHarnessIntroductionMode.NewSession, CopilotHarnessIntroductionMode.AfterRequest],
				tags: ['experimental'],
			},
		});
	});

	for (const surface of ['titleBar', 'chatTitle', 'command', 'workspace', 'chatSession'] as const) {
		test(`${surface} does not transfer a draft without an explicit new-session reveal`, async () => {
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
				reveal: h.calls[0].reveal,
				triggers: h.triggers,
				source: { inputText: h.input, attachments: h.attachments },
			}, {
				count: 1, folder: '/source',
				draft: undefined, reveal: undefined, triggers: [],
				source: { inputText: 'Current prompt at invocation', attachments: originalAttachments },
			});
		});
	}

	for (const surface of ['command', 'workspace', 'chatSession'] as const) {
		test(`${surface} transfers the current draft when explicitly revealing the new-session view`, async () => {
			const h = createHarness();
			await h.instantiation.invokeFunction(accessor => {
				switch (surface) {
					case 'command': return new OpenAgentsWindowAction().run(accessor, { reveal: 'new' });
					case 'workspace': return new OpenWorkspaceInAgentsWindowAction().run(accessor, { reveal: 'new' });
					case 'chatSession': return new OpenChatSessionInAgentsWindowAction().run(accessor, { agentsWindowOpenSource: AgentsWindowOpenSource.ChatTitleBar, reveal: 'new' }, h.resource);
				}
			});
			assert.deepStrictEqual({
				reveal: h.calls[0].reveal,
				draft: h.calls[0].draft && reviveChatDraft(h.calls[0].draft),
				source: { inputText: h.input, attachments: h.attachments },
			}, {
				reveal: 'new',
				draft: { inputText: 'Original prompt', attachments: h.attachments },
				source: { inputText: 'Original prompt', attachments: h.attachments },
			});
		});
	}

	for (const surface of ['workspace', 'sessionTitle'] as const) {
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
				await h.instantiation.invokeFunction(accessor => surface === 'workspace'
					? new OpenWorkspaceInAgentsWindowAction().run(accessor, { ...context, reveal: 'new' })
					: new OpenChatSessionInAgentsWindowAction().run(accessor, { agentsWindowOpenSource: AgentsWindowOpenSource.ChatTitleBar, reveal: 'new' }, context));
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
		await h.instantiation.invokeFunction(accessor => new OpenWorkspaceInAgentsWindowAction().run(accessor, {
			reveal: 'new', sessionResource: h.resource,
		}));
		await h.instantiation.invokeFunction(accessor => new OpenChatSessionInAgentsWindowAction().run(accessor, { agentsWindowOpenSource: AgentsWindowOpenSource.ChatTitleBar, reveal: 'new' }, h.resource));
		await h.instantiation.invokeFunction(accessor => new OpenChatSessionInAgentsWindowAction().run(accessor, { agentsWindowOpenSource: AgentsWindowOpenSource.ChatTitleBar, reveal: 'new' }));
		assert.deepStrictEqual(h.calls.map(call => call.draft?.inputText), [
			'Original prompt', 'Original prompt', 'Last focused draft',
		]);
	});

	for (const transfer of [false, true]) {
		for (const reveal of [false, true]) {
			test(`title-bar opens preserve drafts and honor session reveal (transfer=${transfer}, reveal=${reveal})`, async () => {
				const h = createHarness({ transfer, reveal });
				await h.instantiation.invokeFunction(accessor => new OpenWorkspaceInAgentsWindowTitleBarAction().run(accessor));
				h.resource = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/persisted' });
				await h.instantiation.invokeFunction(accessor => new OpenWorkspaceInAgentsWindowTitleBarAction().run(accessor));
				assert.deepStrictEqual(h.calls.map(call => ({ draft: !!call.draft, session: call.reveal === 'new' ? 'new' : URI.revive(call.reveal)?.path })), [
					{ draft: false, session: undefined },
					{ draft: false, session: reveal ? '/persisted' : undefined },
				]);
			});
		}
	}

	test('requires new-session reveal even for an explicit draft transfer override', async () => {
		const h = createHarness({ transfer: false, running: false });
		await h.instantiation.invokeFunction(accessor => new OpenChatSessionInAgentsWindowAction().run(accessor, {
			agentsWindowOpenSource: AgentsWindowOpenSource.CurrentChatHandoff,
			transferDraft: true,
		}, h.resource));
		await h.instantiation.invokeFunction(accessor => new OpenChatSessionInAgentsWindowAction().run(accessor, {
			agentsWindowOpenSource: AgentsWindowOpenSource.CurrentChatHandoff,
			reveal: 'new',
			transferDraft: true,
		}, h.resource));

		assert.deepStrictEqual(h.calls.map(call => ({ reveal: call.reveal, input: call.draft?.inputText })), [
			{ reveal: undefined, input: undefined },
			{ reveal: 'new', input: 'Original prompt' },
		]);
	});

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
			test(`transfers unsent drafts without inviting from them: ${session.name} in a normal chat ${surface}`, async () => {
				const h = createHarness();
				h.resource = session.resource;
				h.viewContext = surface === 'view' ? { viewId: 'workbench.panel.chat.view' } : {};
				h.showBanner();
				const invitationBeforeSend = !!h.notification;
				await h.instantiation.invokeFunction(accessor => new OpenAgentsWindowAction().run(accessor, { reveal: 'new' }));
				h.hasRequests = true;
				await h.instantiation.invokeFunction(accessor => new OpenAgentsWindowAction().run(accessor, { reveal: 'new' }));
				assert.deepStrictEqual({
					drafts: h.calls.map(call => !!call.draft),
					invitationBeforeSend,
					invitationAfterSend: h.notification,
					source: h.input,
				}, {
					drafts: [true, false], invitationBeforeSend: false, invitationAfterSend: undefined, source: 'Original prompt',
				});
			});
		}
	}

	test('preserves explicit caller folder, session and draft arguments instead of inferring the current draft', async () => {
		const h = createHarness({ reveal: true });
		const targets: IOpenAgentsWindowOptions[] = [
			{ folderUri: URI.file('/explicit-workspace') },
			{ reveal: URI.from({ scheme: SessionType.AgentHostCopilot, path: '/explicit-session' }) },
			{ folderUri: URI.file('/explicit-workspace'), reveal: URI.from({ scheme: SessionType.AgentHostCopilot, path: '/explicit-session' }) },
			{ folderUri: URI.file('/explicit-workspace'), folderUriIsDefault: true, reveal: 'new', draft: { inputText: 'Explicit caller draft', attachments: '[]' } },
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
			session: h.calls[0].reveal === 'new' ? 'new' : URI.revive(h.calls[0].reveal)?.path,
			invitation: h.notification,
		}, { draft: undefined, session: '/persisted', invitation: undefined });
	});

	test('repeated opens snapshot independently and never clear newer source edits', async () => {
		const h = createHarness();
		const opened = new DeferredPromise<void>();
		h.openReady = opened.p;
		const first = h.instantiation.invokeFunction(accessor => new OpenAgentsWindowAction().run(accessor, { reveal: 'new' }));
		h.input = 'Newer source edit';
		h.attachments = [];
		const second = h.instantiation.invokeFunction(accessor => new OpenAgentsWindowAction().run(accessor, { reveal: 'new' }));
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

	test('reports the draft transfer trigger for drafts with content, whether or not they transfer', async () => {
		const results = [];
		for (const { transfer, input, attachments } of [
			{ transfer: true, input: 'Prompt', attachments: false },
			{ transfer: false, input: 'Prompt', attachments: false },
			{ transfer: false, input: '', attachments: true },
			{ transfer: false, input: ' ', attachments: false },
		]) {
			const h = createHarness({ transfer });
			h.input = input;
			if (!attachments) {
				h.attachments = [];
			}
			await h.instantiation.invokeFunction(accessor => new OpenAgentsWindowAction().run(accessor, { reveal: 'new' }));
			results.push({ triggers: h.triggers, transferred: !!h.calls[0].draft });
		}

		const trigger = [`config.${ChatConfiguration.OpenInAgentsWindowTransferDraft}`];
		assert.deepStrictEqual(results, [
			{ triggers: trigger, transferred: true },
			{ triggers: trigger, transferred: false },
			{ triggers: trigger, transferred: false },
			{ triggers: [], transferred: false },
		]);
	});

	test('does not transfer from hidden AI, inline chat or Quick Chat', async () => {
		const h = createHarness();
		h.allowed = false;
		await h.instantiation.invokeFunction(accessor => new OpenAgentsWindowAction().run(accessor, { reveal: 'new' }));
		h.allowed = true;
		h.viewContext = { isInlineChat: true };
		await h.instantiation.invokeFunction(accessor => new OpenAgentsWindowAction().run(accessor, { reveal: 'new' }));
		h.viewContext = { isQuickChat: true };
		await h.instantiation.invokeFunction(accessor => new OpenAgentsWindowAction().run(accessor, { reveal: 'new' }));
		assert.deepStrictEqual(h.calls.map(call => call.draft), [undefined, undefined, undefined]);
	});

	test('captures an untitled editor attachment from the source window model', async () => {
		const h = createHarness();
		const resource = URI.from({ scheme: Schemas.untitled, path: '/Unsaved-1' });
		const model = disposables.add(createTextModel('Unsaved source contents', 'plaintext', undefined, resource));
		h.models.set(resource, model);
		h.attachments = [toFileVariableEntry(resource)];
		await h.instantiation.invokeFunction(accessor => new OpenAgentsWindowAction().run(accessor, { reveal: 'new' }));
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
		await h.instantiation.invokeFunction(accessor => new OpenAgentsWindowAction().run(accessor, { reveal: 'new' }));
		assert.deepStrictEqual({ warnings: h.warnings.length, draft: h.calls[0].draft, isDefault: h.calls[0].folderUriIsDefault, attachments: h.attachments.length }, {
			warnings: 1, draft: undefined, isDefault: true, attachments: 1,
		});
	});

	test('reports untransferable context and opens without losing or retargeting a destination draft', async () => {
		const h = createHarness();
		h.attachments = [{ kind: 'string', id: 'unresolved', name: 'Context', value: undefined, uri: URI.parse('context:/item'), handle: 7 }];
		await h.instantiation.invokeFunction(accessor => new OpenWorkspaceInAgentsWindowAction().run(accessor, { reveal: 'new' }));
		assert.deepStrictEqual({ warnings: h.warnings.length, draft: h.calls[0].draft, isDefault: h.calls[0].folderUriIsDefault, retained: h.attachments.length }, {
			warnings: 1, draft: undefined, isDefault: true, retained: 1,
		});
	});

	test('switches reactively between introduction experiment modes', async () => {
		const h = createHarness({ banner: false, introductionMode: CopilotHarnessIntroductionMode.Off, running: false });
		h.showBanner();
		await timeout(0);
		const off = h.notification;
		await h.configuration.updateValue(ChatConfiguration.CopilotHarnessIntroductionMode, CopilotHarnessIntroductionMode.NewSession);
		const newSession = {
			beforeRequest: h.notificationVisible(false),
			afterRequest: h.notificationVisible(true),
		};
		await h.configuration.updateValue(ChatConfiguration.CopilotHarnessIntroductionMode, CopilotHarnessIntroductionMode.AfterRequest);
		const afterRequest = {
			beforeRequest: h.notificationVisible(false),
			afterRequest: h.notificationVisible(true),
		};
		await h.configuration.updateValue(ChatConfiguration.CopilotHarnessIntroductionMode, CopilotHarnessIntroductionMode.Off);

		assert.deepStrictEqual({
			off,
			newSession,
			afterRequest,
			offAgain: h.notification,
			parallelWorkEnabled: h.configuration.getValue(ChatConfiguration.AgentsParallelWorkBannerEnabled),
			lifecycle: h.telemetryEvents.filter(event => event.name === 'copilotHarnessIntroductionLifecycle').map(event => event.data),
		}, {
			off: undefined,
			newSession: { beforeRequest: true, afterRequest: true },
			afterRequest: { beforeRequest: false, afterRequest: true },
			offAgain: undefined,
			parallelWorkEnabled: false,
			lifecycle: [{
				stage: 'opportunity',
				mode: CopilotHarnessIntroductionMode.Off,
				chatSessionId: 'agent-host-copilotcli:/untitled-draft',
				sessionType: SessionType.AgentHostCopilot,
				harness: undefined,
			}],
		});
	});

	for (const introductionMode of [CopilotHarnessIntroductionMode.NewSession, CopilotHarnessIntroductionMode.AfterRequest]) {
		test(`records only actual harness introduction impressions, once per presentation (${introductionMode})`, async () => {
			const h = createHarness({ introductionMode });
			h.showBanner();
			await timeout(0);
			const beforeDisplay = h.introductionImpressions;
			h.sendMessage();
			h.showCurrentNotification();
			h.showCurrentNotification();
			const firstDisplay = h.introductionImpressions;
			h.allowed = false;
			h.allowed = true;
			h.showCurrentNotification();
			assert.deepStrictEqual({ beforeDisplay, firstDisplay, laterDisplay: h.introductionImpressions }, {
				beforeDisplay: 0, firstDisplay: 1, laterDisplay: 2,
			});
		});
	}

	test('logs actual introduction exposure and session materialization once with correlation context', async () => {
		const h = createHarness({ banner: false, introductionMode: CopilotHarnessIntroductionMode.AfterRequest, running: false });
		h.showBanner();
		await timeout(0);
		h.sendMessage();
		h.showCurrentNotification();
		h.showCurrentNotification();
		h.commitSession(h.resource, URI.from({ scheme: SessionType.AgentHostCopilot, path: '/session-1' }));

		assert.deepStrictEqual(h.telemetryEvents.filter(event => event.name === 'copilotHarnessIntroductionLifecycle').map(event => event.data), [{
			stage: 'opportunity',
			mode: CopilotHarnessIntroductionMode.AfterRequest,
			chatSessionId: 'agent-host-copilotcli:/untitled-draft',
			sessionType: SessionType.AgentHostCopilot,
			harness: undefined,
		}, {
			stage: 'shown',
			mode: CopilotHarnessIntroductionMode.AfterRequest,
			chatSessionId: 'agent-host-copilotcli:/untitled-draft',
			sessionType: SessionType.AgentHostCopilot,
			harness: undefined,
		}, {
			stage: 'materialized',
			mode: CopilotHarnessIntroductionMode.AfterRequest,
			chatSessionId: 'agent-host-copilotcli:/untitled-draft',
			sessionType: SessionType.AgentHostCopilot,
			harness: undefined,
			committedChatSessionId: 'agent-host-copilotcli:/session-1',
		}]);
	});

	test('keeps a new-session introduction visible after a request is sent', async () => {
		const h = createHarness({ banner: false, introductionMode: CopilotHarnessIntroductionMode.NewSession, running: false });
		h.showBanner();
		await timeout(0);
		const beforeRequest = h.notificationVisible();
		const autoDismissOnMessage = h.notification?.autoDismissOnMessage;
		h.sendMessage();

		assert.deepStrictEqual({
			beforeRequest,
			afterRequest: h.notificationVisible(),
			autoDismissOnMessage,
			notification: h.notification?.id,
		}, {
			beforeRequest: true,
			afterRequest: true,
			autoDismissOnMessage: false,
			notification: 'chat.agentsParallelWork',
		});
	});

	test('reveals an after-request introduction when the first request is sent', async () => {
		const h = createHarness({ banner: false, introductionMode: CopilotHarnessIntroductionMode.AfterRequest, running: false });
		h.showBanner();
		await timeout(0);
		const beforeRequest = h.notificationVisible();
		h.sendMessage();

		assert.deepStrictEqual({
			beforeRequest,
			afterRequest: h.notificationVisible(),
			notification: h.notification?.id,
		}, {
			beforeRequest: false,
			afterRequest: true,
			notification: 'chat.agentsParallelWork',
		});
	});

	test('disabling the introduction does not replace it with an invitation on an empty draft', async () => {
		const h = createHarness({ introductionMode: CopilotHarnessIntroductionMode.NewSession });
		h.showBanner();
		await timeout(0);
		const introduction = {
			count: h.notificationCount,
			title: h.notification?.message,
			actions: h.notification?.actions.map(action => action.label),
		};
		await h.configuration.updateValue(ChatConfiguration.CopilotHarnessIntroductionMode, CopilotHarnessIntroductionMode.Off);

		assert.deepStrictEqual({
			introduction,
			parallel: {
				count: h.notificationCount,
				title: h.notification?.message,
				actions: h.notification?.actions.map(action => action.label),
			},
		}, {
			introduction: {
				count: 1,
				title: 'You\'re using a new Copilot experience',
				actions: ['Learn More', '$(thumbsup) Got it!'],
			},
			parallel: {
				count: 0,
				title: undefined,
				actions: undefined,
			},
		});
	});

	test('uses the existing invitation notification for Copilot harness education', async () => {
		const h = createHarness({ banner: false, introductionMode: CopilotHarnessIntroductionMode.NewSession, running: false });
		h.showBanner();
		await h.setTreatments('Experiment title', 'Experiment body');

		assert.deepStrictEqual({
			id: h.notification?.id,
			telemetryId: h.notification?.telemetryId,
			title: h.notification?.message,
			description: isMarkdownString(h.notification?.description) ? {
				value: h.notification.description.value,
				isTrusted: h.notification.description.isTrusted,
			} : h.notification?.description,
			dismissible: h.notification?.dismissible,
			hasOnDismiss: !!h.notification?.onDismiss,
			autoDismissOnMessage: h.notification?.autoDismissOnMessage,
			actions: h.notification?.actions.map(action => ({
				label: action.label,
				ariaLabel: action.ariaLabel,
				iconOnly: action.iconOnly,
				leading: action.leading,
				filled: action.filled,
				tooltip: action.tooltip,
				primary: action.primary,
				keepOpen: action.keepOpen,
				actionId: action.telemetryActionId,
			})),
			posts: h.posts,
		}, {
			id: 'chat.agentsParallelWork',
			telemetryId: 'copilotHarnessIntroduction.newSession',
			title: 'You\'re using a new Copilot experience',
			description: {
				value: 'This agent harness opens up new ways to work across windows and apps. Continue as usual, and [let us know](https://github.com/microsoft/vscode/issues) how it goes.',
				isTrusted: false,
			},
			dismissible: true,
			hasOnDismiss: true,
			autoDismissOnMessage: false,
			actions: [
				{ label: 'Learn More', ariaLabel: undefined, iconOnly: undefined, leading: undefined, filled: true, tooltip: undefined, primary: false, keepOpen: true, actionId: 'docsLink' },
				{ label: '$(thumbsup) Got it!', ariaLabel: 'Got it!', iconOnly: undefined, leading: undefined, filled: undefined, tooltip: undefined, primary: true, keepOpen: true, actionId: 'thumbsUp' },
			],
			posts: 1,
		});
	});

	test('recognizes remote Copilot harness drafts for education in an empty workspace', async () => {
		const h = createHarness({ introductionMode: CopilotHarnessIntroductionMode.NewSession, running: false });
		h.workbenchState = WorkbenchState.EMPTY;
		h.resource = URI.from({ scheme: 'remote-test-copilotcli', path: '/untitled-draft' });
		h.showBanner();
		await timeout(0);

		assert.deepStrictEqual({
			title: h.notification?.message,
			action: h.notification?.actions[0]?.label,
		}, {
			title: 'You\'re using a new Copilot experience',
			action: 'Learn More',
		});
	});

	test('updates local Copilot education when the workbench state changes', async () => {
		const h = createHarness({ introductionMode: CopilotHarnessIntroductionMode.NewSession, running: false });
		h.workbenchState = WorkbenchState.EMPTY;
		h.showBanner();
		await timeout(0);
		const emptyWorkspace = h.notification;
		h.workbenchState = WorkbenchState.FOLDER;
		const folderTitle = h.notification?.message;
		h.workbenchState = WorkbenchState.EMPTY;

		assert.deepStrictEqual({
			emptyWorkspace,
			folderTitle,
			emptyAgain: h.notification,
		}, {
			emptyWorkspace: undefined,
			folderTitle: 'You\'re using a new Copilot experience',
			emptyAgain: undefined,
		});
	});

	test('Learn More opens documentation without dismissing the banner or changing the parallel-work experiment', async () => {
		const h = createHarness({ banner: false, introductionMode: CopilotHarnessIntroductionMode.NewSession, running: false });
		h.showBanner();
		await timeout(0);
		await h.click(0);
		const afterOpen = { id: h.notification?.id, title: h.notification?.message };
		h.resource = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-next' });

		assert.deepStrictEqual({
			opened: h.openedResources.map(resource => typeof resource === 'string' ? resource : resource.toString()),
			enabled: h.configuration.getValue(ChatConfiguration.AgentsParallelWorkBannerEnabled),
			afterOpen,
			nextTitle: h.notification?.message,
		}, {
			opened: ['https://aka.ms/vscode-copilot-harness'],
			enabled: false,
			afterOpen: { id: 'chat.agentsParallelWork', title: 'You\'re using a new Copilot experience' },
			nextTitle: 'You\'re using a new Copilot experience',
		});
	});

	test('Got it! suppresses future education without disabling parallel work', async () => {
		const h = createHarness({ banner: false, introductionMode: CopilotHarnessIntroductionMode.NewSession, running: false });
		const contribution = h.showBanner();
		await timeout(0);
		await h.click(1);
		const afterFeedback = h.notification;
		contribution.dispose();
		h.resource = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-next' });
		h.showBanner();
		await timeout(0);

		assert.deepStrictEqual({
			afterFeedback,
			nextTitle: h.notification?.message,
			enabled: h.configuration.getValue(ChatConfiguration.AgentsParallelWorkBannerEnabled),
			updates: h.configuration.updates,
		}, {
			afterFeedback: undefined,
			nextTitle: undefined,
			enabled: false,
			updates: [],
		});
	});

	test('X suppresses future education without disabling parallel work', async () => {
		const h = createHarness({ introductionMode: CopilotHarnessIntroductionMode.NewSession, running: false });
		const contribution = h.showBanner();
		await timeout(0);
		const educationTitle = h.notification?.message;
		h.dismiss();
		const afterDismissal = h.notification;
		contribution.dispose();
		h.resource = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-next' });
		h.showBanner();
		await timeout(0);
		const nextEducation = h.notification;
		h.status = AgentSessionStatus.InProgress;
		h.resource = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-parallel' });

		assert.deepStrictEqual({
			educationTitle,
			afterDismissal,
			nextEducation,
			enabled: h.configuration.getValue(ChatConfiguration.AgentsParallelWorkBannerEnabled),
			updates: h.configuration.updates,
			parallelTitle: h.notification?.message,
			parallelAction: h.notification?.actions[0]?.label,
		}, {
			educationTitle: 'You\'re using a new Copilot experience',
			afterDismissal: undefined,
			nextEducation: undefined,
			enabled: true,
			updates: [],
			parallelTitle: undefined,
			parallelAction: undefined,
		});
	});

	test('developer reset restores an opted-out introduction without changing experiment settings', async () => {
		const h = createHarness({ banner: false, introductionMode: CopilotHarnessIntroductionMode.NewSession, running: false });
		h.showBanner();
		await timeout(0);
		h.dismiss();
		const afterOptOut = h.notification;
		await h.instantiation.invokeFunction(accessor => new ResetCopilotHarnessIntroductionAction().run(accessor));
		await timeout(0);

		assert.deepStrictEqual({
			afterOptOut,
			title: h.notification?.message,
			mode: h.configuration.getValue(ChatConfiguration.CopilotHarnessIntroductionMode),
			parallelWorkEnabled: h.configuration.getValue(ChatConfiguration.AgentsParallelWorkBannerEnabled),
			configurationUpdates: h.configuration.updates,
		}, {
			afterOptOut: undefined,
			title: 'You\'re using a new Copilot experience',
			mode: CopilotHarnessIntroductionMode.NewSession,
			parallelWorkEnabled: false,
			configurationUpdates: [],
		});
	});

	suite('Copilot introduction treatments', () => {
		const copies = [{
			variant: 'current',
			title: 'You\'re using a new Copilot experience',
			description: 'This agent harness opens up new ways to work across windows and apps. Continue as usual, and [let us know](https://github.com/microsoft/vscode/issues) how it goes.',
		}, {
			variant: 'capabilities',
			title: 'You\'re using a new Copilot experience',
			description: 'This agent harness brings new capabilities to the way you already work. If anything seems off, [let us know](https://github.com/microsoft/vscode/issues).',
		}, {
			variant: 'agent',
			title: 'You\'re using a new Copilot agent',
			description: 'Continue your sessions across windows and apps, without changing how you work. [Let us know](https://github.com/microsoft/vscode/issues) how it goes.',
		}, {
			variant: 'original',
			title: 'You\'re using a new Copilot experience',
			description: 'This new implementation unlocks exciting new capabilities, while previous agent harnesses remain available. If anything seems off, [let us know](https://github.com/microsoft/vscode/issues).',
		}];

		for (const copy of copies) {
			for (const buttons of ['dismiss', 'feedback']) {
				test(`selects ${copy.variant} copy independently of ${buttons} buttons and triggers only on exposure`, async () => {
					const h = createHarness({ banner: false, introductionMode: CopilotHarnessIntroductionMode.NewSession, running: false });
					h.showBanner();
					await h.setIntroductionTreatments(copy.variant, buttons);
					const beforeExposure = [...h.triggers];
					h.showCurrentNotification();
					h.showCurrentNotification();

					assert.deepStrictEqual({
						title: h.notification?.message,
						description: isMarkdownString(h.notification?.description) ? h.notification.description.value : undefined,
						dismissible: h.notification?.dismissible,
						hasOnDismiss: !!h.notification?.onDismiss,
						actions: h.notification?.actions.map(action => action.telemetryActionId),
						learnMore: {
							leading: h.notification?.actions[0].leading,
							outlined: h.notification?.actions[0].outlined,
							filled: h.notification?.actions[0].filled,
						},
						beforeExposure,
						triggers: h.triggers,
					}, {
						title: copy.title,
						description: copy.description,
						dismissible: buttons === 'dismiss',
						hasOnDismiss: buttons === 'dismiss',
						actions: buttons === 'feedback' ? ['docsLink', 'thumbsUp', 'thumbsDown'] : ['docsLink', 'thumbsUp'],
						learnMore: buttons === 'feedback' ? { leading: true, outlined: true, filled: undefined } : { leading: undefined, outlined: undefined, filled: true },
						beforeExposure: [],
						triggers: [introductionCopyTreatment, introductionButtonsTreatment],
					});
				});
			}
		}

		test('waits for initial assignments rather than briefly exposing the default variant', async () => {
			const h = createHarness({ introductionMode: CopilotHarnessIntroductionMode.NewSession });
			const pending = new DeferredPromise<string | undefined>();
			h.readTreatment = async name => name === introductionCopyTreatment ? pending.p : name === introductionButtonsTreatment ? 'feedback' : undefined;
			h.showBanner();
			const before = { notification: h.notification, posts: h.posts, triggers: [...h.triggers] };
			await pending.complete('original');
			await timeout(0);

			assert.deepStrictEqual({
				before,
				description: isMarkdownString(h.notification?.description) ? h.notification.description.value : undefined,
				dismissible: h.notification?.dismissible,
				posts: h.posts,
			}, {
				before: { notification: undefined, posts: 0, triggers: [] },
				description: copies[3].description,
				dismissible: false,
				posts: 1,
			});
		});

		test('does not trigger copy or buttons while an after-request introduction is hidden', async () => {
			const h = createHarness({ banner: false, introductionMode: CopilotHarnessIntroductionMode.AfterRequest, running: false });
			h.showBanner();
			await h.setIntroductionTreatments('current', 'feedback');
			const before = { visible: h.notificationVisible(), triggers: [...h.triggers] };
			h.sendMessage();
			h.showCurrentNotification();

			assert.deepStrictEqual({ before, visible: h.notificationVisible(), triggers: h.triggers }, {
				before: { visible: false, triggers: [] },
				visible: true,
				triggers: [introductionCopyTreatment, introductionButtonsTreatment],
			});
		});

		test('does not record exposure from a notification after its contribution is disposed', async () => {
			const h = createHarness({ banner: false, introductionMode: CopilotHarnessIntroductionMode.NewSession, running: false });
			const contribution = h.showBanner();
			await h.setIntroductionTreatments('current', 'feedback');
			const notification = h.notification;
			contribution.dispose();
			notification?.onDidShow?.(h.notificationContext());

			assert.deepStrictEqual({ notification: h.notification, triggers: h.triggers }, {
				notification: undefined, triggers: [],
			});
		});

		test('refreshes each dimension independently and restores unassigned defaults', async () => {
			const h = createHarness({ banner: false, introductionMode: CopilotHarnessIntroductionMode.NewSession, running: false });
			h.showBanner();
			await h.setIntroductionTreatments('agent', 'dismiss');
			const title = h.notification?.message;
			await h.setIntroductionTreatments('agent', 'feedback');
			const changedButtons = { title: h.notification?.message, dismissible: h.notification?.dismissible };
			const posts = h.posts;
			await h.refetchTreatments();
			const unchanged = posts === h.posts;
			await h.setIntroductionTreatments();

			assert.deepStrictEqual({
				title, changedButtons, unchanged,
				defaultTitle: h.notification?.message,
				defaultDescription: isMarkdownString(h.notification?.description) ? h.notification.description.value : undefined,
				defaultDismissible: h.notification?.dismissible,
			}, {
				title: copies[2].title,
				changedButtons: { title: copies[2].title, dismissible: false },
				unchanged: true,
				defaultTitle: copies[0].title,
				defaultDescription: copies[0].description,
				defaultDismissible: true,
			});
		});

		for (const values of [['unknown-copy', 'unknown-buttons'], ['', '   ']] as const) {
			test(`logs invalid selectors ${JSON.stringify(values)} and uses approved defaults`, async () => {
				const h = createHarness({ banner: false, introductionMode: CopilotHarnessIntroductionMode.NewSession, running: false });
				h.showBanner();
				await h.setIntroductionTreatments(...values);
				assert.deepStrictEqual({
					description: isMarkdownString(h.notification?.description) ? h.notification.description.value : undefined,
					dismissible: h.notification?.dismissible,
					warnings: h.treatmentWarnings.length,
				}, { description: copies[0].description, dismissible: true, warnings: 2 });
			});
		}

		test('logs an initial lookup failure and shows defaults, then retains resolved variants on later failures', async () => {
			const h = createHarness({ banner: false, introductionMode: CopilotHarnessIntroductionMode.NewSession, running: false });
			h.readTreatment = async () => { throw new Error('Assignment unavailable'); };
			h.showBanner();
			await timeout(0);
			const fallback = { title: h.notification?.message, dismissible: h.notification?.dismissible };
			await h.setIntroductionTreatments('agent', 'feedback');
			h.readTreatment = async () => { throw new Error('Assignment unavailable'); };
			await h.refetchTreatments();

			assert.deepStrictEqual({
				fallback,
				title: h.notification?.message,
				dismissible: h.notification?.dismissible,
				warnings: h.treatmentWarnings.length,
			}, {
				fallback: { title: copies[0].title, dismissible: true },
				title: copies[2].title,
				dismissible: false,
				warnings: 2,
			});
		});

		test('late assignments cannot overwrite newer copy or buttons', async () => {
			const h = createHarness({ banner: false, introductionMode: CopilotHarnessIntroductionMode.NewSession, running: false });
			const pending = new DeferredPromise<string | undefined>();
			h.readTreatment = () => pending.p;
			h.showBanner();
			await h.setIntroductionTreatments('agent', 'feedback');
			await pending.complete('original');
			await timeout(0);

			assert.deepStrictEqual({ title: h.notification?.message, dismissible: h.notification?.dismissible, warnings: h.treatmentWarnings }, {
				title: copies[2].title, dismissible: false, warnings: [],
			});
		});

		for (const action of [1, 2]) {
			test(`feedback action ${action} persists acknowledgement across treatment refreshes and new sessions`, async () => {
				const h = createHarness({ banner: false, introductionMode: CopilotHarnessIntroductionMode.NewSession, running: false });
				h.showBanner();
				await h.setIntroductionTreatments('current', 'feedback');
				await h.click(action);
				const afterFeedback = h.notification;
				await h.setIntroductionTreatments('original', 'dismiss');
				h.resource = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-next' });

				assert.deepStrictEqual({ afterFeedback, next: h.notification, updates: h.configuration.updates }, {
					afterFeedback: undefined, next: undefined, updates: [],
				});
			});
		}

		test('the feedback layout keeps Learn More open and honors the AI visibility gate', async () => {
			const h = createHarness({ banner: false, introductionMode: CopilotHarnessIntroductionMode.NewSession, running: false });
			h.allowed = false;
			h.showBanner();
			await h.setIntroductionTreatments('current', 'feedback');
			const hidden = { notification: h.notification, triggers: [...h.triggers] };
			h.allowed = true;
			await h.click(0);

			assert.deepStrictEqual({
				hidden,
				opened: h.openedResources,
				title: h.notification?.message,
				actions: h.notification?.actions.length,
				updates: h.configuration.updates,
			}, {
				hidden: { notification: undefined, triggers: [] },
				opened: ['https://aka.ms/vscode-copilot-harness'],
				title: copies[0].title,
				actions: 3,
				updates: [],
			});
		});
	});
});

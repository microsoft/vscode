/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import * as dom from '../../../../../base/browser/dom.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAgentHostEnablementService } from '../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IManagedSettingsService, NullManagedSettingsService } from '../../../../../platform/policy/common/copilotManagedSettings.js';
import { IQuickInputHideEvent, IQuickInputService, IQuickWidget, QuickInputHideReason } from '../../../../../platform/quickinput/common/quickInput.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { AccountPolicyGateState, IAccountPolicyGateService } from '../../../../services/policies/common/accountPolicyService.js';
import { TestContextService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { ChatViewPaneTarget, IChatAcceptInputOptions, IChatWidget, IChatWidgetService, IChatWidgetViewModelChangeEvent, IChatWidgetViewOptions, IQuickChatOpenOptions } from '../../browser/chat.js';
import { ChatWidget } from '../../browser/widget/chatWidget.js';
import { ChatInputPart } from '../../browser/widget/input/chatInputPart.js';
import { QuickChat, QuickChatService } from '../../browser/widgetHosts/chatQuick.js';
import { ChatMode, IChatMode, IChatModes } from '../../common/chatModes.js';
import { IChatModelReference, IChatSendRequestOptions, IChatService, IChatSessionStartOptions } from '../../common/chatService/chatService.js';
import { IChatSessionsService, SessionType } from '../../common/chatSessionsService.js';
import { storeUserSelectedSessionType } from '../../common/chatSessionTypePreference.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind, ChatPermissionLevel, SessionTypeSelectionReason } from '../../common/constants.js';
import { IChatModel, IChatModelInputState, IChatRequestModel, IChatResponseModel, IInputModel } from '../../common/model/chatModel.js';
import { ILanguageModelChatMetadata } from '../../common/languageModels.js';
import { getChatSessionType, getNewChatSessionResource } from '../../common/model/chatUri.js';
import { ChatRequestVariableSet } from '../../common/attachments/chatVariableEntries.js';

suite('Quick Chat session routing', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createQuickChat(settings: Record<string, boolean> = {}, managedSettings = new NullManagedSettingsService()) {
		const instantiationService = store.add(new TestInstantiationService());
		const configuration = new TestConfigurationService({
			[ChatConfiguration.DefaultToCopilotHarness]: true,
			[ChatConfiguration.EditorPreferCopilotHarness]: true,
			...settings,
		});
		const storage = store.add(new TestStorageService());
		const stateUpdates: Partial<IChatModelInputState>[] = [];
		const boundModels: IChatModel[] = [];
		const localCalls: (IChatSessionStartOptions | undefined)[] = [];
		const acquired: { type: string; reason: SessionTypeSelectionReason | undefined }[] = [];
		const submissions: string[] = [];
		const onDidChangeViewModel = store.add(new Emitter<IChatWidgetViewModelChangeEvent>());
		let disposed = false;
		let inputState: Partial<IChatModelInputState> = { inputText: 'draft', selections: [] };
		const model = new class extends mock<IChatModel>() {
			override readonly sessionResource = getNewChatSessionResource(SessionType.AgentHostCopilot);
			override readonly hasActiveRequest = constObservable(false);
			override readonly requestInProgress = constObservable(false);
			override readonly requestNeedsInput = constObservable(undefined);
			override readonly inputModel = new class extends mock<IInputModel>() {
				override setState(state: Partial<IChatModelInputState>): void {
					stateUpdates.push(state);
				}
			}();
		}();
		const reference = Object.assign(store.add(toDisposable(() => disposed = true)), { object: model });
		let acquire: () => Promise<IChatModelReference | undefined> = async () => reference;
		let acquisitionToken: CancellationToken | undefined;
		const chatService = instantiationService.stub(IChatService, {
			startNewLocalSession: (_location, options) => {
				localCalls.push(options);
				return reference;
			},
			acquireOrLoadSession: async (resource, _location, token, _owner, reason) => {
				acquired.push({ type: getChatSessionType(resource), reason });
				acquisitionToken = token;
				return acquire();
			},
		});
		instantiationService.stub(IConfigurationService, configuration);
		instantiationService.stub(IChatSessionsService, { getChatSessionContribution: () => undefined, getAllChatSessionContributions: () => [] });
		instantiationService.stub(IStorageService, storage);
		instantiationService.stub(IWorkspaceContextService, new TestContextService());
		instantiationService.stub(IAgentHostEnablementService, { enabled: constObservable(true), managedSandboxEnforced: constObservable(false) });
		instantiationService.stub(IManagedSettingsService, managedSettings);
		instantiationService.stub(IAccountPolicyGateService, { gateInfo: { state: AccountPolicyGateState.Inactive }, onDidChangeGateInfo: Event.None, whenInitialized: async () => { } });
		instantiationService.stub(IContextKeyService, store.add(new MockContextKeyService()));
		instantiationService.stub(IWorkbenchLayoutService, { mainContainerDimension: { width: 800, height: 600 }, onDidLayoutMainContainer: Event.None });
		const chatWidgetService = instantiationService.stub(IChatWidgetService, {});
		instantiationService.stub(IChatEntitlementService, { sentimentObs: constObservable(upcastPartial<IChatEntitlementService['sentiment']>({ completed: true })), anonymousObs: constObservable(false) });
		Object.assign(chatService, { requestInProgressObs: constObservable(false) });
		instantiationService.stub(IMarkdownRendererService, {});
		const beforeChatDisposal = store.add(new DisposableStore());
		const chat = store.add(instantiationService.createInstance(QuickChat));
		const widget = Object.assign(store.add(toDisposable(() => { })), {
			viewModel: undefined as ChatWidget['viewModel'],
			getInputState: () => upcastPartial<IChatModelInputState>(inputState),
			setModel: (value: IChatModel): void => {
				const previousSessionResource = widget.viewModel?.sessionResource;
				boundModels.push(value);
				widget.viewModel = upcastPartial<ChatWidget['viewModel']>({ sessionResource: value.sessionResource, model: value });
				onDidChangeViewModel.fire({ previousSessionResource, currentSessionResource: value.sessionResource });
			},
			inputEditor: upcastPartial<ChatWidget['inputEditor']>({
				setValue: (inputText: string) => inputState = { ...inputState, inputText },
				getValue: () => inputState.inputText ?? '',
				setSelection: () => { },
			}),
			input: upcastPartial<ChatInputPart>({
				currentChatModesObs: constObservable(upcastPartial<IChatModes>({ waitForPendingUpdates: async () => { } })),
				currentModeObs: constObservable(ChatMode.Ask),
				onDidChangeCurrentChatMode: Event.None,
				setChatMode: () => { },
			}),
			attachmentModel: upcastPartial<ChatWidget['attachmentModel']>({ clear: () => inputState = { ...inputState, attachments: [] } }),
			onDidChangeViewModel: onDidChangeViewModel.event,
			onDidChangeHeight: Event.None,
			focusInput: () => { },
			acceptInput: async (): Promise<IChatResponseModel | undefined> => {
				submissions.push(inputState.inputText ?? '');
				return undefined;
			},
			render: () => { },
			setVisible: () => { },
			setDynamicChatTreeItemLayout: () => { },
			layoutDynamicChatTreeItemMode: () => { },
		});
		Object.assign(chat, { widget });
		const updateModel = Reflect.get(chat, 'updateModel') as (this: QuickChat, currentSessionType?: string) => Promise<void>;
		const clear = Reflect.get(chat, 'clear') as (this: QuickChat) => Promise<void>;
		const modelHost = {
			updateModel: (currentSessionType?: string) => updateModel.call(chat, currentSessionType),
			clear: () => clear.call(chat),
		};
		return {
			chat, modelHost, widget, instantiationService, chatService, chatWidgetService, configuration, beforeChatDisposal,
			acquired, localCalls, stateUpdates, boundModels, storage, reference, submissions,
			setAcquisition: (value: typeof acquire) => acquire = value,
			setInputState: (value: Partial<IChatModelInputState>) => inputState = value,
			isDisposed: () => disposed,
			getAcquisitionToken: () => acquisitionToken,
		};
	}

	function renderQuickChat(fixture: ReturnType<typeof createQuickChat>): IChatWidgetViewOptions {
		Object.assign(fixture.chat, { widget: undefined });
		fixture.instantiationService.stubInstance(ChatWidget, upcastPartial<ChatWidget>(fixture.widget));
		const child = store.add(fixture.instantiationService.createChild(new ServiceCollection()));
		sinon.stub(fixture.instantiationService, 'createChild').returns(child);
		const createInstance = sinon.spy(child, 'createInstance');
		fixture.chat.render(dom.$('div'));
		return createInstance.firstCall.args[3] as IChatWidgetViewOptions;
	}

	function createQuickChatService(fixture: ReturnType<typeof createQuickChat>) {
		fixture.beforeChatDisposal.add(toDisposable(() => service.close()));
		const onDidHide = store.add(new Emitter<IQuickInputHideEvent>());
		const input = Object.assign(store.add(toDisposable(() => onDidHide.fire({ reason: QuickInputHideReason.Other }))), { onDidHide: onDidHide.event, show: () => { } });
		fixture.instantiationService.stub(IQuickInputService, { createQuickWidget: () => upcastPartial<IQuickWidget>(input) });
		fixture.instantiationService.stub(INotificationService, {});
		const service = store.add(fixture.instantiationService.createInstance(QuickChatService));
		Object.assign(service, { _currentChat: fixture.chat });
		const doOpen = Reflect.get(service, 'doOpen') as (this: QuickChatService, options?: IQuickChatOpenOptions) => Promise<void>;
		return { service, open: (options?: IQuickChatOpenOptions) => doOpen.call(service, options) };
	}

	test('only the latest overlapping query submits after acquisition, even with a focus-only open', async () => {
		const fixture = createQuickChat();
		const service = createQuickChatService(fixture);
		const acquisition = new DeferredPromise<IChatModelReference>();
		const started = new DeferredPromise<void>();
		fixture.setAcquisition(() => {
			void started.complete();
			return acquisition.p;
		});
		const first = service.open({ query: 'first' });
		await started.p;
		const second = service.open({ query: 'second' });
		const latest = service.open({ query: 'latest' });
		await service.open();
		await acquisition.complete(fixture.reference);
		await Promise.all([first, second, latest]);
		assert.deepStrictEqual(fixture.submissions, ['latest']);
	});

	test('a later partial query cancels a pending submission without submitting its draft', async () => {
		const fixture = createQuickChat();
		const service = createQuickChatService(fixture);
		const acquisition = new DeferredPromise<IChatModelReference>();
		const started = new DeferredPromise<void>();
		fixture.setAcquisition(() => {
			void started.complete();
			return acquisition.p;
		});
		const first = service.open({ query: 'submit this' });
		await started.p;
		const partial = service.open({ query: 'still typing', isPartialQuery: true });
		await acquisition.complete(fixture.reference);
		await Promise.all([first, partial]);
		assert.deepStrictEqual({ submitted: fixture.submissions, input: fixture.widget.getInputState().inputText }, {
			submitted: [], input: 'still typing',
		});
	});

	test('opens the actual first-send session in Chat without copying its transcript to another harness', async () => {
		const fixture = createQuickChat();
		const materializedResource = URI.parse('agent-host-copilot:/materialized');
		const requests = [upcastPartial<IChatRequestModel>({ id: 'first-request' })];
		const panelState: Partial<IChatModelInputState>[] = [];
		const model = upcastPartial<IChatModel>({
			sessionResource: materializedResource,
			getRequests: () => requests,
			inputModel: upcastPartial<IInputModel>({ setState: state => panelState.push(state) }),
		});
		let materializedDisposed = false;
		const materializedReference = Object.assign(store.add(toDisposable(() => materializedDisposed = true)), { object: model });
		fixture.instantiationService.stub(IChatService, 'acquireExistingSession', (resource: URI) => resource.toString() === materializedResource.toString() ? materializedReference : undefined);
		let copiedRequests = 0;
		fixture.instantiationService.stub(IChatService, 'addCompleteRequest', () => copiedRequests++);
		const opened: { resource: URI; target: typeof ChatViewPaneTarget | undefined }[] = [];
		let focused = false;
		fixture.instantiationService.stub(IChatWidgetService, 'openSession', async (resource: URI, target?: typeof ChatViewPaneTarget) => {
			opened.push({ resource, target });
			fixture.setInputState({ inputText: '' });
			return upcastPartial<IChatWidget>({
				viewModel: upcastPartial<IChatWidget['viewModel']>({ sessionResource: materializedResource, model }),
				focusInput: () => focused = true,
			});
		});
		renderQuickChat(fixture);
		await fixture.chat.whenReady();
		fixture.widget.acceptInput = async () => {
			fixture.widget.setModel(model);
			return undefined;
		};
		await fixture.chat.acceptInput();
		const draft = { inputText: 'follow-up', attachments: [{ kind: 'file' as const, id: 'file', name: 'file.ts', value: URI.file('/workspace/file.ts') }], selections: [] };
		fixture.setInputState(draft);
		const currentResource = fixture.chat.sessionResource;
		const retainedAfterSend = !materializedDisposed;
		await fixture.chat.openChatView();
		fixture.chat.dispose();
		assert.deepStrictEqual({
			currentResource, opened, copiedRequests, panelState, focused,
			retainedAfterSend, releasedDraft: fixture.isDisposed(), releasedMaterialized: materializedDisposed,
		}, {
			currentResource: materializedResource,
			opened: [{ resource: materializedResource, target: ChatViewPaneTarget }],
			copiedRequests: 0, panelState: [draft], focused: true,
			retainedAfterSend: true, releasedDraft: true, releasedMaterialized: true,
		});
	});

	test('reports a failed panel handoff instead of opening another conversation', async () => {
		const fixture = createQuickChat();
		fixture.instantiationService.stub(IChatWidgetService, 'openSession', async () => undefined);
		await assert.rejects(fixture.chat.openChatView(), /Could not open this conversation in Chat/);
		assert.deepStrictEqual(fixture.chat.sessionResource, fixture.reference.object.sessionResource);
	});

	test('waits for the host Ask agent and submits its URI even when Agent is disabled', async () => {
		const fixture = createQuickChat({ [ChatConfiguration.AgentEnabled]: false, [ChatConfiguration.SaveBeforeSend]: false });
		const modesReady = new DeferredPromise<void>();
		const modesStarted = new DeferredPromise<void>();
		const agentUri = URI.parse('copilot-builtin:/agents/ask.agent.md');
		const ask = upcastPartial<IChatMode>({
			id: agentUri.toString(),
			kind: ChatModeKind.Ask,
			isBuiltin: false,
			name: constObservable('Ask'),
			uri: constObservable(agentUri),
			modeInstructions: constObservable({ content: '', toolReferences: [] }),
		});
		let customModes: readonly IChatMode[] = [];
		const modes: IChatModes = {
			builtin: [ChatMode.Agent, ChatMode.Ask],
			get custom() { return customModes; },
			onDidChange: Event.None,
			findModeById: id => [...customModes, ChatMode.Agent, ChatMode.Ask].find(mode => mode.id === id),
			findModeByName: name => [...customModes, ChatMode.Agent, ChatMode.Ask].find(mode => mode.name.get() === name),
			waitForPendingUpdates: () => {
				void modesStarted.complete();
				return modesReady.p;
			},
		};
		const onDidChangeCurrentChatMode = store.add(new Emitter<{ isUserInitiated: boolean }>());
		const input: ChatInputPart = Object.assign(Object.create(ChatInputPart.prototype), {
			options: {},
			_currentChatModesObservable: constObservable(modes),
			_currentModeObservable: observableValue<IChatMode>('mode', ChatMode.Ask),
			_currentPermissionLevel: constObservable(ChatPermissionLevel.Default),
			_onDidChangeCurrentChatMode: onDidChangeCurrentChatMode,
			onDidChangeCurrentChatMode: onDidChangeCurrentChatMode.event,
			accountPolicyGateService: { gateInfo: { state: AccountPolicyGateState.Inactive } },
			configurationService: fixture.configuration,
			agentService: { hasToolsAgent: false },
			toolService: { toToolReferences: () => [] },
			getAttachedContext: () => new ChatRequestVariableSet(),
		});
		fixture.widget.input = input;
		const viewOptions = renderQuickChat(fixture);
		Object.assign(input, { options: viewOptions });
		let ready = false;
		const readiness = fixture.chat.whenReady().then(() => ready = true);
		await modesStarted.p;
		const readyBeforeModes = ready;
		customModes = [ask];
		await modesReady.complete();
		await readiness;
		input.setChatMode(ChatMode.Agent.id, false);

		const submitted: { resource: URI; query: string; mode: ChatModeKind | undefined; agentUri: URI | undefined }[] = [];
		fixture.instantiationService.stub(IChatService, 'sendRequest', async (resource: URI, query: string, options?: IChatSendRequestOptions) => {
			submitted.push({ resource, query, mode: options?.modeInfo?.kind, agentUri: options?.modeInfo?.modeInstructions?.uri });
			return { kind: 'rejected', reason: 'Captured submission' };
		});
		Object.assign(fixture.widget, {
			_viewModel: fixture.widget.viewModel,
			_location: { location: ChatAgentLocation.Chat },
			viewOptions,
			location: ChatAgentLocation.Chat,
			configurationService: fixture.configuration,
			chatService: fixture.chatService,
			listWidget: { setScrollLock: () => { } },
			isSubmissionBlockedByManagedSettingsRefresh: () => false,
			_getAttachedContextForConcurrentSlashCommand: () => [],
			_executeSlashCommandDuringRequest: async () => false,
			confirmPendingRequestsBeforeSend: async () => true,
			_resolveDirectoryImageAttachments: async () => [],
			getSelectedModelRequestOptions: () => ({}),
			getModeRequestOptions: () => ({}),
			_getInstructionRouting: () => ({}),
		});
		const acceptInput = Reflect.get(ChatWidget.prototype, '_acceptInput') as (this: ChatWidget, query: { query: string }, options: IChatAcceptInputOptions) => Promise<IChatResponseModel | undefined>;
		fixture.widget.acceptInput = () => acceptInput.call(upcastPartial<ChatWidget>(fixture.widget), { query: 'Explain this code' }, { preserveInput: true });
		await fixture.chat.acceptInput();
		assert.deepStrictEqual({ readyBeforeModes, renderStyle: viewOptions.renderStyle, submitted }, {
			readyBeforeModes: false,
			renderStyle: 'compact',
			submitted: [{ resource: fixture.reference.object.sessionResource, query: 'Explain this code', mode: ChatModeKind.Ask, agentUri }],
		});
	});

	test('acquires the default harness while preserving the compact Ask draft', async () => {
		const fixture = createQuickChat();
		const acquisition = new DeferredPromise<IChatModelReference>();
		const started = new DeferredPromise<void>();
		fixture.setAcquisition(() => {
			void started.complete();
			return acquisition.p;
		});
		const ready = fixture.modelHost.updateModel();
		await started.p;
		const draft = { inputText: 'typed while starting', attachments: [{ kind: 'file' as const, id: 'file', name: 'file.ts', value: URI.file('/workspace/file.ts') }], selections: [] };
		fixture.setInputState({
			...draft,
			selectedModel: { identifier: 'local-model', metadata: upcastPartial<ILanguageModelChatMetadata>({ id: 'local-model' }) },
			modelConfiguration: { reasoningEffort: 'low' },
		});
		await acquisition.complete(fixture.reference);
		await ready;
		assert.deepStrictEqual({
			acquired: fixture.acquired,
			localCalls: fixture.localCalls,
			state: fixture.stateUpdates,
			bound: fixture.boundModels.length,
		}, {
			acquired: [{ type: SessionType.AgentHostCopilot, reason: 'computedDefault' }],
			localCalls: [],
			state: [{ ...draft, mode: { id: 'ask', kind: ChatModeKind.Ask } }],
			bound: 1,
		});
	});

	test('show reuses initialization while the initial session is still loading', async () => {
		const fixture = createQuickChat();
		const acquisition = new DeferredPromise<IChatModelReference>();
		const started = new DeferredPromise<void>();
		fixture.setAcquisition(() => {
			void started.complete();
			return acquisition.p;
		});
		const ready = fixture.chat.whenReady();
		await started.p;
		fixture.chat.show();
		const sameInitialization = ready === fixture.chat.whenReady();
		await acquisition.complete(fixture.reference);
		await ready;
		assert.deepStrictEqual({ sameInitialization, acquired: fixture.acquired.length, bound: fixture.boundModels.length }, {
			sameInitialization: true, acquired: 1, bound: 1,
		});
	});

	test('preserves current and remembered Claude and Codex choices', async () => {
		const results = [];
		for (const type of [SessionType.AgentHostClaude, SessionType.AgentHostCodex]) {
			for (const remembered of [false, true]) {
				const fixture = createQuickChat();
				if (remembered) {
					storeUserSelectedSessionType(fixture.storage, type);
				}
				await fixture.modelHost.updateModel(remembered ? undefined : type);
				results.push(fixture.acquired);
			}
		}
		assert.deepStrictEqual(results, [SessionType.AgentHostClaude, SessionType.AgentHostCodex].flatMap(type => [
			[{ type, reason: 'currentSession' }],
			[{ type, reason: 'rememberedSelection' }],
		]));
	});

	test('clearing does not erase input typed while the replacement session starts', async () => {
		const fixture = createQuickChat();
		const acquisition = new DeferredPromise<IChatModelReference>();
		const started = new DeferredPromise<void>();
		fixture.setAcquisition(() => {
			void started.complete();
			return acquisition.p;
		});
		const ready = fixture.modelHost.clear();
		await started.p;
		const draft = { inputText: 'new draft', selections: [] };
		fixture.setInputState(draft);
		await acquisition.complete(fixture.reference);
		await ready;
		assert.deepStrictEqual(fixture.stateUpdates, [{ ...draft, mode: { id: 'ask', kind: ChatModeKind.Ask } }]);
	});

	test('respects a user opt-out without changing the Ask mode', async () => {
		const fixture = createQuickChat({ [ChatConfiguration.EditorPreferCopilotHarness]: false });
		storeUserSelectedSessionType(fixture.storage, SessionType.Local);
		await fixture.modelHost.updateModel();
		assert.deepStrictEqual({
			acquired: fixture.acquired,
			local: fixture.localCalls.map(options => ({ keepAlive: options?.disableBackgroundKeepAlive, reason: options?.sessionTypeSelectionReason })),
			mode: fixture.stateUpdates[0].mode,
		}, {
			acquired: [],
			local: [{ keepAlive: true, reason: 'rememberedSelection' }],
			mode: { id: 'ask', kind: ChatModeKind.Ask },
		});
	});

	test('managed restrictions override a remembered Local opt-out', async () => {
		const fixture = createQuickChat({ [ChatConfiguration.EditorPreferCopilotHarness]: false }, new class extends NullManagedSettingsService {
			override getManagedSettings() { return { 'permissions.deny': '["Shell"]' }; }
			override getManagedSettingValue(key: string) { return key === 'permissions.deny' ? '["Shell"]' : undefined; }
		}());
		storeUserSelectedSessionType(fixture.storage, SessionType.Local);
		await fixture.modelHost.updateModel();
		assert.deepStrictEqual({ acquired: fixture.acquired, local: fixture.localCalls }, {
			acquired: [{ type: SessionType.AgentHostCopilot, reason: 'copilotPreference' }],
			local: [],
		});
	});

	test('failed non-local acquisition reports failure without creating Local', async () => {
		const fixture = createQuickChat();
		fixture.setAcquisition(async () => undefined);
		await assert.rejects(fixture.modelHost.updateModel(), /Could not start the selected chat session/);
		assert.deepStrictEqual({ local: fixture.localCalls, bound: fixture.boundModels }, { local: [], bound: [] });
	});

	test('disposal cancels acquisition and releases a late reference', async () => {
		const fixture = createQuickChat();
		const acquisition = new DeferredPromise<IChatModelReference>();
		const started = new DeferredPromise<void>();
		fixture.setAcquisition(() => {
			void started.complete();
			return acquisition.p;
		});
		const ready = fixture.modelHost.updateModel();
		await started.p;
		fixture.chat.dispose();
		await acquisition.complete(fixture.reference);
		await assert.rejects(ready, isCancellationError);
		assert.deepStrictEqual({
			cancelled: fixture.getAcquisitionToken()?.isCancellationRequested,
			disposed: fixture.isDisposed(),
			bound: fixture.boundModels,
		}, { cancelled: true, disposed: true, bound: [] });
	});
});

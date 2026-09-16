/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, raceCancellation } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostEnablementService } from '../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { CommandsRegistry, ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../../../../platform/extensions/common/extensions.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { MockContextKeyService, MockKeybindingService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IPickOptions, IQuickInputService, IQuickPickItem, QuickPickInput } from '../../../../../../platform/quickinput/common/quickInput.js';
import { IWorkspace, IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { ChatEntitlement, IChatEntitlementService, IChatSentiment } from '../../../../../services/chat/common/chatEntitlementService.js';
import { PreferredGroup, SIDE_GROUP } from '../../../../../services/editor/common/editorService.js';
import { IExtensionService } from '../../../../../services/extensions/common/extensions.js';
import { IOnboardingTryoutRunContext } from '../../../../onboarding/common/onboardingTryout.js';
import { OPEN_GITHUB_ISSUE_COMMAND, OPEN_GITHUB_PULL_REQUEST_COMMAND } from '../../../browser/actions/chatContext.js';
import { AttachContextAction, IChatAttachContextActionContext } from '../../../browser/actions/chatContextActions.js';
import { ChatAttachmentModel } from '../../../browser/attachments/chatAttachmentModel.js';
import { ChatContextPickService, IChatContextPickService, IChatContextValueItem } from '../../../browser/attachments/chatContextPickService.js';
import { IChatWidget, IChatWidgetService, IChatWidgetViewModelChangeEvent } from '../../../browser/chat.js';
import { ChatDraftTryoutPresentation } from '../../../browser/onboarding/chatDraftTryoutPresentation.js';
import { ChatInputPart } from '../../../browser/widget/input/chatInputPart.js';
import { IChatEditorOptions } from '../../../browser/widgetHosts/editor/chatEditor.js';
import { IChatRequestVariableEntry } from '../../../common/attachments/chatVariableEntries.js';
import { ChatMode, IChatMode, IChatModeService, IChatModes } from '../../../common/chatModes.js';
import { IChatModelReference, IChatService } from '../../../common/chatService/chatService.js';
import { IChatSessionsService, localChatSessionType, ResolvedChatSessionsExtensionPoint, SessionType } from '../../../common/chatSessionsService.js';
import { ChatConfiguration, ChatModeKind } from '../../../common/constants.js';
import { ILanguageModelsService } from '../../../common/languageModels.js';
import { IChatModel, IChatModelInputState } from '../../../common/model/chatModel.js';
import { LocalChatSessionUri } from '../../../common/model/chatUri.js';
import { IChatViewModel } from '../../../common/model/chatViewModel.js';
import { IChatDraftTryoutPayload, isChatDraftTryoutPayload } from '../../../common/onboarding/chatDraftTryout.js';
import { Target } from '../../../common/promptSyntax/promptTypes.js';

const draftPayload: IChatDraftTryoutPayload = { sessionType: localChatSessionType, mode: ChatModeKind.Ask, prompt: 'Review before sending' };
const githubPayload: IChatDraftTryoutPayload = {
	...draftPayload,
	attachContext: {
		commandIds: [OPEN_GITHUB_ISSUE_COMMAND, OPEN_GITHUB_PULL_REQUEST_COMMAND],
		extensionId: 'GitHub.copilot-chat',
	},
};

class ContextQuickInputService extends mock<IQuickInputService>() {
	selection = 0;
	labels: string[] = [];
	beforePick: () => Promise<void> = async () => { };

	override pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: IPickOptions<T> & { canPickMany: true }, token?: CancellationToken): Promise<T[] | undefined>;
	override pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: IPickOptions<T> & { canPickMany: false }, token?: CancellationToken): Promise<T | undefined>;
	override pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: Omit<IPickOptions<T>, 'canPickMany'>, token?: CancellationToken): Promise<T | undefined>;
	override async pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: IPickOptions<T>, token = CancellationToken.None): Promise<T | T[] | undefined> {
		const items = (await picks).filter((item): item is T => item.type !== 'separator');
		this.labels = items.map(item => item.label);
		await raceCancellation(this.beforePick(), token);
		const selected = items[this.selection];
		return token.isCancellationRequested || !selected ? undefined : options?.canPickMany ? [selected] : selected;
	}
}

class TestChatDraft extends Disposable {
	readonly instantiationService = this._register(new TestInstantiationService());
	readonly contextStore = this._register(new DisposableStore());
	readonly cancellation = this._register(new CancellationTokenSource());
	readonly context: IOnboardingTryoutRunContext = { id: 'chat.test', token: this.cancellation.token, store: this.contextStore };
	readonly configuration = new TestConfigurationService({ [ChatConfiguration.AgentEnabled]: true });
	readonly sentiment: IChatSentiment = { installed: true, completed: true };
	readonly sentimentChanged = this._register(new Emitter<void>());
	readonly removedWidget = this._register(new Emitter<IChatWidget>());
	readonly changedViewModel = this._register(new Emitter<IChatWidgetViewModelChangeEvent>());
	readonly agentHostEnabled = observableValue(this, true);
	readonly managedSandboxEnforced = observableValue(this, false);
	readonly currentMode = observableValue<IChatMode>(this, ChatMode.Ask);
	readonly quickInput = new ContextQuickInputService();
	readonly contextPicks: IChatContextPickService = new ChatContextPickService();
	readonly extensions: IExtensionDescription[] = [upcastPartial<IExtensionDescription>({ identifier: new ExtensionIdentifier('GitHub.copilot-chat') })];
	readonly commands: { id: string; context: IChatAttachContextActionContext | undefined }[] = [];
	readonly opened: { resource: URI; target: PreferredGroup | undefined; options: IChatEditorOptions | undefined }[] = [];
	readonly attached: IChatRequestVariableEntry[] = [];
	readonly boundWidgets: IChatWidget[] = [];
	readonly activations: string[] = [];
	readonly originalState = { input: 'Existing unsent message', attachments: ['existing attachment'], running: true, pendingEdits: ['edited.ts'] };
	readonly availableModes: IChatMode[] = [ChatMode.Ask, ChatMode.Edit, ChatMode.Agent];

	createdModels = 0;
	releasedModels = 0;
	releasedModes = 0;
	focused = 0;
	sends = 0;
	entitlement = ChatEntitlement.Pro;
	draftState: IChatModelInputState | undefined;
	model: IChatModel | undefined;
	widgetResource: URI | undefined;
	contribution: ResolvedChatSessionsExtensionPoint | undefined;
	canResolveProvider = true;
	providerHasAutoModel = true;
	providerRequiresModels = false;
	providerRequiresSignIn = false;
	activateExtension: () => Promise<void> = async () => { };
	waitForModes: () => Promise<void> = async () => { };
	openSession: () => Promise<void> = async () => { };
	acquireModel: () => Promise<void> = async () => { };
	resolveAttachment: () => Promise<IChatRequestVariableEntry | undefined> = async () => ({ kind: 'generic', id: 'chosen', name: 'Chosen issue', value: 'chosen issue' });

	readonly widget: IChatWidget;
	readonly existingWidget: IChatWidget;
	readonly presentation: ChatDraftTryoutPresentation;

	constructor() {
		super();
		this._register(this.configuration.onDidChangeConfigurationEmitter);
		const fixture = this;
		this.widget = upcastPartial<IChatWidget>({
			getInput: () => this.draftState?.inputText ?? '',
			getInputState: () => this.draftState,
			get viewModel() { return fixture.widgetResource ? upcastPartial<IChatViewModel>({ sessionResource: fixture.widgetResource, model: fixture.model }) : undefined; },
			onDidChangeViewModel: this.changedViewModel.event,
			input: upcastPartial<ChatInputPart>({ currentModeObs: this.currentMode }),
			attachmentModel: upcastPartial<ChatAttachmentModel>({ addContext: (...entries: IChatRequestVariableEntry[]) => this.attached.push(...entries) }),
			focusInput: () => this.focused++,
			acceptInput: async () => { this.sends++; return undefined; },
		});
		this.existingWidget = upcastPartial<IChatWidget>({
			getInput: () => this.originalState.input,
			setInput: value => { this.originalState.input = value ?? ''; },
			viewModel: upcastPartial<IChatViewModel>({ sessionResource: LocalChatSessionUri.forSession('existing') }),
			attachmentModel: upcastPartial<ChatAttachmentModel>({ addContext: (...entries: IChatRequestVariableEntry[]) => this.originalState.attachments.push(...entries.map(entry => entry.id)) }),
			clear: async () => {
				this.originalState.input = '';
				this.originalState.attachments.length = 0;
				this.originalState.running = false;
				this.originalState.pendingEdits.length = 0;
			},
			acceptInput: async () => { this.sends++; return undefined; },
		});
		this.instantiationService.set(IConfigurationService, this.configuration);
		this.instantiationService.set(IContextKeyService, new MockContextKeyService());
		this.instantiationService.set(IKeybindingService, new MockKeybindingService());
		this.instantiationService.set(IQuickInputService, this.quickInput);
		this.instantiationService.set(IChatContextPickService, this.contextPicks);
		this.instantiationService.set(IChatEntitlementService, upcastPartial<IChatEntitlementService>({
			sentiment: this.sentiment,
			get entitlement() { return fixture.entitlement; },
			anonymous: false,
			clientByokEnabled: false,
			hasByokModels: false,
			onDidChangeSentiment: this.sentimentChanged.event,
			onDidChangeEntitlement: Event.None,
			onDidChangeAnonymous: Event.None,
		}));
		this.instantiationService.set(IChatWidgetService, upcastPartial<IChatWidgetService>({
			get lastFocusedWidget(): IChatWidget | undefined { throw new Error('A tryout must not use the last focused widget'); },
			onDidRemoveWidget: this.removedWidget.event,
			getAllWidgets: () => [this.existingWidget, this.widget],
			openSession: async (resource, target, options) => {
				assert.notStrictEqual(typeof target, 'symbol');
				assert.strictEqual(isEqual(resource, this.existingWidget.viewModel?.sessionResource), false);
				this.opened.push({ resource, target: typeof target === 'symbol' ? undefined : target, options });
				this.widgetResource = resource;
				this.draftState = options?.modelInputState && { ...options.modelInputState };
				this.currentMode.set(this.availableModes.find(mode => mode.id === options?.modelInputState?.mode.id) ?? ChatMode.Agent, undefined);
				await this.openSession();
				return this.widget;
			},
			getWidgetBySessionResource: resource => isEqual(resource, this.widgetResource) ? this.widget
				: isEqual(resource, this.existingWidget.viewModel?.sessionResource) ? this.existingWidget : undefined,
		}));
		this.instantiationService.set(IChatService, upcastPartial<IChatService>({
			isEnabled: () => true,
			activateDefaultAgent: async () => { },
			startNewLocalSession: () => this.createModel(LocalChatSessionUri.forSession(`draft-${this.createdModels}`)),
			acquireOrLoadSession: async resource => { await this.acquireModel(); return this.createModel(resource); },
			sendRequest: async () => { this.sends++; throw new Error('A tryout must not send a request'); },
		}));
		this.instantiationService.set(IChatModeService, upcastPartial<IChatModeService>({
			createModes: () => Object.assign(toDisposable(() => this.releasedModes++), upcastPartial<IChatModes>({
				findModeById: id => this.availableModes.find(mode => mode.id === id),
				waitForPendingUpdates: () => this.waitForModes(),
			})),
		}));
		this.instantiationService.set(IChatSessionsService, upcastPartial<IChatSessionsService>({
			onDidChangeAvailability: Event.None,
			getChatSessionContribution: () => this.contribution,
			getAllChatSessionContributions: () => this.contribution ? [this.contribution] : [],
			canResolveChatSession: async () => this.canResolveProvider,
			getCustomAgentTargetForSessionType: () => Target.Undefined,
			supportsAutoModelForSessionType: () => this.providerHasAutoModel,
			requiresCustomModelsForSessionType: () => this.providerRequiresModels,
			requiresCopilotSignInForSessionType: () => this.providerRequiresSignIn,
		}));
		this.instantiationService.set(ILanguageModelsService, upcastPartial<ILanguageModelsService>({
			onDidChangeLanguageModels: Event.None,
			onDidChangeModelVisibility: Event.None,
			getLanguageModelIds: () => [],
		}));
		this.instantiationService.set(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({
			getWorkspace: () => upcastPartial<IWorkspace>({ folders: [] }),
		}));
		this.instantiationService.set(IAgentHostEnablementService, upcastPartial<IAgentHostEnablementService>({
			enabled: this.agentHostEnabled,
			managedSandboxEnforced: this.managedSandboxEnforced,
		}));
		this.instantiationService.set(IExtensionService, upcastPartial<IExtensionService>({
			extensions: this.extensions,
			onDidRegisterExtensions: Event.None,
			onDidChangeExtensions: Event.None,
			whenInstalledExtensionsRegistered: async () => true,
			activateById: async identifier => {
				this.activations.push(identifier.value);
				await this.activateExtension();
			},
			activateByEvent: async event => { this.activations.push(event); },
		}));
		this.instantiationService.set(ICommandService, upcastPartial<ICommandService>({
			executeCommand: async <T>(id: string, context?: IChatAttachContextActionContext): Promise<T> => {
				assert.strictEqual(id, AttachContextAction.ID);
				this.commands.push({ id, context });
				return await new AttachContextAction().run(this.instantiationService, context) as T;
			},
		}));
		this.presentation = this._register(this.instantiationService.createInstance(ChatDraftTryoutPresentation));
	}

	private createModel(resource: URI): IChatModelReference {
		this.createdModels++;
		this.model = upcastPartial<IChatModel>({ sessionResource: resource, hasRequests: false, requestInProgress: constObservable(false) });
		return { object: this.model, dispose: () => this.releasedModels++ };
	}

	registerContext(commandId: string, label: string, isEnabled: IChatContextValueItem['isEnabled'] = () => true): void {
		this._register(CommandsRegistry.registerCommand(commandId, () => { throw new Error('Use the registered context item, not its command directly'); }));
		this._register(this.contextPicks.registerChatContextItem({
			type: 'valuePick', commandId, label, icon: Codicon.issues, isEnabled,
			asAttachment: async widget => {
				this.boundWidgets.push(widget);
				return this.resolveAttachment();
			},
		}));
	}

	registerGitHubContexts(): void {
		this.registerContext(OPEN_GITHUB_ISSUE_COMMAND, 'Localized issue picker');
		this.registerContext(OPEN_GITHUB_PULL_REQUEST_COMMAND, 'Localized pull request picker');
	}

	async prepare(payload = draftPayload) {
		return this.presentation.prepare(payload, this.context);
	}

	async run(payload = draftPayload) {
		const preparation = await this.prepare(payload);
		return preparation.kind === 'ready' ? preparation.run() : preparation;
	}
}

suite('Chat draft tryouts', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const create = () => store.add(new TestChatDraft());

	test('validates explicit providers, built-in modes and picker identifiers', () => {
		assert.deepStrictEqual([
			isChatDraftTryoutPayload(draftPayload),
			isChatDraftTryoutPayload(githubPayload),
			isChatDraftTryoutPayload({ ...draftPayload, mode: 'missing-mode' }),
			isChatDraftTryoutPayload({ ...draftPayload, sessionType: 'not a provider' }),
			isChatDraftTryoutPayload({ ...draftPayload, attachContext: { commandIds: [] } }),
			isChatDraftTryoutPayload({ ...draftPayload, attachContext: { commandIds: ['same', 'same'] } }),
			isChatDraftTryoutPayload({ ...draftPayload, attachContext: { commandIds: [42] } }),
		], [true, true, false, false, false, false, false]);
	});

	test('opens a separate pinned draft with explicit mode and provider, preserving existing state and sending nothing', async () => {
		const test = create();
		const existing = structuredClone(test.originalState);
		const preparation = await test.prepare();
		assert.strictEqual(test.opened.length, 0);
		assert.strictEqual(preparation.kind, 'ready');
		if (preparation.kind !== 'ready') {
			assert.fail('Expected a prepared draft');
		}
		const result = await preparation.run();
		test.contextStore.dispose();
		assert.deepStrictEqual({
			result,
			openCount: test.opened.length,
			target: test.opened[0].target,
			pinned: test.opened[0].options?.pinned,
			explicitProvider: test.opened[0].options?.explicitSessionType,
			reason: test.opened[0].options?.sessionTypeSelectionReason,
			draft: test.widget.getInputState(),
			existing: test.originalState,
			sends: test.sends,
			releasedModels: test.releasedModels,
			releasedModes: test.releasedModes,
		}, {
			result: { kind: 'prepared' },
			openCount: 1,
			target: SIDE_GROUP,
			pinned: true,
			explicitProvider: localChatSessionType,
			reason: 'explicitOverride',
			draft: { inputText: draftPayload.prompt, mode: { id: 'ask', kind: 'ask' }, attachments: [], selectedModel: undefined, selections: [], contrib: {} },
			existing,
			sends: 0,
			releasedModels: 1,
			releasedModes: 1,
		});
	});

	test('binds the chosen registered GitHub picker to the exact new widget, not the focused chat', async () => {
		const test = create();
		test.registerGitHubContexts();
		test.quickInput.selection = 1;
		const result = await test.run(githubPayload);
		assert.deepStrictEqual({
			result,
			labels: test.quickInput.labels,
			commands: test.commands.map(command => ({ id: command.id, picker: command.context?.contextItemCommandId, exactWidget: command.context?.widget === test.widget })),
			boundWidgets: test.boundWidgets.map(widget => widget === test.widget),
			attachments: test.attached.map(entry => entry.id),
			input: test.widget.getInput(),
			sends: test.sends,
		}, {
			result: { kind: 'prepared' },
			labels: ['Localized issue picker', 'Localized pull request picker'],
			commands: [{ id: AttachContextAction.ID, picker: OPEN_GITHUB_PULL_REQUEST_COMMAND, exactWidget: true }],
			boundWidgets: [true],
			attachments: ['chosen'],
			input: draftPayload.prompt,
			sends: 0,
		});
	});

	test('preserves text typed in the new draft while its editor is opening', async () => {
		const test = create();
		test.openSession = async () => {
			assert.ok(test.draftState);
			test.draftState.inputText = 'Text typed while opening';
		};
		assert.deepStrictEqual({ result: await test.run(), input: test.widget.getInput(), sends: test.sends }, {
			result: { kind: 'prepared' }, input: 'Text typed while opening', sends: 0,
		});
	});

	for (const property of ['hidden', 'disabled', 'disabledInWorkspace', 'untrusted'] as const) {
		test(`respects Chat sentiment: ${property}`, async () => {
			const test = create();
			test.sentiment[property] = true;
			const result = await test.run();
			assert.deepStrictEqual({ kind: result.kind, created: test.createdModels, opened: test.opened.length, sends: test.sends }, {
				kind: property === 'hidden' ? 'cancelled' : 'unavailable', created: 0, opened: 0, sends: 0,
			});
		});
	}

	test('requires setup instead of using the existing chat or changing a default', async () => {
		const test = create();
		test.sentiment.completed = false;
		const result = await test.run();
		assert.deepStrictEqual({ kind: result.kind, hasSetup: result.kind === 'unavailable' && !!result.action, created: test.createdModels }, {
			kind: 'unavailable', hasSetup: true, created: 0,
		});
	});

	test('does not fall back when the requested mode is disabled or unregistered', async () => {
		const disabled = create();
		await disabled.configuration.setUserConfiguration(ChatConfiguration.AgentEnabled, false);
		const unavailable = create();
		unavailable.availableModes.splice(0, 1);
		assert.deepStrictEqual({
			disabled: (await disabled.run({ ...draftPayload, mode: ChatModeKind.Agent })).kind,
			unregistered: (await unavailable.run()).kind,
			created: [disabled.createdModels, unavailable.createdModels],
			sends: disabled.sends + unavailable.sends,
		}, { disabled: 'unavailable', unregistered: 'unavailable', created: [0, 0], sends: 0 });
	});

	test('does not bypass a disabled local provider or the managed sandbox floor', async () => {
		const disabled = create();
		await disabled.configuration.setUserConfiguration(ChatConfiguration.EditorLocalAgentEnabled, false);
		const managed = create();
		managed.managedSandboxEnforced.set(true, undefined);
		assert.deepStrictEqual({
			disabled: (await disabled.run()).kind, managed: (await managed.run()).kind,
			opened: disabled.opened.length + managed.opened.length,
		}, { disabled: 'unavailable', managed: 'unavailable', opened: 0 });
	});

	test('does not replace an unavailable contributed provider with local Chat', async () => {
		const test = create();
		test.contribution = upcastPartial<ResolvedChatSessionsExtensionPoint>({ type: SessionType.AgentHostCopilot });
		test.canResolveProvider = false;
		const result = await test.run({ ...draftPayload, sessionType: SessionType.AgentHostCopilot });
		assert.deepStrictEqual({ kind: result.kind, created: test.createdModels, opened: test.opened.length }, { kind: 'unavailable', created: 0, opened: 0 });
	});

	test('respects provider-owned model availability', async () => {
		const test = create();
		test.contribution = upcastPartial<ResolvedChatSessionsExtensionPoint>({ type: SessionType.AgentHostClaude });
		test.providerHasAutoModel = false;
		test.providerRequiresModels = true;
		const result = await test.run({ ...draftPayload, sessionType: SessionType.AgentHostClaude });
		assert.deepStrictEqual({ kind: result.kind, created: test.createdModels, sends: test.sends }, { kind: 'unavailable', created: 0, sends: 0 });
	});

	test('respects the requested provider sign-in requirement instead of selecting a different provider', async () => {
		const test = create();
		test.entitlement = ChatEntitlement.Unknown;
		test.contribution = upcastPartial<ResolvedChatSessionsExtensionPoint>({ type: SessionType.AgentHostCopilot });
		test.providerRequiresSignIn = true;
		const result = await test.run({ ...draftPayload, sessionType: SessionType.AgentHostCopilot });
		assert.deepStrictEqual({ kind: result.kind, hasSetup: result.kind === 'unavailable' && !!result.action, created: test.createdModels }, {
			kind: 'unavailable', hasSetup: true, created: 0,
		});
	});

	test('retains an explicitly requested contributed provider without changing defaults', async () => {
		const test = create();
		test.contribution = upcastPartial<ResolvedChatSessionsExtensionPoint>({ type: SessionType.AgentHostCopilot });
		const result = await test.run({ ...draftPayload, sessionType: SessionType.AgentHostCopilot, mode: ChatModeKind.Agent });
		assert.deepStrictEqual({
			result, provider: test.opened[0]?.resource.scheme, explicitProvider: test.opened[0]?.options?.explicitSessionType,
			mode: test.draftState?.mode.id, sends: test.sends,
		}, { result: { kind: 'prepared' }, provider: SessionType.AgentHostCopilot, explicitProvider: SessionType.AgentHostCopilot, mode: 'agent', sends: 0 });
	});

	test('activates an installed extension before judging lazily registered picker commands', async () => {
		const test = create();
		test.activateExtension = async () => test.registerGitHubContexts();
		const availability = test.presentation.getAvailability(githubPayload);
		const result = await test.run(githubPayload);
		assert.deepStrictEqual({ availability: availability.kind, result: result.kind, activations: test.activations, attached: test.attached.length }, {
			availability: 'ready', result: 'prepared', activations: ['GitHub.copilot-chat'], attached: 1,
		});
	});

	test('offers setup for a missing extension, and reports missing picker registration after activation', async () => {
		const absent = create();
		absent.extensions.length = 0;
		const missing = await absent.run(githubPayload);
		const unregistered = create();
		const unavailable = await unregistered.run(githubPayload);
		assert.deepStrictEqual({
			missing: missing.kind,
			setup: missing.kind === 'unavailable' ? missing.action?.command : undefined,
			unregistered: unavailable.kind,
			created: absent.createdModels + unregistered.createdModels,
		}, {
			missing: 'unavailable',
			setup: { id: 'workbench.extensions.action.showExtensionsWithIds', arguments: [['GitHub.copilot-chat']] },
			unregistered: 'unavailable',
			created: 0,
		});
	});

	test('reports a picker disabled for the new widget without substituting another picker', async () => {
		const test = create();
		test.registerContext(OPEN_GITHUB_ISSUE_COMMAND, 'Disabled', widget => {
			assert.strictEqual(widget, test.widget);
			return false;
		});
		const result = await test.run({ ...draftPayload, attachContext: { commandIds: [OPEN_GITHUB_ISSUE_COMMAND] } });
		assert.deepStrictEqual({ kind: result.kind, commands: test.commands.length, attached: test.attached.length, sends: test.sends }, {
			kind: 'unavailable', commands: 0, attached: 0, sends: 0,
		});
	});

	test('does no work when cancelled before preparation', async () => {
		const test = create();
		test.cancellation.cancel();
		assert.deepStrictEqual({ result: await test.run(), created: test.createdModels, opened: test.opened.length }, {
			result: { kind: 'cancelled' }, created: 0, opened: 0,
		});
	});

	test('honors cancellation during asynchronous mode preparation', async () => {
		const test = create();
		const reached = new DeferredPromise<void>();
		const pending = new DeferredPromise<void>();
		test.waitForModes = async () => { reached.complete(); await pending.p; };
		const preparation = test.prepare();
		await reached.p;
		test.cancellation.cancel();
		const result = await preparation;
		pending.complete();
		assert.deepStrictEqual({ result, created: test.createdModels, opened: test.opened.length }, { result: { kind: 'cancelled' }, created: 0, opened: 0 });
	});

	test('releases a model returned after the preparation store is disposed', async () => {
		const test = create();
		const reached = new DeferredPromise<void>();
		const pending = new DeferredPromise<void>();
		test.contribution = upcastPartial<ResolvedChatSessionsExtensionPoint>({ type: SessionType.AgentHostCopilot });
		test.acquireModel = async () => { reached.complete(); await pending.p; };
		const preparation = test.prepare({ ...draftPayload, sessionType: SessionType.AgentHostCopilot });
		await reached.p;
		test.contextStore.dispose();
		pending.complete();
		const result = await preparation;
		assert.deepStrictEqual({ result, created: test.createdModels, released: test.releasedModels, opened: test.opened.length }, {
			result: { kind: 'cancelled' }, created: 1, released: 1, opened: 0,
		});
	});

	for (const dispose of ['context', 'presentation'] as const) {
		test(`does not open a prepared draft after ${dispose} disposal`, async () => {
			const test = create();
			const preparation = await test.prepare();
			assert.strictEqual(preparation.kind, 'ready');
			if (preparation.kind !== 'ready') {
				assert.fail('Expected preparation');
			}
			if (dispose === 'context') {
				test.contextStore.dispose();
			} else {
				test.presentation.dispose();
			}
			assert.deepStrictEqual({ result: await preparation.run(), opened: test.opened.length }, { result: { kind: 'cancelled' }, opened: 0 });
		});
	}

	test('does not execute the action or refocus when cancelled while opening the draft', async () => {
		const test = create();
		test.registerGitHubContexts();
		test.openSession = async () => test.cancellation.cancel();
		assert.deepStrictEqual({ result: await test.run(githubPayload), commands: test.commands.length, focused: test.focused, input: test.widget.getInput() }, {
			result: { kind: 'cancelled' }, commands: 0, focused: 0, input: draftPayload.prompt,
		});
	});

	test('stops if the exact widget is removed while choosing an attachment picker', async () => {
		const test = create();
		test.registerGitHubContexts();
		test.quickInput.beforePick = async () => test.removedWidget.fire(test.widget);
		assert.deepStrictEqual({ result: await test.run(githubPayload), commands: test.commands.length, attached: test.attached.length }, {
			result: { kind: 'cancelled' }, commands: 0, attached: 0,
		});
	});

	test('does not attach a late picker result after the widget changes sessions', async () => {
		const test = create();
		test.registerGitHubContexts();
		const reached = new DeferredPromise<void>();
		const pending = new DeferredPromise<IChatRequestVariableEntry | undefined>();
		test.resolveAttachment = () => { reached.complete(); return pending.p; };
		const running = test.run(githubPayload);
		await reached.p;
		const previous = test.widgetResource;
		test.widgetResource = LocalChatSessionUri.forSession('other');
		test.changedViewModel.fire({ previousSessionResource: previous, currentSessionResource: test.widgetResource });
		const result = await running;
		pending.complete({ kind: 'generic', id: 'late', name: 'Late result', value: 'late' });
		await pending.p;
		assert.deepStrictEqual({ result, attached: test.attached.length, focused: test.focused, sends: test.sends }, {
			result: { kind: 'cancelled' }, attached: 0, focused: 0, sends: 0,
		});
	});

	test('rechecks Chat enablement after awaiting the picker', async () => {
		const test = create();
		test.registerGitHubContexts();
		test.quickInput.beforePick = async () => {
			test.sentiment.hidden = true;
			test.sentimentChanged.fire();
		};
		assert.deepStrictEqual({ result: await test.run(githubPayload), commands: test.commands.length, sends: test.sends }, {
			result: { kind: 'cancelled' }, commands: 0, sends: 0,
		});
	});
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/phonon.css';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../nls.js';
import { registerAction2, Action2 } from '../../../../platform/actions/common/actions.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IPhononCliService } from '../../../../platform/phonon/common/phononCliService.js';
import { IPhononAgentMainService } from '../../../../platform/phonon/common/phononAgentService.js';
import { IPhononTeamsService } from '../../../../platform/phonon/common/phononTeamsService.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { IViewsRegistry, Extensions as ViewExtensions, IViewContainersRegistry } from '../../../common/views.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { ChatEntitlementContextKeys } from '../../../services/chat/common/chatEntitlementService.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';
import { IChatAgentService } from '../../chat/common/participants/chatAgents.js';
import { ChatAgentLocation, ChatModeKind } from '../../chat/common/constants.js';
import { ILanguageModelsService } from '../../chat/common/languageModels.js';
import { ChatViewContainerId, IChatWidgetService } from '../../chat/browser/chat.js';
import { sessionOpenerRegistry } from '../../chat/browser/agentSessions/agentSessionsOpener.js';
import { ACTIVE_GROUP, IEditorService } from '../../../services/editor/common/editorService.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../services/editor/common/editorResolverService.js';
import { ISpeechService } from '../../speech/common/speechService.js';
import { IPhononService, PHONON_CLAUDE_AGENT_ID, PHONON_CLAUDE_VENDOR } from '../common/phonon.js';
import { IPhononAgentPoolService } from '../common/phononAgentPool.js';
import '../common/phononConfiguration.js';
import { PhononService } from './phononService.js';
import { PhononLanguageModelProvider } from './phononLanguageModel.js';
import { PhononChatAgentImpl } from './phononChatAgent.js';
import { PhononAgentPoolService } from './phononAgentPoolService.js';
import { PhononWebSpeechProvider } from './phononSpeechProvider.js';
import { PhononMcpBridge } from './phononMcpBridge.js';
import { PhononPlaywrightMcpTools } from './phononPlaywrightMcpTools.js';
import { AgentPoolViewPane } from './views/agentPoolViewPane.js';
import { PhononHUDContribution } from './views/phononAgentHUD.js';
import { ILiquidModuleRegistry } from '../common/liquidModule.js';
import { LiquidModuleRegistry } from './liquidModuleRegistry.js';
import { registerLiquidExtensionPointHandlers } from './liquidExtensionPoints.js';
import { registerLiquidSidebarTreeView } from './liquidSidebarTreeView.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { registerEditorContribution, EditorContributionInstantiation } from '../../../../editor/browser/editorExtensions.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { EditorExtensions, IEditorSerializer, IEditorFactoryRegistry } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { URI } from '../../../../base/common/uri.js';
import { PhononEditor } from './views/phononEditor.js';
import { PhononEditorInput } from './views/phononEditorInput.js';
import { LiquidCanvasEditor } from './views/liquidCanvasEditor.js';
import { LiquidCanvasEditorInput } from './views/liquidCanvasEditorInput.js';

// --- Singleton registration ---

registerSingleton(IPhononService, PhononService, InstantiationType.Delayed);
registerSingleton(IPhononAgentPoolService, PhononAgentPoolService, InstantiationType.Delayed);
registerSingleton(ILiquidModuleRegistry, LiquidModuleRegistry, InstantiationType.Eager);

// --- Workbench contribution: registers vendor, provider, and agent ---

class PhononContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.phonon';

	private _mcpBridge: PhononMcpBridge | undefined;

	constructor(
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IPhononService private readonly phononService: IPhononService,
		@ILogService private readonly logService: ILogService,
		@IPhononAgentPoolService private readonly agentPoolService: IPhononAgentPoolService,
		@IEditorResolverService private readonly editorResolverService: IEditorResolverService,
		@ISpeechService private readonly speechService: ISpeechService,
		@ILiquidModuleRegistry private readonly liquidModuleRegistry: ILiquidModuleRegistry,
		@IEditorService private readonly editorService: IEditorService,
	) {
		super();
		this._markChatProviderInstalled();
		this._registerVendorAndProvider();
		this._registerChatAgent();
		this._wireAgentPoolService();
		this._registerEditorResolver();
		this._registerCanvasEditorResolver();
		this._registerSessionOpener();
		this._overrideRevealWidget();
		this._registerSpeechProvider();
		this._registerMcpBridge();
		this._wireIntentToCanvas();
		this._registerPlaywrightTools();
		registerLiquidExtensionPointHandlers(this.liquidModuleRegistry as LiquidModuleRegistry);
		registerLiquidSidebarTreeView(this.instantiationService, this.liquidModuleRegistry, this.logService);
	}

	private _markChatProviderInstalled(): void {
		// Tell the chat UI that a chat provider is installed (bypasses Copilot extension check).
		ChatEntitlementContextKeys.Setup.installed.bindTo(this.contextKeyService).set(true);
		ChatEntitlementContextKeys.Setup.registered.bindTo(this.contextKeyService).set(true);

		// Enable the chat system. registerDynamicAgent does NOT set this.
		ChatContextKeys.enabled.bindTo(this.contextKeyService).set(true);
		ChatContextKeys.panelParticipantRegistered.bindTo(this.contextKeyService).set(true);
	}

	private _registerVendorAndProvider(): void {
		// Step 1: Register the "phonon" vendor descriptor
		this.languageModelsService.deltaLanguageModelChatProviderDescriptors(
			[{
				vendor: PHONON_CLAUDE_VENDOR,
				displayName: 'Phonon (Claude)',
				configuration: undefined,
				managementCommand: undefined,
				when: undefined,
			}],
			[]
		);

		// Step 2: Create and register the language model provider
		const provider = this.instantiationService.createInstance(PhononLanguageModelProvider);
		this._register(provider);
		this._register(this.languageModelsService.registerLanguageModelProvider(PHONON_CLAUDE_VENDOR, provider));

		// Step 3: Wire CLI service if available (desktop only - uses Max subscription)
		this._wireCliService(provider);

		// Step 4: Trigger model cache population
		provider.triggerInitialModelResolution();
	}

	private _wireCliService(provider: PhononLanguageModelProvider): void {
		// Try to get the CLI service. Only available on desktop (registered via
		// registerMainProcessRemoteService in electron-browser/phononCliService.ts).
		try {
			const cliService = this.instantiationService.invokeFunction(accessor => accessor.get(IPhononCliService));
			provider.setCliService(cliService);

			// Check availability and update PhononService
			cliService.isAvailable().then(available => {
				this.phononService.setCliAvailable(available);
				if (available) {
					this.logService.info('[Phonon] Claude CLI detected - using subprocess mode (Max subscription)');
				} else {
					this.logService.info('[Phonon] Claude CLI not found - using HTTP API mode');
				}
			}).catch(() => {
				this.logService.warn('[Phonon] Failed to check CLI availability');
			});
		} catch {
			// Not on desktop or CLI service not registered - HTTP fallback
			this.logService.info('[Phonon] CLI service not available (web mode?) - using HTTP API mode');
		}
	}

	private _wireAgentPoolService(): void {
		// Wire the agent main process service to the browser-side pool service.
		// Same pattern as _wireCliService -- only available on desktop.
		try {
			const agentMainService = this.instantiationService.invokeFunction(accessor => accessor.get(IPhononAgentMainService));
			(this.agentPoolService as PhononAgentPoolService).setAgentMainService(agentMainService);
			this.logService.info('[Phonon] Agent pool service wired to main process');
		} catch {
			this.logService.info('[Phonon] Agent main service not available (web mode?) -- agent pool disabled');
		}

		// Wire Teams SDK service (optional -- enhances agent pool with structured delegation)
		try {
			const teamsService = this.instantiationService.invokeFunction(accessor => accessor.get(IPhononTeamsService));
			(this.agentPoolService as PhononAgentPoolService).setTeamsService(teamsService);
		} catch {
			this.logService.info('[Phonon] Teams service not available -- using subprocess mode');
		}
	}

	private _registerEditorResolver(): void {
		this._register(this.editorResolverService.registerEditor(
			`phonon-editor:**/**`,
			{
				id: PhononEditorInput.EditorID,
				label: localize('phonon', "Phonon"),
				priority: RegisteredEditorPriority.builtin
			},
			{
				singlePerResource: true,
				canSupportResource: resource => resource.scheme === 'phonon-editor',
			},
			{
				createEditorInput: ({ resource, options }) => {
					return {
						editor: this.instantiationService.createInstance(PhononEditorInput, resource),
						options
					};
				}
			}
		));
	}

	private _registerCanvasEditorResolver(): void {
		this._register(this.editorResolverService.registerEditor(
			`phonon-canvas:**/**`,
			{
				id: LiquidCanvasEditorInput.EditorID,
				label: localize('phononCanvas', "Phonon Canvas"),
				priority: RegisteredEditorPriority.builtin
			},
			{
				singlePerResource: true,
				canSupportResource: resource => resource.scheme === 'phonon-canvas',
			},
			{
				createEditorInput: ({ resource, options }) => {
					return {
						editor: this.instantiationService.createInstance(LiquidCanvasEditorInput, resource),
						options
					};
				}
			}
		));
	}

	private _wireIntentToCanvas(): void {
		if (!this._mcpBridge) {
			return;
		}

		this._register(this._mcpBridge.onDidReceiveIntent(async (intent) => {
			this.logService.info(`[Phonon] Composition intent received: layout=${intent.layout}, slots=${intent.slots.length}`);

			const input = this.instantiationService.createInstance(LiquidCanvasEditorInput);
			const pane = await this.editorService.openEditor(input, { pinned: !intent.transient }, ACTIVE_GROUP);

			if (pane instanceof LiquidCanvasEditor) {
				pane.composeIntent(intent);
			}
		}));
	}

	private _overrideRevealWidget(): void {
		// Override ChatWidgetService.revealWidget to open Phonon Agent Pool
		// in the editor area instead of the sidebar ChatViewPane.
		const widgetService = this.instantiationService.invokeFunction(
			accessor => accessor.get(IChatWidgetService)
		);
		// eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any -- monkey-patching untyped surface
		const svc = widgetService as any;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped reveal signature
		const originalReveal: ((widget: any, preserveFocus?: boolean) => Promise<boolean>) | undefined =
			typeof svc.reveal === 'function' ? svc.reveal.bind(svc) : undefined;

		svc.revealWidget = async (preserveFocus?: boolean) => {
			const last = widgetService.lastFocusedWidget;
			if (last && originalReveal && await originalReveal(last, preserveFocus)) {
				return last;
			}
			// Phonon: open Agent Pool editor instead of empty ChatWidget
			const editorService = this.instantiationService.invokeFunction(
				accessor => accessor.get(IEditorService)
			);
			await editorService.openEditor(
				new PhononEditorInput(),
				{ pinned: true, preserveFocus },
				ACTIVE_GROUP
			);
			return undefined;
		};
	}

	private _registerSessionOpener(): void {
		// Intercept session opens: route to editor area instead of sidebar.
		this._register(sessionOpenerRegistry.registerParticipant({
			handleOpenSession: async (accessor, session) => {
				const widgetService = accessor.get(IChatWidgetService);
				await widgetService.openSession(session.resource, ACTIVE_GROUP, {
					pinned: true,
					revealIfOpened: true,
				});
				return true; // handled -- prevent default sidebar open
			}
		}));
	}

	private _registerSpeechProvider(): void {
		const provider = this.instantiationService.createInstance(PhononWebSpeechProvider);
		this._register(provider);
		this._register(this.speechService.registerSpeechProvider('phonon-web-speech', provider));
		this.logService.info('[Phonon] Web Speech provider registered');
	}

	private _registerMcpBridge(): void {
		try {
			this._mcpBridge = this.instantiationService.createInstance(PhononMcpBridge);
			this._register(this._mcpBridge);
			this.logService.info('[Phonon] MCP Bridge registered');
		} catch {
			this.logService.info('[Phonon] MCP Bridge not available (IMcpService not registered?)');
		}
	}

	private _registerPlaywrightTools(): void {
		try {
			const tools = this.instantiationService.createInstance(PhononPlaywrightMcpTools);
			this._register(tools);
		} catch {
			this.logService.info('[Phonon] Playwright tools not available (desktop only)');
		}
	}

	private _registerChatAgent(): void {
		const agentImpl = this.instantiationService.createInstance(PhononChatAgentImpl);
		this._register(agentImpl);
		this._register(this.chatAgentService.registerDynamicAgent({
			id: PHONON_CLAUDE_AGENT_ID,
			name: 'Claude',
			fullName: 'Claude by Anthropic',
			description: 'Claude AI assistant powered by Anthropic',
			isDefault: true,
			isCore: false,
			modes: [ChatModeKind.Ask, ChatModeKind.Edit, ChatModeKind.Agent],
			slashCommands: [],
			disambiguation: [],
			locations: [
				ChatAgentLocation.Chat,
				ChatAgentLocation.Terminal,
				ChatAgentLocation.EditorInline,
				ChatAgentLocation.Notebook,
			],
			metadata: {},
			extensionId: nullExtensionDescription.identifier,
			extensionVersion: undefined,
			extensionDisplayName: 'Phonon Claude',
			extensionPublisherId: 'phonon',
		}, agentImpl));
	}
}

registerWorkbenchContribution2(PhononContribution.ID, PhononContribution, WorkbenchPhase.BlockRestore);

// --- PhononEditor pane registration ---

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		PhononEditor,
		PhononEditorInput.EditorID,
		localize('phonon', "Phonon")
	),
	[new SyncDescriptor(PhononEditorInput)]
);

// --- PhononEditor serializer (tab persistence across reload) ---

class PhononEditorInputSerializer implements IEditorSerializer {
	canSerialize(input: EditorInput): boolean {
		return input instanceof PhononEditorInput;
	}
	serialize(input: EditorInput): string | undefined {
		if (!(input instanceof PhononEditorInput)) { return undefined; }
		return JSON.stringify({ resource: input.resource.toString() });
	}
	deserialize(instantiationService: IInstantiationService, serializedEditor: string): EditorInput | undefined {
		try {
			const { resource } = JSON.parse(serializedEditor);
			return new PhononEditorInput(URI.parse(resource));
		} catch {
			return new PhononEditorInput();
		}
	}
}

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(
	PhononEditorInput.TypeID,
	PhononEditorInputSerializer
);

// --- LiquidCanvasEditor pane registration ---

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		LiquidCanvasEditor,
		LiquidCanvasEditorInput.EditorID,
		localize('phononCanvas', "Phonon Canvas")
	),
	[new SyncDescriptor(LiquidCanvasEditorInput)]
);

// --- LiquidCanvasEditor serializer (tab persistence across reload) ---

class LiquidCanvasEditorInputSerializer implements IEditorSerializer {
	canSerialize(input: EditorInput): boolean {
		return input instanceof LiquidCanvasEditorInput;
	}
	serialize(input: EditorInput): string | undefined {
		if (!(input instanceof LiquidCanvasEditorInput)) { return undefined; }
		return JSON.stringify({ resource: input.resource.toString() });
	}
	deserialize(instantiationService: IInstantiationService, serializedEditor: string): EditorInput | undefined {
		try {
			const { resource } = JSON.parse(serializedEditor);
			return new LiquidCanvasEditorInput(URI.parse(resource));
		} catch {
			return new LiquidCanvasEditorInput();
		}
	}
}

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(
	LiquidCanvasEditorInput.TypeID,
	LiquidCanvasEditorInputSerializer
);

// --- Agent Pool View registration ---

const chatViewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).get(ChatViewContainerId);
if (chatViewContainer) {
	Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([{
		id: AgentPoolViewPane.ID,
		name: AgentPoolViewPane.NAME,
		ctorDescriptor: new SyncDescriptor(AgentPoolViewPane),
		canToggleVisibility: true,
		canMoveView: false,
		collapsed: true,
		order: 100,
		when: ChatContextKeys.panelParticipantRegistered,
	}], chatViewContainer);
}

// --- Agent HUD (editor overlay) ---

registerEditorContribution(PhononHUDContribution.ID, PhononHUDContribution, EditorContributionInstantiation.Eventually);

// --- Commands ---

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'phonon.setApiKey',
			title: localize2('phonon.setApiKey', "Phonon: Set API Key"),
			category: Categories.Preferences,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyK,
			},
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const phononService = accessor.get(IPhononService);
		const quickInputService = accessor.get(IQuickInputService);

		const input = await quickInputService.input({
			title: localize('phonon.setApiKey.title', "Enter Anthropic API Key"),
			placeHolder: 'sk-ant-...',
			password: true,
			prompt: localize('phonon.setApiKey.prompt', "Get your API key from console.anthropic.com"),
		});

		if (input) {
			await phononService.setApiKey(input);
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'phonon.clearApiKey',
			title: localize2('phonon.clearApiKey', "Phonon: Clear API Key"),
			category: Categories.Preferences,
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const phononService = accessor.get(IPhononService);
		await phononService.deleteApiKey();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'phonon.newChat',
			title: localize2('phonon.newChat', "Phonon: New Chat"),
			category: Categories.Developer,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib + 1,
				primary: KeyMod.CtrlCmd | KeyCode.KeyL,
			},
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		await editorService.openEditor(
			new PhononEditorInput(),
			{ pinned: true },
			ACTIVE_GROUP
		);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'phonon.killAllAgents',
			title: localize2('phonon.killAllAgents', "Phonon: Kill All Agents"),
			category: Categories.Developer,
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const agentPoolService = accessor.get(IPhononAgentPoolService);
		await agentPoolService.terminateAll();
	}
});

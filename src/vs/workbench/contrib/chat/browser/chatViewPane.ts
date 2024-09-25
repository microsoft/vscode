/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { editorBackground } from '../../../../platform/theme/common/colorRegistry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IViewPaneOptions, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { Memento } from '../../../common/memento.js';
import { SIDE_BAR_FOREGROUND } from '../../../common/theme.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IChatViewState, ChatWidget } from './chatWidget.js';
import { ChatAgentLocation, IChatAgentService } from '../common/chatAgents.js';
import { CHAT_PROVIDER_ID } from '../common/chatParticipantContribTypes.js';
import { ChatModelInitState, IChatModel } from '../common/chatModel.js';
import { IChatService } from '../common/chatService.js';
import { IChatViewTitleActionContext } from './actions/chatActions.js';

interface IViewPaneState extends IChatViewState {
	sessionId?: string;
}

export const CHAT_SIDEBAR_PANEL_ID = 'workbench.panel.chatSidebar';
export class ChatViewPane extends ViewPane {
	private _widget!: ChatWidget;
	get widget(): ChatWidget { return this._widget; }

	private readonly modelDisposables = this._register(new DisposableStore());
	private memento: Memento;
	private readonly viewState: IViewPaneState;
	private didProviderRegistrationFail = false;
	private didUnregisterProvider = false;
	// check to display the welcome view right away while awaiting chat agents to register
	private isInitialized = false;

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IHoverService hoverService: IHoverService,
		@IStorageService private readonly storageService: IStorageService,
		@IChatService private readonly chatService: IChatService,
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@ILogService private readonly logService: ILogService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);

		// View state for the ViewPane is currently global per-provider basically, but some other strictly per-model state will require a separate memento.
		this.memento = new Memento('interactive-session-view-' + CHAT_PROVIDER_ID, this.storageService);
		this.viewState = this.memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE) as IViewPaneState;
		this._register(this.chatAgentService.onDidChangeAgents(() => {
			this.isInitialized = true;
			if (this.chatAgentService.getDefaultAgent(ChatAgentLocation.Panel)) {
				if (!this._widget?.viewModel) {
					const sessionId = this.getSessionId();
					const model = sessionId ? this.chatService.getOrRestoreSession(sessionId) : undefined;

					// The widget may be hidden at this point, because welcome views were allowed. Use setVisible to
					// avoid doing a render while the widget is hidden. This is changing the condition in `shouldShowWelcome`
					// so it should fire onDidChangeViewWelcomeState.
					try {
						this._widget.setVisible(false);
						this.updateModel(model);
						this.didProviderRegistrationFail = false;
						this.didUnregisterProvider = false;
						this._onDidChangeViewWelcomeState.fire();
					} finally {
						this.widget.setVisible(true);
					}
				}
			} else if (this._widget?.viewModel?.initState === ChatModelInitState.Initialized) {
				// Model is initialized, and the default agent disappeared, so show welcome view
				this.didUnregisterProvider = true;
			}

			this._onDidChangeViewWelcomeState.fire();
		}));
	}

	override getActionsContext(): IChatViewTitleActionContext {
		return {
			chatView: this
		};
	}

	private updateModel(model?: IChatModel | undefined, viewState?: IChatViewState): void {
		this.modelDisposables.clear();

		model = model ?? (this.chatService.transferredSessionData?.sessionId
			? this.chatService.getOrRestoreSession(this.chatService.transferredSessionData.sessionId)
			: this.chatService.startSession(ChatAgentLocation.Panel, CancellationToken.None));
		if (!model) {
			throw new Error('Could not start chat session');
		}

		if (viewState) {
			this.updateViewState(viewState);
		}

		this.viewState.sessionId = model.sessionId;
		this._widget.setModel(model, { ...this.viewState });
	}

	override shouldShowWelcome(): boolean {
		if (!this.chatAgentService.getContributedDefaultAgent(ChatAgentLocation.Panel)) {
			return true;
		}

		const noPersistedSessions = !this.chatService.hasSessions();
		return this.didUnregisterProvider || !this._widget?.viewModel && (noPersistedSessions || this.didProviderRegistrationFail) || !this.isInitialized;
	}

	private getSessionId() {
		let sessionId: string | undefined;
		if (this.chatService.transferredSessionData) {
			sessionId = this.chatService.transferredSessionData.sessionId;
			this.viewState.inputValue = this.chatService.transferredSessionData.inputValue;
		} else {
			sessionId = this.viewState.sessionId;
		}
		return sessionId;
	}

	protected override renderBody(parent: HTMLElement): void {
		try {
			super.renderBody(parent);

			const scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService])));
			const locationBasedColors = this.getLocationBasedColors();
			this._widget = this._register(scopedInstantiationService.createInstance(
				ChatWidget,
				ChatAgentLocation.Panel,
				{ viewId: this.id },
				{ supportsFileReferences: true },
				{
					listForeground: SIDE_BAR_FOREGROUND,
					listBackground: locationBasedColors.background,
					overlayBackground: locationBasedColors.overlayBackground,
					inputEditorBackground: locationBasedColors.background,
					resultEditorBackground: editorBackground
				}));
			this._register(this.onDidChangeBodyVisibility(visible => {
				this._widget.setVisible(visible);
			}));
			this._register(this._widget.onDidClear(() => this.clear()));
			this._widget.render(parent);

			const sessionId = this.getSessionId();
			// Render the welcome view if this session gets disposed at any point,
			// including if the provider registration fails
			const disposeListener = sessionId ? this._register(this.chatService.onDidDisposeSession((e) => {
				if (e.reason === 'initializationFailed') {
					this.didProviderRegistrationFail = true;
					disposeListener?.dispose();
					this._onDidChangeViewWelcomeState.fire();
				}
			})) : undefined;
			const model = sessionId ? this.chatService.getOrRestoreSession(sessionId) : undefined;

			this.updateModel(model);
		} catch (e) {
			this.logService.error(e);
			throw e;
		}
	}

	acceptInput(query?: string): void {
		this._widget.acceptInput(query);
	}

	private clear(): void {
		if (this.widget.viewModel) {
			this.chatService.clearSession(this.widget.viewModel.sessionId);
		}

		// Grab the widget's latest view state because it will be loaded back into the widget
		this.updateViewState();
		this.updateModel(undefined);
	}

	loadSession(sessionId: string, viewState?: IChatViewState): void {
		if (this.widget.viewModel) {
			this.chatService.clearSession(this.widget.viewModel.sessionId);
		}

		const newModel = this.chatService.getOrRestoreSession(sessionId);
		this.updateModel(newModel, viewState);
	}

	focusInput(): void {
		this._widget.focusInput();
	}

	override focus(): void {
		super.focus();
		this._widget.focusInput();
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this._widget.layout(height, width);
	}

	override saveState(): void {
		if (this._widget) {
			// Since input history is per-provider, this is handled by a separate service and not the memento here.
			// TODO multiple chat views will overwrite each other
			this._widget.saveState();

			this.updateViewState();
			this.memento.saveMemento();
		}

		super.saveState();
	}

	private updateViewState(viewState?: IChatViewState): void {
		const newViewState = viewState ?? this._widget.getViewState();
		this.viewState.inputValue = newViewState.inputValue;
		this.viewState.inputState = newViewState.inputState;
		this.viewState.selectedLanguageModelId = newViewState.selectedLanguageModelId;
	}
}

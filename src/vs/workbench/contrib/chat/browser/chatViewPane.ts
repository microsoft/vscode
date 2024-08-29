/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IHoverService } from 'vs/platform/hover/browser/hover';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ILogService } from 'vs/platform/log/common/log';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { editorBackground } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IViewPaneOptions, ViewPane } from 'vs/workbench/browser/parts/views/viewPane';
import { Memento } from 'vs/workbench/common/memento';
import { SIDE_BAR_FOREGROUND } from 'vs/workbench/common/theme';
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { IChatViewState, ChatWidget } from 'vs/workbench/contrib/chat/browser/chatWidget';
import { ChatAgentLocation, IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { CHAT_PROVIDER_ID } from 'vs/workbench/contrib/chat/common/chatParticipantContribTypes';
import { ChatModelInitState, IChatModel } from 'vs/workbench/contrib/chat/common/chatModel';
import { IChatService } from 'vs/workbench/contrib/chat/common/chatService';
import { IChatViewTitleActionContext } from 'vs/workbench/contrib/chat/browser/actions/chatActions';

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

	private updateModel(model?: IChatModel | undefined): void {
		this.modelDisposables.clear();

		model = model ?? (this.chatService.transferredSessionData?.sessionId
			? this.chatService.getOrRestoreSession(this.chatService.transferredSessionData.sessionId)
			: this.chatService.startSession(ChatAgentLocation.Panel, CancellationToken.None));
		if (!model) {
			throw new Error('Could not start chat session');
		}

		this._widget.setModel(model, { ...this.viewState });
		this.viewState.sessionId = model.sessionId;
	}

	override shouldShowWelcome(): boolean {
		if (!this.chatAgentService.getContributedDefaultAgent(ChatAgentLocation.Panel)) {
			return true;
		}

		const noPersistedSessions = !this.chatService.hasSessions();
		return this.didUnregisterProvider || !this._widget?.viewModel && (noPersistedSessions || this.didProviderRegistrationFail);
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

	loadSession(sessionId: string): void {
		if (this.widget.viewModel) {
			this.chatService.clearSession(this.widget.viewModel.sessionId);
		}

		const newModel = this.chatService.getOrRestoreSession(sessionId);
		this.updateModel(newModel);
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

	private updateViewState(): void {
		const widgetViewState = this._widget.getViewState();
		this.viewState.inputValue = widgetViewState.inputValue;
		this.viewState.inputState = widgetViewState.inputState;
	}
}

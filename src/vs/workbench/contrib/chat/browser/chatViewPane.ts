/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, getWindow } from '../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { MarshalledId } from '../../../../base/common/marshallingIds.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { editorBackground } from '../../../../platform/theme/common/colorRegistry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IViewPaneOptions, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { Memento } from '../../../common/memento.js';
import { SIDE_BAR_FOREGROUND } from '../../../common/theme.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IChatViewTitleActionContext } from '../common/chatActions.js';
import { ChatAgentLocation, IChatAgentService } from '../common/chatAgents.js';
import { ChatContextKeys } from '../common/chatContextKeys.js';
import { ChatModelInitState, IChatModel } from '../common/chatModel.js';
import { CHAT_PROVIDER_ID } from '../common/chatParticipantContribTypes.js';
import { IChatService } from '../common/chatService.js';
import { ChatWidget, IChatViewState } from './chatWidget.js';
import { ChatViewWelcomeController, IViewWelcomeDelegate } from './viewsWelcome/chatViewWelcomeController.js';

interface IViewPaneState extends IChatViewState {
	sessionId?: string;
}

export const CHAT_SIDEBAR_OLD_VIEW_PANEL_ID = 'workbench.panel.chatSidebar';
export const CHAT_SIDEBAR_PANEL_ID = 'workbench.panel.chat';
export const CHAT_EDITING_SIDEBAR_PANEL_ID = 'workbench.panel.chatEditing';
export class ChatViewPane extends ViewPane implements IViewWelcomeDelegate {
	private _widget!: ChatWidget;
	get widget(): ChatWidget { return this._widget; }

	private readonly modelDisposables = this._register(new DisposableStore());
	private memento: Memento;
	private readonly viewState: IViewPaneState;
	private defaultParticipantRegistrationFailed = false;
	private didUnregisterProvider = false;

	constructor(
		private readonly chatOptions: { location: ChatAgentLocation.Panel | ChatAgentLocation.EditingSession },
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IStorageService private readonly storageService: IStorageService,
		@IChatService private readonly chatService: IChatService,
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@ILogService private readonly logService: ILogService,
		@ILayoutService private readonly layoutService: ILayoutService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		// View state for the ViewPane is currently global per-provider basically, but some other strictly per-model state will require a separate memento.
		this.memento = new Memento('interactive-session-view-' + CHAT_PROVIDER_ID + (this.chatOptions.location === ChatAgentLocation.EditingSession ? `-edits` : ''), this.storageService);
		this.viewState = this.memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE) as IViewPaneState;
		this._register(this.chatAgentService.onDidChangeAgents(() => {
			if (this.chatAgentService.getDefaultAgent(this.chatOptions?.location)) {
				if (!this._widget?.viewModel) {
					const sessionId = this.getSessionId();
					const model = sessionId ? this.chatService.getOrRestoreSession(sessionId) : undefined;

					// The widget may be hidden at this point, because welcome views were allowed. Use setVisible to
					// avoid doing a render while the widget is hidden. This is changing the condition in `shouldShowWelcome`
					// so it should fire onDidChangeViewWelcomeState.
					const wasVisible = this._widget.visible;
					try {
						this._widget.setVisible(false);
						this.updateModel(model);
						this.defaultParticipantRegistrationFailed = false;
						this.didUnregisterProvider = false;
						this._onDidChangeViewWelcomeState.fire();
					} finally {
						this.widget.setVisible(wasVisible);
					}
				}
			} else if (this._widget?.viewModel?.initState === ChatModelInitState.Initialized) {
				// Model is initialized, and the default agent disappeared, so show welcome view
				this.didUnregisterProvider = true;
			}

			this._onDidChangeViewWelcomeState.fire();
		}));

		this._register(this.contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(ChatContextKeys.SetupViewKeys)) {
				this._onDidChangeViewWelcomeState.fire();
			}
		}));
	}

	override getActionsContext(): IChatViewTitleActionContext | undefined {
		return this.widget?.viewModel ? {
			sessionId: this.widget.viewModel.sessionId,
			$mid: MarshalledId.ChatViewContext
		} : undefined;
	}

	private updateModel(model?: IChatModel | undefined, viewState?: IChatViewState): void {
		this.modelDisposables.clear();

		model = model ?? (this.chatService.transferredSessionData?.sessionId && this.chatService.transferredSessionData?.location === this.chatOptions.location
			? this.chatService.getOrRestoreSession(this.chatService.transferredSessionData.sessionId)
			: this.chatService.startSession(this.chatOptions.location, CancellationToken.None));
		if (!model) {
			throw new Error('Could not start chat session');
		}

		if (viewState) {
			this.updateViewState(viewState);
		}

		this.viewState.sessionId = model.sessionId;
		this._widget.setModel(model, { ...this.viewState });

		// Update the toolbar context with new sessionId
		this.updateActions();
	}

	override shouldShowWelcome(): boolean {
		const showSetup = this.contextKeyService.contextMatchesRules(ChatContextKeys.SetupViewCondition);
		const noPersistedSessions = !this.chatService.hasSessions();
		const shouldShow = this.didUnregisterProvider || !this._widget?.viewModel && noPersistedSessions || this.defaultParticipantRegistrationFailed || showSetup;
		this.logService.trace(`ChatViewPane#shouldShowWelcome(${this.chatOptions.location}) = ${shouldShow}: didUnregister=${this.didUnregisterProvider} || noViewModel:${!this._widget?.viewModel} && noPersistedSessions=${noPersistedSessions} || defaultParticipantRegistrationFailed=${this.defaultParticipantRegistrationFailed} || showSetup=${showSetup}`);
		return !!shouldShow;
	}

	private getSessionId() {
		let sessionId: string | undefined;
		if (this.chatService.transferredSessionData?.location === this.chatOptions.location) {
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

			this._register(this.instantiationService.createInstance(ChatViewWelcomeController, parent, this, this.chatOptions.location));

			const scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService])));
			const locationBasedColors = this.getLocationBasedColors();
			const editorOverflowNode = this.layoutService.getContainer(getWindow(parent)).appendChild($('.chat-editor-overflow.monaco-editor'));
			this._register({ dispose: () => editorOverflowNode.remove() });

			this._widget = this._register(scopedInstantiationService.createInstance(
				ChatWidget,
				this.chatOptions.location,
				{ viewId: this.id },
				{
					autoScroll: this.chatOptions.location === ChatAgentLocation.EditingSession,
					renderFollowups: this.chatOptions.location === ChatAgentLocation.Panel,
					supportsFileReferences: true,
					supportsAdditionalParticipants: this.chatOptions.location === ChatAgentLocation.Panel,
					rendererOptions: {
						renderCodeBlockPills: this.chatOptions.location === ChatAgentLocation.EditingSession,
						renderTextEditsAsSummary: (uri) => {
							return this.chatOptions.location === ChatAgentLocation.EditingSession;
						},
						referencesExpandedWhenEmptyResponse: this.chatOptions.location !== ChatAgentLocation.EditingSession,
						progressMessageAtBottomOfResponse: this.chatOptions.location === ChatAgentLocation.EditingSession,
					},
					editorOverflowWidgetsDomNode: editorOverflowNode,
					enableImplicitContext: this.chatOptions.location === ChatAgentLocation.Panel || this.chatOptions.location === ChatAgentLocation.EditingSession,
					enableWorkingSet: this.chatOptions.location === ChatAgentLocation.EditingSession ? 'explicit' : undefined
				},
				{
					listForeground: SIDE_BAR_FOREGROUND,
					listBackground: locationBasedColors.background,
					overlayBackground: locationBasedColors.overlayBackground,
					inputEditorBackground: locationBasedColors.background,
					resultEditorBackground: editorBackground,

				}));
			this._register(this.onDidChangeBodyVisibility(visible => {
				this._widget.setVisible(visible);
			}));
			this._register(this._widget.onDidClear(() => this.clear()));
			this._widget.render(parent);

			const sessionId = this.getSessionId();
			const disposeListener = this._register(this.chatService.onDidDisposeSession((e) => {
				// Render the welcome view if provider registration fails, eg when signed out. This activates for any session, but the problem is the same regardless
				if (e.reason === 'initializationFailed') {
					this.defaultParticipantRegistrationFailed = true;
					disposeListener?.dispose();
					this._onDidChangeViewWelcomeState.fire();
				}
			}));
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

		// Update the toolbar context with new sessionId
		this.updateActions();
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
		for (const [key, value] of Object.entries(newViewState)) {
			// Assign all props to the memento so they get saved
			(this.viewState as any)[key] = value;
		}
	}
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatViewPane.css';
import { $, addDisposableListener, append, EventHelper, EventType, getWindow, setVisibility } from '../../../../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../../../../base/browser/mouseEvent.js';
import { Button } from '../../../../../../base/browser/ui/button/button.js';
import { Orientation, Sash } from '../../../../../../base/browser/ui/sash/sash.js';
import { DomScrollableElement } from '../../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../base/common/event.js';
import { MutableDisposable, toDisposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { MarshalledId } from '../../../../../../base/common/marshallingIds.js';
import { autorun, IReader, observableValue } from '../../../../../../base/common/observable.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { ScrollbarVisibility } from '../../../../../../base/common/scrollable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { MenuWorkbenchToolBar } from '../../../../../../platform/actions/browser/toolbar.js';
import { MenuId } from '../../../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { defaultButtonStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { editorBackground } from '../../../../../../platform/theme/common/colorRegistry.js';
import { ChatViewTitleControl } from './chatViewTitleControl.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { IViewPaneOptions, ViewPane } from '../../../../../browser/parts/views/viewPane.js';
import { Memento } from '../../../../../common/memento.js';
import { SIDE_BAR_FOREGROUND } from '../../../../../common/theme.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../../../common/views.js';
import { ILifecycleService, StartupKind } from '../../../../../services/lifecycle/common/lifecycle.js';
import { IChatViewTitleActionContext } from '../../../common/actions/chatActions.js';
import { IChatAgentService } from '../../../common/participants/chatAgents.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { IChatModel, IChatModelInputState } from '../../../common/model/chatModel.js';
import { CHAT_PROVIDER_ID } from '../../../common/participants/chatParticipantContribTypes.js';
import { IChatModelReference, IChatService } from '../../../common/chatService/chatService.js';
import { IChatSessionsService, localChatSessionType } from '../../../common/chatSessionsService.js';
import { LocalChatSessionUri, getChatSessionType } from '../../../common/model/chatUri.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind, getComputedDefaultSessionType, getDefaultNewChatSessionResource, getDefaultNewChatSessionType } from '../../../common/constants.js';
import { AgentSessionsControl } from '../../agentSessions/agentSessionsControl.js';
import { ACTION_ID_NEW_CHAT } from '../../actions/chatActions.js';
import { ChatWidget } from '../../widget/chatWidget.js';
import { ChatViewWelcomeController, IViewWelcomeDelegate } from '../../viewsWelcome/chatViewWelcomeController.js';
import { IChatViewsWelcomeDescriptor } from '../../viewsWelcome/chatViewsWelcome.js';
import { IWorkbenchLayoutService, LayoutSettings, Position } from '../../../../../services/layout/browser/layoutService.js';
import { AgentSessionsViewerOrientation, AgentSessionsViewerPosition } from '../../agentSessions/agentSessions.js';
import { IProgressService } from '../../../../../../platform/progress/common/progress.js';
import { ChatViewId, IChatWidgetService } from '../../chat.js';
import { IActivityService, ProgressBadge } from '../../../../../services/activity/common/activity.js';
import { disposableTimeout } from '../../../../../../base/common/async.js';
import { AgentSessionsFilter, AgentSessionsGrouping } from '../../agentSessions/agentSessionsFilter.js';
import { IAgentSessionsService } from '../../agentSessions/agentSessionsService.js';
import { HoverPosition } from '../../../../../../base/browser/ui/hover/hoverWidget.js';
import { IAgentSession } from '../../agentSessions/agentSessionsModel.js';
import { ChatEntitlementContextKeys, IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { toErrorMessage } from '../../../../../../base/common/errorMessage.js';
import { IHostService } from '../../../../../services/host/browser/host.js';
import { IMicCaptureService } from '../../voiceClient/micCaptureService.js';
import { ITtsPlaybackService } from '../../voiceClient/ttsPlaybackService.js';
import { IVoiceSessionController } from '../../voiceClient/voiceSessionController.js';
import { IAgentTitleBarStatusService } from '../../agentSessions/experiments/agentTitleBarStatusService.js';
import { IVoicePlaybackService } from '../../../common/voicePlaybackService.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';

interface IChatViewPaneState extends Partial<IChatModelInputState> {
	/**
	 * @deprecated This is kept around to support old view states. However it should not be set on new states and `sessionResource` should be used instead.
	 */
	sessionId?: string;
	sessionResource?: URI;

	sessionsSidebarWidth?: number;
}

type ChatViewPaneOpenedClassification = {
	owner: 'sbatten';
	comment: 'Event fired when the chat view pane is opened';
};

export class ChatViewPane extends ViewPane implements IViewWelcomeDelegate {

	private readonly memento: Memento<IChatViewPaneState>;
	private readonly viewState: IChatViewPaneState;

	private viewPaneContainer: HTMLElement | undefined;
	private readonly chatViewLocationContext: IContextKey<ViewContainerLocation>;

	private lastDimensions: { height: number; width: number } | undefined;
	private readonly lastDimensionsPerOrientation: Map<AgentSessionsViewerOrientation, { height: number; width: number }> = new Map();

	private welcomeController: ChatViewWelcomeController | undefined;

	private restoringSession: Promise<void> | undefined;
	private readonly loadSessionCts = this._register(new MutableDisposable<CancellationTokenSource>());
	private readonly modelRef = this._register(new MutableDisposable<IChatModelReference>());

	private readonly activityBadge = this._register(new MutableDisposable());
	private readonly _currentSessionResource = observableValue<URI | undefined>(this, undefined);

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService2: IKeybindingService,
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
		@INotificationService private readonly notificationService: INotificationService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IProgressService private readonly progressService: IProgressService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
		@ICommandService private readonly commandService: ICommandService,
		@IActivityService private readonly activityService: IActivityService,
		@IHostService private readonly hostService: IHostService,
		@IMicCaptureService private readonly micCaptureService: IMicCaptureService,
		@ITtsPlaybackService private readonly ttsPlaybackService: ITtsPlaybackService,
		@IVoiceSessionController private readonly voiceSessionController: IVoiceSessionController,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IAgentTitleBarStatusService _agentTitleBarStatusService: IAgentTitleBarStatusService,
		@IVoicePlaybackService _voicePlaybackService: IVoicePlaybackService,
		@IWorkbenchEnvironmentService _workbenchEnvironmentService: IWorkbenchEnvironmentService,
	) {
		super(options, keybindingService2, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		// View state for the ViewPane is currently global per-provider basically,
		// but some other strictly per-model state will require a separate memento.
		this.memento = new Memento(`interactive-session-view-${CHAT_PROVIDER_ID}`, this.storageService);
		this.viewState = this.memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
		if (
			lifecycleService.startupKind !== StartupKind.ReloadedWindow &&
			this.configurationService.getValue<boolean>(ChatConfiguration.RestoreLastPanelSession) === false
		) {
			// clear persisted session on fresh start
			this.viewState.sessionId = undefined;
			this.viewState.sessionResource = undefined;
		}
		this.sessionsViewerVisible = false; // will be updated from layout code
		this.sessionsViewerSidebarWidth = Math.max(ChatViewPane.SESSIONS_SIDEBAR_MIN_WIDTH, this.viewState.sessionsSidebarWidth ?? ChatViewPane.SESSIONS_SIDEBAR_DEFAULT_WIDTH);

		// Contextkeys
		this.chatViewLocationContext = ChatContextKeys.panelLocation.bindTo(contextKeyService);
		this.sessionsViewerOrientationContext = ChatContextKeys.agentSessionsViewerOrientation.bindTo(contextKeyService);
		this.sessionsViewerPositionContext = ChatContextKeys.agentSessionsViewerPosition.bindTo(contextKeyService);
		this.sessionsViewerVisibilityContext = ChatContextKeys.agentSessionsViewerVisible.bindTo(contextKeyService);

		this.updateContextKeys();

		this.registerListeners();
	}

	private updateContextKeys(): void {
		const { position, location } = this.getViewPositionAndLocation();

		this.chatViewLocationContext.set(location ?? ViewContainerLocation.AuxiliaryBar);
		this.sessionsViewerOrientationContext.set(this.sessionsViewerOrientation);
		this.sessionsViewerPositionContext.set(position === Position.RIGHT ? AgentSessionsViewerPosition.Right : AgentSessionsViewerPosition.Left);
	}

	private getViewPositionAndLocation(): { position: Position; location: ViewContainerLocation } {
		const viewLocation = this.viewDescriptorService.getViewLocationById(this.id);
		const sideBarPosition = this.layoutService.getSideBarPosition();
		const panelPosition = this.layoutService.getPanelPosition();

		let sideSessionsOnRightPosition: boolean;
		switch (viewLocation) {
			case ViewContainerLocation.Sidebar:
				sideSessionsOnRightPosition = sideBarPosition === Position.RIGHT;
				break;
			case ViewContainerLocation.Panel:
				sideSessionsOnRightPosition = panelPosition !== Position.LEFT;
				break;
			default:
				sideSessionsOnRightPosition = sideBarPosition === Position.LEFT;
				break;
		}

		return {
			position: sideSessionsOnRightPosition ? Position.RIGHT : Position.LEFT,
			location: viewLocation ?? ViewContainerLocation.AuxiliaryBar,
		};
	}

	private getSessionHoverPosition() {
		const viewLocation = this.viewDescriptorService.getViewLocationById(this.id);
		const sideBarPosition = this.layoutService.getSideBarPosition();

		if (this.sessionsViewerOrientation === AgentSessionsViewerOrientation.SideBySide) {
			return viewLocation === ViewContainerLocation.Sidebar && sideBarPosition === Position.RIGHT ? HoverPosition.LEFT : HoverPosition.RIGHT;
		}

		return {
			[Position.LEFT]: HoverPosition.RIGHT,
			[Position.RIGHT]: HoverPosition.LEFT,
			[Position.TOP]: HoverPosition.BELOW,
			[Position.BOTTOM]: HoverPosition.ABOVE
		}[viewLocation === ViewContainerLocation.Panel ? this.layoutService.getPanelPosition() : sideBarPosition];
	}

	private updateViewPaneClasses(fromEvent: boolean): void {
		const activityBarLocationDefault = this.configurationService.getValue<string>(LayoutSettings.ACTIVITY_BAR_LOCATION) === 'default';
		this.viewPaneContainer?.classList.toggle('activity-bar-location-default', activityBarLocationDefault);
		this.viewPaneContainer?.classList.toggle('activity-bar-location-other', !activityBarLocationDefault);

		const { position, location } = this.getViewPositionAndLocation();

		this.viewPaneContainer?.classList.toggle('chat-view-location-auxiliarybar', location === ViewContainerLocation.AuxiliaryBar);
		this.viewPaneContainer?.classList.toggle('chat-view-location-sidebar', location === ViewContainerLocation.Sidebar);
		this.viewPaneContainer?.classList.toggle('chat-view-location-panel', location === ViewContainerLocation.Panel);

		this.viewPaneContainer?.classList.toggle('chat-view-position-left', position === Position.LEFT);
		this.viewPaneContainer?.classList.toggle('chat-view-position-right', position === Position.RIGHT);

		if (fromEvent) {
			this.relayout();
		}
	}

	private registerListeners(): void {

		// Agent changes
		this._register(this.chatAgentService.onDidChangeAgents(() => this.onDidChangeAgents()));

		// Session changes
		this._register(this.chatSessionsService.onDidCommitSession(async (e) => {
			if (!this.modelRef.value) {
				return;
			}

			if (!isEqual(e.original, this.modelRef.value.object.sessionResource)) {
				return;
			}

			const modelRef = await this.chatService.acquireOrLoadSession(e.committed, ChatAgentLocation.Chat, CancellationToken.None, 'ChatViewPane#onDidCommitSession');
			await this.showModel(CancellationToken.None, modelRef);
		}));

		// Layout changes
		this._register(Event.any(
			Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration('workbench.sideBar.location')),
			this.layoutService.onDidChangePanelPosition,
			Event.filter(this.viewDescriptorService.onDidChangeContainerLocation, e => e.viewContainer === this.viewDescriptorService.getViewContainerByViewId(this.id))
		)(() => {
			this.updateContextKeys();
			this.updateViewPaneClasses(true /* layout here */);
		}));

		// Settings changes
		this._register(Event.filter(this.configurationService.onDidChangeConfiguration, e => {
			return e.affectsConfiguration(LayoutSettings.ACTIVITY_BAR_LOCATION);
		})(() => this.updateViewPaneClasses(true)));
	}

	private onDidChangeAgents(): void {
		if (this.chatAgentService.getDefaultAgent(ChatAgentLocation.Chat)) {
			if (!this._widget?.viewModel && !this.restoringSession) {
				this.restoringSession =
					this.acquireTransferredOrPersistedSession(CancellationToken.None, 'ChatViewPane#onDidChangeAgents').then(async modelRef => {
						if (!this._widget) {
							return; // renderBody has not been called yet
						}

						// The widget may be hidden at this point, because welcome views were allowed. Use setVisible to
						// avoid doing a render while the widget is hidden. This is changing the condition in `shouldShowWelcome`
						// so it should fire onDidChangeViewWelcomeState.
						const wasVisible = this._widget.visible;
						try {
							this._widget.setVisible(false);

							await this.showModel(CancellationToken.None, modelRef, true, !modelRef);
						} finally {
							this._widget.setVisible(wasVisible);
						}
					});

				this.restoringSession.finally(() => this.restoringSession = undefined);
			}
		}

		this._onDidChangeViewWelcomeState.fire();
	}

	private getTransferredOrPersistedSessionInfo(): URI | undefined {
		if (this.chatService.transferredSessionResource) {
			return this.chatService.transferredSessionResource;
		}

		if (this.viewState.sessionResource) {
			return this.viewState.sessionResource;
		}

		return this.viewState.sessionId ? LocalChatSessionUri.forSession(this.viewState.sessionId) : undefined;
	}

	protected override renderBody(parent: HTMLElement): void {
		super.renderBody(parent);

		this.telemetryService.publicLog2<{}, ChatViewPaneOpenedClassification>('chatViewPaneOpened');

		this.viewPaneContainer = parent;
		this.viewPaneContainer.classList.add('chat-viewpane');
		this.updateViewPaneClasses(false);

		// Controls wrapper — sessions + chat live inside here
		const controlsWrapper = append(parent, $('.voice-agent-controls-wrapper'));
		this.createControls(controlsWrapper);

		// Voice bar — hidden by default, voice is activated via mic button in toolbar.
		// The widget is still created for PTT keybinding support and session binding.
		this._voiceBarContainer = $('.voice-agent-bar-host');
		this._voiceBarContainer.style.display = 'none';
		this._updateVoiceBar(this._voiceBarContainer);

		// Transcript overlay — shown inside the input container when voice is active
		const inputContainerEl = this._widget.inputPart.inputContainerElement;
		if (inputContainerEl) {
			this._setupVoiceTranscriptOverlay(inputContainerEl);
		}

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('agents.voice.enabled')) {
				this._updateVoiceBar(this._voiceBarContainer!);
			}
		}));

		this.setupContextMenu(parent);

		this.applyModel();
	}

	private createControls(parent: HTMLElement): void {

		// Sessions Control
		const sessionsControl = this.createSessionsControl(parent);

		// Welcome Control (used to show chat specific extension provided welcome views via `chatViewsWelcome` contribution point)
		const welcomeController = this.welcomeController = this._register(this.instantiationService.createInstance(ChatViewWelcomeController, parent, this, ChatAgentLocation.Chat));

		// Chat Control
		const chatWidget = this.createChatControl(parent);

		// Controls Listeners
		this.registerControlsListeners(sessionsControl, chatWidget, welcomeController);

		// Update sessions control visibility when all controls are created
		this.updateSessionsControlVisibility();
	}

	//#region Voice Agent Bar

	private _voiceBarContainer: HTMLElement | undefined;
	private readonly _voiceBarDisposables = this._register(new DisposableStore());

	private _updateVoiceBar(container: HTMLElement): void {
		this._voiceBarDisposables.clear();
		container.replaceChildren();

		// Always keep the container hidden — voice UI is now the mic toolbar
		// button + transcript overlay. We still register the command bridges
		// needed by VoiceSessionController.
		container.style.display = 'none';

		if (this.configurationService.getValue<boolean>('agents.voice.enabled')) {
			// Voice command bridge — lets the VoiceSessionController reach into the chat widget
			this._voiceBarDisposables.add(CommandsRegistry.registerCommand('_chat.voice.acceptInput', (accessor, text: string) => {
				const chatWidgetService = accessor.get(IChatWidgetService);
				const widget = chatWidgetService.lastFocusedWidget ?? this._widget;
				if (text && widget?.viewModel) {
					if (widget.viewModel.editing) {
						// When editing an old message, populate the active input
						// editor so the user can review before submitting.
						widget.input.setValue(text, false);
					} else {
						widget.acceptInput(text, { preserveFocus: true });
					}
				}
			}));
			this._voiceBarDisposables.add(CommandsRegistry.registerCommand('_chat.voice.switchToSession', (_accessor, resourceStr: string): boolean => {
				if (!resourceStr) {
					return false;
				}
				try {
					this.viewState.sessionResource = URI.parse(resourceStr);
					this.applyModel();
					return true;
				} catch {
					return false;
				}
			}));
			this._voiceBarDisposables.add(CommandsRegistry.registerCommand('_chat.voice.getCurrentSession', (_accessor): string | undefined => {
				return this._widget?.viewModel?.sessionResource?.toString();
			}));
		}
	}

	private _setupVoiceTranscriptOverlay(inputContainerEl: HTMLElement): void {
		inputContainerEl.style.position = 'relative';
		const transcriptOverlay = $('.voice-transcript-overlay');
		const transcriptScrollable = this._register(new DomScrollableElement(transcriptOverlay, {
			horizontal: ScrollbarVisibility.Hidden,
			vertical: ScrollbarVisibility.Auto,
		}));
		const transcriptOverlayNode = transcriptScrollable.getDomNode();
		transcriptOverlayNode.classList.add('voice-transcript-overlay-scrollable');
		transcriptOverlayNode.style.display = 'none';
		inputContainerEl.append(transcriptOverlayNode);

		// Dynamic audio-reactive glow animation (matches aux window behavior)
		let animFrameId: number | undefined;
		let glowDataArray: Uint8Array | undefined;
		const win = getWindow(inputContainerEl);
		let lastGlowTarget: HTMLElement | undefined;
		// Lock the glow target to whichever widget was focused when voice connected.
		// This prevents confirmations/programmatic focus shifts from moving the glow.
		let lockedGlowWidget: HTMLElement | undefined;
		const getActiveInputContainer = (): HTMLElement => {
			if (lockedGlowWidget) {
				return lockedGlowWidget;
			}
			const focused = this.chatWidgetService.lastFocusedWidget;
			return focused?.input?.inputContainerElement ?? inputContainerEl;
		};
		const startGlowAnimation = () => {
			if (animFrameId !== undefined) { return; }
			const animate = () => {
				animFrameId = win.requestAnimationFrame(animate);
				const connected = this.voiceSessionController.isConnected.get();
				const voiceState = this.voiceSessionController.voiceState.get();
				const glowActive = connected && (voiceState === 'listening' || voiceState === 'speaking');
				const target = getActiveInputContainer();

				// If the target changed, clear styling on the old one
				if (lastGlowTarget && lastGlowTarget !== target) {
					lastGlowTarget.style.borderColor = '';
					lastGlowTarget.style.boxShadow = '';
					lastGlowTarget.classList.remove('voice-active', 'voice-listening');
				}
				lastGlowTarget = target;

				if (!glowActive) {
					target.style.borderColor = '';
					target.style.boxShadow = '';
					target.classList.remove('voice-active', 'voice-listening');
					return;
				}

				// Get audio intensity from analyser
				const analyser = this.ttsPlaybackService.analyserNode
					?? (voiceState === 'listening' ? this.micCaptureService.analyserNode : null)
					?? null;
				let intensity: number;
				if (!analyser) {
					intensity = 0.3;
				} else {
					if (!glowDataArray || glowDataArray.length !== analyser.frequencyBinCount) {
						glowDataArray = new Uint8Array(analyser.frequencyBinCount);
					}
					analyser.getByteFrequencyData(glowDataArray as Uint8Array<ArrayBuffer>);
					let sum = 0;
					for (let i = 0; i < glowDataArray.length; i++) {
						sum += glowDataArray[i];
					}
					intensity = Math.min(1, (sum / glowDataArray.length) / 80);
				}

				// Blue when listening (more active/flashy when transcript hidden), purple when speaking (subtle)
				const rgb = voiceState === 'speaking' ? '163,113,247' : '88,166,255';
				const transcriptHidden = this.configurationService.getValue<boolean>('agents.voice.showTranscript') === false;
				let borderAlpha: number;
				let shadowSpread: number;
				let shadowAlpha: number;
				if (voiceState === 'listening' && transcriptHidden) {
					// Flashy, audio-reactive glow while user is speaking (no transcript visible)
					borderAlpha = 0.6 + intensity * 0.4;
					shadowSpread = 6 + intensity * 20;
					shadowAlpha = 0.25 + intensity * 0.55;
				} else {
					// Standard glow (transcript visible or TTS playback)
					borderAlpha = 0.4 + intensity * 0.5;
					shadowSpread = 4 + intensity * 12;
					shadowAlpha = 0.15 + intensity * 0.35;
				}
				target.style.borderColor = `rgba(${rgb},${borderAlpha})`;
				if (voiceState === 'listening' && transcriptHidden) {
					// Double-layer glow for extra presence when listening without transcript
					target.style.boxShadow = `0 0 ${shadowSpread}px rgba(${rgb},${shadowAlpha}), 0 0 ${shadowSpread * 2}px rgba(${rgb},${shadowAlpha * 0.3}), inset 0 0 ${shadowSpread * 0.5}px rgba(${rgb},${shadowAlpha * 0.4})`;
				} else {
					target.style.boxShadow = `0 0 ${shadowSpread}px rgba(${rgb},${shadowAlpha}), inset 0 0 ${shadowSpread * 0.4}px rgba(${rgb},${shadowAlpha * 0.3})`;
				}
				target.classList.add('voice-active');
				target.classList.toggle('voice-listening', voiceState === 'listening');
			};
			animFrameId = win.requestAnimationFrame(animate);
		};
		const stopGlowAnimation = () => {
			if (animFrameId !== undefined) {
				win.cancelAnimationFrame(animFrameId);
				animFrameId = undefined;
			}
			const target = lastGlowTarget ?? inputContainerEl;
			target.style.borderColor = '';
			target.style.boxShadow = '';
			target.classList.remove('voice-active', 'voice-listening');
			lastGlowTarget = undefined;
		};

		// Lock glow target on connect, unlock on disconnect
		this._register(autorun(reader => {
			const connected = this.voiceSessionController.isConnected.read(reader);
			if (connected && !lockedGlowWidget) {
				lockedGlowWidget = this.chatWidgetService.lastFocusedWidget?.input?.inputContainerElement ?? inputContainerEl;
			} else if (!connected) {
				lockedGlowWidget = undefined;
			}
		}));

		this._register(autorun(reader => {
			const connected = this.voiceSessionController.isConnected.read(reader);
			const voiceState = this.voiceSessionController.voiceState.read(reader);
			if (connected && (voiceState === 'listening' || voiceState === 'speaking')) {
				startGlowAnimation();
			} else {
				stopGlowAnimation();
			}
		}));
		this._register({ dispose: () => stopGlowAnimation() });

		// Voice transcript is per-session. The transcript is "owned" by the
		// session the user is dictating into (the explicit target session, or the
		// focused session when dictation began) and is only shown in that
		// session's view. Switching focus to a different session hides the
		// transcript here; switching while actively dictating also stops
		// transcription so it isn't misrouted to the newly focused session.
		let listeningSession: URI | undefined;
		let ownerSession: URI | undefined;
		this._register(autorun(reader => {
			const turns = this.voiceSessionController.transcriptTurns.read(reader);
			const connected = this.voiceSessionController.isConnected.read(reader);
			const voiceState = this.voiceSessionController.voiceState.read(reader);
			const targetSession = this.voiceSessionController.targetSession.read(reader);
			const currentSession = this._currentSessionResource.read(reader);
			const showTranscript = this.configurationService.getValue<boolean>('agents.voice.showTranscript') !== false;
			const visible = turns.filter(t => t.text.length > 0 || (t.speaker === 'user' && t.isPartial));

			if (!connected) {
				listeningSession = undefined;
				ownerSession = undefined;
				transcriptOverlayNode.style.display = 'none';
				transcriptOverlayNode.classList.remove('has-transcript');
				return;
			}

			// Capture / maintain the session the current transcript belongs to.
			if (voiceState === 'listening') {
				if (!listeningSession) {
					listeningSession = targetSession ?? currentSession;
					ownerSession = listeningSession;
				} else if (!targetSession && currentSession && !isEqual(currentSession, listeningSession)) {
					// User switched to a different session while listening. Only
					// stop when there's dictation in progress, so it isn't
					// misrouted to the newly focused session. If nothing has been
					// recorded yet (e.g. clicking "New Chat" while idly listening
					// hands-free), keep listening and just follow the new session.
					const activelyDictating = turns.some(t => t.speaker === 'user' && t.isPartial && t.text.trim().length > 0);
					if (activelyDictating) {
						this.voiceSessionController.stopListening();
						listeningSession = undefined;
					} else {
						listeningSession = currentSession;
						ownerSession = currentSession;
					}
				}
			} else {
				// Allow the next dictation to re-capture the owning session.
				listeningSession = undefined;
			}

			// Don't show a transcript that belongs to a different session here.
			const effectiveOwner = targetSession ?? ownerSession;
			if (effectiveOwner && currentSession && !isEqual(effectiveOwner, currentSession)) {
				transcriptOverlayNode.style.display = 'none';
				transcriptOverlayNode.classList.remove('has-transcript');
				return;
			}

			// Show hint when connected but no transcript yet
			if (visible.length === 0 || !showTranscript) {
				const handsFree = this.configurationService.getValue<boolean>('agents.voice.handsFree') !== false;
				if (voiceState === 'idle' && visible.length === 0 && showTranscript && !handsFree) {
					transcriptOverlayNode.style.display = '';
					transcriptOverlayNode.classList.remove('has-transcript');
					transcriptOverlay.replaceChildren();
					const hint = $('span.partial');
					const kb = this.keybindingService.lookupKeybinding('agentsVoice.pushToTalk');
					const kbLabel = kb?.getLabel();
					hint.textContent = kbLabel
						? localize('voiceMode.pttHint', "Press {0} to talk", kbLabel)
						: localize('voiceMode.clickMicHint', "Click voice mode to talk");
					transcriptOverlay.append(hint);
					transcriptScrollable.scanDomNode();
				} else {
					transcriptOverlayNode.style.display = 'none';
					transcriptOverlayNode.classList.remove('has-transcript');
				}
				return;
			}

			transcriptOverlayNode.style.display = '';
			transcriptOverlayNode.classList.add('has-transcript');
			// Show only the latest visible turn
			const lastTurn = visible[visible.length - 1];
			const contentElements: HTMLElement[] = [];
			if (lastTurn.speaker === 'user') {
				const span = $('span');
				if (lastTurn.isPartial) {
					const committedPart = lastTurn.committed || '';
					const unsurePart = lastTurn.text.slice(committedPart.length);
					if (committedPart) {
						const c = $('span.committed');
						c.textContent = committedPart;
						span.append(c);
					}
					const u = $('span.partial');
					u.textContent = unsurePart + '\u2589';
					span.append(u);
				} else {
					span.className = 'committed';
					span.textContent = lastTurn.text;
				}
				contentElements.push(span);
			} else {
				const div = $('div.assistant-text');
				div.textContent = lastTurn.text;
				contentElements.push(div);
			}
			transcriptOverlay.replaceChildren(...contentElements);
			transcriptScrollable.scanDomNode();
			transcriptScrollable.setScrollPosition({ scrollTop: 0 });
		}));
	}

	//#endregion

	//#region Sessions Control

	private static readonly SESSIONS_SIDEBAR_MIN_WIDTH = 200;
	private static readonly SESSIONS_SIDEBAR_SNAP_THRESHOLD = this.SESSIONS_SIDEBAR_MIN_WIDTH / 2; // snap to hide when dragged below half of minimum width
	private static readonly SESSIONS_SIDEBAR_DEFAULT_WIDTH = 300;
	private static readonly CHAT_WIDGET_DEFAULT_WIDTH = 300;
	private static readonly SESSIONS_SIDEBAR_VIEW_MIN_WIDTH = this.CHAT_WIDGET_DEFAULT_WIDTH + this.SESSIONS_SIDEBAR_DEFAULT_WIDTH;

	private sessionsContainer: HTMLElement | undefined;
	private sessionsTitleContainer: HTMLElement | undefined;
	private sessionsTitle: HTMLElement | undefined;
	private sessionsNewButtonContainer: HTMLElement | undefined;
	private sessionsControlContainer: HTMLElement | undefined;
	private sessionsControl: AgentSessionsControl | undefined;

	get agentSessionsControl(): AgentSessionsControl | undefined { return this.sessionsControl; }

	private sessionsViewerVisible: boolean;
	private sessionsViewerOrientation = AgentSessionsViewerOrientation.Stacked;
	private sessionsViewerOrientationConfiguration: 'stacked' | 'sideBySide' = 'sideBySide';
	private sessionsViewerOrientationContext: IContextKey<AgentSessionsViewerOrientation>;
	private sessionsViewerVisibilityContext: IContextKey<boolean>;
	private sessionsViewerPositionContext: IContextKey<AgentSessionsViewerPosition>;
	private sessionsViewerSidebarWidth: number;
	private sessionsViewerSash: Sash | undefined;
	private readonly sessionsViewerSashDisposables = this._register(new MutableDisposable<DisposableStore>());

	private createSessionsControl(parent: HTMLElement): AgentSessionsControl {
		const sessionsContainer = this.sessionsContainer = parent.appendChild($('.agent-sessions-container'));

		// Sessions Title
		const sessionsTitleContainer = this.sessionsTitleContainer = append(sessionsContainer, $('.agent-sessions-title-container'));
		const sessionsTitle = this.sessionsTitle = append(sessionsTitleContainer, $('span.agent-sessions-title'));
		sessionsTitle.textContent = localize('sessions', "Sessions");
		this._register(addDisposableListener(sessionsTitle, EventType.CLICK, () => {
			this.sessionsControl?.scrollToTop();
			this.sessionsControl?.focus();
		}));

		// Sessions Toolbar
		const sessionsToolbarContainer = append(sessionsTitleContainer, $('.agent-sessions-toolbar'));
		const sessionsToolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, sessionsToolbarContainer, MenuId.AgentSessionsToolbar, {
			menuOptions: { shouldForwardArgs: true }
		}));

		// Sessions Filter
		const sessionsFilter = this._register(this.instantiationService.createInstance(AgentSessionsFilter, {
			filterMenuId: MenuId.AgentSessionsViewerFilterSubMenu,
			groupResults: () => this.sessionsViewerOrientation === AgentSessionsViewerOrientation.Stacked ? AgentSessionsGrouping.Capped : AgentSessionsGrouping.Date
		}));
		this._register(Event.runAndSubscribe(sessionsFilter.onDidChange, () => {
			sessionsToolbarContainer.classList.toggle('filtered', !sessionsFilter.isDefault());
		}));

		// New Session Button
		const newSessionButtonContainer = this.sessionsNewButtonContainer = append(sessionsContainer, $('.agent-sessions-new-button-container'));
		const newSessionButton = this._register(new Button(newSessionButtonContainer, { ...defaultButtonStyles, secondary: true }));
		newSessionButton.label = localize('newSession', "New Session");
		this._register(newSessionButton.onDidClick(() => this.commandService.executeCommand(ACTION_ID_NEW_CHAT, this.getActionsContext())));

		// Sessions Control
		this.sessionsControlContainer = append(sessionsContainer, $('.agent-sessions-control-container'));
		const sessionsControl = this.sessionsControl = this._register(this.instantiationService.createInstance(AgentSessionsControl, this.sessionsControlContainer, {
			source: 'chatViewPane',
			filter: sessionsFilter,
			overrideStyles: this.getLocationBasedColors().listOverrideStyles,
			getHoverPosition: () => this.getSessionHoverPosition(),
			trackActiveEditorSession: () => {
				return !this._widget || this._widget.isEmpty(); // only track and reveal if chat widget is empty
			},
			overrideSessionOpenOptions: openEvent => {
				if (this.sessionsViewerOrientation === AgentSessionsViewerOrientation.Stacked && !openEvent.sideBySide) {
					return { ...openEvent, editorOptions: { ...openEvent.editorOptions, preserveFocus: false /* focus the chat widget when opening from stacked sessions viewer since this closes the stacked viewer */ } };
				}
				return openEvent;
			},
		}));
		this._register(this.onDidChangeBodyVisibility(visible => sessionsControl.setVisible(visible)));

		sessionsToolbar.context = sessionsControl;

		// Refresh sessions when window gets focus to compensate for missing events
		this._register(this.hostService.onDidChangeFocus(hasFocus => {
			if (hasFocus) {
				sessionsControl.refresh();
			}
		}));

		// Deal with orientation configuration
		this._register(Event.runAndSubscribe(Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(ChatConfiguration.ChatViewSessionsOrientation)), e => {
			const newSessionsViewerOrientationConfiguration = this.configurationService.getValue<'stacked' | 'sideBySide' | unknown>(ChatConfiguration.ChatViewSessionsOrientation);
			this.doUpdateConfiguredSessionsViewerOrientation(newSessionsViewerOrientationConfiguration, { updateConfiguration: false, layout: !!e });
		}));

		return sessionsControl;
	}

	getSessionsViewerOrientation(): AgentSessionsViewerOrientation {
		return this.sessionsViewerOrientation;
	}

	updateConfiguredSessionsViewerOrientation(orientation: 'stacked' | 'sideBySide' | unknown): void {
		return this.doUpdateConfiguredSessionsViewerOrientation(orientation, { updateConfiguration: true, layout: true });
	}

	private doUpdateConfiguredSessionsViewerOrientation(orientation: 'stacked' | 'sideBySide' | unknown, options: { updateConfiguration: boolean; layout: boolean }): void {
		const oldSessionsViewerOrientationConfiguration = this.sessionsViewerOrientationConfiguration;

		let validatedOrientation: 'stacked' | 'sideBySide';
		if (orientation === 'stacked' || orientation === 'sideBySide') {
			validatedOrientation = orientation;
		} else {
			validatedOrientation = 'sideBySide'; // default
		}
		this.sessionsViewerOrientationConfiguration = validatedOrientation;

		if (oldSessionsViewerOrientationConfiguration === this.sessionsViewerOrientationConfiguration) {
			return; // no change from our existing config
		}

		if (options.updateConfiguration) {
			this.configurationService.updateValue(ChatConfiguration.ChatViewSessionsOrientation, validatedOrientation);
		}

		if (options.layout) {
			this.relayout();
		}
	}

	private updateSessionsControlVisibility(): { changed: boolean; visible: boolean } {
		if (!this.sessionsContainer || !this.viewPaneContainer) {
			return { changed: false, visible: false };
		}

		let newSessionsContainerVisible: boolean;
		if (!this.configurationService.getValue<boolean>(ChatConfiguration.ChatViewSessionsEnabled)) {
			newSessionsContainerVisible = false; // disabled in settings
		} else {

			// Sessions control: stacked
			if (this.sessionsViewerOrientation === AgentSessionsViewerOrientation.Stacked) {
				newSessionsContainerVisible =
					(!!this.chatEntitlementService.sentiment.completed || this.chatEntitlementService.hasByokModels) &&					// chat is setup (otherwise make room for terms and welcome)
					(!this._widget || (this._widget.isEmpty() && !!this._widget.viewModel && !this._widget.viewModel.model.title)) &&	// chat widget empty (but not when model is loading or has a title)
					!this.welcomeController?.isShowingWelcome.get();																	// welcome not showing
			}

			// Sessions control: sidebar
			else {
				newSessionsContainerVisible =
					!this.welcomeController?.isShowingWelcome.get() &&													// welcome not showing
					!!this.lastDimensions && this.lastDimensions.width >= ChatViewPane.SESSIONS_SIDEBAR_VIEW_MIN_WIDTH;	// has sessions or is showing all sessions
			}
		}

		this.viewPaneContainer.classList.toggle('has-sessions-control', newSessionsContainerVisible);

		const sessionsContainerVisible = this.sessionsContainer.style.display !== 'none';
		setVisibility(newSessionsContainerVisible, this.sessionsContainer);
		this.sessionsViewerVisible = newSessionsContainerVisible;
		this.sessionsViewerVisibilityContext.set(newSessionsContainerVisible);

		return {
			changed: sessionsContainerVisible !== newSessionsContainerVisible,
			visible: newSessionsContainerVisible
		};
	}

	getFocusedSessions(): IAgentSession[] {
		return this.sessionsControl?.getFocus() ?? [];
	}

	//#endregion

	//#region Chat Control

	private static readonly MIN_CHAT_WIDGET_HEIGHT = 116;

	private _widget!: ChatWidget;
	get widget(): ChatWidget { return this._widget; }

	private titleControl: ChatViewTitleControl | undefined;

	private createChatControl(parent: HTMLElement): ChatWidget {
		const chatControlsContainer = append(parent, $('.chat-controls-container'));

		const locationBasedColors = this.getLocationBasedColors();

		const editorOverflowWidgetsDomNode = this.layoutService.getContainer(getWindow(chatControlsContainer)).appendChild($('.chat-editor-overflow.monaco-editor'));
		this._register(toDisposable(() => editorOverflowWidgetsDomNode.remove()));

		// Chat Title
		this.createChatTitleControl(chatControlsContainer);

		// Chat Widget
		const scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService])));
		this._widget = this._register(scopedInstantiationService.createInstance(
			ChatWidget,
			ChatAgentLocation.Chat,
			{ viewId: this.id },
			{
				autoScroll: mode => mode !== ChatModeKind.Ask,
				renderFollowups: true,
				supportsFileReferences: true,
				clear: () => this.clear(),
				rendererOptions: {
					renderTextEditsAsSummary: (uri) => {
						return true;
					},
					referencesExpandedWhenEmptyResponse: false,
					progressMessageAtBottomOfResponse: mode => mode !== ChatModeKind.Ask,
				},
				editorOverflowWidgetsDomNode,
				enableImplicitContext: true,
				enableWorkingSet: 'explicit',
				supportsChangingModes: true,
				dndContainer: parent,
			},
			{
				listForeground: SIDE_BAR_FOREGROUND,
				listBackground: locationBasedColors.background,
				overlayBackground: locationBasedColors.overlayBackground,
				inputEditorBackground: locationBasedColors.background,
				resultEditorBackground: editorBackground,
			}));
		this._widget.render(chatControlsContainer);

		const updateWidgetVisibility = (reader?: IReader) => this._widget.setVisible(this.isBodyVisible() && !this.welcomeController?.isShowingWelcome.read(reader));
		this._register(this.onDidChangeBodyVisibility(() => updateWidgetVisibility()));
		this._register(autorun(reader => updateWidgetVisibility(reader)));

		return this._widget;
	}

	private createChatTitleControl(parent: HTMLElement): void {
		this.titleControl = this._register(this.instantiationService.createInstance(ChatViewTitleControl,
			parent,
			{
				focusChat: () => this._widget.focusInput()
			}
		));

		this._register(this.titleControl.onDidChangeHeight(() => {
			this.relayout();
		}));
	}

	//#endregion

	private registerControlsListeners(sessionsControl: AgentSessionsControl, chatWidget: ChatWidget, welcomeController: ChatViewWelcomeController): void {

		// Sessions control visibility is impacted by multiple things:
		// - chat widget being in empty state or showing a chat
		// - extensions provided welcome view showing or not
		// - configuration setting
		// - `hasByokModels` flipping (BYOK models becoming available or going away)
		const hasByokModelsContextKeys = new Set([ChatEntitlementContextKeys.hasByokModels.key]);
		this._register(Event.any(
			chatWidget.onDidChangeEmptyState,
			Event.fromObservable(welcomeController.isShowingWelcome),
			Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(ChatConfiguration.ChatViewSessionsEnabled)),
			Event.filter(this.contextKeyService.onDidChangeContext, e => e.affectsSome(hasByokModelsContextKeys))
		)(() => {
			if (this.sessionsViewerOrientation === AgentSessionsViewerOrientation.Stacked) {
				sessionsControl.clearFocus(); // improve visual appearance when switching visibility by clearing focus
			}
			const { changed: visibilityChanged } = this.updateSessionsControlVisibility();
			if (visibilityChanged) {
				this.relayout();
			}
		}));

		// Track the active chat model and reveal it in the sessions control if side-by-side
		this._register(chatWidget.onDidChangeViewModel(() => {
			const model = chatWidget.viewModel?.model;
			this.titleControl?.update(model);
			this._currentSessionResource.set(chatWidget.viewModel?.sessionResource, undefined);

			if (this.sessionsViewerOrientation === AgentSessionsViewerOrientation.Stacked) {
				return; // only reveal in side-by-side mode
			}

			const sessionResource = chatWidget.viewModel?.sessionResource;
			if (sessionResource) {
				const revealed = sessionsControl.reveal(sessionResource);
				if (!revealed) {
					// Session doesn't exist in the list yet (e.g., new untitled session),
					// clear the selection so the list doesn't show stale selection
					sessionsControl.clearFocus();
				}
			}
		}));

		// When sessions change (e.g., after first message in a new session)
		// reveal it unless the user is interacting with the list already
		this._register(this.agentSessionsService.model.onDidChangeSessions(() => {
			if (this.sessionsViewerOrientation === AgentSessionsViewerOrientation.Stacked) {
				return; // only reveal in side-by-side mode
			}

			if (sessionsControl.hasFocusOrSelection()) {
				return; // do not reveal if user is interacting with sessions control
			}

			const sessionResource = chatWidget.viewModel?.sessionResource;
			if (sessionResource) {
				sessionsControl.reveal(sessionResource);
			}
		}));

		// When the currently displayed session is archived, start a new session
		this._register(this.agentSessionsService.model.onDidChangeSessionArchivedState(e => {
			if (e.isArchived()) {
				const currentSessionResource = chatWidget.viewModel?.sessionResource;
				if (currentSessionResource && isEqual(currentSessionResource, e.resource)) {
					this.clear();
				}
			}
		}));

		// When showing sessions stacked, adjust the height of the sessions list to make room for chat input
		this._register(autorun(reader => {
			chatWidget.inputPart.height.read(reader);
			if (this.sessionsViewerVisible && this.sessionsViewerOrientation === AgentSessionsViewerOrientation.Stacked) {
				this.relayout();
			}
		}));

		// Show progress badge when the current session is in progress
		const progressBadgeDisposables = this._register(new MutableDisposable<DisposableStore>());
		const updateProgressBadge = () => {
			progressBadgeDisposables.value = new DisposableStore();

			if (!this.configurationService.getValue<boolean>(ChatConfiguration.ChatViewProgressBadgeEnabled)) {
				this.activityBadge.clear();
				return;
			}

			const model = chatWidget.viewModel?.model;
			if (model) {
				progressBadgeDisposables.value.add(autorun(reader => {
					if (model.requestInProgress.read(reader)) {
						this.activityBadge.value = this.activityService.showViewActivity(this.id, {
							badge: new ProgressBadge(() => localize('sessionInProgress', "Agent Session in Progress"))
						});
					} else {
						this.activityBadge.clear();
					}
				}));
			} else {
				this.activityBadge.clear();
			}
		};
		this._register(chatWidget.onDidChangeViewModel(() => updateProgressBadge()));
		this._register(Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(ChatConfiguration.ChatViewProgressBadgeEnabled))(() => updateProgressBadge()));
		updateProgressBadge();
	}

	private setupContextMenu(parent: HTMLElement): void {
		this._register(addDisposableListener(parent, EventType.CONTEXT_MENU, e => {
			EventHelper.stop(e, true);

			this.contextMenuService.showContextMenu({
				menuId: MenuId.ChatWelcomeContext,
				contextKeyService: this.contextKeyService,
				getAnchor: () => new StandardMouseEvent(getWindow(parent), e)
			});
		}));
	}

	//#region Model Management

	private applyModel(): void {
		this.restoringSession = this._applyModel();
		this.restoringSession.finally(() => this.restoringSession = undefined);
	}

	private async _applyModel(): Promise<void> {
		const modelRef = await this.acquireTransferredOrPersistedSession(CancellationToken.None, 'ChatViewPane#applyModel');
		await this.showModel(CancellationToken.None, modelRef, true, !modelRef);
	}

	/**
	 * Force-start a new local chat session in the view, bypassing the
	 * default-provider override applied by `showModel()`. Used by the
	 * picker when the user explicitly selects "Local".
	 */
	async startNewLocalSession(): Promise<IChatModel | undefined> {
		const ref = this.chatService.startNewLocalSession(ChatAgentLocation.Chat, { debugOwner: 'ChatViewPane#startNewLocalSession' });
		return this.showModel(CancellationToken.None, ref);
	}

	/**
	 * When the experimental `chat.editor.defaultProvider` setting selects a
	 * provider other than local and that contribution is registered, return a
	 * new session reference for it instead of the built-in local provider.
	 * Returns `undefined` to fall back to `startNewLocalSession`.
	 */
	private async acquireDefaultNewSession(token: CancellationToken): Promise<IChatModelReference | undefined> {
		const defaultType = getDefaultNewChatSessionType(this.configurationService, this.chatSessionsService, this.storageService);
		if (defaultType === localChatSessionType) {
			return undefined;
		}
		const resource = getDefaultNewChatSessionResource(this.configurationService, this.chatSessionsService, this.storageService);
		try {
			return await this.chatService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, token, 'ChatViewPane#acquireDefaultNewSession');
		} catch (error) {
			this.logService.warn(`[ChatViewPane] Failed to acquire default agent-host session, falling back to local`, error);
			return undefined;
		}
	}

	private async acquireTransferredOrPersistedSession(token: CancellationToken, debugOwner: string): Promise<IChatModelReference | undefined> {
		const sessionResource = this.getTransferredOrPersistedSessionInfo();
		if (!sessionResource) {
			return undefined;
		}

		const modelRef = await this.chatService.acquireOrLoadSession(sessionResource, ChatAgentLocation.Chat, token, debugOwner);
		if (!modelRef) {
			return undefined;
		}

		if (this.shouldSkipRestoredLocalSession(sessionResource, modelRef.object)) {
			modelRef.dispose();
			return undefined;
		}

		return modelRef;
	}

	private shouldSkipRestoredLocalSession(sessionResource: URI, model: IChatModel): boolean {
		const defaultType = getComputedDefaultSessionType(this.configurationService, this.chatSessionsService);
		const prefersAgentHostCopilot = this.configurationService.getValue<boolean>(ChatConfiguration.EditorLocalAgentEnabled) === false
			&& this.configurationService.getValue<string>(ChatConfiguration.EditorDefaultProvider) === 'copilotAh';
		return (defaultType !== localChatSessionType || prefersAgentHostCopilot)
			&& getChatSessionType(sessionResource) === localChatSessionType
			&& !model.hasRequests;
	}

	private async showModel(token: CancellationToken, modelRef?: IChatModelReference | undefined, startNewSession = true, ignoreTransferredSession = false): Promise<IChatModel | undefined> {
		const oldModelResource = this.modelRef.value?.object.sessionResource;
		this.modelRef.value = undefined;

		let ref: IChatModelReference | undefined;
		if (startNewSession) {
			if (modelRef) {
				ref = modelRef;
			} else if (!ignoreTransferredSession && this.chatService.transferredSessionResource) {
				ref = await this.chatService.acquireOrLoadSession(this.chatService.transferredSessionResource, ChatAgentLocation.Chat, token, 'ChatViewPane#showModel');
			} else {
				ref = await this.acquireDefaultNewSession(token) ?? this.chatService.startNewLocalSession(ChatAgentLocation.Chat, { debugOwner: 'ChatViewPane#showModel' });
			}
			if (!ref) {
				throw new Error('Could not start chat session');
			}
		}

		if (token.isCancellationRequested) {
			ref?.dispose();
			return undefined;
		}

		this.modelRef.value = ref;
		const model = ref?.object;

		if (model) {
			await this.updateWidgetLockState(getChatSessionType(model.sessionResource)); // Update widget lock state based on session type

			if (token.isCancellationRequested) {
				this.modelRef.value = undefined;
				return undefined;
			}

			// remember as model to restore in view state
			this.viewState.sessionResource = model.sessionResource;
		}

		this._widget.setModel(model);

		// Update title control
		this.titleControl?.update(model);

		// Update the toolbar context with new sessionId
		this.updateActions();

		// Mark the old model as read when closing unless explicitly marked unread.
		// Deferred because setRead fires _onDidChangeSessions which synchronously
		// re-renders the sessions list (~250ms), and that doesn't need to block
		// the new chat from displaying.
		if (oldModelResource) {
			const capturedOldResource = oldModelResource;
			this._register(disposableTimeout(() => {
				const oldSession = this.agentSessionsService.model.getSession(capturedOldResource);
				if (oldSession && !oldSession.isMarkedUnread()) {
					oldSession.setRead(true);
				}
			}, 0));
		}

		return model;
	}

	private async updateWidgetLockState(sessionType: string): Promise<void> {
		if (sessionType === localChatSessionType) {
			this._widget.unlockFromCodingAgent();
			return;
		}

		let canResolve = false;
		try {
			canResolve = await this.chatSessionsService.canResolveChatSession(sessionType);
		} catch (error) {
			this.logService.warn(`Failed to resolve chat session type '${sessionType}' for locking`, error);
		}

		if (!canResolve) {
			this._widget.unlockFromCodingAgent();
			return;
		}

		const contribution = this.chatSessionsService.getChatSessionContribution(sessionType);
		if (contribution) {
			this._widget.lockToCodingAgent(contribution.name, contribution.displayName, sessionType, contribution.agentHostProviderId);
		} else {
			this._widget.unlockFromCodingAgent();
		}
	}

	private async clear(): Promise<void> {
		// Cancel any in-flight loadSession call to prevent it from
		// overwriting the fresh session we are about to create.
		this.loadSessionCts.value?.cancel();

		// Grab the widget's latest view state because it will be loaded back into the widget
		this.updateViewState();
		await this.showModel(CancellationToken.None);

		// Update the toolbar context with new sessionId
		this.updateActions();
	}

	async loadSession(sessionResource: URI): Promise<IChatModel | undefined> {
		const t0 = Date.now();
		this.logService.trace(`[ChatViewPane] loadSession start uri=${sessionResource.toString()}`);

		// Cancel any in-flight loadSession call so the last one always wins
		this.loadSessionCts.value?.cancel();
		const cts = this.loadSessionCts.value = new CancellationTokenSource();
		const token = cts.token;

		// Wait for any in-progress session restore (e.g. from onDidChangeAgents)
		// to finish first, so our showModel call is guaranteed to be the last one.
		if (this.restoringSession) {
			await this.restoringSession;
		}

		if (token.isCancellationRequested) {
			this.logService.trace(`[ChatViewPane] loadSession done total=${Date.now() - t0}ms uri=${sessionResource.toString()} cancelled=true phase=preAcquire`);
			return undefined;
		}

		return this.progressService.withProgress({ location: ChatViewId, delay: 200 }, async () => {
			let queue: Promise<void> = Promise.resolve();

			// A delay here to avoid blinking because only Cloud sessions are slow, most others are fast
			const clearWidget = disposableTimeout(() => {
				// Only clear the current model if this loadSession call is still the active one
				// and has not been cancelled. This preserves the "last call wins" behavior.
				if (token.isCancellationRequested || this.loadSessionCts.value !== cts) {
					return;
				}
				// clear current model without starting a new one
				queue = this.showModel(token, undefined, false).then(() => { });
			}, 100);
			const clearWidgetCancellationListener = token.onCancellationRequested(() => clearWidget.dispose());

			try {
				const newModelRef = await this.chatService.acquireOrLoadSession(sessionResource, ChatAgentLocation.Chat, token, 'ChatViewPane#loadSession');
				clearWidget.dispose();
				await queue;

				if (token.isCancellationRequested) {
					newModelRef?.dispose();
					this.logService.trace(`[ChatViewPane] loadSession done total=${Date.now() - t0}ms uri=${sessionResource.toString()} cancelled=true phase=postAcquire`);
					return undefined;
				}

				const result = await this.showModel(token, newModelRef);
				this.logService.trace(`[ChatViewPane] loadSession done total=${Date.now() - t0}ms uri=${sessionResource.toString()}`);
				return result;
			} catch (err) {
				clearWidget.dispose();
				await queue;

				if (token.isCancellationRequested) {
					this.logService.trace(`[ChatViewPane] loadSession done total=${Date.now() - t0}ms uri=${sessionResource.toString()} cancelled=true phase=error`);
					return undefined;
				}

				// Recover by starting a fresh empty session so the widget
				// is not left in a broken state without title or back button.
				this.logService.error(`Failed to load chat session '${sessionResource.toString()}'`, err);
				this.notificationService.error(localize('chat.loadSessionFailed', "Failed to open chat session: {0}", toErrorMessage(err)));
				const result = await this.showModel(token, undefined);
				this.logService.trace(`[ChatViewPane] loadSession done total=${Date.now() - t0}ms uri=${sessionResource.toString()} error=true`);
				return result;
			} finally {
				clearWidgetCancellationListener.dispose();
			}
		});
	}

	//#endregion

	override focus(): void {
		super.focus();

		this.focusInput();
	}

	focusInput(): void {
		this._widget.focusInput();
	}

	focusSessions(): boolean {
		if (this.sessionsContainer?.style.display === 'none') {
			return false; // not visible
		}

		this.sessionsControl?.focus();

		return true;
	}

	//#region Layout

	private layoutingBody = false;

	private relayout(): void {
		if (!this._widget?.visible) {
			return;
		}

		if (this.lastDimensions) {
			this.layoutBody(this.lastDimensions.height, this.lastDimensions.width);
		}
	}

	protected override layoutBody(height: number, width: number): void {
		if (this.layoutingBody) {
			return; // prevent re-entrancy
		}

		this.layoutingBody = true;
		try {
			this.doLayoutBody(height, width);
		} finally {
			this.layoutingBody = false;
		}
	}

	private doLayoutBody(height: number, width: number): void {
		super.layoutBody(height, width);

		this.lastDimensions = { height, width };

		let remainingHeight = height;
		const remainingWidth = width;

		// Voice bar is now inside the input container, no separate height deduction needed

		// Title Control
		const titleHeight = this.titleControl?.getHeight() ?? 0;
		remainingHeight -= titleHeight;

		// Sessions Control
		const { heightReduction, widthReduction } = this.layoutSessionsControl(remainingHeight, remainingWidth);

		// In stacked mode the sessions viewer sits above the chat widget, so the
		// widget's layout height is reduced by `heightReduction`. However, the input
		// part's max-height needs to be based on the full `remainingHeight` (before
		// the sessions viewer deduction) so the input can grow freely. As the input
		// grows, an autorun triggers relayout which shrinks the sessions viewer,
		// giving the widget more space and converging to the right sizes.
		this._widget.setInputPartMaxHeightOverride(this.sessionsViewerOrientation === AgentSessionsViewerOrientation.Stacked ? remainingHeight : undefined);

		// Chat Widget
		this._widget.layout(remainingHeight - heightReduction, remainingWidth - widthReduction);

		// Remember last dimensions per orientation
		this.lastDimensionsPerOrientation.set(this.sessionsViewerOrientation, { height, width });
	}

	private layoutSessionsControl(height: number, width: number): { heightReduction: number; widthReduction: number } {
		let heightReduction = 0;
		let widthReduction = 0;

		if (!this.sessionsContainer || !this.sessionsControlContainer || !this.sessionsControl || !this.viewPaneContainer || !this.sessionsTitleContainer || !this.sessionsTitle) {
			return { heightReduction, widthReduction };
		}

		const oldSessionsViewerOrientation = this.sessionsViewerOrientation;
		let newSessionsViewerOrientation: AgentSessionsViewerOrientation;
		switch (this.sessionsViewerOrientationConfiguration) {
			// Stacked
			case 'stacked':
				newSessionsViewerOrientation = AgentSessionsViewerOrientation.Stacked;
				break;
			// Update orientation based on available width
			default:
				newSessionsViewerOrientation = width >= ChatViewPane.SESSIONS_SIDEBAR_VIEW_MIN_WIDTH ? AgentSessionsViewerOrientation.SideBySide : AgentSessionsViewerOrientation.Stacked;
		}

		this.sessionsViewerOrientation = newSessionsViewerOrientation;

		if (newSessionsViewerOrientation === AgentSessionsViewerOrientation.SideBySide) {
			this.viewPaneContainer.classList.toggle('sessions-control-orientation-sidebyside', true);
			this.viewPaneContainer.classList.toggle('sessions-control-orientation-stacked', false);
			this.sessionsViewerOrientationContext.set(AgentSessionsViewerOrientation.SideBySide);
		} else {
			this.viewPaneContainer.classList.toggle('sessions-control-orientation-sidebyside', false);
			this.viewPaneContainer.classList.toggle('sessions-control-orientation-stacked', true);
			this.sessionsViewerOrientationContext.set(AgentSessionsViewerOrientation.Stacked);
		}

		if (oldSessionsViewerOrientation !== this.sessionsViewerOrientation) {
			const updatePromise = this.sessionsControl.update(); // Changing orientation has an impact to grouping, so we need to update

			// Switching to side-by-side, reveal the current session after elements have loaded
			if (this.sessionsViewerOrientation === AgentSessionsViewerOrientation.SideBySide) {
				updatePromise.then(didUpdate => {
					if (!didUpdate) {
						return;
					}

					const sessionResource = this._widget?.viewModel?.sessionResource;
					if (sessionResource) {
						this.sessionsControl?.reveal(sessionResource);
					}
				});
			}
		}

		// Ensure visibility is in sync before we layout
		const { visible: sessionsContainerVisible } = this.updateSessionsControlVisibility();

		// Handle Sash (only visible in side-by-side)
		if (!sessionsContainerVisible || this.sessionsViewerOrientation === AgentSessionsViewerOrientation.Stacked) {
			this.sessionsViewerSashDisposables.clear();
			this.sessionsViewerSash = undefined;
		} else if (this.sessionsViewerOrientation === AgentSessionsViewerOrientation.SideBySide) {
			if (!this.sessionsViewerSashDisposables.value && this.viewPaneContainer) {
				this.createSessionsViewerSash(this.viewPaneContainer, height, width);
			}
		}

		if (!sessionsContainerVisible) {
			return { heightReduction: 0, widthReduction: 0 };
		}

		let availableSessionsHeight = height - this.sessionsTitleContainer.offsetHeight;
		if (this.sessionsViewerOrientation === AgentSessionsViewerOrientation.Stacked) {
			availableSessionsHeight -= Math.max(ChatViewPane.MIN_CHAT_WIDGET_HEIGHT, this._widget?.input?.height.get() ?? 0);
		} else {
			availableSessionsHeight -= this.sessionsNewButtonContainer?.offsetHeight ?? 0;
		}

		// Show as sidebar
		if (this.sessionsViewerOrientation === AgentSessionsViewerOrientation.SideBySide) {
			const sessionsViewerSidebarWidth = this.computeEffectiveSideBySideSessionsSidebarWidth(width);

			this.sessionsControlContainer.style.height = `${availableSessionsHeight}px`;
			this.sessionsControlContainer.style.width = `${sessionsViewerSidebarWidth}px`;
			this.sessionsControl.layout(availableSessionsHeight, sessionsViewerSidebarWidth);
			this.sessionsViewerSash?.layout();

			heightReduction = 0; // side by side to chat widget
			widthReduction = this.sessionsContainer.offsetWidth;
		}

		// Show stacked
		else {
			this.sessionsControlContainer.style.height = `${availableSessionsHeight}px`;
			this.sessionsControlContainer.style.width = ``;
			this.sessionsControl.layout(availableSessionsHeight, width);

			heightReduction = this.sessionsContainer.offsetHeight;
			widthReduction = 0; // stacked on top of the chat widget
		}

		return { heightReduction, widthReduction };
	}

	private computeEffectiveSideBySideSessionsSidebarWidth(width: number, sessionsViewerSidebarWidth = this.sessionsViewerSidebarWidth): number {
		return Math.max(
			ChatViewPane.SESSIONS_SIDEBAR_MIN_WIDTH,			// never smaller than min width for side by side sessions
			Math.min(
				sessionsViewerSidebarWidth,
				width - ChatViewPane.CHAT_WIDGET_DEFAULT_WIDTH	// never so wide that chat widget is smaller than default width
			)
		);
	}

	getLastDimensions(orientation: AgentSessionsViewerOrientation): { height: number; width: number } | undefined {
		return this.lastDimensionsPerOrientation.get(orientation);
	}

	private createSessionsViewerSash(container: HTMLElement, height: number, width: number): void {
		const disposables = this.sessionsViewerSashDisposables.value = new DisposableStore();

		const sash = this.sessionsViewerSash = disposables.add(new Sash(container, {
			getVerticalSashLeft: () => {
				const sessionsViewerSidebarWidth = this.computeEffectiveSideBySideSessionsSidebarWidth(this.lastDimensions?.width ?? width);
				const { position } = this.getViewPositionAndLocation();
				if (position === Position.RIGHT) {
					return (this.lastDimensions?.width ?? width) - sessionsViewerSidebarWidth;
				}

				return sessionsViewerSidebarWidth;
			}
		}, { orientation: Orientation.VERTICAL }));

		let sashStartWidth: number | undefined;
		disposables.add(sash.onDidStart(() => sashStartWidth = this.sessionsViewerSidebarWidth));
		disposables.add(sash.onDidEnd(() => sashStartWidth = undefined));

		disposables.add(sash.onDidChange(e => {
			if (sashStartWidth === undefined || !this.lastDimensions) {
				return;
			}

			const { position } = this.getViewPositionAndLocation();
			const delta = e.currentX - e.startX;
			const newWidth = position === Position.RIGHT ? sashStartWidth - delta : sashStartWidth + delta;

			if (newWidth < ChatViewPane.SESSIONS_SIDEBAR_SNAP_THRESHOLD) {
				this.updateConfiguredSessionsViewerOrientation('stacked'); // snap to stacked when sized small enough
				return;
			}

			this.sessionsViewerSidebarWidth = this.computeEffectiveSideBySideSessionsSidebarWidth(this.lastDimensions.width, newWidth);
			this.viewState.sessionsSidebarWidth = this.sessionsViewerSidebarWidth;

			this.layoutBody(this.lastDimensions.height, this.lastDimensions.width);
		}));

		disposables.add(sash.onDidReset(() => {
			this.sessionsViewerSidebarWidth = ChatViewPane.SESSIONS_SIDEBAR_DEFAULT_WIDTH;
			this.viewState.sessionsSidebarWidth = this.sessionsViewerSidebarWidth;

			this.relayout();
		}));
	}

	//#endregion

	override saveState(): void {

		// Don't do saveState when no widget, or no viewModel in which case
		// the state has not yet been restored - in that case the default
		// state would overwrite the real state
		if (this._widget?.viewModel) {
			this._widget.saveState();

			this.updateViewState();
			this.memento.saveMemento();
		}

		super.saveState();
	}

	private updateViewState(viewState?: IChatModelInputState): void {
		const newViewState = viewState ?? this._widget.getViewState();
		if (newViewState) {
			for (const [key, value] of Object.entries(newViewState)) {
				(this.viewState as Record<string, unknown>)[key] = value; // Assign all props to the memento so they get saved
			}
		}
	}

	override shouldShowWelcome(): boolean {
		const noPersistedSessions = !this.chatService.hasSessions();
		const hasCoreAgent = this.chatAgentService.getAgents().some(agent => agent.isCore && agent.locations.includes(ChatAgentLocation.Chat));
		const hasDefaultAgent = this.chatAgentService.getDefaultAgent(ChatAgentLocation.Chat) !== undefined; // only false when Hide AI Features has run and unregistered the setup agents
		const shouldShow = !hasCoreAgent && (!hasDefaultAgent || !this._widget?.viewModel && noPersistedSessions);

		this.logService.trace(`ChatViewPane#shouldShowWelcome() = ${shouldShow}: hasCoreAgent=${hasCoreAgent} hasDefaultAgent=${hasDefaultAgent} || noViewModel=${!this._widget?.viewModel} && noPersistedSessions=${noPersistedSessions}`);

		return !!shouldShow;
	}

	getMatchingWelcomeView(): IChatViewsWelcomeDescriptor | undefined {
		return this.welcomeController?.getMatchingWelcomeView();
	}

	override getActionsContext(): IChatViewTitleActionContext | undefined {
		return this._widget?.viewModel ? {
			sessionResource: this._widget.viewModel.sessionResource,
			$mid: MarshalledId.ChatViewContext
		} : undefined;
	}
}

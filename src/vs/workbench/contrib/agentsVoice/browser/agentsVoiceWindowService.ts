/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { disposableWindowInterval, getWindow } from '../../../../base/browser/dom.js';
import { FileAccess } from '../../../../base/common/network.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IAuxiliaryWindowService, IAuxiliaryWindow } from '../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { IAgentsVoiceWindowService, AgentsVoiceStorageKeys, AGENTS_VOICE_WINDOW_DEFAULT_WIDTH, AGENTS_VOICE_WINDOW_DEFAULT_HEIGHT } from '../common/agentsVoice.js';
import { IRectangle } from '../../../../platform/window/common/window.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IAgentSessionsService } from '../../chat/browser/agentSessions/agentSessionsService.js';
import { IAgentTitleBarStatusService } from '../../chat/browser/agentSessions/experiments/agentTitleBarStatusService.js';
import { IMicCaptureService } from '../../chat/browser/voiceClient/micCaptureService.js';
import { ITtsPlaybackService } from '../../chat/browser/voiceClient/ttsPlaybackService.js';
import { IVoiceSessionController } from '../../chat/browser/voiceClient/voiceSessionController.js';
import { IVoicePlaybackService } from '../../chat/common/voicePlaybackService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IChatService } from '../../chat/common/chatService/chatService.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { editorBackground } from '../../../../platform/theme/common/colorRegistry.js';
import { inputBackground, inputBorder } from '../../../../platform/theme/common/colors/inputColors.js';
import { AgentsVoiceWidget } from './agentsVoiceWidget.js';
import { bindWidgetToController } from './agentsVoiceWidgetBinding.js';
import { AgentsVoiceSessionsPicker } from './agentsVoiceSessionsPicker.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { StandardMouseEvent } from '../../../../base/browser/mouseEvent.js';
import { getVoiceModeContextMenuActions } from '../../chat/browser/speechToText/micButtonMenuActions.js';

export class AgentsVoiceWindowService extends Disposable implements IAgentsVoiceWindowService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeOpen = this._register(new Emitter<boolean>());
	readonly onDidChangeOpen: Event<boolean> = this._onDidChangeOpen.event;

	private readonly _auxiliaryWindowRef = this._register(new MutableDisposable());
	private _window: IAuxiliaryWindow | undefined;
	private readonly _windowDisposables = this._register(new DisposableStore());
	private readonly _ownershipChannel: BroadcastChannel;
	private _resizeTimeout: ReturnType<typeof setTimeout> | undefined;

	get isOpen(): boolean {
		return !!this._window;
	}

	/**
	 * Calls setWindowAlwaysOnTop via a registered command (Electron only).
	 * Avoids importing INativeHostService in the browser layer.
	 */
	constructor(
		@IAuxiliaryWindowService private readonly auxiliaryWindowService: IAuxiliaryWindowService,
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IHostService private readonly hostService: IHostService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IAgentTitleBarStatusService private readonly agentTitleBarStatusService: IAgentTitleBarStatusService,
		@IMicCaptureService private readonly micCaptureService: IMicCaptureService,
		@ITtsPlaybackService private readonly ttsPlaybackService: ITtsPlaybackService,
		@IVoiceSessionController private readonly voiceSessionController: IVoiceSessionController,
		@IVoicePlaybackService private readonly voicePlaybackService: IVoicePlaybackService,
		@ICommandService private readonly commandService: ICommandService,
		@IChatService private readonly chatService: IChatService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IThemeService private readonly themeService: IThemeService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
	) {
		super();

		const ownershipChannel = new BroadcastChannel('agents-voice-ownership');
		ownershipChannel.onmessage = (e) => {
			if (e.data?.type === 'claim' && this._window) {
				this.closeWindow();
			}
		};
		this._register({ dispose: () => ownershipChannel.close() });
		this._ownershipChannel = ownershipChannel;

		const onBeforeUnload = () => {
			if (this._window) {
				this.closeWindow();
			}
		};
		mainWindow.addEventListener('beforeunload', onBeforeUnload);
		this._register({ dispose: () => mainWindow.removeEventListener('beforeunload', onBeforeUnload) });

		const wasOpen = this.storageService.getBoolean(AgentsVoiceStorageKeys.WindowOpen, StorageScope.WORKSPACE, false);
		if (wasOpen) {
			// Clear the stored state so it doesn't try to reopen in the future
			this.storageService.store(AgentsVoiceStorageKeys.WindowOpen, false, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}
	}

	async openWindow(): Promise<void> {
		if (this._window) {
			return;
		}

		const bounds = this.loadBounds();

		const auxiliaryWindow = await this.auxiliaryWindowService.open({
			bounds,
			alwaysOnTop: true,
			frameless: true,
			transparent: false,
			disableFullscreen: true,
			nativeTitlebar: false,
			noBackgroundThrottling: true,
			backgroundColor: this.themeService.getColorTheme().getColor(editorBackground)?.toString() ?? '#1e1e1e',
		});

		this._window = auxiliaryWindow;
		this._auxiliaryWindowRef.value = auxiliaryWindow;

		const workspace = this.workspaceContextService.getWorkspace();
		const projectName = workspace.folders.length > 0 ? workspace.folders[0].name : '';
		auxiliaryWindow.window.document.title = projectName ? `Agents Voice — ${projectName}` : 'Agents Voice';

		auxiliaryWindow.container.style.overflow = 'hidden';
		auxiliaryWindow.window.document.body.style.setProperty('margin', '0', 'important');

		// Resolve theme colors so the aux window matches the chat input box
		const theme = this.themeService.getColorTheme();
		const bgColor = theme.getColor(editorBackground)?.toString() ?? '#1e1e1e';
		const inputBg = theme.getColor(inputBackground)?.toString() ?? '#3C3C3C';
		const inputBd = theme.getColor(inputBorder)?.toString() ?? 'transparent';

		auxiliaryWindow.container.style.setProperty('--vscode-agents-background', bgColor);
		auxiliaryWindow.container.style.backgroundColor = inputBg;
		auxiliaryWindow.container.style.border = `1px solid ${inputBd}`;
		auxiliaryWindow.container.style.boxSizing = 'border-box';
		auxiliaryWindow.window.document.body.style.setProperty('background-color', inputBg, 'important');

		this._windowDisposables.clear();

		// Create the widget — aux window uses the default options (draggable, fixed
		// width, close button, expand chevron, status rows, no status-text label,
		// no popout button). Sessions are collapsed by default; the user can
		// expand them via the chevron.
		const widget = new AgentsVoiceWidget(auxiliaryWindow.container, {
			copilotIconSrc: FileAccess.asBrowserUri('vs/sessions/browser/media/sessions-icon.svg').toString(true),
			hideDisconnect: this.configurationService.getValue<boolean>('agents.voice.handsFree') === true,
			connect: () => {
				// Connecting from any surface marks onboarding as completed so
				// the main panel drops it too.
				this.storageService.store(AgentsVoiceStorageKeys.OnboardingCompleted, true, StorageScope.PROFILE, StorageTarget.USER);
				this.voiceSessionController.connect(mainWindow);
			},
			disconnect: () => this.voiceSessionController.disconnect('explicit'),
			pttDown: () => {
				if (!this.voiceSessionController.isConnected.get() && !this.voiceSessionController.isConnecting.get()) {
					this.voiceSessionController.connect(mainWindow).then(() => {
						if (this.voiceSessionController.isConnected.get()) {
							this.voiceSessionController.pttDown();
						}
					});
					return;
				}
				this.voiceSessionController.pttDown();
			},
			pttUp: () => this.voiceSessionController.pttUp(),
			closeWindow: () => this.closeWindow(),
			stopPlayback: () => this.ttsPlaybackService.stopPlayback(),
			openSession: (resource) => {
				this.commandService.executeCommand('_chat.voice.switchToSession', resource.toString());
				this.hostService.focus(mainWindow);
			},
			stopSession: (resource) => {
				const model = this.chatService.getSession(resource);
				if (model) {
					const lastReq = model.getRequests().at(-1);
					if (lastReq) {
						this.voiceSessionController.markUserCancelled(resource.toString());
						this.chatService.cancelCurrentRequestForSession(resource);
					}
				}
			},
			cancelSession: (resource) => {
				this.voiceSessionController.markUserCancelled(resource.toString());
				this.chatService.cancelCurrentRequestForSession(resource);
			},
			selectTargetSession: (resource) => {
				this.voiceSessionController.setTargetSession(resource);
				// Reveal the selected session in the chat panel
				if (resource) {
					this.commandService.executeCommand('_chat.voice.switchToSession', resource.toString()).catch(() => { /* ignore */ });
				}
			},
			newSessionAsTarget: () => {
				this.voiceSessionController.newSessionAsTarget();
			},
			getAnalyserNode: () => {
				const state = this.voiceSessionController.voiceState.get();
				return this.ttsPlaybackService.analyserNode
					?? (state === 'listening' ? this.micCaptureService.analyserNode : null)
					?? null;
			},
			onResize: () => this._resizeWindow(auxiliaryWindow),
			openPttKeySettings: () => this.commandService.executeCommand('workbench.action.openGlobalKeybindings', 'agentsVoice.pushToTalk'),
			showVoiceContextMenu: (e: MouseEvent) => {
				const anchor = new StandardMouseEvent(getWindow(e.target as Node ?? auxiliaryWindow.container), e);
				this.contextMenuService.showContextMenu({
					getAnchor: () => anchor,
					getActions: () => getVoiceModeContextMenuActions(this.commandService, this.configurationService, this.keybindingService, 'agentsVoice.pushToTalk'),
				});
			},
			submitFeedback: (text) => this.voiceSessionController.submitFeedback(text),
			showSessionsPicker: () => {
				const picker = this.instantiationService.createInstance(
					AgentsVoiceSessionsPicker,
					(resource) => this.voiceSessionController.setTargetSession(resource),
				);
				picker.show();
			},
		}, {
			defaultExpanded: false,
			inputBoxLayout: true,
			// Make the aux-window container focusable so keyboard Push-to-Talk
			// (the `agentsVoice.pushToTalk` keybinding) can be received and its
			// key-release tracking is registered. Without this the keyboard-PTT
			// handlers are never wired and a held key never stops recording.
			focusable: true,
		});
		this._windowDisposables.add(widget);

		// PTT key label from keybinding
		const getPttLabel = () => this.keybindingService.lookupKeybinding('agentsVoice.pushToTalk')?.getLabel() ?? undefined;
		widget.setPttKeyLabel(getPttLabel());
		this._windowDisposables.add(this.keybindingService.onDidUpdateKeybindings(() => {
			widget.setPttKeyLabel(getPttLabel());
		}));

		// Shared controller→widget binding (also used by chatViewPane)
		this._windowDisposables.add(bindWidgetToController(widget, {
			voiceSessionController: this.voiceSessionController,
			agentSessionsService: this.agentSessionsService,
			agentTitleBarStatusService: this.agentTitleBarStatusService,
			voicePlaybackService: this.voicePlaybackService,
			environmentService: this.environmentService,
			chatService: this.chatService,
			configurationService: this.configurationService,
		}));

		// Poll for session updates
		this.agentSessionsService.model.resolve(undefined);
		this._windowDisposables.add(disposableWindowInterval(auxiliaryWindow.window, () => {
			this.agentSessionsService.model.resolve(undefined);
		}, 3000));


		// Clean up when user closes window via OS controls
		Event.once(auxiliaryWindow.onUnload)(() => {
			this.voiceSessionController.setTargetSession(undefined);
			this.voiceSessionController.disconnect();
			this._window = undefined;
			this._windowDisposables.clear();
			this._auxiliaryWindowRef.value = undefined;
			this.storageService.store(AgentsVoiceStorageKeys.WindowOpen, false, StorageScope.WORKSPACE, StorageTarget.MACHINE);
			this._onDidChangeOpen.fire(false);
		});

		this.storageService.store(AgentsVoiceStorageKeys.WindowOpen, true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		this._onDidChangeOpen.fire(true);
	}

	closeWindow(): void {
		if (!this._window) { return; }

		this.saveBounds(this._window);
		// Don't disconnect — closing the floating window minimizes the UI but
		// keeps the voice session alive. The session ends on terminal disconnect
		// (Disconnect button or app exit via onUnload).
		// Clear target session selection so it doesn't silently persist.
		this.voiceSessionController.setTargetSession(undefined);
		this.storageService.store(AgentsVoiceStorageKeys.WindowOpen, false, StorageScope.WORKSPACE, StorageTarget.MACHINE);

		this._window = undefined;
		this._windowDisposables.clear();
		this._auxiliaryWindowRef.value = undefined;
		this._onDidChangeOpen.fire(false);
	}

	async toggleWindow(): Promise<void> {
		if (this.isOpen) {
			this.closeWindow();
		} else {
			this._ownershipChannel.postMessage({ type: 'claim' });
			await this.openWindow();
		}
	}

	// --- Window sizing ---

	private _resizeWindow(auxiliaryWindow: IAuxiliaryWindow): void {
		// Debounce resize to avoid fighting user drag operations
		if (this._resizeTimeout) {
			clearTimeout(this._resizeTimeout);
		}
		this._resizeTimeout = setTimeout(() => {
			this._resizeTimeout = undefined;
			this._doResizeWindow(auxiliaryWindow);
		}, 100);
	}

	private _doResizeWindow(auxiliaryWindow: IAuxiliaryWindow): void {
		// eslint-disable-next-line no-restricted-syntax
		const pill = auxiliaryWindow.container.querySelector('div') as HTMLElement | null;
		if (!pill) { return; }
		void pill.offsetWidth;
		const pillWidth = pill.offsetWidth;
		const pillHeight = pill.offsetHeight;
		if (pillWidth <= 0 || pillHeight <= 0) { return; }
		const currentWidth = auxiliaryWindow.window.outerWidth;
		const currentHeight = auxiliaryWindow.window.outerHeight;
		if (pillWidth !== currentWidth || pillHeight !== currentHeight) {
			try {
				// Clamp height so window doesn't exceed available screen space.
				const screenBottom = auxiliaryWindow.window.screen.availHeight;
				const maxHeight = screenBottom - auxiliaryWindow.window.screenY;
				const clampedHeight = Math.min(pillHeight, Math.max(maxHeight, AGENTS_VOICE_WINDOW_DEFAULT_HEIGHT));
				// resizeTo only — no moveTo. On macOS this keeps top-left fixed,
				// window grows/shrinks downward. No visible position change.
				auxiliaryWindow.window.resizeTo(pillWidth, clampedHeight);
			} catch { /* resize may not be supported */ }
		}
	}

	// --- Bounds persistence ---

	private _defaultBounds(): IRectangle {
		// Center horizontally within the main VS Code window, near bottom.
		const x = Math.round(mainWindow.screenX + (mainWindow.outerWidth - AGENTS_VOICE_WINDOW_DEFAULT_WIDTH) / 2);
		const y = mainWindow.screenY + mainWindow.outerHeight - AGENTS_VOICE_WINDOW_DEFAULT_HEIGHT - 100;
		return {
			x,
			y,
			width: AGENTS_VOICE_WINDOW_DEFAULT_WIDTH,
			height: AGENTS_VOICE_WINDOW_DEFAULT_HEIGHT,
		};
	}

	private loadBounds(): IRectangle {
		// Always compute fresh bounds from the current main window position.
		// This ensures the aux window is always centered within VS Code.
		return this._defaultBounds();
	}

	private saveBounds(_window: IAuxiliaryWindow): void {
		// Bounds persistence disabled — always use fresh defaults for now.
	}
}

registerSingleton(IAgentsVoiceWindowService, AgentsVoiceWindowService, InstantiationType.Delayed);

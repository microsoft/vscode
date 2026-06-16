/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { disposableWindowInterval } from '../../../../base/browser/dom.js';
import { getZoomFactor } from '../../../../base/browser/browser.js';
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
import { AgentsVoiceWidget } from './agentsVoiceWidget.js';
import { bindWidgetToController } from './agentsVoiceWidgetBinding.js';

export class AgentsVoiceWindowService extends Disposable implements IAgentsVoiceWindowService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeOpen = this._register(new Emitter<boolean>());
	readonly onDidChangeOpen: Event<boolean> = this._onDidChangeOpen.event;

	private readonly _auxiliaryWindowRef = this._register(new MutableDisposable());
	private _window: IAuxiliaryWindow | undefined;
	private readonly _windowDisposables = this._register(new DisposableStore());
	private readonly _ownershipChannel: BroadcastChannel;

	get isOpen(): boolean {
		return !!this._window;
	}

	/**
	 * Calls setWindowAlwaysOnTop via a registered command (Electron only).
	 * Avoids importing INativeHostService in the browser layer.
	 */
	private async trySetWindowAlwaysOnTop(alwaysOnTop: boolean, targetWindowId: number): Promise<void> {
		try {
			await this.commandService.executeCommand('_agentsVoice.setWindowAlwaysOnTop', alwaysOnTop, targetWindowId);
		} catch {
			// Command not registered (e.g. web) — ignore
		}
	}

	/**
	 * Minimizes a window via a registered command (Electron only).
	 */
	private async tryMinimizeWindow(targetWindowId: number): Promise<void> {
		try {
			await this.commandService.executeCommand('_agentsVoice.minimizeWindow', targetWindowId);
		} catch {
			// Command not registered (e.g. web) — ignore
		}
	}

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

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('agents.voice.alwaysOnTop') && this._window) {
				const alwaysOnTop = this.configurationService.getValue<boolean>('agents.voice.alwaysOnTop') ?? true;
				this.trySetWindowAlwaysOnTop(alwaysOnTop, this._window.window.vscodeWindowId);
			}
		}));

		const wasOpen = this.storageService.getBoolean(AgentsVoiceStorageKeys.WindowOpen, StorageScope.WORKSPACE, false);
		if (wasOpen && this.configurationService.getValue<boolean>('agents.voice.enabled')) {
			const reopenTimeout = setTimeout(() => this.openWindow(), 1000);
			this._register({ dispose: () => clearTimeout(reopenTimeout) });
		}
	}

	async openWindow(): Promise<void> {
		if (this._window) {
			return;
		}

		const bounds = this.loadBounds();
		const alwaysOnTop = this.configurationService.getValue<boolean>('agents.voice.alwaysOnTop') ?? true;

		const auxiliaryWindow = await this.auxiliaryWindowService.open({
			bounds,
			alwaysOnTop,
			frameless: true,
			transparent: false,
			disableFullscreen: true,
			nativeTitlebar: false,
			notResizable: true,
			noBackgroundThrottling: true,
			backgroundColor: this.themeService.getColorTheme().getColor(editorBackground)?.toString() ?? '#1e1e1e',
		});

		this._window = auxiliaryWindow;
		this._auxiliaryWindowRef.value = auxiliaryWindow;

		// Minimize the main VS Code window so the floating aux window is the
		// primary surface the user interacts with. The aux window stays visible
		// because it lives in a separate OS window. We minimize at three points
		// to defeat any focus-restore behavior from Electron when the aux is
		// shown: immediately, after styles load, and again after a short delay.
		const minimizeMain = async () => {
			try {
				const mainWindowId = mainWindow.vscodeWindowId;
				await this.tryMinimizeWindow(mainWindowId);
			} catch {
				// nativeHostService may not be available (e.g. web); ignore.
			}
		};
		void minimizeMain();
		auxiliaryWindow.whenStylesHaveLoaded.then(() => {
			void minimizeMain();
			setTimeout(() => { void minimizeMain(); }, 250);
		});

		const workspace = this.workspaceContextService.getWorkspace();
		const projectName = workspace.folders.length > 0 ? workspace.folders[0].name : '';
		auxiliaryWindow.window.document.title = projectName ? `Agents Voice — ${projectName}` : 'Agents Voice';

		auxiliaryWindow.container.style.overflow = 'hidden';
		auxiliaryWindow.container.style.setProperty('--vscode-agents-background', this.themeService.getColorTheme().getColor(editorBackground)?.toString() ?? '#1e1e1e');
		auxiliaryWindow.window.document.body.style.setProperty('margin', '0', 'important');

		this._windowDisposables.clear();

		// Create the widget — aux window uses the default options (draggable, fixed
		// width, close button, expand chevron, status rows, no status-text label,
		// no popout button), but starts in the expanded view by default so the
		// user immediately sees the session list when popping out.
		const widget = new AgentsVoiceWidget(auxiliaryWindow.container, {
			copilotIconSrc: FileAccess.asBrowserUri('vs/sessions/browser/media/sessions-icon.svg').toString(true),
			connect: () => {
				// Connecting from any surface marks onboarding as completed so
				// the main panel drops it too.
				this.storageService.store(AgentsVoiceStorageKeys.OnboardingCompleted, true, StorageScope.PROFILE, StorageTarget.USER);
				this.voiceSessionController.connect(mainWindow);
			},
			disconnect: () => this.voiceSessionController.disconnect(),
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
			submitFeedback: (text) => this.voiceSessionController.submitFeedback(text),
		}, {
			defaultExpanded: true,
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
		}));

		// Re-resize when zoom level changes
		let lastDpr = auxiliaryWindow.window.devicePixelRatio;
		let zoomDebounce: ReturnType<typeof setTimeout> | undefined;
		const checkZoom = () => {
			const currentDpr = auxiliaryWindow.window.devicePixelRatio;
			if (Math.abs(currentDpr - lastDpr) > 0.01) {
				lastDpr = currentDpr;
				if (zoomDebounce) { clearTimeout(zoomDebounce); }
				zoomDebounce = setTimeout(() => {
					this._resizeWindow(auxiliaryWindow);
				}, 200);
			}
		};
		this._windowDisposables.add(disposableWindowInterval(auxiliaryWindow.window, checkZoom, 500));
		this._windowDisposables.add({ dispose: () => { if (zoomDebounce) { clearTimeout(zoomDebounce); } } });

		// Poll for session updates
		this.agentSessionsService.model.resolve(undefined);
		this._windowDisposables.add(disposableWindowInterval(auxiliaryWindow.window, () => {
			this.agentSessionsService.model.resolve(undefined);
		}, 3000));

		// Periodically save window bounds
		let lastBoundsJson = '';
		this._windowDisposables.add(disposableWindowInterval(auxiliaryWindow.window, () => {
			if (!this._window) { return; }
			try {
				const state = this._window.createState();
				if (state.bounds) {
					const posJson = JSON.stringify({ x: state.bounds.x, y: state.bounds.y });
					if (posJson !== lastBoundsJson) {
						lastBoundsJson = posJson;
						this.storageService.store(AgentsVoiceStorageKeys.WindowBounds, posJson, StorageScope.WORKSPACE, StorageTarget.MACHINE);
					}
				}
			} catch { /* window may have been disposed */ }
		}, 1000));

		// Clean up when user closes window via OS controls
		Event.once(auxiliaryWindow.onUnload)(() => {
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
		// eslint-disable-next-line no-restricted-syntax
		const pill = auxiliaryWindow.container.querySelector('div') as HTMLElement | null;
		if (!pill) { return; }
		void pill.offsetWidth;
		const pillWidth = pill.offsetWidth;
		const pillHeight = pill.offsetHeight;
		if (pillWidth <= 0 || pillHeight <= 0) { return; }
		const zoomFactor = getZoomFactor(auxiliaryWindow.window);
		const targetWidth = Math.ceil(pillWidth * zoomFactor);
		const targetHeight = Math.ceil(pillHeight * zoomFactor);
		const currentWidth = auxiliaryWindow.window.outerWidth;
		const currentHeight = auxiliaryWindow.window.outerHeight;
		if (targetWidth !== currentWidth || targetHeight !== currentHeight) {
			try { auxiliaryWindow.window.resizeTo(targetWidth, targetHeight); } catch { /* resize may not be supported */ }
		}
	}

	// --- Bounds persistence ---

	private _defaultBounds(): IRectangle {
		const screenWidth = mainWindow.screen?.availWidth ?? 1920;
		return {
			x: screenWidth - AGENTS_VOICE_WINDOW_DEFAULT_WIDTH - 20,
			y: 20,
			width: AGENTS_VOICE_WINDOW_DEFAULT_WIDTH,
			height: AGENTS_VOICE_WINDOW_DEFAULT_HEIGHT,
		};
	}

	private _isOnScreen(bounds: IRectangle): boolean {
		const screen = mainWindow.screen;
		const screenLeft = (screen as unknown as { availLeft?: number }).availLeft ?? 0;
		const screenTop = (screen as unknown as { availTop?: number }).availTop ?? 0;
		const screenWidth = screen?.availWidth ?? 1920;
		const screenHeight = screen?.availHeight ?? 1080;

		const minVisible = 50;
		const visibleX = Math.min(bounds.x + bounds.width, screenLeft + screenWidth) - Math.max(bounds.x, screenLeft);
		const visibleY = Math.min(bounds.y + bounds.height, screenTop + screenHeight) - Math.max(bounds.y, screenTop);

		return visibleX >= minVisible && visibleY >= minVisible;
	}

	private loadBounds(): IRectangle {
		const defaults = this._defaultBounds();
		const raw = this.storageService.get(AgentsVoiceStorageKeys.WindowBounds, StorageScope.WORKSPACE);
		if (raw) {
			try {
				const parsed = JSON.parse(raw);
				if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
					const bounds = { x: parsed.x, y: parsed.y, width: defaults.width, height: defaults.height };
					if (this._isOnScreen(bounds)) {
						return bounds;
					}
				}
			} catch { /* ignore invalid JSON */ }
		}

		return defaults;
	}

	private saveBounds(window: IAuxiliaryWindow): void {
		const state = window.createState();
		if (state.bounds) {
			this.storageService.store(
				AgentsVoiceStorageKeys.WindowBounds,
				JSON.stringify({ x: state.bounds.x, y: state.bounds.y }),
				StorageScope.WORKSPACE,
				StorageTarget.MACHINE
			);
		}
	}
}

registerSingleton(IAgentsVoiceWindowService, AgentsVoiceWindowService, InstantiationType.Delayed);

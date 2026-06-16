/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, getWindow } from '../../../../base/browser/dom.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { FileAccess } from '../../../../base/common/network.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { ISessionsPartService } from '../../../../sessions/services/sessions/browser/sessionsPartService.js';
import { IAgentSessionsService } from '../../chat/browser/agentSessions/agentSessionsService.js';
import { IAgentTitleBarStatusService } from '../../chat/browser/agentSessions/experiments/agentTitleBarStatusService.js';
import { IMicCaptureService } from '../../chat/browser/voiceClient/micCaptureService.js';
import { ITtsPlaybackService } from '../../chat/browser/voiceClient/ttsPlaybackService.js';
import { IVoiceSessionController } from '../../chat/browser/voiceClient/voiceSessionController.js';
import { VoiceOnboardingCompletedClassification, VoiceOnboardingCompletedEvent } from '../../chat/browser/voiceClient/voiceTelemetry.js';
import { IChatService } from '../../chat/common/chatService/chatService.js';
import { IVoicePlaybackService } from '../../chat/common/voicePlaybackService.js';
import { IAgentsVoiceWindowService, AgentsVoiceStorageKeys } from '../common/agentsVoice.js';
import { AGENTS_VOICE_WIDGET_FOCUSED } from './agentsVoice.contribution.js';
import { AgentsVoiceWidget } from './agentsVoiceWidget.js';
import { bindWidgetToController } from './agentsVoiceWidgetBinding.js';

/**
 * Adds a voice bar to the {@link SessionsPart} bottom area when the
 * `agents.voice.enabled` setting is true. Mirrors the voice bar behaviour
 * in `chatViewPane.ts` but scoped to the sessions / agents window.
 */
class SessionsVoiceBarContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsVoiceBar';

	private readonly _voiceBarDisposables = this._register(new DisposableStore());

	constructor(
		@ISessionsPartService private readonly sessionsPartService: ISessionsPartService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IVoiceSessionController private readonly voiceSessionController: IVoiceSessionController,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IAgentTitleBarStatusService private readonly agentTitleBarStatusService: IAgentTitleBarStatusService,
		@IVoicePlaybackService private readonly voicePlaybackService: IVoicePlaybackService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IChatService private readonly chatService: IChatService,
		@IAgentsVoiceWindowService private readonly agentsVoiceWindowService: IAgentsVoiceWindowService,
		@IMicCaptureService private readonly micCaptureService: IMicCaptureService,
		@ITtsPlaybackService private readonly ttsPlaybackService: ITtsPlaybackService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IStorageService private readonly storageService: IStorageService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();

		// Only apply in the sessions window — the sidebar chat already has its
		// own voice bar in chatViewPane.ts.
		if (!this.environmentService.isSessionsWindow) {
			return;
		}

		this._updateVoiceBar();

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('agents.voice.enabled')) {
				this._updateVoiceBar();
			}
		}));
	}

	private _updateVoiceBar(): void {
		this._voiceBarDisposables.clear();

		const bottomArea = this.sessionsPartService.getBottomArea();
		if (!bottomArea) {
			return;
		}

		bottomArea.replaceChildren();

		if (!this.configurationService.getValue<boolean>('agents.voice.enabled')) {
			bottomArea.style.display = 'none';
			return;
		}

		bottomArea.style.display = '';
		this._createVoiceBar(bottomArea);
	}

	private _createVoiceBar(parent: HTMLElement): void {
		const bar = append(parent, $('.voice-agent-bar'));
		const win = getWindow(bar) as Window & typeof globalThis;

		const widget = new AgentsVoiceWidget(bar, {
			copilotIconSrc: FileAccess.asBrowserUri('vs/sessions/browser/media/sessions-icon.svg').toString(true),
			connect: () => this.voiceSessionController.connect(win),
			disconnect: () => this.voiceSessionController.disconnect(),
			pttDown: () => {
				if (!this.voiceSessionController.isConnected.get() && !this.voiceSessionController.isConnecting.get()) {
					this.voiceSessionController.connect(win).then(() => {
						if (this.voiceSessionController.isConnected.get()) {
							this.voiceSessionController.pttDown();
						}
					});
					return;
				}
				this.voiceSessionController.pttDown();
			},
			pttUp: () => this.voiceSessionController.pttUp(),
			closeWindow: () => { /* no-op: sessions part has no close button */ },
			stopPlayback: () => this.ttsPlaybackService.stopPlayback(),
			openSession: (_resource) => {
				// Session navigation in the sessions window is handled via the
				// session list in the widget and the sessions service directly.
			},
			stopSession: (_resource) => {
				const model = this.chatService.getSession(_resource);
				if (model) {
					const lastReq = model.getRequests().at(-1);
					if (lastReq) {
						this.voiceSessionController.markUserCancelled(_resource.toString());
						this.chatService.cancelCurrentRequestForSession(_resource);
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
			onResize: () => { /* layout handled by SessionsPart */ },
			openPttKeySettings: () => { /* no-op in sessions window */ },
			openPopout: () => { /* already in sessions window context */ },
			submitFeedback: (text) => this.voiceSessionController.submitFeedback(text),
			onOnboardingCompleted: () => {
				this.storageService.store(AgentsVoiceStorageKeys.OnboardingCompleted, true, StorageScope.PROFILE, StorageTarget.USER);
				this.telemetryService.publicLog2<VoiceOnboardingCompletedEvent, VoiceOnboardingCompletedClassification>('voiceOnboardingCompleted', {});
			},
		}, {
			width: 'auto',
			draggable: false,
			showClose: false,
			showExpandChevron: false,
			showStatusText: false,
			showStatusCounters: false,
			showCopilotIcon: false,
			centerConnectButton: false,
			title: localize('agentsVoice.voiceSessionsTitle', "Voice Mode"),
			focusable: true,
			reshowOnboardingOnDisconnect: false,
		});
		this._voiceBarDisposables.add(widget);

		// Set context key for voice widget focus (drives Space keybinding)
		const widgetFocusedKey = AGENTS_VOICE_WIDGET_FOCUSED.bindTo(this.contextKeyService);
		bar.addEventListener('focusin', () => widgetFocusedKey.set(true));
		bar.addEventListener('focusout', () => widgetFocusedKey.set(false));
		this._voiceBarDisposables.add({ dispose: () => widgetFocusedKey.reset() });

		// Hide the popout button when the floating window is already open.
		widget.setPopoutAvailable(!this.agentsVoiceWindowService.isOpen);
		this._voiceBarDisposables.add(this.agentsVoiceWindowService.onDidChangeOpen(isOpen => {
			widget.setPopoutAvailable(!isOpen);
		}));

		// PTT key label from keybinding
		const getPttLabel = () => this.keybindingService.lookupKeybinding('agentsVoice.pushToTalk')?.getLabel() ?? undefined;
		widget.setPttKeyLabel(getPttLabel());
		this._voiceBarDisposables.add(this.keybindingService.onDidUpdateKeybindings(() => {
			widget.setPttKeyLabel(getPttLabel());
		}));

		// Shared controller→widget binding (also used by the floating window)
		this._voiceBarDisposables.add(bindWidgetToController(widget, {
			voiceSessionController: this.voiceSessionController,
			agentSessionsService: this.agentSessionsService,
			agentTitleBarStatusService: this.agentTitleBarStatusService,
			voicePlaybackService: this.voicePlaybackService,
			environmentService: this.environmentService,
			chatService: this.chatService,
		}));

		this._voiceBarDisposables.add({ dispose: () => { this.voiceSessionController.disconnect(); } });
	}
}

registerWorkbenchContribution2(SessionsVoiceBarContribution.ID, SessionsVoiceBarContribution, WorkbenchPhase.AfterRestored);

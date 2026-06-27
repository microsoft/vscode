/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Register voice client services
import '../../chat/browser/voiceClient/micCaptureService.js';
import '../../chat/browser/voiceClient/ttsPlaybackService.js';
import '../../chat/browser/voiceClient/voiceClientService.js';
import { IVoiceSessionController } from '../../chat/browser/voiceClient/voiceSessionController.js';
import '../../chat/browser/voiceClient/voiceToolDispatchService.js';
import '../../chat/common/voicePlaybackService.js';

// Register the voice transcript store singleton
import '../common/voiceTranscriptStore.js';

// Register the Voice Transcripts view + show-command + chat-menu entry
import './transcriptsView/voiceTranscripts.contribution.js';

import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import * as nls from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { Extensions as ConfigurationExtensions, ConfigurationScope, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

import { AgentsVoiceStorageKeys } from '../common/agentsVoice.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import {
	VoiceEnabledClassification, VoiceEnabledEvent,
	VoiceDisabledClassification, VoiceDisabledEvent,
} from '../../chat/browser/voiceClient/voiceTelemetry.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';
import { ChatAgentLocation } from '../../chat/common/constants.js';
import { IChatWidgetService } from '../../chat/browser/chat.js';

// --- Context Keys ---

export const AGENTS_VOICE_WIDGET_FOCUSED = new RawContextKey<boolean>('agentsVoiceWidgetFocused', false);
const AGENTS_VOICE_CONNECTED = new RawContextKey<boolean>('agentsVoiceConnected', false);
const AGENTS_VOICE_CONNECTING = new RawContextKey<boolean>('agentsVoiceConnecting', false);
const AGENTS_VOICE_LISTENING = new RawContextKey<boolean>('agentsVoiceListening', false);
const AGENTS_VOICE_ACTIVE = new RawContextKey<boolean>('agentsVoiceActive', false);
/** Set on the specific widget where voice was initiated — used to scope connecting/connected UI to that widget only. */
const AGENTS_VOICE_INITIATED_HERE = new RawContextKey<boolean>('agentsVoiceInitiatedHere', false);

// --- Context Key Binding ---

// Separate contribution for voice connected state — runs later to avoid
// forcing IVoiceSessionController instantiation too early.
class AgentsVoiceConnectedKeyContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentsVoiceConnectedKey';

	constructor(
		@IVoiceSessionController voiceSessionController: IVoiceSessionController,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
	) {
		super();

		const connectedKey = AGENTS_VOICE_CONNECTED.bindTo(contextKeyService);
		const connectingKey = AGENTS_VOICE_CONNECTING.bindTo(contextKeyService);
		const listeningKey = AGENTS_VOICE_LISTENING.bindTo(contextKeyService);
		const activeKey = AGENTS_VOICE_ACTIVE.bindTo(contextKeyService);
		let wasConnected = false;
		this._register(autorun(reader => {
			const connected = voiceSessionController.isConnected.read(reader);
			connectedKey.set(connected);
			connectingKey.set(voiceSessionController.isConnecting.read(reader));
			const state = voiceSessionController.voiceState.read(reader);
			listeningKey.set(state === 'listening');
			activeKey.set(state === 'listening' || state === 'speaking');

			// Clear per-widget "initiated here" key when voice disconnects
			if (wasConnected && !connected) {
				for (const widget of chatWidgetService.getAllWidgets()) {
					AGENTS_VOICE_INITIATED_HERE.bindTo(widget.scopedContextKeyService).set(false);
				}
			}
			wasConnected = connected;
		}));
	}
}

registerWorkbenchContribution2(AgentsVoiceConnectedKeyContribution.ID, AgentsVoiceConnectedKeyContribution, WorkbenchPhase.Eventually);

// --- Telemetry: track enable/disable ---

class AgentsVoiceTelemetryContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.agentsVoiceTelemetry';
	private static readonly _ENABLED_AT_KEY = 'agents.voice.enabledAtMs';

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IStorageService storageService: IStorageService,
	) {
		super();

		// Track when the setting is toggled
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('agents.voice.enabled')) {
				const enabled = configurationService.getValue<boolean>('agents.voice.enabled');
				if (enabled) {
					storageService.store(AgentsVoiceTelemetryContribution._ENABLED_AT_KEY, Date.now(), StorageScope.PROFILE, StorageTarget.MACHINE);
					telemetryService.publicLog2<VoiceEnabledEvent, VoiceEnabledClassification>('voiceEnabled', { source: 'setting' });
				} else {
					const enabledAt = storageService.getNumber(AgentsVoiceTelemetryContribution._ENABLED_AT_KEY, StorageScope.PROFILE, 0);
					const daysActive = enabledAt ? Math.round((Date.now() - enabledAt) / (1000 * 60 * 60 * 24)) : 0;
					telemetryService.publicLog2<VoiceDisabledEvent, VoiceDisabledClassification>('voiceDisabled', { daysActive });
					storageService.remove(AgentsVoiceTelemetryContribution._ENABLED_AT_KEY, StorageScope.PROFILE);
				}
			}
		}));
	}
}

registerWorkbenchContribution2(AgentsVoiceTelemetryContribution.ID, AgentsVoiceTelemetryContribution, WorkbenchPhase.AfterRestored);

// --- Voice mode button in Chat toolbar ---
// Shows the voice mode icon in both idle and active states.
// Click to connect if disconnected, or toggle PTT if connected.
// The disconnect button (shown when connected) indicates active voice mode.

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'agentsVoice.connecting',
			title: nls.localize2('agentsVoice.connecting', "Connecting..."),
			icon: Codicon.loading,
			precondition: ContextKeyExpr.and(
				ContextKeyExpr.equals('config.agents.voice.enabled', true),
				AGENTS_VOICE_CONNECTING.isEqualTo(true),
			),
			menu: {
				id: MenuId.ChatExecute,
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals('config.agents.voice.enabled', true),
					ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat),
					AGENTS_VOICE_CONNECTING.isEqualTo(true),
					AGENTS_VOICE_INITIATED_HERE.isEqualTo(true),
				),
				group: 'navigation',
				order: -10
			}
		});
	}
	async run(): Promise<void> {
		// No-op — just a visual indicator
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'agentsVoice.startVoiceInChat',
			title: nls.localize2('agentsVoice.startVoiceInChat', "Voice Mode"),
			icon: Codicon.voiceMode,
			precondition: ContextKeyExpr.equals('config.agents.voice.enabled', true),
			menu: {
				id: MenuId.ChatExecute,
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals('config.agents.voice.enabled', true),
					ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat),
					ChatContextKeys.currentlyEditing.negate(),
					AGENTS_VOICE_ACTIVE.negate(),
					AGENTS_VOICE_CONNECTING.negate(),
				),
				group: 'navigation',
				order: -10
			},
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Space,
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals('config.agents.voice.enabled', true),
					ChatContextKeys.inChatInput,
				),
			},
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const voiceController = accessor.get(IVoiceSessionController);
		if (!voiceController.isConnected.get()) {
			// Mark this widget as the one where voice was initiated
			const chatWidgetService = accessor.get(IChatWidgetService);
			const widget = chatWidgetService.lastFocusedWidget;
			if (widget) {
				AGENTS_VOICE_INITIATED_HERE.bindTo(widget.scopedContextKeyService).set(true);
			}
			await voiceController.connect(mainWindow);
		} else {
			voiceController.pttDown();
			voiceController.pttUp();
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'agentsVoice.pttStopInChat',
			title: nls.localize2('agentsVoice.pttStopInChat', "Voice Mode: Stop Recording"),
			icon: Codicon.voiceMode,
			precondition: ContextKeyExpr.and(
				ContextKeyExpr.equals('config.agents.voice.enabled', true),
				AGENTS_VOICE_ACTIVE.isEqualTo(true),
			),
			menu: {
				id: MenuId.ChatExecute,
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals('config.agents.voice.enabled', true),
					ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat),
					ChatContextKeys.currentlyEditing.negate(),
					AGENTS_VOICE_ACTIVE.isEqualTo(true),
					AGENTS_VOICE_INITIATED_HERE.isEqualTo(true),
				),
				group: 'navigation',
				order: -10
			},
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Space,
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals('config.agents.voice.enabled', true),
					ChatContextKeys.inChatInput,
					AGENTS_VOICE_ACTIVE.isEqualTo(true),
				),
			},
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const voiceController = accessor.get(IVoiceSessionController);
		// In auto-send mode, toggling voice mode off disconnects entirely.
		// The auto-listen loop means there's no natural "idle" state to return to.
		const configService = accessor.get(IConfigurationService);
		const autoSendDelay = configService.getValue<number>('agents.voice.autoSendDelay') ?? 500;
		if (autoSendDelay >= 0) {
			voiceController.disconnect();
		} else {
			// Manual mode: just stop recording
			voiceController.pttDown();
			voiceController.pttUp();
		}
	}
});

// --- Disconnect Voice (command palette + separate toolbar button when connected) ---

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'agentsVoice.disconnect',
			title: nls.localize2('agentsVoice.disconnect', "Disconnect Voice Mode"),
			icon: Codicon.debugDisconnect,
			f1: true,
			precondition: ContextKeyExpr.and(
				ContextKeyExpr.equals('config.agents.voice.enabled', true),
				AGENTS_VOICE_CONNECTED.isEqualTo(true),
			),
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const voiceController = accessor.get(IVoiceSessionController);
		voiceController.disconnect();
	}
});

// --- Simulate Voice Connection (dev utility, backend down) ---

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'agentsVoice.simulateConnection',
			title: nls.localize2('agentsVoice.simulateConnection', "Voice: Simulate Connection (Dev)"),
			f1: true,
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const voiceController = accessor.get(IVoiceSessionController);
		voiceController.simulateConnection();
	}
});

// --- Reset Onboarding Command (dev utility) ---

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'agentsVoice.resetOnboarding',
			title: nls.localize2('resetAgentsVoiceOnboarding', "Voice: Reset Onboarding"),
			f1: true,
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const storageService = accessor.get(IStorageService);
		storageService.remove(AgentsVoiceStorageKeys.OnboardingCompleted, StorageScope.PROFILE);
	}
});

// --- Push-to-Talk Command ---

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'agentsVoice.pushToTalk',
			title: nls.localize2('agentsVoicePushToTalk', "Voice Mode: Push to Talk"),
			f1: true,
			precondition: ContextKeyExpr.equals('config.agents.voice.enabled', true),
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Space,
				when: ContextKeyExpr.and(
					AGENTS_VOICE_WIDGET_FOCUSED,
					ContextKeyExpr.not('inputFocus'),
				),
			},
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const voiceController = accessor.get(IVoiceSessionController);
		// Auto-connect on first PTT press
		if (!voiceController.isConnected.get() && !voiceController.isConnecting.get()) {
			await voiceController.connect(mainWindow);
		}
		if (!voiceController.isConnected.get()) {
			return;
		}
		voiceController.pttDown();
	}
});

// --- Select Microphone Command ---

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'agentsVoice.selectMicrophone',
			title: nls.localize2('agentsVoice.selectMicrophone', "Voice: Select Microphone"),
			f1: true,
			precondition: ContextKeyExpr.equals('config.agents.voice.enabled', true),
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const storageService = accessor.get(IStorageService);

		const devices = await navigator.mediaDevices.enumerateDevices();
		const audioInputs = devices.filter(d => d.kind === 'audioinput' && d.deviceId !== 'default');

		if (audioInputs.length === 0) {
			quickInputService.pick([{ label: nls.localize('noMicrophones', "No microphones found") }]);
			return;
		}

		const currentDeviceId = storageService.get(AgentsVoiceStorageKeys.MicrophoneDevice, StorageScope.APPLICATION, '');

		type DevicePickItem = { label: string; description?: string; deviceId: string };
		const items: DevicePickItem[] = [];

		// "System Default" entry — clears the stored device so the OS default is always used
		items.push({
			label: nls.localize('systemDefault', "System Default"),
			description: currentDeviceId === '' ? nls.localize('current', "(current)") : undefined,
			deviceId: '',
		});

		for (const d of audioInputs) {
			const label = d.label || nls.localize('unknownDevice', "Unknown Device ({0})", d.deviceId.slice(0, 8));
			items.push({
				label,
				description: d.deviceId === currentDeviceId ? nls.localize('current', "(current)") : undefined,
				deviceId: d.deviceId,
			});
		}

		const picked = await quickInputService.pick(items, {
			placeHolder: nls.localize('selectMic', "Select a microphone for Voice Mode"),
		});

		if (picked) {
			const selection = picked as DevicePickItem;
			if (selection.deviceId) {
				storageService.store(AgentsVoiceStorageKeys.MicrophoneDevice, selection.deviceId, StorageScope.APPLICATION, StorageTarget.MACHINE);
			} else {
				storageService.remove(AgentsVoiceStorageKeys.MicrophoneDevice, StorageScope.APPLICATION);
			}
		}
	}
});

// --- Settings ---

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	id: 'agentsVoice',
	title: nls.localize('agentsVoiceConfigurationTitle', "Voice Mode"),
	type: 'object',
	properties: {
		'agents.voice.enabled': {
			type: 'boolean',
			description: nls.localize('agents.voice.enabled', "Enable the Voice Mode panel in the chat view for voice-driven coding conversations."),
			default: false,
			scope: ConfigurationScope.APPLICATION,
			restricted: true,
			included: false,
		},
		'agents.voice.backendUrl': {
			type: 'string',
			description: nls.localize('agents.voice.backendUrl', "Voice backend WebSocket URL. Leave empty to use the default hosted backend. Set to e.g. `ws://localhost:8000/api/v1/realtime/voice` to point at a backend running on your machine."),
			default: '',
			scope: ConfigurationScope.APPLICATION,
			included: false,
		},
		'agents.voice.textToSpeech': {
			type: 'boolean',
			description: nls.localize('agents.voice.textToSpeech', "When enabled, the assistant reads responses aloud. When disabled, responses appear as text transcripts only."),
			default: true,
			scope: ConfigurationScope.APPLICATION,
			included: false,
		},
		'agents.voice.showTranscript': {
			type: 'boolean',
			description: nls.localize('agents.voice.showTranscript', "Show the voice transcript overlay in the chat input area while voice mode is active."),
			default: false,
			scope: ConfigurationScope.APPLICATION,
			included: false,
			tags: ['advanced'],
		},
		'agents.voice.autoSendDelay': {
			type: 'number',
			description: nls.localize('agents.voice.autoSendDelay', "In toggle voice mode (short tap), automatically finish recording after this many milliseconds of silence. Set to -1 to disable."),
			default: 500,
			minimum: -1,
			scope: ConfigurationScope.APPLICATION,
			included: false,
			tags: ['advanced'],
		},
		'agents.voice.sendKeyword': {
			type: 'string',
			description: nls.localize('agents.voice.sendKeyword', "A keyword phrase (e.g. \"send it\") that, when spoken at the end of an utterance in toggle mode, triggers sending the request immediately. The keyword is stripped from the sent message. Leave empty to disable."),
			default: '',
			scope: ConfigurationScope.APPLICATION,
			included: false,
			tags: ['advanced'],
		},
	}
});

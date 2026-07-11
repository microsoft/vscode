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
import { ConfigurationKeyValuePairs, IConfigurationMigrationRegistry, Extensions as WorkbenchConfigurationExtensions } from '../../../common/configuration.js';
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
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { ChatAgentLocation } from '../../chat/common/constants.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';

// --- Context Keys ---

export const AGENTS_VOICE_WIDGET_FOCUSED = new RawContextKey<boolean>('agentsVoiceWidgetFocused', false);
const AGENTS_VOICE_CONNECTED = new RawContextKey<boolean>('agentsVoiceConnected', false);
const AGENTS_VOICE_CONNECTING = new RawContextKey<boolean>('agentsVoiceConnecting', false);
const AGENTS_VOICE_LISTENING = new RawContextKey<boolean>('agentsVoiceListening', false);

// --- Context Key Binding ---

// Separate contribution for voice connected state — runs later to avoid
// forcing IVoiceSessionController instantiation too early.
class AgentsVoiceConnectedKeyContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentsVoiceConnectedKey';

	constructor(
		@IVoiceSessionController voiceSessionController: IVoiceSessionController,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		const connectedKey = AGENTS_VOICE_CONNECTED.bindTo(contextKeyService);
		const connectingKey = AGENTS_VOICE_CONNECTING.bindTo(contextKeyService);
		const listeningKey = AGENTS_VOICE_LISTENING.bindTo(contextKeyService);
		this._register(autorun(reader => {
			connectedKey.set(voiceSessionController.isConnected.read(reader));
			connectingKey.set(voiceSessionController.isConnecting.read(reader));
			listeningKey.set(voiceSessionController.voiceState.read(reader) === 'listening');
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
					AGENTS_VOICE_LISTENING.negate(),
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
				AGENTS_VOICE_LISTENING.isEqualTo(true),
			),
			menu: {
				id: MenuId.ChatExecute,
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals('config.agents.voice.enabled', true),
					ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat),
					ChatContextKeys.currentlyEditing.negate(),
					AGENTS_VOICE_LISTENING.isEqualTo(true),
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
					AGENTS_VOICE_LISTENING.isEqualTo(true),
				),
			},
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const voiceController = accessor.get(IVoiceSessionController);
		// Stop recording and the auto-listen loop but keep the WebSocket
		// connected so the user can resume without reconnecting. Use the
		// separate "Disconnect Voice Mode" button to fully end the session.
		voiceController.stopListening();
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
			menu: {
				id: MenuId.ChatExecute,
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals('config.agents.voice.enabled', true),
					ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat),
					ChatContextKeys.currentlyEditing.negate(),
					AGENTS_VOICE_CONNECTED.isEqualTo(true),
				),
				group: 'navigation',
				order: -9
			},
			keybinding: {
				// Keep this below the editor widgets and negate their contexts so
				// Escape still dismisses IntelliSense/hover and clears selections
				// while the user is typing in the chat input.
				weight: KeybindingWeight.EditorContrib - 5,
				primary: KeyCode.Escape,
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals('config.agents.voice.enabled', true),
					ChatContextKeys.inChatInput,
					AGENTS_VOICE_CONNECTED.isEqualTo(true),
					EditorContextKeys.hoverVisible.toNegated(),
					EditorContextKeys.hasNonEmptySelection.toNegated(),
					EditorContextKeys.hasMultipleSelections.toNegated(),
				),
			},
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const voiceController = accessor.get(IVoiceSessionController);
		voiceController.disconnect();
	}
});

// --- Open Voice Mode Settings (gear button, shown left of Disconnect when connected) ---

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'agentsVoice.openSettings',
			title: nls.localize2('agentsVoice.openSettings', "Voice Mode Settings"),
			icon: Codicon.settingsGear,
			f1: true,
			precondition: ContextKeyExpr.equals('config.agents.voice.enabled', true),
			menu: {
				id: MenuId.ChatExecute,
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals('config.agents.voice.enabled', true),
					ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat),
					ChatContextKeys.currentlyEditing.negate(),
					AGENTS_VOICE_CONNECTED.isEqualTo(true),
				),
				group: 'navigation',
				// Just before the Disconnect button (order -9) and after the mic/stop button (order -10).
				order: -9.5
			},
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const commandService = accessor.get(ICommandService);
		await commandService.executeCommand('workbench.action.openSettings', { query: 'agents.voice' });
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

		// Filter out the virtual "default"/"communications" entries (which duplicate a real
		// device) and de-duplicate by deviceId so a single microphone shows up only once.
		const seenDeviceIds = new Set<string>();
		const audioInputs = devices.filter(d => {
			if (d.kind !== 'audioinput' || d.deviceId === 'default' || d.deviceId === 'communications') {
				return false;
			}
			if (seenDeviceIds.has(d.deviceId)) {
				return false;
			}
			seenDeviceIds.add(d.deviceId);
			return true;
		});

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
		'agents.voice.speakResponses': {
			type: 'boolean',
			markdownDescription: nls.localize('agents.voice.speakResponses', "When enabled, the assistant reads responses aloud. When disabled, responses are not spoken; enable `#agents.voice.showTranscript#` to read them as a text transcript instead."),
			default: true,
			scope: ConfigurationScope.APPLICATION,
		},
		'agents.voice.voice': {
			type: 'string',
			enum: ['victoria_neutral', 'kevin_neutral', 'maya_neutral', 'daniel_neutral'],
			enumItemLabels: ['Victoria', 'Kevin', 'Maya', 'Daniel'],
			enumDescriptions: [
				nls.localize('agents.voice.voice.victoria', "Victoria."),
				nls.localize('agents.voice.voice.kevin', "Kevin."),
				nls.localize('agents.voice.voice.maya', "Maya."),
				nls.localize('agents.voice.voice.daniel', "Daniel."),
			],
			description: nls.localize('agents.voice.voice', "The voice used when the assistant reads responses aloud. Changing this while voice mode is connected takes effect immediately."),
			default: 'maya_neutral',
			scope: ConfigurationScope.APPLICATION,
		},
		'agents.voice.showTranscript': {
			type: 'boolean',
			markdownDescription: nls.localize('agents.voice.showTranscript', "Show the voice transcript overlay in the chat input area while voice mode is active. Enable this to read responses as text when `#agents.voice.speakResponses#` is disabled."),
			default: false,
			scope: ConfigurationScope.APPLICATION,
		},
		'agents.voice.handsFree': {
			type: 'boolean',
			markdownDescription: nls.localize('agents.voice.handsFree', "When enabled, voice mode automatically re-enters listening after the assistant finishes speaking, so you can hold a hands-free back-and-forth conversation. When disabled, you start each turn manually. This controls only the auto-listen loop; how a turn ends is controlled by {0} and {1}.", '`#agents.voice.turn.silenceMs#`', '`#agents.voice.turn.stopPhrases#`'),
			default: true,
			scope: ConfigurationScope.APPLICATION,
		},
		'agents.voice.turn.silenceMs': {
			type: 'number',
			markdownDescription: nls.localize('agents.voice.turn.silenceMs', "Trailing silence in milliseconds before the backend ends the turn automatically. Set to `-1` to disable ending the turn on silence, in which case the turn ends only via a stop phrase ({0}) or manually. When enabled, the backend clamps this to its supported range (currently 200-5000 ms) and is the source of truth.", '`#agents.voice.turn.stopPhrases#`'),
			default: 800,
			anyOf: [
				{
					const: -1,
					description: nls.localize('agents.voice.turn.silenceMs.disabled', "Do not end the turn on trailing silence."),
				},
				{
					type: 'number',
					minimum: 200,
					maximum: 5000,
				},
			],
			scope: ConfigurationScope.APPLICATION,
		},
		'agents.voice.turn.stopPhrases': {
			type: 'array',
			items: { type: 'string' },
			markdownDescription: nls.localize('agents.voice.turn.stopPhrases', "Phrases that end the turn when spoken at the end of an utterance. Leave empty to disable ending the turn on a stop phrase, in which case the turn ends only on trailing silence ({0}) or manually. The backend strips the matched phrase from the transcript before it reaches the agent.", '`#agents.voice.turn.silenceMs#`'),
			default: ['send it'],
			scope: ConfigurationScope.APPLICATION,
		},
	}
});

// Migrate the removed `agents.voice.turn.autoEndMode` setting onto the two
// settings that now govern turn-ending, preserving the previous behavior:
// silence ending is disabled (`silenceMs: -1`) unless the old mode was `vad`
// or `both`, and stop-phrase ending is disabled (`stopPhrases: []`) unless the
// old mode was `phrase` or `both`.
Registry.as<IConfigurationMigrationRegistry>(WorkbenchConfigurationExtensions.ConfigurationMigration)
	.registerConfigurationMigrations([{
		key: 'agents.voice.turn.autoEndMode',
		migrateFn: (value: unknown) => {
			const result: ConfigurationKeyValuePairs = [['agents.voice.turn.autoEndMode', { value: undefined }]];
			if (value === 'off' || value === 'vad' || value === 'phrase' || value === 'both') {
				const silenceEnabled = value === 'vad' || value === 'both';
				const phraseEnabled = value === 'phrase' || value === 'both';
				if (!silenceEnabled) {
					result.push(['agents.voice.turn.silenceMs', { value: -1 }]);
				}
				if (!phraseEnabled) {
					result.push(['agents.voice.turn.stopPhrases', { value: [] }]);
				}
			}
			return result;
		}
	}]);

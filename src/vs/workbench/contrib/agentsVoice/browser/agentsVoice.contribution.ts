/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Register the Agents Voice window service singleton
import './agentsVoiceWindowService.js';

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
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { Extensions as ConfigurationExtensions, ConfigurationScope, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

import { IAgentsVoiceWindowService, AgentsVoiceStorageKeys } from '../common/agentsVoice.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import {
	VoiceEnabledClassification, VoiceEnabledEvent,
	VoiceDisabledClassification, VoiceDisabledEvent,
} from '../../chat/browser/voiceClient/voiceTelemetry.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';
import { ChatAgentLocation } from '../../chat/common/constants.js';

// --- Context Keys ---

const AGENTS_VOICE_WINDOW_VISIBLE = new RawContextKey<boolean>('agentsVoiceWindowVisible', false);
export const AGENTS_VOICE_WIDGET_FOCUSED = new RawContextKey<boolean>('agentsVoiceWidgetFocused', false);
const AGENTS_VOICE_CONNECTED = new RawContextKey<boolean>('agentsVoiceConnected', false);
const AGENTS_VOICE_CONNECTING = new RawContextKey<boolean>('agentsVoiceConnecting', false);
const AGENTS_VOICE_LISTENING = new RawContextKey<boolean>('agentsVoiceListening', false);
const AGENTS_VOICE_ACTIVE = new RawContextKey<boolean>('agentsVoiceActive', false);

// --- Context Key Binding ---

class AgentsVoiceContextKeyContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentsVoiceContextKey';

	constructor(
		@IAgentsVoiceWindowService private readonly agentsVoiceWindowService: IAgentsVoiceWindowService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		const windowKey = AGENTS_VOICE_WINDOW_VISIBLE.bindTo(contextKeyService);
		windowKey.set(this.agentsVoiceWindowService.isOpen);

		this._register(this.agentsVoiceWindowService.onDidChangeOpen(isOpen => {
			windowKey.set(isOpen);
		}));
	}
}

registerWorkbenchContribution2(AgentsVoiceContextKeyContribution.ID, AgentsVoiceContextKeyContribution, WorkbenchPhase.AfterRestored);

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
		const activeKey = AGENTS_VOICE_ACTIVE.bindTo(contextKeyService);
		this._register(autorun(reader => {
			connectedKey.set(voiceSessionController.isConnected.read(reader));
			connectingKey.set(voiceSessionController.isConnecting.read(reader));
			const state = voiceSessionController.voiceState.read(reader);
			listeningKey.set(state === 'listening');
			activeKey.set(state === 'listening' || state === 'speaking');
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

// --- Toggle Command + Menu Item ---

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'agentsVoice.toggleWindow',
			title: nls.localize2('toggleAgentsVoiceWindow', "Voice Mode"),
			icon: Codicon.openInWindow,
			menu: [{
				id: MenuId.MenubarViewMenu,
				group: '5_copilot',
				order: 1,
				when: ContextKeyExpr.equals('config.agents.voice.enabled', true),
			}, {
				id: MenuId.ChatExecute,
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals('config.agents.voice.enabled', true),
					AGENTS_VOICE_CONNECTED.isEqualTo(true),
					ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat),
				),
				group: 'navigation',
				order: 6
			}],
			toggled: AGENTS_VOICE_WINDOW_VISIBLE.isEqualTo(true),
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const service = accessor.get(IAgentsVoiceWindowService);
		await service.toggleWindow();
	}
});

// Internal command: open the floating window without toggling (used by voice
// controller to surface responses for non-visible sessions).
CommandsRegistry.registerCommand('_agentsVoice.openWindow', async (accessor) => {
	const service = accessor.get(IAgentsVoiceWindowService);
	if (!service.isOpen) {
		await service.openWindow();
	}
});

// --- Mic button in Chat toolbar ---
// Shows mic (unfilled) normally, mic-filled when actively listening.
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
				order: 4
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
			icon: Codicon.mic,
			precondition: ContextKeyExpr.equals('config.agents.voice.enabled', true),
			menu: {
				id: MenuId.ChatExecute,
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals('config.agents.voice.enabled', true),
					ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat),
					AGENTS_VOICE_ACTIVE.negate(),
					AGENTS_VOICE_CONNECTING.negate(),
				),
				group: 'navigation',
				order: 4
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
			icon: Codicon.micFilled,
			precondition: ContextKeyExpr.and(
				ContextKeyExpr.equals('config.agents.voice.enabled', true),
				AGENTS_VOICE_ACTIVE.isEqualTo(true),
			),
			menu: {
				id: MenuId.ChatExecute,
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals('config.agents.voice.enabled', true),
					ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat),
					AGENTS_VOICE_ACTIVE.isEqualTo(true),
				),
				group: 'navigation',
				order: 4
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
		// Stop recording and send
		voiceController.pttDown();
		voiceController.pttUp();
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
					AGENTS_VOICE_CONNECTED.isEqualTo(true),
					ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat),
				),
				group: 'navigation',
				order: 5
			},
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
		'agents.voice.alwaysOnTop': {
			type: 'boolean',
			description: nls.localize('agents.voice.alwaysOnTop', "Keep the Voice Mode window always on top of other windows."),
			default: true,
			scope: ConfigurationScope.APPLICATION,
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
			default: true,
			scope: ConfigurationScope.APPLICATION,
			included: false,
			tags: ['advanced'],
		},
	}
});

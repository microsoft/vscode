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
import { KeyCode } from '../../../../base/common/keyCodes.js';
import * as nls from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
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

// --- Context Keys ---

const AGENTS_VOICE_WINDOW_VISIBLE = new RawContextKey<boolean>('agentsVoiceWindowVisible', false);
export const AGENTS_VOICE_WIDGET_FOCUSED = new RawContextKey<boolean>('agentsVoiceWidgetFocused', false);

// --- Context Key Binding ---

class AgentsVoiceContextKeyContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentsVoiceContextKey';

	constructor(
		@IAgentsVoiceWindowService private readonly agentsVoiceWindowService: IAgentsVoiceWindowService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		const contextKey = AGENTS_VOICE_WINDOW_VISIBLE.bindTo(contextKeyService);
		contextKey.set(this.agentsVoiceWindowService.isOpen);

		this._register(this.agentsVoiceWindowService.onDidChangeOpen(isOpen => {
			contextKey.set(isOpen);
		}));
	}
}

registerWorkbenchContribution2(AgentsVoiceContextKeyContribution.ID, AgentsVoiceContextKeyContribution, WorkbenchPhase.AfterRestored);

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
			menu: {
				id: MenuId.MenubarViewMenu,
				group: '5_copilot',
				order: 1,
				when: ContextKeyExpr.equals('config.agents.voice.enabled', true),
			},
			toggled: AGENTS_VOICE_WINDOW_VISIBLE.isEqualTo(true),
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const service = accessor.get(IAgentsVoiceWindowService);
		await service.toggleWindow();
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
				primary: KeyCode.Space,
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
	}
});

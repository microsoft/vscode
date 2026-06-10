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
import '../../chat/browser/voiceClient/voiceSessionController.js';
import '../../chat/browser/voiceClient/voiceToolDispatchService.js';
import '../../chat/common/voicePlaybackService.js';

// Register the voice transcript store singleton
import '../common/voiceTranscriptStore.js';

// Register the Voice Transcripts view + show-command + chat-menu entry
import './transcriptsView/voiceTranscripts.contribution.js';

import { Disposable } from '../../../../base/common/lifecycle.js';
import * as nls from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { Extensions as ConfigurationExtensions, ConfigurationScope, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { IAgentsVoiceWindowService, AgentsVoiceStorageKeys } from '../common/agentsVoice.js';

// --- Context Key ---

const AGENTS_VOICE_WINDOW_VISIBLE = new RawContextKey<boolean>('agentsVoiceWindowVisible', false);

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

// --- Toggle Command + Menu Item ---

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'agentsVoice.toggleWindow',
			title: nls.localize2('toggleAgentsVoiceWindow', "Agents Voice"),
			menu: {
				id: MenuId.MenubarViewMenu,
				group: '5_copilot',
				order: 1,
				// Always visible — no feature gate
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

// --- Settings ---

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	id: 'agentsVoice',
	title: nls.localize('agentsVoiceConfigurationTitle', "Agents Voice"),
	type: 'object',
	properties: {
		'agents.voice.alwaysOnTop': {
			type: 'boolean',
			description: nls.localize('agents.voice.alwaysOnTop', "Keep the Agents Voice window always on top of other windows."),
			default: true,
			scope: ConfigurationScope.APPLICATION,
		},
		'agents.voice.backendUrl': {
			type: 'string',
			description: nls.localize('agents.voice.backendUrl', "Voice backend WebSocket URL. Leave empty to use the default hosted backend. Set to e.g. `ws://localhost:8000/api/v1/realtime/voice` to point at a backend running on your machine."),
			default: '',
			scope: ConfigurationScope.APPLICATION,
		},
	}
});

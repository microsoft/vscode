/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Register voice client services
import '../../chat/browser/voiceClient/micCaptureService.js';
import '../../chat/browser/voiceClient/ttsPlaybackService.js';
import '../../chat/browser/voiceClient/voiceClientService.js';
import { IVoiceSessionController, isVoiceEntitled } from '../../chat/browser/voiceClient/voiceSessionController.js';
import { normalizeAgentsVoiceId, VOICE_AGENT_PROGRESS_SETTING } from '../../chat/common/voiceClient/voiceClientService.js';
import '../../chat/browser/voiceClient/voiceToolDispatchService.js';
import '../../chat/common/voicePlaybackService.js';

// Register the voice transcript store singleton
import '../common/voiceTranscriptStore.js';

// Register the Voice Transcripts view + show-command + chat-menu entry
import './transcriptsView/voiceTranscripts.contribution.js';

import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { URI } from '../../../../base/common/uri.js';
import * as nls from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { Extensions as ConfigurationExtensions, ConfigurationScope, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { SegmentedVoiceInputModePillInactive } from '../../chat/browser/voiceInputMode/voiceInputModeContextKeys.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { ConfigurationKeyValuePairs, IConfigurationMigrationRegistry, Extensions as WorkbenchConfigurationExtensions } from '../../../common/configuration.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

import { AgentsVoiceSettingId, AgentsVoiceStorageKeys, AGENTS_VOICE_CONNECTED, AGENTS_VOICE_CONNECTING, AGENTS_VOICE_ENABLED, AGENTS_VOICE_ENTITLED, AGENTS_VOICE_LISTENING, AGENTS_VOICE_RECONNECTING } from '../common/agentsVoice.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import {
	VoiceEnabledClassification, VoiceEnabledEvent,
	VoiceDisabledClassification, VoiceDisabledEvent,
} from '../../chat/browser/voiceClient/voiceTelemetry.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { getActiveWindow } from '../../../../base/browser/dom.js';
import { ChatAgentLocation } from '../../chat/common/constants.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { CONFIGURE_VOICE_INSTRUCTIONS_ACTION_ID } from '../../chat/browser/actions/configureVoiceInstructionsAction.js';
import { IVoiceModeOnboardingService } from './voiceModeOnboarding.js';
import { SHOW_VOICE_MODE_ONBOARDING_COMMAND } from '../../chat/browser/speechToText/micButtonMenuActions.js';
import { IsSessionsWindowContext } from '../../../common/contextkeys.js';

// --- Context Keys ---

export const AGENTS_VOICE_WIDGET_FOCUSED = new RawContextKey<boolean>('agentsVoiceWidgetFocused', false);
const AGENTS_VOICE_INITIATED_HERE = ContextKeyExpr.equals('agentsVoiceInitiatedHere', true);
const VOICE_ACTIVE_ON_SURFACE = ContextKeyExpr.or(IsSessionsWindowContext.negate(), AGENTS_VOICE_INITIATED_HERE)!;

// --- Context Key Binding ---

// Reflects Copilot entitlement into a single `agentsVoiceEntitled` context key.
// Kept as one imperatively-set key (rather than an OR-of-plans expression) so
// that negating `AGENTS_VOICE_ENABLED` (e.g. for the standalone voice controls)
// does not distribute the plan disjunction into thousands of terms.
class AgentsVoiceEntitlementKeyContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentsVoiceEntitlementKey';

	constructor(
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		const entitledKey = AGENTS_VOICE_ENTITLED.bindTo(contextKeyService);
		const update = () => entitledKey.set(isVoiceEntitled(chatEntitlementService));
		update();
		this._register(chatEntitlementService.onDidChangeEntitlement(update));
	}
}

registerWorkbenchContribution2(AgentsVoiceEntitlementKeyContribution.ID, AgentsVoiceEntitlementKeyContribution, WorkbenchPhase.AfterRestored);

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
		const reconnectingKey = AGENTS_VOICE_RECONNECTING.bindTo(contextKeyService);
		this._register(autorun(reader => {
			connectedKey.set(voiceSessionController.isConnected.read(reader));
			connectingKey.set(voiceSessionController.isConnecting.read(reader));
			reconnectingKey.set(voiceSessionController.isReconnecting.read(reader));
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

// --- First-run introduction ---

/**
 * Shows the Voice Mode introduction the first time a session starts. This
 * watches the connection state rather than any one entry point, because Voice
 * Mode can be started from the input-mode pill, a command, a keybinding or the
 * Agents window - all of which land here.
 */
class AgentsVoiceOnboardingContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.agentsVoiceOnboarding';

	constructor(
		@IVoiceSessionController voiceSessionController: IVoiceSessionController,
		@IVoiceModeOnboardingService voiceModeOnboardingService: IVoiceModeOnboardingService,
	) {
		super();

		this._register(autorun(reader => {
			if (voiceSessionController.isConnecting.read(reader) || voiceSessionController.isConnected.read(reader)) {
				voiceModeOnboardingService.showIfNeeded();
			}
		}));
	}
}

// Registered at the same late phase as the connected-key contribution so it
// does not force `IVoiceSessionController` to instantiate early.
registerWorkbenchContribution2(AgentsVoiceOnboardingContribution.ID, AgentsVoiceOnboardingContribution, WorkbenchPhase.Eventually);

// --- Voice mode button in Chat toolbar ---
// Shows the voice mode icon in both idle and active states.
// Click to connect if disconnected, or toggle PTT if connected.
// The disconnect button (shown when connected) indicates active voice mode.

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'agentsVoice.connecting',
			title: nls.localize2('agentsVoice.connecting', "Connecting..."),
			icon: Codicon.loadingCompact,
			precondition: ContextKeyExpr.and(
				AGENTS_VOICE_ENABLED,
				ContextKeyExpr.or(
					AGENTS_VOICE_CONNECTING.isEqualTo(true),
					AGENTS_VOICE_RECONNECTING.isEqualTo(true),
				),
			),
			menu: {
				id: MenuId.ChatExecute,
				when: ContextKeyExpr.and(
					SegmentedVoiceInputModePillInactive,
					AGENTS_VOICE_ENABLED,
					ContextKeyExpr.notEquals(`config.${AgentsVoiceSettingId.ShowButton}`, false),
					ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat),
					ContextKeyExpr.or(
						AGENTS_VOICE_CONNECTING.isEqualTo(true),
						AGENTS_VOICE_RECONNECTING.isEqualTo(true),
					),
					VOICE_ACTIVE_ON_SURFACE,
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
			icon: Codicon.voiceModeCompact,
			precondition: AGENTS_VOICE_ENABLED,
			menu: {
				id: MenuId.ChatExecute,
				when: ContextKeyExpr.and(
					SegmentedVoiceInputModePillInactive,
					AGENTS_VOICE_ENABLED,
					ContextKeyExpr.notEquals(`config.${AgentsVoiceSettingId.ShowButton}`, false),
					ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat),
					ChatContextKeys.currentlyEditing.negate(),
					AGENTS_VOICE_LISTENING.negate(),
					AGENTS_VOICE_CONNECTING.negate(),
					AGENTS_VOICE_RECONNECTING.negate(),
					// Hide Voice Mode while dictation is active (recording or the
					// model is loading) so the two mic affordances never compete.
					ChatContextKeys.speechToTextRecording.negate(),
					ChatContextKeys.speechToTextPreparing.negate(),
				),
				group: 'navigation',
				order: -10
			},
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Space,
				when: ContextKeyExpr.and(
					SegmentedVoiceInputModePillInactive,
					AGENTS_VOICE_ENABLED,
					ChatContextKeys.inChatInput,
				),
			},
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const voiceController = accessor.get(IVoiceSessionController);
		const keybindingService = accessor.get(IKeybindingService);
		const handsFree = accessor.get(IConfigurationService).getValue<boolean>('agents.voice.handsFree') === true;
		const activeWindow = getActiveWindow();
		voiceController.setActiveWindow(activeWindow);

		// Capture hold-mode FIRST, synchronously, before any `await`. The
		// keybinding service only reports a held chord while it is still
		// dispatching this command; the moment `run()` first suspends on an
		// await it clears `_currentlyDispatchingCommandId`, after which
		// `enableKeybindingHoldMode` returns `undefined`. Calling it up-front is
		// what makes press-and-hold work even on the very first (cold) press
		// where we still have to connect. `undefined` here means the action was
		// invoked without a held key (toolbar mic button / command palette).
		const holdMode = keybindingService.enableKeybindingHoldMode('agentsVoice.startVoiceInChat');

		// An explicit press in another composer transfers Voice Mode ownership to
		// that composer. The draft sentinel deliberately clears the concrete target.
		const currentSession = await accessor.get(ICommandService).executeCommand<string | undefined>('_chat.voice.getCurrentSession');
		if (currentSession) {
			try {
				const resource = URI.parse(currentSession);
				if (resource.scheme === 'sessions-voice') {
					voiceController.setDraftTarget();
				} else {
					voiceController.setTargetSession(resource);
					voiceController.activateSession(resource);
				}
			} catch {
				// The routing command owns validation; leave the current target unchanged.
			}
		}

		// Ensure the session is connected before we start recording. The mic
		// button's first press connects; a held keybinding also connects here so
		// that press-and-hold works on the very first invocation. If the user
		// releases the key while we're still connecting, `holdMode` resolves
		// early and the awaited release below fires right after pttDown() — the
		// controller then treats it as a quick tap (toggle on).
		const wasConnected = voiceController.isConnected.get();
		if (!wasConnected) {
			await voiceController.connect(activeWindow);
		}

		if (!holdMode && !handsFree && !wasConnected) {
			return;
		}

		// Map the physical key/button gesture directly onto the controller's
		// push-to-talk model: press => pttDown(), release => pttUp(). The
		// controller itself decides tap-vs-hold based on how long the key was
		// held (a quick tap enters toggle mode and keeps recording; a real hold
		// records only while held). `enableKeybindingHoldMode` also swallows OS
		// key-repeat while held, so holding the shortcut no longer rapidly
		// toggles.
		voiceController.pttDown();
		if (!holdMode) {
			// Not invoked via a held keybinding (toolbar mic button or command
			// palette): emulate a tap so the controller enters toggle mode and
			// keeps listening. Pressing the button/shortcut again stops.
			voiceController.pttUp();
			return;
		}

		await holdMode;
		voiceController.pttUp();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'agentsVoice.pttStopInChat',
			title: nls.localize2('agentsVoice.pttStopInChat', "Voice Mode: Stop Recording"),
			icon: Codicon.voiceModeCompact,
			precondition: ContextKeyExpr.and(
				AGENTS_VOICE_ENABLED,
				AGENTS_VOICE_LISTENING.isEqualTo(true),
			),
			menu: {
				id: MenuId.ChatExecute,
				when: ContextKeyExpr.and(
					SegmentedVoiceInputModePillInactive,
					AGENTS_VOICE_ENABLED,
					ContextKeyExpr.notEquals(`config.${AgentsVoiceSettingId.ShowButton}`, false),
					ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat),
					ChatContextKeys.currentlyEditing.negate(),
					AGENTS_VOICE_LISTENING.isEqualTo(true),
					VOICE_ACTIVE_ON_SURFACE,
				),
				group: 'navigation',
				order: -10
			},
			// NOTE: intentionally no keybinding. The Cmd+Shift+Space chord is
			// owned solely by `agentsVoice.startVoiceInChat`, which handles both
			// starting and stopping (via the controller's push-to-talk model).
			// Binding the same chord here as well caused the two actions to
			// fight on every OS key-repeat, producing rapid start/stop toggling.
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
			icon: Codicon.debugDisconnectCompact,
			f1: true,
			precondition: ContextKeyExpr.and(
				AGENTS_VOICE_ENABLED,
				AGENTS_VOICE_CONNECTED.isEqualTo(true),
			),
			menu: {
				id: MenuId.ChatExecute,
				when: ContextKeyExpr.and(
					AGENTS_VOICE_ENABLED,
					ContextKeyExpr.notEquals(`config.${AgentsVoiceSettingId.ShowButton}`, false),
					ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat),
					ChatContextKeys.currentlyEditing.negate(),
					AGENTS_VOICE_CONNECTED.isEqualTo(true),
					VOICE_ACTIVE_ON_SURFACE,
					// The segmented voice pill's voice cell is itself the on/off toggle,
					// so a separate disconnect button would be redundant there.
					SegmentedVoiceInputModePillInactive,
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
					AGENTS_VOICE_ENABLED,
					ChatContextKeys.inChatInput,
					AGENTS_VOICE_CONNECTED.isEqualTo(true),
					VOICE_ACTIVE_ON_SURFACE,
					// Don't disconnect voice while a request is running — pressing
					// Escape there is meant to interrupt/cancel that request, not
					// tear down the voice session (which is especially disruptive
					// in hands-free mode where there is no reconnect button).
					ChatContextKeys.hasActiveRequest.negate(),
					EditorContextKeys.hoverVisible.toNegated(),
					EditorContextKeys.hasNonEmptySelection.toNegated(),
					EditorContextKeys.hasMultipleSelections.toNegated(),
				),
			},
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const voiceController = accessor.get(IVoiceSessionController);
		voiceController.disconnect('explicit');
	}
});

// --- Cancel Active Request via Escape (while voice-connected in the chat input) ---
//
// The Disconnect-on-Escape action above deliberately does NOTHING while a
// request is running (its `when` negates hasActiveRequest) so it doesn't tear
// down the voice session mid-turn. But the built-in Cancel action is bound to
// Cmd/Ctrl+Escape (Alt+Backspace on Windows), so plain Escape would otherwise
// be a no-op there. Restore the expected behavior: plain Escape cancels the
// in-flight request while leaving the idle-only disconnect intact.

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'agentsVoice.cancelActiveRequest',
			title: nls.localize2('agentsVoice.cancelActiveRequest', "Voice Mode: Cancel Request"),
			f1: false,
			keybinding: {
				weight: KeybindingWeight.EditorContrib - 5,
				primary: KeyCode.Escape,
				when: ContextKeyExpr.and(
					AGENTS_VOICE_ENABLED,
					ChatContextKeys.inChatInput,
					AGENTS_VOICE_CONNECTED.isEqualTo(true),
					// Mirror the disconnect binding's editor negations so Escape
					// still dismisses IntelliSense/hover and clears selections first.
					ChatContextKeys.hasActiveRequest,
					EditorContextKeys.hoverVisible.toNegated(),
					EditorContextKeys.hasNonEmptySelection.toNegated(),
					EditorContextKeys.hasMultipleSelections.toNegated(),
				),
			},
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(ICommandService).executeCommand('workbench.action.chat.cancel');
	}
});

// --- Open Voice Mode Settings ---

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'agentsVoice.openSettings',
			title: nls.localize2('agentsVoice.openSettings', "Voice Mode Settings"),
			f1: true,
			precondition: AGENTS_VOICE_ENABLED,
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const commandService = accessor.get(ICommandService);
		await commandService.executeCommand('workbench.action.openSettings', { query: 'agents.voice' });
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: SHOW_VOICE_MODE_ONBOARDING_COMMAND,
			title: nls.localize2('agentsVoice.showOnboarding', "Voice Mode: Show Introduction"),
			f1: true,
			precondition: AGENTS_VOICE_ENABLED,
		});
	}

	run(accessor: ServicesAccessor): void {
		if (!accessor.get(IVoiceModeOnboardingService).show()) {
			accessor.get(INotificationService).info(nls.localize('agentsVoice.onboardingNeedsChat', "Open a chat to see the Voice Mode introduction."));
		}
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
		storageService.remove(AgentsVoiceStorageKeys.IntroBannerShown, StorageScope.APPLICATION);
	}
});

// --- Push-to-Talk Command ---

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'agentsVoice.pushToTalk',
			title: nls.localize2('agentsVoicePushToTalk', "Voice Mode: Push to Talk"),
			f1: true,
			precondition: AGENTS_VOICE_ENABLED,
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
		const keybindingService = accessor.get(IKeybindingService);

		// Capture hold mode before awaiting so the dispatching command is still available.
		const holdMode = keybindingService.enableKeybindingHoldMode('agentsVoice.pushToTalk');

		// Auto-connect on first PTT press
		if (!voiceController.isConnected.get() && !voiceController.isConnecting.get()) {
			await voiceController.connect(getActiveWindow());
		}
		if (!voiceController.isConnected.get()) {
			return;
		}

		voiceController.pttDown();

		if (!holdMode) {
			// Not invoked via a held keybinding: emulate a tap so the controller
			// enters toggle mode and keeps listening. Pressing again stops.
			voiceController.pttUp();
			return;
		}

		// The shortcut is being held: wait for release, then finish the turn.
		// The controller decides tap-vs-hold based on how long it was held.
		await holdMode;
		voiceController.pttUp();
	}
});

// Microphone selection is shared with dictation via the single
// `workbench.action.chat.selectSpeechToTextMicrophone` command (see
// chatSpeechToTextActions.ts), so Voice Mode no longer registers its own.

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
			experiment: {
				mode: 'auto',
			},
			tags: ['experimental'],
			scope: ConfigurationScope.APPLICATION,
			restricted: true,
		},
		[AgentsVoiceSettingId.ShowButton]: {
			type: 'boolean',
			markdownDescription: nls.localize('agents.voice.showButton', "Controls whether the Voice Mode button is shown in the chat input. When hidden, Voice Mode can still be started with its keyboard shortcut."),
			default: true,
			tags: ['experimental'],
			scope: ConfigurationScope.APPLICATION,
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
		[VOICE_AGENT_PROGRESS_SETTING]: {
			type: 'boolean',
			markdownDescription: nls.localize('agents.voice.agentProgress', "Allow Agent mode to speak brief semantic progress updates while it investigates, plans, edits, validates, or recovers from a problem."),
			default: true,
			tags: ['experimental'],
			scope: ConfigurationScope.APPLICATION,
		},
		'agents.voice.voice': {
			type: 'string',
			enum: ['harper_neutral', 'birch_neutral', 'junho_neutral', 'oak_neutral'],
			enumItemLabels: ['Harper', 'Birch', 'Junho', 'Oak'],
			enumDescriptions: [
				nls.localize('agents.voice.voice.harper', "Harper."),
				nls.localize('agents.voice.voice.birch', "Birch."),
				nls.localize('agents.voice.voice.junho', "Junho."),
				nls.localize('agents.voice.voice.oak', "Oak."),
			],
			markdownDescription: nls.localize('agents.voice.voice', "The voice used when the assistant reads responses aloud. Changing this while voice mode is connected takes effect immediately. Use [Voice Mode instructions](command:{0}) to customize Voice Mode behavior and terminology.", CONFIGURE_VOICE_INSTRUCTIONS_ACTION_ID),
			default: 'birch_neutral',
			scope: ConfigurationScope.APPLICATION,
		},
		'agents.voice.language': {
			type: 'string',
			enum: ['auto', 'en', 'de', 'es', 'fr', 'it', 'pt', 'ja', 'ko', 'zh'],
			enumItemLabels: [
				nls.localize('agents.voice.language.auto', "Automatic"),
				nls.localize('agents.voice.language.en', "English"),
				nls.localize('agents.voice.language.de', "German"),
				nls.localize('agents.voice.language.es', "Spanish"),
				nls.localize('agents.voice.language.fr', "French"),
				nls.localize('agents.voice.language.it', "Italian"),
				nls.localize('agents.voice.language.pt', "Portuguese"),
				nls.localize('agents.voice.language.ja', "Japanese"),
				nls.localize('agents.voice.language.ko', "Korean"),
				nls.localize('agents.voice.language.zh', "Chinese"),
			],
			markdownDescription: nls.localize('agents.voice.language', "The language used for speech recognition, dictation, and spoken responses. The selectable languages support native voice output. Automatic uses the configured display language for speech recognition and dictation when supported; otherwise, it follows the system or browser locale. English voice output is used when the detected language does not support native voice output. Changing this while voice mode is connected takes effect immediately."),
			default: 'auto',
			scope: ConfigurationScope.APPLICATION,
		},
		'agents.voice.showTranscript': {
			type: 'boolean',
			markdownDescription: nls.localize('agents.voice.showTranscript', "Show the voice transcript overlay in the chat input area while voice mode is active. Enable this to read responses as text when `#agents.voice.speakResponses#` is disabled."),
			default: false,
			scope: ConfigurationScope.APPLICATION,
		},
		'agents.voice.liveTranscript': {
			type: 'boolean',
			markdownDescription: nls.localize('agents.voice.liveTranscript', "Show your speech as a live, word-by-word transcript while you are speaking. When disabled, your transcript appears only once you finish speaking. Requires `#agents.voice.showTranscript#` to be enabled to be visible."),
			default: false,
			scope: ConfigurationScope.APPLICATION,
		},
		'agents.voice.handsFree': {
			type: 'boolean',
			markdownDescription: nls.localize('agents.voice.handsFree', "When enabled, voice mode automatically re-enters listening after the assistant finishes speaking, so you can hold a hands-free back-and-forth conversation. When disabled, you start and end each turn manually, and ending the turn sends it. Turns are not ended automatically on trailing silence or a stop phrase unless {0} or {1} is explicitly configured.", '`#agents.voice.turn.silenceMs#`', '`#agents.voice.turn.stopPhrases#`'),
			default: true,
			scope: ConfigurationScope.APPLICATION,
		},
		'agents.voice.turn.silenceMs': {
			type: 'number',
			markdownDescription: nls.localize('agents.voice.turn.silenceMs', "Trailing silence in milliseconds before the backend ends the turn automatically. Set to `-1` to disable ending the turn on silence, in which case the turn ends only via a stop phrase ({0}) or manually. When enabled, the backend clamps this to its supported range (currently 200-5000 ms) and is the source of truth. When hands-free mode ({1}) is disabled, the turn is not ended on silence by default unless this setting is explicitly configured, so you keep manual control over when a turn is sent.", '`#agents.voice.turn.stopPhrases#`', '`#agents.voice.handsFree#`'),
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
			markdownDescription: nls.localize('agents.voice.turn.stopPhrases', "Phrases that end the turn when spoken at the end of an utterance. Leave empty to disable ending the turn on a stop phrase, in which case the turn ends only on trailing silence ({0}) or manually. The backend strips the matched phrase from the transcript before it reaches the agent. When hands-free mode ({1}) is disabled, stop phrases do not end the turn by default unless this setting is explicitly configured, so you keep manual control over when a turn is sent.", '`#agents.voice.turn.silenceMs#`', '`#agents.voice.handsFree#`'),
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
		key: 'agents.voice.voice',
		includeApplication: true,
		migrateFn: (value: unknown) => ({ value: normalizeAgentsVoiceId(value) }),
	}, {
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

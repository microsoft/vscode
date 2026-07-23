/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import '../../../../../base/browser/ui/segmentedIconToggle/segmentedIconToggle.css';
import './media/voiceInputMode.css';
import { getActiveWindow, getWindow } from '../../../../../base/browser/dom.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { BaseActionViewItem } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IAction } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, observableFromEvent } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IsDevelopmentContext } from '../../../../../platform/contextkey/common/contextkeys.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IVoiceSessionController } from '../voiceClient/voiceSessionController.js';
import { IMicCaptureService } from '../voiceClient/micCaptureService.js';
import { ITtsPlaybackService } from '../voiceClient/ttsPlaybackService.js';
import { ChatSpeechToTextState, IChatSpeechToTextService } from '../speechToText/chatSpeechToTextService.js';
import { addMicButtonContextMenuListener, getDictationContextMenuActions, getVoiceModeContextMenuActions } from '../speechToText/micButtonMenuActions.js';
import { IVoiceInputModeService, SimulatedVoiceState, VoiceInputMode, VoiceWalkthroughVersion } from './voiceInputMode.js';
import { SegmentedVoiceInputModePillActive } from './voiceInputModeContextKeys.js';

/** Built-in on-device dictation toggle (start/stop). */
const DICTATION_TOGGLE_COMMAND_ID = 'workbench.action.chat.toggleSpeechToText';

/**
 * Stable command the Voice Mode "Configure Keybinding" context-menu entry targets.
 * The rendered voice affordance swaps between states, but the keybinding lives on
 * the start command, so target it in every state.
 */
const VOICE_START_COMMAND_ID = 'agentsVoice.startVoiceInChat';

/** Number of animated waveform bars shown in the voice segment. */
const WAVEFORM_BAR_COUNT = 5;

/**
 * Menu placeholder action for the segmented voice input mode toggle. The actual UI is
 * rendered by {@link VoiceInputModeActionViewItem}; running the action is a no-op.
 */
export class ChatVoiceInputModeAction extends Action2 {

	static readonly ID = 'workbench.action.chat.voiceInputMode';

	constructor() {
		super({
			id: ChatVoiceInputModeAction.ID,
			title: localize2('voiceInputMode', "Voice Input Mode"),
			icon: Codicon.mic,
			precondition: SegmentedVoiceInputModePillActive,
			menu: {
				id: MenuId.ChatExecute,
				when: ContextKeyExpr.and(
					SegmentedVoiceInputModePillActive,
					ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat),
					ChatContextKeys.currentlyEditing.negate(),
				),
				group: 'navigation',
				order: -11,
			},
		});
	}

	run(_accessor: ServicesAccessor): void {
		// No-op — interaction handled by VoiceInputModeActionViewItem.
	}
}

/**
 * Hold-to-talk (walkie-talkie) keybinding for the segmented voice toggle. While the key
 * is held the microphone listens; releasing it ends the turn and sends. Holding also
 * interrupts the assistant to barge in. Works the same in hands-free and manual modes and
 * never disconnects. Auto-connects on the first hold so a single shortcut starts talking.
 */
export class ChatVoiceInputModeToggleListenAction extends Action2 {

	static readonly ID = 'workbench.action.chat.voiceInputMode.holdToTalk';

	private _holdActive = false;

	constructor() {
		super({
			id: ChatVoiceInputModeToggleListenAction.ID,
			title: localize2('voiceInputMode.holdToTalk', "Voice Mode: Hold to Talk"),
			// A hold-only action cannot be invoked safely from the Command Palette: a
			// mouse click produces no key-up (leaving the turn pending) and a keyboard
			// invocation creates an immediate empty turn. Keep it keybinding-only.
			f1: false,
			precondition: ContextKeyExpr.equals('config.agents.voice.enabled', true),
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
		// Ignore key-repeat re-entry while a hold is already in progress.
		if (this._holdActive) {
			return;
		}
		const controller = accessor.get(IVoiceSessionController);
		const keybindingService = accessor.get(IKeybindingService);

		// Enforce mutual exclusion: if built-in dictation is recording, cancel it
		// before starting voice capture so the two never record simultaneously.
		const speechToText = accessor.get(IChatSpeechToTextService);
		if (speechToText.state !== ChatSpeechToTextState.Idle) {
			speechToText.cancel();
		}

		// Capture the key-hold FIRST (synchronously) — it must be requested before any await.
		const holdMode = keybindingService.enableKeybindingHoldMode(ChatVoiceInputModeToggleListenAction.ID);

		const win = getActiveWindow();
		let keyReleased = false;
		const releaseListener = dom.addDisposableListener(win, dom.EventType.KEY_UP, () => {
			keyReleased = true;
		});

		this._holdActive = true;
		try {
			// Auto-connect on the first hold so users can start talking with one shortcut.
			if (!controller.isConnected.get() && !controller.isConnecting.get()) {
				await controller.connect(win);
			}
			if (keyReleased) {
				// The shortcut was released while the connection was still being
				// established, so the hold already ended. Starting push-to-talk now
				// would immediately force an empty turn, so bail out instead.
				return;
			}
			if (controller.isConnected.get()) {
				controller.pttDown('explicit', true);  // force clean new turn
				if (holdMode) {
					await holdMode;        // wait for key release
				} else if (!keyReleased) {
					await new Promise<void>(resolve => {
						const l = dom.addDisposableListener(win, dom.EventType.KEY_UP, () => {
							l.dispose();
							resolve();
						});
					});
				}
				controller.pttUp('explicit', true);    // force finish turn and send
			}
		} finally {
			releaseListener.dispose();
			this._holdActive = false;
		}
	}
}

/**
 * Dev/preview commands to force the voice-cell visual states without a live backend
 * connection. Registered via {@link registerVoiceInputModeSimulateActions}.
 */
const SIMULATE_STATES: { readonly id: string; readonly label: string; readonly state: SimulatedVoiceState | undefined }[] = [
	{ id: 'off', label: 'Off (Disconnected)', state: 'off' },
	{ id: 'connecting', label: 'Connecting', state: 'connecting' },
	{ id: 'idle', label: 'Connected (Idle)', state: 'idle' },
	{ id: 'listening', label: 'Listening', state: 'listening' },
	{ id: 'speaking', label: 'Speaking', state: 'speaking' },
	{ id: 'dictating', label: 'Dictating', state: 'dictating' },
];

export function registerVoiceInputModeSimulateActions(): void {
	// Prototype walkthroughs — one per push-to-talk design. Each auto-plays (looping)
	// through the full lifecycle with accurate bars, colors, hover previews and the real
	// input-box glow, so the four interaction models can be compared side by side.
	const VERSIONS: { readonly version: VoiceWalkthroughVersion; readonly label: string }[] = [
		{ version: 'handsFree', label: 'v4 \u2014 Hands-Free (Auto-Listen)' },
		{ version: 'keyboardHold', label: 'v1 \u2014 Keyboard Hold-to-Talk (Walkie-Talkie)' },
		{ version: 'buttonHold', label: 'v2 \u2014 Button Hold-to-Talk' },
		{ version: 'clickToggle', label: 'v3 \u2014 Button Click-to-Toggle Listening' },
	];
	for (const { version, label } of VERSIONS) {
		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: `workbench.action.chat.voiceInputMode.simulate.walkthrough.${version}`,
					title: { value: `Voice Input Mode: Prototype Walkthrough \u2014 ${label}`, original: `Voice Input Mode: Prototype Walkthrough \u2014 ${label}` },
					category: { value: 'Developer', original: 'Developer' },
					precondition: IsDevelopmentContext,
					f1: true,
				});
			}
			run(accessor: ServicesAccessor): void {
				accessor.get(IVoiceInputModeService).startVoiceStateWalkthrough(version);
			}
		});
	}

	// Manual step — advance to the next state on each invocation (bind a key to click through).
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.voiceInputMode.simulate.step',
				title: { value: 'Voice Input Mode: Prototype Step (Next State)', original: 'Voice Input Mode: Prototype Step (Next State)' },
				category: { value: 'Developer', original: 'Developer' },
				precondition: IsDevelopmentContext,
				f1: true,
			});
		}
		run(accessor: ServicesAccessor): void {
			accessor.get(IVoiceInputModeService).stepVoiceStateWalkthrough();
		}
	});

	// Clear — stop any walkthrough and return to the real state.
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.voiceInputMode.simulate.clear',
				title: { value: 'Voice Input Mode: Simulate \u2014 Clear', original: 'Voice Input Mode: Simulate \u2014 Clear' },
				category: { value: 'Developer', original: 'Developer' },
				precondition: IsDevelopmentContext,
				f1: true,
			});
		}
		run(accessor: ServicesAccessor): void {
			accessor.get(IVoiceInputModeService).clearSimulation();
		}
	});

	for (const { id, label, state } of SIMULATE_STATES) {
		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: `workbench.action.chat.voiceInputMode.simulate.${id}`,
					// Dev-only utility — not localized.
					title: { value: `Voice Input Mode: Simulate \u2014 ${label}`, original: `Voice Input Mode: Simulate \u2014 ${label}` },
					category: { value: 'Developer', original: 'Developer' },
					precondition: IsDevelopmentContext,
					f1: true,
				});
			}
			run(accessor: ServicesAccessor): void {
				accessor.get(IVoiceInputModeService).setSimulatedVoiceState(state);
			}
		});
	}
}

/**
 * Optional host hooks for reusing {@link VoiceInputModeActionViewItem} outside the
 * main chat input (e.g. the agents-window new-session composer), where dictation and
 * voice must target that surface rather than the last focused chat widget.
 */
export interface IVoiceInputModePillOptions {
	/** Toggle dictation for the host surface (defaults to the shared toggle command). */
	readonly toggleDictation?: () => void;
}

/**
 * A single segmented control in the chat input that hosts both voice input modes:
 * a Dictation segment (speech-to-text into the input) and a Voice Mode segment (live
 * conversational agent). Only one mode can be active at a time — activating one stops
 * the other. Both segments stay visible (when available) so users discover both modes.
 */
export class VoiceInputModeActionViewItem extends BaseActionViewItem {

	private _reel: HTMLElement | undefined;
	private _dictationCell: HTMLElement | undefined;
	private _voiceCell: HTMLElement | undefined;
	private _listenCell: HTMLElement | undefined;
	private _dictationIcon: HTMLElement | undefined;
	private _listenIcon: HTMLElement | undefined;
	private _voiceBars: HTMLElement | undefined;
	private _voiceBarEls: HTMLElement[] = [];
	private _barAnimationFrame: number | undefined;
	private _voiceHovering = false;
	private _voiceLive = false;
	private _barData: Uint8Array | undefined;

	// Hold-to-talk gesture state for the listen cell: press-and-hold records, release sends.
	private _listenHoldTimer: number | undefined;
	private _listenHoldListening = false;
	private _listenHoldGesture = false;
	private _listenSuppressClick = false;
	private readonly _listenPointerUp = this._register(new MutableDisposable());

	constructor(
		action: IAction,
		private readonly _options: IVoiceInputModePillOptions | undefined,
		@IVoiceInputModeService private readonly voiceInputModeService: IVoiceInputModeService,
		@IVoiceSessionController private readonly voiceSessionController: IVoiceSessionController,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IHoverService private readonly hoverService: IHoverService,
		@IMicCaptureService private readonly micCaptureService: IMicCaptureService,
		@ITtsPlaybackService private readonly ttsPlaybackService: ITtsPlaybackService,
		@IChatSpeechToTextService private readonly chatSpeechToTextService: IChatSpeechToTextService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
	) {
		super(undefined, action);
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('monaco-segmented-icon-toggle-container', 'chat-voice-input-mode-item');

		// A masked 2-slot viewport ("slot machine reel"). The reel holds three cells:
		//   [ dictation ][ voice ][ listen ]
		// Disconnected → the reel shows slots 0..1 (dictation + voice-connect).
		// Connected    → the reel slides left one slot to show slots 1..2, so the voice
		//                cell takes the dictation cell's place (now animated + disconnect)
		//                and the listen toggle slides in from the right.
		const pill = dom.append(container, dom.$('.monaco-segmented-icon-toggle.chat-voice-input-mode'));
		this._reel = dom.append(pill, dom.$('.monaco-segmented-icon-toggle-reel.chat-voice-input-mode-reel'));

		// --- Dictation cell ---
		this._dictationCell = dom.append(this._reel, dom.$('button.monaco-segmented-icon-toggle-cell.chat-voice-input-mode-cell.dictation'));
		this._dictationCell.setAttribute('type', 'button');
		this._dictationCell.setAttribute('role', 'button');
		this._dictationCell.setAttribute('aria-label', localize('voiceInputMode.dictation', "Dictation"));
		this._dictationIcon = dom.append(this._dictationCell, dom.$('span.chat-voice-input-mode-icon'));
		this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), this._dictationCell, localize('voiceInputMode.dictation', "Dictation")));
		this._register(dom.addDisposableListener(this._dictationCell, dom.EventType.CLICK, e => {
			dom.EventHelper.stop(e, true);
			this._onClickDictation();
		}));
		this._register(addMicButtonContextMenuListener(
			this._dictationCell,
			() => getDictationContextMenuActions(this.commandService, this.configurationService, this.keybindingService, DICTATION_TOGGLE_COMMAND_ID),
			this.contextMenuService,
		));

		// --- Voice cell: a single waveform that transforms across states (no glyph). ---
		this._voiceCell = dom.append(this._reel, dom.$('button.monaco-segmented-icon-toggle-cell.chat-voice-input-mode-cell.voice'));
		this._voiceCell.setAttribute('type', 'button');
		this._voiceCell.setAttribute('role', 'button');
		this._voiceCell.setAttribute('aria-label', localize('voiceInputMode.voice', "Voice Mode"));
		this._voiceBars = dom.append(this._voiceCell, dom.$('span.chat-voice-input-mode-bars'));
		for (let i = 0; i < WAVEFORM_BAR_COUNT; i++) {
			this._voiceBarEls.push(dom.append(this._voiceBars, dom.$('span.chat-voice-input-mode-bar')));
		}
		this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), this._voiceCell,
			() => {
				const connectedish = this.voiceSessionController.isConnected.get() || this.voiceSessionController.isConnecting.get() || this.voiceInputModeService.simulatedVoiceState.get() === 'idle' || this.voiceInputModeService.simulatedVoiceState.get() === 'listening' || this.voiceInputModeService.simulatedVoiceState.get() === 'speaking';
				return connectedish
					? localize('voiceInputMode.disconnect', "Turn Off Voice Mode")
					: localize('voiceInputMode.voice', "Voice Mode");
			}));
		// The voice button is a plain power toggle (connect / disconnect). Listening is
		// driven by the separate listen cell in manual mode and by the auto-listen loop
		// in hands-free mode.
		this._register(dom.addDisposableListener(this._voiceCell, dom.EventType.CLICK, e => {
			dom.EventHelper.stop(e, true);
			this._onClickVoicePowerToggle();
		}));
		this._register(addMicButtonContextMenuListener(
			this._voiceCell,
			() => getVoiceModeContextMenuActions(this.commandService, this.configurationService, this.keybindingService, VOICE_START_COMMAND_ID),
			this.contextMenuService,
		));
		// Pause the audio-reactive bars while hovering so the CSS "silent" preview shows.
		this._register(dom.addDisposableListener(this._voiceCell, dom.EventType.MOUSE_ENTER, () => {
			this._voiceHovering = true;
			this._stopBarAnimation();
		}));
		this._register(dom.addDisposableListener(this._voiceCell, dom.EventType.MOUSE_LEAVE, () => {
			this._voiceHovering = false;
			this._syncBarAnimation();
		}));

		// --- Listen cell: mic/stop icon that toggles listening in manual voice mode. ---
		this._listenCell = dom.append(this._reel, dom.$('button.monaco-segmented-icon-toggle-cell.chat-voice-input-mode-cell.listen'));
		this._listenCell.setAttribute('type', 'button');
		this._listenCell.setAttribute('role', 'button');
		this._listenCell.setAttribute('aria-label', localize('voiceInputMode.listenToggle', "Toggle Listening"));
		this._listenIcon = dom.append(this._listenCell, dom.$('span.chat-voice-input-mode-icon'));
		this._register(addMicButtonContextMenuListener(
			this._listenCell,
			() => getVoiceModeContextMenuActions(this.commandService, this.configurationService, this.keybindingService, VOICE_START_COMMAND_ID),
			this.contextMenuService,
		));
		this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), this._listenCell,
			() => this.voiceSessionController.voiceState.get() === 'listening'
				? localize('voiceInputMode.stopListening', "Stop Listening")
				: localize('voiceInputMode.startOrHoldListening', "Tap to start, or hold to talk")));
		// The listen cell supports two gestures: a tap toggles listening on/off, and a
		// press-and-hold records while held and sends on release (hold-to-talk). Use the
		// generic pointer-aware listener so press-and-hold also starts on iOS.
		this._register(dom.addDisposableGenericMouseDownListener(this._listenCell, (e: MouseEvent) => {
			if (e.button !== 0) {
				return;
			}
			this._onListenPointerDown();
		}));
		this._register(dom.addDisposableListener(this._listenCell, dom.EventType.CLICK, e => {
			dom.EventHelper.stop(e, true);
			if (this._listenSuppressClick) {
				this._listenSuppressClick = false;
				return; // trailing click after a hold — the release already handled it
			}
			this._onClickListen();
		}));

		// Dictation activity: driven directly by the built-in on-device speech-to-text
		// service so the mic reliably fills while a dictation session is recording or
		// transcribing (global, not scope-dependent).
		const dictationActive = observableFromEvent(this,
			this.chatSpeechToTextService.onDidChangeState,
			() => this.chatSpeechToTextService.state !== ChatSpeechToTextState.Idle);

		// Model preparation: on first use the on-device model downloads/loads. Swap the
		// mic for a download affordance while preparing, mirroring the standalone button.
		const dictationPreparing = observableFromEvent(this,
			this.chatSpeechToTextService.onDidChangePreparingModel,
			() => this.chatSpeechToTextService.isPreparingModel);

		this._register(autorun(reader => {
			const dictationAvailable = this.voiceInputModeService.dictationAvailable.read(reader);
			const voiceAvailable = this.voiceInputModeService.voiceAvailable.read(reader);
			const simHandsFree = this.voiceInputModeService.simulatedHandsFree.read(reader);
			const handsFree = simHandsFree ?? this.voiceInputModeService.handsFree.read(reader);
			const sim = this.voiceInputModeService.simulatedVoiceState.read(reader);

			// Resolve the effective state — a simulation override wins over live state.
			let isDictating: boolean;
			let connected: boolean;
			let connecting: boolean;
			let listening: boolean;
			let speaking: boolean;
			if (sim !== undefined) {
				isDictating = sim === 'dictating';
				connecting = sim === 'connecting';
				connected = sim === 'idle' || sim === 'listening' || sim === 'speaking';
				listening = sim === 'listening';
				speaking = sim === 'speaking';
			} else {
				isDictating = dictationActive.read(reader);
				connected = this.voiceSessionController.isConnected.read(reader);
				connecting = this.voiceSessionController.isConnecting.read(reader);
				const voiceState = this.voiceSessionController.voiceState.read(reader);
				listening = connected && voiceState === 'listening';
				speaking = connected && voiceState === 'speaking';
			}
			const voiceLive = listening || speaking;
			const voiceOn = connected || connecting;
			this._voiceLive = voiceLive;
			// First-use model download/load (real state only; simulations never prepare).
			const dictationBusy = sim === undefined && dictationPreparing.read(reader);

			// The dedicated listen (start/stop speaking) toggle shows in manual
			// (non-hands-free) connected voice mode. In hands-free mode the auto-listen
			// loop drives listening, so there is no listen cell.
			const showListen = voiceOn && !handsFree;

			// Presence of each cell. The housing is a constant size; the absent cell
			// collapses its width to 0 (mask recenters) so icons slide into place.
			//   - dictation: shown when NOT in voice mode (home menu / dictating)
			//   - voice:     shown unless dictation is actively recording
			//   - listen:    shown only in manual-connected voice mode
			const dictationPresent = dictationAvailable && !voiceOn;
			const voicePresent = voiceAvailable && !isDictating && !dictationBusy;
			const listenPresent = showListen;

			// Exactly one icon → single-icon view (the lone button fills the whole pill).
			const presentCount = (dictationPresent ? 1 : 0) + (voicePresent ? 1 : 0) + (listenPresent ? 1 : 0);
			container.classList.toggle('connected', voiceOn);
			container.classList.toggle('single', presentCount === 1);

			// Dictation cell — download affordance while the model prepares, else fills
			// the mic while dictating.
			this._dictationCell!.classList.toggle('collapsed', !dictationPresent);
			this._dictationCell!.classList.toggle('active', isDictating || dictationBusy);
			this._dictationCell!.classList.toggle('preparing', dictationBusy);
			this._dictationCell!.setAttribute('aria-pressed', String(isDictating));
			this._dictationCell!.setAttribute('aria-label', dictationBusy
				? localize('voiceInputMode.dictationPreparing', "Preparing Speech to Text Model…")
				: localize('voiceInputMode.dictation', "Dictation"));
			this._dictationIcon!.className = `chat-voice-input-mode-icon ${ThemeIcon.asClassName(dictationBusy ? Codicon.micDownload : (isDictating ? Codicon.micFilled : Codicon.mic))}`;

			// Voice cell — Device EQ bars that transform:
			//   disconnected → thin grey bars (click to connect)
			//   connected/idle → darker bars, calm undulating wave
			//   listening → BLUE bars, audio-reactive to the user's voice
			//   speaking → PURPLE bars, audio-reactive to the assistant
			//   hover-while-connected → short even "silent" bars (previews disconnect; CSS)
			this._voiceCell!.classList.toggle('collapsed', !voicePresent);
			this._voiceCell!.classList.toggle('on', voiceOn);
			this._voiceCell!.classList.toggle('idle-on', voiceOn && !voiceLive);
			this._voiceCell!.classList.toggle('listening', listening);
			this._voiceCell!.classList.toggle('speaking', speaking);
			this._voiceCell!.setAttribute('aria-pressed', String(voiceOn));
			this._voiceCell!.setAttribute('aria-label', voiceOn
				? localize('voiceInputMode.disconnect', "Turn Off Voice Mode")
				: localize('voiceInputMode.voice', "Voice Mode"));
			// Simulated hover (walkthrough only) mirrors the real :hover disconnect preview.
			this._voiceCell!.classList.toggle('sim-hover', this.voiceInputModeService.simulatedHover.read(reader));

			// Listen / stop-speaking toggle: mic to start, stop to end.
			this._listenCell!.classList.toggle('collapsed', !listenPresent);
			this._listenCell!.classList.toggle('active', listening);
			this._listenCell!.classList.toggle('muted', !listening);
			this._listenCell!.setAttribute('aria-pressed', String(listening));
			this._listenCell!.setAttribute('aria-label', listening
				? localize('voiceInputMode.stopListening', "Stop Listening")
				: localize('voiceInputMode.startListening', "Start Listening"));
			this._listenIcon!.className = `chat-voice-input-mode-icon ${ThemeIcon.asClassName(listening ? Codicon.personVoiceFilled : Codicon.personVoice)}`;

			// Audio-reactive bars only while live (and not hovering the disconnect preview).
			this._syncBarAnimation();
		}));

		this._register({ dispose: () => this._stopBarAnimation() });
		// Re-sync if the reduced-motion preference changes while the voice cell is live.
		this._register(this.accessibilityService.onDidChangeReducedMotion(() => {
			this._stopBarAnimation();
			this._syncBarAnimation();
		}));
	}

	/** Start or stop the audio-reactive bar loop based on live + hover state. */
	private _syncBarAnimation(): void {
		if (this._voiceLive && !this._voiceHovering) {
			this._startBarAnimation();
		} else {
			this._stopBarAnimation();
		}
	}

	/**
	 * Animate the waveform bars from live audio. Uses the mic analyser while listening
	 * and the TTS analyser while the assistant speaks. When no analyser is available
	 * (e.g. reduced motion or pre-capture), the CSS keyframe fallback drives the bars.
	 */
	private _startBarAnimation(): void {
		if (this._barAnimationFrame !== undefined) {
			return;
		}
		// Respect reduced-motion: skip both the rAF audio-reactive loop and the CSS
		// keyframe fallback, rendering the bars at a flat static height instead.
		if (this.accessibilityService.isMotionReduced()) {
			for (const bar of this._voiceBarEls) {
				bar.style.animation = 'none';
				bar.style.height = '3px';
			}
			return;
		}
		const win = getWindow(this._voiceCell);
		const tick = () => {
			this._barAnimationFrame = win.requestAnimationFrame(tick);
			// Read the live state each frame so listening<->speaking picks the right analyser.
			const analyser = this.voiceSessionController.voiceState.get() === 'speaking'
				? this.ttsPlaybackService.analyserNode
				: this.micCaptureService.analyserNode;
			if (!analyser) {
				// Let the CSS keyframe animation take over.
				for (const bar of this._voiceBarEls) {
					bar.style.removeProperty('height');
					bar.style.removeProperty('animation');
				}
				return;
			}
			if (!this._barData || this._barData.length !== analyser.frequencyBinCount) {
				this._barData = new Uint8Array(analyser.frequencyBinCount);
			}
			analyser.getByteFrequencyData(this._barData as Uint8Array<ArrayBuffer>);
			const bins = this._barData.length;
			const step = Math.max(1, Math.floor(bins / this._voiceBarEls.length));
			for (let i = 0; i < this._voiceBarEls.length; i++) {
				let sum = 0;
				for (let j = 0; j < step; j++) {
					sum += this._barData[Math.min(bins - 1, i * step + j)];
				}
				const intensity = Math.min(1, (sum / step) / 180);
				const heightPx = 3 + intensity * 11;
				// Disable the CSS keyframe fallback while we drive heights from live audio.
				this._voiceBarEls[i].style.animation = 'none';
				this._voiceBarEls[i].style.height = `${heightPx}px`;
			}
		};
		this._barAnimationFrame = win.requestAnimationFrame(tick);
	}

	private _stopBarAnimation(): void {
		if (this._barAnimationFrame !== undefined && this._voiceCell) {
			getWindow(this._voiceCell).cancelAnimationFrame(this._barAnimationFrame);
		}
		this._barAnimationFrame = undefined;
		for (const bar of this._voiceBarEls) {
			bar.style.removeProperty('height');
			bar.style.removeProperty('animation');
		}
	}

	/**
	 * Toggle built-in on-device dictation. By default this runs the shared
	 * {@link DICTATION_TOGGLE_COMMAND_ID} command (which targets the last focused
	 * chat widget); a host that isn't an `IChatWidget` (e.g. the agents-window
	 * composer) can inject its own toggle via {@link IVoiceInputModePillOptions}.
	 */
	private _toggleDictation(): void {
		if (this._options?.toggleDictation) {
			this._options.toggleDictation();
		} else {
			this.commandService.executeCommand(DICTATION_TOGGLE_COMMAND_ID);
		}
	}

	private _onClickDictation(): void {
		this.voiceInputModeService.setSelectedMode('dictation');

		// Mutual exclusion: stop live Voice Mode before starting dictation.
		if (this.voiceSessionController.isConnected.get() || this.voiceSessionController.isConnecting.get()) {
			this.voiceSessionController.disconnect();
		}

		this._toggleDictation();
	}

	/**
	 * The voice button is a power toggle. Connecting also begins listening so the user
	 * can talk immediately; in manual mode the separate listen cell then toggles
	 * listening on and off.
	 */
	private _onClickVoicePowerToggle(): void {
		this.voiceInputModeService.setSelectedMode('voice');

		// Mutual exclusion: stop dictation before entering Voice Mode.
		if (this.chatSpeechToTextService.state !== ChatSpeechToTextState.Idle) {
			this._toggleDictation();
		}

		const controller = this.voiceSessionController;
		if (controller.isConnected.get() || controller.isConnecting.get()) {
			controller.disconnect();
		} else {
			const targetWindow = getWindow(this._voiceCell);
			controller.connect(targetWindow).then(() => {
				if (controller.isConnected.get()) {
					controller.pttDown();
					controller.pttUp();
				}
			}, () => { /* connect failures are surfaced/logged by the controller */ });
		}
	}

	/** Tap the listen cell to toggle listening on and off. */
	private _onClickListen(): void {
		const controller = this.voiceSessionController;
		if (!controller.isConnected.get()) {
			return;
		}
		// While toggle-listening, a single `pttDown()` finishes the turn (stop). Otherwise
		// `pttDown(); pttUp();` (re)starts listening, interrupting any in-progress playback.
		if (controller.voiceState.get() === 'listening') {
			controller.pttDown();
		} else {
			controller.pttDown();
			controller.pttUp();
		}
	}

	/** Threshold (ms) separating a quick tap (toggle) from a press-and-hold (talk). */
	private static readonly HOLD_THRESHOLD_MS = 180;

	private _onListenPointerDown(): void {
		const controller = this.voiceSessionController;
		// Hold-to-talk only applies to a connected, non-listening session; otherwise let
		// the trailing click drive the plain toggle.
		if (!controller.isConnected.get() || controller.voiceState.get() === 'listening') {
			return;
		}
		this._listenHoldGesture = true;
		this._listenHoldListening = false;
		// Fresh gesture: clear any suppression left over from a prior hold whose release
		// landed off-button (and therefore produced no trailing click to consume it).
		this._listenSuppressClick = false;
		const win = getWindow(this._listenCell);
		// Start listening only after the hold threshold, so a quick tap (toggle) does not
		// briefly flash the listening state.
		this._listenHoldTimer = win.setTimeout(() => {
			this._listenHoldTimer = undefined;
			if (controller.isConnected.get()) {
				this._listenHoldListening = true;
				controller.pttDown('explicit', true);
			}
		}, VoiceInputModeActionViewItem.HOLD_THRESHOLD_MS);
		// End the gesture on release anywhere (in case the pointer leaves the button).
		// Generic pointer-aware listener so an iOS pointer hold also finishes and sends.
		this._listenPointerUp.value = dom.addDisposableGenericMouseUpListener(win, (e: MouseEvent) => this._endListenPointerHold(e));
	}

	private _endListenPointerHold(e?: MouseEvent): void {
		if (!this._listenHoldGesture) {
			return;
		}
		this._listenHoldGesture = false;
		this._listenPointerUp.clear();
		if (this._listenHoldTimer !== undefined) {
			// Released before the threshold → a tap; let the trailing click toggle listening.
			getWindow(this._listenCell).clearTimeout(this._listenHoldTimer);
			this._listenHoldTimer = undefined;
			this._listenSuppressClick = false;
		} else if (this._listenHoldListening) {
			// Held past the threshold → end the turn and send. A trailing `click` only fires
			// when the release lands on the button, so only arm suppression in that case —
			// otherwise a stale flag would swallow the next (e.g. keyboard) activation.
			this._listenHoldListening = false;
			const releasedOnCell = !!e?.target && this._listenCell!.contains(e.target as Node);
			this._listenSuppressClick = releasedOnCell;
			this.voiceSessionController.pttUp('explicit', true);
		}
	}

	override dispose(): void {
		// If disposed mid-hold (widget closed/rerendered), finalize the gesture so the
		// controller does not keep recording until its max-duration timeout.
		if (this._listenHoldGesture || this._listenHoldTimer !== undefined) {
			this._endListenPointerHold();
		}
		super.dispose();
	}
}

export function isVoiceInputModeAvailable(voiceInputModeService: IVoiceInputModeService): VoiceInputMode | 'both' | undefined {
	const dictation = voiceInputModeService.dictationAvailable.get();
	const voice = voiceInputModeService.voiceAvailable.get();
	if (dictation && voice) {
		return 'both';
	}
	if (dictation) {
		return 'dictation';
	}
	if (voice) {
		return 'voice';
	}
	return undefined;
}

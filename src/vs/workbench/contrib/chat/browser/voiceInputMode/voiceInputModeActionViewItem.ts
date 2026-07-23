/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
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
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IVoiceSessionController } from '../voiceClient/voiceSessionController.js';
import { IMicCaptureService } from '../voiceClient/micCaptureService.js';
import { ITtsPlaybackService } from '../voiceClient/ttsPlaybackService.js';
import { ISpeechService } from '../../../speech/common/speechService.js';
import { Event } from '../../../../../base/common/event.js';
import { IVoiceInputModeService, SimulatedVoiceState, VoiceInputMode, VoiceInputModeSegmentedSettingId, VoiceWalkthroughVersion } from './voiceInputMode.js';

const DICTATION_START_COMMAND_ID = 'workbench.action.chat.startVoiceChat';
const DICTATION_STOP_COMMAND_ID = 'workbench.action.chat.stopListening';

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
			precondition: ContextKeyExpr.equals(`config.${VoiceInputModeSegmentedSettingId}`, true),
			menu: {
				id: MenuId.ChatExecute,
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals(`config.${VoiceInputModeSegmentedSettingId}`, true),
					ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat),
					ChatContextKeys.currentlyEditing.negate(),
					// At least one of the two modes must be available for the pill to show.
					ContextKeyExpr.or(
						ContextKeyExpr.has('hasSpeechProvider'),
						ContextKeyExpr.equals('config.agents.voice.enabled', true),
					),
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
			f1: true,
			precondition: ContextKeyExpr.and(
				ContextKeyExpr.equals(`config.${VoiceInputModeSegmentedSettingId}`, true),
				ContextKeyExpr.equals('config.agents.voice.enabled', true),
			),
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Space,
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals(`config.${VoiceInputModeSegmentedSettingId}`, true),
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
	// Button hold-to-talk (pointer) state.
	private _voiceHoldTimer: number | undefined;
	private _voiceHoldListening = false;
	private _voiceHoldGesture = false;
	private _voiceSuppressClick = false;
	private readonly _voicePointerUp = this._register(new MutableDisposable());

	constructor(
		action: IAction,
		@IVoiceInputModeService private readonly voiceInputModeService: IVoiceInputModeService,
		@IVoiceSessionController private readonly voiceSessionController: IVoiceSessionController,
		@ICommandService private readonly commandService: ICommandService,
		@IHoverService private readonly hoverService: IHoverService,
		@IMicCaptureService private readonly micCaptureService: IMicCaptureService,
		@ITtsPlaybackService private readonly ttsPlaybackService: ITtsPlaybackService,
		@ISpeechService private readonly speechService: ISpeechService,
	) {
		super(undefined, action);
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('chat-voice-input-mode-item');

		// A masked 2-slot viewport ("slot machine reel"). The reel holds three cells:
		//   [ dictation ][ voice ][ listen ]
		// Disconnected → the reel shows slots 0..1 (dictation + voice-connect).
		// Connected    → the reel slides left one slot to show slots 1..2, so the voice
		//                cell takes the dictation cell's place (now animated + disconnect)
		//                and the listen toggle slides in from the right.
		const pill = dom.append(container, dom.$('.chat-voice-input-mode'));
		this._reel = dom.append(pill, dom.$('.chat-voice-input-mode-reel'));

		// --- Dictation cell ---
		this._dictationCell = dom.append(this._reel, dom.$('button.chat-voice-input-mode-cell.dictation'));
		this._dictationCell.setAttribute('type', 'button');
		this._dictationCell.setAttribute('role', 'button');
		this._dictationIcon = dom.append(this._dictationCell, dom.$('span.chat-voice-input-mode-icon'));
		this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), this._dictationCell, localize('voiceInputMode.dictation', "Dictation")));
		this._register(dom.addDisposableListener(this._dictationCell, dom.EventType.CLICK, e => {
			dom.EventHelper.stop(e, true);
			this._onClickDictation();
		}));

		// --- Voice cell: a single waveform that transforms across states (no glyph). ---
		this._voiceCell = dom.append(this._reel, dom.$('button.chat-voice-input-mode-cell.voice'));
		this._voiceCell.setAttribute('type', 'button');
		this._voiceCell.setAttribute('role', 'button');
		this._voiceBars = dom.append(this._voiceCell, dom.$('span.chat-voice-input-mode-bars'));
		for (let i = 0; i < WAVEFORM_BAR_COUNT; i++) {
			this._voiceBarEls.push(dom.append(this._voiceBars, dom.$('span.chat-voice-input-mode-bar')));
		}
		this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), this._voiceCell,
			() => {
				const connectedish = this.voiceSessionController.isConnected.get() || this.voiceSessionController.isConnecting.get() || this.voiceInputModeService.simulatedVoiceState.get() === 'idle' || this.voiceInputModeService.simulatedVoiceState.get() === 'listening' || this.voiceInputModeService.simulatedVoiceState.get() === 'speaking';
				if (!connectedish) {
					return localize('voiceInputMode.voice', "Voice Mode");
				}
				return this.voiceInputModeService.interactionStyle.get() === 'listenButton'
					? localize('voiceInputMode.disconnect', "Turn Off Voice Mode")
					: localize('voiceInputMode.holdOrTap', "Hold to talk, tap to turn off Voice Mode");
			}));
		// Voice button interaction depends on the interaction style:
		//   - holdToTalk:   hold to record (release sends); a quick tap turns Voice Mode off.
		//   - listenButton: a plain click is a power toggle (connect / disconnect); the
		//                   separate listen cell drives listening.
		this._register(dom.addDisposableListener(this._voiceCell, dom.EventType.MOUSE_DOWN, e => {
			if (e.button !== 0 || this.voiceInputModeService.interactionStyle.get() !== 'holdToTalk') {
				return;
			}
			this._onVoicePointerDown();
		}));
		this._register(dom.addDisposableListener(this._voiceCell, dom.EventType.CLICK, e => {
			dom.EventHelper.stop(e, true);
			if (this._voiceSuppressClick) {
				this._voiceSuppressClick = false;
				return; // trailing click after a hold — do not also disconnect
			}
			if (this.voiceInputModeService.interactionStyle.get() === 'listenButton') {
				this._onClickVoicePowerToggle();
			} else {
				this._onClickVoice();
			}
		}));
		// Pause the audio-reactive bars while hovering so the CSS "silent" preview shows.
		this._register(dom.addDisposableListener(this._voiceCell, dom.EventType.MOUSE_ENTER, () => {
			this._voiceHovering = true;
			this._stopBarAnimation();
		}));
		this._register(dom.addDisposableListener(this._voiceCell, dom.EventType.MOUSE_LEAVE, () => {
			this._voiceHovering = false;
			this._syncBarAnimation();
		}));

		// --- Listen cell (listenButton style only): person-voice icon that toggles listening. ---
		this._listenCell = dom.append(this._reel, dom.$('button.chat-voice-input-mode-cell.listen'));
		this._listenCell.setAttribute('type', 'button');
		this._listenCell.setAttribute('role', 'button');
		this._listenIcon = dom.append(this._listenCell, dom.$('span.chat-voice-input-mode-icon'));
		this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), this._listenCell, localize('voiceInputMode.listenToggle', "Toggle Listening")));
		this._register(dom.addDisposableListener(this._listenCell, dom.EventType.CLICK, e => {
			dom.EventHelper.stop(e, true);
			this._onClickListen();
		}));

		// Dictation activity: driven directly by the speech service so the mic reliably
		// fills while a speech-to-text session is recording (global, not scope-dependent).
		const dictationActive = observableFromEvent(this,
			Event.any(this.speechService.onDidStartSpeechToTextSession, this.speechService.onDidEndSpeechToTextSession),
			() => this.speechService.hasActiveSpeechToTextSession);

		this._register(autorun(reader => {
			const dictationAvailable = this.voiceInputModeService.dictationAvailable.read(reader);
			const voiceAvailable = this.voiceInputModeService.voiceAvailable.read(reader);
			const interactionStyle = this.voiceInputModeService.interactionStyle.read(reader);
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

			// The dedicated listen toggle only exists in the listenButton style, and only in
			// manual (non-hands-free) connected voice mode. In holdToTalk style listening is
			// driven by holding the voice button / keybinding, so there is no listen cell.
			const showListen = interactionStyle === 'listenButton' && voiceOn && !handsFree;

			// Presence of each cell. The housing is a constant size; the absent cell
			// collapses its width to 0 (mask recenters) so icons slide into place.
			//   - dictation: shown when NOT in voice mode (home menu / dictating)
			//   - voice:     shown unless dictation is actively recording
			//   - listen:    shown only in manual-connected voice mode (listenButton style)
			const dictationPresent = dictationAvailable && !voiceOn;
			const voicePresent = voiceAvailable && !isDictating;
			const listenPresent = showListen;

			// Exactly one icon → single-icon view (the lone button fills the whole pill).
			const presentCount = (dictationPresent ? 1 : 0) + (voicePresent ? 1 : 0) + (listenPresent ? 1 : 0);
			container.classList.toggle('connected', voiceOn);
			container.classList.toggle('single', presentCount === 1);

			// Dictation cell — fills the mic when dictating.
			this._dictationCell!.classList.toggle('collapsed', !dictationPresent);
			this._dictationCell!.classList.toggle('active', isDictating);
			this._dictationIcon!.className = `chat-voice-input-mode-icon ${ThemeIcon.asClassName(isDictating ? Codicon.micFilled : Codicon.mic)}`;

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
			// Simulated hover (walkthrough only) mirrors the real :hover disconnect preview.
			this._voiceCell!.classList.toggle('sim-hover', this.voiceInputModeService.simulatedHover.read(reader));

			// Listen / don't-listen toggle (listenButton style): person-voice icon,
			// filled while listening, outline otherwise.
			this._listenCell!.classList.toggle('collapsed', !listenPresent);
			this._listenCell!.classList.toggle('active', listening);
			this._listenCell!.classList.toggle('muted', !listening);
			this._listenIcon!.className = `chat-voice-input-mode-person-voice${listening ? ' filled' : ''}`;

			// Audio-reactive bars only while live (and not hovering the disconnect preview).
			this._syncBarAnimation();
		}));

		this._register({ dispose: () => this._stopBarAnimation() });
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

	private _onClickDictation(): void {
		this.voiceInputModeService.setSelectedMode('dictation');

		// Mutual exclusion: stop live Voice Mode before starting dictation.
		if (this.voiceSessionController.isConnected.get() || this.voiceSessionController.isConnecting.get()) {
			this.voiceSessionController.disconnect();
		}

		const dictating = this.speechService.hasActiveSpeechToTextSession;
		this.commandService.executeCommand(dictating ? DICTATION_STOP_COMMAND_ID : DICTATION_START_COMMAND_ID);
	}

	private _onClickVoice(): void {
		this.voiceInputModeService.setSelectedMode('voice');

		// Mutual exclusion: stop dictation before entering Voice Mode.
		if (this.speechService.hasActiveSpeechToTextSession) {
			this.commandService.executeCommand(DICTATION_STOP_COMMAND_ID);
		}

		// Power toggle: same button connects when off and disconnects when on (a quick tap
		// while connected). Listening is hold-to-talk (button hold / keybinding), so
		// connecting just brings the session online in its idle "on" state.
		const controller = this.voiceSessionController;
		if (controller.isConnected.get() || controller.isConnecting.get()) {
			controller.disconnect();
		} else {
			const targetWindow = getWindow(this._voiceCell);
			controller.connect(targetWindow).catch(() => { /* surfaced/logged by the controller */ });
		}
	}

	/** Threshold (ms) separating a quick tap (disconnect) from a hold (talk). */
	private static readonly HOLD_THRESHOLD_MS = 180;

	private _onVoicePointerDown(): void {
		const controller = this.voiceSessionController;
		// Only connected sessions support hold-to-talk; when disconnected let the click connect.
		if (!controller.isConnected.get()) {
			return;
		}
		this.voiceInputModeService.setSelectedMode('voice');
		this._voiceHoldGesture = true;
		this._voiceHoldListening = false;
		const win = getWindow(this._voiceCell);
		// Start listening only after the hold threshold, so a quick tap (disconnect) does
		// not briefly flash the listening state.
		this._voiceHoldTimer = win.setTimeout(() => {
			this._voiceHoldTimer = undefined;
			if (controller.isConnected.get()) {
				this._voiceHoldListening = true;
				controller.pttDown('explicit', true);
			}
		}, VoiceInputModeActionViewItem.HOLD_THRESHOLD_MS);
		// End the gesture on release anywhere (in case the pointer leaves the button).
		this._voicePointerUp.value = dom.addDisposableListener(win, dom.EventType.MOUSE_UP, () => this._endVoicePointerHold());
	}

	private _endVoicePointerHold(): void {
		if (!this._voiceHoldGesture) {
			return;
		}
		this._voiceHoldGesture = false;
		this._voicePointerUp.clear();
		if (this._voiceHoldTimer !== undefined) {
			// Released before the threshold → a tap; let the click turn Voice Mode off.
			getWindow(this._voiceCell).clearTimeout(this._voiceHoldTimer);
			this._voiceHoldTimer = undefined;
			this._voiceSuppressClick = false;
		} else if (this._voiceHoldListening) {
			// Held past the threshold → end the turn and send; suppress the trailing click
			// so it does not also disconnect.
			this._voiceHoldListening = false;
			this._voiceSuppressClick = true;
			this.voiceSessionController.pttUp('explicit', true);
		}
	}

	/**
	 * listenButton style: the voice button is a power toggle. Connecting also begins
	 * listening so the user can talk immediately; the separate listen cell then toggles
	 * listening on and off.
	 */
	private _onClickVoicePowerToggle(): void {
		this.voiceInputModeService.setSelectedMode('voice');

		// Mutual exclusion: stop dictation before entering Voice Mode.
		if (this.speechService.hasActiveSpeechToTextSession) {
			this.commandService.executeCommand(DICTATION_STOP_COMMAND_ID);
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

	/** listenButton style: toggle listening on and off via the person-voice cell. */
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

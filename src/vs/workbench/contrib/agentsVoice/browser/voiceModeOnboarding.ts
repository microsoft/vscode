/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { renderFormattedText } from '../../../../base/browser/formattedTextRenderer.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter } from '../../../../base/common/event.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { FileAccess } from '../../../../base/common/network.js';
import { localize } from '../../../../nls.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IVoiceSessionController } from '../../chat/browser/voiceClient/voiceSessionController.js';
import { ChatInputOnboarding, ChatInputOnboardingCard, IChatInputOnboardingContext } from '../../chat/browser/widget/input/chatInputOnboarding.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { AgentsVoiceStorageKeys } from '../common/agentsVoice.js';
import './media/voiceModeOnboarding.css';

/** Setting the banner writes when a voice chip is picked. */
const VOICE_SETTING = 'agents.voice.voice';

/** Where the first link sends anyone who wants to change their mind later. */
const VOICE_SETTINGS_COMMAND = 'agentsVoice.openSettings';

/**
 * Where the second link goes: `voice.md`, the customization file sent to the
 * backend as `voice_instructions`. It shapes what the agent *says back*, which
 * is why the link reads "how it responds" rather than naming the file.
 */
const VOICE_INSTRUCTIONS_COMMAND = 'workbench.action.chat.configureVoiceInstructions';

type VoiceModeOnboardingAction = 'shown' | 'selectVoice' | 'openSettings' | 'openInstructions' | 'close' | 'escape';

type VoiceModeOnboardingActionClassification = {
	action: { classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight'; comment: 'The action taken in the Voice Mode onboarding card.' };
	source: { classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight'; comment: 'Whether the card appeared automatically on first use or was opened manually.' };
	owner: 'meganrogge';
	comment: 'Tracks engagement with the Voice Mode onboarding card.';
};

type VoiceModeOnboardingActionEvent = {
	action: VoiceModeOnboardingAction;
	source: 'automatic' | 'manual';
};

/**
 * The voices Voice Mode actually speaks with (mirrors the `agents.voice.voice`
 * enum). Each one ships a short pre-recorded sample rendered with that exact
 * model voice, so the preview a user hears in the banner is what they get in a
 * real conversation.
 */
interface IVoiceModeVoice {
	readonly id: string;
	readonly label: string;
	/** This voice's waveform texture. See {@link IWave}. */
	readonly signature: readonly IWave[];
}

/**
 * One sine component of a waveform texture. A voice's signature is a handful of
 * these summed together, which is what gives each voice a recognisably
 * different trace rather than four copies of the same ripple.
 */
interface IWave {
	readonly frequency: number;
	readonly amplitude: number;
	readonly speed: number;
	readonly phase: number;
}

const VOICES: readonly IVoiceModeVoice[] = [
	{
		id: 'maya_neutral',
		label: localize('voiceMode.onboarding.voice.maya', "Maya"),
		// Flowing mid-range: even spread, gentle drift.
		signature: [
			{ frequency: 1.0, amplitude: 0.42, speed: 0.42, phase: 0.0 },
			{ frequency: 1.7, amplitude: 0.26, speed: -0.31, phase: 1.1 },
			{ frequency: 2.6, amplitude: 0.19, speed: 0.24, phase: 2.4 },
			{ frequency: 4.1, amplitude: 0.13, speed: -0.18, phase: 0.7 },
		],
	},
	{
		id: 'victoria_neutral',
		label: localize('voiceMode.onboarding.voice.victoria', "Victoria"),
		// Bright and quick: higher frequencies, tighter ripple.
		signature: [
			{ frequency: 1.4, amplitude: 0.38, speed: 0.52, phase: 0.0 },
			{ frequency: 2.3, amplitude: 0.27, speed: -0.38, phase: 1.1 },
			{ frequency: 3.6, amplitude: 0.21, speed: 0.30, phase: 2.4 },
			{ frequency: 5.2, amplitude: 0.14, speed: -0.22, phase: 0.7 },
		],
	},
	{
		id: 'kevin_neutral',
		label: localize('voiceMode.onboarding.voice.kevin', "Kevin"),
		// Low and broad: long swells with little high-frequency detail.
		signature: [
			{ frequency: 0.7, amplitude: 0.48, speed: 0.30, phase: 0.4 },
			{ frequency: 1.2, amplitude: 0.28, speed: -0.22, phase: 1.7 },
			{ frequency: 2.0, amplitude: 0.16, speed: 0.18, phase: 0.9 },
			{ frequency: 3.1, amplitude: 0.09, speed: -0.14, phase: 2.2 },
		],
	},
	{
		id: 'daniel_neutral',
		label: localize('voiceMode.onboarding.voice.daniel', "Daniel"),
		// Steady and measured: slow drift, calm regular crests.
		signature: [
			{ frequency: 0.9, amplitude: 0.44, speed: 0.24, phase: 1.3 },
			{ frequency: 1.5, amplitude: 0.30, speed: -0.18, phase: 0.2 },
			{ frequency: 2.4, amplitude: 0.14, speed: 0.15, phase: 2.0 },
			{ frequency: 3.4, amplitude: 0.10, speed: -0.12, phase: 1.5 },
		],
	},
];

/**
 * The trace before anyone has chosen: the four signatures averaged component by
 * component, so it belongs to no voice in particular rather than quietly being
 * the first one in the list. The declared phases all sit within a couple of
 * radians of each other, so a plain mean lands between them rather than on the
 * far side of the circle.
 */
const RESTING_SIGNATURE: readonly IWave[] = VOICES[0].signature.map((_, index) => {
	const components = VOICES.map(voice => voice.signature[index]);
	const mean = (pick: (wave: IWave) => number) =>
		components.reduce((sum, wave) => sum + pick(wave), 0) / components.length;
	return {
		frequency: mean(wave => wave.frequency),
		amplitude: mean(wave => wave.amplitude),
		speed: mean(wave => wave.speed),
		phase: mean(wave => wave.phase),
	};
});

/**
 * How long the dominant component takes to complete one cycle, matching the
 * `chat-voice-input-mode-wave` keyframe the toolbar waveform idles on. Same
 * instrument, same tempo.
 */
const IDLE_CYCLE_SECONDS = 2.6;

/**
 * Scales every declared `speed` so the resting trace cycles at
 * {@link IDLE_CYCLE_SECONDS}. The signatures are written as a *relative* set -
 * component 1 drifts against component 0, and so on - which makes them
 * readable, but taken literally the dominant component turns once every ~17
 * seconds. That is roughly 1px of movement per bar per second: technically
 * animating, visibly frozen. Derived rather than hardcoded so editing a
 * signature cannot silently put the trace back to sleep.
 */
const WAVE_TEMPO = (2 * Math.PI) / IDLE_CYCLE_SECONDS / Math.abs(RESTING_SIGNATURE[0].speed);

// --- Waveform -----------------------------------------------------------

/** Amplitude with nothing playing: present, but clearly at rest. */
const IDLE_GAIN = 0.55;
/** Extra amplitude at peak loudness while a voice sample plays. */
const SPEAKING_GAIN = 0.45;
/** How quickly the band chases the audio. Low and slow reads as smooth. */
const LEVEL_EASING = 0.08;
/** How quickly the trace morphs from one voice's signature to another. */
const SIGNATURE_EASING = 0.06;
/**
 * Bar metrics, taken from Voice Mode's own waveform in `voiceInputMode.css`,
 * which states the rule directly: *bars are strokes, not shapes* - they carry
 * the same visual weight as the codicon glyphs beside them so the waveform
 * never reads as bolder than the mic. Same 1px stroke and 2px gap here, just
 * many more of them.
 */
const BAR_WIDTH = 1;
const BAR_GAP = 2;
/** Shortest a bar ever gets: a dot, so a resting bar keeps its round cap. */
const BAR_MIN = 1;

/** A signature being eased towards another, one component at a time. */
type MutableWave = { frequency: number; amplitude: number; speed: number; phase: number };

function cloneSignature(signature: readonly IWave[]): MutableWave[] {
	return signature.map(wave => ({ ...wave }));
}

/**
 * Ease a signature towards a target in place. Morphing the numbers rather than
 * swapping them is what makes a voice change read as the trace *becoming* the
 * new voice instead of cutting to it.
 *
 * `phase` eases with the rest: it is a static offset per component (the motion
 * comes from `time * speed`), so leaving it behind would strand every voice on
 * whichever phases the trace happened to start with. Every declared phase sits
 * within a radian or two of its neighbours, well inside half a turn, so easing
 * straight to the target is also the shortest way round the circle.
 */
function easeSignature(current: MutableWave[], target: readonly IWave[]): void {
	for (let i = 0; i < current.length && i < target.length; i++) {
		current[i].frequency += (target[i].frequency - current[i].frequency) * SIGNATURE_EASING;
		current[i].amplitude += (target[i].amplitude - current[i].amplitude) * SIGNATURE_EASING;
		current[i].speed += (target[i].speed - current[i].speed) * SIGNATURE_EASING;
		current[i].phase += (target[i].phase - current[i].phase) * SIGNATURE_EASING;
	}
}

/**
 * Draw the row of bars. Heights are symmetric about the centre line and follow
 * the same centre-peak silhouette as the toolbar waveform, so the two read as
 * the same instrument at different sizes.
 */
function drawBars(
	context: CanvasRenderingContext2D,
	width: number, height: number,
	waves: readonly MutableWave[], time: number, gain: number,
): void {
	const pitch = BAR_WIDTH + BAR_GAP;
	const count = Math.max(1, Math.floor(width / pitch));
	// Centre the row: whatever does not divide evenly becomes even margins
	// rather than a ragged right edge.
	const inset = (width - (count * pitch - BAR_GAP)) / 2;
	const centerY = height / 2;
	const maxHalf = height / 2;

	for (let index = 0; index < count; index++) {
		const position = count > 1 ? index / (count - 1) : 0;
		const amount = bandFraction(position, time, waves) * gain;
		const half = Math.max(BAR_MIN / 2, Math.min(maxHalf, amount * maxHalf));
		context.beginPath();
		context.roundRect(inset + index * pitch, centerY - half, BAR_WIDTH, half * 2, BAR_WIDTH / 2);
		context.fill();
	}
}

/**
 * Half-height of the band at `position` (0..1 across the strip), as a fraction
 * of the available half-height.
 *
 * Each component contributes an already-positive, cusp-free curve. Summing raw
 * sines and taking their magnitude would put a sharp corner at every zero
 * crossing - that is what makes an ASCII waveform look like it is snapping up
 * and down rather than flowing.
 */
function bandFraction(position: number, time: number, waves: readonly MutableWave[]): number {
	let amplitude = 0;
	let total = 0;
	for (const wave of waves) {
		const phase = position * wave.frequency * Math.PI * 2 + time * wave.speed * WAVE_TEMPO + wave.phase;
		amplitude += (0.5 + 0.5 * Math.sin(phase)) * wave.amplitude;
		total += wave.amplitude;
	}
	if (total === 0) {
		return 0;
	}
	// Centre-peak silhouette, matching the toolbar waveform: tallest in the
	// middle, tapering to the ends, so the row reads as one instrument rather
	// than a strip cut off at both edges.
	const taper = Math.sin(Math.PI * Math.min(1, Math.max(0, position)));
	return (amplitude / total) * (0.35 + 0.65 * taper);
}

/** What the animator needs to know each frame, supplied by the banner. */
interface IWaveformSource {
	/** Loudness of the voice being previewed, `0` when silent. */
	getLevel(): number;
	/** The signature the trace should be easing towards. */
	getSignature(): readonly IWave[];
}

/**
 * Draws the animated waveform. Owns a single canvas, a `ResizeObserver` and an
 * animation-frame loop; disposing stops both. Honors reduced motion by painting
 * a single static frame instead of animating.
 */
class VoiceModeOnboardingAnimator extends Disposable {

	private readonly context: CanvasRenderingContext2D;
	private readonly animationFrame = this._register(new MutableDisposable<IDisposable>());
	private width = 0;
	private height = 0;
	private running = false;
	private level = 0;
	private readonly waves: MutableWave[];
	/**
	 * The stroke colour, taken from the canvas's own computed `color` so CSS
	 * owns the tier and theme overrides work for free - the same `currentColor`
	 * arrangement the toolbar waveform uses. Cached rather than read per frame:
	 * `getComputedStyle` inside the animation loop forces a style recalculation
	 * on every tick.
	 */
	private stroke = '';

	constructor(
		private readonly canvas: HTMLCanvasElement,
		private readonly container: HTMLElement,
		private readonly source: IWaveformSource,
		@IThemeService private readonly themeService: IThemeService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
	) {
		super();

		const context = canvas.getContext('2d');
		if (!context) {
			throw new Error('Failed to create the Voice Mode onboarding canvas context');
		}
		this.context = context;
		this.waves = cloneSignature(this.source.getSignature());

		const targetWindow = dom.getWindow(container);
		const observer = new targetWindow.ResizeObserver(() => this.resize());
		observer.observe(container);
		this._register(toDisposable(() => observer.disconnect()));

		this._register(this.themeService.onDidColorThemeChange(() => {
			this.readStroke();
			this.draw(targetWindow.performance.now());
		}));
		this._register(this.accessibilityService.onDidChangeReducedMotion(() => this.updateMotion()));
		this._register(toDisposable(() => this.stop()));

		this.readStroke();
		this.resize();
		this.updateMotion();
	}

	private readStroke(): void {
		this.stroke = dom.getWindow(this.canvas).getComputedStyle(this.canvas).color;
	}

	private updateMotion(): void {
		if (this.accessibilityService.isMotionReduced()) {
			this.stop();
			this.draw(dom.getWindow(this.container).performance.now());
		} else {
			this.start();
		}
	}

	private start(): void {
		if (this.running) {
			return;
		}
		this.running = true;
		const targetWindow = dom.getWindow(this.container);
		const tick = (time: number) => {
			if (!this.running) {
				return;
			}
			this.draw(time);
			this.animationFrame.value = dom.scheduleAtNextAnimationFrame(targetWindow, () => tick(targetWindow.performance.now()));
		};
		this.animationFrame.value = dom.scheduleAtNextAnimationFrame(targetWindow, () => tick(targetWindow.performance.now()));
	}

	private stop(): void {
		this.running = false;
		this.animationFrame.clear();
	}

	private resize(): void {
		const targetWindow = dom.getWindow(this.container);
		const devicePixelRatio = targetWindow.devicePixelRatio || 1;
		this.width = this.container.offsetWidth;
		this.height = this.container.offsetHeight;
		if (!this.width || !this.height) {
			return;
		}
		this.canvas.width = this.width * devicePixelRatio;
		this.canvas.height = this.height * devicePixelRatio;
		this.context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
		this.draw(targetWindow.performance.now());
	}

	private draw(timestamp: number): void {
		if (!this.width || !this.height) {
			return;
		}

		const time = timestamp * 0.001;

		// Idle, the waveform breathes gently; while a voice plays it swells with
		// that voice. Both the level and the shape are eased so the ribbon glides
		// rather than snapping between frames.
		this.level += (this.source.getLevel() - this.level) * LEVEL_EASING;
		easeSignature(this.waves, this.source.getSignature());
		const gain = IDLE_GAIN + this.level * SPEAKING_GAIN;

		this.context.clearRect(0, 0, this.width, this.height);
		this.context.fillStyle = this.stroke;

		drawBars(this.context, this.width, this.height, this.waves, time, gain);
	}

}

// --- Banner -------------------------------------------------------------

/**
 * Plays the pre-recorded voice samples that ship next to this file. One element
 * is reused for every preview so picking a second voice cuts the first one off.
 */
class VoiceSamplePlayer extends Disposable {

	private readonly playback = this._register(new MutableDisposable<DisposableStore>());

	/** Reused across previews: a media element source can only be created once
	 * per element, so the element, context and analyser are all long-lived. */
	private audio: HTMLAudioElement | undefined;
	private analyser: AnalyserNode | undefined;
	private levels: Uint8Array<ArrayBuffer> | undefined;

	private readonly _onDidChangePlayingVoice = this._register(new Emitter<string | undefined>());
	/** Fires with the voice currently being heard, or `undefined` once it stops. */
	readonly onDidChangePlayingVoice = this._onDidChangePlayingVoice.event;

	private _playingVoice: string | undefined;
	get playingVoice(): string | undefined { return this._playingVoice; }

	constructor(
		private readonly element: HTMLElement,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this._register(toDisposable(() => this.stop()));
	}

	/**
	 * Current loudness of the sample being played, `0` when silent. The waveform
	 * reads this so it moves to the voice the user is actually hearing.
	 */
	getLevel(): number {
		if (!this.analyser || !this.levels || !this._playingVoice) {
			return 0;
		}
		this.analyser.getByteTimeDomainData(this.levels);
		let sum = 0;
		for (const sample of this.levels) {
			const centered = (sample - 128) / 128;
			sum += centered * centered;
		}
		// RMS, scaled so ordinary speech lands near 1 rather than a fraction.
		return Math.min(1, Math.sqrt(sum / this.levels.length) * 3.2);
	}

	play(voiceId: string): void {
		this.stop();
		try {
			const audio = this.ensureAudio();
			audio.src = FileAccess.asBrowserUri(`vs/workbench/contrib/agentsVoice/browser/media/${voiceId}.mp3`).toString(true);

			const store = new DisposableStore();
			store.add(dom.addDisposableListener(audio, 'ended', () => this.stop()));
			store.add(dom.addDisposableListener(audio, 'error', () => this.stop()));
			store.add(toDisposable(() => audio.pause()));
			this.playback.value = store;

			this.setPlayingVoice(voiceId);
			audio.play().catch(error => {
				this.logService.trace(`[voice] Voice Mode onboarding preview failed: ${error}`);
				this.stop();
			});
		} catch (error) {
			this.logService.trace(`[voice] Voice Mode onboarding preview unavailable: ${error}`);
			this.stop();
		}
	}

	/**
	 * Build the audio element and, best-effort, the analyser graph feeding the
	 * waveform. Analysis is a nicety: if the Web Audio graph cannot be created
	 * the sample still plays, the waveform just keeps its idle motion.
	 */
	private ensureAudio(): HTMLAudioElement {
		if (this.audio) {
			return this.audio;
		}

		const targetWindow = dom.getWindow(this.element);
		const audio = new targetWindow.Audio();
		this.audio = audio;
		this._register(toDisposable(() => {
			audio.pause();
			audio.src = '';
		}));

		try {
			const context = new targetWindow.AudioContext();
			this._register(toDisposable(() => void context.close().catch(() => { /* already closing */ })));
			const analyser = context.createAnalyser();
			analyser.fftSize = 256;
			context.createMediaElementSource(audio).connect(analyser);
			analyser.connect(context.destination);
			this.analyser = analyser;
			this.levels = new Uint8Array(analyser.fftSize);
		} catch (error) {
			this.logService.trace(`[voice] Voice Mode onboarding analyser unavailable: ${error}`);
		}

		return audio;
	}

	stop(): void {
		this.playback.clear();
		this.setPlayingVoice(undefined);
	}

	private setPlayingVoice(voiceId: string | undefined): void {
		if (this._playingVoice === voiceId) {
			return;
		}
		this._playingVoice = voiceId;
		this._onDidChangePlayingVoice.fire(voiceId);
	}
}

export interface IVoiceModeOnboardingBannerOptions {
	/** The element the banner attaches itself to. */
	readonly container: HTMLElement;
	readonly onDismiss: () => void;
	readonly source: 'automatic' | 'manual';
}

/**
 * The first-run Voice Mode card: what Voice Mode is, that it costs nothing, the
 * voices it can speak with, and the mic as the alternative for anyone who would
 * rather not be spoken to at all.
 *
 * Clicking a voice both plays it and adopts it, so there is nothing to confirm
 * afterwards. The leading icon carries that story: play before the click,
 * animating bars while it speaks, then a check once it is yours.
 */
export class VoiceModeOnboardingBanner extends Disposable {

	readonly domNode: HTMLElement;

	private readonly card: ChatInputOnboardingCard;
	private readonly player: VoiceSamplePlayer;
	private readonly options: IVoiceModeOnboardingBannerOptions;

	private readonly voiceElements = new Map<string, HTMLElement>();

	/** The voice being auditioned, and the one that will be committed. */
	private selectedVoice: IVoiceModeVoice | undefined;

	constructor(
		options: IVoiceModeOnboardingBannerOptions,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IVoiceSessionController private readonly voiceSessionController: IVoiceSessionController,
	) {
		super();

		this.options = options;

		this.card = this._register(new ChatInputOnboardingCard({
			container: options.container,
			className: 'voice-mode-onboarding-banner',
			ariaLabel: localize('voiceMode.onboarding.region', "Voice Mode introduction"),
			onEscape: () => {
				this.logAction('escape');
				this.options.onDismiss();
			},
		}));
		this.domNode = this.card.domNode;
		this.player = this._register(instantiationService.createInstance(VoiceSamplePlayer, this.domNode));
		this._register(this.player.onDidChangePlayingVoice(voiceId => this.updatePlaying(voiceId)));

		// Voice Mode is live, but it must not be listening while the user is still
		// reading and picking a voice. A hold is used rather than `stopListening`
		// because the card goes up on `isConnecting`, before the session exists:
		// `stopListening` no-ops until connected, and hands-free would then open
		// the microphone on `session_init` with the card still on screen.
		// Released in `finish()`, which is the only way out of the card.
		this.voiceSessionController.setAutoListenHeld(true);
		this._register(toDisposable(() => this.voiceSessionController.setAutoListenHeld(false)));

		const copy = dom.append(this.domNode, dom.$('.voice-mode-onboarding-copy'));
		const title = dom.append(copy, dom.$('.voice-mode-onboarding-title'));
		title.textContent = localize('voiceMode.onboarding.title', "Welcome to Voice Mode");
		this.renderDescription(copy);
		this.renderListeningNotice(copy);

		this.renderSharedWaveform(instantiationService);

		const actions = dom.append(this.domNode, dom.$('.voice-mode-onboarding-actions'));
		this.renderVoices(actions);
		this.renderClose();
		this.logAction('shown');

		this.focusForScreenReader();
		this._register(this.accessibilityService.onDidChangeScreenReaderOptimized(() => this.focusForScreenReader()));
	}

	/**
	 * The signature the shared trace should be showing: the selected voice's, or
	 * {@link RESTING_SIGNATURE} before anything has been chosen.
	 */
	private currentSignature(): readonly IWave[] {
		return this.selectedVoice?.signature ?? RESTING_SIGNATURE;
	}

	/** The single full-width trace the whole card shares. */
	private renderSharedWaveform(instantiationService: IInstantiationService): void {
		const wave = dom.append(this.domNode, dom.$('.voice-mode-onboarding-wave'));
		const canvas = dom.append(wave, dom.$('canvas.voice-mode-onboarding-canvas')) as HTMLCanvasElement;
		canvas.setAttribute('aria-hidden', 'true');
		this._register(instantiationService.createInstance(VoiceModeOnboardingAnimator, canvas, wave, {
			getLevel: () => this.player.getLevel(),
			getSignature: () => this.currentSignature(),
		}));
	}

	/**
	 * The four voices as real buttons - border, hover lift, pressed feedback -
	 * because bare text gave no sign it could be clicked at all.
	 */
	private renderVoices(container: HTMLElement): void {
		const group = dom.append(container, dom.$('.voice-mode-onboarding-voices'));
		group.setAttribute('role', 'radiogroup');
		group.setAttribute('aria-label', localize('voiceMode.onboarding.voices', "Voice Mode voice"));

		for (const voice of VOICES) {
			const option = dom.append(group, dom.$('.voice-mode-onboarding-voice'));
			option.setAttribute('role', 'radio');
			// Spells out both halves of what a click does: it speaks, and it sticks.
			option.setAttribute('aria-label', localize('voiceMode.onboarding.voice.ariaLabel', "{0}. Hear this voice and use it for every conversation.", voice.label));

			// The icon is the affordance: it says "this will speak" before the
			// click, and "this is yours" after it.
			const icon = dom.append(option, dom.$('span.voice-mode-onboarding-voice-icon'));
			dom.append(icon, dom.$(`span.codicon.codicon-${Codicon.play.id}.voice-mode-onboarding-voice-idle`)).setAttribute('aria-hidden', 'true');
			dom.append(icon, dom.$(`span.codicon.codicon-${Codicon.checkCompact.id}.voice-mode-onboarding-voice-chosen`)).setAttribute('aria-hidden', 'true');
			const bars = dom.append(icon, dom.$('span.voice-mode-onboarding-voice-bars'));
			bars.setAttribute('aria-hidden', 'true');
			for (let bar = 0; bar < 3; bar++) {
				dom.append(bars, dom.$('span.voice-mode-onboarding-voice-bar'));
			}

			const label = dom.append(option, dom.$('span.voice-mode-onboarding-voice-label'));
			label.textContent = voice.label;
			this.voiceElements.set(voice.id, option);

			this._register(dom.addDisposableListener(option, dom.EventType.CLICK, () => this.selectVoice(voice)));
			this._register(dom.addDisposableListener(option, dom.EventType.KEY_DOWN, event => this.handleOptionKey(event, voice)));
		}

		this.updateSelection();
	}

	// --- Shared behaviour ---

	private handleOptionKey(event: KeyboardEvent, voice: IVoiceModeVoice): void {
		const keyboardEvent = new StandardKeyboardEvent(event);
		if (keyboardEvent.equals(KeyCode.Enter) || keyboardEvent.equals(KeyCode.Space)) {
			keyboardEvent.preventDefault();
			this.selectVoice(voice);
			return;
		}

		// A radiogroup is a single tab stop: the arrow keys move between the
		// options (selecting as they go, as a radio group should) rather than Tab
		// walking through every one of them.
		const forward = keyboardEvent.equals(KeyCode.RightArrow) || keyboardEvent.equals(KeyCode.DownArrow);
		const backward = keyboardEvent.equals(KeyCode.LeftArrow) || keyboardEvent.equals(KeyCode.UpArrow);
		if (forward || backward) {
			keyboardEvent.preventDefault();
			const index = VOICES.indexOf(voice);
			const next = VOICES[(index + (forward ? 1 : VOICES.length - 1)) % VOICES.length];
			this.selectVoice(next);
			this.voiceElements.get(next.id)?.focus();
		}
	}

	/**
	 * One short paragraph: what Voice Mode does, and the two places to change
	 * your mind - the settings that control it, and the customization file that
	 * shapes what it says back.
	 *
	 * `[[...]]` marks each clause that becomes a link, so translators can place
	 * them naturally in the sentence instead of receiving fixed phrases
	 * concatenated onto the end. `renderFormattedText` numbers them in source
	 * order and hands the index to the callback.
	 */
	private renderDescription(container: HTMLElement): void {
		const description = dom.append(container, dom.$('.voice-mode-onboarding-description'));
		const text = localize({
			key: 'voiceMode.onboarding.description',
			comment: [
				'Preserve the double square brackets: they mark the two pieces of text that become links.',
				'The first link opens Voice Mode settings; the second opens a file for customizing how the agent speaks.',
			],
		}, "Your agent can speak back to you, free of charge. Adjust [[settings]] or [[how it responds]] anytime.");

		const commands = [VOICE_SETTINGS_COMMAND, VOICE_INSTRUCTIONS_COMMAND];
		dom.append(description, renderFormattedText(text, {
			actionHandler: {
				callback: index => {
					const command = commands[Number(index)];
					if (command) {
						this.logAction(index === '0' ? 'openSettings' : 'openInstructions');
						this.commandService.executeCommand(command)
							.catch(error => this.logService.error(`[voice] Failed to run ${command}: ${error}`));
					}
				},
				disposables: this._store,
			},
		}, dom.$('span')));

		// `renderFormattedText` gives each anchor a click listener and nothing
		// else, so make them real controls: reachable by Tab and operable by
		// Enter or Space like any other button. The renderer owns this DOM, so a
		// selector is the only handle on it - same as the empty-editor hint.
		// eslint-disable-next-line no-restricted-syntax
		for (const link of description.querySelectorAll('a')) {
			link.tabIndex = 0;
			link.setAttribute('role', 'button');
			this._register(dom.addDisposableListener(link, dom.EventType.KEY_DOWN, event => {
				const keyboardEvent = new StandardKeyboardEvent(event);
				if (keyboardEvent.equals(KeyCode.Enter) || keyboardEvent.equals(KeyCode.Space)) {
					keyboardEvent.preventDefault();
					link.click();
				}
			}));
		}
	}

	private renderListeningNotice(container: HTMLElement): void {
		const notice = dom.append(container, dom.$('.voice-mode-onboarding-listening-notice'));
		const icon = dom.append(notice, dom.$(`span.codicon.codicon-${Codicon.mic.id}`));
		icon.setAttribute('aria-hidden', 'true');
		const text = dom.append(notice, dom.$('span'));
		text.textContent = localize('voiceMode.onboarding.closeWhenReady', "Close this when you're ready to speak.");
	}

	/**
	 * Dismissal is always available and never gated: a disabled close would trap
	 * someone in the card. Choosing a voice already commits it, so this is only
	 * ever "I am done here" - and closing is what hands the session back.
	 */
	private renderClose(): void {
		this.card.addAction({
			className: 'voice-mode-onboarding-close',
			ariaLabel: localize('voiceMode.onboarding.close', "Close the introduction and continue to Voice Mode"),
			icon: Codicon.checkCompact,
			onActivate: () => this.finish(),
		});
	}

	private focusForScreenReader(): void {
		if (this.accessibilityService.isScreenReaderOptimized()) {
			this.domNode.tabIndex = -1;
			this.domNode.focus();
		}
	}

	private selectVoice(voice: IVoiceModeVoice): void {
		this.logAction('selectVoice');
		this.selectedVoice = voice;
		this.updateSelection();
		this.player.play(voice.id);
		status(localize('voiceMode.onboarding.voice.selected', "{0} selected.", voice.label));
		this.configurationService.updateValue(VOICE_SETTING, voice.id, ConfigurationTarget.USER)
			.catch(error => this.logService.error(`[voice] Failed to persist the Voice Mode voice: ${error}`));
	}

	private updateSelection(): void {
		for (const [id, element] of this.voiceElements) {
			const selected = id === this.selectedVoice?.id;
			element.classList.toggle('selected', selected);
			element.setAttribute('aria-checked', String(selected));
		}
		this.updateTabStop();
	}

	/**
	 * Keeps a single tab stop on the group: the chosen voice, or the first one
	 * when nothing has been chosen yet.
	 */
	private updateTabStop(): void {
		let first = true;
		for (const [id, element] of this.voiceElements) {
			const isTabStop = this.selectedVoice === undefined ? first : id === this.selectedVoice.id;
			element.tabIndex = isTabStop ? 0 : -1;
			first = false;
		}
	}

	private updatePlaying(playingVoice: string | undefined): void {
		for (const [id, element] of this.voiceElements) {
			element.classList.toggle('playing', id === playingVoice);
		}
		this.domNode.classList.toggle('playing', playingVoice !== undefined);
	}

	/**
	 * Close the introduction and hand the session back to the user. Voice Mode
	 * stays connected either way; hands-free starts listening immediately, while
	 * push-to-talk waits for the mic button so nobody is recorded unexpectedly.
	 */
	private finish(): void {
		this.player.stop();
		this.logAction('close');

		// Releasing the hold is what hands the session back: hands-free picks up
		// and starts listening, push-to-talk stays quiet until the mic button.
		// The release itself runs on dispose, below.
		status(this.configurationService.getValue<boolean>('agents.voice.handsFree') === true
			? localize('voiceMode.onboarding.listening', "Voice Mode is listening.")
			: localize('voiceMode.onboarding.ready', "Voice Mode is ready. Press the mic button to start talking."));

		this.options.onDismiss();
	}

	private logAction(action: VoiceModeOnboardingAction): void {
		this.telemetryService.publicLog2<VoiceModeOnboardingActionEvent, VoiceModeOnboardingActionClassification>(
			'voiceModeOnboarding.action',
			{ action, source: this.options.source }
		);
	}
}

export const IVoiceModeOnboardingService = createDecorator<IVoiceModeOnboardingService>('voiceModeOnboardingService');

export interface IVoiceModeOnboardingService {
	readonly _serviceBrand: undefined;

	/**
	 * Register a container that can host the banner (a chat input). The most
	 * recently focused host wins when the banner is shown.
	 *
	 * @param container the element the banner is appended to.
	 * @param focusRoot the element whose focus marks this host as the active one
	 * (typically the chat input part the container lives in).
	 * @param focus hands focus back to this host's input when the banner closes.
	 * Passed explicitly because `focusRoot` is a container, not a control - the
	 * host knows where its caret belongs and this service does not.
	 */
	registerHost(container: HTMLElement, focusRoot: HTMLElement, focus: () => void): IDisposable;

	/**
	 * Show the introduction if the user has never seen it. Marks it as seen on
	 * the first successful show, so it never appears again.
	 */
	showIfNeeded(): void;

	/** Show the introduction again regardless of whether it has been seen. */
	show(): boolean;
}

export class VoiceModeOnboardingService extends Disposable implements IVoiceModeOnboardingService {

	declare readonly _serviceBrand: undefined;

	private readonly onboarding: ChatInputOnboarding;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		this.onboarding = this._register(this.instantiationService.createInstance(ChatInputOnboarding, {
			storageKey: AgentsVoiceStorageKeys.IntroBannerShown,
			hostClass: 'has-voice-mode-onboarding',
		}));
	}

	registerHost(container: HTMLElement, focusRoot: HTMLElement, focus: () => void): IDisposable {
		return this.onboarding.registerHost(container, focusRoot, focus);
	}

	showIfNeeded(): void {
		this.onboarding.showIfNeeded(context => this.createBanner(context, 'automatic'));
	}

	show(): boolean {
		return this.onboarding.show(context => this.createBanner(context, 'manual'));
	}

	private createBanner(context: IChatInputOnboardingContext, source: 'automatic' | 'manual'): VoiceModeOnboardingBanner {
		return this.instantiationService.createInstance(VoiceModeOnboardingBanner, {
			container: context.container,
			onDismiss: () => context.dismiss(dom.isAncestorOfActiveElement(context.container)),
			source,
		});
	}
}

registerSingleton(IVoiceModeOnboardingService, VoiceModeOnboardingService, InstantiationType.Delayed);

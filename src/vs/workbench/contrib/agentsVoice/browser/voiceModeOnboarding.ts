/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { renderFormattedText } from '../../../../base/browser/formattedTextRenderer.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { SelectBox } from '../../../../base/browser/ui/selectBox/selectBox.js';
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
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { CONFIGURE_VOICE_INSTRUCTIONS_ACTION_ID } from '../../chat/browser/actions/configureVoiceInstructionsAction.js';
import { ChatInputOnboarding, IChatInputOnboardingBanner, IChatInputOnboardingContext, IChatInputOnboardingHostOptions } from '../../chat/browser/widget/input/chatInputOnboarding.js';
import { ChatInputNoticeVariant, ChatInputNoticeWidget } from '../../chat/browser/widget/input/chatInputNoticeWidget.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { defaultSelectBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { asCssVariable, asCssVariableWithDefault, selectBackground, selectListBackground } from '../../../../platform/theme/common/colorRegistry.js';
import { AgentsVoiceStorageKeys } from '../common/agentsVoice.js';
import { buildMicrophoneOptions, IMicrophoneOption, indexOfMicrophone } from '../../chat/browser/speechToText/dictationOnboarding.js';
import './media/voiceModeOnboarding.css';

/** Setting the banner writes when a voice chip is picked. */
const VOICE_SETTING = 'agents.voice.voice';

/** Setting that controls the language Voice Mode speaks. */
const VOICE_LANGUAGE_SETTING = 'agents.voice.language';

/** Where the first link sends anyone who wants to change their mind later. */
const VOICE_SETTINGS_COMMAND = 'agentsVoice.openSettings';

type VoiceModeOnboardingAction = 'shown' | 'selectVoice' | 'previewVoice' | 'selectMicrophone' | 'openSettings' | 'openInstructions' | 'close' | 'escape';

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
	readonly sampleId: string;
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
		id: 'birch_neutral',
		sampleId: 'maya_neutral',
		label: localize('voiceMode.onboarding.voice.birch', "Birch (Default)"),
		// Flowing mid-range: even spread, gentle drift.
		signature: [
			{ frequency: 1.0, amplitude: 0.42, speed: 0.42, phase: 0.0 },
			{ frequency: 1.7, amplitude: 0.26, speed: -0.31, phase: 1.1 },
			{ frequency: 2.6, amplitude: 0.19, speed: 0.24, phase: 2.4 },
			{ frequency: 4.1, amplitude: 0.13, speed: -0.18, phase: 0.7 },
		],
	},
	{
		id: 'harper_neutral',
		sampleId: 'victoria_neutral',
		label: localize('voiceMode.onboarding.voice.harper', "Harper"),
		// Bright and quick: higher frequencies, tighter ripple.
		signature: [
			{ frequency: 1.4, amplitude: 0.38, speed: 0.52, phase: 0.0 },
			{ frequency: 2.3, amplitude: 0.27, speed: -0.38, phase: 1.1 },
			{ frequency: 3.6, amplitude: 0.21, speed: 0.30, phase: 2.4 },
			{ frequency: 5.2, amplitude: 0.14, speed: -0.22, phase: 0.7 },
		],
	},
	{
		id: 'oak_neutral',
		sampleId: 'kevin_neutral',
		label: localize('voiceMode.onboarding.voice.oak', "Oak"),
		// Low and broad: long swells with little high-frequency detail.
		signature: [
			{ frequency: 0.7, amplitude: 0.48, speed: 0.30, phase: 0.4 },
			{ frequency: 1.2, amplitude: 0.28, speed: -0.22, phase: 1.7 },
			{ frequency: 2.0, amplitude: 0.16, speed: 0.18, phase: 0.9 },
			{ frequency: 3.1, amplitude: 0.09, speed: -0.14, phase: 2.2 },
		],
	},
	{
		id: 'junho_neutral',
		sampleId: 'daniel_neutral',
		label: localize('voiceMode.onboarding.voice.junho', "Junho"),
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
 * A language Voice Mode speaks natively, and the single voice its backend uses
 * for that language. Choosing between voices is an English-only affordance, so
 * for these languages the card previews this one voice rather than the four
 * English options.
 */
interface ILocalizedVoice {
	readonly id: string;
	readonly label: string;
}

const LOCALIZED_VOICES: Readonly<Record<string, ILocalizedVoice>> = {
	de: { id: 'de_marc_neutral', label: localize('voiceMode.onboarding.voice.marc', "Marc") },
	es: { id: 'es-ES_maria_neutral', label: localize('voiceMode.onboarding.voice.maria', "Maria") },
	fr: { id: 'fr_david_neutral', label: localize('voiceMode.onboarding.voice.david', "David") },
	it: { id: 'it_eva_neutral', label: localize('voiceMode.onboarding.voice.eva', "Eva") },
	ja: { id: 'ja_aruha_neutral', label: localize('voiceMode.onboarding.voice.aruha', "Aruha") },
	ko: { id: 'ko_jiyon_neutral', label: localize('voiceMode.onboarding.voice.jiyon', "Jiyon") },
	pt: { id: 'pt-BR_gil_neutral', label: localize('voiceMode.onboarding.voice.gil', "Gil") },
	zh: { id: 'zh_wuzhi_neutral', label: localize('voiceMode.onboarding.voice.wuzhi', "Wuzhi") },
};

/**
 * The native voice for a spoken language, or `undefined` when the language has
 * no native voice and the card should fall back to the English voice chooser.
 */
function localizedVoiceForLanguage(language: string): ILocalizedVoice | undefined {
	try {
		const canonical = Intl.getCanonicalLocales(language.trim())[0];
		const base = canonical?.split('-')[0].toLowerCase();
		return base ? LOCALIZED_VOICES[base] : undefined;
	} catch {
		return undefined;
	}
}

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
const IDLE_GAIN = 0.5;
/**
 * Extra amplitude at peak loudness. Matched to the dictation card's waveform so
 * the trace clearly swells with the voice being previewed rather than only
 * nudging - the card's job is to let you hear (and see) each voice, and a trace
 * that answers the sample reads as responding to it.
 */
const SPEAKING_GAIN = 0.45;
/**
 * How much of the travelling motion is always present, versus driven by the
 * sample. At rest the trace drifts slowly - alive, not frozen - and it flows in
 * earnest only while a voice plays, so the movement itself reads as a response to
 * the voice you just picked rather than idle decoration.
 */
const IDLE_MOTION = 0.2;
/** Additional travelling speed at peak loudness, on top of {@link IDLE_MOTION}. */
const SPEAKING_MOTION = 0.8;
/**
 * How quickly the band chases the audio, per {@link REFERENCE_FRAME_SECONDS}.
 * Low and slow reads as smooth.
 */
const LEVEL_EASING = 0.08;
/**
 * How quickly the trace morphs from one voice's signature to another, per
 * {@link REFERENCE_FRAME_SECONDS}.
 */
const SIGNATURE_EASING = 0.06;
/**
 * The frame duration the eased constants above are tuned against (60fps). Easing
 * and the phase advance are scaled by the real elapsed time each frame so the
 * motion runs at the same real-time pace whether frames arrive on time or stutter
 * - which they do while a sample plays and the per-frame analyser read competes
 * for the main thread. Scaling by real time (rather than a fixed per-frame step)
 * is what keeps the trace moving at full speed under that load instead of stalling.
 */
const REFERENCE_FRAME_SECONDS = 1 / 60;
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

/** A signature component with an incrementally accumulated animation phase. */
type MutableWave = { frequency: number; amplitude: number; speed: number; phase: number; oscillation: number };

function cloneSignature(signature: readonly IWave[]): MutableWave[] {
	return signature.map(wave => ({ ...wave, oscillation: 0 }));
}

/**
 * Convert a per-{@link REFERENCE_FRAME_SECONDS} easing constant into the fraction
 * to ease by across `dt` seconds, so the morph settles at the same real-time rate
 * regardless of frame rate. Reduces to the raw constant when `dt` is exactly one
 * reference frame.
 */
function easingFactor(perFrameEasing: number, dt: number): number {
	return 1 - Math.pow(1 - perFrameEasing, dt / REFERENCE_FRAME_SECONDS);
}

/**
 * Ease a signature towards a target in place. Morphing the numbers rather than
 * swapping them is what makes a voice change read as the trace *becoming* the
 * new voice instead of cutting to it.
 *
 * `phase` eases with the rest: it is a static offset per component (the motion
 * comes from the accumulated `oscillation`), so leaving it behind would strand
 * every voice on whichever phases the trace happened to start with. Every declared
 * phase sits within a radian or two of its neighbours, well inside half a turn, so
 * easing straight to the target is also the shortest way round the circle.
 *
 * `oscillation` is deliberately left untouched: it is where the component is in its
 * cycle, not part of the target texture, so it keeps flowing across the morph.
 */
function easeSignature(current: MutableWave[], target: readonly IWave[], factor: number): void {
	for (let i = 0; i < current.length && i < target.length; i++) {
		current[i].frequency += (target[i].frequency - current[i].frequency) * factor;
		current[i].amplitude += (target[i].amplitude - current[i].amplitude) * factor;
		current[i].speed += (target[i].speed - current[i].speed) * factor;
		current[i].phase += (target[i].phase - current[i].phase) * factor;
	}
}

/**
 * Advance each component's accumulated animation phase by the current speed over
 * `dt` seconds, wrapping to keep it bounded over long sessions. Because this only
 * ever adds to `oscillation`, changing `speed` mid-morph bends the motion smoothly
 * instead of teleporting it.
 */
function advanceOscillation(waves: readonly MutableWave[], dt: number): void {
	const tau = 2 * Math.PI;
	for (const wave of waves) {
		wave.oscillation = (wave.oscillation + wave.speed * WAVE_TEMPO * dt) % tau;
	}
}

/**
 * Draw the row of bars. Heights are symmetric about the centre line and follow
 * a centre-peak silhouette so the trace reads as one instrument rather than a
 * strip of unrelated levels.
 */
function drawBars(
	context: CanvasRenderingContext2D,
	width: number, height: number,
	waves: readonly MutableWave[], gain: number,
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
		const amount = bandFraction(position, waves) * gain;
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
function bandFraction(position: number, waves: readonly MutableWave[]): number {
	let amplitude = 0;
	let total = 0;
	for (const wave of waves) {
		const phase = position * wave.frequency * Math.PI * 2 + wave.oscillation + wave.phase;
		amplitude += (0.5 + 0.5 * Math.sin(phase)) * wave.amplitude;
		total += wave.amplitude;
	}
	if (total === 0) {
		return 0;
	}
	// Centre-peak silhouette: tallest in the middle and tapering to the ends, so
	// the row reads as one instrument rather than a strip cut off at both edges.
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
	private suspended = false;
	private level = 0;
	/** Timestamp of the previous frame, for the elapsed-time each draw eases over. */
	private lastTimestamp: number | undefined;
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
		if (this.suspended || this.accessibilityService.isMotionReduced()) {
			this.stop();
			this.draw(dom.getWindow(this.container).performance.now());
		} else {
			this.start();
		}
	}

	/**
	 * Pause while the card is put away for higher-precedence content, so an
	 * invisible introduction is not still painting every frame.
	 */
	setSuspended(suspended: boolean): void {
		if (this.suspended === suspended) {
			return;
		}
		this.suspended = suspended;
		this.updateMotion();
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

		// Real time elapsed since the previous frame. Both the easing and the phase
		// advance scale by this, so the trace keeps its real-time speed whether
		// frames arrive at 60fps or drop while a sample plays - rather than slowing
		// down under the extra load. A big gap (a hitch, or a backgrounded tab that
		// paused the loop) simply advances the trace to where it should be: the
		// phase is periodic and the easing factor stays bounded, so there is no
		// lurch to guard against.
		const dt = this.lastTimestamp === undefined
			? 0
			: Math.max(0, (timestamp - this.lastTimestamp) * 0.001);
		this.lastTimestamp = timestamp;

		// Idle, the waveform drifts gently; while a voice plays it flows and swells
		// with that voice. Both the level and the shape are eased so the ribbon
		// glides rather than snapping between frames.
		this.level += (this.source.getLevel() - this.level) * easingFactor(LEVEL_EASING, dt);
		easeSignature(this.waves, this.source.getSignature(), easingFactor(SIGNATURE_EASING, dt));
		// Drive the travelling motion from the sample: nearly still at rest, flowing
		// while a voice plays, so the movement reads as a response to the previewed
		// voice rather than constant idle motion.
		advanceOscillation(this.waves, dt * (IDLE_MOTION + this.level * SPEAKING_MOTION));
		const gain = IDLE_GAIN + this.level * SPEAKING_GAIN;

		this.context.clearRect(0, 0, this.width, this.height);
		this.context.fillStyle = this.stroke;

		drawBars(this.context, this.width, this.height, this.waves, gain);
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
		private readonly audioFactory: (() => HTMLAudioElement) | undefined,
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

	play(sampleId: string, playingVoice = sampleId): void {
		this.stop();
		try {
			const audio = this.ensureAudio();
			audio.src = FileAccess.asBrowserUri(`vs/workbench/contrib/agentsVoice/browser/media/${sampleId}.mp3`).toString(true);

			const store = new DisposableStore();
			store.add(dom.addDisposableListener(audio, 'ended', () => this.stop()));
			store.add(dom.addDisposableListener(audio, 'error', () => this.stop()));
			store.add(toDisposable(() => audio.pause()));
			this.playback.value = store;

			this.setPlayingVoice(playingVoice);
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
		const audio = this.audioFactory?.() ?? new targetWindow.Audio();
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
	/** Allows tests to provide a deterministic media element. */
	readonly audioFactory?: () => HTMLAudioElement;
	/** Allows tests to provide a deterministic spoken language. */
	readonly voiceLanguage?: string;
}

/** A rendered voice option, with the strings its play state swaps between. */
interface IVoiceElement {
	readonly element: HTMLElement;
	readonly label: string;
	readonly restingAria: string;
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
export class VoiceModeOnboardingBanner extends ChatInputNoticeWidget implements IChatInputOnboardingBanner {

	private readonly player: VoiceSamplePlayer;
	private animator: VoiceModeOnboardingAnimator | undefined;
	private readonly options: IVoiceModeOnboardingBannerOptions;
	private readonly microphonePicker = this._register(new MutableDisposable<DisposableStore>());
	private microphoneOptions: IMicrophoneOption[] = [];
	private microphonePickerContainer: HTMLElement | undefined;

	private readonly voiceElements = new Map<string, IVoiceElement>();

	/** Where the voice chips live, so they can be re-rendered on a language change. */
	private voicesContainer: HTMLElement | undefined;

	/** Listeners for the current set of voice chips, cleared when they re-render. */
	private readonly voicesDisposables = this._register(new DisposableStore());

	/** The native voice for the spoken language, when one exists. */
	private localizedVoice: ILocalizedVoice | undefined;

	/** The voice being auditioned, and the one that will be committed. */
	private selectedVoice: IVoiceModeVoice | undefined;

	constructor(
		options: IVoiceModeOnboardingBannerOptions,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
		@IStorageService private readonly storageService: IStorageService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super({
			container: options.container,
			variant: ChatInputNoticeVariant.Onboarding,
			className: 'voice-mode-onboarding-banner',
			ariaLabel: localize('voiceMode.onboarding.region', "Voice Mode introduction"),
			ariaDescription: localize('voiceMode.onboarding.regionDescription', "Choose how your agent speaks to you. Adjust settings anytime."),
			onEscape: () => {
				this.logAction('escape');
				this.options.onDismiss();
			},
		});

		this.options = options;
		this.localizedVoice = localizedVoiceForLanguage(this.resolveSpokenLanguage());
		this.player = this._register(instantiationService.createInstance(VoiceSamplePlayer, this.domNode, options.audioFactory));
		this._register(this.player.onDidChangePlayingVoice(voiceId => this.updatePlaying(voiceId)));

		const copy = dom.append(this.domNode, dom.$('.voice-mode-onboarding-copy'));
		const title = dom.append(copy, dom.$('.chat-input-notice-title.voice-mode-onboarding-title'));
		title.textContent = localize('voiceMode.onboarding.title', "Welcome to Voice Mode");
		this.renderDescription(copy);

		this.renderSharedWaveform(instantiationService);
		this.renderMicrophonePicker();

		const actions = dom.append(this.domNode, dom.$('.voice-mode-onboarding-actions'));
		this.voicesContainer = actions;
		this.renderVoices();
		this.renderClose();
		this.logAction('shown');

		// "Changing this while voice mode is connected takes effect immediately"
		// applies to the card too: swap the chips for the new language's voice
		// rather than leaving stale ones behind.
		this._register(this.configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(VOICE_LANGUAGE_SETTING)) {
				this.updateForLanguage();
			}
		}));
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
		this.animator = this._register(instantiationService.createInstance(VoiceModeOnboardingAnimator, canvas, wave, {
			getLevel: () => this.player.getLevel(),
			getSignature: () => this.currentSignature(),
		}));
	}

	private renderMicrophonePicker(): void {
		this.microphonePickerContainer = dom.append(this.domNode, dom.$('.chat-input-notice-picker.voice-mode-onboarding-microphone-picker'));
		this.microphoneOptions = [{
			deviceId: '',
			label: localize('voiceMode.onboarding.systemDefault', "System default"),
		}];
		this.updateMicrophonePicker();

		const mediaDevices = dom.getWindow(this.domNode).navigator.mediaDevices;
		if (mediaDevices) {
			this._register(dom.addDisposableListener(mediaDevices, 'devicechange', () => void this.refreshMicrophones()));
			void this.refreshMicrophones();
		}
	}

	private async refreshMicrophones(): Promise<void> {
		const mediaDevices = dom.getWindow(this.domNode).navigator.mediaDevices;
		if (!mediaDevices?.enumerateDevices) {
			return;
		}

		let devices: MediaDeviceInfo[];
		try {
			devices = await mediaDevices.enumerateDevices();
		} catch (error) {
			this.logService.trace(`[voice] could not enumerate microphones: ${error}`);
			return;
		}
		if (this._store.isDisposed) {
			return;
		}

		const options = buildMicrophoneOptions(devices);
		// Wait for a real microphone label before rendering a multi-microphone picker.
		if (options.length > 1 && !devices.some(device => device.kind === 'audioinput' && device.label)) {
			return;
		}
		this.microphoneOptions = options;
		this.updateMicrophonePicker();
	}

	private updateMicrophonePicker(): void {
		if (!this.microphonePickerContainer) {
			return;
		}
		this.microphonePicker.clear();
		dom.clearNode(this.microphonePickerContainer);

		this.microphonePickerContainer.hidden = this.microphoneOptions.length <= 1;
		if (this.microphonePickerContainer.hidden) {
			return;
		}

		dom.append(this.microphonePickerContainer, dom.$(`span.codicon.codicon-${Codicon.mic.id}.voice-mode-onboarding-microphone-icon`))
			.setAttribute('aria-hidden', 'true');

		const selected = indexOfMicrophone(this.microphoneOptions, this.currentMicrophoneId());

		const store = new DisposableStore();
		const selectBox = store.add(new SelectBox(
			this.microphoneOptions.map(option => ({ text: option.label })),
			selected,
			this.contextViewService,
			{
				...defaultSelectBoxStyles,
				selectBackground: undefined,
				selectBorder: undefined,
				selectForeground: undefined,
				selectListBackground: asCssVariableWithDefault(selectListBackground, asCssVariable(selectBackground)),
			},
			{ ariaLabel: localize('voiceMode.onboarding.microphone', "Microphone"), useCustomDrawn: true },
		));
		selectBox.render(this.microphonePickerContainer);
		store.add(selectBox.onDidSelect(event => this.selectMicrophone(event.index)));
		this.microphonePicker.value = store;
	}

	private currentMicrophoneId(): string {
		return this.storageService.get(AgentsVoiceStorageKeys.MicrophoneDevice, StorageScope.APPLICATION, '');
	}

	private selectMicrophone(index: number): void {
		const option = this.microphoneOptions[index];
		if (!option) {
			return;
		}
		this.logAction('selectMicrophone');
		if (option.deviceId) {
			this.storageService.store(AgentsVoiceStorageKeys.MicrophoneDevice, option.deviceId, StorageScope.APPLICATION, StorageTarget.MACHINE);
		} else {
			this.storageService.remove(AgentsVoiceStorageKeys.MicrophoneDevice, StorageScope.APPLICATION);
		}
		status(localize('voiceMode.onboarding.microphoneSelected', "{0} selected.", option.label));
	}

	/**
	 * The voices as real buttons - border, hover lift, pressed feedback -
	 * because bare text gave no sign it could be clicked at all. In a language
	 * Voice Mode speaks natively there is only one voice, so the card previews
	 * that voice instead of offering the English chooser.
	 *
	 * Re-entrant: clears any previously rendered chips so the card can rebuild
	 * them when the spoken language changes.
	 */
	private renderVoices(): void {
		const container = this.voicesContainer;
		if (!container) {
			return;
		}

		this.voicesDisposables.clear();
		this.voiceElements.clear();
		dom.clearNode(container);

		const labelText = localize('voiceMode.onboarding.voices', "Agent Voice:");
		const label = dom.append(container, dom.$('.voice-mode-onboarding-voices-label'));
		label.textContent = labelText;

		if (this.localizedVoice) {
			this.renderLocalizedVoice(container, labelText, this.localizedVoice);
			return;
		}

		const group = dom.append(container, dom.$('.voice-mode-onboarding-voices'));
		group.setAttribute('role', 'radiogroup');
		group.setAttribute('aria-label', labelText);

		for (const voice of VOICES) {
			const option = dom.append(group, dom.$('.voice-mode-onboarding-voice'));
			option.setAttribute('role', 'radio');
			const restingAria = localize('voiceMode.onboarding.voice.ariaLabel', "{0}. Hear this voice and use it for every conversation.", voice.label);
			option.setAttribute('aria-label', restingAria);

			this.appendVoiceIcon(option);

			const label = dom.append(option, dom.$('span.voice-mode-onboarding-voice-label'));
			label.textContent = voice.label;
			this.voiceElements.set(voice.id, { element: option, label: voice.label, restingAria });

			this.voicesDisposables.add(dom.addDisposableListener(option, dom.EventType.CLICK, () => this.selectVoice(voice)));
			this.voicesDisposables.add(dom.addDisposableListener(option, dom.EventType.KEY_DOWN, event => this.handleOptionKey(event, voice)));
		}

		this.updateSelection();
	}

	/**
	 * The spoken language changed, so swap the chips: the four English voices
	 * for a native language's single voice, or back again. Nothing is carried
	 * over - a voice chosen for the old language means nothing for the new one.
	 */
	private updateForLanguage(): void {
		const localizedVoice = localizedVoiceForLanguage(this.resolveSpokenLanguage());
		if (localizedVoice?.id === this.localizedVoice?.id) {
			return;
		}

		const hadVoiceFocus = this.voicesContainer ? dom.isAncestorOfActiveElement(this.voicesContainer) : false;
		this.player.stop();
		this.localizedVoice = localizedVoice;
		this.selectedVoice = undefined;
		this.renderVoices();
		if (hadVoiceFocus) {
			this.voiceElements.values().next().value?.element.focus();
		}
	}

	/**
	 * The single native voice for the spoken language, as a preview button:
	 * there is nothing to choose, so it only ever plays and stops.
	 */
	private renderLocalizedVoice(container: HTMLElement, ariaLabel: string, voice: ILocalizedVoice): void {
		const group = dom.append(container, dom.$('.voice-mode-onboarding-voices'));
		group.setAttribute('aria-label', ariaLabel);

		const option = dom.append(group, dom.$('.voice-mode-onboarding-voice'));
		option.setAttribute('role', 'button');
		option.tabIndex = 0;
		const restingAria = localize('voiceMode.onboarding.voice.previewAriaLabel', "{0}. Hear how your agent will sound.", voice.label);
		option.setAttribute('aria-label', restingAria);

		this.appendVoiceIcon(option);

		const label = dom.append(option, dom.$('span.voice-mode-onboarding-voice-label'));
		label.textContent = voice.label;
		this.voiceElements.set(voice.id, { element: option, label: voice.label, restingAria });

		this.voicesDisposables.add(dom.addDisposableListener(option, dom.EventType.CLICK, () => this.previewLocalizedVoice(voice)));
		this.voicesDisposables.add(dom.addDisposableListener(option, dom.EventType.KEY_DOWN, event => {
			const keyboardEvent = new StandardKeyboardEvent(event);
			if (keyboardEvent.equals(KeyCode.Enter) || keyboardEvent.equals(KeyCode.Space)) {
				keyboardEvent.preventDefault();
				this.previewLocalizedVoice(voice);
			}
		}));
	}

	/**
	 * The icon is the affordance: it says "this will speak" before the click,
	 * animating bars while it speaks, then a check once a voice is chosen.
	 */
	private appendVoiceIcon(option: HTMLElement): void {
		const icon = dom.append(option, dom.$('span.voice-mode-onboarding-voice-icon'));
		dom.append(icon, dom.$(`span.codicon.codicon-${Codicon.play.id}.voice-mode-onboarding-voice-idle`)).setAttribute('aria-hidden', 'true');
		dom.append(icon, dom.$(`span.codicon.codicon-${Codicon.checkCompact.id}.voice-mode-onboarding-voice-chosen`)).setAttribute('aria-hidden', 'true');
		const bars = dom.append(icon, dom.$('span.voice-mode-onboarding-voice-bars'));
		bars.setAttribute('aria-hidden', 'true');
		for (let bar = 0; bar < 3; bar++) {
			dom.append(bars, dom.$('span.voice-mode-onboarding-voice-bar'));
		}
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
			this.voiceElements.get(next.id)?.element.focus();
		}
	}

	/**
	 * One short paragraph: what Voice Mode does, and where to change its
	 * settings or instructions.
	 *
	 * `[[...]]` marks each clause that becomes a link, so translators can place
	 * it naturally in the sentence instead of receiving a fixed phrase
	 * concatenated onto the end.
	 */
	private renderDescription(container: HTMLElement): void {
		const description = dom.append(container, dom.$('.chat-input-notice-description.voice-mode-onboarding-description'));
		const text = localize({
			key: 'voiceMode.onboarding.description',
			comment: [
				'Preserve the double square brackets: they mark the text that becomes a link. Keep both links, in this order - the first opens Voice Mode settings, the second opens the voice.md customization file.',
			],
		}, "Choose how your agent speaks to you. Adjust [[settings]] or [[how it's written]] anytime.");

		dom.append(description, renderFormattedText(text, {
			actionHandler: {
				callback: index => {
					const commandId = index === '0' ? VOICE_SETTINGS_COMMAND : CONFIGURE_VOICE_INSTRUCTIONS_ACTION_ID;
					this.logAction(index === '0' ? 'openSettings' : 'openInstructions');
					this.commandService.executeCommand(commandId)
						.catch(error => this.logService.error(`[voice] Failed to run ${commandId}: ${error}`));
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

	/**
	 * Dismissal is always available and never gated: a disabled close would trap
	 * someone in the card. Choosing a voice already commits it, so this is only
	 * ever "I am done here" - and closing is what hands the session back.
	 */
	private renderClose(): void {
		this.addDismissAction({
			className: 'voice-mode-onboarding-close',
			ariaLabel: localize('voiceMode.onboarding.close', "Close the introduction"),
			onActivate: () => this.finish(),
		});
	}

	/**
	 * Stops the sample and the waveform while the card is put away for a
	 * notification, so an invisible introduction is not still playing audio or
	 * painting every frame.
	 */
	override setVisible(visible: boolean): void {
		super.setVisible(visible);
		this.animator?.setSuspended(!visible);
		if (!visible) {
			this.player.stop();
		}
	}

	private selectVoice(voice: IVoiceModeVoice): void {
		if (this.player.playingVoice === voice.id) {
			this.player.stop();
			status(localize('voiceMode.onboarding.voice.previewStopped', "{0} preview stopped.", voice.label));
			return;
		}
		this.logAction('selectVoice');
		this.selectedVoice = voice;
		this.updateSelection();
		this.player.play(voice.sampleId, voice.id);
		status(localize('voiceMode.onboarding.voice.selected', "{0} selected.", voice.label));
		this.configurationService.updateValue(VOICE_SETTING, voice.id, ConfigurationTarget.USER)
			.catch(error => this.logService.error(`[voice] Failed to persist the Voice Mode voice: ${error}`));
	}

	/**
	 * The localized voice is not a choice - it is the only voice for the
	 * language - so previewing it just plays and stops, and never persists.
	 */
	private previewLocalizedVoice(voice: ILocalizedVoice): void {
		if (this.player.playingVoice === voice.id) {
			this.player.stop();
			status(localize('voiceMode.onboarding.voice.localizedStopped', "{0} preview stopped.", voice.label));
			return;
		}
		this.logAction('previewVoice');
		this.player.play(voice.id);
		status(localize('voiceMode.onboarding.voice.localizedPlaying', "Playing {0} preview.", voice.label));
	}

	/**
	 * The spoken language, mirroring the resolution the voice client uses: an
	 * explicit test override, then the configured language (unless `auto`), then
	 * the window's language.
	 */
	private resolveSpokenLanguage(): string {
		if (this.options.voiceLanguage) {
			return this.options.voiceLanguage;
		}

		const configuredLanguage = this.configurationService.getValue<string>(VOICE_LANGUAGE_SETTING)?.trim();
		if (configuredLanguage && configuredLanguage.toLowerCase() !== 'auto') {
			return configuredLanguage;
		}
		return dom.getWindow(this.domNode).navigator.language;
	}

	private updateSelection(): void {
		for (const [id, entry] of this.voiceElements) {
			const selected = id === this.selectedVoice?.id;
			entry.element.classList.toggle('selected', selected);
			entry.element.setAttribute('aria-checked', String(selected));
		}
		this.updateTabStop();
	}

	/**
	 * Keeps a single tab stop on the group: the chosen voice, or the first one
	 * when nothing has been chosen yet.
	 */
	private updateTabStop(): void {
		let first = true;
		for (const [id, entry] of this.voiceElements) {
			const isTabStop = this.selectedVoice === undefined ? first : id === this.selectedVoice.id;
			entry.element.tabIndex = isTabStop ? 0 : -1;
			first = false;
		}
	}

	private updatePlaying(playingVoice: string | undefined): void {
		for (const [id, entry] of this.voiceElements) {
			const playing = id === playingVoice;
			entry.element.classList.toggle('playing', playing);
			entry.element.setAttribute('aria-label', playing
				? localize('voiceMode.onboarding.voice.stopPreview', "Stop {0} preview.", entry.label)
				: entry.restingAria);
		}
		this.domNode.classList.toggle('playing', playingVoice !== undefined);
	}

	private finish(): void {
		this.player.stop();
		this.logAction('close');
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
	readonly isVisible: boolean;

	/**
	 * Register a container that can host the banner (a chat input). The most
	 * recently focused host wins when the banner is shown.
	 */
	registerHost(options: IChatInputOnboardingHostOptions): IDisposable;

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

	get isVisible(): boolean {
		return this.onboarding.isVisible;
	}

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		this.onboarding = this._register(this.instantiationService.createInstance(ChatInputOnboarding, {
			storageKey: AgentsVoiceStorageKeys.IntroBannerShown,
		}));
	}

	registerHost(options: IChatInputOnboardingHostOptions): IDisposable {
		return this.onboarding.registerHost(options);
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

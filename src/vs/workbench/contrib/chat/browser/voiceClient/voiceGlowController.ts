/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/voiceGlow.css';
import { $ } from '../../../../../base/browser/dom.js';
import { Color } from '../../../../../base/common/color.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { DEFAULT_VOICE_GLOW_COLORS, GlowThemeKind, IVoiceGlowColors, resolveVoiceRimAccent, voiceGlowStateColor, VoiceGlowState, VoiceRimMood } from './voiceGlow.js';

export type { GlowThemeKind };

/**
 * The DOM applier for the Voice Mode ambient glow.
 *
 * `listening` and `speaking` render an audio-reactive interior rim. Every other
 * state renders nothing.
 *
 * Every state change is a true cross-fade between two buffered slots, so
 * `listening -> speaking` dissolves cool -> warm rather than snapping. Colors are
 * derived from the theme accent (see `resolveVoiceGlowColors`).
 *
 * The rim design is inspired by the work of Jakub Antalik (@Jakubantalik).
 */

/**
 * Cross-fade timing shared by every state transition. Opacity only: the glow is
 * light, and light dissolves — scaling it would read as the box "zooming", which
 * pulls the eye to a size change that isn't happening.
 */
const FADE = 'opacity .6s cubic-bezier(.4,0,.2,1)';
/** How long a faded-out slot is kept mounted before its layer is torn down. */
const FADE_OUT_MS = 650;

/** Base strength of an active rim, before the audio level is applied. */
const ACTIVE_RIM_STRENGTH = 1.02;

/** Per-theme opacity of the three rim layers (ring / inner wash / bloom). */
const RIM_LAYER_OPACITY = {
	dark: { ring: 1, inner: 0.44, bloom: 0.66 },
	light: { ring: 1, inner: 0.3, bloom: 0.8 },
} as const;

/** Seconds for one full breath cycle. */
const RIM_DURATION = 2.3;

/**
 * Which of the two talking states the rim is showing. Published as a class so
 * high-contrast themes can style each one.
 */
type RimMood = VoiceRimMood;

/** A live layer mounted on one of the buffered slots. */
interface IMountedLayer extends IDisposable {
	readonly host: HTMLElement;
	/** Advance motion + intensity from the smoothed audio `level` ([0,1]). */
	drive(level: number): void;
	/** Pin to a representative still frame (reduced motion). */
	driveStatic(level: number): void;
}

export interface IVoiceGlowController extends IDisposable {
	/** Show/keep the glow for `state`, driving intensity from `level` ([0,1]). */
	render(state: VoiceGlowState, level: number, reducedMotion: boolean): void;
	/** Fade the glow out (not-owner / disconnected). */
	clear(): void;
	/** Re-apply the current state after a color-theme change. */
	refreshTheme(): void;
}

/**
 * A single sinusoidal oscillator ping-ponging a CSS custom property between `from`
 * and `to`. Desynced periods are what keep the rim from reading as a mechanical
 * pulse: no two regions swell at the same time.
 */
interface IOscillator {
	readonly prop: string;
	readonly from: number;
	readonly to: number;
	/** Full period, in seconds. */
	readonly period: number;
	/** Phase offset, in seconds. */
	readonly delay: number;
	readonly unit: '' | 'px';
}

/** Breathing parameters, theme-tuned. */
function rimMotionParams(theme: GlowThemeKind, duration: number) {
	const dark = theme === 'dark';
	const scale = duration / RIM_DURATION;
	return {
		/** How much the blobs grow and shrink. */
		spread: 0.28,
		/** How far the blobs drift, in px. */
		drift: dark ? 33 : 40,
		/** Depth of the per-quadrant opacity swell. */
		opacityDepth: dark ? 0.48 : 0.45,
		/** Depth of the global height swell. */
		breathDepth: dark ? 0.34 : 0.22,
		/** Base period for the opacity swell. */
		opacityPeriod: (dark ? 1.9 : 2.6) * scale,
		/** Base period for the size swell. */
		sizePeriod: (dark ? 2.6 : 4.6) * scale,
		/** Period of the global height swell. */
		breathPeriod: (dark ? 2.4 : 5.5) * scale,
	};
}

function rimOscillators(theme: GlowThemeKind, duration: number): IOscillator[] {
	const { spread, drift, opacityDepth, breathDepth, opacityPeriod, sizePeriod, breathPeriod } = rimMotionParams(theme, duration);
	return [
		{ prop: '--vg-w1', from: 1 - spread, to: 1 + spread * 1.1, period: sizePeriod * 0.9, delay: 0, unit: '' },
		{ prop: '--vg-h1', from: 1 + spread * 0.9, to: 1 - spread * 0.85, period: sizePeriod * 1.26, delay: 0, unit: '' },
		{ prop: '--vg-x1', from: -drift, to: drift * 0.9, period: opacityPeriod * 1.6, delay: 0, unit: 'px' },
		{ prop: '--vg-y1', from: drift * 0.55, to: -drift * 0.7, period: opacityPeriod * 1.6, delay: 0, unit: 'px' },
		{ prop: '--vg-w2', from: 1 + spread, to: 1 - spread * 0.85, period: sizePeriod * 1.1, delay: 0, unit: '' },
		{ prop: '--vg-h2', from: 1 - spread * 0.8, to: 1 + spread * 1.05, period: sizePeriod * 0.81, delay: 0, unit: '' },
		{ prop: '--vg-x2', from: drift * 0.8, to: -drift * 0.9, period: opacityPeriod * 1.88, delay: 0, unit: 'px' },
		{ prop: '--vg-y2', from: -drift, to: drift * 0.65, period: opacityPeriod * 1.88, delay: 0, unit: 'px' },
		{ prop: '--vg-w3', from: 1 - spread * 0.6, to: 1 + spread * 1.15, period: sizePeriod * 0.98, delay: 0, unit: '' },
		{ prop: '--vg-h3', from: 1 + spread * 0.75, to: 1 - spread, period: sizePeriod * 1.4, delay: 0, unit: '' },
		{ prop: '--vg-x3', from: -drift * 0.6, to: drift, period: opacityPeriod * 1.45, delay: 0, unit: 'px' },
		{ prop: '--vg-y3', from: -drift * 0.85, to: drift * 0.45, period: opacityPeriod * 1.45, delay: 0, unit: 'px' },
		{ prop: '--vg-breath', from: 1 - breathDepth, to: 1 + breathDepth, period: breathPeriod, delay: 0, unit: '' },
		{ prop: '--vg-op-tl', from: 1 - opacityDepth, to: 1, period: opacityPeriod, delay: 0, unit: '' },
		{ prop: '--vg-op-tr', from: 1 - opacityDepth, to: 1, period: opacityPeriod * 1.32, delay: opacityPeriod * 0.28, unit: '' },
		{ prop: '--vg-op-bl', from: 1 - opacityDepth, to: 1, period: opacityPeriod * 0.84, delay: opacityPeriod * 0.55, unit: '' },
		{ prop: '--vg-op-br', from: 1 - opacityDepth, to: 1, period: opacityPeriod * 1.58, delay: opacityPeriod * 0.83, unit: '' },
	];
}

function applyOscillators(host: HTMLElement, oscillators: readonly IOscillator[], time: number, animate: boolean): void {
	for (const osc of oscillators) {
		const value = animate
			? osc.from + (osc.to - osc.from) * ((1 - Math.cos(2 * Math.PI * ((time - osc.delay) / osc.period))) / 2)
			: (osc.from + osc.to) / 2;
		host.style.setProperty(osc.prop, osc.unit === 'px' ? `${value.toFixed(2)}px` : value.toFixed(4));
	}
}

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

function nowSeconds(el: HTMLElement): number {
	const view = el.ownerDocument.defaultView;
	return (view?.performance ?? performance).now() / 1000;
}

/**
 * Mount the rim layers (ring, inner wash, bloom and corner catches) on `host` and
 * return a driver for them. `host` already carries the `voice-glow-rim` class.
 */
function mountRimLayers(host: HTMLElement, options: {
	readonly theme: GlowThemeKind;
	readonly mood: RimMood;
	readonly hue: number;
	readonly saturation: number;
	readonly lightness: number;
	readonly strength: number;
	readonly duration: number;
	/** How strongly the audio level modulates the rim. */
	readonly audioGain: number;
	/** Extra, super-linear response so loud peaks bloom rather than just brighten. */
	readonly peakGain: number;
	/** How strongly the audio level speeds the breath up. */
	readonly speedGain: number;
	/** Scales the rim's absolute blob sizes to the host (1 = a chat input box). */
	readonly size?: number;
}): IMountedLayer {
	const store = new DisposableStore();

	const moodClass = `voice-glow-rim-${options.mood}`;
	host.classList.add('voice-glow-rim', moodClass);
	store.add(toDisposable(() => host.classList.remove('voice-glow-rim', moodClass)));

	for (const cls of ['voice-glow-rim-corners', 'voice-glow-rim-bloom']) {
		const el = $('div');
		el.className = cls;
		host.appendChild(el);
		store.add(toDisposable(() => el.remove()));
	}

	const layerOpacity = RIM_LAYER_OPACITY[options.theme];
	host.style.setProperty('--vg-sat', `${options.saturation}%`);
	host.style.setProperty('--vg-light', `${options.lightness}%`);
	host.style.setProperty('--vg-ring-opacity', String(layerOpacity.ring));
	host.style.setProperty('--vg-inner-opacity', String(layerOpacity.inner));
	host.style.setProperty('--vg-bloom-opacity', String(layerOpacity.bloom));
	if (options.size !== undefined) {
		host.style.setProperty('--vg-size', options.size.toFixed(3));
	}

	const oscillators = rimOscillators(options.theme, options.duration);
	let time = 0;
	let previousTimestamp: number | undefined;
	let level = 0.2;

	const apply = (input: number, animate: boolean): void => {
		if (animate) {
			const timestamp = nowSeconds(host);
			const delta = previousTimestamp === undefined ? 0 : Math.min(0.05, timestamp - previousTimestamp);
			previousTimestamp = timestamp;
			const target = clamp01(input);
			// Asymmetric: swell into speech quickly, drift back out of it slowly, so
			// the rim reads as ambient light rather than as a level meter.
			level += (target - level) * (target > level ? 0.3 : 0.08);
			time += delta * (options.speedGain === 0 ? 0.22 : 0.4 + options.speedGain * level);
		} else {
			level = clamp01(input);
		}
		applyOscillators(host, oscillators, time, animate);
		// Peaks read denser than a linear response would give: the extra curve on
		// top of the linear term leaves quiet speech calm but lets a loud moment
		// genuinely bloom, instead of the whole range sitting in a narrow band.
		const peak = level * level;
		host.style.setProperty('--vg-strength', (options.strength * (0.5 + options.audioGain * level + options.peakGain * peak)).toFixed(3));
		// The bloom thickens with the peak too, so "louder" reads as more light
		// rather than only as a brighter hairline.
		host.style.setProperty('--vg-bloom-opacity', (layerOpacity.bloom * (1 + options.peakGain * peak)).toFixed(3));
		// A slow hue wander keeps the light alive without ever leaving the accent.
		const drift = animate ? 14 * Math.sin(time * 0.4) : 0;
		host.style.setProperty('--vg-hue', (options.hue + drift).toFixed(1));
	};

	return {
		host,
		drive: (input: number) => apply(input, true),
		driveStatic: (input: number) => apply(input, false),
		dispose: () => store.dispose(),
	};
}

/**
 * Create a voice glow controller bound to `target` (the input box). `themeKind`
 * lets the caller supply the active light/dark theme, and `colors` the resolved
 * theme accents; both are re-read on {@link IVoiceGlowController.refreshTheme}.
 */
export function createVoiceGlowController(target: HTMLElement, themeKind?: () => GlowThemeKind, colors?: () => IVoiceGlowColors): IVoiceGlowController {
	return new VoiceGlowController(target, themeKind, colors);
}

/** A standalone rim light mounted over a single element. */
export interface IVoiceRimLight extends IDisposable {
	/** Advance the rim from the smoothed audio `level` ([0,1]). */
	drive(level: number): void;
	/** Pin to a representative still frame (reduced motion). */
	driveStatic(level: number): void;
	/** Re-mount with a freshly resolved accent / theme. */
	refresh(accent: Color, theme: GlowThemeKind, background?: Color): void;
}

/**
 * The height (px) the rim's blob sizes are authored against — a chat input box.
 * Smaller hosts scale their blobs down from this, so a mic button gets the same
 * light rather than one blob covering the whole element.
 */
const RIM_REFERENCE_HEIGHT = 78;

/**
 * How much of the rim's scale is fixed rather than proportional to the host.
 *
 * Scaling the blobs strictly with the host collapses the effect on a control:
 * the blobs stop overlapping, so the wash breaks into scattered dots and only
 * the hairline survives. Holding part of the scale back keeps them large enough
 * to bleed into one another, which is what makes the rim read as light.
 */
const RIM_SIZE_FLOOR = 0.35;

/**
 * Mount the rim over `target` as an always-on light, for hosts that light a
 * single element rather than cross-fading between voice states — the dictation
 * microphone, which is either open or closed.
 *
 * The rim lives in its own absolutely-positioned slot, so hosts that rebuild
 * their button contents don't tear it out.
 */
export function createVoiceRimLight(target: HTMLElement, accent: Color, theme: GlowThemeKind, mood: VoiceRimMood = 'cool', background?: Color): IVoiceRimLight {
	const store = new DisposableStore();

	if (!target.style.position) {
		target.style.position = 'relative';
	}
	const slot = $('.voice-glow-slot.voice-glow-slot-inline');
	target.appendChild(slot);
	store.add(toDisposable(() => slot.remove()));

	const mount = store.add(new MutableDisposable<IMountedLayer>());
	let level = 0.3;

	const remount = (nextAccent: Color, nextTheme: GlowThemeKind, nextBackground?: Color) => {
		const rim = resolveVoiceRimAccent(nextAccent, mood, nextTheme, nextBackground);
		// Measured lazily: hosts commonly build the button before it is attached,
		// and a detached element has no box to measure.
		const height = target.getBoundingClientRect().height;
		const proportion = height > 0 ? Math.min(1, height / RIM_REFERENCE_HEIGHT) : 0;
		mount.clear();
		mount.value = mountRimLayers(slot, {
			theme: nextTheme,
			mood,
			hue: rim.hue,
			saturation: rim.saturation,
			lightness: rim.lightness,
			strength: ACTIVE_RIM_STRENGTH,
			duration: RIM_DURATION,
			audioGain: 0.8,
			peakGain: 0.95,
			speedGain: 0.9,
			size: RIM_SIZE_FLOOR + (1 - RIM_SIZE_FLOOR) * proportion,
		});
		mount.value.driveStatic(level);
	};
	remount(accent, theme, background);

	return {
		drive: (input: number) => {
			level = input;
			mount.value?.drive(input);
		},
		driveStatic: (input: number) => {
			level = input;
			mount.value?.driveStatic(input);
		},
		refresh: remount,
		dispose: () => store.dispose(),
	};
}

class VoiceGlowController extends Disposable implements IVoiceGlowController {

	/** Two buffered overlay slots, so state changes cross-fade instead of snapping. */
	private readonly _slots: readonly HTMLElement[];
	/** One mount per slot, so mounting a new layer tears the old one down. */
	private readonly _mounts = new Map<HTMLElement, MutableDisposable<IMountedLayer>>();

	private _front: IMountedLayer | undefined;
	private _currentState: VoiceGlowState | 'none' = 'none';
	private _currentMood: RimMood | undefined;
	private _clearTimer: ReturnType<typeof setTimeout> | undefined;
	private _colors: IVoiceGlowColors;
	private _reducedMotion = false;
	private _disposed = false;

	constructor(
		private readonly _target: HTMLElement,
		private readonly _themeKind: () => GlowThemeKind = () => 'dark',
		private readonly _colorsProvider: () => IVoiceGlowColors = () => DEFAULT_VOICE_GLOW_COLORS,
	) {
		super();
		try {
			this._colors = this._colorsProvider();
			_target.style.position = _target.style.position || 'relative';

			const createSlot = (): HTMLElement => {
				const el = $('div');
				el.className = 'voice-glow-slot';
				// Above the transcript overlay, which is opaque and would otherwise
				// paint over the top of the box and leave the glow visible only along
				// the bottom toolbar strip.
				el.style.zIndex = '11';
				_target.appendChild(el);
				this._register(toDisposable(() => el.remove()));
				this._mounts.set(el, this._register(new MutableDisposable<IMountedLayer>()));
				return el;
			};
			this._slots = [createSlot(), createSlot()];

			this._register(toDisposable(() => {
				this._disposed = true;
				if (this._clearTimer !== undefined) {
					clearTimeout(this._clearTimer);
					this._clearTimer = undefined;
				}
			}));
		} catch (error) {
			this.dispose();
			throw error;
		}
	}

	override dispose(): void {
		// Hosts commonly register the controller before the stop-hook that calls
		// `clear()`, and a `DisposableStore` disposes in insertion order — so
		// `clear()` can run after this. Flag it up front so that call is a no-op
		// and can't arm a teardown timer nothing will cancel.
		this._disposed = true;
		super.dispose();
	}

	render(state: VoiceGlowState, level: number, reducedMotion: boolean): void {
		if (this._disposed) {
			return;
		}
		const mood = resolveMood(state);
		this._reducedMotion = reducedMotion;
		if (!mood) {
			this.clear();
			return;
		}

		// Keyed on the mood, not the state, so states that share a look never
		// re-mount or cross-fade between each other.
		if (mood !== this._currentMood) {
			this._currentMood = mood;
			if (this._clearTimer !== undefined) {
				clearTimeout(this._clearTimer);
				this._clearTimer = undefined;
			}
			this._showLayer(mood, reducedMotion);
		}

		// State classes still track the real state, so surface CSS that tints the
		// mic glyph can tell the states apart even when they share a rim.
		if (state !== this._currentState) {
			this._currentState = state;
			this._target.classList.add('voice-active');
			this._target.classList.toggle('voice-listening', state === 'listening');
			this._target.classList.toggle('voice-processing', state === 'processing');
			this._target.classList.toggle('voice-speaking', state === 'speaking');
			const accent = resolveVoiceRimAccent(voiceGlowStateColor(state, this._colors), mood, this._themeKind(), this._colors.background);
			this._target.style.setProperty('--voice-accent', `hsl(${accent.hue} ${accent.saturation}% ${accent.lightness}%)`);
		}

		if (this._front && !reducedMotion) {
			this._front.drive(level);
		}
	}

	clear(): void {
		if (this._disposed || this._currentState === 'none') {
			return;
		}
		this._currentState = 'none';
		this._currentMood = undefined;
		this._target.classList.remove('voice-active', 'voice-listening', 'voice-processing', 'voice-speaking');
		this._target.style.removeProperty('--voice-accent');
		const previous = this._front;
		this._front = undefined;
		if (previous) {
			this._fadeOut(previous.host);
			this._scheduleTeardown(previous.host);
		}
	}

	/**
	 * Tear a slot's mount down once it has faded out so it stops driving CSS
	 * variables. Guarded on re-entry: if the slot has since been reused as the
	 * front layer, the new mount must survive.
	 */
	private _scheduleTeardown(host: HTMLElement): void {
		if (this._clearTimer !== undefined) {
			clearTimeout(this._clearTimer);
		}
		this._clearTimer = setTimeout(() => {
			this._clearTimer = undefined;
			if (this._front?.host !== host) {
				this._mounts.get(host)?.clear();
			}
		}, FADE_OUT_MS);
	}

	refreshTheme(): void {
		if (this._disposed) {
			return;
		}
		this._colors = this._colorsProvider();
		const state = this._currentState;
		if (this._front && state !== 'none') {
			// Re-mount the current layer so it picks up the new accent / theme.
			this._currentState = 'none';
			this._currentMood = undefined;
			this.render(state, 0.3, this._reducedMotion);
		}
	}

	private _showLayer(mood: RimMood, reducedMotion: boolean): void {
		const host = this._slots.find(slot => slot !== this._front?.host) ?? this._slots[0];

		// Dispose any prior mount on this slot FIRST: mounts own the slot's classes
		// and custom properties, so disposing after mounting the new layer would
		// strip the fresh ones.
		this._mounts.get(host)!.clear();
		const mounted = this._mount(host, mood);
		this._mounts.get(host)!.value = mounted;
		if (reducedMotion) {
			mounted.driveStatic(0.4);
		}

		// Under reduced motion the layers swap outright: a 600ms cross-fade is
		// still motion, and the fixtures rely on the frame being settled.
		const fade = reducedMotion ? 'none' : FADE;
		const previous = this._front;
		host.style.transition = 'none';
		host.style.opacity = '0';
		void host.offsetWidth; // commit the start pose before transitioning from it
		host.style.transition = fade;
		host.style.opacity = '1';
		if (previous && previous.host !== host) {
			this._fadeOut(previous.host, fade);
			// Stop the outgoing layer driving CSS vars once it is out of sight.
			this._scheduleTeardown(previous.host);
		}
		this._front = mounted;
	}

	private _fadeOut(host: HTMLElement, fade: string = FADE): void {
		host.style.transition = fade;
		host.style.opacity = '0';
	}

	private _mount(host: HTMLElement, mood: RimMood): IMountedLayer {
		const theme = this._themeKind();
		const accentColor = mood === 'warm' ? this._colors.speaking : this._colors.listening;
		const accent = resolveVoiceRimAccent(accentColor, mood, theme, this._colors.background);
		return mountRimLayers(host, {
			theme,
			mood,
			hue: accent.hue,
			saturation: accent.saturation,
			lightness: accent.lightness,
			strength: ACTIVE_RIM_STRENGTH,
			duration: RIM_DURATION,
			audioGain: 0.8,
			// Lets the loudest moments read visibly denser rather than leaving the
			// whole range in a narrow band.
			peakGain: 0.95,
			speedGain: 0.9,
		});
	}
}

/**
 * Map a voice state to the rim mood that renders it, or `undefined` for no glow.
 * Thinking and connected-idle render nothing.
 */
function resolveMood(state: VoiceGlowState): RimMood | undefined {
	switch (state) {
		case 'listening': return 'cool';
		case 'speaking': return 'warm';
		default: return undefined;
	}
}

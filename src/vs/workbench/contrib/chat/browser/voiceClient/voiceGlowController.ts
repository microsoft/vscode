/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/voiceGlow.css';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { DEFAULT_VOICE_GLOW_COLORS, IVoiceGlowColors, voiceGlowStateColor, VoiceGlowState } from './voiceGlow.js';

/**
 * The DOM applier for the Voice Mode ambient glow.
 *
 * - `listening` / `speaking` render an audio-reactive interior RIM, cool while
 *   the user speaks and warm while the agent speaks,
 * - `processing` renders the travelling BORDER light, desaturated so it reads as
 *   a calm "thinking" loop that composes with the working comet rather than
 *   racing it,
 * - connected `idle` renders a slow, near-white rim breath, so voice mode being
 *   live is visible without shouting,
 * - `error` renders nothing.
 *
 * Every state change is a true cross-fade between two buffered slots, so
 * `listening -> speaking` dissolves cool -> warm rather than snapping. Colors are
 * derived from the theme accent (see `resolveVoiceGlowColors`).
 */

/** Corner radius used when the target's own radius can't be read. */
const RADIUS_FALLBACK = 6;
/** Cross-fade timing shared by every state transition. */
const FADE = 'opacity .6s cubic-bezier(.4,0,.2,1), transform .6s cubic-bezier(.4,0,.2,1)';
/** Layer scale at the start (incoming) and end (outgoing) of a cross-fade. */
const ENTER_SCALE = 0.94;
const EXIT_SCALE = 1.04;
/** How long a faded-out slot is kept mounted before its layer is torn down. */
const FADE_OUT_MS = 650;

/** Saturation (%) bounds for an active (listening / speaking) glow. */
const ACTIVE_SAT_MIN = 70;
const ACTIVE_SAT_MAX = 96;
/** Processing reads as white/gray, not as a color. */
const NEUTRAL_SAT = 0;

/**
 * The connected-idle rim. A pure gray reads as a muddy ring on a white input, so
 * the idle breath keeps a whisper of the listening hue at high lightness — it
 * should read as a soft light, not as gray.
 */
const IDLE_RIM = {
	dark: { saturation: 16, lightness: 78, strength: 0.4 },
	light: { saturation: 22, lightness: 84, strength: 0.44 },
} as const;

/**
 * The active rim's lightness, per theme and mood. The warm (speaking) rim needs a
 * little more lightness than the cool one to read at the same weight, since a
 * blue-violet edge sits darker than a cyan one at equal lightness.
 */
const ACTIVE_RIM_LIGHTNESS = {
	dark: { cool: 56, warm: 72 },
	light: { cool: 72, warm: 72 },
} as const;
/**
 * The rim reads a touch off the raw accent: a hair of teal on the cool side keeps
 * listening from looking like a plain blue focus ring, and a hair of magenta on
 * the warm side widens the contrast between "you are talking" and "the agent is
 * talking".
 */
const ACTIVE_RIM_HUE_SHIFT = { cool: -10, warm: 7 } as const;
/** Base strength of an active rim, before the audio level is applied. */
const ACTIVE_RIM_STRENGTH = 0.86;

/** Per-theme opacity of the three rim layers (ring / inner wash / bloom). */
const RIM_LAYER_OPACITY = {
	dark: { ring: 1, inner: 0.44, bloom: 0.66 },
	light: { ring: 1, inner: 0.3, bloom: 0.8 },
} as const;

/** Seconds for one full breath cycle, per rim mood. */
const RIM_DURATION = { active: 2.3, idle: 4.8 } as const;

/** Seconds for one lap of the travelling border, at rest. */
const BORDER_SPIN_ACTIVE = 7;
const BORDER_SPIN_NEUTRAL = 9;

export type GlowThemeKind = 'light' | 'dark';

/** The visual treatment a state maps to. */
type LayerKind = 'rim' | 'border';

/** What to render for a state; `undefined` means no glow. */
interface ILayerDesc {
	readonly kind: LayerKind;
	/** Warm (agent speaking) instead of cool (user speaking). */
	readonly warm: boolean;
	/** Desaturated: the calm "thinking" border and the idle rim. */
	readonly neutral: boolean;
	/** The dimmer, slower connected-idle breath. */
	readonly idle: boolean;
}

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

/** Breathing parameters, theme- and mood-tuned. */
function rimMotionParams(theme: GlowThemeKind, duration: number) {
	const dark = theme === 'dark';
	const scale = duration / RIM_DURATION.active;
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

function readRadius(el: HTMLElement): number {
	const view = el.ownerDocument.defaultView;
	if (!view) {
		return RADIUS_FALLBACK;
	}
	const parsed = parseFloat(view.getComputedStyle(el).borderTopLeftRadius);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : RADIUS_FALLBACK;
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
	readonly hue: number;
	readonly saturation: number;
	readonly lightness: number;
	readonly strength: number;
	readonly duration: number;
	/** How strongly the audio level modulates the rim. */
	readonly audioGain: number;
	/** How strongly the audio level speeds the breath up. */
	readonly speedGain: number;
}): IMountedLayer {
	const store = new DisposableStore();
	const doc = host.ownerDocument;

	host.classList.add('voice-glow-rim');
	store.add(toDisposable(() => host.classList.remove('voice-glow-rim')));

	for (const cls of ['voice-glow-rim-corners', 'voice-glow-rim-bloom']) {
		const el = doc.createElement('div');
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
		host.style.setProperty('--vg-strength', (options.strength * (0.55 + options.audioGain * level)).toFixed(3));
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

/** Mount the travelling border light on `host`. */
function mountBorderLayer(host: HTMLElement, options: { readonly hue: number; readonly saturation: number; readonly neutral: boolean }): IMountedLayer {
	const store = new DisposableStore();
	host.classList.add('voice-glow-border');
	store.add(toDisposable(() => {
		host.classList.remove('voice-glow-border');
		host.style.removeProperty('--vg-hue');
		host.style.removeProperty('--vg-sat');
		host.style.removeProperty('--vg-level');
		host.style.removeProperty('--vg-spin');
	}));

	host.style.setProperty('--vg-hue', String(Math.round(options.hue)));
	host.style.setProperty('--vg-sat', `${options.saturation}%`);
	host.style.setProperty('--vg-level', '0.3');
	host.style.setProperty('--vg-spin', `${options.neutral ? BORDER_SPIN_NEUTRAL : BORDER_SPIN_ACTIVE}s`);

	let level = 0.3;
	const apply = (input: number, animate: boolean): void => {
		const target = clamp01(input);
		level += animate ? (target - level) * (target > level ? 0.3 : 0.08) : target - level;
		host.style.setProperty('--vg-level', level.toFixed(3));
		if (!options.neutral) {
			// Spin a touch faster with volume.
			host.style.setProperty('--vg-spin', `${(BORDER_SPIN_ACTIVE - 2.5 * level).toFixed(2)}s`);
		}
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

class VoiceGlowController extends Disposable implements IVoiceGlowController {

	/** Two buffered overlay slots, so state changes cross-fade instead of snapping. */
	private readonly _slots: readonly HTMLElement[];
	/** One mount per slot, so mounting a new layer tears the old one down. */
	private readonly _mounts = new Map<HTMLElement, MutableDisposable<IMountedLayer>>();

	private _front: IMountedLayer | undefined;
	private _currentState: VoiceGlowState | 'none' = 'none';
	private _clearTimer: ReturnType<typeof setTimeout> | undefined;
	private _colors: IVoiceGlowColors;
	private _disposed = false;

	constructor(
		private readonly _target: HTMLElement,
		private readonly _themeKind: () => GlowThemeKind = () => 'dark',
		private readonly _colorsProvider: () => IVoiceGlowColors = () => DEFAULT_VOICE_GLOW_COLORS,
	) {
		super();
		this._colors = this._colorsProvider();
		_target.style.position = _target.style.position || 'relative';

		const doc = _target.ownerDocument;
		const createSlot = (): HTMLElement => {
			const el = doc.createElement('div');
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
	}

	override dispose(): void {
		// Hosts commonly register the controller before the stop-hook that calls
		// `clear()`, and a `DisposableStore` disposes in insertion order — so
		// `clear()` can run after this. Flag it up front so that call is a no-op
		// and can't arm a teardown timer nothing will cancel.
		this._disposed = true;
		super.dispose();
	}

	/**
	 * Match the slots to the target's corner radius. Read lazily rather than in the
	 * constructor: hosts commonly build their input box (and the controller) before
	 * it is attached, and a detached element has no computed style to read.
	 */
	private _syncRadius(): void {
		const radius = readRadius(this._target);
		for (const slot of this._slots) {
			slot.style.setProperty('--vg-radius', `${radius}px`);
		}
	}

	render(state: VoiceGlowState, level: number, reducedMotion: boolean): void {
		if (this._disposed) {
			return;
		}
		const desc = resolveLayer(state);
		if (!desc) {
			this.clear();
			return;
		}

		if (state !== this._currentState) {
			this._currentState = state;
			this._syncRadius();
			if (this._clearTimer !== undefined) {
				clearTimeout(this._clearTimer);
				this._clearTimer = undefined;
			}
			// Publish state classes on the target so surface CSS that tints the mic
			// glyph keeps working, plus the accent it should tint with.
			this._target.classList.add('voice-active');
			this._target.classList.toggle('voice-listening', state === 'listening');
			this._target.classList.toggle('voice-processing', state === 'processing');
			this._target.classList.toggle('voice-speaking', state === 'speaking');
			this._target.style.setProperty('--voice-accent', voiceGlowStateColor(state, this._colors).toString());
			this._showLayer(desc, reducedMotion);
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
		this._target.classList.remove('voice-active', 'voice-listening', 'voice-processing', 'voice-speaking');
		this._target.style.removeProperty('--voice-accent');
		const previous = this._front;
		this._front = undefined;
		if (previous) {
			this._fadeOut(previous.host);
			// Tear the mount down once faded out, so it stops driving CSS vars.
			const host = previous.host;
			this._clearTimer = setTimeout(() => {
				this._clearTimer = undefined;
				if (this._front?.host !== host) {
					this._mounts.get(host)?.clear();
				}
			}, FADE_OUT_MS);
		}
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
			this.render(state, 0.3, false);
		}
	}

	private _showLayer(desc: ILayerDesc, reducedMotion: boolean): void {
		const host = this._slots.find(slot => slot !== this._front?.host) ?? this._slots[0];

		// Dispose any prior mount on this slot FIRST: mounts own the slot's classes
		// and custom properties, so disposing after mounting the new layer would
		// strip the fresh ones.
		this._mounts.get(host)!.clear();
		const mounted = this._mount(host, desc);
		this._mounts.get(host)!.value = mounted;
		if (reducedMotion) {
			mounted.driveStatic(0.4);
		}

		const previous = this._front;
		host.style.transition = 'none';
		host.style.opacity = '0';
		host.style.transform = `scale(${ENTER_SCALE})`;
		void host.offsetWidth; // commit the start pose before transitioning from it
		host.style.transition = FADE;
		host.style.opacity = '1';
		host.style.transform = 'scale(1)';
		if (previous && previous.host !== host) {
			this._fadeOut(previous.host);
		}
		this._front = mounted;
	}

	private _fadeOut(host: HTMLElement): void {
		host.style.transition = FADE;
		host.style.opacity = '0';
		host.style.transform = `scale(${EXIT_SCALE})`;
	}

	private _mount(host: HTMLElement, desc: ILayerDesc): IMountedLayer {
		const theme = this._themeKind();
		const accent = desc.kind === 'border' && desc.neutral
			? this._colors.processing
			: desc.warm ? this._colors.speaking : this._colors.listening;
		const { h, s } = accent.hsla;

		if (desc.kind === 'border') {
			return mountBorderLayer(host, {
				hue: h,
				saturation: desc.neutral ? NEUTRAL_SAT : Math.round(Math.min(ACTIVE_SAT_MAX, Math.max(ACTIVE_SAT_MIN, s * 100))),
				neutral: desc.neutral,
			});
		}

		const idle = IDLE_RIM[theme];
		const mood = desc.warm ? 'warm' : 'cool';
		return mountRimLayers(host, {
			theme,
			hue: desc.idle ? h : h + ACTIVE_RIM_HUE_SHIFT[mood],
			saturation: desc.idle ? idle.saturation : Math.round(Math.min(ACTIVE_SAT_MAX, Math.max(ACTIVE_SAT_MIN, s * 100))),
			lightness: desc.idle ? idle.lightness : ACTIVE_RIM_LIGHTNESS[theme][mood],
			strength: desc.idle ? idle.strength : ACTIVE_RIM_STRENGTH,
			duration: desc.idle ? RIM_DURATION.idle : RIM_DURATION.active,
			audioGain: desc.idle ? 0.35 : 0.75,
			speedGain: desc.idle ? 0 : 0.9,
		});
	}
}

/** Map a voice state to the layer that renders it, or `undefined` for no glow. */
function resolveLayer(state: VoiceGlowState): ILayerDesc | undefined {
	switch (state) {
		case 'listening': return { kind: 'rim', warm: false, neutral: false, idle: false };
		case 'speaking': return { kind: 'rim', warm: true, neutral: false, idle: false };
		case 'processing': return { kind: 'border', warm: false, neutral: true, idle: false };
		case 'idle': return { kind: 'rim', warm: false, neutral: true, idle: true };
		default: return undefined;
	}
}

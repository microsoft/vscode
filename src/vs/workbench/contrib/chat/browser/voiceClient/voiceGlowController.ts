/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Color, RGBA } from '../../../../../base/common/color.js';
import { generateBeamCSS, getPulseDriverConfig, sizePresets, sizeThemePresets, type PulseDriverConfig } from './borderBeam/styles.js';
import { BorderBeamSize } from './borderBeam/types.js';
import { DEFAULT_VOICE_GLOW_COLORS, IVoiceGlowColors, VoiceAnimationVariation, VoiceGlowState } from './voiceGlow.js';

/**
 * Production applier for the voice-mode ambient glow. Reproduces the "combined,
 * audio-reactive" design prototyped in the border-beam preview:
 *
 * - `listening` -> a soft exterior BLOOM in cool colors (teal/blue/green),
 * - `speaking`  -> the same exterior bloom shifted to warm colors (pink/purple),
 * - `processing`-> a calm interior RIM breath that composes with the working comet.
 *
 * Every state change is a true cross-fade between two buffered layers (so
 * `listening -> speaking` dissolves cool->warm rather than snapping), and the
 * bloom's intensity, motion speed and hue track the live audio level.
 *
 * The exterior bloom is placed BEHIND the (opaque) input box so only its outward
 * halo shows; the rim is an overlay on top of the box. Idle/error render no glow,
 * matching the connected-idle "no glow" product behaviour.
 *
 * The underlying border-beam effect is vendored from border-beam by Jakub Antalik
 * (MIT) — see `borderBeam/LICENSE.txt`. The state model, audio-reactivity,
 * cool/warm color language and cross-fade choreography here are original.
 */

/** Corner radius used when the target's own radius can't be read. */
const RADIUS_FALLBACK = 6;
/** How far the exterior bloom sits outside the box, in px. */
const BLOOM_LIFT = 3;
/** The vendored bloom displays a hue of about (its hue-rotate center - 85deg).
 *  Add this offset to a target hue to get the center that renders it, so the
 *  organic bloom tracks the same theme-derived hue as the even halo below it. */
const BLOOM_VENDOR_HUE_OFFSET = 85;
/** Cross-fade timing shared by every state transition. */
const FADE = 'opacity .6s cubic-bezier(.4,0,.2,1), transform .6s cubic-bezier(.4,0,.2,1)';
/** Layer scale at the start (incoming) and end (outgoing) of a cross-fade. */
const ENTER_SCALE = 0.94;
const EXIT_SCALE = 1.04;

/**
 * Bloom reach limiters. Keep the vendored blur high enough to stay smooth (a low
 * blur reads as patchy blobs), and pull the *reach* in with the boost multiplier
 * instead. Applied as inline consumer hooks so the vendored CSS is untouched.
 */
const BLOOM_BLUR = { dark: 20, light: 12 } as const;
const BLOOM_CORE_BLUR = { dark: 3, light: 5 } as const;
/** Multiplier on the bloom gradient blob sizes (<1 pulls the reach inward). */
const BLOOM_BOOST = 0.66;
/** Extra reach multiplier on the pulse-glow scale (<1 tightens the halo further). */
const BLOOM_REACH = 0.8;
/** Per-theme weight on the vendored (organic) bloom. Light leans on the cleaner
 *  halo below because the vendored gradient reads as a washed grey on white. */
const BLOOM_VENDOR_MUL = { dark: 1, light: 0.72 } as const;

/**
 * Even, hue-matched halo drawn behind the box to complement the vendored bloom.
 * The vendored pulse-outside gradient blobs are authored top-heavy, so on their
 * own they pile the glow above the box. This symmetric box-shadow ring fills the
 * sides/bottom evenly so the bloom actually wraps; the organic bloom rides on top.
 */
const HALO_HUE_DRIFT = 6; // deg of gentle hue oscillation for life
const HALO_SAT_MIN = { dark: 55, light: 68 } as const; // floor so low-chroma accents still read as color
const HALO_SAT_MAX = 96;
const HALO_LIGHT = { dark: 62, light: 48 } as const;
const HALO_BASE_ALPHA = { dark: 0.20, light: 0.24 } as const;
const HALO_ALPHA_GAIN = 0.22; // extra alpha at full audio level
const HALO_BLUR = { dark: 18, light: 13 } as const;
const HALO_SPREAD_BASE = 0.5; // px
const HALO_SPREAD_GAIN = 3.5; // px added at full audio level

/** Saturation (%) bounds for the CSS border variation. */
const BORDER_ACTIVE_SAT_MIN = 70; // listening / speaking
const BORDER_ACTIVE_SAT_MAX = 96;
const BORDER_NEUTRAL_SAT_MAX = 42; // processing stays calm

/** Parse an "r,g,b" triple (from resolveVoiceGlowColors) into hue (0-360) and
 *  saturation (0-1) so the glow can drive HSL/hue-rotate from the theme accent. */
function hueSatOf(triple: string): { readonly h: number; readonly s: number } {
	const parts = triple.split(',');
	const r = parseInt(parts[0], 10) || 0;
	const g = parseInt(parts[1], 10) || 0;
	const b = parseInt(parts[2], 10) || 0;
	const { h, s } = new Color(new RGBA(r, g, b, 1)).hsla;
	return { h, s };
}


type GlowThemeKind = 'light' | 'dark';

interface IStateConfig {
	readonly family: 'rim' | 'bloom';
	readonly size: BorderBeamSize;
	readonly variant: 'mono' | 'ocean';
	readonly strength: number;
	readonly brightness: number;
	readonly saturation: number;
	readonly duration: number;
	/** bloom only: warm (speaking) vs cool (listening). */
	readonly warm?: boolean;
}

/** Per glowing-state beam recipe (bloom variation). Bright + smooth; reach is
 * pulled in via BLOOM_BOOST rather than by dimming. */
const STATE_CONFIGS: Readonly<Record<'listening' | 'processing' | 'speaking', IStateConfig>> = {
	listening: { family: 'bloom', size: 'pulse-outside', variant: 'ocean', strength: 1.4, brightness: 1.85, saturation: 0.5, duration: 2.3, warm: false },
	processing: { family: 'rim', size: 'pulse-inner', variant: 'mono', strength: 0.62, brightness: 1.3, saturation: 0.2, duration: 2.3 },
	speaking: { family: 'bloom', size: 'pulse-outside', variant: 'ocean', strength: 1.45, brightness: 1.85, saturation: 0.6, duration: 2.3, warm: true },
};

/** The visual layer kind a state maps to for a given variation. */
type LayerKind = 'bloom' | 'rim' | 'border';

/** What to render for a (variation, state) pair; undefined = no glow. */
interface ILayerDesc {
	readonly kind: LayerKind;
	readonly warm: boolean;
	/** border only: the calm "thinking" hue used for processing. */
	readonly neutral?: boolean;
	/** rim only: the dimmer, slower idle breath. */
	readonly subtle?: boolean;
}

/** A live layer mounted on one of the buffered slot hosts. */
interface IMountedLayer extends IDisposable {
	readonly host: HTMLElement;
	readonly desc: ILayerDesc;
	/** Advance motion + intensity from the smoothed audio `level` ([0,1]). */
	drive(level: number): void;
	/** Pin to a representative still frame (reduced motion). */
	driveStatic(level: number): void;
}

export interface IVoiceGlowController extends IDisposable {
	/**
	 * Show/keep the glow for `state`, driving intensity from `level` ([0,1]).
	 * `variation` selects the look (soft exterior bloom vs travelling border).
	 */
	render(state: VoiceGlowState, level: number, reducedMotion: boolean, variation?: VoiceAnimationVariation): void;
	/** Fade the glow out (idle / not-owner / disconnected). */
	clear(): void;
	/** Re-apply the current state after a color-theme change so presets update. */
	refreshTheme(): void;
}

let beamSeq = 0;

/**
 * Injects one border-beam instance onto `host` (CSS + `[data-beam]` attrs + bloom
 * child + `pulse-outside` scaling), returning the driver config for callers that
 * want to drive it manually. Mirrors {@link applyBorderBeam} but never registers
 * the shared pulse loop, so the bloom can be hand-driven for the constrained
 * cool/warm hue and audio-reactive strength.
 */
function injectBeam(host: HTMLElement, config: IStateConfig, theme: GlowThemeKind, radiusOverride?: number): { id: string; driver: PulseDriverConfig | undefined; hueProp: string | undefined; dispose: () => void } {
	const id = `voiceglow-${beamSeq++}`;
	const { size, variant, brightness, saturation, duration } = config;
	const themeConfig = sizeThemePresets[size][theme];
	const sizeConfig = sizePresets[size];
	const staticColors = variant === 'mono';
	const radius = radiusOverride ?? readRadius(host);

	const css = generateBeamCSS({
		id,
		borderRadius: config.family === 'bloom' ? radius + BLOOM_LIFT : radius,
		borderWidth: sizeConfig.borderWidth,
		duration,
		strokeOpacity: themeConfig.strokeOpacity,
		innerOpacity: themeConfig.innerOpacity,
		bloomOpacity: themeConfig.bloomOpacity,
		innerShadow: themeConfig.innerShadow,
		size,
		colorVariant: variant,
		staticColors,
		brightness,
		saturation,
		hueRange: 30,
		theme,
		hairlineOpacity: themeConfig.hairlineOpacity,
	});

	const doc = host.ownerDocument;
	const root = host.getRootNode() as Document | ShadowRoot;

	// `@property` rules only register at document scope; hoist them to the document
	// head and keep the scoped selectors in the host's (possibly shadow) root.
	const propertyRules = css.match(/@property[^{]+\{[^}]*\}/g)?.join('\n') ?? '';
	const scopedCss = css.replace(/@property[^{]+\{[^}]*\}/g, '');

	const store = new DisposableStore();

	if (propertyRules) {
		const propEl = doc.createElement('style');
		propEl.textContent = propertyRules;
		doc.head.appendChild(propEl);
		store.add(toDisposable(() => propEl.remove()));
	}

	const styleEl = doc.createElement('style');
	styleEl.textContent = scopedCss;
	const styleParent: Node = root instanceof ShadowRoot ? root : doc.head;
	styleParent.appendChild(styleEl);
	store.add(toDisposable(() => styleEl.remove()));

	const bloom = doc.createElement('div');
	bloom.setAttribute('data-beam-bloom', '');
	host.appendChild(bloom);
	store.add(toDisposable(() => bloom.remove()));

	host.setAttribute('data-beam', id);
	host.style.setProperty('--beam-strength', String(config.strength));
	host.style.setProperty('--beam-hue-base', '0deg');
	if (size === 'pulse-outside') {
		// Pull the reach inward: tighter blur + a boost < 1 shrinks the halo so it
		// reads as a calm glow rather than a wide diffuse wash.
		host.style.setProperty('--beam-bloom-blur', `${BLOOM_BLUR[theme]}px`);
		host.style.setProperty('--beam-core-blur', `${BLOOM_CORE_BLUR[theme]}px`);
		host.style.setProperty('--pulse-glow-boost', String(BLOOM_BOOST));
		const rect = host.getBoundingClientRect();
		const clamp = (v: number) => Math.max(0.35, Math.min(4, v));
		if (rect.width && rect.height) {
			host.style.setProperty('--pulse-glow-sx', clamp(rect.width / 350 * BLOOM_REACH).toFixed(3));
			host.style.setProperty('--pulse-glow-sy', clamp(rect.height / 140 * BLOOM_REACH).toFixed(3));
		}
	}
	host.setAttribute('data-active', '');
	store.add(toDisposable(() => {
		host.removeAttribute('data-beam');
		host.removeAttribute('data-active');
		host.style.removeProperty('--beam-strength');
		host.style.removeProperty('--beam-hue-base');
		host.style.removeProperty('--beam-bloom-blur');
		host.style.removeProperty('--beam-core-blur');
		host.style.removeProperty('--pulse-glow-boost');
		host.style.removeProperty('--pulse-glow-sx');
		host.style.removeProperty('--pulse-glow-sy');
	}));

	const isPulse = size === 'pulse-inner' || size === 'pulse-outside';
	const driver = isPulse ? getPulseDriverConfig(size, theme, duration, 30, staticColors, id) : undefined;
	const hueProp = driver?.hue?.prop;

	return { id, driver: driver ?? undefined, hueProp, dispose: () => store.dispose() };
}

function readRadius(el: HTMLElement): number {
	const view = el.ownerDocument.defaultView;
	if (!view) {
		return RADIUS_FALLBACK;
	}
	const parsed = parseFloat(view.getComputedStyle(el).borderTopLeftRadius);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : RADIUS_FALLBACK;
}

/**
 * Inject a scoped stylesheet for a host, hoisting any `@property` rules to the
 * document head (they only register at document scope) and keeping the scoped
 * selectors in the host's root (shadow DOM aware). Returns a disposable that
 * removes both style elements. Shared by the CSS border variation.
 */
function injectScopedCss(host: HTMLElement, css: string): IDisposable {
	const doc = host.ownerDocument;
	const root = host.getRootNode() as Document | ShadowRoot;
	const propertyRules = css.match(/@property[^{]+\{[^}]*\}/g)?.join('\n') ?? '';
	const scopedCss = css.replace(/@property[^{]+\{[^}]*\}/g, '');
	const store = new DisposableStore();
	if (propertyRules) {
		const propEl = doc.createElement('style');
		propEl.textContent = propertyRules;
		doc.head.appendChild(propEl);
		store.add(toDisposable(() => propEl.remove()));
	}
	const styleEl = doc.createElement('style');
	styleEl.textContent = scopedCss;
	(root instanceof ShadowRoot ? root : doc.head).appendChild(styleEl);
	store.add(toDisposable(() => styleEl.remove()));
	return store;
}

/**
 * Original CSS for the "border" variation: a light that travels around the input
 * edge (a masked conic-gradient ring) plus an audio-reactive inner glow. Hue is
 * driven by `--vg-hue`; intensity by `--vg-level`; spin period by `--vg-spin`.
 * Theme-tuned so it reads on light backgrounds. Not derived from border-beam.
 */
function borderCss(id: string, radius: number, theme: GlowThemeKind): string {
	const light = theme === 'light';
	const l = light ? 52 : 72;   // base lightness
	const lh = light ? 56 : 78;  // head lightness
	// Alphas: keep a continuous base glow around the whole ring (never fully
	// transparent) so it reads as a lit border with a travelling bright head,
	// rather than isolated arcs that look like "only part" of the box glows.
	const aBase = light ? 0.28 : 0.32;
	const aHead = light ? 0.9 : 0.98;
	const aMid = light ? 0.45 : 0.55;
	const glowL = light ? 56 : 66;
	const glowA = light ? 0.16 : 0.2;
	return `
@property --vg-ang-${id} { syntax: '<angle>'; inherits: false; initial-value: 0deg; }
@keyframes vg-rot-${id} { to { --vg-ang-${id}: 360deg; } }
[data-vgborder="${id}"] { position: absolute; inset: 0; border-radius: ${radius}px; pointer-events: none; }
[data-vgborder="${id}"]::before {
	content: ''; position: absolute; inset: 0; border-radius: inherit; padding: 1.4px;
	background: conic-gradient(from var(--vg-ang-${id}, 0deg),
		hsl(var(--vg-hue, 200) var(--vg-sat, 92%) ${l}% / ${aBase}) 0deg,
		hsl(var(--vg-hue, 200) var(--vg-sat, 92%) ${lh}% / ${aHead}) 45deg,
		hsl(calc(var(--vg-hue, 200) + 20) var(--vg-sat, 92%) ${lh}% / ${aMid}) 110deg,
		hsl(var(--vg-hue, 200) var(--vg-sat, 92%) ${l}% / ${aBase}) 200deg,
		hsl(calc(var(--vg-hue, 200) - 16) var(--vg-sat, 92%) ${l}% / ${aMid}) 290deg,
		hsl(var(--vg-hue, 200) var(--vg-sat, 92%) ${l}% / ${aBase}) 360deg);
	-webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor;
	mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); mask-composite: exclude;
	animation: vg-rot-${id} var(--vg-spin, 7s) linear infinite;
}
[data-vgborder="${id}"]::after {
	content: ''; position: absolute; inset: 0; border-radius: inherit;
	box-shadow: inset 0 0 12px hsl(var(--vg-hue, 200) 92% ${glowL}% / calc(${glowA} + 0.34 * var(--vg-level, 0.3)));
}
@media (prefers-reduced-motion: reduce) {
	[data-vgborder="${id}"]::before { animation: none; }
}`;
}


/**
 * Create a voice glow controller bound to `target` (the input box). `themeKind`
 * lets the caller supply the active light/dark theme so the glow uses the right
 * presets (defaults to dark). The bloom is mounted BEHIND the box (self-masking
 * to the exterior); the rim / border overlay it.
 */
export function createVoiceGlowController(target: HTMLElement, themeKind?: () => GlowThemeKind, colors?: () => IVoiceGlowColors): IVoiceGlowController {
	return new VoiceGlowController(target, themeKind, colors);
}

/** A standalone, audio-reactive interior rim light (the "Inside Rim" treatment). */
export interface IVoiceRim extends IDisposable {
	/** Fade the rim in / out. */
	show(): void;
	hide(): void;
	/** Advance motion + intensity from `level` ([0,1]); call each frame while shown. */
	drive(level: number): void;
	/** Pin to a representative still frame at `level` (reduced motion). */
	driveStatic(level: number): void;
}

/**
 * Mount a breathing border-beam rim on `target`, locked to the cool (listening)
 * colors by default. Used to give the dictation microphone the same premium
 * "Inside Rim" light as Voice Mode instead of a flat glow. Warm mode is available
 * for symmetry. The rim overlays the target's edge (its center is transparent, so
 * it never obscures the button glyph).
 */
export function createVoiceRim(target: HTMLElement, options?: { readonly warm?: boolean; readonly pill?: boolean; readonly themeKind?: () => GlowThemeKind; readonly colors?: () => IVoiceGlowColors }): IVoiceRim {
	const store = new DisposableStore();
	const doc = target.ownerDocument;
	const host = doc.createElement('div');
	host.className = 'voice-glow-slot voice-glow-slot-rim';
	host.style.position = 'absolute';
	host.style.inset = '0';
	host.style.zIndex = '4';
	host.style.pointerEvents = 'none';
	host.style.opacity = '0';
	host.style.transition = 'opacity .35s ease';
	target.style.position = target.style.position || 'relative';
	target.appendChild(host);
	store.add(toDisposable(() => host.remove()));

	// When the host sits on a fully-rounded (pill) control like the dictation
	// button, match that shape instead of the small default radius so the rim
	// hugs the pill ends rather than poking square-ish corners through them.
	const rect = target.getBoundingClientRect();
	const pillRadius = Math.max(8, Math.round((rect.height || 22) / 2));
	const radius = options?.pill ? pillRadius : readRadius(target);
	host.style.borderRadius = options?.pill ? 'var(--vscode-cornerRadius-circle)' : `${radius}px`;

	const config: IStateConfig = { family: 'rim', size: 'pulse-inner', variant: 'ocean', strength: 0.7, brightness: 1.4, saturation: 0.55, duration: 2.3, warm: options?.warm };
	const beam = injectBeam(host, config, options?.themeKind?.() ?? 'dark', radius);
	store.add(toDisposable(beam.dispose));

	const rimColors = options?.colors?.() ?? DEFAULT_VOICE_GLOW_COLORS;
	const center = hueSatOf(options?.warm ? rimColors.speaking : rimColors.listening).h + BLOOM_VENDOR_HUE_OFFSET;
	const view = doc.defaultView;
	let animTime = 0;
	let prevTs: number | undefined;
	let level = 0.2;
	let hueNow = center;

	const applyMotion = (osc: { prop: string; a: number; b: number; period: number; delay: number; unit: string }, value: number): void => {
		host.style.setProperty(osc.prop, osc.unit === 'px' ? `${value.toFixed(2)}px` : value.toFixed(4));
	};

	const drive = (input: number): void => {
		const ts = (view?.performance ?? performance).now() / 1000;
		const dt = prevTs === undefined ? 0 : Math.min(0.05, ts - prevTs);
		prevTs = ts;
		const target01 = Math.max(0, Math.min(1, input));
		level += (target01 - level) * (target01 > level ? 0.35 : 0.09);
		animTime += dt * (0.4 + 0.9 * level);
		if (beam.driver) {
			for (const osc of beam.driver.oscillators) {
				const phase = (animTime - osc.delay) / osc.period;
				applyMotion(osc, osc.a + (osc.b - osc.a) * ((1 - Math.cos(2 * Math.PI * phase)) / 2));
			}
		}
		host.style.setProperty('--beam-strength', (config.strength * (0.55 + 0.75 * level)).toFixed(3));
		if (beam.hueProp) {
			hueNow += (center - hueNow) * 0.06;
			host.style.setProperty(beam.hueProp, `${(hueNow + 14 * Math.sin(animTime * 0.4)).toFixed(1)}deg`);
		}
	};

	const driveStatic = (input: number): void => {
		if (beam.driver) {
			for (const osc of beam.driver.oscillators) {
				applyMotion(osc, (osc.a + osc.b) / 2);
			}
		}
		host.style.setProperty('--beam-strength', (config.strength * (0.55 + 0.75 * Math.max(0, Math.min(1, input)))).toFixed(3));
		if (beam.hueProp) {
			host.style.setProperty(beam.hueProp, `${center.toFixed(1)}deg`);
		}
	};

	return {
		show: () => { host.style.opacity = '1'; },
		hide: () => { host.style.opacity = '0'; },
		drive,
		driveStatic,
		dispose: () => store.dispose(),
	};
}

class VoiceGlowController extends Disposable implements IVoiceGlowController {

	/** Exterior hosts (behind the box) for the bloom variation. */
	private readonly _exterior: readonly HTMLElement[];
	/** Interior overlay hosts (on the box edge) for the rim / border variations. */
	private readonly _interior: readonly HTMLElement[];
	/** MutableDisposable per host so mounting a new layer disposes the old one. */
	private readonly _mounts = new Map<HTMLElement, MutableDisposable<IMountedLayer>>();

	private _front: IMountedLayer | undefined;
	private _currentState: VoiceGlowState | 'none' = 'none';
	private _variation: VoiceAnimationVariation = 'bloom';
	private _clearTimer: ReturnType<typeof setTimeout> | undefined;

	private readonly _targetRadius: number;

	/** Theme-derived per-state accent colors ("r,g,b"), refreshed on theme change. */
	private _colors: IVoiceGlowColors;

	constructor(
		private readonly _target: HTMLElement,
		private readonly _themeKind: () => GlowThemeKind = () => 'dark',
		private readonly _colorsProvider: () => IVoiceGlowColors = () => DEFAULT_VOICE_GLOW_COLORS,
	) {
		super();
		this._colors = this._colorsProvider();
		_target.style.position = _target.style.position || 'relative';
		const doc = _target.ownerDocument;
		const view = doc.defaultView;
		this._targetRadius = readRadius(_target);

		// The exterior bloom must live on a NON-clipped ancestor: the input box is
		// commonly `overflow: hidden`, which would clip an exterior child. Use the
		// parent (falling back to the box) and make sure it can position children.
		const parent = _target.parentElement ?? _target;
		if (parent !== _target && view && view.getComputedStyle(parent).position === 'static') {
			parent.style.position = 'relative';
		}

		const mkInterior = (): HTMLElement => {
			const el = doc.createElement('div');
			el.className = 'voice-glow-slot voice-glow-slot-interior';
			el.style.cssText = 'position:absolute;inset:0;z-index:4;pointer-events:none;opacity:0;will-change:opacity,transform;';
			el.style.borderRadius = `${this._targetRadius}px`;
			_target.appendChild(el);
			this._register(toDisposable(() => el.remove()));
			return el;
		};
		const mkExterior = (): HTMLElement => {
			const el = doc.createElement('div');
			el.className = 'voice-glow-slot voice-glow-slot-bloom';
			el.style.cssText = 'position:absolute;pointer-events:none;opacity:0;will-change:opacity,transform;';
			el.style.borderRadius = `${this._targetRadius}px`;
			// Insert before the box so it paints behind it (both positioned, auto z).
			parent.insertBefore(el, parent === _target ? _target.firstChild : _target);
			this._register(toDisposable(() => el.remove()));
			return el;
		};
		this._interior = [mkInterior(), mkInterior()];
		this._exterior = [mkExterior(), mkExterior()];
		this._syncGeometry();

		const ResizeObserverCtor = view?.ResizeObserver;
		if (ResizeObserverCtor) {
			const ro = new ResizeObserverCtor(() => this._syncGeometry());
			ro.observe(_target);
			this._register(toDisposable(() => ro.disconnect()));
		}

		for (const el of [...this._exterior, ...this._interior]) {
			this._mounts.set(el, this._register(new MutableDisposable<IMountedLayer>()));
		}
		this._register(toDisposable(() => {
			if (this._clearTimer !== undefined) {
				clearTimeout(this._clearTimer);
			}
		}));
	}

	/** Keep the exterior bloom layers aligned to (and lifted around) the box. */
	private _syncGeometry(): void {
		const t = this._target;
		const left = t.offsetLeft - BLOOM_LIFT;
		const top = t.offsetTop - BLOOM_LIFT;
		const w = t.offsetWidth + 2 * BLOOM_LIFT;
		const h = t.offsetHeight + 2 * BLOOM_LIFT;
		const clamp = (v: number) => Math.max(0.35, Math.min(4, v));
		for (const el of this._exterior) {
			el.style.left = `${left}px`;
			el.style.top = `${top}px`;
			el.style.width = `${w}px`;
			el.style.height = `${h}px`;
			el.style.setProperty('--pulse-glow-sx', clamp(w / 350 * BLOOM_REACH).toFixed(3));
			el.style.setProperty('--pulse-glow-sy', clamp(h / 140 * BLOOM_REACH).toFixed(3));
		}
	}

	/** Map (variation, state) to the layer to render, or undefined for no glow. */
	private _resolve(variation: VoiceAnimationVariation, state: VoiceGlowState): ILayerDesc | undefined {
		switch (variation) {
			case 'border':
				if (state === 'listening') { return { kind: 'border', warm: false }; }
				if (state === 'speaking') { return { kind: 'border', warm: true }; }
				if (state === 'processing') { return { kind: 'border', warm: false, neutral: true }; }
				return undefined;
			case 'rim':
				if (state === 'listening') { return { kind: 'rim', warm: false }; }
				if (state === 'speaking') { return { kind: 'rim', warm: true }; }
				if (state === 'processing') { return { kind: 'border', warm: false, neutral: true }; }
				if (state === 'idle') { return { kind: 'rim', warm: false, subtle: true }; }
				return undefined;
			case 'bloom':
			default:
				if (state === 'listening') { return { kind: 'bloom', warm: false }; }
				if (state === 'speaking') { return { kind: 'bloom', warm: true }; }
				if (state === 'processing') { return { kind: 'rim', warm: false }; }
				return undefined;
		}
	}

	render(state: VoiceGlowState, level: number, reducedMotion: boolean, variation: VoiceAnimationVariation = 'bloom'): void {
		const desc = this._resolve(variation, state);
		if (!desc) {
			this.clear();
			return;
		}

		if (state !== this._currentState || variation !== this._variation) {
			this._currentState = state;
			this._variation = variation;
			if (this._clearTimer !== undefined) {
				clearTimeout(this._clearTimer);
				this._clearTimer = undefined;
			}
			// Publish state classes on the target so surface CSS that tints the mic
			// glyph (blue listening / purple speaking) keeps working.
			this._target.classList.add('voice-active');
			this._target.classList.toggle('voice-listening', state === 'listening');
			this._target.classList.toggle('voice-processing', state === 'processing');
			this._target.classList.toggle('voice-speaking', state === 'speaking');
			this._showLayer(desc, reducedMotion);
		}

		if (this._front && !reducedMotion) {
			this._front.drive(level);
		}
	}

	clear(): void {
		if (this._currentState === 'none') {
			return;
		}
		this._currentState = 'none';
		this._target.classList.remove('voice-active', 'voice-listening', 'voice-processing', 'voice-speaking');
		const prev = this._front;
		this._front = undefined;
		if (prev) {
			prev.host.style.transition = FADE;
			prev.host.style.opacity = '0';
			prev.host.style.transform = `scale(${EXIT_SCALE})`;
			// Dispose the mount once faded out so its CSS animation stops.
			const host = prev.host;
			this._clearTimer = setTimeout(() => {
				this._clearTimer = undefined;
				if (this._front?.host !== host) {
					this._mounts.get(host)?.clear();
				}
			}, 650);
		}
	}

	refreshTheme(): void {
		this._colors = this._colorsProvider();
		if (this._front) {
			// Re-mount the current layer so it picks up the new theme colors/presets.
			const state = this._currentState;
			const variation = this._variation;
			this._currentState = 'none';
			if (state !== 'none') {
				this.render(state, 0.3, false, variation);
			}
		}
	}

	/** Theme-derived hue (0-360) + saturation (0-1) for a glowing state. */
	private _hs(kind: 'listening' | 'speaking' | 'processing'): { readonly h: number; readonly s: number } {
		return hueSatOf(kind === 'speaking' ? this._colors.speaking : kind === 'processing' ? this._colors.processing : this._colors.listening);
	}

	private _showLayer(desc: ILayerDesc, reducedMotion: boolean): void {
		const pair = desc.kind === 'bloom' ? this._exterior : this._interior;
		const host = pair.find(h => h !== this._front?.host) ?? pair[0];

		// Dispose any prior mount on this host FIRST: mounts share their host's
		// attributes (data-beam / data-vgborder), so disposing after creating the
		// new one would strip the fresh attributes. (Reused when the same host is
		// revisited, e.g. the rim variation's speaking -> processing -> idle.)
		this._mounts.get(host)!.clear();
		const mounted = this._mount(host, desc, reducedMotion);
		this._mounts.get(host)!.value = mounted;
		if (reducedMotion) {
			mounted.driveStatic(0.4);
		}

		// Cross-fade: incoming in, previous out.
		const prev = this._front;
		host.style.transition = 'none';
		host.style.opacity = '0';
		host.style.transform = `scale(${ENTER_SCALE})`;
		void host.offsetWidth; // commit start pose (FLIP)
		host.style.transition = FADE;
		host.style.opacity = '1';
		host.style.transform = 'scale(1)';
		if (prev && prev.host !== host) {
			prev.host.style.transition = FADE;
			prev.host.style.opacity = '0';
			prev.host.style.transform = `scale(${EXIT_SCALE})`;
		}
		this._front = mounted;
	}

	private _mount(host: HTMLElement, desc: ILayerDesc, reducedMotion: boolean): IMountedLayer {
		switch (desc.kind) {
			case 'bloom': return this._mountBloom(host, desc);
			case 'rim': return this._mountRim(host, desc, reducedMotion);
			case 'border': return this._mountBorder(host, desc);
		}
	}

	private _perf(): number {
		const view = this._target.ownerDocument.defaultView;
		return (view?.performance ?? performance).now() / 1000;
	}

	private _mountBloom(host: HTMLElement, desc: ILayerDesc): IMountedLayer {
		const config = desc.warm ? STATE_CONFIGS.speaking : STATE_CONFIGS.listening;
		const theme = this._themeKind();
		const beam = injectBeam(host, config, theme, this._targetRadius);
		const hs = this._hs(desc.warm ? 'speaking' : 'listening');
		const center = hs.h + BLOOM_VENDOR_HUE_OFFSET;
		const haloHue = hs.h;
		const haloSat = Math.round(Math.min(HALO_SAT_MAX, Math.max(HALO_SAT_MIN[theme], hs.s * 100)));
		// Even halo behind the box so the (top-heavy) vendored bloom wraps all sides.
		const halo = host.ownerDocument.createElement('div');
		halo.style.cssText = 'position:absolute;inset:0;pointer-events:none;background:transparent;';
		halo.style.borderRadius = `${this._targetRadius + BLOOM_LIFT}px`;
		host.insertBefore(halo, host.firstChild);
		let animTime = 0;
		let prevTs: number | undefined;
		let lvl = 0.3;
		const apply = (level: number, animate: boolean): void => {
			if (animate) {
				const ts = this._perf();
				const dt = prevTs === undefined ? 0 : Math.min(0.05, ts - prevTs);
				prevTs = ts;
				const target = Math.max(0, Math.min(1, level));
				lvl += (target - lvl) * (target > lvl ? 0.35 : 0.09);
				animTime += dt * (0.28 + 1.05 * lvl);
			} else {
				lvl = Math.max(0, Math.min(1, level));
			}
			if (beam.driver) {
				for (const osc of beam.driver.oscillators) {
					const value = animate
						? osc.a + (osc.b - osc.a) * ((1 - Math.cos(2 * Math.PI * ((animTime - osc.delay) / osc.period))) / 2)
						: (osc.a + osc.b) / 2;
					host.style.setProperty(osc.prop, osc.unit === 'px' ? `${value.toFixed(2)}px` : value.toFixed(4));
				}
			}
			host.style.setProperty('--beam-strength', (config.strength * (0.6 + 0.9 * lvl) * BLOOM_VENDOR_MUL[theme]).toFixed(3));
			if (beam.hueProp) {
				const drift = desc.warm ? 12 : 16;
				const vShift = desc.warm ? -7 * lvl : 8 * lvl;
				const hue = center + (animate ? drift * Math.sin(animTime * 0.45) : 0) + vShift;
				host.style.setProperty(beam.hueProp, `${hue.toFixed(1)}deg`);
			}
			const alpha = HALO_BASE_ALPHA[theme] + HALO_ALPHA_GAIN * lvl;
			const spread = HALO_SPREAD_BASE + HALO_SPREAD_GAIN * lvl;
			const hue = haloHue + (animate ? HALO_HUE_DRIFT * Math.sin(animTime * 0.4) : 0);
			halo.style.boxShadow = `0 0 ${HALO_BLUR[theme]}px ${spread.toFixed(2)}px hsla(${hue.toFixed(1)}, ${haloSat}%, ${HALO_LIGHT[theme]}%, ${alpha.toFixed(3)})`;
		};
		return {
			host, desc,
			drive: (level: number) => apply(level, true),
			driveStatic: (level: number) => apply(level, false),
			dispose: () => { halo.remove(); beam.dispose(); },
		};
	}

	private _mountRim(host: HTMLElement, desc: ILayerDesc, _reducedMotion: boolean): IMountedLayer {
		const subtle = !!desc.subtle;
		const config: IStateConfig = {
			family: 'rim', size: 'pulse-inner', variant: 'ocean',
			strength: subtle ? 0.45 : 0.86, brightness: subtle ? 1.1 : 1.35,
			saturation: 0.55, duration: subtle ? 4.8 : 2.3, warm: desc.warm,
		};
		const beam = injectBeam(host, config, this._themeKind(), this._targetRadius);
		const center = this._hs(desc.warm ? 'speaking' : 'listening').h + BLOOM_VENDOR_HUE_OFFSET;
		let animTime = 0;
		let prevTs: number | undefined;
		let lvl = subtle ? 0.15 : 0.25;
		let hueNow = center;
		const apply = (level: number, animate: boolean): void => {
			if (animate) {
				const ts = this._perf();
				const dt = prevTs === undefined ? 0 : Math.min(0.05, ts - prevTs);
				prevTs = ts;
				const target = Math.max(0, Math.min(1, level));
				lvl += (target - lvl) * (target > lvl ? 0.3 : 0.08);
				animTime += dt * (subtle ? 0.22 : 0.4 + 0.9 * lvl);
			} else {
				lvl = Math.max(0, Math.min(1, level));
			}
			if (beam.driver) {
				for (const osc of beam.driver.oscillators) {
					const value = animate
						? osc.a + (osc.b - osc.a) * ((1 - Math.cos(2 * Math.PI * ((animTime - osc.delay) / osc.period))) / 2)
						: (osc.a + osc.b) / 2;
					host.style.setProperty(osc.prop, osc.unit === 'px' ? `${value.toFixed(2)}px` : value.toFixed(4));
				}
			}
			const audioGain = subtle ? 0.35 : 0.75;
			host.style.setProperty('--beam-strength', (config.strength * (0.55 + audioGain * lvl)).toFixed(3));
			if (beam.hueProp) {
				hueNow += (center - hueNow) * 0.06;
				host.style.setProperty(beam.hueProp, `${(hueNow + (animate ? 14 * Math.sin(animTime * 0.4) : 0)).toFixed(1)}deg`);
			}
		};
		return {
			host, desc,
			drive: (level: number) => apply(level, true),
			driveStatic: (level: number) => apply(level, false),
			dispose: () => beam.dispose(),
		};
	}

	private _mountBorder(host: HTMLElement, desc: ILayerDesc): IMountedLayer {
		const id = `voiceglow-${beamSeq++}`;
		const css = borderCss(id, this._targetRadius, this._themeKind());
		const cssDisposable = injectScopedCss(host, css);
		host.setAttribute('data-vgborder', id);
		const hs = this._hs(desc.neutral ? 'processing' : desc.warm ? 'speaking' : 'listening');
		const hue = Math.round(hs.h);
		const sat = desc.neutral
			? Math.round(Math.min(BORDER_NEUTRAL_SAT_MAX, hs.s * 100))
			: Math.round(Math.min(BORDER_ACTIVE_SAT_MAX, Math.max(BORDER_ACTIVE_SAT_MIN, hs.s * 100)));
		host.style.setProperty('--vg-hue', String(hue));
		host.style.setProperty('--vg-sat', `${sat}%`);
		host.style.setProperty('--vg-level', '0.3');
		host.style.setProperty('--vg-spin', desc.neutral ? '9s' : '7s');
		let lvl = 0.3;
		const apply = (level: number, animate: boolean): void => {
			const target = Math.max(0, Math.min(1, level));
			lvl += animate ? (target - lvl) * (target > lvl ? 0.3 : 0.08) : (target - lvl);
			host.style.setProperty('--vg-level', lvl.toFixed(3));
			// Spin a touch faster with volume (active states only).
			if (!desc.neutral) {
				host.style.setProperty('--vg-spin', `${(7 - 2.5 * lvl).toFixed(2)}s`);
			}
		};
		return {
			host, desc,
			drive: (level: number) => apply(level, true),
			driveStatic: (level: number) => apply(level, false),
			dispose: () => {
				cssDisposable.dispose();
				host.removeAttribute('data-vgborder');
				host.style.removeProperty('--vg-hue');
				host.style.removeProperty('--vg-sat');
				host.style.removeProperty('--vg-level');
				host.style.removeProperty('--vg-spin');
			},
		};
	}
}

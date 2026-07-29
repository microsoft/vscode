/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { generateBeamCSS, getPulseDriverConfig, sizePresets, sizeThemePresets, type PulseDriverConfig } from './borderBeam/styles.js';
import { registerPulseInstance } from './borderBeam/pulseDriver.js';
import { BorderBeamSize } from './borderBeam/types.js';
import { VoiceGlowState } from './voiceGlow.js';

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
/** hue-rotate centers (deg) for the cool (listening) / warm (speaking) bloom. */
const COOL_CENTER = 285;
const WARM_CENTER = 415; // == 55 + 360, so cool->warm eases up through blue/purple, never green/orange
/** Cross-fade timing shared by every state transition. */
const FADE = 'opacity .6s cubic-bezier(.4,0,.2,1), transform .6s cubic-bezier(.4,0,.2,1)';
/** Layer scale at the start (incoming) and end (outgoing) of a cross-fade. */
const ENTER_SCALE = 0.94;
const EXIT_SCALE = 1.04;

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

/** Per glowing-state beam recipe, ported 1:1 from the approved combo2 preview. */
const STATE_CONFIGS: Readonly<Record<'listening' | 'processing' | 'speaking', IStateConfig>> = {
	listening: { family: 'bloom', size: 'pulse-outside', variant: 'ocean', strength: 1.45, brightness: 1.9, saturation: 0.5, duration: 2.3, warm: false },
	processing: { family: 'rim', size: 'pulse-inner', variant: 'mono', strength: 0.62, brightness: 1.3, saturation: 0.2, duration: 2.3 },
	speaking: { family: 'bloom', size: 'pulse-outside', variant: 'ocean', strength: 1.53, brightness: 1.9, saturation: 0.6, duration: 2.3, warm: true },
};

/** A live beam instance mounted on one of the buffered slot hosts. */
interface ILayer {
	readonly host: HTMLElement;
	readonly config: IStateConfig;
	readonly driver: PulseDriverConfig | undefined;
	readonly hueProp: string | undefined;
	readonly disposable: IDisposable;
}

export interface IVoiceGlowController extends IDisposable {
	/** Show/keep the glow for `state`, driving intensity from `level` ([0,1]). */
	render(state: VoiceGlowState, level: number, reducedMotion: boolean): void;
	/** Fade the glow out (idle / not-owner / disconnected). */
	clear(): void;
}

let beamSeq = 0;

/**
 * Injects one border-beam instance onto `host` (CSS + `[data-beam]` attrs + bloom
 * child + `pulse-outside` scaling), returning the driver config for callers that
 * want to drive it manually. Mirrors {@link applyBorderBeam} but never registers
 * the shared pulse loop, so the bloom can be hand-driven for the constrained
 * cool/warm hue and audio-reactive strength.
 */
function injectBeam(host: HTMLElement, config: IStateConfig): { id: string; driver: PulseDriverConfig | undefined; hueProp: string | undefined; dispose: () => void } {
	const id = `voiceglow-${beamSeq++}`;
	const { size, variant, brightness, saturation, duration } = config;
	const theme = 'dark';
	const themeConfig = sizeThemePresets[size][theme];
	const sizeConfig = sizePresets[size];
	const staticColors = variant === 'mono';
	const radius = readRadius(host);

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
		const rect = host.getBoundingClientRect();
		const clamp = (v: number) => Math.max(0.35, Math.min(4, v));
		if (rect.width && rect.height) {
			host.style.setProperty('--pulse-glow-sx', clamp(rect.width / 350).toFixed(3));
			host.style.setProperty('--pulse-glow-sy', clamp(rect.height / 140).toFixed(3));
		}
	}
	host.setAttribute('data-active', '');
	store.add(toDisposable(() => {
		host.removeAttribute('data-beam');
		host.removeAttribute('data-active');
		host.style.removeProperty('--beam-strength');
		host.style.removeProperty('--beam-hue-base');
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
 * Create a voice glow controller bound to `target` (the input box). The bloom is
 * mounted BEHIND the box (self-masking to the exterior); the rim overlays it.
 */
export function createVoiceGlowController(target: HTMLElement): IVoiceGlowController {
	return new VoiceGlowController(target);
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
export function createVoiceRim(target: HTMLElement, options?: { readonly warm?: boolean }): IVoiceRim {
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

	const config: IStateConfig = { family: 'rim', size: 'pulse-inner', variant: 'ocean', strength: 0.7, brightness: 1.4, saturation: 0.55, duration: 2.3, warm: options?.warm };
	const beam = injectBeam(host, config);
	store.add(toDisposable(beam.dispose));

	const center = options?.warm ? WARM_CENTER : COOL_CENTER;
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

	private readonly _bloomSlots: readonly HTMLElement[];
	private readonly _rimSlots: readonly HTMLElement[];
	/** MutableDisposable per slot so mounting a new beam disposes the slot's old one. */
	private readonly _slotBeams = new Map<HTMLElement, MutableDisposable<IDisposable>>();
	private readonly _rimRegs = new Map<HTMLElement, MutableDisposable<IDisposable>>();

	private _front: ILayer | undefined;
	private _currentState: VoiceGlowState | 'none' = 'none';
	private _slotToggle = { rim: 0, bloom: 0 };

	// Bloom drive state.
	private _animTime = 0;
	private _prevTs: number | undefined;
	private _level = 0.3;
	private _hueNow = COOL_CENTER;
	private _hueTarget = COOL_CENTER;

	private readonly _targetRadius: number;

	constructor(private readonly _target: HTMLElement) {
		super();
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

		const mkRim = (): HTMLElement => {
			const el = doc.createElement('div');
			el.className = 'voice-glow-slot voice-glow-slot-rim';
			el.style.cssText = 'position:absolute;inset:0;z-index:4;pointer-events:none;opacity:0;will-change:opacity,transform;';
			el.style.borderRadius = `${this._targetRadius}px`;
			_target.appendChild(el);
			this._register(toDisposable(() => el.remove()));
			return el;
		};
		const mkBloom = (): HTMLElement => {
			const el = doc.createElement('div');
			el.className = 'voice-glow-slot voice-glow-slot-bloom';
			el.style.cssText = 'position:absolute;pointer-events:none;opacity:0;will-change:opacity,transform;';
			el.style.borderRadius = `${this._targetRadius}px`;
			// Insert before the box so it paints behind it (both positioned, auto z).
			parent.insertBefore(el, parent === _target ? _target.firstChild : _target);
			this._register(toDisposable(() => el.remove()));
			return el;
		};
		this._rimSlots = [mkRim(), mkRim()];
		this._bloomSlots = [mkBloom(), mkBloom()];
		this._syncGeometry();

		const ResizeObserverCtor = view?.ResizeObserver;
		if (ResizeObserverCtor) {
			const ro = new ResizeObserverCtor(() => this._syncGeometry());
			ro.observe(_target);
			this._register(toDisposable(() => ro.disconnect()));
		}

		for (const el of [...this._bloomSlots, ...this._rimSlots]) {
			this._slotBeams.set(el, this._register(new MutableDisposable<IDisposable>()));
			if (el.classList.contains('voice-glow-slot-rim')) {
				this._rimRegs.set(el, this._register(new MutableDisposable<IDisposable>()));
			}
		}
	}

	/** Keep the exterior bloom layers aligned to (and lifted around) the box. */
	private _syncGeometry(): void {
		const t = this._target;
		const left = t.offsetLeft - BLOOM_LIFT;
		const top = t.offsetTop - BLOOM_LIFT;
		const w = t.offsetWidth + 2 * BLOOM_LIFT;
		const h = t.offsetHeight + 2 * BLOOM_LIFT;
		const clamp = (v: number) => Math.max(0.35, Math.min(4, v));
		for (const el of this._bloomSlots) {
			el.style.left = `${left}px`;
			el.style.top = `${top}px`;
			el.style.width = `${w}px`;
			el.style.height = `${h}px`;
			el.style.setProperty('--pulse-glow-sx', clamp(w / 350).toFixed(3));
			el.style.setProperty('--pulse-glow-sy', clamp(h / 140).toFixed(3));
		}
	}

	render(state: VoiceGlowState, level: number, reducedMotion: boolean): void {
		const mapped: 'listening' | 'processing' | 'speaking' | undefined =
			state === 'listening' ? 'listening' :
				state === 'processing' ? 'processing' :
					state === 'speaking' ? 'speaking' : undefined;
		if (!mapped) {
			this.clear();
			return;
		}

		if (state !== this._currentState) {
			this._currentState = state;
			// Publish state classes on the target so surface CSS that tints the mic
			// glyph (blue listening / purple speaking) keeps working.
			this._target.classList.add('voice-active');
			this._target.classList.toggle('voice-listening', mapped === 'listening');
			this._target.classList.toggle('voice-processing', mapped === 'processing');
			this._target.classList.toggle('voice-speaking', mapped === 'speaking');
			this._showState(mapped, reducedMotion);
		}

		// Per-frame: drive the active bloom's motion, intensity and cool/warm hue.
		if (this._front?.config.family === 'bloom' && !reducedMotion) {
			this._driveBloom(this._front, level);
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
		}
	}

	private _showState(mapped: 'listening' | 'processing' | 'speaking', reducedMotion: boolean): void {
		const config = STATE_CONFIGS[mapped];
		const slots = config.family === 'bloom' ? this._bloomSlots : this._rimSlots;
		const idx = (this._slotToggle[config.family] ^= 1);
		const host = slots[idx];

		// Mount a fresh beam on the chosen slot (disposing whatever was there).
		const beam = injectBeam(host, config);
		const beamStore = new DisposableStore();
		beamStore.add(toDisposable(beam.dispose));
		this._slotBeams.get(host)!.value = beamStore;

		const layer: ILayer = { host, config, driver: beam.driver, hueProp: beam.hueProp, disposable: beamStore };

		// Rim breathes via the shared pulse loop; bloom is hand-driven per frame.
		if (config.family === 'rim' && beam.driver && !reducedMotion) {
			const reg = registerPulseInstance(host, beam.driver);
			this._rimRegs.get(host)!.value = toDisposable(reg);
		} else if (config.family === 'rim') {
			this._rimRegs.get(host)?.clear();
		}

		if (config.family === 'bloom') {
			// Carry the eased hue across a listening<->speaking swap so the cross-fade
			// sweeps cool->warm; snap when arriving from a non-bloom state.
			this._hueTarget = config.warm ? WARM_CENTER : COOL_CENTER;
			if (this._front?.config.family !== 'bloom') {
				this._hueNow = this._hueTarget;
			}
			if (reducedMotion) {
				this._driveBloomStatic(layer);
			}
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
		this._front = layer;
	}

	private _driveBloom(layer: ILayer, level: number): void {
		const view = this._target.ownerDocument.defaultView;
		const ts = (view?.performance ?? performance).now() / 1000;
		const dt = this._prevTs === undefined ? 0 : Math.min(0.05, ts - this._prevTs);
		this._prevTs = ts;

		// Smooth the audio level (fast attack, slow release) and let motion slow when quiet.
		const target = Math.max(0, Math.min(1, level));
		this._level += (target - this._level) * (target > this._level ? 0.35 : 0.09);
		const speed = 0.28 + 1.05 * this._level;
		this._animTime += dt * speed;

		if (layer.driver) {
			for (const osc of layer.driver.oscillators) {
				const phase = (this._animTime - osc.delay) / osc.period;
				const value = osc.a + (osc.b - osc.a) * ((1 - Math.cos(2 * Math.PI * phase)) / 2);
				layer.host.style.setProperty(osc.prop, osc.unit === 'px' ? `${value.toFixed(2)}px` : value.toFixed(4));
			}
		}
		layer.host.style.setProperty('--beam-strength', (layer.config.strength * (0.5 + 0.95 * this._level)).toFixed(3));

		if (layer.hueProp) {
			this._hueNow += (this._hueTarget - this._hueNow) * 0.06;
			const warm = !!layer.config.warm;
			const drift = warm ? 12 : 16;
			const vShift = warm ? -7 * this._level : 8 * this._level;
			const hue = this._hueNow + drift * Math.sin(this._animTime * 0.45) + vShift;
			layer.host.style.setProperty(layer.hueProp, `${hue.toFixed(1)}deg`);
		}
	}

	/** Reduced-motion: pin the bloom to a representative still frame. */
	private _driveBloomStatic(layer: ILayer): void {
		if (layer.driver) {
			for (const osc of layer.driver.oscillators) {
				const mid = (osc.a + osc.b) / 2;
				layer.host.style.setProperty(osc.prop, osc.unit === 'px' ? `${mid.toFixed(2)}px` : mid.toFixed(4));
			}
		}
		layer.host.style.setProperty('--beam-strength', layer.config.strength.toFixed(3));
		if (layer.hueProp) {
			layer.host.style.setProperty(layer.hueProp, `${this._hueTarget.toFixed(1)}deg`);
		}
	}
}

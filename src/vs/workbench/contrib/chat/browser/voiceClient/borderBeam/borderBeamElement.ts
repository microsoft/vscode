/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { generateBeamCSS, getPulseDriverConfig, sizePresets, sizeThemePresets } from './styles.js';
import { registerPulseInstance } from './pulseDriver.js';
import { BorderBeamColorVariant, BorderBeamSize } from './types.js';

let beamSeq = 0;

export interface IBorderBeamOptions {
	/** Effect family/size. Rotate: 'md' (full border). Pulse: 'pulse-inner' | 'pulse-outside'. */
	readonly size: BorderBeamSize;
	/** Base palette. 'ocean' / 'mono' read as restrained; 'colorful' is the full rainbow. */
	readonly colorVariant: BorderBeamColorVariant;
	readonly theme: 'dark' | 'light';
	/** Corner radius of the host, in px. */
	readonly borderRadius: number;
	/** Saturation multiplier ( <1 desaturates toward the theme, taming the rainbow ). */
	readonly saturation?: number;
	/** Overall opacity/strength of the effect, [0, 1]. */
	readonly strength?: number;
	/** Brightness multiplier for the glow. */
	readonly brightness?: number;
	/** Rotation/breathe duration in seconds. */
	readonly duration?: number;
	/**
	 * Hold the hue steady by dropping the `hue-rotate()` filter entirely. Forced
	 * on for 'mono'. Note this also discards {@link hueBaseDeg}; to keep the base
	 * rotation (and theme recentering) while stopping the drift, set
	 * {@link hueRange} to 0 instead.
	 */
	readonly staticColors?: boolean;
	/**
	 * Half-width, in degrees, of the slow hue drift around the base hue.
	 * Defaults to 30. Set to 0 to pin the palette to {@link hueBaseDeg} — useful
	 * when colour encodes state and must stay semantically stable.
	 */
	readonly hueRange?: number;
	/**
	 * Degrees to rotate the whole palette so the sheen recenters on the active
	 * theme's accent hue. This is how the effect becomes theme-aware without
	 * hand-picking colors per theme.
	 */
	readonly hueBaseDeg?: number;
	/**
	 * Start in the fully-visible steady state instead of easing in over ~0.6s.
	 * Used by screenshot fixtures (which capture a frame or two after render,
	 * before the entrance animation would finish). Production leaves this off so
	 * the glow fades in.
	 */
	readonly startVisible?: boolean;
	/**
	 * Render the Pulse family at a frozen mid-breath frame instead of running the
	 * shared rAF breathing loop. Used by screenshot fixtures, where an endless
	 * animation loop never settles.
	 */
	readonly staticPreview?: boolean;
	/**
	 * Rotate family only: let the traveling beam's glow bloom OUTSIDE the box
	 * (a rotating outer halo) instead of clipping it to the edge.
	 */
	readonly outsideGlow?: boolean;
}

/**
 * Applies the (vendored) border-beam effect to an existing element by generating
 * the real per-instance CSS and driving it exactly as the source React component
 * does — a `[data-beam]` host with `::before`/`::after` rings plus a
 * `[data-beam-bloom]` child, and the shared rAF pulse driver for the Pulse family.
 *
 * The host should be `position: relative` and own no conflicting
 * `::before`/`::after`. Returns an {@link IDisposable} that fully removes the
 * effect (style element, attributes, bloom child, driver registration).
 */
export function applyBorderBeam(host: HTMLElement, options: IBorderBeamOptions): IDisposable {
	const id = `voicebeam-${beamSeq++}`;
	const { size, colorVariant, theme, borderRadius } = options;

	const themeConfig = sizeThemePresets[size][theme];
	const sizeConfig = sizePresets[size];
	const isPulse = size === 'pulse-inner' || size === 'pulse-outside';

	const duration = options.duration ?? (size === 'line' ? 3.1 : isPulse ? 2.3 : 1.96);
	const saturation = options.saturation ?? themeConfig.saturation;
	const brightness = options.brightness ?? themeConfig.brightness ?? 1.3;
	const hueRange = options.hueRange ?? 30;
	const staticColors = colorVariant === 'mono' ? true : (options.staticColors ?? false);
	const strength = Math.max(0, Math.min(1, options.strength ?? 1));

	const css = generateBeamCSS({
		id,
		borderRadius,
		borderWidth: sizeConfig.borderWidth,
		duration,
		strokeOpacity: themeConfig.strokeOpacity,
		innerOpacity: themeConfig.innerOpacity,
		bloomOpacity: themeConfig.bloomOpacity,
		innerShadow: themeConfig.innerShadow,
		size,
		colorVariant,
		staticColors,
		brightness,
		saturation,
		hueRange,
		theme,
		hairlineOpacity: themeConfig.hairlineOpacity,
	});

	const doc = host.ownerDocument;
	const root = host.getRootNode() as Document | ShadowRoot;

	// `@property` rules only register at document scope — inside a shadow root they
	// are ignored, which would leave the animated custom properties (angle,
	// opacity, …) uninterpolated and the whole effect invisible. Hoist just the
	// `@property` declarations to the document head; keep the scoped selectors in
	// the host's root so they match the (possibly shadow-DOM) host.
	const propertyRules = css.match(/@property[^{]+\{[^}]*\}/g)?.join('\n') ?? '';
	const scopedCss = css.replace(/@property[^{]+\{[^}]*\}/g, '');

	let propertyStyleEl: HTMLStyleElement | undefined;
	if (propertyRules) {
		propertyStyleEl = doc.createElement('style');
		propertyStyleEl.textContent = propertyRules;
		doc.head.appendChild(propertyStyleEl);
	}

	const styleEl = doc.createElement('style');
	styleEl.textContent = scopedCss;
	// A ShadowRoot accepts a <style> child directly; a Document does not (only its
	// <head>/<body> do), so append there when the host isn't in a shadow tree.
	const styleParent: Node = root instanceof ShadowRoot ? root : doc.head;
	styleParent.appendChild(styleEl);

	// "Rotate but outside": the rotate family clips its glow to the box edge. To
	// let the traveling beam radiate OUTWARD, unclip the (already angle-driven)
	// bloom layer and push it beyond the box, so the rotating halo blooms outside.
	let outsideStyleEl: HTMLStyleElement | undefined;
	if (options.outsideGlow && !isPulse) {
		const spread = 16;
		outsideStyleEl = doc.createElement('style');
		outsideStyleEl.textContent = `
[data-beam="${id}"] { overflow: visible !important; }
[data-beam="${id}"][data-active] [data-beam-bloom],
[data-beam="${id}"][data-fading] [data-beam-bloom] {
	inset: -${spread}px !important;
	clip-path: none !important;
	border-radius: ${borderRadius + spread}px !important;
	filter: blur(${spread}px) brightness(${brightness.toFixed(2)}) saturate(${saturation.toFixed(2)}) !important;
}`;
		styleParent.appendChild(outsideStyleEl);
	}

	const bloom = doc.createElement('div');
	bloom.setAttribute('data-beam-bloom', '');
	host.appendChild(bloom);

	host.setAttribute('data-beam', id);
	host.style.setProperty('--beam-strength', String(strength));
	if (options.hueBaseDeg !== undefined) {
		host.style.setProperty('--beam-hue-base', `${options.hueBaseDeg}deg`);
	}
	// The outward-bloom size authors its halo geometry for a ~350×140 reference
	// element and scales it per-axis to the real element; replicate that here.
	if (size === 'pulse-outside') {
		const rect = host.getBoundingClientRect();
		const clamp = (v: number) => Math.max(0.35, Math.min(4, v));
		if (rect.width && rect.height) {
			host.style.setProperty('--pulse-glow-sx', clamp(rect.width / 350).toFixed(3));
			host.style.setProperty('--pulse-glow-sy', clamp(rect.height / 140).toFixed(3));
		}
	}
	// Activate on the next frame so the fade-in transition actually runs.
	host.setAttribute('data-active', '');

	// Fixtures capture a frame or two after render — before the ~0.6s fade-in
	// finishes — so pin the layer opacity to its steady value for a faithful still.
	if (options.startVisible) {
		host.style.setProperty(`--beam-opacity-${id}`, '1');
	}

	let unregisterPulse: (() => void) | undefined;
	if (isPulse) {
		const driverConfig = getPulseDriverConfig(size, theme, duration, hueRange, staticColors, id);
		if (driverConfig) {
			if (options.staticPreview) {
				// Freeze the breathing at a representative mid-frame instead of running
				// the shared rAF loop, which never settles and would trip fixture
				// deterministic-render / leak checks.
				for (const osc of driverConfig.oscillators) {
					const mid = (osc.a + osc.b) / 2;
					host.style.setProperty(osc.prop, osc.unit === 'px' ? `${mid.toFixed(2)}px` : mid.toFixed(4));
				}
				if (driverConfig.hue) {
					host.style.setProperty(driverConfig.hue.prop, '0deg');
				}
			} else {
				unregisterPulse = registerPulseInstance(host, driverConfig);
			}
		}
	}

	return toDisposable(() => {
		unregisterPulse?.();
		styleEl.remove();
		outsideStyleEl?.remove();
		propertyStyleEl?.remove();
		bloom.remove();
		host.removeAttribute('data-beam');
		host.removeAttribute('data-active');
		host.removeAttribute('data-fading');
		host.style.removeProperty('--beam-strength');
		host.style.removeProperty('--beam-hue-base');
	});
}

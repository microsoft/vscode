/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, disposableWindowInterval, getWindow } from '../../../../base/browser/dom.js';
import { IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ColorScheme } from '../../../../platform/theme/common/theme.js';
import { focusBorder } from '../../../../platform/theme/common/colorRegistry.js';
import { IBorderBeamOptions } from '../../../contrib/chat/browser/voiceClient/borderBeam/borderBeamElement.js';
import { enableAnimations, IResizableCell, makeResizable, replaceBeam } from './beamFixtureUtils.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from './fixtureUtils.js';

// The ocean palette's blues/violets sit around this hue; we rotate the whole
// palette by (themeAccentHue - OCEAN_BASE_HUE) so the sheen recenters on the
// active theme accent instead of always reading blue/purple.
const OCEAN_BASE_HUE = 250;
const INPUT_RADIUS = 12;

/** Per-state color/energy tone. Color is driven by state (not a separate axis). */
type StateTone = Pick<IBorderBeamOptions, 'colorVariant' | 'saturation' | 'strength' | 'brightness' | 'hueBaseDeg'>;

// `mono` is attenuated ~4x internally (half base gradient opacity, then a 0.5
// stroke/inner/bloom multiplier), so the neutral states need near-full strength
// to land at a weight comparable to the colored ones. `saturation: 0` keeps them
// a true white-to-gray with no residual hue.
const WHITE: StateTone = { colorVariant: 'mono', saturation: 0, strength: 1, brightness: 1.5, hueBaseDeg: 0 };
const ACCENT: StateTone = { colorVariant: 'ocean', saturation: 0.5, strength: 0.85 };
// The ocean palette sits around hue 250 (blue/violet); rotate it to ~35deg so
// "speaking" actually reads amber/warm rather than another shade of the accent.
const WARM: StateTone = { colorVariant: 'ocean', saturation: 0.6, strength: 0.9, brightness: 1.4, hueBaseDeg: -215 };

// The state -> color mapping: idle white, listening accent, processing white, speaking warm.
const STATES: { readonly name: string; readonly tone: StateTone }[] = [
	{ name: 'Idle — white', tone: WHITE },
	{ name: 'Listening — accent', tone: ACCENT },
	{ name: 'Processing — white', tone: WHITE },
	{ name: 'Speaking — warm', tone: WARM },
];

/** A treatment = how the glow is drawn; color still comes from the state tone. */
interface Treatment {
	readonly size: IBorderBeamOptions['size'];
	readonly outsideGlow?: boolean;
	readonly brightnessBoost?: number;
}
const TREATMENTS: Record<string, Treatment> = {
	Edge: { size: 'pulse-inner' },
	Bloom: { size: 'pulse-outside' },
	Rotate: { size: 'md', brightnessBoost: 0.25 },
	RotateOutside: { size: 'md', outsideGlow: true, brightnessBoost: 0.25 },
};

/** Display order (and labels) for the page that shows every treatment at once. */
const TREATMENT_ORDER: readonly { readonly label: string; readonly treatment: Treatment }[] = [
	{ label: 'Edge — grouped rim', treatment: TREATMENTS.Edge },
	{ label: 'Bloom — outside', treatment: TREATMENTS.Bloom },
	{ label: 'Rotate — traveling beam', treatment: TREATMENTS.Rotate },
	{ label: 'Rotate — outside glow', treatment: TREATMENTS.RotateOutside },
];

/** How long each state is held before the showcase advances to the next one. */
const STATE_CYCLE_MS = 3000;

function isDark(ctx: ComponentFixtureContext): boolean {
	return ctx.theme.type === ColorScheme.DARK || ctx.theme.type === ColorScheme.HIGH_CONTRAST_DARK;
}

/** Recenter the ocean palette onto the theme accent hue. */
function themeHueBaseDeg(ctx: ComponentFixtureContext): number {
	const accent = ctx.theme.getColor(focusBorder);
	if (!accent) {
		return 0;
	}
	return Math.round(((accent.hsla.h - OCEAN_BASE_HUE + 540) % 360) - 180);
}

/**
 * Mock input geometry.
 * - `tall`: the multi-row composer (placeholder + mode pills + send).
 * - `wide`: a short, wide single-row bar — placeholder and send only, so the
 *   glow is judged against a long, thin frame instead of a card.
 */
type MockInputLayout = 'tall' | 'wide';

/** A mock chat/voice input box, so the beam is judged in a realistic frame. */
function renderMockInput(layout: MockInputLayout = 'tall'): HTMLElement {
	const wide = layout === 'wide';
	const box = $('.voice-beam-mock-input');
	box.style.cssText = [
		'position:relative', 'box-sizing:border-box',
		wide ? 'width:640px' : 'width:340px',
		wide ? 'min-height:40px' : 'min-height:84px',
		wide ? 'padding:5px 6px 5px 14px' : 'padding:12px 14px',
		`border-radius:${INPUT_RADIUS}px`, 'background:var(--vscode-input-background)',
		'border:1px solid var(--vscode-input-border, transparent)', 'display:flex',
		wide ? 'flex-direction:row' : 'flex-direction:column',
		wide ? 'align-items:center' : 'align-items:stretch',
		wide ? 'gap:10px' : 'gap:14px',
		'font-family:var(--vscode-font-family)', 'color:var(--vscode-input-foreground)',
	].join(';');

	const placeholder = $('span');
	placeholder.textContent = 'Build anything\u2026';
	placeholder.style.cssText = `color:var(--vscode-input-placeholderForeground);font-size:13px;${wide ? 'flex:1;' : ''}`;

	// Icon only — no filled button — so the glow is judged against the input
	// frame rather than competing with a saturated blue block.
	const send = $('span');
	send.textContent = '\u2191';
	send.style.cssText = [
		'flex:0 0 auto', 'display:flex', 'align-items:center', 'justify-content:center',
		wide ? 'width:26px' : 'width:22px', wide ? 'height:26px' : 'height:22px',
		'color:var(--vscode-icon-foreground)',
		wide ? 'font-size:15px' : 'font-size:14px',
	].join(';');

	if (wide) {
		box.append(placeholder, send);
		return box;
	}

	const row = $('div');
	row.style.cssText = 'display:flex;align-items:center;gap:8px;';
	for (const label of ['Agent', 'Auto']) {
		const pill = $('span');
		pill.textContent = label;
		pill.style.cssText = 'font-size:11px;padding:2px 8px;border-radius:999px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);';
		row.appendChild(pill);
	}
	send.style.marginLeft = 'auto';
	row.appendChild(send);
	box.append(placeholder, row);
	return box;
}


/**
 * Render one treatment cycled through all four states (with the per-state color).
 *
 * In the explorer the effect runs exactly as production does — entrance fade-in
 * plus the shared rAF breathing loop. For screenshot capture it is pinned to a
 * settled frame so CI stays deterministic.
 */
interface FlowOptions {
	readonly title: string;
	readonly treatment: Treatment;
	readonly layout?: MockInputLayout;
}

function renderTreatmentFlow(ctx: ComponentFixtureContext, options: FlowOptions): void {
	const { container, disposableStore, isInteractive } = ctx;
	const { title, treatment, layout = 'tall' } = options;
	container.style.cssText = 'padding:36px 44px;display:flex;flex-direction:column;gap:30px;align-items:flex-start;';
	if (isInteractive) {
		enableAnimations(container);
	}

	const heading = $('div');
	heading.textContent = title;
	heading.style.cssText = 'font-size:13px;font-weight:600;font-family:var(--vscode-font-family);color:var(--vscode-foreground);';
	container.appendChild(heading);

	const beamTheme = isDark(ctx) ? 'dark' : 'light';
	const themeHue = themeHueBaseDeg(ctx);

	const cells: IResizableCell[] = [];
	for (const state of STATES) {
		const cell = $('div');
		cell.style.cssText = 'display:flex;flex-direction:column;gap:8px;align-items:flex-start;';
		const caption = $('div');
		caption.textContent = state.name;
		caption.style.cssText = 'font-size:11px;opacity:.6;font-family:var(--vscode-font-family);color:var(--vscode-foreground);';
		const box = renderMockInput(layout);
		cell.append(caption, box);
		container.appendChild(cell);

		const beam = disposableStore.add(new MutableDisposable<IDisposable>());
		const reapplyBeam = () => {
			replaceBeam(beam, box, {
				...state.tone,
				size: treatment.size,
				outsideGlow: treatment.outsideGlow,
				brightness: (state.tone.brightness ?? 1.3) + (treatment.brightnessBoost ?? 0),
				theme: beamTheme,
				borderRadius: INPUT_RADIUS,
				hueBaseDeg: state.tone.hueBaseDeg ?? themeHue,
				// Colour carries the state's meaning here, so pin the palette to
				// the state's base hue. Without this the drift swings ~56deg and
				// renders "accent" orange or "warm" green.
				hueRange: 0,
				startVisible: !isInteractive,
				staticPreview: !isInteractive,
			});
		};
		reapplyBeam();
		cells.push({ box, wrapper: cell, reapplyBeam });
	}

	makeResizable(cells, container, disposableStore);
}

/**
 * Every treatment on a single page, all cycling through the states together on a
 * real-time timer, so the full state flow can be compared treatment by treatment.
 */
function renderAllTreatmentsCycling(ctx: ComponentFixtureContext, layout: MockInputLayout): void {
	const { container, disposableStore, isInteractive } = ctx;
	container.style.cssText = 'padding:36px 44px;display:flex;flex-direction:column;gap:26px;align-items:flex-start;';
	if (isInteractive) {
		enableAnimations(container);
	}

	const heading = $('div');
	heading.style.cssText = 'font-size:13px;font-weight:600;font-family:var(--vscode-font-family);color:var(--vscode-foreground);';
	container.appendChild(heading);

	const beamTheme = isDark(ctx) ? 'dark' : 'light';
	const themeHue = themeHueBaseDeg(ctx);

	const rows = TREATMENT_ORDER.map(({ label, treatment }) => {
		const cell = $('div');
		cell.style.cssText = 'display:flex;flex-direction:column;gap:8px;align-items:flex-start;';
		const caption = $('div');
		caption.textContent = label;
		caption.style.cssText = 'font-size:11px;opacity:.6;font-family:var(--vscode-font-family);color:var(--vscode-foreground);';
		const box = renderMockInput(layout);
		cell.append(caption, box);
		container.appendChild(cell);
		return { treatment, box, wrapper: cell, beam: disposableStore.add(new MutableDisposable<IDisposable>()) };
	});

	let index = -1;
	let state = STATES[0];

	const applyRow = (row: typeof rows[number]) => {
		// Re-applying with the current tone is what a state change does in
		// production; without `startVisible` each one fades back in.
		replaceBeam(row.beam, row.box, {
			...state.tone,
			size: row.treatment.size,
			outsideGlow: row.treatment.outsideGlow,
			brightness: (state.tone.brightness ?? 1.3) + (row.treatment.brightnessBoost ?? 0),
			theme: beamTheme,
			borderRadius: INPUT_RADIUS,
			hueBaseDeg: state.tone.hueBaseDeg ?? themeHue,
			hueRange: 0,
			startVisible: !isInteractive,
			staticPreview: !isInteractive,
		});
	};

	const advance = () => {
		index = (index + 1) % STATES.length;
		state = STATES[index];
		heading.textContent = `All treatments${layout === 'wide' ? ' — wide' : ''} · ${state.name}`;
		for (const row of rows) {
			applyRow(row);
		}
	};

	advance();
	// Only cycle while someone is watching; a screenshot captures the first state.
	if (isInteractive) {
		disposableStore.add(disposableWindowInterval(getWindow(container), advance, STATE_CYCLE_MS));
	}
	makeResizable(rows.map(row => ({ box: row.box, wrapper: row.wrapper, reapplyBeam: () => applyRow(row) })), container, disposableStore);
}

/** The four treatments as one page, in a given layout. */
function defineTreatmentPage(layout: MockInputLayout) {
	const suffix = layout === 'wide' ? ' — wide' : '';
	const page = (name: string, title: string, treatment: Treatment) =>
		defineComponentFixture({
			labels: { kind: 'screenshot' as const },
			// These render a live animation whenever a person is watching, so
			// they must run on the real clock rather than the virtual one.
			virtualTime: { enabled: false },
			render: (ctx: ComponentFixtureContext) => renderTreatmentFlow(ctx, { title: title + suffix, treatment, layout }),
		});

	return {
		// Every treatment at once, cycling through the states — the page for
		// comparing motion across treatments.
		AllCycling: defineComponentFixture({
			labels: { kind: 'animated' as const },
			virtualTime: { enabled: false },
			render: (ctx: ComponentFixtureContext) => renderAllTreatmentsCycling(ctx, layout),
		}),
		Edge: page('Edge', 'Grouped rim (edge)', TREATMENTS.Edge),
		Bloom: page('Bloom', 'Outside bloom', TREATMENTS.Bloom),
		Rotate: page('Rotate', 'Traveling beam (rotate)', TREATMENTS.Rotate),
		RotateOutside: page('RotateOutside', 'Traveling beam, outside glow (rotate-outside)', TREATMENTS.RotateOutside),
	};
}

export default defineThemedFixtureGroup({ path: 'voice/glow/' }, {
	...defineTreatmentPage('tall'),

	// Short + wide single-row bar: placeholder and a squircle send button only.
	wide: defineThemedFixtureGroup(defineTreatmentPage('wide')),
});

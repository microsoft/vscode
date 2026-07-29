/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, disposableWindowInterval, getWindow } from '../../../../base/browser/dom.js';
import { MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ColorScheme } from '../../../../platform/theme/common/theme.js';
import { focusBorder } from '../../../../platform/theme/common/colorRegistry.js';
import { applyBorderBeam, IBorderBeamOptions } from '../../../contrib/chat/browser/voiceClient/borderBeam/borderBeamElement.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from './fixtureUtils.js';

// The ocean palette's blues/violets sit around this hue; we rotate the whole
// palette by (themeAccentHue - OCEAN_BASE_HUE) so the sheen recenters on the
// active theme accent instead of always reading blue/purple.
const OCEAN_BASE_HUE = 250;
const INPUT_RADIUS = 12;

/** Per-state color/energy tone. Color is driven by state (not a separate axis). */
type StateTone = Pick<IBorderBeamOptions, 'colorVariant' | 'saturation' | 'strength' | 'brightness' | 'hueBaseDeg'>;

const WHITE: StateTone = { colorVariant: 'mono', saturation: 0.2, strength: 0.5, hueBaseDeg: 0 };
const ACCENT: StateTone = { colorVariant: 'ocean', saturation: 0.5, strength: 0.85 };
const WARM: StateTone = { colorVariant: 'ocean', saturation: 0.6, strength: 0.9, brightness: 1.4, hueBaseDeg: 40 };

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

	// `corner-shape` gives a true superellipse where supported; the radius alone
	// still reads as a squircle-ish rounded square everywhere else.
	const send = $('span');
	send.textContent = '\u2191';
	send.style.cssText = [
		'flex:0 0 auto', 'display:flex', 'align-items:center', 'justify-content:center',
		wide ? 'width:26px' : 'width:22px', wide ? 'height:26px' : 'height:22px',
		wide ? 'border-radius:9px' : 'border-radius:50%',
		wide ? 'corner-shape:squircle' : '',
		'background:var(--vscode-button-background)', 'color:var(--vscode-button-foreground)',
		'font-size:12px',
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
 * `live` runs the effect exactly as production does — entrance fade-in plus the
 * shared rAF breathing loop — so the motion can be judged in the explorer. The
 * screenshot variants stay frozen so CI captures a deterministic frame.
 */
interface FlowOptions {
	readonly title: string;
	readonly treatment: Treatment;
	readonly live?: boolean;
	readonly layout?: MockInputLayout;
}

function renderTreatmentFlow(ctx: ComponentFixtureContext, options: FlowOptions): void {
	const { container, disposableStore } = ctx;
	const { title, treatment, live = false, layout = 'tall' } = options;
	container.style.cssText = 'padding:36px 44px;display:flex;flex-direction:column;gap:30px;align-items:flex-start;';

	const heading = $('div');
	heading.textContent = title;
	heading.style.cssText = 'font-size:13px;font-weight:600;font-family:var(--vscode-font-family);color:var(--vscode-foreground);';
	container.appendChild(heading);

	for (const state of STATES) {
		const cell = $('div');
		cell.style.cssText = 'display:flex;flex-direction:column;gap:8px;align-items:flex-start;';
		const caption = $('div');
		caption.textContent = state.name;
		caption.style.cssText = 'font-size:11px;opacity:.6;font-family:var(--vscode-font-family);color:var(--vscode-foreground);';
		const box = renderMockInput(layout);
		cell.append(caption, box);
		container.appendChild(cell);
		disposableStore.add(applyBorderBeam(box, {
			...state.tone,
			size: treatment.size,
			outsideGlow: treatment.outsideGlow,
			brightness: (state.tone.brightness ?? 1.3) + (treatment.brightnessBoost ?? 0),
			theme: isDark(ctx) ? 'dark' : 'light',
			borderRadius: INPUT_RADIUS,
			hueBaseDeg: state.tone.hueBaseDeg ?? themeHueBaseDeg(ctx),
			startVisible: !live,
			staticPreview: !live,
		}));
	}
}

/**
 * Every treatment on a single page, all cycling through the states together on a
 * real-time timer, so the full state flow can be compared treatment by treatment.
 */
function renderAllTreatmentsCycling(ctx: ComponentFixtureContext, layout: MockInputLayout): void {
	const { container, disposableStore } = ctx;
	container.style.cssText = 'padding:36px 44px;display:flex;flex-direction:column;gap:26px;align-items:flex-start;';

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
		return { treatment, box, beam: disposableStore.add(new MutableDisposable()) };
	});

	let index = -1;
	const advance = () => {
		index = (index + 1) % STATES.length;
		const state = STATES[index];
		heading.textContent = `All treatments${layout === 'wide' ? ' — wide' : ''} · ${state.name}`;
		for (const row of rows) {
			// Re-applying with the new tone is what a state change does in
			// production; `startVisible: false` lets each one fade back in.
			row.beam.value = applyBorderBeam(row.box, {
				...state.tone,
				size: row.treatment.size,
				outsideGlow: row.treatment.outsideGlow,
				brightness: (state.tone.brightness ?? 1.3) + (row.treatment.brightnessBoost ?? 0),
				theme: beamTheme,
				borderRadius: INPUT_RADIUS,
				hueBaseDeg: state.tone.hueBaseDeg ?? themeHue,
			});
		}
	};

	advance();
	disposableStore.add(disposableWindowInterval(getWindow(container), advance, STATE_CYCLE_MS));
}

/** The four treatments as one page, in a given layout — static and live side by side. */
function defineTreatmentPage(layout: MockInputLayout) {
	const suffix = layout === 'wide' ? ' — wide' : '';
	const page = (name: string, title: string, treatment: Treatment) => ({
		[name]: defineComponentFixture({
			labels: { kind: 'screenshot' as const },
			render: (ctx: ComponentFixtureContext) => renderTreatmentFlow(ctx, { title: title + suffix, treatment, layout }),
		}),
		// Live counterpart: breathing/fading like production so the motion (not
		// just a frozen frame) can be reviewed. Runs on the real clock.
		[`${name}Live`]: defineComponentFixture({
			labels: { kind: 'animated' as const },
			virtualTime: { enabled: false },
			render: (ctx: ComponentFixtureContext) => renderTreatmentFlow(ctx, { title: `${title}${suffix} — live`, treatment, live: true, layout }),
		}),
	});

	return {
		// Every treatment at once, cycling through the states — the page for
		// comparing motion across treatments.
		AllCycling: defineComponentFixture({
			labels: { kind: 'animated' as const },
			virtualTime: { enabled: false },
			render: (ctx: ComponentFixtureContext) => renderAllTreatmentsCycling(ctx, layout),
		}),
		...page('Edge', 'Grouped rim (edge)', TREATMENTS.Edge),
		...page('Bloom', 'Outside bloom', TREATMENTS.Bloom),
		...page('Rotate', 'Traveling beam (rotate)', TREATMENTS.Rotate),
		...page('RotateOutside', 'Traveling beam, outside glow (rotate-outside)', TREATMENTS.RotateOutside),
	};
}

export default defineThemedFixtureGroup({ path: 'voice/glow/' }, {
	...defineTreatmentPage('tall'),

	// Short + wide single-row bar: placeholder and a squircle send button only.
	wide: defineThemedFixtureGroup(defineTreatmentPage('wide')),
});

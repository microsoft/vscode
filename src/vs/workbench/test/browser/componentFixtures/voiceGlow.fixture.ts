/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../base/browser/dom.js';
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

/** A mock chat/voice input box, so the beam is judged in a realistic frame. */
function renderMockInput(): HTMLElement {
	const box = $('.voice-beam-mock-input');
	box.style.cssText = [
		'position:relative', 'box-sizing:border-box', 'width:340px', 'min-height:84px',
		'padding:12px 14px', `border-radius:${INPUT_RADIUS}px`, 'background:var(--vscode-input-background)',
		'border:1px solid var(--vscode-input-border, transparent)', 'display:flex', 'flex-direction:column',
		'gap:14px', 'font-family:var(--vscode-font-family)', 'color:var(--vscode-input-foreground)',
	].join(';');
	const placeholder = $('span');
	placeholder.textContent = 'Build anything\u2026';
	placeholder.style.cssText = 'color:var(--vscode-input-placeholderForeground);font-size:13px;';
	const row = $('div');
	row.style.cssText = 'display:flex;align-items:center;gap:8px;';
	for (const label of ['Agent', 'Auto']) {
		const pill = $('span');
		pill.textContent = label;
		pill.style.cssText = 'font-size:11px;padding:2px 8px;border-radius:999px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);';
		row.appendChild(pill);
	}
	const send = $('span');
	send.textContent = '\u2191';
	send.style.cssText = 'margin-left:auto;width:22px;height:22px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:var(--vscode-button-background);color:var(--vscode-button-foreground);font-size:12px;';
	row.appendChild(send);
	box.append(placeholder, row);
	return box;
}

/** Render one treatment cycled through all four states (with the per-state color). */
function renderTreatmentFlow(ctx: ComponentFixtureContext, title: string, treatment: Treatment): void {
	const { container, disposableStore } = ctx;
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
		const box = renderMockInput();
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
			startVisible: true,
			staticPreview: true,
		}));
	}
}

export default defineThemedFixtureGroup({ path: 'voice/glow/' }, {
	Edge: defineComponentFixture({ labels: { kind: 'screenshot' }, render: ctx => renderTreatmentFlow(ctx, 'Grouped rim (edge)', TREATMENTS.Edge) }),
	Bloom: defineComponentFixture({ labels: { kind: 'screenshot' }, render: ctx => renderTreatmentFlow(ctx, 'Outside bloom', TREATMENTS.Bloom) }),
	Rotate: defineComponentFixture({ labels: { kind: 'screenshot' }, render: ctx => renderTreatmentFlow(ctx, 'Traveling beam (rotate)', TREATMENTS.Rotate) }),
	RotateOutside: defineComponentFixture({ labels: { kind: 'screenshot' }, render: ctx => renderTreatmentFlow(ctx, 'Traveling beam, outside glow (rotate-outside)', TREATMENTS.RotateOutside) }),
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, disposableWindowInterval, EventType, getWindow } from '../../../../base/browser/dom.js';
import { DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { clamp } from '../../../../base/common/numbers.js';
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

// `saturation: 0` fully desaturates the palette, so idle/processing read as a
// neutral white-to-gray light rather than picking up any residual hue.
const WHITE: StateTone = { colorVariant: 'mono', saturation: 0, strength: 0.5, hueBaseDeg: 0 };
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
 * The fixture harness marks the container `disable-animations`
 * (`* { animation: none !important }`) so screenshots are deterministic. That
 * also kills every CSS-driven part of the beam — the fade-in that lifts
 * `--beam-opacity` off 0, the traveling-beam spin, and the hue drift — leaving
 * the effect invisible. Live fixtures opt out; screenshot fixtures keep it and
 * pin their opacity via `startVisible` instead.
 */
function enableAnimations(container: HTMLElement): void {
	container.classList.remove('disable-animations');
}

/**
 * Applies a beam to a host that may already carry one.
 *
 * `applyBorderBeam`'s disposable clears `data-beam`/`data-active` from its host,
 * so the previous beam has to be torn down *before* the replacement is created —
 * otherwise disposing the old one strips the new one's attributes off the shared
 * element and the effect silently dies.
 */
function replaceBeam(slot: MutableDisposable<IDisposable>, host: HTMLElement, options: IBorderBeamOptions): void {
	slot.clear();
	slot.value = applyBorderBeam(host, options);
}


// ============================================================================
// Drag to resize
// ============================================================================

const MIN_BOX_WIDTH = 160;
const MIN_BOX_HEIGHT = 30;
const MAX_BOX_HEIGHT = 420;

/**
 * The grip is revealed on hover only, so screenshot fixtures (which never hover)
 * keep pixel-identical baselines while the explorer stays draggable.
 *
 * It hangs off the *wrapper*, not the input: several treatments set
 * `overflow: hidden` on the input to clip their glow to the edge, which would
 * also clip (and un-hit-test) a grip positioned outside the input's bounds.
 */
const RESIZE_HANDLE_CSS = `
.voice-beam-resize-cell { position: relative; }
.voice-beam-resize-handle {
	position: absolute;
	right: -7px;
	bottom: -7px;
	width: 14px;
	height: 14px;
	z-index: 5;
	cursor: nwse-resize;
	opacity: 0;
	transition: opacity 80ms ease-out;
	background: var(--vscode-foreground);
	clip-path: polygon(100% 0, 100% 100%, 0 100%);
	border-radius: 0 0 4px 0;
}
.voice-beam-resize-cell:hover > .voice-beam-resize-handle,
.voice-beam-resize-handle:hover,
.voice-beam-resize-handle[data-dragging] { opacity: .45; }
`;

/** A resizable mock input, plus the hook to rebuild its beam at the new size. */
interface IResizableCell {
	readonly box: HTMLElement;
	/** Wrapper (caption + input) that the grip is anchored to. */
	readonly wrapper: HTMLElement;
	readonly reapplyBeam: () => void;
}

/**
 * Adds a drag-to-resize grip to every box on the page.
 *
 * All boxes resize together: each page is a comparison of the same input at
 * different states/treatments, so keeping the column one width is what makes the
 * comparison readable.
 *
 * The beam is rebuilt on release rather than per pointer move — `pulse-outside`
 * derives its halo scale from the element box at apply time, and regenerating
 * the (large) per-instance stylesheet on every move would be wasteful.
 */
function makeResizable(cells: readonly IResizableCell[], container: HTMLElement, store: DisposableStore): void {
	const style = $('style');
	style.textContent = RESIZE_HANDLE_CSS;
	container.appendChild(style);

	const drag = store.add(new MutableDisposable<DisposableStore>());

	for (const cell of cells) {
		const handle = $('.voice-beam-resize-handle');
		cell.wrapper.classList.add('voice-beam-resize-cell');
		cell.wrapper.appendChild(handle);

		store.add(addDisposableListener(handle, EventType.POINTER_DOWN, e => {
			e.preventDefault();
			e.stopPropagation();

			const rect = cell.box.getBoundingClientRect();
			const startX = e.clientX;
			const startY = e.clientY;
			const maxWidth = Math.max(MIN_BOX_WIDTH, container.clientWidth - 90);

			handle.setPointerCapture(e.pointerId);
			handle.setAttribute('data-dragging', '');

			const listeners = new DisposableStore();
			drag.value = listeners;

			listeners.add(addDisposableListener(handle, EventType.POINTER_MOVE, move => {
				const width = clamp(rect.width + (move.clientX - startX), MIN_BOX_WIDTH, maxWidth);
				const height = clamp(rect.height + (move.clientY - startY), MIN_BOX_HEIGHT, MAX_BOX_HEIGHT);
				for (const target of cells) {
					target.box.style.width = `${Math.round(width)}px`;
					target.box.style.height = `${Math.round(height)}px`;
					// The layout's `min-height` would otherwise floor the drag.
					target.box.style.minHeight = '0px';
				}
			}));

			listeners.add(addDisposableListener(handle, EventType.POINTER_UP, () => {
				handle.removeAttribute('data-dragging');
				drag.clear();
				for (const target of cells) {
					target.reapplyBeam();
				}
			}));
		}));
	}
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

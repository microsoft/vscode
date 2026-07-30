/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, disposableWindowInterval, getWindow } from '../../../../base/browser/dom.js';
import { IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ColorScheme } from '../../../../platform/theme/common/theme.js';
import { IBorderBeamOptions } from '../../../contrib/chat/browser/voiceClient/borderBeam/borderBeamElement.js';
import { enableAnimations, replaceBeam } from './beamFixtureUtils.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from './fixtureUtils.js';

/**
 * Omnibar — a self-running demo of the natural-language command center.
 *
 * Where `omniChat.fixture.ts` shows each state as a still, this plays the whole
 * story on a loop: type a request in plain language, watch it resolve to a
 * command, hand off to voice, get routed to the right session, and get
 * interrupted when a background session needs an answer.
 *
 * The island is deliberately a *single persistent element* — it morphs (height,
 * contents, glow) rather than being swapped out, because "one surface that
 * changes shape" is the whole idea.
 */

// The ocean palette sits around this hue; rotating by (target - base) recenters
// the whole palette on a chosen colour.
const OCEAN_BASE_HUE = 250;
/** Listening / user — blue, rgb(88,166,255). */
const LISTENING_HUE = 212;
/** Speaking / assistant — purple, rgb(163,113,247). */
const SPEAKING_HUE = 262;

const ISLAND_WIDTH = 560;
const ISLAND_RADIUS = 14;
const TICK_MS = 60;

type Glow = 'neutral' | 'listening' | 'speaking' | 'alert';

interface GlowTone {
	readonly colorVariant: IBorderBeamOptions['colorVariant'];
	readonly saturation: number;
	readonly strength: number;
	readonly brightness: number;
	readonly hueBaseDeg: number;
}

// `mono` is attenuated ~4x internally, so the neutral tone needs full strength
// to sit at a weight comparable to the coloured ones.
const GLOWS: Record<Glow, GlowTone> = {
	neutral: { colorVariant: 'mono', saturation: 0, strength: 0.85, brightness: 1.35, hueBaseDeg: 0 },
	listening: { colorVariant: 'ocean', saturation: 0.55, strength: 0.95, brightness: 1.35, hueBaseDeg: LISTENING_HUE - OCEAN_BASE_HUE },
	speaking: { colorVariant: 'ocean', saturation: 0.6, strength: 0.95, brightness: 1.4, hueBaseDeg: SPEAKING_HUE - OCEAN_BASE_HUE },
	alert: { colorVariant: 'sunset', saturation: 0.55, strength: 0.9, brightness: 1.35, hueBaseDeg: 0 },
};

function isDark(ctx: ComponentFixtureContext): boolean {
	return ctx.theme.type === ColorScheme.DARK || ctx.theme.type === ColorScheme.HIGH_CONTRAST_DARK;
}


// ============================================================================
// Script
// ============================================================================

type Panel =
	| { readonly kind: 'none' }
	| { readonly kind: 'commandCenter' }
	| { readonly kind: 'resolved'; readonly label: string }
	| { readonly kind: 'routing' };

interface Beat {
	/** What the narration strip says while this beat plays. */
	readonly note: string;
	readonly ms: number;
	readonly glow: Glow;
	/** Text in the island. `type: true` reveals it a character at a time. */
	readonly text?: string;
	readonly type?: boolean;
	readonly placeholder?: string;
	/** Leading status glyph — only when there is something to say. */
	readonly glyph?: string;
	readonly pill?: { readonly label: string; readonly tone: 'listening' | 'speaking' | 'alert' };
	readonly panel?: Panel;
	/** Show the caret, as if focused. */
	readonly caret?: boolean;
}

const TYPED = 'change the theme to red velvet';
const SPOKEN = 'change the theme to red for the website I\u2019ve been working on';

const SCRIPT: readonly Beat[] = [
	{
		note: 'At rest, the command center is just a place to type \u2014 no AI chrome.',
		ms: 2600, glow: 'neutral', panel: { kind: 'commandCenter' },
	},
	{
		note: 'Type in plain language instead of hunting through the palette.',
		ms: 2400, glow: 'neutral', text: TYPED, type: true, caret: true, panel: { kind: 'commandCenter' },
	},
	{
		note: 'A fast classifier maps it to a real command.',
		ms: 1300, glow: 'neutral', text: TYPED, glyph: '\u25CC', panel: { kind: 'resolved', label: 'Preferences: Color Theme \u2192 Red Velvet' },
	},
	{
		note: 'Safe and reversible, so it just runs.',
		ms: 1600, glow: 'neutral', text: 'Theme changed to Red Velvet', glyph: '\u2713',
	},
	{
		note: 'The same box takes voice \u2014 the glow turns blue while it listens.',
		ms: 3600, glow: 'listening', text: SPOKEN, type: true, caret: true, pill: { label: 'Listening', tone: 'listening' },
	},
	{
		note: '\u201Cthe website\u201D is ambiguous, so it shows which session it picked.',
		ms: 4200, glow: 'neutral', text: SPOKEN, panel: { kind: 'routing' },
	},
	{
		note: 'Confirmed \u2014 the request goes to that session.',
		ms: 1600, glow: 'neutral', text: 'Sent to portfolio-site', glyph: '\u2713',
	},
	{
		note: 'Meanwhile another session gets blocked and says so.',
		ms: 3200, glow: 'alert', placeholder: 'Ask anything, or start a new session\u2026',
		pill: { label: 'Fix login bug needs input', tone: 'alert' },
	},
	{
		note: 'It reads the question aloud and opens the mic for your answer.',
		ms: 3400, glow: 'speaking', text: 'It wants to run \u201Crm -rf build\u201D. Allow it?', pill: { label: 'Speaking', tone: 'speaking' },
	},
	{
		note: 'Answered \u2014 back to rest.',
		ms: 2000, glow: 'neutral', panel: { kind: 'commandCenter' },
	},
];

const TOTAL_MS = SCRIPT.reduce((sum, beat) => sum + beat.ms, 0);


// ============================================================================
// Styles
// ============================================================================

const CSS = `
.omnibar-demo {
	display: flex;
	flex-direction: column;
	gap: 14px;
	align-items: flex-start;
	font-family: var(--vscode-font-family);
	color: var(--vscode-foreground);
}

/* Narration */
.omnibar-note {
	min-height: 17px;
	font-size: 12px;
	line-height: 17px;
	opacity: .62;
	transition: opacity 220ms ease;
}
.omnibar-note[data-swap] { opacity: 0; }

/* The island: one persistent surface that changes shape. */
.omnibar-island {
	position: relative;
	box-sizing: border-box;
	display: flex;
	align-items: center;
	gap: 10px;
	width: ${ISLAND_WIDTH}px;
	min-height: 40px;
	padding: 7px 8px 7px 14px;
	border-radius: ${ISLAND_RADIUS}px;
	background: var(--vscode-input-background);
	border: 1px solid var(--vscode-input-border, transparent);
	color: var(--vscode-input-foreground);
}
.omnibar-glyph { flex: 0 0 auto; width: 14px; text-align: center; opacity: .75; font-size: 12px; }
.omnibar-text {
	flex: 1;
	font-size: 13px;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.omnibar-text[data-placeholder] { color: var(--vscode-input-placeholderForeground); }
.omnibar-caret {
	display: inline-block;
	width: 1px;
	height: 14px;
	margin-left: 1px;
	vertical-align: text-bottom;
	background: currentColor;
}
.omnibar-mic {
	flex: 0 0 auto;
	display: flex; align-items: center; justify-content: center;
	width: 26px; height: 26px;
	color: var(--vscode-icon-foreground);
	font-size: 13px;
}
.omnibar-pill {
	flex: 0 0 auto;
	display: flex; align-items: center; gap: 6px;
	height: 22px; padding: 0 10px;
	border-radius: 999px;
	font-size: 11px; white-space: nowrap;
	background: var(--vscode-badge-background);
	color: var(--vscode-badge-foreground);
}
.omnibar-pill[data-tone="listening"] { background: color-mix(in srgb, rgb(88,166,255) 24%, transparent); color: var(--vscode-foreground); }
.omnibar-pill[data-tone="speaking"] { background: color-mix(in srgb, rgb(163,113,247) 24%, transparent); color: var(--vscode-foreground); }
.omnibar-pill[data-tone="alert"] { background: color-mix(in srgb, var(--vscode-notificationsWarningIcon-foreground) 24%, transparent); color: var(--vscode-foreground); }
.omnibar-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

/* Panel below the island */
.omnibar-panel {
	box-sizing: border-box;
	width: ${ISLAND_WIDTH}px;
	border-radius: 10px;
	background: var(--vscode-editorWidget-background, var(--vscode-input-background));
	border: 1px solid var(--vscode-editorWidget-border, transparent);
	font-size: 12px;
	overflow: hidden;
	transition: opacity 200ms ease;
}
.omnibar-panel[data-swap] { opacity: 0; }
.omnibar-panel-body { padding: 8px 0; }
.omnibar-group { padding: 5px 14px 3px; font-size: 10px; letter-spacing: .06em; text-transform: uppercase; opacity: .5; }
.omnibar-row { display: flex; align-items: center; gap: 10px; padding: 5px 14px; line-height: 18px; }
.omnibar-row[data-selected] { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
.omnibar-row-glyph { width: 14px; text-align: center; opacity: .7; }
.omnibar-row-label { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.omnibar-row-hint { opacity: .55; font-size: 11px; white-space: nowrap; }

/* Routing card */
.omnibar-card { padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
.omnibar-card-head { display: flex; align-items: center; gap: 8px; }
.omnibar-avatar {
	width: 20px; height: 20px; border-radius: 6px;
	display: flex; align-items: center; justify-content: center; font-size: 10px;
	background: var(--vscode-badge-background); color: var(--vscode-badge-foreground);
}
.omnibar-card-name { font-weight: 600; }
.omnibar-card-repo { opacity: .55; }
.omnibar-card-match { margin-left: auto; opacity: .7; font-size: 11px; }
.omnibar-transcript {
	display: flex; flex-direction: column; gap: 6px;
	padding: 8px 10px; border-radius: 8px;
	background: var(--vscode-textBlockQuote-background, rgba(127,127,127,.08));
}
.omnibar-turn { display: flex; gap: 8px; line-height: 16px; }
.omnibar-turn-who { flex: 0 0 38px; opacity: .5; font-size: 11px; }
.omnibar-turn-text { flex: 1; opacity: .85; }
.omnibar-countdown { display: flex; align-items: center; gap: 10px; }
.omnibar-progress { flex: 1; height: 3px; border-radius: 999px; background: rgba(127,127,127,.25); overflow: hidden; }
.omnibar-progress-fill { height: 100%; border-radius: 999px; background: var(--vscode-progressBar-background); }
.omnibar-action { opacity: .8; }
.omnibar-action[data-primary] { color: var(--vscode-textLink-foreground); }

/* Progress through the script */
.omnibar-timeline { display: flex; gap: 4px; width: ${ISLAND_WIDTH}px; }
.omnibar-tick { flex: 1; height: 2px; border-radius: 999px; background: currentColor; opacity: .13; }
.omnibar-tick[data-on] { opacity: .5; }
`;


// ============================================================================
// Panels
// ============================================================================

function row(glyph: string, label: string, hint?: string, selected?: boolean): HTMLElement {
	const el = $('.omnibar-row');
	if (selected) {
		el.setAttribute('data-selected', '');
	}
	const g = $('span.omnibar-row-glyph');
	g.textContent = glyph;
	const l = $('span.omnibar-row-label');
	l.textContent = label;
	el.append(g, l);
	if (hint) {
		const h = $('span.omnibar-row-hint');
		h.textContent = hint;
		el.appendChild(h);
	}
	return el;
}

function group(label: string): HTMLElement {
	const el = $('.omnibar-group');
	el.textContent = label;
	return el;
}

function buildPanelBody(panel: Panel, beatProgress: number): HTMLElement | undefined {
	if (panel.kind === 'none') {
		return undefined;
	}

	const body = $('.omnibar-panel-body');

	if (panel.kind === 'commandCenter') {
		body.append(
			group('Recent'),
			row('\u21BB', 'Change the theme to Red Velvet', 'Preferences: Color Theme'),
			row('\u21BB', 'Run the build task', 'Tasks: Run Build Task'),
			group('Sessions'),
			row('\u25CF', 'portfolio-site', 'needs input'),
			row('\u25CF', 'api-gateway', 'running'),
		);
		return body;
	}

	if (panel.kind === 'resolved') {
		body.append(group('Run'), row('\u2318', panel.label, 'Enter', true));
		return body;
	}

	// Routing card — a deliberate surface, because picking the wrong session is
	// the expensive mistake here.
	const card = $('.omnibar-card');

	const head = $('.omnibar-card-head');
	const avatar = $('.omnibar-avatar');
	avatar.textContent = 'PS';
	const name = $('span.omnibar-card-name');
	name.textContent = 'portfolio-site';
	const repo = $('span.omnibar-card-repo');
	repo.textContent = 'eli/portfolio';
	const match = $('span.omnibar-card-match');
	match.textContent = '87% match';
	head.append(avatar, name, repo, match);

	const transcript = $('.omnibar-transcript');
	for (const [who, text] of [['you', 'make the hero section bigger'], ['agent', 'Updated the hero to 72px and tightened the subhead.']]) {
		const turn = $('.omnibar-turn');
		const w = $('span.omnibar-turn-who');
		w.textContent = who;
		const t = $('span.omnibar-turn-text');
		t.textContent = text;
		turn.append(w, t);
		transcript.appendChild(turn);
	}

	const countdown = $('.omnibar-countdown');
	const progress = $('.omnibar-progress');
	const fill = $('.omnibar-progress-fill');
	const remaining = Math.max(0, 1 - beatProgress);
	fill.style.width = `${(remaining * 100).toFixed(1)}%`;
	progress.appendChild(fill);
	const timer = $('span.omnibar-row-hint');
	timer.textContent = `Sending in ${Math.max(1, Math.ceil(remaining * 10))}s`;
	const change = $('span.omnibar-action');
	change.setAttribute('data-primary', '');
	change.textContent = 'Change';
	const cancel = $('span.omnibar-action');
	cancel.textContent = 'Cancel';
	countdown.append(progress, timer, change, cancel);

	card.append(head, transcript, countdown);
	body.appendChild(card);
	return body;
}


// ============================================================================
// Demo
// ============================================================================

function beamFor(glow: Glow, ctx: ComponentFixtureContext, interactive: boolean): IBorderBeamOptions {
	const tone = GLOWS[glow];
	return {
		size: 'pulse-inner',
		colorVariant: tone.colorVariant,
		saturation: tone.saturation,
		strength: tone.strength,
		brightness: tone.brightness,
		hueBaseDeg: tone.hueBaseDeg,
		// Colour is the state indicator, so it must not drift off its base hue.
		hueRange: 0,
		theme: isDark(ctx) ? 'dark' : 'light',
		borderRadius: ISLAND_RADIUS,
		startVisible: !interactive,
		staticPreview: !interactive,
	};
}

function renderDemo(ctx: ComponentFixtureContext): void {
	const { container, disposableStore, isInteractive } = ctx;
	// A fixed frame: the panel grows and shrinks between beats, and letting the
	// whole stage reflow around it makes the demo feel jumpy on playback.
	container.style.cssText = [
		'padding:30px 26px', 'box-sizing:border-box', 'min-height:330px',
		'background:var(--vscode-editor-background)',
	].join(';');
	if (isInteractive) {
		enableAnimations(container);
	}

	const style = $('style');
	style.textContent = CSS;
	container.appendChild(style);

	const stage = $('.omnibar-demo');
	const note = $('.omnibar-note');
	const island = $('.omnibar-island');
	const panel = $('.omnibar-panel');
	const timeline = $('.omnibar-timeline');
	const ticks = SCRIPT.map(() => {
		const tick = $('.omnibar-tick');
		timeline.appendChild(tick);
		return tick;
	});
	stage.append(note, island, panel, timeline);
	container.appendChild(stage);

	const beam = disposableStore.add(new MutableDisposable<IDisposable>());

	/**
	 * Rebuilds the island's contents in place, so the surface itself persists.
	 *
	 * Only our own children are cleared: `applyBorderBeam` appends a
	 * `[data-beam-bloom]` element to its host, and wiping that would tear a hole
	 * in the glow.
	 */
	const paintIsland = (beat: Beat, progress: number) => {
		for (const child of [...island.children]) {
			if (!child.hasAttribute('data-beam-bloom')) {
				child.remove();
			}
		}
		if (beat.glyph) {
			const glyph = $('span.omnibar-glyph');
			glyph.textContent = beat.glyph;
			island.appendChild(glyph);
		}

		const text = $('span.omnibar-text');
		const full = beat.text;
		if (full) {
			// Typed beats reveal a character at a time over the first ~70% of the
			// beat, so the finished phrase is readable before it moves on.
			const shown = beat.type ? full.slice(0, Math.ceil(Math.min(1, progress / 0.7) * full.length)) : full;
			text.textContent = shown;
		} else {
			text.textContent = beat.placeholder ?? 'Ask anything, or start a new session\u2026';
			text.setAttribute('data-placeholder', '');
		}
		if (beat.caret) {
			text.appendChild($('span.omnibar-caret'));
		}
		island.appendChild(text);

		if (beat.pill) {
			const pill = $('span.omnibar-pill');
			pill.setAttribute('data-tone', beat.pill.tone);
			pill.appendChild($('span.omnibar-dot'));
			const label = $('span');
			label.textContent = beat.pill.label;
			pill.appendChild(label);
			island.appendChild(pill);
		}

		const mic = $('span.omnibar-mic');
		mic.textContent = '\u25CF';
		island.appendChild(mic);
	};

	// Elapsed comes from the wall clock rather than accumulating ticks, so the
	// script keeps its timing even when the browser throttles or drops timers
	// (background tabs are clamped to ~1Hz, which would otherwise stretch a
	// 2.6s beat into 40s).
	const started = Date.now();
	let currentIndex = -1;

	const frame = () => {
		const elapsed = (Date.now() - started) % TOTAL_MS;

		// Resolve the current beat from elapsed time, so every visual (typing,
		// countdown, progress ticks) derives from one clock.
		let acc = 0;
		let index = SCRIPT.length - 1;
		for (let i = 0; i < SCRIPT.length; i++) {
			if (elapsed < acc + SCRIPT[i].ms) {
				index = i;
				break;
			}
			acc += SCRIPT[i].ms;
		}
		const beat = SCRIPT[index];
		const progress = Math.min(1, (elapsed - acc) / beat.ms);
		const entering = index !== currentIndex;

		if (entering) {
			currentIndex = index;
			note.textContent = beat.note;
			replaceBeam(beam, island, beamFor(beat.glow, ctx, isInteractive));
			ticks.forEach((tick, i) => tick.toggleAttribute('data-on', i <= index));

			const body = buildPanelBody(beat.panel ?? { kind: 'none' }, progress);
			panel.textContent = '';
			if (body) {
				panel.appendChild(body);
				panel.style.display = '';
			} else {
				panel.style.display = 'none';
			}
		} else if (beat.panel?.kind === 'routing') {
			// Only the routing card animates within a beat (the countdown drains).
			const body = buildPanelBody(beat.panel, progress);
			panel.textContent = '';
			if (body) {
				panel.appendChild(body);
			}
		}

		paintIsland(beat, progress);
	};

	frame();
	// Only run the script while someone is watching; a capture takes the opening frame.
	if (isInteractive) {
		disposableStore.add(disposableWindowInterval(getWindow(container), frame, TICK_MS));
	}
}

export default defineThemedFixtureGroup({ path: 'voice/omnibarDemo/' }, {
	Demo: defineComponentFixture({
		labels: { kind: 'animated' },
		virtualTime: { enabled: false },
		render: renderDemo,
	}),
});

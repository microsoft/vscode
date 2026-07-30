/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, disposableWindowInterval, getWindow } from '../../../../base/browser/dom.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import '../../../../base/browser/ui/codicons/codiconStyles.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { asCssVariable } from '../../../../platform/theme/common/colorUtils.js';
import { ColorScheme } from '../../../../platform/theme/common/theme.js';
import { IBorderBeamOptions } from '../../../contrib/chat/browser/voiceClient/borderBeam/borderBeamElement.js';
import { enableAnimations, replaceBeam } from './beamFixtureUtils.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from './fixtureUtils.js';

/**
 * Omnibar — a self-running demo of the natural-language command center.
 *
 * The omnibar is **one surface that changes shape**. It is a single element that
 * grows downward to reveal secondary content, separated by a hairline rather
 * than floating as a detached popup — the input and its results are one object,
 * so the glow can wrap the whole thing.
 *
 * The script plays on a loop: type a request in plain language, watch it resolve
 * to a real command, hand off to voice, get routed to the right session, and get
 * interrupted when a background session needs an answer.
 */

// The ocean palette sits around this hue; rotating by (target - base) recenters
// the whole palette on a chosen colour.
const OCEAN_BASE_HUE = 250;
/** Listening / user — blue, rgb(88,166,255). */
const LISTENING_HUE = 212;
/** Speaking / assistant — purple, rgb(163,113,247). */
const SPEAKING_HUE = 262;

/**
 * Session status, mirroring `SessionStatus` and the icons/colours
 * `SessionsListModelService.getStatusIcon` resolves for each one, so the demo
 * reads exactly like the sessions list does.
 */
const SESSION_STATUS = {
	inProgress: { icon: Codicon.sessionInProgress, color: 'textLink.foreground', label: 'Working' },
	needsInput: { icon: Codicon.circleFilled, color: 'list.warningForeground', label: 'Needs input' },
	completed: { icon: Codicon.passFilled, color: 'agentSessionReadIndicator.foreground', label: 'Done' },
	error: { icon: Codicon.error, color: 'errorForeground', label: 'Failed' },
} as const;

type SessionStatusKey = keyof typeof SESSION_STATUS;

/** The workspace the command center is scoped to, as the real one shows it. */
const WORKSPACE_NAME = 'portfolio-site';

const SURFACE_WIDTH = 560;
const SURFACE_RADIUS = 14;
const TICK_MS = 60;

/**
 * A glow is a colour *and* a motion.
 *
 * `pulse` breathes in place and reads as a state (listening, speaking, blocked).
 * `rotate` sends a beam travelling around the border and reads as *work in
 * progress* — it has direction, so it says "something is happening" in a way a
 * symmetrical pulse cannot.
 */
type Glow = 'rest' | 'listening' | 'speaking' | 'alert' | 'thinking' | 'working' | 'matching';

interface GlowTone {
	readonly size: IBorderBeamOptions['size'];
	readonly colorVariant: IBorderBeamOptions['colorVariant'];
	readonly saturation: number;
	readonly strength: number;
	readonly brightness: number;
	readonly hueBaseDeg: number;
	/** Rotate family only: seconds per revolution. Slower reads as calmer. */
	readonly duration?: number;
}

// `mono` is attenuated ~4x internally, so neutral tones need near-full strength
// to sit at a weight comparable to the coloured ones.
const GLOWS: Record<Glow, GlowTone> = {
	rest: { size: 'pulse-inner', colorVariant: 'mono', saturation: 0, strength: 0.8, brightness: 1.3, hueBaseDeg: 0 },
	listening: { size: 'pulse-inner', colorVariant: 'ocean', saturation: 0.55, strength: 0.95, brightness: 1.35, hueBaseDeg: LISTENING_HUE - OCEAN_BASE_HUE },
	speaking: { size: 'pulse-inner', colorVariant: 'ocean', saturation: 0.6, strength: 0.95, brightness: 1.4, hueBaseDeg: SPEAKING_HUE - OCEAN_BASE_HUE },
	alert: { size: 'pulse-inner', colorVariant: 'sunset', saturation: 0.55, strength: 0.9, brightness: 1.35, hueBaseDeg: 0 },

	// Processing states — the traveling beam. Neutral while it parses, accent
	// once it is acting on your behalf, and a quicker sweep while it scans
	// sessions for a match.
	thinking: { size: 'md', colorVariant: 'mono', saturation: 0, strength: 0.9, brightness: 1.5, hueBaseDeg: 0, duration: 2.4 },
	working: { size: 'md', colorVariant: 'ocean', saturation: 0.5, strength: 0.95, brightness: 1.55, hueBaseDeg: LISTENING_HUE - OCEAN_BASE_HUE, duration: 2.0 },
	matching: { size: 'md', colorVariant: 'ocean', saturation: 0.45, strength: 0.9, brightness: 1.5, hueBaseDeg: LISTENING_HUE - OCEAN_BASE_HUE, duration: 1.5 },
};

function isDark(ctx: ComponentFixtureContext): boolean {
	return ctx.theme.type === ColorScheme.DARK || ctx.theme.type === ColorScheme.HIGH_CONTRAST_DARK;
}


// ============================================================================
// Script
// ============================================================================

type Body =
	| { readonly kind: 'none' }
	| { readonly kind: 'commandCenter' }
	| { readonly kind: 'scanning' }
	| { readonly kind: 'resolved'; readonly label: string }
	| { readonly kind: 'routing' };

interface Beat {
	/** What the narration strip says while this beat plays. */
	readonly note: string;
	readonly ms: number;
	readonly glow: Glow;
	/** Text in the input row. `type: true` reveals it a character at a time. */
	readonly text?: string;
	readonly type?: boolean;
	/** Leading status icon — only when there is something to say. */
	readonly icon?: ThemeIcon;
	/** Theme colour id for the leading icon. */
	readonly iconColor?: string;
	/** Leading icon spins, for processing states. */
	readonly spin?: boolean;
	readonly pill?: { readonly label: string; readonly tone: 'listening' | 'speaking' | 'alert' | 'busy' };
	readonly body?: Body;
	readonly caret?: boolean;
}

const TYPED = 'change the theme to red velvet';
const SPOKEN = 'change the theme to red for the website I\u2019ve been working on';

const SCRIPT: readonly Beat[] = [
	{
		note: 'At rest the omnibar is just a place to type \u2014 no AI chrome.',
		ms: 2600, glow: 'rest', body: { kind: 'commandCenter' },
	},
	{
		note: 'Type in plain language instead of hunting through the palette.',
		ms: 2400, glow: 'rest', text: TYPED, type: true, caret: true, body: { kind: 'commandCenter' },
	},
	{
		note: 'The beam travels while it parses \u2014 motion with direction reads as work.',
		ms: 1800, glow: 'thinking', text: TYPED, icon: Codicon.loading, spin: true,
		pill: { label: 'Thinking', tone: 'busy' },
	},
	{
		note: 'Resolved to a real command, ready to run.',
		ms: 1900, glow: 'rest', text: TYPED, body: { kind: 'resolved', label: 'Preferences: Color Theme \u2192 Red Velvet' },
	},
	{
		note: 'Safe and reversible, so it just runs \u2014 the beam turns accent while it acts.',
		ms: 1500, glow: 'working', text: 'Applying Red Velvet\u2026', icon: Codicon.loading, spin: true,
	},
	{
		note: 'Done.',
		ms: 1500, glow: 'rest', text: 'Theme changed to Red Velvet', icon: Codicon.check, iconColor: 'notificationsInfoIcon.foreground',
	},
	{
		note: 'The same surface takes voice \u2014 the glow turns blue while it listens.',
		ms: 3600, glow: 'listening', text: SPOKEN, type: true, caret: true,
		pill: { label: 'Listening', tone: 'listening' },
	},
	{
		note: '\u201Cthe website\u201D is ambiguous, so it scans your sessions for a match.',
		ms: 1900, glow: 'matching', text: SPOKEN, icon: Codicon.loading, spin: true,
		pill: { label: 'Matching', tone: 'busy' }, body: { kind: 'scanning' },
	},
	{
		note: 'It shows which one it picked, and gives you time to change it.',
		ms: 4200, glow: 'rest', text: SPOKEN, body: { kind: 'routing' },
	},
	{
		note: 'Confirmed \u2014 the request goes to that session.',
		ms: 1600, glow: 'rest', text: `Sent to ${WORKSPACE_NAME}`, icon: Codicon.check, iconColor: 'notificationsInfoIcon.foreground',
	},
	{
		note: 'Meanwhile another session gets blocked and says so.',
		ms: 3000, glow: 'alert',
		pill: { label: 'api-gateway needs input', tone: 'alert' },
	},
	{
		note: 'It reads the question aloud and opens the mic for your answer.',
		ms: 3400, glow: 'speaking', text: 'It wants to run \u201Crm -rf build\u201D. Allow it?',
		pill: { label: 'Speaking', tone: 'speaking' },
	},
	{
		note: 'Answered \u2014 back to rest.',
		ms: 2000, glow: 'rest', body: { kind: 'commandCenter' },
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
	gap: 16px;
	align-items: flex-start;
	font-family: var(--vscode-font-family);
	color: var(--vscode-foreground);
}

/* Narration */
.omnibar-note {
	min-height: 17px;
	font-size: 12px;
	line-height: 17px;
	opacity: .6;
	letter-spacing: .01em;
}

/*
 * The surface. One object: the input row and everything it reveals live inside
 * the same rounded rect, so the glow can wrap the whole thing and the growth
 * reads as the surface changing shape rather than a popup appearing.
 */
.omnibar-surface {
	position: relative;
	box-sizing: border-box;
	width: ${SURFACE_WIDTH}px;
	border-radius: ${SURFACE_RADIUS}px;
	background: var(--vscode-input-background);
	border: 1px solid var(--vscode-input-border, transparent);
	color: var(--vscode-input-foreground);
	/* Elevation deepens as it expands — a taller object casts more shadow. */
	box-shadow: 0 1px 2px rgba(0, 0, 0, .18), 0 8px 24px -12px rgba(0, 0, 0, .5);
	transition: box-shadow 320ms cubic-bezier(.2, .8, .2, 1);
}
.omnibar-surface[data-expanded] {
	box-shadow: 0 2px 4px rgba(0, 0, 0, .22), 0 18px 44px -16px rgba(0, 0, 0, .62);
}

/* Input row — the part that is always visible. */
.omnibar-input {
	display: flex;
	align-items: center;
	gap: 10px;
	min-height: 42px;
	padding: 8px 8px 8px 15px;
}
.omnibar-glyph {
	flex: 0 0 auto;
	width: 14px;
	text-align: center;
	font-size: 12px;
	opacity: .75;
}
.omnibar-glyph .codicon { font-size: 14px; }
.omnibar-glyph[data-spin] .codicon { animation: omnibar-spin 1.1s linear infinite; }
@keyframes omnibar-spin { to { transform: rotate(360deg); } }

.omnibar-text {
	flex: 1;
	min-width: 0;
	font-size: 13px;
	letter-spacing: .005em;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.omnibar-text[data-placeholder] { color: var(--vscode-input-placeholderForeground); }
/* At rest: workspace name, dot separator, prompt — as the real command center reads. */
.omnibar-scope { color: var(--vscode-foreground); opacity: .85; }
.omnibar-sep { display: inline-flex; align-items: center; padding: 0 7px; opacity: .35; font-size: 10px; }
.omnibar-prompt { opacity: .85; }
.omnibar-caret {
	display: inline-block;
	width: 1px;
	height: 14px;
	margin-left: 1px;
	vertical-align: text-bottom;
	background: currentColor;
	animation: omnibar-blink 1.06s steps(1, end) infinite;
}
@keyframes omnibar-blink { 0%, 55% { opacity: 1; } 56%, 100% { opacity: 0; } }

.omnibar-mic {
	flex: 0 0 auto;
	display: flex;
	align-items: center;
	justify-content: center;
	width: 26px;
	height: 26px;
	border-radius: 8px;
	color: var(--vscode-icon-foreground);
	opacity: .85;
}
.omnibar-mic .codicon { font-size: 15px; }
.omnibar-pill {
	flex: 0 0 auto;
	display: flex;
	align-items: center;
	gap: 6px;
	height: 22px;
	padding: 0 10px;
	border-radius: 999px;
	font-size: 11px;
	white-space: nowrap;
	background: var(--vscode-badge-background);
	color: var(--vscode-badge-foreground);
}
.omnibar-pill[data-tone="listening"] { background: color-mix(in srgb, rgb(88,166,255) 24%, transparent); color: var(--vscode-foreground); }
.omnibar-pill[data-tone="speaking"] { background: color-mix(in srgb, rgb(163,113,247) 24%, transparent); color: var(--vscode-foreground); }
.omnibar-pill[data-tone="alert"] { background: color-mix(in srgb, var(--vscode-notificationsWarningIcon-foreground) 24%, transparent); color: var(--vscode-foreground); }
.omnibar-pill[data-tone="busy"] { background: color-mix(in srgb, var(--vscode-foreground) 11%, transparent); color: var(--vscode-foreground); opacity: .9; }
.omnibar-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.omnibar-pill[data-tone="listening"] .omnibar-dot,
.omnibar-pill[data-tone="speaking"] .omnibar-dot,
.omnibar-pill[data-tone="busy"] .omnibar-dot { animation: omnibar-breathe 1.5s ease-in-out infinite; }
@keyframes omnibar-breathe { 0%, 100% { opacity: .45; } 50% { opacity: 1; } }

/*
 * The expanding half. Height is animated explicitly so growth is a smooth,
 * weighted motion rather than a jump.
 */
.omnibar-body {
	height: 0;
	overflow: hidden;
	transition: height 340ms cubic-bezier(.2, .8, .2, 1);
}
/* The hairline is the only thing separating the two halves. */
.omnibar-divider {
	height: 1px;
	margin: 0 1px;
	background: var(--vscode-foreground);
	opacity: .08;
}
.omnibar-body-inner { padding: 7px 0 8px; }

/* Rows */
.omnibar-group {
	padding: 5px 15px 3px;
	font-size: 10px;
	letter-spacing: .07em;
	text-transform: uppercase;
	opacity: .45;
}
.omnibar-row {
	display: flex;
	align-items: center;
	gap: 10px;
	margin: 0 6px;
	padding: 5px 9px;
	border-radius: 7px;
	font-size: 12px;
	line-height: 18px;
	/* Rows arrive just after the surface starts growing, so the motion reads as
	one gesture rather than two competing ones. */
	animation: omnibar-row-in 260ms cubic-bezier(.2, .8, .2, 1) both;
}
@keyframes omnibar-row-in { from { opacity: 0; transform: translateY(-3px); } }
.omnibar-row[data-selected] {
	background: color-mix(in srgb, var(--vscode-list-activeSelectionBackground) 82%, transparent);
	color: var(--vscode-list-activeSelectionForeground);
}
.omnibar-row-glyph { flex: 0 0 auto; width: 14px; text-align: center; opacity: .65; font-size: 11px; }
.omnibar-row-label { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.omnibar-row-hint { flex: 0 0 auto; opacity: .5; font-size: 11px; white-space: nowrap; }
.omnibar-row[data-selected] .omnibar-row-hint,
.omnibar-row[data-selected] .omnibar-row-glyph { opacity: .8; }

/* Session status icons carry their own theme colour, so they stay full strength. */
.omnibar-row-glyph .codicon { font-size: 14px; }
.omnibar-row-glyph[data-pulse] { animation: omnibar-breathe 1.9s ease-in-out infinite; }

/* Scanning — sessions being considered for a match */
.omnibar-scan-bar {
	position: relative;
	height: 2px;
	margin: 3px 15px 7px;
	border-radius: 999px;
	background: color-mix(in srgb, var(--vscode-foreground) 10%, transparent);
	overflow: hidden;
}
.omnibar-scan-bar::after {
	content: '';
	position: absolute;
	inset: 0;
	width: 38%;
	border-radius: 999px;
	background: rgb(88, 166, 255);
	animation: omnibar-scan 1.15s cubic-bezier(.5, 0, .5, 1) infinite;
}
@keyframes omnibar-scan { from { transform: translateX(-100%); } to { transform: translateX(320%); } }

/* Routing card */
.omnibar-card { padding: 4px 15px 12px; display: flex; flex-direction: column; gap: 11px; }
.omnibar-card-head { display: flex; align-items: center; gap: 9px; }
.omnibar-avatar {
	width: 22px; height: 22px; border-radius: 7px;
	display: flex; align-items: center; justify-content: center;
	font-size: 9px; font-weight: 600; letter-spacing: .03em;
	background: color-mix(in srgb, rgb(88,166,255) 26%, transparent);
	color: var(--vscode-foreground);
}
.omnibar-card-name { font-size: 12px; font-weight: 600; }
.omnibar-card-repo { font-size: 12px; opacity: .5; }
.omnibar-card-match { margin-left: auto; font-size: 11px; opacity: .6; font-variant-numeric: tabular-nums; }
.omnibar-transcript {
	display: flex; flex-direction: column; gap: 5px;
	padding: 9px 11px;
	border-radius: 9px;
	background: color-mix(in srgb, var(--vscode-foreground) 5%, transparent);
}
.omnibar-turn { display: flex; gap: 9px; font-size: 12px; line-height: 17px; }
.omnibar-turn-who { flex: 0 0 36px; opacity: .42; font-size: 11px; }
.omnibar-turn-text { flex: 1; min-width: 0; opacity: .82; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.omnibar-countdown { display: flex; align-items: center; gap: 11px; font-size: 11px; }
.omnibar-progress { flex: 1; height: 2px; border-radius: 999px; background: color-mix(in srgb, var(--vscode-foreground) 12%, transparent); overflow: hidden; }
.omnibar-progress-fill { height: 100%; border-radius: 999px; background: rgb(88, 166, 255); }
.omnibar-timer { opacity: .55; font-variant-numeric: tabular-nums; }
.omnibar-action { opacity: .75; }
.omnibar-action[data-primary] { color: var(--vscode-textLink-foreground); opacity: 1; }

/* Progress through the script */
.omnibar-timeline { display: flex; gap: 3px; width: ${SURFACE_WIDTH}px; }
.omnibar-tick {
	flex: 1; height: 2px; border-radius: 999px;
	background: currentColor; opacity: .1;
	transition: opacity 260ms ease;
}
.omnibar-tick[data-on] { opacity: .42; }
`;


// ============================================================================
// Body content
// ============================================================================

/** A themed codicon, coloured from a theme token the way the product does. */
function icon(themeIcon: ThemeIcon, colorId?: string): HTMLElement {
	const el = renderIcon(themeIcon);
	if (colorId) {
		el.style.color = asCssVariable(colorId);
	}
	return el;
}

function row(glyph: HTMLElement, label: string, hint?: string, selected?: boolean): HTMLElement {
	const el = $('.omnibar-row');
	if (selected) {
		el.setAttribute('data-selected', '');
	}
	const holder = $('span.omnibar-row-glyph');
	holder.appendChild(glyph);
	const labelEl = $('span.omnibar-row-label');
	labelEl.textContent = label;
	el.append(holder, labelEl);
	if (hint) {
		const h = $('span.omnibar-row-hint');
		h.textContent = hint;
		el.appendChild(h);
	}
	return el;
}

/** A session row, using the same icon + colour the sessions list resolves. */
function sessionRow(name: string, status: SessionStatusKey, hint?: string): HTMLElement {
	const { icon: themeIcon, color, label } = SESSION_STATUS[status];
	const el = row(icon(themeIcon, color), name, hint ?? label);
	if (status === 'needsInput') {
		// The sessions list pulses needs-input so a blocked session is findable
		// without reading every row.
		el.querySelector('.omnibar-row-glyph')?.setAttribute('data-pulse', '');
	}
	return el;
}

function group(label: string): HTMLElement {
	const el = $('.omnibar-group');
	el.textContent = label;
	return el;
}

/** Stagger the rows so the reveal reads as one gesture. */
function stagger(root: HTMLElement): HTMLElement {
	root.querySelectorAll<HTMLElement>('.omnibar-row').forEach((el, i) => {
		el.style.animationDelay = `${60 + i * 34}ms`;
	});
	return root;
}

function buildBody(body: Body, beatProgress: number): HTMLElement | undefined {
	if (body.kind === 'none') {
		return undefined;
	}

	const inner = $('.omnibar-body-inner');

	if (body.kind === 'commandCenter') {
		inner.append(
			group('Recently used'),
			row(icon(Codicon.history), 'Change the theme to Red Velvet', 'Preferences: Color Theme'),
			row(icon(Codicon.history), 'Run the build task', 'Tasks: Run Build Task'),
			group('Agent sessions'),
			sessionRow('portfolio-site', 'inProgress'),
			sessionRow('api-gateway', 'needsInput'),
			sessionRow('docs-site', 'completed'),
		);
		return stagger(inner);
	}

	if (body.kind === 'scanning') {
		inner.append(
			group('Matching sessions'),
			$('.omnibar-scan-bar'),
			sessionRow('portfolio-site', 'inProgress', 'eli/portfolio'),
			sessionRow('api-gateway', 'needsInput', 'eli/api'),
		);
		return stagger(inner);
	}

	if (body.kind === 'resolved') {
		inner.append(group('Run'), row(icon(Codicon.gear), body.label, 'Enter', true));
		return stagger(inner);
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
	const timer = $('span.omnibar-timer');
	timer.textContent = `Sending in ${Math.max(1, Math.ceil(remaining * 10))}s`;
	const change = $('span.omnibar-action');
	change.setAttribute('data-primary', '');
	change.textContent = 'Change';
	const cancel = $('span.omnibar-action');
	cancel.textContent = 'Cancel';
	countdown.append(progress, timer, change, cancel);

	card.append(head, transcript, countdown);
	inner.appendChild(card);
	return inner;
}


// ============================================================================
// Demo
// ============================================================================

function beamFor(glow: Glow, ctx: ComponentFixtureContext, interactive: boolean): IBorderBeamOptions {
	const tone = GLOWS[glow];
	return {
		size: tone.size,
		colorVariant: tone.colorVariant,
		saturation: tone.saturation,
		strength: tone.strength,
		brightness: tone.brightness,
		hueBaseDeg: tone.hueBaseDeg,
		duration: tone.duration,
		// Colour is the state indicator, so it must not drift off its base hue.
		hueRange: 0,
		theme: isDark(ctx) ? 'dark' : 'light',
		borderRadius: SURFACE_RADIUS,
		startVisible: !interactive,
		staticPreview: !interactive,
	};
}

function renderDemo(ctx: ComponentFixtureContext): void {
	const { container, disposableStore, isInteractive } = ctx;
	// A fixed frame: the surface grows and shrinks between beats, and letting the
	// whole stage reflow around it makes the demo feel jumpy on playback.
	container.style.cssText = [
		'padding:30px 26px', 'box-sizing:border-box', 'min-height:340px',
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

	const surface = $('.omnibar-surface');
	const inputRow = $('.omnibar-input');
	const bodyWrap = $('.omnibar-body');
	surface.append(inputRow, bodyWrap);

	const timeline = $('.omnibar-timeline');
	const ticks = SCRIPT.map(() => {
		const tick = $('.omnibar-tick');
		timeline.appendChild(tick);
		return tick;
	});

	stage.append(note, surface, timeline);
	container.appendChild(stage);

	const beam = disposableStore.add(new MutableDisposable<IDisposable>());

	/** Repaints the input row in place, so the surface itself persists. */
	const paintInput = (beat: Beat, progress: number) => {
		inputRow.textContent = '';

		if (beat.icon) {
			const glyph = $('span.omnibar-glyph');
			glyph.appendChild(icon(beat.icon, beat.iconColor));
			if (beat.spin) {
				glyph.setAttribute('data-spin', '');
			}
			inputRow.appendChild(glyph);
		}

		const text = $('span.omnibar-text');
		const full = beat.text;
		if (full) {
			// Typed beats reveal a character at a time over the first ~70% of the
			// beat, so the finished phrase is readable before it moves on.
			const shown = beat.type ? full.slice(0, Math.ceil(Math.min(1, progress / 0.7) * full.length)) : full;
			text.textContent = shown;
		} else {
			// Empty, like the real command center: the workspace it is scoped to,
			// a dot separator, then the prompt.
			const scope = $('span.omnibar-scope');
			scope.textContent = WORKSPACE_NAME;
			const sep = $('span.omnibar-sep');
			sep.appendChild(renderIcon(Codicon.circleSmallFilled));
			const prompt = $('span.omnibar-prompt');
			prompt.textContent = 'Ask anything, or run a command\u2026';
			text.append(scope, sep, prompt);
			text.setAttribute('data-placeholder', '');
		}
		if (beat.caret) {
			text.appendChild($('span.omnibar-caret'));
		}
		inputRow.appendChild(text);

		if (beat.pill) {
			const pill = $('span.omnibar-pill');
			pill.setAttribute('data-tone', beat.pill.tone);
			pill.appendChild($('span.omnibar-dot'));
			const label = $('span');
			label.textContent = beat.pill.label;
			pill.appendChild(label);
			inputRow.appendChild(pill);
		}

		// Mic while idle/listening; send once there is something to submit.
		const trailing = $('span.omnibar-mic');
		const isVoice = beat.pill?.tone === 'listening' || beat.pill?.tone === 'speaking';
		trailing.appendChild(renderIcon(
			beat.type && !isVoice ? Codicon.send : isVoice ? Codicon.micFilled : Codicon.mic
		));
		inputRow.appendChild(trailing);
	};

	/** Swaps the lower half and animates the surface to its new height. */
	const paintBody = (beat: Beat, progress: number) => {
		const content = buildBody(beat.body ?? { kind: 'none' }, progress);
		bodyWrap.textContent = '';

		if (!content) {
			bodyWrap.style.height = '0px';
			surface.removeAttribute('data-expanded');
			return;
		}

		const divider = $('.omnibar-divider');
		bodyWrap.append(divider, content);
		surface.setAttribute('data-expanded', '');
		// The children lay out at their natural height even though the wrapper is
		// clipped to zero, so they can be measured directly. Round-tripping the
		// wrapper through `height: auto` instead would collapse into a single
		// style recalc and the transition would never leave its start value.
		bodyWrap.style.height = `${divider.offsetHeight + content.offsetHeight}px`;
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

		if (index !== currentIndex) {
			currentIndex = index;
			note.textContent = beat.note;
			replaceBeam(beam, surface, beamFor(beat.glow, ctx, isInteractive));
			ticks.forEach((tick, i) => tick.toggleAttribute('data-on', i <= index));
			paintBody(beat, progress);
		} else if (beat.body?.kind === 'routing') {
			// Only the routing card animates within a beat (the countdown drains),
			// and it does so without disturbing the surface height.
			const content = buildBody(beat.body, progress);
			const existing = bodyWrap.querySelector('.omnibar-body-inner');
			if (content && existing) {
				existing.replaceWith(content);
			}
		}

		paintInput(beat, progress);
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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, disposableWindowInterval, getWindow } from '../../../../base/browser/dom.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { createPixelSpinner } from '../../../../base/browser/ui/pixelSpinner/pixelSpinner.js';
import '../../../../base/browser/ui/pixelSpinner/pixelSpinner.css';
import '../../../../base/browser/ui/codicons/codiconStyles.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { ColorScheme } from '../../../../platform/theme/common/theme.js';
import { IBorderBeamOptions } from '../../../contrib/chat/browser/voiceClient/borderBeam/borderBeamElement.js';
import { enableAnimations, replaceBeam } from './beamFixtureUtils.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from './fixtureUtils.js';

/**
 * Omnibar — a self-running demo of the natural-language command center.
 *
 * The premise: **one component with two homes**. It starts docked in the title
 * bar as the command center, and can be dragged out of the window to become a
 * floating, always-on-top omnibar — the shape `AgentsVoiceWindowService` already
 * gives the voice pane. Docked or floating it is the same element, so it keeps
 * its state across the move.
 *
 * The chrome inside it is copied from the real product rather than approximated:
 * the segmented voice/dictation pill, the pixel spinner used for live sessions,
 * request bubbles vs plain agent turns, `.progress-container` tool rows, and the
 * confirmation widget's Allow/Skip. Where a real detail is reproduced, the
 * comment says which file it came from.
 */

const TICK_MS = 60;
const DOCKED_WIDTH = 440;
const FLOATING_WIDTH = 580;
const SURFACE_RADIUS = 14;


// ============================================================================
// Colour system
// ============================================================================

/**
 * One palette, one meaning per hue. Every glow, icon and dot pulls from here so
 * a colour always means the same thing wherever it turns up.
 *
 * `hue` rotates the beam's ocean palette (centred ~250) onto the target hue; a
 * null hue means neutral, which renders through the mono palette.
 */
const STATE_COLORS = {
	/** Listening — the user is talking. */
	listening: { rgb: '88,166,255', hue: 212 },
	/** Speaking — the agent is talking back. */
	speaking: { rgb: '236,124,196', hue: 322 },
	/** Processing — the bar itself is thinking. Neutral by design. */
	processing: { rgb: '235,235,235', hue: null },
	/** Needs input — a session is blocked on you. */
	needsInput: { rgb: '224,151,66', hue: 33 },
	/** Resolved happily. */
	done: { rgb: '87,182,116', hue: 143 },
} as const;

type StateColor = keyof typeof STATE_COLORS;

const OCEAN_BASE_HUE = 250;

function stateColor(state: StateColor): string {
	return `rgb(${STATE_COLORS[state].rgb})`;
}

const WORKSPACE_NAME = 'portfolio-site';

function isDark(ctx: ComponentFixtureContext): boolean {
	return ctx.theme.type === ColorScheme.DARK || ctx.theme.type === ColorScheme.HIGH_CONTRAST_DARK;
}


// ============================================================================
// Glow
// ============================================================================

/**
 * A glow is a colour *and* a motion.
 *
 * `pulse` breathes in place and reads as a state you are in. `rotate` sends a
 * beam travelling the border and reads as work happening — it has direction.
 * That traveling beam **is** the loading indicator; nothing else spins, and
 * there is no "working" pill.
 */
interface GlowTone {
	readonly size: IBorderBeamOptions['size'];
	readonly state: StateColor | 'rest';
	readonly strength: number;
	readonly brightness: number;
	/** Rotate family only: seconds per revolution. */
	readonly duration?: number;
}

const GLOWS = {
	rest: { size: 'pulse-inner', state: 'rest', strength: 0.75, brightness: 1.3 },
	listening: { size: 'pulse-inner', state: 'listening', strength: 0.95, brightness: 1.35 },
	speaking: { size: 'pulse-inner', state: 'speaking', strength: 0.95, brightness: 1.4 },
	needsInput: { size: 'pulse-inner', state: 'needsInput', strength: 0.9, brightness: 1.35 },
	done: { size: 'pulse-inner', state: 'done', strength: 0.85, brightness: 1.35 },
	/** The bar is thinking — neutral traveling beam. */
	processing: { size: 'md', state: 'processing', strength: 0.95, brightness: 1.5, duration: 2.2 },
	/** A session is running — the blue comet. */
	working: { size: 'md', state: 'listening', strength: 0.95, brightness: 1.5, duration: 2.0 },
} as const satisfies Record<string, GlowTone>;

type Glow = keyof typeof GLOWS;

function beamFor(glow: Glow, ctx: ComponentFixtureContext, interactive: boolean): IBorderBeamOptions {
	const tone: GlowTone = GLOWS[glow];
	const color = tone.state === 'rest' ? undefined : STATE_COLORS[tone.state];
	// `mono` is attenuated ~4x internally, hence the higher strength on neutrals.
	const mono = !color?.hue;
	return {
		size: tone.size,
		colorVariant: mono ? 'mono' : 'ocean',
		saturation: mono ? 0 : 0.55,
		strength: tone.strength,
		brightness: tone.brightness,
		hueBaseDeg: color?.hue ? color.hue - OCEAN_BASE_HUE : 0,
		duration: tone.duration,
		// Colour carries the state's meaning, so it must not drift off its hue.
		hueRange: 0,
		theme: isDark(ctx) ? 'dark' : 'light',
		borderRadius: SURFACE_RADIUS,
		startVisible: !interactive,
		staticPreview: !interactive,
	};
}


// ============================================================================
// Script
// ============================================================================

type Body =
	| { readonly kind: 'none' }
	| { readonly kind: 'commandCenter' }
	| { readonly kind: 'resolved'; readonly label: string }
	| { readonly kind: 'sessions' }
	| { readonly kind: 'session'; readonly confirm?: boolean }
	/** Scenario 1 — the bar scans open sessions to disambiguate a request. */
	| { readonly kind: 'routing'; readonly settled?: boolean }
	/** Scenario 2 — one instruction fanned out across several sessions. */
	| { readonly kind: 'fanout' }
	/** Scenario 3 — the queue of sessions waiting on a decision. */
	| { readonly kind: 'queue'; readonly index: number };

/** Where the component lives during a beat. */
type Home = 'docked' | 'dragging' | 'floating';

/** Voice pill state, mirroring the segmented control's cell classes. */
type VoiceState = 'off' | 'idle' | 'listening' | 'speaking' | 'dictating';

interface Beat {
	readonly note: string;
	readonly ms: number;
	readonly home: Home;
	readonly glow: Glow;
	/** Text in the input row. `type: true` reveals it a character at a time. */
	readonly text?: string;
	readonly type?: boolean;
	/** Leading status icon. There is deliberately no spinner — see GLOWS. */
	readonly icon?: ThemeIcon;
	readonly iconColor?: StateColor;
	readonly voice?: VoiceState;
	readonly body?: Body;
	readonly caret?: boolean;
}

const TYPED = 'change the theme to red velvet';
const SPOKEN = 'make the hero bigger on the website I\u2019ve been working on';

const SCRIPT: readonly Beat[] = [
	// --- Act 1: docked in the title bar --------------------------------------
	{
		note: 'It starts docked in the title bar \u2014 the command center, scoped to your workspace.',
		ms: 4200, home: 'docked', glow: 'rest', voice: 'off',
	},
	{
		note: 'Focus it and it grows in place: recents, and every agent session you have running.',
		ms: 5400, home: 'docked', glow: 'rest', voice: 'off', body: { kind: 'commandCenter' },
	},

	// --- Act 2: pull it out of the window -------------------------------------
	{
		note: 'Drag it out of the window\u2026',
		ms: 2800, home: 'dragging', glow: 'rest', voice: 'off',
	},
	{
		note: '\u2026and it becomes a floating omnibar that stays above everything.',
		ms: 4000, home: 'floating', glow: 'rest', voice: 'off',
	},

	// --- Act 3: natural language ----------------------------------------------
	{
		note: 'Type in plain language instead of hunting through the palette.',
		ms: 4200, home: 'floating', glow: 'rest', voice: 'off', text: TYPED, type: true, caret: true,
	},
	{
		note: 'The beam travels while it resolves. That motion is the only loading state.',
		ms: 3200, home: 'floating', glow: 'processing', voice: 'off', text: TYPED,
	},
	{
		note: 'Resolved to a real command \u2014 safe and reversible, so it just runs.',
		ms: 4200, home: 'floating', glow: 'rest', voice: 'off', text: TYPED,
		body: { kind: 'resolved', label: 'Preferences: Color Theme \u2192 Red Velvet' },
	},
	{
		note: 'Done.',
		ms: 2600, home: 'floating', glow: 'done', voice: 'off',
		text: 'Theme changed to Red Velvet', icon: Codicon.check, iconColor: 'done',
	},

	// --- Act 4: voice -----------------------------------------------------------
	{
		note: 'Turn voice on and the pill switches to the waveform \u2014 the mic stays dictation.',
		ms: 3600, home: 'floating', glow: 'rest', voice: 'idle',
	},
	{
		note: 'Listening: blue, and the bars ride your voice.',
		ms: 5200, home: 'floating', glow: 'listening', voice: 'listening', text: SPOKEN, type: true,
	},
	{
		note: 'Thinking \u2014 no spinner, just the beam.',
		ms: 3000, home: 'floating', glow: 'processing', voice: 'idle', text: SPOKEN,
	},
	{
		note: 'Speaking: pink, same bars driven by the reply instead.',
		ms: 4600, home: 'floating', glow: 'speaking', voice: 'speaking',
		text: 'Sending that to portfolio-site \u2014 the site you were just editing.',
	},

	// --- Act 5: orchestrating many sessions ------------------------------------
	// Three patterns, because "orchestration" is really three different jobs:
	// aiming one request, fanning one out, and clearing what is blocked.
	{
		note: 'Orchestration lives here too \u2014 live sessions animate, as they do in the list.',
		ms: 5000, home: 'floating', glow: 'rest', voice: 'idle', body: { kind: 'sessions' },
	},

	// Scenario 1 — aim one request at the right session.
	{
		note: '1 \u2014 Routing. \u201Cthe website\u201D is ambiguous, so it ranks your open sessions.',
		ms: 4600, home: 'floating', glow: 'processing', voice: 'idle',
		text: SPOKEN, body: { kind: 'routing' },
	},
	{
		note: 'It commits to the best match and shows what it chose between.',
		ms: 4400, home: 'floating', glow: 'rest', voice: 'idle',
		text: SPOKEN, body: { kind: 'routing', settled: true },
	},
	{
		note: 'Follow it in place \u2014 a viewport into the conversation as it works.',
		ms: 6000, home: 'floating', glow: 'working', voice: 'idle', body: { kind: 'session' },
	},

	// Scenario 2 — one instruction, many sessions.
	{
		note: '2 \u2014 Fan-out. One instruction to every session at once.',
		ms: 3200, home: 'floating', glow: 'rest', voice: 'idle',
		text: 'bump the copyright year everywhere', type: true, caret: true,
	},
	{
		note: 'Each runs on its own, and the bar becomes a small dashboard.',
		ms: 6400, home: 'floating', glow: 'working', voice: 'idle', body: { kind: 'fanout' },
	},

	// Scenario 3 — clear what is blocked.
	{
		note: '3 \u2014 Triage. Two sessions are blocked; it walks you through them.',
		ms: 5600, home: 'floating', glow: 'needsInput', voice: 'idle',
		body: { kind: 'queue', index: 0 },
	},
	{
		note: 'Answer one and the next slides in \u2014 no hunting for what is stuck.',
		ms: 5600, home: 'floating', glow: 'needsInput', voice: 'idle',
		body: { kind: 'queue', index: 1 },
	},
	{
		note: 'Queue clear \u2014 and it settles back to rest.',
		ms: 3600, home: 'floating', glow: 'done', voice: 'idle',
		text: 'All caught up \u00B7 3 sessions running', icon: Codicon.check, iconColor: 'done',
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
	align-items: center;
	gap: 14px;
	font-family: var(--vscode-font-family);
	color: var(--vscode-foreground);
}
.omnibar-note {
	align-self: flex-start;
	min-height: 17px;
	font-size: 12px;
	line-height: 17px;
	opacity: .6;
}

/* The host window, so "dragged out" has something to be dragged out of. */
.omnibar-window {
	width: 100%;
	border-radius: 9px;
	background: var(--vscode-editor-background);
	border: 1px solid var(--vscode-editorWidget-border, rgba(127,127,127,.22));
	transition: opacity 420ms ease;
}
.omnibar-titlebar {
	display: flex;
	align-items: center;
	gap: 8px;
	height: 44px;
	padding: 0 12px;
	background: var(--vscode-titleBar-activeBackground, rgba(127,127,127,.08));
	border-bottom: 1px solid var(--vscode-editorWidget-border, rgba(127,127,127,.18));
	border-radius: 8px 8px 0 0;
}
.omnibar-traffic { flex: 0 0 auto; display: flex; gap: 6px; }
.omnibar-traffic i { width: 10px; height: 10px; border-radius: 50%; background: var(--vscode-foreground); opacity: .18; }
/* Anchored so the docked surface grows *over* the editor rather than
	stretching or being cropped by the chrome. */
.omnibar-dock { position: relative; flex: 1; align-self: stretch; min-width: 0; }
.omnibar-canvas { height: 76px; border-radius: 0 0 8px 8px; overflow: hidden; }
.omnibar-canvas-line { height: 6px; margin: 13px 16px; border-radius: 3px; background: var(--vscode-foreground); opacity: .05; }
.omnibar-canvas-line:nth-child(2) { width: 62%; }
.omnibar-canvas-line:nth-child(3) { width: 44%; }

/* One object in both homes: docked it sits in the title bar, floating it lifts
	off with a deeper shadow and gains a drag handle. */
.omnibar-surface {
	position: relative;
	box-sizing: border-box;
	width: ${DOCKED_WIDTH}px;
	border-radius: ${SURFACE_RADIUS}px;
	background: var(--vscode-input-background);
	border: 1px solid var(--vscode-input-border, transparent);
	color: var(--vscode-input-foreground);
	transition: width 440ms cubic-bezier(.2,.8,.2,1), box-shadow 440ms ease, transform 440ms cubic-bezier(.2,.8,.2,1);
}
.omnibar-surface[data-home="docked"] {
	position: absolute; top: 6px; left: 50%; margin-left: -${DOCKED_WIDTH / 2}px; z-index: 5;
}
.omnibar-surface[data-home="dragging"] {
	width: ${FLOATING_WIDTH}px;
	transform: translateY(24px) scale(1.02);
	box-shadow: 0 18px 40px -14px rgba(0,0,0,.6);
}
.omnibar-surface[data-home="floating"] {
	width: ${FLOATING_WIDTH}px;
	box-shadow: 0 2px 5px rgba(0,0,0,.22), 0 22px 52px -18px rgba(0,0,0,.66);
}

/* Input row */
.omnibar-input { display: flex; align-items: center; gap: 8px; min-height: 42px; padding: 8px 8px 8px 14px; }
.omnibar-grip { flex: 0 0 auto; display: none; align-items: center; color: var(--vscode-foreground); opacity: .26; }
.omnibar-surface[data-home="dragging"] .omnibar-grip,
.omnibar-surface[data-home="floating"] .omnibar-grip { display: flex; }
.omnibar-grip .codicon { font-size: 13px; }

.omnibar-glyph { flex: 0 0 auto; display: flex; align-items: center; }
.omnibar-glyph .codicon { font-size: 14px; }

.omnibar-text { flex: 1; min-width: 0; display: flex; align-items: center; font-size: 13px; white-space: nowrap; overflow: hidden; }
.omnibar-typed { overflow: hidden; text-overflow: ellipsis; }
.omnibar-scope { flex: 0 0 auto; font-weight: 500; opacity: .9; }
.omnibar-sep { flex: 0 0 auto; width: 1px; height: 13px; margin: 0 9px; background: currentColor; opacity: .16; }
.omnibar-prompt { flex: 1; min-width: 0; color: var(--vscode-input-placeholderForeground); overflow: hidden; text-overflow: ellipsis; }
.omnibar-caret { flex: 0 0 auto; width: 1px; height: 14px; margin-left: 1px; background: currentColor; animation: omnibar-blink 1.06s steps(1, end) infinite; }
@keyframes omnibar-blink { 0%,55% { opacity: 1; } 56%,100% { opacity: 0; } }

/*
 * Send — 22x22 at the control tier, matching the chat input. Outlined rather
 * than filled: a solid accent block next to the glow reads as two competing
 * accents on one surface.
 */
.omnibar-send {
	flex: 0 0 auto; display: flex; align-items: center; justify-content: center;
	box-sizing: border-box;
	width: 22px; height: 22px;
	border-radius: var(--vscode-cornerRadius-circle, 999px);
	border: 1px solid var(--vscode-input-border, rgba(127,127,127,.35));
	color: var(--vscode-icon-foreground);
}
/* Optical nudge, as chat.css does for this glyph. */
.omnibar-send .codicon { font-size: var(--vscode-codiconFontSize-compact, 12px); transform: translateY(.5px); }

/*
 * Segmented voice / dictation pill.
 * Reproduces .monaco-segmented-icon-toggle + .chat-voice-input-mode:
 * 22px tall, fully rounded, 27px cells, no dividers. Purely iconographic —
 * there are no "Listening"/"Speaking" labels in the product.
 */
.omnibar-voice {
	flex: 0 0 auto;
	display: flex;
	align-items: center;
	box-sizing: border-box;
	height: 22px;
	border-radius: var(--vscode-cornerRadius-circle, 999px);
	border: 1px solid var(--vscode-input-border, var(--vscode-editorWidget-border, rgba(127,127,127,.35)));
	overflow: hidden;
}
.omnibar-voice-cell {
	display: flex; align-items: center; justify-content: center;
	width: 27px; height: 100%;
	color: var(--vscode-icon-foreground);
	transition: color .2s ease;
}
.omnibar-voice-cell .codicon { font-size: var(--vscode-codiconFontSize-compact, 12px); }
.omnibar-voice-cell.dictation.active { color: var(--vscode-foreground); }
/* Voice cell tints by who is talking. */
.omnibar-voice-cell.voice.listening { color: var(--voice-color-listening); }
.omnibar-voice-cell.voice.speaking { color: var(--voice-color-speaking); }

/* Waveform: 5 bars, 1px wide, 2px gap, 12px box — a centre-peak silhouette. */
.omnibar-bars { display: inline-flex; align-items: center; gap: 2px; height: 12px; }
.omnibar-bar {
	width: 1px; border-radius: 1px; background: currentColor;
	transform-origin: center center;
	transition: height .22s cubic-bezier(.2,.9,.2,1);
}
.omnibar-bar:nth-child(1) { height: 3px; }
.omnibar-bar:nth-child(2) { height: 6px; }
.omnibar-bar:nth-child(3) { height: 9px; }
.omnibar-bar:nth-child(4) { height: 6px; }
.omnibar-bar:nth-child(5) { height: 3px; }

/* Connected but idle: a calm undulating wave, 2.6s, phase-offset per bar. */
.omnibar-voice-cell.voice.idle .omnibar-bar { animation: omnibar-wave 2.6s ease-in-out infinite; }
.omnibar-voice-cell.voice.idle .omnibar-bar:nth-child(1) { animation-delay: 0s; }
.omnibar-voice-cell.voice.idle .omnibar-bar:nth-child(2) { animation-delay: -.34s; }
.omnibar-voice-cell.voice.idle .omnibar-bar:nth-child(3) { animation-delay: -.68s; }
.omnibar-voice-cell.voice.idle .omnibar-bar:nth-child(4) { animation-delay: -1.02s; }
.omnibar-voice-cell.voice.idle .omnibar-bar:nth-child(5) { animation-delay: -1.36s; }
@keyframes omnibar-wave { 0%,100% { transform: scaleY(.72); } 50% { transform: scaleY(1.08); } }

/* Live: the equalizer, 0.85s, 2px..10px. This is the product's own fallback
	when no analyser is attached, which is exactly our situation here. */
.omnibar-voice-cell.voice.listening .omnibar-bar,
.omnibar-voice-cell.voice.speaking .omnibar-bar { animation: omnibar-eq .85s ease-in-out infinite; }
.omnibar-voice-cell.voice.listening .omnibar-bar:nth-child(1),
.omnibar-voice-cell.voice.speaking .omnibar-bar:nth-child(1) { animation-delay: 0s; }
.omnibar-voice-cell.voice.listening .omnibar-bar:nth-child(2),
.omnibar-voice-cell.voice.speaking .omnibar-bar:nth-child(2) { animation-delay: .12s; }
.omnibar-voice-cell.voice.listening .omnibar-bar:nth-child(3),
.omnibar-voice-cell.voice.speaking .omnibar-bar:nth-child(3) { animation-delay: .24s; }
.omnibar-voice-cell.voice.listening .omnibar-bar:nth-child(4),
.omnibar-voice-cell.voice.speaking .omnibar-bar:nth-child(4) { animation-delay: .36s; }
.omnibar-voice-cell.voice.listening .omnibar-bar:nth-child(5),
.omnibar-voice-cell.voice.speaking .omnibar-bar:nth-child(5) { animation-delay: .48s; }
@keyframes omnibar-eq { 0%,100% { height: 2px; } 50% { height: 10px; } }

/* Expanding half */
.omnibar-body { height: 0; overflow: hidden; transition: height 380ms cubic-bezier(.2,.8,.2,1); }
.omnibar-divider { height: 1px; margin: 0 1px; background: var(--vscode-foreground); opacity: .08; }
.omnibar-body-inner { padding: 6px 0 7px; }

.omnibar-group { padding: 5px 14px 3px; font-size: 10px; letter-spacing: .07em; text-transform: uppercase; opacity: .45; }
.omnibar-row {
	display: flex; align-items: center; gap: 9px;
	margin: 0 5px; padding: 5px 9px;
	border-radius: 6px; font-size: 12px; line-height: 18px;
	animation: omnibar-row-in 260ms cubic-bezier(.2,.8,.2,1) both;
}
@keyframes omnibar-row-in { from { opacity: 0; transform: translateY(-3px); } }
.omnibar-row[data-selected] { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
/* Fixed box centred on the row, so glyphs sit on the text's optical centre. */
.omnibar-row-glyph { flex: 0 0 auto; display: flex; align-items: center; justify-content: center; width: 16px; height: 18px; }
.omnibar-row-glyph .codicon { font-size: 14px; line-height: 1; }
.omnibar-row-label { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* Branch / diff line, as the sessions viewer renders it. */
.omnibar-row-detail { flex: 0 0 auto; display: flex; align-items: center; gap: 4px; font-size: 11px; opacity: .55; font-variant-numeric: tabular-nums; }
.omnibar-row-detail .codicon { font-size: 11px; }
.omnibar-added { color: var(--vscode-chat-linesAddedForeground, #57b674); }
.omnibar-removed { color: var(--vscode-chat-linesRemovedForeground, #e05252); }

/* Session viewport — a scrolling window into the conversation. */
.omnibar-viewport { margin: 2px 5px 4px; }
.omnibar-viewport-head { display: flex; align-items: center; gap: 8px; padding: 4px 9px 8px; font-size: 12px; }
.omnibar-viewport-name { font-weight: 600; }
.omnibar-viewport-detail { display: flex; align-items: center; gap: 4px; opacity: .5; font-size: 11px; }
.omnibar-viewport-detail .codicon { font-size: 11px; }
.omnibar-scroll {
	height: 116px; overflow: hidden; padding: 0 9px;
	/* Fades at both edges so it reads as a window onto something longer. */
	-webkit-mask-image: linear-gradient(to bottom, transparent, #000 14px, #000 calc(100% - 20px), transparent);
	mask-image: linear-gradient(to bottom, transparent, #000 14px, #000 calc(100% - 20px), transparent);
}
.omnibar-scroll-inner { display: flex; flex-direction: column; }

/* A request is a right-aligned bubble; a response is plain left-aligned text. */
.omnibar-request {
	align-self: flex-end;
	max-width: 90%;
	margin: 0 0 6px auto;
	padding: 5px 10px;
	border-radius: var(--vscode-cornerRadius-xLarge, 14px);
	background: var(--vscode-chat-requestBubbleBackground, color-mix(in srgb, var(--vscode-foreground) 8%, transparent));
	font-size: 12px;
	line-height: 17px;
}
.omnibar-response { margin-bottom: 8px; font-size: 12px; line-height: 17px; opacity: .9; }

/* Tool rows: .progress-container — icon + description text, not monospace. */
.omnibar-progress { display: flex; align-items: center; gap: 4px; margin-bottom: 8px; font-size: 12px; color: var(--vscode-descriptionForeground); }
.omnibar-progress .codicon { font-size: var(--vscode-codiconFontSize-compact, 12px); flex: 0 0 auto; }
.omnibar-progress-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/*
 * Confirmation widget — .chat-confirmation-widget2: bordered card, title row
 * with a rule under it, body on the request background, then the buttons.
 */
.omnibar-confirm {
	margin: 2px 9px 4px;
	border: 1px solid var(--vscode-chat-requestBorder, rgba(127,127,127,.3));
	border-radius: var(--vscode-cornerRadius-medium, 6px);
	overflow: hidden;
}
.omnibar-confirm-title {
	display: flex; align-items: center; gap: 6px;
	padding: 4px 8px;
	border-bottom: 1px solid var(--vscode-chat-requestBorder, rgba(127,127,127,.3));
	font-size: 12px; font-weight: 600;
}
.omnibar-confirm-title .codicon { font-size: 12px; }
.omnibar-confirm-body {
	padding: 6px 9px;
	background: var(--vscode-chat-requestBackground, color-mix(in srgb, var(--vscode-foreground) 4%, transparent));
	border-bottom: 1px solid var(--vscode-chat-requestBorder, rgba(127,127,127,.3));
}
/* The command sits in a code block, as the terminal confirmation renders it. */
.omnibar-code {
	font-family: var(--vscode-editor-font-family);
	font-size: 11px;
	color: var(--vscode-textPreformat-foreground, var(--vscode-foreground));
}
.omnibar-confirm-buttons { display: flex; gap: 4px; padding: 4px 8px; }
.omnibar-btn {
	padding: 2px 11px;
	border-radius: var(--vscode-cornerRadius-small, 4px);
	font-size: 11px;
	background: var(--vscode-button-background);
	color: var(--vscode-button-foreground);
}
.omnibar-btn[data-secondary] {
	background: var(--vscode-button-secondaryBackground, rgba(127,127,127,.2));
	color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
}

/* Scenario chrome ---------------------------------------------------------- */

/* Candidate rows while routing: a confidence bar reads at a glance. */
.omnibar-score { flex: 0 0 auto; display: flex; align-items: center; gap: 6px; font-size: 11px; opacity: .6; font-variant-numeric: tabular-nums; }
.omnibar-score-track { width: 42px; height: 3px; border-radius: 999px; background: color-mix(in srgb, var(--vscode-foreground) 14%, transparent); overflow: hidden; }
.omnibar-score-fill { height: 100%; border-radius: 999px; background: var(--voice-color-listening); }
.omnibar-row[data-dim] { opacity: .45; }

/* Fan-out: one instruction, several sessions, each with its own progress. */
.omnibar-fan-head { display: flex; align-items: center; gap: 7px; padding: 2px 14px 6px; font-size: 11px; opacity: .55; }
.omnibar-fan-head .codicon { font-size: 11px; }
.omnibar-bar-track { flex: 0 0 auto; width: 54px; height: 3px; border-radius: 999px; background: color-mix(in srgb, var(--vscode-foreground) 14%, transparent); overflow: hidden; }
.omnibar-bar-fill { height: 100%; border-radius: 999px; }

/* Queue: how many are waiting, and which one you are on. */
.omnibar-queue-head { display: flex; align-items: center; gap: 7px; padding: 2px 14px 7px; font-size: 11px; }
.omnibar-queue-count { opacity: .55; }
.omnibar-queue-dots { display: flex; gap: 4px; margin-left: auto; }
.omnibar-queue-dots i { width: 5px; height: 5px; border-radius: 50%; background: currentColor; opacity: .2; }
.omnibar-queue-dots i[data-on] { opacity: .75; }
.omnibar-queue-dots i[data-done] { opacity: .4; }

/* Progress through the script */
.omnibar-timeline { display: flex; gap: 3px; width: 100%; }
.omnibar-tick { flex: 1; height: 2px; border-radius: 999px; background: currentColor; opacity: .1; transition: opacity 260ms ease; }
.omnibar-tick[data-on] { opacity: .4; }
`;


// ============================================================================
// Pieces
// ============================================================================

function icon(themeIcon: ThemeIcon, color?: string): HTMLElement {
	const el = renderIcon(themeIcon);
	if (color) {
		el.style.color = color;
	}
	return el;
}

/**
 * The animated status glyph the sessions list uses for a live session: a pixel
 * spinner, `grid` while working and `ring` while blocked. Static codicons are
 * only for settled states.
 */
function liveStatus(store: DisposableStore, variant: 'grid' | 'ring', color: string): HTMLElement {
	const spinner = store.add(createPixelSpinner(undefined, { variant }));
	spinner.element.style.color = color;
	return spinner.element;
}

function row(glyph: HTMLElement, label: string, detail?: HTMLElement, selected?: boolean): HTMLElement {
	const el = $('.omnibar-row');
	if (selected) {
		el.setAttribute('data-selected', '');
	}
	const holder = $('span.omnibar-row-glyph');
	holder.appendChild(glyph);
	const labelEl = $('span.omnibar-row-label');
	labelEl.textContent = label;
	el.append(holder, labelEl);
	if (detail) {
		el.appendChild(detail);
	}
	return el;
}

/** Branch + diff counts, as the sessions viewer's details row shows them. */
function sessionDetail(branch: string, added?: number, removed?: number): HTMLElement {
	const el = $('.omnibar-row-detail');
	el.appendChild(renderIcon(Codicon.gitBranch));
	const name = $('span');
	name.textContent = branch;
	el.appendChild(name);
	if (added !== undefined && removed !== undefined) {
		const plus = $('span.omnibar-added');
		plus.textContent = `+${added}`;
		const minus = $('span.omnibar-removed');
		minus.textContent = `-${removed}`;
		el.append(plus, minus);
	}
	return el;
}

function group(label: string): HTMLElement {
	const el = $('.omnibar-group');
	el.textContent = label;
	return el;
}

function stagger(root: HTMLElement): HTMLElement {
	root.querySelectorAll<HTMLElement>('.omnibar-row').forEach((el, i) => {
		el.style.animationDelay = `${50 + i * 32}ms`;
	});
	return root;
}

/** A tool row: icon + past-tense description at body-s, muted. */
function toolRow(themeIcon: ThemeIcon, text: string): HTMLElement {
	const el = $('.omnibar-progress');
	el.appendChild(renderIcon(themeIcon));
	const t = $('span.omnibar-progress-text');
	t.textContent = text;
	el.appendChild(t);
	return el;
}

function request(text: string): HTMLElement {
	const el = $('.omnibar-request');
	el.textContent = text;
	return el;
}

function response(text: string): HTMLElement {
	const el = $('.omnibar-response');
	el.textContent = text;
	return el;
}

/** The conversation the viewport scrolls through. */
function buildTranscript(): HTMLElement[] {
	return [
		request('make the hero bigger'),
		toolRow(Codicon.check, 'Read Hero.tsx'),
		toolRow(Codicon.check, 'Edited Hero.tsx'),
		response('Updated the hero to 72px and tightened the subhead.'),
		request('now match it on the pricing page'),
		toolRow(Codicon.check, 'Read pricing.tsx'),
		response('Scanning the pricing route for the same heading scale\u2026'),
	];
}


/** A confidence read-out for a routing candidate. */
function score(pct: number): HTMLElement {
	const el = $('.omnibar-score');
	const track = $('.omnibar-score-track');
	const fill = $('.omnibar-score-fill');
	fill.style.width = `${pct}%`;
	track.appendChild(fill);
	const label = $('span');
	label.textContent = `${pct}%`;
	el.append(track, label);
	return el;
}

/** A per-session progress bar for the fan-out scenario. */
function progressBar(pct: number, color: string): HTMLElement {
	const el = $('.omnibar-bar-track');
	const fill = $('.omnibar-bar-fill');
	fill.style.width = `${Math.round(pct * 100)}%`;
	fill.style.background = color;
	el.appendChild(fill);
	return el;
}

/**
 * Scenario 1 — routing. "the website I've been working on" is ambiguous, so the
 * bar ranks the open sessions and shows its working, rather than guessing
 * silently. Mid-beat it is still scanning; by the end it has settled on one.
 */
function buildRouting(settled: boolean | undefined, store: DisposableStore): HTMLElement {
	const inner = $('.omnibar-body-inner');
	inner.append(group(settled ? 'Sending to' : 'Matching sessions'));

	const candidates: readonly [string, string, number][] = [
		['portfolio-site', 'main', 87],
		['docs-site', 'main', 41],
		['api-gateway', 'fix/login', 12],
	];

	for (const [name, branch, pct] of candidates) {
		const isPick = name === 'portfolio-site';
		const el = row(
			isPick && settled
				? icon(Codicon.arrowRight, stateColor('listening'))
				: liveStatus(store, 'grid', stateColor('listening')),
			name,
			settled ? sessionDetail(branch) : score(pct),
			settled && isPick,
		);
		// Once it has settled, the also-rans recede rather than disappearing —
		// you can still see what it chose between.
		if (settled && !isPick) {
			el.setAttribute('data-dim', '');
		}
		inner.appendChild(el);
	}
	return stagger(inner);
}

/**
 * Scenario 2 — fan-out. One instruction to several sessions at once, each
 * running independently, so the bar becomes a small dashboard.
 */
function buildFanout(store: DisposableStore, updaters: BeatUpdater[]): HTMLElement {
	const inner = $('.omnibar-body-inner');

	const head = $('.omnibar-fan-head');
	head.appendChild(renderIcon(Codicon.arrowRight));
	const headText = $('span');
	headText.textContent = 'Sent to 3 sessions · “bump the copyright year”';
	head.appendChild(headText);
	inner.appendChild(head);

	// Staggered so they finish at different times, the way real work does.
	const lanes: readonly [string, string, number][] = [
		['portfolio-site', 'main', 1.35],
		['docs-site', 'main', 1.0],
		['api-gateway', 'fix/login', 0.72],
	];

	for (const [name, , rate] of lanes) {
		const detail = $('.omnibar-row-detail');
		const track = progressBar(0, stateColor('listening'));
		const fill = track.firstElementChild as HTMLElement;
		const pctLabel = $('span');
		detail.append(track, pctLabel);

		// The spinner is created once and left alone; only the bar and the label
		// change per frame, so its animation is never restarted.
		const spinner = liveStatus(store, 'grid', stateColor('listening'));
		const glyphHolder = $('span');
		glyphHolder.style.cssText = 'display:flex;align-items:center;justify-content:center;';
		glyphHolder.appendChild(spinner);
		const check = icon(Codicon.passFilled, stateColor('done'));
		check.style.display = 'none';
		glyphHolder.appendChild(check);

		inner.appendChild(row(glyphHolder, name, detail));

		updaters.push(p => {
			const pct = Math.min(1, p * rate);
			const complete = pct >= 1;
			fill.style.width = `${Math.round(pct * 100)}%`;
			fill.style.background = stateColor(complete ? 'done' : 'listening');
			pctLabel.textContent = complete ? 'Done' : `${Math.round(pct * 100)}%`;
			spinner.style.display = complete ? 'none' : '';
			check.style.display = complete ? '' : 'none';
		});
	}
	return stagger(inner);
}

/**
 * Scenario 3 — the blocked queue. Several sessions want a decision; the bar
 * walks you through them one at a time so you never hunt for what is stuck.
 */
function buildQueue(index: number, store: DisposableStore): HTMLElement {
	const inner = $('.omnibar-body-inner');

	const pending: readonly [string, string, string, ThemeIcon][] = [
		['api-gateway', 'Run command', 'rm -rf build/', Codicon.terminal],
		['docs-site', 'Edit file', 'docs/CHANGELOG.md', Codicon.edit],
	];
	const [name, title, detail, glyph] = pending[Math.min(index, pending.length - 1)];

	const head = $('.omnibar-queue-head');
	head.style.color = stateColor('needsInput');
	head.appendChild(liveStatus(store, 'ring', stateColor('needsInput')));
	const count = $('span.omnibar-queue-count');
	count.textContent = `${index + 1} of ${pending.length} waiting on you`;
	const dots = $('.omnibar-queue-dots');
	for (let i = 0; i < pending.length; i++) {
		const dot = $('i');
		if (i < index) {
			dot.setAttribute('data-done', '');
		} else if (i === index) {
			dot.setAttribute('data-on', '');
		}
		dots.appendChild(dot);
	}
	head.append(count, dots);
	inner.append(head);

	const box = $('.omnibar-confirm');
	const titleEl = $('.omnibar-confirm-title');
	titleEl.append(renderIcon(glyph));
	const titleText = $('span');
	titleText.textContent = `${name} · ${title}`;
	titleEl.appendChild(titleText);
	const bodyEl = $('.omnibar-confirm-body');
	const code = $('.omnibar-code');
	code.textContent = detail;
	bodyEl.appendChild(code);
	const buttons = $('.omnibar-confirm-buttons');
	const allow = $('span.omnibar-btn');
	allow.textContent = 'Allow';
	const skip = $('span.omnibar-btn');
	skip.setAttribute('data-secondary', '');
	skip.textContent = 'Skip';
	buttons.append(allow, skip);
	box.append(titleEl, bodyEl, buttons);
	inner.appendChild(box);

	return inner;
}


// ============================================================================
// Body
// ============================================================================

/**
 * Bodies are built once per beat and then mutated in place. Rebuilding them
 * per frame would restart every pixel spinner, which never gets far enough to
 * leave its initial paused state.
 */
type BeatUpdater = (progress: number) => void;

function buildBody(body: Body, store: DisposableStore, updaters: BeatUpdater[]): HTMLElement | undefined {
	if (body.kind === 'none') {
		return undefined;
	}

	const inner = $('.omnibar-body-inner');

	if (body.kind === 'commandCenter') {
		inner.append(
			group('Recently used'),
			row(icon(Codicon.history), 'Change the theme to Red Velvet'),
			row(icon(Codicon.history), 'Run the build task'),
			group('Agent sessions'),
			row(liveStatus(store, 'grid', stateColor('listening')), 'portfolio-site', sessionDetail('main', 42, 12)),
			row(liveStatus(store, 'ring', stateColor('needsInput')), 'api-gateway', sessionDetail('fix/login', 8, 3)),
		);
		return stagger(inner);
	}

	if (body.kind === 'sessions') {
		inner.append(
			group('Agent sessions'),
			row(liveStatus(store, 'grid', stateColor('listening')), 'portfolio-site', sessionDetail('main', 42, 12)),
			row(liveStatus(store, 'ring', stateColor('needsInput')), 'api-gateway', sessionDetail('fix/login', 8, 3)),
			row(icon(Codicon.passFilled, stateColor('done')), 'docs-site', sessionDetail('main', 5, 0)),
		);
		return stagger(inner);
	}

	if (body.kind === 'routing') {
		return buildRouting(body.settled, store);
	}

	if (body.kind === 'fanout') {
		return buildFanout(store, updaters);
	}

	if (body.kind === 'queue') {
		return buildQueue(body.index, store);
	}

	if (body.kind === 'resolved') {
		inner.append(group('Run'), row(icon(Codicon.gear), body.label, undefined, true));
		return stagger(inner);
	}

	// A viewport onto a running session.
	const viewport = $('.omnibar-viewport');
	const head = $('.omnibar-viewport-head');
	const name = $('span.omnibar-viewport-name');
	name.textContent = body.confirm ? 'api-gateway' : 'portfolio-site';
	head.append(
		liveStatus(store, body.confirm ? 'ring' : 'grid', stateColor(body.confirm ? 'needsInput' : 'listening')),
		name,
		sessionDetail(body.confirm ? 'fix/login' : 'main', body.confirm ? 8 : 42, body.confirm ? 3 : 12),
	);

	const scroll = $('.omnibar-scroll');
	const scrollInner = $('.omnibar-scroll-inner');
	scrollInner.append(...buildTranscript());
	scroll.appendChild(scrollInner);
	// Drift upward across the beat, easing out so it settles rather than stopping.
	updaters.push(p => {
		const eased = 1 - Math.pow(1 - p, 2);
		scrollInner.style.transform = `translateY(${(-eased * 66).toFixed(1)}px)`;
	});

	viewport.append(head, scroll);
	inner.appendChild(viewport);

	if (body.confirm) {
		const box = $('.omnibar-confirm');
		const title = $('.omnibar-confirm-title');
		title.append(renderIcon(Codicon.terminal));
		const titleText = $('span');
		titleText.textContent = 'Run command';
		title.appendChild(titleText);
		const bodyEl = $('.omnibar-confirm-body');
		const code = $('.omnibar-code');
		code.textContent = 'rm -rf build/';
		bodyEl.appendChild(code);
		const buttons = $('.omnibar-confirm-buttons');
		const allow = $('span.omnibar-btn');
		allow.textContent = 'Allow';
		const skip = $('span.omnibar-btn');
		skip.setAttribute('data-secondary', '');
		skip.textContent = 'Skip';
		buttons.append(allow, skip);
		box.append(title, bodyEl, buttons);
		inner.appendChild(box);
	}

	return inner;
}


// ============================================================================
// Demo
// ============================================================================

function renderDemo(ctx: ComponentFixtureContext): void {
	const { container, disposableStore, isInteractive } = ctx;
	container.style.cssText = [
		'padding:26px 24px', 'box-sizing:border-box', 'width:640px', 'min-height:580px',
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

	const windowEl = $('.omnibar-window');
	const titlebar = $('.omnibar-titlebar');
	const traffic = $('.omnibar-traffic');
	traffic.append($('i'), $('i'), $('i'));
	const dock = $('.omnibar-dock');
	const trailingSpacer = $('div');
	trailingSpacer.style.cssText = 'flex:0 0 46px;';
	titlebar.append(traffic, dock, trailingSpacer);
	const canvas = $('.omnibar-canvas');
	canvas.append($('.omnibar-canvas-line'), $('.omnibar-canvas-line'), $('.omnibar-canvas-line'));
	windowEl.append(titlebar, canvas);

	const surface = $('.omnibar-surface');
	// The voice cell reads these, as `_updateVoiceStateColors` sets them.
	surface.style.setProperty('--voice-color-listening', stateColor('listening'));
	surface.style.setProperty('--voice-color-speaking', stateColor('speaking'));
	const inputRow = $('.omnibar-input');
	const bodyWrap = $('.omnibar-body');
	surface.append(inputRow, bodyWrap);

	// Floating lives outside the window so it can sit over it, the way an
	// always-on-top window does.
	const floatLayer = $('div');
	floatLayer.style.cssText = 'display:flex;justify-content:center;width:100%;';

	const timeline = $('.omnibar-timeline');
	const ticks = SCRIPT.map(() => {
		const tick = $('.omnibar-tick');
		timeline.appendChild(tick);
		return tick;
	});

	stage.append(note, windowEl, floatLayer, timeline);
	container.appendChild(stage);

	const beam = disposableStore.add(new MutableDisposable<IDisposable>());
	// Spinners are created per body render, so they need disposing on each swap.
	const bodyStore = disposableStore.add(new MutableDisposable<DisposableStore>());

	/** The segmented voice/dictation pill. */
	const buildVoicePill = (state: VoiceState): HTMLElement => {
		const pill = $('.omnibar-voice');

		const dictation = $('.omnibar-voice-cell.dictation');
		if (state === 'dictating') {
			dictation.classList.add('active');
		}
		dictation.appendChild(renderIcon(state === 'dictating' ? Codicon.micFilled : Codicon.mic));

		const voice = $('.omnibar-voice-cell.voice');
		if (state === 'listening' || state === 'speaking') {
			voice.classList.add(state);
		} else if (state === 'idle') {
			voice.classList.add('idle');
		}
		const bars = $('span.omnibar-bars');
		for (let i = 0; i < 5; i++) {
			bars.appendChild($('span.omnibar-bar'));
		}
		voice.appendChild(bars);

		pill.append(dictation, voice);
		return pill;
	};

	const paintInput = (beat: Beat, progress: number) => {
		inputRow.textContent = '';

		const grip = $('span.omnibar-grip');
		grip.appendChild(renderIcon(Codicon.gripper));
		inputRow.appendChild(grip);

		if (beat.icon) {
			const glyph = $('span.omnibar-glyph');
			glyph.appendChild(icon(beat.icon, beat.iconColor ? stateColor(beat.iconColor) : undefined));
			inputRow.appendChild(glyph);
		}

		const text = $('span.omnibar-text');
		if (beat.text) {
			// Typed beats reveal over the first ~70% of the beat, so the finished
			// phrase is readable before it moves on.
			const shown = beat.type
				? beat.text.slice(0, Math.ceil(Math.min(1, progress / 0.7) * beat.text.length))
				: beat.text;
			const typed = $('span.omnibar-typed');
			typed.textContent = shown;
			text.appendChild(typed);
			if (beat.caret) {
				text.appendChild($('span.omnibar-caret'));
			}
		} else {
			const scope = $('span.omnibar-scope');
			scope.textContent = WORKSPACE_NAME;
			const prompt = $('span.omnibar-prompt');
			prompt.textContent = 'Ask anything\u2026';
			text.append(scope, $('span.omnibar-sep'), prompt);
		}
		inputRow.appendChild(text);

		if (beat.voice && beat.voice !== 'off') {
			inputRow.appendChild(buildVoicePill(beat.voice));
		}

		// Send only when there is something to submit.
		if (beat.text && beat.type) {
			const send = $('span.omnibar-send');
			send.appendChild(renderIcon(Codicon.arrowUpCompact));
			inputRow.appendChild(send);
		}
	};

	let updaters: BeatUpdater[] = [];

	const paintBody = (beat: Beat) => {
		const store = new DisposableStore();
		updaters = [];
		const content = buildBody(beat.body ?? { kind: 'none' }, store, updaters);
		bodyWrap.textContent = '';
		bodyStore.value = store;

		if (!content) {
			bodyWrap.style.height = '0px';
			return;
		}

		const divider = $('.omnibar-divider');
		bodyWrap.append(divider, content);
		// The children lay out at their natural height even though the wrapper is
		// clipped to zero, so they can be measured directly. Round-tripping the
		// wrapper through `height: auto` would collapse into one style recalc and
		// the transition would never leave its start value.
		bodyWrap.style.height = `${divider.offsetHeight + content.offsetHeight}px`;
	};

	// Elapsed comes from the wall clock rather than accumulating ticks, so the
	// script keeps its timing even when the browser throttles or drops timers.
	const started = Date.now();
	let currentIndex = -1;
	let currentHome: Home | undefined;

	const frame = () => {
		const elapsed = (Date.now() - started) % TOTAL_MS;

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

		if (beat.home !== currentHome) {
			currentHome = beat.home;
			surface.setAttribute('data-home', beat.home);
			// Reparent between the title bar and the floating layer. The element is
			// never recreated, so the glow and state survive the move.
			(beat.home === 'docked' ? dock : floatLayer).appendChild(surface);
			windowEl.style.opacity = beat.home === 'docked' ? '1' : '.5';
		}

		if (index !== currentIndex) {
			currentIndex = index;
			note.textContent = beat.note;
			replaceBeam(beam, surface, beamFor(beat.glow, ctx, isInteractive));
			ticks.forEach((tick, i) => tick.toggleAttribute('data-on', i <= index));
			paintBody(beat);
		}

		// Bodies animate by mutation, so spinners keep running across the beat.
		for (const update of updaters) {
			update(progress);
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

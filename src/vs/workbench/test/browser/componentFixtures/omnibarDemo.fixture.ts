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
import { ComponentFixtureContext, darkTheme, defineComponentFixture, defineThemedFixtureGroup, lightTheme, setupTheme } from './fixtureUtils.js';

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
const DOCKED_WIDTH = 430;
const FLOATING_WIDTH = 580;
const FLOATING_IDLE_WIDTH = 400;
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
	/** You — listening to you, your dictation, your typing. */
	listening: { rgb: '88,166,255', hue: 212 },
	/** The agent — speaking, working, acting on your behalf. */
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

const WORKSPACE_NAME = 'vscode-website';

/** What the bar decided a piece of text means. */
type IntentKind = 'file' | 'command' | 'agent';

/**
 * The sessions in play. Task-named rather than repo-named: they are pieces of
 * work, and "vscode-website" is the workspace they all live in.
 */
const SESSIONS = {
	hero: { title: 'Bigger hero on the download page', branch: 'main', added: 42, removed: 12 },
	docs: { title: 'Fix docs search redirect', branch: 'fix/docs-search', added: 8, removed: 3 },
	gallery: { title: 'Update extension gallery cards', branch: 'feat/gallery', added: 5, removed: 0 },
} as const;

function isDark(ctx: ComponentFixtureContext): boolean {
	return ctx.theme.type === ColorScheme.DARK || ctx.theme.type === ColorScheme.HIGH_CONTRAST_DARK;
}

/**
 * Live theme switching.
 *
 * `setupTheme` ends with `container.classList.add(...theme.classNames)`, and the
 * installed stylesheets are scoped to those names — so once both themes are
 * installed, the live theme is simply *which class is on the container*.
 * Swapping it re-themes everything with no re-render.
 */
async function installBothThemes(container: HTMLElement): Promise<void> {
	// `setupTheme` also re-adds `disable-animations`, so callers re-assert
	// `enableAnimations` afterwards.
	await setupTheme(container, lightTheme);
	await setupTheme(container, darkTheme);
}

function applyTheme(container: HTMLElement, dark: boolean): void {
	const [on, off] = dark ? [darkTheme, lightTheme] : [lightTheme, darkTheme];
	container.classList.remove(...off.classNames);
	container.classList.add(...on.classNames);
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
	/** Nothing is happening. A long cycle so the bar breathes rather than nags. */
	rest: { size: 'pulse-inner', state: 'rest', strength: 0.75, brightness: 1.3, duration: 6.5 },
	/** Same white, a shorter cycle: the surface reads awake while you type. */
	typing: { size: 'pulse-inner', state: 'rest', strength: 0.85, brightness: 1.35, duration: 4.2 },
	listening: { size: 'pulse-inner', state: 'listening', strength: 0.95, brightness: 1.35 },
	speaking: { size: 'pulse-inner', state: 'speaking', strength: 0.95, brightness: 1.4 },
	needsInput: { size: 'pulse-inner', state: 'needsInput', strength: 0.9, brightness: 1.35 },
	done: { size: 'pulse-inner', state: 'done', strength: 0.85, brightness: 1.35 },
	/** The bar is thinking — neutral traveling beam. */
	processing: { size: 'md', state: 'processing', strength: 0.95, brightness: 1.5, duration: 2.2 },
	/** The agent is working — same hue as when it speaks, because it is the
	 *  agent acting either way. */
	working: { size: 'md', state: 'speaking', strength: 0.95, brightness: 1.5, duration: 2.0 },
} as const satisfies Record<string, GlowTone>;

type Glow = keyof typeof GLOWS;

/** A resting bar that is being typed into is awake, not idle. */
function beatGlow(beat: Beat): Glow {
	return beat.glow === 'rest' && beat.type ? 'typing' : beat.glow;
}

function beamFor(glow: Glow, dark: boolean, interactive: boolean): IBorderBeamOptions {
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
		theme: dark ? 'dark' : 'light',
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
	/** Intent resolution — what the bar decided this text means. */
	| { readonly kind: 'intent'; readonly picked: IntentKind }
	| { readonly kind: 'sessions' }
	| { readonly kind: 'session'; readonly confirm?: boolean }
	/** Ranked candidates with a countdown to the preselected one. */
	| { readonly kind: 'routing' }
	/** Confirmation after the countdown fired, still undoable. */
	| { readonly kind: 'sent' }
	/** One instruction fanned out across several sessions. */
	| { readonly kind: 'fanout' }
	/** The queue of sessions waiting on a decision. */
	| { readonly kind: 'queue'; readonly index: number }
	/** An answer about the bar itself — account, sessions, credits. */
	| { readonly kind: 'account' }
	/** Clarifying questions with selectable options. */
	| { readonly kind: 'questions'; readonly step: number; readonly answered?: boolean };

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
	/** A quiet count of what is waiting, shown when you did not act. */
	readonly badge?: string;
	readonly body?: Body;
	readonly caret?: boolean;
	/** Flips the whole surface to dark, as running the command would. */
	readonly dark?: boolean;
}

const THEME_CMD = 'change the theme to dark';
const FILE_QUERY = 'hero';
const AGENT_QUERY = 'make the hero headings bigger on the download page';
const DICTATED = 'add a changelog entry for the download page';
const AMBIGUOUS = 'make the headings bigger on the page I was working on';
const META_Q = 'how many credits do I have left this month?';
const PLAN_Q = 'add search to the docs';

/**
 * Everything happens in one workspace so the demo reads as one afternoon.
 * Timings are ~0.75x speed: there is a lot to take in, and the previous cut
 * moved faster than it could be read.
 */
const SCRIPT: readonly Beat[] = [
	// --- Act 1: docked in the title bar, in the light theme -------------------
	{
		note: 'It starts docked in the title bar \u2014 the command center, scoped to your workspace.',
		ms: 5000, home: 'docked', glow: 'rest', voice: 'off',
	},
	{
		note: 'Focus it and it grows in place: recents, and every session you have running.',
		ms: 6400, home: 'docked', glow: 'rest', voice: 'off', body: { kind: 'commandCenter' },
	},

	// --- Act 2: pull it out of the window -------------------------------------
	{
		note: 'Drag it out of the window\u2026',
		ms: 3400, home: 'dragging', glow: 'rest', voice: 'off',
	},
	{
		note: '\u2026and it becomes a floating omnibar that stays above everything.',
		ms: 4600, home: 'floating', glow: 'rest', voice: 'off',
	},
	{
		note: 'At rest it stays small \u2014 only as wide as it needs to be, with a way out.',
		ms: 4600, home: 'floating', glow: 'rest', voice: 'off',
	},

	// --- Act 3: a command that visibly does something --------------------------
	{
		note: 'Type in plain language instead of hunting through the palette.',
		ms: 5000, home: 'floating', glow: 'rest', voice: 'off',
		text: THEME_CMD, type: true, caret: true,
	},
	{
		note: 'It reads as a command, not a prompt \u2014 so it offers to run it.',
		ms: 5200, home: 'floating', glow: 'rest', voice: 'off', text: THEME_CMD,
		body: { kind: 'intent', picked: 'command' },
	},
	{
		note: 'And it actually runs. The theme changes underneath you.',
		ms: 5600, home: 'floating', glow: 'done', voice: 'off', dark: true,
		text: 'Theme changed to Dark Modern', icon: Codicon.check, iconColor: 'done',
	},

	// --- Act 4: intent ---------------------------------------------------------
	{
		note: 'One box, many intents. Type a word and it has to decide what you meant.',
		ms: 4400, home: 'floating', glow: 'rest', voice: 'off', dark: true,
		text: FILE_QUERY, type: true, caret: true,
	},
	{
		note: 'Short, and it matches a file \u2014 so opening it wins. The rest stay one key away.',
		ms: 6600, home: 'floating', glow: 'rest', voice: 'off', dark: true,
		text: FILE_QUERY, body: { kind: 'intent', picked: 'file' },
	},
	{
		note: 'Say more and the same box re-reads it as work for an agent.',
		ms: 6400, home: 'floating', glow: 'rest', voice: 'off', dark: true,
		text: AGENT_QUERY, type: true, caret: true,
		body: { kind: 'intent', picked: 'agent' },
	},

	// --- Act 5: dictation ------------------------------------------------------
	{
		note: 'The mic is dictation \u2014 speak, and it lands as text you can still edit.',
		ms: 6400, home: 'floating', glow: 'listening', voice: 'dictating', dark: true,
		text: DICTATED, type: true, caret: true,
	},
	{
		note: 'Sent.',
		ms: 3400, home: 'floating', glow: 'done', voice: 'idle', dark: true,
		text: 'Sent to Bigger hero on the download page', icon: Codicon.check, iconColor: 'done',
	},

	// --- Act 6: voice ----------------------------------------------------------
	{
		note: 'Voice mode is the other half of the pill \u2014 the waveform, not the mic.',
		ms: 4400, home: 'floating', glow: 'rest', voice: 'idle', dark: true,
	},
	{
		note: 'Blue is you. The bars ride your voice while it listens.',
		ms: 6400, home: 'floating', glow: 'listening', voice: 'listening', dark: true,
		text: META_Q, type: true,
	},
	{
		note: 'Pink is the agent. Some questions are just answered \u2014 no session, no routing.',
		ms: 7000, home: 'floating', glow: 'speaking', voice: 'speaking', dark: true,
		text: 'You have used 340 of 500 credits. They reset on the 1st.',
		body: { kind: 'account' },
	},

	// --- Act 7: routing --------------------------------------------------------
	{
		note: 'Ask for something ambiguous and it has to pick a session.',
		ms: 6000, home: 'floating', glow: 'listening', voice: 'listening', dark: true,
		text: AMBIGUOUS, type: true,
	},
	{
		note: 'It ranks them, preselects its best guess, and counts down.',
		ms: 7000, home: 'floating', glow: 'rest', voice: 'idle', dark: true,
		text: AMBIGUOUS, body: { kind: 'routing' },
	},
	{
		note: 'Sent \u2014 and still undoable, because it was a guess.',
		ms: 4600, home: 'floating', glow: 'done', voice: 'idle', dark: true,
		body: { kind: 'sent' },
	},
	{
		note: 'Follow it in place \u2014 a viewport into the conversation as it works.',
		ms: 7400, home: 'floating', glow: 'working', voice: 'idle', dark: true,
		body: { kind: 'session' },
	},

	// --- Act 8: planning -------------------------------------------------------
	{
		note: 'Ask for something under-specified\u2026',
		ms: 5000, home: 'floating', glow: 'listening', voice: 'listening', dark: true,
		text: PLAN_Q, type: true,
	},
	{
		note: '\u2026and it asks back. It speaks the question while showing the options.',
		ms: 7400, home: 'floating', glow: 'speaking', voice: 'speaking', dark: true,
		text: 'Which search would you like?', body: { kind: 'questions', step: 0 },
	},
	{
		note: 'Answer by clicking, or just say it out loud.',
		ms: 6600, home: 'floating', glow: 'rest', voice: 'idle', dark: true,
		body: { kind: 'questions', step: 1, answered: true },
	},

	// --- Act 9: fan-out --------------------------------------------------------
	{
		note: 'One instruction can go to every session at once.',
		ms: 4400, home: 'floating', glow: 'rest', voice: 'idle', dark: true,
		text: 'update the footer copyright to 2026', type: true, caret: true,
	},
	{
		note: 'Each runs on its own, and the bar becomes a small dashboard.',
		ms: 8400, home: 'floating', glow: 'working', voice: 'idle', dark: true,
		body: { kind: 'fanout' },
	},

	// --- Act 10: an interruption you choose not to take ------------------------
	{
		note: 'You are mid-thought when a session gets blocked.',
		ms: 4400, home: 'floating', glow: 'rest', voice: 'idle', dark: true,
		text: 'and tighten the nav spacing', type: true, caret: true,
	},
	{
		note: 'It surfaces once, in orange \u2014 but it does not take the surface from you.',
		ms: 5600, home: 'floating', glow: 'needsInput', voice: 'idle', dark: true,
		text: 'and tighten the nav spacing', caret: true, body: { kind: 'queue', index: 0 },
	},
	{
		note: 'You keep typing. It folds itself away rather than nagging.',
		ms: 5600, home: 'floating', glow: 'rest', voice: 'idle', dark: true,
		text: 'and tighten the nav spacing to 12px', type: true, caret: true, badge: '1',
	},
	{
		note: 'All that is left is a quiet count \u2014 there when you are ready.',
		ms: 5000, home: 'floating', glow: 'rest', voice: 'idle', dark: true, badge: '2',
	},

	// --- Act 11: triage --------------------------------------------------------
	{
		note: 'Open the count and it walks you through what is waiting.',
		ms: 7000, home: 'floating', glow: 'needsInput', voice: 'idle', dark: true,
		body: { kind: 'queue', index: 0 },
	},
	{
		note: 'Answer one and the next slides in \u2014 no hunting for what is stuck.',
		ms: 7000, home: 'floating', glow: 'needsInput', voice: 'idle', dark: true,
		body: { kind: 'queue', index: 1 },
	},
	{
		note: 'Queue clear \u2014 and it settles back to rest.',
		ms: 4600, home: 'floating', glow: 'done', voice: 'idle', dark: true,
		text: 'All caught up \u00B7 3 sessions running', icon: Codicon.check, iconColor: 'done',
	},
];

const TOTAL_MS = SCRIPT.reduce((sum, beat) => sum + beat.ms, 0);


// ============================================================================
// Styles
// ============================================================================

const CSS = `
.omnibar-demo {
	position: relative;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 14px;
	width: 100%;
	min-height: 500px;
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
/*
 * Docked, this is the command center as it actually ships: a slim 22px pill on
 * the commandCenter tokens, medium radius, search glyph then the workspace.
 * Pulling it out is what grows it into the omnibar.
 */
.omnibar-surface[data-home="docked"] {
	position: absolute; top: 11px; left: 50%; margin-left: -${DOCKED_WIDTH / 2}px; z-index: 5;
	background: var(--vscode-commandCenter-background, var(--vscode-input-background));
	border-color: var(--vscode-commandCenter-border, var(--vscode-input-border, transparent));
	/* commandCenter.background is white at 5% alpha - right for a pill sitting on
		the title bar, wrong the moment it becomes a dropdown over the editor. */
	border-radius: var(--vscode-cornerRadius-medium, 6px);
	color: var(--vscode-commandCenter-foreground, var(--vscode-foreground));
}
.omnibar-surface[data-home="docked"]:not([data-compact]) {
	background: var(--vscode-editorWidget-background, var(--vscode-input-background));
	border-color: var(--vscode-editorWidget-border, var(--vscode-input-border, transparent));
}
.omnibar-surface[data-home="docked"] .omnibar-input { min-height: 20px; padding: 0 6px; gap: 4px; }
.omnibar-surface[data-home="docked"] .omnibar-text { font-size: 12px; justify-content: center; }
.omnibar-surface[data-home="docked"] .omnibar-rest { flex: 0 1 auto; }
/* Centred label, the way the title bar renders it. */
.omnibar-surface[data-home="docked"] .omnibar-sep { display: none; }
.omnibar-surface[data-home="docked"] .omnibar-prompt { flex: 0 1 auto; }
.omnibar-surface[data-home="dragging"] {
	width: ${FLOATING_WIDTH}px;
	transform: translateY(24px) scale(1.02);
	box-shadow: 0 18px 40px -14px rgba(0,0,0,.6);
}
/* At rest the floating bar is only as wide as it needs to be; it widens when
	there is something to say. */
.omnibar-surface[data-home="floating"][data-compact] { width: ${FLOATING_IDLE_WIDTH}px; }
.omnibar-surface[data-home="floating"] {
	width: ${FLOATING_WIDTH}px;
	box-shadow: 0 2px 5px rgba(0,0,0,.22), 0 22px 52px -18px rgba(0,0,0,.66);
}

/* Input row */
.omnibar-input { display: flex; align-items: center; gap: 8px; min-height: 42px; padding: 8px 8px 8px 14px; }
.omnibar-grip { flex: 0 0 auto; display: none; align-items: center; color: var(--vscode-foreground); opacity: .26; }
.omnibar-surface[data-home="dragging"] .omnibar-grip,
.omnibar-surface[data-home="floating"] .omnibar-grip { display: flex; }
.omnibar-grip .codicon[class*='codicon-'] { font-size: 13px; }

.omnibar-glyph {
	flex: 0 0 auto; display: flex; align-items: center;
	width: 0; opacity: 0; overflow: hidden;
	transition: width 260ms cubic-bezier(.2,.8,.2,1), opacity 200ms ease, margin 260ms cubic-bezier(.2,.8,.2,1);
}
.omnibar-glyph.shown { width: 15px; opacity: 1; }
.omnibar-glyph .codicon { font-size: 14px; }

/* Everything that comes and goes shares one reveal, so the row settles as a
	single motion rather than several competing ones. */
.omnibar-rest, .omnibar-typed { opacity: 0; transition: opacity 200ms ease; }
.omnibar-rest.shown, .omnibar-typed.shown { opacity: 1; }
.omnibar-rest { display: none; align-items: center; min-width: 0; flex: 1; }
.omnibar-rest.shown { display: flex; }
.omnibar-typed { display: none; }
.omnibar-typed.shown { display: block; }

.omnibar-text { flex: 1; min-width: 0; display: flex; align-items: center; font-size: 13px; white-space: nowrap; overflow: hidden; }
.omnibar-typed { overflow: hidden; text-overflow: ellipsis; }
.omnibar-scope { flex: 0 0 auto; font-weight: 500; opacity: .9; }
.omnibar-sep { flex: 0 0 auto; width: 1px; height: 13px; margin: 0 9px; background: currentColor; opacity: .16; }
.omnibar-prompt { flex: 1; min-width: 0; color: var(--vscode-input-placeholderForeground); overflow: hidden; text-overflow: ellipsis; }
/* Hidden with visibility, not opacity: the paused blink keyframe still applies
	its computed opacity:1 and would win, leaving a stray bar on the idle row. */
.omnibar-caret {
	flex: 0 0 auto; width: 1px; height: 14px; margin-left: 1px;
	background: currentColor; visibility: hidden;
	animation: omnibar-blink 1.06s steps(1, end) infinite;
	animation-play-state: paused;
}
.omnibar-caret.shown { visibility: visible; animation-play-state: running; }
@keyframes omnibar-blink { 0%,55% { opacity: 1; } 56%,100% { opacity: 0; } }

/*
 * Send — 22x22 at the control tier, matching the chat input. The arrow is
 * always present so the way to submit never moves; only its emphasis changes.
 * No border or fill: a block next to the glow reads as two competing accents on
 * one surface, and the arrow alone is legible enough.
 */
.omnibar-send {
	flex: 0 0 auto; display: flex; align-items: center; justify-content: center;
	box-sizing: border-box;
	width: 22px; height: 22px;
	opacity: .35;
	transition: opacity 200ms ease, color 200ms ease;
	border-radius: var(--vscode-cornerRadius-circle, 999px);
	background: none; border: none;
	color: var(--vscode-icon-foreground);
}
/* Armed: something of yours is waiting to be sent. Full opacity plus a heavier
	glyph, so “you can press this now” reads without adding a second accent. */
.omnibar-send.armed { opacity: 1; color: var(--vscode-foreground); }
.omnibar-send.armed .codicon[class*='codicon-'] { font-weight: 700; transform: translateY(.5px) scale(1.08); }
/* Optical nudge, as chat.css does for this glyph. */
.omnibar-send .codicon[class*='codicon-'] { font-size: var(--vscode-codiconFontSize-compact, 12px); transform: translateY(.5px); }

/*
 * Segmented voice / dictation pill.
 * Reproduces .monaco-segmented-icon-toggle + .chat-voice-input-mode:
 * 22px tall, fully rounded, 27px cells, no dividers. Purely iconographic —
 * there are no "Listening"/"Speaking" labels in the product.
 */
/* Close — only once it has been pulled out of the window, since docked it is
	part of the title bar and there is nothing to dismiss. */
.omnibar-close {
	flex: 0 0 auto; display: flex; align-items: center; justify-content: center;
	box-sizing: border-box;
	width: 0; height: 22px; opacity: 0; overflow: hidden;
	border-radius: var(--vscode-cornerRadius-circle, 999px);
	color: var(--vscode-icon-foreground);
	transition: width 300ms cubic-bezier(.2,.8,.2,1), opacity 240ms ease, margin 300ms cubic-bezier(.2,.8,.2,1);
}
.omnibar-surface[data-home="dragging"] .omnibar-close,
.omnibar-surface[data-home="floating"] .omnibar-close { width: 22px; opacity: .75; margin-left: 2px; }
.omnibar-close .codicon[class*='codicon-'] { font-size: var(--vscode-codiconFontSize-compact, 12px); }

/* A quiet count of what is waiting, for when you did not act on it. */
.omnibar-badge {
	flex: 0 0 auto; display: flex; align-items: center; gap: 6px;
	box-sizing: border-box;
	height: 22px; padding: 0; max-width: 0;
	border-radius: var(--vscode-cornerRadius-circle, 999px);
	font-size: 11px; white-space: nowrap; opacity: 0; overflow: hidden;
	color: var(--voice-color-needsInput);
	background: color-mix(in srgb, var(--voice-color-needsInput) 18%, transparent);
	transition: max-width 340ms cubic-bezier(.2,.8,.2,1), opacity 260ms ease, padding 340ms cubic-bezier(.2,.8,.2,1), margin 340ms cubic-bezier(.2,.8,.2,1);
}
.omnibar-badge.shown { max-width: 160px; padding: 0 10px 0 8px; opacity: 1; margin-right: 2px; }
.omnibar-badge i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; animation: omnibar-breathe 1.9s ease-in-out infinite; }

.omnibar-voice {
	flex: 0 0 auto;
	display: flex;
	align-items: center;
	box-sizing: border-box;
	height: 22px;
	max-width: 0; opacity: 0; overflow: hidden;
	transition: max-width 320ms cubic-bezier(.2,.8,.2,1), opacity 240ms ease, margin 320ms cubic-bezier(.2,.8,.2,1);
	border-radius: var(--vscode-cornerRadius-circle, 999px);
	border: 1px solid transparent;
}
.omnibar-voice.shown {
	max-width: 60px; opacity: 1; margin-left: 2px;
	border-color: var(--vscode-input-border, var(--vscode-editorWidget-border, rgba(127,127,127,.35)));
}
/*
 * Cells collapse to zero and the survivor expands to fill the pill, as
 * .monaco-segmented-icon-toggle-cell.collapsed + .container.single do. You
 * cannot dictate and hold a voice conversation at once, so whichever mode is
 * active is the only thing left in the pill.
 */
.omnibar-voice-cell {
	display: flex; align-items: center; justify-content: center;
	width: 27px; height: 100%;
	color: var(--vscode-icon-foreground);
	overflow: hidden;
	transition: width .3s cubic-bezier(.2,.9,.2,1), opacity .22s ease, color .2s ease;
}
.omnibar-voice-cell.collapsed { width: 0; opacity: 0; }
.omnibar-voice.single .omnibar-voice-cell:not(.collapsed) { width: 54px; }
.omnibar-voice-cell .codicon[class*='codicon-'] { font-size: var(--vscode-codiconFontSize-compact, 12px); }
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
.omnibar-score-fill { height: 100%; border-radius: 999px; background: var(--voice-color-speaking); }
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

/* Group header can carry a trailing hint (the intent override key). */
.omnibar-group { display: flex; align-items: baseline; }
.omnibar-group-hint { margin-left: auto; text-transform: none; letter-spacing: 0; opacity: .8; }

/* Account read-out */
.omnibar-meter { display: flex; align-items: center; gap: 9px; margin: 2px 14px 6px; font-size: 11px; }
.omnibar-meter-track { flex: 0 0 96px; height: 3px; border-radius: 999px; background: color-mix(in srgb, var(--vscode-foreground) 14%, transparent); overflow: hidden; }
.omnibar-meter-fill { height: 100%; border-radius: 999px; background: var(--voice-color-speaking); }
.omnibar-meter-label { opacity: .65; font-variant-numeric: tabular-nums; }

/* Clarifying questions */
.omnibar-question-head { display: flex; align-items: baseline; gap: 9px; padding: 3px 14px 6px; }
.omnibar-question-title { flex: 1; min-width: 0; font-size: 12px; font-weight: 600; }
.omnibar-question-step { flex: 0 0 auto; font-size: 10px; letter-spacing: .06em; text-transform: uppercase; opacity: .45; }
.omnibar-question-foot { display: flex; align-items: center; padding: 6px 14px 2px; font-size: 11px; opacity: .5; }
.omnibar-question-hint { margin-left: auto; }

/* Progress through the script */
.omnibar-timeline { position: absolute; left: 0; right: 0; bottom: 0; display: flex; gap: 3px; }
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
function buildRouting(store: DisposableStore, updaters: BeatUpdater[]): HTMLElement {
	const inner = $('.omnibar-body-inner');

	const head = group('Send to');
	const countdown = $('span.omnibar-group-hint');
	head.appendChild(countdown);
	inner.appendChild(head);

	const candidates: readonly [{ title: string; branch: string }, number][] = [
		[SESSIONS.hero, 87],
		[SESSIONS.docs, 41],
		[SESSIONS.gallery, 12],
	];

	// The best match is preselected, so the default is one keypress away and the
	// alternatives stay visible rather than being decided for you silently.
	candidates.forEach(([session, pct], i) => {
		const picked = i === 0;
		const el = row(
			picked
				? icon(Codicon.pass, stateColor('done'))
				: liveStatus(store, 'grid', stateColor('speaking')),
			session.title,
			score(pct),
			picked,
		);
		if (!picked) {
			el.setAttribute('data-dim', '');
		}
		inner.appendChild(el);
	});

	const foot = $('.omnibar-question-foot');
	const change = $('span');
	change.textContent = '\u2325 to change';
	const confirm = $('span.omnibar-question-hint');
	confirm.textContent = 'Enter to send now';
	foot.append(change, confirm);
	inner.appendChild(foot);

	updaters.push(p => {
		countdown.textContent = `sending in ${Math.max(1, Math.ceil((1 - p) * 5))}s`;
	});

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
	// Staggered so they finish at different times, the way real work does, but
	// all three land inside the beat.
	const lanes: readonly [string, string, number][] = [
		[SESSIONS.hero.title, SESSIONS.hero.branch, 1.9],
		[SESSIONS.docs.title, SESSIONS.docs.branch, 1.5],
		[SESSIONS.gallery.title, SESSIONS.gallery.branch, 1.2],
	];

	for (const [name, , rate] of lanes) {
		const detail = $('.omnibar-row-detail');
		const track = progressBar(0, stateColor('speaking'));
		const fill = track.firstElementChild as HTMLElement;
		const pctLabel = $('span');
		detail.append(track, pctLabel);

		// The spinner is created once and left alone; only the bar and the label
		// change per frame, so its animation is never restarted.
		const spinner = liveStatus(store, 'grid', stateColor('speaking'));
		const glyphHolder = $('span');
		glyphHolder.style.cssText = 'display:flex;align-items:center;justify-content:center;';
		glyphHolder.appendChild(spinner);
		const check = icon(Codicon.passFilled, 'var(--vscode-foreground)');
		check.style.display = 'none';
		glyphHolder.appendChild(check);

		inner.appendChild(row(glyphHolder, name, detail));

		updaters.push(p => {
			const pct = Math.min(1, p * rate);
			const complete = pct >= 1;
			fill.style.width = `${Math.round(pct * 100)}%`;
			// Completion is white: green would read as a status colour competing
			// with the agent/you split, when it only means "finished".
			fill.style.background = complete ? 'var(--vscode-foreground)' : stateColor('speaking');
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
		[SESSIONS.docs.title, 'Run command', 'rm -rf .docs-cache/', Codicon.terminal],
		[SESSIONS.gallery.title, 'Edit file', 'netlify.toml', Codicon.edit],
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


/**
 * Intent resolution.
 *
 * One box has to decide whether text is a file, a command, or work for an
 * agent. The bar guesses — but it names the guess and keeps the alternatives
 * one key away, so it is correctable rather than mysterious. That is the same
 * contract as the routing countdown.
 */
function buildIntent(picked: IntentKind): HTMLElement {
	const inner = $('.omnibar-body-inner');

	const head = $('.omnibar-group');
	head.textContent = picked === 'file' ? 'Open file' : picked === 'command' ? 'Run' : 'Ask an agent';
	const hint = $('span.omnibar-group-hint');
	hint.textContent = '\u2325 to change';
	head.appendChild(hint);
	inner.appendChild(head);

	const options: readonly [IntentKind, ThemeIcon, string, string][] = [
		['file', Codicon.file, 'Hero.tsx', 'src/components/'],
		['command', Codicon.gear, 'Preferences: Color Theme \u2192 Dark Modern', 'Enter'],
		['agent', Codicon.sparkle, SESSIONS.hero.title, 'New session'],
	];

	// The chosen intent leads and is selected; the others stay visible beneath so
	// you can see what it decided between.
	for (const [kind, glyph, label, detail] of [...options].sort(a => a[0] === picked ? -1 : 1)) {
		const hintEl = $('span.omnibar-row-hint');
		hintEl.textContent = detail;
		const el = row(icon(glyph), label, hintEl, kind === picked);
		if (kind !== picked) {
			el.setAttribute('data-dim', '');
		}
		inner.appendChild(el);
	}
	return stagger(inner);
}

/**
 * An answer about the bar itself — no new session, no routing. Uses the
 * product's own quota vocabulary (`percentRemaining`, "credits reset on").
 */
function buildAccount(store: DisposableStore): HTMLElement {
	const inner = $('.omnibar-body-inner');
	inner.appendChild(group('This month'));

	const meter = $('.omnibar-meter');
	const track = $('.omnibar-meter-track');
	const fill = $('.omnibar-meter-fill');
	fill.style.width = '68%';
	track.appendChild(fill);
	const label = $('span.omnibar-meter-label');
	label.textContent = '340 of 500 credits \u00B7 resets on the 1st';
	meter.append(track, label);
	inner.appendChild(meter);

	inner.appendChild(group('Right now'));
	inner.append(
		row(liveStatus(store, 'grid', stateColor('speaking')), '2 sessions working'),
		row(icon(Codicon.circleFilled, stateColor('needsInput')), '1 needs your input'),
	);
	return stagger(inner);
}

/** Confirmation after the routing countdown fired — still reversible. */
function buildSent(): HTMLElement {
	const inner = $('.omnibar-body-inner');
	const hint = $('span.omnibar-row-hint');
	hint.textContent = 'Undo';
	inner.appendChild(row(icon(Codicon.check, stateColor('done')), `Sent to ${SESSIONS.hero.title}`, hint));
	return stagger(inner);
}

/**
 * Clarifying questions, reproducing `chatQuestionCarouselPart`: a title, a step
 * indicator, selectable options, and a way to skip. The agent speaks the
 * question while this is on screen, so you can answer by voice or by clicking.
 */
function buildQuestions(step: number, answered: boolean | undefined): HTMLElement {
	const inner = $('.omnibar-body-inner');

	const steps: readonly { readonly title: string; readonly options: readonly string[] }[] = [
		{ title: 'Which search would you like?', options: ['Algolia DocSearch', 'Local index', 'Pagefind'] },
		{ title: 'What should it cover?', options: ['Docs only', 'The whole site'] },
	];
	const current = steps[Math.min(step, steps.length - 1)];

	const head = $('.omnibar-question-head');
	const title = $('span.omnibar-question-title');
	title.textContent = current.title;
	const indicator = $('span.omnibar-question-step');
	indicator.textContent = `Question ${Math.min(step, steps.length - 1) + 1} of ${steps.length}`;
	head.append(title, indicator);
	inner.appendChild(head);

	current.options.forEach((label, i) => {
		// On the answered beat the first option reads as chosen, so the demo shows
		// the selection landing rather than only the ask.
		const chosen = answered && i === 0;
		const el = row(
			icon(chosen ? Codicon.pass : Codicon.circleOutline, chosen ? stateColor('done') : undefined),
			label,
			undefined,
			chosen,
		);
		inner.appendChild(el);
	});

	const foot = $('.omnibar-question-foot');
	const skip = $('span');
	skip.textContent = 'Skip all questions';
	const submit = $('span.omnibar-question-hint');
	submit.textContent = answered ? 'Next \u00B7 Enter' : 'Say it or click';
	foot.append(skip, submit);
	inner.appendChild(foot);

	return stagger(inner);
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
			row(icon(Codicon.history), 'Preferences: Color Theme'),
			row(icon(Codicon.history), 'Tasks: Run Build Task'),
			group('Agent sessions'),
			row(liveStatus(store, 'grid', stateColor('speaking')), SESSIONS.hero.title, sessionDetail(SESSIONS.hero.branch, SESSIONS.hero.added, SESSIONS.hero.removed)),
			row(liveStatus(store, 'ring', stateColor('needsInput')), SESSIONS.docs.title, sessionDetail(SESSIONS.docs.branch, SESSIONS.docs.added, SESSIONS.docs.removed)),
		);
		return stagger(inner);
	}

	if (body.kind === 'sessions') {
		inner.append(
			group('Agent sessions'),
			row(liveStatus(store, 'grid', stateColor('speaking')), SESSIONS.hero.title, sessionDetail(SESSIONS.hero.branch, SESSIONS.hero.added, SESSIONS.hero.removed)),
			row(liveStatus(store, 'ring', stateColor('needsInput')), SESSIONS.docs.title, sessionDetail(SESSIONS.docs.branch, SESSIONS.docs.added, SESSIONS.docs.removed)),
			row(icon(Codicon.passFilled, 'var(--vscode-foreground)'), SESSIONS.gallery.title, sessionDetail(SESSIONS.gallery.branch, SESSIONS.gallery.added, SESSIONS.gallery.removed)),
		);
		return stagger(inner);
	}

	if (body.kind === 'intent') {
		return buildIntent(body.picked);
	}

	if (body.kind === 'account') {
		return buildAccount(store);
	}

	if (body.kind === 'sent') {
		return buildSent();
	}

	if (body.kind === 'questions') {
		return buildQuestions(body.step, body.answered);
	}

	if (body.kind === 'routing') {
		return buildRouting(store, updaters);
	}

	if (body.kind === 'fanout') {
		return buildFanout(store, updaters);
	}

	if (body.kind === 'queue') {
		return buildQueue(body.index, store);
	}

	// A viewport onto a running session.
	const viewport = $('.omnibar-viewport');
	const head = $('.omnibar-viewport-head');
	const name = $('span.omnibar-viewport-name');
	const shown = body.confirm ? SESSIONS.docs : SESSIONS.hero;
	name.textContent = shown.title;
	head.append(
		liveStatus(store, body.confirm ? 'ring' : 'grid', stateColor(body.confirm ? 'needsInput' : 'speaking')),
		name,
		sessionDetail(shown.branch, shown.added, shown.removed),
	);

	const scroll = $('.omnibar-scroll');
	const scrollInner = $('.omnibar-scroll-inner');
	scrollInner.append(...buildTranscript());
	scroll.appendChild(scrollInner);
	// A transcript follows its newest message, so scroll to the bottom and stop
	// there rather than drifting past it. The distance is measured from the
	// content, so it lands exactly on the last turn whatever the beat contains.
	updaters.push(p => {
		const distance = Math.max(0, scrollInner.scrollHeight - scroll.clientHeight);
		const eased = 1 - Math.pow(1 - p, 3);
		scrollInner.style.transform = `translateY(${(-eased * distance).toFixed(1)}px)`;
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
		'padding:26px 24px', 'box-sizing:border-box', 'width:640px', 'min-height:600px',
		'background:var(--vscode-editor-background)',
	].join(';');
	if (isInteractive) {
		enableAnimations(container);
	}

	// The demo opens in the opposite theme and switches to its own when the
	// first command runs, so the command visibly does something. Both themes are
	// installed up front; from then on the live theme is just a class swap.
	const endDark = isDark(ctx);
	let liveDark = !endDark;
	void installBothThemes(container).then(() => {
		applyTheme(container, liveDark);
		if (isInteractive) {
			// `setupTheme` re-adds `disable-animations`.
			enableAnimations(container);
		}
	});

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
	surface.style.setProperty('--voice-color-needsInput', stateColor('needsInput'));
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

	/*
	 * The input row is built once and then mutated. Rebuilding it per frame
	 * would restart the waveform animation and make every CSS transition
	 * unreachable, so state changes would snap instead of easing.
	 */
	const grip = $('span.omnibar-grip');
	// Not `gripper`: that is 6 dots in a 2x3 grid in a 16px box, which is the
	// pixel spinner's exact geometry, so a static handle reads as a stopped
	// in-progress session. `grabber` is two short horizontal lines.
	grip.appendChild(renderIcon(Codicon.grabber));

	const glyph = $('span.omnibar-glyph');
	const textEl = $('span.omnibar-text');
	const typed = $('span.omnibar-typed');
	const caret = $('span.omnibar-caret');
	const scope = $('span.omnibar-scope');
	scope.textContent = WORKSPACE_NAME;
	const sep = $('span.omnibar-sep');
	const prompt = $('span.omnibar-prompt');
	prompt.textContent = 'Ask anything\u2026';
	const rest = $('span.omnibar-rest');
	rest.append(scope, sep, prompt);
	textEl.append(rest, typed, caret);

	/** A quiet count of what is waiting, for when you did not act on it. */
	const badge = $('span.omnibar-badge');
	const badgeCount = $('span');
	badge.append($('i'), badgeCount);

	// The segmented voice/dictation pill: dictation cell (mic) + voice cell
	// (waveform). Built once so the bars never restart mid-state.
	const voicePill = $('.omnibar-voice');
	const dictationCell = $('.omnibar-voice-cell.dictation');
	const dictationIcon = $('span');
	dictationCell.appendChild(dictationIcon);
	const voiceCell = $('.omnibar-voice-cell.voice');
	const bars = $('span.omnibar-bars');
	for (let i = 0; i < 5; i++) {
		bars.appendChild($('span.omnibar-bar'));
	}
	voiceCell.appendChild(bars);
	voicePill.append(dictationCell, voiceCell);

	const send = $('span.omnibar-send');
	// The chat input uses `arrowUpCompact`, but this checkout's codicon font
	// predates that glyph (@vscode/codicons 0.0.46-21 renders it blank), so fall
	// back to the plain arrow rather than shipping an empty circle.
	send.appendChild(renderIcon(Codicon.arrowUp));

	// Only present once it has been pulled out of the window.
	const close = $('span.omnibar-close');
	close.appendChild(renderIcon(Codicon.close));

	inputRow.append(grip, glyph, textEl, badge, voicePill, send, close);

	let currentGlyph: string | undefined;
	let currentDictation: string | undefined;

	const paintInput = (beat: Beat, progress: number) => {
		// Leading status icon — swapped only when the icon itself changes, so the
		// element (and any transition on it) survives.
		const glyphKey = beat.icon ? ThemeIcon.asClassName(beat.icon) : undefined;
		if (glyphKey !== currentGlyph) {
			currentGlyph = glyphKey;
			glyph.textContent = '';
			if (beat.icon) {
				glyph.appendChild(renderIcon(beat.icon));
			}
		}
		glyph.style.color = beat.iconColor ? stateColor(beat.iconColor) : '';
		glyph.classList.toggle('shown', !!beat.icon);

		if (beat.text) {
			// Typed beats reveal over the first ~70% of the beat, so the finished
			// phrase is readable before it moves on.
			typed.textContent = beat.type
				? beat.text.slice(0, Math.ceil(Math.min(1, progress / 0.7) * beat.text.length))
				: beat.text;
		}
		rest.classList.toggle('shown', !beat.text);
		typed.classList.toggle('shown', !!beat.text);
		caret.classList.toggle('shown', !!beat.caret);

		if (beat.badge) {
			badgeCount.textContent = beat.badge;
		}
		badge.classList.toggle('shown', !!beat.badge);

		const voice = beat.voice ?? 'off';
		voicePill.classList.toggle('shown', voice !== 'off');
		const dictationKey = voice === 'dictating' ? 'filled' : 'plain';
		if (dictationKey !== currentDictation) {
			currentDictation = dictationKey;
			dictationIcon.textContent = '';
			dictationIcon.appendChild(renderIcon(voice === 'dictating' ? Codicon.micFilled : Codicon.mic));
		}
		dictationCell.classList.toggle('active', voice === 'dictating');
		voiceCell.classList.toggle('idle', voice === 'idle');
		voiceCell.classList.toggle('listening', voice === 'listening');
		voiceCell.classList.toggle('speaking', voice === 'speaking');

		// Dictation and voice are mutually exclusive, so the inactive cell
		// collapses away and the active one takes the whole pill.
		const inVoice = voice === 'idle' || voice === 'listening' || voice === 'speaking';
		const dictating = voice === 'dictating';
		dictationCell.classList.toggle('collapsed', inVoice);
		voiceCell.classList.toggle('collapsed', dictating);
		voicePill.classList.toggle('single', inVoice || dictating);

		// The arrow never leaves — it only changes emphasis. It arms the moment
		// there is a character of yours to send, typed or dictated, and stays dim
		// while you are speaking or the agent is: neither is a turn you submit.
		const hasUserInput = !!(beat.text && beat.type && typed.textContent);
		const yourTurn = voice !== 'listening' && voice !== 'speaking';
		send.classList.toggle('armed', hasUserInput && yourTurn);
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

		// Compact whenever it is holding nothing — no text, no body, no badge.
		surface.toggleAttribute('data-compact', !beat.text && !beat.badge && (beat.body?.kind ?? 'none') === 'none');

		// `dark` on a beat means "the theme command has run by now".
		const wantDark = beat.dark ? endDark : !endDark;
		if (wantDark !== liveDark) {
			liveDark = wantDark;
			applyTheme(container, liveDark);
			// The beam bakes light/dark tuning in at apply time, so rebuild it.
			replaceBeam(beam, surface, beamFor(beatGlow(beat), liveDark, isInteractive));
		}

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
			replaceBeam(beam, surface, beamFor(beatGlow(beat), liveDark, isInteractive));
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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, disposableWindowInterval, getWindow } from '../../../../base/browser/dom.js';
import { IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ColorScheme } from '../../../../platform/theme/common/theme.js';
import { IBorderBeamOptions } from '../../../contrib/chat/browser/voiceClient/borderBeam/borderBeamElement.js';
import { enableAnimations, makeResizable, replaceBeam } from './beamFixtureUtils.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from './fixtureUtils.js';

/**
 * Omni chat — the command center reimagined as a "dynamic island".
 *
 * At rest the island is simply a place to type: no leading icon, natural
 * language only, with the command center's suggestions hanging below it. It
 * then morphs through the voice states, and grows to host a routing card when a
 * request needs to be aimed at one of several running sessions.
 *
 * The glow is the state indicator, so colour has to stay semantically stable —
 * every beam here pins `hueRange: 0`.
 */

// The ocean palette's blues/violets sit around this hue; rotating by
// (targetHue - OCEAN_BASE_HUE) recenters the whole palette on a chosen colour.
const OCEAN_BASE_HUE = 250;
/** Listening / user — blue, rgb(88,166,255). */
const LISTENING_HUE = 212;
/** Speaking / assistant — purple, rgb(163,113,247). */
const SPEAKING_HUE = 262;

const ISLAND_WIDTH = 560;
const ISLAND_RADIUS = 14;

type OmniState = 'idle' | 'resolving' | 'listening' | 'speaking' | 'needsInput';

interface StateTone {
	readonly colorVariant: IBorderBeamOptions['colorVariant'];
	readonly saturation: number;
	readonly strength: number;
	readonly brightness?: number;
	readonly hueBaseDeg: number;
	/** Rotate family reads as a traveling beam; pulse family as a breathing rim. */
	readonly size: IBorderBeamOptions['size'];
}

// `mono` is attenuated ~4x internally, so neutral states need full strength to
// sit at a weight comparable to the coloured ones.
const NEUTRAL: StateTone = { colorVariant: 'mono', saturation: 0, strength: 1, brightness: 1.5, hueBaseDeg: 0, size: 'pulse-inner' };
const TONES: Record<OmniState, StateTone> = {
	// At rest the island barely breathes — it should read as a text field.
	idle: { ...NEUTRAL, strength: 0.55, brightness: 1.2 },
	resolving: { ...NEUTRAL, size: 'md' },
	listening: { colorVariant: 'ocean', saturation: 0.55, strength: 0.9, hueBaseDeg: LISTENING_HUE - OCEAN_BASE_HUE, size: 'pulse-inner' },
	speaking: { colorVariant: 'ocean', saturation: 0.6, strength: 0.9, brightness: 1.4, hueBaseDeg: SPEAKING_HUE - OCEAN_BASE_HUE, size: 'pulse-inner' },
	needsInput: { colorVariant: 'sunset', saturation: 0.55, strength: 0.85, hueBaseDeg: 0, size: 'pulse-inner' },
};

function isDark(ctx: ComponentFixtureContext): boolean {
	return ctx.theme.type === ColorScheme.DARK || ctx.theme.type === ColorScheme.HIGH_CONTRAST_DARK;
}


// ============================================================================
// Styles
// ============================================================================

const OMNI_CSS = `
.omni-stage {
	display: flex;
	flex-direction: column;
	gap: 10px;
	align-items: flex-start;
	font-family: var(--vscode-font-family);
	color: var(--vscode-foreground);
}
.omni-caption {
	font-size: 11px;
	opacity: .6;
}

/* The island itself: a place to type, not a widget. */
.omni-island {
	position: relative;
	box-sizing: border-box;
	display: flex;
	align-items: center;
	gap: 10px;
	width: ${ISLAND_WIDTH}px;
	min-height: 38px;
	padding: 6px 8px 6px 14px;
	border-radius: ${ISLAND_RADIUS}px;
	background: var(--vscode-input-background);
	border: 1px solid var(--vscode-input-border, transparent);
	color: var(--vscode-input-foreground);
}
.omni-query {
	flex: 1;
	font-size: 13px;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.omni-query[data-placeholder] { color: var(--vscode-input-placeholderForeground); }
.omni-caret {
	display: inline-block;
	width: 1px;
	height: 14px;
	margin-left: 1px;
	vertical-align: text-bottom;
	background: var(--vscode-editorCursor-foreground, currentColor);
}

/* Trailing affordances */
.omni-mic {
	flex: 0 0 auto;
	display: flex;
	align-items: center;
	justify-content: center;
	width: 26px;
	height: 26px;
	border-radius: 8px;
	color: var(--vscode-icon-foreground);
	font-size: 14px;
}
.omni-pill {
	flex: 0 0 auto;
	display: flex;
	align-items: center;
	gap: 6px;
	height: 22px;
	padding: 0 9px;
	border-radius: 999px;
	font-size: 11px;
	background: var(--vscode-badge-background);
	color: var(--vscode-badge-foreground);
}
.omni-pill[data-tone="listening"] {
	background: color-mix(in srgb, rgb(88, 166, 255) 22%, transparent);
	color: var(--vscode-foreground);
}
.omni-pill[data-tone="speaking"] {
	background: color-mix(in srgb, rgb(163, 113, 247) 22%, transparent);
	color: var(--vscode-foreground);
}
.omni-pill[data-tone="alert"] {
	background: color-mix(in srgb, var(--vscode-notificationsWarningIcon-foreground) 22%, transparent);
	color: var(--vscode-foreground);
}
.omni-dot {
	width: 6px;
	height: 6px;
	border-radius: 50%;
	background: currentColor;
}

/* Panel: the command center body that hangs under the island. */
.omni-panel {
	box-sizing: border-box;
	width: ${ISLAND_WIDTH}px;
	padding: 8px 0;
	border-radius: 10px;
	background: var(--vscode-editorWidget-background, var(--vscode-input-background));
	border: 1px solid var(--vscode-editorWidget-border, transparent);
	color: var(--vscode-foreground);
	font-size: 12px;
}
.omni-group-label {
	padding: 4px 14px;
	font-size: 10px;
	letter-spacing: .06em;
	text-transform: uppercase;
	opacity: .5;
}
.omni-row {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 5px 14px;
	line-height: 18px;
}
.omni-row[data-selected] { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
.omni-row-glyph { width: 14px; text-align: center; opacity: .7; }
.omni-row-label { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.omni-row-hint { opacity: .55; font-size: 11px; }

/* Routing card */
.omni-card { padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
.omni-card-head { display: flex; align-items: center; gap: 8px; }
.omni-card-avatar {
	width: 20px; height: 20px; border-radius: 6px;
	display: flex; align-items: center; justify-content: center;
	font-size: 10px;
	background: var(--vscode-badge-background); color: var(--vscode-badge-foreground);
}
.omni-card-name { font-weight: 600; }
.omni-card-repo { opacity: .55; }
.omni-card-match { margin-left: auto; opacity: .7; font-size: 11px; }
.omni-transcript {
	display: flex; flex-direction: column; gap: 6px;
	padding: 8px 10px;
	border-radius: 8px;
	background: var(--vscode-textBlockQuote-background, rgba(127,127,127,.08));
}
.omni-turn { display: flex; gap: 8px; line-height: 16px; }
.omni-turn-who { flex: 0 0 38px; opacity: .5; font-size: 11px; }
.omni-turn-text { flex: 1; opacity: .85; }
.omni-countdown { display: flex; align-items: center; gap: 10px; }
.omni-progress {
	flex: 1; height: 3px; border-radius: 999px;
	background: var(--vscode-progressBar-background, rgba(127,127,127,.25));
	opacity: .35;
	overflow: hidden;
}
.omni-progress-fill { height: 100%; background: var(--vscode-progressBar-background); border-radius: 999px; }
.omni-action { opacity: .8; }
.omni-action[data-primary] { color: var(--vscode-textLink-foreground); }
`;


// ============================================================================
// Island + panel construction
// ============================================================================

interface IslandOptions {
	readonly state: OmniState;
	readonly query?: string;
	readonly placeholder?: string;
	/** Voice/alert pill shown before the mic. */
	readonly pill?: { readonly label: string; readonly tone: 'listening' | 'speaking' | 'alert' };
	/** Leading status glyph — only ever set when there is something to say. */
	readonly glyph?: string;
}

function renderIsland(options: IslandOptions): HTMLElement {
	const island = $('.omni-island');

	// No leading icon at rest: the island should read as a place to type. The
	// glyph only appears while resolving / reporting a result.
	if (options.glyph) {
		const glyph = $('span.omni-row-glyph');
		glyph.textContent = options.glyph;
		island.appendChild(glyph);
	}

	const query = $('span.omni-query');
	if (options.query) {
		query.textContent = options.query;
		if (options.state === 'listening') {
			query.appendChild($('span.omni-caret'));
		}
	} else {
		query.textContent = options.placeholder ?? 'Ask anything, or start a new session\u2026';
		query.setAttribute('data-placeholder', '');
	}
	island.appendChild(query);

	if (options.pill) {
		const pill = $('span.omni-pill');
		pill.setAttribute('data-tone', options.pill.tone);
		pill.appendChild($('span.omni-dot'));
		const label = $('span');
		label.textContent = options.pill.label;
		pill.appendChild(label);
		island.appendChild(pill);
	}

	const mic = $('span.omni-mic');
	mic.textContent = '\u25CF';
	island.appendChild(mic);

	return island;
}

interface Row {
	readonly glyph: string;
	readonly label: string;
	readonly hint?: string;
	readonly selected?: boolean;
}

function renderRows(groups: readonly { readonly label: string; readonly rows: readonly Row[] }[]): HTMLElement {
	const panel = $('.omni-panel');
	for (const group of groups) {
		const label = $('.omni-group-label');
		label.textContent = group.label;
		panel.appendChild(label);
		for (const row of group.rows) {
			const el = $('.omni-row');
			if (row.selected) {
				el.setAttribute('data-selected', '');
			}
			const glyph = $('span.omni-row-glyph');
			glyph.textContent = row.glyph;
			const text = $('span.omni-row-label');
			text.textContent = row.label;
			el.append(glyph, text);
			if (row.hint) {
				const hint = $('span.omni-row-hint');
				hint.textContent = row.hint;
				el.appendChild(hint);
			}
			panel.appendChild(el);
		}
	}
	return panel;
}

/** The command center body: what you get for free just by focusing the island. */
function renderCommandCenter(): HTMLElement {
	return renderRows([
		{
			label: 'Recent', rows: [
				{ glyph: '\u21BB', label: 'Change the theme to Red Velvet', hint: 'Preferences: Color Theme' },
				{ glyph: '\u21BB', label: 'Run the build task', hint: 'Tasks: Run Build Task' },
			]
		},
		{
			label: 'Sessions', rows: [
				{ glyph: '\u25CF', label: 'portfolio-site', hint: 'needs input' },
				{ glyph: '\u25CF', label: 'api-gateway', hint: 'running' },
			]
		},
	]);
}

/** Classifier resolved the utterance to a concrete command. */
function renderResolved(): HTMLElement {
	return renderRows([
		{
			label: 'Run', rows: [
				{ glyph: '\u2318', label: 'Preferences: Color Theme \u2192 Red Velvet', hint: 'Enter', selected: true },
			]
		},
	]);
}

/**
 * The routing card — a deliberate, designed surface rather than a slim badge,
 * because picking the wrong session is the expensive mistake here.
 */
function renderRoutingCard(remainingRatio: number, seconds: number): HTMLElement {
	const panel = $('.omni-panel');
	const card = $('.omni-card');

	const head = $('.omni-card-head');
	const avatar = $('.omni-card-avatar');
	avatar.textContent = 'PS';
	const name = $('span.omni-card-name');
	name.textContent = 'portfolio-site';
	const repo = $('span.omni-card-repo');
	repo.textContent = 'eli/portfolio';
	const match = $('span.omni-card-match');
	match.textContent = '87% match';
	head.append(avatar, name, repo, match);

	const transcript = $('.omni-transcript');
	for (const [who, text] of [['you', 'make the hero section bigger'], ['agent', 'Updated the hero to 72px and tightened the subhead.']]) {
		const turn = $('.omni-turn');
		const w = $('span.omni-turn-who');
		w.textContent = who;
		const t = $('span.omni-turn-text');
		t.textContent = text;
		turn.append(w, t);
		transcript.appendChild(turn);
	}

	const countdown = $('.omni-countdown');
	const progress = $('.omni-progress');
	const fill = $('.omni-progress-fill');
	fill.style.width = `${Math.round(remainingRatio * 100)}%`;
	progress.appendChild(fill);
	const timer = $('span.omni-row-hint');
	timer.textContent = `Sending in ${seconds}s`;
	const change = $('span.omni-action');
	change.setAttribute('data-primary', '');
	change.textContent = 'Change';
	const cancel = $('span.omni-action');
	cancel.textContent = 'Cancel';
	countdown.append(progress, timer, change, cancel);

	card.append(head, transcript, countdown);
	panel.appendChild(card);
	return panel;
}


// ============================================================================
// Fixtures
// ============================================================================

interface Scene {
	readonly caption: string;
	readonly island: IslandOptions;
	readonly panel?: () => HTMLElement;
}

const SCENES: Record<string, Scene> = {
	idle: {
		caption: 'Idle \u2014 the command center',
		island: { state: 'idle' },
		panel: renderCommandCenter,
	},
	resolving: {
		caption: 'Resolving \u2014 classifier mapped it to a command',
		island: { state: 'resolving', query: 'change the theme to red', glyph: '\u25CC' },
		panel: renderResolved,
	},
	listening: {
		caption: 'Listening',
		island: { state: 'listening', query: 'change the theme to red for the website\u2026', pill: { label: 'Listening', tone: 'listening' } },
	},
	speaking: {
		caption: 'Speaking',
		island: { state: 'speaking', query: 'Switched portfolio-site to Red Velvet.', pill: { label: 'Speaking', tone: 'speaking' } },
	},
	needsInput: {
		caption: 'Needs input \u2014 badge expanded',
		island: { state: 'needsInput', pill: { label: 'Fix login bug needs input', tone: 'alert' } },
	},
	routing: {
		caption: 'Routing \u2014 which session should this go to?',
		island: { state: 'resolving', query: 'change the theme to red for the website' },
		panel: () => renderRoutingCard(0.6, 6),
	},
};

/** Beam options for a state, with colour pinned so it stays semantic. */
function beamFor(tone: StateTone, ctx: ComponentFixtureContext, interactive: boolean): IBorderBeamOptions {
	return {
		size: tone.size,
		colorVariant: tone.colorVariant,
		saturation: tone.saturation,
		strength: tone.strength,
		brightness: tone.brightness ?? 1.3,
		hueBaseDeg: tone.hueBaseDeg,
		// Colour encodes state, so the palette must not drift off its base hue.
		hueRange: 0,
		theme: isDark(ctx) ? 'dark' : 'light',
		borderRadius: ISLAND_RADIUS,
		startVisible: !interactive,
		staticPreview: !interactive,
	};
}

function renderScene(ctx: ComponentFixtureContext, scene: Scene): void {
	const { container, disposableStore, isInteractive } = ctx;
	container.style.cssText = 'padding:28px 24px;';
	if (isInteractive) {
		enableAnimations(container);
	}

	const style = $('style');
	style.textContent = OMNI_CSS;
	container.appendChild(style);

	const stage = $('.omni-stage');
	const caption = $('.omni-caption');
	caption.textContent = scene.caption;
	const island = renderIsland(scene.island);
	stage.append(caption, island);
	if (scene.panel) {
		stage.appendChild(scene.panel());
	}
	container.appendChild(stage);

	const beam = disposableStore.add(new MutableDisposable<IDisposable>());
	const reapplyBeam = () => replaceBeam(beam, island, beamFor(TONES[scene.island.state], ctx, isInteractive));
	reapplyBeam();
	makeResizable([{ box: island, wrapper: stage, reapplyBeam }], container, disposableStore);
}

/** How long each state is held before the walkthrough advances. */
const SCENE_CYCLE_MS = 3200;
const WALKTHROUGH: readonly string[] = ['idle', 'listening', 'resolving', 'speaking', 'routing', 'needsInput'];

/** The whole flow in one place, cycling so the state language can be judged. */
function renderWalkthrough(ctx: ComponentFixtureContext): void {
	const { container, disposableStore, isInteractive } = ctx;
	container.style.cssText = 'padding:28px 24px;';
	if (isInteractive) {
		enableAnimations(container);
	}

	const style = $('style');
	style.textContent = OMNI_CSS;
	container.appendChild(style);

	const stage = $('.omni-stage');
	const caption = $('.omni-caption');
	const host = $('div');
	host.style.cssText = 'display:flex;flex-direction:column;gap:10px;align-items:flex-start;';
	stage.append(caption, host);
	container.appendChild(stage);

	const beam = disposableStore.add(new MutableDisposable<IDisposable>());
	let index = -1;

	const show = () => {
		index = (index + 1) % WALKTHROUGH.length;
		const scene = SCENES[WALKTHROUGH[index]];
		caption.textContent = scene.caption;
		host.textContent = '';
		const island = renderIsland(scene.island);
		host.appendChild(island);
		if (scene.panel) {
			host.appendChild(scene.panel());
		}
		replaceBeam(beam, island, beamFor(TONES[scene.island.state], ctx, isInteractive));
	};

	show();
	// Only cycle while someone is watching; a screenshot captures the first state.
	if (isInteractive) {
		disposableStore.add(disposableWindowInterval(getWindow(container), show, SCENE_CYCLE_MS));
	}
}

export default defineThemedFixtureGroup({ path: 'voice/omniChat/' }, {
	// The full flow, cycling — the page for judging the state language.
	Walkthrough: defineComponentFixture({
		labels: { kind: 'animated' },
		virtualTime: { enabled: false },
		render: renderWalkthrough,
	}),
	Idle: defineComponentFixture({ labels: { kind: 'screenshot' }, virtualTime: { enabled: false }, render: ctx => renderScene(ctx, SCENES.idle) }),
	Resolving: defineComponentFixture({ labels: { kind: 'screenshot' }, virtualTime: { enabled: false }, render: ctx => renderScene(ctx, SCENES.resolving) }),
	Listening: defineComponentFixture({ labels: { kind: 'screenshot' }, virtualTime: { enabled: false }, render: ctx => renderScene(ctx, SCENES.listening) }),
	Speaking: defineComponentFixture({ labels: { kind: 'screenshot' }, virtualTime: { enabled: false }, render: ctx => renderScene(ctx, SCENES.speaking) }),
	NeedsInput: defineComponentFixture({ labels: { kind: 'screenshot' }, virtualTime: { enabled: false }, render: ctx => renderScene(ctx, SCENES.needsInput) }),
	Routing: defineComponentFixture({ labels: { kind: 'screenshot' }, virtualTime: { enabled: false }, render: ctx => renderScene(ctx, SCENES.routing) }),
});

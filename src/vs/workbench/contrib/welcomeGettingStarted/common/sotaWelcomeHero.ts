/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Son of Anton fork-specific welcome hero. Pure data + a small render helper
// returning DOM nodes built with the workbench's `$` factory. The renderer is
// invoked from `gettingStarted.ts` and injected at the top of the welcome
// page's categories slide.
//
// Kept in `common/` so the data is testable without dragging in browser-only
// dependencies. The art and quotes intentionally duplicate (rather than
// import) the extension-side `personality/asciiArt.ts` / `siliconValleyQuotes.ts`
// catalogues -- those live behind the extension build and the workbench layer
// cannot import across that boundary.

import { localize } from '../../../../nls.js';

/**
 * The corrected Pied Piper letterform. Mirrors the version that lives in
 * `extensions/son-of-anton/src/personality/asciiArt.ts` (`piedPiperLogo`).
 * Pure ASCII so the glyphs render identically across themes and fonts.
 *
 * Retained for back-compat (and as the reduced-motion / no-SVG fallback the
 * renderer can fall back to if it ever needs to). The hero now prefers the
 * inline SVG `PIED_PIPER_SVG` below.
 */
const PIED_PIPER_ART: string = [
	'     ____  ___  _____  ____               ',
	'    |  _ \\|_ _|| ____||  _ \\              ',
	'    | |_) || | |  _|  | | | |             ',
	'    |  __/ | | | |___ | |_| |             ',
	'    |_|   |___||_____||____/              ',
	'                                          ',
	'        ____  ___  ____  _____  ____      ',
	'       |  _ \\|_ _||  _ \\| ____||  _ \\     ',
	'       | |_) || | | |_) |  _|  | |_) |    ',
	'       |  __/ | | |  __/| |___ |  _ <     ',
	'       |_|   |___||_|   |_____||_| \\_\\    ',
].join('\n');

/**
 * Pure data describing the CSS-3D "Son of Anton skyline" that replaces the
 * previous flute SVG. The renderer (`gettingStarted.ts`) maps each entry to a
 * `<div>` whose CSS variables drive position, size, and accent colour; all
 * actual 3D effects are produced by transforms / pseudo-elements declared in
 * `gettingStarted.css`.
 *
 * Two element kinds:
 *  - `'building'`  — a persona-coloured extruded block that "rises" into the
 *                    scene during the build-up animation.
 *  - `'wordmark'`  — a single typographic block carrying the SON OF / ANTON
 *                    headline rendered as 3D type via stacked text-shadows.
 */
export interface ISotaWelcomeHeroSkylineBuilding {
	readonly kind: 'building';
	/** Stable id used for the DOM `data-persona` attribute and for testing. */
	readonly id: string;
	/** Persona accent hex colour driving front, side, and top faces. */
	readonly accent: string;
	/** Horizontal offset from the centre of the scene, in CSS px. */
	readonly x: number;
	/** Vertical offset from the scene's resting baseline, in CSS px. */
	readonly y: number;
	/** Depth offset (negative = further away) for the isometric layout, in CSS px. */
	readonly z: number;
	/** Block width (front-face footprint), in CSS px. */
	readonly w: number;
	/** Block height (extrusion in the build-up direction), in CSS px. */
	readonly h: number;
	/** Block depth (side-face thickness), in CSS px. */
	readonly d: number;
	/**
	 * Animation delay in milliseconds — buildings stagger so the skyline reads
	 * back-to-front rather than landing all at once.
	 */
	readonly delayMs: number;
}

export interface ISotaWelcomeHeroSkylineWordmarkLine {
	readonly kind: 'wordmark';
	/** The text rendered on this line (e.g. "SON OF" or "ANTON"). */
	readonly text: string;
	/** Css class modifier — used for per-line stagger. */
	readonly cls: string;
	/** Animation delay in milliseconds. */
	readonly delayMs: number;
}

export type SotaWelcomeHeroSkylineItem = ISotaWelcomeHeroSkylineBuilding | ISotaWelcomeHeroSkylineWordmarkLine;

/**
 * Persona accent palette mirroring `son-of-anton-core/src/chat/personas.ts`.
 * Hardcoded here because the workbench layer cannot import across the
 * extension/core package boundary; updates to either side must track each
 * other. Order is anton, anton-code, anton-test, anton-security, anton-docs,
 * anton-e2e, anton-ci, anton-pr, anton-moderniser, anton-spec.
 */
const PERSONA_ACCENTS: ReadonlyArray<{ readonly id: string; readonly accent: string }> = [
	{ id: 'anton', accent: '#a855f7' },             // purple
	{ id: 'anton-code', accent: '#3b82f6' },        // blue
	{ id: 'anton-test', accent: '#16a34a' },        // green
	{ id: 'anton-security', accent: '#dc2626' },    // red
	{ id: 'anton-docs', accent: '#0891b2' },        // cyan
	{ id: 'anton-e2e', accent: '#f59e0b' },         // amber
	{ id: 'anton-ci', accent: '#8b5cf6' },          // violet
	{ id: 'anton-pr', accent: '#ec4899' },          // pink
	{ id: 'anton-moderniser', accent: '#64748b' },  // slate
	{ id: 'anton-spec', accent: '#10b981' },        // emerald
];

/**
 * Manually-tuned isometric-ish layout for the ten persona buildings. Positions
 * are authored (not random) so the composition reads as a skyline behind the
 * SON OF ANTON wordmark: the tallest blocks sit on the back row, shorter
 * blocks line the front, and the orchestrator (anton, purple) stands centre.
 *
 * Coordinates are relative to the wrapper's centre. `x` increases rightward,
 * `z` decreases into the page. `y` is always 0 here — the resting baseline —
 * because the rise animation drives `translateY` from 200px to 0.
 */
const SKYLINE_BUILDINGS: readonly ISotaWelcomeHeroSkylineBuilding[] = [
	// Back row — taller, further away. Reads first as silhouette.
	{ kind: 'building', id: 'anton-security', accent: PERSONA_ACCENTS[3].accent, x: -180, y: 0, z: -90, w: 52, h: 168, d: 52, delayMs: 0 },
	{ kind: 'building', id: 'anton-ci',       accent: PERSONA_ACCENTS[6].accent, x: -100, y: 0, z: -110, w: 46, h: 144, d: 46, delayMs: 80 },
	{ kind: 'building', id: 'anton',          accent: PERSONA_ACCENTS[0].accent, x:    0, y: 0, z: -130, w: 64, h: 196, d: 64, delayMs: 160 },
	{ kind: 'building', id: 'anton-pr',       accent: PERSONA_ACCENTS[7].accent, x:  100, y: 0, z: -110, w: 48, h: 152, d: 48, delayMs: 240 },
	{ kind: 'building', id: 'anton-spec',     accent: PERSONA_ACCENTS[9].accent, x:  180, y: 0, z: -90,  w: 50, h: 132, d: 50, delayMs: 320 },
	// Front row — shorter, closer. Frames the wordmark from below.
	{ kind: 'building', id: 'anton-docs',      accent: PERSONA_ACCENTS[4].accent, x: -220, y: 0, z: 30, w: 44, h: 96,  d: 44, delayMs: 400 },
	{ kind: 'building', id: 'anton-test',      accent: PERSONA_ACCENTS[2].accent, x: -130, y: 0, z: 50, w: 42, h: 84,  d: 42, delayMs: 480 },
	{ kind: 'building', id: 'anton-code',      accent: PERSONA_ACCENTS[1].accent, x:  130, y: 0, z: 50, w: 46, h: 104, d: 46, delayMs: 560 },
	{ kind: 'building', id: 'anton-e2e',       accent: PERSONA_ACCENTS[5].accent, x:  210, y: 0, z: 30, w: 44, h: 92,  d: 44, delayMs: 640 },
	{ kind: 'building', id: 'anton-moderniser', accent: PERSONA_ACCENTS[8].accent, x:   40, y: 0, z: 70, w: 40, h: 76,  d: 40, delayMs: 720 },
];

/**
 * Two-line wordmark "SON OF / ANTON". Each line animates in slightly after
 * the back-row buildings have started rising, so the eye reads buildings
 * first → wordmark second. The CSS uses `text-shadow` chains to fake a 3D
 * extrusion without per-letter HTML.
 */
const SKYLINE_WORDMARK: readonly ISotaWelcomeHeroSkylineWordmarkLine[] = [
	{ kind: 'wordmark', text: 'SON OF', cls: 'sota-welcome-skyline-wordmark-line-1', delayMs: 600 },
	{ kind: 'wordmark', text: 'ANTON',  cls: 'sota-welcome-skyline-wordmark-line-2', delayMs: 800 },
];

/** Returns the building blocks (one per persona) that compose the skyline. */
export function getSotaWelcomeHeroSkylineBuildings(): readonly ISotaWelcomeHeroSkylineBuilding[] {
	return SKYLINE_BUILDINGS;
}

/** Returns the wordmark lines rendered at the centre of the skyline. */
export function getSotaWelcomeHeroSkylineWordmark(): readonly ISotaWelcomeHeroSkylineWordmarkLine[] {
	return SKYLINE_WORDMARK;
}

interface ISiliconValleyQuote {
	readonly text: string;
	readonly attribution: string;
}

/**
 * Curated quotes picked deterministically per UTC day. Keep the list short
 * and high-signal -- this surface is read once a day, not browsed.
 */
const SILICON_VALLEY_QUOTES: readonly ISiliconValleyQuote[] = [
	{
		text: "It's possible that Son of Anton thought the best way to get rid of all the bugs was to get rid of all the software, which is technically and statistically correct.",
		attribution: 'Gilfoyle',
	},
	{
		text: "I'm not hiring him. He uses spaces not tabs.",
		attribution: 'Richard Hendricks',
	},
	{
		text: "It's not magic, it's talent and sweat.",
		attribution: 'Gilfoyle',
	},
	{
		text: 'That was an out-of-body experience. It was like God was coding through me.',
		attribution: 'Dinesh',
	},
	{
		text: "I don't want to live in a world where someone else is making the world a better place better than we are.",
		attribution: 'Gavin Belson',
	},
	{
		text: "Welcome to Pied Piper's new home. Hoo-hoo-hoo!",
		attribution: 'Richard Hendricks',
	},
	{
		text: "Don't 'think different,' that's Apple.",
		attribution: 'Gavin Belson',
	},
	{
		text: 'If the rise of an all-powerful artificial intelligence is inevitable, well it stands to reason that when they take power, our digital overlords will punish those of us who did not help them get there. Ergo, I would like to be a helpful idiot. Like yourself.',
		attribution: 'Gilfoyle',
	},
	{
		text: 'Tabs are objectively superior. Do not @ me.',
		attribution: 'Richard Hendricks',
	},
	{
		text: 'Compression is the answer. The question is irrelevant.',
		attribution: 'Gilfoyle',
	},
];

function dayOfYear(now: Date): number {
	const start = Date.UTC(now.getUTCFullYear(), 0, 0);
	const diff = now.getTime() - start;
	const oneDay = 1000 * 60 * 60 * 24;
	return Math.floor(diff / oneDay);
}

/** Picks a deterministic quote for the given day. Exported for tests. */
export function pickQuoteForDate(now: Date): ISiliconValleyQuote {
	const index = dayOfYear(now) % SILICON_VALLEY_QUOTES.length;
	return SILICON_VALLEY_QUOTES[index];
}

export interface ISotaWelcomeHeroAction {
	readonly id: string;
	readonly label: string;
	readonly command: string;
	/** Optional argument forwarded to `commandService.executeCommand`. */
	readonly argument?: string;
	readonly primary?: boolean;
}

/**
 * Returns the call-to-action buttons surfaced in the hero. `command` values
 * are executed via the standard `ICommandService`, so any registered command
 * (built-in or from the `son-of-anton` extension) works without further wiring.
 */
export function getSotaWelcomeHeroActions(): readonly ISotaWelcomeHeroAction[] {
	return [
		{
			id: 'sota.welcome.hero.openChat',
			label: localize('sota.welcome.hero.openChat', "Open Chat Sidebar"),
			command: 'workbench.view.extension.sota-chat',
			primary: true,
		},
		{
			id: 'sota.welcome.hero.setupWizard',
			label: localize('sota.welcome.hero.setupWizard', "Setup Wizard"),
			command: 'sota.openSetupWizard',
		},
		{
			id: 'sota.welcome.hero.showQuote',
			label: localize('sota.welcome.hero.showQuote', "Show Silicon Valley Quote"),
			command: 'sota.showSiliconValleyQuote',
		},
		{
			id: 'sota.welcome.hero.recentConversation',
			label: localize('sota.welcome.hero.recentConversation', "Recent Conversation"),
			// `sota.openConversation` expects an id argument. Routing to the
			// chat view focuses the sidebar where the most recent conversation
			// auto-loads, which is the user-visible equivalent without needing
			// to know an id ahead of time.
			command: 'workbench.view.extension.sota-chat',
		},
	];
}

export interface ISotaWelcomeHeroContent {
	readonly art: string;
	readonly skylineBuildings: readonly ISotaWelcomeHeroSkylineBuilding[];
	readonly skylineWordmark: readonly ISotaWelcomeHeroSkylineWordmarkLine[];
	readonly title: string;
	readonly tagline: string;
	readonly quote: ISiliconValleyQuote;
	readonly actions: readonly ISotaWelcomeHeroAction[];
}

/**
 * Returns the full content payload the hero renderer needs. Keeping this in
 * one place makes it trivially mockable in tests. `art` is the legacy ASCII
 * silhouette retained as the screen-reader / no-CSS fallback; the
 * `skyline*` arrays drive the CSS-3D scene that has replaced the previous
 * inline-SVG art.
 */
export function getSotaWelcomeHeroContent(now: Date = new Date()): ISotaWelcomeHeroContent {
	return {
		art: PIED_PIPER_ART,
		skylineBuildings: getSotaWelcomeHeroSkylineBuildings(),
		skylineWordmark: getSotaWelcomeHeroSkylineWordmark(),
		title: localize('sota.welcome.hero.title', "Son of Anton"),
		tagline: localize('sota.welcome.hero.tagline', "middle out compression for your IDE"),
		quote: pickQuoteForDate(now),
		actions: getSotaWelcomeHeroActions(),
	};
}

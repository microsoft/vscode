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
 * Path / shape primitives used to build the welcome hero's inline SVG. The
 * actual SVG nodes are constructed by `gettingStarted.ts` from this data so
 * we never have to hand untrusted markup to `innerHTML`. Coordinates assume
 * a 0–200 viewBox; the host CSS scales the rendered SVG to taste.
 *
 * Each entry's `cls` carries an extra modifier class so the CSS animation
 * delays can be staggered (spiral first, then flute, then breath line).
 */
export interface ISotaWelcomeHeroSvgPath {
	readonly kind: 'path';
	readonly cls: string;
	readonly d: string;
}

export interface ISotaWelcomeHeroSvgCircle {
	readonly kind: 'circle';
	readonly cls: string;
	readonly cx: number;
	readonly cy: number;
	readonly r: number;
}

export type SotaWelcomeHeroSvgShape = ISotaWelcomeHeroSvgPath | ISotaWelcomeHeroSvgCircle;

/**
 * Stylised "scoping flute" silhouette — an abstract spiral / chord wave
 * deliberately not modelled on any trademarked logo. The shapes draw in via
 * `stroke-dasharray` + `stroke-dashoffset` keyframes (see
 * `gettingStarted.css`) and then settle into a slow breath cycle.
 */
const PIED_PIPER_SVG_SHAPES: readonly SotaWelcomeHeroSvgShape[] = [
	// Outer spiral — three-turn logarithmic curve sweeping into the centre.
	{
		kind: 'path',
		cls: 'sota-welcome-art-path sota-welcome-art-spiral',
		d: 'M 175 100 '
			+ 'C 175 60, 140 25, 100 25 '
			+ 'C 60 25, 25 60, 25 100 '
			+ 'C 25 140, 60 175, 100 175 '
			+ 'C 130 175, 155 150, 155 120 '
			+ 'C 155 95, 135 75, 110 75 '
			+ 'C 90 75, 75 90, 75 110 '
			+ 'C 75 125, 87 137, 102 137 '
			+ 'C 113 137, 122 128, 122 117 '
			+ 'C 122 109, 116 103, 108 103 '
			+ 'C 103 103, 99 107, 99 112 '
			+ 'C 99 115, 101 117, 104 117',
	},
	// Flute bore — a long sweeping curve suggesting a flute silhouette.
	{
		kind: 'path',
		cls: 'sota-welcome-art-path sota-welcome-art-flute',
		d: 'M 35 60 '
			+ 'Q 70 40, 110 55 '
			+ 'Q 150 70, 175 60 '
			+ 'L 178 72 '
			+ 'Q 150 86, 110 73 '
			+ 'Q 70 60, 35 80 Z',
	},
	// Five tone-hole dots evenly spaced along the flute bore.
	{ kind: 'circle', cls: 'sota-welcome-art-path sota-welcome-art-hole', cx: 60, cy: 62, r: 2.2 },
	{ kind: 'circle', cls: 'sota-welcome-art-path sota-welcome-art-hole', cx: 85, cy: 60, r: 2.2 },
	{ kind: 'circle', cls: 'sota-welcome-art-path sota-welcome-art-hole', cx: 110, cy: 63, r: 2.2 },
	{ kind: 'circle', cls: 'sota-welcome-art-path sota-welcome-art-hole', cx: 135, cy: 66, r: 2.2 },
	{ kind: 'circle', cls: 'sota-welcome-art-path sota-welcome-art-hole', cx: 160, cy: 65, r: 2.2 },
	// Breath line — a sound-wave hint above the flute, three sine arcs.
	{
		kind: 'path',
		cls: 'sota-welcome-art-path sota-welcome-art-breath',
		d: 'M 40 35 Q 55 22, 70 35 T 100 35 T 130 35 T 160 35',
	},
];

/** Returns the immutable shape list backing the hero SVG. */
export function getSotaWelcomeHeroArtShapes(): readonly SotaWelcomeHeroSvgShape[] {
	return PIED_PIPER_SVG_SHAPES;
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
	readonly artShapes: readonly SotaWelcomeHeroSvgShape[];
	readonly title: string;
	readonly tagline: string;
	readonly quote: ISiliconValleyQuote;
	readonly actions: readonly ISotaWelcomeHeroAction[];
}

/**
 * Returns the full content payload the hero renderer needs. Keeping this in
 * one place makes it trivially mockable in tests. `art` is the legacy ASCII
 * silhouette retained as a fallback; `artShapes` is the structured SVG
 * description the renderer prefers and which carries the draw-in / breath
 * animations.
 */
export function getSotaWelcomeHeroContent(now: Date = new Date()): ISotaWelcomeHeroContent {
	return {
		art: PIED_PIPER_ART,
		artShapes: getSotaWelcomeHeroArtShapes(),
		title: localize('sota.welcome.hero.title', "Son of Anton"),
		tagline: localize('sota.welcome.hero.tagline', "middle out compression for your IDE"),
		quote: pickQuoteForDate(now),
		actions: getSotaWelcomeHeroActions(),
	};
}

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

/**
 * Inline isometric "Son of Anton" skyline — letters built as stacked-block
 * extruded buildings (Silicon Valley title-card energy) with a blueprint
 * draw-in animation on the front face, ground-plane perspective grid,
 * Pied Piper / Hooli balloons floating up, and small cars driving along
 * the iso road. Self-contained (animations live in the SVG's own `<style>`
 * block), so it drops into the welcome page with no external assets.
 *
 * Adapted from a hand-authored reference. Notable adaptations:
 *  - Removed `@import url('https://fonts.googleapis.com/...')` (workbench
 *    CSP blocks remote font sheets); falls back to Arial Black / Impact.
 *  - Dropped the root `style="background-color"` so the welcome page's
 *    own background shows through.
 *  - Animations use unique keyframe names so they can't collide with the
 *    existing welcome-page CSS (drawBlueprint / fadeIn / floatUp1 /
 *    floatUp2 / drive1 / drive2).
 */
export const SOTA_WELCOME_HERO_SKYLINE_SVG: string = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
	<defs>
		<style>
			.sota-skyline-blueprint-line {
				fill: none;
				stroke: #3498db;
				stroke-width: 2;
				stroke-dasharray: 1500;
				stroke-dashoffset: 1500;
				animation: sotaSkylineDrawBlueprint 1s ease-in-out forwards;
			}
			.sota-skyline-grid-line {
				stroke: #222222;
				stroke-width: 1;
				opacity: 0;
				animation: sotaSkylineFadeIn 1s ease-in forwards;
			}
			@keyframes sotaSkylineDrawBlueprint { to { stroke-dashoffset: 0; } }
			@keyframes sotaSkylineFadeIn { to { opacity: 1; } }
			.sota-skyline-balloon-1 { animation: sotaSkylineFloatUp1 25s linear infinite; }
			.sota-skyline-balloon-2 { animation: sotaSkylineFloatUp2 28s linear infinite; animation-delay: 2s; }
			@keyframes sotaSkylineFloatUp1 {
				0% { transform: translate(0, 150px) rotate(-5deg); opacity: 0; }
				10% { opacity: 1; }
				90% { opacity: 1; }
				100% { transform: translate(100px, -400px) rotate(5deg); opacity: 0; }
			}
			@keyframes sotaSkylineFloatUp2 {
				0% { transform: translate(0, 200px) rotate(3deg); opacity: 0; }
				10% { opacity: 1; }
				90% { opacity: 1; }
				100% { transform: translate(-150px, -500px) rotate(-3deg); opacity: 0; }
			}
			/* Continuous Isometric Ring Road Animation. Three cars share the same
			 * 16s loop staggered by negative delay so the road always has motion. */
			.sota-skyline-car-loop-1 { animation: sotaSkylineDriveLoop 16s linear infinite; }
			.sota-skyline-car-loop-2 { animation: sotaSkylineDriveLoop 16s linear infinite; animation-delay: -5.33s; }
			.sota-skyline-car-loop-3 { animation: sotaSkylineDriveLoop 16s linear infinite; animation-delay: -10.66s; }
			@keyframes sotaSkylineDriveLoop {
				0%    { transform: translate(-380px, -150px) rotate(0deg); }
				23%   { transform: translate(350px, -150px) rotate(0deg); }
				25%   { transform: translate(380px, -120px) rotate(90deg); }
				48%   { transform: translate(380px, 200px) rotate(90deg); }
				50%   { transform: translate(350px, 230px) rotate(180deg); }
				73%   { transform: translate(-350px, 230px) rotate(180deg); }
				75%   { transform: translate(-380px, 200px) rotate(270deg); }
				98%   { transform: translate(-380px, -120px) rotate(270deg); }
				100%  { transform: translate(-380px, -150px) rotate(360deg); }
			}
			@media (prefers-reduced-motion: reduce) {
				.sota-skyline-blueprint-line { animation: none; stroke-dashoffset: 0; }
				.sota-skyline-grid-line { animation: none; opacity: 1; }
				.sota-skyline-balloon-1, .sota-skyline-balloon-2,
				.sota-skyline-car-loop-1, .sota-skyline-car-loop-2,
				.sota-skyline-car-loop-3 { animation: none; }
			}
		</style>
		<g id="sota-skyline-text-base" text-anchor="middle" font-family="'Anton', 'Arial Black', Impact, sans-serif" font-weight="900" font-size="140" letter-spacing="2">
			<text x="0" y="0">SON OF</text>
			<text x="0" y="140">ANTON</text>
		</g>
		<g id="sota-skyline-iso-text">
			<g transform="matrix(0.866, 0.5, -0.866, 0.5, 600, 320)">
				<use href="#sota-skyline-text-base" />
			</g>
		</g>
		<g id="sota-skyline-car-red">
			<rect x="-15" y="-7.5" width="30" height="15" fill="#A00000" rx="2" />
			<rect x="-8" y="-5.5" width="12" height="11" fill="#701c1c" rx="1" />
			<rect x="12" y="-5" width="3" height="3" fill="#f1c40f" />
			<rect x="12" y="2" width="3" height="3" fill="#f1c40f" />
		</g>
		<g id="sota-skyline-car-green">
			<rect x="-15" y="-7.5" width="30" height="15" fill="#2ecc71" rx="2" />
			<rect x="-8" y="-5.5" width="12" height="11" fill="#1e8449" rx="1" />
			<rect x="12" y="-5" width="3" height="3" fill="#f1c40f" />
			<rect x="12" y="2" width="3" height="3" fill="#f1c40f" />
		</g>
		<g id="sota-skyline-car-blue">
			<rect x="-15" y="-7.5" width="30" height="15" fill="#3498db" rx="2" />
			<rect x="-8" y="-5.5" width="12" height="11" fill="#21618c" rx="1" />
			<rect x="12" y="-5" width="3" height="3" fill="#f1c40f" />
			<rect x="12" y="2" width="3" height="3" fill="#f1c40f" />
		</g>
		<g id="sota-skyline-tree">
			<path d="M0,-35 L-8,-20 L-3,-20 L-10,-5 L0,-5 Z" fill="#2ecc71" />
			<path d="M0,-35 L8,-20 L3,-20 L10,-5 L0,-5 Z" fill="#27ae60" />
			<rect x="-1.5" y="-5" width="3" height="6" fill="#2c1e16" />
		</g>
		<g id="sota-skyline-tech-tower">
			<path d="M 0,0 L -50,-25 L -50,-150 L 0,-125 Z" fill="#17202A" />
			<path d="M 0,-20 L -50,-45 M 0,-40 L -50,-65 M 0,-60 L -50,-85 M 0,-80 L -50,-105 M 0,-100 L -50,-125" stroke="#3498db" stroke-width="2" opacity="0.6"/>
			<path d="M 0,0 L 50,-25 L 50,-150 L 0,-125 Z" fill="#212F3D" />
			<path d="M 0,-20 L 50,-45 M 0,-40 L 50,-65 M 0,-60 L 50,-85 M 0,-80 L 50,-105 M 0,-100 L 50,-125" stroke="#3498db" stroke-width="2" opacity="0.3"/>
			<path d="M 0,-125 L -50,-150 L 0,-175 L 50,-150 Z" fill="#424949" />
			<rect x="-10" y="-155" width="20" height="10" fill="#111" />
		</g>
		<g id="sota-skyline-tech-campus">
			<path d="M 0,0 L -80,-40 L -80,-90 L 0,-50 Z" fill="#17202A" />
			<path d="M 0,-15 L -80,-55 M 0,-30 L -80,-70" stroke="#2ecc71" stroke-width="2.5" opacity="0.6"/>
			<path d="M 0,0 L 70,-35 L 70,-85 L 0,-50 Z" fill="#212F3D" />
			<path d="M 0,-15 L 70,-50 M 0,-30 L 70,-65" stroke="#2ecc71" stroke-width="2.5" opacity="0.3"/>
			<path d="M 0,-50 L -80,-90 L -10,-125 L 70,-85 Z" fill="#424949" />
			<ellipse cx="-5" cy="-90" rx="18" ry="9" fill="#111" stroke="#2ecc71" stroke-width="1.5" />
			<text x="-5" y="-87" font-family="'Arial', sans-serif" font-weight="bold" font-size="8" fill="#2ecc71" text-anchor="middle">H</text>
		</g>
		<g id="sota-skyline-data-center">
			<path d="M 0,0 L -40,-20 L -40,-70 L 0,-50 Z" fill="#0f0f0f" />
			<path d="M 0,-10 L -40,-30 M 0,-20 L -40,-40 M 0,-30 L -40,-50 M 0,-40 L -40,-60" stroke="#e74c3c" stroke-width="1.5" opacity="0.8"/>
			<path d="M 0,0 L 60,-30 L 60,-80 L 0,-50 Z" fill="#1a1a1a" />
			<path d="M 0,-10 L 60,-40 M 0,-20 L 60,-50 M 0,-30 L 60,-60 M 0,-40 L 60,-70" stroke="#e74c3c" stroke-width="1.5" opacity="0.5"/>
			<path d="M 0,-50 L -40,-70 L 20,-100 L 60,-80 Z" fill="#2c2c2c" />
			<circle cx="10" cy="-80" r="5" fill="#111" />
			<circle cx="25" cy="-85" r="5" fill="#111" />
		</g>
		<g id="sota-skyline-tech-cube">
			<path d="M 0,0 L -45,-22.5 L -45,-82.5 L 0,-60 Z" fill="#1A252C" />
			<path d="M 0,-15 L -45,-37.5 M 0,-30 L -45,-52.5 M 0,-45 L -45,-67.5" stroke="#9b59b6" stroke-width="2" opacity="0.6"/>
			<path d="M 0,0 L 45,-22.5 L 45,-82.5 L 0,-60 Z" fill="#2C3E50" />
			<path d="M 0,-15 L 45,-37.5 M 0,-30 L 45,-52.5 M 0,-45 L 45,-67.5" stroke="#9b59b6" stroke-width="2" opacity="0.3"/>
			<path d="M 0,-60 L -45,-82.5 L 0,-105 L 45,-82.5 Z" fill="#34495E" />
			<path d="M -22.5,-71.25 L 22.5,-93.75 M -22.5,-93.75 L 22.5,-71.25" stroke="#2C3E50" stroke-width="1"/>
		</g>
	</defs>
	<g class="sota-skyline-grid-line">
		<path d="M-500,400 L1500,1400 M-400,350 L1600,1350 M-300,300 L1700,1300 M-200,250 L1800,1250 M-100,200 L1900,1200 M0,150 L2000,1150 M100,100 L2100,1100 M200,50 L2200,1050 M300,0 L2300,1000 M400,-50 L2400,950 M500,-100 L2500,900 M600,-150 L2600,850 M700,-200 L2700,800 M800,-250 L2800,750" />
		<path d="M1500,-500 L-500,500 M1600,-450 L-400,550 M1700,-400 L-300,600 M1800,-350 L-200,650 M1900,-300 L-100,700 M2000,-250 L0,750 M2100,-200 L100,800 M2200,-150 L200,850 M2300,-100 L300,900 M2400,-50 L400,950 M2500,0 L500,1000 M2600,50 L600,1050 M2700,100 L700,1100 M2800,150 L800,1150" />
	</g>
	<g>
		<g transform="translate(100, 100) scale(0.8)"><use href="#sota-skyline-tech-tower"/></g>
		<g transform="translate(330, 80) scale(0.9)"><use href="#sota-skyline-tech-cube"/></g>
		<g transform="translate(600, 100) scale(0.7)"><use href="#sota-skyline-tech-campus"/></g>
		<g transform="translate(850, 130) scale(0.85)"><use href="#sota-skyline-data-center"/></g>
		<g transform="translate(1050, 160) scale(0.75)"><use href="#sota-skyline-tech-tower"/></g>
		<g transform="translate(70, 100)"><use href="#sota-skyline-tree"/></g>
		<g transform="translate(130, 110)"><use href="#sota-skyline-tree"/></g>
		<g transform="translate(290, 90)"><use href="#sota-skyline-tree"/></g>
		<g transform="translate(550, 110)"><use href="#sota-skyline-tree"/></g>
		<g transform="translate(800, 140)"><use href="#sota-skyline-tree"/></g>
		<g transform="translate(1000, 170)"><use href="#sota-skyline-tree"/></g>
	</g>
	<g>
		<g transform="translate(60, 280)"><use href="#sota-skyline-tech-cube"/></g>
		<g transform="translate(220, 180)"><use href="#sota-skyline-tech-tower"/></g>
		<g transform="translate(500, 220)"><use href="#sota-skyline-tech-campus"/></g>
		<g transform="translate(750, 250)"><use href="#sota-skyline-tech-cube"/></g>
		<g transform="translate(980, 280)"><use href="#sota-skyline-data-center"/></g>
		<g transform="translate(1180, 380)"><use href="#sota-skyline-tech-campus"/></g>
		<g transform="translate(20, 290)"><use href="#sota-skyline-tree"/></g>
		<g transform="translate(180, 190)"><use href="#sota-skyline-tree"/></g>
		<g transform="translate(260, 200)"><use href="#sota-skyline-tree"/></g>
		<g transform="translate(450, 230)"><use href="#sota-skyline-tree"/></g>
		<g transform="translate(710, 260)"><use href="#sota-skyline-tree"/></g>
		<g transform="translate(930, 290)"><use href="#sota-skyline-tree"/></g>
		<g transform="translate(1130, 390)"><use href="#sota-skyline-tree"/></g>
	</g>
	<g>
		<g transform="matrix(0.866, 0.5, -0.866, 0.5, 600, 420)">
			<rect x="-380" y="-150" width="760" height="380" rx="30" fill="#0a0a0a" />
			<rect x="-380" y="-150" width="760" height="380" rx="30" fill="none" stroke="#111111" stroke-width="40" />
			<rect x="-380" y="-150" width="760" height="380" rx="30" fill="none" stroke="#f1c40f" stroke-width="2" stroke-dasharray="15 15" opacity="0.4" />
			<g class="sota-skyline-car-loop-1"><use href="#sota-skyline-car-red"/></g>
			<g class="sota-skyline-car-loop-2"><use href="#sota-skyline-car-green"/></g>
			<g class="sota-skyline-car-loop-3"><use href="#sota-skyline-car-blue"/></g>
		</g>
		<use href="#sota-skyline-iso-text" y="100" fill="#1a1a1a" opacity="0">
			<animate attributeName="opacity" to="1" dur="0.5s" begin="1s" fill="freeze" />
		</use>
		<use href="#sota-skyline-iso-text" y="100" class="sota-skyline-blueprint-line" />
	</g>
	<g>
		<g opacity="0"><animate attributeName="opacity" to="1" dur="0.01s" begin="1.0s" fill="freeze" />
			<g fill="#424949"><use href="#sota-skyline-iso-text" y="99"/><use href="#sota-skyline-iso-text" y="98"/><use href="#sota-skyline-iso-text" y="97"/></g>
			<g fill="#17202A"><use href="#sota-skyline-iso-text" y="96"/><use href="#sota-skyline-iso-text" y="95"/><use href="#sota-skyline-iso-text" y="94"/><use href="#sota-skyline-iso-text" y="93"/><use href="#sota-skyline-iso-text" y="92"/><use href="#sota-skyline-iso-text" y="91"/><use href="#sota-skyline-iso-text" y="90"/></g>
		</g>
		<g opacity="0"><animate attributeName="opacity" to="1" dur="0.01s" begin="1.2s" fill="freeze" />
			<g fill="#424949"><use href="#sota-skyline-iso-text" y="89"/><use href="#sota-skyline-iso-text" y="88"/><use href="#sota-skyline-iso-text" y="87"/></g>
			<g fill="#17202A"><use href="#sota-skyline-iso-text" y="86"/><use href="#sota-skyline-iso-text" y="85"/><use href="#sota-skyline-iso-text" y="84"/><use href="#sota-skyline-iso-text" y="83"/><use href="#sota-skyline-iso-text" y="82"/><use href="#sota-skyline-iso-text" y="81"/><use href="#sota-skyline-iso-text" y="80"/></g>
		</g>
		<g opacity="0"><animate attributeName="opacity" to="1" dur="0.01s" begin="1.4s" fill="freeze" />
			<g fill="#424949"><use href="#sota-skyline-iso-text" y="79"/><use href="#sota-skyline-iso-text" y="78"/><use href="#sota-skyline-iso-text" y="77"/></g>
			<g fill="#17202A"><use href="#sota-skyline-iso-text" y="76"/><use href="#sota-skyline-iso-text" y="75"/><use href="#sota-skyline-iso-text" y="74"/><use href="#sota-skyline-iso-text" y="73"/><use href="#sota-skyline-iso-text" y="72"/><use href="#sota-skyline-iso-text" y="71"/><use href="#sota-skyline-iso-text" y="70"/></g>
		</g>
		<g opacity="0"><animate attributeName="opacity" to="1" dur="0.01s" begin="1.6s" fill="freeze" />
			<g fill="#424949"><use href="#sota-skyline-iso-text" y="69"/><use href="#sota-skyline-iso-text" y="68"/><use href="#sota-skyline-iso-text" y="67"/></g>
			<g fill="#17202A"><use href="#sota-skyline-iso-text" y="66"/><use href="#sota-skyline-iso-text" y="65"/><use href="#sota-skyline-iso-text" y="64"/><use href="#sota-skyline-iso-text" y="63"/><use href="#sota-skyline-iso-text" y="62"/><use href="#sota-skyline-iso-text" y="61"/><use href="#sota-skyline-iso-text" y="60"/></g>
		</g>
		<g opacity="0"><animate attributeName="opacity" to="1" dur="0.01s" begin="1.8s" fill="freeze" />
			<g fill="#424949"><use href="#sota-skyline-iso-text" y="59"/><use href="#sota-skyline-iso-text" y="58"/><use href="#sota-skyline-iso-text" y="57"/></g>
			<g fill="#17202A"><use href="#sota-skyline-iso-text" y="56"/><use href="#sota-skyline-iso-text" y="55"/><use href="#sota-skyline-iso-text" y="54"/><use href="#sota-skyline-iso-text" y="53"/><use href="#sota-skyline-iso-text" y="52"/><use href="#sota-skyline-iso-text" y="51"/><use href="#sota-skyline-iso-text" y="50"/></g>
		</g>
		<g opacity="0"><animate attributeName="opacity" to="1" dur="0.01s" begin="2.0s" fill="freeze" />
			<g fill="#424949"><use href="#sota-skyline-iso-text" y="49"/><use href="#sota-skyline-iso-text" y="48"/><use href="#sota-skyline-iso-text" y="47"/></g>
			<g fill="#17202A"><use href="#sota-skyline-iso-text" y="46"/><use href="#sota-skyline-iso-text" y="45"/><use href="#sota-skyline-iso-text" y="44"/><use href="#sota-skyline-iso-text" y="43"/><use href="#sota-skyline-iso-text" y="42"/><use href="#sota-skyline-iso-text" y="41"/><use href="#sota-skyline-iso-text" y="40"/></g>
		</g>
		<g opacity="0"><animate attributeName="opacity" to="1" dur="0.01s" begin="2.2s" fill="freeze" />
			<g fill="#424949"><use href="#sota-skyline-iso-text" y="39"/><use href="#sota-skyline-iso-text" y="38"/><use href="#sota-skyline-iso-text" y="37"/></g>
			<g fill="#17202A"><use href="#sota-skyline-iso-text" y="36"/><use href="#sota-skyline-iso-text" y="35"/><use href="#sota-skyline-iso-text" y="34"/><use href="#sota-skyline-iso-text" y="33"/><use href="#sota-skyline-iso-text" y="32"/><use href="#sota-skyline-iso-text" y="31"/><use href="#sota-skyline-iso-text" y="30"/></g>
		</g>
		<g opacity="0"><animate attributeName="opacity" to="1" dur="0.01s" begin="2.4s" fill="freeze" />
			<g fill="#424949"><use href="#sota-skyline-iso-text" y="29"/><use href="#sota-skyline-iso-text" y="28"/><use href="#sota-skyline-iso-text" y="27"/></g>
			<g fill="#17202A"><use href="#sota-skyline-iso-text" y="26"/><use href="#sota-skyline-iso-text" y="25"/><use href="#sota-skyline-iso-text" y="24"/><use href="#sota-skyline-iso-text" y="23"/><use href="#sota-skyline-iso-text" y="22"/><use href="#sota-skyline-iso-text" y="21"/><use href="#sota-skyline-iso-text" y="20"/></g>
		</g>
		<g opacity="0"><animate attributeName="opacity" to="1" dur="0.01s" begin="2.6s" fill="freeze" />
			<g fill="#424949"><use href="#sota-skyline-iso-text" y="19"/><use href="#sota-skyline-iso-text" y="18"/><use href="#sota-skyline-iso-text" y="17"/></g>
			<g fill="#17202A"><use href="#sota-skyline-iso-text" y="16"/><use href="#sota-skyline-iso-text" y="15"/><use href="#sota-skyline-iso-text" y="14"/><use href="#sota-skyline-iso-text" y="13"/><use href="#sota-skyline-iso-text" y="12"/><use href="#sota-skyline-iso-text" y="11"/><use href="#sota-skyline-iso-text" y="10"/></g>
		</g>
		<g opacity="0"><animate attributeName="opacity" to="1" dur="0.01s" begin="2.8s" fill="freeze" />
			<g fill="#424949"><use href="#sota-skyline-iso-text" y="9"/><use href="#sota-skyline-iso-text" y="8"/><use href="#sota-skyline-iso-text" y="7"/></g>
			<g fill="#17202A"><use href="#sota-skyline-iso-text" y="6"/><use href="#sota-skyline-iso-text" y="5"/><use href="#sota-skyline-iso-text" y="4"/><use href="#sota-skyline-iso-text" y="3"/><use href="#sota-skyline-iso-text" y="2"/><use href="#sota-skyline-iso-text" y="1"/></g>
		</g>
		<g fill="#8B0000" stroke="#500000" stroke-width="1.5" transform="translate(0, 99)">
			<animateTransform attributeName="transform" type="translate" from="0 99" to="0 0" dur="2s" begin="1s" fill="freeze" />
			<use href="#sota-skyline-iso-text" x="0" y="0" />
		</g>
		<g opacity="0"><animate attributeName="opacity" to="1" dur="0.5s" begin="3s" fill="freeze" />
			<g transform="matrix(0.866, 0.5, -0.866, 0.5, 500, 290)">
				<rect x="0" y="0" width="15" height="15" fill="#424949" />
				<circle cx="7.5" cy="7.5" r="5" fill="#17202A" />
			</g>
			<g transform="matrix(0.866, 0.5, -0.866, 0.5, 650, 420)">
				<rect x="0" y="0" width="20" height="10" fill="#424949" />
				<rect x="2" y="2" width="16" height="6" fill="#17202A" />
			</g>
		</g>
	</g>
	<g>
		<g transform="translate(180, 580)"><use href="#sota-skyline-data-center"/></g>
		<g transform="translate(450, 750)"><use href="#sota-skyline-tech-campus"/></g>
		<g transform="translate(850, 700)"><use href="#sota-skyline-tech-tower"/></g>
		<g transform="translate(1080, 550)"><use href="#sota-skyline-tech-cube"/></g>
		<g transform="translate(20, 680) scale(1.1)"><use href="#sota-skyline-tech-tower"/></g>
		<g transform="translate(1120, 750) scale(1.2)"><use href="#sota-skyline-data-center"/></g>
		<g transform="translate(140, 590)"><use href="#sota-skyline-tree"/></g>
		<g transform="translate(410, 760)"><use href="#sota-skyline-tree"/></g>
		<g transform="translate(530, 740)"><use href="#sota-skyline-tree"/></g>
		<g transform="translate(810, 710)"><use href="#sota-skyline-tree"/></g>
		<g transform="translate(1040, 560)"><use href="#sota-skyline-tree"/></g>
		<g transform="translate(60, 690)"><use href="#sota-skyline-tree"/></g>
		<g transform="translate(1080, 760)"><use href="#sota-skyline-tree"/></g>
	</g>
	<g class="sota-skyline-balloon-1">
		<g transform="translate(250, 600)">
			<line x1="0" y1="40" x2="-8" y2="60" stroke="#7f8c8d" stroke-width="1"/>
			<line x1="0" y1="40" x2="8" y2="60" stroke="#7f8c8d" stroke-width="1"/>
			<rect x="-10" y="60" width="20" height="15" fill="#701c1c" rx="2" />
			<circle cx="0" cy="0" r="45" fill="#2ecc71" />
			<path d="M-45,0 A45,45 0 0,0 45,0 L30,45 L-30,45 Z" fill="#27ae60" />
			<text x="0" y="10" font-family="'Arial Black', sans-serif" font-weight="900" font-size="12" fill="#fff" text-anchor="middle">PIED PIPER</text>
		</g>
	</g>
	<g class="sota-skyline-balloon-2">
		<g transform="translate(1000, 600)">
			<line x1="0" y1="45" x2="-10" y2="65" stroke="#7f8c8d" stroke-width="1.5"/>
			<line x1="0" y1="45" x2="10" y2="65" stroke="#7f8c8d" stroke-width="1.5"/>
			<rect x="-12" y="65" width="24" height="18" fill="#d35400" rx="2" />
			<circle cx="0" cy="0" r="55" fill="#3498db" />
			<path d="M-55,0 A55,55 0 0,0 55,0 L35,50 L-35,50 Z" fill="#2980b9" />
			<text x="0" y="15" font-family="'Arial Black', sans-serif" font-weight="900" font-size="16" fill="#fff" text-anchor="middle" letter-spacing="1">HOOLI</text>
		</g>
	</g>
</svg>`;

export interface ISotaWelcomeHeroContent {
	readonly art: string;
	readonly skylineSvg: string;
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
		skylineSvg: SOTA_WELCOME_HERO_SKYLINE_SVG,
		title: localize('sota.welcome.hero.title', "Son of Anton"),
		tagline: localize('sota.welcome.hero.tagline', "middle out compression for your IDE"),
		quote: pickQuoteForDate(now),
		actions: getSotaWelcomeHeroActions(),
	};
}

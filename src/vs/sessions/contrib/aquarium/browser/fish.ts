/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VS Code logo "fish" used by the Agents window aquarium. Each fish is a small
 * SVG element styled with `color:` so the silhouette inherits via `currentColor`,
 * with animated body strips providing the swimming motion.
 */

/** VS Code logo silhouette path (extracted from sessions/contrib/chat/browser/media/vscode-icon.svg). */
const VSCODE_LOGO_PATH = 'M65.566 89.4264C66.889 89.9418 68.3976 89.9087 69.7329 89.2662L87.0271 80.9446C88.8444 80.0701 90 78.231 90 76.2132V19.7872C90 17.7695 88.8444 15.9303 87.0271 15.0559L69.7329 6.73395C67.9804 5.89069 65.9295 6.09724 64.3914 7.21543C64.1716 7.37517 63.9624 7.55352 63.7659 7.75007L30.6583 37.9548L16.2372 27.0081C14.8948 25.9891 13.0171 26.0726 11.7702 27.2067L7.14495 31.4141C5.61986 32.8014 5.61811 35.2007 7.14117 36.5902L19.6476 48.0001L7.14117 59.4099C5.61811 60.7995 5.61986 63.1988 7.14495 64.5861L11.7702 68.7934C13.0171 69.9276 14.8948 70.0111 16.2372 68.9921L30.6583 58.0453L63.7659 88.2501C64.2897 88.7741 64.9046 89.1688 65.566 89.4264ZM69.0128 28.9311L43.8917 48.0001L69.0128 67.069V28.9311Z';

/** The three VS Code release channel colors used as fish "species". */
export const enum FishSpecies {
	Stable = 'stable',
	Insiders = 'insiders',
	Exploration = 'exploration',
}

const SPECIES_COLOR: Record<FishSpecies, string> = {
	[FishSpecies.Stable]: '#007ACC',
	[FishSpecies.Insiders]: '#24bfa5',
	[FishSpecies.Exploration]: '#E04F00',
};

/** Pick a random species, weighted Stable > Insiders > Exploration. */
export function pickRandomSpecies(): FishSpecies {
	const roll = Math.random();
	if (roll < 0.5) {
		return FishSpecies.Stable;
	}
	if (roll < 0.8) {
		return FishSpecies.Insiders;
	}
	return FishSpecies.Exploration;
}

/**
 * Tear down the shared SVG defs container for the given document. Call when
 * no fish are active in that document.
 */
export function disposeSharedFishDefs(targetDocument: Document): void {
	const container = sharedDefsByDocument.get(targetDocument);
	if (container) {
		container.remove();
		sharedDefsByDocument.delete(targetDocument);
	}
}

export interface IFishOptions {
	readonly species: FishSpecies;
	readonly size: number;
	readonly positionX: number;
	readonly positionY: number;
	readonly velocityX: number;
	readonly velocityY: number;
}

/**
 * A swimming fish. Owns its DOM element and exposes mutable position/velocity
 * for the aquarium's RAF loop to update.
 */
export class Fish {

	readonly element: HTMLDivElement;
	private readonly innerElement: HTMLDivElement;

	positionX: number;
	positionY: number;
	velocityX: number;
	velocityY: number;
	readonly size: number;

	/** Timestamp until which this fish is in "panic" mode (faster, scattering). */
	panicUntil = 0;

	/**
	 * The fish's preferred swim heading in radians. Drifts smoothly each frame
	 * via a small random delta — much less jittery than randomizing per-axis
	 * acceleration every frame.
	 */
	wanderAngle: number;

	/**
	 * Smoothed facing in [-1, 1] (1 = right, -1 = left). Eased toward
	 * sign(velocityX) each frame so direction changes look like a turn instead of
	 * a snap-flip.
	 */
	private facing = 1;

	constructor(opts: IFishOptions, targetDocument: Document) {
		this.positionX = opts.positionX;
		this.positionY = opts.positionY;
		this.velocityX = opts.velocityX;
		this.velocityY = opts.velocityY;
		this.size = opts.size;
		this.wanderAngle = Math.atan2(opts.velocityY, opts.velocityX);

		this.element = targetDocument.createElement('div');
		this.element.className = 'agents-aquarium-fish';
		this.element.style.width = `${opts.size}px`;
		this.element.style.height = `${opts.size}px`;
		this.element.style.color = SPECIES_COLOR[opts.species];

		// Inner element receives the directional flip so the body strip animations
		// (driven by --agents-aquarium-strip-index) are unaffected by direction changes.
		this.innerElement = targetDocument.createElement('div');
		this.innerElement.className = 'agents-aquarium-fish-inner';
		this.innerElement.appendChild(buildFishSvg(targetDocument));
		this.element.appendChild(this.innerElement);

		this.applyTransform();
	}

	/**
	 * Write the current position/facing to the DOM.
	 *
	 * @param deltaSeconds seconds since last frame, used to ease facing toward
	 *           velocity direction. Pass 0 for the initial paint.
	 */
	applyTransform(deltaSeconds: number = 0): void {
		// Translate is on the outer element. Sub-pixel precision (2 decimals)
		// avoids visible 0.1 px stepping when fish move slowly.
		this.element.style.transform = `translate(${this.positionX.toFixed(2)}px, ${this.positionY.toFixed(2)}px)`;

		// Ease `facing` toward sign(velocityX) so the flip looks like a turn
		// instead of an instant mirror. Time-constant ~120 ms (turnRate = 8/s).
		const targetFacing = this.velocityX >= 0 ? 1 : -1;
		if (deltaSeconds > 0) {
			const turnRate = 8;
			const easeFactor = 1 - Math.exp(-turnRate * deltaSeconds);
			this.facing += (targetFacing - this.facing) * easeFactor;
		} else {
			this.facing = targetFacing;
		}
		// scaleX through 0 in the middle of a turn flattens the fish for one
		// frame, mimicking a body roll. Floor at 0.05 to avoid zero-width.
		const flipScaleX = Math.sign(this.facing) * Math.max(Math.abs(this.facing), 0.05);
		this.innerElement.style.transform = `scaleX(${flipScaleX.toFixed(3)})`;
	}
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Number of vertical strips the body is sliced into. More strips = smoother
 * wave (smaller per-strip phase delta), fewer visible seams. Kept moderate
 * because each strip = one path + one CSS animation per fish; with 50 fish
 * this contributes meaningfully to layer/animation work.
 */
const NUM_BODY_STRIPS = 10;

/** The body's bounding range in the original logo's user units. */
const BODY_X_START = 5;
const BODY_X_END = 90;

/**
 * Lazily-built shared SVG element holding both the strip clipPath defs AND
 * a single `<symbol>` containing the VS Code logo path. All fish reference
 * these via `clip-path: url(#…)` and `<use href="#…">` instead of duplicating
 * the path data per strip per fish (which previously caused 50 fish * 10
 * strips = 500 path parses on every aquarium activation).
 *
 * Keyed by `Document` so multi-window scenarios (auxiliary windows) each get
 * their own defs in their own document — `<use>` references can't cross
 * document boundaries, so a single global would break in any window other
 * than the first to activate.
 */
const sharedDefsByDocument = new WeakMap<Document, SVGSVGElement>();

const SHARED_LOGO_SYMBOL_ID = 'agents-aquarium-fish-logo';

function ensureSharedDefs(targetDocument: Document): void {
	if (sharedDefsByDocument.has(targetDocument)) {
		return;
	}
	const stripWidth = (BODY_X_END - BODY_X_START) / NUM_BODY_STRIPS;
	const container = targetDocument.createElementNS(SVG_NS, 'svg');
	container.setAttribute('xmlns', SVG_NS);
	container.setAttribute('width', '0');
	container.setAttribute('height', '0');
	container.setAttribute('aria-hidden', 'true');
	container.style.position = 'absolute';
	container.style.width = '0';
	container.style.height = '0';
	container.style.overflow = 'hidden';
	container.style.pointerEvents = 'none';

	// One `<symbol>` containing the VS Code logo path. All strips reference
	// this via `<use href="#agents-aquarium-fish-logo">`, so the path data
	// is parsed exactly ONCE per session instead of FISH_COUNT * NUM_STRIPS.
	const symbol = targetDocument.createElementNS(SVG_NS, 'symbol');
	symbol.setAttribute('id', SHARED_LOGO_SYMBOL_ID);
	symbol.setAttribute('viewBox', '0 0 96 96');
	symbol.setAttribute('overflow', 'visible');
	const logoPath = targetDocument.createElementNS(SVG_NS, 'path');
	logoPath.setAttribute('d', VSCODE_LOGO_PATH);
	logoPath.setAttribute('fill', 'currentColor');
	logoPath.setAttribute('fill-rule', 'evenodd');
	symbol.appendChild(logoPath);
	container.appendChild(symbol);

	const defs = targetDocument.createElementNS(SVG_NS, 'defs');
	for (let i = 0; i < NUM_BODY_STRIPS; i++) {
		const clip = targetDocument.createElementNS(SVG_NS, 'clipPath');
		clip.setAttribute('id', `agents-aquarium-fish-clip-${i}`);
		clip.setAttribute('clipPathUnits', 'userSpaceOnUse');
		const rect = targetDocument.createElementNS(SVG_NS, 'rect');
		rect.setAttribute('x', String(BODY_X_START + i * stripWidth));
		rect.setAttribute('y', '-20');
		// Larger overlap (0.8 user-units) hides seams when adjacent strips
		// are at slightly different translateY values.
		rect.setAttribute('width', String(stripWidth + 0.8));
		rect.setAttribute('height', '136');
		clip.appendChild(rect);
		defs.appendChild(clip);
	}
	container.appendChild(defs);
	targetDocument.body.appendChild(container);
	sharedDefsByDocument.set(targetDocument, container);
}

/**
 * Build the inline SVG element tree for a fish:
 *   - VS Code logo body, sliced into N vertical strips that each oscillate in
 *     Y with a phase-offset CSS animation (the "swimming" sine wave)
 *
 * Colors come from `currentColor` on the parent element. Built with
 * `document.createElementNS` (no innerHTML) to satisfy Trusted Types.
 *
 * The strip clipPath defs and the logo symbol are shared across all fish via
 * {@link ensureSharedDefs}.
 */
function buildFishSvg(targetDocument: Document): SVGSVGElement {
	ensureSharedDefs(targetDocument);

	const svg = targetDocument.createElementNS(SVG_NS, 'svg');
	svg.setAttribute('xmlns', SVG_NS);
	svg.setAttribute('focusable', 'false');
	// viewBox 0..96 matches the original VS Code icon.
	svg.setAttribute('viewBox', '0 0 96 96');
	svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
	// Tell the rasterizer to optimize for visual quality, not speed: smoother
	// edges on the (potentially upscaled) logo paths.
	svg.setAttribute('shape-rendering', 'geometricPrecision');

	// Body: NUM_BODY_STRIPS overlapping references to the shared logo symbol,
	// each clipped to its vertical band via shared clipPath defs. Each strip
	// animates translateY with a phase offset driven by --agents-aquarium-strip-index.
	const bodyGroup = targetDocument.createElementNS(SVG_NS, 'g');
	bodyGroup.setAttribute('class', 'agents-aquarium-fish-body');
	for (let i = 0; i < NUM_BODY_STRIPS; i++) {
		const stripG = targetDocument.createElementNS(SVG_NS, 'g');
		stripG.setAttribute('class', 'agents-aquarium-fish-strip');
		stripG.style.setProperty('--agents-aquarium-strip-index', String(i));
		const stripUse = targetDocument.createElementNS(SVG_NS, 'use');
		stripUse.setAttribute('href', `#${SHARED_LOGO_SYMBOL_ID}`);
		stripUse.setAttribute('clip-path', `url(#agents-aquarium-fish-clip-${i})`);
		stripG.appendChild(stripUse);
		bodyGroup.appendChild(stripG);
	}
	svg.appendChild(bodyGroup);

	return svg;
}

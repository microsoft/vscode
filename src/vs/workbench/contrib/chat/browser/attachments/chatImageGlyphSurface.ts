/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Color } from '../../../../../base/common/color.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { foreground } from '../../../../../platform/theme/common/colorRegistry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { imageGenerationFieldMessage } from '../widget/chatContentParts/toolInvocationParts/chatImageGenerationField.js';
import { getImageGenerationFieldToneColors } from '../widget/chatContentParts/toolInvocationParts/chatImageGenerationFieldCanvas.js';
import { bandProfile, clamp01, easeInOutCubic, easeOutCubic, flash, getLoadingWave, hash, ILoadingWave, ImageSamples, ITextureFrame, ITextureReveal, placeWave, smoothstep, stageAt, steerLoadingWave, TextureSurface, twinkle, waveIntensity, wavePeriod, waveRipple } from './chatImageTextures.js';

/** Glyphs of the ASCII textures: binary digits, crest glyphs from faint to dense, a typing cursor, and glyphs that only appear while scrambling. */
const glyphs = ['0', '1', '·', ':', '=', '+', '*', '#', '\u258C', '/', '\\', '<', '>', '%', '&', '@', '$', '?', '!', '{', '}'];
const firstCrestGlyph = 2;
const crestLevels = 6;
const cursorGlyph = firstCrestGlyph + crestLevels;
const firstScrambleGlyph = cursorGlyph + 1;

// Atlas rows: the four binary and six crest tones of the image-generation field, then a hot tone
// for flashes, a scramble tone, white for color masks, and one row per palette color of the image.
const binaryTones = 4;
const hotTone = 10;
const scrambleTone = 11;
const maskTone = 12;
const firstPaletteTone = 13;

// Image brightness above this share of its range is drawn with crest glyphs, below it with digits.
const crestStart = 0.36;

/** Waves brighter than this draw crest glyphs; dimmer parts of a wave leave the digits beneath it. */
const waveThreshold = 0.12;

/** Length, as a share of a wave's tail, of the wake behind it in which digits stay lit. */
const wakeLength = 1.8;

const messageBits = [...imageGenerationFieldMessage].map(character => character.charCodeAt(0).toString(2).padStart(8, '0')).join('');

/**
 * Loading states that `--chat-image-glyph-loader` selects. Each one moves the field of binary
 * digits in its own way, and each carries on into the ASCII reveals.
 */
const loaders = ['wave', 'comets', 'stream', 'ripples', 'typewriter', 'tide'] as const;
type GlyphLoader = typeof loaders[number];

/**
 * Directions that `--chat-image-glyph-direction` selects for waves and loaders: `outward` spreads
 * from the middle toward the edges, and `alternate` sweeps right and then left by turns.
 */
const directions = ['right', 'left', 'down', 'up', 'diagonal', 'outward', 'alternate'] as const;
type GlyphDirection = typeof directions[number];

/** Virtual milliseconds over which a reveal's frame opens from the band's height to the image's. */
const openLength = 900;

/**
 * Virtual milliseconds over which a reveal's frame grows or narrows from the band's width to the
 * image's, before it opens to the image's height: longer for bigger changes, and none without one.
 */
function resizeLength(fromWidth: number, toWidth: number): number {
	const change = Math.abs(toWidth - fromWidth);
	return change < 1 ? 0 : Math.min(600, 360 + change * 1.25);
}

/** Virtual milliseconds that a pass of ASCII Resolve takes to sweep the frame. */
const passLength = 1500;

/** Virtual milliseconds between the starts of two passes of ASCII Resolve. */
const passGap = 1200;

/** Most passes that ASCII Resolve makes, which `--chat-image-reveal-passes` selects. */
const maxPasses = 6;

// Ripples: a drop lands every interval, and its ring spreads at a speed, in pixels per virtual millisecond, until it fades.
const rippleInterval = 650;
const rippleLife = 2600;
const rippleSpeed = 0.085;

// Typewriter: virtual milliseconds to type a digit, and to pause at the end of a line.
const typeInterval = 38;
const linePause = 320;

const lengths = new Map([
	['ascii-resolve', 4500],
	['ascii-decode', 4600],
]);

/**
 * Returns the binary digit of a cell. Read as 8-bit ASCII from its leftmost cell, every row of
 * digits spells {@link imageGenerationFieldMessage}, each row starting on one of its characters.
 */
export function getGlyphMessageBit(column: number, row: number): number {
	const start = Math.floor(hash(row, 0, 9) * imageGenerationFieldMessage.length) * 8;
	return messageBits[(start + column) % messageBits.length] === '1' ? 1 : 0;
}

function mod(value: number, length: number): number {
	return ((value % length) + length) % length;
}

/** A flash brightens crest glyphs fully, but keeps digits in the dark parts of an image subdued. */
function flashTone(packed: number): number {
	return packed >> 5 < firstCrestGlyph ? binaryTones - 1 : hotTone;
}

/** Slow swells that drift through the field of digits, so that it never reads as empty, in [0, 1]. */
function swell(x: number, y: number, time: number): number {
	return 0.5 + 0.28 * Math.sin(x * 0.031 - time / 1400 + 1.6 * Math.sin(y * 0.07 + time / 2300)) + 0.22 * Math.sin(x * 0.017 + y * 0.12 + time / 1900);
}

/**
 * Orders that `--chat-image-reveal-resize-order` selects for a reveal's frame to change from the
 * band's size to the image's: its width and then its height, its height and then its width, or both
 * at once. The width changes on its own in the first two, which delays the rest of the reveal.
 */
const resizeOrders = ['width-first', 'height-first', 'together'] as const;
type ResizeOrder = typeof resizeOrders[number];

function readResizeOrder(style: CSSStyleDeclaration): ResizeOrder {
	const order = style.getPropertyValue('--chat-image-reveal-resize-order').trim();
	return resizeOrders.find(candidate => candidate === order) ?? 'width-first';
}

function readPasses(style: CSSStyleDeclaration): number {
	const passes = parseInt(style.getPropertyValue('--chat-image-reveal-passes'), 10);
	return passes >= 1 ? Math.min(maxPasses, passes) : 1;
}

interface IGlyphAtlas {
	readonly canvas: HTMLCanvasElement;
	/** Side of a cell, in device pixels. */
	readonly cell: number;
}

/**
 * Paints a glyph loading band of binary digits, which spell the image-generation field's greeting,
 * and carries it on into an ASCII reveal of the image. The loader that moves the digits is a dense
 * wave of glyphs by default; comets, a bit stream, ripples, a typewriter and a tide are the others.
 *
 * - **Resolve**: the band opens into the frame, then glyph waves sweep it and draw the image in
 *   glyphs: dense where it is bright and faint digits where it is dark. When there is more than
 *   one pass, each one leaves a sharper and less noisy drawing than the one before.
 * - **Decode**: scrambled glyphs spread from the wave's head and lock, one by one, into the glyph
 *   drawing of the image.
 *
 * The drawing then keeps resolving: finer glyphs, glyphs in the image's own palette, and glyphs in
 * its true colors, before the image itself takes over. Neither the image's width nor its height
 * is known while it is generated, so the frame changes from the band's size to the image's: its
 * width first by default, or its height first, or both at once, which
 * `--chat-image-reveal-resize-order` selects.
 *
 * CSS tunes the texture: the font size sets the glyphs' size, `--chat-image-glyph-loader` the
 * loader, `--chat-image-glyph-direction` the direction it and the waves move in,
 * `--chat-image-glyph-fill` how brightly the digits swell, and `--chat-image-reveal-passes` how
 * many passes ASCII Resolve makes.
 */
export class GlyphSurface extends TextureSurface {

	private readonly atlases = new Map<number, IGlyphAtlas>();
	private overlay: HTMLCanvasElement | undefined;
	private overlayUsed = false;
	private cellSize = 10;
	private fontFamily = 'monospace';
	private pixelRatio = 1;
	private loader: GlyphLoader = 'wave';
	private direction: GlyphDirection = 'right';
	private fill = 0.5;
	private passes = 1;
	private resizeOrder: ResizeOrder = 'width-first';
	/** Left edge of a reveal's grid, which keeps the band's so that no glyph moves at the handoff. */
	private gridX = 0;
	private imagePalette: Float32Array | undefined;
	private readonly stageTimes = new Float64Array(3);
	private readonly passWaves: ILoadingWave[] = [];
	private origin = { x: 0, y: 0, reach: 1 };

	constructor(
		container: HTMLElement,
		@IThemeService themeService: IThemeService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
	) {
		super(container, 'chat-image-loading-glyphs', themeService, accessibilityService);
	}

	lengthOf(transition: string, fromWidth?: number, toWidth?: number): number | undefined {
		const length = lengths.get(transition);
		if (length === undefined) {
			return undefined;
		}
		const style = dom.getWindow(this.canvas).getComputedStyle(this.canvas);
		const resize = fromWidth === undefined || toWidth === undefined || readResizeOrder(style) === 'together' ? 0 : resizeLength(fromWidth, toWidth);
		const passes = transition === 'ascii-resolve' ? (readPasses(style) - 1) * passGap : 0;
		return length + resize + passes;
	}

	protected override onDidRefresh(): void {
		this.atlases.clear();
		this.measure();
	}

	private measure(): void {
		const targetWindow = dom.getWindow(this.canvas);
		const style = targetWindow.getComputedStyle(this.canvas);
		// Cells are about one em square, and even, so that the finer stage splits each into exactly four.
		this.cellSize = Math.max(6, Math.round((parseFloat(style.fontSize) || 10) / 2) * 2);
		this.fontFamily = style.fontFamily || 'monospace';
		this.pixelRatio = targetWindow.devicePixelRatio || 1;
		const loader = style.getPropertyValue('--chat-image-glyph-loader').trim();
		this.loader = loaders.find(candidate => candidate === loader) ?? 'wave';
		const direction = style.getPropertyValue('--chat-image-glyph-direction').trim();
		this.direction = directions.find(candidate => candidate === direction) ?? 'right';
		const fill = parseFloat(style.getPropertyValue('--chat-image-glyph-fill'));
		this.fill = isNaN(fill) ? 0.5 : clamp01(fill);
		this.passes = readPasses(style);
		this.resizeOrder = readResizeOrder(style);
	}

	protected paintLoading(time: number): void {
		const width = this.canvas.clientWidth;
		const height = this.canvas.clientHeight;
		const canvasWidth = Math.round(width * this.pixelRatio);
		const canvasHeight = Math.round(height * this.pixelRatio);
		if (this.canvas.width !== canvasWidth || this.canvas.height !== canvasHeight) {
			this.canvas.width = canvasWidth;
			this.canvas.height = canvasHeight;
		}
		const context = this.canvas.getContext('2d');
		const atlas = this.atlas(this.cellSize);
		if (!context || !atlas) {
			return;
		}
		context.clearRect(0, 0, canvasWidth, canvasHeight);
		const size = this.cellSize;
		const offsetX = this.gridOffset(width);
		const columns = Math.floor(width / size);
		const wave = this.loader === 'wave' ? getLoadingWave(this.span(width, height), time) : undefined;
		for (let row = 0; (row + 1) * size <= height; row++) {
			for (let column = 0; column < columns; column++) {
				if (wave) {
					this.drawLoadingCell(context, atlas, wave, column, row, offsetX, width, height, time, 1);
				} else {
					this.drawLoaderCell(context, atlas, column, row, offsetX, width, height, time);
				}
			}
		}
	}

	protected prepareReveal(reveal: ITextureReveal): void {
		const { samples, fromWidth, fromHeight, continuing } = reveal.options;
		this.measure();
		// The canvas covers the band as well as the image, so that a frame can also narrow onto an image narrower than the band.
		const width = Math.max(samples.width, Math.round(fromWidth));
		this.canvas.style.width = `${width}px`;
		this.canvas.width = Math.round(width * this.pixelRatio);
		this.canvas.height = Math.round(samples.height * this.pixelRatio);
		this.overlay = this.canvas.ownerDocument.createElement('canvas');
		this.overlay.width = this.canvas.width;
		this.overlay.height = this.canvas.height;
		// Derive every stage of the image up front, including its palette, which the atlases need.
		this.imagePalette = samples.palette;
		this.atlases.clear();
		samples.cells(this.cellSize);
		samples.cells(this.cellSize / 2);
		samples.paletteIndices(this.cellSize / 2);
		const bandWidth = continuing ? fromWidth : samples.width;
		this.gridX = this.gridOffset(bandWidth);

		// Decoding spreads from the head of the loading wave across the band when it starts, or else from the band's middle.
		const delay = this.resizeOrder === 'together' ? 0 : resizeLength(fromWidth, samples.width);
		const openWidth = this.resizeOrder === 'width-first' && delay ? samples.width : bandWidth;
		const wave = getLoadingWave(this.span(openWidth, fromHeight), reveal.loadingTime + delay);
		const across = this.loader === 'wave' && (this.direction === 'right' || this.direction === 'left' || this.direction === 'alternate');
		const head = this.direction === 'left' || this.reverses(wave) ? openWidth - wave.head : wave.head;
		const onBand = continuing && across && head >= 0 && head <= openWidth;
		const x = onBand ? Math.min(samples.width * 0.92, Math.max(samples.width * 0.08, head)) : Math.min(samples.width, openWidth) / 2;
		const y = Math.min(samples.height, fromHeight) / 2;
		this.origin = { x, y, reach: Math.max(Math.hypot(x, y), Math.hypot(samples.width - x, y), Math.hypot(x, samples.height - y), Math.hypot(samples.width - x, samples.height - y)) + 40 };
	}

	protected paintReveal(reveal: ITextureReveal, time: number): ITextureFrame {
		const { samples } = reveal.options;
		const context = this.canvas.getContext('2d');
		const overlay = this.overlay?.getContext('2d');
		const coarse = this.atlas(this.cellSize);
		const fine = this.atlas(this.cellSize / 2);
		if (!context || !overlay || !coarse || !fine) {
			return { width: samples.width, height: samples.height, imageOpacity: 1, textureOpacity: 0 };
		}
		context.clearRect(0, 0, this.canvas.width, this.canvas.height);
		overlay.clearRect(0, 0, this.canvas.width, this.canvas.height);
		this.overlayUsed = false;
		const frame = reveal.transition === 'ascii-decode'
			? this.paintDecode(reveal, time, context, overlay, coarse, fine)
			: this.paintResolve(reveal, time, context, overlay, coarse, fine);
		if (this.overlayUsed && this.overlay) {
			// The glyph masks take on the image's true colors wherever they were drawn.
			overlay.globalAlpha = 1;
			overlay.globalCompositeOperation = 'source-in';
			overlay.drawImage(reveal.options.image, 0, 0, Math.round(samples.width * this.pixelRatio), Math.round(samples.height * this.pixelRatio));
			overlay.globalCompositeOperation = 'source-over';
			context.drawImage(this.overlay, 0, 0);
		}
		return frame;
	}

	private paintResolve(reveal: ITextureReveal, time: number, context: CanvasRenderingContext2D, overlay: CanvasRenderingContext2D, coarse: IGlyphAtlas, fine: IGlyphAtlas): ITextureFrame {
		const { samples, fromWidth } = reveal.options;
		const { width, height } = samples;
		const size = this.cellSize;
		const from = Math.min(height, reveal.options.fromHeight);
		const { width: frameWidth, height: frameHeight, delay: resize } = this.frame(reveal, time, openLength, easeInOutCubic);
		// The passes wait for the frame to open, and for its width to change when that happens on its own.
		const opening = time - resize;
		const loadingTime = reveal.loadingTime + time;
		const loading = this.loader === 'wave' ? steerLoadingWave(reveal, this.span(frameWidth, frameHeight), time, resize + openLength, 1 / passLength) : undefined;

		// Passes sweep the open frame one after another, and each leaves a sharper drawing of the image in its tail.
		const span = this.span(width, height);
		const firstSeed = Math.floor(reveal.loadingTime / wavePeriod) + 1;
		const waves = this.passWaves;
		waves.length = 0;
		for (let pass = 0; pass < this.passes && opening >= openLength + pass * passGap; pass++) {
			waves.push(placeWave((opening - openLength - pass * passGap) / passLength, span, firstSeed + pass, span * 0.5));
		}
		const lastPass = this.passes - 1;
		const delay = lastPass * passGap;
		const offsetX = this.gridX;
		const imageColumns = Math.floor((width - offsetX) / size);
		const columns = Math.ceil((frameWidth - offsetX) / size);
		const times = this.stageTimes;
		for (let row = 0; row * size < frameHeight; row++) {
			const y = row * size + size / 2;
			for (let column = 0; column < columns; column++) {
				const x = offsetX + column * size + size / 2;
				// Columns beyond an image narrower than the band keep loading until the frame closes in on them.
				if (column >= imageColumns) {
					if (frameWidth > width + 0.5) {
						this.drawBandCell(context, coarse, loading, column, row, offsetX, fromWidth, from, frameWidth, frameHeight, loadingTime, 1);
					}
					continue;
				}
				let glow = loading ? this.glow(loading, this.along(loading, x, y, frameWidth, frameHeight), x, y, frameHeight, loadingTime) : 0;
				// The latest pass whose wave has gone by draws the cell, unless a later wave is passing over it.
				let look = -1;
				let along = 0;
				for (let pass = waves.length - 1; pass >= 0; pass--) {
					const wave = waves[pass];
					const position = this.along(wave, x, y, width, height);
					const passGlow = this.glow(wave, position, x, y, height, loadingTime);
					if (wave.head - position >= wave.tail * (0.3 + 0.12 * hash(column, row, 24)) && passGlow <= 0.55) {
						look = pass;
						along = position / span;
						break;
					}
					glow = Math.max(glow, passGlow);
				}
				if (look === lastPass) {
					const jitter = hash(column, row, 24);
					times[0] = delay + 2300 + 700 * (0.6 * along + 0.4 * jitter);
					times[1] = delay + 2950 + 600 * (0.5 * along + 0.5 * jitter);
					times[2] = delay + 3450 + 500 * (0.5 * along + 0.5 * jitter);
					const stage = stageAt(opening, times);
					const flashing = stage > 0 && flash(opening - times[stage - 1], 110) > 0;
					this.drawImageCell(context, overlay, coarse, fine, samples, column, row, offsetX, stage, flashing, stage >= 3 ? smoothstep(times[2], times[2] + 250, opening) : 0);
				} else if (glow > waveThreshold) {
					this.drawWaveGlyph(context, coarse, glow, x - size / 2, y - size / 2);
				} else if (look >= 0) {
					const packed = this.passGlyph(samples, column, row, look);
					this.draw(context, coarse, packed >> 5, packed & 31, x - size / 2, y - size / 2);
				} else if (loading || this.loader !== 'wave') {
					this.drawBandCell(context, coarse, loading, column, row, offsetX, fromWidth, from, frameWidth, frameHeight, loadingTime, 1);
				} else {
					this.drawLoadingCell(context, coarse, waves[0], column, row, offsetX, width, height, loadingTime, 1);
				}
			}
		}
		return { width: frameWidth, height: frameHeight, imageOpacity: smoothstep(delay + 4000, delay + 4400, opening), textureOpacity: 1 - smoothstep(delay + 4100, delay + 4500, opening) };
	}

	private paintDecode(reveal: ITextureReveal, time: number, context: CanvasRenderingContext2D, overlay: CanvasRenderingContext2D, coarse: IGlyphAtlas, fine: IGlyphAtlas): ITextureFrame {
		const { samples, continuing, fromWidth } = reveal.options;
		const { width, height } = samples;
		const size = this.cellSize;
		const half = size / 2;
		const from = Math.min(height, reveal.options.fromHeight);
		const { width: frameWidth, height: frameHeight, delay } = this.frame(reveal, time, 1100, easeOutCubic);
		// Decoding waits for the frame's width to change when that happens on its own.
		const opening = time - delay;
		const loadingTime = reveal.loadingTime + time;
		const loading = this.loader === 'wave' && continuing && opening < 420 ? getLoadingWave(this.span(frameWidth, from), loadingTime) : undefined;
		const gain = 1 - smoothstep(0, 420, opening);
		const { x: originX, y: originY, reach } = this.origin;
		const offsetX = this.gridX;
		const imageColumns = Math.floor((width - offsetX) / size);
		const columns = Math.ceil((frameWidth - offsetX) / size);
		const times = this.stageTimes;
		const step = Math.floor(time / 70);
		for (let row = 0; row * size < frameHeight; row++) {
			const y = row * size + size / 2;
			for (let column = 0; column < columns; column++) {
				const x = offsetX + column * size + size / 2;
				const along = Math.hypot(x - originX, y - originY) / reach;
				if (column >= imageColumns || opening < 60 + along * 650) {
					if (column >= imageColumns && frameWidth <= width + 0.5) {
						continue;
					}
					if (this.loader === 'wave') {
						this.drawLoadingCell(context, coarse, loading, column, row, offsetX, frameWidth, from, loadingTime, gain);
					} else {
						this.drawLoaderCell(context, coarse, column, row, offsetX, fromWidth, from, loadingTime);
					}
					continue;
				}
				const jitter = hash(column, row, 25);
				const lock = 420 + along * 1500 + 280 * jitter;
				if (opening < lock) {
					this.drawScramble(context, coarse, column, row, step, x - half, y - half);
					continue;
				}
				times[0] = 2150 + along * 900 + 200 * jitter;
				times[1] = 2950 + along * 700 + 150 * jitter;
				times[2] = 3350 + along * 650 + 150 * jitter;
				const stage = stageAt(opening, times);
				if (stage === 1 && opening < times[0] + 90) {
					// Each cell decodes again, as four finer glyphs.
					for (let part = 0; part < 4; part++) {
						this.drawScramble(context, fine, column * 2 + (part & 1), row * 2 + (part >> 1), step, x - half + (part & 1) * half, y - half + (part >> 1) * half);
					}
					continue;
				}
				const flashing = stage === 0 ? opening - lock < 140 : flash(opening - times[stage - 1] - (stage === 1 ? 90 : 0), 110) > 0;
				this.drawImageCell(context, overlay, coarse, fine, samples, column, row, offsetX, stage, flashing, stage >= 3 ? smoothstep(times[2], times[2] + 250, opening) : 0);
			}
		}
		return { width: frameWidth, height: frameHeight, imageOpacity: smoothstep(4050, 4450, opening), textureOpacity: 1 - smoothstep(4150, 4600, opening) };
	}

	/**
	 * Returns the size of a reveal's frame `time` virtual milliseconds in, as it changes from the
	 * band's size to the image's in the selected order, and the milliseconds that the rest of the
	 * reveal is delayed while the frame's width changes on its own. The height opens over
	 * `heightLength` milliseconds along `heightEase`.
	 */
	private frame(reveal: ITextureReveal, time: number, heightLength: number, heightEase: (value: number) => number): { width: number; height: number; delay: number } {
		const { samples, fromWidth } = reveal.options;
		const from = Math.min(samples.height, reveal.options.fromHeight);
		const resize = this.resizeOrder === 'together' ? 0 : resizeLength(fromWidth, samples.width);
		let widened: number;
		let opened: number;
		switch (this.resizeOrder) {
			case 'together':
				widened = opened = heightEase(time / heightLength);
				break;
			case 'height-first':
				opened = heightEase(time / heightLength);
				widened = resize ? easeInOutCubic((time - heightLength) / resize) : 1;
				break;
			default:
				widened = resize ? easeInOutCubic(time / resize) : 1;
				opened = heightEase((time - resize) / heightLength);
		}
		return { width: fromWidth + (samples.width - fromWidth) * widened, height: from + (samples.height - from) * opened, delay: resize };
	}

	/**
	 * Draws a cell of a reveal that is still loading. The wave keeps to the frame, which it is
	 * steered across, and the other loaders keep to the band, so that none of their glyphs move as
	 * the frame opens around them.
	 */
	private drawBandCell(context: CanvasRenderingContext2D, atlas: IGlyphAtlas, wave: ILoadingWave | undefined, column: number, row: number, offsetX: number, bandWidth: number, bandHeight: number, frameWidth: number, frameHeight: number, time: number, gain: number): void {
		if (this.loader === 'wave') {
			this.drawLoadingCell(context, atlas, wave, column, row, offsetX, frameWidth, frameHeight, time, gain);
		} else {
			this.drawLoaderCell(context, atlas, column, row, offsetX, bandWidth, bandHeight, time);
		}
	}

	/**
	 * Draws a cell that shows the image: coarse glyphs at stage 0, then finer glyphs in the field's
	 * tones (1), in the image's palette (2), and in its true colors (3), which fade in by `colorAlpha`.
	 */
	private drawImageCell(context: CanvasRenderingContext2D, overlay: CanvasRenderingContext2D, coarse: IGlyphAtlas, fine: IGlyphAtlas, samples: ImageSamples, column: number, row: number, offsetX: number, stage: number, flashing: boolean, colorAlpha: number): void {
		const size = this.cellSize;
		const x = offsetX + column * size;
		const y = row * size;
		if (stage === 0) {
			const cells = samples.cells(size);
			const packed = this.imageGlyph(cells[Math.min(cells.length - 1, row * samples.columns(size) + column)], column, row);
			this.draw(context, coarse, packed >> 5, flashing ? flashTone(packed) : packed & 31, x, y);
			return;
		}
		const half = size / 2;
		const cells = samples.cells(half);
		const indices = samples.paletteIndices(half);
		const columns = samples.columns(half);
		for (let part = 0; part < 4; part++) {
			const fineColumn = column * 2 + (part & 1);
			const fineRow = row * 2 + (part >> 1);
			const index = Math.min(cells.length - 1, fineRow * columns + fineColumn);
			const packed = this.imageGlyph(cells[index], fineColumn, fineRow);
			const fineX = x + (part & 1) * half;
			const fineY = y + (part >> 1) * half;
			// Once a glyph is fully in its true colors, the palette glyph beneath it no longer shows.
			if (colorAlpha < 1) {
				this.draw(context, fine, packed >> 5, flashing ? flashTone(packed) : stage >= 2 ? firstPaletteTone + indices[index] : packed & 31, fineX, fineY);
			}
			if (colorAlpha > 0) {
				overlay.globalAlpha = colorAlpha;
				this.draw(overlay, fine, packed >> 5, maskTone, fineX, fineY);
				this.overlayUsed = true;
			}
		}
	}

	/**
	 * Draws a cell of the wave loader in an area `width` × `height` pixels: a binary digit that
	 * drifts with the field's swells and stays lit in the wave's wake, or the wave in denser glyphs.
	 */
	private drawLoadingCell(context: CanvasRenderingContext2D, atlas: IGlyphAtlas, wave: ILoadingWave | undefined, column: number, row: number, offsetX: number, width: number, height: number, time: number, gain: number): void {
		const size = this.cellSize;
		const x = offsetX + column * size;
		const y = row * size;
		const along = wave ? this.along(wave, x + size / 2, y + size / 2, width, height) : 0;
		const glow = wave ? this.glow(wave, along, x + size / 2, y + size / 2, height, time) * gain : 0;
		if (glow > waveThreshold) {
			this.drawWaveGlyph(context, atlas, glow, x, y);
			return;
		}
		const behind = wave ? wave.head - along : -1;
		const wake = wave && behind >= 0 && behind < wave.tail * wakeLength ? (1 - behind / (wave.tail * wakeLength)) * gain : 0;
		// Digits shimmer in the wake by brightness alone, so that every row still spells the greeting.
		const shimmer = wave && behind >= 0 && behind < wave.tail * 1.2 ? Math.floor(time / 170 + hash(column, row, 5) * 9) & 1 : 0;
		const level = Math.max(this.baseLevel(x, y, time), 3.6 * wake, 3.2 * twinkle(column, row, time)) - shimmer;
		const packed = this.digit(this.bit(column, row), level);
		this.draw(context, atlas, packed >> 5, packed & 31, x, y);
	}

	/** Draws a cell of a loader other than the wave, in an area `width` × `height` pixels. */
	private drawLoaderCell(context: CanvasRenderingContext2D, atlas: IGlyphAtlas, column: number, row: number, offsetX: number, width: number, height: number, time: number): void {
		const size = this.cellSize;
		const packed = this.loaderGlyph(column, row, offsetX + column * size + size / 2, row * size + size / 2, width, height, time);
		if (packed >= 0) {
			this.draw(context, atlas, packed >> 5, packed & 31, offsetX + column * size, row * size);
		}
	}

	/**
	 * Returns the glyph and tone, packed as glyph × 32 + tone, that a loader other than the wave
	 * paints in the cell centered on `x`, `y` of an area `width` × `height` pixels, or -1 for none.
	 */
	private loaderGlyph(column: number, row: number, x: number, y: number, width: number, height: number, time: number): number {
		switch (this.loader) {
			case 'comets': return this.cometGlyph(column, row, x, y, width, height, time);
			case 'stream': return this.streamGlyph(column, row, x, y, width, time);
			case 'ripples': return this.rippleGlyph(column, row, x, y, width, height, time);
			case 'typewriter': return this.typewriterGlyph(column, row, x, y, width, height, time);
			case 'tide': return this.tideGlyph(column, row, x, y, width, height, time);
			default: return this.digit(this.bit(column, row), Math.max(this.baseLevel(x, y, time), 3.2 * twinkle(column, row, time)));
		}
	}

	/**
	 * Comets: short, bright streaks of glyphs race along lanes, each at its own speed and with its
	 * own gap, and leave a brief wake of lit digits. Lanes run down columns when they fall.
	 */
	private cometGlyph(column: number, row: number, x: number, y: number, width: number, height: number, time: number): number {
		const size = this.cellSize;
		let lane: number;
		let along: number;
		let span: number;
		switch (this.direction) {
			case 'down':
			case 'up':
				lane = column;
				along = this.direction === 'down' ? y : height - y;
				span = height;
				break;
			case 'diagonal':
				// Lanes slant down to the right, a column per row.
				lane = column - row;
				along = y;
				span = height;
				break;
			case 'outward':
				lane = row * 2 + (x < width / 2 ? 0 : 1);
				along = Math.abs(x - width / 2);
				span = width / 2;
				break;
			default:
				lane = row;
				along = this.direction === 'left' || (this.direction === 'alternate' && (row & 1) === 1) ? width - x : x;
				span = width;
		}
		const falling = span === height && this.direction !== 'outward';
		const speed = falling ? 0.025 + 0.025 * hash(lane, 1, 31) : 0.08 + 0.09 * hash(lane, 1, 31);
		const tail = size * (falling ? 2 + 2 * hash(lane, 1, 32) : 3 + 5 * hash(lane, 1, 32));
		const cycle = span + tail + span * (falling ? 1.5 + 6 * hash(lane, 1, 33) : 0.15 + 0.75 * hash(lane, 1, 33));
		const head = (time * speed + hash(lane, 1, 34) * cycle) % cycle;
		const behind = head - along;
		const glow = behind >= 0 && behind < tail ? (1 - behind / tail) ** 1.4 : 0;
		if (glow > waveThreshold) {
			return this.crest(glow);
		}
		const wake = behind >= 0 && behind < tail * 3 ? 1 - behind / (tail * 3) : 0;
		return this.digit(this.bit(column, row), Math.max(this.baseLevel(x, y, time), 3.4 * wake, 3.2 * twinkle(column, row, time)));
	}

	/**
	 * Bit Stream: every row shifts the greeting's bits along a digit at a time, each at its own
	 * tempo, like data on a bus. Every few bytes one is lit, so its character can be seen passing.
	 */
	private streamGlyph(column: number, row: number, x: number, y: number, width: number, time: number): number {
		let forward: boolean;
		switch (this.direction) {
			case 'left':
			case 'up':
				forward = false;
				break;
			case 'alternate':
				forward = (row & 1) === 0;
				break;
			case 'outward':
				forward = x >= width / 2;
				break;
			default:
				forward = true;
		}
		// Rows that move together, diagonally or vertically, march in step and stagger into slants.
		const together = this.direction === 'diagonal' || this.direction === 'down' || this.direction === 'up';
		const tick = together ? 150 : 70 + 170 * hash(row, 2, 41);
		const shift = Math.floor((time + (together ? row * 45 : hash(row, 2, 42) * tick)) / tick);
		const index = (forward ? column - shift : column + shift) + Math.floor(hash(row, 0, 9) * imageGenerationFieldMessage.length) * 8;
		const bit = messageBits[mod(index, messageBits.length)] === '1' ? 1 : 0;
		if (mod(Math.floor(index / 8), 3 + Math.floor(hash(row, 2, 43) * 3)) === 0) {
			// The leading bit of a lit byte burns brightest.
			return bit * 32 + (mod(index, 8) === (forward ? 7 : 0) ? hotTone : binaryTones + 4);
		}
		return this.digit(bit, this.baseLevel(x, y, time));
	}

	/**
	 * Ripples: a drop lands every so often, and its ring of glyphs spreads and fades, lighting the
	 * digits inside it. Drops step across the band in the direction of travel, or land at random.
	 */
	private rippleGlyph(column: number, row: number, x: number, y: number, width: number, height: number, time: number): number {
		const size = this.cellSize;
		const last = Math.floor(time / rippleInterval);
		let glow = 0;
		let wake = 0;
		for (let drop = last; drop > last - Math.ceil(rippleLife / rippleInterval) - 1; drop--) {
			const age = time - (drop + 0.6 * hash(drop, 3, 51)) * rippleInterval;
			if (age < 0 || age >= rippleLife) {
				continue;
			}
			const point = this.dropPoint(drop, width, height);
			const distance = Math.hypot(x - point.x, y - point.y);
			const radius = age * rippleSpeed;
			const fade = (1 - age / rippleLife) ** 1.3;
			const ring = 1 - Math.abs(distance - radius) / (size * 1.3);
			if (ring > 0) {
				glow = Math.max(glow, ring * fade);
			}
			const inside = radius - distance;
			if (inside > 0 && inside < size * 8) {
				wake = Math.max(wake, fade * (1 - inside / (size * 8)));
			}
		}
		if (glow > waveThreshold) {
			return this.crest(glow);
		}
		return this.digit(this.bit(column, row), Math.max(this.baseLevel(x, y, time), 3.4 * wake, 3.2 * twinkle(column, row, time)));
	}

	private dropPoint(drop: number, width: number, height: number): { x: number; y: number } {
		const jitter = hash(drop, 4, 52);
		const step = mod(drop * 0.27, 2);
		let across: number;
		switch (this.direction) {
			case 'outward':
				return { x: width / 2, y: height / 2 };
			case 'right':
			case 'diagonal':
				across = mod(step + 0.1 * jitter, 1);
				break;
			case 'left':
				across = 1 - mod(step + 0.1 * jitter, 1);
				break;
			case 'alternate':
				across = step < 1 ? step : 2 - step;
				break;
			default:
				across = jitter;
		}
		const down = this.direction === 'diagonal' ? mod(drop * 0.41, 1) : hash(drop, 4, 53);
		return { x: across * width, y: down * height };
	}

	/**
	 * Typewriter: the greeting's bits are typed out behind a cursor, a line of whole bytes at a time
	 * so that every line decodes, and the lines scroll as a terminal's do. Cells beyond the lines,
	 * and beyond the band once the frame opens around it, hold faint digits.
	 */
	private typewriterGlyph(column: number, row: number, x: number, y: number, width: number, height: number, time: number): number {
		const columns = Math.floor(width / this.cellSize);
		const rows = Math.max(1, Math.floor(height / this.cellSize));
		const lineBits = Math.max(8, Math.floor(columns / 8) * 8);
		const lineTime = lineBits * typeInterval + linePause;
		const line = Math.floor(time / lineTime);
		const typed = Math.floor((time - line * lineTime) / typeInterval);
		// The newest line is at the bottom, or at the top when lines scroll down.
		const age = this.direction === 'up' ? row : rows - 1 - row;
		const position = this.direction === 'left' ? columns - 1 - column : column;
		if (age < 0 || age >= rows || position < 0 || position >= lineBits) {
			return this.digit(this.bit(column, row), this.baseLevel(x, y, time) * 0.6);
		}
		if (age === 0 && position > typed) {
			return -1;
		}
		if (age === 0 && position === typed) {
			return cursorGlyph * 32 + hotTone;
		}
		const bit = messageBits[mod((line - age) * lineBits + position, messageBits.length)] === '1' ? 1 : 0;
		const fresh = age === 0 ? Math.max(0, 1 - (typed - position) / 12) : 0;
		return this.digit(bit, Math.max(this.baseLevel(x, y, time) * (1 - 0.12 * age), 3.6 * fresh));
	}

	/**
	 * Tide: broad, soft swells of brighter digits roll through the band in the direction of travel,
	 * or slosh back and forth when it alternates, and a few glyphs sparkle along their crests.
	 */
	private tideGlyph(column: number, row: number, x: number, y: number, width: number, height: number, time: number): number {
		const along = this.position(x, y, width, height, false);
		const wavelength = Math.max(this.cellSize * 12, this.span(width, height) * 0.55);
		const drift = this.direction === 'alternate' ? 0.6 * Math.sin(time / 2200) : time / 3600;
		const crest = (0.5 + 0.5 * Math.cos(2 * Math.PI * (along / wavelength - drift))) ** 2.5;
		const intensity = crest * (0.7 + 0.3 * swell(x, y, time));
		if (intensity > 0.6 && hash(column, row, Math.floor(time / 240)) < (intensity - 0.6) * 1.5) {
			return this.crest(0.15 + 0.5 * intensity);
		}
		return this.digit(this.bit(column, row), Math.max(this.baseLevel(x, y, time) * 0.8, 3.6 * intensity));
	}

	/** Brightness of the digits that the field's swells lift, which `--chat-image-glyph-fill` scales. */
	private baseLevel(x: number, y: number, time: number): number {
		return 1.2 * this.fill + (1 + 2 * this.fill) * swell(x, y, time);
	}

	/** Packs a digit at a brightness level, which steps through the binary tones from 0 up. */
	private digit(bit: number, level: number): number {
		return bit * 32 + Math.max(0, Math.min(binaryTones - 1, Math.floor(level)));
	}

	/** Packs the crest glyph that a wave of brightness `glow`, from 0 to 1, draws. */
	private crest(glow: number): number {
		const level = Math.min(crestLevels - 1, Math.floor(glow * 6.2));
		return (firstCrestGlyph + level) * 32 + (glow > 0.85 ? hotTone : binaryTones + level);
	}

	private drawWaveGlyph(context: CanvasRenderingContext2D, atlas: IGlyphAtlas, glow: number, x: number, y: number): void {
		const packed = this.crest(glow);
		this.draw(context, atlas, packed >> 5, packed & 31, x, y);
	}

	private drawScramble(context: CanvasRenderingContext2D, atlas: IGlyphAtlas, column: number, row: number, step: number, x: number, y: number): void {
		const glyph = hash(column, row, step) < 0.3
			? this.bit(column, row) ^ (step & 1)
			: firstScrambleGlyph + Math.floor(hash(column, row, step + 7919) * (glyphs.length - firstScrambleGlyph));
		this.draw(context, atlas, glyph, scrambleTone, x, y);
	}

	/** Centers a band's columns; a reveal keeps the band's grid so that its glyphs stay in place. */
	private gridOffset(width: number): number {
		return (width - Math.floor(width / this.cellSize) * this.cellSize) / 2;
	}

	/** Whether a wave sweeps backward: every other one does when waves alternate. */
	private reverses(wave: ILoadingWave): boolean {
		return this.direction === 'alternate' && (wave.seed & 1) === 1;
	}

	/** Length of the path that a wave travels across an area of `width` × `height` pixels. */
	private span(width: number, height: number): number {
		switch (this.direction) {
			case 'down':
			case 'up':
				return height;
			case 'diagonal':
				return width + height;
			case 'outward':
				return Math.hypot(width, height) / 2;
			default:
				return width;
		}
	}

	/** How far along its path a wave reaches a point of an area of `width` × `height` pixels. */
	private along(wave: ILoadingWave, x: number, y: number, width: number, height: number): number {
		return this.position(x, y, width, height, this.reverses(wave));
	}

	/** How far along the direction of travel a point of an area of `width` × `height` pixels is. */
	private position(x: number, y: number, width: number, height: number, reversed: boolean): number {
		let along: number;
		switch (this.direction) {
			case 'left': along = width - x; break;
			case 'down': along = y; break;
			case 'up': along = height - y; break;
			case 'diagonal': along = x + y; break;
			case 'outward': along = Math.hypot(x - width / 2, y - height / 2); break;
			default: along = x;
		}
		return reversed ? this.span(width, height) - along : along;
	}

	/**
	 * Brightness of a wave at a point `along` its path and `y` pixels down an area `height` pixels
	 * tall, with the same texture as the loading band. Glyph waves are fuller than the shared
	 * profile so that they fill the band from edge to edge, and waves that sweep down or up fill
	 * every row alike.
	 */
	private glow(wave: ILoadingWave, along: number, x: number, y: number, height: number, time: number): number {
		const profile = this.direction === 'down' || this.direction === 'up' ? (y >= 0 && y < height ? 1 : 0) : bandProfile(y, height);
		return profile > 0 ? waveIntensity(wave, along) ** 0.75 * (0.7 + 0.3 * waveRipple(wave, x, y, time)) * (0.4 + 0.6 * profile) : 0;
	}

	/**
	 * Returns the glyph and tone, packed as glyph × 32 + tone, that a pass before the last draws in
	 * a cell: the image's brightness in fewer levels and dimmer tones, which each pass adds to, and
	 * crest glyphs in only some of its bright cells, which each pass fills in more of.
	 */
	private passGlyph(samples: ImageSamples, column: number, row: number, pass: number): number {
		const size = this.cellSize;
		const cells = samples.cells(size);
		const brightness = cells[Math.min(cells.length - 1, row * samples.columns(size) + column)];
		const share = (pass + 1) / this.passes;
		// The same cells stay drawn from one pass to the next, so that the drawing only ever fills in.
		if (brightness < crestStart || hash(column, row, 40) > 0.35 + 0.65 * share) {
			return this.digit(this.bit(column, row), Math.min(brightness, crestStart * 0.99) / crestStart * binaryTones);
		}
		const levels = Math.max(2, Math.round(crestLevels * share));
		const level = Math.min(levels - 1, Math.floor((brightness - crestStart) / (1 - crestStart) * levels));
		const crest = Math.round(level * (crestLevels - 1) / (levels - 1));
		return (firstCrestGlyph + crest) * 32 + binaryTones + Math.max(0, crest - (this.passes - 1 - pass));
	}

	private bit(column: number, row: number): number {
		return getGlyphMessageBit(column, row);
	}

	/** Returns the glyph and tone, packed as glyph × 32 + tone, that draw an image's brightness in a cell. */
	private imageGlyph(brightness: number, column: number, row: number): number {
		if (brightness >= crestStart) {
			const level = Math.min(crestLevels - 1, Math.floor((brightness - crestStart) / (1 - crestStart) * crestLevels));
			// The drawing reads a step brighter than the loading field, so the image stands out.
			return (firstCrestGlyph + level) * 32 + binaryTones + Math.min(crestLevels - 1, level + 1);
		}
		return this.bit(column, row) * 32 + Math.min(binaryTones - 1, Math.floor(brightness / crestStart * binaryTones));
	}

	private draw(context: CanvasRenderingContext2D, atlas: IGlyphAtlas, glyph: number, tone: number, x: number, y: number): void {
		context.drawImage(atlas.canvas, glyph * atlas.cell, tone * atlas.cell, atlas.cell, atlas.cell, Math.round(x * this.pixelRatio), Math.round(y * this.pixelRatio), atlas.cell, atlas.cell);
	}

	/** Returns the atlas of every glyph in every tone for cells of `size` CSS pixels. */
	private atlas(size: number): IGlyphAtlas | undefined {
		let atlas = this.atlases.get(size);
		if (!atlas) {
			const cell = Math.max(1, Math.round(size * this.pixelRatio));
			const colors = this.toneColors();
			const canvas = this.canvas.ownerDocument.createElement('canvas');
			canvas.width = cell * glyphs.length;
			canvas.height = cell * colors.length;
			const context = canvas.getContext('2d');
			if (!context) {
				return undefined;
			}
			// Glyphs are as tall as a cell is wide, so that rows pack like lines of text.
			context.font = `${Math.max(1, Math.round(size * this.pixelRatio))}px ${this.fontFamily}`;
			context.textAlign = 'center';
			context.textBaseline = 'middle';
			colors.forEach((color, tone) => {
				context.fillStyle = color;
				glyphs.forEach((glyph, index) => {
					// Clip each glyph to its own cell so that wide glyphs never bleed into their neighbors.
					context.save();
					context.beginPath();
					context.rect(index * cell, tone * cell, cell, cell);
					context.clip();
					context.fillText(glyph, index * cell + cell / 2, tone * cell + cell / 2);
					context.restore();
				});
			});
			atlas = { canvas, cell };
			this.atlases.set(size, atlas);
		}
		return atlas;
	}

	private toneColors(): string[] {
		const theme = this.themeService.getColorTheme();
		const text = theme.getColor(foreground) ?? Color.white;
		const [red, green, blue] = this.palette.accent;
		const colors = [...getImageGenerationFieldToneColors(theme), text.transparent(0.95).toString(), `rgba(${red}, ${green}, ${blue}, 0.6)`, '#fff'];
		const palette = this.imagePalette ?? new Float32Array(0);
		for (let color = 0; color < palette.length; color += 3) {
			colors.push(`rgb(${Math.round(palette[color])}, ${Math.round(palette[color + 1])}, ${Math.round(palette[color + 2])})`);
		}
		return colors;
	}
}

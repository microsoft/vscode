/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Color } from '../../../../../base/common/color.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { descriptionForeground, focusBorder, foreground } from '../../../../../platform/theme/common/colorRegistry.js';
import { isHighContrast } from '../../../../../platform/theme/common/theme.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { bandProfile, clamp01, easeInOutCubic, flash, getLoadingWave, hash, ILoadingWave, ImageSamples, ITextureFrame, ITextureReveal, ITextureRevealOptions, placeWave, RevealPace, smoothstep, stageAt, steerLoadingWave, twinkle, waveIntensity, wavePeriod, waveRipple } from './chatImageTextures.js';

const glyphs = ['0', '1', '·', ':', '=', '+', '*', '#'];
const firstCrestGlyph = 2;
const crestLevels = 6;
const binaryTones = 4;
const hotTone = 10;
const maskTone = 11;
const firstPaletteTone = 12;
const crestStart = 0.36;
const waveThreshold = 0.12;
const wakeLength = 1.8;
const message = 'HAPPY_CODING!';
const messageBits = [...message].map(character => character.charCodeAt(0).toString(2).padStart(8, '0')).join('');
const openLength = 900;
const passLength = 1500;

function resizeLength(fromWidth: number, toWidth: number): number {
	const change = Math.abs(toWidth - fromWidth);
	return change < 1 ? 0 : Math.min(600, 360 + change * 1.25);
}

/** Every row spells the greeting in whole 8-bit characters from its left edge. */
export function getGlyphMessageBit(column: number, row: number): number {
	const start = Math.floor(hash(row, 0, 9) * message.length) * 8;
	return messageBits[(start + column) % messageBits.length] === '1' ? 1 : 0;
}

function flashTone(packed: number): number {
	return packed >> 5 < firstCrestGlyph ? binaryTones - 1 : hotTone;
}

function swell(x: number, y: number, time: number): number {
	return 0.5 + 0.28 * Math.sin(x * 0.031 - time / 1400 + 1.6 * Math.sin(y * 0.07 + time / 2300)) + 0.22 * Math.sin(x * 0.017 + y * 0.12 + time / 1900);
}

interface IGlyphAtlas {
	readonly canvas: HTMLCanvasElement;
	readonly cell: number;
}

/** Paints the loading wave and its single-pass ASCII Resolve transition into the generated image. */
export class GlyphSurface extends Disposable {
	readonly canvas: HTMLCanvasElement;
	private readonly nextFrame = this._register(new MutableDisposable());
	private readonly atlases = new Map<number, IGlyphAtlas>();
	private active: ITextureReveal | undefined;
	private overlay: HTMLCanvasElement | undefined;
	private overlayUsed = false;
	private cellSize = 10;
	private fontFamily = 'monospace';
	private pixelRatio = 1;
	private gridX = 0;
	private imagePalette: Float32Array | undefined;
	private readonly stageTimes = new Float64Array(3);

	constructor(
		container: HTMLElement,
		@IThemeService private readonly themeService: IThemeService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
	) {
		super();
		this.canvas = dom.append(container, dom.$<HTMLCanvasElement>('canvas.chat-image-loading-glyphs', { 'aria-hidden': 'true' }));
		this._register(toDisposable(() => {
			this.active?.clock.cancel();
			this.active = undefined;
			this.overlay = undefined;
			this.imagePalette = undefined;
			this.atlases.clear();
			this.canvas.remove();
			this.canvas.width = this.canvas.height = 0;
		}));
		const resizeObserver = this._register(new dom.DisposableResizeObserver('ChatImageGlyphSurface', () => this.refresh()));
		this._register(resizeObserver.observe(this.canvas));
		this._register(themeService.onDidColorThemeChange(() => this.refresh()));
		this._register(accessibilityService.onDidChangeReducedMotion(() => this.refresh()));
	}

	getRevealLength(fromWidth: number, toWidth: number): number {
		return 4500 + resizeLength(fromWidth, toWidth);
	}

	get showingBand(): boolean {
		return !this.active && this.canvas.clientWidth > 0 && this.canvas.clientHeight > 0;
	}

	reveal(options: ITextureRevealOptions): void {
		if (this.active) {
			return;
		}
		const length = this.getRevealLength(options.fromWidth, options.samples.width);
		this.canvas.style.width = `${options.samples.width}px`;
		this.canvas.style.height = `${options.samples.height}px`;
		this.active = { options, pace: new RevealPace(length), loadingTime: Date.now() * 2, clock: this.canvas.animate([], { duration: options.duration }) };
		this.prepareReveal(this.active);
		this.update();
	}

	private refresh(): void {
		this.atlases.clear();
		this.measure();
		this.update();
	}

	private measure(): void {
		const targetWindow = dom.getWindow(this.canvas);
		const style = targetWindow.getComputedStyle(this.canvas);
		this.cellSize = Math.max(6, Math.round((parseFloat(style.fontSize) || 10) / 2) * 2);
		this.fontFamily = style.fontFamily || 'monospace';
		this.pixelRatio = targetWindow.devicePixelRatio || 1;
	}

	private update(): void {
		this.nextFrame.clear();
		const active = this.active;
		if (!this.canvas.isConnected || (!active && (!this.canvas.clientWidth || !this.canvas.clientHeight))) {
			return;
		}
		const animated = !this.accessibilityService.isMotionReduced() && !isHighContrast(this.themeService.getColorTheme().type);
		if (active) {
			const time = active.pace.virtualAt(clamp01(Number(active.clock.currentTime ?? 0) / active.options.duration) * active.pace.duration);
			const frame = this.paintReveal(active, time);
			this.canvas.style.opacity = String(frame.textureOpacity);
			active.options.onFrame(frame);
		} else {
			this.paintLoading(animated ? Date.now() * 2 : wavePeriod * 0.55);
		}
		if (animated) {
			this.nextFrame.value = dom.scheduleAtNextAnimationFrame(dom.getWindow(this.canvas), () => this.update());
		}
	}

	private paintLoading(time: number): void {
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
		const wave = getLoadingWave(width, time);
		for (let row = 0; (row + 1) * size <= height; row++) {
			for (let column = 0; column < columns; column++) {
				this.drawLoadingCell(context, atlas, wave, column, row, offsetX, height, time, 1);
			}
		}
	}

	private prepareReveal(reveal: ITextureReveal): void {
		const { samples, fromWidth, continuing } = reveal.options;
		this.measure();
		const width = Math.max(samples.width, Math.round(fromWidth));
		this.canvas.style.width = `${width}px`;
		this.canvas.width = Math.round(width * this.pixelRatio);
		this.canvas.height = Math.round(samples.height * this.pixelRatio);
		this.overlay = dom.$<HTMLCanvasElement>('canvas');
		this.overlay.width = this.canvas.width;
		this.overlay.height = this.canvas.height;
		this.imagePalette = samples.palette;
		this.atlases.clear();
		samples.cells(this.cellSize);
		samples.cells(this.cellSize / 2);
		samples.paletteIndices(this.cellSize / 2);
		this.gridX = this.gridOffset(continuing ? fromWidth : samples.width);
	}

	private paintReveal(reveal: ITextureReveal, time: number): ITextureFrame {
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
		const frame = this.paintResolve(reveal, time, context, overlay, coarse, fine);
		if (this.overlayUsed && this.overlay) {
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
		const resize = resizeLength(fromWidth, width);
		const frameWidth = fromWidth + (width - fromWidth) * (resize ? easeInOutCubic(time / resize) : 1);
		const frameHeight = from + (height - from) * easeInOutCubic((time - resize) / openLength);
		const opening = time - resize;
		const loadingTime = reveal.loadingTime + time;
		const loading = steerLoadingWave(reveal, frameWidth, time, resize + openLength, 1 / passLength);
		const seed = Math.floor(reveal.loadingTime / wavePeriod) + 1;
		const wave = opening >= openLength ? placeWave((opening - openLength) / passLength, width, seed, width * 0.5) : undefined;
		const offsetX = this.gridX;
		const imageColumns = Math.floor((width - offsetX) / size);
		const columns = Math.ceil((frameWidth - offsetX) / size);
		const times = this.stageTimes;
		for (let row = 0; row * size < frameHeight; row++) {
			const y = row * size + size / 2;
			for (let column = 0; column < columns; column++) {
				const x = offsetX + column * size + size / 2;
				if (column >= imageColumns) {
					if (frameWidth > width + 0.5) {
						this.drawLoadingCell(context, coarse, loading, column, row, offsetX, frameHeight, loadingTime, 1);
					}
					continue;
				}
				let glow = loading ? this.glow(loading, x, y, frameHeight, loadingTime) : 0;
				const passGlow = wave ? this.glow(wave, x, y, height, loadingTime) : 0;
				const drawn = wave && wave.head - x >= wave.tail * (0.3 + 0.12 * hash(column, row, 24)) && passGlow <= 0.55;
				if (drawn) {
					const along = x / width;
					const jitter = hash(column, row, 24);
					times[0] = 2300 + 700 * (0.6 * along + 0.4 * jitter);
					times[1] = 2950 + 600 * (0.5 * along + 0.5 * jitter);
					times[2] = 3450 + 500 * (0.5 * along + 0.5 * jitter);
					const stage = stageAt(opening, times);
					const flashing = stage > 0 && flash(opening - times[stage - 1], 110) > 0;
					this.drawImageCell(context, overlay, coarse, fine, samples, column, row, offsetX, stage, flashing, stage >= 3 ? smoothstep(times[2], times[2] + 250, opening) : 0);
				} else {
					glow = Math.max(glow, passGlow);
					if (glow > waveThreshold) {
						this.drawWaveGlyph(context, coarse, glow, x - size / 2, y - size / 2);
					} else {
						this.drawLoadingCell(context, coarse, loading ?? wave, column, row, offsetX, loading ? frameHeight : height, loadingTime, 1);
					}
				}
			}
		}
		return { width: frameWidth, height: frameHeight, imageOpacity: smoothstep(4000, 4400, opening), textureOpacity: 1 - smoothstep(4100, 4500, opening) };
	}

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

	private drawLoadingCell(context: CanvasRenderingContext2D, atlas: IGlyphAtlas, wave: ILoadingWave | undefined, column: number, row: number, offsetX: number, height: number, time: number, gain: number): void {
		const size = this.cellSize;
		const x = offsetX + column * size;
		const y = row * size;
		const along = x + size / 2;
		const glow = wave ? this.glow(wave, along, y + size / 2, height, time) * gain : 0;
		if (glow > waveThreshold) {
			this.drawWaveGlyph(context, atlas, glow, x, y);
			return;
		}
		const behind = wave ? wave.head - along : -1;
		const wake = wave && behind >= 0 && behind < wave.tail * wakeLength ? (1 - behind / (wave.tail * wakeLength)) * gain : 0;
		const shimmer = wave && behind >= 0 && behind < wave.tail * 1.2 ? Math.floor(time / 170 + hash(column, row, 5) * 9) & 1 : 0;
		const baseLevel = 0.6 + 2 * swell(x, y, time);
		const level = Math.max(baseLevel, 3.6 * wake, 3.2 * twinkle(column, row, time)) - shimmer;
		const tone = Math.max(0, Math.min(binaryTones - 1, Math.floor(level)));
		this.draw(context, atlas, getGlyphMessageBit(column, row), tone, x, y);
	}

	private drawWaveGlyph(context: CanvasRenderingContext2D, atlas: IGlyphAtlas, glow: number, x: number, y: number): void {
		const level = Math.min(crestLevels - 1, Math.floor(glow * 6.2));
		this.draw(context, atlas, firstCrestGlyph + level, glow > 0.85 ? hotTone : binaryTones + level, x, y);
	}

	private gridOffset(width: number): number {
		return (width - Math.floor(width / this.cellSize) * this.cellSize) / 2;
	}

	private glow(wave: ILoadingWave, x: number, y: number, height: number, time: number): number {
		const profile = bandProfile(y, height);
		return profile > 0 ? waveIntensity(wave, x) ** 0.75 * (0.7 + 0.3 * waveRipple(wave, x, y, time)) * (0.4 + 0.6 * profile) : 0;
	}

	private imageGlyph(brightness: number, column: number, row: number): number {
		if (brightness >= crestStart) {
			const level = Math.min(crestLevels - 1, Math.floor((brightness - crestStart) / (1 - crestStart) * crestLevels));
			return (firstCrestGlyph + level) * 32 + binaryTones + Math.min(crestLevels - 1, level + 1);
		}
		return getGlyphMessageBit(column, row) * 32 + Math.min(binaryTones - 1, Math.floor(brightness / crestStart * binaryTones));
	}

	private draw(context: CanvasRenderingContext2D, atlas: IGlyphAtlas, glyph: number, tone: number, x: number, y: number): void {
		context.drawImage(atlas.canvas, glyph * atlas.cell, tone * atlas.cell, atlas.cell, atlas.cell, Math.round(x * this.pixelRatio), Math.round(y * this.pixelRatio), atlas.cell, atlas.cell);
	}

	private atlas(size: number): IGlyphAtlas | undefined {
		let atlas = this.atlases.get(size);
		if (!atlas) {
			const cell = Math.max(1, Math.round(size * this.pixelRatio));
			const colors = this.toneColors();
			const canvas = dom.$<HTMLCanvasElement>('canvas');
			canvas.width = cell * glyphs.length;
			canvas.height = cell * colors.length;
			const context = canvas.getContext('2d');
			if (!context) {
				return undefined;
			}
			context.font = `${Math.max(1, Math.round(size * this.pixelRatio))}px ${this.fontFamily}`;
			context.textAlign = 'center';
			context.textBaseline = 'middle';
			colors.forEach((color, tone) => {
				context.fillStyle = color;
				glyphs.forEach((glyph, index) => {
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
		const binary = theme.getColor(descriptionForeground) ?? text;
		const accent = theme.getColor(focusBorder) ?? text;
		const highContrast = isHighContrast(theme.type);
		const colors = [
			...Array.from({ length: binaryTones }, (_, index) => highContrast ? binary.toString() : binary.transparent(0.4 * ((index + 1) / binaryTones)).toString()),
			...Array.from({ length: crestLevels }, (_, index) => {
				const strength = (index + 1) / crestLevels;
				return highContrast ? text.toString() : accent.mix(text, 0.1 + 0.4 * strength).transparent(0.35 + 0.45 * strength).toString();
			}),
			text.transparent(0.95).toString(),
			'#fff',
		];
		const palette = this.imagePalette ?? new Float32Array(0);
		for (let color = 0; color < palette.length; color += 3) {
			colors.push(`rgb(${Math.round(palette[color])}, ${Math.round(palette[color + 1])}, ${Math.round(palette[color + 2])})`);
		}
		return colors;
	}
}

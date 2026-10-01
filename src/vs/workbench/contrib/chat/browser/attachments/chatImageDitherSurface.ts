/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { acceleratedLoadingWave, bandProfile, bayer, easeInOutCubic, easeInOutSine, easeOutCubic, flash, getLoadingWave, hash, ILoadingWave, ImageSamples, ITextureFrame, ITextureReveal, placeWave, smoothstep, stageAt, steerLoadingWave, TextureSurface, twinkle, waveIntensity, waveRipple } from './chatImageTextures.js';

/** Size of a loading band cell, in CSS pixels. Every reveal stage lines up with this grid. */
const cell = 4;

/**
 * Pixel size of each stage of a reveal, all derived from the image: a blocky first impression,
 * two sharper passes, the image's own palette at two sizes, and finally its true colors.
 */
const stageSizes = [8, 4, 2, 2, 1, 1];
const firstPaletteStage = 3;
const colorStage = 5;

const lengths = new Map([
	['dither-resolve', 4700],
	['dither-print', 5000],
	['dither-bloom', 4800],
]);

function luminance(red: number, green: number, blue: number): number {
	return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
}

/**
 * Paints the Dither Wave loading band, a one-bit dithered wave sweeping over twinkling pixels, and
 * carries it on into one of three reveals of the image:
 *
 * - **Resolve**: the band opens into the frame while its wave speeds up and leaves, then a full
 *   height wave sweeps across and develops the image in its tail.
 * - **Print**: the band becomes a print head that moves down the frame and prints the image.
 * - **Bloom**: the image blooms out of the wave's head in rings.
 *
 * Once a pixel shows the image it keeps resolving: blocky, sharper, the image's own palette, and
 * its true colors, before the image itself takes over.
 */
export class DitherSurface extends TextureSurface {

	private pixels: ImageData | undefined;
	private readonly stageTimes = new Float64Array(5);
	private origin = { x: 0, y: 0, reach: 1 };

	constructor(
		container: HTMLElement,
		@IThemeService themeService: IThemeService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
	) {
		super(container, 'chat-image-loading-dither', themeService, accessibilityService);
	}

	lengthOf(transition: string): number | undefined {
		return lengths.get(transition);
	}

	protected paintLoading(time: number): void {
		const width = this.canvas.clientWidth;
		const height = this.canvas.clientHeight;
		const columns = Math.ceil(width / cell);
		const rows = Math.ceil(height / cell);
		if (this.canvas.width !== columns || this.canvas.height !== rows) {
			this.canvas.width = columns;
			this.canvas.height = rows;
		}
		const context = this.canvas.getContext('2d');
		if (!context) {
			return;
		}
		const pixels = context.createImageData(columns, rows);
		const wave = getLoadingWave(width, time);
		for (let row = 0; row < rows; row++) {
			const y = row * cell + cell / 2;
			const profile = bandProfile(y, height);
			for (let column = 0; column < columns; column++) {
				const x = column * cell + cell / 2;
				const glow = waveIntensity(wave, x) * (0.7 + 0.3 * waveRipple(wave, x, y, time)) * profile;
				const offset = (row * columns + column) * 4;
				if (glow * 16 > bayer[(row & 3) * 4 + (column & 3)] + 0.5) {
					this.put(pixels.data, offset, glow > 0.8 ? this.palette.hot : this.palette.accent, 0.45 + 0.55 * glow);
				} else {
					const sparkle = twinkle(column, row, time);
					if (sparkle > 0.05) {
						this.put(pixels.data, offset, this.palette.accent, 0.32 * sparkle);
					}
				}
			}
		}
		context.putImageData(pixels, 0, 0);
	}

	protected prepareReveal(reveal: ITextureReveal): void {
		const { width, height } = reveal.options.samples;
		this.canvas.width = width;
		this.canvas.height = height;
		this.pixels = this.canvas.getContext('2d')?.createImageData(width, height);
		// Derive every stage of the image up front, so that no stage stalls a frame when it first appears.
		const { samples } = reveal.options;
		for (const size of new Set(stageSizes)) {
			samples.cells(size);
		}
		samples.paletteIndices(2);
		samples.paletteIndices(1);

		// Bloom grows from the head of the loading wave, or from the top middle when there was no band to continue.
		const wave = getLoadingWave(width, reveal.loadingTime);
		const onBand = reveal.options.continuing && wave.head >= 0 && wave.head <= width;
		const x = onBand ? Math.min(width * 0.92, Math.max(width * 0.08, wave.head)) : width / 2;
		const y = Math.min(height, reveal.options.fromHeight) / 2;
		// Reach past the farthest corner, so that every ring fully passes it.
		this.origin = { x, y, reach: Math.max(Math.hypot(x, y), Math.hypot(width - x, y), Math.hypot(x, height - y), Math.hypot(width - x, height - y)) + 40 };
	}

	protected paintReveal(reveal: ITextureReveal, time: number): ITextureFrame {
		const context = this.canvas.getContext('2d');
		if (!context || !this.pixels) {
			return { height: reveal.options.samples.height, imageOpacity: 1, textureOpacity: 0 };
		}
		this.pixels.data.fill(0);
		const frame = reveal.transition === 'dither-print' ? this.paintPrint(reveal, time)
			: reveal.transition === 'dither-bloom' ? this.paintBloom(reveal, time)
				: this.paintResolve(reveal, time);
		context.putImageData(this.pixels, 0, 0);
		return frame;
	}

	private paintResolve(reveal: ITextureReveal, time: number): ITextureFrame {
		const { samples } = reveal.options;
		const { width, height } = samples;
		const from = Math.min(height, reveal.options.fromHeight);
		const frameHeight = from + (height - from) * easeInOutCubic(time / 900);
		const loadingTime = reveal.loadingTime + time;
		const loading = steerLoadingWave(reveal, width, time, 900, 1 / 1500);
		const develop = time >= 900 ? placeWave((time - 900) / 1500, width, 1, width * 0.5) : undefined;
		const edge = 0.6 * smoothstep(0, 150, time) * (1 - smoothstep(700, 950, time));
		const columns = Math.ceil(width / cell);
		const times = this.stageTimes;
		for (let row = 0; row * cell < frameHeight; row++) {
			const y = row * cell + cell / 2;
			const aboveEdge = frameHeight - y;
			const edgeGlow = aboveEdge >= 0 && aboveEdge < 14 ? edge * (1 - aboveEdge / 14) ** 2 : 0;
			for (let column = 0; column < columns; column++) {
				const x = column * cell + cell / 2;
				const across = x / width;
				const jitter = hash(column, row, 21);
				let glow = Math.max(edgeGlow, this.glow(loading, x, y, frameHeight, loadingTime));
				let stage = -1;
				let heat = 0;
				if (develop) {
					glow = Math.max(glow, this.glow(develop, x, y, height, loadingTime));
					// The image appears in the tail of the wave that sweeps across the open frame.
					if (develop.head - x >= develop.tail * (0.3 + 0.12 * jitter)) {
						times[0] = 2100 + 700 * (0.6 * across + 0.4 * jitter);
						times[1] = 2700 + 600 * (0.6 * across + 0.4 * jitter);
						times[2] = 3150 + 550 * (0.5 * across + 0.5 * jitter);
						times[3] = 3550 + 450 * (0.5 * across + 0.5 * jitter);
						times[4] = 3850 + 400 * (0.5 * across + 0.5 * jitter);
						stage = stageAt(time, times);
						heat = stage ? flash(time - times[stage - 1], 120) : 0;
					}
				}
				this.paintCell(samples, column, row, stage, glow, stage < 0 ? twinkle(column, row, loadingTime) : 0, heat);
			}
		}
		return { height: frameHeight, imageOpacity: smoothstep(4250, 4600, time), textureOpacity: 1 - smoothstep(4350, 4700, time) };
	}

	private paintPrint(reveal: ITextureReveal, time: number): ITextureFrame {
		const { samples, continuing } = reveal.options;
		const { width, height } = samples;
		const from = Math.min(height, reveal.options.fromHeight);
		const band = Math.min(height, continuing ? Math.max(from, cell * 4) : cell * 7);
		const head = (height - band) * easeInOutSine(time / 2600);
		const frameHeight = Math.min(height, Math.max(from, head + band));
		// Nothing is printed until the head starts to move, then the upper half of the head prints.
		const printLine = time >= 2700 ? height : head - cell + band * 0.5 * smoothstep(0, 400, time);
		const headGain = (continuing ? 1 : smoothstep(0, 250, time)) * (1 - smoothstep(2500, 2900, time));
		const loadingTime = reveal.loadingTime + time;
		const wave = acceleratedLoadingWave(reveal, width, time, 1 / 700, 600);
		const columns = Math.ceil(width / cell);
		const times = this.stageTimes;
		for (let row = 0; row * cell < frameHeight; row++) {
			const y = row * cell + cell / 2;
			const down = y / height;
			const inHead = y >= head && y < head + band;
			for (let column = 0; column < columns; column++) {
				const x = column * cell + cell / 2;
				const jitter = hash(column, row, 22);
				let stage = -1;
				let heat = 0;
				if (y < printLine + (jitter - 0.5) * cell * 1.5) {
					times[0] = 2800 + 650 * down + 25 * jitter;
					times[1] = 3150 + 650 * down + 25 * jitter;
					times[2] = 3500 + 600 * down + 30 * jitter;
					times[3] = 3800 + 550 * down + 30 * jitter;
					times[4] = 4050 + 450 * down + 40 * jitter;
					stage = stageAt(time, times);
					heat = stage ? flash(time - times[stage - 1], 140) : 0;
					// Freshly printed rows glow like warm ink for a moment.
					const ink = printLine - y;
					if (time < 2900 && ink >= 0 && ink < 40) {
						heat = Math.max(heat, 0.55 * (1 - ink / 40));
					}
				}
				const glow = inHead ? this.glow(wave, x, y - head, band, loadingTime) * headGain : 0;
				this.paintCell(samples, column, row, stage, glow, stage < 0 && inHead ? twinkle(column, row, loadingTime) : 0, heat);
			}
		}
		return { height: frameHeight, imageOpacity: smoothstep(4500, 4900, time), textureOpacity: 1 - smoothstep(4600, 5000, time) };
	}

	private paintBloom(reveal: ITextureReveal, time: number): ITextureFrame {
		const { samples, continuing } = reveal.options;
		const { width, height } = samples;
		const { x: originX, y: originY, reach } = this.origin;
		const ring = (start: number, length: number) => time <= start ? 0 : reach * easeOutCubic((time - start) / length);
		const develop = ring(0, 1800);
		// Later rings sharpen the image, then bring its palette and its true colors.
		const rings = [ring(1500, 1300), ring(2050, 1250), ring(2600, 1150), ring(3000, 1100), ring(3350, 950)];
		const from = Math.min(height, reveal.options.fromHeight);
		const frameHeight = Math.min(height, Math.max(from, originY + develop + Math.min(10, develop)));
		const loadingTime = reveal.loadingTime + time;
		const loading = continuing && time < 450 ? getLoadingWave(width, loadingTime) : undefined;
		const loadingGain = 1 - smoothstep(0, 450, time);
		const columns = Math.ceil(width / cell);
		for (let row = 0; row * cell < frameHeight; row++) {
			const y = row * cell + cell / 2;
			for (let column = 0; column < columns; column++) {
				const x = column * cell + cell / 2;
				const distance = Math.hypot(x - originX, y - originY);
				const jitter = hash(column, row, 23);
				const behind = develop - distance;
				let glow = behind >= 0 ? (behind < 48 ? (1 - behind / 48) ** 1.6 : 0) : (behind > -6 ? (1 + behind / 6) ** 2 : 0);
				glow *= 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(distance * 0.18 - time / 70));
				glow = Math.max(glow, this.glow(loading, x, y, from, loadingTime) * loadingGain);
				let stage = -1;
				let heat = 0;
				if (behind >= 8 + 14 * jitter) {
					stage = 0;
					while (stage < rings.length && distance <= rings[stage] - 6 * jitter) {
						const front = rings[stage] - distance;
						heat = front < 14 ? 0.7 * (1 - front / 14) : 0;
						stage++;
					}
				}
				this.paintCell(samples, column, row, stage, glow, stage < 0 && behind < 0 ? twinkle(column, row, loadingTime) : 0, heat);
			}
		}
		return { height: frameHeight, imageOpacity: smoothstep(4250, 4650, time), textureOpacity: 1 - smoothstep(4350, 4800, time) };
	}

	/** Brightness of a wave at a cell of a band of `height` pixels, with the same texture as the loading band. */
	private glow(wave: ILoadingWave | undefined, x: number, y: number, height: number, time: number): number {
		return wave ? waveIntensity(wave, x) * (0.7 + 0.3 * waveRipple(wave, x, y, time)) * bandProfile(y, height) : 0;
	}

	/**
	 * Paints a 4-pixel cell. Before its image appears (`stage` -1) a cell shows twinkling dust;
	 * after, it shows the image at the size and colors of its stage. A wave is drawn over either.
	 */
	private paintCell(samples: ImageSamples, column: number, row: number, stage: number, glow: number, dust: number, heat: number): void {
		const { width, height } = samples;
		const x0 = column * cell;
		const y0 = row * cell;
		const [accentRed, accentGreen, accentBlue] = this.palette.accent;
		if (stage < 0) {
			if (dust > 0.05) {
				this.fill(width, height, x0, y0, cell, accentRed, accentGreen, accentBlue, 0.32 * dust, 0);
			}
		} else {
			const size = stageSizes[stage];
			const step = Math.min(size, cell);
			const columns = samples.columns(size);
			for (let y = y0; y < y0 + cell && y < height; y += step) {
				for (let x = x0; x < x0 + cell && x < width; x += step) {
					const blockColumn = Math.floor(x / size);
					const blockRow = Math.floor(y / size);
					const index = blockRow * columns + blockColumn;
					if (stage >= colorStage) {
						const offset = (y * width + x) * 4;
						const red = samples.pixels[offset];
						const green = samples.pixels[offset + 1];
						const blue = samples.pixels[offset + 2];
						this.fill(width, height, x, y, step, red, green, blue, 1, heat * luminance(red, green, blue));
					} else if (stage >= firstPaletteStage) {
						const palette = samples.palette;
						const color = samples.paletteIndices(size)[index] * 3;
						// Only the bright parts of the image shimmer as they switch, so dark areas stay calm.
						this.fill(width, height, x, y, step, palette[color], palette[color + 1], palette[color + 2], 1, heat * luminance(palette[color], palette[color + 1], palette[color + 2]));
					} else {
						const brightness = samples.cells(size)[index];
						if (brightness * 16 > bayer[(blockRow & 3) * 4 + (blockColumn & 3)] + 0.5) {
							this.fill(width, height, x, y, step, accentRed, accentGreen, accentBlue, 0.55 + 0.45 * brightness, heat);
						}
					}
				}
			}
		}
		if (glow * 16 > bayer[(row & 3) * 4 + (column & 3)] + 0.5) {
			const [red, green, blue] = glow > 0.8 ? this.palette.hot : this.palette.accent;
			this.fill(width, height, x0, y0, cell, red, green, blue, 0.45 + 0.55 * glow, 0);
		}
	}

	/** Fills a square of the reveal, brightened toward the hot color by `heat`. */
	private fill(width: number, height: number, x0: number, y0: number, size: number, red: number, green: number, blue: number, alpha: number, heat: number): void {
		const data = this.pixels!.data;
		const mix = Math.min(1, heat) * 0.7;
		const [hotRed, hotGreen, hotBlue] = this.palette.hot;
		const r = red + (hotRed - red) * mix;
		const g = green + (hotGreen - green) * mix;
		const b = blue + (hotBlue - blue) * mix;
		const a = 255 * Math.min(1, alpha + 0.4 * heat);
		for (let y = y0; y < y0 + size && y < height; y++) {
			let offset = (y * width + x0) * 4;
			for (let x = x0; x < x0 + size && x < width; x++, offset += 4) {
				data[offset] = r;
				data[offset + 1] = g;
				data[offset + 2] = b;
				data[offset + 3] = a;
			}
		}
	}

	private put(data: Uint8ClampedArray, offset: number, [red, green, blue]: readonly [number, number, number], alpha: number): void {
		data[offset] = red;
		data[offset + 1] = green;
		data[offset + 2] = blue;
		data[offset + 3] = 255 * alpha;
	}
}

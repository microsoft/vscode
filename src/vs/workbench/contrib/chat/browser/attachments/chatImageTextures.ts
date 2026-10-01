/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Color } from '../../../../../base/common/color.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { focusBorder, foreground } from '../../../../../platform/theme/common/colorRegistry.js';
import { ColorScheme, isHighContrast } from '../../../../../platform/theme/common/theme.js';
import { IColorTheme, IThemeService } from '../../../../../platform/theme/common/themeService.js';

/** Thresholds of a 4×4 ordered dither, in sixteenths. */
export const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Returns a stable pseudo-random number in [0, 1) for a cell and a seed. */
export function hash(x: number, y: number, seed = 0): number {
	let value = Math.imul(x + 1, 0x27d4eb2d) ^ Math.imul(y + 1, 0x165667b1) ^ Math.imul(seed + 1, 0x9e3779b1);
	value = Math.imul(value ^ (value >>> 15), 0x85ebca6b);
	value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
	return ((value ^ (value >>> 16)) >>> 0) / 0x100000000;
}

export function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
	const amount = clamp01((value - edge0) / (edge1 - edge0));
	return amount * amount * (3 - 2 * amount);
}

export function easeInOutCubic(value: number): number {
	const amount = clamp01(value);
	return amount < 0.5 ? 4 * amount ** 3 : 1 - (2 - 2 * amount) ** 3 / 2;
}

export function easeInOutSine(value: number): number {
	return (1 - Math.cos(Math.PI * clamp01(value))) / 2;
}

export function easeOutCubic(value: number): number {
	return 1 - (1 - clamp01(value)) ** 3;
}

/** Fades from 1 to 0 over `length` milliseconds once `elapsed` reaches 0, for a short flash. */
export function flash(elapsed: number, length: number): number {
	return elapsed >= 0 && elapsed < length ? 1 - elapsed / length : 0;
}

/** Returns how many times longer image motion takes: 2 plays everything at half speed. */
export function getMotionScale(element: HTMLElement): number {
	const scale = parseFloat(dom.getWindow(element).getComputedStyle(element).getPropertyValue('--chat-image-motion-scale'));
	return scale > 0 ? scale : 1;
}

/**
 * The pace of a texture reveal. It starts at the loading band's speed, `--chat-image-motion-scale`,
 * and eases to `--chat-image-motion-scale-end`, for example to start fast and settle slowly into
 * the image. Maps the real milliseconds of a reveal to the virtual milliseconds of its transition.
 */
export class RevealPace {

	private static readonly steps = 256;

	/** Real milliseconds at which each step of the transition is reached. */
	private readonly realTimes = new Float64Array(RevealPace.steps + 1);

	/** Real milliseconds that the whole transition takes. */
	readonly duration: number;

	constructor(
		/** Virtual milliseconds that the transition takes at normal speed. */
		readonly length: number,
		startScale: number,
		endScale: number,
	) {
		let real = 0;
		for (let step = 1; step <= RevealPace.steps; step++) {
			// The speed changes evenly on a log scale, so that halving it twice takes as long as halving it once and then again.
			real += startScale * (endScale / startScale) ** smoothstep(0, 1, (step - 0.5) / RevealPace.steps) * length / RevealPace.steps;
			this.realTimes[step] = real;
		}
		this.duration = real;
	}

	static of(element: HTMLElement, length: number): RevealPace {
		const start = getMotionScale(element);
		const end = parseFloat(dom.getWindow(element).getComputedStyle(element).getPropertyValue('--chat-image-motion-scale-end'));
		return new RevealPace(length, start, end > 0 ? end : start);
	}

	/** Returns the virtual milliseconds of the transition that have passed after `real` milliseconds. */
	virtualAt(real: number): number {
		const times = this.realTimes;
		if (real <= 0) {
			return 0;
		}
		if (real >= this.duration) {
			return this.length;
		}
		let low = 0;
		let high = times.length - 1;
		while (high - low > 1) {
			const middle = (low + high) >> 1;
			if (times[middle] <= real) {
				low = middle;
			} else {
				high = middle;
			}
		}
		return (low + (real - times[low]) / (times[high] - times[low])) / RevealPace.steps * this.length;
	}
}

/**
 * Returns the stage a cell has reached by `time`, given when it reaches each stage after the
 * first, so a cell whose image has appeared is at stage 0 until `times[0]`.
 */
export function stageAt(time: number, times: ArrayLike<number>): number {
	let stage = 0;
	while (stage < times.length && time >= times[stage]) {
		stage++;
	}
	return stage;
}

/**
 * A monotone cubic from 0 to 1 whose slopes at either end come as close to the requested ones as
 * monotony allows, for steering a moving wave between two speeds without it backing up.
 */
function steer(value: number, startSlope: number, endSlope: number): number {
	let start = Math.max(0, startSlope);
	let end = Math.max(0, endSlope);
	const norm = Math.hypot(start, end);
	if (norm > 3) {
		start *= 3 / norm;
		end *= 3 / norm;
	}
	const amount = clamp01(value);
	const squared = amount * amount;
	const cubed = squared * amount;
	return (cubed - 2 * squared + amount) * start + (3 * squared - 2 * cubed) + (cubed - squared) * end;
}

/** A comet-like wave sweeping a band from left to right, in CSS pixels. */
export interface ILoadingWave {
	/** Position of the brightest point. */
	readonly head: number;
	/** Length of the fading tail behind the head. */
	readonly tail: number;
	/** Varies each sweep a little, so that repeated sweeps don't look mechanical. */
	readonly seed: number;
}

/** Virtual milliseconds per sweep of a loading wave at normal speed. */
export const wavePeriod = 3200;

/** Places a wave whose sweep, from entering on the left to leaving on the right, is `progress` done. */
export function placeWave(progress: number, width: number, seed: number, tail = width * (0.4 + 0.12 * hash(seed, 7))): ILoadingWave {
	return { head: progress * (width + tail * 1.3) - tail * 0.15, tail, seed };
}

/** Returns the loading wave at a virtual time. Every band that shares the clock shows the same wave. */
export function getLoadingWave(width: number, time: number): ILoadingWave {
	const sweeps = time / wavePeriod;
	const seed = Math.floor(sweeps);
	return placeWave(sweeps - seed, width, seed);
}

/** Brightness of a wave at `x`: a soft leading edge, a bright head and a long fading tail. */
export function waveIntensity(wave: ILoadingWave, x: number): number {
	const behind = wave.head - x;
	if (behind >= 0) {
		return behind < wave.tail ? (1 - behind / wave.tail) ** 1.8 : 0;
	}
	return behind > -6 ? (1 + behind / 6) ** 2 : 0;
}

/** Fine texture that keeps a wave from looking like a flat gradient. */
export function waveRipple(wave: ILoadingWave, x: number, y: number, time: number): number {
	return 0.5 + 0.5 * Math.sin(x * 0.0875 - y * 0.2 + time / 400 + wave.seed * 1.7);
}

/** How strongly a wave fills a row of a band: fullest along the middle, thinner toward its edges. */
export function bandProfile(y: number, height: number): number {
	return height > 0 && y >= 0 && y < height ? Math.max(0, 1 - Math.abs(y / height - 0.5) * 1.2) : 0;
}

/** Opacity of a twinkling background cell at a virtual time, or 0 while it rests. */
export function twinkle(column: number, row: number, time: number): number {
	if (hash(column, row, 3) >= 0.35) {
		return 0;
	}
	const phase = (time / 2400 + hash(column, row, 4)) % 1;
	return phase < 0.25 ? Math.sin(Math.PI * phase / 0.25) : 0;
}

/** Colors of a texture in a theme, as RGB triples. */
export interface ITexturePalette {
	/** The color of dither pixels and of the loading wave. */
	readonly accent: readonly [number, number, number];
	/** The color of the brightest parts of a wave and of flashes. */
	readonly hot: readonly [number, number, number];
	/** Whether marks stand for the dark rather than the bright parts of an image, like ink on a light page. */
	readonly invert: boolean;
}

export function getTexturePalette(theme: IColorTheme): ITexturePalette {
	const text = theme.getColor(foreground) ?? Color.white;
	const accent = (theme.getColor(focusBorder) ?? text).mix(text, 0.25);
	const rgb = (color: Color): [number, number, number] => [color.rgba.r, color.rgba.g, color.rgba.b];
	return { accent: rgb(accent), hot: rgb(accent.mix(text, 0.55)), invert: theme.type === ColorScheme.LIGHT };
}

/** Number of colors taken from an image for its palette stages. */
const paletteSize = 5;

/**
 * A loaded image at its displayed size, read once so that every texture stage can be derived from
 * it: brightness stretched to the image's own range, mean colors of cells of any size, and a small
 * palette of colors that represent it.
 */
export class ImageSamples {

	private readonly brightnessCells = new Map<number, Float32Array>();
	private readonly colorCells = new Map<number, Float32Array>();
	private readonly paletteCells = new Map<number, Uint8Array>();
	private paletteColors: Float32Array | undefined;

	private constructor(
		readonly width: number,
		readonly height: number,
		/** RGBA of every CSS pixel, row by row. */
		readonly pixels: Uint8ClampedArray,
		/** Brightness of every CSS pixel from 0 to 1, inverted for light themes. */
		readonly brightness: Float32Array,
	) { }

	/** Samples an image at a size, or returns undefined when it cannot be read. */
	static create(image: HTMLImageElement, width: number, height: number, invert: boolean): ImageSamples | undefined {
		width = Math.max(1, Math.round(width));
		height = Math.max(1, Math.round(height));
		const canvas = image.ownerDocument.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext('2d', { willReadFrequently: true });
		if (!context || !image.naturalWidth || !image.naturalHeight) {
			return undefined;
		}
		context.imageSmoothingQuality = 'high';
		let pixels: Uint8ClampedArray;
		try {
			context.drawImage(image, 0, 0, width, height);
			pixels = context.getImageData(0, 0, width, height).data;
		} catch {
			// A cross-origin image taints the canvas, so it cannot be sampled.
			return undefined;
		}

		const count = width * height;
		const brightness = new Float32Array(count);
		const histogram = new Uint32Array(256);
		for (let index = 0; index < count; index++) {
			const offset = index * 4;
			const value = (0.2126 * pixels[offset] + 0.7152 * pixels[offset + 1] + 0.0722 * pixels[offset + 2]) * pixels[offset + 3] / (255 * 255);
			brightness[index] = value;
			histogram[Math.min(255, Math.floor(value * 256))]++;
		}
		const low = percentile(histogram, count * 0.1);
		const range = Math.max(0.1, percentile(histogram, count * 0.95) - low);
		for (let index = 0; index < count; index++) {
			const value = clamp01((brightness[index] - low) / range);
			brightness[index] = invert ? 1 - value : value;
		}
		return new ImageSamples(width, height, pixels, brightness);
	}

	/** Number of columns in a grid of `size`-pixel cells that starts at the top-left corner. */
	columns(size: number): number {
		return Math.ceil(this.width / size);
	}

	/** Mean brightness of each `size`-pixel cell, row by row. */
	cells(size: number): Float32Array {
		if (size <= 1) {
			return this.brightness;
		}
		let cells = this.brightnessCells.get(size);
		if (!cells) {
			cells = this.average(size, 1, index => this.brightness[index]);
			this.brightnessCells.set(size, cells);
		}
		return cells;
	}

	/** Mean RGB of each `size`-pixel cell, three values per cell. */
	colors(size: number): Float32Array {
		let colors = this.colorCells.get(size);
		if (!colors) {
			colors = this.average(size, 3, (index, channel) => this.pixels[index * 4 + channel]);
			this.colorCells.set(size, colors);
		}
		return colors;
	}

	/** A few colors that represent the image, found by k-means, three values per color. */
	get palette(): Float32Array {
		if (!this.paletteColors) {
			// Cluster actual pixels from a grid rather than cell means, so that colors aren't blends of their neighbors.
			const stride = Math.max(1, Math.round(Math.sqrt(this.width * this.height / 4096)));
			const picked: number[] = [];
			for (let y = Math.floor(stride / 2); y < this.height; y += stride) {
				for (let x = Math.floor(stride / 2); x < this.width; x += stride) {
					const offset = (y * this.width + x) * 4;
					picked.push(this.pixels[offset], this.pixels[offset + 1], this.pixels[offset + 2]);
				}
			}
			const samples = Float32Array.from(picked);
			const count = samples.length / 3;
			const centers = new Float32Array(paletteSize * 3);
			const distance = (sample: number, center: number) => (samples[sample * 3] - centers[center * 3]) ** 2 + (samples[sample * 3 + 1] - centers[center * 3 + 1]) ** 2 + (samples[sample * 3 + 2] - centers[center * 3 + 2]) ** 2;

			// Start from the darkest sample, then repeatedly add the sample farthest from every center.
			let darkest = 0;
			for (let sample = 1; sample < count; sample++) {
				if (samples[sample * 3] + samples[sample * 3 + 1] + samples[sample * 3 + 2] < samples[darkest * 3] + samples[darkest * 3 + 1] + samples[darkest * 3 + 2]) {
					darkest = sample;
				}
			}
			centers.set(samples.subarray(darkest * 3, darkest * 3 + 3), 0);
			for (let center = 1; center < paletteSize; center++) {
				let farthest = 0;
				let farthestDistance = -1;
				for (let sample = 0; sample < count; sample++) {
					let nearest = Infinity;
					for (let existing = 0; existing < center; existing++) {
						nearest = Math.min(nearest, distance(sample, existing));
					}
					if (nearest > farthestDistance) {
						farthest = sample;
						farthestDistance = nearest;
					}
				}
				centers.set(samples.subarray(farthest * 3, farthest * 3 + 3), center * 3);
			}

			const sums = new Float64Array(paletteSize * 3);
			const sizes = new Uint32Array(paletteSize);
			for (let iteration = 0; iteration < 8; iteration++) {
				sums.fill(0);
				sizes.fill(0);
				for (let sample = 0; sample < count; sample++) {
					let nearest = 0;
					for (let center = 1; center < paletteSize; center++) {
						if (distance(sample, center) < distance(sample, nearest)) {
							nearest = center;
						}
					}
					sizes[nearest]++;
					for (let channel = 0; channel < 3; channel++) {
						sums[nearest * 3 + channel] += samples[sample * 3 + channel];
					}
				}
				for (let center = 0; center < paletteSize; center++) {
					if (sizes[center]) {
						for (let channel = 0; channel < 3; channel++) {
							centers[center * 3 + channel] = sums[center * 3 + channel] / sizes[center];
						}
					}
				}
			}
			this.paletteColors = centers;
		}
		return this.paletteColors;
	}

	/**
	 * Index into {@link palette} of each `size`-pixel cell. Each cell is ordered-dithered between its
	 * two nearest palette colors, so flat areas stay flat and blends between them become patterns.
	 */
	paletteIndices(size: number): Uint8Array {
		let indices = this.paletteCells.get(size);
		if (!indices) {
			const colors = this.colors(size);
			const palette = this.palette;
			const columns = this.columns(size);
			indices = new Uint8Array(colors.length / 3);
			for (let cell = 0; cell < indices.length; cell++) {
				const red = colors[cell * 3];
				const green = colors[cell * 3 + 1];
				const blue = colors[cell * 3 + 2];
				let nearest = 0;
				let second = 0;
				let nearestDistance = Infinity;
				let secondDistance = Infinity;
				for (let color = 0; color < palette.length / 3; color++) {
					const distance = (red - palette[color * 3]) ** 2 + (green - palette[color * 3 + 1]) ** 2 + (blue - palette[color * 3 + 2]) ** 2;
					if (distance < nearestDistance) {
						second = nearest;
						secondDistance = nearestDistance;
						nearest = color;
						nearestDistance = distance;
					} else if (distance < secondDistance) {
						second = color;
						secondDistance = distance;
					}
				}
				// How far the color sits from its nearest palette color toward the second nearest: 0 on it, about 0.5 halfway.
				const towardRed = palette[second * 3] - palette[nearest * 3];
				const towardGreen = palette[second * 3 + 1] - palette[nearest * 3 + 1];
				const towardBlue = palette[second * 3 + 2] - palette[nearest * 3 + 2];
				const span = towardRed ** 2 + towardGreen ** 2 + towardBlue ** 2;
				const projected = span ? clamp01(((red - palette[nearest * 3]) * towardRed + (green - palette[nearest * 3 + 1]) * towardGreen + (blue - palette[nearest * 3 + 2]) * towardBlue) / span) : 0;
				// A small dead zone keeps colors that sit just off a palette color, such as a slightly noisy background, flat.
				const toward = Math.max(0, projected - 0.08) / 0.92;
				indices[cell] = toward * 16 > bayer[(Math.floor(cell / columns) & 3) * 4 + (cell % columns & 3)] + 0.5 ? second : nearest;
			}
			this.paletteCells.set(size, indices);
		}
		return indices;
	}

	private average(size: number, channels: number, read: (index: number, channel: number) => number): Float32Array {
		const columns = this.columns(size);
		const cells = new Float32Array(columns * Math.ceil(this.height / size) * channels);
		const counts = new Uint32Array(cells.length / channels);
		for (let y = 0; y < this.height; y++) {
			const rowStart = Math.floor(y / size) * columns;
			for (let x = 0; x < this.width; x++) {
				const cell = rowStart + Math.floor(x / size);
				const index = y * this.width + x;
				for (let channel = 0; channel < channels; channel++) {
					cells[cell * channels + channel] += read(index, channel);
				}
				counts[cell]++;
			}
		}
		for (let cell = 0; cell < counts.length; cell++) {
			for (let channel = 0; channel < channels; channel++) {
				cells[cell * channels + channel] /= counts[cell] || 1;
			}
		}
		return cells;
	}
}

function percentile(histogram: Uint32Array, rank: number): number {
	let seen = 0;
	for (let bin = 0; bin < histogram.length; bin++) {
		seen += histogram[bin];
		if (seen >= rank) {
			return (bin + 0.5) / 256;
		}
	}
	return 1;
}

/** One painted frame of a texture reveal. */
export interface ITextureFrame {
	/** Width of the image's frame, in CSS pixels, or the image's own width when not set. */
	readonly width?: number;
	/** Height of the image's frame, in CSS pixels. */
	readonly height: number;
	/** Opacity of the image itself, which takes over at the end. */
	readonly imageOpacity: number;
	/** Opacity of the texture over the image. */
	readonly textureOpacity: number;
}

export interface ITextureRevealOptions {
	/** The loaded image, which the last stages show through the texture in its true colors. */
	readonly image: HTMLImageElement;
	readonly samples: ImageSamples;
	/** Width of the loading indicator that the frame grows or narrows from, in CSS pixels. */
	readonly fromWidth: number;
	/** Height of the loading indicator that the frame grows from, in CSS pixels. */
	readonly fromHeight: number;
	/** Whether this surface's own loading band was showing, so that the reveal carries its wave on. */
	readonly continuing: boolean;
	/** Real milliseconds the reveal takes. */
	readonly duration: number;
	readonly onFrame: (frame: ITextureFrame) => void;
}

/** A texture reveal in progress. */
export interface ITextureReveal {
	readonly transition: string;
	readonly options: ITextureRevealOptions;
	/** Virtual milliseconds the transition takes at normal speed. */
	readonly length: number;
	/** How the reveal's real time maps to the transition's virtual time. */
	readonly pace: RevealPace;
	/** The virtual loading time when the reveal began, so that a continuing wave keeps its phase. */
	readonly loadingTime: number;
	/** A keyframe-less animation whose time is the reveal's clock, so that the reveal can be paused and sought. */
	readonly clock: Animation;
}

/**
 * Returns the loading wave of a reveal, sped up or slowed down so that it leaves the band `until`
 * virtual milliseconds into the reveal while moving at `endSpeed` sweeps per millisecond, the speed
 * of the sweep that follows it. Returns undefined when there is no wave left to show.
 */
export function steerLoadingWave(reveal: ITextureReveal, width: number, time: number, until: number, endSpeed: number): ILoadingWave | undefined {
	const sweeps = reveal.loadingTime / wavePeriod;
	const seed = Math.floor(sweeps);
	const start = sweeps - seed;
	if (!reveal.options.continuing || time >= until) {
		return undefined;
	}
	const remaining = 1 - start;
	return placeWave(start + remaining * steer(time / until, until / wavePeriod / remaining, until * endSpeed / remaining), width, seed);
}

/** Returns the loading wave of a reveal, accelerated to `speed` sweeps per millisecond over its first `ramp` virtual milliseconds. */
export function acceleratedLoadingWave(reveal: ITextureReveal, width: number, time: number, speed: number, ramp: number): ILoadingWave {
	const amount = Math.min(1, time / ramp);
	const extra = time < ramp ? ramp * (amount ** 3 - amount ** 4 / 2) : ramp / 2 + time - ramp;
	const sweeps = (reveal.loadingTime + time) / wavePeriod + (speed - 1 / wavePeriod) * extra;
	const seed = Math.floor(sweeps);
	return placeWave(sweeps - seed, width, seed);
}

/**
 * A canvas that paints a loading band while an image is generated and then carries on into a
 * reveal of the image, so that the loading motion and the reveal are one continuous piece. Bands
 * that share the clock paint the same frame, so a band can hand off to another one, for example
 * when the running tool is replaced by its result, without a visible change.
 */
export abstract class TextureSurface extends Disposable {

	readonly canvas: HTMLCanvasElement;
	protected palette: ITexturePalette;
	private motionScale = 1;
	private readonly nextFrame = this._register(new MutableDisposable());
	private active: ITextureReveal | undefined;

	constructor(
		container: HTMLElement,
		className: string,
		protected readonly themeService: IThemeService,
		private readonly accessibilityService: IAccessibilityService,
	) {
		super();
		this.canvas = dom.append(container, dom.$<HTMLCanvasElement>(`canvas.chat-image-loading-band.${className}`, { 'aria-hidden': 'true' }));
		this.palette = getTexturePalette(themeService.getColorTheme());
		this._register(toDisposable(() => {
			this.active?.clock.cancel();
			this.canvas.remove();
		}));
		const resizeObserver = this._register(new dom.DisposableResizeObserver(`ChatImageTextureSurface.${className}`, () => this.refresh()));
		this._register(resizeObserver.observe(this.canvas));
		this._register(themeService.onDidColorThemeChange(() => this.refresh()));
		this._register(accessibilityService.onDidChangeReducedMotion(() => this.refresh()));
	}

	/**
	 * Virtual milliseconds a transition takes at normal speed, or undefined when this surface does
	 * not paint it. A reveal can take longer when its frame changes from `fromWidth` to `toWidth`.
	 */
	abstract lengthOf(transition: string, fromWidth?: number, toWidth?: number): number | undefined;

	/** Whether the loading band is on screen, so that a reveal can carry its motion on. */
	get showingBand(): boolean {
		return !this.active && this.canvas.clientWidth > 0 && this.canvas.clientHeight > 0;
	}

	/** Turns the loading band into a reveal of an image. */
	reveal(transition: string, options: ITextureRevealOptions): void {
		const length = this.lengthOf(transition, options.fromWidth, options.samples.width);
		if (length === undefined || this.active) {
			return;
		}
		this.motionScale = getMotionScale(this.canvas);
		this.canvas.style.display = 'block';
		this.canvas.style.width = `${options.samples.width}px`;
		this.canvas.style.height = `${options.samples.height}px`;
		this.active = { transition, options, length, pace: RevealPace.of(this.canvas, length), loadingTime: Date.now() / this.motionScale, clock: this.canvas.animate([], { duration: options.duration }) };
		this.prepareReveal(this.active);
		this.update();
	}

	private refresh(): void {
		this.palette = getTexturePalette(this.themeService.getColorTheme());
		if (!this.active && this.canvas.isConnected) {
			this.motionScale = getMotionScale(this.canvas);
		}
		this.onDidRefresh();
		this.update();
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
			// A still band shows the wave halfway across rather than an empty band.
			this.paintLoading(animated ? Date.now() / this.motionScale : wavePeriod * 0.55);
		}
		if (animated) {
			this.nextFrame.value = dom.scheduleAtNextAnimationFrame(dom.getWindow(this.canvas), () => this.update());
		}
	}

	/** Called when the size, theme or motion settings change, before the next paint. */
	protected onDidRefresh(): void { }

	/** Paints the loading band, which fills the canvas, at a virtual time. */
	protected abstract paintLoading(time: number): void;

	/** Prepares the canvas, which now has the image's size, for a reveal. */
	protected abstract prepareReveal(reveal: ITextureReveal): void;

	/** Paints a reveal at a virtual time since it began. */
	protected abstract paintReveal(reveal: ITextureReveal, time: number): ITextureFrame;
}

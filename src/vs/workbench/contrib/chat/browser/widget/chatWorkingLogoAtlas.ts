/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, onDidUnregisterWindow, runWhenWindowIdle } from '../../../../../base/browser/dom.js';
import { timeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { combinedDisposable, Disposable, DisposableMap, DisposableStore, IDisposable, IReference, markAsSingleton, toDisposable } from '../../../../../base/common/lifecycle.js';
import { CHAT_WORKING_LOGO_DRAW_PAINT_ORDER, chatWorkingLogoFacePaths, getChatWorkingLogoDrawFrame } from './chatWorkingLogoDraw.js';

export const chatWorkingLogoAtlasFrameCount = 320;
const columns = 20;
const rows = chatWorkingLogoAtlasFrameCount / columns;
const padding = 2;
const maxCacheBytes = 16 * 1024 * 1024;

export interface IChatWorkingLogoAtlasOptions {
	/** Native pixel dimensions, excluding the two-pixel padding around each tile. */
	readonly width: number;
	readonly height: number;
	readonly color: string;
}

export interface IChatWorkingLogoAtlas extends IDisposable {
	readonly url: string;
	readonly width: number;
	readonly height: number;
	readonly frameWidth: number;
	readonly frameHeight: number;
	/** The encoded sheet, which lets the window retain its own copy after the generating owners release it. */
	readonly blob?: Blob;
}

type AtlasFactory = (targetWindow: Window, options: IChatWorkingLogoAtlasOptions, token: CancellationToken) => Promise<IChatWorkingLogoAtlas>;

function getAtlasKey(options: IChatWorkingLogoAtlasOptions): string {
	return JSON.stringify([options.width, options.height, options.color]);
}

class AtlasEntry extends Disposable {
	private readonly cancellation = this._register(new CancellationTokenSource());
	readonly promise: Promise<IChatWorkingLogoAtlas>;
	value: IChatWorkingLogoAtlas | undefined;
	references = 0;

	constructor(targetWindow: Window, options: IChatWorkingLogoAtlasOptions, factory: AtlasFactory, readonly bytes: number) {
		super();
		this.promise = this.create(targetWindow, options, factory);
	}

	private async create(targetWindow: Window, options: IChatWorkingLogoAtlasOptions, factory: AtlasFactory): Promise<IChatWorkingLogoAtlas> {
		const atlas = await factory(targetWindow, options, this.cancellation.token);
		if (this.cancellation.token.isCancellationRequested) {
			atlas.dispose();
			throw new CancellationError();
		}
		this.value = this._register(atlas);
		return atlas;
	}

	override dispose(): void {
		this.cancellation.cancel();
		super.dispose();
	}
}

/** Shares in-flight and decoded atlases, evicting unused entries before exceeding the pixel budget. */
export class ChatWorkingLogoAtlasCache extends Disposable {
	private readonly entries = this._register(new DisposableMap<string, AtlasEntry>());
	private bytes = 0;

	constructor(
		private readonly targetWindow: Window,
		private readonly factory: AtlasFactory = createChatWorkingLogoAtlas,
	) {
		super();
	}

	/** Whether an atlas for these options is ready or already being generated, so acquiring it adds no generation work. */
	has(options: IChatWorkingLogoAtlasOptions): boolean {
		return this.entries.has(getAtlasKey(options));
	}

	acquire(options: IChatWorkingLogoAtlasOptions): IReference<Promise<IChatWorkingLogoAtlas>> {
		if (this._store.isDisposed) {
			throw new CancellationError();
		}
		if (![options.width, options.height].every(size => Number.isInteger(size) && size > 0 && size <= 128)) {
			throw new Error('Draw atlas dimensions must be between 1 and 128 physical pixels');
		}
		const key = getAtlasKey(options);
		let entry = this.entries.get(key);
		if (!entry) {
			const bytes = (options.width + padding * 2) * (options.height + padding * 2) * chatWorkingLogoAtlasFrameCount * 4;
			for (const [oldKey, oldEntry] of this.entries) {
				if (this.bytes + bytes <= maxCacheBytes) {
					break;
				}
				if (oldEntry.references === 0) {
					this.remove(oldKey, oldEntry);
				}
			}
			if (this.bytes + bytes > maxCacheBytes) {
				throw new Error('Draw atlas pixel cache is full');
			}
			entry = new AtlasEntry(this.targetWindow, options, this.factory, bytes);
			this.entries.set(key, entry);
			this.bytes += bytes;
		} else {
			this.entries.deleteAndLeak(key);
			this.entries.set(key, entry);
		}
		entry.references++;
		const reference = entry;
		return Object.assign(toDisposable(() => {
			reference.references--;
			if (reference.references === 0 && !reference.value) {
				this.remove(key, reference);
			}
		}), { object: reference.promise });
	}

	private remove(key: string, entry: AtlasEntry): void {
		if (this.entries.get(key) === entry) {
			this.bytes -= entry.bytes;
			this.entries.deleteAndDispose(key);
		}
	}
}

const caches = new WeakMap<Window, { cache: ChatWorkingLogoAtlasCache; store: DisposableStore; references: number }>();

type AtlasSheet = Pick<IChatWorkingLogoAtlas, 'url' | 'width' | 'height' | 'frameWidth' | 'frameHeight'>;

/**
 * Completed sheets are retained until their window goes away, so later requests and remounted indicators
 * reuse them instead of generating frames again. They are plain data with their own object URLs, which
 * stay valid after the generating owners release their references.
 */
const retainedSheets = new WeakMap<Window, Map<string, AtlasSheet>>();

function getRetainedSheets(targetWindow: Window): Map<string, AtlasSheet> {
	let retained = retainedSheets.get(targetWindow);
	if (!retained) {
		const sheets = retained = new Map<string, AtlasSheet>();
		retainedSheets.set(targetWindow, sheets);
		const listeners = markAsSingleton(new DisposableStore());
		const release = () => {
			listeners.dispose();
			if (retainedSheets.get(targetWindow) === sheets) {
				retainedSheets.delete(targetWindow);
			}
			for (const sheet of sheets.values()) {
				URL.revokeObjectURL(sheet.url);
			}
			sheets.clear();
		};
		listeners.add(addDisposableListener(targetWindow, 'pagehide', release));
		listeners.add(onDidUnregisterWindow(window => {
			if (window === targetWindow) {
				release();
			}
		}));
	}
	return retained;
}

function retainSheet(targetWindow: Window, key: string, atlas: IChatWorkingLogoAtlas): void {
	const bytes = atlas.width * atlas.height * 4;
	if (!atlas.blob || bytes > maxCacheBytes) {
		return;
	}
	const sheets = getRetainedSheets(targetWindow);
	if (sheets.has(key)) {
		return;
	}
	let retainedBytes = bytes;
	for (const sheet of sheets.values()) {
		retainedBytes += sheet.width * sheet.height * 4;
	}
	for (const [oldKey, sheet] of sheets) {
		if (retainedBytes <= maxCacheBytes) {
			break;
		}
		sheets.delete(oldKey);
		URL.revokeObjectURL(sheet.url);
		retainedBytes -= sheet.width * sheet.height * 4;
	}
	sheets.set(key, { url: URL.createObjectURL(atlas.blob), width: atlas.width, height: atlas.height, frameWidth: atlas.frameWidth, frameHeight: atlas.frameHeight });
}

/**
 * Acquires the window's atlas for the given options. Retained sheets are returned immediately; otherwise
 * indicators share one generation, which stops when no indicator needs it and is retained when it completes.
 */
export function acquireChatWorkingLogoAtlas(targetWindow: Window, options: IChatWorkingLogoAtlasOptions): IReference<Promise<IChatWorkingLogoAtlas>> {
	const key = getAtlasKey(options);
	const sheets = retainedSheets.get(targetWindow);
	const sheet = sheets?.get(key);
	if (sheets && sheet) {
		// Refresh the least-recently-used order.
		sheets.delete(key);
		sheets.set(key, sheet);
		return { object: Promise.resolve({ ...sheet, dispose: () => { } }), dispose: () => { } };
	}
	let shared = caches.get(targetWindow);
	if (!shared) {
		const store = new DisposableStore();
		shared = { cache: store.add(new ChatWorkingLogoAtlasCache(targetWindow)), store, references: 0 };
		caches.set(targetWindow, shared);
		store.add(toDisposable(() => caches.delete(targetWindow)));
		store.add(addDisposableListener(targetWindow, 'pagehide', () => store.dispose()));
		store.add(onDidUnregisterWindow(window => {
			if (window === targetWindow) {
				store.dispose();
			}
		}));
	}
	let atlas: IReference<Promise<IChatWorkingLogoAtlas>>;
	try {
		atlas = shared.cache.acquire(options);
	} catch (error) {
		if (shared.references === 0) {
			shared.store.dispose();
		}
		throw error;
	}
	atlas.object.then(result => retainSheet(targetWindow, key, result), () => { /* Failures and cancellations are reported to the acquirer. */ });
	const owner = shared;
	owner.references++;
	return Object.assign(combinedDisposable(atlas, toDisposable(() => {
		if (--owner.references === 0) {
			owner.store.dispose();
		}
	})), { object: atlas.object });
}

/** Whether the window has a retained or in-flight atlas for these options, so acquiring it adds no generation work. */
export function hasChatWorkingLogoAtlas(targetWindow: Window, options: IChatWorkingLogoAtlasOptions): boolean {
	return !!retainedSheets.get(targetWindow)?.has(getAtlasKey(options)) || !!caches.get(targetWindow)?.cache.has(options);
}

async function whenIdle(targetWindow: Window, token: CancellationToken): Promise<void> {
	if (token.isCancellationRequested) {
		throw new CancellationError();
	}
	const store = new DisposableStore();
	try {
		await new Promise<void>((resolve, reject) => {
			store.add(token.onCancellationRequested(() => {
				store.dispose();
				reject(new CancellationError());
			}));
			store.add(runWhenWindowIdle(targetWindow, () => resolve(), 100));
		});
	} finally {
		store.dispose();
	}
}

export async function loadChatWorkingLogoAtlasImage(image: HTMLImageElement, url: string, token: CancellationToken): Promise<void> {
	if (token.isCancellationRequested) {
		throw new CancellationError();
	}
	const store = new DisposableStore();
	try {
		await new Promise<void>((resolve, reject) => {
			store.add(addDisposableListener(image, 'load', () => resolve()));
			store.add(addDisposableListener(image, 'error', () => reject(new Error('Unable to load Draw atlas image'))));
			store.add(token.onCancellationRequested(() => {
				image.removeAttribute('src');
				store.dispose();
				reject(new CancellationError());
			}));
			image.src = url;
			if (image.complete) {
				if (image.naturalWidth && image.naturalHeight) {
					resolve();
				} else {
					reject(new Error('Draw atlas image has invalid dimensions'));
				}
			}
		});
	} finally {
		store.dispose();
	}
}

/** Rasterizes padded, native-resolution tiles in yielding batches; playback never uses this path. */
export async function createChatWorkingLogoAtlas(targetWindow: Window, options: IChatWorkingLogoAtlasOptions, token: CancellationToken): Promise<IChatWorkingLogoAtlas> {
	const { width, height, color } = options;
	const canvas = $<HTMLCanvasElement>('canvas');
	const tile = $<HTMLCanvasElement>('canvas');
	const image = $<HTMLImageElement>('img');
	canvas.width = (width + padding * 2) * columns;
	canvas.height = (height + padding * 2) * rows;
	tile.width = width;
	tile.height = height;
	try {
		const context = canvas.getContext('2d', { willReadFrequently: true });
		const tileContext = tile.getContext('2d', { willReadFrequently: true });
		if (!context || !tileContext) {
			throw new Error('Draw atlas requires a 2D canvas context');
		}
		const svg = $.SVG<SVGSVGElement>('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: '6 6 84 84', width, height });
		svg.style.color = color;
		if (!svg.style.color) {
			throw new Error('Draw atlas requires a valid color');
		}
		const defs = $.SVG<SVGDefsElement>('defs');
		const artwork = $.SVG<SVGGElement>('g');
		const masks: SVGPathElement[] = [];
		for (const [index, band] of CHAT_WORKING_LOGO_DRAW_PAINT_ORDER.entries()) {
			const mask = $.SVG<SVGMaskElement>('mask', { id: band, x: '0', y: '0', width: '96', height: '96', maskUnits: 'userSpaceOnUse', 'mask-type': 'alpha' });
			const maskPath = $.SVG<SVGPathElement>('path', { fill: '#fff', stroke: '#fff', 'stroke-width': '4', 'stroke-linejoin': 'round', transform: 'translate(6 6) scale(0.84)' });
			mask.appendChild(maskPath);
			defs.appendChild(mask);
			masks.push(maskPath);
			artwork.appendChild($.SVG<SVGPathElement>('path', { d: chatWorkingLogoFacePaths[index], fill: 'currentColor', mask: `url(#${band})` }));
		}
		const faces = $.SVG<SVGGElement>('g', {}, ...chatWorkingLogoFacePaths.map(d => $.SVG<SVGPathElement>('path', { d, fill: 'currentColor' })));
		svg.append(defs, artwork, faces);
		const serializer = new XMLSerializer();
		let previousSvg: string | undefined;
		let pixels: ImageData | undefined;
		await whenIdle(targetWindow, token);
		for (let index = 0; index < chatWorkingLogoAtlasFrameCount; index++) {
			if (index > 0 && index % 32 === 0) {
				await timeout(0, token);
			}
			const frame = getChatWorkingLogoDrawFrame(index / chatWorkingLogoAtlasFrameCount);
			svg.setAttribute('shape-rendering', frame.assembled ? 'auto' : 'geometricPrecision');
			artwork.setAttribute('display', frame.assembled ? 'none' : 'inline');
			faces.setAttribute('display', frame.assembled ? 'inline' : 'none');
			for (const [bandIndex, band] of CHAT_WORKING_LOGO_DRAW_PAINT_ORDER.entries()) {
				masks[bandIndex].setAttribute('d', frame.paths[band]);
			}
			const serialized = serializer.serializeToString(svg);
			if (serialized !== previousSvg) {
				const url = URL.createObjectURL(new Blob([serialized], { type: 'image/svg+xml' }));
				try {
					await loadChatWorkingLogoAtlasImage(image, url, token);
					tileContext.clearRect(0, 0, width, height);
					tileContext.drawImage(image, 0, 0, width, height);
					pixels = tileContext.getImageData(0, 0, width, height);
					previousSvg = serialized;
				} finally {
					URL.revokeObjectURL(url);
				}
			}
			context.putImageData(pixels!, index % columns * (width + padding * 2) + padding, Math.floor(index / columns) * (height + padding * 2) + padding);
		}
		const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Unable to encode Draw atlas'))));
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const url = URL.createObjectURL(blob);
		return Object.assign(toDisposable(() => URL.revokeObjectURL(url)), { url, blob, width: canvas.width, height: canvas.height, frameWidth: width, frameHeight: height });
	} finally {
		image.removeAttribute('src');
		canvas.width = canvas.height = tile.width = tile.height = 0;
	}
}

export function getChatWorkingLogoAtlasKeyframes(atlas: IChatWorkingLogoAtlas, width: number, height: number): Keyframe[] {
	const scaleX = width / atlas.frameWidth;
	const scaleY = height / atlas.frameHeight;
	const transform = (index: number) => `translate3d(${-(index % columns * (atlas.frameWidth + padding * 2) + padding) * scaleX}px, ${-(Math.floor(index / columns) * (atlas.frameHeight + padding * 2) + padding) * scaleY}px, 0)`;
	const keyframes: Keyframe[] = Array.from({ length: chatWorkingLogoAtlasFrameCount }, (_, index) => ({
		offset: index / chatWorkingLogoAtlasFrameCount,
		transform: transform(index),
		easing: 'steps(1, end)',
	}));
	keyframes.push({ offset: 1, transform: transform(0) });
	return keyframes;
}

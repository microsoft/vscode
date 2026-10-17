/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/imageViewer.css';
import { $, addDisposableListener, EventHelper, EventType, getWindow, isAncestorOfActiveElement } from '../../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../../base/browser/mouseEvent.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { clamp } from '../../../../base/common/numbers.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { WebWorkerDescriptor } from '../../../../platform/webWorker/browser/webWorkerDescriptor.js';
import { IWebWorkerService } from '../../../../platform/webWorker/browser/webWorkerService.js';
import { FileAccess } from '../../../../base/common/network.js';
import { IEditorPane } from '../../../common/editor.js';
import { ImageEncoderWorker } from './imageEncoderWorker.js';

/**
 * Either a numeric zoom factor (`1` is the natural size) or `'fit'` to scale the image to fit
 * into the viewer.
 */
export type ImageViewerScale = number | 'fit';

export interface IImageViewerViewState {
	readonly scale: ImageViewerScale;
	readonly scrollLeft: number;
	readonly scrollTop: number;
}

export interface IImageViewerOptions {
	/**
	 * The element that holds keyboard focus for the viewer. Defaults to the viewer element.
	 *
	 * It is used to decide whether a click should zoom (clicks that only move focus into the
	 * viewer don't) and whether copying applies to the viewer. It also receives the native `copy`
	 * event and modifier key changes.
	 */
	readonly focusTarget?: HTMLElement;
}

export interface IImageViewerSourceOptions {
	/**
	 * Alternative text for the image.
	 */
	readonly alt: string;

	/**
	 * View state to restore once the image is shown. When omitted, the image is scaled to fit.
	 */
	readonly viewState?: IImageViewerViewState;

	/**
	 * The encoded image. PNG images are copied as is instead of being encoded again.
	 */
	readonly data?: IImageViewerSourceData;
}

export interface IImageViewerSourceData {
	readonly mimeType: string;
	read(): Promise<Uint8Array>;
}

/**
 * An editor pane that renders its content with an {@link ImageViewer}.
 */
export interface IImageViewerEditorPane extends IEditorPane {
	/**
	 * The viewer that shows the current image, if any.
	 */
	readonly imageViewer: ImageViewer | undefined;
}

export function isImageViewerEditorPane(pane: IEditorPane | undefined): pane is IImageViewerEditorPane {
	return !!pane && (pane as IImageViewerEditorPane).imageViewer instanceof ImageViewer;
}

/**
 * Context menu shown when right clicking an image in an {@link ImageViewer}. Commands contributed
 * to it are invoked with the viewer as their first argument.
 */
export const ImageViewerContextMenuId = new MenuId('ImageViewerContext');

/**
 * Enable `image-rendering: pixelated` for images scaled by more than this.
 */
const PIXELATION_THRESHOLD = 3;

const SCALE_PINCH_FACTOR = 0.075;
const MAX_SCALE = 20;
const MIN_SCALE = 0.1;

const ZOOM_LEVELS: readonly number[] = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.5, 2, 3, 5, 7, 10, 15, 20];

/**
 * Returns the next predefined zoom level when zooming in from `scale`.
 */
export function getNextZoomLevel(scale: number): number {
	return ZOOM_LEVELS.find(level => level > scale) ?? MAX_SCALE;
}

/**
 * Returns the previous predefined zoom level when zooming out from `scale`.
 */
export function getPreviousZoomLevel(scale: number): number {
	return ZOOM_LEVELS.findLast(level => level < scale) ?? MIN_SCALE;
}

interface IImageSize {
	readonly width?: number;
	readonly height?: number;
}

function getLargerDimension(width: number, height: number): IImageSize {
	return width >= height ? { width } : { height };
}

/**
 * Displays a single image with support for zooming (click, modifier + scroll wheel and pinch),
 * scrolling around zoomed images, and copying the image. Shared by the image preview editor and
 * the image carousel.
 */
export class ImageViewer extends Disposable {

	private static readonly _instances = new Set<ImageViewer>();

	/**
	 * Gets the viewer that currently has keyboard focus, if any.
	 */
	static getFocusedViewer(): ImageViewer | undefined {
		for (const viewer of ImageViewer._instances) {
			if (viewer.hasFocus()) {
				return viewer;
			}
		}
		return undefined;
	}

	readonly element: HTMLElement;

	private readonly _image: HTMLImageElement;
	private readonly _focusTarget: HTMLElement;

	private _scale: ImageViewerScale = 'fit';
	private _hasImage = false;
	private _sourceRequestId = 0;
	private _sourceData: IImageViewerSourceData | undefined;

	/**
	 * Whether the image needs an explicit size to be zoomed. Images without an intrinsic width,
	 * such as SVGs with only a viewBox, otherwise stretch to fill the viewer, which cancels out
	 * the zoom.
	 */
	private _needsExplicitSize = false;

	/**
	 * Size of the image when it was last scaled to fit.
	 */
	private _lastFitSize: IImageSize | undefined;

	private readonly _onDidChangeScale = this._register(new Emitter<ImageViewerScale>());
	readonly onDidChangeScale = this._onDidChangeScale.event;

	constructor(
		options: IImageViewerOptions,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IClipboardService private readonly _clipboardService: IClipboardService,
		@IWebWorkerService private readonly _webWorkerService: IWebWorkerService,
	) {
		super();

		this.element = $('.image-viewer');
		this._image = $<HTMLImageElement>('img.scale-to-fit');
		this._image.alt = '';
		this.element.appendChild(this._image);
		this._focusTarget = options.focusTarget ?? this.element;

		ImageViewer._instances.add(this);
		this._register(toDisposable(() => ImageViewer._instances.delete(this)));

		this._registerListeners();
	}

	get scale(): ImageViewerScale {
		return this._scale;
	}

	get hasImage(): boolean {
		return this._hasImage;
	}

	/**
	 * Whether keyboard focus is in the viewer or its focus target.
	 */
	hasFocus(): boolean {
		return isAncestorOfActiveElement(this._focusTarget);
	}

	/**
	 * The natural size of the current image, if it has loaded.
	 */
	get naturalSize(): { readonly width: number; readonly height: number } | undefined {
		if (!this._hasImage) {
			return undefined;
		}
		return { width: this._image.naturalWidth, height: this._image.naturalHeight };
	}

	/**
	 * Shows the image at `src`. The image is decoded before it replaces the current one, so
	 * switching between images doesn't flash.
	 *
	 * @returns `true` if the image was decoded and shown, `false` if it failed to decode or a
	 * newer call superseded this one.
	 */
	async setSource(src: string, options: IImageViewerSourceOptions): Promise<boolean> {
		const requestId = ++this._sourceRequestId;

		const loader = new Image();
		loader.src = src;
		let decoded = true;
		try {
			await loader.decode();
		} catch {
			decoded = false;
		}

		if (requestId !== this._sourceRequestId || this._store.isDisposed) {
			return false;
		}

		this._image.src = src;
		this._image.alt = options.alt;
		this._sourceData = options.data;
		this._hasImage = decoded;
		this.element.classList.toggle('ready', decoded);
		if (!decoded) {
			this._applyScale('fit');
			return false;
		}

		this._needsExplicitSize = !this._hasIntrinsicWidth(loader);
		this._lastFitSize = undefined;
		this._applyScale('fit');

		const viewState = options.viewState;
		if (viewState && viewState.scale !== 'fit') {
			this._applyScale(viewState.scale);
			this.element.scrollTo(viewState.scrollLeft, viewState.scrollTop);
		}
		return true;
	}

	/**
	 * Discards an image that is still loading, so it doesn't replace the current one.
	 */
	cancelPendingSource(): void {
		this._sourceRequestId++;
	}

	/**
	 * Removes the current image.
	 */
	clear(): void {
		this._sourceRequestId++;
		this._applyScale('fit');
		this._hasImage = false;
		this.element.classList.remove('ready');
		this._image.removeAttribute('src');
		this._image.alt = '';
		this._sourceData = undefined;
	}

	getViewState(): IImageViewerViewState {
		return {
			scale: this._scale,
			scrollLeft: this.element.scrollLeft,
			scrollTop: this.element.scrollTop,
		};
	}

	setScale(scale: ImageViewerScale): void {
		this._applyScale(scale);
	}

	zoomIn(): void {
		if (this._hasImage) {
			this._applyScale(getNextZoomLevel(this._getNumericScale()));
		}
	}

	zoomOut(): void {
		if (this._hasImage) {
			this._applyScale(getPreviousZoomLevel(this._getNumericScale()));
		}
	}

	/**
	 * Copies the current image to the clipboard as a PNG.
	 */
	async copyImage(): Promise<void> {
		if (!this._hasImage) {
			return;
		}

		// Pass the pending image instead of awaiting it, so the clipboard write starts while the
		// user gesture that triggered the copy is still being handled
		const data = this._sourceData;
		const png = data?.mimeType === 'image/png' ? this._readPng(data) : this._encodeAsPng();
		return this._clipboardService.writeImage(png);
	}

	private _registerListeners(): void {
		this._register(addDisposableListener(this.element, EventType.MOUSE_WHEEL, (e: WheelEvent) => {
			// Pinching is reported as scroll wheel + ctrl. Never let it zoom the whole window.
			if (e.ctrlKey) {
				e.preventDefault();
			}

			if (!this._hasImage) {
				return;
			}

			const isZoomModifier = isMacintosh ? e.altKey : e.ctrlKey;
			if (!isZoomModifier && !e.ctrlKey) {
				return;
			}

			e.preventDefault();
			if (e.deltaY === 0) {
				return;
			}

			const delta = e.deltaY > 0 ? 1 : -1;
			this._applyScale(this._getNumericScale() * (1 - delta * SCALE_PINCH_FACTOR));
		}, { passive: false }));

		// Track focus and modifiers at mouse down, since focus moves before the click event fires
		let consumeClick = false;
		let zoomOutOnClick = false;
		this._register(addDisposableListener(this.element, EventType.MOUSE_DOWN, (e: MouseEvent) => {
			if (e.button !== 0) {
				return;
			}
			consumeClick = !isAncestorOfActiveElement(this._focusTarget);
			zoomOutOnClick = isMacintosh ? e.altKey : e.ctrlKey;
		}));

		this._register(addDisposableListener(this.element, EventType.CLICK, (e: MouseEvent) => {
			if (e.button !== 0 || !this._hasImage) {
				return;
			}

			// Don't zoom when the click only focuses the viewer
			if (consumeClick) {
				consumeClick = false;
				return;
			}

			if (zoomOutOnClick) {
				this.zoomOut();
			} else {
				this.zoomIn();
			}
		}));

		const updateZoomOutCursor = (e: KeyboardEvent | MouseEvent) => {
			this.element.classList.toggle('zoom-out', isMacintosh ? e.altKey : e.ctrlKey);
		};
		this._register(addDisposableListener(this._focusTarget, EventType.KEY_DOWN, updateZoomOutCursor));
		this._register(addDisposableListener(this._focusTarget, EventType.KEY_UP, updateZoomOutCursor));
		this._register(addDisposableListener(this.element, EventType.MOUSE_MOVE, updateZoomOutCursor));

		// Handle the browser's native copy, since the copy command has no keybinding in browsers. Text
		// selected next to the image, such as the carousel's caption, is copied as usual.
		this._register(addDisposableListener(this._focusTarget, 'copy', (e: ClipboardEvent) => {
			const selection = getWindow(this.element).getSelection();
			const hasSelectedText = !!selection && !selection.isCollapsed && this._focusTarget.contains(selection.anchorNode);
			if (!this._hasImage || !this.hasFocus() || hasSelectedText) {
				return;
			}
			e.preventDefault();
			this.copyImage().catch(onUnexpectedError);
		}));

		this._register(addDisposableListener(this.element, EventType.CONTEXT_MENU, (e: MouseEvent) => {
			if (!this._hasImage) {
				return;
			}

			EventHelper.stop(e, true);
			this._contextMenuService.showContextMenu({
				menuId: ImageViewerContextMenuId,
				menuActionOptions: { arg: this, shouldForwardArgs: true },
				contextKeyService: this._contextKeyService,
				getAnchor: () => new StandardMouseEvent(getWindow(this.element), e),
			});
		}));
	}

	/**
	 * Returns the current scale as a number, computing the effective scale when the image is
	 * scaled to fit.
	 */
	private _getNumericScale(): number {
		if (this._scale !== 'fit') {
			return this._scale;
		}

		const size = this._needsExplicitSize ? this._getBaseSize() : { width: this._image.naturalWidth };
		if (size?.width) {
			return this._image.clientWidth / size.width;
		}
		if (size?.height) {
			return this._image.clientHeight / size.height;
		}
		return 1;
	}

	/**
	 * Applies fit-to-viewer or a numeric zoom while preserving the visible center of the image.
	 */
	private _applyScale(newScale: ImageViewerScale): void {
		const container = this.element;
		const image = this._image;

		if (newScale === 'fit') {
			const changed = this._scale !== 'fit';
			this._scale = 'fit';
			image.classList.add('scale-to-fit');
			image.classList.remove('pixelated');
			image.style.zoom = '';
			image.style.width = '';
			image.style.height = '';

			// Remove the overflow before scrolling to avoid an expensive synchronous scroll layer update
			const wasZoomed = container.classList.contains('zoomed');
			container.classList.remove('zoomed');
			if (wasZoomed) {
				container.scrollTo(0, 0);
			}

			if (changed) {
				this._onDidChangeScale.fire(this._scale);
			}
			return;
		}

		if (!this._hasImage) {
			return;
		}

		const scale = clamp(newScale, MIN_SCALE, MAX_SCALE);
		this._scale = scale;

		// Capture the scroll center ratio before changing the zoom
		const dx = container.scrollWidth > 0 ? (container.scrollLeft + container.clientWidth / 2) / container.scrollWidth : 0.5;
		const dy = container.scrollHeight > 0 ? (container.scrollTop + container.clientHeight / 2) / container.scrollHeight : 0.5;

		// Must be read before leaving scale-to-fit since it may depend on the fitted size
		const size = this._needsExplicitSize ? this._getBaseSize() : undefined;

		image.classList.remove('scale-to-fit');
		image.classList.toggle('pixelated', scale >= PIXELATION_THRESHOLD);
		image.style.width = size?.width ? `${size.width}px` : '';
		image.style.height = size?.height ? `${size.height}px` : '';
		image.style.zoom = String(scale);
		container.classList.add('zoomed');

		// Setting the zoom triggers a synchronous layout, so the scroll size reflects the new zoom
		container.scrollTo(
			container.scrollWidth * dx - container.clientWidth / 2,
			container.scrollHeight * dy - container.clientHeight / 2,
		);

		this._onDidChangeScale.fire(this._scale);
	}

	/**
	 * Gets the size of the image at a zoom level of 1.
	 *
	 * Only the larger dimension is returned as the other one follows from the aspect ratio. Natural
	 * sizes are rounded, so the smaller dimension of a very thin SVG may otherwise be reported as 0.
	 */
	private _getBaseSize(): IImageSize | undefined {
		const image = this._image;
		if (image.classList.contains('scale-to-fit') && (image.clientWidth || image.clientHeight)) {
			this._lastFitSize = getLargerDimension(image.clientWidth, image.clientHeight);
		}

		if (image.naturalWidth || image.naturalHeight) {
			return getLargerDimension(image.naturalWidth, image.naturalHeight);
		}

		// Images without intrinsic dimensions (e.g. SVGs with only a viewBox) may report no natural
		// size. Fall back to the size the image had when it was last scaled to fit.
		return this._lastFitSize;
	}

	/**
	 * Checks if the image keeps its natural width in a container that is much wider than it.
	 */
	private _hasIntrinsicWidth(image: HTMLImageElement): boolean {
		const probe = $('div');
		probe.style.position = 'absolute';
		probe.style.visibility = 'hidden';
		probe.style.width = '100000px';
		probe.appendChild(image);
		getWindow(this.element).document.body.appendChild(probe);
		const result = Math.abs(image.clientWidth - image.naturalWidth) <= 1;
		probe.remove();
		return result;
	}

	/**
	 * Reads the source PNG so it can be copied without encoding it again, which is both faster and
	 * lossless. Falls back to encoding when the data turns out not to be a PNG.
	 */
	private async _readPng(data: IImageViewerSourceData): Promise<Uint8Array> {
		try {
			const bytes = await data.read();
			if (isPng(bytes)) {
				return bytes;
			}
		} catch {
			// Encode the displayed image instead
		}
		return this._encodeAsPng();
	}

	private async _encodeAsPng(): Promise<Uint8Array> {
		const width = this._image.naturalWidth || this._image.clientWidth;
		const height = this._image.naturalHeight || this._image.clientHeight;
		const canvas = width && height ? new OffscreenCanvas(width, height) : undefined;
		const context = canvas?.getContext('2d');
		if (!canvas || !context) {
			throw new Error('Failed to encode image');
		}

		// Draw on the main thread so that EXIF orientation, color conversion and the current frame of
		// animated images match what is shown
		context.drawImage(this._image, 0, 0, width, height);
		const bitmap = canvas.transferToImageBitmap();
		try {
			return await this._encodeInWorker(bitmap);
		} catch {
			// For example when workers can't be created
			return await this._encodeOnMainThread(bitmap);
		} finally {
			bitmap.close();
		}
	}

	/**
	 * Encodes in a worker, since the main thread encodes canvases using idle tasks, which can be
	 * starved for seconds while the renderer is busy.
	 */
	private async _encodeInWorker(bitmap: ImageBitmap): Promise<Uint8Array> {
		const worker = this._webWorkerService.createWorkerClient<ImageEncoderWorker>(new WebWorkerDescriptor({
			esmModuleLocation: FileAccess.asBrowserUri('vs/workbench/contrib/mediaPreview/browser/imageEncoderWorkerMain.js'),
			label: 'ImageEncoderWorker',
		}));
		try {
			return new Uint8Array(await worker.proxy.$encodePng(bitmap));
		} finally {
			worker.dispose();
		}
	}

	private _encodeOnMainThread(bitmap: ImageBitmap): Promise<Uint8Array> {
		return new Promise((resolve, reject) => {
			const canvas = $<HTMLCanvasElement>('canvas');
			canvas.width = bitmap.width;
			canvas.height = bitmap.height;
			const context = canvas.getContext('2d');
			if (!context) {
				reject(new Error('Failed to encode image'));
				return;
			}
			context.drawImage(bitmap, 0, 0);
			canvas.toBlob(async blob => {
				canvas.width = canvas.height = 0;
				if (blob) {
					resolve(new Uint8Array(await blob.arrayBuffer()));
				} else {
					reject(new Error('Failed to encode image'));
				}
			}, 'image/png');
		});
	}
}

const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function isPng(data: Uint8Array): boolean {
	return data.length >= pngSignature.length && pngSignature.every((byte, i) => data[i] === byte);
}

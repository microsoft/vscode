/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/resourceviewer';
import * as nls from 'vs/nls';
import * as mimes from 'vs/base/common/mime';
import URI from 'vs/base/common/uri';
import * as paths from 'vs/base/common/paths';
import { Builder, $ } from 'vs/base/browser/builder';
import * as DOM from 'vs/base/browser/dom';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { LRUCache } from 'vs/base/common/map';
import { Schemas } from 'vs/base/common/network';
import { clamp } from 'vs/base/common/numbers';
import { Themable } from 'vs/workbench/common/theme';
import { IStatusbarItem, StatusbarItemDescriptor, IStatusbarRegistry, Extensions, StatusbarAlignment } from 'vs/workbench/browser/parts/statusbar/statusbar';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { } from 'vs/platform/workspace/common/workspace';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { Registry } from 'vs/platform/registry/common/platform';
import { TPromise } from 'vs/base/common/winjs.base';
import { Action } from 'vs/base/common/actions';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { memoize } from 'vs/base/common/decorators';
import * as platform from 'vs/base/common/platform';

interface MapExtToMediaMimes {
	[index: string]: string;
}

// Known media mimes that we can handle
const mapExtToMediaMimes: MapExtToMediaMimes = {
	'.bmp': 'image/bmp',
	'.gif': 'image/gif',
	'.jpg': 'image/jpg',
	'.jpeg': 'image/jpg',
	'.jpe': 'image/jpg',
	'.png': 'image/png',
	'.tiff': 'image/tiff',
	'.tif': 'image/tiff',
	'.ico': 'image/x-icon',
	'.tga': 'image/x-tga',
	'.psd': 'image/vnd.adobe.photoshop',
	'.webp': 'image/webp',
	'.mid': 'audio/midi',
	'.midi': 'audio/midi',
	'.mp4a': 'audio/mp4',
	'.mpga': 'audio/mpeg',
	'.mp2': 'audio/mpeg',
	'.mp2a': 'audio/mpeg',
	'.mp3': 'audio/mpeg',
	'.m2a': 'audio/mpeg',
	'.m3a': 'audio/mpeg',
	'.oga': 'audio/ogg',
	'.ogg': 'audio/ogg',
	'.spx': 'audio/ogg',
	'.aac': 'audio/x-aac',
	'.wav': 'audio/x-wav',
	'.wma': 'audio/x-ms-wma',
	'.mp4': 'video/mp4',
	'.mp4v': 'video/mp4',
	'.mpg4': 'video/mp4',
	'.mpeg': 'video/mpeg',
	'.mpg': 'video/mpeg',
	'.mpe': 'video/mpeg',
	'.m1v': 'video/mpeg',
	'.m2v': 'video/mpeg',
	'.ogv': 'video/ogg',
	'.qt': 'video/quicktime',
	'.mov': 'video/quicktime',
	'.webm': 'video/webm',
	'.mkv': 'video/x-matroska',
	'.mk3d': 'video/x-matroska',
	'.mks': 'video/x-matroska',
	'.wmv': 'video/x-ms-wmv',
	'.flv': 'video/x-flv',
	'.avi': 'video/x-msvideo',
	'.movie': 'video/x-sgi-movie'
};

export interface IResourceDescriptor {
	resource: URI;
	name: string;
	size: number;
	etag: string;
	mime: string;
}

class BinarySize {
	public static readonly KB = 1024;
	public static readonly MB = BinarySize.KB * BinarySize.KB;
	public static readonly GB = BinarySize.MB * BinarySize.KB;
	public static readonly TB = BinarySize.GB * BinarySize.KB;

	public static formatSize(size: number): string {
		if (size < BinarySize.KB) {
			return nls.localize('sizeB', "{0}B", size);
		}

		if (size < BinarySize.MB) {
			return nls.localize('sizeKB', "{0}KB", (size / BinarySize.KB).toFixed(2));
		}

		if (size < BinarySize.GB) {
			return nls.localize('sizeMB', "{0}MB", (size / BinarySize.MB).toFixed(2));
		}

		if (size < BinarySize.TB) {
			return nls.localize('sizeGB', "{0}GB", (size / BinarySize.GB).toFixed(2));
		}

		return nls.localize('sizeTB', "{0}TB", (size / BinarySize.TB).toFixed(2));
	}
}

export interface ResourceViewerContext {
	layout(dimension: DOM.Dimension): void;
}

/**
 * Helper to actually render the given resource into the provided container. Will adjust scrollbar (if provided) automatically based on loading
 * progress of the binary resource.
 */
export class ResourceViewer {

	private static readonly MAX_OPEN_INTERNAL_SIZE = BinarySize.MB * 200; // max size until we offer an action to open internally

	public static show(
		descriptor: IResourceDescriptor,
		container: HTMLElement,
		scrollbar: DomScrollableElement,
		openInternalClb: (uri: URI) => void,
		openExternalClb: (uri: URI) => void,
		metadataClb: (meta: string) => void
	): ResourceViewerContext | null {

		// Ensure CSS class
		$(container).setClass('monaco-resource-viewer');

		// Images
		if (ResourceViewer.isImageResource(descriptor)) {
			return ImageView.create(container, descriptor, scrollbar, openExternalClb, metadataClb);
		}

		// Large Files
		if (descriptor.size > ResourceViewer.MAX_OPEN_INTERNAL_SIZE) {
			FileTooLargeFileView.create(container, descriptor, scrollbar, metadataClb);
		}

		// Seemingly Binary Files
		else {
			FileSeemsBinaryFileView.create(container, descriptor, scrollbar, openInternalClb, metadataClb);
		}

		return null;
	}

	private static isImageResource(descriptor: IResourceDescriptor) {
		const mime = ResourceViewer.getMime(descriptor);

		return mime.indexOf('image/') >= 0;
	}

	private static getMime(descriptor: IResourceDescriptor): string {
		let mime = descriptor.mime;
		if (!mime && descriptor.resource.scheme !== Schemas.data) {
			const ext = paths.extname(descriptor.resource.toString());
			if (ext) {
				mime = mapExtToMediaMimes[ext.toLowerCase()];
			}
		}

		return mime || mimes.MIME_BINARY;
	}
}

class ImageView {
	private static readonly MAX_IMAGE_SIZE = BinarySize.MB; // showing images inline is memory intense, so we have a limit
	private static readonly BASE64_MARKER = 'base64,';

	public static create(
		container: HTMLElement,
		descriptor: IResourceDescriptor,
		scrollbar: DomScrollableElement,
		openExternalClb: (uri: URI) => void,
		metadataClb: (meta: string) => void
	): ResourceViewerContext | null {
		if (ImageView.shouldShowImageInline(descriptor)) {
			return InlineImageView.create(container, descriptor, scrollbar, metadataClb);
		}

		LargeImageView.create(container, descriptor, openExternalClb);

		return null;
	}

	private static shouldShowImageInline(descriptor: IResourceDescriptor): boolean {
		let skipInlineImage: boolean;

		// Data URI
		if (descriptor.resource.scheme === Schemas.data) {
			const base64MarkerIndex = descriptor.resource.path.indexOf(ImageView.BASE64_MARKER);
			const hasData = base64MarkerIndex >= 0 && descriptor.resource.path.substring(base64MarkerIndex + ImageView.BASE64_MARKER.length).length > 0;

			skipInlineImage = !hasData || descriptor.size > ImageView.MAX_IMAGE_SIZE || descriptor.resource.path.length > ImageView.MAX_IMAGE_SIZE;
		}

		// File URI
		else {
			skipInlineImage = typeof descriptor.size !== 'number' || descriptor.size > ImageView.MAX_IMAGE_SIZE;
		}

		return !skipInlineImage;
	}
}

class LargeImageView {
	public static create(
		container: HTMLElement,
		descriptor: IResourceDescriptor,
		openExternalClb: (uri: URI) => void
	) {
		const size = BinarySize.formatSize(descriptor.size);

		const imageContainer = $(container)
			.empty()
			.p({
				text: nls.localize('largeImageError', "The image is not displayed in the editor because it is too large ({0}).", size)
			});

		if (descriptor.resource.scheme !== Schemas.data) {
			imageContainer.append($('a', {
				role: 'button',
				class: 'embedded-link',
				text: nls.localize('resourceOpenExternalButton', "Open image using external program?")
			}).on(DOM.EventType.CLICK, (e) => {
				openExternalClb(descriptor.resource);
			}));
		}
	}
}

class FileTooLargeFileView {
	public static create(
		container: HTMLElement,
		descriptor: IResourceDescriptor,
		scrollbar: DomScrollableElement,
		metadataClb: (meta: string) => void
	) {
		const size = BinarySize.formatSize(descriptor.size);

		$(container)
			.empty()
			.span({
				text: nls.localize('nativeFileTooLargeError', "The file is not displayed in the editor because it is too large ({0}).", size)
			});

		if (metadataClb) {
			metadataClb(size);
		}

		scrollbar.scanDomNode();
	}
}

class FileSeemsBinaryFileView {
	public static create(
		container: HTMLElement,
		descriptor: IResourceDescriptor,
		scrollbar: DomScrollableElement,
		openInternalClb: (uri: URI) => void,
		metadataClb: (meta: string) => void
	) {
		const binaryContainer = $(container)
			.empty()
			.p({
				text: nls.localize('nativeBinaryError', "The file is not displayed in the editor because it is either binary or uses an unsupported text encoding.")
			});

		if (descriptor.resource.scheme !== Schemas.data) {
			binaryContainer.append($('a', {
				role: 'button',
				class: 'embedded-link',
				text: nls.localize('openAsText', "Do you want to open it anyway?")
			}).on(DOM.EventType.CLICK, (e) => {
				openInternalClb(descriptor.resource);
			}));
		}

		if (metadataClb) {
			metadataClb(BinarySize.formatSize(descriptor.size));
		}

		scrollbar.scanDomNode();
	}
}

type Scale = number | 'fit';

class ZoomStatusbarItem extends Themable implements IStatusbarItem {
	showTimeout: number;
	public static instance: ZoomStatusbarItem;

	private statusBarItem: HTMLElement;

	private onSelectScale?: (scale: Scale) => void;

	constructor(
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IEditorGroupService editorGroupService: IEditorGroupService,
		@IThemeService themeService: IThemeService
	) {
		super(themeService);
		ZoomStatusbarItem.instance = this;
		this.toUnbind.push(editorGroupService.onEditorsChanged(() => this.onEditorsChanged()));
	}

	private onEditorsChanged(): void {
		this.hide();
		this.onSelectScale = void 0;
	}

	public show(scale: Scale, onSelectScale: (scale: number) => void) {
		clearTimeout(this.showTimeout);
		this.showTimeout = setTimeout(() => {
			this.onSelectScale = onSelectScale;
			this.statusBarItem.style.display = 'block';
			this.updateLabel(scale);
		}, 0);
	}

	public hide() {
		this.statusBarItem.style.display = 'none';
	}

	public render(container: HTMLElement): IDisposable {
		if (!this.statusBarItem && container) {
			this.statusBarItem = $(container).a()
				.addClass('.zoom-statusbar-item')
				.on('click', () => {
					this.contextMenuService.showContextMenu({
						getAnchor: () => container,
						getActions: () => TPromise.as(this.zoomActions)
					});
				})
				.getHTMLElement();
			this.statusBarItem.style.display = 'none';
		}

		return this;
	}

	private updateLabel(scale: Scale) {
		this.statusBarItem.textContent = ZoomStatusbarItem.zoomLabel(scale);
	}

	@memoize
	private get zoomActions(): Action[] {
		const scales: Scale[] = [10, 5, 2, 1, 0.5, 0.2, 'fit'];
		return scales.map(scale =>
			new Action(`zoom.${scale}`, ZoomStatusbarItem.zoomLabel(scale), void 0, void 0, () => {
				if (this.onSelectScale) {
					this.onSelectScale(scale);
				}

				return null;
			}));
	}

	private static zoomLabel(scale: Scale): string {
		return scale === 'fit'
			? nls.localize('zoom.action.fit.label', 'Whole Image')
			: `${Math.round(scale * 100)}%`;
	}
}

Registry.as<IStatusbarRegistry>(Extensions.Statusbar).registerStatusbarItem(
	new StatusbarItemDescriptor(ZoomStatusbarItem, StatusbarAlignment.RIGHT, 101 /* to the left of editor status (100) */)
);

interface ImageState {
	scale: Scale;
	offsetX: number;
	offsetY: number;
}

class InlineImageView {
	private static readonly SCALE_PINCH_FACTOR = 0.075;
	private static readonly MAX_SCALE = 20;
	private static readonly MIN_SCALE = 0.1;

	private static readonly zoomLevels: Scale[] = [
		0.1,
		0.2,
		0.3,
		0.4,
		0.5,
		0.6,
		0.7,
		0.8,
		0.9,
		1,
		1.5,
		2,
		3,
		5,
		7,
		10,
		15,
		20
	];

	/**
	 * Enable image-rendering: pixelated for images scaled by more than this.
	 */
	private static readonly PIXELATION_THRESHOLD = 3;

	/**
	 * Chrome is caching images very aggressively and so we use the ETag information to find out if
	 * we need to bypass the cache or not. We could always bypass the cache everytime we show the image
	 * however that has very bad impact on memory consumption because each time the image gets shown,
	 * memory grows (see also https://github.com/electron/electron/issues/6275)
	 */
	private static IMAGE_RESOURCE_ETAG_CACHE = new LRUCache<string, { etag: string, src: string }>(100);

	/**
	 * Store the scale and position of an image so it can be restored when changing editor tabs
	 */
	private static readonly imageStateCache = new LRUCache<string, ImageState>(100);

	public static create(
		container: HTMLElement,
		descriptor: IResourceDescriptor,
		scrollbar: DomScrollableElement,
		metadataClb: (meta: string) => void
	) {
		const context = {
			layout(dimension: DOM.Dimension) { }
		};

		const cacheKey = descriptor.resource.toString();

		let ctrlPressed = false;
		let altPressed = false;

		const initialState: ImageState = InlineImageView.imageStateCache.get(cacheKey) || { scale: 'fit', offsetX: 0, offsetY: 0 };
		let scale = initialState.scale;
		let img: Builder | null = null;
		let imgElement: HTMLImageElement | null = null;

		function updateScale(newScale: Scale) {
			if (!img || !imgElement.parentElement) {
				return;
			}

			if (newScale === 'fit') {
				scale = 'fit';
				img.addClass('scale-to-fit');
				img.removeClass('pixelated');
				img.style('min-width', 'auto');
				img.style('width', 'auto');
				InlineImageView.imageStateCache.set(cacheKey, null);
			} else {
				const oldWidth = imgElement.width;
				const oldHeight = imgElement.height;

				scale = clamp(newScale, InlineImageView.MIN_SCALE, InlineImageView.MAX_SCALE);
				if (scale >= InlineImageView.PIXELATION_THRESHOLD) {
					img.addClass('pixelated');
				} else {
					img.removeClass('pixelated');
				}

				const { scrollTop, scrollLeft } = imgElement.parentElement;
				const dx = (scrollLeft + imgElement.parentElement.clientWidth / 2) / imgElement.parentElement.scrollWidth;
				const dy = (scrollTop + imgElement.parentElement.clientHeight / 2) / imgElement.parentElement.scrollHeight;

				img.removeClass('scale-to-fit');
				img.style('min-width', `${(imgElement.naturalWidth * scale)}px`);
				img.style('width', `${(imgElement.naturalWidth * scale)}px`);

				const newWidth = imgElement.width;
				const scaleFactor = (newWidth - oldWidth) / oldWidth;

				const newScrollLeft = ((oldWidth * scaleFactor * dx) + scrollLeft);
				const newScrollTop = ((oldHeight * scaleFactor * dy) + scrollTop);
				scrollbar.setScrollPosition({
					scrollLeft: newScrollLeft,
					scrollTop: newScrollTop,
				});

				InlineImageView.imageStateCache.set(cacheKey, { scale: scale, offsetX: newScrollLeft, offsetY: newScrollTop });

			}
			ZoomStatusbarItem.instance.show(scale, updateScale);
			scrollbar.scanDomNode();
		}

		function firstZoom() {
			scale = imgElement.clientWidth / imgElement.naturalWidth;
			updateScale(scale);
		}

		$(container)
			.on(DOM.EventType.KEY_DOWN, (e: KeyboardEvent, c) => {
				if (!img) {
					return;
				}
				ctrlPressed = e.ctrlKey;
				altPressed = e.altKey;

				if (platform.isMacintosh ? altPressed : ctrlPressed) {
					c.removeClass('zoom-in').addClass('zoom-out');
				}
			})
			.on(DOM.EventType.KEY_UP, (e: KeyboardEvent, c) => {
				if (!img) {
					return;
				}

				ctrlPressed = e.ctrlKey;
				altPressed = e.altKey;

				if (!(platform.isMacintosh ? altPressed : ctrlPressed)) {
					c.removeClass('zoom-out').addClass('zoom-in');
				}
			})
			.on(DOM.EventType.CLICK, (e: MouseEvent) => {
				if (!img) {
					return;
				}

				if (e.button !== 0) {
					return;
				}

				// left click
				if (scale === 'fit') {
					firstZoom();
				}

				if (!(platform.isMacintosh ? altPressed : ctrlPressed)) { // zoom in
					let i = 0;
					for (; i < InlineImageView.zoomLevels.length; ++i) {
						if (InlineImageView.zoomLevels[i] > scale) {
							break;
						}
					}
					updateScale(InlineImageView.zoomLevels[i] || InlineImageView.MAX_SCALE);
				} else {
					let i = InlineImageView.zoomLevels.length - 1;
					for (; i >= 0; --i) {
						if (InlineImageView.zoomLevels[i] < scale) {
							break;
						}
					}
					updateScale(InlineImageView.zoomLevels[i] || InlineImageView.MIN_SCALE);
				}
			})
			.on(DOM.EventType.WHEEL, (e: WheelEvent) => {
				if (!img) {
					return;
				}

				const isScrollWhellKeyPressed = platform.isMacintosh ? altPressed : ctrlPressed;
				if (!isScrollWhellKeyPressed && !e.ctrlKey) { // pinching is reported as scroll wheel + ctrl
					return;
				}

				e.preventDefault();
				e.stopPropagation();

				if (scale === 'fit') {
					firstZoom();
				}

				let delta = e.deltaY < 0 ? 1 : -1;

				// Pinching should increase the scale
				if (e.ctrlKey && !isScrollWhellKeyPressed) {
					delta *= -1;
				}
				updateScale(scale as number * (1 - delta * InlineImageView.SCALE_PINCH_FACTOR));
			})
			.on(DOM.EventType.SCROLL, () => {
				if (!imgElement || !imgElement.parentElement || scale === 'fit') {
					return;
				}

				const entry = InlineImageView.imageStateCache.get(cacheKey);
				if (entry) {
					const { scrollTop, scrollLeft } = imgElement.parentElement;
					InlineImageView.imageStateCache.set(cacheKey, { scale: entry.scale, offsetX: scrollLeft, offsetY: scrollTop });
				}
			});

		$(container)
			.empty()
			.addClass('image', 'zoom-in')
			.img({ src: InlineImageView.imageSrc(descriptor) })
			.style('visibility', 'hidden')
			.addClass('scale-to-fit')
			.on(DOM.EventType.LOAD, (e, i) => {
				img = i;
				imgElement = img.getHTMLElement() as HTMLImageElement;
				metadataClb(nls.localize('imgMeta', '{0}x{1} {2}', imgElement.naturalWidth, imgElement.naturalHeight, BinarySize.formatSize(descriptor.size)));
				scrollbar.scanDomNode();
				img.style('visibility', 'visible');
				updateScale(scale);
				if (initialState.scale !== 'fit') {
					scrollbar.setScrollPosition({
						scrollLeft: initialState.offsetX,
						scrollTop: initialState.offsetY,
					});
				}
			});

		return context;
	}

	private static imageSrc(descriptor: IResourceDescriptor): string {
		if (descriptor.resource.scheme === Schemas.data) {
			return descriptor.resource.toString(true /* skip encoding */);
		}

		const src = descriptor.resource.toString();

		let cached = InlineImageView.IMAGE_RESOURCE_ETAG_CACHE.get(src);
		if (!cached) {
			cached = { etag: descriptor.etag, src };
			InlineImageView.IMAGE_RESOURCE_ETAG_CACHE.set(src, cached);
		}

		if (cached.etag !== descriptor.etag) {
			cached.etag = descriptor.etag;
			cached.src = `${src}?${Date.now()}`; // bypass cache with this trick
		}

		return cached.src;
	}
}
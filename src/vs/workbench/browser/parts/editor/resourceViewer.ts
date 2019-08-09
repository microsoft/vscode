/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/resourceviewer';
import * as nls from 'vs/nls';
import * as mimes from 'vs/base/common/mime';
import { URI } from 'vs/base/common/uri';
import * as DOM from 'vs/base/browser/dom';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { LRUCache } from 'vs/base/common/map';
import { Schemas } from 'vs/base/common/network';
import { clamp } from 'vs/base/common/numbers';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IDisposable, Disposable, toDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import { Action } from 'vs/base/common/actions';
import { memoize } from 'vs/base/common/decorators';
import * as platform from 'vs/base/common/platform';
import { IFileService } from 'vs/platform/files/common/files';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from 'vs/platform/statusbar/common/statusbar';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITheme, registerThemingParticipant, ICssStyleCollector } from 'vs/platform/theme/common/themeService';
import { IMAGE_PREVIEW_BORDER } from 'vs/workbench/common/theme';

export interface IResourceDescriptor {
	readonly resource: URI;
	readonly name: string;
	readonly size: number;
	readonly etag?: string;
	readonly mime: string;
}

class BinarySize {
	static readonly KB = 1024;
	static readonly MB = BinarySize.KB * BinarySize.KB;
	static readonly GB = BinarySize.MB * BinarySize.KB;
	static readonly TB = BinarySize.GB * BinarySize.KB;

	static formatSize(size: number): string {
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

export interface ResourceViewerContext extends IDisposable {
	layout?(dimension: DOM.Dimension): void;
}

interface ResourceViewerDelegate {
	openInternalClb(uri: URI): void;
	openExternalClb?(uri: URI): void;
	metadataClb(meta: string): void;
}

registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {
	const borderColor = theme.getColor(IMAGE_PREVIEW_BORDER);
	collector.addRule(`.monaco-resource-viewer.image img { border : 1px solid ${borderColor ? borderColor.toString() : ''}; }`);
});

/**
 * Helper to actually render the given resource into the provided container. Will adjust scrollbar (if provided) automatically based on loading
 * progress of the binary resource.
 */
export class ResourceViewer {

	private static readonly MAX_OPEN_INTERNAL_SIZE = BinarySize.MB * 200; // max size until we offer an action to open internally

	static show(
		descriptor: IResourceDescriptor,
		fileService: IFileService,
		container: HTMLElement,
		scrollbar: DomScrollableElement,
		delegate: ResourceViewerDelegate,
		instantiationService: IInstantiationService,
	): ResourceViewerContext {

		// Ensure CSS class
		container.className = 'monaco-resource-viewer';

		// Images
		if (ResourceViewer.isImageResource(descriptor)) {
			return ImageView.create(container, descriptor, fileService, scrollbar, delegate, instantiationService);
		}

		// Large Files
		if (descriptor.size > ResourceViewer.MAX_OPEN_INTERNAL_SIZE) {
			return FileTooLargeFileView.create(container, descriptor, scrollbar, delegate);
		}

		// Seemingly Binary Files
		else {
			return FileSeemsBinaryFileView.create(container, descriptor, scrollbar, delegate);
		}
	}

	private static isImageResource(descriptor: IResourceDescriptor) {
		const mime = getMime(descriptor);

		// Chrome does not support tiffs
		return mime.indexOf('image/') >= 0 && mime !== 'image/tiff';
	}
}

class ImageView {
	private static readonly MAX_IMAGE_SIZE = BinarySize.MB * 10; // showing images inline is memory intense, so we have a limit
	private static readonly BASE64_MARKER = 'base64,';

	static create(
		container: HTMLElement,
		descriptor: IResourceDescriptor,
		fileService: IFileService,
		scrollbar: DomScrollableElement,
		delegate: ResourceViewerDelegate,
		instantiationService: IInstantiationService,
	): ResourceViewerContext {
		if (ImageView.shouldShowImageInline(descriptor)) {
			return InlineImageView.create(container, descriptor, fileService, scrollbar, delegate, instantiationService);
		}

		return LargeImageView.create(container, descriptor, delegate);
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
	static create(
		container: HTMLElement,
		descriptor: IResourceDescriptor,
		delegate: ResourceViewerDelegate
	) {
		const size = BinarySize.formatSize(descriptor.size);
		delegate.metadataClb(size);

		DOM.clearNode(container);

		const disposables = new DisposableStore();

		const label = document.createElement('p');
		label.textContent = nls.localize('largeImageError', "The image is not displayed in the editor because it is too large ({0}).", size);
		container.appendChild(label);

		const openExternal = delegate.openExternalClb;
		if (descriptor.resource.scheme === Schemas.file && openExternal) {
			const link = DOM.append(label, DOM.$('a.embedded-link'));
			link.setAttribute('role', 'button');
			link.textContent = nls.localize('resourceOpenExternalButton', "Open image using external program?");

			disposables.add(DOM.addDisposableListener(link, DOM.EventType.CLICK, () => openExternal(descriptor.resource)));
		}

		return disposables;
	}
}

class FileTooLargeFileView {
	static create(
		container: HTMLElement,
		descriptor: IResourceDescriptor,
		scrollbar: DomScrollableElement,
		delegate: ResourceViewerDelegate
	) {
		const size = BinarySize.formatSize(descriptor.size);
		delegate.metadataClb(size);

		DOM.clearNode(container);

		const label = document.createElement('span');
		label.textContent = nls.localize('nativeFileTooLargeError', "The file is not displayed in the editor because it is too large ({0}).", size);
		container.appendChild(label);

		scrollbar.scanDomNode();

		return Disposable.None;
	}
}

class FileSeemsBinaryFileView {
	static create(
		container: HTMLElement,
		descriptor: IResourceDescriptor,
		scrollbar: DomScrollableElement,
		delegate: ResourceViewerDelegate
	) {
		delegate.metadataClb(typeof descriptor.size === 'number' ? BinarySize.formatSize(descriptor.size) : '');

		DOM.clearNode(container);

		const disposables = new DisposableStore();

		const label = document.createElement('p');
		label.textContent = nls.localize('nativeBinaryError', "The file is not displayed in the editor because it is either binary or uses an unsupported text encoding.");
		container.appendChild(label);

		if (descriptor.resource.scheme !== Schemas.data) {
			const link = DOM.append(label, DOM.$('a.embedded-link'));
			link.setAttribute('role', 'button');
			link.textContent = nls.localize('openAsText', "Do you want to open it anyway?");

			disposables.add(DOM.addDisposableListener(link, DOM.EventType.CLICK, () => delegate.openInternalClb(descriptor.resource)));
		}

		scrollbar.scanDomNode();

		return disposables;
	}
}

type Scale = number | 'fit';

export class ZoomStatusbarItem extends Disposable {

	private statusbarItem?: IStatusbarEntryAccessor;

	constructor(
		private readonly onSelectScale: (scale: Scale) => void,
		@IEditorService editorService: IEditorService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IStatusbarService private readonly statusbarService: IStatusbarService,
	) {
		super();
		this._register(editorService.onDidActiveEditorChange(() => {
			if (this.statusbarItem) {
				this.statusbarItem.dispose();
				this.statusbarItem = undefined;
			}
		}));
	}

	updateStatusbar(scale: Scale): void {
		const entry: IStatusbarEntry = {
			text: this.zoomLabel(scale)
		};

		if (!this.statusbarItem) {
			this.statusbarItem = this.statusbarService.addEntry(entry, 'status.imageZoom', nls.localize('status.imageZoom', "Image Zoom"), StatusbarAlignment.RIGHT, 101 /* to the left of editor status (100) */);

			this._register(this.statusbarItem);

			const element = document.getElementById('status.imageZoom')!;
			this._register(DOM.addDisposableListener(element, DOM.EventType.CLICK, (e: MouseEvent) => {
				this.contextMenuService.showContextMenu({
					getAnchor: () => element,
					getActions: () => this.zoomActions
				});
			}));
		} else {
			this.statusbarItem.update(entry);
		}
	}

	@memoize
	private get zoomActions(): Action[] {
		const scales: Scale[] = [10, 5, 2, 1, 0.5, 0.2, 'fit'];
		return scales.map(scale =>
			new Action(`zoom.${scale}`, this.zoomLabel(scale), undefined, undefined, () => {
				this.updateStatusbar(scale);
				if (this.onSelectScale) {
					this.onSelectScale(scale);
				}

				return Promise.resolve(undefined);
			}));
	}

	private zoomLabel(scale: Scale): string {
		return scale === 'fit'
			? nls.localize('zoom.action.fit.label', 'Whole Image')
			: `${Math.round(scale * 100)}%`;
	}
}

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
	 * Store the scale and position of an image so it can be restored when changing editor tabs
	 */
	private static readonly imageStateCache = new LRUCache<string, ImageState>(100);

	static create(
		container: HTMLElement,
		descriptor: IResourceDescriptor,
		fileService: IFileService,
		scrollbar: DomScrollableElement,
		delegate: ResourceViewerDelegate,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		const disposables = new DisposableStore();

		const zoomStatusbarItem = disposables.add(instantiationService.createInstance(ZoomStatusbarItem,
			newScale => updateScale(newScale)));

		const context: ResourceViewerContext = {
			layout(dimension: DOM.Dimension) { },
			dispose: () => disposables.dispose()
		};

		const cacheKey = `${descriptor.resource.toString()}:${descriptor.etag}`;

		let ctrlPressed = false;
		let altPressed = false;

		const initialState: ImageState = InlineImageView.imageStateCache.get(cacheKey) || { scale: 'fit', offsetX: 0, offsetY: 0 };
		let scale = initialState.scale;
		let image: HTMLImageElement | null = null;

		function updateScale(newScale: Scale) {
			if (!image || !image.parentElement) {
				return;
			}

			if (newScale === 'fit') {
				scale = 'fit';
				DOM.addClass(image, 'scale-to-fit');
				DOM.removeClass(image, 'pixelated');
				image.style.minWidth = 'auto';
				image.style.width = 'auto';
				InlineImageView.imageStateCache.delete(cacheKey);
			} else {
				const oldWidth = image.width;
				const oldHeight = image.height;

				scale = clamp(newScale, InlineImageView.MIN_SCALE, InlineImageView.MAX_SCALE);
				if (scale >= InlineImageView.PIXELATION_THRESHOLD) {
					DOM.addClass(image, 'pixelated');
				} else {
					DOM.removeClass(image, 'pixelated');
				}

				const { scrollTop, scrollLeft } = image.parentElement;
				const dx = (scrollLeft + image.parentElement.clientWidth / 2) / image.parentElement.scrollWidth;
				const dy = (scrollTop + image.parentElement.clientHeight / 2) / image.parentElement.scrollHeight;

				DOM.removeClass(image, 'scale-to-fit');
				image.style.minWidth = `${(image.naturalWidth * scale)}px`;
				image.style.width = `${(image.naturalWidth * scale)}px`;

				const newWidth = image.width;
				const scaleFactor = (newWidth - oldWidth) / oldWidth;

				const newScrollLeft = ((oldWidth * scaleFactor * dx) + scrollLeft);
				const newScrollTop = ((oldHeight * scaleFactor * dy) + scrollTop);
				scrollbar.setScrollPosition({
					scrollLeft: newScrollLeft,
					scrollTop: newScrollTop,
				});

				InlineImageView.imageStateCache.set(cacheKey, { scale: scale, offsetX: newScrollLeft, offsetY: newScrollTop });
			}

			zoomStatusbarItem.updateStatusbar(scale);
			scrollbar.scanDomNode();
		}

		function firstZoom() {
			if (!image) {
				return;
			}

			scale = image.clientWidth / image.naturalWidth;
			updateScale(scale);
		}

		disposables.add(DOM.addDisposableListener(window, DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (!image) {
				return;
			}
			ctrlPressed = e.ctrlKey;
			altPressed = e.altKey;

			if (platform.isMacintosh ? altPressed : ctrlPressed) {
				DOM.removeClass(container, 'zoom-in');
				DOM.addClass(container, 'zoom-out');
			}
		}));

		disposables.add(DOM.addDisposableListener(window, DOM.EventType.KEY_UP, (e: KeyboardEvent) => {
			if (!image) {
				return;
			}

			ctrlPressed = e.ctrlKey;
			altPressed = e.altKey;

			if (!(platform.isMacintosh ? altPressed : ctrlPressed)) {
				DOM.removeClass(container, 'zoom-out');
				DOM.addClass(container, 'zoom-in');
			}
		}));

		disposables.add(DOM.addDisposableListener(container, DOM.EventType.CLICK, (e: MouseEvent) => {
			if (!image) {
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
		}));

		disposables.add(DOM.addDisposableListener(container, DOM.EventType.WHEEL, (e: WheelEvent) => {
			if (!image) {
				return;
			}

			const isScrollWheelKeyPressed = platform.isMacintosh ? altPressed : ctrlPressed;
			if (!isScrollWheelKeyPressed && !e.ctrlKey) { // pinching is reported as scroll wheel + ctrl
				return;
			}

			e.preventDefault();
			e.stopPropagation();

			if (scale === 'fit') {
				firstZoom();
			}

			let delta = e.deltaY > 0 ? 1 : -1;

			updateScale(scale as number * (1 - delta * InlineImageView.SCALE_PINCH_FACTOR));
		}));

		disposables.add(DOM.addDisposableListener(container, DOM.EventType.SCROLL, () => {
			if (!image || !image.parentElement || scale === 'fit') {
				return;
			}

			const entry = InlineImageView.imageStateCache.get(cacheKey);
			if (entry) {
				const { scrollTop, scrollLeft } = image.parentElement;
				InlineImageView.imageStateCache.set(cacheKey, { scale: entry.scale, offsetX: scrollLeft, offsetY: scrollTop });
			}
		}));

		DOM.clearNode(container);
		DOM.addClasses(container, 'image', 'zoom-in');

		image = DOM.append(container, DOM.$<HTMLImageElement>('img.scale-to-fit'));
		image.style.visibility = 'hidden';

		disposables.add(DOM.addDisposableListener(image, DOM.EventType.LOAD, e => {
			if (!image) {
				return;
			}
			if (typeof descriptor.size === 'number') {
				delegate.metadataClb(nls.localize('imgMeta', '{0}x{1} {2}', image.naturalWidth, image.naturalHeight, BinarySize.formatSize(descriptor.size)));
			} else {
				delegate.metadataClb(nls.localize('imgMetaNoSize', '{0}x{1}', image.naturalWidth, image.naturalHeight));
			}

			scrollbar.scanDomNode();
			image.style.visibility = 'visible';
			updateScale(scale);
			if (initialState.scale !== 'fit') {
				scrollbar.setScrollPosition({
					scrollLeft: initialState.offsetX,
					scrollTop: initialState.offsetY,
				});
			}
		}));

		InlineImageView.imageSrc(descriptor, fileService).then(src => {
			const img = container.querySelector('img');
			if (img) {
				if (typeof src === 'string') {
					img.src = src;
				} else {
					const url = URL.createObjectURL(src);
					disposables.add(toDisposable(() => URL.revokeObjectURL(url)));
					img.src = url;
				}
			}
		});

		return context;
	}

	private static async imageSrc(descriptor: IResourceDescriptor, fileService: IFileService): Promise<string | Blob> {
		if (descriptor.resource.scheme === Schemas.data) {
			return descriptor.resource.toString(true /* skip encoding */);
		}

		const { value } = await fileService.readFile(descriptor.resource);
		return new Blob([value.buffer], { type: getMime(descriptor) });
	}
}

function getMime(descriptor: IResourceDescriptor) {
	let mime: string | undefined = descriptor.mime;
	if (!mime && descriptor.resource.scheme !== Schemas.data) {
		mime = mimes.getMediaMime(descriptor.resource.path);
	}

	return mime || mimes.MIME_BINARY;
}

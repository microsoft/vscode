/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, clearNode, Dimension, EventType, h } from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { toAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { getExtensionForMimeType } from '../../../../base/common/mime.js';
import { extname } from '../../../../base/common/path.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { WorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ISharedWebContentExtractorService } from '../../../../platform/webContentExtractor/common/webContentExtractor.js';
import { downloadFile } from '../../../browser/download.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../common/editor.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { IWebviewElement, IWebviewService } from '../../webview/browser/webview.js';
import { IImageViewerEditorPane, ImageViewer } from '../../mediaPreview/browser/imageViewer.js';
import { ImageCarouselEditorInput } from './imageCarouselEditorInput.js';
import { ICarouselImage, ICarouselSection, isVideoMimeType } from './imageCarouselTypes.js';

/**
 * A flat entry referencing a specific image within a section, used
 * for global index-based navigation across all sections.
 */
interface IFlatImageEntry {
	readonly sectionIndex: number;
	readonly imageIndexInSection: number;
	readonly image: ICarouselImage;
}

export class ImageCarouselEditor extends EditorPane implements IImageViewerEditorPane {
	static readonly ID = 'workbench.editor.imageCarousel';

	private _container: HTMLElement | undefined;
	private _currentIndex: number = 0;
	private _viewer: ImageViewer | undefined;
	private _sections: ReadonlyArray<ICarouselSection> = [];
	private _flatImages: IFlatImageEntry[] = [];
	private readonly _contentDisposables = this._register(new DisposableStore());
	private readonly _imageDisposables = this._register(new DisposableStore());
	private readonly _blobUrlCache = new Map<string, string>();
	private _blobUrlCacheGeneration = 0;

	private _videoWebview: IWebviewElement | undefined;
	private _elements: {
		root: HTMLElement;
		imageArea: HTMLElement;
		videoContainer: HTMLElement;
		captionText: HTMLElement;
		captionSeparator: HTMLElement;
		counter: HTMLElement;
		ariaStatus: HTMLElement;
		prevBtn: HTMLButtonElement;
		nextBtn: HTMLButtonElement;
		sectionsContainer: HTMLElement;
	} | undefined;
	private _thumbnailElements: HTMLElement[] = [];

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IFileService private readonly _fileService: IFileService,
		@IWebviewService private readonly _webviewService: IWebviewService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IFileDialogService private readonly _fileDialogService: IFileDialogService,
		@INotificationService private readonly _notificationService: INotificationService,
		@ISharedWebContentExtractorService private readonly _webContentExtractorService: ISharedWebContentExtractorService,
	) {
		super(ImageCarouselEditor.ID, group, telemetryService, themeService, storageService);
	}

	get imageViewer(): ImageViewer | undefined {
		return this._isCurrentVideo() ? undefined : this._viewer;
	}

	protected override createEditor(parent: HTMLElement): void {
		this._container = h('div.image-carousel-editor').root;
		parent.appendChild(this._container);
	}

	override async setInput(input: ImageCarouselEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);

		this._sections = input.collection.sections;
		this._flatImages = [];
		for (let s = 0; s < this._sections.length; s++) {
			for (let i = 0; i < this._sections[s].images.length; i++) {
				this._flatImages.push({ sectionIndex: s, imageIndexInSection: i, image: this._sections[s].images[i] });
			}
		}
		this._currentIndex = Math.min(input.startIndex, Math.max(0, this._flatImages.length - 1));
		this.buildSlideshow();
	}

	override clearInput(): void {
		this._videoWebview?.dispose();
		this._videoWebview = undefined;
		this._contentDisposables.clear();
		this._imageDisposables.clear();
		this._revokeCachedBlobUrls();
		this._viewer = undefined;
		if (this._container) {
			clearNode(this._container);
		}
		this._elements = undefined;
		this._thumbnailElements = [];
		super.clearInput();
	}

	private _isCurrentVideo(): boolean {
		const entry = this._flatImages[this._currentIndex];
		return !!entry && isVideoMimeType(entry.image.mimeType);
	}

	/**
	 * Build the full DOM skeleton. Called once per setInput.
	 */
	private buildSlideshow(): void {
		if (!this._container) {
			return;
		}

		this._contentDisposables.clear();
		this._imageDisposables.clear();
		this._revokeCachedBlobUrls();
		this._viewer = undefined;
		clearNode(this._container);

		if (this._flatImages.length === 0) {
			const empty = h('div.empty-message');
			empty.root.textContent = localize('imageCarousel.noImages', "No images to display");
			this._container.appendChild(empty.root);
			return;
		}

		const elements = h('div.slideshow-container', [
			h('div.image-area@imageArea', [
				h('div.video-container@videoContainer'),
				h('button.nav-arrow.prev-arrow@prevBtn', { ariaLabel: localize('imageCarousel.previousImage', "Previous image") }, [
					h('span.codicon.codicon-chevron-left', { ariaHidden: 'true' }),
				]),
				h('button.nav-arrow.next-arrow@nextBtn', { ariaLabel: localize('imageCarousel.nextImage', "Next image") }, [
					h('span.codicon.codicon-chevron-right', { ariaHidden: 'true' }),
				]),
			]),
			h('div.bottom-bar@bottomBar', [
				h('div.image-info-bar', [
					h('span.image-info-text', [
						h('span.caption-text@captionText'),
						h('span.caption-separator@captionSeparator'),
						h('span.image-counter@counter'),
					]),
					h('div.image-actions@imageActions'),
				]),
				h('div.sections-container@sectionsContainer'),
				h('span.sr-only@ariaStatus'),
			]),
		]);

		// ARIA: set up slideshow container for screen readers
		elements.root.setAttribute('role', 'group');
		elements.root.setAttribute('aria-label', localize('imageCarousel.ariaLabel', "Images Preview"));
		elements.captionSeparator.setAttribute('aria-hidden', 'true');
		elements.ariaStatus.setAttribute('aria-live', 'polite');
		elements.ariaStatus.setAttribute('aria-atomic', 'true');
		elements.sectionsContainer.setAttribute('role', 'group');
		elements.sectionsContainer.setAttribute('aria-label', localize('imageCarousel.thumbnails', "Image thumbnails"));

		const toolbar = this._contentDisposables.add(this._instantiationService.createInstance(WorkbenchToolBar, elements.imageActions, {
			ariaLabel: localize('imageCarousel.actions', "Images Preview actions"),
		}));
		toolbar.setActions([toAction({
			id: 'imageCarousel.download',
			label: localize('imageCarousel.download', "Download"),
			class: ThemeIcon.asClassName(Codicon.cloudDownload),
			run: () => this.downloadCurrentImage(),
		})]);

		this._elements = {
			root: elements.root,
			imageArea: elements.imageArea,
			videoContainer: elements.videoContainer,
			captionText: elements.captionText,
			captionSeparator: elements.captionSeparator,
			counter: elements.counter,
			ariaStatus: elements.ariaStatus,
			prevBtn: elements.prevBtn as HTMLButtonElement,
			nextBtn: elements.nextBtn as HTMLButtonElement,
			sectionsContainer: elements.sectionsContainer,
		};

		// The viewer handles zooming and the image context menu. Keyboard focus stays on the
		// slideshow so that arrow key navigation keeps working.
		this._viewer = this._contentDisposables.add(this._instantiationService.createInstance(ImageViewer, { focusTarget: elements.root }));
		this._elements.imageArea.prepend(this._viewer.element);

		// Hide video container initially
		this._elements.videoContainer.style.display = 'none';

		// Navigation listeners
		this._contentDisposables.add(addDisposableListener(this._elements.prevBtn, 'click', () => {
			if (this._currentIndex > 0) {
				this._currentIndex--;
				this.updateCurrentImage();
			}
		}));
		this._contentDisposables.add(addDisposableListener(this._elements.nextBtn, 'click', () => {
			if (this._currentIndex < this._flatImages.length - 1) {
				this._currentIndex++;
				this.updateCurrentImage();
			}
		}));

		// Keyboard navigation
		this._contentDisposables.add(addDisposableListener(elements.root, EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);
			if (event.keyCode === KeyCode.LeftArrow) {
				this.previous();
				event.stopPropagation();
				event.preventDefault();
			} else if (event.keyCode === KeyCode.RightArrow) {
				this.next();
				event.stopPropagation();
				event.preventDefault();
			}
		}));
		elements.root.tabIndex = 0;

		// Build section thumbnails
		this._thumbnailElements = [];
		let flatIndex = 0;
		for (let s = 0; s < this._sections.length; s++) {
			const section = this._sections[s];

			// Add separator between sections (not before the first)
			if (s > 0 && this._sections.length > 1) {
				const separator = h('div.thumbnail-separator').root;
				separator.setAttribute('aria-hidden', 'true');
				this._elements.sectionsContainer.appendChild(separator);
			}

			for (let i = 0; i < section.images.length; i++) {
				const image = section.images[i];
				const currentFlatIndex = flatIndex;
				const isItemVideo = isVideoMimeType(image.mimeType);

				const btn = document.createElement('button');
				btn.className = isItemVideo ? 'thumbnail video-thumbnail' : 'thumbnail';
				btn.ariaLabel = isItemVideo
					? localize('imageCarousel.thumbnailLabelVideo', "Video {0} of {1}", currentFlatIndex + 1, this._flatImages.length)
					: localize('imageCarousel.thumbnailLabelImage', "Image {0} of {1}", currentFlatIndex + 1, this._flatImages.length);

				if (isItemVideo) {
					const icon = h('span.codicon.codicon-play.thumbnail-play-icon');
					icon.root.setAttribute('aria-hidden', 'true');
					btn.appendChild(icon.root);
				} else {
					const img = document.createElement('img');
					img.className = 'thumbnail-image';
					img.alt = image.name;
					const thumbnailDisposables = this._contentDisposables.add(new DisposableStore());

					const markBroken = () => {
						if (thumbnailDisposables.isDisposed) {
							return;
						}

						if (!btn.classList.contains('broken')) {
							btn.classList.add('broken');
							img.removeAttribute('src');
							img.alt = '';
							img.remove();
							const fallback = h('span.codicon.codicon-warning.thumbnail-broken-icon');
							fallback.root.setAttribute('aria-hidden', 'true');
							btn.appendChild(fallback.root);
						}
					};

					this._loadBlobUrl(image).then(url => {
						if (thumbnailDisposables.isDisposed) {
							return;
						}

						if (url) {
							const preloader = new Image();
							thumbnailDisposables.add(addDisposableListener(preloader, 'load', () => {
								if (btn.classList.contains('broken')) {
									return;
								}
								img.src = url;
								if (!img.parentElement) {
									btn.appendChild(img);
								}
							}));
							thumbnailDisposables.add(addDisposableListener(preloader, 'error', () => {
								markBroken();
							}));
							preloader.src = url;
						} else {
							markBroken();
						}
					}, () => {
						markBroken();
					});
					thumbnailDisposables.add(addDisposableListener(img, 'error', () => {
						markBroken();
					}));
				}

				this._contentDisposables.add(addDisposableListener(btn, 'click', () => {
					this._currentIndex = currentFlatIndex;
					this.updateCurrentImage();
				}));

				this._elements.sectionsContainer.appendChild(btn);
				this._thumbnailElements.push(btn);
				flatIndex++;
			}
		}

		this._container.appendChild(elements.root);

		// Set initial image
		this.updateCurrentImage();
	}

	/**
	 * Update only the changing parts: main image src, caption, button states, thumbnail selection.
	 * No DOM teardown/rebuild — eliminates the blank flash.
	 */
	private async updateCurrentImage(): Promise<void> {
		if (!this._elements) {
			return;
		}

		// Capture the navigation index before starting async work so that
		// we can discard stale results if the user navigates while loading/decoding.
		const navigationIndex = this._currentIndex;
		const blobUrlCacheGeneration = this._blobUrlCacheGeneration;

		// Swap main image using cached/lazy-loaded blob URL.
		// Pre-decode via decode() before assigning to <img> so the browser
		// decodes on a worker thread, avoiding main-thread stalls during commit.
		const entry = this._flatImages[navigationIndex];
		const currentImage = entry.image;
		const isVideo = isVideoMimeType(currentImage.mimeType);

		if (isVideo) {
			// Show video container, hide image
			this._viewer?.clear();
			if (this._viewer) {
				this._viewer.element.style.display = 'none';
			}
			this._elements.videoContainer.style.display = '';

			// Load raw data to send via postMessage
			const rawData = await this._loadRawData(currentImage);
			if (this._currentIndex !== navigationIndex || this._blobUrlCacheGeneration !== blobUrlCacheGeneration) {
				return;
			}

			const nonce = generateUuid();
			const videoHtml = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; media-src blob: data:; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}';">
<style nonce="${nonce}">html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:transparent}
video{width:100%;height:100%;object-fit:contain;outline:none}</style>
</head><body>
<video id="v" controls></video>
<script nonce="${nonce}">
window.addEventListener("message",function(e){var m=e.data;if(m.type==="loadVideo"){var b=new Blob([m.data],{type:m.mimeType});document.getElementById("v").src=URL.createObjectURL(b);}});
</script>
</body></html>`;

			// Reuse existing webview or create one on first video navigation
			let webview: IWebviewElement;
			if (!this._videoWebview) {
				webview = this._contentDisposables.add(this._webviewService.createWebviewElement({
					title: currentImage.name,
					options: { disableServiceWorker: true },
					contentOptions: { allowScripts: true },
					extension: undefined,
				}));
				webview.mountTo(this._elements.videoContainer, this.window);
				this._videoWebview = webview;
			} else {
				webview = this._videoWebview;
			}

			webview.setHtml(videoHtml);

			// Send the video data to the webview via postMessage
			const buffer = (rawData as Uint8Array<ArrayBuffer>).buffer;
			webview.postMessage({ type: 'loadVideo', data: buffer, mimeType: currentImage.mimeType }, [buffer]);
		} else {
			// Show image, hide video container
			this._elements.videoContainer.style.display = 'none';
			if (this._viewer) {
				this._viewer.element.style.display = '';
				// An image that is still decoding from an earlier navigation must not replace this one
				this._viewer.cancelPendingSource();
			}

			const url = await this._loadBlobUrl(currentImage);

			// If the user navigated while loading the blob URL, discard this result.
			if (this._currentIndex !== navigationIndex || this._blobUrlCacheGeneration !== blobUrlCacheGeneration) {
				return;
			}

			// The viewer decodes the image before showing it and resets the zoom. Invalid images
			// are still shown so that the browser renders its broken image fallback.
			void this._viewer?.setSource(url, {
				alt: currentImage.name,
				data: { mimeType: currentImage.mimeType, read: () => this._loadRawData(currentImage) },
			});
		}

		// Update info bar: caption + separator + counter
		if (currentImage.caption) {
			this._elements.captionText.textContent = currentImage.caption;
			this._elements.captionText.style.display = '';
			this._elements.captionSeparator.style.display = '';
		} else {
			this._elements.captionText.textContent = '';
			this._elements.captionText.style.display = 'none';
			this._elements.captionSeparator.style.display = 'none';
		}
		this._elements.counter.textContent = localize('imageCarousel.counter', "{0} / {1}", navigationIndex + 1, this._flatImages.length);

		// Announce to screen readers with full context (position + caption/name)
		const itemKind = isVideo
			? localize('imageCarousel.kindVideo', "Video")
			: localize('imageCarousel.kindImage', "Image");
		this._elements.ariaStatus.textContent = currentImage.caption
			? localize('imageCarousel.statusWithCaption', "{0} {1} of {2}: {3}", itemKind, navigationIndex + 1, this._flatImages.length, currentImage.caption)
			: localize('imageCarousel.statusWithName', "{0} {1} of {2}: {3}", itemKind, navigationIndex + 1, this._flatImages.length, currentImage.name);

		// Update button states
		this._elements.prevBtn.disabled = navigationIndex === 0;
		this._elements.nextBtn.disabled = navigationIndex === this._flatImages.length - 1;

		// Update thumbnail selection — only toggle active class and
		// call getBoundingClientRect on the active thumbnail to avoid
		// layout thrashing across all thumbnails on every navigation.
		for (let i = 0; i < this._thumbnailElements.length; i++) {
			const isActive = i === navigationIndex;
			const thumbnail = this._thumbnailElements[i];
			thumbnail.classList.toggle('active', isActive);
			if (isActive) {
				thumbnail.setAttribute('aria-current', 'page');
			} else {
				thumbnail.removeAttribute('aria-current');
			}
		}

		// Scroll the active thumbnail into view without blocking the main thread.
		// Using scrollIntoView with 'nearest' avoids forced layout from
		// getBoundingClientRect + scrollLeft and is handled efficiently by
		// the browser's scroll machinery.
		const activeThumbnail = this._thumbnailElements[navigationIndex];
		if (activeThumbnail) {
			activeThumbnail.scrollIntoView({ block: 'nearest', inline: 'nearest' });
		}

		// Update editor title to reflect current section
		if (this.input instanceof ImageCarouselEditorInput) {
			const currentSection = this._sections[entry.sectionIndex];
			this.input.setName(currentSection.title || this.input.collection.title);
		}

		// Preload adjacent images for smoother navigation
		this._preloadAdjacentImages();
	}

	private async _loadBlobUrl(image: ICarouselImage): Promise<string> {
		const cached = this._blobUrlCache.get(image.id);
		if (cached) {
			return cached;
		}
		const blobUrlCacheGeneration = this._blobUrlCacheGeneration;

		let buffer: Uint8Array;
		if (image.data) {
			// Handle both VSBuffer (has .buffer property) and raw Uint8Array from chat attachments
			buffer = image.data instanceof Uint8Array ? image.data : image.data.buffer;
		} else if (image.uri) {
			const content = await this._fileService.readFile(image.uri);
			buffer = content.value.buffer;
		} else {
			return '';
		}
		if (this._blobUrlCacheGeneration !== blobUrlCacheGeneration) {
			return '';
		}

		const blob = new Blob([buffer as Uint8Array<ArrayBuffer>], { type: image.mimeType });
		const url = this._blobUrlCache.get(image.id) ?? URL.createObjectURL(blob);
		this._blobUrlCache.set(image.id, url);
		return url;
	}

	private _revokeCachedBlobUrls(): void {
		this._blobUrlCacheGeneration++;
		for (const url of this._blobUrlCache.values()) {
			URL.revokeObjectURL(url);
		}
		this._blobUrlCache.clear();
	}

	private async _loadRawData(image: ICarouselImage): Promise<Uint8Array> {
		if (image.data) {
			return image.data instanceof Uint8Array ? image.data : image.data.buffer;
		} else if (image.uri) {
			const content = await this._fileService.readFile(image.uri);
			return content.value.buffer;
		}
		return new Uint8Array(0);
	}

	private async downloadCurrentImage(): Promise<void> {
		const image = this._flatImages[this._currentIndex].image;
		try {
			const source = image.uri ?? image.data;
			if (!source) {
				throw new Error(localize('imageCarousel.missingImageData', "The image has no data to download."));
			}
			const name = extname(image.name) ? image.name : image.name + (getExtensionForMimeType(image.mimeType) ?? '');
			await downloadFile(source, name, this._fileService, this._fileDialogService, this._webContentExtractorService);
		} catch (error) {
			this._notificationService.error(localize('imageCarousel.downloadError', "Failed to download {0}: {1}", image.name, toErrorMessage(error)));
		}
	}

	private _preloadAdjacentImages(): void {
		for (const idx of [this._currentIndex - 1, this._currentIndex + 1]) {
			if (idx >= 0 && idx < this._flatImages.length) {
				const adjacentImage = this._flatImages[idx].image;
				if (isVideoMimeType(adjacentImage.mimeType)) {
					// For video, preload raw data into the file service cache
					this._loadRawData(adjacentImage).catch(() => { /* ignore */ });
				} else {
					this._loadBlobUrl(adjacentImage).then(url => {
						// Pre-decode via decode() so the compositor doesn't block
						// the main thread decoding this image during commit.
						const img = new Image();
						img.src = url;
						img.decode().catch(() => { /* invalid image */ });
					});
				}
			}
		}
	}

	previous(): void {
		if (this._currentIndex > 0) {
			this._currentIndex--;
			this.updateCurrentImage();
		}
	}

	next(): void {
		if (this._currentIndex < this._flatImages.length - 1) {
			this._currentIndex++;
			this.updateCurrentImage();
		}
	}

	override focus(): void {
		super.focus();
		this._elements?.root.focus();
	}

	override layout(dimension: Dimension): void {
		if (this._container) {
			this._container.style.width = `${dimension.width}px`;
			this._container.style.height = `${dimension.height}px`;
		}
	}
}

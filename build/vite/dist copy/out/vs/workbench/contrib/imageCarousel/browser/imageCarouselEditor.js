/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var ImageCarouselEditor_1;
import { addDisposableListener, clearNode, EventType, h } from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { clamp } from '../../../../base/common/numbers.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IWebviewService } from '../../webview/browser/webview.js';
import { ImageCarouselEditorInput } from './imageCarouselEditorInput.js';
import { isVideoMimeType } from './imageCarouselTypes.js';
const SCALE_PINCH_FACTOR = 0.075;
const MAX_SCALE = 20;
const MIN_SCALE = 0.1;
const PIXELATION_THRESHOLD = 3;
const ZOOM_LEVELS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.5, 2, 3, 5, 7, 10, 15, 20];
let ImageCarouselEditor = class ImageCarouselEditor extends EditorPane {
    static { ImageCarouselEditor_1 = this; }
    static { this.ID = 'workbench.editor.imageCarousel'; }
    constructor(group, telemetryService, themeService, storageService, _fileService, _webviewService) {
        super(ImageCarouselEditor_1.ID, group, telemetryService, themeService, storageService);
        this._fileService = _fileService;
        this._webviewService = _webviewService;
        this._currentIndex = 0;
        this._zoomScale = 'fit';
        this._sections = [];
        this._flatImages = [];
        this._contentDisposables = this._register(new DisposableStore());
        this._imageDisposables = this._register(new DisposableStore());
        this._blobUrlCache = new Map();
        this._thumbnailElements = [];
    }
    createEditor(parent) {
        this._container = h('div.image-carousel-editor').root;
        parent.appendChild(this._container);
    }
    async setInput(input, options, context, token) {
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
    clearInput() {
        this._videoWebview?.dispose();
        this._videoWebview = undefined;
        this._contentDisposables.clear();
        this._imageDisposables.clear();
        this._revokeCachedBlobUrls();
        this._zoomScale = 'fit';
        if (this._container) {
            clearNode(this._container);
        }
        this._elements = undefined;
        this._thumbnailElements = [];
        super.clearInput();
    }
    _isCurrentVideo() {
        const entry = this._flatImages[this._currentIndex];
        return !!entry && isVideoMimeType(entry.image.mimeType);
    }
    /**
     * Build the full DOM skeleton. Called once per setInput.
     */
    buildSlideshow() {
        if (!this._container) {
            return;
        }
        this._contentDisposables.clear();
        this._imageDisposables.clear();
        this._revokeCachedBlobUrls();
        clearNode(this._container);
        if (this._flatImages.length === 0) {
            const empty = h('div.empty-message');
            empty.root.textContent = localize('imageCarousel.noImages', "No images to display");
            this._container.appendChild(empty.root);
            return;
        }
        const elements = h('div.slideshow-container', [
            h('div.image-area@imageArea', [
                h('div.main-image-container@mainImageContainer', [
                    h('img.main-image@mainImage'),
                    h('div.video-container@videoContainer'),
                ]),
                h('button.nav-arrow.prev-arrow@prevBtn', { ariaLabel: localize('imageCarousel.previousImage', "Previous image") }, [
                    h('span.codicon.codicon-chevron-left', { ariaHidden: 'true' }),
                ]),
                h('button.nav-arrow.next-arrow@nextBtn', { ariaLabel: localize('imageCarousel.nextImage', "Next image") }, [
                    h('span.codicon.codicon-chevron-right', { ariaHidden: 'true' }),
                ]),
            ]),
            h('div.bottom-bar@bottomBar', [
                h('div.image-info-bar', [
                    h('span.caption-text@captionText'),
                    h('span.caption-separator@captionSeparator'),
                    h('span.image-counter@counter'),
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
        this._elements = {
            root: elements.root,
            imageArea: elements.imageArea,
            mainImageContainer: elements.mainImageContainer,
            mainImage: elements.mainImage,
            videoContainer: elements.videoContainer,
            captionText: elements.captionText,
            captionSeparator: elements.captionSeparator,
            counter: elements.counter,
            ariaStatus: elements.ariaStatus,
            prevBtn: elements.prevBtn,
            nextBtn: elements.nextBtn,
            sectionsContainer: elements.sectionsContainer,
        };
        // Initialize image in fit mode
        this._elements.mainImage.classList.add('scale-to-fit');
        this._elements.mainImage.alt = '';
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
            if (event.keyCode === 15 /* KeyCode.LeftArrow */) {
                this.previous();
                event.stopPropagation();
                event.preventDefault();
            }
            else if (event.keyCode === 17 /* KeyCode.RightArrow */) {
                this.next();
                event.stopPropagation();
                event.preventDefault();
            }
        }));
        elements.root.tabIndex = 0;
        // Zoom: scroll wheel + modifier key (Ctrl on Win/Linux, Alt on Mac) or pinch
        this._contentDisposables.add(addDisposableListener(this._elements.imageArea, EventType.MOUSE_WHEEL, (e) => {
            if (this._isCurrentVideo()) {
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
            if (this._zoomScale === 'fit') {
                this._initZoomFromFit();
            }
            const delta = e.deltaY > 0 ? 1 : -1;
            this._applyZoom(this._zoomScale * (1 - delta * SCALE_PINCH_FACTOR));
        }, { passive: false }));
        // Zoom: single click to zoom in/out (like image preview)
        // Track modifier keys at mousedown time
        let clickCtrlPressed = false;
        let clickAltPressed = false;
        this._contentDisposables.add(addDisposableListener(this._elements.mainImageContainer, EventType.MOUSE_DOWN, (e) => {
            if (e.button !== 0) {
                return;
            }
            clickCtrlPressed = e.ctrlKey;
            clickAltPressed = e.altKey;
        }));
        this._contentDisposables.add(addDisposableListener(this._elements.mainImageContainer, EventType.CLICK, (e) => {
            if (e.button !== 0 || this._isCurrentVideo()) {
                return;
            }
            const isZoomOut = isMacintosh ? clickAltPressed : clickCtrlPressed;
            if (isZoomOut) {
                this._zoomOut();
            }
            else {
                this._zoomIn();
            }
        }));
        // Update zoom-out cursor class when modifier key is held
        const updateZoomCursor = (e) => {
            const isZoomOut = isMacintosh ? e.altKey : e.ctrlKey;
            this._elements.mainImageContainer.classList.toggle('zoom-out', isZoomOut);
        };
        this._contentDisposables.add(addDisposableListener(elements.root, EventType.KEY_DOWN, updateZoomCursor));
        this._contentDisposables.add(addDisposableListener(elements.root, EventType.KEY_UP, updateZoomCursor));
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
                }
                else {
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
                        }
                        else {
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
    async updateCurrentImage() {
        if (!this._elements) {
            return;
        }
        // Capture the navigation index before starting async work so that
        // we can discard stale results if the user navigates while loading/decoding.
        const navigationIndex = this._currentIndex;
        // Swap main image using cached/lazy-loaded blob URL.
        // Pre-decode via decode() before assigning to <img> so the browser
        // decodes on a worker thread, avoiding main-thread stalls during commit.
        const entry = this._flatImages[navigationIndex];
        const currentImage = entry.image;
        const isVideo = isVideoMimeType(currentImage.mimeType);
        if (isVideo) {
            // Show video container, hide image
            this._elements.mainImage.style.display = 'none';
            this._elements.videoContainer.style.display = '';
            this._elements.mainImageContainer.classList.remove('zoomed');
            this._elements.mainImageContainer.style.cursor = 'default';
            // Load raw data to send via postMessage
            const rawData = await this._loadRawData(currentImage);
            if (this._currentIndex !== navigationIndex) {
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
            let webview;
            if (!this._videoWebview) {
                webview = this._contentDisposables.add(this._webviewService.createWebviewElement({
                    title: currentImage.name,
                    options: { disableServiceWorker: true },
                    contentOptions: { allowScripts: true },
                    extension: undefined,
                }));
                webview.mountTo(this._elements.videoContainer, this.window);
                this._videoWebview = webview;
            }
            else {
                webview = this._videoWebview;
            }
            webview.setHtml(videoHtml);
            // Send the video data to the webview via postMessage
            const buffer = rawData.buffer;
            webview.postMessage({ type: 'loadVideo', data: buffer, mimeType: currentImage.mimeType }, [buffer]);
        }
        else {
            // Show image, hide video container
            this._elements.videoContainer.style.display = 'none';
            this._elements.mainImage.style.display = '';
            this._elements.mainImageContainer.style.cursor = '';
            const url = await this._loadBlobUrl(currentImage);
            // If the user navigated while loading the blob URL, discard this result.
            if (this._currentIndex !== navigationIndex) {
                return;
            }
            const tmp = new Image();
            tmp.src = url;
            tmp.decode().then(() => {
                // Only apply if user hasn't navigated away during decode
                if (this._currentIndex === navigationIndex && this._elements) {
                    this._elements.mainImage.src = url;
                    this._elements.mainImage.alt = currentImage.name;
                }
            }, () => {
                // Decode failed (invalid image) — still show src for browser fallback
                if (this._currentIndex === navigationIndex && this._elements) {
                    this._elements.mainImage.src = url;
                    this._elements.mainImage.alt = currentImage.name;
                }
            });
        }
        // Reset zoom when switching images
        this._applyZoom('fit');
        // Update info bar: caption + separator + counter
        if (currentImage.caption) {
            this._elements.captionText.textContent = currentImage.caption;
            this._elements.captionText.style.display = '';
            this._elements.captionSeparator.style.display = '';
        }
        else {
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
            }
            else {
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
    async _loadBlobUrl(image) {
        const cached = this._blobUrlCache.get(image.id);
        if (cached) {
            return cached;
        }
        let buffer;
        if (image.data) {
            // Handle both VSBuffer (has .buffer property) and raw Uint8Array from chat attachments
            buffer = image.data instanceof Uint8Array ? image.data : image.data.buffer;
        }
        else if (image.uri) {
            const content = await this._fileService.readFile(image.uri);
            buffer = content.value.buffer;
        }
        else {
            return '';
        }
        const blob = new Blob([buffer], { type: image.mimeType });
        const url = URL.createObjectURL(blob);
        this._blobUrlCache.set(image.id, url);
        return url;
    }
    _revokeCachedBlobUrls() {
        for (const url of this._blobUrlCache.values()) {
            URL.revokeObjectURL(url);
        }
        this._blobUrlCache.clear();
    }
    async _loadRawData(image) {
        if (image.data) {
            return image.data instanceof Uint8Array ? image.data : image.data.buffer;
        }
        else if (image.uri) {
            const content = await this._fileService.readFile(image.uri);
            return content.value.buffer;
        }
        return new Uint8Array(0);
    }
    _preloadAdjacentImages() {
        for (const idx of [this._currentIndex - 1, this._currentIndex + 1]) {
            if (idx >= 0 && idx < this._flatImages.length) {
                const adjacentImage = this._flatImages[idx].image;
                if (isVideoMimeType(adjacentImage.mimeType)) {
                    // For video, preload raw data into the file service cache
                    this._loadRawData(adjacentImage).catch(() => { });
                }
                else {
                    this._loadBlobUrl(adjacentImage).then(url => {
                        // Pre-decode via decode() so the compositor doesn't block
                        // the main thread decoding this image during commit.
                        const img = new Image();
                        img.src = url;
                        img.decode().catch(() => { });
                    });
                }
            }
        }
    }
    previous() {
        if (this._currentIndex > 0) {
            this._currentIndex--;
            this.updateCurrentImage();
        }
    }
    next() {
        if (this._currentIndex < this._flatImages.length - 1) {
            this._currentIndex++;
            this.updateCurrentImage();
        }
    }
    /**
     * Compute the current display scale when transitioning from 'fit' to numeric zoom.
     */
    _initZoomFromFit() {
        if (!this._elements) {
            return;
        }
        const img = this._elements.mainImage;
        if (img.naturalWidth > 0) {
            this._zoomScale = img.clientWidth / img.naturalWidth;
        }
        else {
            this._zoomScale = 1;
        }
    }
    /**
     * Zoom in to the next predefined zoom level.
     */
    _zoomIn() {
        if (this._zoomScale === 'fit') {
            this._initZoomFromFit();
        }
        const scale = this._zoomScale;
        let i = 0;
        for (; i < ZOOM_LEVELS.length; ++i) {
            if (ZOOM_LEVELS[i] > scale) {
                break;
            }
        }
        this._applyZoom(ZOOM_LEVELS[i] ?? MAX_SCALE);
    }
    /**
     * Zoom out to the previous predefined zoom level.
     */
    _zoomOut() {
        if (this._zoomScale === 'fit') {
            this._initZoomFromFit();
        }
        const scale = this._zoomScale;
        let i = ZOOM_LEVELS.length - 1;
        for (; i >= 0; --i) {
            if (ZOOM_LEVELS[i] < scale) {
                break;
            }
        }
        this._applyZoom(ZOOM_LEVELS[i] ?? MIN_SCALE);
    }
    /**
     * Apply fit-to-container or numeric zoom with scroll-center preservation.
     */
    _applyZoom(newScale) {
        if (!this._elements) {
            return;
        }
        const container = this._elements.mainImageContainer;
        const img = this._elements.mainImage;
        if (newScale === 'fit') {
            this._zoomScale = 'fit';
            img.classList.add('scale-to-fit');
            img.classList.remove('pixelated');
            img.style.zoom = '';
            // Remove zoomed/overflow before scrollTo to avoid an expensive
            // synchronous ScrollLayer that blocks the main thread.
            const wasZoomed = container.classList.contains('zoomed');
            container.classList.remove('zoomed');
            container.classList.remove('zoom-out');
            if (wasZoomed) {
                container.scrollTo(0, 0);
            }
        }
        else {
            const scale = clamp(newScale, MIN_SCALE, MAX_SCALE);
            this._zoomScale = scale;
            // Capture scroll center ratio before changing zoom.
            const dx = container.scrollWidth > 0
                ? (container.scrollLeft + container.clientWidth / 2) / container.scrollWidth
                : 0.5;
            const dy = container.scrollHeight > 0
                ? (container.scrollTop + container.clientHeight / 2) / container.scrollHeight
                : 0.5;
            img.classList.remove('scale-to-fit');
            img.classList.toggle('pixelated', scale >= PIXELATION_THRESHOLD);
            img.style.zoom = String(scale);
            container.classList.add('zoomed');
            // Restore scroll center — works because setting img.style.zoom triggers
            // synchronous layout, so scrollWidth/scrollHeight reflect the new size.
            const newScrollX = container.scrollWidth * dx - container.clientWidth / 2;
            const newScrollY = container.scrollHeight * dy - container.clientHeight / 2;
            container.scrollTo(newScrollX, newScrollY);
        }
    }
    focus() {
        super.focus();
        this._elements?.root.focus();
    }
    layout(dimension) {
        if (this._container) {
            this._container.style.width = `${dimension.width}px`;
            this._container.style.height = `${dimension.height}px`;
        }
    }
};
ImageCarouselEditor = ImageCarouselEditor_1 = __decorate([
    __param(1, ITelemetryService),
    __param(2, IThemeService),
    __param(3, IStorageService),
    __param(4, IFileService),
    __param(5, IWebviewService)
], ImageCarouselEditor);
export { ImageCarouselEditor };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW1hZ2VDYXJvdXNlbEVkaXRvci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2ltYWdlQ2Fyb3VzZWwvYnJvd3Nlci9pbWFnZUNhcm91c2VsRWRpdG9yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsU0FBUyxFQUFhLFNBQVMsRUFBRSxDQUFDLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUM1RyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUdsRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDdkUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNsRSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDL0QsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBRTlDLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDbEYsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBRXpFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUVqRixPQUFPLEVBQW1CLGVBQWUsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3BGLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3pFLE9BQU8sRUFBb0MsZUFBZSxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFjNUYsTUFBTSxrQkFBa0IsR0FBRyxLQUFLLENBQUM7QUFDakMsTUFBTSxTQUFTLEdBQUcsRUFBRSxDQUFDO0FBQ3JCLE1BQU0sU0FBUyxHQUFHLEdBQUcsQ0FBQztBQUN0QixNQUFNLG9CQUFvQixHQUFHLENBQUMsQ0FBQztBQUMvQixNQUFNLFdBQVcsR0FBRyxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7QUFFM0YsSUFBTSxtQkFBbUIsR0FBekIsTUFBTSxtQkFBb0IsU0FBUSxVQUFVOzthQUNsQyxPQUFFLEdBQUcsZ0NBQWdDLEFBQW5DLENBQW9DO0lBNEJ0RCxZQUNDLEtBQW1CLEVBQ0EsZ0JBQW1DLEVBQ3ZDLFlBQTJCLEVBQ3pCLGNBQStCLEVBQ2xDLFlBQTJDLEVBQ3hDLGVBQWlEO1FBRWxFLEtBQUssQ0FBQyxxQkFBbUIsQ0FBQyxFQUFFLEVBQUUsS0FBSyxFQUFFLGdCQUFnQixFQUFFLFlBQVksRUFBRSxjQUFjLENBQUMsQ0FBQztRQUh0RCxpQkFBWSxHQUFaLFlBQVksQ0FBYztRQUN2QixvQkFBZSxHQUFmLGVBQWUsQ0FBaUI7UUEvQjNELGtCQUFhLEdBQVcsQ0FBQyxDQUFDO1FBQzFCLGVBQVUsR0FBYyxLQUFLLENBQUM7UUFDOUIsY0FBUyxHQUFvQyxFQUFFLENBQUM7UUFDaEQsZ0JBQVcsR0FBc0IsRUFBRSxDQUFDO1FBQzNCLHdCQUFtQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxlQUFlLEVBQUUsQ0FBQyxDQUFDO1FBQzVELHNCQUFpQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxlQUFlLEVBQUUsQ0FBQyxDQUFDO1FBQzFELGtCQUFhLEdBQUcsSUFBSSxHQUFHLEVBQWtCLENBQUM7UUFpQm5ELHVCQUFrQixHQUFrQixFQUFFLENBQUM7SUFXL0MsQ0FBQztJQUVrQixZQUFZLENBQUMsTUFBbUI7UUFDbEQsSUFBSSxDQUFDLFVBQVUsR0FBRyxDQUFDLENBQUMsMkJBQTJCLENBQUMsQ0FBQyxJQUFJLENBQUM7UUFDdEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7SUFDckMsQ0FBQztJQUVRLEtBQUssQ0FBQyxRQUFRLENBQUMsS0FBK0IsRUFBRSxPQUFtQyxFQUFFLE9BQTJCLEVBQUUsS0FBd0I7UUFDbEosTUFBTSxLQUFLLENBQUMsUUFBUSxDQUFDLEtBQUssRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXJELElBQUksQ0FBQyxTQUFTLEdBQUcsS0FBSyxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUM7UUFDM0MsSUFBSSxDQUFDLFdBQVcsR0FBRyxFQUFFLENBQUM7UUFDdEIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDaEQsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO2dCQUMxRCxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxFQUFFLFlBQVksRUFBRSxDQUFDLEVBQUUsbUJBQW1CLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDeEcsQ0FBQztRQUNGLENBQUM7UUFDRCxJQUFJLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsV0FBVyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzFGLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztJQUN2QixDQUFDO0lBRVEsVUFBVTtRQUNsQixJQUFJLENBQUMsYUFBYSxFQUFFLE9BQU8sRUFBRSxDQUFDO1FBQzlCLElBQUksQ0FBQyxhQUFhLEdBQUcsU0FBUyxDQUFDO1FBQy9CLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNqQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDL0IsSUFBSSxDQUFDLHFCQUFxQixFQUFFLENBQUM7UUFDN0IsSUFBSSxDQUFDLFVBQVUsR0FBRyxLQUFLLENBQUM7UUFDeEIsSUFBSSxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDckIsU0FBUyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUM1QixDQUFDO1FBQ0QsSUFBSSxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUM7UUFDM0IsSUFBSSxDQUFDLGtCQUFrQixHQUFHLEVBQUUsQ0FBQztRQUM3QixLQUFLLENBQUMsVUFBVSxFQUFFLENBQUM7SUFDcEIsQ0FBQztJQUVPLGVBQWU7UUFDdEIsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDbkQsT0FBTyxDQUFDLENBQUMsS0FBSyxJQUFJLGVBQWUsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ3pELENBQUM7SUFFRDs7T0FFRztJQUNLLGNBQWM7UUFDckIsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUN0QixPQUFPO1FBQ1IsQ0FBQztRQUVELElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNqQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDL0IsSUFBSSxDQUFDLHFCQUFxQixFQUFFLENBQUM7UUFDN0IsU0FBUyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUUzQixJQUFJLElBQUksQ0FBQyxXQUFXLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ25DLE1BQU0sS0FBSyxHQUFHLENBQUMsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO1lBQ3JDLEtBQUssQ0FBQyxJQUFJLENBQUMsV0FBVyxHQUFHLFFBQVEsQ0FBQyx3QkFBd0IsRUFBRSxzQkFBc0IsQ0FBQyxDQUFDO1lBQ3BGLElBQUksQ0FBQyxVQUFVLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN4QyxPQUFPO1FBQ1IsQ0FBQztRQUVELE1BQU0sUUFBUSxHQUFHLENBQUMsQ0FBQyx5QkFBeUIsRUFBRTtZQUM3QyxDQUFDLENBQUMsMEJBQTBCLEVBQUU7Z0JBQzdCLENBQUMsQ0FBQyw2Q0FBNkMsRUFBRTtvQkFDaEQsQ0FBQyxDQUFDLDBCQUEwQixDQUFDO29CQUM3QixDQUFDLENBQUMsb0NBQW9DLENBQUM7aUJBQ3ZDLENBQUM7Z0JBQ0YsQ0FBQyxDQUFDLHFDQUFxQyxFQUFFLEVBQUUsU0FBUyxFQUFFLFFBQVEsQ0FBQyw2QkFBNkIsRUFBRSxnQkFBZ0IsQ0FBQyxFQUFFLEVBQUU7b0JBQ2xILENBQUMsQ0FBQyxtQ0FBbUMsRUFBRSxFQUFFLFVBQVUsRUFBRSxNQUFNLEVBQUUsQ0FBQztpQkFDOUQsQ0FBQztnQkFDRixDQUFDLENBQUMscUNBQXFDLEVBQUUsRUFBRSxTQUFTLEVBQUUsUUFBUSxDQUFDLHlCQUF5QixFQUFFLFlBQVksQ0FBQyxFQUFFLEVBQUU7b0JBQzFHLENBQUMsQ0FBQyxvQ0FBb0MsRUFBRSxFQUFFLFVBQVUsRUFBRSxNQUFNLEVBQUUsQ0FBQztpQkFDL0QsQ0FBQzthQUNGLENBQUM7WUFDRixDQUFDLENBQUMsMEJBQTBCLEVBQUU7Z0JBQzdCLENBQUMsQ0FBQyxvQkFBb0IsRUFBRTtvQkFDdkIsQ0FBQyxDQUFDLCtCQUErQixDQUFDO29CQUNsQyxDQUFDLENBQUMseUNBQXlDLENBQUM7b0JBQzVDLENBQUMsQ0FBQyw0QkFBNEIsQ0FBQztpQkFDL0IsQ0FBQztnQkFDRixDQUFDLENBQUMsMENBQTBDLENBQUM7Z0JBQzdDLENBQUMsQ0FBQyx5QkFBeUIsQ0FBQzthQUM1QixDQUFDO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsc0RBQXNEO1FBQ3RELFFBQVEsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLE1BQU0sRUFBRSxPQUFPLENBQUMsQ0FBQztRQUM1QyxRQUFRLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxZQUFZLEVBQUUsUUFBUSxDQUFDLHlCQUF5QixFQUFFLGdCQUFnQixDQUFDLENBQUMsQ0FBQztRQUNoRyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsWUFBWSxDQUFDLGFBQWEsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUM5RCxRQUFRLENBQUMsVUFBVSxDQUFDLFlBQVksQ0FBQyxXQUFXLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDeEQsUUFBUSxDQUFDLFVBQVUsQ0FBQyxZQUFZLENBQUMsYUFBYSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQ3hELFFBQVEsQ0FBQyxpQkFBaUIsQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQ3pELFFBQVEsQ0FBQyxpQkFBaUIsQ0FBQyxZQUFZLENBQUMsWUFBWSxFQUFFLFFBQVEsQ0FBQywwQkFBMEIsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDLENBQUM7UUFFaEgsSUFBSSxDQUFDLFNBQVMsR0FBRztZQUNoQixJQUFJLEVBQUUsUUFBUSxDQUFDLElBQUk7WUFDbkIsU0FBUyxFQUFFLFFBQVEsQ0FBQyxTQUFTO1lBQzdCLGtCQUFrQixFQUFFLFFBQVEsQ0FBQyxrQkFBa0I7WUFDL0MsU0FBUyxFQUFFLFFBQVEsQ0FBQyxTQUE2QjtZQUNqRCxjQUFjLEVBQUUsUUFBUSxDQUFDLGNBQWM7WUFDdkMsV0FBVyxFQUFFLFFBQVEsQ0FBQyxXQUFXO1lBQ2pDLGdCQUFnQixFQUFFLFFBQVEsQ0FBQyxnQkFBZ0I7WUFDM0MsT0FBTyxFQUFFLFFBQVEsQ0FBQyxPQUFPO1lBQ3pCLFVBQVUsRUFBRSxRQUFRLENBQUMsVUFBVTtZQUMvQixPQUFPLEVBQUUsUUFBUSxDQUFDLE9BQTRCO1lBQzlDLE9BQU8sRUFBRSxRQUFRLENBQUMsT0FBNEI7WUFDOUMsaUJBQWlCLEVBQUUsUUFBUSxDQUFDLGlCQUFpQjtTQUM3QyxDQUFDO1FBRUYsK0JBQStCO1FBQy9CLElBQUksQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDdkQsSUFBSSxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsR0FBRyxHQUFHLEVBQUUsQ0FBQztRQUVsQyxpQ0FBaUM7UUFDakMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDLE9BQU8sR0FBRyxNQUFNLENBQUM7UUFFckQsdUJBQXVCO1FBQ3ZCLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLEVBQUUsT0FBTyxFQUFFLEdBQUcsRUFBRTtZQUN4RixJQUFJLElBQUksQ0FBQyxhQUFhLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQzVCLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztnQkFDckIsSUFBSSxDQUFDLGtCQUFrQixFQUFFLENBQUM7WUFDM0IsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDSixJQUFJLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxFQUFFLE9BQU8sRUFBRSxHQUFHLEVBQUU7WUFDeEYsSUFBSSxJQUFJLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUN0RCxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7Z0JBQ3JCLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1lBQzNCLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosc0JBQXNCO1FBQ3RCLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxTQUFTLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxFQUFFO1lBQ3pGLE1BQU0sS0FBSyxHQUFHLElBQUkscUJBQXFCLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDM0MsSUFBSSxLQUFLLENBQUMsT0FBTywrQkFBc0IsRUFBRSxDQUFDO2dCQUN6QyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7Z0JBQ2hCLEtBQUssQ0FBQyxlQUFlLEVBQUUsQ0FBQztnQkFDeEIsS0FBSyxDQUFDLGNBQWMsRUFBRSxDQUFDO1lBQ3hCLENBQUM7aUJBQU0sSUFBSSxLQUFLLENBQUMsT0FBTyxnQ0FBdUIsRUFBRSxDQUFDO2dCQUNqRCxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ1osS0FBSyxDQUFDLGVBQWUsRUFBRSxDQUFDO2dCQUN4QixLQUFLLENBQUMsY0FBYyxFQUFFLENBQUM7WUFDeEIsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDSixRQUFRLENBQUMsSUFBSSxDQUFDLFFBQVEsR0FBRyxDQUFDLENBQUM7UUFFM0IsNkVBQTZFO1FBQzdFLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxTQUFTLEVBQUUsU0FBUyxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQWEsRUFBRSxFQUFFO1lBQ3JILElBQUksSUFBSSxDQUFDLGVBQWUsRUFBRSxFQUFFLENBQUM7Z0JBQzVCLE9BQU87WUFDUixDQUFDO1lBQ0QsTUFBTSxjQUFjLEdBQUcsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDO1lBQzFELElBQUksQ0FBQyxjQUFjLElBQUksQ0FBQyxDQUFDLENBQUMsT0FBTyxFQUFFLENBQUM7Z0JBQ25DLE9BQU87WUFDUixDQUFDO1lBQ0QsQ0FBQyxDQUFDLGNBQWMsRUFBRSxDQUFDO1lBRW5CLElBQUksQ0FBQyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztnQkFDcEIsT0FBTztZQUNSLENBQUM7WUFFRCxJQUFJLElBQUksQ0FBQyxVQUFVLEtBQUssS0FBSyxFQUFFLENBQUM7Z0JBQy9CLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1lBQ3pCLENBQUM7WUFFRCxNQUFNLEtBQUssR0FBRyxDQUFDLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNwQyxJQUFJLENBQUMsVUFBVSxDQUFFLElBQUksQ0FBQyxVQUFxQixHQUFHLENBQUMsQ0FBQyxHQUFHLEtBQUssR0FBRyxrQkFBa0IsQ0FBQyxDQUFDLENBQUM7UUFDakYsQ0FBQyxFQUFFLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztRQUV4Qix5REFBeUQ7UUFDekQsd0NBQXdDO1FBQ3hDLElBQUksZ0JBQWdCLEdBQUcsS0FBSyxDQUFDO1FBQzdCLElBQUksZUFBZSxHQUFHLEtBQUssQ0FBQztRQUM1QixJQUFJLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsa0JBQWtCLEVBQUUsU0FBUyxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQWEsRUFBRSxFQUFFO1lBQzdILElBQUksQ0FBQyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztnQkFDcEIsT0FBTztZQUNSLENBQUM7WUFDRCxnQkFBZ0IsR0FBRyxDQUFDLENBQUMsT0FBTyxDQUFDO1lBQzdCLGVBQWUsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDO1FBQzVCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDSixJQUFJLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsa0JBQWtCLEVBQUUsU0FBUyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQWEsRUFBRSxFQUFFO1lBQ3hILElBQUksQ0FBQyxDQUFDLE1BQU0sS0FBSyxDQUFDLElBQUksSUFBSSxDQUFDLGVBQWUsRUFBRSxFQUFFLENBQUM7Z0JBQzlDLE9BQU87WUFDUixDQUFDO1lBQ0QsTUFBTSxTQUFTLEdBQUcsV0FBVyxDQUFDLENBQUMsQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLGdCQUFnQixDQUFDO1lBQ25FLElBQUksU0FBUyxFQUFFLENBQUM7Z0JBQ2YsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ2pCLENBQUM7aUJBQU0sQ0FBQztnQkFDUCxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDaEIsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSix5REFBeUQ7UUFDekQsTUFBTSxnQkFBZ0IsR0FBRyxDQUFDLENBQWdCLEVBQUUsRUFBRTtZQUM3QyxNQUFNLFNBQVMsR0FBRyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUM7WUFDckQsSUFBSSxDQUFDLFNBQVUsQ0FBQyxrQkFBa0IsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLFVBQVUsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUM1RSxDQUFDLENBQUM7UUFDRixJQUFJLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsU0FBUyxDQUFDLFFBQVEsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDLENBQUM7UUFDekcsSUFBSSxDQUFDLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLFNBQVMsQ0FBQyxNQUFNLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDO1FBRXZHLDJCQUEyQjtRQUMzQixJQUFJLENBQUMsa0JBQWtCLEdBQUcsRUFBRSxDQUFDO1FBQzdCLElBQUksU0FBUyxHQUFHLENBQUMsQ0FBQztRQUNsQixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNoRCxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRWxDLHdEQUF3RDtZQUN4RCxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQ3hDLE1BQU0sU0FBUyxHQUFHLENBQUMsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLElBQUksQ0FBQztnQkFDcEQsU0FBUyxDQUFDLFlBQVksQ0FBQyxhQUFhLEVBQUUsTUFBTSxDQUFDLENBQUM7Z0JBQzlDLElBQUksQ0FBQyxTQUFTLENBQUMsaUJBQWlCLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQ3pELENBQUM7WUFFRCxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztnQkFDaEQsTUFBTSxLQUFLLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDaEMsTUFBTSxnQkFBZ0IsR0FBRyxTQUFTLENBQUM7Z0JBQ25DLE1BQU0sV0FBVyxHQUFHLGVBQWUsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBRXBELE1BQU0sR0FBRyxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBQzdDLEdBQUcsQ0FBQyxTQUFTLEdBQUcsV0FBVyxDQUFDLENBQUMsQ0FBQywyQkFBMkIsQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDO2dCQUN4RSxHQUFHLENBQUMsU0FBUyxHQUFHLFdBQVc7b0JBQzFCLENBQUMsQ0FBQyxRQUFRLENBQUMsbUNBQW1DLEVBQUUsa0JBQWtCLEVBQUUsZ0JBQWdCLEdBQUcsQ0FBQyxFQUFFLElBQUksQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDO29CQUNsSCxDQUFDLENBQUMsUUFBUSxDQUFDLG1DQUFtQyxFQUFFLGtCQUFrQixFQUFFLGdCQUFnQixHQUFHLENBQUMsRUFBRSxJQUFJLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUVwSCxJQUFJLFdBQVcsRUFBRSxDQUFDO29CQUNqQixNQUFNLElBQUksR0FBRyxDQUFDLENBQUMsK0NBQStDLENBQUMsQ0FBQztvQkFDaEUsSUFBSSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsYUFBYSxFQUFFLE1BQU0sQ0FBQyxDQUFDO29CQUM5QyxHQUFHLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDNUIsQ0FBQztxQkFBTSxDQUFDO29CQUNQLE1BQU0sR0FBRyxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUM7b0JBQzFDLEdBQUcsQ0FBQyxTQUFTLEdBQUcsaUJBQWlCLENBQUM7b0JBQ2xDLEdBQUcsQ0FBQyxHQUFHLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztvQkFDckIsTUFBTSxvQkFBb0IsR0FBRyxJQUFJLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLElBQUksZUFBZSxFQUFFLENBQUMsQ0FBQztvQkFFakYsTUFBTSxVQUFVLEdBQUcsR0FBRyxFQUFFO3dCQUN2QixJQUFJLG9CQUFvQixDQUFDLFVBQVUsRUFBRSxDQUFDOzRCQUNyQyxPQUFPO3dCQUNSLENBQUM7d0JBRUQsSUFBSSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7NEJBQ3ZDLEdBQUcsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDOzRCQUM1QixHQUFHLENBQUMsZUFBZSxDQUFDLEtBQUssQ0FBQyxDQUFDOzRCQUMzQixHQUFHLENBQUMsR0FBRyxHQUFHLEVBQUUsQ0FBQzs0QkFDYixHQUFHLENBQUMsTUFBTSxFQUFFLENBQUM7NEJBQ2IsTUFBTSxRQUFRLEdBQUcsQ0FBQyxDQUFDLG9EQUFvRCxDQUFDLENBQUM7NEJBQ3pFLFFBQVEsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLGFBQWEsRUFBRSxNQUFNLENBQUMsQ0FBQzs0QkFDbEQsR0FBRyxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7d0JBQ2hDLENBQUM7b0JBQ0YsQ0FBQyxDQUFDO29CQUVGLElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFO3dCQUNuQyxJQUFJLG9CQUFvQixDQUFDLFVBQVUsRUFBRSxDQUFDOzRCQUNyQyxPQUFPO3dCQUNSLENBQUM7d0JBRUQsSUFBSSxHQUFHLEVBQUUsQ0FBQzs0QkFDVCxNQUFNLFNBQVMsR0FBRyxJQUFJLEtBQUssRUFBRSxDQUFDOzRCQUM5QixvQkFBb0IsQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUMsU0FBUyxFQUFFLE1BQU0sRUFBRSxHQUFHLEVBQUU7Z0NBQ3RFLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztvQ0FDdEMsT0FBTztnQ0FDUixDQUFDO2dDQUNELEdBQUcsQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO2dDQUNkLElBQUksQ0FBQyxHQUFHLENBQUMsYUFBYSxFQUFFLENBQUM7b0NBQ3hCLEdBQUcsQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLENBQUM7Z0NBQ3RCLENBQUM7NEJBQ0YsQ0FBQyxDQUFDLENBQUMsQ0FBQzs0QkFDSixvQkFBb0IsQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUMsU0FBUyxFQUFFLE9BQU8sRUFBRSxHQUFHLEVBQUU7Z0NBQ3ZFLFVBQVUsRUFBRSxDQUFDOzRCQUNkLENBQUMsQ0FBQyxDQUFDLENBQUM7NEJBQ0osU0FBUyxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7d0JBQ3JCLENBQUM7NkJBQU0sQ0FBQzs0QkFDUCxVQUFVLEVBQUUsQ0FBQzt3QkFDZCxDQUFDO29CQUNGLENBQUMsRUFBRSxHQUFHLEVBQUU7d0JBQ1AsVUFBVSxFQUFFLENBQUM7b0JBQ2QsQ0FBQyxDQUFDLENBQUM7b0JBQ0gsb0JBQW9CLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLEdBQUcsRUFBRSxPQUFPLEVBQUUsR0FBRyxFQUFFO3dCQUNqRSxVQUFVLEVBQUUsQ0FBQztvQkFDZCxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNMLENBQUM7Z0JBRUQsSUFBSSxDQUFDLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxHQUFHLEVBQUUsT0FBTyxFQUFFLEdBQUcsRUFBRTtvQkFDckUsSUFBSSxDQUFDLGFBQWEsR0FBRyxnQkFBZ0IsQ0FBQztvQkFDdEMsSUFBSSxDQUFDLGtCQUFrQixFQUFFLENBQUM7Z0JBQzNCLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBRUosSUFBSSxDQUFDLFNBQVMsQ0FBQyxpQkFBaUIsQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQ2xELElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQ2xDLFNBQVMsRUFBRSxDQUFDO1lBQ2IsQ0FBQztRQUNGLENBQUM7UUFFRCxJQUFJLENBQUMsVUFBVSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFM0Msb0JBQW9CO1FBQ3BCLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO0lBQzNCLENBQUM7SUFFRDs7O09BR0c7SUFDSyxLQUFLLENBQUMsa0JBQWtCO1FBQy9CLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDckIsT0FBTztRQUNSLENBQUM7UUFFRCxrRUFBa0U7UUFDbEUsNkVBQTZFO1FBQzdFLE1BQU0sZUFBZSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUM7UUFFM0MscURBQXFEO1FBQ3JELG1FQUFtRTtRQUNuRSx5RUFBeUU7UUFDekUsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUNoRCxNQUFNLFlBQVksR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDO1FBQ2pDLE1BQU0sT0FBTyxHQUFHLGVBQWUsQ0FBQyxZQUFZLENBQUMsUUFBUSxDQUFDLENBQUM7UUFFdkQsSUFBSSxPQUFPLEVBQUUsQ0FBQztZQUNiLG1DQUFtQztZQUNuQyxJQUFJLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsT0FBTyxHQUFHLE1BQU0sQ0FBQztZQUNoRCxJQUFJLENBQUMsU0FBUyxDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztZQUNqRCxJQUFJLENBQUMsU0FBUyxDQUFDLGtCQUFrQixDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDN0QsSUFBSSxDQUFDLFNBQVMsQ0FBQyxrQkFBa0IsQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLFNBQVMsQ0FBQztZQUUzRCx3Q0FBd0M7WUFDeEMsTUFBTSxPQUFPLEdBQUcsTUFBTSxJQUFJLENBQUMsWUFBWSxDQUFDLFlBQVksQ0FBQyxDQUFDO1lBQ3RELElBQUksSUFBSSxDQUFDLGFBQWEsS0FBSyxlQUFlLEVBQUUsQ0FBQztnQkFDNUMsT0FBTztZQUNSLENBQUM7WUFFRCxNQUFNLEtBQUssR0FBRyxZQUFZLEVBQUUsQ0FBQztZQUM3QixNQUFNLFNBQVMsR0FBRzs7O21IQUc4RixLQUFLLHVCQUF1QixLQUFLO2dCQUNwSSxLQUFLOzs7O2lCQUlKLEtBQUs7OztlQUdQLENBQUM7WUFFYixpRUFBaUU7WUFDakUsSUFBSSxPQUF3QixDQUFDO1lBQzdCLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7Z0JBQ3pCLE9BQU8sR0FBRyxJQUFJLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsb0JBQW9CLENBQUM7b0JBQ2hGLEtBQUssRUFBRSxZQUFZLENBQUMsSUFBSTtvQkFDeEIsT0FBTyxFQUFFLEVBQUUsb0JBQW9CLEVBQUUsSUFBSSxFQUFFO29CQUN2QyxjQUFjLEVBQUUsRUFBRSxZQUFZLEVBQUUsSUFBSSxFQUFFO29CQUN0QyxTQUFTLEVBQUUsU0FBUztpQkFDcEIsQ0FBQyxDQUFDLENBQUM7Z0JBQ0osT0FBTyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLGNBQWMsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQzVELElBQUksQ0FBQyxhQUFhLEdBQUcsT0FBTyxDQUFDO1lBQzlCLENBQUM7aUJBQU0sQ0FBQztnQkFDUCxPQUFPLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQztZQUM5QixDQUFDO1lBRUQsT0FBTyxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUUzQixxREFBcUQ7WUFDckQsTUFBTSxNQUFNLEdBQUksT0FBbUMsQ0FBQyxNQUFNLENBQUM7WUFDM0QsT0FBTyxDQUFDLFdBQVcsQ0FBQyxFQUFFLElBQUksRUFBRSxXQUFXLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsWUFBWSxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztRQUNyRyxDQUFDO2FBQU0sQ0FBQztZQUNQLG1DQUFtQztZQUNuQyxJQUFJLENBQUMsU0FBUyxDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQUMsT0FBTyxHQUFHLE1BQU0sQ0FBQztZQUNyRCxJQUFJLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztZQUM1QyxJQUFJLENBQUMsU0FBUyxDQUFDLGtCQUFrQixDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsRUFBRSxDQUFDO1lBRXBELE1BQU0sR0FBRyxHQUFHLE1BQU0sSUFBSSxDQUFDLFlBQVksQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUVsRCx5RUFBeUU7WUFDekUsSUFBSSxJQUFJLENBQUMsYUFBYSxLQUFLLGVBQWUsRUFBRSxDQUFDO2dCQUM1QyxPQUFPO1lBQ1IsQ0FBQztZQUVELE1BQU0sR0FBRyxHQUFHLElBQUksS0FBSyxFQUFFLENBQUM7WUFDeEIsR0FBRyxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7WUFDZCxHQUFHLENBQUMsTUFBTSxFQUFFLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRTtnQkFDdEIseURBQXlEO2dCQUN6RCxJQUFJLElBQUksQ0FBQyxhQUFhLEtBQUssZUFBZSxJQUFJLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztvQkFDOUQsSUFBSSxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztvQkFDbkMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsR0FBRyxHQUFHLFlBQVksQ0FBQyxJQUFJLENBQUM7Z0JBQ2xELENBQUM7WUFDRixDQUFDLEVBQUUsR0FBRyxFQUFFO2dCQUNQLHNFQUFzRTtnQkFDdEUsSUFBSSxJQUFJLENBQUMsYUFBYSxLQUFLLGVBQWUsSUFBSSxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7b0JBQzlELElBQUksQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7b0JBQ25DLElBQUksQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLEdBQUcsR0FBRyxZQUFZLENBQUMsSUFBSSxDQUFDO2dCQUNsRCxDQUFDO1lBQ0YsQ0FBQyxDQUFDLENBQUM7UUFDSixDQUFDO1FBRUQsbUNBQW1DO1FBQ25DLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLENBQUM7UUFFdkIsaURBQWlEO1FBQ2pELElBQUksWUFBWSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQzFCLElBQUksQ0FBQyxTQUFTLENBQUMsV0FBVyxDQUFDLFdBQVcsR0FBRyxZQUFZLENBQUMsT0FBTyxDQUFDO1lBQzlELElBQUksQ0FBQyxTQUFTLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO1lBQzlDLElBQUksQ0FBQyxTQUFTLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7UUFDcEQsQ0FBQzthQUFNLENBQUM7WUFDUCxJQUFJLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxXQUFXLEdBQUcsRUFBRSxDQUFDO1lBQzVDLElBQUksQ0FBQyxTQUFTLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxPQUFPLEdBQUcsTUFBTSxDQUFDO1lBQ2xELElBQUksQ0FBQyxTQUFTLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLE9BQU8sR0FBRyxNQUFNLENBQUM7UUFDeEQsQ0FBQztRQUNELElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLFdBQVcsR0FBRyxRQUFRLENBQUMsdUJBQXVCLEVBQUUsV0FBVyxFQUFFLGVBQWUsR0FBRyxDQUFDLEVBQUUsSUFBSSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUVsSSx5RUFBeUU7UUFDekUsTUFBTSxRQUFRLEdBQUcsT0FBTztZQUN2QixDQUFDLENBQUMsUUFBUSxDQUFDLHlCQUF5QixFQUFFLE9BQU8sQ0FBQztZQUM5QyxDQUFDLENBQUMsUUFBUSxDQUFDLHlCQUF5QixFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQ2hELElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLFdBQVcsR0FBRyxZQUFZLENBQUMsT0FBTztZQUMzRCxDQUFDLENBQUMsUUFBUSxDQUFDLGlDQUFpQyxFQUFFLHFCQUFxQixFQUFFLFFBQVEsRUFBRSxlQUFlLEdBQUcsQ0FBQyxFQUFFLElBQUksQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFFLFlBQVksQ0FBQyxPQUFPLENBQUM7WUFDbEosQ0FBQyxDQUFDLFFBQVEsQ0FBQyw4QkFBOEIsRUFBRSxxQkFBcUIsRUFBRSxRQUFRLEVBQUUsZUFBZSxHQUFHLENBQUMsRUFBRSxJQUFJLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxZQUFZLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFOUksdUJBQXVCO1FBQ3ZCLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLFFBQVEsR0FBRyxlQUFlLEtBQUssQ0FBQyxDQUFDO1FBQ3hELElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLFFBQVEsR0FBRyxlQUFlLEtBQUssSUFBSSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDO1FBRWxGLDREQUE0RDtRQUM1RCw4REFBOEQ7UUFDOUQsOERBQThEO1FBQzlELEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUMsa0JBQWtCLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDekQsTUFBTSxRQUFRLEdBQUcsQ0FBQyxLQUFLLGVBQWUsQ0FBQztZQUN2QyxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDN0MsU0FBUyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1lBQy9DLElBQUksUUFBUSxFQUFFLENBQUM7Z0JBQ2QsU0FBUyxDQUFDLFlBQVksQ0FBQyxjQUFjLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDaEQsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLFNBQVMsQ0FBQyxlQUFlLENBQUMsY0FBYyxDQUFDLENBQUM7WUFDM0MsQ0FBQztRQUNGLENBQUM7UUFFRCwwRUFBMEU7UUFDMUUsZ0VBQWdFO1FBQ2hFLG1FQUFtRTtRQUNuRSxrQ0FBa0M7UUFDbEMsTUFBTSxlQUFlLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBQ2pFLElBQUksZUFBZSxFQUFFLENBQUM7WUFDckIsZUFBZSxDQUFDLGNBQWMsQ0FBQyxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUM7UUFDekUsQ0FBQztRQUVELGlEQUFpRDtRQUNqRCxJQUFJLElBQUksQ0FBQyxLQUFLLFlBQVksd0JBQXdCLEVBQUUsQ0FBQztZQUNwRCxNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUMxRCxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQUMsS0FBSyxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3pFLENBQUM7UUFFRCxrREFBa0Q7UUFDbEQsSUFBSSxDQUFDLHNCQUFzQixFQUFFLENBQUM7SUFDL0IsQ0FBQztJQUVPLEtBQUssQ0FBQyxZQUFZLENBQUMsS0FBcUI7UUFDL0MsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ2hELElBQUksTUFBTSxFQUFFLENBQUM7WUFDWixPQUFPLE1BQU0sQ0FBQztRQUNmLENBQUM7UUFFRCxJQUFJLE1BQWtCLENBQUM7UUFDdkIsSUFBSSxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDaEIsdUZBQXVGO1lBQ3ZGLE1BQU0sR0FBRyxLQUFLLENBQUMsSUFBSSxZQUFZLFVBQVUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUM7UUFDNUUsQ0FBQzthQUFNLElBQUksS0FBSyxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQ3RCLE1BQU0sT0FBTyxHQUFHLE1BQU0sSUFBSSxDQUFDLFlBQVksQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQzVELE1BQU0sR0FBRyxPQUFPLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQztRQUMvQixDQUFDO2FBQU0sQ0FBQztZQUNQLE9BQU8sRUFBRSxDQUFDO1FBQ1gsQ0FBQztRQUVELE1BQU0sSUFBSSxHQUFHLElBQUksSUFBSSxDQUFDLENBQUMsTUFBaUMsQ0FBQyxFQUFFLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO1FBQ3JGLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDdEMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUUsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUN0QyxPQUFPLEdBQUcsQ0FBQztJQUNaLENBQUM7SUFFTyxxQkFBcUI7UUFDNUIsS0FBSyxNQUFNLEdBQUcsSUFBSSxJQUFJLENBQUMsYUFBYSxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUM7WUFDL0MsR0FBRyxDQUFDLGVBQWUsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUMxQixDQUFDO1FBQ0QsSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLEVBQUUsQ0FBQztJQUM1QixDQUFDO0lBRU8sS0FBSyxDQUFDLFlBQVksQ0FBQyxLQUFxQjtRQUMvQyxJQUFJLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNoQixPQUFPLEtBQUssQ0FBQyxJQUFJLFlBQVksVUFBVSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQztRQUMxRSxDQUFDO2FBQU0sSUFBSSxLQUFLLENBQUMsR0FBRyxFQUFFLENBQUM7WUFDdEIsTUFBTSxPQUFPLEdBQUcsTUFBTSxJQUFJLENBQUMsWUFBWSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDNUQsT0FBTyxPQUFPLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQztRQUM3QixDQUFDO1FBQ0QsT0FBTyxJQUFJLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUMxQixDQUFDO0lBRU8sc0JBQXNCO1FBQzdCLEtBQUssTUFBTSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxHQUFHLENBQUMsRUFBRSxJQUFJLENBQUMsYUFBYSxHQUFHLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDcEUsSUFBSSxHQUFHLElBQUksQ0FBQyxJQUFJLEdBQUcsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxDQUFDO2dCQUMvQyxNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQztnQkFDbEQsSUFBSSxlQUFlLENBQUMsYUFBYSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7b0JBQzdDLDBEQUEwRDtvQkFDMUQsSUFBSSxDQUFDLFlBQVksQ0FBQyxhQUFhLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLEdBQWdCLENBQUMsQ0FBQyxDQUFDO2dCQUNoRSxDQUFDO3FCQUFNLENBQUM7b0JBQ1AsSUFBSSxDQUFDLFlBQVksQ0FBQyxhQUFhLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUU7d0JBQzNDLDBEQUEwRDt3QkFDMUQscURBQXFEO3dCQUNyRCxNQUFNLEdBQUcsR0FBRyxJQUFJLEtBQUssRUFBRSxDQUFDO3dCQUN4QixHQUFHLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQzt3QkFDZCxHQUFHLENBQUMsTUFBTSxFQUFFLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxHQUF1QixDQUFDLENBQUMsQ0FBQztvQkFDbkQsQ0FBQyxDQUFDLENBQUM7Z0JBQ0osQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQztJQUVELFFBQVE7UUFDUCxJQUFJLElBQUksQ0FBQyxhQUFhLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDNUIsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO1lBQ3JCLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1FBQzNCLENBQUM7SUFDRixDQUFDO0lBRUQsSUFBSTtRQUNILElBQUksSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUN0RCxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDckIsSUFBSSxDQUFDLGtCQUFrQixFQUFFLENBQUM7UUFDM0IsQ0FBQztJQUNGLENBQUM7SUFFRDs7T0FFRztJQUNLLGdCQUFnQjtRQUN2QixJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ3JCLE9BQU87UUFDUixDQUFDO1FBQ0QsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUM7UUFDckMsSUFBSSxHQUFHLENBQUMsWUFBWSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQzFCLElBQUksQ0FBQyxVQUFVLEdBQUcsR0FBRyxDQUFDLFdBQVcsR0FBRyxHQUFHLENBQUMsWUFBWSxDQUFDO1FBQ3RELENBQUM7YUFBTSxDQUFDO1lBQ1AsSUFBSSxDQUFDLFVBQVUsR0FBRyxDQUFDLENBQUM7UUFDckIsQ0FBQztJQUNGLENBQUM7SUFFRDs7T0FFRztJQUNLLE9BQU87UUFDZCxJQUFJLElBQUksQ0FBQyxVQUFVLEtBQUssS0FBSyxFQUFFLENBQUM7WUFDL0IsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7UUFDekIsQ0FBQztRQUNELE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxVQUFvQixDQUFDO1FBQ3hDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNWLE9BQU8sQ0FBQyxHQUFHLFdBQVcsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQztZQUNwQyxJQUFJLFdBQVcsQ0FBQyxDQUFDLENBQUMsR0FBRyxLQUFLLEVBQUUsQ0FBQztnQkFDNUIsTUFBTTtZQUNQLENBQUM7UUFDRixDQUFDO1FBQ0QsSUFBSSxDQUFDLFVBQVUsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLElBQUksU0FBUyxDQUFDLENBQUM7SUFDOUMsQ0FBQztJQUVEOztPQUVHO0lBQ0ssUUFBUTtRQUNmLElBQUksSUFBSSxDQUFDLFVBQVUsS0FBSyxLQUFLLEVBQUUsQ0FBQztZQUMvQixJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztRQUN6QixDQUFDO1FBQ0QsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLFVBQW9CLENBQUM7UUFDeEMsSUFBSSxDQUFDLEdBQUcsV0FBVyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUM7UUFDL0IsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUM7WUFDcEIsSUFBSSxXQUFXLENBQUMsQ0FBQyxDQUFDLEdBQUcsS0FBSyxFQUFFLENBQUM7Z0JBQzVCLE1BQU07WUFDUCxDQUFDO1FBQ0YsQ0FBQztRQUNELElBQUksQ0FBQyxVQUFVLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxJQUFJLFNBQVMsQ0FBQyxDQUFDO0lBQzlDLENBQUM7SUFFRDs7T0FFRztJQUNLLFVBQVUsQ0FBQyxRQUFtQjtRQUNyQyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ3JCLE9BQU87UUFDUixDQUFDO1FBRUQsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxrQkFBa0IsQ0FBQztRQUNwRCxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQztRQUVyQyxJQUFJLFFBQVEsS0FBSyxLQUFLLEVBQUUsQ0FBQztZQUN4QixJQUFJLENBQUMsVUFBVSxHQUFHLEtBQUssQ0FBQztZQUN4QixHQUFHLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQztZQUNsQyxHQUFHLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUNsQyxHQUFHLENBQUMsS0FBSyxDQUFDLElBQUksR0FBRyxFQUFFLENBQUM7WUFDcEIsK0RBQStEO1lBQy9ELHVEQUF1RDtZQUN2RCxNQUFNLFNBQVMsR0FBRyxTQUFTLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUN6RCxTQUFTLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUNyQyxTQUFTLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUN2QyxJQUFJLFNBQVMsRUFBRSxDQUFDO2dCQUNmLFNBQVMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzFCLENBQUM7UUFDRixDQUFDO2FBQU0sQ0FBQztZQUNQLE1BQU0sS0FBSyxHQUFHLEtBQUssQ0FBQyxRQUFRLEVBQUUsU0FBUyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBQ3BELElBQUksQ0FBQyxVQUFVLEdBQUcsS0FBSyxDQUFDO1lBRXhCLG9EQUFvRDtZQUNwRCxNQUFNLEVBQUUsR0FBRyxTQUFTLENBQUMsV0FBVyxHQUFHLENBQUM7Z0JBQ25DLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxVQUFVLEdBQUcsU0FBUyxDQUFDLFdBQVcsR0FBRyxDQUFDLENBQUMsR0FBRyxTQUFTLENBQUMsV0FBVztnQkFDNUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQztZQUNQLE1BQU0sRUFBRSxHQUFHLFNBQVMsQ0FBQyxZQUFZLEdBQUcsQ0FBQztnQkFDcEMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUMsWUFBWSxHQUFHLENBQUMsQ0FBQyxHQUFHLFNBQVMsQ0FBQyxZQUFZO2dCQUM3RSxDQUFDLENBQUMsR0FBRyxDQUFDO1lBRVAsR0FBRyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDLENBQUM7WUFDckMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsV0FBVyxFQUFFLEtBQUssSUFBSSxvQkFBb0IsQ0FBQyxDQUFDO1lBQ2pFLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUMvQixTQUFTLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUVsQyx3RUFBd0U7WUFDeEUsd0VBQXdFO1lBQ3hFLE1BQU0sVUFBVSxHQUFHLFNBQVMsQ0FBQyxXQUFXLEdBQUcsRUFBRSxHQUFHLFNBQVMsQ0FBQyxXQUFXLEdBQUcsQ0FBQyxDQUFDO1lBQzFFLE1BQU0sVUFBVSxHQUFHLFNBQVMsQ0FBQyxZQUFZLEdBQUcsRUFBRSxHQUFHLFNBQVMsQ0FBQyxZQUFZLEdBQUcsQ0FBQyxDQUFDO1lBQzVFLFNBQVMsQ0FBQyxRQUFRLENBQUMsVUFBVSxFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBQzVDLENBQUM7SUFDRixDQUFDO0lBRVEsS0FBSztRQUNiLEtBQUssQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNkLElBQUksQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO0lBQzlCLENBQUM7SUFFUSxNQUFNLENBQUMsU0FBb0I7UUFDbkMsSUFBSSxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDckIsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsS0FBSyxHQUFHLEdBQUcsU0FBUyxDQUFDLEtBQUssSUFBSSxDQUFDO1lBQ3JELElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLE1BQU0sR0FBRyxHQUFHLFNBQVMsQ0FBQyxNQUFNLElBQUksQ0FBQztRQUN4RCxDQUFDO0lBQ0YsQ0FBQzs7QUFscUJXLG1CQUFtQjtJQStCN0IsV0FBQSxpQkFBaUIsQ0FBQTtJQUNqQixXQUFBLGFBQWEsQ0FBQTtJQUNiLFdBQUEsZUFBZSxDQUFBO0lBQ2YsV0FBQSxZQUFZLENBQUE7SUFDWixXQUFBLGVBQWUsQ0FBQTtHQW5DTCxtQkFBbUIsQ0FtcUIvQiJ9
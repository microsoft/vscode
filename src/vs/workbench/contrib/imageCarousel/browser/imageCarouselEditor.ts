/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, clearNode, Dimension, EventType, h } from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { clamp } from '../../../../base/common/numbers.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { localize } from '../../../../nls.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../common/editor.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { ImageCarouselEditorInput } from './imageCarouselEditorInput.js';
import { ICarouselImage, ICarouselSection } from './imageCarouselTypes.js';

/**
 * A flat entry referencing a specific image within a section, used
 * for global index-based navigation across all sections.
 */
interface IFlatImageEntry {
	readonly sectionIndex: number;
	readonly imageIndexInSection: number;
	readonly image: ICarouselImage;
}

type ZoomScale = number | 'fit';

const SCALE_PINCH_FACTOR = 0.075;
const MAX_SCALE = 20;
const MIN_SCALE = 0.1;
const PIXELATION_THRESHOLD = 3;
const ZOOM_LEVELS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.5, 2, 3, 5, 7, 10, 15, 20];

export class ImageCarouselEditor extends EditorPane {
	static readonly ID = 'workbench.editor.imageCarousel';

	private _container: HTMLElement | undefined;
	private _currentIndex: number = 0;
	private _zoomScale: ZoomScale = 'fit';
	private _sections: ReadonlyArray<ICarouselSection> = [];
	private _flatImages: IFlatImageEntry[] = [];
	private readonly _contentDisposables = this._register(new DisposableStore());
	private readonly _imageDisposables = this._register(new DisposableStore());

	private _elements: {
		root: HTMLElement;
		imageArea: HTMLElement;
		mainImageContainer: HTMLElement;
		mainImage: HTMLImageElement;
		caption: HTMLElement;
		prevBtn: HTMLButtonElement;
		nextBtn: HTMLButtonElement;
		sectionsContainer: HTMLElement;
	} | undefined;
	private _thumbnailElements: HTMLElement[] = [];

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService
	) {
		super(ImageCarouselEditor.ID, group, telemetryService, themeService, storageService);
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
		this._contentDisposables.clear();
		this._imageDisposables.clear();
		this._zoomScale = 'fit';
		if (this._container) {
			clearNode(this._container);
		}
		this._elements = undefined;
		this._thumbnailElements = [];
		super.clearInput();
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
				]),
				h('button.nav-arrow.prev-arrow@prevBtn', { ariaLabel: localize('imageCarousel.previousImage', "Previous image") }, [
					h('span.codicon.codicon-chevron-left'),
				]),
				h('button.nav-arrow.next-arrow@nextBtn', { ariaLabel: localize('imageCarousel.nextImage', "Next image") }, [
					h('span.codicon.codicon-chevron-right'),
				]),
			]),
			h('div.bottom-bar@bottomBar', [
				h('div.image-caption@caption'),
				h('div.sections-container@sectionsContainer'),
			]),
		]);

		this._elements = {
			root: elements.root,
			imageArea: elements.imageArea,
			mainImageContainer: elements.mainImageContainer,
			mainImage: elements.mainImage as HTMLImageElement,
			caption: elements.caption,
			prevBtn: elements.prevBtn as HTMLButtonElement,
			nextBtn: elements.nextBtn as HTMLButtonElement,
			sectionsContainer: elements.sectionsContainer,
		};

		// Initialize image in fit mode
		this._elements.mainImage.classList.add('scale-to-fit');

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

		// Zoom: scroll wheel + modifier key (Ctrl on Win/Linux, Alt on Mac) or pinch
		this._contentDisposables.add(addDisposableListener(this._elements.imageArea, EventType.MOUSE_WHEEL, (e: WheelEvent) => {
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
			this._applyZoom((this._zoomScale as number) * (1 - delta * SCALE_PINCH_FACTOR));
		}, { passive: false }));

		// Zoom: single click to zoom in/out (like image preview)
		// Track modifier keys at mousedown time
		let clickCtrlPressed = false;
		let clickAltPressed = false;
		this._contentDisposables.add(addDisposableListener(this._elements.mainImageContainer, EventType.MOUSE_DOWN, (e: MouseEvent) => {
			if (e.button !== 0) {
				return;
			}
			clickCtrlPressed = e.ctrlKey;
			clickAltPressed = e.altKey;
		}));
		this._contentDisposables.add(addDisposableListener(this._elements.mainImageContainer, EventType.CLICK, (e: MouseEvent) => {
			if (e.button !== 0) {
				return;
			}
			const isZoomOut = isMacintosh ? clickAltPressed : clickCtrlPressed;
			if (isZoomOut) {
				this._zoomOut();
			} else {
				this._zoomIn();
			}
		}));

		// Update zoom-out cursor class when modifier key is held
		const updateZoomCursor = (e: KeyboardEvent) => {
			const isZoomOut = isMacintosh ? e.altKey : e.ctrlKey;
			this._elements!.mainImageContainer.classList.toggle('zoom-out', isZoomOut);
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
				this._elements.sectionsContainer.appendChild(h('div.thumbnail-separator').root);
			}

			for (let i = 0; i < section.images.length; i++) {
				const image = section.images[i];
				const currentFlatIndex = flatIndex;
				const thumbnail = h('button.thumbnail@root', [
					h('img.thumbnail-image@img'),
				]);

				const btn = thumbnail.root as HTMLButtonElement;
				btn.ariaLabel = localize('imageCarousel.thumbnailLabel', "Image {0} of {1}", currentFlatIndex + 1, this._flatImages.length);

				const img = thumbnail.img as HTMLImageElement;
				const blob = new Blob([image.data.buffer.slice(0)], { type: image.mimeType });
				const url = URL.createObjectURL(blob);
				img.src = url;
				img.alt = image.name;
				this._contentDisposables.add({ dispose: () => URL.revokeObjectURL(url) });

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
	private updateCurrentImage(): void {
		if (!this._elements) {
			return;
		}

		// Swap main image blob URL
		this._imageDisposables.clear();
		const entry = this._flatImages[this._currentIndex];
		const currentImage = entry.image;
		const blob = new Blob([currentImage.data.buffer.slice(0)], { type: currentImage.mimeType });
		const url = URL.createObjectURL(blob);
		this._elements.mainImage.src = url;
		this._elements.mainImage.alt = currentImage.name;
		this._imageDisposables.add({ dispose: () => URL.revokeObjectURL(url) });

		// Reset zoom when switching images
		this._applyZoom('fit');

		// Update caption
		if (currentImage.caption) {
			this._elements.caption.textContent = currentImage.caption;
			this._elements.caption.style.display = '';
		} else {
			this._elements.caption.textContent = '';
			this._elements.caption.style.display = 'none';
		}

		// Update button states
		this._elements.prevBtn.disabled = this._currentIndex === 0;
		this._elements.nextBtn.disabled = this._currentIndex === this._flatImages.length - 1;

		// Update thumbnail selection
		for (let i = 0; i < this._thumbnailElements.length; i++) {
			const isActive = i === this._currentIndex;
			const thumbnail = this._thumbnailElements[i];
			thumbnail.classList.toggle('active', isActive);
			if (isActive) {
				thumbnail.setAttribute('aria-current', 'page');
				// Scroll only the thumbnail strip, not the entire editor
				const container = this._elements.sectionsContainer;
				const containerRect = container.getBoundingClientRect();
				const thumbRect = thumbnail.getBoundingClientRect();
				if (thumbRect.left < containerRect.left) {
					container.scrollLeft += thumbRect.left - containerRect.left;
				} else if (thumbRect.right > containerRect.right) {
					container.scrollLeft += thumbRect.right - containerRect.right;
				}
			} else {
				thumbnail.removeAttribute('aria-current');
			}
		}

		// Update editor title to reflect current section
		if (this.input instanceof ImageCarouselEditorInput) {
			const currentSection = this._sections[entry.sectionIndex];
			this.input.setName(currentSection.title || this.input.collection.title);
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

	/**
	 * Compute the current display scale when transitioning from 'fit' to numeric zoom.
	 */
	private _initZoomFromFit(): void {
		if (!this._elements) {
			return;
		}
		const img = this._elements.mainImage;
		if (img.naturalWidth > 0) {
			this._zoomScale = img.clientWidth / img.naturalWidth;
		} else {
			this._zoomScale = 1;
		}
	}

	/**
	 * Zoom in to the next predefined zoom level.
	 */
	private _zoomIn(): void {
		if (this._zoomScale === 'fit') {
			this._initZoomFromFit();
		}
		const scale = this._zoomScale as number;
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
	private _zoomOut(): void {
		if (this._zoomScale === 'fit') {
			this._initZoomFromFit();
		}
		const scale = this._zoomScale as number;
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
	private _applyZoom(newScale: ZoomScale): void {
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
			container.classList.remove('zoomed');
			container.classList.remove('zoom-out');
			container.scrollTo(0, 0);
		} else {
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

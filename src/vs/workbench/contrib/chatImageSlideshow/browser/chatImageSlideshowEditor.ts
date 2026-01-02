/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../common/editor.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ChatImageSlideshowEditorInput } from './chatImageSlideshowEditorInput.js';
import { ISlideshowImage } from './chatImageSlideshowTypes.js';

/**
 * Editor pane for displaying chat images in a slideshow
 */
export class ChatImageSlideshowEditor extends EditorPane {
	static readonly ID = 'workbench.editor.chatImageSlideshow';

	private _container: HTMLElement | undefined;
	private _currentIndex: number = 0;
	private _images: ReadonlyArray<ISlideshowImage> = [];
	private readonly _contentDisposables = this._register(new DisposableStore());

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService
	) {
		super(ChatImageSlideshowEditor.ID, telemetryService, themeService, storageService);
	}

	protected override createEditor(parent: HTMLElement): void {
		this._container = DOM.$('.chat-image-slideshow-editor');
		parent.appendChild(this._container);
	}

	override async setInput(input: ChatImageSlideshowEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);

		this._images = input.collection.images;
		this._currentIndex = 0;
		this.renderSlideshow();
	}

	override clearInput(): void {
		this._contentDisposables.clear();
		super.clearInput();
	}

	private renderSlideshow(): void {
		if (!this._container) {
			return;
		}

		this._contentDisposables.clear();
		DOM.clearNode(this._container);

		if (this._images.length === 0) {
			const message = DOM.$('.empty-message');
			message.textContent = 'No images to display';
			this._container.appendChild(message);
			return;
		}

		// Create slideshow structure
		const slideshowContainer = DOM.$('.slideshow-container');
		
		// Add image display area
		const imageArea = DOM.$('.image-area');
		const currentImage = this._images[this._currentIndex];
		const img = this.createImageElement(currentImage);
		imageArea.appendChild(img);
		slideshowContainer.appendChild(imageArea);

		// Add navigation controls
		const controls = this.createControls();
		slideshowContainer.appendChild(controls);

		// Add thumbnails
		const thumbnails = this.createThumbnails();
		slideshowContainer.appendChild(thumbnails);

		this._container.appendChild(slideshowContainer);
	}

	private createImageElement(image: ISlideshowImage): HTMLElement {
		const container = DOM.$('.main-image-container');
		const img = DOM.$('img.main-image') as HTMLImageElement;
		
		// Convert VSBuffer to blob URL
		const blob = new Blob([image.data.buffer], { type: image.mimeType });
		const url = URL.createObjectURL(blob);
		img.src = url;
		img.alt = image.name;

		// Clean up URL when image is removed
		this._contentDisposables.add({
			dispose: () => URL.revokeObjectURL(url)
		});

		container.appendChild(img);
		return container;
	}

	private createControls(): HTMLElement {
		const controls = DOM.$('.slideshow-controls');

		// Previous button
		const prevBtn = DOM.$('button.nav-button.prev-button');
		prevBtn.textContent = '❮ Previous';
		prevBtn.disabled = this._currentIndex === 0;
		this._contentDisposables.add(DOM.addDisposableListener(prevBtn, 'click', () => {
			if (this._currentIndex > 0) {
				this._currentIndex--;
				this.renderSlideshow();
			}
		}));
		controls.appendChild(prevBtn);

		// Image counter
		const counter = DOM.$('.image-counter');
		counter.textContent = `${this._currentIndex + 1} / ${this._images.length}`;
		controls.appendChild(counter);

		// Next button
		const nextBtn = DOM.$('button.nav-button.next-button');
		nextBtn.textContent = 'Next ❯';
		nextBtn.disabled = this._currentIndex === this._images.length - 1;
		this._contentDisposables.add(DOM.addDisposableListener(nextBtn, 'click', () => {
			if (this._currentIndex < this._images.length - 1) {
				this._currentIndex++;
				this.renderSlideshow();
			}
		}));
		controls.appendChild(nextBtn);

		return controls;
	}

	private createThumbnails(): HTMLElement {
		const thumbnailsContainer = DOM.$('.thumbnails-container');

		for (let i = 0; i < this._images.length; i++) {
			const image = this._images[i];
			const thumbnail = DOM.$('.thumbnail');
			if (i === this._currentIndex) {
				thumbnail.classList.add('active');
			}

			const img = DOM.$('img.thumbnail-image') as HTMLImageElement;
			const blob = new Blob([image.data.buffer], { type: image.mimeType });
			const url = URL.createObjectURL(blob);
			img.src = url;
			img.alt = image.name;

			this._contentDisposables.add({
				dispose: () => URL.revokeObjectURL(url)
			});

			this._contentDisposables.add(DOM.addDisposableListener(thumbnail, 'click', () => {
				this._currentIndex = i;
				this.renderSlideshow();
			}));

			thumbnail.appendChild(img);
			thumbnailsContainer.appendChild(thumbnail);
		}

		return thumbnailsContainer;
	}

	override layout(dimension: DOM.Dimension): void {
		// Layout logic can be added here if needed
	}
}

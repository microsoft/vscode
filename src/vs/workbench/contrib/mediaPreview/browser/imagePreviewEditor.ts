/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/imagePreviewEditor.css';
import { $, append, Dimension } from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { getMediaMime } from '../../../../base/common/mime.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { localize } from '../../../../nls.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { FileChangesEvent, FileChangeType, IFileContent, IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorMemento, IEditorOpenContext } from '../../../common/editor.js';
import { IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { isGitLfsPointer } from '../common/mediaPreview.js';
import { IImageViewerEditorPane, IImageViewerViewState, ImageViewer } from './imageViewer.js';
import { ImagePreviewEditorInput } from './imagePreviewEditorInput.js';
import { reopenInTextEditor } from './mediaPreviewErrors.js';

function isImageViewerViewState(value: unknown): value is IImageViewerViewState {
	const candidate = value as IImageViewerViewState | undefined;
	return !!candidate
		&& (candidate.scale === 'fit' || typeof candidate.scale === 'number')
		&& typeof candidate.scrollLeft === 'number'
		&& typeof candidate.scrollTop === 'number';
}

/**
 * Editor pane that previews image files.
 */
export class ImagePreviewEditor extends EditorPane implements IImageViewerEditorPane {

	static readonly ID = 'workbench.editor.imagePreview';

	private _container: HTMLElement | undefined;
	private _viewer: ImageViewer | undefined;
	private _message: { readonly label: HTMLElement; readonly button: Button } | undefined;
	private _hasMessage = false;
	private _fileSize: number | undefined;
	private _loadId = 0;

	private readonly _objectUrl = this._register(new MutableDisposable());
	private readonly _inputDisposables = this._register(new DisposableStore());
	private readonly _viewStateMemento: IEditorMemento<IImageViewerViewState>;

	private readonly _onDidChangeImageInfo = this._register(new Emitter<void>());
	/**
	 * Fires when the zoom, dimensions or file size of the shown image change.
	 */
	readonly onDidChangeImageInfo = this._onDidChangeImageInfo.event;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IFileService private readonly _fileService: IFileService,
		@IEditorService private readonly _editorService: IEditorService,
		@IEditorGroupsService editorGroupsService: IEditorGroupsService,
		@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService,
	) {
		super(ImagePreviewEditor.ID, group, telemetryService, themeService, storageService);

		this._viewStateMemento = this.getEditorMemento<IImageViewerViewState>(editorGroupsService, textResourceConfigurationService, 'imagePreviewViewState');
	}

	get imageViewer(): ImageViewer | undefined {
		return this._viewer;
	}

	/**
	 * Size of the image file in bytes.
	 */
	get fileSize(): number | undefined {
		return this._fileSize;
	}

	protected override createEditor(parent: HTMLElement): void {
		this._container = $('.image-preview-editor');
		parent.appendChild(this._container);

		const viewer = this._viewer = this._register(this._instantiationService.createInstance(ImageViewer, {}));
		viewer.element.tabIndex = 0;
		viewer.element.setAttribute('role', 'img');
		this._container.appendChild(viewer.element);

		this._register(viewer.onDidChangeScale(() => this._onDidChangeImageInfo.fire()));

		// Shown instead of the image when it can't be previewed. It is part of the pane rather
		// than an editor error, so the other side of a diff stays visible.
		const message = append(this._container, $('.monaco-editor-pane-placeholder.image-preview-message'));
		const label = append(message, $('.editor-placeholder-label-container'));
		label.id = generateUuid();
		const button = this._register(new Button(append(message, $('.editor-placeholder-buttons-container')), defaultButtonStyles));
		button.label = localize('mediaPreview.openInTextEditor', "Open in Text Editor");
		button.element.setAttribute('aria-describedby', label.id);
		this._register(button.onDidClick(() => {
			if (this.input) {
				void reopenInTextEditor(this.input, this._editorService);
			}
		}));
		this._message = { label, button };
	}

	override async setInput(input: ImagePreviewEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		this._saveViewState();
		this._inputDisposables.clear();
		this._setMessage(undefined);

		await super.setInput(input, options, context, token);
		if (token.isCancellationRequested) {
			return;
		}

		this._viewer?.element.setAttribute('aria-label', localize('imagePreview.ariaLabel', "Image Preview: {0}", input.getName()));

		const viewState = isImageViewerViewState(options?.viewState) ? options.viewState : this._viewStateMemento.loadEditorState(this.group, input);

		// Watch before loading so changes made while the image loads aren't missed. A reload
		// supersedes a load that is still in progress.
		const reloadScheduler = this._inputDisposables.add(new RunOnceScheduler(() => this._reloadImage(input, viewState), 100));
		const onDidFilesChange = (e: FileChangesEvent) => {
			if (e.contains(input.resource, FileChangeType.UPDATED, FileChangeType.ADDED)) {
				reloadScheduler.schedule();
			}
		};
		const watcher = this._inputDisposables.add(this._fileService.createWatcher(input.resource, { recursive: false, excludes: [] }));
		this._inputDisposables.add(watcher.onDidChange(onDidFilesChange));
		// File systems contributed by extensions only report uncorrelated changes
		this._inputDisposables.add(this._fileService.onDidFilesChange(onDidFilesChange));

		await this._loadImage(input, viewState, token);
	}

	override clearInput(): void {
		this._saveViewState();
		this._inputDisposables.clear();
		this._loadId++;
		this._viewer?.clear();
		this._setMessage(undefined);
		this._objectUrl.clear();
		this._fileSize = undefined;
		this._onDidChangeImageInfo.fire();

		super.clearInput();
	}

	override getViewState(): IImageViewerViewState | undefined {
		return this._viewer?.hasImage ? this._viewer.getViewState() : undefined;
	}

	override focus(): void {
		super.focus();
		if (this._hasMessage) {
			this._message?.button.focus();
		} else {
			this._viewer?.element.focus();
		}
	}

	override layout(dimension: Dimension): void {
		if (this._container) {
			this._container.style.width = `${dimension.width}px`;
			this._container.style.height = `${dimension.height}px`;
		}
	}

	protected override saveState(): void {
		this._saveViewState();
		super.saveState();
	}

	private _saveViewState(): void {
		const viewState = this.getViewState();
		if (this.input instanceof ImagePreviewEditorInput && viewState) {
			this._viewStateMemento.saveEditorState(this.group, this.input, viewState);
		}
	}

	private async _loadImage(input: ImagePreviewEditorInput, viewState: IImageViewerViewState | undefined, token: CancellationToken): Promise<void> {
		// Claim the load before any async work so that older loads and reloads can't win
		const loadId = ++this._loadId;

		if (await isGitLfsPointer(this._fileService, input.resource)) {
			if (this._isCurrentLoad(loadId, input) && !token.isCancellationRequested) {
				this._viewer?.clear();
				this._objectUrl.clear();
				this._fileSize = undefined;
				this._setMessage(localize('imagePreview.gitLfs', "The image is stored with Git LFS and is not available for preview."));
				this._onDidChangeImageInfo.fire();
			}
			return;
		}

		const content = await this._fileService.readFile(input.resource, undefined, token);
		if (token.isCancellationRequested) {
			return;
		}

		await this._showImage(loadId, input, content, viewState);
	}

	/**
	 * @param initialViewState View state to apply if the image wasn't shown yet.
	 */
	private async _reloadImage(input: ImagePreviewEditorInput, initialViewState: IImageViewerViewState | undefined): Promise<void> {
		const viewer = this._viewer;
		if (!viewer || this.input !== input) {
			return;
		}

		const loadId = ++this._loadId;
		const viewState = viewer.hasImage ? viewer.getViewState() : initialViewState;

		let content: IFileContent;
		try {
			content = await this._fileService.readFile(input.resource);
		} catch {
			// Keep showing the previous image, e.g. when the file is in the middle of being written
			return;
		}

		await this._showImage(loadId, input, content, viewState);
	}

	private _isCurrentLoad(loadId: number, input: ImagePreviewEditorInput): boolean {
		return loadId === this._loadId && this.input === input;
	}

	/**
	 * Shows the image if the load is still current, or an error message if it can't be decoded.
	 */
	private async _showImage(loadId: number, input: ImagePreviewEditorInput, content: IFileContent, viewState: IImageViewerViewState | undefined): Promise<void> {
		const viewer = this._viewer;
		if (!viewer || !this._isCurrentLoad(loadId, input)) {
			return;
		}

		const mimeType = getMediaMime(input.resource.path) ?? '';
		const blob = new Blob([content.value.buffer as Uint8Array<ArrayBuffer>], { type: mimeType });
		const url = URL.createObjectURL(blob);
		const loaded = await viewer.setSource(url, {
			alt: input.getName(),
			viewState,
			// Copy the displayed image, even if the file changed since it was loaded
			data: { mimeType, read: async () => new Uint8Array(await blob.arrayBuffer()) },
		});
		if (!this._isCurrentLoad(loadId, input)) {
			URL.revokeObjectURL(url);
			return;
		}

		// The previous URL is revoked only now that the new image replaced it
		this._objectUrl.value = toDisposable(() => URL.revokeObjectURL(url));
		this._fileSize = content.size;
		this._setMessage(loaded ? undefined : localize('imagePreview.loadError', "An error occurred while loading the image."));
		this._onDidChangeImageInfo.fire();
	}

	/**
	 * Shows `message` instead of the image, or shows the image again if `message` is `undefined`.
	 */
	private _setMessage(message: string | undefined): void {
		this._hasMessage = message !== undefined;
		this._container?.classList.toggle('has-message', this._hasMessage);
		if (this._message) {
			this._message.label.textContent = message ?? '';
		}
	}
}

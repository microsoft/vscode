/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Event, Emitter } from 'vs/base/common/event';
import { EditorInput, EditorOptions } from 'vs/workbench/common/editor';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { BinaryEditorModel } from 'vs/workbench/common/editor/binaryEditorModel';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ResourceViewerContext, ResourceViewer } from 'vs/workbench/browser/parts/editor/resourceViewer';
import { URI } from 'vs/base/common/uri';
import { Dimension, size, clearNode } from 'vs/base/browser/dom';
import { IFileService } from 'vs/platform/files/common/files';
import { CancellationToken } from 'vs/base/common/cancellation';
import { dispose } from 'vs/base/common/lifecycle';
import { IStorageService } from 'vs/platform/storage/common/storage';

export interface IOpenCallbacks {
	openInternal: (input: EditorInput, options: EditorOptions) => Promise<void>;
	openExternal: (uri: URI) => void;
}

/*
 * This class is only intended to be subclassed and not instantiated.
 */
export abstract class BaseBinaryResourceEditor extends BaseEditor {

	private readonly _onMetadataChanged: Emitter<void> = this._register(new Emitter<void>());
	get onMetadataChanged(): Event<void> { return this._onMetadataChanged.event; }

	private readonly _onDidOpenInPlace: Emitter<void> = this._register(new Emitter<void>());
	get onDidOpenInPlace(): Event<void> { return this._onDidOpenInPlace.event; }

	private callbacks: IOpenCallbacks;
	private metadata: string | null;
	private binaryContainer: HTMLElement;
	private scrollbar: DomScrollableElement;
	private resourceViewerContext: ResourceViewerContext;

	constructor(
		id: string,
		callbacks: IOpenCallbacks,
		telemetryService: ITelemetryService,
		themeService: IThemeService,
		@IFileService private readonly _fileService: IFileService,
		@IStorageService storageService: IStorageService
	) {
		super(id, telemetryService, themeService, storageService);

		this.callbacks = callbacks;
	}

	getTitle() {
		return this.input ? this.input.getName() : nls.localize('binaryEditor', "Binary Viewer");
	}

	protected createEditor(parent: HTMLElement): void {

		// Container for Binary
		this.binaryContainer = document.createElement('div');
		this.binaryContainer.className = 'binary-container';
		this.binaryContainer.style.outline = 'none';
		this.binaryContainer.tabIndex = 0; // enable focus support from the editor part (do not remove)

		// Custom Scrollbars
		this.scrollbar = this._register(new DomScrollableElement(this.binaryContainer, { horizontal: ScrollbarVisibility.Auto, vertical: ScrollbarVisibility.Auto }));
		parent.appendChild(this.scrollbar.getDomNode());
	}

	setInput(input: EditorInput, options: EditorOptions, token: CancellationToken): Promise<void> {
		return super.setInput(input, options, token).then(() => {
			return input.resolve().then(model => {

				// Check for cancellation
				if (token.isCancellationRequested) {
					return undefined;
				}

				// Assert Model instance
				if (!(model instanceof BinaryEditorModel)) {
					return Promise.reject(new Error('Unable to open file as binary'));
				}

				// Render Input
				this.resourceViewerContext = ResourceViewer.show(
					{ name: model.getName(), resource: model.getResource(), size: model.getSize(), etag: model.getETag(), mime: model.getMime() },
					this._fileService,
					this.binaryContainer,
					this.scrollbar,
					resource => this.handleOpenInternalCallback(input, options),
					resource => this.callbacks.openExternal(resource),
					meta => this.handleMetadataChanged(meta)
				);

				return undefined;
			});
		});
	}

	private handleOpenInternalCallback(input: EditorInput, options: EditorOptions) {
		this.callbacks.openInternal(input, options).then(() => {

			// Signal to listeners that the binary editor has been opened in-place
			this._onDidOpenInPlace.fire();
		});
	}

	private handleMetadataChanged(meta: string | null): void {
		this.metadata = meta;

		this._onMetadataChanged.fire();
	}

	getMetadata() {
		return this.metadata;
	}

	clearInput(): void {

		// Clear Meta
		this.handleMetadataChanged(null);

		// Clear Resource Viewer
		clearNode(this.binaryContainer);
		this.resourceViewerContext = dispose(this.resourceViewerContext);

		super.clearInput();
	}

	layout(dimension: Dimension): void {

		// Pass on to Binary Container
		size(this.binaryContainer, dimension.width, dimension.height);
		this.scrollbar.scanDomNode();
		if (this.resourceViewerContext && this.resourceViewerContext.layout) {
			this.resourceViewerContext.layout(dimension);
		}
	}

	focus(): void {
		this.binaryContainer.focus();
	}

	dispose(): void {
		this.binaryContainer.remove();

		this.resourceViewerContext = dispose(this.resourceViewerContext);

		super.dispose();
	}
}

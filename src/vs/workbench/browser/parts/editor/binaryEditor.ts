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
import { CancellationToken } from 'vs/base/common/cancellation';
import { dispose } from 'vs/base/common/lifecycle';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

export interface IOpenCallbacks {
	openInternal: (input: EditorInput, options: EditorOptions) => Promise<void>;
	openExternal: (uri: URI) => void;
}

/*
 * This class is only intended to be subclassed and not instantiated.
 */
export abstract class BaseBinaryResourceEditor extends BaseEditor {

	private readonly _onMetadataChanged: Emitter<void> = this._register(new Emitter<void>());
	readonly onMetadataChanged: Event<void> = this._onMetadataChanged.event;

	private readonly _onDidOpenInPlace: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidOpenInPlace: Event<void> = this._onDidOpenInPlace.event;

	private callbacks: IOpenCallbacks;
	private metadata: string | undefined;
	private binaryContainer: HTMLElement;
	private scrollbar: DomScrollableElement;
	private resourceViewerContext: ResourceViewerContext | undefined;

	constructor(
		id: string,
		callbacks: IOpenCallbacks,
		telemetryService: ITelemetryService,
		themeService: IThemeService,
		@IFileService private readonly fileService: IFileService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
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

	async setInput(input: EditorInput, options: EditorOptions, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, token);
		const model = await input.resolve();

		// Check for cancellation
		if (token.isCancellationRequested) {
			return;
		}

		// Assert Model instance
		if (!(model instanceof BinaryEditorModel)) {
			throw new Error('Unable to open file as binary');
		}

		// Render Input
		if (this.resourceViewerContext) {
			this.resourceViewerContext.dispose();
		}

		this.resourceViewerContext = ResourceViewer.show({ name: model.getName(), resource: model.getResource(), size: model.getSize(), etag: model.getETag(), mime: model.getMime() }, this.fileService, this.binaryContainer, this.scrollbar, {
			openInternalClb: () => this.handleOpenInternalCallback(input, options),
			openExternalClb: this.environmentService.configuration.remoteAuthority ? undefined : resource => this.callbacks.openExternal(resource),
			metadataClb: meta => this.handleMetadataChanged(meta)
		}, this.instantiationService);
	}

	private async handleOpenInternalCallback(input: EditorInput, options: EditorOptions): Promise<void> {
		await this.callbacks.openInternal(input, options);

		// Signal to listeners that the binary editor has been opened in-place
		this._onDidOpenInPlace.fire();
	}

	private handleMetadataChanged(meta: string | undefined): void {
		this.metadata = meta;

		this._onMetadataChanged.fire();
	}

	getMetadata(): string | undefined {
		return this.metadata;
	}

	clearInput(): void {

		// Clear Meta
		this.handleMetadataChanged(undefined);

		// Clear Resource Viewer
		clearNode(this.binaryContainer);
		dispose(this.resourceViewerContext);
		this.resourceViewerContext = undefined;

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

		dispose(this.resourceViewerContext);
		this.resourceViewerContext = undefined;

		super.dispose();
	}
}

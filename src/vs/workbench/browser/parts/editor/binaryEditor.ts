/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vs/nls';
import { Event, Emitter } from 'vs/base/common/event';
import { TPromise } from 'vs/base/common/winjs.base';
import { Builder, $ } from 'vs/base/browser/builder';
import { EditorInput, EditorOptions } from 'vs/workbench/common/editor';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { BinaryEditorModel } from 'vs/workbench/common/editor/binaryEditorModel';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ResourceViewerContext, ResourceViewer } from 'vs/workbench/browser/parts/editor/resourceViewer';
import URI from 'vs/base/common/uri';
import { Dimension } from 'vs/base/browser/dom';

export interface IOpenCallbacks {
	openInternal: (input: EditorInput, options: EditorOptions) => void;
	openExternal: (uri: URI) => void;
}

/*
 * This class is only intended to be subclassed and not instantiated.
 */
export abstract class BaseBinaryResourceEditor extends BaseEditor {

	private readonly _onMetadataChanged: Emitter<void>;

	private callbacks: IOpenCallbacks;
	private metadata: string;
	private binaryContainer: Builder;
	private scrollbar: DomScrollableElement;
	private resourceViewerContext: ResourceViewerContext;

	constructor(
		id: string,
		callbacks: IOpenCallbacks,
		telemetryService: ITelemetryService,
		themeService: IThemeService
	) {
		super(id, telemetryService, themeService);

		this._onMetadataChanged = new Emitter<void>();
		this.toUnbind.push(this._onMetadataChanged);

		this.callbacks = callbacks;
	}

	public get onMetadataChanged(): Event<void> {
		return this._onMetadataChanged.event;
	}

	public getTitle(): string {
		return this.input ? this.input.getName() : nls.localize('binaryEditor', "Binary Viewer");
	}

	protected createEditor(parent: HTMLElement): void {

		// Container for Binary
		const binaryContainerElement = document.createElement('div');
		binaryContainerElement.className = 'binary-container';
		this.binaryContainer = $(binaryContainerElement);
		this.binaryContainer.style('outline', 'none');
		this.binaryContainer.tabindex(0); // enable focus support from the editor part (do not remove)

		// Custom Scrollbars
		this.scrollbar = new DomScrollableElement(binaryContainerElement, { horizontal: ScrollbarVisibility.Auto, vertical: ScrollbarVisibility.Auto });
		parent.appendChild(this.scrollbar.getDomNode());
	}

	public setInput(input: EditorInput, options?: EditorOptions): TPromise<void> {

		// Return early for same input unless we force to open
		const forceOpen = options && options.forceOpen;
		if (!forceOpen && input.matches(this.input)) {
			return TPromise.wrap<void>(null);
		}

		// Otherwise set input and resolve
		return super.setInput(input, options).then(() => {
			return input.resolve(true).then(model => {

				// Assert Model instance
				if (!(model instanceof BinaryEditorModel)) {
					return TPromise.wrapError<void>(new Error('Unable to open file as binary'));
				}

				// Assert that the current input is still the one we expect. This prevents a race condition when loading takes long and another input was set meanwhile
				if (!this.input || this.input !== input) {
					return null;
				}

				// Render Input
				this.resourceViewerContext = ResourceViewer.show(
					{ name: model.getName(), resource: model.getResource(), size: model.getSize(), etag: model.getETag(), mime: model.getMime() },
					this.binaryContainer.getHTMLElement(),
					this.scrollbar,
					resource => this.callbacks.openInternal(input, options),
					resource => this.callbacks.openExternal(resource),
					meta => this.handleMetadataChanged(meta)
				);

				return TPromise.as<void>(null);
			});
		});
	}

	private handleMetadataChanged(meta: string): void {
		this.metadata = meta;
		this._onMetadataChanged.fire();
	}

	public getMetadata(): string {
		return this.metadata;
	}

	public clearInput(): void {

		// Clear Meta
		this.handleMetadataChanged(null);

		// Empty HTML Container
		$(this.binaryContainer).empty();

		super.clearInput();
	}

	public layout(dimension: Dimension): void {

		// Pass on to Binary Container
		this.binaryContainer.size(dimension.width, dimension.height);
		this.scrollbar.scanDomNode();
		if (this.resourceViewerContext) {
			this.resourceViewerContext.layout(dimension);
		}
	}

	public focus(): void {
		this.binaryContainer.domFocus();
	}

	public dispose(): void {

		// Destroy Container
		this.binaryContainer.destroy();
		this.scrollbar.dispose();

		super.dispose();
	}
}

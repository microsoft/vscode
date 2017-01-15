/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import Event, { Emitter } from 'vs/base/common/event';
import { TPromise } from 'vs/base/common/winjs.base';
import { Dimension, Builder, $ } from 'vs/base/browser/builder';
import { ResourceViewer } from 'vs/base/browser/ui/resourceviewer/resourceViewer';
import { EditorModel, EditorInput, EditorOptions } from 'vs/workbench/common/editor';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { BinaryEditorModel } from 'vs/workbench/common/editor/binaryEditorModel';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';

/*
 * This class is only intended to be subclassed and not instantiated.
 */
export abstract class BaseBinaryResourceEditor extends BaseEditor {
	private _onMetadataChanged: Emitter<void>;
	private metadata: string;

	private binaryContainer: Builder;
	private scrollbar: DomScrollableElement;

	constructor(
		id: string,
		telemetryService: ITelemetryService
	) {
		super(id, telemetryService);

		this._onMetadataChanged = new Emitter<void>();
	}

	public get onMetadataChanged(): Event<void> {
		return this._onMetadataChanged.event;
	}

	public getTitle(): string {
		return this.input ? this.input.getName() : nls.localize('binaryEditor', "Binary Viewer");
	}

	protected createEditor(parent: Builder): void {

		// Container for Binary
		const binaryContainerElement = document.createElement('div');
		binaryContainerElement.className = 'binary-container';
		this.binaryContainer = $(binaryContainerElement);
		this.binaryContainer.tabindex(0); // enable focus support from the editor part (do not remove)

		// Custom Scrollbars
		this.scrollbar = new DomScrollableElement(binaryContainerElement, { canUseTranslate3d: false, horizontal: ScrollbarVisibility.Auto, vertical: ScrollbarVisibility.Auto });
		parent.getHTMLElement().appendChild(this.scrollbar.getDomNode());
	}

	public setInput(input: EditorInput, options?: EditorOptions): TPromise<void> {
		const oldInput = this.input;
		super.setInput(input, options);

		// Detect options
		const forceOpen = options && options.forceOpen;

		// Same Input
		if (!forceOpen && input.matches(oldInput)) {
			return TPromise.as<void>(null);
		}

		// Different Input (Reload)
		return input.resolve(true).then((resolvedModel: EditorModel) => {

			// Assert Model instance
			if (!(resolvedModel instanceof BinaryEditorModel)) {
				return TPromise.wrapError<void>('Invalid editor input. Binary resource editor requires a model instance of BinaryEditorModel.');
			}

			// Assert that the current input is still the one we expect. This prevents a race condition when loading takes long and another input was set meanwhile
			if (!this.input || this.input !== input) {
				return null;
			}

			// Render Input
			const model = <BinaryEditorModel>resolvedModel;
			ResourceViewer.show({ name: model.getName(), resource: model.getResource(), size: model.getSize(), etag: model.getETag() }, this.binaryContainer, this.scrollbar, (meta) => this.handleMetadataChanged(meta));

			return TPromise.as<void>(null);
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
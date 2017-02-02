/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/binarydiffeditor';
import Event, { Emitter } from 'vs/base/common/event';
import { TPromise } from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import URI from 'vs/base/common/uri';
import { Sash, ISashEvent, IVerticalSashLayoutProvider } from 'vs/base/browser/ui/sash/sash';
import { Dimension, Builder, $ } from 'vs/base/browser/builder';
import { ResourceViewer } from 'vs/base/browser/ui/resourceviewer/resourceViewer';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { EditorInput, EditorOptions, BINARY_DIFF_EDITOR_ID } from 'vs/workbench/common/editor';
import { BinaryEditorModel } from 'vs/workbench/common/editor/binaryEditorModel';
import { DiffEditorModel } from 'vs/workbench/common/editor/diffEditorModel';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';

/**
 * An implementation of editor for diffing binary files like images or videos.
 */
export class BinaryResourceDiffEditor extends BaseEditor implements IVerticalSashLayoutProvider {

	public static ID = BINARY_DIFF_EDITOR_ID;

	private static MIN_CONTAINER_WIDTH = 100;

	private _onMetadataChanged: Emitter<void>;
	private originalMetadata: string;
	private modifiedMetadata: string;

	private leftBinaryContainer: Builder;
	private leftScrollbar: DomScrollableElement;
	private rightBinaryContainer: Builder;
	private rightScrollbar: DomScrollableElement;
	private sash: Sash;
	private dimension: Dimension;
	private leftContainerWidth: number;
	private startLeftContainerWidth: number;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService
	) {
		super(BinaryResourceDiffEditor.ID, telemetryService);

		this._onMetadataChanged = new Emitter<void>();
	}

	public get onMetadataChanged(): Event<void> {
		return this._onMetadataChanged.event;
	}

	public getTitle(): string {
		return this.input ? this.input.getName() : nls.localize('binaryDiffEditor', "Binary Diff Viewer");
	}

	protected createEditor(parent: Builder): void {

		// Left Container for Binary
		const leftBinaryContainerElement = document.createElement('div');
		leftBinaryContainerElement.className = 'binary-container';
		this.leftBinaryContainer = $(leftBinaryContainerElement);
		this.leftBinaryContainer.tabindex(0); // enable focus support from the editor part (do not remove)

		// Left Custom Scrollbars
		this.leftScrollbar = new DomScrollableElement(leftBinaryContainerElement, { canUseTranslate3d: false, horizontal: ScrollbarVisibility.Auto, vertical: ScrollbarVisibility.Auto });
		parent.getHTMLElement().appendChild(this.leftScrollbar.getDomNode());
		$(this.leftScrollbar.getDomNode()).addClass('binarydiff-left');

		// Sash
		this.sash = new Sash(parent.getHTMLElement(), this);
		this.sash.addListener2('start', () => this.onSashDragStart());
		this.sash.addListener2('change', (e: ISashEvent) => this.onSashDrag(e));
		this.sash.addListener2('end', () => this.onSashDragEnd());
		this.sash.addListener2('reset', () => this.onSashReset());

		// Right Container for Binary
		const rightBinaryContainerElement = document.createElement('div');
		rightBinaryContainerElement.className = 'binary-container';
		this.rightBinaryContainer = $(rightBinaryContainerElement);
		this.rightBinaryContainer.tabindex(0); // enable focus support from the editor part (do not remove)

		// Right Custom Scrollbars
		this.rightScrollbar = new DomScrollableElement(rightBinaryContainerElement, { canUseTranslate3d: false, horizontal: ScrollbarVisibility.Auto, vertical: ScrollbarVisibility.Auto });
		parent.getHTMLElement().appendChild(this.rightScrollbar.getDomNode());
		$(this.rightScrollbar.getDomNode()).addClass('binarydiff-right');
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
		return input.resolve(true).then((resolvedModel: DiffEditorModel) => {

			// Assert model instance
			if (!(resolvedModel.originalModel instanceof BinaryEditorModel) || !(resolvedModel.modifiedModel instanceof BinaryEditorModel)) {
				return TPromise.wrapError<void>(nls.localize('cannotDiffTextToBinary', "Comparing binary files to non binary files is currently not supported"));
			}

			// Assert that the current input is still the one we expect. This prevents a race condition when loading a diff takes long and another input was set meanwhile
			if (!this.input || this.input !== input) {
				return null;
			}

			// Render original
			const original = <BinaryEditorModel>resolvedModel.originalModel;
			this.renderInput(original.getName(), original.getResource(), original.getSize(), original.getETag(), true);

			// Render modified
			const modified = <BinaryEditorModel>resolvedModel.modifiedModel;
			this.renderInput(modified.getName(), modified.getResource(), modified.getSize(), modified.getETag(), false);
			return undefined;
		});
	}

	private renderInput(name: string, resource: URI, size: number, etag: string, isOriginal: boolean): void {

		// Reset Sash to default 50/50 ratio if needed
		if (this.leftContainerWidth && this.dimension && this.leftContainerWidth !== this.dimension.width / 2) {
			this.leftContainerWidth = this.dimension.width / 2;
			this.layoutContainers();
			this.sash.layout();
		}

		// Pass to ResourceViewer
		const container = isOriginal ? this.leftBinaryContainer : this.rightBinaryContainer;
		const scrollbar = isOriginal ? this.leftScrollbar : this.rightScrollbar;

		ResourceViewer.show({ name, resource, size, etag }, container, scrollbar, (meta) => this.handleMetadataChanged(meta, isOriginal));
	}

	private handleMetadataChanged(meta: string, isOriginal: boolean): void {
		if (isOriginal) {
			this.originalMetadata = meta;
		} else {
			this.modifiedMetadata = meta;
		}

		this._onMetadataChanged.fire();
	}

	public getMetadata(): string {
		return nls.localize('metadataDiff', "{0} ↔ {1}", this.originalMetadata, this.modifiedMetadata);
	}

	public clearInput(): void {

		// Clear Meta
		this.handleMetadataChanged(null, true);
		this.handleMetadataChanged(null, false);

		// Empty HTML Container
		$(this.leftBinaryContainer).empty();
		$(this.rightBinaryContainer).empty();

		super.clearInput();
	}

	public layout(dimension: Dimension): void {
		const oldDimension = this.dimension;
		this.dimension = dimension;

		// Calculate left hand container width based on sash move or fallback to 50% by default
		if (!this.leftContainerWidth || !oldDimension) {
			this.leftContainerWidth = this.dimension.width / 2;
		} else {
			const sashRatio = this.leftContainerWidth / oldDimension.width;
			this.leftContainerWidth = this.dimension.width * sashRatio;
		}

		// Sash positioning
		this.sash.layout();

		// Pass on to Binary Containers and Scrollbars
		this.layoutContainers();
	}

	private layoutContainers(): void {

		// Size left container
		this.leftBinaryContainer.size(this.leftContainerWidth, this.dimension.height);
		this.leftScrollbar.scanDomNode();

		// Size right container
		this.rightBinaryContainer.size(this.dimension.width - this.leftContainerWidth, this.dimension.height);
		this.rightScrollbar.scanDomNode();
	}

	private onSashDragStart(): void {
		this.startLeftContainerWidth = this.leftContainerWidth;
	}

	private onSashDrag(e: ISashEvent): void {

		// Update Widths and keep in bounds of MIN_CONTAINER_WIDTH for both sides
		const newLeftContainerWidth = this.startLeftContainerWidth + e.currentX - e.startX;
		this.leftContainerWidth = Math.max(BinaryResourceDiffEditor.MIN_CONTAINER_WIDTH, newLeftContainerWidth);
		if (this.dimension.width - this.leftContainerWidth < BinaryResourceDiffEditor.MIN_CONTAINER_WIDTH) {
			this.leftContainerWidth = this.dimension.width - BinaryResourceDiffEditor.MIN_CONTAINER_WIDTH;
		}

		// Pass on to Binary Containers and Scrollbars
		this.layoutContainers();
	}

	private onSashDragEnd(): void {
		this.sash.layout();
	}

	private onSashReset(): void {
		this.leftContainerWidth = this.dimension.width / 2;
		this.layoutContainers();
		this.sash.layout();
	}

	public getVerticalSashTop(sash: Sash): number {
		return 0;
	}

	public getVerticalSashLeft(sash: Sash): number {
		return this.leftContainerWidth;
	}

	public getVerticalSashHeight(sash: Sash): number {
		return this.dimension.height;
	}

	public focus(): void {
		this.rightBinaryContainer.domFocus();
	}

	public dispose(): void {

		// Sash
		this.sash.dispose();

		// Dispose Scrollbar
		this.leftScrollbar.dispose();
		this.rightScrollbar.dispose();

		// Destroy Container
		this.leftBinaryContainer.destroy();
		this.rightBinaryContainer.destroy();

		super.dispose();
	}
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/binaryeditor';
import nls = require('vs/nls');
import {TPromise} from 'vs/base/common/winjs.base';
import {Dimension, Builder, $} from 'vs/base/browser/builder';
import {ResourceViewer} from 'vs/base/browser/ui/resourceviewer/resourceViewer';
import {EditorModel, EditorInput, EditorOptions} from 'vs/workbench/common/editor';
import {BaseEditor} from 'vs/workbench/browser/parts/editor/baseEditor';
import {BinaryEditorModel} from 'vs/workbench/common/editor/binaryEditorModel';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';

/*
 * This class is only intended to be subclassed and not instantiated.
 */
export abstract class BaseBinaryResourceEditor extends BaseEditor {
	private binaryContainer: Builder;

	constructor(id: string, telemetryService: ITelemetryService, private _editorService: IWorkbenchEditorService) {
		super(id, telemetryService);
	}

	public getTitle(): string {
		return this.getInput() ? this.getInput().getName() : nls.localize('binaryEditor', "Binary Viewer");
	}

	public get editorService() {
		return this._editorService;
	}

	public createEditor(parent: Builder): void {

		// Container for Binary
		let binaryContainerElement = document.createElement('div');
		binaryContainerElement.className = 'binary-container monaco-editor-background'; // Inherit the background color from selected theme'
		this.binaryContainer = $(binaryContainerElement);
		this.binaryContainer.tabindex(0); // enable focus support from the editor part (do not remove)
		parent.getHTMLElement().appendChild(this.binaryContainer.getHTMLElement());
	}

	public setInput(input: EditorInput, options: EditorOptions): TPromise<void> {
		let oldInput = this.getInput();
		super.setInput(input, options);

		// Detect options
		let forceOpen = options && options.forceOpen;

		// Same Input
		if (!forceOpen && input.matches(oldInput)) {
			return TPromise.as<void>(null);
		}

		// Different Input (Reload)
		return this._editorService.resolveEditorModel(input, true /* Reload */).then((resolvedModel: EditorModel) => {

			// Assert Model instance
			if (!(resolvedModel instanceof BinaryEditorModel)) {
				return TPromise.wrapError<void>('Invalid editor input. Binary resource editor requires a model instance of BinaryEditorModel.');
			}

			// Assert that the current input is still the one we expect. This prevents a race condition when loading takes long and another input was set meanwhile
			if (!this.getInput() || this.getInput() !== input) {
				return null;
			}

			// Render Input
			let binaryResourceModel = <BinaryEditorModel>resolvedModel;
			ResourceViewer.show(binaryResourceModel.getName(), binaryResourceModel.getResource(), this.binaryContainer);

			return TPromise.as<void>(null);
		});
	}

	public clearInput(): void {

		// Empty HTML Container
		$(this.binaryContainer).empty();

		super.clearInput();
	}

	public layout(dimension: Dimension): void {

		// Pass on to Binary Container
		this.binaryContainer.size(dimension.width, dimension.height);
	}

	public focus(): void {
		this.binaryContainer.domFocus();
	}

	public dispose(): void {

		// Destroy Container
		this.binaryContainer.destroy();

		super.dispose();
	}
}

/**
 * An implementation of editor for binary files like images or videos.
 */
export class BinaryResourceEditor extends BaseBinaryResourceEditor {

	public static ID = 'workbench.editors.binaryResourceEditor';

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService
	) {
		super(BinaryResourceEditor.ID, telemetryService, editorService);
	}
}
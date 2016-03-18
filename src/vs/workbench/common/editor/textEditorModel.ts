/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {EndOfLinePreference, IModel, EventType} from 'vs/editor/common/editorCommon';
import {IMode} from 'vs/editor/common/modes';
import {EditorModel} from 'vs/workbench/common/editor';
import URI from 'vs/base/common/uri';
import {ITextEditorModel} from 'vs/platform/editor/common/editor';
import {IModeService} from 'vs/editor/common/services/modeService';
import {IModelService} from 'vs/editor/common/services/modelService';
import {RawText} from 'vs/editor/common/model/textModel';

/**
 * The base text editor model leverages the monaco code editor model. This class is only intended to be subclassed and not instantiated.
 */
export abstract class BaseTextEditorModel extends EditorModel implements ITextEditorModel {
	private textEditorModelHandle: URI;
	private createdEditorModel: boolean;

	constructor(
		@IModelService private modelService: IModelService,
		@IModeService private modeService: IModeService,
		textEditorModelHandle?: URI
	) {
		super();

		this.textEditorModelHandle = textEditorModelHandle;

		if (textEditorModelHandle) {

			// We need the resource to point to an existing model
			let model = modelService.getModel(textEditorModelHandle);
			if (!model) {
				throw new Error(`Document with resource ${textEditorModelHandle.toString()} does not exist`);
			}

			// Since we did not create the model, we need to listen to it disposing
			// and properly trigger our dispose function so that events get emitted
			const unbind = model.addListener(EventType.ModelDispose, () => {
				this.textEditorModelHandle = null; // make sure we do not dispose code editor model again
				unbind();
				this.dispose();
			});
		}
	}

	public get textEditorModel(): IModel {
		return this.textEditorModelHandle ? this.modelService.getModel(this.textEditorModelHandle) : null;
	}

	/**
	 * Creates the text editor model with the provided value, mime (can be comma separated for multiple values) and optional resource URL.
	 */
	protected createTextEditorModel(value: string, resource?: URI, mime?: string): TPromise<EditorModel> {
		let firstLineText = this.getFirstLineText(value);

		// To avoid flickering, give the mode at most 50ms to load. If the mode doesn't load in 50ms, proceed creating the model with a mode promise
		return TPromise.any<any>([TPromise.timeout(50), this.getOrCreateMode(this.modeService, mime, firstLineText)]).then(() => {
			let model = this.modelService.createModel(value, this.getOrCreateMode(this.modeService, mime, firstLineText), resource);
			this.createdEditorModel = true;

			this.textEditorModelHandle = model.getAssociatedResource();

			return this;
		});
	}

	private getFirstLineText(value: string): string {
		let firstLineText = value.substr(0, 100);

		let crIndex = firstLineText.indexOf('\r');
		if (crIndex < 0) {
			crIndex = firstLineText.length;
		}

		let lfIndex = firstLineText.indexOf('\n');
		if (lfIndex < 0) {
			lfIndex = firstLineText.length;
		}

		firstLineText = firstLineText.substr(0, Math.min(crIndex, lfIndex));

		return firstLineText;
	}

	/**
	 * Gets the mode for the given identifier. Subclasses can override to provide their own implementation of this lookup.
	 *
	 * @param firstLineText optional first line of the text buffer to set the mode on. This can be used to guess a mode from content.
	 */
	protected getOrCreateMode(modeService: IModeService, mime: string, firstLineText?: string): TPromise<IMode> {
		return modeService.getOrCreateMode(mime);
	}

	/**
	 * Updates the text editor model with the provided value. If the value is the same as the model has, this is a no-op.
	 */
	protected updateTextEditorModel(newValue: string): void {
		if (!this.textEditorModel) {
			return;
		}

		let rawText = RawText.fromStringWithModelOptions(newValue, this.textEditorModel);

		// Return early if the text is already set in that form
		if (this.textEditorModel.equals(rawText)) {
			return;
		}

		// Otherwise update model
		this.textEditorModel.setValueFromRawText(rawText);
	}

	/**
	 * Returns the textual value of this editor model or null if it has not yet been created.
	 */
	public getValue(): string {
		let model = this.textEditorModel;
		if (model) {
			return model.getValue(EndOfLinePreference.TextDefined, true /* Preserve BOM */);
		}

		return null;
	}

	public dispose(): void {
		if (this.textEditorModelHandle && this.createdEditorModel) {
			this.modelService.destroyModel(this.textEditorModelHandle);
		}

		this.textEditorModelHandle = null;
		this.createdEditorModel = false;

		super.dispose();
	}

	public isResolved(): boolean {
		return !!this.textEditorModelHandle;
	}
}
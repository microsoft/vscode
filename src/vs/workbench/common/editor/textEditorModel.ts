/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITextModel, ITextBufferFactory } from 'vs/editor/common/model';
import { EditorModel } from 'vs/workbench/common/editor';
import { URI } from 'vs/base/common/uri';
import { ITextEditorModel } from 'vs/editor/common/services/resolverService';
import { IModeService, ILanguageSelection } from 'vs/editor/common/services/modeService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IDisposable } from 'vs/base/common/lifecycle';
import { ITextSnapshot } from 'vs/platform/files/common/files';

/**
 * The base text editor model leverages the code editor model. This class is only intended to be subclassed and not instantiated.
 */
export abstract class BaseTextEditorModel extends EditorModel implements ITextEditorModel {

	protected createdEditorModel: boolean;

	private textEditorModelHandle: URI;
	private modelDisposeListener: IDisposable;

	constructor(
		@IModelService protected modelService: IModelService,
		@IModeService protected modeService: IModeService,
		textEditorModelHandle?: URI
	) {
		super();

		if (textEditorModelHandle) {
			this.handleExistingModel(textEditorModelHandle);
		}
	}

	private handleExistingModel(textEditorModelHandle: URI): void {

		// We need the resource to point to an existing model
		const model = this.modelService.getModel(textEditorModelHandle);
		if (!model) {
			throw new Error(`Document with resource ${textEditorModelHandle.toString()} does not exist`);
		}

		this.textEditorModelHandle = textEditorModelHandle;

		// Make sure we clean up when this model gets disposed
		this.registerModelDisposeListener(model);
	}

	private registerModelDisposeListener(model: ITextModel): void {
		if (this.modelDisposeListener) {
			this.modelDisposeListener.dispose();
		}

		this.modelDisposeListener = model.onWillDispose(() => {
			this.textEditorModelHandle = null; // make sure we do not dispose code editor model again
			this.dispose();
		});
	}

	get textEditorModel(): ITextModel {
		return this.textEditorModelHandle ? this.modelService.getModel(this.textEditorModelHandle) : null;
	}

	abstract isReadonly(): boolean;

	/**
	 * Creates the text editor model with the provided value, modeId (can be comma separated for multiple values) and optional resource URL.
	 */
	protected createTextEditorModel(value: ITextBufferFactory, resource?: URI, modeId?: string): EditorModel {
		const firstLineText = this.getFirstLineText(value);
		const languageSelection = this.getOrCreateMode(this.modeService, modeId, firstLineText);

		return this.doCreateTextEditorModel(value, languageSelection, resource);
	}

	private doCreateTextEditorModel(value: ITextBufferFactory, languageSelection: ILanguageSelection, resource: URI): EditorModel {
		let model = resource && this.modelService.getModel(resource);
		if (!model) {
			model = this.modelService.createModel(value, languageSelection, resource);
			this.createdEditorModel = true;

			// Make sure we clean up when this model gets disposed
			this.registerModelDisposeListener(model);
		} else {
			this.modelService.updateModel(model, value);
			this.modelService.setMode(model, languageSelection);
		}

		this.textEditorModelHandle = model.uri;

		return this;
	}

	protected getFirstLineText(value: ITextBufferFactory | ITextModel): string {

		// text buffer factory
		const textBufferFactory = value as ITextBufferFactory;
		if (typeof textBufferFactory.getFirstLineText === 'function') {
			return textBufferFactory.getFirstLineText(100);
		}

		// text model
		const textSnapshot = value as ITextModel;
		return textSnapshot.getLineContent(1).substr(0, 100);
	}

	/**
	 * Gets the mode for the given identifier. Subclasses can override to provide their own implementation of this lookup.
	 *
	 * @param firstLineText optional first line of the text buffer to set the mode on. This can be used to guess a mode from content.
	 */
	protected getOrCreateMode(modeService: IModeService, modeId: string, firstLineText?: string): ILanguageSelection {
		return modeService.create(modeId);
	}

	/**
	 * Updates the text editor model with the provided value. If the value is the same as the model has, this is a no-op.
	 */
	protected updateTextEditorModel(newValue: ITextBufferFactory): void {
		if (!this.textEditorModel) {
			return;
		}

		this.modelService.updateModel(this.textEditorModel, newValue);
	}

	createSnapshot(): ITextSnapshot {
		const model = this.textEditorModel;
		if (model) {
			return model.createSnapshot(true /* Preserve BOM */);
		}

		return null;
	}

	isResolved(): boolean {
		return !!this.textEditorModelHandle;
	}

	dispose(): void {
		if (this.modelDisposeListener) {
			this.modelDisposeListener.dispose(); // dispose this first because it will trigger another dispose() otherwise
			this.modelDisposeListener = null;
		}

		if (this.textEditorModelHandle && this.createdEditorModel) {
			this.modelService.destroyModel(this.textEditorModelHandle);
		}

		this.textEditorModelHandle = null;
		this.createdEditorModel = false;

		super.dispose();
	}
}

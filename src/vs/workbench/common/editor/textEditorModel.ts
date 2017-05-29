/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { EndOfLinePreference, IModel } from 'vs/editor/common/editorCommon';
import { IMode } from 'vs/editor/common/modes';
import { EditorModel } from 'vs/workbench/common/editor';
import URI from 'vs/base/common/uri';
import { ITextEditorModel } from 'vs/editor/common/services/resolverService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IRawTextSource } from 'vs/editor/common/model/textSource';

/**
 * The base text editor model leverages the code editor model. This class is only intended to be subclassed and not instantiated.
 */
export abstract class BaseTextEditorModel extends EditorModel implements ITextEditorModel {
	private textEditorModelHandle: URI;
	protected createdEditorModel: boolean;
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

	private registerModelDisposeListener(model: IModel): void {
		if (this.modelDisposeListener) {
			this.modelDisposeListener.dispose();
		}

		this.modelDisposeListener = model.onWillDispose(() => {
			this.textEditorModelHandle = null; // make sure we do not dispose code editor model again
			this.dispose();
		});
	}

	public get textEditorModel(): IModel {
		return this.textEditorModelHandle ? this.modelService.getModel(this.textEditorModelHandle) : null;
	}

	/**
	 * Creates the text editor model with the provided value, modeId (can be comma separated for multiple values) and optional resource URL.
	 */
	protected createTextEditorModel(value: string | IRawTextSource, resource?: URI, modeId?: string): TPromise<EditorModel> {
		const firstLineText = this.getFirstLineText(value);
		const mode = this.getOrCreateMode(this.modeService, modeId, firstLineText);

		// To avoid flickering, give the mode at most 50ms to load. If the mode doesn't load in 50ms, proceed creating the model with a mode promise
		return TPromise.any<any>([TPromise.timeout(50), mode]).then(() => {
			return this.doCreateTextEditorModel(value, mode, resource);
		});
	}

	private doCreateTextEditorModel(value: string | IRawTextSource, mode: TPromise<IMode>, resource: URI): EditorModel {
		let model = resource && this.modelService.getModel(resource);
		if (!model) {
			model = this.modelService.createModel(value, mode, resource);
			this.createdEditorModel = true;

			// Make sure we clean up when this model gets disposed
			this.registerModelDisposeListener(model);
		} else {
			this.modelService.updateModel(model, value);
			this.modelService.setMode(model, mode);
		}

		this.textEditorModelHandle = model.uri;

		return this;
	}

	protected getFirstLineText(value: string | IRawTextSource): string {
		if (typeof value === 'string') {
			const firstLineText = value.substr(0, 100);

			let crIndex = firstLineText.indexOf('\r');
			if (crIndex < 0) {
				crIndex = firstLineText.length;
			}

			let lfIndex = firstLineText.indexOf('\n');
			if (lfIndex < 0) {
				lfIndex = firstLineText.length;
			}

			return firstLineText.substr(0, Math.min(crIndex, lfIndex));
		} else {
			return value.lines[0].substr(0, 100);
		}
	}

	/**
	 * Gets the mode for the given identifier. Subclasses can override to provide their own implementation of this lookup.
	 *
	 * @param firstLineText optional first line of the text buffer to set the mode on. This can be used to guess a mode from content.
	 */
	protected getOrCreateMode(modeService: IModeService, modeId: string, firstLineText?: string): TPromise<IMode> {
		return modeService.getOrCreateMode(modeId);
	}

	/**
	 * Updates the text editor model with the provided value. If the value is the same as the model has, this is a no-op.
	 */
	protected updateTextEditorModel(newValue: string | IRawTextSource): void {
		if (!this.textEditorModel) {
			return;
		}

		this.modelService.updateModel(this.textEditorModel, newValue);
	}

	/**
	 * Returns the textual value of this editor model or null if it has not yet been created.
	 */
	public getValue(): string {
		const model = this.textEditorModel;
		if (model) {
			return model.getValue(EndOfLinePreference.TextDefined, true /* Preserve BOM */);
		}

		return null;
	}

	public isResolved(): boolean {
		return !!this.textEditorModelHandle;
	}

	public dispose(): void {
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
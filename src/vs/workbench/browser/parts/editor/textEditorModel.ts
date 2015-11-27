/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise, Promise} from 'vs/base/common/winjs.base';
import types = require('vs/base/common/types');
import {EndOfLinePreference, IModel} from 'vs/editor/common/editorCommon';
import {IMode} from 'vs/editor/common/modes';
import {EditorModel} from 'vs/workbench/common/editor';
import {Registry} from 'vs/platform/platform';
import {IEditorModesRegistry, Extensions} from 'vs/editor/common/modes/modesRegistry';
import URI from 'vs/base/common/uri';
import {URL} from 'vs/base/common/network';
import {NullMode} from 'vs/editor/common/modes/nullMode';
import {ITextEditorModel} from 'vs/platform/editor/common/editor';
import {IModeService} from 'vs/editor/common/services/modeService';
import {IModelService} from 'vs/editor/common/services/modelService';

/**
 * The base text editor model leverages the monaco code editor model. This class is only intended to be subclassed and not instantiated.
 */
export abstract class BaseTextEditorModel extends EditorModel implements ITextEditorModel {
	private textEditorModelHandle: URL;

	constructor(
		@IModelService private modelService: IModelService,
		@IModeService private modeService: IModeService,
		textEditorModelHandle?: URL
	) {
		super();

		this.textEditorModelHandle = textEditorModelHandle;
	}

	public get textEditorModel(): IModel {
		return this.textEditorModelHandle ? this.modelService.getModel(this.textEditorModelHandle): null;
	}

	/**
	 * Creates the text editor model with the provided value, mime (can be comma separated for multiple values) and optional resource URL.
	 */
	protected createTextEditorModel(value: string, resource?: URI, mime?: string): TPromise<EditorModel> {
		let firstLineText = this.getFirstLineText(value);

		// To avoid flickering, give the mode at most 50ms to load. If the mode doesn't load in 50ms, proceed creating the model with a mode promise
		return Promise.any([Promise.timeout(50), this.getOrCreateMode(this.modeService, mime, firstLineText)]).then(() => {
			let model = this.modelService.createModel(value, this.getOrCreateMode(this.modeService, mime, firstLineText), resource ? URL.fromUri(resource) : null);

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
	protected getOrCreateMode(modeService:IModeService, mime: string, firstLineText?: string): TPromise<IMode> {
		return modeService.getOrCreateMode(mime);
	}

	/**
	 * Updates the text editor model with the provided value and mime (can be comma separated for multiple values).
	 *
	 * This is a no-op if neither the value did not change nor the mime.
	 */
	protected updateTextEditorModel(newValue?: string, newMime?: string): void {
		let modesRegistry = <IEditorModesRegistry>Registry.as(Extensions.EditorModes);

		// Detect content changes
		let currentModelValue = this.getValue();
		let valueChanged = (!types.isUndefinedOrNull(newValue) && currentModelValue !== newValue);

		// Detect mode changes
		let modeChanged = false;
		if (!types.isUndefinedOrNull(newMime)) {
			let modeId = modesRegistry.getModeId(newMime);
			let currentMode = this.textEditorModel.getMode();
			if (currentMode && currentMode.getId() !== NullMode.ID && modeId) {
				let currentModeId = currentMode.getId();
				modeChanged = (currentModeId !== modeId);
			}
		}

		// Apply either content or mode or both
		if (valueChanged) {
			this.textEditorModel.setValue(newValue, modeChanged ? this.getOrCreateMode(this.modeService, newMime) : undefined);
		} else if (modeChanged) {
			this.textEditorModel.setMode(this.getOrCreateMode(this.modeService, newMime));
		}
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
		if (this.textEditorModelHandle) {
			this.modelService.destroyModel(this.textEditorModelHandle);
		}

		this.textEditorModelHandle = null;

		super.dispose();
	}

	public isResolved(): boolean {
		return !!this.textEditorModelHandle;
	}
}
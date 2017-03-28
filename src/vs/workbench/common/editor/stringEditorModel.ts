/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { BaseTextEditorModel } from 'vs/workbench/common/editor/textEditorModel';
import { EditorModel } from 'vs/workbench/common/editor';
import URI from 'vs/base/common/uri';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IModelService } from 'vs/editor/common/services/modelService';

/**
 * An editor model whith an in-memory, readonly content that is not backed by any particular resource.
 */
export class StringEditorModel extends BaseTextEditorModel {
	protected value: string;
	protected modeId: string;
	protected resource: URI;

	constructor(
		value: string,
		modeId: string,
		resource: URI,
		@IModeService modeService: IModeService,
		@IModelService modelService: IModelService
	) {
		super(modelService, modeService);

		this.value = value;
		this.modeId = modeId;
		this.resource = resource;
	}

	/**
	 * The value of this string editor model.
	 */
	public getValue(): string {
		return this.value;
	}

	/**
	 * Sets the value of this string editor model.
	 */
	public setValue(value: string): void {
		this.value = value;
		if (this.textEditorModel) {
			this.textEditorModel.setValue(value);
		}
	}

	public load(): TPromise<EditorModel> {

		// Create text editor model if not yet done
		if (!this.textEditorModel) {
			return this.createTextEditorModel(this.value, this.resource, this.modeId);
		}

		// Otherwise update
		else {
			this.updateTextEditorModel(this.value);
		}

		return TPromise.as<EditorModel>(this);
	}
}
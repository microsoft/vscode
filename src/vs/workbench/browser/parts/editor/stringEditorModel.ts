/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {BaseTextEditorModel} from 'vs/workbench/browser/parts/editor/textEditorModel';
import {IIdentifiedSingleEditOperation} from 'vs/editor/common/editorCommon';
import {EditorModel} from 'vs/workbench/common/editor';
import URI from 'vs/base/common/uri';
import {Position} from 'vs/editor/common/core/position';
import {Range} from 'vs/editor/common/core/range';
import {IModeService} from 'vs/editor/common/services/modeService';
import {IModelService} from 'vs/editor/common/services/modelService';
import {EditOperation} from 'vs/editor/common/core/editOperation';

/**
 * An editor model whith an in-memory, readonly content that is not backed by any particular resource.
 */
export class StringEditorModel extends BaseTextEditorModel {
	protected value: string;
	protected mime: string;
	protected resource: URI;

	constructor(
		value: string,
		mime: string,
		resource: URI,
		@IModeService modeService: IModeService,
		@IModelService modelService: IModelService
	) {
		super(modelService, modeService);

		this.value = value;
		this.mime = mime;
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

	/**
	 * Appends value to this string editor model.
	 */
	public append(value: string): void {
		this.value += value;
		if (this.textEditorModel) {
			let model = this.textEditorModel;
			let lastLine = model.getLineCount();
			let lastLineMaxColumn = model.getLineMaxColumn(lastLine);

			model.applyEdits([EditOperation.insert(new Position(lastLine, lastLineMaxColumn), value)]);
		}
	}

	/**
	 * Clears the value of this string editor model
	 */
	public clearValue(): void {
		this.value = '';
		if (this.textEditorModel) {
			let model = this.textEditorModel;
			let lastLine = model.getLineCount();
			model.applyEdits([EditOperation.delete(new Range(1, 1, lastLine, model.getLineMaxColumn(lastLine)))]);
		}
	}

	/**
	 * Removes all lines from the top if the line number exceeds the given line count. Returns the new value if lines got trimmed.
	 */
	public trim(linecount: number): string {
		if (this.textEditorModel) {
			let model = this.textEditorModel;
			let lastLine = model.getLineCount();
			if (lastLine > linecount) {
				model.applyEdits([EditOperation.delete(new Range(1, 1, lastLine - linecount + 1, 1))]);

				let newValue = model.getValue();
				this.value = newValue;

				return this.value;
			}
		}

		return null;
	}

	public setMime(mime: string): void {
		this.mime = mime;
	}

	public getMime(): string {
		return this.mime;
	}

	public load(): TPromise<EditorModel> {

		// Create text editor model if not yet done
		if (!this.textEditorModel) {
			return this.createTextEditorModel(this.value, this.mime, this.resource);
		}

		// Otherwise update
		else {
			this.updateTextEditorModel(this.value, this.mime);
		}

		return TPromise.as<EditorModel>(this);
	}
}
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { EditorModel } from 'vs/workbench/common/editor';

/**
 * The base editor model for the diff editor. It is made up of two editor models, the original version
 * and the modified version.
 */
export class DiffEditorModel extends EditorModel {
	protected _originalModel: EditorModel;
	protected _modifiedModel: EditorModel;

	constructor(originalModel: EditorModel, modifiedModel: EditorModel) {
		super();

		this._originalModel = originalModel;
		this._modifiedModel = modifiedModel;
	}

	public get originalModel(): EditorModel {
		return this._originalModel;
	}

	public get modifiedModel(): EditorModel {
		return this._modifiedModel;
	}

	public load(): TPromise<EditorModel> {
		return TPromise.join<EditorModel>([
			this._originalModel.load(),
			this._modifiedModel.load()
		]).then(() => {
			return this;
		});
	}

	public isResolved(): boolean {
		return this._originalModel.isResolved() && this._modifiedModel.isResolved();
	}

	public dispose(): void {

		// Do not propagate the dispose() call to the two models inside. We never created the two models
		// (original and modified) so we can not dispose them without sideeffects. Rather rely on the
		// models getting disposed when their related inputs get disposed from the diffEditorInput.

		super.dispose();
	}
}
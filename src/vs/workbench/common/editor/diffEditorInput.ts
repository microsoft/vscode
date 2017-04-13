/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { EditorModel, EditorInput, SideBySideEditorInput, TEXT_DIFF_EDITOR_ID, BINARY_DIFF_EDITOR_ID } from 'vs/workbench/common/editor';
import { BaseTextEditorModel } from 'vs/workbench/common/editor/textEditorModel';
import { DiffEditorModel } from 'vs/workbench/common/editor/diffEditorModel';
import { TextDiffEditorModel } from 'vs/workbench/common/editor/textDiffEditorModel';

/**
 * The base editor input for the diff editor. It is made up of two editor inputs, the original version
 * and the modified version.
 */
export class DiffEditorInput extends SideBySideEditorInput {

	public static ID = 'workbench.editors.diffEditorInput';

	private cachedModel: DiffEditorModel;

	constructor(name: string, description: string, original: EditorInput, modified: EditorInput, private forceOpenAsBinary?: boolean) {
		super(name, description, original, modified);
	}

	public getTypeId(): string {
		return DiffEditorInput.ID;
	}

	get originalInput(): EditorInput {
		return this.details;
	}

	get modifiedInput(): EditorInput {
		return this.master;
	}

	public resolve(refresh?: boolean): TPromise<EditorModel> {
		let modelPromise: TPromise<EditorModel>;

		// Use Cached Model
		if (this.cachedModel && !refresh) {
			modelPromise = TPromise.as<EditorModel>(this.cachedModel);
		}

		// Create Model - we never reuse our cached model if refresh is true because we cannot
		// decide for the inputs within if the cached model can be reused or not. There may be
		// inputs that need to be loaded again and thus we always recreate the model and dispose
		// the previous one - if any.
		else {
			modelPromise = this.createModel(refresh);
		}

		return modelPromise.then((resolvedModel: DiffEditorModel) => {
			if (this.cachedModel) {
				this.cachedModel.dispose();
			}

			this.cachedModel = resolvedModel;

			return this.cachedModel;
		});
	}

	public getPreferredEditorId(candidates: string[]): string {
		return this.forceOpenAsBinary ? BINARY_DIFF_EDITOR_ID : TEXT_DIFF_EDITOR_ID;
	}

	private createModel(refresh?: boolean): TPromise<DiffEditorModel> {

		// Join resolve call over two inputs and build diff editor model
		return TPromise.join<EditorModel>([
			this.originalInput.resolve(refresh),
			this.modifiedInput.resolve(refresh)
		]).then((models) => {
			const originalEditorModel = models[0];
			const modifiedEditorModel = models[1];

			// If both are text models, return textdiffeditor model
			if (modifiedEditorModel instanceof BaseTextEditorModel && originalEditorModel instanceof BaseTextEditorModel) {
				return new TextDiffEditorModel(<BaseTextEditorModel>originalEditorModel, <BaseTextEditorModel>modifiedEditorModel);
			}

			// Otherwise return normal diff model
			return new DiffEditorModel(originalEditorModel, modifiedEditorModel);
		});
	}

	public dispose(): void {

		// Free the diff editor model but do not propagate the dispose() call to the two inputs
		// We never created the two inputs (original and modified) so we can not dispose
		// them without sideeffects.
		if (this.cachedModel) {
			this.cachedModel.dispose();
			this.cachedModel = null;
		}

		super.dispose();
	}
}
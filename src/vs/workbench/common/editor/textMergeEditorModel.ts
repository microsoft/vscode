/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMergeEditorModel, IMergeEditorModelState } from 'vs/editor/common/editorCommon';
import { MergeEditorModel } from './mergeEditorModel';
import { BaseTextEditorModel } from './textEditorModel';

/**
 * The base text editor model for the merge editor. It is made up of three text editor models.
 */
export class TextMergeEditorModel extends MergeEditorModel {

	protected override readonly _commonAncestorModel: BaseTextEditorModel | undefined;
	override get commonAncestorModel(): BaseTextEditorModel | undefined { return this._commonAncestorModel; }

	protected override readonly _currentModel: BaseTextEditorModel | undefined;
	override get currentModel(): BaseTextEditorModel | undefined { return this._currentModel; }

	protected override readonly _incomingModel: BaseTextEditorModel | undefined;
	override get incomingModel(): BaseTextEditorModel | undefined { return this._incomingModel; }

	protected override readonly _outputModel: BaseTextEditorModel | undefined;
	override get outputModel(): BaseTextEditorModel | undefined { return this._outputModel; }

	private _textMergeEditorModel: IMergeEditorModel | undefined = undefined;
	get textMergeEditorModel(): IMergeEditorModel | undefined { return this._textMergeEditorModel; }

	constructor(
		commonAncestorModel: BaseTextEditorModel,
		currentModel: BaseTextEditorModel,
		outputModel: BaseTextEditorModel,
		incomingModel: BaseTextEditorModel,
		state: IMergeEditorModelState = { resolvedRegions: [] }
	) {
		super(commonAncestorModel, currentModel, outputModel, incomingModel, state);

		this._commonAncestorModel = commonAncestorModel;
		this._currentModel = currentModel;
		this._incomingModel = incomingModel;
		this._outputModel = outputModel;

		if (!this._state.initialized) {
			this.initializeContent();
		}

		this.updateTextMergeEditorModel();
	}

	override async resolve(): Promise<void> {
		await super.resolve();

		this.updateTextMergeEditorModel();
	}

	private updateTextMergeEditorModel(): void {
		if (this.commonAncestorModel?.isResolved() && this.currentModel?.isResolved() && this.incomingModel?.isResolved() && this.outputModel?.isResolved()) {

			// Create new
			if (!this._textMergeEditorModel) {
				this._textMergeEditorModel = {
					commonAncestor: this.commonAncestorModel.textEditorModel,
					current: this.currentModel.textEditorModel,
					output: this.outputModel.textEditorModel,
					incoming: this.incomingModel.textEditorModel,
					state: this.state
				};
			}
			// Update existing
			else {
				this._textMergeEditorModel.commonAncestor = this.commonAncestorModel.textEditorModel;
				this._textMergeEditorModel.current = this.currentModel.textEditorModel;
				this._textMergeEditorModel.output = this.outputModel.textEditorModel;
				this._textMergeEditorModel.incoming = this.incomingModel.textEditorModel;
				this._textMergeEditorModel.state = this.state;
			}
		}
	}

	private initializeContent(): void {
		if (this._outputModel?.textEditorModel && this._commonAncestorModel?.textEditorModel) {
			this._outputModel.textEditorModel.setValue(this._commonAncestorModel.textEditorModel.getValue());
		}
	}

	override isResolved(): boolean {
		return !!this._textMergeEditorModel;
	}

	isReadonly(): boolean {
		return !!this.outputModel && this.outputModel.isReadonly();
	}

	override dispose(): void {

		// Free the merge editor model but do not propagate the dispose() call to the models
		// inside. We never created the models so we can not dispose
		// them without sideeffects. Rather rely on the models getting disposed when their related
		// inputs get disposed from the mergeEditorInput.
		this._textMergeEditorModel = undefined;

		super.dispose();
	}
}

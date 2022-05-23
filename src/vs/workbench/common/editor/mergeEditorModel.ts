/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorModel } from './editorModel';
import { IEditorModel } from 'vs/platform/editor/common/editor';
import { IMergeEditorModelState } from 'vs/editor/common/editorCommon';

/**
 * The base editor model for the merge editor. It is made up of three editor models, the current branch version, the incoming branch version, and the output version.
 */
export class MergeEditorModel extends EditorModel {

	protected readonly _commonAncestorModel: IEditorModel | undefined;
	get commonAncestorModel(): IEditorModel | undefined { return this._commonAncestorModel; }

	protected readonly _currentModel: IEditorModel | undefined;
	get currentModel(): IEditorModel | undefined { return this._currentModel; }

	protected readonly _incomingModel: IEditorModel | undefined;
	get incomingModel(): IEditorModel | undefined { return this._incomingModel; }

	protected readonly _outputModel: IEditorModel | undefined;
	get outputModel(): IEditorModel | undefined { return this._outputModel; }

	protected readonly _state: IMergeEditorModelState;
	get state(): IMergeEditorModelState { return this._state; }

	constructor(
		commonAncestorModel: IEditorModel | undefined,
		currentModel: IEditorModel | undefined,
		outputModel: IEditorModel | undefined,
		incomingModel: IEditorModel | undefined,
		state: IMergeEditorModelState = { resolvedRegions: [] }) {
		super();

		this._commonAncestorModel = commonAncestorModel;
		this._currentModel = currentModel;
		this._incomingModel = incomingModel;
		this._outputModel = outputModel;
		this._state = state;
	}

	override async resolve(): Promise<void> {
		await Promise.all([
			this._commonAncestorModel?.resolve(),
			this._currentModel?.resolve(),
			this._incomingModel?.resolve(),
			this._outputModel?.resolve()
		]);
	}

	override isResolved(): boolean {
		return !!(this.commonAncestorModel?.isResolved() && this.currentModel?.isResolved() && this.outputModel?.isResolved() && this.incomingModel?.isResolved());
	}

	override dispose(): void {

		// Do not propagate the dispose() call to the models inside. We never created the models so we can not dispose them without sideeffects. Rather rely on the
		// models getting disposed when their related inputs get disposed from the mergeEditorInput.

		super.dispose();
	}
}

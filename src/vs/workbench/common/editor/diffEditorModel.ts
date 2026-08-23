/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorModel } from './editorModel.js';
import { IResolvableEditorModel } from '../../../platform/editor/common/editor.js';

/**
 * The base editor model for the diff editor. It is made up of two editor models, the original version
 * and the modified version.
 */
export class DiffEditorModel extends EditorModel {

	protected readonly _originalModel: IResolvableEditorModel | undefined;
	get originalModel(): IResolvableEditorModel | undefined { return this._originalModel; }

	protected readonly _modifiedModel: IResolvableEditorModel | undefined;
	get modifiedModel(): IResolvableEditorModel | undefined { return this._modifiedModel; }

	constructor(originalModel: IResolvableEditorModel | undefined, modifiedModel: IResolvableEditorModel | undefined) {
		super();

		this._originalModel = originalModel;
		this._modifiedModel = modifiedModel;
	}

	override async resolve(): Promise<void> {
		await Promise.all([
			this._originalModel?.resolve(),
			this._modifiedModel?.resolve()
		]);
	}

	override isResolved(): boolean {
		return !!(this._originalModel?.isResolved() && this._modifiedModel?.isResolved());
	}

	override dispose(): void {

		// Do not propagate the dispose() call to the two models inside. We never created the two models
		// (original and modified) so we can not dispose them without sideeffects. Rather rely on the
		// models getting disposed when their related inputs get disposed from the diffEditorInput.

		super.dispose();
	}
}

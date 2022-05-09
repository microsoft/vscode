/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isEqual } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IUntypedEditorInput } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { MergeEditorModel } from 'vs/workbench/contrib/mergeEditor/browser/mergeEditorModel';

export interface MergeEditorInputJSON {
	anchestor: URI;
	inputOne: URI;
	inputTwo: URI;
	result: URI;
}

export class MergeEditorInput extends EditorInput {

	static readonly ID = 'mergeEditor.Input';

	private _model?: MergeEditorModel;

	constructor(
		private readonly _anchestor: URI,
		private readonly _inputOne: URI,
		private readonly _inputTwo: URI,
		private readonly _result: URI,
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@ITextModelService private readonly _textModelService: ITextModelService,
	) {
		super();
	}

	override dispose(): void {
		super.dispose();
	}

	get typeId(): string {
		return MergeEditorInput.ID;
	}

	get resource(): URI | undefined {
		return this._result;
	}

	override async resolve(): Promise<MergeEditorModel> {
		if (!this._model) {

			const anchestor = await this._textModelService.createModelReference(this._anchestor);
			const inputOne = await this._textModelService.createModelReference(this._inputOne);
			const inputTwo = await this._textModelService.createModelReference(this._inputTwo);
			const result = await this._textModelService.createModelReference(this._result);

			this._model = this._instaService.createInstance(
				MergeEditorModel,
				anchestor.object.textEditorModel,
				inputOne.object.textEditorModel,
				inputTwo.object.textEditorModel,
				result.object.textEditorModel
			);

			this._store.add(this._model);
			this._store.add(anchestor);
			this._store.add(inputOne);
			this._store.add(inputTwo);
			this._store.add(result);
		}
		return this._model;
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		if (!(otherInput instanceof MergeEditorInput)) {
			return false;
		}
		return isEqual(this._anchestor, otherInput._anchestor)
			&& isEqual(this._inputOne, otherInput._inputOne)
			&& isEqual(this._inputTwo, otherInput._inputTwo)
			&& isEqual(this._result, otherInput._result);
	}

	toJSON(): MergeEditorInputJSON {
		return {
			anchestor: this._anchestor,
			inputOne: this._inputOne,
			inputTwo: this._inputTwo,
			result: this._result,
		};
	}
}

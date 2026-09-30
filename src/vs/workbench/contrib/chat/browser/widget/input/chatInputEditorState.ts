/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IReference, RefCountedDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ICodeEditorViewState } from '../../../../../../editor/common/editorCommon.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { IResolvedTextEditorModel } from '../../../../../../editor/common/services/resolverService.js';

/** Retains an input model, including its undo history, while its editor is reconstructed. */
export class ChatInputEditorState extends Disposable {

	private constructor(
		readonly model: ITextModel,
		private readonly ownership: RefCountedDisposable,
		readonly viewState: ICodeEditorViewState | null,
	) {
		super();
		this._register(toDisposable(() => ownership.release()));
	}

	static create(model: ITextModel, reference: Promise<IReference<IResolvedTextEditorModel>>, ownsModel = true): ChatInputEditorState {
		const disposeModel = () => {
			if (ownsModel) {
				model.dispose();
			}
		};
		return new ChatInputEditorState(model, new RefCountedDisposable(toDisposable(() => {
			void reference.then(ref => {
				ref.dispose();
				disposeModel();
			}, disposeModel);
		})), null);
	}

	acquire(viewState = this.viewState): ChatInputEditorState {
		return new ChatInputEditorState(this.model, this.ownership.acquire(), viewState);
	}
}

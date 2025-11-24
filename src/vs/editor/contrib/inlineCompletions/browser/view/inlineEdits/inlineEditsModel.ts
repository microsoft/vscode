/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../../base/common/event.js';
import { derived, IObservable } from '../../../../../../base/common/observable.js';
import { InlineCompletionsModel, isSuggestionInViewport } from '../../model/inlineCompletionsModel.js';
import { InlineSuggestHint } from '../../model/inlineSuggestionItem.js';
import { InlineCompletionViewData, InlineCompletionViewKind, InlineEditTabAction } from './inlineEditsViewInterface.js';
import { InlineEditWithChanges } from './inlineEditWithChanges.js';

/**
 * Warning: This is not per inline edit id and gets created often.
 * @deprecated TODO@hediet remove
*/
export class ModelPerInlineEdit {

	readonly isInDiffEditor: boolean;

	readonly displayLocation: InlineSuggestHint | undefined;


	/** Determines if the inline suggestion is fully in the view port */
	readonly inViewPort: IObservable<boolean>;

	readonly onDidAccept: Event<void>;

	constructor(
		private readonly _model: InlineCompletionsModel,
		readonly inlineEdit: InlineEditWithChanges,
		readonly tabAction: IObservable<InlineEditTabAction>,
	) {
		this.isInDiffEditor = this._model.isInDiffEditor;

		this.displayLocation = this.inlineEdit.inlineCompletion.hint;

		this.inViewPort = derived(this, reader => isSuggestionInViewport(this._model.editor, this.inlineEdit.inlineCompletion, reader));
		this.onDidAccept = this._model.onDidAccept;
	}

	accept() {
		this._model.accept();
	}

	handleInlineEditShown(viewKind: InlineCompletionViewKind, viewData: InlineCompletionViewData) {
		this._model.handleInlineSuggestionShown(this.inlineEdit.inlineCompletion, viewKind, viewData);
	}
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { derived, IObservable } from '../../../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ICodeEditor } from '../../../../../browser/editorBrowser.js';
import { ObservableCodeEditor, observableCodeEditor } from '../../../../../browser/observableCodeEditor.js';
import { Range } from '../../../../../common/core/range.js';
import { TextReplacement, TextEdit } from '../../../../../common/core/edits/textEdit.js';
import { TextModelText } from '../../../../../common/model/textModelText.js';
import { InlineCompletionsModel } from '../../model/inlineCompletionsModel.js';
import { InlineEditWithChanges } from './inlineEditWithChanges.js';
import { ModelPerInlineEdit } from './inlineEditsModel.js';
import { InlineEditsView } from './inlineEditsView.js';
import { InlineEditTabAction } from './inlineEditsViewInterface.js';
import { InlineSuggestionGutterMenuData, SimpleInlineSuggestModel } from './components/gutterIndicatorView.js';

export class InlineEditsViewAndDiffProducer extends Disposable { // TODO: This class is no longer a diff producer. Rename it or get rid of it
	private readonly _editorObs: ObservableCodeEditor;

	private readonly _inlineEdit = derived<InlineEditWithChanges | undefined>(this, (reader) => {
		const model = this._model.read(reader);
		if (!model) { return undefined; }
		const textModel = this._editor.getModel();
		if (!textModel) { return undefined; }

		const state = model.inlineEditState.read(reader);
		if (!state) { return undefined; }
		const action = state.inlineSuggestion.action;

		const text = new TextModelText(textModel);

		let diffEdits: TextEdit | undefined;

		if (action?.kind === 'edit') {
			const editOffset = action.stringEdit;

			const edits = editOffset.replacements.map(e => {
				const innerEditRange = Range.fromPositions(
					textModel.getPositionAt(e.replaceRange.start),
					textModel.getPositionAt(e.replaceRange.endExclusive)
				);
				return new TextReplacement(innerEditRange, e.newText);
			});
			diffEdits = new TextEdit(edits);
		} else {
			diffEdits = undefined;
		}

		return new InlineEditWithChanges(
			text,
			action,
			diffEdits,
			model.primaryPosition.read(undefined),
			model.allPositions.read(undefined),
			state.inlineSuggestion.source.inlineSuggestions.commands ?? [],
			state.inlineSuggestion
		);
	});

	public readonly _inlineEditModel = derived<ModelPerInlineEdit | undefined>(this, reader => {
		const model = this._model.read(reader);
		if (!model) { return undefined; }
		const edit = this._inlineEdit.read(reader);
		if (!edit) { return undefined; }

		const tabAction = derived<InlineEditTabAction>(this, reader => {
			/** @description tabAction */
			if (this._editorObs.isFocused.read(reader)) {
				if (model.tabShouldJumpToInlineEdit.read(reader)) { return InlineEditTabAction.Jump; }
				if (model.tabShouldAcceptInlineEdit.read(reader)) { return InlineEditTabAction.Accept; }
			}
			return InlineEditTabAction.Inactive;
		});

		return new ModelPerInlineEdit(model, edit, tabAction);
	});

	public readonly view: InlineEditsView;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _model: IObservable<InlineCompletionsModel | undefined>,
		private readonly _showCollapsed: IObservable<boolean>,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this._editorObs = observableCodeEditor(this._editor);

		this.view = this._register(instantiationService.createInstance(InlineEditsView, this._editor, this._inlineEditModel,
			this._model.map(model => model ? SimpleInlineSuggestModel.fromInlineCompletionModel(model) : undefined),
			this._inlineEdit.map(e => e ? InlineSuggestionGutterMenuData.fromInlineSuggestion(e.inlineCompletion) : undefined),
			this._showCollapsed,
		));
	}
}

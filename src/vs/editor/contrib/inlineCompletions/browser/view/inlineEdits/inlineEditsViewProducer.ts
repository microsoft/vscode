/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHotClass } from '../../../../../../base/common/hotReloadHelpers.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { derived, IObservable, ISettableObservable } from '../../../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ICodeEditor } from '../../../../../browser/editorBrowser.js';
import { ObservableCodeEditor, observableCodeEditor } from '../../../../../browser/observableCodeEditor.js';
import { LineRange } from '../../../../../common/core/lineRange.js';
import { Range } from '../../../../../common/core/range.js';
import { SingleTextEdit, TextEdit } from '../../../../../common/core/textEdit.js';
import { TextModelText } from '../../../../../common/model/textModelText.js';
import { InlineCompletionsModel } from '../../model/inlineCompletionsModel.js';
import { InlineEdit } from '../../model/inlineEdit.js';
import { InlineEditWithChanges } from './inlineEditWithChanges.js';
import { GhostTextIndicator, InlineEditHost, InlineEditModel } from './inlineEditsModel.js';
import { InlineEditsView } from './inlineEditsView.js';
import { InlineEditTabAction } from './inlineEditsViewInterface.js';

export class InlineEditsViewAndDiffProducer extends Disposable { // TODO: This class is no longer a diff producer. Rename it or get rid of it
	public static readonly hot = createHotClass(InlineEditsViewAndDiffProducer);

	private readonly _editorObs: ObservableCodeEditor;

	private readonly _inlineEdit = derived<InlineEditWithChanges | undefined>(this, (reader) => {
		const model = this._model.read(reader);
		if (!model) { return undefined; }
		const inlineEdit = this._edit.read(reader);
		if (!inlineEdit) { return undefined; }
		const textModel = this._editor.getModel();
		if (!textModel) { return undefined; }

		const editOffset = model.inlineEditState.get()?.inlineCompletion.updatedEdit;
		if (!editOffset) { return undefined; }

		const edits = editOffset.edits.map(e => {
			const innerEditRange = Range.fromPositions(
				textModel.getPositionAt(e.replaceRange.start),
				textModel.getPositionAt(e.replaceRange.endExclusive)
			);
			return new SingleTextEdit(innerEditRange, e.newText);
		});

		const diffEdits = new TextEdit(edits);
		const text = new TextModelText(textModel);

		return new InlineEditWithChanges(text, diffEdits, model.primaryPosition.get(), inlineEdit.commands, inlineEdit.inlineCompletion);
	});

	private readonly _inlineEditModel = derived<InlineEditModel | undefined>(this, reader => {
		const model = this._model.read(reader);
		if (!model) { return undefined; }
		const edit = this._inlineEdit.read(reader);
		if (!edit) { return undefined; }

		const tabAction = derived<InlineEditTabAction>(this, reader => {
			if (this._editorObs.isFocused.read(reader)) {
				if (model.tabShouldJumpToInlineEdit.read(reader)) { return InlineEditTabAction.Jump; }
				if (model.tabShouldAcceptInlineEdit.read(reader)) { return InlineEditTabAction.Accept; }
			}
			return InlineEditTabAction.Inactive;
		});

		return new InlineEditModel(model, edit, tabAction);
	});

	private readonly _inlineEditHost = derived<InlineEditHost | undefined>(this, reader => {
		const model = this._model.read(reader);
		if (!model) { return undefined; }
		return new InlineEditHost(model);
	});

	private readonly _ghostTextIndicator = derived<GhostTextIndicator | undefined>(this, reader => {
		const model = this._model.read(reader);
		if (!model) { return undefined; }
		const state = model.inlineCompletionState.read(reader);
		if (!state) { return undefined; }
		const inlineCompletion = state.inlineCompletion;
		if (!inlineCompletion) { return undefined; }

		if (!inlineCompletion.sourceInlineCompletion.showInlineEditMenu) {
			return undefined;
		}

		const lineRange = LineRange.ofLength(state.primaryGhostText.lineNumber, 1);

		return new GhostTextIndicator(this._editor, model, lineRange, inlineCompletion);
	});

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _edit: IObservable<InlineEdit | undefined>,
		private readonly _model: IObservable<InlineCompletionsModel | undefined>,
		private readonly _focusIsInMenu: ISettableObservable<boolean>,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this._editorObs = observableCodeEditor(this._editor);

		this._register(instantiationService.createInstance(InlineEditsView, this._editor, this._inlineEditHost, this._inlineEditModel, this._ghostTextIndicator, this._focusIsInMenu));
	}
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHotClass } from '../../../../../../base/common/hotReloadHelpers.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { derived, IObservable, ISettableObservable } from '../../../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ICodeEditor } from '../../../../../browser/editorBrowser.js';
import { Range } from '../../../../../common/core/range.js';
import { SingleTextEdit, TextEdit } from '../../../../../common/core/textEdit.js';
import { TextModelText } from '../../../../../common/model/textModelText.js';
import { InlineCompletionsModel } from '../../model/inlineCompletionsModel.js';
import { InlineEdit } from '../../model/inlineEdit.js';
import { InlineEditWithChanges } from './inlineEditWithChanges.js';
import { InlineEditsView } from './inlineEditsView.js';

export class InlineEditsViewAndDiffProducer extends Disposable { // TODO: This class is no longer a diff producer. Rename it or get rid of it
	public static readonly hot = createHotClass(InlineEditsViewAndDiffProducer);

	private readonly _inlineEdit = derived<InlineEditWithChanges | undefined>(this, (reader) => {
		const model = this._model.read(reader);
		if (!model) { return undefined; }
		const inlineEdit = this._edit.read(reader);
		if (!inlineEdit) { return undefined; }
		const textModel = this._editor.getModel();
		if (!textModel) { return undefined; }

		const editOffset = model.inlineEditState.get()?.inlineCompletion.updatedEdit.read(reader);
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

		return new InlineEditWithChanges(text, diffEdits, model.primaryPosition.get(), inlineEdit.renderExplicitly, inlineEdit.commands, inlineEdit.inlineCompletion);
	});

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _edit: IObservable<InlineEdit | undefined>,
		private readonly _model: IObservable<InlineCompletionsModel | undefined>,
		private readonly _focusIsInMenu: ISettableObservable<boolean>,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		this._register(this._instantiationService.createInstance(InlineEditsView, this._editor, this._inlineEdit, this._model, this._focusIsInMenu));
	}
}

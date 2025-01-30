/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHotClass } from '../../../../../../base/common/hotReloadHelpers.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { derived, IObservable, ISettableObservable } from '../../../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ICodeEditor } from '../../../../../browser/editorBrowser.js';
import { SingleLineEdit } from '../../../../../common/core/lineEdit.js';
import { Position } from '../../../../../common/core/position.js';
import { Range } from '../../../../../common/core/range.js';
import { SingleTextEdit, TextEdit, AbstractText } from '../../../../../common/core/textEdit.js';
import { Command } from '../../../../../common/languages.js';
import { TextModelText } from '../../../../../common/model/textModelText.js';
import { InlineCompletionsModel } from '../../model/inlineCompletionsModel.js';
import { InlineEdit } from '../../model/inlineEdit.js';
import { InlineCompletionItem } from '../../model/provideInlineCompletions.js';
import { InlineEditsView } from './view.js';

export class InlineEditsViewAndDiffProducer extends Disposable { // TODO: This class is no longer a diff producer. Rename it or get rid of it
	public static readonly hot = createHotClass(InlineEditsViewAndDiffProducer);

	private readonly _inlineEdit = derived<InlineEditWithChanges | undefined>(this, (reader) => {
		const model = this._model.read(reader);
		if (!model) { return undefined; }
		const inlineEdit = this._edit.read(reader);
		if (!inlineEdit) { return undefined; }
		const textModel = this._editor.getModel();
		if (!textModel) { return undefined; }

		const editOffset = model.inlineEditState.get()?.inlineCompletion.inlineEdit.read(reader);
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

		return new InlineEditWithChanges(text, diffEdits, inlineEdit.isCollapsed, model.primaryPosition.get(), inlineEdit.renderExplicitly, inlineEdit.commands, inlineEdit.inlineCompletion);
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

export class InlineEditWithChanges {
	public readonly lineEdit = SingleLineEdit.fromSingleTextEdit(this.edit.toSingle(this.originalText), this.originalText);

	public readonly originalLineRange = this.lineEdit.lineRange;
	public readonly modifiedLineRange = this.lineEdit.toLineEdit().getNewLineRanges()[0];

	constructor(
		public readonly originalText: AbstractText,
		public readonly edit: TextEdit,
		public readonly isCollapsed: boolean,
		public readonly cursorPosition: Position,
		public readonly userJumpedToIt: boolean,
		public readonly commands: readonly Command[],
		public readonly inlineCompletion: InlineCompletionItem,
	) {
	}

	equals(other: InlineEditWithChanges) {
		return this.originalText.getValue() === other.originalText.getValue() &&
			this.edit.equals(other.edit) &&
			this.isCollapsed === other.isCollapsed &&
			this.cursorPosition.equals(other.cursorPosition) &&
			this.userJumpedToIt === other.userJumpedToIt &&
			this.commands === other.commands &&
			this.inlineCompletion === other.inlineCompletion;
	}
}

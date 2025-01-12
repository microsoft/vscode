/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LRUCachedFunction } from '../../../../../../base/common/cache.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { equalsIfDefined, itemEquals } from '../../../../../../base/common/equals.js';
import { createHotClass } from '../../../../../../base/common/hotReloadHelpers.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { derivedDisposable, ObservablePromise, derived, IObservable, derivedOpts, ISettableObservable } from '../../../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ICodeEditor } from '../../../../../browser/editorBrowser.js';
import { IDiffProviderFactoryService } from '../../../../../browser/widget/diffEditor/diffProviderFactoryService.js';
import { SingleLineEdit } from '../../../../../common/core/lineEdit.js';
import { Position } from '../../../../../common/core/position.js';
import { Range } from '../../../../../common/core/range.js';
import { SingleTextEdit, TextEdit, AbstractText } from '../../../../../common/core/textEdit.js';
import { TextLength } from '../../../../../common/core/textLength.js';
import { Command } from '../../../../../common/languages.js';
import { TextModelText } from '../../../../../common/model/textModelText.js';
import { IModelService } from '../../../../../common/services/model.js';
import { InlineCompletionsModel } from '../../model/inlineCompletionsModel.js';
import { InlineEdit } from '../../model/inlineEdit.js';
import { InlineCompletionItem } from '../../model/provideInlineCompletions.js';
import { InlineEditsView } from './view.js';
import { UniqueUriGenerator } from './utils.js';

export class InlineEditsViewAndDiffProducer extends Disposable {
	public static readonly hot = createHotClass(InlineEditsViewAndDiffProducer);

	private readonly _modelUriGenerator = new UniqueUriGenerator('inline-edits');

	private readonly _originalModel = derivedDisposable(() => this._modelService.createModel(
		'', null, this._modelUriGenerator.getUniqueUri())).keepObserved(this._store);
	private readonly _modifiedModel = derivedDisposable(() => this._modelService.createModel(
		'', null, this._modelUriGenerator.getUniqueUri())).keepObserved(this._store);

	private readonly _differ = new LRUCachedFunction({ getCacheKey: JSON.stringify }, (arg: { original: string; modified: string }) => {
		this._originalModel.get().setValue(arg.original);
		this._modifiedModel.get().setValue(arg.modified);

		const diffAlgo = this._diffProviderFactoryService.createDiffProvider({ diffAlgorithm: 'advanced' });

		return ObservablePromise.fromFn(async () => {
			const result = await diffAlgo.computeDiff(this._originalModel.get(), this._modifiedModel.get(), {
				computeMoves: false,
				ignoreTrimWhitespace: false,
				maxComputationTimeMs: 1000,
				extendToSubwords: true,
			}, CancellationToken.None);
			return result;
		});
	});

	private readonly _inlineEditPromise = derived<IObservable<InlineEditWithChanges | undefined> | undefined>(this, (reader) => {
		const model = this._model.read(reader);
		if (!model) { return undefined; }
		const inlineEdit = this._edit.read(reader);
		if (!inlineEdit) { return undefined; }

		//if (inlineEdit.text.trim() === '') { return undefined; }
		const text = new TextModelText(this._editor.getModel()!);
		const edit = inlineEdit.edit.extendToFullLine(text);

		const diffResult = this._differ.get({ original: this._editor.getModel()!.getValueInRange(edit.range), modified: edit.text });

		return diffResult.promiseResult.map(p => {
			if (!p || !p.data) {
				return undefined;
			}
			const result = p.data;

			const rangeStartPos = edit.range.getStartPosition();
			const innerChanges = result.changes.flatMap(c => c.innerChanges!);
			if (innerChanges.length === 0) {
				// there are no changes
				return undefined;
			}

			function addRangeToPos(pos: Position, range: Range): Range {
				const start = TextLength.fromPosition(range.getStartPosition());
				return TextLength.ofRange(range).createRange(start.addToPosition(pos));
			}

			const edits = innerChanges.map(c => new SingleTextEdit(
				addRangeToPos(rangeStartPos, c.originalRange),
				this._modifiedModel.get()!.getValueInRange(c.modifiedRange)
			));
			const diffEdits = new TextEdit(edits);

			return new InlineEditWithChanges(text, diffEdits, inlineEdit.isCollapsed, model.primaryPosition.get(), inlineEdit.renderExplicitly, inlineEdit.commands, inlineEdit.inlineCompletion); //inlineEdit.showInlineIfPossible);
		});
	});

	private readonly _inlineEdit = derivedOpts({ owner: this, equalsFn: equalsIfDefined(itemEquals()) }, reader => this._inlineEditPromise.read(reader)?.read(reader));

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _edit: IObservable<InlineEdit | undefined>,
		private readonly _model: IObservable<InlineCompletionsModel | undefined>,
		private readonly _focusIsInMenu: ISettableObservable<boolean>,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IDiffProviderFactoryService private readonly _diffProviderFactoryService: IDiffProviderFactoryService,
		@IModelService private readonly _modelService: IModelService
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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { derived, IObservable, IReader } from '../../../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ICodeEditor } from '../../../../../browser/editorBrowser.js';
import { observableCodeEditor } from '../../../../../browser/observableCodeEditor.js';
import { EditorOption } from '../../../../../common/config/editorOptions.js';
import { LineRange } from '../../../../../common/core/lineRange.js';
import { Position } from '../../../../../common/core/position.js';
import { StringText } from '../../../../../common/core/textEdit.js';
import { DetailedLineRangeMapping, lineRangeMappingFromRangeMappings, RangeMapping } from '../../../../../common/diff/rangeMapping.js';
import { TextModel } from '../../../../../common/model/textModel.js';
import { InlineCompletionsModel } from '../../model/inlineCompletionsModel.js';
import { IInlineEditsIndicatorState, InlineEditsIndicator } from './indicatorView.js';
import { IOriginalEditorInlineDiffViewState, OriginalEditorInlineDiffView } from './inlineDiffView.js';
import { InlineEditsSideBySideDiff } from './sideBySideDiff.js';
import { applyEditToModifiedRangeMappings, createReindentEdit } from './utils.js';
import './view.css';
import { InlineEditWithChanges } from './viewAndDiffProducer.js';

export class InlineEditsView extends Disposable {
	private readonly _editorObs = observableCodeEditor(this._editor);

	private readonly _useMixedLinesDiff = observableCodeEditor(this._editor).getOption(EditorOption.inlineSuggest).map(s => s.edits.experimental.useMixedLinesDiff);
	private readonly _useInterleavedLinesDiff = observableCodeEditor(this._editor).getOption(EditorOption.inlineSuggest).map(s => s.edits.experimental.useInterleavedLinesDiff);

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _edit: IObservable<InlineEditWithChanges | undefined>,
		private readonly _model: IObservable<InlineCompletionsModel | undefined>,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
	}

	private readonly _uiState = derived<{
		state: 'collapsed' | 'mixedLines' | 'ghostText' | 'interleavedLines' | 'sideBySide';
		diff: DetailedLineRangeMapping[];
		edit: InlineEditWithChanges;
		newText: string;
		newTextLineCount: number;
		originalDisplayRange: LineRange;
	} | undefined>(this, reader => {
		const edit = this._edit.read(reader);
		if (!edit) {
			return undefined;
		}

		this._model.get()?.handleInlineCompletionShown(edit.inlineCompletion);

		let mappings = RangeMapping.fromEdit(edit.edit);
		let newText = edit.edit.apply(edit.originalText);
		let diff = lineRangeMappingFromRangeMappings(mappings, edit.originalText, new StringText(newText));

		const state = this.determinRenderState(edit, reader, diff);

		if (state === 'sideBySide') {
			const indentationAdjustmentEdit = createReindentEdit(newText, edit.modifiedLineRange);
			newText = indentationAdjustmentEdit.applyToString(newText);

			mappings = applyEditToModifiedRangeMappings(mappings, indentationAdjustmentEdit);
			diff = lineRangeMappingFromRangeMappings(mappings, edit.originalText, new StringText(newText));
		}

		const originalDisplayRange = edit.originalText.lineRange.intersect(
			edit.originalLineRange.join(
				LineRange.ofLength(edit.originalLineRange.startLineNumber, edit.lineEdit.newLines.length)
			)
		)!;

		this._previewTextModel.setLanguage(this._editor.getModel()!.getLanguageId());
		this._previewTextModel.setValue(newText);

		return {
			state,
			diff,
			edit,
			newText,
			newTextLineCount: edit.modifiedLineRange.length,
			originalDisplayRange: originalDisplayRange,
		};
	});

	private readonly _previewTextModel = this._register(this._instantiationService.createInstance(
		TextModel,
		'',
		this._editor.getModel()!.getLanguageId(),
		{ ...TextModel.DEFAULT_CREATION_OPTIONS, bracketPairColorizationOptions: { enabled: true, independentColorPoolPerBracketType: false } },
		null
	));

	private readonly _sideBySide = this._register(this._instantiationService.createInstance(InlineEditsSideBySideDiff,
		this._editor,
		this._edit,
		this._previewTextModel,
		this._uiState.map(s => s && s.state === 'sideBySide' ? ({
			edit: s.edit,
			newTextLineCount: s.newTextLineCount,
			originalDisplayRange: s.originalDisplayRange,
		}) : undefined),
	));

	private readonly _inlineDiffViewState = derived<IOriginalEditorInlineDiffViewState | undefined>(this, reader => {
		const e = this._uiState.read(reader);
		if (!e) { return undefined; }

		return {
			modifiedText: new StringText(e.newText),
			diff: e.diff,
			mode: e.state === 'collapsed' ? 'sideBySide' : e.state,
			modifiedCodeEditor: this._sideBySide.previewEditor,
		};
	});

	protected readonly _inlineDiffView = this._register(new OriginalEditorInlineDiffView(this._editor, this._inlineDiffViewState, this._previewTextModel));

	protected readonly _indicator = this._register(new InlineEditsIndicator(
		this._editorObs,
		derived<IInlineEditsIndicatorState | undefined>(reader => {
			const state = this._uiState.read(reader);
			if (!state) { return undefined; }

			const range = state.originalDisplayRange;
			const top = this._editor.getTopForLineNumber(range.startLineNumber) - this._editorObs.scrollTop.read(reader);

			return { editTop: top, showAlways: state.state !== 'sideBySide' };
		}),
		this._model,
	));

	private determinRenderState(edit: InlineEditWithChanges, reader: IReader, diff: DetailedLineRangeMapping[]) {
		if (edit.isCollapsed) {
			return 'collapsed';
		}

		if (
			(this._useMixedLinesDiff.read(reader) === 'whenPossible' || (edit.userJumpedToIt && this._useMixedLinesDiff.read(reader) === 'afterJumpWhenPossible'))
			&& diff.every(m => OriginalEditorInlineDiffView.supportsInlineDiffRendering(m))
		) {
			return 'mixedLines';
		}

		if (
			this._useMixedLinesDiff.read(reader) === 'forStableInsertions'
			&& isInsertionAfterPosition(diff, edit.cursorPosition)
		) {
			return 'ghostText';
		}

		if (this._useInterleavedLinesDiff.read(reader) === 'always' || (edit.userJumpedToIt && this._useInterleavedLinesDiff.read(reader) === 'afterJump')) {
			return 'interleavedLines';
		}

		return 'sideBySide';
	}
}

function isInsertionAfterPosition(diff: DetailedLineRangeMapping[], position: Position | null) {
	if (!position) {
		return false;
	}
	const pos = position;

	return diff.every(m => m.innerChanges!.every(r => isStableWordInsertion(r)));

	function isStableWordInsertion(r: RangeMapping) {
		if (!r.originalRange.isEmpty()) {
			return false;
		}
		const isInsertionWithinLine = r.modifiedRange.startLineNumber === r.modifiedRange.endLineNumber;
		if (!isInsertionWithinLine) {
			return false;
		}
		const insertPosition = r.originalRange.getStartPosition();
		if (pos.isBeforeOrEqual(insertPosition)) {
			return true;
		}
		if (insertPosition.lineNumber < pos.lineNumber) {
			return true;
		}
		return false;
	}
}

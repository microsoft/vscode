/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { autorunWithStore, derived, IObservable, IReader, ISettableObservable, mapObservableArrayCached } from '../../../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ICodeEditor } from '../../../../../browser/editorBrowser.js';
import { observableCodeEditor } from '../../../../../browser/observableCodeEditor.js';
import { EditorOption } from '../../../../../common/config/editorOptions.js';
import { LineRange } from '../../../../../common/core/lineRange.js';
import { Position } from '../../../../../common/core/position.js';
import { Range } from '../../../../../common/core/range.js';
import { SingleTextEdit, StringText } from '../../../../../common/core/textEdit.js';
import { TextLength } from '../../../../../common/core/textLength.js';
import { DetailedLineRangeMapping, lineRangeMappingFromRangeMappings, RangeMapping } from '../../../../../common/diff/rangeMapping.js';
import { TextModel } from '../../../../../common/model/textModel.js';
import { InlineCompletionsModel } from '../../model/inlineCompletionsModel.js';
import { InlineEditsDeletionView } from './deletionView.js';
import { InlineEditsGutterIndicator } from './gutterIndicatorView.js';
import { IInlineEditsIndicatorState, InlineEditsIndicator } from './indicatorView.js';
import { IOriginalEditorInlineDiffViewState, OriginalEditorInlineDiffView } from './inlineDiffView.js';
import { InlineEditsSideBySideDiff } from './sideBySideDiff.js';
import { applyEditToModifiedRangeMappings, createReindentEdit } from './utils.js';
import './view.css';
import { InlineEditWithChanges } from './viewAndDiffProducer.js';
import { WordInsertView, WordReplacementView } from './wordReplacementView.js';

export class InlineEditsView extends Disposable {
	private readonly _editorObs = observableCodeEditor(this._editor);

	private readonly _useMixedLinesDiff = observableCodeEditor(this._editor).getOption(EditorOption.inlineSuggest).map(s => s.edits.experimental.useMixedLinesDiff);
	private readonly _useInterleavedLinesDiff = observableCodeEditor(this._editor).getOption(EditorOption.inlineSuggest).map(s => s.edits.experimental.useInterleavedLinesDiff);
	private readonly _useWordReplacementView = observableCodeEditor(this._editor).getOption(EditorOption.inlineSuggest).map(s => s.edits.experimental.useWordReplacementView);
	private readonly _useWordInsertionView = observableCodeEditor(this._editor).getOption(EditorOption.inlineSuggest).map(s => s.edits.experimental.useWordInsertionView);

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _edit: IObservable<InlineEditWithChanges | undefined>,
		private readonly _model: IObservable<InlineCompletionsModel | undefined>,
		private readonly _focusIsInMenu: ISettableObservable<boolean>,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
	}

	private readonly _uiState = derived<{
		state: ReturnType<typeof InlineEditsView.prototype.determineRenderState>;
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

		const state = this.determineRenderState(edit, reader, diff, new StringText(newText));

		if (state.kind === 'sideBySide') {
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

		const previousNewText = this._previewTextModel.getValue();
		if (previousNewText !== newText) {
			// Only update the model if the text has changed to avoid flickering
			this._previewTextModel.setValue(newText);
		}

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
		this._uiState.map(s => s && s.state.kind === 'sideBySide' ? ({
			edit: s.edit,
			newTextLineCount: s.newTextLineCount,
			originalDisplayRange: s.originalDisplayRange,
		}) : undefined),
	));

	protected readonly _deletion = this._register(this._instantiationService.createInstance(InlineEditsDeletionView,
		this._editor,
		this._edit,
		this._uiState.map(s => s && s.state.kind === 'deletion' ? ({
			edit: s.edit,
			originalDisplayRange: s.originalDisplayRange,
			widgetStartColumn: s.state.widgetStartColumn,
		}) : undefined),
	));

	private readonly _inlineDiffViewState = derived<IOriginalEditorInlineDiffViewState | undefined>(this, reader => {
		const e = this._uiState.read(reader);
		if (!e) { return undefined; }
		if (e.state.kind === 'wordReplacements' || e.state.kind === 'lineReplacement') {
			return undefined;
		}
		return {
			modifiedText: new StringText(e.newText),
			diff: e.diff,
			mode: e.state.kind === 'collapsed' || e.state.kind === 'deletion' ? 'sideBySide' : e.state.kind,
			modifiedCodeEditor: this._sideBySide.previewEditor,
		};
	});

	protected readonly _inlineDiffView = this._register(new OriginalEditorInlineDiffView(this._editor, this._inlineDiffViewState, this._previewTextModel));

	protected readonly _wordReplacementViews = mapObservableArrayCached(this, this._uiState.map(s => s?.state.kind === 'wordReplacements' ? s.state.replacements : []), (e, store) => {
		if (e.range.isEmpty()) {
			return store.add(this._instantiationService.createInstance(WordInsertView, this._editorObs, e));
		} else {
			return store.add(this._instantiationService.createInstance(WordReplacementView, this._editorObs, e, [e]));
		}
	}).recomputeInitiallyAndOnChange(this._store);

	protected readonly _lineReplacementView = mapObservableArrayCached(this, this._uiState.map(s => s?.state.kind === 'lineReplacement' ? [s.state] : []), (e, store) => { // TODO: no need for map here, how can this be done with observables
		return store.add(this._instantiationService.createInstance(WordReplacementView, this._editorObs, e.edit, e.replacements));
	}).recomputeInitiallyAndOnChange(this._store);

	private readonly _useGutterIndicator = observableCodeEditor(this._editor).getOption(EditorOption.inlineSuggest).map(s => s.edits.experimental.useGutterIndicator);

	protected readonly _indicator = this._register(autorunWithStore((reader, store) => {
		if (this._useGutterIndicator.read(reader)) {
			store.add(this._instantiationService.createInstance(
				InlineEditsGutterIndicator,
				this._editorObs,
				this._uiState.map(s => s && s.originalDisplayRange),
				this._model,
				this._sideBySide.isHovered,
				this._focusIsInMenu,
			));
		} else {
			store.add(new InlineEditsIndicator(
				this._editorObs,
				derived<IInlineEditsIndicatorState | undefined>(reader => {
					const state = this._uiState.read(reader);
					if (!state) { return undefined; }
					const range = state.originalDisplayRange;
					const top = this._editor.getTopForLineNumber(range.startLineNumber) - this._editorObs.scrollTop.read(reader);
					return { editTop: top, showAlways: state.state.kind !== 'sideBySide' };
				}),
				this._model,
			));
		}
	}));

	private determineRenderState(edit: InlineEditWithChanges, reader: IReader, diff: DetailedLineRangeMapping[], newText: StringText) {
		if (edit.isCollapsed) {
			return { kind: 'collapsed' as const };
		}

		const inner = diff.flatMap(d => d.innerChanges ?? []);
		const isSingleInnerEdit = inner.length === 1;

		if (
			isSingleInnerEdit && (
				this._useMixedLinesDiff.read(reader) === 'forStableInsertions'
				&& isSingleLineInsertionAfterPosition(diff, edit.cursorPosition)
				|| isSingleLineDeletion(diff)
			)
		) {
			return { kind: 'ghostText' as const };
		}

		if (inner.every(m => newText.getValueOfRange(m.modifiedRange).trim() === '')) {
			const trimLength = getPrefixTrimLength(edit.originalText.getLineAt(edit.originalLineRange.startLineNumber), newText.getLineAt(edit.modifiedLineRange.startLineNumber));
			const widgetStartColumn = Math.min(trimLength, ...inner.map(m => m.originalRange.startLineNumber !== m.originalRange.endLineNumber ? 0 : m.originalRange.startColumn - 1));
			return { kind: 'deletion' as const, widgetStartColumn };
		}

		if (diff.length === 1 && diff[0].original.length === 1 && diff[0].modified.length === 1) {
			const canUseWordReplacementView = inner.every(m => (
				m.originalRange.isEmpty() && this._useWordInsertionView.read(reader) === 'whenPossible' ||
				!m.originalRange.isEmpty() && this._useWordReplacementView.read(reader) === 'whenPossible'
			));

			if (canUseWordReplacementView) {
				const allInnerModifiedTexts = inner.map(m => newText.getValueOfRange(m.modifiedRange));
				const allInnerOriginalTexts = inner.map(m => edit.originalText.getValueOfRange(m.originalRange));
				const allInnerEditsAreTheSame = allInnerModifiedTexts.every(text => text === allInnerModifiedTexts[0]) && allInnerOriginalTexts.every(text => text === allInnerOriginalTexts[0]);
				const allInnerChangesNotTooLong = inner.every(m => TextLength.ofRange(m.originalRange).columnCount < 100 && TextLength.ofRange(m.modifiedRange).columnCount < 100);

				if (allInnerChangesNotTooLong && isSingleInnerEdit && allInnerEditsAreTheSame) {
					return {
						kind: 'wordReplacements' as const,
						replacements: inner.map(i =>
							new SingleTextEdit(i.originalRange, allInnerModifiedTexts[0])
						)
					};
				} else {
					const replacements = inner.map((m, i) => new SingleTextEdit(m.originalRange, allInnerModifiedTexts[i]));

					const originalLine = edit.originalText.getLineAt(edit.originalLineRange.startLineNumber);
					const editedLine = newText.getLineAt(edit.modifiedLineRange.startLineNumber);
					const trimLength = Math.min(getPrefixTrimLength(originalLine, editedLine), replacements[0].range.startColumn - 1);

					const textEdit = edit.lineEdit.toSingleTextEdit(edit.originalText);
					const lineEdit = new SingleTextEdit(
						new Range(textEdit.range.startLineNumber, textEdit.range.startColumn + trimLength, textEdit.range.endLineNumber, textEdit.range.endColumn),
						textEdit.text.slice(trimLength)
					);

					return {
						kind: 'lineReplacement' as const,
						edit: lineEdit,
						replacements,
					};
				}
			}
		}

		if (
			(this._useMixedLinesDiff.read(reader) === 'whenPossible' || (edit.userJumpedToIt && this._useMixedLinesDiff.read(reader) === 'afterJumpWhenPossible'))
			&& diff.every(m => OriginalEditorInlineDiffView.supportsInlineDiffRendering(m))
		) {
			return { kind: 'mixedLines' as const };
		}

		if (this._useInterleavedLinesDiff.read(reader) === 'always' || (edit.userJumpedToIt && this._useInterleavedLinesDiff.read(reader) === 'afterJump')) {
			return { kind: 'interleavedLines' as const };
		}

		return { kind: 'sideBySide' as const };
	}
}

function isSingleLineInsertionAfterPosition(diff: DetailedLineRangeMapping[], position: Position | null) {
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

function isSingleLineDeletion(diff: DetailedLineRangeMapping[]): boolean {
	return diff.every(m => m.innerChanges!.every(r => isDeletion(r)));

	function isDeletion(r: RangeMapping) {
		if (!r.modifiedRange.isEmpty()) {
			return false;
		}
		const isDeletionWithinLine = r.originalRange.startLineNumber === r.originalRange.endLineNumber;
		if (!isDeletionWithinLine) {
			return false;
		}
		return true;
	}
}

function getPrefixTrimLength(originalLine: string, editedLine: string) {
	let startTrim = 0;
	while (originalLine[startTrim] === editedLine[startTrim] && (originalLine[startTrim] === ' ' || originalLine[startTrim] === '\t')) {
		startTrim++;
	}
	return startTrim;
}

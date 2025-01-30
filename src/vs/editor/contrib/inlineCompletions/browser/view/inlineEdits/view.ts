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
import { AbstractText, SingleTextEdit, StringText } from '../../../../../common/core/textEdit.js';
import { TextLength } from '../../../../../common/core/textLength.js';
import { DetailedLineRangeMapping, lineRangeMappingFromRangeMappings, RangeMapping } from '../../../../../common/diff/rangeMapping.js';
import { TextModel } from '../../../../../common/model/textModel.js';
import { InlineCompletionsModel } from '../../model/inlineCompletionsModel.js';
import { InlineEditsDeletionView } from './deletionView.js';
import { InlineEditsGutterIndicator } from './gutterIndicatorView.js';
import { IInlineEditsIndicatorState, InlineEditsIndicator } from './indicatorView.js';
import { IOriginalEditorInlineDiffViewState, OriginalEditorInlineDiffView } from './inlineDiffView.js';
import { InlineEditsInsertionView } from './insertionView.js';
import { InlineEditsSideBySideDiff } from './sideBySideDiff.js';
import { applyEditToModifiedRangeMappings, createReindentEdit } from './utils.js';
import './view.css';
import { InlineEditWithChanges } from './viewAndDiffProducer.js';
import { LineReplacementView, WordReplacementView } from './wordReplacementView.js';

export class InlineEditsView extends Disposable {
	private readonly _editorObs = observableCodeEditor(this._editor);

	private readonly _useMixedLinesDiff = observableCodeEditor(this._editor).getOption(EditorOption.inlineSuggest).map(s => s.edits.useMixedLinesDiff);
	private readonly _useInterleavedLinesDiff = observableCodeEditor(this._editor).getOption(EditorOption.inlineSuggest).map(s => s.edits.useInterleavedLinesDiff);
	private readonly _useCodeShifting = observableCodeEditor(this._editor).getOption(EditorOption.inlineSuggest).map(s => s.edits.codeShifting);
	private readonly _renderSideBySide = observableCodeEditor(this._editor).getOption(EditorOption.inlineSuggest).map(s => s.edits.renderSideBySide);
	private readonly _useMultiLineGhostText = observableCodeEditor(this._editor).getOption(EditorOption.inlineSuggest).map(s => s.edits.useMultiLineGhostText);

	private _previousView: {
		id: string;
		view: ReturnType<typeof InlineEditsView.prototype.determineView>;
		userJumpedToIt: boolean;
		editorWidth: number;
	} | undefined;

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
		if (!state) {
			this._model.get()?.stop();
			return undefined;
		}

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
		this._uiState.map(s => s && s.state?.kind === 'sideBySide' ? ({
			edit: s.edit,
			newTextLineCount: s.newTextLineCount,
			originalDisplayRange: s.originalDisplayRange,
		}) : undefined),
	));

	protected readonly _deletion = this._register(this._instantiationService.createInstance(InlineEditsDeletionView,
		this._editor,
		this._edit,
		this._uiState.map(s => s && s.state?.kind === 'deletion' ? ({
			originalRange: s.state.originalRange,
			deletions: s.state.deletions,
		}) : undefined),
	));

	protected readonly _insertion = this._register(this._instantiationService.createInstance(InlineEditsInsertionView,
		this._editor,
		this._uiState.map(s => s && s.state?.kind === 'insertionMultiLine' ? ({
			lineNumber: s.state.lineNumber,
			startColumn: s.state.column,
			text: s.state.text,
		}) : undefined),
	));

	private readonly _inlineDiffViewState = derived<IOriginalEditorInlineDiffViewState | undefined>(this, reader => {
		const e = this._uiState.read(reader);
		if (!e || !e.state) { return undefined; }
		if (e.state.kind === 'wordReplacements' || e.state.kind === 'lineReplacement' || e.state.kind === 'insertionMultiLine') {
			return undefined;
		}
		return {
			modifiedText: new StringText(e.newText),
			diff: e.diff,
			mode: e.state.kind === 'collapsed' ? 'sideBySide' : e.state.kind,
			modifiedCodeEditor: this._sideBySide.previewEditor,
		};
	});

	protected readonly _inlineDiffView = this._register(new OriginalEditorInlineDiffView(this._editor, this._inlineDiffViewState, this._previewTextModel));

	protected readonly _wordReplacementViews = mapObservableArrayCached(this, this._uiState.map(s => s?.state?.kind === 'wordReplacements' ? s.state.replacements : []), (e, store) => {
		return store.add(this._instantiationService.createInstance(WordReplacementView, this._editorObs, e, [e]));
	}).recomputeInitiallyAndOnChange(this._store);

	protected readonly _lineReplacementView = mapObservableArrayCached(this, this._uiState.map(s => s?.state?.kind === 'lineReplacement' ? [s.state] : []), (e, store) => { // TODO: no need for map here, how can this be done with observables
		return store.add(this._instantiationService.createInstance(LineReplacementView, this._editorObs, e.originalRange, e.modifiedRange, e.modifiedLines, e.replacements));
	}).recomputeInitiallyAndOnChange(this._store);

	private readonly _useGutterIndicator = observableCodeEditor(this._editor).getOption(EditorOption.inlineSuggest).map(s => s.edits.useGutterIndicator);

	private readonly _inlineEditsIsHovered = derived(this, reader => {
		return this._sideBySide.isHovered.read(reader)
			|| this._wordReplacementViews.read(reader).some(v => v.isHovered.read(reader))
			|| this._deletion.isHovered.read(reader)
			|| this._inlineDiffView.isHovered.read(reader)
			|| this._lineReplacementView.read(reader).some(v => v.isHovered.read(reader));
	});

	private readonly _gutterIndicatorOffset = derived<number>(this, reader => {
		// TODO: have a better way to tell the gutter indicator view where the edit is inside a viewzone
		if (this._uiState.read(reader)?.state?.kind === 'insertionMultiLine') {
			return this._insertion.startLineOffset.read(reader);
		}
		return 0;
	});

	private readonly _originalDisplayRange = derived(this, reader => {
		const state = this._uiState.read(reader);
		if (state?.state?.kind === 'insertionMultiLine') {
			return this._insertion.originalLines.read(reader);
		}
		return state?.originalDisplayRange;
	});

	protected readonly _indicator = this._register(autorunWithStore((reader, store) => {
		if (this._useGutterIndicator.read(reader)) {
			store.add(this._instantiationService.createInstance(
				InlineEditsGutterIndicator,
				this._editorObs,
				this._originalDisplayRange,
				this._gutterIndicatorOffset,
				this._model,
				this._inlineEditsIsHovered,
				this._focusIsInMenu,
			));
		} else {
			store.add(new InlineEditsIndicator(
				this._editorObs,
				derived<IInlineEditsIndicatorState | undefined>(reader => {
					const state = this._uiState.read(reader);
					const range = this._originalDisplayRange.read(reader);
					if (!state || !state.state || !range) { return undefined; }
					const top = this._editor.getTopForLineNumber(range.startLineNumber) - this._editorObs.scrollTop.read(reader) + this._gutterIndicatorOffset.read(reader);
					return { editTop: top, showAlways: state.state.kind !== 'sideBySide' };
				}),
				this._model,
			));
		}
	}));

	private determineView(edit: InlineEditWithChanges, reader: IReader, diff: DetailedLineRangeMapping[], newText: StringText): string {
		// Check if we can use the previous view if it is the same InlineCompletion as previously shown
		const canUseCache = this._previousView?.id === edit.inlineCompletion.id;
		const reconsiderViewAfterJump = edit.userJumpedToIt !== this._previousView?.userJumpedToIt &&
			(
				(this._useMixedLinesDiff.read(reader) === 'afterJumpWhenPossible' && this._previousView?.view !== 'mixedLines') ||
				(this._useInterleavedLinesDiff.read(reader) === 'afterJump' && this._previousView?.view !== 'interleavedLines')
			);
		const reconsiderViewEditorWidthChange = this._previousView?.editorWidth !== this._editor.getLayoutInfo().width &&
			(
				this._previousView?.view === 'sideBySide' ||
				this._previousView?.view === 'lineReplacement'
			);

		if (canUseCache && !reconsiderViewAfterJump && !reconsiderViewEditorWidthChange) {
			return this._previousView!.view;
		}

		// Determine the view based on the edit / diff

		if (edit.isCollapsed) {
			return 'collapsed';
		}

		const inner = diff.flatMap(d => d.innerChanges ?? []);
		const isSingleInnerEdit = inner.length === 1;
		if (
			isSingleInnerEdit && (
				this._useMixedLinesDiff.read(reader) === 'forStableInsertions'
				&& this._useCodeShifting.read(reader)
				&& isSingleLineInsertionAfterPosition(diff, edit.cursorPosition)
				|| isSingleLineDeletion(diff)
			)
		) {
			return 'insertionInline';
		}

		const innerValues = inner.map(m => ({ original: edit.originalText.getValueOfRange(m.originalRange), modified: newText.getValueOfRange(m.modifiedRange) }));
		if (innerValues.every(({ original, modified }) => modified.trim() === '' && original.length > 0 && (original.length > modified.length || original.trim() !== ''))) {
			return 'deletion';
		}

		if (isSingleMultiLineInsertion(diff) && this._useMultiLineGhostText.read(reader) && this._useCodeShifting.read(reader)) {
			return 'insertionMultiLine';
		}

		const numOriginalLines = edit.originalLineRange.length;
		const numModifiedLines = edit.modifiedLineRange.length;
		const allInnerChangesNotTooLong = inner.every(m => TextLength.ofRange(m.originalRange).columnCount < WordReplacementView.MAX_LENGTH && TextLength.ofRange(m.modifiedRange).columnCount < WordReplacementView.MAX_LENGTH);
		if (allInnerChangesNotTooLong && isSingleInnerEdit && numOriginalLines === 1 && numModifiedLines === 1) {
			// Make sure there is no insertion, even if we grow them
			if (
				!inner.some(m => m.originalRange.isEmpty()) ||
				!growEditsUntilWhitespace(inner.map(m => new SingleTextEdit(m.originalRange, '')), edit.originalText).some(e => e.range.isEmpty() && TextLength.ofRange(e.range).columnCount < WordReplacementView.MAX_LENGTH)
			) {
				return 'wordReplacements';
			}
		}

		if (numOriginalLines > 0 && numModifiedLines > 0) {
			if (this._renderSideBySide.read(reader) !== 'never' && InlineEditsSideBySideDiff.fitsInsideViewport(this._editor, edit, reader)) {
				return 'sideBySide';
			}

			return 'lineReplacement';
		}

		if (
			(this._useMixedLinesDiff.read(reader) === 'whenPossible' || (edit.userJumpedToIt && this._useMixedLinesDiff.read(reader) === 'afterJumpWhenPossible'))
			&& diff.every(m => OriginalEditorInlineDiffView.supportsInlineDiffRendering(m))
		) {
			return 'mixedLines';
		}

		if (this._useInterleavedLinesDiff.read(reader) === 'always' || (edit.userJumpedToIt && this._useInterleavedLinesDiff.read(reader) === 'afterJump')) {
			return 'interleavedLines';
		}

		return 'sideBySide';
	}

	private determineRenderState(edit: InlineEditWithChanges, reader: IReader, diff: DetailedLineRangeMapping[], newText: StringText) {

		const view = this.determineView(edit, reader, diff, newText);

		this._previousView = { id: edit.inlineCompletion.id, view, userJumpedToIt: edit.userJumpedToIt, editorWidth: this._editor.getLayoutInfo().width };

		switch (view) {
			case 'collapsed': return { kind: 'collapsed' as const };
			case 'insertionInline': return { kind: 'insertionInline' as const };
			case 'mixedLines': return { kind: 'mixedLines' as const };
			case 'interleavedLines': return { kind: 'interleavedLines' as const };
			case 'sideBySide': return { kind: 'sideBySide' as const };
		}

		const inner = diff.flatMap(d => d.innerChanges ?? []);

		if (view === 'deletion') {
			return {
				kind: 'deletion' as const,
				originalRange: edit.originalLineRange,
				deletions: inner.map(m => m.originalRange),
			};
		}

		if (view === 'insertionMultiLine') {
			const change = inner[0];
			return {
				kind: 'insertionMultiLine' as const,
				lineNumber: change.originalRange.startLineNumber,
				column: change.originalRange.startColumn,
				text: newText.getValueOfRange(change.modifiedRange),
			};
		}

		const replacements = inner.map(m => new SingleTextEdit(m.originalRange, newText.getValueOfRange(m.modifiedRange)));
		if (replacements.length === 0) {
			return undefined;
		}

		if (view === 'wordReplacements') {
			let grownEdits = growEditsToEntireWord(replacements, edit.originalText);

			if (grownEdits.some(e => e.range.isEmpty())) {
				grownEdits = growEditsUntilWhitespace(replacements, edit.originalText);
			}

			return {
				kind: 'wordReplacements' as const,
				replacements: grownEdits,
			};
		}

		if (view === 'lineReplacement') {
			return {
				kind: 'lineReplacement' as const,
				originalRange: edit.originalLineRange,
				modifiedRange: edit.modifiedLineRange,
				modifiedLines: edit.modifiedLineRange.mapToLineArray(line => newText.getLineAt(line)),
				replacements: inner.map(m => ({ originalRange: m.originalRange, modifiedRange: m.modifiedRange })),
			};
		}

		return undefined;
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

function isSingleMultiLineInsertion(diff: DetailedLineRangeMapping[]) {
	const inner = diff.flatMap(d => d.innerChanges ?? []);
	if (inner.length !== 1) {
		return false;
	}

	const change = inner[0];
	if (!change.originalRange.isEmpty()) {
		return false;
	}

	if (change.modifiedRange.startLineNumber === change.modifiedRange.endLineNumber) {
		return false;
	}

	return true;
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

function growEditsToEntireWord(replacements: SingleTextEdit[], originalText: AbstractText): SingleTextEdit[] {
	return _growEdits(replacements, originalText, (char) => /^[a-zA-Z]$/.test(char));
}

function growEditsUntilWhitespace(replacements: SingleTextEdit[], originalText: AbstractText): SingleTextEdit[] {
	return _growEdits(replacements, originalText, (char) => !(/^\s$/.test(char)));
}

function _growEdits(replacements: SingleTextEdit[], originalText: AbstractText, fn: (c: string) => boolean): SingleTextEdit[] {
	const result: SingleTextEdit[] = [];

	replacements.sort((a, b) => Range.compareRangesUsingStarts(a.range, b.range));

	for (const edit of replacements) {
		let startIndex = edit.range.startColumn - 1;
		let endIndex = edit.range.endColumn - 2;
		let prefix = '';
		let suffix = '';
		const startLineContent = originalText.getLineAt(edit.range.startLineNumber);
		const endLineContent = originalText.getLineAt(edit.range.endLineNumber);

		if (isIncluded(startLineContent[startIndex])) {
			// grow to the left
			while (isIncluded(startLineContent[startIndex - 1])) {
				prefix = startLineContent[startIndex - 1] + prefix;
				startIndex--;
			}
		}

		if (isIncluded(endLineContent[endIndex]) || endIndex < startIndex) {
			// grow to the right
			while (isIncluded(endLineContent[endIndex + 1])) {
				suffix += endLineContent[endIndex + 1];
				endIndex++;
			}
		}

		// create new edit and merge together if they are touching
		let newEdit = new SingleTextEdit(new Range(edit.range.startLineNumber, startIndex + 1, edit.range.endLineNumber, endIndex + 2), prefix + edit.text + suffix);
		if (result.length > 0 && Range.areIntersectingOrTouching(result[result.length - 1].range, newEdit.range)) {
			newEdit = SingleTextEdit.joinEdits([result.pop()!, newEdit], originalText);
		}

		result.push(newEdit);
	}

	function isIncluded(c: string | undefined) {
		if (c === undefined) {
			return false;
		}
		return fn(c);
	}

	return result;
}

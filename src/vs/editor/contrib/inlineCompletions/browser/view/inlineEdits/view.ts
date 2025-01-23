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
import { LineReplacementView, WordInsertView, WordReplacementView } from './wordReplacementView.js';

export class InlineEditsView extends Disposable {
	private readonly _editorObs = observableCodeEditor(this._editor);

	private readonly _useMixedLinesDiff = observableCodeEditor(this._editor).getOption(EditorOption.inlineSuggest).map(s => s.edits.experimental.useMixedLinesDiff);
	private readonly _useInterleavedLinesDiff = observableCodeEditor(this._editor).getOption(EditorOption.inlineSuggest).map(s => s.edits.experimental.useInterleavedLinesDiff);

	private _previousView: { id: string; view: ReturnType<typeof InlineEditsView.prototype.determineView>; userJumpedToIt: boolean } | undefined;

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
			edit: s.edit,
			originalDisplayRange: s.originalDisplayRange,
			widgetStartColumn: s.state.widgetStartColumn,
		}) : undefined),
	));

	private readonly _inlineDiffViewState = derived<IOriginalEditorInlineDiffViewState | undefined>(this, reader => {
		const e = this._uiState.read(reader);
		if (!e || !e.state) { return undefined; }
		if (e.state.kind === 'wordReplacements' || e.state.kind === 'lineReplacement') {
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
		if (e.range.isEmpty()) {
			return store.add(this._instantiationService.createInstance(WordInsertView, this._editorObs, e));
		} else {
			return store.add(this._instantiationService.createInstance(WordReplacementView, this._editorObs, e, [e]));
		}
	}).recomputeInitiallyAndOnChange(this._store);

	protected readonly _lineReplacementView = mapObservableArrayCached(this, this._uiState.map(s => s?.state?.kind === 'lineReplacement' ? [s.state] : []), (e, store) => { // TODO: no need for map here, how can this be done with observables
		return store.add(this._instantiationService.createInstance(LineReplacementView, this._editorObs, e.originalRange, e.modifiedRange, e.modifiedLines, e.replacements));
	}).recomputeInitiallyAndOnChange(this._store);

	private readonly _useGutterIndicator = observableCodeEditor(this._editor).getOption(EditorOption.inlineSuggest).map(s => s.edits.experimental.useGutterIndicator);

	private readonly _inlineEditsIsHovered = derived(this, reader => {
		return this._sideBySide.isHovered.read(reader)
			|| this._wordReplacementViews.read(reader).some(v => v.isHovered.read(reader))
			|| this._deletion.isHovered.read(reader)
			|| this._inlineDiffView.isHovered.read(reader)
			|| this._lineReplacementView.read(reader).some(v => v.isHovered.read(reader));
	});

	protected readonly _indicator = this._register(autorunWithStore((reader, store) => {
		if (this._useGutterIndicator.read(reader)) {
			store.add(this._instantiationService.createInstance(
				InlineEditsGutterIndicator,
				this._editorObs,
				this._uiState.map(s => s && s.originalDisplayRange),
				this._model,
				this._inlineEditsIsHovered,
				this._focusIsInMenu,
			));
		} else {
			store.add(new InlineEditsIndicator(
				this._editorObs,
				derived<IInlineEditsIndicatorState | undefined>(reader => {
					const state = this._uiState.read(reader);
					if (!state || !state.state) { return undefined; }
					const range = state.originalDisplayRange;
					const top = this._editor.getTopForLineNumber(range.startLineNumber) - this._editorObs.scrollTop.read(reader);
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

		if (canUseCache && !reconsiderViewAfterJump) {
			return this._previousView!.view;
		}

		if (edit.isCollapsed) {
			return 'collapsed';
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
			return 'ghostText';
		}

		if (inner.every(m => newText.getValueOfRange(m.modifiedRange).trim() === '')) {
			return 'deletion';
		}

		const numOriginalLines = edit.originalLineRange.length;
		const numModifiedLines = edit.modifiedLineRange.length;
		const allInnerChangesNotTooLong = inner.every(m => TextLength.ofRange(m.originalRange).columnCount < 100 && TextLength.ofRange(m.modifiedRange).columnCount < 100);
		if (allInnerChangesNotTooLong && isSingleInnerEdit && numOriginalLines === 1 && numModifiedLines === 1) {
			return 'wordReplacements';
		} else if (numOriginalLines > 0 && numModifiedLines > 0) {
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
		this._previousView = { id: edit.inlineCompletion.id, view, userJumpedToIt: edit.userJumpedToIt };

		switch (view) {
			case 'collapsed': return { kind: 'collapsed' as const };
			case 'ghostText': return { kind: 'ghostText' as const };
			case 'mixedLines': return { kind: 'mixedLines' as const };
			case 'interleavedLines': return { kind: 'interleavedLines' as const };
			case 'sideBySide': return { kind: 'sideBySide' as const };
		}

		const inner = diff.flatMap(d => d.innerChanges ?? []);

		if (view === 'deletion') {
			const trimLength = getPrefixTrimLength(edit, inner, newText);
			const widgetStartColumn = Math.min(trimLength, ...inner.map(m => m.originalRange.startLineNumber !== m.originalRange.endLineNumber ? 0 : m.originalRange.startColumn - 1));
			return { kind: 'deletion' as const, widgetStartColumn };
		}

		const replacements = inner.map(m => new SingleTextEdit(m.originalRange, newText.getValueOfRange(m.modifiedRange)));
		if (replacements.length === 0) {
			return undefined;
		}

		if (view === 'wordReplacements') {
			return {
				kind: 'wordReplacements' as const,
				replacements
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

function getPrefixTrimLength(edit: InlineEditWithChanges, innerChanges: RangeMapping[], newText: StringText) {
	if (innerChanges.some(m => m.originalRange.startLineNumber !== m.originalRange.endLineNumber)) {
		return 0;
	}

	let minTrimLength = Number.MAX_SAFE_INTEGER;
	for (let i = 0; i < edit.originalLineRange.length; i++) {
		const lineNumber = edit.originalLineRange.startLineNumber + i;
		const originalLine = edit.originalText.getLineAt(lineNumber);
		const editedLine = newText.getLineAt(lineNumber);
		const trimLength = getLinePrefixTrimLength(originalLine, editedLine);
		minTrimLength = Math.min(minTrimLength, trimLength);
	}

	return Math.min(minTrimLength, ...innerChanges.map(m => m.originalRange.startColumn - 1));

	function getLinePrefixTrimLength(originalLine: string, editedLine: string) {
		let startTrim = 0;
		while (originalLine[startTrim] === editedLine[startTrim] && (originalLine[startTrim] === ' ' || originalLine[startTrim] === '\t')) {
			startTrim++;
		}
		return startTrim;
	}
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equalsIfDefined, itemEquals } from '../../../../../../base/common/equals.js';
import { Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { autorunWithStore, derived, derivedObservableWithCache, derivedOpts, derivedWithStore, IObservable, IReader, ISettableObservable, mapObservableArrayCached, observableValue } from '../../../../../../base/common/observable.js';
import { localize } from '../../../../../../nls.js';
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
import { InlineEditsGutterIndicator } from './components/gutterIndicatorView.js';
import { IInlineEditsIndicatorState, InlineEditsIndicator } from './components/indicatorView.js';
import { InlineEditWithChanges } from './inlineEditWithChanges.js';
import { IInlineEditsViewHost } from './inlineEditsViewInterface.js';
import { InlineEditsDeletionView } from './inlineEditsViews/inlineEditsDeletionView.js';
import { InlineEditsInsertionView } from './inlineEditsViews/inlineEditsInsertionView.js';
import { InlineEditsLineReplacementView } from './inlineEditsViews/inlineEditsLineReplacementView.js';
import { InlineEditsSideBySideView } from './inlineEditsViews/inlineEditsSideBySideView.js';
import { InlineEditsWordReplacementView } from './inlineEditsViews/inlineEditsWordReplacementView.js';
import { IOriginalEditorInlineDiffViewState, OriginalEditorInlineDiffView } from './inlineEditsViews/originalEditorInlineDiffView.js';
import { applyEditToModifiedRangeMappings, createReindentEdit, InlineEditTabAction } from './utils/utils.js';
import './view.css';

export class InlineEditsView extends Disposable {
	private readonly _editorObs = observableCodeEditor(this._editor);

	private readonly _useMixedLinesDiff = this._editorObs.getOption(EditorOption.inlineSuggest).map(s => s.edits.useMixedLinesDiff);
	private readonly _useInterleavedLinesDiff = this._editorObs.getOption(EditorOption.inlineSuggest).map(s => s.edits.useInterleavedLinesDiff);
	private readonly _useCodeShifting = this._editorObs.getOption(EditorOption.inlineSuggest).map(s => s.edits.codeShifting);
	private readonly _renderSideBySide = this._editorObs.getOption(EditorOption.inlineSuggest).map(s => s.edits.renderSideBySide);
	private readonly _showCollapsed = this._editorObs.getOption(EditorOption.inlineSuggest).map(s => s.edits.showCollapsed);
	private readonly _useMultiLineGhostText = this._editorObs.getOption(EditorOption.inlineSuggest).map(s => s.edits.useMultiLineGhostText);

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

		this._register(autorunWithStore((reader, store) => {
			store.add(
				Event.any(
					this._sideBySide.onDidClick,
					this._deletion.onDidClick,
					this._lineReplacementView.onDidClick,
					this._insertion.onDidClick,
					...this._wordReplacementViews.read(reader).map(w => w.onDidClick),
					this._inlineDiffView.onDidClick,
				)(e => {
					e.preventDefault();
					this._host.accept();
				})
			);
		}));

		this._indicator.recomputeInitiallyAndOnChange(this._store);
		this._wordReplacementViews.recomputeInitiallyAndOnChange(this._store);

		this._indicatorCyclicDependencyCircuitBreaker.set(true, undefined);
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

		this._model.get()?.handleInlineEditShown(edit.inlineCompletion);

		let mappings = RangeMapping.fromEdit(edit.edit);
		let newText = edit.edit.apply(edit.originalText);
		let diff = lineRangeMappingFromRangeMappings(mappings, edit.originalText, new StringText(newText));

		const originalDisplayRange = edit.originalText.lineRange.intersect(
			edit.originalLineRange.join(
				LineRange.ofLength(edit.originalLineRange.startLineNumber, edit.lineEdit.newLines.length)
			)
		)!;

		let state = this.determineRenderState(edit, reader, diff, new StringText(newText), originalDisplayRange);
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

		this._previewTextModel.setLanguage(this._editor.getModel()!.getLanguageId());

		const previousNewText = this._previewTextModel.getValue();
		if (previousNewText !== newText) {
			// Only update the model if the text has changed to avoid flickering
			this._previewTextModel.setValue(newText);
		}

		if (this._showCollapsed.read(reader) && this._host.tabAction.read(reader) !== InlineEditTabAction.Accept && !this._indicator.read(reader)?.isHoverVisible.read(reader) && !this._model.get()!.inAcceptFlow.read(reader)) {
			state = { kind: 'hidden' };
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

	// TODO: This has become messy, should it be passed in to the InlineEditsView? Maybe include in accept flow?
	private readonly _host: IInlineEditsViewHost = {
		displayName: derivedObservableWithCache<string>(this, (reader, previousDisplayName) => {
			const state = this._model.read(reader)?.inlineEditState;
			const item = state?.read(reader);
			const completionSource = item?.inlineCompletion?.source;
			// TODO: expose the provider (typed) and expose the provider the edit belongs to typing and get correct edit
			return (completionSource?.inlineCompletions as any)?.edits?.[0]?.provider?.displayName ?? previousDisplayName
				?? completionSource?.provider.displayName ?? localize('inlineEdit', "Inline Edit");
		}),
		tabAction: derived<InlineEditTabAction>(this, reader => {
			const m = this._model.read(reader);
			if (this._editorObs.isFocused.read(reader)) {
				if (m && m.tabShouldJumpToInlineEdit.read(reader)) { return InlineEditTabAction.Jump; }
				if (m && m.tabShouldAcceptInlineEdit.read(reader)) { return InlineEditTabAction.Accept; }
				if (m && m.inlineCompletionState.read(reader)?.inlineCompletion?.sourceInlineCompletion.showInlineEditMenu) { return InlineEditTabAction.Accept; }
			}
			return InlineEditTabAction.Inactive;
		}),
		action: this._model.map((m, r) => m?.state.read(r)?.inlineCompletion?.inlineCompletion.action),
		extensionCommands: this._model.map((m, r) => m?.state.read(r)?.inlineCompletion?.source.inlineCompletions.commands ?? []),
		accept: () => {
			this._model.get()?.accept();
		},
		jump: () => {
			this._model.get()?.jump();
		}
	};

	private readonly _useGutterIndicator = observableCodeEditor(this._editor).getOption(EditorOption.inlineSuggest).map(s => s.edits.useGutterIndicator);

	private readonly _indicatorCyclicDependencyCircuitBreaker = observableValue(this, false);

	protected readonly _indicator = derivedWithStore<InlineEditsGutterIndicator | InlineEditsIndicator | undefined>(this, (reader, store) => {
		if (!this._indicatorCyclicDependencyCircuitBreaker.read(reader)) {
			return undefined;
		}

		const indicatorDisplayRange = derivedOpts({ owner: this, equalsFn: equalsIfDefined(itemEquals()) }, reader => {
			const s = this._model.read(reader)?.inlineCompletionState.read(reader);
			if (s && s.inlineCompletion?.sourceInlineCompletion.showInlineEditMenu) {
				return LineRange.ofLength(s.primaryGhostText.lineNumber, 1);
			}

			const state = this._uiState.read(reader);
			if (state?.state?.kind === 'insertionMultiLine') {
				return this._insertion.originalLines.read(reader);
			}
			return state?.originalDisplayRange;
		});

		if (this._useGutterIndicator.read(reader)) {
			return store.add(this._instantiationService.createInstance(
				InlineEditsGutterIndicator,
				this._editorObs,
				indicatorDisplayRange,
				this._gutterIndicatorOffset,
				this._host,
				this._inlineEditsIsHovered,
				this._focusIsInMenu,
			));
		} else {
			return store.add(new InlineEditsIndicator(
				this._editorObs,
				derived<IInlineEditsIndicatorState | undefined>(reader => {
					const state = this._uiState.read(reader);
					const range = indicatorDisplayRange.read(reader);
					if (!state || !state.state || !range) { return undefined; }
					const top = this._editor.getTopForLineNumber(range.startLineNumber) - this._editorObs.scrollTop.read(reader) + this._gutterIndicatorOffset.read(reader);
					return { editTop: top, showAlways: state.state.kind !== 'sideBySide' };
				}),
				this._model,
			));
		}
	});

	private readonly _inlineEditsIsHovered = derived(this, reader => {
		return this._sideBySide.isHovered.read(reader)
			|| this._wordReplacementViews.read(reader).some(v => v.isHovered.read(reader))
			|| this._deletion.isHovered.read(reader)
			|| this._inlineDiffView.isHovered.read(reader)
			|| this._lineReplacementView.isHovered.read(reader)
			|| this._insertion.isHovered.read(reader);
	});

	private readonly _gutterIndicatorOffset = derived<number>(this, reader => {
		// TODO: have a better way to tell the gutter indicator view where the edit is inside a viewzone
		if (this._uiState.read(reader)?.state?.kind === 'insertionMultiLine') {
			return this._insertion.startLineOffset.read(reader);
		}
		return 0;
	});

	private readonly _sideBySide = this._register(this._instantiationService.createInstance(InlineEditsSideBySideView,
		this._editor,
		this._edit,
		this._previewTextModel,
		this._uiState.map(s => s && s.state?.kind === 'sideBySide' ? ({
			edit: s.edit,
			newTextLineCount: s.newTextLineCount,
			originalDisplayRange: s.originalDisplayRange,
		}) : undefined),
		this._host,
	));

	protected readonly _deletion = this._register(this._instantiationService.createInstance(InlineEditsDeletionView,
		this._editor,
		this._edit,
		this._uiState.map(s => s && s.state?.kind === 'deletion' ? ({
			originalRange: s.state.originalRange,
			deletions: s.state.deletions,
		}) : undefined),
		this._host,
	));

	protected readonly _insertion = this._register(this._instantiationService.createInstance(InlineEditsInsertionView,
		this._editor,
		this._uiState.map(s => s && s.state?.kind === 'insertionMultiLine' ? ({
			lineNumber: s.state.lineNumber,
			startColumn: s.state.column,
			text: s.state.text,
		}) : undefined),
		this._host,
	));

	private readonly _inlineDiffViewState = derived<IOriginalEditorInlineDiffViewState | undefined>(this, reader => {
		const e = this._uiState.read(reader);
		if (!e || !e.state) { return undefined; }
		if (e.state.kind === 'wordReplacements' || e.state.kind === 'lineReplacement' || e.state.kind === 'insertionMultiLine' || e.state.kind === 'hidden') {
			return undefined;
		}
		return {
			modifiedText: new StringText(e.newText),
			diff: e.diff,
			mode: e.state.kind,
			modifiedCodeEditor: this._sideBySide.previewEditor,
		};
	});

	protected readonly _inlineDiffView = this._register(new OriginalEditorInlineDiffView(this._editor, this._inlineDiffViewState, this._previewTextModel));

	protected readonly _wordReplacementViews = mapObservableArrayCached(this, this._uiState.map(s => s?.state?.kind === 'wordReplacements' ? s.state.replacements : []), (e, store) => {
		return store.add(this._instantiationService.createInstance(InlineEditsWordReplacementView, this._editorObs, e, [e], this._host));
	});

	protected readonly _lineReplacementView = this._register(this._instantiationService.createInstance(InlineEditsLineReplacementView,
		this._editorObs,
		this._uiState.map(s => s?.state?.kind === 'lineReplacement' ? ({
			originalRange: s.state.originalRange,
			modifiedRange: s.state.modifiedRange,
			modifiedLines: s.state.modifiedLines,
			replacements: s.state.replacements,
		}) : undefined),
		this._host
	));

	private getCacheId(edit: InlineEditWithChanges) {
		if (this._model.get()?.inAcceptPartialFlow.get()) {
			return `${edit.inlineCompletion.id}_${edit.edit.edits.map(edit => edit.range.toString() + edit.text).join(',')}`;
		}

		return edit.inlineCompletion.id;
	}

	private determineView(edit: InlineEditWithChanges, reader: IReader, diff: DetailedLineRangeMapping[], newText: StringText, originalDisplayRange: LineRange): string {
		// Check if we can use the previous view if it is the same InlineCompletion as previously shown
		const canUseCache = this._previousView?.id === this.getCacheId(edit);
		const reconsiderViewAfterJump = edit.userJumpedToIt !== this._previousView?.userJumpedToIt &&
			(
				(this._useMixedLinesDiff.read(reader) === 'afterJumpWhenPossible' && this._previousView?.view !== 'mixedLines') ||
				(this._useInterleavedLinesDiff.read(reader) === 'afterJump' && this._previousView?.view !== 'interleavedLines')
			);
		const reconsiderViewEditorWidthChange = this._previousView?.editorWidth !== this._editorObs.layoutInfoWidth.read(reader) &&
			(
				this._previousView?.view === 'sideBySide' ||
				this._previousView?.view === 'lineReplacement'
			);

		if (canUseCache && !reconsiderViewAfterJump && !reconsiderViewEditorWidthChange) {
			return this._previousView!.view;
		}

		// Determine the view based on the edit / diff

		const inner = diff.flatMap(d => d.innerChanges ?? []);
		const isSingleInnerEdit = inner.length === 1;
		if (
			isSingleInnerEdit && (
				this._useMixedLinesDiff.read(reader) === 'forStableInsertions'
				&& this._useCodeShifting.read(reader)
				&& isSingleLineInsertionAfterPosition(diff, edit.cursorPosition)
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
		const allInnerChangesNotTooLong = inner.every(m => TextLength.ofRange(m.originalRange).columnCount < InlineEditsWordReplacementView.MAX_LENGTH && TextLength.ofRange(m.modifiedRange).columnCount < InlineEditsWordReplacementView.MAX_LENGTH);
		if (allInnerChangesNotTooLong && isSingleInnerEdit && numOriginalLines === 1 && numModifiedLines === 1) {
			// Make sure there is no insertion, even if we grow them
			if (
				!inner.some(m => m.originalRange.isEmpty()) ||
				!growEditsUntilWhitespace(inner.map(m => new SingleTextEdit(m.originalRange, '')), edit.originalText).some(e => e.range.isEmpty() && TextLength.ofRange(e.range).columnCount < InlineEditsWordReplacementView.MAX_LENGTH)
			) {
				return 'wordReplacements';
			}
		}
		if (numOriginalLines > 0 && numModifiedLines > 0) {
			if (this._renderSideBySide.read(reader) !== 'never' && InlineEditsSideBySideView.fitsInsideViewport(this._editor, edit, originalDisplayRange, reader)) {
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

	private determineRenderState(edit: InlineEditWithChanges, reader: IReader, diff: DetailedLineRangeMapping[], newText: StringText, originalDisplayRange: LineRange) {

		const view = this.determineView(edit, reader, diff, newText, originalDisplayRange);

		this._previousView = { id: this.getCacheId(edit), view, userJumpedToIt: edit.userJumpedToIt, editorWidth: this._editor.getLayoutInfo().width };

		switch (view) {
			case 'insertionInline': return { kind: 'insertionInline' as const };
			case 'mixedLines': return { kind: 'mixedLines' as const };
			case 'interleavedLines': return { kind: 'interleavedLines' as const };
			case 'sideBySide': return { kind: 'sideBySide' as const };
			case 'hidden': return { kind: 'hidden' as const };
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

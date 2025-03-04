/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equalsIfDefined, itemEquals } from '../../../../../../base/common/equals.js';
import { BugIndicatingError } from '../../../../../../base/common/errors.js';
import { Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { autorunWithStore, derived, derivedOpts, derivedWithStore, IObservable, IReader, ISettableObservable, mapObservableArrayCached, observableValue } from '../../../../../../base/common/observable.js';
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
import { InlineEditsGutterIndicator } from './components/gutterIndicatorView.js';
import { InlineEditsIndicator } from './components/indicatorView.js';
import { InlineEditWithChanges } from './inlineEditWithChanges.js';
import { GhostTextIndicator, InlineEditModel } from './inlineEditsModel.js';
import { IInlineEditModel, InlineEditTabAction } from './inlineEditsViewInterface.js';
import { InlineEditsDeletionView } from './inlineEditsViews/inlineEditsDeletionView.js';
import { InlineEditsInsertionView } from './inlineEditsViews/inlineEditsInsertionView.js';
import { InlineEditsLineReplacementView } from './inlineEditsViews/inlineEditsLineReplacementView.js';
import { InlineEditsSideBySideView } from './inlineEditsViews/inlineEditsSideBySideView.js';
import { InlineEditsWordReplacementView } from './inlineEditsViews/inlineEditsWordReplacementView.js';
import { IOriginalEditorInlineDiffViewState, OriginalEditorInlineDiffView } from './inlineEditsViews/originalEditorInlineDiffView.js';
import { applyEditToModifiedRangeMappings, createReindentEdit } from './utils/utils.js';
import './view.css';

export class InlineEditsView extends Disposable {
	private readonly _editorObs = observableCodeEditor(this._editor);

	private readonly _useMixedLinesDiff = this._editorObs.getOption(EditorOption.inlineSuggest).map(s => s.edits.useMixedLinesDiff);
	private readonly _useInterleavedLinesDiff = this._editorObs.getOption(EditorOption.inlineSuggest).map(s => s.edits.useInterleavedLinesDiff);
	private readonly _useCodeShifting = this._editorObs.getOption(EditorOption.inlineSuggest).map(s => s.edits.codeShifting);
	private readonly _renderSideBySide = this._editorObs.getOption(EditorOption.inlineSuggest).map(s => s.edits.renderSideBySide);
	private readonly _showCollapsed = this._editorObs.getOption(EditorOption.inlineSuggest).map(s => s.edits.showCollapsed);
	private readonly _useMultiLineGhostText = this._editorObs.getOption(EditorOption.inlineSuggest).map(s => s.edits.useMultiLineGhostText);

	private readonly _tabAction = derived<InlineEditTabAction>(reader => this._model.read(reader)?.tabAction.read(reader) ?? InlineEditTabAction.Inactive);

	private _previousView: {
		id: string;
		view: ReturnType<typeof InlineEditsView.prototype.determineView>;
		userJumpedToIt: boolean;
		editorWidth: number;
		timestamp: number;
	} | undefined;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _model: IObservable<InlineEditModel | undefined>,
		private readonly _ghostTextIndicator: IObservable<GhostTextIndicator | undefined>,
		private readonly _focusIsInMenu: ISettableObservable<boolean>,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		this._register(autorunWithStore((reader, store) => {
			const model = this._model.read(reader);
			if (!model) {
				return;
			}

			store.add(
				Event.any(
					this._sideBySide.onDidClick,
					this._deletion.onDidClick,
					this._lineReplacementView.onDidClick,
					this._insertion.onDidClick,
					...this._wordReplacementViews.read(reader).map(w => w.onDidClick),
					this._inlineDiffView.onDidClick,
				)(e => {
					if (this._viewHasBeenShownLongerThan(350)) {
						e.preventDefault();
						model.accept();
					}
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
		const model = this._model.read(reader);
		if (!model) {
			return undefined;
		}

		model.handleInlineEditShown();

		const inlineEdit = model.inlineEdit;
		let mappings = RangeMapping.fromEdit(inlineEdit.edit);
		let newText = inlineEdit.edit.apply(inlineEdit.originalText);
		let diff = lineRangeMappingFromRangeMappings(mappings, inlineEdit.originalText, new StringText(newText));

		const originalDisplayRange = inlineEdit.originalText.lineRange.intersect(
			inlineEdit.originalLineRange.join(
				LineRange.ofLength(inlineEdit.originalLineRange.startLineNumber, inlineEdit.lineEdit.newLines.length)
			)
		)!;

		let state = this.determineRenderState(model, reader, diff, new StringText(newText), originalDisplayRange);
		if (!state) {
			model.abort(`unable to determine view: tried to render ${this._previousView?.view}`);
			return undefined;
		}

		if (state.kind === 'sideBySide') {
			const indentationAdjustmentEdit = createReindentEdit(newText, inlineEdit.modifiedLineRange);
			newText = indentationAdjustmentEdit.applyToString(newText);

			mappings = applyEditToModifiedRangeMappings(mappings, indentationAdjustmentEdit);
			diff = lineRangeMappingFromRangeMappings(mappings, inlineEdit.originalText, new StringText(newText));
		}

		this._previewTextModel.setLanguage(this._editor.getModel()!.getLanguageId());

		const previousNewText = this._previewTextModel.getValue();
		if (previousNewText !== newText) {
			// Only update the model if the text has changed to avoid flickering
			this._previewTextModel.setValue(newText);
		}

		if (this._showCollapsed.read(reader) && model.tabAction.read(reader) !== InlineEditTabAction.Accept && !this._indicator.read(reader)?.isHoverVisible.read(reader) && !model.inAcceptFlow.read(reader)) {
			state = { kind: 'hidden' };
		}

		return {
			state,
			diff,
			edit: inlineEdit,
			newText,
			newTextLineCount: inlineEdit.modifiedLineRange.length,
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

	private readonly _indicatorCyclicDependencyCircuitBreaker = observableValue(this, false);

	protected readonly _indicator = derivedWithStore<InlineEditsGutterIndicator | InlineEditsIndicator | undefined>(this, (reader, store) => {
		if (!this._indicatorCyclicDependencyCircuitBreaker.read(reader)) {
			return undefined;
		}

		const indicatorDisplayRange = derivedOpts({ owner: this, equalsFn: equalsIfDefined(itemEquals()) }, reader => {
			const ghostTextIndicator = this._ghostTextIndicator.read(reader);
			if (ghostTextIndicator) {
				return ghostTextIndicator.lineRange;
			}

			const state = this._uiState.read(reader);
			if (state?.state?.kind === 'insertionMultiLine') {
				return this._insertion.originalLines.read(reader);
			}
			return state?.originalDisplayRange;
		});

		const modelWithGhostTextSupport = derived<InlineEditModel | undefined>(this, reader => {
			const model = this._model.read(reader);
			if (model) {
				return model;
			}

			const ghostTextIndicator = this._ghostTextIndicator.read(reader);
			if (ghostTextIndicator) {
				return ghostTextIndicator.model;
			}

			return model;
		});

		return store.add(this._instantiationService.createInstance(
			InlineEditsGutterIndicator,
			this._editorObs,
			indicatorDisplayRange,
			this._gutterIndicatorOffset,
			modelWithGhostTextSupport,
			this._inlineEditsIsHovered,
			this._focusIsInMenu,
		));
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
		this._model.map(m => m?.inlineEdit),
		this._previewTextModel,
		this._uiState.map(s => s && s.state?.kind === 'sideBySide' ? ({
			edit: s.edit,
			newTextLineCount: s.newTextLineCount,
			originalDisplayRange: s.originalDisplayRange,
		}) : undefined),
		this._tabAction,
	));

	protected readonly _deletion = this._register(this._instantiationService.createInstance(InlineEditsDeletionView,
		this._editor,
		this._model.map(m => m?.inlineEdit),
		this._uiState.map(s => s && s.state?.kind === 'deletion' ? ({
			originalRange: s.state.originalRange,
			deletions: s.state.deletions,
		}) : undefined),
		this._tabAction,
	));

	protected readonly _insertion = this._register(this._instantiationService.createInstance(InlineEditsInsertionView,
		this._editor,
		this._uiState.map(s => s && s.state?.kind === 'insertionMultiLine' ? ({
			lineNumber: s.state.lineNumber,
			startColumn: s.state.column,
			text: s.state.text,
		}) : undefined),
		this._tabAction,
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
		return store.add(this._instantiationService.createInstance(InlineEditsWordReplacementView, this._editorObs, e, [e], this._tabAction));
	});

	protected readonly _lineReplacementView = this._register(this._instantiationService.createInstance(InlineEditsLineReplacementView,
		this._editorObs,
		this._uiState.map(s => s?.state?.kind === 'lineReplacement' ? ({
			originalRange: s.state.originalRange,
			modifiedRange: s.state.modifiedRange,
			modifiedLines: s.state.modifiedLines,
			replacements: s.state.replacements,
		}) : undefined),
		this._tabAction,
	));

	private getCacheId(model: IInlineEditModel) {
		const inlineEdit = model.inlineEdit;
		if (model.inPartialAcceptFlow.get()) {
			return `${inlineEdit.inlineCompletion.id}_${inlineEdit.edit.edits.map(innerEdit => innerEdit.range.toString() + innerEdit.text).join(',')}`;
		}

		return inlineEdit.inlineCompletion.id;
	}

	private determineView(model: IInlineEditModel, reader: IReader, diff: DetailedLineRangeMapping[], newText: StringText, originalDisplayRange: LineRange): string {
		// Check if we can use the previous view if it is the same InlineCompletion as previously shown
		const inlineEdit = model.inlineEdit;
		const canUseCache = this._previousView?.id === this.getCacheId(model);
		const reconsiderViewAfterJump = inlineEdit.userJumpedToIt !== this._previousView?.userJumpedToIt &&
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
				&& isSingleLineInsertionAfterPosition(diff, inlineEdit.cursorPosition)
			)
		) {
			return 'insertionInline';
		}

		const innerValues = inner.map(m => ({ original: inlineEdit.originalText.getValueOfRange(m.originalRange), modified: newText.getValueOfRange(m.modifiedRange) }));
		if (innerValues.every(({ original, modified }) => modified.trim() === '' && original.length > 0 && (original.length > modified.length || original.trim() !== ''))) {
			return 'deletion';
		}

		if (isSingleMultiLineInsertion(diff) && this._useMultiLineGhostText.read(reader) && this._useCodeShifting.read(reader)) {
			return 'insertionMultiLine';
		}

		const numOriginalLines = inlineEdit.originalLineRange.length;
		const numModifiedLines = inlineEdit.modifiedLineRange.length;
		const allInnerChangesNotTooLong = inner.every(m => TextLength.ofRange(m.originalRange).columnCount < InlineEditsWordReplacementView.MAX_LENGTH && TextLength.ofRange(m.modifiedRange).columnCount < InlineEditsWordReplacementView.MAX_LENGTH);
		if (allInnerChangesNotTooLong && isSingleInnerEdit && numOriginalLines === 1 && numModifiedLines === 1) {
			// Make sure there is no insertion, even if we grow them
			if (
				!inner.some(m => m.originalRange.isEmpty()) ||
				!growEditsUntilWhitespace(inner.map(m => new SingleTextEdit(m.originalRange, '')), inlineEdit.originalText).some(e => e.range.isEmpty() && TextLength.ofRange(e.range).columnCount < InlineEditsWordReplacementView.MAX_LENGTH)
			) {
				return 'wordReplacements';
			}
		}
		if (numOriginalLines > 0 && numModifiedLines > 0) {
			if (this._renderSideBySide.read(reader) !== 'never' && InlineEditsSideBySideView.fitsInsideViewport(this._editor, inlineEdit, originalDisplayRange, reader)) {
				return 'sideBySide';
			}

			return 'lineReplacement';
		}

		if (
			(this._useMixedLinesDiff.read(reader) === 'whenPossible' || (inlineEdit.userJumpedToIt && this._useMixedLinesDiff.read(reader) === 'afterJumpWhenPossible'))
			&& diff.every(m => OriginalEditorInlineDiffView.supportsInlineDiffRendering(m))
		) {
			return 'mixedLines';
		}

		if (this._useInterleavedLinesDiff.read(reader) === 'always' || (inlineEdit.userJumpedToIt && this._useInterleavedLinesDiff.read(reader) === 'afterJump')) {
			return 'interleavedLines';
		}

		return 'sideBySide';
	}

	private determineRenderState(model: IInlineEditModel, reader: IReader, diff: DetailedLineRangeMapping[], newText: StringText, originalDisplayRange: LineRange) {
		const inlineEdit = model.inlineEdit;

		const view = this.determineView(model, reader, diff, newText, originalDisplayRange);

		this._previousView = { id: this.getCacheId(model), view, userJumpedToIt: inlineEdit.userJumpedToIt, editorWidth: this._editor.getLayoutInfo().width, timestamp: Date.now() };

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
				originalRange: inlineEdit.originalLineRange,
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
			let grownEdits = growEditsToEntireWord(replacements, inlineEdit.originalText);

			if (grownEdits.some(e => e.range.isEmpty())) {
				grownEdits = growEditsUntilWhitespace(replacements, inlineEdit.originalText);
			}

			return {
				kind: 'wordReplacements' as const,
				replacements: grownEdits,
			};
		}

		if (view === 'lineReplacement') {
			return {
				kind: 'lineReplacement' as const,
				originalRange: inlineEdit.originalLineRange,
				modifiedRange: inlineEdit.modifiedLineRange,
				modifiedLines: inlineEdit.modifiedLineRange.mapToLineArray(line => newText.getLineAt(line)),
				replacements: inner.map(m => ({ originalRange: m.originalRange, modifiedRange: m.modifiedRange })),
			};
		}

		return undefined;
	}

	private _viewHasBeenShownLongerThan(durationMs: number): boolean {
		const viewCreationTime = this._previousView?.timestamp;
		if (!viewCreationTime) {
			throw new BugIndicatingError('viewHasBeenShownLongThan called before a view has been shown');
		}

		const currentTime = Date.now();
		return (currentTime - viewCreationTime) >= durationMs;
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

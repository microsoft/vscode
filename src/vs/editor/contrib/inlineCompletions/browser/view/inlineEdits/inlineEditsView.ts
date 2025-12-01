/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../../../base/browser/dom.js';
import { itemsEquals } from '../../../../../../base/common/equals.js';
import { BugIndicatingError, onUnexpectedError } from '../../../../../../base/common/errors.js';
import { Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, derived, derivedOpts, IObservable, IReader, mapObservableArrayCached, observableValue } from '../../../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ICodeEditor } from '../../../../../browser/editorBrowser.js';
import { ObservableCodeEditor, observableCodeEditor } from '../../../../../browser/observableCodeEditor.js';
import { EditorOption } from '../../../../../common/config/editorOptions.js';
import { TextReplacement } from '../../../../../common/core/edits/textEdit.js';
import { Position } from '../../../../../common/core/position.js';
import { Range } from '../../../../../common/core/range.js';
import { LineRange } from '../../../../../common/core/ranges/lineRange.js';
import { AbstractText, StringText } from '../../../../../common/core/text/abstractText.js';
import { TextLength } from '../../../../../common/core/text/textLength.js';
import { DetailedLineRangeMapping, lineRangeMappingFromRangeMappings, RangeMapping } from '../../../../../common/diff/rangeMapping.js';
import { ITextModel } from '../../../../../common/model.js';
import { TextModel } from '../../../../../common/model/textModel.js';
import { InlineSuggestionIdentity } from '../../model/inlineSuggestionItem.js';
import { InlineSuggestionGutterMenuData, SimpleInlineSuggestModel } from './components/gutterIndicatorView.js';
import { InlineEditWithChanges } from './inlineEditWithChanges.js';
import { ModelPerInlineEdit } from './inlineEditsModel.js';
import { InlineCompletionViewData, InlineCompletionViewKind, InlineEditTabAction } from './inlineEditsViewInterface.js';
import { InlineEditsCollapsedView } from './inlineEditsViews/inlineEditsCollapsedView.js';
import { InlineEditsCustomView } from './inlineEditsViews/inlineEditsCustomView.js';
import { InlineEditsDeletionView } from './inlineEditsViews/inlineEditsDeletionView.js';
import { InlineEditsInsertionView } from './inlineEditsViews/inlineEditsInsertionView.js';
import { InlineEditsLineReplacementView } from './inlineEditsViews/inlineEditsLineReplacementView.js';
import { ILongDistanceHint, ILongDistanceViewState, InlineEditsLongDistanceHint } from './inlineEditsViews/longDistanceHint/inlineEditsLongDistanceHint.js';
import { InlineEditsSideBySideView } from './inlineEditsViews/inlineEditsSideBySideView.js';
import { InlineEditsWordReplacementView, WordReplacementsViewData } from './inlineEditsViews/inlineEditsWordReplacementView.js';
import { IOriginalEditorInlineDiffViewState, OriginalEditorInlineDiffView } from './inlineEditsViews/originalEditorInlineDiffView.js';
import { applyEditToModifiedRangeMappings, createReindentEdit } from './utils/utils.js';
import './view.css';
import { JumpToView } from './inlineEditsViews/jumpToView.js';
import { StringEdit } from '../../../../../common/core/edits/stringEdit.js';
import { OffsetRange } from '../../../../../common/core/ranges/offsetRange.js';
import { getPositionOffsetTransformerFromTextModel } from '../../../../../common/core/text/getPositionOffsetTransformerFromTextModel.js';

export class InlineEditsView extends Disposable {
	private readonly _editorObs: ObservableCodeEditor;

	private readonly _useCodeShifting;
	private readonly _renderSideBySide;
	private readonly _tabAction = derived<InlineEditTabAction>(reader => this._model.read(reader)?.tabAction.read(reader) ?? InlineEditTabAction.Inactive);

	private _previousView: { // TODO, move into identity
		id: string;
		view: ReturnType<typeof InlineEditsView.prototype._determineView>;
		editorWidth: number;
		timestamp: number;
	} | undefined;
	private readonly _showLongDistanceHint: IObservable<boolean>;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _model: IObservable<ModelPerInlineEdit | undefined>,
		private readonly _simpleModel: IObservable<SimpleInlineSuggestModel | undefined>,
		private readonly _inlineSuggestInfo: IObservable<InlineSuggestionGutterMenuData | undefined>,
		private readonly _showCollapsed: IObservable<boolean>,

		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		super();
		this._editorObs = observableCodeEditor(this._editor);
		this._constructorDone = observableValue(this, false);

		this._previewTextModel = this._register(this._instantiationService.createInstance(
			TextModel,
			'',
			this._editor.getModel()!.getLanguageId(),
			{ ...TextModel.DEFAULT_CREATION_OPTIONS, bracketPairColorizationOptions: { enabled: true, independentColorPoolPerBracketType: false } },
			null
		));

		this._sideBySide = this._register(this._instantiationService.createInstance(InlineEditsSideBySideView,
			this._editor,
			this._model.map(m => m?.inlineEdit),
			this._previewTextModel,
			this._uiState.map(s => s && s.state?.kind === InlineCompletionViewKind.SideBySide ? ({
				newTextLineCount: s.newTextLineCount,
				isInDiffEditor: s.isInDiffEditor,
			}) : undefined),
			this._tabAction,
		));
		this._deletion = this._register(this._instantiationService.createInstance(InlineEditsDeletionView,
			this._editor,
			this._model.map(m => m?.inlineEdit),
			this._uiState.map(s => s && s.state?.kind === InlineCompletionViewKind.Deletion ? ({
				originalRange: s.state.originalRange,
				deletions: s.state.deletions,
				inDiffEditor: s.isInDiffEditor,
			}) : undefined),
			this._tabAction,
		));
		this._insertion = this._register(this._instantiationService.createInstance(InlineEditsInsertionView,
			this._editor,
			this._uiState.map(s => s && s.state?.kind === InlineCompletionViewKind.InsertionMultiLine ? ({
				lineNumber: s.state.lineNumber,
				startColumn: s.state.column,
				text: s.state.text,
				inDiffEditor: s.isInDiffEditor,
			}) : undefined),
			this._tabAction,
		));

		this._inlineCollapsedView = this._register(this._instantiationService.createInstance(InlineEditsCollapsedView,
			this._editor,
			this._model.map((m, reader) => this._uiState.read(reader)?.state?.kind === InlineCompletionViewKind.Collapsed ? m?.inlineEdit : undefined)
		));
		this._customView = this._register(this._instantiationService.createInstance(InlineEditsCustomView,
			this._editor,
			this._model.map((m, reader) => this._uiState.read(reader)?.state?.kind === InlineCompletionViewKind.Custom ? m?.displayLocation : undefined),
			this._tabAction,
		));

		this._showLongDistanceHint = this._editorObs.getOption(EditorOption.inlineSuggest).map(this, s => s.edits.showLongDistanceHint);
		this._longDistanceHint = derived(this, reader => {
			if (!this._showLongDistanceHint.read(reader)) {
				return undefined;
			}
			return reader.store.add(this._instantiationService.createInstance(InlineEditsLongDistanceHint,
				this._editor,
				this._uiState.map<ILongDistanceViewState | undefined>((s, reader) => s?.longDistanceHint ? ({
					hint: s.longDistanceHint,
					newTextLineCount: s.newTextLineCount,
					edit: s.edit,
					diff: s.diff,
					model: this._simpleModel.read(reader)!,
					inlineSuggestInfo: this._inlineSuggestInfo.read(reader)!,
					nextCursorPosition: s.nextCursorPosition,
				}) : undefined),
				this._previewTextModel,
				this._tabAction,
			));
		}).recomputeInitiallyAndOnChange(this._store);


		this._inlineDiffViewState = derived<IOriginalEditorInlineDiffViewState | undefined>(this, reader => {
			const e = this._uiState.read(reader);
			if (!e || !e.state) { return undefined; }
			if (e.state.kind === 'wordReplacements' || e.state.kind === 'insertionMultiLine' || e.state.kind === 'collapsed' || e.state.kind === 'custom' || e.state.kind === 'jumpTo') {
				return undefined;
			}
			return {
				modifiedText: new StringText(e.newText),
				diff: e.diff,
				mode: e.state.kind,
				modifiedCodeEditor: this._sideBySide.previewEditor,
				isInDiffEditor: e.isInDiffEditor,
			};
		});
		this._inlineDiffView = this._register(new OriginalEditorInlineDiffView(this._editor, this._inlineDiffViewState, this._previewTextModel));
		this._jumpToView = this._register(this._instantiationService.createInstance(JumpToView, this._editorObs, { style: 'label' }, derived(reader => {
			const s = this._uiState.read(reader);
			if (s?.state?.kind === InlineCompletionViewKind.JumpTo) {
				return { jumpToPosition: s.state.position };
			}
			return undefined;
		})));
		const wordReplacements = derivedOpts({
			equalsFn: itemsEquals<WordReplacementsViewData>((a, b) => a.equals(b))
		}, reader => {
			const s = this._uiState.read(reader);
			return s?.state?.kind === InlineCompletionViewKind.WordReplacements ? s.state.replacements.map(replacement => new WordReplacementsViewData(replacement, s.state?.alternativeAction)) : [];
		});
		this._wordReplacementViews = mapObservableArrayCached(this, wordReplacements, (viewData, store) => {
			return store.add(this._instantiationService.createInstance(InlineEditsWordReplacementView, this._editorObs, viewData, this._tabAction));
		});
		this._lineReplacementView = this._register(this._instantiationService.createInstance(InlineEditsLineReplacementView,
			this._editorObs,
			this._uiState.map(s => s?.state?.kind === InlineCompletionViewKind.LineReplacement ? ({
				originalRange: s.state.originalRange,
				modifiedRange: s.state.modifiedRange,
				modifiedLines: s.state.modifiedLines,
				replacements: s.state.replacements,
			}) : undefined),
			this._uiState.map(s => s?.isInDiffEditor ?? false),
			this._tabAction,
		));

		this._useCodeShifting = this._editorObs.getOption(EditorOption.inlineSuggest).map(s => s.edits.allowCodeShifting);
		this._renderSideBySide = this._editorObs.getOption(EditorOption.inlineSuggest).map(s => s.edits.renderSideBySide);

		this._register(autorun((reader) => {
			const model = this._model.read(reader);
			if (!model) {
				return;
			}
			reader.store.add(
				Event.any(
					this._sideBySide.onDidClick,
					this._lineReplacementView.onDidClick,
					this._insertion.onDidClick,
					...this._wordReplacementViews.read(reader).map(w => w.onDidClick),
					this._inlineDiffView.onDidClick,
					this._customView.onDidClick,
				)(clickEvent => {
					if (this._viewHasBeenShownLongerThan(350)) {
						clickEvent.event.preventDefault();
						model.accept(clickEvent.alternativeAction);
					}
				})
			);
		}));

		this._wordReplacementViews.recomputeInitiallyAndOnChange(this._store);

		const minEditorScrollHeight = derived(this, reader => {
			return Math.max(
				...this._wordReplacementViews.read(reader).map(v => v.minEditorScrollHeight.read(reader)),
				this._lineReplacementView.minEditorScrollHeight.read(reader),
				this._customView.minEditorScrollHeight.read(reader)
			);
		}).recomputeInitiallyAndOnChange(this._store);

		let viewZoneId: string | undefined;
		this._register(autorun(reader => {
			const minScrollHeight = minEditorScrollHeight.read(reader);
			const textModel = this._editorObs.model.read(reader);
			if (!textModel) { return; }

			this._editor.changeViewZones(accessor => {
				const scrollHeight = this._editor.getScrollHeight();
				const viewZoneHeight = minScrollHeight - scrollHeight + 1 /* Add 1px so there is a small gap */;

				if (viewZoneHeight !== 0 && viewZoneId !== undefined) {
					accessor.removeZone(viewZoneId);
					viewZoneId = undefined;
				}

				if (viewZoneHeight <= 0) {
					return;
				}

				viewZoneId = accessor.addZone({
					afterLineNumber: textModel.getLineCount(),
					heightInPx: viewZoneHeight,
					domNode: $('div.minScrollHeightViewZone'),
				});
			});
		}));

		this._constructorDone.set(true, undefined); // TODO: remove and use correct initialization order
	}

	public readonly displayRange = derived<LineRange | undefined>(this, reader => {
		const state = this._uiState.read(reader);
		if (!state) { return undefined; }
		if (state.state?.kind === 'custom') {
			const range = state.state.displayLocation?.range;
			if (!range) {
				throw new BugIndicatingError('custom view should have a range');
			}
			return new LineRange(range.startLineNumber, range.endLineNumber);
		}

		if (state.state?.kind === 'insertionMultiLine') {
			return this._insertion.originalLines.read(reader);
		}

		return state.edit.displayRange;
	});


	private _currentInlineEditCache: {
		inlineSuggestionIdentity: InlineSuggestionIdentity;
		firstCursorLineNumber: number;
	} | undefined = undefined;

	private _getLongDistanceHintState(model: ModelPerInlineEdit, reader: IReader): ILongDistanceHint | undefined {
		if (model.inlineEdit.inlineCompletion.identity.jumpedTo.read(reader)) {
			return undefined;
		}
		if (model.inlineEdit.action === undefined) {
			return undefined;
		}
		if (this._currentInlineEditCache?.inlineSuggestionIdentity !== model.inlineEdit.inlineCompletion.identity) {
			this._currentInlineEditCache = {
				inlineSuggestionIdentity: model.inlineEdit.inlineCompletion.identity,
				firstCursorLineNumber: model.inlineEdit.cursorPosition.lineNumber,
			};
		}
		return {
			lineNumber: this._currentInlineEditCache.firstCursorLineNumber,
			isVisible: !model.inViewPort.read(reader),
		};
	}

	private readonly _constructorDone;

	private readonly _uiState = derived<{
		state: ReturnType<typeof InlineEditsView.prototype._determineRenderState>;
		diff: DetailedLineRangeMapping[];
		edit: InlineEditWithChanges;
		newText: string;
		newTextLineCount: number;
		isInDiffEditor: boolean;
		longDistanceHint: ILongDistanceHint | undefined;
		nextCursorPosition: Position | null;
	} | undefined>(this, reader => {
		const model = this._model.read(reader);
		const textModel = this._editorObs.model.read(reader);
		if (!model || !textModel || !this._constructorDone.read(reader)) {
			return undefined;
		}

		const inlineEdit = model.inlineEdit;
		let diff: DetailedLineRangeMapping[];
		let mappings: RangeMapping[];

		let newText: AbstractText | undefined = undefined;

		if (inlineEdit.edit) {
			mappings = RangeMapping.fromEdit(inlineEdit.edit);
			newText = new StringText(inlineEdit.edit.apply(inlineEdit.originalText));
			diff = lineRangeMappingFromRangeMappings(mappings, inlineEdit.originalText, newText);
		} else {
			mappings = [];
			diff = [];
			newText = inlineEdit.originalText;
		}


		let state = this._determineRenderState(model, reader, diff, newText);
		if (!state) {
			onUnexpectedError(new Error(`unable to determine view: tried to render ${this._previousView?.view}`));
			return undefined;
		}

		const longDistanceHint = this._getLongDistanceHintState(model, reader);

		if (longDistanceHint && longDistanceHint.isVisible) {
			state.viewData.setLongDistanceViewData(longDistanceHint.lineNumber, inlineEdit.lineEdit.lineRange.startLineNumber);
		}

		if (state.kind === InlineCompletionViewKind.SideBySide) {
			const indentationAdjustmentEdit = createReindentEdit(newText.getValue(), inlineEdit.modifiedLineRange, textModel.getOptions().tabSize);
			newText = new StringText(indentationAdjustmentEdit.applyToString(newText.getValue()));

			mappings = applyEditToModifiedRangeMappings(mappings, indentationAdjustmentEdit);
			diff = lineRangeMappingFromRangeMappings(mappings, inlineEdit.originalText, newText);
		}

		const tm = this._editorObs.model.read(reader);
		if (!tm) {
			return undefined;
		}
		this._previewTextModel.setLanguage(tm.getLanguageId());

		const previousNewText = this._previewTextModel.getValue();
		if (previousNewText !== newText.getValue()) {
			this._previewTextModel.setEOL(tm.getEndOfLineSequence());
			const updateOldValueEdit = StringEdit.replace(new OffsetRange(0, previousNewText.length), newText.getValue());
			const updateOldValueEditSmall = updateOldValueEdit.removeCommonSuffixPrefix(previousNewText);

			const textEdit = getPositionOffsetTransformerFromTextModel(this._previewTextModel).getTextEdit(updateOldValueEditSmall);
			this._previewTextModel.edit(textEdit);
		}

		if (this._showCollapsed.read(reader)) {
			state = { kind: InlineCompletionViewKind.Collapsed as const, viewData: state.viewData };
		}

		model.handleInlineEditShownNextFrame(state.kind, state.viewData);

		const nextCursorPosition = inlineEdit.action?.kind === 'jumpTo' ? inlineEdit.action.position : null;

		return {
			state,
			diff,
			edit: inlineEdit,
			newText: newText.getValue(),
			newTextLineCount: inlineEdit.modifiedLineRange.length,
			isInDiffEditor: model.isInDiffEditor,
			longDistanceHint,
			nextCursorPosition: nextCursorPosition,
		};
	});

	private readonly _previewTextModel;


	public readonly inlineEditsIsHovered = derived(this, reader => {
		return this._sideBySide.isHovered.read(reader)
			|| this._wordReplacementViews.read(reader).some(v => v.isHovered.read(reader))
			|| this._deletion.isHovered.read(reader)
			|| this._inlineDiffView.isHovered.read(reader)
			|| this._lineReplacementView.isHovered.read(reader)
			|| this._insertion.isHovered.read(reader)
			|| this._customView.isHovered.read(reader)
			|| this._longDistanceHint.map((v, r) => v?.isHovered.read(r) ?? false).read(reader);
	});

	private readonly _sideBySide;

	protected readonly _deletion;

	protected readonly _insertion;

	private readonly _inlineDiffViewState;

	public readonly _inlineCollapsedView;

	private readonly _customView;
	protected readonly _longDistanceHint;

	protected readonly _inlineDiffView;

	protected readonly _wordReplacementViews;

	protected readonly _lineReplacementView;

	protected readonly _jumpToView;

	public readonly gutterIndicatorOffset = derived<number>(this, reader => {
		// TODO: have a better way to tell the gutter indicator view where the edit is inside a viewzone
		if (this._uiState.read(reader)?.state?.kind === 'insertionMultiLine') {
			return this._insertion.startLineOffset.read(reader);
		}
		return 0;
	});

	private _getCacheId(model: ModelPerInlineEdit) {
		return model.inlineEdit.inlineCompletion.identity.id;
	}

	private _determineView(model: ModelPerInlineEdit, reader: IReader, diff: DetailedLineRangeMapping[], newText: AbstractText): InlineCompletionViewKind {
		// Check if we can use the previous view if it is the same InlineCompletion as previously shown
		const inlineEdit = model.inlineEdit;
		const canUseCache = this._previousView?.id === this._getCacheId(model);
		const reconsiderViewEditorWidthChange = this._previousView?.editorWidth !== this._editorObs.layoutInfoWidth.read(reader) &&
			(
				this._previousView?.view === InlineCompletionViewKind.SideBySide ||
				this._previousView?.view === InlineCompletionViewKind.LineReplacement
			);

		if (canUseCache && !reconsiderViewEditorWidthChange) {
			return this._previousView!.view;
		}

		const action = model.inlineEdit.inlineCompletion.action;
		if (action?.kind === 'edit' && action.alternativeAction) {
			return InlineCompletionViewKind.WordReplacements;
		}

		const uri = action?.kind === 'edit' ? action.uri : undefined;
		if (uri !== undefined) {
			return InlineCompletionViewKind.Custom;
		}

		if (model.displayLocation && !model.inlineEdit.inlineCompletion.identity.jumpedTo.read(reader)) {
			return InlineCompletionViewKind.Custom;
		}

		// Determine the view based on the edit / diff

		const numOriginalLines = inlineEdit.originalLineRange.length;
		const numModifiedLines = inlineEdit.modifiedLineRange.length;
		const inner = diff.flatMap(d => d.innerChanges ?? []);
		const isSingleInnerEdit = inner.length === 1;

		if (!model.isInDiffEditor) {
			if (
				isSingleInnerEdit
				&& this._useCodeShifting.read(reader) !== 'never'
				&& isSingleLineInsertion(diff)
			) {
				if (isSingleLineInsertionAfterPosition(diff, inlineEdit.cursorPosition)) {
					return InlineCompletionViewKind.InsertionInline;
				}

				// If we have a single line insertion before the cursor position, we do not want to move the cursor by inserting
				// the suggestion inline. Use a line replacement view instead. Do not use word replacement view.
				return InlineCompletionViewKind.LineReplacement;
			}

			if (isDeletion(inner, inlineEdit, newText)) {
				return InlineCompletionViewKind.Deletion;
			}

			if (isSingleMultiLineInsertion(diff) && this._useCodeShifting.read(reader) === 'always') {
				return InlineCompletionViewKind.InsertionMultiLine;
			}

			const allInnerChangesNotTooLong = inner.every(m => TextLength.ofRange(m.originalRange).columnCount < InlineEditsWordReplacementView.MAX_LENGTH && TextLength.ofRange(m.modifiedRange).columnCount < InlineEditsWordReplacementView.MAX_LENGTH);
			if (allInnerChangesNotTooLong && isSingleInnerEdit && numOriginalLines === 1 && numModifiedLines === 1) {
				// Do not show indentation changes with word replacement view
				const modifiedText = inner.map(m => newText.getValueOfRange(m.modifiedRange));
				const originalText = inner.map(m => model.inlineEdit.originalText.getValueOfRange(m.originalRange));
				if (!modifiedText.some(v => v.includes('\t')) && !originalText.some(v => v.includes('\t'))) {
					// Make sure there is no insertion, even if we grow them
					if (
						!inner.some(m => m.originalRange.isEmpty()) ||
						!growEditsUntilWhitespace(inner.map(m => new TextReplacement(m.originalRange, '')), inlineEdit.originalText).some(e => e.range.isEmpty() && TextLength.ofRange(e.range).columnCount < InlineEditsWordReplacementView.MAX_LENGTH)
					) {
						return InlineCompletionViewKind.WordReplacements;
					}
				}
			}
		}

		if (numOriginalLines > 0 && numModifiedLines > 0) {
			if (numOriginalLines === 1 && numModifiedLines === 1 && !model.isInDiffEditor /* prefer side by side in diff editor */) {
				return InlineCompletionViewKind.LineReplacement;
			}

			if (this._renderSideBySide.read(reader) !== 'never' && InlineEditsSideBySideView.fitsInsideViewport(this._editor, this._previewTextModel, inlineEdit, reader)) {
				return InlineCompletionViewKind.SideBySide;
			}

			return InlineCompletionViewKind.LineReplacement;
		}

		if (model.isInDiffEditor) {
			if (isDeletion(inner, inlineEdit, newText)) {
				return InlineCompletionViewKind.Deletion;
			}

			if (isSingleMultiLineInsertion(diff) && this._useCodeShifting.read(reader) === 'always') {
				return InlineCompletionViewKind.InsertionMultiLine;
			}
		}

		return InlineCompletionViewKind.SideBySide;
	}

	private _determineRenderState(model: ModelPerInlineEdit, reader: IReader, diff: DetailedLineRangeMapping[], newText: AbstractText) {
		if (model.inlineEdit.action?.kind === 'jumpTo') {
			return {
				kind: InlineCompletionViewKind.JumpTo as const,
				position: model.inlineEdit.action.position,
				viewData: emptyViewData,
			};
		}

		const inlineEdit = model.inlineEdit;

		let view = this._determineView(model, reader, diff, newText);
		if (this._willRenderAboveCursor(reader, inlineEdit, view)) {
			switch (view) {
				case InlineCompletionViewKind.LineReplacement:
				case InlineCompletionViewKind.WordReplacements:
					view = InlineCompletionViewKind.SideBySide;
					break;
			}
		}
		this._previousView = { id: this._getCacheId(model), view, editorWidth: this._editor.getLayoutInfo().width, timestamp: Date.now() };

		const inner = diff.flatMap(d => d.innerChanges ?? []);
		const textModel = this._editor.getModel()!;
		const stringChanges = inner.map(m => ({
			originalRange: m.originalRange,
			modifiedRange: m.modifiedRange,
			original: textModel.getValueInRange(m.originalRange),
			modified: newText.getValueOfRange(m.modifiedRange)
		}));

		const viewData = getViewData(inlineEdit, stringChanges, textModel);

		switch (view) {
			case InlineCompletionViewKind.InsertionInline: return { kind: InlineCompletionViewKind.InsertionInline as const, viewData };
			case InlineCompletionViewKind.SideBySide: return { kind: InlineCompletionViewKind.SideBySide as const, viewData };
			case InlineCompletionViewKind.Collapsed: return { kind: InlineCompletionViewKind.Collapsed as const, viewData };
			case InlineCompletionViewKind.Custom: return { kind: InlineCompletionViewKind.Custom as const, displayLocation: model.displayLocation, viewData };
		}

		if (view === InlineCompletionViewKind.Deletion) {
			return {
				kind: InlineCompletionViewKind.Deletion as const,
				originalRange: inlineEdit.originalLineRange,
				deletions: inner.map(m => m.originalRange),
				viewData,
			};
		}

		if (view === InlineCompletionViewKind.InsertionMultiLine) {
			const change = inner[0];
			return {
				kind: InlineCompletionViewKind.InsertionMultiLine as const,
				lineNumber: change.originalRange.startLineNumber,
				column: change.originalRange.startColumn,
				text: newText.getValueOfRange(change.modifiedRange),
				viewData,
			};
		}

		const replacements = stringChanges.map(m => new TextReplacement(m.originalRange, m.modified));
		if (replacements.length === 0) {
			return undefined;
		}

		if (view === InlineCompletionViewKind.WordReplacements) {
			let grownEdits = growEditsToEntireWord(replacements, inlineEdit.originalText);
			if (grownEdits.some(e => e.range.isEmpty())) {
				grownEdits = growEditsUntilWhitespace(replacements, inlineEdit.originalText);
			}

			return {
				kind: InlineCompletionViewKind.WordReplacements as const,
				replacements: grownEdits,
				alternativeAction: model.inlineEdit.action?.alternativeAction,
				viewData,
			};
		}

		if (view === InlineCompletionViewKind.LineReplacement) {
			return {
				kind: InlineCompletionViewKind.LineReplacement as const,
				originalRange: inlineEdit.originalLineRange,
				modifiedRange: inlineEdit.modifiedLineRange,
				modifiedLines: inlineEdit.modifiedLineRange.mapToLineArray(line => newText.getLineAt(line)),
				replacements: inner.map(m => ({ originalRange: m.originalRange, modifiedRange: m.modifiedRange })),
				viewData,
			};
		}

		return undefined;
	}

	private _willRenderAboveCursor(reader: IReader, inlineEdit: InlineEditWithChanges, view: InlineCompletionViewKind): boolean {
		const useCodeShifting = this._useCodeShifting.read(reader);
		if (useCodeShifting === 'always') {
			return false;
		}

		for (const cursorPosition of inlineEdit.multiCursorPositions) {
			if (view === InlineCompletionViewKind.WordReplacements &&
				cursorPosition.lineNumber === inlineEdit.originalLineRange.startLineNumber + 1
			) {
				return true;
			}

			if (view === InlineCompletionViewKind.LineReplacement &&
				cursorPosition.lineNumber >= inlineEdit.originalLineRange.endLineNumberExclusive &&
				cursorPosition.lineNumber < inlineEdit.modifiedLineRange.endLineNumberExclusive + inlineEdit.modifiedLineRange.length
			) {
				return true;
			}
		}

		return false;
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

const emptyViewData = new InlineCompletionViewData(-1, -1, -1, -1, -1, -1, -1, true);
function getViewData(inlineEdit: InlineEditWithChanges, stringChanges: { originalRange: Range; modifiedRange: Range; original: string; modified: string }[], textModel: ITextModel) {
	if (!inlineEdit.edit) {
		return emptyViewData;
	}

	const cursorPosition = inlineEdit.cursorPosition;
	const startsWithEOL = stringChanges.length === 0 ? false : stringChanges[0].modified.startsWith(textModel.getEOL());
	const viewData = new InlineCompletionViewData(
		inlineEdit.edit.replacements.length === 0 ? 0 : inlineEdit.edit.replacements[0].range.getStartPosition().column - cursorPosition.column,
		inlineEdit.lineEdit.lineRange.startLineNumber - cursorPosition.lineNumber + (startsWithEOL && inlineEdit.lineEdit.lineRange.startLineNumber >= cursorPosition.lineNumber ? 1 : 0),
		inlineEdit.lineEdit.lineRange.length,
		inlineEdit.lineEdit.newLines.length,
		stringChanges.reduce((acc, r) => acc + r.original.length, 0),
		stringChanges.reduce((acc, r) => acc + r.modified.length, 0),
		stringChanges.length,
		stringChanges.every(r => r.original === stringChanges[0].original && r.modified === stringChanges[0].modified)
	);
	return viewData;
}

function isSingleLineInsertion(diff: DetailedLineRangeMapping[]) {
	return diff.every(m => m.innerChanges!.every(r => isWordInsertion(r)));

	function isWordInsertion(r: RangeMapping) {
		if (!r.originalRange.isEmpty()) {
			return false;
		}
		const isInsertionWithinLine = r.modifiedRange.startLineNumber === r.modifiedRange.endLineNumber;
		if (!isInsertionWithinLine) {
			return false;
		}
		return true;
	}
}

function isSingleLineInsertionAfterPosition(diff: DetailedLineRangeMapping[], position: Position | null) {
	if (!position) {
		return false;
	}

	if (!isSingleLineInsertion(diff)) {
		return false;
	}

	const pos = position;

	return diff.every(m => m.innerChanges!.every(r => isStableWordInsertion(r)));

	function isStableWordInsertion(r: RangeMapping) {
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

function isDeletion(inner: RangeMapping[], inlineEdit: InlineEditWithChanges, newText: AbstractText) {
	const innerValues = inner.map(m => ({ original: inlineEdit.originalText.getValueOfRange(m.originalRange), modified: newText.getValueOfRange(m.modifiedRange) }));
	return innerValues.every(({ original, modified }) => modified.trim() === '' && original.length > 0 && (original.length > modified.length || original.trim() !== ''));
}

function growEditsToEntireWord(replacements: TextReplacement[], originalText: AbstractText): TextReplacement[] {
	return _growEdits(replacements, originalText, (char) => /^[a-zA-Z]$/.test(char));
}

function growEditsUntilWhitespace(replacements: TextReplacement[], originalText: AbstractText): TextReplacement[] {
	return _growEdits(replacements, originalText, (char) => !(/^\s$/.test(char)));
}

function _growEdits(replacements: TextReplacement[], originalText: AbstractText, fn: (c: string) => boolean): TextReplacement[] {
	const result: TextReplacement[] = [];

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
		let newEdit = new TextReplacement(new Range(edit.range.startLineNumber, startIndex + 1, edit.range.endLineNumber, endIndex + 2), prefix + edit.text + suffix);
		if (result.length > 0 && Range.areIntersectingOrTouching(result[result.length - 1].range, newEdit.range)) {
			newEdit = TextReplacement.joinReplacements([result.pop()!, newEdit], originalText);
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

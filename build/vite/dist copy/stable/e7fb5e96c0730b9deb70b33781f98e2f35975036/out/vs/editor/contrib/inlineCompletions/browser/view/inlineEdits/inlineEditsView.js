/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var InlineEditsView_1;
import { $ } from '../../../../../../base/browser/dom.js';
import { equals } from '../../../../../../base/common/equals.js';
import { BugIndicatingError, onUnexpectedError } from '../../../../../../base/common/errors.js';
import { Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, derived, derivedOpts, mapObservableArrayCached, observableValue } from '../../../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { observableCodeEditor } from '../../../../../browser/observableCodeEditor.js';
import { TextReplacement } from '../../../../../common/core/edits/textEdit.js';
import { Range } from '../../../../../common/core/range.js';
import { LineRange } from '../../../../../common/core/ranges/lineRange.js';
import { StringText } from '../../../../../common/core/text/abstractText.js';
import { TextLength } from '../../../../../common/core/text/textLength.js';
import { lineRangeMappingFromRangeMappings, RangeMapping } from '../../../../../common/diff/rangeMapping.js';
import { TextModel } from '../../../../../common/model/textModel.js';
import { InlineCompletionViewData, InlineCompletionViewKind, InlineEditTabAction } from './inlineEditsViewInterface.js';
import { InlineEditsCollapsedView } from './inlineEditsViews/inlineEditsCollapsedView.js';
import { InlineEditsCustomView } from './inlineEditsViews/inlineEditsCustomView.js';
import { InlineEditsDeletionView } from './inlineEditsViews/inlineEditsDeletionView.js';
import { InlineEditsInsertionView } from './inlineEditsViews/inlineEditsInsertionView.js';
import { InlineEditsLineReplacementView } from './inlineEditsViews/inlineEditsLineReplacementView.js';
import { InlineEditsLongDistanceHint } from './inlineEditsViews/longDistanceHint/inlineEditsLongDistanceHint.js';
import { InlineEditsSideBySideView } from './inlineEditsViews/inlineEditsSideBySideView.js';
import { InlineEditsWordReplacementView, WordReplacementsViewData } from './inlineEditsViews/inlineEditsWordReplacementView.js';
import { OriginalEditorInlineDiffView } from './inlineEditsViews/originalEditorInlineDiffView.js';
import { applyEditToModifiedRangeMappings, createReindentEdit } from './utils/utils.js';
import './view.css';
import { JumpToView } from './inlineEditsViews/jumpToView.js';
import { StringEdit } from '../../../../../common/core/edits/stringEdit.js';
import { OffsetRange } from '../../../../../common/core/ranges/offsetRange.js';
import { getPositionOffsetTransformerFromTextModel } from '../../../../../common/core/text/getPositionOffsetTransformerFromTextModel.js';
import { InlineCompletionEditorType } from '../../model/provideInlineCompletions.js';
let InlineEditsView = InlineEditsView_1 = class InlineEditsView extends Disposable {
    constructor(_editor, _model, _simpleModel, _inlineSuggestInfo, _showCollapsed, _instantiationService) {
        super();
        this._editor = _editor;
        this._model = _model;
        this._simpleModel = _simpleModel;
        this._inlineSuggestInfo = _inlineSuggestInfo;
        this._showCollapsed = _showCollapsed;
        this._instantiationService = _instantiationService;
        this._tabAction = derived(reader => this._model.read(reader)?.tabAction.read(reader) ?? InlineEditTabAction.Inactive);
        this.displayRange = derived(this, reader => {
            const state = this._uiState.read(reader);
            if (!state) {
                return undefined;
            }
            if (state.target.uri.toString() !== this._editorObs.model.read(reader)?.uri.toString()) {
                return undefined;
            }
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
        this._currentInlineEditCache = undefined;
        this._uiState = derived(this, reader => {
            const model = this._model.read(reader);
            const textModel = this._editorObs.model.read(reader);
            if (!model || !textModel || !this._constructorDone.read(reader)) {
                return undefined;
            }
            const inlineEdit = model.inlineEdit;
            let diff;
            let mappings;
            let newText = undefined;
            if (inlineEdit.edit) {
                mappings = RangeMapping.fromEdit(inlineEdit.edit);
                newText = new StringText(inlineEdit.edit.apply(inlineEdit.originalText));
                diff = lineRangeMappingFromRangeMappings(mappings, inlineEdit.originalText, newText);
            }
            else {
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
            this._previewTextModel.setLanguage(textModel.getLanguageId());
            const previousNewText = this._previewTextModel.getValue();
            if (previousNewText !== newText.getValue()) {
                this._previewTextModel.setEOL(textModel.getEndOfLineSequence());
                const updateOldValueEdit = StringEdit.replace(new OffsetRange(0, previousNewText.length), newText.getValue());
                const updateOldValueEditSmall = updateOldValueEdit.removeCommonSuffixPrefix(previousNewText);
                const textEdit = getPositionOffsetTransformerFromTextModel(this._previewTextModel).getTextEdit(updateOldValueEditSmall);
                this._previewTextModel.edit(textEdit);
            }
            if (this._showCollapsed.read(reader)) {
                state = { kind: InlineCompletionViewKind.Collapsed, viewData: state.viewData };
            }
            model.handleInlineEditShownNextFrame(state.kind, state.viewData);
            const nextCursorPosition = inlineEdit.action?.kind === 'jumpTo' ? inlineEdit.action.position : null;
            return {
                state,
                diff,
                edit: inlineEdit,
                newText: newText.getValue(),
                newTextLineCount: inlineEdit.modifiedLineRange.length,
                editorType: model.editorType,
                longDistanceHint,
                nextCursorPosition: nextCursorPosition,
                target: inlineEdit.inlineCompletion.originalTextRef,
            };
        });
        this.inlineEditsIsHovered = derived(this, reader => {
            return this._sideBySide.isHovered.read(reader)
                || this._wordReplacementViews.read(reader).some(v => v.isHovered.read(reader))
                || this._deletion.isHovered.read(reader)
                || this._inlineDiffView.isHovered.read(reader)
                || this._lineReplacementView.isHovered.read(reader)
                || this._insertion.isHovered.read(reader)
                || this._customView.isHovered.read(reader)
                || this._longDistanceHint.map((v, r) => v?.isHovered.read(r) ?? false).read(reader);
        });
        this.gutterIndicatorOffset = derived(this, reader => {
            // TODO: have a better way to tell the gutter indicator view where the edit is inside a viewzone
            if (this._uiState.read(reader)?.state?.kind === 'insertionMultiLine') {
                return this._insertion.startLineOffset.read(reader);
            }
            return 0;
        });
        this._editorObs = observableCodeEditor(this._editor);
        this._constructorDone = observableValue(this, false);
        this._previewTextModel = this._register(this._instantiationService.createInstance(TextModel, '', this._editor.getModel().getLanguageId(), { ...TextModel.DEFAULT_CREATION_OPTIONS, bracketPairColorizationOptions: { enabled: true, independentColorPoolPerBracketType: false } }, null));
        this._sideBySide = this._register(this._instantiationService.createInstance(InlineEditsSideBySideView, this._editor, this._model.map(m => m?.inlineEdit), this._previewTextModel, this._uiState.map(s => s && s.state?.kind === InlineCompletionViewKind.SideBySide ? ({
            newTextLineCount: s.newTextLineCount,
            editorType: s.editorType,
        }) : undefined), this._tabAction));
        this._deletion = this._register(this._instantiationService.createInstance(InlineEditsDeletionView, this._editor, this._model.map(m => m?.inlineEdit), this._uiState.map(s => s && s.state?.kind === InlineCompletionViewKind.Deletion ? ({
            originalRange: s.state.originalRange,
            deletions: s.state.deletions,
            editorType: s.editorType,
        }) : undefined), this._tabAction));
        this._insertion = this._register(this._instantiationService.createInstance(InlineEditsInsertionView, this._editor, this._uiState.map(s => s && s.state?.kind === InlineCompletionViewKind.InsertionMultiLine ? ({
            lineNumber: s.state.lineNumber,
            startColumn: s.state.column,
            text: s.state.text,
            editorType: s.editorType,
        }) : undefined), this._tabAction));
        this._inlineCollapsedView = this._register(this._instantiationService.createInstance(InlineEditsCollapsedView, this._editor, this._model.map((m, reader) => this._uiState.read(reader)?.state?.kind === InlineCompletionViewKind.Collapsed ? m?.inlineEdit : undefined)));
        this._customView = this._register(this._instantiationService.createInstance(InlineEditsCustomView, this._editor, this._model.map((m, reader) => this._uiState.read(reader)?.state?.kind === InlineCompletionViewKind.Custom ? m?.displayLocation : undefined), this._tabAction, this._uiState.map(s => s?.editorType ?? InlineCompletionEditorType.TextEditor)));
        this._showLongDistanceHint = this._editorObs.getOption(71 /* EditorOption.inlineSuggest */).map(this, s => s.edits.showLongDistanceHint);
        this._longDistanceHint = derived(this, reader => {
            if (!this._showLongDistanceHint.read(reader)) {
                return undefined;
            }
            return reader.store.add(this._instantiationService.createInstance(InlineEditsLongDistanceHint, this._editor, this._uiState.map((s, reader) => s?.longDistanceHint ? ({
                hint: s.longDistanceHint,
                newTextLineCount: s.newTextLineCount,
                edit: s.edit,
                diff: s.diff,
                editorType: s.editorType,
                model: this._simpleModel.read(reader),
                inlineSuggestInfo: this._inlineSuggestInfo.read(reader),
                nextCursorPosition: s.nextCursorPosition,
                target: s.target,
            }) : undefined), this._previewTextModel, this._tabAction));
        }).recomputeInitiallyAndOnChange(this._store);
        this._inlineDiffViewState = derived(this, reader => {
            const e = this._uiState.read(reader);
            if (!e || !e.state) {
                return undefined;
            }
            if (e.state.kind === 'wordReplacements' || e.state.kind === 'insertionMultiLine' || e.state.kind === 'collapsed' || e.state.kind === 'custom' || e.state.kind === 'jumpTo') {
                return undefined;
            }
            return {
                modifiedText: new StringText(e.newText),
                diff: e.diff,
                mode: e.state.kind,
                modifiedCodeEditor: this._sideBySide.previewEditor,
                editorType: e.editorType,
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
            equalsFn: equals.arrayC(equals.thisC())
        }, reader => {
            const s = this._uiState.read(reader);
            return s?.state?.kind === InlineCompletionViewKind.WordReplacements ? s.state.replacements.map(replacement => new WordReplacementsViewData(replacement, s.editorType, s.state?.alternativeAction)) : [];
        });
        this._wordReplacementViews = mapObservableArrayCached(this, wordReplacements, (viewData, store) => {
            return store.add(this._instantiationService.createInstance(InlineEditsWordReplacementView, this._editorObs, viewData, this._tabAction));
        });
        this._lineReplacementView = this._register(this._instantiationService.createInstance(InlineEditsLineReplacementView, this._editorObs, this._uiState.map(s => s?.state?.kind === InlineCompletionViewKind.LineReplacement ? ({
            originalRange: s.state.originalRange,
            modifiedRange: s.state.modifiedRange,
            modifiedLines: s.state.modifiedLines,
            replacements: s.state.replacements,
        }) : undefined), this._uiState.map(s => s?.editorType ?? InlineCompletionEditorType.TextEditor), this._tabAction));
        this._useCodeShifting = this._editorObs.getOption(71 /* EditorOption.inlineSuggest */).map(s => s.edits.allowCodeShifting);
        this._renderSideBySide = this._editorObs.getOption(71 /* EditorOption.inlineSuggest */).map(s => s.edits.renderSideBySide);
        this._register(autorun((reader) => {
            const model = this._model.read(reader);
            if (!model) {
                return;
            }
            reader.store.add(Event.any(this._sideBySide.onDidClick, this._lineReplacementView.onDidClick, this._insertion.onDidClick, ...this._wordReplacementViews.read(reader).map(w => w.onDidClick), this._inlineDiffView.onDidClick, this._customView.onDidClick)(clickEvent => {
                if (this._viewHasBeenShownLongerThan(350)) {
                    clickEvent.event.preventDefault();
                    model.accept(clickEvent.alternativeAction);
                }
            }));
        }));
        this._wordReplacementViews.recomputeInitiallyAndOnChange(this._store);
        const minEditorScrollHeight = derived(this, reader => {
            return Math.max(...this._wordReplacementViews.read(reader).map(v => v.minEditorScrollHeight.read(reader)), this._lineReplacementView.minEditorScrollHeight.read(reader), this._customView.minEditorScrollHeight.read(reader));
        }).recomputeInitiallyAndOnChange(this._store);
        let viewZoneId;
        this._register(autorun(reader => {
            const minScrollHeight = minEditorScrollHeight.read(reader);
            const textModel = this._editorObs.model.read(reader);
            if (!textModel) {
                return;
            }
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
    _getLongDistanceHintState(model, reader) {
        if (model.inlineEdit.inlineCompletion.identity.jumpedTo.read(reader)) {
            return undefined;
        }
        if (model.inlineEdit.action === undefined) {
            return undefined;
        }
        if (model.inlineEdit.originalText.uri.toString() !== this._editorObs.model.read(reader)?.uri.toString()) {
            return {
                isVisible: true,
                lineNumber: model.inlineEdit.cursorPosition.lineNumber,
            };
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
    _getCacheId(model) {
        return model.inlineEdit.inlineCompletion.identity.id;
    }
    _determineView(model, reader, diff, newText) {
        // Check if we can use the previous view if it is the same InlineCompletion as previously shown
        const inlineEdit = model.inlineEdit;
        const canUseCache = this._previousView?.id === this._getCacheId(model) && this._previousView?.uri.toString() === this._editorObs.model.get().uri.toString();
        const reconsiderViewEditorWidthChange = this._previousView?.editorWidth !== this._editorObs.layoutInfoWidth.read(reader) &&
            (this._previousView?.view === InlineCompletionViewKind.SideBySide ||
                this._previousView?.view === InlineCompletionViewKind.LineReplacement);
        if (canUseCache && !reconsiderViewEditorWidthChange) {
            return this._previousView.view;
        }
        const action = model.inlineEdit.inlineCompletion.action;
        if (action?.kind === 'edit' && action.alternativeAction) {
            return InlineCompletionViewKind.WordReplacements;
        }
        const targetUri = model.inlineEdit.inlineCompletion.originalTextRef.uri;
        const currentUri = this._editorObs.model.read(reader)?.uri;
        if (currentUri && targetUri.toString() !== currentUri.toString()) {
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
        if (model.editorType !== InlineCompletionEditorType.DiffEditor) {
            if (isSingleInnerEdit
                && this._useCodeShifting.read(reader) !== 'never'
                && isSingleLineInsertion(diff)) {
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
                    if (!inner.some(m => m.originalRange.isEmpty()) ||
                        !growEditsUntilWhitespace(inner.map(m => new TextReplacement(m.originalRange, '')), inlineEdit.originalText).some(e => e.range.isEmpty() && TextLength.ofRange(e.range).columnCount < InlineEditsWordReplacementView.MAX_LENGTH)) {
                        return InlineCompletionViewKind.WordReplacements;
                    }
                }
            }
        }
        if (numOriginalLines > 0 && numModifiedLines > 0) {
            if (numOriginalLines === 1 && numModifiedLines === 1 && model.editorType !== InlineCompletionEditorType.DiffEditor /* prefer side by side in diff editor */) {
                return InlineCompletionViewKind.LineReplacement;
            }
            if (this._renderSideBySide.read(reader) !== 'never' && InlineEditsSideBySideView.fitsInsideViewport(this._editor, this._previewTextModel, inlineEdit, reader)) {
                return InlineCompletionViewKind.SideBySide;
            }
            return InlineCompletionViewKind.LineReplacement;
        }
        if (model.editorType === InlineCompletionEditorType.DiffEditor) {
            if (isDeletion(inner, inlineEdit, newText)) {
                return InlineCompletionViewKind.Deletion;
            }
            if (isSingleMultiLineInsertion(diff) && this._useCodeShifting.read(reader) === 'always') {
                return InlineCompletionViewKind.InsertionMultiLine;
            }
        }
        return InlineCompletionViewKind.SideBySide;
    }
    _determineRenderState(model, reader, diff, newText) {
        if (model.inlineEdit.action?.kind === 'jumpTo') {
            return {
                kind: InlineCompletionViewKind.JumpTo,
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
        this._previousView = { id: this._getCacheId(model), view, editorWidth: this._editor.getLayoutInfo().width, timestamp: Date.now(), uri: this._editorObs.model.get().uri };
        const inner = diff.flatMap(d => d.innerChanges ?? []);
        const textModel = this._editor.getModel();
        const stringChanges = inner.map(m => ({
            originalRange: m.originalRange,
            modifiedRange: m.modifiedRange,
            original: inlineEdit.originalText.getValueOfRange(m.originalRange),
            modified: newText.getValueOfRange(m.modifiedRange)
        }));
        const viewData = getViewData(inlineEdit, stringChanges, textModel);
        switch (view) {
            case InlineCompletionViewKind.InsertionInline: return { kind: InlineCompletionViewKind.InsertionInline, viewData };
            case InlineCompletionViewKind.SideBySide: return { kind: InlineCompletionViewKind.SideBySide, viewData };
            case InlineCompletionViewKind.Collapsed: return { kind: InlineCompletionViewKind.Collapsed, viewData };
            case InlineCompletionViewKind.Custom: return { kind: InlineCompletionViewKind.Custom, displayLocation: model.displayLocation, viewData };
        }
        if (view === InlineCompletionViewKind.Deletion) {
            return {
                kind: InlineCompletionViewKind.Deletion,
                originalRange: inlineEdit.originalLineRange,
                deletions: inner.map(m => m.originalRange),
                viewData,
            };
        }
        if (view === InlineCompletionViewKind.InsertionMultiLine) {
            const change = inner[0];
            return {
                kind: InlineCompletionViewKind.InsertionMultiLine,
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
                kind: InlineCompletionViewKind.WordReplacements,
                replacements: grownEdits,
                alternativeAction: model.inlineEdit.action?.alternativeAction,
                viewData,
            };
        }
        if (view === InlineCompletionViewKind.LineReplacement) {
            return {
                kind: InlineCompletionViewKind.LineReplacement,
                originalRange: inlineEdit.originalLineRange,
                modifiedRange: inlineEdit.modifiedLineRange,
                modifiedLines: inlineEdit.modifiedLineRange.mapToLineArray(line => newText.getLineAt(line)),
                replacements: inner.map(m => ({ originalRange: m.originalRange, modifiedRange: m.modifiedRange })),
                viewData,
            };
        }
        return undefined;
    }
    _willRenderAboveCursor(reader, inlineEdit, view) {
        const useCodeShifting = this._useCodeShifting.read(reader);
        if (useCodeShifting === 'always') {
            return false;
        }
        for (const cursorPosition of inlineEdit.multiCursorPositions) {
            if (view === InlineCompletionViewKind.WordReplacements &&
                cursorPosition.lineNumber === inlineEdit.originalLineRange.startLineNumber + 1) {
                return true;
            }
            if (view === InlineCompletionViewKind.LineReplacement &&
                cursorPosition.lineNumber >= inlineEdit.originalLineRange.endLineNumberExclusive &&
                cursorPosition.lineNumber < inlineEdit.modifiedLineRange.endLineNumberExclusive + inlineEdit.modifiedLineRange.length) {
                return true;
            }
        }
        return false;
    }
    _viewHasBeenShownLongerThan(durationMs) {
        const viewCreationTime = this._previousView?.timestamp;
        if (!viewCreationTime) {
            throw new BugIndicatingError('viewHasBeenShownLongThan called before a view has been shown');
        }
        const currentTime = Date.now();
        return (currentTime - viewCreationTime) >= durationMs;
    }
};
InlineEditsView = InlineEditsView_1 = __decorate([
    __param(5, IInstantiationService)
], InlineEditsView);
export { InlineEditsView };
const emptyViewData = new InlineCompletionViewData(-1, -1, -1, -1, -1, -1, -1, true);
function getViewData(inlineEdit, stringChanges, textModel) {
    if (!inlineEdit.edit) {
        return emptyViewData;
    }
    const cursorPosition = inlineEdit.cursorPosition;
    const startsWithEOL = stringChanges.length === 0 ? false : stringChanges[0].modified.startsWith(textModel.getEOL());
    const viewData = new InlineCompletionViewData(inlineEdit.edit.replacements.length === 0 ? 0 : inlineEdit.edit.replacements[0].range.getStartPosition().column - cursorPosition.column, inlineEdit.lineEdit.lineRange.startLineNumber - cursorPosition.lineNumber + (startsWithEOL && inlineEdit.lineEdit.lineRange.startLineNumber >= cursorPosition.lineNumber ? 1 : 0), inlineEdit.lineEdit.lineRange.length, inlineEdit.lineEdit.newLines.length, stringChanges.reduce((acc, r) => acc + r.original.length, 0), stringChanges.reduce((acc, r) => acc + r.modified.length, 0), stringChanges.length, stringChanges.every(r => r.original === stringChanges[0].original && r.modified === stringChanges[0].modified));
    return viewData;
}
function isSingleLineInsertion(diff) {
    return diff.every(m => m.innerChanges.every(r => isWordInsertion(r)));
    function isWordInsertion(r) {
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
function isSingleLineInsertionAfterPosition(diff, position) {
    if (!position) {
        return false;
    }
    if (!isSingleLineInsertion(diff)) {
        return false;
    }
    const pos = position;
    return diff.every(m => m.innerChanges.every(r => isStableWordInsertion(r)));
    function isStableWordInsertion(r) {
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
function isSingleMultiLineInsertion(diff) {
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
function isDeletion(inner, inlineEdit, newText) {
    const innerValues = inner.map(m => ({ original: inlineEdit.originalText.getValueOfRange(m.originalRange), modified: newText.getValueOfRange(m.modifiedRange) }));
    return innerValues.every(({ original, modified }) => modified.trim() === '' && original.length > 0 && (original.length > modified.length || original.trim() !== ''));
}
function growEditsToEntireWord(replacements, originalText) {
    return _growEdits(replacements, originalText, (char) => /^[a-zA-Z]$/.test(char));
}
function growEditsUntilWhitespace(replacements, originalText) {
    return _growEdits(replacements, originalText, (char) => !(/^\s$/.test(char)));
}
function _growEdits(replacements, originalText, fn) {
    const result = [];
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
            newEdit = TextReplacement.joinReplacements([result.pop(), newEdit], originalText);
        }
        result.push(newEdit);
    }
    function isIncluded(c) {
        if (c === undefined) {
            return false;
        }
        return fn(c);
    }
    return result;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5saW5lRWRpdHNWaWV3LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvaW5saW5lQ29tcGxldGlvbnMvYnJvd3Nlci92aWV3L2lubGluZUVkaXRzL2lubGluZUVkaXRzVmlldy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLENBQUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQzFELE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNqRSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNoRyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDL0QsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLFdBQVcsRUFBd0Isd0JBQXdCLEVBQUUsZUFBZSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDN0osT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFFekcsT0FBTyxFQUF3QixvQkFBb0IsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBRTVHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUUvRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDNUQsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQzNFLE9BQU8sRUFBZ0IsVUFBVSxFQUFFLE1BQU0saURBQWlELENBQUM7QUFDM0YsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzNFLE9BQU8sRUFBNEIsaUNBQWlDLEVBQUUsWUFBWSxFQUFFLE1B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
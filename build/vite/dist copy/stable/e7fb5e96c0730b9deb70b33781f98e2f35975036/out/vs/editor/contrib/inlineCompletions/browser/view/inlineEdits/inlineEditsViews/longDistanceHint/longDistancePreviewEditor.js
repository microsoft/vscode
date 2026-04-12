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
import { n } from '../../../../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../../../../base/common/lifecycle.js';
import { clamp } from '../../../../../../../../base/common/numbers.js';
import { derived, constObservable, autorun, observableValue } from '../../../../../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../../../../../platform/instantiation/common/instantiation.js';
import { observableCodeEditor } from '../../../../../../../browser/observableCodeEditor.js';
import { EmbeddedCodeEditorWidget } from '../../../../../../../browser/widget/codeEditor/embeddedCodeEditorWidget.js';
import { Position } from '../../../../../../../common/core/position.js';
import { Range } from '../../../../../../../common/core/range.js';
import { LineRange } from '../../../../../../../common/core/ranges/lineRange.js';
import { OffsetRange } from '../../../../../../../common/core/ranges/offsetRange.js';
import { ModelDecorationOptions } from '../../../../../../../common/model/textModel.js';
import { InlineCompletionContextKeys } from '../../../../controller/inlineCompletionContextKeys.js';
import { InlineEditsGutterIndicator, InlineEditsGutterIndicatorData } from '../../components/gutterIndicatorView.js';
import { classNames, maxContentWidthInRange } from '../../utils/utils.js';
import { JumpToView } from '../jumpToView.js';
import { TextModelValueReference } from '../../../../model/textModelValueReference.js';
let LongDistancePreviewEditor = class LongDistancePreviewEditor extends Disposable {
    constructor(_previewTextModel, _properties, _parentEditor, _tabAction, _instantiationService) {
        super();
        this._previewTextModel = _previewTextModel;
        this._properties = _properties;
        this._parentEditor = _parentEditor;
        this._tabAction = _tabAction;
        this._instantiationService = _instantiationService;
        this._previewRef = n.ref();
        this.element = n.div({ class: 'preview', style: { /*pointerEvents: 'none'*/}, ref: this._previewRef });
        this._state = derived(this, reader => {
            const props = this._properties.read(reader);
            if (!props) {
                return undefined;
            }
            let mode;
            let visibleRange;
            if (props.nextCursorPosition !== null) {
                mode = 'original';
                visibleRange = LineRange.ofLength(props.nextCursorPosition.lineNumber, 1);
            }
            else {
                if (props.diff[0].innerChanges?.every(c => c.modifiedRange.isEmpty())) {
                    mode = 'original';
                    visibleRange = LineRange.ofLength(props.diff[0].original.startLineNumber, 1);
                }
                else {
                    mode = 'modified';
                    visibleRange = LineRange.ofLength(props.diff[0].modified.startLineNumber, 1);
                }
            }
            const textModel = mode === 'modified'
                ? TextModelValueReference.snapshot(this._previewTextModel)
                : props.target;
            return {
                mode,
                visibleLineRange: visibleRange,
                textModel,
                diff: props.diff,
            };
        });
        this.updatePreviewEditorEffect = derived(this, reader => {
            // this._widgetContent.readEffect(reader);
            this._previewEditorObs.model.read(reader); // update when the model is set
            const range = this._state.read(reader)?.visibleLineRange;
            if (!range) {
                return;
            }
            const hiddenAreas = [];
            if (range.startLineNumber > 1) {
                hiddenAreas.push(new Range(1, 1, range.startLineNumber - 1, 1));
            }
            if (range.endLineNumberExclusive < this._previewTextModel.getLineCount() + 1) {
                hiddenAreas.push(new Range(range.endLineNumberExclusive, 1, this._previewTextModel.getLineCount() + 1, 1));
            }
            this.previewEditor.setHiddenAreas(hiddenAreas, undefined, true);
        });
        this.horizontalContentRangeInPreviewEditorToShow = derived(this, reader => {
            return this._getHorizontalContentRangeInPreviewEditorToShow(this.previewEditor, reader);
        });
        this.contentHeight = derived(this, (reader) => {
            const viewState = this._state.read(reader);
            if (!viewState) {
                return constObservable(null);
            }
            const previewEditorHeight = this._previewEditorObs.observeLineHeightForLine(viewState.visibleLineRange.startLineNumber);
            return previewEditorHeight;
        }).flatten();
        this._editorDecorations = derived(this, reader => {
            const state = this._state.read(reader);
            if (!state) {
                return undefined;
            }
            const diff = {
                mode: 'insertionInline',
                diff: state.diff,
            };
            const originalDecorations = [];
            const modifiedDecorations = [];
            const diffWholeLineDeleteDecoration = ModelDecorationOptions.register({
                className: 'inlineCompletions-char-delete',
                description: 'char-delete',
                isWholeLine: false,
                zIndex: 1, // be on top of diff background decoration
            });
            const diffWholeLineAddDecoration = ModelDecorationOptions.register({
                className: 'inlineCompletions-char-insert',
                description: 'char-insert',
                isWholeLine: true,
            });
            const diffAddDecoration = ModelDecorationOptions.register({
                className: 'inlineCompletions-char-insert',
                description: 'char-insert',
                shouldFillLineOnLineBreak: true,
            });
            const hideEmptyInnerDecorations = true; // diff.mode === 'lineReplacement';
            for (const m of diff.diff) {
                if (m.modified.isEmpty || m.original.isEmpty) {
                    if (!m.original.isEmpty) {
                        originalDecorations.push({ range: m.original.toInclusiveRange(), options: diffWholeLineDeleteDecoration });
                    }
                    if (!m.modified.isEmpty) {
                        modifiedDecorations.push({ range: m.modified.toInclusiveRange(), options: diffWholeLineAddDecoration });
                    }
                }
                else {
                    for (const i of m.innerChanges || []) {
                        // Don't show empty markers outside the line range
                        if (m.original.contains(i.originalRange.startLineNumber) && !(hideEmptyInnerDecorations && i.originalRange.isEmpty())) {
                            originalDecorations.push({
                                range: i.originalRange,
                                options: {
                                    description: 'char-delete',
                                    shouldFillLineOnLineBreak: false,
                                    className: classNames('inlineCompletions-char-delete', 
                                    // i.originalRange.isSingleLine() && diff.mode === 'insertionInline' && 'single-line-inline',
                                    i.originalRange.isEmpty() && 'empty'),
                                    zIndex: 1
                                }
                            });
                        }
                        if (m.modified.contains(i.modifiedRange.startLineNumber)) {
                            modifiedDecorations.push({
                                range: i.modifiedRange,
                                options: diffAddDecoration
                            });
                        }
                    }
                }
            }
            return { originalDecorations, modifiedDecorations };
        });
        this.previewEditor = this._register(this._createPreviewEditor());
        this._parentEditorObs = observableCodeEditor(this._parentEditor);
        this._register(autorun(reader => {
            const tm = this._state.read(reader)?.textModel || null;
            if (tm) {
                // Avoid transitions from tm -> null -> tm, where tm -> tm would be a no-op.
                this.previewEditor.setModel(tm.dangerouslyGetUnderlyingModel());
            }
        }));
        this._previewEditorObs = observableCodeEditor(this.previewEditor);
        this._register(this._previewEditorObs.setDecorations(derived(reader => {
            const state = this._state.read(reader);
            const decorations = this._editorDecorations.read(reader);
            return (state?.mode === 'original' ? decorations?.originalDecorations : decorations?.modifiedDecorations) ?? [];
        })));
        const showJumpToDecoration = false;
        if (showJumpToDecoration) {
            this._register(this._instantiationService.createInstance(JumpToView, this._previewEditorObs, { style: 'cursor' }, derived(reader => {
                const p = this._properties.read(reader);
                if (!p || !p.nextCursorPosition) {
                    return undefined;
                }
                return {
                    jumpToPosition: p.nextCursorPosition,
                };
            })));
        }
        // Mirror the cursor position. Allows the gutter arrow to point in the correct direction.
        this._register(autorun((reader) => {
            if (!this._properties.read(reader)) {
                return;
            }
            const cursorPosition = this._parentEditorObs.cursorPosition.read(reader);
            if (cursorPosition) {
                this.previewEditor.setPosition(this._previewTextModel.validatePosition(cursorPosition), 'longDistanceHintPreview');
            }
        }));
        this._register(autorun(reader => {
            const state = this._state.read(reader);
            if (!state) {
                return;
            }
            // Ensure there is enough space to the left of the line number for the gutter indicator to fits.
            const lineNumberDigets = state.visibleLineRange.startLineNumber.toString().length;
            this.previewEditor.updateOptions({ lineNumbersMinChars: lineNumberDigets + 1 });
        }));
        this._register(this._instantiationService.createInstance(InlineEditsGutterIndicator, this._previewEditorObs, derived(reader => {
            const state = this._state.read(reader);
            if (!state) {
                return undefined;
            }
            const props = this._properties.read(reader);
            if (!props) {
                return undefined;
            }
            return new InlineEditsGutterIndicatorData(props.inlineSuggestInfo, LineRange.ofLength(state.visibleLineRange.startLineNumber, 1), props.model, undefined);
        }), this._tabAction, constObservable(0), constObservable(false), observableValue(this, false)));
        this.updatePreviewEditorEffect.recomputeInitiallyAndOnChange(this._store);
    }
    _createPreviewEditor() {
        return this._instantiationService.createInstance(EmbeddedCodeEditorWidget, this._previewRef.element, {
            glyphMargin: false,
            lineNumbers: 'on',
            minimap: { enabled: false },
            guides: {
                indentation: false,
                bracketPairs: false,
                bracketPairsHorizontal: false,
                highlightActiveIndentation: false,
            },
            editContext: false, // is a bit faster
            rulers: [],
            padding: { top: 0, bottom: 0 },
            //folding: false,
            selectOnLineNumbers: false,
            selectionHighlight: false,
            columnSelection: false,
            overviewRulerBorder: false,
            overviewRulerLanes: 0,
            //lineDecorationsWidth: 0,
            //lineNumbersMinChars: 0,
            revealHorizontalRightPadding: 0,
            bracketPairColorization: { enabled: true, independentColorPoolPerBracketType: false },
            scrollBeyondLastLine: false,
            scrollbar: {
                vertical: 'hidden',
                horizontal: 'hidden',
                handleMouseWheel: false,
            },
            readOnly: true,
            wordWrap: 'off',
            wordWrapOverride1: 'off',
            wordWrapOverride2: 'off',
        }, {
            contextKeyValues: {
                [InlineCompletionContextKeys.inInlineEditsPreviewEditor.key]: true,
            },
            contributions: [],
        }, this._parentEditor);
    }
    _getHorizontalContentRangeInPreviewEditorToShow(editor, reader) {
        const state = this._state.read(reader);
        if (!state) {
            return undefined;
        }
        const diff = state.diff;
        const jumpToPos = this._properties.read(reader)?.nextCursorPosition;
        const visibleRange = state.visibleLineRange;
        const l = this._previewEditorObs.layoutInfo.read(reader);
        const trueContentWidth = maxContentWidthInRange(this._previewEditorObs, visibleRange, reader);
        let firstCharacterChange;
        if (jumpToPos) {
            firstCharacterChange = Range.fromPositions(jumpToPos);
        }
        else if (diff[0].innerChanges) {
            firstCharacterChange = state.mode === 'modified' ? diff[0].innerChanges[0].modifiedRange : diff[0].innerChanges[0].originalRange;
        }
        else {
            return undefined;
        }
        // find the horizontal range we want to show.
        const preferredRange = growUntilVariableBoundaries(editor.getModel(), firstCharacterChange, 5);
        const leftOffset = this._previewEditorObs.getLeftOfPosition(preferredRange.getStartPosition(), reader);
        const rightOffset = this._previewEditorObs.getLeftOfPosition(preferredRange.getEndPosition(), reader);
        const left = clamp(leftOffset, 0, trueContentWidth);
        const right = clamp(rightOffset, left, trueContentWidth);
        const indentCol = editor.getModel().getLineFirstNonWhitespaceColumn(preferredRange.startLineNumber);
        const indentationEnd = this._previewEditorObs.getLeftOfPosition(new Position(preferredRange.startLineNumber, indentCol), reader);
        const preferredRangeToReveal = new OffsetRange(left, right);
        return {
            indentationEnd,
            preferredRangeToReveal,
            maxEditorWidth: trueContentWidth + l.contentLeft,
            contentWidth: trueContentWidth,
            nonContentWidth: l.contentLeft, // Width of area that is not content
        };
    }
    layout(dimension, desiredPreviewEditorScrollLeft) {
        this.previewEditor.layout(dimension);
        this._previewEditorObs.editor.setScrollLeft(desiredPreviewEditorScrollLeft);
    }
};
LongDistancePreviewEditor = __decorate([
    __param(4, IInstantiationService)
], LongDistancePreviewEditor);
export { LongDistancePreviewEditor };
/*
 * Grows the range on each ends until it includes a none-variable-name character
 * or the next character would be a whitespace character
 * or the maxGrow limit is reached
 */
function growUntilVariableBoundaries(textModel, range, maxGrow) {
    const startPosition = range.getStartPosition();
    const endPosition = range.getEndPosition();
    const line = textModel.getLineContent(startPosition.lineNumber);
    function isVariableNameCharacter(col) {
        const char = line.charAt(col - 1);
        return (/[a-zA-Z0-9_]/).test(char);
    }
    function isWhitespace(col) {
        const char = line.charAt(col - 1);
        return char === ' ' || char === '\t';
    }
    let startColumn = startPosition.column;
    while (startColumn > 1 && isVariableNameCharacter(startColumn) && !isWhitespace(startColumn - 1) && startPosition.column - startColumn < maxGrow) {
        startColumn--;
    }
    let endColumn = endPosition.column - 1;
    while (endColumn <= line.length && isVariableNameCharacter(endColumn) && !isWhitespace(endColumn + 1) && endColumn - endPosition.column < maxGrow) {
        endColumn++;
    }
    return new Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endColumn + 1);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9uZ0Rpc3RhbmNlUHJldmlld0VkaXRvci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL2lubGluZUNvbXBsZXRpb25zL2Jyb3dzZXIvdmlldy9pbmxpbmVFZGl0cy9pbmxpbmVFZGl0c1ZpZXdzL2xvbmdEaXN0YW5jZUhpbnQvbG9uZ0Rpc3RhbmNlUHJldmlld0VkaXRvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsQ0FBQyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDaEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzlFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUN2RSxPQUFPLEVBQWUsT0FBTyxFQUFFLGVBQWUsRUFBVyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDN0ksT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sd0VBQXdFLENBQUM7QUFFL0csT0FBTyxFQUF3QixvQkFBb0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ2xILE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDRFQUE0RSxDQUFDO0FBRXRILE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUN4RSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUdyRixPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUN4RixPQUFPLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUNwRyxPQUFP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
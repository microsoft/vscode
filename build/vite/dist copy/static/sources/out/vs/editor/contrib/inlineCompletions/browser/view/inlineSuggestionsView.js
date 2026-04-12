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
import { createStyleSheetFromObservable } from '../../../../../base/browser/domStylesheets.js';
import { createHotClass } from '../../../../../base/common/hotReloadHelpers.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { derived, mapObservableArrayCached, derivedDisposable, derivedObservableWithCache, constObservable, observableValue } from '../../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { observableCodeEditor } from '../../../../browser/observableCodeEditor.js';
import { LineRange } from '../../../../common/core/ranges/lineRange.js';
import { InlineCompletionsHintsWidget } from '../hintsWidget/inlineCompletionsHintsWidget.js';
import { convertItemsToStableObservables } from '../utils.js';
import { GhostTextView, GhostTextWidgetWarning } from './ghostText/ghostTextView.js';
import { InlineEditsGutterIndicator, InlineEditsGutterIndicatorData, InlineSuggestionGutterMenuData, SimpleInlineSuggestModel } from './inlineEdits/components/gutterIndicatorView.js';
import { InlineEditsOnboardingExperience } from './inlineEdits/inlineEditsNewUsers.js';
import { InlineCompletionViewKind, InlineEditTabAction } from './inlineEdits/inlineEditsViewInterface.js';
import { InlineEditsViewAndDiffProducer } from './inlineEdits/inlineEditsViewProducer.js';
let InlineSuggestionsView = class InlineSuggestionsView extends Disposable {
    static { this.hot = createHotClass(this); }
    constructor(_editor, _model, _focusIsInMenu, _instantiationService) {
        super();
        this._editor = _editor;
        this._model = _model;
        this._focusIsInMenu = _focusIsInMenu;
        this._instantiationService = _instantiationService;
        this._ghostTexts = derived(this, (reader) => {
            const model = this._model.read(reader);
            return model?.ghostTexts.read(reader) ?? [];
        });
        this._inlineEdit = derived(this, reader => this._model.read(reader)?.inlineEditState.read(reader)?.inlineSuggestion);
        this._everHadInlineEdit = derivedObservableWithCache(this, (reader, last) => last || !!this._inlineEdit.read(reader)
            || !!this._model.read(reader)?.inlineCompletionState.read(reader)?.inlineSuggestion?.showInlineEditMenu);
        // To break a cyclic dependency
        this._indicatorIsHoverVisible = observableValue(this, undefined);
        this._showInlineEditCollapsed = derived(this, reader => {
            const s = this._model.read(reader)?.showCollapsed.read(reader) ?? false;
            return s && !this._indicatorIsHoverVisible.read(reader)?.read(reader);
        });
        this._inlineEditWidget = derivedDisposable(reader => {
            if (!this._everHadInlineEdit.read(reader)) {
                return undefined;
            }
            return this._instantiationService.createInstance(InlineEditsViewAndDiffProducer, this._editor, this._model, this._showInlineEditCollapsed);
        });
        this._gutterIndicatorState = derived(reader => {
            const model = this._model.read(reader);
            if (!model) {
                return undefined;
            }
            const state = model.state.read(reader);
            if (state?.kind === 'ghostText' && state.inlineSuggestion?.showInlineEditMenu) {
                return {
                    displayRange: LineRange.ofLength(state.primaryGhostText.lineNumber, 1),
                    tabAction: derived(this, reader => this._editorObs.isFocused.read(reader) ? InlineEditTabAction.Accept : InlineEditTabAction.Inactive),
                    gutterIndicatorOffset: constObservable(getGhostTextTopOffset(state.inlineSuggestion, this._editor)),
                    inlineSuggestion: state.inlineSuggestion,
                    model,
                };
            }
            else if (state?.kind === 'inlineEdit') {
                const inlineEditWidget = this._inlineEditWidget.read(reader)?.view;
                if (!inlineEditWidget) {
                    return undefined;
                }
                const displayRange = inlineEditWidget.displayRange.read(reader);
                if (!displayRange) {
                    return undefined;
                }
                return {
                    displayRange,
                    tabAction: derived(reader => {
                        if (this._editorObs.isFocused.read(reader)) {
                            if (model.tabShouldJumpToInlineEdit.read(reader)) {
                                return InlineEditTabAction.Jump;
                            }
                            if (model.tabShouldAcceptInlineEdit.read(reader)) {
                                return InlineEditTabAction.Accept;
                            }
                        }
                        return InlineEditTabAction.Inactive;
                    }),
                    gutterIndicatorOffset: inlineEditWidget.gutterIndicatorOffset,
                    inlineSuggestion: state.inlineSuggestion,
                    model,
                };
            }
            else {
                return undefined;
            }
        });
        this._stablizedGhostTexts = convertItemsToStableObservables(this._ghostTexts, this._store);
        this._editorObs = observableCodeEditor(this._editor);
        this._ghostTextWidgets = mapObservableArrayCached(this, this._stablizedGhostTexts, (ghostText, store) => store.add(this._createGhostText(ghostText))).recomputeInitiallyAndOnChange(this._store);
        this._inlineEditWidget.recomputeInitiallyAndOnChange(this._store);
        this._fontFamily = this._editorObs.getOption(71 /* EditorOption.inlineSuggest */).map(val => val.fontFamily);
        this._register(createStyleSheetFromObservable(derived(reader => {
            const fontFamily = this._fontFamily.read(reader);
            return `
.monaco-editor .ghost-text-decoration,
.monaco-editor .ghost-text-decoration-preview,
.monaco-editor .ghost-text {
	font-family: ${fontFamily};
}`;
        })));
        this._register(new InlineCompletionsHintsWidget(this._editor, this._model, this._instantiationService));
        this._indicator = this._register(this._instantiationService.createInstance(InlineEditsGutterIndicator, this._editorObs, derived(reader => {
            const s = this._gutterIndicatorState.read(reader);
            if (!s) {
                return undefined;
            }
            return new InlineEditsGutterIndicatorData(InlineSuggestionGutterMenuData.fromInlineSuggestion(s.inlineSuggestion), s.displayRange, SimpleInlineSuggestModel.fromInlineCompletionModel(s.model), s.inlineSuggestion.action?.kind === 'edit' ? s.inlineSuggestion.action.alternativeAction : undefined);
        }), this._gutterIndicatorState.map((s, reader) => s?.tabAction.read(reader) ?? InlineEditTabAction.Inactive), this._gutterIndicatorState.map((s, reader) => s?.gutterIndicatorOffset.read(reader) ?? 0), this._inlineEditWidget.map((w, reader) => w?.view.inlineEditsIsHovered.read(reader) ?? false), this._focusIsInMenu));
        this._indicatorIsHoverVisible.set(this._indicator.isHoverVisible, undefined);
        derived(reader => {
            const w = this._inlineEditWidget.read(reader);
            if (!w) {
                return undefined;
            }
            return reader.store.add(this._instantiationService.createInstance(InlineEditsOnboardingExperience, w._inlineEditModel, constObservable(this._indicator), w.view._inlineCollapsedView));
        }).recomputeInitiallyAndOnChange(this._store);
    }
    _createGhostText(ghostText) {
        return this._instantiationService.createInstance(GhostTextView, this._editor, derived(reader => {
            const model = this._model.read(reader);
            const inlineCompletion = model?.inlineCompletionState.read(reader)?.inlineSuggestion;
            if (!model || !inlineCompletion) {
                // editor.suggest.preview: true causes situations where we have ghost text, but no suggest preview.
                return {
                    ghostText: ghostText.read(reader),
                    handleInlineCompletionShown: () => { },
                    warning: undefined,
                };
            }
            return {
                ghostText: ghostText.read(reader),
                handleInlineCompletionShown: (viewData) => model.handleInlineSuggestionShown(inlineCompletion, InlineCompletionViewKind.GhostText, viewData, Date.now()),
                warning: GhostTextWidgetWarning.from(model?.warning.read(reader)),
            };
        }), {
            useSyntaxHighlighting: this._editorObs.getOption(71 /* EditorOption.inlineSuggest */).map(v => v.syntaxHighlightingEnabled),
            highlightShortSuggestions: true,
        });
    }
    shouldShowHoverAtViewZone(viewZoneId) {
        return this._ghostTextWidgets.get()[0]?.ownsViewZone(viewZoneId) ?? false;
    }
};
InlineSuggestionsView = __decorate([
    __param(3, IInstantiationService)
], InlineSuggestionsView);
export { InlineSuggestionsView };
function getGhostTextTopOffset(inlineCompletion, editor) {
    const replacement = inlineCompletion.getSingleTextEdit();
    const textModel = editor.getModel();
    if (!textModel) {
        return 0;
    }
    const EOL = textModel.getEOL();
    if (replacement.range.isEmpty() && replacement.text.startsWith(EOL)) {
        const lineHeight = editor.getLineHeightForPosition(replacement.range.getStartPosition());
        return countPrefixRepeats(replacement.text, EOL) * lineHeight;
    }
    return 0;
}
function countPrefixRepeats(str, prefix) {
    if (!prefix.length) {
        return 0;
    }
    let count = 0;
    let i = 0;
    while (str.startsWith(prefix, i)) {
        count++;
        i += prefix.length;
    }
    return count;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5saW5lU3VnZ2VzdGlvbnNWaWV3LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvaW5saW5lQ29tcGxldGlvbnMvYnJvd3Nlci92aWV3L2lubGluZVN1Z2dlc3Rpb25zVmlldy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsOEJBQThCLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUMvRixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDaEYsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsaUJBQWlCLEVBQUUsMEJBQTBCLEVBQW9DLGVBQWUsRUFBRSxlQUFlLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNoTixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUV0RyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUVuRixPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDeEUsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFJOUYsT0FBTyxFQUFFLCtCQUErQixFQUFFLE1BQU0sYUFBYSxDQUFDO0FBQzlELE9BQU8sRUFBRSxhQUFhLEVBQUUsc0JBQXNCLEVBQXdCLE1BQU0sOEJBQThCLENBQUM7QUFDM0csT0FBTyxFQUFFLDBCQUEwQixFQUFFLDhCQUE4QixFQUFFLDhCQUE4QixFQUFFLHdCQUF3QixFQUFFLE1BQU0saURBQWlELENBQUM7QUFDdkwsT0FBTyxFQUFFLCtCQUErQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDdkYsT0FBTyxFQUFFLHdCQUF3QixFQUFFLG1C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
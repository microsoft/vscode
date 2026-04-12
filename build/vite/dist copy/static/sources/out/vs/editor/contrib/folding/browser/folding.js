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
var FoldingController_1;
import { createCancelablePromise, Delayer, RunOnceScheduler } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { illegalArgument, onUnexpectedError } from '../../../../base/common/errors.js';
import { KeyChord } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { escapeRegExpCharacters } from '../../../../base/common/strings.js';
import * as types from '../../../../base/common/types.js';
import './folding.css';
import { StableEditorScrollState } from '../../../browser/stableEditorScroll.js';
import { EditorAction, registerEditorAction, registerEditorContribution, registerInstantiatedEditorAction } from '../../../browser/editorExtensions.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { FoldingRangeKind } from '../../../common/languages.js';
import { ILanguageConfigurationService } from '../../../common/languages/languageConfigurationRegistry.js';
import { FoldingModel, getNextFoldLine, getParentFoldLine, getPreviousFoldLine, setCollapseStateAtLevel, setCollapseStateForMatchingLines, setCollapseStateForRest, setCollapseStateForType, setCollapseStateLevelsDown, setCollapseStateLevelsUp, setCollapseStateUp, toggleCollapseState } from './foldingModel.js';
import { HiddenRangeModel } from './hiddenRangeModel.js';
import { IndentRangeProvider } from './indentRangeProvider.js';
import * as nls from '../../../../nls.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { FoldingDecorationProvider } from './foldingDecorations.js';
import { FoldingRegions } from './foldingRanges.js';
import { SyntaxRangeProvider } from './syntaxRangeProvider.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ILanguageFeatureDebounceService } from '../../../common/services/languageFeatureDebounce.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
import { Emitter } from '../../../../base/common/event.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { URI } from '../../../../base/common/uri.js';
import { IModelService } from '../../../common/services/model.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
const CONTEXT_FOLDING_ENABLED = new RawContextKey('foldingEnabled', false);
let FoldingController = class FoldingController extends Disposable {
    static { FoldingController_1 = this; }
    static { this.ID = 'editor.contrib.folding'; }
    static get(editor) {
        return editor.getContribution(FoldingController_1.ID);
    }
    static getFoldingRangeProviders(languageFeaturesService, model) {
        const foldingRangeProviders = languageFeaturesService.foldingRangeProvider.ordered(model);
        return (FoldingController_1._foldingRangeSelector?.(foldingRangeProviders, model)) ?? foldingRangeProviders;
    }
    static setFoldingRangeProviderSelector(foldingRangeSelector) {
        FoldingController_1._foldingRangeSelector = foldingRangeSelector;
        return { dispose: () => { FoldingController_1._foldingRangeSelector = undefined; } };
    }
    constructor(editor, contextKeyService, languageConfigurationService, notificationService, languageFeatureDebounceService, languageFeaturesService) {
        super();
        this.contextKeyService = contextKeyService;
        this.languageConfigurationService = languageConfigurationService;
        this.languageFeaturesService = languageFeaturesService;
        this.localToDispose = this._register(new DisposableStore());
        this.editor = editor;
        this._foldingLimitReporter = this._register(new RangesLimitReporter(editor));
        const options = this.editor.getOptions();
        this._isEnabled = options.get(52 /* EditorOption.folding */);
        this._useFoldingProviders = options.get(53 /* EditorOption.foldingStrategy */) !== 'indentation';
        this._unfoldOnClickAfterEndOfLine = options.get(57 /* EditorOption.unfoldOnClickAfterEndOfLine */);
        this._restoringViewState = false;
        this._currentModelHasFoldedImports = false;
        this._foldingImportsByDefault = options.get(55 /* EditorOption.foldingImportsByDefault */);
        this.updateDebounceInfo = languageFeatureDebounceService.for(languageFeaturesService.foldingRangeProvider, 'Folding', { min: 200 });
        this.foldingModel = null;
        this.hiddenRangeModel = null;
        this.rangeProvider = null;
        this.foldingRegionPromise = null;
        this.foldingModelPromise = null;
        this.updateScheduler = null;
        this.cursorChangedScheduler = null;
        this.mouseDownInfo = null;
        this.foldingDecorationProvider = new FoldingDecorationProvider(editor);
        this.foldingDecorationProvider.showFoldingControls = options.get(126 /* EditorOption.showFoldingControls */);
        this.foldingDecorationProvider.showFoldingHighlights = options.get(54 /* EditorOption.foldingHighlight */);
        this.foldingEnabled = CONTEXT_FOLDING_ENABLED.bindTo(this.contextKeyService);
        this.foldingEnabled.set(this._isEnabled);
        this._register(this.editor.onDidChangeModel(() => this.onModelChanged()));
        this._register(this.editor.onDidChangeConfiguration((e) => {
            if (e.hasChanged(52 /* EditorOption.folding */)) {
                this._isEnabled = this.editor.getOptions().get(52 /* EditorOption.folding */);
                this.foldingEnabled.set(this._isEnabled);
                this.onModelChanged();
            }
            if (e.hasChanged(56 /* EditorOption.foldingMaximumRegions */)) {
                this.onModelChanged();
            }
            if (e.hasChanged(126 /* EditorOption.showFoldingControls */) || e.hasChanged(54 /* EditorOption.foldingHighlight */)) {
                const options = this.editor.getOptions();
                this.foldingDecorationProvider.showFoldingControls = options.get(126 /* EditorOption.showFoldingControls */);
                this.foldingDecorationProvider.showFoldingHighlights = options.get(54 /* EditorOption.foldingHighlight */);
                this.triggerFoldingModelChanged();
            }
            if (e.hasChanged(53 /* EditorOption.foldingStrategy */)) {
                this._useFoldingProviders = this.editor.getOptions().get(53 /* EditorOption.foldingStrategy */) !== 'indentation';
                this.onFoldingStrategyChanged();
            }
            if (e.hasChanged(57 /* EditorOption.unfoldOnClickAfterEndOfLine */)) {
                this._unfoldOnClickAfterEndOfLine = this.editor.getOptions().get(57 /* EditorOption.unfoldOnClickAfterEndOfLine */);
            }
            if (e.hasChanged(55 /* EditorOption.foldingImportsByDefault */)) {
                this._foldingImportsByDefault = this.editor.getOptions().get(55 /* EditorOption.foldingImportsByDefault */);
            }
        }));
        this.onModelChanged();
    }
    get limitReporter() {
        return this._foldingLimitReporter;
    }
    /**
     * Store view state.
     */
    saveViewState() {
        const model = this.editor.getModel();
        if (!model || !this._isEnabled || model.isTooLargeForTokenization()) {
            return {};
        }
        if (this.foldingModel) { // disposed ?
            const collapsedRegions = this.foldingModel.getMemento();
            const provider = this.rangeProvider ? this.rangeProvider.id : undefined;
            return { collapsedRegions, lineCount: model.getLineCount(), provider, foldedImports: this._currentModelHasFoldedImports };
        }
        return undefined;
    }
    /**
     * Restore view state.
     */
    restoreViewState(state) {
        const model = this.editor.getModel();
        if (!model || !this._isEnabled || model.isTooLargeForTokenization() || !this.hiddenRangeModel) {
            return;
        }
        if (!state) {
            return;
        }
        this._currentModelHasFoldedImports = !!state.foldedImports;
        if (state.collapsedRegions && state.collapsedRegions.length > 0 && this.foldingModel) {
            this._restoringViewState = true;
            try {
                this.foldingModel.applyMemento(state.collapsedRegions);
            }
            finally {
                this._restoringViewState = false;
            }
        }
    }
    onModelChanged() {
        this.localToDispose.clear();
        const model = this.editor.getModel();
        if (!this._isEnabled || !model || model.isTooLargeForTokenization()) {
            // huge files get no view model, so they cannot support hidden areas
            return;
        }
        this._currentModelHasFoldedImports = false;
        this.foldingModel = new FoldingModel(model, this.foldingDecorationProvider);
        this.localToDispose.add(this.foldingModel);
        this.hiddenRangeModel = new HiddenRangeModel(this.foldingModel);
        this.localToDispose.add(this.hiddenRangeModel);
        this.localToDispose.add(this.hiddenRangeModel.onDidChange(hr => this.onHiddenRangesChanges(hr)));
        this.updateScheduler = new Delayer(this.updateDebounceInfo.get(model));
        this.localToDispose.add(this.updateScheduler);
        this.cursorChangedScheduler = new RunOnceScheduler(() => this.revealCursor(), 200);
        this.localToDispose.add(this.cursorChangedScheduler);
        this.localToDispose.add(this.languageFeaturesService.foldingRangeProvider.onDidChange(() => this.onFoldingStrategyChanged()));
        this.localToDispose.add(this.editor.onDidChangeModelLanguageConfiguration(() => this.onFoldingStrategyChanged())); // covers model language changes as well
        this.localToDispose.add(this.editor.onDidChangeModelContent(e => this.onDidChangeModelContent(e)));
        this.localToDispose.add(this.editor.onDidChangeCursorPosition(() => this.onCursorPositionChanged()));
        this.localToDispose.add(this.editor.onMouseDown(e => this.onEditorMouseDown(e)));
        this.localToDispose.add(this.editor.onMouseUp(e => this.onEditorMouseUp(e)));
        this.localToDispose.add({
            dispose: () => {
                if (this.foldingRegionPromise) {
                    this.foldingRegionPromise.cancel();
                    this.foldingRegionPromise = null;
                }
                this.updateScheduler?.cancel();
                this.updateScheduler = null;
                this.foldingModel = null;
                this.foldingModelPromise = null;
                this.hiddenRangeModel = null;
                this.cursorChangedScheduler = null;
                this.rangeProvider?.dispose();
                this.rangeProvider = null;
            }
        });
        this.triggerFoldingModelChanged();
    }
    onFoldingStrategyChanged() {
        this.rangeProvider?.dispose();
        this.rangeProvider = null;
        this.triggerFoldingModelChanged();
    }
    getRangeProvider(editorModel) {
        if (this.rangeProvider) {
            return this.rangeProvider;
        }
        const indentRangeProvider = new IndentRangeProvider(editorModel, this.languageConfigurationService, this._foldingLimitReporter);
        this.rangeProvider = indentRangeProvider; // fallback
        if (this._useFoldingProviders && this.foldingModel) {
            const selectedProviders = FoldingController_1.getFoldingRangeProviders(this.languageFeaturesService, editorModel);
            if (selectedProviders.length > 0) {
                this.rangeProvider = new SyntaxRangeProvider(editorModel, selectedProviders, () => this.triggerFoldingModelChanged(), this._foldingLimitReporter, indentRangeProvider);
            }
        }
        return this.rangeProvider;
    }
    getFoldingModel() {
        return this.foldingModelPromise;
    }
    onDidChangeModelContent(e) {
        this.hiddenRangeModel?.notifyChangeModelContent(e);
        this.triggerFoldingModelChanged();
    }
    triggerFoldingModelChanged() {
        if (this.updateScheduler) {
            if (this.foldingRegionPromise) {
                this.foldingRegionPromise.cancel();
                this.foldingRegionPromise = null;
            }
            this.foldingModelPromise = this.updateScheduler.trigger(() => {
                const foldingModel = this.foldingModel;
                if (!foldingModel) { // null if editor has been disposed, or folding turned off
                    return null;
                }
                const sw = new StopWatch();
                const provider = this.getRangeProvider(foldingModel.textModel);
                const foldingRegionPromise = this.foldingRegionPromise = createCancelablePromise(token => provider.compute(token));
                return foldingRegionPromise.then(foldingRanges => {
                    if (foldingRanges && foldingRegionPromise === this.foldingRegionPromise) { // new request or cancelled in the meantime?
                        let scrollState;
                        if (this._foldingImportsByDefault && !this._currentModelHasFoldedImports) {
                            const hasChanges = foldingRanges.setCollapsedAllOfType(FoldingRangeKind.Imports.value, true);
                            if (hasChanges) {
                                scrollState = StableEditorScrollState.capture(this.editor);
                                this._currentModelHasFoldedImports = hasChanges;
                            }
                        }
                        // some cursors might have moved into hidden regions, make sure they are in expanded regions
                        const selections = this.editor.getSelections();
                        foldingModel.update(foldingRanges, toSelectedLines(selections));
                        scrollState?.restore(this.editor);
                        // update debounce info
                        const newValue = this.updateDebounceInfo.update(foldingModel.textModel, sw.elapsed());
                        if (this.updateScheduler) {
                            this.updateScheduler.defaultDelay = newValue;
                        }
                    }
                    return foldingModel;
                });
            }).then(undefined, (err) => {
                onUnexpectedError(err);
                return null;
            });
        }
    }
    onHiddenRangesChanges(hiddenRanges) {
        if (this.hiddenRangeModel && hiddenRanges.length && !this._restoringViewState) {
            const selections = this.editor.getSelections();
            if (selections) {
                if (this.hiddenRangeModel.adjustSelections(selections)) {
                    this.editor.setSelections(selections);
                }
            }
        }
        this.editor.setHiddenAreas(hiddenRanges, this);
    }
    onCursorPositionChanged() {
        if (this.hiddenRangeModel && this.hiddenRangeModel.hasRanges()) {
            this.cursorChangedScheduler.schedule();
        }
    }
    revealCursor() {
        const foldingModel = this.getFoldingModel();
        if (!foldingModel) {
            return;
        }
        foldingModel.then(foldingModel => {
            if (foldingModel) {
                const selections = this.editor.getSelections();
                if (selections && selections.length > 0) {
                    const toToggle = [];
                    for (const selection of selections) {
                        const lineNumber = selection.selectionStartLineNumber;
                        if (this.hiddenRangeModel && this.hiddenRangeModel.isHidden(lineNumber)) {
                            toToggle.push(...foldingModel.getAllRegionsAtLine(lineNumber, r => r.isCollapsed && lineNumber > r.startLineNumber));
                        }
                    }
                    if (toToggle.length) {
                        foldingModel.toggleCollapseState(toToggle);
                        this.reveal(selections[0].getPosition());
                    }
                }
            }
        }).then(undefined, onUnexpectedError);
    }
    onEditorMouseDown(e) {
        this.mouseDownInfo = null;
        if (!this.hiddenRangeModel || !e.target || !e.target.range) {
            return;
        }
        if (!e.event.leftButton && !e.event.middleButton) {
            return;
        }
        const range = e.target.range;
        let iconClicked = false;
        switch (e.target.type) {
            case 4 /* MouseTargetType.GUTTER_LINE_DECORATIONS */: {
                const data = e.target.detail;
                const offsetLeftInGutter = e.target.element.offsetLeft;
                const gutterOffsetX = data.offsetX - offsetLeftInGutter;
                // const gutterOffsetX = data.offsetX - data.glyphMarginWidth - data.lineNumbersWidth - data.glyphMarginLeft;
                // TODO@joao TODO@alex TODO@martin this is such that we don't collide with dirty diff
                if (gutterOffsetX < 4) { // the whitespace between the border and the real folding icon border is 4px
                    return;
                }
                iconClicked = true;
                break;
            }
            case 7 /* MouseTargetType.CONTENT_EMPTY */: {
                if (this._unfoldOnClickAfterEndOfLine && this.hiddenRangeModel.hasRanges()) {
                    const data = e.target.detail;
                    if (!data.isAfterLines) {
                        break;
                    }
                }
                return;
            }
            case 6 /* MouseTargetType.CONTENT_TEXT */: {
                if (this.hiddenRangeModel.hasRanges()) {
                    const model = this.editor.getModel();
                    if (model && range.startColumn === model.getLineMaxColumn(range.startLineNumber)) {
                        break;
                    }
                }
                return;
            }
            default:
                return;
        }
        this.mouseDownInfo = { lineNumber: range.startLineNumber, iconClicked };
    }
    onEditorMouseUp(e) {
        const foldingModel = this.foldingModel;
        if (!foldingModel || !this.mouseDownInfo || !e.target) {
            return;
        }
        const lineNumber = this.mouseDownInfo.lineNumber;
        const iconClicked = this.mouseDownInfo.iconClicked;
        const range = e.target.range;
        if (!range || range.startLineNumber !== lineNumber) {
            return;
        }
        if (iconClicked) {
            if (e.target.type !== 4 /* MouseTargetType.GUTTER_LINE_DECORATIONS */) {
                return;
            }
        }
        else {
            const model = this.editor.getModel();
            if (!model || range.startColumn !== model.getLineMaxColumn(lineNumber)) {
                return;
            }
        }
        const region = foldingModel.getRegionAtLine(lineNumber);
        if (region && region.startLineNumber === lineNumber) {
            const isCollapsed = region.isCollapsed;
            if (iconClicked || isCollapsed) {
                const surrounding = e.event.altKey;
                let toToggle = [];
                if (surrounding) {
                    const filter = (otherRegion) => !otherRegion.containedBy(region) && !region.containedBy(otherRegion);
                    const toMaybeToggle = foldingModel.getRegionsInside(null, filter);
                    for (const r of toMaybeToggle) {
                        if (r.isCollapsed) {
                            toToggle.push(r);
                        }
                    }
                    // if any surrounding regions are folded, unfold those. Otherwise, fold all surrounding
                    if (toToggle.length === 0) {
                        toToggle = toMaybeToggle;
                    }
                }
                else {
                    const recursive = e.event.middleButton || e.event.shiftKey;
                    if (recursive) {
                        for (const r of foldingModel.getRegionsInside(region)) {
                            if (r.isCollapsed === isCollapsed) {
                                toToggle.push(r);
                            }
                        }
                    }
                    // when recursive, first only collapse all children. If all are already folded or there are no children, also fold parent.
                    if (isCollapsed || !recursive || toToggle.length === 0) {
                        toToggle.push(region);
                    }
                }
                foldingModel.toggleCollapseState(toToggle);
                this.reveal({ lineNumber, column: 1 });
            }
        }
    }
    reveal(position) {
        this.editor.revealPositionInCenterIfOutsideViewport(position, 0 /* ScrollType.Smooth */);
    }
};
FoldingController = FoldingController_1 = __decorate([
    __param(1, IContextKeyService),
    __param(2, ILanguageConfigurationService),
    __param(3, INotificationService),
    __param(4, ILanguageFeatureDebounceService),
    __param(5, ILanguageFeaturesService)
], FoldingController);
export { FoldingController };
export class RangesLimitReporter extends Disposable {
    constructor(editor) {
        super();
        this.editor = editor;
        this._onDidChange = this._register(new Emitter());
        this._computed = 0;
        this._limited = false;
    }
    get limit() {
        return this.editor.getOptions().get(56 /* EditorOption.foldingMaximumRegions */);
    }
    get onDidChange() { return this._onDidChange.event; }
    get computed() {
        return this._computed;
    }
    get limited() {
        return this._limited;
    }
    update(computed, limited) {
        if (computed !== this._computed || limited !== this._limited) {
            this._computed = computed;
            this._limited = limited;
            this._onDidChange.fire();
        }
    }
}
class FoldingAction extends EditorAction {
    runEditorCommand(accessor, editor, args) {
        const languageConfigurationService = accessor.get(ILanguageConfigurationService);
        const foldingController = FoldingController.get(editor);
        if (!foldingController) {
            return;
        }
        const foldingModelPromise = foldingController.getFoldingModel();
        if (foldingModelPromise) {
            this.reportTelemetry(accessor, editor);
            return foldingModelPromise.then(foldingModel => {
                if (foldingModel) {
                    this.invoke(foldingController, foldingModel, editor, args, languageConfigurationService);
                    const selection = editor.getSelection();
                    if (selection) {
                        foldingController.reveal(selection.getStartPosition());
                    }
                }
            });
        }
    }
    getSelectedLines(editor) {
        const selections = editor.getSelections();
        return selections ? selections.map(s => s.startLineNumber) : [];
    }
    getLineNumbers(args, editor) {
        if (args && args.selectionLines) {
            return args.selectionLines.map(l => l + 1); // to 0-bases line numbers
        }
        return this.getSelectedLines(editor);
    }
    run(_accessor, _editor) {
    }
}
export function toSelectedLines(selections) {
    if (!selections || selections.length === 0) {
        return {
            startsInside: () => false
        };
    }
    return {
        startsInside(startLine, endLine) {
            for (const s of selections) {
                const line = s.startLineNumber;
                if (line >= startLine && line <= endLine) {
                    return true;
                }
            }
            return false;
        }
    };
}
function foldingArgumentsConstraint(args) {
    if (!types.isUndefined(args)) {
        if (!types.isObject(args)) {
            return false;
        }
        const foldingArgs = args;
        if (!types.isUndefined(foldingArgs.levels) && !types.isNumber(foldingArgs.levels)) {
            return false;
        }
        if (!types.isUndefined(foldingArgs.direction) && !types.isString(foldingArgs.direction)) {
            return false;
        }
        if (!types.isUndefined(foldingArgs.selectionLines) && (!Array.isArray(foldingArgs.selectionLines) || !foldingArgs.selectionLines.every(types.isNumber))) {
            return false;
        }
    }
    return true;
}
class UnfoldAction extends FoldingAction {
    constructor() {
        super({
            id: 'editor.unfold',
            label: nls.localize2('unfoldAction.label', "Unfold"),
            precondition: CONTEXT_FOLDING_ENABLED,
            kbOpts: {
                kbExpr: EditorContextKeys.editorTextFocus,
                primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 94 /* KeyCode.BracketRight */,
                mac: {
                    primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 94 /* KeyCode.BracketRight */
                },
                weight: 100 /* KeybindingWeight.EditorContrib */
            },
            metadata: {
                description: 'Unfold the content in the editor',
                args: [
                    {
                        name: 'Unfold editor argument',
                        description: `Property-value pairs that can be passed through this argument:
						* 'levels': Number of levels to unfold. If not set, defaults to 1.
						* 'direction': If 'up', unfold given number of levels up otherwise unfolds down.
						* 'selectionLines': Array of the start lines (0-based) of the editor selections to apply the unfold action to. If not set, the active selection(s) will be used.
						`,
                        constraint: foldingArgumentsConstraint,
                        schema: {
                            'type': 'object',
                            'properties': {
                                'levels': {
                                    'type': 'number',
                                    'default': 1
                                },
                                'direction': {
                                    'type': 'string',
                                    'enum': ['up', 'down'],
                                    'default': 'down'
                                },
                                'selectionLines': {
                                    'type': 'array',
                                    'items': {
                                        'type': 'number'
                                    }
                                }
                            }
                        }
                    }
                ]
            }
        });
    }
    invoke(_foldingController, foldingModel, editor, args) {
        const levels = args && args.levels || 1;
        const lineNumbers = this.getLineNumbers(args, editor);
        if (args && args.direction === 'up') {
            setCollapseStateLevelsUp(foldingModel, false, levels, lineNumbers);
        }
        else {
            setCollapseStateLevelsDown(foldingModel, false, levels, lineNumbers);
        }
    }
}
class UnFoldRecursivelyAction extends FoldingAction {
    constructor() {
        super({
            id: 'editor.unfoldRecursively',
            label: nls.localize2('unFoldRecursivelyAction.label', "Unfold Recursively"),
            precondition: CONTEXT_FOLDING_ENABLED,
            kbOpts: {
                kbExpr: EditorContextKeys.editorTextFocus,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 94 /* KeyCode.BracketRight */),
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
    invoke(_foldingController, foldingModel, editor, _args) {
        setCollapseStateLevelsDown(foldingModel, false, Number.MAX_VALUE, this.getSelectedLines(editor));
    }
}
class FoldAction extends FoldingAction {
    constructor() {
        super({
            id: 'editor.fold',
            label: nls.localize2('foldAction.label', "Fold"),
            precondition: CONTEXT_FOLDING_ENABLED,
            kbOpts: {
                kbExpr: EditorContextKeys.editorTextFocus,
                primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 92 /* KeyCode.BracketLeft */,
                mac: {
                    primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 92 /* KeyCode.BracketLeft */
                },
                weight: 100 /* KeybindingWeight.EditorContrib */
            },
            metadata: {
                description: 'Fold the content in the editor',
                args: [
                    {
                        name: 'Fold editor argument',
                        description: `Property-value pairs that can be passed through this argument:
							* 'levels': Number of levels to fold.
							* 'direction': If 'up', folds given number of levels up otherwise folds down.
							* 'selectionLines': Array of the start lines (0-based) of the editor selections to apply the fold action to. If not set, the active selection(s) will be used.
							If no levels or direction is set, folds the region at the locations or if already collapsed, the first uncollapsed parent instead.
						`,
                        constraint: foldingArgumentsConstraint,
                        schema: {
                            'type': 'object',
                            'properties': {
                                'levels': {
                                    'type': 'number',
                                },
                                'direction': {
                                    'type': 'string',
                                    'enum': ['up', 'down'],
                                },
                                'selectionLines': {
                                    'type': 'array',
                                    'items': {
                                        'type': 'number'
                                    }
                                }
                            }
                        }
                    }
                ]
            }
        });
    }
    invoke(_foldingController, foldingModel, editor, args) {
        const lineNumbers = this.getLineNumbers(args, editor);
        const levels = args && args.levels;
        const direction = args && args.direction;
        if (typeof levels !== 'number' && typeof direction !== 'string') {
            // fold the region at the location or if already collapsed, the first uncollapsed parent instead.
            setCollapseStateUp(foldingModel, true, lineNumbers);
        }
        else {
            if (direction === 'up') {
                setCollapseStateLevelsUp(foldingModel, true, levels || 1, lineNumbers);
            }
            else {
                setCollapseStateLevelsDown(foldingModel, true, levels || 1, lineNumbers);
            }
        }
    }
}
class ToggleFoldAction extends FoldingAction {
    constructor() {
        super({
            id: 'editor.toggleFold',
            label: nls.localize2('toggleFoldAction.label', "Toggle Fold"),
            precondition: CONTEXT_FOLDING_ENABLED,
            kbOpts: {
                kbExpr: EditorContextKeys.editorTextFocus,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 42 /* KeyCode.KeyL */),
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
    invoke(_foldingController, foldingModel, editor) {
        const selectedLines = this.getSelectedLines(editor);
        toggleCollapseState(foldingModel, 1, selectedLines);
    }
}
class FoldRecursivelyAction extends FoldingAction {
    constructor() {
        super({
            id: 'editor.foldRecursively',
            label: nls.localize2('foldRecursivelyAction.label', "Fold Recursively"),
            precondition: CONTEXT_FOLDING_ENABLED,
            kbOpts: {
                kbExpr: EditorContextKeys.editorTextFocus,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 92 /* KeyCode.BracketLeft */),
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
    invoke(_foldingController, foldingModel, editor) {
        const selectedLines = this.getSelectedLines(editor);
        setCollapseStateLevelsDown(foldingModel, true, Number.MAX_VALUE, selectedLines);
    }
}
class ToggleFoldRecursivelyAction extends FoldingAction {
    constructor() {
        super({
            id: 'editor.toggleFoldRecursively',
            label: nls.localize2('toggleFoldRecursivelyAction.label', "Toggle Fold Recursively"),
            precondition: CONTEXT_FOLDING_ENABLED,
            kbOpts: {
                kbExpr: EditorContextKeys.editorTextFocus,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 42 /* KeyCode.KeyL */),
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
    invoke(_foldingController, foldingModel, editor) {
        const selectedLines = this.getSelectedLines(editor);
        toggleCollapseState(foldingModel, Number.MAX_VALUE, selectedLines);
    }
}
class FoldAllBlockCommentsAction extends FoldingAction {
    constructor() {
        super({
            id: 'editor.foldAllBlockComments',
            label: nls.localize2('foldAllBlockComments.label', "Fold All Block Comments"),
            precondition: CONTEXT_FOLDING_ENABLED,
            kbOpts: {
                kbExpr: EditorContextKeys.editorTextFocus,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 90 /* KeyCode.Slash */),
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
    invoke(_foldingController, foldingModel, editor, args, languageConfigurationService) {
        if (foldingModel.regions.hasTypes()) {
            setCollapseStateForType(foldingModel, FoldingRangeKind.Comment.value, true);
        }
        else {
            const editorModel = editor.getModel();
            if (!editorModel) {
                return;
            }
            const comments = languageConfigurationService.getLanguageConfiguration(editorModel.getLanguageId()).comments;
            if (comments && comments.blockCommentStartToken) {
                const regExp = new RegExp('^\\s*' + escapeRegExpCharacters(comments.blockCommentStartToken));
                setCollapseStateForMatchingLines(foldingModel, regExp, true);
            }
        }
    }
}
class FoldAllRegionsAction extends FoldingAction {
    constructor() {
        super({
            id: 'editor.foldAllMarkerRegions',
            label: nls.localize2('foldAllMarkerRegions.label', "Fold All Regions"),
            precondition: CONTEXT_FOLDING_ENABLED,
            kbOpts: {
                kbExpr: EditorContextKeys.editorTextFocus,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 29 /* KeyCode.Digit8 */),
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
    invoke(_foldingController, foldingModel, editor, args, languageConfigurationService) {
        if (foldingModel.regions.hasTypes()) {
            setCollapseStateForType(foldingModel, FoldingRangeKind.Region.value, true);
        }
        else {
            const editorModel = editor.getModel();
            if (!editorModel) {
                return;
            }
            const foldingRules = languageConfigurationService.getLanguageConfiguration(editorModel.getLanguageId()).foldingRules;
            if (foldingRules && foldingRules.markers && foldingRules.markers.start) {
                const regExp = new RegExp(foldingRules.markers.start);
                setCollapseStateForMatchingLines(foldingModel, regExp, true);
            }
        }
    }
}
class UnfoldAllRegionsAction extends FoldingAction {
    constructor() {
        super({
            id: 'editor.unfoldAllMarkerRegions',
            label: nls.localize2('unfoldAllMarkerRegions.label', "Unfold All Regions"),
            precondition: CONTEXT_FOLDING_ENABLED,
            kbOpts: {
                kbExpr: EditorContextKeys.editorTextFocus,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 30 /* KeyCode.Digit9 */),
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
    invoke(_foldingController, foldingModel, editor, args, languageConfigurationService) {
        if (foldingModel.regions.hasTypes()) {
            setCollapseStateForType(foldingModel, FoldingRangeKind.Region.value, false);
        }
        else {
            const editorModel = editor.getModel();
            if (!editorModel) {
                return;
            }
            const foldingRules = languageConfigurationService.getLanguageConfiguration(editorModel.getLanguageId()).foldingRules;
            if (foldingRules && foldingRules.markers && foldingRules.markers.start) {
                const regExp = new RegExp(foldingRules.markers.start);
                setCollapseStateForMatchingLines(foldingModel, regExp, false);
            }
        }
    }
}
class FoldAllExceptAction extends FoldingAction {
    constructor() {
        super({
            id: 'editor.foldAllExcept',
            label: nls.localize2('foldAllExcept.label', "Fold All Except Selected"),
            precondition: CONTEXT_FOLDING_ENABLED,
            kbOpts: {
                kbExpr: EditorContextKeys.editorTextFocus,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 88 /* KeyCode.Minus */),
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
    invoke(_foldingController, foldingModel, editor) {
        const selectedLines = this.getSelectedLines(editor);
        setCollapseStateForRest(foldingModel, true, selectedLines);
    }
}
class UnfoldAllExceptAction extends FoldingAction {
    constructor() {
        super({
            id: 'editor.unfoldAllExcept',
            label: nls.localize2('unfoldAllExcept.label', "Unfold All Except Selected"),
            precondition: CONTEXT_FOLDING_ENABLED,
            kbOpts: {
                kbExpr: EditorContextKeys.editorTextFocus,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 86 /* KeyCode.Equal */),
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
    invoke(_foldingController, foldingModel, editor) {
        const selectedLines = this.getSelectedLines(editor);
        setCollapseStateForRest(foldingModel, false, selectedLines);
    }
}
class FoldAllAction extends FoldingAction {
    constructor() {
        super({
            id: 'editor.foldAll',
            label: nls.localize2('foldAllAction.label', "Fold All"),
            precondition: CONTEXT_FOLDING_ENABLED,
            kbOpts: {
                kbExpr: EditorContextKeys.editorTextFocus,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 21 /* KeyCode.Digit0 */),
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
    invoke(_foldingController, foldingModel, _editor) {
        setCollapseStateLevelsDown(foldingModel, true);
    }
}
class UnfoldAllAction extends FoldingAction {
    constructor() {
        super({
            id: 'editor.unfoldAll',
            label: nls.localize2('unfoldAllAction.label', "Unfold All"),
            precondition: CONTEXT_FOLDING_ENABLED,
            kbOpts: {
                kbExpr: EditorContextKeys.editorTextFocus,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 40 /* KeyCode.KeyJ */),
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
    invoke(_foldingController, foldingModel, _editor) {
        setCollapseStateLevelsDown(foldingModel, false);
    }
}
class FoldLevelAction extends FoldingAction {
    static { this.ID_PREFIX = 'editor.foldLevel'; }
    static { this.ID = (level) => FoldLevelAction.ID_PREFIX + level; }
    getFoldingLevel() {
        return parseInt(this.id.substr(FoldLevelAction.ID_PREFIX.length));
    }
    invoke(_foldingController, foldingModel, editor) {
        setCollapseStateAtLevel(foldingModel, this.getFoldingLevel(), true, this.getSelectedLines(editor));
    }
}
/** Action to go to the parent fold of current line */
class GotoParentFoldAction extends FoldingAction {
    constructor() {
        super({
            id: 'editor.gotoParentFold',
            label: nls.localize2('gotoParentFold.label', "Go to Parent Fold"),
            precondition: CONTEXT_FOLDING_ENABLED,
            kbOpts: {
                kbExpr: EditorContextKeys.editorTextFocus,
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
    invoke(_foldingController, foldingModel, editor) {
        const selectedLines = this.getSelectedLines(editor);
        if (selectedLines.length > 0) {
            const startLineNumber = getParentFoldLine(selectedLines[0], foldingModel);
            if (startLineNumber !== null) {
                editor.setSelection({
                    startLineNumber: startLineNumber,
                    startColumn: 1,
                    endLineNumber: startLineNumber,
                    endColumn: 1
                });
            }
        }
    }
}
/** Action to go to the previous fold of current line */
class GotoPreviousFoldAction extends FoldingAction {
    constructor() {
        super({
            id: 'editor.gotoPreviousFold',
            label: nls.localize2('gotoPreviousFold.label', "Go to Previous Folding Range"),
            precondition: CONTEXT_FOLDING_ENABLED,
            kbOpts: {
                kbExpr: EditorContextKeys.editorTextFocus,
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
    invoke(_foldingController, foldingModel, editor) {
        const selectedLines = this.getSelectedLines(editor);
        if (selectedLines.length > 0) {
            const startLineNumber = getPreviousFoldLine(selectedLines[0], foldingModel);
            if (startLineNumber !== null) {
                editor.setSelection({
                    startLineNumber: startLineNumber,
                    startColumn: 1,
                    endLineNumber: startLineNumber,
                    endColumn: 1
                });
            }
        }
    }
}
/** Action to go to the next fold of current line */
class GotoNextFoldAction extends FoldingAction {
    constructor() {
        super({
            id: 'editor.gotoNextFold',
            label: nls.localize2('gotoNextFold.label', "Go to Next Folding Range"),
            precondition: CONTEXT_FOLDING_ENABLED,
            kbOpts: {
                kbExpr: EditorContextKeys.editorTextFocus,
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
    invoke(_foldingController, foldingModel, editor) {
        const selectedLines = this.getSelectedLines(editor);
        if (selectedLines.length > 0) {
            const startLineNumber = getNextFoldLine(selectedLines[0], foldingModel);
            if (startLineNumber !== null) {
                editor.setSelection({
                    startLineNumber: startLineNumber,
                    startColumn: 1,
                    endLineNumber: startLineNumber,
                    endColumn: 1
                });
            }
        }
    }
}
class FoldRangeFromSelectionAction extends FoldingAction {
    constructor() {
        super({
            id: 'editor.createFoldingRangeFromSelection',
            label: nls.localize2('createManualFoldRange.label', "Create Folding Range from Selection"),
            precondition: CONTEXT_FOLDING_ENABLED,
            kbOpts: {
                kbExpr: EditorContextKeys.editorTextFocus,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 87 /* KeyCode.Comma */),
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
    invoke(_foldingController, foldingModel, editor) {
        const collapseRanges = [];
        const selections = editor.getSelections();
        if (selections) {
            for (const selection of selections) {
                let endLineNumber = selection.endLineNumber;
                if (selection.endColumn === 1) {
                    --endLineNumber;
                }
                if (endLineNumber > selection.startLineNumber) {
                    collapseRanges.push({
                        startLineNumber: selection.startLineNumber,
                        endLineNumber: endLineNumber,
                        type: undefined,
                        isCollapsed: true,
                        source: 1 /* FoldSource.userDefined */
                    });
                    editor.setSelection({
                        startLineNumber: selection.startLineNumber,
                        startColumn: 1,
                        endLineNumber: selection.startLineNumber,
                        endColumn: 1
                    });
                }
            }
            if (collapseRanges.length > 0) {
                collapseRanges.sort((a, b) => {
                    return a.startLineNumber - b.startLineNumber;
                });
                const newRanges = FoldingRegions.sanitizeAndMerge(foldingModel.regions, collapseRanges, editor.getModel()?.getLineCount());
                foldingModel.updatePost(FoldingRegions.fromFoldRanges(newRanges));
            }
        }
    }
}
class RemoveFoldRangeFromSelectionAction extends FoldingAction {
    constructor() {
        super({
            id: 'editor.removeManualFoldingRanges',
            label: nls.localize2('removeManualFoldingRanges.label', "Remove Manual Folding Ranges"),
            precondition: CONTEXT_FOLDING_ENABLED,
            kbOpts: {
                kbExpr: EditorContextKeys.editorTextFocus,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 89 /* KeyCode.Period */),
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
    invoke(foldingController, foldingModel, editor) {
        const selections = editor.getSelections();
        if (selections) {
            const ranges = [];
            for (const selection of selections) {
                const { startLineNumber, endLineNumber } = selection;
                ranges.push(endLineNumber >= startLineNumber ? { startLineNumber, endLineNumber } : { endLineNumber, startLineNumber });
            }
            foldingModel.removeManualRanges(ranges);
            foldingController.triggerFoldingModelChanged();
        }
    }
}
class ToggleImportFoldAction extends FoldingAction {
    constructor() {
        super({
            id: 'editor.toggleImportFold',
            label: nls.localize2('toggleImportFold.label', "Toggle Import Fold"),
            precondition: CONTEXT_FOLDING_ENABLED,
            kbOpts: {
                kbExpr: EditorContextKeys.editorTextFocus,
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
    async invoke(foldingController, foldingModel) {
        const regionsToToggle = [];
        const regions = foldingModel.regions;
        for (let i = regions.length - 1; i >= 0; i--) {
            if (regions.getType(i) === FoldingRangeKind.Imports.value) {
                regionsToToggle.push(regions.toRegion(i));
            }
        }
        foldingModel.toggleCollapseState(regionsToToggle);
        foldingController.triggerFoldingModelChanged();
    }
}
registerEditorContribution(FoldingController.ID, FoldingController, 0 /* EditorContributionInstantiation.Eager */); // eager because it uses `saveViewState`/`restoreViewState`
registerEditorAction(UnfoldAction);
registerEditorAction(UnFoldRecursivelyAction);
registerEditorAction(FoldAction);
registerEditorAction(FoldRecursivelyAction);
registerEditorAction(ToggleFoldRecursivelyAction);
registerEditorAction(FoldAllAction);
registerEditorAction(UnfoldAllAction);
registerEditorAction(FoldAllBlockCommentsAction);
registerEditorAction(FoldAllRegionsAction);
registerEditorAction(UnfoldAllRegionsAction);
registerEditorAction(FoldAllExceptAction);
registerEditorAction(UnfoldAllExceptAction);
registerEditorAction(ToggleFoldAction);
registerEditorAction(GotoParentFoldAction);
registerEditorAction(GotoPreviousFoldAction);
registerEditorAction(GotoNextFoldAction);
registerEditorAction(FoldRangeFromSelectionAction);
registerEditorAction(RemoveFoldRangeFromSelectionAction);
registerEditorAction(ToggleImportFoldAction);
for (let i = 1; i <= 7; i++) {
    registerInstantiatedEditorAction(new FoldLevelAction({
        id: FoldLevelAction.ID(i),
        label: nls.localize2('foldLevelAction.label', "Fold Level {0}", i),
        precondition: CONTEXT_FOLDING_ENABLED,
        kbOpts: {
            kbExpr: EditorContextKeys.editorTextFocus,
            primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | (21 /* KeyCode.Digit0 */ + i)),
            weight: 100 /* KeybindingWeight.EditorContrib */
        }
    }));
}
CommandsRegistry.registerCommand('_executeFoldingRangeProvider', async function (accessor, ...args) {
    const [resource] = args;
    if (!(resource instanceof URI)) {
        throw illegalArgument();
    }
    const languageFeaturesService = accessor.get(ILanguageFeaturesService);
    const model = accessor.get(IModelService).getModel(resource);
    if (!model) {
        throw illegalArgument();
    }
    const configurationService = accessor.get(IConfigurationService);
    if (!configurationService.getValue('editor.folding', { resource })) {
        return [];
    }
    const languageConfigurationService = accessor.get(ILanguageConfigurationService);
    const strategy = configurationService.getValue('editor.foldingStrategy', { resource });
    const foldingLimitReporter = {
        get limit() {
            return configurationService.getValue('editor.foldingMaximumRegions', { resource });
        },
        update: (computed, limited) => { }
    };
    const indentRangeProvider = new IndentRangeProvider(model, languageConfigurationService, foldingLimitReporter);
    let rangeProvider = indentRangeProvider;
    if (strategy !== 'indentation') {
        const providers = FoldingController.getFoldingRangeProviders(languageFeaturesService, model);
        if (providers.length) {
            rangeProvider = new SyntaxRangeProvider(model, providers, () => { }, foldingLimitReporter, indentRangeProvider);
        }
    }
    const ranges = await rangeProvider.compute(CancellationToken.None);
    const result = [];
    try {
        if (ranges) {
            for (let i = 0; i < ranges.length; i++) {
                const type = ranges.getType(i);
                result.push({ start: ranges.getStartLineNumber(i), end: ranges.getEndLineNumber(i), kind: type ? FoldingRangeKind.fromValue(type) : undefined });
            }
        }
        return result;
    }
    finally {
        rangeProvider.dispose();
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZm9sZGluZy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL2ZvbGRpbmcvYnJvd3Nlci9mb2xkaW5nLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQXFCLHVCQUF1QixFQUFFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pILE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxlQUFlLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN2RixPQUFPLEVBQUUsUUFBUSxFQUFtQixNQUFNLHFDQUFxQyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFlLE1BQU0sc0NBQXNDLENBQUM7QUFDaEcsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDNUUsT0FBTyxLQUFLLEtBQUssTUFBTSxrQ0FBa0MsQ0FBQztBQUMxRCxPQUFPLGVBQWUsQ0FBQztBQUN2QixPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUVqRixPQUFPLEVBQUUsWUFBWSxFQUFtQyxvQkFBb0IsRUFBRSwwQkFBMEIsRUFBRSxnQ0FBZ0MsRUFBb0IsTUFBTSxzQ0FBc0MsQ0FBQztBQU0zTSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUd6RSxPQUFPLEVBQWdCLGdCQUFnQixFQUF3QixNQUFNLDhCQUE4QixDQUFDO0FBQ3BHLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQzNHLE9BQU8sRUFBbUIsWUFBWSxFQUFFLGVBQWUsRUFBRSxpQkFBaUIsRUFBRSxtQkFBbUIsRUFBRSx1QkFBdUIsRUFBRSxn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
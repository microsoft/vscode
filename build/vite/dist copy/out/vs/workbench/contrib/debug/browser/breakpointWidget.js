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
import * as dom from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { SelectBox } from '../../../../base/browser/ui/selectBox/selectBox.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import * as lifecycle from '../../../../base/common/lifecycle.js';
import { URI as uri } from '../../../../base/common/uri.js';
import { EditorCommand, registerEditorCommand } from '../../../../editor/browser/editorExtensions.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { CodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../../editor/common/languages/modesRegistry.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { CompletionOptions, provideSuggestionItems } from '../../../../editor/contrib/suggest/browser/suggest.js';
import { ZoneWidget } from '../../../../editor/contrib/zoneWidget/browser/zoneWidget.js';
import * as nls from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService, createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { defaultButtonStyles, defaultSelectBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { editorForeground } from '../../../../platform/theme/common/colorRegistry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { hasNativeContextMenu } from '../../../../platform/window/common/window.js';
import { getSimpleCodeEditorWidgetOptions, getSimpleEditorOptions } from '../../codeEditor/browser/simpleEditorOptions.js';
import { BREAKPOINT_EDITOR_CONTRIBUTION_ID, CONTEXT_BREAKPOINT_WIDGET_VISIBLE, CONTEXT_IN_BREAKPOINT_WIDGET, DEBUG_SCHEME, IDebugService } from '../common/debug.js';
import './media/breakpointWidget.css';
const $ = dom.$;
const IPrivateBreakpointWidgetService = createDecorator('privateBreakpointWidgetService');
const DECORATION_KEY = 'breakpointwidgetdecoration';
function isPositionInCurlyBracketBlock(input) {
    const model = input.getModel();
    const bracketPairs = model.bracketPairs.getBracketPairsInRange(Range.fromPositions(input.getPosition()));
    return bracketPairs.some(p => p.openingBracketInfo.bracketText === '{');
}
function createDecorations(theme, placeHolder) {
    const transparentForeground = theme.getColor(editorForeground)?.transparent(0.4);
    return [{
            range: {
                startLineNumber: 0,
                endLineNumber: 0,
                startColumn: 0,
                endColumn: 1
            },
            renderOptions: {
                after: {
                    contentText: placeHolder,
                    color: transparentForeground ? transparentForeground.toString() : undefined
                }
            }
        }];
}
let BreakpointWidget = class BreakpointWidget extends ZoneWidget {
    constructor(editor, lineNumber, column, context, contextViewService, debugService, themeService, instantiationService, modelService, codeEditorService, _configurationService, languageFeaturesService, keybindingService, labelService, textModelService, hoverService) {
        super(editor, { showFrame: true, showArrow: false, frameWidth: 1, isAccessible: true });
        this.lineNumber = lineNumber;
        this.column = column;
        this.contextViewService = contextViewService;
        this.debugService = debugService;
        this.themeService = themeService;
        this.instantiationService = instantiationService;
        this.modelService = modelService;
        this.codeEditorService = codeEditorService;
        this._configurationService = _configurationService;
        this.languageFeaturesService = languageFeaturesService;
        this.keybindingService = keybindingService;
        this.labelService = labelService;
        this.textModelService = textModelService;
        this.hoverService = hoverService;
        this.conditionInput = '';
        this.hitCountInput = '';
        this.logMessageInput = '';
        this.availableBreakpoints = [];
        this.store = new lifecycle.DisposableStore();
        const model = this.editor.getModel();
        if (model) {
            const uri = model.uri;
            const breakpoints = this.debugService.getModel().getBreakpoints({ lineNumber: this.lineNumber, column: this.column, uri });
            this.breakpoint = breakpoints.length ? breakpoints[0] : undefined;
        }
        if (context === undefined) {
            if (this.breakpoint && !this.breakpoint.condition && !this.breakpoint.hitCondition && this.breakpoint.logMessage) {
                this.context = 2 /* Context.LOG_MESSAGE */;
            }
            else if (this.breakpoint && !this.breakpoint.condition && this.breakpoint.hitCondition) {
                this.context = 1 /* Context.HIT_COUNT */;
            }
            else if (this.breakpoint && this.breakpoint.triggeredBy) {
                this.context = 3 /* Context.TRIGGER_POINT */;
            }
            else {
                this.context = 0 /* Context.CONDITION */;
            }
        }
        else {
            this.context = context;
        }
        this.store.add(this.debugService.getModel().onDidChangeBreakpoints(e => {
            if (this.breakpoint && e && e.removed && e.removed.indexOf(this.breakpoint) >= 0) {
                this.dispose();
            }
            // Update the breakpoint list when in trigger point context
            if (this.context === 3 /* Context.TRIGGER_POINT */ && this.selectBreakpointBox) {
                this.updateTriggerBreakpointList();
            }
        }));
        this.store.add(this.codeEditorService.registerDecorationType('breakpoint-widget', DECORATION_KEY, {}));
        this.create();
    }
    get placeholder() {
        const acceptString = this.keybindingService.lookupKeybinding(AcceptBreakpointWidgetInputAction.ID)?.getLabel() || 'Enter';
        const closeString = this.keybindingService.lookupKeybinding(CloseBreakpointWidgetCommand.ID)?.getLabel() || 'Escape';
        switch (this.context) {
            case 2 /* Context.LOG_MESSAGE */:
                return nls.localize('breakpointWidgetLogMessagePlaceholder', "Message to log when breakpoint is hit. Expressions within {} are interpolated. '{0}' to accept, '{1}' to cancel.", acceptString, closeString);
            case 1 /* Context.HIT_COUNT */:
                return nls.localize('breakpointWidgetHitCountPlaceholder', "Break when hit count condition is met. '{0}' to accept, '{1}' to cancel.", acceptString, closeString);
            default:
                return nls.localize('breakpointWidgetExpressionPlaceholder', "Break when expression evaluates to true. '{0}' to accept, '{1}' to cancel.", acceptString, closeString);
        }
    }
    getInputValue(breakpoint) {
        switch (this.context) {
            case 2 /* Context.LOG_MESSAGE */:
                return breakpoint && breakpoint.logMessage ? breakpoint.logMessage : this.logMessageInput;
            case 1 /* Context.HIT_COUNT */:
                return breakpoint && breakpoint.hitCondition ? breakpoint.hitCondition : this.hitCountInput;
            default:
                return breakpoint && breakpoint.condition ? breakpoint.condition : this.conditionInput;
        }
    }
    rememberInput() {
        if (this.context !== 3 /* Context.TRIGGER_POINT */) {
            const value = this.input.getModel().getValue();
            switch (this.context) {
                case 2 /* Context.LOG_MESSAGE */:
                    this.logMessageInput = value;
                    break;
                case 1 /* Context.HIT_COUNT */:
                    this.hitCountInput = value;
                    break;
                default:
                    this.conditionInput = value;
            }
        }
    }
    setInputMode() {
        if (this.editor.hasModel()) {
            // Use plaintext language for log messages, otherwise respect underlying editor language #125619
            const languageId = this.context === 2 /* Context.LOG_MESSAGE */ ? PLAINTEXT_LANGUAGE_ID : this.editor.getModel().getLanguageId();
            this.input.getModel().setLanguage(languageId);
        }
    }
    show(rangeOrPos) {
        const lineNum = this.input.getModel().getLineCount();
        super.show(rangeOrPos, lineNum + 1);
    }
    fitHeightToContent() {
        const lineNum = this.input.getModel().getLineCount();
        this._relayout(lineNum + 1);
    }
    _fillContainer(container) {
        this.setCssClass('breakpoint-widget');
        const selectBox = this.store.add(new SelectBox([
            { text: nls.localize('expression', "Expression") },
            { text: nls.localize('hitCount', "Hit Count") },
            { text: nls.localize('logMessage', "Log Message") },
            { text: nls.localize('triggeredBy', "Wait for Breakpoint") },
        ], this.context, this.contextViewService, defaultSelectBoxStyles, { ariaLabel: nls.localize('breakpointType', 'Breakpoint Type'), useCustomDrawn: !hasNativeContextMenu(this._configurationService) }));
        this.selectContainer = $('.breakpoint-select-container');
        selectBox.render(dom.append(container, this.selectContainer));
        this.store.add(selectBox.onDidSelect(e => {
            this.rememberInput();
            this.context = e.index;
            this.updateContextInput();
        }));
        this.createModesInput(container);
        this.inputContainer = $('.inputContainer');
        this.store.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), this.inputContainer, this.placeholder));
        this.createBreakpointInput(dom.append(container, this.inputContainer));
        this.input.getModel().setValue(this.getInputValue(this.breakpoint));
        this.store.add(this.input.getModel().onDidChangeContent(() => {
            this.fitHeightToContent();
        }));
        this.input.setPosition({ lineNumber: 1, column: this.input.getModel().getLineMaxColumn(1) });
        this.createTriggerBreakpointInput(container);
        this.updateContextInput();
        // Due to an electron bug we have to do the timeout, otherwise we do not get focus
        setTimeout(() => this.focusInput(), 150);
    }
    createModesInput(container) {
        const modes = this.debugService.getModel().getBreakpointModes('source');
        if (modes.length <= 1) {
            return;
        }
        const sb = this.selectModeBox = new SelectBox([
            { text: nls.localize('bpMode', 'Mode'), isDisabled: true },
            ...modes.map(mode => ({ text: mode.label, description: mode.description })),
        ], modes.findIndex(m => m.mode === this.breakpoint?.mode) + 1, this.contextViewService, defaultSelectBoxStyles, { useCustomDrawn: !hasNativeContextMenu(this._configurationService) });
        this.store.add(sb);
        this.store.add(sb.onDidSelect(e => {
            this.modeInput = modes[e.index - 1];
        }));
        const modeWrapper = $('.select-mode-container');
        const selectionWrapper = $('.select-box-container');
        dom.append(modeWrapper, selectionWrapper);
        sb.render(selectionWrapper);
        dom.append(container, modeWrapper);
    }
    createTriggerBreakpointInput(container) {
        this.availableBreakpoints = this.debugService.getModel().getBreakpoints().filter(bp => bp !== this.breakpoint && !bp.logMessage);
        const breakpointOptions = this.buildBreakpointOptions();
        const index = this.availableBreakpoints.findIndex((bp) => this.breakpoint?.triggeredBy === bp.getId());
        if (index !== -1) {
            this.triggeredByBreakpointInput = this.availableBreakpoints[index];
        }
        const selectBreakpointBox = this.selectBreakpointBox = this.store.add(new SelectBox(breakpointOptions, index + 1, this.contextViewService, defaultSelectBoxStyles, { ariaLabel: nls.localize('selectBreakpoint', 'Select breakpoint'), useCustomDrawn: !hasNativeContextMenu(this._configurationService) }));
        this.store.add(selectBreakpointBox.onDidSelect(e => {
            if (e.index === 0) {
                this.triggeredByBreakpointInput = undefined;
            }
            else {
                this.triggeredByBreakpointInput = this.availableBreakpoints[e.index - 1];
            }
        }));
        this.selectBreakpointContainer = $('.select-breakpoint-container');
        this.store.add(dom.addDisposableListener(this.selectBreakpointContainer, dom.EventType.KEY_DOWN, e => {
            const event = new StandardKeyboardEvent(e);
            if (event.equals(9 /* KeyCode.Escape */)) {
                this.close(false);
            }
        }));
        const selectionWrapper = $('.select-box-container');
        dom.append(this.selectBreakpointContainer, selectionWrapper);
        selectBreakpointBox.render(selectionWrapper);
        dom.append(container, this.selectBreakpointContainer);
        const closeButton = new Button(this.selectBreakpointContainer, defaultButtonStyles);
        closeButton.label = nls.localize('ok', "OK");
        this.store.add(closeButton.onDidClick(() => this.close(true)));
        this.store.add(closeButton);
    }
    buildBreakpointOptions() {
        const breakpointOptions = [
            { text: nls.localize('noTriggerByBreakpoint', 'None'), isDisabled: true },
            ...this.availableBreakpoints.map(bp => ({
                text: `${this.labelService.getUriLabel(bp.uri, { relative: true })}: ${bp.lineNumber}`,
                description: nls.localize('triggerByLoading', 'Loading...')
            })),
        ];
        // Load the source code for each breakpoint asynchronously
        for (const [i, bp] of this.availableBreakpoints.entries()) {
            this.textModelService.createModelReference(bp.uri).then(ref => {
                try {
                    breakpointOptions[i + 1].description = ref.object.textEditorModel.getLineContent(bp.lineNumber).trim();
                }
                finally {
                    ref.dispose();
                }
            }).catch(() => {
                breakpointOptions[i + 1].description = nls.localize('noBpSource', 'Could not load source.');
            });
        }
        return breakpointOptions;
    }
    updateTriggerBreakpointList() {
        this.availableBreakpoints = this.debugService.getModel().getBreakpoints().filter(bp => bp !== this.breakpoint && !bp.logMessage);
        // Try to preserve the current selection if the breakpoint still exists
        let selectedIndex = 0; // Default to "None"
        if (this.triggeredByBreakpointInput) {
            const newIndex = this.availableBreakpoints.findIndex(bp => bp.getId() === this.triggeredByBreakpointInput?.getId());
            if (newIndex !== -1) {
                selectedIndex = newIndex + 1;
            }
            else {
                // The selected breakpoint was removed, clear the selection
                this.triggeredByBreakpointInput = undefined;
            }
        }
        const breakpointOptions = this.buildBreakpointOptions();
        this.selectBreakpointBox.setOptions(breakpointOptions, selectedIndex);
    }
    updateContextInput() {
        if (this.context === 3 /* Context.TRIGGER_POINT */) {
            this.inputContainer.hidden = true;
            this.selectBreakpointContainer.hidden = false;
            // Update the breakpoint list when switching to trigger point context
            if (this.selectBreakpointBox) {
                this.updateTriggerBreakpointList();
            }
        }
        else {
            this.inputContainer.hidden = false;
            this.selectBreakpointContainer.hidden = true;
            this.setInputMode();
            const value = this.getInputValue(this.breakpoint);
            this.input.getModel().setValue(value);
            this.focusInput();
        }
    }
    _doLayout(heightInPixel, widthInPixel) {
        this.heightInPx = heightInPixel;
        this.input.layout({ height: heightInPixel, width: widthInPixel - 113 });
        this.centerInputVertically();
    }
    _onWidth(widthInPixel) {
        if (typeof this.heightInPx === 'number') {
            this._doLayout(this.heightInPx, widthInPixel);
        }
    }
    createBreakpointInput(container) {
        const scopedInstatiationService = this.instantiationService.createChild(new ServiceCollection([IPrivateBreakpointWidgetService, this]));
        this.store.add(scopedInstatiationService);
        const options = this.createEditorOptions();
        const codeEditorWidgetOptions = getSimpleCodeEditorWidgetOptions();
        this.input = scopedInstatiationService.createInstance(CodeEditorWidget, container, options, codeEditorWidgetOptions);
        CONTEXT_IN_BREAKPOINT_WIDGET.bindTo(this.input.contextKeyService).set(true);
        const model = this.modelService.createModel('', null, uri.parse(`${DEBUG_SCHEME}:${this.editor.getId()}:breakpointinput`), true);
        if (this.editor.hasModel()) {
            model.setLanguage(this.editor.getModel().getLanguageId());
        }
        this.input.setModel(model);
        this.setInputMode();
        this.store.add(model);
        const setDecorations = () => {
            const value = this.input.getModel().getValue();
            const decorations = !!value ? [] : createDecorations(this.themeService.getColorTheme(), this.placeholder);
            this.input.setDecorationsByType('breakpoint-widget', DECORATION_KEY, decorations);
        };
        this.store.add(this.input.getModel().onDidChangeContent(() => setDecorations()));
        this.store.add(this.themeService.onDidColorThemeChange(() => setDecorations()));
        this.store.add(this.languageFeaturesService.completionProvider.register({ scheme: DEBUG_SCHEME, hasAccessToAllModels: true }, {
            _debugDisplayName: 'breakpointWidget',
            provideCompletionItems: (model, position, _context, token) => {
                let suggestionsPromise;
                const underlyingModel = this.editor.getModel();
                if (underlyingModel && (this.context === 0 /* Context.CONDITION */ || (this.context === 2 /* Context.LOG_MESSAGE */ && isPositionInCurlyBracketBlock(this.input)))) {
                    suggestionsPromise = provideSuggestionItems(this.languageFeaturesService.completionProvider, underlyingModel, new Position(this.lineNumber, 1), new CompletionOptions(undefined, new Set().add(28 /* CompletionItemKind.Snippet */)), _context, token).then(suggestions => {
                        let overwriteBefore = 0;
                        if (this.context === 0 /* Context.CONDITION */) {
                            overwriteBefore = position.column - 1;
                        }
                        else {
                            // Inside the currly brackets, need to count how many useful characters are behind the position so they would all be taken into account
                            const value = this.input.getModel().getValue();
                            while ((position.column - 2 - overwriteBefore >= 0) && value[position.column - 2 - overwriteBefore] !== '{' && value[position.column - 2 - overwriteBefore] !== ' ') {
                                overwriteBefore++;
                            }
                        }
                        return {
                            suggestions: suggestions.items.map(s => {
                                s.completion.range = Range.fromPositions(position.delta(0, -overwriteBefore), position);
                                return s.completion;
                            })
                        };
                    });
                }
                else {
                    suggestionsPromise = Promise.resolve({ suggestions: [] });
                }
                return suggestionsPromise;
            }
        }));
        this.store.add(this._configurationService.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('editor.fontSize') || e.affectsConfiguration('editor.lineHeight')) {
                this.input.updateOptions(this.createEditorOptions());
                this.centerInputVertically();
            }
        }));
    }
    createEditorOptions() {
        const editorConfig = this._configurationService.getValue('editor');
        const options = getSimpleEditorOptions(this._configurationService);
        options.fontSize = editorConfig.fontSize;
        options.fontFamily = editorConfig.fontFamily;
        options.lineHeight = editorConfig.lineHeight;
        options.fontLigatures = editorConfig.fontLigatures;
        options.ariaLabel = this.placeholder;
        return options;
    }
    centerInputVertically() {
        if (this.container && typeof this.heightInPx === 'number') {
            const lineHeight = this.input.getOption(75 /* EditorOption.lineHeight */);
            const lineNum = this.input.getModel().getLineCount();
            const newTopMargin = (this.heightInPx - lineNum * lineHeight) / 2;
            this.inputContainer.style.marginTop = newTopMargin + 'px';
        }
    }
    close(success) {
        if (success) {
            // if there is already a breakpoint on this location - remove it.
            let condition = undefined;
            let hitCondition = undefined;
            let logMessage = undefined;
            let triggeredBy = undefined;
            let mode = undefined;
            let modeLabel = undefined;
            this.rememberInput();
            if (this.conditionInput || this.context === 0 /* Context.CONDITION */) {
                condition = this.conditionInput;
            }
            if (this.hitCountInput || this.context === 1 /* Context.HIT_COUNT */) {
                hitCondition = this.hitCountInput;
            }
            if (this.logMessageInput || this.context === 2 /* Context.LOG_MESSAGE */) {
                logMessage = this.logMessageInput;
            }
            if (this.selectModeBox) {
                mode = this.modeInput?.mode;
                modeLabel = this.modeInput?.label;
            }
            if (this.context === 3 /* Context.TRIGGER_POINT */) {
                // currently, trigger points don't support additional conditions:
                condition = undefined;
                hitCondition = undefined;
                logMessage = undefined;
                triggeredBy = this.triggeredByBreakpointInput?.getId();
            }
            if (this.breakpoint) {
                const data = new Map();
                data.set(this.breakpoint.getId(), {
                    condition,
                    hitCondition,
                    logMessage,
                    triggeredBy,
                    mode,
                    modeLabel,
                });
                this.debugService.updateBreakpoints(this.breakpoint.originalUri, data, false).then(undefined, onUnexpectedError);
            }
            else {
                const model = this.editor.getModel();
                if (model) {
                    this.debugService.addBreakpoints(model.uri, [{
                            lineNumber: this.lineNumber,
                            column: this.column,
                            enabled: true,
                            condition,
                            hitCondition,
                            logMessage,
                            triggeredBy,
                            mode,
                            modeLabel,
                        }]);
                }
            }
        }
        this.dispose();
    }
    focusInput() {
        if (this.context === 3 /* Context.TRIGGER_POINT */) {
            this.selectBreakpointBox.focus();
        }
        else {
            this.input.focus();
        }
    }
    dispose() {
        super.dispose();
        this.input.dispose();
        lifecycle.dispose(this.store);
        setTimeout(() => this.editor.focus(), 0);
    }
};
BreakpointWidget = __decorate([
    __param(4, IContextViewService),
    __param(5, IDebugService),
    __param(6, IThemeService),
    __param(7, IInstantiationService),
    __param(8, IModelService),
    __param(9, ICodeEditorService),
    __param(10, IConfigurationService),
    __param(11, ILanguageFeaturesService),
    __param(12, IKeybindingService),
    __param(13, ILabelService),
    __param(14, ITextModelService),
    __param(15, IHoverService)
], BreakpointWidget);
export { BreakpointWidget };
class AcceptBreakpointWidgetInputAction extends EditorCommand {
    static { this.ID = 'breakpointWidget.action.acceptInput'; }
    constructor() {
        super({
            id: AcceptBreakpointWidgetInputAction.ID,
            precondition: CONTEXT_BREAKPOINT_WIDGET_VISIBLE,
            kbOpts: {
                kbExpr: CONTEXT_IN_BREAKPOINT_WIDGET,
                primary: 3 /* KeyCode.Enter */,
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
    runEditorCommand(accessor, editor) {
        accessor.get(IPrivateBreakpointWidgetService).close(true);
    }
}
class CloseBreakpointWidgetCommand extends EditorCommand {
    static { this.ID = 'closeBreakpointWidget'; }
    constructor() {
        super({
            id: CloseBreakpointWidgetCommand.ID,
            precondition: CONTEXT_BREAKPOINT_WIDGET_VISIBLE,
            kbOpts: {
                kbExpr: EditorContextKeys.textInputFocus,
                primary: 9 /* KeyCode.Escape */,
                secondary: [1024 /* KeyMod.Shift */ | 9 /* KeyCode.Escape */],
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
    runEditorCommand(accessor, editor, args) {
        const debugContribution = editor.getContribution(BREAKPOINT_EDITOR_CONTRIBUTION_ID);
        if (debugContribution) {
            // if focus is in outer editor we need to use the debug contribution to close
            return debugContribution.closeBreakpointWidget();
        }
        accessor.get(IPrivateBreakpointWidgetService).close(false);
    }
}
registerEditorCommand(new AcceptBreakpointWidgetInputAction());
registerEditorCommand(new CloseBreakpointWidgetCommand());
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJlYWtwb2ludFdpZGdldC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvYnJlYWtwb2ludFdpZGdldC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZELE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUNwRyxPQUFPLEVBQXFCLFNBQVMsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBRWxHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRXRFLE9BQU8sS0FBSyxTQUFTLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUFFLEdBQUcsSUFBSSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUU1RCxPQUFPLEVBQUUsYUFBYSxFQUFvQixxQkFBcUIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3hILE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzlGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBRXBHLE9BQU8sRUFBYSxRQUFRLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNqRixPQUFPLEVBQVUsS0FBSyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFFeEUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFFbkYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFFN0YsT0FBTyxFQUFF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
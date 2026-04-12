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
import './media/codeBlockPart.css';
import * as dom from '../../../../../../base/browser/dom.js';
import { renderFormattedText } from '../../../../../../base/browser/formattedTextRenderer.js';
import { Button } from '../../../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Event } from '../../../../../../base/common/event.js';
import { combinedDisposable, Disposable, MutableDisposable, thenRegisterOrDispose } from '../../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { assertType } from '../../../../../../base/common/types.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { EditorExtensionsRegistry } from '../../../../../../editor/browser/editorExtensions.js';
import { ICodeEditorService } from '../../../../../../editor/browser/services/codeEditorService.js';
import { CodeEditorWidget } from '../../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { DiffEditorWidget } from '../../../../../../editor/browser/widget/diffEditor/diffEditorWidget.js';
import { EDITOR_FONT_DEFAULTS } from '../../../../../../editor/common/config/fontInfo.js';
import { TextEdit } from '../../../../../../editor/common/languages.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../../../../editor/common/languages/modesRegistry.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { TextModelText } from '../../../../../../editor/common/model/textModelText.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { DefaultModelSHA1Computer } from '../../../../../../editor/common/services/modelService.js';
import { ITextModelService } from '../../../../../../editor/common/services/resolverService.js';
import { BracketMatchingController } from '../../../../../../editor/contrib/bracketMatching/browser/bracketMatching.js';
import { ColorDetector } from '../../../../../../editor/contrib/colorPicker/browser/colorDetector.js';
import { ContextMenuController } from '../../../../../../editor/contrib/contextmenu/browser/contextmenu.js';
import { GotoDefinitionAtPositionEditorContribution } from '../../../../../../editor/contrib/gotoSymbol/browser/link/goToDefinitionAtPosition.js';
import { ContentHoverController } from '../../../../../../editor/contrib/hover/browser/contentHoverController.js';
import { GlyphHoverController } from '../../../../../../editor/contrib/hover/browser/glyphHoverController.js';
import { LinkDetector } from '../../../../../../editor/contrib/links/browser/links.js';
import { MessageController } from '../../../../../../editor/contrib/message/browser/messageController.js';
import { ViewportSemanticTokensContribution } from '../../../../../../editor/contrib/semanticTokens/browser/viewportSemanticTokens.js';
import { SmartSelectController } from '../../../../../../editor/contrib/smartSelect/browser/smartSelect.js';
import { WordHighlighterContribution } from '../../../../../../editor/contrib/wordHighlighter/browser/wordHighlighter.js';
import { localize } from '../../../../../../nls.js';
import { IAccessibilityService } from '../../../../../../platform/accessibility/common/accessibility.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { MenuWorkbenchToolBar } from '../../../../../../platform/actions/browser/toolbar.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { FileKind } from '../../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { ResourceLabel } from '../../../../../browser/labels.js';
import { StaticResourceContextKey } from '../../../../../common/contextkeys.js';
import { InspectEditorTokensController } from '../../../../codeEditor/browser/inspectEditorTokens/inspectEditorTokens.js';
import { MenuPreventer } from '../../../../codeEditor/browser/menuPreventer.js';
import { SelectionClipboardContributionID } from '../../../../codeEditor/browser/selectionClipboard.js';
import { getSimpleEditorOptions } from '../../../../codeEditor/browser/simpleEditorOptions.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { isRequestVM, isResponseVM } from '../../../common/model/chatViewModel.js';
import { emptyProgressRunner, IEditorProgressService } from '../../../../../../platform/progress/common/progress.js';
import { SuggestController } from '../../../../../../editor/contrib/suggest/browser/suggestController.js';
import { SnippetController2 } from '../../../../../../editor/contrib/snippet/browser/snippetController2.js';
import { EditorContextKeys } from '../../../../../../editor/common/editorContextKeys.js';
const $ = dom.$;
const defaultCodeblockPadding = 10;
let CodeBlockPart = class CodeBlockPart extends Disposable {
    /**
     * Compute a pool reuse key for a code block. When the same key is used
     * across render cycles the pool will try to return the same CodeBlockPart,
     * which lets the setText append-optimisation avoid a full model reset.
     */
    static poolKey(elementId, codeBlockIndex) {
        return `${elementId}/${codeBlockIndex}`;
    }
    get verticalPadding() {
        return this.currentCodeBlockData?.renderOptions?.verticalPadding ?? defaultCodeblockPadding;
    }
    constructor(editorOptions, menuId, delegate, overflowWidgetsDomNode, isSimpleWidget = false, instantiationService, contextKeyService, modelService, languageService, configurationService, accessibilityService, logService, textModelService) {
        super();
        this.editorOptions = editorOptions;
        this.menuId = menuId;
        this.isSimpleWidget = isSimpleWidget;
        this.modelService = modelService;
        this.languageService = languageService;
        this.configurationService = configurationService;
        this.accessibilityService = accessibilityService;
        this.logService = logService;
        this.textModelService = textModelService;
        this.currentScrollWidth = 0;
        this.isDisposed = false;
        this.element = $('.interactive-result-code-block');
        this.resourceContextKey = instantiationService.createInstance(StaticResourceContextKey);
        this.contextKeyService = this._register(contextKeyService.createScoped(this.element));
        const scopedInstantiationService = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, this.contextKeyService])));
        const editorElement = dom.append(this.element, $('.interactive-result-editor'));
        this.editor = this.createEditor(scopedInstantiationService, editorElement, {
            ...getSimpleEditorOptions(this.configurationService),
            readOnly: true,
            lineNumbers: 'off',
            selectOnLineNumbers: true,
            scrollBeyondLastLine: false,
            lineDecorationsWidth: 8,
            dragAndDrop: false,
            padding: { top: this.verticalPadding, bottom: this.verticalPadding },
            mouseWheelZoom: false,
            scrollbar: {
                vertical: 'hidden',
                alwaysConsumeMouseWheel: false
            },
            definitionLinkOpensInPeek: false,
            gotoLocation: {
                multiple: 'goto',
                multipleDeclarations: 'goto',
                multipleDefinitions: 'goto',
                multipleImplementations: 'goto',
            },
            ariaLabel: localize('chat.codeBlockHelp', 'Code block'),
            overflowWidgetsDomNode,
            tabFocusMode: true,
            ...this.getEditorOptionsFromConfig(),
        });
        const toolbarElement = dom.append(this.element, $('.interactive-result-code-block-toolbar'));
        const editorScopedService = this._register(this.editor.contextKeyService.createScoped(toolbarElement));
        const editorScopedInstantiationService = this._register(scopedInstantiationService.createChild(new ServiceCollection([IContextKeyService, editorScopedService])));
        this.toolbar = this._register(editorScopedInstantiationService.createInstance(MenuWorkbenchToolBar, toolbarElement, menuId, {
            menuOptions: {
                shouldForwardArgs: true
            }
        }));
        const vulnsContainer = dom.append(this.element, $('.interactive-result-vulns'));
        const vulnsHeaderElement = dom.append(vulnsContainer, $('.interactive-result-vulns-header', undefined));
        this.vulnsButton = this._register(new Button(vulnsHeaderElement, {
            buttonBackground: undefined,
            buttonBorder: undefined,
            buttonForeground: undefined,
            buttonHoverBackground: undefined,
            buttonSecondaryBackground: undefined,
            buttonSecondaryForeground: undefined,
            buttonSecondaryHoverBackground: undefined,
            buttonSeparator: undefined,
            supportIcons: true
        }));
        this.vulnsListElement = dom.append(vulnsContainer, $('ul.interactive-result-vulns-list'));
        this._register(this.vulnsButton.onDidClick(() => {
            const element = this.currentCodeBlockData.element;
            element.vulnerabilitiesListExpanded = !element.vulnerabilitiesListExpanded;
            this.vulnsButton.label = this.getVulnerabilitiesLabel();
            this.element.classList.toggle('chat-vulnerabilities-collapsed', !element.vulnerabilitiesListExpanded);
            this.layout();
            // this.updateAriaLabel(collapseButton.element, referencesLabel, element.usedReferencesExpanded);
        }));
        this._register(this.toolbar.onDidChangeDropdownVisibility(e => {
            toolbarElement.classList.toggle('force-visibility', e);
        }));
        this._configureForScreenReader();
        this._register(this.accessibilityService.onDidChangeScreenReaderOptimized(() => this._configureForScreenReader()));
        this._register(this.configurationService.onDidChangeConfiguration((e) => {
            if (e.affectedKeys.has("accessibility.verbosity.panelChat" /* AccessibilityVerbositySettingId.Chat */)) {
                this._configureForScreenReader();
            }
        }));
        this._register(this.editorOptions.onDidChange(() => {
            this.editor.updateOptions(this.getEditorOptionsFromConfig());
        }));
        this._register(this.editor.onDidScrollChange(e => {
            this.currentScrollWidth = e.scrollWidth;
        }));
        this._register(this.editor.onDidContentSizeChange(e => {
            if (e.contentHeightChanged) {
                this.layout();
            }
        }));
        this._register(this.editor.onDidBlurEditorWidget(() => {
            this.element.classList.remove('focused');
            WordHighlighterContribution.get(this.editor)?.stopHighlighting();
            this.clearWidgets();
        }));
        this._register(this.editor.onDidFocusEditorWidget(() => {
            this.element.classList.add('focused');
            WordHighlighterContribution.get(this.editor)?.restoreViewState(true);
        }));
        this._register(Event.any(this.editor.onDidChangeModel, this.editor.onDidChangeModelContent)(() => {
            if (this.currentCodeBlockData) {
                this.updateContexts(this.currentCodeBlockData);
            }
        }));
        // Parent list scrolled
        if (delegate.onDidScroll) {
            this._register(delegate.onDidScroll(e => {
                this.clearWidgets();
            }));
        }
        this._textModel = this._register(this.modelService.createModel('', null, URI.from({ scheme: Schemas.vscodeChatCodeBlock, path: generateUuid() }), this.isSimpleWidget));
        // Hold a model reference to prevent the TextModelResolverService from
        // disposing our model when other consumers (e.g. WordHighlighter)
        // acquire and release their references.
        thenRegisterOrDispose(this.textModelService.createModelReference(this._textModel.uri), this._store);
        this.editor.setModel(this._textModel);
    }
    dispose() {
        this.isDisposed = true;
        super.dispose();
    }
    get uri() {
        return this.editor.getModel()?.uri;
    }
    createEditor(instantiationService, parent, options) {
        return this._register(instantiationService.createInstance(CodeEditorWidget, parent, options, {
            isSimpleWidget: this.isSimpleWidget,
            contributions: EditorExtensionsRegistry.getSomeEditorContributions([
                MenuPreventer.ID,
                SelectionClipboardContributionID,
                ContextMenuController.ID,
                WordHighlighterContribution.ID,
                ViewportSemanticTokensContribution.ID,
                BracketMatchingController.ID,
                SmartSelectController.ID,
                ContentHoverController.ID,
                GlyphHoverController.ID,
                MessageController.ID,
                GotoDefinitionAtPositionEditorContribution.ID,
                SuggestController.ID,
                SnippetController2.ID,
                ColorDetector.ID,
                LinkDetector.ID,
                InspectEditorTokensController.ID,
            ])
        }));
    }
    focus() {
        this.editor.focus();
    }
    updatePaddingForLayout() {
        // scrollWidth = "the width of the content that needs to be scrolled"
        // contentWidth = "the width of the area where content is displayed"
        const horizontalScrollbarVisible = this.currentScrollWidth > this.editor.getLayoutInfo().contentWidth;
        const scrollbarHeight = this.editor.getLayoutInfo().horizontalScrollbarHeight;
        const bottomPadding = horizontalScrollbarVisible ?
            Math.max(this.verticalPadding - scrollbarHeight, 2) :
            this.verticalPadding;
        this.editor.updateOptions({ padding: { top: this.verticalPadding, bottom: bottomPadding } });
    }
    _configureForScreenReader() {
        const toolbarElt = this.toolbar.getElement();
        if (this.accessibilityService.isScreenReaderOptimized()) {
            toolbarElt.style.display = 'block';
        }
        else {
            toolbarElt.style.display = '';
        }
    }
    getEditorOptionsFromConfig() {
        return {
            wordWrap: this.editorOptions.configuration.resultEditor.wordWrap,
            fontLigatures: this.editorOptions.configuration.resultEditor.fontLigatures,
            bracketPairColorization: this.editorOptions.configuration.resultEditor.bracketPairColorization,
            fontFamily: this.editorOptions.configuration.resultEditor.fontFamily === 'default' ?
                EDITOR_FONT_DEFAULTS.fontFamily :
                this.editorOptions.configuration.resultEditor.fontFamily,
            fontSize: this.editorOptions.configuration.resultEditor.fontSize,
            fontWeight: this.editorOptions.configuration.resultEditor.fontWeight,
            lineHeight: this.editorOptions.configuration.resultEditor.lineHeight,
            ...this.currentCodeBlockData?.renderOptions?.editorOptions,
        };
    }
    layout(width = this.lastLayoutWidth) {
        if (width === undefined) {
            return; // not yet in DOM
        }
        this.lastLayoutWidth = width;
        const contentHeight = this.getContentHeight();
        let height = contentHeight;
        if (this.currentCodeBlockData?.renderOptions?.maxHeightInLines) {
            height = Math.min(contentHeight, this.editor.getOption(75 /* EditorOption.lineHeight */) * this.currentCodeBlockData?.renderOptions?.maxHeightInLines);
        }
        const editorBorder = 2;
        width = width - editorBorder - (this.currentCodeBlockData?.renderOptions?.reserveWidth ?? 0);
        // !!!!
        // Important: Using here postponeRendering = true to avoid doing a sync layout on the editor
        // which can be very expensive if there are many code blocks being laid out at once.
        // This allows multiple editors to coordinate and render together at the next animation frame.
        // !!!!
        this.editor.layout({ width: isRequestVM(this.currentCodeBlockData?.element) ? width * 0.9 : width, height }, /* postponeRendering */ true);
        this.updatePaddingForLayout();
    }
    getContentHeight() {
        return this.editor.getContentHeight();
    }
    render(data, width) {
        this.currentCodeBlockData = data;
        if (data.parentContextKeyService) {
            this.contextKeyService.updateParent(data.parentContextKeyService);
        }
        if (this.getEditorOptionsFromConfig().wordWrap === 'on') {
            // Initialize the editor with the new proper width so that getContentHeight
            // will be computed correctly in the next call to layout()
            this.layout(width);
        }
        const didUpdate = this.updateEditor(data);
        if (!didUpdate || this.isDisposed || this.currentCodeBlockData !== data) {
            return;
        }
        this.editor.updateOptions({
            ...this.getEditorOptionsFromConfig(),
        });
        if (!this.editor.getOption(8 /* EditorOption.ariaLabel */)) {
            // Don't override the ariaLabel if it was set by the editor options
            this.editor.updateOptions({
                ariaLabel: localize('chat.codeBlockLabel', "Code block {0}", data.codeBlockIndex + 1),
            });
        }
        this.layout(width);
        this.toolbar.setAriaLabel(localize('chat.codeBlockToolbarLabel', "Code block {0}", data.codeBlockIndex + 1));
        if (data.renderOptions?.hideToolbar) {
            dom.hide(this.toolbar.getElement());
        }
        else {
            dom.show(this.toolbar.getElement());
        }
        if (data.vulns?.length && isResponseVM(data.element)) {
            dom.clearNode(this.vulnsListElement);
            this.element.classList.remove('no-vulns');
            this.element.classList.toggle('chat-vulnerabilities-collapsed', !data.element.vulnerabilitiesListExpanded);
            dom.append(this.vulnsListElement, ...data.vulns.map(v => $('li', undefined, $('span.chat-vuln-title', undefined, v.title), ' ' + v.description)));
            this.vulnsButton.label = this.getVulnerabilitiesLabel();
        }
        else {
            this.element.classList.add('no-vulns');
        }
        this.layout();
    }
    reset() {
        this.clearWidgets();
        this.currentCodeBlockData = undefined;
    }
    onDidRemount() {
        if (this.currentCodeBlockData) {
            // !!!!
            // Important: if the editor was off-dom and is now connected, we need to re-render it
            // !!!!
            this.editor.renderAsync(true);
        }
    }
    clearWidgets() {
        ContentHoverController.get(this.editor)?.hideContentHover();
        GlyphHoverController.get(this.editor)?.hideGlyphHover();
    }
    updateEditor(data) {
        if (this.isDisposed || this.currentCodeBlockData !== data) {
            return false;
        }
        this.setText(data.text);
        this.setLanguage(data.languageId);
        this.updateContexts(data);
        return true;
    }
    getVulnerabilitiesLabel() {
        if (!this.currentCodeBlockData || !this.currentCodeBlockData.vulns) {
            return '';
        }
        const referencesLabel = this.currentCodeBlockData.vulns.length > 1 ?
            localize('vulnerabilitiesPlural', "{0} vulnerabilities", this.currentCodeBlockData.vulns.length) :
            localize('vulnerabilitiesSingular', "{0} vulnerability", 1);
        const icon = (element) => element.vulnerabilitiesListExpanded ? Codicon.chevronDown : Codicon.chevronRight;
        return `${referencesLabel} $(${icon(this.currentCodeBlockData.element).id})`;
    }
    updateContexts(data) {
        const textModel = this.editor.getModel();
        if (!textModel) {
            return;
        }
        this.toolbar.context = {
            code: textModel.getTextBuffer().getValueInRange(textModel.getFullModelRange(), 0 /* EndOfLinePreference.TextDefined */),
            codeBlockIndex: data.codeBlockIndex,
            element: data.element,
            languageId: textModel.getLanguageId(),
            codemapperUri: data.codemapperUri,
            chatSessionResource: data.chatSessionResource
        };
        this.resourceContextKey.set(textModel.uri);
    }
    setText(newText) {
        const currentText = this._textModel.getValue(1 /* EndOfLinePreference.LF */);
        if (newText === currentText) {
            return;
        }
        if (newText.startsWith(currentText)) {
            const text = newText.slice(currentText.length);
            const lastLine = this._textModel.getLineCount();
            const lastCol = this._textModel.getLineMaxColumn(lastLine);
            this._textModel.applyEdits([{ range: new Range(lastLine, lastCol, lastLine, lastCol), text }]);
        }
        else {
            this.logService.trace('[CodeBlockPart] setText could not optimize, falling back to setValue');
            this._textModel.setValue(newText);
        }
    }
    setLanguage(languageId) {
        const vscodeLanguageId = this.languageService.getLanguageIdByLanguageName(languageId);
        if (vscodeLanguageId && vscodeLanguageId !== this._textModel.getLanguageId()) {
            this._textModel.setLanguage(vscodeLanguageId);
        }
        else if (!vscodeLanguageId && this._textModel.getLanguageId() !== PLAINTEXT_LANGUAGE_ID) {
            this._textModel.setLanguage(PLAINTEXT_LANGUAGE_ID);
        }
    }
};
CodeBlockPart = __decorate([
    __param(5, IInstantiationService),
    __param(6, IContextKeyService),
    __param(7, IModelService),
    __param(8, ILanguageService),
    __param(9, IConfigurationService),
    __param(10, IAccessibilityService),
    __param(11, ILogService),
    __param(12, ITextModelService)
], CodeBlockPart);
export { CodeBlockPart };
let ChatCodeBlockContentProvider = class ChatCodeBlockContentProvider extends Disposable {
    constructor(textModelService, _modelService) {
        super();
        this._modelService = _modelService;
        this._register(textModelService.registerTextModelContentProvider(Schemas.vscodeChatCodeBlock, {
            provideTextContent: (resource) => {
                return Promise.resolve(this._modelService.getModel(resource));
            }
        }));
    }
};
ChatCodeBlockContentProvider = __decorate([
    __param(0, ITextModelService),
    __param(1, IModelService)
], ChatCodeBlockContentProvider);
export { ChatCodeBlockContentProvider };
// long-lived object that sits in the DiffPool and that gets reused
let CodeCompareBlockPart = class CodeCompareBlockPart extends Disposable {
    constructor(options, menuId, delegate, overflowWidgetsDomNode, isSimpleWidget = false, instantiationService, contextKeyService, modelService, configurationService, accessibilityService, labelService, openerService) {
        super();
        this.options = options;
        this.menuId = menuId;
        this.isSimpleWidget = isSimpleWidget;
        this.modelService = modelService;
        this.configurationService = configurationService;
        this.accessibilityService = accessibilityService;
        this.labelService = labelService;
        this.openerService = openerService;
        this._lastDiffEditorViewModel = this._store.add(new MutableDisposable());
        this.currentScrollWidth = 0;
        this.currentHorizontalPadding = 0;
        this.element = $('.interactive-result-code-block');
        this.element.classList.add('compare');
        this.messageElement = dom.append(this.element, $('.message'));
        this.messageElement.setAttribute('role', 'status');
        this.messageElement.tabIndex = 0;
        this.contextKeyService = this._register(contextKeyService.createScoped(this.element));
        const scopedInstantiationService = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, this.contextKeyService], [IEditorProgressService, new class {
                show(_total, _delay) {
                    return emptyProgressRunner;
                }
                async showWhile(promise, _delay) {
                    await promise;
                }
            }])));
        const editorHeader = this.editorHeader = dom.append(this.element, $('.interactive-result-header.show-file-icons'));
        const editorElement = dom.append(this.element, $('.interactive-result-editor'));
        this.diffEditor = this.createDiffEditor(scopedInstantiationService, editorElement, {
            ...getSimpleEditorOptions(this.configurationService),
            lineNumbers: 'on',
            selectOnLineNumbers: true,
            scrollBeyondLastLine: false,
            lineDecorationsWidth: 12,
            dragAndDrop: false,
            padding: { top: defaultCodeblockPadding, bottom: defaultCodeblockPadding },
            mouseWheelZoom: false,
            scrollbar: {
                vertical: 'hidden',
                alwaysConsumeMouseWheel: false
            },
            definitionLinkOpensInPeek: false,
            gotoLocation: {
                multiple: 'goto',
                multipleDeclarations: 'goto',
                multipleDefinitions: 'goto',
                multipleImplementations: 'goto',
            },
            ariaLabel: localize('chat.codeBlockHelp', 'Code block'),
            overflowWidgetsDomNode,
            ...this.getEditorOptionsFromConfig(),
        });
        this.resourceLabel = this._register(scopedInstantiationService.createInstance(ResourceLabel, editorHeader, { supportIcons: true }));
        const editorScopedService = this._register(this.diffEditor.getModifiedEditor().contextKeyService.createScoped(editorHeader));
        const editorScopedInstantiationService = this._register(scopedInstantiationService.createChild(new ServiceCollection([IContextKeyService, editorScopedService])));
        this.toolbar = this._register(editorScopedInstantiationService.createInstance(MenuWorkbenchToolBar, editorHeader, menuId, {
            menuOptions: {
                shouldForwardArgs: true
            }
        }));
        this._configureForScreenReader();
        this._register(this.accessibilityService.onDidChangeScreenReaderOptimized(() => this._configureForScreenReader()));
        this._register(this.configurationService.onDidChangeConfiguration((e) => {
            if (e.affectedKeys.has("accessibility.verbosity.panelChat" /* AccessibilityVerbositySettingId.Chat */)) {
                this._configureForScreenReader();
            }
        }));
        this._register(this.options.onDidChange(() => {
            this.diffEditor.updateOptions(this.getEditorOptionsFromConfig());
        }));
        this._register(this.diffEditor.getModifiedEditor().onDidScrollChange(e => {
            this.currentScrollWidth = e.scrollWidth;
        }));
        this._register(this.diffEditor.getModifiedEditor().onDidBlurEditorWidget(() => {
            this.element.classList.remove('focused');
            WordHighlighterContribution.get(this.diffEditor.getModifiedEditor())?.stopHighlighting();
            this.clearWidgets();
        }));
        this._register(this.diffEditor.getModifiedEditor().onDidFocusEditorWidget(() => {
            this.element.classList.add('focused');
            WordHighlighterContribution.get(this.diffEditor.getModifiedEditor())?.restoreViewState(true);
        }));
        // Parent list scrolled
        if (delegate.onDidScroll) {
            this._register(delegate.onDidScroll(e => {
                this.clearWidgets();
            }));
        }
    }
    get uri() {
        return this.diffEditor.getModifiedEditor().getModel()?.uri;
    }
    createDiffEditor(instantiationService, parent, options) {
        const widgetOptions = {
            isSimpleWidget: this.isSimpleWidget,
            contributions: EditorExtensionsRegistry.getSomeEditorContributions([
                MenuPreventer.ID,
                SelectionClipboardContributionID,
                ContextMenuController.ID,
                WordHighlighterContribution.ID,
                ViewportSemanticTokensContribution.ID,
                BracketMatchingController.ID,
                SmartSelectController.ID,
                ContentHoverController.ID,
                GlyphHoverController.ID,
                GotoDefinitionAtPositionEditorContribution.ID,
            ])
        };
        return this._register(instantiationService.createInstance(DiffEditorWidget, parent, {
            scrollbar: { useShadows: false, alwaysConsumeMouseWheel: false, ignoreHorizontalScrollbarInContentHeight: true, },
            renderMarginRevertIcon: false,
            diffCodeLens: false,
            scrollBeyondLastLine: false,
            stickyScroll: { enabled: false },
            originalAriaLabel: localize('original', 'Original'),
            modifiedAriaLabel: localize('modified', 'Modified'),
            diffAlgorithm: 'advanced',
            readOnly: false,
            isInEmbeddedEditor: true,
            useInlineViewWhenSpaceIsLimited: true,
            experimental: {
                useTrueInlineView: true,
            },
            renderSideBySideInlineBreakpoint: 300,
            renderOverviewRuler: false,
            compactMode: true,
            hideUnchangedRegions: { enabled: true, contextLineCount: 1 },
            renderGutterMenu: false,
            lineNumbersMinChars: 1,
            ...options
        }, { originalEditor: widgetOptions, modifiedEditor: widgetOptions }));
    }
    focus() {
        this.diffEditor.focus();
    }
    updatePaddingForLayout() {
        // scrollWidth = "the width of the content that needs to be scrolled"
        // contentWidth = "the width of the area where content is displayed"
        const horizontalScrollbarVisible = this.currentScrollWidth > this.diffEditor.getModifiedEditor().getLayoutInfo().contentWidth;
        const scrollbarHeight = this.diffEditor.getModifiedEditor().getLayoutInfo().horizontalScrollbarHeight;
        const bottomPadding = horizontalScrollbarVisible ?
            Math.max(defaultCodeblockPadding - scrollbarHeight, 2) :
            defaultCodeblockPadding;
        this.diffEditor.updateOptions({ padding: { top: defaultCodeblockPadding, bottom: bottomPadding } });
    }
    _configureForScreenReader() {
        const toolbarElt = this.toolbar.getElement();
        // Always show toolbar, but add aria-label for screen readers
        toolbarElt.style.display = 'block';
        if (this.accessibilityService.isScreenReaderOptimized()) {
            toolbarElt.ariaLabel = localize('chat.codeBlock.toolbar', 'Code block toolbar');
        }
    }
    getEditorOptionsFromConfig() {
        return {
            wordWrap: this.options.configuration.resultEditor.wordWrap,
            fontLigatures: this.options.configuration.resultEditor.fontLigatures,
            bracketPairColorization: this.options.configuration.resultEditor.bracketPairColorization,
            fontFamily: this.options.configuration.resultEditor.fontFamily === 'default' ?
                EDITOR_FONT_DEFAULTS.fontFamily :
                this.options.configuration.resultEditor.fontFamily,
            fontSize: this.options.configuration.resultEditor.fontSize,
            fontWeight: this.options.configuration.resultEditor.fontWeight,
            lineHeight: this.options.configuration.resultEditor.lineHeight,
        };
    }
    layout(width = this.lastLayoutWidth) {
        if (width === undefined) {
            return; // not yet in DOM
        }
        this.lastLayoutWidth = width;
        const editorBorder = 2;
        const toolbar = dom.getTotalHeight(this.editorHeader);
        const content = this.diffEditor.getModel()
            ? this.diffEditor.getContentHeight()
            : dom.getTotalHeight(this.messageElement);
        const dimension = new dom.Dimension(width - editorBorder - this.currentHorizontalPadding * 2, toolbar + content);
        this.element.style.width = `${dimension.width}px`;
        this.diffEditor.layout(dimension.with(undefined, content - editorBorder));
        this.updatePaddingForLayout();
    }
    async render(data, width, token) {
        this.currentHorizontalPadding = data.horizontalPadding || 0;
        if (data.parentContextKeyService) {
            this.contextKeyService.updateParent(data.parentContextKeyService);
        }
        if (this.options.configuration.resultEditor.wordWrap === 'on') {
            // Initialize the editor with the new proper width so that getContentHeight
            // will be computed correctly in the next call to layout()
            this.layout(width);
        }
        await this.updateEditor(data, token);
        this.layout(width);
        this.diffEditor.updateOptions({
            ariaLabel: localize('chat.compareCodeBlockLabel', "Code Edits"),
            readOnly: !!data.isReadOnly,
        });
        this.resourceLabel.element.setFile(data.edit.uri, {
            fileKind: FileKind.FILE,
            fileDecorations: { colors: true, badges: false }
        });
    }
    reset() {
        this.clearWidgets();
    }
    clearWidgets() {
        ContentHoverController.get(this.diffEditor.getOriginalEditor())?.hideContentHover();
        ContentHoverController.get(this.diffEditor.getModifiedEditor())?.hideContentHover();
        GlyphHoverController.get(this.diffEditor.getOriginalEditor())?.hideGlyphHover();
        GlyphHoverController.get(this.diffEditor.getModifiedEditor())?.hideGlyphHover();
    }
    async updateEditor(data, token) {
        if (!isResponseVM(data.element)) {
            return;
        }
        const isEditApplied = Boolean(data.edit.state?.applied ?? 0);
        ChatContextKeys.editApplied.bindTo(this.contextKeyService).set(isEditApplied);
        this.element.classList.toggle('no-diff', isEditApplied);
        if (isEditApplied) {
            assertType(data.edit.state?.applied);
            const uriLabel = this.labelService.getUriLabel(data.edit.uri, { relative: true, noPrefix: true });
            let template;
            if (data.edit.state.applied === 1) {
                template = localize('chat.edits.1', "Applied 1 change in [[``{0}``]]", uriLabel);
            }
            else if (data.edit.state.applied < 0) {
                template = localize('chat.edits.rejected', "Edits in [[``{0}``]] have been rejected", uriLabel);
            }
            else {
                template = localize('chat.edits.N', "Applied {0} changes in [[``{1}``]]", data.edit.state.applied, uriLabel);
            }
            const message = renderFormattedText(template, {
                renderCodeSegments: true,
                actionHandler: {
                    callback: () => {
                        this.openerService.open(data.edit.uri, { fromUserGesture: true, allowCommands: false });
                    },
                    disposables: this._store,
                }
            });
            dom.reset(this.messageElement, message);
        }
        const diffData = await data.diffData;
        if (!isEditApplied && diffData) {
            const viewModel = this.diffEditor.createViewModel({
                original: diffData.original,
                modified: diffData.modified
            });
            await viewModel.waitForDiff();
            if (token.isCancellationRequested) {
                return;
            }
            const listener = Event.any(diffData.original.onWillDispose, diffData.modified.onWillDispose)(() => {
                // this a bit weird and basically duplicates https://github.com/microsoft/vscode/blob/7cbcafcbcc88298cfdcd0238018fbbba8eb6853e/src/vs/editor/browser/widget/diffEditor/diffEditorWidget.ts#L328
                // which cannot call `setModel(null)` without first complaining
                this.diffEditor.setModel(null);
            });
            this.diffEditor.setModel(viewModel);
            this._lastDiffEditorViewModel.value = combinedDisposable(listener, viewModel);
        }
        else {
            this.diffEditor.setModel(null);
            this._lastDiffEditorViewModel.value = undefined;
        }
        this.toolbar.context = {
            edit: data.edit,
            element: data.element,
            diffEditor: this.diffEditor,
            toggleDiffViewMode: () => {
                const isCurrentlyInline = !!this.diffEditor.getModifiedEditor().contextKeyService.getContextKeyValue(EditorContextKeys.diffEditorInlineMode.key);
                const renderSideBySide = isCurrentlyInline;
                this.diffEditor.updateOptions({
                    renderSideBySide,
                    // Make it not-compact in side by side mode, otherwise we may not actually
                    // show it side-by-side if it's a simple diff https://github.com/microsoft/vscode/blob/0632563332c7c08656fb47c97bc4328d62ee1d80/src/vs/editor/browser/widget/diffEditor/diffEditorOptions.ts#L35-L39
                    compactMode: !renderSideBySide,
                    useInlineViewWhenSpaceIsLimited: false,
                });
                this.layout();
            },
        };
    }
};
CodeCompareBlockPart = __decorate([
    __param(5, IInstantiationService),
    __param(6, IContextKeyService),
    __param(7, IModelService),
    __param(8, IConfigurationService),
    __param(9, IAccessibilityService),
    __param(10, ILabelService),
    __param(11, IOpenerService)
], CodeCompareBlockPart);
export { CodeCompareBlockPart };
let DefaultChatTextEditor = class DefaultChatTextEditor {
    constructor(modelService, editorService, dialogService) {
        this.modelService = modelService;
        this.editorService = editorService;
        this.dialogService = dialogService;
        this._sha1 = new DefaultModelSHA1Computer();
    }
    async apply(response, item, diffEditor) {
        if (!response.response.value.includes(item)) {
            // bogous item
            return;
        }
        if (item.state?.applied) {
            // already applied
            return;
        }
        if (!diffEditor) {
            for (const candidate of this.editorService.listDiffEditors()) {
                if (!candidate.getContainerDomNode().isConnected) {
                    continue;
                }
                const model = candidate.getModel();
                if (!model || !isEqual(model.original.uri, item.uri) || model.modified.uri.scheme !== Schemas.vscodeChatCodeCompareBlock) {
                    diffEditor = candidate;
                    break;
                }
            }
        }
        const edits = diffEditor
            ? await this._applyWithDiffEditor(diffEditor, item)
            : await this._apply(item);
        response.setEditApplied(item, edits);
    }
    async _applyWithDiffEditor(diffEditor, item) {
        const model = diffEditor.getModel();
        if (!model) {
            return 0;
        }
        const diff = diffEditor.getDiffComputationResult();
        if (!diff || diff.identical) {
            return 0;
        }
        if (!await this._checkSha1(model.original, item)) {
            return 0;
        }
        const modified = new TextModelText(model.modified);
        const edits = diff.changes2.map(i => i.toRangeMapping().toTextEdit(modified).toSingleEditOperation());
        model.original.pushStackElement();
        model.original.pushEditOperations(null, edits, () => null);
        model.original.pushStackElement();
        return edits.length;
    }
    async _apply(item) {
        const ref = await this.modelService.createModelReference(item.uri);
        try {
            if (!await this._checkSha1(ref.object.textEditorModel, item)) {
                return 0;
            }
            ref.object.textEditorModel.pushStackElement();
            let total = 0;
            for (const group of item.edits) {
                const edits = group.map(TextEdit.asEditOperation);
                ref.object.textEditorModel.pushEditOperations(null, edits, () => null);
                total += edits.length;
            }
            ref.object.textEditorModel.pushStackElement();
            return total;
        }
        finally {
            ref.dispose();
        }
    }
    async _checkSha1(model, item) {
        if (item.state?.sha1 && this._sha1.computeSHA1(model) && this._sha1.computeSHA1(model) !== item.state.sha1) {
            const result = await this.dialogService.confirm({
                message: localize('interactive.compare.apply.confirm', "The original file has been modified."),
                detail: localize('interactive.compare.apply.confirm.detail', "Do you want to apply the changes anyway?"),
            });
            if (!result.confirmed) {
                return false;
            }
        }
        return true;
    }
    discard(response, item) {
        if (!response.response.value.includes(item)) {
            // bogous item
            return;
        }
        if (item.state?.applied) {
            // already applied
            return;
        }
        response.setEditApplied(item, -1);
    }
};
DefaultChatTextEditor = __decorate([
    __param(0, ITextModelService),
    __param(1, ICodeEditorService),
    __param(2, IDialogService)
], DefaultChatTextEditor);
export { DefaultChatTextEditor };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29kZUJsb2NrUGFydC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jb2RlQmxvY2tQYXJ0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sMkJBQTJCLENBQUM7QUFFbkMsT0FBTyxLQUFLLEdBQUcsTUFBTSx1Q0FBdUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUM5RixPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFFNUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUMvRCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsVUFBVSxFQUFFLGlCQUFpQixFQUFFLHFCQUFxQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDdEksT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDcEUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUdyRSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUNoRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxnRUFBZ0UsQ0FBQztBQUNwRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQTRCLE1BQU0sd0VBQXdFLENBQUM7QUFDcEksT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sd0VBQXdFLENBQUM7QUFFMUcsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFFMUYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUN0RSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDdkYsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ2xGLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQ3BHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLDZFQUE2RSxDQUFDO0FBQ3hILE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSx1RUFBdUUsQ0FBQztBQUN0RyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxxRUFBcUUsQ0FBQztBQUM1RyxPQUFPLEVBQUUsMENBQTBDLEVBQUUsTUFBTSxzRkFBc0YsQ0FBQztBQUNsSixPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSwwRUFBMEUsQ0FBQztBQUNsSCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx3RUFBd0UsQ0FBQztBQUM5RyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0seURBQXlELENBQUM7QUFDdkYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sdUVBQXVFLENBQUM7QUFDMUcsT0FBTyxFQUFFLGtDQUFrQyxFQUFFLE1BQU0sbUZBQW1GLENBQUM7QUFDdkksT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0scUVBQXFFLENBQUM7QUFDNUcsT0FBTyxFQUFFLDJCQUEyQixFQUFFLE1BQU0sNkVBQTZFLENBQUM7QUFDMUgsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3BELE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUU3RixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUN6RyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNoRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDdEYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzVFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNFQUFzRSxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNqRixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDcEYsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRWhGLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLDJFQUEyRSxDQUFDO0FBQzFILE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNoRixPQUFPLEVBQUUsZ0NBQWdDLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN4RyxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUUvRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFFN0UsT0FBTyxFQUFpRCxXQUFXLEVBQUUsWUFBWSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFJbEksT0FBTyxFQUFFLG1CQUFtQixFQUFFLHNCQUFzQixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDckgsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sdUVBQXVFLENBQUM7QUFDMUcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sd0VBQXdFLENBQUM7QUFDNUcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFFekYsTUFBTSxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQztBQXlDaEIsTUFBTSx1QkFBdUIsR0FBRyxFQUFFLENBQUM7QUFDNUIsSUFBTSxhQUFhLEdBQW5CLE1BQU0sYUFBYyxTQUFRLFVBQVU7SUFFNUM7Ozs7T0FJRztJQUNILE1BQU0sQ0FBQyxPQUFPLENBQUMsU0FBaUIsRUFBRSxjQUFzQjtRQUN2RCxPQUFPLEdBQUcsU0FBUyxJQUFJLGNBQWMsRUFBRSxDQUFDO0lBQ3pDLENBQUM7SUFxQkQsSUFBWSxlQUFlO1FBQzFCLE9BQU8sSUFBSSxDQUFDLG9CQUFvQixFQUFFLGFBQWEsRUFBRSxlQUFlLElBQUksdUJBQXVCLENBQUM7SUFDN0YsQ0FBQztJQUVELFlBQ2tCLGFBQWdDLEVBQ3hDLE1BQWMsRUFDdkIsUUFBK0IsRUFDL0Isc0JBQStDLEVBQzlCLGlCQUEwQixLQUFLLEVBQ3pCLG9CQUEyQyxFQUM5QyxpQkFBcUMsRUFDMUMsWUFBOEMsRUFDM0MsZUFBa0QsRUFDN0Msb0JBQTRELEVBQzVELG9CQUE0RCxFQUN0RSxVQUF3QyxFQUNsQyxnQkFBb0Q7UUFFdkUsS0FBSyxFQUFFLENBQUM7UUFkUyxrQkFBYSxHQUFiLGFBQWEsQ0FBbUI7UUFDeEMsV0FBTSxHQUFOLE1BQU0sQ0FBUTtRQUdOLG1CQUFjLEdBQWQsY0FBYyxDQUFpQjtRQUdkLGlCQUFZLEdBQVosWUFBWSxDQUFlO1FBQzFCLG9CQUFlLEdBQWYsZUFBZSxDQUFrQjtRQUM1Qix5QkFBb0IsR0FBcEIsb0JBQW9CLENBQXVCO1FBQzNDLHlCQUFvQixHQUFwQixvQkFBb0IsQ0FBdUI7UUFDckQsZUFBVSxHQUFWLFVBQVUsQ0FBYTtRQUNqQixxQkFBZ0IsR0FBaEIsZ0JBQWdCLENBQW1CO1FBeEJoRSx1QkFBa0IsR0FBRyxDQUFDLENBQUM7UUFHdkIsZUFBVSxHQUFHLEtBQUssQ0FBQztRQXdCMUIsSUFBSSxDQUFDLE9BQU8sR0FBRyxDQUFDLENBQUMsZ0NBQWdDLENBQUMsQ0FBQztRQUVuRCxJQUFJLENBQUMsa0JBQWtCLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLHdCQUF3QixDQUFDLENBQUM7UUFDeEYsSUFBSSxDQUFDLGlCQUFpQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsaUJBQWlCLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1FBQ3RGLE1BQU0sMEJBQTBCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxvQkFBb0IsQ0FBQyxXQUFXLENBQUMsSUFBSSxpQkFBaUIsQ0FBQyxDQUFDLGtCQUFrQixFQUFFLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3pKLE1BQU0sYUFBYSxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsNEJBQTRCLENBQUMsQ0FBQyxDQUFDO1FBQ2hGLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQywwQkFBMEIsRUFBRSxhQUFhLEVBQUU7WUFDMUUsR0FBRyxzQkFBc0IsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUM7WUFDcEQsUUFBUSxFQUFFLElBQUk7WUFDZCxXQUFXLEVBQUUsS0FBSztZQUNsQixtQkFBbUIsRUFBRSxJQUFJO1lBQ3pCLG9CQUFvQixFQUFFLEtBQUs7WUFDM0Isb0JBQW9CLEVBQUUsQ0FBQztZQUN2QixXQUFXLEVBQUUsS0FBSztZQUNsQixPQUFPLEVBQUUsRUFBRSxHQUFHLEVBQUUsSUFBSSxDQUFDLGVBQWUsRUFBRSxNQUFNLEVBQUUsSUFBSSxDQUFDLGVBQWUsRUFBRTtZQUNwRSxjQUFjLEVBQUUsS0FBSztZQUNyQixTQUFTLEVBQUU7Z0JBQ1YsUUFBUSxFQUFFLFFBQVE7Z0JBQ2xCLHVCQUF1QixFQUFFLEtBQUs7YUFDOUI7WUFDRCx5QkFBeUIsRUFBRSxLQUFLO1lBQ2hDLFlBQVksRUFBRTtnQkFDYixRQUFRLEVBQUUsTUFBTTtnQkFDaEIsb0JBQW9CLEVBQUUsTUFBTTtnQkFDNUIsbUJBQW1CLEVBQUUsTUFBTTtnQkFDM0IsdUJBQXVCLEVBQUUsTUFBTTthQUMvQjtZQUNELFNBQVMsRUFBRSxRQUFRLENBQUMsb0JBQW9CLEVBQUUsWUFBWSxDQUFDO1lBQ3ZELHNCQUFzQjtZQUN0QixZQUFZLEVBQUUsSUFBSTtZQUNsQixHQUFHLElBQUksQ0FBQywwQkFBMEIsRUFBRTtTQUNwQyxDQUFDLENBQUM7UUFFSCxNQUFNLGNBQWMsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLHdDQUF3QyxDQUFDLENBQUMsQ0FBQztRQUM3RixNQUFNLG1CQUFtQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxZQUFZLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQztRQUN2RyxNQUFNLGdDQUFnQyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsMEJBQTBCLENBQUMsV0FBVyxDQUFDLElBQUksaUJBQWlCLENBQUMsQ0FBQyxrQkFBa0IsRUFBRSxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2xLLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxnQ0FBZ0MsQ0FBQyxjQUFjLENBQUMsb0JBQW9CLEVBQUUsY0FBYyxFQUFFLE1BQU0sRUFBRTtZQUMzSCxXQUFXLEVBQUU7Z0JBQ1osaUJBQWlCLEVBQUUsSUFBSTthQUN2QjtTQUNELENBQUMsQ0FBQyxDQUFDO1FBRUosTUFBTSxjQUFjLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQywyQkFBMkIsQ0FBQyxDQUFDLENBQUM7UUFDaEYsTUFBTSxrQkFBa0IsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUMsa0NBQWtDLEVBQUUsU0FBUyxDQUFDLENBQUMsQ0FBQztRQUN4RyxJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxNQUFNLENBQUMsa0JBQWtCLEVBQUU7WUFDaEUsZ0JBQWdCLEVBQUUsU0FBUztZQUMzQixZQUFZLEVBQUUsU0FBUztZQUN2QixnQkFBZ0IsRUFBRSxTQUFTO1lBQzNCLHFCQUFxQixFQUFFLFNBQVM7WUFDaEMseUJBQXlCLEVBQUUsU0FBUztZQUNwQyx5QkFBeUIsRUFBRSxTQUFTO1lBQ3BDLDhCQUE4QixFQUFFLFNBQVM7WUFDekMsZUFBZSxFQUFFLFNBQVM7WUFDMUIsWUFBWSxFQUFFLElBQUk7U0FDbEIsQ0FBQyxDQUFDLENBQUM7UUFFSixJQUFJLENBQUMsZ0JBQWdCLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDLGtDQUFrQyxDQUFDLENBQUMsQ0FBQztRQUUxRixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLEdBQUcsRUFBRTtZQUMvQyxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsb0JBQXFCLENBQUMsT0FBaUMsQ0FBQztZQUM3RSxPQUFPLENBQUMsMkJBQTJCLEdBQUcsQ0FBQyxPQUFPLENBQUMsMkJBQTJCLENBQUM7WUFDM0UsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLHVCQUF1QixFQUFFLENBQUM7WUFDeEQsSUFBSSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLGdDQUFnQyxFQUFFLENBQUMsT0FBTyxDQUFDLDJCQUEyQixDQUFDLENBQUM7WUFDdEcsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2QsaUdBQWlHO1FBQ2xHLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsNkJBQTZCLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDN0QsY0FBYyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDeEQsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVKLElBQUksQ0FBQyx5QkFBeUIsRUFBRSxDQUFDO1FBQ2pDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLGdDQUFnQyxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyx5QkFBeUIsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNuSCxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFO1lBQ3ZFLElBQUksQ0FBQyxDQUFDLFlBQVksQ0FBQyxHQUFHLGdGQUFzQyxFQUFFLENBQUM7Z0JBQzlELElBQUksQ0FBQyx5QkFBeUIsRUFBRSxDQUFDO1lBQ2xDLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLFdBQVcsQ0FBQyxHQUFHLEVBQUU7WUFDbEQsSUFBSSxDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLDBCQUEwQixFQUFFLENBQUMsQ0FBQztRQUM5RCxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxFQUFFO1lBQ2hELElBQUksQ0FBQyxrQkFBa0IsR0FBRyxDQUFDLENBQUMsV0FBVyxDQUFDO1FBQ3pDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDSixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsc0JBQXNCLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDckQsSUFBSSxDQUFDLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztnQkFDNUIsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2YsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDSixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMscUJBQXFCLENBQUMsR0FBRyxFQUFFO1lBQ3JELElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUN6QywyQkFBMkIsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLGdCQUFnQixFQUFFLENBQUM7WUFDakUsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO1FBQ3JCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDSixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsc0JBQXNCLENBQUMsR0FBRyxFQUFFO1lBQ3RELElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUN0QywyQkFBMkIsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLGdCQUFnQixDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3RFLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDSixJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQ3ZCLElBQUksQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLEVBQzVCLElBQUksQ0FBQyxNQUFNLENBQUMsdUJBQXVCLENBQ25DLENBQUMsR0FBRyxFQUFFO1lBQ04sSUFBSSxJQUFJLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztnQkFDL0IsSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsQ0FBQztZQUNoRCxDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVKLHVCQUF1QjtRQUN2QixJQUFJLFFBQVEsQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUMxQixJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLEVBQUU7Z0JBQ3ZDLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztZQUNyQixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ0wsQ0FBQztRQUVELElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLFdBQVcsQ0FBQyxFQUFFLEVBQUUsSUFBSSxFQUN0RSxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxtQkFBbUIsRUFBRSxJQUFJLEVBQUUsWUFBWSxFQUFFLEVBQUUsQ0FBQyxFQUN2RSxJQUFJLENBQUMsY0FBYyxDQUNuQixDQUFDLENBQUM7UUFDSCxzRUFBc0U7UUFDdEUsa0VBQWtFO1FBQ2xFLHdDQUF3QztRQUN4QyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsb0JBQW9CLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDcEcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQ3ZDLENBQUM7SUFFUSxPQUFPO1FBQ2YsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUM7UUFDdkIsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ2pCLENBQUM7SUFFRCxJQUFJLEdBQUc7UUFDTixPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLEVBQUUsR0FBRyxDQUFDO0lBQ3BDLENBQUM7SUFFTyxZQUFZLENBQUMsb0JBQTJDLEVBQUUsTUFBbUIsRUFBRSxPQUE2QztRQUNuSSxPQUFPLElBQUksQ0FBQyxTQUFTLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLGdCQUFnQixFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUU7WUFDNUYsY0FBYyxFQUFFLElBQUksQ0FBQyxjQUFjO1lBQ25DLGFBQWEsRUFBRSx3QkFBd0IsQ0FBQywwQkFBMEIsQ0FBQztnQkFDbEUsYUFBYSxDQUFDLEVBQUU7Z0JBQ2hCLGdDQUFnQztnQkFDaEMscUJBQXFCLENBQUMsRUFBRTtnQkFFeEIsMkJBQTJCLENBQUMsRUFBRTtnQkFDOUIsa0NBQWtDLENBQUMsRUFBRTtnQkFDckMseUJBQXlCLENBQUMsRUFBRTtnQkFDNUIscUJBQXFCLENBQUMsRUFBRTtnQkFDeEIsc0JBQXNCLENBQUMsRUFBRTtnQkFDekIsb0JBQW9CLENBQUMsRUFBRTtnQkFDdkIsaUJBQWlCLENBQUMsRUFBRTtnQkFDcEIsMENBQTBDLENBQUMsRUFBRTtnQkFDN0MsaUJBQWlCLENBQUMsRUFBRTtnQkFDcEIsa0JBQWtCLENBQUMsRUFBRTtnQkFDckIsYUFBYSxDQUFDLEVBQUU7Z0JBQ2hCLFlBQVksQ0FBQyxFQUFFO2dCQUVmLDZCQUE2QixDQUFDLEVBQUU7YUFDaEMsQ0FBQztTQUNGLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVELEtBQUs7UUFDSixJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxDQUFDO0lBQ3JCLENBQUM7SUFFTyxzQkFBc0I7UUFDN0IscUVBQXFFO1FBQ3JFLG9FQUFvRTtRQUNwRSxNQUFNLDBCQUEwQixHQUFHLElBQUksQ0FBQyxrQkFBa0IsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLGFBQWEsRUFBRSxDQUFDLFlBQVksQ0FBQztRQUN0RyxNQUFNLGVBQWUsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLGFBQWEsRUFBRSxDQUFDLHlCQUF5QixDQUFDO1FBQzlFLE1BQU0sYUFBYSxHQUFHLDBCQUEwQixDQUFDLENBQUM7WUFDakQsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsZUFBZSxHQUFHLGVBQWUsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3JELElBQUksQ0FBQyxlQUFlLENBQUM7UUFDdEIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUMsRUFBRSxPQUFPLEVBQUUsRUFBRSxHQUFHLEVBQUUsSUFBSSxDQUFDLGVBQWUsRUFBRSxNQUFNLEVBQUUsYUFBYSxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQzlGLENBQUM7SUFFTyx5QkFBeUI7UUFDaEMsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUM3QyxJQUFJLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyx1QkFBdUIsRUFBRSxFQUFFLENBQUM7WUFDekQsVUFBVSxDQUFDLEtBQUssQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDO1FBQ3BDLENBQUM7YUFBTSxDQUFDO1lBQ1AsVUFBVSxDQUFDLEtBQUssQ0FBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO1FBQy9CLENBQUM7SUFDRixDQUFDO0lBRU8sMEJBQTBCO1FBQ2pDLE9BQU87WUFDTixRQUFRLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxhQUFhLENBQUMsWUFBWSxDQUFDLFFBQVE7WUFDaEUsYUFBYSxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFDLFlBQVksQ0FBQyxhQUFhO1lBQzFFLHVCQUF1QixFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFDLFlBQVksQ0FBQyx1QkFBdUI7WUFDOUYsVUFBVSxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFDLFlBQVksQ0FBQyxVQUFVLEtBQUssU0FBUyxDQUFDLENBQUM7Z0JBQ25GLG9CQUFvQixDQUFDLFVBQVUsQ0FBQyxDQUFDO2dCQUNqQyxJQUFJLENBQUMsYUFBYSxDQUFDLGFBQWEsQ0FBQyxZQUFZLENBQUMsVUFBVTtZQUN6RCxRQUFRLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxhQUFhLENBQUMsWUFBWSxDQUFDLFFBQVE7WUFDaEUsVUFBVSxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFDLFlBQVksQ0FBQyxVQUFVO1lBQ3BFLFVBQVUsRUFBRSxJQUFJLENBQUMsYUFBYSxDQUFDLGFBQWEsQ0FBQyxZQUFZLENBQUMsVUFBVTtZQUNwRSxHQUFHLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxhQUFhLEVBQUUsYUFBYTtTQUMxRCxDQUFDO0lBQ0gsQ0FBQztJQUVELE1BQU0sQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLGVBQWU7UUFDbEMsSUFBSSxLQUFLLEtBQUssU0FBUyxFQUFFLENBQUM7WUFDekIsT0FBTyxDQUFDLGlCQUFpQjtRQUMxQixDQUFDO1FBRUQsSUFBSSxDQUFDLGVBQWUsR0FBRyxLQUFLLENBQUM7UUFDN0IsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7UUFFOUMsSUFBSSxNQUFNLEdBQUcsYUFBYSxDQUFDO1FBQzNCLElBQUksSUFBSSxDQUFDLG9CQUFvQixFQUFFLGFBQWEsRUFBRSxnQkFBZ0IsRUFBRSxDQUFDO1lBQ2hFLE1BQU0sR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLGFBQWEsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLFNBQVMsa0NBQXlCLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixFQUFFLGFBQWEsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO1FBQy9JLENBQUM7UUFFRCxNQUFNLFlBQVksR0FBRyxDQUFDLENBQUM7UUFDdkIsS0FBSyxHQUFHLEtBQUssR0FBRyxZQUFZLEdBQUcsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLEVBQUUsYUFBYSxFQUFFLFlBQVksSUFBSSxDQUFDLENBQUMsQ0FBQztRQUM3RixPQUFPO1FBQ1AsNEZBQTRGO1FBQzVGLG9GQUFvRjtRQUNwRiw4RkFBOEY7UUFDOUYsT0FBTztRQUNQLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEVBQUUsS0FBSyxFQUFFLFdBQVcsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRSxNQUFNLEVBQUUsRUFBRSx1QkFBdUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMzSSxJQUFJLENBQUMsc0JBQXNCLEVBQUUsQ0FBQztJQUMvQixDQUFDO0lBRU8sZ0JBQWdCO1FBQ3ZCLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO0lBQ3ZDLENBQUM7SUFFRCxNQUFNLENBQUMsSUFBb0IsRUFBRSxLQUFhO1FBQ3pDLElBQUksQ0FBQyxvQkFBb0IsR0FBRyxJQUFJLENBQUM7UUFDakMsSUFBSSxJQUFJLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztZQUNsQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1FBQ25FLENBQUM7UUFFRCxJQUFJLElBQUksQ0FBQywwQkFBMEIsRUFBRSxDQUFDLFFBQVEsS0FBSyxJQUFJLEVBQUUsQ0FBQztZQUN6RCwyRUFBMkU7WUFDM0UsMERBQTBEO1lBQzFELElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDcEIsQ0FBQztRQUVELE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDMUMsSUFBSSxDQUFDLFNBQVMsSUFBSSxJQUFJLENBQUMsVUFBVSxJQUFJLElBQUksQ0FBQyxvQkFBb0IsS0FBSyxJQUFJLEVBQUUsQ0FBQztZQUN6RSxPQUFPO1FBQ1IsQ0FBQztRQUVELElBQUksQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDO1lBQ3pCLEdBQUcsSUFBSSxDQUFDLDBCQUEwQixFQUFFO1NBQ3BDLENBQUMsQ0FBQztRQUNILElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFNBQVMsZ0NBQXdCLEVBQUUsQ0FBQztZQUNwRCxtRUFBbUU7WUFDbkUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUM7Z0JBQ3pCLFNBQVMsRUFBRSxRQUFRLENBQUMscUJBQXFCLEVBQUUsZ0JBQWdCLEVBQUUsSUFBSSxDQUFDLGNBQWMsR0FBRyxDQUFDLENBQUM7YUFDckYsQ0FBQyxDQUFDO1FBQ0osQ0FBQztRQUNELElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDbkIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsUUFBUSxDQUFDLDRCQUE0QixFQUFFLGdCQUFnQixFQUFFLElBQUksQ0FBQyxjQUFjLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM3RyxJQUFJLElBQUksQ0FBQyxhQUFhLEVBQUUsV0FBVyxFQUFFLENBQUM7WUFDckMsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUM7UUFDckMsQ0FBQzthQUFNLENBQUM7WUFDUCxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQztRQUNyQyxDQUFDO1FBRUQsSUFBSSxJQUFJLENBQUMsS0FBSyxFQUFFLE1BQU0sSUFBSSxZQUFZLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDdEQsR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztZQUNyQyxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDMUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLGdDQUFnQyxFQUFFLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO1lBQzNHLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGdCQUFnQixFQUFFLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUMsc0JBQXNCLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsRUFBRSxHQUFHLEdBQUcsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNsSixJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztRQUN6RCxDQUFDO2FBQU0sQ0FBQztZQUNQLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUN4QyxDQUFDO1FBRUQsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO0lBQ2YsQ0FBQztJQUVELEtBQUs7UUFDSixJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDcEIsSUFBSSxDQUFDLG9CQUFvQixHQUFHLFNBQVMsQ0FBQztJQUN2QyxDQUFDO0lBRUQsWUFBWTtRQUNYLElBQUksSUFBSSxDQUFDLG9CQUFvQixFQUFFLENBQUM7WUFDL0IsT0FBTztZQUNQLHFGQUFxRjtZQUNyRixPQUFPO1lBQ1AsSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDL0IsQ0FBQztJQUNGLENBQUM7SUFFTyxZQUFZO1FBQ25CLHNCQUFzQixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsZ0JBQWdCLEVBQUUsQ0FBQztRQUM1RCxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLGNBQWMsRUFBRSxDQUFDO0lBQ3pELENBQUM7SUFFTyxZQUFZLENBQUMsSUFBb0I7UUFDeEMsSUFBSSxJQUFJLENBQUMsVUFBVSxJQUFJLElBQUksQ0FBQyxvQkFBb0IsS0FBSyxJQUFJLEVBQUUsQ0FBQztZQUMzRCxPQUFPLEtBQUssQ0FBQztRQUNkLENBQUM7UUFFRCxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN4QixJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUNsQyxJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBRTFCLE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUVPLHVCQUF1QjtRQUM5QixJQUFJLENBQUMsSUFBSSxDQUFDLG9CQUFvQixJQUFJLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ3BFLE9BQU8sRUFBRSxDQUFDO1FBQ1gsQ0FBQztRQUVELE1BQU0sZUFBZSxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQ25FLFFBQVEsQ0FBQyx1QkFBdUIsRUFBRSxxQkFBcUIsRUFBRSxJQUFJLENBQUMsb0JBQW9CLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7WUFDbEcsUUFBUSxDQUFDLHlCQUF5QixFQUFFLG1CQUFtQixFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzdELE1BQU0sSUFBSSxHQUFHLENBQUMsT0FBK0IsRUFBRSxFQUFFLENBQUMsT0FBTyxDQUFDLDJCQUEyQixDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDO1FBQ25JLE9BQU8sR0FBRyxlQUFlLE1BQU0sSUFBSSxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxPQUFpQyxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUM7SUFDeEcsQ0FBQztJQUVPLGNBQWMsQ0FBQyxJQUFvQjtRQUMxQyxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ3pDLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUNoQixPQUFPO1FBQ1IsQ0FBQztRQUVELElBQUksQ0FBQyxPQUFPLENBQUMsT0FBTyxHQUFHO1lBQ3RCLElBQUksRUFBRSxTQUFTLENBQUMsYUFBYSxFQUFFLENBQUMsZUFBZSxDQUFDLFNBQVMsQ0FBQyxpQkFBaUIsRUFBRSwwQ0FBa0M7WUFDL0csY0FBYyxFQUFFLElBQUksQ0FBQyxjQUFjO1lBQ25DLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTztZQUNyQixVQUFVLEVBQUUsU0FBUyxDQUFDLGFBQWEsRUFBRTtZQUNyQyxhQUFhLEVBQUUsSUFBSSxDQUFDLGFBQWE7WUFDakMsbUJBQW1CLEVBQUUsSUFBSSxDQUFDLG1CQUFtQjtTQUNYLENBQUM7UUFDcEMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDNUMsQ0FBQztJQUVPLE9BQU8sQ0FBQyxPQUFlO1FBQzlCLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsUUFBUSxnQ0FBd0IsQ0FBQztRQUNyRSxJQUFJLE9BQU8sS0FBSyxXQUFXLEVBQUUsQ0FBQztZQUM3QixPQUFPO1FBQ1IsQ0FBQztRQUVELElBQUksT0FBTyxDQUFDLFVBQVUsQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDO1lBQ3JDLE1BQU0sSUFBSSxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQy9DLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDaEQsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUMzRCxJQUFJLENBQUMsVUFBVSxDQUFDLFVBQVUsQ0FBQyxDQUFDLEVBQUUsS0FBSyxFQUFFLElBQUksS0FBSyxDQUFDLFFBQVEsRUFBRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE9BQU8sQ0FBQyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNoRyxDQUFDO2FBQU0sQ0FBQztZQUNQLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLHNFQUFzRSxDQUFDLENBQUM7WUFDOUYsSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDbkMsQ0FBQztJQUNGLENBQUM7SUFFTyxXQUFXLENBQUMsVUFBa0I7UUFDckMsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDLDJCQUEyQixDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3RGLElBQUksZ0JBQWdCLElBQUksZ0JBQWdCLEtBQUssSUFBSSxDQUFDLFVBQVUsQ0FBQyxhQUFhLEVBQUUsRUFBRSxDQUFDO1lBQzlFLElBQUksQ0FBQyxVQUFVLENBQUMsV0FBVyxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDL0MsQ0FBQzthQUFNLElBQUksQ0FBQyxnQkFBZ0IsSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLGFBQWEsRUFBRSxLQUFLLHFCQUFxQixFQUFFLENBQUM7WUFDM0YsSUFBSSxDQUFDLFVBQVUsQ0FBQyxXQUFXLENBQUMscUJBQXFCLENBQUMsQ0FBQztRQUNwRCxDQUFDO0lBQ0YsQ0FBQztDQUNELENBQUE7QUEzWlksYUFBYTtJQXdDdkIsV0FBQSxxQkFBcUIsQ0FBQTtJQUNyQixXQUFBLGtCQUFrQixDQUFBO0lBQ2xCLFdBQUEsYUFBYSxDQUFBO0lBQ2IsV0FBQSxnQkFBZ0IsQ0FBQTtJQUNoQixXQUFBLHFCQUFxQixDQUFBO0lBQ3JCLFlBQUEscUJBQXFCLENBQUE7SUFDckIsWUFBQSxXQUFXLENBQUE7SUFDWCxZQUFBLGlCQUFpQixDQUFBO0dBL0NQLGFBQWEsQ0EyWnpCOztBQUVNLElBQU0sNEJBQTRCLEdBQWxDLE1BQU0sNEJBQTZCLFNBQVEsVUFBVTtJQUUzRCxZQUNvQixnQkFBbUMsRUFDdEIsYUFBNEI7UUFFNUQsS0FBSyxFQUFFLENBQUM7UUFGd0Isa0JBQWEsR0FBYixhQUFhLENBQWU7UUFHNUQsSUFBSSxDQUFDLFNBQVMsQ0FBQyxnQkFBZ0IsQ0FBQyxnQ0FBZ0MsQ0FBQyxPQUFPLENBQUMsbUJBQW1CLEVBQUU7WUFDN0Ysa0JBQWtCLEVBQUUsQ0FBQyxRQUFhLEVBQUUsRUFBRTtnQkFDckMsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7WUFDL0QsQ0FBQztTQUNELENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNELENBQUE7QUFiWSw0QkFBNEI7SUFHdEMsV0FBQSxpQkFBaUIsQ0FBQTtJQUNqQixXQUFBLGFBQWEsQ0FBQTtHQUpILDRCQUE0QixDQWF4Qzs7QUFnQ0QsbUVBQW1FO0FBQzVELElBQU0sb0JBQW9CLEdBQTFCLE1BQU0sb0JBQXFCLFNBQVEsVUFBVTtJQWVuRCxZQUNrQixPQUEwQixFQUNsQyxNQUFjLEVBQ3ZCLFFBQStCLEVBQy9CLHNCQUErQyxFQUM5QixpQkFBMEIsS0FBSyxFQUN6QixvQkFBMkMsRUFDOUMsaUJBQXFDLEVBQzFDLFlBQThDLEVBQ3RDLG9CQUE0RCxFQUM1RCxvQkFBNEQsRUFDcEUsWUFBNEMsRUFDM0MsYUFBOEM7UUFFOUQsS0FBSyxFQUFFLENBQUM7UUFiUyxZQUFPLEdBQVAsT0FBTyxDQUFtQjtRQUNsQyxXQUFNLEdBQU4sTUFBTSxDQUFRO1FBR04sbUJBQWMsR0FBZCxjQUFjLENBQWlCO1FBR2QsaUJBQVksR0FBWixZQUFZLENBQWU7UUFDckIseUJBQW9CLEdBQXBCLG9CQUFvQixDQUF1QjtRQUMzQyx5QkFBb0IsR0FBcEIsb0JBQW9CLENBQXVCO1FBQ25ELGlCQUFZLEdBQVosWUFBWSxDQUFlO1FBQzFCLGtCQUFhLEdBQWIsYUFBYSxDQUFnQjtRQWxCOUMsNkJBQXdCLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxpQkFBaUIsRUFBRSxDQUFDLENBQUM7UUFDN0UsdUJBQWtCLEdBQUcsQ0FBQyxDQUFDO1FBQ3ZCLDZCQUF3QixHQUFHLENBQUMsQ0FBQztRQW1CcEMsSUFBSSxDQUFDLE9BQU8sR0FBRyxDQUFDLENBQUMsZ0NBQWdDLENBQUMsQ0FBQztRQUNuRCxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUM7UUFFdEMsSUFBSSxDQUFDLGNBQWMsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7UUFDOUQsSUFBSSxDQUFDLGNBQWMsQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQ25ELElBQUksQ0FBQyxjQUFjLENBQUMsUUFBUSxHQUFHLENBQUMsQ0FBQztRQUVqQyxJQUFJLENBQUMsaUJBQWlCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxpQkFBaUIsQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7UUFDdEYsTUFBTSwwQkFBMEIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLG9CQUFvQixDQUFDLFdBQVcsQ0FBQyxJQUFJLGlCQUFpQixDQUN2RyxDQUFDLGtCQUFrQixFQUFFLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxFQUM1QyxDQUFDLHNCQUFzQixFQUFFLElBQUk7Z0JBRTVCLElBQUksQ0FBQyxNQUFlLEVBQUUsTUFBZ0I7b0JBQ3JDLE9BQU8sbUJBQW1CLENBQUM7Z0JBQzVCLENBQUM7Z0JBQ0QsS0FBSyxDQUFDLFNBQVMsQ0FBQyxPQUF5QixFQUFFLE1BQWU7b0JBQ3pELE1BQU0sT0FBTyxDQUFDO2dCQUNmLENBQUM7YUFDRCxDQUFDLENBQ0YsQ0FBQyxDQUFDLENBQUM7UUFDSixNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsWUFBWSxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsNENBQTRDLENBQUMsQ0FBQyxDQUFDO1FBQ25ILE1BQU0sYUFBYSxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsNEJBQTRCLENBQUMsQ0FBQyxDQUFDO1FBQ2hGLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLDBCQUEwQixFQUFFLGFBQWEsRUFBRTtZQUNsRixHQUFHLHNCQUFzQixDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQztZQUNwRCxXQUFXLEVBQUUsSUFBSTtZQUNqQixtQkFBbUIsRUFBRSxJQUFJO1lBQ3pCLG9CQUFvQixFQUFFLEtBQUs7WUFDM0Isb0JBQW9CLEVBQUUsRUFBRTtZQUN4QixXQUFXLEVBQUUsS0FBSztZQUNsQixPQUFPLEVBQUUsRUFBRSxHQUFHLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxFQUFFLHVCQUF1QixFQUFFO1lBQzFFLGNBQWMsRUFBRSxLQUFLO1lBQ3JCLFNBQVMsRUFBRTtnQkFDVixRQUFRLEVBQUUsUUFBUTtnQkFDbEIsdUJBQXVCLEVBQUUsS0FBSzthQUM5QjtZQUNELHlCQUF5QixFQUFFLEtBQUs7WUFDaEMsWUFBWSxFQUFFO2dCQUNiLFFBQVEsRUFBRSxNQUFNO2dCQUNoQixvQkFBb0IsRUFBRSxNQUFNO2dCQUM1QixtQkFBbUIsRUFBRSxNQUFNO2dCQUMzQix1QkFBdUIsRUFBRSxNQUFNO2FBQy9CO1lBQ0QsU0FBUyxFQUFFLFFBQVEsQ0FBQyxvQkFBb0IsRUFBRSxZQUFZLENBQUM7WUFDdkQsc0JBQXNCO1lBQ3RCLEdBQUcsSUFBSSxDQUFDLDBCQUEwQixFQUFFO1NBQ3BDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQywwQkFBMEIsQ0FBQyxjQUFjLENBQUMsYUFBYSxFQUFFLFlBQVksRUFBRSxFQUFFLFlBQVksRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFcEksTUFBTSxtQkFBbUIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsaUJBQWlCLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxZQUFZLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQztRQUM3SCxNQUFNLGdDQUFnQyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsMEJBQTBCLENBQUMsV0FBVyxDQUFDLElBQUksaUJBQWlCLENBQUMsQ0FBQyxrQkFBa0IsRUFBRSxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2xLLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxnQ0FBZ0MsQ0FBQyxjQUFjLENBQUMsb0JBQW9CLEVBQUUsWUFBWSxFQUFFLE1BQU0sRUFBRTtZQUN6SCxXQUFXLEVBQUU7Z0JBQ1osaUJBQWlCLEVBQUUsSUFBSTthQUN2QjtTQUNELENBQUMsQ0FBQyxDQUFDO1FBRUosSUFBSSxDQUFDLHlCQUF5QixFQUFFLENBQUM7UUFDakMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsZ0NBQWdDLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLHlCQUF5QixFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ25ILElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLHdCQUF3QixDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUU7WUFDdkUsSUFBSSxDQUFDLENBQUMsWUFBWSxDQUFDLEdBQUcsZ0ZBQXNDLEVBQUUsQ0FBQztnQkFDOUQsSUFBSSxDQUFDLHlCQUF5QixFQUFFLENBQUM7WUFDbEMsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLEdBQUcsRUFBRTtZQUM1QyxJQUFJLENBQUMsVUFBVSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsMEJBQTBCLEVBQUUsQ0FBQyxDQUFDO1FBQ2xFLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsaUJBQWlCLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsRUFBRTtZQUN4RSxJQUFJLENBQUMsa0JBQWtCLEdBQUcsQ0FBQyxDQUFDLFdBQVcsQ0FBQztRQUN6QyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ0osSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLGlCQUFpQixFQUFFLENBQUMscUJBQXFCLENBQUMsR0FBRyxFQUFFO1lBQzdFLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUN6QywyQkFBMkIsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxpQkFBaUIsRUFBRSxDQUFDLEVBQUUsZ0JBQWdCLEVBQUUsQ0FBQztZQUN6RixJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDckIsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNKLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxpQkFBaUIsRUFBRSxDQUFDLHNCQUFzQixDQUFDLEdBQUcsRUFBRTtZQUM5RSxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDdEMsMkJBQTJCLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsaUJBQWlCLEVBQUUsQ0FBQyxFQUFFLGdCQUFnQixDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzlGLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFHSix1QkFBdUI7UUFDdkIsSUFBSSxRQUFRLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDMUIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxFQUFFO2dCQUN2QyxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDckIsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNMLENBQUM7SUFDRixDQUFDO0lBRUQsSUFBSSxHQUFHO1FBQ04sT0FBTyxJQUFJLENBQUMsVUFBVSxDQUFDLGlCQUFpQixFQUFFLENBQUMsUUFBUSxFQUFFLEVBQUUsR0FBRyxDQUFDO0lBQzVELENBQUM7SUFFTyxnQkFBZ0IsQ0FBQyxvQkFBMkMsRUFBRSxNQUFtQixFQUFFLE9BQTZDO1FBQ3ZJLE1BQU0sYUFBYSxHQUE2QjtZQUMvQyxjQUFjLEVBQUUsSUFBSSxDQUFDLGNBQWM7WUFDbkMsYUFBYSxFQUFFLHdCQUF3QixDQUFDLDBCQUEwQixDQUFDO2dCQUNsRSxhQUFhLENBQUMsRUFBRTtnQkFDaEIsZ0NBQWdDO2dCQUNoQyxxQkFBcUIsQ0FBQyxFQUFFO2dCQUV4QiwyQkFBMkIsQ0FBQyxFQUFFO2dCQUM5QixrQ0FBa0MsQ0FBQyxFQUFFO2dCQUNyQyx5QkFBeUIsQ0FBQyxFQUFFO2dCQUM1QixxQkFBcUIsQ0FBQyxFQUFFO2dCQUN4QixzQkFBc0IsQ0FBQyxFQUFFO2dCQUN6QixvQkFBb0IsQ0FBQyxFQUFFO2dCQUN2QiwwQ0FBMEMsQ0FBQyxFQUFFO2FBQzdDLENBQUM7U0FDRixDQUFDO1FBRUYsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxnQkFBZ0IsRUFBRSxNQUFNLEVBQUU7WUFDbkYsU0FBUyxFQUFFLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSx1QkFBdUIsRUFBRSxLQUFLLEVBQUUsd0NBQXdDLEVBQUUsSUFBSSxHQUFHO1lBQ2pILHNCQUFzQixFQUFFLEtBQUs7WUFDN0IsWUFBWSxFQUFFLEtBQUs7WUFDbkIsb0JBQW9CLEVBQUUsS0FBSztZQUMzQixZQUFZLEVBQUUsRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFO1lBQ2hDLGlCQUFpQixFQUFFLFFBQVEsQ0FBQyxVQUFVLEVBQUUsVUFBVSxDQUFDO1lBQ25ELGlCQUFpQixFQUFFLFFBQVEsQ0FBQyxVQUFVLEVBQUUsVUFBVSxDQUFDO1lBQ25ELGFBQWEsRUFBRSxVQUFVO1lBQ3pCLFFBQVEsRUFBRSxLQUFLO1lBQ2Ysa0JBQWtCLEVBQUUsSUFBSTtZQUN4QiwrQkFBK0IsRUFBRSxJQUFJO1lBQ3JDLFlBQVksRUFBRTtnQkFDYixpQkFBaUIsRUFBRSxJQUFJO2FBQ3ZCO1lBQ0QsZ0NBQWdDLEVBQUUsR0FBRztZQUNyQyxtQkFBbUIsRUFBRSxLQUFLO1lBQzFCLFdBQVcsRUFBRSxJQUFJO1lBQ2pCLG9CQUFvQixFQUFFLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxnQkFBZ0IsRUFBRSxDQUFDLEVBQUU7WUFDNUQsZ0JBQWdCLEVBQUUsS0FBSztZQUN2QixtQkFBbUIsRUFBRSxDQUFDO1lBQ3RCLEdBQUcsT0FBTztTQUNWLEVBQUUsRUFBRSxjQUFjLEVBQUUsYUFBYSxFQUFFLGNBQWMsRUFBRSxhQUFhLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDdkUsQ0FBQztJQUVELEtBQUs7UUFDSixJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssRUFBRSxDQUFDO0lBQ3pCLENBQUM7SUFFTyxzQkFBc0I7UUFDN0IscUVBQXFFO1FBQ3JFLG9FQUFvRTtRQUNwRSxNQUFNLDBCQUEwQixHQUFHLElBQUksQ0FBQyxrQkFBa0IsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLGlCQUFpQixFQUFFLENBQUMsYUFBYSxFQUFFLENBQUMsWUFBWSxDQUFDO1FBQzlILE1BQU0sZUFBZSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsaUJBQWlCLEVBQUUsQ0FBQyxhQUFhLEVBQUUsQ0FBQyx5QkFBeUIsQ0FBQztRQUN0RyxNQUFNLGFBQWEsR0FBRywwQkFBMEIsQ0FBQyxDQUFDO1lBQ2pELElBQUksQ0FBQyxHQUFHLENBQUMsdUJBQXVCLEdBQUcsZUFBZSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDeEQsdUJBQXVCLENBQUM7UUFDekIsSUFBSSxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsRUFBRSxPQUFPLEVBQUUsRUFBRSxHQUFHLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxFQUFFLGFBQWEsRUFBRSxFQUFFLENBQUMsQ0FBQztJQUNyRyxDQUFDO0lBRU8seUJBQXlCO1FBQ2hDLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsVUFBVSxFQUFFLENBQUM7UUFDN0MsNkRBQTZEO1FBQzdELFVBQVUsQ0FBQyxLQUFLLENBQUMsT0FBTyxHQUFHLE9BQU8sQ0FBQztRQUNuQyxJQUFJLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyx1QkFBdUIsRUFBRSxFQUFFLENBQUM7WUFDekQsVUFBVSxDQUFDLFNBQVMsR0FBRyxRQUFRLENBQUMsd0JBQXdCLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztRQUNqRixDQUFDO0lBQ0YsQ0FBQztJQUVPLDBCQUEwQjtRQUNqQyxPQUFPO1lBQ04sUUFBUSxFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLFlBQVksQ0FBQyxRQUFRO1lBQzFELGFBQWEsRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxZQUFZLENBQUMsYUFBYTtZQUNwRSx1QkFBdUIsRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxZQUFZLENBQUMsdUJBQXVCO1lBQ3hGLFVBQVUsRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxZQUFZLENBQUMsVUFBVSxLQUFLLFNBQVMsQ0FBQyxDQUFDO2dCQUM3RSxvQkFBb0IsQ0FBQyxVQUFVLENBQUMsQ0FBQztnQkFDakMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsWUFBWSxDQUFDLFVBQVU7WUFDbkQsUUFBUSxFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLFlBQVksQ0FBQyxRQUFRO1lBQzFELFVBQVUsRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxZQUFZLENBQUMsVUFBVTtZQUM5RCxVQUFVLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsWUFBWSxDQUFDLFVBQVU7U0FDOUQsQ0FBQztJQUNILENBQUM7SUFFRCxNQUFNLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxlQUFlO1FBQ2xDLElBQUksS0FBSyxLQUFLLFNBQVMsRUFBRSxDQUFDO1lBQ3pCLE9BQU8sQ0FBQyxpQkFBaUI7UUFDMUIsQ0FBQztRQUVELElBQUksQ0FBQyxlQUFlLEdBQUcsS0FBSyxDQUFDO1FBRTdCLE1BQU0sWUFBWSxHQUFHLENBQUMsQ0FBQztRQUV2QixNQUFNLE9BQU8sR0FBRyxHQUFHLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUN0RCxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLFFBQVEsRUFBRTtZQUN6QyxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxnQkFBZ0IsRUFBRTtZQUNwQyxDQUFDLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUM7UUFFM0MsTUFBTSxTQUFTLEdBQUcsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLEtBQUssR0FBRyxZQUFZLEdBQUcsSUFBSSxDQUFDLHdCQUF3QixHQUFHLENBQUMsRUFBRSxPQUFPLEdBQUcsT0FBTyxDQUFDLENBQUM7UUFDakgsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsS0FBSyxHQUFHLEdBQUcsU0FBUyxDQUFDLEtBQUssSUFBSSxDQUFDO1FBQ2xELElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLE9BQU8sR0FBRyxZQUFZLENBQUMsQ0FBQyxDQUFDO1FBQzFFLElBQUksQ0FBQyxzQkFBc0IsRUFBRSxDQUFDO0lBQy9CLENBQUM7SUFHRCxLQUFLLENBQUMsTUFBTSxDQUFDLElBQTJCLEVBQUUsS0FBYSxFQUFFLEtBQXdCO1FBQ2hGLElBQUksQ0FBQyx3QkFBd0IsR0FBRyxJQUFJLENBQUMsaUJBQWlCLElBQUksQ0FBQyxDQUFDO1FBRTVELElBQUksSUFBSSxDQUFDLHVCQUF1QixFQUFFLENBQUM7WUFDbEMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsdUJBQXVCLENBQUMsQ0FBQztRQUNuRSxDQUFDO1FBRUQsSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxZQUFZLENBQUMsUUFBUSxLQUFLLElBQUksRUFBRSxDQUFDO1lBQy9ELDJFQUEyRTtZQUMzRSwwREFBMEQ7WUFDMUQsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNwQixDQUFDO1FBRUQsTUFBTSxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQztRQUVyQyxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ25CLElBQUksQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDO1lBQzdCLFNBQVMsRUFBRSxRQUFRLENBQUMsNEJBQTRCLEVBQUUsWUFBWSxDQUFDO1lBQy9ELFFBQVEsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVU7U0FDM0IsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFO1lBQ2pELFFBQVEsRUFBRSxRQUFRLENBQUMsSUFBSTtZQUN2QixlQUFlLEVBQUUsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUU7U0FDaEQsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVELEtBQUs7UUFDSixJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7SUFDckIsQ0FBQztJQUVPLFlBQVk7UUFDbkIsc0JBQXNCLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsaUJBQWlCLEVBQUUsQ0FBQyxFQUFFLGdCQUFnQixFQUFFLENBQUM7UUFDcEYsc0JBQXNCLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsaUJBQWlCLEVBQUUsQ0FBQyxFQUFFLGdCQUFnQixFQUFFLENBQUM7UUFDcEYsb0JBQW9CLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsaUJBQWlCLEVBQUUsQ0FBQyxFQUFFLGNBQWMsRUFBRSxDQUFDO1FBQ2hGLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLGlCQUFpQixFQUFFLENBQUMsRUFBRSxjQUFjLEVBQUUsQ0FBQztJQUNqRixDQUFDO0lBRU8sS0FBSyxDQUFDLFlBQVksQ0FBQyxJQUEyQixFQUFFLEtBQXdCO1FBRS9FLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDakMsT0FBTztRQUNSLENBQUM7UUFFRCxNQUFNLGFBQWEsR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsT0FBTyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBRTdELGVBQWUsQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUU5RSxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsU0FBUyxFQUFFLGFBQWEsQ0FBQyxDQUFDO1FBRXhELElBQUksYUFBYSxFQUFFLENBQUM7WUFDbkIsVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBRXJDLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztZQUVsRyxJQUFJLFFBQWdCLENBQUM7WUFDckIsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQ25DLFFBQVEsR0FBRyxRQUFRLENBQUMsY0FBYyxFQUFFLGlDQUFpQyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1lBQ2xGLENBQUM7aUJBQU0sSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQ3hDLFFBQVEsR0FBRyxRQUFRLENBQUMscUJBQXFCLEVBQUUseUNBQXlDLEVBQUUsUUFBUSxDQUFDLENBQUM7WUFDakcsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLFFBQVEsR0FBRyxRQUFRLENBQUMsY0FBYyxFQUFFLG9DQUFvQyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRSxRQUFRLENBQUMsQ0FBQztZQUM5RyxDQUFDO1lBRUQsTUFBTSxPQUFPLEdBQUcsbUJBQW1CLENBQUMsUUFBUSxFQUFFO2dCQUM3QyxrQkFBa0IsRUFBRSxJQUFJO2dCQUN4QixhQUFhLEVBQUU7b0JBQ2QsUUFBUSxFQUFFLEdBQUcsRUFBRTt3QkFDZCxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxFQUFFLGVBQWUsRUFBRSxJQUFJLEVBQUUsYUFBYSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7b0JBQ3pGLENBQUM7b0JBQ0QsV0FBVyxFQUFFLElBQUksQ0FBQyxNQUFNO2lCQUN4QjthQUNELENBQUMsQ0FBQztZQUVILEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUN6QyxDQUFDO1FBRUQsTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFJLENBQUMsUUFBUSxDQUFDO1FBRXJDLElBQUksQ0FBQyxhQUFhLElBQUksUUFBUSxFQUFFLENBQUM7WUFDaEMsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxlQUFlLENBQUM7Z0JBQ2pELFFBQVEsRUFBRSxRQUFRLENBQUMsUUFBUTtnQkFDM0IsUUFBUSxFQUFFLFFBQVEsQ0FBQyxRQUFRO2FBQzNCLENBQUMsQ0FBQztZQUVILE1BQU0sU0FBUyxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBRTlCLElBQUksS0FBSyxDQUFDLHVCQUF1QixFQUFFLENBQUM7Z0JBQ25DLE9BQU87WUFDUixDQUFDO1lBRUQsTUFBTSxRQUFRLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLGFBQWEsRUFBRSxRQUFRLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxDQUFDLEdBQUcsRUFBRTtnQkFDakcsK0xBQStMO2dCQUMvTCwrREFBK0Q7Z0JBQy9ELElBQUksQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ2hDLENBQUMsQ0FBQyxDQUFDO1lBQ0gsSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDcEMsSUFBSSxDQUFDLHdCQUF3QixDQUFDLEtBQUssR0FBRyxrQkFBa0IsQ0FBQyxRQUFRLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFFL0UsQ0FBQzthQUFNLENBQUM7WUFDUCxJQUFJLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUMvQixJQUFJLENBQUMsd0JBQXdCLENBQUMsS0FBSyxHQUFHLFNBQVMsQ0FBQztRQUNqRCxDQUFDO1FBRUQsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLEdBQUc7WUFDdEIsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJO1lBQ2YsT0FBTyxFQUFFLElBQUksQ0FBQyxPQUFPO1lBQ3JCLFVBQVUsRUFBRSxJQUFJLENBQUMsVUFBVTtZQUMzQixrQkFBa0IsRUFBRSxHQUFHLEVBQUU7Z0JBQ3hCLE1BQU0saUJBQWlCLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsaUJBQWlCLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxrQkFBa0IsQ0FBQyxpQkFBaUIsQ0FBQyxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDakosTUFBTSxnQkFBZ0IsR0FBRyxpQkFBaUIsQ0FBQztnQkFDM0MsSUFBSSxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUM7b0JBQzdCLGdCQUFnQjtvQkFDaEIsMEVBQTBFO29CQUMxRSxvTUFBb007b0JBQ3BNLFdBQVcsRUFBRSxDQUFDLGdCQUFnQjtvQkFDOUIsK0JBQStCLEVBQUUsS0FBSztpQkFDdEMsQ0FBQyxDQUFDO2dCQUNILElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNmLENBQUM7U0FDd0MsQ0FBQztJQUM1QyxDQUFDO0NBQ0QsQ0FBQTtBQTdWWSxvQkFBb0I7SUFxQjlCLFdBQUEscUJBQXFCLENBQUE7SUFDckIsV0FBQSxrQkFBa0IsQ0FBQTtJQUNsQixXQUFBLGFBQWEsQ0FBQTtJQUNiLFdBQUEscUJBQXFCLENBQUE7SUFDckIsV0FBQSxxQkFBcUIsQ0FBQTtJQUNyQixZQUFBLGFBQWEsQ0FBQTtJQUNiLFlBQUEsY0FBYyxDQUFBO0dBM0JKLG9CQUFvQixDQTZWaEM7O0FBRU0sSUFBTSxxQkFBcUIsR0FBM0IsTUFBTSxxQkFBcUI7SUFJakMsWUFDb0IsWUFBZ0QsRUFDL0MsYUFBa0QsRUFDdEQsYUFBOEM7UUFGMUIsaUJBQVksR0FBWixZQUFZLENBQW1CO1FBQzlCLGtCQUFhLEdBQWIsYUFBYSxDQUFvQjtRQUNyQyxrQkFBYSxHQUFiLGFBQWEsQ0FBZ0I7UUFMOUMsVUFBSyxHQUFHLElBQUksd0JBQXdCLEVBQUUsQ0FBQztJQU1wRCxDQUFDO0lBRUwsS0FBSyxDQUFDLEtBQUssQ0FBQyxRQUFxRCxFQUFFLElBQXdCLEVBQUUsVUFBbUM7UUFFL0gsSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQzdDLGNBQWM7WUFDZCxPQUFPO1FBQ1IsQ0FBQztRQUVELElBQUksSUFBSSxDQUFDLEtBQUssRUFBRSxPQUFPLEVBQUUsQ0FBQztZQUN6QixrQkFBa0I7WUFDbEIsT0FBTztRQUNSLENBQUM7UUFFRCxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDakIsS0FBSyxNQUFNLFNBQVMsSUFBSSxJQUFJLENBQUMsYUFBYSxDQUFDLGVBQWUsRUFBRSxFQUFFLENBQUM7Z0JBQzlELElBQUksQ0FBQyxTQUFTLENBQUMsbUJBQW1CLEVBQUUsQ0FBQyxXQUFXLEVBQUUsQ0FBQztvQkFDbEQsU0FBUztnQkFDVixDQUFDO2dCQUNELE1BQU0sS0FBSyxHQUFHLFNBQVMsQ0FBQyxRQUFRLEVBQUUsQ0FBQztnQkFDbkMsSUFBSSxDQUFDLEtBQUssSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksS0FBSyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsTUFBTSxLQUFLLE9BQU8sQ0FBQywwQkFBMEIsRUFBRSxDQUFDO29CQUMxSCxVQUFVLEdBQUcsU0FBUyxDQUFDO29CQUN2QixNQUFNO2dCQUNQLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztRQUVELE1BQU0sS0FBSyxHQUFHLFVBQVU7WUFDdkIsQ0FBQyxDQUFDLE1BQU0sSUFBSSxDQUFDLG9CQUFvQixDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUM7WUFDbkQsQ0FBQyxDQUFDLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUUzQixRQUFRLENBQUMsY0FBYyxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQztJQUN0QyxDQUFDO0lBRU8sS0FBSyxDQUFDLG9CQUFvQixDQUFDLFVBQXVCLEVBQUUsSUFBd0I7UUFDbkYsTUFBTSxLQUFLLEdBQUcsVUFBVSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ3BDLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNaLE9BQU8sQ0FBQyxDQUFDO1FBQ1YsQ0FBQztRQUVELE1BQU0sSUFBSSxHQUFHLFVBQVUsQ0FBQyx3QkFBd0IsRUFBRSxDQUFDO1FBQ25ELElBQUksQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQzdCLE9BQU8sQ0FBQyxDQUFDO1FBQ1YsQ0FBQztRQUdELElBQUksQ0FBQyxNQUFNLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQ2xELE9BQU8sQ0FBQyxDQUFDO1FBQ1YsQ0FBQztRQUVELE1BQU0sUUFBUSxHQUFHLElBQUksYUFBYSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUNuRCxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxjQUFjLEVBQUUsQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLENBQUMscUJBQXFCLEVBQUUsQ0FBQyxDQUFDO1FBRXRHLEtBQUssQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztRQUNsQyxLQUFLLENBQUMsUUFBUSxDQUFDLGtCQUFrQixDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDM0QsS0FBSyxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1FBRWxDLE9BQU8sS0FBSyxDQUFDLE1BQU0sQ0FBQztJQUNyQixDQUFDO0lBRU8sS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUF3QjtRQUM1QyxNQUFNLEdBQUcsR0FBRyxNQUFNLElBQUksQ0FBQyxZQUFZLENBQUMsb0JBQW9CLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ25FLElBQUksQ0FBQztZQUVKLElBQUksQ0FBQyxNQUFNLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxlQUFlLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQztnQkFDOUQsT0FBTyxDQUFDLENBQUM7WUFDVixDQUFDO1lBRUQsR0FBRyxDQUFDLE1BQU0sQ0FBQyxlQUFlLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztZQUM5QyxJQUFJLEtBQUssR0FBRyxDQUFDLENBQUM7WUFDZCxLQUFLLE1BQU0sS0FBSyxJQUFJLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDaEMsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLENBQUM7Z0JBQ2xELEdBQUcsQ0FBQyxNQUFNLENBQUMsZUFBZSxDQUFDLGtCQUFrQixDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ3ZFLEtBQUssSUFBSSxLQUFLLENBQUMsTUFBTSxDQUFDO1lBQ3ZCLENBQUM7WUFDRCxHQUFHLENBQUMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1lBQzlDLE9BQU8sS0FBSyxDQUFDO1FBRWQsQ0FBQztnQkFBUyxDQUFDO1lBQ1YsR0FBRyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2YsQ0FBQztJQUNGLENBQUM7SUFFTyxLQUFLLENBQUMsVUFBVSxDQUFDLEtBQWlCLEVBQUUsSUFBd0I7UUFDbkUsSUFBSSxJQUFJLENBQUMsS0FBSyxFQUFFLElBQUksSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsS0FBSyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQzVHLE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUM7Z0JBQy9DLE9BQU8sRUFBRSxRQUFRLENBQUMsbUNBQW1DLEVBQUUsc0NBQXNDLENBQUM7Z0JBQzlGLE1BQU0sRUFBRSxRQUFRLENBQUMsMENBQTBDLEVBQUUsMENBQTBDLENBQUM7YUFDeEcsQ0FBQyxDQUFDO1lBRUgsSUFBSSxDQUFDLE1BQU0sQ0FBQyxTQUFTLEVBQUUsQ0FBQztnQkFDdkIsT0FBTyxLQUFLLENBQUM7WUFDZCxDQUFDO1FBQ0YsQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUVELE9BQU8sQ0FBQyxRQUFxRCxFQUFFLElBQXdCO1FBQ3RGLElBQUksQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztZQUM3QyxjQUFjO1lBQ2QsT0FBTztRQUNSLENBQUM7UUFFRCxJQUFJLElBQUksQ0FBQyxLQUFLLEVBQUUsT0FBTyxFQUFFLENBQUM7WUFDekIsa0JBQWtCO1lBQ2xCLE9BQU87UUFDUixDQUFDO1FBRUQsUUFBUSxDQUFDLGNBQWMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNuQyxDQUFDO0NBR0QsQ0FBQTtBQXhIWSxxQkFBcUI7SUFLL0IsV0FBQSxpQkFBaUIsQ0FBQTtJQUNqQixXQUFBLGtCQUFrQixDQUFBO0lBQ2xCLFdBQUEsY0FBYyxDQUFBO0dBUEoscUJBQXFCLENBd0hqQyJ9
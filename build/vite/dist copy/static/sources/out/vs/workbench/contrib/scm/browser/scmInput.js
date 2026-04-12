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
var SCMInputWidget_1;
import './media/scm.css';
import { Event, Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { append, $, Dimension, trackFocus } from '../../../../base/browser/dom.js';
import { ISCMViewService, SCMInputChangeReason } from '../common/scm.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IContextViewService, IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IContextKeyService, ContextKeyExpr, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { MenuItemAction, IMenuService, registerAction2, MenuId, Action2 } from '../../../../platform/actions/common/actions.js';
import { ActionRunner, Action } from '../../../../base/common/actions.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ThrottledDelayer } from '../../../../base/common/async.js';
import { localize } from '../../../../nls.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { CodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { getSimpleEditorOptions, setupSimpleEditorSelectionStyling } from '../../codeEditor/browser/simpleEditorOptions.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { EditorExtensionsRegistry } from '../../../../editor/browser/editorExtensions.js';
import { MenuPreventer } from '../../codeEditor/browser/menuPreventer.js';
import { SelectionClipboardContributionID } from '../../codeEditor/browser/selectionClipboard.js';
import { EditorDictation } from '../../codeEditor/browser/dictation/editorDictation.js';
import { ContextMenuController } from '../../../../editor/contrib/contextmenu/browser/contextmenu.js';
import * as platform from '../../../../base/common/platform.js';
import { format } from '../../../../base/common/strings.js';
import { SuggestController } from '../../../../editor/contrib/suggest/browser/suggestController.js';
import { SnippetController2 } from '../../../../editor/contrib/snippet/browser/snippetController2.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { ColorDetector } from '../../../../editor/contrib/colorPicker/browser/colorDetector.js';
import { LinkDetector } from '../../../../editor/contrib/links/browser/links.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { DEFAULT_FONT_FAMILY } from '../../../../base/browser/fonts.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { createActionViewItem, getFlatActionBarActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMarkdownRendererService, openLinkFromMarkdown } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { DragAndDropController } from '../../../../editor/contrib/dnd/browser/dnd.js';
import { CopyPasteController } from '../../../../editor/contrib/dropOrPasteInto/browser/copyPasteController.js';
import { DropIntoEditorController } from '../../../../editor/contrib/dropOrPasteInto/browser/dropIntoEditorController.js';
import { MessageController } from '../../../../editor/contrib/message/browser/messageController.js';
import { InlineCompletionsController } from '../../../../editor/contrib/inlineCompletions/browser/controller/inlineCompletionsController.js';
import { CodeActionController } from '../../../../editor/contrib/codeAction/browser/codeActionController.js';
import { FormatOnType } from '../../../../editor/contrib/format/browser/formatActions.js';
import { EditorOptions } from '../../../../editor/common/config/editorOptions.js';
import { EditOperation } from '../../../../editor/common/core/editOperation.js';
import { WorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { DropdownWithPrimaryActionViewItem } from '../../../../platform/actions/browser/dropdownWithPrimaryActionViewItem.js';
import { clamp } from '../../../../base/common/numbers.js';
import { ContentHoverController } from '../../../../editor/contrib/hover/browser/contentHoverController.js';
import { GlyphHoverController } from '../../../../editor/contrib/hover/browser/glyphHoverController.js';
import { autorun, runOnChange } from '../../../../base/common/observable.js';
import { PlaceholderTextContribution } from '../../../../editor/contrib/placeholderText/browser/placeholderTextContribution.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';
import product from '../../../../platform/product/common/product.js';
import { CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID } from '../../chat/browser/actions/chatActions.js';
export const SCMInputContextKeys = {
    SCMInputHasValidationMessage: new RawContextKey('scmInputHasValidationMessage', false),
};
var SCMInputWidgetCommandId;
(function (SCMInputWidgetCommandId) {
    SCMInputWidgetCommandId["CancelAction"] = "scm.input.cancelAction";
    SCMInputWidgetCommandId["SetupAction"] = "scm.input.triggerSetup";
})(SCMInputWidgetCommandId || (SCMInputWidgetCommandId = {}));
var SCMInputWidgetStorageKey;
(function (SCMInputWidgetStorageKey) {
    SCMInputWidgetStorageKey["LastActionId"] = "scm.input.lastActionId";
})(SCMInputWidgetStorageKey || (SCMInputWidgetStorageKey = {}));
let SCMInputWidgetActionRunner = class SCMInputWidgetActionRunner extends ActionRunner {
    get runningActions() { return this._runningActions; }
    constructor(input, storageService) {
        super();
        this.input = input;
        this.storageService = storageService;
        this._runningActions = new Set();
    }
    async runAction(action) {
        try {
            // Cancel previous action
            if (this.runningActions.size !== 0) {
                this._cts?.cancel();
                if (action.id === "scm.input.cancelAction" /* SCMInputWidgetCommandId.CancelAction */) {
                    return;
                }
            }
            // Create action context
            const context = [];
            for (const group of this.input.repository.provider.groups) {
                context.push({
                    resourceGroupId: group.id,
                    resources: [...group.resources.map(r => r.sourceUri)]
                });
            }
            // Run action
            this._runningActions.add(action);
            this._cts = new CancellationTokenSource();
            await action.run(...[this.input.repository.provider.rootUri, context, this._cts.token]);
        }
        finally {
            this._runningActions.delete(action);
            // Save last action
            if (this._runningActions.size === 0) {
                const actionId = action.id === "scm.input.triggerSetup" /* SCMInputWidgetCommandId.SetupAction */
                    ? product.defaultChatAgent?.generateCommitMessageCommand ?? action.id
                    : action.id;
                this.storageService.store("scm.input.lastActionId" /* SCMInputWidgetStorageKey.LastActionId */, actionId, 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
            }
        }
    }
};
SCMInputWidgetActionRunner = __decorate([
    __param(1, IStorageService)
], SCMInputWidgetActionRunner);
let SCMInputWidgetToolbar = class SCMInputWidgetToolbar extends WorkbenchToolBar {
    get dropdownActions() { return this._dropdownActions; }
    get dropdownAction() { return this._dropdownAction; }
    constructor(container, options, menuService, contextKeyService, contextMenuService, commandService, keybindingService, storageService, telemetryService) {
        super(container, options, menuService, contextKeyService, contextMenuService, keybindingService, commandService, telemetryService);
        this.menuService = menuService;
        this.contextKeyService = contextKeyService;
        this.storageService = storageService;
        this._dropdownActions = [];
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this._disposables = this._register(new MutableDisposable());
        this._dropdownAction = new Action('scmInputMoreActions', localize('scmInputMoreActions', "More Actions..."), 'codicon-chevron-down');
        this._cancelAction = new MenuItemAction({
            id: "scm.input.cancelAction" /* SCMInputWidgetCommandId.CancelAction */,
            title: localize('scmInputCancelAction', "Cancel"),
            icon: Codicon.stopCircle,
        }, undefined, undefined, undefined, undefined, contextKeyService, commandService);
    }
    setInput(input) {
        this._disposables.value = new DisposableStore();
        const contextKeyService = this.contextKeyService.createOverlay([
            ['scmProvider', input.repository.provider.providerId],
            ['scmProviderRootUri', input.repository.provider.rootUri?.toString()],
            ['scmProviderHasRootUri', !!input.repository.provider.rootUri]
        ]);
        const menu = this._disposables.value.add(this.menuService.createMenu(MenuId.SCMInputBox, contextKeyService, { emitEventsForSubmenuChanges: true }));
        const isEnabled = () => {
            return input.repository.provider.groups.some(g => g.resources.length > 0);
        };
        const updateToolbar = () => {
            const actions = getFlatActionBarActions(menu.getActions({ shouldForwardArgs: true }));
            for (const action of actions) {
                action.enabled = isEnabled();
            }
            this._dropdownAction.enabled = isEnabled();
            let primaryAction = undefined;
            if (this.actionRunner.runningActions.size !== 0) {
                primaryAction = this._cancelAction;
            }
            else if (actions.length === 1) {
                primaryAction = actions[0];
            }
            else if (actions.length > 1) {
                const lastActionId = this.storageService.get("scm.input.lastActionId" /* SCMInputWidgetStorageKey.LastActionId */, 0 /* StorageScope.PROFILE */, '');
                primaryAction = actions.find(a => a.id === lastActionId) ?? actions[0];
            }
            this._dropdownActions = actions.length === 1 ? [] : actions;
            super.setActions(primaryAction ? [primaryAction] : [], []);
            this._onDidChange.fire();
        };
        this._disposables.value.add(menu.onDidChange(() => updateToolbar()));
        this._disposables.value.add(input.repository.provider.onDidChangeResources(() => updateToolbar()));
        this._disposables.value.add(this.storageService.onDidChangeValue(0 /* StorageScope.PROFILE */, "scm.input.lastActionId" /* SCMInputWidgetStorageKey.LastActionId */, this._disposables.value)(() => updateToolbar()));
        this.actionRunner = this._disposables.value.add(new SCMInputWidgetActionRunner(input, this.storageService));
        this._disposables.value.add(this.actionRunner.onWillRun(e => {
            if (this.actionRunner.runningActions.size === 0) {
                super.setActions([this._cancelAction], []);
                this._onDidChange.fire();
            }
        }));
        this._disposables.value.add(this.actionRunner.onDidRun(e => {
            if (this.actionRunner.runningActions.size === 0) {
                updateToolbar();
            }
        }));
        updateToolbar();
    }
};
SCMInputWidgetToolbar = __decorate([
    __param(2, IMenuService),
    __param(3, IContextKeyService),
    __param(4, IContextMenuService),
    __param(5, ICommandService),
    __param(6, IKeybindingService),
    __param(7, IStorageService),
    __param(8, ITelemetryService)
], SCMInputWidgetToolbar);
class SCMInputWidgetEditorOptions {
    constructor(overflowWidgetsDomNode, configurationService) {
        this.overflowWidgetsDomNode = overflowWidgetsDomNode;
        this.configurationService = configurationService;
        this._onDidChange = new Emitter();
        this.onDidChange = this._onDidChange.event;
        this.defaultInputFontFamily = DEFAULT_FONT_FAMILY;
        this._disposables = new DisposableStore();
        const onDidChangeConfiguration = Event.filter(this.configurationService.onDidChangeConfiguration, e => {
            return e.affectsConfiguration('editor.accessibilitySupport') ||
                e.affectsConfiguration('editor.cursorBlinking') ||
                e.affectsConfiguration('editor.cursorStyle') ||
                e.affectsConfiguration('editor.cursorWidth') ||
                e.affectsConfiguration('editor.emptySelectionClipboard') ||
                e.affectsConfiguration('editor.fontFamily') ||
                e.affectsConfiguration('editor.roundedSelection') ||
                e.affectsConfiguration('editor.rulers') ||
                e.affectsConfiguration('editor.wordWrap') ||
                e.affectsConfiguration('editor.wordSegmenterLocales') ||
                e.affectsConfiguration('scm.inputFontFamily') ||
                e.affectsConfiguration('scm.inputFontSize');
        }, this._disposables);
        this._disposables.add(onDidChangeConfiguration(() => this._onDidChange.fire()));
    }
    getEditorConstructionOptions() {
        return {
            ...getSimpleEditorOptions(this.configurationService),
            ...this.getEditorOptions(),
            dragAndDrop: true,
            dropIntoEditor: { enabled: true },
            formatOnType: true,
            lineDecorationsWidth: 6,
            overflowWidgetsDomNode: this.overflowWidgetsDomNode,
            padding: { top: 2, bottom: 2 },
            quickSuggestions: false,
            renderWhitespace: 'none',
            scrollbar: {
                alwaysConsumeMouseWheel: false,
                vertical: 'hidden'
            },
            wrappingIndent: 'none',
            wrappingStrategy: 'advanced',
        };
    }
    getEditorOptions() {
        const fontFamily = this._getEditorFontFamily();
        const fontSize = this._getEditorFontSize();
        const lineHeight = this._getEditorLineHeight(fontSize);
        const wordSegmenterLocales = this.configurationService.getValue('editor.wordSegmenterLocales');
        const accessibilitySupport = this.configurationService.getValue('editor.accessibilitySupport');
        const cursorBlinking = this.configurationService.getValue('editor.cursorBlinking');
        const cursorStyle = this.configurationService.getValue('editor.cursorStyle');
        const cursorWidth = this.configurationService.getValue('editor.cursorWidth') ?? 1;
        const emptySelectionClipboard = this.configurationService.getValue('editor.emptySelectionClipboard') === true;
        const roundedSelection = this.configurationService.getValue('editor.roundedSelection') === true;
        return { ...this._getEditorLanguageConfiguration(), accessibilitySupport, cursorBlinking, cursorStyle, cursorWidth, fontFamily, fontSize, lineHeight, emptySelectionClipboard, roundedSelection, wordSegmenterLocales };
    }
    _getEditorFontFamily() {
        const inputFontFamily = this.configurationService.getValue('scm.inputFontFamily').trim();
        if (inputFontFamily.toLowerCase() === 'editor') {
            return this.configurationService.getValue('editor.fontFamily').trim();
        }
        if (inputFontFamily.length !== 0 && inputFontFamily.toLowerCase() !== 'default') {
            return inputFontFamily;
        }
        return this.defaultInputFontFamily;
    }
    _getEditorFontSize() {
        return this.configurationService.getValue('scm.inputFontSize');
    }
    _getEditorLanguageConfiguration() {
        // editor.rulers
        const rulersConfig = this.configurationService.inspect('editor.rulers', { overrideIdentifier: 'scminput' });
        const rulers = rulersConfig.overrideIdentifiers?.includes('scminput') ? EditorOptions.rulers.validate(rulersConfig.value) : [];
        // editor.wordWrap
        const wordWrapConfig = this.configurationService.inspect('editor.wordWrap', { overrideIdentifier: 'scminput' });
        const wordWrap = wordWrapConfig.overrideIdentifiers?.includes('scminput') ? EditorOptions.wordWrap.validate(wordWrapConfig.value) : 'on';
        return { rulers, wordWrap };
    }
    _getEditorLineHeight(fontSize) {
        return Math.round(fontSize * 1.5);
    }
    dispose() {
        this._disposables.dispose();
        this._onDidChange.dispose();
    }
}
let SCMInputWidget = class SCMInputWidget {
    static { SCMInputWidget_1 = this; }
    static { this.ValidationTimeouts = {
        [2 /* InputValidationType.Information */]: 5000,
        [1 /* InputValidationType.Warning */]: 8000,
        [0 /* InputValidationType.Error */]: 10000
    }; }
    get input() {
        return this.model?.input;
    }
    set input(input) {
        if (input === this.input) {
            return;
        }
        this.clearValidation();
        this.element.classList.remove('synthetic-focus');
        this.repositoryDisposables.clear();
        this.repositoryIdContextKey.set(input?.repository.id);
        if (!input) {
            this.inputEditor.setModel(undefined);
            this.model = undefined;
            return;
        }
        const textModel = input.repository.provider.inputBoxTextModel;
        this.inputEditor.setModel(textModel);
        if (this.configurationService.getValue('editor.wordBasedSuggestions', { resource: textModel.uri }) !== 'off') {
            this.configurationService.updateValue('editor.wordBasedSuggestions', 'off', { resource: textModel.uri }, 8 /* ConfigurationTarget.MEMORY */);
        }
        // Validation
        const validationDelayer = new ThrottledDelayer(200);
        const validate = async () => {
            const position = this.inputEditor.getSelection()?.getStartPosition();
            const offset = position && textModel.getOffsetAt(position);
            const value = textModel.getValue();
            this.setValidation(await input.validateInput(value, offset || 0));
        };
        const triggerValidation = () => validationDelayer.trigger(validate);
        this.repositoryDisposables.add(validationDelayer);
        this.repositoryDisposables.add(this.inputEditor.onDidChangeCursorPosition(triggerValidation));
        // Adaptive indentation rules
        const opts = this.modelService.getCreationOptions(textModel.getLanguageId(), textModel.uri, textModel.isForSimpleWidget);
        const onEnter = Event.filter(this.inputEditor.onKeyDown, e => e.keyCode === 3 /* KeyCode.Enter */, this.repositoryDisposables);
        this.repositoryDisposables.add(onEnter(() => textModel.detectIndentation(opts.insertSpaces, opts.tabSize)));
        // Keep model in sync with API
        textModel.setValue(input.value);
        this.repositoryDisposables.add(input.onDidChange(({ value, reason }) => {
            const currentValue = textModel.getValue();
            if (value === currentValue) { // circuit breaker
                return;
            }
            textModel.pushStackElement();
            textModel.pushEditOperations(null, [EditOperation.replaceMove(textModel.getFullModelRange(), value)], () => []);
            const position = reason === SCMInputChangeReason.HistoryPrevious
                ? textModel.getFullModelRange().getStartPosition()
                : textModel.getFullModelRange().getEndPosition();
            this.inputEditor.setPosition(position);
            this.inputEditor.revealPositionInCenterIfOutsideViewport(position);
        }));
        this.repositoryDisposables.add(input.onDidChangeFocus(() => this.focus()));
        this.repositoryDisposables.add(input.onDidChangeValidationMessage((e) => this.setValidation(e, { focus: true, timeout: true })));
        this.repositoryDisposables.add(input.onDidChangeValidateInput((e) => triggerValidation()));
        this.repositoryDisposables.add(input.onDidClearValidation(() => this.clearValidation()));
        // Keep API in sync with model and validate
        this.repositoryDisposables.add(textModel.onDidChangeContent(() => {
            input.setValue(textModel.getValue(), true);
            triggerValidation();
        }));
        // Aria label & placeholder text
        const accessibilityVerbosityConfig = observableConfigValue("accessibility.verbosity.sourceControl" /* AccessibilityVerbositySettingId.SourceControl */, true, this.configurationService);
        const getAriaLabel = (placeholder, verbosity) => {
            verbosity = verbosity ?? accessibilityVerbosityConfig.get();
            if (!verbosity || !this.accessibilityService.isScreenReaderOptimized()) {
                return placeholder;
            }
            const kbLabel = this.keybindingService.lookupKeybinding("editor.action.accessibilityHelp" /* AccessibilityCommandId.OpenAccessibilityHelp */)?.getLabel();
            return kbLabel
                ? localize('scmInput.accessibilityHelp', "{0}, Use {1} to open Source Control Accessibility Help.", placeholder, kbLabel)
                : localize('scmInput.accessibilityHelpNoKb', "{0}, Run the Open Accessibility Help command for more information.", placeholder);
        };
        const getPlaceholderText = () => {
            const binding = this.keybindingService.lookupKeybinding('scm.acceptInput');
            const label = binding ? binding.getLabel() : (platform.isMacintosh ? 'Cmd+Enter' : 'Ctrl+Enter');
            return format(input.placeholder, label);
        };
        const updatePlaceholderText = () => {
            const placeholder = getPlaceholderText();
            const ariaLabel = getAriaLabel(placeholder);
            this.inputEditor.updateOptions({ ariaLabel, placeholder });
        };
        this.repositoryDisposables.add(input.onDidChangePlaceholder(updatePlaceholderText));
        this.repositoryDisposables.add(this.keybindingService.onDidUpdateKeybindings(updatePlaceholderText));
        this.repositoryDisposables.add(runOnChange(accessibilityVerbosityConfig, verbosity => {
            const placeholder = getPlaceholderText();
            const ariaLabel = getAriaLabel(placeholder, verbosity);
            this.inputEditor.updateOptions({ ariaLabel });
        }));
        updatePlaceholderText();
        // Update input template
        let commitTemplate = '';
        this.repositoryDisposables.add(autorun(reader => {
            if (!input.visible) {
                return;
            }
            const oldCommitTemplate = commitTemplate;
            commitTemplate = input.repository.provider.commitTemplate.read(reader);
            const value = textModel.getValue();
            if (value && value !== oldCommitTemplate) {
                return;
            }
            textModel.setValue(commitTemplate);
        }));
        // Update input enablement
        const updateEnablement = (enabled) => {
            this.inputEditor.updateOptions({ readOnly: !enabled });
        };
        this.repositoryDisposables.add(input.onDidChangeEnablement(enabled => updateEnablement(enabled)));
        updateEnablement(input.enabled);
        // Toolbar
        this.toolbar.setInput(input);
        // Save model
        this.model = { input, textModel };
    }
    get selections() {
        return this.inputEditor.getSelections();
    }
    set selections(selections) {
        if (selections) {
            this.inputEditor.setSelections(selections);
        }
    }
    setValidation(validation, options) {
        if (this._validationTimer) {
            clearTimeout(this._validationTimer);
            this._validationTimer = undefined;
        }
        this.validation = validation;
        this.renderValidation();
        if (options?.focus && !this.hasFocus()) {
            this.focus();
        }
        if (validation && options?.timeout) {
            this._validationTimer = setTimeout(() => this.setValidation(undefined), SCMInputWidget_1.ValidationTimeouts[validation.type]);
        }
    }
    constructor(container, overflowWidgetsDomNode, contextKeyService, instantiationService, modelService, keybindingService, configurationService, scmViewService, contextViewService, openerService, accessibilityService, markdownRendererService) {
        this.modelService = modelService;
        this.keybindingService = keybindingService;
        this.configurationService = configurationService;
        this.scmViewService = scmViewService;
        this.contextViewService = contextViewService;
        this.openerService = openerService;
        this.accessibilityService = accessibilityService;
        this.markdownRendererService = markdownRendererService;
        this.disposables = new DisposableStore();
        this.repositoryDisposables = new DisposableStore();
        this.validationHasFocus = false;
        // This is due to "Setup height change listener on next tick" above
        // https://github.com/microsoft/vscode/issues/108067
        this.lastLayoutWasTrash = false;
        this.shouldFocusAfterLayout = false;
        this.element = append(container, $('.scm-editor'));
        this.editorContainer = append(this.element, $('.scm-editor-container'));
        this.toolbarContainer = append(this.element, $('.scm-editor-toolbar'));
        this.contextKeyService = this.disposables.add(contextKeyService.createScoped(this.element));
        this.repositoryIdContextKey = this.contextKeyService.createKey('scmRepository', undefined);
        this.validationMessageContextKey = SCMInputContextKeys.SCMInputHasValidationMessage.bindTo(this.contextKeyService);
        this.inputEditorOptions = new SCMInputWidgetEditorOptions(overflowWidgetsDomNode, this.configurationService);
        this.disposables.add(this.inputEditorOptions.onDidChange(this.onDidChangeEditorOptions, this));
        this.disposables.add(this.inputEditorOptions);
        const codeEditorWidgetOptions = {
            contributions: EditorExtensionsRegistry.getSomeEditorContributions([
                CodeActionController.ID,
                ColorDetector.ID,
                ContextMenuController.ID,
                CopyPasteController.ID,
                DragAndDropController.ID,
                DropIntoEditorController.ID,
                EditorDictation.ID,
                FormatOnType.ID,
                ContentHoverController.ID,
                GlyphHoverController.ID,
                InlineCompletionsController.ID,
                LinkDetector.ID,
                MenuPreventer.ID,
                MessageController.ID,
                PlaceholderTextContribution.ID,
                SelectionClipboardContributionID,
                SnippetController2.ID,
                SuggestController.ID
            ]),
            isSimpleWidget: true
        };
        const services = new ServiceCollection([IContextKeyService, this.contextKeyService]);
        const instantiationService2 = instantiationService.createChild(services, this.disposables);
        const editorConstructionOptions = this.inputEditorOptions.getEditorConstructionOptions();
        this.inputEditor = instantiationService2.createInstance(CodeEditorWidget, this.editorContainer, editorConstructionOptions, codeEditorWidgetOptions);
        this.disposables.add(this.inputEditor);
        this.disposables.add(this.inputEditor.onDidFocusEditorText(() => {
            if (this.input?.repository) {
                this.scmViewService.focus(this.input.repository);
            }
            this.element.classList.add('synthetic-focus');
            this.renderValidation();
        }));
        this.disposables.add(this.inputEditor.onDidBlurEditorText(() => {
            this.element.classList.remove('synthetic-focus');
            setTimeout(() => {
                if (!this.validation || !this.validationHasFocus) {
                    this.clearValidation();
                }
            }, 0);
        }));
        this.disposables.add(this.inputEditor.onDidBlurEditorWidget(() => {
            CopyPasteController.get(this.inputEditor)?.clearWidgets();
            DropIntoEditorController.get(this.inputEditor)?.clearWidgets();
        }));
        const firstLineKey = this.contextKeyService.createKey('scmInputIsInFirstPosition', false);
        const lastLineKey = this.contextKeyService.createKey('scmInputIsInLastPosition', false);
        this.disposables.add(this.inputEditor.onDidChangeCursorPosition(({ position }) => {
            const viewModel = this.inputEditor._getViewModel();
            const lastLineNumber = viewModel.getLineCount();
            const lastLineCol = viewModel.getLineLength(lastLineNumber) + 1;
            const viewPosition = viewModel.coordinatesConverter.convertModelPositionToViewPosition(position);
            firstLineKey.set(viewPosition.lineNumber === 1 && viewPosition.column === 1);
            lastLineKey.set(viewPosition.lineNumber === lastLineNumber && viewPosition.column === lastLineCol);
        }));
        this.disposables.add(this.inputEditor.onDidScrollChange(e => {
            this.toolbarContainer.classList.toggle('scroll-decoration', e.scrollTop > 0);
        }));
        Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration('scm.showInputActionButton'))(() => this.layout(), this, this.disposables);
        this.onDidChangeContentHeight = Event.signal(Event.filter(this.inputEditor.onDidContentSizeChange, e => e.contentHeightChanged, this.disposables));
        // Toolbar
        this.toolbar = instantiationService2.createInstance(SCMInputWidgetToolbar, this.toolbarContainer, {
            actionViewItemProvider: (action, options) => {
                if (action instanceof MenuItemAction && this.toolbar.dropdownActions.length > 1) {
                    return instantiationService.createInstance(DropdownWithPrimaryActionViewItem, action, this.toolbar.dropdownAction, this.toolbar.dropdownActions, '', { actionRunner: this.toolbar.actionRunner, hoverDelegate: options.hoverDelegate });
                }
                return createActionViewItem(instantiationService, action, options);
            },
            hiddenItemStrategy: -1 /* HiddenItemStrategy.NoHide */,
            menuOptions: {
                shouldForwardArgs: true
            }
        });
        this.disposables.add(this.toolbar.onDidChange(() => this.layout()));
        this.disposables.add(this.toolbar);
    }
    getContentHeight() {
        const lineHeight = this.inputEditor.getOption(75 /* EditorOption.lineHeight */);
        const { top, bottom } = this.inputEditor.getOption(96 /* EditorOption.padding */);
        const inputMinLinesConfig = this.configurationService.getValue('scm.inputMinLineCount');
        const inputMinLines = typeof inputMinLinesConfig === 'number' ? clamp(inputMinLinesConfig, 1, 50) : 1;
        const editorMinHeight = inputMinLines * lineHeight + top + bottom;
        const inputMaxLinesConfig = this.configurationService.getValue('scm.inputMaxLineCount');
        const inputMaxLines = typeof inputMaxLinesConfig === 'number' ? clamp(inputMaxLinesConfig, 1, 50) : 10;
        const editorMaxHeight = inputMaxLines * lineHeight + top + bottom;
        return clamp(this.inputEditor.getContentHeight(), editorMinHeight, editorMaxHeight);
    }
    layout() {
        const editorHeight = this.getContentHeight();
        const toolbarWidth = this.getToolbarWidth();
        const dimension = new Dimension(this.element.clientWidth - toolbarWidth, editorHeight);
        if (dimension.width < 0) {
            this.lastLayoutWasTrash = true;
            return;
        }
        this.lastLayoutWasTrash = false;
        this.inputEditor.layout(dimension);
        this.renderValidation();
        const showInputActionButton = this.configurationService.getValue('scm.showInputActionButton') === true;
        this.toolbarContainer.classList.toggle('hidden', !showInputActionButton || this.toolbar?.isEmpty() === true);
        if (this.shouldFocusAfterLayout) {
            this.shouldFocusAfterLayout = false;
            this.focus();
        }
    }
    focus() {
        if (this.lastLayoutWasTrash) {
            this.lastLayoutWasTrash = false;
            this.shouldFocusAfterLayout = true;
            return;
        }
        this.inputEditor.focus();
        this.element.classList.add('synthetic-focus');
    }
    hasFocus() {
        return this.inputEditor.hasTextFocus();
    }
    onDidChangeEditorOptions() {
        this.inputEditor.updateOptions(this.inputEditorOptions.getEditorOptions());
    }
    renderValidation() {
        this.clearValidation();
        this.element.classList.toggle('validation-info', this.validation?.type === 2 /* InputValidationType.Information */);
        this.element.classList.toggle('validation-warning', this.validation?.type === 1 /* InputValidationType.Warning */);
        this.element.classList.toggle('validation-error', this.validation?.type === 0 /* InputValidationType.Error */);
        if (!this.validation || !this.inputEditor.hasTextFocus()) {
            return;
        }
        this.validationMessageContextKey.set(true);
        const disposables = new DisposableStore();
        this.validationContextView = this.contextViewService.showContextView({
            getAnchor: () => this.element,
            render: container => {
                this.element.style.borderBottomLeftRadius = '0';
                this.element.style.borderBottomRightRadius = '0';
                const validationContainer = append(container, $('.scm-editor-validation-container'));
                validationContainer.classList.toggle('validation-info', this.validation.type === 2 /* InputValidationType.Information */);
                validationContainer.classList.toggle('validation-warning', this.validation.type === 1 /* InputValidationType.Warning */);
                validationContainer.classList.toggle('validation-error', this.validation.type === 0 /* InputValidationType.Error */);
                validationContainer.style.width = `${this.element.clientWidth + 2}px`;
                const element = append(validationContainer, $('.scm-editor-validation'));
                const message = this.validation.message;
                if (typeof message === 'string') {
                    element.textContent = message;
                }
                else {
                    const tracker = trackFocus(element);
                    disposables.add(tracker);
                    disposables.add(tracker.onDidFocus(() => (this.validationHasFocus = true)));
                    disposables.add(tracker.onDidBlur(() => {
                        this.validationHasFocus = false;
                        this.element.style.borderBottomLeftRadius = '2px';
                        this.element.style.borderBottomRightRadius = '2px';
                        this.contextViewService.hideContextView();
                    }));
                    const renderedMarkdown = this.markdownRendererService.render(message, {
                        actionHandler: (link, mdStr) => {
                            openLinkFromMarkdown(this.openerService, link, mdStr.isTrusted);
                            this.element.style.borderBottomLeftRadius = '2px';
                            this.element.style.borderBottomRightRadius = '2px';
                            this.contextViewService.hideContextView();
                        },
                    });
                    disposables.add(renderedMarkdown);
                    element.appendChild(renderedMarkdown.element);
                }
                const actionsContainer = append(validationContainer, $('.scm-editor-validation-actions'));
                const actionbar = new ActionBar(actionsContainer);
                const action = new Action('scmInputWidget.validationMessage.close', localize('label.close', "Close"), ThemeIcon.asClassName(Codicon.close), true, () => {
                    this.contextViewService.hideContextView();
                    this.element.style.borderBottomLeftRadius = '2px';
                    this.element.style.borderBottomRightRadius = '2px';
                });
                disposables.add(actionbar);
                actionbar.push(action, { icon: true, label: false });
                return Disposable.None;
            },
            onHide: () => {
                this.validationHasFocus = false;
                this.element.style.borderBottomLeftRadius = '2px';
                this.element.style.borderBottomRightRadius = '2px';
                disposables.dispose();
            },
            anchorAlignment: 0 /* AnchorAlignment.LEFT */
        });
    }
    getToolbarWidth() {
        const showInputActionButton = this.configurationService.getValue('scm.showInputActionButton');
        if (!this.toolbar || !showInputActionButton || this.toolbar?.isEmpty() === true) {
            return 0;
        }
        return this.toolbar.dropdownActions.length === 0 ?
            26 /* 22px action + 4px margin */ :
            39 /* 35px action + 4px margin */;
    }
    clearValidation() {
        this.validationContextView?.close();
        this.validationContextView = undefined;
        this.validationHasFocus = false;
        this.validationMessageContextKey.set(false);
    }
    dispose() {
        this.input = undefined;
        this.repositoryDisposables.dispose();
        this.clearValidation();
        this.disposables.dispose();
    }
};
SCMInputWidget = SCMInputWidget_1 = __decorate([
    __param(2, IContextKeyService),
    __param(3, IInstantiationService),
    __param(4, IModelService),
    __param(5, IKeybindingService),
    __param(6, IConfigurationService),
    __param(7, ISCMViewService),
    __param(8, IContextViewService),
    __param(9, IOpenerService),
    __param(10, IAccessibilityService),
    __param(11, IMarkdownRendererService)
], SCMInputWidget);
export { SCMInputWidget };
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: "scm.input.triggerSetup" /* SCMInputWidgetCommandId.SetupAction */,
            title: localize('scmInputGenerateCommitMessage', "Generate Commit Message"),
            icon: Codicon.sparkle,
            f1: false,
            menu: {
                id: MenuId.SCMInputBox,
                when: ContextKeyExpr.and(ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabled.negate(), ChatContextKeys.Setup.completed.negate(), ContextKeyExpr.equals('scmProvider', 'git'))
            }
        });
    }
    async run(accessor, ...args) {
        const commandService = accessor.get(ICommandService);
        const result = await commandService.executeCommand(CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID);
        if (!result) {
            return;
        }
        const command = product.defaultChatAgent?.generateCommitMessageCommand;
        if (!command) {
            return;
        }
        await commandService.executeCommand(command, ...args);
    }
});
setupSimpleEditorSelectionStyling('.scm-view .scm-editor-container');
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NtSW5wdXQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9zY20vYnJvd3Nlci9zY21JbnB1dC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxpQkFBaUIsQ0FBQztBQUN6QixPQUFPLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDdEcsT0FBTyxFQUFFLE1BQU0sRUFBRSxDQUFDLEVBQUUsU0FBUyxFQUFFLFVBQVUsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ25GLE9BQU8sRUFBb0QsZUFBZSxFQUFFLG9CQUFvQixFQUFpQyxNQUFNLGtCQUFrQixDQUFDO0FBQzFKLE9BQU8sRUFBRSxxQkFBcUIsRUFBb0IsTUFBTSw0REFBNEQsQ0FBQztBQUNySCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsbUJBQW1CLEVBQW9CLE1BQU0seURBQXlELENBQUM7QUFDckksT0FBTyxFQUFFLGtCQUFrQixFQUFlLGNBQWMsRUFBRSxhQUFhLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN0SSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDbkYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDMUYsT0FBTyxFQUFFLGNBQWMsRUFBRSxZQUFZLEVBQUUsZUFBZSxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNoSSxPQUFPLEVBQVcsWUFBWSxFQUFFLE1BQU0sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ25GLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxvREFBb0QsQ0FB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
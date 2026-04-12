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
import { $, getActiveElement, getTotalHeight, getWindow, h, reset, trackFocus } from '../../../../base/browser/dom.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { renderLabelWithIcons } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, observableValue } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { Selection } from '../../../../editor/common/core/selection.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { localize } from '../../../../nls.js';
import { IAccessibleViewService } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { MenuWorkbenchButtonBar } from '../../../../platform/actions/browser/buttonbar.js';
import { createActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { IMarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';
import product from '../../../../platform/product/common/product.js';
import { asCssVariable, asCssVariableName, editorBackground, inputBackground } from '../../../../platform/theme/common/colorRegistry.js';
import { EDITOR_DRAG_AND_DROP_BACKGROUND } from '../../../common/theme.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { ChatWidget } from '../../chat/browser/widget/chatWidget.js';
import { chatRequestBackground } from '../../chat/common/widget/chatColors.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';
import { ChatMode } from '../../chat/common/chatModes.js';
import { ChatAgentVoteDirection, IChatService } from '../../chat/common/chatService/chatService.js';
import { isResponseVM } from '../../chat/common/model/chatViewModel.js';
import { CTX_INLINE_CHAT_FOCUSED, CTX_INLINE_CHAT_RESPONSE_FOCUSED, inlineChatBackground, inlineChatForeground } from '../common/inlineChat.js';
import './media/inlineChat.css';
let InlineChatWidget = class InlineChatWidget {
    constructor(location, _options, _instantiationService, _contextKeyService, _keybindingService, _accessibilityService, _configurationService, _accessibleViewService, _textModelResolverService, _modelService, _chatService, _hoverService, _chatEntitlementService, _markdownRendererService) {
        this._options = _options;
        this._instantiationService = _instantiationService;
        this._contextKeyService = _contextKeyService;
        this._keybindingService = _keybindingService;
        this._accessibilityService = _accessibilityService;
        this._configurationService = _configurationService;
        this._accessibleViewService = _accessibleViewService;
        this._textModelResolverService = _textModelResolverService;
        this._modelService = _modelService;
        this._chatService = _chatService;
        this._hoverService = _hoverService;
        this._chatEntitlementService = _chatEntitlementService;
        this._markdownRendererService = _markdownRendererService;
        this._elements = h('div.inline-chat@root', [
            h('div.chat-widget@chatWidget'),
            h('div.accessibleViewer@accessibleViewer'),
            h('div.status@status', [
                h('div.label.info.hidden@infoLabel'),
                h('div.actions.hidden@toolbar1'),
                h('div.label.status.hidden@statusLabel'),
                h('div.actions.secondary.hidden@toolbar2'),
                h('div.label.disclaimer.hidden@disclaimerLabel'),
            ]),
        ]);
        this._store = new DisposableStore();
        this._onDidChangeHeight = this._store.add(new Emitter());
        this.onDidChangeHeight = Event.filter(this._onDidChangeHeight.event, _ => !this._isLayouting);
        this._requestInProgress = observableValue(this, false);
        this.requestInProgress = this._requestInProgress;
        this._isLayouting = false;
        this.scopedContextKeyService = this._store.add(_contextKeyService.createScoped(this._elements.chatWidget));
        const scopedInstaService = _instantiationService.createChild(new ServiceCollection([
            IContextKeyService,
            this.scopedContextKeyService
        ]), this._store);
        this._chatWidget = scopedInstaService.createInstance(ChatWidget, location, { isInlineChat: true }, {
            autoScroll: true,
            defaultElementHeight: 32,
            renderStyle: 'minimal',
            renderInputOnTop: false,
            renderFollowups: true,
            supportsFileReferences: true,
            filter: item => {
                if (!isResponseVM(item) || item.errorDetails) {
                    // show all requests and errors
                    return true;
                }
                const emptyResponse = item.response.value.length === 0;
                if (emptyResponse) {
                    return false;
                }
                if (item.response.value.every(item => item.kind === 'textEditGroup' && _options.chatWidgetViewOptions?.rendererOptions?.renderTextEditsAsSummary?.(item.uri))) {
                    return false;
                }
                return true;
            },
            dndContainer: this._elements.root,
            defaultMode: ChatMode.Ask,
            ..._options.chatWidgetViewOptions
        }, {
            listForeground: inlineChatForeground,
            listBackground: inlineChatBackground,
            overlayBackground: EDITOR_DRAG_AND_DROP_BACKGROUND,
            inputEditorBackground: inputBackground,
            resultEditorBackground: editorBackground
        });
        this._elements.root.classList.toggle('in-zone-widget', !!_options.inZoneWidget);
        this._chatWidget.render(this._elements.chatWidget);
        this._elements.chatWidget.style.setProperty(asCssVariableName(chatRequestBackground), asCssVariable(inlineChatBackground));
        this._chatWidget.setVisible(true);
        this._store.add(this._chatWidget);
        const ctxResponse = ChatContextKeys.isResponse.bindTo(this.scopedContextKeyService);
        const ctxResponseVote = ChatContextKeys.responseVote.bindTo(this.scopedContextKeyService);
        const ctxResponseSupportIssues = ChatContextKeys.responseSupportsIssueReporting.bindTo(this.scopedContextKeyService);
        const ctxResponseError = ChatContextKeys.responseHasError.bindTo(this.scopedContextKeyService);
        const ctxResponseErrorFiltered = ChatContextKeys.responseIsFiltered.bindTo(this.scopedContextKeyService);
        const viewModelStore = this._store.add(new DisposableStore());
        this._store.add(this._chatWidget.onDidChangeViewModel(() => {
            viewModelStore.clear();
            const viewModel = this._chatWidget.viewModel;
            if (!viewModel) {
                return;
            }
            viewModelStore.add(toDisposable(() => {
                toolbar2.context = undefined;
                ctxResponse.reset();
                ctxResponseVote.reset();
                ctxResponseError.reset();
                ctxResponseErrorFiltered.reset();
                ctxResponseSupportIssues.reset();
            }));
            viewModelStore.add(viewModel.onDidChange(() => {
                this._requestInProgress.set(viewModel.model.requestInProgress.get(), undefined);
                const last = viewModel.getItems().at(-1);
                toolbar2.context = last;
                ctxResponse.set(isResponseVM(last));
                ctxResponseVote.set(isResponseVM(last) ? last.vote === ChatAgentVoteDirection.Down ? 'down' : last.vote === ChatAgentVoteDirection.Up ? 'up' : '' : '');
                ctxResponseError.set(isResponseVM(last) && last.errorDetails !== undefined);
                ctxResponseErrorFiltered.set((!!(isResponseVM(last) && last.errorDetails?.responseIsFiltered)));
                ctxResponseSupportIssues.set(isResponseVM(last) && (last.agent?.metadata.supportIssueReporting ?? false));
                this._onDidChangeHeight.fire();
            }));
            this._onDidChangeHeight.fire();
        }));
        this._store.add(this.chatWidget.onDidChangeContentHeight(() => {
            this._onDidChangeHeight.fire();
        }));
        // context keys
        this._ctxResponseFocused = CTX_INLINE_CHAT_RESPONSE_FOCUSED.bindTo(this._contextKeyService);
        const tracker = this._store.add(trackFocus(this.domNode));
        this._store.add(tracker.onDidBlur(() => this._ctxResponseFocused.set(false)));
        this._store.add(tracker.onDidFocus(() => this._ctxResponseFocused.set(true)));
        this._ctxInputEditorFocused = CTX_INLINE_CHAT_FOCUSED.bindTo(_contextKeyService);
        this._store.add(this._chatWidget.inputEditor.onDidFocusEditorWidget(() => this._ctxInputEditorFocused.set(true)));
        this._store.add(this._chatWidget.inputEditor.onDidBlurEditorWidget(() => this._ctxInputEditorFocused.set(false)));
        const statusMenuId = _options.statusMenuId instanceof MenuId ? _options.statusMenuId : _options.statusMenuId.menu;
        // BUTTON bar
        const statusMenuOptions = _options.statusMenuId instanceof MenuId ? undefined : _options.statusMenuId.options;
        const statusButtonBar = scopedInstaService.createInstance(MenuWorkbenchButtonBar, this._elements.toolbar1, statusMenuId, {
            toolbarOptions: { primaryGroup: '0_main' },
            telemetrySource: _options.chatWidgetViewOptions?.menus?.telemetrySource,
            menuOptions: { renderShortTitle: true },
            ...statusMenuOptions,
        });
        this._store.add(statusButtonBar.onDidChange(() => this._onDidChangeHeight.fire()));
        this._store.add(statusButtonBar);
        // secondary toolbar
        const toolbar2 = scopedInstaService.createInstance(MenuWorkbenchToolBar, this._elements.toolbar2, _options.secondaryMenuId ?? MenuId.for(''), {
            telemetrySource: _options.chatWidgetViewOptions?.menus?.telemetrySource,
            menuOptions: { renderShortTitle: true, shouldForwardArgs: true },
            actionViewItemProvider: (action, options) => {
                return createActionViewItem(scopedInstaService, action, options);
            }
        });
        this._store.add(toolbar2.onDidChangeMenuItems(() => this._onDidChangeHeight.fire()));
        this._store.add(toolbar2);
        this._store.add(this._configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration("accessibility.verbosity.inlineChat" /* AccessibilityVerbositySettingId.InlineChat */)) {
                this._updateAriaLabel();
            }
        }));
        this._elements.root.tabIndex = 0;
        this._elements.statusLabel.tabIndex = 0;
        this._updateAriaLabel();
        this._setupDisclaimer();
        this._store.add(this._hoverService.setupManagedHover(getDefaultHoverDelegate('element'), this._elements.statusLabel, () => {
            return this._elements.statusLabel.dataset['title'];
        }));
        this._store.add(this._chatService.onDidPerformUserAction(e => {
            if (isEqual(e.sessionResource, this._chatWidget.viewModel?.model.sessionResource) && e.action.kind === 'vote') {
                this.updateStatus(localize('feedbackThanks', "Thank you for your feedback!"), { resetAfter: 1250 });
            }
        }));
    }
    _updateAriaLabel() {
        this._elements.root.ariaLabel = this._accessibleViewService.getOpenAriaHint("accessibility.verbosity.inlineChat" /* AccessibilityVerbositySettingId.InlineChat */);
        if (this._accessibilityService.isScreenReaderOptimized()) {
            let label = defaultAriaLabel;
            if (this._configurationService.getValue("accessibility.verbosity.inlineChat" /* AccessibilityVerbositySettingId.InlineChat */)) {
                const kbLabel = this._keybindingService.lookupKeybinding("editor.action.accessibilityHelp" /* AccessibilityCommandId.OpenAccessibilityHelp */)?.getLabel();
                label = kbLabel
                    ? localize('inlineChat.accessibilityHelp', "Inline Chat Input, Use {0} for Inline Chat Accessibility Help.", kbLabel)
                    : localize('inlineChat.accessibilityHelpNoKb', "Inline Chat Input, Run the Inline Chat Accessibility Help command for more information.");
            }
            this._chatWidget.inputEditor.updateOptions({ ariaLabel: label });
        }
    }
    _setupDisclaimer() {
        const disposables = this._store.add(new DisposableStore());
        this._store.add(autorun(reader => {
            disposables.clear();
            reset(this._elements.disclaimerLabel);
            const sentiment = this._chatEntitlementService.sentimentObs.read(reader);
            const anonymous = this._chatEntitlementService.anonymousObs.read(reader);
            const requestInProgress = this._chatService.requestInProgressObs.read(reader);
            const showDisclaimer = !sentiment.completed && anonymous && !requestInProgress;
            this._elements.disclaimerLabel.classList.toggle('hidden', !showDisclaimer);
            if (showDisclaimer) {
                const renderedMarkdown = disposables.add(this._markdownRendererService.render(new MarkdownString(localize({ key: 'termsDisclaimer', comment: ['{Locked="]({2})"}', '{Locked="]({3})"}'] }, "By continuing with {0} Copilot, you agree to {1}'s [Terms]({2}) and [Privacy Statement]({3})", product.defaultChatAgent?.provider?.default?.name ?? '', product.defaultChatAgent?.provider?.default?.name ?? '', product.defaultChatAgent?.termsStatementUrl ?? '', product.defaultChatAgent?.privacyStatementUrl ?? ''), { isTrusted: true })));
                this._elements.disclaimerLabel.appendChild(renderedMarkdown.element);
            }
            this._onDidChangeHeight.fire();
        }));
    }
    dispose() {
        this._store.dispose();
    }
    get domNode() {
        return this._elements.root;
    }
    get chatWidget() {
        return this._chatWidget;
    }
    saveState() {
        this._chatWidget.saveState();
    }
    layout(widgetDim) {
        const contentHeight = this.contentHeight;
        this._isLayouting = true;
        try {
            this._doLayout(widgetDim);
        }
        finally {
            this._isLayouting = false;
            if (this.contentHeight !== contentHeight) {
                this._onDidChangeHeight.fire();
            }
        }
    }
    _doLayout(dimension) {
        const extraHeight = this._getExtraHeight();
        const statusHeight = getTotalHeight(this._elements.status);
        // console.log('ZONE#Widget#layout', { height: dimension.height, extraHeight, progressHeight, followUpsHeight, statusHeight, LIST: dimension.height - progressHeight - followUpsHeight - statusHeight - extraHeight });
        this._elements.root.style.height = `${dimension.height - extraHeight}px`;
        this._elements.root.style.width = `${dimension.width}px`;
        this._chatWidget.layout(dimension.height - statusHeight - extraHeight, dimension.width);
    }
    /**
     * The content height of this widget is the size that would require no scrolling
     */
    get contentHeight() {
        const data = {
            chatWidgetContentHeight: this._chatWidget.contentHeight,
            statusHeight: getTotalHeight(this._elements.status),
            extraHeight: this._getExtraHeight()
        };
        const result = data.chatWidgetContentHeight + data.statusHeight + data.extraHeight;
        return result;
    }
    get minHeight() {
        // The chat widget is variable height and supports scrolling. It should be
        // at least "maxWidgetHeight" high and at most the content height.
        let maxWidgetOutputHeight = 100;
        for (const item of this._chatWidget.viewModel?.getItems() ?? []) {
            if (isResponseVM(item) && item.response.value.some(r => r.kind === 'textEditGroup' && !r.state?.applied)) {
                maxWidgetOutputHeight = 270;
                break;
            }
        }
        let value = this.contentHeight;
        value -= this._chatWidget.contentHeight;
        value += Math.min(this._chatWidget.input.height.get() + maxWidgetOutputHeight, this._chatWidget.contentHeight);
        return value;
    }
    _getExtraHeight() {
        return this._options.inZoneWidget ? 1 : (2 /*border*/ + 4 /*shadow*/);
    }
    get value() {
        return this._chatWidget.getInput();
    }
    set value(value) {
        this._chatWidget.setInput(value);
    }
    selectAll() {
        this._chatWidget.inputEditor.setSelection(new Selection(1, 1, Number.MAX_SAFE_INTEGER, 1));
    }
    set placeholder(value) {
        this._chatWidget.setInputPlaceholder(value);
    }
    toggleStatus(show) {
        this._elements.toolbar1.classList.toggle('hidden', !show);
        this._elements.toolbar2.classList.toggle('hidden', !show);
        this._elements.status.classList.toggle('hidden', !show);
        this._elements.infoLabel.classList.toggle('hidden', !show);
        this._onDidChangeHeight.fire();
    }
    updateToolbar(show) {
        this._elements.root.classList.toggle('toolbar', show);
        this._elements.toolbar1.classList.toggle('hidden', !show);
        this._elements.toolbar2.classList.toggle('hidden', !show);
        this._elements.status.classList.toggle('actions', show);
        this._elements.infoLabel.classList.toggle('hidden', show);
        this._onDidChangeHeight.fire();
    }
    async getCodeBlockInfo(codeBlockIndex) {
        const { viewModel } = this._chatWidget;
        if (!viewModel) {
            return undefined;
        }
        const items = viewModel.getItems().filter(i => isResponseVM(i));
        const item = items.at(-1);
        if (!item) {
            return;
        }
        // Look for the code block in the rendered response
        const codeBlocks = this._chatWidget.getCodeBlockInfosForResponse(item);
        const info = codeBlocks[codeBlockIndex];
        if (info?.uri) {
            return this._modelService.getModel(info.uri) ?? undefined;
        }
        // Fallback: if the code block hasn't been rendered yet (e.g. due to
        // timing between response completion and list rendering), parse the
        // markdown directly and create a transient model.
        const markdown = item.response.getMarkdown();
        let currentCodeBlockIndex = 0;
        let foundText;
        for (const line of markdown.split('\n')) {
            if (line.startsWith('```') && foundText === undefined) {
                foundText = '';
            }
            else if (line.startsWith('```') && foundText !== undefined) {
                if (currentCodeBlockIndex === codeBlockIndex) {
                    break;
                }
                currentCodeBlockIndex++;
                foundText = undefined;
            }
            else if (foundText !== undefined) {
                foundText += (foundText ? '\n' : '') + line;
            }
        }
        if (foundText !== undefined && currentCodeBlockIndex === codeBlockIndex) {
            return this._modelService.createModel(foundText, null, undefined, true);
        }
        return undefined;
    }
    get responseContent() {
        const requests = this._chatWidget.viewModel?.model.getRequests();
        return requests?.at(-1)?.response?.response.toString();
    }
    getChatModel() {
        return this._chatWidget.viewModel?.model;
    }
    setChatModel(chatModel) {
        chatModel.inputModel.setState({ inputText: '', selections: [] });
        this._chatWidget.setModel(chatModel);
    }
    updateInfo(message) {
        this._elements.infoLabel.classList.toggle('hidden', !message);
        const renderedMessage = renderLabelWithIcons(message);
        reset(this._elements.infoLabel, ...renderedMessage);
        this._onDidChangeHeight.fire();
    }
    updateStatus(message, ops = {}) {
        const isTempMessage = typeof ops.resetAfter === 'number';
        if (isTempMessage && !this._elements.statusLabel.dataset['state']) {
            const statusLabel = this._elements.statusLabel.innerText;
            const title = this._elements.statusLabel.dataset['title'];
            const classes = Array.from(this._elements.statusLabel.classList.values());
            setTimeout(() => {
                this.updateStatus(statusLabel, { classes, keepMessage: true, title });
            }, ops.resetAfter);
        }
        const renderedMessage = renderLabelWithIcons(message);
        reset(this._elements.statusLabel, ...renderedMessage);
        this._elements.statusLabel.className = `label status ${(ops.classes ?? []).join(' ')}`;
        this._elements.statusLabel.classList.toggle('hidden', !message);
        if (isTempMessage) {
            this._elements.statusLabel.dataset['state'] = 'temp';
        }
        else {
            delete this._elements.statusLabel.dataset['state'];
        }
        if (ops.title) {
            this._elements.statusLabel.dataset['title'] = ops.title;
        }
        else {
            delete this._elements.statusLabel.dataset['title'];
        }
        this._onDidChangeHeight.fire();
    }
    reset() {
        this._chatWidget.attachmentModel.clear(true);
        this._chatWidget.saveState();
        reset(this._elements.statusLabel);
        this._elements.statusLabel.classList.toggle('hidden', true);
        this._elements.toolbar1.classList.add('hidden');
        this._elements.toolbar2.classList.add('hidden');
        this.updateInfo('');
        this._elements.accessibleViewer.classList.toggle('hidden', true);
        this._onDidChangeHeight.fire();
    }
    focus() {
        this._chatWidget.focusInput();
    }
    hasFocus() {
        return this.domNode.contains(getActiveElement());
    }
};
InlineChatWidget = __decorate([
    __param(2, IInstantiationService),
    __param(3, IContextKeyService),
    __param(4, IKeybindingService),
    __param(5, IAccessibilityService),
    __param(6, IConfigurationService),
    __param(7, IAccessibleViewService),
    __param(8, ITextModelService),
    __param(9, IModelService),
    __param(10, IChatService),
    __param(11, IHoverService),
    __param(12, IChatEntitlementService),
    __param(13, IMarkdownRendererService)
], InlineChatWidget);
export { InlineChatWidget };
const defaultAriaLabel = localize('aria-label', "Inline Chat Input");
let EditorBasedInlineChatWidget = class EditorBasedInlineChatWidget extends InlineChatWidget {
    constructor(location, parentEditor, options, contextKeyService, keybindingService, instantiationService, accessibilityService, configurationService, accessibleViewService, textModelResolverService, modelService, chatService, hoverService, layoutService, chatEntitlementService, markdownRendererService) {
        const overflowWidgetsNode = layoutService.getContainer(getWindow(parentEditor.getContainerDomNode())).appendChild($('.inline-chat-overflow.monaco-editor'));
        super(location, {
            ...options,
            chatWidgetViewOptions: {
                ...options.chatWidgetViewOptions,
                editorOverflowWidgetsDomNode: overflowWidgetsNode
            }
        }, instantiationService, contextKeyService, keybindingService, accessibilityService, configurationService, accessibleViewService, textModelResolverService, modelService, chatService, hoverService, chatEntitlementService, markdownRendererService);
        this._store.add(toDisposable(() => {
            overflowWidgetsNode.remove();
        }));
    }
    // --- layout
    _doLayout(dimension) {
        const newHeight = dimension.height;
        super._doLayout(dimension.with(undefined, newHeight));
        // update/fix the height of the zone which was set to newHeight in super._doLayout
        this._elements.root.style.height = `${dimension.height - this._getExtraHeight()}px`;
    }
    reset() {
        this.chatWidget.setInput();
        super.reset();
    }
};
EditorBasedInlineChatWidget = __decorate([
    __param(3, IContextKeyService),
    __param(4, IKeybindingService),
    __param(5, IInstantiationService),
    __param(6, IAccessibilityService),
    __param(7, IConfigurationService),
    __param(8, IAccessibleViewService),
    __param(9, ITextModelService),
    __param(10, IModelService),
    __param(11, IChatService),
    __param(12, IHoverService),
    __param(13, ILayoutService),
    __param(14, IChatEntitlementService),
    __param(15, IMarkdownRendererService)
], EditorBasedInlineChatWidget);
export { EditorBasedInlineChatWidget };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5saW5lQ2hhdFdpZGdldC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2lubGluZUNoYXQvYnJvd3Nlci9pbmxpbmVDaGF0V2lkZ2V0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxDQUFDLEVBQWEsZ0JBQWdCLEVBQUUsY0FBYyxFQUFFLFNBQVMsRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRWxJLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQ3BHLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBRTNGLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxlQUFlLEVBQUUsWUFBWSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDckYsT0FBTyxFQUFFLE9BQU8sRUFBZSxlQUFlLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUM5RixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFL0QsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBR3hFLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUMxRixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sOERBQThELENBQUM7QUFDdEcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUE4QixzQkFBc0IsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3ZILE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGlFQUFpRSxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUN4RSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQWUsa0JBQWtCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN2RyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDNUUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sZ0VBQWdFLENBQUM7QUFDbkcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDMUYsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQ3JHLE9BQU8sT0FBTyxNQUFNLGdEQUFnRCxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxhQUFhLEVBQUUsaUJBQWlCLEVBQUUsZ0JBQWdCLEVBQUUsZUFBZSxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDekksT0FBTyxFQUFFLCtCQUErQixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDM0UsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0seURBQXlELENBQUM7QUFJbEcsT0FBTyxFQUFFLFVBQVUsRUFBOEIsTUFBTSx5Q0FBeUMsQ0FBQztBQUNqRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUMvRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFFL0UsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxZQUFZLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUNwRyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDeEUsT0FBTyxFQUFFLHVCQUF1QixFQUFFLGdDQUFnQyxFQUFFLG9CQUFvQixFQUFFLG9CQUFvQixFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDaEosT0FBTyx3QkFBd0IsQ0FBQztBQXlCekIsSUFBTSxnQkFBZ0IsR0FBdEIsTUFBTSxnQkFBZ0I7SUFrQzVCLFlBQ0MsUUFBb0MsRUFDbkIsUUFBOEMsRUFDeEMscUJBQStELEVBQ2xFLGtCQUF1RCxFQUN2RCxrQkFBdUQsRUFDcEQscUJBQTZELEVBQzdELHFCQUE2RCxFQUM1RCxzQkFBK0QsRUFDcEUseUJBQStELEVBQ25FLGFBQTZDLEVBQzlDLFlBQTJDLEVBQzFDLGFBQTZDLEVBQ25DLHVCQUFpRSxFQUNoRSx3QkFBbUU7UUFaNUUsYUFBUSxHQUFSLFFBQVEsQ0FBc0M7UUFDckIsMEJBQXFCLEdBQXJCLHFCQUFxQixDQUF1QjtRQUNqRCx1QkFBa0IsR0FBbEIsa0JBQWtCLENBQW9CO1FBQ3RDLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBb0I7UUFDbkMsMEJBQXFCLEdBQXJCLHFCQUFxQixDQUF1QjtRQUM1QywwQkFBcUIsR0FBckIscUJBQXFCLENBQXVCO1FBQzNDLDJCQUFzQixHQUF0QixzQkFBc0IsQ0FBd0I7UUFDakQsOEJBQXlCLEdBQXpCLHlCQUF5QixDQUFtQjtRQUNsRCxrQkFBYSxHQUFiLGFBQWEsQ0FBZTtRQUM3QixpQkFBWSxHQUFaLFlBQVksQ0FBYztRQUN6QixrQkFBYSxHQUFiLGFBQWEsQ0FBZTtRQUNsQiw0QkFBdUIsR0FBdkIsdUJBQXVCLENBQXlCO1FBQy9DLDZCQUF3QixHQUF4Qix3QkFBd0IsQ0FBMEI7UUE5QzNFLGNBQVMsR0FBRyxDQUFDLENBQy9CLHNCQUFzQixFQUN0QjtZQUNDLENBQUMsQ0FBQyw0QkFBNEIsQ0FBQztZQUMvQixDQUFDLENBQUMsdUNBQXVDLENBQUM7WUFDMUMsQ0FBQyxDQUFDLG1CQUFtQixFQUFFO2dCQUN0QixDQUFDLENBQUMsaUNBQWlDLENBQUM7Z0JBQ3BDLENBQUMsQ0FBQyw2QkFBNkIsQ0FBQztnQkFDaEMsQ0FBQyxDQUFDLHFDQUFxQyxDQUFDO2dCQUN4QyxDQUFDLENBQUMsdUNBQXVDLENBQUM7Z0JBQzFDLENBQUMsQ0FBQyw2Q0FBNkMsQ0FBQzthQUNoRCxDQUFDO1NBQ0YsQ0FDRCxDQUFDO1FBRWlCLFdBQU0sR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1FBTy9CLHVCQUFrQixHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksT0FBTyxFQUFRLENBQUMsQ0FBQztRQUNwRSxzQkFBaUIsR0FBZ0IsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7UUFFOUYsdUJBQWtCLEdBQUcsZUFBZSxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQztRQUMxRCxzQkFBaUIsR0FBeUIsSUFBSSxDQUFDLGtCQUFrQixDQUFDO1FBRW5FLGlCQUFZLEdBQVksS0FBSyxDQUFDO1FBb0JyQyxJQUFJLENBQUMsdUJBQXVCLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztRQUMzRyxNQUFNLGtCQUFrQixHQUFHLHFCQUFxQixDQUFDLFdBQVcsQ0FDM0QsSUFBSSxpQkFBaUIsQ0FBQztZQUNyQixrQkFBa0I7WUFDbEIsSUFBSSxDQUFDLHVCQUF1QjtTQUM1QixDQUFDLEVBQ0YsSUFBSSxDQUFDLE1BQU0sQ0FDWCxDQUFDO1FBRUYsSUFBSSxDQUFDLFdBQVcsR0FBRyxrQkFBa0IsQ0FBQyxjQUFjLENBQ25ELFVBQVUsRUFDVixRQUFRLEVBQ1IsRUFBRSxZQUFZLEVBQUUsSUFBSSxFQUFFLEVBQ3RCO1lBQ0MsVUFBVSxFQUFFLElBQUk7WUFDaEIsb0JBQW9CLEVBQUUsRUFBRTtZQUN4QixXQUFXLEVBQUUsU0FBUztZQUN0QixnQkFBZ0IsRUFBRSxLQUFLO1lBQ3ZCLGVBQWUsRUFBRSxJQUFJO1lBQ3JCLHNCQUFzQixFQUFFLElBQUk7WUFDNUIsTUFBTSxFQUFFLElBQUksQ0FBQyxFQUFFO2dCQUNkLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO29CQUM5QywrQkFBK0I7b0JBQy9CLE9BQU8sSUFBSSxDQUFDO2dCQUNiLENBQUM7Z0JBQ0QsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsTUFBTSxLQUFLLENBQUMsQ0FBQztnQkFDdkQsSUFBSSxhQUFhLEVBQUUsQ0FBQztvQkFDbkIsT0FBTyxLQUFLLENBQUM7Z0JBQ2QsQ0FBQztnQkFDRCxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxJQUFJLEtBQUssZUFBZSxJQUFJLFFBQVEsQ0FBQyxxQkFBcUIsRUFBRSxlQUFlLEVBQUUsd0JBQXdCLEVBQUUsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDO29CQUMvSixPQUFPLEtBQUssQ0FBQztnQkFDZCxDQUFDO2dCQUNELE9BQU8sSUFBSSxDQUFDO1lBQ2IsQ0FBQztZQUNELFlBQVksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUk7WUFDakMsV0FBVyxFQUFFLFFBQVEsQ0FBQyxHQUFHO1lBQ3pCLEdBQUcsUUFBUSxDQUFDLHFCQUFxQjtTQUNqQyxFQUNEO1lBQ0MsY0FBYyxFQUFFLG9CQUFvQjtZQUNwQyxjQUFjLEVBQUUsb0JBQW9CO1lBQ3BDLGlCQUFpQixFQUFFLCtCQUErQjtZQUNsRCxxQkFBcUIsRUFBRSxlQUFlO1lBQ3RDLHNCQUFzQixFQUFFLGdCQUFnQjtTQUN4QyxDQUNELENBQUM7UUFDRixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLGdCQUFnQixFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDaEYsSUFBSSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUNuRCxJQUFJLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLGlCQUFpQixDQUFDLHFCQUFxQixDQUFDLEVBQUUsYUFBYSxDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQztRQUMzSCxJQUFJLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNsQyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7UUFFbEMsTUFBTSxXQUFXLEdBQUcsZUFBZSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLHVCQUF1QixDQUFDLENBQUM7UUFDcEYsTUFBTSxlQUFlLEdBQUcsZUFBZSxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLHVCQUF1QixDQUFDLENBQUM7UUFDMUYsTUFBTSx3QkFBd0IsR0FBRyxlQUFlLENBQUMsOEJBQThCLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1FBQ3JILE1BQU0sZ0JBQWdCLEdBQUcsZUFBZSxDQUFDLGdCQUFnQixDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsdUJBQXVCLENBQUMsQ0FBQztRQUMvRixNQUFNLHdCQUF3QixHQUFHLGVBQWUsQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLHVCQUF1QixDQUFDLENBQUM7UUFFekcsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxlQUFlLEVBQUUsQ0FBQyxDQUFDO1FBQzlELElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsb0JBQW9CLENBQUMsR0FBRyxFQUFFO1lBQzFELGNBQWMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUV2QixNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQztZQUM3QyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7Z0JBQ2hCLE9BQU87WUFDUixDQUFDO1lBRUQsY0FBYyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsR0FBRyxFQUFFO2dCQUNwQyxRQUFRLENBQUMsT0FBTyxHQUFHLFNBQVMsQ0FBQztnQkFDN0IsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUNwQixlQUFlLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQ3hCLGdCQUFnQixDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUN6Qix3QkFBd0IsQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDakMsd0JBQXdCLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDbEMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUVKLGNBQWMsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxHQUFHLEVBQUU7Z0JBRTdDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLEVBQUUsRUFBRSxTQUFTLENBQUMsQ0FBQztnQkFFaEYsTUFBTSxJQUFJLEdBQUcsU0FBUyxDQUFDLFFBQVEsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUN6QyxRQUFRLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQztnQkFFeEIsV0FBVyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztnQkFDcEMsZUFBZSxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLEtBQUssc0JBQXNCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLEtBQUssc0JBQXNCLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ3hKLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLFlBQVksS0FBSyxTQUFTLENBQUMsQ0FBQztnQkFDNUUsd0JBQXdCLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxJQUFJLElBQUksQ0FBQyxZQUFZLEVBQUUsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ2hHLHdCQUF3QixDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxxQkFBcUIsSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDO2dCQUUxRyxJQUFJLENBQUMsa0JBQWtCLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDaEMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNKLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNoQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyx3QkFBd0IsQ0FBQyxHQUFHLEVBQUU7WUFDN0QsSUFBSSxDQUFDLGtCQUFrQixDQUFDLElBQUksRUFBRSxDQUFDO1FBQ2hDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSixlQUFlO1FBQ2YsSUFBSSxDQUFDLG1CQUFtQixHQUFHLGdDQUFnQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsQ0FBQztRQUM1RixNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7UUFDMUQsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM5RSxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRTlFLElBQUksQ0FBQyxzQkFBc0IsR0FBRyx1QkFBdUIsQ0FBQyxNQUFNLENBQUMsa0JBQWtCLENBQUMsQ0FBQztRQUNqRixJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxzQkFBc0IsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsc0JBQXNCLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNsSCxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxxQkFBcUIsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsc0JBQXNCLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVsSCxNQUFNLFlBQVksR0FBRyxRQUFRLENBQUMsWUFBWSxZQUFZLE1BQU0sQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUM7UUFFbEgsYUFBYTtRQUNiLE1BQU0saUJBQWlCLEdBQUcsUUFBUSxDQUFDLFlBQVksWUFBWSxNQUFNLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUM7UUFDOUcsTUFBTSxlQUFlLEdBQUcsa0JBQWtCLENBQUMsY0FBYyxDQUFDLHNCQUFzQixFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxFQUFFLFlBQVksRUFBRTtZQUN4SCxjQUFjLEVBQUUsRUFBRSxZQUFZLEVBQUUsUUFBUSxFQUFFO1lBQzFDLGVBQWUsRUFBRSxRQUFRLENBQUMscUJBQXFCLEVBQUUsS0FBSyxFQUFFLGVBQWU7WUFDdkUsV0FBVyxFQUFFLEVBQUUsZ0JBQWdCLEVBQUUsSUFBSSxFQUFFO1lBQ3ZDLEdBQUcsaUJBQWlCO1NBQ3BCLENBQUMsQ0FBQztRQUNILElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxXQUFXLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNuRixJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUVqQyxvQkFBb0I7UUFDcEIsTUFBTSxRQUFRLEdBQUcsa0JBQWtCLENBQUMsY0FBYyxDQUFDLG9CQUFvQixFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQyxlQUFlLElBQUksTUFBTSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsRUFBRTtZQUM3SSxlQUFlLEVBQUUsUUFBUSxDQUFDLHFCQUFxQixFQUFFLEtBQUssRUFBRSxlQUFlO1lBQ3ZFLFdBQVcsRUFBRSxFQUFFLGdCQUFnQixFQUFFLElBQUksRUFBRSxpQkFBaUIsRUFBRSxJQUFJLEVBQUU7WUFDaEUsc0JBQXNCLEVBQUUsQ0FBQyxNQUFlLEVBQUUsT0FBK0IsRUFBRSxFQUFFO2dCQUM1RSxPQUFPLG9CQUFvQixDQUFDLGtCQUFrQixFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsQ0FBQztZQUNsRSxDQUFDO1NBQ0QsQ0FBQyxDQUFDO1FBQ0gsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLG9CQUFvQixDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDckYsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUM7UUFHMUIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLHdCQUF3QixDQUFDLENBQUMsQ0FBQyxFQUFFO1lBQ3ZFLElBQUksQ0FBQyxDQUFDLG9CQUFvQix1RkFBNEMsRUFBRSxDQUFDO2dCQUN4RSxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztZQUN6QixDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVKLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFFBQVEsR0FBRyxDQUFDLENBQUM7UUFDakMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxXQUFXLENBQUMsUUFBUSxHQUFHLENBQUMsQ0FBQztRQUN4QyxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztRQUN4QixJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztRQUV4QixJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLGlCQUFpQixDQUFDLHVCQUF1QixDQUFDLFNBQVMsQ0FBQyxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsV0FBVyxFQUFFLEdBQUcsRUFBRTtZQUN6SCxPQUFPLElBQUksQ0FBQyxTQUFTLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNwRCxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDLENBQUMsRUFBRTtZQUM1RCxJQUFJLE9BQU8sQ0FBQyxDQUFDLENBQUMsZUFBZSxFQUFFLElBQUksQ0FBQyxXQUFXLENBQUMsU0FBUyxFQUFFLEtBQUssQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksS0FBSyxNQUFNLEVBQUUsQ0FBQztnQkFDL0csSUFBSSxDQUFDLFlBQVksQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLEVBQUUsOEJBQThCLENBQUMsRUFBRSxFQUFFLFVBQVUsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1lBQ3JHLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVPLGdCQUFnQjtRQUV2QixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLHNCQUFzQixDQUFDLGVBQWUsdUZBQTRDLENBQUM7UUFFeEgsSUFBSSxJQUFJLENBQUMscUJBQXFCLENBQUMsdUJBQXVCLEVBQUUsRUFBRSxDQUFDO1lBQzFELElBQUksS0FBSyxHQUFHLGdCQUFnQixDQUFDO1lBQzdCLElBQUksSUFBSSxDQUFDLHFCQUFxQixDQUFDLFFBQVEsdUZBQXFELEVBQUUsQ0FBQztnQkFDOUYsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLGdCQUFnQixzRkFBOEMsRUFBRSxRQUFRLEVBQUUsQ0FBQztnQkFDbkgsS0FBSyxHQUFHLE9BQU87b0JBQ2QsQ0FBQyxDQUFDLFFBQVEsQ0FBQyw4QkFBOEIsRUFBRSxnRUFBZ0UsRUFBRSxPQUFPLENBQUM7b0JBQ3JILENBQUMsQ0FBQyxRQUFRLENBQUMsa0NBQWtDLEVBQUUseUZBQXlGLENBQUMsQ0FBQztZQUM1SSxDQUFDO1lBQ0QsSUFBSSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsYUFBYSxDQUFDLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7UUFDbEUsQ0FBQztJQUNGLENBQUM7SUFFTyxnQkFBZ0I7UUFDdkIsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxlQUFlLEVBQUUsQ0FBQyxDQUFDO1FBRTNELElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRTtZQUNoQyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDcEIsS0FBSyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsZUFBZSxDQUFDLENBQUM7WUFFdEMsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLHVCQUF1QixDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDekUsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLHVCQUF1QixDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDekUsTUFBTSxpQkFBaUIsR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUU5RSxNQUFNLGNBQWMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxTQUFTLElBQUksU0FBUyxJQUFJLENBQUMsaUJBQWlCLENBQUM7WUFDL0UsSUFBSSxDQUFDLFNBQVMsQ0FBQyxlQUFlLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsQ0FBQyxjQUFjLENBQUMsQ0FBQztZQUUzRSxJQUFJLGNBQWMsRUFBRSxDQUFDO2dCQUNwQixNQUFNLGdCQUFnQixHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLHdCQUF3QixDQUFDLE1BQU0sQ0FBQyxJQUFJLGNBQWMsQ0FBQyxRQUFRLENBQUMsRUFBRSxHQUFHLEVBQUUsaUJBQWlCLEVBQUUsT0FBTyxFQUFFLENBQUMsbUJBQW1CLEVBQUUsbUJBQW1CLENBQUMsRUFBRSxFQUFFLDhGQUE4RixFQUFFLE9BQU8sQ0FBQyxnQkFBZ0IsRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLElBQUksSUFBSSxFQUFFLEVBQUUsT0FBTyxDQUFDLGdCQUFnQixFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsSUFBSSxJQUFJLEVBQUUsRUFBRSxPQUFPLENBQUMsZ0JBQWdCLEVBQUUsaUJBQWlCLElBQUksRUFBRSxFQUFFLE9BQU8sQ0FBQyxnQkFBZ0IsRUFBRSxtQkFBbUIsSUFBSSxFQUFFLENBQUMsRUFBRSxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDN2dCLElBQUksQ0FBQyxTQUFTLENBQUMsZUFBZSxDQUFDLFdBQVcsQ0FBQyxnQkFBZ0IsQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUN0RSxDQUFDO1lBRUQsSUFBSSxDQUFDLGtCQUFrQixDQUFDLElBQUksRUFBRSxDQUFDO1FBQ2hDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsT0FBTztRQUNOLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDdkIsQ0FBQztJQUVELElBQUksT0FBTztRQUNWLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUM7SUFDNUIsQ0FBQztJQUVELElBQUksVUFBVTtRQUNiLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQztJQUN6QixDQUFDO0lBRUQsU0FBUztRQUNSLElBQUksQ0FBQyxXQUFXLENBQUMsU0FBUyxFQUFFLENBQUM7SUFDOUIsQ0FBQztJQUVELE1BQU0sQ0FBQyxTQUFvQjtRQUMxQixNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDO1FBQ3pDLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDO1FBQ3pCLElBQUksQ0FBQztZQUNKLElBQUksQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDM0IsQ0FBQztnQkFBUyxDQUFDO1lBQ1YsSUFBSSxDQUFDLFlBQVksR0FBRyxLQUFLLENBQUM7WUFFMUIsSUFBSSxJQUFJLENBQUMsYUFBYSxLQUFLLGFBQWEsRUFBRSxDQUFDO2dCQUMxQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDaEMsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0lBRVMsU0FBUyxDQUFDLFNBQW9CO1FBQ3ZDLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztRQUMzQyxNQUFNLFlBQVksR0FBRyxjQUFjLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUUzRCx1TkFBdU47UUFFdk4sSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sR0FBRyxHQUFHLFNBQVMsQ0FBQyxNQUFNLEdBQUcsV0FBVyxJQUFJLENBQUM7UUFDekUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssR0FBRyxHQUFHLFNBQVMsQ0FBQyxLQUFLLElBQUksQ0FBQztRQUV6RCxJQUFJLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FDdEIsU0FBUyxDQUFDLE1BQU0sR0FBRyxZQUFZLEdBQUcsV0FBVyxFQUM3QyxTQUFTLENBQUMsS0FBSyxDQUNmLENBQUM7SUFDSCxDQUFDO0lBRUQ7O09BRUc7SUFDSCxJQUFJLGFBQWE7UUFDaEIsTUFBTSxJQUFJLEdBQUc7WUFDWix1QkFBdUIsRUFBRSxJQUFJLENBQUMsV0FBVyxDQUFDLGFBQWE7WUFDdkQsWUFBWSxFQUFFLGNBQWMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQztZQUNuRCxXQUFXLEVBQUUsSUFBSSxDQUFDLGVBQWUsRUFBRTtTQUNuQyxDQUFDO1FBQ0YsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLHVCQUF1QixHQUFHLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQztRQUNuRixPQUFPLE1BQU0sQ0FBQztJQUNmLENBQUM7SUFFRCxJQUFJLFNBQVM7UUFDWiwwRUFBMEU7UUFDMUUsa0VBQWtFO1FBRWxFLElBQUkscUJBQXFCLEdBQUcsR0FBRyxDQUFDO1FBQ2hDLEtBQUssTUFBTSxJQUFJLElBQUksSUFBSSxDQUFDLFdBQVcsQ0FBQyxTQUFTLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxFQUFFLENBQUM7WUFDakUsSUFBSSxZQUFZLENBQUMsSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxlQUFlLElBQUksQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLE9BQU8sQ0FBQyxFQUFFLENBQUM7Z0JBQzFHLHFCQUFxQixHQUFHLEdBQUcsQ0FBQztnQkFDNUIsTUFBTTtZQUNQLENBQUM7UUFDRixDQUFDO1FBRUQsSUFBSSxLQUFLLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQztRQUMvQixLQUFLLElBQUksSUFBSSxDQUFDLFdBQVcsQ0FBQyxhQUFhLENBQUM7UUFDeEMsS0FBSyxJQUFJLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxHQUFHLHFCQUFxQixFQUFFLElBQUksQ0FBQyxXQUFXLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDL0csT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBRVMsZUFBZTtRQUN4QixPQUFPLElBQUksQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsR0FBRyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUM7SUFDdkUsQ0FBQztJQUVELElBQUksS0FBSztRQUNSLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQyxRQUFRLEVBQUUsQ0FBQztJQUNwQyxDQUFDO0lBRUQsSUFBSSxLQUFLLENBQUMsS0FBYTtRQUN0QixJQUFJLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUNsQyxDQUFDO0lBRUQsU0FBUztRQUNSLElBQUksQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLFlBQVksQ0FBQyxJQUFJLFNBQVMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzVGLENBQUM7SUFFRCxJQUFJLFdBQVcsQ0FBQyxLQUFhO1FBQzVCLElBQUksQ0FBQyxXQUFXLENBQUMsbUJBQW1CLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDN0MsQ0FBQztJQUVELFlBQVksQ0FBQyxJQUFhO1FBQ3pCLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDMUQsSUFBSSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMxRCxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3hELElBQUksQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDM0QsSUFBSSxDQUFDLGtCQUFrQixDQUFDLElBQUksRUFBRSxDQUFDO0lBQ2hDLENBQUM7SUFFRCxhQUFhLENBQUMsSUFBYTtRQUMxQixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUN0RCxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzFELElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDMUQsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDeEQsSUFBSSxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxRQUFR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
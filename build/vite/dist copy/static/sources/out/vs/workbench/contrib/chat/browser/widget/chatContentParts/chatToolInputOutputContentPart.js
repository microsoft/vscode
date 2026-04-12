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
import * as dom from '../../../../../../base/browser/dom.js';
import { ButtonWithIcon } from '../../../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, observableValue } from '../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { observableConfigValue } from '../../../../../../platform/observable/common/platformObservableUtils.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { LanguageModelPartAudience } from '../../../common/languageModels.js';
import { CodeBlockPart } from './codeBlockPart.js';
import { ChatQueryTitlePart } from './chatConfirmationWidget.js';
import { ChatToolOutputContentSubPart } from './chatToolOutputContentSubPart.js';
import { renderFileWidgets } from './chatInlineAnchorWidget.js';
import { IChatMarkdownAnchorService } from './chatMarkdownAnchorService.js';
let ChatCollapsibleInputOutputContentPart = class ChatCollapsibleInputOutputContentPart extends Disposable {
    get codeblocks() {
        const outputCodeblocks = this._outputSubPart?.codeblocks ?? [];
        return outputCodeblocks;
    }
    set title(s) {
        this._titlePart.title = s;
    }
    get title() {
        return this._titlePart.title;
    }
    get expanded() {
        return this._expanded.get();
    }
    constructor(title, subtitle, progressTooltip, context, input, output, isError, initiallyExpanded, shimmer, contextKeyService, _instantiationService, hoverService, chatMarkdownAnchorService, configurationService) {
        super();
        this.context = context;
        this.input = input;
        this.output = output;
        this.contextKeyService = contextKeyService;
        this._instantiationService = _instantiationService;
        this.chatMarkdownAnchorService = chatMarkdownAnchorService;
        this.configurationService = configurationService;
        this._editorReferences = [];
        this._contentInitialized = false;
        const container = dom.h('.chat-confirmation-widget-container');
        const titleEl = dom.h('.chat-confirmation-widget-title-inner');
        const elements = dom.h('.chat-confirmation-widget');
        this.domNode = container.root;
        container.root.appendChild(elements.root);
        this._titlePart = this._register(_instantiationService.createInstance(ChatQueryTitlePart, titleEl.root, title, subtitle));
        renderFileWidgets(titleEl.root, this._instantiationService, this.chatMarkdownAnchorService, this._store);
        const spacer = document.createElement('span');
        spacer.style.flexGrow = '1';
        const btn = this._register(new ButtonWithIcon(elements.root, {}));
        btn.element.classList.add('chat-confirmation-widget-title', 'monaco-text-button');
        btn.labelElement.append(titleEl.root);
        // Add hover chevron indicator on the right (decorative, hide from screen readers)
        const hoverChevron = dom.$('span.chat-collapsible-hover-chevron.codicon.codicon-chevron-right');
        hoverChevron.setAttribute('aria-hidden', 'true');
        btn.element.appendChild(hoverChevron);
        // Only show leading icon for errors, or for checkmarks/loading when the accessibility setting is on
        const showCheckmarks = observableConfigValue("accessibility.chat.showCheckmarks" /* AccessibilityWorkbenchSettingId.ShowChatCheckmarks */, false, this.configurationService);
        const expanded = this._expanded = observableValue(this, initiallyExpanded);
        this._register(autorun(r => {
            const value = expanded.read(r);
            const checkmarksEnabled = showCheckmarks.read(r);
            elements.root.classList.toggle('collapsed', !value);
            const isInProgress = !output && !isError;
            if (isError) {
                btn.icon = Codicon.error;
            }
            else {
                btn.icon = output
                    ? Codicon.check
                    : ThemeIcon.modify(Codicon.loading, 'spin');
            }
            elements.root.classList.toggle('shimmer-progress', shimmer && isInProgress);
            container.root.classList.toggle('show-checkmarks', checkmarksEnabled);
            // Update hover chevron direction
            hoverChevron.classList.toggle('codicon-chevron-right', !value);
            hoverChevron.classList.toggle('codicon-chevron-down', value);
            // Lazy initialization: render content only when expanded for the first time
            if (value && !this._contentInitialized) {
                this._contentInitialized = true;
                const messageContainer = dom.h('.chat-confirmation-widget-message');
                messageContainer.root.appendChild(this.createMessageContents());
                elements.root.appendChild(messageContainer.root);
            }
        }));
        const toggle = (e) => {
            if (!e.defaultPrevented) {
                const value = expanded.get();
                expanded.set(!value, undefined);
                e.preventDefault();
            }
        };
        this._register(btn.onDidClick(toggle));
        const topLevelResources = this.output?.parts
            .filter(p => p.kind === 'data')
            .filter(p => !p.audience || p.audience.includes(LanguageModelPartAudience.User));
        if (topLevelResources?.length) {
            const resourceSubPart = this._register(this._instantiationService.createInstance(ChatToolOutputContentSubPart, this.context, topLevelResources));
            const group = resourceSubPart.domNode;
            group.classList.add('chat-collapsible-top-level-resource-group');
            container.root.appendChild(group);
            this._register(autorun(r => {
                group.style.display = expanded.read(r) ? 'none' : '';
            }));
        }
    }
    createMessageContents() {
        const contents = dom.h('div', [
            dom.h('h3@inputTitle'),
            dom.h('div@input'),
            dom.h('h3@outputTitle'),
            dom.h('div@output'),
        ]);
        const { input, output } = this;
        contents.inputTitle.textContent = localize('chat.input', "Input");
        this.addCodeBlock(input, contents.input);
        if (!output) {
            contents.output.remove();
            contents.outputTitle.remove();
        }
        else {
            contents.outputTitle.textContent = localize('chat.output', "Output");
            const outputSubPart = this._register(this._instantiationService.createInstance(ChatToolOutputContentSubPart, this.context, output.parts));
            this._outputSubPart = outputSubPart;
            contents.output.appendChild(outputSubPart.domNode);
        }
        return contents.root;
    }
    addCodeBlock(part, container) {
        const data = {
            languageId: part.languageId,
            text: part.data,
            codeBlockIndex: part.codeBlockIndex,
            element: this.context.element,
            parentContextKeyService: this.contextKeyService,
            renderOptions: part.options,
            chatSessionResource: this.context.element.sessionResource,
        };
        const key = CodeBlockPart.poolKey(this.context.element.id, part.codeBlockIndex);
        const editorReference = this._register(this.context.editorPool.get(key));
        editorReference.object.render(data, this.context.currentWidth.get() || 300);
        container.appendChild(editorReference.object.element);
        this._editorReferences.push(editorReference);
    }
    hasSameContent(other, followingContent, element) {
        // For now, we consider content different unless it's exactly the same instance
        return false;
    }
    layout(width) {
        this._editorReferences.forEach(r => r.object.layout(width));
        this._outputSubPart?.layout(width);
    }
};
ChatCollapsibleInputOutputContentPart = __decorate([
    __param(9, IContextKeyService),
    __param(10, IInstantiationService),
    __param(11, IHoverService),
    __param(12, IChatMarkdownAnchorService),
    __param(13, IConfigurationService)
], ChatCollapsibleInputOutputContentPart);
export { ChatCollapsibleInputOutputContentPart };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFRvb2xJbnB1dE91dHB1dENvbnRlbnRQYXJ0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRUb29sSW5wdXRPdXRwdXRDb250ZW50UGFydC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLHVDQUF1QyxDQUFDO0FBQzdELE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUNwRixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFFcEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxPQUFPLEVBQXVCLGVBQWUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzVHLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUV2RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDcEQsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDaEcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFDekcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHlFQUF5RSxDQUFDO0FBQ2hILE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBRXpHLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRzlFLE9BQU8sRUFBRSxhQUFhLEVBQTJDLE1BQU0sb0JBQW9CLENBQUM7QUFFNUYsT0FBTyxFQUFFLGtC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
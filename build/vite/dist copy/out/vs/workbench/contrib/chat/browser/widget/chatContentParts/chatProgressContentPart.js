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
import { $, append } from '../../../../../../base/browser/dom.js';
import { renderAsPlaintext } from '../../../../../../base/browser/markdownRenderer.js';
import { alert } from '../../../../../../base/browser/ui/aria/aria.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { stripIcons } from '../../../../../../base/common/iconLabels.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { localize } from '../../../../../../nls.js';
import { isResponseVM } from '../../../common/model/chatViewModel.js';
import { renderFileWidgets } from './chatInlineAnchorWidget.js';
import { getToolApprovalMessage } from './toolInvocationParts/chatToolPartUtilities.js';
import { IChatMarkdownAnchorService } from './chatMarkdownAnchorService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { ILanguageModelToolsService } from '../../../common/tools/languageModelToolsService.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { buildPhrasePool } from './chatThinkingContentPart.js';
let ChatProgressContentPart = class ChatProgressContentPart extends Disposable {
    constructor(progress, chatContentMarkdownRenderer, context, forceShowSpinner, forceShowMessage, icon, toolInvocation, shimmer, instantiationService, chatMarkdownAnchorService, configurationService) {
        super();
        this.chatContentMarkdownRenderer = chatContentMarkdownRenderer;
        this.toolInvocation = toolInvocation;
        this.instantiationService = instantiationService;
        this.chatMarkdownAnchorService = chatMarkdownAnchorService;
        this.configurationService = configurationService;
        this.renderedMessage = this._register(new MutableDisposable());
        this._fileWidgetStore = this._register(new DisposableStore());
        this.currentContent = progress.content;
        const followingContent = context.content.slice(context.contentIndex + 1);
        this.showSpinner = forceShowSpinner ?? shouldShowSpinner(followingContent, context.element);
        this.isHidden = forceShowMessage !== true && followingContent.some(part => part.kind !== 'progressMessage');
        if (this.isHidden) {
            // Placeholder, don't show the progress message
            this.domNode = $('');
            return;
        }
        if (this.showSpinner && this.configurationService.getValue("accessibility.verboseChatProgressUpdates" /* AccessibilityWorkbenchSettingId.VerboseChatProgressUpdates */)) {
            // this step is in progress, communicate it to SR users
            alert(stripIcons(renderAsPlaintext(progress.content)));
        }
        const isLoadingIcon = icon && ThemeIcon.isEqual(icon, ThemeIcon.modify(Codicon.loading, 'spin'));
        // Even if callers request shimmer, only the active (spinner-visible) progress row should animate.
        const useShimmer = (shimmer ?? (!icon || isLoadingIcon)) && this.showSpinner;
        // if we have shimmer, don't show spinner
        const codicon = useShimmer ? Codicon.check : (icon ?? (this.showSpinner ? ThemeIcon.modify(Codicon.loading, 'spin') : Codicon.check));
        const result = this.chatContentMarkdownRenderer.render(progress.content);
        result.element.classList.add('progress-step');
        renderFileWidgets(result.element, this.instantiationService, this.chatMarkdownAnchorService, this._fileWidgetStore);
        const tooltip = this.createApprovalMessage();
        const progressPart = this._register(instantiationService.createInstance(ChatProgressSubPart, result.element, codicon, tooltip));
        this.domNode = progressPart.domNode;
        if (useShimmer) {
            this.domNode.classList.add('shimmer-progress');
        }
        this.renderedMessage.value = result;
    }
    updateMessage(content) {
        if (this.isHidden) {
            return;
        }
        // Render the new message
        const result = this._register(this.chatContentMarkdownRenderer.render(content));
        result.element.classList.add('progress-step');
        this._fileWidgetStore.clear();
        renderFileWidgets(result.element, this.instantiationService, this.chatMarkdownAnchorService, this._fileWidgetStore);
        // Replace the old message container with the new one
        if (this.renderedMessage.value) {
            this.renderedMessage.value.element.replaceWith(result.element);
        }
        else {
            this.domNode.appendChild(result.element);
        }
        this.renderedMessage.value = result;
    }
    hasSameContent(other, followingContent, element) {
        // Progress parts render render until some other content shows up, then they hide.
        // When some other content shows up, need to signal to be rerendered as hidden.
        if (followingContent.some(part => part.kind !== 'progressMessage') && !this.isHidden) {
            return false;
        }
        // Needs rerender when spinner state changes
        const showSpinner = shouldShowSpinner(followingContent, element);
        // Needs rerender when content changes
        if (other.kind === 'progressMessage' && other.content.value !== this.currentContent.value) {
            return false;
        }
        return other.kind === 'progressMessage' && this.showSpinner === showSpinner;
    }
    createApprovalMessage() {
        return this.toolInvocation && getToolApprovalMessage(this.toolInvocation);
    }
};
ChatProgressContentPart = __decorate([
    __param(8, IInstantiationService),
    __param(9, IChatMarkdownAnchorService),
    __param(10, IConfigurationService)
], ChatProgressContentPart);
export { ChatProgressContentPart };
function shouldShowSpinner(followingContent, element) {
    return isResponseVM(element) && !element.isComplete && followingContent.length === 0;
}
let ChatProgressSubPart = class ChatProgressSubPart extends Disposable {
    constructor(messageElement, icon, tooltip, hoverService) {
        super();
        this.domNode = $('.progress-container');
        const iconElement = $('div');
        iconElement.classList.add(...ThemeIcon.asClassNameArray(icon));
        if (tooltip) {
            this._register(hoverService.setupDelayedHover(iconElement, {
                content: tooltip,
                style: 1 /* HoverStyle.Pointer */,
            }));
            this._register(hoverService.setupDelayedHover(messageElement, {
                content: tooltip,
                style: 1 /* HoverStyle.Pointer */,
            }));
        }
        append(this.domNode, iconElement);
        messageElement.classList.add('progress-step');
        append(this.domNode, messageElement);
    }
};
ChatProgressSubPart = __decorate([
    __param(3, IHoverService)
], ChatProgressSubPart);
export { ChatProgressSubPart };
let ChatWorkingProgressContentPart = class ChatWorkingProgressContentPart extends ChatProgressContentPart {
    constructor(_workingProgress, chatContentMarkdownRenderer, context, instantiationService, chatMarkdownAnchorService, configurationService, languageModelToolsService) {
        const defaultLabel = localize('workingMessage', "Working");
        const pool = buildPhrasePool([defaultLabel], configurationService);
        const label = pool[Math.floor(Math.random() * pool.length)];
        const progressMessage = {
            kind: 'progressMessage',
            content: new MarkdownString().appendText(label)
        };
        super(progressMessage, chatContentMarkdownRenderer, context, undefined, undefined, undefined, undefined, true, instantiationService, chatMarkdownAnchorService, configurationService);
        this._register(languageModelToolsService.onDidPrepareToolCallBecomeUnresponsive(e => {
            if (isEqual(context.element.sessionResource, e.sessionResource)) {
                this.updateMessage(new MarkdownString(localize('toolCallUnresponsive', "Waiting for tool '{0}' to respond...", e.toolData.displayName)));
            }
        }));
    }
    hasSameContent(other, followingContent, element) {
        return other.kind === 'working';
    }
};
ChatWorkingProgressContentPart = __decorate([
    __param(3, IInstantiationService),
    __param(4, IChatMarkdownAnchorService),
    __param(5, IConfigurationService),
    __param(6, ILanguageModelToolsService)
], ChatWorkingProgressContentPart);
export { ChatWorkingProgressContentPart };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFByb2dyZXNzQ29udGVudFBhcnQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY2hhdFByb2dyZXNzQ29udGVudFBhcnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLENBQUMsRUFBRSxNQUFNLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNsRSxPQUFPLEVBQXFCLGlCQUFpQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDMUcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsY0FBYyxFQUF3QixNQUFNLDhDQUE4QyxDQUFDO0FBQ3BHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN6RSxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzVHLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUV2RSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUN6RyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFFcEQsT0FBTyxFQUF3QixZQUFZLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUU1RixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUVoRSxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUN4RixPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUM1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
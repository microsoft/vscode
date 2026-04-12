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
import { Button, ButtonWithDropdown } from '../../../../../../base/browser/ui/button/button.js';
import { Action, Separator } from '../../../../../../base/common/actions.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { MenuWorkbenchToolBar } from '../../../../../../platform/actions/browser/toolbar.js';
import { MenuId } from '../../../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { IMarkdownRendererService } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { defaultButtonStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { renderFileWidgets } from './chatInlineAnchorWidget.js';
import { IChatMarkdownAnchorService } from './chatMarkdownAnchorService.js';
import { ChatMarkdownContentPart } from './chatMarkdownContentPart.js';
import './media/chatConfirmationWidget.css';
let ChatQueryTitlePart = class ChatQueryTitlePart extends Disposable {
    get title() {
        return this._title;
    }
    set title(value) {
        this._title = value;
        const next = this._renderer.render(this.toMdString(value), {
            asyncRenderCallback: () => this._onDidChangeHeight.fire(),
        });
        const previousEl = this._renderedTitle.value?.element;
        if (previousEl?.parentElement) {
            previousEl.replaceWith(next.element);
        }
        else {
            this.element.appendChild(next.element); // unreachable?
        }
        this._renderedTitle.value = next;
    }
    constructor(element, _title, subtitle, _renderer) {
        super();
        this.element = element;
        this._title = _title;
        this._renderer = _renderer;
        this._onDidChangeHeight = this._register(new Emitter());
        this.onDidChangeHeight = this._onDidChangeHeight.event;
        this._renderedTitle = this._register(new MutableDisposable());
        element.classList.add('chat-query-title-part');
        this._renderedTitle.value = _renderer.render(this.toMdString(_title), {
            asyncRenderCallback: () => this._onDidChangeHeight.fire(),
        });
        element.append(this._renderedTitle.value.element);
        if (subtitle) {
            const str = this.toMdString(subtitle);
            const renderedTitle = this._register(_renderer.render(str, {
                asyncRenderCallback: () => this._onDidChangeHeight.fire(),
            }));
            const wrapper = document.createElement('small');
            wrapper.appendChild(renderedTitle.element);
            element.append(wrapper);
        }
    }
    toMdString(value) {
        if (typeof value === 'string') {
            return new MarkdownString('', { supportThemeIcons: true }).appendText(value);
        }
        else {
            return new MarkdownString(value.value, { supportThemeIcons: true, isTrusted: value.isTrusted });
        }
    }
};
ChatQueryTitlePart = __decorate([
    __param(3, IMarkdownRendererService)
], ChatQueryTitlePart);
export { ChatQueryTitlePart };
let BaseSimpleChatConfirmationWidget = class BaseSimpleChatConfirmationWidget extends Disposable {
    get onDidClick() { return this._onDidClick.event; }
    get domNode() {
        return this._domNode;
    }
    setShowButtons(showButton) {
        this.domNode.classList.toggle('hideButtons', !showButton);
    }
    constructor(context, options, instantiationService, _markdownRendererService, contextMenuService, contextKeyService) {
        super();
        this.context = context;
        this.instantiationService = instantiationService;
        this._markdownRendererService = _markdownRendererService;
        this._onDidClick = this._register(new Emitter());
        const { title, subtitle, message, buttons } = options;
        const elements = dom.h('.chat-confirmation-widget-container@container', [
            dom.h('.chat-confirmation-widget@root', [
                dom.h('.chat-confirmation-widget-title@title'),
                dom.h('.chat-confirmation-widget-message-container', [
                    dom.h('.chat-confirmation-widget-message@message'),
                    dom.h('.chat-buttons-container@buttonsContainer', [
                        dom.h('.chat-buttons@buttons'),
                        dom.h('.chat-toolbar@toolbar'),
                    ]),
                ]),
            ]),
        ]);
        configureAccessibilityContainer(elements.container, title, message);
        this._domNode = elements.root;
        this._register(instantiationService.createInstance(ChatQueryTitlePart, elements.title, title, subtitle));
        this.messageElement = elements.message;
        // Create buttons
        buttons.forEach(buttonData => {
            const buttonOptions = { ...defaultButtonStyles, small: true, secondary: buttonData.isSecondary, title: buttonData.tooltip, disabled: buttonData.disabled };
            let button;
            if (buttonData.moreActions) {
                button = new ButtonWithDropdown(elements.buttons, {
                    ...buttonOptions,
                    contextMenuProvider: contextMenuService,
                    addPrimaryActionToDropdown: false,
                    actions: buttonData.moreActions.map(action => {
                        if (action instanceof Separator) {
                            return action;
                        }
                        return this._register(new Action(action.label, action.label, undefined, !action.disabled, () => {
                            this._onDidClick.fire(action);
                            return Promise.resolve();
                        }));
                    }),
                });
            }
            else {
                button = new Button(elements.buttons, buttonOptions);
            }
            this._register(button);
            button.label = buttonData.label;
            this._register(button.onDidClick(() => this._onDidClick.fire(buttonData)));
            if (buttonData.onDidChangeDisablement) {
                this._register(buttonData.onDidChangeDisablement(disabled => button.enabled = !disabled));
            }
        });
        // Create toolbar if actions are provided
        if (options?.toolbarData) {
            const overlay = contextKeyService.createOverlay([
                ['chatConfirmationPartType', options.toolbarData.partType],
                ['chatConfirmationPartSource', options.toolbarData.partSource],
            ]);
            const nestedInsta = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, overlay])));
            this._register(nestedInsta.createInstance(MenuWorkbenchToolBar, elements.toolbar, MenuId.ChatConfirmationMenu, {
                // buttonConfigProvider: () => ({ showLabel: false, showIcon: true }),
                menuOptions: {
                    arg: options.toolbarData.arg,
                    shouldForwardArgs: true,
                }
            }));
        }
    }
    renderMessage(element) {
        this.messageElement.append(element);
    }
};
BaseSimpleChatConfirmationWidget = __decorate([
    __param(2, IInstantiationService),
    __param(3, IMarkdownRendererService),
    __param(4, IContextMenuService),
    __param(5, IContextKeyService)
], BaseSimpleChatConfirmationWidget);
/** @deprecated Use ChatConfirmationWidget instead */
let SimpleChatConfirmationWidget = class SimpleChatConfirmationWidget extends BaseSimpleChatConfirmationWidget {
    constructor(context, options, instantiationService, markdownRendererService, contextMenuService, contextKeyService) {
        super(context, options, instantiationService, markdownRendererService, contextMenuService, contextKeyService);
        this.updateMessage(options.message);
    }
    updateMessage(message) {
        this._renderedMessage?.remove();
        const renderedMessage = this._register(this._markdownRendererService.render(typeof message === 'string' ? new MarkdownString(message) : message));
        this.renderMessage(renderedMessage.element);
        this._renderedMessage = renderedMessage.element;
    }
};
SimpleChatConfirmationWidget = __decorate([
    __param(2, IInstantiationService),
    __param(3, IMarkdownRendererService),
    __param(4, IContextMenuService),
    __param(5, IContextKeyService)
], SimpleChatConfirmationWidget);
export { SimpleChatConfirmationWidget };
let BaseChatConfirmationWidget = class BaseChatConfirmationWidget extends Disposable {
    get onDidClick() { return this._onDidClick.event; }
    get domNode() {
        return this._domNode;
    }
    setShowButtons(showButton) {
        this.domNode.classList.toggle('hideButtons', !showButton);
    }
    get codeblocksPartId() {
        return this.markdownContentPart.value?.codeblocksPartId;
    }
    get codeblocks() {
        return this.markdownContentPart.value?.codeblocks;
    }
    constructor(_context, options, instantiationService, markdownRendererService, contextMenuService, contextKeyService, chatMarkdownAnchorService) {
        super();
        this._context = _context;
        this.instantiationService = instantiationService;
        this.markdownRendererService = markdownRendererService;
        this.contextMenuService = contextMenuService;
        this.chatMarkdownAnchorService = chatMarkdownAnchorService;
        this._onDidClick = this._register(new Emitter());
        this.markdownContentPart = this._register(new MutableDisposable());
        const { title, subtitle, message, buttons, icon } = options;
        const elements = dom.h('.chat-confirmation-widget-container@container', [
            dom.h('.chat-confirmation-widget2@root', [
                dom.h('.chat-confirmation-widget-title', [
                    dom.h('.chat-title@title'),
                    dom.h('.chat-toolbar-container@buttonsContainer', [
                        dom.h('.chat-toolbar@toolbar'),
                    ]),
                ]),
                dom.h('.chat-confirmation-widget-message@message'),
                dom.h('.chat-confirmation-widget-buttons', [
                    dom.h('.chat-buttons@buttons'),
                ]),
            ]),
        ]);
        configureAccessibilityContainer(elements.container, title, message);
        this._domNode = elements.root;
        this._buttonsDomNode = elements.buttons;
        this._register(instantiationService.createInstance(ChatQueryTitlePart, elements.title, new MarkdownString(icon ? `$(${icon.id}) ${typeof title === 'string' ? title : title.value}` : typeof title === 'string' ? title : title.value), subtitle));
        this.messageElement = elements.message;
        this.updateButtons(buttons);
        // Create toolbar if actions are provided
        if (options?.toolbarData) {
            const overlay = contextKeyService.createOverlay([
                ['chatConfirmationPartType', options.toolbarData.partType],
                ['chatConfirmationPartSource', options.toolbarData.partSource],
            ]);
            const nestedInsta = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, overlay])));
            this._register(nestedInsta.createInstance(MenuWorkbenchToolBar, elements.toolbar, MenuId.ChatConfirmationMenu, {
                // buttonConfigProvider: () => ({ showLabel: false, showIcon: true }),
                menuOptions: {
                    arg: options.toolbarData.arg,
                    shouldForwardArgs: true,
                }
            }));
        }
    }
    updateButtons(buttons) {
        while (this._buttonsDomNode.children.length > 0) {
            this._buttonsDomNode.children[0].remove();
        }
        for (const buttonData of buttons) {
            const buttonOptions = { ...defaultButtonStyles, small: true, secondary: buttonData.isSecondary, title: buttonData.tooltip, disabled: buttonData.disabled };
            let button;
            if (buttonData.moreActions) {
                button = new ButtonWithDropdown(this._buttonsDomNode, {
                    ...buttonOptions,
                    contextMenuProvider: this.contextMenuService,
                    addPrimaryActionToDropdown: false,
                    actions: buttonData.moreActions.map(action => {
                        if (action instanceof Separator) {
                            return action;
                        }
                        return this._register(new Action(action.label, action.label, undefined, !action.disabled, () => {
                            this._onDidClick.fire(action);
                            return Promise.resolve();
                        }));
                    }),
                });
            }
            else {
                button = new Button(this._buttonsDomNode, buttonOptions);
            }
            this._register(button);
            button.label = buttonData.label;
            this._register(button.onDidClick(() => this._onDidClick.fire(buttonData)));
            if (buttonData.onDidChangeDisablement) {
                this._register(buttonData.onDidChangeDisablement(disabled => button.enabled = !disabled));
            }
        }
    }
    renderMessage(element) {
        this.markdownContentPart.clear();
        if (!dom.isHTMLElement(element)) {
            const part = this._register(this.instantiationService.createInstance(ChatMarkdownContentPart, {
                kind: 'markdownContent',
                content: typeof element === 'string' ? new MarkdownString().appendMarkdown(element) : element
            }, this._context, this._context.editorPool, false, this._context.codeBlockStartIndex, this.markdownRendererService, undefined, this._context.currentWidth.get(), {
                allowInlineDiffs: true,
                horizontalPadding: 6,
            }));
            renderFileWidgets(part.domNode, this.instantiationService, this.chatMarkdownAnchorService, this._store);
            this.markdownContentPart.value = part;
            element = part.domNode;
        }
        for (const child of this.messageElement.children) {
            child.remove();
        }
        this.messageElement.append(element);
    }
};
BaseChatConfirmationWidget = __decorate([
    __param(2, IInstantiationService),
    __param(3, IMarkdownRendererService),
    __param(4, IContextMenuService),
    __param(5, IContextKeyService),
    __param(6, IChatMarkdownAnchorService)
], BaseChatConfirmationWidget);
let ChatConfirmationWidget = class ChatConfirmationWidget extends BaseChatConfirmationWidget {
    constructor(context, options, instantiationService, markdownRendererService, contextMenuService, contextKeyService, chatMarkdownAnchorService) {
        super(context, options, instantiationService, markdownRendererService, contextMenuService, contextKeyService, chatMarkdownAnchorService);
        this.renderMessage(options.message);
    }
    updateMessage(message) {
        this._renderedMessage?.remove();
        const renderedMessage = this._register(this.markdownRendererService.render(typeof message === 'string' ? new MarkdownString(message) : message));
        this.renderMessage(renderedMessage.element);
        this._renderedMessage = renderedMessage.element;
    }
};
ChatConfirmationWidget = __decorate([
    __param(2, IInstantiationService),
    __param(3, IMarkdownRendererService),
    __param(4, IContextMenuService),
    __param(5, IContextKeyService),
    __param(6, IChatMarkdownAnchorService)
], ChatConfirmationWidget);
export { ChatConfirmationWidget };
let ChatCustomConfirmationWidget = class ChatCustomConfirmationWidget extends BaseChatConfirmationWidget {
    constructor(context, options, instantiationService, markdownRendererService, contextMenuService, contextKeyService, chatMarkdownAnchorService) {
        super(context, options, instantiationService, markdownRendererService, contextMenuService, contextKeyService, chatMarkdownAnchorService);
        this.renderMessage(options.message);
    }
};
ChatCustomConfirmationWidget = __decorate([
    __param(2, IInstantiationService),
    __param(3, IMarkdownRendererService),
    __param(4, IContextMenuService),
    __param(5, IContextKeyService),
    __param(6, IChatMarkdownAnchorService)
], ChatCustomConfirmationWidget);
export { ChatCustomConfirmationWidget };
function configureAccessibilityContainer(container, title, message) {
    container.tabIndex = 0;
    const titleAsString = typeof title === 'string' ? title : title.value;
    const messageAsString = typeof message === 'string' ? message : message && 'value' in message ? message.value : message && 'textContent' in message ? message.textContent : '';
    container.setAttribute('aria-label', localize('chat.confirmationWidget.ariaLabel', "Chat Confirmation Dialog {0} {1}", titleAsString, messageAsString));
    container.classList.add('chat-confirmation-widget-container');
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdENvbmZpcm1hdGlvbldpZGdldC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0Q29uZmlybWF0aW9uV2lkZ2V0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sdUNBQXVDLENBQUM7QUFFN0QsT0FBTyxFQUFFLE1BQU0sRUFBRSxrQkFBa0IsRUFBMkIsTUFBTSxvREFBb0QsQ0FBQztBQUN6SCxPQUFPLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSx3Q0FBd0MsQ0FBQztBQUN4RSxPQUFPLEVBQW1CLGNBQWMsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQy9GLE9BQU8sRUFBRSxVQUFVLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUUzRixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDcEQsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDN0YsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzlFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3BHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNFQUFzRSxDQUFDO0FBQ3pHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLGlFQUFpRSxDQUFDO0FBQzNHLE9B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
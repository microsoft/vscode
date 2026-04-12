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
import { asCSSUrl } from '../../../../../base/browser/cssValue.js';
import * as dom from '../../../../../base/browser/dom.js';
import { createCSSRule } from '../../../../../base/browser/domStylesheets.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Event } from '../../../../../base/common/event.js';
import { StringSHA1 } from '../../../../../base/common/hash.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { chatViewsWelcomeRegistry } from './chatViewsWelcome.js';
const $ = dom.$;
let ChatViewWelcomeController = class ChatViewWelcomeController extends Disposable {
    get isShowingWelcome() {
        return this._isShowingWelcome;
    }
    constructor(container, delegate, location, contextKeyService, instantiationService) {
        super();
        this.container = container;
        this.delegate = delegate;
        this.location = location;
        this.contextKeyService = contextKeyService;
        this.instantiationService = instantiationService;
        this.enabled = false;
        this.enabledDisposables = this._register(new DisposableStore());
        this.renderDisposables = this._register(new DisposableStore());
        this._isShowingWelcome = observableValue(this, false);
        this.element = dom.append(this.container, dom.$('.chat-view-welcome'));
        this._register(Event.runAndSubscribe(delegate.onDidChangeViewWelcomeState, () => this.update()));
        this._register(chatViewsWelcomeRegistry.onDidChange(() => this.update(true)));
    }
    getMatchingWelcomeView() {
        const descriptors = chatViewsWelcomeRegistry.get();
        const matchingDescriptors = descriptors.filter(descriptor => this.contextKeyService.contextMatchesRules(descriptor.when));
        return matchingDescriptors.at(0);
    }
    update(force) {
        const enabled = this.delegate.shouldShowWelcome();
        if (this.enabled === enabled && !force) {
            return;
        }
        this.enabled = enabled;
        this.enabledDisposables.clear();
        if (!enabled) {
            this.container.classList.toggle('chat-view-welcome-visible', false);
            this.renderDisposables.clear();
            this._isShowingWelcome.set(false, undefined);
            return;
        }
        const descriptors = chatViewsWelcomeRegistry.get();
        if (descriptors.length) {
            this.render(descriptors);
            const descriptorKeys = new Set(descriptors.flatMap(d => d.when.keys()));
            this.enabledDisposables.add(this.contextKeyService.onDidChangeContext(e => {
                if (e.affectsSome(descriptorKeys)) {
                    this.render(descriptors);
                }
            }));
        }
    }
    render(descriptors) {
        this.renderDisposables.clear();
        dom.clearNode(this.element);
        const matchingDescriptors = descriptors.filter(descriptor => this.contextKeyService.contextMatchesRules(descriptor.when));
        const enabledDescriptor = matchingDescriptors.at(0);
        if (enabledDescriptor) {
            const content = {
                icon: enabledDescriptor.icon,
                title: enabledDescriptor.title,
                message: enabledDescriptor.content
            };
            const welcomeView = this.renderDisposables.add(this.instantiationService.createInstance(ChatViewWelcomePart, content, { firstLinkToButton: true, location: this.location }));
            this.element.appendChild(welcomeView.element);
            this.container.classList.toggle('chat-view-welcome-visible', true);
            this._isShowingWelcome.set(true, undefined);
        }
        else {
            this.container.classList.toggle('chat-view-welcome-visible', false);
            this._isShowingWelcome.set(false, undefined);
        }
    }
};
ChatViewWelcomeController = __decorate([
    __param(3, IContextKeyService),
    __param(4, IInstantiationService)
], ChatViewWelcomeController);
export { ChatViewWelcomeController };
let ChatViewWelcomePart = class ChatViewWelcomePart extends Disposable {
    constructor(content, options, openerService, logService, markdownRendererService) {
        super();
        this.content = content;
        this.openerService = openerService;
        this.logService = logService;
        this.markdownRendererService = markdownRendererService;
        this.element = dom.$('.chat-welcome-view');
        try {
            // Icon
            const icon = dom.append(this.element, $('.chat-welcome-view-icon'));
            if (content.useLargeIcon) {
                icon.classList.add('large-icon');
            }
            if (content.icon) {
                if (ThemeIcon.isThemeIcon(content.icon)) {
                    const iconElement = renderIcon(content.icon);
                    icon.appendChild(iconElement);
                }
                else if (URI.isUri(content.icon)) {
                    const cssUrl = asCSSUrl(content.icon);
                    const hash = new StringSHA1();
                    hash.update(cssUrl);
                    const iconId = `chat-welcome-icon-${hash.digest()}`;
                    const iconClass = `.chat-welcome-view-icon.${iconId}`;
                    createCSSRule(iconClass, `
					mask: ${cssUrl} no-repeat 50% 50%;
					-webkit-mask: ${cssUrl} no-repeat 50% 50%;
					background-color: var(--vscode-icon-foreground);
				`);
                    icon.classList.add(iconId, 'custom-icon');
                }
            }
            const title = dom.append(this.element, $('.chat-welcome-view-title'));
            title.textContent = content.title;
            const message = dom.append(this.element, $('.chat-welcome-view-message'));
            const messageResult = this.renderMarkdownMessageContent(content.message, options);
            dom.append(message, messageResult.element);
            // Additional message
            if (content.additionalMessage) {
                const disclaimers = dom.append(this.element, $('.chat-welcome-view-disclaimer'));
                if (typeof content.additionalMessage === 'string') {
                    disclaimers.textContent = content.additionalMessage;
                }
                else {
                    const additionalMessageResult = this.renderMarkdownMessageContent(content.additionalMessage, options);
                    disclaimers.appendChild(additionalMessageResult.element);
                }
            }
            // Tips
            if (content.tips) {
                const tips = dom.append(this.element, $('.chat-welcome-view-tips'));
                const tipsResult = this._register(this.markdownRendererService.render(content.tips));
                tips.appendChild(tipsResult.element);
            }
        }
        catch (err) {
            this.logService.error('Failed to render chat view welcome content', err);
        }
    }
    needsRerender(content) {
        // Heuristic based on content that changes between states
        return !!(this.content.title !== content.title ||
            this.content.message.value !== content.message.value ||
            this.content.additionalMessage !== content.additionalMessage ||
            this.content.tips?.value !== content.tips?.value);
    }
    renderMarkdownMessageContent(content, options) {
        const messageResult = this._register(this.markdownRendererService.render(content));
        // eslint-disable-next-line no-restricted-syntax
        const firstLink = options?.firstLinkToButton ? messageResult.element.querySelector('a') : undefined;
        if (firstLink) {
            const target = firstLink.getAttribute('data-href');
            const button = this._register(new Button(firstLink.parentElement, defaultButtonStyles));
            button.label = firstLink.textContent ?? '';
            if (target) {
                this._register(button.onDidClick(() => {
                    this.openerService.open(target, { allowCommands: true });
                }));
            }
            firstLink.replaceWith(button.element);
        }
        return messageResult;
    }
};
ChatViewWelcomePart = __decorate([
    __param(2, IOpenerService),
    __param(3, ILogService),
    __param(4, IMarkdownRendererService)
], ChatViewWelcomePart);
export { ChatViewWelcomePart };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFZpZXdXZWxjb21lQ29udHJvbGxlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci92aWV3c1dlbGNvbWUvY2hhdFZpZXdXZWxjb21lQ29udHJvbGxlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDbkUsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQ0FBb0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFFOUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUNwRixPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDNUQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBRWhFLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDdEYsT0FBTyxFQUFvQyxlQUFlLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUM3RyxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDcEUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUN4RSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztB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
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
import { Action } from '../../../../../../base/common/actions.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { getAgentCanContinueIn, getAgentSessionProvider, getAgentSessionProviderIcon, getAgentSessionProviderName } from '../../agentSessions/agentSessions.js';
let ChatSuggestNextWidget = class ChatSuggestNextWidget extends Disposable {
    constructor(configurationService, contextMenuService, chatSessionsService, contextKeyService) {
        super();
        this.configurationService = configurationService;
        this.contextMenuService = contextMenuService;
        this.chatSessionsService = chatSessionsService;
        this.contextKeyService = contextKeyService;
        this._onDidChangeHeight = this._register(new Emitter());
        this.onDidChangeHeight = this._onDidChangeHeight.event;
        this._onDidSelectPrompt = this._register(new Emitter());
        this.onDidSelectPrompt = this._onDidSelectPrompt.event;
        this.buttonDisposables = new Map();
        this.domNode = this.createSuggestNextWidget();
    }
    get height() {
        return this.domNode.style.display === 'none' ? 0 : this.domNode.offsetHeight;
    }
    getCurrentMode() {
        return this._currentMode;
    }
    createSuggestNextWidget() {
        // Reuse welcome view classes for consistent styling
        const container = dom.$('.chat-suggest-next-widget.chat-welcome-view-suggested-prompts');
        container.style.display = 'none';
        // Title element using welcome view class
        this.titleElement = dom.append(container, dom.$('.chat-welcome-view-suggested-prompts-title'));
        // Container for prompt buttons
        this.promptsContainer = container;
        return container;
    }
    render(mode) {
        const handoffs = mode.handOffs?.get();
        if (!handoffs || handoffs.length === 0) {
            this.hide();
            return;
        }
        this._currentMode = mode;
        // Update title with mode name: "Proceed from {Mode}"
        const modeName = mode.name.get() || mode.label.get() || localize('chat.currentMode', 'current mode');
        this.titleElement.textContent = localize('chat.proceedFrom', 'Proceed from {0}', modeName);
        // Clear existing prompt buttons (keep title which is first child)
        const childrenToRemove = [];
        for (let i = 1; i < this.promptsContainer.children.length; i++) {
            childrenToRemove.push(this.promptsContainer.children[i]);
        }
        for (const child of childrenToRemove) {
            const disposables = this.buttonDisposables.get(child);
            if (disposables) {
                disposables.dispose();
                this.buttonDisposables.delete(child);
            }
            this.promptsContainer.removeChild(child);
        }
        const isAutopilotEnabled = this.configurationService.getValue(ChatConfiguration.AutopilotEnabled) !== false;
        const isAutopilotPolicyRestricted = this.configurationService.inspect(ChatConfiguration.GlobalAutoApprove).policyValue === false;
        const firstAutoSendHandoff = isAutopilotEnabled && !isAutopilotPolicyRestricted ? handoffs.find(h => h.send) : undefined;
        for (const handoff of handoffs) {
            const promptButton = this.createPromptButton(handoff);
            this.promptsContainer.appendChild(promptButton);
            if (handoff === firstAutoSendHandoff) {
                const autopilotButton = this.createAutopilotButton(handoff);
                this.promptsContainer.appendChild(autopilotButton);
            }
        }
        this.domNode.style.display = 'flex';
        this._onDidChangeHeight.fire();
    }
    createPromptButton(handoff) {
        const disposables = new DisposableStore();
        // Capture the label to look up the current handoff at click time
        // This ensures we get the latest handoff data (e.g., updated model from settings)
        const handoffLabel = handoff.label;
        const getCurrentHandoff = () => {
            const currentHandoffs = this._currentMode?.handOffs?.get();
            return currentHandoffs?.find(h => h.label === handoffLabel) ?? handoff;
        };
        const button = dom.$('.chat-welcome-view-suggested-prompt');
        button.setAttribute('tabindex', '0');
        button.setAttribute('role', 'button');
        button.setAttribute('aria-label', localize('chat.suggestNext.item', '{0}', handoff.label));
        const titleElement = dom.append(button, dom.$('.chat-welcome-view-suggested-prompt-title'));
        titleElement.textContent = handoff.label;
        // Optional showContinueOn behaves like send: only present if specified
        const showContinueOn = handoff.showContinueOn ?? true;
        // Get chat session contributions to show in chevron dropdown
        // Filter to only first-party providers that support "continue in".
        // TODO: Expand later to any agent with `canDelegate` === true.
        const currentSessionType = this.contextKeyService.getContextKeyValue(ChatContextKeys.chatSessionType.key);
        const contributions = this.chatSessionsService.getAllChatSessionContributions();
        const availableContributions = contributions.filter(c => {
            if (!c.canDelegate) {
                return false;
            }
            if (c.type === currentSessionType) {
                return false;
            }
            const provider = getAgentSessionProvider(c.type);
            return provider !== undefined && getAgentCanContinueIn(provider);
        });
        if (showContinueOn && availableContributions.length > 0) {
            button.classList.add('chat-suggest-next-has-dropdown');
            // Create a dropdown container that wraps separator and chevron for a larger hit area
            const dropdownContainer = dom.append(button, dom.$('.chat-suggest-next-dropdown'));
            dropdownContainer.setAttribute('tabindex', '0');
            dropdownContainer.setAttribute('role', 'button');
            dropdownContainer.setAttribute('aria-label', localize('chat.suggestNext.moreOptions', 'More options for {0}', handoff.label));
            dropdownContainer.setAttribute('aria-haspopup', 'true');
            const separator = dom.append(dropdownContainer, dom.$('.chat-suggest-next-separator'));
            separator.setAttribute('aria-hidden', 'true');
            const chevron = dom.append(dropdownContainer, dom.$('.codicon.codicon-chevron-down.dropdown-chevron'));
            chevron.setAttribute('aria-hidden', 'true');
            const showContextMenu = (e, anchor) => {
                e.preventDefault();
                e.stopPropagation();
                const actions = availableContributions.map(contrib => {
                    const provider = getAgentSessionProvider(contrib.type);
                    const icon = getAgentSessionProviderIcon(provider);
                    const name = getAgentSessionProviderName(provider);
                    return new Action(contrib.type, localize('continueIn', "Continue in {0}", name), ThemeIcon.isThemeIcon(icon) ? ThemeIcon.asClassName(icon) : undefined, true, () => {
                        const currentHandoff = getCurrentHandoff();
                        if (currentHandoff) {
                            this._onDidSelectPrompt.fire({ handoff: currentHandoff, agentId: contrib.name });
                        }
                    });
                });
                this.contextMenuService.showContextMenu({
                    getAnchor: () => anchor || dropdownContainer,
                    getActions: () => actions,
                    autoSelectFirstItem: true,
                });
            };
            disposables.add(dom.addDisposableListener(dropdownContainer, 'click', (e) => {
                showContextMenu(e, dropdownContainer);
            }));
            disposables.add(dom.addDisposableListener(dropdownContainer, 'keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    showContextMenu(e, dropdownContainer);
                }
            }));
            disposables.add(dom.addDisposableListener(button, 'click', (e) => {
                if (dom.isHTMLElement(e.target) && e.target.closest('.chat-suggest-next-dropdown')) {
                    return;
                }
                const currentHandoff = getCurrentHandoff();
                if (currentHandoff) {
                    this._onDidSelectPrompt.fire({ handoff: currentHandoff });
                }
            }));
        }
        else {
            disposables.add(dom.addDisposableListener(button, 'click', () => {
                const currentHandoff = getCurrentHandoff();
                if (currentHandoff) {
                    this._onDidSelectPrompt.fire({ handoff: currentHandoff });
                }
            }));
        }
        disposables.add(dom.addDisposableListener(button, 'keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                const currentHandoff = getCurrentHandoff();
                if (currentHandoff) {
                    this._onDidSelectPrompt.fire({ handoff: currentHandoff });
                }
            }
        }));
        // Store disposables for this button so they can be disposed when the button is removed
        this.buttonDisposables.set(button, disposables);
        return button;
    }
    createAutopilotButton(handoff) {
        const disposables = new DisposableStore();
        const handoffLabel = handoff.label;
        const getCurrentHandoff = () => {
            const currentHandoffs = this._currentMode?.handOffs?.get();
            return currentHandoffs?.find(h => h.label === handoffLabel) ?? handoff;
        };
        const label = localize('chat.suggestNext.startWithAutopilot', "Start with Autopilot");
        const button = dom.$('.chat-welcome-view-suggested-prompt');
        button.setAttribute('tabindex', '0');
        button.setAttribute('role', 'button');
        button.setAttribute('aria-label', label);
        const titleElement = dom.append(button, dom.$('.chat-welcome-view-suggested-prompt-title'));
        titleElement.textContent = label;
        disposables.add(dom.addDisposableListener(button, 'click', () => {
            const currentHandoff = getCurrentHandoff();
            if (currentHandoff) {
                this._onDidSelectPrompt.fire({ handoff: currentHandoff, withAutopilot: true });
            }
        }));
        disposables.add(dom.addDisposableListener(button, 'keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                const currentHandoff = getCurrentHandoff();
                if (currentHandoff) {
                    this._onDidSelectPrompt.fire({ handoff: currentHandoff, withAutopilot: true });
                }
            }
        }));
        this.buttonDisposables.set(button, disposables);
        return button;
    }
    hide() {
        if (this.domNode.style.display !== 'none') {
            this._currentMode = undefined;
            this.domNode.style.display = 'none';
            this._onDidChangeHeight.fire();
        }
    }
    dispose() {
        // Dispose all button disposables
        for (const disposables of this.buttonDisposables.values()) {
            disposables.dispose();
        }
        this.buttonDisposables.clear();
        super.dispose();
    }
};
ChatSuggestNextWidget = __decorate([
    __param(0, IConfigurationService),
    __param(1, IContextMenuService),
    __param(2, IChatSessionsService),
    __param(3, IContextKeyService)
], ChatSuggestNextWidget);
export { ChatSuggestNextWidget };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFN1Z2dlc3ROZXh0V2lkZ2V0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRTdWdnZXN0TmV4dFdpZGdldC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLHVDQUF1QyxDQUFDO0FBQzdELE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNsRSxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sd0NBQXdDLENBQUM7QUFDeEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN6RixPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDdkUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3BELE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3BHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUM3RSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUVqRSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUU5RSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsdUJBQXVCLEVBQUUsMkJBQTJCLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQVF6SixJQUFNLHFCQUFxQixHQUEzQixNQUFNLHFCQUFzQixTQUFRLFVB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
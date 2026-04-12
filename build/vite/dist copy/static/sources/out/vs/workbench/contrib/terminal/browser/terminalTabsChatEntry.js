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
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { $ } from '../../../../base/browser/dom.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ITerminalChatService, ITerminalService } from './terminal.js';
import * as dom from '../../../../base/browser/dom.js';
let TerminalTabsChatEntry = class TerminalTabsChatEntry extends Disposable {
    dispose() {
        this._entry.remove();
        this._label.remove();
        this._deleteButton.remove();
        super.dispose();
    }
    constructor(container, _tabContainer, _commandService, _terminalChatService, _terminalService) {
        super();
        this._tabContainer = _tabContainer;
        this._commandService = _commandService;
        this._terminalChatService = _terminalChatService;
        this._terminalService = _terminalService;
        this._entry = dom.append(container, $('.terminal-tabs-chat-entry'));
        this._entry.tabIndex = 0;
        this._entry.setAttribute('role', 'button');
        const entry = dom.append(this._entry, $('.terminal-tabs-entry'));
        const icon = dom.append(entry, $('.terminal-tabs-chat-entry-icon'));
        icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.commentDiscussionSparkle));
        this._label = dom.append(entry, $('.terminal-tabs-chat-entry-label'));
        // Add delete button (right-aligned via CSS margin-left: auto)
        this._deleteButton = dom.append(entry, $('.terminal-tabs-chat-entry-delete'));
        this._deleteButton.classList.add(...ThemeIcon.asClassNameArray(Codicon.trashcan));
        this._deleteButton.tabIndex = 0;
        this._deleteButton.setAttribute('role', 'button');
        this._deleteButton.setAttribute('aria-label', localize('terminal.tabs.chatEntryDeleteAriaLabel', "Kill all hidden chat terminals"));
        this._deleteButton.setAttribute('title', localize('terminal.tabs.chatEntryDeleteTooltip', "Kill all hidden chat terminals"));
        const runChatTerminalsCommand = () => {
            void this._commandService.executeCommand('workbench.action.terminal.chat.viewHiddenChatTerminals');
        };
        this._register(dom.addDisposableListener(this._entry, dom.EventType.CLICK, e => {
            // Don't trigger if clicking on the delete button
            if (e.target === this._deleteButton || this._deleteButton.contains(e.target)) {
                return;
            }
            e.preventDefault();
            runChatTerminalsCommand();
        }));
        this._register(dom.addDisposableListener(this._entry, dom.EventType.KEY_DOWN, e => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                runChatTerminalsCommand();
            }
        }));
        // Delete button click handler
        this._register(dom.addDisposableListener(this._deleteButton, dom.EventType.CLICK, async (e) => {
            e.preventDefault();
            e.stopPropagation();
            await this._deleteAllHiddenTerminals();
        }));
        // Delete button keyboard handler
        this._register(dom.addDisposableListener(this._deleteButton, dom.EventType.KEY_DOWN, async (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                await this._deleteAllHiddenTerminals();
            }
        }));
        this.update();
    }
    async _deleteAllHiddenTerminals() {
        const hiddenTerminals = this._terminalChatService.getToolSessionTerminalInstances(true);
        await Promise.all(hiddenTerminals.map(terminal => this._terminalService.safeDisposeTerminal(terminal)));
    }
    get element() {
        return this._entry;
    }
    update() {
        const hiddenChatTerminalCount = this._terminalChatService.getToolSessionTerminalInstances(true).length;
        if (hiddenChatTerminalCount <= 0) {
            this._entry.style.display = 'none';
            this._label.textContent = '';
            this._entry.removeAttribute('aria-label');
            this._entry.removeAttribute('title');
            return;
        }
        this._entry.style.display = '';
        const tooltip = localize('terminal.tabs.chatEntryTooltip', "Show hidden chat terminals");
        this._entry.setAttribute('title', tooltip);
        const hasText = this._tabContainer.classList.contains('has-text');
        if (hasText) {
            this._label.textContent = hiddenChatTerminalCount === 1
                ? localize('terminal.tabs.chatEntryLabelSingle', "{0} Hidden Terminal", hiddenChatTerminalCount)
                : localize('terminal.tabs.chatEntryLabelPlural', "{0} Hidden Terminals", hiddenChatTerminalCount);
        }
        else {
            this._label.textContent = `${hiddenChatTerminalCount}`;
        }
        const ariaLabel = hiddenChatTerminalCount === 1
            ? localize('terminal.tabs.chatEntryAriaLabelSingle', "Show 1 hidden chat terminal")
            : localize('terminal.tabs.chatEntryAriaLabelPlural', "Show {0} hidden chat terminals", hiddenChatTerminalCount);
        this._entry.setAttribute('aria-label', ariaLabel);
    }
};
TerminalTabsChatEntry = __decorate([
    __param(2, ICommandService),
    __param(3, ITerminalChatService),
    __param(4, ITerminalService)
], TerminalTabsChatEntry);
export { TerminalTabsChatEntry };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxUYWJzQ2hhdEVudHJ5LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbFRhYnNDaGF0RW50cnkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUFFLENBQUMsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3BELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDbkYsT0FBTyxFQUFFLG9CQUFvQixFQUFFLGdCQUFnQixFQUFFLE1BQU0sZUFBZSxDQUFDO0FBQ3ZFLE9BQU8sS0FBSyxHQUFHLE1BQU0saUNBQWlDLENBQUM7QUFFaEQsSUFBTSxxQkFBcUIsR0FBM0IsTUFBTSxxQkFBc0IsU0FBUSxVQUFVO0lBTTNDLE9BQU87UUFDZixJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ3JCLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDckIsSUFBSSxDQUFDLGFBQWEsQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUM1QixLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDakIsQ0FBQztJQUVELFlBQ0MsU0FBc0IsRUFDTCxhQUEwQixFQUNULGVBQWdDLEVBQzNCLG9CQUEwQyxFQUM5QyxnQkFBa0M7UUFFckUsS0FBSyxFQUFFLENBQUM7UUFMUyxrQkFBYSxHQUFiLGFB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
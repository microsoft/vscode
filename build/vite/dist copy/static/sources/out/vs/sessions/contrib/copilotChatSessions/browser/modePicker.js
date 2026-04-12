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
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { ChatMode, IChatModeService } from '../../../../workbench/contrib/chat/common/chatModes.js';
import { IChatSessionsService } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { Target } from '../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { AICustomizationManagementCommands } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagement.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { ISessionsProvidersService } from '../../sessions/browser/sessionsProvidersService.js';
import { CopilotCLISessionType } from '../../sessions/browser/sessionTypes.js';
/**
 * A self-contained widget for selecting a chat mode (Agent, custom agents)
 * for local/Background sessions. Shows only modes whose target matches
 * the Background session type's customAgentTarget.
 */
let ModePicker = class ModePicker extends Disposable {
    get selectedMode() {
        return this._selectedMode;
    }
    constructor(actionWidgetService, chatModeService, chatSessionsService, commandService, sessionsManagementService, sessionsProvidersService) {
        super();
        this.actionWidgetService = actionWidgetService;
        this.chatModeService = chatModeService;
        this.chatSessionsService = chatSessionsService;
        this.commandService = commandService;
        this.sessionsManagementService = sessionsManagementService;
        this.sessionsProvidersService = sessionsProvidersService;
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this._renderDisposables = this._register(new DisposableStore());
        this._selectedMode = ChatMode.Agent;
        this._register(this.chatModeService.onDidChangeChatModes(() => {
            // Refresh the trigger label when available chat modes change
            if (this._triggerElement) {
                this._updateTriggerLabel();
            }
        }));
    }
    /**
     * Resets the selected mode back to the default Agent mode.
     */
    reset() {
        this._selectedMode = ChatMode.Agent;
        this._updateTriggerLabel();
    }
    /**
     * Renders the mode picker trigger button into the given container.
     */
    render(container) {
        this._renderDisposables.clear();
        const slot = dom.append(container, dom.$('.sessions-chat-picker-slot'));
        this._slotElement = slot;
        this._renderDisposables.add({ dispose: () => slot.remove() });
        const trigger = dom.append(slot, dom.$('a.action-label'));
        trigger.tabIndex = 0;
        trigger.role = 'button';
        trigger.setAttribute('aria-label', localize('sessions.modePicker.ariaLabel', "Select chat mode"));
        this._triggerElement = trigger;
        this._updateTriggerLabel();
        this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.CLICK, (e) => {
            dom.EventHelper.stop(e, true);
            this._showPicker();
        }));
        this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                dom.EventHelper.stop(e, true);
                this._showPicker();
            }
        }));
        return slot;
    }
    _getAvailableModes() {
        const customAgentTarget = this.chatSessionsService.getCustomAgentTargetForSessionType(CopilotCLISessionType.id);
        const effectiveTarget = customAgentTarget && customAgentTarget !== Target.Undefined ? customAgentTarget : Target.GitHubCopilot;
        const modes = this.chatModeService.getModes();
        // Always include the default Agent mode
        const result = [ChatMode.Agent];
        // Add custom modes matching the target and visible to users
        for (const mode of modes.custom) {
            const target = mode.target.get();
            if (target === effectiveTarget || target === Target.Undefined) {
                const visibility = mode.visibility?.get();
                if (visibility && !visibility.userInvocable) {
                    continue;
                }
                result.push(mode);
            }
        }
        return result;
    }
    _showPicker() {
        if (!this._triggerElement || this.actionWidgetService.isVisible) {
            return;
        }
        const modes = this._getAvailableModes();
        const items = this._buildItems(modes);
        const triggerElement = this._triggerElement;
        const delegate = {
            onSelect: (item) => {
                this.actionWidgetService.hide();
                if (item.kind === 'mode') {
                    this._selectMode(item.mode);
                }
                else {
                    this.commandService.executeCommand(AICustomizationManagementCommands.OpenEditor);
                }
            },
            onHide: () => { triggerElement.focus(); },
        };
        this.actionWidgetService.show('localModePicker', false, items, delegate, this._triggerElement, undefined, [], {
            getAriaLabel: (item) => item.label ?? '',
            getWidgetAriaLabel: () => localize('modePicker.ariaLabel', "Mode Picker"),
        });
    }
    _buildItems(modes) {
        const items = [];
        // Default Agent mode
        const agentMode = modes[0];
        items.push({
            kind: "action" /* ActionListItemKind.Action */,
            label: agentMode.label.get(),
            group: { title: '', icon: this._selectedMode.id === agentMode.id ? Codicon.check : Codicon.blank },
            item: { kind: 'mode', mode: agentMode },
        });
        // Custom modes (with separator if any exist)
        const customModes = modes.slice(1);
        if (customModes.length > 0) {
            items.push({ kind: "separator" /* ActionListItemKind.Separator */, label: '' });
            for (const mode of customModes) {
                items.push({
                    kind: "action" /* ActionListItemKind.Action */,
                    label: mode.label.get(),
                    group: { title: '', icon: this._selectedMode.id === mode.id ? Codicon.check : Codicon.blank },
                    item: { kind: 'mode', mode },
                });
            }
        }
        // Configure Custom Agents action
        items.push({ kind: "separator" /* ActionListItemKind.Separator */, label: '' });
        items.push({
            kind: "action" /* ActionListItemKind.Action */,
            label: localize('configureCustomAgents', "Configure Custom Agents..."),
            group: { title: '', icon: Codicon.blank },
            item: { kind: 'configure' },
        });
        return items;
    }
    _selectMode(mode) {
        this._selectedMode = mode;
        this._updateTriggerLabel();
        this._onDidChange.fire(mode);
        const session = this.sessionsManagementService.activeSession.get();
        if (!session) {
            return;
        }
        this.sessionsProvidersService.getProvider(session.providerId)?.getSession(session.sessionId)?.setMode(mode);
    }
    _updateTriggerLabel() {
        if (!this._triggerElement || !this._slotElement) {
            return;
        }
        dom.clearNode(this._triggerElement);
        const icon = this._selectedMode.icon.get();
        if (icon) {
            dom.append(this._triggerElement, renderIcon(icon));
        }
        const labelSpan = dom.append(this._triggerElement, dom.$('span.sessions-chat-dropdown-label'));
        labelSpan.textContent = this._selectedMode.label.get();
        dom.append(this._triggerElement, renderIcon(Codicon.chevronDown));
        const modes = this._getAvailableModes();
        const visible = modes.length > 1;
        dom.setVisibility(visible, this._slotElement);
        this._slotElement.classList.toggle('disabled', false);
        this._triggerElement.setAttribute('aria-hidden', String(!visible));
        this._triggerElement.tabIndex = visible ? 0 : -1;
    }
};
ModePicker = __decorate([
    __param(0, IActionWidgetService),
    __param(1, IChatModeService),
    __param(2, IChatSessionsService),
    __param(3, ICommandService),
    __param(4, ISessionsManagementService),
    __param(5, ISessionsProvidersService)
], ModePicker);
export { ModePicker };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kZVBpY2tlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3Nlc3Npb25zL2NvbnRyaWIvY29waWxvdENoYXRTZXNzaW9ucy9icm93c2VyL21vZGVQaWNrZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxpQ0FBaUMsQ0FBQztBQUN2RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbkYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBRWpHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUNqRixPQUFPLEVBQUUsUUFBUSxFQUFhLGdCQUFnQixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDL0csT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFDeEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ25GLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSx1RUFBdUUsQ0FBQztBQUMvRixPQUFPLEVBQUUsaUNBQWlDLEVBQUUsTUFBTSx5RkFBeUYsQ0FBQztBQUM1SSxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUNqRyxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUMvRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQWMvRTs7OztHQUlH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
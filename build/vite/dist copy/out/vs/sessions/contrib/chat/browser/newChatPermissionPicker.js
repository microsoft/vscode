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
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { ISessionsProvidersService } from '../../sessions/browser/sessionsProvidersService.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { ChatConfiguration, ChatPermissionLevel } from '../../../../workbench/contrib/chat/common/constants.js';
import Severity from '../../../../base/common/severity.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { URI } from '../../../../base/common/uri.js';
// Track whether warnings have been shown this VS Code session
const shownWarnings = new Set();
/**
 * A permission picker for the new-session welcome view.
 * Shows Default Approvals, Bypass Approvals, and Autopilot options.
 */
let NewChatPermissionPicker = class NewChatPermissionPicker extends Disposable {
    get permissionLevel() {
        return this._currentLevel;
    }
    set permissionLevel(level) {
        this._currentLevel = level;
        this._updateTriggerLabel(this._triggerElement);
    }
    constructor(actionWidgetService, configurationService, dialogService, openerService, sessionsManagementService, sessionsProvidersService) {
        super();
        this.actionWidgetService = actionWidgetService;
        this.configurationService = configurationService;
        this.dialogService = dialogService;
        this.openerService = openerService;
        this.sessionsManagementService = sessionsManagementService;
        this.sessionsProvidersService = sessionsProvidersService;
        this._onDidChangeLevel = this._register(new Emitter());
        this.onDidChangeLevel = this._onDidChangeLevel.event;
        this._currentLevel = ChatPermissionLevel.Default;
        this._renderDisposables = this._register(new DisposableStore());
        // Write permission level to the active session data when it changes
        this._register(this.onDidChangeLevel(level => {
            const session = this.sessionsManagementService.activeSession.get();
            if (!session) {
                return;
            }
            this.sessionsProvidersService.getProvider(session.providerId)?.getSession(session.sessionId)?.setPermissionLevel(level);
        }));
    }
    render(container) {
        this._renderDisposables.clear();
        const slot = dom.append(container, dom.$('.sessions-chat-picker-slot'));
        this._renderDisposables.add({ dispose: () => slot.remove() });
        const trigger = dom.append(slot, dom.$('a.action-label'));
        trigger.tabIndex = 0;
        trigger.role = 'button';
        this._triggerElement = trigger;
        this._updateTriggerLabel(trigger);
        this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.CLICK, (e) => {
            dom.EventHelper.stop(e, true);
            this.showPicker();
        }));
        this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                dom.EventHelper.stop(e, true);
                this.showPicker();
            }
        }));
        return slot;
    }
    showPicker() {
        if (!this._triggerElement || this.actionWidgetService.isVisible) {
            return;
        }
        const policyRestricted = this.configurationService.inspect(ChatConfiguration.GlobalAutoApprove).policyValue === false;
        const isAutopilotEnabled = this.configurationService.getValue(ChatConfiguration.AutopilotEnabled) !== false;
        const items = [
            {
                kind: "action" /* ActionListItemKind.Action */,
                group: { kind: "header" /* ActionListItemKind.Header */, title: '', icon: Codicon.shield },
                item: {
                    level: ChatPermissionLevel.Default,
                    label: localize('permissions.default', "Default Approvals"),
                    icon: Codicon.shield,
                    checked: this._currentLevel === ChatPermissionLevel.Default,
                },
                label: localize('permissions.default', "Default Approvals"),
                description: localize('permissions.default.subtext', "Copilot uses your configured settings"),
                disabled: false,
            },
            {
                kind: "action" /* ActionListItemKind.Action */,
                group: { kind: "header" /* ActionListItemKind.Header */, title: '', icon: Codicon.warning },
                item: {
                    level: ChatPermissionLevel.AutoApprove,
                    label: localize('permissions.autoApprove', "Bypass Approvals"),
                    icon: Codicon.warning,
                    checked: this._currentLevel === ChatPermissionLevel.AutoApprove,
                },
                label: localize('permissions.autoApprove', "Bypass Approvals"),
                description: localize('permissions.autoApprove.subtext', "All tool calls are auto-approved"),
                disabled: policyRestricted,
            },
        ];
        if (isAutopilotEnabled) {
            items.push({
                kind: "action" /* ActionListItemKind.Action */,
                group: { kind: "header" /* ActionListItemKind.Header */, title: '', icon: Codicon.rocket },
                item: {
                    level: ChatPermissionLevel.Autopilot,
                    label: localize('permissions.autopilot', "Autopilot (Preview)"),
                    icon: Codicon.rocket,
                    checked: this._currentLevel === ChatPermissionLevel.Autopilot,
                },
                label: localize('permissions.autopilot', "Autopilot (Preview)"),
                description: localize('permissions.autopilot.subtext', "Autonomously iterates from start to finish"),
                disabled: policyRestricted,
            });
        }
        items.push({
            kind: "separator" /* ActionListItemKind.Separator */,
            label: '',
            disabled: false,
        });
        items.push({
            kind: "action" /* ActionListItemKind.Action */,
            group: { kind: "header" /* ActionListItemKind.Header */, title: '', icon: Codicon.blank },
            item: {
                label: localize('permissions.learnMore', "Learn more about permissions"),
                icon: Codicon.blank,
                checked: false,
            },
            label: localize('permissions.learnMore', "Learn more about permissions"),
            hideIcon: false,
            disabled: false,
        });
        const triggerElement = this._triggerElement;
        const delegate = {
            onSelect: async (item) => {
                this.actionWidgetService.hide();
                if (item.level) {
                    await this._selectLevel(item.level);
                }
                else {
                    await this.openerService.open(URI.parse('https://code.visualstudio.com/docs/copilot/agents/agent-tools#_permission-levels'));
                }
            },
            onHide: () => { triggerElement.focus(); },
        };
        const listOptions = { descriptionBelow: true, minWidth: 255 };
        this.actionWidgetService.show('permissionPicker', false, items, delegate, this._triggerElement, undefined, [], {
            getAriaLabel: (item) => item.label ?? '',
            getWidgetAriaLabel: () => localize('permissionPicker.ariaLabel', "Permission Picker"),
        }, listOptions);
    }
    async _selectLevel(level) {
        if (level === ChatPermissionLevel.AutoApprove && !shownWarnings.has(ChatPermissionLevel.AutoApprove)) {
            const result = await this.dialogService.prompt({
                type: Severity.Warning,
                message: localize('permissions.autoApprove.warning.title', "Enable Bypass Approvals?"),
                buttons: [
                    {
                        label: localize('permissions.autoApprove.warning.confirm', "Enable"),
                        run: () => true
                    },
                    {
                        label: localize('permissions.autoApprove.warning.cancel', "Cancel"),
                        run: () => false
                    },
                ],
                custom: {
                    icon: Codicon.warning,
                    markdownDetails: [{
                            markdown: new MarkdownString(localize('permissions.autoApprove.warning.detail', "Bypass Approvals will auto-approve all tool calls without asking for confirmation. This includes file edits, terminal commands, and external tool calls.")),
                        }],
                },
            });
            if (result.result !== true) {
                return;
            }
            shownWarnings.add(ChatPermissionLevel.AutoApprove);
        }
        if (level === ChatPermissionLevel.Autopilot && !shownWarnings.has(ChatPermissionLevel.Autopilot)) {
            const result = await this.dialogService.prompt({
                type: Severity.Warning,
                message: localize('permissions.autopilot.warning.title', "Enable Autopilot?"),
                buttons: [
                    {
                        label: localize('permissions.autopilot.warning.confirm', "Enable"),
                        run: () => true
                    },
                    {
                        label: localize('permissions.autopilot.warning.cancel', "Cancel"),
                        run: () => false
                    },
                ],
                custom: {
                    icon: Codicon.rocket,
                    markdownDetails: [{
                            markdown: new MarkdownString(localize('permissions.autopilot.warning.detail', "Autopilot will auto-approve all tool calls and continue working autonomously until the task is complete. The agent will make decisions on your behalf without asking for confirmation.\n\nYou can stop the agent at any time by clicking the stop button. This applies to the current session only.")),
                        }],
                },
            });
            if (result.result !== true) {
                return;
            }
            shownWarnings.add(ChatPermissionLevel.Autopilot);
        }
        this._currentLevel = level;
        this._updateTriggerLabel(this._triggerElement);
        this._onDidChangeLevel.fire(level);
    }
    _updateTriggerLabel(trigger) {
        if (!trigger) {
            return;
        }
        dom.clearNode(trigger);
        let icon;
        let label;
        switch (this._currentLevel) {
            case ChatPermissionLevel.Autopilot:
                icon = Codicon.rocket;
                label = localize('permissions.autopilot.label', "Autopilot (Preview)");
                break;
            case ChatPermissionLevel.AutoApprove:
                icon = Codicon.warning;
                label = localize('permissions.autoApprove.label', "Bypass Approvals");
                break;
            default:
                icon = Codicon.shield;
                label = localize('permissions.default.label', "Default Approvals");
                break;
        }
        dom.append(trigger, renderIcon(icon));
        const labelSpan = dom.append(trigger, dom.$('span.sessions-chat-dropdown-label'));
        labelSpan.textContent = label;
        dom.append(trigger, renderIcon(Codicon.chevronDown));
        trigger.classList.toggle('warning', this._currentLevel === ChatPermissionLevel.Autopilot);
        trigger.classList.toggle('info', this._currentLevel === ChatPermissionLevel.AutoApprove);
    }
};
NewChatPermissionPicker = __decorate([
    __param(0, IActionWidgetService),
    __param(1, IConfigurationService),
    __param(2, IDialogService),
    __param(3, IOpenerService),
    __param(4, ISessionsManagementService),
    __param(5, ISessionsProvidersService)
], NewChatPermissionPicker);
export { NewChatPermissionPicker };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmV3Q2hhdFBlcm1pc3Npb25QaWNrZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy9jb250cmliL2NoYXQvYnJvd3Nlci9uZXdDaGF0UGVybWlzc2lvblBpY2tlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNuRixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFFakcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2hGLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ2pHLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQy9GLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUVqRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUNoSCxPQUFPLFFBQVEsTUFBTSxxQ0FBcUMsQ0FBQztBQUMzRCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDeEUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQzlFLE9BQU8sRUFB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
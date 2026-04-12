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
import { renderLabelWithIcons } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { ChatConfiguration, ChatPermissionLevel } from '../../../common/constants.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import Severity from '../../../../../../base/common/severity.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { ChatInputPickerActionViewItem } from './chatInputPickerActionItem.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { URI } from '../../../../../../base/common/uri.js';
// Track whether warnings have been shown this VS Code session
const shownWarnings = new Set();
function hasShownElevatedWarning(level) {
    if (shownWarnings.has(level)) {
        return true;
    }
    // Autopilot is stricter than AutoApprove, so confirming Autopilot
    // implies the user already accepted the AutoApprove risks.
    if (level === ChatPermissionLevel.AutoApprove && shownWarnings.has(ChatPermissionLevel.Autopilot)) {
        return true;
    }
    return false;
}
let PermissionPickerActionItem = class PermissionPickerActionItem extends ChatInputPickerActionViewItem {
    constructor(action, delegate, pickerOptions, actionWidgetService, keybindingService, contextKeyService, telemetryService, configurationService, dialogService, openerService) {
        const isAutoApprovePolicyRestricted = () => configurationService.inspect(ChatConfiguration.GlobalAutoApprove).policyValue === false;
        const isAutopilotEnabled = () => configurationService.getValue(ChatConfiguration.AutopilotEnabled) !== false;
        const actionProvider = {
            getActions: () => {
                const currentLevel = delegate.currentPermissionLevel.get();
                const policyRestricted = isAutoApprovePolicyRestricted();
                const actions = [
                    {
                        ...action,
                        id: 'chat.permissions.default',
                        label: localize('permissions.default', "Default Approvals"),
                        description: localize('permissions.default.subtext', "Copilot uses your configured settings"),
                        icon: ThemeIcon.fromId(Codicon.shield.id),
                        checked: currentLevel === ChatPermissionLevel.Default,
                        tooltip: '',
                        hover: {
                            content: localize('permissions.default.description', "Use configured approval settings"),
                            position: pickerOptions.hoverPosition
                        },
                        run: async () => {
                            delegate.setPermissionLevel(ChatPermissionLevel.Default);
                            if (this.element) {
                                this.renderLabel(this.element);
                            }
                        },
                    },
                    {
                        ...action,
                        id: 'chat.permissions.autoApprove',
                        label: localize('permissions.autoApprove', "Bypass Approvals"),
                        description: localize('permissions.autoApprove.subtext', "All tool calls are auto-approved"),
                        icon: ThemeIcon.fromId(Codicon.warning.id),
                        checked: currentLevel === ChatPermissionLevel.AutoApprove,
                        enabled: !policyRestricted,
                        tooltip: policyRestricted ? localize('permissions.autoApprove.policyDisabled', "Disabled by enterprise policy") : '',
                        hover: {
                            content: policyRestricted
                                ? localize('permissions.autoApprove.policyDescription', "Disabled by enterprise policy")
                                : localize('permissions.autoApprove.description', "Auto-approve all tool calls and retry on errors"),
                            position: pickerOptions.hoverPosition
                        },
                        run: async () => {
                            if (!hasShownElevatedWarning(ChatPermissionLevel.AutoApprove)) {
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
                            delegate.setPermissionLevel(ChatPermissionLevel.AutoApprove);
                            if (this.element) {
                                this.renderLabel(this.element);
                            }
                        },
                    },
                ];
                if (isAutopilotEnabled()) {
                    actions.push({
                        ...action,
                        id: 'chat.permissions.autopilot',
                        label: localize('permissions.autopilot', "Autopilot (Preview)"),
                        description: localize('permissions.autopilot.subtext', "Autonomously iterates from start to finish"),
                        icon: ThemeIcon.fromId(Codicon.rocket.id),
                        checked: currentLevel === ChatPermissionLevel.Autopilot,
                        enabled: !policyRestricted,
                        tooltip: policyRestricted ? localize('permissions.autopilot.policyDisabled', "Disabled by enterprise policy") : '',
                        hover: {
                            content: policyRestricted
                                ? localize('permissions.autopilot.policyDescription', "Disabled by enterprise policy")
                                : localize('permissions.autopilot.description', "Auto-approve all tool calls and continue until the task is done"),
                            position: pickerOptions.hoverPosition
                        },
                        run: async () => {
                            if (!hasShownElevatedWarning(ChatPermissionLevel.Autopilot)) {
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
                                                markdown: new MarkdownString(localize('permissions.autopilot.warning.detail', "Autopilot will auto-approve all tool calls and continue working autonomously until the task is complete. This includes terminal commands, file edits, and external tool calls. The agent will make decisions on your behalf without asking for confirmation.\n\nYou can stop the agent at any time by clicking the stop button. This applies to the current session only.")),
                                            }],
                                    },
                                });
                                if (result.result !== true) {
                                    return;
                                }
                                shownWarnings.add(ChatPermissionLevel.Autopilot);
                            }
                            delegate.setPermissionLevel(ChatPermissionLevel.Autopilot);
                            if (this.element) {
                                this.renderLabel(this.element);
                            }
                        },
                    });
                }
                return actions;
            }
        };
        super(action, {
            actionProvider,
            actionBarActions: [{
                    id: 'chat.permissions.learnMore',
                    label: localize('permissions.learnMore', "Learn more about permissions"),
                    tooltip: localize('permissions.learnMore', "Learn more about permissions"),
                    class: undefined,
                    enabled: true,
                    run: async () => {
                        await openerService.open(URI.parse('https://code.visualstudio.com/docs/copilot/agents/agent-tools#_permission-levels'));
                    }
                }],
            reporter: { id: 'ChatPermissionPicker', name: 'ChatPermissionPicker', includeOptions: true },
            listOptions: { descriptionBelow: true, minWidth: 255 },
        }, pickerOptions, actionWidgetService, keybindingService, contextKeyService, telemetryService);
        this.delegate = delegate;
        this.dialogService = dialogService;
    }
    renderLabel(element) {
        this.setAriaLabelAttributes(element);
        const level = this.delegate.currentPermissionLevel.get();
        let icon;
        let label;
        switch (level) {
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
        const labelElements = [];
        labelElements.push(...renderLabelWithIcons(`$(${icon.id})`));
        labelElements.push(dom.$('span.chat-input-picker-label', undefined, label));
        labelElements.push(...renderLabelWithIcons(`$(chevron-down)`));
        dom.reset(element, ...labelElements);
        element.classList.toggle('warning', level === ChatPermissionLevel.Autopilot);
        element.classList.toggle('info', level === ChatPermissionLevel.AutoApprove);
        return null;
    }
    refresh() {
        if (this.element) {
            this.renderLabel(this.element);
        }
    }
};
PermissionPickerActionItem = __decorate([
    __param(3, IActionWidgetService),
    __param(4, IKeybindingService),
    __param(5, IContextKeyService),
    __param(6, ITelemetryService),
    __param(7, IConfigurationService),
    __param(8, IDialogService),
    __param(9, IOpenerService)
], PermissionPickerActionItem);
export { PermissionPickerActionItem };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGVybWlzc2lvblBpY2tlckFjdGlvbkl0ZW0uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2lucHV0L3Blcm1pc3Npb25QaWNrZXJBY3Rpb25JdGVtLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sdUNBQXVDLENBQUM7QUFDN0QsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDakcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBR3BFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN2RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDcEQsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0saUVBQWlFLENBQUM7QUFFdkcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDaEcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDaEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDN0YsT0FBTyxFQUFFLGlCQUFpQixFQUFFLG1CQUFtQixFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFFdEYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFDekcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3RGLE9BQU8sUUFBUSxNQUFNLDJDQUEyQyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsNkJBQTZCLEVBQTJCLE1BQU0sZ0NBQWdDLENBQUM7QUFDeEcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUUzRCw4REFBOEQ7QUFDOUQsTUFBTSxhQUFhLEdBQUcsSUFBSSxHQUFHLEVBQXVCLENBQUM7QUFFckQsU0FBUyx1QkFBdUIsQ0FBQyxLQUEwQjtJQUMxRCxJQUFJLGFBQWEsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUM5QixPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFDRCxrRUFBa0U7SUFDbEUsMkRBQTJEO0lBQzNELElBQUksS0FBSyxLQUFLLG1CQUFtQixDQUFDLFdBQVcsSUFBSSxhQUFhLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7UUFDbkcsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBQ0QsT0FBTyxLQUFLLENBQUM7QUFDZCxDQUFDO0FBT00sSUFBTSwwQkFBMEIsR0FBaEMsTUFBTSwwQkFBMkIsU0FBUSw2QkFBNkI7SUFDNUUsWUFDQyxNQUFzQixFQUNMLFFBQW1DLEVBQ3BELGFBQXNDLEVBQ2hCLG1CQUF5QyxFQUMzQyxpQkFBcUMsRUFDckMsaUJBQXFDLEVBQ3RDLGdCQUFtQyxFQUMvQixvQkFBMkMsRUFDakMsYUFBNkIsRUFDOUMsYUFBNkI7UUFFN0MsTUFBTSw2QkFBNkIsR0FBRyxHQUFHLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxPQUFPLENBQVUsaUJBQWlCLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxXQUFXLEtBQUssS0FBSyxDQUFDO1FBQzdJLE1BQU0sa0JBQWtCLEdBQUcsR0FBRyxFQUFFLENBQUMsb0JBQW9CLENBQUMsUUFBUSxDQUFVLGlCQUFpQixDQUFDLGdCQUFnQixDQUFDLEtBQUssS0FBSyxDQUFDO1FBQ3RILE1BQU0sY0FBYyxHQUF3QztZQUMzRCxVQUFVLEVBQUUsR0FBRyxFQUFFO2dCQUNoQixNQUFNLFlBQVksR0FBRyxRQUFRLENBQUMsc0JBQXNCLENBQUMsR0FBRyxFQUFFLENBQUM7Z0JBQzNELE1BQU0sZ0JBQWdCLEdBQUcsNkJBQTZCLEVBQUUsQ0FBQztnQkFDekQsTUFBTSxPQUFPLEdBQWtDO29CQUM5Qzt3QkFDQyxHQUFHLE1BQU07d0JBQ1QsRUFBRSxFQUFFLDBCQUEwQjt3QkFDOUIsS0FBSyxFQUFFLFFBQVEsQ0FBQyxxQkFBcUIsRUFBRSxtQkFBbUIsQ0FBQzt3QkFDM0QsV0FBVyxFQUFFLFFBQVEsQ0FBQyw2QkFBNkIsRUFBRSx1Q0FBdUMsQ0FBQzt3QkFDN0YsSUFBSSxFQUFFLFNBQVMsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7d0JBQ3pDLE9BQU8sRUFBRSxZQUFZLEtBQUssbUJBQW1CLENBQUMsT0FBTzt3QkFDckQsT0FBTyxFQUFFLEVBQUU7d0JBQ1gsS0FBSyxFQUFFOzRCQUNOLE9BQU8sRUFBRSxRQUFRLENBQUMsaUNBQWlDLEVBQUUsa0NBQWtDLENBQUM7NEJBQ3hGLFFBQVEsRUFBRSxhQUFhLENBQUMsYUFBYTt5QkFDckM7d0JBQ0QsR0FBRyxFQUFFLEtBQUssSUFBSSxFQUFFOzRCQUNmLFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQyxtQkFBbUIsQ0FBQyxPQUFPLENBQUMsQ0FBQzs0QkFDekQsSUFBSSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7Z0NBQ2xCLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDOzRCQUNoQyxDQUFDO3dCQUNGLENBQUM7cUJBQ3FDO29CQUN2Qzt3QkFDQyxHQUFHLE1BQU07d0JBQ1QsRUFBRSxFQUFFLDhCQUE4Qjt3QkFDbEMsS0FBSyxFQUFFLFFBQVEsQ0FBQyx5QkFBeUIsRUFBRSxrQkFBa0IsQ0FBQzt3QkFDOUQsV0FBVyxFQUFFLFFBQVEsQ0FBQyxpQ0FBaUMsRUFBRSxrQ0FBa0MsQ0FBQzt3QkFDNUYsSUFBSSxFQUFFLFNBQVMsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7d0JBQzFDLE9BQU8sRUFBRSxZQUFZLEtBQUssbUJBQW1CLENBQUMsV0FBVzt3QkFDekQsT0FBTyxFQUFFLENBQUMsZ0JBQWdCO3dCQUMxQixPQUFPLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyx3Q0FBd0MsRUFBRSwrQkFBK0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFO3dCQUNwSCxLQUFLLEVBQUU7NEJBQ04sT0FBTyxFQUFFLGdCQUFnQjtnQ0FDeEIsQ0FBQyxDQUFDLFFBQVEsQ0FBQywyQ0FBMkMsRUFBRSwrQkFBK0IsQ0FBQztnQ0FDeEYsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxxQ0FBcUMsRUFBRSxpREFBaUQsQ0FBQzs0QkFDckcsUUFBUSxFQUFFLGFBQWEsQ0FBQyxhQUFhO3lCQUNyQzt3QkFDRCxHQUFHLEVBQUUsS0FBSyxJQUFJLEVBQUU7NEJBQ2YsSUFBSSxDQUFDLHVCQUF1QixDQUFDLG1CQUFtQixDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUM7Z0NBQy9ELE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUM7b0NBQzlDLElBQUksRUFBRSxRQUFRLENBQUMsT0FBTztvQ0FDdEIsT0FBTyxFQUFFLFFBQVEsQ0FBQyx1Q0FBdUMsRUFBRSwwQkFBMEIsQ0FBQztvQ0FDdEYsT0FBTyxFQUFFO3dDQUNSOzRDQUNDLEtBQUssRUFBRSxRQUFRLENBQUMseUNBQXlDLEVBQUUsUUFBUSxDQUFDOzRDQUNwRSxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUMsSUFBSTt5Q0FDZjt3Q0FDRDs0Q0FDQyxLQUFLLEVBQUUsUUFBUSxDQUFDLHdDQUF3QyxFQUFFLFFBQVEsQ0FBQzs0Q0FDbkUsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDLEtBQUs7eUNBQ2hCO3FDQUNEO29DQUNELE1BQU0sRUFBRTt3Q0FDUCxJQUFJLEVBQUUsT0FBTyxDQUFDLE9BQU87d0NBQ3JCLGVBQWUsRUFBRSxDQUFDO2dEQUNqQixRQUFRLEVBQUUsSUFBSSxjQUFjLENBQUMsUUFBUSxDQUFDLHdDQUF3QyxFQUFFLDBKQUEwSixDQUFDLENBQUM7NkNBQzVPLENBQUM7cUNBQ0Y7aUNBQ0QsQ0FBQyxDQUFDO2dDQUNILElBQUksTUFBTSxDQUFDLE1BQU0sS0FBSyxJQUFJLEVBQUUsQ0FBQztvQ0FDNUIsT0FBTztnQ0FDUixDQUFDO2dDQUNELGFBQWEsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUMsV0FBVyxDQUFDLENBQUM7NEJBQ3BELENBQUM7NEJBQ0QsUUFBUSxDQUFDLGtCQUFrQixDQUFDLG1CQUFtQixDQUFDLFdBQVcsQ0FBQyxDQUFDOzRCQUM3RCxJQUFJLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQ0FDbEIsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7NEJBQ2hDLENBQUM7d0JBQ0YsQ0FBQztxQkFDcUM7aUJBQ3ZDLENBQUM7Z0JBQ0YsSUFBSSxrQkFBa0IsRUFBRSxFQUFFLENBQUM7b0JBQzFCLE9BQU8sQ0FBQyxJQUFJLENBQUM7d0JBQ1osR0FBRyxNQUFNO3dCQUNULEVBQUUsRUFBRSw0QkFBNEI7d0JBQ2hDLEtBQUssRUFBRSxRQUFRLENBQUMsdUJBQXVCLEVBQUUscUJBQXFCLENBQUM7d0JBQy9ELFdBQVcsRUFBRSxRQUFRLENBQUMsK0JBQStCLEVBQUUsNENBQTRDLENBQUM7d0JBQ3BHLElBQUksRUFBRSxTQUFTLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO3dCQUN6QyxPQUFPLEVBQUUsWUFBWSxLQUFLLG1CQUFtQixDQUFDLFNBQVM7d0JBQ3ZELE9BQU8sRUFBRSxDQUFDLGdCQUFnQjt3QkFDMUIsT0FBTyxFQUFFLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsc0NBQXNDLEVBQUUsK0JBQStCLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRTt3QkFDbEgsS0FBSyxFQUFFOzRCQUNOLE9BQU8sRUFBRSxnQkFBZ0I7Z0NBQ3hCLENBQUMsQ0FBQyxRQUFRLENBQUMseUNBQXlDLEVBQUUsK0JBQStCLENBQUM7Z0NBQ3RGLENBQUMsQ0FBQyxRQUFRLENBQUMsbUNBQW1DLEVBQUUsaUVBQWlFLENBQUM7NEJBQ25ILFFBQVEsRUFBRSxhQUFhLENBQUMsYUFBYTt5QkFDckM7d0JBQ0QsR0FBRyxFQUFFLEtBQUssSUFBSSxFQUFFOzRCQUNmLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxtQkFBbUIsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDO2dDQUM3RCxNQUFNLE1BQU0sR0FBRyxNQUFNLElBQUksQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDO29DQUM5QyxJQUFJLEVBQUUsUUFBUSxDQUFDLE9BQU87b0NBQ3RCLE9BQU8sRUFBRSxRQUFRLENBQUMscUNBQXFDLEVBQUUsbUJBQW1CLENBQUM7b0NBQzdFLE9BQU8sRUFBRTt3Q0FDUjs0Q0FDQyxLQUFLLEVBQUUsUUFBUSxDQUFDLHVDQUF1QyxFQUFFLFFBQVEsQ0FBQzs0Q0FDbEUsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUk7eUNBQ2Y7d0NBQ0Q7NENBQ0MsS0FBSyxFQUFFLFFBQVEsQ0FBQyxzQ0FBc0MsRUFBRSxRQUFRLENBQUM7NENBQ2pFLEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQyxLQUFLO3lDQUNoQjtxQ0FDRDtvQ0FDRCxNQUFNLEVBQUU7d0NBQ1AsSUFBSSxFQUFFLE9BQU8sQ0FBQyxNQUFNO3dDQUNwQixlQUFlLEVBQUUsQ0FBQztnREFDakIsUUFBUSxFQUFFLElBQUksY0FBYyxDQUFDLFFBQVEsQ0FBQyxzQ0FBc0MsRUFBRSwyV0FBMlcsQ0FBQyxDQUFDOzZDQUMzYixDQUFDO3FDQUNGO2lDQUNELENBQUMsQ0FBQztnQ0FDSCxJQUFJLE1BQU0sQ0FBQyxNQUFNLEtBQUssSUFBSSxFQUFFLENBQUM7b0NBQzVCLE9BQU87Z0NBQ1IsQ0FBQztnQ0FDRCxhQUFhLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDLFNBQVMsQ0FBQyxDQUFDOzRCQUNsRCxDQUFDOzRCQUNELFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQyxtQkFBbUIsQ0FBQyxTQUFTLENBQUMsQ0FBQzs0QkFDM0QsSUFBSSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7Z0NBQ2xCLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDOzRCQUNoQyxDQUFDO3dCQUNGLENBQUM7cUJBQ3FDLENBQUMsQ0FBQztnQkFDMUMsQ0FBQztnQkFDRCxPQUFPLE9BQU8sQ0FBQztZQUNoQixDQUFDO1NBQ0QsQ0FBQztRQUVGLEtBQUssQ0FBQyxNQUFNLEVBQUU7WUFDYixjQUFjO1lBQ2QsZ0JBQWdCLEVBQUUsQ0FBQztvQkFDbEIsRUFBRSxFQUFFLDRCQUE0QjtvQkFDaEMsS0FBSyxFQUFFLFFBQVEsQ0FBQyx1QkFBdUIsRUFBRSw4QkFBOEIsQ0FBQztvQkFDeEUsT0FBTyxFQUFFLFFBQVEsQ0FBQyx1QkFBdUIsRUFBRSw4QkFBOEIsQ0FBQztvQkFDMUUsS0FBSyxFQUFFLFNBQVM7b0JBQ2hCLE9BQU8sRUFBRSxJQUFJO29CQUNiLEdBQUcsRUFBRSxLQUFLLElBQUksRUFBRTt3QkFDZixNQUFNLGFBQWEsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxrRkFBa0YsQ0FBQyxDQUFDLENBQUM7b0JBQ3pILENBQUM7aUJBQ0QsQ0FBQztZQUNGLFFBQVEsRUFBRSxFQUFFLEVBQUUsRUFBRSxzQkFBc0IsRUFBRSxJQUFJLEVBQUUsc0JBQXNCLEVBQUUsY0FBYyxFQUFFLElBQUksRUFBRTtZQUM1RixXQUFXLEVBQUUsRUFBRSxnQkFBZ0IsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLEdBQUcsRUFBRTtTQUN0RCxFQUFFLGFBQWEsRUFBRSxtQkFBbUIsRUFBRSxpQkFBaUIsRUFBRSxpQkFBaUIsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO1FBeko5RSxhQUFRLEdBQVIsUUFBUSxDQUEyQjtRQU9uQixrQkFBYSxHQUFiLGFBQWEsQ0FBZ0I7SUFtSi9ELENBQUM7SUFFa0IsV0FBVyxDQUFDLE9BQW9CO1FBQ2xELElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUVyQyxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLHNCQUFzQixDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQ3pELElBQUksSUFBZSxDQUFDO1FBQ3BCLElBQUksS0FBYSxDQUFDO1FBQ2xCLFFBQVEsS0FBSyxFQUFFLENBQUM7WUFDZixLQUFLLG1CQUFtQixDQUFDLFNBQVM7Z0JBQ2pDLElBQUksR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDO2dCQUN0QixLQUFLLEdBQUcsUUFBUSxDQUFDLDZCQUE2QixFQUFFLHFCQUFxQixDQUFDLENBQUM7Z0JBQ3ZFLE1BQU07WUFDUCxLQUFLLG1CQUFtQixDQUFDLFdBQVc7Z0JBQ25DLElBQUksR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDO2dCQUN2QixLQUFLLEdBQUcsUUFBUSxDQUFDLCtCQUErQixFQUFFLGtCQUFrQixDQUFDLENBQUM7Z0JBQ3RFLE1BQU07WUFDUDtnQkFDQyxJQUFJLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQztnQkFDdEIsS0FBSyxHQUFHLFFBQVEsQ0FBQywyQkFBMkIsRUFBRSxtQkFBbUIsQ0FBQyxDQUFDO2dCQUNuRSxNQUFNO1FBQ1IsQ0FBQztRQUVELE1BQU0sYUFBYSxHQUFHLEVBQUUsQ0FBQztRQUN6QixhQUFhLENBQUMsSUFBSSxDQUFDLEdBQUcsb0JBQW9CLENBQUMsS0FBSyxJQUFJLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQzdELGFBQWEsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyw4QkFBOEIsRUFBRSxTQUFTLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUM1RSxhQUFhLENBQUMsSUFBSSxDQUFDLEdBQUcsb0JBQW9CLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDO1FBRS9ELEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLEdBQUcsYUFBYSxDQUFDLENBQUM7UUFDckMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsU0FBUyxFQUFFLEtBQUssS0FBSyxtQkFBbUIsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUM3RSxPQUFPLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsS0FBSyxLQUFLLG1CQUFtQixDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQzVFLE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUVNLE9BQU87UUFDYixJQUFJLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNsQixJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNoQyxDQUFDO0lBQ0YsQ0FBQztDQUNELENBQUE7QUFwTVksMEJBQTBCO0lBS3BDLFdBQUEsb0JBQW9CLENBQUE7SUFDcEIsV0FBQSxrQkFBa0IsQ0FBQTtJQUNsQixXQUFBLGtCQUFrQixDQUFBO0lBQ2xCLFdBQUEsaUJBQWlCLENBQUE7SUFDakIsV0FBQSxxQkFBcUIsQ0FBQTtJQUNyQixXQUFBLGNBQWMsQ0FBQTtJQUNkLFdBQUEsY0FBYyxDQUFBO0dBWEosMEJBQTBCLENBb010QyJ9
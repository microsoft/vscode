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
import { coalesce } from '../../../../../../base/common/arrays.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { groupBy } from '../../../../../../base/common/collections.js';
import { autorun, observableValue } from '../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { getFlatActionBarActions } from '../../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenuService, MenuId } from '../../../../../../platform/actions/common/actions.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { IChatAgentService } from '../../../common/participants/chatAgents.js';
import { ChatMode, IChatModeService } from '../../../common/chatModes.js';
import { isOrganizationPromptFile } from '../../../common/promptSyntax/utils/promptsServiceUtils.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../../../common/constants.js';
import { PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { Target } from '../../../common/promptSyntax/promptTypes.js';
import { getOpenChatActionIdForMode } from '../../actions/chatActions.js';
import { ToggleAgentModeActionId } from '../../actions/chatExecuteActions.js';
import { ChatInputPickerActionViewItem } from './chatInputPickerActionItem.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IWorkbenchAssignmentService } from '../../../../../services/assignment/common/assignmentService.js';
// TODO: there should be an icon contributed for built-in modes
const builtinDefaultIcon = (mode) => {
    switch (mode.name.get().toLowerCase()) {
        case 'ask': return Codicon.ask;
        case 'edit': return Codicon.edit;
        case 'plan': return Codicon.tasklist;
        default: return undefined;
    }
};
let ModePickerActionItem = class ModePickerActionItem extends ChatInputPickerActionViewItem {
    constructor(action, delegate, pickerOptions, actionWidgetService, chatAgentService, keybindingService, configurationService, contextKeyService, chatModeService, menuService, commandService, _productService, telemetryService, openerService, assignmentService) {
        const assignments = observableValue('modePickerAssignments', { showOldAskMode: false });
        // Get custom agent target (if filtering is enabled)
        const customAgentTarget = delegate.customAgentTarget?.() ?? Target.Undefined;
        // Category definitions
        const builtInCategory = { label: localize('built-in', "Built-In"), order: 0 };
        const customCategory = { label: localize('custom', "Custom"), order: 1 };
        const policyDisabledCategory = { label: localize('managedByOrganization', "Managed by your organization"), order: 999, showHeader: true };
        const agentModeDisabledViaPolicy = configurationService.inspect(ChatConfiguration.AgentEnabled).policyValue === false;
        const makeAction = (mode, currentMode) => {
            const isDisabledViaPolicy = mode.kind === ChatModeKind.Agent &&
                agentModeDisabledViaPolicy;
            const tooltip = chatAgentService.getDefaultAgent(ChatAgentLocation.Chat, mode.kind)?.description ?? action.tooltip;
            // Add toolbar actions for Agent modes
            const toolbarActions = [];
            if (mode.kind === ChatModeKind.Agent && !isDisabledViaPolicy) {
                if (mode.uri) {
                    let label, icon, id;
                    if (mode.source?.storage === PromptsStorage.extension) {
                        icon = Codicon.file;
                        id = `viewAgent:${mode.id}`;
                        label = localize('viewModeConfiguration', "View {0} agent", mode.label.get());
                    }
                    else {
                        icon = Codicon.edit;
                        id = `editAgent:${mode.id}`;
                        label = localize('editModeConfiguration', "Edit {0} agent", mode.label.get());
                    }
                    const modeResource = mode.uri;
                    toolbarActions.push({
                        id,
                        label,
                        tooltip: label,
                        class: ThemeIcon.asClassName(icon),
                        enabled: true,
                        run: async () => {
                            openerService.open(modeResource.get());
                        }
                    });
                }
            }
            return {
                ...action,
                id: getOpenChatActionIdForMode(mode),
                label: mode.label.get(),
                icon: isDisabledViaPolicy ? ThemeIcon.fromId(Codicon.lock.id) : mode.icon.get(),
                class: isDisabledViaPolicy ? 'disabled-by-policy' : undefined,
                enabled: !isDisabledViaPolicy,
                checked: !isDisabledViaPolicy && currentMode.id === mode.id,
                tooltip: '',
                hover: { content: tooltip, position: this.pickerOptions.hoverPosition },
                toolbarActions,
                run: async () => {
                    if (isDisabledViaPolicy) {
                        return; // Block interaction if disabled by policy
                    }
                    const result = await commandService.executeCommand(ToggleAgentModeActionId, { modeId: mode.id, sessionResource: this.delegate.sessionResource() });
                    if (this.element) {
                        this.renderLabel(this.element);
                    }
                    return result;
                },
                category: isDisabledViaPolicy ? policyDisabledCategory : builtInCategory
            };
        };
        const makeActionFromCustomMode = (mode, currentMode) => {
            return {
                ...makeAction(mode, currentMode),
                tooltip: '',
                hover: { content: mode.description.get() ?? chatAgentService.getDefaultAgent(ChatAgentLocation.Chat, mode.kind)?.description ?? action.tooltip, position: this.pickerOptions.hoverPosition },
                icon: mode.icon.get() ?? (isModeConsideredBuiltIn(mode, this._productService) ? builtinDefaultIcon(mode) : undefined),
                category: agentModeDisabledViaPolicy ? policyDisabledCategory : customCategory
            };
        };
        const actionProviderWithCustomAgentTarget = {
            getActions: () => {
                const modes = chatModeService.getModes();
                const currentMode = delegate.currentMode.get();
                const filteredCustomModes = modes.custom.filter(mode => {
                    const target = mode.target.get();
                    return target === customAgentTarget || target === Target.Undefined;
                });
                const customModes = groupBy(filteredCustomModes, mode => isModeConsideredBuiltIn(mode, this._productService) ? 'builtin' : 'custom');
                // Always include the default "Agent" option first
                const checked = currentMode.id === ChatMode.Agent.id;
                const defaultAction = { ...makeAction(ChatMode.Agent, ChatMode.Agent), checked };
                defaultAction.category = builtInCategory;
                const builtInActions = customModes.builtin?.map(mode => {
                    const action = makeActionFromCustomMode(mode, currentMode);
                    action.category = builtInCategory;
                    return action;
                }) ?? [];
                // Add filtered custom modes
                const customActions = customModes.custom?.map(mode => makeActionFromCustomMode(mode, currentMode)) ?? [];
                return [defaultAction, ...builtInActions, ...customActions];
            }
        };
        const actionProvider = {
            getActions: () => {
                const modes = chatModeService.getModes();
                const currentMode = delegate.currentMode.get();
                const agentMode = modes.builtin.find(mode => mode.id === ChatMode.Agent.id);
                const otherBuiltinModes = modes.builtin.filter(mode => {
                    return mode.id !== ChatMode.Agent.id && shouldShowBuiltInMode(mode, assignments.get(), agentModeDisabledViaPolicy);
                });
                const filteredCustomModes = modes.custom.filter(mode => {
                    if (isModeConsideredBuiltIn(mode, this._productService)) {
                        return shouldShowBuiltInMode(mode, assignments.get(), agentModeDisabledViaPolicy);
                    }
                    return true;
                });
                // Filter out 'implement' mode from the dropdown - it's available for handoffs but not user-selectable
                const customModes = groupBy(filteredCustomModes, mode => isModeConsideredBuiltIn(mode, this._productService) ? 'builtin' : 'custom');
                const customBuiltinModeActions = customModes.builtin?.map(mode => {
                    const action = makeActionFromCustomMode(mode, currentMode);
                    action.category = agentModeDisabledViaPolicy ? policyDisabledCategory : builtInCategory;
                    return action;
                }) ?? [];
                customBuiltinModeActions.sort((a, b) => a.label.localeCompare(b.label));
                const customModeActions = customModes.custom?.map(mode => makeActionFromCustomMode(mode, currentMode)) ?? [];
                customModeActions.sort((a, b) => a.label.localeCompare(b.label));
                const orderedModes = coalesce([
                    agentMode && makeAction(agentMode, currentMode),
                    ...otherBuiltinModes.map(mode => mode && makeAction(mode, currentMode)),
                    ...customBuiltinModeActions,
                    ...customModeActions
                ]);
                return orderedModes;
            }
        };
        const modePickerActionWidgetOptions = {
            actionProvider: customAgentTarget !== Target.Undefined ? actionProviderWithCustomAgentTarget : actionProvider,
            actionBarActionProvider: {
                getActions: () => this.getModePickerActionBarActions()
            },
            showItemKeybindings: true,
            reporter: { id: 'ChatModePicker', name: 'ChatModePicker', includeOptions: true },
        };
        super(action, modePickerActionWidgetOptions, pickerOptions, actionWidgetService, keybindingService, contextKeyService, telemetryService);
        this.delegate = delegate;
        this.contextKeyService = contextKeyService;
        this.menuService = menuService;
        this._productService = _productService;
        // Listen to changes in the current mode and its properties
        this._register(autorun(reader => {
            this.delegate.currentMode.read(reader).label.read(reader); // use the reader so autorun tracks it
            if (this.element) {
                this.renderLabel(this.element);
            }
        }));
        assignmentService.getTreatment('chat.showOldAskMode').then(showOldAskMode => {
            assignments.set({ showOldAskMode: showOldAskMode === 'enabled' }, undefined);
        });
        this._register(assignmentService.onDidRefetchAssignments(async () => {
            assignments.set({ showOldAskMode: await assignmentService.getTreatment('chat.showOldAskMode') === 'enabled' }, undefined);
        }));
    }
    getModePickerActionBarActions() {
        const menuActions = this.menuService.createMenu(MenuId.ChatModePicker, this.contextKeyService);
        const menuContributions = getFlatActionBarActions(menuActions.getActions({ renderShortTitle: true }));
        menuActions.dispose();
        return menuContributions;
    }
    render(container) {
        super.render(container);
        container.classList.add('chat-mode-picker-item');
    }
    renderLabel(element) {
        this.setAriaLabelAttributes(element);
        const currentMode = this.delegate.currentMode.get();
        const state = currentMode.label.get();
        let icon = currentMode.icon.get();
        // Every built-in mode should have an icon. // TODO: this should be provided by the mode itself
        if (!icon && isModeConsideredBuiltIn(currentMode, this._productService)) {
            icon = builtinDefaultIcon(currentMode);
        }
        const labelElements = [];
        const collapsed = this.pickerOptions.hideChevrons.get();
        if (icon) {
            labelElements.push(...renderLabelWithIcons(`$(${icon.id})`));
        }
        if (!collapsed || !icon) {
            labelElements.push(dom.$('span.chat-input-picker-label', undefined, state));
        }
        if (!collapsed) {
            labelElements.push(...renderLabelWithIcons(`$(chevron-down)`));
        }
        dom.reset(element, ...labelElements);
        return null;
    }
};
ModePickerActionItem = __decorate([
    __param(3, IActionWidgetService),
    __param(4, IChatAgentService),
    __param(5, IKeybindingService),
    __param(6, IConfigurationService),
    __param(7, IContextKeyService),
    __param(8, IChatModeService),
    __param(9, IMenuService),
    __param(10, ICommandService),
    __param(11, IProductService),
    __param(12, ITelemetryService),
    __param(13, IOpenerService),
    __param(14, IWorkbenchAssignmentService)
], ModePickerActionItem);
export { ModePickerActionItem };
function isModeConsideredBuiltIn(mode, productService) {
    if (mode.isBuiltin) {
        return true;
    }
    // Not built-in if not from the built-in chat extension
    if (mode.source?.storage !== PromptsStorage.extension) {
        return false;
    }
    const chatExtensionId = productService.defaultChatAgent?.chatExtensionId;
    if (!chatExtensionId || mode.source.extensionId.value !== chatExtensionId) {
        return false;
    }
    // Organization-provided agents (under /github/ path) are also not considered built-in
    const modeUri = mode.uri?.get();
    if (!modeUri) {
        // If somehow there is no URI, but it's from the built-in chat extension, consider it built-in
        return true;
    }
    return !isOrganizationPromptFile(modeUri, mode.source.extensionId, productService);
}
function shouldShowBuiltInMode(mode, assignments, agentModeDisabledViaPolicy) {
    // The built-in "Edit" mode is deprecated, but still supported for older conversations and agent disablement.
    if (mode.id === ChatMode.Edit.id || mode.name.get().toLowerCase() === 'edit') {
        if (mode.id === ChatMode.Edit.id) {
            return agentModeDisabledViaPolicy;
        }
        else {
            return !agentModeDisabledViaPolicy;
        }
    }
    // The "Ask" mode is a special case - we want to show either the old or new version based on the assignment or agent disablement, but not both
    // We still support the old "Ask" mode for conversations that already use it.
    if (mode.id === ChatMode.Ask.id || mode.name.get().toLowerCase() === 'ask') {
        if (mode.id === ChatMode.Ask.id) {
            return assignments.showOldAskMode || agentModeDisabledViaPolicy;
        }
        else {
            return !(assignments.showOldAskMode || agentModeDisabledViaPolicy);
        }
    }
    return true;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kZVBpY2tlckFjdGlvbkl0ZW0uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2lucHV0L21vZGVQaWNrZXJBY3Rpb25JdGVtLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sdUNBQXVDLENBQUM7QUFDN0QsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFFakcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFFdkUsT0FBTyxFQUFFLE9BQU8sRUFBZSxlQUFlLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUNwRyxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFFdkUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3BELE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHVFQUF1RSxDQUFDO0FBQ2hILE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxFQUFrQixNQUFNLHNEQUFzRCxDQUFDO0FBQzVHLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGlFQUFpRSxDQUFDO0FBRXZHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUN6RixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUN6RyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNoRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw0REFBNEQs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
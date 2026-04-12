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
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { FocusedViewContext, SidebarFocusContext } from '../../../common/contextkeys.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { HISTORY_VIEW_PANE_ID, ISCMViewService, REPOSITORIES_VIEW_PANE_ID, VIEW_PANE_ID } from '../common/scm.js';
export class SCMAccessibilityHelp {
    constructor() {
        this.name = 'scm';
        this.type = "help" /* AccessibleViewType.Help */;
        this.priority = 100;
        this.when = ContextKeyExpr.or(ContextKeyExpr.and(ContextKeyExpr.equals('activeViewlet', 'workbench.view.scm'), SidebarFocusContext), ContextKeyExpr.equals(FocusedViewContext.key, REPOSITORIES_VIEW_PANE_ID), ContextKeyExpr.equals(FocusedViewContext.key, VIEW_PANE_ID), ContextKeyExpr.equals(FocusedViewContext.key, HISTORY_VIEW_PANE_ID));
    }
    getProvider(accessor) {
        const commandService = accessor.get(ICommandService);
        const scmViewService = accessor.get(ISCMViewService);
        const viewsService = accessor.get(IViewsService);
        return new SCMAccessibilityHelpContentProvider(commandService, scmViewService, viewsService);
    }
}
let SCMAccessibilityHelpContentProvider = class SCMAccessibilityHelpContentProvider extends Disposable {
    constructor(_commandService, _scmViewService, _viewsService) {
        super();
        this._commandService = _commandService;
        this._scmViewService = _scmViewService;
        this._viewsService = _viewsService;
        this.id = "scm" /* AccessibleViewProviderId.SourceControl */;
        this.verbositySettingKey = "accessibility.verbosity.sourceControl" /* AccessibilityVerbositySettingId.SourceControl */;
        this.options = { type: "help" /* AccessibleViewType.Help */ };
        this._focusedView = this._viewsService.getFocusedViewName();
    }
    onClose() {
        switch (this._focusedView) {
            case 'Source Control':
                this._commandService.executeCommand('workbench.scm');
                break;
            case 'Source Control Repositories':
                this._commandService.executeCommand('workbench.scm.repositories');
                break;
            case 'Source Control Graph':
                this._commandService.executeCommand('workbench.scm.history');
                break;
            default:
                this._commandService.executeCommand('workbench.view.scm');
        }
    }
    provideContent() {
        const content = [];
        // Active Repository State
        if (this._scmViewService.visibleRepositories.length > 1) {
            const repositoryList = this._scmViewService.visibleRepositories.map(r => r.provider.name).join(', ');
            content.push(localize('state-msg1', "Visible repositories: {0}", repositoryList));
        }
        const focusedRepository = this._scmViewService.focusedRepository;
        if (focusedRepository) {
            content.push(localize('state-msg2', "Repository: {0}", focusedRepository.provider.name));
            // History Item Reference
            const currentHistoryItemRef = focusedRepository.provider.historyProvider.get()?.historyItemRef.get();
            if (currentHistoryItemRef) {
                content.push(localize('state-msg3', "History item reference: {0}", currentHistoryItemRef.name));
            }
            // Commit Message
            if (focusedRepository.input.visible && focusedRepository.input.enabled && focusedRepository.input.value !== '') {
                content.push(localize('state-msg4', "Commit message: {0}", focusedRepository.input.value));
            }
            // Action Button
            const actionButton = focusedRepository.provider.actionButton.get();
            if (actionButton) {
                const label = actionButton.command.tooltip ?? actionButton.command.title;
                const enablementLabel = actionButton.enabled ? localize('enabled', "enabled") : localize('disabled', "disabled");
                content.push(localize('state-msg5', "Action button: {0}, {1}", label, enablementLabel));
            }
            // Resource Groups
            const resourceGroups = [];
            for (const resourceGroup of focusedRepository.provider.groups) {
                resourceGroups.push(`${resourceGroup.label} (${resourceGroup.resources.length} resource(s))`);
            }
            focusedRepository.provider.groups.map(g => g.label).join(', ');
            content.push(localize('state-msg6', "Resource groups: {0}", resourceGroups.join(', ')));
        }
        // Source Control Repositories
        content.push(localize('scm-repositories-msg1', "Use the \"Source Control: Focus on Source Control Repositories View\" command to open the Source Control Repositories view."));
        content.push(localize('scm-repositories-msg2', "The Source Control Repositories view lists all repositories from the workspace and is only shown when the workspace contains more than one repository."));
        content.push(localize('scm-repositories-msg3', "Once the Source Control Repositories view is opened you can:"));
        content.push(localize('scm-repositories-msg4', " - Use the up/down arrow keys to navigate the list of repositories."));
        content.push(localize('scm-repositories-msg5', " - Use the Enter or Space keys to select a repository."));
        content.push(localize('scm-repositories-msg6', " - Use Shift + up/down keys to select multiple repositories."));
        // Source Control
        content.push(localize('scm-msg1', "Use the \"Source Control: Focus on Source Control View\" command to open the Source Control view."));
        content.push(localize('scm-msg2', "The Source Control view displays the resource groups and resources of the repository. If the workspace contains more than one repository it will list the resource groups and resources of the repositories selected in the Source Control Repositories view."));
        content.push(localize('scm-msg3', "Once the Source Control view is opened you can:"));
        content.push(localize('scm-msg4', " - Use the up/down arrow keys to navigate the list of repositories, resource groups and resources."));
        content.push(localize('scm-msg5', " - Use the Space key to expand or collapse a resource group."));
        // Source Control Graph
        content.push(localize('scm-graph-msg1', "Use the \"Source Control: Focus on Source Control Graph View\" command to open the Source Control Graph view."));
        content.push(localize('scm-graph-msg2', "The Source Control Graph view displays a graph history items of the repository. If the workspace contains more than one repository it will list the history items of the active repository."));
        content.push(localize('scm-graph-msg3', "Once the Source Control Graph view is opened you can:"));
        content.push(localize('scm-graph-msg4', " - Use the up/down arrow keys to navigate the list of history items."));
        content.push(localize('scm-graph-msg5', " - Use the Space key to open the history item details in the multi-file diff editor."));
        return content.join('\n');
    }
};
SCMAccessibilityHelpContentProvider = __decorate([
    __param(0, ICommandService),
    __param(1, ISCMViewService),
    __param(2, IViewsService)
], SCMAccessibilityHelpContentProvider);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NtQWNjZXNzaWJpbGl0eUhlbHAuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9zY20vYnJvd3Nlci9zY21BY2Nlc3NpYmlsaXR5SGVscC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBRzlDLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNuRixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFFdEYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLG1CQUFtQixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDekYsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBRS9FLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxlQUFlLEVBQUUseUJBQXlCLEVBQUUsWUFBWSxFQUFFLE1BQU0sa0JBQWtCLENBQUM7QUFFbEgsTUFBTSxPQUFPLG9CQUFvQjtJQUFqQztRQUNVLFNBQUksR0FBRyxLQUFLLENBQUM7UUFDYixTQUFJLHdDQUEyQjtRQUMvQixhQUFRLEdBQUcsR0FBRyxDQUFDO1FBQ2YsU0FBSSxHQUFHLGNBQWMsQ0FBQyxFQUFFLENBQ2hDLGNBQWMsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxlQUFlLEVBQUUsb0JBQW9CLENBQUMsRUFBRSxtQkFBbUIsQ0FBQyxFQUNyRyxjQUFjLENBQUMsTUFBTSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSx5QkFBeUIsQ0FBQyxFQUN4RSxjQUFjLENBQUMsTUFBTSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxZQUFZLENBQUMsRUFD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
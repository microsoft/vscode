/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { AccessibleViewType, AccessibleContentProvider, IAccessibleViewContentProvider, AccessibleViewProviderId } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { FocusedViewContext, SidebarFocusContext } from '../../../common/contextkeys.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { HISTORY_VIEW_PANE_ID, ISCMViewService, REPOSITORIES_VIEW_PANE_ID, VIEW_PANE_ID } from '../common/scm.js';

export class SCMAccessibilityHelp implements IAccessibleViewImplementation {
	readonly name = 'scm';
	readonly type = AccessibleViewType.Help;
	readonly priority = 100;
	readonly when = ContextKeyExpr.or(
		ContextKeyExpr.and(ContextKeyExpr.equals('activeViewlet', 'workbench.view.scm'), SidebarFocusContext),
		ContextKeyExpr.equals(FocusedViewContext.key, REPOSITORIES_VIEW_PANE_ID),
		ContextKeyExpr.equals(FocusedViewContext.key, VIEW_PANE_ID),
		ContextKeyExpr.equals(FocusedViewContext.key, HISTORY_VIEW_PANE_ID)
	);

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider {
		const commandService = accessor.get(ICommandService);
		const scmViewService = accessor.get(ISCMViewService);
		const viewsService = accessor.get(IViewsService);

		return new SCMAccessibilityHelpContentProvider(commandService, scmViewService, viewsService);
	}
}

class SCMAccessibilityHelpContentProvider extends Disposable implements IAccessibleViewContentProvider {
	readonly id = AccessibleViewProviderId.SourceControl;
	readonly verbositySettingKey = AccessibilityVerbositySettingId.SourceControl;
	readonly options = { type: AccessibleViewType.Help };

	private _focusedView: string | undefined;

	constructor(
		@ICommandService private readonly _commandService: ICommandService,
		@ISCMViewService private readonly _scmViewService: ISCMViewService,
		@IViewsService private readonly _viewsService: IViewsService
	) {
		super();
		this._focusedView = this._viewsService.getFocusedViewName();
	}

	onClose(): void {
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

	provideContent(): string {
		const content: string[] = [];

		// Active Repository State
		if (this._scmViewService.visibleRepositories.length > 1) {
			const repositoryList = this._scmViewService.visibleRepositories.map(r => r.provider.name).join(', ');
			content.push(localize('state-msg1', "Visible repositories: {0}", repositoryList));
		}

		const activeRepository = this._scmViewService.activeRepository.get();
		if (activeRepository) {
			content.push(localize('state-msg2', "Repository: {0}", activeRepository.provider.name));

			// History Item Reference
			const currentHistoryItemRef = activeRepository.provider.historyProvider.get()?.historyItemRef.get();
			if (currentHistoryItemRef) {
				content.push(localize('state-msg3', "History item reference: {0}", currentHistoryItemRef.name));
			}

			// Commit Message
			if (activeRepository.input.visible && activeRepository.input.enabled && activeRepository.input.value !== '') {
				content.push(localize('state-msg4', "Commit message: {0}", activeRepository.input.value));
			}

			// Action Button
			const actionButton = activeRepository.provider.actionButton.get();
			if (actionButton) {
				const label = actionButton.command.tooltip ?? actionButton.command.title;
				const enablementLabel = actionButton.enabled ? localize('enabled', "enabled") : localize('disabled', "disabled");
				content.push(localize('state-msg5', "Action button: {0}, {1}", label, enablementLabel));
			}

			// Resource Groups
			const resourceGroups: string[] = [];
			for (const resourceGroup of activeRepository.provider.groups) {
				resourceGroups.push(`${resourceGroup.label} (${resourceGroup.resources.length} resource(s))`);
			}

			activeRepository.provider.groups.map(g => g.label).join(', ');
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
}

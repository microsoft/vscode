/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from 'vs/platform/registry/common/platform';
import * as nls from 'vs/nls';
import product from 'vs/platform/product/node/product';
import { SyncActionDescriptor, ICommandAction, MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { IWorkbenchActionRegistry, Extensions } from 'vs/workbench/common/actions';
import { ReportPerformanceIssueUsingReporterAction, OpenProcessExplorer } from 'vs/workbench/contrib/issue/electron-browser/issueActions';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IWorkbenchIssueService } from 'vs/workbench/contrib/issue/electron-browser/issue';
import { WorkbenchIssueService } from 'vs/workbench/contrib/issue/electron-browser/issueService';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IIssueService } from 'vs/platform/issue/node/issue';

const helpCategory = { value: nls.localize('help', "Help"), original: 'Help' };
const workbenchActionsRegistry = Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions);

if (!!product.reportIssueUrl) {
	workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(ReportPerformanceIssueUsingReporterAction, ReportPerformanceIssueUsingReporterAction.ID, ReportPerformanceIssueUsingReporterAction.LABEL), 'Help: Report Performance Issue', helpCategory.value);

	const OpenIssueReporterActionId = 'workbench.action.openIssueReporter';
	const OpenIssueReporterActionLabel = nls.localize({ key: 'reportIssueInEnglish', comment: ['Translate this to "Report Issue in English" in all languages please!'] }, "Report Issue");

	CommandsRegistry.registerCommand(OpenIssueReporterActionId, function (accessor, args?: [string]) {
		let extensionId: string | undefined;
		if (args && Array.isArray(args)) {
			[extensionId] = args;
		}

		return accessor.get(IWorkbenchIssueService).openReporter({ extensionId });
	});

	const command: ICommandAction = {
		id: OpenIssueReporterActionId,
		title: { value: OpenIssueReporterActionLabel, original: 'Report Issue' },
		category: helpCategory
	};

	MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command });
}

const developerCategory = nls.localize('developer', "Developer");
workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(OpenProcessExplorer, OpenProcessExplorer.ID, OpenProcessExplorer.LABEL), 'Developer: Open Process Explorer', developerCategory);

registerSingleton(IWorkbenchIssueService, WorkbenchIssueService, true);

CommandsRegistry.registerCommand('_issues.getSystemStatus', (accessor) => {
	return accessor.get(IIssueService).getSystemStatus();
});
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { ICommandAction, MenuId, MenuRegistry } from 'vs/platform/actions/common/actions';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { IProductService } from 'vs/platform/product/common/productService';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { IWebIssueService, WebIssueService } from 'vs/workbench/contrib/issue/browser/issueService';

class RegisterIssueContribution implements IWorkbenchContribution {

	constructor(@IProductService readonly productService: IProductService) {
		if (productService.reportIssueUrl) {
			const helpCategory = { value: nls.localize('help', "Help"), original: 'Help' };
			const OpenIssueReporterActionId = 'workbench.action.openIssueReporter';
			const OpenIssueReporterActionLabel = nls.localize({ key: 'reportIssueInEnglish', comment: ['Translate this to "Report Issue in English" in all languages please!'] }, "Report Issue");

			CommandsRegistry.registerCommand(OpenIssueReporterActionId, function (accessor, args?: [string]) {
				let extensionId: string | undefined;
				if (args && Array.isArray(args)) {
					[extensionId] = args;
				}

				return accessor.get(IWebIssueService).openReporter({ extensionId });
			});

			const command: ICommandAction = {
				id: OpenIssueReporterActionId,
				title: { value: OpenIssueReporterActionLabel, original: 'Report Issue' },
				category: helpCategory
			};

			MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command });
		}
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(RegisterIssueContribution, LifecyclePhase.Starting);

registerSingleton(IWebIssueService, WebIssueService, true);

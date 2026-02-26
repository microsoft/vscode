/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IProcessService } from '../../../../platform/process/common/process.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IQuickAccessRegistry, Extensions as QuickAccessExtensions } from '../../../../platform/quickinput/common/quickAccess.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions, IWorkbenchContributionsRegistry } from '../../../common/contributions.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { IssueQuickAccess } from '../browser/issueQuickAccess.js';
import '../browser/issueTroubleshoot.js';
import { BaseIssueContribution } from '../common/issue.contribution.js';
import { IIssueFormService, IWorkbenchIssueService, IssueType } from '../common/issue.js';
import { NativeIssueService } from './issueService.js';
import { NativeIssueFormService } from './nativeIssueFormService.js';

//#region Issue Contribution
registerSingleton(IWorkbenchIssueService, NativeIssueService, InstantiationType.Delayed);
registerSingleton(IIssueFormService, NativeIssueFormService, InstantiationType.Delayed);

class NativeIssueContribution extends BaseIssueContribution {

	constructor(
		@IProductService productService: IProductService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super(productService, configurationService);

		if (!configurationService.getValue<boolean>('telemetry.feedback.enabled')) {
			return;
		}

		if (productService.reportIssueUrl) {
			this._register(registerAction2(ReportPerformanceIssueUsingReporterAction));
		}

		let disposable: IDisposable | undefined;

		const registerQuickAccessProvider = () => {
			disposable = Registry.as<IQuickAccessRegistry>(QuickAccessExtensions.Quickaccess).registerQuickAccessProvider({
				ctor: IssueQuickAccess,
				prefix: IssueQuickAccess.PREFIX,
				contextKey: 'inReportIssuePicker',
				placeholder: localize('tasksQuickAccessPlaceholder', "Type the name of an extension to report on."),
				helpEntries: [{
					description: localize('openIssueReporter', "Open Issue Reporter"),
					commandId: 'workbench.action.openIssueReporter'
				}]
			});
		};

		this._register(configurationService.onDidChangeConfiguration(e => {
			if (!configurationService.getValue<boolean>('extensions.experimental.issueQuickAccess') && disposable) {
				disposable.dispose();
				disposable = undefined;
			} else if (!disposable) {
				registerQuickAccessProvider();
			}
		}));

		if (configurationService.getValue<boolean>('extensions.experimental.issueQuickAccess')) {
			registerQuickAccessProvider();
		}
	}
}
Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench).registerWorkbenchContribution(NativeIssueContribution, LifecyclePhase.Restored);

class ReportPerformanceIssueUsingReporterAction extends Action2 {

	static readonly ID = 'workbench.action.reportPerformanceIssueUsingReporter';

	constructor() {
		super({
			id: ReportPerformanceIssueUsingReporterAction.ID,
			title: localize2({ key: 'reportPerformanceIssue', comment: [`Here, 'issue' means problem or bug`] }, "Report Performance Issue..."),
			category: Categories.Help,
			f1: true
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const issueService = accessor.get(IWorkbenchIssueService); // later can just get IIssueFormService

		return issueService.openReporter({ issueType: IssueType.PerformanceIssue });
	}
}

CommandsRegistry.registerCommand('_issues.getSystemStatus', (accessor) => {
	return accessor.get(IProcessService).getSystemStatus();
});

// #endregion

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from 'vs/nls';
import { registerAction2, Action2 } from 'vs/platform/actions/common/actions';
import { IWorkbenchIssueService } from 'vs/workbench/contrib/issue/common/issue';
import { BaseIssueContribution } from 'vs/workbench/contrib/issue/common/issue.contribution';
import { IProductService } from 'vs/platform/product/common/productService';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IssueType } from 'vs/platform/issue/common/issue';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IQuickAccessRegistry, Extensions as QuickAccessExtensions } from 'vs/platform/quickinput/common/quickAccess';
import { IssueQuickAccess } from 'vs/workbench/contrib/issue/browser/issueQuickAccess';
import 'vs/workbench/contrib/issue/electron-sandbox/issueMainService';
import 'vs/workbench/contrib/issue/electron-sandbox/issueService';
import 'vs/workbench/contrib/issue/browser/issueTroubleshoot';

//#region Issue Contribution

class NativeIssueContribution extends BaseIssueContribution {

	constructor(
		@IProductService productService: IProductService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super(productService, configurationService);

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

// #endregion

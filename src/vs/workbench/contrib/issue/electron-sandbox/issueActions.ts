/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from 'vs/base/common/actions';
import * as nls from 'vs/nls';
import { IssueType } from 'vs/platform/issue/common/issue';
import { IWorkbenchIssueService } from 'vs/workbench/services/issue/common/issue';

export class OpenProcessExplorer extends Action {
	static readonly ID = 'workbench.action.openProcessExplorer';
	static readonly LABEL = nls.localize('openProcessExplorer', "Open Process Explorer");

	constructor(
		id: string,
		label: string,
		@IWorkbenchIssueService private readonly issueService: IWorkbenchIssueService
	) {
		super(id, label);
	}

	override run(): Promise<void> {
		return this.issueService.openProcessExplorer();
	}
}

export class ReportPerformanceIssueUsingReporterAction extends Action {
	static readonly ID = 'workbench.action.reportPerformanceIssueUsingReporter';
	static readonly LABEL = nls.localize({ key: 'reportPerformanceIssue', comment: [`Here, 'issue' means problem or bug`] }, "Report Performance Issue");

	constructor(
		id: string,
		label: string,
		@IWorkbenchIssueService private readonly issueService: IWorkbenchIssueService
	) {
		super(id, label);
	}

	override run(): Promise<void> {
		return this.issueService.openReporter({ issueType: IssueType.PerformanceIssue });
	}
}

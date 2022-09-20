/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Severity from 'vs/base/common/severity';
import { localize } from 'vs/nls';
import { Action2 } from 'vs/platform/actions/common/actions';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IssueType } from 'vs/platform/issue/common/issue';
import { IIssueService } from 'vs/platform/issue/electron-sandbox/issue';
import { INativeHostService } from 'vs/platform/native/electron-sandbox/native';
import { IProgressService, ProgressLocation } from 'vs/platform/progress/common/progress';
import { CATEGORIES } from 'vs/workbench/common/actions';
import { IWorkbenchIssueService } from 'vs/workbench/services/issue/common/issue';

export class OpenProcessExplorer extends Action2 {

	static readonly ID = 'workbench.action.openProcessExplorer';

	constructor() {
		super({
			id: OpenProcessExplorer.ID,
			title: { value: localize('openProcessExplorer', "Open Process Explorer"), original: 'Open Process Explorer' },
			category: CATEGORIES.Developer,
			f1: true
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const issueService = accessor.get(IWorkbenchIssueService);

		return issueService.openProcessExplorer();
	}
}

export class ReportPerformanceIssueUsingReporterAction extends Action2 {

	static readonly ID = 'workbench.action.reportPerformanceIssueUsingReporter';

	constructor() {
		super({
			id: ReportPerformanceIssueUsingReporterAction.ID,
			title: { value: localize({ key: 'reportPerformanceIssue', comment: [`Here, 'issue' means problem or bug`] }, "Report Performance Issue..."), original: 'Report Performance Issue' },
			category: CATEGORIES.Help,
			f1: true
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const issueService = accessor.get(IWorkbenchIssueService);

		return issueService.openReporter({ issueType: IssueType.PerformanceIssue });
	}
}

export class StopTracing extends Action2 {

	static readonly ID = 'workbench.action.stopTracing';

	constructor() {
		super({
			id: StopTracing.ID,
			title: { value: localize('stopTracing', "Stop Tracing"), original: 'Stop Tracing' },
			category: CATEGORIES.Developer,
			f1: true
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const issueService = accessor.get(IIssueService);
		const environmentService = accessor.get(INativeEnvironmentService);
		const dialogService = accessor.get(IDialogService);
		const nativeHostService = accessor.get(INativeHostService);
		const progressService = accessor.get(IProgressService);

		if (!environmentService.args.trace) {
			const { choice } = await dialogService.show(
				Severity.Info,
				localize('stopTracing.message', "Tracing requires to launch with a '--trace' argument"),
				[
					localize({ key: 'stopTracing.button', comment: ['&& denotes a mnemonic'] }, "&&Relaunch and Enable Tracing"),
					localize('cancel', "Cancel")
				],
				{
					cancelId: 1
				}
			);

			switch (choice) {
				case 0:
					return nativeHostService.relaunch({ addArgs: ['--trace'] });
				case 1:
					return; // canceled
			}
		}

		await progressService.withProgress({
			location: ProgressLocation.Dialog,
			title: localize('stopTracing.title', "Creating trace file..."),
			cancellable: false,
			detail: localize('stopTracing.detail', "This can take up to one minute to complete.")
		}, () => issueService.stopTracing());
	}
}

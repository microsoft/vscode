/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchActionRegistry, Extensions as WorkbenchActionExtensions, CATEGORIES } from 'vs/workbench/common/actions';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { OpenWindowSessionLogFileAction } from 'vs/workbench/contrib/logs/common/logsActions';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { Disposable } from 'vs/base/common/lifecycle';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { LogsDataCleaner } from 'vs/workbench/contrib/logs/common/logsDataCleaner';

class WebLogOutputChannels extends Disposable implements IWorkbenchContribution {

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		this.registerWebContributions();
	}

	private registerWebContributions(): void {
		this.instantiationService.createInstance(LogsDataCleaner);

		const workbenchActionsRegistry = Registry.as<IWorkbenchActionRegistry>(WorkbenchActionExtensions.WorkbenchActions);
		workbenchActionsRegistry.registerWorkbenchAction(SyncActionDescriptor.from(OpenWindowSessionLogFileAction), 'Developer: Open Window Log File (Session)...', CATEGORIES.Developer.value);
	}

}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(WebLogOutputChannels, 'WebLogOutputChannels', LifecyclePhase.Restored);

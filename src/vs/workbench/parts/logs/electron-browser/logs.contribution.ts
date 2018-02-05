/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { join } from 'vs/base/common/paths';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IOutputChannelRegistry, Extensions as OutputExt, } from 'vs/workbench/parts/output/common/output';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { Disposable } from 'vs/base/common/lifecycle';
import URI from 'vs/base/common/uri';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import * as Constants from 'vs/workbench/parts/logs/common/logConstants';
import { IWorkbenchActionRegistry, Extensions as WorkbenchActionExtensions } from 'vs/workbench/common/actions';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { ShowLogsAction, OpenLogsFolderAction, SetLogLevelAction, OpenLogFileAction } from 'vs/workbench/parts/logs/electron-browser/logsActions';


class LogOutputChannels extends Disposable implements IWorkbenchContribution {

	constructor(
		@IWindowService private windowService: IWindowService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super();
		let outputChannelRegistry = <IOutputChannelRegistry>Registry.as(OutputExt.OutputChannels);
		outputChannelRegistry.registerChannel(Constants.mainLogChannelId, nls.localize('mainLog', "Log (Main)"), URI.file(join(this.environmentService.logsPath, `main.log`)));
		outputChannelRegistry.registerChannel(Constants.sharedLogChannelId, nls.localize('sharedLog', "Log (Shared)"), URI.file(join(this.environmentService.logsPath, `sharedprocess.log`)));
		outputChannelRegistry.registerChannel(Constants.rendererLogChannelId, nls.localize('rendererLog', "Log (Window)"), URI.file(join(this.environmentService.logsPath, `renderer${this.windowService.getCurrentWindowId()}.log`)));
		outputChannelRegistry.registerChannel(Constants.extHostLogChannelId, nls.localize('extensionsLog', "Log (Extension Host)"), URI.file(join(this.environmentService.logsPath, `extHost${this.windowService.getCurrentWindowId()}.log`)));

		const workbenchActionsRegistry = Registry.as<IWorkbenchActionRegistry>(WorkbenchActionExtensions.WorkbenchActions);
		const devCategory = nls.localize('developer', "Developer");
		workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(OpenLogsFolderAction, OpenLogsFolderAction.ID, OpenLogsFolderAction.LABEL), 'Developer: Open Log Folder', devCategory);
		workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(SetLogLevelAction, SetLogLevelAction.ID, SetLogLevelAction.LABEL), 'Developer: Set Log Level', devCategory);
		workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(ShowLogsAction, ShowLogsAction.ID, ShowLogsAction.LABEL), 'Developer: Show Logs...', devCategory);
		workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(OpenLogFileAction, OpenLogFileAction.ID, OpenLogFileAction.LABEL), 'Developer: Open Log File...', devCategory);
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(LogOutputChannels, LifecyclePhase.Eventually);
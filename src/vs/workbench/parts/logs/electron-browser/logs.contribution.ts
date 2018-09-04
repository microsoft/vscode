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
import { URI } from 'vs/base/common/uri';
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
		let outputChannelRegistry = Registry.as<IOutputChannelRegistry>(OutputExt.OutputChannels);
		outputChannelRegistry.registerChannel({ id: Constants.mainLogChannelId, label: nls.localize('mainLog', "Log (Main)"), file: URI.file(join(this.environmentService.logsPath, `main.log`)), log: true });
		outputChannelRegistry.registerChannel({ id: Constants.sharedLogChannelId, label: nls.localize('sharedLog', "Log (Shared)"), file: URI.file(join(this.environmentService.logsPath, `sharedprocess.log`)), log: true });
		outputChannelRegistry.registerChannel({ id: Constants.rendererLogChannelId, label: nls.localize('rendererLog', "Log (Window)"), file: URI.file(join(this.environmentService.logsPath, `renderer${this.windowService.getCurrentWindowId()}.log`)), log: true });
		outputChannelRegistry.registerChannel({ id: Constants.extHostLogChannelId, label: nls.localize('extensionsLog', "Log (Extension Host)"), file: URI.file(join(this.environmentService.logsPath, `exthost${this.windowService.getCurrentWindowId()}.log`)), log: true });

		const workbenchActionsRegistry = Registry.as<IWorkbenchActionRegistry>(WorkbenchActionExtensions.WorkbenchActions);
		const devCategory = nls.localize('developer', "Developer");
		workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(OpenLogsFolderAction, OpenLogsFolderAction.ID, OpenLogsFolderAction.LABEL), 'Developer: Open Log Folder', devCategory);
		workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(SetLogLevelAction, SetLogLevelAction.ID, SetLogLevelAction.LABEL), 'Developer: Set Log Level', devCategory);
		workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(ShowLogsAction, ShowLogsAction.ID, ShowLogsAction.LABEL), 'Developer: Show Logs...', devCategory);
		workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(OpenLogFileAction, OpenLogFileAction.ID, OpenLogFileAction.LABEL), 'Developer: Open Log File...', devCategory);
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(LogOutputChannels, LifecyclePhase.Eventually);
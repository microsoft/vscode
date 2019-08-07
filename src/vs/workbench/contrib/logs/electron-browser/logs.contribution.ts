/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { join } from 'vs/base/common/path';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IOutputChannelRegistry, Extensions as OutputExt, } from 'vs/workbench/contrib/output/common/output';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import * as Constants from 'vs/workbench/contrib/logs/common/logConstants';
import { IWorkbenchActionRegistry, Extensions as WorkbenchActionExtensions } from 'vs/workbench/common/actions';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { OpenLogsFolderAction } from 'vs/workbench/contrib/logs/common/logsActions';
import { ILogService, LogLevel } from 'vs/platform/log/common/log';
import { IFileService, FileChangeType } from 'vs/platform/files/common/files';
import { dirname } from 'vs/base/common/resources';

class LogOutputChannels extends Disposable implements IWorkbenchContribution {

	constructor(
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@ILogService logService: ILogService,
		@IFileService private readonly fileService: IFileService
	) {
		super();
		this.registerLogChannel(Constants.mainLogChannelId, nls.localize('mainLog', "Main"), URI.file(join(environmentService.logsPath, `main.log`)));
		this.registerLogChannel(Constants.sharedLogChannelId, nls.localize('sharedLog', "Shared"), URI.file(join(environmentService.logsPath, `sharedprocess.log`)));
		this.registerLogChannel(Constants.rendererLogChannelId, nls.localize('rendererLog', "Window"), URI.file(join(environmentService.logsPath, `renderer${environmentService.configuration.windowId}.log`)));

		const registerTelemetryChannel = (level: LogLevel) => {
			if (level === LogLevel.Trace && !Registry.as<IOutputChannelRegistry>(OutputExt.OutputChannels).getChannel(Constants.telemetryLogChannelId)) {
				this.registerLogChannel(Constants.telemetryLogChannelId, nls.localize('telemetryLog', "Telemetry"), URI.file(join(environmentService.logsPath, `telemetry.log`)));
			}
		};
		registerTelemetryChannel(logService.getLevel());
		logService.onDidChangeLogLevel(registerTelemetryChannel);

		const workbenchActionsRegistry = Registry.as<IWorkbenchActionRegistry>(WorkbenchActionExtensions.WorkbenchActions);
		const devCategory = nls.localize('developer', "Developer");
		workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(OpenLogsFolderAction, OpenLogsFolderAction.ID, OpenLogsFolderAction.LABEL), 'Developer: Open Logs Folder', devCategory);
	}

	private async registerLogChannel(id: string, label: string, file: URI): Promise<void> {
		const outputChannelRegistry = Registry.as<IOutputChannelRegistry>(OutputExt.OutputChannels);
		const exists = await this.fileService.exists(file);
		if (exists) {
			outputChannelRegistry.registerChannel({ id, label, file, log: true });
			return;
		}

		const watcher = this.fileService.watch(dirname(file));
		const disposable = this.fileService.onFileChanges(e => {
			if (e.contains(file, FileChangeType.ADDED)) {
				watcher.dispose();
				disposable.dispose();
				outputChannelRegistry.registerChannel({ id, label, file, log: true });
			}
		});
	}

}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(LogOutputChannels, LifecyclePhase.Restored);
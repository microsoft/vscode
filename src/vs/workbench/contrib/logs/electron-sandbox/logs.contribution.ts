/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchActionRegistry, Extensions as WorkbenchActionExtensions, CATEGORIES } from 'vs/workbench/common/actions';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { OpenLogsFolderAction, OpenExtensionLogsFolderAction } from 'vs/workbench/contrib/logs/electron-sandbox/logsActions';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import * as Constants from 'vs/workbench/contrib/logs/common/logConstants';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { IFileService } from 'vs/platform/files/common/files';
import { ILogService } from 'vs/platform/log/common/log';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { join } from 'vs/base/common/path';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { registerLogChannel } from 'vs/workbench/services/output/common/output';

class NativeLogOutputChannels extends Disposable implements IWorkbenchContribution {

	constructor(
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@ILogService private readonly logService: ILogService,
		@IFileService private readonly fileService: IFileService,
	) {
		super();
		this.registerNativeContributions();
	}

	private registerNativeContributions(): void {
		this.registerLogChannel(Constants.mainLogChannelId, nls.localize('mainLog', "Main"), URI.file(join(this.environmentService.logsPath, `main.log`)));
		this.registerLogChannel(Constants.sharedLogChannelId, nls.localize('sharedLog', "Shared"), URI.file(join(this.environmentService.logsPath, `sharedprocess.log`)));
	}

	private registerLogChannel(id: string, label: string, file: URI): void {
		const promise = registerLogChannel(id, label, file, this.fileService, this.logService);
		this._register(toDisposable(() => promise.cancel()));
	}

}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(NativeLogOutputChannels, 'NativeLogOutputChannels', LifecyclePhase.Restored);

const workbenchActionsRegistry = Registry.as<IWorkbenchActionRegistry>(WorkbenchActionExtensions.WorkbenchActions);
workbenchActionsRegistry.registerWorkbenchAction(SyncActionDescriptor.from(OpenLogsFolderAction), 'Developer: Open Logs Folder', CATEGORIES.Developer.value);
workbenchActionsRegistry.registerWorkbenchAction(SyncActionDescriptor.from(OpenExtensionLogsFolderAction), 'Developer: Open Extension Logs Folder', CATEGORIES.Developer.value);

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
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
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

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

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: OpenLogsFolderAction.ID,
			title: OpenLogsFolderAction.TITLE,
			category: Categories.Developer,
			f1: true
		});
	}
	run(servicesAccessor: ServicesAccessor): Promise<void> {
		return servicesAccessor.get(IInstantiationService).createInstance(OpenLogsFolderAction, OpenLogsFolderAction.ID, OpenLogsFolderAction.TITLE.value).run();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: OpenExtensionLogsFolderAction.ID,
			title: OpenExtensionLogsFolderAction.TITLE,
			category: Categories.Developer,
			f1: true
		});
	}
	run(servicesAccessor: ServicesAccessor): Promise<void> {
		return servicesAccessor.get(IInstantiationService).createInstance(OpenExtensionLogsFolderAction, OpenExtensionLogsFolderAction.ID, OpenExtensionLogsFolderAction.TITLE.value).run();
	}
});

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(NativeLogOutputChannels, LifecyclePhase.Restored);

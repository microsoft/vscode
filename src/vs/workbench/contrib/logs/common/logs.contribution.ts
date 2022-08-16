/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { SetLogLevelAction } from 'vs/workbench/contrib/logs/common/logsActions';
import * as Constants from 'vs/workbench/contrib/logs/common/logConstants';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IFileService } from 'vs/platform/files/common/files';
import { IOutputService, registerLogChannel } from 'vs/workbench/services/output/common/output';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { ILogService, LogLevel } from 'vs/platform/log/common/log';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { supportsTelemetry } from 'vs/platform/telemetry/common/telemetryUtils';
import { IProductService } from 'vs/platform/product/common/productService';
import { URI } from 'vs/base/common/uri';

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: SetLogLevelAction.ID,
			title: SetLogLevelAction.TITLE,
			category: Categories.Developer,
			f1: true
		});
	}
	run(servicesAccessor: ServicesAccessor): Promise<void> {
		return servicesAccessor.get(IInstantiationService).createInstance(SetLogLevelAction, SetLogLevelAction.ID, SetLogLevelAction.TITLE.value).run();
	}
});

class LogOutputChannels extends Disposable implements IWorkbenchContribution {

	constructor(
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IProductService private readonly productService: IProductService,
		@ILogService private readonly logService: ILogService,
		@IFileService private readonly fileService: IFileService,
	) {
		super();
		this.registerCommonContributions();
	}

	private registerCommonContributions(): void {
		this.registerLogChannel(Constants.userDataSyncLogChannelId, nls.localize('userDataSyncLog', "Settings Sync"), this.environmentService.userDataSyncLogResource);
		this.registerLogChannel(Constants.editSessionsLogChannelId, nls.localize('editSessionsLog', "Edit Sessions"), this.environmentService.editSessionsLogResource);
		this.registerLogChannel(Constants.remoteTunnelLogChannelId, nls.localize('remoteTunnelLog', "Remote Tunnel"), this.environmentService.remoteTunnelLogResource);
		this.registerLogChannel(Constants.rendererLogChannelId, nls.localize('rendererLog', "Window"), this.environmentService.logFile);

		const registerTelemetryChannel = () => {
			if (supportsTelemetry(this.productService, this.environmentService) && this.logService.getLevel() === LogLevel.Trace) {
				this.registerLogChannel(Constants.telemetryLogChannelId, nls.localize('telemetryLog', "Telemetry"), this.environmentService.telemetryLogResource);
				this.registerLogChannel(Constants.extensionTelemetryLogChannelId, nls.localize('extensionTelemetryLog', "Extension Telemetry"), this.environmentService.extHostTelemetryLogFile);
				return true;
			}
			return false;
		};
		if (!registerTelemetryChannel()) {
			const disposable = this.logService.onDidChangeLogLevel(() => {
				if (registerTelemetryChannel()) {
					disposable.dispose();
				}
			});
		}

		registerAction2(class ShowWindowLogAction extends Action2 {
			constructor() {
				super({
					id: Constants.showWindowLogActionId,
					title: { value: nls.localize('show window log', "Show Window Log"), original: 'Show Window Log' },
					category: Categories.Developer,
					f1: true
				});
			}
			async run(servicesAccessor: ServicesAccessor): Promise<void> {
				const outputService = servicesAccessor.get(IOutputService);
				outputService.showChannel(Constants.rendererLogChannelId);
			}
		});
	}

	private registerLogChannel(id: string, label: string, file: URI): void {
		const promise = registerLogChannel(id, label, file, this.fileService, this.logService);
		this._register(toDisposable(() => promise.cancel()));
	}

}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(LogOutputChannels, LifecyclePhase.Restored);

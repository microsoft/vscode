/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { SetLogLevelAction } from 'vs/workbench/contrib/logs/common/logsActions';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { IFileService, whenProviderRegistered } from 'vs/platform/files/common/files';
import { IOutputChannelRegistry, IOutputService, Extensions } from 'vs/workbench/services/output/common/output';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { ILogService, ILoggerResource, ILoggerService, LogLevel } from 'vs/platform/log/common/log';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { URI } from 'vs/base/common/uri';
import { rendererLogId, showWindowLogActionId } from 'vs/workbench/common/logConstants';
import { createCancelablePromise, timeout } from 'vs/base/common/async';
import { CancellationError, getErrorMessage, isCancellationError } from 'vs/base/common/errors';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IDefaultLogLevelsService } from 'vs/workbench/contrib/logs/common/defaultLogLevels';

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

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.setDefaultLogLevel',
			title: { value: nls.localize('setDefaultLogLevel', "Set Default Log Level"), original: 'Set Default Log Level' },
			category: Categories.Developer,
		});
	}
	run(servicesAccessor: ServicesAccessor, logLevel: LogLevel, extensionId?: string): Promise<void> {
		return servicesAccessor.get(IDefaultLogLevelsService).setDefaultLogLevel(logLevel, extensionId);
	}
});

class LogOutputChannels extends Disposable implements IWorkbenchContribution {

	constructor(
		@ILogService private readonly logService: ILogService,
		@ILoggerService loggerService: ILoggerService,
		@IFileService private readonly fileService: IFileService,
	) {
		super();
		this.registerLogOutputChannels(loggerService.getRegisteredLoggers());
		this._register(loggerService.onDidChangeLoggers(({ added, removed }) => {
			this.registerLogOutputChannels(added);
			this.deregisterLogOutputChannels(removed);
		}));
		this._register(loggerService.onDidChangeVisibility(([resource, visibility]) => {
			const logger = loggerService.getRegisteredLogger(resource);
			if (logger) {
				if (visibility) {
					this.registerLogOutputChannels([logger]);
				} else {
					this.deregisterLogOutputChannels([logger]);
				}
			}
		}));
		this.registerShowWindowLogAction();
	}

	private registerLogOutputChannels(loggers: Iterable<ILoggerResource>): void {
		for (const logger of loggers) {
			if (logger.hidden) {
				continue;
			}
			this.registerLogChannel(logger);
		}
	}

	private deregisterLogOutputChannels(loggers: Iterable<ILoggerResource>): void {
		const outputChannelRegistry = Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels);
		for (const logger of loggers) {
			outputChannelRegistry.removeChannel(logger.id);
		}
	}

	private registerLogChannel(logger: ILoggerResource): void {
		const promise = createCancelablePromise(async token => {
			await whenProviderRegistered(logger.resource, this.fileService);
			const outputChannelRegistry = Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels);
			try {
				await this.whenFileExists(logger.resource, 1, token);
				outputChannelRegistry.registerChannel({ id: logger.id, label: logger.name ?? logger.id, file: logger.resource, log: true, extensionId: logger.extensionId });
			} catch (error) {
				if (!isCancellationError(error)) {
					this.logService.error('Error while registering log channel', logger.resource.toString(), getErrorMessage(error));
				}
			}
		});
		this._register(toDisposable(() => promise.cancel()));
	}

	private async whenFileExists(file: URI, trial: number, token: CancellationToken): Promise<void> {
		const exists = await this.fileService.exists(file);
		if (exists) {
			return;
		}
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		if (trial > 10) {
			throw new Error(`Timed out while waiting for file to be created`);
		}
		this.logService.debug(`[Registering Log Channel] File does not exist. Waiting for 1s to retry.`, file.toString());
		await timeout(1000, token);
		await this.whenFileExists(file, trial + 1, token);
	}

	private registerShowWindowLogAction(): void {
		registerAction2(class ShowWindowLogAction extends Action2 {
			constructor() {
				super({
					id: showWindowLogActionId,
					title: { value: nls.localize('show window log', "Show Window Log"), original: 'Show Window Log' },
					category: Categories.Developer,
					f1: true
				});
			}
			async run(servicesAccessor: ServicesAccessor): Promise<void> {
				const outputService = servicesAccessor.get(IOutputService);
				outputService.showChannel(rendererLogId);
			}
		});
	}

}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(LogOutputChannels, LifecyclePhase.Restored);

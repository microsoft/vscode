/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extHostNamedCustomer, IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { DEFAULT_LOG_LEVEL, ILoggerOptions, ILoggerService, ILogService, log, LogLevel } from 'vs/platform/log/common/log';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ExtHostContext, MainThreadLoggerShape, MainContext, ExtHostLogLevelServiceShape } from 'vs/workbench/api/common/extHost.protocol';
import { UriComponents, URI } from 'vs/base/common/uri';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { localize } from 'vs/nls';
import { CATEGORIES } from 'vs/workbench/common/actions';
import { IOutputChannelDescriptor, IOutputService } from 'vs/workbench/services/output/common/output';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { selectLogLevel } from 'vs/workbench/contrib/logs/common/logsActions';

interface IOutputChannelQuickPickItem extends IQuickPickItem {
	channel: IOutputChannelDescriptor;
}

@extHostNamedCustomer(MainContext.MainThreadLogger)
export class MainThreadLoggerService implements MainThreadLoggerShape {

	private readonly disposables = new DisposableStore();

	private readonly extensionLogLevels: Map<string, LogLevel> = new Map<string, LogLevel>();
	private readonly proxy: ExtHostLogLevelServiceShape;

	constructor(
		extHostContext: IExtHostContext,
		@ILogService logService: ILogService,
		@ILoggerService private readonly _loggerService: ILoggerService,
	) {
		this.proxy = extHostContext.getProxy(ExtHostContext.ExtHostLogLevelServiceShape);
		this.disposables.add(logService.onDidChangeLogLevel(level => this.proxy.$setLevel(level)));

		this.registeSetExtensionLogLevelAction();
	}

	$log(file: UriComponents, messages: [LogLevel, string][]): void {
		const logger = this._loggerService.getLogger(URI.revive(file));
		if (!logger) {
			throw new Error('Create the logger before logging');
		}
		for (const [level, message] of messages) {
			log(logger, level, message);
		}
	}

	async $createLogger(file: UriComponents, options?: ILoggerOptions): Promise<void> {
		this._loggerService.createLogger(URI.revive(file), options);
	}

	private registeSetExtensionLogLevelAction(): void {
		const that = this;
		this.disposables.add(registerAction2(class SetExtensionLogLevelActionextends extends Action2 {
			constructor() {
				super({
					id: 'workbench.action.setExtensionLogLevel',
					title: { original: 'Set Extension Log Level...', value: localize('title', "Set Extension Log Level...") },
					category: CATEGORIES.Developer,
					menu: {
						id: MenuId.CommandPalette
					}
				});
			}

			async run(accessor: ServicesAccessor): Promise<void> {
				const outputService = accessor.get(IOutputService);
				const quickInputService = accessor.get(IQuickInputService);

				const entries: IOutputChannelQuickPickItem[] = outputService.getChannelDescriptors().filter(c => c.file && c.log && c.extensionId)
					.map(channel => (<IOutputChannelQuickPickItem>{ id: channel.id, label: channel.label, channel }));

				const entry = await quickInputService.pick(entries, { placeHolder: localize('selectlogFile', "Select Extension") });
				if (entry?.channel.extensionId) {
					const selectedLogLevel = await selectLogLevel(that.extensionLogLevels.get(entry.channel.extensionId) ?? DEFAULT_LOG_LEVEL, quickInputService);
					if (selectedLogLevel !== undefined) {
						if (selectedLogLevel === DEFAULT_LOG_LEVEL) {
							that.extensionLogLevels.delete(entry.channel.extensionId);
						} else {
							that.extensionLogLevels.set(entry.channel.extensionId, selectedLogLevel);
						}
						that.proxy.$setLevel(selectedLogLevel, entry.channel.file);
					}
				}
			}
		}));
	}

	dispose(): void {
		this.disposables.dispose();
	}
}

// --- Internal commands to improve extension test runs

CommandsRegistry.registerCommand('_extensionTests.setLogLevel', function (accessor: ServicesAccessor, level: number) {
	const logService = accessor.get(ILogService);
	const environmentService = accessor.get(IEnvironmentService);

	if (environmentService.isExtensionDevelopment && !!environmentService.extensionTestsLocationURI) {
		logService.setLevel(level);
	}
});

CommandsRegistry.registerCommand('_extensionTests.getLogLevel', function (accessor: ServicesAccessor) {
	const logService = accessor.get(ILogService);

	return logService.getLevel();
});

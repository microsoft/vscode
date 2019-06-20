/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TerminalLauncher } from 'vs/workbench/contrib/debug/node/terminalSupport';
import { ITerminalLauncher, IDebugHelperService, ILaunchVSCodeArguments } from 'vs/workbench/contrib/debug/common/debug';
import { Client as TelemetryClient } from 'vs/base/parts/ipc/node/ipc.cp';
import { TelemetryAppenderClient } from 'vs/platform/telemetry/node/telemetryIpc';
import { getPathFromAmdModule } from 'vs/base/common/amd';
import { TelemetryService } from 'vs/platform/telemetry/common/telemetryService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IWindowsService, IOpenSettings, IURIToOpen } from 'vs/platform/windows/common/windows';
import { URI } from 'vs/base/common/uri';
import { isUri } from 'vs/workbench/contrib/debug/common/debugUtils';

export class NodeDebugHelperService implements IDebugHelperService {
	_serviceBrand: any;

	constructor(
		@IWindowsService private readonly windowsService: IWindowsService
	) {
	}

	createTerminalLauncher(instantiationService: IInstantiationService): ITerminalLauncher {
		return instantiationService.createInstance(TerminalLauncher);
	}

	async launchVsCode(vscodeArgs: ILaunchVSCodeArguments): Promise<number> {

		let options: IOpenSettings = {
			forceNewWindow: true,
			args: {
				_: []
			}
		};
		let urisToOpen: IURIToOpen[] = [];

		for (let arg of vscodeArgs.args) {
			if (arg.prefix) {
				const a2 = (arg.prefix || '') + (arg.path || '');
				const match = /^--(.+)=(.+)$/.exec(a2);
				if (match && match.length === 3) {
					const key = match[1];
					const value = match[2];
					let uri: URI;

					if (key === 'file-uri') {
						if (isUri(arg.path)) {
							uri = URI.parse(value);
						} else {
							uri = URI.file(value);
						}
						urisToOpen.push({
							fileUri: uri
						});
					} if (key === 'folder-uri') {
						if (isUri(arg.path)) {
							uri = URI.parse(value);
						} else {
							uri = URI.file(value);
						}
						urisToOpen.push({
							folderUri: uri
						});
					} else {
						if (options.args) {
							options.args[key] = value;
						}
					}
				} else {
					if (options.args) {
						options.args._.push(a2);
					}
				}
			}
		}

		return this.windowsService.openWindow(0, urisToOpen, options).then(_ => {
			return 9999;
		});
	}

	createTelemetryService(configurationService: IConfigurationService, args: string[]): TelemetryService | undefined {

		const client = new TelemetryClient(
			getPathFromAmdModule(require, 'bootstrap-fork'),
			{
				serverName: 'Debug Telemetry',
				timeout: 1000 * 60 * 5,
				args: args,
				env: {
					ELECTRON_RUN_AS_NODE: 1,
					PIPE_LOGGING: 'true',
					AMD_ENTRYPOINT: 'vs/workbench/contrib/debug/node/telemetryApp'
				}
			}
		);

		const channel = client.getChannel('telemetryAppender');
		const appender = new TelemetryAppenderClient(channel);

		return new TelemetryService({ appender }, configurationService);
	}
}

registerSingleton(IDebugHelperService, NodeDebugHelperService);
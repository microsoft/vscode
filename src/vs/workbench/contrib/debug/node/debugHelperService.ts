/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as objects from 'vs/base/common/objects';
import { isUri } from 'vs/workbench/contrib/debug/common/debugUtils';
import * as cp from 'child_process';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TerminalLauncher } from 'vs/workbench/contrib/debug/node/terminalSupport';
import { ITerminalLauncher, IDebugHelperService, ILaunchVSCodeArguments } from 'vs/workbench/contrib/debug/common/debug';
import { Client as TelemetryClient } from 'vs/base/parts/ipc/node/ipc.cp';
import { TelemetryAppenderClient } from 'vs/platform/telemetry/node/telemetryIpc';
import { getPathFromAmdModule } from 'vs/base/common/amd';
import { TelemetryService } from 'vs/platform/telemetry/common/telemetryService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

export class NodeDebugHelperService implements IDebugHelperService {
	_serviceBrand: any;

	constructor(
		@IEnvironmentService private readonly environmentService: IEnvironmentService
	) {
	}

	createTerminalLauncher(instantiationService: IInstantiationService): ITerminalLauncher {
		return instantiationService.createInstance(TerminalLauncher);
	}

	launchVsCode(vscodeArgs: ILaunchVSCodeArguments): Promise<number> {

		const spawnOpts: cp.SpawnOptions = {
			detached: false	// https://github.com/Microsoft/vscode/issues/57018
		};

		if (vscodeArgs.env) {
			// merge environment variables into a copy of the process.env
			const envArgs = objects.mixin(objects.mixin({}, process.env), vscodeArgs.env);
			// and delete some if necessary
			Object.keys(envArgs).filter(k => envArgs[k] === null).forEach(key => delete envArgs[key]);
			spawnOpts.env = envArgs;
		}

		let spawnArgs = vscodeArgs.args.map(a => {
			if ((a.prefix === '--file-uri=' || a.prefix === '--folder-uri=') && !isUri(a.path)) {
				return (a.path || '');
			}
			return (a.prefix || '') + (a.path || '');
		});

		let runtimeExecutable = this.environmentService['execPath'];
		if (!runtimeExecutable) {
			return Promise.reject(new Error(`VS Code executable unknown`));
		}

		// if VS Code runs out of sources, add the VS Code workspace path as the first argument so that Electron turns into VS Code
		const electronIdx = runtimeExecutable.indexOf(process.platform === 'win32' ? '\\.build\\electron\\' : '/.build/electron/');
		if (electronIdx > 0) {
			// guess the VS Code workspace path from the executable
			const vscodeWorkspacePath = runtimeExecutable.substr(0, electronIdx);

			// only add VS Code workspace path if user hasn't already added that path as a (folder) argument
			const x = spawnArgs.filter(a => a.indexOf(vscodeWorkspacePath) === 0);
			if (x.length === 0) {
				spawnArgs.unshift(vscodeWorkspacePath);
			}
		}

		// Workaround for bug Microsoft/vscode#45832
		if (process.platform === 'win32' && runtimeExecutable.indexOf(' ') > 0) {
			let foundArgWithSpace = false;

			// check whether there is one arg with a space
			const args: string[] = [];
			for (const a of spawnArgs) {
				if (a.indexOf(' ') > 0) {
					args.push(`"${a}"`);
					foundArgWithSpace = true;
				} else {
					args.push(a);
				}
			}

			if (foundArgWithSpace) {
				spawnArgs = args;
				runtimeExecutable = `"${runtimeExecutable}"`;
				spawnOpts.shell = true;
			}
		}

		return new Promise((resolve, reject) => {
			const process = cp.spawn(runtimeExecutable, spawnArgs, spawnOpts);
			process.on('error', error => {
				reject(error);
			});
			process.on('exit', code => {
				if (code === 0) {
					resolve(process.pid);
				} else {
					reject(new Error(`VS Code exited with ${code}`));
				}
			});
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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitpod. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import * as path from 'path';
import { CancellationToken } from 'vs/base/common/cancellation';
import { URI } from 'vs/base/common/uri';
import { Event } from 'vs/base/common/event';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ILogService } from 'vs/platform/log/common/log';
import product from 'vs/platform/product/common/product';
import { RemoteAgentConnectionContext } from 'vs/platform/remote/common/remoteAgentEnvironment';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IShellLaunchConfig, LocalReconnectConstants } from 'vs/platform/terminal/common/terminal';
import { PtyHostService } from 'vs/platform/terminal/node/ptyHostService';
import { ICreateTerminalProcessArguments, ICreateTerminalProcessResult, REMOTE_TERMINAL_CHANNEL_NAME } from 'vs/workbench/contrib/terminal/common/remoteTerminalChannel';
import * as platform from 'vs/base/common/platform';
import { IWorkspaceFolderData } from 'vs/platform/terminal/common/terminalProcess';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { createTerminalEnvironment, createVariableResolver, getCwd, getDefaultShell, getDefaultShellArgs } from 'vs/workbench/contrib/terminal/common/terminalEnvironment';
import { deserializeEnvironmentVariableCollection } from 'vs/workbench/contrib/terminal/common/environmentVariableShared';
import { MergedEnvironmentVariableCollection } from 'vs/workbench/contrib/terminal/common/environmentVariableCollection';
import { IEnvironmentVariableCollection } from 'vs/workbench/contrib/terminal/common/environmentVariable';
import { getSystemShellSync } from 'vs/base/node/shell';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IPCServer } from 'vs/base/parts/ipc/common/ipc';
import { AbstractVariableResolverService } from 'vs/workbench/services/configurationResolver/common/variableResolver';
import { TernarySearchTree } from 'vs/base/common/map';

export function registerRemoteTerminal(services: ServicesAccessor, channelServer: IPCServer<RemoteAgentConnectionContext>) {
	const reconnectConstants = {
		GraceTime: LocalReconnectConstants.GraceTime,
		ShortGraceTime: LocalReconnectConstants.ShortGraceTime
	};
	const configurationService = services.get(IConfigurationService);
	const logService = services.get(ILogService);
	const telemetryService = services.get(ITelemetryService);
	const ptyHostService = new PtyHostService(reconnectConstants, configurationService, logService, telemetryService);
	const resolvedServices: Services = { logService, ptyHostService };
	channelServer.registerChannel(REMOTE_TERMINAL_CHANNEL_NAME, {

		call: async (ctx: RemoteAgentConnectionContext, command: string, arg?: any, cancellationToken?: CancellationToken) => {
			if (command === '$createProcess') {
				return createProcess(arg, resolvedServices);
			}

			// Generic method handling for all other commands
			const serviceRecord = ptyHostService as unknown as Record<string, (arg?: any) => Promise<any>>;
			const serviceFunc = serviceRecord[command.substring(1)];
			if (!serviceFunc) {
				logService.error('Unknown command: ' + command);
				return undefined;
			}
			if (Array.isArray(arg)) {
				return serviceFunc.call(ptyHostService, ...arg);
			} else {
				return serviceFunc.call(ptyHostService, arg);
			}
		},

		listen: (ctx: RemoteAgentConnectionContext, event: string) => {
			if (event === '$onExecuteCommand') {
				return Event.None;
			}
			const serviceRecord = ptyHostService as unknown as Record<string, Event<any>>;
			const result = serviceRecord[event.substring(1, event.endsWith('Event') ? event.length - 'Event'.length : undefined)];
			if (!result) {
				logService.error('Unknown event: ' + event);
				return Event.None;
			}
			return result;
		}

	});
}

interface Services {
	ptyHostService: PtyHostService, logService: ILogService
}

async function createProcess(args: ICreateTerminalProcessArguments, services: Services): Promise<ICreateTerminalProcessResult> {
	const shellLaunchConfigDto = args.shellLaunchConfig;
	// See  $spawnExtHostProcess in src/vs/workbench/api/node/extHostTerminalService.ts for a reference implementation
	const shellLaunchConfig: IShellLaunchConfig = {
		name: shellLaunchConfigDto.name,
		executable: shellLaunchConfigDto.executable,
		args: shellLaunchConfigDto.args,
		cwd: typeof shellLaunchConfigDto.cwd === 'string' ? shellLaunchConfigDto.cwd : URI.revive(shellLaunchConfigDto.cwd),
		env: shellLaunchConfigDto.env
	};

	let lastActiveWorkspace: IWorkspaceFolder | undefined;
	if (args.activeWorkspaceFolder) {
		lastActiveWorkspace = toWorkspaceFolder(args.activeWorkspaceFolder);
	}

	const processEnv = { ...process.env, ...args.resolverEnv } as platform.IProcessEnvironment;
	const configurationResolverService = new RemoteTerminalVariableResolverService(
		args.workspaceFolders.map(toWorkspaceFolder),
		args.resolvedVariables,
		args.activeFileResource ? URI.revive(args.activeFileResource) : undefined,
		processEnv
	);
	const variableResolver = createVariableResolver(lastActiveWorkspace, processEnv, configurationResolverService);

	// Merge in shell and args from settings
	if (!shellLaunchConfig.executable) {
		shellLaunchConfig.executable = getDefaultShell(
			key => args.configuration[key],
			getSystemShellSync(platform.OS, process.env as platform.IProcessEnvironment),
			process.env.hasOwnProperty('PROCESSOR_ARCHITEW6432'),
			process.env.windir,
			variableResolver,
			services.logService,
			false
		);
		shellLaunchConfig.args = getDefaultShellArgs(
			key => args.configuration[key],
			false,
			variableResolver,
			services.logService
		);
	} else if (variableResolver) {
		shellLaunchConfig.executable = variableResolver(shellLaunchConfig.executable);
		if (shellLaunchConfig.args) {
			if (Array.isArray(shellLaunchConfig.args)) {
				const resolvedArgs: string[] = [];
				for (const arg of shellLaunchConfig.args) {
					resolvedArgs.push(variableResolver(arg));
				}
				shellLaunchConfig.args = resolvedArgs;
			} else {
				shellLaunchConfig.args = variableResolver(shellLaunchConfig.args);
			}
		}
	}

	// Get the initial cwd
	const initialCwd = getCwd(
		shellLaunchConfig,
		os.homedir(),
		variableResolver,
		lastActiveWorkspace?.uri,
		args.configuration['terminal.integrated.cwd'], services.logService
	);
	shellLaunchConfig.cwd = initialCwd;

	const env = createTerminalEnvironment(
		shellLaunchConfig,
		args.configuration['terminal.integrated.env.linux'],
		variableResolver,
		product.version,
		args.configuration['terminal.integrated.detectLocale'] || 'auto',
		processEnv
	);

	// Apply extension environment variable collections to the environment
	if (!shellLaunchConfig.strictEnv) {
		const collection = new Map<string, IEnvironmentVariableCollection>();
		for (const [name, serialized] of args.envVariableCollections) {
			collection.set(name, {
				map: deserializeEnvironmentVariableCollection(serialized)
			});
		}
		const mergedCollection = new MergedEnvironmentVariableCollection(collection);
		mergedCollection.applyToProcessEnvironment(env, variableResolver);
	}

	const persistentTerminalId = await services.ptyHostService.createProcess(shellLaunchConfig, initialCwd, args.cols, args.rows,
		env, processEnv, false, args.shouldPersistTerminal, args.workspaceId, args.workspaceName);
	return {
		persistentTerminalId,
		resolvedShellLaunchConfig: shellLaunchConfig
	};
}

function toWorkspaceFolder(data: IWorkspaceFolderData): IWorkspaceFolder {
	return {
		uri: URI.revive(data.uri),
		name: data.name,
		index: data.index,
		toResource: () => {
			throw new Error('Not implemented');
		}
	};
}

/**
 * See ExtHostVariableResolverService in src/vs/workbench/api/common/extHostDebugService.ts for a reference implementation.
 */
class RemoteTerminalVariableResolverService extends AbstractVariableResolverService {

	private readonly structure = TernarySearchTree.forUris<IWorkspaceFolder>(() => false);

	constructor(folders: IWorkspaceFolder[], resolvedVariables: { [name: string]: string }, activeFileResource: URI | undefined, env: platform.IProcessEnvironment) {
		super({
			getFolderUri: (folderName: string): URI | undefined => {
				const found = folders.filter(f => f.name === folderName);
				if (found && found.length > 0) {
					return found[0].uri;
				}
				return undefined;
			},
			getWorkspaceFolderCount: (): number => {
				return folders.length;
			},
			getConfigurationValue: (folderUri: URI | undefined, section: string): string | undefined => {
				return resolvedVariables['config:' + section];
			},
			getAppRoot: (): string | undefined => {
				return env['VSCODE_CWD'] || process.cwd();
			},
			getExecPath: (): string | undefined => {
				return env['VSCODE_EXEC_PATH'];
			},
			getFilePath: (): string | undefined => {
				if (activeFileResource) {
					return path.normalize(activeFileResource.fsPath);
				}
				return undefined;
			},
			getWorkspaceFolderPathForFile: (): string | undefined => {
				if (activeFileResource) {
					const ws = this.structure.findSubstr(activeFileResource);
					if (ws) {
						return path.normalize(ws.uri.fsPath);
					}
				}
				return undefined;
			},
			getSelectedText: (): string | undefined => {
				return resolvedVariables.selectedText;
			},
			getLineNumber: (): string | undefined => {
				return resolvedVariables.lineNumber;
			}
		}, undefined, Promise.resolve(env));

		// Set up the workspace folder data structure
		folders.forEach(folder => {
			this.structure.set(folder.uri, folder);
		});
	}

}

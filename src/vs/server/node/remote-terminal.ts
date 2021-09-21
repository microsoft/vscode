/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitpod. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import * as path from 'path';
import { CancellationToken } from 'vs/base/common/cancellation';
import { URI } from 'vs/base/common/uri';
import { Emitter, Event } from 'vs/base/common/event';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ILogService } from 'vs/platform/log/common/log';
import product from 'vs/platform/product/common/product';
import { RemoteAgentConnectionContext } from 'vs/platform/remote/common/remoteAgentEnvironment';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IPtyService, IReconnectConstants, IShellLaunchConfig, LocalReconnectConstants, TerminalSettingId } from 'vs/platform/terminal/common/terminal';
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
import { IPCServer, IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { AbstractVariableResolverService } from 'vs/workbench/services/configurationResolver/common/variableResolver';
import { TernarySearchTree } from 'vs/base/common/map';
import { CLIServerBase } from 'vs/workbench/api/node/extHostCLIServer';
import { createRandomIPCHandle } from 'vs/base/parts/ipc/node/ipc.net';
import { IRawURITransformerFactory } from 'vs/server/node/server.main';
import { IURITransformer, transformIncomingURIs, URITransformer } from 'vs/base/common/uriIpc';
import { cloneAndChange } from 'vs/base/common/objects';
import { INativeEnvironmentService } from 'vs/platform/environment/common/environment';

export function registerRemoteTerminal(services: ServicesAccessor, channelServer: IPCServer<RemoteAgentConnectionContext>) {
	const configurationService = services.get(IConfigurationService);
	const logService = services.get(ILogService);
	const environmentService = services.get(INativeEnvironmentService);
	const telemetryService = services.get(ITelemetryService);
	const rawURITransformerFactory = services.get(IRawURITransformerFactory);

	const reconnectConstants: IReconnectConstants = {
		graceTime: LocalReconnectConstants.GraceTime,
		shortGraceTime: LocalReconnectConstants.ShortGraceTime,
		scrollback: configurationService.getValue<number>(TerminalSettingId.PersistentSessionScrollback) ?? 100
	};
	const ptyHostService = new PtyHostService(reconnectConstants, configurationService, environmentService, logService, telemetryService);
	channelServer.registerChannel(REMOTE_TERMINAL_CHANNEL_NAME, new RemoteTerminalChannelServer(rawURITransformerFactory, logService, ptyHostService));
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

export class RemoteTerminalChannelServer implements IServerChannel<RemoteAgentConnectionContext> {

	private _lastRequestId = 0;
	private _pendingRequests = new Map<number, { resolve: (data: any) => void, reject: (error: any) => void, uriTransformer: IURITransformer }>();

	private readonly _onExecuteCommand = new Emitter<{ reqId: number, commandId: string, commandArgs: any[] }>();
	readonly onExecuteCommand = this._onExecuteCommand.event;

	constructor(
		private readonly rawURITransformerFactory: IRawURITransformerFactory,
		private readonly logService: ILogService,
		private readonly ptyService: IPtyService,
	) {
	}

	public async call(context: RemoteAgentConnectionContext, command: string, args: any, cancellationToken?: CancellationToken | undefined): Promise<any> {
		if (command === '$createProcess') {
			return this.createProcess(context.remoteAuthority, args);
		}

		if (command === '$sendCommandResult') {
			return this.sendCommandResult(args[0], args[1], args[2]);
		}

		// Generic method handling for all other commands
		const serviceRecord = this.ptyService as unknown as Record<string, (arg?: any) => Promise<any>>;
		const serviceFunc = serviceRecord[command.substring(1)];
		if (!serviceFunc) {
			this.logService.error('Unknown command: ' + command);
			return;
		}

		if (Array.isArray(args)) {
			return serviceFunc.call(this.ptyService, ...args);
		} else {
			return serviceFunc.call(this.ptyService, args);
		}
	}

	public listen(context: RemoteAgentConnectionContext, event: string, args: any): Event<any> {
		if (event === '$onExecuteCommand') {
			return this._onExecuteCommand.event;
		}

		const serviceRecord = this.ptyService as unknown as Record<string, Event<any>>;
		const result = serviceRecord[event.substring(1, event.endsWith('Event') ? event.length - 'Event'.length : undefined)];
		if (!result) {
			this.logService.error('Unknown event: ' + event);
			return Event.None;
		}
		return result;
	}

	private executeCommand(uriTransformer: IURITransformer, id: string, args: any[]): Promise<any> {
		let resolve: (data: any) => void, reject: (error: any) => void;
		const promise = new Promise<any>((c, e) => { resolve = c; reject = e; });

		const reqId = ++this._lastRequestId;
		this._pendingRequests.set(reqId, { resolve: resolve!, reject: reject!, uriTransformer });

		const commandArgs = cloneAndChange(args, value => {
			if (value instanceof URI) {
				return uriTransformer.transformOutgoingURI(value);
			}
			return;
		});
		this._onExecuteCommand.fire({ reqId, commandId: id, commandArgs });

		return promise;
	}

	private async sendCommandResult(reqId: number, isError: boolean, payload: any): Promise<any> {
		const reqData = this._pendingRequests.get(reqId);
		if (!reqData) {
			return;
		}

		this._pendingRequests.delete(reqId);

		const result = transformIncomingURIs(payload, reqData.uriTransformer);
		if (isError) {
			reqData.reject(result);
		} else {
			reqData.resolve(result);
		}
	}

	private async createProcess(remoteAuthority: string, args: ICreateTerminalProcessArguments): Promise<ICreateTerminalProcessResult> {
		const uriTransformer = new URITransformer(this.rawURITransformerFactory(remoteAuthority));

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
				this.logService,
				false
			);
			shellLaunchConfig.args = getDefaultShellArgs(
				key => args.configuration[key],
				false,
				variableResolver,
				this.logService
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
			args.configuration['terminal.integrated.cwd'],
			this.logService
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

		const ipcHandle = createRandomIPCHandle();
		env['VSCODE_IPC_HOOK_CLI'] = ipcHandle;
		const cliServer = new CLIServerBase(
			{
				executeCommand: (id, ...args) => this.executeCommand(uriTransformer, id, args)
			},
			this.logService,
			ipcHandle
		);

		const persistentTerminalId = await this.ptyService.createProcess(
			shellLaunchConfig,
			initialCwd,
			args.cols,
			args.rows,
			args.unicodeVersion,
			env,
			processEnv,
			false,
			args.shouldPersistTerminal,
			args.workspaceId,
			args.workspaceName
		);
		this.ptyService.onProcessExit(e => {
			if (e.id === persistentTerminalId) {
				cliServer.dispose();
			}
		});

		return {
			persistentTerminalId,
			resolvedShellLaunchConfig: shellLaunchConfig
		};
	}
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

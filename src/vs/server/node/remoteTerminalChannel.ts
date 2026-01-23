/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import { Emitter, Event } from '../../base/common/event.js';
import { cloneAndChange } from '../../base/common/objects.js';
import { Disposable } from '../../base/common/lifecycle.js';
import * as path from '../../base/common/path.js';
import * as platform from '../../base/common/platform.js';
import { URI } from '../../base/common/uri.js';
import { IURITransformer } from '../../base/common/uriIpc.js';
import { IServerChannel } from '../../base/parts/ipc/common/ipc.js';
import { createRandomIPCHandle } from '../../base/parts/ipc/node/ipc.net.js';
import { RemoteAgentConnectionContext } from '../../platform/remote/common/remoteAgentEnvironment.js';
import { IPtyHostService, IShellLaunchConfig, ITerminalProfile } from '../../platform/terminal/common/terminal.js';
import { IGetTerminalLayoutInfoArgs, ISetTerminalLayoutInfoArgs } from '../../platform/terminal/common/terminalProcess.js';
import { IWorkspaceFolder } from '../../platform/workspace/common/workspace.js';
import { createURITransformer } from '../../base/common/uriTransformer.js';
import { CLIServerBase, ICommandsExecuter } from '../../workbench/api/node/extHostCLIServer.js';
import { IEnvironmentVariableCollection } from '../../platform/terminal/common/environmentVariable.js';
import { MergedEnvironmentVariableCollection } from '../../platform/terminal/common/environmentVariableCollection.js';
import { deserializeEnvironmentDescriptionMap, deserializeEnvironmentVariableCollection } from '../../platform/terminal/common/environmentVariableShared.js';
import { ICreateTerminalProcessArguments, ICreateTerminalProcessResult, IWorkspaceFolderData, RemoteTerminalChannelEvent, RemoteTerminalChannelRequest } from '../../workbench/contrib/terminal/common/remote/terminal.js';
import * as terminalEnvironment from '../../workbench/contrib/terminal/common/terminalEnvironment.js';
import { AbstractVariableResolverService } from '../../workbench/services/configurationResolver/common/variableResolver.js';
import { buildUserEnvironment } from './extensionHostConnection.js';
import { IServerEnvironmentService } from './serverEnvironmentService.js';
import { IProductService } from '../../platform/product/common/productService.js';
import { IExtensionManagementService } from '../../platform/extensionManagement/common/extensionManagement.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { ILogService } from '../../platform/log/common/log.js';
import { promiseWithResolvers } from '../../base/common/async.js';
import { shouldUseEnvironmentVariableCollection } from '../../platform/terminal/common/terminalEnvironment.js';

class CustomVariableResolver extends AbstractVariableResolverService {
	constructor(
		env: platform.IProcessEnvironment,
		workspaceFolders: IWorkspaceFolder[],
		activeFileResource: URI | undefined,
		resolvedVariables: { [name: string]: string },
		extensionService: IExtensionManagementService,
	) {
		super({
			getFolderUri: (folderName: string): URI | undefined => {
				const found = workspaceFolders.filter(f => f.name === folderName);
				if (found && found.length > 0) {
					return found[0].uri;
				}
				return undefined;
			},
			getWorkspaceFolderCount: (): number => {
				return workspaceFolders.length;
			},
			getConfigurationValue: (folderUri: URI, section: string): string | undefined => {
				return resolvedVariables[`config:${section}`];
			},
			getExecPath: (): string | undefined => {
				return env['VSCODE_EXEC_PATH'];
			},
			getAppRoot: (): string | undefined => {
				return env['VSCODE_CWD'];
			},
			getFilePath: (): string | undefined => {
				if (activeFileResource) {
					return path.normalize(activeFileResource.fsPath);
				}
				return undefined;
			},
			getSelectedText: (): string | undefined => {
				return resolvedVariables['selectedText'];
			},
			getLineNumber: (): string | undefined => {
				return resolvedVariables['lineNumber'];
			},
			getColumnNumber: (): string | undefined => {
				return resolvedVariables['columnNumber'];
			},
			getExtension: async id => {
				const installed = await extensionService.getInstalled();
				const found = installed.find(e => e.identifier.id === id);
				return found && { extensionLocation: found.location };
			},
		}, undefined, Promise.resolve(os.homedir()), Promise.resolve(env));
	}
}

export class RemoteTerminalChannel extends Disposable implements IServerChannel<RemoteAgentConnectionContext> {

	private _lastReqId = 0;
	private readonly _pendingCommands = new Map<number, {
		resolve: (value: unknown) => void;
		reject: (err?: unknown) => void;
		uriTransformer: IURITransformer;
	}>();

	private readonly _onExecuteCommand = this._register(new Emitter<{ reqId: number; persistentProcessId: number; commandId: string; commandArgs: unknown[] }>());
	readonly onExecuteCommand = this._onExecuteCommand.event;

	constructor(
		private readonly _environmentService: IServerEnvironmentService,
		private readonly _logService: ILogService,
		private readonly _ptyHostService: IPtyHostService,
		private readonly _productService: IProductService,
		private readonly _extensionManagementService: IExtensionManagementService,
		private readonly _configurationService: IConfigurationService
	) {
		super();
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async call(ctx: RemoteAgentConnectionContext, command: RemoteTerminalChannelRequest, args?: any): Promise<any> {
		switch (command) {
			case RemoteTerminalChannelRequest.RestartPtyHost: return this._ptyHostService.restartPtyHost.apply(this._ptyHostService, args);

			case RemoteTerminalChannelRequest.CreateProcess: {
				const uriTransformer = createURITransformer(ctx.remoteAuthority);
				return this._createProcess(uriTransformer, <ICreateTerminalProcessArguments>args);
			}
			case RemoteTerminalChannelRequest.AttachToProcess: return this._ptyHostService.attachToProcess.apply(this._ptyHostService, args);
			case RemoteTerminalChannelRequest.DetachFromProcess: return this._ptyHostService.detachFromProcess.apply(this._ptyHostService, args);

			case RemoteTerminalChannelRequest.ListProcesses: return this._ptyHostService.listProcesses.apply(this._ptyHostService, args);
			case RemoteTerminalChannelRequest.GetLatency: return this._ptyHostService.getLatency.apply(this._ptyHostService, args);
			case RemoteTerminalChannelRequest.GetPerformanceMarks: return this._ptyHostService.getPerformanceMarks.apply(this._ptyHostService, args);
			case RemoteTerminalChannelRequest.OrphanQuestionReply: return this._ptyHostService.orphanQuestionReply.apply(this._ptyHostService, args);
			case RemoteTerminalChannelRequest.AcceptPtyHostResolvedVariables: return this._ptyHostService.acceptPtyHostResolvedVariables.apply(this._ptyHostService, args);

			case RemoteTerminalChannelRequest.Start: return this._ptyHostService.start.apply(this._ptyHostService, args);
			case RemoteTerminalChannelRequest.Input: return this._ptyHostService.input.apply(this._ptyHostService, args);
			case RemoteTerminalChannelRequest.SendSignal: return this._ptyHostService.sendSignal.apply(this._ptyHostService, args);
			case RemoteTerminalChannelRequest.AcknowledgeDataEvent: return this._ptyHostService.acknowledgeDataEvent.apply(this._ptyHostService, args);
			case RemoteTerminalChannelRequest.Shutdown: return this._ptyHostService.shutdown.apply(this._ptyHostService, args);
			case RemoteTerminalChannelRequest.Resize: return this._ptyHostService.resize.apply(this._ptyHostService, args);
			case RemoteTerminalChannelRequest.ClearBuffer: return this._ptyHostService.clearBuffer.apply(this._ptyHostService, args);
			case RemoteTerminalChannelRequest.GetInitialCwd: return this._ptyHostService.getInitialCwd.apply(this._ptyHostService, args);
			case RemoteTerminalChannelRequest.GetCwd: return this._ptyHostService.getCwd.apply(this._ptyHostService, args);

			case RemoteTerminalChannelRequest.ProcessBinary: return this._ptyHostService.processBinary.apply(this._ptyHostService, args);

			case RemoteTerminalChannelRequest.SendCommandResult: return this._sendCommandResult(args[0], args[1], args[2]);
			case RemoteTerminalChannelRequest.InstallAutoReply: return this._ptyHostService.installAutoReply.apply(this._ptyHostService, args);
			case RemoteTerminalChannelRequest.UninstallAllAutoReplies: return this._ptyHostService.uninstallAllAutoReplies.apply(this._ptyHostService, args);
			case RemoteTerminalChannelRequest.GetDefaultSystemShell: return this._getDefaultSystemShell.apply(this, args);
			case RemoteTerminalChannelRequest.GetProfiles: return this._getProfiles.apply(this, args);
			case RemoteTerminalChannelRequest.GetEnvironment: return this._getEnvironment();
			case RemoteTerminalChannelRequest.GetWslPath: return this._getWslPath(args[0], args[1]);
			case RemoteTerminalChannelRequest.GetTerminalLayoutInfo: return this._ptyHostService.getTerminalLayoutInfo(<IGetTerminalLayoutInfoArgs>args);
			case RemoteTerminalChannelRequest.SetTerminalLayoutInfo: return this._ptyHostService.setTerminalLayoutInfo(<ISetTerminalLayoutInfoArgs>args);
			case RemoteTerminalChannelRequest.SerializeTerminalState: return this._ptyHostService.serializeTerminalState.apply(this._ptyHostService, args);
			case RemoteTerminalChannelRequest.ReviveTerminalProcesses: return this._ptyHostService.reviveTerminalProcesses.apply(this._ptyHostService, args);
			case RemoteTerminalChannelRequest.GetRevivedPtyNewId: return this._ptyHostService.getRevivedPtyNewId.apply(this._ptyHostService, args);
			case RemoteTerminalChannelRequest.SetUnicodeVersion: return this._ptyHostService.setUnicodeVersion.apply(this._ptyHostService, args);
			case RemoteTerminalChannelRequest.SetNextCommandId: return this._ptyHostService.setNextCommandId.apply(this._ptyHostService, args);
			case RemoteTerminalChannelRequest.ReduceConnectionGraceTime: return this._reduceConnectionGraceTime();
			case RemoteTerminalChannelRequest.UpdateIcon: return this._ptyHostService.updateIcon.apply(this._ptyHostService, args);
			case RemoteTerminalChannelRequest.UpdateTitle: return this._ptyHostService.updateTitle.apply(this._ptyHostService, args);
			case RemoteTerminalChannelRequest.UpdateProperty: return this._ptyHostService.updateProperty.apply(this._ptyHostService, args);
			case RemoteTerminalChannelRequest.RefreshProperty: return this._ptyHostService.refreshProperty.apply(this._ptyHostService, args);
			case RemoteTerminalChannelRequest.RequestDetachInstance: return this._ptyHostService.requestDetachInstance(args[0], args[1]);
			case RemoteTerminalChannelRequest.AcceptDetachedInstance: return this._ptyHostService.acceptDetachInstanceReply(args[0], args[1]);
			case RemoteTerminalChannelRequest.FreePortKillProcess: return this._ptyHostService.freePortKillProcess.apply(this._ptyHostService, args);
			case RemoteTerminalChannelRequest.AcceptDetachInstanceReply: return this._ptyHostService.acceptDetachInstanceReply.apply(this._ptyHostService, args);
		}

		// @ts-expect-error Assert command is the `never` type to ensure all messages are handled
		throw new Error(`IPC Command ${command} not found`);
	}

	listen<T>(_: unknown, event: RemoteTerminalChannelEvent, _arg: unknown): Event<T> {
		switch (event) {
			case RemoteTerminalChannelEvent.OnPtyHostExitEvent: return (this._ptyHostService.onPtyHostExit || Event.None) as Event<T>;
			case RemoteTerminalChannelEvent.OnPtyHostStartEvent: return (this._ptyHostService.onPtyHostStart || Event.None) as Event<T>;
			case RemoteTerminalChannelEvent.OnPtyHostUnresponsiveEvent: return (this._ptyHostService.onPtyHostUnresponsive || Event.None) as Event<T>;
			case RemoteTerminalChannelEvent.OnPtyHostResponsiveEvent: return (this._ptyHostService.onPtyHostResponsive || Event.None) as Event<T>;
			case RemoteTerminalChannelEvent.OnPtyHostRequestResolveVariablesEvent: return (this._ptyHostService.onPtyHostRequestResolveVariables || Event.None) as Event<T>;
			case RemoteTerminalChannelEvent.OnProcessDataEvent: return (this._ptyHostService.onProcessData) as Event<T>;
			case RemoteTerminalChannelEvent.OnProcessReadyEvent: return (this._ptyHostService.onProcessReady) as Event<T>;
			case RemoteTerminalChannelEvent.OnProcessExitEvent: return (this._ptyHostService.onProcessExit) as Event<T>;
			case RemoteTerminalChannelEvent.OnProcessReplayEvent: return (this._ptyHostService.onProcessReplay) as Event<T>;
			case RemoteTerminalChannelEvent.OnProcessOrphanQuestion: return (this._ptyHostService.onProcessOrphanQuestion) as Event<T>;
			case RemoteTerminalChannelEvent.OnExecuteCommand: return (this.onExecuteCommand) as Event<T>;
			case RemoteTerminalChannelEvent.OnDidRequestDetach: return (this._ptyHostService.onDidRequestDetach || Event.None) as Event<T>;
			case RemoteTerminalChannelEvent.OnDidChangeProperty: return (this._ptyHostService.onDidChangeProperty) as Event<T>;
		}

		// @ts-expect-error Assert event is the `never` type to ensure all messages are handled
		throw new Error(`IPC Command ${event} not found`);
	}

	private async _createProcess(uriTransformer: IURITransformer, args: ICreateTerminalProcessArguments): Promise<ICreateTerminalProcessResult> {
		const shellLaunchConfig: IShellLaunchConfig = {
			name: args.shellLaunchConfig.name,
			executable: args.shellLaunchConfig.executable,
			args: args.shellLaunchConfig.args,
			cwd: (
				typeof args.shellLaunchConfig.cwd === 'string' || typeof args.shellLaunchConfig.cwd === 'undefined'
					? args.shellLaunchConfig.cwd
					: URI.revive(uriTransformer.transformIncoming(args.shellLaunchConfig.cwd))
			),
			env: args.shellLaunchConfig.env,
			useShellEnvironment: args.shellLaunchConfig.useShellEnvironment,
			reconnectionProperties: args.shellLaunchConfig.reconnectionProperties,
			type: args.shellLaunchConfig.type,
			isFeatureTerminal: args.shellLaunchConfig.isFeatureTerminal,
			tabActions: args.shellLaunchConfig.tabActions,
			shellIntegrationEnvironmentReporting: args.shellLaunchConfig.shellIntegrationEnvironmentReporting,
		};


		const baseEnv = await buildUserEnvironment(args.resolverEnv, !!args.shellLaunchConfig.useShellEnvironment, platform.language, this._environmentService, this._logService, this._configurationService);
		this._logService.trace('baseEnv', baseEnv);

		const reviveWorkspaceFolder = (workspaceData: IWorkspaceFolderData): IWorkspaceFolder => {
			return {
				uri: URI.revive(uriTransformer.transformIncoming(workspaceData.uri)),
				name: workspaceData.name,
				index: workspaceData.index,
				toResource: () => {
					throw new Error('Not implemented');
				}
			};
		};
		const workspaceFolders = args.workspaceFolders.map(reviveWorkspaceFolder);
		const activeWorkspaceFolder = args.activeWorkspaceFolder ? reviveWorkspaceFolder(args.activeWorkspaceFolder) : undefined;
		const activeFileResource = args.activeFileResource ? URI.revive(uriTransformer.transformIncoming(args.activeFileResource)) : undefined;
		const customVariableResolver = new CustomVariableResolver(baseEnv, workspaceFolders, activeFileResource, args.resolvedVariables, this._extensionManagementService);
		const variableResolver = terminalEnvironment.createVariableResolver(activeWorkspaceFolder, process.env, customVariableResolver);

		// Get the initial cwd
		const initialCwd = await terminalEnvironment.getCwd(shellLaunchConfig, os.homedir(), variableResolver, activeWorkspaceFolder?.uri, args.configuration['terminal.integrated.cwd'], this._logService);
		shellLaunchConfig.cwd = initialCwd;

		const envPlatformKey = platform.isWindows ? 'terminal.integrated.env.windows' : (platform.isMacintosh ? 'terminal.integrated.env.osx' : 'terminal.integrated.env.linux');
		const envFromConfig = args.configuration[envPlatformKey];
		const env = await terminalEnvironment.createTerminalEnvironment(
			shellLaunchConfig,
			envFromConfig,
			variableResolver,
			this._productService.version,
			args.configuration['terminal.integrated.detectLocale'],
			baseEnv
		);

		// Apply extension environment variable collections to the environment
		if (shouldUseEnvironmentVariableCollection(shellLaunchConfig)) {
			const entries: [string, IEnvironmentVariableCollection][] = [];
			for (const [k, v, d] of args.envVariableCollections) {
				entries.push([k, { map: deserializeEnvironmentVariableCollection(v), descriptionMap: deserializeEnvironmentDescriptionMap(d) }]);
			}
			const envVariableCollections = new Map<string, IEnvironmentVariableCollection>(entries);
			const mergedCollection = new MergedEnvironmentVariableCollection(envVariableCollections);
			const workspaceFolder = activeWorkspaceFolder ? activeWorkspaceFolder ?? undefined : undefined;
			await mergedCollection.applyToProcessEnvironment(env, { workspaceFolder }, variableResolver);
		}

		// Fork the process and listen for messages
		this._logService.debug(`Terminal process launching on remote agent`, { shellLaunchConfig, initialCwd, cols: args.cols, rows: args.rows, env });

		// Setup the CLI server to support forwarding commands run from the CLI
		const ipcHandlePath = createRandomIPCHandle();
		env.VSCODE_IPC_HOOK_CLI = ipcHandlePath;

		const persistentProcessId = await this._ptyHostService.createProcess(shellLaunchConfig, initialCwd, args.cols, args.rows, args.unicodeVersion, env, baseEnv, args.options, args.shouldPersistTerminal, args.workspaceId, args.workspaceName);
		const commandsExecuter: ICommandsExecuter = {
			executeCommand: <T>(id: string, ...args: unknown[]): Promise<T> => this._executeCommand(persistentProcessId, id, args, uriTransformer)
		};
		const cliServer = new CLIServerBase(commandsExecuter, this._logService, ipcHandlePath);
		this._ptyHostService.onProcessExit(e => e.id === persistentProcessId && cliServer.dispose());

		return {
			persistentTerminalId: persistentProcessId,
			resolvedShellLaunchConfig: shellLaunchConfig
		};
	}

	private _executeCommand<T>(persistentProcessId: number, commandId: string, commandArgs: unknown[], uriTransformer: IURITransformer): Promise<T> {
		const { resolve, reject, promise } = promiseWithResolvers<T>();

		const reqId = ++this._lastReqId;
		this._pendingCommands.set(reqId, { resolve: resolve as (value: unknown) => void, reject, uriTransformer });

		const serializedCommandArgs = cloneAndChange(commandArgs, (obj) => {
			if (obj && obj.$mid === 1) {
				// this is UriComponents
				return uriTransformer.transformOutgoing(obj);
			}
			if (obj && obj instanceof URI) {
				return uriTransformer.transformOutgoingURI(obj);
			}
			return undefined;
		});
		this._onExecuteCommand.fire({
			reqId,
			persistentProcessId,
			commandId,
			commandArgs: serializedCommandArgs
		});

		return promise;
	}

	private _sendCommandResult(reqId: number, isError: boolean, serializedPayload: unknown): void {
		const data = this._pendingCommands.get(reqId);
		if (!data) {
			return;
		}
		this._pendingCommands.delete(reqId);
		const payload = cloneAndChange(serializedPayload, (obj) => {
			if (obj && obj.$mid === 1) {
				// this is UriComponents
				return data.uriTransformer.transformIncoming(obj);
			}
			return undefined;
		});
		if (isError) {
			data.reject(payload);
		} else {
			data.resolve(payload);
		}
	}

	private _getDefaultSystemShell(osOverride?: platform.OperatingSystem): Promise<string> {
		return this._ptyHostService.getDefaultSystemShell(osOverride);
	}

	private async _getProfiles(workspaceId: string, profiles: unknown, defaultProfile: unknown, includeDetectedProfiles?: boolean): Promise<ITerminalProfile[]> {
		return this._ptyHostService.getProfiles(workspaceId, profiles, defaultProfile, includeDetectedProfiles) || [];
	}

	private _getEnvironment(): platform.IProcessEnvironment {
		return { ...process.env };
	}

	private _getWslPath(original: string, direction: 'unix-to-win' | 'win-to-unix'): Promise<string> {
		return this._ptyHostService.getWslPath(original, direction);
	}


	private _reduceConnectionGraceTime(): Promise<void> {
		return this._ptyHostService.reduceConnectionGraceTime();
	}
}

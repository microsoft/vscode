/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import { Emitter, Event } from 'vs/base/common/event';
import { cloneAndChange } from 'vs/base/common/objects';
import { Disposable } from 'vs/base/common/lifecycle';
import * as path from 'vs/base/common/path';
import * as platform from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { IURITransformer } from 'vs/base/common/uriIpc';
import { IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { createRandomIPCHandle } from 'vs/base/parts/ipc/node/ipc.net';
import { RemoteAgentConnectionContext } from 'vs/platform/remote/common/remoteAgentEnvironment';
import { IPtyHostService, IShellLaunchConfig, ITerminalProfile } from 'vs/platform/terminal/common/terminal';
import { IGetTerminalLayoutInfoArgs, ISetTerminalLayoutInfoArgs } from 'vs/platform/terminal/common/terminalProcess';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { createURITransformer } from 'vs/workbench/api/node/uriTransformer';
import { CLIServerBase, ICommandsExecuter } from 'vs/workbench/api/node/extHostCLIServer';
import { IEnvironmentVariableCollection } from 'vs/platform/terminal/common/environmentVariable';
import { MergedEnvironmentVariableCollection } from 'vs/platform/terminal/common/environmentVariableCollection';
import { deserializeEnvironmentDescriptionMap, deserializeEnvironmentVariableCollection } from 'vs/platform/terminal/common/environmentVariableShared';
import { ICreateTerminalProcessArguments, ICreateTerminalProcessResult, IWorkspaceFolderData } from 'vs/workbench/contrib/terminal/common/remoteTerminalChannel';
import * as terminalEnvironment from 'vs/workbench/contrib/terminal/common/terminalEnvironment';
import { AbstractVariableResolverService } from 'vs/workbench/services/configurationResolver/common/variableResolver';
import { buildUserEnvironment } from 'vs/server/node/extensionHostConnection';
import { IServerEnvironmentService } from 'vs/server/node/serverEnvironmentService';
import { IProductService } from 'vs/platform/product/common/productService';
import { IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { withNullAsUndefined } from 'vs/base/common/types';
import { ILogService } from 'vs/platform/log/common/log';

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
		resolve: (data: any) => void;
		reject: (err: any) => void;
		uriTransformer: IURITransformer;
	}>();

	private readonly _onExecuteCommand = this._register(new Emitter<{ reqId: number; persistentProcessId: number; commandId: string; commandArgs: any[] }>());
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

	async call(ctx: RemoteAgentConnectionContext, command: string, args?: any): Promise<any> {
		switch (command) {
			case '$restartPtyHost': return this._ptyHostService.restartPtyHost.apply(this._ptyHostService, args);

			case '$createProcess': {
				const uriTransformer = createURITransformer(ctx.remoteAuthority);
				return this._createProcess(uriTransformer, <ICreateTerminalProcessArguments>args);
			}
			case '$attachToProcess': return this._ptyHostService.attachToProcess.apply(this._ptyHostService, args);
			case '$detachFromProcess': return this._ptyHostService.detachFromProcess.apply(this._ptyHostService, args);

			case '$listProcesses': return this._ptyHostService.listProcesses.apply(this._ptyHostService, args);
			case '$getPerformanceMarks': return this._ptyHostService.getPerformanceMarks.apply(this._ptyHostService, args);
			case '$orphanQuestionReply': return this._ptyHostService.orphanQuestionReply.apply(this._ptyHostService, args);
			case '$acceptPtyHostResolvedVariables': return this._ptyHostService.acceptPtyHostResolvedVariables.apply(this._ptyHostService, args);

			case '$start': return this._ptyHostService.start.apply(this._ptyHostService, args);
			case '$input': return this._ptyHostService.input.apply(this._ptyHostService, args);
			case '$acknowledgeDataEvent': return this._ptyHostService.acknowledgeDataEvent.apply(this._ptyHostService, args);
			case '$shutdown': return this._ptyHostService.shutdown.apply(this._ptyHostService, args);
			case '$resize': return this._ptyHostService.resize.apply(this._ptyHostService, args);
			case '$clearBuffer': return this._ptyHostService.clearBuffer.apply(this._ptyHostService, args);
			case '$getInitialCwd': return this._ptyHostService.getInitialCwd.apply(this._ptyHostService, args);
			case '$getCwd': return this._ptyHostService.getCwd.apply(this._ptyHostService, args);

			case '$processBinary': return this._ptyHostService.processBinary.apply(this._ptyHostService, args);

			case '$sendCommandResult': return this._sendCommandResult(args[0], args[1], args[2]);
			case '$installAutoReply': return this._ptyHostService.installAutoReply.apply(this._ptyHostService, args);
			case '$uninstallAllAutoReplies': return this._ptyHostService.uninstallAllAutoReplies.apply(this._ptyHostService, args);
			case '$getDefaultSystemShell': return this._getDefaultSystemShell.apply(this, args);
			case '$getProfiles': return this._getProfiles.apply(this, args);
			case '$getEnvironment': return this._getEnvironment();
			case '$getWslPath': return this._getWslPath(args[0], args[1]);
			case '$getTerminalLayoutInfo': return this._ptyHostService.getTerminalLayoutInfo(<IGetTerminalLayoutInfoArgs>args);
			case '$setTerminalLayoutInfo': return this._ptyHostService.setTerminalLayoutInfo(<ISetTerminalLayoutInfoArgs>args);
			case '$serializeTerminalState': return this._ptyHostService.serializeTerminalState.apply(this._ptyHostService, args);
			case '$reviveTerminalProcesses': return this._ptyHostService.reviveTerminalProcesses.apply(this._ptyHostService, args);
			case '$getRevivedPtyNewId': return this._ptyHostService.getRevivedPtyNewId.apply(this._ptyHostService, args);
			case '$setUnicodeVersion': return this._ptyHostService.setUnicodeVersion.apply(this._ptyHostService, args);
			case '$reduceConnectionGraceTime': return this._reduceConnectionGraceTime();
			case '$updateIcon': return this._ptyHostService.updateIcon.apply(this._ptyHostService, args);
			case '$updateTitle': return this._ptyHostService.updateTitle.apply(this._ptyHostService, args);
			case '$updateProperty': return this._ptyHostService.updateProperty.apply(this._ptyHostService, args);
			case '$refreshProperty': return this._ptyHostService.refreshProperty.apply(this._ptyHostService, args);
			case '$requestDetachInstance': return this._ptyHostService.requestDetachInstance(args[0], args[1]);
			case '$acceptDetachedInstance': return this._ptyHostService.acceptDetachInstanceReply(args[0], args[1]);
			case '$freePortKillProcess': return this._ptyHostService.freePortKillProcess.apply(this._ptyHostService, args);
		}

		throw new Error(`IPC Command ${command} not found`);
	}

	listen(_: any, event: string, arg: any): Event<any> {
		switch (event) {
			case '$onPtyHostExitEvent': return this._ptyHostService.onPtyHostExit || Event.None;
			case '$onPtyHostStartEvent': return this._ptyHostService.onPtyHostStart || Event.None;
			case '$onPtyHostUnresponsiveEvent': return this._ptyHostService.onPtyHostUnresponsive || Event.None;
			case '$onPtyHostResponsiveEvent': return this._ptyHostService.onPtyHostResponsive || Event.None;
			case '$onPtyHostRequestResolveVariablesEvent': return this._ptyHostService.onPtyHostRequestResolveVariables || Event.None;
			case '$onProcessDataEvent': return this._ptyHostService.onProcessData;
			case '$onProcessReadyEvent': return this._ptyHostService.onProcessReady;
			case '$onProcessExitEvent': return this._ptyHostService.onProcessExit;
			case '$onProcessReplayEvent': return this._ptyHostService.onProcessReplay;
			case '$onProcessOrphanQuestion': return this._ptyHostService.onProcessOrphanQuestion;
			case '$onExecuteCommand': return this.onExecuteCommand;
			case '$onDidRequestDetach': return this._ptyHostService.onDidRequestDetach || Event.None;
			case '$onDidChangeProperty': return this._ptyHostService.onDidChangeProperty;
			default:
				break;
		}

		throw new Error('Not supported');
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
			isFeatureTerminal: args.shellLaunchConfig.isFeatureTerminal
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
		if (!shellLaunchConfig.strictEnv) {
			const entries: [string, IEnvironmentVariableCollection][] = [];
			for (const [k, v, d] of args.envVariableCollections) {
				entries.push([k, { map: deserializeEnvironmentVariableCollection(v), descriptionMap: deserializeEnvironmentDescriptionMap(d) }]);
			}
			const envVariableCollections = new Map<string, IEnvironmentVariableCollection>(entries);
			const mergedCollection = new MergedEnvironmentVariableCollection(envVariableCollections);
			const workspaceFolder = activeWorkspaceFolder ? withNullAsUndefined(activeWorkspaceFolder) : undefined;
			await mergedCollection.applyToProcessEnvironment(env, { workspaceFolder }, variableResolver);
		}

		// Fork the process and listen for messages
		this._logService.debug(`Terminal process launching on remote agent`, { shellLaunchConfig, initialCwd, cols: args.cols, rows: args.rows, env });

		// Setup the CLI server to support forwarding commands run from the CLI
		const ipcHandlePath = createRandomIPCHandle();
		env.VSCODE_IPC_HOOK_CLI = ipcHandlePath;

		const persistentProcessId = await this._ptyHostService.createProcess(shellLaunchConfig, initialCwd, args.cols, args.rows, args.unicodeVersion, env, baseEnv, args.options, args.shouldPersistTerminal, args.workspaceId, args.workspaceName);
		const commandsExecuter: ICommandsExecuter = {
			executeCommand: <T>(id: string, ...args: any[]): Promise<T> => this._executeCommand(persistentProcessId, id, args, uriTransformer)
		};
		const cliServer = new CLIServerBase(commandsExecuter, this._logService, ipcHandlePath);
		this._ptyHostService.onProcessExit(e => e.id === persistentProcessId && cliServer.dispose());

		return {
			persistentTerminalId: persistentProcessId,
			resolvedShellLaunchConfig: shellLaunchConfig
		};
	}

	private _executeCommand<T>(persistentProcessId: number, commandId: string, commandArgs: any[], uriTransformer: IURITransformer): Promise<T> {
		let resolve!: (data: any) => void;
		let reject!: (err: any) => void;
		const result = new Promise<T>((_resolve, _reject) => {
			resolve = _resolve;
			reject = _reject;
		});

		const reqId = ++this._lastReqId;
		this._pendingCommands.set(reqId, { resolve, reject, uriTransformer });

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

		return result;
	}

	private _sendCommandResult(reqId: number, isError: boolean, serializedPayload: any): void {
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

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
import { IPtyService, IShellLaunchConfig, ITerminalProfile } from 'vs/platform/terminal/common/terminal';
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
		private readonly _ptyService: IPtyService,
		private readonly _productService: IProductService,
		private readonly _extensionManagementService: IExtensionManagementService,
		private readonly _configurationService: IConfigurationService
	) {
		super();
	}

	async call(ctx: RemoteAgentConnectionContext, command: string, args?: any): Promise<any> {
		switch (command) {
			case '$restartPtyHost': return this._ptyService.restartPtyHost?.apply(this._ptyService, args);

			case '$createProcess': {
				const uriTransformer = createURITransformer(ctx.remoteAuthority);
				return this._createProcess(uriTransformer, <ICreateTerminalProcessArguments>args);
			}
			case '$attachToProcess': return this._ptyService.attachToProcess.apply(this._ptyService, args);
			case '$detachFromProcess': return this._ptyService.detachFromProcess.apply(this._ptyService, args);

			case '$listProcesses': return this._ptyService.listProcesses.apply(this._ptyService, args);
			case '$getPerformanceMarks': return this._ptyService.getPerformanceMarks.apply(this._ptyService, args);
			case '$orphanQuestionReply': return this._ptyService.orphanQuestionReply.apply(this._ptyService, args);
			case '$acceptPtyHostResolvedVariables': return this._ptyService.acceptPtyHostResolvedVariables?.apply(this._ptyService, args);

			case '$start': return this._ptyService.start.apply(this._ptyService, args);
			case '$input': return this._ptyService.input.apply(this._ptyService, args);
			case '$acknowledgeDataEvent': return this._ptyService.acknowledgeDataEvent.apply(this._ptyService, args);
			case '$shutdown': return this._ptyService.shutdown.apply(this._ptyService, args);
			case '$resize': return this._ptyService.resize.apply(this._ptyService, args);
			case '$clearBuffer': return this._ptyService.clearBuffer.apply(this._ptyService, args);
			case '$getInitialCwd': return this._ptyService.getInitialCwd.apply(this._ptyService, args);
			case '$getCwd': return this._ptyService.getCwd.apply(this._ptyService, args);

			case '$processBinary': return this._ptyService.processBinary.apply(this._ptyService, args);

			case '$sendCommandResult': return this._sendCommandResult(args[0], args[1], args[2]);
			case '$installAutoReply': return this._ptyService.installAutoReply.apply(this._ptyService, args);
			case '$uninstallAllAutoReplies': return this._ptyService.uninstallAllAutoReplies.apply(this._ptyService, args);
			case '$getDefaultSystemShell': return this._getDefaultSystemShell.apply(this, args);
			case '$getProfiles': return this._getProfiles.apply(this, args);
			case '$getEnvironment': return this._getEnvironment();
			case '$getWslPath': return this._getWslPath(args[0], args[1]);
			case '$getTerminalLayoutInfo': return this._ptyService.getTerminalLayoutInfo(<IGetTerminalLayoutInfoArgs>args);
			case '$setTerminalLayoutInfo': return this._ptyService.setTerminalLayoutInfo(<ISetTerminalLayoutInfoArgs>args);
			case '$serializeTerminalState': return this._ptyService.serializeTerminalState.apply(this._ptyService, args);
			case '$reviveTerminalProcesses': return this._ptyService.reviveTerminalProcesses.apply(this._ptyService, args);
			case '$getRevivedPtyNewId': return this._ptyService.getRevivedPtyNewId.apply(this._ptyService, args);
			case '$setUnicodeVersion': return this._ptyService.setUnicodeVersion.apply(this._ptyService, args);
			case '$reduceConnectionGraceTime': return this._reduceConnectionGraceTime();
			case '$updateIcon': return this._ptyService.updateIcon.apply(this._ptyService, args);
			case '$updateTitle': return this._ptyService.updateTitle.apply(this._ptyService, args);
			case '$updateProperty': return this._ptyService.updateProperty.apply(this._ptyService, args);
			case '$refreshProperty': return this._ptyService.refreshProperty.apply(this._ptyService, args);
			case '$requestDetachInstance': return this._ptyService.requestDetachInstance(args[0], args[1]);
			case '$acceptDetachedInstance': return this._ptyService.acceptDetachInstanceReply(args[0], args[1]);
			case '$freePortKillProcess': return this._ptyService.freePortKillProcess?.apply(this._ptyService, args);
		}

		throw new Error(`IPC Command ${command} not found`);
	}

	listen(_: any, event: string, arg: any): Event<any> {
		switch (event) {
			case '$onPtyHostExitEvent': return this._ptyService.onPtyHostExit || Event.None;
			case '$onPtyHostStartEvent': return this._ptyService.onPtyHostStart || Event.None;
			case '$onPtyHostUnresponsiveEvent': return this._ptyService.onPtyHostUnresponsive || Event.None;
			case '$onPtyHostResponsiveEvent': return this._ptyService.onPtyHostResponsive || Event.None;
			case '$onPtyHostRequestResolveVariablesEvent': return this._ptyService.onPtyHostRequestResolveVariables || Event.None;
			case '$onProcessDataEvent': return this._ptyService.onProcessData;
			case '$onProcessReadyEvent': return this._ptyService.onProcessReady;
			case '$onProcessExitEvent': return this._ptyService.onProcessExit;
			case '$onProcessReplayEvent': return this._ptyService.onProcessReplay;
			case '$onProcessOrphanQuestion': return this._ptyService.onProcessOrphanQuestion;
			case '$onExecuteCommand': return this.onExecuteCommand;
			case '$onDidRequestDetach': return this._ptyService.onDidRequestDetach || Event.None;
			case '$onDidChangeProperty': return this._ptyService.onDidChangeProperty;
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

		const persistentProcessId = await this._ptyService.createProcess(shellLaunchConfig, initialCwd, args.cols, args.rows, args.unicodeVersion, env, baseEnv, args.options, args.shouldPersistTerminal, args.workspaceId, args.workspaceName);
		const commandsExecuter: ICommandsExecuter = {
			executeCommand: <T>(id: string, ...args: any[]): Promise<T> => this._executeCommand(persistentProcessId, id, args, uriTransformer)
		};
		const cliServer = new CLIServerBase(commandsExecuter, this._logService, ipcHandlePath);
		this._ptyService.onProcessExit(e => e.id === persistentProcessId && cliServer.dispose());

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
		return this._ptyService.getDefaultSystemShell(osOverride);
	}

	private async _getProfiles(workspaceId: string, profiles: unknown, defaultProfile: unknown, includeDetectedProfiles?: boolean): Promise<ITerminalProfile[]> {
		return this._ptyService.getProfiles?.(workspaceId, profiles, defaultProfile, includeDetectedProfiles) || [];
	}

	private _getEnvironment(): platform.IProcessEnvironment {
		return { ...process.env };
	}

	private _getWslPath(original: string, direction: 'unix-to-win' | 'win-to-unix'): Promise<string> {
		return this._ptyService.getWslPath(original, direction);
	}


	private _reduceConnectionGraceTime(): Promise<void> {
		return this._ptyService.reduceConnectionGraceTime();
	}
}

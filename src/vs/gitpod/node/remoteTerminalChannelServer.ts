/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Typefox. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { TaskStatus } from '@gitpod/supervisor-api-grpc/lib/status_pb';
import { ListTerminalsRequest } from '@gitpod/supervisor-api-grpc/lib/terminal_pb';
import * as os from 'os';
import * as path from 'path';
import * as util from 'util';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Event } from 'vs/base/common/event';
import { TernarySearchTree } from 'vs/base/common/map';
import * as platform from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { IRawURITransformer, transformIncomingURIs, transformOutgoingURIs, URITransformer } from 'vs/base/common/uriIpc';
import { getSystemShellSync } from 'vs/base/node/shell';
import { IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { supervisorDeadlines, supervisorMetadata, terminalServiceClient } from 'vs/gitpod/node/supervisor-client';
import { OpenSupervisorTerminalProcessOptions, SupervisorTerminalProcess } from 'vs/gitpod/node/supervisorTerminalProcess';
import { ILogService } from 'vs/platform/log/common/log';
import product from 'vs/platform/product/common/product';
import { RemoteAgentConnectionContext } from 'vs/platform/remote/common/remoteAgentEnvironment';
import { IRawTerminalTabLayoutInfo, IShellLaunchConfig, ITerminalLaunchError, ITerminalsLayoutInfo, ITerminalTabLayoutInfoById } from 'vs/platform/terminal/common/terminal';
import { TerminalDataBufferer } from 'vs/platform/terminal/common/terminalDataBuffering';
import { IGetTerminalLayoutInfoArgs, ISetTerminalLayoutInfoArgs } from 'vs/platform/terminal/common/terminalProcess';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { IEnvironmentVariableCollection } from 'vs/workbench/contrib/terminal/common/environmentVariable';
import { MergedEnvironmentVariableCollection } from 'vs/workbench/contrib/terminal/common/environmentVariableCollection';
import { deserializeEnvironmentVariableCollection } from 'vs/workbench/contrib/terminal/common/environmentVariableShared';
import { ICreateTerminalProcessArguments, ICreateTerminalProcessResult, IGetTerminalCwdArguments, IGetTerminalInitialCwdArguments, IOnTerminalProcessEventArguments, IResizeTerminalProcessArguments, ISendCharCountToTerminalProcessArguments, ISendInputToTerminalProcessArguments, IShutdownTerminalProcessArguments, IStartTerminalProcessArguments, IWorkspaceFolderData } from 'vs/workbench/contrib/terminal/common/remoteTerminalChannel';
import { IRemoteTerminalAttachTarget } from 'vs/workbench/contrib/terminal/common/terminal';
import * as terminalEnvironment from 'vs/workbench/contrib/terminal/common/terminalEnvironment';
import { getMainProcessParentEnv } from 'vs/workbench/contrib/terminal/node/terminalEnvironment';
import { AbstractVariableResolverService } from 'vs/workbench/services/configurationResolver/common/variableResolver';

type TerminalOpenMode = 'split-top' | 'split-left' | 'split-right' | 'split-bottom' | 'tab-before' | 'tab-after';
const defaultOpenMode: TerminalOpenMode = 'tab-after';
const terminalOpenModes: Set<TerminalOpenMode> = new Set(['split-top', 'split-left', 'split-right', 'split-bottom', 'tab-before', 'tab-after']);
function asTerminalOpenMode(mode: any): TerminalOpenMode {
	if (terminalOpenModes.has(mode)) {
		return mode;
	}
	return defaultOpenMode;
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
		}, undefined, env);

		// setup the workspace folder data structure
		folders.forEach(folder => {
			this.structure.set(folder.uri, folder);
		});
	}

}
const toWorkspaceFolder = (data: IWorkspaceFolderData) => ({
	uri: URI.revive(data.uri),
	name: data.name,
	index: data.index,
	toResource: () => {
		throw new Error('Not implemented');
	}
});

export class RemoteTerminalChannelServer implements IServerChannel<RemoteAgentConnectionContext> {
	private terminalIdSeq = 1;
	private readonly terminalProcesses = new Map<number, SupervisorTerminalProcess>();
	private readonly aliasToId = new Map<string, number>();
	private readonly bufferer = new TerminalDataBufferer(
		(id, data) => {
			const terminalProcess = this.terminalProcesses.get(id);
			if (terminalProcess) {
				terminalProcess['_onEvent'].fire({
					type: 'data',
					data
				});
			}
		}
	);
	private readonly layoutInfo = new Map<string, ITerminalTabLayoutInfoById[]>();

	constructor(
		private rawURITransformerFactory: (remoteAuthority: string) => IRawURITransformer,
		private logService: ILogService,
		private synchingTasks: Promise<Map<string, TaskStatus>>
	) { }

	private createTerminalProcess(
		initialCwd: string,
		workspaceId: string,
		workspaceName: string,
		shouldPersistTerminal: boolean,
		openOptions?: OpenSupervisorTerminalProcessOptions
	): SupervisorTerminalProcess {
		const terminalProcess = new SupervisorTerminalProcess(
			this.terminalIdSeq++,
			initialCwd,
			workspaceId,
			workspaceName,
			shouldPersistTerminal,
			this.logService,
			openOptions
		);
		this.terminalProcesses.set(terminalProcess.id, terminalProcess);
		terminalProcess.add({
			dispose: () => {
				this.terminalProcesses.delete(terminalProcess.id);
			}
		});
		this.bufferer.startBuffering(terminalProcess.id, terminalProcess.onProcessData);
		terminalProcess.add({
			dispose: () => {
				this.bufferer.stopBuffering(terminalProcess.id);
			}
		});
		return terminalProcess;
	}
	private attachTerminalProcess(terminalProcess: SupervisorTerminalProcess): void {
		const alias = terminalProcess.alias;
		if (!alias) {
			return;
		}
		this.aliasToId.set(alias, terminalProcess.id);
		terminalProcess.add({ dispose: () => this.aliasToId.delete(alias) });
	}
	async call(ctx: RemoteAgentConnectionContext, command: string, arg?: any, cancellationToken?: CancellationToken | undefined): Promise<any> {
		if (command === '$createTerminalProcess') {
			const uriTranformer = new URITransformer(this.rawURITransformerFactory(ctx.remoteAuthority));
			const args = transformIncomingURIs(arg as ICreateTerminalProcessArguments, uriTranformer);
			const shellLaunchConfigDto = args.shellLaunchConfig;
			// see  $spawnExtHostProcess in src/vs/workbench/api/node/extHostTerminalService.ts for a reference implementation
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

			const procesEnv = { ...process.env, ...args.resolverEnv } as platform.IProcessEnvironment;
			const configurationResolverService = new RemoteTerminalVariableResolverService(
				args.workspaceFolders.map(toWorkspaceFolder),
				args.resolvedVariables,
				args.activeFileResource ? URI.revive(args.activeFileResource) : undefined,
				procesEnv
			);
			const variableResolver = terminalEnvironment.createVariableResolver(lastActiveWorkspace, configurationResolverService);

			// Merge in shell and args from settings
			if (!shellLaunchConfig.executable) {
				shellLaunchConfig.executable = terminalEnvironment.getDefaultShell(
					key => args.configuration[key],
					args.isWorkspaceShellAllowed,
					getSystemShellSync(platform.platform),
					process.env.hasOwnProperty('PROCESSOR_ARCHITEW6432'),
					process.env.windir,
					variableResolver,
					this.logService,
					false
				);
				shellLaunchConfig.args = terminalEnvironment.getDefaultShellArgs(
					key => args.configuration[key],
					args.isWorkspaceShellAllowed,
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
			const initialCwd = terminalEnvironment.getCwd(
				shellLaunchConfig,
				os.homedir(),
				variableResolver,
				lastActiveWorkspace?.uri,
				args.configuration['terminal.integrated.cwd'], this.logService
			);
			shellLaunchConfig.cwd = initialCwd;

			const envFromConfig = args.configuration['terminal.integrated.env.linux'];
			const baseEnv = args.configuration['terminal.integrated.inheritEnv'] ? procesEnv : await getMainProcessParentEnv(procesEnv);
			const env = terminalEnvironment.createTerminalEnvironment(
				shellLaunchConfig,
				envFromConfig,
				variableResolver,
				args.isWorkspaceShellAllowed,
				product.version,
				args.configuration['terminal.integrated.detectLocale'] || 'auto',
				baseEnv
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

			const terminalProcess = this.createTerminalProcess(
				initialCwd,
				args.workspaceId,
				args.workspaceName,
				args.shouldPersistTerminal,
				{
					shell: shellLaunchConfig.executable!,
					shellArgs: typeof shellLaunchConfig.args === 'string' ? [shellLaunchConfig.args] : shellLaunchConfig.args || [],
					cols: args.cols,
					rows: args.rows,
					env
				});
			const result: ICreateTerminalProcessResult = {
				terminalId: terminalProcess.id,
				resolvedShellLaunchConfig: shellLaunchConfig
			};
			return transformOutgoingURIs(result, uriTranformer);
		}
		if (command === '$startTerminalProcess') {
			const args: IStartTerminalProcessArguments = arg;
			const terminalProcess = this.terminalProcesses.get(args.id);
			if (!terminalProcess) {
				return <ITerminalLaunchError>{
					message: 'terminal not found'
				};
			}
			const result = await terminalProcess.start();
			this.attachTerminalProcess(terminalProcess);
			return result;
		}
		if (command === '$shutdownTerminalProcess') {
			const args: IShutdownTerminalProcessArguments = arg;
			const terminalProcess = this.terminalProcesses.get(args.id);
			if (!terminalProcess) {
				throw new Error('terminal not found');
			}
			return terminalProcess.shutdown(args.immediate);
		}
		if (command === '$sendInputToTerminalProcess') {
			const args: ISendInputToTerminalProcessArguments = arg;
			const terminalProcess = this.terminalProcesses.get(args.id);
			if (!terminalProcess) {
				throw new Error('terminal not found');
			}
			return terminalProcess.input(args.data);
		}
		if (command === '$resizeTerminalProcess') {
			const args: IResizeTerminalProcessArguments = arg;
			const terminalProcess = this.terminalProcesses.get(args.id);
			if (!terminalProcess) {
				throw new Error('terminal not found');
			}
			return terminalProcess.resize(args.cols, args.rows);
		}
		if (command === '$getTerminalInitialCwd') {
			const args: IGetTerminalInitialCwdArguments = arg;
			const terminalProcess = this.terminalProcesses.get(args.id);
			if (!terminalProcess) {
				throw new Error('terminal not found');
			}
			return terminalProcess.getInitialCwd();
		}
		if (command === '$getTerminalCwd') {
			const args: IGetTerminalCwdArguments = arg;
			const terminalProcess = this.terminalProcesses.get(args.id);
			if (!terminalProcess) {
				throw new Error('terminal not found');
			}
			return terminalProcess.getCwd();
		}
		if (command === '$sendCharCountToTerminalProcess') {
			const args: ISendCharCountToTerminalProcessArguments = arg;
			const terminalProcess = this.terminalProcesses.get(args.id);
			if (!terminalProcess) {
				throw new Error('terminal not found');
			}
			return terminalProcess.acknowledgeDataEvent(args.charCount);
		}
		/*if (command === '$sendCommandResultToTerminalProcess') {
			const args: ISendCommandResultToTerminalProcessArguments = arg;
			return;
		}
		if (command === '$orphanQuestionReply') {
			const args: IOrphanQuestionReplyArgs = arg;
			return;
		}*/
		if (command === '$listTerminals') {
			try {
				const state = await this.sync();
				const result: IRemoteTerminalAttachTarget[] = [...state.terminals.values()];
				return result;
			} catch (e) {
				this.logService.error('code server: failed to list remote terminals:', e);
				return [];
			}
		}
		if (command === '$getTerminalLayoutInfo') {
			try {
				const result = await this.getTerminalLayoutInfo(arg as IGetTerminalLayoutInfoArgs);
				return result;
			} catch (e) {
				this.logService.error('code server: failed to get terminal layout info:', e);
				return [];
			}
		}
		if (command === '$setTerminalLayoutInfo') {
			const args: ISetTerminalLayoutInfoArgs = arg;
			this.layoutInfo.set(args.workspaceId, args.tabs);
			return;
		}
		this.logService.error('Unknown command: RemoteTerminalChannel.' + command);
		throw new Error('Unknown command: RemoteTerminalChannel.' + command);
	}
	listen(ctx: RemoteAgentConnectionContext, event: string, arg?: any): Event<any> {
		if (event === '$onTerminalProcessEvent') {
			const args: IOnTerminalProcessEventArguments = arg;
			const terminalProcess = this.terminalProcesses.get(args.id);
			if (!terminalProcess) {
				throw new Error('terminal not found');
			}
			return terminalProcess.onEvent;
		}
		this.logService.error('Unknown event: RemoteTerminalChannel.' + event);
		throw new Error('Unknown event: RemoteTerminalChannel.' + event);
	}

	private async getTerminalLayoutInfo(arg: IGetTerminalLayoutInfoArgs): Promise<ITerminalsLayoutInfo> {
		const { tasks, terminals: targets } = await this.sync(arg);
		const result: ITerminalsLayoutInfo = { tabs: [] };
		if (this.layoutInfo.has(arg.workspaceId)) {
			// restoring layout
			for (const tab of this.layoutInfo.get(arg.workspaceId)!) {
				result.tabs.push({
					...tab,
					terminals: tab.terminals.map(terminal => {
						const target = targets.get(terminal.terminal) || null;
						return {
							...terminal,
							terminal: target
						};
					})
				});
			}
		} else {
			// initial layout
			type Tab = IRawTerminalTabLayoutInfo<IRemoteTerminalAttachTarget | null>;
			let currentTab: Tab | undefined;
			let currentTerminal: IRemoteTerminalAttachTarget | undefined;
			const layoutTerminal = (terminal: IRemoteTerminalAttachTarget, mode: TerminalOpenMode = defaultOpenMode) => {
				if (!currentTab) {
					currentTab = {
						isActive: false,
						activePersistentTerminalId: terminal.id,
						terminals: [{ relativeSize: 1, terminal }]
					};
					result.tabs.push(currentTab);
				} else if (mode === 'tab-after' || mode === 'tab-before') {
					const tab: Tab = {
						isActive: false,
						activePersistentTerminalId: terminal.id,
						terminals: [{ relativeSize: 1, terminal }]
					};
					const currentIndex = result.tabs.indexOf(currentTab);
					const direction = mode === 'tab-after' ? 1 : -1;
					result.tabs.splice(currentIndex + direction, 0, tab);
					currentTab = tab;
				} else {
					currentTab.activePersistentTerminalId = terminal.id;
					let currentIndex = -1;
					const relativeSize = 1 / (currentTab.terminals.length + 1);
					currentTab.terminals.forEach((info, index) => {
						info.relativeSize = relativeSize;
						if (info.terminal === currentTerminal) {
							currentIndex = index;
						}
					});
					const direction = (mode === 'split-right' || mode === 'split-bottom') ? 1 : -1;
					currentTab.terminals.splice(currentIndex + direction, 0, { relativeSize, terminal });
				}
				currentTerminal = terminal;
			};
			for (const [alias, status] of tasks) {
				const id = this.aliasToId.get(alias);
				if (typeof id !== 'number') {
					continue;
				}
				const terminal = targets.get(id);
				if (terminal) {
					targets.delete(id);
					layoutTerminal(terminal, asTerminalOpenMode(status.getPresentation()?.getOpenMode()));
				}
			}
			for (const id of targets.keys()) {
				const terminal = targets.get(id);
				if (terminal) {
					layoutTerminal(terminal);
				}
			}
			if (currentTab) {
				currentTab.isActive = true;
			}
		}

		return result;
	}

	private async sync(arg?: IGetTerminalLayoutInfoArgs): Promise<{
		tasks: Map<string, TaskStatus>,
		terminals: Map<number, IRemoteTerminalAttachTarget>
	}> {
		const tasks = await this.synchingTasks;
		try {
			const response = await util.promisify(terminalServiceClient.list.bind(terminalServiceClient, new ListTerminalsRequest(), supervisorMetadata, {
				deadline: Date.now() + supervisorDeadlines.long
			}))();
			for (const terminal of response.getTerminalsList()) {
				const alias = terminal.getAlias();
				const id = this.aliasToId.get(alias);
				const annotations = terminal.getAnnotationsMap();
				const workspaceId = annotations.get('workspaceId') || '';
				const workspaceName = annotations.get('workspaceName') || '';
				const shouldPersistTerminal = tasks.has(alias) || Boolean(annotations.get('shouldPersistTerminal'));
				if (id) {
					const terminalProcess = this.terminalProcesses.get(id);
					if (terminalProcess) {
						terminalProcess.syncState = terminal.toObject();
					}
				} else {
					const terminalProcess = this.createTerminalProcess(
						terminal.getInitialWorkdir(),
						workspaceId,
						workspaceName,
						shouldPersistTerminal
					);

					terminalProcess.syncState = terminal.toObject();
					this.attachTerminalProcess(terminalProcess);
				}
			}
		} catch (e) {
			console.error('code server: failed to sync terminals:', e);
		}
		const terminals = new Map<number, IRemoteTerminalAttachTarget>();
		for (const terminal of this.terminalProcesses.values()) {
			if (terminal.syncState && (!arg || (
				arg.workspaceId === terminal.workspaceId || (terminal.alias && tasks.has(terminal.alias)))
			)) {
				terminals.set(terminal.id, {
					id: terminal.id,
					cwd: terminal.syncState.currentWorkdir,
					pid: terminal.syncState.pid,
					title: terminal.syncState.title,
					workspaceId: terminal.workspaceId,
					workspaceName: terminal.workspaceName,
					isOrphan: true
				});
			}
		}
		return { tasks, terminals };
	}

}

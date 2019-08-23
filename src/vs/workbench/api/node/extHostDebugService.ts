/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'vs/base/common/path';
import { Schemas } from 'vs/base/common/network';
import { URI, UriComponents } from 'vs/base/common/uri';
import { Event, Emitter } from 'vs/base/common/event';
import { asPromise } from 'vs/base/common/async';
import * as nls from 'vs/nls';
import {
	MainContext, MainThreadDebugServiceShape, ExtHostDebugServiceShape, DebugSessionUUID,
	IBreakpointsDeltaDto, ISourceMultiBreakpointDto, IFunctionBreakpointDto, IDebugSessionDto
} from 'vs/workbench/api/common/extHost.protocol';
import * as vscode from 'vscode';
import { Disposable, Position, Location, SourceBreakpoint, FunctionBreakpoint, DebugAdapterServer, DebugAdapterExecutable, DataBreakpoint } from 'vs/workbench/api/common/extHostTypes';
import { ExecutableDebugAdapter, SocketDebugAdapter } from 'vs/workbench/contrib/debug/node/debugAdapter';
import { AbstractDebugAdapter } from 'vs/workbench/contrib/debug/common/abstractDebugAdapter';
import { IExtHostWorkspace } from 'vs/workbench/api/common/extHostWorkspace';
import { IExtHostExtensionService } from 'vs/workbench/api/common/extHostExtensionService';
import { ExtHostDocumentsAndEditors, IExtHostDocumentsAndEditors } from 'vs/workbench/api/common/extHostDocumentsAndEditors';
import { IDebuggerContribution, IConfig, IDebugAdapter, IDebugAdapterServer, IDebugAdapterExecutable, IAdapterDescriptor } from 'vs/workbench/contrib/debug/common/debug';
import { hasChildProcesses, prepareCommand, runInExternalTerminal } from 'vs/workbench/contrib/debug/node/terminals';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { AbstractVariableResolverService } from 'vs/workbench/services/configurationResolver/common/variableResolver';
import { ExtHostConfigProvider, IExtHostConfiguration } from '../common/extHostConfiguration';
import { convertToVSCPaths, convertToDAPaths, isDebuggerMainContribution } from 'vs/workbench/contrib/debug/common/debugUtils';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IExtHostCommands } from 'vs/workbench/api/common/extHostCommands';
import { ExtensionDescriptionRegistry } from 'vs/workbench/services/extensions/common/extensionDescriptionRegistry';
import { IProcessEnvironment } from 'vs/base/common/platform';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { SignService } from 'vs/platform/sign/node/signService';
import { ISignService } from 'vs/platform/sign/common/sign';
import { IExtHostTerminalService } from 'vs/workbench/api/common/extHostTerminalService';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import { IExtHostDebugService } from 'vs/workbench/api/common/extHostDebugService';

export class ExtHostDebugService implements IExtHostDebugService, ExtHostDebugServiceShape {

	readonly _serviceBrand: any;

	private _configProviderHandleCounter: number;
	private _configProviders: ConfigProviderTuple[];

	private _adapterFactoryHandleCounter: number;
	private _adapterFactories: DescriptorFactoryTuple[];

	private _trackerFactoryHandleCounter: number;
	private _trackerFactories: TrackerFactoryTuple[];

	private _debugServiceProxy: MainThreadDebugServiceShape;
	private _debugSessions: Map<DebugSessionUUID, ExtHostDebugSession> = new Map<DebugSessionUUID, ExtHostDebugSession>();

	private readonly _onDidStartDebugSession: Emitter<vscode.DebugSession>;
	get onDidStartDebugSession(): Event<vscode.DebugSession> { return this._onDidStartDebugSession.event; }

	private readonly _onDidTerminateDebugSession: Emitter<vscode.DebugSession>;
	get onDidTerminateDebugSession(): Event<vscode.DebugSession> { return this._onDidTerminateDebugSession.event; }

	private readonly _onDidChangeActiveDebugSession: Emitter<vscode.DebugSession | undefined>;
	get onDidChangeActiveDebugSession(): Event<vscode.DebugSession | undefined> { return this._onDidChangeActiveDebugSession.event; }

	private _activeDebugSession: ExtHostDebugSession | undefined;
	get activeDebugSession(): ExtHostDebugSession | undefined { return this._activeDebugSession; }

	private readonly _onDidReceiveDebugSessionCustomEvent: Emitter<vscode.DebugSessionCustomEvent>;
	get onDidReceiveDebugSessionCustomEvent(): Event<vscode.DebugSessionCustomEvent> { return this._onDidReceiveDebugSessionCustomEvent.event; }

	private _activeDebugConsole: ExtHostDebugConsole;
	get activeDebugConsole(): ExtHostDebugConsole { return this._activeDebugConsole; }

	private _breakpoints: Map<string, vscode.Breakpoint>;
	private _breakpointEventsActive: boolean;

	private readonly _onDidChangeBreakpoints: Emitter<vscode.BreakpointsChangeEvent>;

	private _aexCommands: Map<string, string>;
	private _debugAdapters: Map<number, IDebugAdapter>;
	private _debugAdaptersTrackers: Map<number, vscode.DebugAdapterTracker>;

	private _variableResolver: IConfigurationResolverService;

	private _integratedTerminalInstance?: vscode.Terminal;
	private _terminalDisposedListener: IDisposable;

	private _signService: ISignService;


	constructor(
		@IExtHostRpcService extHostRpcService: IExtHostRpcService,
		@IExtHostWorkspace private _workspaceService: IExtHostWorkspace,
		@IExtHostExtensionService private _extensionService: IExtHostExtensionService,
		@IExtHostDocumentsAndEditors private _editorsService: IExtHostDocumentsAndEditors,
		@IExtHostConfiguration private _configurationService: IExtHostConfiguration,
		@IExtHostTerminalService private _terminalService: IExtHostTerminalService,
		@IExtHostCommands private _commandService: IExtHostCommands
	) {
		this._configProviderHandleCounter = 0;
		this._configProviders = [];

		this._adapterFactoryHandleCounter = 0;
		this._adapterFactories = [];

		this._trackerFactoryHandleCounter = 0;
		this._trackerFactories = [];

		this._aexCommands = new Map();
		this._debugAdapters = new Map();
		this._debugAdaptersTrackers = new Map();

		this._onDidStartDebugSession = new Emitter<vscode.DebugSession>();
		this._onDidTerminateDebugSession = new Emitter<vscode.DebugSession>();
		this._onDidChangeActiveDebugSession = new Emitter<vscode.DebugSession>();
		this._onDidReceiveDebugSessionCustomEvent = new Emitter<vscode.DebugSessionCustomEvent>();

		this._debugServiceProxy = extHostRpcService.getProxy(MainContext.MainThreadDebugService);

		this._onDidChangeBreakpoints = new Emitter<vscode.BreakpointsChangeEvent>({
			onFirstListenerAdd: () => {
				this.startBreakpoints();
			}
		});

		this._activeDebugConsole = new ExtHostDebugConsole(this._debugServiceProxy);

		this._breakpoints = new Map<string, vscode.Breakpoint>();
		this._breakpointEventsActive = false;

		this._extensionService.getExtensionRegistry().then((extensionRegistry: ExtensionDescriptionRegistry) => {
			extensionRegistry.onDidChange(_ => {
				this.registerAllDebugTypes(extensionRegistry);
			});
			this.registerAllDebugTypes(extensionRegistry);
		});
	}

	private registerAllDebugTypes(extensionRegistry: ExtensionDescriptionRegistry) {

		const debugTypes: string[] = [];
		this._aexCommands.clear();

		for (const ed of extensionRegistry.getAllExtensionDescriptions()) {
			if (ed.contributes) {
				const debuggers = <IDebuggerContribution[]>ed.contributes['debuggers'];
				if (debuggers && debuggers.length > 0) {
					for (const dbg of debuggers) {
						if (isDebuggerMainContribution(dbg)) {
							debugTypes.push(dbg.type);
							if (dbg.adapterExecutableCommand) {
								this._aexCommands.set(dbg.type, dbg.adapterExecutableCommand);
							}
						}
					}
				}
			}
		}

		this._debugServiceProxy.$registerDebugTypes(debugTypes);
	}

	// extension debug API

	get onDidChangeBreakpoints(): Event<vscode.BreakpointsChangeEvent> {
		return this._onDidChangeBreakpoints.event;
	}

	get breakpoints(): vscode.Breakpoint[] {

		this.startBreakpoints();

		const result: vscode.Breakpoint[] = [];
		this._breakpoints.forEach(bp => result.push(bp));
		return result;
	}

	public addBreakpoints(breakpoints0: vscode.Breakpoint[]): Promise<void> {

		this.startBreakpoints();

		// filter only new breakpoints
		const breakpoints = breakpoints0.filter(bp => {
			const id = bp.id;
			if (!this._breakpoints.has(id)) {
				this._breakpoints.set(id, bp);
				return true;
			}
			return false;
		});

		// send notification for added breakpoints
		this.fireBreakpointChanges(breakpoints, [], []);

		// convert added breakpoints to DTOs
		const dtos: Array<ISourceMultiBreakpointDto | IFunctionBreakpointDto> = [];
		const map = new Map<string, ISourceMultiBreakpointDto>();
		for (const bp of breakpoints) {
			if (bp instanceof SourceBreakpoint) {
				let dto = map.get(bp.location.uri.toString());
				if (!dto) {
					dto = <ISourceMultiBreakpointDto>{
						type: 'sourceMulti',
						uri: bp.location.uri,
						lines: []
					};
					map.set(bp.location.uri.toString(), dto);
					dtos.push(dto);
				}
				dto.lines.push({
					id: bp.id,
					enabled: bp.enabled,
					condition: bp.condition,
					hitCondition: bp.hitCondition,
					logMessage: bp.logMessage,
					line: bp.location.range.start.line,
					character: bp.location.range.start.character
				});
			} else if (bp instanceof FunctionBreakpoint) {
				dtos.push({
					type: 'function',
					id: bp.id,
					enabled: bp.enabled,
					hitCondition: bp.hitCondition,
					logMessage: bp.logMessage,
					condition: bp.condition,
					functionName: bp.functionName
				});
			}
		}

		// send DTOs to VS Code
		return this._debugServiceProxy.$registerBreakpoints(dtos);
	}

	public removeBreakpoints(breakpoints0: vscode.Breakpoint[]): Promise<void> {

		this.startBreakpoints();

		// remove from array
		const breakpoints = breakpoints0.filter(b => this._breakpoints.delete(b.id));

		// send notification
		this.fireBreakpointChanges([], breakpoints, []);

		// unregister with VS Code
		const ids = breakpoints.filter(bp => bp instanceof SourceBreakpoint).map(bp => bp.id);
		const fids = breakpoints.filter(bp => bp instanceof FunctionBreakpoint).map(bp => bp.id);
		const dids = breakpoints.filter(bp => bp instanceof DataBreakpoint).map(bp => bp.id);
		return this._debugServiceProxy.$unregisterBreakpoints(ids, fids, dids);
	}

	public startDebugging(folder: vscode.WorkspaceFolder | undefined, nameOrConfig: string | vscode.DebugConfiguration, parentSession?: vscode.DebugSession): Promise<boolean> {
		return this._debugServiceProxy.$startDebugging(folder ? folder.uri : undefined, nameOrConfig, parentSession ? parentSession.id : undefined);
	}

	public registerDebugConfigurationProvider(type: string, provider: vscode.DebugConfigurationProvider): vscode.Disposable {

		if (!provider) {
			return new Disposable(() => { });
		}

		if (provider.debugAdapterExecutable) {
			console.error('DebugConfigurationProvider.debugAdapterExecutable is deprecated and will be removed soon; please use DebugAdapterDescriptorFactory.createDebugAdapterDescriptor instead.');
		}

		const handle = this._configProviderHandleCounter++;
		this._configProviders.push({ type, handle, provider });

		this._debugServiceProxy.$registerDebugConfigurationProvider(type,
			!!provider.provideDebugConfigurations,
			!!provider.resolveDebugConfiguration,
			!!provider.debugAdapterExecutable,		// TODO@AW: deprecated
			handle);

		return new Disposable(() => {
			this._configProviders = this._configProviders.filter(p => p.provider !== provider);		// remove
			this._debugServiceProxy.$unregisterDebugConfigurationProvider(handle);
		});
	}

	public registerDebugAdapterDescriptorFactory(extension: IExtensionDescription, type: string, factory: vscode.DebugAdapterDescriptorFactory): vscode.Disposable {

		if (!factory) {
			return new Disposable(() => { });
		}

		// a DebugAdapterDescriptorFactory can only be registered in the extension that contributes the debugger
		if (!this.definesDebugType(extension, type)) {
			throw new Error(`a DebugAdapterDescriptorFactory can only be registered from the extension that defines the '${type}' debugger.`);
		}

		// make sure that only one factory for this type is registered
		if (this.getAdapterFactoryByType(type)) {
			throw new Error(`a DebugAdapterDescriptorFactory can only be registered once per a type.`);
		}

		const handle = this._adapterFactoryHandleCounter++;
		this._adapterFactories.push({ type, handle, factory });

		this._debugServiceProxy.$registerDebugAdapterDescriptorFactory(type, handle);

		return new Disposable(() => {
			this._adapterFactories = this._adapterFactories.filter(p => p.factory !== factory);		// remove
			this._debugServiceProxy.$unregisterDebugAdapterDescriptorFactory(handle);
		});
	}

	public registerDebugAdapterTrackerFactory(type: string, factory: vscode.DebugAdapterTrackerFactory): vscode.Disposable {

		if (!factory) {
			return new Disposable(() => { });
		}

		const handle = this._trackerFactoryHandleCounter++;
		this._trackerFactories.push({ type, handle, factory });

		return new Disposable(() => {
			this._trackerFactories = this._trackerFactories.filter(p => p.factory !== factory);		// remove
		});
	}

	// RPC methods (ExtHostDebugServiceShape)

	public async $runInTerminal(args: DebugProtocol.RunInTerminalRequestArguments): Promise<number | undefined> {

		if (args.kind === 'integrated') {

			if (!this._terminalDisposedListener) {
				// React on terminal disposed and check if that is the debug terminal #12956
				this._terminalDisposedListener = this._terminalService.onDidCloseTerminal(terminal => {
					if (this._integratedTerminalInstance && this._integratedTerminalInstance === terminal) {
						this._integratedTerminalInstance = undefined;
					}
				});
			}

			return new Promise(resolve => {
				if (this._integratedTerminalInstance) {
					this._integratedTerminalInstance.processId.then(pid => {
						resolve(hasChildProcesses(pid));
					}, err => {
						resolve(true);
					});
				} else {
					resolve(true);
				}
			}).then(async needNewTerminal => {

				const configProvider = await this._configurationService.getConfigProvider();
				const shell = this._terminalService.getDefaultShell(true, configProvider);

				if (needNewTerminal || !this._integratedTerminalInstance) {
					const options: vscode.TerminalOptions = {
						shellPath: shell,
						// shellArgs: this._terminalService._getDefaultShellArgs(configProvider),
						cwd: args.cwd,
						name: args.title || nls.localize('debug.terminal.title', "debuggee"),
						env: args.env
					};
					delete args.cwd;
					delete args.env;
					this._integratedTerminalInstance = this._terminalService.createTerminalFromOptions(options);
				}
				const terminal: vscode.Terminal = this._integratedTerminalInstance;

				terminal.show();

				return this._integratedTerminalInstance.processId.then(shellProcessId => {

					const command = prepareCommand(args, shell, configProvider);

					terminal.sendText(command, true);

					return shellProcessId;
				});
			});

		} else if (args.kind === 'external') {

			runInExternalTerminal(args, await this._configurationService.getConfigProvider());
		}
		return Promise.resolve(undefined);
	}

	public async $substituteVariables(folderUri: UriComponents | undefined, config: IConfig): Promise<IConfig> {
		if (!this._variableResolver) {
			const [workspaceFolders, configProvider] = await Promise.all([this._workspaceService.getWorkspaceFolders2(), this._configurationService.getConfigProvider()]);
			this._variableResolver = new ExtHostVariableResolverService(workspaceFolders || [], this._editorsService, configProvider);
		}
		let ws: IWorkspaceFolder | undefined;
		const folder = await this.getFolder(folderUri);
		if (folder) {
			ws = {
				uri: folder.uri,
				name: folder.name,
				index: folder.index,
				toResource: () => {
					throw new Error('Not implemented');
				}
			};
		}
		return this._variableResolver.resolveAny(ws, config);
	}

	public async $startDASession(debugAdapterHandle: number, sessionDto: IDebugSessionDto): Promise<void> {
		const mythis = this;

		const session = await this.getSession(sessionDto);

		return this.getAdapterDescriptor(this.getAdapterFactoryByType(session.type), session).then(daDescriptor => {

			const adapter = this.convertToDto(daDescriptor);
			let da: AbstractDebugAdapter | undefined = undefined;

			switch (adapter.type) {

				case 'server':
					da = new SocketDebugAdapter(adapter);
					break;

				case 'executable':
					da = new ExecutableDebugAdapter(adapter, session.type);
					break;

				case 'implementation':
					da = new DirectDebugAdapter(adapter.implementation);
					break;

				default:
					break;
			}

			const debugAdapter = da;

			if (debugAdapter) {
				this._debugAdapters.set(debugAdapterHandle, debugAdapter);

				return this.getDebugAdapterTrackers(session).then(tracker => {

					if (tracker) {
						this._debugAdaptersTrackers.set(debugAdapterHandle, tracker);
					}

					debugAdapter.onMessage(async message => {

						if (message.type === 'request' && (<DebugProtocol.Request>message).command === 'handshake') {

							const request = <DebugProtocol.Request>message;

							const response: DebugProtocol.Response = {
								type: 'response',
								seq: 0,
								command: request.command,
								request_seq: request.seq,
								success: true
							};

							if (!this._signService) {
								this._signService = new SignService();
							}

							try {
								const signature = await this._signService.sign(request.arguments.value);
								response.body = {
									signature: signature
								};
								debugAdapter.sendResponse(response);
							} catch (e) {
								response.success = false;
								response.message = e.message;
								debugAdapter.sendResponse(response);
							}
						} else {
							if (tracker && tracker.onDidSendMessage) {
								tracker.onDidSendMessage(message);
							}

							// DA -> VS Code
							message = convertToVSCPaths(message, true);

							mythis._debugServiceProxy.$acceptDAMessage(debugAdapterHandle, message);
						}
					});
					debugAdapter.onError(err => {
						if (tracker && tracker.onError) {
							tracker.onError(err);
						}
						this._debugServiceProxy.$acceptDAError(debugAdapterHandle, err.name, err.message, err.stack);
					});
					debugAdapter.onExit((code: number) => {
						if (tracker && tracker.onExit) {
							tracker.onExit(code, undefined);
						}
						this._debugServiceProxy.$acceptDAExit(debugAdapterHandle, code, undefined);
					});

					if (tracker && tracker.onWillStartSession) {
						tracker.onWillStartSession();
					}

					return debugAdapter.startSession();
				});

			}
			return undefined;
		});
	}

	public $sendDAMessage(debugAdapterHandle: number, message: DebugProtocol.ProtocolMessage): void {

		// VS Code -> DA
		message = convertToDAPaths(message, false);

		const tracker = this._debugAdaptersTrackers.get(debugAdapterHandle);	// TODO@AW: same handle?
		if (tracker && tracker.onWillReceiveMessage) {
			tracker.onWillReceiveMessage(message);
		}

		const da = this._debugAdapters.get(debugAdapterHandle);
		if (da) {
			da.sendMessage(message);
		}
	}

	public $stopDASession(debugAdapterHandle: number): Promise<void> {

		const tracker = this._debugAdaptersTrackers.get(debugAdapterHandle);
		this._debugAdaptersTrackers.delete(debugAdapterHandle);
		if (tracker && tracker.onWillStopSession) {
			tracker.onWillStopSession();
		}

		const da = this._debugAdapters.get(debugAdapterHandle);
		this._debugAdapters.delete(debugAdapterHandle);
		if (da) {
			return da.stopSession();
		} else {
			return Promise.resolve(void 0);
		}
	}

	public $acceptBreakpointsDelta(delta: IBreakpointsDeltaDto): void {

		const a: vscode.Breakpoint[] = [];
		const r: vscode.Breakpoint[] = [];
		const c: vscode.Breakpoint[] = [];

		if (delta.added) {
			for (const bpd of delta.added) {
				const id = bpd.id;
				if (id && !this._breakpoints.has(id)) {
					let bp: vscode.Breakpoint;
					if (bpd.type === 'function') {
						bp = new FunctionBreakpoint(bpd.functionName, bpd.enabled, bpd.condition, bpd.hitCondition, bpd.logMessage);
					} else if (bpd.type === 'data') {
						bp = new DataBreakpoint(bpd.label, bpd.dataId, bpd.canPersist, bpd.enabled, bpd.hitCondition, bpd.condition, bpd.logMessage);
					} else {
						const uri = URI.revive(bpd.uri);
						bp = new SourceBreakpoint(new Location(uri, new Position(bpd.line, bpd.character)), bpd.enabled, bpd.condition, bpd.hitCondition, bpd.logMessage);
					}
					(bp as any)._id = id;
					this._breakpoints.set(id, bp);
					a.push(bp);
				}
			}
		}

		if (delta.removed) {
			for (const id of delta.removed) {
				const bp = this._breakpoints.get(id);
				if (bp) {
					this._breakpoints.delete(id);
					r.push(bp);
				}
			}
		}

		if (delta.changed) {
			for (const bpd of delta.changed) {
				if (bpd.id) {
					const bp = this._breakpoints.get(bpd.id);
					if (bp) {
						if (bp instanceof FunctionBreakpoint && bpd.type === 'function') {
							const fbp = <any>bp;
							fbp.enabled = bpd.enabled;
							fbp.condition = bpd.condition;
							fbp.hitCondition = bpd.hitCondition;
							fbp.logMessage = bpd.logMessage;
							fbp.functionName = bpd.functionName;
						} else if (bp instanceof SourceBreakpoint && bpd.type === 'source') {
							const sbp = <any>bp;
							sbp.enabled = bpd.enabled;
							sbp.condition = bpd.condition;
							sbp.hitCondition = bpd.hitCondition;
							sbp.logMessage = bpd.logMessage;
							sbp.location = new Location(URI.revive(bpd.uri), new Position(bpd.line, bpd.character));
						}
						c.push(bp);
					}
				}
			}
		}

		this.fireBreakpointChanges(a, r, c);
	}

	public $provideDebugConfigurations(configProviderHandle: number, folderUri: UriComponents | undefined, token: CancellationToken): Promise<vscode.DebugConfiguration[]> {
		return asPromise(async () => {
			const provider = this.getConfigProviderByHandle(configProviderHandle);
			if (!provider) {
				throw new Error('no DebugConfigurationProvider found');
			}
			if (!provider.provideDebugConfigurations) {
				throw new Error('DebugConfigurationProvider has no method provideDebugConfigurations');
			}
			const folder = await this.getFolder(folderUri);
			return provider.provideDebugConfigurations(folder, token);
		}).then(debugConfigurations => {
			if (!debugConfigurations) {
				throw new Error('nothing returned from DebugConfigurationProvider.provideDebugConfigurations');
			}
			return debugConfigurations;
		});
	}

	public $resolveDebugConfiguration(configProviderHandle: number, folderUri: UriComponents | undefined, debugConfiguration: vscode.DebugConfiguration, token: CancellationToken): Promise<vscode.DebugConfiguration | null | undefined> {
		return asPromise(async () => {
			const provider = this.getConfigProviderByHandle(configProviderHandle);
			if (!provider) {
				throw new Error('no DebugConfigurationProvider found');
			}
			if (!provider.resolveDebugConfiguration) {
				throw new Error('DebugConfigurationProvider has no method resolveDebugConfiguration');
			}
			const folder = await this.getFolder(folderUri);
			return provider.resolveDebugConfiguration(folder, debugConfiguration, token);
		});
	}

	// TODO@AW deprecated and legacy
	public $legacyDebugAdapterExecutable(configProviderHandle: number, folderUri: UriComponents | undefined): Promise<IAdapterDescriptor> {
		return asPromise(async () => {
			const provider = this.getConfigProviderByHandle(configProviderHandle);
			if (!provider) {
				throw new Error('no DebugConfigurationProvider found');
			}
			if (!provider.debugAdapterExecutable) {
				throw new Error('DebugConfigurationProvider has no method debugAdapterExecutable');
			}
			const folder = await this.getFolder(folderUri);
			return provider.debugAdapterExecutable(folder, CancellationToken.None);
		}).then(executable => {
			if (!executable) {
				throw new Error('nothing returned from DebugConfigurationProvider.debugAdapterExecutable');
			}
			return this.convertToDto(executable);
		});
	}

	public async $provideDebugAdapter(adapterProviderHandle: number, sessionDto: IDebugSessionDto): Promise<IAdapterDescriptor> {
		const adapterProvider = this.getAdapterProviderByHandle(adapterProviderHandle);
		if (!adapterProvider) {
			return Promise.reject(new Error('no handler found'));
		}
		const session = await this.getSession(sessionDto);
		return this.getAdapterDescriptor(adapterProvider, session).then(x => this.convertToDto(x));
	}

	public async $acceptDebugSessionStarted(sessionDto: IDebugSessionDto): Promise<void> {
		const session = await this.getSession(sessionDto);
		this._onDidStartDebugSession.fire(session);
	}

	public async $acceptDebugSessionTerminated(sessionDto: IDebugSessionDto): Promise<void> {
		const session = await this.getSession(sessionDto);
		if (session) {
			this._onDidTerminateDebugSession.fire(session);
			this._debugSessions.delete(session.id);
		}
	}

	public async $acceptDebugSessionActiveChanged(sessionDto: IDebugSessionDto | undefined): Promise<void> {
		this._activeDebugSession = sessionDto ? await this.getSession(sessionDto) : undefined;
		this._onDidChangeActiveDebugSession.fire(this._activeDebugSession);
	}

	public async $acceptDebugSessionCustomEvent(sessionDto: IDebugSessionDto, event: any): Promise<void> {
		const session = await this.getSession(sessionDto);
		const ee: vscode.DebugSessionCustomEvent = {
			session: session,
			event: event.event,
			body: event.body
		};
		this._onDidReceiveDebugSessionCustomEvent.fire(ee);
	}

	// private & dto helpers

	private convertToDto(x: vscode.DebugAdapterDescriptor | undefined): IAdapterDescriptor {
		if (x instanceof DebugAdapterExecutable) {
			return <IDebugAdapterExecutable>{
				type: 'executable',
				command: x.command,
				args: x.args,
				options: x.options
			};
		} else if (x instanceof DebugAdapterServer) {
			return <IDebugAdapterServer>{
				type: 'server',
				port: x.port,
				host: x.host
			};
		} else /* if (x instanceof DebugAdapterImplementation) {
			return <IDebugAdapterImplementation>{
				type: 'implementation',
				implementation: x.implementation
			};
		} else */ {
			throw new Error('convertToDto unexpected type');
		}
	}

	private getAdapterFactoryByType(type: string): vscode.DebugAdapterDescriptorFactory | undefined {
		const results = this._adapterFactories.filter(p => p.type === type);
		if (results.length > 0) {
			return results[0].factory;
		}
		return undefined;
	}

	private getAdapterProviderByHandle(handle: number): vscode.DebugAdapterDescriptorFactory | undefined {
		const results = this._adapterFactories.filter(p => p.handle === handle);
		if (results.length > 0) {
			return results[0].factory;
		}
		return undefined;
	}

	private getConfigProviderByHandle(handle: number): vscode.DebugConfigurationProvider | undefined {
		const results = this._configProviders.filter(p => p.handle === handle);
		if (results.length > 0) {
			return results[0].provider;
		}
		return undefined;
	}

	private definesDebugType(ed: IExtensionDescription, type: string) {
		if (ed.contributes) {
			const debuggers = <IDebuggerContribution[]>ed.contributes['debuggers'];
			if (debuggers && debuggers.length > 0) {
				for (const dbg of debuggers) {
					// only debugger contributions with a "label" are considered a "defining" debugger contribution
					if (dbg.label && dbg.type) {
						if (dbg.type === type) {
							return true;
						}
					}
				}
			}
		}
		return false;
	}

	private getDebugAdapterTrackers(session: ExtHostDebugSession): Promise<vscode.DebugAdapterTracker | undefined> {

		const config = session.configuration;
		const type = config.type;

		const promises = this._trackerFactories
			.filter(tuple => tuple.type === type || tuple.type === '*')
			.map(tuple => asPromise<vscode.ProviderResult<vscode.DebugAdapterTracker>>(() => tuple.factory.createDebugAdapterTracker(session)).then(p => p, err => null));

		return Promise.race([
			Promise.all(promises).then(result => {
				const trackers = <vscode.DebugAdapterTracker[]>result.filter(t => !!t);	// filter null
				if (trackers.length > 0) {
					return new MultiTracker(trackers);
				}
				return undefined;
			}),
			new Promise((resolve, reject) => {
				const timeout = setTimeout(() => {
					clearTimeout(timeout);
					reject(new Error('timeout'));
				}, 1000);
			})
		]).catch(err => {
			// ignore errors
			return undefined;
		});
	}

	private async getAdapterDescriptor(adapterProvider: vscode.DebugAdapterDescriptorFactory | undefined, session: ExtHostDebugSession): Promise<vscode.DebugAdapterDescriptor | undefined> {

		// a "debugServer" attribute in the launch config takes precedence
		const serverPort = session.configuration.debugServer;
		if (typeof serverPort === 'number') {
			return Promise.resolve(new DebugAdapterServer(serverPort));
		}

		// TODO@AW legacy
		const pair = this._configProviders.filter(p => p.type === session.type).pop();
		if (pair && pair.provider.debugAdapterExecutable) {
			const func = pair.provider.debugAdapterExecutable;
			return asPromise(() => func(session.workspaceFolder, CancellationToken.None)).then(executable => {
				if (executable) {
					return executable;
				}
				return undefined;
			});
		}

		if (adapterProvider) {
			const extensionRegistry = await this._extensionService.getExtensionRegistry();
			return asPromise(() => adapterProvider.createDebugAdapterDescriptor(session, this.daExecutableFromPackage(session, extensionRegistry))).then(daDescriptor => {
				if (daDescriptor) {
					return daDescriptor;
				}
				return undefined;
			});
		}

		// try deprecated command based extension API "adapterExecutableCommand" to determine the executable
		// TODO@AW legacy
		const aex = this._aexCommands.get(session.type);
		if (aex) {
			const folder = session.workspaceFolder;
			const rootFolder = folder ? folder.uri.toString() : undefined;
			return this._commandService.executeCommand(aex, rootFolder).then((ae: { command: string, args: string[] }) => {
				return new DebugAdapterExecutable(ae.command, ae.args || []);
			});
		}

		// fallback: use executable information from package.json
		const extensionRegistry = await this._extensionService.getExtensionRegistry();
		return Promise.resolve(this.daExecutableFromPackage(session, extensionRegistry));
	}

	private daExecutableFromPackage(session: ExtHostDebugSession, extensionRegistry: ExtensionDescriptionRegistry): DebugAdapterExecutable | undefined {
		const dae = ExecutableDebugAdapter.platformAdapterExecutable(extensionRegistry.getAllExtensionDescriptions(), session.type);
		if (dae) {
			return new DebugAdapterExecutable(dae.command, dae.args, dae.options);
		}
		return undefined;
	}

	private startBreakpoints() {
		if (!this._breakpointEventsActive) {
			this._breakpointEventsActive = true;
			this._debugServiceProxy.$startBreakpointEvents();
		}
	}

	private fireBreakpointChanges(added: vscode.Breakpoint[], removed: vscode.Breakpoint[], changed: vscode.Breakpoint[]) {
		if (added.length > 0 || removed.length > 0 || changed.length > 0) {
			this._onDidChangeBreakpoints.fire(Object.freeze({
				added,
				removed,
				changed,
			}));
		}
	}

	private async getSession(dto: IDebugSessionDto): Promise<ExtHostDebugSession> {
		if (dto) {
			if (typeof dto === 'string') {
				const ds = this._debugSessions.get(dto);
				if (ds) {
					return ds;
				}
			} else {
				let ds = this._debugSessions.get(dto.id);
				if (!ds) {
					const folder = await this.getFolder(dto.folderUri);
					ds = new ExtHostDebugSession(this._debugServiceProxy, dto.id, dto.type, dto.name, folder, dto.configuration);
					this._debugSessions.set(ds.id, ds);
					this._debugServiceProxy.$sessionCached(ds.id);
				}
				return ds;
			}
		}
		throw new Error('cannot find session');
	}

	private getFolder(_folderUri: UriComponents | undefined): Promise<vscode.WorkspaceFolder | undefined> {
		if (_folderUri) {
			const folderURI = URI.revive(_folderUri);
			return this._workspaceService.resolveWorkspaceFolder(folderURI);
		}
		return Promise.resolve(undefined);
	}
}

export class ExtHostDebugSession implements vscode.DebugSession {

	constructor(
		private _debugServiceProxy: MainThreadDebugServiceShape,
		private _id: DebugSessionUUID,
		private _type: string,
		private _name: string,
		private _workspaceFolder: vscode.WorkspaceFolder | undefined,
		private _configuration: vscode.DebugConfiguration) {
	}

	public get id(): string {
		return this._id;
	}

	public get type(): string {
		return this._type;
	}

	public get name(): string {
		return this._name;
	}

	public get workspaceFolder(): vscode.WorkspaceFolder | undefined {
		return this._workspaceFolder;
	}

	public get configuration(): vscode.DebugConfiguration {
		return this._configuration;
	}

	public customRequest(command: string, args: any): Promise<any> {
		return this._debugServiceProxy.$customDebugAdapterRequest(this._id, command, args);
	}
}

export class ExtHostDebugConsole implements vscode.DebugConsole {

	private _debugServiceProxy: MainThreadDebugServiceShape;

	constructor(proxy: MainThreadDebugServiceShape) {
		this._debugServiceProxy = proxy;
	}

	append(value: string): void {
		this._debugServiceProxy.$appendDebugConsole(value);
	}

	appendLine(value: string): void {
		this.append(value + '\n');
	}
}

export class ExtHostVariableResolverService extends AbstractVariableResolverService {

	constructor(folders: vscode.WorkspaceFolder[], editorService: ExtHostDocumentsAndEditors, configurationService: ExtHostConfigProvider) {
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
			getConfigurationValue: (folderUri: URI, section: string): string | undefined => {
				return configurationService.getConfiguration(undefined, folderUri).get<string>(section);
			},
			getExecPath: (): string | undefined => {
				return process.env['VSCODE_EXEC_PATH'];
			},
			getFilePath: (): string | undefined => {
				const activeEditor = editorService.activeEditor();
				if (activeEditor) {
					const resource = activeEditor.document.uri;
					if (resource.scheme === Schemas.file) {
						return path.normalize(resource.fsPath);
					}
				}
				return undefined;
			},
			getSelectedText: (): string | undefined => {
				const activeEditor = editorService.activeEditor();
				if (activeEditor && !activeEditor.selection.isEmpty) {
					return activeEditor.document.getText(activeEditor.selection);
				}
				return undefined;
			},
			getLineNumber: (): string | undefined => {
				const activeEditor = editorService.activeEditor();
				if (activeEditor) {
					return String(activeEditor.selection.end.line + 1);
				}
				return undefined;
			}
		}, process.env as IProcessEnvironment);
	}
}

interface ConfigProviderTuple {
	type: string;
	handle: number;
	provider: vscode.DebugConfigurationProvider;
}

interface DescriptorFactoryTuple {
	type: string;
	handle: number;
	factory: vscode.DebugAdapterDescriptorFactory;
}

interface TrackerFactoryTuple {
	type: string;
	handle: number;
	factory: vscode.DebugAdapterTrackerFactory;
}

class MultiTracker implements vscode.DebugAdapterTracker {

	constructor(private trackers: vscode.DebugAdapterTracker[]) {
	}

	onWillStartSession(): void {
		this.trackers.forEach(t => t.onWillStartSession ? t.onWillStartSession() : undefined);
	}

	onWillReceiveMessage(message: any): void {
		this.trackers.forEach(t => t.onWillReceiveMessage ? t.onWillReceiveMessage(message) : undefined);
	}

	onDidSendMessage(message: any): void {
		this.trackers.forEach(t => t.onDidSendMessage ? t.onDidSendMessage(message) : undefined);
	}

	onWillStopSession(): void {
		this.trackers.forEach(t => t.onWillStopSession ? t.onWillStopSession() : undefined);
	}

	onError(error: Error): void {
		this.trackers.forEach(t => t.onError ? t.onError(error) : undefined);
	}

	onExit(code: number, signal: string): void {
		this.trackers.forEach(t => t.onExit ? t.onExit(code, signal) : undefined);
	}
}

interface IDapTransport {
	start(cb: (msg: DebugProtocol.ProtocolMessage) => void, errorcb: (event: DebugProtocol.Event) => void): void;
	send(message: DebugProtocol.ProtocolMessage): void;
	stop(): void;
}

class DirectDebugAdapter extends AbstractDebugAdapter implements IDapTransport {

	readonly onError: Event<Error>;
	readonly onExit: Event<number>;

	private _sendUp: (msg: DebugProtocol.ProtocolMessage) => void;

	constructor(implementation: any) {
		super();
		if (implementation.__setTransport) {
			implementation.__setTransport(this);
		}
	}

	// IDapTransport
	start(cb: (msg: DebugProtocol.ProtocolMessage) => void, errorcb: (event: DebugProtocol.Event) => void) {
		this._sendUp = cb;
	}

	// AbstractDebugAdapter
	startSession(): Promise<void> {
		return Promise.resolve(undefined);
	}

	// AbstractDebugAdapter
	// VSCode -> DA
	sendMessage(message: DebugProtocol.ProtocolMessage): void {
		this._sendUp(message);
	}

	// AbstractDebugAdapter
	stopSession(): Promise<void> {
		this.stop();
		return Promise.resolve(undefined);
	}

	// IDapTransport
	// DA -> VSCode
	send(message: DebugProtocol.ProtocolMessage) {
		this.acceptMessage(message);
	}

	// IDapTransport
	stop(): void {
		throw new Error('Method not implemented.');
	}
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as paths from 'vs/base/common/paths';
import { Schemas } from 'vs/base/common/network';
import { URI, UriComponents } from 'vs/base/common/uri';
import { Event, Emitter } from 'vs/base/common/event';
import { asPromise } from 'vs/base/common/async';
import * as nls from 'vs/nls';
import {
	MainContext, MainThreadDebugServiceShape, ExtHostDebugServiceShape, DebugSessionUUID,
	IMainContext, IBreakpointsDeltaDto, ISourceMultiBreakpointDto, IFunctionBreakpointDto, IDebugSessionDto
} from 'vs/workbench/api/node/extHost.protocol';
import * as vscode from 'vscode';
import { Disposable, Position, Location, SourceBreakpoint, FunctionBreakpoint, DebugAdapterServer, DebugAdapterExecutable } from 'vs/workbench/api/node/extHostTypes';
import { ExecutableDebugAdapter, SocketDebugAdapter, AbstractDebugAdapter } from 'vs/workbench/parts/debug/node/debugAdapter';
import { ExtHostWorkspace } from 'vs/workbench/api/node/extHostWorkspace';
import { ExtHostExtensionService } from 'vs/workbench/api/node/extHostExtensionService';
import { ExtHostDocumentsAndEditors } from 'vs/workbench/api/node/extHostDocumentsAndEditors';
import { ITerminalSettings, IDebuggerContribution, IConfig, IDebugAdapter, IDebugAdapterServer, IDebugAdapterExecutable, IAdapterDescriptor } from 'vs/workbench/parts/debug/common/debug';
import { getTerminalLauncher, hasChildProcesses, prepareCommand } from 'vs/workbench/parts/debug/node/terminals';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { AbstractVariableResolverService } from 'vs/workbench/services/configurationResolver/node/variableResolver';
import { ExtHostConfiguration } from './extHostConfiguration';
import { convertToVSCPaths, convertToDAPaths, stringToUri, uriToString } from 'vs/workbench/parts/debug/common/debugUtils';
import { ExtHostTerminalService } from 'vs/workbench/api/node/extHostTerminalService';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ExtHostCommands } from 'vs/workbench/api/node/extHostCommands';
import { IExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';
import { ExtensionDescriptionRegistry } from 'vs/workbench/services/extensions/node/extensionDescriptionRegistry';


export class ExtHostDebugService implements ExtHostDebugServiceShape {

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

	private _integratedTerminalInstance: vscode.Terminal;
	private _terminalDisposedListener: IDisposable;


	constructor(mainContext: IMainContext,
		private _workspaceService: ExtHostWorkspace,
		private _extensionService: ExtHostExtensionService,
		private _editorsService: ExtHostDocumentsAndEditors,
		private _configurationService: ExtHostConfiguration,
		private _terminalService: ExtHostTerminalService,
		private _commandService: ExtHostCommands
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

		this._debugServiceProxy = mainContext.getProxy(MainContext.MainThreadDebugService);

		this._onDidChangeBreakpoints = new Emitter<vscode.BreakpointsChangeEvent>({
			onFirstListenerAdd: () => {
				this.startBreakpoints();
			}
		});

		this._activeDebugConsole = new ExtHostDebugConsole(this._debugServiceProxy);

		this._breakpoints = new Map<string, vscode.Breakpoint>();
		this._breakpointEventsActive = false;

		this._extensionService.getExtensionRegistry().then((extensionRegistry: ExtensionDescriptionRegistry) => {
			// register all debug extensions
			const debugTypes: string[] = [];
			for (const ed of extensionRegistry.getAllExtensionDescriptions()) {
				if (ed.contributes) {
					const debuggers = <IDebuggerContribution[]>ed.contributes['debuggers'];
					if (debuggers && debuggers.length > 0) {
						for (const dbg of debuggers) {
							// only debugger contributions with a label, program, or runtime attribute are considered a "defining" debugger contribution
							if (dbg.type && (dbg.label || dbg.program || dbg.runtime)) {
								debugTypes.push(dbg.type);
								if (dbg.adapterExecutableCommand) {
									this._aexCommands.set(dbg.type, dbg.adapterExecutableCommand);
								}
							}
						}
					}
				}
			}
			if (debugTypes.length > 0) {
				this._debugServiceProxy.$registerDebugTypes(debugTypes);
			}
		});
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
		return this._debugServiceProxy.$unregisterBreakpoints(ids, fids);
	}

	public startDebugging(folder: vscode.WorkspaceFolder | undefined, nameOrConfig: string | vscode.DebugConfiguration): Promise<boolean> {
		return this._debugServiceProxy.$startDebugging(folder ? folder.uri : undefined, nameOrConfig);
	}

	public registerDebugConfigurationProvider(type: string, provider: vscode.DebugConfigurationProvider): vscode.Disposable {

		if (!provider) {
			return new Disposable(() => { });
		}

		if (provider.debugAdapterExecutable) {
			console.error('DebugConfigurationProvider.debugAdapterExecutable is deprecated and will be removed soon; please use DebugAdapterDescriptorFactory.createDebugAdapterDescriptor instead.');
		}

		let handle = this._configProviderHandleCounter++;
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

		let handle = this._adapterFactoryHandleCounter++;
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

		let handle = this._trackerFactoryHandleCounter++;
		this._trackerFactories.push({ type, handle, factory });

		this._debugServiceProxy.$registerDebugAdapterTrackerFactory(type, handle);

		return new Disposable(() => {
			this._trackerFactories = this._trackerFactories.filter(p => p.factory !== factory);		// remove
			this._debugServiceProxy.$unregisterDebugAdapterTrackerFactory(handle);
		});
	}

	// RPC methods (ExtHostDebugServiceShape)

	public $runInTerminal(args: DebugProtocol.RunInTerminalRequestArguments, config: ITerminalSettings): Promise<number | undefined> {

		if (args.kind === 'integrated') {

			if (!this._terminalDisposedListener) {
				// React on terminal disposed and check if that is the debug terminal #12956
				this._terminalDisposedListener = this._terminalService.onDidCloseTerminal(terminal => {
					if (this._integratedTerminalInstance && this._integratedTerminalInstance === terminal) {
						this._integratedTerminalInstance = null;
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
			}).then(needNewTerminal => {

				if (needNewTerminal) {
					this._integratedTerminalInstance = this._terminalService.createTerminal(args.title || nls.localize('debug.terminal.title', "debuggee"));
				}

				this._integratedTerminalInstance.show();

				return this._integratedTerminalInstance.processId.then(shellProcessId => {

					const command = prepareCommand(args, config);
					this._integratedTerminalInstance.sendText(command, true);

					return shellProcessId;
				});
			});

		} else if (args.kind === 'external') {

			const terminalLauncher = getTerminalLauncher();
			if (terminalLauncher) {
				return terminalLauncher.runInTerminal(args, config);
			}
		}
		return undefined;
	}

	public $substituteVariables(folderUri: UriComponents | undefined, config: IConfig): Promise<IConfig> {
		if (!this._variableResolver) {
			this._variableResolver = new ExtHostVariableResolverService(this._workspaceService, this._editorsService, this._configurationService);
		}
		let ws: IWorkspaceFolder;
		const folder = this.getFolder(folderUri);
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
		return Promise.resolve(this._variableResolver.resolveAny(ws, config));
	}

	public $startDASession(debugAdapterHandle: number, sessionDto: IDebugSessionDto): Promise<void> {
		const mythis = this;

		const session = this.getSession(sessionDto);
		return this.getAdapterDescriptor(this.getAdapterFactoryByType(session.type), session).then(x => {

			const adapter = this.convertToDto(x);
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

			if (da) {
				this._debugAdapters.set(debugAdapterHandle, da);

				return this.getDebugAdapterTrackers(session).then(tracker => {

					if (tracker) {
						this._debugAdaptersTrackers.set(debugAdapterHandle, tracker);
					}

					da.onMessage(message => {

						if (tracker) {
							tracker.onDidSendMessage(message);
						}

						// DA -> VS Code
						message = convertToVSCPaths(message, source => stringToUri(source));

						mythis._debugServiceProxy.$acceptDAMessage(debugAdapterHandle, message);
					});
					da.onError(err => {
						if (tracker) {
							tracker.onError(err);
						}
						this._debugServiceProxy.$acceptDAError(debugAdapterHandle, err.name, err.message, err.stack);
					});
					da.onExit(code => {
						if (tracker) {
							tracker.onExit(code, undefined);
						}
						this._debugServiceProxy.$acceptDAExit(debugAdapterHandle, code, null);
					});

					if (tracker) {
						tracker.onWillStartSession();
					}

					return da.startSession();
				});

			}
			return undefined;
		});
	}

	public $sendDAMessage(debugAdapterHandle: number, message: DebugProtocol.ProtocolMessage): Promise<void> {

		// VS Code -> DA
		message = convertToDAPaths(message, source => uriToString(source));

		const tracker = this._debugAdaptersTrackers.get(debugAdapterHandle);	// TODO@AW: same handle?
		if (tracker) {
			tracker.onWillReceiveMessage(message);
		}

		const da = this._debugAdapters.get(debugAdapterHandle);
		if (da) {
			da.sendMessage(message);
		}
		return undefined;
	}

	public $stopDASession(debugAdapterHandle: number): Promise<void> {

		const tracker = this._debugAdaptersTrackers.get(debugAdapterHandle);
		this._debugAdaptersTrackers.delete(debugAdapterHandle);
		if (tracker) {
			tracker.onWillStopSession();
		}

		const da = this._debugAdapters.get(debugAdapterHandle);
		this._debugAdapters.delete(debugAdapterHandle);
		if (da) {
			return da.stopSession();
		} else {
			return undefined;
		}
	}

	public $acceptBreakpointsDelta(delta: IBreakpointsDeltaDto): void {

		let a: vscode.Breakpoint[] = [];
		let r: vscode.Breakpoint[] = [];
		let c: vscode.Breakpoint[] = [];

		if (delta.added) {
			for (const bpd of delta.added) {

				if (!this._breakpoints.has(bpd.id)) {
					let bp: vscode.Breakpoint;
					if (bpd.type === 'function') {
						bp = new FunctionBreakpoint(bpd.functionName, bpd.enabled, bpd.condition, bpd.hitCondition, bpd.logMessage);
					} else {
						const uri = URI.revive(bpd.uri);
						bp = new SourceBreakpoint(new Location(uri, new Position(bpd.line, bpd.character)), bpd.enabled, bpd.condition, bpd.hitCondition, bpd.logMessage);
					}
					(bp as any)._id = bpd.id;
					this._breakpoints.set(bpd.id, bp);
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
				let bp = this._breakpoints.get(bpd.id);
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

		this.fireBreakpointChanges(a, r, c);
	}

	public $provideDebugConfigurations(configProviderHandle: number, folderUri: UriComponents | undefined): Promise<vscode.DebugConfiguration[]> {
		let provider = this.getConfigProviderByHandle(configProviderHandle);
		if (!provider) {
			return Promise.reject(new Error('no handler found'));
		}
		if (!provider.provideDebugConfigurations) {
			return Promise.reject(new Error('handler has no method provideDebugConfigurations'));
		}
		return asPromise(() => provider.provideDebugConfigurations(this.getFolder(folderUri), CancellationToken.None));
	}

	public $resolveDebugConfiguration(configProviderHandle: number, folderUri: UriComponents | undefined, debugConfiguration: vscode.DebugConfiguration): Promise<vscode.DebugConfiguration> {
		let provider = this.getConfigProviderByHandle(configProviderHandle);
		if (!provider) {
			return Promise.reject(new Error('no handler found'));
		}
		if (!provider.resolveDebugConfiguration) {
			return Promise.reject(new Error('handler has no method resolveDebugConfiguration'));
		}
		return asPromise(() => provider.resolveDebugConfiguration(this.getFolder(folderUri), debugConfiguration, CancellationToken.None));
	}

	// TODO@AW legacy
	public $legacyDebugAdapterExecutable(configProviderHandle: number, folderUri: UriComponents | undefined): Promise<IAdapterDescriptor> {
		let provider = this.getConfigProviderByHandle(configProviderHandle);
		if (!provider) {
			return Promise.reject(new Error('no handler found'));
		}
		if (!provider.debugAdapterExecutable) {
			return Promise.reject(new Error('handler has no method debugAdapterExecutable'));
		}
		return asPromise(() => provider.debugAdapterExecutable(this.getFolder(folderUri), CancellationToken.None)).then(x => this.convertToDto(x));
	}

	public $provideDebugAdapter(adapterProviderHandle: number, sessionDto: IDebugSessionDto): Promise<IAdapterDescriptor> {
		let adapterProvider = this.getAdapterProviderByHandle(adapterProviderHandle);
		if (!adapterProvider) {
			return Promise.reject(new Error('no handler found'));
		}
		return this.getAdapterDescriptor(adapterProvider, this.getSession(sessionDto)).then(x => this.convertToDto(x));
	}

	public $acceptDebugSessionStarted(sessionDto: IDebugSessionDto): void {

		this._onDidStartDebugSession.fire(this.getSession(sessionDto));
	}

	public $acceptDebugSessionTerminated(sessionDto: IDebugSessionDto): void {

		const session = this.getSession(sessionDto);
		if (session) {
			this._onDidTerminateDebugSession.fire(session);
			this._debugSessions.delete(session.id);
		}
	}

	public $acceptDebugSessionActiveChanged(sessionDto: IDebugSessionDto): void {

		this._activeDebugSession = sessionDto ? this.getSession(sessionDto) : undefined;
		this._onDidChangeActiveDebugSession.fire(this._activeDebugSession);
	}

	public $acceptDebugSessionCustomEvent(sessionDto: IDebugSessionDto, event: any): void {

		const ee: vscode.DebugSessionCustomEvent = {
			session: this.getSession(sessionDto),
			event: event.event,
			body: event.body
		};
		this._onDidReceiveDebugSessionCustomEvent.fire(ee);
	}

	// private & dto helpers

	private convertToDto(x: vscode.DebugAdapterDescriptor): IAdapterDescriptor {
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
			throw new Error('unexpected type');
		}
	}

	private getAdapterFactoryByType(type: string): vscode.DebugAdapterDescriptorFactory {
		const results = this._adapterFactories.filter(p => p.type === type);
		if (results.length > 0) {
			return results[0].factory;
		}
		return undefined;
	}

	private getAdapterProviderByHandle(handle: number): vscode.DebugAdapterDescriptorFactory {
		const results = this._adapterFactories.filter(p => p.handle === handle);
		if (results.length > 0) {
			return results[0].factory;
		}
		return undefined;
	}

	private getConfigProviderByHandle(handle: number): vscode.DebugConfigurationProvider {
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

	private getDebugAdapterTrackers(session: ExtHostDebugSession): Promise<vscode.DebugAdapterTracker> {

		const config = session.configuration;
		const type = config.type;

		const promises = this._trackerFactories
			.filter(tuple => tuple.type === type || tuple.type === '*')
			.map(tuple => asPromise(() => tuple.factory.createDebugAdapterTracker(session)).then(p => p).catch(err => null));

		return Promise.race([
			Promise.all(promises).then(trackers => {
				trackers = trackers.filter(t => t);	// filter null
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

	private async getAdapterDescriptor(adapterProvider: vscode.DebugAdapterDescriptorFactory, session: ExtHostDebugSession): Promise<vscode.DebugAdapterDescriptor> {

		// a "debugServer" attribute in the launch config takes precedence
		const serverPort = session.configuration.debugServer;
		if (typeof serverPort === 'number') {
			return Promise.resolve(new DebugAdapterServer(serverPort));
		}

		// TODO@AW legacy
		const pairs = this._configProviders.filter(p => p.type === session.type);
		if (pairs.length > 0) {
			if (pairs[0].provider.debugAdapterExecutable) {
				return asPromise(() => pairs[0].provider.debugAdapterExecutable(session.workspaceFolder, CancellationToken.None));
			}
		}

		if (adapterProvider) {
			const extensionRegistry = await this._extensionService.getExtensionRegistry();
			return asPromise(() => adapterProvider.createDebugAdapterDescriptor(session, this.daExecutableFromPackage(session, extensionRegistry)));
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

	private getSession(dto: IDebugSessionDto): ExtHostDebugSession {
		if (dto) {
			if (typeof dto === 'string') {
				return this._debugSessions.get(dto);
			} else {
				const debugSession = new ExtHostDebugSession(this._debugServiceProxy, dto.id, dto.type, dto.name, this.getFolder(dto.folderUri), dto.configuration);
				this._debugSessions.set(debugSession.id, debugSession);
				return debugSession;
			}
		}
		return undefined;
	}

	private getFolder(_folderUri: UriComponents | undefined): vscode.WorkspaceFolder | undefined {
		if (_folderUri) {
			const folderURI = URI.revive(_folderUri);
			return this._workspaceService.resolveWorkspaceFolder(folderURI);
		}
		return undefined;
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

	constructor(workspaceService: ExtHostWorkspace, editorService: ExtHostDocumentsAndEditors, configurationService: ExtHostConfiguration) {
		super({
			getFolderUri: (folderName: string): URI => {
				const folders = workspaceService.getWorkspaceFolders();
				const found = folders.filter(f => f.name === folderName);
				if (found && found.length > 0) {
					return found[0].uri;
				}
				return undefined;
			},
			getWorkspaceFolderCount: (): number => {
				return workspaceService.getWorkspaceFolders().length;
			},
			getConfigurationValue: (folderUri: URI, section: string) => {
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
						return paths.normalize(resource.fsPath, true);
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
			getLineNumber: (): string => {
				const activeEditor = editorService.activeEditor();
				if (activeEditor) {
					return String(activeEditor.selection.end.line + 1);
				}
				return undefined;
			}
		});
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
	start(cb: (msg: DebugProtocol.ProtocolMessage) => void, errorcb: (event: DebugProtocol.Event) => void);
	send(message: DebugProtocol.ProtocolMessage);
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

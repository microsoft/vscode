/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as paths from 'vs/base/common/paths';
import { Schemas } from 'vs/base/common/network';
import { URI, UriComponents } from 'vs/base/common/uri';
import { Event, Emitter } from 'vs/base/common/event';
import { asThenable } from 'vs/base/common/async';
import * as nls from 'vs/nls';
import { deepClone } from 'vs/base/common/objects';
import {
	MainContext, MainThreadDebugServiceShape, ExtHostDebugServiceShape, DebugSessionUUID,
	IMainContext, IBreakpointsDeltaDto, ISourceMultiBreakpointDto, IFunctionBreakpointDto, IDebugSessionDto
} from 'vs/workbench/api/node/extHost.protocol';
import * as vscode from 'vscode';
import { Disposable, Position, Location, SourceBreakpoint, FunctionBreakpoint, DebugAdapterServer, DebugAdapterExecutable } from 'vs/workbench/api/node/extHostTypes';
import { generateUuid } from 'vs/base/common/uuid';
import { ExecutableDebugAdapter, SocketDebugAdapter, AbstractDebugAdapter } from 'vs/workbench/parts/debug/node/debugAdapter';
import { ExtHostWorkspace } from 'vs/workbench/api/node/extHostWorkspace';
import { ExtHostExtensionService } from 'vs/workbench/api/node/extHostExtensionService';
import { ExtHostDocumentsAndEditors } from 'vs/workbench/api/node/extHostDocumentsAndEditors';
import { ITerminalSettings, IDebuggerContribution, IConfig, IDebugAdapter } from 'vs/workbench/parts/debug/common/debug';
import { getTerminalLauncher, hasChildprocesses, prepareCommand } from 'vs/workbench/parts/debug/node/terminals';
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


export class ExtHostDebugService implements ExtHostDebugServiceShape {

	private _providerHandleCounter: number;
	private _providerByHandle: Map<number, vscode.DebugConfigurationProvider>;
	private _providerByType: Map<string, vscode.DebugConfigurationProvider>;
	private _providers: TypeProviderPair[];

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
		this._providerHandleCounter = 0;
		this._providerByHandle = new Map();
		this._providerByType = new Map();
		this._providers = [];

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


		// register all debug extensions
		const debugTypes: string[] = [];
		for (const ed of this._extensionService.getAllExtensionDescriptions()) {
			if (ed.contributes) {
				const debuggers = <IDebuggerContribution[]>ed.contributes['debuggers'];
				if (debuggers && debuggers.length > 0) {
					for (const dbg of debuggers) {
						// only debugger contributions with a "label" are considered a "defining" debugger contribution
						if (dbg.type && dbg.label) {
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

	public addBreakpoints(breakpoints0: vscode.Breakpoint[]): Thenable<void> {

		this.startBreakpoints();

		// assign uuids for brand new breakpoints
		const breakpoints: vscode.Breakpoint[] = [];
		for (const bp of breakpoints0) {
			let id = bp['_id'];
			if (id) {	// has already id
				if (this._breakpoints.has(id)) {
					// already there
				} else {
					breakpoints.push(bp);
				}
			} else {
				id = generateUuid();
				bp['_id'] = id;
				this._breakpoints.set(id, bp);
				breakpoints.push(bp);
			}
		}

		// send notification for added breakpoints
		this.fireBreakpointChanges(breakpoints, [], []);

		// convert added breakpoints to DTOs
		const dtos: (ISourceMultiBreakpointDto | IFunctionBreakpointDto)[] = [];
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
					id: bp['_id'],
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
					id: bp['_id'],
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

	public removeBreakpoints(breakpoints0: vscode.Breakpoint[]): Thenable<void> {

		this.startBreakpoints();

		// remove from array
		const breakpoints: vscode.Breakpoint[] = [];
		for (const b of breakpoints0) {
			let id = b['_id'];
			if (id && this._breakpoints.delete(id)) {
				breakpoints.push(b);
			}
		}

		// send notification
		this.fireBreakpointChanges([], breakpoints, []);

		// unregister with VS Code
		const ids = breakpoints.filter(bp => bp instanceof SourceBreakpoint).map(bp => bp['_id']);
		const fids = breakpoints.filter(bp => bp instanceof FunctionBreakpoint).map(bp => bp['_id']);
		return this._debugServiceProxy.$unregisterBreakpoints(ids, fids);
	}

	public startDebugging(folder: vscode.WorkspaceFolder | undefined, nameOrConfig: string | vscode.DebugConfiguration): Thenable<boolean> {
		return this._debugServiceProxy.$startDebugging(folder ? folder.uri : undefined, nameOrConfig);
	}

	public registerDebugConfigurationProvider(extension: IExtensionDescription, type: string, provider: vscode.DebugConfigurationProvider): vscode.Disposable {

		if (!provider) {
			return new Disposable(() => { });
		}

		// if a provider has a provideDebugAdapter method, we check the constraints specified in the API doc
		if (provider.provideDebugAdapter) {

			// a provider with this method can only be registered in the extension that contributes the debugger
			if (!this.definesDebugType(extension, type)) {
				throw new Error(`method 'provideDebugAdapter' must only be called from the extension that defines the '${type}' debugger.`);
			}

			// make sure that only one provider for this type is registered
			if (this._providerByType.has(type)) {
				throw new Error(`a provider with method 'provideDebugAdapter' can only be registered once per a type.`);
			} else {
				this._providerByType.set(type, provider);
			}
		}

		let handle = this._providerHandleCounter++;
		this._providerByHandle.set(handle, provider);
		this._providers.push({ type, provider });

		this._debugServiceProxy.$registerDebugConfigurationProvider(type,
			!!provider.provideDebugConfigurations,
			!!provider.resolveDebugConfiguration,
			!!provider.debugAdapterExecutable || !!provider.provideDebugAdapter,
			!!provider.provideDebugAdapterTracker, handle);

		return new Disposable(() => {
			this._providerByHandle.delete(handle);
			this._providerByType.delete(type);
			this._providers = this._providers.filter(p => p.provider !== provider);		// remove
			this._debugServiceProxy.$unregisterDebugConfigurationProvider(handle);
		});
	}

	// RPC methods (ExtHostDebugServiceShape)

	public $runInTerminal(args: DebugProtocol.RunInTerminalRequestArguments, config: ITerminalSettings): Thenable<void> {

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
						resolve(hasChildprocesses(pid));
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

				return new Promise((resolve) => {
					setTimeout(_ => {
						const command = prepareCommand(args, config);
						this._integratedTerminalInstance.sendText(command, true);
						resolve(void 0);
					}, 500);
				});
			});

		} else if (args.kind === 'external') {

			const terminalLauncher = getTerminalLauncher();
			if (terminalLauncher) {
				return terminalLauncher.runInTerminal(args, config);
			}
		}
		return void 0;
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

	public $startDASession(handle: number, sessionDto: IDebugSessionDto, folderUri: UriComponents | undefined, config: vscode.DebugConfiguration): Thenable<void> {
		const mythis = this;

		return this.getAdapterDescriptor(this._providerByType.get(config.type), sessionDto, folderUri, config).then(adapter => {

			let da: AbstractDebugAdapter | undefined = undefined;

			switch (adapter.type) {

				case 'server':
					da = new SocketDebugAdapter(adapter);
					break;

				case 'executable':
					da = new ExecutableDebugAdapter(adapter, config.type);
					break;

				case 'implementation':
					da = new DirectDebugAdapter(adapter.implementation);
					break;

				default:
					break;
			}

			if (da) {
				this._debugAdapters.set(handle, da);

				return this.getDebugAdapterTrackers(sessionDto, folderUri, config).then(tracker => {

					if (tracker) {
						this._debugAdaptersTrackers.set(handle, tracker);
					}

					da.onMessage(message => {

						// since we modify Source.paths in the message in place, we need to make a copy of it (see #61129)
						const msg = deepClone(message);

						if (tracker) {
							tracker.fromDebugAdapter(msg);
						}

						// DA -> VS Code
						convertToVSCPaths(msg, source => stringToUri(source));

						mythis._debugServiceProxy.$acceptDAMessage(handle, msg);
					});
					da.onError(err => {
						if (tracker) {
							tracker.debugAdapterError(err);
						}
						this._debugServiceProxy.$acceptDAError(handle, err.name, err.message, err.stack);
					});
					da.onExit(code => {
						if (tracker) {
							tracker.debugAdapterExit(code, null);
						}
						this._debugServiceProxy.$acceptDAExit(handle, code, null);
					});

					if (tracker) {
						tracker.startDebugAdapter();
					}

					return da.startSession();
				});

			}
			return undefined;
		});
	}

	public $sendDAMessage(handle: number, message: DebugProtocol.ProtocolMessage): Promise<void> {
		// VS Code -> DA
		convertToDAPaths(message, source => uriToString(source));

		const tracker = this._debugAdaptersTrackers.get(handle);
		if (tracker) {
			tracker.toDebugAdapter(message);
		}

		const da = this._debugAdapters.get(handle);
		if (da) {
			da.sendMessage(message);
		}
		return void 0;
	}

	public $stopDASession(handle: number): Thenable<void> {

		const tracker = this._debugAdaptersTrackers.get(handle);
		this._debugAdaptersTrackers.delete(handle);
		if (tracker) {
			tracker.stopDebugAdapter();
		}

		const da = this._debugAdapters.get(handle);
		this._debugAdapters.delete(handle);
		if (da) {
			return da.stopSession();
		} else {
			return void 0;
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
					bp['_id'] = bpd.id;
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

	public $provideDebugConfigurations(handle: number, folderUri: UriComponents | undefined): Thenable<vscode.DebugConfiguration[]> {
		let provider = this._providerByHandle.get(handle);
		if (!provider) {
			return Promise.reject(new Error('no handler found'));
		}
		if (!provider.provideDebugConfigurations) {
			return Promise.reject(new Error('handler has no method provideDebugConfigurations'));
		}
		return asThenable(() => provider.provideDebugConfigurations(this.getFolder(folderUri), CancellationToken.None));
	}

	public $resolveDebugConfiguration(handle: number, folderUri: UriComponents | undefined, debugConfiguration: vscode.DebugConfiguration): Thenable<vscode.DebugConfiguration> {
		let provider = this._providerByHandle.get(handle);
		if (!provider) {
			return Promise.reject(new Error('no handler found'));
		}
		if (!provider.resolveDebugConfiguration) {
			return Promise.reject(new Error('handler has no method resolveDebugConfiguration'));
		}
		return asThenable(() => provider.resolveDebugConfiguration(this.getFolder(folderUri), debugConfiguration, CancellationToken.None));
	}

	public $provideDebugAdapter(handle: number, sessionDto: IDebugSessionDto, folderUri: UriComponents | undefined, config: vscode.DebugConfiguration): Thenable<vscode.DebugAdapterDescriptor> {
		let provider = this._providerByHandle.get(handle);
		if (!provider) {
			return Promise.reject(new Error('no handler found'));
		}
		if (!provider.debugAdapterExecutable && !provider.provideDebugAdapter) {
			return Promise.reject(new Error('handler has no methods provideDebugAdapter or debugAdapterExecutable'));
		}
		return this.getAdapterDescriptor(provider, this.getSession(sessionDto), folderUri, config);
	}

	public $acceptDebugSessionStarted(sessionDto: IDebugSessionDto): void {

		this._onDidStartDebugSession.fire(this.getSession(sessionDto));
	}

	public $acceptDebugSessionTerminated(sessionDto: IDebugSessionDto): void {

		this._onDidTerminateDebugSession.fire(this.getSession(sessionDto));
		this._debugSessions.delete(sessionDto.id);
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

	private getDebugAdapterTrackers(sessionDto: IDebugSessionDto, folderUri: UriComponents | undefined, config: vscode.DebugConfiguration): Promise<vscode.DebugAdapterTracker> {

		const session = this.getSession(sessionDto);
		const folder = this.getFolder(folderUri);

		const type = config.type;
		const promises = this._providers
			.filter(pair => pair.provider.provideDebugAdapterTracker && (pair.type === type || pair.type === '*'))
			.map(pair => asThenable(() => pair.provider.provideDebugAdapterTracker(session, folder, config, CancellationToken.None)).then(p => p).catch(err => null));

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

	private getAdapterDescriptor(debugConfigProvider, sessionDto: IDebugSessionDto, folderUri: UriComponents | undefined, config: vscode.DebugConfiguration): Thenable<vscode.DebugAdapterDescriptor> {

		// a "debugServer" attribute in the launch config takes precedence
		if (typeof config.debugServer === 'number') {
			return Promise.resolve(new DebugAdapterServer(config.debugServer));
		}

		if (debugConfigProvider) {
			// try the proposed "provideDebugAdapter" API
			if (debugConfigProvider.provideDebugAdapter) {
				const adapterExecutable = ExecutableDebugAdapter.platformAdapterExecutable(this._extensionService.getAllExtensionDescriptions(), config.type);
				return asThenable(() => debugConfigProvider.provideDebugAdapter(this.getSession(sessionDto), this.getFolder(folderUri), adapterExecutable, config, CancellationToken.None));
			}
			// try the deprecated "debugAdapterExecutable" API
			if (debugConfigProvider.debugAdapterExecutable) {
				return asThenable(() => debugConfigProvider.debugAdapterExecutable(this.getFolder(folderUri), CancellationToken.None));
			}
		}

		// try deprecated command based extension API "adapterExecutableCommand" to determine the executable
		const aex = this._aexCommands.get(config.type);
		if (aex) {
			const rootFolder = folderUri ? URI.revive(folderUri).toString() : undefined;
			return this._commandService.executeCommand(aex, rootFolder).then((ae: { command: string, args: string[] }) => {
				return new DebugAdapterExecutable(ae.command, ae.args || []);
			});
		}

		// fallback: use executable information from package.json
		return Promise.resolve(ExecutableDebugAdapter.platformAdapterExecutable(this._extensionService.getAllExtensionDescriptions(), config.type));
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
			let debugSession = this._debugSessions.get(dto.id);
			if (!debugSession) {
				debugSession = new ExtHostDebugSession(this._debugServiceProxy, dto.id, dto.type, dto.name);
				this._debugSessions.set(dto.id, debugSession);
			}
			return debugSession;
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

	private _debugServiceProxy: MainThreadDebugServiceShape;

	private _id: DebugSessionUUID;
	private _type: string;
	private _name: string;

	constructor(proxy: MainThreadDebugServiceShape, id: DebugSessionUUID, type: string, name: string) {
		this._debugServiceProxy = proxy;
		this._id = id;
		this._type = type;
		this._name = name;
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

	public customRequest(command: string, args: any): Thenable<any> {
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
				return undefined;	// does not exist in EH
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

interface TypeProviderPair {
	type: string;
	provider: vscode.DebugConfigurationProvider;
}

interface IDapTransport {
	start(cb: (msg: DebugProtocol.ProtocolMessage) => void, errorcb: (event: DebugProtocol.Event) => void);
	send(message: DebugProtocol.ProtocolMessage);
	stop(): void;
}

class MultiTracker implements vscode.DebugAdapterTracker {

	constructor(private trackers: vscode.DebugAdapterTracker[]) {
	}

	startDebugAdapter(): void {
		this.trackers.forEach(t => t.startDebugAdapter ? t.startDebugAdapter() : void 0);
	}

	toDebugAdapter(message: any): void {
		this.trackers.forEach(t => t.toDebugAdapter ? t.toDebugAdapter(message) : void 0);
	}

	fromDebugAdapter(message: any): void {
		this.trackers.forEach(t => t.fromDebugAdapter ? t.fromDebugAdapter(message) : void 0);
	}

	debugAdapterError(error: Error): void {
		this.trackers.forEach(t => t.debugAdapterError ? t.debugAdapterError(error) : void 0);
	}

	debugAdapterExit(code: number, signal: string): void {
		this.trackers.forEach(t => t.debugAdapterExit ? t.debugAdapterExit(code, signal) : void 0);
	}

	stopDebugAdapter(): void {
		this.trackers.forEach(t => t.stopDebugAdapter ? t.stopDebugAdapter() : void 0);
	}
}

class DirectTransport implements IDapTransport {

	private _sendUp: (msg: DebugProtocol.ProtocolMessage) => void;

	constructor(private da: DirectDebugAdapter) {
	}

	start(cb: (msg: DebugProtocol.ProtocolMessage) => void, errorcb: (event: DebugProtocol.Event) => void) {
		this._sendUp = cb;
	}

	sendUp(message: DebugProtocol.ProtocolMessage) {
		this._sendUp(message);
	}

	// DA -> VSCode
	send(message: DebugProtocol.ProtocolMessage) {
		this.da.acceptMessage(message);
	}

	stop(): void {
		throw new Error('Method not implemented.');
	}
}

class DirectDebugAdapter extends AbstractDebugAdapter {

	readonly onError: Event<Error>;
	readonly onExit: Event<number>;

	private transport: DirectTransport;

	constructor(implementation: any) {
		super();
		if (implementation.__setTransport) {
			this.transport = new DirectTransport(this);
			implementation.__setTransport(this.transport);
		}
	}

	startSession(): Promise<void> {
		return Promise.resolve(void 0);
	}

	// VSCode -> DA
	sendMessage(message: DebugProtocol.ProtocolMessage): void {
		this.transport.sendUp(message);
	}

	stopSession(): Promise<void> {
		this.transport.stop();
		return Promise.resolve(void 0);
	}
}

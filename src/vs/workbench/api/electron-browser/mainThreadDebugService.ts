/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { URI as uri } from 'vs/base/common/uri';
import { IDebugService, IConfig, IDebugConfigurationProvider, IBreakpoint, IFunctionBreakpoint, IBreakpointData, ITerminalSettings, IDebugAdapter, IDebugAdapterDescriptorFactory, IDebugSession, IDebugAdapterFactory, IDebugAdapterTrackerFactory } from 'vs/workbench/parts/debug/common/debug';
import {
	ExtHostContext, ExtHostDebugServiceShape, MainThreadDebugServiceShape, DebugSessionUUID, MainContext,
	IExtHostContext, IBreakpointsDeltaDto, ISourceMultiBreakpointDto, ISourceBreakpointDto, IFunctionBreakpointDto, IDebugSessionDto
} from 'vs/workbench/api/node/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import severity from 'vs/base/common/severity';
import { AbstractDebugAdapter } from 'vs/workbench/parts/debug/node/debugAdapter';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { convertToVSCPaths, convertToDAPaths, stringToUri, uriToString } from 'vs/workbench/parts/debug/common/debugUtils';

@extHostNamedCustomer(MainContext.MainThreadDebugService)
export class MainThreadDebugService implements MainThreadDebugServiceShape, IDebugAdapterFactory {

	private _proxy: ExtHostDebugServiceShape;
	private _toDispose: IDisposable[];
	private _breakpointEventsActive: boolean;
	private _debugAdapters: Map<number, ExtensionHostDebugAdapter>;
	private _debugAdaptersHandleCounter = 1;
	private _debugConfigurationProviders: Map<number, IDebugConfigurationProvider>;
	private _debugAdapterDescriptorFactories: Map<number, IDebugAdapterDescriptorFactory>;
	private _debugAdapterTrackerFactories: Map<number, IDebugAdapterTrackerFactory>;
	private _sessions: Set<DebugSessionUUID>;

	constructor(
		extHostContext: IExtHostContext,
		@IDebugService private readonly debugService: IDebugService
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostDebugService);
		this._toDispose = [];
		this._toDispose.push(debugService.onDidNewSession(session => {
			this._proxy.$acceptDebugSessionStarted(this.getSessionDto(session));
		}));
		// Need to start listening early to new session events because a custom event can come while a session is initialising
		this._toDispose.push(debugService.onWillNewSession(session => {
			this._toDispose.push(session.onDidCustomEvent(event => this._proxy.$acceptDebugSessionCustomEvent(this.getSessionDto(session), event)));
		}));
		this._toDispose.push(debugService.onDidEndSession(session => {
			this._proxy.$acceptDebugSessionTerminated(this.getSessionDto(session));
			this._sessions.delete(session.getId());
		}));
		this._toDispose.push(debugService.getViewModel().onDidFocusSession(session => {
			this._proxy.$acceptDebugSessionActiveChanged(this.getSessionDto(session));
		}));

		this._debugAdapters = new Map();
		this._debugConfigurationProviders = new Map();
		this._debugAdapterDescriptorFactories = new Map();
		this._debugAdapterTrackerFactories = new Map();
		this._sessions = new Set();
	}

	public dispose(): void {
		this._toDispose = dispose(this._toDispose);
	}

	// interface IDebugAdapterProvider

	createDebugAdapter(session: IDebugSession): IDebugAdapter {
		const handle = this._debugAdaptersHandleCounter++;
		const da = new ExtensionHostDebugAdapter(this, handle, this._proxy, session);
		this._debugAdapters.set(handle, da);
		return da;
	}

	substituteVariables(folder: IWorkspaceFolder, config: IConfig): Promise<IConfig> {
		return Promise.resolve(this._proxy.$substituteVariables(folder ? folder.uri : undefined, config));
	}

	runInTerminal(args: DebugProtocol.RunInTerminalRequestArguments, config: ITerminalSettings): Promise<number | undefined> {
		return Promise.resolve(this._proxy.$runInTerminal(args, config));
	}

	// RPC methods (MainThreadDebugServiceShape)

	public $registerDebugTypes(debugTypes: string[]) {
		this._toDispose.push(this.debugService.getConfigurationManager().registerDebugAdapterFactory(debugTypes, this));
	}

	public $startBreakpointEvents(): void {

		if (!this._breakpointEventsActive) {
			this._breakpointEventsActive = true;

			// set up a handler to send more
			this._toDispose.push(this.debugService.getModel().onDidChangeBreakpoints(e => {
				// Ignore session only breakpoint events since they should only reflect in the UI
				if (e && !e.sessionOnly) {
					const delta: IBreakpointsDeltaDto = {};
					if (e.added) {
						delta.added = this.convertToDto(e.added);
					}
					if (e.removed) {
						delta.removed = e.removed.map(x => x.getId());
					}
					if (e.changed) {
						delta.changed = this.convertToDto(e.changed);
					}

					if (delta.added || delta.removed || delta.changed) {
						this._proxy.$acceptBreakpointsDelta(delta);
					}
				}
			}));

			// send all breakpoints
			const bps = this.debugService.getModel().getBreakpoints();
			const fbps = this.debugService.getModel().getFunctionBreakpoints();
			if (bps.length > 0 || fbps.length > 0) {
				this._proxy.$acceptBreakpointsDelta({
					added: this.convertToDto(bps).concat(this.convertToDto(fbps))
				});
			}
		}
	}

	public $registerBreakpoints(DTOs: Array<ISourceMultiBreakpointDto | IFunctionBreakpointDto>): Promise<void> {

		for (let dto of DTOs) {
			if (dto.type === 'sourceMulti') {
				const rawbps = dto.lines.map(l =>
					<IBreakpointData>{
						id: l.id,
						enabled: l.enabled,
						lineNumber: l.line + 1,
						column: l.character > 0 ? l.character + 1 : undefined, // a column value of 0 results in an omitted column attribute; see #46784
						condition: l.condition,
						hitCondition: l.hitCondition,
						logMessage: l.logMessage
					}
				);
				this.debugService.addBreakpoints(uri.revive(dto.uri), rawbps, 'extension');
			} else if (dto.type === 'function') {
				this.debugService.addFunctionBreakpoint(dto.functionName, dto.id);
			}
		}
		return undefined;
	}

	public $unregisterBreakpoints(breakpointIds: string[], functionBreakpointIds: string[]): Promise<void> {
		breakpointIds.forEach(id => this.debugService.removeBreakpoints(id));
		functionBreakpointIds.forEach(id => this.debugService.removeFunctionBreakpoints(id));
		return undefined;
	}


	public $registerDebugConfigurationProvider(debugType: string, hasProvide: boolean, hasResolve: boolean, hasProvideDebugAdapter: boolean, handle: number): Promise<void> {

		const provider = <IDebugConfigurationProvider>{
			type: debugType
		};
		if (hasProvide) {
			provider.provideDebugConfigurations = (folder) => {
				return Promise.resolve(this._proxy.$provideDebugConfigurations(handle, folder));
			};
		}
		if (hasResolve) {
			provider.resolveDebugConfiguration = (folder, config) => {
				return Promise.resolve(this._proxy.$resolveDebugConfiguration(handle, folder, config));
			};
		}
		if (hasProvideDebugAdapter) {
			console.info('DebugConfigurationProvider.debugAdapterExecutable is deprecated and will be removed soon; please use DebugAdapterDescriptorFactory.createDebugAdapterDescriptor instead.');
			provider.debugAdapterExecutable = (folder) => {
				return Promise.resolve(this._proxy.$legacyDebugAdapterExecutable(handle, folder));
			};
		}
		this._debugConfigurationProviders.set(handle, provider);
		this._toDispose.push(this.debugService.getConfigurationManager().registerDebugConfigurationProvider(provider));

		return Promise.resolve(undefined);
	}

	public $unregisterDebugConfigurationProvider(handle: number): void {
		const provider = this._debugConfigurationProviders.get(handle);
		if (provider) {
			this._debugConfigurationProviders.delete(handle);
			this.debugService.getConfigurationManager().unregisterDebugConfigurationProvider(provider);
		}
	}

	public $registerDebugAdapterDescriptorFactory(debugType: string, handle: number): Promise<void> {

		const provider = <IDebugAdapterDescriptorFactory>{
			type: debugType,
			createDebugAdapterDescriptor: session => {
				return Promise.resolve(this._proxy.$provideDebugAdapter(handle, this.getSessionDto(session)));
			}
		};
		this._debugAdapterDescriptorFactories.set(handle, provider);
		this._toDispose.push(this.debugService.getConfigurationManager().registerDebugAdapterDescriptorFactory(provider));

		return Promise.resolve(undefined);
	}

	public $unregisterDebugAdapterDescriptorFactory(handle: number): void {
		const provider = this._debugAdapterDescriptorFactories.get(handle);
		if (provider) {
			this._debugAdapterDescriptorFactories.delete(handle);
			this.debugService.getConfigurationManager().unregisterDebugAdapterDescriptorFactory(provider);
		}
	}

	public $registerDebugAdapterTrackerFactory(debugType: string, handle: number) {
		const factory = <IDebugAdapterTrackerFactory>{
			type: debugType,
		};
		this._debugAdapterTrackerFactories.set(handle, factory);
		this._toDispose.push(this.debugService.getConfigurationManager().registerDebugAdapterTrackerFactory(factory));

		return Promise.resolve(undefined);
	}

	public $unregisterDebugAdapterTrackerFactory(handle: number) {
		const factory = this._debugAdapterTrackerFactories.get(handle);
		if (factory) {
			this._debugAdapterTrackerFactories.delete(handle);
			this.debugService.getConfigurationManager().unregisterDebugAdapterTrackerFactory(factory);
		}
	}

	public $startDebugging(_folderUri: uri | undefined, nameOrConfiguration: string | IConfig): Promise<boolean> {
		const folderUri = _folderUri ? uri.revive(_folderUri) : undefined;
		const launch = this.debugService.getConfigurationManager().getLaunch(folderUri);
		return this.debugService.startDebugging(launch, nameOrConfiguration).then(success => {
			return success;
		}, err => {
			return Promise.reject(new Error(err && err.message ? err.message : 'cannot start debugging'));
		});
	}

	public $customDebugAdapterRequest(sessionId: DebugSessionUUID, request: string, args: any): Promise<any> {
		const session = this.debugService.getModel().getSessions(true).filter(s => s.getId() === sessionId).pop();
		if (session) {
			return session.customRequest(request, args).then(response => {
				if (response && response.success) {
					return response.body;
				} else {
					return Promise.reject(new Error(response ? response.message : 'custom request failed'));
				}
			});
		}
		return Promise.reject(new Error('debug session not found'));
	}

	public $appendDebugConsole(value: string): void {
		// Use warning as severity to get the orange color for messages coming from the debug extension
		const session = this.debugService.getViewModel().focusedSession;
		if (session) {
			session.appendToRepl(value, severity.Warning);
		}
	}

	public $acceptDAMessage(handle: number, message: DebugProtocol.ProtocolMessage) {

		this._debugAdapters.get(handle).acceptMessage(convertToVSCPaths(message, source => uriToString(source)));
	}

	public $acceptDAError(handle: number, name: string, message: string, stack: string) {
		this._debugAdapters.get(handle).fireError(handle, new Error(`${name}: ${message}\n${stack}`));
	}

	public $acceptDAExit(handle: number, code: number, signal: string) {
		this._debugAdapters.get(handle).fireExit(handle, code, signal);
	}

	// dto helpers

	getSessionDto(session: IDebugSession): IDebugSessionDto {
		if (session) {
			const sessionID = <DebugSessionUUID>session.getId();
			if (this._sessions.has(sessionID)) {
				return sessionID;
			} else {
				this._sessions.add(sessionID);
				return {
					id: sessionID,
					type: session.configuration.type,
					name: session.configuration.name,
					folderUri: session.root ? session.root.uri : undefined,
					configuration: session.configuration
				};
			}
		}
		return undefined;
	}

	private convertToDto(bps: (ReadonlyArray<IBreakpoint | IFunctionBreakpoint>)): Array<ISourceBreakpointDto | IFunctionBreakpointDto> {
		return bps.map(bp => {
			if ('name' in bp) {
				const fbp = <IFunctionBreakpoint>bp;
				return <IFunctionBreakpointDto>{
					type: 'function',
					id: fbp.getId(),
					enabled: fbp.enabled,
					condition: fbp.condition,
					hitCondition: fbp.hitCondition,
					logMessage: fbp.logMessage,
					functionName: fbp.name
				};
			} else {
				const sbp = <IBreakpoint>bp;
				return <ISourceBreakpointDto>{
					type: 'source',
					id: sbp.getId(),
					enabled: sbp.enabled,
					condition: sbp.condition,
					hitCondition: sbp.hitCondition,
					logMessage: sbp.logMessage,
					uri: sbp.uri,
					line: sbp.lineNumber > 0 ? sbp.lineNumber - 1 : 0,
					character: (typeof sbp.column === 'number' && sbp.column > 0) ? sbp.column - 1 : 0,
				};
			}
		});
	}
}

/**
 * DebugAdapter that communicates via extension protocol with another debug adapter.
 */
class ExtensionHostDebugAdapter extends AbstractDebugAdapter {

	constructor(private _ds: MainThreadDebugService, private _handle: number, private _proxy: ExtHostDebugServiceShape, private _session: IDebugSession) {
		super();
	}

	public fireError(handle: number, err: Error) {
		this._onError.fire(err);
	}

	public fireExit(handle: number, code: number, signal: string) {
		this._onExit.fire(code);
	}

	public startSession(): Promise<void> {
		return Promise.resolve(this._proxy.$startDASession(this._handle, this._ds.getSessionDto(this._session)));
	}

	public sendMessage(message: DebugProtocol.ProtocolMessage): void {

		this._proxy.$sendDAMessage(this._handle, convertToDAPaths(message, source => stringToUri(source)));
	}

	public stopSession(): Promise<void> {
		return Promise.resolve(this._proxy.$stopDASession(this._handle));
	}
}

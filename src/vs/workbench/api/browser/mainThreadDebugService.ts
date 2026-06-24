/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableMap, DisposableStore, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { URI as uri, UriComponents } from '../../../base/common/uri.js';
import { IDebugService, IConfig, IDebugConfigurationProvider, IBreakpoint, IFunctionBreakpoint, IBreakpointData, IDebugAdapter, IDebugAdapterDescriptorFactory, IDebugSession, IDebugAdapterFactory, IDataBreakpoint, IDebugSessionOptions, IInstructionBreakpoint, DebugConfigurationProviderTriggerKind, IDebugVisualization, DataBreakpointSetType } from '../../contrib/debug/common/debug.js';
import {
	ExtHostContext, ExtHostDebugServiceShape, MainThreadDebugServiceShape, DebugSessionUUID, MainContext,
	IBreakpointsDeltaDto, ISourceMultiBreakpointDto, ISourceBreakpointDto, IFunctionBreakpointDto, IDebugSessionDto, IDataBreakpointDto, IStartDebuggingOptions, IDebugConfiguration, IThreadFocusDto, IStackFrameFocusDto
} from '../common/extHost.protocol.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import severity from '../../../base/common/severity.js';
import { AbstractDebugAdapter } from '../../contrib/debug/common/abstractDebugAdapter.js';
import { IWorkspaceFolder } from '../../../platform/workspace/common/workspace.js';
import { convertToVSCPaths, convertToDAPaths, isSessionAttach } from '../../contrib/debug/common/debugUtils.js';
import { ErrorNoTelemetry } from '../../../base/common/errors.js';
import { IDebugVisualizerService } from '../../contrib/debug/common/debugVisualizers.js';
import { ExtensionIdentifier } from '../../../platform/extensions/common/extensions.js';
import { Event } from '../../../base/common/event.js';
import { isDefined } from '../../../base/common/types.js';

@extHostNamedCustomer(MainContext.MainThreadDebugService)
export class MainThreadDebugService implements MainThreadDebugServiceShape, IDebugAdapterFactory {

	private readonly _proxy: ExtHostDebugServiceShape;
	private readonly _toDispose = new DisposableStore();
	private readonly _debugAdapters: Map<number, ExtensionHostDebugAdapter>;
	private _debugAdaptersHandleCounter = 1;
	private readonly _debugConfigurationProviders: Map<number, IDebugConfigurationProvider>;
	private readonly _debugAdapterDescriptorFactories: Map<number, IDebugAdapterDescriptorFactory>;
	private readonly _extHostKnownSessions: Set<DebugSessionUUID>;
	private readonly _visualizerHandles = new Map<string, IDisposable>();
	private readonly _visualizerTreeHandles = new Map<string, IDisposable>();

	constructor(
		extHostContext: IExtHostContext,
		@IDebugService private readonly debugService: IDebugService,
		@IDebugVisualizerService private readonly visualizerService: IDebugVisualizerService,
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostDebugService);

		const sessionListeners = new DisposableMap<IDebugSession, DisposableStore>();
		this._toDispose.add(sessionListeners);
		this._toDispose.add(debugService.onDidNewSession(session => {
			this._proxy.$acceptDebugSessionStarted(this.getSessionDto(session));
			const store = sessionListeners.get(session);
			store?.add(session.onDidChangeName(name => {
				this._proxy.$acceptDebugSessionNameChanged(this.getSessionDto(session), name);
			}));
		}));
		// Need to start listening early to new session events because a custom event can come while a session is initialising
		this._toDispose.add(debugService.onWillNewSession(session => {
			let store = sessionListeners.get(session);
			if (!store) {
				store = new DisposableStore();
				sessionListeners.set(session, store);
			}
			store.add(session.onDidCustomEvent(event => this._proxy.$acceptDebugSessionCustomEvent(this.getSessionDto(session), event)));
		}));
		this._toDispose.add(debugService.onDidEndSession(({ session, restart }) => {
			this._proxy.$acceptDebugSessionTerminated(this.getSessionDto(session));
			this._extHostKnownSessions.delete(session.getId());

			// keep the session listeners around since we still will get events after they restart
			if (!restart) {
				sessionListeners.deleteAndDispose(session);
			}

			// any restarted session will create a new DA, so always throw the old one away.
			for (const [handle, value] of this._debugAdapters) {
				if (value.session === session) {
					this._debugAdapters.delete(handle);
					// break;
				}
			}
		}));
		this._toDispose.add(debugService.getViewModel().onDidFocusSession(session => {
			this._proxy.$acceptDebugSessionActiveChanged(this.getSessionDto(session));
		}));
		this._toDispose.add(toDisposable(() => {
			for (const [handle, da] of this._debugAdapters) {
				da.fireError(handle, new Error('Extension host shut down'));
			}
		}));

		this._debugAdapters = new Map();
		this._debugConfigurationProviders = new Map();
		this._debugAdapterDescriptorFactories = new Map();
		this._extHostKnownSessions = new Set();

		const viewModel = this.debugService.getViewModel();
		this._toDispose.add(Event.any(viewModel.onDidFocusStackFrame, viewModel.onDidFocusThread)(() => {
			const stackFrame = viewModel.focusedStackFrame;
			const thread = viewModel.focusedThread;
			if (stackFrame) {
				this._proxy.$acceptStackFrameFocus({
					kind: 'stackFrame',
					threadId: stackFrame.thread.threadId,
					frameId: stackFrame.frameId,
					sessionId: stackFrame.thread.session.getId(),
				} satisfies IStackFrameFocusDto);
			} else if (thread) {
				this._proxy.$acceptStackFrameFocus({
					kind: 'thread',
					threadId: thread.threadId,
					sessionId: thread.session.getId(),
				} satisfies IThreadFocusDto);
			} else {
				this._proxy.$acceptStackFrameFocus(undefined);
			}
		}));

		this.sendBreakpointsAndListen();
	}

	$registerDebugVisualizerTree(treeId: string, canEdit: boolean): void {
		this._visualizerTreeHandles.set(treeId, this.visualizerService.registerTree(treeId, {
			disposeItem: id => this._proxy.$disposeVisualizedTree(id),
			getChildren: e => this._proxy.$getVisualizerTreeItemChildren(treeId, e),
			getTreeItem: e => this._proxy.$getVisualizerTreeItem(treeId, e),
			editItem: canEdit ? ((e, v) => this._proxy.$editVisualizerTreeItem(e, v)) : undefined
		}));
	}

	$unregisterDebugVisualizerTree(treeId: string): void {
		this._visualizerTreeHandles.get(treeId)?.dispose();
		this._visualizerTreeHandles.delete(treeId);
	}

	$registerDebugVisualizer(extensionId: string, id: string): void {
		const handle = this.visualizerService.register({
			extensionId: new ExtensionIdentifier(extensionId),
			id,
			disposeDebugVisualizers: ids => this._proxy.$disposeDebugVisualizers(ids),
			executeDebugVisualizerCommand: id => this._proxy.$executeDebugVisualizerCommand(id),
			provideDebugVisualizers: (context, token) => this._proxy.$provideDebugVisualizers(extensionId, id, context, token).then(r => r.map(IDebugVisualization.deserialize)),
			resolveDebugVisualizer: (viz, token) => this._proxy.$resolveDebugVisualizer(viz.id, token),
		});
		this._visualizerHandles.set(`${extensionId}/${id}`, handle);
	}

	$unregisterDebugVisualizer(extensionId: string, id: string): void {
		const key = `${extensionId}/${id}`;
		this._visualizerHandles.get(key)?.dispose();
		this._visualizerHandles.delete(key);
	}

	private sendBreakpointsAndListen(): void {
		// set up a handler to send more
		this._toDispose.add(this.debugService.getModel().onDidChangeBreakpoints(e => {
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
		const dbps = this.debugService.getModel().getDataBreakpoints();
		if (bps.length > 0 || fbps.length > 0) {
			this._proxy.$acceptBreakpointsDelta({
				added: this.convertToDto(bps).concat(this.convertToDto(fbps)).concat(this.convertToDto(dbps))
			});
		}
	}

	public dispose(): void {
		this._toDispose.dispose();
	}

	// interface IDebugAdapterProvider

	createDebugAdapter(session: IDebugSession): IDebugAdapter {
		const handle = this._debugAdaptersHandleCounter++;
		const da = new ExtensionHostDebugAdapter(this, handle, this._proxy, session);
		this._debugAdapters.set(handle, da);
		return da;
	}

	substituteVariables(folder: IWorkspaceFolder | undefined, config: IConfig): Promise<IConfig> {
		return Promise.resolve(this._proxy.$substituteVariables(folder ? folder.uri : undefined, config));
	}

	runInTerminal(args: DebugProtocol.RunInTerminalRequestArguments, sessionId: string): Promise<number | undefined> {
		return this._proxy.$runInTerminal(args, sessionId);
	}

	// RPC methods (MainThreadDebugServiceShape)

	public $registerDebugTypes(debugTypes: string[]) {
		this._toDispose.add(this.debugService.getAdapterManager().registerDebugAdapterFactory(debugTypes, this));
	}

	public $registerBreakpoints(DTOs: Array<ISourceMultiBreakpointDto | IFunctionBreakpointDto | IDataBreakpointDto>): Promise<void> {

		for (const dto of DTOs) {
			if (dto.type === 'sourceMulti') {
				const rawbps = dto.lines.map((l): IBreakpointData => ({
					id: l.id,
					enabled: l.enabled,
					lineNumber: l.line + 1,
					column: l.character > 0 ? l.character + 1 : undefined, // a column value of 0 results in an omitted column attribute; see #46784
					condition: l.condition,
					hitCondition: l.hitCondition,
					logMessage: l.logMessage,
					mode: l.mode,
				}));
				this.debugService.addBreakpoints(uri.revive(dto.uri), rawbps);
			} else if (dto.type === 'function') {
				this.debugService.addFunctionBreakpoint({
					name: dto.functionName,
					mode: dto.mode,
					condition: dto.condition,
					hitCondition: dto.hitCondition,
					enabled: dto.enabled,
					logMessage: dto.logMessage
				}, dto.id);
			} else if (dto.type === 'data') {
				this.debugService.addDataBreakpoint({
					description: dto.label,
					src: { type: DataBreakpointSetType.Variable, dataId: dto.dataId },
					canPersist: dto.canPersist,
					accessTypes: dto.accessTypes,
					accessType: dto.accessType,
					mode: dto.mode
				});
			}
		}
		return Promise.resolve();
	}

	public $unregisterBreakpoints(breakpointIds: string[], functionBreakpointIds: string[], dataBreakpointIds: string[]): Promise<void> {
		breakpointIds.forEach(id => this.debugService.removeBreakpoints(id));
		functionBreakpointIds.forEach(id => this.debugService.removeFunctionBreakpoints(id));
		dataBreakpointIds.forEach(id => this.debugService.removeDataBreakpoints(id));
		return Promise.resolve();
	}

	public $registerDebugConfigurationProvider(debugType: string, providerTriggerKind: DebugConfigurationProviderTriggerKind, hasProvide: boolean, hasResolve: boolean, hasResolve2: boolean, handle: number): Promise<void> {

		const provider: IDebugConfigurationProvider = {
			type: debugType,
			triggerKind: providerTriggerKind
		};
		if (hasProvide) {
			provider.provideDebugConfigurations = (folder, token) => {
				return this._proxy.$provideDebugConfigurations(handle, folder, token);
			};
		}
		if (hasResolve) {
			provider.resolveDebugConfiguration = (folder, config, token) => {
				return this._proxy.$resolveDebugConfiguration(handle, folder, config, token);
			};
		}
		if (hasResolve2) {
			provider.resolveDebugConfigurationWithSubstitutedVariables = (folder, config, token) => {
				return this._proxy.$resolveDebugConfigurationWithSubstitutedVariables(handle, folder, config, token);
			};
		}
		this._debugConfigurationProviders.set(handle, provider);
		this._toDispose.add(this.debugService.getConfigurationManager().registerDebugConfigurationProvider(provider));

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

		const provider: IDebugAdapterDescriptorFactory = {
			type: debugType,
			createDebugAdapterDescriptor: session => {
				return Promise.resolve(this._proxy.$provideDebugAdapter(handle, this.getSessionDto(session)));
			}
		};
		this._debugAdapterDescriptorFactories.set(handle, provider);
		this._toDispose.add(this.debugService.getAdapterManager().registerDebugAdapterDescriptorFactory(provider));

		return Promise.resolve(undefined);
	}

	public $unregisterDebugAdapterDescriptorFactory(handle: number): void {
		const provider = this._debugAdapterDescriptorFactories.get(handle);
		if (provider) {
			this._debugAdapterDescriptorFactories.delete(handle);
			this.debugService.getAdapterManager().unregisterDebugAdapterDescriptorFactory(provider);
		}
	}

	private getSession(sessionId: DebugSessionUUID | undefined): IDebugSession | undefined {
		if (sessionId) {
			return this.debugService.getModel().getSession(sessionId, true);
		}
		return undefined;
	}

	public async $startDebugging(folder: UriComponents | undefined, nameOrConfig: string | IDebugConfiguration, options: IStartDebuggingOptions): Promise<boolean> {
		const folderUri = folder ? uri.revive(folder) : undefined;
		const launch = this.debugService.getConfigurationManager().getLaunch(folderUri);
		const parentSession = this.getSession(options.parentSessionID);
		const saveBeforeStart = typeof options.suppressSaveBeforeStart === 'boolean' ? !options.suppressSaveBeforeStart : undefined;
		const debugOptions: IDebugSessionOptions = {
			noDebug: options.noDebug,
			parentSession,
			lifecycleManagedByParent: options.lifecycleManagedByParent,
			repl: options.repl,
			compact: options.compact,
			compoundRoot: parentSession?.compoundRoot,
			saveBeforeRestart: saveBeforeStart,
			testRun: options.testRun,

			suppressDebugStatusbar: options.suppressDebugStatusbar,
			suppressDebugToolbar: options.suppressDebugToolbar,
			suppressDebugView: options.suppressDebugView,
		};
		try {
			return this.debugService.startDebugging(launch, nameOrConfig, debugOptions, saveBeforeStart);
		} catch (err) {
			throw new ErrorNoTelemetry(err && err.message ? err.message : 'cannot start debugging');
		}
	}

	public $setDebugSessionName(sessionId: DebugSessionUUID, name: string): void {
		const session = this.debugService.getModel().getSession(sessionId);
		session?.setName(name);
	}

	public $customDebugAdapterRequest(sessionId: DebugSessionUUID, request: string, args: unknown): Promise<unknown> {
		const session = this.debugService.getModel().getSession(sessionId, true);
		if (session) {
			return session.customRequest(request, args).then(response => {
				if (response && response.success) {
					return response.body;
				} else {
					return Promise.reject(new ErrorNoTelemetry(response ? response.message : 'custom request failed'));
				}
			});
		}
		return Promise.reject(new ErrorNoTelemetry('debug session not found'));
	}

	public $getDebugProtocolBreakpoint(sessionId: DebugSessionUUID, breakpoinId: string): Promise<DebugProtocol.Breakpoint | undefined> {
		const session = this.debugService.getModel().getSession(sessionId, true);
		if (session) {
			return Promise.resolve(session.getDebugProtocolBreakpoint(breakpoinId));
		}
		return Promise.reject(new ErrorNoTelemetry('debug session not found'));
	}

	public $stopDebugging(sessionId: DebugSessionUUID | undefined): Promise<void> {
		if (sessionId) {
			const session = this.debugService.getModel().getSession(sessionId, true);
			if (session) {
				return this.debugService.stopSession(session, isSessionAttach(session));
			}
		} else {	// stop all
			return this.debugService.stopSession(undefined);
		}
		return Promise.reject(new ErrorNoTelemetry('debug session not found'));
	}

	public $appendDebugConsole(value: string): void {
		// Use warning as severity to get the orange color for messages coming from the debug extension
		const session = this.debugService.getViewModel().focusedSession;
		session?.appendToRepl({ output: value, sev: severity.Warning });
	}

	public $acceptDAMessage(handle: number, message: DebugProtocol.ProtocolMessage) {
		this.getDebugAdapter(handle).acceptMessage(convertToVSCPaths(message, false));
	}

	public $acceptDAError(handle: number, name: string, message: string, stack: string) {
		// don't use getDebugAdapter since an error can be expected on a post-close
		this._debugAdapters.get(handle)?.fireError(handle, new Error(`${name}: ${message}\n${stack}`));
	}

	public $acceptDAExit(handle: number, code: number, signal: string) {
		// don't use getDebugAdapter since an error can be expected on a post-close
		this._debugAdapters.get(handle)?.fireExit(handle, code, signal);
	}

	private getDebugAdapter(handle: number): ExtensionHostDebugAdapter {
		const adapter = this._debugAdapters.get(handle);
		if (!adapter) {
			throw new Error('Invalid debug adapter');
		}
		return adapter;
	}

	// dto helpers

	public $sessionCached(sessionID: string) {
		// remember that the EH has cached the session and we do not have to send it again
		this._extHostKnownSessions.add(sessionID);
	}


	getSessionDto(session: undefined): undefined;
	getSessionDto(session: IDebugSession): IDebugSessionDto;
	getSessionDto(session: IDebugSession | undefined): IDebugSessionDto | undefined;
	getSessionDto(session: IDebugSession | undefined): IDebugSessionDto | undefined {
		if (session) {
			const sessionID = session.getId();
			if (this._extHostKnownSessions.has(sessionID)) {
				return sessionID;
			} else {
				// this._sessions.add(sessionID); 	// #69534: see $sessionCached above
				return {
					id: sessionID,
					type: session.configuration.type,
					name: session.name,
					folderUri: session.root ? session.root.uri : undefined,
					configuration: session.configuration,
					parent: session.parentSession?.getId(),
				};
			}
		}
		return undefined;
	}

	private convertToDto(bps: (ReadonlyArray<IBreakpoint | IFunctionBreakpoint | IDataBreakpoint | IInstructionBreakpoint>)): Array<ISourceBreakpointDto | IFunctionBreakpointDto | IDataBreakpointDto> {
		return bps.map(bp => {
			if ('name' in bp) {
				const fbp: IFunctionBreakpoint = bp;
				return {
					type: 'function',
					id: fbp.getId(),
					enabled: fbp.enabled,
					condition: fbp.condition,
					hitCondition: fbp.hitCondition,
					logMessage: fbp.logMessage,
					functionName: fbp.name
				} satisfies IFunctionBreakpointDto;
			} else if ('src' in bp) {
				const dbp: IDataBreakpoint = bp;
				return {
					type: 'data',
					id: dbp.getId(),
					dataId: dbp.src.type === DataBreakpointSetType.Variable ? dbp.src.dataId : dbp.src.address,
					enabled: dbp.enabled,
					condition: dbp.condition,
					hitCondition: dbp.hitCondition,
					logMessage: dbp.logMessage,
					accessType: dbp.accessType,
					label: dbp.description,
					canPersist: dbp.canPersist
				} satisfies IDataBreakpointDto;
			} else if ('uri' in bp) {
				const sbp: IBreakpoint = bp;
				return {
					type: 'source',
					id: sbp.getId(),
					enabled: sbp.enabled,
					condition: sbp.condition,
					hitCondition: sbp.hitCondition,
					logMessage: sbp.logMessage,
					uri: sbp.uri,
					line: sbp.lineNumber > 0 ? sbp.lineNumber - 1 : 0,
					character: (typeof sbp.column === 'number' && sbp.column > 0) ? sbp.column - 1 : 0,
				} satisfies ISourceBreakpointDto;
			} else {
				return undefined;
			}
		}).filter(isDefined);
	}
}

/**
 * DebugAdapter that communicates via extension protocol with another debug adapter.
 */
class ExtensionHostDebugAdapter extends AbstractDebugAdapter {

	constructor(private readonly _ds: MainThreadDebugService, private _handle: number, private _proxy: ExtHostDebugServiceShape, readonly session: IDebugSession) {
		super();
	}

	fireError(handle: number, err: Error) {
		this._onError.fire(err);
	}

	fireExit(handle: number, code: number, signal: string) {
		this._onExit.fire(code);
	}

	startSession(): Promise<void> {
		return Promise.resolve(this._proxy.$startDASession(this._handle, this._ds.getSessionDto(this.session)));
	}

	sendMessage(message: DebugProtocol.ProtocolMessage): void {
		this._proxy.$sendDAMessage(this._handle, convertToDAPaths(message, true));
	}

	async stopSession(): Promise<void> {
		await this.cancelPendingRequests();
		return Promise.resolve(this._proxy.$stopDASession(this._handle));
	}
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as aria from '../../../../base/browser/ui/aria/aria.js';
import { distinct } from '../../../../base/common/arrays.js';
import { Queue, RunOnceScheduler, raceTimeout } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { canceled } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { normalizeDriveLetter } from '../../../../base/common/labels.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable, dispose } from '../../../../base/common/lifecycle.js';
import { mixin } from '../../../../base/common/objects.js';
import * as platform from '../../../../base/common/platform.js';
import * as resources from '../../../../base/common/resources.js';
import Severity from '../../../../base/common/severity.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IPosition, Position } from '../../../../editor/common/core/position.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ICustomEndpointTelemetryService, ITelemetryService, TelemetryLevel } from '../../../../platform/telemetry/common/telemetry.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceContextService, IWorkspaceFolder } from '../../../../platform/workspace/common/workspace.js';
import { ViewContainerLocation } from '../../../common/views.js';
import { RawDebugSession } from './rawDebugSession.js';
import { AdapterEndEvent, IBreakpoint, IConfig, IDataBreakpoint, IDataBreakpointInfoResponse, IDebugConfiguration, IDebugLocationReferenced, IDebugService, IDebugSession, IDebugSessionOptions, IDebugger, IExceptionBreakpoint, IExceptionInfo, IFunctionBreakpoint, IInstructionBreakpoint, IMemoryRegion, IRawModelUpdate, IRawStoppedDetails, IReplElement, IStackFrame, IThread, LoadedSourceEvent, State, VIEWLET_ID, isFrameDeemphasized } from '../common/debug.js';
import { DebugCompoundRoot } from '../common/debugCompoundRoot.js';
import { DebugModel, ExpressionContainer, MemoryRegion, Thread } from '../common/debugModel.js';
import { Source } from '../common/debugSource.js';
import { filterExceptionsFromTelemetry } from '../common/debugUtils.js';
import { INewReplElementData, ReplModel } from '../common/replModel.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { IPaneCompositePartService } from '../../../services/panecomposite/browser/panecomposite.js';
import { getActiveWindow } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { isDefined } from '../../../../base/common/types.js';
import { ITestService } from '../../testing/common/testService.js';
import { ITestResultService } from '../../testing/common/testResultService.js';
import { LiveTestResult } from '../../testing/common/testResult.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';

const TRIGGERED_BREAKPOINT_MAX_DELAY = 1500;

export class DebugSession implements IDebugSession, IDisposable {
	parentSession: IDebugSession | undefined;
	rememberedCapabilities?: DebugProtocol.Capabilities;

	private _subId: string | undefined;
	raw: RawDebugSession | undefined; // used in tests
	private initialized = false;
	private _options: IDebugSessionOptions;

	private sources = new Map<string, Source>();
	private threads = new Map<number, Thread>();
	private threadIds: number[] = [];
	private cancellationMap = new Map<number, CancellationTokenSource[]>();
	private readonly rawListeners = new DisposableStore();
	private readonly globalDisposables = new DisposableStore();
	private fetchThreadsScheduler: RunOnceScheduler | undefined;
	private passFocusScheduler: RunOnceScheduler;
	private lastContinuedThreadId: number | undefined;
	private repl: ReplModel;
	private stoppedDetails: IRawStoppedDetails[] = [];
	private readonly statusQueue = this.rawListeners.add(new ThreadStatusScheduler());

	/** Test run this debug session was spawned by */
	public readonly correlatedTestRun?: LiveTestResult;
	/** Whether we terminated the correlated run yet. Used so a 2nd terminate request goes through to the underlying session. */
	private didTerminateTestRun?: boolean;

	private readonly _onDidChangeState = new Emitter<void>();
	private readonly _onDidEndAdapter = new Emitter<AdapterEndEvent | undefined>();

	private readonly _onDidLoadedSource = new Emitter<LoadedSourceEvent>();
	private readonly _onDidCustomEvent = new Emitter<DebugProtocol.Event>();
	private readonly _onDidProgressStart = new Emitter<DebugProtocol.ProgressStartEvent>();
	private readonly _onDidProgressUpdate = new Emitter<DebugProtocol.ProgressUpdateEvent>();
	private readonly _onDidProgressEnd = new Emitter<DebugProtocol.ProgressEndEvent>();
	private readonly _onDidInvalidMemory = new Emitter<DebugProtocol.MemoryEvent>();

	private readonly _onDidChangeREPLElements = new Emitter<IReplElement | undefined>();

	private _name: string | undefined;
	private readonly _onDidChangeName = new Emitter<string>();

	/**
	 * Promise set while enabling dependent breakpoints to block the debugger
	 * from continuing from a stopped state.
	 */
	private _waitToResume?: Promise<unknown>;

	constructor(
		private id: string,
		private _configuration: { resolved: IConfig; unresolved: IConfig | undefined },
		public root: IWorkspaceFolder | undefined,
		private model: DebugModel,
		options: IDebugSessionOptions | undefined,
		@IDebugService private readonly debugService: IDebugService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IHostService private readonly hostService: IHostService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IPaneCompositePartService private readonly paneCompositeService: IPaneCompositePartService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IProductService private readonly productService: IProductService,
		@INotificationService private readonly notificationService: INotificationService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ICustomEndpointTelemetryService private readonly customEndpointTelemetryService: ICustomEndpointTelemetryService,
		@IWorkbenchEnvironmentService private readonly workbenchEnvironmentService: IWorkbenchEnvironmentService,
		@ILogService private readonly logService: ILogService,
		@ITestService private readonly testService: ITestService,
		@ITestResultService testResultService: ITestResultService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
	) {
		this._options = options || {};
		this.parentSession = this._options.parentSession;
		if (this.hasSeparateRepl()) {
			this.repl = new ReplModel(this.configurationService);
		} else {
			this.repl = (this.parentSession as DebugSession).repl;
		}

		const toDispose = this.globalDisposables;
		const replListener = toDispose.add(new MutableDisposable());
		replListener.value = this.repl.onDidChangeElements((e) => this._onDidChangeREPLElements.fire(e));
		if (lifecycleService) {
			toDispose.add(lifecycleService.onWillShutdown(() => {
				this.shutdown();
				dispose(toDispose);
			}));
		}

		// Cast here, it's not possible to reference a hydrated result in this code path.
		this.correlatedTestRun = options?.testRun
			? (testResultService.getResult(options.testRun.runId) as LiveTestResult)
			: this.parentSession?.correlatedTestRun;

		if (this.correlatedTestRun) {
			// Listen to the test completing because the user might have taken the cancel action rather than stopping the session.
			toDispose.add(this.correlatedTestRun.onComplete(() => this.terminate()));
		}

		const compoundRoot = this._options.compoundRoot;
		if (compoundRoot) {
			toDispose.add(compoundRoot.onDidSessionStop(() => this.terminate()));
		}
		this.passFocusScheduler = new RunOnceScheduler(() => {
			// If there is some session or thread that is stopped pass focus to it
			if (this.debugService.getModel().getSessions().some(s => s.state === State.Stopped) || this.getAllThreads().some(t => t.stopped)) {
				if (typeof this.lastContinuedThreadId === 'number') {
					const thread = this.debugService.getViewModel().focusedThread;
					if (thread && thread.threadId === this.lastContinuedThreadId && !thread.stopped) {
						const toFocusThreadId = this.getStoppedDetails()?.threadId;
						const toFocusThread = typeof toFocusThreadId === 'number' ? this.getThread(toFocusThreadId) : undefined;
						this.debugService.focusStackFrame(undefined, toFocusThread);
					}
				} else {
					const session = this.debugService.getViewModel().focusedSession;
					if (session && session.getId() === this.getId() && session.state !== State.Stopped) {
						this.debugService.focusStackFrame(undefined);
					}
				}
			}
		}, 800);

		const parent = this._options.parentSession;
		if (parent) {
			toDispose.add(parent.onDidEndAdapter(() => {
				// copy the parent repl and get a new detached repl for this child, and
				// remove its parent, if it's still running
				if (!this.hasSeparateRepl() && this.raw?.isInShutdown === false) {
					this.repl = this.repl.clone();
					replListener.value = this.repl.onDidChangeElements((e) => this._onDidChangeREPLElements.fire(e));
					this.parentSession = undefined;
				}
			}));
		}
	}

	getId(): string {
		return this.id;
	}

	setSubId(subId: string | undefined) {
		this._subId = subId;
	}

	getMemory(memoryReference: string): IMemoryRegion {
		return new MemoryRegion(memoryReference, this);
	}

	get subId(): string | undefined {
		return this._subId;
	}

	get configuration(): IConfig {
		return this._configuration.resolved;
	}

	get unresolvedConfiguration(): IConfig | undefined {
		return this._configuration.unresolved;
	}

	get lifecycleManagedByParent(): boolean {
		return !!this._options.lifecycleManagedByParent;
	}

	get compact(): boolean {
		return !!this._options.compact;
	}

	get saveBeforeRestart(): boolean {
		return this._options.saveBeforeRestart ?? !this._options?.parentSession;
	}

	get compoundRoot(): DebugCompoundRoot | undefined {
		return this._options.compoundRoot;
	}

	get suppressDebugStatusbar(): boolean {
		return this._options.suppressDebugStatusbar ?? false;
	}

	get suppressDebugToolbar(): boolean {
		return this._options.suppressDebugToolbar ?? false;
	}

	get suppressDebugView(): boolean {
		return this._options.suppressDebugView ?? false;
	}


	get autoExpandLazyVariables(): boolean {
		// This tiny helper avoids converting the entire debug model to use service injection
		const screenReaderOptimized = this.accessibilityService.isScreenReaderOptimized();
		const value = this.configurationService.getValue<IDebugConfiguration>('debug').autoExpandLazyVariables;
		return value === 'auto' && screenReaderOptimized || value === 'on';
	}

	setConfiguration(configuration: { resolved: IConfig; unresolved: IConfig | undefined }) {
		this._configuration = configuration;
	}

	getLabel(): string {
		const includeRoot = this.workspaceContextService.getWorkspace().folders.length > 1;
		return includeRoot && this.root ? `${this.name} (${resources.basenameOrAuthority(this.root.uri)})` : this.name;
	}

	setName(name: string): void {
		this._name = name;
		this._onDidChangeName.fire(name);
	}

	get name(): string {
		return this._name || this.configuration.name;
	}

	get state(): State {
		if (!this.initialized) {
			return State.Initializing;
		}
		if (!this.raw) {
			return State.Inactive;
		}

		const focusedThread = this.debugService.getViewModel().focusedThread;
		if (focusedThread && focusedThread.session === this) {
			return focusedThread.stopped ? State.Stopped : State.Running;
		}
		if (this.getAllThreads().some(t => t.stopped)) {
			return State.Stopped;
		}

		return State.Running;
	}

	get capabilities(): DebugProtocol.Capabilities {
		return this.raw ? this.raw.capabilities : Object.create(null);
	}

	//---- events
	get onDidChangeState(): Event<void> {
		return this._onDidChangeState.event;
	}

	get onDidEndAdapter(): Event<AdapterEndEvent | undefined> {
		return this._onDidEndAdapter.event;
	}

	get onDidChangeReplElements(): Event<IReplElement | undefined> {
		return this._onDidChangeREPLElements.event;
	}

	get onDidChangeName(): Event<string> {
		return this._onDidChangeName.event;
	}

	//---- DAP events

	get onDidCustomEvent(): Event<DebugProtocol.Event> {
		return this._onDidCustomEvent.event;
	}

	get onDidLoadedSource(): Event<LoadedSourceEvent> {
		return this._onDidLoadedSource.event;
	}

	get onDidProgressStart(): Event<DebugProtocol.ProgressStartEvent> {
		return this._onDidProgressStart.event;
	}

	get onDidProgressUpdate(): Event<DebugProtocol.ProgressUpdateEvent> {
		return this._onDidProgressUpdate.event;
	}

	get onDidProgressEnd(): Event<DebugProtocol.ProgressEndEvent> {
		return this._onDidProgressEnd.event;
	}

	get onDidInvalidateMemory(): Event<DebugProtocol.MemoryEvent> {
		return this._onDidInvalidMemory.event;
	}

	//---- DAP requests

	/**
	 * create and initialize a new debug adapter for this session
	 */
	async initialize(dbgr: IDebugger): Promise<void> {

		if (this.raw) {
			// if there was already a connection make sure to remove old listeners
			await this.shutdown();
		}

		try {
			const debugAdapter = await dbgr.createDebugAdapter(this);
			this.raw = this.instantiationService.createInstance(RawDebugSession, debugAdapter, dbgr, this.id, this.configuration.name);

			await this.raw.start();
			this.registerListeners();
			await this.raw.initialize({
				clientID: 'vscode',
				clientName: this.productService.nameLong,
				adapterID: this.configuration.type,
				pathFormat: 'path',
				linesStartAt1: true,
				columnsStartAt1: true,
				supportsVariableType: true, // #8858
				supportsVariablePaging: true, // #9537
				supportsRunInTerminalRequest: true, // #10574
				locale: platform.language, // #169114
				supportsProgressReporting: true, // #92253
				supportsInvalidatedEvent: true, // #106745
				supportsMemoryReferences: true, //#129684
				supportsArgsCanBeInterpretedByShell: true, // #149910
				supportsMemoryEvent: true, // #133643
				supportsStartDebuggingRequest: true,
				supportsANSIStyling: true,
			});

			this.initialized = true;
			this._onDidChangeState.fire();
			this.rememberedCapabilities = this.raw.capabilities;
			this.debugService.setExceptionBreakpointsForSession(this, (this.raw && this.raw.capabilities.exceptionBreakpointFilters) || []);
			this.debugService.getModel().registerBreakpointModes(this.configuration.type, this.raw.capabilities.breakpointModes || []);
		} catch (err) {
			this.initialized = true;
			this._onDidChangeState.fire();
			await this.shutdown();
			throw err;
		}
	}

	/**
	 * launch or attach to the debuggee
	 */
	async launchOrAttach(config: IConfig): Promise<void> {
		if (!this.raw) {
			throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'launch or attach'));
		}
		if (this.parentSession && this.parentSession.state === State.Inactive) {
			throw canceled();
		}

		// __sessionID only used for EH debugging (but we add it always for now...)
		config.__sessionId = this.getId();
		try {
			await this.raw.launchOrAttach(config);
		} catch (err) {
			this.shutdown();
			throw err;
		}
	}

	/**
	 * Terminate any linked test run.
	 */
	cancelCorrelatedTestRun() {
		if (this.correlatedTestRun && !this.correlatedTestRun.completedAt) {
			this.didTerminateTestRun = true;
			this.testService.cancelTestRun(this.correlatedTestRun.id);
		}
	}

	/**
	 * terminate the current debug adapter session
	 */
	async terminate(restart = false): Promise<void> {
		if (!this.raw) {
			// Adapter went down but it did not send a 'terminated' event, simulate like the event has been sent
			this.onDidExitAdapter();
		}

		this.cancelAllRequests();
		if (this._options.lifecycleManagedByParent && this.parentSession) {
			await this.parentSession.terminate(restart);
		} else if (this.correlatedTestRun && !this.correlatedTestRun.completedAt && !this.didTerminateTestRun) {
			this.cancelCorrelatedTestRun();
		} else if (this.raw) {
			if (this.raw.capabilities.supportsTerminateRequest && this._configuration.resolved.request === 'launch') {
				await this.raw.terminate(restart);
			} else {
				await this.raw.disconnect({ restart, terminateDebuggee: true });
			}
		}

		if (!restart) {
			this._options.compoundRoot?.sessionStopped();
		}
	}

	/**
	 * end the current debug adapter session
	 */
	async disconnect(restart = false, suspend = false): Promise<void> {
		if (!this.raw) {
			// Adapter went down but it did not send a 'terminated' event, simulate like the event has been sent
			this.onDidExitAdapter();
		}

		this.cancelAllRequests();
		if (this._options.lifecycleManagedByParent && this.parentSession) {
			await this.parentSession.disconnect(restart, suspend);
		} else if (this.raw) {
			// TODO terminateDebuggee should be undefined by default?
			await this.raw.disconnect({ restart, terminateDebuggee: false, suspendDebuggee: suspend });
		}

		if (!restart) {
			this._options.compoundRoot?.sessionStopped();
		}
	}

	/**
	 * restart debug adapter session
	 */
	async restart(): Promise<void> {
		if (!this.raw) {
			throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'restart'));
		}

		this.cancelAllRequests();
		if (this._options.lifecycleManagedByParent && this.parentSession) {
			await this.parentSession.restart();
		} else {
			await this.raw.restart({ arguments: this.configuration });
		}
	}

	async sendBreakpoints(modelUri: URI, breakpointsToSend: IBreakpoint[], sourceModified: boolean): Promise<void> {
		if (!this.raw) {
			throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'breakpoints'));
		}

		if (!this.raw.readyForBreakpoints) {
			return Promise.resolve(undefined);
		}

		const rawSource = this.getRawSource(modelUri);
		if (breakpointsToSend.length && !rawSource.adapterData) {
			rawSource.adapterData = breakpointsToSend[0].adapterData;
		}
		// Normalize all drive letters going out from vscode to debug adapters so we are consistent with our resolving #43959
		if (rawSource.path) {
			rawSource.path = normalizeDriveLetter(rawSource.path);
		}

		const response = await this.raw.setBreakpoints({
			source: rawSource,
			lines: breakpointsToSend.map(bp => bp.sessionAgnosticData.lineNumber),
			breakpoints: breakpointsToSend.map(bp => bp.toDAP()),
			sourceModified
		});
		if (response?.body) {
			const data = new Map<string, DebugProtocol.Breakpoint>();
			for (let i = 0; i < breakpointsToSend.length; i++) {
				data.set(breakpointsToSend[i].getId(), response.body.breakpoints[i]);
			}

			this.model.setBreakpointSessionData(this.getId(), this.capabilities, data);
		}
	}

	async sendFunctionBreakpoints(fbpts: IFunctionBreakpoint[]): Promise<void> {
		if (!this.raw) {
			throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'function breakpoints'));
		}

		if (this.raw.readyForBreakpoints) {
			const response = await this.raw.setFunctionBreakpoints({ breakpoints: fbpts.map(bp => bp.toDAP()) });
			if (response?.body) {
				const data = new Map<string, DebugProtocol.Breakpoint>();
				for (let i = 0; i < fbpts.length; i++) {
					data.set(fbpts[i].getId(), response.body.breakpoints[i]);
				}
				this.model.setBreakpointSessionData(this.getId(), this.capabilities, data);
			}
		}
	}

	async sendExceptionBreakpoints(exbpts: IExceptionBreakpoint[]): Promise<void> {
		if (!this.raw) {
			throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'exception breakpoints'));
		}

		if (this.raw.readyForBreakpoints) {
			const args: DebugProtocol.SetExceptionBreakpointsArguments = this.capabilities.supportsExceptionFilterOptions ? {
				filters: [],
				filterOptions: exbpts.map(exb => {
					if (exb.condition) {
						return { filterId: exb.filter, condition: exb.condition };
					}

					return { filterId: exb.filter };
				})
			} : { filters: exbpts.map(exb => exb.filter) };

			const response = await this.raw.setExceptionBreakpoints(args);
			if (response?.body && response.body.breakpoints) {
				const data = new Map<string, DebugProtocol.Breakpoint>();
				for (let i = 0; i < exbpts.length; i++) {
					data.set(exbpts[i].getId(), response.body.breakpoints[i]);
				}

				this.model.setBreakpointSessionData(this.getId(), this.capabilities, data);
			}
		}
	}

	dataBytesBreakpointInfo(address: string, bytes: number): Promise<IDataBreakpointInfoResponse | undefined> {
		if (this.raw?.capabilities.supportsDataBreakpointBytes === false) {
			throw new Error(localize('sessionDoesNotSupporBytesBreakpoints', "Session does not support breakpoints with bytes"));
		}

		return this._dataBreakpointInfo({ name: address, bytes, asAddress: true });
	}

	dataBreakpointInfo(name: string, variablesReference?: number): Promise<{ dataId: string | null; description: string; canPersist?: boolean } | undefined> {
		return this._dataBreakpointInfo({ name, variablesReference });
	}

	private async _dataBreakpointInfo(args: DebugProtocol.DataBreakpointInfoArguments): Promise<{ dataId: string | null; description: string; canPersist?: boolean } | undefined> {
		if (!this.raw) {
			throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'data breakpoints info'));
		}
		if (!this.raw.readyForBreakpoints) {
			throw new Error(localize('sessionNotReadyForBreakpoints', "Session is not ready for breakpoints"));
		}

		const response = await this.raw.dataBreakpointInfo(args);
		return response?.body;
	}

	async sendDataBreakpoints(dataBreakpoints: IDataBreakpoint[]): Promise<void> {
		if (!this.raw) {
			throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'data breakpoints'));
		}

		if (this.raw.readyForBreakpoints) {
			const converted = await Promise.all(dataBreakpoints.map(async bp => {
				try {
					const dap = await bp.toDAP(this);
					return { dap, bp };
				} catch (e) {
					return { bp, message: e.message };
				}
			}));
			const response = await this.raw.setDataBreakpoints({ breakpoints: converted.map(d => d.dap).filter(isDefined) });
			if (response?.body) {
				const data = new Map<string, DebugProtocol.Breakpoint>();
				let i = 0;
				for (const dap of converted) {
					if (!dap.dap) {
						data.set(dap.bp.getId(), dap.message);
					} else if (i < response.body.breakpoints.length) {
						data.set(dap.bp.getId(), response.body.breakpoints[i++]);
					}
				}
				this.model.setBreakpointSessionData(this.getId(), this.capabilities, data);
			}
		}
	}

	async sendInstructionBreakpoints(instructionBreakpoints: IInstructionBreakpoint[]): Promise<void> {
		if (!this.raw) {
			throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'instruction breakpoints'));
		}

		if (this.raw.readyForBreakpoints) {
			const response = await this.raw.setInstructionBreakpoints({ breakpoints: instructionBreakpoints.map(ib => ib.toDAP()) });
			if (response?.body) {
				const data = new Map<string, DebugProtocol.Breakpoint>();
				for (let i = 0; i < instructionBreakpoints.length; i++) {
					data.set(instructionBreakpoints[i].getId(), response.body.breakpoints[i]);
				}
				this.model.setBreakpointSessionData(this.getId(), this.capabilities, data);
			}
		}
	}

	async breakpointsLocations(uri: URI, lineNumber: number): Promise<IPosition[]> {
		if (!this.raw) {
			throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'breakpoints locations'));
		}

		const source = this.getRawSource(uri);
		const response = await this.raw.breakpointLocations({ source, line: lineNumber });
		if (!response || !response.body || !response.body.breakpoints) {
			return [];
		}

		const positions = response.body.breakpoints.map(bp => ({ lineNumber: bp.line, column: bp.column || 1 }));

		return distinct(positions, p => `${p.lineNumber}:${p.column}`);
	}

	getDebugProtocolBreakpoint(breakpointId: string): DebugProtocol.Breakpoint | undefined {
		return this.model.getDebugProtocolBreakpoint(breakpointId, this.getId());
	}

	customRequest(request: string, args: any): Promise<DebugProtocol.Response | undefined> {
		if (!this.raw) {
			throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", request));
		}

		return this.raw.custom(request, args);
	}

	stackTrace(threadId: number, startFrame: number, levels: number, token: CancellationToken): Promise<DebugProtocol.StackTraceResponse | undefined> {
		if (!this.raw) {
			throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'stackTrace'));
		}

		const sessionToken = this.getNewCancellationToken(threadId, token);
		return this.raw.stackTrace({ threadId, startFrame, levels }, sessionToken);
	}

	async exceptionInfo(threadId: number): Promise<IExceptionInfo | undefined> {
		if (!this.raw) {
			throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'exceptionInfo'));
		}

		const response = await this.raw.exceptionInfo({ threadId });
		if (response) {
			return {
				id: response.body.exceptionId,
				description: response.body.description,
				breakMode: response.body.breakMode,
				details: response.body.details
			};
		}

		return undefined;
	}

	scopes(frameId: number, threadId: number): Promise<DebugProtocol.ScopesResponse | undefined> {
		if (!this.raw) {
			throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'scopes'));
		}

		const token = this.getNewCancellationToken(threadId);
		return this.raw.scopes({ frameId }, token);
	}

	variables(variablesReference: number, threadId: number | undefined, filter: 'indexed' | 'named' | undefined, start: number | undefined, count: number | undefined): Promise<DebugProtocol.VariablesResponse | undefined> {
		if (!this.raw) {
			throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'variables'));
		}

		const token = threadId ? this.getNewCancellationToken(threadId) : undefined;
		return this.raw.variables({ variablesReference, filter, start, count }, token);
	}

	evaluate(expression: string, frameId: number, context?: string, location?: { line: number; column: number; source: DebugProtocol.Source }): Promise<DebugProtocol.EvaluateResponse | undefined> {
		if (!this.raw) {
			throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'evaluate'));
		}

		return this.raw.evaluate({ expression, frameId, context, line: location?.line, column: location?.column, source: location?.source });
	}

	async restartFrame(frameId: number, threadId: number): Promise<void> {
		await this.waitForTriggeredBreakpoints();
		if (!this.raw) {
			throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'restartFrame'));
		}

		await this.raw.restartFrame({ frameId }, threadId);
	}

	private setLastSteppingGranularity(threadId: number, granularity?: DebugProtocol.SteppingGranularity) {
		const thread = this.getThread(threadId);
		if (thread) {
			thread.lastSteppingGranularity = granularity;
		}
	}

	async next(threadId: number, granularity?: DebugProtocol.SteppingGranularity): Promise<void> {
		await this.waitForTriggeredBreakpoints();
		if (!this.raw) {
			throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'next'));
		}

		this.setLastSteppingGranularity(threadId, granularity);
		await this.raw.next({ threadId, granularity });
	}

	async stepIn(threadId: number, targetId?: number, granularity?: DebugProtocol.SteppingGranularity): Promise<void> {
		await this.waitForTriggeredBreakpoints();
		if (!this.raw) {
			throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'stepIn'));
		}

		this.setLastSteppingGranularity(threadId, granularity);
		await this.raw.stepIn({ threadId, targetId, granularity });
	}

	async stepOut(threadId: number, granularity?: DebugProtocol.SteppingGranularity): Promise<void> {
		await this.waitForTriggeredBreakpoints();
		if (!this.raw) {
			throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'stepOut'));
		}

		this.setLastSteppingGranularity(threadId, granularity);
		await this.raw.stepOut({ threadId, granularity });
	}

	async stepBack(threadId: number, granularity?: DebugProtocol.SteppingGranularity): Promise<void> {
		await this.waitForTriggeredBreakpoints();
		if (!this.raw) {
			throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'stepBack'));
		}

		this.setLastSteppingGranularity(threadId, granularity);
		await this.raw.stepBack({ threadId, granularity });
	}

	async continue(threadId: number): Promise<void> {
		await this.waitForTriggeredBreakpoints();
		if (!this.raw) {
			throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'continue'));
		}

		await this.raw.continue({ threadId });
	}

	async reverseContinue(threadId: number): Promise<void> {
		await this.waitForTriggeredBreakpoints();
		if (!this.raw) {
			throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'reverse continue'));
		}

		await this.raw.reverseContinue({ threadId });
	}

	async pause(threadId: number): Promise<void> {
		if (!this.raw) {
			throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'pause'));
		}

		await this.raw.pause({ threadId });
	}

	async terminateThreads(threadIds?: number[]): Promise<void> {
		if (!this.raw) {
			throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'terminateThreads'));
		}

		await this.raw.terminateThreads({ threadIds });
	}

	setVariable(variablesReference: number, name: string, value: string): Promise<DebugProtocol.SetVariableResponse | undefined> {
		if (!this.raw) {
			throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'setVariable'));
		}

		return this.raw.setVariable({ variablesReference, name, value });
	}

	setExpression(frameId: number, expression: string, value: string): Promise<DebugProtocol.SetExpressionResponse | undefined> {
		if (!this.raw) {
			throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'setExpression'));
		}

		return this.raw.setExpression({ expression, value, frameId });
	}

	gotoTargets(source: DebugProtocol.Source, line: number, column?: number): Promise<DebugProtocol.GotoTargetsResponse | undefined> {
		if (!this.raw) {
			throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'gotoTargets'));
		}

		return this.raw.gotoTargets({ source, line, column });
	}

	goto(threadId: number, targetId: number): Promise<DebugProtocol.GotoResponse | undefined> {
		if (!this.raw) {
			throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'goto'));
		}

		return this.raw.goto({ threadId, targetId });
	}

	loadSource(resource: URI): Promise<DebugProtocol.SourceResponse | undefined> {
		if (!this.raw) {
			return Promise.reject(new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'loadSource')));
		}

		const source = this.getSourceForUri(resource);
		let rawSource: DebugProtocol.Source;
		if (source) {
			rawSource = source.raw;
		} else {
			// create a Source
			const data = Source.getEncodedDebugData(resource);
			rawSource = { path: data.path, sourceReference: data.sourceReference };
		}

		return this.raw.source({ sourceReference: rawSource.sourceReference || 0, source: rawSource });
	}

	async getLoadedSources(): Promise<Source[]> {
		if (!this.raw) {
			return Promise.reject(new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'getLoadedSources')));
		}

		const response = await this.raw.loadedSources({});
		if (response?.body && response.body.sources) {
			return response.body.sources.map(src => this.getSource(src));
		} else {
			return [];
		}
	}

	async completions(frameId: number | undefined, threadId: number, text: string, position: Position, token: CancellationToken): Promise<DebugProtocol.CompletionsResponse | undefined> {
		if (!this.raw) {
			return Promise.reject(new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'completions')));
		}
		const sessionCancelationToken = this.getNewCancellationToken(threadId, token);

		return this.raw.completions({
			frameId,
			text,
			column: position.column,
			line: position.lineNumber,
		}, sessionCancelationToken);
	}

	async stepInTargets(frameId: number): Promise<{ id: number; label: string }[] | undefined> {
		if (!this.raw) {
			return Promise.reject(new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'stepInTargets')));
		}

		const response = await this.raw.stepInTargets({ frameId });
		return response?.body.targets;
	}

	async cancel(progressId: string): Promise<DebugProtocol.CancelResponse | undefined> {
		if (!this.raw) {
			return Promise.reject(new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'cancel')));
		}

		return this.raw.cancel({ progressId });
	}

	async disassemble(memoryReference: string, offset: number, instructionOffset: number, instructionCount: number): Promise<DebugProtocol.DisassembledInstruction[] | undefined> {
		if (!this.raw) {
			return Promise.reject(new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'disassemble')));
		}

		const response = await this.raw.disassemble({ memoryReference, offset, instructionOffset, instructionCount, resolveSymbols: true });
		return response?.body?.instructions;
	}

	readMemory(memoryReference: string, offset: number, count: number): Promise<DebugProtocol.ReadMemoryResponse | undefined> {
		if (!this.raw) {
			return Promise.reject(new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'readMemory')));
		}

		return this.raw.readMemory({ count, memoryReference, offset });
	}

	writeMemory(memoryReference: string, offset: number, data: string, allowPartial?: boolean): Promise<DebugProtocol.WriteMemoryResponse | undefined> {
		if (!this.raw) {
			return Promise.reject(new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'disassemble')));
		}

		return this.raw.writeMemory({ memoryReference, offset, allowPartial, data });
	}

	async resolveLocationReference(locationReference: number): Promise<IDebugLocationReferenced> {
		if (!this.raw) {
			throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'locations'));
		}

		const location = await this.raw.locations({ locationReference });
		if (!location?.body) {
			throw new Error(localize('noDebugAdapter', "No debugger available, can not send '{0}'", 'locations'));
		}

		const source = this.getSource(location.body.source);
		return { column: 1, ...location.body, source };
	}

	//---- threads

	getThread(threadId: number): Thread | undefined {
		return this.threads.get(threadId);
	}

	getAllThreads(): IThread[] {
		const result: IThread[] = [];
		this.threadIds.forEach((threadId) => {
			const thread = this.threads.get(threadId);
			if (thread) {
				result.push(thread);
			}
		});
		return result;
	}

	clearThreads(removeThreads: boolean, reference: number | undefined = undefined): void {
		if (reference !== undefined && reference !== null) {
			const thread = this.threads.get(reference);
			if (thread) {
				thread.clearCallStack();
				thread.stoppedDetails = undefined;
				thread.stopped = false;

				if (removeThreads) {
					this.threads.delete(reference);
				}
			}
		} else {
			this.threads.forEach(thread => {
				thread.clearCallStack();
				thread.stoppedDetails = undefined;
				thread.stopped = false;
			});

			if (removeThreads) {
				this.threads.clear();
				this.threadIds = [];
				ExpressionContainer.allValues.clear();
			}
		}
	}

	getStoppedDetails(): IRawStoppedDetails | undefined {
		return this.stoppedDetails.length >= 1 ? this.stoppedDetails[0] : undefined;
	}

	rawUpdate(data: IRawModelUpdate): void {
		this.threadIds = [];
		data.threads.forEach(thread => {
			this.threadIds.push(thread.id);
			if (!this.threads.has(thread.id)) {
				// A new thread came in, initialize it.
				this.threads.set(thread.id, new Thread(this, thread.name, thread.id));
			} else if (thread.name) {
				// Just the thread name got updated #18244
				const oldThread = this.threads.get(thread.id);
				if (oldThread) {
					oldThread.name = thread.name;
				}
			}
		});
		this.threads.forEach(t => {
			// Remove all old threads which are no longer part of the update #75980
			if (this.threadIds.indexOf(t.threadId) === -1) {
				this.threads.delete(t.threadId);
			}
		});

		const stoppedDetails = data.stoppedDetails;
		if (stoppedDetails) {
			// Set the availability of the threads' callstacks depending on
			// whether the thread is stopped or not
			if (stoppedDetails.allThreadsStopped) {
				this.threads.forEach(thread => {
					thread.stoppedDetails = thread.threadId === stoppedDetails.threadId ? stoppedDetails : { reason: thread.stoppedDetails?.reason };
					thread.stopped = true;
					thread.clearCallStack();
				});
			} else {
				const thread = typeof stoppedDetails.threadId === 'number' ? this.threads.get(stoppedDetails.threadId) : undefined;
				if (thread) {
					// One thread is stopped, only update that thread.
					thread.stoppedDetails = stoppedDetails;
					thread.clearCallStack();
					thread.stopped = true;
				}
			}
		}
	}

	private waitForTriggeredBreakpoints() {
		if (!this._waitToResume) {
			return;
		}

		return raceTimeout(
			this._waitToResume,
			TRIGGERED_BREAKPOINT_MAX_DELAY
		);
	}

	private async fetchThreads(stoppedDetails?: IRawStoppedDetails): Promise<void> {
		if (this.raw) {
			const response = await this.raw.threads();
			if (response?.body && response.body.threads) {
				this.model.rawUpdate({
					sessionId: this.getId(),
					threads: response.body.threads,
					stoppedDetails
				});
			}
		}
	}

	initializeForTest(raw: RawDebugSession): void {
		this.raw = raw;
		this.registerListeners();
	}

	//---- private

	private registerListeners(): void {
		if (!this.raw) {
			return;
		}

		this.rawListeners.add(this.raw.onDidInitialize(async () => {
			aria.status(
				this.configuration.noDebug
					? localize('debuggingStartedNoDebug', "Started running without debugging.")
					: localize('debuggingStarted', "Debugging started.")
			);

			const sendConfigurationDone = async () => {
				if (this.raw && this.raw.capabilities.supportsConfigurationDoneRequest) {
					try {
						await this.raw.configurationDone();
					} catch (e) {
						// Disconnect the debug session on configuration done error #10596
						this.notificationService.error(e);
						this.raw?.disconnect({});
					}
				}

				return undefined;
			};

			// Send all breakpoints
			try {
				await this.debugService.sendAllBreakpoints(this);
			} finally {
				await sendConfigurationDone();
				await this.fetchThreads();
			}
		}));


		const statusQueue = this.statusQueue;
		this.rawListeners.add(this.raw.onDidStop(event => this.handleStop(event.body)));

		this.rawListeners.add(this.raw.onDidThread(event => {
			statusQueue.cancel([event.body.threadId]);
			if (event.body.reason === 'started') {
				// debounce to reduce threadsRequest frequency and improve performance
				if (!this.fetchThreadsScheduler) {
					this.fetchThreadsScheduler = new RunOnceScheduler(() => {
						this.fetchThreads();
					}, 100);
					this.rawListeners.add(this.fetchThreadsScheduler);
				}
				if (!this.fetchThreadsScheduler.isScheduled()) {
					this.fetchThreadsScheduler.schedule();
				}
			} else if (event.body.reason === 'exited') {
				this.model.clearThreads(this.getId(), true, event.body.threadId);
				const viewModel = this.debugService.getViewModel();
				const focusedThread = viewModel.focusedThread;
				this.passFocusScheduler.cancel();
				if (focusedThread && event.body.threadId === focusedThread.threadId) {
					// De-focus the thread in case it was focused
					this.debugService.focusStackFrame(undefined, undefined, viewModel.focusedSession, { explicit: false });
				}
			}
		}));

		this.rawListeners.add(this.raw.onDidTerminateDebugee(async event => {
			aria.status(localize('debuggingStopped', "Debugging stopped."));
			if (event.body && event.body.restart) {
				await this.debugService.restartSession(this, event.body.restart);
			} else if (this.raw) {
				await this.raw.disconnect({ terminateDebuggee: false });
			}
		}));

		this.rawListeners.add(this.raw.onDidContinued(event => {
			const allThreads = event.body.allThreadsContinued !== false;

			statusQueue.cancel(allThreads ? undefined : [event.body.threadId]);

			const threadId = allThreads ? undefined : event.body.threadId;
			if (typeof threadId === 'number') {
				this.stoppedDetails = this.stoppedDetails.filter(sd => sd.threadId !== threadId);
				const tokens = this.cancellationMap.get(threadId);
				this.cancellationMap.delete(threadId);
				tokens?.forEach(t => t.dispose(true));
			} else {
				this.stoppedDetails = [];
				this.cancelAllRequests();
			}
			this.lastContinuedThreadId = threadId;
			// We need to pass focus to other sessions / threads with a timeout in case a quick stop event occurs #130321
			this.passFocusScheduler.schedule();
			this.model.clearThreads(this.getId(), false, threadId);
			this._onDidChangeState.fire();
		}));

		const outputQueue = new Queue<void>();
		this.rawListeners.add(this.raw.onDidOutput(async event => {
			const outputSeverity = event.body.category === 'stderr' ? Severity.Error : event.body.category === 'console' ? Severity.Warning : Severity.Info;

			// When a variables event is received, execute immediately to obtain the variables value #126967
			if (event.body.variablesReference) {
				const source = event.body.source && event.body.line ? {
					lineNumber: event.body.line,
					column: event.body.column ? event.body.column : 1,
					source: this.getSource(event.body.source)
				} : undefined;
				const container = new ExpressionContainer(this, undefined, event.body.variablesReference, generateUuid());
				const children = container.getChildren();
				// we should put appendToRepl into queue to make sure the logs to be displayed in correct order
				// see https://github.com/microsoft/vscode/issues/126967#issuecomment-874954269
				outputQueue.queue(async () => {
					const resolved = await children;
					// For single logged variables, try to use the output if we can so
					// present a better (i.e. ANSI-aware) representation of the output
					if (resolved.length === 1) {
						this.appendToRepl({ output: event.body.output, expression: resolved[0], sev: outputSeverity, source }, event.body.category === 'important');
						return;
					}

					resolved.forEach((child) => {
						// Since we can not display multiple trees in a row, we are displaying these variables one after the other (ignoring their names)
						(<any>child).name = null;
						this.appendToRepl({ output: '', expression: child, sev: outputSeverity, source }, event.body.category === 'important');
					});
				});
				return;
			}
			outputQueue.queue(async () => {
				if (!event.body || !this.raw) {
					return;
				}

				if (event.body.category === 'telemetry') {
					// only log telemetry events from debug adapter if the debug extension provided the telemetry key
					// and the user opted in telemetry
					const telemetryEndpoint = this.raw.dbgr.getCustomTelemetryEndpoint();
					if (telemetryEndpoint && this.telemetryService.telemetryLevel !== TelemetryLevel.NONE) {
						// __GDPR__TODO__ We're sending events in the name of the debug extension and we can not ensure that those are declared correctly.
						let data = event.body.data;
						if (!telemetryEndpoint.sendErrorTelemetry && event.body.data) {
							data = filterExceptionsFromTelemetry(event.body.data);
						}

						this.customEndpointTelemetryService.publicLog(telemetryEndpoint, event.body.output, data);
					}

					return;
				}

				// Make sure to append output in the correct order by properly waiting on preivous promises #33822
				const source = event.body.source && event.body.line ? {
					lineNumber: event.body.line,
					column: event.body.column ? event.body.column : 1,
					source: this.getSource(event.body.source)
				} : undefined;

				if (event.body.group === 'start' || event.body.group === 'startCollapsed') {
					const expanded = event.body.group === 'start';
					this.repl.startGroup(this, event.body.output || '', expanded, source);
					return;
				}
				if (event.body.group === 'end') {
					this.repl.endGroup();
					if (!event.body.output) {
						// Only return if the end event does not have additional output in it
						return;
					}
				}

				if (typeof event.body.output === 'string') {
					this.appendToRepl({ output: event.body.output, sev: outputSeverity, source }, event.body.category === 'important');
				}
			});
		}));

		this.rawListeners.add(this.raw.onDidBreakpoint(event => {
			const id = event.body && event.body.breakpoint ? event.body.breakpoint.id : undefined;
			const breakpoint = this.model.getBreakpoints().find(bp => bp.getIdFromAdapter(this.getId()) === id);
			const functionBreakpoint = this.model.getFunctionBreakpoints().find(bp => bp.getIdFromAdapter(this.getId()) === id);
			const dataBreakpoint = this.model.getDataBreakpoints().find(dbp => dbp.getIdFromAdapter(this.getId()) === id);
			const exceptionBreakpoint = this.model.getExceptionBreakpoints().find(excbp => excbp.getIdFromAdapter(this.getId()) === id);

			if (event.body.reason === 'new' && event.body.breakpoint.source && event.body.breakpoint.line) {
				const source = this.getSource(event.body.breakpoint.source);
				const bps = this.model.addBreakpoints(source.uri, [{
					column: event.body.breakpoint.column,
					enabled: true,
					lineNumber: event.body.breakpoint.line,
				}], false);
				if (bps.length === 1) {
					const data = new Map<string, DebugProtocol.Breakpoint>([[bps[0].getId(), event.body.breakpoint]]);
					this.model.setBreakpointSessionData(this.getId(), this.capabilities, data);
				}
			}

			if (event.body.reason === 'removed') {
				if (breakpoint) {
					this.model.removeBreakpoints([breakpoint]);
				}
				if (functionBreakpoint) {
					this.model.removeFunctionBreakpoints(functionBreakpoint.getId());
				}
				if (dataBreakpoint) {
					this.model.removeDataBreakpoints(dataBreakpoint.getId());
				}
			}

			if (event.body.reason === 'changed') {
				if (breakpoint) {
					if (!breakpoint.column) {
						event.body.breakpoint.column = undefined;
					}
					const data = new Map<string, DebugProtocol.Breakpoint>([[breakpoint.getId(), event.body.breakpoint]]);
					this.model.setBreakpointSessionData(this.getId(), this.capabilities, data);
				}
				if (functionBreakpoint) {
					const data = new Map<string, DebugProtocol.Breakpoint>([[functionBreakpoint.getId(), event.body.breakpoint]]);
					this.model.setBreakpointSessionData(this.getId(), this.capabilities, data);
				}
				if (dataBreakpoint) {
					const data = new Map<string, DebugProtocol.Breakpoint>([[dataBreakpoint.getId(), event.body.breakpoint]]);
					this.model.setBreakpointSessionData(this.getId(), this.capabilities, data);
				}
				if (exceptionBreakpoint) {
					const data = new Map<string, DebugProtocol.Breakpoint>([[exceptionBreakpoint.getId(), event.body.breakpoint]]);
					this.model.setBreakpointSessionData(this.getId(), this.capabilities, data);
				}
			}
		}));

		this.rawListeners.add(this.raw.onDidLoadedSource(event => {
			this._onDidLoadedSource.fire({
				reason: event.body.reason,
				source: this.getSource(event.body.source)
			});
		}));

		this.rawListeners.add(this.raw.onDidCustomEvent(event => {
			this._onDidCustomEvent.fire(event);
		}));

		this.rawListeners.add(this.raw.onDidProgressStart(event => {
			this._onDidProgressStart.fire(event);
		}));
		this.rawListeners.add(this.raw.onDidProgressUpdate(event => {
			this._onDidProgressUpdate.fire(event);
		}));
		this.rawListeners.add(this.raw.onDidProgressEnd(event => {
			this._onDidProgressEnd.fire(event);
		}));
		this.rawListeners.add(this.raw.onDidInvalidateMemory(event => {
			this._onDidInvalidMemory.fire(event);
		}));
		this.rawListeners.add(this.raw.onDidInvalidated(async event => {
			const areas = event.body.areas || ['all'];
			// If invalidated event only requires to update variables or watch, do that, otherwise refetch threads https://github.com/microsoft/vscode/issues/106745
			if (areas.includes('threads') || areas.includes('stacks') || areas.includes('all')) {
				this.cancelAllRequests();
				this.model.clearThreads(this.getId(), true);

				const details = this.stoppedDetails;
				this.stoppedDetails.length = 1;
				await Promise.all(details.map(d => this.handleStop(d)));
			}

			const viewModel = this.debugService.getViewModel();
			if (viewModel.focusedSession === this) {
				viewModel.updateViews();
			}
		}));

		this.rawListeners.add(this.raw.onDidExitAdapter(event => this.onDidExitAdapter(event)));
	}

	private async handleStop(event: IRawStoppedDetails) {
		this.passFocusScheduler.cancel();
		this.stoppedDetails.push(event);

		// do this very eagerly if we have hitBreakpointIds, since it may take a
		// moment for breakpoints to set and we want to do our best to not miss
		// anything
		if (event.hitBreakpointIds) {
			this._waitToResume = this.enableDependentBreakpoints(event.hitBreakpointIds);
		}

		this.statusQueue.run(
			this.fetchThreads(event).then(() => event.threadId === undefined ? this.threadIds : [event.threadId]),
			async (threadId, token) => {
				const hasLotsOfThreads = event.threadId === undefined && this.threadIds.length > 10;

				// If the focus for the current session is on a non-existent thread, clear the focus.
				const focusedThread = this.debugService.getViewModel().focusedThread;
				const focusedThreadDoesNotExist = focusedThread !== undefined && focusedThread.session === this && !this.threads.has(focusedThread.threadId);
				if (focusedThreadDoesNotExist) {
					this.debugService.focusStackFrame(undefined, undefined);
				}

				const thread = typeof threadId === 'number' ? this.getThread(threadId) : undefined;
				if (thread) {
					// Call fetch call stack twice, the first only return the top stack frame.
					// Second retrieves the rest of the call stack. For performance reasons #25605
					// Second call is only done if there's few threads that stopped in this event.
					const promises = this.model.refreshTopOfCallstack(<Thread>thread, /* fetchFullStack= */!hasLotsOfThreads);
					const focus = async () => {
						if (focusedThreadDoesNotExist || (!event.preserveFocusHint && thread.getCallStack().length)) {
							const focusedStackFrame = this.debugService.getViewModel().focusedStackFrame;
							if (!focusedStackFrame || focusedStackFrame.thread.session === this) {
								// Only take focus if nothing is focused, or if the focus is already on the current session
								const preserveFocus = !this.configurationService.getValue<IDebugConfiguration>('debug').focusEditorOnBreak;
								await this.debugService.focusStackFrame(undefined, thread, undefined, { preserveFocus });
							}

							if (thread.stoppedDetails && !token.isCancellationRequested) {
								if (thread.stoppedDetails.reason === 'breakpoint' && this.configurationService.getValue<IDebugConfiguration>('debug').openDebug === 'openOnDebugBreak' && !this.suppressDebugView) {
									await this.paneCompositeService.openPaneComposite(VIEWLET_ID, ViewContainerLocation.Sidebar);
								}

								if (this.configurationService.getValue<IDebugConfiguration>('debug').focusWindowOnBreak && !this.workbenchEnvironmentService.extensionTestsLocationURI) {
									const activeWindow = getActiveWindow();
									if (!activeWindow.document.hasFocus()) {
										await this.hostService.focus(mainWindow, { force: true /* Application may not be active */ });
									}
								}
							}
						}
					};

					await promises.topCallStack;

					if (!event.hitBreakpointIds) { // if hitBreakpointIds are present, this is handled earlier on
						this._waitToResume = this.enableDependentBreakpoints(thread);
					}

					if (token.isCancellationRequested) {
						return;
					}

					focus();

					await promises.wholeCallStack;
					if (token.isCancellationRequested) {
						return;
					}

					const focusedStackFrame = this.debugService.getViewModel().focusedStackFrame;
					if (!focusedStackFrame || isFrameDeemphasized(focusedStackFrame)) {
						// The top stack frame can be deemphesized so try to focus again #68616
						focus();
					}
				}
				this._onDidChangeState.fire();
			},
		);
	}

	private async enableDependentBreakpoints(hitBreakpointIdsOrThread: Thread | number[]) {
		let breakpoints: IBreakpoint[];
		if (Array.isArray(hitBreakpointIdsOrThread)) {
			breakpoints = this.model.getBreakpoints().filter(bp => hitBreakpointIdsOrThread.includes(bp.getIdFromAdapter(this.id)!));
		} else {
			const frame = hitBreakpointIdsOrThread.getTopStackFrame();
			if (frame === undefined) {
				return;
			}

			if (hitBreakpointIdsOrThread.stoppedDetails && hitBreakpointIdsOrThread.stoppedDetails.reason !== 'breakpoint') {
				return;
			}

			breakpoints = this.getBreakpointsAtPosition(frame.source.uri, frame.range.startLineNumber, frame.range.endLineNumber, frame.range.startColumn, frame.range.endColumn);
		}

		// find the current breakpoints

		// check if the current breakpoints are dependencies, and if so collect and send the dependents to DA
		const urisToResend = new Set<string>();
		this.model.getBreakpoints({ triggeredOnly: true, enabledOnly: true }).forEach(bp => {
			breakpoints.forEach(cbp => {
				if (bp.enabled && bp.triggeredBy === cbp.getId()) {
					bp.setSessionDidTrigger(this.getId());
					urisToResend.add(bp.uri.toString());
				}
			});
		});

		const results: Promise<any>[] = [];
		urisToResend.forEach((uri) => results.push(this.debugService.sendBreakpoints(URI.parse(uri), undefined, this)));
		return Promise.all(results);
	}

	private getBreakpointsAtPosition(uri: URI, startLineNumber: number, endLineNumber: number, startColumn: number, endColumn: number): IBreakpoint[] {
		return this.model.getBreakpoints({ uri: uri }).filter(bp => {
			if (bp.lineNumber < startLineNumber || bp.lineNumber > endLineNumber) {
				return false;
			}

			if (bp.column && (bp.column < startColumn || bp.column > endColumn)) {
				return false;
			}
			return true;
		});
	}

	private onDidExitAdapter(event?: AdapterEndEvent): void {
		this.initialized = true;
		this.model.setBreakpointSessionData(this.getId(), this.capabilities, undefined);
		this.shutdown();
		this._onDidEndAdapter.fire(event);
	}

	// Disconnects and clears state. Session can be initialized again for a new connection.
	private shutdown(): void {
		this.rawListeners.clear();
		if (this.raw) {
			// Send out disconnect and immediatly dispose (do not wait for response) #127418
			this.raw.disconnect({});
			this.raw.dispose();
			this.raw = undefined;
		}
		this.fetchThreadsScheduler?.dispose();
		this.fetchThreadsScheduler = undefined;
		this.passFocusScheduler.cancel();
		this.passFocusScheduler.dispose();
		this.model.clearThreads(this.getId(), true);
		this._onDidChangeState.fire();
	}

	public dispose() {
		this.cancelAllRequests();
		this.rawListeners.dispose();
		this.globalDisposables.dispose();
	}

	//---- sources

	getSourceForUri(uri: URI): Source | undefined {
		return this.sources.get(this.uriIdentityService.asCanonicalUri(uri).toString());
	}

	getSource(raw?: DebugProtocol.Source): Source {
		let source = new Source(raw, this.getId(), this.uriIdentityService, this.logService);
		const uriKey = source.uri.toString();
		const found = this.sources.get(uriKey);
		if (found) {
			source = found;
			// merge attributes of new into existing
			source.raw = mixin(source.raw, raw);
			if (source.raw && raw) {
				// Always take the latest presentation hint from adapter #42139
				source.raw.presentationHint = raw.presentationHint;
			}
		} else {
			this.sources.set(uriKey, source);
		}

		return source;
	}

	private getRawSource(uri: URI): DebugProtocol.Source {
		const source = this.getSourceForUri(uri);
		if (source) {
			return source.raw;
		} else {
			const data = Source.getEncodedDebugData(uri);
			return { name: data.name, path: data.path, sourceReference: data.sourceReference };
		}
	}

	private getNewCancellationToken(threadId: number, token?: CancellationToken): CancellationToken {
		const tokenSource = new CancellationTokenSource(token);
		const tokens = this.cancellationMap.get(threadId) || [];
		tokens.push(tokenSource);
		this.cancellationMap.set(threadId, tokens);

		return tokenSource.token;
	}

	private cancelAllRequests(): void {
		this.cancellationMap.forEach(tokens => tokens.forEach(t => t.dispose(true)));
		this.cancellationMap.clear();
	}

	// REPL

	getReplElements(): IReplElement[] {
		return this.repl.getReplElements();
	}

	hasSeparateRepl(): boolean {
		return !this.parentSession || this._options.repl !== 'mergeWithParent';
	}

	removeReplExpressions(): void {
		this.repl.removeReplExpressions();
	}

	async addReplExpression(stackFrame: IStackFrame | undefined, expression: string): Promise<void> {
		await this.repl.addReplExpression(this, stackFrame, expression);
		// Evaluate all watch expressions and fetch variables again since repl evaluation might have changed some.
		this.debugService.getViewModel().updateViews();
	}

	appendToRepl(data: INewReplElementData, isImportant?: boolean): void {
		this.repl.appendToRepl(this, data);
		if (isImportant) {
			this.notificationService.notify({ message: data.output.toString(), severity: data.sev, source: this.name });
		}
	}
}

/**
 * Keeps track of events for threads, and cancels any previous operations for
 * a thread when the thread goes into a new state. Currently, the operations a thread has are:
 *
 * - started
 * - stopped
 * - continue
 * - exited
 *
 * In each case, the new state preempts the old state, so we don't need to
 * queue work, just cancel old work. It's up to the caller to make sure that
 * no UI effects happen at the point when the `token` is cancelled.
 */
export class ThreadStatusScheduler extends Disposable {
	/**
	 * An array of set of thread IDs. When a 'stopped' event is encountered, the
	 * editor refreshes its thread IDs. In the meantime, the thread may change
	 * state it again. So the editor puts a Set into this array when it starts
	 * the refresh, and checks it after the refresh is finished, to see if
	 * any of the threads it looked up should now be invalidated.
	 */
	private pendingCancellations: Set<number | undefined>[] = [];

	/**
	 * Cancellation tokens for currently-running operations on threads.
	 */
	private readonly threadOps = this._register(new DisposableMap<number, CancellationTokenSource>());

	/**
	 * Runs the operation.
	 * If thread is undefined it affects all threads.
	 */
	public async run(threadIdsP: Promise<number[]>, operation: (threadId: number, ct: CancellationToken) => Promise<unknown>) {
		const cancelledWhileLookingUpThreads = new Set<number | undefined>();
		this.pendingCancellations.push(cancelledWhileLookingUpThreads);
		const threadIds = await threadIdsP;

		// Now that we got our threads,
		// 1. Remove our pending set, and
		// 2. Cancel any slower callers who might also have found this thread
		for (let i = 0; i < this.pendingCancellations.length; i++) {
			const s = this.pendingCancellations[i];
			if (s === cancelledWhileLookingUpThreads) {
				this.pendingCancellations.splice(i, 1);
				break;
			} else {
				for (const threadId of threadIds) {
					s.add(threadId);
				}
			}
		}

		if (cancelledWhileLookingUpThreads.has(undefined)) {
			return;
		}

		await Promise.all(threadIds.map(threadId => {
			if (cancelledWhileLookingUpThreads.has(threadId)) {
				return;
			}
			this.threadOps.get(threadId)?.cancel();
			const cts = new CancellationTokenSource();
			this.threadOps.set(threadId, cts);
			return operation(threadId, cts.token);
		}));
	}

	/**
	 * Cancels all ongoing state operations on the given threads.
	 * If threads is undefined it cancel all threads.
	 */
	public cancel(threadIds?: readonly number[]) {
		if (!threadIds) {
			for (const [_, op] of this.threadOps) {
				op.cancel();
			}
			this.threadOps.clearAndDisposeAll();
			for (const s of this.pendingCancellations) {
				s.add(undefined);
			}
		} else {
			for (const threadId of threadIds) {
				this.threadOps.get(threadId)?.cancel();
				this.threadOps.deleteAndDispose(threadId);
				for (const s of this.pendingCancellations) {
					s.add(threadId);
				}
			}
		}
	}
}

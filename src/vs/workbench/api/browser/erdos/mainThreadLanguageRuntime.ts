import {
	ExtHostLanguageRuntimeShape,
	MainThreadLanguageRuntimeShape,
	MainErdosContext,
	ExtHostErdosContext,
	RuntimeInitialState
} from '../../common/erdos/extHost.erdos.protocol.js';
import { extHostNamedCustomer, IExtHostContext } from '../../../services/extensions/common/extHostCustomers.js';
import { ILanguageRuntimeClientCreatedEvent, ILanguageRuntimeInfo, ILanguageRuntimeMessage, ILanguageRuntimeMessageCommClosed, ILanguageRuntimeMessageCommData, ILanguageRuntimeMessageCommOpen, ILanguageRuntimeMessageError, ILanguageRuntimeMessageInput, ILanguageRuntimeMessageOutput, ILanguageRuntimeMessagePrompt, ILanguageRuntimeMessageState, ILanguageRuntimeMessageStream, ILanguageRuntimeMetadata, ILanguageRuntimeSessionState as ILanguageRuntimeSessionState, ILanguageRuntimeService, ILanguageRuntimeStartupFailure, LanguageRuntimeMessageType, RuntimeCodeExecutionMode, RuntimeCodeFragmentStatus, RuntimeErrorBehavior, RuntimeState, ILanguageRuntimeExit, RuntimeOutputKind, RuntimeExitReason, ILanguageRuntimeMessageWebOutput, ErdosOutputLocation, LanguageRuntimeSessionMode, ILanguageRuntimeMessageResult, ILanguageRuntimeMessageClearOutput, ILanguageRuntimeMessageIPyWidget, IRuntimeManager, ILanguageRuntimeMessageUpdateOutput, RuntimeStartupPhase } from '../../../services/languageRuntime/common/languageRuntimeService.js';
import { ILanguageRuntimeSession, ILanguageRuntimeSessionManager, IRuntimeSessionMetadata, IRuntimeSessionService, RuntimeStartMode } from '../../../services/runtimeSession/common/runtimeSessionService.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { IErdosConsoleService } from '../../../services/erdosConsole/browser/interfaces/erdosConsoleService.js';

import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IRuntimeClientInstance, IRuntimeClientOutput, RuntimeClientState, RuntimeClientStatus, RuntimeClientType } from '../../../services/languageRuntime/common/languageRuntimeClientInstance.js';
import { DeferredPromise } from '../../../../base/common/async.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IErdosPlotsService } from '../../../services/erdosPlots/common/erdosPlots.js';
import { IErdosIPyWidgetsService } from '../../../services/erdosIPyWidgets/common/erdosIPyWidgetsService.js';

import { INotebookService } from '../../../contrib/notebook/common/notebookService.js';
import { IRuntimeClientEvent } from '../../../services/languageRuntime/common/languageRuntimeUiClient.js';
import { URI } from '../../../../base/common/uri.js';
import { BusyEvent, UiFrontendEvent, OpenEditorEvent, OpenWorkspaceEvent, PromptStateEvent, WorkingDirectoryEvent, ShowMessageEvent, SetEditorSelectionsEvent, OpenWithSystemEvent } from '../../../services/languageRuntime/common/erdosUiComm.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IEditor } from '../../../../editor/common/editorCommon.js';
import { Selection } from '../../../../editor/common/core/selection.js';
import { ITextResourceEditorInput } from '../../../../platform/editor/common/editor.js';

import { ISettableObservable, observableValue } from '../../../../base/common/observable.js';
import { IRuntimeStartupService } from '../../../services/runtimeStartup/common/runtimeStartupService.js';
import { SerializableObjectWithBuffers } from '../../../services/extensions/common/proxyIdentifier.js';
import { IErdosWebviewPreloadService } from '../../../services/erdosWebviewPreloads/browser/erdosWebviewPreloadService.js';

import { IRuntimeNotebookKernelService } from '../../../contrib/runtimeNotebookKernel/common/interfaces/runtimeNotebookKernelService.js';
import { LanguageRuntimeSessionChannel } from '../../common/erdos/extHostTypes.erdos.js';
import { basename } from '../../../../base/common/resources.js';
import { RuntimeOnlineState } from '../../../services/languageRuntime/common/languageRuntimeService.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { CodeAttributionSource, IConsoleCodeAttribution } from '../../../services/erdosConsole/common/erdosConsoleCodeExecution.js';


import { isWebviewDisplayMessage, isWebviewPreloadMessage } from '../../../services/erdosIPyWidgets/common/webviewPreloadUtils.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';

abstract class QueuedRuntimeEvent {
	constructor(readonly clock: number) { }
	abstract summary(): string;
}

class QueuedRuntimeMessageEvent extends QueuedRuntimeEvent {
	override summary(): string {
		return `${this.message.type}`;
	}

	constructor(clock: number, readonly handled: boolean, readonly message: ILanguageRuntimeMessage) {
		super(clock);
	}
}

class QueuedRuntimeStateEvent extends QueuedRuntimeEvent {
	override summary(): string {
		return `=> ${this.state}`;
	}
	constructor(clock: number, readonly state: RuntimeState) {
		super(clock);
	}
}

class ExtHostLanguageRuntimeSessionAdapter extends Disposable implements ILanguageRuntimeSession {

	private readonly _stateEmitter = new Emitter<RuntimeState>();
	private readonly _startupEmitter = new Emitter<ILanguageRuntimeInfo>();
	private readonly _startupFailureEmitter = new Emitter<ILanguageRuntimeStartupFailure>();
	private readonly _exitEmitter = new Emitter<ILanguageRuntimeExit>();

	private readonly _onDidReceiveRuntimeMessageClearOutputEmitter = new Emitter<ILanguageRuntimeMessageClearOutput>();
	private readonly _onDidReceiveRuntimeMessageOutputEmitter = new Emitter<ILanguageRuntimeMessageOutput>();
	private readonly _onDidReceiveRuntimeMessageResultEmitter = new Emitter<ILanguageRuntimeMessageResult>();
	private readonly _onDidReceiveRuntimeMessageStreamEmitter = new Emitter<ILanguageRuntimeMessageStream>();
	private readonly _onDidReceiveRuntimeMessageInputEmitter = new Emitter<ILanguageRuntimeMessageInput>();
	private readonly _onDidReceiveRuntimeMessageErrorEmitter = new Emitter<ILanguageRuntimeMessageError>();
	private readonly _onDidReceiveRuntimeMessagePromptEmitter = new Emitter<ILanguageRuntimeMessagePrompt>();
	private readonly _onDidReceiveRuntimeMessageStateEmitter = new Emitter<ILanguageRuntimeMessageState>();
	private readonly _onDidReceiveRuntimeMessageUpdateOutputEmitter = new Emitter<ILanguageRuntimeMessageUpdateOutput>();
	private readonly _onDidReceiveRuntimeMessageClientEventEmitter = new Emitter<IRuntimeClientEvent>();
	private readonly _onDidReceiveRuntimeMessagePromptConfigEmitter = new Emitter<void>();
	private readonly _onDidReceiveRuntimeMessageIPyWidgetEmitter = new Emitter<ILanguageRuntimeMessageIPyWidget>();
	private readonly _onDidCreateClientInstanceEmitter = new Emitter<ILanguageRuntimeClientCreatedEvent>();	
	private readonly _erdosPlotCommIds = new Set<string>();

	private _currentState: RuntimeState = RuntimeState.Uninitialized;
	private _lastUsed: number = 0;
	private _clients: Map<string, ExtHostRuntimeClientInstance<any, any>> =
		new Map<string, ExtHostRuntimeClientInstance<any, any>>();

	private _eventClock = 0;

	private _eventQueue: QueuedRuntimeEvent[] = [];

	private _eventQueueTimer: Timeout | undefined;

	private handle: number;

	dynState: ILanguageRuntimeSessionState;

	constructor(
		initialState: RuntimeInitialState,
		readonly runtimeMetadata: ILanguageRuntimeMetadata,
		readonly metadata: IRuntimeSessionMetadata,
		private readonly _runtimeSessionService: IRuntimeSessionService,
		private readonly _notificationService: INotificationService,
		private readonly _logService: ILogService,
		private readonly _commandService: ICommandService,
		private readonly _notebookService: INotebookService,
		private readonly _editorService: IEditorService,
		private readonly _proxy: ExtHostLanguageRuntimeShape,
		private readonly _openerService: IOpenerService,
		private readonly _mainRuntime: MainThreadLanguageRuntime
	) {

		super();

		this.handle = initialState.handle;
		this.dynState = {
			busy: false,
			currentNotebookUri: metadata.notebookUri || undefined,
			currentWorkingDirectory: '',
			...initialState.dynState,
		};

		this.onDidChangeRuntimeState = this._stateEmitter.event;
		this.onDidCompleteStartup = this._startupEmitter.event;
		this.onDidEncounterStartupFailure = this._startupFailureEmitter.event;
		this.onDidEndSession = this._exitEmitter.event;

		this._register(this.onDidChangeRuntimeState((state) => {
			this._currentState = state;

			if (state === RuntimeState.Exited) {

				for (const client of this._clients.values()) {
					if (client.clientState.get() === RuntimeClientState.Connected) {
						client.setClientState(RuntimeClientState.Closing);
						client.setClientState(RuntimeClientState.Closed);
						client.dispose();
					}
				}

				this._clients.clear();
			}
		}));

		this._register(this._runtimeSessionService.onDidChangeForegroundSession((session) => {
			this._proxy.$notifyForegroundSessionChanged(session?.sessionId);
		}));

		this._register(this._runtimeSessionService.onDidReceiveRuntimeEvent(async globalEvent => {
			if (globalEvent.session_id !== this.sessionId) {
				return;
			}

			const ev = globalEvent.event;
			if (ev.name === UiFrontendEvent.PromptState) {
				const state = ev.data as PromptStateEvent;

				const inputPrompt = state.input_prompt?.trimEnd();
				const continuationPrompt = state.continuation_prompt?.trimEnd();

				if (inputPrompt) {
					this.dynState.inputPrompt = inputPrompt;
				}
				if (continuationPrompt) {
					this.dynState.continuationPrompt = continuationPrompt;
				}

				this.emitDidReceiveRuntimeMessagePromptConfig();
			} else if (ev.name === UiFrontendEvent.Busy) {
				const busy = ev.data as BusyEvent;
				this.dynState.busy = busy.busy;
			} else if (ev.name === UiFrontendEvent.SetEditorSelections) {
				const sel = ev.data as SetEditorSelectionsEvent;
				const selections = sel.selections.map(s =>
					new Selection(s.start.line, s.start.character, s.end.line, s.end.character));
				const editor = this._editorService.activeTextEditorControl as IEditor;
				editor.setSelections(selections);
			} else if (ev.name === UiFrontendEvent.OpenEditor) {
				const ed = ev.data as OpenEditorEvent;

				let file = URI.parse(ed.file);
				if (!file.scheme) {
					file = URI.file(ed.file);
				}

				const editor: ITextResourceEditorInput = {
					resource: file,
					options: { selection: { startLineNumber: ed.line, startColumn: ed.column } }
				};
				this._editorService.openEditor(editor);
			} else if (ev.name === UiFrontendEvent.OpenWorkspace) {
				const ws = ev.data as OpenWorkspaceEvent;
				const uri = URI.file(ws.path);
				this._commandService.executeCommand('vscode.openFolder', uri, ws.new_window);
			} else if (ev.name === UiFrontendEvent.OpenWithSystem) {
				const openWith = ev.data as OpenWithSystemEvent;
				const uri = URI.file(openWith.path);

				await this._openerService.open(uri, { openExternal: true });
			} else if (ev.name === UiFrontendEvent.WorkingDirectory) {
				const dir = ev.data as WorkingDirectoryEvent;
				this.dynState.currentWorkingDirectory = dir.directory;
			} else if (ev.name === UiFrontendEvent.ShowMessage) {
				const msg = ev.data as ShowMessageEvent;
				this._notificationService.info(msg.message);
			}

			this._onDidReceiveRuntimeMessageClientEventEmitter.fire(ev);
		}));
	}

	onDidChangeRuntimeState: Event<RuntimeState>;

	onDidCompleteStartup: Event<ILanguageRuntimeInfo>;

	onDidEncounterStartupFailure: Event<ILanguageRuntimeStartupFailure>;

	onDidEndSession: Event<ILanguageRuntimeExit>;

	onDidReceiveRuntimeMessageClearOutput = this._onDidReceiveRuntimeMessageClearOutputEmitter.event;
	onDidReceiveRuntimeMessageOutput = this._onDidReceiveRuntimeMessageOutputEmitter.event;
	onDidReceiveRuntimeMessageResult = this._onDidReceiveRuntimeMessageResultEmitter.event;
	onDidReceiveRuntimeMessageStream = this._onDidReceiveRuntimeMessageStreamEmitter.event;
	onDidReceiveRuntimeMessageInput = this._onDidReceiveRuntimeMessageInputEmitter.event;
	onDidReceiveRuntimeMessageError = this._onDidReceiveRuntimeMessageErrorEmitter.event;
	onDidReceiveRuntimeMessagePrompt = this._onDidReceiveRuntimeMessagePromptEmitter.event;
	onDidReceiveRuntimeMessageState = this._onDidReceiveRuntimeMessageStateEmitter.event;
	onDidReceiveRuntimeMessageUpdateOutput = this._onDidReceiveRuntimeMessageUpdateOutputEmitter.event;
	onDidReceiveRuntimeClientEvent = this._onDidReceiveRuntimeMessageClientEventEmitter.event;
	onDidReceiveRuntimeMessagePromptConfig = this._onDidReceiveRuntimeMessagePromptConfigEmitter.event;
	onDidReceiveRuntimeMessageIPyWidget = this._onDidReceiveRuntimeMessageIPyWidgetEmitter.event;
	onDidCreateClientInstance = this._onDidCreateClientInstanceEmitter.event;

	handleRuntimeMessage(message: ILanguageRuntimeMessage, handled: boolean): void {
		const event = new QueuedRuntimeMessageEvent(message.event_clock, handled, message);
		this.addToEventQueue(event);
	}

	emitDidReceiveRuntimeMessageClearOutput(languageRuntimeMessageClearOutput: ILanguageRuntimeMessageClearOutput) {
		this._onDidReceiveRuntimeMessageClearOutputEmitter.fire(languageRuntimeMessageClearOutput);
	}

	emitDidReceiveRuntimeMessageOutput(languageRuntimeMessageOutput: ILanguageRuntimeMessageOutput) {
		this._onDidReceiveRuntimeMessageOutputEmitter.fire(languageRuntimeMessageOutput);
	}

	emitDidReceiveRuntimeMessageResult(languageRuntimeMessageResult: ILanguageRuntimeMessageResult) {
		this._onDidReceiveRuntimeMessageResultEmitter.fire(languageRuntimeMessageResult);
	}

	emitDidReceiveRuntimeMessageStream(languageRuntimeMessageStream: ILanguageRuntimeMessageStream) {
		this._onDidReceiveRuntimeMessageStreamEmitter.fire(languageRuntimeMessageStream);
	}

	emitDidReceiveRuntimeMessageInput(languageRuntimeMessageInput: ILanguageRuntimeMessageInput) {
		this._onDidReceiveRuntimeMessageInputEmitter.fire(languageRuntimeMessageInput);
	}

	emitDidReceiveRuntimeMessageError(languageRuntimeMessageError: ILanguageRuntimeMessageError) {
		this._onDidReceiveRuntimeMessageErrorEmitter.fire(languageRuntimeMessageError);
	}

	emitDidReceiveRuntimeMessagePrompt(languageRuntimeMessagePrompt: ILanguageRuntimeMessagePrompt) {
		this._onDidReceiveRuntimeMessagePromptEmitter.fire(languageRuntimeMessagePrompt);
	}

	emitDidReceiveRuntimeMessageState(languageRuntimeMessageState: ILanguageRuntimeMessageState) {
		for (const client of this.clientInstances) {
			client.updatePendingRpcState(languageRuntimeMessageState);
		}
		this._onDidReceiveRuntimeMessageStateEmitter.fire(languageRuntimeMessageState);
	}

	emitDidReceiveRuntimeMessageUpdateOutput(languageRuntimeMessageUpdateOutput: ILanguageRuntimeMessageUpdateOutput) {
		this._onDidReceiveRuntimeMessageUpdateOutputEmitter.fire(languageRuntimeMessageUpdateOutput);
	}

	emitRuntimeMessageIPyWidget(languageRuntimeMessageIPyWidget: ILanguageRuntimeMessageIPyWidget) {
		this._onDidReceiveRuntimeMessageIPyWidgetEmitter.fire(languageRuntimeMessageIPyWidget);
	}

	emitDidReceiveRuntimeMessagePromptConfig() {
		this._onDidReceiveRuntimeMessagePromptConfigEmitter.fire();
	}

	emitState(clock: number, state: RuntimeState): void {
		const event = new QueuedRuntimeStateEvent(clock, state);
		this.addToEventQueue(event);
	}

	markExited(): void {
		this._stateEmitter.fire(RuntimeState.Exited);
	}

	emitExit(exit: ILanguageRuntimeExit): void {
		this._exitEmitter.fire(exit);
	}

	get clientInstances(): IRuntimeClientInstance<any, any>[] {
		return Array.from(this._clients.values());
	}

	get lastUsed(): number {
		return this._lastUsed;
	}

	get sessionId(): string {
		return this.metadata.sessionId;
	}

	emitDidReceiveClientMessage(message: ILanguageRuntimeMessageCommData): void {
		const client = this._clients.get(message.comm_id);
		if (client) {
			client.emitData(message);
		} else {
			this._logService.warn(`Client instance '${message.comm_id}' not found; dropping message: ${JSON.stringify(message)}`);
		}
	}

	openClientInstance(message: ILanguageRuntimeMessageCommOpen): void {
		if (!Object.values(RuntimeClientType).includes(message.target_name as RuntimeClientType)) {
			this._proxy.$removeClient(this.handle, message.comm_id);
			return;
		}

		const client = new ExtHostRuntimeClientInstance<any, any>(
			message.comm_id,
			message.target_name as RuntimeClientType,
			this.handle, this._proxy);

		this._clients.set(message.comm_id, client);

		client.setClientState(RuntimeClientState.Connected);

		this._onDidCreateClientInstanceEmitter.fire({ client, message });
	}

	emitClientState(id: string, state: RuntimeClientState): void {
		const client = this._clients.get(id);
		if (client) {
			client.setClientState(state);
		} else {
			this._logService.warn(`Client instance '${id}' not found; dropping state change: ${state}`);
		}
	}

	getRuntimeState(): RuntimeState {
		return this._currentState;
	}

	openResource(resource: URI | string): Promise<boolean> {
		return this._proxy.$openResource(this.handle, resource);
	}

	execute(code: string, id: string, mode: RuntimeCodeExecutionMode, errorBehavior: RuntimeErrorBehavior): void {
		this._lastUsed = Date.now();
		this._proxy.$executeCode(this.handle, code, id, mode, errorBehavior, id);
	}

	isCodeFragmentComplete(code: string): Promise<RuntimeCodeFragmentStatus> {
		return this._proxy.$isCodeFragmentComplete(this.handle, code);
	}

	createClient<Input, Output>(type: RuntimeClientType, params: any, metadata?: any, id?: string):
		Promise<IRuntimeClientInstance<Input, Output>> {
		id = id ?? this.generateClientId(this.runtimeMetadata.languageId, type);

		const client = new ExtHostRuntimeClientInstance<Input, Output>(id, type, this.handle, this._proxy);
		this._clients.set(id, client);
		client.setClientState(RuntimeClientState.Opening);

		this._proxy.$createClient(this.handle, id, type, params, metadata).then(() => {
			if (client.clientState.get() === RuntimeClientState.Opening) {
				client.setClientState(RuntimeClientState.Connected);
			} else {
				this._logService.trace(`Client '${id}' in runtime '${this.runtimeMetadata.runtimeName}' ` +
					`was closed instead of being created; it is unsupported by this runtime.`);
				client.setClientState(RuntimeClientState.Closed);
			}
		}).catch((err) => {
			this._logService.error(`Failed to create client '${id}' ` +
				`in runtime '${this.runtimeMetadata.runtimeName}': ${err}`);
			client.setClientState(RuntimeClientState.Closed);
			this._clients.delete(id);
		});

		return Promise.resolve(client);
	}

	listClients(type?: RuntimeClientType): Promise<IRuntimeClientInstance<any, any>[]> {
		return new Promise((resolve, reject) => {
			this._proxy.$listClients(this.handle, type).then(clients => {
				const instances = new Array<IRuntimeClientInstance<any, any>>();

				Object.keys(clients).forEach((key) => {
					const instance = this._clients.get(key);
					if (instance) {
						instances.push(instance);
						return;
					}
					const clientType = clients[key];
					if (Object.values(RuntimeClientType).includes(clientType as RuntimeClientType)) {
						const client = new ExtHostRuntimeClientInstance<any, any>(
							key,
							clientType as RuntimeClientType,
							this.handle,
							this._proxy);

						client.setClientState(RuntimeClientState.Connected);
						this._clients.set(key, client);
						instances.push(client);
					} else {
						this._logService.warn(`Ignoring unknown client type '${clientType}' for client '${key}'`);
					}
				});

				resolve(instances);
			}).catch((err) => {
				reject(err);
			});
		});
	}

	replyToPrompt(id: string, value: string): void {
		this._proxy.$replyToPrompt(this.handle, id, value);
	}

	setWorkingDirectory(dir: string): Promise<void> {
		return this._proxy.$setWorkingDirectory(this.handle, dir);
	}

	async interrupt(): Promise<void> {
		this._stateEmitter.fire(RuntimeState.Interrupting);
		return this._proxy.$interruptLanguageRuntime(this.handle);
	}

	async restart(workingDirectory?: string): Promise<void> {
		if (!this.canShutdown()) {
			throw new Error(`Cannot restart runtime '${this.runtimeMetadata.runtimeName}': ` +
				`runtime is in state '${this._currentState}'`);
		}
		this._stateEmitter.fire(RuntimeState.Restarting);
		return this._proxy.$restartSession(this.handle, workingDirectory);
	}

	async shutdown(exitReason = RuntimeExitReason.Shutdown): Promise<void> {
		if (!this.canShutdown()) {
			throw new Error(`Cannot shut down runtime '${this.runtimeMetadata.runtimeName}': ` +
				`runtime is in state '${this._currentState}'`);
		}
		this._stateEmitter.fire(RuntimeState.Exiting);
		return this._proxy.$shutdownLanguageRuntime(this.handle, exitReason);
	}

	async forceQuit(): Promise<void> {
		return this._proxy.$forceQuitLanguageRuntime(this.handle);
	}

	async showOutput(channel?: LanguageRuntimeSessionChannel): Promise<void> {
		return this._proxy.$showOutputLanguageRuntime(this.handle, channel);
	}

	async listOutputChannels(): Promise<LanguageRuntimeSessionChannel[]> {
		return await this._proxy.$listOutputChannelsLanguageRuntime(this.handle);
	}

	async updateSessionName(sessionName: string): Promise<void> {
		this.dynState.sessionName = sessionName;
		this._proxy.$updateSessionNameLanguageRuntime(this.handle, sessionName);
	}

	async showProfile(): Promise<void> {
		return this._proxy.$showProfileLanguageRuntime(this.handle);
	}

	private canShutdown(): boolean {
		return this._currentState === RuntimeState.Busy ||
			this._currentState === RuntimeState.Idle ||
			this._currentState === RuntimeState.Ready;
	}

	start(): Promise<ILanguageRuntimeInfo> {
		return new Promise((resolve, reject) => {
			this._proxy.$startLanguageRuntime(this.handle).then((info) => {
				if (info.input_prompt) {
					this.dynState.inputPrompt = info.input_prompt.trimEnd();
				}
				if (info.continuation_prompt) {
					this.dynState.continuationPrompt = info.continuation_prompt.trimEnd();
				}

				this._startupEmitter.fire(info);
				resolve(info);
			}).catch((err) => {
				if (err.message && err.details) {
					this._startupFailureEmitter.fire(err satisfies ILanguageRuntimeStartupFailure);
					reject(err.message);
				} else if (err.message && err.errors) {
					this._startupFailureEmitter.fire({
						message: err.message,
						details: err.errors.map((e: any) => e.toString()).join('\n\n')
					} satisfies ILanguageRuntimeStartupFailure);
					reject(err.message);
				} else if (err.name && err.message) {
					this._startupFailureEmitter.fire({
						message: err.name,
						details: err.message
					} satisfies ILanguageRuntimeStartupFailure);
					reject(err.message);
				} else if (err.message) {
					this._startupFailureEmitter.fire({
						message: err.message,
						details: ''
					} satisfies ILanguageRuntimeStartupFailure);
					reject(err.message);
				} else {
					this._startupFailureEmitter.fire({
						message: err.toString(),
						details: ''
					} satisfies ILanguageRuntimeStartupFailure);
					reject(err);
				}
			});
		});
	}

	private generateClientId(languageId: string, clientType: RuntimeClientType): string {
		const randomId = Math.floor(Math.random() * 0x100000000).toString(16);

		const nextId = ExtHostLanguageRuntimeSessionAdapter.clientCounter++;

		const client = clientType.replace(/\./g, '-');

		return `${client}-${languageId}-${nextId}-${randomId}`;
	}

	private addToEventQueue(event: QueuedRuntimeEvent): void {
		const clock = event.clock;

		if (clock < this._eventClock) {
			if (event instanceof QueuedRuntimeMessageEvent) {
				this._logService.warn(`Received '${event.summary()}' at tick ${clock} ` +
					`while waiting for tick ${this._eventClock + 1}; emitting anyway`);
				this.processMessage(event.message);
			}

			return;
		}

		this._eventQueue.push(event);

		if (clock === this._eventClock + 1 || this._eventClock === 0) {
			this.processEventQueue();
		} else {
			this._logService.info(`Received '${event.summary()}' at tick ${clock} ` +
				`while waiting for tick ${this._eventClock + 1}; deferring`);

			if (this._eventQueueTimer) {
				clearTimeout(this._eventQueueTimer);
				this._eventQueueTimer = undefined;
			}
			this._eventQueueTimer = setTimeout(() => {
				this._logService.warn(`Processing runtime event queue after timeout; ` +
					`event ordering issues possible.`);
				this.processEventQueue();
			}, 250);
		}
	}

	private processEventQueue(): void {
		clearTimeout(this._eventQueueTimer);
		this._eventQueueTimer = undefined;

		if (this._eventQueue.length > 1) {

			this._eventQueue.sort((a, b) => {
				return a.clock - b.clock;
			});

			this._logService.info(`Processing ${this._eventQueue.length} runtime events. ` +
				`Clocks: ` + this._eventQueue.map((e) => {
					return `${e.clock}: ${e.summary()}`;
				}).join(', '));
		}

		this._eventQueue.forEach((event) => {
			this._eventClock = event.clock;

			this.handleQueuedEvent(event);
		});

		this._eventQueue = [];
	}

	private handleQueuedEvent(event: QueuedRuntimeEvent): void {
		if (event instanceof QueuedRuntimeMessageEvent) {
			if (!event.handled) {
				this.processMessage(event.message);
			}
		} else if (event instanceof QueuedRuntimeStateEvent) {
			this._stateEmitter.fire(event.state);
		}
	}

	private inferErdosOutputKind(message: ILanguageRuntimeMessageOutput): RuntimeOutputKind {
		const mimeTypes = Object.keys(message.data);

		if (isWebviewDisplayMessage(message)) {
			return RuntimeOutputKind.WebviewPreload;
		}

		if (mimeTypes.length === 1 && mimeTypes[0] === 'text/plain') {
			return RuntimeOutputKind.Text;
		}

		if (mimeTypes.length === 1 && mimeTypes[0].startsWith('image/')) {
			return RuntimeOutputKind.StaticImage;
		}

		if (Object.keys(message).includes('output_location')) {
			const webOutput = message as ILanguageRuntimeMessageWebOutput;
			switch (webOutput.output_location) {
				case ErdosOutputLocation.Console:
					return RuntimeOutputKind.InlineHtml;
				case ErdosOutputLocation.Viewer:
					return RuntimeOutputKind.ViewerWidget;
				case ErdosOutputLocation.Plot:
					return RuntimeOutputKind.PlotWidget;
				case ErdosOutputLocation.Inline:
					return RuntimeOutputKind.QuartoInline;
			}
		}

		for (const mimeType of mimeTypes) {
			if (mimeType === 'application/vnd.jupyter.widget-state+json' || mimeType === 'application/vnd.jupyter.widget-view+json') {
				return RuntimeOutputKind.IPyWidget;
			}

			if (mimeType.startsWith('application/') ||
				mimeType === 'text/markdown' ||
				mimeType.startsWith('text/x-')) {
				const renderer = this._notebookService.getPreferredRenderer(mimeType);
				if (renderer) {
					if (mimeType.indexOf('table') >= 0 || mimeType.startsWith('text/')) {
						return RuntimeOutputKind.ViewerWidget;
					} else {
						return RuntimeOutputKind.PlotWidget;
					}
				}
			}
		}

		if (mimeTypes.includes('text/html')) {
			const htmlContent = message.data['text/html']!;

			if (isWebviewPreloadMessage(htmlContent)) {
				return RuntimeOutputKind.WebviewPreload;
			} else if (/<(script|html|body|iframe|!DOCTYPE)/.test(htmlContent)) {
				if (htmlContent.includes('<table') ||
					htmlContent.includes('<!DOCTYPE')) {
					return RuntimeOutputKind.ViewerWidget;
				} else {
					return RuntimeOutputKind.PlotWidget;
				}
			} else {
				return RuntimeOutputKind.InlineHtml;
			}
		}

		for (const mimeType of mimeTypes) {
			if (mimeType.startsWith('image/')) {
				return RuntimeOutputKind.StaticImage;
			}
		}

		if (mimeTypes.includes('text/plain')) {
			return RuntimeOutputKind.Text;
		}

		return RuntimeOutputKind.Unknown;
	}

	private emitRuntimeMessageOutput(message: ILanguageRuntimeMessageOutput): void {
		const outputMessage: ILanguageRuntimeMessageOutput = {
			...message,
			kind: this.inferErdosOutputKind(message),
		};
		this.emitDidReceiveRuntimeMessageOutput(outputMessage);
	}

	private emitRuntimeMessageResult(message: ILanguageRuntimeMessageResult): void {
		const resultMessage: ILanguageRuntimeMessageResult = {
			...message,
			kind: this.inferErdosOutputKind(message),
		};
		this.emitDidReceiveRuntimeMessageResult(resultMessage);
	}

	private emitRuntimeMessageUpdateOutput(message: ILanguageRuntimeMessageUpdateOutput): void {
		const updateMessage: ILanguageRuntimeMessageUpdateOutput = {
			...message,
			kind: this.inferErdosOutputKind(message),
		};
		this.emitDidReceiveRuntimeMessageUpdateOutput(updateMessage);
	}

	private sendToQuartoExtension(outputMessage: ILanguageRuntimeMessageOutput): void {
		this._commandService.executeCommand('quarto.handleInlineOutput', {
			id: outputMessage.id,
			parentId: outputMessage.parent_id,
			data: outputMessage.data,
			metadata: outputMessage.metadata
		});		
	}

	private processMessage(message: ILanguageRuntimeMessage): void {
		switch (message.type) {
			case LanguageRuntimeMessageType.Stream:
				const streamMessage = message as ILanguageRuntimeMessageStream;
				
				// Check if this stream output is from a Quarto execution
				const isQuartoStreamExecution = streamMessage.parent_id && this._mainRuntime.isQuartoExecution(streamMessage.parent_id);
				
				if (isQuartoStreamExecution) {
					// Convert stream to output format for Quarto
					const outputMessage: ILanguageRuntimeMessageOutput = {
						id: streamMessage.id,
						parent_id: streamMessage.parent_id,
						type: LanguageRuntimeMessageType.Output,
						event_clock: streamMessage.event_clock,
						when: streamMessage.when,
						data: { 'text/plain': streamMessage.text },
						metadata: {},
						kind: RuntimeOutputKind.Text
					};
					this.sendToQuartoExtension(outputMessage);
				} else {
					this.emitDidReceiveRuntimeMessageStream(streamMessage);
				}
				break;

			case LanguageRuntimeMessageType.ClearOutput:
				this.emitDidReceiveRuntimeMessageClearOutput(message as ILanguageRuntimeMessageClearOutput);
				break;

			case LanguageRuntimeMessageType.Output:
				const outputMessage = message as ILanguageRuntimeMessageOutput;				
				// Check if this output is from a Quarto execution
				const isQuartoExecution = outputMessage.parent_id && this._mainRuntime.isQuartoExecution(outputMessage.parent_id);
				
				if (isQuartoExecution) {
					this.sendToQuartoExtension(outputMessage);
				} else {
					this.emitRuntimeMessageOutput(outputMessage);
				}
				break;

			case LanguageRuntimeMessageType.Result:
				this.emitRuntimeMessageResult(message as ILanguageRuntimeMessageResult);
				break;

			case LanguageRuntimeMessageType.Input:
				const inputMessage = message as ILanguageRuntimeMessageInput;
				this.emitDidReceiveRuntimeMessageInput(inputMessage);
				break;

			case LanguageRuntimeMessageType.Error:
				const errorMessage = message as ILanguageRuntimeMessageError;
				
				// Check if this error output is from a Quarto execution
				const isQuartoErrorExecution = errorMessage.parent_id && this._mainRuntime.isQuartoExecution(errorMessage.parent_id);
				
				if (isQuartoErrorExecution) {
					// Convert error to output format for Quarto
					const outputMessage: ILanguageRuntimeMessageOutput = {
						id: errorMessage.id,
						parent_id: errorMessage.parent_id,
						type: LanguageRuntimeMessageType.Output,
						event_clock: errorMessage.event_clock,
						when: errorMessage.when,
						data: { 'text/plain': errorMessage.message },
						metadata: {},
						kind: RuntimeOutputKind.Text
					};
					this.sendToQuartoExtension(outputMessage);
				} else {
					this.emitDidReceiveRuntimeMessageError(errorMessage);
				}
				break;

			case LanguageRuntimeMessageType.Prompt:
				this.emitDidReceiveRuntimeMessagePrompt(message as ILanguageRuntimeMessagePrompt);
				break;

			case LanguageRuntimeMessageType.State:
				this.emitDidReceiveRuntimeMessageState(message as ILanguageRuntimeMessageState);
				break;

			case LanguageRuntimeMessageType.IPyWidget:
				this.emitRuntimeMessageIPyWidget(message as ILanguageRuntimeMessageIPyWidget);
				break;

			case LanguageRuntimeMessageType.CommOpen:
				const commOpenMsg = message as ILanguageRuntimeMessageCommOpen;
				if (commOpenMsg.target_name === 'erdos.plot' || commOpenMsg.target_name === 'positron.plot') {
					this.handleErdosPlotCommOpen(commOpenMsg);
					
					// Create a modified message with erdos.plot target for VSCode
					const erdosCommOpenMsg: ILanguageRuntimeMessageCommOpen = {
						...commOpenMsg,
						target_name: 'erdos.plot'
					};
					this.openClientInstance(erdosCommOpenMsg);
				} else {
					this.openClientInstance(commOpenMsg);
				}
				break;

			case LanguageRuntimeMessageType.CommData:
				const commDataMsg = message as ILanguageRuntimeMessageCommData;
				// Check if this is erdos.plot data that needs bridging
				const clientInstance = this._clients.get(commDataMsg.comm_id);
				if (clientInstance && this._erdosPlotCommIds.has(commDataMsg.comm_id)) {
					this.handleErdosPlotCommData(commDataMsg);
				} else {					
					this.emitDidReceiveClientMessage(commDataMsg);
				}
				break;

			case LanguageRuntimeMessageType.CommClosed:
				this.emitClientState((message as ILanguageRuntimeMessageCommClosed).comm_id, RuntimeClientState.Closed);
				break;

			case LanguageRuntimeMessageType.UpdateOutput:
				this.emitRuntimeMessageUpdateOutput(message as ILanguageRuntimeMessageUpdateOutput);
				break;
		}
	}

	getLabel(): string {
		if (this.dynState.currentNotebookUri) {
			return basename(this.dynState.currentNotebookUri);
		}
		return this.dynState.sessionName;
	}
	static clientCounter = 0;

	override dispose(): void {
		super.dispose();
		this._proxy.$disposeLanguageRuntime(this.handle);
	}

	/**
	 * Handle erdos.plot comm open message by tracking the comm ID
	 */
	private handleErdosPlotCommOpen(message: ILanguageRuntimeMessageCommOpen): void {
		this._erdosPlotCommIds.add(message.comm_id);
		
		// Check if there's pre-render data in the CommOpen message
		if (message.data && typeof message.data === 'object') {
			const data = message.data as Record<string, any>;
			
			if (data.pre_render && typeof data.pre_render === 'object') {
				const preRender = data.pre_render as Record<string, any>;
				
				if (preRender.data && typeof preRender.data === 'string' && preRender.mime_type && preRender.mime_type.startsWith('image/')) {
					
					// Create update event with the pre-render data for immediate display
					const updateEventData = {
						pre_render: {
							data: preRender.data,
							mime_type: preRender.mime_type,
							settings: preRender.settings || {
								size: { width: 480, height: 480, unit: 'pixels' },
								pixel_ratio: 1,
								format: preRender.mime_type.includes('png') ? 'png' : 'svg'
							}
						}
					};
					
					// Send update event immediately after CommOpen
					const erdosUpdateMsg: ILanguageRuntimeMessageCommData = {
						id: `update-${message.comm_id}-${Date.now()}`,
						parent_id: message.parent_id || '',
						when: new Date().toISOString(),
						type: LanguageRuntimeMessageType.CommData,
						event_clock: message.event_clock,
						comm_id: message.comm_id,
						data: {
							method: 'update',
							params: updateEventData
						}
					};
					
					// Emit this after a short delay to ensure the client is created first
					setTimeout(() => {
						this.emitDidReceiveClientMessage(erdosUpdateMsg);
					}, 50);
					
					// ALSO send plot data to Quarto if this is a Quarto execution
					if (message.parent_id && this._mainRuntime.isQuartoExecution(message.parent_id)) {
						// Create output message with image data for Quarto
						const quartoOutputMessage: ILanguageRuntimeMessageOutput = {
							id: message.id,
							parent_id: message.parent_id,
							type: LanguageRuntimeMessageType.Output,
							event_clock: message.event_clock,
							when: message.when,
							data: { [preRender.mime_type]: preRender.data },
							metadata: {},
							kind: RuntimeOutputKind.StaticImage
						};
						this.sendToQuartoExtension(quartoOutputMessage);
					}
				}
			}
		}
	}

	/**
	 * Handle erdos.plot comm data message by bridging to erdos.plot format
	 */
	private handleErdosPlotCommData(message: ILanguageRuntimeMessageCommData): void {
		// Check if this is a Quarto execution and forward to Quarto extension
		if (message.parent_id && this._mainRuntime.isQuartoExecution(message.parent_id)) {
			
			// Check if this comm data contains plot render results
			if (message.data && typeof message.data === 'object') {
				const data = message.data as Record<string, any>;
				
				// Look for plot render response with image data (Erdos format)
				if (data.data && typeof data.data === 'string' && data.mime_type && data.mime_type.startsWith('image/')) {
					// Create output message with image data for Quarto
					const quartoOutputMessage: ILanguageRuntimeMessageOutput = {
						id: message.id,
						parent_id: message.parent_id,
						type: LanguageRuntimeMessageType.Output,
						event_clock: message.event_clock,
						when: message.when,
						data: { [data.mime_type]: data.data },
						metadata: {},
						kind: RuntimeOutputKind.StaticImage
					};
					this.sendToQuartoExtension(quartoOutputMessage);
				}
			}
		}
		
		// Check if this comm data contains plot render results
		if (message.data && typeof message.data === 'object') {
			const data = message.data as Record<string, any>;
			
			// Look for plot render response with image data (Erdos format)
			if (data.data && typeof data.data === 'string' && data.mime_type && data.mime_type.startsWith('image/')) {
				// Create plot result in Erdos format
				const plotResult = {
					data: data.data,
					mime_type: data.mime_type,
					settings: data.settings || {
						size: { width: 480, height: 480, unit: 'pixels' },
						pixel_ratio: 1,
						format: data.mime_type.includes('png') ? 'png' : 'svg'
					}
				};
				
				// Create update event data with pre_render for immediate display
				const updateEventData = {
					pre_render: plotResult
				};
				
				// Modify the comm data message to include the update event for erdos.plot
				const erdosCommDataMsg: ILanguageRuntimeMessageCommData = {
					...message,
					data: {
						// Keep original method/params if they exist
						...message.data,
						// Add update event with pre_render data
						method: 'update',
						params: updateEventData
					}
				};
				
				this.emitDidReceiveClientMessage(erdosCommDataMsg);
			} else if (data.result && typeof data.result === 'object') {
				// Check if the result contains plot data
				const result = data.result as Record<string, any>;
				
				if (result.data && typeof result.data === 'string' && result.mime_type && result.mime_type.startsWith('image/')) {					
					// Create plot result in Erdos format
					const plotResult = {
						data: result.data,
						mime_type: result.mime_type,
						settings: result.settings || {
							size: { width: 480, height: 480, unit: 'pixels' },
							pixel_ratio: 1,
							format: result.mime_type.includes('png') ? 'png' : 'svg'
						}
					};
					
					// Create update event data with pre_render for immediate display
					const updateEventData = {
						pre_render: plotResult
					};
					
					// Modify the comm data message to include the update event for erdos.plot
					const erdosCommDataMsg: ILanguageRuntimeMessageCommData = {
						...message,
						data: {
							method: 'update',
							params: updateEventData
						}
					};
					
					this.emitDidReceiveClientMessage(erdosCommDataMsg);
					
					// ALSO send plot data to Quarto if this is a Quarto execution
					if (message.parent_id && this._mainRuntime.isQuartoExecution(message.parent_id)) {
						// Create output message with image data for Quarto
						const quartoOutputMessage: ILanguageRuntimeMessageOutput = {
							id: message.id,
							parent_id: message.parent_id,
							type: LanguageRuntimeMessageType.Output,
							event_clock: message.event_clock,
							when: message.when,
							data: { [result.mime_type]: result.data },
							metadata: {},
							kind: RuntimeOutputKind.StaticImage
						};
						this.sendToQuartoExtension(quartoOutputMessage);
					}
				}
			}
		}
	}
}

enum PendingRpcStatus {
	Pending,
	Executing,
	Completed,
	Error,
}

class PendingRpc<T> {
	public readonly promise: DeferredPromise<IRuntimeClientOutput<T>>;

	private readonly _onDidChangeStatus = new Emitter<PendingRpcStatus>();
	private _status: PendingRpcStatus = PendingRpcStatus.Pending;

	public readonly onDidChangeStatus: Event<PendingRpcStatus> = this._onDidChangeStatus.event;


	constructor(
		public readonly responseKeys: Array<string>
	) {
		this.promise = new DeferredPromise<IRuntimeClientOutput<T>>();
	}

	public setStatus(status: PendingRpcStatus): void {
		if (this._status !== status) {
			this._status = status;
			this._onDidChangeStatus.fire(status);
		}
	}

	public getStatus(): PendingRpcStatus {
		return this._status;
	}

	public error(error: Error): void {
		this.setStatus(PendingRpcStatus.Error);
		this.promise.error(error);
	}
}

class ExtHostRuntimeClientInstance<Input, Output>
	extends Disposable
	implements IRuntimeClientInstance<Input, Output> {

	private readonly _dataEmitter = new Emitter<IRuntimeClientOutput<Output>>();

	private readonly _pendingRpcs = new Map<string, PendingRpc<any>>();

	public messageCounter: ISettableObservable<number>;

	public clientState: ISettableObservable<RuntimeClientState>;

	public clientStatus: ISettableObservable<RuntimeClientStatus>;

	constructor(
		private readonly _id: string,
		private readonly _type: RuntimeClientType,
		private readonly _handle: number,
		private readonly _proxy: ExtHostLanguageRuntimeShape) {
		super();

		this.messageCounter = observableValue(`msg-counter-${this._id}`, 0);

		this.clientState = observableValue(`client-state-${this._id}`, RuntimeClientState.Uninitialized);
		this.clientStatus = observableValue(`client-status-${this._id}`, RuntimeClientStatus.Disconnected);

		const clientStateEvent = Event.fromObservable(this.clientState);
		this._register(clientStateEvent((state) => {
			switch (state) {
				case RuntimeClientState.Connected:
					if (this._pendingRpcs.size > 0) {
						this.setClientStatus(RuntimeClientStatus.Busy);
					} else {
						this.setClientStatus(RuntimeClientStatus.Idle);
					}
					break;
				case RuntimeClientState.Closed:
				case RuntimeClientState.Closing:
				case RuntimeClientState.Uninitialized:
				case RuntimeClientState.Opening:
					this.setClientStatus(RuntimeClientStatus.Disconnected);
					break;
			}
		}));

		this.onDidReceiveData = this._dataEmitter.event;
		this._register(this._dataEmitter);
	}

	performRpcWithBuffers<T>(request: Input, timeout: number | undefined, responseKeys: Array<string> = []): Promise<IRuntimeClientOutput<T>> {
		const messageId = generateUuid();

		const pending = new PendingRpc<T>(responseKeys);
		this._pendingRpcs.set(messageId, pending);
		this.setClientStatus(RuntimeClientStatus.Busy);

		const statusListener = pending.onDidChangeStatus((status) => {
			if (status === PendingRpcStatus.Completed) {
				statusListener.dispose();
				const timeout = 5000;
				setTimeout(() => {
					if (pending.promise.isSettled) {
						return;
					}
					const timeoutSeconds = Math.round(timeout / 100) / 10;
					
					// Enhanced error information for response timeout
					const rpcMethod = (request as any)?.method || 'unknown';
					const errorMessage = `RPC request completed, but response not received after ${timeoutSeconds} seconds`;
					const contextInfo = {
						method: rpcMethod,
						clientId: this._id,
						clientType: this._type,
						timeout: timeoutSeconds,
						phase: 'response_timeout'
					};
					
					console.error('🔌 RPC RESPONSE TIMEOUT DEBUG:', JSON.stringify({
						...contextInfo,
						message: errorMessage,
						request: request
					}, null, 2));
					
					const detailedError = new Error(`${errorMessage} - Method: ${rpcMethod}, Client: ${this._id} (${this._type})`);
					(detailedError as any).context = contextInfo;
					
					pending.error(detailedError);
					this.deletePendingRpc(messageId);
				}, timeout);
			}
		});

		pending.promise.p.finally(() => {
			statusListener.dispose();
		});

		this._proxy.$sendClientMessage(this._handle, this._id, messageId, request);

		this.messageCounter.set(this.messageCounter.get() + 1, undefined);

		if (timeout) {
			setTimeout(() => {
				if (pending.promise.isSettled) {
					return;
				}

				const timeoutSeconds = Math.round(timeout / 100) / 10;
				
				// Enhanced error information for RPC timeouts
				const rpcMethod = (request as any)?.method || 'unknown';
				const rpcParams = (request as any)?.params || {};
				
				const errorMessage = `RPC timed out after ${timeoutSeconds} seconds`;
				const contextInfo = {
					method: rpcMethod,
					clientId: this._id,
					clientType: this._type,
					timeout: timeoutSeconds,
					params: rpcParams,
					request: request
				};
				
				console.error('🔌 RPC TIMEOUT DEBUG:', JSON.stringify({
					...contextInfo,
					message: errorMessage
				}, null, 2));
				
				// Create more informative error message
				const detailedError = new Error(`${errorMessage} - Method: ${rpcMethod}, Client: ${this._id} (${this._type})`);
				(detailedError as any).context = contextInfo;
				
				pending.error(detailedError);
				this.deletePendingRpc(messageId);
			}, timeout);
		}

		return pending.promise.p;
	}

	async performRpc<T>(request: Input, timeout: number, responseKeys: Array<string> = []): Promise<T> {
		return (await this.performRpcWithBuffers<T>(request, timeout, responseKeys)).data;
	}

	updatePendingRpcState(message: ILanguageRuntimeMessageState): void {
		if (this._pendingRpcs.has(message.parent_id)) {
			const pending = this._pendingRpcs.get(message.parent_id)!;
			switch (message.state) {
				case RuntimeOnlineState.Busy:
					pending.setStatus(PendingRpcStatus.Executing);
					break;
				case RuntimeOnlineState.Idle:
					pending.setStatus(PendingRpcStatus.Completed);
					break;
				case RuntimeOnlineState.Starting:
					break;
			}
		}
	}

	deletePendingRpc(messageId: string): void {
		this._pendingRpcs.delete(messageId);
		if (this._pendingRpcs.size <= 0) {
			this.setClientStatus(RuntimeClientStatus.Idle);
		}
	}

	sendMessage(message: any, buffers?: VSBuffer[]): void {
		const messageId = generateUuid();

		const payload = buffers && buffers.length > 0
			? new SerializableObjectWithBuffers({ data: message, buffers })
			: message;
		this._proxy.$sendClientMessage(this._handle, this._id, messageId, payload);

		this.messageCounter.set(this.messageCounter.get() + 1, undefined);
	}

	emitData(message: ILanguageRuntimeMessageCommData): void {
		this.messageCounter.set(this.messageCounter.get() + 1, undefined);

		if (message.parent_id && this._pendingRpcs.has(message.parent_id)) {
			const pending = this._pendingRpcs.get(message.parent_id)!;

			const responseKeys = Object.keys(message.data);


			if (pending.responseKeys.length === 0 || pending.responseKeys.some((key: string) => responseKeys.includes(key))) {
				pending.promise.complete(message);
				this.deletePendingRpc(message.parent_id);
			} else {
				this._dataEmitter.fire({ data: message.data as Output, buffers: message.buffers });
			}
		} else {
			this._dataEmitter.fire({ data: message.data as Output, buffers: message.buffers });
		}
	}

	setClientState(state: RuntimeClientState): void {
		this.clientState.set(state, undefined);
	}

	setClientStatus(status: RuntimeClientStatus): void {
		this.clientStatus.set(status, undefined);
	}

	onDidReceiveData: Event<IRuntimeClientOutput<Output>>;

	getClientId(): string {
		return this._id;
	}

	getClientType(): RuntimeClientType {
		return this._type;
	}

	public override dispose(): void {
		for (const [id, pending] of this._pendingRpcs) {
			pending.error(new Error('The language runtime exited before the RPC completed.'));
			this.deletePendingRpc(id);
		}

		if (this.clientState.get() !== RuntimeClientState.Closed) {
			if (this.clientState.get() === RuntimeClientState.Connected) {
				this.setClientState(RuntimeClientState.Closing);
				this._proxy.$removeClient(this._handle, this._id);
			}

			this.setClientState(RuntimeClientState.Closed);
		}

		super.dispose();
	}
}

@extHostNamedCustomer(MainErdosContext.MainThreadLanguageRuntime)
export class MainThreadLanguageRuntime
	implements MainThreadLanguageRuntimeShape, ILanguageRuntimeSessionManager, IRuntimeManager {

	private readonly _disposables = new DisposableStore();

	private readonly _proxy: ExtHostLanguageRuntimeShape;

	private readonly _sessions: Map<number, ExtHostLanguageRuntimeSessionAdapter> = new Map();

	private readonly _registeredRuntimes: Map<string, ILanguageRuntimeMetadata> = new Map();

	// Track execution IDs that originate from Quarto
	private readonly _quartoExecutionIds = new Set<string>();

	private static MAX_ID = 0;

	private readonly _id;

	constructor(
		extHostContext: IExtHostContext,
		@ILanguageRuntimeService private readonly _languageRuntimeService: ILanguageRuntimeService,
		@IRuntimeSessionService private readonly _runtimeSessionService: IRuntimeSessionService,
		@IRuntimeStartupService private readonly _runtimeStartupService: IRuntimeStartupService,
		@IRuntimeNotebookKernelService private readonly _runtimeNotebookKernelService: IRuntimeNotebookKernelService,
		@IErdosConsoleService private readonly _erdosConsoleService: IErdosConsoleService,


		@IErdosPlotsService private readonly _erdosPlotService: IErdosPlotsService,
		@IErdosIPyWidgetsService private readonly _erdosIPyWidgetsService: IErdosIPyWidgetsService,
		@IErdosWebviewPreloadService private readonly _erdosWebviewPreloadService: IErdosWebviewPreloadService,

		@INotificationService private readonly _notificationService: INotificationService,
		@ILogService private readonly _logService: ILogService,
		@ICommandService private readonly _commandService: ICommandService,
		@INotebookService private readonly _notebookService: INotebookService,
		@IEditorService private readonly _editorService: IEditorService,
		@IOpenerService private readonly _openerService: IOpenerService
	) {
		this._runtimeNotebookKernelService.initialize();
		this._erdosConsoleService.initialize();


		this._erdosPlotService.initialize();
		this._erdosIPyWidgetsService.initialize();
		this._erdosWebviewPreloadService.initialize();

		this._proxy = extHostContext.getProxy(ExtHostErdosContext.ExtHostLanguageRuntime);
		this._id = MainThreadLanguageRuntime.MAX_ID++;

		this._disposables.add(
			this._runtimeStartupService.registerRuntimeManager(this)
		);

		this._disposables.add(
			this._erdosConsoleService.onDidExecuteCode(
				(event) => {
					this._proxy.$notifyCodeExecuted(event);
				}
			));


		this._disposables.add(this._runtimeSessionService.registerSessionManager(this));

		// Register command for Quarto execution tracking
		CommandsRegistry.registerCommand('erdos.registerQuartoExecution', (accessor, executionId: string) => {
			this.registerQuartoExecution(executionId);
		});
	}

	get id() {
		return this._id;
	}

	async discoverAllRuntimes(disabledLanguageIds: string[]): Promise<void> {
		this._proxy.$discoverLanguageRuntimes(disabledLanguageIds);
	}

	async recommendWorkspaceRuntimes(disabledLanguageIds: string[]): Promise<ILanguageRuntimeMetadata[]> {
		return this._proxy.$recommendWorkspaceRuntimes(disabledLanguageIds);
	}

	$emitLanguageRuntimeMessage(handle: number, handled: boolean, message: SerializableObjectWithBuffers<ILanguageRuntimeMessage>): void {
		this.findSession(handle).handleRuntimeMessage(message.value, handled);
	}

	$emitLanguageRuntimeState(handle: number, clock: number, state: RuntimeState): void {
		this.findSession(handle).emitState(clock, state);
	}

	$emitLanguageRuntimeExit(handle: number, exit: ILanguageRuntimeExit): void {
		this.findSession(handle).emitExit(exit);
	}

	$registerLanguageRuntime(metadata: ILanguageRuntimeMetadata): void {
		this._registeredRuntimes.set(metadata.runtimeId, metadata);
		this._languageRuntimeService.registerRuntime(metadata);
	}

	$getPreferredRuntime(languageId: string): Promise<ILanguageRuntimeMetadata | undefined> {
		return Promise.resolve(this._runtimeStartupService.getPreferredRuntime(languageId));
	}

	$getActiveSessions(): Promise<IRuntimeSessionMetadata[]> {
		return Promise.resolve(
			this._runtimeSessionService.getActiveSessions().map(
				activeSession => activeSession.session.metadata));
	}

	$getForegroundSession(): Promise<string | undefined> {
		return Promise.resolve(this._runtimeSessionService.foregroundSession?.sessionId);
	}

	$getNotebookSession(notebookUri: URI): Promise<string | undefined> {
		const uri = URI.revive(notebookUri);

		const session = this._runtimeSessionService.getNotebookSessionForNotebookUri(uri);

		return Promise.resolve(session?.sessionId);
	}

	$selectLanguageRuntime(runtimeId: string): Promise<void> {
		return this._runtimeSessionService.selectRuntime(
			runtimeId,
			'Extension-requested runtime selection via Erdos API');
	}

	$getRegisteredRuntimes(): Promise<ILanguageRuntimeMetadata[]> {
		return Promise.resolve(Array.from(this._registeredRuntimes.values()));
	}

	async $startLanguageRuntime(
		runtimeId: string,
		sessionName: string,
		sessionMode: LanguageRuntimeSessionMode,
		notebookUri: URI | undefined): Promise<string> {
		const uri = URI.revive(notebookUri);

		const sessionId = await this._runtimeSessionService.startNewRuntimeSession(
			runtimeId,
			sessionName,
			sessionMode,
			uri,
			'Extension-requested runtime selection via Erdos API',
			RuntimeStartMode.Starting,
			true);

		return sessionId;
	}

	$restartSession(handle: number): Promise<void> {
		return this._runtimeSessionService.restartSession(
			this.findSession(handle).sessionId,
			'Extension-requested runtime restart via Erdos API');
	}

	$interruptSession(handle: number): Promise<void> {
		return this._runtimeSessionService.interruptSession(
			this.findSession(handle).sessionId);
	}

	$focusSession(handle: number): void {
		return this._runtimeSessionService.focusSession(
			this.findSession(handle).sessionId
		);
	}

	$completeLanguageRuntimeDiscovery(): void {
		this._runtimeStartupService.completeDiscovery(this._id);
		this._languageRuntimeService.setStartupPhase(RuntimeStartupPhase.Complete);
	}

	$unregisterLanguageRuntime(runtimeId: string): void {
		const runtime = this._registeredRuntimes.get(runtimeId);
		if (runtime) {
			this._languageRuntimeService.unregisterRuntime(runtimeId);
			this._registeredRuntimes.delete(runtimeId);
		}
	}

	$executeCode(languageId: string,
		code: string,
		extensionId: string,
		focus: boolean,
		allowIncomplete?: boolean,
		mode?: RuntimeCodeExecutionMode,
		errorBehavior?: RuntimeErrorBehavior,
		executionId?: string): Promise<string> {

		const attribution: IConsoleCodeAttribution = {
			source: CodeAttributionSource.Extension,
			metadata: {
				extensionId: extensionId,
			}
		};

		return this._erdosConsoleService.executeCode(
			languageId, code, attribution, focus, allowIncomplete, mode, errorBehavior, executionId);
	}

	/**
	 * Register an execution ID as originating from Quarto
	 */
	public registerQuartoExecution(executionId: string): void {
		this._quartoExecutionIds.add(executionId);
	}

	/**
	 * Check if an execution ID originated from Quarto
	 */
	public isQuartoExecution(executionId: string): boolean {
		return this._quartoExecutionIds.has(executionId);
	}

	$registerQuartoExecution(executionId: string): void {
		this.registerQuartoExecution(executionId);
	}

	public dispose(): void {
		this._sessions.forEach((session) => {
			if (session.getRuntimeState() !== RuntimeState.Exited) {
				session.markExited();
				const exit: ILanguageRuntimeExit = {
					runtime_name: session.runtimeMetadata.runtimeName,
					session_name: session.dynState.sessionName,
					exit_code: 0,
					reason: RuntimeExitReason.ExtensionHost,
					message: 'Extension host is shutting down'
				};
				session.emitExit(exit);
			}
		});

		this._disposables.dispose();
	}

	async managesRuntime(runtime: ILanguageRuntimeMetadata): Promise<boolean> {
		let manages = false;
		for (const registeredRuntime of this._registeredRuntimes.values()) {
			if (registeredRuntime.runtimeId === runtime.runtimeId) {
				manages = true;
				break;
			}
		}

		if (!manages) {
			manages = await this._proxy.$isHostForLanguageRuntime(runtime);
		}

		this._logService.debug(`[Ext host ${this._id}] Runtime manager for ` +
			`'${runtime.runtimeName}': ${manages}`);

		return manages;
	}

	async createSession(
		runtimeMetadata: ILanguageRuntimeMetadata,
		sessionMetadata: IRuntimeSessionMetadata):
		Promise<ILanguageRuntimeSession> {

		const initialState = await this._proxy.$createLanguageRuntimeSession(runtimeMetadata,
			sessionMetadata);
		const session = this.createSessionAdapter(initialState, runtimeMetadata, sessionMetadata);
		this._sessions.set(initialState.handle, session);
		return session;
	}

	async restoreSession(
		runtimeMetadata: ILanguageRuntimeMetadata,
		sessionMetadata: IRuntimeSessionMetadata,
		sessionName: string
	):
		Promise<ILanguageRuntimeSession> {

		const initialState = await this._proxy.$restoreLanguageRuntimeSession(runtimeMetadata,
			sessionMetadata, sessionName);
		const session = this.createSessionAdapter(initialState, runtimeMetadata, sessionMetadata);
		this._sessions.set(initialState.handle, session);
		return session;
	}

	async validateMetadata(metadata: ILanguageRuntimeMetadata): Promise<ILanguageRuntimeMetadata> {
		return this._proxy.$validateLanguageRuntimeMetadata(metadata);
	}

	async validateSession(metadata: ILanguageRuntimeMetadata, sessionId: string): Promise<boolean> {
		return this._proxy.$validateLanguageRuntimeSession(metadata, sessionId);
	}

	private createSessionAdapter(
		initialState: RuntimeInitialState,
		runtimeMetadata: ILanguageRuntimeMetadata,
		sessionMetadata: IRuntimeSessionMetadata): ExtHostLanguageRuntimeSessionAdapter {

		return new ExtHostLanguageRuntimeSessionAdapter(initialState,
			runtimeMetadata,
			sessionMetadata,
			this._runtimeSessionService,
			this._notificationService,
			this._logService,
			this._commandService,
			this._notebookService,
			this._editorService,
			this._proxy,
			this._openerService,
			this);
	}

	private findSession(handle: number): ExtHostLanguageRuntimeSessionAdapter {
		const session = this._sessions.get(handle);
		if (!session) {
			throw new Error(`Unknown language runtime session handle: ${handle}`);
		}
		return session;
	}
}

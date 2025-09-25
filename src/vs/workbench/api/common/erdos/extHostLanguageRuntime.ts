/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as erdos from 'erdos';
import { debounce } from '../../../../base/common/decorators.js';
import { ILanguageRuntimeMessage, ILanguageRuntimeMessageCommClosed, ILanguageRuntimeMessageCommData, ILanguageRuntimeMessageCommOpen, ILanguageRuntimeMessageStream, ILanguageRuntimeMessageOutput, ILanguageRuntimeMessageState, ILanguageRuntimeMetadata, LanguageRuntimeSessionMode, RuntimeCodeExecutionMode, RuntimeCodeFragmentStatus, RuntimeErrorBehavior, RuntimeState, ILanguageRuntimeMessageResult, ILanguageRuntimeMessageError, RuntimeOnlineState, LanguageRuntimeMessageType } from '../../../services/languageRuntime/common/languageRuntimeService.js';
import * as extHostProtocol from './extHost.erdos.protocol.js';
import { Emitter } from '../../../../base/common/event.js';
import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { Disposable } from '../extHostTypes.js';
import { RuntimeClientState, RuntimeClientType } from './extHostTypes.erdos.js';
import { ExtHostRuntimeClientInstance } from './extHostClientInstance.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../../platform/extensions/common/extensions.js';
import { URI } from '../../../../base/common/uri.js';
import { DeferredPromise } from '../../../../base/common/async.js';
import { IRuntimeSessionMetadata } from '../../../services/runtimeSession/common/runtimeSessionService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { SerializableObjectWithBuffers } from '../../../services/extensions/common/proxyIdentifier.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';

import { ILanguageRuntimeCodeExecutedEvent } from '../../../services/erdosConsole/common/erdosConsoleCodeExecution.js';

interface IExecutionObserver {
	token?: CancellationToken;
	onStarted?: () => void;
	onOutput?: (message: string) => void;
	onError?: (message: string) => void;
	onPlot?: (plotData: string) => void;
	onData?: (data: any) => void;
	onCompleted?: (result: any) => void;
	onFailed?: (error: Error) => void;
	onFinished?: () => void;
}

class ExecutionObserver implements IDisposable {

	public readonly promise: DeferredPromise<Record<string, any>>;
	public readonly store: DisposableStore = new DisposableStore();
	public state: 'pending' | 'running' | 'completed';
	public sessionId: string | undefined;

	constructor(public readonly observer: IExecutionObserver | undefined) {
		this.state = 'pending';
		this.promise = new DeferredPromise<Record<string, any>>();
	}

	onOutputMessage(message: ILanguageRuntimeMessageOutput) {
		if (this.observer && message.data) {
			const imageMimeTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'] as const;
			for (const mimeType of imageMimeTypes) {
				if (message.data[mimeType] && this.observer.onPlot) {
					this.observer.onPlot(message.data[mimeType]);
				}
			}
			if (message.data['text/plain'] && this.observer.onOutput) {
				this.observer.onOutput(message.data['text/plain']);
			}
		}
	}

	onStateMessage(message: ILanguageRuntimeMessageState) {
		if (message.state === RuntimeOnlineState.Busy) {
			this.onStarted();
		}

		if (message.state === RuntimeOnlineState.Idle) {
			this.onFinished();
		}
	}

	onStreamMessage(message: ILanguageRuntimeMessageStream) {
		if (this.observer) {
			if (message.name === 'stdout' && this.observer.onOutput) {
				this.observer.onOutput(message.text);
			} else if (message.name === 'stderr' && this.observer.onError) {
				this.observer.onError(message.text);
			}
		}
	}

	onStarted() {
		this.state = 'running';
		if (this.observer?.onStarted) {
			this.observer.onStarted();
		}
	}

	onFinished() {
		this.state = 'completed';
		if (this.observer?.onFinished) {
			this.observer.onFinished();
		}
		if (!this.promise.isSettled) {
			this.promise.complete({});
		}
	}

	onErrorMessage(message: ILanguageRuntimeMessageError) {
		const err: Error = {
			message: message.message,
			name: message.name,
			stack: message.traceback?.join('\n'),
		};
		this.onFailed(err);
	}

	onFailed(error: Error) {
		this.state = 'completed';
		if (this.observer?.onFailed) {
			this.observer.onFailed(error);
		}
		this.promise.error(error);
	}

	onCompleted(result: Record<string, any>) {
		this.state = 'completed';
		if (this.observer?.onCompleted) {
			this.observer.onCompleted(result);
		}
		this.promise.complete(result);
	}

	dispose(): void {
		this.store.dispose();
	}
}

interface LanguageRuntimeManager {
	languageId: string;
	manager: erdos.LanguageRuntimeManager;
	extension: IExtensionDescription;
}

export class ExtHostLanguageRuntime implements extHostProtocol.ExtHostLanguageRuntimeShape {

	private readonly _proxy: extHostProtocol.MainThreadLanguageRuntimeShape;

	private readonly _runtimeManagersByRuntimeId = new Map<string, LanguageRuntimeManager>();
	private readonly _runtimeManagers = new Array<LanguageRuntimeManager>();
	private readonly _pendingRuntimeManagers = new Map<string, DeferredPromise<LanguageRuntimeManager>>();
	private readonly _runtimeSessions = new Array<erdos.LanguageRuntimeSession>();
	private readonly _clientInstances = new Array<ExtHostRuntimeClientInstance>();
	private readonly _clientHandlers = new Array<erdos.RuntimeClientHandler>();
	private readonly _registeredClientIds = new Set<string>();

	private _eventClocks = new Array<number>();
	private _runtimeDiscoveryComplete = false;

	private readonly _onDidRegisterRuntimeEmitter = new Emitter<erdos.LanguageRuntimeMetadata>;
	public onDidRegisterRuntime = this._onDidRegisterRuntimeEmitter.event;

	private readonly _onDidChangeForegroundSessionEmitter = new Emitter<string | undefined>;
	public onDidChangeForegroundSession = this._onDidChangeForegroundSessionEmitter.event;

	private readonly _onDidExecuteCodeEmitter = new Emitter<erdos.CodeExecutionEvent>();
	public onDidExecuteCode = this._onDidExecuteCodeEmitter.event;

	private _executionObservers = new Map<string, ExecutionObserver>();

	constructor(
		mainContext: extHostProtocol.IMainErdosContext,
		private readonly _logService: ILogService,
	) {
		this._proxy = mainContext.getProxy(extHostProtocol.MainErdosContext.MainThreadLanguageRuntime);
	}

	async $createLanguageRuntimeSession(
		runtimeMetadata: ILanguageRuntimeMetadata,
		sessionMetadata: IRuntimeSessionMetadata): Promise<extHostProtocol.RuntimeInitialState> {
		const sessionManager = await this.runtimeManagerForRuntime(runtimeMetadata, true);

		if (sessionMetadata.notebookUri) {
			sessionMetadata = {
				...sessionMetadata,
				notebookUri: URI.revive(sessionMetadata.notebookUri)
			};
		}
		if (sessionManager) {
			const session =
				await sessionManager.manager.createSession(runtimeMetadata, sessionMetadata);
			const handle = this.attachToSession(session);
			const initalState = {
				handle,
				dynState: session.dynState
			};
			return initalState;
		} else {
			throw new Error(
				`No session manager found for language ID '${runtimeMetadata.languageId}'.`);
		}
	}

	async $isHostForLanguageRuntime(runtimeMetadata: ILanguageRuntimeMetadata): Promise<boolean> {
		if (this._runtimeManagers.length === 0) {
			return false;
		}
		const sessionManager =
			await this.runtimeManagerForRuntime(runtimeMetadata, false);
		return !!sessionManager;
	}

	async $validateLanguageRuntimeMetadata(metadata: ILanguageRuntimeMetadata):
		Promise<ILanguageRuntimeMetadata> {
		const m = await this.runtimeManagerForRuntime(metadata, true);
		if (m) {
			if (m.manager.validateMetadata) {
				const result = await m.manager.validateMetadata(metadata);
				return {
					...result,
					extensionId: metadata.extensionId
				};
			} else {
				return metadata;
			}
		} else {
			throw new Error(
				`No manager available for language ID '${metadata.languageId}' ` +
				`(expected from extension ${metadata.extensionId.value})`);
		}
	}

	async $validateLanguageRuntimeSession(metadata: ILanguageRuntimeMetadata,
		sessionId: string): Promise<boolean> {

		const m = await this.runtimeManagerForRuntime(metadata, true);
		if (m) {
			if (m.manager.validateSession) {
				const result = await m.manager.validateSession(sessionId);
				return result;
			} else {
				return false;
			}
		} else {
			throw new Error(
				`No manager available for language ID '${metadata.languageId}' ` +
				`(expected from extension ${metadata.extensionId.value})`);
		}
	}

	async $restoreLanguageRuntimeSession(
		runtimeMetadata: ILanguageRuntimeMetadata,
		sessionMetadata: IRuntimeSessionMetadata,
		sessionName: string): Promise<extHostProtocol.RuntimeInitialState> {
		const sessionManager = await this.runtimeManagerForRuntime(runtimeMetadata, true);
		if (sessionManager) {
			if (sessionManager.manager.restoreSession) {
				const session =
					await sessionManager.manager.restoreSession(runtimeMetadata, sessionMetadata, sessionName);
				const handle = this.attachToSession(session);
				const initalState = {
					handle,
					dynState: session.dynState
				};
				return initalState;
			} else {
				throw new Error(
					`Session manager for session ID '${sessionMetadata.sessionId}'. ` +
					`does not support session restoration.`);
			}
		} else {
			throw new Error(
				`No session manager found for language ID '${runtimeMetadata.languageId}'.`);
		}
	}

	private async runtimeManagerForRuntime(metadata: ILanguageRuntimeMetadata, wait: boolean): Promise<LanguageRuntimeManager | undefined> {
		const managerById = this._runtimeManagersByRuntimeId.get(metadata.runtimeId);
		if (managerById) {
			return managerById;
		}

		const managerByExt = this._runtimeManagers.find(manager =>
			manager.extension.id === metadata.extensionId.value);
		if (managerByExt) {
			return managerByExt;
		}

		if (!wait) {
			return undefined;
		}

		const pending = this._pendingRuntimeManagers.get(
			ExtensionIdentifier.toKey(metadata.extensionId));
		if (pending) {
			return pending.p;
		}

		const deferred = new DeferredPromise<LanguageRuntimeManager>();
		this._pendingRuntimeManagers.set(ExtensionIdentifier.toKey(metadata.extensionId), deferred);

		setTimeout(() => {
			if (!deferred.isSettled) {
				deferred.error(new Error(
					`Timed out after 10 seconds waiting for runtime manager for runtime ` +
					`'${metadata.runtimeName}' (${metadata.runtimeId}) to be registered.`));
			}
		}, 10000);

		return deferred.p;
	}

	private attachToSession(session: erdos.LanguageRuntimeSession): number {
		session.onDidChangeRuntimeState(state => {
			const tick = this._eventClocks[handle] = this._eventClocks[handle] + 1;
			this._proxy.$emitLanguageRuntimeState(handle, tick, state);

			if (state === RuntimeState.Exited) {
				this._executionObservers.forEach((observer, id) => {
					if (observer.sessionId === session.metadata.sessionId) {
						if (!observer.promise.isSettled) {
							observer.onFailed({
								message: 'The session exited unexpectedly.',
								name: 'Interrupted',
							});
						}
						observer.dispose();
						this._executionObservers.delete(id);
					}
				});
			}
		});

		session.onDidReceiveRuntimeMessage(message => {
			const tick = this._eventClocks[handle] = this._eventClocks[handle] + 1;
			const runtimeMessage: ILanguageRuntimeMessage = {
				event_clock: tick,
				...message,
				buffers: message.buffers?.map(buffer => VSBuffer.wrap(buffer)),
			};

			if (message.parent_id && this._executionObservers.has(message.parent_id)) {
				const observer = this._executionObservers.get(message.parent_id);

				if (observer) {
					this.handleObserverMessage(runtimeMessage, observer);
				}
			}

			switch (message.type) {
				case LanguageRuntimeMessageType.CommOpen:
					this.handleCommOpen(handle, runtimeMessage as ILanguageRuntimeMessageCommOpen);
					break;

				case LanguageRuntimeMessageType.CommData:
					this.handleCommData(handle, runtimeMessage as ILanguageRuntimeMessageCommData);
					break;

				case LanguageRuntimeMessageType.CommClosed:
					this.handleCommClosed(handle, runtimeMessage as ILanguageRuntimeMessageCommClosed);
					break;

				default:
					this._proxy.$emitLanguageRuntimeMessage(handle, false, new SerializableObjectWithBuffers(runtimeMessage));
					break;
			}
		});

		session.onDidEndSession(exit => {
			this._proxy.$emitLanguageRuntimeExit(handle, exit);
		});

		const handle = this._runtimeSessions.length;
		this._runtimeSessions.push(session);
		this._eventClocks.push(0);

		return handle;
	}

	async $interruptLanguageRuntime(handle: number): Promise<void> {
		if (handle >= this._runtimeSessions.length) {
			throw new Error(`Cannot interrupt runtime: session handle '${handle}' not found or no longer valid.`);
		}
		const session = this._runtimeSessions[handle];
		try {
			return session.interrupt();
		} finally {
			this._executionObservers.forEach((observer, id) => {
				if (observer.sessionId === session.metadata.sessionId) {
					if (!observer.promise.isSettled) {
						observer.onFailed({
							message: 'The user interrupted the code execution.',
							name: 'Interrupted',
						});
					}
					observer.dispose();
					this._executionObservers.delete(id);
				}
			});
		}
	}

	async $shutdownLanguageRuntime(handle: number, exitReason: erdos.RuntimeExitReason): Promise<void> {
		if (handle >= this._runtimeSessions.length) {
			throw new Error(`Cannot shut down runtime: session handle '${handle}' not found or no longer valid.`);
		}
		return this._runtimeSessions[handle].shutdown(exitReason);
	}

	async $forceQuitLanguageRuntime(handle: number): Promise<void> {
		if (handle >= this._runtimeSessions.length) {
			throw new Error(`Cannot force quit runtime: session handle '${handle}' not found or no longer valid.`);
		}
		return this._runtimeSessions[handle].forceQuit();
	}

	async $restartSession(handle: number, workingDirectory?: string): Promise<void> {
		if (handle >= this._runtimeSessions.length) {
			throw new Error(`Cannot restart runtime: session handle '${handle}' not found or no longer valid.`);
		}
		return this._runtimeSessions[handle].restart(workingDirectory);
	}

	async $startLanguageRuntime(handle: number): Promise<erdos.LanguageRuntimeInfo> {
		if (handle >= this._runtimeSessions.length) {
			throw new Error(`Cannot restart runtime: session handle '${handle}' not found or no longer valid.`);
		}
		return this._runtimeSessions[handle].start();
	}

	async $disposeLanguageRuntime(handle: number): Promise<void> {
		if (handle >= this._runtimeSessions.length) {
			throw new Error(`Cannot cleanup runtime: session handle '${handle}' not found or no longer valid.`);
		}
		await this._runtimeSessions[handle].dispose();
	}

	$showOutputLanguageRuntime(handle: number, channel?: erdos.LanguageRuntimeSessionChannel): void {
		if (handle >= this._runtimeSessions.length) {
			throw new Error(`Cannot show output for runtime: language runtime session handle '${handle}' not found or no longer valid.`);
		}
		if (!this._runtimeSessions[handle].showOutput) {
			throw new Error(`Cannot show output for runtime: language runtime session handle '${handle}' does not implement logging.`);
		}
		return this._runtimeSessions[handle].showOutput(channel);
	}

	async $listOutputChannelsLanguageRuntime(handle: number): Promise<erdos.LanguageRuntimeSessionChannel[]> {
		if (handle >= this._runtimeSessions.length) {
			throw new Error(`Cannot list output channels for runtime: language runtime session handle '${handle}' not found or no longer valid.`);
		}
		if (!this._runtimeSessions[handle].listOutputChannels) {
			throw new Error(`Cannot list output channels for runtime: language runtime session handle '${handle}'`);
		}
		return this._runtimeSessions[handle].listOutputChannels();
	}

	$updateSessionNameLanguageRuntime(handle: number, sessionName: string): void {
		if (handle >= this._runtimeSessions.length) {
			throw new Error(`Cannot update session name for runtime: language runtime session handle '${handle}' not found or no longer valid.`);
		}
		this._runtimeSessions[handle].updateSessionName(sessionName);
	}

	$showProfileLanguageRuntime(handle: number): Thenable<void> {
		if (handle >= this._runtimeSessions.length) {
			throw new Error(`Cannot show profile for runtime: language runtime session handle '${handle}' not found or no longer valid.`);
		}
		if (!this._runtimeSessions[handle].showProfile) {
			throw new Error(`Cannot show profile for runtime: language runtime session handle '${handle}' does not implement profiling.`);
		}
		return this._runtimeSessions[handle].showProfile!();
	}

	$openResource(handle: number, resource: URI | string): Promise<boolean> {
		if (handle >= this._runtimeSessions.length) {
			throw new Error(`Cannot open resource: session handle '${handle}' not found or no longer valid.`);
		}
		if (!this._runtimeSessions[handle].openResource) {
			return Promise.resolve(false);
		}
		return Promise.resolve(this._runtimeSessions[handle].openResource!(resource));
	}

	$executeCode(handle: number, code: string, id: string, mode: RuntimeCodeExecutionMode, errorBehavior: RuntimeErrorBehavior, executionId?: string): void {
		if (handle >= this._runtimeSessions.length) {
			throw new Error(`Cannot execute code: session handle '${handle}' not found or no longer valid.`);
		}
		this._runtimeSessions[handle].execute(code, id, mode, errorBehavior);
	}

	$isCodeFragmentComplete(handle: number, code: string): Promise<RuntimeCodeFragmentStatus> {
		if (handle >= this._runtimeSessions.length) {
			throw new Error(`Cannot test code completeness: session handle '${handle}' not found or no longer valid.`);
		}
		return Promise.resolve(this._runtimeSessions[handle].isCodeFragmentComplete(code));
	}

	$createClient(handle: number, id: string, type: RuntimeClientType, params: any, metadata?: any): Promise<void> {
		if (handle >= this._runtimeSessions.length) {
			throw new Error(`Cannot create '${type}' client: session handle '${handle}' not found or no longer valid.`);
		}
		return Promise.resolve(this._runtimeSessions[handle].createClient(id, type, params, metadata));
	}

	$listClients(handle: number, type?: RuntimeClientType): Promise<Record<string, string>> {
		if (handle >= this._runtimeSessions.length) {
			throw new Error(`Cannot list clients: session handle '${handle}' not found or no longer valid.`);
		}
		return Promise.resolve(this._runtimeSessions[handle].listClients(type));
	}

	$removeClient(handle: number, id: string): void {
		if (handle >= this._runtimeSessions.length) {
			throw new Error(`Cannot remove client: session handle '${handle}' not found or no longer valid.`);
		}
		this._runtimeSessions[handle].removeClient(id);
	}

	$sendClientMessage(handle: number, client_id: string, message_id: string, message: any): void {
		if (handle >= this._runtimeSessions.length) {
			throw new Error(`Cannot send message to client: session handle '${handle}' not found or no longer valid.`);
		}
		this._runtimeSessions[handle].sendClientMessage(client_id, message_id, message);
	}

	$replyToPrompt(handle: number, id: string, response: string): void {
		if (handle >= this._runtimeSessions.length) {
			throw new Error(`Cannot reply to prompt: session handle '${handle}' not found or no longer valid.`);
		}
		this._runtimeSessions[handle].replyToPrompt(id, response);
	}

	$setWorkingDirectory(handle: number, dir: string): Promise<void> {
		if (handle >= this._runtimeSessions.length) {
			throw new Error(`Cannot set working directory: session handle '${handle}' not found or no longer valid.`);
		}
		return new Promise((resolve, reject) => {
			this._runtimeSessions[handle].setWorkingDirectory(dir).then(
				() => {
					resolve();
				},
				(err) => {
					reject(err);
				});
		});
	}

	public async $recommendWorkspaceRuntimes(disabledLanguageIds: string[]): Promise<ILanguageRuntimeMetadata[]> {
		const metadata = await Promise.all(
			this._runtimeManagers.filter(m => {
				return !disabledLanguageIds.includes(m.languageId);
			}
			).map(async m => {
				const recommended = await m.manager.recommendedWorkspaceRuntime();
				if (recommended) {
					return {
						extensionId: m.extension.identifier,
						...recommended
					};
				}
				return undefined;
			})
		);

		return metadata.filter(metadata => metadata !== undefined) as ILanguageRuntimeMetadata[];
	}

	public async $discoverLanguageRuntimes(disabledLanguageIds: string[]): Promise<void> {
		let start = 0;
		let end = this._runtimeManagers.length;

		while (start !== end) {
			const managers = this._runtimeManagers.slice(start, end);
			try {
				await this.discoverLanguageRuntimes(managers, disabledLanguageIds);
			} catch (err) {
				console.error(err);
			}

			start = end;
			end = this._runtimeManagers.length;
		}

		this._runtimeDiscoveryComplete = true;
		this._proxy.$completeLanguageRuntimeDiscovery();
	}

	@debounce(1000)
	public async $notifyForegroundSessionChanged(sessionId: string | undefined): Promise<void> {
		const session = this._runtimeSessions.find(session => session.metadata.sessionId === sessionId);
		if (!session && sessionId) {
			throw new Error(`Session ID '${sessionId}' was marked as the foreground session, but is not known to the extension host.`);
		}
		this._onDidChangeForegroundSessionEmitter.fire(sessionId);
	}

	public async $notifyCodeExecuted(event: ILanguageRuntimeCodeExecutedEvent): Promise<void> {
		const attribution: erdos.CodeAttribution = {
			metadata: event.attribution.metadata,
			source: event.attribution.source as unknown as erdos.CodeAttributionSource,
		};

		const evt: erdos.CodeExecutionEvent = {
			languageId: event.languageId,
			code: event.code,
			attribution,
			runtimeName: event.runtimeName,
		};

		this._onDidExecuteCodeEmitter.fire(evt);
	}

	private async discoverLanguageRuntimes(managers: Array<LanguageRuntimeManager>, disabledLanguageIds: string[]): Promise<void> {

		const never: Promise<never> = new Promise(() => { });

		interface Discoverer {
			extension: IExtensionDescription;
			manager: erdos.LanguageRuntimeManager;
			discoverer: AsyncGenerator<erdos.LanguageRuntimeMetadata, void, unknown>;
		}

		const discoverers: Array<Discoverer> = managers.map(manager => ({
			extension: manager.extension,
			manager: manager.manager,
			languageId: manager.languageId,
			discoverer: manager.manager.discoverAllRuntimes()
		})).filter(discoverer =>
			!disabledLanguageIds.includes(discoverer.languageId)
		);

		let count = discoverers.length;

		if (count === 0) {
			return;
		}

		const getNext =
			async (asyncGen: Discoverer, index: number) => {
				try {
					const result = await asyncGen.discoverer.next();
					return ({
						index,
						extension: asyncGen.extension,
						manager: asyncGen.manager,
						result
					});
				} catch (err) {
					console.error(`Language runtime provider threw an error during registration: ` +
						`${err}`);
					return {
						index,
						extension: asyncGen.extension,
						manager: asyncGen.manager,
						result: { value: undefined, done: true }
					};
				}
			};

		const nextPromises = discoverers.map(getNext);

		try {
			while (count) {
				const { index, extension, manager, result } = await Promise.race(nextPromises);
				if (result.done) {
					nextPromises[index] = never;
					count--;
				} else if (result.value !== undefined) {
					nextPromises[index] = getNext(discoverers[index], index);
					try {
						this.registerLanguageRuntime(extension, manager, result.value);
					} catch (err) {
						console.error(`Error registering language runtime ` +
							`${result.value.runtimeName}: ${err}`);
					}
				}
			}
		} catch (err) {
			console.error(`Halting language runtime registration: ${err}`);
		} finally {
			for (const [index, iterator] of discoverers.entries()) {
				if (nextPromises[index] !== never && iterator.discoverer.return !== null) {
					void iterator.discoverer.return(undefined);
				}
			}
		}
	}

	public registerClientHandler(handler: erdos.RuntimeClientHandler): IDisposable {
		this._clientHandlers.push(handler);
		return new Disposable(() => {
			const index = this._clientHandlers.indexOf(handler);
			if (index >= 0) {
				this._clientHandlers.splice(index, 1);
			}
		});
	}

	public registerClientInstance(clientInstanceId: string): IDisposable {
		this._registeredClientIds.add(clientInstanceId);
		return new Disposable(() => {
			this._registeredClientIds.delete(clientInstanceId);
		});
	}

	public getRegisteredRuntimes(): Promise<erdos.LanguageRuntimeMetadata[]> {
		return this._proxy.$getRegisteredRuntimes();
	}

	public async getPreferredRuntime(languageId: string): Promise<erdos.LanguageRuntimeMetadata | undefined> {
		return this._proxy.$getPreferredRuntime(languageId);
	}

	public async getActiveSessions(): Promise<erdos.LanguageRuntimeSession[]> {
		const sessionMetadatas = await this._proxy.$getActiveSessions();
		const sessions: erdos.LanguageRuntimeSession[] = [];
		for (const sessionMetadata of sessionMetadatas) {
			const session = this._runtimeSessions.find(session => session.metadata.sessionId === sessionMetadata.sessionId);
			if (!session) {
				throw new Error(`Session ID '${sessionMetadata.sessionId}' was returned as an active session, but is not known to the extension host.`);
			}
			sessions.push(session);
		}
		return sessions;
	}

	public async getForegroundSession(): Promise<erdos.LanguageRuntimeSession | undefined> {
		const sessionId = await this._proxy.$getForegroundSession();
		if (!sessionId) {
			return;
		}
		const session = this._runtimeSessions.find(session => session.metadata.sessionId === sessionId);
		if (!session) {
			throw new Error(`Session ID '${sessionId}' was marked as the foreground session, but is not known to the extension host.`);
		}
		return session;
	}

	public async getNotebookSession(notebookUri: URI): Promise<erdos.LanguageRuntimeSession | undefined> {
		const sessionId = await this._proxy.$getNotebookSession(notebookUri);
		if (!sessionId) {
			return;
		}
		const session = this._runtimeSessions.find(session => session.metadata.sessionId === sessionId);
		if (!session) {
			throw new Error(`Session ID '${sessionId}' exists for notebook '${notebookUri.toString()}', but is not known to the extension host.`);
		}
		return session;
	}

	public registerLanguageRuntimeManager(
		extension: IExtensionDescription,
		languageId: string,
		manager: erdos.LanguageRuntimeManager): IDisposable {

		const disposables = new DisposableStore();

		const pending = this._pendingRuntimeManagers.get(ExtensionIdentifier.toKey(extension.identifier));
		if (pending) {
			pending.complete({ manager, languageId, extension });
			this._pendingRuntimeManagers.delete(ExtensionIdentifier.toKey(extension.identifier));
		}

		if (this._runtimeDiscoveryComplete) {
			void (async () => {
				const discoverer = manager.discoverAllRuntimes();
				for await (const runtime of discoverer) {
					disposables.add(this.registerLanguageRuntime(extension, manager, runtime));
				}
			})();
		}

		if (manager.onDidDiscoverRuntime) {
			disposables.add(manager.onDidDiscoverRuntime(runtime => {
				this.registerLanguageRuntime(extension, manager, runtime);
			}));
		}

		this._runtimeManagers.push({ manager, languageId, extension });

		return new Disposable(() => {
			disposables.dispose();

			this._runtimeManagersByRuntimeId.forEach((value, key) => {
				if (value.manager === manager) {
					this._proxy.$unregisterLanguageRuntime(key);
					this._runtimeManagersByRuntimeId.delete(key);
				}
			});

			const index = this._runtimeManagers.findIndex(m => m.manager === manager);
			if (index >= 0) {
				this._runtimeManagers.splice(index, 1);
			}
		});
	}

	public registerLanguageRuntime(
		extension: IExtensionDescription,
		manager: erdos.LanguageRuntimeManager,
		runtime: erdos.LanguageRuntimeMetadata): IDisposable {

		this._proxy.$registerLanguageRuntime({
			extensionId: extension.identifier,
			...runtime
		});
		this._onDidRegisterRuntimeEmitter.fire(runtime);

		this._runtimeManagersByRuntimeId.set(runtime.runtimeId, { manager, languageId: runtime.languageId, extension });

		return new Disposable(() => {
			this._proxy.$unregisterLanguageRuntime(runtime.runtimeId);
		});
	}

	public executeCode(
		languageId: string,
		code: string,
		extensionId: string,
		focus: boolean,
		allowIncomplete?: boolean,
		mode?: RuntimeCodeExecutionMode,
		errorBehavior?: RuntimeErrorBehavior,
		observer?: IExecutionObserver,
		executionId?: string): Promise<Record<string, any>> {

		const finalExecutionId = executionId || generateUuid();
		const executionObserver = new ExecutionObserver(observer);
		this._executionObservers.set(finalExecutionId, executionObserver);

		this._proxy.$executeCode(
			languageId, code, extensionId, focus, allowIncomplete, mode, errorBehavior, finalExecutionId).then(
				(sessionId) => {
					executionObserver.sessionId = sessionId;

					if (!observer?.token) {
						return;
					}
					const token = observer.token;
					executionObserver.store.add(
						token.onCancellationRequested(async () => {
							if (executionObserver.state === 'pending') {
								this._logService.warn(
									`Cannot interrupt execution of ${code}: ` +
									`it has not yet started.`);
							}

							if (executionObserver.state === 'running') {
								await this.interruptSession(sessionId);
							}
						}));
				}).catch((err) => {
					executionObserver.promise.error(err);
				});

		return executionObserver.promise.p;
	}

	public selectLanguageRuntime(runtimeId: string): Promise<void> {
		return this._proxy.$selectLanguageRuntime(runtimeId);
	}

	public registerQuartoExecution(executionId: string): void {
		this._proxy.$registerQuartoExecution(executionId);
	}

	public async startLanguageRuntime(runtimeId: string,
		sessionName: string,
		sessionMode: LanguageRuntimeSessionMode,
		notebookUri: URI | undefined): Promise<erdos.LanguageRuntimeSession> {

		const sessionId =
			await this._proxy.$startLanguageRuntime(runtimeId, sessionName, sessionMode, notebookUri);

		const session = this._runtimeSessions.find(
			session => session.metadata.sessionId === sessionId);
		if (!session) {
			throw new Error(`Session ID '${sessionId}' not found.`);
		}
		return session;
	}

	public restartSession(sessionId: string): Promise<void> {
		for (let i = 0; i < this._runtimeSessions.length; i++) {
			if (this._runtimeSessions[i].metadata.sessionId === sessionId) {
				return this._proxy.$restartSession(i);
			}
		}
		return Promise.reject(
			new Error(`Session with ID '${sessionId}' must be started before ` +
				`it can be restarted.`));
	}

	public focusSession(sessionId: string): void {
		for (let i = 0; i < this._runtimeSessions.length; i++) {
			if (this._runtimeSessions[i].metadata.sessionId === sessionId) {
				return this._proxy.$focusSession(i);
			}
		}
		throw new Error(`Session with ID '${sessionId}' must be started before ` +
			`it can be focused.`);
	}

	interruptSession(sessionId: string): Promise<void> {
		for (let i = 0; i < this._runtimeSessions.length; i++) {
			if (this._runtimeSessions[i].metadata.sessionId === sessionId) {
				return this._proxy.$interruptSession(i);
			}
		}
		return Promise.reject(
			new Error(`Session with ID '${sessionId}' must be started before ` +
				`it can be interrupted.`));
	}

	private handleCommOpen(handle: number, message: ILanguageRuntimeMessageCommOpen): void {
		const clientInstance = new ExtHostRuntimeClientInstance(message,
			(id, data) => {
				this._runtimeSessions[handle].sendClientMessage(message.comm_id, id, data);
			},
			() => {
				this._runtimeSessions[handle].removeClient(message.comm_id);
			});

		this._runtimeSessions[handle].onDidChangeRuntimeState(state => {
			if (state === RuntimeState.Exited) {
				clientInstance.setClientState(RuntimeClientState.Closed);
				clientInstance.dispose();
			}
		});

		let handled = false;
		for (const handler of this._clientHandlers) {
			if (message.target_name === handler.clientType) {
				if (handler.callback(clientInstance, message.data)) {
					this._clientInstances.push(clientInstance);
					handled = true;
				}
			}
		}

		this._proxy.$emitLanguageRuntimeMessage(handle, handled, new SerializableObjectWithBuffers(message));
	}

	private handleCommData(handle: number, message: ILanguageRuntimeMessageCommData): void {
		const clientInstance = this._clientInstances.find(instance =>
			instance.getClientId() === message.comm_id);
		let handled = false;
		if (clientInstance) {
			clientInstance.emitMessage(message);
			handled = true;
		}

		if (!handled && this._registeredClientIds.has(message.comm_id)) {
			handled = true;
		}

		this._proxy.$emitLanguageRuntimeMessage(handle, handled, new SerializableObjectWithBuffers(message));
	}

	private handleCommClosed(handle: number, message: ILanguageRuntimeMessageCommClosed): void {
		const idx = this._clientInstances.findIndex(instance =>
			instance.getClientId() === message.comm_id);
		let handled = false;
		if (idx >= 0) {
			const clientInstance = this._clientInstances[idx];
			clientInstance.dispose();
			this._clientInstances.splice(idx, 1);
			handled = true;
		}

		this._proxy.$emitLanguageRuntimeMessage(handle, handled, new SerializableObjectWithBuffers(message));
	}

	private handleObserverMessage(message: ILanguageRuntimeMessage, o: ExecutionObserver): void {
		switch (message.type) {
			case LanguageRuntimeMessageType.Stream:
				o.onStreamMessage(message as ILanguageRuntimeMessageStream);
				break;

			case LanguageRuntimeMessageType.Output:
				o.onOutputMessage(message as ILanguageRuntimeMessageOutput);
				break;

			case LanguageRuntimeMessageType.State:
				o.onStateMessage(message as ILanguageRuntimeMessageState);
				break;

			case LanguageRuntimeMessageType.Result:
				o.onCompleted((message as ILanguageRuntimeMessageResult).data);
				break;

			case LanguageRuntimeMessageType.Error:
				o.onErrorMessage(message as ILanguageRuntimeMessageError);
				break;
		}

		if (message.type === LanguageRuntimeMessageType.State) {
			const stateMessage = message as ILanguageRuntimeMessageState;
			if (stateMessage.state === RuntimeOnlineState.Idle) {
				const executionId = message.parent_id;
				if (executionId) {
					o.dispose();
					this._executionObservers.delete(executionId);
				}
			}
		}
	}
}
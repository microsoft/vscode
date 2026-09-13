/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationError } from '../../../base/common/errors.js';
import { asPromise, DeferredPromise, disposableTimeout, raceCancellationError, SequencerByKey } from '../../../base/common/async.js';
import { CancellationTokenSource } from '../../../base/common/cancellation.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable, type IDisposable } from '../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../base/common/map.js';
import { equals } from '../../../base/common/objects.js';
import { isEqual } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { AgentSession, type IAgent } from '../common/agent.js';
import { isAgentHostCanvasJson, readAgentHostCanvasState, unsupportedAgentHostCanvasState, withAgentHostCanvasState, withoutAgentHostCanvasState, type AgentHostCanvasJson, type IAgentHostCanvasActionParams, type IAgentHostCanvasInstance, type IAgentHostCanvasOpenParams, type IAgentHostCanvasState } from '../common/agentHostCanvases.js';
import { isChatReadOnly, parseChatUri, SessionStatus } from '../common/state/sessionState.js';
import { IAgentHostProviderService } from './agentHostProviderService.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';
import { AgentHostCanvasOperationLedger, CanvasStaleTargetError, type ICanvasOperationIdentity } from './agentHostCanvasOperationLedger.js';
import type { IAgentHostCanvasProtocol } from '../common/agentHostCanvasProtocol.js';
import { ISessionDataService } from '../common/sessionDataService.js';
import { AgentHostCanvasProtocolAdapter } from './agentHostCanvasProtocolAdapter.js';
import { IAgentConfigurationService } from './agentConfigurationService.js';
import { IAgentHostWorktreeIsolation } from './shared/worktreeIsolation.js';
import { createAgentChatContext } from './agentChatContext.js';
import { AgentHostLocalCanvasesConfigKey } from '../common/agentHostSchema.js';

export interface ICanvasOperationTarget {
	readonly incarnation: string;
	readonly generation: number;
}

export type CanvasHostOperation =
	| { readonly kind: 'open'; readonly params: IAgentHostCanvasOpenParams }
	| { readonly kind: 'action'; readonly params: IAgentHostCanvasActionParams }
	| { readonly kind: 'close'; readonly instanceId: string }
	| { readonly kind: 'restart' };

export type CanvasHostOperationResult =
	| { readonly kind: 'open'; readonly instance: IAgentHostCanvasInstance }
	| { readonly kind: 'action'; readonly result: AgentHostCanvasJson }
	| { readonly kind: 'close' | 'restart' };

export const IAgentHostCanvasesService = createDecorator<IAgentHostCanvasesService>('agentHostCanvasesService');

export interface IAgentHostCanvasesService {
	readonly _serviceBrand: undefined;
	readonly protocol: IAgentHostCanvasProtocol;
	initialize(previewEnabled?: boolean): Promise<void>;
	getCanvases(chat: URI): Promise<IAgentHostCanvasState>;
	prepareCanvasExecution(chat: URI, extensionId: string, onWillExecute: () => void): Promise<void>;
	openCanvas(chat: URI, params: IAgentHostCanvasOpenParams, onWillInvoke?: () => void): Promise<IAgentHostCanvasInstance>;
	invokeCanvasAction(chat: URI, params: IAgentHostCanvasActionParams, onWillInvoke?: () => void): Promise<AgentHostCanvasJson>;
	closeCanvas(chat: URI, instanceId: string, onWillInvoke?: () => void): Promise<void>;
	reloadCanvases(chat: URI, onWillInvoke?: () => void): Promise<void>;
	interruptCanvasOperation(chat: URI, onWillInvoke: () => void): Promise<void>;
	getOperationTarget(chat: URI): ICanvasOperationTarget;
	runOperation(identity: ICanvasOperationIdentity, target: ICanvasOperationTarget, operation: CanvasHostOperation): Promise<CanvasHostOperationResult>;
	assertOperationAllowed(chat: URI): void;
	/** Publishes provider state buffered while the session or its chats were being registered. */
	publishPendingState(session: URI): void;
	disposeChatState(chat: URI): void;
}

interface ICanvasSnapshot {
	readonly provider: IAgent;
	readonly incarnation: string;
	state: IAgentHostCanvasState | undefined;
	revision: number;
}

interface ICanvasRunningOperation extends IDisposable {
	readonly snapshot: ICanvasSnapshot;
	readonly backing: ReturnType<NonNullable<IAgent['getCanvasExecution']>>;
	readonly cancellation: CancellationTokenSource;
	interruption?: Error;
}

interface ICanvasRetirement {
	readonly operation: ICanvasRunningOperation;
	readonly promise: Promise<void>;
	failed: boolean;
}

/** Publishes exact-chat provider snapshots without replacing other host metadata. */
export class AgentHostCanvasesService extends Disposable implements IAgentHostCanvasesService {
	declare readonly _serviceBrand: undefined;
	private readonly _snapshots = new ResourceMap<ICanvasSnapshot>();
	private readonly _operations = this._register(new AgentHostCanvasOperationLedger<CanvasHostOperationResult>());
	private readonly _operationQueue = new SequencerByKey<string>();
	private readonly _runningOperations = this._register(new DisposableMap<string, ICanvasRunningOperation>());
	private readonly _retirements = new ResourceMap<ICanvasRetirement>();
	private readonly _lifetime = this._register(new CancellationTokenSource());
	private readonly _protocol: AgentHostCanvasProtocolAdapter;
	get protocol(): IAgentHostCanvasProtocol { return this._protocol; }

	constructor(
		@IAgentHostProviderService private readonly _providers: IAgentHostProviderService,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@ISessionDataService sessionData: ISessionDataService,
		@ILogService private readonly _logService: ILogService,
		@IAgentConfigurationService private readonly _configuration: IAgentConfigurationService,
		@IAgentHostWorktreeIsolation private readonly _worktree: IAgentHostWorktreeIsolation,
	) {
		super();
		this._protocol = this._register(new AgentHostCanvasProtocolAdapter(this, _providers, _stateManager, sessionData, _logService));
		this._register(toDisposable(() => this._snapshots.clear()));
		this._register(toDisposable(() => this._retirements.clear()));
		this._register(this._stateManager.onDidRemoveSession(session => {
			for (const [chat] of this._snapshots) {
				if (this._belongsToSession(chat, URI.parse(session))) {
					this._operations.invalidateChat(chat);
					this._runningOperations.deleteAndDispose(chat.toString());
					this._retirements.delete(chat);
					this._protocol.disposeChat(chat);
					this._snapshots.delete(chat);
				}
			}
		}));
		this._register(this._providers.registerProviderInitializer(provider => {
			if (!provider.onDidChangeCanvases) {
				return Disposable.None;
			}
			const store = new DisposableStore();
			store.add(provider.onDidChangeCanvases(event => {
				const parsed = parseChatUri(event.chat);
				if (!parsed || this._providers.getProviderForSession(parsed.session) !== provider) {
					return;
				}
				const snapshot = this._snapshot(provider, event.chat);
				snapshot.revision++;
				snapshot.state = this._retirements.has(event.chat) ? this._retiredState(provider, event.state) : event.state;
				void this._publish(provider, event.chat, snapshot.state).catch(error => this._logService.error('[Canvases] Failed to project canvas state.', error));
			}));
			store.add(toDisposable(() => {
				for (const [chat, snapshot] of this._snapshots) {
					if (snapshot.provider === provider) {
						this._operations.invalidateChat(chat);
						this._runningOperations.deleteAndDispose(chat.toString());
						this._retirements.delete(chat);
						this._protocol.disposeChat(chat);
						this._snapshots.delete(chat);
					}
				}
			}));
			return store;
		}));
	}

	async initialize(previewEnabled?: boolean): Promise<void> {
		if (previewEnabled !== undefined) {
			this._configuration.updateRootConfig({ [AgentHostLocalCanvasesConfigKey]: previewEnabled });
		}
		await Promise.all(this._providers.getProviders().map(provider => provider.initializeCanvasRuntime?.()));
	}

	async getCanvases(chat: URI): Promise<IAgentHostCanvasState> {
		const provider = this._provider(chat, false);
		const snapshot = this._snapshot(provider, chat);
		const revision = snapshot.revision;
		await this._protocol.restoreChat(chat);
		const state = this._retirements.has(chat)
			? this._retiredState(provider, snapshot.state) : await provider.getCanvases?.(chat) ?? unsupportedAgentHostCanvasState;
		if (this._snapshots.get(chat) !== snapshot || this._provider(chat, false) !== provider) {
			throw new CancellationError();
		}
		if (snapshot.revision !== revision && snapshot.state) {
			await this._publish(provider, chat, snapshot.state);
			await this._protocol.whenIdle(chat);
			return snapshot.state;
		}
		if (!equals(snapshot.state, state)) {
			snapshot.revision++;
			snapshot.state = state;
		}
		await this._publish(provider, chat, state);
		await this._protocol.whenIdle(chat);
		return state;
	}

	async prepareCanvasExecution(chat: URI, extensionId: string, onWillExecute: () => void): Promise<void> {
		const provider = this._provider(chat, true);
		this._assertNotRetiring(chat);
		if (!provider.prepareCanvasExecution) {
			return;
		}
		const snapshot = this._snapshot(provider, chat);
		const parsed = parseChatUri(chat);
		if (!parsed) {
			throw new Error('Local canvases require a registered chat.');
		}
		const session = URI.parse(parsed.session);
		const sessionId = AgentSession.id(session);
		const originalDirectories = this._configuration.getEffectiveWorkingDirectories(parsed.session);
		const directories = originalDirectories?.map(directory => URI.parse(directory));
		const directory = directories?.[0];
		if (!directory) {
			throw new Error('Local canvases require a workspace.');
		}
		let launchDirectories: readonly URI[] = directories;
		const assertCurrent = () => {
			const currentDirectories = this._configuration.getEffectiveWorkingDirectories(parsed.session);
			if (this._snapshots.get(chat) !== snapshot || this._provider(chat, true) !== provider
				|| !equals(originalDirectories, currentDirectories) && !equals(launchDirectories.map(directory => directory.toString()), currentDirectories)) {
				throw new CancellationError();
			}
		};
		const resolved = this._worktree.isWorkingDirectoryPending(sessionId)
			? await this._worktree.resolveOnFirstSend({
				sessionUri: session, sessionId, workingDirectory: directory,
				config: this._configuration.getSessionConfigValues(parsed.session),
			})
			: await this._worktree.resolveWorkingDirectoryForResume(session, sessionId, directory);
		assertCurrent();
		if (!resolved) {
			throw new Error('The canvas working directory could not be resolved.');
		}
		launchDirectories = [resolved, ...directories.slice(1)];
		await provider.prepareCanvasExecution(chat, extensionId, launchDirectories, () => {
			assertCurrent();
			onWillExecute();
		}, createAgentChatContext(this._stateManager, session, chat));
		assertCurrent();
	}

	publishPendingState(session: URI): void {
		for (const [chat, snapshot] of this._snapshots) {
			if (snapshot.state && this._belongsToSession(chat, session)) {
				void this._publish(snapshot.provider, chat, snapshot.state).catch(error => this._logService.error('[Canvases] Failed to project canvas state.', error));
			}
		}
	}

	disposeChatState(chat: URI): void {
		this._operations.invalidateChat(chat);
		this._runningOperations.deleteAndDispose(chat.toString());
		this._retirements.delete(chat);
		this._protocol.disposeChat(chat);
		this._snapshots.delete(chat);
		const parsed = parseChatUri(chat);
		const session = parsed && this._stateManager.getSessionState(parsed.session);
		if (parsed && session) {
			const meta = withoutAgentHostCanvasState(session._meta, chat);
			if (meta !== session._meta) {
				this._stateManager.setSessionMeta(parsed.session, meta);
			}
		}
	}

	private _snapshot(provider: IAgent, chat: URI): ICanvasSnapshot {
		let snapshot = this._snapshots.get(chat);
		if (!snapshot || snapshot.provider !== provider) {
			snapshot = { provider, incarnation: generateUuid(), state: undefined, revision: 0 };
			this._snapshots.set(chat, snapshot);
		}
		return snapshot;
	}

	private _belongsToSession(chat: URI, session: URI): boolean {
		const parsed = parseChatUri(chat);
		return !!parsed && isEqual(URI.parse(parsed.session), session);
	}

	openCanvas(chat: URI, params: IAgentHostCanvasOpenParams, onWillInvoke?: () => void): Promise<IAgentHostCanvasInstance> {
		const provider = this._provider(chat, true);
		if (!provider.openCanvas) {
			throw new Error('This provider does not support local canvases.');
		}
		return this._legacyOperation(chat, { kind: 'open', params }, onWillInvoke).then(result => {
			if (result.kind !== 'open') {
				throw new Error('Unexpected canvas operation result.');
			}
			return result.instance;
		});
	}

	invokeCanvasAction(chat: URI, params: IAgentHostCanvasActionParams, onWillInvoke?: () => void): Promise<AgentHostCanvasJson> {
		const provider = this._provider(chat, true);
		if (!provider.invokeCanvasAction) {
			throw new Error('This provider does not support local canvas actions.');
		}
		return this._legacyOperation(chat, { kind: 'action', params }, onWillInvoke).then(result => {
			if (result.kind !== 'action') {
				throw new Error('Unexpected canvas operation result.');
			}
			return result.result;
		});
	}

	closeCanvas(chat: URI, instanceId: string, onWillInvoke?: () => void): Promise<void> {
		const provider = this._provider(chat, true);
		if (!provider.closeCanvas) {
			throw new Error('This provider does not support local canvases.');
		}
		return this._legacyOperation(chat, { kind: 'close', instanceId }, onWillInvoke).then(() => { });
	}

	reloadCanvases(chat: URI, onWillInvoke?: () => void): Promise<void> {
		const provider = this._provider(chat, true);
		if (!provider.reloadCanvases) {
			throw new Error('This provider does not support local canvases.');
		}
		return this._legacyOperation(chat, { kind: 'restart' }, onWillInvoke).then(() => { });
	}

	getOperationTarget(chat: URI): ICanvasOperationTarget {
		const snapshot = this._snapshot(this._provider(chat, false), chat);
		return { incarnation: snapshot.incarnation, generation: snapshot.revision };
	}

	assertOperationAllowed(chat: URI): void {
		this._provider(chat, true);
	}

	async interruptCanvasOperation(chat: URI, onWillInvoke: () => void): Promise<void> {
		this._provider(chat, true);
		const retiring = this._retirements.get(chat);
		const running = retiring?.operation ?? this._runningOperations.get(chat.toString());
		if (running) {
			onWillInvoke();
			await this._retireOperation(chat, running, new CancellationError());
		}
	}

	private _legacyOperation(chat: URI, operation: CanvasHostOperation, onWillInvoke?: () => void): Promise<CanvasHostOperationResult> {
		return this.runOperation({ chat, clientId: 'legacy', requestId: generateUuid() }, this.getOperationTarget(chat), operation, onWillInvoke);
	}

	runOperation(identity: ICanvasOperationIdentity, target: ICanvasOperationTarget, operation: CanvasHostOperation, onWillInvoke?: () => void): Promise<CanvasHostOperationResult> {
		const expected = { incarnation: target.incarnation, generation: target.generation };
		const parameters = {
			...expected,
			kind: operation.kind,
			...(operation.kind === 'open' ? { extensionId: operation.params.extensionId, canvasId: operation.params.canvasId, instanceId: operation.params.instanceId, ...(operation.params.input !== undefined ? { input: operation.params.input } : {}) } : {}),
			...(operation.kind === 'action' ? { instanceId: operation.params.instanceId, actionName: operation.params.actionName, ...(operation.params.input !== undefined ? { input: operation.params.input } : {}) } : {}),
			...(operation.kind === 'close' ? { instanceId: operation.instanceId } : {}),
		};
		if (!expected.incarnation || !Number.isSafeInteger(expected.generation) || expected.generation < 0 || !isAgentHostCanvasJson(parameters)) {
			throw new Error('Canvas operations require bounded JSON parameters.');
		}
		const frozen = structuredClone(operation);
		return this._operations.execute(identity, parameters, execution => this._operationQueue.queue(identity.chat.toString(), async () => {
			execution.assertCurrent();
			const provider = this._provider(identity.chat, true);
			this._assertNotRetiring(identity.chat);
			const current = this.getOperationTarget(identity.chat);
			if (current.incarnation !== expected.incarnation || current.generation !== expected.generation) {
				throw new CanvasStaleTargetError();
			}
			const start = () => {
				onWillInvoke?.();
				execution.startEffects();
			};
			return this._runProviderOperation(identity.chat, provider, async () => {
				switch (frozen.kind) {
					case 'open':
						if (!provider.openCanvas) {
							throw new Error('This provider does not support local canvases.');
						}
						start();
						return { kind: 'open', instance: await provider.openCanvas(identity.chat, frozen.params) };
					case 'action':
						if (!provider.invokeCanvasAction) {
							throw new Error('This provider does not support local canvas actions.');
						}
						start();
						return { kind: 'action', result: await provider.invokeCanvasAction(identity.chat, frozen.params) };
					case 'close':
						if (!provider.closeCanvas) {
							throw new Error('This provider does not support local canvases.');
						}
						start();
						await provider.closeCanvas(identity.chat, frozen.instanceId);
						return { kind: 'close' };
					case 'restart':
						if (!provider.reloadCanvases) {
							throw new Error('This provider does not support local canvases.');
						}
						start();
						await provider.reloadCanvases(identity.chat);
						return { kind: 'restart' };
				}
			});
		}));
	}

	private async _runProviderOperation(chat: URI, provider: IAgent, operation: () => Promise<CanvasHostOperationResult>): Promise<CanvasHostOperationResult> {
		const backing = provider.getCanvasExecution?.(chat);
		const cancellation = new CancellationTokenSource();
		const running: ICanvasRunningOperation = {
			snapshot: this._snapshot(provider, chat), backing, cancellation,
			dispose: () => cancellation.dispose(true),
		};
		const key = chat.toString();
		this._runningOperations.set(key, running);
		const deadline = disposableTimeout(() => {
			void this._retireOperation(chat, running, new Error('The canvas operation timed out.')).catch(error => {
				this._logService.error('[Canvases] Failed to retire a timed-out canvas backing.', error);
			});
		}, 30_000);
		try {
			return await raceCancellationError(asPromise(operation), cancellation.token);
		} catch (error) {
			throw running.interruption ?? error;
		} finally {
			deadline.dispose();
			if (this._runningOperations.get(key) === running) {
				this._runningOperations.deleteAndDispose(key);
			}
		}
	}

	private _retireOperation(chat: URI, running: ICanvasRunningOperation, reason: Error): Promise<void> {
		const previous = this._retirements.get(chat);
		if (previous && !previous.failed) {
			return this._waitForRetirement(previous.promise);
		}
		running.interruption = reason;
		running.cancellation.cancel();
		const backing = running.backing;
		if (!previous && backing && !backing.isCurrent()) {
			return this._waitForRetirement(asPromise(() => backing.retire()));
		}
		const snapshot = running.snapshot;
		if (this._snapshots.get(chat) === snapshot) {
			snapshot.revision++;
			snapshot.state = this._retiredState(snapshot.provider, snapshot.state);
			void this._publish(snapshot.provider, chat, snapshot.state).catch(error => this._logService.error('[Canvases] Failed to retire canvas endpoints.', error));
		}
		const retirement: ICanvasRetirement = {
			operation: running, failed: false,
			promise: Promise.resolve().then(() => {
				if (!backing) {
					throw new Error('This canvas provider cannot safely retire the interrupted backing.');
				}
				return backing.retire();
			}),
		};
		this._retirements.set(chat, retirement);
		void retirement.promise.then(() => {
			if (this._retirements.get(chat) === retirement) {
				this._retirements.delete(chat);
			}
		}, () => { retirement.failed = true; });
		return this._waitForRetirement(retirement.promise);
	}

	private async _waitForRetirement(promise: Promise<void>): Promise<void> {
		const expired = new DeferredPromise<void>();
		const deadline = disposableTimeout(() => {
			void expired.error(new Error('The canvas backing has not stopped. Retry its restart after shutdown completes.'));
		}, 10_000);
		try {
			await raceCancellationError(Promise.race([promise, expired.p]), this._lifetime.token);
		} finally {
			deadline.dispose();
		}
	}

	private _assertNotRetiring(chat: URI): void {
		if (this._retirements.has(chat)) {
			throw new Error('The canvas backing is still retiring. Restart it before running another operation.');
		}
	}

	private _retiredState(provider: IAgent, state: IAgentHostCanvasState | undefined): IAgentHostCanvasState {
		return {
			supported: state?.supported ?? provider.supportsCanvasProtocol === true, loaded: false, catalog: state?.catalog ?? [],
			instances: state?.instances.map(instance => ({
				instanceId: instance.instanceId, extensionId: instance.extensionId, canvasId: instance.canvasId, availability: 'unavailable',
				...(instance.title === undefined ? {} : { title: instance.title }),
				...(instance.input === undefined ? {} : { input: instance.input }),
			})) ?? [],
		};
	}

	private _provider(chat: URI, effectful: boolean): IAgent {
		const parsed = parseChatUri(chat);
		const session = parsed && this._stateManager.getSessionState(parsed.session);
		const summary = session?.chats.find(candidate => candidate.resource === chat.toString());
		if (!parsed || !session || !summary) {
			throw new Error('Local canvases require a registered Agent Host chat.');
		}
		const archived = !!((this._stateManager.getSessionSummary(parsed.session)?.status ?? 0) & SessionStatus.IsArchived);
		if (effectful && isChatReadOnly(this._stateManager.getChatState(chat.toString())?.interactivity ?? summary.interactivity, archived)) {
			throw new Error('Canvas operations are not allowed in a read-only or archived chat.');
		}
		const provider = this._providers.getProviderForSession(parsed.session);
		if (!provider) {
			throw new Error('There is no provider for this canvas chat.');
		}
		return provider;
	}

	private _publish(provider: IAgent, chat: URI, canvasState: IAgentHostCanvasState): Promise<void> {
		const parsed = parseChatUri(chat);
		const session = parsed && this._stateManager.getSessionState(parsed.session);
		if (!parsed || !session || !session.chats.some(candidate => candidate.resource === chat.toString())
			|| this._providers.getProviderForSession(parsed.session) !== provider) {
			return Promise.resolve();
		}
		const updating = this._protocol.update(provider, chat, canvasState);
		if (provider.legacyCanvasMetadata === false) {
			const meta = withoutAgentHostCanvasState(session._meta, chat);
			if (meta !== session._meta) {
				this._stateManager.setSessionMeta(parsed.session, meta);
			}
			return updating;
		}
		if (!equals(readAgentHostCanvasState(session._meta, chat), canvasState)) {
			this._stateManager.setSessionMeta(parsed.session, withAgentHostCanvasState(session._meta, chat, canvasState));
		}
		return updating;
	}

	override dispose(): void {
		this._lifetime.cancel();
		super.dispose();
	}
}

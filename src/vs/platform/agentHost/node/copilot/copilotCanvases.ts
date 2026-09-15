/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotClient, CopilotSession, ExtensionLaunchProviderHandler, ExtensionLaunchProviderResolveRequest, PermissionRequest, PermissionRequestResult, SessionEvent } from '@github/copilot-sdk';
import { createHash } from 'crypto';
import { realpath } from 'fs/promises';
import { fileURLToPath, URL } from 'url';
import { Barrier, IntervalTimer, raceCancellationError, timeout } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, type IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { isAbsolute } from '../../../../base/common/path.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import type { IAgentCanvasApprovalClient, IAgentCanvasInstance, IAgentCanvasOperation, IAgentCanvasSnapshot, IAgentCanvases } from '../../common/agentHostCanvases.js';
import { canvasIdentityKey, invalidCanvasParams, isBoundedCanvasJson, isCanvasIcon, isCanvasIdentity, isInlineCanvasSchema, validateCanvasActions, validateCanvasType } from '../../common/agentHostCanvasValidation.js';
import type { InvokeCanvasActionParams, OpenCanvasParams } from '../../common/state/protocol/channels-canvas/commands.js';
import { CanvasAvailabilityStatus, CanvasSourceKind, CanvasTrustStatus, type CanvasActionDeclaration, type CanvasIdentityKey, type CanvasSource, type CanvasSourcePresentation, type CanvasState, type CanvasTrustState, type CanvasTypeDeclaration } from '../../common/state/protocol/channels-canvas/state.js';
import { AhpErrorCodes, ProtocolError } from '../../common/state/sessionProtocol.js';
import { IAgentHostCanvasesService } from '../agentHostCanvasesService.js';
import { validateCanvasInput } from '../agentHostCanvasSchema.js';
import type { CopilotSessionWrapper } from './copilotSessionWrapper.js';
import { sdkAttachmentsToProtocol } from './mapSessionEvents.js';
import { isCopilotCanvasJson } from '../../common/meta/copilotCanvasMeta.js';

type NativeCanvas = Awaited<ReturnType<CopilotSession['rpc']['canvas']['list']>>['canvases'][number];
type NativeInstance = Awaited<ReturnType<CopilotSession['rpc']['canvas']['listOpen']>>['openCanvases'][number];
type NativeCanvasEvent = Extract<SessionEvent, { type: `session.canvas.${string}` | 'session.extensions_loaded' | 'session.shutdown' }>;

export interface ICopilotCanvasHost {
	prepare(chat: string, operation: IAgentCanvasOperation): Promise<void>;
	isBusy(chat: string): boolean;
	residentChats(): readonly string[];
	recoverOwnedRuntime(): Promise<void>;
}

export interface ICopilotCanvasLaunch extends IDisposable {
	readonly token: CancellationToken;
	onEvent(event: SessionEvent): void;
	permission(request: PermissionRequest): Promise<PermissionRequestResult | undefined>;
	attach(wrapper: CopilotSessionWrapper): Promise<void>;
}

interface ICanvasBacking {
	readonly chat: string;
	readonly sessionId: string;
	clientId?: string;
	initiator?: IAgentCanvasApprovalClient;
	readonly store: DisposableStore;
	readonly lifetime: CancellationTokenSource;
	readonly extensionsLoaded: Barrier;
	readonly sources: Map<string, { modulePath: string; canonicalPath: string }>;
	readonly pendingLaunches: Set<string>;
	readonly schemas: Map<string, { source: string; schema: object }>;
	schemaLength: number;
	readonly instances: Map<string, NativeInstance>;
	readonly versions: Map<string, number>;
	readonly closed: Map<string, CanvasIdentityKey>;
	readonly incarnations: Map<string, string>;
	session?: CopilotSession;
	ready: boolean;
	generation: string;
	declarations: readonly NativeCanvas[];
	snapshot: IAgentCanvasSnapshot;
	pendingEvents: NativeCanvasEvent[] | undefined;
	pendingEventsLength: number;
	failure?: string;
}

function hasLiveCanvasSession(backing: ICanvasBacking | undefined): backing is ICanvasBacking & { session: CopilotSession } {
	return backing?.session !== undefined && !backing.store.isDisposed && !backing.lifetime.token.isCancellationRequested;
}

function isNativeCanvasEvent(event: SessionEvent): event is NativeCanvasEvent {
	return event.type.startsWith('session.canvas.') || event.type === 'session.extensions_loaded' || event.type === 'session.shutdown';
}

function sourceId(source: CanvasSource): string {
	if (source.kind !== CanvasSourceKind.Extension) {
		throw new ProtocolError(AhpErrorCodes.PermissionDenied, 'This runtime source is not an admitted extension.');
	}
	return source.extensionId;
}

function sameNativeIdentity(left: NativeInstance, right: Pick<NativeInstance, 'canvasId' | 'extensionId' | 'instanceId'>): boolean {
	return left.instanceId === right.instanceId && left.extensionId === right.extensionId && left.canvasId === right.canvasId;
}

function nativeCanvasIdentity(chat: string, instance: Pick<NativeInstance, 'canvasId' | 'extensionId' | 'instanceId'>): CanvasIdentityKey {
	return { chat, source: { kind: CanvasSourceKind.Extension, extensionId: instance.extensionId }, canvasType: instance.canvasId, instanceId: instance.instanceId };
}

/** One facet over the existing SDK client and its dispatcher, never a second SDK connection. */
export class CopilotCanvases extends Disposable implements IAgentCanvases {
	readonly defersHostTurnStart = true;
	readonly instanceIdScope = 'chat';
	private readonly _onDidChange = this._register(new Emitter<IAgentCanvasSnapshot>());
	readonly onDidChange = this._onDidChange.event;
	private readonly _backings = new Map<string, ICanvasBacking>();
	private readonly _sessions = new Map<string, ICanvasBacking>();
	private readonly _preparing = new Map<string, IAgentCanvasOperation>();
	private readonly _connectionMonitor = this._register(new IntervalTimer());
	private _client: CopilotClient | undefined;
	private _negotiated = false;
	private _authorityLost = false;
	private _readiness: Promise<void> | undefined;

	constructor(
		private readonly _host: ICopilotCanvasHost,
		@IAgentHostCanvasesService private readonly _canvases: IAgentHostCanvasesService,
	) {
		super();
		this._register(toDisposable(() => this.clientStopped()));
	}

	get available(): boolean { return this._negotiated && !this.authorityLost && !this._store.isDisposed; }
	get authorityLost(): boolean {
		if (this._authorityLost) {
			return true;
		}
		if (this._negotiated && this._client) {
			try {
				// The supported public getter rejects a closed connection; it never starts one.
				void this._client.rpc;
			} catch {
				return true;
			}
		}
		return false;
	}
	get readiness(): Promise<void> | undefined { return this._readiness; }

	trackStartup(readiness: Promise<void>): void {
		this._readiness = readiness;
	}

	readonly launchProvider: ExtensionLaunchProviderHandler = {
		resolve: async (request, cancellation) => {
			const backing = request.sessionId ? this._sessions.get(request.sessionId) : undefined;
			const client = this._client;
			if (!backing || backing.lifetime.token.isCancellationRequested || !client || !this.available || !request.defaultLaunch || !isAbsolute(request.modulePath)
				|| !request.id.startsWith(`${request.source}:`) || request.id.length > 256 || !request.name || request.name.length > 256
				|| backing.pendingLaunches.has(request.id) || backing.pendingLaunches.size >= 128
				|| !backing.sources.has(request.id) && backing.sources.size >= 1024
				|| backing.sources.has(request.id) && backing.sources.get(request.id)?.modulePath !== request.modulePath) {
				return { launch: null };
			}
			backing.pendingLaunches.add(request.id);
			const store = new DisposableStore();
			const lifetime = new CancellationTokenSource(backing.lifetime.token);
			store.add(toDisposable(() => lifetime.dispose(true)));
			if (cancellation) {
				store.add(cancellation.onCancellationRequested(() => lifetime.cancel()));
				if (cancellation.isCancellationRequested) {
					lifetime.cancel();
				}
			}
			try {
				const canonicalPath = await realpath(request.modulePath);
				const approved = await this._canvases.requestApproval(backing.chat, this._sourcePrompt(request, canonicalPath), lifetime.token, backing.clientId, backing.initiator);
				if (!approved || this._client !== client || !this.available || backing.store.isDisposed || await realpath(request.modulePath) !== canonicalPath) {
					return { launch: null };
				}
				// Top-level extension code is effectful. Retention must precede the launch recipe.
				const retained = await raceCancellationError(client.rpc.session.retain({ sessionId: backing.sessionId }), lifetime.token);
				if (retained !== null || lifetime.token.isCancellationRequested || backing.store.isDisposed || this._client !== client || !this.available) {
					return { launch: null };
				}
				await this._canvases.retainChat(backing.chat, lifetime.token);
				if (lifetime.token.isCancellationRequested || backing.store.isDisposed || this._client !== client || !this.available) {
					return { launch: null };
				}
				backing.sources.set(request.id, { modulePath: request.modulePath, canonicalPath });
				return { launch: request.defaultLaunch };
			} finally {
				backing.pendingLaunches.delete(request.id);
				store.dispose();
			}
		},
	};

	clientStarting(client: CopilotClient): void {
		if (this.authorityLost) {
			throw new ProtocolError(AhpErrorCodes.PermissionDenied, 'Canvas launch authority was lost. Explicit owned-runtime recovery is required.');
		}
		this._client = client;
		this._negotiated = false;
	}

	clientStarted(client: CopilotClient): void {
		if (this._client === client) {
			// The supported public SDK refuses start without a v1 launch-provider acknowledgement.
			this._negotiated = true;
			this._connectionMonitor.cancelAndSet(() => {
				if (this.authorityLost) {
					this.loseAuthority();
				}
			}, 1000);
		}
	}

	clientStopped(client?: CopilotClient): void {
		if (client && this._client !== client) {
			return;
		}
		this._connectionMonitor.cancel();
		this._negotiated = false;
		this._client = undefined;
		for (const backing of [...this._backings.values()]) {
			backing.store.dispose();
		}
	}

	loseAuthority(): void {
		this._authorityLost = true;
		this.clientStopped();
	}

	beginLaunch(sessionId: string, chat: string): ICopilotCanvasLaunch {
		const operation = this._preparing.get(chat) ?? this._canvases.getChatInitialization(chat);
		if (!this.available || this._sessions.has(sessionId) || this._backings.has(chat) || operation?.token.isCancellationRequested) {
			throw new ProtocolError(AhpErrorCodes.Conflict, 'The canvas backing is unavailable or already owned.');
		}
		const store = new DisposableStore();
		const lifetime = new CancellationTokenSource(operation?.token);
		store.add(toDisposable(() => lifetime.dispose(true)));
		const generation = generateUuid();
		const backing: ICanvasBacking = {
			chat, sessionId, clientId: operation?.clientId, initiator: operation?.initiator, store, lifetime, generation, sources: new Map(), pendingLaunches: new Set(), schemas: new Map(), instances: new Map(), versions: new Map(), closed: new Map(), incarnations: new Map(),
			extensionsLoaded: new Barrier(), ready: false, schemaLength: 0, declarations: [], pendingEvents: [], pendingEventsLength: 0, snapshot: { chat, generation, types: [], instances: [] },
		};
		// Let child cancellation listeners run before disposing their parent emitter.
		store.add(lifetime.token.onCancellationRequested(() => queueMicrotask(() => store.dispose())));
		store.add(toDisposable(() => {
			lifetime.cancel();
			if (this._backings.get(chat) === backing) {
				this._canvases.discardPendingAttachments(chat);
				this._backings.delete(chat);
				this._sessions.delete(sessionId);
				backing.sources.clear();
				backing.pendingLaunches.clear();
				backing.schemas.clear();
				backing.schemaLength = 0;
				backing.pendingEvents = undefined;
				backing.pendingEventsLength = 0;
				backing.incarnations.clear();
				backing.closed.clear();
				backing.versions.clear();
				backing.session = undefined;
				backing.ready = false;
				backing.instances.clear();
				backing.declarations = [];
				backing.failure = undefined;
				backing.generation = generateUuid();
				this._publish(backing);
			}
		}));
		this._backings.set(chat, backing);
		this._sessions.set(sessionId, backing);
		return {
			token: lifetime.token,
			dispose: () => store.dispose(),
			onEvent: event => {
				if (store.isDisposed || event.agentId || backing.failure && event.type !== 'session.shutdown' && event.type !== 'session.extensions_loaded') {
					return;
				}
				if (isNativeCanvasEvent(event)) {
					if (backing.pendingEvents && event.type !== 'session.extensions_loaded' && event.type !== 'session.shutdown' && backing.pendingEvents.length < 1024) {
						if (!isBoundedCanvasJson(event, 8 * 1024 * 1024) || (backing.pendingEventsLength += JSON.stringify(event).length) > 16 * 1024 * 1024) {
							store.dispose();
							return;
						}
						backing.pendingEvents.push(event);
					} else if (backing.pendingEvents && backing.pendingEvents.length >= 1024) {
						store.dispose();
						return;
					}
					this._event(backing, event);
				} else if (event.type === 'session.extensions.attachments_pushed') {
					if (event.data.attachments.length <= 64 && isBoundedCanvasJson(event.data.attachments, 16 * 1024 * 1024)
						&& event.data.attachments.every(attachment => attachment.type === 'extension_context' ? backing.sources.has(attachment.extensionId) && isBoundedCanvasJson(attachment) : backing.sources.size > 0)) {
						this._canvases.appendAttachments(chat, sdkAttachmentsToProtocol(event.data.attachments, chat) ?? []);
					}
				}
			},
			permission: request => this._permission(backing, request),
			attach: async wrapper => {
				if (store.isDisposed) {
					throw new CancellationError();
				}
				backing.session = wrapper.session;
				store.add(wrapper.onDidDispose(() => store.dispose()));
				await raceCancellationError(backing.extensionsLoaded.wait(), lifetime.token);
				await this._refresh(backing);
			},
		};
	}

	getSnapshot(chat: string): IAgentCanvasSnapshot | undefined {
		const backing = this._backings.get(chat);
		return backing?.ready ? backing.snapshot : undefined;
	}

	getTrust(chat: string, source: CanvasSource): CanvasTrustState {
		const backing = this._backings.get(chat);
		if (source.kind !== CanvasSourceKind.Extension || !this.available || !backing || backing.lifetime.token.isCancellationRequested || !backing.sources.has(source.extensionId)) {
			return { status: CanvasTrustStatus.Pending };
		}
		if (backing.failure) {
			return { status: CanvasTrustStatus.Blocked, reason: backing.failure };
		}
		return { status: CanvasTrustStatus.Trusted };
	}

	async initializeChat(chat: string, operation: IAgentCanvasOperation): Promise<void> {
		if (!this.available) {
			throw new ProtocolError(AhpErrorCodes.PermissionDenied, 'An eligible canvas runtime is not connected.');
		}
		if (!this._backings.get(chat)?.ready) {
			operation.willExecute();
			this._preparing.set(chat, operation);
			try {
				await this._host.prepare(chat, operation);
			} finally {
				this._preparing.delete(chat);
			}
		}
		const backing = this._backing(chat);
		if (!backing.ready || backing.pendingEvents || backing.failure || operation.token.isCancellationRequested) {
			throw new ProtocolError(AhpErrorCodes.Conflict, 'The canvas registry did not finish initializing.');
		}
	}

	async prepare(identity: CanvasIdentityKey, operation: IAgentCanvasOperation): Promise<void> {
		await this.initializeChat(identity.chat, operation);
		const backing = this._backing(identity.chat);
		const deadline = Date.now() + 30_000;
		while (!backing.snapshot.types.some(type => type.canvasType === identity.canvasType && sourceId(type.source) === sourceId(identity.source))) {
			if (Date.now() >= deadline || backing.store.isDisposed) {
				throw new ProtocolError(AhpErrorCodes.NotFound, 'The admitted extension did not declare this canvas before the readiness deadline.');
			}
			await raceCancellationError(timeout(50), operation.token);
		}
	}

	async open(params: OpenCanvasParams, operation: IAgentCanvasOperation): Promise<IAgentCanvasInstance> {
		const backing = this._backing(params.identity.chat);
		const input = params.input;
		if (input !== undefined && !isCopilotCanvasJson(input)) {
			throw invalidCanvasParams('Canvas open input must be bounded JSON.');
		}
		const native = { extensionId: sourceId(params.identity.source), canvasId: params.identity.canvasType, instanceId: params.identity.instanceId, ...(input === undefined ? {} : { input }) };
		const existing = backing.instances.get(native.instanceId);
		if (existing && !sameNativeIdentity(existing, native)) {
			throw new ProtocolError(AhpErrorCodes.Conflict, 'The native instance ID is already owned by a different canvas in this SDK session.');
		}
		const version = backing.versions.get(native.instanceId) ?? 0;
		backing.closed.delete(canvasIdentityKey(params.identity));
		operation.willExecute();
		const result = await raceCancellationError(backing.session.rpc.canvas.open(native), operation.token);
		if (!sameNativeIdentity(result, native) || backing.store.isDisposed) {
			throw new Error('The native canvas open did not settle against its original backing.');
		}
		if ((backing.versions.get(native.instanceId) ?? 0) === version) {
			backing.incarnations.set(native.instanceId, generateUuid());
			backing.instances.set(native.instanceId, result);
			this._publish(backing);
		}
		const instance = backing.snapshot.instances.find(candidate => canvasIdentityKey(candidate.identity) === canvasIdentityKey(params.identity));
		if (!instance || backing.closed.has(canvasIdentityKey(params.identity))) {
			throw new Error('The canvas closed while its open was pending.');
		}
		return instance;
	}

	async invoke(state: CanvasState, params: InvokeCanvasActionParams, operation: IAgentCanvasOperation): Promise<unknown> {
		const backing = this._backing(state.identity.chat);
		this._instance(backing, state.identity);
		const input = params.input;
		if (input !== undefined && !isCopilotCanvasJson(input)) {
			throw invalidCanvasParams('Canvas action input must be bounded JSON.');
		}
		operation.willExecute();
		return raceCancellationError(backing.session.rpc.canvas.action.invoke({ instanceId: state.identity.instanceId, actionName: params.actionId, ...(input === undefined ? {} : { input }) }), operation.token);
	}

	async close(state: CanvasState, operation: IAgentCanvasOperation): Promise<void> {
		const backing = this._backing(state.identity.chat);
		const instance = this._instance(backing, state.identity);
		operation.willExecute();
		await raceCancellationError(backing.session.rpc.canvas.close({ instanceId: state.identity.instanceId }), operation.token);
		const current = backing.instances.get(state.identity.instanceId);
		if (current && current !== instance) {
			throw new Error('A different native instance appeared while close was pending.');
		}
		backing.closed.set(canvasIdentityKey(state.identity), state.identity);
		backing.instances.delete(state.identity.instanceId);
		backing.incarnations.delete(state.identity.instanceId);
		this._publish(backing);
	}

	async restart(state: CanvasState, operation: IAgentCanvasOperation): Promise<void> {
		if (this.authorityLost || !hasLiveCanvasSession(this._backings.get(state.identity.chat))) {
			const affected = this._host.residentChats();
			if (!await this._canvases.requestApproval(state.identity.chat, localize('canvas.recoverOwner', "Restart the owned preview runtime? This disconnects {0} resident chats. No canvas action or model turn will be replayed.", affected.length), operation.token, operation.clientId, operation.initiator)) {
				throw new ProtocolError(AhpErrorCodes.PermissionDenied, 'Owned-runtime recovery was not approved.');
			}
			operation.willExecute();
			this._authorityLost = false;
			try {
				await this._host.recoverOwnedRuntime();
				await this.prepare(state.identity, operation);
			} catch (error) {
				this._authorityLost = true;
				throw error;
			}
			return;
		}
		const backing = this._backing(state.identity.chat);
		if (this._host.isBusy(backing.chat) || !await this._canvases.requestApproval(backing.chat, localize('canvas.reloadExtensions', "Reload all extensions in this chat? This replaces their live endpoints and prompts again before source execution. Retained workspace data is kept. No canvas action is replayed."), operation.token, operation.clientId, operation.initiator)) {
			throw new ProtocolError(AhpErrorCodes.PermissionDenied, 'Extension reload requires an idle chat and explicit approval.');
		}
		operation.willExecute();
		backing.clientId = operation.clientId;
		backing.initiator = operation.initiator;
		backing.generation = generateUuid();
		backing.failure = undefined;
		backing.sources.clear();
		backing.schemas.clear();
		backing.schemaLength = 0;
		backing.closed.clear();
		backing.versions.clear();
		backing.incarnations.clear();
		for (const [id, instance] of backing.instances) {
			backing.instances.set(id, { instanceId: instance.instanceId, extensionId: instance.extensionId, canvasId: instance.canvasId, title: instance.title });
		}
		this._publish(backing);
		await raceCancellationError(backing.session.rpc.extensions.reload(), operation.token);
		await this._refresh(backing);
	}

	async resolve(state: CanvasState, clientId: string, token: CancellationToken): Promise<CanvasSourcePresentation | undefined> {
		const backing = this._backings.get(state.identity.chat);
		const admission = state.identity.source.kind === CanvasSourceKind.Extension ? backing?.sources.get(state.identity.source.extensionId) : undefined;
		if (!clientId || !backing || !admission || backing.failure || backing.lifetime.token.isCancellationRequested || !this.available || token.isCancellationRequested) {
			return undefined;
		}
		// Check the source binding anew on every pull, without refreshing or starting its runtime.
		if (await realpath(admission.modulePath) !== admission.canonicalPath || token.isCancellationRequested || backing.store.isDisposed || backing.failure || !this.available) {
			return undefined;
		}
		const instance = this._instance(backing, state.identity);
		if (!instance.url) {
			return undefined;
		}
		const url = new URL(instance.url);
		if (url.protocol === `${Schemas.file}:` && !url.username && !url.password && (!url.hostname || url.hostname === 'localhost')) {
			const canonicalPath = await realpath(fileURLToPath(url));
			if (token.isCancellationRequested || backing.store.isDisposed || backing.lifetime.token.isCancellationRequested || backing.instances.get(instance.instanceId) !== instance) {
				return undefined;
			}
			const canonical = new URL(URI.file(canonicalPath).toString());
			canonical.search = url.search;
			canonical.hash = url.hash;
			return { url: canonical.toString() };
		}
		if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password) {
			throw new ProtocolError(AhpErrorCodes.PermissionDenied, 'The runtime did not return an authorized loopback canvas endpoint.');
		}
		return { url: instance.url };
	}

	async resolveSchema(chat: string, source: CanvasSource, reference: string): Promise<object | undefined> {
		const backing = this._backings.get(chat);
		const admission = backing?.sources.get(sourceId(source));
		const schema = backing?.schemas.get(reference);
		if (!backing || !admission || schema?.source !== sourceId(source) || this.getTrust(chat, source).status !== CanvasTrustStatus.Trusted
			|| await realpath(admission.modulePath) !== admission.canonicalPath || backing.sources.get(sourceId(source)) !== admission
			|| this.getTrust(chat, source).status !== CanvasTrustStatus.Trusted) {
			return undefined;
		}
		return structuredClone(schema.schema);
	}

	async validateInput(_chat: string, _source: CanvasSource, schema: object, input: unknown): Promise<void> {
		validateCanvasInput(schema, input);
	}

	private _backing(chat: string): ICanvasBacking & { session: CopilotSession } {
		const backing = this._backings.get(chat);
		if (!this.available || !hasLiveCanvasSession(backing)) {
			throw new ProtocolError(AhpErrorCodes.NotFound, 'The exact canvas backing is not live.');
		}
		return backing;
	}

	private _instance(backing: ICanvasBacking, identity: CanvasIdentityKey): NativeInstance {
		const instance = backing.instances.get(identity.instanceId);
		if (!instance || instance.extensionId !== sourceId(identity.source) || instance.canvasId !== identity.canvasType || backing.closed.has(canvasIdentityKey(identity))) {
			throw new ProtocolError(AhpErrorCodes.NotFound, 'The native instance is not owned by this exact canvas identity.');
		}
		return instance;
	}

	private _sourcePrompt(request: ExtensionLaunchProviderResolveRequest, canonicalPath: string): string {
		return localize('canvas.admitMutableSource', "Allow {0} ({1}) to execute from its original source at {2}? This grants mutable-directory trust for this launch, not approval of an immutable content revision. Its Node.js process is unsandboxed and can run top-level code, tools, hooks, and system-message contributions. This permission is separate from Workspace Trust. The preview runtime cancels unanswered launch requests after 15 seconds.", request.id, request.source, canonicalPath);
	}

	private async _permission(backing: ICanvasBacking, request: PermissionRequest): Promise<PermissionRequestResult | undefined> {
		if (request.kind !== 'extension-env-access') {
			return undefined;
		}
		if (!this.available || backing.store.isDisposed || !backing.sources.has(request.extensionName) || !request.environmentVariables.length || request.environmentVariables.length > 64
			|| request.environmentVariables.some(name => !/^[A-Za-z_][A-Za-z0-9_]{0,255}$/.test(name))) {
			return { kind: 'reject' };
		}
		const approved = await this._canvases.requestApproval(backing.chat, localize('canvas.environmentAdmission', "Allow {0} to read these exact environment variable names: {1}? Values are never included in this request. This grant does not approve other names or extensions.", request.extensionName, [...new Set(request.environmentVariables)].sort().join(', ')), backing.lifetime.token, backing.clientId, backing.initiator);
		return { kind: approved && !backing.store.isDisposed && this.available ? 'approve-once' : 'reject' };
	}

	private async _refresh(backing: ICanvasBacking): Promise<void> {
		const pending = backing.pendingEvents ?? [];
		backing.pendingEvents = pending;
		if (!hasLiveCanvasSession(backing)) {
			throw new CancellationError();
		}
		const session = backing.session;
		try {
			const [catalog, live] = await raceCancellationError(Promise.all([session.rpc.canvas.list(), session.rpc.canvas.listOpen()]), backing.lifetime.token);
			if (!hasLiveCanvasSession(backing) || backing.session !== session) {
				throw new CancellationError();
			}
			if (catalog.canvases.length > 1024 || live.openCanvases.length > 64 || !isBoundedCanvasJson(catalog, 8 * 1024 * 1024) || !isBoundedCanvasJson(live, 8 * 1024 * 1024)
				|| new Set(live.openCanvases.map(instance => instance.instanceId)).size !== live.openCanvases.length) {
				throw invalidCanvasParams('The native canvas snapshot exceeds its bound or repeats a native instance ID.');
			}
			backing.declarations = catalog.canvases;
			backing.instances.clear();
			for (const instance of live.openCanvases) {
				if (!backing.closed.has(canvasIdentityKey(nativeCanvasIdentity(backing.chat, instance)))) {
					backing.instances.set(instance.instanceId, instance);
					if (!backing.incarnations.has(instance.instanceId)) {
						backing.incarnations.set(instance.instanceId, generateUuid());
					}
				}
			}
			for (const event of pending) {
				this._event(backing, event, false, true);
			}
			backing.ready = true;
			this._publish(backing);
		} catch (error) {
			if (!backing.store.isDisposed) {
				this._fail(backing);
			}
			throw error;
		} finally {
			backing.pendingEvents = undefined;
			backing.pendingEventsLength = 0;
		}
	}

	private _event(backing: ICanvasBacking, event: NativeCanvasEvent, publish = true, replay = false): void {
		switch (event.type) {
			case 'session.canvas.registry_changed':
				backing.declarations = event.data.canvases;
				break;
			case 'session.extensions_loaded':
				for (const extension of event.data.extensions) {
					if (extension.status === 'disabled' || extension.status === 'failed') {
						backing.sources.delete(extension.id);
					}
				}
				backing.extensionsLoaded.open();
				break;
			case 'session.canvas.opened': {
				const existing = backing.instances.get(event.data.instanceId);
				if (existing && !sameNativeIdentity(existing, event.data)) {
					backing.store.dispose();
					return;
				}
				if (!replay) {
					backing.versions.set(event.data.instanceId, (backing.versions.get(event.data.instanceId) ?? 0) + 1);
				}
				if (!replay || !backing.incarnations.has(event.data.instanceId)) {
					backing.incarnations.set(event.data.instanceId, generateUuid());
				}
				backing.closed.delete(canvasIdentityKey(nativeCanvasIdentity(backing.chat, event.data)));
				backing.instances.set(event.data.instanceId, event.data);
				break;
			}
			case 'session.canvas.unavailable': {
				const instance = backing.instances.get(event.data.instanceId);
				if (instance && sameNativeIdentity(instance, event.data)) {
					if (!replay) {
						backing.incarnations.set(instance.instanceId, generateUuid());
						backing.sources.delete(instance.extensionId);
					}
					backing.instances.set(instance.instanceId, { instanceId: instance.instanceId, extensionId: instance.extensionId, canvasId: instance.canvasId, title: instance.title });
				}
				break;
			}
			case 'session.canvas.closed':
			case 'session.canvas.removed': {
				const instance = backing.instances.get(event.data.instanceId);
				if (!instance || sameNativeIdentity(instance, event.data)) {
					if (!replay) {
						backing.versions.set(event.data.instanceId, (backing.versions.get(event.data.instanceId) ?? 0) + 1);
					}
					const identity = nativeCanvasIdentity(backing.chat, event.data);
					backing.closed.set(canvasIdentityKey(identity), identity);
					backing.instances.delete(event.data.instanceId);
					backing.incarnations.delete(event.data.instanceId);
				}
				break;
			}
			case 'session.shutdown':
				backing.store.dispose();
				return;
		}
		if (publish) {
			this._publish(backing);
		}
	}

	private _schema(backing: ICanvasBacking, extensionId: string, key: string, schema: unknown): Pick<CanvasActionDeclaration, 'inputSchema' | 'inputSchemaRef'> {
		if (schema === undefined) {
			return {};
		}
		if (isInlineCanvasSchema(schema)) {
			return { inputSchema: schema };
		}
		if (!isBoundedCanvasJson(schema, 1024 * 1024) || typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
			throw invalidCanvasParams('The native canvas schema cannot be represented within the reference bound.');
		}
		const fingerprint = createHash('sha256').update(JSON.stringify([extensionId, key, schema])).digest('hex');
		const reference = `ahp-canvas-schema:/${backing.generation}/${fingerprint}`;
		if (!backing.schemas.has(reference)) {
			const length = JSON.stringify(schema).length;
			if (backing.schemas.size >= 4096 || backing.schemaLength + length > 8 * 1024 * 1024) {
				throw invalidCanvasParams('The native schema-reference registry is full.');
			}
			backing.schemas.set(reference, { source: extensionId, schema: structuredClone(schema) });
			backing.schemaLength += length;
		}
		return { inputSchemaRef: reference };
	}

	private _publish(backing: ICanvasBacking): void {
		try {
			if (!backing.failure) {
				this._publishLive(backing);
			}
		} catch {
			this._fail(backing);
		}
	}

	private _fail(backing: ICanvasBacking): void {
		const message = localize('canvas.invalidRuntimeState', "The runtime canvas declaration is invalid or exceeds the supported bounds. Explicit reload is required.");
		backing.failure = message;
		backing.generation = generateUuid();
		backing.schemas.clear();
		backing.schemaLength = 0;
		backing.pendingEvents = undefined;
		backing.pendingEventsLength = 0;
		backing.snapshot = {
			chat: backing.chat, generation: backing.generation, types: backing.snapshot.types,
			instances: backing.snapshot.instances.map(instance => ({
				...instance, generation: backing.generation,
				availability: { status: CanvasAvailabilityStatus.Failed, error: { errorType: 'invalidCanvasDeclaration', message } },
			})),
		};
		this._onDidChange.fire(backing.snapshot);
	}

	private _publishLive(backing: ICanvasBacking): void {
		if (backing.declarations.length > 1024 || backing.instances.size > 64 || backing.closed.size > 1024
			|| !isBoundedCanvasJson(backing.declarations, 8 * 1024 * 1024)) {
			throw invalidCanvasParams('The native canvas registry exceeds its bound.');
		}
		const types: CanvasTypeDeclaration[] = [];
		const typeKeys = new Set<string>();
		for (const declaration of backing.declarations) {
			if (!backing.sources.has(declaration.extensionId)) {
				continue;
			}
			const key = JSON.stringify([declaration.extensionId, declaration.canvasId]);
			if (typeKeys.has(key)) {
				throw invalidCanvasParams('The native canvas registry repeats a source-qualified type.');
			}
			typeKeys.add(key);
			const schema = this._schema(backing, declaration.extensionId, `${declaration.canvasId}/open`, declaration.inputSchema);
			const actions = (declaration.actions ?? []).map(action => ({
				id: action.name, ...(action.description === undefined ? {} : { description: action.description }),
				...this._schema(backing, declaration.extensionId, `${declaration.canvasId}/${action.name}`, action.inputSchema),
			}));
			validateCanvasActions(actions);
			const icon = declaration.icon && isAbsolute(declaration.icon) ? { src: URI.file(declaration.icon).toString() } : undefined;
			const type: CanvasTypeDeclaration = {
				source: { kind: CanvasSourceKind.Extension, extensionId: declaration.extensionId }, canvasType: declaration.canvasId,
				title: declaration.displayName, description: declaration.description, declaredActions: actions,
				...(schema.inputSchema ? { openInputSchema: schema.inputSchema } : {}),
				...(schema.inputSchemaRef ? { openInputSchemaRef: schema.inputSchemaRef } : {}),
				...(icon && isCanvasIcon(icon) ? { icon } : {}),
			};
			validateCanvasType(type);
			types.push(type);
		}
		const instances: IAgentCanvasInstance[] = [];
		for (const instance of backing.instances.values()) {
			const declaration = types.find(type => type.canvasType === instance.canvasId && sourceId(type.source) === instance.extensionId);
			if (declaration) {
				const projected: IAgentCanvasInstance = {
					identity: { chat: backing.chat, source: declaration.source, canvasType: instance.canvasId, instanceId: instance.instanceId },
					generation: `${backing.generation}/${backing.incarnations.get(instance.instanceId)}`,
					title: instance.title ?? declaration.title, ...(declaration.icon ? { icon: declaration.icon } : {}),
					availability: instance.url
						? { status: CanvasAvailabilityStatus.Ready, actions: declaration.declaredActions ?? [] }
						: { status: CanvasAvailabilityStatus.NotLoaded },
				};
				if (!isCanvasIdentity(projected.identity) || projected.title.length > 4096) {
					throw invalidCanvasParams('The native canvas instance exceeds its identity or display bound.');
				}
				instances.push(projected);
			}
		}
		backing.snapshot = { chat: backing.chat, generation: backing.generation, types, instances, closed: [...backing.closed.values()] };
		this._onDidChange.fire(backing.snapshot);
	}
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SequencerByKey } from '../../../base/common/async.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { equals } from '../../../base/common/objects.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import type { ILogService } from '../../log/common/log.js';
import type { IAgent } from '../common/agent.js';
import { AgentHostCanvasScheme, canvasIdentityKey, canvasSourceKey, isAgentHostCanvasUri, isCanvasIdentityKey, isCanvasIcon, type IAgentHostCanvasProtocol } from '../common/agentHostCanvasProtocol.js';
import { isAgentHostCanvasJson, type IAgentHostCanvasState } from '../common/agentHostCanvases.js';
import type { ISessionDataService } from '../common/sessionDataService.js';
import type { CloseCanvasParams, InvokeCanvasActionParams, InvokeCanvasActionResult, ListCanvasTypesParams, ListCanvasTypesResult, OpenCanvasParams, OpenCanvasResult, ResolveCanvasSourceParams, ResolveCanvasSourceResult, RestartCanvasProviderParams } from '../common/state/protocol/channels-canvas/commands.js';
import { CanvasAvailabilityStatus, CanvasSourceKind, CanvasTrustStatus, type CanvasAvailabilityState, type CanvasEntry, type CanvasIdentityKey, type CanvasState } from '../common/state/protocol/channels-canvas/state.js';
import { ActionType } from '../common/state/sessionActions.js';
import { AhpErrorCodes, JsonRpcErrorCodes, ProtocolError } from '../common/state/sessionProtocol.js';
import { parseChatUri } from '../common/state/sessionState.js';
import { AgentHostCanvasOperationLedger, CanvasOperationIndeterminateError, CanvasRequestConflictError, CanvasStaleTargetError } from './agentHostCanvasOperationLedger.js';
import { canvasAvailability, canvasEntry, canvasSource, canvasTypeDeclaration } from './agentHostCanvasProjection.js';
import type { IAgentHostCanvasesService } from './agentHostCanvasesService.js';
import type { IAgentHostProviderService } from './agentHostProviderService.js';
import type { AgentHostStateManager } from './agentHostStateManager.js';

const REGISTRY_KEY = 'canvasRegistry.v1';
type CanvasResult =
	| { readonly kind: 'open'; readonly value: OpenCanvasResult }
	| { readonly kind: 'action'; readonly value: InvokeCanvasActionResult }
	| { readonly kind: 'void' };

/** The canonical projection and operation router; transient endpoints never enter durable AHP state. */
export class AgentHostCanvasProtocolAdapter extends Disposable implements IAgentHostCanvasProtocol {
	private readonly _operations = this._register(new AgentHostCanvasOperationLedger<CanvasResult>());
	private readonly _endpoints = new Map<string, { readonly url: string; readonly incarnation: string }>();
	private readonly _restoring = new Map<string, Promise<void>>();
	private readonly _writes = new SequencerByKey<string>();
	private readonly _updates = new Map<string, Promise<void>>();
	private readonly _pendingOpen = new Map<string, number>();
	/** An undefined projection means the registry may have changed in a failed write. */
	private readonly _persisted = new Map<string, string | undefined>();

	constructor(
		private readonly _host: IAgentHostCanvasesService,
		private readonly _providers: IAgentHostProviderService,
		private readonly _state: AgentHostStateManager,
		private readonly _sessionData: ISessionDataService,
		private readonly _logService: ILogService,
	) {
		super();
	}

	get supported(): boolean {
		return this._providers.getProviders().some(provider => provider.supportsCanvasProtocol === true);
	}

	initialize(previewEnabled?: boolean): Promise<void> {
		return this._host.initialize(previewEnabled);
	}

	async listTypes(params: ListCanvasTypesParams): Promise<ListCanvasTypesResult> {
		const chat = URI.parse(params.channel);
		const provider = this._provider(chat);
		const limit = params.limit ?? 64;
		const offset = params.cursor === undefined ? 0 : /^\d+$/.test(params.cursor) ? Number(params.cursor) : NaN;
		if (!Number.isSafeInteger(limit) || limit < 1 || limit > 64 || !Number.isSafeInteger(offset) || offset < 0) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Invalid canvas catalogue pagination.');
		}
		const state = await this._host.getCanvases(chat);
		const types = state.catalog.slice(offset, offset + limit).map(definition => canvasTypeDeclaration(definition, provider.getCanvasSource?.(chat, definition.extensionId)));
		return { types, ...(offset + types.length < state.catalog.length ? { nextCursor: String(offset + types.length) } : {}) };
	}

	async open(clientId: string, params: OpenCanvasParams): Promise<OpenCanvasResult> {
		const replay = this._replay(clientId, params.requestId, { method: 'openCanvas', ...params });
		if (replay) {
			const result = await replay;
			if (result.kind !== 'open') {
				throw new Error('Unexpected canvas open result.');
			}
			return result.value;
		}
		const chat = URI.parse(params.identity.chat);
		const parsed = parseChatUri(chat);
		if (!parsed || parsed.session !== params.channel) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'The canvas chat does not belong to the requested session.');
		}
		const result = await this._run(clientId, chat, params.requestId, { method: 'openCanvas', ...params }, async start => {
			await this.restoreChat(chat);
			const provider = this._provider(chat);
			const extensionId = this._extensionId(params.identity);
			const source = provider.getCanvasSource?.(chat, extensionId) ?? canvasSource(extensionId);
			if (canvasSourceKey(source) !== canvasSourceKey(params.identity.source)) {
				throw new ProtocolError(AhpErrorCodes.PermissionDenied, 'The requested canvas source does not match its owning provider.');
			}
			const identity = { ...params.identity, source };
			await this._host.getCanvases(chat);
			const existing = this._find(identity);
			const collision = this._state.getCanvasState(params.canvas);
			if (!existing && collision) {
				throw new ProtocolError(AhpErrorCodes.Conflict, 'The canvas resource is already owned by a different identity.');
			}
			if (this._state.getChatCanvasStates(chat.toString()).length >= 64 && !existing) {
				throw new ProtocolError(AhpErrorCodes.Conflict, 'The chat has reached its canvas membership limit.');
			}
			const resource = existing?.resource ?? params.canvas;
			if (!existing) {
				this._state.registerCanvas({
					resource, identity: { ...identity, incarnation: generateUuid() }, title: params.title,
					...(params.icon ? { icon: structuredClone(params.icon) } : {}),
					trust: { status: CanvasTrustStatus.Trusted }, availability: { status: CanvasAvailabilityStatus.Loading }, revision: 1,
				}, false);
				this._publishEntry(resource);
			}
			this._pendingOpen.set(resource, (this._pendingOpen.get(resource) ?? 0) + 1);
			let effectsStarted = false;
			const begin = () => {
				start();
				this._state.markCanvasUsed(resource);
				effectsStarted = true;
			};
			try {
				await this._persist(chat);
				await this._host.prepareCanvasExecution(chat, extensionId, begin);
				const raw = await this._host.getCanvases(chat);
				if (!raw.catalog.some(definition => definition.extensionId === extensionId && definition.canvasId === params.identity.canvasType)) {
					throw new ProtocolError(AhpErrorCodes.NotFound, 'The canvas type is not in this chat\'s current catalogue.');
				}
				if (provider.isCanvasExecutionAuthorized?.(chat, extensionId) === false) {
					throw new ProtocolError(AhpErrorCodes.PermissionDenied, 'Canvas execution is not approved for this chat.');
				}
				await this._host.openCanvas(chat, {
					extensionId, canvasId: params.identity.canvasType, instanceId: params.identity.instanceId,
					...(params.input === undefined ? {} : { input: this._input(params.input) }),
				}, begin);
				await this._host.getCanvases(chat);
				await this._persist(chat);
				return { kind: 'open', value: { canvas: canvasEntry(this._require(resource)) } };
			} catch (error) {
				if (!effectsStarted) {
					if (!existing) {
						this._remove(resource);
						await this._persist(chat);
					}
					throw error;
				}
				if (this._state.getCanvasState(resource)) {
					this._availability(resource, { status: CanvasAvailabilityStatus.Failed, error: { errorType: 'canvasOpenIndeterminate', message: 'The canvas open did not finish. Its documents and membership have been preserved.' } });
					await this._persist(chat);
				}
				throw error;
			} finally {
				const remaining = (this._pendingOpen.get(resource) ?? 1) - 1;
				if (remaining > 0) {
					this._pendingOpen.set(resource, remaining);
				} else {
					this._pendingOpen.delete(resource);
				}
			}
		});
		if (result.kind !== 'open') {
			throw new Error('Unexpected canvas open result.');
		}
		return result.value;
	}

	resolveSource(params: ResolveCanvasSourceParams): ResolveCanvasSourceResult {
		const state = this._require(params.channel);
		const endpoint = this._endpoints.get(state.resource);
		return {
			availability: state.availability.status,
			incarnation: state.identity.incarnation,
			revision: state.revision,
			...(endpoint?.incarnation === state.identity.incarnation && (state.availability.status === CanvasAvailabilityStatus.Ready || state.availability.status === CanvasAvailabilityStatus.Empty) ? { source: { url: endpoint.url } } : {}),
		};
	}

	async invokeAction(clientId: string, params: InvokeCanvasActionParams): Promise<InvokeCanvasActionResult> {
		const replay = this._replay(clientId, params.requestId, { method: 'invokeCanvasAction', ...params });
		if (replay) {
			const result = await replay;
			if (result.kind !== 'action') {
				throw new Error('Unexpected canvas action result.');
			}
			return result.value;
		}
		const state = this._require(params.channel);
		const chat = URI.parse(state.identity.chat);
		const result = await this._run(clientId, chat, params.requestId, { method: 'invokeCanvasAction', ...params }, async start => {
			const current = this._require(params.channel);
			this._assertIncarnation(current, params.incarnation);
			if (current.trust.status !== CanvasTrustStatus.Trusted) {
				throw new ProtocolError(AhpErrorCodes.PermissionDenied, 'Canvas execution is not approved.');
			}
			if (current.availability.status !== CanvasAvailabilityStatus.Ready || !current.availability.actions.some(action => action.id === params.actionId)) {
				throw new ProtocolError(AhpErrorCodes.NotFound, 'This canvas does not currently declare that action.');
			}
			const value = await this._host.invokeCanvasAction(chat, { instanceId: current.identity.instanceId, actionName: params.actionId, ...(params.input === undefined ? {} : { input: this._input(params.input) }) }, () => {
				this._assertIncarnation(this._require(params.channel), params.incarnation);
				start();
			});
			return { kind: 'action', value: { result: value } };
		});
		if (result.kind !== 'action') {
			throw new Error('Unexpected canvas action result.');
		}
		return result.value;
	}

	async restart(clientId: string, params: RestartCanvasProviderParams): Promise<void> {
		const replay = this._replay(clientId, params.requestId, { method: 'restartCanvasProvider', ...params });
		if (replay) {
			await replay;
			return;
		}
		const state = this._require(params.channel);
		const chat = URI.parse(state.identity.chat);
		await this._run(clientId, chat, params.requestId, { method: 'restartCanvasProvider', ...params }, async start => {
			const begin = () => {
				this._assertIncarnation(this._require(params.channel), params.incarnation);
				start();
			};
			await this._host.interruptCanvasOperation(chat, begin);
			this._assertIncarnation(this._require(params.channel), params.incarnation);
			const raw = await this._host.getCanvases(chat);
			const current = this._require(params.channel);
			this._assertIncarnation(current, params.incarnation);
			for (const current of this._state.getChatCanvasStates(chat.toString())) {
				this._endpoints.delete(current.resource);
				this._availability(current.resource, { status: CanvasAvailabilityStatus.Loading });
			}
			await this._host.prepareCanvasExecution(chat, this._extensionId(current.identity), begin);
			if (raw.loaded !== false) {
				await this._host.reloadCanvases(chat, begin);
			}
			const refreshed = await this._host.getCanvases(chat);
			if (!refreshed.supported || refreshed.loaded === false) {
				throw new Error('The canvas backing did not materialize for restart.');
			}
			await this._persist(chat);
			return { kind: 'void' };
		});
	}

	async close(clientId: string, params: CloseCanvasParams): Promise<void> {
		const replay = this._replay(clientId, params.requestId, { method: 'closeCanvas', ...params });
		if (replay) {
			await replay;
			return;
		}
		const state = this._state.getCanvasState(params.channel);
		if (!state) {
			return;
		}
		const chat = URI.parse(state.identity.chat);
		await this._run(clientId, chat, params.requestId, { method: 'closeCanvas', ...params }, async start => {
			if (this._pendingOpen.has(params.channel)) {
				throw new ProtocolError(AhpErrorCodes.Conflict, 'The canvas is still opening; refresh its state before closing it.');
			}
			let current = this._state.getCanvasState(params.channel);
			if (!current) {
				return { kind: 'void' };
			}
			if (current.revision !== params.revision) {
				throw new ProtocolError(AhpErrorCodes.Conflict, 'The canvas membership revision is stale.');
			}
			const raw = await this._host.getCanvases(chat);
			if (this._pendingOpen.has(params.channel)) {
				throw new ProtocolError(AhpErrorCodes.Conflict, 'The canvas started opening while its close was being prepared.');
			}
			if (!raw.supported || raw.loaded === false) {
				throw new ProtocolError(AhpErrorCodes.Conflict, 'The canvas backing is not yet loaded; its durable membership cannot be closed safely.');
			}
			current = this._state.getCanvasState(params.channel);
			if (!current) {
				return { kind: 'void' };
			}
			if (current.revision !== params.revision) {
				throw new ProtocolError(AhpErrorCodes.Conflict, 'The canvas membership changed while closing.');
			}
			const closing = current;
			if (raw.instances.some(instance => instance.instanceId === closing.identity.instanceId && instance.canvasId === closing.identity.canvasType && instance.extensionId === this._extensionId(closing.identity))) {
				await this._host.closeCanvas(chat, closing.identity.instanceId, start);
			} else {
				start();
			}
			this._remove(params.channel);
			await this._persist(chat);
			return { kind: 'void' };
		});
	}

	update(provider: IAgent, chat: URI, raw: IAgentHostCanvasState): Promise<void> {
		const key = chat.toString();
		const updating = this._update(provider, chat, raw, () => this._updates.get(key) === updating);
		this._updates.set(key, updating);
		const settled = () => {
			if (this._updates.get(key) === updating) {
				this._updates.delete(key);
			}
		};
		void updating.then(settled, settled);
		return updating;
	}

	async whenIdle(chat: URI): Promise<void> {
		while (this._updates.has(chat.toString())) {
			await this._updates.get(chat.toString());
		}
		while (this._writes.peek(chat.toString())) {
			await this._writes.peek(chat.toString());
		}
	}

	private async _update(provider: IAgent, chat: URI, raw: IAgentHostCanvasState, isCurrent: () => boolean): Promise<void> {
		if (!provider.supportsCanvasProtocol && !this._state.getChatCanvasStates(chat.toString()).length) {
			return;
		}
		await this.restoreChat(chat);
		const parsed = parseChatUri(chat);
		if (!isCurrent() || this._store.isDisposed || !parsed || !this._state.getSessionState(parsed.session)?.chats.some(summary => summary.resource === chat.toString())) {
			return;
		}
		const prior = this._state.getChatCanvasStates(chat.toString());
		if (!raw.supported || raw.loaded === false) {
			for (const state of prior) {
				this._endpoints.delete(state.resource);
				if (state.availability.status !== CanvasAvailabilityStatus.Failed) {
					this._availability(state.resource, { status: raw.supported ? CanvasAvailabilityStatus.NotLoaded : CanvasAvailabilityStatus.Unsupported });
				}
			}
			return;
		}
		if (raw.instances.length > 64) {
			throw new ProtocolError(AhpErrorCodes.Conflict, 'The provider exceeded the per-chat canvas membership limit.');
		}
		for (const instance of raw.instances) {
			const definition = raw.catalog.find(definition => definition.extensionId === instance.extensionId && definition.canvasId === instance.canvasId);
			const identity: CanvasIdentityKey = { chat: chat.toString(), source: provider.getCanvasSource?.(chat, instance.extensionId) ?? canvasSource(instance.extensionId), canvasType: instance.canvasId, instanceId: instance.instanceId };
			if (!isCanvasIdentityKey(identity)) {
				throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'The provider returned an invalid canvas identity.');
			}
			let state = this._find(identity);
			const trust = provider.isCanvasExecutionAuthorized?.(chat, instance.extensionId) === false ? { status: CanvasTrustStatus.Blocked } as const : { status: CanvasTrustStatus.Trusted } as const;
			let availability: CanvasAvailabilityState;
			try {
				availability = canvasAvailability(instance, definition);
			} catch (error) {
				this._logService.warn('[CanvasProtocol] Canvas declarations cannot be represented inline.', error);
				availability = { status: CanvasAvailabilityStatus.Failed, error: { errorType: 'canvasDeclarationLimit', message: 'The canvas declarations exceed the supported inline limits.' } };
			}
			if (!state) {
				state = { resource: URI.from({ scheme: AgentHostCanvasScheme, path: `/${generateUuid()}` }).toString(), identity: { ...identity, incarnation: generateUuid() }, title: (instance.title ?? definition?.displayName ?? instance.canvasId).slice(0, 512), trust, availability, revision: 1 };
				this._state.registerCanvas(state);
			} else {
				if (instance.title !== undefined && state.title !== instance.title.slice(0, 512)) {
					this._state.dispatchServerAction(state.resource, { type: ActionType.CanvasTitleChanged, title: instance.title.slice(0, 512), revision: state.revision + 1 });
					state = this._require(state.resource);
				}
				if (!equals(state.trust, trust)) {
					this._state.dispatchServerAction(state.resource, { type: ActionType.CanvasTrustChanged, trust, revision: state.revision + 1 });
				}
				if (instance.availability === 'ready' && this._endpoints.get(state.resource)?.url !== instance.url) {
					const current = this._require(state.resource);
					this._state.dispatchServerAction(state.resource, { type: ActionType.CanvasIncarnationChanged, incarnation: generateUuid(), revision: current.revision + 1 });
				}
				this._availability(state.resource, availability);
			}
			state = this._require(state.resource);
			if (instance.availability === 'ready' && availability.status === CanvasAvailabilityStatus.Ready && trust.status === CanvasTrustStatus.Trusted) {
				this._endpoints.set(state.resource, { url: instance.url, incarnation: state.identity.incarnation });
			} else {
				this._endpoints.delete(state.resource);
			}
			this._publishEntry(state.resource);
		}
		for (const state of prior) {
			if (!this._pendingOpen.has(state.resource) && state.availability.status !== CanvasAvailabilityStatus.Failed
				&& !raw.instances.some(instance => instance.instanceId === state.identity.instanceId && instance.canvasId === state.identity.canvasType && canvasSourceKey(provider.getCanvasSource?.(chat, instance.extensionId) ?? canvasSource(instance.extensionId)) === canvasSourceKey(state.identity.source))) {
				this._remove(state.resource);
			}
		}
		await this._persist(chat);
	}

	async restoreChat(chat: URI): Promise<void> {
		let restoring = this._restoring.get(chat.toString());
		if (!restoring) {
			restoring = this._restoreChat(chat, () => this._restoring.get(chat.toString()) === restoring);
			this._restoring.set(chat.toString(), restoring);
			void restoring.catch(() => {
				if (this._restoring.get(chat.toString()) === restoring) {
					this._restoring.delete(chat.toString());
				}
			});
		}
		await restoring;
	}

	private async _restoreChat(chat: URI, isCurrent: () => boolean): Promise<void> {
		const reference = await this._sessionData.tryOpenDatabase(chat);
		if (!reference) {
			return;
		}
		try {
			const serialized = await reference.object.getMetadata(REGISTRY_KEY);
			if (!isCurrent() || this._store.isDisposed) {
				return;
			}
			if (!serialized) {
				return;
			}
			if (serialized.length > 2 * 1024 * 1024) {
				throw new Error('The persisted canvas registry exceeds its size limit.');
			}
			const values: unknown = JSON.parse(serialized);
			if (!Array.isArray(values) || values.length > 64) {
				throw new Error('Invalid persisted canvas registry.');
			}
			if (!values.every(isPersistedCanvas) || values.some(value => value.identity.chat !== chat.toString())) {
				throw new Error('Invalid persisted canvas identity.');
			}
			this._persisted.set(chat.toString(), serialized);
			for (const value of values) {
				if (!this._state.getCanvasState(value.resource)) {
					const availability: CanvasAvailabilityState = value.availability === CanvasAvailabilityStatus.Failed || value.availability === CanvasAvailabilityStatus.Loading
						? { status: CanvasAvailabilityStatus.Failed, error: { errorType: 'canvasRestoreIndeterminate', message: 'A previous canvas operation did not finish. Its documents and membership have been preserved.' } }
						: { status: CanvasAvailabilityStatus.NotLoaded };
					this._state.registerCanvas({ resource: value.resource, identity: { ...value.identity, incarnation: generateUuid() }, title: value.title, ...(value.icon ? { icon: value.icon } : {}), trust: { status: CanvasTrustStatus.Pending }, availability, revision: value.revision + 1 });
					this._publishEntry(value.resource);
				}
			}
		} finally {
			reference.dispose();
		}
	}

	disposeChat(chat: URI): void {
		this._operations.invalidateChat(chat);
		this._restoring.delete(chat.toString());
		this._updates.delete(chat.toString());
		this._persisted.delete(chat.toString());
		for (const state of this._state.getChatCanvasStates(chat.toString())) {
			this._remove(state.resource);
		}
	}

	private _persist(chat: URI): Promise<void> {
		const key = chat.toString();
		const values = this._state.getChatCanvasStates(key).map(canvasEntry);
		if (!values.length && !this._persisted.has(key) && !this._writes.peek(key)) {
			return Promise.resolve();
		}
		const serialized = JSON.stringify(values);
		const restoration = this._restoring.get(key);
		return this._writes.queue(key, async () => {
			if (this._persisted.get(key) === serialized) {
				return;
			}
			this._persisted.set(key, undefined);
			const reference = this._sessionData.openDatabase(chat);
			try {
				await reference.object.setMetadata(REGISTRY_KEY, serialized);
				if (!this._store.isDisposed && this._restoring.get(key) === restoration) {
					this._persisted.set(key, serialized);
				}
			} finally {
				reference.dispose();
			}
		});
	}

	private _provider(chat: URI): IAgent {
		const parsed = parseChatUri(chat);
		const provider = parsed && this._providers.getProviderForSession(parsed.session);
		if (!provider?.supportsCanvasProtocol) {
			throw new ProtocolError(AhpErrorCodes.PermissionDenied, 'This chat does not support the canvas protocol.');
		}
		return provider;
	}

	private _find(identity: CanvasIdentityKey): CanvasState | undefined {
		return this._state.getChatCanvasStates(identity.chat).find(state => canvasIdentityKey(state.identity) === canvasIdentityKey(identity));
	}

	private _extensionId(identity: CanvasIdentityKey): string {
		return identity.source.kind === CanvasSourceKind.Extension ? identity.source.extensionId : identity.source.sourceId;
	}

	private _require(resource: string): CanvasState {
		const state = isAgentHostCanvasUri(resource) && this._state.getCanvasState(resource);
		if (!state) {
			throw new ProtocolError(AhpErrorCodes.NotFound, 'There is no such canvas.');
		}
		return state;
	}

	private _input(input: unknown) {
		if (!isAgentHostCanvasJson(input)) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Canvas input must be bounded JSON.');
		}
		return input;
	}

	private _assertIncarnation(state: CanvasState, incarnation: string): void {
		if (state.identity.incarnation !== incarnation) {
			throw new ProtocolError(AhpErrorCodes.Conflict, 'The canvas incarnation is stale.');
		}
	}

	private _availability(resource: string, availability: CanvasAvailabilityState): void {
		const state = this._require(resource);
		if (!equals(state.availability, availability)) {
			this._state.dispatchServerAction(resource, { type: ActionType.CanvasAvailabilityChanged, availability, revision: state.revision + 1 });
		}
		this._publishEntry(resource);
	}

	private _publishEntry(resource: string): void {
		const state = this._require(resource);
		const parsed = parseChatUri(state.identity.chat);
		if (parsed && this._state.getSessionState(parsed.session)) {
			const entry = canvasEntry(state);
			if (!equals(this._state.getSessionState(parsed.session)?.canvases?.find(value => value.resource === resource), entry)) {
				this._state.dispatchServerAction(parsed.session, { type: ActionType.SessionCanvasSet, canvas: entry });
			}
		}
	}

	private _remove(resource: string): void {
		const state = this._state.getCanvasState(resource);
		const parsed = state && parseChatUri(state.identity.chat);
		this._endpoints.delete(resource);
		this._state.removeCanvas(resource);
		if (parsed && this._state.getSessionState(parsed.session)) {
			this._state.dispatchServerAction(parsed.session, { type: ActionType.SessionCanvasRemoved, resource });
		}
	}

	private _replay(clientId: string, requestId: string, params: object): Promise<CanvasResult> | undefined {
		if (!isAgentHostCanvasJson(params)) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Canvas parameters exceed the supported JSON limits.');
		}
		try {
			return this._operations.replay(clientId, requestId, params)?.catch(error => this._throwProtocolError(error));
		} catch (error) {
			this._throwProtocolError(error);
		}
	}

	private _throwProtocolError(error: unknown): never {
		if (error instanceof CanvasRequestConflictError || error instanceof CanvasStaleTargetError) {
			throw new ProtocolError(AhpErrorCodes.Conflict, error.message);
		}
		if (error instanceof CanvasOperationIndeterminateError) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, error.message, { outcome: 'indeterminate' });
		}
		throw error;
	}

	private async _run(clientId: string, chat: URI, requestId: string, params: object, operation: (start: () => void) => Promise<CanvasResult>): Promise<CanvasResult> {
		if (!isAgentHostCanvasJson(params)) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Canvas parameters exceed the supported JSON limits.');
		}
		try {
			return await this._operations.execute({ clientId, chat, requestId }, params, async execution => {
				const provider = this._provider(chat);
				this._host.assertOperationAllowed(chat);
				return operation(() => {
					if (this._provider(chat) !== provider) {
						throw new CanvasStaleTargetError();
					}
					this._host.assertOperationAllowed(chat);
					execution.startEffects();
				});
			});
		} catch (error) {
			this._throwProtocolError(error);
		}
	}

	override dispose(): void {
		this._endpoints.clear();
		this._restoring.clear();
		this._updates.clear();
		this._persisted.clear();
		super.dispose();
	}
}

function isPersistedCanvas(value: unknown): value is Pick<CanvasEntry, 'resource' | 'identity' | 'title' | 'icon' | 'availability' | 'revision'> {
	if (!isRecord(value) || !isRecord(value.identity)) {
		return false;
	}
	return typeof value.resource === 'string' && isAgentHostCanvasUri(value.resource)
		&& isCanvasIdentityKey(value.identity) && typeof value.identity.incarnation === 'string'
		&& typeof value.title === 'string' && value.title.length <= 512
		&& (value.icon === undefined || isCanvasIcon(value.icon))
		&& (value.availability === CanvasAvailabilityStatus.Unsupported || value.availability === CanvasAvailabilityStatus.NotLoaded
			|| value.availability === CanvasAvailabilityStatus.Loading || value.availability === CanvasAvailabilityStatus.Empty
			|| value.availability === CanvasAvailabilityStatus.Ready || value.availability === CanvasAvailabilityStatus.Failed)
		&& typeof value.revision === 'number' && Number.isSafeInteger(value.revision) && value.revision >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

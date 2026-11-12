/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { constObservable, derived, derivedOpts, IObservable, IReader, mapObservableArrayCached } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IAgentConnection } from '../../../../platform/agentHost/common/agentService.js';
import { getInlineToolInput, parsePartialToolInput } from '../../../../platform/agentHost/common/partialToolInput.js';
import { IAgentSubscription, observableFromSubscription } from '../../../../platform/agentHost/common/state/agentSubscription.js';
import { CanvasReference, CanvasState } from '../../../../platform/agentHost/common/state/protocol/channels-canvas/state.js';
import { CanvasRegistryStatus, type CanvasRegistryState, type CanvasesState } from '../../../../platform/agentHost/common/state/protocol/channels-canvases/state.js';
import { ActionType } from '../../../../platform/agentHost/common/state/sessionActions.js';
import { ActiveTurn, ChatState, ResponsePartKind, RootState, StateComponents, ToolCallStatus, Turn } from '../../../../platform/agentHost/common/state/sessionState.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { type CanvasDefinitionSnapshot, ICanvasContext, ICanvasDefinition, ICanvasDefinitionProvider, type ICanvasListOptions, ICanvasOpenRequest } from './canvas.js';
import { ICanvas, ICanvasOwner } from '../../../common/canvasReference.js';

export class AgentHostCanvas implements ICanvas {
	readonly resource: URI;
	readonly instanceId: string | undefined;
	readonly title: string;
	readonly status: string | undefined;
	readonly source: URI | undefined;
	readonly extensionId: string | undefined;
	readonly canvasId: string | undefined;

	constructor(
		resource: URI,
		canvas: CanvasState | undefined,
		@ILogService logService: ILogService,
	) {
		this.resource = resource;
		this.instanceId = canvas?.instanceId;
		this.extensionId = canvas?.extensionId;
		this.canvasId = canvas?.canvasId;
		this.title = canvas?.title ?? canvas?.extensionName ?? canvas?.canvasId ?? localize('canvas.pendingTitle', "Canvas");
		this.status = canvas?.status;
		if (canvas?.url !== undefined) {
			try {
				const source = URI.parse(canvas.url, true);
				if ((source.scheme === Schemas.http || source.scheme === Schemas.https) && source.authority) {
					this.source = source;
				} else {
					logService.warn('[AgentHostCanvas] Unsupported canvas source');
				}
			} catch {
				logService.warn('[AgentHostCanvas] Invalid canvas source');
			}
		}
	}
}

const requestedRegistries = new WeakMap<IAgentSubscription<CanvasesState>, CanvasRegistryState>();

/** Observes host-advertised collection state without activating the canvas runtime. */
export class AgentHostCanvases {
	readonly resource: IObservable<string | undefined>;
	readonly state: IObservable<CanvasesState | Error | undefined>;
	readonly registry: IObservable<CanvasRegistryState | undefined>;
	readonly references: IObservable<readonly CanvasReference[] | undefined>;
	private readonly subscription;
	private retryRequested = false;

	constructor(
		private readonly connection: IObservable<IAgentConnection | undefined>,
		private readonly chat: IObservable<ChatState | undefined>,
	) {
		this.resource = chat.map(value => value?.canvasesUri);
		this.subscription = derived(this, reader => {
			const resource = this.resource.read(reader);
			const connection = this.connection.read(reader);
			if (!resource || !connection) {
				return undefined;
			}
			connection.initializeResult.read(reader);
			return reader.store.add(connection.getSubscription(StateComponents.Canvases, URI.parse(resource, true), 'AgentHostCanvases')).object;
		});
		const state = derived(this, reader => {
			const subscription = this.subscription.read(reader);
			return subscription ? observableFromSubscription(this, subscription) : constObservable(undefined);
		});
		this.state = derived(this, reader => state.read(reader).read(reader));
		this.registry = this.state.map(value => value && !(value instanceof Error) ? value.registry : undefined);
		this.references = derived(this, reader => {
			const currentChat = chat.read(reader);
			if (!currentChat) {
				return undefined;
			}
			if (!currentChat.canvasesUri) {
				return currentChat.canvases ?? [];
			}
			const state = this.state.read(reader);
			return state && !(state instanceof Error) ? state.canvases : undefined;
		});
	}

	listCanvases(options?: ICanvasListOptions): CanvasDefinitionSnapshot {
		this.retryRequested ||= options?.retry === true;
		const state = this.state.get();
		if (state instanceof Error) {
			throw state;
		}
		const resource = this.resource.get();
		if (!resource) {
			if (this.chat.get()) {
				this.retryRequested = false;
				return [];
			}
			return undefined;
		}
		if (!state) {
			return undefined;
		}
		const subscription = this.subscription.get();
		const registry = state.registry;
		const activate = subscription !== undefined && registry.status === CanvasRegistryStatus.Uninitialized && requestedRegistries.get(subscription) !== registry;
		const retry = registry.status === CanvasRegistryStatus.Error && this.retryRequested;
		if (subscription && !subscription.hasPendingActions && (activate || retry)) {
			const previous = requestedRegistries.get(subscription);
			requestedRegistries.set(subscription, registry);
			try {
				this.connection.get()?.dispatch(resource, { type: ActionType.CanvasesRegistryRequested });
				this.retryRequested = false;
			} catch (error) {
				if (previous) {
					requestedRegistries.set(subscription, previous);
				} else {
					requestedRegistries.delete(subscription);
				}
				throw error;
			}
			return undefined;
		}
		if (registry.status === CanvasRegistryStatus.Ready) {
			this.retryRequested = false;
		}
		return getAgentHostCanvasDefinitions(registry);
	}
}

export class AgentHostCanvasCollection extends Disposable {
	private readonly rootState: IObservable<RootState | Error | undefined> | undefined;

	constructor(
		readonly providerId: string,
		private readonly connection: IAgentConnection,
		private readonly agentProvider: string | undefined,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.rootState = connection.rootState ? observableFromSubscription(this, connection.rootState) : undefined;
	}

	supportsCommands(chat: ChatState | undefined, reader: IReader): boolean {
		const root = this.rootState?.read(reader);
		const provider = chat?.provider ?? this.agentProvider;
		if (!provider || root instanceof Error) {
			return false;
		}
		return root?.agents.find(agent => agent.provider === provider)?.capabilities?.canvases !== undefined;
	}

	createContext(owner: ICanvasOwner, chat: IObservable<ChatState | undefined>, supportsCommands = false): ICanvasContext {
		const collection = new AgentHostCanvases(constObservable(this.connection), chat);
		const references = collection.references;
		const states = mapObservableArrayCached(this, references.map(value => value ?? []), canvas => {
			const resource = URI.parse(canvas.resource, true);
			const subscription = derived(this, reader => {
				this.connection.initializeResult.read(reader);
				const reference = reader.store.add(this.connection.getSubscription(StateComponents.Canvas, resource, 'AgentHostCanvasCollection'));
				return observableFromSubscription(this, reference.object);
			});
			return derived(this, reader => {
				const state = subscription.read(reader).read(reader);
				return new AgentHostCanvas(resource, state && !(state instanceof Error) ? state : undefined, this.logService);
			});
		}, canvas => canvas.resource);
		const canvases = derived(this, reader => references.read(reader) === undefined ? undefined : states.read(reader).map(state => state.read(reader)));
		const openRequests = derivedOpts<ReadonlyMap<string, ICanvasOpenRequest>>({
			owner: this,
			equalsFn: (first, second) => first.size === second.size && [...first].every(([key, value]) => {
				const other = second.get(key);
				return !!other && value.id === other.id && value.succeeded === other.succeeded && value.pending === other.pending;
			}),
		}, reader => getOpenRequests(chat.read(reader), canvases.read(reader)));
		const definitionProvider: ICanvasDefinitionProvider | undefined = supportsCommands && this.connection.openCanvas
			? {
				onDidChangeDefinitions: Event.any(Event.fromObservableLight(collection.registry), Event.fromObservableLight(collection.state.map(state => state instanceof Error ? state : undefined))),
				listCanvases: async options => collection.listCanvases(options),
				openCanvas: (canvas: ICanvasDefinition, instanceId: string) => {
					const resource = collection.resource.get();
					if (!resource) {
						throw new Error(localize('canvas.collectionUnavailable', "The canvas collection is unavailable for this chat."));
					}
					const unavailable = canvases.get()?.find(candidate => candidate.source === undefined
						&& candidate.instanceId === instanceId && candidate.extensionId === canvas.extensionId && candidate.canvasId === canvas.canvasId);
					return this.connection.openCanvas!({
						channel: (unavailable?.resource ?? URI.from({ scheme: 'ahp-canvas', path: `/${generateUuid()}` })).toString(),
						canvases: resource,
						canvasId: canvas.canvasId,
						extensionId: canvas.extensionId,
					});
				},
			}
			: undefined;
		const closeCanvas = supportsCommands && this.connection.disposeCanvas
			? (canvas: ICanvas) => this.connection.disposeCanvas!(canvas.resource)
			: undefined;
		return { owner, canvases, openRequests, definitionProvider, closeCanvas };
	}
}

export function getAgentHostCanvasDefinitions(registry: CanvasRegistryState | undefined): CanvasDefinitionSnapshot {
	if (registry?.status === CanvasRegistryStatus.Error) {
		throw new Error(registry.error.message);
	}
	if (registry?.status !== CanvasRegistryStatus.Ready) {
		return undefined;
	}
	return registry.extensions.flatMap(extension => extension.canvases.map(canvas => ({
		canvasId: canvas.id,
		extensionId: extension.id,
		extensionSource: 'unknown',
		...(extension.label !== undefined ? { extensionName: extension.label } : {}),
		displayName: canvas.label,
		description: canvas.description,
		...(canvas.inputSchema !== undefined ? { inputSchema: canvas.inputSchema } : {}),
		requiresInput: canvasRequiresInput(canvas.inputSchema),
	})));
}

function canvasRequiresInput(inputSchema: unknown): boolean {
	if (inputSchema === null || typeof inputSchema !== 'object' || Array.isArray(inputSchema)) {
		return false;
	}
	const required = (inputSchema as { readonly required?: unknown }).required;
	return Array.isArray(required) && required.some(value => typeof value === 'string' && value.trim().length > 0);
}

/**
 * Latest `open_canvas` request per instance for a completed history. The reducer never mutates a `turns` array or a completed turn in place
 * (every change allocates a new array), so the result is keyed by array identity. The backward scan is resumable and stops once the requested instances are resolved.
 */
const completedOpenRequests = new WeakMap<readonly Turn[], { readonly requests: Map<string, ICanvasOpenRequest>; nextTurnIndex: number }>();

function collectOpenRequests(turn: Turn | ActiveTurn, requests: Map<string, ICanvasOpenRequest>, instances: ReadonlySet<string> | undefined): void {
	const parts = turn.responseParts;
	for (let partIndex = parts.length - 1; partIndex >= 0; partIndex--) {
		const part = parts[partIndex];
		if (part.kind !== ResponsePartKind.ToolCall || part.toolCall.toolName !== 'open_canvas') {
			continue;
		}
		const call = part.toolCall;
		if (call.status !== ToolCallStatus.Running && call.status !== ToolCallStatus.Completed && call.status !== ToolCallStatus.Cancelled) {
			continue;
		}
		const input = getInlineToolInput(call.toolInput);
		const instanceId = input ? parsePartialToolInput(input)?.instanceId : undefined;
		if (typeof instanceId === 'string' && (!instances || instances.has(instanceId)) && !requests.has(instanceId)) {
			requests.set(instanceId, {
				id: `${turn.id}\u0000${call.toolCallId}`,
				succeeded: call.status === ToolCallStatus.Completed && call.success,
				...(call.status === ToolCallStatus.Running ? { pending: true } : {}),
			});
		}
	}
}

function getOpenRequests(chat: ChatState | undefined, canvases: readonly ICanvas[] | undefined): ReadonlyMap<string, ICanvasOpenRequest> {
	const requests = new Map<string, ICanvasOpenRequest>();
	const instances = new Set(canvases?.flatMap(canvas => canvas.instanceId ? [canvas.instanceId] : []) ?? []);
	if (!chat || instances.size === 0) {
		return requests;
	}
	if (chat.activeTurn) {
		collectOpenRequests(chat.activeTurn, requests, instances);
	}
	if (requests.size < instances.size) {
		let completed = completedOpenRequests.get(chat.turns);
		if (!completed) {
			completedOpenRequests.set(chat.turns, completed = { requests: new Map(), nextTurnIndex: chat.turns.length - 1 });
		}
		// Resume the backward scan only as far as needed to resolve the current instances.
		const isResolved = (instanceId: string) => requests.has(instanceId) || completed.requests.has(instanceId);
		while (completed.nextTurnIndex >= 0 && !Array.from(instances).every(isResolved)) {
			collectOpenRequests(chat.turns[completed.nextTurnIndex--], completed.requests, undefined);
		}
		for (const instanceId of instances) {
			const request = completed.requests.get(instanceId);
			if (request && !requests.has(instanceId)) {
				requests.set(instanceId, request);
			}
		}
	}
	return requests;
}

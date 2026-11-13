/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { derived, derivedOpts, IObservable, mapObservableArrayCached } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IAgentConnection } from '../../../../platform/agentHost/common/agentService.js';
import { getInlineToolInput, parsePartialToolInput } from '../../../../platform/agentHost/common/partialToolInput.js';
import { IAgentSubscription, observableFromSubscription } from '../../../../platform/agentHost/common/state/agentSubscription.js';
import { CanvasReference, CanvasState } from '../../../../platform/agentHost/common/state/protocol/channels-canvas/state.js';
import { ActionType, type ActionEnvelope } from '../../../../platform/agentHost/common/state/sessionActions.js';
import { ActiveTurn, ChatState, ResponsePartKind, StateComponents, ToolCallStatus, Turn } from '../../../../platform/agentHost/common/state/sessionState.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ICanvasContext, ICanvasDefinition, ICanvasDefinitionProvider, ICanvasOpenRequest } from './canvas.js';
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

export class AgentHostCanvasCollection extends Disposable {

	constructor(
		readonly providerId: string,
		private readonly connection: IAgentConnection,
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	createContext(owner: ICanvasOwner, references: IObservable<readonly CanvasReference[] | undefined>, chat?: IObservable<ChatState | undefined>, onDidChangeDefinitions: Event<void> = Event.None): ICanvasContext {
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
		const openRequests = chat ? derivedOpts<ReadonlyMap<string, ICanvasOpenRequest>>({
			owner: this,
			equalsFn: (first, second) => first.size === second.size && [...first].every(([key, value]) => {
				const other = second.get(key);
				return !!other && value.id === other.id && value.succeeded === other.succeeded && value.pending === other.pending;
			}),
		}, reader => getOpenRequests(chat.read(reader), canvases.read(reader))) : undefined;
		const definitionProvider: ICanvasDefinitionProvider | undefined = this.connection.listSessionCanvases && this.connection.openSessionCanvas
			? {
				onDidChangeDefinitions,
				listCanvases: () => this.connection.listSessionCanvases!(owner.session, owner.chat),
				openCanvas: (canvas: ICanvasDefinition, instanceId: string) => this.connection.openSessionCanvas!(owner.session, {
					canvasId: canvas.canvasId,
					extensionId: canvas.extensionId,
					instanceId,
				}, owner.chat),
			}
			: undefined;
		const closeCanvas = this.connection.closeSessionCanvas
			? (canvas: ICanvas) => this.connection.closeSessionCanvas!(owner.session, { resource: canvas.resource }, owner.chat)
			: undefined;
		return { owner, canvases, openRequests, definitionProvider, closeCanvas };
	}
}

export function getAgentHostCanvasDefinitionsChangedEvent(subscription: IAgentSubscription<ChatState>): Event<void> {
	const onDidCancelSnapshotRefresh: Event<readonly ActionEnvelope[]> = subscription.onDidCancelSnapshotRefresh ?? Event.None;
	return Event.any(
		Event.map(Event.filter(subscription.onDidApplyAction, envelope => envelope.action.type === ActionType.ChatCanvasesChanged), () => undefined),
		Event.map(subscription.onDidApplySnapshot ?? Event.None, () => undefined),
		Event.map(Event.filter(
			onDidCancelSnapshotRefresh,
			envelopes => envelopes.some(envelope => !envelope.rejectionReason && envelope.action.type === ActionType.ChatCanvasesChanged),
		), () => undefined),
	);
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

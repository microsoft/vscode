/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { derived, derivedOpts, IObservable, mapObservableArrayCached } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IAgentConnection } from '../../../../platform/agentHost/common/agentService.js';
import { getInlineToolInput, parsePartialToolInput } from '../../../../platform/agentHost/common/partialToolInput.js';
import { observableFromSubscription } from '../../../../platform/agentHost/common/state/agentSubscription.js';
import { CanvasReference, CanvasState } from '../../../../platform/agentHost/common/state/protocol/channels-canvas/state.js';
import { ChatState, ResponsePartKind, StateComponents, ToolCallStatus } from '../../../../platform/agentHost/common/state/sessionState.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ICanvas, ICanvasContext, ICanvasOpenRequest, ICanvasOwner } from './canvas.js';

export class AgentHostCanvas implements ICanvas {
	readonly resource: URI;
	readonly instanceId: string | undefined;
	readonly title: string;
	readonly status: string | undefined;
	readonly source: URI | undefined;

	constructor(
		resource: URI,
		canvas: CanvasState | undefined,
		@ILogService logService: ILogService,
	) {
		this.resource = resource;
		this.instanceId = canvas?.instanceId;
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

	createContext(owner: ICanvasOwner, references: IObservable<readonly CanvasReference[] | undefined>, chat?: IObservable<ChatState | undefined>): ICanvasContext {
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
			equalsFn: (first, second) => first.size === second.size && [...first].every(([key, value]) => value.id === second.get(key)?.id && value.succeeded === second.get(key)?.succeeded),
		}, reader => getOpenRequests(chat.read(reader), canvases.read(reader))) : undefined;
		return { owner, canvases, openRequests };
	}
}

function getOpenRequests(chat: ChatState | undefined, canvases: readonly ICanvas[] | undefined): ReadonlyMap<string, ICanvasOpenRequest> {
	const requests = new Map<string, ICanvasOpenRequest>();
	const instances = new Set(canvases?.flatMap(canvas => canvas.instanceId ? [canvas.instanceId] : []) ?? []);
	if (!chat || instances.size === 0) {
		return requests;
	}
	const turns = chat.activeTurn ? [...chat.turns, chat.activeTurn] : chat.turns;
	for (let turnIndex = turns.length - 1; turnIndex >= 0 && requests.size < instances.size; turnIndex--) {
		const turn = turns[turnIndex];
		for (let partIndex = turn.responseParts.length - 1; partIndex >= 0; partIndex--) {
			const part = turn.responseParts[partIndex];
			if (part.kind !== ResponsePartKind.ToolCall || part.toolCall.toolName !== 'open_canvas') {
				continue;
			}
			const call = part.toolCall;
			if (call.status !== ToolCallStatus.Running && call.status !== ToolCallStatus.Completed && call.status !== ToolCallStatus.Cancelled) {
				continue;
			}
			const input = getInlineToolInput(call.toolInput);
			const instanceId = input ? parsePartialToolInput(input)?.instanceId : undefined;
			if (typeof instanceId === 'string' && instances.has(instanceId) && !requests.has(instanceId)) {
				requests.set(instanceId, { id: `${turn.id}\u0000${call.toolCallId}`, succeeded: call.status === ToolCallStatus.Completed && call.success });
			}
		}
	}
	return requests;
}

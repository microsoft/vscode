/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IReference } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { getComparisonKey } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import type { AgentConnectionAction, IAgentConnection } from '../agentService.js';
import { AGENT_HOST_SCHEME, type IAgentHostResourceUriMapper } from '../agentHostUri.js';
import { AGENT_CLIENT_SCHEME } from '../agentClientUri.js';
import type { IAgentHostPlanReview, INativeAgentHostPlanReview } from '../agentHostPlanReview.js';
import { isAnnotationsUri, parseAnnotationsUri } from '../annotationsUri.js';
import { isChangesetUri } from '../changesetUri.js';
import { OTLP_CHANNEL_SCHEME } from '../otlp/otlpLogEmitter.js';
import { IAgentSubscription } from './agentSubscription.js';
import { decodeAnnotationsActionEnvelope, decodeAnnotationsState, decodeInitializeResult, encodeClientAnnotationsAction, type IAgentHostUriProjectionContext, type NativeAnnotationsActionEnvelope, type NativeAnnotationsState, type NativeClientAnnotationsAction, type NativeInitializeResult } from './agentHostUriProjection.generated.js';
import { ActionType, type ActionEnvelope, type ChatAction, type ClientAnnotationsAction, type ClientChangesetAction, type IRootConfigChangedAction, type SessionAction, type TerminalAction } from './sessionActions.js';
import { isAhpChatChannel, isAhpResourceWatchChannel, isAhpRootChannel, ROOT_STATE_URI, StateComponents, type AnnotationsState } from './sessionState.js';

const externalSchemes = new Set<string>([Schemas.http, Schemas.https, Schemas.data]);
type WireAgentConnectionAction = SessionAction | ChatAction | TerminalAction | ClientChangesetAction | ClientAnnotationsAction | IRootConfigChangedAction;

function isNativeClientAnnotationsAction(action: AgentConnectionAction): action is NativeClientAnnotationsAction {
	return action.type.startsWith('annotations/');
}

function isWireClientAnnotationsAction(action: AgentConnectionAction): action is ClientAnnotationsAction {
	switch (action.type) {
		case ActionType.AnnotationsSet:
			return typeof action.annotation.resource === 'string';
		case ActionType.AnnotationsUpdated:
			return typeof action.resource === 'string' || typeof action.origin?.session === 'string';
		case ActionType.AnnotationsRemoved:
		case ActionType.AnnotationsEntrySet:
		case ActionType.AnnotationsEntryRemoved:
			return true;
		default:
			return false;
	}
}

export interface IAgentHostUriProjectionPolicy extends IAgentHostUriProjectionContext {
	registerChannel(value: string | URI): void;
}

/**
 * Classifies and routes generated URI projections as documented in {@link ./URI_PROJECTION.md}.
 */
class AgentHostUriProjectionContext implements IAgentHostUriProjectionPolicy {
	private readonly channels = new Map<string, string>();

	constructor(private readonly resourceUris: IAgentHostResourceUriMapper) {
		this.registerChannel(ROOT_STATE_URI);
	}

	registerChannel(value: string | URI): void {
		const raw = typeof value === 'string' ? value : value.toString();
		this.channels.set(getComparisonKey(URI.parse(raw)), raw);
	}

	decodeUri(value: string): URI {
		const uri = URI.parse(value);
		return this.isChannel(uri, value) || this.isPreservedOnDecode(uri)
			? uri
			: this.resourceUris.fromAgentHost(uri);
	}

	encodeUri(value: URI): string {
		if (isAhpRootChannel(value.toString())) {
			return ROOT_STATE_URI;
		}
		if (this.isChannel(value) || this.isPreservedOnEncode(value)) {
			return this.channels.get(getComparisonKey(value)) ?? value.toString();
		}
		return this.resourceUris.toAgentHost(value).toString();
	}

	private isChannel(uri: URI, raw = uri.toString()): boolean {
		const scheme = uri.scheme.toLowerCase();
		return this.channels.has(getComparisonKey(uri))
			|| isAhpRootChannel(raw)
			|| isAhpChatChannel(raw)
			|| isAhpResourceWatchChannel(raw)
			|| isAnnotationsUri(raw)
			|| isChangesetUri(raw)
			|| scheme === OTLP_CHANNEL_SCHEME
			|| scheme === 'mcp';
	}

	private isPreservedOnDecode(uri: URI): boolean {
		return this.isPreservedOnEncode(uri) || uri.scheme.toLowerCase() === AGENT_HOST_SCHEME;
	}

	private isPreservedOnEncode(uri: URI): boolean {
		const scheme = uri.scheme.toLowerCase();
		return externalSchemes.has(scheme)
			|| scheme === AGENT_CLIENT_SCHEME;
	}
}

export interface IProjectedAgentSubscription<TState, TEnvelope> {
	readonly value: TState | Error | undefined;
	readonly verifiedValue: TState | undefined;
	readonly onDidChange: Event<TState>;
	readonly onDidError?: Event<Error>;
	readonly onWillApplyAction: Event<TEnvelope>;
	readonly onDidApplyAction: Event<TEnvelope>;
}

class ProjectedAgentSubscription<TWire, TNative, TEnvelope> implements IProjectedAgentSubscription<TNative, TEnvelope> {
	private _lastWire: TWire | undefined;
	private _lastNative: TNative | undefined;

	readonly onDidChange: Event<TNative>;
	readonly onDidError;
	readonly onWillApplyAction: Event<TEnvelope>;
	readonly onDidApplyAction: Event<TEnvelope>;

	constructor(
		private readonly source: IAgentSubscription<TWire>,
		private readonly decoder: (value: TWire) => TNative,
		envelopeDecoder: (envelope: ActionEnvelope) => TEnvelope,
	) {
		this.onDidChange = Event.map(source.onDidChange, value => this._decode(value));
		this.onDidError = source.onDidError;
		this.onWillApplyAction = Event.map(source.onWillApplyAction, envelopeDecoder);
		this.onDidApplyAction = Event.map(source.onDidApplyAction, envelopeDecoder);
	}

	get value(): TNative | Error | undefined {
		const value = this.source.value;
		if (value instanceof Error) {
			return value;
		}
		if (value === undefined) {
			return undefined;
		}
		return this._decode(value);
	}

	get verifiedValue(): TNative | undefined {
		const value = this.source.verifiedValue;
		return value === undefined ? undefined : this._decode(value);
	}

	private _decode(value: TWire): TNative {
		if (this._lastWire !== value) {
			const native = this.decoder(value);
			this._lastWire = value;
			this._lastNative = native;
		}
		return this._lastNative!;
	}
}

export function projectAgentSubscription<TWire, TNative, TEnvelope>(
	reference: IReference<IAgentSubscription<TWire>>,
	decoder: (value: TWire) => TNative,
	envelopeDecoder: (envelope: ActionEnvelope) => TEnvelope,
): IReference<IProjectedAgentSubscription<TNative, TEnvelope>> {
	return {
		object: projectAgentSubscriptionObject(reference.object, decoder, envelopeDecoder),
		dispose: () => reference.dispose(),
	};
}

export function projectAgentSubscriptionObject<TWire, TNative, TEnvelope>(
	subscription: IAgentSubscription<TWire>,
	decoder: (value: TWire) => TNative,
	envelopeDecoder: (envelope: ActionEnvelope) => TEnvelope,
): IProjectedAgentSubscription<TNative, TEnvelope> {
	return new ProjectedAgentSubscription(subscription, decoder, envelopeDecoder);
}

export class AgentHostUriProjection {
	private readonly projectedAnnotationsSubscriptions = new WeakMap<IAgentSubscription<AnnotationsState>, IProjectedAgentSubscription<NativeAnnotationsState, NativeAnnotationsActionEnvelope>>();
	private readonly context: AgentHostUriProjectionContext;

	constructor(private readonly connection: IAgentConnection) {
		this.context = new AgentHostUriProjectionContext(connection.resourceUris);
	}

	decodeInitializeResult(result: Parameters<typeof decodeInitializeResult>[0]): NativeInitializeResult {
		return decodeInitializeResult(result, this.context);
	}

	decodePlanReview(planReview: IAgentHostPlanReview): INativeAgentHostPlanReview {
		return decodeAgentHostPlanReview(planReview, this.context);
	}

	registerChannel(value: string | URI): void {
		this.context.registerChannel(value);
	}

	getAnnotationsSubscription(resource: URI, owner: string): IReference<IProjectedAgentSubscription<NativeAnnotationsState, NativeAnnotationsActionEnvelope>> {
		this.registerChannel(resource);
		const parsed = parseAnnotationsUri(resource.toString());
		if (parsed) {
			this.registerChannel(parsed.sessionUri);
		}
		const reference = this.connection.getSubscription(StateComponents.Annotations, resource, owner);
		const cached = this.projectedAnnotationsSubscriptions.get(reference.object);
		const projected = cached ?? projectAgentSubscriptionObject(
			reference.object,
			state => decodeAnnotationsState(state, this.context),
			envelope => decodeAnnotationsActionEnvelope(envelope, this.context),
		);
		if (!cached) {
			this.projectedAnnotationsSubscriptions.set(reference.object, projected);
		}
		return {
			object: projected,
			dispose: () => reference.dispose(),
		};
	}

	encodeAction(action: AgentConnectionAction): WireAgentConnectionAction {
		if (isWireClientAnnotationsAction(action)) {
			return action;
		}
		return isNativeClientAnnotationsAction(action) ? encodeClientAnnotationsAction(action, this.context) : action;
	}
}

const projections = new WeakMap<IAgentConnection, AgentHostUriProjection>();

export function getAgentHostUriProjection(connection: IAgentConnection): AgentHostUriProjection {
	let projection = projections.get(connection);
	if (!projection) {
		projection = new AgentHostUriProjection(connection);
		projections.set(connection, projection);
	}
	return projection;
}

export function createAgentHostUriProjectionContext(resourceUris: IAgentHostResourceUriMapper): IAgentHostUriProjectionPolicy {
	return new AgentHostUriProjectionContext(resourceUris);
}

export function decodeAgentHostPlanReview(planReview: IAgentHostPlanReview, context: IAgentHostUriProjectionContext): INativeAgentHostPlanReview {
	return {
		...planReview,
		planUri: planReview.planUri ? context.decodeUri(planReview.planUri) : undefined,
	};
}

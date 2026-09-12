/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from '../../../base/common/cancellation.js';
import type { Event } from '../../../base/common/event.js';
import type { URI } from '../../../base/common/uri.js';
import type { IAgentHostCanvasApprovalRequest, InitializeCanvasChatParams } from './agentHostExtensionProtocol.js';
import type { CloseCanvasParams, InvokeCanvasActionParams, InvokeCanvasActionResult, ListCanvasTypesParams, ListCanvasTypesResult, OpenCanvasParams, OpenCanvasResult, ResolveCanvasSourceParams, ResolveCanvasSourceResult, RestartCanvasProviderParams } from './state/protocol/channels-canvas/commands.js';
import type { CanvasAvailabilityState, CanvasIdentityKey, CanvasSource, CanvasSourcePresentation, CanvasState, CanvasTrustState, CanvasTypeDeclaration } from './state/protocol/channels-canvas/state.js';
import type { Icon } from './state/protocol/common/state.js';

export const CANVAS_EXTERNAL_RUNTIME_MESSAGE_ORIGIN = 'external-runtime-participant';

/** Canonical canvas commands on an authenticated, negotiated AHP connection. */
export interface IAgentCanvasConnection {
	/** Explicitly initializes this chat's live registry without requiring a canvas identity or creating a turn. */
	initializeCanvasChat(params: InitializeCanvasChatParams, token?: CancellationToken): Promise<void>;
	listCanvasTypes(params: ListCanvasTypesParams): Promise<ListCanvasTypesResult>;
	openCanvas(params: OpenCanvasParams): Promise<OpenCanvasResult>;
	resolveCanvasSource(params: ResolveCanvasSourceParams): Promise<ResolveCanvasSourceResult>;
	invokeCanvasAction(params: InvokeCanvasActionParams): Promise<InvokeCanvasActionResult>;
	restartCanvasProvider(params: RestartCanvasProviderParams): Promise<void>;
	closeCanvas(params: CloseCanvasParams): Promise<void>;
}

/** Provider-owned live state, without presentation credentials or host-assigned identity. */
export interface IAgentCanvasInstance {
	readonly identity: CanvasIdentityKey;
	/** Opaque endpoint generation inside one backing, when an individual endpoint is replaced. */
	readonly generation?: string;
	readonly title: string;
	readonly icon?: Icon;
	readonly availability: CanvasAvailabilityState;
}

/** A complete observation of one exact native backing, never the focused conversation. */
export interface IAgentCanvasSnapshot {
	readonly chat: string;
	readonly generation: string;
	readonly types: readonly CanvasTypeDeclaration[];
	readonly instances: readonly IAgentCanvasInstance[];
	/** Explicit native removals, distinct from an unavailable/missing live endpoint. */
	readonly closed?: readonly CanvasIdentityKey[];
}

export interface IAgentCanvasOperation {
	readonly clientId?: string;
	readonly initiator?: IAgentCanvasApprovalClient;
	readonly token: CancellationToken;
	readonly workingDirectories?: readonly URI[];
	/** Called immediately before each effect, including executable initialization. */
	willExecute(): void;
}

/** An authenticated transport's human-approval channel and its connection lifetime. */
export interface IAgentCanvasApprovalClient {
	readonly clientId: string;
	readonly token: CancellationToken;
	requestApproval(request: IAgentHostCanvasApprovalRequest, token: CancellationToken): Promise<boolean>;
}

/** Optional provider facet; reads never create, resume, admit, or restart a backing. */
export interface IAgentCanvases {
	/** Host sends enter synchronized turn state only when this provider observes their actual runtime turn boundary. */
	readonly defersHostTurnStart?: boolean;
	/** Native runtimes may reserve an instance ID across an entire chat; otherwise the full canonical identity is used. */
	readonly instanceIdScope?: 'chat';
	/** A real, negotiated runtime; individual source execution still requires admission. */
	readonly available: boolean;
	/** Already-started, explicitly opted-in runtime handshake; observing it never starts a runtime. */
	readonly readiness?: Promise<void>;
	readonly onDidChange: Event<IAgentCanvasSnapshot>;
	getSnapshot(chat: string): IAgentCanvasSnapshot | undefined;
	getTrust(chat: string, source: CanvasSource): CanvasTrustState;
	/** Resolves only after the exact backing's initial registry is observable. */
	initializeChat(chat: string, operation: IAgentCanvasOperation): Promise<void>;
	/** Explicitly effectful canvas-first initialization, only from an open/restart request. */
	prepare?(identity: CanvasIdentityKey, operation: IAgentCanvasOperation): Promise<void>;
	open(params: OpenCanvasParams, operation: IAgentCanvasOperation): Promise<IAgentCanvasInstance>;
	invoke(state: CanvasState, params: InvokeCanvasActionParams, operation: IAgentCanvasOperation): Promise<unknown>;
	close(state: CanvasState, operation: IAgentCanvasOperation): Promise<void>;
	restart(state: CanvasState, operation: IAgentCanvasOperation): Promise<void>;
	/** Authorizes this client on every pull and returns only an already-live endpoint. */
	resolve(state: CanvasState, clientId: string, token: CancellationToken): Promise<CanvasSourcePresentation | undefined>;
	/** Resolves only provider-owned schema references; no network or filesystem fallback. */
	resolveSchema?(chat: string, source: CanvasSource, reference: string): Promise<unknown>;
	/** Validates input against the current runtime declaration, including referenced schemas. */
	validateInput(chat: string, source: CanvasSource, schema: object, input: unknown): Promise<void>;
}

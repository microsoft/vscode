/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import type { IAgentCreateSessionConfig, IAgentSessionMetadata } from './agentService.js';
import type { IActionEnvelope, INotification, ISessionAction } from './state/sessionActions.js';
import type { IStateSnapshot } from './state/sessionProtocol.js';

/** Configuration key for the list of remote agent host addresses. */
export const RemoteAgentHostsSettingId = 'chat.remoteAgentHosts';

/** An entry in the {@link RemoteAgentHostsSettingId} setting. */
export interface IRemoteAgentHostEntry {
	readonly address: string;
	readonly name: string;
}

export const IRemoteAgentHostService = createDecorator<IRemoteAgentHostService>('remoteAgentHostService');

/**
 * Manages connections to one or more remote agent host processes over
 * WebSocket. Each connection is identified by its address string.
 *
 * Provides a unified event stream for actions and notifications across
 * all connected remotes, and exposes per-connection subscribe/dispatch/
 * command methods.
 */
export interface IRemoteAgentHostService {
	readonly _serviceBrand: undefined;

	/** Fires when a connection's action stream delivers an envelope (any connection). */
	readonly onDidAction: Event<IRemoteActionEnvelope>;

	/** Fires when a connection broadcasts a notification (any connection). */
	readonly onDidNotification: Event<IRemoteNotification>;

	/** Fires when a remote connection is established or lost. */
	readonly onDidChangeConnections: Event<void>;

	/** Currently connected remote addresses. */
	readonly connections: readonly IRemoteAgentHostConnection[];

	/** Get a client ID for a given address (used for write-ahead reconciliation). */
	getClientId(address: string): string | undefined;

	/** Subscribe to state at a URI on a specific remote. */
	subscribe(address: string, resource: URI): Promise<IStateSnapshot>;

	/** Unsubscribe from state on a specific remote. */
	unsubscribe(address: string, resource: URI): void;

	/** Push a GitHub auth token to a specific remote. */
	setAuthToken(address: string, token: string): void;

	/** Dispatch an action to a specific remote. */
	dispatchAction(address: string, action: ISessionAction, clientId: string, clientSeq: number): void;

	/** Create a session on a specific remote. */
	createSession(address: string, config?: IAgentCreateSessionConfig): Promise<URI>;

	/** Dispose a session on a specific remote. */
	disposeSession(address: string, session: URI): void;

	/** List sessions on a specific remote. */
	listSessions(address: string): Promise<readonly IAgentSessionMetadata[]>;
}

/** An action envelope tagged with the originating remote address. */
export interface IRemoteActionEnvelope extends IActionEnvelope {
	readonly remoteAddress: string;
}

/** A notification tagged with the originating remote address. */
export interface IRemoteNotification {
	readonly remoteAddress: string;
	readonly notification: INotification;
}

/** Metadata about a single remote connection. */
export interface IRemoteAgentHostConnection {
	readonly address: string;
	readonly name: string;
	readonly clientId: string;
}

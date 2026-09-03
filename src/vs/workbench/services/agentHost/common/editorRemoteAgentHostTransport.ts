/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { isEqualAuthority } from '../../../../base/common/resources.js';
import { hasKey } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { createURITransformer } from '../../../../base/common/uriTransformer.js';
import { ActionType, type StateAction } from '../../../../platform/agentHost/common/state/protocol/actions.js';
import type { ProjectInfo, Snapshot } from '../../../../platform/agentHost/common/state/protocol/state.js';
import { isJsonRpcNotification, isJsonRpcRequest, isJsonRpcResponse, ReconnectResultType, type CommandMap, type ProtocolMessage } from '../../../../platform/agentHost/common/state/sessionProtocol.js';
import { readSessionFolderPickerDecision, withSessionFolderPickerDecision } from '../../../../platform/agentHost/common/state/sessionState.js';
import type { IClientTransport } from '../../../../platform/agentHost/common/state/sessionTransport.js';

/** A directory URI in the agent host's own namespace, as it appears on the wire. */
type HostDirectoryUri = string & { readonly __hostDirectoryUri: unique symbol };

/** A directory URI in the workbench's namespace, matching the window's workspace folders. */
type ClientDirectoryUri = string & { readonly __clientDirectoryUri: unique symbol };

/** Converts one directory URI into the namespace named by `T`. */
type DirectoryMap<T extends HostDirectoryUri | ClientDirectoryUri> = (uri: string) => T;

/** Protocol payload carrying the directory identities this transport maps. */
interface IDirectoryBearingPayload {
	workingDirectories?: string[];
	project?: ProjectInfo;
	_meta?: Record<string, unknown>;
}

/** Maps directory identities at the editor's remote connection, leaving opaque protocol content untouched. */
export class EditorRemoteAgentHostTransport extends Disposable implements IClientTransport {

	private readonly _requests = new Map<number, string>();
	private readonly _uriTransformer;

	/** The two mapping directions, reached only through the direction-named wrappers below. */
	private readonly _toHostMap: DirectoryMap<HostDirectoryUri> = value => this._toHostDirectory(value);
	private readonly _toClientMap: DirectoryMap<ClientDirectoryUri> = value => this._fromHostDirectory(value);

	private readonly _onMessage = this._register(new Emitter<ProtocolMessage>());
	readonly onMessage = this._onMessage.event;
	readonly onClose: Event<void>;

	/** Preserves the underlying connection's client-route classification. */
	get clientConnectionKind() { return this._transport.clientConnectionKind; }

	/** Reports the physical transport wrapped by this URI-mapping adapter. */
	get transportKind() { return this._transport.transportKind; }

	/** Owns the underlying transport and translates incoming messages before exposing them to the protocol client. */
	constructor(
		private readonly _transport: IClientTransport,
		private readonly _remoteAuthority: string,
	) {
		super();
		this._register(_transport);
		this._uriTransformer = createURITransformer(_remoteAuthority);
		this._register(_transport.onMessage(message => this._onMessage.fire(this._fromHost(message))));
		this.onClose = _transport.onClose;
		this._register(this.onClose(() => this._requests.clear()));
	}

	/** Opens the underlying connection; this adapter does not establish a separate connection. */
	connect(): Promise<void> {
		return this._transport.connect();
	}

	/**
	 * Maps outgoing working directories to host-local URIs before forwarding the message.
	 * Records request methods when their responses may contain directories that need reverse mapping.
	 */
	send(message: ProtocolMessage): void {
		if (isJsonRpcRequest(message)) {
			switch (message.method) {
				case 'initialize':
				case 'reconnect':
				case 'subscribe':
				case 'listSessions':
					this._requests.set(message.id, message.method);
					break;
				case 'createSession':
					message = { ...message, params: this._mapDirectoriesToHost(message.params) };
					break;
				case 'createChat':
					message = { ...message, params: this._mapDirectoriesToHost(message.params) };
					break;
				case 'resolveSessionConfig':
					if (message.params.workingDirectory) {
						message = { ...message, params: { ...message.params, workingDirectory: this._toHostDirectory(message.params.workingDirectory) } };
					}
					break;
				case 'sessionConfigCompletions':
					if (message.params.workingDirectory) {
						message = { ...message, params: { ...message.params, workingDirectory: this._toHostDirectory(message.params.workingDirectory) } };
					}
					break;
				case 'createTerminal':
					if (message.params.cwd) {
						message = { ...message, params: { ...message.params, cwd: this._toHostDirectory(message.params.cwd) } };
					}
					break;
			}
		} else if (isJsonRpcNotification(message) && message.method === 'dispatchAction') {
			message = { ...message, params: { ...message.params, action: this._mapActionToHost(message.params.action) } };
		}
		this._transport.send(message);
	}

	/** Converts a directory on the connected remote authority to a file URI, leaving other resources unchanged. */
	private _toHostDirectory(value: string): HostDirectoryUri {
		const uri = URI.parse(value);
		return (uri.scheme === Schemas.vscodeRemote && isEqualAuthority(uri.authority, this._remoteAuthority)
			? URI.revive(this._uriTransformer.transformIncoming(uri)).toString()
			: value) as HostDirectoryUri;
	}

	/** Converts a host-local file URI to the workbench's remote URI so it matches the corresponding workspace folder. */
	private _fromHostDirectory(value: string): ClientDirectoryUri {
		const uri = URI.parse(value);
		return (uri.scheme === Schemas.file
			? URI.revive(this._uriTransformer.transformOutgoing(uri)).toString()
			: value) as ClientDirectoryUri;
	}

	/** Copies a payload with its directory identities mapped into the host's namespace. */
	private _mapDirectoriesToHost<T extends IDirectoryBearingPayload>(value: T): T {
		return this._mapDirectoriesWith(value, this._toHostMap);
	}

	/** Copies a payload with its directory identities mapped into the workbench's namespace. */
	private _mapDirectoriesToClient<T extends IDirectoryBearingPayload>(value: T): T {
		return this._mapDirectoriesWith(value, this._toClientMap);
	}

	/** Maps a directory-bearing action into the host's namespace. */
	private _mapActionToHost(action: StateAction): StateAction {
		return this._mapActionWith(action, this._toHostMap);
	}

	/** Maps a directory-bearing action into the workbench's namespace. */
	private _mapActionToClient(action: StateAction): StateAction {
		return this._mapActionWith(action, this._toClientMap);
	}

	/**
	 * Shared payload mapper for both directions, reached only through the direction-named wrappers above.
	 * The direction is a parameter here alone, so no call site can supply the wrong one.
	 */
	private _mapDirectoriesWith<T extends IDirectoryBearingPayload>(value: T, map: DirectoryMap<HostDirectoryUri | ClientDirectoryUri>): T {
		const decision = readSessionFolderPickerDecision(value._meta);
		return {
			...value,
			...(value.workingDirectories ? { workingDirectories: value.workingDirectories.map(map) } : {}),
			...(value.project ? { project: { ...value.project, uri: map(value.project.uri) } } : {}),
			...(decision?.primary ? { _meta: withSessionFolderPickerDecision(value._meta, { ...decision, primary: map(decision.primary) }) } : {}),
		};
	}

	/** Shared action mapper for both directions, reached only through the direction-named wrappers. */
	private _mapActionWith(action: StateAction, map: DirectoryMap<HostDirectoryUri | ClientDirectoryUri>): StateAction {
		switch (action.type) {
			case ActionType.SessionWorkingDirectorySet:
			case ActionType.SessionWorkingDirectoryRemoved:
			case ActionType.ChatWorkingDirectorySet:
			case ActionType.ChatWorkingDirectoryRemoved:
				return { ...action, directory: map(action.directory) };
			case ActionType.SessionWorkingDirectoryReplaced:
				return { ...action, directory: map(action.directory), replacement: map(action.replacement) };
			case ActionType.SessionChatAdded:
				return { ...action, summary: this._mapDirectoriesWith(action.summary, map) };
			case ActionType.SessionChatUpdated:
				return { ...action, changes: this._mapDirectoriesWith(action.changes, map) };
			case ActionType.SessionMetaChanged:
				return this._mapDirectoriesWith(action, map);
			default:
				return action;
		}
	}

	/** Restores workbench directory identities in session and chat snapshots, including nested chat summaries. */
	private _mapSnapshot(snapshot: Snapshot): Snapshot {
		const state = snapshot.state;
		if (hasKey(state, { chats: true })) {
			return { ...snapshot, state: { ...this._mapDirectoriesToClient(state), chats: state.chats.map(chat => this._mapDirectoriesToClient(chat)) } };
		}
		if (hasKey(state, { workingDirectories: true })) {
			return { ...snapshot, state: this._mapDirectoriesToClient(state) };
		}
		return snapshot;
	}

	/**
	 * Maps directories in host notifications and response payloads back to workbench URIs.
	 * Correlates responses with recorded request methods because JSON-RPC responses contain only the request ID.
	 */
	private _fromHost(message: ProtocolMessage): ProtocolMessage {
		if (isJsonRpcNotification(message)) {
			switch (message.method) {
				case 'action':
					return { ...message, params: { ...message.params, action: this._mapActionToClient(message.params.action) } };
				case 'root/sessionAdded':
					return { ...message, params: { ...message.params, summary: this._mapDirectoriesToClient(message.params.summary) } };
				case 'root/sessionSummaryChanged':
					return { ...message, params: { ...message.params, changes: this._mapDirectoriesToClient(message.params.changes) } };
			}
		} else if (isJsonRpcResponse(message)) {
			const method = this._requests.get(message.id);
			this._requests.delete(message.id);
			if (hasKey(message, { result: true })) {
				switch (method) {
					case 'initialize': {
						const result = message.result as CommandMap['initialize']['result'];
						return { ...message, result: { ...result, snapshots: result.snapshots.map(snapshot => this._mapSnapshot(snapshot)) } };
					}
					case 'subscribe': {
						const result = message.result as CommandMap['subscribe']['result'];
						return result.snapshot ? { ...message, result: { ...result, snapshot: this._mapSnapshot(result.snapshot) } } : message;
					}
					case 'reconnect': {
						const result = message.result as CommandMap['reconnect']['result'];
						return result.type === ReconnectResultType.Snapshot
							? { ...message, result: { ...result, snapshots: result.snapshots.map(snapshot => this._mapSnapshot(snapshot)) } }
							: { ...message, result: { ...result, actions: result.actions.map(envelope => ({ ...envelope, action: this._mapActionToClient(envelope.action) })) } };
					}
					case 'listSessions': {
						const result = message.result as CommandMap['listSessions']['result'];
						return { ...message, result: { ...result, items: result.items.map(item => this._mapDirectoriesToClient(item)) } };
					}
				}
			}
		}
		return message;
	}

	/** Clears response-correlation state and disposes the owned transport and event listeners. */
	override dispose(): void {
		this._requests.clear();
		super.dispose();
	}
}

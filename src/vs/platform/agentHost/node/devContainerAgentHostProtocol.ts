/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationError } from '../../../base/common/errors.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import { isAbsolute } from '../../../base/common/path.js';
import { OperatingSystem, OS } from '../../../base/common/platform.js';
import { URI, uriToFsPath } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import type { IValidator } from '../../../base/common/validation.js';
import { ILogService } from '../../log/common/log.js';
import { DevContainerCloseConnectionNotification, DevContainerConnectExtensionMethod, devContainerConnectParamsValidator, devContainerConnectionParamsValidator, DevContainerDisconnectExtensionMethod, DevContainerIsDockerAvailableExtensionMethod, DevContainerOutputNotification, DevContainerRelayCloseNotification, DevContainerRelayMessageNotification, devContainerRelayMessageValidator, DevContainerRelaySendExtensionMethod, type IAgentHostExtensionNotificationMap } from '../common/agentHostExtensionProtocol.js';
import { IDevContainerAgentHostMainService, type IDevContainerAgentHostConfig, type IDevContainerAgentHostConnectResult } from '../common/devContainerAgentHost.js';
import { AhpErrorCodes, JsonRpcErrorCodes, ProtocolError } from '../common/state/sessionProtocol.js';

interface IConnection {
	readonly id: string;
	readonly clientId: string;
	started: boolean;
}

/** Converts a remote URI path using the host's OS, preserving POSIX paths that resemble drive letters. */
export function normalizeDevContainerWorkspaceFolder(workspaceFolder: string, os: OperatingSystem): string {
	if (os !== OperatingSystem.Windows) {
		return workspaceFolder;
	}
	const path = workspaceFolder.startsWith('/') && !workspaceFolder.startsWith('//')
		? uriToFsPath(URI.from({ scheme: Schemas.file, path: workspaceFolder }), true)
		: workspaceFolder;
	return path.replace(/\//g, '\\');
}

/** Owns one transport's container launches; wire IDs never reach the shared launcher. */
export class DevContainerAgentHostProtocol extends Disposable {
	private readonly _connections = new Map<string, IConnection>();
	private readonly _connectionsById = new Map<string, IConnection>();
	private _disposed = false;

	constructor(
		private readonly _requestTrust: (workspace: string) => Promise<boolean>,
		private readonly _notify: <M extends keyof IAgentHostExtensionNotificationMap>(method: M, params: IAgentHostExtensionNotificationMap[M]) => void,
		@IDevContainerAgentHostMainService private readonly _service: IDevContainerAgentHostMainService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register(_service.onDidRelayMessage(event => this._forward(DevContainerRelayMessageNotification, event)));
		this._register(_service.onDidOutput(event => this._forward(DevContainerOutputNotification, event)));
		this._register(_service.onDidRelayClose(id => this._forward(DevContainerRelayCloseNotification, { connectionId: id })));
		this._register(_service.onDidCloseConnection(id => {
			this._forward(DevContainerCloseConnectionNotification, { connectionId: id });
			const connection = this._connectionsById.get(id);
			if (connection) {
				this._release(connection);
			}
		}));
	}

	handleRequest(method: string, params: unknown): Promise<unknown> | undefined {
		switch (method) {
			case DevContainerIsDockerAvailableExtensionMethod:
			case DevContainerConnectExtensionMethod:
			case DevContainerDisconnectExtensionMethod:
			case DevContainerRelaySendExtensionMethod:
				return this._handleRequest(method, params);
			default:
				return undefined;
		}
	}

	private async _handleRequest(method: string, params: unknown): Promise<unknown> {
		if (this._disposed) {
			throw new CancellationError();
		}
		switch (method) {
			case DevContainerIsDockerAvailableExtensionMethod:
				if (params !== undefined && params !== null) {
					throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'isDockerAvailable does not accept params');
				}
				return this._service.isDockerAvailable();
			case DevContainerConnectExtensionMethod: {
				const config = this._validate(devContainerConnectParamsValidator, params);
				const workspaceFolder = normalizeDevContainerWorkspaceFolder(config.workspaceFolder, OS);
				if (!isAbsolute(workspaceFolder) || workspaceFolder.includes('\0') || !config.name.trim() || config.name.includes('\0')) {
					throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'workspaceFolder must be an absolute host path and name must be non-empty');
				}
				return this._connect({ ...config, workspaceFolder });
			}
			case DevContainerDisconnectExtensionMethod: {
				const { connectionId } = this._validate(devContainerConnectionParamsValidator, params);
				const connection = this._getConnection(connectionId);
				this._release(connection);
				await this._service.disconnect(connection.id);
				return;
			}
			case DevContainerRelaySendExtensionMethod: {
				const { connectionId, data } = this._validate(devContainerRelayMessageValidator, params);
				const connection = this._getConnection(connectionId);
				if (!connection.started) {
					throw new ProtocolError(AhpErrorCodes.NotFound, 'Dev Container relay is not connected');
				}
				await this._service.relaySend(connection.id, data);
				return;
			}
			default:
				throw new ProtocolError(JsonRpcErrorCodes.MethodNotFound, `Method not found: ${method}`);
		}
	}

	private _validate<T extends { connectionId: string }>(validator: IValidator<T>, params: unknown): T {
		const result = validator.validate(params);
		if (result.error) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, result.error.message);
		}
		if (!result.content.connectionId.trim() || result.content.connectionId.length > 256 || result.content.connectionId.includes('\0')) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'connectionId must be a non-empty identifier');
		}
		return result.content;
	}

	private _getConnection(id: string): IConnection {
		const connection = this._connections.get(id);
		if (!connection) {
			throw new ProtocolError(AhpErrorCodes.NotFound, 'Dev Container connection is not owned by this client');
		}
		return connection;
	}

	private async _connect(config: IDevContainerAgentHostConfig): Promise<IDevContainerAgentHostConnectResult> {
		if (this._connections.has(config.connectionId)) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Dev Container connectionId is already in use');
		}
		const connection: IConnection = { id: generateUuid(), clientId: config.connectionId, started: false };
		this._connections.set(connection.clientId, connection);
		this._connectionsById.set(connection.id, connection);
		try {
			if (!await this._requestTrust(config.workspaceFolder)) {
				throw new ProtocolError(AhpErrorCodes.PermissionDenied, 'Workspace trust is required to start a Dev Container');
			}
			this._checkCurrent(connection);
			connection.started = true;
			const result = await this._service.connect({ ...config, connectionId: connection.id });
			this._checkCurrent(connection);
			return { ...result, connectionId: connection.clientId };
		} catch (error) {
			this._release(connection);
			if (connection.started) {
				await this._disconnect(connection.id);
			}
			throw error;
		}
	}

	private _checkCurrent(connection: IConnection): void {
		if (this._disposed || this._connections.get(connection.clientId) !== connection) {
			throw new CancellationError();
		}
	}

	private _release(connection: IConnection): void {
		if (this._connections.get(connection.clientId) === connection) {
			this._connections.delete(connection.clientId);
		}
		this._connectionsById.delete(connection.id);
	}

	private _forward<M extends keyof IAgentHostExtensionNotificationMap>(method: M, event: IAgentHostExtensionNotificationMap[M]): void {
		const connection = this._connectionsById.get(event.connectionId);
		if (connection && !this._disposed) {
			this._notify(method, { ...event, connectionId: connection.clientId });
		}
	}

	private async _disconnect(id: string): Promise<void> {
		try {
			await this._service.disconnect(id);
		} catch (error) {
			this._logService.error('[DevContainerAgentHostProtocol] Disconnect failed', error);
		}
	}

	override dispose(): void {
		this._disposed = true;
		for (const connection of this._connections.values()) {
			if (connection.started) {
				void this._disconnect(connection.id);
			}
		}
		this._connections.clear();
		this._connectionsById.clear();
		super.dispose();
	}
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';

export type ConnectorConnectionStatus = 'not_connected' | 'pending' | 'connected' | 'error';

export interface IConnectorAuthorPresentation {
	readonly name?: string;
	readonly email?: string;
	readonly url?: string;
}

export interface IConnectorMcpServerPresentation {
	readonly name: string;
	readonly type: string;
	readonly url?: string;
}

export interface IConnectorPresentation {
	readonly id: string;
	readonly displayName: string;
	readonly description: string;
	readonly homepage?: string;
	readonly version?: string;
	readonly author?: IConnectorAuthorPresentation;
	readonly repository?: string;
	readonly license?: string;
	readonly keywords?: readonly string[];
	readonly logo?: string;
	readonly tier?: string;
	readonly releaseTag?: string;
	readonly capabilities?: readonly string[];
	readonly isExportSupported?: boolean;
	readonly protectedResourceMetadataUrl?: string;
	readonly scopes?: readonly string[];
	readonly agents?: readonly string[];
	readonly commands?: readonly string[];
	readonly skills?: readonly string[];
	readonly mcpServers?: readonly IConnectorMcpServerPresentation[];
	readonly connectionStatus: ConnectorConnectionStatus;
	readonly connectionErrorMessage?: string;
}

export interface IConnectorsSnapshot {
	readonly available: boolean;
	readonly connectors: readonly IConnectorPresentation[];
}

export const IConnectorsManagementService = createDecorator<IConnectorsManagementService>('connectorsManagementService');

export interface IConnectorsManagementService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeConnectors: Event<void>;

	getConnectors(): Promise<IConnectorsSnapshot>;
	connect(connectorId: string): Promise<void>;
	refresh(connectorId?: string): Promise<void>;
	disconnect(connectorId: string): Promise<void>;
}

class NullConnectorsManagementService implements IConnectorsManagementService {
	declare readonly _serviceBrand: undefined;
	readonly onDidChangeConnectors = Event.None;

	getConnectors(): Promise<IConnectorsSnapshot> {
		return Promise.resolve({ available: false, connectors: [] });
	}

	connect(_connectorId: string): Promise<void> {
		return Promise.reject(new Error('Connector management is not available'));
	}

	refresh(_connectorId?: string): Promise<void> {
		return Promise.resolve();
	}

	disconnect(_connectorId: string): Promise<void> {
		return Promise.reject(new Error('Connector management is not available'));
	}
}

registerSingleton(IConnectorsManagementService, NullConnectorsManagementService, InstantiationType.Delayed);

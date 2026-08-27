/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../base/common/cancellation.js';
import { IDisposable } from '../../base/common/lifecycle.js';
import { URI } from '../../base/common/uri.js';
import { IAgentConnection } from '../../platform/agentHost/common/agentService.js';
import { createDecorator } from '../../platform/instantiation/common/instantiation.js';

/** Hidden setting that enables Dev Container Agent Host sessions. */
export const DevContainerAgentHostEnabledSettingId = 'chat.agentHost.devContainer.enabled';

/** Connected Agent Host and workspace mapping produced by a Dev Container connector. */
export interface IDevContainerAgentHostConnection {
	/**
	 * Stable address that uniquely identifies this source workspace's running
	 * container while the connection is active.
	 */
	readonly address: string;
	readonly name: string;
	readonly connection: IAgentConnection & IDisposable;
	readonly transportDisposable?: IDisposable;
	readonly workspaceUri: URI;
	readonly defaultDirectory?: string;
}

/** Creates a Dev Container and connects to its Agent Host. */
export interface IDevContainerAgentHostConnector {
	/** Whether the workspace has a supported configuration and Docker is available. */
	isAvailable(workspaceUri: URI): Promise<boolean>;
	connect(workspaceUri: URI, token: CancellationToken): Promise<IDevContainerAgentHostConnection>;
}

/** Sessions provider and workspace selected after connecting a Dev Container. */
export interface IDevContainerAgentHostTarget {
	readonly providerId: string;
	readonly workspaceUri: URI;
	/** Release this caller's ownership of the shared workspace connection. */
	release(): Promise<void>;
}

export const IDevContainerAgentHostService = createDecorator<IDevContainerAgentHostService>('devContainerAgentHostService');

/** Coordinates Dev Container connectors with dynamic remote Sessions providers. */
export interface IDevContainerAgentHostService {
	readonly _serviceBrand: undefined;

	registerConnector(connector: IDevContainerAgentHostConnector): IDisposable;
	/** Whether the registered connector can launch this workspace. */
	isAvailable(workspaceUri: URI): Promise<boolean>;
	connect(workspaceUri: URI, token: CancellationToken): Promise<IDevContainerAgentHostTarget>;
	disconnect(workspaceUri: URI): Promise<void>;
}

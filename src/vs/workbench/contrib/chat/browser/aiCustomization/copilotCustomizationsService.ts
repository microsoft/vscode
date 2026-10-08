/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import type { IAgentCanvasInfo, IAgentConnection, IAgentExtensionInventory } from '../../../../../platform/agentHost/common/agentService.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';

export const ICopilotCustomizationsService = createDecorator<ICopilotCustomizationsService>('copilotCustomizationsService');

export interface ICopilotCustomizationsService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	listExtensions(sessionResource: URI, token: CancellationToken): Promise<IAgentExtensionInventory>;
	setExtensionEnabled(sessionResource: URI, extensionId: string, enabled: boolean): Promise<void>;
	listCanvases(sessionResource: URI, token: CancellationToken): Promise<readonly IAgentCanvasInfo[]>;
	refreshCanvases(sessionResource: URI, token: CancellationToken): Promise<readonly IAgentCanvasInfo[]>;
}

export class CopilotCustomizationsService extends Disposable implements ICopilotCustomizationsService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	constructor(
		@IAgentHostConnectionsService private readonly connectionsService: IAgentHostConnectionsService,
	) {
		super();
	}

	async listExtensions(sessionResource: URI, token: CancellationToken): Promise<IAgentExtensionInventory> {
		const { connection } = this.resolveConnection(sessionResource);
		if (!connection.listAgentExtensions) {
			throw new Error('This Agent Host does not support Copilot extension inventory.');
		}
		return raceCancellationError(connection.listAgentExtensions(), token);
	}

	async setExtensionEnabled(sessionResource: URI, extensionId: string, enabled: boolean): Promise<void> {
		const { connection, session } = this.resolveConnection(sessionResource);
		if (!connection.setAgentExtensionEnabled) {
			throw new Error('This Agent Host does not support Copilot extension management.');
		}
		try {
			await connection.setAgentExtensionEnabled(extensionId, enabled, session);
		} finally {
			this._onDidChange.fire();
		}
	}

	async listCanvases(sessionResource: URI, token: CancellationToken): Promise<readonly IAgentCanvasInfo[]> {
		const { connection, session } = this.resolveConnection(sessionResource, true);
		if (!connection.listSessionCanvases || !session) {
			throw new Error('This Agent Host does not support Copilot canvas inventory.');
		}
		return raceCancellationError(connection.listSessionCanvases(session), token);
	}

	async refreshCanvases(sessionResource: URI, token: CancellationToken): Promise<readonly IAgentCanvasInfo[]> {
		const { connection, session } = this.resolveConnection(sessionResource, true);
		if (!connection.refreshSessionCanvases || !session) {
			throw new Error('This Agent Host does not support refreshing Copilot canvases.');
		}
		return raceCancellationError(connection.refreshSessionCanvases(session), token);
	}

	private resolveConnection(sessionResource: URI, requireSession = false): { readonly connection: IAgentConnection; readonly session?: URI } {
		const resolved = this.connectionsService.resolveSessionResource(sessionResource);
		if (resolved) {
			return { connection: resolved.connection, session: resolved.backendSession };
		}

		const identity = this.connectionsService.resolveSessionResourceIdentity(sessionResource);
		const connection = identity
			? this.connectionsService.getConnectionByAuthority(identity.connectionAuthority)
			: requireSession ? undefined : this.connectionsService.ambientConnection;
		if (!connection) {
			throw new Error('The Agent Host for this customization target is not connected.');
		}
		return { connection, session: identity?.backendSession };
	}
}

registerSingleton(ICopilotCustomizationsService, CopilotCustomizationsService, InstantiationType.Delayed);

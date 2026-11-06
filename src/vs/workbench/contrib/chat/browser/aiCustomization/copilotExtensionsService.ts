/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { URI } from '../../../../../base/common/uri.js';
import type { IAgentConnection, IAgentExtensionInventory } from '../../../../../platform/agentHost/common/agentService.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IAgentHostCustomizationService } from '../agentSessions/agentHost/agentHostCustomizationService.js';

export const ICopilotExtensionsService = createDecorator<ICopilotExtensionsService>('copilotExtensionsService');

export interface ICopilotExtensionsService {
	readonly _serviceBrand: undefined;
	listExtensions(sessionResource: URI, token: CancellationToken): Promise<IAgentExtensionInventory>;
	setExtensionEnabled(sessionResource: URI, extensionId: string, enabled: boolean): Promise<void>;
}

export class CopilotExtensionsService implements ICopilotExtensionsService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IAgentHostConnectionsService private readonly connectionsService: IAgentHostConnectionsService,
		@IAgentHostCustomizationService private readonly customizationService: IAgentHostCustomizationService,
	) { }

	async listExtensions(sessionResource: URI, token: CancellationToken): Promise<IAgentExtensionInventory> {
		const { connection, session } = this.resolveConnection(sessionResource);
		if (!connection.listAgentExtensions) {
			throw new Error('This Agent Host does not support Copilot extension inventory.');
		}
		return raceCancellationError(connection.listAgentExtensions(session, this.customizationService.getBackendChatResource?.(sessionResource)), token);
	}

	async setExtensionEnabled(sessionResource: URI, extensionId: string, enabled: boolean): Promise<void> {
		const { connection, session } = this.resolveConnection(sessionResource);
		if (!connection.setAgentExtensionEnabled) {
			throw new Error('This Agent Host does not support Copilot extension management.');
		}
		await connection.setAgentExtensionEnabled(extensionId, enabled, session, this.customizationService.getBackendChatResource?.(sessionResource));
	}

	private resolveConnection(sessionResource: URI): { readonly connection: IAgentConnection; readonly session?: URI } {
		const resolved = this.connectionsService.resolveSessionResource(sessionResource);
		if (resolved) {
			return { connection: resolved.connection, session: resolved.backendSession };
		}

		const identity = this.connectionsService.resolveSessionResourceIdentity(sessionResource);
		const connection = identity
			? this.connectionsService.getConnectionByAuthority(identity.connectionAuthority)
			: this.connectionsService.ambientConnection;
		if (!connection) {
			throw new Error('The Agent Host for this customization target is not connected.');
		}
		return { connection, session: identity?.backendSession };
	}
}

registerSingleton(ICopilotExtensionsService, CopilotExtensionsService, InstantiationType.Delayed);

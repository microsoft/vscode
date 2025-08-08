/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { URI } from '../../../../base/common/uri.js';

export interface AgentTargetDescriptor {
	providerId: 'github' | 'azurerepos';
	owner: string;
	repo: string;
	ref?: string;
	path?: string;
}

export const IAgentResourceResolver = createDecorator<IAgentResourceResolver>('agentResourceResolver');

export interface IAgentResourceResolver {
	_serviceBrand: undefined;
	resolve(candidate: URI | AgentTargetDescriptor): Promise<URI>;
}

export class AgentResourceResolver implements IAgentResourceResolver {
	_serviceBrand: undefined;
	
	constructor(@ICommandService private readonly commandService: ICommandService) {}

	async resolve(candidate: URI | AgentTargetDescriptor): Promise<URI> {
		// Pass-through for URIs we already know how to handle
		if (URI.isUri(candidate)) {
			if (candidate.scheme === 'file' || candidate.scheme === 'vscode-vfs') {
				return candidate;
			}
			// For other schemes (e.g., https), we only resolve when explicitly supported in the future
			return candidate;
		}

		// Candidate is a descriptor; try RemoteHub
		try {
			const uri = await this.commandService.executeCommand<URI>('remoteHub.createAgentVirtualUri', candidate);
			return uri ?? (candidate as any);
		} catch {
			// If RemoteHub isn't available, return a passthrough (caller can decide)
			return candidate as any;
		}
	}
}
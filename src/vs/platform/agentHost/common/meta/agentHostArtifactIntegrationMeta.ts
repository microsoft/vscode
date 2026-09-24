/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { InitializeResult } from '../state/protocol/common/commands.js';
import type { Message } from '../state/sessionState.js';

export const AgentHostArtifactIntegrationsCapabilityMetaKey = 'vscode.artifactIntegrations';
export const AgentHostArtifactRunMetaKey = 'vscode.artifactIntegrationRun';

export function getAgentHostArtifactIntegrationsCapability(result: InitializeResult | undefined): 'pending' | 'supported' | 'unsupported' {
	if (!result) {
		return 'pending';
	}
	const version = result._meta?.[AgentHostArtifactIntegrationsCapabilityMetaKey];
	return version === 1 ? 'supported' : version === undefined ? 'unsupported' : 'pending';
}

export function readArtifactIntegrationRun(message: Message): string | undefined {
	const value = message._meta?.[AgentHostArtifactRunMetaKey];
	return typeof value === 'string' && value.length > 0 ? value : undefined;
}
